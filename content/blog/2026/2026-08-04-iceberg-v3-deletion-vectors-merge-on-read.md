---
title: "How Iceberg V3 Deletion Vectors Fixed Merge-on-Read for Streaming Tables"
date: "2026-08-04"
description: "How Iceberg V3 deletion vectors replaced accumulating positional delete files and made merge-on-read viable for streaming and CDC tables."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Iceberg V3
  - Deletion Vectors
  - Merge-on-Read
  - CDC
  - Streaming
canonical: "https://iceberglakehouse.com/posts/iceberg-v3-deletion-vectors-merge-on-read/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-v3-deletion-vectors-merge-on-read/).

# How Iceberg V3 Deletion Vectors Fixed Merge-on-Read for Streaming Tables

*By Alex Merced, Data Lakehouse and AI Evangelist*

A change data capture pipeline lands updates from an operational database every thirty seconds. Under Iceberg V2 with merge-on-read, each of those commits writes a small positional delete file. By the end of a day, one 512 MB data file is associated with forty separate delete files. A query that touches that data file opens all forty, joins them against row positions, and masks the deleted rows before returning anything.

The write was fast. The read got slower every hour. Teams responded by scheduling aggressive compaction, which competed with ingestion for the commit lock, which caused conflicts, which caused retries. I have watched more than one team conclude that merge-on-read "does not work" and go back to copy-on-write, accepting minute-scale write latency on tables that needed second-scale.

Iceberg V3 deletion vectors remove the accumulation problem at the format level. The mechanism is a bitmap rather than a file per operation, and the difference in behavior at scale is large enough to change which architectures are viable.

This piece covers what a deletion vector is on disk, how the read path uses it, what changes about compaction, and where it still goes wrong.

A disclosure before I start. I work for Dremio, which was acquired by SAP and is now part of SAP Business Data Cloud. Dremio is one of the engines that reads deletion vectors. The mechanics below come from the Iceberg specification and apply to any engine that implements it.

## Copy-on-write and why streaming breaks it

Iceberg supports two strategies for row-level changes, and the choice sits in table properties rather than in the query.

Copy-on-write is the simpler one. Deleting a row means rewriting every data file that contains a matching row, minus those rows. Updating a row means rewriting the file with the new values. The result is a table where every data file is clean: no masking, no merging, no delete metadata to consult.

Reads are as fast as reads on an append-only table, because they are reads on an append-only table. That is the appeal, and for tables that change a few times a day it is the right choice.

The cost lands entirely on writes, and it scales with file size rather than with change size. Deleting one row from a 512 MB Parquet file means reading 512 MB, writing 512 MB, and committing. A CDC batch touching a thousand rows spread across two hundred files rewrites a hundred gigabytes to change a few megabytes of actual data.

Write amplification of that magnitude has second-order effects. Commit duration grows, which widens the window for conflicts with concurrent writers. Storage costs rise from the churn. Snapshot expiration has to run frequently or old versions of rewritten files pile up.

For a pipeline committing every thirty seconds, copy-on-write is not viable. The rewrite takes longer than the interval between commits.

## What V2 merge-on-read got right and wrong

Merge-on-read inverts the tradeoff. Instead of rewriting data files, the writer records which rows are deleted and leaves the data files alone. The reader applies the deletes at query time.

V2 implemented this with two kinds of delete file.

Positional delete files record pairs of data file path and row position. "In file `00042-abc.parquet`, rows 17, 91, and 4402 are deleted." The reader loads these, builds a set of positions to skip, and filters during the scan.

Equality delete files record column values instead of positions. "Any row where `order_id = 88213` is deleted." These are useful for streaming writers that know the key of a changed row without knowing where that row physically lives, which is the normal situation for a Flink job reading a Kafka topic.

Writes got fast. That part worked exactly as designed.

The problem is accumulation. Every commit that deletes rows writes a new delete file. Nothing merges them automatically. A data file accumulates one delete file per commit that touched it, and the reader has to consult all of them.

The read cost is not proportional to the number of deleted rows. It is proportional to the number of delete operations. Ten thousand deletes in one commit produce one file. Ten deletes across a thousand commits produce a thousand files, and the second case is far more expensive to read despite deleting fewer rows.

