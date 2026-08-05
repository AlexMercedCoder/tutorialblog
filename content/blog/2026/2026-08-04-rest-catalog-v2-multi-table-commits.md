---
title: "How the Iceberg REST Catalog Turned Into the Lakehouse Control Plane"
date: "2026-08-04"
description: "How the Iceberg REST catalog became the lakehouse control plane: multi-table atomic commits, credential vending, capability negotiation, and what still breaks."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - REST Catalog
  - Apache Polaris
  - Catalog
  - Data Lakehouse
canonical: "https://iceberglakehouse.com/posts/rest-catalog-v2-multi-table-commits/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/rest-catalog-v2-multi-table-commits/).

# How the Iceberg REST Catalog Turned Into the Lakehouse Control Plane

*By Alex Merced, Data Lakehouse and AI Evangelist*

A dbt run updates a fact table and two dimension tables. The fact table commit succeeds. The second dimension commit fails on a conflict. For the next four minutes, every dashboard reading those three tables sees a fact table that references dimension rows that do not exist yet.

Nobody paged anyone. The numbers were wrong, then they were right. That is the daily reality of running a lakehouse where each table commits independently, and it is the problem that pushed the Apache Iceberg REST Catalog protocol from a metadata lookup service into something closer to a database control plane.

The protocol started as a fix for catalog fragmentation. Every engine needed native support for Hive Metastore, AWS Glue, Nessie, and whatever else a company ran. The REST specification replaced that matrix with one HTTP interface: any catalog that implements the spec becomes readable by any engine that speaks it.

What happened next is more interesting. Once the catalog owned the commit path, it gained the ability to do things no client-side catalog ever could. Multi-table atomic commits. Short-lived scoped storage credentials. Server-side conflict resolution. Capability negotiation across a mixed fleet of engines. This piece walks through each mechanism, explains what the protocol actually guarantees, and covers what still breaks.

A disclosure. I work for Dremio, which was acquired by SAP and now sits inside SAP Business Data Cloud. Dremio ships a catalog built on Apache Polaris. I will name products where the architecture calls for it and keep the mechanics vendor-neutral, because the mechanics are the transferable part.

## Why client-side catalogs hit a wall

Understanding what the REST protocol fixes requires understanding what came before.

In the original Iceberg design, the catalog was a library running inside the query engine. Spark loaded a Hive Metastore client, or a Glue client, or a Hadoop filesystem catalog. That client read table metadata, planned the query, and on write, performed the atomic swap that made a new snapshot current.

The swap is the important part. Iceberg commits work by atomically replacing a pointer to the current `metadata.json`. In a Hive Metastore, that is a table property update. In a filesystem catalog, it is a rename or a conditional put. In Glue, it is an UpdateTable call with a version check.

That design has three structural problems.

Every engine needs its own implementation of every catalog. Adding a new engine means writing catalog clients again. Adding a new catalog means every engine updates. The matrix grows multiplicatively, and in practice most engines supported two or three catalogs well and the rest poorly.

Credentials go to the client. For an engine to read data files, it needs storage credentials. In the client-side model, those credentials are configured on the engine, usually as long-lived keys with broad access to a bucket. The catalog has no way to scope what a given query touches.

Atomicity stops at one table. The client swaps one pointer at a time. There is no coordinator that sees two commits as one unit, because no single component sees both.

The REST protocol moves the catalog behind an HTTP boundary and makes it a service. The engine sends intent. The service decides. Everything that follows comes from that inversion.

## What the protocol actually specifies

The REST Catalog spec is an OpenAPI document covering namespace and table listing, metadata loading, commits, and snapshot management. The endpoints are conventional.

`GET /v1/namespaces` lists namespaces. `GET /v1/namespaces/{ns}/tables/{table}` loads table metadata. `POST /v1/namespaces/{ns}/tables/{table}` creates a table. `POST /v1/namespaces/{ns}/tables/{table}` with an update payload commits changes.

The design detail that matters is that commits are change-based rather than state-based. The client does not send a complete new `metadata.json` and ask the catalog to accept it. The client sends a list of requirements and a list of updates.

A requirement says something like "the current snapshot ID is 8271639". An update says "set the current snapshot to 8271640" or "add this schema". The catalog checks every requirement against current state, applies every update if they all hold, and rejects the whole thing otherwise.

That structure buys several things at once. The catalog performs server-side deconfliction, meaning two clients committing non-overlapping changes both succeed instead of one retrying. The catalog writes the root metadata itself, which makes metadata version upgrades a service-side concern instead of a client-side one. Retries become cheap and safe because the requirements make the operation idempotent in effect.

