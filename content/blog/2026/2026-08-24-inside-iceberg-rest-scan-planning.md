---
title: "The Catalog Can Now Plan Your Iceberg Query: Inside REST Scan Planning"
date: "2026-08-24"
description: "A mechanics walkthrough of Iceberg REST scan planning: client-side planning, remote endpoints, pagination, and where engine support stands in 2026."
author: "Alex Merced"
category: "Apache Iceberg"
canonical: https://iceberglakehouse.com/posts/inside-iceberg-rest-scan-planning/
tags:
  - Apache Iceberg
  - REST catalog
  - scan planning
  - query engines
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/inside-iceberg-rest-scan-planning/).

For as long as Apache Iceberg has existed, one division of labor held constant: catalogs answered "where is the table," and engines figured out everything else. Every query engine that read Iceberg carried its own complete planning machinery, downloading metadata from object storage, pruning it, and deciding which data files to read, while the catalog watched from the sidelines holding a pointer. The Iceberg 1.11 release, the culmination of endpoints added to the REST catalog specification back in 2024 and two years of implementation work, retires that constant. A REST catalog can now plan the scan itself: the engine sends a filter, the catalog walks the metadata, and file scan tasks come back over HTTP.

This article is the mechanics explainer I wish existed when I first traced this protocol. We will walk client-side planning step by step, because you cannot evaluate what moved to the server without knowing exactly what the client did. Then the remote flow, endpoint by endpoint: the plan request and its fields, synchronous and asynchronous modes, the plan lifecycle, task pagination, and capability discovery. Then what a planning server actually does, the trade-offs in a table you can argue with, where engine and catalog support stands in August 2026, and the operational habits that make adoption boring in the good way.

One disclosure up front: I work at Dremio, which builds a query engine and an open catalog based on Apache Polaris, and I co-authored the O'Reilly books on Apache Iceberg and Apache Polaris. The protocol here is an Apache-governed OpenAPI specification, implementable by any catalog and any engine, and that openness is a large part of why it matters.

## The Job Called Scan Planning

Before any flow, fix the job description. A query arrives: read some columns from a table where some predicate holds. Scan planning converts that request into the minimum concrete work list, which files to open, which byte ranges to read, which delete files to apply against them, and which parts of the predicate still need evaluating row by row. Good planning is the difference between a query that reads 40 files and one that reads 40,000, and nothing downstream, no vectorization, no clever join, recovers what bad planning throws away.

Iceberg makes planning tractable through statistics that live in its metadata tree. Every data file was described at write time: how many records, which partition it belongs to, and per-column lower bounds, upper bounds, and null counts. Those descriptions roll up through manifests and manifest lists with partition-level summaries at each level. Planning is the act of walking that tree top down, cutting branches the statistics prove irrelevant, and emitting what survives. The tree walk is the same no matter who performs it. The entire question this article examines is where the walker runs.

It is worth pausing on why the location question stayed settled for so long. Iceberg's founding insight was that a table can be fully defined by immutable files plus one atomically swapped pointer, which let any engine read any table with no service in the middle, and that serverlessness was a feature, maybe the defining one, in a world escaping Hive Metastore bottlenecks. Client-side planning was not an oversight, it was the design. What changed is the surrounding world: tables grew to metadata sizes that strain client memory, fleets diversified past the point where per-engine planning code stays uniformly correct, serverless and embedded consumers arrived with no room for heavy planners, and governance expectations outgrew table-level granularity. The REST protocol had meanwhile put a server in the middle for other reasons, commits, credentials, and once a capable server exists in the path, letting it plan is the natural next negotiation. Understanding remote planning as a response to those pressures, rather than a repudiation of the original design, is the right frame for deciding how much of it your deployment needs.

## Client-Side Planning, Step by Step

Here is the walk as every Iceberg engine has always performed it. Follow the round trips, because they are the cost structure.

