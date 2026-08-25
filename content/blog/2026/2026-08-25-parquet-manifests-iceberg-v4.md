---
title: "Parquet-Only Manifests in Iceberg v4: Why the Metadata Layer Is Going Columnar"
date: "2026-08-25"
description: "Iceberg v4 is moving manifests from Avro to Parquet so planners can read only the stats they need. Why the metadata layer is going columnar."
author: "Alex Merced"
category: "Apache Iceberg"
canonical: https://iceberglakehouse.com/posts/parquet-manifests-iceberg-v4/
tags:
  - Apache Iceberg
  - Iceberg v4
  - Parquet
  - metadata
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/parquet-manifests-iceberg-v4/).

Picture a table with 40 million data files. Every one of those files has an entry in a manifest, and every entry carries per-column statistics for 300 columns. A query arrives that filters on one timestamp column and touches two others. To plan that query, the engine has to walk the manifests, compare the timestamp bounds of each file against the predicate, and decide which files to open. In theory that is a cheap job. The engine only needs three things per entry: the file path, the partition tuple, and the lower and upper bound of one column.

In practice, the engine reads everything. It reads the value counts for all 300 columns, the null counts for all 300, the sizes for all 300, the lower bounds for all 300, and the upper bounds for all 300. Then it throws 297 of them away. That is what happens when metadata lives in Apache Avro, a row-oriented format that hands you a whole record or nothing. On a small table nobody notices. On a table with tens of millions of files, planning time turns into minutes, and the cost of every query includes a large tax before a single byte of real data gets read.

The Apache Iceberg community has been working on the fix for a while, and in August 2026 the question sharpened: should the v4 specification allow manifests only in Apache Parquet, with no Avro option at all? This article explains the mechanism behind that question, what changes when metadata goes columnar, and what it means for anyone running an engine or building an integration against Iceberg tables.

I work at Dremio, which builds a lakehouse platform around Iceberg and contributes to the project. I will use Dremio as an example where it helps, but the ideas here apply to every engine that reads Iceberg.

## How Iceberg Ended Up With Row-Oriented Metadata

Iceberg's original design goal was to fix a problem that Hive-style tables had on object storage. Hive tracked data by directory: a partition mapped to a folder, and every file in that folder was part of the table. That worked on HDFS, where directory listings were fast. It fell apart on Amazon S3 and similar stores, where listing millions of objects across nested prefixes was slow, expensive, and throttled under load.

Iceberg replaced directory listing with explicit file tracking. Each snapshot of a table points at a manifest list, the manifest list points at manifest files, and each manifest lists a set of data files along with statistics about each one. An engine never lists a directory. It reads the metadata tree and gets an exact inventory of the files that make up the table at a given point in time, plus enough statistics to skip most of them without opening them.

When that tree was designed, Avro was a sensible choice for manifests. Avro is a compact, schema-driven, row-oriented format with strong support in the Java ecosystem where Iceberg started. Manifests were small. An engine read a manifest as a stream of records, evaluated each one, and moved on. Reading whole records was fine because the records were short and the manifests were few.

Two things changed. Tables got wider, and tables got bigger. A modern event table or feature table for machine learning often has hundreds of columns. The Iceberg spec stores several maps per data file entry, keyed by column ID: column sizes, value counts, null value counts, NaN value counts, lower bounds, and upper bounds. With 300 columns, each entry carries six maps of 300 entries each. Multiply that by millions of data files and the manifest layer alone runs to many gigabytes.

The second change was the way engines use manifests. Early on, most planning was partition pruning: match the partition tuple against the query, keep or drop the file. Today, engines lean much harder on column statistics. Min and max bounds drive file skipping for non-partition columns. Null counts short-circuit IS NULL predicates. Value counts feed cost estimates. Planning reads far more of the manifest content than it once did, but it still reads the same handful of fields per query. The mismatch between what planning needs and what Avro delivers is the whole problem.

