---
title: "Autonomous Table Optimization When Your Query Workload Stops Being Predictable"
date: "2026-08-04"
description: "Autonomous table optimization when query workloads stop being predictable: observing file layout and query patterns, scoring compaction work, adaptive sort order, and cost discipline."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Table Optimization
  - Compaction
  - Autonomous
  - Data Lakehouse
canonical: "https://iceberglakehouse.com/posts/autonomous-table-optimization/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/autonomous-table-optimization/).

# Autonomous Table Optimization When Your Query Workload Stops Being Predictable

*By Alex Merced, Data Lakehouse and AI Evangelist*

Table maintenance used to be a scheduling problem. You knew which tables were hot, you knew that dashboards filtered on order date and region, and you knew the batch window ran from 1am to 4am. You wrote a compaction job with a sort order matching the known filters, put it on a cron, and it worked for two years.

Then agents started querying the same tables. The filter columns changed weekly because agents follow whatever question a user asks. Query volume went up by an order of magnitude and query size went down. The 1am batch window stopped being empty, because agents run whenever someone is awake somewhere. And the sort order you picked in 2024 for a dashboard nobody opens anymore is still there, doing nothing.

Manual `OPTIMIZE` and `VACUUM` scheduling assumed a stable, known workload. That assumption is what broke. This piece covers what autonomous table optimization actually means, how a system decides what to compact and how to sort it from observed behavior, what the mechanics look like in Apache Iceberg, and where autonomy goes wrong.

A disclosure. I work for Dremio, which was acquired by SAP and now sits within SAP Business Data Cloud. Dremio ships autonomous optimization features, as do several other platforms and managed catalogs. I have tried to describe the mechanism rather than the product, because the mechanism is what you need whether you buy it or build it.

## What maintenance is for

Four jobs run against an Iceberg table, and conflating them is the first source of confusion.

**Compaction** rewrites many small data files into fewer larger ones. It reduces planning cost, improves scan throughput, and materializes deletes into rewritten files. This is the one that matters most.

**Snapshot expiration** removes old snapshots and the files only they reference. Without it, storage grows without bound and the metadata tree gets long.

**Orphan file cleanup** removes files in the table's storage location that no snapshot references, usually left by failed writes.

**Manifest rewriting** reorganizes metadata so that manifests cluster usefully and planning reads fewer of them.

Each of the four has a different trigger, a different cost profile, and a different consequence for skipping it. A system that runs all four on the same schedule is either over-running the expensive ones or under-running the cheap ones.

## Why fixed schedules break under agent workloads

Five specific properties of agentic query traffic invalidate the assumptions behind cron-scheduled maintenance.

**Filter columns are unstable.** A dashboard filters on the same three columns forever. An agent filters on whatever the question mentions. Sort order chosen for last quarter's pattern prunes nothing for this quarter's.

**Query shape inverts.** Many small filtered queries rather than few large scans. Per-query planning cost dominates, which makes file count matter far more than it used to and makes small-file accumulation a first-order problem rather than a slow leak.

**There is no maintenance window.** Agent traffic follows human curiosity across time zones. The batch window that used to be empty now has load in it, and a heavy compaction job competing with live queries degrades exactly the interactive experience you were maintaining the table for.

**Write patterns changed too.** Streaming ingestion and CDC pipelines commit continuously, producing small files at a steady rate rather than in a nightly batch. The rate of small-file creation is now roughly constant instead of bursty.

**Skew is unpredictable.** Agents cluster on whatever is topical. A partition nobody touched for six months gets hammered for a week because a question made it interesting. A fixed schedule treats all partitions equally, which is wrong in both directions.

The result is a maintenance regime that is simultaneously too aggressive on cold data and too lax on hot data, tuned for a filter pattern that no longer holds.

## What the system needs to observe

Autonomous optimization is a control loop, and control loops need measurements. Four signal families cover it.

**File layout signals** come from Iceberg metadata directly and require no instrumentation.

```sql
SELECT
    partition,
    COUNT(*)                                            AS file_count,
    ROUND(AVG(file_size_in_bytes) / 1048576.0, 1)       AS avg_mb,
    ROUND(SUM(file_size_in_bytes) / 1073741824.0, 2)    AS total_gb,
    SUM(CASE WHEN file_size_in_bytes < 33554432
             THEN 1 ELSE 0 END)                         AS small_files
FROM prod.sales.orders.files
GROUP BY partition
ORDER BY small_files DESC;
```

Small file count per partition is the primary compaction trigger. Average file size well below your target means planning cost is inflated.

