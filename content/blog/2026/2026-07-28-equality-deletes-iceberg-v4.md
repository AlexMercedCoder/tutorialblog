---
title: "Why Iceberg V4 Wants to Retire Equality Deletes, and What Streaming Teams Should Do About It"
date: "2026-07-28"
description: "Equality deletes made streaming upserts into Iceberg practical at the cost of read performance. V4 proposes retiring them in favor of deletion vectors with an async conversion path."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Streaming
  - Data Engineering
  - Deletion Vectors
canonical: "https://iceberglakehouse.com/posts/equality-deletes-iceberg-v4/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/equality-deletes-iceberg-v4/).

# Why Iceberg V4 Wants to Retire Equality Deletes, and What Streaming Teams Should Do About It

A Flink job writes upserts into an Apache Iceberg table at a few thousand rows per second. The write side looks healthy. Checkpoints land on time, the sink commits without backpressure, and the ingestion dashboard is a flat green line. Then an analyst runs a count on the same table and waits ninety seconds for a number that used to come back in four.

Nothing broke. The table accumulated equality delete files, and every reader now pays for them.

I have watched this exact shape of problem land on data teams for years, and the reaction is almost always the same. Somebody tunes the compaction schedule. Somebody else adds a filter. A third person proposes moving the table off Iceberg entirely because "the format has a delete problem." The real answer sits one layer down, in how Iceberg chose to represent row-level deletes in 2021 and how that choice is being revisited right now in the V4 specification discussion.

I work at Dremio, which builds a query engine and lakehouse platform on top of Iceberg, so I have a commercial interest in this format. The mechanics below come from the Iceberg spec and the public dev list, and you can check every one of them yourself.

This piece covers what equality deletes are, why they were a reasonable idea, why the community is moving to remove them, and what a streaming team should do between now and then.

## Where row-level deletes came from

Iceberg version 1 had no concept of deleting a row. Tables were collections of immutable data files, and changing anything meant rewriting whole files. That model is called copy-on-write. It is simple, it produces fast reads, and it works well when updates are rare and batched.

Copy-on-write falls apart under change-data-capture workloads. A CDC stream from an operational database delivers a trickle of updates spread across the entire key space. One update to a customer record forces a rewrite of a 512 MB Parquet file to change forty bytes. Do that a thousand times an hour and the write amplification becomes the entire cost of the pipeline.

Version 2 of the spec introduced merge-on-read. Instead of rewriting a data file, a writer records the fact of a deletion in a separate delete file. Readers combine the data files with the applicable delete files at query time and produce the correct result. The write gets cheap. The read pays a tax, and a background compaction job is supposed to pay that tax down.

That bargain is sound. The trouble lies in the two very different ways V2 lets a writer record a deletion.

## Three representations, one job

Iceberg supports three encodings for row-level deletes, and their differences drive everything else in this article.

**Position delete files** mark a row as deleted by naming the data file path and the ordinal position of the row inside it. Row 4,182 of `data-0007.parquet` is gone. This is precise and cheap to apply on read, because a reader that is already scanning `data-0007.parquet` knows its row positions and can skip the marked ones directly.

**Equality delete files** mark a row as deleted by column value. Any row where `customer_id = 12345` is gone. The writer does not need to know where that row lives, which is the entire point.

**Deletion vectors** arrived in V3. A deletion vector is a compact bitmap of deleted row positions for exactly one data file, stored in a Puffin file. The spec allows at most one deletion vector per data file per snapshot, and delete manifests track each vector by its containing file location, the starting offset of the blob, and its length in bytes.

The V3 spec deprecated position delete files outright. New tables on V3 write deletion vectors for positional deletes, and when a writer creates a vector for a data file it has to absorb any position deletes that already applied to that file. A reader holding the vector ignores the older position delete files for that data file. There is never a case where a reader has to merge both representations for one file.

Here is the comparison that matters operationally.

| | Position delete files | Deletion vectors | Equality delete files |
|---|---|---|---|
| Introduced | V2 | V3 | V2 |
| Status | Deprecated in V3 | Current | Deprecation proposed for V4 |
| Write cost | Requires finding row positions | Requires finding row positions | No lookup needed |
| Read cost | One file open per delete file, position skip | One bitmap per data file, O(1) position check | Join delete values against candidate rows |
| Count per data file | Unbounded | At most one per snapshot | Unbounded |
| Suits | Batch updates | Batch and streaming after conversion | Streaming upserts with no index |

