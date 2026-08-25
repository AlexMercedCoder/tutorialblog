---
title: "Agent-Driven Storage Tiering for Apache Iceberg: Moving Cold Data Without Breaking Queries"
date: "2026-08-25"
description: "A background agent can move cold Iceberg partitions to cheaper tiers without breaking live queries. Heatmaps, path-safe moves, and restore paths."
author: "Alex Merced"
category: "Apache Iceberg"
canonical: https://iceberglakehouse.com/posts/agent-driven-iceberg-storage-tiering/
tags:
  - Apache Iceberg
  - storage tiering
  - cost optimization
  - query engines
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/agent-driven-iceberg-storage-tiering/).

A five-year-old event table holds 900 terabytes across 3,000 daily partitions. Query logs for the last quarter show that 94 percent of scans touch the most recent 90 days. Another 5 percent touch the prior year, mostly month-end reports. The remaining 1 percent reach into the four years before that, a few hundred queries a quarter, most of them audits and one-off investigations. Every byte of those 900 terabytes sits in standard object storage at the same price per gigabyte, and the storage line item for that one table is larger than the compute bill for querying it.

The fix is obvious in outline: move the cold partitions to a cheaper storage tier. The reasons it does not happen are specific. Nobody knows exactly which partitions are cold, because the heatmap lives in query logs nobody aggregates. Moving files under an Apache Iceberg table looks dangerous, because the metadata references every file by path. And the storage tiers have different latency and retrieval-cost characteristics that a careless move turns into broken dashboards or a surprise bill.

This article is about doing it properly, with a background agent rather than a quarterly cleanup project. The agent reads the query heatmap, decides which partitions to transition, moves them in a way that Iceberg's metadata tolerates, and keeps the table queryable throughout. I will cover how the cloud tiers actually behave (they differ in ways that matter), which operations change file paths and which do not, how to build the partition heatmap from Iceberg's own metadata tables and the engine's query log, how the agent's decision loop works, what to do when a query reaches into a tier that needs a restore, and how to keep the whole thing from surprising anyone. I work at Dremio, and I will use its query history and metadata table surfaces as the example inputs. The mechanism applies to any Iceberg engine that exposes a query log.

## How the Storage Tiers Actually Behave

The first mistake teams make is treating "cold storage" as one thing. Each cloud offers several tiers and they fall into two families that behave completely differently from a query engine's point of view.

The first family is online cold tiers. Objects stay addressable at the same key, reads return in milliseconds, and the tradeoff is a lower storage price against a per-gigabyte retrieval charge and a minimum storage duration. On AWS these are S3 Standard-Infrequent Access, S3 One Zone-IA, and S3 Glacier Instant Retrieval. On Google Cloud they are Nearline, Coldline, and Archive (all three are millisecond-latency on GCS, which surprises people used to AWS naming). On Azure they are the Cool and Cold access tiers. A query engine reading an object in one of these tiers works exactly as it does against the standard tier, a little slower on first byte, and the bill shows a retrieval line.

The second family is offline archive tiers. Objects keep their key but cannot be read until a restore request completes, which takes minutes to hours. On AWS these are S3 Glacier Flexible Retrieval and S3 Glacier Deep Archive. On Azure it is the Archive tier. A query engine that opens an object in one of these tiers gets an error (an `InvalidObjectState` on S3), and the query fails unless something restores the object first.

Here is how the tiers line up on the properties that matter for a table:

| Tier | Access latency | Retrieval fee | Minimum duration | Storage price relative to standard | Safe for live queries |
|---|---|---|---|---|---|
| S3 Standard | ms | none | none | 1.0x | yes |
| S3 Standard-IA | ms | per GB | 30 days | ~0.55x | yes |
| S3 Glacier Instant Retrieval | ms | per GB, higher | 90 days | ~0.17x | yes, with retrieval cost |
| S3 Glacier Flexible Retrieval | minutes to hours after restore | per GB plus request | 90 days | ~0.16x | no |
| S3 Glacier Deep Archive | 12 to 48 hours after restore | per GB plus request | 180 days | ~0.04x | no |
| GCS Nearline | ms | per GB | 30 days | ~0.5x | yes |
| GCS Coldline | ms | per GB, higher | 90 days | ~0.2x | yes, with retrieval cost |
| GCS Archive | ms | per GB, highest | 365 days | ~0.06x | yes, with retrieval cost |
| Azure Cool | ms | per GB | 30 days | ~0.5x | yes |
| Azure Cold | ms | per GB, higher | 90 days | ~0.2x | yes, with retrieval cost |
| Azure Archive | hours after rehydration | per GB plus request | 180 days | ~0.1x | no |

The ratios are approximate and vary by region and over time. The shape is what matters. The online cold tiers cut storage cost by 50 to 85 percent and keep queries working. The offline tiers cut it by 85 to 96 percent and break queries that touch them. The tiering agent's first decision is which family a partition goes to, and for any partition that has a nonzero chance of being queried without warning, the answer is the online family.

The minimum duration is the second thing the agent has to respect. Moving a partition to Glacier Instant Retrieval and then deleting it (or moving it back) 30 days later charges the full 90 days. Compaction that rewrites a cold partition's files triggers the same early-deletion charge on the old files. The agent needs to know a partition is stable before transitioning it, which is a data engineering fact (has the partition stopped receiving late-arriving rows) as much as a query fact.

## What Changes Paths and What Does Not

The reason Iceberg users fear storage tiering is that Iceberg metadata references data files by absolute path, and a manifest that points at a file that no longer exists makes every query on that snapshot fail. So the question for any tiering operation is whether the path changes.

Storage class transitions do not change the path. On S3, transitioning an object from Standard to Glacier Instant Retrieval (via a lifecycle rule or a `CopyObject` to the same key with a new storage class) leaves `s3://bucket/warehouse/events/data/day=2023-04-11/00001.parquet` at exactly that key. The object's storage class is a property, not a location. The same is true of GCS storage class changes and Azure tier changes. Iceberg's manifest still points at the right key, the engine's FileIO issues the same `GetObject`, and the read works. No metadata change is needed at all.

This is the most important fact in the article, and it is why the common advice to "rewrite manifest lists" when tiering is usually wrong. If you tier by storage class within the same bucket and key, Iceberg does not know or care.

Two operations do change paths, and those are the ones that need metadata work.

Moving files to a different bucket or prefix changes the path. Some organizations keep an "archive" bucket with different lifecycle policies, replication settings, or access controls, and moving cold partitions there means the key changes. Iceberg supports this, but it is a metadata rewrite. Since Iceberg 1.8 the Java library has a `RewriteTablePath` action that rewrites every metadata file (manifests, manifest lists, table metadata) to substitute a source prefix with a target prefix, producing a new metadata tree that references the new locations. That action was designed for whole-table moves and disaster recovery copies. Using it for per-partition tiering means rewriting metadata for the whole table on every tiering pass, which is heavy and is a reason to prefer same-key storage class transitions.

Compaction changes paths by definition. Rewriting small files into large ones produces new files at new keys and drops the old ones. If the agent compacts a cold partition before tiering it, the new files are written to the standard tier (the writer does not know about tiering) and the agent has to transition them afterward. If the agent tiers first and compacts later, the compaction reads from the cold tier (paying retrieval), writes to standard, and the early-deletion charge applies to the cold files. The right order is compact, wait for the partition to be stable, then tier.

There is a third case that looks like a path change and is not. Iceberg's snapshot expiration and orphan file removal delete files. A file in a cold tier that gets deleted by maintenance incurs the early-deletion charge if it has not met the minimum duration. The agent should coordinate with maintenance, or at least know the maintenance schedule, so that a partition is not tiered in the same week its old snapshots expire.

## Building the Partition Heatmap

The agent's input is a heatmap: for each partition, how often it was scanned, by how many queries, over what window. Two sources combine to build it.

