---
title: "Reading the Apache Iceberg V4 Proposals Before They Land"
date: "2026-08-04"
description: "A field guide to the Apache Iceberg V4 proposals: adaptive metadata trees, single-file commits, typed statistics, column families, and what is safe to build on today."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Iceberg V4
  - Metadata
  - Streaming
  - Data Lakehouse
canonical: "https://iceberglakehouse.com/posts/iceberg-v4-roadmap/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-v4-roadmap/).

# Reading the Apache Iceberg V4 Proposals Before They Land

*By Alex Merced, Data Lakehouse and AI Evangelist*

A Flink job commits every five seconds. Each commit writes one small Parquet file. It also writes a manifest, rewrites a manifest list, and writes a new `metadata.json`. Three metadata objects for one data file, seventeen thousand times a day, against object storage that starts throttling when you hammer the same prefix.

That is the shape of the problem driving Apache Iceberg V4. The format was designed for large analytical tables that changed a few times an hour. The workloads that run on it now commit continuously, and the metadata layer that made Iceberg reliable at petabyte scale has become the thing that limits it at streaming latency.

V4 is not one feature. It is a coordinated redesign of the metadata layer, split into proposals that each address a concrete operational failure. Some are effectively settled. Some have active design syncs and running implementations. Some are still live arguments where the community has not agreed on a direction. Knowing which is which is the difference between architecting for what is coming and architecting for a blog post.

This piece walks the proposals from settled to contested, explains the mechanism behind each one, and gives you a practical answer to the question that actually matters: what do you build today so the upgrade is cheap later.

A disclosure. I work for Dremio, which was acquired by SAP and now sits within SAP Business Data Cloud. Dremio is an Iceberg contributor and educator rather than a top-tier committer by volume, and I have no inside track on how these votes land. Everything here traces to public design documents and dev list threads.

## Why the V3 metadata tree runs out of road

Start with the current structure, because every V4 proposal is a reaction to it.

An Iceberg table has a `metadata.json` file that describes the table: schema, partition spec, snapshot history, properties. Each snapshot points to a manifest list. The manifest list points to manifest files. Manifest files point to data files and delete files, and they carry per-file statistics that make scan planning work without opening data.

That tree is what makes Iceberg good. Planning reads metadata instead of listing object storage. Statistics prune files before any data is touched. Snapshots give you time travel and atomic swaps.

The tree also means every commit touches multiple levels. Add one file and you write a manifest containing it, a manifest list containing every manifest in the new snapshot, and a fresh `metadata.json`. For a batch job appending a thousand files once an hour, that overhead disappears into the noise. For a streaming job appending one file every five seconds, the metadata write volume exceeds the data write volume.

The second-order effects are worse than the write count. Manifest lists grow with the number of manifests, so rewriting one gets more expensive as the table ages. Small manifests accumulate, planning slows, and you schedule manifest rewrite jobs that compete with your ingest for the same commit lock. Teams end up batching writes artificially to protect the metadata layer, which defeats the point of streaming ingestion.

Iceberg outgrew its original design assumptions. V4 is the format catching up to its own adoption.

## The adaptive metadata tree

The centerpiece proposal restructures the tree around a Root Manifest that replaces the manifest list and becomes the single entry point for a snapshot. The hierarchy flattens from four levels to something closer to three, and the root gains one capability that changes the economics of small commits.

The root inlines small changes. A commit that adds one file does not need to create a separate manifest object. The file entry lands directly in the root, and the root becomes the only object written. Metadata writes for a micro-batch commit drop from three objects to one.

The tree adapts as the table grows. Once inlined entries pass a threshold, they get flushed into a proper child manifest and the root goes back to holding pointers. A table under heavy streaming load keeps a fat root with recent entries inlined. A table with billions of files keeps a thin root pointing at a deep tree. The same structure serves both without the operator choosing a mode.

The reason this matters beyond latency is object storage behavior. Cloud object stores rate-limit per prefix. A metadata layout that writes three objects per commit hits those limits three times faster than one that writes one. Teams running high-frequency Iceberg ingestion today spend real effort spreading metadata across prefixes to avoid throttling. The adaptive tree removes most of that pressure at the format level.

