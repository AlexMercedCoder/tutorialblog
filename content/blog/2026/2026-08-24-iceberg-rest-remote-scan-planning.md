---
title: "Iceberg REST Remote Scan Planning Changes More Than Query Performance"
date: "2026-08-24"
description: "Remote scan planning moves Iceberg file selection into the catalog. What that changes for engines, governance, and operational cost beyond query speed."
author: "Alex Merced"
category: "Apache Iceberg"
canonical: https://iceberglakehouse.com/posts/iceberg-rest-remote-scan-planning/
tags:
  - Apache Iceberg
  - REST catalog
  - scan planning
  - query engines
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-rest-remote-scan-planning/).

Most of the coverage of Apache Iceberg 1.11 treats remote scan planning as a performance feature. The catalog plans the scan instead of the engine, the engine downloads less metadata, queries start faster. All of that is true, and for some workloads the numbers are meaningful. But the performance framing undersells what actually happened. When the catalog server decides which files a query is allowed to see, the catalog stops being a directory of table pointers and starts being an enforcement point. That is an architectural shift, not an optimization.

I want to walk through this carefully, because the details matter. Remote scan planning changes who holds metadata, who evaluates policy, how much intelligence an engine needs to carry, and what a "thin" Iceberg client can be. It changes what a catalog vendor sells. It changes what a compromised engine can learn about your storage layout. And it introduces new operational questions that client-side planning never had to answer, like what happens to your entire query fleet when the planning service has a bad day.

I work at Dremio, which builds both a query engine and an open catalog based on Apache Polaris, so I sit close to both sides of this protocol. I co-wrote the O'Reilly books on Apache Iceberg and Apache Polaris. This article is about the open specification, which any catalog and any engine can implement.

## How Iceberg Scan Planning Has Always Worked

To understand what changed, you need to understand the job scan planning does. When an engine receives a query like `SELECT * FROM orders WHERE order_date = '2026-08-01'`, it has to translate that into a concrete list of files to read. Iceberg makes this possible through a metadata tree.

The traditional flow looks like this. The engine asks the catalog for the table, and the catalog returns a pointer to the current metadata file, a JSON document in object storage. The engine reads that file to learn the schema, the partition spec, and the current snapshot. The snapshot points to a manifest list, an Avro file enumerating the manifests in that snapshot along with partition-level summaries. The engine reads the manifest list, prunes manifests whose partition ranges cannot match the filter, then reads the surviving manifests. Each manifest lists data files with per-file statistics: record counts, column lower and upper bounds, null counts. The engine applies the filter against those statistics, discards files that cannot contain matching rows, and emits the survivors as file scan tasks. Only then does any data get read.

Notice where all of this work happens. The catalog answers one small question, "where is the current metadata file," and then steps out of the way. Everything else is the engine talking directly to object storage. The engine downloads the metadata JSON, the manifest list, and every relevant manifest. For a small table this is a handful of requests. For a table with hundreds of thousands of data files, the manifests alone run into hundreds of megabytes, and the engine holds a large portion of that in memory while it plans.

This design has real strengths. It scales horizontally, because every engine plans its own queries and the catalog never becomes a bottleneck. It works identically for every engine, because the metadata format is the contract. It keeps the catalog simple, which is part of why so many catalog implementations exist.

It also has real costs. Every engine has to implement the full planning logic: manifest parsing, partition transform evaluation, statistics-based pruning, delete file association. That logic is subtle, and every new language implementation has to get it right. Every engine needs read credentials for the metadata files, not just the data files, which widens the credential surface. Planning latency is dominated by round trips to object storage, which hurts short queries the most. And a client that plans its own scan sees the entire file layout of the table, including files its query will never touch. Keep that last point in mind. It becomes important later.

## What the REST Protocol Changed Before Scan Planning Arrived

