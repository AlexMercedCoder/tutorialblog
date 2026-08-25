---
title: "High-Throughput Branch Merging: Automating Concurrency and Conflict Resolution in Multi-Branch Iceberg Pipelines"
date: "2026-08-25"
description: "High-throughput Iceberg branch merges need conflict detection and automation. How to reconcile concurrent writes without stalling pipelines."
author: "Alex Merced"
category: "Apache Iceberg"
canonical: https://iceberglakehouse.com/posts/multi-branch-iceberg-merge-automation/
tags:
  - Apache Iceberg
  - branches
  - concurrency
  - automation
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/multi-branch-iceberg-merge-automation/).

A data engineering team of 30 has adopted Apache Iceberg's branching for everything. Each ingestion stream writes to its own branch. Each transformation job stages output on a branch and publishes to main after validation. Each engineer gets a branch per feature. On a busy day there are 40 active branches on the core fact tables, and the merge queue into main has become the bottleneck: publishes wait behind each other, a validation that ran on a branch is stale by the time the branch merges, and twice a week somebody fast-forwards over a change they did not know about.

Iceberg's branching primitives are sound. What the team is missing is the layer above them: a merge policy, an automated conflict check, a validation step that runs against the actual merge result, and a commit queue that keeps 40 writers from turning main's optimistic concurrency into a retry storm. Git solved this decade ago for source code with rebase, merge queues, and required checks. The same ideas apply to Iceberg, with one important difference: an Iceberg branch is a pointer to a snapshot, and "merging" two snapshots is not a three-way textual merge but a decision about which files and which deletes end up in the result.

This article is about building that layer. I will cover what Iceberg branches actually are and what the merge operations do at the metadata level, why the common single-branch write-audit-publish pattern does not scale to dozens of branches, how to classify conflicts by what they touch, how to automate rebasing a branch onto a moved main, what validation has to run and when, how to structure a commit queue so throughput stays high, and where table-level branching runs out and catalog-level branching begins. I work at Dremio, whose lakehouse platform is built around Iceberg and Apache Polaris, and I will note where the catalog's privileges and limits shape the design.

## What a Branch Is at the Metadata Level

An Iceberg table's metadata file holds a list of snapshots and a map of named references. Each reference is either a branch or a tag, and it points at a snapshot ID. `main` is a branch. A branch has retention properties (how many snapshots to keep, how long) that let it be garbage-collected independently of other branches. A tag is a fixed pointer that never moves.

Writing to a branch means producing a new snapshot whose parent is the branch's current snapshot and moving the branch reference to it. The write is atomic at the catalog: the commit carries a requirement that the branch reference still points where the writer last saw it, and if another writer moved it first, the commit fails and the writer retries from the new head. This is the same optimistic concurrency that protects `main`, applied per branch. Two writers on different branches never conflict with each other. Two writers on the same branch do.

Snapshots form a DAG. A branch's history is the chain of parent pointers from its head back to the snapshot where it diverged. Two branches share history up to their common ancestor and diverge after it. Every snapshot carries the full manifest list for the table state at that point, so "what is on this branch" is fully described by its head snapshot, with no need to replay a log.

That last property is what makes merging different from Git. A Git merge combines two sets of textual changes into a file. An Iceberg merge produces one snapshot that contains the right set of data files and delete files. There is no diff to reconcile at the byte level. There is a question of which files to include and whether any pair of changes is semantically incompatible.

Iceberg provides three merge-shaped operations, and understanding what each one does at the snapshot level is the foundation for everything else.

**Fast-forward** moves the target branch's reference to the source branch's head, and it is only allowed when the target's current head is an ancestor of the source's head. If `main` is at snapshot 100 and `feature` was branched from 100 and is now at 103, fast-forwarding `main` to `feature` just sets `main` to 103. Nothing is rewritten. If `main` has moved to 101 in the meantime, the fast-forward is refused, because 101 is not an ancestor of 103.

