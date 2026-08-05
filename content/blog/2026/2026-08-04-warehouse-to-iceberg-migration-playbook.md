---
title: "A Migration Playbook for Moving Legacy Warehouses onto Apache Iceberg"
date: "2026-08-04"
description: "A dependency-first playbook for migrating legacy warehouses onto Apache Iceberg: snapshot vs migrate vs add_files, four-level parity validation, and federation-based cutover."
author: "Alex Merced"
category: "Data Lakehouse"
tags:
  - Apache Iceberg
  - Migration
  - Data Warehouse
  - Playbook
  - Parquet
  - Data Lakehouse
canonical: "https://iceberglakehouse.com/posts/warehouse-to-iceberg-migration-playbook/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/warehouse-to-iceberg-migration-playbook/).

# A Migration Playbook for Moving Legacy Warehouses onto Apache Iceberg

*By Alex Merced, Data Lakehouse and AI Evangelist*

The migration plan says twelve weeks. Week fourteen arrives and the team has moved four tables out of six hundred, because table number five turned out to feed a report that a regulator sees quarterly, and nobody can find who owns the SQL that builds it.

Warehouse migrations fail on dependencies rather than on data. Copying rows is a solved problem. Discovering that a view three layers down uses a vendor-specific date function, that a scheduled job writes into a table two teams believe they own, and that a dashboard filters on a column whose semantics changed in 2021 is not.

This piece is a practical sequence for moving a legacy warehouse onto Iceberg tables without a big-bang cutover. It covers dependency assessment, the in-place conversion procedures that avoid rewriting data, how to prove query parity before anyone switches, and how a federation layer turns a migration from an event into a gradual move.

A disclosure. I work for Dremio, which was acquired by SAP and now sits within SAP Business Data Cloud. Dremio does query federation, which is one of the techniques described here, and I have a professional interest in that technique being useful. I have tried to describe when it helps and when it does not.

## Sequence the work by dependency, not by size

The instinct is to migrate the largest tables first, because they represent the most storage cost. That is backwards.

Migrate by dependency depth. Leaf tables that nothing depends on move safely. Tables that feed twenty downstream objects move last, after everything downstream is understood.

Build the dependency graph before anything else. Most warehouses expose enough metadata to do this programmatically, and doing it by interview produces a graph that is missing exactly the things that break.

Pull three categories of dependency.

**Object dependencies** are views built on tables, tables built by scheduled jobs, and materialized views refreshed on a schedule. Query the warehouse's own metadata catalog for these.

**Query dependencies** are the SQL that external tools run. Pull the query history for the last ninety days, extract table references, and group by the application or user that issued them. This surfaces the dashboard nobody documented.

**Write dependencies** are the jobs that insert, update, or delete. These matter most, because a table with two writers cannot cut over while either one is still pointed at the old location.

The output is a ranked list where each table carries a count of downstream objects, a count of distinct query sources in the last ninety days, and a named owner. Tables with no owner are the ones that will consume your schedule. Find them early.

One rule saves more time than any other: nothing moves until it has an owner who agrees it moves.

## Convert in place rather than copying

Most legacy warehouse data already sits in a columnar format on object storage, or gets exported there as the first migration step. Once Parquet files exist, creating an Iceberg table on top of them does not require rewriting them.

Iceberg ships three procedures for this. Understanding the difference matters, because picking the wrong one costs a full data rewrite.

`snapshot` creates an Iceberg table that references the source table's existing data files, leaving the source table intact and independent. Writes to the new table go to a new location. This is the safe option for testing, since the original keeps working and you can drop the Iceberg copy without consequence.

```sql
CALL spark_catalog.system.snapshot(
    source_table => 'legacy_hive.sales.orders',
    table        => 'prod.sales.orders_iceberg'
);
```

`migrate` converts the source table in place. The original table becomes an Iceberg table, and the old definition is preserved under a backup name. No data is rewritten. This is the production conversion once testing is done.

```sql
CALL spark_catalog.system.migrate(
    table => 'legacy_hive.sales.orders'
);
```

`add_files` registers existing Parquet files into an Iceberg table you created yourself. This is the flexible option when you want control over the schema, the partition spec, or the sort order, and when the source files do not correspond to a table the engine already knows about.

