---
title: "The Iceberg Table Properties That Actually Matter"
date: "2026-09-02"
description: "The Iceberg table properties that decide file count, pruning, write amplification, retention, and metadata growth, by workload."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Table Properties
  - Tuning
  - Maintenance
canonical: https://iceberglakehouse.com/posts/iceberg-table-properties-that-matter/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-table-properties-that-matter/).

Every Apache Iceberg table carries a `properties` map in its metadata file. The reference implementation defines somewhere north of a hundred keys that engines read from it, and the configuration page that lists them is organized alphabetically by prefix rather than by consequence. The result is that most tables run on defaults, and most tuning happens by copying a `TBLPROPERTIES` block from a blog post without knowing what each line does.

That is a problem because a handful of these properties decide whether a table stays healthy. Target file size determines how many files a query opens. Metrics mode determines whether a filter prunes files or scans them. Row-level operation mode determines whether an update rewrites gigabytes or writes kilobytes. Retention properties determine how far back you can recover and how fast storage grows. Get four or five of these right and the table runs well for years. Get them wrong and no amount of compaction catches up.

This article is a reference organized by what the properties do to the table, not by what they are named. It covers how the properties map works and where it is overridden, then walks through the groups that matter: format and identity, file sizing and encoding, column metrics, row-level operation behavior, commit and manifest handling, retention, layout, and read planning. It closes with recommended settings by workload, a walkthrough of configuring a change-data-capture (CDC) table, and the mistakes that show up repeatedly. I work at Dremio, whose engine reads and honors these properties, but the values and defaults here come from the Iceberg reference implementation and apply everywhere.

## How Table Properties Work

The `properties` field in table metadata is a flat map of string keys to string values. It is part of the table, stored in every `metadata.json`, and it travels with the table across catalogs and regions. Setting a property is a metadata commit like any other:

```sql
ALTER TABLE sales.orders SET TBLPROPERTIES (
  'write.target-file-size-bytes' = '268435456',
  'write.metadata.metrics.default' = 'truncate(32)'
);
```

Three rules govern how a value takes effect.

**Reserved keys are read by Iceberg itself. Everything else is free-form.** Keys under prefixes like `write.`, `read.`, `commit.`, `history.`, and `gc.` are interpreted by the Iceberg library and by engines. Any other key is stored and ignored by the format, which makes the map a legitimate place for your own metadata such as owner, SLA tier, or data classification. Some keys are reserved in a stronger sense: `format-version` and `uuid` are stored as top-level metadata fields rather than in the map, and the library rejects attempts to set them as ordinary properties on an existing table. Setting `format-version` on an existing table through `ALTER TABLE` is the supported way to upgrade the table's format version, and it is a one-way operation.

**Engine configuration can override table properties per session or per write.** Spark's `spark.sql.iceberg.*` session options and write options like `.option("target-file-size-bytes", ...)` take precedence over the table's stored value for that write. Trino's session properties do the same. Dremio has engine-level settings. This means the table property is the default that applies when no engine says otherwise, and a table that looks correctly configured can still be written badly by a job that overrides it. When debugging, check the writer's configuration, not only the table's.

**Catalogs can set defaults for new tables.** The Java library reads `table-default.<property>` and `table-override.<property>` from catalog configuration. A default applies when the table does not set the key. An override wins over the table's value. This is how a platform team enforces a metrics mode or a compression codec fleet-wide without touching each table, and it is another place a value can come from that is not visible in the table's metadata.

Property values are strings, including numbers and booleans. `'536870912'` is 512 megabytes. The reference documentation prints the human-readable size next to each byte count, and this article does the same.

### Setting Defaults and Overrides at the Catalog

Because the catalog is the one component every engine talks to, it is the right place to enforce table configuration. The Java library reads two families of keys from the catalog's own configuration. `table-default.<key>` supplies a value for any new table that does not set `<key>` itself. `table-override.<key>` supplies a value that wins over whatever the table says, for both new and existing tables, every time the table is loaded through that catalog.

In a Spark session configured against a REST catalog, the settings look like this:

```properties
spark.sql.catalog.polaris.table-default.format-version=3
spark.sql.catalog.polaris.table-default.write.target-file-size-bytes=536870912
spark.sql.catalog.polaris.table-default.write.parquet.compression-codec=zstd
spark.sql.catalog.polaris.table-default.write.distribution-mode=hash
spark.sql.catalog.polaris.table-default.history.expire.max-snapshot-age-ms=604800000
spark.sql.catalog.polaris.table-override.write.metadata.metrics.max-inferred-column-defaults=200
```

The defaults are copied into each new table's `properties` map at creation, so they become visible in the metadata file and travel with the table. The override is not stored in the table. It is applied at load time by this catalog client, which means a different engine loading the same table through a different client configuration does not see it. That distinction matters: defaults are durable and portable, overrides are a local policy of one engine's catalog connection.

REST catalog servers can also return defaults and overrides in their configuration response, which the client applies the same way. This is how a platform team running Apache Polaris pushes fleet-wide table configuration to every connected engine without touching any engine's config files. A change to the server's defaults takes effect on the next table creation from any client, and a change to its overrides takes effect on the next table load.

The practical pattern is to put the five or six workload-independent properties, format version, compression codec, distribution mode, retention, and object storage layout, in catalog defaults, and to leave the workload-dependent ones, file size target, metrics modes, and row-level modes, to the table's own `TBLPROPERTIES`. Overrides are for emergencies and enforcement, such as forcing `gc.enabled` to `false` across a catalog during a migration.

## Format and Identity

Four properties define what kind of table this is.

**`format-version`** (default 2 since Iceberg 1.4). The spec version the table's metadata conforms to. Version 2 brought row-level deletes and sequence numbers. Version 3 brought deletion vectors, row lineage, default column values, and the `variant`, `geometry`, `geography`, `timestamp_ns`, and `unknown` types. Version 4 is arriving with relative paths and typed statistics. Upgrading is a metadata-only operation and cannot be reversed. Every engine that reads the table must support the target version before you upgrade, because a v2-only engine fails on a v3 table outright.

**`write.format.default`** (default `parquet`). The file format for new data files. Parquet is the right answer for analytical tables and is the only format with full support for every v3 type across engines. Avro is occasionally used for row-oriented streaming sinks. ORC has narrower engine support. Mixed-format tables are legal, and this property only affects new writes, so changing it does not rewrite anything.

**`write.delete.format.default`** (defaults to the data file format). The format for position and equality delete files in v2. In v3, deletion vectors go in Puffin files regardless of this setting, so it matters only for equality deletes and for v2 tables.

**`gc.enabled`** (default `true`). Whether garbage collection operations, meaning `expire_snapshots` and `remove_orphan_files`, are permitted. Setting it to `false` is the table-level safety on a table that is being migrated, replicated, or shared by a process that must not have files deleted from under it. It is the first property to set when a table is in a fragile state and the first to check when maintenance is unexpectedly refusing to run.

**`compatibility.snapshot-id-inheritance.enabled`** (default `false`, always true on v2 and later). A v1-era setting for committing manifests without explicit snapshot IDs. On any modern table it is irrelevant.

## File Sizing and Encoding

These properties decide how many files a table has and how expensive each is to read. They are the most frequently mistuned group.

**`write.target-file-size-bytes`** (default 536,870,912, or 512 MB). The size a writer aims for when rolling to a new data file. This is the most consequential property in the map. The value is measured in the writer's in-memory representation and the file on disk is usually smaller after compression, so a 512 MB target produces files in the 200 to 400 MB range for typical Parquet. Smaller targets mean more files per snapshot, more manifest entries, more file opens per query, and more work for compaction. Larger targets mean fewer, bigger files and less parallelism for engines that split at file boundaries. The default is right for most batch-written analytical tables. Streaming writers with small micro-batches never reach it regardless of the setting, which is why streaming tables need compaction rather than a smaller target.

**`write.delete.target-file-size-bytes`** (default 67,108,864, or 64 MB). The same target for delete files. Delete files are small by nature and the default is rarely changed.

**`write.parquet.row-group-size-bytes`** (default 134,217,728, or 128 MB). The Parquet row group size. A row group is the unit of column-chunk statistics and of parallel reading within a file. With a 512 MB file target, the default yields about four row groups per file. Dropping it to 32 or 64 MB gives finer-grained min/max pruning inside a file at the cost of more footer metadata and slightly worse compression. Tables with highly selective point lookups on sorted keys benefit from smaller row groups. Tables that are always scanned in full do not.

