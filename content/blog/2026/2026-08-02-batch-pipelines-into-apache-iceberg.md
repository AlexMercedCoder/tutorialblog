---
title: "Designing Batch Pipelines That Write Well Into Apache Iceberg"
date: "2026-08-02"
description: "How to design batch pipelines that write well into Apache Iceberg: commit strategy, partitioning, sort order, write-audit-publish, and maintenance done right."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Data Engineering
  - Batch Pipelines
  - Data Pipelines
  - Lakehouse
canonical: "https://iceberglakehouse.com/posts/batch-pipelines-into-apache-iceberg/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/batch-pipelines-into-apache-iceberg/).

# Designing Batch Pipelines That Write Well Into Apache Iceberg

The pipeline runs at 2 a.m. It reads yesterday's extract, does its transformations, and writes to an Apache Iceberg table. Six months later the same pipeline takes four times as long, the downstream dashboard takes 40 seconds to load, and somebody opens a ticket asking why the lakehouse is slow. Nothing broke. The pipeline is doing exactly what it was told. The problem is that nobody decided what it should have been told.

I have reviewed a lot of these pipelines. The failures are rarely exotic. They come from a handful of decisions that get made by default at the start and never revisited: how big a batch is, how often it commits, how the data lands on disk, who cleans up afterward, and what happens when two jobs touch the same table at the same time. Each of those decisions has a right answer that follows from your read patterns and your service level agreements, and each has a default that follows from whatever the engine did without being asked.

This piece is about making those decisions on purpose. It stays at the architecture level and does not assume any particular engine. Apache Spark, Apache Flink in batch mode, Trino, PyIceberg, and every managed service that writes Iceberg all commit through the same format, so the reasoning transfers even when the syntax does not. Where I show code, it is illustrative and portable in shape.

Nothing here is vendor-specific, because the constraints come from the format and from physics rather than from any product. Where a particular engine handles something differently, I say so.

## What changes when the target is a table format

Writing into a Hive-style table meant writing files into a directory and hoping consumers did not read during the write. Correctness came from convention. Everyone agreed not to look at a partition until the `_SUCCESS` file appeared, and everyone eventually got burned by a reader that did not know the convention.

Iceberg replaces the convention with a mechanism. A table has a current metadata file. That file lists snapshots, and each snapshot points at a manifest list, which points at manifests, which point at data files with their partition values and column statistics. A write becomes visible when the catalog swaps the pointer to a new metadata file. That swap is atomic. Readers see the old snapshot or the new one, never a half-written state.

Three consequences flow from that design, and they shape everything else in this article.

**The commit is the transaction boundary, not the file write.** Files land in storage before the commit and are invisible until it happens. A job that writes 900 files and dies has produced zero visible change. This is why staging inside the table is safe and why partial visibility is not a thing you have to defend against.

**Concurrency is optimistic, not locked.** Two writers both read the current snapshot, both do their work, and both try to swap the pointer. One wins. The other detects that the base snapshot changed, and depending on the operation and the isolation level, it either retries against the new state or fails. Nobody holds a lock for the duration of a 40-minute job. That is good for throughput and it means your pipeline needs a retry story.

**Metadata is data, and it accumulates.** Every commit writes new manifest files and creates a snapshot. Query planning reads that metadata. A table with a clean layout plans in under a second. The same table after 50,000 unmaintained commits plans in 30 seconds before scanning a single row. Planning cost is the tax you pay for careless commit behavior, and it compounds.

Hold onto that third point in particular. Most Iceberg performance complaints I investigate turn out to be planning problems dressed up as scan problems.

## Design backwards from the read

The first mistake in pipeline design is starting with the source. The source is a constraint. The read pattern is the requirement.

Before writing any transformation logic, get concrete answers to four questions.

**What filters appear in almost every query?** If 90% of queries include a date range, the table wants a date-based partition. If they filter by tenant or region as well, that is a second dimension. If your users filter by a high-cardinality identifier, partitioning on it is wrong and clustering on it is right. Pull the actual query log. Do not guess, and do not accept the modeling team's recollection of what people filter on.

