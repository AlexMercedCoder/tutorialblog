---
title: "Mastering Apache Iceberg v3 Deletion Vectors for High-Throughput Streaming Ingest"
date: "2026-08-19"
description: "Apache Iceberg v3 deletion vectors for high-throughput streaming ingest: how bitmaps and Puffin files fix CDC write amplification and read decay."
author: "Alex Merced"
category: "Apache Iceberg"
canonical: https://iceberglakehouse.com/posts/apache-iceberg-v3-deletion-vectors-streaming-ingest/
tags:
  - Apache Iceberg
  - v3
  - deletion vectors
  - streaming
  - CDC
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/apache-iceberg-v3-deletion-vectors-streaming-ingest/).

Here is a bill that surprises teams every quarter. A Flink pipeline streams change data capture events into an Apache Iceberg table, a few thousand updates per minute against a ten-terabyte fact table. The data itself is tiny. The cloud bill is not. Storage grows far faster than the data, object store API charges climb, and the nightly compaction job takes longer every week. Query latency creeps up too, because every read now wades through thousands of small files that exist only to say "these rows are gone."

None of that is a bug. It is the arithmetic of running row-level updates on immutable files, and for years Iceberg users paid it through one of two taxes: rewrite whole data files on every change, or accumulate delete files that readers reconcile at query time. The Iceberg v3 specification introduces deletion vectors to shrink both taxes at once, and as of the Apache Iceberg 1.11.0 release they are the stable, default mechanism for row-level deletes on v3 tables.

This article explains the mechanism from first principles: why immutable storage makes deletes expensive, what v2's delete files got right and wrong, how deletion vectors work down to the bitmap and the file format, how to configure Spark and Flink pipelines to use them, and how to schedule compaction once delete maintenance stops being an emergency. A disclosure before we start: I work at Dremio, an Iceberg-native query engine vendor, and I co-authored two O'Reilly books on this ecosystem. The content here is spec-level and applies to any engine.

## Why Deletes Are Hard on a Lakehouse

Every difficulty in this article flows from one design decision that Iceberg inherited from the object stores it runs on: data files are immutable. A Parquet file, once written, is never edited in place. Object stores like S3 do not support partial overwrites, and immutability is also what makes snapshot isolation, time travel, and safe concurrent reads possible. You cannot corrupt a file that nobody is allowed to touch.

The price is that "delete one row" is not a primitive operation. A row lives at some position inside an immutable file. To make it disappear, an engine has exactly two options, and every table format on earth chooses between the same two.

Option one is copy-on-write, usually shortened to COW. Find every data file containing an affected row, rewrite each of those files without the deleted rows, and commit a snapshot that swaps old files for new. Reads stay perfectly simple, because every live file contains only live rows. Writes carry the full cost. Delete one row from a 512 MB Parquet file and you rewrite 512 MB. Delete one row from each of a thousand files and you rewrite half a terabyte to remove a kilobyte. This ratio of physical bytes written to logical bytes changed is write amplification, and for streaming workloads it is the tax that breaks the budget.

Option two is merge-on-read, shortened to MOR. Leave the data files alone and write a small side record saying "row at position 4,832 of file X is deleted." Writes become cheap and fast. Reads inherit the cost, because every scan must load the side records and reconcile them against the data files before returning results. Let the side records pile up unmanaged and read performance decays until compaction pays the deferred bill.

Neither option is wrong. COW is the right choice for tables that change rarely and are read constantly. MOR is the right choice when changes arrive continuously and the write path must stay fast. Streaming ingest, CDC (change data capture) mirroring, and frequent MERGE workloads live squarely in MOR territory. So the practical question for the streaming architect is not COW versus MOR. It is: how expensive is the MOR bookkeeping, and how painful is the read-time reconciliation? That is exactly the question v3 answers differently than v2.

## What v2 Delete Files Got Right and Wrong

