---
title: "What Iceberg Table Maintenance Actually Costs"
date: "2026-09-10"
description: "A cost model for compaction, snapshot expiry, orphan cleanup, and manifest rewriting: what each operation spends, on which meter, and how to set a schedule."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - table maintenance
  - compaction
  - cost optimization
  - data engineering
canonical: https://iceberglakehouse.com/posts/iceberg-maintenance-budget/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-maintenance-budget/).

Someone eventually asks the question, usually in a quarterly planning meeting: why are we running a Spark cluster every night against tables nobody queried that day?

It is a fair question and most teams cannot answer it with numbers. They know maintenance is necessary. They know compaction speeds up queries and expiry controls storage growth. What they do not have is a cost per terabyte, a defensible schedule, or any way to say which of the four maintenance operations is earning its compute and which is running out of habit.

This piece is about the bill. Not how bin-packing works or which procedure argument sets the target file size, but what each operation spends, on which meter, and how to build a number you can put in a budget and defend in a review. The mechanics matter only where they change the arithmetic.

The short version: maintenance is cheap in storage terms, moderate in request terms, and dominated by compute. The single largest cost driver is how often you compact relative to how much data actually changed, and most schedules are set to a round number that has nothing to do with either.

## The four operations and what each one spends

Iceberg ships four maintenance operations, and they consume different resources. Treating them as one nightly job hides that.

**Compaction** (`rewrite_data_files`) reads small files and writes larger ones. It spends compute on the read and the write, object storage GET requests on every input file, PUT requests on every output file, and it temporarily doubles the storage for the data it rewrites until the old files get cleaned up. It is by far the most expensive of the four, and it is the one people run most often.

**Snapshot expiry** (`expire_snapshots`) removes old snapshot entries from metadata and deletes the data files that no retained snapshot references. It spends very little compute, a modest number of requests to list and read metadata, and a DELETE request per removed file. It is the operation that gives storage back.

**Orphan file cleanup** (`remove_orphan_files`) finds files under the table location that no metadata references and deletes them. Its cost profile is unusual: almost no compute, and potentially an enormous number of LIST requests, because it has to enumerate what is physically in storage and compare it against what the table knows about. On a table with millions of files, that listing is the expensive part.

**Manifest rewriting** (`rewrite_manifests`) reorganizes metadata files so manifests cluster by partition rather than by write time. Cheap in absolute terms, because manifests are small. It pays for itself in planning time on tables with many partitions.

A useful way to hold these in your head:

| Operation | Compute | GET/LIST requests | PUT/DELETE requests | Storage effect |
|---|---|---|---|---|
| Compaction | High | One GET per input file | One PUT per output file | Temporarily higher |
| Snapshot expiry | Low | Metadata reads only | One DELETE per removed file | Lower |
| Orphan cleanup | Low | Full LIST of table location | One DELETE per orphan | Lower |
| Manifest rewrite | Low | Manifest reads | Manifest writes | Negligible |

Ordering matters for cost, not just correctness. Expiring snapshots before compacting means compaction does not spend compute rewriting files that were about to be dereferenced anyway. On a table carrying months of history, that ordering saves real money, because compaction reading and rewriting hundreds of gigabytes that no query will read again is pure waste.

## Three meters, and only one of them is big

Every maintenance dollar lands on one of three meters. Getting the relative sizes right stops teams from optimizing the wrong one.

**Storage.** In S3 Standard in us-east-1, published list pricing puts storage at $0.023 per GB-month, which is about $23.55 per terabyte per month. This is the meter people worry about and it is almost never where maintenance money goes. Snapshot retention inflates it, orphan files inflate it, and both effects are measured in percentages of a number that is already small.

**Requests.** Published list pricing puts PUT, COPY, POST, and LIST at $0.005 per 1,000 requests, and GET at $0.0004 per 1,000. The asymmetry is the important part: writes and listings cost more than twelve times what reads cost, per request. Any operation that writes many small objects or lists a large prefix is spending here.

**Compute.** Whatever your Spark, Flink, or engine-managed maintenance runs on. This is where the money is, and it is the meter with the least visibility, because the cluster is usually shared and the cost is not attributed per table.

Prices move and vary by region and provider, so re-check them before you build a budget on them. The ratios hold across clouds, and the ratios are what drive the decisions.

## A cost model for one terabyte

