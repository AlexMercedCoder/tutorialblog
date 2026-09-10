---
title: "Partition Statistics Files in Apache Iceberg"
date: "2026-09-10"
description: "The underused Iceberg metadata for planning: what the partition statistics file holds, what the spec guarantees, how to write one, and when it earns its slot."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - query planning
  - metadata
  - partition statistics
  - performance
canonical: https://iceberglakehouse.com/posts/iceberg-partition-statistics-files/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-partition-statistics-files/).

A table with 40,000 partitions takes eleven seconds to plan a query that scans three of them. The scan itself finishes in two. Somebody looks at the query profile, sees that most of the time went into planning, and asks the reasonable question: why does the engine have to read so much metadata to figure out it needs almost none of it?

The answer is that the engine is doing the only thing available to it. To know which partitions hold relevant data, it reads manifests. To know how much data those partitions hold, so it can size the job and pick a join strategy, it reads manifests. Partition-level facts that a query planner wants in a single lookup are spread across a manifest set it has to open and evaluate.

Iceberg has a purpose-built answer to this that has been in the specification since 2023 and that almost nobody writes: the partition statistics file. One file per snapshot, holding one row per partition, with the counts and sizes a planner wants. Optional, ignorable by readers, cheap to produce, and largely absent from production tables.

This piece covers what the file holds, what the specification actually guarantees about it, how to write and maintain one, what reads it today, and when it earns the maintenance slot it costs. I work at Dremio, which builds a query engine, so I have a professional interest in planning being fast. The specification details are open and checkable.

## What query planning has to figure out

Planning a scan against an Iceberg table means answering three questions, and the third one is where partition statistics fit.

**Which files hold matching rows?** The pruning question. Iceberg answers it hierarchically: the manifest list carries partition summaries per manifest, so entire manifests get skipped, and surviving manifests carry per-file partition values and column bounds, so individual files get skipped. This works well and it is the reason Iceberg planning scales at all.

**Where are those files?** Straight out of the surviving manifest entries.

**How much data is this going to be, and how is it distributed?** The sizing question. The engine wants row counts and byte sizes per partition to decide parallelism, to choose between a broadcast and a shuffle join, to estimate whether a filter is selective, and to order joins sensibly. Today it derives those numbers by reading manifest entries and aggregating them, which means the cost of knowing the shape of a table scales with the number of files in it.

That third question is the one a partition statistics file answers directly. Instead of aggregating hundreds of thousands of manifest entries to learn that partition `2026-09-01` holds 4.2 million rows in 38 files totaling 19 GB, a planner reads one row.

The distinction worth holding onto: **pruning and sizing are different jobs.** Manifests are good at pruning, because their structure matches the pruning question. They are a poor fit for sizing, because sizing wants an aggregate and manifests hold the individual records the aggregate is computed from. Partition statistics files are the pre-computed aggregate.

## The statistics Iceberg has, and which is which

Iceberg has several kinds of statistics and they get confused with each other constantly, including by people who work on this daily. Sorting them out first makes the rest of this clearer.

| Statistic | Lives in | Scope | Written by default |
|---|---|---|---|
| Column bounds and null counts | Manifest entries | Per data file, per column | Yes |
| Partition summaries | Manifest list | Per manifest | Yes |
| Snapshot summary | Table metadata | Per snapshot, aggregate | Yes |
| Table statistics, including NDV | Puffin files | Per table, per column | No |
| Partition statistics | Partition statistics files | Per partition | No |

The two written by default are the ones every engine relies on. The two that are not are the ones this article and the Puffin conversation are about.

**Puffin table statistics** hold column-level sketches, most importantly the number of distinct values per column, computed with a Theta sketch. They answer questions about cardinality across the table. Some engines write and use them, support is not universal, and the Spark procedure for producing them is separate from the one discussed here.

**Partition statistics** hold structural facts per partition: how many rows, how many files, how many bytes, how many delete files. They answer questions about distribution across partitions. Data-level and structure-level, and they are complementary rather than alternatives.

The Iceberg specification is direct about their status. Partition statistics are not required for reading or planning, and readers are free to ignore them. That sentence is the reason adoption has been slow, and it is also what makes them safe to adopt: writing them cannot break a reader that does not know about them.

## What the specification actually says

The spec details matter here more than usual, because several of them constrain how you operate these files.