The Iceberg v2 specification, which brought MOR to Iceberg, gave writers two kinds of delete files.

Position delete files record the exact coordinates of deleted rows: a data file path plus a zero-based row position within it. They are precise and cheap to apply, but the writer must know the position, which means reading the target file to find the row before deleting it.

Equality delete files record a predicate instead: "any row where order_id equals 12345 is deleted." Writers love them because no lookup is needed, which is why streaming engines like Flink lean on them for CDC. Readers pay dearly for that convenience, because an equality delete applies to every data file in scope, forcing scans to evaluate the predicate broadly rather than against one known file.

The v2 design was a genuine advance, and its weaknesses only became clear at streaming scale. Three problems compounded.

First, file count explosion. Each commit that deletes rows produces new delete files. A pipeline committing every minute produces thousands of small delete files per day, each one an object store PUT at write time and a GET at read time. On cloud object storage you pay per request, so the bookkeeping generates its own API bill on top of its storage.

Second, read-time merge cost. Applying position deletes is a merge between sorted delete entries and data rows, roughly logarithmic work per row rather than constant. With many delete files per data file, readers open, download, and merge each one. The cost scales with delete file count, which scales with commit frequency, which is the one thing a streaming pipeline cannot reduce.

Third, unbounded accumulation. Nothing in v2 forces old position deletes for a file to be consolidated when new ones arrive. Ten commits touching the same data file leave ten delete files that every subsequent reader reconciles, until a maintenance job rewrites them. Maintenance became load-bearing: skip a compaction window and queries visibly degrade.

The v2 era taught the community precisely what the fix needed to be: keep MOR's cheap writes, but bound the per-file bookkeeping to a constant size and make the read-time application cost constant per row. That is a description of a bitmap.

## Choosing COW or MOR, With Vectors on the Board

Deletion vectors change the terms of the COW versus MOR decision, so it is worth restating the framework with the new numbers in mind. The decision is per table, and Iceberg lets you set it per operation type, which means DELETE, UPDATE, and MERGE each get their own mode.

| Dimension | Copy-on-Write | v2 Merge-on-Read | v3 MOR with Deletion Vectors |
|---|---|---|---|
| Write cost per change | Full file rewrites | Small delete files | Small Puffin blobs |
| Read overhead | None | Grows with commits until compaction | Flat: one bitmap per file |
| Delete application cost | None | Merge-join per delete file | Bit lookup per row |
| Small-file pressure | Low | High, one-plus files per commit | Low, one Puffin per commit |
| Compaction urgency | Low | Mandatory and scheduled tightly | Optional, density-driven |
| Best fit | Rare bulk changes, read-hot tables | Superseded on v3 tables | Streaming, CDC, frequent MERGE |

The framework I give teams has three questions. How often do row-level changes commit? Hourly or faster points at MOR, daily or slower keeps COW attractive. How latency-sensitive are the readers? With vectors, the MOR read tax is small and flat, so this question disqualifies MOR far less often than it did on v2. And who owns maintenance? COW needs almost none, while MOR still wants a density-driven rewrite job, so a table nobody operates should stay COW.

Notice what the table implies about mixed workloads. A dimension table that gets a weekly bulk correction and constant analytical reads stays COW with no regret. A fact table mirrored from an operational database via CDC belongs on v3 MOR without much debate. And the middle case that used to be genuinely hard, hourly-batch upserts on a table with dashboard consumers, now tips to MOR because vectors removed the read decay that used to punish it. The v3 spec did not just speed up an existing mode. It moved the boundary of when that mode is the right answer.

## Deletion Vectors: The Mechanism

A deletion vector is a bitmap with one bit per row of a data file. Bit set means the row is deleted. Bit clear means the row is live. Checking whether row 4,832 is deleted becomes a single bit lookup, constant time, no merge, no join, no predicate evaluation.