The spec also enables lazy snapshot loading, so a client that needs current state does not download the full snapshot history of a table with fifty thousand snapshots. On large tables that alone cuts table load time substantially.

## Multi-table atomic commits

This is the capability that turns a catalog into a transaction coordinator.

The Iceberg REST spec defines `POST /v1/transactions/commit` for atomic commits across multiple tables. The Java implementation has supported it since Iceberg 1.4 through `RESTSessionCatalog.commitTransaction`. Other language implementations have been catching up, with the Go client tracking a transactional catalog interface as an open request.

The semantics are what you want them to be. The catalog receives a batch of table commits. It validates every requirement for every table. It writes all metadata updates in a single backing-store transaction. If any requirement fails on any table, the entire batch is rejected and zero tables change.

Here is what the payload looks like in shape. Real clients build this through the library rather than by hand, but seeing the structure makes the guarantee concrete.

```json
{
  "table-changes": [
    {
      "identifier": { "namespace": ["sales"], "name": "fct_orders" },
      "requirements": [
        { "type": "assert-ref-snapshot-id", "ref": "main", "snapshot-id": 8271639 }
      ],
      "updates": [
        { "action": "add-snapshot", "snapshot": { "snapshot-id": 8271640 } },
        { "action": "set-snapshot-ref", "ref-name": "main",
          "type": "branch", "snapshot-id": 8271640 }
      ]
    },
    {
      "identifier": { "namespace": ["sales"], "name": "dim_customer" },
      "requirements": [
        { "type": "assert-ref-snapshot-id", "ref": "main", "snapshot-id": 5510022 }
      ],
      "updates": [
        { "action": "add-snapshot", "snapshot": { "snapshot-id": 5510023 } },
        { "action": "set-snapshot-ref", "ref-name": "main",
          "type": "branch", "snapshot-id": 5510023 }
      ]
    }
  ]
}
```

Read it as a two-phase check. The `requirements` block on each table is an optimistic concurrency assertion: this commit is valid only if the table is still where I left it. The `updates` block is the change to apply.

`assert-ref-snapshot-id` is the workhorse requirement. It pins the branch to a known snapshot. If another writer advanced `main` between the time this client read the table and the time it committed, the assertion fails and the whole transaction aborts.

The atomicity guarantee comes from the catalog applying all of it inside one transaction against its own store. A catalog backed by a relational database gets this almost for free. A catalog backed by a key-value store has to build it. This is the reason catalog implementation choice matters more than it used to.

On the client side in Java, the code is unremarkable, which is the point.

```java
Catalog catalog = CatalogUtil.loadCatalog(
    "org.apache.iceberg.rest.RESTCatalog",
    "prod",
    Map.of(
        "uri", "https://catalog.internal.example.com/api/catalog",
        "warehouse", "analytics",
        "credential", System.getenv("CATALOG_CREDENTIAL")
    ),
    new Configuration());

Transaction fact = catalog.loadTable(
    TableIdentifier.of("sales", "fct_orders")).newTransaction();
Transaction dim = catalog.loadTable(
    TableIdentifier.of("sales", "dim_customer")).newTransaction();

fact.newAppend().appendFile(orderFile).commit();
dim.newAppend().appendFile(customerFile).commit();

((RESTSessionCatalog) catalog).commitTransaction(
    List.of(fact, dim));
```

The individual `commit()` calls stage changes inside each transaction object. Nothing reaches the catalog. The final `commitTransaction` sends both change sets in one request. Either both tables advance or neither does.

The emerging design work goes further than the current endpoint. A four-pillar proposal covering stateless coordination, transaction snapshots, explicit isolation levels, and retryable subtransactions has been demonstrated on Apache Polaris. Project Nessie and Apache Gravitino, which is still in incubation, already implement their own variants of atomic multi-table commits.

The practical guidance today is straightforward. Check whether your catalog implements the transactions endpoint, check whether your client language does, and test it with a deliberate conflict before you rely on it. Support is uneven enough that assuming it works is a bad idea.

## Credential vending

The second capability that only exists because the catalog sits in the path is storage credential vending.

In the client-side model, an engine holds long-lived cloud credentials. A Spark cluster configured with an IAM role that can read a warehouse bucket can read every table in that bucket, whether the user running the job is authorized for those tables or not. Table-level authorization exists in the catalog, and object-level authorization exists in the cloud provider, and nothing connects them.

