---
title: "Surviving Commit Conflicts When Dozens of Writers Hit the Same Iceberg Table"
date: "2026-07-28"
description: "Commit conflicts multiply with writer count, and AI agents introduce unpredictable write patterns. Here's how to diagnose, tune, and architect around Iceberg's optimistic concurrency."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Concurrency
  - Data Engineering
  - AI Agents
canonical: "https://iceberglakehouse.com/posts/iceberg-concurrent-commits-agents/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-concurrent-commits-agents/).

# Surviving Commit Conflicts When Dozens of Writers Hit the Same Iceberg Table

A compaction job runs for three hours, rewrites 4,000 files, and dies at the last step with `CommitFailedException: Cannot commit changes based on stale table metadata`. The cluster time is gone. The table is unchanged. Somebody reruns it that night and the same thing happens.

This is the most expensive failure mode in Apache Iceberg operations, and it is not a bug. It is optimistic concurrency control doing exactly what the design says it does. The writer assumed it was alone, did all its work, and found out at the end that it was not.

The failure gets more common as more things write to a table. Streaming ingestion, batch loads, MERGE statements from dbt, compaction, snapshot expiration, and now AI agents issuing writes on schedules nobody planned. Each additional writer raises the collision probability, and the relationship is not linear.

I work at Dremio, which builds a query engine on Iceberg, so I spend a lot of time on this. The mechanics below come from the Iceberg specification and the reference implementations, and every configuration property named here is one you can verify in the docs.

This piece covers what happens during a commit, which conflicts retry successfully and which never will, how isolation levels change the answer, and the architectural patterns that keep contention low when the writer count goes up.

## What actually happens during a commit

Iceberg tables have a current state pointer. The catalog holds it, and it names one metadata file. Everything about the table at a given moment comes from following that pointer.

A write proceeds in stages.

**Read.** The writer loads current table metadata from the catalog and notes the base snapshot ID. Everything it does from here assumes that snapshot.

**Plan.** For operations that need to know what is already there, meaning OVERWRITE, MERGE, and DELETE, the writer reads the relevant data to determine which files and rows are in scope. INSERT skips this, because appending does not depend on existing content.

**Execute.** The writer writes new data files to object storage. This is the expensive part and it happens entirely outside any lock. A compaction job spends hours here.

**Validate.** The writer reloads the latest table metadata and checks whether its planned change is still compatible with what the table looks like now. If another writer changed something the operation depends on, the check fails here.

**Commit.** The writer generates new metadata files and asks the catalog to swap the pointer from the base metadata file to the new one. The swap is atomic, an ordinary compare-and-swap.

**Retry.** If the swap failed because someone else moved the pointer first, the writer goes back to the validate step. It does not go back to execute. The data files it wrote are still valid and still on object storage.

That last detail is the one people miss, and it changes how you reason about cost. A catalog commit conflict does not throw away the hours of work. The retry re-reads metadata, re-runs the conflict check, rewrites the metadata files, and attempts the swap again. What gets thrown away is the metadata work, which is small.

So why did the three-hour compaction job lose its work? Because it did not hit a catalog commit conflict. It hit a validation conflict, and those are a different animal.

## Two kinds of conflict

Everything about handling contention starts with telling these apart.

**Catalog commit conflicts** happen at the pointer swap. Two writers finished at nearly the same time and one of them lost the race. Nothing is semantically wrong. The loser reloads, re-validates, and commits on top of the winner. These are transient, they resolve through retries, and at low concurrency you never notice them.

**Validation conflicts** happen at the check step. The writer's operation depends on an assumption about table state that another writer already broke. Two jobs both rewrote the same partition. One deleted rows another job's MERGE was counting on. Retrying does not help, because the conflict is real. The correct behavior is to fail and let a human or an orchestrator decide.

A concrete validation conflict:

```
Writer A: OVERWRITE partition 2026-05-14, reads snapshot 100
Writer B: OVERWRITE partition 2026-05-14, reads snapshot 100
B commits first, producing snapshot 101
A retries, reads snapshot 101, sees B already rewrote that partition
A fails: CommitFailedException, cannot merge conflicting overwrites
```

