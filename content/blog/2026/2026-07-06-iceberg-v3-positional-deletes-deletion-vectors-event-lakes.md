---
title: "Implementing Positional Deletes in Iceberg v3: Streamlining Merge-on-Read for Fast-Inbound Event Lakes"
date: "2026-07-06"
description: "Event data has a way of humbling neat architecture diagrams. It arrives late. It arrives twice. It arrives with incorrect attributes."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Iceberg v3
  - deletion vectors
  - event lakes
canonical: https://iceberglakehouse.com/posts/iceberg-v3-positional-deletes-deletion-vectors-event-lakes/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-v3-positional-deletes-deletion-vectors-event-lakes/).

Event data has a way of humbling neat architecture diagrams. It arrives late. It arrives twice. It arrives with incorrect attributes. It needs privacy removals. It needs corrections after enrichment logic changes. It needs retractions when upstream systems discover that an event should not have been emitted in the first place.

For a long time, the lakehouse answer to change-heavy data was either to rewrite files or push the problem somewhere else. Rewriting works, but it can be expensive when the table is large and the correction is small. Pushing the problem elsewhere works until the "elsewhere" becomes another data store with its own governance and consistency problems.

Apache Iceberg gives us a better set of tools. Its snapshot model, metadata structure, and delete-file support make it possible to manage row-level changes without treating object storage like a mutable database file system. Positional deletes have been a major part of that story. Deletion-vector work, including the direction discussed around newer Iceberg versions, is part of the broader effort to make row-level change more efficient and practical for high-ingestion lakehouse workloads.

I want to keep the language grounded. Exact Iceberg v3 details should always be checked against the current Apache Iceberg specification and the engine versions in use. The point of this article is not to promise a universal speedup. The point is to explain why merge-on-read patterns matter for event lakes and what teams should evaluate before using them in production.

![Papercut diagram comparing copy-on-write and merge-on-read update flows for an Iceberg event lake](/images/2026/wk-jul06/iceberg-v3-positional-deletes-deletion-vectors-event-lakes-./diagram-1.png)

## Why Event Lakes Strain Copy-on-Write Designs

Copy-on-write is conceptually simple. When data changes, the system writes new data files that reflect the changed table state. Readers do not have to apply as much change logic at query time because the files themselves have been rewritten into a cleaner form.

That simplicity has value. Copy-on-write can make reads easier. It can reduce the number of delete files or change records that need to be merged during planning and execution. For relatively small updates, predictable batch windows, or tables where read performance is the only priority, copy-on-write may be the right choice.

Event lakes create pressure in a different direction. Imagine a table receiving a steady stream of user activity, sensor readings, click events, transaction events, or agent tool traces. Most events are append-only. Then a small percentage needs correction. Maybe a privacy request requires removal of events tied to a user. Maybe a fraud system marks a group of events as invalid. Maybe a late-arriving dimension update changes how events should be interpreted. Maybe a duplicated upstream batch needs to be neutralized.

If each small correction rewrites large data files, write amplification becomes a problem. The system may spend a lot of time rewriting mostly unchanged rows. Storage churn increases. Compaction and maintenance become harder to schedule. Ingest pipelines lose throughput because they are doing heavy file replacement work for small logical changes.

Merge-on-read shifts part of that burden. Instead of rewriting data files immediately, the table can record row-level deletes separately and apply them during reads. That can make writes lighter and faster, especially when changes are small relative to the underlying files. The tradeoff is that reads and maintenance now have to account for those delete records.

That tradeoff is the heart of the design decision.

## How Iceberg Makes Row-Level Change Possible

Iceberg tables are not just directories full of files. They have metadata files, manifests, snapshots, schemas, partition specs, and table properties. A snapshot represents a version of the table at a point in time. Readers can plan against a snapshot, which gives them a consistent view even as new writes occur.

Delete files are part of Iceberg's row-level change model. They let the table represent deleted rows without always rewriting the data files that contain those rows. There are different kinds of delete patterns, but positional deletes are especially important to understand.

