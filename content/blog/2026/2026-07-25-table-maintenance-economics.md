---
title: "Table Maintenance Stopped Being a Product"
date: "2026-07-25"
description: "Iceberg table maintenance commoditized when every platform started shipping it. What the six operations are, what they cost, and the observability you should keep even when the work is managed."
author: "Alex Merced"
category: "Data Engineering"
tags:
  - apache iceberg
  - compaction
  - table maintenance
  - lakehouse
  - small files
canonical: https://iceberglakehouse.com/posts/table-maintenance-economics/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/table-maintenance-economics/).

A team I worked with had a dashboard that loaded in three seconds in January and forty seconds in June. Data volume grew 20 percent over that period. Nobody changed the query, the engine, or the cluster size. The table had 340,000 data files where it should have had about 900, and 61,000 snapshots where 100 was the sane number. The query was not slow. The planning was slow, and the planning was slow because nobody had run compaction since the table was created.

That story is common enough to be boring. What is more interesting is what happened to the market around it. In April 2026, Cyera, a data security company valued in the billions, paid somewhere between 100 and 130 million dollars for Ryft, a two-year-old startup whose product was automated Apache Iceberg table maintenance. Ryft had raised eight million dollars. It employed about fifteen people. Its technology scheduled compaction based on observed query and ingestion behavior, handled retention and compliance deletion, and kept tables optimized without an engineer writing cron jobs.

A security company bought a table maintenance company. Read that twice, because it tells you exactly where this capability landed: maintenance is no longer a product you buy, it is a feature every platform ships, and the remaining value sits in what you do with the observability that maintenance requires.

I work at Dremio, now part of SAP, and autonomous table maintenance is something we ship, so my interest here is not neutral. The arithmetic below does not care who you buy from.

## What Maintenance Actually Is

Six distinct operations hide behind the word. They solve different problems, cost different amounts, and fail in different ways.

**Compaction, also called data file rewriting.** Small files get merged into larger ones. The target is usually 128 MB to 1 GB per file. This is the operation that fixes the most common performance problem, and it is the most expensive one because it reads and rewrites real data.

**Sorting and clustering.** A variant of compaction that also orders rows within and across files by chosen columns, so that min and max statistics per file let the engine skip files entirely. AWS added sort and z-order strategies to its managed compaction for exactly this reason. Sorting costs more than plain compaction and pays back on every filtered query afterward.

**Delete file rewriting.** In merge-on-read tables, updates and deletes write side files that readers reconcile at scan time. Iceberg v3 replaced positional delete files with deletion vectors, a compact bitmap per data file, which cut reconciliation cost substantially. Those still accumulate, and rewriting them folds the deletes into the data files.

**Manifest rewriting.** Iceberg tracks data files in manifest files, and manifests in a manifest list. Frequent commits produce many small manifests, and planning walks them. Rewriting reorganizes manifests so that partition-level pruning happens quickly.

**Snapshot expiration.** Every commit creates a snapshot. Snapshots hold references to data files, which is what makes time travel work and what prevents storage from being reclaimed. Expiration removes old snapshots past your retention window and makes the underlying files eligible for deletion.

**Orphan file removal.** Failed jobs write files that no snapshot references. Nothing else deletes them. This operation lists storage, compares against metadata, and removes the difference. It is the slowest to run and the easiest to forget.

Two more sit alongside these on modern platforms: statistics and Puffin file generation, which computes column-level statistics and sketches used for planning and for cost-based optimization, and location or path maintenance, which becomes relevant as Iceberg's v4 work on relative paths lands and tables become portable across storage locations.

## Why the Debt Accumulates Faster Than It Used To

The workloads changed and the maintenance requirement changed with them.

Streaming ingestion is the dominant new writer. Confluent Tableflow materializes Kafka topics into Iceberg tables. Redpanda writes Iceberg files at the broker. Snowflake Datastream, Flink, Spark Structured Streaming, and every CDC pipeline commit continuously. A writer committing every ten seconds produces 8,640 commits a day per table. Each commit produces at least one metadata file and usually several small data files. Multiply by the number of tables in a real estate and the metadata layer grows faster than the data layer.