**`write.parquet.page-size-bytes`** (default 1,048,576, or 1 MB) and **`write.parquet.page-row-limit`** (default 20,000). Page-level settings inside a row group. Page indexes let readers skip pages, so smaller pages give finer skipping. Most teams leave these alone.

**`write.parquet.compression-codec`** (default `zstd`) and **`write.parquet.compression-level`** (default null, meaning the codec's default). Zstandard replaced gzip as the default in Iceberg 1.4 and is the right choice: better compression than Snappy at comparable decode speed, far faster decode than gzip. The level is worth setting explicitly on cold archive tables, where level 6 to 9 buys 10 to 20 percent smaller files for slower writes that nobody notices, and on hot tables, where the default level 3 is the right balance.

**`write.parquet.dict-size-bytes`** (default 2,097,152, or 2 MB). The maximum dictionary page size. Dictionary encoding is what makes low-cardinality string columns tiny. When a column's distinct values exceed this size, Parquet falls back to plain encoding for the remainder of the row group, which balloons file size for medium-cardinality strings. Raising it to 4 or 8 MB on tables with wide-ish string columns is a cheap win.

**`write.parquet.bloom-filter-enabled.column.<name>`** (not set) with **`write.parquet.bloom-filter-fpp.column.<name>`** (default 0.01) and **`write.parquet.bloom-filter-max-bytes`** (default 1 MB). Enables a Parquet Bloom filter for one column. Bloom filters answer "is this value definitely absent from this row group" and are the right tool for equality lookups on high-cardinality columns that are not sorted, such as a UUID or an email. They are useless for range predicates and for columns the data is sorted on, where min/max already prunes. Set them on the two or three columns that point-lookup queries actually hit and nowhere else, because each one adds to every file's footer.

**`write.parquet.shred-variants`** (default `false`, v3). When enabled, `variant` columns are written with shredded encoding, extracting frequently occurring typed paths into their own Parquet subcolumns with statistics. This is the difference between a JSON-ish column that must be fully parsed on every read and one that prunes like a normal column. Turn it on for any table where queries filter on fields inside a variant.

**`write.avro.compression-codec`** (default `gzip`) and **`write.orc.*`**. The equivalents for the other file formats. Note that the Avro default is gzip, not zstd, which matters for manifests: manifests are Avro, and their compression is controlled separately by the library. On tables with many manifests, manifest read time is real, and the Avro codec is worth setting to zstd.

## Column Metrics

Metrics are the per-file, per-column statistics that manifests store: value counts, null counts, and lower and upper bounds. They are what lets an engine skip a file without opening it. The properties that control them are the second most consequential group and the least understood.

**`write.metadata.metrics.default`** (default `truncate(16)`). The metrics mode for every column unless overridden. Four modes exist:

- `none`: no metrics for the column. Manifests are smaller. Nothing prunes.
- `counts`: value, null, and NaN counts only. No bounds. Prunes only on `IS NULL` and `IS NOT NULL`.
- `truncate(N)`: counts plus bounds, with string and binary bounds truncated to N characters or bytes. Numeric and temporal bounds are exact. This is the default with N of 16.
- `full`: counts plus exact bounds regardless of length.

The default exists because storing full bounds for a long string column, such as a URL or a JSON blob, puts two copies of a kilobyte-long value in every manifest entry for every file, and manifests are read on every query. Truncating to 16 characters keeps manifests small while still pruning on prefixes. The tradeoff is that two strings that share their first 16 characters are indistinguishable to the pruner.

**`write.metadata.metrics.column.<name>`** (not set). Per-column override. This is where tuning happens. A high-cardinality join key or a column that appears in most `WHERE` clauses benefits from `full` if it is a string, so that exact bounds prune tightly. A large text or binary column that is never filtered on should be `none` or `counts`, so that manifests do not carry its bounds at all. A table with a hundred columns and three filter columns is well served by `counts` as the default and `full` or `truncate(32)` on the three.

**`write.metadata.metrics.max-inferred-column-defaults`** (default 100). The number of columns, in schema order, that get the default metrics mode. Columns past the hundredth get `none` unless explicitly configured. This is the property that silently breaks pruning on wide tables: a 300-column table has no metrics on columns 101 through 300 by default, and if a filter column landed there, every query scans every file. Raise the limit or, better, set per-column modes on the columns that matter and leave the limit alone.

One rule ties all of this together. Metrics are computed at write time and stored in manifests. Changing the metrics mode affects new files only. Existing files keep the metrics they were written with until they are rewritten by compaction. So a metrics change on a table with a year of data does nothing for that year until `rewrite_data_files` runs, and the compaction has to be planned with that in mind.

## Row-Level Operations

Format version 2 introduced row-level deletes, and with them a choice that every table with updates has to make.

**`write.delete.mode`**, **`write.update.mode`**, and **`write.merge.mode`** (all default `copy-on-write`). Each controls the strategy for its SQL operation. Copy-on-write (COW) rewrites every data file that contains an affected row, producing a new file with the change applied. Merge-on-read (MOR) leaves the data file alone and writes a delete file, or in v3 a deletion vector, that readers apply at scan time. COW makes writes expensive and reads cheap. MOR makes writes cheap and reads progressively more expensive until compaction merges the deletes.

The right setting depends on the ratio of writes to reads and on how scattered the changes are. A dimension table updated once a day and read thousands of times should stay on COW. A CDC target receiving continuous small updates across many files should be on MOR for all three operations, with compaction scheduled to keep delete files from piling up. A table with bulk deletes that touch entire partitions can stay on COW because rewriting a partition you are mostly deleting is close to free. The three properties are independent, and a common configuration is MOR for `delete` and `update` with COW for `merge` on tables where merges are large batch operations.

**`write.delete.isolation-level`**, **`write.update.isolation-level`**, **`write.merge.isolation-level`** (all default `serializable`). Whether a row-level operation fails if a concurrent commit added files that match its predicate. Serializable is the safe default. `snapshot` isolation allows the commit to succeed as long as the files it read were not deleted or modified, which is appropriate for pipelines where concurrent appends to the same partitions are expected and the operation's semantics tolerate missing them. Lowering isolation is a correctness decision, not a performance tuning.

**`write.delete.granularity`** (default `partition`). Whether position delete files are written per partition or per data file. `file` granularity produces more, smaller delete files but each one references exactly one data file, which makes them cheaper to apply and much cheaper for compaction to rewrite. On v3 tables with deletion vectors this is moot, because a vector is always per data file. On v2 tables with heavy MOR traffic, `file` is the better setting.

**`write.distribution-mode`**, with **`write.delete.distribution-mode`**, **`write.update.distribution-mode`**, and **`write.merge.distribution-mode`**. How rows are distributed across writer tasks before writing: `none`, `hash`, or `range`. `hash` sends rows for the same partition to the same task, which produces one file per partition per task and avoids the small-file explosion of `none`. `range` sorts globally, which produces well-clustered files at the cost of a sort. The default is engine-specific and Spark's is `hash` for writes to partitioned tables. Setting this to `none` on a partitioned table is the most common reason a batch job produces thousands of tiny files.

**`write.spark.fanout.enabled`** (default `false`). Allows a Spark writer to keep many partitions' files open at once so that unsorted input does not have to be clustered first. It trades memory for a skipped shuffle. Useful for streaming writes where the shuffle is the bottleneck.

## Commits and Manifests

These control what happens at the moment a write becomes a snapshot.

**`commit.retry.num-retries`** (default 4), **`commit.retry.min-wait-ms`** (default 100), **`commit.retry.max-wait-ms`** (default 60,000), and **`commit.retry.total-timeout-ms`** (default 1,800,000, or 30 minutes). Commits use optimistic concurrency: read the current metadata, write new metadata, swap the catalog pointer if it still points at what you read. When the swap fails because someone else committed first, the writer rebases and retries with exponential backoff between the min and max wait. Tables with many concurrent writers, such as a streaming sink with several parallel jobs, need more retries. Four is low for that case and twenty is not unreasonable. The total timeout is the cap.

**`commit.status-check.num-retries`** (default 3) and the matching wait properties. After a network failure during the pointer swap, the writer does not know whether the commit landed. These control how long it polls the catalog to find out before giving up with an unknown-commit-state error, which is the error nobody wants to see because it means files were written and the caller must check by hand.

**`commit.manifest.target-size-bytes`** (default 8,388,608, or 8 MB), **`commit.manifest.min-count-to-merge`** (default 100), and **`commit.manifest-merge.enabled`** (default `true`). Every append writes a new manifest. Left alone, a table accumulates one manifest per commit, and scan planning reads all of them. Manifest merging rewrites small manifests into larger ones during commits once the count exceeds the minimum. The defaults are fine for batch tables. For a streaming table committing every minute, lowering `min-count-to-merge` to 20 or so keeps planning fast without waiting for a separate `rewrite_manifests` run. Disabling merging speeds up individual commits and is occasionally done for tables where a dedicated manifest rewrite job runs on a schedule.

**`write.summary.partition-limit`** (default 0). Includes per-partition statistics in the snapshot summary when the number of changed partitions is below this limit. Set it to a few hundred on tables where operators want to see, from the `snapshots` metadata table, which partitions a commit touched. Zero disables it.

**`write.wap.enabled`** (default `false`). Enables write-audit-publish, where writes tagged with a WAP ID are staged as snapshots that are not the current snapshot until explicitly published. With branches available since Iceberg 1.2, most teams get the same result by writing to a branch and fast-forwarding, and the WAP property is a legacy path.

## Retention and Metadata Housekeeping

These properties decide how much history the table keeps and how large its metadata grows.

**`history.expire.max-snapshot-age-ms`** (default 432,000,000, or 5 days) and **`history.expire.min-snapshots-to-keep`** (default 1). The defaults that `expire_snapshots` uses when called without arguments. Together they define how far back time travel and rollback reach. Five days is the default because it is a reasonable balance for most tables. Raising it to fourteen on critical tables extends the recovery window at the cost of retaining files that were deleted or rewritten in that window. Lowering it below a day on any table is a mistake unless the table is a transient staging area, because a day is the minimum needed to notice and undo a bad commit.

**`history.expire.max-ref-age-ms`** (default forever). How long branches and tags other than `main` survive before expiry removes them. The default means a tag lives until explicitly dropped. Branch-heavy workflows sometimes set this to a few weeks so that abandoned feature branches do not pin files forever.

**`write.metadata.previous-versions-max`** (default 100) and **`write.metadata.delete-after-commit.enabled`** (default `false`). Every commit writes a new `metadata.json`, and the old ones accumulate in the `metadata-log`. The first property caps how many are tracked. The second deletes the untracked ones from storage during commits. Enabling deletion is right for high-commit-rate tables where the metadata directory otherwise fills with thousands of small JSON files, and wrong for tables where an external DR process or audit needs old metadata files to exist. On a streaming table committing every minute, this is the difference between a metadata directory with 100 files and one with 500,000.

**`gc.enabled`**, covered above, is the master switch for all of this.

## Layout and Location

**`write.object-storage.enabled`** (default `false`) and **`write.object-storage.partitioned-paths`** (default `true`). Object stores partition their request capacity by key prefix, and a table whose files all share a long common prefix can hit throttling under heavy parallel reads. The object storage location provider inserts a hash component into each file path so that files spread across prefixes. Enabling it is standard advice for large tables on S3 and similar stores. The second property controls whether partition values still appear in the path, which is useful for humans browsing the bucket and irrelevant to Iceberg, which never infers partitions from paths.

**`write.data.path`** and **`write.metadata.path`** (default table location plus `/data` and `/metadata`). Where new data and metadata files go. Setting them lets a table's data live in a different bucket, storage class, or region from its metadata, or lets multiple tables share a data prefix. Changing them affects new files only, and the old paths remain referenced by existing manifests.

**`write.location-provider.impl`** (default null). A custom class for computing file paths. Rarely needed now that the object storage provider exists.

## Read Planning

These are read from the table but often overridden by engine session settings.

**`read.split.target-size`** (default 134,217,728, or 128 MB) and **`read.split.metadata-target-size`** (default 32 MB). The target size when combining files or file fragments into tasks. Smaller splits mean more tasks and more parallelism up to the point where task overhead dominates. Larger splits mean fewer, longer tasks. The default is right for most clusters. **`read.split.adaptive-size.enabled`** (default `true`) lets the planner adjust the split size to the scan size and available parallelism when no explicit size is set, which is why tuning this by hand is rarely necessary anymore.

**`read.split.open-file-cost`** (default 4 MB) is the minimum weight assigned to a file when combining splits, so that a thousand 10 KB files are not packed into one task. Small-file-heavy tables benefit from raising it.

**`read.data-planning-mode`** and **`read.delete-planning-mode`** (default `auto`). Whether scan planning reads manifests locally on the driver or distributes the work across the cluster. Auto picks based on manifest count and size. Tables with thousands of manifests benefit from `distributed`. Tables with a handful benefit from `local` to avoid the job launch overhead.

**`read.parquet.vectorization.enabled`** (default `true`) and **`read.parquet.vectorization.batch-size`** (default 5,000). Whether Spark uses vectorized Parquet reads. There is no reason to disable this on a modern engine.

## The Ones That Matter, by Workload

Most tables fall into one of four patterns, and each pattern has a short list of properties worth setting explicitly.

| Property | Append-heavy events | CDC / upsert target | Slowly changing dimension | Wide feature table |
|---|---|---|---|---|
| `format-version` | 3 | 3 | 3 | 3 |
| `write.target-file-size-bytes` | 512 MB | 256 MB | 128 MB | 512 MB |
| `write.parquet.compression-codec` | zstd | zstd | zstd | zstd |
| `write.metadata.metrics.default` | truncate(16) | truncate(16) | full | counts |
| `write.metadata.metrics.column.<key>` | full on event time and id | full on primary key | full on key | full on the 3 to 5 filter columns |
| `write.metadata.metrics.max-inferred-column-defaults` | default | default | default | raise, or set per column |
| `write.delete.mode` / `update.mode` / `merge.mode` | copy-on-write | merge-on-read | copy-on-write | merge-on-read |
| `write.delete.granularity` | default | file (v2 only) | default | file (v2 only) |
| `write.distribution-mode` | hash | hash | hash | hash |
| `commit.retry.num-retries` | 10 or more if many writers | 10 or more | 4 | 4 |
| `commit.manifest.min-count-to-merge` | 20 for streaming | 20 | 100 | 100 |
| `history.expire.max-snapshot-age-ms` | 7 days | 7 days | 14 days | 7 days |
| `write.metadata.delete-after-commit.enabled` | true for streaming | true | false | false |
| `write.object-storage.enabled` | true | true | false | true |
| `write.parquet.bloom-filter-enabled.column.<key>` | on lookup ids | on primary key | no | on lookup ids |
| `write.parquet.shred-variants` | true if any variant column | true | n/a | true |

The event table is written in bulk and read by range, so big files, standard metrics, and copy-on-write for the rare delete. The CDC target takes continuous small updates, so merge-on-read, smaller files that compaction handles well, more commit retries for concurrent writers, and aggressive metadata cleanup. The dimension is small and read constantly, so exact string bounds everywhere and copy-on-write so reads never apply deletes. The wide feature table has hundreds of columns and a few filters, so `counts` as the default with `full` on the filter columns and the inferred-column limit handled deliberately.

## Walkthrough: Configuring a CDC Target Table

A team lands change events from a transactional database into an Iceberg table via `MERGE INTO`, several hundred merges an hour, from three parallel jobs partitioned by source shard. Queries filter on `customer_id` and `updated_at`. The table starts with defaults and, after a month, queries are slow and the metadata directory has 40,000 files.

The diagnosis from the metadata tables comes first:

```sql
SELECT count(*) AS data_files,
       sum(file_size_in_bytes) / count(*) / 1048576 AS avg_mb
FROM sales.customers.files WHERE content = 0;

SELECT count(*) AS delete_files FROM sales.customers.files WHERE content > 0;

SELECT count(*) AS manifests FROM sales.customers.manifests;

SELECT count(*) AS metadata_versions FROM sales.customers.metadata_log_entries;
```

Suppose the answers are 12,000 data files averaging 30 MB, 9,000 delete files, 2,400 manifests, and 40,000 metadata versions. Copy-on-write merges have been rewriting files piecemeal, producing small files. The delete files are from a period someone switched to merge-on-read and back. Manifests are not merging because the merge threshold was never crossed per commit. Metadata files were never cleaned.

The property changes:

```sql
ALTER TABLE sales.customers SET TBLPROPERTIES (
  'format-version' = '3',
  'write.merge.mode' = 'merge-on-read',
  'write.update.mode' = 'merge-on-read',
  'write.delete.mode' = 'merge-on-read',
  'write.target-file-size-bytes' = '268435456',
  'write.distribution-mode' = 'hash',
  'write.metadata.metrics.column.customer_id' = 'full',
  'write.metadata.metrics.column.updated_at' = 'full',
  'write.parquet.bloom-filter-enabled.column.customer_id' = 'true',
  'commit.retry.num-retries' = '12',
  'commit.manifest.min-count-to-merge' = '20',
  'write.metadata.delete-after-commit.enabled' = 'true',
  'write.metadata.previous-versions-max' = '50',
  'history.expire.max-snapshot-age-ms' = '604800000',
  'write.object-storage.enabled' = 'true'
);
```

Reading it line by line. Upgrading to v3 makes merge-on-read use deletion vectors, one per data file, in Puffin, which is far cheaper to read and compact than v2 position deletes. Switching all three row-level modes to MOR turns each merge into an append of new rows plus a set of small vectors, instead of a rewrite of every touched file. The file size target drops to 256 MB because compaction on a MOR table runs often and moderately sized files compact faster. Hash distribution guarantees each of the three jobs writes one file per partition per commit. Full metrics on the two filter columns and a Bloom filter on the lookup key make the `customer_id` predicates prune. Twelve retries handle three concurrent writers hitting the same table. Manifest merging at 20 keeps planning fast at hundreds of commits an hour. Metadata deletion with a 50-version cap stops the metadata directory from growing. A seven-day snapshot window is enough for recovery on a table that is a copy of a source system. Object storage layout spreads the files across prefixes.

None of this touches existing files. The next step is a one-time cleanup that applies the new layout to old data:

```sql
CALL polaris.system.rewrite_data_files(
  table => 'sales.customers',
  options => map('target-file-size-bytes', '268435456', 'min-input-files', '5')
);
CALL polaris.system.rewrite_manifests('sales.customers');
CALL polaris.system.expire_snapshots(table => 'sales.customers', older_than => TIMESTAMP '2026-08-25 00:00:00');
```

After that, the same four diagnostic queries should show a few hundred data files near 256 MB, zero or few delete files, a few dozen manifests, and a metadata log capped at 50. From then on, a scheduled `rewrite_data_files` every few hours keeps deletion vectors from accumulating, and the properties keep the write side from making a mess in between.

Confirming that a property took effect is a query against the metadata file, since `SHOW TBLPROPERTIES` in some engines shows only the engine's view:

```sql
SHOW TBLPROPERTIES sales.customers;
```

Or in PyIceberg, `table.properties` returns the map directly.

## Failure Modes

The same handful of mistakes account for most badly behaving Iceberg tables.

**Metrics missing on the column that matters.** The filter column sits past the hundredth column, or was added later and never got a per-column mode, or is a long string truncated to 16 characters where the first 16 are identical across every value (a common prefix like `https://www.`). Every query scans every file. The `files` metadata table shows `lower_bounds` and `upper_bounds` for each column, and a null or useless bound on the filter column is the tell.

**Copy-on-write on a high-update table.** Every merge rewrites gigabytes to change kilobytes. Write jobs take hours, storage churns, and snapshot expiry has to reclaim huge volumes. The fix is merge-on-read plus scheduled compaction, and the symptom is a `snapshots` table where each commit's `added-files-size` is a large fraction of the table size.

**Merge-on-read without compaction.** The opposite failure. Delete files or deletion vectors accumulate, and every read applies more of them. Reads slow down gradually over weeks. The `files` table's delete file count, or on v3 the count of delete manifests, climbs steadily.

**Distribution mode `none` on a partitioned table.** A batch job with 200 tasks writing to 50 partitions produces up to 10,000 files per commit. The table's average file size collapses to a few megabytes. Compaction can fix it after the fact, but setting `hash` prevents it.

**Snapshot retention below the replication or backup window.** Expiry deletes files before the DR replica or the backup captured them. The replica's metadata references files that no longer exist anywhere.

**Metadata cleanup disabled on a streaming table.** Hundreds of thousands of `metadata.json` files. Catalog operations that list the metadata directory slow to a crawl, and `remove_orphan_files` takes hours to enumerate.

**Metadata cleanup enabled on a table with external DR.** The DR process needed old metadata files to reconstruct point-in-time state, and the table deleted them. The two settings have to be decided together.

**Engine overrides masking table properties.** The table says 512 MB and one job's write options say 64 MB. The table looks correctly configured and the files are still small. Always check the writing job's configuration when the table's properties look right and the behavior looks wrong.

**Bloom filters on every column.** Someone enabled them for all forty columns. Footers grow, writes slow, and the filters on sorted or low-cardinality columns never prune anything that min/max did not. Two or three columns is the right count.

**Retries too low for concurrent writers.** Three streaming jobs write to one table, each commit takes a few seconds, and with four retries and short backoff the losers exhaust their retries and fail. The job restarts, rewrites the same batch, and fails again. Raising retries and total timeout fixes it, as does reducing the number of writers by consolidating streams.

## Operational Guidance

**Set five properties on every new table.** `format-version`, `write.target-file-size-bytes`, the three row-level modes, `write.distribution-mode`, and `history.expire.max-snapshot-age-ms`. Use catalog-level `table-default.*` configuration to apply them fleet-wide so that a table created without a `TBLPROPERTIES` block still gets sane values.

**Set per-column metrics when you know the filter columns.** Which is usually at creation time. `full` on keys and timestamps that are filtered on, `none` on large text and binary columns. Revisit when query patterns change, and remember that the change applies only to files written afterward.

**Treat row-level mode as a workload decision, not a default.** Decide COW or MOR from the update rate and read rate, and pair MOR with a compaction schedule the same day you set it.

**Keep retention consistent with everything downstream.** Snapshot age must exceed DR replication lag. Metadata cleanup must be off if anything external reads old metadata files. Tag milestone snapshots so that expiry cannot remove them.

**Audit properties quarterly.** A short query across the catalog that reads each table's properties and flags deviations from the workload template catches drift, especially tables created by a job that bypassed the defaults.

**Verify with metadata tables, not assumptions.** Average file size from `files`, delete file counts, manifest counts, and metadata log length are four numbers that tell you whether the properties are doing their job.

## Where the Ecosystem Is Heading

The list of properties grows with each spec version, and a few trends are visible.

**v3 makes some settings automatic.** Deletion vectors remove `write.delete.granularity` as a decision. Default column values and row lineage add no tuning properties. Variant shredding adds `write.parquet.shred-variants` and its inference buffer size, and shredding is likely to become the default once engine support is broad.

**v4 changes the metadata housekeeping picture.** Typed statistics structs replace the byte-keyed metrics maps, and relative paths simplify `write.data.path` and `write.metadata.path` semantics. Expect the metrics properties to gain per-column control over which statistics are collected rather than only truncation length.

**Catalog-enforced defaults are becoming the norm.** REST catalogs, and Apache Polaris in particular, are the natural place for a platform team to set `table-default.*` and `table-override.*` values that every engine inherits, replacing the practice of copying `TBLPROPERTIES` blocks between DDL scripts.

**Engines are converging on honoring the same keys.** Where Spark, Trino, Flink, and Dremio once each had their own session settings for file size and compression, the trend is toward reading the table property first and overriding only when asked, which makes the table's map the single source of truth it was meant to be.

**Adaptive settings reduce the need for manual tuning.** `read.split.adaptive-size.enabled` and Parquet's adaptive Bloom filter sizing are early examples of the library choosing values from observed data rather than from configuration. Expect file size targets and manifest merge thresholds to follow.

## Conclusion

An Iceberg table's properties are a small map with an outsized effect. A dozen keys determine file count, prune effectiveness, write amplification, commit reliability, recovery window, and metadata growth. The rest are defaults that are correct for almost everyone.

The ones to decide deliberately are the format version, the file size target, the metrics mode on filter columns, the row-level operation modes paired with a compaction schedule, the distribution mode, the retry count for concurrent writers, and the retention and metadata cleanup settings paired with whatever DR or audit process depends on them. Set those at creation, enforce them from the catalog, and verify them from the metadata tables. A table configured that way behaves the same in year three as it did in week one.

## Keep Going

If this piece was useful, I have written a lot more on operating Iceberg tables at scale, including compaction, retention, and layout. *Architecting an Apache Iceberg Lakehouse* from Manning covers table configuration and maintenance in the depth this reference summarizes. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
