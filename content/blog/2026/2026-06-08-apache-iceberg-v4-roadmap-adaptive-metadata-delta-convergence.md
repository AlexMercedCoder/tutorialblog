---
title: "Apache Iceberg v4 Roadmap: Adaptive Metadata Trees, Single-File Commits, and the Delta Convergence"
date: "2026-06-08"
description: "A deep technical breakdown of Apache Iceberg v4's proposed architecture: adaptive metadata trees, one-file commits, relative paths, column families, and what the Delta 5.0 convergence actually means for your data platform."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - apache-iceberg
  - open-table-formats
  - data-engineering
  - lakehouse-architecture
---

Apache Iceberg v4 is not a single feature release. It is a set of architectural proposals—adaptive metadata trees, single-file commits, relative table paths, column families, and an extensible statistics model—that rework how Iceberg handles metadata at scale. Separately, Databricks has proposed that **Delta Lake 5.0 adopt the same metadata structure**, which would end the decade-long schism between the two formats at the metadata level. This article walks through every proposal, the pain points each one solves, the community debates still unresolved, and what teams should do while the spec is still under discussion.

![Iceberg v4 metadata architecture evolution](/images/june8batch/apache-iceberg-v4-roadmap-adaptive-metadata-delta-convergence-diagram-1.png)

## The Problem Iceberg v4 Is Trying to Solve

Iceberg's current metadata tree was designed for batch workloads. A table with one million files, multiple partition evolutions, and hundreds of concurrent writers exposes three structural limitations that v4 proposals target.

### Metadata Write Amplification

Every Iceberg commit creates a new metadata file. For a table with thousands of manifests, a single new data file can trigger a commit that rewrites the manifest list and metadata JSON. Under high-frequency writes—streaming ingestion, CDC pipelines, or agent-generated updates—that amplification makes sub-second commits difficult. The Snowflake engineering team at Iceberg Summit 2026 described the constraint directly: "Iceberg's metadata tree was built for batch workloads, and its write amplification creates commit latencies that streaming can't tolerate."

### Metadata Planning Overhead

Reading a table's current state requires traversing the metadata file → manifest list → manifest files chain. For tables with hundreds of manifests, the planning step can dominate query time even before reading data. Adaptive metadata trees aim to make this traversal O(1) by inlining partition-level statistics directly into a single metadata structure, eliminating manifest indirection for queries that scan a narrow partition range.

### Format Fragmentation

Iceberg and Delta Lake have converged on similar ideas—columnar metadata, deletion vectors, manifest-like tracking—but maintain separate metadata formats. Teams running both formats incur duplicate maintenance tooling, incompatible catalogs, and two sets of operational procedures. Databricks publicly stated at its May 2026 press cycle: "Iceberg v4 and Delta 5.0 will converge on a unified metadata structure, ending the tradeoff between interoperability and production-ready performance."

## Adaptive Metadata Trees: The Core of v4

The adaptive metadata tree is the centerpiece of the v4 proposals. It restructures Iceberg's metadata from a multi-level manifest hierarchy into a flatter, tree-structured model where metadata nodes can be split, merged, or relocated dynamically based on table shape and access patterns.

![Adaptive metadata tree structure](/images/june8batch/apache-iceberg-v4-roadmap-adaptive-metadata-delta-convergence-diagram-2.png)

### How It Works

In the current Iceberg v3 model, metadata is organized as:

```
metadata.json → manifest-list.avro → [manifest-1.avro, manifest-2.avro, ...] → [data-files.parquet]
```

Each layer is a separate file. Reading partition statistics for query planning requires traversing the manifest list and opening each manifest.

In the v4 adaptive tree model, the structure becomes:

```
root-metadata.parquet → [metadata-node-1.parquet, metadata-node-2.parquet, ...] → [data-files.parquet]
```

Key differences:

**Inlined partition statistics.** Each metadata node contains the column-level min/max/null statistics for the data files it tracks, stored as columnar Parquet data. The query planner can read a single node and determine whether to scan its data files without opening additional manifest files.

**Dynamic node splitting.** As a table grows, nodes can be split by partition range, column range, or file count. This is the "adaptive" property: the tree reorganizes itself based on what the workload needs, rather than requiring manual partition design or compaction.