Single-file commits are the companion proposal. The goal is that a commit in the common case touches exactly one object. Details are still being argued on the dev list, particularly around how the commit interacts with catalog-side atomicity, but the direction is settled enough to plan against.

## Typed column statistics

Iceberg today stores column statistics in generic maps: column ID to lower bound, column ID to upper bound, column ID to null count, and so on. The values are serialized bytes that the reader interprets according to the column type.

That model works and has worked for years. It has two limits.

Adding a new kind of statistic means adding a new map to the manifest schema. Every engine has to learn the new map. Statistics that are useful to one engine and meaningless to another still cost bytes for everyone.

The bigger limit is expressiveness. A lower and upper bound describes a scalar. It does not describe a histogram, a sketch, or the centroid of a vector. As lakehouse tables start holding embeddings and feature vectors, the statistics that make scans fast stop being ranges.

The typed statistics proposal replaces generic maps with structured representations. Statistics become first-class typed objects with a defined schema, extensible without changing the manifest layout for everyone. The design work explicitly opens the door to approximate nearest neighbor search, because the metadata layer gains a place to record the information an ANN index needs.

This proposal is less mature than the adaptive tree. Core committers have asked for production benchmarks showing that the current statistics model is a real bottleneck before accepting the complexity of a pluggable system. That is the right instinct and worth watching. A proposal that cannot show a measured problem generally stalls.

## Relocatable tables and relative paths

This one is settled and underappreciated.

Iceberg metadata today stores absolute URIs. A manifest entry says the data file lives at `s3://prod-lake-us-east-1/warehouse/db/table/data/00000-abc.parquet`. That works until you want the table somewhere else.

Copying a table to another bucket, another region, or another cloud requires rewriting every metadata file to fix the paths. For a table with tens of thousands of manifests, that is a batch job measured in hours, and it produces a table whose metadata history no longer matches the original. Disaster recovery replication, region migration, and dev environment cloning all pay this tax.

Relative paths fix it. Metadata records paths relative to a table root, and the root is resolved at read time from the catalog or the client configuration. Move the directory, point the catalog at the new location, and the table works. No metadata rewrite.

The practical consequences are larger than they sound. Cross-region replication becomes an object copy plus a catalog registration. Cloning production into a test environment becomes cheap. Air-gapped deployments that ship data across a boundary stop needing a path-rewriting step in the transfer pipeline.

Content stats are in a similar settled state. Both are the kind of unglamorous groundwork that determines whether the rest of the redesign is usable.

## Column families

Column families group columns in a table so that they get stored and updated independently. The proposal is close to spec-ready and targets a specific pain that machine learning teams hit constantly.

A feature table has an entity key, a timestamp, and two hundred feature columns. A feature engineering pipeline recomputes twelve of those columns. Under the current design, updating twelve columns means rewriting the files that contain all two hundred, because a data file holds a full row.

With column families, the twelve columns live in their own physical grouping. Updating them rewrites their files. The other one hundred eighty-eight stay untouched. Read paths that need columns from multiple families reassemble rows by position or by row identity.

The cost is complexity in the write path and in compaction. Families that drift out of alignment produce expensive reassembly. The proposal has to define how row identity is maintained across families, which connects it to the row lineage work already in V3.

If your pipeline produces wide tables where subsets of columns update on different schedules, this is the proposal to track most closely. Feature stores, entity profile tables, and slowly-changing dimension tables with computed attributes all fit.

## Tags, capabilities, and the plumbing that makes rollouts survivable

Two smaller proposals matter more than their scope suggests.

The tags field adds a general-purpose tagging mechanism to V4 metadata structures. Today, tools that need to annotate a snapshot or a manifest abuse the properties map, which has no schema and no conventions. A sanctioned place to attach small annotations gives lineage tools, quality frameworks, and governance systems somewhere to write without colliding.

The client capabilities header at the REST catalog layer addresses a problem V4 creates for itself. As the format grows more optional and more adaptive, catalogs and clients need a clean way to declare what each understands. Without negotiation, a mixed fleet where Spark speaks V4 and an older reader speaks V3 either breaks or silently misreads.