The Iceberg REST catalog protocol exists because catalog integration used to be a many-to-many problem. Spark spoke to Hive Metastore one way, Trino spoke to AWS Glue another way, and internal tooling spoke to homegrown catalogs a third way. The REST protocol, defined as an OpenAPI specification in the Iceberg project, collapsed that. An engine implements one REST client, a catalog implements one REST server, and any pairing works over HTTP.

But the protocol was never just a compatibility layer. From early on, it added capabilities that a passive metadata store cannot offer, because a server sits in the request path and can do work. Credential vending lets the catalog hand an engine short-lived, table-scoped storage credentials instead of requiring long-lived keys on every cluster. Remote signing goes further, with the catalog pre-signing individual storage requests so the engine never holds credentials at all. Change-based commits let the server deconflict and retry concurrent writes instead of failing them back to the client. Multi-table commits give atomic visibility across several tables in one operation.

Each of these moved a responsibility from the engine to the catalog. Each one made the catalog a little less like a phone book and a little more like a service. Scan planning is the biggest step yet in that same direction, because it moves the read path itself.

The groundwork is older than most people realize. The scan planning endpoints entered the REST OpenAPI specification in September 2024. What took time was the client and server machinery: a reference client in the Java library, capability discovery so clients know whether a server supports planning, alignment fixes between implementations and the spec, and hardening around plan lifecycle states. That work landed across 2025 and culminated in the 1.11.0 release, which shipped on the 19th of May, 2026, with over 1,000 commits from more than 200 contributors. The release included the REST scan planning client in core, Spark integration with backports to Spark 3.4 and 3.5, and a stream of spec clarifications, like marking the plan ID as required whenever a plan is in submitted status.

The Python side moved in parallel. PyIceberg 0.11.0 added synchronous scan planning, where the client sends a scan request and the server returns file scan tasks directly. It also added endpoint discovery through the catalog's configuration response, so a client checks what the server supports and falls back to defaults for older servers instead of failing with a cryptic error.

## What Remote Scan Planning Actually Is

Remote scan planning inverts the flow described above. Instead of downloading metadata and planning locally, the engine sends the catalog a description of the scan it wants: the table, an optional snapshot, a filter expression, and a column projection. The catalog performs the planning work on the server, walking its own copy of the metadata tree, applying partition pruning and statistics-based file elimination, and returns the result as file scan tasks. Each task tells the engine exactly which data file to read, which byte range, which delete files apply, and what residual filter to evaluate. The engine goes straight from "here is my query" to "here are my files."

The protocol supports two modes. In synchronous planning, the server does the work inside the request and responds with a completed plan containing the file scan tasks. This fits small and medium tables where planning finishes in well under a second. In asynchronous planning, the server responds with a plan ID and a status of submitted. The client polls the plan endpoint until the status becomes completed, then fetches the results. Plans move through a defined lifecycle: submitted, completed, failed, or cancelled, and the client can cancel a plan it no longer needs. The spec now requires the plan ID whenever a plan sits in submitted status, one of several tightening changes in 1.11.

For very large results, the protocol splits output into plan tasks. A plan task is an opaque handle representing a chunk of the overall plan. The client exchanges each plan task for its concrete file scan tasks through a separate tasks endpoint. This matters because a scan of a petabyte table can produce hundreds of thousands of file scan tasks, and streaming them in pages keeps both sides within memory limits. Distributed engines take advantage of this by fetching different plan tasks on different workers, so result retrieval parallelizes just like the scan itself.

The request side gained refinements in 1.11 too. A client can pass a minimum row count hint, added to the plan request schema during the 1.11 cycle, which tells the server how much data the client actually needs. A dashboard preview fetching 1,000 rows has no reason to receive a plan covering ten billion.

Remote planning did not arrive alone in 1.11, and its neighbors reinforce the same theme. The release added a partition statistics scan API, giving optimizers a supported way to read a table's shape, partition row counts and sizes, without scraping metadata files directly. It stabilized v3 features like deletion vectors as production defaults, which raises the stakes for delete file association during planning. And it laid foundational interfaces for the v4 manifest work aimed at tables with millions of files, exactly the scale where server-side planning stops being optional and starts being the only sane read path. Read together, the release describes a format preparing for tables too large for any client to plan comfortably.