Naive bitmaps are wasteful for sparse deletes, so the spec uses Roaring bitmaps, a compressed bitmap format with an ecosystem of fast implementations across Java, C++, Rust, and Go. Roaring bitmaps store dense runs and sparse scatters of set bits in different internal containers, so a vector marking 200 deleted rows out of two million compresses to a few hundred bytes while still answering membership checks in constant time. The format was already battle-tested across search engines and databases before Iceberg adopted it, which mattered for a spec that every engine in the ecosystem has to implement identically.

Deletion vectors live in Puffin files. Puffin is Iceberg's companion file format for statistics and indexes, a simple container of binary blobs plus a footer describing them. The v3 spec defines a blob type named delete-vector-v1 for these bitmaps. A single Puffin file can hold many deletion vectors for many different data files, which is the small-file fix: one streaming commit that deletes rows across fifty data files writes one Puffin file with fifty blobs, not fifty separate delete files. The manifest entry for each vector carries a content offset and size that must exactly match the blob's location in the Puffin footer, so readers range-read just the bytes for the vector they need without downloading the whole container.

Two spec rules do the heavy lifting for read performance, and they are worth quoting in spirit because they define the whole operational model.

Rule one: at most one deletion vector per data file per snapshot. All deletes for a given data file, across all history, consolidate into a single bitmap. A reader planning a scan knows the worst case up front: one data file, plus at most one vector to fetch and apply. Compare that with v2's "one data file plus every delete file that accumulated since the last compaction," and you see the structural change. The bookkeeping per file is bounded, permanently, by construction.

Rule two: when a writer produces a deletion vector for a data file, that vector must replace all previously written position deletes for the file, and the new vector merges the old delete content into itself. Readers seeing a vector can safely ignore any older position delete files for that file. Consolidation stopped being a maintenance job and became a write-path invariant. Position delete files themselves are deprecated in v3, and writers are not required to rewrite Puffin files containing superseded vectors, since dangling blobs are just unreferenced bytes for garbage collection to reap later.

The engineering elegance here is easy to miss. The v3 designers did not invent an exotic new structure. They took the industry-standard compressed bitmap, put it in the container format Iceberg already had, and added two invariants that convert delete maintenance from a scheduled chore into a property of every commit. It is also worth knowing that the binary encoding was aligned with Delta Lake's deletion vectors, a deliberate interoperability choice as engines increasingly read both formats.

## The Write Amplification Math for Streaming

To see what this buys a streaming pipeline, put numbers on the three designs for the same workload: a CDC stream applying 1,000 row updates per minute to a table of 512 MB data files, with each minute's updates scattered across roughly 40 distinct files.

Under COW, each affected file is rewritten. Forty files at 512 MB is about 20 GB of Parquet written per minute to apply perhaps a few hundred kilobytes of logical change. That is write amplification on the order of tens of thousands to one. Per day it is roughly 28 TB of writes, with matching compute to re-encode the Parquet and matching API charges for the uploads. The read side is pristine and nobody can afford it.

Under v2 MOR with position deletes, each minute writes small delete files instead, kilobytes rather than gigabytes. Write amplification collapses. But each minute adds another layer of delete files to those 40 data files. After a day of one-minute commits, a data file touched repeatedly carries dozens of delete files, and every reader merges all of them. You traded write cost for read decay plus an object count that grows by tens of thousands of files per day, each one a billable API request to write and to read.

Under v3 deletion vectors, each minute's commit writes one Puffin file containing updated vectors for the touched data files, merging in all prior deletes for each. Write cost stays in kilobytes per commit. Read cost stays flat over time: one vector per file, applied at a bit lookup per row, no matter how many commits have accumulated. Object count grows by one file per commit instead of one per touched data file. AWS published benchmarks on EMR with Spark confirming the DML speedups after shipping v3 support across EMR, Glue, and S3 Tables in late 2025, and vendor measurements of merge-heavy workloads consistently land in the same direction: the more frequently you commit deletes, the more the vectors save.