Here is the arithmetic, worked on a table that stands in for a lot of real ones. Change the inputs to match yours. The point is the shape of the model rather than my numbers.

**The table.** One terabyte of Parquet, ingested hourly. Each hourly batch writes about 40 files averaging 32 MB, which is the shape streaming and micro-batch ingestion produces without tuning. That is 960 files and roughly 30 GB of new data per day. Target file size after compaction is 512 MB.

**Storage baseline.** One terabyte at $0.023 per GB-month is about $23.55 per month. That is the floor before any maintenance consideration.

**Compaction, per daily run.** Compacting one day of new data means reading 960 input files and writing about 60 output files at 512 MB.

- GET requests: 960, at $0.0004 per 1,000, is $0.0004. Effectively free.
- PUT requests: 60, at $0.005 per 1,000, is $0.0003. Also effectively free.
- Compute: reading and writing 30 GB with Parquet decode and encode. On a small cluster this is a few minutes of a handful of cores. Call it 0.5 node-hours at roughly $0.20 per node-hour for a modest instance, so about $0.10.
- Transient storage: 30 GB of new output existing alongside 30 GB of superseded input until expiry runs. Roughly $0.02 for the overlap window.

Daily compaction of one day's data on a one-terabyte table costs pennies. Monthly, about $3 in compute and under $1 in requests and transient storage.

**Now change one input.** Run compaction across the whole table every night instead of just the new data. Now you read 1 TB and write 1 TB every night.

- GET requests: roughly 2,000 input files after the first pass, still negligible.
- Compute: reading and writing 1 TB nightly. At a realistic 100 MB/s per core of effective Parquet throughput including decode, encode, and shuffle, that is about 3 core-hours per 100 GB, so roughly 30 core-hours per night. At $0.05 per core-hour, about $1.50 per night, or $45 per month.
- Transient storage: 1 TB of duplicate data until expiry, so up to $23 for the overlap.

Same table, same procedure, fifteen times the cost, and the query performance is identical because the data was already compacted. This is the most common maintenance cost problem I see described, and it comes from a filter that was never set.

**Orphan cleanup, per run.** The cost here is listing. A table with 500,000 files means at minimum 500 LIST calls at 1,000 keys per call, which is $0.0025. Trivial. Now scale to a table with 50 million files across a deep partition layout: 50,000 LIST calls is $0.25 per run, and the wall-clock time to enumerate becomes the real constraint. On very large tables, running orphan cleanup weekly instead of nightly is a defensible choice with almost no risk, because orphans accumulate slowly and cost only storage while they sit there.

**Snapshot expiry, per run.** Metadata reads plus a DELETE per removed file. Deleting 960 superseded files daily is 960 DELETE requests. DELETE requests on S3 Standard are not charged the way PUTs are, and the compute is trivial. Expiry is the cheapest operation on the list and it is the one that returns storage. Run it often.

**The monthly total for the sensible configuration.** Incremental compaction of new data plus daily expiry plus weekly orphan cleanup plus monthly manifest rewrite, on one terabyte:

| Line item | Monthly cost |
|---|---|
| Base storage (1 TB) | $23.55 |
| Snapshot retention overhead (7 days) | $3 to $7 |
| Compaction compute | $3 |
| Expiry and orphan cleanup | under $1 |
| Requests, all operations | under $1 |
| Total maintenance overhead | roughly $8 to $12 |

Maintenance on a well-configured one-terabyte table costs about 35% to 50% of the storage bill for that table, and the storage bill is small. The number that should alarm you is not this one. It is what happens when the configuration is wrong.

## The small-file economics that drive everything

Every maintenance cost question traces back to file size, and the mechanism is worth being precise about because it explains why compaction earns its keep.

A query against an Iceberg table opens files. Each file open costs a request and a round trip, plus footer parsing before any data gets read. At 32 MB per file, a scan of 100 GB opens about 3,200 files. At 512 MB per file, the same scan opens 200. The bytes read are similar. The number of round trips differs by sixteen times, and on object storage with tens of milliseconds of latency per request, that difference dominates query time on anything smaller than a very large scan.

The metadata side compounds it. Every file is a row in a manifest, carrying its partition values and column statistics. Three thousand files means a manifest set that planning has to read and evaluate. Two hundred files means a fraction of that. Planning time scales with file count, and planning happens on every query.