**One file per snapshot, at most.** Each table snapshot is associated with at most one partition statistics file. The file is not a running document that gets appended to. It corresponds to a specific snapshot's state.

**Registration is required for validity.** A partition statistics file has to be registered in the table metadata to count. The `partition-statistics` field in table metadata is an optional list of structs, each naming the snapshot ID, the file path, and the file size. A statistics file sitting in object storage that nothing registered is an orphan, not a statistic.

**The file is stored in a normal data format.** Statistics for each unique partition tuple are stored as a row in one of the table's supported data file formats, Parquet or ORC for example. There is no special binary format to learn. You can read a partition statistics file with any Parquet reader.

**Rows are sorted by partition.** The rows must be sorted in ascending order by partition field, with nulls first, so a reader scanning for a specific partition filters efficiently rather than reading the whole file. That ordering is a requirement rather than a suggestion, and a writer that ignores it produces a file that is technically parseable and operationally useless.

**Writing is optional and timing is flexible.** A writer optionally produces the statistics file during a write operation, or the file gets computed on demand afterward. Both are legitimate. In practice almost everything today computes on demand, because engines have not built statistics production into their commit paths.

The row content covers the partition tuple itself, the partition spec ID it was computed against, and the counts: data record count, data file count, total data file size, and the position and equality delete file counts and record counts, plus a timestamp and snapshot ID for when the partition was last updated. The exact field list evolves with the spec, so read the current version rather than a summary when you are building against it.

One design note worth appreciating: because the partition tuple is stored alongside the spec ID it belongs to, partition evolution does not invalidate the file. A table that changed its partitioning keeps meaningful statistics for the old layout and the new one, which matters because partition evolution is one of the features that draws people to Iceberg in the first place.

## Writing them

The Spark procedure is one line:

```sql
CALL catalog.system.compute_partition_stats('sales.orders');
```

That computes statistics for the current snapshot and registers the resulting file in table metadata. To target a specific snapshot:

```sql
CALL catalog.system.compute_partition_stats(
  table => 'sales.orders',
  snapshot_id => 8574923847592837
);
```

The behavior that makes this practical is incremental computation. The procedure computes stats from the last snapshot that has a partition statistics file up to the requested snapshot, merges the result, and writes a combined file. It performs a full computation only when no previous statistics file exists. So the first run on a large table is expensive and every subsequent run costs in proportion to what changed, which is the same economic shape that makes incremental compaction affordable.

The Java action gives you the same thing programmatically, with the resulting file handed back so you can log or verify it:

```java
ComputePartitionStats.Result result = SparkActions.get()
    .computePartitionStats(table)
    .execute();

PartitionStatisticsFile statsFile = result.statisticsFile();
if (statsFile != null) {
    LOG.info("Wrote partition stats for snapshot {} to {} ({} bytes)",
             statsFile.snapshotId(), statsFile.path(), statsFile.fileSizeInBytes());
} else {
    LOG.info("No partition statistics collected");
}
```

The null return is worth handling rather than assuming. An empty table, or a snapshot with nothing to compute, produces no file, and code that dereferences the result blindly fails on exactly the tables where nothing was wrong.

Reading the result back is ordinary Parquet work, which is the nicest property of the whole design:

```python
import pyarrow.parquet as pq

# The path comes from the table metadata's partition-statistics entry
stats = pq.read_table("s3://lake/sales/orders/metadata/partition-stats-8574923847592837.parquet")
df = stats.to_pandas()

# The distribution question, answered without touching a manifest
print(df.nlargest(10, "total_data_file_size_in_bytes")[
    ["partition", "data_record_count", "data_file_count", "total_data_file_size_in_bytes"]
])
```

That last query is the one I reach for most, and it is worth dwelling on. Ten lines of Python against a single file tells you which partitions are large, which are fragmented, and which are empty. Getting the same answer from the `files` metadata table means aggregating across every file entry in the table, which on a large table is a real query rather than a lookup.

## What reads them today

Here is the honest position, because overselling this feature is how people end up disappointed.

**Adoption is limited.** The specification has supported partition statistics since 2023, the Spark tooling exists and works, and most engines do not consume the files during planning. The spec explicitly permits ignoring them, and most implementations exercise that permission. Writing partition statistics today does not automatically make your Trino queries faster.

**They are useful to you regardless.** This is the part people miss. A partition statistics file is a compact, queryable, per-snapshot description of your table's distribution, stored in Parquet, requiring no engine support to read. Every operational question about a table's shape becomes a cheap query against one small file rather than an aggregation across a manifest set:

- Which partitions are oversized and need splitting?
- Which partitions have many small files and should be compacted next?
- Which partitions accumulated delete files and need a rewrite?
- Which partitions are empty and represent a partitioning scheme that stopped matching the data?
- How is row count distributed, and is skew hurting parallelism?

Those questions drive maintenance decisions, capacity planning, and partition design. Answering them from statistics files instead of from metadata table scans is both faster and cheaper, and it works on any engine that reads Parquet.

**Engine support is arriving unevenly.** Support is being built where planning cost is most acute, which means large tables with many partitions. Check your specific engine and version rather than assuming, and treat consumption as an upside rather than the justification.

So the honest case for writing them in 2026 is: they cost little, they break nothing, they immediately make your own operational tooling better, and they position the table to benefit when engine support lands without a migration. That is a reasonable trade for a procedure call in a maintenance job.

## How the file relates to the rest of the metadata tree

A quick orientation, because knowing where this file sits explains most of its properties.

An Iceberg table is a chain. Table metadata names the current snapshot and the list of every snapshot. Each snapshot names one manifest list. A manifest list names the manifests belonging to that snapshot, with partition summaries per manifest. Each manifest names data files, with partition values and column bounds per file.

Everything in that chain is required for correctness. A reader that ignores any of it reads the table wrong.

The partition statistics file hangs off the side of that chain rather than sitting inside it. Table metadata carries an optional list pointing at statistics files, each tied to a snapshot ID. Nothing in the read path traverses it. Deleting every statistics file from a table leaves a perfectly functional table, and that is by design.

Two consequences follow from being off to the side.

**Statistics cannot corrupt a table.** A wrong statistics file produces bad estimates and never bad results, since the data path never consults it. That makes this an unusually safe feature to adopt, and it is the reason a maintenance team can add the procedure without a lengthy review.

**Statistics have to be maintained deliberately.** Nothing in the commit path keeps them current, so they are as fresh as the last time somebody computed them. Metadata inside the chain updates itself as a byproduct of writing. Metadata beside the chain does not.

That same shape describes Puffin table statistics, which also hang off table metadata under their own field and are also ignorable. Iceberg has settled into a pattern here: correctness-critical metadata lives in the chain and is maintained automatically, while optimization metadata lives beside it, is optional, and is maintained by whoever cares. Knowing which category a piece of metadata belongs to tells you immediately whether you have to look after it.

## When they earn their slot

Not every table deserves partition statistics, and the discriminating factor is partition count rather than table size.

**Tables with thousands of partitions.** This is the primary case. The cost of aggregating manifest entries to learn a table's distribution grows with the number of files, and tables with many partitions have many files nearly by definition. A table with 50 partitions answers distribution questions from a quick metadata scan. A table with 50,000 does not.

**Tables where planning time is a visible share of query time.** Measure before assuming. If a query's profile shows planning at 5% of runtime, the ceiling on any planning improvement is 5%. If it shows 60%, which happens on selective queries against wide partition spaces, there is real room.

**Tables under active partition design.** When you are deciding whether to partition by day or by month, whether to add a bucket transform, or whether an existing scheme has degraded, per-partition row counts and file counts are the evidence. Producing them from statistics files rather than from repeated metadata queries makes the analysis loop fast enough to actually do.

**Tables feeding automated maintenance decisions.** A maintenance system choosing which partitions to compact next wants file-count-per-partition, ranked. Reading that from one Parquet file per table, per snapshot, is a much better foundation than scanning `files` across every table nightly.

**Tables with heavy delete activity.** The delete file counts in the statistics rows tell you where merge-on-read debt is accumulating, per partition, which is exactly the input to deciding where to apply deletes. On a CDC-fed table this is the single most actionable number in the file, because delete debt is invisible in every other routine view of a table and it degrades read performance continuously until somebody rewrites the affected partitions.

**Tables that feed capacity planning.** Record counts per partition, compared across snapshots weeks apart, give you growth rate per partition rather than for the table as a whole. Aggregate growth hides the case where one partition key is growing fast enough to become a problem while the total looks flat, and that case is the one that produces a surprise.

Where they do not earn it: small tables, tables with few partitions, unpartitioned tables, and tables that get written once and read rarely. The procedure is cheap and it is not free, and a maintenance job that computes statistics for ten thousand tiny tables is spending real time to produce files nothing reads.