No number of retries fixes that. A's plan was built against files that no longer exist.

Here is how the two classes compare.

| | Catalog commit conflict | Validation conflict |
|---|---|---|
| Detected at | Pointer swap | Conflict check before commit |
| Cause | Race between two commits | Overlapping data changes |
| Retry helps | Yes | No |
| Work discarded on failure | Metadata only | The full operation |
| Frequency driver | Commit rate | Overlap in what writers touch |
| Fix | Tune retry properties | Change the architecture |

The distinction tells you where to spend effort. If your failures are catalog commit conflicts, tuning retry properties solves them and takes an afternoon. If they are validation conflicts, no property setting helps and you have to change what writers touch.

Diagnose before you tune. A team that raises `commit.retry.num-retries` to 20 against validation conflicts has made their failures take twenty times longer to arrive.

## Isolation levels change the answer

Iceberg supports two isolation levels for write operations, and the choice determines how strict the validation check is.

**Serializable** is the strictest. The write behaves as though it ran in a serial order with every other operation. A DELETE running under serializable isolation fails if any new data files landed in the partitions it targeted, even if those new rows do not match the delete predicate. The reasoning is that a serial execution sees those rows and deletes the matching ones.

**Snapshot isolation** is looser. The operation fails only when another writer changed or deleted files the operation itself depends on. New files appearing concurrently do not cause a failure.

The practical difference shows up in exactly one common scenario, and it is a scenario agents produce constantly. A streaming job appends new rows to a table while a DELETE runs against the same partition. Under serializable, the DELETE fails. Under snapshot isolation, it succeeds, and the newly appended rows survive even when they match the delete predicate.

Which is correct depends on what the DELETE is for. A compliance deletion that has to remove every matching row needs serializable, because a row that slipped in during the operation and stayed is a compliance failure. A cleanup job removing rows older than 90 days does not care, because the rows arriving during the operation are new by definition.

Set it per operation type through table properties:

```sql
ALTER TABLE catalog.sales.orders SET TBLPROPERTIES (
  'write.delete.isolation-level' = 'serializable',
  'write.update.isolation-level' = 'snapshot',
  'write.merge.isolation-level'  = 'snapshot'
);
```

That configuration says compliance-grade deletes get strict checking, and routine updates and merges get the looser check that fails less. Most teams should think about this explicitly rather than accepting whatever their engine defaults to, because the default is a correctness decision made on your behalf.

INSERT sits outside this discussion. Appending adds new files and does not depend on existing content, so an append conflicts with almost nothing. That property is the foundation of several patterns later in this article.

## Why agent workloads change the shape of the problem

I want to be careful here, because the framing around AI agents and write concurrency gets overstated.

Most agent traffic against a lakehouse is read traffic. An agent answering an analytical question issues SELECTs. Reads in Iceberg take a snapshot and never conflict with anything, since a reader holds a consistent view of one snapshot while writers create new ones. A hundred agents reading a table produce zero commit conflicts.

The concurrency problem arrives when agents write, and the shapes that produce writes are narrower than the marketing suggests. Agents that materialize intermediate results. Agents that write telemetry about their own execution. Agents running data quality checks that quarantine bad rows. Agents that operate pipelines rather than answer questions.

Where agents genuinely change the picture is in three properties of their write pattern.

**Timing is unpredictable.** A batch pipeline runs at 02:00. An agent writes when a user asks it something. Your carefully staggered maintenance schedule assumed nothing else committed at 03:15, and now something does.

**Retry behavior compounds.** An agent framework retries failed operations. Iceberg retries failed commits. An agent that retries three times, each attempt retrying four commits, produces twelve commit attempts for one logical write. Under contention, that pattern is what turns a busy table into an unavailable one.

**Write granularity is small.** A batch job writes one large commit. An agent writes a small commit per action, because each action completes independently. Ten agents each committing every few seconds generate a commit rate that a nightly-batch table never saw, and commit rate is the direct driver of catalog commit conflicts.

