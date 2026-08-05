---
title: "Surviving Optimistic Commit Collisions When Hundreds of Agents Write to Iceberg"
date: "2026-08-04"
description: "Surviving optimistic commit collisions when hundreds of agents write to Iceberg: which conflicts are real, commit buffers, partitioning, and the patterns that prevent commit storms."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Concurrency
  - Optimistic Concurrency
  - Agent Writes
  - Commit
canonical: "https://iceberglakehouse.com/posts/high-concurrency-agent-writes-iceberg/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/high-concurrency-agent-writes-iceberg/).

# Surviving Optimistic Commit Collisions When Hundreds of Agents Write to Iceberg

*By Alex Merced, Data Lakehouse and AI Evangelist*

The read path got all the attention. Agents query tables, a semantic layer keeps them honest, a catalog decides what they can see. That architecture is well understood by now.

Then agents started writing. Decision records, telemetry, enrichment results, annotations, feature values, task state. Every loop that acts produces rows, and a fleet of loops produces them from many processes at once, in small batches, continuously, with no coordination between them.

Apache Iceberg handles concurrent writes with optimistic concurrency control, which works beautifully when a handful of pipelines commit a few times an hour. Under a hundred concurrent writers committing every few seconds, the retry loop that made OCC safe becomes the thing that limits throughput. Commits start failing, retries pile up, and the tail latency on a write goes from two seconds to two minutes.

This piece covers why that happens, which conflicts are real and which are avoidable by layout, what the catalog can do that a client cannot, and the concrete patterns for getting agent write traffic onto Iceberg without a commit storm.

A disclosure. I work for Dremio, which was acquired by SAP and now sits within SAP Business Data Cloud. Dremio contributes to Iceberg and ships a catalog built on Apache Polaris. The mechanics below come from the Iceberg specification and apply to any engine that implements it.

## How an Iceberg commit works

Understanding the retry loop requires understanding the commit, which is simpler than people expect.

A writer reads the table's current metadata, which names the current snapshot. It writes its data files to storage. It builds a new snapshot describing the table state after its change. Then it attempts to swap the pointer to the current metadata file, conditional on that pointer still naming the snapshot it started from.

If another writer swapped first, the condition fails. The writer re-reads the current state, validates that its change is still applicable, rebuilds its snapshot on top of the new base, and tries again.

That is optimistic concurrency control. No locks are held during the data write, which is what makes long-running writes safe. The cost is that conflicts are detected at commit time, after all the work is done.

Two properties of the retry matter for what follows.

**The retry is cheap in data terms and expensive in metadata terms.** The data files are already written and stay valid. What gets rebuilt is the snapshot and its manifests, which for a table with many manifests is not free.

**Not every concurrent commit is a conflict.** Iceberg validates whether the change is still applicable rather than whether anything changed. Two appends to different partitions both succeed on the merge. A delete that overlaps another writer's rewrite does not.

That second property is the lever. Most of the tuning below is about making concurrent writes non-conflicting rather than about making retries faster.

## Which conflicts are real

Sorting operations by conflict behavior tells you what layout to design.

| Operation pair | Conflicts? | Why |
|---|---|---|
| Append and append | No | Both add files, neither invalidates the other |
| Append and append to same partition | No | Partition is not a lock unit |
| Append and compaction | Sometimes | Rewrite might not see the new files, depending on isolation level |
| Delete and delete, different files | No under snapshot isolation | Deletion vectors merge per data file |
| Delete and delete, same data file | Yes | One vector per data file per snapshot |
| Overwrite and any write to same partition | Yes | Overwrite asserts what it replaces |
| MERGE and MERGE on overlapping rows | Yes | Both assert row state |
| Schema change and anything | Yes | Metadata-level assertion |

The headline is that **appends do not conflict with appends**. If your agent write traffic is append-only, you do not have a logical conflict problem. You have a commit-rate problem, which is a different thing with different fixes.

That distinction is the single most useful piece of guidance here. Design agent writes to be appends wherever you can, and push the reconciliation into a downstream process.

## The commit rate problem

Even with zero logical conflicts, a hundred writers committing every three seconds produce roughly thirty-three commit attempts per second against one table. Each attempt reads current metadata, writes a new metadata file, and attempts the swap.