So the return on compaction is a function of query volume, not of table size. A one-terabyte table queried five hundred times a day and a one-terabyte table queried twice a week have wildly different compaction economics, and the same nightly schedule serves one well and wastes money on the other.

The practical rule that falls out of this: **compaction spend should track query volume and ingestion pattern, not table size or a calendar.** Tables with heavy read traffic and small-file ingestion earn aggressive compaction. Cold tables written once and read rarely earn almost none.

There is a second-order effect worth knowing. Compaction itself creates snapshots, and each compaction commit produces manifest entries grouped by write time rather than by partition. Compacting frequently without ever rewriting manifests leaves you with clustered data files and fragmented metadata, which erodes part of the planning improvement you paid for. Manifest rewriting is cheap and it protects the return on the expensive operation.

## The cost of not maintaining

Maintenance spend only makes sense against the counterfactual, and the counterfactual has a number too.

Take the one-terabyte hourly-ingested table from earlier and run it for ninety days with no compaction. It accumulates about 86,000 files at 32 MB each. A full scan opens all of them. At 30 milliseconds per file open, with 64-way parallelism, file opens alone contribute about 40 seconds to every full scan before a single row gets decoded. The same table compacted to 512 MB files holds about 2,000 files, and the same arithmetic gives under a second.

Then multiply by query volume. A table scanned 200 times a day carries that penalty 200 times. If the queries run on a cluster you pay for by the second, the extra time is a direct line item, and it lands on the query budget rather than the maintenance budget, which is exactly why it goes unnoticed. Teams that skip maintenance to save compute often move the cost rather than removing it, and they move it to a meter with worse visibility and an angrier audience.

Planning time compounds it. Every one of those 86,000 files is a manifest entry with column statistics that planning reads and evaluates. Planning time scales with file count, planning runs on every query, and unlike scan time it does not parallelize away.

There is a third cost that never appears on any invoice. Queries that take 40 seconds longer change how people use a platform. Analysts stop exploring interactively, dashboards get cached more aggressively, and someone eventually proposes copying the data into a warehouse where it is faster. That proposal costs more than a decade of compaction.

So the framing for a budget review is not "maintenance costs $X per terabyte." It is "maintenance costs $X per terabyte and avoids $Y in query compute plus an unquantified amount of platform credibility." The first number is small and the second is usually larger, and having both makes the conversation short.

## Scheduling against the cost curve

The frequency question has a shape, and it is not linear.

**Compaction frequency.** The cost of compaction is roughly proportional to the bytes rewritten. The benefit is roughly proportional to the query time saved on files that were small. Run it too rarely and small files accumulate, queries slow, and eventually a single catch-up run rewrites a large fraction of the table. Run it too often and you rewrite data that was already at target size, paying compute for nothing.

The setting that decides this is the filter on what gets rewritten. Compacting only partitions touched since the last run, with a minimum input file count so a partition with three already-large files gets skipped, keeps the cost proportional to the change rather than to the table.

```sql
CALL catalog.system.rewrite_data_files(
  table => 'sales.orders',
  strategy => 'binpack',
  where => 'order_date >= current_date() - INTERVAL 2 DAYS',
  options => map(
    'target-file-size-bytes', '536870912',
    'min-input-files', '5',
    'partial-progress.enabled', 'true',
    'partial-progress.max-commits', '10',
    'max-concurrent-file-group-rewrites', '20'
  )
);
```

Each of those settings has a cost consequence.

`where` is the single most important line in the statement, and its absence is the most expensive mistake in this whole article. Without it, every run considers the entire table. With it, the run scales with what changed.

`target-file-size-bytes` at 512 MB balances file count against rewrite cost. Larger targets mean fewer files and more bytes rewritten to reach them. For most analytic tables 256 MB to 1 GB is the sane band.

`min-input-files` prevents the pathological case where a partition holding four files at 400 MB each gets rewritten into three files at 512 MB, spending 1.6 GB of read and write to improve nothing.

`partial-progress.enabled` commits work in batches rather than as one commit at the end. Without it, a job that fails at 90% has spent all that compute and committed nothing, and you pay again on the retry. This setting is a direct hedge against wasted spend on large runs.

`max-concurrent-file-group-rewrites` controls parallelism, which controls how much cluster you need and for how long. Higher parallelism finishes faster on a bigger cluster. The total compute is similar, and the wall-clock window matters when maintenance competes with query traffic for the same resources.