**How fresh does the data have to be?** Freshness sets commit frequency, and commit frequency drives metadata growth and maintenance cost. A table that genuinely needs 15-minute freshness is a different design from one where the business looks at yesterday. Ask what decision gets made from the data and how often. Most "real time" requirements collapse under that question, and the ones that survive are worth the extra engineering.

**What is the largest scan anyone runs?** A table where the biggest query touches one day behaves differently from one where quarterly reports scan 90 days. The second case rewards larger files and stronger sorting, since scan efficiency matters more than fine-grained pruning.

**Who else reads this table?** Another engine, a BI tool, a machine learning feature pipeline, an AI agent through a semantic layer. Each consumer places its own demands on file size, format version, and schema stability. A consumer that only speaks Iceberg V2 constrains the whole table.

Write the answers down. They become the acceptance criteria for the design, and they are what you check against when someone proposes a change eighteen months later.

## The commit is the unit of design

Once you know the read pattern, the next decision is how work maps onto commits. This is the decision teams skip, and it drives more downstream pain than anything else.

A commit has fixed costs. It writes a metadata file, a manifest list, and at least one manifest. It creates a snapshot that pins data files against deletion. It takes a round trip to the catalog and risks a conflict with concurrent writers. Those costs are small individually. Multiplied by frequency, they set the shape of your table's metadata.

Work out the arithmetic for your table. A job committing every 5 minutes produces 288 snapshots a day and over 100,000 a year. If each commit touches 50 partitions and writes one file per partition, that is 14,400 files a day from a single pipeline. Neither number is fatal on its own. Both are fatal if nothing ever compacts or expires.

Three patterns cover most batch pipelines.

**One commit per run.** The pipeline reads its input, computes everything, and commits once at the end. Simplest to reason about, easiest to retry, best metadata behavior. This is the default you should have to argue your way out of.

**One commit per logical unit.** A backfill covering 90 days commits once per day of data. Restart-friendly, since completed days stay committed, and the metadata cost stays proportional to real work. Use it for long-running jobs where a failure at hour six should not throw away hours one through five.

**Many small commits.** Micro-batch and near-streaming ingestion. Choose it only when freshness genuinely requires it, and only alongside an aggressive compaction schedule that runs at least as often as the ingest rate warrants.

The anti-pattern to name explicitly is the accidental many-commit pipeline. It happens when a job loops over partitions or over source files and writes inside the loop. Each iteration commits. A job that processes 500 files creates 500 snapshots and nobody notices because it still finishes on time. Six weeks later planning is slow and the cause is buried in a for-loop. Collect the work, write once.

### Handling conflicts

Optimistic concurrency means your pipeline needs to answer one question: what happens when the commit fails because someone else got there first?

Appends are the easy case. Two appends do not logically conflict, so a retry against the new base snapshot succeeds. Configure retry counts and backoff and move on.

Overwrites and row-level operations are harder. A `MERGE` that deletes rows based on a predicate has to know whether the files it planned against still exist. Iceberg supports different isolation levels for these operations. Serializable isolation rejects the commit if any conflicting change occurred. Snapshot isolation is more permissive and allows the commit when the specific files involved were not modified. Serializable is safer and fails more. Snapshot isolation succeeds more and admits a class of anomalies where a concurrent insert falls outside your delete predicate's view.

The right answer depends on the table. For a dimension table that a single pipeline owns, snapshot isolation with retries is fine. For a financial table where two jobs both perform corrections, serializable is worth the failed commits. What is not fine is not knowing which one you are running.

The structural fix beats both. Give every table exactly one writer for a given operation type. Concurrency problems that never arise need no isolation strategy.

## Landing zones and the shape of staging

A batch pipeline into Iceberg usually has three stages, and conflating them causes trouble.