Step one, resolve the table. The engine asks the catalog for the table and receives, in essence, a pointer to the current metadata file plus, from a REST catalog, possibly the metadata content itself. This is the catalog's entire traditional involvement, one request, done.

Step two, read table metadata. The metadata file, a JSON document in object storage, carries the schema, partition specs, sort orders, snapshot log, and the current snapshot. The engine now knows the table's shape and which snapshot to plan against, either the current one or one selected by time travel.

Step three, read the manifest list. The chosen snapshot names one manifest list, an Avro file enumerating every manifest in the snapshot. Each entry carries the manifest's partition summaries: per partition field, the range of values covered by the files that manifest tracks. The engine evaluates the query predicate, transformed through the partition spec, against those summaries and drops manifests that cannot contain matches. This is the first pruning level, and on well-partitioned tables it is the big one.

Step four, read the surviving manifests. Each manifest is another Avro file listing data files and delete files with full per-file metadata: partition tuple, record count, file size, and the column statistics. The engine downloads them all. On a table with hundreds of thousands of files, this step is where planning gets expensive: hundreds of megabytes of Avro across hundreds of requests, decoded and held in memory. The Java implementation's documented memory constraints around large planning operations trace directly here.

Step five, prune files. For each file entry, the engine tests the partition tuple against the transformed predicate, then tests the column bounds and null counts against the original predicate. Files that cannot match drop. This is where a filter on `order_date` eliminates the files whose date bounds exclude it, one entry at a time, in engine memory.

Step six, associate deletes. For v2 tables, position and equality delete files must attach to the data files they affect, by partition and sequence number rules. For v3, deletion vectors attach similarly. This association logic is genuinely hard to implement correctly, and it is a place where independent implementations have historically diverged before conformance testing caught them.

Step seven, emit file scan tasks. Each surviving data file, with its byte range, its applicable deletes, and the residual predicate the statistics did not fully resolve, becomes a task. Tasks feed the execution layer, get distributed to workers, and only now does data reading begin.

Count what the engine needed: full metadata-tree parsing code, transform evaluation for every partition transform, statistics semantics for every type, delete association rules across format versions, storage credentials for metadata as well as data, memory proportional to metadata size, and one storage round trip per metadata file touched. Multiply by every engine in your fleet, in every language, kept correct release after release as the format evolves. That multiplication is the tax remote planning targets.

## The Remote Flow, Step by Step

Now the same walk, relocated. The engine resolves the table as before, and then, instead of steps two through seven, sends one request describing the scan: table, optional snapshot, filter expression, column selection. The catalog performs the walk, metadata read, manifest-list pruning, manifest reads, file pruning, delete association, on its side of the network, and responds with the file scan tasks. The engine proceeds directly to execution.

Three things about the relocation are easy to miss on first read.

The filter crosses the wire as structure, not text. The request carries an Iceberg expression serialized as JSON, a tree of operations, terms, and literals, not a SQL fragment. The catalog binds it against the table schema exactly as an engine binds one locally, field IDs and all, which is what keeps remote plans correct across schema evolution and keeps SQL dialect differences out of the protocol entirely.

The response is not "the answer to your query." It is the same file scan tasks step seven produced locally: data file, byte range, applicable delete files, residual expression. Execution still belongs entirely to the engine. Remote planning moves the decision of what to read, never the reading, which is why it composes with any execution architecture from a laptop process to a thousand-node cluster.

And the engine's obligations shrink but do not vanish. It still evaluates residual predicates against rows, still applies deletion vectors and delete files during reads, still needs data-file access, whether through its own credentials or ones the catalog vends alongside the plan. A remote-planning client is thin, not empty.

What disappears from the engine is exactly the expensive middle: manifest downloads, manifest parsing, transform evaluation, statistics pruning, delete association, and the memory to hold it all. What appears is a dependency, the planning endpoint's availability and honesty, which the trade-off section will price properly.

## The Latency Math