**Cherry-pick** takes one snapshot's changes (the files it added and deleted relative to its parent) and applies them as a new snapshot on the target branch. If `feature` added files F1 and F2 in snapshot 102, cherry-picking 102 onto `main` at 101 produces a new snapshot 104 on `main` whose parent is 101 and which adds F1 and F2. The cherry-pick succeeds if the added and deleted files are compatible with what `main` did between the divergence and now, and Iceberg's validation checks that (a cherry-pick of an overwrite that deleted files `main` has since rewritten fails).

**Publish changes** is the Spark procedure that cherry-picks every snapshot on a branch, in order, onto the target. It is the multi-snapshot version of cherry-pick and it is what most teams call "merge."

There is no three-way merge. There is fast-forward when nothing conflicts by construction, and cherry-pick (one or many) when the target has moved, with per-snapshot validation that refuses incompatible changes.

## Why Single-Branch WAP Stops Scaling

The pattern most teams start with is write-audit-publish on one branch per pipeline: write to a staging branch, run validation against the branch, fast-forward `main` to the branch if validation passes. It works well with a handful of pipelines and falls apart with dozens, for four reasons.

Fast-forward requires that `main` has not moved. With 40 branches, `main` moves constantly, and any branch that took longer than the interval between `main` commits cannot fast-forward. The team either serializes all publishes (throughput collapses) or falls back to cherry-pick, which brings the next three problems.

Validation on the branch is not validation of the merge result. A branch validated at its own head has been checked in isolation. After a cherry-pick onto a `main` that moved, the result contains the branch's changes plus everything `main` did in the meantime, and the combination was never validated. A row-count check that passed on the branch says nothing about whether the merged table has duplicates from an overlapping ingestion on another branch.

Cherry-pick validation catches file-level conflicts, not semantic ones. Iceberg refuses a cherry-pick that deletes a file `main` has already rewritten. It does not refuse a cherry-pick that appends rows with the same primary keys as rows another branch appended, because from the format's point of view both are valid appends. The duplicate is a business rule, and the format does not know it.

Retry storms on `main`. Even when every cherry-pick is valid, 40 writers targeting `main` all read its head, build a commit, and race. One wins, 39 retry. The retries reread metadata and rebuild the manifest list, and on a large table with slow metadata that is seconds per retry. Tail latency on publish climbs into minutes, and the pipelines that were supposed to be decoupled by branching are now coupled through the merge.

The fix is a merge layer that classifies conflicts, rebases branches before validating them, validates the actual merge result, and serializes commits to `main` through a queue that admits one at a time without making every writer retry.

## Classifying Conflicts by What They Touch

Not every pair of concurrent changes conflicts, and the merge layer's first job is to tell which pairs do. Three levels of conflict exist and they need different handling.

**File-level conflicts** are the ones Iceberg detects. Both branches rewrote or deleted the same data file (a compaction on `main` and an overwrite on the branch that both touched partition `day=2026-08-20`). Cherry-pick refuses these. The resolution is to rebase: reapply the branch's logical change against `main`'s current files rather than replaying its file-level snapshot.

**Partition-level overlaps** are pairs of changes to the same partition that are file-compatible but semantically risky. Two ingestion branches both appended to `day=2026-08-20`. Iceberg allows both appends. Whether the result is correct depends on whether the two streams carry disjoint rows. If they are two shards of one source, fine. If they are two retries of the same load, the result has duplicates. The merge layer needs a rule per table for what overlapping appends to a partition mean, and it needs to run the deduplication check on the merge result when the rule says they are risky.

**Schema and spec conflicts** are changes to the table's structure. A branch that added a column and a `main` that dropped a different column merge fine. A branch that renamed a column and a `main` that added a column with the new name do not, and Iceberg's schema evolution by field ID makes some of these subtle: the rename is a metadata change to field 7, the add is a new field 12, and the merged schema has two columns with the same name. The merge layer should refuse any cherry-pick whose snapshot changed the schema or partition spec, and route those through a separate, serialized path with a human review.

Here is how the three levels map to detection and resolution:

| Conflict level | Example | Detected by | Resolution |
|---|---|---|---|
| File-level | Branch overwrote a partition that `main` compacted | Iceberg cherry-pick validation | Rebase: re-run the branch's logical operation against `main`'s head |
| Partition overlap | Two branches appended to the same partition | Merge layer, by comparing changed partitions | Per-table rule: allow, or allow with dedup check on merge result, or refuse |
| Schema or spec | Branch renamed a column, `main` added a column with that name | Merge layer, by inspecting snapshot metadata changes | Serialize through a reviewed path, never auto-merge |
| None | Branches touched disjoint partitions, no structural change | Merge layer confirms disjointness | Cherry-pick or fast-forward, validate result, commit |

The classification is cheap. It reads the manifests of the snapshots on each side since the common ancestor and produces the set of partitions and files each side touched plus a flag for any schema or spec change. On a large table that read is the same metadata scan a query planner does, and the Iceberg v4 columnar manifest work makes it faster.

## Automated Rebase

Rebasing is the operation that makes the whole design work, and it means something specific for Iceberg: re-derive the branch's changes on top of `main`'s current head so that the result is a fast-forward or a clean cherry-pick.

The reason it is necessary is that a branch's snapshots record file-level changes, and file-level changes are only valid against the file set they were made from. If `main` compacted partition `day=2026-08-20` after the branch overwrote it, the branch's overwrite deleted files that no longer exist on `main`. Replaying the snapshot is impossible. Replaying the logical operation (overwrite `day=2026-08-20` with these rows) against `main`'s current files is fine.

That means the merge layer needs the logical operation, not just the snapshot. Two designs provide it.

The first is to record the operation alongside the branch. Every pipeline that writes to a branch also records what it did (an append of these files, an overwrite of these partitions from this source, a `MERGE INTO` with this key) in a manifest the merge layer can read. The Iceberg snapshot's `summary` map is a natural place for a compact version of this (the writer can put arbitrary keys there), and a side table is a natural place for the full version.

The second is to make the pipeline itself re-runnable against a target branch. The merge layer, on detecting a file-level conflict, asks the pipeline to re-run with `main`'s head as the base. That is the cleanest design when pipelines are idempotent and their inputs are still available, which is the common case for ingestion from object storage and less common for transformations over other tables that have since changed.

Here is a rebase loop that uses the first design, in PySpark against a table with recorded operations. The structure is what matters. The specific procedures (`cherrypick_snapshot`, `fast_forward`) are Iceberg's Spark procedures and the branch functions are standard:

```python
from pyspark.sql import SparkSession

spark = SparkSession.builder.getOrCreate()
TABLE = "lake.sales.orders"

def head(branch):
    return spark.sql(f"SELECT snapshot_id FROM {TABLE}.refs WHERE name = '{branch}'").first()[0]

def ancestor(a, b):
    """Common ancestor of two snapshots via the snapshots metadata table."""
    rows = spark.sql(f"SELECT snapshot_id, parent_id FROM {TABLE}.snapshots").collect()
    parent = {r.snapshot_id: r.parent_id for r in rows}
    seen = set()
    while a is not None:
        seen.add(a); a = parent.get(a)
    while b is not None:
        if b in seen: return b
        b = parent.get(b)
    return None

def snapshots_after(branch_head, base):
    rows = spark.sql(f"SELECT snapshot_id, parent_id, operation, summary FROM {TABLE}.snapshots").collect()
    parent = {r.snapshot_id: r for r in rows}
    chain = []
    s = branch_head
    while s is not None and s != base:
        chain.append(parent[s]); s = parent[s].parent_id
    return list(reversed(chain))

def touched_partitions(snapshot_id):
    return {r.partition for r in spark.sql(f"""
        SELECT DISTINCT partition FROM {TABLE}.entries VERSION AS OF {snapshot_id}
        WHERE status IN (1, 2)   -- ADDED or DELETED in this snapshot
    """).collect()}

def classify(branch):
    m, b = head("main"), head(branch)
    base = ancestor(m, b)
    if base == m:
        return "fast_forward", []
    main_parts = set().union(*[touched_partitions(s.snapshot_id) for s in snapshots_after(m, base)])
    branch_snaps = snapshots_after(b, base)
    structural = any(s.summary.get("schema-id-changed") or s.summary.get("spec-id-changed") for s in branch_snaps)
    if structural:
        return "structural", branch_snaps
    overlap = any(touched_partitions(s.snapshot_id) & main_parts for s in branch_snaps)
    return ("rebase" if overlap else "cherry_pick"), branch_snaps

def rebase(branch, branch_snaps):
    """Re-run each recorded operation against a fresh branch off main's head."""
    tmp = f"{branch}_rebased"
    spark.sql(f"ALTER TABLE {TABLE} CREATE OR REPLACE BRANCH {tmp}")
    for s in branch_snaps:
        op = load_recorded_operation(TABLE, s.snapshot_id)   # from the side table
        op.replay(spark, TABLE, target_branch=tmp)            # append / overwrite / merge into tmp
    return tmp

def merge_to_main(branch):
    kind, snaps = classify(branch)
    if kind == "structural":
        raise RuntimeError(f"{branch} changes schema or spec. Route to reviewed merge.")
    if kind == "rebase":
        branch = rebase(branch, snaps)
        kind, snaps = classify(branch)          # after rebase it should be fast_forward
    validate_merge_result(TABLE, branch)        # runs against the candidate, not the old branch head
    if kind == "fast_forward":
        spark.sql(f"CALL lake.system.fast_forward('{TABLE}', 'main', '{branch}')")
    else:
        for s in snaps:
            spark.sql(f"CALL lake.system.cherrypick_snapshot('{TABLE}', {s.snapshot_id})")
```

