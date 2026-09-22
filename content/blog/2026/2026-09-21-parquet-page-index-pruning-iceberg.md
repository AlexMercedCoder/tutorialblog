---
title: "Parquet Page Indexes and the Last Mile of Pruning in Apache Iceberg"
date: "2026-09-21"
description: "Parquet page indexes can cut selective Iceberg scans by an order of magnitude on sorted data. How they work, what they cost, and how to lay out tables."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Parquet
  - Apache Iceberg
  - Pruning
  - Performance
canonical: https://iceberglakehouse.com/posts/parquet-page-index-pruning-iceberg/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/parquet-page-index-pruning-iceberg/).

A query asks for one customer's orders from a 2 TB Apache Iceberg table. Planning goes well. Partition pruning and manifest statistics cut the scan from 16,000 data files to 12. The engine opens those 12 files, checks row group statistics, and keeps one row group in each. Then it reads that entire row group, 128 MB of compressed column data per file, to find perhaps 40 matching rows.

The first two levels of pruning did their job. The last level did not happen. Inside each row group, the matching rows sat in one or two pages out of hundreds, and the reader had no way to jump straight to them. It decompressed and decoded everything.

Parquet has carried the metadata to fix this for years. It is called the page index, and it records statistics and byte offsets for every data page in a column chunk. Engines that use it can skip individual pages inside a row group. For selective queries on sorted data, that turns a 128 MB read into a few hundred kilobytes.

Here is the surprising part. Iceberg's Java writer already writes page indexes into every Parquet data file by default. Iceberg's own Java readers do not use them. In August 2026, a new proposal on the Iceberg dev list revived a six-year effort to close that gap, with a proof of concept and early measurements.

This article explains how page indexes work at the byte level, shows a runnable experiment that measures page pruning with and without sorted data, and walks through where Iceberg stands. It also covers a correctness bug the proof of concept surfaced with nested data, and what you can do on the writer side today so your tables are ready when readers catch up.

## Three Levels of Skipping

Pruning in an Iceberg lakehouse happens at three levels. Each level uses different metadata, lives in a different place, and fails in its own way. Understanding the layers makes it clear where page indexes fit.

**Level one: files.** Iceberg manifests record per-file statistics for each column: lower and upper bounds, null counts, and value counts. Combined with partition values, these let the planner skip entire data files before opening any of them. This is Iceberg's signature capability, and it works in every engine that reads Iceberg metadata. It runs before any data file is touched.

**Level two: row groups.** Each Parquet file is split into row groups, which default to 128 MB in Iceberg (`write.parquet.row-group-size-bytes`). The Parquet footer records min and max statistics per column per row group. A reader that opens a file checks those statistics against the query's filter and skips row groups that cannot match. Iceberg's readers do this, along with dictionary-based filtering and bloom filter checks when bloom filters exist.

**Level three: pages.** Inside a row group, each column chunk is divided into pages, the unit of compression and encoding. Iceberg's default is 1 MB per page (`write.parquet.page-size-bytes`) with a cap of 20,000 rows per page (`write.parquet.page-row-limit`). Without a page index, a reader has no cheap way to know what values a page holds. Older Parquet versions stored statistics inside each page header, but reading those headers means reading through the column data itself, which defeats the purpose.

The gap between levels two and three is large. A 128 MB row group can hold hundreds of pages per column. If a filter matches values in two of those pages, level-two pruning still reads all of them.

Level three matters most for a specific query shape: highly selective filters on a column that the data is sorted or clustered by. Point lookups by ID, narrow time ranges on event tables, and single-tenant queries on tables sorted by tenant all fit. Full scans and aggregations over most of a table gain nothing, which is fine, because the page index costs nothing for readers that ignore it.

## Anatomy of a Page Index

The page index is two structures per column chunk, defined in the Parquet Thrift specification: the ColumnIndex and the OffsetIndex. Both live in the file after the row groups and before the footer. The footer's metadata for each column chunk records where each structure starts and how long it is, in the `column_index_offset`, `column_index_length`, `offset_index_offset`, and `offset_index_length` fields.

