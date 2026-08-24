---
title: "Deletion Vectors vs Position Deletes vs Equality Deletes: The Iceberg Delete Story in 2026"
date: "2026-08-24"
description: "Position deletes, equality deletes, and deletion vectors compared from the Iceberg spec: what each writes, how readers apply it, and when to use which."
author: "Alex Merced"
category: "Apache Iceberg"
canonical: https://iceberglakehouse.com/posts/iceberg-delete-story-2026/
tags:
  - Apache Iceberg
  - deletion vectors
  - position deletes
  - equality deletes
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-delete-story-2026/).

Deleting a row from an immutable file is a contradiction, and every table format on object storage is, at bottom, a system for managing that contradiction gracefully. Apache Iceberg has now shipped three different answers to it: position delete files, equality delete files, and deletion vectors, with a fourth generation taking shape in the v4 design discussions. Each answer encodes a different bet about where the cost of change should land, at write time, at read time, or at maintenance time, and in 2026 all three coexist in production tables, sometimes in the same table's history, which is exactly why a canonical comparison is worth writing. Vendors quote whichever mechanism flatters their benchmark, migration guides assume whichever one their author last operated, and the spec text, precise as it is, never puts the three side by side for a decision-maker.

This article is that comparison, built from the specification outward. We will establish the shared problem and the copy-on-write baseline, then take each mechanism in turn, what it physically writes, how readers apply it, what it costs, and where it wins, before putting all three in one table, walking the transition rules that govern their coexistence, and looking at where v4 is taking the whole story. By the end, "which delete mechanism is my table using, and should it be" should be a question you can answer from metadata in minutes.

Disclosure up front: I work at Dremio, whose engine supports deletion vectors fully on v3 tables, and I co-authored O'Reilly's books on Apache Iceberg and Apache Polaris. Everything below is the open specification's story, checkable against the spec text at iceberg.apache.org.

## The Shared Problem, and the Baseline Everyone Forgets

Data files in a lakehouse are immutable by design: Parquet in object storage gets written once and read forever, which is what makes concurrent readers safe, caching trivial, and snapshots meaningful. Row-level change, a DELETE matching some rows, an UPDATE, a MERGE applying a change stream, has to be expressed without touching the files that hold the rows.

The baseline answer, and still the right one for plenty of tables, is copy-on-write: rewrite every affected data file with the deleted rows omitted and the updated rows replaced, commit the new files, drop the old ones from the snapshot. Reads stay perfectly clean, every file is exactly its live rows, no merging, no overhead, and writes carry the whole burden, since deleting one row from a gigabyte file means rewriting a gigabyte. For batch tables that change rarely and get read constantly, copy-on-write remains the correct default, and every mechanism below should be understood as an alternative you adopt when write amplification starts to hurt, not as a universal upgrade.

Iceberg makes the choice per operation type through table properties, delete, update, and merge modes each configurable as copy-on-write or merge-on-read, which turns the framing above into an actual dial rather than a philosophy. The decision arithmetic is a ratio: mutation frequency and touched-data volume against read frequency and latency sensitivity. Nightly batch corrections touching a fraction of files, read by dashboards all day: copy-on-write, pay the rewrite once at 2 a.m., serve clean files forever. Minute-level CDC touching hot files constantly: merge-on-read, because rewriting gigabytes per minute is not a plan. Mixed tables legitimately split the dial, deletes copy-on-write because they are rare and large, merges merge-on-read because they are constant and small. Every recommendation later in this article assumes you have consciously set this dial, because the most expensive delete configuration in the wild is the one nobody chose.

Everything else in this article is merge-on-read: the family of designs where writers record deletes as separate artifacts, cheap to produce, and readers merge those artifacts against data files at query time, reconstructing the live table on the fly. Merge-on-read moves cost from the write path to the read path and to the maintenance calendar, and the three mechanisms are three different contracts about how that movement works. Iceberg tracks all of them the same way at the metadata level, delete artifacts live in delete manifests parallel to the data manifests, scoped by partition and governed by sequence numbers, so the differences live in what the artifacts contain and how expensively readers consume them.

One more shared concept before the mechanisms, because all three depend on it: sequence numbers. Every snapshot in a v2-or-later table carries a sequence number, and every data and delete file inherits one. Deletes apply only to data written before them, expressed as: a delete file applies to a data file when the delete's sequence number is high enough relative to the data file's. This ordering is what lets a delete written on Tuesday ignore data appended on Wednesday, and it is the quiet machinery underneath every correctness statement below.