```sql
CREATE TABLE prod.sales.orders (
    order_id     BIGINT,
    customer_id  STRING,
    status       STRING,
    amount       DECIMAL(12,2),
    order_date   DATE
)
USING iceberg
PARTITIONED BY (months(order_date))
TBLPROPERTIES ('format-version' = '3');

CALL spark_catalog.system.add_files(
    table             => 'prod.sales.orders',
    source_table      => 'legacy_hive.sales.orders',
    partition_filter  => map('year', '2026')
);
```

Three details in that sequence matter.

The partition spec on the Iceberg table does not have to match the source layout. Iceberg's hidden partitioning means the transform is recorded in metadata rather than baked into directory paths. A source partitioned by a string column of year and month registers into an Iceberg table partitioned by `months(order_date)`, and queries filter on the date column rather than on the partition column.

`partition_filter` lets you register in batches. A table with eight years of history registers one year at a time, which keeps each job small and restartable.

`format-version = 3` is worth setting during migration rather than upgrading later. You get deletion vectors, row lineage, and the Variant type from the start, and you avoid a second coordination exercise with every reading engine.

What none of these procedures do is fix a bad physical layout. If the source has four hundred thousand small files, the Iceberg table has four hundred thousand small files. Registration is fast and the compaction that follows is not. Budget for it.

## Handle the schema translation deliberately

Type systems differ between warehouses, and the differences are where silent corruption enters.

Decimal precision and scale need explicit checking. A source column declared as a numeric type with implicit precision maps to a specific Iceberg decimal, and picking the wrong scale rounds money.

Timestamps need a decision about time zone semantics. Iceberg distinguishes timestamps with and without time zone, and V3 adds nanosecond variants. A source column that stored local times without a zone and a target column typed as an instant produce results that are off by hours and look plausible.

String types with declared lengths become unbounded strings. That is usually fine and occasionally hides a data quality rule that the length constraint was enforcing.

Nested types need attention on ordering and null handling. A struct that a source system flattened for you gets represented differently in Parquet.

Complex JSON columns are the case where the V3 Variant type changes the answer. A source column holding JSON strings converts to Variant with shredding enabled, which gives you file pruning on fields inside the document. That is a substantial improvement over carrying the string forward, and migration is the natural moment to do it.

Write the type mapping down as a document before converting anything, and validate it against sample data with extreme values rather than typical ones.

## Prove parity before anyone switches

This is the phase teams shorten under schedule pressure, and it is the phase that determines whether the migration is trusted.

Parity means the new table produces the same answers as the old one for the queries that matter. It does not mean the row counts match, though row counts are the first check.

Run four levels of validation.

**Structural.** Row count, column count, and null count per column. Cheap, fast, and catches gross errors like a partition filter that missed a year.

**Statistical.** Sum, min, max, and distinct count on every numeric and key column. This catches type conversion problems that row counts miss.

```sql
SELECT
    COUNT(*)                       AS rows,
    SUM(amount)                    AS amount_sum,
    MIN(order_date)                AS first_date,
    MAX(order_date)                AS last_date,
    COUNT(DISTINCT customer_id)    AS customers,
    COUNT(*) FILTER (WHERE status IS NULL) AS null_status
FROM prod.sales.orders;
```

Run the identical query against the source and compare. Differences in a sum with matching row counts point at decimal precision. Differences in date bounds point at time zone handling.

**Query-level.** Take the top fifty queries by frequency from the query history, run them against both systems, and compare results row by row. This is the level that catches semantic differences: a function that rounds differently, a null ordering difference in a window function, an implicit cast.

**Behavioral.** Run the queries under realistic concurrency and compare latency distributions, not medians. A migration that halves median latency and triples the ninety-fifth percentile is a regression that a median comparison hides.

Automate all four and run them on a schedule during the parallel period, not once at cutover. Data changes, and a parity test that passed three weeks ago proves nothing about today.

## Use federation to make cutover gradual

The hardest part of a migration is that consumers point at one system or the other, and switching them is a coordinated change across teams you do not control.