Change data capture makes it worse. CDC produces updates and deletes, not just appends. On merge-on-read tables, every update writes a delete plus a new record, and readers pay for both until compaction folds them together.

Compliance deletion adds a third source. A right-to-erasure request against a partitioned table rewrites whichever files contain the affected rows, which produces new files and new snapshots on tables that were otherwise stable.

And the read side got more demanding. Agents issue far more queries than analysts do, and every one of them pays the planning cost. A table whose planning takes four seconds is annoying for a human running twenty queries a day and expensive for an agent population running four thousand.

## The Arithmetic of Write Amplification

Compaction cost is predictable enough to plan, and the math is worth internalizing because it drives every decision in this space.

Start with the input. A streaming writer targeting one commit per minute on a table receiving 50 GB a day produces roughly 1,440 commits and, at a typical few files per commit, several thousand files a day. Average file size lands in the low tens of megabytes.

Compaction reads those files and writes larger ones. Read volume equals the volume being compacted. Write volume equals roughly the same, since compression ratios stay similar. So a day's compaction on 50 GB of new data moves about 100 GB through compute. If you compact the same data twice because your scheduler runs on a fixed interval rather than on file-count triggers, you paid twice for no benefit.

That is write amplification, and the way to control it is to compact each byte roughly once. Practical rules that follow directly:

Compact by partition, and only partitions with recent writes. A `where` clause restricting compaction to the last day or two of partitions is the difference between rewriting a terabyte nightly and rewriting fifty gigabytes.

Trigger on file count and file size distribution rather than on the clock. A partition with 800 files averaging 8 MB needs compaction. A partition with 12 files averaging 400 MB does not, and running compaction on it burns compute to produce an identical layout.

Set the target file size deliberately. Larger files mean fewer files to plan and less metadata, at the cost of coarser pruning granularity and more read amplification when a query touches a small slice. 512 MB is a reasonable default for analytical tables, smaller for tables with highly selective point lookups.

Use partial progress on large jobs so a failure four hours in does not discard four hours of work.

As a planning number, maintenance compute typically lands between 10 and 25 percent of query compute on write-heavy tables. Teams that have never measured it are usually surprised in one of two directions: either they are not running it at all and the number is zero while query cost is inflated, or they are running it on a naive schedule and the number is above 40 percent.

## Why It Commoditized

Four years ago, keeping Iceberg tables healthy at scale was a genuine differentiator and a reasonable startup thesis. Today every serious platform ships it, which is what killed the standalone category.

**Amazon S3 Tables** perform maintenance inside the storage layer, including compaction with sort and z-order strategies, snapshot management, and now replication and intelligent tiering.

**Snowflake-managed Iceberg storage** handles metadata, layout, compaction, and file optimization internally, with the tables staying in the open format.

**Google's managed Iceberg tables** in Lakehouse include automatic table management and history-based optimizations, backed by metadata infrastructure built on Spanner.

**Databricks Unity Catalog** manages Delta and Iceberg tables with predictive optimization deciding what to run and when.

**Apache Gravitino** shipped a table maintenance service in 1.2.0 that schedules table health work proactively, which brings the capability into the open catalog layer.

**Apache Polaris** carries a policy store, seeded in 1.0, that gives compaction and snapshot expiration policies a persistent home with REST endpoints for managing their lifecycle. That matters because it moves maintenance policy from scripts into the catalog where the tables are governed.

**Dremio** runs autonomous optimization on tables and reflections, which is the same idea extended to derived materializations.

Once six platforms and two open catalogs ship the capability, the market for a standalone maintenance tool closes. Ryft's outcome was a good one, and the acquirer was a security company rather than a data platform, which is the informative part. What Cyera bought was not compaction. It was the observability layer underneath it: a system that watched how every table was used across every engine, by humans and agents, and turned that into scheduling decisions. That signal is worth more as a security control plane than as a performance feature.