The honest caveat is that vectors do not repeal MOR physics. Reads still fetch and apply the bitmap, so a table under heavy churn still benefits from periodically rewriting data files to fold deletes in physically. What changed is the slope. In v2, deferred maintenance meant compounding read decay. In v3, the read tax is flat and small, which turns compaction from an emergency into an optimization you schedule on your own terms. We will schedule it properly in a later section.

## Enabling v3 and Deletion Vectors in Your Pipelines

The prerequisites are simple to state. Your table must be on format version 3, and your writing engine must be on a release that writes deletion vectors, with Apache Iceberg 1.11.0, released on 2026-05-19, being the line where v3 features hardened from experimental to stable in the reference Java implementation. Check your specific engine's bundled Iceberg version rather than assuming.

For a new table in Spark SQL, set the format version and MOR behavior at creation:

```sql
CREATE TABLE lake.events.orders (
    order_id BIGINT,
    customer_id BIGINT,
    status STRING,
    updated_at TIMESTAMP
)
USING iceberg
TBLPROPERTIES (
    'format-version' = '3',
    'write.delete.mode' = 'merge-on-read',
    'write.update.mode' = 'merge-on-read',
    'write.merge.mode' = 'merge-on-read'
)
```

The three mode properties tell Spark to handle DELETE, UPDATE, and MERGE through the MOR path. On a v3 table, the MOR path produces deletion vectors. On a v2 table, the identical properties produce position delete files, which is why the format version is the load-bearing line.

For an existing v2 table, the upgrade is a metadata-only operation, non-destructive and instant:

```sql
ALTER TABLE lake.events.orders SET TBLPROPERTIES ('format-version' = '3')
```

Existing data files remain valid, existing v2 delete files remain readable, and new row-level changes start producing vectors, with the replacement rule folding old position deletes into new vectors as files get touched. Format upgrades are one-way, so confirm every engine that reads the table can handle v3 before you run this. That warning earns its own section later.

A streaming MERGE, the workhorse of CDC apply jobs, needs no special syntax at all:

```sql
MERGE INTO lake.events.orders t
USING staged_changes s
ON t.order_id = s.order_id
WHEN MATCHED AND s.op = 'D' THEN DELETE
WHEN MATCHED THEN UPDATE SET
    t.status = s.status,
    t.updated_at = s.updated_at
WHEN NOT MATCHED THEN INSERT *
```

Under the hood on a v3 MOR table, matched deletes and the delete half of updates become bitmap entries in new deletion vectors, new and updated row versions land in fresh data files, and the commit publishes both atomically. Your pipeline code does not change. Your bill does.

On the Flink side, the same table properties govern behavior, since Flink respects the table's configured write modes. The practical Flink notes are about versions and history: Flink's CDC writes historically leaned on equality deletes, which vectors do not replace one-for-one, because equality deletes serve writers that cannot know row positions. Recent Iceberg releases and the Flink connector have been progressively moving streaming upsert paths toward position-based deletes that consolidate into vectors, so the version of the connector you run determines how much of the benefit you collect. Verify what your connector writes by inspecting a snapshot's delete manifests, not by reading release notes alone.

A note on lightweight writers, since not every ingest path runs a JVM cluster. PyIceberg, the native Python implementation, made serverless append-only ingest practical from small runtimes, and its row-level delete support has trailed the Java implementation by design, maturing release by release. If your Python path only appends, none of this article's delete machinery applies to its writes, and the table still benefits when Spark-side MERGE jobs handle the mutations. If you want Python to perform row-level deletes, check the current PyIceberg release notes for its v3 delete write status before building on it, because this is the corner of the ecosystem where capabilities are moving fastest and where a blog post's claims age in months.

## The Object Storage Bill, Itemized