**Expiry frequency.** Daily, in almost all cases. It is cheap, it returns storage, and it reduces the work compaction has to consider. The constraint is your time-travel requirement rather than cost.

**Orphan cleanup frequency.** Weekly is usually right, and the retention interval is a safety setting rather than a cost setting. The default retention is three days, and shortening it is dangerous, because a file written by a job that is still in flight looks exactly like an orphan. Deleting it corrupts the table. Never set the interval shorter than your longest-running write, plus a margin.

**Manifest rewriting.** Monthly, or after any large compaction campaign. Cheap enough that the schedule is about convenience.

One scheduling detail that saves more than it looks like it should: stagger the runs. A platform that fires every table's maintenance at 2am needs a cluster sized for the peak, and that cluster sits idle the rest of the day. Spreading the same work across a six-hour window lets a much smaller cluster absorb it, and since nothing is waiting on the result, the longer wall clock costs nothing. On platforms with hundreds of tables this alone cuts the compute reservation substantially, and it takes an afternoon of scheduler work.

A second one: run the cheap operations more often than the expensive one. Expiry and manifest rewriting are inexpensive enough that a daily cadence needs no justification. Compaction is the operation that earns scrutiny. Bundling all four into a single job means the expensive one sets the cadence for all of them, which is backwards.

## Retention is a cost decision disguised as a policy decision

Snapshot retention is where storage cost actually accumulates, and it usually gets set once by whoever created the table, using a number that sounded reasonable.

The mechanism: every write creates a snapshot. A table with hourly loads creates 24 snapshots per day, 168 per week, and about 8,760 per year. Because Iceberg never modifies data files in place, retained snapshots keep old data files alive. Storage for a table is not the size of its current state. It is the size of the union of every file referenced by any retained snapshot.

That number is easy to underestimate on tables with heavy update or delete traffic. A table where 10% of rows change daily, retained for 30 days, holds far more than one copy of itself, because each day's rewritten files persist as long as a snapshot points at them. On an append-only table the effect is much smaller, because old snapshots reference files the current snapshot also references.

Two implications for a budget.

**Retention cost scales with change rate, not with table size.** Two one-terabyte tables with the same retention have different storage bills if one is append-only and the other is heavily updated. Price them separately.

**Retention has a hard floor set by recovery, not by convenience.** If your disaster recovery plan restores the catalog database to a point up to seven days back, snapshot retention shorter than seven days guarantees an inconsistent restore: the catalog points at metadata files whose data files expiry already deleted. Retention and recovery window are one decision. I have seen this pair set independently by two teams more than once, and the failure surfaces only during the drill, which is the good outcome, or during the incident, which is not.

The practical shape most tables want: retain enough snapshots to cover the recovery window and any genuine time-travel requirement, expire daily beyond that, and set the retention per table rather than globally, because the tables that need 30 days are usually a small minority.

```sql
CALL catalog.system.expire_snapshots(
  table => 'sales.orders',
  older_than => TIMESTAMP '2026-09-03 00:00:00.000',
  retain_last => 10
);
```

The `retain_last` argument is the safety net. It keeps a minimum number of snapshots regardless of age, which protects a table that has not been written in weeks from having its entire history expired down to one snapshot with no rollback target.

## Sizing the compute, which is where the money is

Compaction cost is compute cost, and compute cost is a function of bytes rewritten divided by effective throughput. Both halves are worth measuring rather than assuming.

**Bytes rewritten** is the number to instrument first. Iceberg tables expose metadata tables that make this straightforward. Query the snapshot summary after a compaction run and you get added and removed file counts and byte totals directly:

```sql
SELECT
  committed_at,
  summary['added-data-files']    AS files_added,
  summary['deleted-data-files']  AS files_removed,
  summary['added-files-size']    AS bytes_added,
  summary['removed-files-size']  AS bytes_removed
FROM catalog.sales.orders.snapshots
WHERE operation = 'replace'
ORDER BY committed_at DESC
LIMIT 30;
```

That query is the core of a maintenance budget. Bytes rewritten per run, times runs per month, divided by throughput, times your compute rate, is the compaction line item. Everything else in this article is context around that calculation.

Two ratios to watch in the output. If `bytes_removed` on a typical run is a large fraction of your table size, you are compacting the whole table and the filter is missing or too broad. If `files_removed` divided by `files_added` is close to one, you are rewriting files that were already near target size and spending compute for nothing.