A federation layer removes that coupling. Consumers point at a virtual layer. The virtual layer points at the source. When a table migrates, the virtual layer repoints to Iceberg. Consumers change nothing.

This is the technique that turns a migration from an event into a sequence of small moves. It works like this.

Stand up the federation layer with connections to both the legacy warehouse and the Iceberg catalog. Define a view for each table that consumers use, initially resolving to the legacy source.

```sql
CREATE VIEW analytics.sales.orders AS
SELECT * FROM legacy_warehouse.sales.orders;
```

Migrate consumers to the view rather than to Iceberg. This is a change they make once, against a stable interface, before any data moves. It is also the phase where you discover which consumers you did not know about, because they break and someone complains.

Migrate the table to Iceberg and repoint the view.

```sql
CREATE OR REPLACE VIEW analytics.sales.orders AS
SELECT * FROM prod.sales.orders;
```

Consumers see nothing. Roll back by repointing the view, which takes seconds rather than a restore.

For a period, you can even serve both, with the view unioning historical data from Iceberg and recent data from the legacy source while dual-writing catches up. That pattern is ugly and it lets a large table migrate without freezing writes.

Dremio's Zero-ETL Federation and semantic layer are built for this shape, and since the SAP acquisition those same governed views also surface into SAP Business Data Cloud. Other federation tools work too. The architectural point is independent of product: an indirection layer between consumers and physical storage converts a coordinated cutover into an operation one team performs.

There is a caveat worth stating. Federation during migration is a temporary structure with a real cost, since every query pays a planning hop and the legacy system keeps serving load. If the federation layer becomes permanent because migrating the last twenty tables is nobody's priority, you have added a component rather than completed a migration. Put an end date on it.

## Dual-write and the write path

Read migration is the easy half. Writes are where correctness lives.

A table with an active writer cannot cut over cleanly while that writer targets the old location. Three approaches work, in increasing order of complexity.

**Freeze and cut.** Stop the writer, run a final incremental load, repoint the writer, restart. Simple and correct. Requires a maintenance window, which for many tables is available and for a few is not.

**Dual write.** The writer sends every change to both systems for a period. Reads move to Iceberg once parity holds, and the legacy write path gets removed after a confidence window. This gives a rollback that costs nothing. It also doubles write cost and introduces the possibility of divergence, so run continuous parity checks during the dual-write period rather than at the end.

**Change capture.** Point a CDC pipeline at the legacy table and land changes into Iceberg continuously. This is the right answer for large tables that cannot freeze, and it is the most work. Iceberg V3 helps here: deletion vectors make the frequent small updates of a CDC feed cheap on the read side, which was the main reason teams avoided merge-on-read for migration targets.

Choose per table, not for the whole project. Most tables freeze fine. A handful need dual write. One or two need change capture, and those are the ones to start early.

## Rewriting the SQL

Every migration has a corpus of SQL that assumes the source engine.

Sort it into three buckets and handle each differently.

**Portable SQL** runs unchanged. Standard joins, aggregates, and filters. This is usually the majority and it needs validation rather than work.

**Dialect differences** need mechanical translation. Date functions, string functions, and type casting differ across engines in predictable ways. Translation tools handle a lot of this, and every one of them produces output that needs review. Budget review time rather than assuming the tool finished the job.

**Semantic differences** need a human. Null ordering in window functions, implicit cast behavior, division by zero handling, and rounding modes differ in ways that produce plausible wrong answers. These are the ones parity testing catches and translation tools do not.

The practical approach is to run the translation tool, then run query-level parity testing on everything it touched, then investigate every mismatch by hand. Skipping the middle step means the mismatches surface in a report six weeks later.

Deprecate rather than translate wherever you can. Query history usually shows that a substantial share of stored SQL has not run in a year. Migrating dead SQL is pure cost. Get an owner to confirm before deleting, but do ask.

## Building the dependency graph in practice

The assessment phase deserves more detail, because it is the phase that determines whether the schedule is real.

Start with object dependencies from the source system's own metadata. Every major warehouse exposes a catalog view listing which objects reference which. The exact table name differs by platform, and the shape of the query does not.

