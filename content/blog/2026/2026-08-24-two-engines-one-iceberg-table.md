---
title: "What Actually Happens When Two Engines Write the Same Iceberg Table at Once?"
date: "2026-08-24"
description: "What happens when two engines write the same Iceberg table at once: snapshot isolation, optimistic commits, conflict detection, and when retries fail."
author: "Alex Merced"
category: "Apache Iceberg"
canonical: https://iceberglakehouse.com/posts/two-engines-one-iceberg-table/
tags:
  - Apache Iceberg
  - concurrency
  - commits
  - multi-engine
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/two-engines-one-iceberg-table/).

Somewhere in your platform, right now, a Spark job and a streaming writer are heading toward the same Apache Iceberg table, and they will arrive within milliseconds of each other. Maybe it is Spark and Flink, maybe a nightly batch and a DuckDB session someone opened from a laptop, maybe two instances of the same service after a deployment overlap. Nothing coordinates them. They share no locks, no leader, no queue, and in most cases no knowledge of each other's existence. And the table comes out correct anyway, both writes present, history linear, no reader ever seeing a half-applied state.

That outcome is not luck. It is the most carefully engineered behavior in the entire format, and also the least understood, because it works well enough that most practitioners never have to look inside it, right up until the day a job starts failing with commit exceptions, or a MERGE conflicts with a compaction, or a retry storm turns a busy table into a contention experiment. On that day, the difference between a team that knows the machinery and one that trusts it blind is measured in hours of incident time, and occasionally in whether anyone can say with confidence that the data is right. This article opens the machinery all the way: snapshot isolation and what readers are promised, the optimistic commit protocol step by step, what the catalog's atomicity actually guarantees, how conflicts are detected and which operations conflict with which, what retries do and when they give up, the special cases, MERGE, compaction, streaming, where the sharp edges live, and how to configure and operate tables so that concurrency stays boring.

Disclosure, as ever: I work at Dremio and co-authored O'Reilly's books on Apache Iceberg and Apache Polaris. The protocol described here is the open specification's, identical for every engine that implements it, which is rather the point of the article.

## The Promise: What Readers and Writers Are Guaranteed

Start from the guarantees, because the machinery only makes sense as their implementation.

Readers get snapshot isolation. A query planned against an Iceberg table binds to one snapshot, a complete, immutable description of the table at a commit point, and sees exactly that state for its entire execution, no matter how many writers commit while it runs. There are no partial states to observe, because a snapshot either is the current table or is not, and the files it references are immutable. This is why long analytical queries and constant writers coexist without read locks: the reader's world was frozen the moment it planned, and writers build new worlds beside it rather than editing the one it is reading.

Writers get atomic, linear history. Every successful commit produces exactly one new snapshot, appended to a single linear sequence, and a commit either becomes the table's next state entirely or fails entirely. Two writers never interleave into one snapshot, and no sequence of failures leaves the table referencing half-written state, because data and metadata files are written before the commit and simply become orphans if the commit never lands.

And correctness under concurrency gets a precise, operation-dependent meaning. Iceberg distinguishes two isolation targets for write operations: snapshot isolation, where a write must not conflict with what it directly touched, and serializable isolation, where the outcome must be equivalent to some serial ordering of the operations. The difference sounds academic and decides real behavior: under serializable isolation, a DELETE must fail if a concurrent commit added rows matching its predicate, because a serial ordering where the delete ran second removes those rows too, while snapshot isolation lets that delete succeed against the state it planned on. Engines expose the choice per operation through table properties, and the validation logic described later is exactly the enforcement of whichever target you chose.

Hold those three promises. Every mechanism below exists to deliver them without any coordination between writers, which is the design constraint that makes the whole thing interesting: object storage offers no locks worth building on, engines share nothing, and the only rendezvous point in the architecture is the catalog, which brings us to the commit.

## And What Is Not Promised