Two maintenance procedures existed to manage this, and the difference between them confused nearly everyone. `rewrite_data_files` compacts data files and applies deletes into them. `rewrite_position_delete_files` merges delete files without touching data. At scale, running the delete rewrite was close to mandatory, and it competed with ingestion for the same table.

The design was correct in shape and wrong in the file-per-operation detail.

## What a deletion vector is

V3 replaces positional delete files with deletion vectors. Positional deletes remain readable for existing tables, but new deletes in a V3 table use vectors.

A deletion vector encodes deleted row positions for one data file as a bitmap. A set bit at position P means the row at position P is deleted. That is the whole idea, and every property that matters follows from it.

The storage container is a Puffin file. Puffin is Iceberg's format for auxiliary binary blobs, with checksums, compression flags, and forward and backward compatibility built in. It already held statistics like theta sketches for distinct counts. In V3 it also holds deletion vectors, using the `deletion-vector-v1` blob definition.

The bitmap implementation handles large files carefully. Deletion vectors support positive 64-bit row positions, but they optimize for the common case where positions fit in 32 bits by using a collection of 32-bit Roaring bitmaps. A 64-bit position splits into a 32-bit key from the most significant four bytes and a 32-bit sub-position from the least significant four bytes. Each key maps to its own Roaring bitmap holding the sub-positions for that key. Testing whether a position is deleted means finding the bitmap for its key and testing the sub-position for inclusion. No bitmap for a key means nothing in that range is deleted.

Roaring bitmaps matter here for a specific reason. They adapt their internal representation based on density, using sorted arrays for sparse ranges and uncompressed bitmaps for dense ones. A file with three deleted rows and a file with three million deleted rows both get an efficient encoding, without the operator choosing anything.

The manifest tracks each deletion vector by the referenced data file, the offset of the blob within the Puffin file, and its length. Multiple vectors live in a single Puffin file, which keeps the file count down while preserving per-data-file granularity.

## The rule that changes everything

One line in the specification does most of the work: there is at most one deletion vector for a given data file in a snapshot.

Writers must enforce it. When a new delete lands on a data file that already has a vector, the writer merges the new positions into the existing bitmap and writes a replacement. It also has to merge in any existing positional delete files for that data file. When a data file is removed, any vector referencing it is removed too.

That single constraint eliminates accumulation. Forty commits deleting rows from the same data file produce forty successive replacements of one bitmap, not forty files. The read cost tracks the number of deleted rows rather than the number of delete operations.

Compare the two shapes directly.

| Property | V2 positional deletes | V3 deletion vectors |
|---|---|---|
| Files per delete operation | One new delete file | One bitmap replacement |
| Files consulted per data file at read | Grows with commit count | Exactly one |
| Read cost driver | Number of delete operations | Number of deleted rows |
| Storage format | Parquet with path and position columns | Roaring bitmap in a Puffin blob |
| Merge behavior | Manual, through maintenance procedures | Automatic, enforced by the writer |
| Delete file rewrite job | Close to mandatory at scale | Optional and infrequent |
| Read-time work | Join positions across N files | Bitwise test against one bitmap |

The read path change is the practical payoff. An engine scanning a data file loads its single bitmap and masks rows through bitwise operations during the scan. There is no join, no multi-file merge, and no sorting of position lists. The cost of applying deletes drops to close to nothing on a per-row basis.

Equality deletes are unchanged and still supported. They solve a different problem, which is a writer that knows a key but not a position. Engines that use equality deletes for streaming ingest still convert them into vectors during maintenance.

## A worked pipeline

Here is the configuration and the operations for a CDC target table under V3.

```sql
CREATE TABLE prod.logistics.orders (
    order_id      BIGINT,
    customer_id   STRING,
    status        STRING,
    amount        DECIMAL(12,2),
    updated_at    TIMESTAMP
)
USING iceberg
PARTITIONED BY (days(updated_at))
TBLPROPERTIES (
    'format-version'              = '3',
    'write.delete.mode'           = 'merge-on-read',
    'write.update.mode'           = 'merge-on-read',
    'write.merge.mode'            = 'merge-on-read',
    'write.delete.format'         = 'puffin',
    'write.target-file-size-bytes'= '536870912'
);
```

`format-version = 3` is the gate. Deletion vectors do not exist below it.