**Delete signals** tell you when masking overhead has grown enough that rewriting pays.

```sql
SELECT
    d.file_path,
    f.record_count                                        AS total_rows,
    d.record_count                                        AS deleted_rows,
    ROUND(100.0 * d.record_count / f.record_count, 1)     AS pct_deleted
FROM prod.sales.orders.delete_files d
JOIN prod.sales.orders.files f ON d.file_path = f.file_path
WHERE 100.0 * d.record_count / f.record_count > 20
ORDER BY pct_deleted DESC;
```

Under V3 deletion vectors, delete files no longer accumulate per operation, so this measures genuine deleted-row density rather than an artifact of the format. A file where thirty percent of rows are masked wastes thirty percent of every scan that touches it.

**Query signals** are the ones that require instrumentation and the ones that make the system smart rather than merely reactive.

For each table, over a rolling window: which columns appeared in filter predicates and how often, which columns appeared in join keys, which partitions were scanned, how many bytes were read versus how many were returned, and how much time went to planning versus execution.

The ratio of bytes read to bytes returned is the single most informative number. A query that reads 40 GB to return 200 rows is pruning badly, and the reason is usually that the filter column is uncorrelated with file boundaries.

**Cost and contention signals** tell the system when it can afford to act: current engine utilization, queue depth, and the recent commit conflict rate on the table.

## Deciding what to do

Given those signals, the decision logic is a set of scored candidates rather than a set of rules.

**Compaction priority** rises with small file count, with query frequency against the partition, and with deleted row density. It falls with the size of the rewrite and with recent write activity, since compacting a partition that is actively receiving writes loses the commit race.

A workable scoring shape:

```
compaction_score =
      w1 * (small_file_count / target_file_count)
    + w2 * (queries_last_7d / max_queries_any_partition)
    + w3 * (deleted_row_pct / 100)
    - w4 * (rewrite_bytes / total_table_bytes)
    - w5 * (commits_last_1h / max_commits_any_partition)
```

The point is not these particular weights. It is that priority is a function of both how bad the layout is and how much anybody cares, and that the cost of fixing it appears with a negative sign.

**Sort order selection** comes from observed filter columns. Rank columns by how often they appear in predicates, weighted by the selectivity they achieved and by the query's cost. A column that appears in ninety percent of queries but only ever with a range covering most of the table is not worth sorting on. A column that appears in forty percent of queries with high selectivity is.

Then check correlation. Sorting on two highly correlated columns buys little beyond the first. Sorting on a column already implied by the partition spec buys nothing.

**Partition spec evolution** is the higher-risk decision. Iceberg supports partition evolution, so a spec can change without rewriting history, and new data writes under the new spec while old data keeps its own. That makes the change cheap to apply and expensive to get wrong, because a table with several specs in play complicates planning.

My guidance is that autonomous systems should propose partition changes and let a human approve them, at least until you have a year of evidence. The signal for a bad spec is clear enough to detect automatically. The consequence of thrashing is bad enough to want a human in the path.

**Snapshot expiration** is the easy one. Retention is a policy decision, not an optimization, and the system should apply the policy on schedule rather than reason about it.

## The mechanics in Iceberg

The procedures are standard, and the interesting part is the parameters an autonomous system varies.

```sql
CALL prod.system.rewrite_data_files(
    table       => 'sales.orders',
    strategy    => 'sort',
    sort_order  => 'region ASC NULLS LAST, order_date ASC',
    where       => 'order_date >= DATE ''2026-07-01''',
    options     => map(
        'target-file-size-bytes',   '536870912',
        'min-input-files',          '8',
        'max-concurrent-file-group-rewrites', '4',
        'partial-progress.enabled', 'true',
        'partial-progress.max-commits', '10',
        'rewrite-job-order',        'bytes-desc'
    )
);
```

Five of those parameters are the autonomy surface.

**`sort_order`** comes from the observed filter analysis rather than from a static table property. This is the part that adapts to a changing workload.

**`where`** scopes the rewrite to the partitions that scored highest, so the job is small and finishes. A rewrite of an entire large table is a job that fails at hour six and restarts from nothing.

**`min-input-files`** prevents pointless work. A file group with three files that are already large gains nothing from a rewrite.

**`partial-progress.enabled`** with a commit cap is what makes long rewrites survivable. Each batch commits independently, so a failure loses one batch rather than everything, and other writers get commit windows in between.