Iceberg's metadata tables tell you what exists. The `files` metadata table lists every data file in the current snapshot with its partition values, record count, and size. The `partitions` table aggregates that to one row per partition with file count, record count, and total bytes. Neither knows anything about queries, but together they give the agent the denominator: the full set of partitions and their weight.

The engine's query log tells you what was read. Dremio's job history records, per query, the datasets scanned and, in the query profile, the partition filters applied and the files pruned versus read. Spark's Iceberg integration emits scan metrics per query that include the same information. Trino exposes it through its event listener. The shape is the same everywhere: for each query, the set of partitions it actually read after pruning.

Joining the two produces the heatmap. Here is the core of it in SQL, using Dremio's system tables for the query side and Iceberg's metadata table for the partition side. The exact column names differ by engine, but the join is the point:

```sql
-- Partitions and their weight, from Iceberg metadata
WITH partitions AS (
  SELECT
    partition."day" AS day,
    file_count,
    record_count,
    total_data_file_size_in_bytes AS bytes
  FROM TABLE(table_partitions('lake.events.web_clicks'))
),

-- Partition reads, from the engine's query log over the trailing 90 days
scans AS (
  SELECT
    CAST(REGEXP_EXTRACT(scanned_partition, 'day=([0-9-]+)', 1) AS DATE) AS day,
    COUNT(DISTINCT job_id) AS query_count,
    MAX(submitted_ts)      AS last_read_at
  FROM sys.project.history.jobs
  CROSS JOIN UNNEST(scanned_partitions) AS t(scanned_partition)
  WHERE dataset_path = 'lake.events.web_clicks'
    AND submitted_ts >= CURRENT_DATE - INTERVAL '90' DAY
    AND query_state = 'COMPLETED'
  GROUP BY 1
)

SELECT
  p.day,
  p.bytes,
  p.file_count,
  COALESCE(s.query_count, 0) AS query_count_90d,
  s.last_read_at,
  CURRENT_DATE - p.day AS age_days
FROM partitions p
LEFT JOIN scans s ON s.day = p.day
ORDER BY p.day;
```

The output is one row per partition with its size, its age, how many distinct queries read it in the trailing window, and when it was last read. A partition with zero reads in 90 days, an age of 400 days, and 2 terabytes of data is the target. A partition with 3 reads in 90 days and an age of 400 days is a candidate for an online cold tier, where those 3 reads cost a retrieval fee but still work. A partition read 200 times is hot regardless of age.

Two refinements make the heatmap more useful than raw counts.

Weight reads by what they cost. A query that scanned a partition and read 2 gigabytes matters more than one that pruned to 3 files. The profile has bytes read per scan. Sum those rather than counting queries, and the heatmap becomes a bytes-read-per-partition-per-window map that the cost model below can use directly.

Track the reader. A partition read only by a compliance job that runs on the first of the month has a predictable access pattern the agent can plan around: transition it to an online cold tier and accept the monthly retrieval fee, or keep a compact reflection of just the columns the compliance job needs in standard storage. A partition read by ad hoc analyst queries at random times cannot be planned around and should stay online.

## The Agent's Decision Loop

With the heatmap in hand, the agent runs a loop on a cadence (weekly is typical) that decides, for each partition, which tier it should be in, and executes the transitions. The word "agent" here means a background worker with a policy and a cost model. It can be a scheduled job with a few hundred lines of logic, or an LLM-backed agent that reasons about the heatmap and proposes moves. The important design property is the same either way: the agent proposes, a policy constrains, and the execution is idempotent and reversible.

The cost model is the core. For each partition and each candidate tier, the agent estimates the monthly cost of keeping the partition there:

```
monthly_cost(partition, tier) =
    bytes * storage_price(tier)
  + expected_bytes_read_per_month * retrieval_price(tier)
  + expected_requests_per_month * request_price(tier)
  + early_deletion_risk(partition, tier)
```

The first term is what tiering saves. The second and third are what it costs when the partition is read. The fourth is the expected cost of having to move or delete the partition before its minimum duration elapses, which is a function of how stable the partition is (has it received writes in the last N days) and whether maintenance is scheduled to touch it.