One detail worth being precise about: the catalog plans against its own view of the metadata. Some catalog servers read the same manifest files from object storage that a client reads today, just from a better position, with warm caches and fat network paths. Others maintain internal representations of table metadata and plan against those. The protocol does not care. It defines the conversation, not the server's implementation, and that freedom is exactly what lets catalog implementations compete on planning quality.

## Walking Through the Protocol

Here is what the conversation looks like on the wire, simplified but with real shapes. The engine starts by planning a scan:

```http
POST /v1/prod/namespaces/sales/tables/orders/plan HTTP/1.1
Host: catalog.example.com
Authorization: Bearer <token>
Content-Type: application/json

{
  "snapshot-id": 8271744332764321989,
  "select": ["order_id", "customer_id", "total"],
  "filter": {
    "type": "eq",
    "term": "order_date",
    "value": "2026-08-01"
  },
  "case-sensitive": true
}
```

The filter is an Iceberg expression serialized as JSON, not a SQL string. The catalog binds it against the table schema, converts it through the partition spec's transforms, and prunes at three levels: manifests via partition summaries, files via partition values, and files again via column statistics. A synchronous server replies:

```json
{
  "plan-status": "completed",
  "file-scan-tasks": [
    {
      "data-file": {
        "content": "data",
        "file-path": "s3://lake/sales/orders/data/00042-a1.parquet",
        "file-format": "parquet",
        "record-count": 481923,
        "file-size-in-bytes": 104857600
      },
      "delete-files": [],
      "residual-filter": { "type": "true" }
    }
  ]
}
```

An asynchronous server replies instead with `"plan-status": "submitted"` and a `plan-id`, and the client polls:

```http
GET /v1/prod/namespaces/sales/tables/orders/plan/plan-7f3a92 HTTP/1.1
```

When results are large, the completed response carries `plan-tasks` handles, and the client trades each one for file scan tasks:

```http
POST /v1/prod/namespaces/sales/tables/orders/tasks HTTP/1.1
Content-Type: application/json

{ "plan-task": "opaque-task-handle-0001" }
```

On the engine side, none of this requires application changes. In Spark with Iceberg 1.11, remote planning is a catalog-level configuration, and the backports mean Spark 3.4 and 3.5 users get it without moving to Spark 4:

```properties
spark.sql.catalog.prod = org.apache.iceberg.spark.SparkCatalog
spark.sql.catalog.prod.type = rest
spark.sql.catalog.prod.uri = https://catalog.example.com
spark.sql.catalog.prod.rest.scan-planning-enabled = true
```

Read each piece of that response schema again, because two fields carry the architectural weight. The `residual-filter` tells the engine what part of the predicate still needs row-level evaluation after file-level pruning, which means the server and engine share the planning work rather than duplicating it. And the `delete-files` array means the server resolves delete file association, one of the hardest parts of planning to implement correctly, especially with v2 position deletes and v3 deletion vectors in the mix. Every language implementation that adopts remote planning gets to skip reimplementing that logic.

## Counting the Round Trips

Abstract descriptions hide the magnitude of the change, so let me count. Take a realistic table: 200,000 data files, 400 manifests averaging 4 MB each, one manifest list, one metadata file. A query filters on a partition column and matches 2 percent of the files.

Client-side planning performs one catalog request for the table pointer, one storage read for the metadata JSON, one for the manifest list, then reads every manifest the partition summaries cannot exclude. Suppose partition pruning eliminates half the manifests. The engine still downloads 200 manifests, roughly 800 MB of Avro, parses them, evaluates statistics for around 100,000 file entries, and keeps 4,000 file scan tasks. That is 203 storage round trips and close to a gigabyte over the network before the first data byte, repeated by every engine instance that plans this query, on every execution, for every user.