Notice what the write-cost column tells you. Position deletes and deletion vectors both need the writer to know where a row physically sits. Equality deletes do not. That single property is why streaming pipelines adopted them, and it is also the root of every problem that follows.

## Why equality deletes are cheap to write

Picture a Flink job consuming a CDC stream. A record arrives saying customer 12345 changed their email address. The job needs to express "the old version of row 12345 is dead, here is the new version."

With positional encoding, the job has to answer a hard question first: where does the old row 12345 live? Answering it means maintaining an index from primary key to file and row position, across the whole table, kept current as compaction moves rows around. That index is real infrastructure. It has memory cost, checkpoint cost, and failure semantics.

With equality encoding, the job answers nothing. It writes a small file containing the value `12345` in the identifier column, appends the new row to a data file, and commits. Latency stays low, state stays small, and the sink stays simple.

That is a genuinely good design for the write path. Iceberg Kafka Connect writes equality deletes for upserts as well, so the pattern is not Flink-specific.

The bill arrives on the read path.

## Why equality deletes are expensive to read

An equality delete file says "rows with these values are deleted." It does not say which data files those rows live in. A reader has no way to skip the check.

Iceberg narrows the work with sequence numbers. An equality delete file carries a data sequence number, and it applies only to data files with a data sequence number lower than its own. That rule is what keeps the newly written version of row 12345 alive while killing the old one. Partition tracking helps too, since a delete file only applies to data files in the same partition.

Inside those bounds, the reader has to do a join. Every candidate data file gets checked against every applicable equality delete file, matching on the equality columns. Column-level metrics prune some of this, since a delete file recording values between 12000 and 13000 does not apply to a data file whose identifier range runs from 90000 to 91000. Real CDC streams rarely cooperate. Updates scatter across the key space, so the value ranges in delete files overlap nearly every data file in the partition.

The cost grows with the number of accumulated delete files, and streaming jobs create delete files on every checkpoint. A job checkpointing every thirty seconds produces 2,880 delete files per day per partition before any compaction runs. Each one has to be opened, read, and joined.

Compare that to a deletion vector. The reader opens the data file, opens the one bitmap that references it, and checks whether each row position is set. That is an array lookup. No join, no value comparison, no unbounded fan-out.

The gap is not a tuning difference. It is a difference in algorithmic shape.

## How a deletion vector is physically stored

The word "vector" makes some engineers assume something exotic. The encoding is plainer than that, and knowing it helps when you are looking at storage costs or debugging a read.

A deletion vector is a bitmap of row positions, stored as a blob inside a Puffin file. Puffin is Iceberg's container format for auxiliary data that is not table rows, and it already carries things like Theta sketches for distinct counts. A Puffin file holds a sequence of blobs plus a footer describing them, which means one Puffin file holds deletion vectors for many data files.

The bitmap itself uses a roaring bitmap in its 64-bit portable serialization. Roaring bitmaps split a value space into chunks and pick a container type per chunk based on density. A chunk holding a handful of deleted positions stores them as a sorted array of 16-bit values. A chunk where most positions are deleted stores a run-length encoding or a plain bit array. The result stays compact whether you deleted 3 rows out of a million or 900,000 of them.

The spec wraps that bitmap with a small envelope: a length, a magic byte sequence identifying the blob type, the serialized bitmap, and a CRC-32C checksum. The checksum matters more than it looks. A corrupted deletion vector produces silently wrong query results rather than an error, so the format checks itself on read.

Three fields in the delete manifest tie it together. Each vector is tracked by the location of the Puffin file containing it, the starting offset of its blob within that file, and the blob length in bytes. A reader that needs the vector for `data-0007.parquet` looks up those three values, issues one ranged read against object storage, and gets exactly the bytes it needs. No scan of the Puffin file, no reading of unrelated vectors.

That access pattern is the reason deletion vectors behave well on S3 and similar stores. Object storage charges for requests and rewards large sequential reads. A single ranged GET for a few kilobytes is close to the cheapest thing you can ask of it. Compare it against equality deletes, where a reader opens dozens or hundreds of small Parquet files, each with its own footer parse and its own request.

The application rules are worth stating because they explain why the model stays consistent. A deletion vector applies to a data file when the file path matches the vector's referenced data file, the data file's data sequence number is less than or equal to the vector's, and the partition matches. A position delete file applies under similar conditions plus one more: no deletion vector applies to that data file. When a vector exists, it wins, and it already contains everything the old position delete files said.