That placement is deliberate. The Parquet specification's design notes say the index structures are stored separately from the row group metadata so that readers not doing selective scans pay no I/O or deserialization cost for them. A full scan reads the footer, ignores the offsets, and moves on.

**The ColumnIndex** holds value statistics for each page in the column chunk. It has these fields:

- `null_pages`, a list of booleans marking pages that contain only nulls
- `min_values` and `max_values`, lists of lower and upper bounds for each page
- `boundary_order`, which says whether the page bounds are `ASCENDING`, `DESCENDING`, or `UNORDERED`
- `null_counts`, an optional list of null counts per page
- optional repetition and definition level histograms, added in later format versions for nested data

The bounds do not have to be exact. The specification lets writers store shorter values that still bound the page correctly, such as storing "B" and "C" instead of a long string that starts with B. This keeps the index small for wide string columns. In parquet-java, the `parquet.columnindex.truncate.length` setting controls this truncation, with a default of 64 bytes.

The `boundary_order` field enables a useful optimization. When page bounds are sorted, a reader can binary search the bounds to find matching pages instead of checking every page. For a column with 500 pages, that is about 9 comparisons instead of 500.

**The OffsetIndex** holds physical locations. It has one required list, `page_locations`, and each entry has three fields:

- `offset`, the byte position of the page in the file
- `compressed_page_size`, the page's size on disk, including its header
- `first_row_index`, the index of the first row in the page, relative to the row group

An optional list of unencoded byte array sizes rounds it out. It helps readers estimate memory before decoding.

The two structures answer different questions. The ColumnIndex answers "which pages of this column hold values that match the filter?" The OffsetIndex answers "where are those pages, and which rows do they cover?"

That second question matters because pages do not align across columns. A page of 20,000 small integers and a page of 400 long strings cover very different row ranges. If a filter on `event_id` selects rows 1,000,000 through 1,000,099, the reader needs the pages of every projected column that contain those rows. The `first_row_index` values in each column's OffsetIndex let the reader find them. The specification stores the OffsetIndexes for all columns of a row group together, because once a reader decides to skip rows in one column, it has to skip the same rows in every other column.

## What a Page Index Costs

Every metadata structure has a price. For page indexes, the price is small, and it is worth knowing where it shows up.

**File size.** Each page adds one entry to its column's ColumnIndex and one to its OffsetIndex. For a fixed-width column like a 64-bit ID, a ColumnIndex entry holds an 8-byte min, an 8-byte max, a null flag, and optionally a null count. An OffsetIndex entry holds an 8-byte offset, a 4-byte size, and an 8-byte first row index. Thrift encoding adds some framing. A few dozen bytes per page per column is a fair rule of thumb.

To see the scale, take a 128 MB row group where rows compress to about 40 bytes each. That row group holds roughly 3.3 million rows. With Iceberg's default cap of 20,000 rows per page, a narrow ID column splits into about 168 pages. At a few dozen bytes each, that column's two index structures come to a few kilobytes. Across a 30-column table, the whole page index for the row group lands in the low hundreds of kilobytes, well under one percent of the row group. String columns with truncated bounds cost more per entry, which is why truncation exists.

**Write time.** The writer already tracks page statistics as it builds each page, so recording them in an index adds little CPU. The writer holds the index entries in memory until the row group ends, then writes them near the footer. For very wide tables with many small pages, that memory is measurable but rarely significant.

**Read time for readers that ignore it.** Nothing. The footer records offsets, and a reader that does not want the index never reads it. This was an explicit design goal in the Parquet specification.

**Read time for readers that use it.** One extra small read per filter column per row group, plus the evaluation of page bounds. On unsorted data, this is pure overhead, which is why the Iceberg proof of concept measured a slight slowdown on random data, from 66.56 ms to 69.72 ms. A smart reader limits that overhead by checking row group statistics first and only loading page indexes for row groups where they have a chance to help.