Numbers make the relocation vivid, so run the arithmetic on a mid-sized production table: 80,000 data files, 160 manifests at 3 MB each, object storage answering reads in 40 milliseconds at the median. The query filters on a partitioned date column and matches 1,200 files.

Client-side, the walk costs one catalog call, then storage reads: metadata file, manifest list, and, after partition summaries eliminate half the manifests, 80 manifest reads totaling 240 MB. With eight-way parallel fetches, the manifest stage alone runs 10 rounds of 40 ms plus transfer and decode time, and realistic end-to-end planning lands in the two-to-five second range, engine CPU busy throughout, roughly 300 MB of decoded metadata resident at peak. Every engine instance pays this independently. A dashboard with six charts against this table pays it six times, and pays it again on refresh, because engines cannot share what they planned.

Remotely, the engine pays one HTTP round trip carrying a request measured in hundreds of bytes and a response carrying 1,200 tasks, a couple of megabytes. A pass-through server pays the storage reads the client used to pay, once, from a better seat, then amortizes them across every subsequent plan through its manifest cache. A caching or indexing server answers the second identical plan in single-digit milliseconds. The dashboard's six charts trigger six requests that hit one warm cache, and the refresh hits it again. Client planning cost went from seconds-times-instances to milliseconds-times-one, and client memory went from hundreds of megabytes to roughly the size of the task list.

The arithmetic also locates the break-even honestly. A tiny table with three manifests plans locally in a blink, and the HTTP round trip to a distant catalog buys nothing on it. Remote planning's advantage scales with metadata size, query repetition, and client constraint, which is why the canonical wins are big tables, hot dashboards, and small clients, and why a sensible rollout starts where those three overlap.

## The Endpoints, In Detail

The protocol adds a small family of endpoints under the table's REST path, and their design repays close reading because every field encodes a lesson about planning at scale.

Planning begins with a POST to the table's plan resource:

```http
POST /v1/{prefix}/namespaces/{namespace}/tables/{table}/plan
Content-Type: application/json
Authorization: Bearer <token>

{
  "snapshot-id": 8271744332764321989,
  "select": ["order_id", "customer_id", "total"],
  "filter": {
    "type": "and",
    "left":  { "type": "eq",  "term": "region",     "value": "EMEA" },
    "right": { "type": "gt-eq", "term": "order_date", "value": "2026-08-01" }
  },
  "case-sensitive": true,
  "use-snapshot-schema": false,
  "min-rows-requested": 100000
}
```

Field by field. The snapshot ID pins the plan to a specific table state, which is how time travel and repeatable reads work remotely, and omitting it plans against the current snapshot. The selection lists the columns the query projects, letting the server tailor residuals and, on capable servers, skip statistics work for untouched columns. The filter is the bound expression tree discussed above. Case sensitivity governs name resolution during binding. The snapshot-schema flag chooses between the table's current schema and the schema as of the pinned snapshot, the difference mattering exactly when time travel crosses a schema change. And the minimum-rows hint, added to the request schema during the 1.11 cycle, tells the server how much data the client genuinely needs, so a preview query fetching a screenful of rows receives a plan sized for a screenful, not for the table. Every field exists because some real workload needed it, and reading them together gives you the protocol designers' mental model of what a scan request is.

The response comes in one of two shapes, and the server chooses. A synchronous server completes the plan inside the request:

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
        "file-size-in-bytes": 104857600,
        "partition": { "region": "EMEA", "order_date_day": 20666 }
      },
      "delete-files": [],
      "residual-filter": { "type": "gt-eq", "term": "order_date",
                           "value": "2026-08-01" }
    }
  ]
}
```

An asynchronous server responds instead with submitted status and a plan ID, and the client polls the plan's own resource until the work finishes:

```http
GET /v1/{prefix}/namespaces/{namespace}/tables/{table}/plan/{plan-id}
```

Plans move through a defined lifecycle, submitted, completed, failed, or cancelled, and the 1.11 spec work tightened its guarantees, making the plan ID mandatory whenever a plan reports submitted, so a client can always follow up on work it started. A DELETE on the plan resource cancels it, which matters more than it sounds: a user abandoning a dashboard should be able to abandon the expensive plan the dashboard triggered, and cancellation is how planning capacity gets reclaimed instead of burned on answers nobody is waiting for.

The third piece handles scale. A plan over a huge table produces file scan tasks by the hundred thousand, too many for one response body on either side's memory budget. The protocol's answer is the plan task, an opaque handle representing a chunk of the completed plan. A large completed plan returns plan tasks rather than raw file scan tasks, and the client exchanges each handle at the tasks endpoint:

```http
POST /v1/{prefix}/namespaces/{namespace}/tables/{table}/tasks
Content-Type: application/json