The email that usually kicks off a deletion vector migration comes from finance, not engineering, so it is worth itemizing exactly where MOR bookkeeping shows up on a cloud bill. Object storage pricing has three meters: bytes stored per month, PUT-class requests, and GET-class requests. Delete file strategies hit all three differently.

Take the streaming workload from the earlier math, one commit per minute touching 40 data files, and run it for a 30-day month, about 43,200 commits.

Under v2 position deletes, each commit writes up to 40 small delete files. That is around 1.7 million PUT requests per month for delete bookkeeping alone. Every subsequent scan of a touched data file issues GETs for its accumulated delete files, so the read-side request count multiplies with both query traffic and delete file accumulation. The stored bytes are small, and the request charges are not, because request pricing is per operation regardless of size. Small files are the most expensive bytes on any object store, measured per byte of value delivered.

Under v3 vectors, each commit writes one Puffin file. The month costs about 43,200 PUTs for delete bookkeeping, a 40x reduction in write requests for this shape of workload. On the read side, a scan issues at most one ranged GET per data file for its vector, flat over time, and files without deletes cost nothing extra. Storage for superseded vector blobs accrues until snapshot expiration reaps the old Puffin files, which is a routine maintenance cost rather than a growth curve.

The same itemization explains a subtler saving: compaction itself gets cheaper. v2 compaction jobs spent much of their runtime listing, fetching, and merging thousands of delete files before writing anything. v3 rewrite jobs read one bitmap per input file. When teams report that their maintenance windows shrank after migrating, this is the mechanism, and it compounds with the density-driven scheduling covered later, since jobs also run less often. Put the three meters on one dashboard panel before the migration, capture a month of baseline, and the after picture writes your internal case study for you.

## Reading the Table: What Engines Do With Vectors

It helps to walk one query through the read path, because the scan is where the design pays off and where the residual costs live.

An engine planning a scan asks the catalog for the current metadata pointer, walks the manifest list, and prunes manifests and data files with partition values and column statistics. For each surviving data file, the manifest tells the engine whether a deletion vector exists, and if so, exactly where: the Puffin file path, the content offset, and the byte length of the blob. The engine issues a ranged GET for those bytes, deserializes the Roaring bitmap, and hands the data file reader a filter: skip any row whose position is set in the bitmap.

Count the costs. One extra ranged read per data file that has deletes, typically kilobytes. One bitmap membership check per row, constant time, vectorizable. No sort-merge against delete entries, no predicate evaluation against equality deletes, no fan-out across accumulated delete files. A file with zero deletes carries zero overhead, because no vector exists for it.

Now count what did not go away. Deleted rows still occupy space inside data files and still get read from storage and decoded before the bitmap drops them. A data file where 60 percent of rows are dead still costs nearly full price to scan for 40 percent of its value. Bitmap application hides deleted rows from results, and it cannot recover the I/O and decode spent on them. That residual is the entire justification for compaction, which is the next section, and it is also the source of the density heuristics we will use there.

The bitmap's shape also cooperates with modern execution engines. Columnar readers process rows in batches, and a Roaring bitmap converts naturally into a per-batch selection mask, the same structure engines already use for predicate pushdown results. Applying deletes becomes one more mask intersected with the others, which is why vectorized engines show close to zero marginal cost for delete application on lightly-deleted files. The delete check rides along with work the scanner was doing anyway, instead of forcing a separate join operator into the plan the way v2 delete files did on some engines.

One more read-path fact worth storing: the "at most one vector per file" rule means the planner's work is bounded and predictable. Query latency on a v3 MOR table does not degrade with commit count between compactions the way v2 tables did. It degrades only with delete density inside data files, which is a slower-moving and directly measurable quantity.

## Compaction on Your Own Terms: Scheduling by Vector Density

Compaction on a v3 table has one job: physically remove dead rows by rewriting data files whose deletion vectors have grown dense, reclaiming the storage and scan I/O those rows still consume. Because the read tax no longer compounds with time, you get to schedule this work by measurement instead of by fear.

