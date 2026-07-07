---
title: "Delete Files vs Deletion Vectors in Apache Iceberg: How V3 Rewrote the Economics of Changing Data"
date: "2026-07-06"
canonical: https://iceberglakehouse.com/posts/iceberg-v3-positional-deletes-deletion-vectors-event-lakes/
description: "Iceberg v2 delete files vs v3 deletion vectors. How Roaring bitmaps and per-file vectors transformed merge-on-read performance for CDC and streaming workloads."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - data engineering
  - lakehouse architecture
  - open table formats
  - merge-on-read
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-v3-positional-deletes-deletion-vectors-event-lakes/).

# Delete Files vs Deletion Vectors in Apache Iceberg: How V3 Rewrote the Economics of Changing Data

*By Alex Merced, Head of Developer Relations at Dremio*

Here is a fact that surprises almost everyone the first time they hear it: in a data lakehouse, deleting a single row is one of the hardest things you can do.

Inserting a billion rows? Easy. Scanning a petabyte? Routine. But run `DELETE FROM orders WHERE order_id = 12345` against a table built on files in object storage, and you have asked the system to do something its foundations actively resist. The files that hold your data cannot be edited. Object stores like Amazon S3 do not let you open a file and change byte 4,000,017. Files get written once, read many times, and eventually removed. That is the deal.

Apache Iceberg's answer to this constraint has evolved across versions of its table format spec, and the evolution tells a great engineering story. Version 2 introduced delete files, which made row-level changes practical. Version 3 introduced deletion vectors, which made them fast and stable under pressure. The difference between the two sounds like a storage detail, but it reshapes how reads behave, how updates scale, and what kinds of workloads a lakehouse can honestly support.

This article is a deep dive into both mechanisms, written for the reader who wants the logic to actually make sense rather than just memorizing feature names. We will build up from first principles: why immutability forces strange designs, how v2 delete files work and where they hurt, what deletion vectors change, and why the access patterns improve so dramatically. No prior knowledge of the spec required. Some patience for analogies strongly recommended, because I intend to use several.

## The Problem: Editing Books in a Library That Forbids Pens

Let me set up the mental model we will use for the whole article.

Picture a vast library. Every book in it is printed, bound, and sealed. The library's one absolute rule is that nobody may write in a book, tear out a page, or alter a volume in any way. You may add new books, and you may remove entire books from the shelves, but the books themselves are frozen the moment they arrive.

This library is an Iceberg table. The books are data files, typically Parquet. The rule is the immutability of object storage. And the catalog at the front desk, which tracks exactly which books belong to the current collection, is Iceberg's metadata layer. Every "edition" of the library, meaning every snapshot of the table, is just a list of which books count.

Appending data fits this world perfectly. New data becomes new books, and the catalog adds them to the list. Reading fits perfectly too. But now a patron walks in and says: paragraph three on page 212 of one specific book is wrong, remove it.

You have exactly two honest strategies.

Strategy one: reprint the book. Take the whole volume, typeset a new copy identical except for the offending paragraph, add the new book to the catalog, and drop the old book from the list. The library stays clean and simple. Every book on the shelf is fully correct, and readers just read. The cost lands entirely on the writer, who reprinted hundreds of pages to remove one paragraph. In Iceberg terms, this is copy-on-write. Deleting one row rewrites the whole data file that contains it.

Strategy two: publish errata. Leave the sealed book alone. Instead, print a slim companion pamphlet that says "in book X, ignore paragraph three on page 212," and file it in the catalog next to the book. Writing is now nearly free. The cost moves to every future reader, who must check for pamphlets before trusting any page. In Iceberg terms, this is merge-on-read, and the pamphlets are delete files.

Neither strategy is wrong. They trade the same total work between writers and readers. Copy-on-write suits tables that change rarely and get read constantly. Merge-on-read suits tables that change constantly, like anything fed by change data capture from an operational database, streaming updates, or frequent GDPR-style targeted deletes.

Iceberg v2 made merge-on-read a first-class citizen. And the entire story of this article is about what those pamphlets look like, because it turns out the format of an erratum matters enormously once you have millions of them.

## Iceberg V2 Delete Files: Two Kinds of Pamphlets