{ "plan-task": "opaque-task-handle-0001" }
```

Each exchange yields that chunk's file scan tasks, and a chunk can itself point onward when results keep flowing. The opacity is deliberate: the handle's contents belong to the server, freeing implementations to encode whatever resumption state suits them, and distributed engines exploit the design by distributing the handles themselves, each worker redeeming its own chunk, so even plan retrieval parallelizes across a cluster.

Two response details reward attention before moving on. The residual filter in each task is the contract about shared work: the server pruned at file granularity using statistics, and the residual names what remains for the engine at row granularity. A residual of true means statistics fully resolved the predicate for that file, and every row in it matches. And the delete-files array means delete association, step six of the client walk and the subtlest logic in it, arrived pre-solved. New client implementations get to be correct about deletes by receiving correctness rather than reimplementing it.

## Handling the Three Response Shapes Well

A client meets three shapes, completed inline, submitted for polling, and completed-with-spooling, and the difference between a good integration and a flaky one is mostly how it handles the second and third. The patterns worth building in from the start:

For polling, respect the server's pacing and bound your patience. Poll intervals should back off rather than hammer, honor any retry-after guidance the server sends, and carry a deadline after which the client cancels the plan explicitly rather than walking away. The explicit cancel matters: an abandoned submitted plan is server work with no consumer, and a client that cancels what it stops wanting is a client that keeps shared planning capacity healthy. Timeouts without cancellation are how planning services accumulate ghost work under load, precisely when they can least afford it.

For spooled results, stream rather than accumulate. Redeem plan tasks as execution consumes them instead of materializing the full task list up front, keep redemption idempotent so a retried exchange after a network blip does not double-schedule files, and in distributed engines, ship the opaque handles to workers rather than centralizing redemption on the driver, which reintroduces the bottleneck the design removed. The handles are opaque on purpose, and the one liberty a client must never take is peeking: encode nothing about their contents into your logic, because servers own that format and will change it.

For all three shapes, distinguish retryable from diagnostic failures. A transient network error retries the same request safely, planning is read-only, while a failed plan status is the server telling you the plan itself is unworkable, and re-submitting it unchanged converts one failure into a loop. Log the plan ID with every planning interaction end to end, because when the server team and the engine team meet over an incident, the plan ID is the join key between their telemetries, and integrations that log it resolve incidents in hours that cost the others days.

## Capability Discovery: How Clients Know What Servers Speak

A protocol that upgrades gradually across an ecosystem needs a way for parties to discover each other's vocabulary, and the REST specification's answer lives in the catalog's configuration response. When a client connects, the server's config can enumerate the endpoints it supports. A client checks the scan planning endpoints against that list before relying on them, and falls back to local planning, the full client-side walk, when the server does not advertise them. PyIceberg 0.11 implements exactly this posture: consult the advertised endpoints, use server planning where offered, degrade cleanly where not, and surface a clear error rather than a mystery when asked to use something absent.

The discovery mechanism is what makes mixed environments livable, and mixed environments are the only kind that exist during a protocol rollout. One application, one codebase, can face a Polaris-based catalog that plans, a legacy REST shim that does not, and a vendor catalog mid-upgrade, and behave correctly against all three without configuration branching. It also defines the graceful-degradation story for operations: turning planning off at the server, during an incident, say, downgrades clients to local planning rather than breaking them, provided the clients kept their local path functional. Which is the quiet argument for engines to keep both paths alive for a long while yet, whatever their default.

Version skew still finds edges that discovery does not cover. Server implementations note compatibility boundaries against specific client generations, Apache Gravitino's REST service, for instance, documents emitting the 1.11-era structured plan results and not the transitional encodings some 1.9 and 1.10 era clients expected. The alignment fixes that ran through the 1.11 cycle, reconciling the reference implementation with the OpenAPI document field by field, are the maturation cost every wire protocol pays once real implementations meet. The practical guidance is unexciting and reliable: pair current clients with current servers, read your catalog's stated compatibility range, and test the pairing you run rather than the pairing the matrix implies.

## What a Planning Server Actually Does

The protocol constrains the conversation, not the server's internals, and server internals are where implementations will differentiate for years. A tour of the responsibilities, in execution order, doubles as an evaluation checklist for any catalog you are considering.

Binding and validation first. The server resolves the filter's term names against the schema, at the right snapshot, honoring case sensitivity, producing the same bound expression an engine's local planner builds. Binding to field IDs rather than names preserves correctness across renames, and rejecting malformed or unbindable expressions early, with errors that name the offending term, separates pleasant implementations from maddening ones.

Transform projection second. Predicates on source columns become predicates on partition values through the spec's transform projection rules, `order_date >= X` becoming a bound on `days(order_date)`, so manifest and file partition pruning can run. Multi-argument transforms and every future transform the format adds now land in server code once, rather than in every engine forever.

Metadata traversal third, and here the implementation spectrum is widest. A pass-through server performs the same reads a client performs, manifest list, manifests, from a better seat: co-located with storage, connections pooled, caches warm across requests. A caching server keeps decoded manifest structures resident, keyed by path, exploiting manifest immutability for perfect cache validity. An indexing server maintains its own queryable representation of file statistics and never touches Avro at plan time. All three are spec-compliant, their differences visible only as latency, and "how do you traverse metadata" is the single most revealing question to ask a catalog vendor about this feature.

Result shaping fourth: applying the row-count hint, computing residuals per file, resolving delete association, and deciding between inline results and spooled plan tasks. Spooling raises the operational questions that make platform engineers useful: where chunks live, how long, what survives a server restart, what reclaims abandoned plans. Boring questions, and the difference between a planning service and a planning demo.

And wrapped around everything, identity. The bearer token authenticates a principal, and the plan executes as that principal: which snapshots are visible, which files are returned, what credentials get vended alongside tasks. This is where planning meets governance, the catalog returning to each principal only what policy allows, and it is the aspect I have examined at length elsewhere. For this article's purpose, one operational consequence matters: anything the server computes per principal must be cached per principal. A plan cache keyed by snapshot and filter alone, ignoring identity, serves one principal's authorized plan to another, and no latency win justifies that bug. Put the cache-key question on the evaluation checklist, near the top.

## Credentials Ride With the Plan

One server responsibility deserves its own section, because it completes a security story the REST protocol has been assembling for years. Iceberg REST catalogs already support credential vending, issuing engines short-lived, scoped storage credentials at table load instead of requiring long-lived keys on every cluster, and remote signing, where the catalog signs individual storage requests and the engine never holds credentials at all. Scan planning slots into that progression as its sharpest refinement: credentials scoped not to a bucket, not to a table, but to a plan.

The mechanics follow naturally from the flow. The server, having just computed exactly which files this principal's scan touches, is holding the perfect information for minimal credential scope, and vending storage credentials alongside the task list, valid for those files, for a lifetime matched to plan execution, costs it little. The engine reads its files, the credentials age out, and the exposure window from any leak shrinks to a file list and a clock. The Go library's tracking issue names this capability explicitly among its goals, per-scan vended credentials with plan-scoped lifetimes, which tells you the client ecosystem considers it part of the feature, not an extra.

For platform teams, the operational consequence is a credential model worth redesigning around. Fleets that today distribute bucket-wide read keys to every engine cluster, because coarse keys were the only administrable option at fleet scale, can converge on a model where durable storage credentials exist in exactly one place, the catalog, and everything downstream lives on scoped, expiring grants tied to planned work. Audit trails improve for free, every grant corresponds to a logged plan by a named principal, and credential rotation stops being a fleet-wide coordination event. Of the protocol's quieter benefits, this one has the best ratio of security improvement to migration effort, and it deserves more attention than it gets in the performance-centric coverage.

## The Trade-offs, Priced

Every architectural relocation trades one set of costs for another, and this one deserves an honest ledger rather than advocacy. Here is mine:

| Dimension | Client-side planning | Remote scan planning |
|---|---|---|
| Planning round trips | One per metadata file touched | One, plus task pages |
| Metadata over the network | Manifest sets, repeatedly, per engine | Matched tasks only |
| Engine memory during planning | Proportional to metadata size | Proportional to task pages |
| Planning code maintained | Per engine, per language | Server plus thin clients |
| Delete association correctness | Reimplemented everywhere | Solved once, served |
| Cross-user amortization | None | Server-side plan caching |
| Fine-grained policy point | Per engine, inconsistent | Planning time, uniform |
| Metadata exposure to clients | Entire table layout | Authorized tasks only |
| Catalog availability requirement | Table resolution only | Every plan, every query |
| Catalog compute requirement | Trivial | Real, and yours to size |
| Correctness verification | Engine checks everything | Engine trusts the plan |
| Blast radius of a planner bug | One engine version | Every consumer of the catalog |

The first eight rows explain the momentum: less traffic, less memory, less duplicated code, shared caching, and an enforcement point that finally covers heterogeneous fleets uniformly. The last four rows are the invoice, and each deserves a sentence of respect. Availability: a service that was consulted once per table resolution is now consulted once per query, so its outage budget becomes your query outage budget. Compute: planning work did not disappear, it moved onto hardware someone must provision, monitor, and scale. Trust: an engine that plans locally verifies the metadata tree itself, while an engine consuming remote plans inherits whatever the server concluded, correct or not. And blast radius: a pruning bug in one engine release used to hurt that engine's users, while a pruning bug in a shared planning server hurts everyone downstream at once, quietly, in the form of wrong results.

None of the invoice lines is a reason to refuse the feature. All of them are reasons to adopt it like infrastructure rather than like a config flag: with SLOs on the planning endpoint, capacity planning for its compute, comparison testing during rollout, and a rehearsed fallback. The next sections cover the how.

## Where Support Stands in August 2026

The honest map, engine side first. The Java library carries the reference client as of 1.11, wired into Spark, with backports bringing the capability to Spark 3.4 and 3.5, so current Spark users adopt it as configuration rather than migration. Flink rides the same core. PyIceberg 0.11 ships synchronous planning with the discovery-and-fallback behavior described earlier. The Go library has an open epic and, by its own maintainers' summary, no support yet, scans read manifests locally regardless of server capability, with the tracked motivations reading like this article's benefits section: manifest-free scans of any table size, stateless operation from serverless runtimes, server-enforced governance, plan-scoped credentials. DuckDB's Iceberg extension has an active feature request, driven by users wanting catalog-enforced policies from DuckDB sessions, and no shipped support as I write.

Server side. Apache Gravitino's Iceberg REST service ships planning with a snapshot-keyed plan cache and pluggable cache backends. Databricks documented Unity Catalog enforcing attribute-based access control on external engines specifically through the 1.11 scan planning client, and Snowflake documented policy enforcement for external Spark access through the same endpoints, which means the two largest commercial catalogs treat this protocol as their fine-grained enforcement path for engines they do not own. Across the broader field of REST catalog implementations, open source and commercial, support is arriving unevenly, and the only durable advice is to probe the endpoint on the catalog version you actually run: check the advertised endpoints in the config response, plan a small scan, and believe the wire over the datasheet.

The asymmetry between sides matters for sequencing. Spark-and-Python shops can go now. Fleets leaning on DuckDB, Go services, or other native readers will run mixed for a while, local planning for some engines, remote for others, and mixed mode has a governance implication worth stating bluntly: a fine-grained policy enforced at planning time binds only the engines that plan remotely. Until your slowest-moving reader adopts the client, the policy has a gap shaped exactly like that reader, and your rollout plan should name it.

## Trying It Yourself

The fastest way to internalize a protocol is to speak it, and this one speaks over plain HTTP. Against any catalog advertising the endpoints, a terminal session tells you most of what this article has:

```bash
# 1. What does the server support?
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://catalog.example.com/v1/config?warehouse=prod" \
  | jq '.endpoints'