That third property is the one worth planning around. Iceberg's OCC assumes conflicts are rare, and the assumption holds when commits are infrequent and large. It degrades when commits are frequent and small, which is precisely the pattern automated writers produce.

The good news is that small frequent writes are usually appends, and appends conflict with almost nothing. The design work is arranging for agent writes to be appends.

## Tuning retries properly

Start with the defaults, because they tell you what the implementers expected. In the Java implementation, `commit.retry.num-retries` defaults to 4, `commit.retry.min-wait-ms` to 100, `commit.retry.max-wait-ms` to 60000, and `commit.retry.total-timeout-ms` to a long window measured in tens of minutes. The wait grows exponentially between attempts, bounded by the max.

Those defaults suit small to medium workloads. They stop being enough when commit rate rises.

Configure them as table properties so every engine writing to the table inherits the same behavior:

```sql
ALTER TABLE catalog.sales.orders SET TBLPROPERTIES (
  'commit.retry.num-retries'       = '10',
  'commit.retry.min-wait-ms'       = '100',
  'commit.retry.max-wait-ms'       = '5000',
  'commit.retry.total-timeout-ms'  = '120000'
);
```

Or per client, which is what you want when one writer needs different behavior from the rest:

```python
from pyiceberg.catalog import load_catalog

catalog = load_catalog(
    "prod",
    **{
        "type": "rest",
        "uri": "https://catalog.example.com",
        "commit.retry.num-retries": "10",
        "commit.retry.min-wait-ms": "100",
        "commit.retry.max-wait-ms": "5000",
        "commit.retry.total-timeout-ms": "120000",
    },
)
```

Reasoning through each value.

`num-retries` at 10 rather than 4 gives short commits more chances to slip through a busy period. Raising it costs nothing when conflicts are rare and helps a lot when they cluster. Past roughly 20 you are papering over a validation conflict.

`max-wait-ms` at 5000 rather than 60000 is the change most teams need and rarely make. A 60-second maximum wait means a writer that loses several races sits idle for a minute, and during that minute the table keeps moving. Shorter maximum waits keep the writer in the game. The tradeoff is more load on the catalog.

`total-timeout-ms` at 120000 caps the whole thing. Without a sensible total timeout, a writer under sustained contention retries for the better part of an hour while its caller waits. Fail faster and let the orchestrator decide.

One implementation difference deserves a flag. In `iceberg-go`, retry is off by default, with `commit.retry.num-retries` at 0. A Go writer against a contended table fails on first conflict unless you opt in. Retry there engages on the REST catalog, which wraps commit conflicts as `ErrCommitFailed`. If part of your stack is Go and you have unexplained write failures, check this first.

**Add jitter if your engine lets you.** Exponential backoff without randomization synchronizes writers. Ten writers that all conflict at the same moment all wait the same 100 milliseconds and all retry simultaneously, producing the same conflict. The Java implementation randomizes within the wait window. If you are writing your own commit loop, do not skip that.

## Reducing overlap instead of surviving it

Retry tuning handles catalog commit conflicts. Validation conflicts need architecture. Three patterns cover most cases.

**Partition-aligned writers.** Validation conflicts arise from overlap in what writers touch. Two writers that never touch the same partition never conflict on data. If you can shard your writers by partition, whether by date, by region, or by tenant, most validation conflicts disappear by construction.

This works well for ingestion, where source data usually carries a natural partition key, and badly for MERGE workloads that update arbitrary rows. Check whether your partition boundaries are stable before relying on this. A table that repartitions occasionally has writers whose partition assumptions go stale, and the resulting conflicts are confusing to debug.

**Append-only landing, batch merge.** Instead of having twenty writers MERGE into one table, have them append to a landing table and run one MERGE on a schedule. Appends conflict with almost nothing, so twenty concurrent appenders coexist happily. The single merge job runs alone and never races itself.