## Build Versus Buy, With Numbers

The decision is more concrete than most build-versus-buy questions because the workload is well defined.

**Building it** means a scheduler, per-table policy, monitoring, and a failure-handling path. The operations themselves are single procedure calls in Spark, so the code is not the hard part. The hard parts are deciding what to run when, keeping the scheduler from colliding with writers, handling partial failures, and noticing when a table falls behind.

A realistic build looks like this. An orchestration DAG per table group, a metadata query that decides which partitions need work, compute to run the jobs, and a dashboard. Initial build lands around two to four engineer-weeks for something decent. Ongoing cost is roughly a quarter of an engineer indefinitely, rising with table count, plus the compute.

**Buying it** means the platform's maintenance runs and you pay for it, usually bundled into storage or compute pricing in a way that is invisible on the invoice.

The crossover is not really about cost. It is about attention. A quarter of an engineer is cheap compared to a platform contract. What is expensive is the failure mode where that engineer changes teams, the scheduler silently stops covering new tables, and eight months later a hundred tables have accumulated debt that shows up as a broad performance regression nobody can attribute. Managed maintenance survives staff turnover. Home-built maintenance frequently does not.

The recommendation that holds in most cases: buy the maintenance, keep the observability. Even on a fully managed platform, run your own metadata queries and alert on your own thresholds. Managed does not mean monitored, and the first sign that a managed optimizer is not keeping up should come from your alert rather than from a user complaint.

## The Queries That Tell You the Truth

Iceberg exposes metadata tables that answer every maintenance question directly. These four queries belong on a dashboard.

```sql
-- 1. File size distribution per partition. The primary health metric.
SELECT
    partition,
    COUNT(*)                                   AS file_count,
    CAST(AVG(file_size_in_bytes) / 1048576 AS INT) AS avg_mb,
    CAST(SUM(file_size_in_bytes) / 1073741824 AS DECIMAL(10,2)) AS total_gb,
    SUM(CASE WHEN file_size_in_bytes < 33554432 THEN 1 ELSE 0 END) AS files_under_32mb
FROM lakehouse.sales.orders.files
GROUP BY partition
ORDER BY file_count DESC
LIMIT 20;

-- 2. Snapshot accumulation and commit cadence.
SELECT
    COUNT(*)                                  AS snapshot_count,
    MIN(committed_at)                         AS oldest_snapshot,
    MAX(committed_at)                         AS newest_snapshot
FROM lakehouse.sales.orders.snapshots;

-- 3. Delete file debt on merge-on-read tables.
SELECT
    COUNT(*)                                  AS delete_file_count,
    CAST(SUM(file_size_in_bytes) / 1048576 AS INT) AS delete_mb
FROM lakehouse.sales.orders.delete_files;

-- 4. Manifest sprawl, which drives planning time.
SELECT
    COUNT(*)                                  AS manifest_count,
    CAST(AVG(length) / 1024 AS INT)           AS avg_kb,
    SUM(added_snapshot_id IS NOT NULL)        AS with_snapshot
FROM lakehouse.sales.orders.manifests;
```

The first query is the one to look at weekly. `files_under_32mb` per partition is the single best early indicator, because it rises before query times do. When a partition crosses a few hundred small files, planning cost is already climbing and users have not noticed yet.

The second query catches expiration failures. Snapshot count growing without bound means expiration is not running, which means storage is not being reclaimed no matter how much you delete.

The third catches merge-on-read decay, where read latency degrades steadily between compaction runs.

The fourth catches the subtler problem. Manifest count grows with commit frequency independent of data volume, and planning walks manifests. A table with modest data and 40,000 manifests plans slowly for reasons that have nothing to do with its size.

## Scheduling It Properly

The operations themselves are straightforward. The scheduling logic is where the savings live.