A positional delete identifies rows by data file and row position. In simple terms, it says that certain positions in a specific data file should be treated as deleted. When an engine reads the table, it must consider both the data files and the relevant delete files. The result is a logical table view where deleted rows are excluded.

That is powerful because object storage is not a place where systems should constantly mutate individual rows in place. Iceberg keeps the physical files immutable while allowing the logical table to evolve. This design matches the strengths of object storage while still supporting table-level change.

The cost is complexity. Query engines have to plan which delete files apply to which data files. They have to merge that information during reads. Table maintenance has to eventually compact, rewrite, or clean up when too many delete files accumulate. The lakehouse gets row-level flexibility, but it does not get it for free.

## Positional Deletes in Practical Terms

Think of a data file as a page of rows. If rows 5, 19, and 42 need to disappear, a positional delete file can record that those row positions in that specific data file are deleted. The original data file remains unchanged. The table's snapshot and metadata tell readers how to interpret the combination of data files and delete files.

This is useful when the system knows exactly which file and position a row lives in. For many update and delete operations, engines can derive that information during planning. Once the positional delete exists, future reads have to apply it.

For event lakes, positional deletes can support several common patterns:

- removing events tied to privacy requests
- retracting events emitted by mistake
- excluding duplicated records from a bad upstream run
- supporting CDC-like updates where old versions should no longer be visible
- handling late corrections without rewriting entire data files immediately

The operational benefit is write efficiency. A small delete file may be much cheaper to write than a replacement data file. The analytical cost is that readers now have more work to do. The platform has to balance those concerns.

![Papercut diagram showing a positional delete file pointing to specific rows inside Iceberg data files](/images/2026/wk-jul06/iceberg-v3-positional-deletes-deletion-vectors-event-lakes-./diagram-2.png)

## Where Deletion Vectors Fit

Deletion vectors are often discussed as a more compact or efficient way to represent deleted positions, especially when there are many row-level changes associated with data files. Instead of representing deletes as rows in a traditional positional delete file, a deletion-vector-style structure can mark deleted row positions more directly.

The reason people care is planning and read efficiency. If a table accumulates many delete records, engines need to process them. A compact representation can reduce overhead in some workloads. It can also make merge-on-read more attractive for high-ingestion tables where row-level corrections are common.

The practical message is not that deletion vectors make maintenance disappear. They change the shape of the tradeoff. Teams still need to measure query performance, compaction cadence, metadata growth, and engine compatibility. They still need to decide when to leave deletes as separate records and when to rewrite files into a cleaner state.

This is why I prefer to discuss deletion vectors as part of a table maintenance strategy rather than as a single feature checkbox. They are valuable when they help the whole system balance write throughput, read performance, and operational predictability.

## Merge-on-Read Is a Strategy, Not a Free Lunch

Merge-on-read often sounds like an obvious win because it reduces immediate rewrite work. But it introduces work later. Reads may need to combine base data files with delete information. Query planning may involve more metadata. Compaction becomes more important. If delete files accumulate without control, read performance can suffer.

That does not make merge-on-read bad. It means merge-on-read needs an operating model.

The operating model should answer questions like:

- How often do row-level changes happen?
- How many delete files are acceptable before compaction?
- Which queries are most sensitive to read-time delete application?
- Which partitions or data files receive the most corrections?
- How quickly do privacy deletes need to be reflected in user-facing queries?
- Which engines will read the table, and how well do they handle the delete pattern?
- What metrics will signal that maintenance is falling behind?

The best lakehouse teams treat these questions as production design, not tuning trivia.

## Event-Lake Use Cases

Privacy deletion is the use case people understand quickly. If a user or customer must be removed from analytical datasets, the platform needs a reliable way to make those rows disappear logically and eventually physically according to policy. Positional deletes can help represent the logical removal while maintenance processes handle longer-term cleanup.

Late-arriving corrections are another common case. Event systems often enrich records after the fact. A region, account tier, product category, or fraud marker may be updated later. If the original event should be replaced or neutralized, row-level change support matters.