## Position Deletes: The V2 Workhorse

Position deletes were v2's general-purpose answer, and understanding them precisely matters even in 2026, because an enormous installed base of v2 tables runs on them and their v3 successor is defined by their shortcomings.

What gets written: a position delete file is itself a valid Iceberg data file, Parquet by convention, whose rows are pairs of `file_path` and `pos`, this row position in this data file is deleted, with the option of carrying the deleted row's values alongside. The spec pins down the discipline: position deletes must be sorted by file path and position, and they carry no table sort order, readers must ignore sort order metadata on them. A single position delete file can reference many data files, and its manifest entry can name a single referenced data file when all its deletes target one, a hint that lets planners associate deletes with data files without opening them.

How readers apply them: during scan planning, delete files are matched to the data files they cover, by partition, by sequence number, and by the referenced-file hint where present. At read time, the engine loads the relevant positions and skips those row numbers while scanning the data file. The mechanics are simple, and the cost structure is where the trouble lives.

The accumulation problem is the defining flaw. Nothing in v2 requires a writer to consolidate deletes, so every mutation commit adds new delete files, and a data file that gets touched by many small operations accrues many delete files, each of which every subsequent read must fetch, decode, and merge. A CDC-style workload deleting a few rows per commit against the same hot files turns each read into a fan-out: one data file, N delete files, N growing without bound until compaction intervenes. Read amplification scales with mutation history rather than with live deletes, which is a miserable property, and the operational consequence was that v2 merge-on-read tables lived and died by their compaction schedules.

The second flaw is subtler: positions are fragile coordinates. A position delete's meaning depends on the exact data file it references, so any rewrite of that data file, compaction most commonly, invalidates the positions and forces the maintenance process to resolve deletes into the rewritten output. That is workable, compaction does exactly this, and it means position deletes are always coupled to the physical layout in a way that makes every layout change a delete-processing event too.

Where they still belong: existing v2 tables, full stop. Position deletes remain fully valid in v2, engines support them maturely, and a stable v2 deployment with a healthy compaction cadence is not an emergency. The spec's own trajectory tells you the future, though: position delete files are formally deprecated in v3, existing ones remain readable, and new v3 deletes take the form described two sections down. The workhorse earned retirement by defining the job its successor was built for.

The accumulation problem deserves its arithmetic, because the numbers explain a decade of on-call rotations better than any adjective. Take a modest CDC feed committing once a minute, each commit deleting or updating a handful of rows scattered across the table's hot partition, ten data files, say. Each commit adds delete files covering the touched data files. After one day: 1,440 commits, and the hot files each carry delete artifacts numbering in the hundreds. After a week without compaction: several thousand mutation commits, each hot data file dragging a train of delete files that every single read must list, fetch, decode, and merge before returning a row, with the storage system billing per request the whole way. Now put the same feed on deletion vectors: after the same week, each hot file carries exactly one bitmap whose size grew by bytes per mutation, and read cost is indistinguishable from day one. The v2 curve is linear in mutation count and the v3 curve is flat, and every operational war story about merge-on-read tables "suddenly" getting slow is a team discovering which curve it was on. Compaction was v2's answer, and a good one, and the difference between "compaction keeps the table healthy" and "compaction races the workload for the table's usability" is the difference the arithmetic just drew.

## Equality Deletes: The Write-Side Escape Hatch

Equality deletes answer a different question: what if the writer cannot know positions at all?

What gets written: an equality delete file records deleted rows by value rather than by location, a set of equality field IDs naming which columns constitute identity, and rows containing the values, delete every row where `customer_id = 42`, expressed as data. Like position deletes, equality delete files are valid Iceberg data files and can carry a sort order. Their applicability follows sequence numbers with the strictness the semantics demand: an equality delete applies to data files with strictly lower sequence numbers, so a delete and an insert of the same key in the correct order resolve correctly.

Why they exist is best seen from a streaming CDC writer's seat. A Flink job applying an upstream change stream receives "row with key K was deleted or updated" and has no idea which data file, let alone which row position, holds K, and finding out means reading the table, which a high-throughput streaming writer cannot afford per event. Equality deletes let it declare the delete by key and move on: write cost near zero, no lookup, no read of existing data. This is the mechanism as a deferral instrument, the writer records intent, and the expensive reconciliation happens later, at read time or at compaction.

