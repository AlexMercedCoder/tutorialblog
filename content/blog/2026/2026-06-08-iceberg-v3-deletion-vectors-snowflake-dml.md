---
title: "Apache Iceberg v3 Deletion Vectors on Snowflake"
date: "2026-06-08"
description: "Apache Iceberg v3 deletion vectors replace positional delete files with binary bitmaps in Puffin files, delivering up to 10x faster DML on Snowflake. Deep dive into architecture, benchmarks, and migration."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - "Apache Iceberg v3 deletion vectors"
  - "Snowflake Iceberg DML"
  - "merge-on-read Iceberg"
  - "copy-on-write Iceberg"
  - "Puffin files"
  - "Iceberg v3 performance"
---

A single row-level DELETE or UPDATE against a 2 TB fact table should not require rewriting hundreds of megabytes of Parquet files. That is the problem Apache Iceberg v3 deletion vectors solve, and it is the most consequential performance change to the Iceberg specification since the format was created.

Deletion vectors became generally available on Snowflake on May 7, 2026, alongside Databricks Runtime 18.0+ and Amazon EMR 7.11. Early benchmarks from AWS show delete operations running 55% faster and consuming 73% less storage than the v2 positional delete approach. The mechanism is simple in concept (binary bitmaps stored in Puffin files) but the implications for merge-on-read performance, compaction strategy, and multi-engine interoperability are worth understanding in detail before you upgrade.

## What Deletion Vectors Replace in v2

To understand what v3 deletion vectors do, you need to understand the two delete mechanisms Iceberg v2 used.

**Position delete files** track deleted rows by file path and row position. When a DELETE or UPDATE runs, the engine writes a new Parquet file listing every (file_path, row_position) pair for the affected rows. At read time, the engine loads these position delete files and performs an O(n) merge join against the base data files, skipping any row whose position appears in the delete set. These files are small but numerous, and they accumulate over time. AWS benchmarks show a single delete operation producing a 1.8 KB Parquet delete file for 100 rows, which is reasonable in isolation but adds up across thousands of operations.

**Equality delete files** track deleted rows by column values. An equality delete file for "DELETE FROM orders WHERE customer_id = 12345" stores the specific column value. The reader must filter out any row matching that value. Equality deletes are useful for deduplication and upsert patterns, but they require scanning the equality delete columns on every read, and they do not scale well for DELETE operations that affect many distinct values.

Both mechanisms suffer from the same fundamental issue: they store delete metadata as Parquet files that must be opened, parsed, and merge-joined during every table scan. The overhead grows with the number of delete files, which is why Iceberg documentation has long recommended periodic compaction of delete files. In practice, many teams neglected this maintenance, and read performance degraded silently over time.

## How v3 Deletion Vectors Work

Iceberg v3 deletion vectors replace positional delete files with compressed binary bitmaps stored in Puffin files. Each bitmap has one bit per row in the base data file. A bit value of 1 means the row is deleted. A bit value of 0 means the row is active. The bitmap index is the row position within the data file, so lookup is O(1) rather than O(log n).

The format uses Roaring Bitmaps, a compressed bitmap structure that is already used extensively in search engines, columnar databases, and Iceberg's own in-memory operations. Roaring Bitmaps split the integer space into 2^16-bit chunks. Dense chunks use a bitset representation. Sparse chunks use a sorted array of 16-bit integers. This hybrid approach means the bitmap storage is proportional to the number of deleted rows, not the total number of rows in the file. A 100-row delete in a 10 million-row file produces a much smaller bitmap than the equivalent position delete file.

The Puffin file format is not new to Iceberg. It was introduced in v2 for storing blob metadata such as column-level Bloom filters and statistics. V3 repurposes Puffin as the storage format for deletion vectors. Each Puffin file can hold multiple blobs, which means a single Puffin file can contain deletion vectors for multiple data files and multiple snapshots. This consolidation is a major improvement over v2, where each delete was a separate Parquet file.

A critical detail of the v3 spec is that every data file must have exactly one deletion vector at write time. This compaction requirement was the subject of significant debate during the spec's development (2023-2025). In v2, engines were not required to compact delete files during writes, which led to unbounded accumulation. The v3 requirement forces engines to maintain a single bitmap per data file, which makes read-time performance predictable regardless of how many DELETE operations have been executed.

Anton Okolnychyi, the Databricks engineer who finalized the deletion vectors spec, described the motivation in a community presentation: "v2 Iceberg did have a notion of deletion vectors, but those were used in memory. On disk you had Parquet files, in memory had bitmaps. Once we got to designing v3, we wanted to see what could be done differently to avoid the overhead of the conversion."

## Performance Benchmarks: v2 vs v3

The AWS Big Data Blog published detailed benchmarks comparing Iceberg v2 positional delete files against Iceberg v3 deletion vectors on Amazon EMR 7.10 with Spark 3.5.5 and Iceberg 1.9.2. The test used an identical dataset of 10,000 rows, a targeted DELETE of 100 rows (IDs 1000-1099), and measured four metrics.