The asymmetry is the key point. The cost is always small, and the benefit on sorted data is large. That is why writing page indexes by default is the right call for a general-purpose writer, even when many tables never benefit.

## How a Reader Uses the Index

A reader that supports page indexes follows a sequence that turns a filter into a small set of byte ranges. Walking through it shows where the savings come from and where the complexity hides.

**Step one: check row group statistics.** Page indexes do not replace row group pruning. The reader still skips row groups whose footer statistics rule them out. Page-level work only starts for row groups that survive.

**Step two: load the ColumnIndex for filter columns.** For each column referenced in the filter, the reader reads that column's ColumnIndex using the offset and length from the footer. This is one small read per column per row group.

**Step three: find matching pages.** The reader evaluates the filter against each page's bounds. With ascending or descending boundary order, it binary searches. With unordered bounds, it scans the lists. Pages whose bounds cannot satisfy the filter are marked as skippable. Pages that are all null get special handling for `IS NULL` and `IS NOT NULL` filters.

**Step four: convert pages to row ranges.** Using the filter column's OffsetIndex, the reader turns the matching pages into row ranges, such as rows 999,424 to 1,007,615. If the filter touches several columns, the reader combines their row ranges. An `AND` intersects them. An `OR` unions them.

**Step five: map row ranges onto every projected column.** For each column the query reads, the reader uses that column's OffsetIndex to find the pages overlapping the selected row ranges. A column with larger pages contributes more rows per page, so it reads some extra rows around the selection.

**Step six: read and decode only those pages.** The reader issues byte-range reads for the selected pages, often coalescing nearby ranges into fewer requests. It decodes them and then skips rows within each page that fall outside the selected ranges, so every column produces values for exactly the same rows.

**Step seven: apply the filter to rows.** Page pruning is conservative. A page's bounds only say that matching values can be present. The reader still evaluates the filter on each surviving row. This is the residual filter, and it guarantees correct results no matter how coarse the page bounds were.

Step six is where readers get hard. Each column has its own page boundaries, so the reader has to keep all columns synchronized to the same row positions while skipping different amounts of data in each. Nested columns make it harder, because a single row of a list or map spans a variable number of values, tracked by repetition and definition levels. A reader that loses track of those levels delivers values from the wrong row. The failure modes section returns to exactly this problem, because it showed up in Iceberg's proof of concept.

## An Experiment You Can Run

The fastest way to build intuition is to measure. Iceberg's Java readers do not use page indexes yet, so this experiment uses Apache DataFusion's Python bindings, whose Parquet reader does, with files written by PyArrow. The Parquet files are ordinary files of the kind any writer produces. The point is to see what page pruning does to the bytes read, not to benchmark a particular engine.

```python
import os
import re

import datafusion
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

N = 2_000_000
rng = np.random.default_rng(7)

base = pa.table({
    "event_id": np.arange(N),                              # the filter column
    "amount": rng.integers(0, 1_000_000, N),               # a value column
    "note": pa.array([f"n{i % 977}" for i in range(N)]),   # a string column
})
shuffled = base.take(pa.array(rng.permutation(N)))

def write(table, path, page_bytes, page_index=True):
    pq.write_table(
        table, path,
        row_group_size=N,              # one row group, so only pages can prune
        data_page_size=page_bytes,     # target page size in bytes
        write_page_index=page_index,   # write ColumnIndex and OffsetIndex
    )

write(base, "sorted.parquet", 64 * 1024)
write(shuffled, "random.parquet", 64 * 1024)
write(base, "sorted_no_index.parquet", 64 * 1024, page_index=False)

col = pq.ParquetFile("sorted.parquet").metadata.row_group(0).column(0)
print("has column index:", col.has_column_index, "has offset index:", col.has_offset_index)

QUERY = "SELECT sum(amount) FROM t WHERE event_id BETWEEN 1000000 AND 1000099"

for path in ["sorted.parquet", "random.parquet", "sorted_no_index.parquet"]:
    ctx = datafusion.SessionContext()
    ctx.register_parquet("t", path)
    plan = str(ctx.sql("EXPLAIN ANALYZE " + QUERY).collect()[0].column(1)[0])
    metrics = re.findall(r"(page_index_rows_pruned=[^,\]]+|bytes_scanned=[^,\]]+)", plan)
    print(path, metrics)
```