Duplicate ingestion is a third case. Distributed systems retry. Batches get replayed. Producers fail halfway through a send. An idempotent design should prevent most duplicates, but production systems still need correction tools when duplicates slip through.

CDC-style updates are a fourth case. When source systems emit changes, the lakehouse may need to represent current state, historical state, or both. Merge-on-read patterns can help manage updates without rewriting large portions of the table on every small change.

Agentic analytics adds a newer use case. AI agents and automated systems may produce high-volume traces: observations, tool calls, decisions, validations, and actions. Some of those traces may need correction, redaction, or reclassification. If the event lake becomes the audit trail for agent behavior, row-level maintenance becomes more important.

## Query Planning and Engine Compatibility

A table feature is only useful if the engines reading the table implement it correctly and efficiently. Iceberg is an open table format, but engine support still varies by version and feature. Before depending on positional deletes or deletion-vector-style behavior, teams should test the engines that matter to them.

That testing should include reads, updates, deletes, merges, compaction, snapshot rollback, schema evolution, and concurrent writes. It should include both small and large files. It should include partitions with many deletes and partitions with none. It should include the BI, notebook, batch, and agentic workloads that will actually use the table.

Compatibility also has a governance angle. If one engine writes delete metadata that another engine ignores or handles poorly, the table is no longer safely multi-engine. The promise of open table formats depends on consistent semantics across the tools that participate.

This is one reason catalog and platform choices matter. The table format gives the standard. The surrounding platform helps enforce operational discipline.

## Compaction Is Part of the Design

Merge-on-read shifts work away from initial writes, but the work has to be reconciled eventually. Compaction rewrites data into a cleaner form, often combining small files, applying deletes, and improving layout for future reads.

For event lakes, compaction should not be an afterthought. It should be tied to workload patterns. A hot partition with many corrections may need more frequent maintenance. A cold partition with few queries may not. A table serving real-time dashboards may need tighter limits on delete-file accumulation than a table used for offline audits.

Autonomous or policy-driven optimization becomes attractive here. Instead of relying on manual jobs that run at fixed times, the platform can observe table health and choose maintenance actions based on file counts, delete density, query patterns, and cost. That is where the Dremio Agentic Lakehouse narrative becomes relevant without needing a sales pitch. The market is moving toward lakehouses that can optimize themselves because human operators cannot hand-tune every table forever.

## Governance and Auditability

Deletes are not just performance events. They are governance events. A privacy delete, fraud retraction, or compliance correction should be explainable later.

A good row-level change workflow should record who requested the change, which policy or process authorized it, which rows or keys were affected, which table snapshot introduced the logical delete, and when physical cleanup is expected. If an agent initiated or recommended the change, that should also be recorded.

Iceberg's snapshot history helps because table changes are represented as commits. But business-level auditability still needs surrounding metadata. A commit can show that a delete file was added. It may not explain the business reason unless the platform records that context.

For regulated data, the difference matters. Technical lineage and business intent need to meet.

![Papercut circular workflow showing ingestion, row-level deletes, compaction, snapshots, and query acceleration](/images/2026/wk-jul06/iceberg-v3-positional-deletes-deletion-vectors-event-lakes-./diagram-3.png)

## Dremio and the Open Lakehouse Reading

The Dremio-positive conclusion here is not that every table should use merge-on-read for every workload. The conclusion is more nuanced: open lakehouse architecture becomes more compelling when it can support both high-throughput ingestion and governed correction patterns without forcing data into a closed warehouse.

Event lakes are not static archives. They are living analytical systems. They need append speed, row-level correction, query performance, catalog governance, semantic consistency, and maintenance automation. That is a lot to ask from a table format alone.

The Dremio Lakehouse approach is compelling because it lines up with the whole operating model. Open Iceberg tables provide durable table semantics. Query acceleration helps keep analytical workloads responsive. Federation helps teams work across sources while they modernize. Semantic layers help keep business definitions consistent. Autonomous performance work helps reduce the manual burden of table maintenance.

The architectural lesson is that row-level Iceberg features matter most when the surrounding platform can use them responsibly.