Walk through the decision. `classify` finds the common ancestor and checks whether `main` has moved. If it has not, fast-forward. If the branch changed schema or spec, refuse and route to a human. If the branch's touched partitions overlap `main`'s since the ancestor, rebase by replaying the recorded operations on a fresh branch off `main`'s head, then re-classify (which should now yield fast-forward, because the rebased branch descends from `main`'s head). Otherwise cherry-pick each snapshot. In every path, validation runs on the candidate that will actually become `main`, not on the branch as it was.

The recorded-operation replay is the piece each team writes for its own pipelines. An append replays by re-adding the same files (they still exist, appends never delete). An overwrite replays by running the overwrite's source query again against the new base. A `MERGE INTO` replays by running the merge again. Idempotent pipelines make this trivial. Non-idempotent ones need the second design, re-running the pipeline with a new base.

## Validation That Runs Against the Merge Result

The validation step is where most WAP implementations are weaker than they look, because they validate the branch rather than what `main` will become. The fix is to validate the candidate after rebase, and to run three kinds of check.

**Schema and lineage checks** confirm the candidate's schema is what the target expects (no unexpected columns, no type changes) and that the candidate's snapshot lineage is clean: every snapshot on the candidate descends from `main`'s current head, and none of them is a snapshot that was already published (a double-publish of the same branch is the most common lineage error, and it produces duplicates). These are metadata checks and they take milliseconds.

**Data quality checks** run the table's rules against the candidate branch using `VERSION AS OF` or the branch syntax. Row counts within expected bounds for the touched partitions, no nulls in required columns, referential checks against dimension tables, and, for tables where partition overlaps are allowed, a duplicate-key check on the touched partitions. These run as queries against the branch and they take as long as the queries take, which is why the merge layer should scope them to the partitions the branch touched rather than the whole table.

**Reconciliation checks** compare an aggregate on the candidate against the same aggregate on the source system for the touched partitions. Row count and a sum of a key measure against the upstream, for ingestion branches. This is the check that catches a rebase that replayed an operation against different inputs than the original.

Here is the validation as a set of scoped queries against a candidate branch:

```sql
-- Touched partitions for the candidate since main's head, from the entries metadata table
WITH touched AS (
  SELECT DISTINCT partition."day" AS day
  FROM lake.sales.orders.entries VERSION AS OF <candidate_head>
  WHERE status = 1
),

-- Duplicate check scoped to touched partitions
dupes AS (
  SELECT order_id, COUNT(*) AS n
  FROM lake.sales.orders VERSION AS OF <candidate_head>
  WHERE order_date IN (SELECT day FROM touched)
  GROUP BY order_id HAVING COUNT(*) > 1
),

-- Row count and measure sum on the candidate, for reconciliation
candidate_agg AS (
  SELECT order_date AS day, COUNT(*) AS rows, SUM(amount_usd) AS amount
  FROM lake.sales.orders VERSION AS OF <candidate_head>
  WHERE order_date IN (SELECT day FROM touched)
  GROUP BY order_date
)

SELECT
  (SELECT COUNT(*) FROM dupes)                                         AS duplicate_keys,
  (SELECT COUNT(*) FROM candidate_agg c
     JOIN upstream.orders_daily_totals u ON u.day = c.day
     WHERE c.rows <> u.rows OR ABS(c.amount - u.amount) > 0.01)        AS reconciliation_mismatches;
```