| Metric | Iceberg v2 (Parquet) | Iceberg v3 (Puffin) | Improvement |
|--------|---------------------|-------------------|-------------|
| Delete operation time | 3.126 seconds | 1.407 seconds | 55% faster |
| Delete file size | 1,801 bytes | 475 bytes | 73.6% smaller |
| Full table read time | Baseline | 28.5% faster | 28.5% |
| Filtered read time | Baseline | 23% faster | 23% |

The delete file size reduction is the most important number. The v2 position delete file at 1.8 KB encodes each deleted row as a file path and row position pair. The v3 bitmap at 475 bytes encodes the same information as a compressed integer range. Over thousands of delete operations, this difference compounds dramatically. A table with 10,000 delete operations in v2 would have roughly 18 MB of delete files to scan at read time. The same table in v3 would have roughly 4.7 MB of bitmaps, and those bitmaps would be consolidated into fewer Puffin files.

Snowflake's implementation shows similar characteristics. Snowflake engineers confirmed in their v3 announcement that deletion vectors deliver "up to 10x faster DML" compared to copy-on-write, which rewrites entire data files on every mutation. The 10x figure is workload-dependent and applies most directly to small DELETE and UPDATE operations against large files, which are the worst case for copy-on-write.

The read-time improvement is less dramatic (23-28% in the AWS benchmarks) but consistent. The speedup comes from two sources: fewer bytes to read from storage (compact bitmaps versus verbose Parquet delete files) and simpler merge logic on the read path (O(1) bitmap lookup versus O(log n) merge join against sorted position lists).

## Snowflake's Implementation Details

Snowflake supports Iceberg v3 deletion vectors through its native Iceberg engine integration. Key details from the GA announcement:

New Iceberg tables in Snowflake default to format v2. You must opt in to v3 when creating the table. The upgrade from v2 to v3 is irreversible on Snowflake-managed tables. There is no ALTER TABLE SET ICEBERG_VERSION command. If you need v3, create the table with the correct format version from the start.

For external engines (Spark, Flink) writing to Snowflake-managed Iceberg tables, the v3 write path is supported through the Horizon Iceberg REST Catalog API. Snowflake's REST catalog implementation vends short-lived credentials to external engines for direct-to-storage writes, and the Snowflake commit coordinator handles the metadata updates, including the deletion vector tracking. As of the GA release, external engine writes to v3 tables are in public preview. External reads of v3 tables are fully GA.

Snowflake's GET_DDL function returns an ICEBERG_VERSION column that shows the format version for each table. This is useful for inventory and migration planning.

A pain point worth noting: Trino does not support Iceberg v3 reads as of June 2026. The Trino Iceberg connector development has been slower than the engine-side adoption. If your architecture uses Trino for interactive queries against Iceberg tables, you should verify the Trino version and Iceberg connector support before upgrading any table to v3. The Atlan Iceberg v3 guide (June 2026) explicitly flags Trino as "not v3-ready."

## When to Use Deletion Vectors vs Copy-on-Write

Deletion vectors are not the right choice for every workload. The decision depends on your read-to-write ratio, the size of your DML operations, and your latency requirements.

**Use deletion vectors (merge-on-read with v3) when:**

- Your workload has frequent small DELETEs or UPDATEs against large files. A compliance job that deletes 0.1% of rows across 400 files benefits enormously from not rewriting those files.
- Your read latency requirements can tolerate a small overhead. The 23-28% read-time penalty in the AWS benchmarks is real, even if it is smaller than the v2 overhead.
- You have automated compaction configured. Deletion vectors still need periodic compaction to rewrite base files without their deletion bits. Without compaction, the bitmap metadata grows and read performance degrades over time.
- Your table is large and your storage budget matters. Copy-on-write amplifies write storage by creating full copies of modified files. Deletion vectors only store the delta.

**Use copy-on-write when:**

- Your workload is append-only with no UPDATE, DELETE, or MERGE operations. Copy-on-write adds zero overhead to append-only workloads.
- Your reads cannot tolerate any additional latency. Copy-on-write delivers the fastest possible read path because there is no delete metadata to consult.
- Your DML operations affect a large percentage of rows in each file. If 50% of rows in a file are being updated, it is more efficient to rewrite the file than to maintain a bitmap for the remaining 50%.
- Your engine does not support v3 deletion vectors. In a multi-engine environment where one engine supports v3 and another does not, you must use v2 compatibility or isolate the v3 tables to engines that can read them.

## Compaction Strategy Changes with v3

Compaction is more important with deletion vectors, not less. Even though the bitmaps are compact, they accumulate. Every DELETE, UPDATE, and MERGE operation adds or modifies deletion vectors. Over months of operations, the bitmap metadata can represent a significant fraction of the table's total storage.