The measurement is delete density: for each data file, the cardinality of its deletion vector divided by the file's record count. Iceberg's metadata tables expose what you need without touching data:

```sql
SELECT
    f.file_path,
    f.record_count,
    d.record_count AS deleted_rows,
    ROUND(d.record_count * 100.0 / f.record_count, 1) AS pct_deleted
FROM lake.events.orders.data_files f
JOIN lake.events.orders.delete_files d
    ON d.referenced_data_file = f.file_path
ORDER BY pct_deleted DESC
```

This query surfaces the files where dead rows concentrate. CDC workloads are rarely uniform: hot entities get updated constantly while cold history sits untouched, so density clusters in a minority of files. That skew is your friend, because targeted rewrites of the dense minority recover most of the wasted I/O at a fraction of a full-table rewrite's cost.

Spark's rewrite procedure accepts a filter for exactly this targeting, and the delete-oriented options make the intent explicit:

```sql
CALL lake.system.rewrite_data_files(
    table => 'events.orders',
    where => 'updated_at >= TIMESTAMP \'2026-08-01 00:00:00\'',
    options => map(
        'delete-file-threshold', '1',
        'min-input-files', '2'
    )
)
```

The where clause confines the rewrite to recent partitions where churn concentrates. The delete-file-threshold option of one tells the planner that any data file carrying a deletion vector is a rewrite candidate, so the job folds deletes into clean files rather than only fixing size problems. After the rewrite commits, the affected files have no vectors at all, and their scan cost returns to the zero-overhead path. Expired snapshots and unreferenced Puffin blobs then age out through your normal expire_snapshots and orphan file cleanup, which remain as necessary as ever.

A schedule that works in practice for minute-level streaming ingest: run the density query as a monitoring metric continuously, rewrite files crossing roughly 20 to 30 percent density daily during a low-traffic window, and let anything below 10 percent ride, because the bitmap overhead at that density is noise. Tables with strict latency SLAs (service level agreements) tighten the threshold, storage-cost-driven tables loosen it. The point is that the number comes from your dashboards, not from a cron guess, and missing a window costs you a few percent of scan efficiency instead of a support ticket.

## A Worked Example: Rebuilding a CDC Mirror on v3

To make the pieces concrete, here is how the parts assemble for a common shape of system: an operational PostgreSQL database mirrored into an Iceberg table for analytics, with Debezium capturing changes into Kafka and a Spark Structured Streaming job applying them. The details are a composite of real deployments with no invented benchmark numbers attached.

The table is an orders fact, tens of terabytes, partitioned by order date, with data files targeting 256 MB. Change traffic is the classic skew: the last two weeks of partitions absorb almost all updates as orders move through their lifecycle, while older partitions are effectively append-only history that stopped changing.

The table gets created on format version 3 with all three write modes set to merge-on-read, exactly as in the earlier walkthrough. The streaming job checkpoints every 60 seconds, and each micro-batch stages the interval's changes and runs the MERGE from the configuration section. Deletes and the delete half of updates become bitmap entries, new row versions land in fresh data files sized by the write target, and each commit adds one Puffin file carrying the interval's vectors. Nothing in the job's code knows that vectors exist. The format version and write modes did all the deciding.

Monitoring is three panels. The first plots delete density per data file as a histogram, refreshed from the metadata join query shown earlier. The second plots delete files per data file, which sits at zero or one across the table and alerts if it exceeds one anywhere, since that means some writer is producing old-style deletes. The third is a canary query, a fixed dashboard-shaped aggregation over the hot partitions, plotted as p95 latency. Together they distinguish the three possible problems: density says compact, file counts say find the misconfigured writer, canary drift with flat density says look elsewhere, usually at snapshot buildup.

