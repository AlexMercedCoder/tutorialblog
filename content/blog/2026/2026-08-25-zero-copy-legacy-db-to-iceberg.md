---
title: "Zero-Copy Warehouse Modernization: Migrating Legacy Databases to Apache Iceberg Without Downtime"
date: "2026-08-25"
description: "Move a legacy warehouse to Iceberg without downtime by virtualizing first. Consumer cutover, parity checks, and background copy without double-ETL."
author: "Alex Merced"
category: "Apache Iceberg"
canonical: https://iceberglakehouse.com/posts/zero-copy-legacy-db-to-iceberg/
tags:
  - Apache Iceberg
  - migration
  - federation
  - warehouse
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/zero-copy-legacy-db-to-iceberg/).

The migration plan looked reasonable in the kickoff deck. Extract 4,000 tables from a 15-year-old enterprise warehouse, load them into cloud object storage as Apache Iceberg, repoint the 600 dashboards and 200 scheduled jobs, decommission the old system, and save the license fee. Eighteen months later the warehouse is still running, the object store holds three inconsistent copies of most tables, the dashboards are split between the two systems with nobody sure which is current, and the migration team is running a "double-ETL" pipeline that loads every source into both places every night so neither falls behind. The license fee is still being paid. The cloud bill has doubled.

I have watched this happen at enough companies to believe it is the default outcome of a lift-and-shift warehouse migration, not an unlucky one. The reason is structural. A lift-and-shift treats the migration as a data movement problem. It is not. It is a consumer cutover problem, and data movement is the easy half. The hard half is the 800 consumers who each need to keep working on the day their table moves, and who each depend on names, semantics, permissions, and performance characteristics that the physical move does not preserve.

The zero-copy approach inverts the order. Instead of moving data first and fixing consumers later, it puts a virtualization layer in front of the legacy system, repoints consumers to the layer while the data is still where it always was, proves that everything works, and only then moves data underneath the layer one table at a time, with consumers never noticing. The physical migration to Iceberg happens in the background, at whatever pace the team can validate, and the double-ETL never exists because there is only ever one system of record for each table at any moment.

This article walks through that approach in detail: what the virtualization layer has to do, how to build the semantic views that decouple consumers from physical location, how to validate query parity and access controls before any data moves, how to execute the background copy into Iceberg, and how to cut each table over without a maintenance window. I work at Dremio, whose platform is built for this pattern, and I will use it as the example engine. The architecture applies to any engine that can federate queries across a legacy database and an Iceberg lakehouse, present both through one namespace, and accelerate the result.

## Why Lift-and-Shift Fails

It is worth being specific about the failure mechanisms, because the zero-copy design is a direct response to each one.

Consumers bind to physical names. A dashboard queries `EDW.SALES.FACT_ORDERS`. A scheduled job reads `finance_mart.dbo.gl_balances`. When the table moves, every consumer's connection string, schema reference, and table name has to change, and there are hundreds of them, owned by dozens of teams, some of which no longer exist. The migration team cannot change them all at once, so it changes them in waves, and during the waves some consumers read the old copy and some read the new one.

Two copies means two truths. The moment a table exists in both systems, someone has to decide which is authoritative. Usually the answer is "the old one, until the cutover," which means the new copy is a lagging replica that has to be reloaded on every source refresh. That is the double-ETL: every ingestion pipeline now writes twice. It doubles the cost, doubles the failure surface, and creates a class of bugs where the two copies disagree and nobody knows why.

Semantics do not survive the move. A legacy warehouse has 15 years of views, stored procedures, computed columns, and implicit type conversions. A `DECIMAL(18,4)` in one system rounds differently from a `DOUBLE` in another. A view that joins across four schemas encodes business logic that exists nowhere else. Moving the base tables and rebuilding the views in the new system is a rewrite, and rewrites introduce differences that show up as reconciliation failures months later.

Access control is rebuilt from scratch. The old system has grants accumulated over a decade. The new system starts empty. The migration team either recreates every grant (and gets some wrong) or opens the new system wide during the migration (and creates an audit finding).

Performance is unknown until it is not. Consumers were tuned against the old system's indexes and materialized views. The new system has different physics. A dashboard that ran in 2 seconds now runs in 40, and the team finds out from the user.

Every one of these is a consequence of moving data before decoupling consumers from where the data lives. Fix the decoupling first and they mostly go away.

## The Zero-Copy Architecture