The compaction best practice for v3 is to run periodic rewrite_data_file operations that materialize the deletion vectors into the base data files. When a file is rewritten, the active (non-deleted) rows are written to a new Parquet file with no deletion vector. The old file and its bitmap are garbage-collected by the next VACUUM operation.

Snowflake recommends scheduling compaction jobs at a frequency proportional to your write volume. A table with 10,000 DELETEs per day should compact at least daily. A table with 100 DELETEs per day can compact weekly. The tradeoff is compute cost: compaction rewrites data files, which consumes warehouse credits. The metric to track is the ratio of deletion vector bytes to data file bytes. When that ratio exceeds 5% of the data file total, compaction is worth running.

Databricks uses an identical binary format for its deletion vectors in Delta Lake and Apache Iceberg. This cross-format alignment means that a table written by Databricks Delta Lake can be read by Snowflake Iceberg with the same deletion vector semantics. The Databricks blog post on Iceberg v3 specifically calls this out: "Deletion vectors use the same binary encodings in Iceberg and Delta. Customers can interoperate freely between Delta and Iceberg on one copy of data, no rewriting needed."

## Multi-Engine Considerations

The greatest risk with deletion vectors is not performance. It is engine compatibility. If Spark writes a v3 table with deletion vectors and Trino tries to read it without v3 support, the read will fail. The table's snapshot is valid, the data files exist, but Trino does not know how to interpret the Puffin blobs that encode the delete bitmaps.

Your compatibility matrix needs to track four things:

1. Which engines can read v3 tables (Snowflake: GA; Databricks: GA; Spark 3.5+: GA; Trino: not ready; Flink: partial)
2. Which engines can write v3 tables (Snowflake: GA; Databricks: GA; Spark 3.5+: GA; Flink: partial)
3. Whether write operations from different engines produce compatible deletion vectors (yes for the spec, but Databricks and Snowflake implementations may diverge on edge cases)
4. Whether compaction from one engine is compatible with reads from another engine (yes, because compaction is a pure Iceberg operation)

Snowflake's Horizon Catalog provides a unified governance layer that mitigates some of these concerns. The catalog tracks format version per table and can enforce engine-level access policies. You can configure Horizon to prevent v3 writes from engines that do not support the v3 delete path, or to route read requests through an engine that handles the bitmap resolution correctly.

## Migration Path from v2 to v3

Upgrading an existing v2 table to v3 requires two steps, and the operation is irreversible. Here is the verified migration path for Spark-managed Iceberg tables:

```sql
ALTER TABLE db.tbl SET TBLPROPERTIES ('format-version'='3');
```

This command updates the table metadata to format version 3. After this command, any new DML operation (INSERT, DELETE, UPDATE, MERGE) produces v3-compatible metadata. However, existing data files written under v2 are not automatically converted. They remain as v2 positional delete files until the next compaction pass.

The second step is to run a compaction job that rewrites any remaining v2 delete files:

```sql
CALL glue_catalog.system.rewrite_data_files(table => 'db.tbl');
```

This rewrites data files and produces v3 deletion vectors for any remaining deletes. Once compaction completes, the table is fully v3.

The irreversibility warning is not theoretical. If you upgrade a table to v3 and then connect an engine that cannot read v3, you have a production incident. Before upgrading, verify that every engine reading the table supports v3. If you cannot verify that, leave the table at v2 and create new v3 tables for workloads that need the performance improvement.

Snowflake-managed Iceberg tables do not support in-place version upgrade as of the v3 GA. You must create new tables with format version 3. For tables that already exist, the recommended approach is to create a v3 table with the same schema and use an INSERT INTO ... SELECT statement to migrate the data.

## The Bottom Line

Deletion vectors are the most practical improvement in Iceberg v3 for teams that run row-level DML at scale. The 55% faster deletes and 73% smaller delete metadata are measured improvements, not marketing promises. The spec is well-designed, with Roaring Bitmaps in Puffin files providing O(1) read-time lookup and predictable storage overhead.

The adoption risk is engine compatibility. Snowflake and Databricks both support v3 GA, but Trino lags, and the irreversibility of the upgrade means you cannot experiment casually. Start with one table. Measure the delete and read times. Verify that your full engine matrix supports the v3 read path. Then extend to production workloads.

For teams that need row-level mutations at scale across a multi-engine lakehouse, Apache Iceberg v3 deletion vectors are the right technical choice. The format is standardized, the implementations are mature, and the performance data supports the claims.

---

*For more background on Apache Iceberg catalogs, governance, and multi-engine architectures, explore the open source Apache Polaris project at [polaris.apache.org](https://polaris.apache.org). If you want to test Iceberg v3 deletion vectors with a governed, multi-engine lakehouse platform, start a free trial at [dremio.com/get-started](https://www.dremio.com/get-started).*