## What Scan Planning Actually Reads

To see why format matters, walk through what an engine does when it plans a scan against an Iceberg table.

First it reads the table metadata file, a JSON document that holds the schema, partition specs, sort orders, snapshot history, and a pointer to the current snapshot. This is small and rarely the bottleneck.

Second it reads the manifest list for the current snapshot. The manifest list is itself an Avro file. Each row describes one manifest: its path, its length, the partition spec it was written with, the snapshot that added it, counts of added, existing, and deleted files, and a summary of partition bounds across everything in that manifest. Engines use the partition summaries to skip whole manifests. If the query filters on a date and the manifest's date range does not overlap, the engine never opens that manifest.

Third it opens the surviving manifests and evaluates each data file entry. This is where the volume lives. For each entry the engine applies three kinds of filters. Partition filters compare the entry's partition tuple against the query. Metrics filters compare the entry's lower and upper bounds, null counts, and NaN counts for the columns in the predicate. Residual evaluation figures out which parts of the predicate still need to run at read time because the statistics did not settle them.

Notice what that third step touches. Per entry, planning needs the file path, the content type (data or delete), the partition tuple, the record count, and the statistics for the specific columns that appear in the predicate. It does not need the column sizes for every column. It does not need bounds for columns the query never mentions. It does not need split offsets or the sort order ID until much later, when tasks are being assembled, and even then only for the files that survived.

On a 300-column table with a two-column predicate, planning needs bounds for 2 columns and reads bounds for 300. It needs null counts for maybe 2 and reads 300. The ratio of bytes read to bytes used runs somewhere around 100 to 1 on the statistics maps, and the statistics maps are the bulk of the entry.

That ratio is the reason columnar metadata matters. A columnar layout lets the engine read the file path column, the partition column, and two specific bound columns, and skip the rest on disk. Avro cannot do that. A row-oriented format has no concept of reading part of a record. The bytes for all 300 columns are interleaved in the record, and the decoder has to walk through them to reach the next record.

## The Avro Tax: Where the Time Goes

There are three separate costs in reading an Avro manifest, and it helps to separate them because the columnar move addresses each one differently.

The first cost is bytes over the network. Manifests live on object storage. An engine planning a query pulls each manifest it needs from S3, GCS, or ADLS. If the manifest is 200 megabytes because it holds 100,000 entries with 300-column statistics, the engine transfers 200 megabytes even though it will use 2 megabytes of that content. Object stores are fast, but they are not free, and a planning step that reads gigabytes of manifests before every query adds latency that no amount of compute can hide.

The second cost is deserialization. Avro's binary encoding is compact and schema-driven, which means the decoder cannot skip a field without decoding it. To find the lower bound for column 17 in an entry, the decoder reads the map for lower bounds and walks its entries until it hits key 17. To get to the next data file entry, it decodes every field in the current one, including all six statistics maps. This is CPU work, and it happens on the driver or coordinator node, which is usually the least parallel part of the system. I have seen planning phases where the coordinator pegged a core for 30 seconds decoding manifests while the executors sat idle.

The third cost is memory. Decoding a record materializes it as an object graph. Java Avro readers produce GenericRecord instances with nested maps and byte buffers. A manifest with 100,000 entries and 300 columns of statistics becomes hundreds of millions of small objects. That drives garbage collection on the coordinator, which is a known source of unpredictable planning latency on large tables.

Engines have built workarounds. Manifest caching keeps decoded manifests in memory across queries, which helps for repeated queries against the same snapshot but blows up memory on wide tables and goes stale on every commit. Projection tricks in the Avro reader let you skip top-level fields you do not need, but the statistics maps are single fields, so you either read the whole map or none of it. Parallel manifest reading spreads the decode work across threads, which helps CPU but does nothing for bytes transferred. The Iceberg REST catalog's server-side scan planning moves the whole problem to the catalog, which is a good architectural answer but still has to decode Avro on the server.