The cost is latency. Data is visible in the landing table immediately and in the merged table after the next merge cycle. For most analytical use, that tradeoff is fine, and a view unioning the merged table with the unmerged landing rows closes the gap for readers who need current data.

This is the pattern I recommend first for agent writes. An agent appending a row to a telemetry table conflicts with nothing. An agent running MERGE against a hot table conflicts with everything.

**Branch-per-writer with controlled merge.** Iceberg branches give each writer an isolated line of commits. The writer commits to its own branch, a validation step runs, and a merge into the main branch happens under controlled conditions.

```sql
-- Create a working branch for one agent's batch of changes
ALTER TABLE catalog.sales.orders
  CREATE BRANCH agent_run_2026_07_28
  RETAIN 7 DAYS;

-- The agent writes against its branch only
INSERT INTO catalog.sales.orders.branch_agent_run_2026_07_28
SELECT * FROM staging.corrections;

-- Validate before anything reaches main
SELECT count(*) AS bad_rows
FROM catalog.sales.orders.branch_agent_run_2026_07_28
WHERE order_total < 0;

-- Merge once validation passes
CALL catalog.system.fast_forward(
  table => 'sales.orders',
  branch => 'main',
  to     => 'agent_run_2026_07_28'
);
```

`fast_forward` only succeeds when main has not moved past the branch point, which makes the merge itself the single contended operation. That is the property you want. All the expensive work happened on the branch with no contention, and the one contended step is cheap and fast.

The limitation is real: fast-forward requires main to be an ancestor of the branch. With multiple concurrent branches, the second one to merge fails and needs rebasing. Branches suit workloads with a small number of concurrent write streams and heavy validation requirements. They do not scale to a hundred simultaneous writers.

## The catalog decides how well this works

The commit is an atomic swap of a pointer, and the catalog owns the pointer. Which catalog you run changes the concurrency characteristics more than most teams expect.

**Filesystem-based catalogs** implement the swap by creating a new metadata file and updating a version hint. On object storage without atomic rename semantics, this is not safe under concurrency. Two writers create version 42 and one silently wins. This is a fine choice for a single-writer table and a bad one for anything else. Teams get away with it for a long time because the corruption window is narrow and the failure is quiet.

**Hive Metastore** provides atomicity through a lock on the table. That works, and it serializes commits at the metastore, which becomes the bottleneck as commit rate climbs. Metastore lock contention shows up as commit latency that grows with total write volume across all tables, not just the contended one.

**Iceberg REST catalogs**, including Apache Polaris, handle the swap as a service operation with a conditional update. The catalog compares the base metadata location the writer claims against what it currently holds and rejects the write when they differ. This is a compare-and-swap done by a service that can also see everything else happening, which is what makes server-side conflict handling a plausible future direction.

The practical guidance is short. If you have more than one writer on a table, run a REST catalog. If you are on a filesystem catalog and have concurrent writers, that is a correctness problem to fix ahead of any tuning discussion.

One more catalog property matters at high commit rates: how the catalog stores its state. Polaris runs on a JDBC backend, with Postgres and CockroachDB both documented. A commit is a small transaction against that backend. At 4,000 commits a day, the backend does not notice. At 4,000 commits an hour across a busy estate, backend configuration starts to matter, and the metrics to watch are transaction latency and connection pool saturation rather than anything Iceberg-specific.

## Readers never conflict, and that is worth stating

A reader takes a snapshot. It resolves the table state from that snapshot's manifests and reads data files. New commits create new snapshots and leave the old one intact, so the reader sees a consistent view for the whole duration of its query no matter what writers do.

This has three consequences worth being explicit about.

**Read concurrency is unbounded from a correctness standpoint.** A thousand concurrent readers on a table under heavy write load all get correct, consistent answers. Whatever limits you hit are compute and object storage limits, not table format limits.

**Long-running reads are safe but pin snapshots.** A query running for an hour holds a snapshot for an hour. Snapshot expiration that removes files a running query still needs breaks that query. Set your expiration retention longer than your longest query, with margin.