Remote planning performs one HTTP request. The catalog, which has likely planned this exact snapshot and filter combination before, returns 4,000 file scan tasks, a response measured in single-digit megabytes, possibly from cache in a few milliseconds. If the result were huge, it arrives as plan task pages instead. The engine's planning cost became one round trip and a JSON parse.

The comparison across the dimensions that matter:

| Dimension | Client-side planning | Remote scan planning |
|---|---|---|
| Metadata transferred to engine | Full manifest set for candidate partitions | Only matched file scan tasks |
| Round trips before data read | Proportional to manifest count | One, plus paging for huge plans |
| Planning logic location | Every engine, every language | Catalog server, once |
| Delete file association | Implemented per engine | Resolved by server |
| Cross-user caching | None, engines cannot share | Snapshot-keyed server cache |
| Fine-grained policy | Per-engine, inconsistent | Enforced at planning time |
| Metadata visibility | Entire table layout | Authorized files only |
| Catalog availability needed | Table resolution only | Every query plan |
| Result verification by engine | Full, against immutable files | Trusts the server's plan |

The last two rows are the price column. Everything above them is the benefit column. Architecture decisions live in tables like this one, and the right answer differs between a bank enforcing row-level policies across four engines and a startup running one Spark cluster against its own catalog.

## The Performance Story, Honestly Told

The performance benefits are real, so let me state them plainly before going beyond them.

Client memory drops. An engine planning a large table holds manifest data in memory, and the Java implementation has documented memory overhead limits that large tables push against. With remote planning the client holds only the tasks it receives, in pages.

Cold starts shrink. A stateless client, a Lambda function, a short-lived Kubernetes pod, a CLI tool, no longer downloads manifests before its first byte of data. This is the difference between Iceberg being practical or impractical in serverless shapes. The Go library's tracking issue for this feature spells out the goal: scan tables of any size without downloading manifests locally, and run stateless from Lambda or Cloud Run with no manifest cache.

Servers cache what clients cannot. A catalog serving a thousand dashboard refreshes of the same table plans once and serves the cached plan, keyed by snapshot ID so a table change invalidates it automatically. Apache Gravitino's Iceberg REST service ships exactly this, with a built-in in-memory scan plan cache and a pluggable interface for custom cache backends. No client-side planner ever amortizes work across users this way, because clients do not see each other.

Planning moves next to metadata. The round trips that dominate client planning happen between the catalog and storage, often in the same region on fat pipes, or disappear entirely when the catalog holds metadata in its own store.

What the performance story leaves out is everything below.

## Inside a Planning Server

Since catalogs now compete on planning, it helps to know what a good planning implementation actually does. If you operate a catalog, this is your checklist. If you buy one, these are your evaluation questions.

Expression binding comes first. The server receives a serialized Iceberg expression and binds it to the table schema at the requested snapshot, resolving names to field IDs, checking types, and normalizing the predicate. Binding against field IDs rather than names is what keeps plans correct across schema evolution, the same property that makes Iceberg schema evolution safe everywhere else. A renamed column filters correctly because the ID survived the rename.

Partition transform projection comes second. A filter on `order_date` becomes a filter on `days(order_date)` partition values through transform projection, the same logic engines run today, now executed once on the server. Multi-argument transforms from v3 and whatever v4 adds land in one codebase instead of eight.

Then metadata traversal, and here implementations diverge most. A pass-through server reads manifest lists and manifests from object storage per plan, which already wins on network position and connection reuse. A caching server keeps deserialized manifest structures warm, keyed by manifest path, since manifests are immutable and cache perfectly. An indexing server maintains its own queryable representation of file statistics and skips Avro entirely at plan time. Each step up the ladder trades server complexity for planning latency, and the protocol permits all of them because it specifies the answer, not the method.