Three things bind before you reach any interesting throughput.

**Metadata write volume.** Each commit writes a manifest, a manifest list, and a new metadata JSON. Thirty-three commits per second is roughly a hundred metadata objects per second against object storage, which rate-limits per prefix.

**Serialization at the swap point.** Whatever implements the atomic swap, a catalog database row, a conditional put, a metastore property, serializes commits to that table. That is a single point of throughput.

**Retry amplification.** When commits collide, each retry adds another round of metadata reading and writing. At high contention, the system spends more time retrying than committing, and throughput falls as concurrency rises. This is the classic congestion collapse shape, and it is why the failure looks sudden rather than gradual.

The V4 metadata work targets exactly this. Adaptive metadata trees inline small changes into a root manifest so a small commit writes one object rather than three, and single-file commit proposals aim for one object in the common case. Those are proposals under active design rather than shipped features, and I covered their status in more detail elsewhere. Plan for them, do not depend on them yet.

## Patterns that work today

Five patterns, roughly in order of how much they help.

### Coalesce writes at a buffer

The highest-return change by a wide margin, and the one teams resist because it adds a component.

Do not let a hundred agent processes commit directly. Put a buffer between them and the table: a queue, a stream, or a small service that accumulates rows and commits in batches.

A hundred writers committing every three seconds becomes one writer committing every ten seconds with a hundred times the rows. Commit rate drops by three orders of magnitude. File sizes go up, which helps the read path. Conflicts approach zero because there is one writer.

The objection is latency, and it is usually smaller than it sounds. A ten-second buffer on decision records or telemetry is invisible. For write paths where a few seconds genuinely matter, buffer with a short flush interval and accept a higher commit rate on that specific table.

```python
class CommitBuffer:
    def __init__(self, table, max_rows=50_000, max_seconds=10):
        self.table = table
        self.max_rows = max_rows
        self.max_seconds = max_seconds
        self.rows = []
        self.opened_at = time.monotonic()

    def add(self, row):
        self.rows.append(row)
        if self._should_flush():
            self.flush()

    def _should_flush(self):
        return (len(self.rows) >= self.max_rows
                or time.monotonic() - self.opened_at >= self.max_seconds)

    def flush(self):
        if not self.rows:
            return
        batch = self.rows
        self.rows = []
        self.opened_at = time.monotonic()
        # one append, one commit, regardless of how many producers contributed
        self.table.append(to_arrow(batch))
```

The important property is that the buffer owns the commit. Producers hand it rows and never touch the table.

### Partition the write path

When several writers are unavoidable, give each one its own partition so their file sets never overlap.

For agent workloads the natural key is often the loop name, the surface, or a hash of the session. Partitioning by that plus time keeps each writer in its own space.

```sql
CREATE TABLE ops.agents.decisions (
    decision_id   STRING,
    loop_name     STRING,
    principal     STRING,
    started_at    TIMESTAMP,
    payload       VARIANT
)
USING iceberg
PARTITIONED BY (loop_name, hours(started_at))
TBLPROPERTIES (
    'format-version' = '3',
    'write.distribution-mode' = 'hash'
);
```

`write.distribution-mode = hash` matters more than it looks. It controls how an engine distributes rows to writer tasks before writing files. Under the default, many tasks write into many partitions and produce a large number of small files per commit. Hash distribution routes rows for a partition to one task, which produces fewer, larger files per commit and reduces manifest volume.

This does not eliminate the commit rate problem, since all writers still commit to the same table. It eliminates the logical conflict problem and reduces metadata churn per commit.

### Split the table

The pattern people reach for last and sometimes should reach for first.

If a hundred loops write telemetry, one table per loop family with a view unioning them removes contention entirely. Each table has one writer. Commits never collide because they touch different tables.

The costs are real: more tables to maintain, a view that has to be kept current, and query planning across many tables. Where the write volume justifies it, this is the simplest correct answer.

A middle position works well: one table per high-volume producer, one shared table for the long tail of low-volume producers.

### Choose the isolation level deliberately

Iceberg supports serializable and snapshot isolation for operations that assert state.

Serializable is stricter. It fails a commit if any concurrent change touched the affected files, including changes that do not actually conflict logically.