**Time travel is free.** Because old snapshots exist until expiration removes them, reading a table as of a past moment costs nothing extra. This is useful for debugging concurrency problems specifically. When a write produced an unexpected result, read the table at the snapshot before and after and compare.

The reason to state this plainly is that discussions about agents and concurrency often blur reads and writes together. A hundred agents querying a table is not a concurrency problem. It is a compute sizing question and a cost question. Keep the two conversations separate, because the answers have nothing in common.

## Working out a contention budget

Rough arithmetic beats intuition here, and the arithmetic is simple enough to do on a whiteboard.

A catalog commit conflict happens when two writers attempt the pointer swap while overlapping. The overlap window is the time between a writer reading base metadata for its final validation and completing its swap. Call that window `w`, typically tens to hundreds of milliseconds against a REST catalog.

With `n` writers each committing at rate `r` commits per second, the expected conflict rate scales roughly with `n * r * w` times the number of other writers active. The key insight is that it grows with the square of the writer count at fixed per-writer rate, not linearly.

Put numbers on it. Five writers each committing once every ten seconds gives 0.5 commits per second total. With a 200 millisecond window, collisions are rare, well under one percent. Take the same per-writer rate to fifty writers and you have 5 commits per second, and the collision rate goes up by roughly a hundredfold rather than tenfold. That is the point where a system that behaved well for a year starts failing.

Three levers change the outcome.

**Shrink the window.** A faster catalog and smaller metadata files both reduce `w`. Metadata file size grows with manifest count, so a table with clean, compacted manifests commits faster than one with thousands. Manifest rewriting is a concurrency optimization as much as a read optimization.

**Reduce the commit rate.** Batching ten agent writes into one commit cuts that agent's contribution by a factor of ten. This is nearly always the cheapest available fix and nearly always the last one teams try.

**Reduce the writer count on any single table.** Splitting one hot table into several tables by tenant or region drops the per-table writer count directly. This is a schema decision with consequences past concurrency, so weigh it properly, but it is the one lever that attacks the squared term.

Notice what is missing from that list: retry tuning. Retries make conflicts survivable. They do not make conflicts less frequent, and past a certain rate no retry budget rescues you.

## Failure modes

**Retry storms.** Contention causes retries, retries increase catalog load, higher catalog load slows commits, slower commits widen the window for contention. The system finds a bad equilibrium where nothing commits and everything retries. Warning sign: catalog request rate climbing while successful commit rate falls. Fix: reduce `commit.retry.num-retries` temporarily to shed load, fix the underlying overlap, then raise it back.

**Compaction losing to ingestion permanently.** Compaction rewrites files. Ingestion adds files to the same partitions. Under serializable isolation, compaction fails when ingestion committed to a partition it touched. On a busy table, compaction never wins, and small files accumulate until query performance collapses. Warning sign: compaction job failure rate near 100 percent alongside a rising file count. Fix: run compaction against partitions ingestion is not currently writing, which for time-partitioned tables means compacting yesterday and older rather than today.

**Agent retry stacking on engine retry.** The agent framework retries a failed write. The engine retries the commit. The catalog client retries the HTTP call. Three layers of retry multiply. Warning sign: one logical agent operation producing more than ten catalog write requests. Fix: turn off retry at the outer layers and let the innermost one that understands the semantics do the work.

**Silent data loss from insufficient retries.** This one is nasty. In some engine and configuration combinations, an exhausted retry budget on a write surfaces as a warning rather than an error, and the pipeline reports success with rows missing. Warning sign: row counts that do not reconcile with source systems on high-concurrency tables. Fix: assert on row counts after every write, and treat any commit failure as a hard error in your orchestration.

**Snapshot growth from tiny commits.** Frequent small writers produce a snapshot per commit. A table taking 4,000 commits a day accumulates snapshots faster than a weekly expiration job removes them, and metadata reads slow for everyone. Warning sign: rising query planning time on a table with no data growth. Fix: expire snapshots more often, and reduce commit frequency by batching agent writes.

