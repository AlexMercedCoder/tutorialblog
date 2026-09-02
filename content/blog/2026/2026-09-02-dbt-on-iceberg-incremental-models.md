---
title: "dbt on Iceberg: Incremental Models on Open Tables"
date: "2026-09-02"
description: "How dbt incremental materializations map to Iceberg operations, and the configuration, predicates, and maintenance that keep them healthy."
author: "Alex Merced"
category: "Data Engineering"
tags:
  - dbt
  - Apache Iceberg
  - Incremental Models
  - dbt-spark
  - dbt-trino
canonical: https://iceberglakehouse.com/posts/dbt-on-iceberg-incremental-models/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/dbt-on-iceberg-incremental-models/).

A dbt project has a model called `fct_orders` configured as `materialized='incremental'` with `incremental_strategy='merge'` and `unique_key='order_id'`. It runs hourly. On a warehouse it does what the name says: merges the last hour of orders into a managed table. Pointed at an Apache Iceberg table through Spark, Trino, Dremio, or Athena, it still runs and still produces the right rows. What changes is everything underneath. Each run is a snapshot. The merge is a copy-on-write or merge-on-read operation depending on a table property dbt never mentions. The target's history accumulates. Small files pile up. And the `MERGE` scans the whole target table every hour unless someone told it not to.

dbt is an abstraction over SQL that assumes the platform handles storage. Iceberg is a table format that makes storage decisions explicit. Using them together works well, but only when the person writing the model understands what each dbt configuration compiles to at the Iceberg level. This article maps every dbt materialization and incremental strategy to the Iceberg operation it produces, covers the adapter-specific configuration for the major engines, shows how to bound merge scans and handle schema changes, and lays out the maintenance that dbt does not do. I work at Dremio, which has a dbt adapter, and the material here applies across adapters.

## What dbt Does and What Iceberg Does

A dbt model is a `SELECT` statement plus configuration. dbt's job is to turn that into the DDL and DML that materializes the result on the target platform, in dependency order, with tests. The adapter for each platform decides what SQL to emit. For an incremental model, the adapter emits a first-run statement that creates the table and a subsequent-run statement that applies only new rows according to a strategy.

Iceberg's job starts where dbt's SQL ends. When the engine executes the statement dbt emitted, Iceberg decides how to write the data files, what delete files to produce, what the snapshot looks like, and what metadata to commit. None of that is visible to dbt, and dbt has no opinion about it.

This division means there are two configuration surfaces. dbt's model config controls the SQL: materialization, strategy, unique key, partition columns, schema-change behavior. Iceberg's table properties control the physical outcome: row-level operation mode, file size, metrics, retention. The two meet at the `table_properties` (or equivalent) config that most adapters pass through to `TBLPROPERTIES`, and a model that sets one surface without the other is half configured.

## Materializations Mapped to Iceberg Operations

Each dbt materialization compiles to a specific Iceberg operation, and knowing the mapping is the foundation for everything else.

| dbt materialization or strategy | SQL emitted | Iceberg result |
|---|---|---|
| `table` | `CREATE OR REPLACE TABLE ... AS SELECT` | One `replace` snapshot. Prior snapshot retained, history preserved, atomic swap |
| `view` | `CREATE OR REPLACE VIEW` | An Iceberg view where the engine and catalog support them, otherwise an engine-local view |
| `incremental` / `append` | `INSERT INTO` | One `append` snapshot. New data files only, no deletes |
| `incremental` / `merge` | `MERGE INTO ... USING` | One `overwrite` snapshot. COW rewrites matched files, MOR writes delete files plus new data files |
| `incremental` / `delete+insert` | `DELETE ... WHERE key IN (...)` then `INSERT INTO` | Two snapshots on most adapters. Readers between them see the deleted rows missing |
| `incremental` / `insert_overwrite` | `INSERT OVERWRITE` with dynamic partitions | One `overwrite` snapshot replacing whole partitions |
| `incremental` / `microbatch` | Per-batch `INSERT OVERWRITE` or `DELETE` plus `INSERT` on an `event_time` range | One snapshot per batch |
| `snapshot` (dbt SCD Type 2) | `MERGE INTO` with validity columns | One `overwrite` snapshot per run |
| `--full-refresh` on incremental | `CREATE OR REPLACE TABLE ... AS SELECT` | Same as `table`. History preserved |