Snapshot isolation permits more concurrency by validating only against changes that genuinely invalidate the operation.

For agent write paths, snapshot isolation on delete and update operations is usually the right choice, set through table properties.

```sql
ALTER TABLE ops.agents.decisions SET TBLPROPERTIES (
    'commit.retry.num-retries'         = '10',
    'commit.retry.min-wait-ms'         = '100',
    'commit.retry.max-wait-ms'         = '10000',
    'commit.retry.total-timeout-ms'    = '120000',
    'write.delete.isolation-level'     = 'snapshot',
    'write.update.isolation-level'     = 'snapshot'
);
```

The retry parameters deserve attention. The defaults are tuned for occasional contention. Under sustained contention you want more retries with a wider backoff range, because a narrow range causes retrying writers to collide with each other repeatedly. Jitter within the range is what breaks the synchronization, and it is worth verifying your engine applies it.

### Make updates into appends

The pattern that removes the hardest conflict class.

An agent updating a decision record's status generates an update, which asserts row state and conflicts with any other writer touching the same data file. A hundred agents updating status fields on a shared table is the worst case for OCC.

Write the status change as a new row with a timestamp instead. Reads take the latest row per decision ID. Nothing conflicts because everything is an append.

```sql
CREATE VIEW ops.agents.decisions_current AS
SELECT * FROM (
    SELECT *,
           ROW_NUMBER() OVER (
               PARTITION BY decision_id
               ORDER BY event_at DESC
           ) AS rn
    FROM ops.agents.decision_events
) WHERE rn = 1;
```

The read cost is real and it is bounded, especially with a time filter and a periodic compaction job that collapses history into a current-state table. Trading a small read cost for the removal of an entire conflict class is usually the right trade at high write concurrency.

## What the catalog contributes

Client-side conflict handling has a ceiling. Every client independently retries, and none of them can see the queue.

A REST catalog changes this because commits are change-based rather than state-based. The client sends requirements and updates rather than a complete new metadata document. The catalog validates the requirements against current state, applies the updates if they hold, and writes the root metadata itself.

That structure allows server-side deconfliction. Two clients committing non-overlapping changes both succeed on the server rather than one retrying, because the catalog can see both and merge them. It also allows the catalog to serialize commits into a queue rather than letting clients race, which converts contention into ordered waiting.

The transaction work in the ecosystem extends this further. The Iceberg REST spec defines a multi-table commit endpoint, supported in Java since 1.4, and design work covering stateless coordination, transaction snapshots, explicit isolation levels, and retryable subtransactions has been demonstrated on Apache Polaris, which graduated to Apache Top-Level Project on February 18, 2026.

The practical guidance: move to a REST catalog before you have a concurrency problem, because it is the layer where server-side solutions live. Then measure commit latency and conflict rate at the catalog rather than inferring them from client logs.

## Benchmarking your own contention

Vendor concurrency numbers are close to useless here because the answer depends on your table's manifest count, partition layout, catalog backing store, and operation mix. Run your own.

The test that matters is a ramp. Fix the per-writer commit rate, increase the number of concurrent writers in steps, and record four things at each step.

Commit success rate on first attempt. This falls as contention rises and it is the cleanest signal.

Mean and ninety-fifth percentile commit latency, including retries. The tail is what breaks user-facing paths, and it degrades much faster than the mean.

Effective throughput in rows committed per second. This is the number that reveals congestion collapse: it rises with concurrency, plateaus, then falls. The concurrency level at the peak is your operating ceiling.

Metadata objects written per second. Compare it to your object store's per-prefix limits.

Then repeat the ramp with each mitigation applied so you know what each one bought. In my experience the buffer pattern moves the ceiling by orders of magnitude and everything else moves it by factors, which is why it is first on the list.

Run the ramp against a table with realistic manifest counts. A fresh table with twelve manifests behaves nothing like a production table with four thousand, and testing against the fresh one produces numbers that flatter the design.

## Sizing the buffer

The buffer pattern is the highest-return change, and its parameters determine whether it helps or just relocates the problem.

Three constraints bound the flush interval.

**Freshness requirement.** How stale can the table be before a consumer notices. For decision records and telemetry, minutes are usually fine. For a table an agent reads back within the same session, seconds matter and the buffer has to be short or bypassed for that path.

