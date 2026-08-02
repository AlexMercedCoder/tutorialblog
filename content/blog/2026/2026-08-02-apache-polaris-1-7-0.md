---
title: "Apache Polaris 1.7.0 and the Quiet Work of Making a Catalog Trustworthy"
date: "2026-08-02"
description: "Apache Polaris 1.7.0 deep dive: idempotent writes, semantic models, stricter credential vending, orphan cleanup, and what the upgrade asks of you."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Polaris
  - Apache Iceberg
  - Catalog
  - Data Engineering
  - Open Source
canonical: "https://iceberglakehouse.com/posts/apache-polaris-1-7-0/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/apache-polaris-1-7-0/).

# Apache Polaris 1.7.0 and the Quiet Work of Making a Catalog Trustworthy

A Spark job commits a table update. The catalog writes the change to Postgres. Then the network drops between the catalog and the client, and the client never sees the response. The client does the sensible thing and retries. This time the catalog sees that the table has already moved past the base snapshot in the request, so it returns 409 Conflict. The client reads that 409 as a failed commit and deletes the metadata files it just wrote. The commit is now recorded in the catalog, and the files it points at are gone.

That is data loss. It comes from a network blip, not from a bug in anyone's query engine.

Apache Polaris 1.7.0 shipped on August 2, 2026, tagged by JB Onofré at commit `4ac2f05`. It fixes that specific failure and a long list of others in the same family. If you skim the changelog you see hundreds of entries, most of them dependency bumps, and it looks like a maintenance release. It is not. Underneath the noise there are four real stories: idempotent writes, a new beta API for semantic models, a much stricter approach to credential vending and location validation, and a serious pass over orphan file cleanup.

I am going to walk through all four, and I am also going to tell you which parts of this release create work for you rather than saving you work. Both kinds show up here.

This piece assumes you know what a table is and roughly what a data lake is. Everything past that gets defined as it comes up.

## What a catalog actually does, and why its bugs are expensive

Apache Iceberg is a table format. It describes how to lay out data files and metadata files in object storage so that many engines read the same table the same way. Iceberg tracks a table's current state through a chain of files: a metadata file points at snapshots, snapshots point at manifest lists, manifest lists point at manifests, and manifests point at the actual Parquet data files.

One question that chain does not answer is: which metadata file is current right now? Every change to a table writes a brand new metadata file. Something has to record the swap from the old one to the new one, and it has to do that atomically so two writers cannot both think they won.

That something is the catalog. In its smallest form, a catalog is a pointer store. It maps a table name to the path of the current metadata file, and it swaps that pointer atomically on commit.

Apache Polaris is an open source implementation of that pointer store, speaking the Iceberg REST protocol. The REST protocol matters because it moves catalog logic out of the client. With older designs like Hive Metastore, every engine embedded its own catalog client code, and every engine had its own opinions about credentials and connection handling. With a REST catalog, the engine speaks HTTP to a service, and the service handles storage credentials, access control, and the commit protocol. Polaris was co-created with Snowflake, donated to the Apache Software Foundation, and graduated to Top-Level Project on February 18, 2026.

Because the catalog owns the pointer swap, catalog bugs have a nasty property. They do not corrupt one query. They corrupt the table. A dropped pointer, a prematurely deleted metadata file, or a credential scoped one character too wide affects every engine that reads that table afterward. This is why a release like 1.7.0, which is heavy on correctness fixes and light on flashy features, deserves more attention than a release full of new endpoints.

Here is the shape of what changed, before the details.

| Area | What 1.7.0 adds | Who feels it |
|---|---|---|
| Write idempotency | Retry-safe `createTable` and `updateTable`, advertised through the config endpoint | Anyone running writers over flaky networks |
| Semantic models | Beta OSI semantic-model API scaffolding, plus a catalog config endpoint registry | Platform teams and BI/AI tooling authors |
| Storage security | GCS Workload Identity attribution, prefix boundary fix, re-validation of allowed locations | Anyone using credential vending |
| Authorization | Realm identity in the OPA input, clearer 403 messages, principal attribute refactor | Multi-tenant operators |
| File cleanup | Orphan metadata cleanup on failed commits, bulk deletes, resource leak fixes | High-commit-rate deployments |
| Eventing | OpenTelemetry event listener and a Kafka publishing extension | Observability and governance teams |
| Persistence | Several JDBC queries stopped fetching full rows | Large catalogs on Postgres |

## Idempotent writes, the headline feature