```sql
SELECT
    referencing_schema || '.' || referencing_object AS consumer,
    referenced_schema  || '.' || referenced_object  AS producer,
    referencing_object_type                          AS consumer_type
FROM information_schema.object_dependencies
WHERE referenced_schema NOT IN ('information_schema', 'system');
```

Load the result into a graph and compute, for each table, the number of objects transitively downstream. That number is your migration ordering key.

Then pull query history, which is where undocumented consumers live.

```sql
SELECT
    table_reference,
    query_source,
    COUNT(*)                    AS executions,
    MAX(start_time)             AS last_seen,
    COUNT(DISTINCT user_name)   AS distinct_users
FROM query_history_with_table_refs
WHERE start_time >= current_date - INTERVAL '90' DAY
GROUP BY table_reference, query_source
ORDER BY executions DESC;
```

Three columns in that output earn their place. `query_source` separates the BI tool from the notebook from the scheduled job, and each needs a different migration conversation. `last_seen` identifies tables and queries that have not run in months, which are migration candidates for deletion rather than conversion. `distinct_users` tells you how many people notice if the cutover goes badly, which is the number that determines how much validation the table deserves.

Cross-reference the two lists. Tables that appear in object dependencies but never in query history are intermediate objects in a pipeline. Tables that appear in query history but not in object dependencies are consumed directly by external tools, and those tools are the ones nobody has an inventory of.

Then do the part no query answers. For every table with more than a trivial consumer count, find a human who will say the words "I own this and I approve moving it." Track that as a field in your inventory. In every migration I have watched, the schedule is set by the tables where that field stays empty.

## Sizing the effort honestly

Estimates for these projects miss for predictable reasons. Adjust for them up front.

Table count is a weak predictor of effort. Six hundred tables where five hundred and eighty are leaf objects with one consumer each is a smaller job than eighty tables with dense interdependencies. Estimate from graph depth and consumer counts, not from a row in an inventory spreadsheet.

The SQL corpus is usually the largest single work item, and it is the one estimated by counting queries rather than by counting the ones that need human review. Sample fifty queries at random, translate them, and count how many needed manual intervention. That percentage applied to the corpus is a defensible estimate. A guess is not.

Compaction after registration is real compute and real elapsed time. A table with hundreds of thousands of small files takes hours to compact and competes with everything else running. Schedule it explicitly rather than treating it as a step inside conversion.

Validation time scales with consumer count, not data volume. A billion-row table with one consumer validates faster than a million-row table that forty dashboards read, because the second one needs query-level parity across forty query shapes.

The governance rebuild is a parallel project with its own owner. Permissions, masking, and audit configuration do not export from the source, and reconstructing them is genuinely a chance to fix years of accumulated grants rather than a mechanical copy. Treat it as design work.

Dual running is the cost line that grows when the schedule slips, and schedules slip. Model the overlap at your realistic timeline, then add a quarter.

## What to fix while you are in there

A migration is the only time anyone gets permission to change physical design. Use it, selectively.

Partitioning is the biggest opportunity. Legacy schemes often encode a directory layout that a previous engine required, with string columns holding year and month values that queries have to filter on explicitly. Iceberg's hidden partitioning records the transform in metadata, so consumers filter on the natural column and the engine derives the partition. Redesign the spec based on the actual filter patterns in your query history rather than copying the old one forward.

File sizing is the second. Target file sizes in the hundreds of megabytes rather than whatever the legacy export produced. This single change often delivers more query improvement than the format switch does.

Sort order is the third and the most underused. Parquet statistics only prune when values cluster within files. Sorting on the columns that queries filter on, applied during the post-registration compaction, turns statistics from decoration into pruning.

JSON string columns are the fourth. Converting them to the V3 Variant type with shredding enabled gives file-level pruning on fields inside the document, which no amount of tuning achieves on a string column.

What not to change during a migration: business logic, column semantics, and grain. Changing the answer while changing the platform makes parity testing impossible and destroys trust in the result. Fix the physical layout, keep the logical model identical, and schedule the semantic cleanup as separate work with its own validation.

## Failure modes

**No owner.** A table nobody claims blocks indefinitely, because nobody will approve the cutover. Escalate early rather than working around it.