**Single-file commits.** Instead of writing a metadata JSON + manifest list + manifest files for every commit, v4 proposes writing a single Parquet metadata node that contains all the changes. The Snowflake Iceberg Summit recap (June 2026) confirmed: "V4's adaptive metadata trees introduce one-file commits which enable low-latency writes without sacrificing read performance on large tables."

### What Single-File Commits Mean for Streaming

For streaming workloads, the commit latency improvement is the headline benefit. A streaming pipeline writing one file per minute currently creates one full metadata commit cycle per file. With single-file commits, the metadata update is a small Parquet node write followed by an atomic pointer swap in the catalog. The total metadata I/O per commit drops from O(number-of-manifests) to O(1).

This matters for real-time analytics, CDC pipelines, and any workload where agents or automated processes write data at sub-minute cadence. Teams that previously batch-delayed streaming writes to avoid metadata overhead can now commit each micro-batch independently.

### Tradeoffs Under Discussion

The adaptive tree is not universally accepted. The Apache Iceberg community mailing list has active debates about:

**Parquet for metadata.** Replacing Avro manifests with Parquet metadata nodes changes the memory profile of planning. Parquet is columnar and read-optimized, but reading a single metadata node's partition stats requires materializing the entire row group. For tables with thousands of columns in the metadata node, this could increase planning memory usage.

**Tree depth tuning.** If split thresholds are set too aggressively, a table could end up with hundreds of metadata nodes—recreating the same indirection the tree was meant to solve. The adaptive split algorithm needs sensible defaults and operator overrides.

**Backward compatibility with v3 manifests.** The proposals need a migration path where existing v3 tables can be gradually upgraded without rewriting all metadata at once. The current design discussion favors a "hybrid mode" where the root metadata references both legacy manifest lists and new adaptive nodes, with a background compaction job converting manifests to nodes over time.

## Relative Paths: Making Tables Portable

A smaller but operationally significant v4 proposal is **relative path support**. Currently, Iceberg stores absolute file paths in manifest entries:

```
s3://my-bucket/prod/warehouse/orders/partition_date=2026-06-01/00001.parquet
```

This creates friction for migration, disaster recovery, and cloud replication. Moving a table to a different bucket or region requires rewriting every manifest file with new paths.

### The Proposed Solution

Store file references relative to the table root:

```
./partition_date=2026-06-01/00001.parquet
```

The catalog pointer or table property provides the absolute base path. When the table is cloned, mirrored, or failed over, only the base path changes—the metadata stays valid.

This is straightforward for new tables. For existing tables, the migration requires either a one-time metadata rewrite (accepted by the community as an operational cost) or a compatibility mode where the metadata stores both an absolute and relative path for each file entry.

### Why This Matters for Multi-Cloud

Teams running Iceberg across AWS and GCS, or replicating tables for disaster recovery, currently maintain separate metadata copies per location. Relative paths eliminate the need for metadata duplication. A table can be copied from us-east-1 to eu-west-2 by copying the data files and updating one base path property, without touching metadata.

The Databricks engineering team has indicated that Delta 5.0 will adopt the same relative path convention, ensuring that converged metadata trees are portable across clouds regardless of which format's ecosystem they originated in.

## Column Families: Solving the Wide-Table Problem

Machine learning feature engineering produces tables with thousands of columns. The Snowflake Iceberg Summit recap (June 2026) called this out directly: "ML feature engineering produces tables with thousands of columns, and today's layout forces full file rewrites for even small updates."

### How Column Families Work

Column families let the table author group columns into independently stored and versioned sets:

```
-- schema definition
CREATE TABLE features (
  uuid STRING,
  -- core columns
  created_at TIMESTAMP,
  -- feature group A: freshness indicators
  family freshness (
    days_since_purchase INT,
    recency_score FLOAT,
    avg_visit_interval FLOAT
  ),
  -- feature group B: behavioral features (refreshed separately)
  family behavioral (
    lifetime_value FLOAT,
    churn_probability FLOAT,
    category_affinity MAP<STRING, FLOAT>
  ),
  -- feature group C: real-time signals (updated every minute)
  family realtime (
    session_active BOOLEAN,
    current_cart_value FLOAT,
    page_velocity INT
  )
) USING iceberg;
```

