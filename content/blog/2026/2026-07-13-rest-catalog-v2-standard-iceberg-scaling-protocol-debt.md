---
title: "REST Catalog V2: Fixing Iceberg Protocol Debt"
date: "2026-07-13"
description: "An in-depth exploration of rest catalog v2: fixing iceberg protocol debt"
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - REST Catalog v2
  - Iceberg
  - Protocol
  - Data Engineering
canonical: "https://iceberglakehouse.com/posts/rest-catalog-v2-standard-iceberg-scaling-protocol-debt/"
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/rest-catalog-v2-standard-iceberg-scaling-protocol-debt/).

A single BI dashboard refresh can trigger dozens of catalog calls before a single byte of table data is scanned. An AI agent investigating a revenue anomaly can trigger hundreds. Each of those calls loads a namespace, resolves a table identifier, fetches a metadata pointer, reads the current metadata file, and vends temporary credentials. When one analyst ran one query, that overhead was invisible. Now that engines, semantic layers, and autonomous agents all hammer the same [Apache Iceberg REST catalog](https://iceberg.apache.org/rest-catalog-spec/) at once, the overhead is the bottleneck. The scan is fast. Getting ready to scan is slow.

That gap between planning cost and execution cost is what I want to work through here. The Iceberg REST catalog protocol solved a real problem: it replaced a pile of engine-specific catalog integrations with one HTTP contract that Spark, Flink, Trino, Dremio, and others can speak. But the first version of that contract was designed for a world with fewer clients issuing fewer, larger queries. The workloads have changed. The protocol is starting to show its age in ways that are worth naming precisely.

A note on scope before going further. There is forward-looking language circulating about a "REST Catalog V2" that would formalize batching, stateless access, and richer capability exchange. Some of that maps to accepted work in the Iceberg project, and some of it maps to active proposals and a design direction rather than a finalized, released specification. I will treat it as a design direction throughout, because the interesting part is the set of problems being solved, not a version number that may or may not ship exactly as described. When I say "V2" below, read it as "the next phase of REST catalog design," not a GA release you can pin a dependency to today.

## Why REST Catalog Scaling Matters Now

The Iceberg REST catalog started as a name service with teeth. Instead of every engine embedding its own logic for talking to Hive Metastore, Glue, or a JDBC catalog, the [REST catalog OpenAPI spec](https://github.com/apache/iceberg/blob/main/open-api/rest-catalog-open-api.yaml) gave everyone a shared HTTP surface: list namespaces, load a table, commit a snapshot, vend credentials. That standardization was the point, and it worked. A table created by Spark can be read by Trino and governed by a central catalog without custom glue on each side.

The traffic pattern that protocol was tuned for looked like this: a handful of long-running ETL jobs and a moderate number of interactive queries, each of which loaded a small number of tables and then spent most of its wall-clock time reading data. Catalog calls were a rounding error against scan time.

Three things changed that balance.

First, the number of engines went up. A single lakehouse commonly serves Spark for batch, Flink for streaming, Trino or Dremio for interactive SQL, plus notebooks, ingestion tools, and observability jobs. Every one of them is a catalog client, and every one issues its own loads.

Second, semantic layers multiplied the table count per query. A BI query that looks like "revenue by region last quarter" does not touch one table. It touches a view built on a fact table, several dimension tables, a fiscal calendar, and maybe a currency reference. Each physical table under that view is a separate catalog load unless the engine already has it cached.

Third, and most importantly, AI agents arrived with a fundamentally different access shape. An agent does not issue one query. It explores. It inspects a table, looks at its columns, checks a related table, forms a hypothesis, runs a query, gets a surprising result, and inspects three more tables to explain it. This is a stream of many short interactions, each with its own metadata resolution. The ratio of catalog calls to scanned bytes for an agent workflow is nothing like the ratio for a nightly ETL job. Agents are metadata hungry in a way batch pipelines never were.

Put those together and the catalog stops being a rounding error. It becomes a shared dependency that every engine, every dashboard, and every agent hits constantly, and its per-call cost now shows up directly in planning latency.

## The Protocol Debt in REST Catalog V1

Call the accumulated cost "protocol debt": design choices that were correct for the original workload and expensive for the current one. Four specific sources.

**Round trips.** Loading a table in the V1 model is a sequence of calls. Resolve the namespace, load the table metadata, and in many deployments make a separate call to vend the storage credentials the engine needs to actually read files. For one table that is fine. For a query planner resolving fifteen tables behind a semantic view, that is a burst of serialized HTTP requests, each carrying its own connection setup, TLS handshake amortization, auth token validation, and JSON parse. The engine often cannot start planning the join until the last one returns.

**Metadata payload size.** A table's metadata is not small. It carries the full schema, partition specs, sort orders, snapshot history, and table properties. When an engine loads a table it frequently receives the whole current metadata document even when it only needed the current schema and the pointer to the latest snapshot. For a wide table with a long snapshot history, that payload can be substantial, and it is transferred and parsed on every cold load.

**Serialization overhead.** The protocol is JSON over HTTP, which is the right call for interoperability and debuggability. The tradeoff is that JSON serialization and deserialization are not free at high call volume. Parsing thousands of metadata documents per minute across a fleet of engines burns CPU on both the catalog server and every client, and it inflates the wire size compared to a binary format.

**Planning latency as the real cost.** This is the point to hold onto. The bottleneck is not the object store's scan throughput. Object stores are fast and parallel. The bottleneck is the coordination that happens before the scan: resolving every table, fetching every metadata file, vending every credential, and doing it call by call. For an interactive dashboard or an agent that expects sub-second responsiveness, hundreds of milliseconds spent in serial catalog resolution is the difference between a snappy experience and a sluggish one.

None of these are bugs. They are the natural shape of a protocol optimized for correctness and simplicity over high-concurrency, many-table planning. The next phase of design is about paying that debt down without breaking the interoperability that made the protocol valuable in the first place.

## What Batch Table Loading Changes

The single highest-impact change under discussion is native multi-table batch loading: letting an engine ask for the state of several tables in one request instead of one request per table.

Work through the revenue example concretely. An analyst, or an agent acting on their behalf, asks: "Why did net revenue in the Western region drop last quarter?" To plan that, the engine needs the fact table `orders`, plus `customers`, `regions`, `products`, and a `fiscal_calendar`. In the V1 model that is at least five table loads, likely interleaved with five credential vends, issued more or less serially because the planner discovers the dependency graph as it resolves the view.

With batch loading, the engine issues one request naming all five tables and receives their metadata and credentials together. Here is the shape of the difference, expressed as pseudo-requests.

```
# V1-style: one round trip per table
GET /v1/namespaces/analytics/tables/orders
GET /v1/namespaces/analytics/tables/customers
GET /v1/namespaces/analytics/tables/regions
GET /v1/namespaces/analytics/tables/products
GET /v1/namespaces/analytics/tables/fiscal_calendar
# plus separate credential vending calls per table

# Batched planning: one round trip
POST /v2/namespaces/analytics/tables:batchLoad
{
  "tables": ["orders", "customers", "regions",
             "products", "fiscal_calendar"],
  "include": ["metadata", "credentials"]
}
```

The wins compound. You collapse many round trips into one, which removes serial network latency from the critical path of planning. You give the catalog server a chance to fetch related metadata more efficiently on its side, since it now knows the full set up front. And you cut the total number of requests the catalog fleet has to handle, which matters for the catalog's own scalability.

The workloads that benefit most are exactly the ones growing fastest: federated queries that span sources, star schemas where every query fans out across dimensions, semantic layers that resolve into many physical tables, and agent investigations that inspect several datasets in a tight loop. These are the metadata-hungry patterns, and batching attacks their dominant cost directly.

The honest limitation: batching helps cold loads and reduces round trips, but it does not eliminate the need for good client-side caching, and it does not help a workload that genuinely touches thousands of distinct tables with no overlap. Batching is a coordination optimization, not a magic reduction in the amount of metadata that fundamentally has to move. It is most valuable precisely when a query or an agent touches a bounded, related set of tables, which is common but not universal.

There is a second-order benefit worth spelling out. When the catalog knows the full set of tables a planner is interested in, it gains the ability to return consistent state across them. Consider an agent that reads `orders` and `customers` a few milliseconds apart in the V1 model. Between those two loads, a commit could land that changes one and not the other, leaving the agent reasoning about a snapshot of the world that never actually existed as a coherent whole. A batch load gives the catalog a natural point at which to serve a consistent view of the requested tables. That consistency is not free and not always required, but for correctness-sensitive analytics it is a real advantage that per-table loading cannot offer at all. The engine gets tables that agree with each other, not tables sampled at slightly different moments.

## Caching and Metadata Freshness

Batching reduces the cost of a cold load, but the fastest catalog call is the one you never make. That is why any serious conversation about REST catalog scaling has to include caching, and why the protocol needs to help clients cache correctly rather than forcing them to guess.

The core problem with caching Iceberg metadata is knowing when it is stale. A table's metadata is immutable per snapshot, which is a gift: if a client has loaded snapshot N of a table, that snapshot will never change, so the client can cache the metadata for it forever. What changes is the pointer to the current snapshot. So the expensive, cacheable payload is the metadata itself, and the cheap, volatile thing is "which snapshot is current." A protocol that lets a client ask the small question, "is my cached snapshot still current," without re-fetching the large metadata document is doing exactly the right thing.

This maps onto standard HTTP mechanics well. Entity tags and conditional requests let a client say "I have version X, tell me if it changed," and receive a small "not modified" response when it has not. Applied to catalog loads, that turns a large, repeated metadata transfer into a tiny freshness check for the common case where nothing has moved. For a dashboard that refreshes every thirty seconds against tables that update hourly, the difference between re-transferring full metadata every refresh and confirming a cheap freshness check is enormous at fleet scale.

The tradeoff to hold honestly is staleness tolerance. Aggressive caching means a client might plan against a snapshot that is a few seconds behind the true current one. For most analytical and BI workloads that is completely acceptable and often desirable, because it trades a sliver of freshness for a large drop in latency and load. For workloads that require read-your-writes consistency, the client needs a way to bypass the cache and force a fresh resolution. The protocol's job is to make both modes expressible, so a client can choose fast-and-slightly-stale or fresh-and-slightly-slower per request rather than being locked into one behavior. Getting that choice into the client's hands is more valuable than any single caching default.

## Stateless Catalog Servers and Serverless Compute

The second design theme is statelessness. A catalog server that keeps no per-client session state between requests is dramatically easier to operate at scale, and it fits the compute model that most lakehouse workloads are moving toward.

The argument is straightforward. If every request carries everything the server needs to handle it, and the server keeps nothing sticky between requests, then you can put any number of identical catalog instances behind a standard load balancer and route requests wherever there is capacity. No session affinity, no sticky routing, no coordination between instances to share session data. Add instances when traffic climbs, remove them when it falls, and the client never knows or cares which instance answered.

This matters especially for serverless and short-lived compute. When an engine spins up a query worker for a few seconds and tears it down, that worker cannot afford to establish and warm a stateful session with the catalog. It needs to make a self-contained, authenticated request and get an answer. Stateless design is what makes that cheap. It is also what makes autoscaling the catalog itself practical, because there is nothing to drain or migrate when you remove an instance.

Statelessness also improves failure recovery. If catalog requests are idempotent and self-contained, a client that hits a timeout or a dead instance can simply retry against another instance. There is no session to reconstruct and no partial state to reconcile. For a system that many engines depend on, that retry-anywhere property is worth a lot of operational calm.

There is a design tension worth acknowledging. Some optimizations, like server-side caching of hot metadata or connection pooling to underlying storage, are easier when the server holds state. A strictly stateless contract pushes some of that responsibility to the client and to shared caches. The resolution in practice is to keep the protocol stateless at the request contract level while allowing implementations to cache aggressively behind it, so the scalability property holds without giving up performance. The contract is stateless; the implementation can still be smart.

## Multi-Engine Optimization Without Vendor Lock-In

If the catalog is going to help engines plan more efficiently, where should the line be? This is the question that decides whether the standard stays open or quietly becomes a lock-in vector.

A catalog can legitimately do more than resolve names. It can advertise capabilities so an engine knows whether batch loading is supported before it tries. It can expose optimization hints derived from metadata, like partition statistics or which snapshots are pinned. It can coordinate credentials and table properties consistently across every engine that connects. All of that is standard metadata and capability exchange, and all of it helps every engine equally.

The line to hold is this: the catalog should not become the place where query planning logic lives. The moment a catalog starts embedding engine-specific planning behavior, or worse, planning behavior that only one vendor's engine knows how to consume, the open standard fractures. You get a catalog that technically speaks REST but in practice only performs well with one engine, which defeats the entire reason the REST catalog existed.

So the right boundary is: standard, engine-neutral metadata and capability exchange in the protocol; query planning in the engines. The catalog tells every engine the same true facts about the tables. Each engine decides what to do with those facts using its own planner. That keeps the door open for Spark, Flink, Trino, Dremio, and whatever comes next to compete on execution quality while sharing one honest, fast source of metadata truth. Open standards are only valuable if they stay neutral, and neutrality is a design constraint you have to defend on purpose.

## Migration Plan for Existing REST Endpoints

None of this is worth much if adopting it means a flag-day cutover across every engine at once. Nobody runs a lakehouse where every client can be upgraded simultaneously. A realistic rollout is incremental and reversible.

Here is the sequence I would follow.

- **Run V2 endpoints alongside V1.** Add the new batch and capability endpoints without removing or changing the existing ones. Old clients keep using V1 paths and notice nothing. New clients opt into V2 paths.
- **Keep identifiers and auth stable.** Table identifiers, namespace structure, and authentication flows should not change. The migration is about how metadata is fetched, not about renaming things or reissuing credentials. If a client's tokens and table names stay valid, the blast radius stays small.
- **Advertise capabilities, do not assume them.** A client should discover whether an endpoint supports batch loading and negotiate accordingly, falling back to V1-style per-table loads when talking to a catalog that has not been upgraded yet. This is what lets a mixed fleet work during the transition.
- **Roll out client support engine by engine.** Upgrade one engine to use V2 batch loading, watch it in production, then move to the next. Do not couple the upgrades. Each engine is an independent, reversible step.
- **Observe before you require.** Track catalog latency, request counts, error rates, and planning time before and after each engine adopts V2. You want evidence that batching actually reduced round trips and cut planning latency for your workloads, not just faith that it should.
- **Keep rollback paths.** Because V1 endpoints remain live, rolling an engine back is a config change, not a migration reversal. That safety net is what makes the whole thing low-risk enough to actually do.

The table below maps each V1 pain point to the design response and what it means for the person operating the catalog.

| V1 pain point | V2 design response | Operator impact |
| --- | --- | --- |
| Many serial round trips per query | Batch multi-table load in one request | Lower planning latency, fewer requests to size for |
| Large metadata payloads on every load | Fetch only needed fields, batched | Less wire traffic and client CPU on cold loads |
| Sticky server state limits scaling | Stateless request contract | Horizontal scaling behind a plain load balancer |
| Ad hoc engine assumptions | Explicit capability advertisement | Safe mixed-version fleets, cleaner fallback |
| Hard cutovers | Dual V1/V2 endpoints | Engine-by-engine rollout with easy rollback |

The migration story is deliberately boring, and that is the point. The interesting engineering is in the protocol; the rollout should be uneventful.

## Why This Strengthens the Agentic Lakehouse

Zoom out to why any of this matters for how modern data platforms are built. The value of a lakehouse that agents and BI tools can both use depends on fast, governed, multi-engine access to metadata. Every improvement that lowers planning latency and cuts catalog overhead makes the whole system more responsive precisely where responsiveness is felt: interactive dashboards and agent loops.

This is where Dremio's approach lines up with the direction the standard is heading. Dremio is a data platform built for and managed by AI agents, running on open standards: Apache Iceberg for table format, Apache Arrow for in-memory processing, and Apache Polaris for the open catalog. Its [Open Catalog architecture](https://www.dremio.com/blog/the-brain-of-the-agentic-lakehouse-inside-dremios-open-catalog-architecture/) sits on Apache Polaris, so the same catalog improvements that help the broader ecosystem help Dremio users too. That is the correct framing: nobody owns the standard, and the standard getting faster is good for every engine that speaks it.

Dremio adds the pieces that turn fast metadata access into fast answers. Its federated query engine can query data in place across sources and federate during a migration, so you are not blocked waiting for everything to land in one place. Reflections and Autonomous Reflections accelerate repeated query patterns without you managing materializations by hand. The C3 cache keeps hot data close to compute. Fine-grained access control governs who sees what. And because it is AI-native, with a built-in AI Agent, AI SQL functions, and an open-source MCP server, the metadata-hungry agent workloads that make catalog scaling matter are first-class citizens rather than an afterthought.

The through line is open standards and no lock-in. A faster, statelessly scalable, batch-capable REST catalog is good for the ecosystem regardless of which engine you run, and it is especially good for workloads where an agent inspects many tables to answer one question. The data foundation, open and fast and governed, is what makes agentic analytics dependable. The model on top matters less than the metadata underneath being trustworthy and quick.

If you want to see what a lakehouse built on these open standards feels like in practice, with an open catalog, query federation, and agent-ready metadata access, start at [dremio.com/get-started](https://www.dremio.com/get-started) and connect it to your own Iceberg tables. Point it at a real semantic view with a dozen tables underneath and watch how quickly it plans. That is the part of the stack this whole conversation is about.