The v2 spec defines two kinds of delete files, and they answer the "which rows are dead" question in genuinely different ways. Understanding both is worth your time, because the difference explains a lot of real-world engine behavior.

**Position delete files** identify a dead row by its address: the path of the data file it lives in, plus its row number within that file. A position delete file is itself a data file, usually Parquet, whose rows are pairs like "file s3://bucket/data/00042.parquet, position 1387." The pamphlet says: in this exact book, ignore line 1,387.

Position deletes are precise. A reader holding a data file and its matching position deletes knows exactly which rows to skip, with zero ambiguity and no value comparisons. The catch is that the writer must know positions. To write "position 1387 is deleted," something first had to read file 00042 and find that the target row sits at position 1387. The writer pays a lookup cost to produce a cheap-to-apply delete.

**Equality delete files** identify dead rows by their values instead: "any row where order_id equals 12345 is deleted." No file paths, no positions. The pamphlet says: wherever you see this sentence in any book, ignore it.

Equality deletes flip the trade. The writer pays almost nothing. A streaming pipeline receiving "order 12345 was deleted" from a source database can write that fact immediately without scanning anything. This is why engines like Apache Flink lean on equality deletes for high-velocity change data capture. But the reader inherits the search. Every scan of potentially affected data must compare row values against the equality conditions to decide what survives. The delete is cheap to declare and expensive to apply, on every read, until compaction cleans it up.

So v2 gave the ecosystem a legitimate toolkit. Targeted engine-driven deletes and updates typically produced position deletes. Streaming CDC produced equality deletes. Compaction jobs periodically folded the pamphlets back into reprinted books. Merge-on-read on an open table format became real, and it is hard to overstate how important that was for bringing warehouse-style workloads onto data lakes.

Then people used it at scale, and the cracks showed.

## Where V2 Position Deletes Hurt: A Story of Too Many Pamphlets

The problems with v2 position deletes were not correctness problems. They were problems of accumulation and shape. Let me walk through them one at a time, because each one motivates a specific design choice in v3.

**Problem one: pamphlets multiply.** Every delete operation writes new delete files. Run a small targeted delete every five minutes against the same hot data, and you do not get one growing erratum per book. You get a fresh stack of tiny pamphlets with every commit. A data file that suffers frequent updates might have dozens or hundreds of position delete files referencing it across the table's current snapshot.

Now think about what a reader must do. To scan one data file correctly, the engine must find every delete file that might apply to it, open each one, read the positions, and merge them all into a single picture of which rows are dead. That means many small reads against object storage, where every request carries latency and cost. It means memory spent holding and merging position lists. The AWS analytics team described this exact failure mode when explaining the motivation for v3: many small delete files placing a heavy burden on engines through numerous file reads and costly in-memory conversions.

The library version: before reading one book, the librarian must gather forty pamphlets from different drawers, cross-reference all of them, and compile a master list of lines to skip. The reading itself was never the slow part.

**Problem two: pamphlets go stale and pile up.** Position delete files in v2 were not consolidated on write. New deletes did not merge with old deletes against the same data file. They just accumulated as additional files until a maintenance job compacted things. Between maintenance runs, read performance degraded steadily as the pamphlet stacks grew. Tables under constant modification needed aggressive, expensive compaction schedules just to hold query latency steady. Skipping maintenance for a busy week could mean noticeably slower dashboards by Friday.

**Problem three: the granularity dilemma.** Engines writing position deletes in v2 faced an awkward choice about how to scope delete files. Write one delete file per affected data file, and a commit touching ten thousand data files produces ten thousand new small files, an operational headache all its own. Write broader delete files scoped to a partition, and readers scanning any one data file must open delete files that mostly describe other data files, reading and filtering irrelevant positions. Neither option was good. Engines picked their poison, and users inherited whichever downside their engine chose.

**Problem four: the pamphlets were books.** This one is subtle but real. Position delete files in v2 were themselves Parquet files, with schemas, columns for the file path and position, headers, footers, and all the machinery of a general-purpose columnar format. Parquet is built for large analytical datasets, and it is wonderful at that job. Using it to store what is logically a set of integers is like using a shipping container to mail a postcard. Every read of a delete file paid format overhead to extract a small amount of very simple information, and file path strings repeated over and over inside them.