**Effective throughput** varies more than people expect. Parquet decode and encode, sort order if you use one, and shuffle all cost CPU, and the compression codec matters. Measure it on your own cluster with your own data rather than using a number from a blog post, including this one. Run one compaction with a known input size, record wall-clock time and cluster size, and divide.

Once you have both numbers, the sizing question becomes concrete. A cluster twice as large finishes in roughly half the time at roughly the same total cost, because these jobs are close to embarrassingly parallel at the file-group level. That means the cluster size decision is about the maintenance window rather than about the bill. Pick the smallest cluster that finishes inside your window, and let the window be as wide as query traffic allows.

Spot or preemptible instances deserve a mention here. Maintenance is interruptible work with no user waiting on it, which makes it close to the ideal spot workload. Combined with `partial-progress.enabled` so an interruption does not discard completed work, spot pricing takes a meaningful bite out of the largest line item in the budget.

## Five ways teams waste maintenance money

These account for most of the difference between a maintenance bill that is a rounding error and one that shows up in a cost review.

**No filter on compaction.** Covered above and worth repeating, because it is the single most expensive misconfiguration available. Every run rewrites the whole table. The symptom is a maintenance job whose duration is flat regardless of how much data arrived, and whose `removed-files-size` in the snapshot summary matches the table size.

**Compaction ordered before expiry.** Compaction rewrites files that expiry dereferences minutes later. The compute is spent processing data no query will ever read. Order the pipeline as expire, then clean orphans, then compact, then rewrite manifests, and the wasted work disappears.

**Uniform schedules across a diverse table population.** A nightly job that hits every table equally spends the same on a table queried a thousand times a day and a table nobody has read since March. Table-level policies driven by query counts and ingestion rates cost a day to build and cut the bill substantially on any platform with more than a few dozen tables.

**Maintenance running concurrently with heavy writes.** Compaction and a streaming writer targeting the same partitions produce commit conflicts. The compaction commit fails, retries, and rewrites again. You pay for the same work two or three times, and the retry pressure is invisible unless you watch conflict metrics. Schedule maintenance in the ingestion trough, or use partition filters that avoid the actively written partitions.

**Orphan cleanup with an aggressive retention interval.** The cost of getting this wrong is not money, it is data. A short interval deletes in-flight files from a running job, and a table that loses committed data files is a restore, not a bug fix. The default of three days exists for a reason. Lengthen it if your longest write is longer than that.

A sixth item that is not waste but reads like it: a maintenance job that appears to do nothing on most runs. If a table gets no writes, compaction with a proper filter finds nothing to rewrite and exits in seconds. That is the system working. The cost of a no-op run is a job submission, and the alternative is complicated scheduling logic that costs more in engineering time than it saves in compute.

## Delete files change the arithmetic

Everything above assumes an append-and-compact table. Tables with updates and deletes have a second maintenance cost that runs on a different clock, and it is the one that surprises teams migrating from a warehouse.

Merge-on-read writes deletes as separate files rather than rewriting the data files they affect. That makes the write cheap and pushes the cost to read time, where every scan has to apply the accumulated deletes against the data files. The maintenance question becomes when to pay off that debt by rewriting the data files with the deletes applied.

Three cost properties follow.

**Read cost grows with delete accumulation, not with delete size.** A partition carrying forty small delete files costs more to scan than one carrying a single larger one holding the same deleted rows, because the engine opens and merges each of them. Delete file count behaves like data file count: the number of round trips is what hurts.

**Delete compaction rewrites data files, not just delete files.** Applying deletes means writing new data files without the deleted rows, which puts this operation in the expensive compute bucket alongside regular compaction. Minor compaction that only merges small delete files into larger ones is much cheaper and buys time.

**Storage carries both copies until expiry.** The pre-delete data files stay alive as long as a snapshot references them, so a heavy update workload with long retention holds several versions of the same rows.

The budgeting consequence is that update-heavy tables need their own bucket with their own numbers. A one-terabyte table with 10% daily row churn does not cost the same to maintain as a one-terabyte append-only table, and applying the same policy to both means either overspending on one or letting the other degrade.

The measurement to instrument is delete file count per partition and delete-to-data ratio. When the number of delete files in a partition crosses a threshold, or when applying deletes touches a meaningful fraction of rows, the partition has earned a rewrite. Both numbers are available from Iceberg metadata tables, and a query against them turns the decision from a schedule into a trigger.