```sql
-- Compact only recent partitions, only when file counts justify it.
CALL lakehouse.system.rewrite_data_files(
    table             => 'sales.orders',
    strategy          => 'sort',
    sort_order        => 'customer_id ASC NULLS LAST, order_date ASC',
    where             => 'order_date >= current_date() - INTERVAL 2 DAYS',
    options           => map(
        'min-input-files',            '25',
        'target-file-size-bytes',     '536870912',
        'max-concurrent-file-group-rewrites', '8',
        'partial-progress.enabled',   'true',
        'partial-progress.max-commits', '10'
    )
);

-- Fold accumulated deletes back into data files.
CALL lakehouse.system.rewrite_position_delete_files(table => 'sales.orders');

-- Keep the metadata tree shallow.
CALL lakehouse.system.rewrite_manifests(table => 'sales.orders');

-- Bound history and let storage reclamation happen.
CALL lakehouse.system.expire_snapshots(
    table       => 'sales.orders',
    older_than  => current_timestamp() - INTERVAL 7 DAYS,
    retain_last => 50
);

-- Weekly, not hourly. This one lists storage and is slow.
CALL lakehouse.system.remove_orphan_files(
    table      => 'sales.orders',
    older_than => current_timestamp() - INTERVAL 3 DAYS
);
```

Five details separate this from the version most teams write first.

`min-input-files` set to 25 means file groups with fewer than 25 files get skipped, so the job does no work on healthy partitions. Without it, compaction rewrites already-compacted data and doubles your amplification.

The `where` clause bounds the scope to recent partitions. Historical partitions were compacted when they were recent and do not need it again unless something rewrote them.

`partial-progress.enabled` commits in batches. On a large table this converts an all-or-nothing four-hour job into one that makes durable progress.

`retain_last` on expiration is a safety net. It keeps a floor of snapshots regardless of the age cutoff, which protects you from a misconfigured interval wiping your ability to roll back.

`older_than` on orphan removal set to three days is deliberate. Removing files younger than the longest-running write job risks deleting files a job is about to commit. Three days is conservative and cheap.

One scheduling rule that prevents most incidents: never run compaction and a heavy writer against the same partitions at the same time. Both commit to the same table, both retry on conflict, and the retry storm costs more than either job. Stagger them, or use a platform that coordinates them for you.

## Service Levels Worth Setting

Maintenance without targets turns into either neglect or over-provisioning. Four thresholds cover almost everything, and each maps to a query above.

| Metric | Healthy | Investigate | Act now |
|---|---|---|---|
| Files under 32 MB per active partition | Under 50 | 50 to 300 | Above 300 |
| Snapshots per table | Under 500 | 500 to 5,000 | Above 5,000 |
| Manifest count per table | Under 1,000 | 1,000 to 10,000 | Above 10,000 |
| Delete file size as share of data size | Under 2 percent | 2 to 10 percent | Above 10 percent |

Those numbers are starting points rather than laws. Tables with extreme partition counts tolerate different values, and a table nobody queries tolerates almost anything. Set them per table class, write them down, and alert on the "act now" column.

Add two operational targets on top. Planning time for your most important query, tracked over time, because it is the number users actually feel. And maintenance compute as a percentage of query compute, tracked monthly, because it is the number finance actually feels. If planning time is stable and maintenance is under 20 percent of query compute, the system is tuned. If planning time is climbing while maintenance compute is high, the scheduling logic is wrong rather than the budget.

## Three Scenarios, With Costs

Abstract advice about compaction rarely survives contact with a budget conversation. Here are three estates at different scales with the shape of their maintenance cost.

**Small estate: 40 tables, 3 TB total, mostly daily batch loads.** Compaction is nearly free here because batch writers already produce reasonable file sizes. The work that matters is snapshot expiration and occasional manifest rewriting. A single nightly job covering all 40 tables finishes in under an hour on a small cluster. Maintenance compute lands in the low single digits as a percentage of query compute. Building this yourself is genuinely fine. One DAG, one query to pick tables, done in a week.