Add these up and you get the v2 experience under heavy churn: correct results, mounting read amplification, a growing metadata sprawl of tiny files, and a permanent tax paid to maintenance jobs to keep the whole thing acceptable. For moderate workloads it was fine. For the workloads people increasingly wanted, meaning near-real-time CDC mirroring of operational databases into the lakehouse, it strained.

The v3 designers looked at all four problems and noticed something: every one of them traces back to the decision to represent deletes as an open-ended pile of files that readers must discover and reconcile. Fix the representation, and the whole pile of problems collapses.

## Enter Deletion Vectors: One Card Per Book

Iceberg v3 replaces position delete files with deletion vectors, and the core idea fits in a sentence: every data file gets at most one compact, binary record of exactly which of its rows are deleted.

Not a stack of pamphlets. One card, kept current, per book.

Let me unpack the three design decisions packed into that sentence, because each one kills a specific v2 problem.

**Decision one: at most one deletion vector per data file per snapshot.** This is a hard rule in the spec, not a suggestion. When a writer deletes more rows from a data file that already has a deletion vector, it cannot just add another record. It must read the existing vector, merge the new positions into it, and write the result as the file's new single vector. The spec goes further for migration: if any position delete files still exist for a data file from its v2 days, a writer updating that file's deletes must fold them into the vector too, so readers holding a vector can safely ignore old position delete files entirely.

Notice what this does. The reconciliation work that v2 pushed onto every reader now happens once, at write time, performed by the party who is already writing anyway. Readers never merge anything. For any data file, there is one authoritative answer to "which rows are dead," and it is exactly one lookup away. Problem one and problem two die together. Delete information stops accumulating into stacks because the stack can never exceed height one.

**Decision two: the vector is a bitmap, not a list.** A deletion vector represents deleted positions as a Roaring bitmap, a compressed bitmap structure. I will explain bitmaps properly in the next section, because they are genuinely delightful, but the immediate point is compactness and speed. Checking whether row 1,387 is deleted becomes a bitmap membership test, one of the cheapest operations computers do, rather than a search through merged lists. Storage shrinks dramatically compared to Parquet files enumerating positions. Problem four dies here: the postcard finally travels as a postcard.

**Decision three: vectors live in Puffin files.** Puffin is a file format from the Iceberg project designed for exactly this category of thing: compact binary blobs of statistics and auxiliary structures that ride alongside data files. A single Puffin file can hold many deletion vectors for many different data files, and Iceberg's metadata records, for each data file, which Puffin file holds its vector plus the exact byte offset and length of the blob within it.

That last detail deserves a pause, because it solves problem three, the granularity dilemma, with real elegance. In v2 you chose between one delete file per data file (too many files) or broad delete files (irrelevant reads). In v3, writers get file-level granularity and file-count efficiency at the same time. A commit deleting rows across a thousand data files can pack a thousand deletion vectors into one Puffin file. Readers needing the vector for one specific data file seek directly to its offset and read only its bytes. Nobody reads anything irrelevant, and nobody floods the object store with thousands of tiny files. The trade-off simply no longer exists.

There is one more clever wrinkle: writers are not required to rewrite Puffin files that contain replaced vectors. If a vector inside a shared Puffin file gets superseded by a new merged vector elsewhere, the old bytes just become dead weight until maintenance reclaims them. That keeps the write path fast, and it is a classic Iceberg move, trading a little garbage for a lot of speed and letting cleanup happen asynchronously.

## Roaring Bitmaps, Explained Like You Are Human

I promised an accessible explanation of the bitmap, so let us earn the word "accessible."

Start with the plain idea. A data file holds rows at positions 0, 1, 2, and so on. Imagine a row of light switches, one per position. Switch on means deleted, switch off means alive. That row of switches is a bitmap. To ask "is row 1,387 deleted," you look at switch 1,387. No searching, no comparing, just a direct look. One bit of storage per row.

One bit per row is already tiny. A data file with a million rows needs a raw bitmap of one million bits, about 122 kilobytes, to describe any possible pattern of deletions across all of them. Compare that with a Parquet position delete file spelling out a long file path string and a big integer for every single deleted row.