A guarantee is only as useful as the boundaries you know it stops at, so before the machinery, the honest edges.

Atomicity is per table, classically. A pipeline committing to three tables makes three independent commits, and a failure between them leaves the tables at different logical times, consistent each, coordinated no. Workflows that need cross-table atomicity design for it, staging-and-swap patterns, downstream idempotence, or, increasingly, the REST protocol's multi-table commit capability where the catalog supports it, which extends the same optimistic transaction across tables in one atomic application. Know which of those your pipeline relies on, because "the lakehouse is transactional" gets casually stretched across this boundary in design meetings every week.

Freshness is a reader's choice, not a push. Snapshot isolation means a reader sees a consistent state, and which state depends on when it planned and whether its session caches table metadata. A long-lived session that loaded the table an hour ago and never refreshed reads an hour-old snapshot with perfect consistency and perfect staleness, and engines differ in their refresh defaults. The concurrency machinery guarantees you a coherent world, and asking "which world" is a session-configuration question worth actually answering for any dashboard or service that assumes recency.

Ordering across writers is commit order, nothing richer. The linear history records who won each race, and losing a race is not misordering, a batch job that started first and committed second is at snapshot N+1, correctly. Pipelines that need semantic ordering, apply the day's deletes before the day's inserts, enforce it in orchestration, because the table's ordering guarantee is exactly and only "one linear history of whatever landed."

And nothing above extends past the commit boundary into your application, the idempotence point developed properly in the retry section. The format hands you atomic, isolated, linear, per table. Everything you build on top of that, exactly-once pipelines, cross-table workflows, freshness contracts, is composition, and the failures that make it into postmortems are overwhelmingly composition assumed rather than composed.

## The Commit Protocol, Step by Step

Here is what a write actually does, in the order it does it, for any engine and any operation type. The choreography is identical for an INSERT from Spark, a DELETE from DuckDB, and a checkpoint commit from Flink, which is why learning it once explains every concurrency behavior you will ever observe.

Step one: refresh and plan against a base. The writer loads the table's current state from the catalog, the current metadata, whose latest snapshot becomes the write's base snapshot. Everything the writer does next, which files to rewrite, which rows match a predicate, which deletion vector to merge into, is computed against this base, and the base's identity is the fact the entire protocol will later hinge on.

Step two: do all the work, invisibly. The writer produces its files, new data files, delete files or merged deletion vectors, then the manifests describing them, then a manifest list for the prospective snapshot, all written to object storage at paths no current snapshot references. This is the expensive part, minutes of cluster time for a big job, and it happens entirely outside anyone's view: concurrent readers and writers cannot see these files, because visibility in Iceberg is membership in a committed snapshot and nothing else. A writer that dies here leaves orphan files for maintenance to sweep, and no correctness harm whatsoever.

Step three: attempt the commit, which is one atomic operation. The writer asks the catalog to advance the table from the state it based on to the state it built. The classical form is compare-and-swap on the metadata pointer: replace the current-metadata reference with my new metadata file if and only if the current reference is still the one I started from. The REST catalog form is richer and equivalent in spirit: the client sends requirements, assertions about the table state, centrally that the branch still points where the writer believed, plus updates, the new snapshot and metadata changes, and the server validates the requirements and applies the updates in one transaction. Either way, the entire concurrency question compresses into a single atomic test at a single point: is the table still what I thought it was?

Step four: succeed, or discover a race. If no one committed since the writer's refresh, the test passes, the new snapshot becomes the table, and we are done, this is the overwhelmingly common path, and its total coordination cost was one atomic operation. If another writer landed first, the test fails, cleanly and detectably, the writer's engine receives a commit failure, and the interesting part of this article begins, because what happens next is not "start the job over."