Each family can be committed independently. Adding a new feature to the behavioral family rewrites only the behavioral Parquet files, not the entire table. Backfilling a new column into a family compacts the affected family's files without touching the rest of the table.

### Impact on ML Pipelines

Feature stores that manage hundreds of features across training and serving pipelines benefit directly. A feature team can add, modify, or retire features within a family without coordinating compaction windows with other teams. Training pipelines that only read the freshness and behavioral families can skip scanning the realtime family entirely, reducing I/O.

The column families proposal is further along than the adaptive metadata tree—it has a more complete design document and several community members have expressed intent to implement it once the spec draft is published.

## Extensible Column Statistics: Making Planning Smarter

Iceberg's current per-column statistics model stores min, max, and null count for each column in each manifest entry. V4 proposes rebuilding this model to support pluggable statistics types:

- **Approximate distinct counts** (HyperLogLog sketches) for optimizer cardinality estimates
- **Bloom filters** for point-lookup pruning on high-cardinality columns
- **Histogram bins** for range-aware predicate evaluation
- **Vector embeddings** for ANN-style similarity search over embedding columns

The extensible model would let engines register new statistic types that the metadata layer stores and serves during planning. An engine that supports ANN search could register an `embedding_summary` statistic that indexes the vector space of an embedding column; the metadata layer would store and return the index structure as part of scan planning.

This is the most speculative proposal in v4. The core Iceberg committers have asked for production benchmarks showing that the current statistics model is a bottleneck before accepting the complexity of a pluggable system.

## The Delta 5.0 Convergence

The most strategically significant development around Iceberg v4 is not a technical proposal but a competitive alignment. Databricks announced that **Delta Lake 5.0 will adopt the same adaptive metadata tree structure that Iceberg v4 proposes**.

### What Convergence Actually Means

The formats will remain independent—they will not merge into one spec. Each will keep its own commit protocol, catalog integration, and engine-specific optimizations. But the metadata storage layer will be compatible. A metadata node written by Delta 5.0 can be read by an Iceberg v4 client, and vice versa.

This eliminates the metadata-level incompatibility that currently forces teams to choose between Iceberg's broader engine ecosystem and Delta's tighter performance optimization. A table stored in Iceberg format under a Unity Catalog can have its metadata nodes read and understood by Snowflake's Iceberg client, Trino, DuckDB, and any other engine that implements the v4 metadata reader.

### What Remains Different

**Commit protocol.** Iceberg uses optimistic concurrency with retry; Delta uses a transaction log in the storage layer. These are philosophically different approaches that neither side has proposed converging.

**Catalog model.** Iceberg separates catalog from table format via the REST catalog specification. Delta ties the catalog and format more closely through Unity Catalog's managed tables. The convergence applies to the metadata file format, not the catalog layer.

**Engine-specific features.** Liquid clustering, predictive optimization, and materialized views remain Databricks-specific. The adaptive metadata tree gives engines a compatible foundation to read the same metadata; it does not require them to support the same query execution features.

### Where the Catalog Debate Goes from Here

Nidhi Vichare's *Catalog Wars* series (June 2026) makes the point succinctly: "The format question is settled. The catalog question is the one that will define your next decade of optionality." With the metadata layer converging, competitive differentiation moves to catalogs, governance, semantic layers, and agent interfaces.

This shift is already visible. Apache Polaris reached top-level project status in February 2026 and v1.4 added storage-scoped AWS credentials, STS session tags, and CockroachDB backend support. Unity Catalog added cross-engine ABAC (row filters and column masks enforced via REST scan planning, working with Spark and DuckDB). The catalog—not the table format—is becoming the control plane for multi-engine governance.

## Practical Guidance for Teams Evaluating Iceberg v4

![Implementation decision tree](/images/june8batch/apache-iceberg-v4-roadmap-adaptive-metadata-delta-convergence-diagram-3.png)

### What to Do Now

Iceberg v4 is in the proposal phase. No specification draft has been published. No engine supports any v4 feature in production. The timeline from the community discussions suggests a spec draft by late 2026, an experimental implementation by mid-2027, and production availability by late 2027 at the earliest.

**For new tables beginning in mid-2026:** Design partitioning and file layout with the understanding that v4 metadata migration will be one-directional. Avoid metadata structures that are difficult to convert—tables with extremely deep manifest trees, custom clustering that produces thousands of manifests per partition, or manual partitioning schemes that overlap with v4's adaptive split algorithm. None of these will break under v3, but they will make the v4 upgrade path more expensive.