The agent picks the tier with the lowest expected monthly cost, subject to policy constraints. The constraints are where human judgment lives, and they should be explicit:

```yaml
# tiering-policy.yaml
table: lake.events.web_clicks
partition_column: day
evaluation_window_days: 90
heatmap_source: dremio_job_history

tiers:
  - name: standard
    storage_class: STANDARD
  - name: cold_online
    storage_class: GLACIER_IR
    min_age_days: 180
    max_reads_per_window: 10
    min_partition_age_since_last_write_days: 30
  - name: archive
    storage_class: DEEP_ARCHIVE
    min_age_days: 1095
    max_reads_per_window: 0
    requires_approval: true
    restore_sla_hours: 24

guardrails:
  never_tier_partitions_newer_than_days: 90
  max_bytes_transitioned_per_run: 50 TB
  max_partitions_transitioned_per_run: 200
  pause_if_compaction_scheduled_within_days: 7
  dry_run: false
```

Read the policy top to bottom. Partitions under 90 days old are never touched, regardless of reads. A partition can go to the online cold tier once it is 180 days old, has fewer than 10 reads in the 90-day window, and has not been written to in 30 days. The offline archive tier requires the partition to be three years old with zero reads in the window, and requires a human to approve the move, because moving to an offline tier means a query that touches the partition will fail until a restore completes. The guardrails cap how much the agent moves per run so a heatmap error does not tier half the table in one pass, and the agent stands down if compaction is scheduled soon.

The execution is a storage class transition per file. For a same-key transition on S3, the agent issues a `CopyObject` with the same source and destination key and the new `StorageClass`, or, more cheaply, tags the objects and lets a lifecycle rule keyed on the tag do the transition asynchronously. The tag approach is better for large batches because the lifecycle service handles the transitions without the agent paying request costs, and it is what the sketch below uses:

```python
import boto3
from collections import defaultdict

s3 = boto3.client("s3")

def files_for_partition(catalog, table_id, partition_value):
    """List data file paths for one partition from the Iceberg 'files' metadata table."""
    table = catalog.load_table(table_id)
    files = table.inspect.files().to_pylist()
    return [f["file_path"] for f in files if f["partition"]["day"] == partition_value]

def tag_for_tier(bucket, key, tier_name):
    s3.put_object_tagging(
        Bucket=bucket, Key=key,
        Tagging={"TagSet": [{"Key": "iceberg-tier", "Value": tier_name}]},
    )

def execute_plan(catalog, table_id, plan, guardrails):
    """
    plan: list of (partition_value, target_tier_name, estimated_bytes)
    Applies tags. A bucket lifecycle rule transitions tagged objects.
    """
    moved_bytes = 0
    moved_parts = 0
    by_tier = defaultdict(int)
    for partition_value, tier, est_bytes in plan:
        if moved_bytes + est_bytes > guardrails["max_bytes"]:
            break
        if moved_parts >= guardrails["max_partitions"]:
            break
        for path in files_for_partition(catalog, table_id, partition_value):
            bucket, key = path.replace("s3://", "").split("/", 1)
            if not guardrails["dry_run"]:
                tag_for_tier(bucket, key, tier)
            by_tier[tier] += 1
        moved_bytes += est_bytes
        moved_parts += 1
        record_transition(table_id, partition_value, tier, est_bytes)
    return {"partitions": moved_parts, "bytes": moved_bytes, "files_by_tier": dict(by_tier)}
```

The lifecycle rule that pairs with it lives on the bucket and is managed as infrastructure:

```json
{
  "Rules": [
    {
      "ID": "iceberg-tier-cold-online",
      "Filter": { "Tag": { "Key": "iceberg-tier", "Value": "cold_online" } },
      "Status": "Enabled",
      "Transitions": [{ "Days": 0, "StorageClass": "GLACIER_IR" }]
    },
    {
      "ID": "iceberg-tier-archive",
      "Filter": { "Tag": { "Key": "iceberg-tier", "Value": "archive" } },
      "Status": "Enabled",
      "Transitions": [{ "Days": 0, "StorageClass": "DEEP_ARCHIVE" }]
    }
  ]
}
```