**Medium estate: 600 tables, 80 TB, mixed batch and streaming, roughly 30 tables receiving continuous writes.** The 30 streaming tables generate almost all the work. They need compaction every few hours, delete file rewriting daily, expiration daily, and manifest rewriting weekly. The other 570 need expiration and little else. Maintenance compute runs 10 to 20 percent of query compute, concentrated on a small fraction of tables. This is the scale where home-built schedulers start failing, not because the code is hard but because table discovery, per-table policy, and failure handling stop being a side project.

**Large estate: 15,000 tables, multiple petabytes, hundreds of streaming writers, several engines.** Nothing hand-scheduled survives here. Maintenance becomes a platform service with its own capacity, its own queue, and its own priority scheme, because you cannot compact everything and have to decide what matters. The decision function is the product. This is where usage-aware scheduling stops being a nice feature and becomes the only workable approach, and where the money in this category actually is.

The lesson across the three is that maintenance cost concentrates. In every estate I have seen, somewhere between 2 and 10 percent of tables generate 80 percent of the maintenance need. Find those tables first, tune them properly, and treat the long tail with a simple expiration policy. Teams that apply uniform maintenance policy across every table spend far more than necessary and still miss the tables that need attention most.

## Digging Out of an Estate That Was Never Maintained

Inheriting a neglected lakehouse is common, and the recovery has an order that avoids self-inflicted outages.

**Step one, measure before touching anything.** Run the four metadata queries across every table and rank by files under 32 MB, then by snapshot count. Publish the list. Resist the urge to run compaction on the worst table immediately, because the worst table is often also the one with an active writer, and a first compaction of a badly neglected table is an enormous job.

**Step two, expire snapshots first.** Expiration is cheap, it reclaims storage immediately, and it reduces the metadata the later steps have to walk. Pick a retention window that matches your actual time travel usage, which is almost always shorter than the default. Verify that nobody depends on older snapshots before you cut, because rollback capability disappears at the cutoff.

**Step three, rewrite manifests.** Also cheap relative to data compaction, and it improves planning time immediately on tables with high commit counts. Users notice this one within a day.

**Step four, compact in slices.** Take the worst table and compact one partition at a time with partial progress enabled, during a window when writers are quiet. Measure planning time before and after. Use the result to justify the compute for the rest.

**Step five, install the scheduler before finishing the backlog.** This is the step teams skip, and it is why estates get neglected twice. Get ongoing maintenance running on new writes while you are still working through history, otherwise the backlog regrows behind you.

**Step six, run orphan removal last.** After the rewrites, there will be a lot of unreferenced files. Removing them recovers real storage. Set a conservative age cutoff and run it once, then move it to a weekly cadence.

Expect the whole recovery on a medium estate to take two to four weeks of part-time work, with the storage savings from steps two and six frequently covering the compute cost of step four outright. That framing helps when asking for the budget.

## Streaming Tables Need Different Defaults

Most maintenance guidance was written for batch tables and quietly fails on streaming ones. Five settings deserve different values.

**Commit cadence at the writer.** This is the single highest-impact setting and it lives outside the maintenance system entirely. A writer that buffers for two minutes instead of committing every five seconds produces 24 times fewer snapshots and far larger files, which reduces both the maintenance need and the planning cost. Trade freshness against maintenance deliberately rather than defaulting the writer to its most aggressive setting.

**Copy-on-write versus merge-on-read.** Merge-on-read is correct for high-update tables because writes stay cheap. Copy-on-write is correct for tables with heavy reads and occasional updates, because readers pay nothing. The mistake is choosing one for the whole estate. Set it per table based on the read-to-write ratio, and revisit when the ratio changes.

**Target file size.** Streaming tables benefit from slightly smaller targets than batch tables, because compaction runs more often and enormous target sizes make each run heavier. 256 MB is a reasonable streaming default against 512 MB for batch.

**Partition granularity.** Hourly partitioning on a streaming table sounds right and usually is not. It multiplies partition count by 24, spreads small files across more partitions, and increases metadata. Daily partitioning with sorting on the time column inside each partition usually gives better pruning with far less metadata. Iceberg's partition evolution lets you correct this later without rewriting history, which is one of the format's genuinely great properties.