The read-side bill is proportionally brutal. Applying an equality delete means evaluating a predicate against candidate rows, every row of every data file the delete's partition scope and sequence number cover, since values give the reader none of the pruning that positions gave. Statistics help bound the candidates, and the fundamental shape remains: equality deletes convert reads into join-like work, and a table accumulating them without compaction degrades faster and less predictably than the position-delete equivalent. Everyone who has operated a Flink-into-Iceberg upsert pipeline knows the signature: write throughput looks wonderful, read latency decays weekly, and the compaction job that resolves equality deletes into concrete form is the actual heart of the system.

Where they belong in 2026: as a buffer, not a resting state. Streaming and CDC writers that genuinely cannot afford key lookups use equality deletes as the landing format, and a scheduled process promptly resolves them, into rewritten files or into deletion vectors on v3, so readers rarely meet them raw. Treated as a short-term buffer with an enforced half-life, they are a legitimate tool. Treated as a steady state, they are deferred pain with interest, and the v4 discussions covered later are moving toward retiring them precisely because too many tables discovered the interest rate the hard way.

## One DELETE, Three Ways

Before the third mechanism, ground the first two with a single concrete statement traced through each regime, because the mechanisms feel abstract until you watch them produce files.

The statement: `DELETE FROM orders WHERE order_id = 8675309`, one row, living at position 41,207 of a 512 MB data file that holds 4 million rows, in a table of 2,000 such files.

Copy-on-write: the engine plans the delete, statistics identify the one candidate file, and the write rewrites it, 512 MB read, roughly 512 MB written as a new file omitting one row, one commit swapping new file for old. Artifacts produced: one full-size data file. The next read sees a perfectly clean table and pays nothing extra, forever. The bill was the half-gigabyte rewrite for a 100-byte row, and whether that offends you is precisely the copy-on-write question.

V2 merge-on-read with position deletes: same planning finds the file and the row's position, and the write emits a tiny Parquet delete file containing one pair, the data file's path and position 41,207, plus a commit. Artifacts produced: one delete file of a few kilobytes. The next read of that data file fetches and applies the delete file, trivial at count one, and here is the regime's character: run this statement pattern hourly against the same hot file for a month and the artifacts number in the hundreds, each read paying the whole stack, until compaction resolves them.

V3 merge-on-read with a deletion vector: planning finds file and position as before, and the write consults the file's existing vector, none yet, so it creates one, a Roaring bitmap with bit 41,207 set, stored as a blob in a Puffin file, with the manifest entry pinning the referenced data file and the blob's exact offset and length. Artifacts produced: one bitmap blob measured in bytes. The next read fetches the bitmap by offset and masks the scan. Now run the hourly pattern for a month: each subsequent delete merges its position into the existing bitmap and writes the replacement, so after seven hundred mutations the artifact count for that data file is still exactly one, its size still trivial, and the read-side cost identical to day one. Same statement, three regimes, and the third is the only one whose costs do not compound with history.

## Deletion Vectors: The V3 Settlement

Deletion vectors are v3's answer to the accumulation problem, and they change the contract rather than just the encoding.

What gets written: a deletion vector is a bitmap of deleted row positions for exactly one data file, a set bit at position P means row P is deleted, encoded as a Roaring bitmap and stored as a `deletion-vector-v1` blob inside a Puffin file, Iceberg's extensible sidecar format. The manifest entry for a vector is unusually prescriptive: the referenced data file is required, and the entry carries the blob's content offset and size, which must exactly match the offset and length in the Puffin footer, so a reader goes from manifest entry to bitmap bytes in one ranged read with no discovery step. Blob metadata carries the cardinality, how many rows the vector deletes, which flows into planning and auditing. Multiple vectors, for different data files, can share one Puffin container, so a commit deleting rows across fifty files writes one physical sidecar, not fifty.

A word on Puffin, since deletion vectors made it load-bearing and plenty of practitioners meet it here first. Puffin is Iceberg's sidecar file format, a container of typed blobs with a footer indexing each blob's type, offset, length, and properties, originally introduced to carry statistics artifacts like sketches. Vectors fit it naturally: a bitmap is a blob, the footer gives exact addressing, and the container amortizes overhead when one commit produces vectors for many files. The design choice worth appreciating is the required exactness, manifest entries must carry offsets and sizes that match the Puffin footer precisely, which makes reading a vector a single ranged GET with integrity checks built in, no listing, no scanning a sidecar for the right blob. It is a small decision that keeps the fast path fast at exactly the layer where object storage latency lives.