Step five: reconcile and retry against the new state. The writer refreshes to the new current snapshot and asks the deciding question: does the other writer's commit actually conflict with mine? The files it wrote in step two are usually still perfectly valid, new data files do not care what snapshot they attach to, so the retry is typically metadata-only: re-run validation checks against the snapshots that landed in between, rebuild the manifest list on the new base, and attempt the commit again. Only when validation finds a genuine semantic conflict, the concurrent commit touched what this write depends on, does the operation surface a validation failure to the application instead of retrying. The distinction between those two outcomes, retryable pointer race versus genuine conflict, is the protocol's core intelligence, and it deserves its own section.

## What the Catalog Actually Guarantees, and Why It Must

The protocol above leans its entire weight on one property: the commit test-and-advance is atomic. That property has to live somewhere real, and where it lives explains both a piece of Iceberg history and a piece of catalog evaluation.

Object storage alone does not provide it, or did not for most of Iceberg's life. The earliest deployments that tried to run tables from storage paths without a catalog service, tracking the current metadata through file naming conventions, ran into exactly the gap you'd expect: without an atomic compare-and-swap primitive, two writers can both believe they advanced the pointer, and the table's linear history quietly forks, the concurrency sin the whole design exists to prevent. The lesson hardened into doctrine: every production catalog backs the pointer swap with something genuinely transactional, a database row updated conditionally, a lock service, a storage primitive with real conditional-write semantics where the platform offers one. When you hear that the catalog is Iceberg's one indispensable service, this is the technical content of the claim: it is the home of the only atomic operation in the architecture.

The REST protocol upgraded the guarantee from a swap to a transaction. A classical compare-and-swap knows nothing but pointer equality, so any interleaving commit, no matter how unrelated, fails the test and bounces the client into a retry. The REST commit's requirements-and-updates shape gives the server semantic material: the client asserts what it depends on, the branch position centrally, and describes its changes structurally, and a capable server can do better than binary rejection. Two appends racing at a busy table can both be accepted, the server reconciling the later one against the advanced state exactly as the client-side retry does, without the round trip. This server-side deconfliction is invisible when absent and valuable when present, high-frequency writers see it as commit latency that stays flat under contention, and it belongs on the list of questions that differentiate catalog implementations, alongside a blunter one: what transactional store backs your pointer, and what are its failure modes?

One boundary keeps the picture honest: the catalog guarantees the atomicity of the advance, not the wisdom of it. Validation, the semantic conflict detection of the next section, runs in the writer, or in the server on the writer's declared behalf, against Iceberg's rules. The catalog's transactional store makes sure exactly one version of history exists. What that history means is the format's job, and the two layers failing get confused in postmortems often enough to be worth separating now: a forked history is a catalog bug, a wrong merge outcome is a validation bug, and the fix teams live in different repositories.

## Conflict Detection: Which Operations Fight, and Why

Two commits racing is normal. Two commits conflicting is specific, and the specificity is learnable, so here is the compatibility landscape operation pair by operation pair.

Appends do not conflict with appends, ever. Two writers adding new data files touch nothing the other depends on: neither read existing data to plan, neither removed anything, and both sets of new files coexist happily in a history where one commit simply lands after the other. This is why append-heavy tables, event logs, streaming sinks, sustain many concurrent writers with retries that always succeed: every race is a pointer race, never a semantic conflict. The retried writer pays a metadata rebuild and nothing more.

Appends versus row-level operations depend on the isolation target, and this is where the snapshot-versus-serializable distinction earns its keep. A DELETE planned under snapshot isolation validated only against what it touched: the files it read and rewrote or masked. A concurrent append of fresh rows, even rows matching the delete's predicate, touches none of those, so the delete commits, and the fresh rows survive, correct under snapshot semantics, since they arrived after the delete's snapshot. Under serializable isolation, the same delete must validate that no concurrent commit added matching data, because the serial ordering "append then delete" removes those rows, and finding such an append is a genuine conflict that fails the operation. Neither behavior is wrong. They are different contracts, chosen per operation via table properties, and most surprise incidents in this territory are teams discovering which contract their table had by default.