## Three table shapes, three budgets

The same policy applied to different tables produces wildly different bills. Here are three shapes worth pricing separately, using one terabyte in each case so the comparison is clean.

**Shape one: hot append-only.** Hourly ingestion, hundreds of queries a day, no updates. Compaction earns its cost several times over, because file count directly drives the latency of every one of those queries. Compact daily with a two-day filter, expire daily, retain seven days. Maintenance overhead lands in the range worked out earlier, roughly a third to a half of storage cost, and the return shows up as query latency.

**Shape two: cold archival.** Written once a month, queried a handful of times a quarter, no updates. Compaction on a schedule is close to pure waste here. Compact once after each monthly load with a filter that only touches the new partition, expire monthly with longer retention because storage is cheap and rollback is the main reason to keep history, and skip orphan cleanup down to quarterly. Maintenance overhead falls to a few percent of storage cost.

**Shape three: update-heavy operational mirror.** CDC ingestion, 10% daily row churn, moderate query volume. This is the expensive one. Delete files accumulate continuously, data files get rewritten repeatedly, and retention multiplies the storage because each rewrite leaves the previous version alive. Compaction and delete-application run more frequently, retention runs shorter, and the maintenance bill has a realistic chance of exceeding the storage bill for that table.

| | Hot append-only | Cold archival | Update-heavy CDC |
|---|---|---|---|
| Compaction cadence | Daily, filtered | After each load | Twice daily, filtered |
| Retention | 7 days | 30 days | 3 days |
| Orphan cleanup | Weekly | Quarterly | Weekly |
| Dominant cost | Compaction compute | Storage | Delete application |
| Maintenance vs storage cost | Moderate | Low | High |

That table is the artifact worth building for your own platform, with your own numbers in the last row. It makes the policy decisions legible to people who do not know what a manifest is, and it locates the tables worth spending engineering time on.

## Managed maintenance changes who pays, not what it costs

More platforms now run maintenance for you: catalog-managed compaction, table services in a warehouse product, or a control plane that schedules the four operations against policy. The pitch is that you stop operating Spark jobs. The cost question changes shape rather than disappearing.

Three things to check before treating managed maintenance as a cost win.

**What is the billing unit.** Some services bill compute for maintenance the same way they bill queries. Some bundle it into a per-terabyte platform rate. The bundled version is easier to budget and harder to optimize, because the lever that saves the most money in the self-managed case, scoping compaction to what changed, is now somebody else's implementation detail.

**What policy is actually applied.** A service compacting on a fixed schedule regardless of change rate has the same waste profile as the unfiltered job described earlier, and you are paying for it without seeing the snapshot summaries that reveal it. Ask what triggers a run, and ask to see the bytes-rewritten metric per table.

**Whether you keep the ability to opt out per table.** Cold tables should get near-zero maintenance. A platform that applies uniform policy across everything is spending your money evenly on tables with unequal value.

None of that argues against managed maintenance. It removes real operational burden, and for most teams the engineering time saved is worth more than the compute optimization forgone. It argues for keeping the same instrumentation either way, so the conversation about cost stays possible.

## Monitoring the four numbers

A maintenance budget goes stale within a quarter unless something watches it. Four metrics keep it honest, and all four come from data Iceberg already exposes.

**Bytes rewritten per run, per table.** The snapshot summary query above, collected on a schedule into its own table. This is the compaction bill in raw form. A run whose bytes rewritten jumps by an order of magnitude means either a backfill landed or a filter stopped working, and both are worth an alert.

**File count and average file size per partition.** Available from the `files` metadata table. Average file size drifting down between compaction runs tells you ingestion changed shape. Average file size already at target before a run tells you the run is unnecessary.

```sql
SELECT
  partition,
  count(*)                        AS file_count,
  cast(avg(file_size_in_bytes) AS bigint) AS avg_bytes
FROM catalog.sales.orders.files
GROUP BY partition
ORDER BY file_count DESC
LIMIT 20;
```

That query, run before and after compaction, is the clearest evidence of whether a maintenance job earned its compute. Partitions at the top with high file counts and small average sizes are where the next run should be pointed.