Three details in this table have consequences.

**Full refresh does not destroy history.** On a warehouse, `--full-refresh` drops and recreates. On Iceberg, `CREATE OR REPLACE` is an atomic replace that commits a new snapshot and keeps the old ones until expiry. This is good, because a bad full refresh can be rolled back with `rollback_to_snapshot`, and it is surprising, because the table's storage doubles until the old snapshot expires.

**`delete+insert` is not atomic on most adapters.** dbt emits two statements. Iceberg commits two snapshots. A query that runs between them sees a table with the affected keys missing. Adapters that wrap the two in an engine transaction avoid this, and most do not, because Iceberg's transaction support across statements depends on the engine. On Iceberg, `merge` or `insert_overwrite` is almost always the better choice.

**`merge` behavior is set by the table, not by dbt.** Whether the `MERGE` rewrites whole data files or writes deletion vectors is `write.merge.mode` on the table. dbt's `merge` strategy is the same SQL either way. A model that merges a small number of rows into a large table every hour wants merge-on-read plus compaction. A model that merges a large batch daily is fine with copy-on-write. The choice is a table property in the model config, and the default is copy-on-write.

### When `table` Beats `incremental`

Incremental models exist because full rebuilds are expensive. On Iceberg the calculation shifts, because a full rebuild is an atomic `CREATE OR REPLACE` that preserves history and because an incremental `MERGE` has costs a warehouse merge does not.

A `table` materialization on Iceberg is one snapshot with all new files, no delete files, perfect file sizing (the writer produces target-sized files from scratch), and no maintenance debt beyond expiring the prior snapshot. An `incremental` merge is one snapshot with a mix of new files and delete files or rewritten files, growing maintenance debt, and a scan of the merge window on every run.

The crossover is roughly where the merge's scan plus write plus eventual compaction costs more than rebuilding. For a model whose source is under a few gigabytes and whose build takes minutes, `table` is often cheaper in total and always simpler. For a model with years of history and an hourly window, `incremental` is the only option. In between, measuring both for a week is worth the effort, and the `snapshots` metadata table's `total-files-size` summary key is the number to compare.

## Adapter Configuration for the Major Engines

Each adapter exposes Iceberg-specific configuration under slightly different names. The intent is the same: tell the engine to create an Iceberg table, set its partitioning, and pass table properties through.

**dbt-spark.** The `file_format: iceberg` config makes every model an Iceberg table. `partition_by` takes a list of columns or transform expressions. `table_properties` passes through to `TBLPROPERTIES`. `location_root` sets where tables land. A project-level default in `dbt_project.yml` applies it everywhere:

```yaml
models:
  my_project:
    +file_format: iceberg
    +table_properties:
      format-version: "3"
      write.parquet.compression-codec: zstd
```

The Spark session must be configured with a Spark catalog pointing at the Iceberg catalog, and model names resolve through it. Incremental strategies available on Iceberg are `append`, `merge`, `insert_overwrite`, and `microbatch`. The `merge` strategy requires a `unique_key`.

**dbt-trino.** The Trino Iceberg connector is configured at the catalog level, so every table in that catalog is Iceberg and no per-model file format is needed. Model config uses `properties` for table properties, with Trino's own names: `partitioning` takes a list of transform expressions such as `['day(created_at)', 'bucket(16, customer_id)']`, `sorted_by` sets the sort order, and `format_version` sets the format version. Incremental strategies are `append`, `merge`, `delete+insert`, and `microbatch`. The `on_table_exists` config controls whether a full refresh uses `rename` (create new, swap names) or `replace` (`CREATE OR REPLACE`), and `replace` is the one that preserves Iceberg history.

**dbt-athena.** Athena engine version 3 supports Iceberg through `table_type: iceberg`. Incremental strategies on Iceberg are `append` and `merge`. `partitioned_by` accepts transform expressions. `table_properties` passes through. Athena's own documentation recommends pinning `format_version` explicitly.

**dbt-dremio.** Dremio's adapter creates Iceberg tables in Dremio-managed or external catalogs. Model config sets partitioning and the adapter supports `append` and `merge` incremental strategies with `unique_key`. Table properties are applied through Dremio's `ALTER TABLE` syntax.