Maintenance is two scheduled jobs owned by one team. Nightly, a targeted rewrite_data_files runs with a filter on the last 21 days of partitions and a delete-file-threshold of one, folding the day's accumulated deletes in the hot zone back into clean files. The job finishes quickly because it touches only the churned minority of the table, and cold partitions never get rewritten at all. Weekly, expire_snapshots trims history to the agreed seven-day time-travel window and orphan cleanup reaps superseded Puffin blobs and abandoned files. The density histogram after each nightly run shows the hot files snapping back to zero, which is the picture of a maintenance loop that is keeping up.

Two incidents from composite experience are worth passing on. In the first, an engineer added a secondary Flink consumer writing upserts to the same table, and the delete-files-per-data-file panel jumped above one within an hour, because that connector version wrote equality deletes. The alert fired before any reader noticed degradation, and the fix was routing the second stream through the same MERGE-based apply path. In the second, an analyst's laptop DuckDB session, running a build predating vector read support, quietly showed deleted orders as live while every production engine agreed on the correct answer. Nobody caught it until a reconciliation report disagreed with the warehouse. The lesson became policy: the reader inventory includes laptops, and the team publishes a minimum-versions table next to the dataset documentation.

The end state is the point of the whole article. A table absorbing continuous row-level change, read by dashboards all day, with flat query latency between maintenance runs, a small and predictable object count per commit, and a compaction job that runs on a measured trigger against a minority of files. That is what MOR was always supposed to feel like.

## Failure Modes and Compatibility Traps

Deletion vectors remove a class of performance problems and introduce a class of coordination problems. These are the ones that reach production.

**A reader in your fleet cannot read v3.** This is the trap with teeth, because format upgrades are one-way and ecosystems upgrade unevenly. Through mid-2026, engine support for reading vectors is broad and still not universal. The reference Java implementation, Spark through the Iceberg runtime, AWS EMR and Glue and S3 Tables, Snowflake, and Dremio read v3 tables, while some engines still list vector support as roadmap, ClickHouse being a documented example where position and equality deletes are readable and Puffin vectors are in progress. An engine that ignores delete metadata it does not understand risks returning deleted rows as live data, which is a correctness failure, not a slowdown. Inventory every reader of a table, including the ad-hoc ones on laptops, before flipping format-version to 3. The warning sign that you missed one is subtle: resurrected rows in downstream reports.

**Equality deletes did not disappear.** Vectors replace position deletes, and equality deletes remain in the spec for writers that cannot know positions, with streaming upsert paths in some connectors still producing them. A table receiving equality deletes still needs the older reconciliation at read time for those deletes, and your compaction still needs to convert them. If your Flink version writes equality deletes, your v3 upgrade changed less than you think. Inspect the delete manifests to know which world you are in.

**Vectors written against the wrong file state.** The one-vector-per-file rule makes the writer responsible for merging prior deletes into each new vector. Engine bugs here are rare and severe, and the ecosystem hardened this path through 2025 and 2026, which is one more argument for running current engine releases rather than the version that shipped with last year's platform image. The defense is the same boring one as always: keep engines current, and validate row counts after upgrade cutovers.

**Metadata growth from commit frequency.** Vectors fix the delete file explosion and do nothing about snapshot accumulation. A pipeline committing every 30 seconds still writes a metadata file, manifest list, and manifests per commit, and a week of that is twenty thousand snapshots for expiration to chew through. Vectors are one piece of streaming hygiene, alongside snapshot expiration, manifest rewriting, and sensible commit batching. If planning time grows while scan time stays flat, your problem is metadata, not deletes.

## Operational Guidance

A few practices keep v3 MOR tables healthy over quarters, not just over the demo.

Track three numbers per table on a dashboard: delete density distribution across data files, count of delete files per data file (which should be zero or one everywhere, and a value above one means position deletes or equality deletes are still being written), and scan latency on a canary query. Those three separate "we need compaction" from "we have a writer misconfiguration" in one glance.