Both counts must be zero for the merge to proceed. The queries are scoped to the touched partitions so that validating a branch that changed one day does not scan five years.

The validation results are recorded against the candidate's head snapshot ID. If the merge is delayed and `main` moves again, the classification runs again, the rebase runs again, the candidate gets a new head, and the validation has to run again. A validation result is only valid for the exact snapshot it ran on. Caching it by branch name rather than snapshot ID is the bug that lets stale validation through.

## The Commit Queue

With classification, rebase, and validation in place, the last piece is the queue that admits merges to `main` one at a time without making every writer retry.

The design is a single merge worker (or a leader-elected one) that owns the right to commit to `main`. Pipelines do not commit to `main`. They finish their branch, and enqueue a merge request. The worker takes requests in order, classifies, rebases if needed, validates, and commits. Because the worker is the only committer, its commit never conflicts, and there is no retry storm. Because rebase and validation happen inside the worker after it has taken the head of `main`, they run against the true current state.

Throughput comes from three things.

Batching disjoint merges. If the next five requests in the queue touch disjoint partitions and none is structural, the worker can rebase all five onto the same head, validate them together, and commit them as a sequence of cherry-picks without re-reading `main` between them. Five merges cost one metadata read.

Parallel validation. Validation is the slow step and it is embarrassingly parallel across candidates. The worker rebases the next N candidates, kicks off their validations concurrently, and commits each as its validation completes, in queue order.

Skipping the rebase when possible. A candidate whose partitions are disjoint from everything `main` did since the ancestor does not need a rebase, only a cherry-pick. The classification step identifies these, and they are the majority for well-partitioned ingestion.

Here is the queue's admission loop:

```python
def merge_worker(queue, table, batch_size=8):
    while True:
        batch = queue.take(batch_size)               # in arrival order
        main_head = head("main")
        candidates = []
        for req in batch:
            kind, snaps = classify(req.branch)
            if kind == "structural":
                queue.route_to_review(req); continue
            if kind == "rebase":
                req.branch = rebase(req.branch, snaps)
                kind, snaps = classify(req.branch)
            candidates.append((req, kind, snaps))

        results = run_validations_concurrently([c[0].branch for c in candidates])

        for (req, kind, snaps), ok in zip(candidates, results):
            if not ok:
                queue.fail(req, reason="validation"); continue
            if head("main") != main_head:
                # a manual commit slipped in (or a previous batch member moved main); reclassify
                queue.requeue(req); continue
            commit(table, req.branch, kind, snaps)
            main_head = head("main")
            queue.succeed(req)
```

The `head("main") != main_head` check after each commit within the batch is there because each successful commit moves `main`, and the next candidate in the batch was classified against the old head. For disjoint candidates the cherry-pick is still valid, and the check is conservative. A production worker tracks the partitions committed so far in the batch and only requeues a candidate that overlaps them.

The queue itself is small: a table (an Iceberg table is fine) with one row per merge request holding the branch, the requesting principal, the enqueue time, the state, and the candidate snapshot ID validation ran against. That table is also the audit trail for every publish to `main`.

## A Day in the Merge Queue

To make the throughput argument concrete, here is what the queue looks like on the busy day from the opening, on one core fact table partitioned by day.

Forty branches are active. Twenty-eight are ingestion shards, each appending to today's partition and occasionally yesterday's for late arrivals. Eight are transformation branches that overwrite one or two partitions each. Three are engineer feature branches that touch a scattered set of partitions. One is a backfill touching six months.