**dbt-duckdb.** DuckDB reads Iceberg tables through its extension and, as of recent versions, writes them through a REST catalog. For projects where DuckDB is the transformation engine, this is the lightest path to Iceberg, and the adapter's Iceberg support is newer than the others.

**dbt-snowflake and dbt-databricks.** Both platforms create Iceberg-format tables managed by the platform. In Snowflake, `table_format: iceberg` with an external volume and catalog configuration. In Databricks, Iceberg is produced through UniForm or Iceberg-native managed tables. These are Iceberg tables in that other engines can read them through the platform's REST catalog endpoint, and the dbt experience is the platform's rather than the open-source adapter's.

Across all of them, the one config that matters most and is most often omitted is the table property for the row-level operation mode. The next section shows why.

## Partitioning and Sort Order From Model Config

Because dbt creates the table on the first run, the model config is where partitioning and sort order have to be declared. Getting this wrong on the first run means a partition evolution and a rewrite later, so it deserves care.

On dbt-spark, `partition_by` accepts Iceberg transform expressions using Spark's function syntax:

```sql
{{ config(
    materialized='incremental',
    file_format='iceberg',
    partition_by=['days(placed_at)', 'bucket(16, customer_id)'],
    table_properties={'write.distribution-mode': 'hash'}
) }}
```

Sort order on dbt-spark is set through a post-hook, since the adapter has no first-class config for it:

```sql
post_hook="ALTER TABLE {{ this }} WRITE ORDERED BY customer_id, placed_at"
```

On dbt-trino, both are first-class:

```sql
{{ config(
    materialized='incremental',
    properties={
        'partitioning': "ARRAY['day(placed_at)', 'bucket(16, customer_id)']",
        'sorted_by': "ARRAY['customer_id', 'placed_at']",
        'format_version': '3'
    }
) }}
```

The choice of partitioning follows the same rules as any Iceberg table, with one dbt-specific consideration: the partition column should be the same column the incremental predicate filters on, so that every run prunes to its window. A model that filters on `updated_at` but partitions on `placed_at` prunes only if the two are correlated, which for orders they usually are and for slowly changing entities they usually are not.

Bucketing on the merge key deserves a mention. A `MERGE` on `order_id` into a table bucketed on `order_id` lets the engine plan the match bucket by bucket, which on Spark with storage-partitioned joins enabled removes the shuffle from the merge. For high-volume merge targets that is a large win, and it is set up entirely in the model config.

## Bounding the Merge: `incremental_predicates`

A `MERGE INTO target USING source ON target.order_id = source.order_id` has to find every target row that matches a source key. Without any other information, the engine scans the whole target. For a target with three years of orders and a source with the last hour, that is a full scan of the target on every run, to match a few thousand rows.

dbt's `incremental_predicates` config adds conditions to the `ON` clause that bound the target scan. On an Iceberg table partitioned by day, a predicate on the partition column lets Iceberg prune every partition outside the window:

```sql
{{ config(
    materialized='incremental',
    incremental_strategy='merge',
    unique_key='order_id',
    partition_by=['days(placed_at)'],
    incremental_predicates=[
        "DBT_INTERNAL_DEST.placed_at >= current_date - interval '3' day"
    ],
    table_properties={
        'format-version': '3',
        'write.merge.mode': 'merge-on-read',
        'write.target-file-size-bytes': '268435456',
    }
) }}

SELECT order_id, customer_id, placed_at, amount, status
FROM {{ source('raw', 'orders') }}
{% if is_incremental() %}
WHERE updated_at > (SELECT max(updated_at) FROM {{ this }})
{% endif %}
```

`DBT_INTERNAL_DEST` is dbt's alias for the target in the compiled merge. The predicate says: only consider target rows from the last three days as merge candidates. Iceberg's planner sees a filter on `placed_at`, projects it through the `days` partition transform, and skips every partition older than three days. The merge touches a handful of partitions instead of a thousand.

The window has to be wide enough to catch late-arriving updates. An order placed four days ago and updated today falls outside a three-day window, is not matched, and is inserted as a duplicate. The right window is the maximum lateness the source can produce, plus margin, which is a data contract question rather than a dbt one.

The same predicate on a merge-on-read table has a second benefit. Deletion vectors are written only for files in the pruned set, so the delete file count grows in proportion to the active window rather than the whole table.

## Schema Changes: `on_schema_change` and Iceberg Evolution