**Expiration racing writes.** Snapshot expiration is a write. It conflicts. Scheduling it during a busy period means it either fails repeatedly or wins and disrupts something else. Warning sign: expiration job failures clustered at the same time of day. Fix: coordinate maintenance through an explicit lock rather than hoping schedules do not overlap.

**Stale partition assumptions after evolution.** Partition evolution changes the spec without rewriting data. A writer sharded by the old partitioning writes into what it thinks are isolated partitions and finds it now overlaps another writer. Warning sign: validation conflicts appearing on a table that was previously quiet, shortly after a schema or partition change. Fix: review writer sharding whenever the partition spec changes.

**Long-running MERGE against a hot table.** A MERGE that plans against snapshot 100 and finishes twenty minutes later validates against snapshot 340. The odds that nothing it depends on changed are poor. Warning sign: MERGE jobs whose failure probability scales with their runtime. Fix: shrink the scope so each MERGE runs in seconds, partition-align it, or move to the landing-table pattern.

## Reading the exceptions

Diagnosis starts with the exception text, and the messages are more informative than they first appear.

`CommitFailedException: Cannot commit changes based on stale table metadata` is the catalog commit conflict. Another writer moved the pointer between your read and your swap. This one is transient. Seeing it in logs at a low rate on a busy table is normal and means retries are doing their job. Seeing it as a terminal failure means your retry budget ran out.

`ValidationException` with a message about conflicting files or deleted files is the validation conflict. The specific text varies by operation. A MERGE reports that files it planned against were deleted. An OVERWRITE reports that it cannot merge conflicting overwrites. A DELETE under serializable isolation reports that new data files appeared in its partitions. Each of these is a real semantic conflict and retrying is the wrong response.

`CommitStateUnknownException` is the one to take seriously. It means the writer sent a commit and did not learn whether it succeeded. A network timeout at exactly the wrong moment produces this. The commit possibly landed. Retrying risks committing twice, and not retrying risks losing the write. Neither choice is safe without checking, and the correct handling is to reload the table, look for your snapshot, and act on what you find. Most engines surface this as a hard failure requiring operator attention, which is the right default.

The practical logging setup is to capture the exception class, the table identifier, the base snapshot ID, the attempt number, and the writer identity for every commit failure. With those five fields you can answer the questions that matter: which tables are contended, which writers are involved, whether failures are transient or semantic, and whether retries are helping.

Aggregate on the exception class first. A table producing only stale-metadata exceptions has a tuning problem. A table producing validation exceptions has a design problem. A table producing both has a design problem plus a tuning problem, and fixing the design usually clears both.

## Coordinating maintenance without hoping

Compaction, snapshot expiration, orphan file cleanup, and manifest rewriting are all writes. They conflict with ingestion and with each other. The common approach is to schedule them at different times and hope, which works until a job runs long or an agent writes at 03:15.

An explicit coordination mechanism costs little and removes a whole class of failure.

The simplest version is an advisory lock in whatever database you already run, keyed by table identifier. A maintenance job acquires the lock, does its work, and releases it. Jobs that cannot acquire the lock skip this cycle rather than queue, because a compaction that runs an hour late is fine and a pile of queued compactions is not.

```python
import psycopg
from contextlib import contextmanager

@contextmanager
def table_maintenance_lock(conn, table_id: str):
    """Advisory lock keyed on table identity. Skips if already held."""
    key = hash(table_id) % (2**31)
    with conn.cursor() as cur:
        cur.execute("SELECT pg_try_advisory_lock(%s)", (key,))
        acquired = cur.fetchone()[0]
    if not acquired:
        yield False
        return
    try:
        yield True
    finally:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_unlock(%s)", (key,))


with psycopg.connect(MAINTENANCE_DSN) as conn:
    with table_maintenance_lock(conn, "sales.orders") as got_lock:
        if got_lock:
            run_compaction("sales.orders")
            expire_snapshots("sales.orders")
            rewrite_manifests("sales.orders")
        else:
            log.info("maintenance skipped, lock held elsewhere")
```

