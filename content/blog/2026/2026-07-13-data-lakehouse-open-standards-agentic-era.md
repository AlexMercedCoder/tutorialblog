---
title: "Data Lakehouse Open Standards for AI Agents"
date: "2026-07-13"
description: "An in-depth exploration of data lakehouse open standards for ai agents"
author: "Alex Merced"
category: "Data Lakehouse"
tags:
  - Lakehouse
  - Open Standards
  - AI Agents
canonical: "https://iceberglakehouse.com/posts/data-lakehouse-open-standards-agentic-era/"
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/data-lakehouse-open-standards-agentic-era/).

A single analyst running a report might touch three tables and issue a dozen queries in an afternoon. An AI agent working the same problem can issue a dozen queries in a minute, inspect twenty datasets to figure out which one it actually needs, and repeat that pattern across dozens of parallel tasks. The math changes the moment agents enter the picture. Every friction point in your data architecture, every copy you have to reconcile, every place where a metric is defined differently in two tools, gets multiplied by the volume and speed at which agents work.

That multiplication is why open standards have stopped being an ideological preference and become an operational requirement. When one team of humans works around a data silo, the workaround is annoying. When a fleet of agents has to work around the same silo, the workarounds compound into unreliable results and unbounded cost. Open table formats, open catalogs, and federated query engines are the tools that keep the silos from forming in the first place. This post walks through why the agentic era exposes closed data architectures, and what an open lakehouse foundation actually needs to provide.

## Why AI Agents Expose Data Silos

A data silo is any store where the data can only be reached usefully through one vendor's engine and one vendor's metadata. Closed warehouses became popular because they simplify some things: one system to secure, one place to tune, one bill. That simplicity has a cost, and agents are very good at finding it.

The first cost is copy-heavy pipelines. To use data in a closed warehouse, you generally have to load it in. That means extract-and-load jobs, staging, and a second (or third) copy of data that already exists somewhere else. Each copy is a thing that can drift, a thing that can be stale, and a thing whose governance has to be maintained separately. For a human team, copies are a known tax. For agents, copies are worse, because an agent inspecting data has no reliable way to know which copy is authoritative. It queries what it can reach, and what it can reach might be the day-old replica.

The second cost is inconsistent governance across tools. In a multi-tool environment, and every real enterprise is a multi-tool environment, the same data ends up governed differently in the warehouse, in the BI layer, in the notebook environment, and in whatever the agents talk to. Row-level security enforced in one place and absent in another means an agent can sometimes see what a human in the same role cannot. That is not a hypothetical. It is the default outcome when governance is a property of each tool rather than a property of the data.

The third cost is the one agents amplify most: semantic fragmentation. Agents issue many queries, inspect multiple datasets, and chain results together. If "active customer" means one thing in the warehouse's stored procedures and another thing in the semantic model the agents use, the agent's multi-step reasoning accumulates the inconsistency at every step. A human doing this work catches the discrepancy because a human has context. An agent does not, and it produces an answer that is internally consistent and organizationally wrong.

Open table formats attack all three costs at the root. When data lives in object storage in an open format, it does not need to be copied into an engine to be used. Multiple engines read the same files. The copies collapse, the authoritative source is unambiguous, and governance can be attached to the tables themselves rather than reinvented per tool. That is the structural shift the agentic era is pushing everyone toward.

## Iceberg as the Open Table Foundation