The ingestion shards enqueue every few minutes. Their touched partitions overlap each other (they all append to today) but the table's rule says overlapping appends from ingestion shards are allowed with a duplicate check, so they classify as cherry-pick, not rebase. The worker takes them eight at a time, validates in parallel (each validation scans one or two partitions), and commits them as a run of cherry-picks. Elapsed time per batch is dominated by the validation, around 20 seconds, and the table admits about 24 ingestion publishes a minute with no retries.

The transformation branches overwrite partitions that a nightly compaction on `main` also rewrote, so they classify as rebase. The worker replays each one's recorded overwrite against `main`'s head on a temporary branch, re-classifies (now fast-forward), validates the candidate with a reconciliation check against the transformation's source at its pinned snapshot, and fast-forwards. Each takes a couple of minutes, mostly in the replay, and they interleave with the ingestion batches because the worker orders by arrival.

Two of the feature branches classify as cherry-pick and go through with the ingestion batches. The third changed a column type and classifies as structural. It is routed to the review queue and an engineer looks at it that afternoon.

The backfill touches everything and overlaps every other branch. The age-based priority admits it alone after it has waited 15 minutes, the worker drains the batch ahead of it, rebases it (six months of overwrites replayed against `main`, about 20 minutes), validates the touched partitions in parallel across a larger executor pool, and fast-forwards. During those 20 minutes the ingestion shards keep enqueuing and are admitted in the next batch after the backfill lands.

Here is the day's queue summary, the artifact the team reads the next morning:

| Request class | Count | Classification | Median wait | Median merge time | Failures |
|---|---|---|---|---|---|
| Ingestion shard append | 1,340 | cherry-pick (batched) | 40 s | 22 s | 3 (duplicate check) |
| Transformation overwrite | 96 | rebase then fast-forward | 3 min | 2.5 min | 1 (reconciliation) |
| Feature branch | 3 | 2 cherry-pick, 1 structural | 1 min | 25 s | 0 (1 routed to review) |
| Backfill | 1 | rebase then fast-forward | 15 min | 24 min | 0 |

Four failures out of 1,440 requests, each with a recorded reason, each fixable by the pipeline owner without touching `main`. No retry storms. No fast-forward over an unknown change. The engineer who owned the structural change got a review instead of a surprise.

## Where Table Branches End and Catalog Branches Begin

Everything above is table-level branching: branches are references inside one table's metadata. That is the right tool for staging one table's changes. It is the wrong tool for the case where a change spans several tables and has to land atomically, because there is no way to fast-forward three tables' `main` branches in one operation. A consumer can see table A updated and table B not yet.

Catalog-level branching solves this. Project Nessie, which pioneered it, versions the whole catalog: a branch is a view of every table at a point in time, a commit can touch many tables, and merging a catalog branch lands all its table changes atomically. The merge layer described here extends naturally to catalog branches (classification per table, rebase per table, one commit for the set), and the commit queue serializes catalog commits rather than table commits.

Apache Polaris, as of 1.7.0, does not have catalog-level branching. It supports table-level branches through the Iceberg REST protocol like any REST catalog, and since 1.2.0 it exposes finer-grained privileges for the operations involved: `ADD_SNAPSHOT` and `SET_SNAPSHOT_REF` are separate table-level privileges, so a principal can be allowed to write snapshots to a table without being allowed to move its references. That lets the merge worker be the only principal with `SET_SNAPSHOT_REF` on `main`, which is the RBAC enforcement of the single-committer design.

What Polaris does not have, and what a GitHub discussion in June 2026 asked for, is per-branch permissions: allowing a user to create and write branches with a prefix while restricting `main`. Dmitri Bourlatchkov and Yufei Gu both responded that this needs a general attribute-based authorization framework rather than a branch-name special case, and that OPA or Apache Ranger as an external policy engine is the near-term path since they receive the request details. For the design here, the practical consequence is that "only the merge worker moves `main`" is enforceable today through `SET_SNAPSHOT_REF` at the table level, and "engineers only touch their own branches" needs OPA if it has to be enforced rather than conventional.

Iceberg's multi-table transactions through the REST catalog's `commitTransaction` endpoint close part of the gap for the atomic multi-table publish case without full catalog branching, and Polaris supports that endpoint. A merge worker that needs to publish three tables together can commit them in one transaction, which is the atomicity without the branch-per-catalog model.