Row-level operations versus each other conflict when they touch the same files, and the mechanics differ by delete representation. Two copy-on-write operations rewriting the same data file are the clearest case: the second to commit finds its rewrite target already replaced, a file it planned to delete no longer exists in the current snapshot, and validation fails it, correctly, because its rewrite was computed against rows that have since changed. Merge-on-read narrows the collision surface, the operations write delete artifacts rather than replacing files, and v3's deletion vectors introduce a precise new contention point: at most one vector per data file means two concurrent operations deleting rows from the same file both attempt to produce "the" merged vector, the loser's vector is stale, and the retry must re-merge against the winner's vector before recommitting. Bounded, mechanical, and worth knowing when you wonder why hot-file mutation workloads retry more on v3 than appends ever did.

Everything versus compaction is the pairing that generates the most incidents, because maintenance is the one writer that touches many files while changing nothing logically. A compaction rewrites files A through J into K, and any concurrent row-level operation that planned against A through J finds its targets replaced at validation time. The protocol handles it correctly, someone retries or fails validation, and the operational pain is real: a long-running compaction and a steady mutation stream can turn into a livelock of mutual retries on a hot partition. The mitigations are scheduling and scoping, run heavy rewrites in low-mutation windows, compact partition by partition rather than table-wide, and prefer maintenance tooling that commits its rewrites in smaller batches so each race resolves quickly. Iceberg's design helps more than most: because compaction changes no logical content, engines validate it leniently in the direction that matters, an append landing mid-compaction does not invalidate the rewrite, only overlapping row-level changes do.

Schema and metadata changes ride the same protocol with the bluntest rules. A concurrent schema evolution changes the table structure everything else validated against, so the safe behavior, and the implemented one, fails racing writes for reconciliation rather than guessing. These are rare enough in practice that the rule to remember is procedural: land schema changes in quiet moments, because they briefly make every in-flight write a conflict candidate.

The summary worth internalizing: conflicts are about overlap in what operations depended on, appends depend on nothing and never lose, row-level operations depend on the files and rows they touched, maintenance depends on the files it rewrote, and the validation machinery exists to compute exactly these dependency intersections against whatever landed during the race.

The landscape compresses into a matrix, read as "what happens when the row operation races the column operation," with SI and SER marking where the isolation level decides:

| Racing pair | Append | Row-level op (same files) | Row-level op (disjoint files) | Compaction (overlapping) | Schema change |
|---|---|---|---|---|---|
| Append | Retry, always succeeds | Retry succeeds (SI) or op fails (SER, matching rows) | Retry succeeds | Retry succeeds | Fails for reconciliation |
| Row-level op | See above | Validation fails loser, replan | Retry succeeds | Validation fails one side, replan or re-run | Fails for reconciliation |
| Compaction | Retry succeeds | One side replans | Retry succeeds | One rewrite abandons, re-run | Fails for reconciliation |

The matrix's shape carries the design philosophy: most cells say "retry succeeds," the expensive cells are exactly the semantic overlaps, and nothing anywhere says "corruption" or "undefined," which is the entire achievement. Print it, and the next commit-exception incident starts from a cell instead of from scratch.

## Retries: The Part That Makes It All Practical

Optimistic concurrency without good retries is just pessimism with extra steps, so the retry layer deserves precision.

What a retry costs is the first thing to get right, because intuition overestimates it badly. The expensive artifacts, the data files, the delete artifacts, survive the failed commit untouched and unattached, so a retry re-runs validation and metadata construction, reads of the interleaving snapshots' manifests, a new manifest list, a new commit attempt, work measured in seconds against a job measured in minutes. A Spark job that computed for twenty minutes and lost a pointer race does not recompute for twenty minutes. It spends seconds reconciling and commits on the next attempt. This asymmetry, heavy work preserved, light metadata replayed, is why optimistic concurrency was the right bet for analytical tables: races are cheap to lose.

