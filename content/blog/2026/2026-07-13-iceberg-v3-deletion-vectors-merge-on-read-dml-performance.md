---
title: "Iceberg v3 Deletion Vectors and Faster DML"
date: "2026-07-13"
description: "An in-depth exploration of iceberg v3 deletion vectors and faster dml"
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Iceberg v3
  - Deletion Vectors
  - DML
canonical: "https://iceberglakehouse.com/posts/iceberg-v3-deletion-vectors-merge-on-read-dml-performance/"
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-v3-deletion-vectors-merge-on-read-dml-performance/).

Deleting one row from a data lake used to mean rewriting a whole file. If a 512 MB Parquet file held a million rows and you needed to delete one of them, the classic copy-on-write approach read the file, dropped the row, and wrote a fresh 512 MB file, all to remove a single record. That write amplification is the reason updates and deletes were historically painful on immutable file formats, and it is the problem that deletion vectors and merge-on-read tables set out to reduce.

Before going further, a note on terminology and status. The details of deletion vectors in [Apache Iceberg](https://iceberg.apache.org/spec/) v3 continue to evolve, and I have not pinned every naming and layout detail against the current spec for this article. Where I describe deletion vectors, treat it as the direction the format is moving rather than a fixed guarantee about a specific release, and confirm exact terminology and status against the official [Iceberg spec](https://iceberg.apache.org/spec/#delete-formats) and release notes before you build on it. The physical tradeoff I describe, faster writes in exchange for read-time merge work and compaction discipline, holds regardless of the exact names.

## Why DML Has Been Hard on Data Lakes

Data lake file formats are immutable by design. A Parquet file, once written, does not change. This immutability is a feature. It makes files safe to cache, safe to read concurrently, and cheap to reason about, because a file's contents never shift under you. Snapshot isolation, time travel, and reliable concurrent reads all lean on the fact that files do not mutate in place.

The cost of that design shows up the moment you need to change a row. There is no "update byte offset 4096 in this file" operation. To reflect a change, you have to produce a new file that has the change and stop pointing at the old one. For a single-row edit in a large file, that means rewriting everything else in the file too, purely as collateral. The ratio of bytes written to bytes actually changed is the write amplification, and for large files with sparse changes it can be enormous. Deleting 100 rows scattered across 100 files might rewrite 50 GB to remove a few kilobytes of data.

For append-only analytical tables this rarely matters, because you mostly add files rather than modify them. But real workloads are not purely append-only. GDPR and CCPA deletion requests target specific individuals across many files. Change-data-capture pipelines apply a stream of inserts, updates, and deletes from an operational system. Slowly changing dimensions update attributes on existing rows. Correction jobs fix bad records after the fact. Every one of these is DML against immutable files, and every one pays the write-amplification tax under naive copy-on-write. That tax is what the format-level improvements target.

The write-amplification problem gets worse, not better, as tables grow, which is the opposite of what you want. Larger tables mean larger files and more of them, so a scattered set of changes touches more files and rewrites more bytes. A deletion request that hits one row in each of a thousand files rewrites a thousand files, regardless of the fact that you only wanted to remove a thousand rows out of perhaps a billion. The cost scales with how spread out the changes are, not with how many rows actually changed. This is why teams running compliance deletions on large lakes often discover that a routine legal obligation has become an expensive, hours-long batch job that competes with their analytical workloads for cluster resources. The physics of immutable files turned a small logical change into a large physical one.

An added wrinkle is that these changes rarely arrive in convenient batches. CDC streams trickle in continuously. Deletion requests arrive one at a time as individuals exercise their rights. If you apply each small change with its own copy-on-write rewrite, you multiply the amplification by the number of separate operations. Batching helps, but batching adds latency, and some workloads cannot wait. This is the corner that merge-on-read was designed to get you out of.

## Copy-on-Write vs. Merge-on-Read

Iceberg supports two strategies for handling row-level changes, and understanding the difference is the core of this whole topic.

**Copy-on-write (COW)** does exactly what the earlier example described. When you update or delete rows, the engine identifies the affected data files, reads them, applies the change, and writes new data files that replace the old ones. The old files are removed from the table's current snapshot. The result is a clean table where every data file contains only live rows. Reads are simple because there is nothing to reconcile: you scan data files and that is the answer.

**Merge-on-read (MOR)** takes the opposite approach at write time. Instead of rewriting data files, it writes separate delete information that records which rows are logically deleted. The original data files stay put. At read time, the engine combines the data files with the delete information and filters out the deleted rows on the fly. The write is cheap because you only wrote a small delete record, not a rewritten data file. The cost moves to read time, where every scan must apply the deletes.

Consider a concrete example. You have a table with 1,000 data files and you need to delete 500 rows spread one per file across 500 of them. Under COW, you rewrite 500 data files, potentially tens of gigabytes, to remove 500 rows. The delete is slow and expensive, but afterward reads are as fast as ever. Under MOR, you write delete information covering those 500 rows, which is tiny, and the delete completes quickly. But now every read of those 500 files has to apply the deletes, and if you keep issuing small deletes, the delete information piles up and reads get progressively slower until you compact.

Neither is universally better. They are a tradeoff you choose based on your write pattern and read latency requirements. Here is the comparison laid out directly.

| Dimension | Copy-on-Write (COW) | Merge-on-Read (MOR) |
| --- | --- | --- |
| Write speed | Slow for scattered changes; rewrites whole files | Fast; writes small delete information |
| Write amplification | High when changes are sparse across large files | Low; only delete records are written |
| Read complexity | Simple; scan data files directly | Higher; must merge deletes at scan time |
| Read latency | Consistent and low | Degrades as delete files or vectors accumulate |
| Maintenance burden | Lower; table stays clean after writes | Higher; needs regular compaction |
| Best fit | Mostly append-only tables, infrequent large batch changes | High-churn tables, frequent small updates and deletes, CDC |

The practical rule of thumb: if your table changes rarely and you value dead-simple reads, COW is fine. If your table changes often and you cannot afford slow writes, MOR is the tool, but you are signing up for compaction as an ongoing responsibility.

A point that trips people up is that the choice is not always global for a whole table, and it is not always permanent. Some engines let you set the write mode per operation, so a large scheduled batch job might use copy-on-write to keep the table clean, while a stream of small trickle updates during the day uses merge-on-read for speed. You can also change your mind: a table that started as MOR because writes needed to be fast can be periodically consolidated back to a clean state through compaction, at which point reads are as fast as a COW table until deletes accumulate again. Thinking of COW and MOR as two ends of a spectrum you move along, rather than a one-time fork in the road, matches how these tables actually behave in production. The write mode is a knob you tune to the workload, not a vow you take once.

## How Iceberg Tracks Row-Level Deletes

The interesting engineering is in how MOR represents "these rows are deleted" compactly and in a way engines can apply efficiently.

Iceberg has supported **positional delete files** for some time. A positional delete identifies a deleted row by its data file path and its row position within that file: "in file `data-0042.parquet`, rows 17, 883, and 40122 are deleted." At read time, when the engine scans `data-0042.parquet`, it consults the positional deletes for that file and skips those row positions. Positional deletes are precise and reference specific rows, which makes them efficient to apply compared to the older equality-delete approach that matched on column values.

The direction deletion vectors take is to make this row-level delete tracking more compact and more efficient to apply. Conceptually, a deletion vector is a compact bitmap of deleted positions for a data file: instead of a list of positions stored as rows in a delete file, you have a bitmap where a set bit means "this position is deleted." Bitmaps compress extremely well when deletes are dense and are very fast to apply during a scan, because checking whether a position is deleted becomes a bit lookup rather than a search through a list. Roaring bitmaps and similar structures make this both small on disk and fast in memory. Again, treat the specifics as the format's direction and verify the current layout in the spec before relying on exact behavior.

Whatever the physical representation, the planning problem is the same. The query engine must map delete information to the relevant data files. When it plans a scan, it does not just enumerate data files; it also gathers the delete files or vectors that apply to each data file, so the reader can combine them. This mapping is part of Iceberg metadata planning, and its efficiency matters, because if planning has to sift through thousands of unrelated delete files to find the ones that apply, planning itself becomes a bottleneck before a single row is read.

There is a meaningful difference between the two ways deletes have historically been expressed, and it explains part of the motivation for the deletion-vector direction. Equality deletes say "delete every row where this column equals this value," which is compact to write but expensive to apply, because the reader must evaluate the predicate against rows to find matches. Positional deletes say "delete these exact row positions in this exact file," which is more work to produce but far cheaper to apply, because the reader just skips the listed positions. Deletion vectors push the positional approach further by encoding those positions as a bitmap tied to a single data file, which is both compact and fast to apply. The trend across these representations is consistent: move cost away from read time, where it happens on every query, and toward write and compaction time, where it happens once. That is the right direction for analytical tables that are read far more often than they are written.

## Read-Time Costs and Engine Responsibilities

MOR moves cost to read time, so the read engine's competence is what determines whether MOR is pleasant or painful. A naive reader that materializes every row and then filters deleted ones will be slow. A good reader applies deletes during the scan without excessive materialization, and this is where engine engineering earns its keep.

Several techniques matter:

- **Scan planning that maps deletes to files efficiently.** The engine should quickly determine, for each data file it will read, exactly which deletes apply, without scanning irrelevant delete information. Good metadata layout and planning make this cheap.
- **Vectorized execution.** Applying deletes as a bitmap against columnar batches is far faster than row-by-row checks. A vectorized reader can mask out deleted positions across a whole batch at once, which keeps the delete application close to free when deletes are sparse.
- **File and partition pruning.** The fastest delete to apply is one on a file you never read. If query predicates let the engine skip data files entirely, it also skips their deletes. Strong pruning shrinks the problem before delete application even starts.
- **Caching.** Caching hot data files and their delete information avoids repeated I/O for frequently scanned partitions.

Here is the honest limitation, and it deserves to be stated without hedging: there is no such thing as free deletes. MOR does not make deletes free; it defers their cost to read time and spreads it across every query until you compact. I want to avoid the tempting overclaim that modern engines make MOR reads uniformly sub-second. They can be very fast, but that depends on table layout, delete density, and compaction discipline. A table with light, well-compacted deletes reads fast. The same table after a million tiny deletes with no compaction reads slowly, because the reader is now reconciling a mountain of delete information on every scan. The engine can optimize, but it cannot fully rescue a table that has been allowed to accumulate delete debt. Compaction is not optional; it is the other half of the MOR bargain.

There is a second cost that is easy to miss: query planning itself gets heavier as delete artifacts pile up. Before a single row is read, the engine has to enumerate the delete files or vectors that apply to the files it will scan. If that set is small and well-organized, planning is cheap. If a high-churn table has accumulated tens of thousands of tiny delete files because nobody compacted, the planner spends real time just assembling the list of deletes to apply, and that overhead is paid on every query regardless of how selective the query is. So delete debt shows up in two places at once, in planning and in scanning, which is why the read regression can feel disproportionate to the amount of data actually deleted. The deletes are small; the friction they create is not.

## Compaction Patterns for High-Churn Tables

Because MOR trades write cost for read cost plus maintenance, compaction is where you keep the trade in your favor. Compaction, in this context, means rewriting data files to physically remove deleted rows and clear the associated delete information, returning the affected files to a clean state where reads are fast again. Treat it as scheduled table maintenance, not something you do once and forget.

Practical guidance, drawn from how these tables behave in production:

- **Monitor delete density and delete file or vector count.** The signal you care about is what fraction of rows in a file are logically deleted and how many delete artifacts have accumulated. Rising delete density is your early warning that read latency is about to degrade.
- **Watch query latency as a leading indicator.** If scan times on a partition are creeping up while data volume is flat, delete accumulation is usually the cause. Latency drift is often visible before anyone looks at delete counts.
- **Compact active partitions more frequently.** Churn is rarely uniform. A CDC pipeline or a time-partitioned table concentrates changes in recent partitions. Compact the hot partitions on a tighter schedule and leave cold, stable partitions alone. There is no reason to rewrite a partition that has not changed in months.
- **Set a delete-density threshold for rewrites.** Rather than compacting on a fixed clock, trigger a data-file rewrite when delete density in a file or partition crosses a threshold you choose based on your read latency goals. This spends compaction effort where it actually buys read performance.
- **Separate high-churn from append-only tables.** Do not force append-only analytical data and high-churn operational data into the same table with the same maintenance policy. Their needs conflict. Split them so each gets the compaction cadence it deserves.

One trap to avoid is compacting on a naive fixed schedule that ignores where the churn actually is. If you rewrite every partition every night, you burn compute rewriting cold partitions that never changed, and you may still fall behind on the one hot partition that takes all the writes. The better pattern is to make compaction reactive to the signals above: rewrite when delete density crosses a threshold, prioritize the partitions that are actually churning, and leave stable data alone. This is also why compaction and clustering are related. Rewriting a hot partition is a chance to also cluster its data on the columns you filter by most, which improves pruning on future reads. Good maintenance does two jobs at once, clearing delete debt and improving physical layout, so treat the rewrite as an opportunity rather than pure overhead.

The [Iceberg maintenance documentation](https://iceberg.apache.org/docs/latest/maintenance/) covers the mechanics of rewriting data files and expiring snapshots. The strategic point is that maintenance is a first-class part of running MOR tables. Teams that treat compaction as an afterthought discover the cost as a slow, mysterious read regression that turns out to be delete debt.

## What This Means for Dremio and Open Lakehouses

The pattern across everything above is that deletion vectors and MOR give you faster, more flexible DML on open tables, but they shift work to two places: the read engine and the maintenance layer. That shift is the real story for choosing a platform. Open table formats are necessary but not sufficient. You also need an engine that reads MOR tables efficiently and a maintenance layer that keeps delete debt under control without a human babysitting it.

This is where [Dremio](https://www.dremio.com/) fits the open lakehouse. Its query engine uses vectorized execution and Apache Arrow to apply deletes and scan columnar data efficiently, which is exactly the read-time competence MOR demands. On the maintenance side, Dremio provides automatic table optimization for managed Iceberg tables, including compaction, manifest rewrite, clustering, and vacuum. That directly addresses the compaction discipline MOR requires: instead of standing up your own scheduled rewrite jobs and hoping you tuned the thresholds correctly, the maintenance runs as a managed capability. Dremio's Open Catalog is built on Apache Polaris, so the table format and catalog stay on open standards rather than a proprietary path. The write-up on [running an Iceberg lakehouse without the operational headaches](https://www.dremio.com/blog/5-ways-dremio-delivers-an-apache-iceberg-lakehouse-without-the-headaches/) covers the maintenance angle in more depth.

The Autonomous Reflections and automatic table optimization angle is worth drawing out, because it changes who does the tuning. Setting a good compaction policy by hand requires watching delete density, guessing thresholds, and adjusting as workloads shift. That is exactly the kind of ongoing judgment that a platform managed for agents can take over. When compaction, manifest rewrite, clustering, and vacuum run automatically against managed Iceberg tables, the delete debt that MOR accumulates gets paid down without a human tracking it, and the read engine keeps seeing clean tables. The value is not that maintenance disappears. It is that maintenance stops being a manual chore that teams forget until reads slow down.

It is fair to note this neutrally: Dremio is not the only engine investing here. Other engines, Snowflake among them, are building Iceberg DML interoperability, and that broad investment is good for the format because it means MOR tables written by one engine can be read and maintained by another. The market lesson is not about one vendor. It is that open table formats need intelligent maintenance and fast readers, and platforms that provide both make MOR practical rather than a footgun. The openness is what keeps you from trading one lock-in for another: because the table is Iceberg and the files are yours, you can move between engines as your needs change, which is a very different position from betting your DML-heavy workload on a proprietary format you cannot leave.

## Where to Start

If you are turning on merge-on-read for a high-churn Iceberg table, decide your compaction strategy in the same sprint, not after read latency degrades. Pick a delete-density threshold, separate your churny tables from your append-only ones, and confirm your read engine applies deletes with vectorized execution rather than row-by-row materialization.

To see automatic compaction, manifest rewrite, clustering, and vacuum handle the maintenance side of MOR on managed Iceberg tables, with a vectorized engine on the read side, start a project at [dremio.com/get-started](https://www.dremio.com/get-started) and point it at a table you expect to update often.