Three properties of this design are worth naming.

Iceberg metadata is untouched. Every file stays at its key. The `files` metadata table is used to find the files, and nothing writes to the table. A query planned against any snapshot still resolves every path.

The transition is reversible. Tagging a file `standard` and adding a lifecycle rule for it (or issuing a `CopyObject` back to `STANDARD`) moves it back. The early-deletion charge applies, which is why the policy requires the partition to be stable before moving it, but nothing is lost.

The agent's record is the audit trail. `record_transition` writes what moved, when, to which tier, and at what estimated cost, into a small table the finance team can read. When the storage bill changes, the answer to "why" is a query.

## A Worked Example on the 900-Terabyte Table

Put the pieces together on the table from the opening, using round numbers and the S3 tiers.

The heatmap says 90 days (about 135 terabytes at 1.5 terabytes a day) are hot, the prior year (about 550 terabytes) is warm with a few hundred reads a quarter concentrated in month-end reports, and the four years before that (about 215 terabytes, the table was smaller then) had a few hundred reads in total, mostly from two compliance jobs and a handful of investigations.

The policy keeps the first 90 days in Standard: 135 terabytes at roughly $23 per terabyte-month is about $3,100 a month.

The prior year goes to Glacier Instant Retrieval: 550 terabytes at roughly $4 per terabyte-month is about $2,200 a month in storage. The month-end reports read maybe 20 terabytes across the year's partitions each month, and the retrieval fee at roughly $30 per terabyte is about $600 a month. Total about $2,800 a month, against roughly $12,600 a month in Standard. The reports still run. They are a little slower on first byte.

The four oldest years are where the decision splits. If the two compliance jobs are predictable (first of the month, known partitions), they go to Deep Archive at roughly $1 per terabyte-month, about $215 a month, with the compliance jobs' first step being a restore request the day before. If investigations are unpredictable, they go to Glacier Instant Retrieval at about $860 a month with a retrieval fee on the rare read. Say the team picks Deep Archive for the three oldest years and Glacier IR for the fourth, splitting the difference: about $150 a month for the archive and about $215 for the Glacier IR year, call it $365.

| Segment | Size | Before (Standard) | After | Tier |
|---|---|---|---|---|
| Last 90 days | 135 TB | ~$3,100 | ~$3,100 | Standard |
| Prior year | 550 TB | ~$12,600 | ~$2,800 incl. retrieval | Glacier IR |
| Years 2 to 5 | 215 TB | ~$4,900 | ~$365 | Deep Archive plus one year Glacier IR |
| Total | 900 TB | ~$20,600 / month | ~$6,300 / month | |

That is a 70 percent reduction, with the hot path unchanged, the warm reports working, and the cold reads on an explicit restore path. The prices are approximate and they move, but the ratios are stable, and the point is that the split between tiers is decided by the heatmap and the read pattern rather than by age alone. A different table with a different heatmap gets a different split, and the agent computes it rather than an engineer guessing.

## Rule-Based Worker or LLM-Backed Agent

The word "agent" carries two meanings in 2026 and the tiering design works with either, but they fail differently and it is worth choosing deliberately.

A rule-based worker is the policy file plus the cost model plus the execution code, run on a schedule. It is deterministic: the same heatmap and policy produce the same plan every time. It is auditable: the plan is a function of inputs that are all logged. It is limited: it does exactly what the policy says and nothing else, and when the heatmap has a pattern the policy did not anticipate (a new team that reads three-year-old data every Tuesday) it either mis-tiers the partition or ignores it until someone updates the policy.

An LLM-backed agent reads the same heatmap, the same policy, and the same cost model, and reasons about the plan. It can notice the Tuesday pattern, propose keeping those partitions online, and explain why in the run summary. It can read the maintenance calendar and the on-call notes and decide to skip a run. What it cannot be trusted to do, without the same guardrails, is execute. An LLM that reasons its way to "this whole table looks cold" and has unconstrained access to tag 900 terabytes for Deep Archive is a very expensive mistake with a plausible-sounding justification.