**Compaction frequency.** Every few hours for active partitions, not nightly. The read degradation on a merge-on-read streaming table is continuous, so the fix has to be continuous too. Nightly compaction on a table receiving constant updates means users experience the worst performance every afternoon.

A related point about ordering. Streaming writers frequently produce data that is roughly time-ordered and unordered on everything else. Sorting during compaction on the columns that queries filter by, usually an entity identifier, is where most of the query speedup comes from. Plain compaction fixes planning cost. Sorted compaction fixes scan cost, and scan cost is usually the bigger number.

## Who Runs Maintenance When Four Engines Write

Single-engine estates have an easy answer: the engine that writes also maintains. Multi-engine estates, which is the whole point of an open table format, have a coordination problem that nobody warns you about.

Picture a realistic setup. Flink streams events into a table. Spark runs nightly transformations against it. A commercial engine serves dashboards from it. An agent reads it through PyIceberg. Four clients, one table, one catalog.

Three questions follow immediately.

**Which client runs compaction?** Running it from more than one produces duplicated work and commit conflicts. The stable pattern is a designated maintainer per table, recorded as table metadata or catalog policy so it is discoverable rather than tribal knowledge. In practice the designated maintainer is either the platform's managed optimizer or one Spark job that owns all maintenance for a table group.

**What happens to the other writers during maintenance?** Compaction commits a rewrite. Any concurrent writer committing to the same partitions hits a conflict and retries. Iceberg's optimistic concurrency handles this correctly, and correctness is not the issue. The issue is that retries burn compute and, at high write rates, can fail repeatedly. Scope compaction away from actively written partitions, or schedule it in a quiet window, or use a platform that sequences the two.

**Who is responsible when it does not happen?** This is the organizational question, and it is the one that actually determines outcomes. In estates with several teams writing to shared tables, maintenance responsibility diffuses until it disappears. Assign it to the table owner explicitly, and make table ownership a required field in your catalog. A table with no owner will eventually have no maintenance.

The version-compatibility trap deserves a specific warning. Different engines ship different Iceberg library versions, and format capabilities land in those libraries at different times. An older reader encountering v3 deletion vectors written by a newer writer is the failure that surfaces as a confusing error in production. Before enabling a new format version on a shared table, inventory every client that touches it and confirm support. That inventory is also the artifact you need when planning an upgrade, and almost nobody has one until the first incident forces its creation.

There is a related failure worth naming. A managed platform's optimizer sometimes declines to maintain tables written by outside engines, or maintains them with different settings. The behavior is reasonable and the surprise is expensive. Ask explicitly: does managed maintenance cover tables written by external clients through the REST catalog, or only tables written by the platform's own engines? The answer determines whether your open, multi-engine architecture has a maintenance gap in the middle of it.

The clean pattern that emerges from all of this: put the policy in the catalog, designate one maintainer per table, record ownership as metadata, inventory client library versions before format upgrades, and monitor from outside whichever system does the work. None of that is difficult. All of it gets skipped, which is why the neglected estate is such a common inheritance.

## Failure Modes

**Maintenance that never runs.** The most common failure by a wide margin. Symptom: planning time climbing while data volume grows linearly. Cause: nobody owns it, or the scheduler covers the tables that existed when it was built and not the ones created since. Fix: discover tables from the catalog rather than from a static list.

**Maintenance that runs too often.** Symptom: compute spend high, no performance benefit. Cause: fixed-interval scheduling with no file-count trigger, rewriting healthy partitions repeatedly. Fix: `min-input-files`, partition scoping, and a trigger based on the metadata queries above.

**Compaction fighting the writer.** Symptom: commit failures and retry storms in both the streaming job and the maintenance job. Cause: both committing to the same table concurrently. Fix: stagger schedules, scope compaction away from partitions receiving active writes, or move to a platform that coordinates.

**Expiration that never reclaims storage.** Symptom: storage cost grows even though deletion runs. Cause: snapshots still reference the files, so nothing is eligible for deletion. Deleting rows in Iceberg does not free storage until the snapshots referencing those files expire. Fix: expiration with a retention window matched to your actual time travel requirement, not the default.