Capability negotiation is how a multi-engine V4 rollout stays survivable. Most organizations do not upgrade every engine on the same day. The client tells the catalog what it supports, the catalog tells the client what the table needs, and mismatches surface as clear errors instead of corrupt reads.

This is the unglamorous work that decides whether a spec transition goes smoothly. It is also the part of the proposal set that gets the least attention in conference talks.

## The Delta convergence question

The most strategically significant development around V4 is a competitive alignment rather than a technical proposal.

Databricks announced that Delta Lake 5.0 will adopt the same adaptive metadata tree structure that Iceberg V4 proposes. The formats stay independent and do not merge into one spec. Each keeps its own commit protocol, catalog integration, and engine optimizations. The metadata storage layer becomes compatible, so a metadata node written by one is readable by the other.

Treat this as a direction to watch rather than a plan to build on. It is a proposal under community review. A proposal from a large vendor, including one that employs the format's creators, still has to win the community vote.

That governance model is the whole point of Iceberg. No single vendor changes the spec unilaterally in ways that disadvantage the others. It is what makes the format safe for a ten-year architecture decision. The convergence idea gets tested against that model like everything else.

## How to read the dev list yourself

The single most useful skill here is reading the source rather than the summaries, including this one. Iceberg design work follows a recognizable lifecycle, and once you can spot the stages, the dev list turns from noise into a status board.

An idea enters as a `[DISCUSS]` thread, usually paired with a design document and often a GitHub issue or an Iceberg Enhancement Proposal. Discussion runs for weeks. If it survives, an implementation appears behind a flag. Then a `[VOTE]` thread ratifies the spec change. Ratification comes before broad engine support, sometimes by many months.

Use these signals to judge maturity:

| Signal | What it tells you |
|---|---|
| Open `[DISCUSS]` with no design doc | Early idea, do not plan around it |
| Design doc plus active sync meetings | Serious proposal, direction likely stable |
| Reference implementation behind a flag | Mechanism is settled, details still moving |
| Passed `[VOTE]` on the spec | Ratified, engine support follows later |
| Two or more engines shipping it | Safe to build production architecture on |

The channels worth subscribing to are `dev@iceberg.apache.org`, the Iceberg GitHub repository filtered on spec and enhancement proposal labels, and the recorded community meetings. Iceberg Summit and the annual conferences present roadmap material, which is useful for orientation and always behind the mailing list on detail.

One structural rule governs everything: each new spec version reads all previous versions, and tables only upgrade to a version that every reading engine supports. That rule is why the capability negotiation work matters and why nobody gets stranded.

## What to build today

The proposals are not final, and you have tables to run this quarter. Here is what holds regardless of how the votes land.

**Design pipelines to produce independent files per micro-batch.** If your streaming pipeline currently batches writes artificially to protect the metadata layer, the single-file commit work removes that constraint at the format level. A pipeline that already produces one clean file per micro-batch adopts the improvement without restructuring. A pipeline built around a custom batching layer has to unwind that layer first.

**Avoid metadata structures that are hard to convert.** Extremely deep manifest trees, custom clustering that produces thousands of manifests per partition, and manual partitioning schemes that overlap with the adaptive split algorithm all work fine under V3. Each one makes the V4 upgrade more expensive. Keep manifest counts in a sane range through regular rewrite jobs.

**Get on V3 first.** V4 builds on V3 structures. Deletion vectors, row lineage, and the Variant type are the foundation that several V4 proposals extend. A table still on V2 has two hops to make, and each hop needs every reading engine to support the target version.

**Adopt the REST catalog protocol.** Capability negotiation happens at the REST layer. Tables managed through a Hive metastore or a direct filesystem catalog have no place for that negotiation to occur. Moving to a REST catalog such as Apache Polaris, or a managed equivalent, is the prerequisite for a clean multi-engine transition. Polaris graduated to Apache Top-Level Project on February 18, 2026, having been co-created with Snowflake and donated to the ASF, and it is the most direct open path onto the REST protocol.

**Inventory your engine versions and keep the inventory current.** The upgrade gate is the least capable reader. Knowing which engine that is, and who owns it, turns the V4 transition from a research project into a scheduling problem.