The three mode properties are separate on purpose, and teams set one and forget the others constantly. `write.delete.mode` governs `DELETE`. `write.update.mode` governs `UPDATE`. `write.merge.mode` governs `MERGE INTO`. A table with delete mode set to merge-on-read and merge mode left at the default still rewrites files on every merge, which is exactly the behavior you were trying to avoid.

`write.delete.format = puffin` directs the engine to write bitmaps rather than positional delete files.

The upsert itself is ordinary SQL.

```sql
MERGE INTO prod.logistics.orders AS target
USING staging.orders_cdc AS source
ON target.order_id = source.order_id
WHEN MATCHED AND source.op = 'D' THEN DELETE
WHEN MATCHED AND source.op = 'U' THEN UPDATE SET
    target.status     = source.status,
    target.amount     = source.amount,
    target.updated_at = source.updated_at
WHEN NOT MATCHED AND source.op != 'D' THEN INSERT *;
```

Under the hood, a matched update becomes two operations: set the bit for the old row position in the deletion vector, and append a new row with the updated values. A matched delete sets the bit and appends nothing. The engine handles the bitmap merge with any existing vector for the affected data file.

Inspecting the result is worth doing at least once, because seeing the file counts makes the behavior concrete.

```sql
SELECT
    file_path,
    content,
    record_count,
    file_size_in_bytes
FROM prod.logistics.orders.delete_files
ORDER BY file_path
LIMIT 50;
```

On a V3 table with vectors, this returns Puffin files, and the count stays proportional to the number of data files with deletes rather than to the number of commits. On a V2 table under the same workload, the same query returns a list that grows all day.

Track the ratio of deleted rows to total rows per file, since that is the number that drives when compaction pays for itself.

```sql
SELECT
    d.file_path,
    f.record_count                             AS total_rows,
    d.record_count                             AS deleted_rows,
    ROUND(100.0 * d.record_count / f.record_count, 1) AS pct_deleted
FROM prod.logistics.orders.delete_files d
JOIN prod.logistics.orders.files f
  ON d.file_path = f.file_path
ORDER BY pct_deleted DESC
LIMIT 25;
```

Files where a large fraction of rows are masked waste scan effort. The engine reads the full file and discards most of it. Those files are the compaction targets.

## What changes about maintenance

Deletion vectors do not remove the need for compaction. They change what compaction is for.

Under V2, delete file rewrite was a defensive job. You ran it because read performance degraded predictably with time, regardless of how much data actually changed. It was maintenance against an artifact of the format.

Under V3, that pressure is gone. Vectors do not accumulate, so the delete rewrite procedure becomes optional and infrequent. What remains is genuine compaction: merging small data files into larger ones and materializing deletes into rewritten files when the masked fraction gets high.

The trigger changes accordingly. Instead of scheduling on a timer, schedule on measured conditions.

Compact a partition when the average data file size falls well below your target, because small files inflate planning cost independent of deletes.

Compact when the deleted fraction of a data file passes a threshold. Twenty to thirty percent is a reasonable starting range. Below that, masking is cheap enough that a rewrite costs more than it saves. Above it, you are reading and discarding a meaningful share of every scan.

Compact when equality deletes have accumulated, since those still require value comparison rather than a bitmap test.

Run snapshot expiration and orphan file cleanup on their own schedule. Puffin files from replaced vectors become garbage once the snapshots referencing them expire, and nothing removes them otherwise.

The scheduling change is a real operational win. Compaction moves from a job that must run to keep the table usable to a job that runs when the data says it is worth running.

## Failure modes

**Mode properties set inconsistently.** The single most common problem. Delete mode is merge-on-read, merge mode is copy-on-write, and the team wonders why their upserts still rewrite gigabytes. Set all three explicitly and verify with `SHOW TBLPROPERTIES`.

**Format version not actually V3.** A table created through a catalog that silently downgrades the format version accepts your merge-on-read properties and writes positional delete files. This has been a real bug in more than one REST catalog implementation. Read the format version back from table metadata after creation instead of trusting the DDL.

**Reader engines that lag.** An engine that understands V2 but not V3 cannot read a table with deletion vectors at all, and the failure mode is a hard error rather than degraded results. Before enabling vectors on a shared table, confirm every reader in the organization supports them. That includes BI tools with embedded connectors, which are the ones nobody inventories.

**High-cardinality equality deletes.** A streaming writer that emits equality deletes on a non-key column produces deletes that apply broadly and cannot be converted into positional form cheaply. Constrain equality deletes to identity columns.