**Compliance deletion that leaves data readable.** Symptom: an erasure request completes and the data remains accessible through time travel. Cause: the same mechanism as above. This is a legal exposure rather than a cost problem. Fix: a deletion workflow that includes snapshot expiration and orphan cleanup as required steps, with verification.

**Orphan removal that deletes live files.** Symptom: queries fail with missing file errors after a maintenance run. Cause: orphan removal with a cutoff shorter than the longest-running write job, deleting files a job had written but not yet committed. Fix: a conservative `older_than` and knowledge of your longest job.

**Sort order that nobody validated.** Symptom: compaction runs, costs a lot, and queries do not get faster. Cause: sorting on columns that queries do not filter on. Fix: derive the sort order from actual query predicates in the query log rather than from intuition. This is where usage-aware optimization earns its keep.

**Managed maintenance assumed rather than verified.** Symptom: a table on a managed platform with 200,000 files. Cause: the managed optimizer excluded that table for a reason nobody noticed, often an unsupported configuration or a paused optimization setting. Fix: your own monitoring, even on managed platforms.

## Questions to Ask a Vendor About Maintenance

Six questions that surface the real behavior.

**What triggers maintenance, and can I see the decision?** Fixed schedule, file count threshold, or observed query patterns. The last is best and the rarest. Ask to see the log of what ran and why.

**How is it priced?** Bundled into storage, billed as compute, or included at a rate that changes with volume. Compaction is real compute and somebody pays for it. A vendor who cannot explain where it appears on the bill is a vendor whose bill will surprise you.

**Does it sort or only compact?** Plain compaction fixes file count. Sorting fixes scan volume. The difference on a filtered query is large, and only some managed optimizers do the second.

**How does it coordinate with my writers?** Especially streaming writers. Ask specifically what happens when compaction and a Flink job commit to the same partition.

**What are the retention defaults, and how do I change them?** Time travel retention determines both storage cost and compliance behavior. Defaults vary widely and are rarely what you want.

**Can external engines still write to these tables while managed maintenance runs?** This is the openness question hiding inside the maintenance question. A managed table that only the vendor's engine writes to is a different product than a managed table any Iceberg client can commit to.

## Maintenance as a Governance Function

Two of the six operations are not performance work at all. They are compliance work, and treating them as performance work is how organizations end up with a legal problem instead of a slow query.

**Snapshot expiration bounds what is recoverable.** An Iceberg table with a 90-day retention window can reproduce any state from the last 90 days. That is a feature for debugging and an obligation for privacy. A deletion request that removes rows from the current snapshot leaves those rows readable through time travel until the referencing snapshots expire. If your erasure workflow ends at the DELETE statement, the data is still there and still queryable by anyone with table access.

The correct workflow has three steps: delete the rows, expire the snapshots that reference the affected files, then remove the orphaned files. Only after the third step is the data actually gone from storage. Write that sequence down as a runbook, automate it, and record the completion, because the record is what an auditor asks for.

**Retention policy is a joint decision.** Storage cost pushes retention down. Debugging and rollback capability push it up. Compliance sets a floor in some jurisdictions and a ceiling in others, since some regulations require retaining records for years and others require deleting them promptly. The intersection is table-specific, which is why a single platform-wide retention default is almost always wrong for a portion of the estate.

The practical structure is three or four retention classes. Short retention for high-churn operational mirrors where rollback matters for hours. Standard retention for analytical tables. Extended retention for financial records with statutory requirements. And a documented exception class for tables under legal hold, where expiration is disabled deliberately and someone owns the decision.

Putting those classes in the catalog rather than in a scheduler config is the move that makes them durable. Apache Polaris's policy store exists for exactly this: policies for compaction and snapshot expiration with a persistent home and REST endpoints for lifecycle management. When retention lives with the table's governance rather than in a job definition, it survives the rewrite of the job.