# 2. Plan a filtered scan
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "https://catalog.example.com/v1/prod/namespaces/sales/tables/orders/plan" \
  -d '{
        "filter": {"type":"eq","term":"region","value":"EMEA"},
        "select": ["order_id","total"]
      }' | jq '."plan-status", (."file-scan-tasks" | length)'
```

The first command answers the discovery question directly, look for the plan and tasks endpoints in the list. The second returns either a completed plan whose task count you can sanity-check against expectations, or a submitted status with a plan ID to poll, telling you which mode the server chose. Change the filter's selectivity and watch the task count move, which is server-side pruning made visible, the whole feature in one number.

From Spark, the same capability is one catalog property away, and the experiment worth running on day one is the comparison: the identical query with remote planning enabled and disabled, diffing planning time and, more importantly, the planned file sets. Matching file sets with better latency is the green light. Divergent file sets, either direction, is a finding to chase before production traffic depends on the answer, because one of the two planners is wrong.

```properties
spark.sql.catalog.prod = org.apache.iceberg.spark.SparkCatalog
spark.sql.catalog.prod.type = rest
spark.sql.catalog.prod.uri = https://catalog.example.com
spark.sql.catalog.prod.rest.scan-planning-enabled = true
```

Run the comparison across your ugliest real predicates, not toy ones: the nested boolean monsters BI tools generate, filters on columns with skewed statistics, time travel against old snapshots spanning schema changes. Planner disagreements live in edges, and your production queries know where the edges are better than any test suite does.

The Python path is equally short, and usefully different: PyIceberg negotiates capability through discovery, so the same code exercises whichever planning mode the server offers, which makes it a convenient probe against a catalog whose support status you are unsure of:

```python
from pyiceberg.catalog import load_catalog