**Snapshot count and age distribution.** A table whose oldest snapshot keeps getting older means expiry stopped running or its filter excludes that table. Storage grows quietly, and nothing fails, which is why this one needs a check rather than an alert on errors.

**Commit conflict rate on maintenance jobs.** Rising conflicts mean maintenance is colliding with writers and paying for the same work repeatedly. The fix is scheduling or partition scoping, and the signal appears nowhere else.

Put those four on one dashboard per table bucket rather than per table. At platform scale the per-table view is unreadable, and the bucket view surfaces the outliers, which is what you act on.

## Building a budget you can defend

Six steps, and the whole thing takes about a day for a platform with a few hundred tables.

**One: classify tables by read volume and change rate.** Four buckets are enough. Hot and changing, hot and append-only, cold and changing, cold and append-only. Query logs give you read volume, and the snapshot history gives you change rate.

**Two: set per-bucket policies rather than per-table ones.** Compaction frequency, retention window, and orphan cleanup cadence per bucket. Individual tables get exceptions where they earn them.

**Three: instrument bytes rewritten.** The snapshot summary query above, collected into a table you can aggregate. Without this number every conversation about maintenance cost is opinion.

**Four: measure your own throughput once.** One controlled run, recorded. Redo it when you change instance types or compression settings.

**Five: attribute compute to tables.** If maintenance runs on a shared cluster, tag the jobs and split the cost by bytes rewritten. Unattributed maintenance compute is why nobody can answer the planning-meeting question.

**Six: report maintenance as a percentage of table storage cost.** This is the number that makes the case. On a well-configured platform it lands in a band you can state plainly, and any table far outside that band is a configuration problem you can go find. Percentages travel better than absolute dollars in a budget review, and they stay meaningful as the platform grows.

The output is a table with a row per bucket showing policy, monthly compute, monthly storage overhead, and the total as a percentage. That artifact answers the planning-meeting question in one slide, and it turns maintenance from an unexamined line item into a set of decisions with numbers attached.

## Where the cost curve is heading

Three changes are moving these numbers, and all three point the same direction.

**Maintenance is moving into the write path.** Frameworks that compact inside the streaming job that writes the data, rather than in a separate batch job afterward, remove an entire read-and-rewrite cycle. The Flink maintenance framework does this today with expiry, compaction, and orphan cleanup running as operators inside the streaming pipeline, coordinated so concurrent runs do not collide. When the data gets written at target size the first time, the cheapest compaction is the one that never runs.

**Catalogs are taking over scheduling.** Catalog-managed maintenance moves the policy decision out of individual pipelines and into the service that already knows every table, its write frequency, and its file-size distribution. That is the right place for a decision that depends on cross-table information, and it makes per-table policies practical at a scale where hand-tuning is not.

**Metadata formats are reducing the work.** Format changes aimed at making the cost of a change proportional to the size of the change, rather than to the size of the table, attack the same waste from the metadata side. Less metadata rewritten per commit means less manifest maintenance needed later.

The direction of travel is that maintenance stops being a nightly batch job someone owns and becomes a property of the table. That is good, and it does not change the arithmetic in this article. It changes who runs the arithmetic.

## Conclusion

Iceberg maintenance is not expensive. Badly configured Iceberg maintenance is expensive, and the gap between the two is usually one missing filter and one wrong ordering.

The model that matters fits in a paragraph. Storage is a small meter and retention policy is what moves it, scaled by change rate rather than table size. Requests are a smaller meter, and only orphan cleanup on very large tables gets near anything material. Compute is the meter that matters, it is proportional to bytes rewritten, and bytes rewritten is controlled almost entirely by whether compaction is scoped to what changed.

Instrument the snapshot summary so you know bytes rewritten per run. Measure your own throughput once. Order the pipeline as expire, clean, compact, rewrite manifests. Set retention against your recovery window rather than against a habit. Scope compaction with a filter and a minimum input file count. Do those five things and maintenance lands at a fraction of the storage bill for the tables it protects, and you can say so with a number.

Then go find the table with no filter on its compaction job, because on most platforms there is one, and it is costing more than everything else combined.

## Keep Going

If this piece was useful, I have written a lot more on Iceberg operations and lakehouse architecture. *Apache Iceberg: The Definitive Guide* covers the table format and its maintenance operations in depth, and *Architecting an Apache Iceberg Lakehouse* covers how maintenance, catalogs, and query engines fit together in a working platform. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