Here is what each part does.

The table has 2 million rows and three columns. `event_id` is the column the query filters on. `base` stores it in ascending order, and `shuffled` stores the same rows in random order. The data is identical. Only the physical order differs.

Every file uses a single row group. That removes row group pruning from the picture, since one row group with a min of 0 and a max of 1,999,999 always matches the filter. Any savings have to come from pages.

`data_page_size` sets the target page size, and `write_page_index` controls whether PyArrow writes the ColumnIndex and OffsetIndex. The third file is sorted but has no page index, which isolates the index's contribution from the sort's.

The metadata check confirms the index exists. PyArrow's column chunk metadata exposes `has_column_index` and `has_offset_index`, which read the offsets stored in the footer. This is a quick way to audit files from any writer.

The query selects 100 rows out of 2 million. `EXPLAIN ANALYZE` runs it and reports execution metrics. The regular expression pulls out two of them: `page_index_rows_pruned`, which reports how many rows the page index let the reader skip, and `bytes_scanned`, which reports the bytes actually read from the file.

Here are the results from one run, with DataFusion 54.0.0 and PyArrow 25.0.1.

| File | Rows kept after page index | Bytes scanned |
|---|---|---|
| Sorted, 64 KB pages, page index | about 8,190 of 2,000,000 | 1.29 MB |
| Random order, 64 KB pages, page index | 2,000,000 of 2,000,000 | 20.34 MB |
| Sorted, 64 KB pages, no page index | no page pruning | 18.42 MB |

The sorted file with a page index read about 7 percent of the bytes that the same data without an index needed. The random file read everything, even with a page index present. In shuffled data, every page's min and max span nearly the full range of IDs, so no page can be ruled out.

Two lessons come straight out of that table. The page index is necessary, but sorting is what makes it effective. And an index on unsorted data costs a little extra file size while saving nothing for range filters.

Page size changes the granularity. Rerunning the sorted case with different `data_page_size` values gives this.

| Target page size | Rows kept | Bytes scanned | File size |
|---|---|---|---|
| 8 KB | about 1,020 | 1.18 MB | 20.6 MB |
| 64 KB | about 8,190 | 1.29 MB | 19.2 MB |
| 1 MB | 20,000 | 1.45 MB | 19.2 MB |

Smaller pages keep fewer rows, but they compress less well and make the file larger. The 1 MB case is also instructive. It kept exactly 20,000 rows because PyArrow, like Iceberg's writer, caps pages at 20,000 rows by default. For narrow numeric columns, that row cap, not the byte target, decides where pages end.

Treat these numbers as an illustration of mechanics, not a benchmark. Local files, one row group, and a single run leave out object storage latency, request coalescing, and caching. The ratios are the part to remember.

## Where Iceberg Stands Today

Now the Iceberg side. The situation has two halves that point in opposite directions.

**The writer half is done.** Iceberg's Java Parquet writer builds files through parquet-java's `ParquetFileWriter` and `ColumnChunkPageWriteStore`, and it passes a column index truncation length into both. It reads that length from the Hadoop configuration key `parquet.columnindex.truncate.length`, defaulting to 64 bytes, the same as parquet-java. The result is that Parquet data files written by Iceberg's Java writer carry ColumnIndex and OffsetIndex structures by default. If you have been writing Iceberg tables from Spark or Flink with the standard writers, the page indexes are already sitting in your files.