The behavioral rule is the actual innovation: at most one deletion vector per data file per snapshot, enforced on writers. A writer deleting rows from a file that already has a vector must merge, OR the new positions into the existing bitmap and write the merged result, rather than adding a second artifact. A writer creating a vector for a file that has legacy position deletes must absorb them into the vector, and from then on readers holding the vector ignore those position delete files entirely. And a writer removing a data file must remove its vector with it. Every rule points the same direction: the delete state of a data file is a single, current, self-contained object, maintained by writers as they go.

Follow the consequences through the read path and the v2 pathology simply vanishes. A data file has zero or one vectors, so read-side merge cost is bounded per file regardless of how many mutation commits its history absorbed: a thousand small deletes over a month is still one bitmap, fetched by offset, applied as a mask during the scan. Roaring encoding keeps the bitmap compact whether deletes are sparse or dense, and applying a bitmap mask is about the cheapest merge operation an engine can be asked to perform, orders simpler than position-list merging and incomparably cheaper than equality predicates. Merge-on-read tables stop degrading with mutation frequency, which is the property that finally makes them boring to operate.

The costs moved, as costs do, to the write path, and honesty requires itemizing them. The merge obligation means a deleting writer reads the existing vector before writing the merged one, a small ranged read, and a real step. Positions must be known, so a DELETE by predicate still performs the find-the-rows work, with partition pruning and statistics narrowing candidates first, and writers that cannot afford that lookup still reach for equality deletes as the buffer. And the one-vector rule turns concurrent deletes against the same data file into genuine write conflicts to be resolved by retry, since two writers cannot both produce "the" vector for a file, a topic that belongs to concurrency's article rather than this one, and worth flagging on the ledger.

Maturity status, dated carefully because this is the part that ages: the v3 specification is ratified with deletion vectors at its center, the 1.10.2 release, shipped this past spring, carried DV-related correctness fixes, the sign of production hardening in progress, and 1.11.0 stabilized v3 features including deletion vectors as production-ready defaults, with the reference implementation, Spark integration, and a widening circle of engines and managed services writing and reading them. The circle is not yet the whole ecosystem: prominent engines still track DV read support in open issues, and a table using vectors is readable only by the readers that speak them, so the four-capability audit, read, write, delete, and now DV-specific support, belongs in any v3 migration plan. The direction has no ambiguity left in it. The timing, per fleet, still requires a checklist.

One clarification pays for itself in design reviews: everything above about deletes covers updates too, because a merge-on-read UPDATE is a delete plus an insert. `UPDATE orders SET status = 'shipped' WHERE order_id = 8675309` under v3 sets the row's bit in the file's vector and appends a new row with the new values to a fresh data file, and MERGE INTO applying a change stream does the same at scale, vectors marking superseded rows, appends carrying replacements. This is why update-heavy workloads, CDC mirrors above all, are where the vector economics shine brightest, and why the read-side gauge for such tables is masked-row fraction: a file whose vector has superseded most of its rows is mostly dead weight per scan, and rewriting it reclaims the read cost even though nothing is "wrong."

## The Three Mechanisms, One Table

With all three established, here is the comparison the article's title promises, dimensions chosen for decision-making rather than trivia:

| Dimension | Position deletes (v2) | Equality deletes (v2, v3) | Deletion vectors (v3) |
|---|---|---|---|
| Identifies rows by | File path and row position | Column values | Bit positions, one file's bitmap |
| Physical form | Parquet delete file, sorted by file and position | Delete file of key values plus field IDs | Roaring bitmap blob in Puffin |
| Artifacts per data file | Unbounded, grows with mutation history | Unbounded, partition-scoped | At most one, enforced |
| Write cost | Moderate: positions must be found | Minimal: no lookup at all | Moderate: positions found, vector merged |
| Read cost | Grows with delete-file count | Highest: predicate evaluation over candidates | Lowest and bounded: one bitmap mask |
| Behavior under frequent small deletes | Degrades steadily | Degrades fastest | Stays flat |
| Maintenance role | Compaction consolidates and resolves | Compaction is load-bearing, resolves values to concrete form | Compaction optional sooner, rewrites absorb vectors |
| Natural workload | General v2 DML | Streaming and CDC upserts as a buffer | General v3 row-level change |
| Spec status in 2026 | Deprecated in v3, valid in v2 | Valid, retirement discussed for v4 | The v3 direction, stabilized in 1.11 |