A reasonable default policy: compute partition statistics for tables above a partition-count threshold, on the same schedule as other maintenance, and skip everything else. The threshold is a judgment call and somewhere around a thousand partitions is a defensible starting point.

## Operating them

Five operational properties, each of which has bitten somebody.

**Statistics are snapshot-scoped, so they go stale on every commit.** A statistics file registered against snapshot 100 describes snapshot 100. After a write creates snapshot 101, the file is still valid and still describes an older state. A reader consuming statistics has to decide whether stale-by-one-commit statistics are acceptable, and the answer for planning purposes is usually yes, since distribution changes slowly. For operational queries about the table's current shape, be aware you are looking at a snapshot rather than at now.

**Recompute cadence should match write cadence, loosely.** A table written hourly and analyzed daily wants daily statistics. A table written once a week wants statistics after each write. Coupling recomputation to the maintenance job that already runs is the simplest arrangement, and the incremental computation makes the cost proportional to change.

**Ordering within the maintenance pipeline matters.** Compute statistics after compaction, not before. Compaction changes the file layout substantially, which is exactly what the statistics describe, so statistics computed before compaction are wrong within minutes. The natural sequence is expire, clean orphans, compact, rewrite manifests, then compute statistics, which puts them last for a reason.

**Statistics files participate in table lifecycle.** They are registered in metadata and removed when the table is purged, and older statistics files associated with expired snapshots become candidates for cleanup. Treat them as part of the table rather than as side files, and confirm that your orphan cleanup does not consider a registered statistics file an orphan, which is a question worth verifying rather than assuming on any engine.

**Concurrency is not a concern, and that is worth knowing.** Computing statistics reads metadata and writes one new file, then registers it. It does not rewrite data files, does not contend with writers for the same objects, and produces a metadata commit that is small and quick. Running it alongside ingestion is safe in a way compaction is not, which means it fits into schedules where heavier maintenance does not.

**Old statistics files accumulate.** Each computation writes a new file registered against a new snapshot, and the previous ones stay registered until something removes them. On a table computing statistics daily for a year, that is a few hundred small files carried in table metadata. Nothing breaks, and the metadata JSON grows, so pruning entries for expired snapshots belongs in the same cleanup that handles the rest of the lifecycle.

**Size is negligible.** One row per partition holding a handful of numbers. A table with 100,000 partitions produces a statistics file measured in megabytes. Storage cost is not a consideration here, which is unusual and pleasant.

A maintenance job that includes them looks like this, with statistics last:

```sql
-- 1. Expire first so compaction does not rewrite about-to-be-dereferenced files
CALL catalog.system.expire_snapshots(
  table => 'sales.orders',
  older_than => TIMESTAMP '2026-09-03 00:00:00.000',
  retain_last => 10
);

-- 2. Compact only what changed
CALL catalog.system.rewrite_data_files(
  table => 'sales.orders',
  strategy => 'binpack',
  where => 'order_date >= current_date() - INTERVAL 2 DAYS',
  options => map('target-file-size-bytes', '536870912', 'min-input-files', '5')
);

-- 3. Cluster manifests by partition so pruning stays fast
CALL catalog.system.rewrite_manifests('sales.orders');

-- 4. Describe the result
CALL catalog.system.compute_partition_stats('sales.orders');
```

Four calls, and the fourth is the one nobody runs. Adding it costs a line in a job that already exists, and the incremental computation keeps that line cheap for as long as the job runs.

## Partition design decisions the file makes visible

Partitioning is the design choice with the largest effect on Iceberg query performance and the one teams have the least evidence for. Statistics files turn several of those judgment calls into measurements.

**Over-partitioning.** The classic mistake: partitioning by day when the table receives a few thousand rows a day, producing thousands of partitions holding one small file each. Queries pay planning cost across a large partition space to read almost nothing. The signature in a statistics file is unmistakable, a long tail of partitions with `data_file_count` of one and small `data_record_count`. Counting how many partitions hold less than, say, a hundred megabytes gives you the number to bring to the conversation about switching from day to month.

**Under-partitioning.** The opposite: partitions large enough that queries filtering on the partition column still scan far more than they need. The signature is a small number of partitions with very large record counts, and the fix is a finer transform or an added partition field.