Plan caching sits on top. The correct cache key is snapshot ID plus normalized filter plus projection plus principal, and that last term is easy to forget. Two principals with different row policies must never share a cached plan. Gravitino's implementation keys its cache by snapshot so table changes invalidate automatically, and exposes the cache as a pluggable interface for teams that want distributed backends. When you evaluate a catalog, ask how the cache key incorporates policy identity, because a cache that ignores it is a data leak with good latency.

Spooling closes the loop. Completed plans for large scans get chunked into plan tasks, persisted or held with a lifetime, and served page by page. Ask what happens to a spooled plan when the server restarts, and whether an abandoned plan's storage gets reclaimed. Boring questions, real incidents.

## The Governance Story: When the Catalog Decides What You See

Here is the question that makes remote scan planning bigger than a performance feature. If the catalog produces the list of files an engine reads, what stops the catalog from producing a different list for different principals?

Nothing stops it. That is the point.

With client-side planning, table-level access control is the natural ceiling for an open, multi-engine lakehouse. Either a principal can read the metadata and files of a table or it cannot. Once an engine holds the manifests, it sees every file, and the catalog has no further say in what gets read. Fine-grained controls, row filtering, column masking, attribute-based rules, had to live inside each engine, which meant every engine enforced them differently or not at all. In practice, organizations either accepted table-level granularity for external engines or funneled everything through one vendor's compute where the policy engine lived.

Remote scan planning breaks that ceiling, because planning is exactly the moment where fine-grained policy is cheapest to enforce. The catalog knows the principal from the bearer token. It knows the policies attached to the table. During planning, it applies them:

Row-level security becomes file elimination plus residual filters. If a principal is only allowed rows where `region = 'EMEA'`, the catalog injects that predicate into the plan. Files whose statistics exclude EMEA never appear in the response. The remainder carries a residual filter the engine must apply, and a policy-aware protocol flow verifies the engine received it.

Attribute-based access control becomes practical across engines. This is not hypothetical. Databricks announced ABAC enforcement for external Iceberg engines through Unity Catalog, stating that any engine implementing the Iceberg 1.11 scan planning client accesses data with ABAC enforced. Snowflake documented the same pattern for policy-protected tables accessed by external Spark clusters through the scan API. Two of the largest catalog vendors converged on the same open protocol as their fine-grained enforcement point for engines they do not control. Whatever you think of either vendor, that convergence tells you where the protocol is going.

Time travel becomes governable. A catalog can refuse to plan scans against snapshots older than a retention policy, or against snapshots containing data that was deleted for compliance reasons. With client-side planning, anyone with metadata access reads any reachable snapshot.

Credentials narrow further. The catalog vends credentials scoped to the specific files in the plan, with plan-scoped lifetimes, instead of table-scoped or bucket-scoped credentials. A leaked credential from a scan is good for the files of that scan, briefly.

To make this concrete, walk one scenario end to end. A healthcare analytics table holds claims data for many provider organizations. Policy says analysts see only their organization's rows, and a small audit group sees everything. Under client-side planning, enforcing this across Spark, Trino, and a Python notebook fleet means configuring three different row-filter mechanisms, hoping they agree, and accepting that anyone with metadata read access can enumerate every claims file and its value ranges. Under remote planning, the policy lives once, in the catalog. The analyst's token maps to an organization attribute. The plan request for `SELECT * FROM claims WHERE service_date >= '2026-01-01'` comes back with only the files whose statistics admit that organization, a residual filter pinning the organization column, and credentials valid for exactly those files. The audit group's identical query returns the full plan. The notebook, the Spark job, and the Trino cluster all hit the same enforcement point, and the access log lives where the enforcement does. That is the operating model change, compressed into one table.

And metadata itself becomes private. This one gets overlooked. Manifests are not just pointers, they are a census of your table: file counts, file sizes, partition distributions, column value ranges for every column, growth over time. A client that plans locally reads all of it. Under remote planning, the client learns only the files it is authorized to read and the statistics needed to read them. For multi-tenant tables and regulated data, the metadata tree stops leaking the shape of data a principal cannot access.