Two readings of the table are worth spelling out. Read the rows about artifact count and read cost together and you get the whole architectural story: v2's mechanisms let delete state fragment without bound and asked readers to pay for the fragmentation, while v3's mechanism forbids the fragmentation and asks writers to maintain consolidation continuously. It is the classic systems trade of amortized-later versus incremental-now, and v3 chose incremental-now because a decade of operating v2 tables demonstrated that "later" reliably arrived at the worst time.

Read the workload row and the practical guidance falls out. General row-level change on v3: deletion vectors, no real debate. High-throughput streaming upserts: equality deletes at the boundary, resolved on a short leash. V2 tables: position deletes with disciplined compaction until the v3 migration, which this table should make easier to justify. And any table where mutations are rare and reads are heavy: revisit copy-on-write before reaching for merge-on-read machinery at all, because the cheapest delete artifact is the one never written.

## Coexistence: How the Mechanisms Interact in Real Tables

Real tables carry history, and the transition rules for mechanisms meeting inside one table are where practitioners actually get bitten, so walk them explicitly.

Position deletes meeting deletion vectors resolves cleanly, by spec, in the vector's favor. A v2 table upgraded to v3 keeps its existing position delete files, which remain valid and applied. The moment a v3 writer creates a vector for a data file, it must fold that file's existing position deletes into the bitmap, and readers holding the vector ignore the superseded position files for that file. There is never a moment where a reader must combine both representations for one data file, which is the property that makes gradual migration safe: the table converts file by file, as mutations touch files, and a maintenance rewrite converts the remainder on your schedule rather than in one risky event.

Equality deletes meeting either positional mechanism is a different relationship, because equality deletes are not superseded, they are resolved. An equality delete stays live, applying its predicate against covered data, until some process, a compacting rewrite, or a writer that translates it, converts its meaning into concrete form: rewritten files without the rows, or vectors marking the positions. Until that resolution, the equality delete taxes every read it covers, including reads of files that also carry vectors, since the mechanisms answer different questions and both must be honored. The operational translation: on a v3 table fed by an equality-writing stream, watch two gauges, vector coverage, which should trend toward all mutated files, and outstanding equality delete count and age, which should stay near zero, because that second gauge is the honest measure of your resolution process keeping up.

Sequence numbers referee everything throughout, and one worked miniature shows the choreography. A data file lands at sequence 10. An equality delete for key K lands at 12, covering the file. A vector for the file lands at 15, marking other rows. A new data file containing a fresh row for K lands at 17. Correct reads apply the equality delete to the sequence-10 file but not the sequence-17 one, strictly-lower semantics, apply the vector's mask to the old file, and serve the new K untouched. Every engine claiming delete support implements exactly this arbitration, and cross-engine delete bugs, historically, have lived precisely in these interactions, which is why the conformance materials for deletes lean so heavily on mixed-mechanism fixtures.

And compaction sits underneath all three as the universal resolver. A rewrite of data files applies every artifact, masks vectors, drops positioned rows, evaluates equality predicates, and emits clean files with no delete artifacts at all, resetting the merge-on-read clock. The difference across mechanisms is only how much depends on it: v2 position tables need it on a cadence, equality-buffered tables need it as a component of correctness-adjacent hygiene, and vector tables need it eventually, when masked-row fractions or file sizes justify, which is a scheduling luxury the other two never offered.

The coexistence rules also hand you the v2-to-v3 migration playbook, so state it as steps. First, complete the reader audit from the cross-engine section, since format version is a table-wide door that opens for writers and readers together. Second, flip the table's format version, a metadata change, with existing files, delete files included, untouched and valid. Third, let normal mutations begin converting hot files, each new delete creating a vector that absorbs the file's position deletes per the supersession rule. Fourth, when convenient, run a maintenance rewrite over the remaining position-delete-bearing files to finish the conversion on your schedule. Fifth, watch the inventory queries from the next section confirm position-delete counts trending to zero. No dual-write period, no big-bang rewrite requirement, no reader-visible cutover: the supersession semantics were designed so that the migration is a gradient, and tables that treat it as one report the least eventful format upgrades in recent memory.