`pg_try_advisory_lock` returns immediately rather than blocking, which is what makes the skip behavior work. The lock releases automatically if the session dies, so a crashed job does not leave the table locked forever.

Ordering inside the lock matters. Compact first, because it produces the new files. Expire snapshots second, because expiration removes the old files compaction replaced. Rewrite manifests last, because the previous two steps changed what the manifests describe. Running expiration before compaction wastes work, since compaction immediately creates new snapshots to expire.

This does nothing about ingestion, which does not participate in the lock and should not. The point is narrower: it stops maintenance jobs from fighting each other, which is a self-inflicted category of conflict that is cheap to eliminate.

For teams running Flink maintenance tasks, the framework already includes lock coordination with a configurable check delay. Use it rather than building a parallel mechanism, and make sure your Spark-side maintenance participates in the same lock rather than a different one.

## Operational guidance

**Measure your conflict rate before changing anything.** Instrument commit attempts and commit failures separately, and split failures by exception type. A table with a 2 percent catalog commit conflict rate and no validation conflicts is healthy and needs nothing. A table with 30 percent validation conflicts has a design problem that no property setting addresses.

**Track snapshot creation rate per table.** This is the single best proxy for contention pressure. Query the snapshots metadata table and count by hour:

```sql
SELECT
    date_trunc('hour', committed_at) AS hour,
    operation,
    count(*) AS snapshots
FROM catalog.sales.orders.snapshots
WHERE committed_at > current_timestamp - INTERVAL '7' DAY
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC;
```

Grouping by operation shows which writer type dominates. A table where `append` dominates is in good shape. A table where `overwrite` and `delete` dominate at high volume is where conflicts live. This query also shows you the hours when adding a maintenance job is a bad idea.

**Give every writer an identity.** Set a writer identifier in snapshot summary properties so the snapshots table tells you who wrote what. Without it, diagnosing a conflict means guessing which of your eleven writers was involved. With it, the answer is a GROUP BY.

**Serialize maintenance explicitly.** Compaction, snapshot expiration, orphan file cleanup, and manifest rewriting all commit. Running them concurrently guarantees conflicts among jobs that have no reason to race. Put them behind one lock and run them in sequence.

**Set a commit budget per writer class.** Decide how many commits per minute each writer type is allowed and enforce it at the writer. An agent that wants to commit forty times a minute should batch into four. This is easier to enforce at the source than to survive at the table.

**Test contention before production.** Spin up the number of concurrent writers you expect against a copy of the table with representative partition layout, and watch the failure rate. This takes an afternoon and finds problems that otherwise surface at the worst possible moment. The number that matters is not average commit latency, it is the failure rate at your p99 concurrency.

**Set snapshot retention with your longest reader in mind.** Expiration that outruns a running query produces missing-file errors that look like storage problems. Take your p99 query duration, multiply by three, and use that as a floor for retention.

**Watch manifest count as a leading indicator.** Commit cost grows with metadata size, and metadata size grows with manifest count. A table whose manifest count has tripled commits more slowly, which widens the conflict window, which raises the conflict rate. Rewriting manifests on a schedule keeps commits fast. Query it directly:

```sql
SELECT count(*) AS manifest_count,
       sum(added_data_files_count) AS added_files,
       sum(existing_data_files_count) AS existing_files
FROM catalog.sales.orders.manifests;
```

A manifest count in the low hundreds is healthy for most tables. Several thousand means commit latency is paying for it.

**Prefer append everywhere you can.** This is the summary of everything above. Appends do not conflict. Every design that turns a contended update into an append plus a scheduled merge trades a hard concurrency problem for an easy latency one.

## What to do when you inherit a contended table

Most people meet this problem on a table somebody else built, under time pressure, with a pipeline already failing. Here is the order I work through.

**Hour one: stop the bleeding.** Identify the writer that fails most and pause it if the business tolerates the delay. This is not a fix and it buys you room to think. Note which writers keep succeeding once the loud one stops, because that tells you who was actually contending.