**`max-concurrent-file-group-rewrites`** is the throttle. An autonomous system should lower this when engine utilization is high and raise it when the system is quiet, which is the closest thing to a maintenance window that still exists.

For the sort itself, z-ordering is the option when multiple columns matter roughly equally.

```sql
CALL prod.system.rewrite_data_files(
    table      => 'sales.orders',
    strategy   => 'sort',
    sort_order => 'zorder(region, product_line)',
    where      => 'order_date >= DATE ''2026-07-01'''
);
```

Linear sort is better when one column dominates the filter pattern. Z-order is better when queries filter on different subsets of several columns, which describes agent traffic more often than it describes dashboard traffic. That is a genuine argument for revisiting sort strategy as workloads shift toward agents.

The other three jobs are simpler.

```sql
CALL prod.system.expire_snapshots(
    table              => 'sales.orders',
    older_than         => TIMESTAMP '2026-07-05 00:00:00',
    retain_last        => 10,
    max_concurrent_deletes => 8
);

CALL prod.system.remove_orphan_files(
    table      => 'sales.orders',
    older_than => TIMESTAMP '2026-08-01 00:00:00'
);

CALL prod.system.rewrite_manifests(
    table => 'sales.orders'
);
```

One caution on orphan file removal: it lists storage to find unreferenced files, which means it is expensive on large tables and it can misbehave if another process is writing to the same location. It also does not work through vended credentials in some engine versions, which is a real operational wrinkle in credential-vending deployments. Run it less often than compaction, with a generous `older_than`, and give it its own scoped identity.

## Measuring whether it worked

An autonomous system that cannot measure its own effect is an expensive random number generator. Four measurements close the loop.

**Bytes read per query** on the affected table, before and after. This is the direct measure of whether sort order improved pruning. If it did not move, the sort order was chosen from a filter pattern that does not actually prune.

**Planning time as a share of query time.** Compaction should reduce it. A rising planning share means file counts are winning the race against your maintenance rate.

**Storage delta.** Compaction plus snapshot retention temporarily increases storage, since old files persist until expiration. A system that compacts aggressively and expires lazily grows storage without bound.

**Maintenance compute cost against query compute saved.** The only honest measure of whether the loop is worth running. A compaction job that costs more compute than it saves across the following week is a job that should not have run. Track this per table and you will find tables where the answer is to stop maintaining them at all.

Store all four in a table and let the system read its own history. That is what turns a reactive system into one that learns which interventions pay on which tables.

## Instrumenting query patterns

The file-layout signals come free from Iceberg metadata. The query signals do not, and they are the ones that separate an autonomous optimizer from a reactive one. Most teams have this data and have never assembled it.

Every engine exposes query history with some form of plan detail. What you need out of it is a per-table, per-column record of predicate usage.

```sql
CREATE TABLE ops.optimizer.predicate_usage (
    table_name        STRING,
    column_name       STRING,
    predicate_type    STRING,   -- equality, range, in_list, like
    observed_at       TIMESTAMP,
    queries           BIGINT,
    avg_selectivity   DOUBLE,   -- rows returned / rows scanned
    avg_bytes_read    BIGINT,
    avg_bytes_returned BIGINT,
    avg_planning_ms   BIGINT,
    avg_execution_ms  BIGINT,
    workload_class    STRING    -- agent, dashboard, pipeline, adhoc
)
USING iceberg
PARTITIONED BY (days(observed_at));
```

`workload_class` is the field worth adding even though it takes effort to populate. Agent traffic, dashboard traffic, and pipeline traffic want different physical layouts, and a table serving all three needs a decision about which one to optimize for. Without the classification you optimize for whichever is loudest, which is usually pipelines because they scan the most bytes and are the least sensitive to layout.

The analysis query that drives sort order selection reads from it directly.

```sql
SELECT
    column_name,
    SUM(queries)                                          AS total_queries,
    ROUND(AVG(avg_selectivity), 4)                        AS selectivity,
    ROUND(SUM(queries * avg_bytes_read) / 1073741824.0, 1) AS gb_read,
    ROUND(SUM(queries * avg_bytes_returned)
          / NULLIF(SUM(queries * avg_bytes_read), 0), 6)   AS read_efficiency
FROM ops.optimizer.predicate_usage
WHERE table_name = 'sales.orders'
  AND workload_class = 'agent'
  AND observed_at >= current_date - INTERVAL '28' DAY
GROUP BY column_name
ORDER BY gb_read DESC;
```