But real deletion patterns let us do far better than raw bitmaps, because real patterns are not random. Deletes cluster. A batch job removes a contiguous chunk of rows that arrived together. A GDPR request touches a handful of scattered rows. Most files have either very few deletes or big dense runs of them. Roaring bitmaps are a widely used structure built to exploit exactly this, and they show up across serious data systems for good reason.

The intuition behind Roaring is neighborhood-level bookkeeping. The bitmap divides the full range of positions into fixed-size neighborhoods and picks a different representation for each neighborhood depending on how many switches are on there. A neighborhood with just three deleted rows does not deserve a full grid of switches. It stores a short list: "3, 41, 907." A neighborhood where deletion is heavy flips to the actual bit grid, which is more compact than a long list once membership gets dense. Runs of consecutive deletions can be recorded as ranges: "everything from 20,000 to 45,000 is deleted" is one compact fact rather than 25,000 entries.

Each neighborhood independently picks whichever representation is smallest for its own situation, and the structure adapts as deletes accumulate. The result stays small whether a file has five deleted rows, five million, or a solid block in the middle. Membership tests stay fast in every representation. And merging two Roaring bitmaps, exactly the operation writers perform when folding new deletes into an existing vector, is fast and well-trodden, since the format has years of production hardening across the industry behind it. Iceberg's spec builds on this foundation, using 64-bit row positions with the standard 32-bit Roaring machinery covering the ranges that practically occur.

Back to the library one more time. The v2 pamphlet stack made the librarian collect and cross-reference errata before every reading. The v3 card is a single laminated sheet clipped inside the book's front cover, marked up in a shorthand that compresses "ignore lines 20,000 through 45,000" into a single stroke. The librarian glances at the card and reads. That is the whole ceremony now.

## How the Access Patterns Actually Change

Formats are means. Access patterns are the ends. Let us walk through the moments in a table's life and watch what changed, because this is where the design decisions become felt experience.

**The read path.** In v2, planning a scan over a data file meant consulting metadata for all position delete files whose scope might cover it, fetching those files from object storage, decoding Parquet, filtering out entries about other data files, and merging everything into an in-memory structure before the actual data scan could apply it. The cost scaled with delete history: the more modification a file had suffered since its last compaction, the more work every subsequent query performed, over and over.

In v3, planning finds one metadata entry per data file pointing at one blob. The engine issues one ranged read at a known offset, gets a Roaring bitmap, and streams the data file while testing each row position against the bitmap. The cost is flat. It does not matter whether the file endured one delete commit or one thousand since compaction, because writers merged history into a single current vector as they went. Query latency stops degrading between maintenance runs, which the community has repeatedly called out as the headline benefit: performance no longer decays as deletions accumulate, and cost spikes from delete-file sprawl stop appearing.

**The write path.** Writers took on the merge obligation, so are writes worse? Barely, and the work is proportionate. A delete commit identifies affected data files, computes new dead positions, loads each affected file's existing vector if one exists, unions the bitmaps, and writes fresh vectors packed into a new Puffin file. Bitmap unions are cheap, and the writer was already doing per-file work to find the positions. Compare that honestly against v2's alternative: v2 writes were only cheaper because they quietly deferred reconciliation onto every future reader, forever, until compaction. V3 moves a small, bounded cost to the one moment where it is paid exactly once. This is simply better accounting.

**Change data capture and streaming.** This is the workload that motivated so much of the design, and it is where the improvement compounds. A CDC pipeline mirroring an operational database delivers a relentless drizzle of small updates and deletes. Under v2, that drizzle became continuous growth in delete file count, which became read amplification, which became a compaction treadmill you could never step off. Under v3, the same drizzle becomes in-place refinement of per-file vectors. Community benchmarking of merge-on-read under v3 has shown filtered reads seeing dramatic speedups under high churn, with the advantages growing as change volume scales. The AWS teams that benchmarked v3 deletion vectors against v2 position deletes on EMR and elsewhere frame the same conclusion: stable query performance and reduced fragmentation over time, in heavy-update scenarios that previously required constant babysitting.