Credential vending connects them. When a client loads a table, the catalog checks whether that principal is authorized. If they are, the catalog mints a short-lived, prefix-scoped credential covering only the storage location for that table, and returns it in the load response.

The credential expires in minutes. It grants access to one prefix. It is issued per table load, per principal.

The load response carries the credential alongside the metadata.

```json
{
  "metadata-location": "s3://lake/warehouse/sales/fct_orders/metadata/00042.json",
  "metadata": { "format-version": 3, "table-uuid": "..." },
  "config": {
    "s3.access-key-id": "ASIA...",
    "s3.secret-access-key": "...",
    "s3.session-token": "...",
    "s3.remote-signing-enabled": "false",
    "client.region": "us-east-1"
  }
}
```

The `config` block is a set of engine configuration overrides. The client applies them to its file IO layer for that table. Nothing about the engine's base configuration changes, and nothing persists past the credential lifetime.

Remote signing is the alternative for environments where handing any credential to the client is unacceptable. Instead of vending a token, the catalog signs each storage request the client wants to make. The client never holds credentials at all. The cost is a round trip per request, so it fits environments where security posture outweighs latency.

The community work here has been steady. Recent Polaris development merged a credential vending refactor in core, added access delegation support to `registerTable`, and moved event listeners onto a dedicated thread pool so the audit path does not block commits. That last change is the kind of detail that matters at scale: an audit hook that blocks the commit path turns compliance logging into a throughput ceiling.

## Capability negotiation

The newest area of protocol work addresses a problem the ecosystem created for itself.

Iceberg now has three format versions in active use and a fourth in design. Catalogs implement different subsets of the REST spec. Engines implement different subsets of the format. A client that assumes the server supports everything, or a server that assumes the client does, produces failures that look random.

There is a real bug pattern that illustrates this. A client requests table creation with `format_version = 3` against a REST server. The server creates a V2 table instead, silently. The client believes it has a V3 table. Everything works until someone tries to add a Variant column.

Capability negotiation makes this explicit. The client declares what it understands through a header. The server declares what it supports through the config endpoint. Mismatches surface as errors at connection time rather than as confusing behavior later.

This matters more as the format grows more optional. V4 proposals add adaptive metadata structures, typed statistics, and column families, and not every engine will implement every piece on the same schedule. Negotiation is what lets a mixed fleet share tables safely during a multi-quarter transition.

If you are choosing a catalog today, ask how it handles version negotiation and what happens when a client requests something it does not support. The answer tells you a lot about how the upgrade to V4 will go.

## The catalog implementations

The ecosystem has consolidated around the REST protocol faster than most people expected, and the implementations differ in ways worth understanding.

| Catalog | Position | Notable characteristics |
|---|---|---|
| Apache Polaris | Open source, ASF Top-Level Project since February 18, 2026 | Co-created with Snowflake and donated to the ASF, full REST implementation, credential vending, multi-table transaction work demonstrated here |
| Project Nessie | Open source, Git-style branching model | Implements its own variant of atomic multi-table commits through branch semantics |
| Apache Gravitino | Open source, incubating | Broader metadata scope than tables alone, implements multi-table commit variants |
| Snowflake Horizon | Commercial governance and discovery layer | Runs its Iceberg interoperability on Apache Polaris, supports bi-directional access to Snowflake-managed Iceberg tables from outside engines |
| Databricks Unity Catalog | Commercial | Exposes an Iceberg REST endpoint alongside its native interfaces |
| Dremio Open Catalog | Commercial, built on Apache Polaris | Ships the Polaris implementation with managed operations, now feeding SAP Business Data Cloud after the SAP acquisition |
| Amazon S3 Tables | Managed service | Catalog and storage together, runs its own table maintenance |

The pattern across all of them is the same. The REST protocol became the interoperability substrate, and the differentiation moved to what sits around it: governance, discovery, policy enforcement, and operational management.

That separation is architecturally healthy. Iceberg deliberately keeps governance out of the table format. Access control, classification, and policy belong in the catalog and policy engine layers. The three-layer model reads as table format for data portability, catalog control plane for enforcement, and pluggable policy engines for rules. Tools like Open Policy Agent and Apache Ranger plug into that third layer.

## Failure modes

The REST catalog moves problems rather than eliminating them. These are the ones that bite.

**The catalog becomes a single point of failure.** Every query plan requires a catalog round trip. A catalog outage stops all reads, not just writes. Client-side catalogs distributed this risk across whatever backed them. Run the catalog with the availability posture of a production database, because that is what it now is.