**The reader half is not.** Iceberg does not hand filtering to parquet-java's high-level reader. It has its own Parquet readers: a row-based reader that builds records and a vectorized reader that produces Arrow-style batches for engines such as Spark. Those readers apply Iceberg's own filtering, using row group statistics, dictionaries, and bloom filters when present. They do not consult the page index, so a row group that survives those checks is read in full.

This has been a known gap for a long time. The history, as summarized by Shangqing Yang in an August 2026 dev list post, runs like this.

Issue #193 asked for page skipping in Iceberg's Parquet reader early in the project's life. It was eventually closed as not planned.

Pull request #1566, opened in October 2020 by Xinli Shang, implemented page skipping. Review comments show real interest, including a question about whether Iceberg should rely on Parquet's own filtering instead of applying filters itself. A reviewer noted the trade-off. Relying on Parquet for filtering simplifies Iceberg's code, but it gives up pushdown for some filters Iceberg handles itself, such as `IN`, `NOT IN`, and `STARTS WITH`. The PR was closed without merging.

Pull request #9479, from January 2024, tried pushing filters into Parquet on a best-effort basis in the vectorized reader.

Issue #14865 collected questions about page skipping.

The August 2026 revival is issue #17596 with draft proof-of-concept pull request #17597. The scope is deliberately narrow. It targets only the custom row-based reader, uses page indexes only for conservative page-level I/O pruning, leaves residual filter evaluation unchanged, falls back to reading the whole row group when a page index is missing or unsupported, and adds no new public configuration until the community agrees on reader architecture.

The proof of concept came with an I/O experiment on 500,000 rows in one row group, about 1,000 rows per page, and a predicate matching a 100-row range. On data sorted by the predicate column, candidate rows dropped from 500,000 to 1,000, bytes read dropped from 131.054 MiB to 0.288 MiB, and median time dropped from 67.79 ms to 8.16 ms. On randomly ordered data, no pages were eliminated, bytes read stayed nearly flat at about 131 MiB, and median time rose slightly, from 66.56 ms to 69.72 ms. A file without a ColumnIndex on the predicate column fell back to reading the full row group. The author was clear that these were proof-of-concept measurements rather than formal JMH benchmarks, and that the main goal was confirming fewer pages meant less physical input.

Those numbers match the shape of the experiment in the previous section. Sorted data plus a page index cuts reads by two orders of magnitude for selective filters. Random data gains nothing and pays a small overhead for evaluating the index.

**Other engines vary.** Engines that read Iceberg tables with their own Parquet readers make their own choices, so check yours rather than assuming. Trino is a useful example of how specific this gets. Its documentation describes a `parquet.use-column-index` property that skips pages using column indexes, defaults to true, and is listed as supported only by the Delta Lake and Hive connectors. Spark's built-in Parquet data source uses parquet-java's column index filtering for plain Parquet tables, but Iceberg tables in Spark read through Iceberg's own readers, so that capability does not apply to them. Check your engine's documentation for the specific connector you use.

## The Correctness Trap: Nested Data and Page Boundaries

The proof of concept has already demonstrated why this work moves carefully. A reviewer testing it as a foundation for position-selective reads tried nested data with unequal page boundaries across columns. They found a case where the `_pos` row position and a top-level ID column were correct, but a nested value came from a different physical row. Row 1001 contained a nested number that belonged to row 932, where it should have held a null. The read was correct with page pruning off, and wrong with it on, for both version 1 and version 2 data pages.

This is exactly the synchronization problem from step six. When columns have different page boundaries, skipping pages means each column's decoder starts at a different row position. For flat columns, the reader skips a known number of values. For nested columns, the number of values per row varies, and the reader has to walk repetition and definition levels to skip whole rows. Get that walk wrong, and values slide between rows. Nothing crashes. The query just returns wrong data.