**Maintenance.** Compaction does not disappear in v3, and nobody should tell you it does. Data files still accumulate deleted rows that occupy space until a rewrite physically drops them, and heavily deleted files still deserve rewriting for scan efficiency. What changes is the pressure. In v2, compaction defended query latency itself, so falling behind hurt immediately and visibly. In v3, queries hold steady on their own, and compaction returns to its proper job of reclaiming storage and right-sizing files on a relaxed schedule. Fewer emergency maintenance windows, more boring Tuesdays. In data infrastructure, boring is the highest compliment.

**Concurrency.** A quieter benefit worth naming: the one-vector-per-file rule gives concurrent writers a crisp conflict model. Two commits deleting rows from the same data file visibly contend on that file's vector, and Iceberg's optimistic concurrency handles retry and merge cleanly. In v2, overlapping delete commits could both succeed by each adding pamphlets to the pile, papering over contention by making readers pay for it later. V3 surfaces the conflict at the moment it happens and resolves it once.

## What About Equality Deletes?

A careful reader will have noticed that everything above concerns position deletes. So what happened to equality deletes, the write-cheap pamphlets that streaming engines love?

They survive in v3. Deletion vectors are positional by nature. A bitmap of row positions can only be built by something that knows positions, which means something that has located the target rows. Equality deletes exist precisely for writers who refuse to pay that lookup at write time, so a bitmap cannot replace them without destroying their reason to exist.

The practical pattern in the ecosystem is a division of labor across time. Streaming writers land equality deletes for immediate, cheap durability of change events. Maintenance and compaction processes then convert that backlog, resolving equality conditions into concrete row positions and folding the results into deletion vectors, restoring the fast stable read path. Equality deletes work as a short-term buffer, and deletion vectors work as the settled steady state. Meanwhile the position delete file, the v2 workhorse, is formally deprecated in v3. New tables on the v3 format produce deletion vectors for positional deletes by default, and the spec requires that when updating deletes for a data file, any lingering position deletes get absorbed into its vector.

The deprecation is worth dwelling on for a moment, because table format specs rarely remove things. Deprecating position delete files was the community saying, with unusual clarity, that the v2 representation was a dead end at scale and the ecosystem should converge on the vector model. That kind of decisive pruning keeps a spec healthy. It is also a small window into how Iceberg evolves: real workloads exposed real limits, the community absorbed lessons from across the industry, including similar vector designs proven elsewhere, and the format moved. Open standards improve in public, and this feature is one of the cleaner examples I can point to.

## A Worked Example: One Table, One Week, Both Worlds

Abstractions settle best with a story, so let us run the same week twice.

The table is `customer_orders`, merge-on-read, fed by CDC from a production database. It holds 2,000 data files. Business is steady: all week, order corrections and cancellations trickle in, touching a few thousand rows spread across roughly 400 of those files, in small commits landing every few minutes.

**The week on v2.** Each commit writes position delete files covering the rows it touched. By Wednesday, hot data files each have fifteen or twenty small delete files pointing at them, and the table has accumulated thousands of new delete files overall. The nightly dashboard queries scan wide ranges of the table, and each scanned data file drags its personal pile of pamphlets into memory first. Object storage request counts swell. Latency climbs a little each day, the way it always does, and the platform team's compaction job on Thursday night brings it back down, the way it always does. Everyone has stopped questioning this rhythm. It is just what the lakehouse costs.

**The week on v3.** Each commit computes positions for the rows it touched, merges them into the existing vectors for the affected data files, and writes the updated vectors packed into one new Puffin file per commit. A hot data file that gets touched thirty times during the week still has exactly one deletion vector on Friday, reflecting all thirty commits. Dashboard queries fetch one small blob per scanned file, all week, at flat cost. Thursday's compaction still runs, but it is reclaiming space from deleted rows at leisure, not rescuing query latency. Nobody notices anything, which is the point. The dramatic version of this story is that there is no dramatic version anymore.

Same table, same business events, same total information. The only thing that changed is the shape of the bookkeeping, and the shape turned a weekly performance sawtooth into a flat line.

## Practical Guidance for Adopting Deletion Vectors

Some grounded advice for putting this into practice, drawn from where the ecosystem stands today.