Read the output this way. Columns at the top of `gb_read` are where the money goes. Among those, columns with low `read_efficiency` are pruning badly and are your sort candidates. Columns with high selectivity but low query volume are not worth a rewrite yet. Columns with high volume and already-good efficiency are working fine and need nothing.

The twenty-eight day window matters. Shorter windows chase noise, and agent filter patterns genuinely do fluctuate week to week. Longer windows lag real changes in what the business cares about.

Run the same query per workload class and compare. When agent traffic and dashboard traffic want different sort orders on the same table, you have a decision to make, and the honest options are to optimize for the higher-value workload, to split the table into two physical representations, or to accept a compromise order that serves neither perfectly. Materializing a second representation is cheaper than it sounds when storage is object storage and both are Iceberg tables under the same catalog.

## A worked decision

Walking one table through the loop makes the scoring concrete.

A CDC target table holds eighteen months of order data, partitioned by month on the order date. Ingestion commits every thirty seconds. Agents query it heavily, dashboards query it moderately, and a nightly pipeline scans it fully.

**Observation.** The current month's partition holds 41,000 files averaging 6 MB. The previous eleven months average 340 files at 380 MB each. Predicate analysis shows agent queries filter on `customer_segment` in 61 percent of queries with average selectivity of 0.03, and on `order_date` in 88 percent with selectivity of 0.4. The table's sort order is `order_id`, chosen three years ago when a lookup pattern mattered.

**Scoring.** The current partition scores extremely high on small file count and high on query frequency. It scores negatively on recent commit rate, since ingestion is active. The eleven historical partitions score low on layout and moderate on query frequency.

**Decision one.** Compact the current partition, but scope it to files older than the last two hours so the rewrite is not racing live ingestion for the same file groups. Use partial progress with a ten-commit cap so ingestion gets windows in between. This is the highest-value action and it recurs continuously rather than once.

**Decision two.** The sort order is wrong. `order_id` appears in almost no agent predicates. `customer_segment` has high selectivity and high frequency, and `order_date` is already covered by the partition spec, so sorting on it adds little. The proposal is a linear sort on `customer_segment`, applied to historical partitions during their next rewrite rather than as an immediate full-table job.

**Decision three.** Historical partitions do not need compaction on layout grounds. They get rewritten only when the sort order change reaches them, and that happens gradually, one or two partitions per maintenance window, prioritized by query volume.

**Verification.** After the sort change lands on the three most-queried historical partitions, compare bytes read per agent query against those partitions versus the untouched ones. That is a controlled comparison against a live workload, and it is the evidence for whether to continue rolling the change forward or to revert.

Notice that the answer was not "compact everything nightly." It was one continuous small job, one gradual rollout, and one deliberate decision not to act on eleven partitions. Fixed schedules cannot express any of that.

## Cost discipline

The failure mode nobody warns about is a maintenance system that consumes more than it saves, quietly, on tables where the arithmetic never worked.

Track two numbers per table per week: maintenance compute consumed, and query compute saved as estimated from the before-and-after bytes read on the affected partitions.

```sql
SELECT
    table_name,
    SUM(maintenance_compute_sec)          AS maint_sec,
    SUM(estimated_query_savings_sec)      AS saved_sec,
    ROUND(SUM(estimated_query_savings_sec)
          / NULLIF(SUM(maintenance_compute_sec), 0), 2) AS return_ratio
FROM ops.optimizer.maintenance_log
WHERE run_at >= current_date - INTERVAL '30' DAY
GROUP BY table_name
ORDER BY return_ratio ASC;
```

Sorting ascending puts the worst offenders first, which is the list to act on. A return ratio below one means the table cost more to maintain than the maintenance saved. Some of those are genuinely worth maintaining anyway, because latency matters more than cost on an interactive table. Most are tables that get compacted out of habit and read twice a month.

The decision for a persistently negative table is to reduce its maintenance frequency, not to fix the optimizer. Some tables should be left alone.

Set a weekly compute allowance per table and let the priority scoring allocate within it. An optimizer with an unbounded budget will always find another rewrite worth doing, because there is always another file group slightly below target size. The bound is what forces it to spend on the interventions that matter.

## Failure modes

**Compaction losing the commit race.** A rewrite of a partition under active write load produces a commit conflict with the ingestion job, and the rewrite retries and loses again. The fix is to scope rewrites away from actively-written partitions, which is why recent commit rate appears with a negative sign in the priority score.

**Sort order thrash.** Filter patterns shift week to week, and a system that re-sorts on every shift spends its entire budget rewriting the same data into different orders. Require a sustained change over multiple windows, and require a minimum expected benefit before acting.