The uncomfortable flip side: the catalog is now inside your query results' trust boundary. A buggy or compromised planning service returns wrong file lists, which means wrong query answers, silently. Client-side planning had a simpler trust story, where the engine verified everything against immutable files. Teams adopting remote planning for governance should be clear-eyed that they are trading a verification property for an enforcement property. For most enterprises that trade is obviously worth it, and they already trust the catalog for commits. But it is a trade, and your threat model should record it.

## What This Does to Engines, Catalogs, and the Things That Are Neither

Follow the incentives and you can see the ecosystem reshaping around this endpoint.

Engines get thinner. A complete Iceberg reader used to require manifest parsing, partition transform evaluation, statistics pruning, and delete file association before reading a single row. With remote planning, a minimal reader needs an HTTP client, a Parquet reader, and the ability to apply a residual filter and a deletion vector. That collapses the cost of bringing Iceberg to a new language or an embedded context. The proliferation of native implementations, Java, Python, Rust, and Go, accelerates when the hardest planning logic becomes optional for the read path.

Catalogs become compute. A REST catalog that plans scans is no longer a metadata CRUD service. It parses expressions, walks metadata trees, evaluates policies, caches plans, and streams large result sets. That takes CPU, memory, and capacity planning. Catalog vendors and open source catalog projects now compete on planning latency, cache behavior, and policy expressiveness, not just on which endpoints they expose. This is the layer where differentiation in the Iceberg ecosystem is moving, and remote scan planning is a large part of why.

Agents and small tools benefit most. An AI agent that queries the lakehouse wants exactly what this protocol offers: send a filter, receive an authorized file list with scoped credentials, read the files. No manifest cache, no planning library, no broad storage grants, and every access mediated by a policy-aware service that logs it. If you expect agent-driven access to grow, and I do, the governance properties of server-side planning stop being a nice-to-have.

Notice what stays open. All of this rides an Apache-governed OpenAPI specification. An engine that implements the client once works against every catalog that implements the server. That is the difference between this and the proprietary pushdown APIs of past platforms, and it is why I consider remote scan planning good news for the open lakehouse rather than a recentralization risk. The enforcement point is centralizing. The protocol to reach it is not.

## Failure Modes and the Questions Nobody Has Fully Answered

New architecture, new problems. These are the ones to plan for.

The catalog joins the query hot path. Under client planning, a catalog outage blocks new table resolutions but engines with cached metadata keep working. Under remote planning, the catalog outage stops query planning across the fleet. Availability targets that were fine for a metadata service are not fine for a planning service. Ask your catalog, vendor or self-hosted, what its planning SLO is and what happens during a zone failure.

Planning capacity becomes a shared resource. A thousand concurrent BI queries against client planners consume the BI cluster's resources. The same load against a planning endpoint consumes the catalog's. Without quotas, one team's pathological query pattern degrades planning for everyone. Rate limits, per-principal quotas, and plan caching are the tools, and cache hit rate becomes a first-class metric.

Server and client plans can disagree. During migration you will run both paths, and subtle differences surface: transform evaluation on edge-case values, statistics interpretation for special float values, delete file association ordering. When results differ between an engine using remote planning and one planning locally, debugging spans two codebases and a network boundary. Keep the ability to force client-side planning per query for comparison, and treat plan divergence as a correctness incident, not a curiosity.

Spec drift is real and current. The 1.11 cycle included multiple alignment fixes between the reference implementation and the OpenAPI document, and server implementations note compatibility boundaries explicitly. Gravitino's REST service documents that its plan responses follow the 1.11 API shape and no longer emit the legacy plan task encoding some 1.9 and 1.10 era clients expect. Capability discovery through the catalog configuration response is the mechanism that keeps this sane. Use clients that honor it.