An incremental model's `SELECT` can gain or lose columns between runs. dbt's `on_schema_change` config decides what to do, and each option maps to Iceberg schema evolution or to a bug.

**`ignore`** (the default) does nothing. If the model adds a column, the `INSERT` or `MERGE` fails on most engines because the column count differs, or on lenient engines the new column is silently dropped. If the model removes a column, new rows get null in it. Neither is what anyone wants, and `ignore` should not be the setting on any Iceberg incremental model.

**`append_new_columns`** emits `ALTER TABLE ADD COLUMN` for each new column before the incremental statement. This is Iceberg schema evolution: a new field ID, a metadata commit, and existing rows reading as null (or as the `initial-default` on v3 if the adapter sets one, which none currently do). Removed columns are left in place and receive null.

**`sync_all_columns`** adds new columns and drops removed ones. The drop is an Iceberg `DROP COLUMN`, which retires the field ID. Old snapshots still have the column. The current snapshot does not, and if the column comes back next week it gets a new ID and starts empty. This is correct behavior and it is destructive in the sense that the column's data is unreachable from the current schema, so `sync_all_columns` should be used only where column removal is intentional.

**`fail`** stops the run on any change, which is the right setting for models where schema is a contract.

Type changes are the gap. dbt's schema-change handling compares column names, not types. A model whose `amount` column changes from `DECIMAL(10,2)` to `DECIMAL(12,2)` is a legal Iceberg promotion, and no adapter emits it automatically. It has to be done as a manual `ALTER TABLE ... ALTER COLUMN` before the run, or as a pre-hook.

## dbt Snapshots Versus Iceberg Snapshots

The word "snapshot" means two unrelated things in this stack, and conflating them leads to the wrong design.

A dbt snapshot is a Type 2 slowly changing dimension: a table where each source row's history is stored as multiple rows with `dbt_valid_from` and `dbt_valid_to` columns, updated by a `MERGE` on each run. It answers "what did this customer's record look like on March 3" by querying rows whose validity range includes that date. It is data-level history, queryable with ordinary SQL, and it persists for as long as the rows do.

An Iceberg snapshot is a table-level version: the complete state of the table as of one commit. It answers "what did the whole table look like at commit 7168" by time-traveling to that snapshot. It is metadata-level history, retained until expiry, and it covers every column and row rather than tracked changes to specific rows.

Teams sometimes try to replace dbt snapshots with Iceberg time travel, on the reasoning that the table already has history. This works for a few days and fails afterward, because Iceberg snapshots expire and dbt snapshot rows do not, because a time-travel query cannot be joined against the current table by validity range in one statement, and because time travel gives you the table as of a commit rather than the row as of an event time. The two are complementary. dbt snapshots record business history at row grain. Iceberg snapshots provide rollback and audit at table grain.

Running dbt snapshots on Iceberg does work well, with one adjustment. The snapshot table receives a `MERGE` every run that updates `dbt_valid_to` on changed rows and inserts new versions. That is an update-heavy workload on a table that grows forever, which is the profile that wants merge-on-read, a bounded merge predicate on `dbt_valid_to IS NULL` (only current rows are candidates for matching), and regular compaction. dbt's snapshot config accepts the same `table_properties` pass-through as models on most adapters.

## Walkthrough: What One Run Actually Commits

Following one incremental run through to the Iceberg metadata makes the mapping concrete. The model above, on dbt-spark, on its second run, compiles to roughly this:

```sql
CREATE OR REPLACE TEMPORARY VIEW fct_orders__dbt_tmp AS
SELECT order_id, customer_id, placed_at, amount, status
FROM raw.orders
WHERE updated_at > (SELECT max(updated_at) FROM analytics.fct_orders);

MERGE INTO analytics.fct_orders AS DBT_INTERNAL_DEST
USING fct_orders__dbt_tmp AS DBT_INTERNAL_SOURCE
ON DBT_INTERNAL_DEST.order_id = DBT_INTERNAL_SOURCE.order_id
   AND DBT_INTERNAL_DEST.placed_at >= current_date - interval '3' day
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *;
```

The temporary view is dbt's staging step. On dbt-spark it is a view, so nothing is written. On some adapters, including older dbt-trino versions, the staging step is a real table, which means an extra Iceberg table is created and dropped on every run, with its own metadata and its own orphan-file risk if a run fails between the create and the drop.