Check your engine versions before you leap. Deletion vectors require Iceberg format version 3, and v3 support has been rolling across the ecosystem since the spec's ratification in mid-2025. Apache Spark support arrived through recent Iceberg releases, engines like Dremio and Trino and the major cloud services have been shipping v3 capabilities, and vectors are produced by default once a table is on format version 3 in current implementations. Verify every engine that touches a shared table, readers included, since a v3 table with vectors is not legible to a reader that only speaks v2.

Upgrade deliberately. Moving a table to v3 is a metadata operation, a table property change setting the format version, and existing data files stay valid. Existing v2 position delete files also remain readable, and the spec's migration rule handles convergence: as writers touch files, old position deletes get folded into new vectors. A table under active modification therefore migrates itself gradually. Running a compaction after upgrading accelerates the convergence and gets you to the clean steady state sooner.

Revisit assumptions that v2 taught you. If your platform runs aggressive compaction schedules purely to defend read latency against delete file sprawl, v3 likely lets you relax the frequency and spend that compute elsewhere. If you steered workloads toward copy-on-write specifically because merge-on-read reads degraded too fast, that calculus deserves a rerun, since merge-on-read under vectors holds up far better. Copy-on-write still wins for read-hot, rarely modified tables. The gap for update-heavy tables just narrowed a lot.

And keep expectations honest. Deletion vectors do not make deleted rows free. The dead rows still sit inside data files consuming storage until a rewrite drops them, and a file that is 90 percent deleted still deserves compaction. Vectors fix the cost of knowing what is deleted, which was the part that scaled badly. Physical cleanup remains a maintenance concern, just a calmer one.

## Questions I Hear Most Often

When I cover this topic at meetups and on my podcast, a familiar set of questions comes back from the audience. Working through them here fills in edges the main narrative skipped, and each answer is a chance to reinforce the core model.

**Do deletion vectors change my query results in any way?** No. Vectors and delete files are alternative encodings of the same logical fact, namely the set of rows that no longer belong to the current snapshot. A query against a v3 table with vectors returns exactly what the equivalent v2 table would return. What changes is the cost profile of producing that answer, not the answer. Correctness was never v2's problem.

**How do deletion vectors interact with time travel?** Beautifully, and this trips people up in a good way. Iceberg snapshots are immutable, and each snapshot references the specific vectors that were current when it was committed. When a writer merges new deletes into a file's vector, it writes a new vector for the new snapshot. The old snapshot still points at the old vector. Query the table as of last Tuesday and you get last Tuesday's deletion state, applied through last Tuesday's vectors. Nothing about the vector model weakens the format's history guarantees, since vectors participate in snapshots exactly like data files always have.

**Does a delete now require reading data files to find row positions?** For positional deletes, yes, something has to locate the target rows, and that was equally true in v2 for position delete files. The engine scans candidate files, identifies matching rows, and records their positions. Iceberg's metadata makes this cheaper than it sounds, since partition pruning and column statistics narrow the candidate files before any scanning starts. And for writers that genuinely cannot afford the lookup, equality deletes remain available as the deferred option, as covered earlier.

**What happens if a data file has both an old position delete file and a new deletion vector?** The spec resolves this cleanly in favor of the vector. When a writer creates a vector for a data file, it must absorb all previously written position deletes for that file, and from that point readers holding the vector can ignore matching position delete files entirely. There is never a situation where a reader must combine both representations for one file. One card per book, and once the card exists, the pamphlets for that book are void.

**Can multiple deletion vectors share a Puffin file, and does that cause coupling problems?** Many vectors can share one Puffin file, and no, coupling stays loose. Each vector is addressed by its own offset and length within the file, so readers touch only the bytes for the data file they care about. When one vector in a shared Puffin file gets superseded, the others remain perfectly valid where they sit, and the stale bytes wait for cleanup. Writers gain the file-count efficiency of packing without readers inheriting any cross-file entanglement.

**Is this the same as Delta Lake's deletion vectors?** The family resemblance is real and acknowledged. Delta Lake shipped a deletion vector feature earlier, and the broader industry, including systems well outside the table format world, converged on compressed bitmaps for row invalidation because the approach genuinely works. Iceberg's version is its own design within the Iceberg metadata model, with the one-vector-per-file rule, Puffin storage, and spec-mandated migration behavior. I take the convergence as a healthy sign. When independent communities land on the same shape of answer, the shape is probably right.