The knobs govern persistence, and they live in table properties with sensible defaults: a bounded number of commit retries, four by default in the reference implementation, with exponential backoff between attempts governed by minimum and maximum wait settings and an overall time budget. The defaults serve mixed workloads well, and two situations justify tuning: high-contention append streams, many writers, hot table, want more retries with wider backoff spread so racers desynchronize rather than stampeding in lockstep, and latency-sensitive pipelines want tighter budgets so a genuinely stuck commit surfaces quickly instead of burning the SLA in silence.

The failure taxonomy is the operational payoff, because the exceptions name their causes. A commit failure that exhausts retries says contention: too many writers landing too often for this table's commit rate, and the fixes are structural, batch writers together, widen commit intervals, shard by partition, or lift the retry budget if the contention is a transient spike. A validation failure says semantics: a concurrent commit genuinely overlapped this operation's dependencies, retrying the same plan can never succeed, and the application must replan from current state, or a human must decide which change wins. Conflating the two, treating validation failures as retryable noise, or contention as a data bug, sends the on-call down the wrong runbook, and the single most useful concurrency habit a team adopts is alerting on the two exception families separately.

The taxonomy extends into a diagnosis sequence worth writing into the runbook verbatim. On any commit-adjacent failure: first, classify the exception family, commit failure versus validation failure, from the exception type and message, which every mature engine surfaces distinctly. Second, pull the table's snapshot history for the failure window, the snapshots metadata table with operations and summaries, and identify the interleaving commits, because the "concurrent writer" in the message has a name in the summary, an application ID, a job identifier, a service principal. Third, map the pair onto the conflict matrix: an append racing your MERGE points at scheduling, a compaction racing your DELETE points at maintenance windows, a sibling instance of your own job points at a deployment overlap or an orchestrator double-fire. Nine incidents in ten resolve at step three into a calendar conversation rather than an engineering one, and the tenth, a genuine repeated semantic collision, has just been handed exactly the evidence a design fix needs.

One more retry subtlety earns its paragraph: idempotence at the application layer. The protocol guarantees the table never double-applies a commit, and it cannot know whether the application wrapped the write in its own retry loop that resubmits the whole job after a reported failure whose commit, in a cruel race, actually landed. Engines handle the common cases, and pipelines that orchestrate their own retries around write jobs should key their writes, snapshot properties carrying a job identifier make an excellent receipt, so a resubmission can detect its predecessor's success instead of appending the data twice. The table's guarantees end at the commit boundary. Exactly-once across your orchestration is yours to finish.

## A Worked Race: Spark and DuckDB, Millisecond by Millisecond

Theory lands hardest as a timeline, so run one concrete race end to end, chosen deliberately across engines to show the protocol caring nothing for the participants' sizes.

The setup: `sales.orders`, current snapshot S100 in a REST catalog. At 14:00:00.000, a Spark cluster begins a batch INSERT of yesterday's late-arriving orders. At 14:00:04.000, an analyst's DuckDB session, attached to the same catalog, runs a small INSERT of manually corrected rows. Spark's job is big, DuckDB's is tiny, and the tiny one will win the race.

14:00:00.100, Spark refreshes: base S100. It begins writing forty data files, a few gigabytes across executors.

14:00:04.050, DuckDB refreshes: base S100, the same base, since Spark has committed nothing. It writes one small Parquet file.

14:00:04.900, DuckDB commits: requirements assert the branch still points to S100, it does, updates append the file as snapshot S101. The catalog validates and applies atomically. The table is now S101, and the analyst moves on, never knowing a race existed.

14:00:31.000, Spark finishes its files and attempts its commit: requirements assert S100, and the branch now points to S101. The catalog rejects, cleanly, with a conflict the client recognizes as a retryable commit failure. Nothing Spark wrote is lost, forty files sit in storage, unreferenced and intact.

