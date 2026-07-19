---
title: "Zero-Copy Mirroring to Open Iceberg Tables"
date: "2026-07-13"
description: "An in-depth exploration of zero-copy mirroring to open iceberg tables"
author: "Alex Merced"
category: "Data Lakehouse"
tags:
  - Zero-Copy
  - Migration
  - Iceberg
  - Lakehouse
canonical: "https://iceberglakehouse.com/posts/zero-copy-mirroring-migration-proprietary-warehouses-open-iceberg/"
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/zero-copy-mirroring-migration-proprietary-warehouses-open-iceberg/).

The most expensive part of moving off a proprietary warehouse is usually not the compute contract. It is the copy. Rewriting terabytes of data into a new format means paying twice for storage during the transition, burning compute on the rewrite, and holding your breath during a cutover window while every downstream consumer waits. "Zero-copy mirroring" promises to skip most of that: point [Apache Iceberg](https://iceberg.apache.org/spec/) metadata at your existing data files, expose them as open tables, and migrate the definition instead of the data.

It is a genuinely good pattern. It is also oversold. True zero-copy only works when the physical and metadata conditions line up, and a lot of proprietary warehouses do not meet those conditions. So the useful framing is not "zero-copy or bust." It is a staged migration that copies as little as possible while never giving up validation and rollback. Let me define the terms honestly, then walk the actual playbook: assess, translate, rebuild business logic, validate, and cut over.

## What Zero-Copy Really Means

The phrase covers three distinct situations, and conflating them is where migration plans go wrong.

**True zero-copy.** Your source system stores data in files that Iceberg can reference directly, typically Parquet, and you have access to those files in object storage. In this case you can build Iceberg metadata, the manifests and snapshots that point at existing data files, without rewriting a single data file. The data stays exactly where it is; you add an Iceberg metadata layer on top of it. This is the ideal, and it is real when the conditions hold.

**Minimal-copy.** The source files are mostly compatible but need selective work. Maybe file sizes are pathologically small and need compaction for query performance, maybe partitioning needs to change, or maybe a subset of tables uses an incompatible encoding. You copy or rewrite the parts that need it and reference the rest in place. Most real migrations land here.

**Phased-copy.** The source stores data in a proprietary format you cannot read directly, or the files are locked inside the warehouse with no object-store access. Now you have to extract and convert, which is a genuine copy. "Zero-copy" is off the table, but the migration can still be phased, table by table, with validation at each step, so you never do a big-bang rewrite.

The determining factors are concrete: is the underlying data already Parquet, are the physical files accessible to you in storage, and can Iceberg reference them without rewriting? If yes to all three, you are in zero-copy territory. If the format is proprietary or the files are inaccessible, you are in phased-copy territory whether you like it or not. Be honest about which one you are in before you promise anyone a timeline, because the timelines differ by an order of magnitude.

The table below lays out how the three modes differ on the dimensions that actually drive cost and risk.

| Dimension | True zero-copy | Minimal-copy | Phased-copy |
| --- | --- | --- | --- |
| Source format | Already Parquet | Mostly Parquet, some fixes | Proprietary or inaccessible |
| Data rewritten | None | Selected tables or partitions | All or most data |
| Duplicate storage cost | Near zero | Partial | Full during transition |
| Compute for migration | Metadata only | Metadata plus targeted rewrites | Full extract and convert |
| Typical duration | Days | Weeks | Weeks to months |
| Main risk | Bad statistics or small files | Partitioning and compaction choices | Extract throughput and cost |

Notice that even true zero-copy is not risk-free; it just moves the risk from data volume to metadata correctness. A table you referenced without rewriting can still plan badly if its statistics are missing or its files are the wrong size. The mode determines what you spend and what can go wrong, not whether anything can go wrong at all.

## Assess Schemas and Catalog Dependencies

Before touching any data, inventory what you actually have. The migrations that fail do so because someone discovered a proprietary feature with no clean Iceberg equivalent halfway through cutover, not because the data itself was hard to move.

Catalog everything the warehouse holds:

- **Schemas and data types.** Every table, every column, every type. Flag types that do not map cleanly to Iceberg, like proprietary numeric or semi-structured variants.
- **Views and materialized views.** These encode business logic and will need to be recreated, not copied.
- **Constraints.** Primary keys, foreign keys, and unique constraints often do not have a direct Iceberg equivalent and have to be handled in the semantic or application layer instead.
- **Security policies.** Row-level security, column masking, and access grants. These protect real data and cannot be dropped in transit.
- **Stored procedures and functions.** Proprietary procedural code has to be rewritten or relocated.
- **Downstream consumers.** Every dashboard, pipeline, application, and export that reads from the warehouse. This list defines your cutover blast radius, and it is always longer than the first draft.

Pay special attention to features that do not translate directly. Clustering and micro-partition semantics from proprietary engines do not map one-to-one to Iceberg partitioning and sort orders. Generated columns, constraints, masking policies, and proprietary data variants each need a deliberate decision: replicate the behavior in Iceberg and the semantic layer, or accept a documented difference. The migration document should list every one of these with an owner and a plan. Surprises found during cutover are the ones that force a rollback.

While you are at it, answer the physical-access question for each table. Are the files already Parquet? Are they reachable in object storage? This is what sorts each table into the true, minimal, or phased bucket, and it lets you sequence the easy zero-copy tables first to build confidence before tackling the hard ones.

## Translate Physical Files into Iceberg Tables

For tables that qualify, this is the step where zero-copy earns its name. Iceberg tables reference data files through a metadata tree: a table points at a current snapshot, a snapshot points at manifest lists, and manifests point at the actual data files with their statistics. If your existing Parquet files are compatible, you can build that metadata tree over them without rewriting the data. The Iceberg project documents the mechanics of this in its [migration guide](https://iceberg.apache.org/docs/latest/migration/), including procedures that register existing files into an Iceberg table.

The metadata translation is where care matters. Map source data types to Iceberg types deliberately, checking precision, scale, and timestamp semantics rather than assuming a default mapping is correct. Preserve what you can: column names, field IDs where the source exposes them, nullability, partition transforms, sort order, and relevant table properties. Field IDs matter because Iceberg tracks columns by ID rather than name, which is what makes safe schema evolution possible later. Getting these right at registration time saves you from subtle correctness problems downstream.

Several physical realities affect how the migrated table performs, and these are worth checking before you declare a table done:

- **File sizing.** A table made of thousands of tiny files will plan and scan slowly. If the source left you with small files, compaction is part of migration, which pushes you from true zero-copy toward minimal-copy for that table. That is a fair trade.
- **Partitioning.** The source partitioning may not match how the data is actually queried. Iceberg's hidden partitioning and partition evolution let you fix this, but you have to decide the partition spec, not inherit a bad one by default.
- **Statistics.** Iceberg uses column-level min/max statistics in manifests to prune files during planning. Make sure these are populated, because missing statistics turn what should be a pruned scan into a full one.
- **Delete handling.** If the source has an update or delete history, decide how to represent it. Iceberg's position and equality deletes have real performance characteristics, and a table with heavy delete files behaves differently from a freshly compacted one.

Once metadata is built and the table validates, register it in a catalog so engines can find it. That registration is what turns a pile of files with metadata into a table your query engines can actually use.

## Rebuild Business Logic in the Semantic Layer

Data files are the easy part. The business logic sitting on top of them, the views, the metric definitions, the joins that everyone's dashboards assume, is what makes the migration feel disruptive to users if you get it wrong.

The warehouse's views and materialized views encode definitions people depend on. "Net revenue," "active accounts," "quarterly cohort retention": these are not columns, they are logic. That logic has to be recreated in the lakehouse, and the cleanest place to put it is a semantic layer of views over the Iceberg tables. Rebuilding rather than blindly copying is actually an opportunity, because it forces you to write down what each definition means, which is exactly the documentation that tends to be missing in the source system.

The goal during transition is continuity. If an analyst's dashboard references a view called `finance.net_revenue`, they should be able to keep referencing something with that name and meaning after migration, even though the physical tables underneath moved to Iceberg. A semantic layer lets you preserve the business-facing contract while the physical implementation changes underneath. Users query the same concepts; the plumbing changed without breaking their queries.

This continuity matters for agents too, not just humans. An AI agent that learned to answer revenue questions against a set of semantic definitions should find those same definitions after migration. If the semantic layer preserves the concepts and their meaning, the migration is invisible to the agent. If it does not, every agent workflow built on the old definitions breaks at once. Preserving business logic in the semantic layer is what keeps both humans and agents working through the transition instead of after it.

## Keeping Data Fresh During a Long Migration

A migration that takes weeks or months has a problem the tidy diagrams ignore: the source warehouse keeps changing while you migrate. New orders land, dimensions get updated, and the historical snapshot you translated on day one is stale by day thirty. You cannot freeze the business to make the migration convenient, so you need a plan for the delta between the point you copied and the point you cut over.

There are a few workable patterns, and the right one depends on how the source changes.

For append-mostly tables like event logs or transaction facts, incremental sync is straightforward. Migrate the historical bulk once, then repeatedly append only the new files or partitions that arrived since the last sync. Because Iceberg commits are atomic and snapshot-based, appending new data files to the migrated table is a clean, low-risk operation. Each sync is small, and the migrated table converges toward the source with each run. The final sync before cutover is tiny because it only covers the last window of changes.

For tables with updates and deletes, it is harder, and this is where "zero-copy" strains. If the source mutates rows in place, you need change data capture or a periodic reconciliation to reflect those mutations in Iceberg. Iceberg's merge-on-read deletes and copy-on-write updates both express mutations, but they have different performance profiles, and a table receiving a steady stream of small updates during migration can accumulate delete files that hurt query performance until you compact. The honest read is that heavily mutable tables are the ones most likely to push you from true zero-copy into minimal-copy or phased-copy, because keeping them synchronized costs real work.

The dimension of this that teams underestimate is the reconciliation window. There is always a moment near cutover where you stop accepting writes to the source, apply the final delta to Iceberg, validate, and switch consumers over. The length of that window is a business decision, not just a technical one. A five-minute window is easy if your last delta is small; a multi-hour window may be unacceptable for a system with constant writes. Designing the sync so the final delta is small is what shrinks that window, and shrinking the window is often the single most important thing you can do to make the migration acceptable to the business. Plan the last mile before you plan the first.

## Validate Before Production Cutover

The step that separates a calm migration from a resume-generating one is validation. Never point production consumers at the new tables on faith. Prove equivalence first, and keep the old system live until you have.

Validate correctness against the source:

- **Row counts.** The migrated table should have the same row count as the source for each table and partition. A mismatch means files were missed or double-counted.
- **Checksums and aggregates.** Compute checksums or aggregate signatures, sums of numeric columns, distinct counts of keys, over both source and target and compare. This catches subtle data corruption that row counts miss.
- **Min/max statistics.** Compare column ranges between source and target to confirm the data landed intact and the statistics are accurate.
- **Sample query results.** Run a representative set of real production queries against both systems and compare results row for row. This validates not just the data but the semantic layer you rebuilt on top of it.

Then validate the operational properties. Test that every required engine can read the tables. Confirm Spark, Dremio, Trino, and whatever else your stack includes can all query the registered Iceberg tables and get correct answers. Check performance, because a query that was fast on the source and slow on Iceberg usually points at a file-sizing, partitioning, or statistics problem you can fix before cutover rather than discover after. Verify that access policies survived, that the row-level security and column masking you inventoried in the assessment phase are enforced on the new tables. A migration that leaks data because a masking policy did not carry over is worse than no migration at all.

The strongest validation technique is dual-read. Run production consumers against both the source and the new Iceberg tables in parallel, compare their outputs, and only cut over once they agree consistently over a real window of time and load. Dual-read turns cutover from a leap into a formality, because by the time you flip the switch you have already watched the new system produce identical results under real conditions. The migration document should carry an explicit checklist covering pre-migration assessment, migration steps, validation, and cutover, with sign-off at each stage. Boring, thorough, and reversible beats fast and hopeful.

## The Pitfalls That Actually Bite

Having watched and read about enough of these migrations, the failures cluster into a small set of recurring mistakes. None are exotic. All are avoidable if you know to look for them.

The first is treating "zero-copy" as a promise instead of a possibility. Teams announce a zero-copy migration to leadership, then discover mid-project that half the tables are in a proprietary format or have inaccessible files, and the timeline built on zero-copy assumptions collapses. The fix is the assessment discipline covered earlier: sort every table into true, minimal, or phased before you commit to a schedule, and set expectations against the realistic mix rather than the best case.

The second is ignoring small files. A source system that wrote thousands of tiny files leaves you with an Iceberg table that technically works and queries slowly, because planning has to open and reason about far too many files. If you skip compaction to preserve the pure zero-copy story, you ship a table that disappoints users on day one and blame Iceberg for a problem the source created. Accept the minimal-copy label and compact.

The third is losing statistics. Iceberg prunes files during planning using column min/max values in the manifests. Register files without populating those statistics and every query becomes a full scan, which makes the new lakehouse look slower than the warehouse it replaced. This one is especially frustrating because the data is perfectly correct; the table just cannot prune. Validate that statistics exist and are accurate as part of migration, not after complaints arrive.

The fourth is forgetting the consumers you did not inventory. The dashboard nobody remembered, the quarterly export a finance team depends on, the internal app with a hardcoded connection string. These surface at cutover as broken workflows because they were never on the list. The defense is a thorough consumer inventory during assessment and a communication plan so every owner knows the cutover date before it arrives, not after their report breaks.

The fifth is skipping rollback planning. If you have no clean way back to the source, every problem becomes a crisis because forward is the only direction. Keeping the source live through dual-read, and not decommissioning it until the new system has proven itself over a real window, is what turns a discovered problem into a shrug instead of an incident.

## Why Dremio Fits the Migration Path

The hardest thing about any warehouse migration is that the business does not stop while you do it. Reports still run, agents still answer questions, and pipelines still need data during the months the migration takes. This is where a federated query engine changes the shape of the problem, and where Dremio fits the pattern above.

Dremio is a data platform built for and managed by AI agents, running on open standards: Apache Iceberg for tables, Apache Arrow for in-memory processing, and Apache Polaris for the open catalog. Its federated query engine can query data in place across sources, which means you do not have to finish the migration before you get value from the lakehouse. During transition you can [federate across the old warehouse and the new Iceberg tables](https://www.dremio.com/blog/why-agentic-analytics-requires-federation-virtualization-and-the-lakehouse-how-dremio-delivers/), running a single query that spans both while data moves table by table. That federation is what turns a scary all-at-once cutover into an incremental one, because consumers can keep working against a unified view while the physical migration proceeds underneath them.

The semantic-layer continuity described earlier is native to how Dremio works. You define virtual datasets as views over your data, and those views can point at the old source during transition and the new Iceberg tables after, without the business-facing definition changing. Users and agents keep querying the same concepts throughout. Once tables are on Iceberg, Dremio queries them in place through an open catalog on Apache Polaris, with no proprietary format holding your data hostage. Reflections and Autonomous Reflections accelerate the query patterns that matter without you hand-building materializations, and the C3 cache keeps hot data close to compute, which is exactly what you want when you are validating performance against the old system. Fine-grained access control lets you carry the security policies you inventoried into the new environment.

The reason all of this holds together is open standards. Because the destination is Apache Iceberg on an open catalog rather than another proprietary system, the migration is a move toward optionality, not a swap of one lock-in for another. Any engine that speaks Iceberg can read the result, and you are not signing up to do this migration again in five years. As Dremio describes in its writing on [running an Iceberg lakehouse without the headaches](https://www.dremio.com/blog/5-ways-dremio-delivers-an-apache-iceberg-lakehouse-without-the-headaches/), the payoff is a data foundation you control, queryable by many engines, ready for both BI and agents. The data foundation being open is what makes the effort of migrating worth doing once and never again.

If you are planning a move off a proprietary warehouse and want to federate during the transition and query your Iceberg tables in place, start at [dremio.com/get-started](https://www.dremio.com/get-started), connect both your existing warehouse and your Iceberg storage, and run a federated query across the two before you commit to a single cutover date.