The broader point is that maintenance touches three budgets: compute, storage, and legal risk. Teams that treat it as purely a performance concern optimize one of the three and discover the other two during an audit.

## Where This Capability Goes Next

Three directions are visible now.

**Optimization becomes workload-aware rather than rule-based.** The next real advance is not better compaction. It is deciding what to compact, how to sort it, and what to materialize based on observed query and ingestion behavior across every engine touching the table. Ryft built exactly that and a security company valued it at nine figures. Predictive optimization on the platform side is the same idea. The rules-based scheduler most teams run today is the version that goes away.

**The format reduces the problem at the source.** Iceberg v4 design work on single-file commits and an adaptive metadata tree targets the cost of committing frequently, which is the root cause of most metadata debt. Relative paths make tables portable across storage locations, which turns a class of migration work into a metadata operation. If that work lands well, the maintenance burden for streaming tables drops meaningfully rather than being managed better.

**Maintenance policy moves into the catalog.** Apache Polaris carrying a policy store for compaction and snapshot expiration is the template. Policy defined once at the catalog, applied to every table under it, enforced regardless of which engine writes. That is the right architectural home, because the catalog is the only component that sees every table and every engine.

The thing that does not change is the need for measurement. Whichever platform runs the work, the metadata queries in this article stay useful, and the team that runs them weekly finds problems a quarter before the team that waits for complaints.

## A Starting Configuration

For teams who want a default to argue with rather than a blank page, here is a workable baseline for a medium estate.

Discover tables from the catalog nightly rather than from a list. Classify each table into one of three groups by write pattern: streaming, batch, and static. Apply per-group policy.

For streaming tables: compaction with sorting every four hours scoped to the last two days of partitions, delete file rewriting daily, manifest rewriting daily, snapshot expiration daily with a seven-day window, orphan removal weekly with a three-day age cutoff.

For batch tables: compaction nightly scoped to partitions written in the last run, manifest rewriting weekly, snapshot expiration daily with a thirty-day window, orphan removal monthly.

For static tables, meaning tables that have not been written in 30 days: expiration monthly and nothing else. Do not compact tables that nobody writes and few people read. That compute buys nothing.

Alert on the four thresholds in the table above, plus job failures, plus planning time on your top ten queries. Review the whole configuration quarterly against actual query patterns, because sort orders chosen a year ago frequently no longer match what people filter on.

That baseline takes an afternoon to implement on top of an existing orchestrator and covers the large majority of what a medium estate needs. Everything beyond it is tuning, and tuning should be driven by the metadata queries rather than by intuition.

## Conclusion

Table maintenance is infrastructure now. Every major platform runs it, the standalone market for it closed with an acquisition by a company in a different industry, and the operations themselves are five procedure calls that have not changed much in three years.

What is still worth your attention is three things. The scheduling logic, because compacting what does not need compaction is the fastest way to spend money for nothing. The observability, because managed does not mean monitored and the failure is silent until it is broad. And the retention policy, because it sits at the intersection of storage cost, query performance, and legal exposure, and defaults chosen by a vendor were not chosen for your compliance requirements.

The best outcome for most teams is to let the platform run the operations, keep the four metadata queries on a dashboard, set thresholds per table class, and spend the saved engineering time on the semantic layer instead. Table maintenance was never the interesting problem. It just used to be an unavoidable one.

One closing observation about why this work keeps getting deferred. Maintenance has no launch. Nobody demos a compaction schedule, and no quarterly review celebrates a table that stayed fast. The work is invisible when it succeeds and expensive when it fails, which is the classic profile of infrastructure that gets cut first and missed most. Treating it as a platform service with an owner and a budget, rather than as a chore somebody picks up between projects, is the organizational fix that matches the technical one.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg internals and the operational side of running a lakehouse.
*Apache Iceberg: The Definitive Guide* (O'Reilly) covers the metadata layers, the maintenance procedures, and the file layout behavior described here in full detail, including the tuning decisions that determine how much maintenance a table needs in the first place.
You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at
[books.alexmerced.com](https://books.alexmerced.com).