14:00:31.200, Spark reconciles: refresh to S101, examine what landed in between, one append, and ask whether an append conflicts with an append. It does not, no validation to fail. Spark rebuilds its metadata against S101 as the new base and recommits: requirements assert S101, which holds, and the table advances to S102 containing Spark's forty files.

14:00:32.000, final state: linear history S100 → S101 → S102, both writes fully present, DuckDB's commit visible to any reader from 14:00:04.900 onward, Spark's from 14:00:32.000. A reader who planned at 14:00:15 ran happily against S101 throughout, snapshot isolation in action. Total price of the race: roughly a second of Spark-side metadata work, invisible to the job's SLA.

Now replay the same timeline with one change, DuckDB's write is a DELETE of specific rows, copy-on-write, rewriting a file Spark's job also planned to rewrite in a MERGE. The pointer race plays out identically, and Spark's reconciliation now finds a genuine overlap: a file its plan deletes was already replaced by S101. Validation fails the operation, correctly, and Spark's application replans the MERGE against S101's actual rows, recomputing what its match conditions mean now. Same protocol, same catalog, opposite outcome, and the difference was entirely in the dependency overlap, which is the whole lesson of the conflict section compressed into one variation.

A third variation completes the set, because it shows the isolation dial deciding a race all by itself. Rewind again: Spark runs a DELETE of all orders for a churned customer, serializable isolation set on the table, while DuckDB's small insert happens to include one fresh order for that same customer. DuckDB lands first as before, Spark's commit bounces, and reconciliation now checks what serializable demands: did any interleaving commit add rows matching my predicate? It did, one row, and the validation fails Spark's delete even though no files overlapped at all, because the serial ordering "insert, then delete" removes the fresh row and Spark's plan does not. Flip the table to snapshot isolation, replay once more, and the identical race commits cleanly, the fresh order surviving as data that postdates the delete's snapshot. Two defensible outcomes, one property choosing between them, and if a single paragraph in this article is worth reading twice, it is the one where your table's default decided a customer's order existed.

## The Hard Cases: MERGE, Compaction, and Streaming

Three workload shapes account for most concurrency incidents, and each has a known playbook.

MERGE INTO is the maximal operation, it reads matched rows, deletes or updates some, inserts others, so its dependency footprint spans everything its ON condition touched, and its validation is correspondingly strict: concurrent changes to matched files, and under serializable semantics concurrent appends of match-eligible rows, are genuine conflicts requiring a replan, not a retry. The playbook follows from the footprint: narrow it. Partition-align your MERGE sources so each job touches a bounded partition set, run competing MERGE writers against disjoint partitions or serialize them at the orchestrator, and choose merge-on-read modes on v3 so the physical collision surface shrinks from whole files to per-file vectors. Teams that treat MERGE as "just a write" discover its footprint in production. Teams that treat it as the table's most possessive operation schedule it like one and rarely think about it again.

Compaction's playbook is scope and timing, extending the earlier analysis into practice: partition-scoped rewrites over table-wide sweeps, batch-committed progress so each commit's race window stays small, scheduling into the mutation lulls your metrics already reveal, and, where your maintenance tooling supports it, deferring hot partitions to their own quiet windows. One structural note worth adding: because rewrites are logically no-ops, losing a race costs compaction nothing but repeated work, so its retries are safe to make generous, the harm of an abandoned compaction is only that the small-file problem it targeted persists another day.

Streaming writers are a contention pattern all their own: commits on a clock, forever. A single streaming writer per table is easy, its cadence merely sets the snapshot production rate, and the design questions arrive with multiplicity, several streams into one table, or streams plus batch plus maintenance. The levers, in order of power: commit interval, since a stream committing every ten seconds versus every two minutes changes contention and snapshot volume by an order of magnitude, one-writer-per-partition topology, which converts table-level races into disjoint lanes, and consolidation, letting one sink own the table and feeding it upstream, which deletes the problem. Flink's checkpoint-aligned commits deserve their honorable mention here: tying commits to checkpoints gives the stream exactly-once semantics across failures, the stream's own receipts pattern, and means its commit cadence is your checkpoint cadence, one knob governing both correctness and contention.