Go back to the failure I opened with. The root cause is that HTTP gives the client no way to distinguish "your request never arrived" from "your request succeeded and the response got lost." Those two cases demand opposite responses. In the first case the client should retry. In the second case the client should stop and treat the commit as done.

The Iceberg community's answer is an `Idempotency-Key` header on mutation endpoints, following the same design as the IETF draft for idempotency keys that payment APIs have used for years. The client generates a unique key per logical operation and sends it with the request. The server remembers the key and the outcome. On a retry with the same key and the same payload, the server returns the original result without executing anything again.

Polaris 1.7.0 implements the server half of that for two operations. Huaxing Gao's work landed entity-property idempotency for `createTable` in [#4912](https://github.com/apache/polaris/pull/4912) and opt-in idempotency for `updateTable` in [#5037](https://github.com/apache/polaris/pull/5037).

Read the word "opt-in" carefully, because it is the whole story for operators. Idempotency on `updateTable` is not on by default. You turn it on, and clients have to send the key. Nothing about upgrading to 1.7.0 makes your existing writers retry-safe by itself.

### How a client finds out

The interesting design choice is capability discovery. A client has no business guessing whether a catalog honors idempotency keys, because guessing wrong in the unsafe direction produces exactly the corruption we are trying to prevent. So the catalog advertises it.