None of these fix the structural issue. The format forces the engine to read what it does not need. Changing the format is the only way to change that.

## Columnar Manifests: Projection and Vectorized Evaluation

Parquet is the columnar format that already holds the data in almost every Iceberg table. Moving manifests to Parquet means the metadata layer gets the same properties the data layer has had all along.

The first property is column projection. A Parquet file stores each column's values in its own contiguous chunk within a row group. A reader that wants three columns reads three chunks and skips the rest. Applied to a manifest, this means an engine planning a query with a predicate on columns 17 and 42 reads the file path column, the partition column, the record count column, and the bounds for columns 17 and 42. It never touches the bounds for the other 298 columns. Bytes transferred drop by roughly the ratio of needed columns to total columns.

For that to work, the statistics need to be stored as real columns rather than as opaque maps. This is where a companion v4 proposal comes in: typed column statistics. Instead of a single map field of lower bounds keyed by column ID, the manifest schema gets a nested struct where each tracked column has its own field, and within that field the lower bound, upper bound, value count, null count, and so on are typed subfields. Parquet stores nested structs as separate leaf columns, so each column's lower bound becomes its own projectable, prunable Parquet column. The map-to-struct change and the Avro-to-Parquet change reinforce each other. Either one alone gets you part of the benefit. Together they get you the whole thing.

The second property is vectorized evaluation. Once statistics are typed columns, an engine can pull a whole column of lower bounds into an Arrow array and evaluate the predicate across thousands of entries at once, rather than one entry at a time through a decoded object graph. Apache Arrow, co-created by Jacques Nadeau, is the in-memory columnar format that most modern engines already use for data. Using it for metadata too means the same SIMD-friendly kernels that filter rows now filter files. The per-entry object churn goes away, and with it most of the garbage collection pressure on the coordinator.

The third property is statistics on the statistics. Parquet writes min and max values for each column chunk in each row group. A manifest stored as Parquet gets those for free. The row group containing the lower bounds for column 17 has its own min and max of those lower bounds. That lets the engine skip whole row groups of manifest entries when the predicate cannot match anything in the range, before decoding a single entry. It is the same file-skipping trick Iceberg does for data, applied one level up the tree.

There is a fourth property that is easy to miss. Parquet compresses columnar data much better than Avro compresses rows. File paths in a manifest share long common prefixes, and dictionary encoding on a path column collapses them. Partition values repeat heavily and dictionary-encode well. Record counts and file sizes are integers that delta-encode tightly. The same manifest content stored as Parquet is smaller on disk, which compounds the projection savings.

## Page Index Pruning Inside the Metadata Tree

The row group statistics I described above are coarse. A row group in a manifest holds thousands of entries, and the min and max across thousands of files often span the whole domain of the column, which means no skipping happens. Parquet has a finer tool: the Page Index.

The Page Index, formalized in Parquet format 2.5, stores per-page column statistics (min, max, null count) in a dedicated structure at the end of the file, along with offset information for each page. A page is much smaller than a row group, often a few hundred to a few thousand values. With page-level statistics, a reader can skip individual pages within a row group rather than only whole row groups.

Applied to manifests, this changes the resolution of metadata pruning. Suppose a manifest holds 50,000 data file entries sorted by partition value. The row group min and max for the lower bounds of a timestamp column span months. The page min and max within that row group span days. A query for a single day skips almost every page in the manifest and decodes only the handful that overlap.

In the same August 2026 stretch of dev list activity, Shangqing Yang proposed adding Page Index pruning to Iceberg's own Parquet reader. That proposal matters twice over. For data files, it lets Iceberg's reader skip pages that the statistics rule out, which is the same thing engines like Dremio and Spark's vectorized reader already do with their own Parquet readers. For manifests, it means the reference implementation of Iceberg can prune manifest entries at page granularity as soon as those manifests are Parquet.