**Does merge-on-read now beat copy-on-write everywhere?** No, and beware anyone selling that conclusion. Copy-on-write still produces the purest read path there is, plain data files with nothing to check, and for tables that are read constantly and modified rarely, rewriting the occasional file remains a great bargain. What v3 changed is the slope of the trade. Merge-on-read used to degrade under churn badly enough that teams avoided it even for workloads it suited. Now it holds steady, so the decision returns to the honest fundamentals: modification frequency, read patterns, and latency requirements, rather than fear of pamphlet sprawl.

**Do I still need to run compaction and snapshot expiration?** Yes, on both counts, and it bears repeating because "vectors fix deletes" is easy to over-read. Deleted rows still physically occupy space inside data files until compaction rewrites them out. Old snapshots still pin old files, vectors included, until expiration releases them. Vectors removed the emergency from maintenance, not the need for it. Think of v3 as converting maintenance from a performance defense into routine housekeeping.

**How does this affect my object storage bill?** Generally favorably, through two channels. Request counts drop, since readers fetch one ranged blob per data file instead of opening piles of small delete files, and request charges on high-traffic tables are a real line item. Storage for delete information drops too, since compressed bitmaps are far smaller than Parquet files enumerating paths and positions row by row. Offsetting this slightly, superseded vectors linger in shared Puffin files until cleanup. Net effect across published tests and field reports points the right direction: less storage, fewer requests, cheaper scans.

**Where should I go deeper after this article?** The Iceberg spec's sections on row-level deletes and the Puffin format are more readable than most specs, and the engine documentation for whatever you run, whether Dremio, Spark, Trino, or a managed service, will cover the version knobs and defaults. The benchmark posts from AWS and community authors on v2 versus v3 delete performance are worth your time for concrete numbers on workloads resembling yours. And the dev list archives show the design discussions themselves, which I find is where the deepest understanding lives.

## The Bigger Lesson Hiding in a Small Feature

Zoom out with me, because I think deletion vectors teach something beyond Iceberg.

Every durable storage system that supports modification eventually faces the same question: when you cannot change the past, where do you record the corrections? Accountants faced it centuries ago and invented adjusting entries rather than erasing ledgers. Version control systems faced it and chose immutable commits with evolving references. Iceberg v2 and v3 are two answers to the same question, and the difference between them is a lesson in where to spend work.

V2 let corrections accumulate as an open set of records and asked readers to assemble the truth. V3 requires writers to maintain the assembled truth continuously, one compact structure per data file, so readers just look it up. The total information is identical. The difference is that v3 does the assembly once, at the moment of change, instead of on every read forever after. Almost every scaling problem in data systems eventually yields to some version of this move: find the work being repeated implicitly, and do it once explicitly.

It also shows why representation is destiny. Position delete files and deletion vectors encode the same facts. Yet one representation produced file sprawl, read amplification, and a maintenance treadmill, and the other produced flat lookups and bounded state, purely through choices about granularity, format, and ownership of the merge. When someone tells you a format war is bikeshedding, remember this pair.

If you take one model away from this article, take the library. V2 answered "which rows are deleted" with a stack of pamphlets the reader must reconcile. V3 answers it with one laminated card per book, kept current by whoever last made a change, written in a shorthand built for exactly this job. Everything else, the Puffin packing, the Roaring compression, the one-per-file rule, the deprecation of the old way, is engineering in service of that single clean idea.

The lakehouse promise has always been warehouse capabilities on open, ownable storage. Row-level change was the capability where that promise strained hardest, and deletion vectors are the moment it stopped straining. Tables that mutate constantly now behave like tables, not like archives with apology notes attached.

If explanations like this one work for you, this is how I write books too. I co-authored Apache Iceberg: The Definitive Guide and Apache Polaris: The Definitive Guide for O'Reilly, and I have written additional titles on lakehouse architecture, data engineering, and AI, all built around making the underlying logic of these systems genuinely understandable. You can browse the full collection of my books on data and AI at [books.alexmerced.com](https://books.alexmerced.com).