**Landing.** Raw source data, as delivered, untransformed. Files from a vendor drop, an extract from an operational database, an export from a SaaS API. Keep this as files or as an append-only Iceberg table. Its job is to make re-processing possible without going back to the source. Never edit it in place.

**Staging.** Cleaned, typed, deduplicated, with the batch's identity attached. This is where you do the work that has to happen before data touches a production table. Staging is disposable. If the pipeline fails here, drop the staging data and rerun.

**Serving.** The production Iceberg table other people read. Only tested data arrives here, and it arrives through a single deliberate commit.

The reason to keep landing separate is reprocessing. Bugs get found in transformation logic weeks after the fact. A pipeline that can replay from landing fixes the affected date range in an afternoon. A pipeline that cannot has to ask the source system for history that has often already rolled off.

The reason to keep staging separate is that transformation is where the risk is. Type coercion failures, unexpected nulls, duplicate keys from a source that changed its export behavior. You want those failures happening against data nobody queries.

Idempotency lives in this layer, and it is worth designing explicitly. Every batch gets an identifier: a run ID, a source file name, a watermark range. Carry it through staging as a column. Before committing to the serving table, delete any rows already present for that identifier, then insert. That single pattern makes reruns safe, which makes retries safe, which makes on-call at 3 a.m. survivable.

## Partitioning: get this right and half the problems disappear

Iceberg's hidden partitioning is one of the format's best ideas and one of the most misused features in practice.

In a Hive table, partitioning meant physical directories and a column the user had to filter on. Query `WHERE event_date = '2026-08-01'` and you got pruning. Query `WHERE event_ts >= '2026-08-01'` and you scanned everything, because `event_ts` and `event_date` were different columns as far as the planner was concerned.

Iceberg partitions on a transform of a source column. Define the partition as `days(event_ts)` and the table stores the derived value in metadata. Users filter on `event_ts` with whatever expression makes sense, and the planner derives the partition predicate itself. There is no separate partition column to keep synchronized and no way for a user to accidentally bypass pruning by writing a natural filter.

The transforms available cover most needs. Time transforms give you year, month, day, and hour granularity. `bucket(N, col)` hashes a column into N buckets, which handles high-cardinality keys without creating a partition per value. `truncate(N, col)` shortens strings or rounds numbers, useful for prefixes and ranges. `identity` uses the raw value and should be reserved for genuinely low-cardinality columns.

Three rules keep partition design out of trouble.

**Target a partition size, not a partition count.** Aim for partitions that hold something in the range of hundreds of megabytes to a few gigabytes. Smaller and you pay planning overhead for no pruning benefit. Much larger and pruning stops helping because every query reads a huge chunk anyway.

**Do not partition on anything with cardinality above a few thousand distinct values.** A partition per customer sounds precise and produces a metadata catastrophe. Use `bucket` instead, which gives you pruning on equality predicates without unbounded partition growth.

**Match granularity to your smallest common query range.** If most queries scan a full month, partitioning by hour creates 720 partitions per month for no gain. If queries target single hours during incident investigation, hourly earns its place.

Partition evolution deserves a mention because it is genuinely useful and genuinely misunderstood. Iceberg lets you change a table's partition spec without rewriting existing data. Old files keep their old partition values, new files get the new spec, and the planner handles both. That means a wrong choice today is fixable tomorrow without a migration project. It also means a table can end up with several partition specs in flight, and planning across mixed specs is less efficient than planning across one. Evolve when you need to, then compact the old data into the new spec when you get the chance.

### Write distribution: the silent file-count multiplier

Here is the mechanism that produces small files, and it has nothing to do with how much data you wrote.

A distributed engine writes files from tasks. If a task holds rows belonging to 40 partitions, it writes at least 40 files. With 200 tasks each holding rows across the same 40 partitions, one commit produces 8,000 files instead of 40. The data volume is identical. The file count is 200 times worse.

The fix is to shuffle data by partition before writing, so each partition's rows land in a small number of tasks. Every serious engine exposes this. Iceberg carries a table property, `write.distribution-mode`, with three values.