## Reading Your Own Table's Delete Story

The comparison becomes actionable the moment you can interrogate a real table, and Iceberg's metadata tables make it a five-minute exercise.

Start with the delete inventory. The files and entries metadata tables expose content type per tracked file, data versus position deletes versus equality deletes, and for vectors, the referenced data file, blob offsets, and cardinality ride the same metadata. In Spark SQL against the metadata tables, the census is one query:

```sql
-- Delete artifact census: content 0 = data, 1 = position deletes,
-- 2 = equality deletes (vectors ride position-delete entries in v3)
SELECT content,
       count(*)                    AS file_count,
       sum(record_count)           AS total_rows
FROM   lake.sales.orders.files
GROUP  BY content;

-- Ratio and hot spots: which data files carry the most delete pressure
SELECT count(*) FILTER (WHERE content != 0) * 1.0
       / nullif(count(*) FILTER (WHERE content = 0), 0)
       AS delete_to_data_ratio
FROM   lake.sales.orders.files;
```

Three aggregate numbers characterize the table immediately: count of delete artifacts by type, ratio of delete artifacts to data files, and total deleted-row cardinality against live rows. A v2 table showing five position delete files per data file has told you its compaction story without a single query plan. A v3 table showing vectors on 40 percent of files with tiny cardinalities has told you it mutates lightly and evenly.

Then read the trend, not the snapshot. Sample the same aggregates across recent snapshots, the snapshots metadata table gives the timeline, and the derivative answers the operational question: is delete state accumulating faster than maintenance resolves it? A flat artifact-per-file ratio is a healthy table under any mechanism. A climbing one names its own fix, tighter compaction for position deletes, a faster resolution leash for equality deletes, and for vectors, usually nothing, which is the entire point, but occasionally a masked-fraction check, since a file whose vector deletes most of its rows is paying full read cost for a sliver of live data and wants rewriting on those grounds.

Close with the workload cross-check, because tables inherit mechanisms from their writers, not from their needs. List the writers, the engines and jobs committing mutations, and ask whether each one's mechanism matches the table's read profile using the comparison table above. The commonest mismatches found this way: a streaming job writing equality deletes into a table whose resolution process quietly stopped months ago, and a v3-capable fleet still writing v2-style artifacts because one table property was never flipped. Both are fixed in an afternoon and found only by looking.

## The Cross-Engine Dimension

Delete mechanisms are also where multi-engine tables get tested hardest, and the 2026 support picture deserves its own honest paragraph cluster.

Delete correctness is the least uniform capability in the ecosystem, and it decomposes further than "supports deletes" suggests: reading position deletes, reading equality deletes, reading vectors, writing each, and handling the mixed-mechanism interactions from the coexistence section are separate engineering efforts that engines complete at different times. The reference implementation and the major managed platforms sit at the front, the native libraries publish their delete-handling status in capability matrices and sequence write support behind read support, and even prominent engines carry open issues for vector reads, with the failure mode stated plainly in their own trackers: a reader that ignores vectors on a v3 table returns deleted rows as live, wrong answers, not errors. That last sentence is why this dimension outranks most others in migration planning.

The planning consequence is a rule simple enough to enforce mechanically: a table's delete mechanism must be within the capability envelope of every reader that touches it, not just every writer. Before flipping a shared table to v3 vectors, enumerate the readers, the BI connector, the ML pipeline's library version, the partner's engine, and confirm vector reads for each, because the writer fleet being ready is the easy half. Where a laggard reader matters, the coexistence rules offer the bridge: keep the table's mutations flowing through copy-on-write or resolved-promptly patterns so delete artifacts stay rare, migrate the reader, then let vectors carry the load. Multi-engine tables move at the speed of their slowest reader, and delete mechanisms are where that speed limit binds first.

The encouraging trend line belongs in the same picture: the gap between spec ratification and broad engine support has been shrinking format-cycle over format-cycle, the conformance fixture work leans heavily on mixed-delete cases precisely because this is where drift historically lived, and vectors' design, one artifact, exact addressing, simple application, makes them easier to implement correctly than the mechanisms they replace. The delete story's cross-engine chapter has always been its roughest. It is also the one improving fastest, and the arrival of a mechanism simple enough to implement quickly is a large part of why the improvement is accelerating rather than merely continuing.