The reviewer proposed a fix built on parquet-java's existing `ColumnReadStoreImpl`, adapting it into Iceberg's record construction so every data column follows the same selected row positions, while keeping native decoding for row groups that are not filtered. They also identified a separate issue in parquet-java's row synchronizer, which can stop before reaching the page containing the final selected row. That is fixed upstream in parquet-java pull request #3748, which preserves the final selected row when skipping pages. The fix was not yet in the parquet-java release the proof of concept depended on, and the reviewer noted that other valid selections need it before production use.

Two lessons stand out. First, page pruning is a correctness feature as much as a performance feature. A reader that prunes pages has to be tested against nested types, unequal page boundaries, both data page versions, and edge cases like the final selected row, because the failure mode is silent. Second, the narrow, conservative scope in the proposal is the right call. Starting with one reader, conservative pruning, and full fallback keeps the blast radius small while those edge cases get flushed out.

## Preparing Your Tables on the Writer Side

Readers will catch up on their own schedule. The writer side is under your control today, and the experiment makes the priority clear: page indexes only pay off on data that is sorted or tightly clustered by the columns you filter on. A table written in arrival order with no sort gets almost nothing from page pruning, no matter how good the reader is.

Here is a set of Spark SQL statements, using Iceberg's SQL extensions, that sets up an events table to benefit from page pruning.

```sql
-- 1. Declare a write order so new data files are sorted by the lookup key.
ALTER TABLE lake.analytics.events WRITE ORDERED BY event_id;

-- 2. Tune page granularity for selective lookups on this table.
ALTER TABLE lake.analytics.events SET TBLPROPERTIES (
  'write.parquet.page-row-limit'  = '10000',
  'write.parquet.page-size-bytes' = '1048576'
);

-- 3. Rewrite existing files so historical data is sorted too.
CALL lake.system.rewrite_data_files(
  table      => 'analytics.events',
  strategy   => 'sort',
  sort_order => 'event_id ASC NULLS LAST'
);
```

Walk through each statement.

`WRITE ORDERED BY` sets the table's sort order in Iceberg metadata. Writers that honor it, including Spark with Iceberg's extensions, sort rows within each data file by `event_id` before writing. Sorting within files is what makes consecutive pages hold narrow, non-overlapping ranges of IDs, which is what lets a reader rule most of them out. Sorting also tightens file-level and row-group-level bounds, so you get better pruning at levels one and two immediately, before any reader uses page indexes.

The page properties control granularity. `write.parquet.page-row-limit` caps rows per page and defaults to 20,000. `write.parquet.page-size-bytes` sets the byte target and defaults to 1 MB. For narrow numeric columns, the row cap usually ends the page before the byte target does, as the experiment showed. Lowering the row cap to 10,000 doubles the page count and halves the rows a reader has to decode around each match. The cost is a slightly larger file, a larger index, and somewhat less effective compression. Change these per table, for tables with selective lookup workloads, and leave scan-heavy tables at the defaults.

The `rewrite_data_files` procedure with the `sort` strategy applies the sort to existing data. New writes follow the declared order, but files written before the change keep their original layout until they are rewritten. For large tables, rewrite by partition during quiet periods, and use the procedure's filter options to target the hottest partitions first.

Two more writer settings matter, and neither is a table property.

The column index truncation length comes from the Hadoop configuration key `parquet.columnindex.truncate.length`. The default of 64 bytes is reasonable for most string columns. If you filter on long string keys that share long prefixes, such as URLs or hierarchical paths, truncation at 64 bytes produces page bounds that all look identical and prune nothing. Raising it for those workloads keeps bounds distinct at the cost of a larger index.

For multi-column filters, a single sort key favors one column. If queries filter on combinations, such as tenant and time, a compound sort on both works when one column is always present in filters. When different queries filter on different columns, Iceberg's `zorder` sort strategy in `rewrite_data_files` clusters on several columns at once. Z-ordering gives each column moderately tight page bounds instead of giving one column very tight bounds.

## Checking What Your Files Contain

Before tuning anything, confirm what your files hold. The checks are quick.