**Small files inherited.** Registration is fast, and a table with hundreds of thousands of tiny files performs badly on day one. Compact immediately after registration and before consumers arrive, or the migration gets blamed for a pre-existing problem.

**Silent format version downgrade.** A table created through a catalog that does not honor the requested format version accepts your V3 properties and produces a V2 table. Read the version back.

**Partition strategy carried over unchanged.** Legacy partitioning often reflects a directory layout that a different engine needed. Iceberg's hidden partitioning is an opportunity to fix it, and copying the old scheme forward preserves a limitation nobody wanted.

**Parity tested once.** A single validation run at the start of the parallel period proves nothing about the state at cutover. Automate and schedule it.

**Federation layer becomes permanent.** The last twenty tables never move, and the temporary indirection is now infrastructure.

**Purge-enabled drops on the source.** A cleanup step that issues a drop against a legacy table configured to purge deletes the underlying files, including files a newly registered Iceberg table now references. Use the unregister or drop-without-purge form, and test the behavior on a throwaway table first.

**Dual running underestimated.** The plan assumes six months of overlap. The reality is fourteen. Model the cost at the realistic timeline.

**Governance not rebuilt.** Permissions, masking rules, and audit configuration accumulated in the source over years and do not export. Rebuilding them is a project. Start it in parallel rather than discovering it at cutover.

## A phased plan

Six phases, each with an exit condition.

**Assess.** Build the dependency graph, assign owners, rank tables by dependency depth, and identify the write pattern for each. Exit when every table has an owner and a migration approach.

**Prepare.** Stand up the Iceberg catalog, the storage layout, and the federation layer. Define the role model before tables exist. Exit when a test table round-trips through the full stack with vended credentials and no static keys.

**Repoint consumers.** Move consumers onto the virtual layer while it still resolves to the legacy source. Exit when query history shows the legacy tables receiving traffic only from the federation layer.

**Convert.** Migrate tables in dependency order using snapshot for testing and migrate or add_files for production. Compact immediately. Run parity at all four levels. Exit per table when parity passes for a full week.

**Cut writes.** Freeze, dual write, or CDC per table according to the plan from phase one. Exit when the legacy write path is off and monitored as off.

**Decommission.** Remove legacy tables, retire the federation indirection for migrated tables, and delete the dead SQL nobody claimed. Exit when the legacy platform's bill drops.

The phase teams skip is the last one. A migration that leaves the old system running has captured none of the cost benefit and all of the complexity.

## Communicating progress

One organizational note, because migrations get cancelled for reasons unrelated to engineering.

Report progress in consumers moved, not tables converted. A stakeholder does not experience a converted table. They experience a dashboard that now reads from the new platform. Two hundred tables converted with no consumers repointed looks like zero progress to everyone outside the team, and it accurately reflects zero delivered value.

Publish the parity results. A weekly summary showing that the top fifty queries return identical results on both systems does more for confidence than any status deck. When a mismatch appears, publish that too, along with the cause. A migration that admits and explains three discrepancies is trusted more than one that reports none.

Track the legacy platform's bill as the headline metric. It is the number the migration was justified on, and it stays flat until decommissioning starts. Showing that flat line early sets the expectation that savings arrive at the end rather than gradually, which prevents the mid-project conversation about why costs have gone up.

Name the tables that are blocked and why. A public list of tables waiting on an owner decision moves faster than a private one.


## Conclusion

Migrations fail on dependencies and on trust, not on data movement. The engineering is the part that goes according to plan. Build the dependency graph first, assign owners before moving anything, and sequence by depth rather than size.

Convert in place with snapshot, migrate, or add_files so you register files rather than rewriting them, then compact immediately because registration inherits whatever layout the source had. Set format version three during the conversion rather than scheduling a second upgrade.

Prove parity at four levels on a schedule, not once. Put a federation layer between consumers and physical storage so cutover becomes a view change one team makes rather than a coordinated event across many. Then take the federation layer back out, and turn the old system off, because a migration that leaves both platforms running has not finished.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and migration. *Architecting an Apache Iceberg Lakehouse* covers migration strategy, table design, and the platform decisions around a move like this, and *Apache Iceberg: The Definitive Guide* covers the conversion procedures and table mechanics in depth. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