`none` skips the shuffle. Fastest write, worst file layout. Appropriate when your data already arrives partitioned, such as a job that processes exactly one day.

`hash` shuffles rows by partition value. This is the right default for most batch writes. It costs a shuffle and saves you from the multiplication problem.

`range` sorts by partition and sort key across tasks. Most expensive write, best layout, and the choice for tables where read performance matters more than write time.

Teams that fight small files usually have `none` in effect and do not know it. Check this property before you build a compaction schedule to clean up a problem you can avoid creating.

## Sort order, and what it buys at read time

Partitioning prunes at the file level using partition values. Column statistics prune at the file level using min and max values per column. Sorting is what makes those statistics useful.

In an unsorted file set, a column's min and max within each file span nearly the full range of the column. A filter on that column eliminates almost nothing, because every file plausibly contains a match. Sort the data on that column and each file covers a narrow range. The same filter now eliminates most files during planning, before any data is read.

Iceberg tables carry a sort order that writers respect. Choose the sort key by the same method as the partition key: look at the query log. The pattern that works is partition on the coarse dimension almost everyone filters on, then sort within the partition on the next most common filter, typically a high-cardinality identifier.

An example makes the payoff concrete. An events table partitioned by day, unsorted, with 2,000 files per day. A query filtering on a single user ID has to read all 2,000 files, because any file can contain that user. Sort the same data by user ID within each day and the query reads a handful. The data volume on disk is the same. The scan is two orders of magnitude smaller.

Sorting costs write time. That is the whole tradeoff. For a table written once and read thousands of times, it is one of the best trades available. For a landing table that gets read twice, skip it.

Two practical notes. Multi-column sorts help in order, so put the most selective common filter first. And a sort that a later compaction does not preserve is a sort you paid for once and lost, so make sure your compaction job applies the same sort order.

## Copy-on-write or merge-on-read

Batch pipelines that only append have an easy life. Pipelines that update or delete rows have to pick a strategy, and the choice shows up in every subsequent query.

**Copy-on-write** rewrites any data file containing an affected row. Update one row in a 500 MB file and the engine writes a new 500 MB file. Writes are expensive. Reads are clean, because the file set contains exactly the current rows with no reconciliation needed at query time.

**Merge-on-read** writes delete information alongside the original files and leaves the data in place. Writes are fast. Reads pay a cost, because the engine applies deletes as it scans.

The decision follows from the ratio of writes to reads and from how scattered the updates are.

Copy-on-write suits tables where updates are infrequent or concentrated. A daily dimension refresh that rewrites recent partitions is a good fit. So is any table where the read path must stay simple because many different engines consume it.

Merge-on-read suits tables with frequent, scattered updates. A CDC-fed fact table taking thousands of updates spread across years of history collapses under copy-on-write, since each small update rewrites large files.

Iceberg lets you set the mode per operation, so a table can use copy-on-write for deletes and merge-on-read for updates. Read the properties as three separate settings, one each for update, delete, and merge.

The important operational point about merge-on-read is that delete files accumulate. Every merge adds more reconciliation work at read time. Without compaction that folds deletes into the data files, read performance degrades steadily. Merge-on-read is a promise to compact, and teams that make the promise without keeping it end up worse off than if they had used copy-on-write from the start.

Format version 3 improves this materially. V3 replaced positional delete files with binary deletion vectors, which store row-level delete information as compact bitmaps. That reduces the number of files an engine opens and speeds up merge reconciliation. If your engine fleet supports V3, merge-on-read is a stronger option than it was two years ago. Verify support across every reader before upgrading a table, because a V3 table is invisible to a client that only speaks V2.

## Incremental extraction and idempotency

The pipeline's input side deserves as much design as its output side, and the two interact.

**Full refresh** reads everything from the source every run. Simple and correct and expensive. Perfectly reasonable for small dimension tables and indefensible for large fact tables.