Large plans need spooling discipline. A full scan of an enormous table produces a result set that is itself big data. The plan task pagination exists for this, but a server that materializes entire plans in memory before paging them falls over on exactly the tables where remote planning helps most. This is an implementation quality question to put to your catalog.

Caches and policies interact badly when built casually. A plan cache that keys only on snapshot and filter serves one principal's authorized file list to another. A policy change must invalidate cached plans immediately, not at snapshot expiry, because the snapshot did not change when the policy did. Test this explicitly: change a row policy, replan the same query as the affected principal, and verify the plan shrank. If your catalog cannot demonstrate that behavior, its cache is a vulnerability wearing a performance costume.

Costs move and change shape. Client planning pays for metadata egress and engine CPU, costs buried inside compute bills nobody itemizes. Remote planning pays for catalog compute, catalog memory for caches and spooled plans, and catalog egress for task responses. For most workloads the total drops, since manifests stop crossing the network repeatedly. But the bill lands on a different line item owned by a different team, and finance conversations about "why did the catalog get expensive" go better when you arrive with the metadata egress number it replaced.

Governance enforcement depends on the engine honoring residuals. File-level elimination is enforced by omission, which is airtight. Row-level residual filters rely on the engine applying them. The protocol accounts for policy-aware planning flows, but your security review should trace how your specific catalog verifies engine behavior, and which guarantees are enforcement versus cooperation.

## Where Support Stands Today

A snapshot as of August 2026, because adoption is uneven and the unevenness matters for planning your rollout.

The Java library, and through it Spark, ships the client in 1.11 with backports to Spark 3.4 and 3.5. This is the reference implementation and the most complete. Flink support rides the same core library. PyIceberg 0.11.0 ships synchronous planning with endpoint discovery. The Go library has an open epic and no support yet, with the maintainers explicit that scans currently read manifests locally regardless of server capability. DuckDB's Iceberg extension has an open feature request driven by users who want catalog-enforced policies from DuckDB, and no shipped support at the time I write this.

On the server side, Apache Gravitino ships planning with snapshot-keyed caching. Databricks Unity Catalog and Snowflake's catalog surfaces expose planning as their fine-grained enforcement path for external engines. Other REST catalog implementations, open and commercial, are at varying stages, and the honest guidance is to test the endpoint against your actual catalog version rather than trusting a compatibility matrix, including whatever matrix this paragraph becomes in six months.

That asymmetry shapes strategy. If your fleet is Spark plus Python, you can adopt remote planning now. If DuckDB, Go services, or Rust-based tools are load-bearing, you will run mixed-mode for a while, which means your fine-grained policies are only enforced for the engines that plan remotely. A policy enforced for some engines and not others is a policy with a hole in it, so sequence your rollout: table-level controls everywhere, fine-grained controls gated on the engines that support the protocol, and no assumption that a policy attached in the catalog binds an engine that still plans locally.

## Operational Guidance for Adopting It

Practical steps, in the order I recommend them.

First, inventory read paths by engine and library version, and map each to its planning capability. The mixed-mode hole above is the thing to find before your security team finds it.

Second, enable remote planning on read-heavy, metadata-heavy tables first. Wide tables with many files and frequent small queries show the largest planning wins. Measure planning latency end to end, client observed, not just server reported.

A useful pattern for the second step is an A/B comparison rig. Run a representative query set twice against the same snapshot, once with remote planning enabled and once forced to client planning, and diff both the timings and the planned file lists. Identical file lists plus faster planning is the green light. Differing file lists is a bug report for someone, and far better found by your rig than by an analyst reconciling a dashboard.

In Python, the client side of that rig is short, since PyIceberg 0.11 negotiates capability through the catalog configuration and falls back cleanly when a server lacks the endpoints:

```python
from pyiceberg.catalog import load_catalog

catalog = load_catalog(
    "prod",
    uri="https://catalog.example.com",
    token="<token>",
)

table = catalog.load_table("sales.orders")
scan = table.scan(
    row_filter="order_date = '2026-08-01'",
    selected_fields=("order_id", "customer_id", "total"),
)
tasks = scan.plan_files()
print(len(list(tasks)))
```