The honest summary: table branches plus the merge layer described here cover the single-table pipeline case, which is most of the volume. Multi-table atomic publishes use the REST catalog's multi-table transaction. Full catalog versioning with cross-table branches is a Nessie capability that Polaris does not have yet, and teams that need it are running Nessie or a Nessie-derived catalog for that reason.

## Branch Hygiene: Retention, Naming, and Cleanup

A merge layer that works keeps `main` healthy, and it also produces a lot of branches. Forty active branches on a busy day means hundreds of branches a week, most of them short-lived, and each one holds its snapshots out of garbage collection until it is dropped or its retention expires. Without hygiene, the table's metadata file grows with every branch ever created, and snapshot expiration stops reclaiming files because some forgotten branch still references them.

Three rules keep this in check.

Every branch has a retention policy set at creation. Iceberg branches carry `max-snapshot-age-ms`, `min-snapshots-to-keep`, and `max-ref-age-ms`. The last one is the important one for hygiene: it is how long the branch reference itself lives before expiration removes it. Ingestion shard branches should have a ref age of a day or two. Transformation staging branches, a week. Feature branches, whatever the team's review cadence is, and never unbounded.

The merge worker drops the branch after a successful merge. A merged branch has no purpose. Its snapshots are on `main` now (by fast-forward) or replicated onto `main` (by cherry-pick), and the branch reference only keeps the pre-rebase snapshots alive. Drop it in the same step that marks the request succeeded, and drop the temporary rebase branch too. Keep a tag on the merged snapshot if the team wants a durable pointer for audit, since tags are cheap and never move.

Branch names encode owner and purpose. `ingest/shard-07`, `transform/daily-agg`, `feature/alex/new-status-codes`, `backfill/2026-h1`. The merge layer's classification rules key on the prefix (ingestion shards get the overlapping-append rule, transforms get the reconciliation check), and the eventual per-prefix authorization that the Polaris discussion asked for keys on the same convention. Adopt the convention before the authorization exists, so it is enforceable the day it does.

With those in place, snapshot expiration on `main` does what it should, the metadata file stays proportional to live branches rather than historical ones, and the `refs` metadata table is a readable list of what is actually in flight.

## Failure Modes and Warning Signs

**Stale validation.** A branch was validated at snapshot 103, `main` moved, the merge rebased the branch to a new head 110, and the merge used the old validation result. The sign is a validation log entry whose snapshot ID does not match the committed snapshot's parent. Key validation results by candidate snapshot ID, never by branch name.

**Double publish.** The same branch is merged twice, or a branch that was fast-forwarded is later cherry-picked. The sign is duplicate rows in partitions the branch touched, with two snapshots on `main` that added the same files. The lineage check (every candidate snapshot must not already be an ancestor of `main`) catches it.

**Retry storm despite the queue.** Someone bypasses the queue and commits to `main` directly. The sign is the worker's `head("main") != main_head` check firing repeatedly. Enforce single-committer with `SET_SNAPSHOT_REF` on `main` granted only to the worker's principal.

**Rebase that replays against changed inputs.** An overwrite is rebased by re-running its source query, and the source table changed in between, so the rebased result differs from the original. The reconciliation check catches the mismatch. The design fix is to record the source snapshot IDs in the operation record and replay against those (using `VERSION AS OF` on the inputs) rather than against the sources' current state.

**Structural change slipping through.** A branch's `MERGE INTO` triggered a schema evolution (a new column from the source), the summary flag was not set, and the auto-merge admitted it. The sign is a schema change on `main` with no review record. Have `classify` compare the candidate's schema ID to `main`'s directly, not just read the summary.

**Branch retention expiring the ancestor.** A long-lived feature branch's common ancestor with `main` is expired by `main`'s snapshot retention, and `ancestor` returns None. The classification cannot run. The sign is merge requests failing with "no common ancestor." Set `main`'s retention longer than the longest expected branch lifetime, or require branches older than the retention window to be re-created from `main`.