**Watermark-based incremental** reads records where a monotonically increasing column exceeds the last run's high-water mark. Cheap and easy to get subtly wrong. Late-arriving records below the watermark are lost forever. Records sharing the boundary value get duplicated or dropped depending on whether the comparison is inclusive. The fix is to overlap: read from the watermark minus a safety window, then rely on your idempotent merge to absorb the duplicates.

**Change data capture** reads a change stream from the source. Most accurate, most infrastructure. It also produces the exact workload that merge-on-read exists to handle.

**Iceberg incremental reads** apply when the source is itself an Iceberg table. Iceberg supports reading the rows appended between two snapshots, which turns downstream pipelines into cheap incremental jobs. Record the snapshot ID your run consumed and read forward from it next time. This is the cleanest incremental pattern available, since the snapshot ID is an exact position rather than a value-based guess.

Whichever you choose, the idempotency contract is the same. Running the same batch twice produces the same table state as running it once. Build it with a batch identifier and a delete-then-insert, or with a `MERGE` keyed on a business key. Test it by deliberately rerunning a batch in a lower environment and comparing counts. A pipeline whose idempotency has never been tested does not have idempotency, it has a belief.

## Write-audit-publish, and why branches make it cheap

Data quality checks that run after publication tell you that bad data reached your users. Checks that run before publication prevent it. Write-audit-publish is the pattern, and Iceberg's branching support makes it nearly free.

The mechanism is worth stating precisely. Iceberg branches are named references to snapshots. Creating a branch is a metadata operation, and the branch shares all existing data files with the main branch, so it costs nothing in storage. Write to the branch, and the writes are invisible to anyone reading the table normally. Run your validations against the branch. If they pass, fast-forward main to the branch head, which is another metadata operation and effectively instantaneous. If they fail, drop the branch and no consumer ever saw the data.

Compare that with the alternative most teams start with: a separate staging table, validation there, then a copy into production. The copy is a full data movement, it takes real time, and there is a window where production is partially updated. Branching removes all of it.

The Iceberg documentation covers the Spark form, where you set `spark.wap.branch` to the audit branch name and subsequent writes and reads go to that branch, then call the `fast_forward` procedure to advance main. Engines differ in how they expose branch writes, and support is not universal, so verify what your engine offers before designing around it. The concept is in the format. The ergonomics are in the engine.

What to check during the audit stage, in rough priority order:

- **Row counts against expectation.** A batch 10% of its usual size is usually a broken extract rather than a quiet business day.
- **Null rates on required columns.** Sudden nulls almost always mean a source schema change.
- **Uniqueness on business keys.** Duplicates from a source system that changed its export semantics are common and silent.
- **Referential checks against dimensions.** Fact rows with keys that do not exist in the dimension.
- **Value distributions on important measures.** A revenue column whose mean shifted by an order of magnitude deserves a human.

Tags complete the picture. A tag is a named reference to a snapshot that does not move. Tagging the snapshot after each successful publish gives you `month-end-2026-07` as a queryable, permanent reference point. Reproducing a report six months later becomes a matter of querying the tag rather than reconstructing state.

## A worked pipeline

Here is the shape of a daily batch pipeline into a production Iceberg table, expressed in SQL and table properties. The syntax leans on Spark SQL conventions because they are widely readable, and the design translates to any engine.

```sql
-- 1. Table definition. Every property here is a decision, not a default.
CREATE TABLE lakehouse.analytics.orders (
    order_id        BIGINT,
    customer_id     BIGINT,
    order_ts        TIMESTAMP,
    status          STRING,
    amount          DECIMAL(12,2),
    batch_id        STRING
)
USING iceberg
PARTITIONED BY (days(order_ts), bucket(16, customer_id))
TBLPROPERTIES (
    'format-version'                  = '2',
    'write.distribution-mode'         = 'hash',
    'write.target-file-size-bytes'    = '536870912',
    'write.parquet.compression-codec' = 'zstd',
    'write.update.mode'               = 'merge-on-read',
    'write.delete.mode'               = 'merge-on-read',
    'write.merge.mode'                = 'merge-on-read',
    'history.expire.max-snapshot-age-ms' = '604800000'
);

-- Sort order applies to writes and to compaction.
ALTER TABLE lakehouse.analytics.orders WRITE ORDERED BY customer_id, order_ts;
```