The arithmetic behind the commit-interval lever deserves its numbers, because they compound past contention into every corner of table health. A ten-second cadence is 8,640 snapshots a day, 60,000 a week, each one a metadata file, a manifest list, and manifests, each one extending the history that time travel, snapshot expiration, and planning must handle, and each one a fresh chance to race every other writer on the table. A two-minute cadence is 720 a day, and a table receiving both a stream and hourly batch jobs at that cadence sees batch-versus-stream races roughly once per batch run rather than a dozen times, with each race resolved by the append-append rule anyway, cheaply. The streaming latency budget should be spent deliberately: commit as often as freshness genuinely requires and no oftener, because every unnecessary snapshot is contention surface, metadata mass, and maintenance debt purchased for nothing. This arithmetic is also exactly the pressure the v4 metadata redesign answers, and until it lands, the interval knob is the streaming team's best friend.

And underneath all three, the same hygiene: watch snapshot production rate per table, alert on the two failure families separately, and remember that every contention fix is some form of fewer, larger, or more disjoint commits.

## Try It Yourself: The Two-Terminal Experiment

Nothing builds concurrency intuition like watching a race you staged, and staging one takes fifteen minutes against any REST catalog, or a local one from a quickstart.

Terminal one, Spark, sets the table up with its concurrency posture explicit, so the experiment doubles as a properties tour:

```sql
CREATE TABLE lake.demo.race_test (
    id      BIGINT,
    payload STRING
) USING iceberg
TBLPROPERTIES (
    'commit.retry.num-retries'   = '4',
    'commit.retry.min-wait-ms'   = '100',
    'commit.retry.max-wait-ms'   = '60000',
    'write.delete.isolation-level' = 'serializable',
    'write.merge.isolation-level'  = 'serializable'
);
```

Now the race. In terminal one, start a Spark INSERT built to take a while, a SELECT generating a few million rows works. While it runs, in terminal two, a second session, a second Spark shell, or DuckDB attached to the same catalog for the full cross-engine effect, commit a quick insert of a handful of rows. The small write lands first, the big write's first commit attempt loses the pointer race, and its retry commits moments later, all of it invisible unless you look.

So look, because the snapshot history recorded everything:

```sql
SELECT snapshot_id,
       committed_at,
       operation,
       summary['spark.app.id']      AS committer,
       summary['added-records']     AS rows_added
FROM   lake.demo.race_test.snapshots
ORDER  BY committed_at;
```

Two snapshots, in commit order rather than start order, the small write first, each attributed to its committer, history perfectly linear. Re-run the experiment with variations and each one teaches a section of this article: two simultaneous DELETEs targeting the same rows shows a validation failure and its exception text, the serializable properties above versus snapshot isolation shows the append-versus-delete contract difference, and dropping the retry count to zero shows what the retry layer was silently absorbing. The whole exercise costs a coffee break and permanently upgrades every future incident conversation, because everyone in it has seen the machinery move.

## Configuring for Concurrency: The Short List

The properties and habits that decide how a table behaves under racing writers, gathered for reference.

Isolation level per operation: set delete, update, and merge isolation deliberately, serializable where correctness across concurrent appends matters, phantom-sensitive logic, financial reconciliation, snapshot where append-concurrent behavior is acceptable and throughput matters. The default serves most tables and the choice should still be on record.

Write modes: copy-on-write versus merge-on-read per operation type shapes the collision surface as much as any concurrency setting, merge-on-read narrowing physical conflicts at the cost of the delete-artifact obligations covered in this site's delete-mechanism coverage.