## Practical Evaluation Checklist

Before adopting merge-on-read heavily in an event lake, I would test several things.

Start with the workload. Measure the ratio of appends to updates and deletes. If deletes are rare, simple maintenance may be enough. If deletes are frequent, test merge-on-read carefully.

Measure write amplification. Compare the cost of rewriting files against the cost of writing delete metadata. Use real data sizes, not toy examples.

Measure read impact. Run representative BI queries, agent queries, notebook exploration, and batch jobs against tables with different delete densities.

Test compaction policies. Decide when to rewrite files, how to schedule maintenance, and how to avoid conflicting with ingestion.

Validate engine behavior. Make sure every engine that reads the table respects the delete semantics you depend on.

Track table health. Monitor file counts, delete-file counts, delete density, planning time, scan time, and query latency.

Design privacy workflows. If row-level deletes support compliance obligations, ensure the process includes authorization, audit, logical removal, physical cleanup, and verification.

Document the tradeoffs. Engineers, analysts, and governance teams should understand when the table is using merge-on-read and what that means for performance and maintenance.

## A Concrete Operating Example

Consider a product analytics event lake that receives clickstream and feature-usage events throughout the day. Most records are append-only. Every few hours, an upstream identity service discovers that a set of anonymous events should be associated with a different account. Separately, the privacy team sends a daily set of user identifiers that must be removed from analytical views.

In a rewrite-heavy design, those corrections may force replacement files across several partitions. The table ends up doing large physical work for small logical changes. In a merge-on-read design, the platform can record the affected row positions as deletes, commit a new table snapshot, and make the corrected logical view available faster. Later, compaction can rewrite the affected files when the table is colder or when delete density crosses a threshold.

The key is that every step is observable. The ingestion job records the source batch. The correction job records the reason and affected keys. The Iceberg commit records the table change. The query layer applies the delete semantics. The maintenance service eventually rewrites files and records that cleanup. Analysts see the correct table view, while operators retain the evidence trail.

That example shows why the pattern is attractive. It reduces immediate rewrite pressure without asking the organization to give up table history or governance.

One guardrail is worth naming: never let delete metadata grow invisibly. If the platform cannot show delete density, planning cost, compaction lag, and query impact, the team will discover the problem only after users feel it.

## A Balanced Way to Think About It

Copy-on-write and merge-on-read are not moral choices. They are workload choices. Copy-on-write can be excellent when read simplicity and predictable query performance matter more than write efficiency. Merge-on-read can be excellent when write throughput and frequent small corrections matter more, provided the platform manages read-time complexity and maintenance.

Event lakes often lean toward merge-on-read because event correction patterns are common and rewriting large files for small changes is wasteful. But every team should test that assumption with its own data, engines, and service-level goals.

The broader trend is clear. As lakehouses become systems of record for more operational and AI-generated events, row-level change support becomes more important. Iceberg's delete model, and the newer work around more efficient representations, are part of that evolution.

## The Direction of Travel

The lakehouse is moving from append-only analytics toward active, governed, change-aware data infrastructure. That is necessary because modern data products are not static. They need corrections, privacy handling, CDC updates, agent traces, and reliable table history.

Positional deletes are one of the mechanisms that make this possible. Deletion-vector-style improvements point toward more efficient merge-on-read operation. Compaction, catalog governance, query acceleration, and auditability make the pattern production-ready.

The important conclusion is architectural. Teams should not evaluate row-level table features in isolation. They should evaluate the whole system: table format, catalog, engines, maintenance, semantics, and governance. When those pieces work together, an open lakehouse can handle event-scale change without giving up trust.

That is why this topic lands so naturally in the Dremio Lakehouse narrative. The more dynamic the lakehouse becomes, the more valuable it is to have open tables, fast query access, semantic consistency, and intelligent performance management around them.

For more of my thinking on data lakehouse and AI architecture, explore my books at [books.alexmerced.com](https://books.alexmerced.com). To try a modern Agentic Lakehouse experience, visit [dremio.com/get-started](https://www.dremio.com/get-started).