**For streaming and high-frequency write workloads:** If your pipeline currently batches writes to avoid metadata overhead, the v4 single-file commit proposal directly addresses that constraint. Design your pipeline to produce independent files per micro-batch today; the metadata commit improvement is a format-layer change that your pipeline can adopt without restructuring.

**For ML feature tables:** The column families proposal is close to spec-ready. If your feature engineering pipeline produces tables with hundreds of columns refreshed on different schedules, begin documenting column groups now. The v4 migration will be easier if you already know which columns belong together.

### What to Watch

- **The Apache Iceberg mailing list** for the v4 spec draft publication. Subscribe to the `dev@iceberg.apache.org` list and watch for threads with "[V4]" in the subject.
- **Iceberg Summit 2026 session recordings**, particularly "Breaking the Mold: Re-thinking Iceberg Metadata Structure in V4" ([watch](https://youtu.be/ymUCDJV19tE)) and the closing panel on ecosystem innovations ([watch](https://youtu.be/szWvGm5busw)).
- **Databricks Data + AI Summit 2026** session "Delta + Iceberg, Better Together" for the Delta 5.0 convergence details and timeline.
- **Proposed v4 features per the community roadmap**:
  - Adaptive metadata tree: spec draft targeted late 2026
  - Single-file commits: bundled with adaptive tree
  - Relative paths: independent proposal, could ship earlier
  - Column families: could ship as a v3.x extension before v4
  - Extensible statistics: earliest viable Q1 2027

### Where Dremio Fits

Dremio's architecture sits above the table format layer. Dremio queries Iceberg tables through the REST catalog protocol, applies semantic views on top of raw table schemas, and accelerates queries with Reflections and its columnar cloud cache. The Iceberg v4 changes benefit Dremio users because:

- **Faster planning on large tables.** Adaptive metadata trees reduce the metadata traversal cost for tables with hundreds of manifests, which directly improves query planning latency on Dremio's execution engine.
- **Cleaner replication and migration.** Relative paths simplify the process of pointing Dremio at a migrated or replicated Iceberg table without rewriting metadata paths.
- **Better performance on ML and streaming workloads.** Column families and single-file commits make the underlying Iceberg tables more efficient for the types of workloads Dremio's semantic layer and agent interfaces are designed to query.
- **No catalog lock-in.** Dremio's REST catalog support means it can point at any v4-compatible catalog—Polaris, Unity Catalog, Snowflake Horizon, Nessie—and query the same adaptive metadata trees without platform-specific configuration.

The Dremio MCP server and AI Agent can take advantage of faster metadata planning to provide sub-second responses on agentic queries against large Iceberg tables, and the convergence between Iceberg v4 and Delta 5.0 means more of your organization's data—regardless of which format it was originally written in—becomes accessible through Dremio's governed semantic layer.

## Bottom Line

Iceberg v4 reworks the metadata architecture that has served the format since 2017. Adaptive metadata trees replace manifest-based indirection with a flatter, columnar structure that reduces commit latency and planning overhead. Relative paths make tables portable across clouds. Column families tackle the ML wide-table problem head-on. And the Delta 5.0 convergence—if it ships as proposed—closes the metadata-level gap between the two formats, shifting competitive differentiation to catalogs, governance, and semantic layers.

For teams planning their 2026–2027 data architecture, the right approach is to view v4 as a direction, not a deliverable. Design for the principles v4 embodies—scalable metadata, portable tables, column-aligned storage, and format-neutral interoperability—without depending on any v4 proposal that has not shipped. The Iceberg community's strongest asset is its track record of shipping spec changes in collaboration with dozens of engine and platform vendors. The v4 roadmap continues that tradition with its most ambitious set of architectural proposals yet.

For more detail on the Iceberg Summit 2026 announcements and the full session library, visit the [Iceberg Summit 2026 YouTube Playlist](https://youtube.com/playlist?list=PLkifVhhWtccxSA6VskdKdLnIwCJevOqFL). To try Iceberg querying with Dremio's semantic layer and agent interfaces, start a free trial at [dremio.com/get-started](https://www.dremio.com/get-started).