**Skew.** Partitions that differ in size by orders of magnitude create stragglers, since the task processing the biggest partition sets the job's completion time. Ranking partitions by record count and looking at the ratio between the largest and the median tells you whether skew is a real problem on this table or a theoretical one. Bucket transforms on a high-cardinality column are the usual remedy, and knowing the actual distribution is what tells you how many buckets.

**Whether a partition scheme has stopped matching the data.** Data changes shape. A table partitioned by region when three regions carried equal traffic looks different after one region grows tenfold. Comparing statistics files across snapshots months apart shows the drift, and that comparison is trivial because both are Parquet files with the same schema.

**Whether partition evolution worked.** After evolving a spec, statistics carry the spec ID alongside each partition tuple, so you can see how much data still lives under the old layout and how the new one is filling in. That is the direct evidence for whether a backfill is needed or whether natural turnover will handle it.

Each of those is a conversation that usually happens with opinions and gut feeling. Having a file that answers them in a single read changes the tenor of the conversation, and it is available to anyone who can read Parquet rather than only to whoever knows the metadata table incantations.

## What computing them costs

The cost question deserves numbers rather than reassurance, because "cheap" is not a budget line.

**The first run is a full pass over metadata.** It reads manifest entries for the snapshot and aggregates them per partition. The work is proportional to file count, not to data volume, since it never opens a data file. On a table with a million files this is a real Spark job measured in minutes. On a table with ten thousand files it finishes in seconds.

**Subsequent runs are incremental.** The procedure starts from the last snapshot carrying a statistics file and processes forward, so the work is proportional to what changed since. A table receiving 1% of its files per day pays roughly 1% of the initial cost per daily run.

**No data files are read.** Worth stating plainly, because it is the reason this is affordable at all. Everything in a partition statistics file is derivable from manifest entries, which are small Avro files. Compare that to a Puffin table statistics computation, which computes column sketches and does read data.

**Output size is trivial.** One row of numbers per partition. A hundred thousand partitions produces a file in the low megabytes.

**The requests are modest.** Reading manifests for a snapshot is a few hundred to a few thousand GET requests on most tables, at GET-tier pricing. The line item does not appear on a bill you can see.

Put together: budget one substantial job for the first run per table, then a few seconds of incremental work per maintenance cycle. Against the compaction line item in the same job, statistics computation is a rounding error. The thing to schedule deliberately is only that first pass on your largest tables.

## Rolling this out across a platform

Adding a procedure call to a job is easy. Adding it across a few hundred tables without a bad week takes an order.

**Pick the eligible set by partition count, not by importance.** Query the tables you have, count partitions, and select the ones above your threshold. Statistics on a table with forty partitions produce a file nobody benefits from.

**Run the initial computation as a separate campaign.** Not inside the nightly maintenance job. A batch of first-run computations against your largest tables, scheduled deliberately, sized for the work, and completed before the recurring job takes over. Mixing first runs into a nightly window is how a maintenance job that finished at 3am starts finishing at 7am.

**Verify the first file per table.** The three reconciliation checks above, run once per table after its initial computation. Catching a wrong-snapshot or partial computation now is much cheaper than discovering it after tooling was built on the output.

**Then add the call to the recurring job, positioned last.** After compaction and manifest rewriting, for the ordering reason described earlier.

**Build one consumer before declaring victory.** A feature nothing reads decays quietly. The compaction-candidate ranking is the natural first consumer because it pays for itself immediately, and having a real consumer means somebody notices when statistics stop being written.

**Monitor that they are being written.** The registration entry in table metadata is the check: for each eligible table, does a statistics entry exist and does its snapshot ID trail the current snapshot by less than your recompute interval. That query across the platform is one dashboard tile and it catches the silent failure where a procedure started erroring inside a job whose overall exit code stayed green.

## Things that go wrong

**Statistics computed against the wrong snapshot.** A job that captures a snapshot ID early and computes statistics against it after other maintenance has committed produces statistics describing a state that is two commits old. Let the procedure default to the current snapshot unless you have a specific reason not to.

**The first run times out.** On a very large table with no previous statistics file, the initial computation is a full pass over the metadata and it is expensive. Run the first one deliberately, sized appropriately, outside the regular maintenance window. Every run after it is incremental and cheap, so this is a one-time cost that surprises people because they scheduled it as if it were routine.