**Commit throughput bottlenecks at the catalog.** All commits serialize through one service. A catalog backed by a database with row-level locking on a table metadata row limits how many concurrent writers one table supports. Measure commit latency under your actual write concurrency before you find out in production.

**Credential expiry mid-query.** Vended credentials are short-lived by design. A query that scans for longer than the credential lifetime fails partway through unless the client refreshes. Most clients handle this. Some do not, and the symptom is a long query failing on an access denied error that makes no sense. Test with a query that runs longer than your credential TTL.

**Silent version downgrades.** The format version bug described earlier is real and has appeared in more than one implementation. Verify the format version of a created table by reading it back rather than trusting the request.

**Partial transaction support.** A client language that lacks the transactions endpoint falls back to sequential single-table commits without telling you. The code looks transactional. The behavior is not. Confirm at the client library level, not just the catalog level.

**Audit logging in the commit path.** Governance requirements push teams to log every commit. A synchronous logging hook adds its latency to every write. Move audit work off the commit thread, which is exactly what the Polaris event listener change did.

**Network partition ambiguity.** A commit request that times out has an unknown outcome. It succeeded or it did not, and the client cannot tell. The requirements model makes retries safe, because a retry with the same requirements fails cleanly if the first attempt actually landed. Rely on that rather than on application-level bookkeeping.

## Operating a REST catalog in production

A checklist that holds across implementations.

Run at least two catalog instances behind a load balancer, with the backing store on managed infrastructure that has its own failover. Treat catalog availability as equal in importance to storage availability.

Monitor commit latency at the ninety-fifth percentile, commit conflict rate, table load latency, and credential vending rate. Conflict rate rising is the leading indicator that write concurrency has outgrown your table layout, usually because too many writers target the same partitions.

Set credential TTL against your longest expected query rather than your average. Then confirm your clients refresh.

Keep principal identity flowing end to end. The value of vending is that the catalog authorizes the actual user or service, not a shared engine role. A deployment where every query arrives as the same service principal gets the short-lived credential benefit and none of the authorization benefit.

Test multi-table transactions with deliberate conflicts in a staging environment. Write a test that commits two tables while a competing writer advances one of them, and assert that neither table changed.

Version-pin engine and catalog together in your deployment configuration, and record which format versions each combination supports. This inventory is the artifact that makes the eventual V4 transition a schedule rather than a research project.

Put the catalog first in your upgrade order. Engines get upgraded because engine teams are motivated. Catalogs get upgraded when someone remembers, and a lagging catalog blocks every engine behind it.

## Migrating off Hive Metastore or Glue

Most teams reading this have tables registered in a Hive Metastore or AWS Glue. Migration is more mechanical than it sounds, and the order matters.

The first decision is whether to migrate the tables or to front the existing catalog. Both are valid.

Fronting means running a REST service that translates REST calls into operations against the existing metastore. The Iceberg codebase supports this through `CatalogHandlers`, and the community maintains a REST fixture image for testing. Engines start speaking REST immediately. The underlying metastore stays where it is. You get protocol unification without a data migration, and you do not get the capabilities that require the catalog to own state, since credential vending and multi-table atomicity depend on the backing store rather than on the protocol alone.

Migrating means registering tables into a new REST catalog and repointing engines. This is the path that gets you the full capability set.

Registration does not move data. An Iceberg table is defined by its current `metadata.json`, so registering it in a new catalog is a pointer operation.

```java
Catalog target = CatalogUtil.loadCatalog(
    "org.apache.iceberg.rest.RESTCatalog",
    "prod",
    Map.of(
        "uri", "https://catalog.internal.example.com/api/catalog",
        "warehouse", "analytics",
        "credential", System.getenv("CATALOG_CREDENTIAL")
    ),
    new Configuration());

HiveCatalog source = new HiveCatalog();
source.initialize("legacy", Map.of("uri", "thrift://metastore:9083"));

for (TableIdentifier id : source.listTables(Namespace.of("sales"))) {
    String metadataLocation = ((BaseTable) source.loadTable(id))
        .operations().current().metadataFileLocation();
    target.registerTable(id, metadataLocation);
}
```

`registerTable` takes an identifier and the location of the current metadata file. The new catalog starts tracking the table from that point forward. Snapshot history, schema evolution, and partition specs all come along, because they live in the metadata file rather than in the catalog.

Three things go wrong here often enough to plan for.

Two catalogs pointing at the same table is a correctness hazard. If both the old metastore and the new REST catalog think they own a table, two writers commit through different atomic swap mechanisms and one silently overwrites the other. Freeze writes during the cutover for each table, or migrate table by table with a clear owner at every moment.