**Target file size.** You want each flush to produce files near your target, commonly a few hundred megabytes. Divide the target by your average row size and average arrival rate, and that gives the interval that naturally produces well-sized files. If the arrival rate is too low to reach target size in a tolerable interval, the table does not have a concurrency problem and does not need a buffer.

**Durability tolerance.** Rows sitting in a buffer are not durable. A crash loses them unless the buffer is backed by a queue or a stream that persists. For decision records tied to actions in the physical world, that loss is unacceptable, so the buffer should sit behind a durable log rather than in process memory.

The design that satisfies all three is a durable queue in front of a small number of consumer processes that batch and commit. Producers write to the queue and get an acknowledgment. Consumers own the table.

Sizing the consumer count is the part people get wrong in the other direction. One consumer per table is ideal for conflict avoidance and becomes a throughput bottleneck at high volume. Two to four consumers writing to disjoint partitions, using the partitioning pattern above, gives headroom without reintroducing conflicts.

Watch for the failure where the buffer becomes the durability story and nobody realizes the queue has a retention limit shorter than the recovery time. Test a consumer outage that lasts longer than you expect.

## An operating checklist

Work through this before agent write traffic reaches production volume.

- The table's write pattern is append-only, or every non-append operation has been justified individually.
- A buffer or queue sits between producers and the table, and producers have no direct table access.
- `write.distribution-mode` is set explicitly rather than left at the default.
- Partitioning keeps concurrent writers in disjoint file sets, verified by inspecting which partitions each writer touched over an hour.
- Retry parameters are set for sustained contention rather than left at defaults, with a bounded total timeout.
- Isolation level for delete and update operations is set deliberately, with a written reason.
- The catalog is a REST catalog, and commit latency is observable at the catalog rather than only in client logs.
- A manifest rewrite job is scheduled, and manifest count is monitored with an alert on growth rate.
- Compaction on this table is scoped to partitions without recent commits, with partial progress enabled.
- A concurrency ramp benchmark has been run against a table with production-realistic manifest counts, and the throughput peak is recorded as the operating ceiling.
- Write-path compute is separate from the interactive read-path compute agents query through.
- Idempotency keys are carried in the row data so duplicate appends from ambiguous timeouts are detectable downstream.
- A dead letter path exists for writes that exhaust their retry budget, and someone reads it.

The item most often skipped is the second-to-last. Every other item prevents a problem. That one is what lets you recover from the problem you did not prevent.

## Reading the symptoms

When a write path degrades, the symptom rarely names the cause. This mapping saves diagnostic time.

**Commit latency rising while first-attempt success stays high.** Not a contention problem. The commit itself got more expensive, which usually means manifest count grew. Run a manifest rewrite and check whether latency recovers.

**First-attempt success falling with stable latency per attempt.** Genuine contention. More writers are racing than the table can serialize. Reduce writer count through buffering before tuning anything else.

**Throughput falling as you add writers.** Congestion collapse. You are past the ceiling. Adding capacity makes this worse, not better.

**Occasional very slow commits with a healthy median.** Retry tail. Check backoff jitter and the total timeout, and look for a periodic job like compaction colliding with the write path on a schedule.

**Commits succeeding but file counts exploding.** Distribution mode is wrong, or the buffer is flushing on time rather than on size at a low arrival rate. Neither is a concurrency problem and both hurt readers.

**Compaction jobs that never complete.** Losing the commit race continuously. Scope them away from active partitions and enable partial progress.

**Everything healthy until a specific hour each day.** A batch job is colliding with agent writes. Move one or the other, or partition them apart.

Instrument enough to distinguish these before you need to. The four numbers listed under operational guidance are sufficient for every case above, and collecting them costs almost nothing compared to diagnosing without them.

## Failure modes

**Retry storms.** Writers collide, back off with insufficient jitter, and collide again in the same pattern. Verify that your engine applies randomized backoff rather than fixed intervals, and widen the range under sustained contention.

**Manifest growth from small commits.** High commit rates produce many small manifests, which makes every subsequent commit more expensive to build. This is a feedback loop: contention causes small commits, small commits cause manifest growth, manifest growth increases commit cost, which increases contention. Schedule manifest rewriting and treat rising manifest counts as an early warning.