The application code is identical under both planning modes, which is the entire point. Whether `plan_files` walked manifests locally or received server-planned tasks is a catalog capability question, invisible above this line, and that invisibility is what makes gradual rollout survivable.

Third, watch three metrics from day one: plan latency percentiles, plan cache hit rate, and catalog planning error rate. Alert on the error rate the way you alert on query failures, because that is what it now is.

Fourth, keep the escape hatch. Per-catalog or per-query configuration to fall back to client planning turns a planning service incident into a performance regression instead of an outage, at least for principals whose access does not depend on server-side enforcement.

Fifth, if governance is your motivation, write down which controls are enforced by omission, files never returned, and which rely on engine cooperation, residual filters applied. Review vended credential scopes and lifetimes while you are at it.

Sixth, sequence the rollout in phases rather than flipping a fleet-wide flag. Phase one: enable on non-critical read workloads with the A/B comparison rig running, two to four weeks, watching plan divergence and latency. Phase two: extend to production BI reads, add the catalog planning error rate to the on-call rotation, and load test the planning endpoint at your peak concurrency plus headroom. Phase three: attach the first fine-grained policies to low-stakes tables, verify enforcement from every engine in inventory, and only then move policies that carry compliance weight. Teams that skip straight to phase three discover their engine coverage gaps in a security review instead of a test plan.

Seventh, document the trust decision. Somewhere durable, record that query correctness for remote-planned reads depends on the catalog service, name the service owner, and link the incident process. Future you, debugging a wrong-results report at 2 a.m., will start at the right layer.

## Where This Is Heading

The direction of travel seems clear to me. The REST protocol keeps absorbing responsibilities that once lived in engines: commits and conflict resolution, credentials, and now planning. Each absorbed responsibility makes engines cheaper to build and catalogs more important to choose well. The v4 format work happening in parallel, with its focus on cheaper metadata updates and single-file commits, compounds this, because a catalog that plans scans over a leaner metadata tree plans them faster.

There is also a quieter consequence for how metadata itself evolves. When only catalogs and reference libraries need to parse manifests, the format gains freedom to change its physical metadata representation without breaking the world. The v4 discussions about restructured metadata trees and Parquet-encoded manifests get easier to ship when most readers reach metadata through the planning endpoint rather than through direct file parsing. Remote planning is, among other things, an abstraction layer that decouples the metadata format's future from the installed base of clients, and format designers have noticed.

I expect three things over the next year. Client coverage fills in, with Rust, Go, and DuckDB support arriving because the demand documented in their trackers is exactly the serverless and governance demand described above. Catalog implementations start publishing planning performance the way engines publish query benchmarks. And fine-grained access control across heterogeneous engines shifts from a proprietary differentiator to an expectation, because the open protocol makes it one.

## Conclusion

Remote scan planning reads like a performance feature and lands like an architecture change. It moves the decision of what a query reads from the engine to the catalog, and every consequence flows from that move: less metadata on the wire, thinner clients, serverless-friendly reads, plan caching, and, most consequentially, a place where fine-grained policy binds every engine at once. It also concentrates trust and load in a service that used to be a bystander, and it demands operational maturity that metadata catalogs never needed. Adopt it with your eyes open, sequence it around your engine coverage, and recognize it for what it is: the moment the Iceberg catalog became the control point of the open lakehouse read path. The teams that internalize that framing now, and choose their catalogs with planning quality, cache correctness, and policy enforcement in the evaluation criteria, are the ones who will find the next three years of this ecosystem working in their favor rather than around them.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg and lakehouse architecture. *Apache Iceberg: The Definitive Guide*, which I co-authored for O'Reilly, covers the metadata tree, catalogs, and scan planning mechanics in depth. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