That last rule is what makes the V3 transition safe. A table with a mix of old position delete files and new vectors never produces an ambiguous read. Each data file resolves against exactly one representation.

## The problems that go past performance

If read latency were the only issue, the community answer is "compact more aggressively" and the story ends there. The V4 discussion goes further, and the additional arguments are the ones that convinced people who were previously neutral.

**Change data capture becomes unreliable.** Iceberg can produce a changelog between two snapshots by comparing what was added and removed. Equality deletes break that, because determining which rows a delete file actually removed requires scanning the data to find matches. The true state of the table is not knowable from metadata alone. Any consumer that wants incremental change output has to fall back to a full scan.

**Row lineage does not work.** V3 added row lineage, which tracks a row identity across updates so downstream systems can follow a record through its versions. Lineage assumes the system knows which physical row an update replaced. Equality deletes hide that fact by construction.

**Incremental maintenance turns into full rebuilds.** A materialized view or a secondary index over an Iceberg table stays current by applying the delta between snapshots. When the delta contains equality deletes, the maintenance system cannot determine the affected rows without reading the table. So it rebuilds everything. The same applies to any external index, search index, or cache built over the table.

Maximilian Michels, who has done much of the Flink-side work here, described equality deletes on the dev list as the number one pain point for streaming use cases, and noted that users either give up when they see merge-on-read costs or build custom solutions that pull them away from core Iceberg. That second failure mode is the one that worries maintainers most. A format succeeds when the common case is handled inside the format.

## What is actually being proposed for V4

Russell Spitzer first proposed deprecating equality deletes in October 2024. The proposal was to deprecate in V3 and remove in V4. It stalled, and the reason was concrete rather than political: Flink streaming upserts depended on equality deletes and had no practical replacement. Removing them with no alternative in place amounts to telling streaming users the format no longer serves them.

Huaxin Gao revived the proposal in July 2026, framed around V4. The argument this time is that the blocker has cleared.

Read the proposal precisely, because it is easy to overstate. The plan is not to make equality deletes illegal on existing tables tomorrow. Iceberg specs handle removals the way V3 handled position delete files: new tables on the newer format version stop producing the old representation, existing files remain valid and readable, and engines keep read support for a long tail. The V3 spec language on position deletes is the template. Position delete files must not be added to V3 tables, and existing position delete files stay valid.

Steven Wu, Manu Zhang, Maximilian Michels, and Xin Huang all engaged the thread. The discussion is active and the details are unsettled as of this writing, so treat any specific V4 language as provisional. The direction is not in much doubt.

What changed between 2024 and now is the Flink work.

## The Flink conversion path

Maximilian Michels reported that equality-delete-to-deletion-vector conversion is complete and merged. The feature ships as a table maintenance task named `ConvertEqualityDeletes`, integrated with `IcebergSink`.

The design is worth understanding because it resolves the tension I described earlier. Writers keep doing the cheap thing. Conversion happens as a separate concern.

Here is the flow:

1. The Flink sink writes data files and equality deletes exactly as it does today, committing to a staging branch.
2. A converter task monitors that branch for new commits.
3. The converter maintains a sharded primary key index in Flink state, backed by RocksDB.
4. For each equality delete, the converter looks up the key in the index to find the data file and row position.
5. The converter commits the data files plus the resolved deletion vectors to the target branch.

Readers point at the target branch and never see an equality delete file. The write path keeps its low latency because the expensive lookup moved off the critical path and into a task that runs asynchronously.

The index is the interesting piece. It persists in Flink's managed RocksDB state, updates as new data arrives, and checkpoints on a schedule. On failover, the worker resumes from the most recent checkpointed index rather than rebuilding from scratch. RocksDB is the preferred state backend specifically because the index grows beyond available heap on large tables, and RocksDB spills to local disk instead of failing with an out-of-memory error.

Index size scales with the number of live rows in the table for the configured equality columns. That is the number to plan around, and I will come back to it in the operational section.

## Configuring the converter

The maintenance task attaches to the sink. A minimal Flink DataStream setup looks like this:

```java
TableMaintenance.forChangeStream(changeStream, tableLoader, schema)
    .uidSuffix("orders-maintenance")
    .rateLimit(Duration.ofMinutes(5))
    .lockCheckDelay(Duration.ofSeconds(30))
    .add(ConvertEqualityDeletes.builder()
        .stagingBranch("staging")
        .targetBranch("main")
        .equalityFieldColumns(Arrays.asList("order_id"))
        .maxCommitsPerRun(20))
    .add(ExpireSnapshots.builder()
        .maxSnapshotAge(Duration.ofDays(3))
        .retainLast(20))
    .append();
```

Taking that apart:

`uidSuffix` gives the maintenance operators stable identifiers so that savepoint restores map state correctly. Skip it and a job graph change silently drops your index.

`rateLimit` controls how often the maintenance pass triggers. Five minutes means readers on the target branch see data at up to five minutes of staleness plus checkpoint interval. Tighten it for lower latency and pay in commit volume against the catalog.

`lockCheckDelay` governs how often the task polls for the table lock when another maintenance process holds it. Coordination matters here, because two processes rewriting the same files produce commit conflicts.

`stagingBranch` and `targetBranch` set the topology. When they differ, readers on `main` never observe equality deletes. When they are equal, the converter operates in place and acts as an equality-delete-to-DV compaction on that single branch. In-place mode has a useful property on cold start: it walks the entire branch history, so equality deletes committed before the converter started still get picked up.

`equalityFieldColumns` has to match the identifier fields the sink writes. A mismatch produces an index keyed on the wrong columns, and lookups miss.

`maxCommitsPerRun` bounds how much history one pass processes. Set it low on a table with a large backlog so the first run finishes instead of running for hours and failing a checkpoint.

The staging-branch topology needs a reader-side decision too. Query engines address a branch explicitly:

```sql
SELECT order_id, status, updated_at
FROM catalog.sales.orders
VERSION AS OF 'main'
WHERE updated_at > current_timestamp - INTERVAL '1' HOUR;
```

Point every downstream consumer at the target branch, and make that a lint rule in your dbt project or query templates. One forgotten reader on the staging branch reintroduces the entire read penalty for that team.

## Verifying conversion from Spark and Python

Trusting the converter without checking it is a mistake I have watched people make. The verification is cheap, and you want it wired into a scheduled job rather than done once by hand.

Two things need checking. The staging and target branches have to agree on row counts, and the target branch has to contain zero equality delete files.

The count comparison in Spark:

```sql
SELECT
    (SELECT count(*) FROM catalog.sales.orders VERSION AS OF 'staging') AS staging_rows,
    (SELECT count(*) FROM catalog.sales.orders VERSION AS OF 'main')     AS main_rows;
```

Run this when the converter has caught up, meaning the target branch snapshot timestamp is close to the staging branch snapshot timestamp. Run it while conversion is mid-flight and the counts differ for a benign reason, which will send you chasing a bug that does not exist. Check the lag first:

```sql
SELECT committed_at, snapshot_id, operation
FROM catalog.sales.orders.snapshots
ORDER BY committed_at DESC
LIMIT 10;
```

The second check confirms the target branch is clean. The `delete_files` metadata table exposes a `content` field that distinguishes delete types. Content value 1 marks position deletes, and value 2 marks equality deletes:

```sql
SELECT content, count(*) AS files
FROM catalog.sales.orders.delete_files
GROUP BY content;
```

On a converted table the equality row disappears from that result. If it does not, the converter is falling behind or the equality field configuration is wrong.

PyIceberg gives you the same visibility without a Spark cluster, which makes it convenient for a monitoring job:

```python
from pyiceberg.catalog import load_catalog

catalog = load_catalog("prod")
table = catalog.load_table("sales.orders")

# Inspect what the current snapshot tracks
delete_files = table.inspect.delete_files().to_pydict()
by_content = {}
for c in delete_files["content"]:
    by_content[c] = by_content.get(c, 0) + 1

print("position deletes:", by_content.get(1, 0))
print("equality deletes:", by_content.get(2, 0))

# Compare branch heads
refs = table.refs()
print("staging head:", refs["staging"].snapshot_id)
print("main head:", refs["main"].snapshot_id)
```

The `inspect` namespace in PyIceberg mirrors the metadata tables the SQL engines expose, so the numbers agree across both paths. Reading refs directly tells you which snapshot each branch points at, which is the fastest way to see whether the converter is committing at all.

Wire the equality delete count into whatever alerting you already run. A non-zero count on the target branch that persists past one conversion interval is the signal that something needs attention, and it fires long before anyone notices a slow dashboard.