**Scattered small updates across many files.** Deletion vectors make the delete side cheap. The insert side still appends a new row for every update, and those rows land in new small files. A pipeline updating one row per commit produces one small file per commit. Vectors solve the delete accumulation problem and do nothing about the data file accumulation problem.

**Very high deleted fractions with no compaction.** A table where sixty percent of rows in every file are masked reads sixty percent waste on every scan. The bitmap test is cheap. The I/O to read rows that get discarded is not.

**Assuming vectors fix concurrency.** Two writers modifying different rows in the same data file both need to write a replacement vector for that file. The optimistic concurrency check catches the conflict and one retries. Vectors reduce write volume, not commit contention.

## Operational guidance

Start by confirming which of your tables actually need merge-on-read. Append-only tables gain nothing. Tables updated a few times a day are fine on copy-on-write and get faster reads for free. Merge-on-read earns its complexity on tables with frequent, scattered row-level changes: CDC targets, slowly-changing dimensions under continuous load, and tables subject to regular deletion requests for compliance.

Size data files toward the larger end for merge-on-read tables. A bitmap covers one data file, and fewer, larger files means fewer bitmaps and lower per-file overhead. The write amplification argument against large files disappears once you stop rewriting them.

Monitor three numbers. Delete file count relative to data file count tells you whether accumulation is happening, which under V3 means something is misconfigured. Deleted row percentage per file drives compaction decisions. Scan time relative to bytes read reveals when masking overhead is becoming visible.

Test the upgrade path on a copy before touching production. Upgrading a table to V3 is a property change, and existing positional delete files stay valid and readable. New deletes write vectors. Writers merge existing positional deletes into vectors as they touch the affected files. The transition is gradual rather than a conversion event, which is good for safety and means you carry mixed state for a while.

Keep an inventory of engine versions with their V3 support status. Iceberg 1.11 stabilized deletion vectors, and engine adoption tracks the library plus each engine's own release cycle. The upgrade gate is your least capable reader.

Coordinate maintenance with ingestion. Compaction and ingest commit against the same table, and a long-running rewrite of a heavily-written partition loses the race repeatedly. Run compaction on partitions that are no longer receiving writes wherever the partitioning allows it.

## Streaming ingest and the equality delete path

The MERGE example above assumes a batch micro-job. Continuous streaming writers work differently, and the difference is worth understanding because it determines what maintenance you owe.

A Flink job reading a CDC topic sees a stream of keyed changes. It knows that `order_id = 88213` changed. It does not know which data file holds that row or at which position, and finding out requires a lookup against the current table state on every record. At streaming rates, that lookup is the bottleneck.

Equality deletes exist for exactly this case. The writer emits a delete keyed on a column value and moves on. No lookup, no position resolution, no coordination with the read side.

The configuration for a Flink Iceberg sink looks like this.

```java
FlinkSink.forRowData(stream)
    .tableLoader(tableLoader)
    .upsert(true)
    .equalityFieldColumns(List.of("order_id"))
    .writeParallelism(8)
    .append();
```

`upsert(true)` turns each record into a delete plus an insert. `equalityFieldColumns` names the columns that identify a row. Restrict this to a genuine identity key. An equality delete on a low-cardinality column like `status` marks every matching row in scope, which is almost never the intent and is expensive to apply.

The cost of equality deletes is on the read side. An engine applying them compares values rather than testing a bitmap, and it has to apply each equality delete file against every data file in scope whose sequence number is lower. That is closer to a join than to a mask.

Maintenance converts them. A compaction pass reads the equality deletes, resolves them to actual row positions, folds those positions into deletion vectors, and drops the equality delete files. The table ends up in the cheap-to-read shape without the streaming writer ever paying a lookup cost.

That division of labor is the pattern worth internalizing. The writer optimizes for throughput and writes deletes in the form it can produce cheaply. Maintenance converts them into the form the reader wants. Neither side compromises for the other.

Set the conversion schedule against your read latency requirements rather than a fixed interval. A table queried by dashboards every minute needs frequent conversion. A table queried by a nightly batch job tolerates a daily pass.

## Measuring it on your own tables

Vendor benchmarks answer a question you did not ask. Here is a test that answers yours, and it takes an afternoon.