catalog = load_catalog("prod",
                       uri="https://catalog.example.com",
                       token="<token>")

table = catalog.load_table("sales.orders")
tasks = table.scan(
    row_filter="region = 'EMEA' and order_date >= '2026-08-01'",
    selected_fields=("order_id", "total"),
).plan_files()

print(sum(1 for _ in tasks))
```

Point it at two catalogs, one that advertises planning and one that does not, and the identical script demonstrates the whole compatibility story: same code, same answer, different machinery underneath, chosen per server. That invisibility is what a well-designed capability negotiation buys, and seeing it work once builds more trust in the rollout than any amount of documentation.

## Operating It

The habits that separate calm adopters from incident reports, condensed.

Treat the planning endpoint as tier-one infrastructure from the first production query. Its latency percentiles, error rate, and, where the server exposes it, cache hit rate belong on the same dashboard as query success rate, with alerts owned by whoever answers for query availability. A planning outage is a query outage now, and monitoring should say so before users do.

Load test at planning granularity, not query granularity. Peak concurrent plans, not peak concurrent queries, size the service, and the two diverge badly on dashboard-heavy workloads where a single refresh fans out into dozens of plans. Find the knee of the planning service's throughput curve on your metadata, at your file counts, before the Monday morning your BI tool finds it for you.

Keep the fallback rehearsed. Client-side planning remains in every major engine, and a per-catalog or per-job switch back to it converts a planning-service incident into a latency regression. Rehearse the switch quarterly the way you rehearse restores, and remember its governance asymmetry: principals whose access depends on server-side enforcement cannot fall back, by design, so the fallback plan needs a policy answer, not just a config answer.

Watch task-page pathologies. Very large plans stress the spooling path, and client behavior under many-paged plans, memory, retry storms on a flaky link, abandoned plans left unreclaimed, is where the sharp edges live early. Cap result sizes where the workload allows, use the row-count hint aggressively for interactive traffic, and confirm the server reclaims what clients abandon.

And version deliberately. Pin client and server versions in the same change process, read release notes for spec-alignment fixes the way you read them for CVEs, and when the config response and the documentation disagree about capabilities, believe the config response, it is the server describing itself.

Finally, give the moved costs an owner. Planning compute, cache memory, and spooling storage now accrue to the catalog's budget line, and the metadata egress they replaced disappears from the engines' lines, so the platform's cost picture shifts between teams even when the total falls. Establish per-principal or per-team attribution on planning traffic early, both because chargeback conversations arrive eventually and because attribution is also your quota mechanism when one team's query generator discovers it can request ten thousand plans a minute. The same meter serves the accountant and the rate limiter, and building it on day one costs a fraction of retrofitting it during the incident that proves its necessity.

For catalog evaluations specifically, the questions that separate mature planning implementations, gathered from every section above: how is metadata traversed at plan time, and what is cached across plans? What are the components of the plan cache key, and is principal identity one of them? How are large plans spooled, with what lifetime, and what reclaims abandoned ones? What does the server do under planning overload, queue, shed, or degrade? Which client generations is the current release tested against? And what per-principal telemetry exists on planning traffic? Six questions, thirty minutes of a vendor call, and you will know more about the implementation than most reference customers do.

## Where This Goes

Three trajectories seem well set. Client coverage completes: the Go, Rust, and DuckDB gaps are tracked, motivated, and shaped by demand from exactly the serverless and governance use cases the protocol serves best, and closing them converts today's mixed-mode complexity into yesterday's problem. Server competition sharpens: with the conversation standardized, catalogs differentiate on traversal strategy, cache design, policy expressiveness, and tail latency, which is to say on engineering, and published planning benchmarks will follow as surely as query benchmarks did. And the protocol's role widens quietly: once the planning endpoint mediates most reads, the format underneath gains freedom to evolve its physical metadata, the v4 work on restructured, columnar metadata being the immediate beneficiary, because a metadata layout consulted mostly by servers can change without breaking a world of clients.

The deeper trajectory is the one this article opened with. The division of labor between catalogs and engines, fixed since Iceberg's beginning, is now negotiable per deployment, and the negotiation has a direction: responsibilities that benefit from central placement, consistency, caching, policy, credential scoping, keep flowing toward the catalog, over an open protocol that keeps every engine invited. Scan planning is the largest responsibility to make the trip so far. I doubt it will be the last.

## Conclusion

Remote scan planning relocates the oldest job in Iceberg's architecture. The metadata walk that every engine performed alone, metadata file to manifest list to manifests to file scan tasks, now runs, optionally, inside the catalog, reached through a small family of REST endpoints with synchronous and asynchronous modes, a defined plan lifecycle, paginated results, and capability discovery to keep mixed fleets sane. The engine sends an expression and receives a work list, thinner clients and shared caching on one side of the ledger, availability, compute, and trust obligations on the other. Learn the endpoints, run the comparison test, price the invoice honestly, and the feature earns its place as quiet infrastructure, which is the highest compliment a protocol gets.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg and lakehouse architecture. *Apache Iceberg: The Definitive Guide*, which I co-authored for O'Reilly, covers the metadata tree and scan planning mechanics this protocol builds on, and *Apache Polaris: The Definitive Guide* covers the catalog side of the story. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