## When equality deletes are still the right call

An honest article has to include the cases where the old design wins, because the deprecation discussion has produced some overcorrection.

**You are on V2 and your readers cannot move.** Deletion vectors need V3. If a tool in your stack has no V3 read support, upgrading the table breaks it. Equality deletes on a V2 table with disciplined compaction is a working system. Compaction cadence is the variable that matters, not the delete encoding.

**Your update rate is low relative to your read rate.** A table taking a few hundred updates an hour with compaction running every fifteen minutes never accumulates enough delete files for the join cost to register. Converting that table gains you nothing and adds a maintenance task to operate.

**Your queries are heavily partition-filtered.** Equality delete cost concentrates in the partitions receiving updates. A table partitioned by day where queries almost always touch the last two days, and updates spread across all history, produces a misleading global delete file count. The partitions your queries actually read are fine. Use the partition-level query from the operational section rather than a table-wide number before deciding.

**You are prototyping.** The converter is real infrastructure with real state. Standing it up for a pipeline that has not yet proven it belongs in production is effort spent in the wrong place.

The point of the spec change is not that equality deletes were a mistake. They were the correct engineering call for the constraint that existed. The point is that the constraint has lifted, and a format carrying two representations for the same operation forever is a tax on every engine implementer and every user who has to understand both.

Where the deprecation genuinely hurts is writers that have no Flink to run the converter in. Iceberg Kafka Connect writes equality deletes for upserts, and a Connect-based pipeline has no equivalent maintenance task today. Teams in that position need either a Flink or Spark maintenance job alongside the Connect pipeline, or a rewrite of the ingestion path. That gap is one of the open questions in the dev list discussion, and it is a fair reason to argue the timeline should be generous.

## Failure modes and their warning signs

I prefer to tell you what breaks rather than promise this is smooth.

**Index state outgrows the state backend.** The primary key index holds an entry per live row for the equality columns. A table with 4 billion live rows and a 16-byte key produces an index measured in tens of gigabytes before RocksDB overhead. RocksDB spills to local disk, so the failure is not immediate, but TaskManager local storage fills and checkpoint duration climbs. Warning sign: checkpoint duration creeping upward on a job whose input rate is flat. Fix: increase parallelism to shard the index further, or provision larger local disks on the TaskManagers.

**Cold start on a large existing table takes a long time.** In-place mode walks the entire branch history on start. A table with two years of snapshots and a large equality delete backlog spends a long time on that first pass. Warning sign: the first maintenance run never completes. Fix: bound it with `maxCommitsPerRun` and let it catch up over successive passes, or expire old snapshots first to shrink the history it walks.

**Commit conflicts against other maintenance.** The converter commits to the target branch. So does compaction, so does snapshot expiration, and so does anything else rewriting files. Iceberg uses optimistic concurrency, and a conflict means a retry. Warning sign: retry counts rising in the maintenance task metrics, and commit latency spikes. Fix: serialize maintenance through the lock mechanism and stagger the schedules rather than running everything on the hour.

**Readers pointed at the wrong branch.** Nothing errors. Queries return correct results, slowly. Warning sign: one BI dashboard is slow while equivalent queries elsewhere are fast. Fix: audit the branch reference in every consumer, and set the table's default branch deliberately.

**Engine support gaps on V3 reads.** Deletion vectors need engine support. Support has stabilized across the major engines as of mid-2026, with Spark furthest along, Flink supporting deletion vectors and DV compaction, and Trino supporting deletion vector reads and writes while DV-aware compaction lags. Some tools in your stack lag the spec. Warning sign: a downstream tool returns rows that other engines exclude. That is a correctness bug, not a performance one, and it deserves an immediate stop. Fix: validate every reader against a table with known deletions before you migrate production tables to V3.

**Puffin files accumulate their own small-file problem.** Deletion vectors solve the read-side join, and they do not exempt you from file count discipline. A converter running every five minutes writes a Puffin file every five minutes. Most of them are small. The delete manifest grows with each one, and scan planning reads that manifest. Warning sign: planning time rising while the equality delete count sits at zero and scan time stays flat. Fix: rewrite the position delete files on a schedule so vectors consolidate into fewer, larger Puffin files, and expire the snapshots that reference the old ones. This is the same maintenance instinct you already apply to data files, applied one level over.