The `MERGE` produces one snapshot. Querying the metadata afterward shows what happened:

```sql
SELECT snapshot_id, operation,
       summary['added-data-files']    AS added_files,
       summary['added-delete-files']  AS added_deletes,
       summary['deleted-data-files']  AS removed_files,
       summary['added-records']       AS added_rows
FROM analytics.fct_orders.snapshots
ORDER BY committed_at DESC
LIMIT 1;
```

On a merge-on-read table with deletion vectors, a typical hourly run shows `operation = overwrite`, a few added data files holding the new and updated rows, a few added delete files (one Puffin file with vectors for each touched data file), and zero removed data files. On a copy-on-write table the same run shows more added data files, zero added delete files, and a removed-file count equal to every file that contained a matched row.

Checking the partitions the run touched confirms the predicate did its job:

```sql
SELECT partition, count(*) AS files
FROM analytics.fct_orders.files
WHERE content > 0
GROUP BY partition;
```

If delete files exist in partitions older than three days, either the predicate is not being applied or late data is arriving outside the window. Either way this query is the diagnostic.

## Microbatch: Event-Time Incrementals on Partitioned Tables

The `microbatch` strategy, added in dbt 1.9, processes an incremental model as a sequence of time-bounded batches. The model config declares an `event_time` column, a `batch_size` (hour, day, month, year), and a `lookback`. Each run figures out which batches are new or within the lookback and processes each one independently by replacing the rows in that time range.

On Iceberg this aligns naturally with partitioning. A model with `event_time='placed_at'`, `batch_size='day'`, and `partition_by=['days(placed_at)']` processes one partition per batch. The adapter emits, per batch, either an `INSERT OVERWRITE` for the partition or a `DELETE WHERE placed_at IN range` followed by `INSERT`. With `INSERT OVERWRITE` the batch is one atomic snapshot replacing the partition's files. With delete-then-insert it is two.

Microbatch's strengths on Iceberg are that each batch is a partition-sized unit of work, that failed batches retry independently, and that backfills are the same code path as regular runs, with `--event-time-start` and `--event-time-end` bounding the range. Its cost is one snapshot per batch, so a backfill of 365 days produces 365 snapshots and 365 partition-sized rewrites, and the snapshot count needs an expiry job afterward.

`microbatch` is the right strategy for append-mostly event data where late arrivals are bounded by the lookback. It is the wrong strategy for slowly changing data where any row can change at any time, which is what `merge` with a bounded predicate is for.

## Write-Audit-Publish With Branches

An incremental run that produces wrong rows has, on a warehouse, already published them. On Iceberg there is a better option: write to a branch, run tests against the branch, and publish by fast-forwarding `main` only when the tests pass. dbt can drive this with a small amount of adapter-specific configuration.

On dbt-spark, the Iceberg Spark integration honors a session property that redirects all writes to a named branch:

```yaml
# profiles.yml, for the audit target
audit:
  type: spark
  method: session
  ...
  server_side_parameters:
    "spark.wap.branch": "audit"
```

With that set, every model in the run commits to the `audit` branch of its table. Readers on `main` see nothing. A `dbt test` run against the same target reads the branch too, because reads honor the same property. If tests pass, a `run-operation` macro fast-forwards each table:

```sql
{% macro publish_audit_branch(tables) %}
  {% for t in tables %}
    {% do run_query("CALL " ~ target.catalog ~ ".system.fast_forward('" ~ t ~ "', 'main', 'audit')") %}
  {% endfor %}
{% endmacro %}
```

Fast-forward is a metadata operation. The data files written to the branch become `main`'s data files without a rewrite. If tests fail, the branch is dropped, `main` is untouched, and the run is retried after a fix.

On dbt-trino, branch writes use the `FOR VERSION AS OF` and `@branch` syntax that the connector supports, driven through a macro that rewrites the target relation. The pattern is the same, and the mechanics differ per adapter.

Write-audit-publish changes what a dbt failure costs. A failed test on a branch is a dropped branch. A failed test on `main` is a rollback and an incident. For pipelines feeding dashboards or downstream systems, that difference is the reason to set it up, and Iceberg is the only table format where it costs nothing at the storage layer.

The branch also needs its own retention. `history.expire.max-ref-age-ms` controls how long non-main branches survive expiry, and an audit branch that is created and fast-forwarded every hour should be allowed to expire within a day, or the branch references accumulate.