**Instrument metadata volume now.** Count metadata objects written per hour and track planning time as a metric. When V4 support lands in your engines, you want a before number. Teams that skip this step end up guessing whether the upgrade helped.

## Instrumenting your tables before the upgrade

Everything above is a plan. This section is the work you do this week, because the V4 conversation is only useful if you know where your own tables hurt.

Iceberg exposes its metadata as queryable tables. Every engine that supports Iceberg metadata tables gives you the same view, so the queries below port across Spark, Trino, and Dremio with minor syntax differences.

Start by counting manifests per snapshot. Manifest count is the single best predictor of how much the adaptive tree helps you.

```sql
SELECT
    snapshot_id,
    COUNT(*)                          AS manifest_count,
    SUM(added_data_files_count)       AS files_added,
    SUM(existing_data_files_count)    AS files_carried,
    ROUND(AVG(length) / 1024.0, 1)    AS avg_manifest_kb
FROM prod_catalog.telemetry.device_events.manifests
GROUP BY snapshot_id
ORDER BY snapshot_id DESC
LIMIT 20;
```

Read the output this way. `manifest_count` climbing over successive snapshots means small commits are accumulating manifests faster than rewrite jobs clear them. `files_carried` far exceeding `files_added` means every commit rewrites a manifest list that mostly describes files it did not touch, which is exactly the write amplification the adaptive tree removes. `avg_manifest_kb` in the single-digit kilobytes means you are writing many tiny objects, and object storage request cost is a bigger line item than you think.

Next, measure commit frequency and metadata churn over time.

```sql
SELECT
    date_trunc('hour', committed_at)  AS hour,
    COUNT(*)                          AS commits,
    SUM(CAST(summary['added-data-files'] AS BIGINT))   AS data_files,
    SUM(CAST(summary['added-records']    AS BIGINT))   AS records
FROM prod_catalog.telemetry.device_events.snapshots
WHERE committed_at >= current_timestamp - INTERVAL '7' DAY
GROUP BY 1
ORDER BY 1 DESC;
```

The number to watch is commits per hour against data files per commit. A table committing 700 times an hour with one or two files per commit is a streaming table paying full metadata cost for almost no data. That table is the strongest candidate for the V4 improvements, and it is also the table most worth optimizing today with commit batching or a rewrite schedule.

A table committing twelve times an hour with four thousand files per commit gains very little from single-file commits. Do not spend political capital upgrading it early.

Now check the shape of the file layer, since planning cost depends on it.

```sql
SELECT
    partition,
    COUNT(*)                                  AS file_count,
    ROUND(SUM(file_size_in_bytes) / 1048576.0, 1)     AS total_mb,
    ROUND(AVG(file_size_in_bytes) / 1048576.0, 1)     AS avg_file_mb
FROM prod_catalog.telemetry.device_events.files
GROUP BY partition
HAVING COUNT(*) > 500
ORDER BY file_count DESC;
```

Partitions with thousands of files averaging a few megabytes are the small-file problem, and they inflate manifest counts directly. Fix that with compaction before you worry about spec versions. A table with clean file sizes and a sane manifest count upgrades easily. A table with four hundred thousand tiny files upgrades badly regardless of what the format does.

Finally, confirm the format version of every table you own, because the upgrade gate is per table.

```sql
SELECT key, value
FROM prod_catalog.telemetry.device_events.metadata_log_entries
ORDER BY timestamp DESC
LIMIT 1;
```

Engines differ on how they expose format version. Some surface it in a `properties` metadata table, some in `SHOW TBLPROPERTIES`, some only by reading `metadata.json` directly. Whichever path your engine offers, record the answer for every production table in one place. That inventory is the artifact that turns the V4 transition into a schedule.

Run these queries on a cron and store the results in their own Iceberg table. Six months of history on manifest counts and commit rates gives you the before-and-after evidence that makes the upgrade defensible to whoever signs off on it.

## Failure modes to expect during the transition

Spec transitions break in predictable ways. These are the ones worth planning for.

**The stranded reader.** One team runs a reporting tool on an old connector nobody has touched in two years. The table upgrades, that tool stops reading, and the failure surfaces as a broken dashboard rather than a version error. The fix is the inventory. Every reader gets recorded and tested against a sample upgraded table before anything in production moves.