The design has three layers, and the order in which they are built is the whole point.

The bottom layer is the physical systems: the legacy warehouse (Teradata, Oracle, SQL Server, Netezza, an on-premises Hadoop cluster, whatever it is) and the target Iceberg lakehouse on object storage with a REST catalog. At the start of the migration, all data is in the legacy system and the lakehouse is empty. At the end, all data is in the lakehouse and the legacy system is decommissioned. In between, every table is in exactly one of the two, never both as a system of record.

The middle layer is the query virtualization engine. It connects to the legacy warehouse through a native or JDBC connector and to the lakehouse through the Iceberg REST catalog. It presents both as sources in a single namespace, plans queries across them, pushes filters and projections down to whichever source holds the data, and returns results through a single endpoint. Dremio does this through its federated query planner. Trino and other federated engines can play the role too, with different strengths in acceleration and semantic modeling.

The top layer is the semantic layer: a set of virtual datasets (views) that consumers query instead of physical tables. `sales.orders` is a view. Today it selects from `legacy_edw.SALES.FACT_ORDERS`. After the migration it selects from `lakehouse.sales.orders`. The consumer never references either physical name, so the swap underneath the view is invisible.

The migration then proceeds in four phases:

1. Mirror. Build the semantic layer over the legacy warehouse. Every table and view the consumers use gets a virtual dataset in the engine with the same name (or a mapped name) pointing at the legacy source. No data moves.
2. Repoint. Move consumers from the legacy warehouse to the virtualization engine. They query the same logical names, get the same results from the same physical data, and gain a new connection string. This is the only change consumers ever see.
3. Validate. With consumers on the engine and data still in the legacy system, validate query parity, access controls, and performance against the semantic layer. Fix everything here, where fixes are cheap.
4. Migrate. Copy tables into Iceberg in the background, one at a time or in batches, and swap each virtual dataset's definition to point at the Iceberg copy. Consumers keep querying the view. The legacy table becomes a candidate for decommissioning once the swap is verified.

The reason there is no double-ETL is that the copy in phase four is a one-time move per table followed by a repoint of the ingestion pipeline. Until the swap, the ingestion writes to the legacy table and the view reads it. After the swap, the ingestion writes to Iceberg and the view reads that. There is a window during the copy where the Iceberg table lags the legacy one, and that window is handled by copying with a watermark and catching up before the swap, which I cover below.

## Phase One: Mirroring the Legacy Warehouse in the Semantic Layer

The mirror phase is the largest amount of work and the least risky, because nothing changes for anyone. The goal is to build a complete logical model of the legacy warehouse inside the virtualization engine.

Start with inventory. Pull the catalog of the legacy warehouse: every schema, table, view, and the query log for the last 90 days. The query log is the important part. It tells you which of the 4,000 tables are actually read, by whom, and how often. In every migration I have seen, 60 to 80 percent of tables have not been queried in the inventory window. Those do not need a view. They need an archive decision.

Connect the engine to the legacy warehouse as a source. In Dremio this is a source configuration with the connector for the database, credentials, and connection pool settings. The engine reads the warehouse's metadata and exposes every table under `legacy_edw.<schema>.<table>`. Filter and projection pushdown to the warehouse is what makes this usable at scale, because the engine sends `WHERE` clauses down rather than pulling whole tables.

Create the semantic layer as a namespace hierarchy that reflects how consumers think about the data, not how the warehouse is physically laid out. A common shape is three tiers:

- A bronze or staging tier that mirrors physical tables one to one: `staging.sales.fact_orders AS SELECT * FROM legacy_edw.SALES.FACT_ORDERS`. These exist so that every physical table has exactly one logical alias, which is the swap point later.
- A silver or conformed tier that applies the warehouse's existing view logic, type normalization, and joins: `conformed.sales.orders` joins `staging.sales.fact_orders` to `staging.sales.dim_customer` and rename columns to the standard names.
- A gold or business tier that consumers query: `sales.orders`, `finance.gl_balances`, with the metric definitions and filters that dashboards depend on.

The warehouse's existing views need to be ported into the silver tier. This is real work, and it is the work that a lift-and-shift does after the data move, when it is most expensive. Doing it here, against the original data, means every ported view can be validated against the original view it replaces by running both and diffing. Port them in dependency order (views that depend only on tables first) and diff as you go.

Here is what a staging view and a conformed view look like in Dremio's SQL. The pattern is identical in any engine with view support:

```sql
-- Staging: one-to-one alias over the physical table. This is the swap point.
CREATE VIEW staging.sales.fact_orders AS
SELECT
  ORDER_ID          AS order_id,
  CUSTOMER_KEY      AS customer_key,
  ORDER_DT          AS order_date,
  CAST(ORDER_AMT AS DECIMAL(18,4)) AS order_amount,
  STATUS_CD         AS status_code,
  LOAD_TS           AS load_timestamp
FROM legacy_edw.SALES.FACT_ORDERS;

-- Conformed: business logic ported from the legacy view V_ORDERS_ENRICHED.
CREATE VIEW conformed.sales.orders AS
SELECT
  o.order_id,
  o.order_date,
  o.order_amount,
  c.customer_id,
  c.customer_segment,
  CASE o.status_code
    WHEN 'C' THEN 'completed'
    WHEN 'X' THEN 'cancelled'
    ELSE 'open'
  END AS order_status
FROM staging.sales.fact_orders o
JOIN staging.sales.dim_customer c
  ON o.customer_key = c.customer_key
WHERE o.load_timestamp >= DATE '2015-01-01';

-- Gold: what dashboards query.
CREATE VIEW sales.orders AS
SELECT * FROM conformed.sales.orders;
```

Two decisions in that SQL are deliberate. The staging view does the column renaming and type casting, so the conformed tier works in standard names and standard types from the beginning and does not care whether the source is Teradata or Iceberg. And the gold view is a trivial passthrough, which looks pointless until you need to change the conformed logic without touching the name consumers use.

Access control comes over in this phase too. Export the legacy warehouse's grants (every system has a way to dump them) and translate them into grants on the semantic layer's namespaces and views. Grant at the gold tier where possible, because that is the surface consumers touch. Where the legacy system has row-level security (a sales rep sees only her region), implement it as a row filter on the gold view using the engine's row-access policy mechanism. Where it has column masking (PII visible only to a role), implement that as a column mask. Both live in the engine now and follow the view through the migration.

## Phase Two: Repointing Consumers

With the semantic layer built and validated against the legacy views, consumers move to the engine. This is the only phase where consumers experience a change, and the change is a connection string.