The design that works is the LLM agent proposing and the rule-based layer constraining and executing. The agent produces a plan and a rationale. The policy engine validates the plan against the guardrails (caps, ages, approval requirements) and rejects anything outside them. The execution layer applies what survives, idempotently, with the transition record as the audit trail. The agent's rationale goes into the weekly summary next to the plan, so a human reads "kept partitions 2023-04-01 through 2023-04-30 online because a new weekly reader appeared" and either agrees or edits the policy.

This is the same shape as every other autonomous maintenance loop: reasoning where judgment helps, rules where mistakes are expensive, and a record in between.

## Which Tables Are Worth Tiering

Not every table benefits, and the agent should be pointed at the ones that do. Three properties predict the payoff.

Size and age spread. A table with five years of history and a strong recency bias in reads is the ideal case. A table with 90 days of history has nothing cold enough to move. A table that is large but read uniformly across its history (a slowly changing dimension, a lookup table) has no cold partitions to find.

Partition alignment with access. Tiering moves whole partitions, so the heatmap has to be sharp at the partition grain. A table partitioned by day with reads that follow the calendar is sharp. A table partitioned by customer ID with reads that follow customer activity is sharp in a different way, and the heatmap works the same. A table partitioned by a column that has nothing to do with how it is read (or not partitioned at all) has files that mix hot and cold rows, and tiering any of them hurts the hot reads. For those tables, the fix is a partition spec change or a sort order that clusters by the access dimension, and tiering comes after.

Stability. A table that receives late-arriving data into old partitions, or that gets backfilled regularly, never has partitions stable enough to tier without early-deletion risk. The `min_partition_age_since_last_write_days` guardrail handles this per partition, but a table where every partition gets touched monthly is a table where the guardrail excludes everything. Fix the backfill pattern first, or accept that only the oldest partitions are eligible.

A quick screen: query the `partitions` metadata table for the size distribution by partition age, join the last 90 days of query log, and look for tables where more than half the bytes are in partitions with zero reads. Those are the candidates, and the top three by cold bytes are where the agent starts.

## When a Query Reaches Into the Cold

The tiering agent's job is to make cold reads rare, not impossible. What happens when a query does touch a tiered partition depends on the family.

For online cold tiers, the query works. The engine reads the file, the cloud charges a retrieval fee, and the query is somewhat slower on first byte. The agent should see that read in the next heatmap pass. If the partition keeps getting read, the cost model will pull it back to standard. This self-correction is the reason online tiers are the default for anything with nonzero read probability: a wrong guess costs a retrieval fee, not an outage.

For offline archive tiers, the query fails on the first file it opens in the archived partition. The engine's error names the object and the storage state. There are three ways to handle this, in order of sophistication.

The simplest is to fail clearly. The engine surfaces an error that says the partition is archived and how to request a restore. Analysts learn that the four-year-old data needs a day's notice. This is fine for audit and compliance use cases where the requester already expects a delay.

The second is to intercept at the semantic layer. A view over the table can exclude archived partitions by default (`WHERE day >= CURRENT_DATE - INTERVAL '3' YEAR`) so that ad hoc queries never touch them, with a separate view (`web_clicks_including_archive`) for the cases that do. The archived partitions are still in the table. They are just not in the default query surface. This is the pattern I recommend for most teams, because it turns an error into a documented boundary.