**Optimizing tables nobody queries.** A maintenance system driven purely by file layout will faithfully compact a table that has not been read in eight months. Query frequency has to be an input.

**Storage growth from aggressive compaction.** Every rewrite creates new files while the old ones remain until snapshot expiration. Compaction and expiration policies have to be designed together.

**Expiration that breaks time travel guarantees.** Someone sets a seven-day retention and a compliance requirement needs ninety-day reproducibility. Retention is a policy input, not something the optimizer chooses.

**Orphan cleanup deleting live files.** If another process writes to the table's location outside the catalog's knowledge, orphan removal will helpfully delete its files. Verify that nothing writes to the location except through the catalog before enabling it.

**Autonomy without observability.** The system does something, query performance changes, and nobody can say which action caused it. Log every maintenance action with its trigger, its parameters, its cost, and the measured before-and-after.

**Maintenance competing with itself.** Two jobs targeting overlapping file groups conflict, retry, and waste the budget they were allocated. Serialize maintenance per table, and treat the table rather than the partition as the lock granularity.

**Hidden partitioning misunderstood.** Iceberg records partition transforms in metadata rather than in directory paths, so an agent filtering on the natural column gets pruning automatically. Teams sometimes add a sort on the partition column, which buys nothing. Check that a proposed sort column is not already covered by the spec.

## Rolling it out

Start in advisory mode. Run the analysis, produce a ranked list of recommended actions with the expected benefit, and have a human execute them. Two or three weeks of that tells you whether the scoring is sane, and it costs nothing if it is not.

Enable autonomy first for the safest action, which is compaction with the existing sort order on partitions that are not actively written. Low risk, immediate benefit, and reversible in the sense that the worst case is wasted compute.

Add adaptive sort order next, with a requirement that the new order beat the old one in a measured comparison before it becomes permanent.

Keep partition spec evolution and retention policy under human control indefinitely. Those are the two decisions where the cost of a mistake substantially exceeds the cost of a human review.

Give the maintenance workload its own compute, separate from the interactive workload agents are hitting. The storage and compute separation of a lakehouse makes this cheap, and it prevents maintenance from degrading the experience it exists to protect.

Budget maintenance explicitly. Set a compute allowance per table per week and let the priority scoring decide how to spend it. An unbounded maintenance system will find work forever.

Publish what it did. A weekly summary of actions taken, cost incurred, and measured improvement is what earns the autonomy to keep running.

## The relationship to what is coming

Two developments change this picture.

The Iceberg V4 metadata work reduces the pressure that streaming commits put on the metadata layer. Adaptive metadata trees and single-file commits make small commits cheap at the format level, which means less of the small-file problem is created in the first place. Maintenance will still be necessary. It will be less of a race.

Managed catalogs increasingly run maintenance themselves. Amazon S3 Tables does it, and other managed offerings are following. That is a genuine operational simplification, and it comes with the caveat that a managed maintenance path has to understand every feature you use. A service that compacts naively can destroy a shredded Variant layout or reintroduce a sort order you did not want. Verify what the managed path preserves before relying on it.

The broader direction is that table maintenance moves from a scheduled job somebody owns to a property of the platform, driven by observed behavior. That is the right destination. It arrives faster for teams who instrumented their query patterns before the platform asked for them.

## Conclusion

Fixed maintenance schedules encoded assumptions about a stable workload, and agentic query traffic broke every one of them: unstable filter columns, inverted query shape, no empty window, continuous small-file creation, and unpredictable partition skew.

The replacement is a control loop. Observe file layout, delete density, query patterns, and system contention. Score compaction candidates by how bad the layout is, how much anybody cares, and what the fix costs. Choose sort order from measured filter behavior and selectivity rather than from a decision made two years ago. Scope every rewrite narrowly, enable partial progress, and throttle by current load.

Then measure whether it worked, in bytes read per query and in maintenance compute against query compute saved. Run it in advisory mode first, automate the safe actions, and keep partition evolution and retention under human control.

The tables that serve agents well are the ones where somebody is paying attention to how they are being queried. Autonomy is how you pay attention at a scale a person cannot, and cost discipline is what keeps that attention from becoming its own expense.

## Keep Going

If this piece was useful, I have written a lot more on Iceberg internals and lakehouse operations. *Apache Iceberg: The Definitive Guide* covers the maintenance procedures, partitioning, and metadata mechanics behind everything here, and *Architecting an Apache Iceberg Lakehouse* covers the platform design around them. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