[Apache Iceberg](https://iceberg.apache.org/spec/) is the table format doing most of the load-bearing work in this shift. A table format is the layer that turns a pile of data files in object storage into something that behaves like a database table: it tracks which files belong to the table, what the schema is, and what the table looked like at any point in time. Iceberg does this with a metadata structure that gives you a few properties that matter a great deal for agents.

**Snapshots and time travel.** Every change to an Iceberg table produces a new snapshot, and old snapshots remain queryable. An agent can ask what the data looked like as of a specific point, which is exactly what you want when you need reproducible analysis. If an agent made a decision on Tuesday's data, you can reconstruct Tuesday's data to audit that decision. Snapshots also make writes atomic: a query either sees the full committed change or none of it, never a half-written state.

**Schema evolution.** Columns get added, renamed, and reordered as a business changes. Iceberg handles these changes at the metadata level without rewriting the underlying data files, and without breaking queries that referenced the old schema. For a long-running agent system, this means the table can evolve underneath the agents without a coordinated flag day.

**Multi-engine access.** This is the property that breaks the silo. Because Iceberg is an open specification, many engines can read and write the same tables: query engines, streaming systems, and processing frameworks. You are not locked into one engine's proprietary storage. If a better engine comes along, you point it at the same tables. The competition moves to who executes queries best and who offers the best experience, rather than who has captured your data.

**Object storage economics.** Iceberg tables sit on commodity object storage. You are not paying warehouse-coupled storage prices, and you are not paying to keep idle data warm in a compute-coupled system. Storage and compute are genuinely separate, which matters when agent workloads are spiky and you do not want your storage bill tied to your query volume.

An honest limitation: open table formats put more responsibility on you to manage the tables well. Iceberg tables accumulate small files and old snapshots, and without maintenance, that overhead degrades query performance over time. Compaction, snapshot expiration, and metadata cleanup are real operational work. A closed warehouse hides that work from you (while charging you for it). An open lakehouse asks you to either do it or use a platform that automates it. That tradeoff is real, and pretending otherwise does nobody any favors.

## REST Catalogs as the Shared Metadata Layer

Open files are necessary but not sufficient. An engine can read Iceberg data files, but it needs to know which tables exist, where their metadata lives, and how to commit changes safely when multiple writers are involved. That is the catalog's job, and it is the piece people underrate.

Without a shared catalog, every engine either maintains its own view of what tables exist or relies on a vendor-specific catalog that only that vendor's engine speaks. You get open files trapped behind a closed catalog, which recreates the silo one level up. The lock-in moves from the storage format to the metadata service, and most people do not notice until they try to point a second engine at their data and discover it cannot find the tables.

The Iceberg REST catalog specification fixes this. It defines a standard HTTP interface for catalog operations: listing namespaces, discovering tables, loading table metadata, and committing changes. Any engine that speaks the REST catalog protocol can discover and access tables managed by any compliant catalog. The metadata becomes as open as the files.

For agents, the catalog is more than a lookup service. It is where a lot of the governance and consistency guarantees can be enforced. A catalog that mediates commits can enforce that concurrent writes do not corrupt a table. A catalog that is the single source of truth for what tables exist means every engine and every agent sees the same set of tables, with the same schema, at the same version. When your semantic layer, your BI tools, and your agents all resolve tables through the same open catalog, the "which copy is authoritative" question disappears, because there is one catalog answering it for everyone.

Apache Polaris is an open-source implementation of an Iceberg REST catalog, and its existence matters because it means the catalog layer itself is not a point of proprietary control. You can run a standards-based catalog without betting your metadata on a single vendor's roadmap.

## Federated Query Across Distributed Object Stores

Open tables and open catalogs give you reachable, discoverable data. Federated query is what lets you actually use data that lives in more than one place without first hauling it all into one store.

Federation means a query engine can reach across object stores, warehouses, and operational systems and execute a query that spans them, resolving each part against the source that holds the data. The agent asks a question; the engine figures out which sources hold the relevant data and queries them in place. No pre-loading, no staging, no third copy. For agentic workloads that inspect many datasets to find the right one, this is the difference between "I can query anything reachable" and "I can only query what somebody already loaded."

Federation is not free, and the constraints are worth naming honestly because they drive the engineering.

**Latency.** Querying data across distributed object stores, sometimes across regions, introduces network latency that a single co-located warehouse avoids. If the engine naively pulls raw data across the network to filter it locally, performance collapses.

**Consistency.** Different sources have different consistency guarantees. An operational database is transactionally current; an object store replica might lag. The engine has to reason about this rather than assume everything is equally fresh.

**Metadata and statistics.** Good federated planning needs to know table sizes, partitioning, and column statistics so it can plan efficient execution. Without statistics, the planner guesses, and it guesses badly.

**Data sovereignty.** Some data cannot leave a region or a jurisdiction. Federation that queries in place respects those boundaries better than copy-everything-central, because the data does not have to move to be queried. But the engine has to honor the boundary, which means understanding where each source physically lives.

A strong planning layer earns its keep here. Predicate pushdown sends filters down to the source so only relevant rows come back over the network. Metadata pruning uses table statistics and partition information to skip files that cannot match a query. Caching keeps frequently accessed data close to the engine so repeat queries do not pay the full network cost every time. These are not optional refinements for federation at agent scale. They are the difference between federation being usable and federation being a slow demo.

## What This Looks Like From the Agent's Side

The abstractions above are easier to trust when you trace a single agent task through them. Say an agent is asked to investigate a drop in weekly active users and recommend where to look next. On an open lakehouse foundation, here is the sequence.

The agent resolves the tables it needs through the open catalog. It discovers the events table, the users table, and a subscription table, and it learns their current schema and version from the catalog without needing to know which underlying store each lives in. Two of those might be Iceberg tables in object storage; one might be a federated view over an operational Postgres database. The agent does not have to care, because the Data layer presents them uniformly.

The agent then queries. Its first query filters events to the last two weeks and groups by day. Because the engine pushes that filter down to the source and prunes files that cannot match using Iceberg's metadata, the query scans a fraction of the table rather than the whole thing, and it returns fast enough that the agent's next step does not stall. The agent reads the result, notices the drop concentrates in one signup channel, and issues a follow-up query joining events to the subscription source. That join spans two physical stores, but the federated engine resolves it in place, so the agent never had to wait for anyone to build a combined table.

Every one of those queries ran against a single authoritative version of each table, because the catalog is the shared source of truth. Every one respected the same access rules, because governance is attached to the data rather than to whichever tool happened to issue the query. And every one is reconstructable later, because the Iceberg snapshots let you pin exactly what the tables looked like when the agent ran. Now imagine the same task against a closed silo: the events data has to be loaded first, the subscription join needs a pre-built table that does not exist yet, and the agent either waits or works against a stale replica. The open foundation is what makes the agent's loop tight instead of stalled.

## Cloud Providers and the Iceberg Convergence

The signal that open tables are winning is that the largest cloud providers are building around Iceberg rather than against it. This is a convergence story more than a single-vendor story, and it is worth being careful about specific claims here.

Google's BigLake, per [Google's own documentation](https://cloud.google.com/bigquery/docs/biglake-intro), positions itself around lakehouse access, governance, and integration with cloud storage, and Google has invested in [Iceberg table support in BigQuery](https://cloud.google.com/bigquery/docs/iceberg-tables). The strategic logic is straightforward: giving engines a standard way to discover and access tables through Iceberg and a REST catalog interface makes the cloud provider's engine one of several that can work against open data, rather than a walled garden that customers have to fully commit to. I would frame this as an example of cloud providers investing in Iceberg interoperability rather than as a claim about any specific keynote announcement, because the details of who announced what and when are the kind of thing that gets misremembered.

The broader point holds regardless of which vendor's announcement you are looking at. When multiple large providers converge on the same open table format and the same catalog protocol, that convergence is itself the value. It means data written in Iceberg today is reachable by a growing set of engines tomorrow, and that the bet on open formats gets safer as more of the industry makes the same bet. For an enterprise deciding where to put data that agents will depend on for years, convergence on an open standard is a much better foundation than convergence on any one vendor's proprietary store.

The thing to avoid is overstating any single vendor's role. The story is not "cloud provider X blessed Iceberg, therefore Iceberg." The story is that the economics and the multi-engine pressure push everyone toward the same open standards, and the vendors are responding to that pressure. Open formats are winning because the alternative, a fleet of agents locked into one proprietary metadata and execution path, is a bad place for enterprises to be.

## The Metadata Layer Is Where Agents Live or Die

One point deserves more weight than it usually gets: for agentic workloads, metadata quality is not a secondary concern behind raw query speed. It is often the thing that determines whether the agent works at all.

An agent that has to inspect twenty datasets to find the three it needs is doing metadata work, not query work, for most of that task. It is reading table descriptions, column names, statistics, and lineage to decide what is relevant. If that metadata is thin, wrong, or trapped in a system the agent cannot reach, the agent flails. It queries the wrong tables, draws conclusions from stale data, or gives up. If the metadata is rich and reachable through an open catalog, the agent orients quickly and spends its query budget on the right data.

This is why the REST catalog matters beyond just table discovery. A catalog that carries the physical location of tables along with their statistics, their partitioning, and pointers to their business documentation becomes the map an agent navigates by. Statistics let the query planner make good decisions about how to execute, which keeps federated queries fast. Partition information lets the engine prune irrelevant data before it reads anything. And when the catalog connects to a semantic layer that describes what tables mean, the agent gets business context, not just structure.

The failure mode to avoid is treating metadata as an afterthought that lives in whatever tool happened to create each dataset. When metadata is fragmented across tools the same way data used to be fragmented across stores, agents inherit the fragmentation. The open catalog is the antidote: one place, reachable by any compliant engine, that answers "what tables exist, what do they contain, and what do they mean." Get that layer right and agents have a foundation to reason on. Get it wrong and no amount of raw query speed will save the workflow, because the agent will spend its time confused about what data to use in the first place.

## Closed Silo Versus Open Lakehouse

It helps to see the two architectures side by side, especially through an agentic lens.

| Concern | Closed storage silo | Open lakehouse standard |
| --- | --- | --- |
| Data copies | Load into the warehouse; multiple copies to reconcile | Query in place; one authoritative source |
| Engine choice | Locked to the vendor's engine | Any engine that speaks the open format and catalog |
| Metadata access | Proprietary catalog, vendor-only | Open REST catalog, any compliant engine |
| Governance | Per-tool, prone to drift across agents and BI | Attached to tables and catalog, consistent across consumers |
| Agent data access | Limited to what was loaded | Federated reach across sources without pre-loading |
| Cost model | Storage coupled to compute or warehouse pricing | Commodity object storage, separated compute |
| Lock-in | High; data and metadata both captured | Low; data and metadata stay open and portable |

Neither column is free of tradeoffs. The closed silo genuinely is simpler to operate on day one and hides table maintenance from you. The open lakehouse asks you to manage tables, or to use a platform that manages them for you, and it asks you to think about federation planning. What the open column buys is that agents get consistent, governed, reachable data without a copy-reconciliation problem and without your data being captured by one vendor. As the number of agents and tools reaching your data grows, that consistency and portability move from nice-to-have to load-bearing.

## Why Open Standards Favor the Agentic Lakehouse

Agents need stable contracts to work against: table versions they can pin to, metrics defined consistently, semantic definitions that mean the same thing across every interface, access policies that apply uniformly, and lineage they can trace. Open standards are how those contracts stay stable across engines and over time. Bury the same contracts in one vendor's proprietary system, and every one of them becomes a lock-in point and a place where AI workflows can get trapped.

This is where [Dremio's approach](https://www.dremio.com/blog/why-agentic-analytics-requires-federation-virtualization-and-the-lakehouse-how-dremio-delivers/) lines up with the direction the industry is moving. Dremio is a unified lakehouse built on open standards: Apache Iceberg for tables, Apache Arrow for in-memory data, and Apache Polaris for the open catalog. It runs a federated query engine that queries data in place across object stores, warehouses, and operational systems, so you reach data without moving it. Governance, including fine-grained row and column access control, is enforced in the engine that runs the query, which keeps the per-tool governance drift from creeping in when agents show up. And the semantic layer, expressed as virtual datasets and views with wikis, labels, and AI-generated metadata, gives agents consistent business meaning over that open data.

The performance concerns that federation raises are addressed at the platform level rather than left to you. Reflections and Autonomous Reflections accelerate repetitive and ad hoc query patterns, a distributed cache keeps hot data close to the engine, and the planner does predicate pushdown and metadata pruning so federated queries stay interactive. Agents reach all of this through native agentic interfaces, including an open-source MCP server, so the open standards story extends all the way to how agents connect.

The honest framing is that Dremio benefits from the industry moving toward open standards rather than needing to fight the industry into a proprietary corner. That alignment is the point. A platform that reads and writes open Iceberg tables through an open catalog is a platform you can leave, which is exactly why it is a platform worth trusting your agents to.

If you are building the data foundation your agents will run on, the useful next step is to see federated, governed query over open tables working against your own data. You can start with a free Dremio account at [dremio.com/get-started](https://www.dremio.com/get-started), connect a couple of sources, and query across them in place without loading anything, then judge for yourself whether the open lakehouse foundation holds up under the kind of query volume agents generate.