## Maintenance dbt Does Not Do

dbt writes. It does not compact, expire, or clean up. Every hourly incremental run on an Iceberg table produces a snapshot, a few data files, and on merge-on-read a few delete files. After a month there are 720 snapshots, thousands of small files, and a delete file count that slows every read. Someone has to run maintenance, and there are three ways to do it from a dbt project.

**Post-hooks on the model.** A `post_hook` config runs SQL after each model build. Calling the compaction procedure every hour is too often, but calling snapshot expiry with a short retention is reasonable:

```sql
{{ config(
    post_hook=[
      "CALL {{ target.catalog }}.system.expire_snapshots(
         table => '{{ this.schema }}.{{ this.identifier }}',
         older_than => current_timestamp() - interval '7' day,
         retain_last => 24)"
    ]
) }}
```

The downside is that maintenance runs inside the model's build time and inside the same dbt run, so a slow compaction slows the whole DAG.

**`run-operation` macros on a schedule.** A macro that iterates over the project's Iceberg models and calls `rewrite_data_files`, `rewrite_manifests`, and `expire_snapshots` for each, invoked as `dbt run-operation iceberg_maintenance` from a separate scheduled job. This keeps maintenance out of the build and lets it run at a different cadence, such as compaction nightly and expiry weekly.

**A maintenance job outside dbt.** A Spark or engine-native scheduled job that reads the catalog, finds every table dbt writes, and applies a maintenance policy. This is the most common pattern in mature deployments, because it also covers tables dbt does not own, and because catalogs such as Apache Polaris are starting to run maintenance policies themselves.

Whichever pattern, the policy for a dbt-written incremental table is: compact files with delete attached at least as often as the delete count doubles, rewrite manifests when their count exceeds a few hundred, and expire snapshots on a retention that matches the recovery window the team wants. The properties that make this cheaper, `commit.manifest.min-count-to-merge` lowered for hourly commits and `write.metadata.delete-after-commit.enabled` set to true, belong in the model's `table_properties`.

## Multi-Engine Projects: One Catalog, Several Adapters

A distinguishing feature of Iceberg is that the same table is readable and writable by several engines, and dbt projects increasingly take advantage of it: heavy transformations on Spark, interactive models on Trino or Dremio, both writing to tables in one REST catalog.

This works as long as three things are aligned.

**One catalog, addressed consistently.** Every adapter's profile points at the same REST catalog with the same warehouse. Namespaces and table names resolve identically. A model built on Spark as `analytics.fct_orders` is `analytics.fct_orders` on Trino, not `iceberg.analytics.fct_orders`, and the dbt `ref()` in a Trino model resolves to the table Spark built. Adapters that prepend a catalog name need the `database` config set so that the fully qualified name matches.

**Types pinned at the Iceberg level.** Each engine has its own SQL type names, and the adapter maps them to Iceberg types. A `TIMESTAMP` in Spark is Iceberg `timestamptz`. A `TIMESTAMP(6) WITH TIME ZONE` in Trino is the same. A `TIMESTAMP(3)` in Trino is coerced. A `STRING` in Spark and a `VARCHAR` in Trino are both Iceberg `string`. Models that are read by an engine other than the one that wrote them should cast explicitly to types with an unambiguous Iceberg mapping, and the project's schema tests should assert on Iceberg types rather than engine types.

**Partition and property syntax per adapter.** The `partition_by` versus `partitioning` difference, and `table_properties` versus `properties`, mean a model config is not portable verbatim. A macro that emits the right config for `target.type` keeps one model definition working on both.

The concurrency question is handled by Iceberg. Two engines committing to the same table through the same catalog use optimistic concurrency, and the second commit retries against the first. A dbt DAG that has Spark build a table and Trino build a dependent model in the same run is safe, because dbt orders them. Two separate dbt runs on two engines writing the same table concurrently are also safe at the Iceberg level, though they are a sign the project's ownership boundaries need work.

The reason to do this at all is cost and fit. Spark handles the large nightly builds, Trino or Dremio handle the hourly incrementals and the analyst-facing models, and the tables are shared with no copying. That is the multi-engine promise of the format, and dbt is the layer where it becomes a workflow.

## Testing Against Iceberg Metadata