**Equality columns drift from the actual primary key.** Someone adds a composite key upstream and the sink configuration does not follow. The converter builds an index on a key that is no longer unique, and resolution produces wrong deletions. Warning sign: row counts that disagree between the staging and target branches. Fix: assert on the equality field configuration in your deployment pipeline rather than trusting it stayed correct.

## An operational plan

Here is the sequence I recommend for a team running Flink upserts into Iceberg today.

**Measure the current tax first.** Run a representative query against a snapshot with delete files present and against a snapshot immediately after compaction. The difference is what you are buying. If it is 4 seconds against 4.5 seconds, you have a different bottleneck and this work is not your priority. If it is 4 seconds against 90, keep reading.

Iceberg exposes delete file counts through metadata tables, and this is the query to run weekly:

```sql
SELECT
    partition,
    count(*) AS delete_file_count,
    sum(file_size_in_bytes) / 1024 / 1024 AS total_mb,
    max(sequence_number) AS newest_seq
FROM catalog.sales.orders.delete_files
GROUP BY partition
ORDER BY delete_file_count DESC
LIMIT 20;
```

The `delete_files` metadata table lists every delete file the table currently tracks. Grouping by partition shows where accumulation concentrates, which is almost never uniform. The partitions at the top of that list are the ones producing your slow queries. Track `delete_file_count` over time and set an alert on it. A number that climbs without falling back means compaction is losing the race against ingestion.

**Upgrade the table to V3 before anything else.** Deletion vectors do not exist below V3. Format upgrades in Iceberg are metadata operations and do not rewrite data, so the upgrade itself is fast. The risk is entirely on the reader side, which is why validating engine support comes first.

**Validate every reader.** Build a small test table with a few thousand rows, delete a known subset via deletion vectors, and run the same count from every engine and tool in your stack. Spark, Flink, Trino, your BI tool, your Python jobs using PyIceberg, and whatever internal service reads the table directly. Any tool returning the wrong count is a blocker.

**Start with the staging-branch topology.** Separate branches give you a clean rollback. If the converter misbehaves, readers on the target branch are unaffected by the mess, and you stop the converter without touching production reads. Move to in-place conversion later if the operational simplicity is worth more than the isolation.

**Size the state backend from live row count.** Take the number of live rows and multiply by the width of your equality columns plus roughly 40 bytes of overhead per entry. Provision local disk at three times that figure to leave room for RocksDB compaction. Set parallelism so no single subtask holds more index than its TaskManager has local storage.

**Keep compaction running.** Conversion turns equality deletes into deletion vectors. It does not eliminate merge-on-read work. A data file with a large deletion vector still requires the reader to apply the bitmap, and a file where most rows are deleted wastes scan effort. Rewrite data files on a schedule to fold deletions into fresh files.

**A weekly review checklist.** Put these five numbers on one dashboard and look at them once a week:

1. Equality delete file count on the target branch. Target is zero.
2. Total delete file count per partition, worst ten partitions. Watch the trend, not the absolute number.
3. Converter checkpoint duration and RocksDB state size per subtask.
4. Snapshot count on the table. Growth without expiration slows every metadata read.
5. Median and p95 planning time for one representative query. Planning time is where delete file accumulation shows up first, before scan time moves.

The fifth one is the leading indicator. Iceberg resolves which delete files apply during scan planning, and that work grows with delete file count before the actual data read gets noticeably slower. A planning time that has drifted from 400 milliseconds to 3 seconds is telling you something well ahead of any user complaint.

**Do not migrate everything at once.** Pick the tables where delete accumulation causes the most pain, measure before and after, and roll forward from evidence. A format migration executed across two hundred tables in one change window is a way to turn a performance improvement into an incident.

## How other table formats answered the same question

Iceberg is not alone in having to resolve updates before readers arrive. Looking at how the other open formats handled it clarifies what the V4 proposal is really choosing.

**Delta Lake** shipped deletion vectors before Iceberg did, using roaring bitmaps in the same general shape. The two designs converged from different starting points, which is a decent signal that the design is correct rather than a matter of taste. Delta never had an equality-style encoding, so it never faced the deprecation question. It also never had the cheap streaming write path that equality deletes gave Iceberg, and Delta streaming upserts paid for row position lookup from the start.

**Apache Hudi** built around record-level indexing from its first release. A Hudi table maintains an index mapping record keys to file groups, which is exactly the infrastructure that Iceberg is now adding on the Flink side. Hudi made that index a first-class part of the table rather than external state held by the writer. The tradeoff is visible in both directions. Hudi tables handle upserts natively with no external maintenance task. They also carry the index as a permanent operational concern, and the format is more opinionated about how you write.