**Expecting query improvements that do not materialize.** Covered above and worth repeating as a failure mode, because a team that writes statistics and then benchmarks queries expecting a speedup concludes the feature is broken. It is not broken. The engine chose not to read them. Verify engine support before promising anyone a latency improvement.

**Confusing them with Puffin table statistics.** Two different features, two different procedures, two different purposes. A team that ran `compute_table_stats` and expected per-partition numbers, or the reverse, has a confusing afternoon. NDV and column-level sketches come from the Puffin path. Per-partition counts and sizes come from this one.

**Assuming the file is a live index.** It is a snapshot-scoped description, not a continuously maintained index. Code that reads a statistics file and assumes it reflects the current table state is correct only until the next commit.

**Partition spec changes without recomputation.** After a partition evolution, statistics computed under the old spec still describe files written under the old spec, which is correct and also incomplete for the new layout until you recompute. Add a statistics computation to whatever runbook covers partition evolution.

## Building operational tooling on them

The strongest near-term argument for writing partition statistics is what you build on top of them, so here is a concrete version.

A maintenance planner needs to answer, per table, which partitions to compact next. Without statistics it aggregates the `files` metadata table:

```sql
SELECT partition, count(*) AS file_count, avg(file_size_in_bytes) AS avg_bytes
FROM catalog.sales.orders.files
GROUP BY partition
ORDER BY file_count DESC
LIMIT 20;
```

That query reads every file entry in the table. Run it across a thousand tables nightly and it is a meaningful workload of its own, which is why most platforms do not run it and instead compact on a fixed schedule, which is the waste discussed in every maintenance cost conversation.

With statistics files, the same ranking comes from reading one small Parquet file per table:

```python
import pyarrow.dataset as ds

def compaction_candidates(stats_path, min_files=20, max_avg_bytes=64 * 1024 * 1024):
    table = ds.dataset(stats_path, format="parquet").to_table().to_pandas()
    table["avg_bytes"] = (
        table["total_data_file_size_in_bytes"] / table["data_file_count"].clip(lower=1)
    )
    hot = table[
        (table["data_file_count"] >= min_files)
        & (table["avg_bytes"] <= max_avg_bytes)
    ]
    return hot.sort_values("data_file_count", ascending=False)

candidates = compaction_candidates("s3://lake/sales/orders/metadata/partition-stats-857492.parquet")
print(candidates[["partition", "data_file_count", "avg_bytes"]].head(20))
```

The difference is not the code. It is that the second version costs a single small file read, so running it across every table on the platform is affordable, which makes per-partition targeted compaction practical where it previously was not. That change in what is affordable is worth more than a planning improvement in any single query.

The same file supports a delete-debt ranking, using the delete counts in the statistics rows to find partitions carrying merge-on-read debt, and a skew report using record counts to find partitions large enough to bottleneck a job. Three useful reports from one file that costs one procedure call to produce.

## A walk through one file

Reading an actual partition statistics file makes the shape concrete, and it takes about five minutes on any table you have.

Start by finding out whether the table has one. The registration lives in table metadata, so the metadata JSON is the authority:

```python
import json
from pyiceberg.catalog import load_catalog

catalog = load_catalog("lake", **{"type": "rest", "uri": "https://catalog.internal/api/catalog"})
table = catalog.load_table("sales.orders")

meta = json.loads(table.metadata.model_dump_json())
entries = meta.get("partition-statistics", [])
if not entries:
    print("No partition statistics registered on this table")
else:
    for entry in entries:
        print(entry["snapshot-id"], entry["statistics-path"], entry["file-size-in-bytes"])
```

An empty list is the normal result on almost every table in existence, which is the point of this article.

After running the compute procedure, that list holds an entry, and the file behind it opens like any other Parquet file. What you see is one row per partition tuple, sorted by partition value with nulls first, carrying the counts. The sort order is the detail worth confirming in your own output, because a reader filtering for a single partition depends on it, and a file written out of order still parses.

Three checks on a freshly written file tell you it is healthy.

**Row count equals partition count.** Compare against a `SELECT count(distinct partition)` from the `files` metadata table. A mismatch means the computation ran against a different snapshot than you expected.

**Totals reconcile.** The sum of `data_record_count` across all rows should match the table's total row count for that snapshot, which the snapshot summary carries. This is the strongest single check available and it takes one query on each side.

**The snapshot ID matches what you targeted.** The file records the snapshot it describes. Verifying it against the snapshot you meant to compute catches the wrong-snapshot failure described earlier before anything downstream depends on it.