dbt tests are `SELECT` statements that fail when they return rows. Iceberg's metadata tables are queryable, which means a dbt test can assert on the physical state of a table, not only on its data.

A singular test that fails when a model has accumulated too many delete files:

```sql
-- tests/assert_fct_orders_delete_files_bounded.sql
SELECT count(*) AS delete_files
FROM {{ ref('fct_orders') }}.files
WHERE content > 0
HAVING count(*) > 500
```

A test that fails when a model's average file size drops below a threshold, which catches small-file accumulation:

```sql
SELECT avg(file_size_in_bytes) AS avg_bytes
FROM {{ ref('fct_orders') }}.files
WHERE content = 0
HAVING avg(file_size_in_bytes) < 64 * 1024 * 1024
```

And a test that fails when the last snapshot was not the expected operation, which catches a strategy misconfiguration:

```sql
SELECT operation
FROM {{ ref('fct_orders') }}.snapshots
ORDER BY committed_at DESC
LIMIT 1
HAVING max(operation) <> 'overwrite'
```

The metadata table syntax varies by adapter. Spark uses `table.files`. Trino uses `"table$files"`. Dremio uses `TABLE(table_files('table'))`. The tests have to be written per adapter or wrapped in a macro that dispatches on `target.type`. Once they exist, they turn the maintenance policy from a runbook into a failing test, which is the only form of policy that reliably gets enforced.

## Developing Models Against a Local Stack

Incremental logic is the part of a dbt project most likely to be wrong in ways that only show up on the second run, and the shared development catalog is the worst place to find that out. A local Iceberg stack, with a REST catalog fixture, MinIO, and a Spark or Trino container, gives every developer a private target that behaves like production at the format level.

The dbt profile for it is an ordinary adapter profile pointed at `localhost`:

```yaml
local:
  type: trino
  host: localhost
  port: 8080
  catalog: lake
  schema: dev_{{ env_var('USER') }}
  user: dev
  threads: 4
```

The per-user schema keeps developers isolated in one catalog. A `seed` run loads fixtures. A first `dbt run` builds every table from scratch. A second `dbt run`, with a few rows changed in the seed, exercises the incremental path, and the metadata tables show exactly what the merge did. This two-run cycle is the test that matters for incremental models, and it takes seconds locally against minutes on shared infrastructure.

dbt's unit tests, which mock inputs and assert outputs without touching the platform, complement this by testing the model's `SELECT` logic. They do not test the incremental strategy, the schema-change behavior, or what Iceberg does with the statement. The local two-run cycle does. The combination, unit tests for logic and a local integration run for the materialization, catches most incremental bugs before the pull request.

The local stack also makes it practical to test the maintenance macros, the write-audit-publish flow, and the metadata tests from earlier sections. A `dbt build` against the local target that runs models, tests, and a maintenance `run-operation` in sequence is the whole production pipeline in miniature, and a CI job that runs it on every pull request is the difference between an incremental model that works and one that is assumed to.

## Failure Modes

dbt-on-Iceberg deployments fail in patterns that come from the seam between the two.

**Merge without a bounded predicate.** Every run scans the full target. Runtime grows linearly with the table. This is the most common performance problem and it is fixed by `incremental_predicates` on the partition column.

**Copy-on-write on an hourly merge.** Each run rewrites every file containing a matched row. On a table where updates are spread across time, that is most of the table, every hour. Write amplification is enormous, snapshot expiry has to reclaim it, and storage churns. `write.merge.mode = merge-on-read` in `table_properties` plus scheduled compaction fixes it.

**Merge-on-read without compaction.** The reverse. Delete files accumulate and reads slow week over week. The delete-file test above catches it.

**`on_schema_change: ignore`.** A column added upstream never reaches the target, or a column removed upstream fills the target with nulls. Set `append_new_columns` or `fail`.

**Non-unique `unique_key`.** Two source rows match one target row and the `MERGE` fails with a multiple-match error on most engines, or silently picks one on lenient ones. Deduplicate the source in the model, or use a composite key.

**Reruns of `append` producing duplicates.** An `append` model rerun for the same window inserts the same rows again. `append` is only safe with an idempotent source filter, and `merge` or `microbatch` is safer for anything rerun-prone.

**Staging tables left behind.** An adapter that materializes the `__dbt_tmp` staging step as a real table, combined with a failed run, leaves an extra Iceberg table in the catalog. Periodic cleanup of `*__dbt_tmp` tables is needed on those adapters.