To confirm page indexes exist, open a data file with PyArrow and read the column chunk metadata, as in the experiment. `has_column_index` and `has_offset_index` return true when the footer records the index offsets. Pick a few files from the table's current snapshot, found with Iceberg's `files` metadata table, and check each filter column.

To judge whether pages will prune, look at how sorted the data is. Iceberg's `files` metadata table exposes per-file lower and upper bounds for each column. If most files have bounds spanning the full range of a column, the data is not clustered on that column, and pages inside those files will not prune either. Tight, non-overlapping file bounds are a strong sign that page bounds inside the files are tight too.

To measure the effect directly, run the experiment's approach against a copy of one real data file. Register it with a reader that uses page indexes, run a representative selective query with `EXPLAIN ANALYZE`, and compare bytes scanned against the file's size. This gives you a per-table estimate of the gain before any change to your production engines.

## Failure Modes and Warning Signs

Page pruning has more ways to disappoint than to break, but the ways it breaks are serious. Watch for these.

**Unsorted data.** The most common reason page indexes do nothing is data that is not clustered on the filter column. The sign is file-level bounds that span the whole column range. Sort or z-order the table first.

**Sort order drift.** A table gets a sort order, then a new ingestion path writes unsorted files through a writer that ignores it. Over time, the share of well-clustered data falls. The sign is file bounds widening on recent snapshots. Audit writers, and schedule periodic sort rewrites for tables that take writes from several sources.

**Truncated string bounds.** Long string keys with shared prefixes produce page bounds that are identical after truncation, which prunes nothing. The sign is selective string filters that read whole row groups on sorted data. Raise the truncation length for those tables' writers.

**Too many tiny pages.** Pushing page sizes very small increases file size, index size, and decode overhead, and hurts compression. The sign is data files growing noticeably after a page size change while lookup latency barely improves. The experiment's 8 KB case shows the pattern: fewer rows kept, but a file 7 percent larger than the 64 KB case.

**Silent wrong results in readers.** This is the serious one, covered in the previous section. A reader that mis-synchronizes columns after skipping pages returns plausible but wrong data. When your engine turns on page pruning for Iceberg tables, validate it on your own nested schemas by comparing results with pruning on and off. Any engine release notes mentioning page index fixes deserve attention.

**Remote storage overheads.** Page pruning replaces one large sequential read with several small ranged reads. On object storage, each request carries latency. Readers that do not coalesce nearby ranges can end up slower on moderately selective queries, even while reading fewer bytes. The sign is lower bytes scanned but higher wall-clock time. That is an engine tuning issue, and it is worth measuring before celebrating a bytes-scanned drop.

## Operational Guidance

Here is a practical order of work for tables that serve selective queries.

**Identify the candidates.** Look for tables where common queries filter on one or two columns and return a small fraction of rows. Point lookups, narrow time windows, and per-tenant queries are the typical shapes.

**Sort or z-order those tables now.** This improves file and row group pruning immediately, with every engine, and prepares the data for page pruning later. It is the highest-value step regardless of reader support.

**Tune page row limits per table.** For lookup-heavy tables with narrow key columns, try 10,000 rows per page. Leave scan-heavy tables at defaults.

**Keep page indexes on.** Iceberg's Java writer produces them by default. If you write Iceberg data files with other tools, check that they write page indexes too, using the PyArrow metadata check.

**Track reader support.** Follow Iceberg issue #17596 and pull request #17597 for the Java readers, and your engine's release notes for its own Parquet reader. When support lands, validate correctness on nested data before enabling it widely.

**Record the layout decision.** Write down, in the table's properties or your data catalog, which column each table is sorted by and why. Sort orders are easy to lose during migrations, rewrites, and ingestion changes, and the reason for a page row limit of 10,000 is invisible six months later. A one-line table comment saves the next engineer from undoing the tuning.

**Measure bytes, then time.** Use bytes scanned to confirm pruning works and wall-clock time to confirm it helps. On object storage those two can diverge.