**The silent slow path.** An engine that understands the new metadata layout partially reads correct data through a compatibility path and gets slower rather than failing. Nothing alerts. Track planning time per table as a metric so degradation is visible.

**The rewrite that undoes the benefit.** A compaction or maintenance job written against older assumptions rewrites metadata into the shape the new format was meant to avoid. Audit your maintenance jobs when you upgrade, not after.

**The catalog that lags.** Engines get upgraded because engine teams are motivated. Catalogs get upgraded when someone remembers. A catalog that does not understand the new structures rejects commits or serves stale capability information. Put the catalog first in the upgrade order, not last.

**The half-migrated fleet with no negotiation.** Without capability headers, a mixed fleet produces failures that look random because they depend on which engine touched the table last. This is the specific problem the REST capability work solves, and it is why moving to a REST catalog before the transition matters more than any single format feature.

**Optimism about timelines.** Ratification is not availability. A spec change that passes a vote in one quarter reaches broad engine support several quarters later. Build roadmaps against engine release notes rather than against spec votes.

## How engines and platforms absorb a spec change

There is a pattern to how format changes reach production, and it is worth understanding because it sets your realistic timeline.

The Java reference implementation lands first, because that is where the spec is validated. Spark follows closely, since the Spark integration lives in the same repository. Flink typically comes next for write paths that stream.

Independent engines move on their own schedule. Some implement in Rust or C++ against the spec rather than the Java library, which means their timeline tracks the written spec rather than the reference code. Query engines with vectorized readers often ship read support well before write support, because reading a new metadata layout is far simpler than committing one correctly.

Catalogs are the other half. A REST catalog has to understand the new metadata structures to serve them, validate commits, and negotiate capabilities. A catalog that lags its engines becomes the bottleneck.

For an architect, the practical question is which combination of engine and catalog in your stack moves last. On the Dremio side, the read path and the Open Catalog powered by Apache Polaris are the two pieces that track spec changes, and since the SAP acquisition the same Iceberg tables also surface into SAP Business Data Cloud. That coupling is worth noting generally rather than specifically: as lakehouse tables get consumed by business platforms and not just engineering tools, the number of systems that need to understand a format version goes up, and the slowest one sets your pace.

Plan the transition as a fleet upgrade with a dependency graph, not as a table property flip.

## Where this ends up

My read on the current state, with the caveat that the vote is the only thing that counts.

Relative paths and content stats are settled. Build with the expectation that they arrive.

The adaptive metadata tree and single-file commits have active design syncs and running implementation work. The mechanism is stable enough to architect around. Specific field layouts will move.

Column families are close to spec-ready and matter most to machine learning workloads.

Typed statistics need production evidence before the community accepts the complexity. The vector search angle makes it strategically interesting, which is exactly why it deserves skepticism until benchmarks appear.

Partition tuple handling and the placement of column-level updates are genuinely contested. Anything you read confidently about those is somebody's preference presented as a plan.

The Delta convergence is a proposal with real momentum and no vote behind it.

One last framing. Every proposal here traces back to the same root cause. Iceberg's metadata layer assumed that tables change slowly and that files are large. Streaming ingestion broke the first assumption and machine learning workloads broke the second. V4 rebuilds the layer around the workloads that actually run on it now, which is the healthiest thing a format specification does.

## Conclusion

Iceberg V4 exists because streaming and AI workloads broke assumptions that held fine for batch analytics. The answer is a flatter, adaptive metadata tree that makes small commits cheap, statistics that extend to new kinds of data, and paths that let tables move without a rewrite.

None of that is final. The parts that are settled reward planning. The parts that are contested reward patience.

The action items are simple. Get tables to V3. Move to a REST catalog. Keep manifest counts reasonable. Produce clean files per micro-batch. Measure metadata volume so you know whether the upgrade delivers. Then read the dev list directly, because the spec is the final word and everything else, this article included, is a starting point.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg internals and lakehouse architecture. *Apache Iceberg: The Definitive Guide* walks through the metadata layers, manifests, and snapshot mechanics that every V4 proposal modifies, and *Apache Polaris: The Definitive Guide* covers the REST catalog side of the transition. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