**Apache Paimon** took the log-structured merge tree approach, organizing primary-key tables into sorted levels that compact downward continuously. Merge engines define what the latest state of a key means, giving deduplication, partial updates, and aggregation as native behaviors rather than delete mechanics bolted on. The result is the strongest streaming-write physics in the category and native changelog semantics. The cost is permanent background compaction work and a heavy tilt toward the Flink ecosystem.

Three formats, three answers, one shared conclusion. Resolving an update to a physical row position has to happen somewhere. You pay for it on write (Delta), you pay for it with a permanent index inside the format (Hudi), you pay for it with continuous background compaction (Paimon), or you defer it and pay on every read (Iceberg equality deletes).

Iceberg's V4 direction picks a fourth option: defer the cost off the write path, but resolve it asynchronously rather than at read time. The primary key index lives in the streaming engine's state instead of the table format. That keeps Iceberg's format surface small, which has been a deliberate design value since the beginning, and it puts the state where the writer already runs.

Whether that is the right split is a genuine architectural argument, and reasonable engineers land on both sides. Putting the index outside the format means every writing engine implements its own, and the Kafka Connect gap I mentioned earlier is a direct consequence. Putting it inside the format means every reader implementation carries more surface area. Iceberg has consistently chosen the smaller format, and the V4 proposal follows that pattern.

For practitioners, the useful takeaway is narrower. If your workload is dominated by high-frequency primary-key upserts and you have not committed to a format yet, the LSM-based designs handle that shape with less operational scaffolding. If you have already committed to Iceberg for the ecosystem breadth, the conversion path closes the gap and you do not need to reconsider the choice.

## Where the ecosystem is heading

Two things are converging, and they reinforce each other.

The first is spec discipline. Iceberg deprecated position delete files in V3, which was the community stating with unusual clarity that the V2 representation was a dead end at scale. Format specifications rarely remove anything. The willingness to prune keeps a spec from accumulating a permanent tail of representations every engine has to support forever. The equality delete proposal is the same instinct applied again.

The second is that the streaming and analytical worlds keep converging on one storage layer. Apache Paimon took a different route to the same destination, organizing primary-key tables into log-structured merge levels with continuous compaction by design. Iceberg is arriving there through deletion vectors and an external index maintained by the streaming engine. Both designs recognize the same requirement: a table that accepts a high rate of updates needs a way to resolve those updates before readers arrive, not during the read.

The V4 discussion is unfinished. The deprecation timeline is unsettled, the removal semantics need spec language, and the conversion path needs production mileage on tables larger than the ones it has seen. Watch the Iceberg dev list rather than any vendor's roadmap for the authoritative state.

What I am confident about is the direction of the read-path cost. Every architectural pressure in the ecosystem, from CDC correctness to row lineage to incremental view maintenance to AI agents issuing unpredictable queries against these tables, pushes toward representations a reader resolves in constant time. Equality deletes are the last representation in Iceberg that does not have that property.

## Conclusion

The equality delete design solved a real problem. In 2021 it was the only way to make streaming upserts into Iceberg practical, because the alternative required an index nobody had built. It bought the format five years of CDC adoption that no other design was going to deliver.

The cost of that trade shows up on every read, and it shows up in places past query latency. Change capture, row lineage, and incremental maintenance all need to know which physical rows an update replaced. Equality deletes hide that by design.

The Flink conversion work removes the reason the 2024 deprecation proposal stalled. Writers keep the cheap path, an asynchronous task resolves the deletes against a persistent primary key index, and readers see deletion vectors. That is the shape of the answer, and V4 is where the spec catches up to it.

If you run streaming upserts into Iceberg today, the useful work starts now and does not depend on V4 landing. Measure your delete file accumulation. Get your tables to V3. Validate that every reader in your stack handles deletion vectors correctly. Stand up conversion on one painful table with a staging branch and watch it for a month. By the time the spec settles, you will have the operational experience instead of a migration deadline.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg internals and lakehouse architecture. *Apache Iceberg: The Definitive Guide*, which I co-authored for O'Reilly, covers the delete file mechanics, snapshot model, and compaction strategies behind everything in this article in full detail. *Architecting an Apache Iceberg Lakehouse* from Manning takes the same material up a level into platform design decisions. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