```python
import pyarrow.parquet as pq

stats = pq.read_table(entries[-1]["statistics-path"]).to_pandas()
print("partitions:", len(stats))
print("total records:", stats["data_record_count"].sum())
print("total bytes:", stats["total_data_file_size_in_bytes"].sum())
print("partitions with deletes:",
      (stats["position_delete_file_count"] + stats["equality_delete_file_count"] > 0).sum())
```

Field names track the specification and shift as it evolves, so print the schema before writing code against it rather than trusting a name from an article. That is a general habit worth having with Iceberg metadata, since the spec moves faster than the writing about it.

## What this replaces in practice

Teams already answer distribution questions. They just answer them expensively, and seeing the current approaches side by side clarifies what changes.

**The metadata table scan.** Aggregating `files` per partition. Correct, available everywhere, and its cost scales with file count. Fine for investigating one table, prohibitive as a routine job across a platform.

**The partitions metadata table.** Iceberg exposes a `partitions` metadata table that aggregates per partition, which is closer to what you want and still computes the aggregate at query time rather than reading a precomputed one. For interactive investigation it is the most convenient option available today and it does not help with the affordability problem, since the work happens on every call.

**Snapshot summaries.** Carry aggregate counts per snapshot rather than per partition. Useful for tracking table-level change over time, and silent on distribution, which is the question that drives most maintenance decisions.

**A homegrown statistics table.** Some platforms build their own: a nightly job that scans metadata and writes per-partition counts into a regular Iceberg table for dashboards to query. This works, and it is the same idea as partition statistics files with a worse implementation, because it lives outside the table, goes stale independently, needs its own lifecycle management, and no engine will ever consume it. If you have one of these, the statistics file is the standardized replacement.

The pattern across all four: the information exists and the cost of getting it is what limits how often anyone asks. Precomputing it once per snapshot and storing it next to the table changes the economics of asking, and that is the whole feature.

## Where this is heading

Three developments shape whether partition statistics become standard equipment or stay a niche feature.

**Column-level statistics per partition.** A proposal in the community extends partition statistics to carry column-level information rather than only structural counts. That changes the character of the feature substantially, from a description of layout into a source of selectivity estimates, which is what a cost-based optimizer actually wants. It also increases the file size and the computation cost, so the tradeoff shifts.

**Engine consumption.** The feature's value to query planning depends entirely on engines reading it. The incentive is clear on tables where planning dominates, and support is being built where that pain is loudest. As it lands, tables that already have statistics files benefit without any migration, which is a good reason to start writing them before the support arrives rather than after.

**Statistics production moving into the write path.** The specification allows a writer to produce the statistics file during a write operation, and nothing does that today. A commit path that maintains partition statistics incrementally as part of the write removes the recomputation job entirely and eliminates the staleness window. That is the version where this stops being a maintenance task and becomes a table property.

The broader trend behind all three: metadata is becoming something the platform maintains deliberately rather than a byproduct of writes. Puffin statistics, partition statistics, manifest clustering, and the format work aimed at making metadata cost proportional to change are all instances of the same shift. Iceberg started with metadata sufficient for correctness. It is filling in the metadata sufficient for good decisions.

## Conclusion

Partition statistics files answer a question manifests answer badly: how is data distributed across partitions, in one lookup rather than an aggregation. They have been in the specification for years, they cost one procedure call in a job you already run, they compute incrementally after the first pass, they are stored as ordinary Parquet, and they cannot break any reader, because the spec permits readers to ignore them.

The case for writing them today does not rest on query speedups, because most engines do not consume them yet. It rests on what they let you build. Per-partition file counts, sizes, record counts, and delete counts, available for the cost of one small file read, make targeted maintenance affordable across a whole platform rather than only on the tables somebody is currently investigating. That is the immediate return, and it arrives whether or not any engine ever reads the file.

Add the procedure to your maintenance job, after compaction and manifest rewriting. Run the first computation deliberately, because it is a full pass. Skip tables with few partitions. Then go write the compaction-candidate query against the resulting files and see how much cheaper the question got.

## Keep Going

If this piece was useful, I have written a lot more on Iceberg internals and lakehouse operations. *Apache Iceberg: The Definitive Guide* covers the metadata layout, statistics, and planning path in depth, and *Architecting an Apache Iceberg Lakehouse* covers how those internals shape the platform built on top of them. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