The third is a restore-on-demand path. A query against the archive-inclusive view first checks (via the agent's transition record) whether any partition it will touch is archived. If so, it issues restore requests (`RestoreObject` on S3 with a retrieval tier and a duration) for the files, records that a restore is pending, and either fails with "restore initiated, retry after N hours" or, for a scheduled job, waits. The restored copy lives in the standard tier for the requested duration and then reverts. This is the right design for a monthly compliance job that always touches the same partitions: the job's first step is the restore request, and its second step runs a day later.

What none of these do is restore automatically and silently in the query path. A restore takes hours and costs money, and a query engine that quietly kicks one off because someone ran `SELECT *` is a query engine that will produce a surprise bill. The restore decision should be explicit and attributed.

## Coordinating With Compaction and Maintenance

Tiering, compaction, snapshot expiration, and orphan cleanup all touch the same files, and the interactions cost money if they are not sequenced.

Compaction rewrites files. A partition that is compacted after tiering has its cold files read (retrieval fee), new files written to standard (no longer tiered), and old files deleted (early-deletion fee if within the minimum). The rule is compact first, then tier. In policy terms, a partition is eligible for tiering only if it has been through its final compaction, which for a daily-partitioned table usually means it is at least a few days old and has file sizes at the target.

Snapshot expiration deletes files that are no longer referenced by any retained snapshot. If a partition was rewritten by compaction, the pre-compaction files are deleted when the old snapshot expires. If those files were tiered, the deletion triggers the early-deletion fee. The agent should only tier files that appear in the current snapshot's `files` table and have been there since before the oldest retained snapshot, which means they will not be deleted by expiration.

Orphan file removal deletes files in the table location that no snapshot references. It should never touch a tiered file that is in the current snapshot, and the same rule as above protects it.

The `pause_if_compaction_scheduled_within_days` guardrail in the policy is the simple version of this coordination. The better version is for the agent to read the maintenance schedule (or subscribe to the catalog's events, which Apache Polaris 1.7.0 publishes to Kafka or OpenTelemetry) and sequence itself after each partition's maintenance is done.

Here is the lifecycle of a daily partition under a coordinated policy:

| Age | Maintenance state | Tier | Reads |
|---|---|---|---|
| 0 to 7 days | Receiving late-arriving rows, small files | Standard | Hot |
| 7 to 30 days | Compacted, stable | Standard | Hot |
| 30 to 180 days | Snapshot history expired past it | Standard | Warm |
| 180 days to 3 years | Stable, few reads | Online cold (Glacier IR, Coldline, Azure Cold) | Rare, works with retrieval fee |
| 3 years and older | Stable, near-zero reads, approved | Offline archive, or online cold if any read probability | Explicit restore path |

## Failure Modes and Warning Signs

**A query fails on an archived file.** The engine error names an object in an offline tier. Either the semantic layer view did not exclude the partition, or the agent archived something the policy should have kept online. Check the transition record for the partition, and if the policy allowed it, tighten the read threshold for the archive tier.

**Retrieval fees exceed the storage savings.** The bill shows Glacier IR retrieval charges that approach the standard storage cost the tiering saved. The heatmap under-counted reads, usually because the query log window was too short or a new workload started reading old data. Lengthen the window, and let the cost model pull the partition back.

**Early-deletion charges after compaction.** The bill shows a charge for deleting objects before their minimum duration, on the same day a compaction ran. The agent tiered a partition that was not yet stable. Raise `min_partition_age_since_last_write_days` and add the compaction schedule to the agent's inputs.

**Metadata references a path that does not exist.** This only happens if files were moved to a different key, which the same-key design avoids. If someone ran a cross-bucket move without `RewriteTablePath`, the table is broken for every snapshot that references the moved files. Restore the files to the original keys, or rewrite the metadata. Do not try to fix it by editing manifests by hand.

**Lifecycle rule transitions the wrong objects.** A tag filter that is too broad, or a rule with a `Prefix` filter added by someone else, transitions files the agent never tagged. The sign is files in a cold tier that the transition record does not know about. Keep the lifecycle rules tag-based only, manage them as code, and have the agent reconcile the bucket's actual storage classes against its record weekly.

**The heatmap is measured from a cache.** An engine with a reflection or a result cache over the table serves queries without scanning the table, so the query log shows no partition reads even though the data is in active use. The partitions look cold, get tiered, and the next reflection refresh pays retrieval on everything. Include reflection and cache refresh scans in the heatmap, not just user queries.

**Nobody knows what the agent did.** A storage bill drops by 40 percent and nobody can explain it, which is fine until it rises by 15 percent and nobody can explain that either. The transition record and a weekly summary to the data platform channel are the fix.

## Operational Guidance

**Start with online cold tiers only.** Glacier Instant Retrieval, Coldline, or Azure Cold. Queries keep working, and the cost model self-corrects. Add offline archive tiers only after a year of heatmap data and only with human approval per move.

**Tier by storage class, not by bucket.** Same key, same path, no metadata changes. If a compliance requirement forces a separate archive bucket, use `RewriteTablePath` for whole-table moves and do not try to tier per partition across buckets.

**Compact first, tier second, expire in between.** A partition is eligible when it is compacted, its pre-compaction snapshots are expired, and it has not been written to in a month.

**Cap every run.** Bytes per run, partitions per run, and a dry-run mode. The first three runs should be dry runs whose plans a human reads.

**Exclude archived partitions from the default views.** The semantic layer is where the boundary between online and archive lives. Give the archive-inclusive view a name that makes the boundary visible.

**Include cache and reflection refresh in the heatmap.** Otherwise the hottest data looks cold.

**Record every transition with estimated cost.** The record is the audit trail, the input to the next heatmap pass, and the answer to the finance team's question.

**Reconcile weekly.** List the bucket's storage classes and diff against the record. Lifecycle rules drift.

## Where This Is Heading

Three developments will make tiering agents better.

Iceberg v4's metadata work. The proposed columnar (Parquet) manifests and typed column statistics make the `files` and `partitions` metadata tables cheaper to query at scale, which makes the heatmap join cheap enough to run daily on a table with millions of files. The agent's biggest cost today is reading the metadata for a very large table.

Storage-class awareness in the format. There is no field in Iceberg's data file metadata for storage class today. A future spec that carries it lets a planner know before opening a file that it is in an offline tier and fail the query at planning time with a clear message rather than at scan time with an object store error. Nothing has been proposed, but it is the natural home for the information the tiering agent currently keeps in a side table.

Catalog events as the coordination bus. Apache Polaris publishes table events. A tiering agent that subscribes to compaction-complete and snapshot-expired events for its tables sequences itself correctly without a schedule, and a restore-on-demand handler that publishes restore-initiated events lets the engine surface a useful message. The catalog is becoming the place where maintenance agents coordinate, and tiering is one of the agents.

The larger shift is that table maintenance is becoming autonomous. Compaction, snapshot expiration, orphan cleanup, and now tiering are decisions with cost models and policy constraints, and they are increasingly made by background workers reading the table's own metadata and the engine's own query log rather than by an engineer with a runbook. The engineer's job moves to writing the policy and reading the weekly summary. That is a better job.

## Conclusion

A large Iceberg table's storage bill is dominated by partitions nobody reads, and the reason they stay in standard storage is not that tiering is hard but that nobody has the heatmap and everybody is afraid of breaking the metadata. Both problems have clean answers. The heatmap is a join between Iceberg's `partitions` metadata table and the engine's query log. The metadata fear is misplaced for the common case, because storage class transitions keep the object key and Iceberg only cares about the key.

An agent that reads the heatmap, applies a cost model under an explicit policy, tags files for lifecycle transitions, records what it did, and coordinates with compaction and expiration can move most of a large table to online cold tiers with no query failures and a self-correcting cost model. Offline archive tiers are a separate decision with a human in the loop and a restore path in the semantic layer. Start with the online tiers, cap every run, exclude archives from the default views, and read the weekly summary. The 900-terabyte table from the opening gets 60 to 80 percent cheaper, and the dashboards never notice.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg table maintenance, metadata, and the operational side of running a lakehouse at scale. *Apache Iceberg: The Definitive Guide* (O'Reilly) covers the metadata tables, compaction, and expiration mechanics this article builds on, and *Architecting an Apache Iceberg Lakehouse* (Manning) covers the storage and cost design. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