Reading that definition property by property:

`PARTITIONED BY (days(order_ts), bucket(16, customer_id))` prunes on the date range that appears in nearly every query, then subdivides by a hash of customer ID. The bucket transform gives equality pruning on customer without creating a partition per customer. Sixteen buckets is a starting point chosen so that a single day's partition splits into files of a workable size.

`write.distribution-mode = hash` shuffles rows to partitions before writing, which is the guard against the file-count multiplication described earlier.

`write.target-file-size-bytes` at 512 MB tells writers and compaction what to aim for. Files in the 256 MB to 1 GB range balance parallelism against per-file overhead for most analytical scans.

`zstd` compression gives better ratios than snappy at comparable decompression speed for most analytical data. Test on your own data rather than trusting the general claim.

The three merge-on-read settings suit a table with scattered updates from an order lifecycle, where orders change status days after creation. A table with only nightly bulk refreshes sets these to copy-on-write instead.

`history.expire.max-snapshot-age-ms` at seven days documents the retention intent in the table itself, so whoever runs expiration later does not have to guess.

The sort order is separate from the partition spec on purpose. Partitioning determines which files a query opens. Sorting determines how tightly each file's statistics bound its contents.

```sql
-- 2. Write to an audit branch instead of main.
ALTER TABLE lakehouse.analytics.orders CREATE BRANCH audit_20260802;

-- Engine-level setting that routes writes and reads to the branch.
SET spark.wap.branch = audit_20260802;

-- 3. Idempotent load. Remove anything already present for this batch,
--    then insert. Rerunning the job produces identical state.
DELETE FROM lakehouse.analytics.orders
WHERE batch_id = '2026-08-02';

INSERT INTO lakehouse.analytics.orders
SELECT
    order_id,
    customer_id,
    order_ts,
    status,
    amount,
    '2026-08-02' AS batch_id
FROM staging.orders_cleaned
WHERE load_date = '2026-08-02';
```

The delete-then-insert on `batch_id` is the whole idempotency mechanism. It survives partial failures, manual reruns, and orchestrator retries. Because both statements target the audit branch, main is untouched throughout.

```sql
-- 4. Audit. These run against the branch, so failures are invisible
--    to production consumers.
SELECT COUNT(*) AS row_count
FROM lakehouse.analytics.orders
WHERE batch_id = '2026-08-02';

SELECT COUNT(*) AS null_customers
FROM lakehouse.analytics.orders
WHERE batch_id = '2026-08-02' AND customer_id IS NULL;

SELECT COUNT(*) AS dupes FROM (
    SELECT order_id
    FROM lakehouse.analytics.orders
    WHERE batch_id = '2026-08-02'
    GROUP BY order_id
    HAVING COUNT(*) > 1
);

-- 5. Publish. Metadata-only, atomic, instant.
CALL lakehouse.system.fast_forward(
    table  => 'analytics.orders',
    branch => 'main',
    to     => 'audit_20260802'
);

-- 6. Tag the published state for reproducibility.
ALTER TABLE lakehouse.analytics.orders
CREATE TAG daily_20260802 RETAIN 90 DAYS;
```

Your orchestrator wraps steps 4 and 5 in a conditional. Checks pass, publish and tag. Checks fail, drop the branch, raise an alert, and leave production exactly as it was.

## Maintenance is a pipeline stage, not a chore

Every batch pipeline should ship with its maintenance jobs. Treating maintenance as something to set up later means it gets set up after the first outage.

Four jobs cover it, and the order in which they run matters.

**Compaction** rewrites small files into larger ones and folds delete files into data files. Run it on the partitions your pipeline just touched rather than the whole table. Most engines expose a rewrite procedure that accepts a filter, and scoping it to recent partitions turns an hours-long job into a minutes-long one. Set the target file size to match the table property so compaction and writers agree.