**Forgotten branches pinning storage.** Storage cost on a table rises while its live data size does not. Hundreds of expired-in-spirit branches still reference old snapshots, so expiration cannot delete their files. The sign is the `refs` metadata table listing branches nobody recognizes with heads months old. Set `max-ref-age-ms` on every branch at creation and have the worker drop merged branches.

**Queue starvation for large branches.** A branch that touches every partition (a backfill) waits forever because the worker prefers batches of disjoint small merges. The sign is a request with an enqueue time hours older than everything around it. Add an age-based priority so old requests get admitted alone.

## Operational Guidance

**One committer for `main` per table.** The merge worker's principal is the only one with `SET_SNAPSHOT_REF` on `main`. Everyone else writes to branches and enqueues.

**Record the logical operation with every branch write.** In the snapshot summary at minimum, in a side table for anything that needs to be replayed. Rebase is impossible without it.

**Make pipelines idempotent and pin their inputs.** Replay against `VERSION AS OF` on the sources. That is what makes a rebase reproduce the original result.

**Validate the candidate, key by snapshot ID.** Never the branch as it was, never cached by name.

**Scope validation to touched partitions.** The `entries` metadata table tells you what the branch changed. Validate that, not the whole table.

**Route structural changes to a reviewed path.** Schema and spec changes never auto-merge.

**Set `main` retention longer than your longest branch.** Or the ancestor disappears.

**Batch disjoint merges, parallelize validation.** That is where the throughput comes from.

**Use multi-table transactions for atomic multi-table publishes.** The REST catalog's `commitTransaction` covers the case without catalog branching.

**Alert on direct commits to `main`.** The worker's head check is the detector. Every firing is a bypass.

## Where This Is Heading

Three developments will change the merge layer.

Iceberg v4's row lineage and metadata redesign. Row-level lineage (row IDs and last-updated sequence numbers, in v3) makes semantic conflict detection possible at the row level rather than the partition level: the merge layer can tell that two branches updated the same row, not just the same partition. And the v4 columnar manifest work makes the classification scan cheaper on very large tables.

Catalog-level attribute-based authorization. The Polaris discussion on per-branch permissions is a specific instance of a general need, and the community's response (a general ABAC framework, with OPA as the near-term path) points at a future where "engineers can only write branches with their own prefix" is a catalog rule rather than a convention.

Merge queues as a catalog feature. The single-committer worker described here is infrastructure every team builds separately. A catalog that offers "enqueue this branch for merge into `main` with this validation" as an API removes the need, the same way GitHub's merge queue removed the need for every repository to script its own. Nothing has been proposed. It is the obvious next thing once catalog events and multi-table transactions are standard.

The pattern underneath is that Iceberg branching has reached the point Git reached around 2010: the primitives are solid and widely used, and the value is moving to the workflow layer on top. Rebase, required checks, and merge queues made Git usable at scale for teams. The same layer, built on snapshots and references instead of commits and refs, is what makes Iceberg branching usable for a team of 30 with 40 branches.

## Conclusion

Iceberg branches are snapshot references with per-branch optimistic concurrency, and the merge operations are fast-forward (when nothing moved) and cherry-pick (when it did), with file-level validation and no three-way merge. Single-branch write-audit-publish stops scaling when `main` moves faster than branches finish, because fast-forward fails, validation goes stale, and cherry-picks race.

The layer that fixes it classifies conflicts by level (file, partition overlap, structural), rebases by replaying recorded logical operations against `main`'s current head, validates the actual merge candidate keyed by snapshot ID, and commits through a single-committer queue that batches disjoint merges and parallelizes validation. Polaris's `SET_SNAPSHOT_REF` privilege enforces the single committer. The REST catalog's multi-table transaction covers atomic multi-table publishes, and full catalog branching remains a Nessie capability.

Build the operation record, the classifier, the rebase, the scoped validation, and the queue, in that order. The 40-branch team gets a merge queue that admits dozens of publishes an hour, a validation that actually checks what lands on `main`, and a `main` that nobody fast-forwards over by accident.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg's concurrency model, branching, and the operational patterns around it. *Apache Iceberg: The Definitive Guide* (O'Reilly) covers snapshots, references, and the commit protocol in depth, and *Architecting an Apache Iceberg Lakehouse* (Manning) covers pipeline design on top of them. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