**Compaction losing every race.** A rewrite job on a table under sustained agent writes will conflict repeatedly and never finish. Scope rewrites to partitions with no recent commits, and enable partial progress so completed file groups commit independently.

**Silent data loss through overwrite.** Two writers performing overwrites on the same partition where one wins and the other is retried against new state. Correct under snapshot isolation and confusing to reason about. Prefer appends.

**Timeout without idempotency.** A commit times out and the outcome is unknown. Retrying risks a double write. Agent write paths need idempotency keys carried in the data so a duplicate append is detectable and removable downstream.

**Unbounded retry budgets.** A total timeout of ten minutes means a stuck writer holds a task for ten minutes. Bound it and fail fast to a dead letter path.

**Testing on an empty table.** Concurrency behavior on a table with no history is not the behavior you will get.

**Assuming deletion vectors fixed concurrency.** V3 deletion vectors made deletes cheap on the read side and did not change commit contention. Two writers deleting from the same data file still conflict, because there is at most one vector per data file per snapshot.

**One shared table for every producer.** Convenient at three producers and pathological at a hundred. The table becomes a global serialization point for the entire agent fleet, and no client-side tuning removes that.

**Backpressure with nowhere to go.** The buffer fills, producers block, and agent invocations start timing out on a write they consider incidental. Decide explicitly whether a full buffer drops, blocks, or spills, and make sure the agent handles the answer.

## Operational guidance

Separate the tables agents write from the tables agents read. Write-heavy telemetry and decision tables have completely different tuning needs from the analytical tables serving queries, and putting them in one table serves neither.

Give write paths their own compute, separate from the interactive agent read path. A commit storm should not degrade query latency for people asking questions.

Monitor four numbers per table: commits per minute, first-attempt success rate, ninety-fifth percentile commit latency, and manifest count. The first-attempt success rate is your leading indicator, and it degrades before anything user-visible does.

Set alerts on manifest count growth rather than on commit failures. By the time commits fail, the feedback loop is already running.

Design for append-only first and introduce updates only where an append-based model genuinely cannot express the requirement. Most agent write patterns are event streams pretending to be state.

Put a buffer in the design from the start. Adding one after a commit storm means retrofitting every producer, and producers multiply quickly once agents are in production.

Use a REST catalog. It is where the server-side improvements land, and a client-side catalog gives you no path to them.

## Where this goes

The V4 metadata work is the structural fix. Adaptive metadata trees that inline small changes and single-file commit proposals attack the metadata write amplification directly, and they were motivated by exactly this workload shape. The proposals are in active design with running implementation work, and the direction is stable enough to plan around even though field layouts are still moving.

Server-side commit coordination will keep maturing at the catalog. Explicit isolation levels and retryable subtransactions turn conflict handling from something every client implements badly into a property of the platform.

The broader trend is that write concurrency is becoming a first-class lakehouse concern rather than a streaming-specialist one. Format designs assumed tables that changed slowly. Agents changed that assumption faster than anyone planned for, and the format is catching up to its own adoption.

## Conclusion

Iceberg's optimistic concurrency control is correct and it is not free. Under a hundred agent writers, the retry loop that keeps concurrent writes safe becomes the thing that caps throughput, and the failure arrives as congestion collapse rather than as a gradual slowdown.

The fixes are mostly about avoiding conflicts rather than handling them faster. Buffer writes so one process commits on behalf of many, which is worth more than everything else combined. Partition the write path so writers do not overlap, with hash distribution to keep file counts sane. Split high-volume producers into their own tables. Choose snapshot isolation deliberately. And model state changes as appends with a latest-row view, which removes the hardest conflict class entirely.

Then move to a REST catalog, because server-side deconfliction and commit coordination are where the ceiling actually rises, and benchmark a concurrency ramp against a table with realistic manifest counts rather than a fresh one.

Most agent write patterns are event streams wearing the costume of state updates. Recognizing that early is worth more than any tuning parameter in this piece.

## Keep Going

If this piece was useful, I have written a lot more on Iceberg internals and lakehouse operations. *Apache Iceberg: The Definitive Guide* covers snapshots, manifests, and the commit protocol in depth, and *Apache Polaris: The Definitive Guide* covers the REST catalog and the transaction work described here. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