**Manifest rewriting** consolidates and clusters the manifest files that planning reads. This is the step teams forget, and it is the one that most directly attacks planning latency. A table with thousands of fragmented manifests spends real time opening them before it touches data. Run it weekly on active tables, or after any large backfill.

**Snapshot expiration** removes old snapshots and the data files only they reference. This is the step that actually reclaims storage, because compaction alone does not delete anything as long as an old snapshot still points at the pre-compaction files. Set retention from your real time-travel needs. Seven days covers most operational rollback scenarios. Longer retention is a legitimate choice and it costs storage.

**Orphan file removal** deletes files in the table's storage location that no metadata references, left behind by failed jobs. Run it rarely, monthly is plenty, and always with a conservative age threshold so it cannot delete files from a job that is still running. This is the one maintenance operation that can destroy data if configured carelessly.

The ordering rule: compact first, then expire snapshots, then rewrite manifests. Compaction creates new files and leaves the old ones referenced by prior snapshots. Expiration is what releases them. Running expiration before compaction wastes the opportunity.

One coordination warning. Snapshot expiration is destructive and breaks anyone time-traveling into the range you removed. If another team queries historical snapshots or another platform mirrors your table, agree on the retention window before shortening it.

## Failure modes and their warning signs

These are the patterns I see repeatedly, with the symptom that shows up first.

**Planning time growing while data volume is flat.** Metadata debt. Too many snapshots, too many manifests, or too many small files. Check file count per partition and manifest count before assuming anything about scan performance.

**One partition far larger than the rest.** Skew, usually from a default value. Nulls mapping to a single partition, or a placeholder customer ID absorbing every unmatched record. Skew makes one task run for an hour while 199 sit idle. Find it by querying the table's partitions metadata and looking at record counts.

**Merge times climbing steadily on a merge-on-read table.** Delete file accumulation. Compaction is not keeping pace with the update rate. Either compact more often or reconsider the mode for that table.

**Duplicate rows after a retry.** Idempotency that was never real. The batch identifier is missing, wrong, or not actually used in the delete predicate.

**Commit failures under concurrency.** Two writers on one table. Sometimes the fix is retry configuration. More often the fix is architectural, and the right answer is to have one writer.

**Queries fine on one engine, failing on another.** Format version or feature skew. One engine writes something the other does not read: a V3 feature, a deletion vector, a partition transform added recently. Inventory engine versions across the fleet and pin them.

**Storage growing much faster than the data.** Snapshot retention too long, orphan files never cleaned, or compaction running without expiration so every file exists twice.

**A dashboard that got slow after a backfill.** Backfills write enormous numbers of files and often bypass the distribution mode and sort order that normal writes use. Always compact after a backfill, and check that the backfill job used the same table properties as the regular pipeline.

## Backfills need their own design

Backfills are where well-behaved pipelines go wrong, because teams treat them as the normal pipeline pointed at more data. They are a different workload with different constraints.

A daily pipeline writes one day into a table that already holds two years. A backfill writes two years into a table that holds nothing. The first is a small append against a large base. The second is a bulk load where every choice about file layout applies to the entire table at once. Run the daily logic 730 times in a loop and you get 730 commits, 730 snapshots, and a file layout produced by a job that was tuned for a much smaller unit of work.

Four adjustments make backfills behave.

**Batch the commits by a sensible unit.** One commit per month of data rather than per day cuts snapshot count by a factor of thirty and still lets you restart from a known point after a failure. Pick the unit so that a single commit represents somewhere between fifteen minutes and an hour of compute.

**Use range distribution rather than hash.** The extra shuffle cost is worth paying once for a layout that thousands of future queries read. This is the case where the most expensive write mode is the correct one.

**Write to a branch and publish once.** A backfill that publishes incrementally exposes users to a table that is half-populated for hours. A backfill that writes to a branch and fast-forwards at the end flips the whole range into visibility at once.