Every Iceberg REST catalog exposes a `GET /v1/config` endpoint that clients call at connection time. It returns two property bags: `defaults`, which the client applies unless it overrides them, and `overrides`, which the server forces. [#5118](https://github.com/apache/polaris/pull/5118) added an idempotency key lifetime to what Polaris returns there.

A response now carries something in this shape:

```json
{
  "defaults": {
    "clients": "4"
  },
  "overrides": {
    "idempotency-key-lifetime": "PT30M"
  },
  "endpoints": [
    "GET /v1/{prefix}/namespaces/{namespace}/tables/{table}",
    "POST /v1/{prefix}/namespaces/{namespace}/tables/{table}"
  ]
}
```

The lifetime is the retention window for remembered keys. `PT30M` is ISO-8601 duration notation for thirty minutes. Inside that window, a repeat of the same key returns the original outcome. Outside it, the server has forgotten, and the retry runs as a fresh request with all the ordinary conflict semantics.

That window is a real operational parameter, and picking it is a tradeoff you own. Set it too short and a client that backs off aggressively falls outside the window before it retries, which puts you right back in the original failure mode. Set it too long and the server tracks more keys than it needs to, which costs persistence space and lookup time on every mutation. Thirty minutes covers the retry behavior of most engines with room to spare. Start there, then look at your longest observed client backoff before you change it.

### The storage design got simpler mid-flight

One detail in the changelog rewards a second look. [#5086](https://github.com/apache/polaris/pull/5086) removed an unused `IdempotencyStore` and an `idempotency_records` table.

That is the sound of a design being reconsidered before release. An earlier approach kept idempotency records in a dedicated table, which means a separate write on every mutation and a separate cleanup job to expire old rows. The shipped approach attaches idempotency state to the entity itself, which is what "entity-property idempotency" in the `createTable` PR title describes. Fewer moving parts, no second table to vacuum, no second failure domain.

If you were tracking this feature from the development branch and built tooling against `idempotency_records`, that table is gone. Check before you upgrade.

### What to do about it

Turning this on is a two-sided change, and the client side is not entirely in your hands yet.

1. Upgrade Polaris to 1.7.0 and confirm the config endpoint reports the lifetime you expect.
2. Check which of your engines send an `Idempotency-Key`. Support arrives engine by engine as the Iceberg client work lands, so verify rather than assume.
3. For engines that do not send one yet, nothing regresses. You get the same behavior you have now.
4. Watch for 422 responses after you enable it. Under the design, a repeated key with a different payload is a client bug, and the server rejects it rather than guessing which version you meant.

The last point is the one that surprises teams. Idempotency keys make a class of client bugs visible that used to hide inside retry loops. That is a feature. It also generates support tickets in week one.

## The catalog starts learning what a metric is

The second story in 1.7.0 is smaller in code and larger in implication. [#4816](https://github.com/apache/polaris/pull/4816) added scaffolding for an OSI semantic-model API, and [#4983](https://github.com/apache/polaris/pull/4983) marked it beta.

OSI stands for Open Semantic Interchange. It is an industry specification effort, convened by Snowflake with a broad group of analytics and BI vendors, that defines a YAML format for semantic models. A semantic model in this sense holds the things a table does not: datasets, the relationships between them, dimensions, and metrics. The example everyone reaches for is revenue. Every dashboard defines it, no two definitions agree, and the finance number never matches the sales number.

The OSI spec gives that definition a portable form. A semantic model contains datasets, relationships, and metrics, with SQL expressions attached and optional context annotations written for language models to read.

So why is this landing in a table catalog?

Because the catalog is the one component every engine already talks to. If your metric definitions live in your BI tool, they are available to your BI tool. If they live next to the tables, in the service that Spark and Trino and Flink and your agent framework all authenticate against, they are available to everything. The same argument that moved credential vending and access control into the catalog applies to semantics.

The AI angle is the forcing function. An agent writing SQL against a lakehouse has the schema and nothing else. It sees a column named `amt_net` and guesses. Give it a metric definition that says net revenue excludes returns and intercompany transfers, and the guessing stops. That is the thin part of the problem that semantic models solve, and it is the part where wrong answers are most expensive because they arrive fluent and confident.

Two supporting changes matter more than they look. [#4926](https://github.com/apache/polaris/pull/4926) added a catalog config endpoint registry, later moved into `runtime/service` by [#5052](https://github.com/apache/polaris/pull/5052). A registry for config endpoints is how a server grows optional API surfaces without every extension hard-coding itself into the core request path. Semantic models are the first tenant of that mechanism. They will not be the last.

### The honest assessment

Beta means beta. The PR titles say scaffolding, the API is explicitly marked as unstable, and the OSI core spec itself is young. Do not build a production metric layer on this in August 2026.

What to do instead: read the OSI spec, write a semantic model for one domain you already argue about internally, and see whether the format holds your actual business logic. The feedback loop for a young specification is people trying to express real definitions in it and reporting where it breaks. That is worth more to you and to the project than waiting for version 1.0 of the API.

One more reason to care, independent of which platform you run. Nearly every analytics vendor ships some form of semantic layer, and each one holds your metric definitions in its own format. A portable definition format means those definitions survive a change of vendor. That is worth something regardless of who you buy from today.

## Credential vending got stricter, and one fix was a real hole

Credential vending is the feature where the catalog, rather than the engine, holds the cloud storage credentials. An engine asks for a table, the catalog checks whether that principal is allowed, then calls AWS STS or Azure or GCS to mint a short-lived credential scoped to just the paths that table needs. The engine gets a token that opens a narrow door instead of a bucket-wide key.

The security of the whole arrangement rests on one thing: the scoping has to be correct. A credential scoped one prefix too wide hands a reader access to a neighbor's data. 1.7.0 fixes three separate ways that went wrong.

[#4860](https://github.com/apache/polaris/pull/4860) fixed native catalog credential vending skipping re-validation of `allowedLocations`. Read that plainly. There was a path where the list of locations a catalog is permitted to touch was not checked again at vending time. That is the kind of fix you upgrade for on its own.

[#4884](https://github.com/apache/polaris/pull/4884) fixed a GCS downscoped credential prefix boundary problem for locations without a trailing slash. This is the classic prefix bug. A credential scoped to `gs://bucket/data/sales` with naive prefix matching also opens `gs://bucket/data/sales-archive` and `gs://bucket/data/sales_pii`, because both start with the same characters. The trailing slash is what makes the boundary a boundary.

[#4707](https://github.com/apache/polaris/pull/4707) added GCS principal attribution to vended credentials through Workload Identity Federation. Attribution means the cloud audit log records which Polaris principal triggered the access, rather than showing every request coming from one service account. If you have ever tried to answer "who read this table last Tuesday" from a GCS audit log and found a single identity behind every entry, this is the change that fixes your investigation.

Three more storage changes round out the area. [#4954](https://github.com/apache/polaris/pull/4954) added a session policy parameter to SigV4 connections, which lets you attach an additional IAM policy that further narrows an assumed role. [#4991](https://github.com/apache/polaris/pull/4991) added bare ADLS vended credential keys for PyIceberg compatibility, a small fix with a large blast radius given how much Python tooling reads Iceberg tables directly. [#5004](https://github.com/apache/polaris/pull/5004) propagated storage HTTP client settings to `S3FileIO` for table operations, so proxy and timeout configuration finally applies to the catalog's own file reads rather than only to the vending path.

### Location validation tightened everywhere

Alongside vending, 1.7.0 tightened where a table is allowed to say its data lives. This is the same class of protection viewed from the other end.

- [#4422](https://github.com/apache/polaris/pull/4422) validates `default-base-location` against the storage configuration when a catalog is updated, not just when it is created.
- [#5114](https://github.com/apache/polaris/pull/5114) validates locations when registering tables and views.
- [#5115](https://github.com/apache/polaris/pull/5115) validates Iceberg metadata locations during table updates.
- [#4966](https://github.com/apache/polaris/pull/4966) fixed `ALLOW_EXTERNAL_METADATA_FILE_LOCATION` not being overridable at catalog level.
- [#5012](https://github.com/apache/polaris/pull/5012) deprecated the external table location flag outright.
- [#4606](https://github.com/apache/polaris/pull/4606) made default table and view locations unique, and [#4975](https://github.com/apache/polaris/pull/4975) encoded them with UTF-8.

Register-table is the operation worth understanding here. It points the catalog at an existing metadata file rather than creating a table from scratch, which makes it the natural way to adopt tables that another system wrote. It is also the natural way to point a catalog entry at a location it has no business owning. Validating on register closes that.

Plan for these to reject something. If you have tables whose metadata sits outside the configured allowed locations, and that arrangement has worked because nobody checked, 1.7.0 checks. Audit before you upgrade rather than after.

## Authorization, and a multi-tenant isolation fix

Polaris has a two-layer role model. Principal roles attach to service principals, which are the identities engines and users authenticate as. Catalog roles carry the actual privileges on catalogs, namespaces, and tables. You grant catalog roles to principal roles, and a principal gets the union of what its roles allow.

Polaris also supports delegating authorization decisions to Open Policy Agent, usually shortened to OPA. OPA is a general policy engine. Instead of Polaris deciding, Polaris sends a structured input document describing the request and asks OPA for a verdict, which lets you write policy in one language across many systems.

[#4992](https://github.com/apache/polaris/pull/4992) fixed a gap in that input: the realm identifier was missing. A realm in Polaris is a tenant boundary, the mechanism that keeps separate organizations on one deployment from seeing each other. If your OPA policy receives a request that names a catalog and a table but not the realm, and two realms happen to use the same catalog name, your policy has no way to tell them apart. Any operator running multi-tenant Polaris with OPA should treat this as the reason to upgrade.

The rest of the authorization work is structural. Y Sung's [#4356](https://github.com/apache/polaris/pull/4356) refactored catalog handlers and the admin service onto a shared `resolveAuthorizationInputs` path, which consolidates how a request turns into an authorization question. Alexandre Dutra's [#5085](https://github.com/apache/polaris/pull/5085) refactored `PolarisPrincipal` to hold generic attributes, followed by an `AttributeMap` interface in [#5139](https://github.com/apache/polaris/pull/5139). Generic principal attributes are the groundwork for policies that key on claims your identity provider issues rather than on a fixed set of fields Polaris knows about.

Two changes help the humans. [#4406](https://github.com/apache/polaris/pull/4406) put the missing privilege and the target entity into 403 messages. A denial that says "access denied" starts a thirty-minute investigation. A denial that names the privilege and the object it applied to ends in thirty seconds. [#5011](https://github.com/apache/polaris/pull/5011) correlates OPA server logs with the Polaris request ID and adds observability for non-200 responses from OPA, which turns "policy evaluation is behaving strangely" into a traceable event.

Rounding out the area: [#5112](https://github.com/apache/polaris/pull/5112) clarified principal role selection semantics, [#5113](https://github.com/apache/polaris/pull/5113) aligned token exchange scope handling, [#5096](https://github.com/apache/polaris/pull/5096) fixed view grants on federated catalogs, and [#4869](https://github.com/apache/polaris/pull/4869) optimized the byte-to-long conversion in privilege set bit manipulation.

## Orphan files, failed commits, and the cleanup story

This is the section that earns its keep for anyone running Polaris at volume.

Every Iceberg commit writes new metadata before the catalog swaps the pointer. When a commit fails, those files are already in object storage and nothing references them. They are orphans. Orphans cost money forever, and at high commit rates a small orphan rate compounds into a large bill and a slow bucket listing.

Polaris runs asynchronous tasks to clean this up. 1.7.0 rewrote a meaningful part of how those tasks behave.

The most serious fix is [#4920](https://github.com/apache/polaris/pull/4920), titled as fixing data corruption via premature metadata deletion in `commitTransaction`. Deleting a metadata file that is still referenced is the exact failure I opened this article with, arriving from the server side rather than the client side. Paired with it, [#4934](https://github.com/apache/polaris/pull/4934) cleans up metadata files on transaction failure and [#5057](https://github.com/apache/polaris/pull/5057) cleans up orphan metadata files on failed table and view commits. Together they draw a clear line: on failure, delete the files the failed attempt created, and never touch anything else.

Several fixes target the cleanup tasks themselves.

- [#4828](https://github.com/apache/polaris/pull/4828) fixed a `ManifestReader` resource leak in the cleanup handler. Leaked readers hold file handles and memory, and the symptom is a slow drift toward instability under sustained load rather than a clean crash.
- [#4941](https://github.com/apache/polaris/pull/4941) taught the manifest cleanup handler to handle delete manifests. Delete manifests track row-level deletes in merge-on-read tables. Skipping them means a specific category of file was never cleaned.
- [#4970](https://github.com/apache/polaris/pull/4970) fixed an infinite loop triggered by a non-positive `TABLE_METADATA_CLEANUP_BATCH_SIZE`. Set that value to zero and the old code spun.
- [#4871](https://github.com/apache/polaris/pull/4871) fixed a duplicate `setId()` in the table cleanup handler that burned entity IDs on every run.
- [#4914](https://github.com/apache/polaris/pull/4914) fixed async task retry when handlers return false, and [#4962](https://github.com/apache/polaris/pull/4962) changed `TaskHandler.handleTask` to return void so success and failure travel through exceptions instead of a boolean nobody checked consistently.

Then there is a performance thread with a direct line to your cloud bill. [#4850](https://github.com/apache/polaris/pull/4850) added bulk deletion to batch file cleanup. [#4928](https://github.com/apache/polaris/pull/4928) removed a redundant existence check before `deleteFile`, and [#5005](https://github.com/apache/polaris/pull/5005) eliminated double existence checks in batch cleanup.

Those last two are worth dwelling on. Calling `exists` before `delete` looks defensive and reads well. Against object storage it doubles your API call count for zero benefit, because delete on a missing key is already a no-op on every major provider. If a cleanup pass touches a million files, you just paid for two million requests instead of one million. Bulk delete then collapses the remaining calls into batched operations. For a deployment with heavy compaction and expiration activity, this is a line-item change.

## Events grow up: OpenTelemetry and Kafka

Polaris has an event listener framework that emits events as catalog operations happen. Table created, view committed, entity dropped. 1.7.0 gave that framework two destinations that matter.

[#4836](https://github.com/apache/polaris/pull/4836), from first-time contributor hkwi, added an OpenTelemetry event listener. OpenTelemetry is the vendor-neutral standard for traces, metrics, and logs, and nearly every observability backend ingests it. Emitting catalog events as OpenTelemetry data means a table commit shows up in the same trace view as the query that caused it, without a custom bridge.

[#4923](https://github.com/apache/polaris/pull/4923), from Mark McKeown, added an extension for publishing events to Kafka. This one is about governance rather than observability. A durable, ordered log of every catalog mutation is the substrate for lineage systems, data mesh contract enforcement, downstream cache invalidation, and change-driven pipelines. Reading catalog events off a Kafka topic is a far better integration point than polling the catalog on a timer.

Three supporting changes make the eventing usable. [#4956](https://github.com/apache/polaris/pull/4956) fixed `PolarisEventMetadata.eventId()` returning a different UUID on every call, which is exactly the bug that breaks deduplication in any consumer built on at-least-once delivery. [#4981](https://github.com/apache/polaris/pull/4981) replaced the `EventEntity.REALM_SCOPED` sentinel with a nullable `catalog_id`, trading a magic value for an honest null. [#4877](https://github.com/apache/polaris/pull/4877) avoids setting up metrics persistence when events are only buffered in memory, which removes a startup cost for deployments that never enabled persistence.

If you are building anything that reacts to catalog changes, the Kafka extension is the piece to look at first. Start with a consumer that does nothing but log, run it for a week, and read what your catalog actually emits before you design around it.

## Persistence: several queries stopped reading more than they needed

The JDBC persistence layer, which for most people means Postgres, got a focused optimization pass. The pattern repeats across the fixes, and the pattern is the lesson.

- [#5038](https://github.com/apache/polaris/pull/5038) stopped `lookupEntityVersions` from fetching full entity rows.
- [#5078](https://github.com/apache/polaris/pull/5078) did the same for `lookupEntityGrantRecordsVersion`.
- [#5134](https://github.com/apache/polaris/pull/5134) stopped `writeEntities` from issuing a wasteful full-row lookup per entity.
- [#4973](https://github.com/apache/polaris/pull/4973) bounded the JDBC `hasChildren` existence check with `LIMIT`, and [#5066](https://github.com/apache/polaris/pull/5066) fixed the same method fetching all rows and all columns.
- [#5020](https://github.com/apache/polaris/pull/5020) eliminated redundant metastore lookups when resolving principal roles.

Every one of these is the same mistake in a different place. The code needed one small fact, a version number or a yes/no answer, and asked the database for entire rows to get it. On a catalog with a few thousand entities nobody notices. On a catalog with hundreds of thousands, resolving principal roles on every single request while reading full rows is how a p99 latency graph develops a shelf.

`hasChildren` is the clearest example. The question is "does this namespace contain anything," and the answer is yes the moment one row exists. Without a `LIMIT`, the database happily returns all of them, and the cost of asking scales with the size of the namespace instead of staying constant.

One more in the same family: [#5027](https://github.com/apache/polaris/pull/5027) made `TreeMapMetaStore` range reads return copies. Returning live references from an in-memory store lets a caller mutate state it does not own, and the resulting bugs are the kind that reproduce once a month in production and never in a test.

## Error semantics, or why a 503 is kinder than a 500

A small cluster of changes fixed what Polaris says when it cannot do something. These matter more than their size suggests, because clients make retry decisions from status codes.

[#4646](https://github.com/apache/polaris/pull/4646) changed concurrent rename to return HTTP 503 instead of 500. The distinction is not pedantic. 500 means the server broke and a retry is pointless. 503 means the server is temporarily unable and a retry is sensible. A concurrent rename is a transient contention event, so 503 is the honest answer, and every well-behaved HTTP client already knows what to do with it.

[#5144](https://github.com/apache/polaris/pull/5144) went further and set a `Retry-After` header when a rename fails with a concurrent modification error. Now the client knows both that retrying is worthwhile and roughly when. That turns a hot retry loop into a scheduled one.

[#4793](https://github.com/apache/polaris/pull/4793) centralized drop-failure error mapping and fixed misleading messages. Scattered error mapping produces the situation where the same underlying condition surfaces as three different messages depending on which code path found it. [#4990](https://github.com/apache/polaris/pull/4990) fixed diagnostic extra info not rendering in `PolarisDiagnostics.fail` messages, which had been silently dropping the context attached to failures.

Taken together with the 403 improvement mentioned earlier, this release meaningfully reduces the number of Polaris errors that require reading source code to interpret.

## The platform underneath: Jackson 3, Quarkus 3.37, and test infrastructure

Robert Stupp drove a large migration to Jackson 3, the JSON library Polaris uses for serialization, across JDBC metrics, NoSQL pagination tokens, core serialization helpers, and the NoSQL layer. Quarkus moved to 3.37, Gradle to 9.6.1.

This kind of work never shows up in a feature list and always shows up in your incident history if it is skipped. A project that lets its serialization library go three major versions stale eventually finds itself unable to take a security patch without a month of migration work.

[#4913](https://github.com/apache/polaris/pull/4913) added a readiness check for reflection-free serializers. Reflection-free serialization is what lets a Quarkus application start fast and compile to a native image, and a startup check that verifies it is actually in effect prevents a silent fallback to the slow path.

The test infrastructure moved from localstack to Floci testcontainers for AWS, GCP, and Azure emulation, with integration tests migrated to a shared server runner and pushed down into the extensions they belong to. Faster and better-isolated tests sound like an internal concern. They are the reason the next release ships with fewer regressions.

Operationally useful odds and ends:

- [#4755](https://github.com/apache/polaris/pull/4755) added maintenance support to the Helm chart.
- [#4921](https://github.com/apache/polaris/pull/4921) added HTTP histogram buckets, which gives you real latency distributions instead of averages.
- [#4996](https://github.com/apache/polaris/pull/4996) made admin tool bootstrap idempotent for already-bootstrapped realms, so rerunning bootstrap in automation stops being dangerous.
- [#5044](https://github.com/apache/polaris/pull/5044) removed the schema version option from the admin bootstrap command.
- [#4772](https://github.com/apache/polaris/pull/4772) and [#4770](https://github.com/apache/polaris/pull/4770) fixed credential exposure in Python CLI debug logs and hardened profile secret handling and config storage.
- [#4936](https://github.com/apache/polaris/pull/4936) added `--catalog-url` for custom Iceberg REST base URIs, and [#5043](https://github.com/apache/polaris/pull/5043) added non-HTTP scheme support to the CLI.
- [#4849](https://github.com/apache/polaris/pull/4849) added a Trino guide, contributed by a first-time contributor.

That Python CLI credential fix deserves emphasis. Secrets in debug logs are how credentials end up in log aggregation systems with different retention and access rules than your secret store. If anyone on your team has ever run the Polaris CLI with debug logging on, rotate those credentials.

## Upgrading: a walkthrough

Here is the order I recommend, with the reasoning attached rather than left implicit.

### Step 1: audit locations before you touch anything

1.7.0 validates locations in places that previously went unchecked. Find out now whether any of your tables fail those checks.

```bash
# List every catalog and its configured base location
polaris catalogs list --output json \
  | jq -r '.[] | [.name, .properties["default-base-location"]] | @tsv'

# For one catalog, list tables and their metadata locations
polaris tables list --catalog analytics --output json \
  | jq -r '.[] | [.name, .metadataLocation] | @tsv'
```

What you are looking for is any metadata location that sits outside the catalog's configured base location and outside the storage config's allowed locations. Those are the entries that start failing on update or registration. The `--catalog-url` flag added in 1.7.0 helps here if your Polaris sits behind a path-rewriting proxy.

If you find violations, decide deliberately. Either widen the allowed locations to legitimately include those paths, or move the tables. Do not upgrade first and discover it through a failed production write.

### Step 2: pull the new image and check readiness

```bash
docker pull apache/polaris:1.7.0
docker pull apache/polaris-admin:1.7.0
```

The 1.7.0 artifacts are signed and checksummed like every Apache release. Verify them rather than trusting the registry alone:

```bash
curl https://downloads.apache.org/polaris/KEYS -o KEYS
gpg --import KEYS
gpg --verify apache-polaris-1.7.0.tar.gz.asc
shasum -a 512 --check apache-polaris-1.7.0.tar.gz.sha512
```

### Step 3: bootstrap safely

Admin bootstrap is now idempotent for already-bootstrapped realms, which makes it safe to leave in a deployment pipeline. Note that the schema version option was removed from the bootstrap command, so pipelines that pass it need editing.

```bash
docker run --rm apache/polaris-admin:1.7.0 bootstrap \
  --realm my-realm \
  --credential my-realm,root,secret
```

### Step 4: configure the pieces you want

A Helm values file covering the areas this release touched looks roughly like this. Treat it as a map of the knobs, not as a drop-in config.

```yaml
image:
  tag: "1.7.0"

# Persistence. Postgres is the common choice for production.
persistence:
  type: relational-jdbc

# Event listeners. Multiple listeners run side by side.
# The OpenTelemetry and Kafka destinations are new in 1.7.0.
polarisServerConfig:
  polaris:
    event-listener:
      types: "opentelemetry,kafka"

# HTTP latency histograms rather than averages.
    metrics:
      http:
        histogram-buckets: "50ms,100ms,250ms,500ms,1s,2s,5s"

# Delegate authorization decisions to Open Policy Agent.
# The realm identifier is now part of the input document.
    authorization:
      type: opa
      opa:
        base-uri: "http://opa.data-platform.svc:8181"

# Async cleanup task sizing. A non-positive batch size
# no longer loops forever, but set a sane value anyway.
    tasks:
      metadata-cleanup-batch-size: 100
```

The event listener line is the one people get wrong. `types` takes a comma-separated list, and support for multiple simultaneous listeners arrived in an earlier release, so adding OpenTelemetry alongside an existing listener does not displace it.

### Step 5: verify what the server advertises

After the rollout, ask the catalog what it thinks it supports. This is the same call your clients make.

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://polaris.example.com/api/catalog/v1/config?warehouse=analytics" \
  | jq
```

Look for the idempotency key lifetime in the returned properties. If it is absent, either the feature is not enabled in your configuration or you are not running what you think you are running. Checking the advertised capability beats checking the deployed tag, because the advertisement is what clients act on.

### Step 6: watch four things for a week

- **HTTP 422 responses.** New under idempotency. A repeated key with a changed payload is a client bug and now surfaces as a rejection.
- **HTTP 503 with `Retry-After` on rename.** Expected and healthy. A rise in volume points at contention worth investigating, not at a Polaris problem.
- **403 message content.** They now name the privilege and entity. Any log parsing built on the old shape needs updating.
- **Cleanup task throughput and object storage request counts.** Bulk deletes and removed existence checks should move both. If they do not, your cleanup tasks are not running as often as you assume.

## Failure modes worth knowing about

Every release closes some doors and opens others. These are the sharp edges I expect to generate questions.

**Idempotency lifetime set too short.** Client retries that fall outside the retention window get treated as fresh requests. The corruption scenario from the opening returns, and the metrics look fine because the feature is technically enabled. Set the window longer than your slowest client's maximum backoff, and revisit it when you change engine retry configuration.

**Assuming clients send keys.** Server support does not create client behavior. A dashboard that shows idempotency enabled tells you nothing about whether your Spark jobs are using it. Verify at the request level.

**Location validation surprises.** Covered above, and repeated here because it is the most likely upgrade-day incident. A table registered years ago against a path outside the current allowed locations has been quietly working. It stops.

**Semantic model API churn.** It is beta and marked beta. Anything you build against it now, you rewrite.

**Removed `idempotency_records` table.** If internal tooling read it from a development build, that tooling breaks.

**Log parsing on 403 and drop-failure messages.** Message text changed for the better. Alerting rules that match on old strings will go quiet, which is the worst way for an alert to fail.

**Cleanup tasks that were never running.** Several fixes in this release make cleanup faster and more correct. None of them help if your async task workers are starved, misconfigured, or crashing quietly. Before you credit 1.7.0 with a drop in orphan files, confirm the tasks execute at the rate you expect. The infinite-loop fix for a non-positive batch size is a hint that at least one deployment somewhere had cleanup wedged without noticing.

**Attributing a latency improvement to the wrong change.** The persistence fixes, the removed existence checks, and the Quarkus upgrade all landed together. If your p99 improves after upgrading, resist the urge to explain it. Measure one workload before and after, keep the configuration otherwise identical, and let the numbers stay unexplained rather than mis-explained.

## Where the catalog layer is going

Three trends run through this release and they all point the same direction.

The first is that catalogs are becoming full transactional systems rather than pointer stores. Idempotency keys, `Retry-After` semantics, orphan cleanup on failed commits, and correct conflict status codes are the vocabulary of a database, not of a lookup service. The Iceberg REST spec started as an interface for finding a metadata file. It is turning into a protocol for coordinating concurrent writers across engines that know nothing about each other.

The second is that the catalog is accumulating the metadata that engines cannot agree on among themselves. Access control moved there first, then credential vending, then policy. Semantic models are next in line. The pattern holds because the catalog is the one service every engine authenticates against, which makes it the only natural place to put something all engines need to share.

The third is that AI workloads are the pressure driving both. An agent issuing queries is a client with no institutional knowledge, aggressive retry behavior, and no human reviewing each result. It needs metric definitions it can read, credentials scoped tightly enough that a mistake stays contained, and write paths that survive retries. Every one of those needs shows up in this release.

There is a fourth thing worth naming, which is the health of the project itself. Eight first-time contributors landed changes in 1.7.0, from a Trino guide to an OpenTelemetry listener to a Kafka extension. The contributor list spans many employers. For anyone evaluating whether to build on Polaris, that distribution matters as much as any feature. A catalog is infrastructure you keep for a decade, and single-vendor projects have a way of changing direction on someone else's schedule.

## Conclusion

Apache Polaris 1.7.0 is not a release you adopt for a headline feature. It is a release you adopt because the failure modes it closes are the ones that cost you data.

The order of importance for most deployments: the credential vending re-validation fix and the OPA realm isolation fix are security work, and they come first. The premature metadata deletion fix in `commitTransaction` is data-integrity work, and it comes next. Idempotency is the feature everyone will write about, and it deserves the attention, but it requires deliberate enablement and client cooperation before it does anything for you. The semantic model API is a signal about where this project is heading rather than something to build on this quarter.

Audit your locations first. Upgrade second. Turn on idempotency third, once you know which engines can use it.

The unglamorous truth about catalogs is that the best possible outcome is that nobody thinks about them. A release like this one, mostly made of correctness fixes that prevent incidents nobody will ever see, is what that outcome is built from.

## Keep Going

If this piece was useful, I have written a lot more on catalogs and lakehouse architecture.
*Apache Polaris: The Definitive Guide*, which I co-authored for O'Reilly, covers the access control model, credential vending, and federation in the depth a release note cannot.
You can find every book I have written, across lakehouse architecture,
Apache Iceberg, Apache Polaris, and AI, at
[books.alexmerced.com](https://books.alexmerced.com).