**Partition transform syntax mismatch.** `partition_by=['days(placed_at)']` on dbt-spark, `partitioning=['day(placed_at)']` on dbt-trino. Copying a model config between adapters without adjusting the syntax produces an unpartitioned table with no error.

**Type mismatches across engines.** A dbt-trino model that writes `TIMESTAMP(6)` and a Spark model that writes `TIMESTAMP` with microseconds are the same Iceberg type. A Trino model writing `TIMESTAMP(3)` is not representable and the adapter coerces it. Pin types explicitly in models that multiple engines read.

**Full refresh doubling storage.** `CREATE OR REPLACE` keeps the prior snapshot's files until expiry. A full refresh of a 10 TB table needs 20 TB until the expiry job runs. Run expiry immediately after planned full refreshes.

**Snapshot count from microbatch backfills.** A year-long backfill produces hundreds of snapshots in one run. Expire afterward.

## Operational Guidance

**Set the row-level mode and format version in `dbt_project.yml`, not per model.** Every incremental model in the project gets the same physical defaults, and exceptions are per-model overrides.

**Always bound the merge.** `incremental_predicates` on the partition column, with a window that covers the source's maximum lateness.

**Use `merge` for mutable data and `microbatch` for event data.** `append` only with an idempotent source. Avoid `delete+insert` on Iceberg unless the adapter wraps it in a transaction.

**Set `on_schema_change` to `append_new_columns` or `fail`.** Never leave the default.

**Run maintenance outside the build.** A scheduled `run-operation` or an external job, with compaction on a cadence tied to the delete count and expiry tied to the recovery window.

**Test the metadata.** Delete file count, average file size, and last-snapshot operation as dbt tests, per adapter.

**Match the table's partitioning to the model's incremental window.** A model that merges the last three days into a table partitioned by month prunes nothing. Daily partitions for daily windows.

**Expire after every full refresh and after every backfill.** Those are the two operations that produce the most retained-but-unneeded data.

## Where the Ecosystem Is Heading

**Adapters are converging on Iceberg-native configuration.** dbt-trino's `partitioning` and `sorted_by`, dbt-spark's transform expressions in `partition_by`, and the growing use of `table_properties` pass-through mean that a model's physical layout is increasingly expressible in dbt config rather than in a post-hook.

**Microbatch and Iceberg partitions are a natural pair.** The batch-per-partition alignment is likely to get first-class support, with adapters emitting a single `INSERT OVERWRITE` per batch and dbt exposing the resulting snapshot IDs for lineage.

**Catalog-managed maintenance removes the gap.** As REST catalogs take on compaction and expiry policies, the maintenance section of this article shrinks. A dbt project sets a policy tag on its tables and the catalog does the rest.

**Iceberg views as dbt views.** With the Iceberg view spec supported by Spark, Trino, and a growing set of catalogs, dbt `view` materializations become portable across engines rather than engine-local, which is a significant change for projects that mix engines.

**dbt Fusion and engine-side execution.** dbt's newer engine compiles and validates SQL locally before it reaches the platform, which catches many of the schema and type failures above before a run. Its Iceberg-specific behavior is a topic for a separate piece.

## Conclusion

dbt's incremental models work on Iceberg because both are built around SQL. The work is in understanding that dbt's config decides the statement and Iceberg's properties decide what the statement does to storage. `merge` is a `MERGE INTO` whose cost is set by `write.merge.mode`. `table` and full refresh are atomic replaces that keep history. `delete+insert` is two commits. `microbatch` is one partition per batch. Schema changes are field-ID evolution or a silent failure depending on one config value. And none of it compacts, expires, or cleans up.

A dbt project that sets format version and row-level mode at the project level, bounds every merge with a partition predicate, handles schema changes explicitly, tests the metadata, and runs maintenance on a schedule gets Iceberg's time travel, atomic replaces, and multi-engine reads without the small-file and full-scan problems that an unconfigured model produces. The models look the same as they do on a warehouse. The configuration is where the difference lives.

## Keep Going

If this piece was useful, I have written a lot more on Iceberg table design and the operational practices that keep transformation pipelines fast. *Architecting an Apache Iceberg Lakehouse* from Manning covers partitioning, row-level operation modes, and maintenance in the depth this article draws on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