Batch commits to the latency your consumers actually need. Sub-minute commits are rarely a business requirement and cost real metadata overhead. Sixty-second checkpointing with vectors is a comfortable operating point for most CDC mirrors.

Keep table maintenance in one place. When multiple teams' jobs compact the same table on independent schedules, the jobs conflict, retry, and occasionally interleave badly with streaming commits. One owner, one maintenance pipeline, visible schedule.

Test the format upgrade on a copy first. Branch the table or clone its metadata into a scratch catalog namespace, flip the format version there, run every reader in your inventory against it, then upgrade production with a rollback story for the readers, since the table itself will not roll back.

For fleets of tables, sequence the migration rather than flipping everything in one change window. A sequence that has worked repeatedly: start with one high-churn, low-blast-radius table, a CDC mirror consumed by a single team rather than the revenue dashboard. Run it on v3 for two full weeks, long enough for the maintenance jobs to cycle several times and for at least one on-call rotation to see it. Capture the before-and-after on the three cost meters and the canary latency, because those numbers become the internal argument for the rest of the fleet. Then batch the remaining tables by reader population: everything read only by upgraded Spark and your primary query engine goes in wave two, tables with long-tail readers wait for wave three after those readers upgrade or get replaced. Tables that are pure append-only can migrate any time or never, since they gain nothing from delete machinery, and putting them last keeps the change reviews focused where behavior actually changes.

Document the rollback story honestly, because the format upgrade itself has none. What you can roll back is behavior: setting the write modes back to copy-on-write stops new vector production immediately, and a rewrite job folds existing vectors into clean files, leaving a v3 table that acts like a COW table while you sort out whatever went wrong. Knowing that lever exists, and having tested it once on the pilot table, is the difference between a calm incident and a bad week.

And write down the storage math for your finance partners. The bill that opened this article usually gets diagnosed months late because nobody connected API request charges to delete file counts. After the v3 migration, the same line items become your proof of savings.

## Where This Is Heading

Deletion vectors are one piece of v3, and the specification's other features compound with them. Row lineage gives every row identity across changes, which turns a v3 table into a native CDC source: downstream consumers read the changes directly from table metadata instead of standing up external capture infrastructure. The Variant type brings semi-structured payloads into the same tables, which matters for event streams that carry JSON. Meanwhile the Java 1.11 line added server-side scan planning to the REST catalog path, moving metadata traversal off engines, and a pluggable File Format API that opens the door to formats beyond Parquet carrying the same delete semantics.

The community's attention has already shifted to v4 discussions around metadata scalability for tables with millions of files, and adoption of v3 is following the familiar Iceberg pattern: the spec lands, the reference implementation stabilizes, managed platforms ship it, and the long tail of engines closes the gap over about a year. Betting on that pattern has been correct every cycle so far. Design your tables for v3, watch your reader inventory, and the ecosystem meets you there.

## Conclusion

Row-level deletes on immutable storage always cost something. Copy-on-write charges the writer in rewritten gigabytes. v2 merge-on-read charged the reader in accumulated delete files and charged operations in mandatory compaction. Deletion vectors settle the account differently: one compressed bitmap per data file, bounded by construction, merged on every write, applied in constant time on every read. Writers stay fast, readers stay flat, and compaction becomes a scheduled optimization driven by a density metric you can put on a dashboard.

For streaming ingest, this is the difference between a lakehouse that tolerates CDC and one that is genuinely built for it. Upgrade the format version deliberately, audit your readers, watch your delete manifests to confirm what your writers actually produce, and let measured delete density set your maintenance cadence. The arithmetic finally works in your favor.

## Keep Going

If this piece was useful, I have written a lot more on Iceberg internals and lakehouse operations. *Apache Iceberg: The Definitive Guide* from O'Reilly covers the table format's mechanics, and *Architecting an Apache Iceberg Lakehouse* from Manning covers the platform decisions around it. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