**Compact immediately afterward, then expire.** Backfills produce the largest file-count spikes any pipeline creates. Scheduling compaction to run right after the backfill completes, scoped to the affected partitions, prevents the layout from staying wrong until the weekly maintenance window arrives.

One more habit worth adopting: run the backfill against a copy of the table first, on a subset of the range, and measure the resulting file count and planning time. Twenty minutes of measurement tells you whether your distribution and sort settings are producing the layout you expect. Finding out afterward, on a table that took nine hours to write, is an expensive way to learn.

## Orchestration and observability

The orchestration layer needs three things from an Iceberg pipeline, and most teams build only the first.

**Retries that are safe.** This follows from idempotency. If the merge is idempotent and the batch identifier is stable, the orchestrator retries freely. If not, retries create duplicates, and the team learns to fear retries, and then failures require manual intervention at 3 a.m.

**Dependency on published state, not job completion.** Downstream jobs should trigger on the publish step, not on the upstream job's exit code. With write-audit-publish, those are different events, and a job that succeeded while failing its audit checks should not release downstream work.

**Snapshot lineage recorded per run.** Log the snapshot ID the run produced and the source snapshot ID it consumed. That single pair of numbers turns most incident investigations from archaeology into a query. Iceberg's metadata tables expose snapshot history, and joining it against your run log tells you exactly which pipeline execution produced any row.

For observability, the metrics worth tracking per table are small in number and boring, which is why they get skipped. File count and average file size per partition. Snapshot count. Manifest count. Planning time on a representative query. Total storage against logical data size. Track them weekly. Every metric in that list degrades slowly enough that nobody notices day to day and fast enough to matter within a quarter.

## A checklist before you ship

Run through this before a new pipeline goes to production. It takes twenty minutes and saves months.

- Query log reviewed, dominant filters identified
- Partition spec chosen with a target partition size, not a target partition count
- No partition transform on a column with high cardinality
- Sort order defined and matching the second-most-common filter
- `write.distribution-mode` set explicitly
- Target file size set on the table and matched in the compaction job
- Copy-on-write or merge-on-read chosen per operation with a stated reason
- Format version chosen and verified against every reading engine
- Batch identifier carried through staging and used in the idempotent load
- Exactly one writer per table for each operation type
- Isolation level chosen if concurrent writers are unavoidable
- Audit checks defined with thresholds, running before publish
- Publish step separate from the write step
- Compaction, snapshot expiration, manifest rewriting, and orphan cleanup scheduled with owners
- Snapshot retention agreed with every consumer that time-travels
- Snapshot IDs logged per run

Teams that can tick all sixteen have pipelines that stay fast. Teams that cannot usually know exactly which line they skipped once they read the list.

## Conclusion

Batch pipelines into Apache Iceberg fail slowly. Nothing crashes. The table gets a little more fragmented each night, the metadata grows a little heavier, the delete files stack up, and one day a dashboard that used to load in two seconds takes forty. By then the cause is spread across six months of commits and the fix looks like a project.

The decisions that prevent it are all made at design time and none of them are difficult. Design the table from the read pattern. Make the commit the unit of work and commit as rarely as freshness allows. Shuffle by partition before writing. Sort for the filters your users actually use. Choose copy-on-write or merge-on-read deliberately and compact accordingly. Carry a batch identifier so reruns are safe. Publish through a branch so bad data never reaches a consumer. Schedule maintenance with the same seriousness as the pipeline itself.

None of that is engine-specific, which is the useful part. The format sets these constraints, so the same reasoning applies whether you write with Spark, Flink, Trino, PyIceberg, or a managed service that hides the details. Learn the mechanism once and it transfers everywhere your data goes.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and Apache Iceberg.
*Architecting an Apache Iceberg Lakehouse* (Manning) goes deeper on partition design, maintenance scheduling, and multi-engine pipeline patterns than a single article allows.
You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at
[books.alexmerced.com](https://books.alexmerced.com).