Group consumers by how they connect. BI tools connect through JDBC, ODBC, or Arrow Flight SQL. Scheduled jobs connect through a database driver from Python, Java, or a workflow orchestrator. Ad-hoc users connect through a SQL client. Each group gets a new connection target (the virtualization engine's endpoint) and the same logical table names they used before.

Do this in waves ordered by risk. Start with internal, low-stakes consumers (an analyst team's exploratory dashboards). Then scheduled batch reports. Then executive dashboards. Then external-facing or regulatory outputs last. Each wave runs on the engine for a week or two before the next starts, and each wave's queries go into the engine's query log, which becomes the validation corpus for phase three.

Two things make this phase go smoothly.

First, name compatibility. If consumers referenced `EDW.SALES.FACT_ORDERS` and the semantic layer calls it `sales.orders`, every consumer's SQL has to change. If the semantic layer also exposes `EDW.SALES.FACT_ORDERS` as an alias to `sales.orders`, the consumer's SQL does not change and only the connection does. Most engines support this through nested namespaces or space hierarchies. Use it. Deprecate the legacy names after the migration is done, not during.

Second, driver compatibility. A dashboard tool that uses a vendor-specific driver for the legacy warehouse needs the engine's driver instead, and the SQL dialect the tool generates has to work on the engine. Test every BI tool's generated SQL against the engine before the wave. Dialect differences (date functions, string concatenation, `TOP` versus `LIMIT`) are the most common breakage, and they show up as errors rather than wrong results, which is the good kind of breakage.

At the end of this phase, every consumer is on the engine, every query flows through the semantic layer, and the data has not moved. The legacy warehouse is still the system of record for every table, still receiving every ingestion load, and now has exactly one direct consumer: the virtualization engine.

## Phase Three: Validating Parity, Access, and Performance

This phase is where the zero-copy approach earns its name. Everything that a lift-and-shift discovers after the move, you discover here, with the original data still in place and every fix cheap.

**Query parity.** Take the engine's query log from phase two. For each distinct query (or a stratified sample if there are thousands), run it against the engine and run the equivalent against the legacy warehouse directly, and diff the results. Row counts, checksums of sorted output, and aggregate totals per column catch most differences. The differences you find fall into a few categories: type conversion (a decimal rounded differently), null handling (a legacy view treated empty string as null), collation (a sort order that differs by case sensitivity), and ported view bugs (a join condition transcribed wrong). Fix each in the semantic layer and rerun. When the diff is clean across the corpus, the semantic layer is a faithful replica of the legacy warehouse's behavior, and it will stay faithful when the data underneath moves, because the swap does not touch the view logic.

**Access parity.** For each principal (or role) in the legacy system, run a sample of that principal's queries through the engine as that principal, and confirm the same rows come back and the same forbidden queries are rejected. Row filters and column masks are the places where this fails, because they were translated by hand. A rep who can see two regions in the legacy system and three in the engine is a data breach waiting for the audit. Do this per role, not per user, and do it before the executive dashboards move.

**Performance.** With consumers on the engine and the legacy warehouse still holding the data, every query's latency is now the legacy warehouse's latency plus the engine's planning and network overhead. That is typically a small regression, and it is the baseline. This is where query acceleration comes in. Dremio's Reflections (materialized, engine-managed acceleration structures) are built on the semantic layer views, not the physical tables. A reflection on `sales.orders` accelerates every query against that view regardless of whether the view's source is the legacy warehouse or Iceberg. Build reflections for the heavy dashboards now, against the legacy source, and the queries speed up before any data has moved. When the source swaps to Iceberg, the reflection refreshes from the new source and the acceleration carries over. Autonomous Reflections, which build and drop themselves based on workload, reduce the manual tuning here.

Here is a validation table for a migration in flight, showing the kind of tracking that makes this phase concrete:

| Check | Method | Pass criterion | Typical failures found |
|---|---|---|---|
| Row count parity | `SELECT COUNT(*)` on view vs legacy table, per table | Exact match | Ported view filter differs from original |
| Aggregate parity | `SUM`, `MIN`, `MAX` per numeric column | Match within decimal precision | Type cast rounding, null vs zero |
| Checksum parity | Hash of sorted output on sampled queries | Exact match | Collation, string trimming, timezone |
| Access parity | Same query as same role on both systems | Same row set, same rejections | Row filter translation, missing grant |
| Latency baseline | p50 and p95 per dashboard on engine vs direct | Within agreed regression budget | Missing pushdown, no reflection |
| Dialect coverage | Every BI-generated query executes | No errors | Date functions, `TOP`, quoting |

Do not leave this phase until every row in that table passes. The temptation to start moving data while validation is still finding issues is strong, because moving data feels like progress. It is the same temptation that produced the eighteen-month migration in the opening.

## Phase Four: Background Migration to Iceberg

Now data moves, and because every consumer reads through a view, it moves without anyone noticing.

The target for each table is an Iceberg table in the lakehouse, registered in the REST catalog (Apache Polaris, or Dremio's Open Catalog built on it), with a partition spec and sort order chosen for the query patterns observed in the phase two query log. That log is a gift: it tells you which columns are filtered most often, which is exactly what partitioning should be based on.

The copy itself has three shapes depending on table size and change rate.

Small, static tables (dimensions, reference data, anything under a few gigabytes that changes rarely) are copied in one statement. In Dremio that is `CREATE TABLE lakehouse.sales.dim_customer AS SELECT * FROM staging.sales.dim_customer`, which reads from the legacy source through the staging view and writes Iceberg. Then the staging view is swapped and the legacy table is frozen.

Large, append-only tables (fact tables, event logs) are copied with a watermark. Copy everything up to a timestamp or a monotonic key in one or more background jobs. Then, when the copy is caught up to within the ingestion interval, do the swap during a moment between ingestion loads: copy the final delta, repoint the ingestion pipeline to write Iceberg, swap the view. The window between "final delta copied" and "ingestion repointed" is the only moment where a load lands in the legacy table without being copied, and it is a few minutes long at most. Schedule it right after an ingestion completes.

Large, mutable tables (slowly changing dimensions, tables with updates and deletes) are the hard case. Copy the full snapshot, then capture changes from the legacy system (a CDC feed, a change table, or a diff against the previous copy) and apply them to Iceberg with `MERGE INTO` until the swap. After the swap, the ingestion pipeline writes to Iceberg directly. If the legacy system has no change capture, the fallback is a short freeze: stop the ingestion, copy the final delta, swap, restart ingestion against Iceberg. For most enterprise tables that freeze is minutes, which is a much smaller outage than a lift-and-shift cutover.

The swap itself is a view redefinition:

```sql
-- Before: staging view reads the legacy warehouse.
CREATE OR REPLACE VIEW staging.sales.fact_orders AS
SELECT
  ORDER_ID AS order_id, CUSTOMER_KEY AS customer_key,
  ORDER_DT AS order_date, CAST(ORDER_AMT AS DECIMAL(18,4)) AS order_amount,
  STATUS_CD AS status_code, LOAD_TS AS load_timestamp
FROM legacy_edw.SALES.FACT_ORDERS;

-- After: same view, same columns, same types, reads Iceberg.
CREATE OR REPLACE VIEW staging.sales.fact_orders AS
SELECT
  order_id, customer_key, order_date, order_amount,
  status_code, load_timestamp
FROM lakehouse.sales.fact_orders;
```

The conformed and gold views above it do not change. The reflections on the gold views refresh from the new source on their next cycle. Consumers see the same names, the same columns, the same types, and (after the reflection refresh) the same or better performance.

The column renaming and casting that the staging view did against the legacy source is now done by the Iceberg table's schema, because the copy wrote standard names and standard types. That is why the "after" view is simpler. The work moved from query time into the one-time copy.

After the swap, verify. Run the phase three parity checks against the swapped view for a day. Then freeze the legacy table (revoke write access, or rename it) and leave it frozen for a retention period before dropping it. A frozen table you can unfreeze is a cheap insurance policy against a parity bug that surfaces a week later.

## Stored Procedures, Scheduled Transformations, and the Write Side

Everything so far has been about reads, because reads are 90 percent of consumers. The write side of a legacy warehouse is smaller and harder, and it needs its own plan.

A legacy warehouse has three kinds of writers. Ingestion pipelines load source data into base tables. Transformation jobs (stored procedures, scheduled SQL, ETL tool workflows) read base tables and write derived tables. And a handful of applications write directly, usually into staging areas.

Ingestion pipelines are handled in phase four as described: each pipeline repoints from the legacy table to the Iceberg table at that table's swap. The pipeline's tooling has to be able to write Iceberg, which today means Spark, Flink, Dremio, PyIceberg, DuckDB, or a commercial tool with an Iceberg sink. Inventory the pipelines by tool in phase one, because a pipeline in a tool with no Iceberg sink is a pipeline that has to be rewritten, and that is a schedule item.

Transformation jobs are where stored procedures live, and stored procedures do not port. A 400-line Teradata procedure with cursors, temp tables, and conditional branching has no equivalent in an Iceberg lakehouse. The realistic options are three. Rewrite it as a set of SQL statements orchestrated by a scheduler (dbt, Airflow, Dagster) against the engine, which is the common answer and is a rewrite. Rewrite it as a Spark or Python job, which is also a rewrite and is the answer when the logic is procedural rather than relational. Or, for procedures that only produce a derived table, replace the procedure with a view (or a reflection on a view) in the semantic layer, which removes the job entirely. That third option is more common than teams expect: a large fraction of nightly procedures exist only to materialize a join that a modern engine evaluates on demand with acceleration.

Sequence the transformation rewrites by dependency. A derived table that is written by a procedure and read by dashboards is swapped like any other table, except that its "ingestion pipeline" is the rewritten procedure. The procedure's inputs must already be on Iceberg (or reachable through the staging views, which works either way) and its output goes to Iceberg from the first run. Run the old procedure and the new job in parallel for a few cycles and diff the outputs before the swap.

Direct application writes are the rarest and the messiest. An application that inserts into a staging table with a database driver is going to need either an Iceberg-capable write path or an intermediary. The cleanest intermediary is object storage: the application writes files to a landing prefix, and a serverless ingestion function (PyIceberg and DuckDB fit this well) commits them to Iceberg. That turns a direct write into an ingestion pipeline, which the migration already knows how to handle.

## A Swap Runbook for One Table

The swap is the moment of truth for each table, and it should be boring. Here is the runbook I use, for an append-only fact table with a nightly load:

1. Confirm the background copy has caught up to the last completed load. Compare row count and max load timestamp between the Iceberg table and the legacy table.
2. Confirm the parity checks from phase three pass against a temporary view pointed at the Iceberg table, so any type or logic problem surfaces before the real swap.
3. Wait for tonight's load to complete on the legacy table.
4. Copy the final delta (rows with load timestamp greater than the Iceberg table's max) into Iceberg. This is small and takes minutes.
5. Repoint the ingestion pipeline to write Iceberg. Deploy the config change. Do not trigger a run.
6. Redefine the staging view to select from the Iceberg table. This is one `CREATE OR REPLACE VIEW`.
7. Trigger a refresh of every reflection that depends on the gold views over this table.
8. Run the parity checks against the swapped view. Row count, aggregates, a checksum on a sampled query.
9. Revoke write access on the legacy table. Rename it with a `_frozen` suffix if the warehouse allows renames without breaking the engine's connector metadata.
10. Record the swap date. Schedule the full-snapshot diff for one week out and the drop for the end of the retention period.

Total elapsed time is usually under an hour, most of it waiting for the reflection refresh. No consumer is notified because no consumer is affected. The next night's load runs against Iceberg, and the legacy table never receives another row.

Batch the swaps. Ten tables a night is a reasonable pace for a team of two once the runbook is automated, and the runbook automates well because every step is a SQL statement or an API call. A 4,000-table warehouse with 1,200 tables worth migrating (the rest archived) is four months of swaps at that pace, and the four months are low-risk background work rather than a critical-path cutover.

## The Cost Model

The cost argument for zero-copy is easy to make once the mechanism is clear, and it is worth making explicitly because the lift-and-shift plan usually won on paper.

Lift-and-shift costs the legacy license for the full migration duration plus a target platform bill that starts on day one and grows as tables land, plus the double-ETL compute and storage for every table that exists in both places, plus the engineering time to rebuild views, grants, and performance tuning after the move. The duration is long because the consumer cutover is serialized behind the data move and every cutover wave finds problems.

Zero-copy costs the legacy license for a shorter duration (because the migration is bounded by swap throughput rather than cutover risk), the engine's cost from phase one, and the target platform bill that grows only as tables actually swap. There is no double-ETL because no table is ever in two systems of record. The view, grant, and performance work happens once, in phase one and three, against the original data, and carries over.

The line item that surprises finance teams is the engine cost in phases one through three, when it is sitting in front of the legacy warehouse and the lakehouse is nearly empty. That cost is real and it is the price of decoupling. It is also small next to a year of double-ETL, and it is the same engine that serves the lakehouse after the migration, so it is not a temporary expense. Frame it that way in the business case.

## Failure Modes and Warning Signs

**Consumers that bypass the semantic layer.** A team with direct credentials to the legacy warehouse keeps using them. When their table is swapped and frozen, their job breaks. The sign is a query in the legacy warehouse's log from a principal that should be on the engine. Revoke direct access to the legacy warehouse for everyone except the engine's service account at the end of phase two, and treat any remaining direct connection as a migration blocker.

**Ported views that depend on legacy-only functions.** A view uses a warehouse-specific function (a Teradata `QUALIFY`, an Oracle `CONNECT BY`, a SQL Server `PIVOT` with dynamic columns) that the engine pushes down to the legacy source and cannot evaluate itself. It works in phases one through three because the source is the legacy system. It breaks at the swap when the source is Iceberg. The sign is a view that only plans successfully with pushdown. Audit every ported view for source-specific SQL in phase one and rewrite it in the engine's dialect before validation.

**Type drift at the copy.** The Iceberg table is created with a type that does not match the staging view's cast. A `DECIMAL(18,4)` becomes a `DOUBLE` because the copy statement inferred it. Parity checks catch this, but only if you run them after the swap. Define Iceberg table schemas explicitly rather than inferring them from `CREATE TABLE AS SELECT`.

**Reflection staleness after swap.** The reflection on a gold view is still built from the legacy source when the staging view swaps, and until it refreshes, queries served from the reflection see stale data (if the legacy table received loads after the copy) or old physics. Trigger a refresh as part of the swap runbook rather than waiting for the schedule.

**Watermark gaps on mutable tables.** A CDC feed that misses a batch, or a change table that is truncated, leaves the Iceberg copy behind the legacy table in a way the swap does not detect. The sign is aggregate parity drift on the swapped table that grows over time. For mutable tables, run a full-snapshot diff against the frozen legacy table one week after the swap, before the retention period ends.

**Cost surprises from pushdown failures.** A query that the engine expected to push down to the legacy warehouse instead pulls the whole table over the network and filters locally. Against a 2-terabyte fact table that is a 2-terabyte transfer per query. The sign is engine memory and network spikes with legacy warehouse CPU flat. Check the query profile for pushdown on every heavy query in phase three, and fix the view or the connector configuration before the dashboards move.

**Parallel-run fatigue.** Running the old procedure and the new job side by side for validation is the right call, and it is also expensive if it goes on for months. Set a fixed parallel-run window per job (three cycles for a nightly job is enough to catch most drift) and a decision at the end of it. A parallel run with no end date is a double-ETL by another name.

**The legacy license does not end.** The migration team finishes, the last table swaps, and the legacy warehouse is still running because six tables nobody owns were never decided on. Decide the fate of every table in the inventory in phase one: migrate, archive, or drop. An undecided table at the end is a table that keeps the license alive.

## Operational Guidance

**Inventory from the query log, not the catalog.** The catalog tells you what exists. The log tells you what matters. Sort tables by query count in the last 90 days and treat the bottom half as archive candidates from day one.

**Build the staging tier one to one and the conformed tier from the legacy views.** The staging tier is the swap point. The conformed tier is where the business logic lives. Keep them separate so the swap never touches logic.

**Alias the legacy names.** Consumers should be able to keep their SQL. Deprecate the aliases in a later project.

**Revoke direct legacy access at the end of phase two.** The engine's service account should be the only principal that can read the legacy warehouse. This is the control that makes phase four safe.

**Do not skip validation.** Phase three is the whole reason the approach works. If the parity table has a red cell, the data does not move.

**Build reflections before the data moves.** Acceleration on the semantic layer is source-independent. Getting the dashboards fast in phase three means they stay fast through phase four.

**Partition from the query log.** The filter columns in the log are the partition columns for the Iceberg tables. Do not partition by what the legacy DBA partitioned by.

**Swap during the ingestion gap.** For append-only tables, the swap happens in the minutes after a load completes. For mutable tables, use CDC to the last moment, or accept a short freeze.

**Freeze before you drop.** Every swapped legacy table stays frozen and readable for a retention period. Drop it only after a full-snapshot diff passes at the end of that period.

**Track the license end date as a project milestone.** The migration is done when the legacy warehouse is off, not when the last table moves.

## Where This Is Heading

The zero-copy pattern gets easier as the pieces it relies on mature.

Iceberg is becoming the lingua franca of the target side. With Apache Polaris as a top-level Apache project and every major engine speaking the REST catalog protocol, the lakehouse a table lands in is no longer tied to the engine that put it there. A table migrated through Dremio is readable by Spark, Trino, DuckDB, and PyIceberg the same day, which removes the "are we just moving to a different lock-in" objection that used to stall these projects.

Federated engines are getting better at the legacy side. Connector coverage for on-premises warehouses is broad, pushdown is more complete, and the query profile tooling that shows whether a filter reached the source is standard. The phase three validation is faster than it was three years ago.

Semantic layers are becoming portable. The Apache Ossie (incubating) effort to standardize semantic model definitions, and the Polaris semantic model REST API proposal, point at a future where the conformed and gold tiers built in phase one are defined in a vendor-neutral format and stored in the catalog next to the tables. That makes the semantic layer itself migratable between engines, which closes the last loop: the layer that decoupled consumers from the warehouse is not itself a new coupling.

Agents are a new class of consumer. An AI agent querying through a semantic layer gets governed, named, typed access to `sales.orders` without knowing or caring whether the source is Teradata or Iceberg. Every argument for putting the semantic layer in front of human consumers applies with more force to agents, which cannot be told "the table moved, update your SQL."

## Conclusion

A warehouse migration fails when it moves data before it decouples consumers from where the data lives. The zero-copy approach decouples first. A query virtualization engine presents the legacy warehouse and the Iceberg lakehouse through one namespace. A semantic layer of staging, conformed, and gold views gives every consumer a stable name that does not encode physical location. Consumers move to the engine once, while data stays put. Parity, access, and performance are validated against the original data. Then tables migrate to Iceberg in the background, one at a time, and each migration is a view redefinition that no consumer sees.

There is never a second system of record, so there is never a double-ETL. There is never a cutover weekend, because every swap happens in the minutes between ingestion loads. The legacy warehouse's last day is the day its last frozen table passes its final diff, and that day is a line item on a project plan rather than a hope.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and the practical side of moving enterprise data onto Apache Iceberg. *Architecting an Apache Iceberg Lakehouse* (Manning) covers migration patterns, semantic layer design, and table layout decisions in depth. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