## Page Indexes Next to Other Skipping Tools

Page indexes are one of several skipping tools available to Parquet and Iceberg. Each one fits a different query shape, and choosing well means knowing where page indexes stop being the right answer.

**Partitioning** skips whole files by partition value, using Iceberg's hidden partitioning transforms. It works best for coarse, predictable filters, such as a day or a region, that nearly every query uses. It does nothing for lookups within a partition.

**Sort order with file statistics** skips files and row groups by min and max bounds. It works for range and point filters on the sort columns, and it is what makes page indexes effective. Without it, page bounds look like file bounds: wide and useless.

**Dictionary filtering** checks a row group's dictionary page for low-cardinality columns. If a filter value is absent from the dictionary, the whole column chunk can be skipped. It works on unsorted data, but only for columns with few distinct values, and only at row group granularity.

**Bloom filters** answer "is this exact value definitely absent from this row group?" for high-cardinality columns. They work on unsorted data, which is their main advantage over min and max bounds. They only help equality and `IN` filters, and they operate per row group, not per page. Iceberg supports writing Parquet bloom filters per column through table properties such as `write.parquet.bloom-filter-enabled.column.<name>`.

**Page indexes** skip pages within a row group by min and max bounds. They serve range and point filters on sorted or clustered columns, at the finest granularity Parquet offers.

The practical pattern is to combine them. Partition by a coarse dimension such as day. Sort within files by the main lookup key, which tightens file, row group, and page bounds together. Add bloom filters on high-cardinality columns that queries match by equality but that you cannot sort by. Page indexes then handle the last mile for the sorted key.

What none of these tools does well is a selective filter on a high-cardinality column that the data is not sorted by, with range semantics. That is the gap the Iceberg community's secondary index discussions aim to fill.

## Where This Is Heading

Page indexes are one part of a broader push in the Iceberg community to prune at finer granularity. The v4 work on Parquet-based manifests moves file-level statistics into a columnar form that engines can scan efficiently. Discussions on secondary indexes, starting with bloom filter skipping indexes stored in Puffin files, aim at queries that sorting alone cannot serve. Position-selective reads, where a reader asks for specific row positions, share machinery with page pruning, which is why the reviewer who found the nested-data bug was evaluating the proof of concept for that purpose.

The pieces fit together as layers. Manifests prune files. Footer statistics prune row groups. Page indexes prune pages. Secondary indexes cover columns the data is not sorted by. Each layer needs a writer that produces the metadata and a reader that trusts it correctly.

For page indexes, the writer half has been in place for years. The next step is a production reader in Iceberg's Java implementation that uses them safely, starting with the narrow scope already proposed. Given the proof of concept's numbers on sorted data, it is one of the more valuable read-path improvements on the table.

## Conclusion

Parquet page indexes give readers statistics and byte offsets for every page in a column chunk. The ColumnIndex holds per-page bounds and null information, and the OffsetIndex holds page locations and first row indexes, so a reader can turn a filter into a small set of byte ranges and keep every column aligned to the same rows.

On sorted data, the gains are large. The experiment in this article cut bytes scanned for a 100-row lookup from 18.42 MB to 1.29 MB, and the Iceberg proof of concept cut reads from 131 MiB to 0.288 MiB. On unsorted data, the gains disappear.

Iceberg's Java writer already writes page indexes by default. Its readers do not use them yet, and the August 2026 proposal to change that is intentionally conservative, for good reason, as the nested-data bug found during review shows. The work you can do today is on the writer side: sort or z-order tables that serve selective queries, tune page row limits per table, and verify your files carry the index. When readers catch up, those tables will be ready.

## Keep Going

If this piece was useful, I have written a lot more on how Apache Iceberg and Apache Parquet work together under the hood. *Apache Iceberg: The Definitive Guide* covers the metadata layers, statistics, and table maintenance procedures, such as sort rewrites, that determine how well Iceberg tables prune. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