Absolute paths tie tables to their location. Until relative path support lands broadly, a table registered in a new catalog still points at the original storage location. Migrating the catalog does not migrate the storage, and trying to do both at once turns a pointer update into a metadata rewrite.

Permissions do not come along. Grants in a Hive Metastore or Glue do not translate into catalog role assignments. Build the authorization model in the new catalog first, verify it with real principals, and then register tables into it. A migration that lands tables into a catalog with permissive defaults is a security incident waiting for someone to notice.

The engine side is configuration only. Spark, for instance, needs the catalog implementation, the endpoint, the warehouse, and credentials.

```
spark.sql.catalog.prod                   = org.apache.iceberg.spark.SparkCatalog
spark.sql.catalog.prod.type              = rest
spark.sql.catalog.prod.uri               = https://catalog.internal.example.com/api/catalog
spark.sql.catalog.prod.warehouse         = analytics
spark.sql.catalog.prod.credential        = <client-id>:<client-secret>
spark.sql.catalog.prod.header.X-Iceberg-Access-Delegation = vended-credentials
```

The last line is the one people miss. Access delegation is opt-in through a header. Without it, the catalog returns metadata and expects the engine to bring its own storage credentials, which defeats the purpose of vending.

Run both catalogs in parallel for a defined window. Point read traffic at the new catalog while writes still flow through the old one, compare results, and then move writes. That sequence gives you a rollback that costs nothing.

Decommission by removing the old registration rather than dropping tables. A `DROP TABLE` in the source catalog on a purge-enabled configuration deletes data files. That has ended more than one migration badly. Use whatever the source catalog calls an unregister or drop-without-purge operation, and verify the behavior on a throwaway table first.

## What agents change about catalog requirements

One more shift is worth naming, because it is reshaping catalog roadmaps in 2026.

An analyst who writes a bad query sees a result that looks wrong and fixes it. An agent issuing hundreds of queries an hour without review has no such feedback loop. The catalog becomes the place where correctness gets enforced, because it is the one component every access path crosses.

That pushes three things into the catalog layer.

Semantic definitions move in, so that an agent asking for revenue gets one definition rather than inventing a join. Policy enforcement moves in, so that a query an agent generates is filtered by role before it executes rather than after. Telemetry moves in, so that every tool call and every resulting query is recorded against a principal for audit.

None of that requires a new protocol. It requires the catalog to be a service in the path, which is exactly what the REST specification made it. The architectural point is that the same inversion that enabled credential vending and multi-table transactions also enabled everything the agentic workloads need. Teams that moved to REST for interoperability reasons two years ago positioned themselves for a requirement that did not exist yet.

## Where this goes

Two directions are worth watching.

The catalog is becoming a registry for more than tables. The Table Sources proposal in the Polaris community aims to make the catalog a registry for every lakehouse asset, including views, functions, metrics, and models. That expansion reflects what teams actually need: one place to discover and govern everything an engine or an agent touches.

Every catalog roadmap in 2026 is bending toward AI agents, and the bending reshapes what a catalog is. A human analyst who writes a wrong query notices that the result looks off. An agent querying tables at high frequency without review does not. That asymmetry pushes governance, semantic definitions, and query-time policy enforcement into the catalog layer, because the catalog is the one component every access path goes through.

The transaction work will keep maturing. Explicit isolation levels and retryable subtransactions turn multi-table commits from a feature into something a data engineering framework builds on by default. Once a transformation tool assumes cross-table atomicity, the whole class of partial-update inconsistency that opened this article stops being a thing engineers reason about at all.

## Conclusion

The REST catalog started as a way to stop writing a catalog client for every engine. It ended up as the component that gives a lakehouse the properties people assumed they gave up when they left the warehouse: cross-table atomicity, scoped credentials that follow user identity, server-side conflict resolution, and a place to negotiate compatibility across a mixed fleet.

The tradeoff is that a service in the commit path is a service you have to operate. Availability, latency, and throughput at the catalog now bound your whole platform, and the operational bar rises to match.

Start with the catalog, not the format. If you are still running a client-side catalog, moving to REST is the highest-value architectural change available in a lakehouse right now. It is also the prerequisite for most of what is coming next in the format.

## Keep Going

If this piece was useful, I have written a lot more on catalogs and lakehouse architecture. *Apache Polaris: The Definitive Guide* covers the REST protocol, credential vending, and catalog governance in depth, and *Apache Iceberg: The Definitive Guide* covers the table format underneath it. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