Here is the full pruning cascade an engine gets on a v4 table with Parquet manifests:

1. The root manifest (v4's replacement for the manifest list) tells the engine which leaf manifests overlap the query's partition range.
2. Within a surviving manifest, row group statistics skip whole groups of entries that cannot match.
3. Within a surviving row group, the Page Index skips pages that cannot match.
4. Within a surviving page, the engine decodes only the projected columns and evaluates them as vectors.
5. For each surviving data file, the engine reads its Parquet footer and repeats the whole cascade on real data.

Every stage narrows the work for the next one. On the 40-million-file table from the opening, a well-partitioned query with Parquet manifests reads a small fraction of the metadata bytes it reads today and decodes a smaller fraction still.

## How the Dev List Got to "Parquet Only"

The idea of Parquet manifests is not new. Russell Spitzer led a discussion thread in August 2025 titled "V4 - Parquet as Metadata File Format" and built a prototype. Anoop Johnson and others backed it as a natural fit with the typed column statistics proposal, and the community broadly agreed that v4 metadata files should be Parquet. The open question for the next year was whether Avro stayed as an option alongside Parquet or went away entirely for v4 tables.

The instinct during the v4 column update sync in early August 2026 was to keep Avro. It already exists, every reader supports it, and removing a working option feels like unnecessary breakage. Steven Wu pushed back on that instinct in a thread on the dev list, and his argument is the one that appears to be carrying the discussion.

His case has three parts. First, Avro manifests cannot support projection reads, which is the entire point of the change. Keeping Avro means keeping a format that defeats the design goal. Second, if both formats are allowed, every engine, every catalog, and every library that writes Iceberg has to choose. Most will choose Parquet for the projection benefit, so the Avro option buys nothing except a second code path that has to be tested and maintained forever. Third, Iceberg's stated priority is scan planning performance, and projecting column statistics out of manifests is where that performance comes from. A spec that makes the fast path optional is a spec that half its implementations will get wrong.

Anoop Johnson added a practical observation: Iceberg does not track the format of the root manifest today. Supporting Avro root manifests in v4 requires new tracking work in the metadata, and that work buys nothing. Russell Spitzer said he leaned toward Parquet-only as a step toward converging on a single file format across the project. Manu Zhang agreed and recalled a separate discussion about deprecating ORC. Péter Váry engaged as well, and the sync recording is public for anyone who wants the full context.

One detail keeps this from being a breaking change for existing tables. Upgraded tables keep their v3 Avro leaf manifests. The Parquet-only restriction applies to manifests written after the upgrade, not to history. An engine reading a v4 table that was upgraded from v3 has to read both, which is exactly what it does today when reading a v2 table that was upgraded from v1. Backward compatibility within a table is preserved. What goes away is the option to write new Avro manifests into a v4 table.

That is the state of things as I write this. Nothing is voted or final. The direction is clear enough to plan around, though, and the rest of this article assumes the Parquet-only outcome holds.

## What a Parquet Manifest Looks Like

Let me make this concrete with a schema. The exact v4 manifest schema is still being drafted, so treat what follows as illustrative of the shape rather than a copy of the spec. The point is to show how the map-to-struct and Avro-to-Parquet changes combine.

Today's v2 and v3 manifest entry, expressed as a simplified Avro-style schema, looks roughly like this:

```
manifest_entry {
  status: int
  snapshot_id: long
  sequence_number: long
  file_sequence_number: long
  data_file {
    content: int
    file_path: string
    file_format: string
    partition: struct<...>
    record_count: long
    file_size_in_bytes: long
    column_sizes: map<int, long>
    value_counts: map<int, long>
    null_value_counts: map<int, long>
    nan_value_counts: map<int, long>
    lower_bounds: map<int, binary>
    upper_bounds: map<int, binary>
    key_metadata: binary
    split_offsets: list<long>
    equality_ids: list<int>
    sort_order_id: int
    referenced_data_file: string
    content_offset: long
    content_size_in_bytes: long
  }
}
```

The six map fields are the problem. Each is a single field holding a variable-length list of key-value pairs. In Avro, reading `lower_bounds` for column 17 means reading the whole map. In Parquet, a map is encoded as a repeated group, and while Parquet can technically project into it, the reader still has to scan every key to find the one it wants, and the values are opaque binary with no usable statistics.

The typed statistics proposal restructures those maps into a struct keyed by column, with typed leaves. A v4-style entry, again simplified, looks more like this:

```
manifest_entry {
  status: int
  snapshot_id: long
  sequence_number: long
  file_sequence_number: long
  data_file {
    content: int
    file_path: string
    file_format: string
    partition: struct<...>
    record_count: long
    file_size_in_bytes: long
    column_stats: struct {
      col_1: struct {
        value_count: long
        null_value_count: long
        nan_value_count: long
        lower_bound: timestamp
        upper_bound: timestamp
        column_size: long
      }
      col_2: struct { ... typed for col_2 ... }
      ...
      col_300: struct { ... }
    }
    split_offsets: list<long>
    sort_order_id: int
    ...
  }
}
```

Three things change when this is stored as Parquet.

First, `column_stats.col_17.lower_bound` becomes its own leaf column in the Parquet file. A reader projecting that column reads that column's pages and nothing else. The bounds for the other 299 columns are never fetched.

Second, the leaf is typed. In today's manifests, bounds are serialized binary that the engine has to decode using the table schema. In the typed layout, the lower bound for a timestamp column is stored as a Parquet timestamp. That means Parquet's own writer computes min and max statistics for the page and row group, and those statistics are meaningful. The manifest gets real, prunable statistics on its statistics.

Third, the layout is extensible. Adding a new kind of statistic, say a distinct value estimate or a bloom filter reference, means adding a new optional subfield in the struct. Readers that do not know about it skip it. That is much cleaner than adding a seventh map.

Here is what a planning query against this layout looks like, expressed as SQL against the manifest as if it were a table. This is a conceptual illustration of the projection an engine performs, not a query any engine runs literally:

```sql
SELECT
  data_file.file_path,
  data_file.partition,
  data_file.record_count,
  data_file.column_stats.col_17.lower_bound,
  data_file.column_stats.col_17.upper_bound,
  data_file.column_stats.col_17.null_value_count
FROM manifest_file
WHERE status <> 2  -- exclude DELETED entries
  AND data_file.content = 0  -- data files only
  AND data_file.column_stats.col_17.upper_bound >= TIMESTAMP '2026-08-01'
  AND data_file.column_stats.col_17.lower_bound <  TIMESTAMP '2026-08-02';
```

Every column in the SELECT and WHERE is a leaf in the Parquet file. The engine's Parquet reader projects six leaves out of what is likely more than 1,800 (six statistics times 300 columns, plus the fixed fields). The two bound predicates push down to row group and page statistics, so the reader skips pages whose range of `col_17` lower bounds falls entirely after August 2 or whose upper bounds fall entirely before August 1. What comes back is an Arrow batch of surviving file paths, ready to become scan tasks.

Compare that to the Avro path: read every byte of the manifest, decode every entry into an object graph, walk six maps per entry to pull out column 17, evaluate the predicate per entry, discard the object graph. Same answer, a very different amount of work.

## Engine Compatibility and the Migration Path

Any change to the metadata format touches every reader, and Iceberg has a lot of readers. Here is how I think about the compatibility picture for the main engine families.

Spark with the Iceberg Java library gets the change through the reference implementation. When the v4 spec lands and the Java library implements Parquet manifest reading and writing, Spark inherits it. The Java library already depends on Parquet, so there is no new dependency. The work is in the manifest reader and writer classes and in the planning code that consumes them, which needs to be rewritten to project columns rather than iterate records.

Dremio, Trino, and other engines with their own Iceberg implementations have to implement the reader themselves. Every serious engine already has a fast vectorized Parquet reader for data files. Reusing it for manifests is the natural move, and it turns manifest planning into a Parquet scan with projection and pushdown, which is a path these engines have spent years optimizing. Dremio's Iceberg planning already leans on Arrow-native evaluation, and Parquet manifests remove the Avro decode step that sits in front of it.

PyIceberg, iceberg-rust, and iceberg-go each have to add Parquet manifest support to their own metadata readers. All three already depend on a Parquet implementation (pyarrow, the arrow-rs parquet crate, and the Go Arrow Parquet package respectively), so the dependency is not new. The work is again in the manifest layer and in planning.

Catalogs that implement server-side scan planning through the REST catalog's planning endpoints benefit most directly. Server-side planning already centralizes metadata reading in one place. Making that place read Parquet with projection is a single change that speeds up every client that uses the endpoint, including clients that have not upgraded their own libraries.

On migration, the important facts are these:

- A v3 table upgraded to v4 keeps its existing Avro manifests. Nothing gets rewritten at upgrade time.
- New manifests written after the upgrade are Parquet.
- Readers of a v4 table must handle both formats until the Avro manifests age out.
- Compaction and rewrite operations (rewriting manifests, expiring snapshots) gradually replace Avro manifests with Parquet ones as they touch them.

That last point is the practical migration path. Run a manifest rewrite after upgrading and the table's live manifests become Parquet in one operation. Expire old snapshots and the Avro manifests they reference become unreachable and eventually get deleted. Within a normal maintenance cycle, an upgraded table converges to all-Parquet metadata without any special effort.

There is one open question the community is still working through, raised in the same August thread cycle: should the spec define the expected lifecycle for that convergence, or publish guidance and leave it to operators? One suggestion on the table is eager conversion of cheap metadata at upgrade time while leaving expensive data migration alone. I expect this to become a recurring topic as v4 firms up, because the answer determines how long engines have to maintain the dual-read path.

Here is a comparison of the two formats along the axes that matter for planning:

| Property | Avro manifests (v1 to v3) | Parquet manifests (v4 proposal) |
|---|---|---|
| Read granularity | Whole record | Individual columns |
| Statistics layout | Six maps keyed by column ID | Typed struct per column |
| Bounds encoding | Opaque binary, decoded by engine | Native Parquet types |
| Pruning before decode | None within a manifest | Row group and page statistics |
| Evaluation model | Per-entry object graph | Vectorized Arrow batches |
| Compression | Row-level block compression | Column-level encoding plus compression |
| Extensibility | Add a new map field | Add a new optional subfield |
| Reader dependency | Avro library | Parquet library (already present in all engines) |

## What Breaks, and When

Columnar manifests fix a real problem, but they are not free of tradeoffs. Here are the failure modes I expect teams to hit, roughly in the order they show up.

**Small manifests get slower before big ones get faster.** Parquet has fixed overhead: a footer, row group metadata, page headers, and the Page Index. For a manifest with 50 entries, that overhead is a meaningful fraction of the file, and the reader does more work to open it than it does to stream 50 Avro records. The break-even point depends on width, but a rough rule is that manifests with fewer than a few hundred entries do not gain much from Parquet. This matters for streaming tables that commit tiny manifests every few seconds. The v4 root manifest design, which lets small commits inline entries rather than write a separate manifest, is the intended answer, and the two proposals should be evaluated together.

**Wide tables produce wide manifest schemas.** A 300-column table produces a manifest with more than 1,800 leaf columns. Parquet handles wide schemas, but writers have to buffer a page for every leaf column, and the footer grows with the column count. For a 2,000-column table, the manifest footer alone runs to megabytes, and the writer's memory footprint during a commit grows with it. The Parquet community is separately working on cheaper footers, and Iceberg's columnar metadata design leans on that work landing. If your tables are extremely wide, watch that dependency.

**Statistics for columns that do not exist yet.** Iceberg supports schema evolution. A manifest written when the table had 100 columns has a `column_stats` struct with 100 subfields. After the table grows to 150 columns, new manifests have 150. Readers have to handle manifests with different struct shapes in the same table, which is the same problem Parquet data files already solve through schema evolution by field ID. It works, but every engine's manifest reader has to implement it correctly, and this is a likely source of early bugs.

**Dual-format reading during migration.** For the life of an upgraded table's Avro manifests, every engine has to read both formats and produce identical planning results from each. That doubles the surface area for planning bugs. The safest approach is to treat the Avro path as frozen (it is the well-tested existing code) and put all new optimization work on the Parquet path. Teams should also run a manifest rewrite soon after upgrading to shorten the dual-format window.

**Manifest caching strategies change.** Engines that cache decoded Avro manifests in memory will find that strategy less useful with Parquet, because the whole point is to not decode the whole manifest. The replacement is caching Parquet footers and Page Indexes, which are small, plus caching the specific projected columns that recent queries have used. This is a different cache design with different eviction behavior, and engines that bolt Parquet reading onto an Avro-shaped cache will leave performance on the table.

**Predicate pushdown correctness on bounds.** Pushing a predicate to page statistics on a lower-bound column is subtle. The page min of `lower_bound` tells you the smallest lower bound in the page, which lets you skip the page when the query's upper limit falls below it. The page max of `lower_bound` does not tell you anything useful about whether files in that page overlap the query. Engines have to be careful to push the right half of each range predicate to the right statistics column. Getting this wrong produces silently incorrect results (skipped files that should have been read), which is the worst kind of bug in a query engine.

The warning signs for most of these are planning-time metrics. If planning time on a small streaming table went up after upgrading, you are hitting the small-manifest overhead. If commit latency went up on a wide table, you are hitting writer buffering. If the same query returns different row counts before and after a manifest rewrite, you have a dual-format or pushdown bug and should stop and file it.

## Operational Guidance for the Transition

If you run Iceberg tables in production and v4 is on your roadmap, here is how I prepare teams for it.

**Measure planning time now.** Before you can tell whether Parquet manifests helped, you need a baseline. Most engines expose planning duration separately from execution duration. Dremio's job profiles show it. Spark's Iceberg integration logs it at debug level and exposes scan metrics through the DataFrame API. Capture planning time for your ten most expensive queries on your ten largest tables. Those are the queries that stand to gain the most.

**Know your manifest sizes.** Query the table's `manifests` metadata table to get the count and size of live manifests. If the median manifest is under a megabyte and holds a few hundred entries, the Parquet change will not move your numbers much and your planning cost is elsewhere (probably too many small manifests, which is a compaction problem). If the median manifest is tens of megabytes with tens of thousands of entries on a wide table, you are the target case.

**Fix compaction first.** Parquet manifests amplify the value of well-organized manifests. A manifest that holds files from a single partition range sorts its entries by partition, which makes row group and page statistics tight and pruning effective. A manifest that holds a random mix of partitions has statistics that span the whole domain and prunes nothing regardless of format. Run manifest rewrites that group entries by partition before upgrading, and keep running them after.

**Plan the upgrade as two steps.** Upgrade the format version, then run a manifest rewrite to convert live manifests to Parquet. Do not rely on organic churn to convert them. The rewrite is a metadata-only operation, it does not touch data files, and it puts the table in a clean all-Parquet state that is much easier to reason about.

**Check every reader.** Make a list of everything that reads your tables: query engines, notebooks with PyIceberg, Rust or Go services, catalog scanners, data quality tools, lineage crawlers. Each of those has to support v4 Parquet manifests before you upgrade, or it stops working on that table. This is the same discipline that applied to the v2 to v3 upgrade, and it is the part teams most often skip.

**Budget coordinator memory differently.** Avro planning was memory-hungry because it materialized object graphs. Parquet planning is lighter on heap but heavier on off-heap Arrow buffers for the projected columns. Engines that let you tune the split need different settings. Watch coordinator memory during planning on your largest tables for the first week after upgrade.

**Use server-side planning if you can.** If your catalog supports the REST planning endpoints, route large-table planning through it. The catalog reads manifests once, close to storage, and hands clients a pre-pruned file list. This benefits from Parquet manifests immediately and insulates clients from having to implement the fast path themselves. Dremio's Open Catalog, powered by Apache Polaris, is one option here, and Polaris itself graduated to a top-level Apache project on February 18, 2026, so it is a stable open standard to build against.

## Where the Ecosystem Is Heading

Step back and the Parquet manifest question is one piece of a larger redesign. The v4 proposals as a group are about making the cost of a commit scale with the size of the change rather than the size of the table, and making the cost of planning scale with the size of the query rather than the size of the metadata.

The root manifest replaces the manifest list with a structure that can inline small changes, so a streaming commit does not have to write three files. Snapshot offloading moves old history out of the table metadata file so it stays small. Typed column statistics make the metadata queryable. Parquet manifests make it projectable. Page Index pruning in Iceberg's reader makes it prunable at fine granularity. Each is a separate vote, but they are one design, and the Parquet-only decision is what makes the rest of them work as intended.

Two broader shifts follow from this. The first is that Iceberg and Parquet are co-evolving more tightly than before. Variant and geospatial types already live as joint efforts across both specs. Columnar metadata depends on Parquet footer improvements. The efficient column updates discussion is partly a debate about which project should own logical file mapping. If you follow the Iceberg dev list, add the Parquet dev list to the assignment, because decisions ricochet between them.

The second shift is that Iceberg is consolidating on fewer formats. Russell Spitzer framed Parquet-only manifests as a step toward a single file format across the project, and Manu Zhang's mention of deprecating ORC points the same way. A project that supports Parquet, Avro, and ORC for data and Avro for metadata has a lot of surface area. A project that is Parquet at every layer has one reader to optimize, one set of statistics semantics, and one encoding roadmap. That is simpler for implementers, and simplicity in a spec tends to show up as correctness in the implementations.

For engine builders, the practical implication is that the vectorized Parquet reader is now the most important piece of code in an Iceberg integration, because it will read data and metadata alike. For operators, the implication is that the metadata layer is about to start behaving like the data layer: it will reward good layout, good sorting, and good compaction, and it will punish neglect in the same ways.

## Conclusion

Iceberg's metadata was designed to be read as rows, and for years that was fine. Tables got wide, statistics got heavy, and planning started spending most of its time reading bytes it never uses. Moving manifests to Parquet fixes that at the format level. Column projection reads only what the query needs, typed statistics make the manifest prunable by its own row group and page metadata, and vectorized evaluation replaces per-entry object churn with Arrow batches.

The August 2026 dev list discussion pushed the question from "should Parquet be an option" to "should Parquet be the only option," and the arguments for the second position are strong: Avro cannot do projection, dual formats double the maintenance burden for no benefit, and a spec that makes the fast path optional will see it skipped. Upgraded tables keep their Avro history, so nothing breaks, and a manifest rewrite converts a table to all-Parquet metadata in one maintenance operation.

If you run large Iceberg tables, measure your planning time now, fix your compaction, audit your readers, and plan the v4 upgrade as a two-step move. The teams that do that will see planning on their biggest tables go from a tax to a rounding error. The teams that do not will wonder why the upgrade did not help.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg internals and lakehouse architecture. *Apache Iceberg: The Definitive Guide* (O'Reilly) covers the metadata tree, manifests, and planning in depth, and *Architecting an Apache Iceberg Lakehouse* (Manning) covers the operational side of running these tables at scale. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