## Where V4 Is Taking the Delete Story

The delete story is not finished, and the v4 design conversation shows the community metabolizing a decade of operational lessons into the next contract.

The clearest signal is the move to retire equality deletes. The reasoning follows directly from this article's ledger: a mechanism whose write-side economy is paid for by unbounded read-side and maintenance-side obligation has proven, at fleet scale, to be a trap that too many teams fall into, and the streaming use case it serves is better met by writers buffering briefly and emitting positional artifacts, especially as vector support and faster lookup paths mature. For streaming teams, the practical takeaway is directional rather than urgent: design new pipelines so that equality deletes, if used at all, are an internal buffering detail with a short, enforced lifetime, and you will be aligned with where the format is going regardless of when the retirement lands.

The second thread extends the vector idea toward updates. Deletes and updates share machinery, an update is a delete plus an insert, and v4-orbit proposals explore making change cheaper at finer grain: column-level updates that avoid rewriting whole rows, mechanisms sketched alongside the column-family ideas, and metadata restructuring so that a small mutation's commit cost is proportional to the mutation rather than to the table. The unifying principle across the proposals is the same one deletion vectors embodied at file scope, keep change state consolidated, current, and cheap to apply, promoted to table scope.

A third thread connects deletes to lineage, and it previews where row-level change intersects the AI story. V3 introduced row lineage, stable row identities that survive rewrites, and lineage plus a clean delete mechanism is what makes change streams first-class: downstream consumers, CDC mirrors, incremental pipelines, feature stores, agent audit trails, can ask "what changed between these snapshots" and receive precise answers, superseded rows identified by identity rather than reconstructed by diffing. The one-vector-per-file rule quietly helps here too, since comparing a file's previous and current vector states yields the delta directly, blob metadata cardinality included, without replaying delete files. The delete mechanisms started as a way to make mutation possible. The v4-era framing treats them as half of a change-data interface, which is a promotion worth noticing.

Timelines for v4 are the community's to set and history counsels patience measured in release cycles, so the 2026 planning stance writes itself: adopt v3 vectors now for tables that mutate, treat equality deletes as a disciplined buffer where streaming demands them, and follow the v4 delete threads as a preview of obligations, not as something to wait for.

## Recommendations, Condensed

For teams that want the article as a checklist:

New tables with row-level change: create on v3, let vectors be the delete mechanism, verify every reader in the fleet speaks them before the first production mutation, and schedule maintenance from day one even though vectors make it less urgent.

Existing v2 merge-on-read tables: audit the delete inventory this week, tighten compaction if the ratio is climbing, and plan the v3 upgrade with the file-by-file migration path in mind, upgrading the format version, letting mutations convert hot files, and sweeping the rest with a rewrite when convenient.

Streaming and CDC pipelines: keep equality deletes at the edge with an enforced resolution cadence measured in hours, monitor outstanding equality artifact age as a first-class metric, and evaluate whether newer writer capabilities let the pipeline emit vectors directly, shrinking the buffer's role.

Read-heavy, rarely mutated tables: run the copy-on-write math before adopting any of this machinery, because a monthly rewrite is simpler than the best merge-on-read setup, and simplicity compounds.

And for everyone: put the three delete-inventory aggregates on a dashboard per important table, because every failure mode in this article announces itself there first, weeks before it announces itself in query latency. The dashboard costs one scheduled metadata query per table, which is the best price-to-prevention ratio available anywhere in lakehouse operations, and the habit generalizes: teams that read their tables' metadata routinely stop being surprised by their tables, on deletes and on everything else.

## Conclusion

Three mechanisms, one contradiction managed three ways. Position deletes made row-level change possible on immutable files and let its cost fragment across unbounded artifacts. Equality deletes bought streaming writers a nearly free write and sent readers the bill with interest. Deletion vectors closed the loop, one current bitmap per file, maintained by writers, cheap for readers, and turned merge-on-read from a compaction-dependent gamble into a bounded, boring default, which is why v3 built its delete story around them and v4 is extending their logic rather than replacing it. Know which mechanisms your tables carry, read the inventory rather than assuming, match writers to workloads deliberately, and the delete story stops being something that happens to your tables and becomes something you chose.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg and lakehouse architecture. *Apache Iceberg: The Definitive Guide*, which I co-authored for O'Reilly, covers the specification's delete machinery, metadata design, and maintenance practices in depth. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