Take a representative production table and make two copies at V2 and V3 with identical partitioning and file sizing. Replay the same change workload against both. The workload matters more than the volume: reproduce your actual pattern of scattered small updates rather than one large batch, because the failure mode being tested is operation count rather than row count.

Run the change workload for a fixed number of commits, say two hundred, without any compaction in between. Then measure four things.

Delete file count per data file. On the V2 table this climbs steadily. On the V3 table it stays at one per affected data file. This is the number that demonstrates the mechanism.

Cold scan time for a full table read. Run it three times and take the median, with engine caches cleared between runs. The V2 number degrades as the commit count rises. The V3 number stays close to flat.

Bytes read as reported by your engine's query profile. This separates delete overhead from data volume. On the V2 table, delete file bytes become a visible share of total I/O.

Planning time. Delete files appear in manifests, and more of them means more metadata to process before the scan starts. This is often where the V2 degradation shows up first, and it is the one teams misattribute to the query itself.

Then run compaction on both and measure again. The V3 table gets less benefit from compaction, which is the point. If your V3 table improves dramatically after a delete rewrite, something is writing positional deletes instead of vectors and you have a configuration problem to find.

Record the numbers. When someone proposes going back to copy-on-write because a query felt slow, a measured comparison ends the conversation faster than an argument about formats.

## What this enables architecturally

Step back from the mechanics and the strategic effect is straightforward. Merge-on-read stopped being a compromise.

Under V2, choosing merge-on-read meant accepting that reads degrade and that a maintenance job stands between you and acceptable performance. That made it hard to justify on tables serving interactive queries. Teams split workloads: a merge-on-read landing table for ingestion and a copy-on-write serving table maintained by a downstream job. Two tables, two storage footprints, and a lag between them.

Deletion vectors collapse that split. One table absorbs continuous row-level change and serves interactive reads without a defensive maintenance schedule holding it together. The landing table and the serving table become the same object.

That matters most for the workloads pushing hardest on lakehouse architecture right now. Operational analytics on CDC feeds. Compliance deletion under retention rules. Feature tables updated by continuous pipelines and read by inference paths that cannot wait for a nightly rebuild.

It also matters for query engines that serve business users directly rather than through an engineering layer. On the Dremio side, the semantic layer sits on top of physical Iceberg tables and serves views to analysts, and since the SAP acquisition those same tables surface into SAP Business Data Cloud. A physical table that degrades between compaction runs pushes that instability all the way up to a dashboard. A table whose read cost tracks actual deleted rows behaves predictably enough to build a serving layer on.

The general principle holds regardless of which engine sits on top. Format-level fixes to read amplification are worth more than any engine-level optimization, because every engine gets them and nobody has to coordinate.

## Where this goes

Deletion vectors are settled and shipping. The interesting work now sits around them.

Row lineage, also part of V3, gives every row a stable identifier that survives rewrites. Combined with vectors, that makes reliable change feeds possible: a downstream consumer reconstructs a stream of changes rather than diffing snapshots. CDC pipelines that currently rebuild state get a much cheaper path.

The V4 metadata work reduces the commit overhead that streaming tables still pay. Vectors fixed the delete side. Adaptive metadata trees and single-file commits address the remaining per-commit metadata cost, which is the other half of the same workload problem.

Puffin as a container keeps growing in importance. It already holds statistics and deletion vectors, and the extension path for indexes and sketches runs through the same format. Understanding Puffin is a better long-term investment than understanding any single blob type inside it.

## Conclusion

The V2 merge-on-read design traded read performance for write performance in a way that got worse over time, because the cost scaled with the number of operations rather than the amount of change. V3 deletion vectors fix that with one rule: one bitmap per data file, merged on write.

The consequences are practical. Delete file rewrite stops being mandatory. Read cost tracks deleted rows instead of commit count. Compaction becomes a decision driven by measured file conditions rather than a defensive routine.

Set all three mode properties, verify the format version came back as three, size files large, monitor deleted fraction, and confirm every reader in your organization understands V3 before you flip a shared table. That covers most of what goes wrong.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg internals and lakehouse operations. *Apache Iceberg: The Definitive Guide* covers the delete layer, Puffin, and the maintenance procedures around them, and *Architecting an Apache Iceberg Lakehouse* works through the ingestion and streaming patterns that depend on merge-on-read. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