Retry posture: the retry count, backoff bounds, and total budget, tuned per the contention-versus-latency reasoning above, with high-writer tables getting patience and jitter, and SLA-bound pipelines getting fast surfacing.

Commit receipts: snapshot properties carrying job identifiers on every orchestrated write, so application-level retries can verify predecessors instead of double-applying.

Topology: the standing review question for any table with more than two writers, can these writers be fewer, batched, partition-disjoint, or funneled, because topology fixes outlast every parameter tune.

And observability: snapshot production rate, commit failure rate, validation failure rate, and retry counts per table, four series that turn every incident in this article from a mystery into a graph.

A last word on defaults, because most tables will never get this deliberate treatment and the protocol was built knowing it. The reference implementation's out-of-the-box posture, four retries with jittered backoff, snapshot isolation semantics tuned per operation, validation scoped to real dependencies, serves the median table well, and the median table is a few writers committing minutes apart, where races are rare and every race is cheap. The short list above exists for the tables that graduate out of the median: the hot streaming sink, the multi-team MERGE target, the table that compaction and CDC both love. Recognize graduation when it happens, the observability series above announce it, and spend the configuration effort there, on the five tables that need it, rather than spreading ceremony across the five hundred that never will. Concurrency tuning, like most tuning, pays best when it is rationed.

## Where the Protocol Is Heading

Before the future, one present capability that reframes concurrency for some workflows: branches. Iceberg's history is linear per branch, and the format supports multiple branches per table, which converts certain concurrency problems into workflow problems on purpose. A risky backfill runs on a branch, validated in isolation while the main branch serves production writers unimpeded, then merges or fast-forwards when proven, the write-audit-publish pattern. Two teams' conflicting bulk changes stop racing at commit time because they never share a branch until a human-mediated integration. Branching does not replace the optimistic protocol, every branch runs it internally, and it gives architects a second tool: where the conflict matrix predicts recurring semantic collisions, sometimes the answer is not better retries but separate branches and a deliberate merge point.

The concurrency story is stable, its guarantees have not changed in spirit since v2, and the surrounding machinery keeps improving in ways worth tracking. REST catalogs increasingly resolve races server-side: with change-based commits, the server holds the current state and the requested changes together, and non-conflicting commits can be reconciled and applied without a client round-trip per retry, trimming the tail latency of busy tables. The v4 metadata work targets commit cost directly, single-file commits and metadata whose update cost is proportional to the change, which lowers the price of every commit and especially of every retry, welcoming exactly the many-small-writers world the library era is creating. And multi-table transactions through the REST protocol extend atomicity across tables for the workflows that need it, the same optimistic pattern, wider scope. The direction across all three is consistent: keep the optimistic core, make races cheaper to lose, and move reconciliation intelligence to where the current state lives.

## Conclusion

Two engines writing one table at once resolves into a small, learnable story: each writes invisibly against a base snapshot, each attempts one atomic advance at the catalog, the loser of any race reconciles against what landed and retries its cheap metadata step, and only genuine dependency overlap, the same files, the same rows, the same semantic ground, escalates from retry to replan. Snapshot isolation keeps every reader in a consistent world throughout, the isolation level you chose defines what "conflict" means for each operation, and the whole apparatus runs without a lock, a leader, or a coordinator anywhere in sight. Learn the commit choreography once, alert on contention and validation as the different signals they are, schedule your possessive operations like the possessive operations they are, and concurrent writes stop being something you trust on faith and become something you can explain at a whiteboard, which is the only kind of trust worth having in infrastructure. And the explanation travels: the same choreography governs the biggest Spark cluster and the smallest embedded writer, today's engines and next year's agents, because it lives in the specification rather than in any implementation, and a concurrency model that every participant obeys by construction is the quiet foundation everything else in the open lakehouse stands on.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg and lakehouse architecture. *Apache Iceberg: The Definitive Guide*, which I co-authored for O'Reilly, covers snapshots, commits, and the metadata machinery this article walked through. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