**Hour two: classify the failures.** Pull the last week of commit failures and split by exception class. This one step decides everything that follows. Stale-metadata failures point at tuning. Validation failures point at architecture. Get this wrong and you spend a week on the wrong problem.

**Hour three: check the catalog.** Confirm you are on a REST catalog. If the table is on a filesystem catalog with multiple writers, everything else is secondary to fixing that, because you have a silent correctness exposure rather than a performance issue.

**Day one: measure the commit rate and the writer inventory.** Run the snapshot-count-by-hour query. List every process that writes to this table, including the ones nobody documented. In my experience there are always two or three more than the team expects, and one of them is a script somebody runs by hand.

**Day two: apply the cheap fixes.** Raise `commit.retry.num-retries`, lower `commit.retry.max-wait-ms`, set a sane `commit.retry.total-timeout-ms`. Move maintenance behind a lock. Shift compaction off the partitions ingestion is actively writing. These four changes resolve a large fraction of contended tables and none of them require touching pipeline logic.

**Week one: fix the overlap.** If validation conflicts remain, this is where the real work sits. Pick the pattern that fits: partition-align the writers, move to append-only landing with a scheduled merge, or split the table. Each of these is a change to how a pipeline is built rather than a setting, which is why it comes last even though it is the durable answer.

**Ongoing: keep the instrumentation.** The reason this table became contended is that nobody was watching commit failure rate. Leave the dashboard up. A conflict rate creeping from 1 percent to 8 percent over two months is a thing you want to see coming rather than discover during an incident.

One closing note on prioritization. The instinct is to fix the loudest failure first. The better move is to fix the cheapest failure first, because reducing total commit volume lowers the conflict rate for everyone, including the loud one. A maintenance job you move behind a lock stops contending with four other writers at once.

## Where this is heading

Two directions in the community bear on this.

The first is server-side commit coordination. When every writer independently retries against a catalog that only says yes or no, the catalog holds information it does not use. A catalog that understands the semantics of competing commits resolves some conflicts server-side rather than bouncing both writers back to try again. The Iceberg REST catalog specification gives the catalog a richer role than the file-pointer swap that came before it, and this is a natural place for that role to grow. Watch the REST spec discussions.

The second is the equality delete work I have written about elsewhere, which matters here for a non-obvious reason. Merge-on-read representations that resolve at read time keep write-side commits small and cheap. Deletion vectors keep that property while making reads fast. A table whose writers all produce small appends and vectors has a much lower conflict surface than one whose writers rewrite files.

There is also a live question about whether Iceberg's OCC model holds up as automated writers become the majority. OCC is the right choice when conflicts are rare. Whether they stay rare when the writers are machines committing on their own schedules is an empirical question the ecosystem is answering right now. My read is that the model holds fine, and the work is on the architecture side rather than the format side. Arrange for appends, keep contended operations short, and the assumptions behind OCC keep being true.

## Conclusion

Commit conflicts in Iceberg are not a defect. They are the visible cost of a design that lets many writers work in parallel without locks, and that design is why the format scales the way it does.

The practical work splits cleanly. Catalog commit conflicts are transient races, they resolve through retries, and the fix is property tuning: more retries, shorter maximum waits, a sensible total timeout. Validation conflicts are real disagreements about table state, retries never help, and the fix is reducing what writers touch at the same time.

Tell them apart before you tune anything. Then reduce overlap with the pattern that fits your workload: partition-aligned writers for sharded ingestion, append-only landing plus scheduled merge for high writer counts, branches for a small number of streams needing heavy validation.

For automated writers, including agents, the guidance compresses to one sentence. Make their writes appends, batch them, and keep MERGE out of the hot path. Do that and the writer count stops being the thing you worry about.

## Keep Going

If this piece was useful, I have written a lot more on Iceberg internals and lakehouse operations. *Apache Iceberg: The Definitive Guide*, which I co-authored for O'Reilly, covers the snapshot model, commit protocol, and maintenance operations behind everything here. *Architecting an Apache Iceberg Lakehouse* from Manning takes the same material into platform design, including how to structure writers across a large estate. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
