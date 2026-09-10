---
title: "Migrating Into Iceberg Without Moving Data"
date: "2026-09-10"
description: "add_files, snapshot, and migrate compared: the three in-place paths into Iceberg, the reconciliation each requires, the layout traps, and the rollback story."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - migration
  - metadata
  - add_files
  - data engineering
canonical: https://iceberglakehouse.com/posts/iceberg-in-place-migration/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-in-place-migration/).

There are three ways to get an existing dataset into Iceberg and only one of them involves copying files. Teams reach for the copy by default, because it is the mental model everyone brings from warehouse migrations, and then discover that a 40 TB migration is a two-week job with a transfer bill attached.

The alternative is that Iceberg tables are metadata over files that already exist. If your data is already Parquet or ORC in object storage, laid out in a way Iceberg can describe, the migration is a metadata operation. The bytes stay exactly where they are. What changes is that a catalog now knows about them and a manifest describes their contents.

This piece covers the three in-place paths and how to choose between them, the reconciliation that has to happen before you trust the result, the layout problems that turn an easy migration into a hard one, and the rollback story for each. I work at Dremio, so the enthusiasm for open tables is professional. The procedures are Iceberg's.

## Three procedures, three different jobs

They get conflated constantly and they do different things.

**`add_files`** takes files from an existing location and adds them to an Iceberg table you already created. The source table stays exactly as it was. You end up with two tables describing the same files: the original, and an Iceberg one. Additive and reversible, since dropping the Iceberg table without purge leaves the files and the original untouched.

**`snapshot`** creates a new Iceberg table that references the source table's existing data files, leaving the source intact. A read-only copy for testing, in effect. You can write to the snapshot table and those writes go to a new location rather than to the source's, so the source never changes. Made for validation before committing.

**`migrate`** converts the source table into an Iceberg table in place. The original table is replaced. This is the one that is not trivially reversible and the one to run only after the others have proven the result.

**`register_table`** belongs in the same conversation and does something different again: it takes an existing Iceberg metadata file and registers it in a catalog. Not a conversion, since the table is already Iceberg. This is the tool for moving a table between catalogs, recovering a table whose catalog entry was lost, or attaching a restored table to a new catalog. Confusing it with the conversion procedures is common and the symptom is an error about the source not being an Iceberg table, which is the procedure telling you it expected one.

The sequence most migrations should follow is `snapshot`, validate, then `migrate` or `add_files`. Going straight to `migrate` works and it removes the step where you find out something was wrong while the original still exists.

## The path that works

Concretely, for a Hive table of Parquet files.

**Step one: snapshot it and look around.**

```sql
CALL catalog.system.snapshot(
  source_table => 'legacy.orders',
  table => 'iceberg.orders_snapshot'
);
```

You now have an Iceberg table pointing at the same files. Query it, compare it, run your downstream jobs against it. Writes to it land in a new location, so nothing you do here touches the source.

**Step two: reconcile properly.** Covered in its own section below, because sampling is not enough.

**Step three: convert, or add.** If the goal is to replace the source table:

```sql
CALL catalog.system.migrate(
  table => 'legacy.orders',
  properties => map('write.format.default', 'parquet')
);
```

If the goal is to build a new table incrementally from existing files, perhaps merging several sources:

```sql
-- Table created first with the schema and partitioning you want
CALL catalog.system.add_files(
  table => 'iceberg.orders',
  source_table => 'legacy.orders',
  check_duplicate_files => true
);
```

**Step four: verify again, then cut over consumers.**

**Step five: keep the old path available for a period.** With `add_files` this is free, since the source is untouched. With `migrate` it requires having taken a backup of the original metadata beforehand, which is the step to not skip.

## Reconciliation, done properly

The part that determines whether the migration is trustworthy, and the part most commonly done by sampling.

**Sampling is inadequate here because migration failures are systematic.** A random sample catches random corruption. Migration problems are not random: they affect one partition, one type, one file format variant, or one date range. A sample of ten thousand rows from a billion-row table easily misses an entire malformed partition, and the sample passing is worse than no check at all, because it produces confidence.

The reconciliation that actually holds has four parts.

**Row counts, total and per partition.** Not just the total. Per-partition counts catch a partition that failed to register, which a total can mask if another partition was double-counted.

```sql
-- Run against both, compare every row of the output
SELECT partition_col, count(*) AS rows
FROM legacy.orders
GROUP BY partition_col
ORDER BY partition_col;
```

**Per-column aggregates.** Sums for numerics, min and max for dates and strings, distinct counts for keys, null counts for everything. These catch type conversion problems that row counts cannot: a decimal read at the wrong scale produces the right number of rows and the wrong sum.

```sql
SELECT
  count(*)                        AS rows,
  sum(amount)                     AS amount_sum,
  min(order_date)                 AS min_date,
  max(order_date)                 AS max_date,
  count(DISTINCT order_id)        AS distinct_ids,
  count(*) - count(customer_id)   AS null_customers
FROM iceberg.orders_snapshot;
```

**A full key comparison where feasible.** For tables where a key exists, an anti-join in both directions proves set equality rather than aggregate equality. Expensive on very large tables and worth doing on the tables that matter.

**A read through every engine that consumes the table.** The reconciliation above proves the data is there. It does not prove that the engine your BI tool uses reads it correctly, and type handling differs across engines in exactly the places migrations go wrong: timestamp precision and timezone, decimal scale, nested types, and empty versus null for collections. One query per engine against a row exercising each of those four is enough, and it takes fifteen minutes.

The order that saves time: aggregates first, since they are cheap and catch most problems. Per-partition counts second. Key comparison on the important tables. Cross-engine reads last, on a table you already believe.

## Layout problems that make this hard

The in-place path works when the existing layout is something Iceberg can describe. Four situations where it is not, in rough order of how often they appear.

**Mixed file formats in one table.** A table whose partitions are partly Parquet and partly ORC, usually the residue of a format change years ago. Iceberg handles multiple formats in a table, and the migration works, and every reader now needs both. Converting the minority format first is usually cleaner than carrying it forward indefinitely.

**Schema inconsistency across files.** Files written at different times with different schemas, where the Hive table's schema is the union or the most recent and the older files lack columns. Iceberg's field-ID model handles evolution properly and it needs the mapping between file columns and table fields to be correct. Where the source has no reliable name-to-field mapping, this is where the migration gets genuinely difficult.

**Partition layouts that do not match the transforms.** A directory structure that encodes partitioning in a way Iceberg's transforms do not express, or partition values that were written inconsistently. Migration succeeds and the resulting partitioning is not what anyone expected, which shows up later as queries scanning everything.

**Small files, at scale.** A source table with several million small files migrates into an Iceberg table with several million small files and a very large manifest set. The migration works and the result is a table that is expensive to plan against. Compacting after migration is the fix, and it is worth budgeting because the first compaction on such a table is a substantial job. It is also the case where the arithmetic occasionally favors a rewrite over an in-place migration: if the table needs a full compaction pass immediately anyway, writing it out fresh at target size accomplishes both in one operation.

The diagnostic to run before any of this: inventory the source. File count, format distribution, size distribution, partition count, and whether any partition has anomalous properties. An hour of looking prevents most of the surprises above, and the inventory becomes the input to the reconciliation.

## Compatibility, or the absence of it

Two questions decide whether in-place migration is available at all.

**Are the files in a format Iceberg reads?** Parquet, ORC, and Avro. Files in a format Iceberg does not support have to be rewritten, which is a copying migration rather than an in-place one, and the decision becomes about how to do the rewrite efficiently rather than whether to.

**Are the files where Iceberg can address them?** Object storage or a filesystem the engine reaches. Usually trivially satisfied, and it matters for on-premise sources where a migration involves moving data anyway.

Where files are already Iceberg-readable, in-place migration turns a data movement project into a metadata project, and the difference in effort is roughly an order of magnitude. Where they are not, the honest framing is that you are running a rewrite, and the useful optimizations are the ordinary ones: parallelize by partition, write at target file size on the way in, and set the partitioning you actually want rather than reproducing the source's.
## What actually happens during a migration

Understanding the mechanics makes the failure modes predictable rather than mysterious.

**Files are read, not rewritten.** The procedure opens each source file's footer to read its schema and statistics. It does not read the data. That is why a migration of forty terabytes takes minutes rather than hours: the work is proportional to file count, not to data volume.

**Manifests are written.** For each file, an entry recording its path, partition values, record count, size, and column-level statistics pulled from the footer. Those entries go into manifest files, which go into a manifest list, which a metadata file points at. This is the entirety of what gets created.

**Partition values come from the source's layout.** For a Hive-partitioned source, the values encoded in the directory path become the partition values in the manifest entries, mapped onto an Iceberg partition spec built to match. Where the directory layout and the declared partitioning disagree, this is where it surfaces.

**Statistics come from the file footers.** Parquet and ORC footers carry min and max values, null counts, and record counts per column chunk. Iceberg lifts those into manifest entries, which is what makes pruning work immediately after migration without any additional computation.

Three consequences that explain most of what goes wrong.

**File count drives the cost and the runtime.** A million small files means a million footer reads and a large manifest set. This is the single best predictor of how long a migration takes and how usable the result is.

**Bad statistics propagate.** A file whose footer statistics are wrong, which happens with certain writer versions and certain type edge cases, produces manifest entries with wrong bounds. Pruning then skips files that contain matching rows, and a query returns fewer rows than it should, silently. This is the most alarming failure mode in the whole subject and it is rare enough that most teams never see it. The check for it is the reconciliation, specifically a query with a predicate compared against the same query without one.

**Schema mapping is the hard part.** Everything else is mechanical. Establishing that column three in these files is the same field as column three in those files, when the files were written across years by different tools, is the work that occasionally makes a migration a project.

## Reconciling with a script

At more than a handful of tables, reconciliation belongs in code. The shape that works:

```python
"""Compare a source table and its Iceberg counterpart. Fail loudly."""

AGGREGATES = """
SELECT
  count(*)                              AS row_count,
  count(DISTINCT {key})                 AS distinct_keys,
  sum(cast({numeric} AS decimal(38,6))) AS numeric_sum,
  min({date_col})                       AS min_date,
  max({date_col})                       AS max_date,
  count(*) - count({nullable})          AS null_count
FROM {table}
"""

PER_PARTITION = """
SELECT {partition_col} AS part, count(*) AS rows
FROM {table} GROUP BY {partition_col} ORDER BY 1
"""

def reconcile(spark, source, target, cfg) -> dict:
    findings = []

    src = spark.sql(AGGREGATES.format(table=source, **cfg)).collect()[0]
    tgt = spark.sql(AGGREGATES.format(table=target, **cfg)).collect()[0]
    for field in src.asDict():
        if src[field] != tgt[field]:
            findings.append(f"{field}: source={src[field]} target={tgt[field]}")

    src_parts = {r["part"]: r["rows"]
                 for r in spark.sql(PER_PARTITION.format(table=source, **cfg)).collect()}
    tgt_parts = {r["part"]: r["rows"]
                 for r in spark.sql(PER_PARTITION.format(table=target, **cfg)).collect()}
    for part in sorted(set(src_parts) | set(tgt_parts)):
        if src_parts.get(part) != tgt_parts.get(part):
            findings.append(
                f"partition {part}: source={src_parts.get(part)} target={tgt_parts.get(part)}"
            )

    # Pruning check: the same predicate with and without, to catch bad statistics
    filtered = spark.sql(
        f"SELECT count(*) FROM {target} WHERE {cfg['date_col']} = '{cfg['probe_date']}'"
    ).collect()[0][0]
    unfiltered = spark.sql(
        f"SELECT count(*) FROM {target}"
    ).collect()[0][0]
    expected = src_parts.get(cfg["probe_date"], 0)
    if filtered != expected:
        findings.append(
            f"pruning mismatch on {cfg['probe_date']}: "
            f"filtered={filtered} expected={expected} table_total={unfiltered}"
        )

    return {"table": source, "passed": not findings, "findings": findings}
```

The pruning check at the end is the one people leave out, and it is the only part of the reconciliation that catches the bad-statistics failure. A count with a partition predicate that returns fewer rows than the same partition's count without a predicate means files are being skipped that should not be.

Run the script for every table, store the output next to the ledger, and treat a non-empty findings list as a blocker rather than a note.

## A worked estate migration

The shape of a real project, since the procedure calls make it look deceptively small.

**The estate.** Roughly 1,200 Hive tables, 300 TB, mostly Parquet with a few hundred ORC tables from an older era, on object storage, consumed by three engines and about 400 scheduled jobs.

**Week one: inventory.** A script walks the metastore and object storage producing a row per table with file count, format mix, total size, partition count, and last write. The output sorts into three buckets: 900 straightforward tables, 250 with a complication (mixed formats, unusual partitioning, very high file counts), and 50 that need individual attention.

**Week two: tooling.** The migration script, the reconciliation script, and the ledger. Tested against a dozen tables from the straightforward bucket, in a non-production catalog.

**Weeks three through six: the straightforward bucket, in waves.** Waves aligned to consumer groups rather than to alphabetical order. Each wave is `snapshot`, reconcile, `add_files` into the target table, reconcile again, then cut consumers over one at a time with the source still available.

**Weeks seven through ten: the complicated bucket.** Mixed-format tables get their minority format converted first. High-file-count tables get compacted after migration, which is where a chunk of the project's compute budget goes. Odd partitioning gets migrated as-is and evolved afterward.

**Weeks eleven and twelve: the individual cases and decommissioning.** The fifty hard tables, plus verifying from query logs that nothing reads the sources before dropping them.

**What consumed the time.** Not the migrations, which were minutes each. Reconciliation runtime on the largest tables, the cross-engine verification, the coordination with the teams owning the 400 jobs, and the post-migration compaction. A useful rule of thumb from that shape: **the procedure is under one percent of the effort.**

**What went wrong.** Two things, both from the complicated bucket. A table whose directory layout implied a partitioning that did not match its declared partitioning, which migrated into a spec nobody wanted and had to be redone. And an ORC table with footer statistics that produced pruning mismatches, caught by the reconciliation check described above, which was the reason that check exists in the script.

## Rollback, per path

The question to answer before running anything, and the answer differs by procedure.

**After `snapshot`:** drop the Iceberg table without purge. The source was never touched. This is the safest of the three and the reason it belongs first in every sequence.

**After `add_files`:** drop the Iceberg table without purge, or remove the added files from it. The source table still exists and still describes the same files. The critical detail is the *without purge* part, since a purge drop deletes the underlying data files, which are the source table's files. That is an unrecoverable mistake made by muscle memory, and it is worth putting in the runbook in capital letters.

**After `migrate`:** the original table has been replaced. Rollback means having preserved what you need to reconstruct it. In practice that means taking a backup of the source table's metadata before running the migration, and knowing that the data files themselves were never modified, so a reconstruction is possible with effort. Plan it before rather than discovering the need after.

**After `register_table` into a new catalog:** drop from the new catalog without purge. The metadata file and the data are untouched, and the original catalog entry, if it still exists, is unaffected. This is the most reversible operation on the list, which is why catalog moves are much less frightening than format migrations.

A general rule that covers all four: **`DROP TABLE` and `DROP TABLE ... PURGE` are different operations and the difference is your data.** Every runbook in this area should state which one, and every person running one should know why.

## Moving between catalogs

A related operation frequently confused with migration: the table is already Iceberg, and you want a different catalog to own it.

```sql
-- Point a new catalog at an existing table's current metadata file
CALL new_catalog.system.register_table(
  table => 'sales.orders',
  metadata_file => 's3://lake/warehouse/sales/orders/metadata/00042-abc.metadata.json'
);
```

Four things to get right.

**Find the current metadata file, not a recent one.** The catalog you are leaving knows which metadata file is current. Registering an older one silently rolls the table back to that point, losing every commit since. Read the current pointer from the source catalog rather than picking the highest-numbered file in the directory, since those can diverge.

**Stop writers first.** A write landing in the old catalog after you read the pointer is a commit the new catalog does not know about. Quiesce, read, register, then repoint writers.

**Drop from the old catalog without purge, afterward.** Leaving both catalogs pointing at one table is a genuine hazard: two catalogs each believing they serialize commits to the same table produce divergent histories and lost writes. This is the one arrangement in this whole article that corrupts data rather than merely inconveniencing you.

**Verify grants in the new catalog before cutting over.** Access control does not travel with the table. A registered table with no grants is invisible to everyone, and a registered table in a namespace with permissive grants is visible to too many.

Some catalog backends have documented limitations around registration, so confirm the behavior on your specific pair before planning a bulk move.

## Migrating from Delta and other table formats

Hive is the common source and not the only one. Converting between open table formats has its own shape.

**The data files are usually fine.** Delta and Hudi both store Parquet, so the same in-place logic applies: the bytes stay, the metadata gets rebuilt. What differs is that the source has its own transaction log rather than a metastore, which means the conversion reads that log rather than a directory listing.

**History does not travel.** A Delta table with two hundred versions converts into an Iceberg table with one snapshot describing the current state. Time travel into the pre-migration history is gone unless you keep the source table around, which is a real reason to leave it in place rather than deleting it after cutover. Where the history has compliance value, keeping the source readable is the practical answer.

**Deletes and updates complicate it.** A source table whose current state depends on delete vectors or on merge-on-read structures needs those resolved during conversion rather than carried across, because the representations differ. The conversion path handles this and it is the part to validate hardest, since a mishandled delete produces rows that should not exist rather than rows that are missing, and reconciliation on counts alone catches only one direction.

**Bidirectional metadata layers are a different thing.** Some platforms generate metadata for a second format alongside the primary one, so one set of files is readable as either. That is interoperability rather than migration, and it is useful for a transition period. The thing to check is which format is authoritative for writes, because two writers to two metadata layers over one file set is the corrupting arrangement described earlier in a different costume.

**Validate with the same rigor.** Per-partition counts, per-column aggregates, and a cross-engine read. The fact that both formats are open and both store Parquet makes the conversion easier and does not make verification optional.

## Recovering a table whose catalog entry is gone

A situation adjacent to migration and worth covering, because `register_table` is the tool and the procedure is nearly identical.

The scenario: the data and metadata files are intact in object storage, and the catalog no longer knows about the table. Causes vary. A catalog database restored to an earlier point. A table dropped by mistake without purge. A catalog migration that missed some tables. A namespace deleted by a script with a broader match than intended.

**Find the current metadata file.** With the catalog gone, the pointer is gone with it, and the metadata directory has to answer the question. The files are named with a sequence and a UUID, and the highest sequence number is the best candidate rather than a guarantee, since a failed commit can leave a newer file that was never made current.

**Verify before registering.** Read the candidate metadata file, check its snapshot's timestamp against when you believe the table was last written, and confirm the schema matches expectations. Registering the wrong file rolls the table to that point silently.

**Register it.** The same call as a catalog move, pointing at the verified file.

**Reconcile.** Row counts and aggregates against whatever independent record exists: a downstream copy, a report, or the upstream source. A recovered table deserves the same verification as a migrated one.

**Then write down where the pointer was.** The reason recovery is painful is that nobody recorded which metadata file was current. A small periodic job that records the current metadata location per table into a separate table turns a future recovery from archaeology into a lookup. That job is a dozen lines and it is the cheapest insurance in this entire article.

The general lesson: object storage holds everything except the one pointer, and the pointer is the thing worth backing up independently. Whether that backup takes the form of catalog database snapshots, a pointer ledger, or both, having one converts a category of disaster into an inconvenience.

## Doing it at scale

One table is a procedure call. Three thousand tables is a project, and the shape that works is different.

**Inventory first, migrate second.** A complete list of source tables with file counts, formats, size, partition counts, and last-modified dates. That inventory drives sequencing and it surfaces the tables that will not migrate cleanly before you are halfway through.

**Sort by difficulty and do the easy ones first.** Single-format, well-partitioned, moderate file count tables migrate cleanly and build confidence and tooling. The pathological ones benefit from the tooling the easy ones produced.

**Migrate in waves aligned to consumers.** A wave should be a set of tables that a group of downstream jobs consumes, so that cutting over is one coordinated change rather than a table-by-table negotiation.

**Script the whole thing, including reconciliation.** Migration at scale is a program that takes a table name and produces either a migrated table with a reconciliation report or a failure with a reason. Manual migrations do not scale past about twenty tables before somebody makes a mistake at 6pm.

**Keep a ledger.** Which tables migrated when, what the reconciliation said, where the source metadata backup is, the first snapshot's identity, and who signed off. This is the artifact that answers questions six months later and it costs nothing to maintain during the project.

**Budget for the compaction after.** A migrated table inherits its source's file layout, which is usually not the layout you want. The post-migration compaction pass across thousands of tables is a real workload and it should be planned rather than discovered. On an estate the size of the example below, that pass is comparable in compute to several months of ordinary maintenance, compressed into a few weeks.

**Do not change partitioning during migration.** Tempting, since the source's partitioning is often wrong. Changing it requires rewriting data, which makes the migration a copy rather than an in-place operation, and it conflates two changes so a problem afterward has two candidate causes. Migrate as-is, then evolve the partition spec, which Iceberg supports without rewriting history.

## Coordinating with the people who own the pipelines

The technical work is a fraction of the effort, and the coordination is where migrations actually stall.

**Consumers outnumber tables.** A few hundred tables can have a few thousand dependent jobs, dashboards, notebooks, and ad hoc scripts. Every one is owned by somebody with their own priorities, and none of them asked for this.

**Query logs are the only reliable dependency map.** Documentation of who consumes what is always incomplete and usually optimistic. Ninety days of query history against a table tells you who actually reads it, and it finds the monthly report and the analyst's saved query that nobody listed.

**Make the change small for consumers.** Where the migration can preserve the table's fully qualified name, most consumers change nothing. Where it cannot, a view in the old location pointing at the new table buys time and lets consumers move on their own schedule rather than yours.

**Give them a reason and a date.** "The table is Iceberg now" is not a reason. Faster queries, time travel, schema evolution without a rewrite, and the ability to use the engine they have been asking for are reasons. A date with a view as the fallback is a plan they can work with.

**Expect one team to be blocked.** There is always a consumer with a hard dependency on something specific: a tool version that predates Iceberg support, a process with a compliance sign-off tied to the old table, an integration nobody owns anymore. Finding that team early gives you a quarter to solve it. Finding them during cutover week gives you a rollback.

**Publish the ledger.** Which tables moved, when, and what the reconciliation showed. Visible reconciliation results do more for consumer confidence than any amount of assurance, because the question everyone actually has is whether the numbers still match.

## Dual-running

The safest cutover pattern, and cheap when the migration is in place.

**Both tables live, same files.** After `add_files`, the source and the Iceberg table describe the same data. Reads work through either. That is a dual-run for free, and it lasts as long as you want it to.

**Route reads gradually.** Move one consumer at a time to the Iceberg table, comparing results as you go. Keep the ability to move back.

**Writes are where dual-running gets hard.** Two writers to two table definitions over the same files is not a safe arrangement. Writes should cut over as a single event, after reads have been validated. That event is the actual migration moment, and everything before it is preparation.

**Decommission deliberately.** The source table gets dropped when nothing reads it, verified by looking at query logs rather than by asking. The lingering source table that somebody's monthly report still uses is a normal discovery six weeks in, and query logs prevent it. Give it a grace period after the last observed read as well, since a quarterly process produces no reads for months and then one that matters.

## After the migration

The table is Iceberg and the work is not finished. Five things belong in the fortnight following a cutover, and skipping them produces a table that is technically migrated and practically worse than what it replaced.

**Compact.** A migrated table inherits the source's file layout, which on a Hive table is usually many files sized by whatever wrote them. Compacting to a sensible target size is the largest single improvement available, and on a freshly migrated table it is a full pass rather than an incremental one, so budget it.

**Rewrite manifests.** Migration produces manifests grouped by whatever order files were processed in, rather than clustered by partition. Rewriting them clusters partition data together, which is what makes planning fast on a table with many partitions. Cheap, and frequently forgotten.

**Evolve the partition spec, if the source's was wrong.** This is the moment to fix partitioning that never suited the query patterns, and Iceberg's partition evolution means doing so without rewriting history. New data lands under the new spec, old data keeps its own, and both remain queryable.

**Set table properties deliberately.** A migrated table has defaults. Target file size, write distribution mode, metrics mode, commit retry settings, and format defaults all deserve a decision now rather than inheriting whatever the procedure set.

**Schedule maintenance.** Expiry, orphan cleanup, and compaction on a cadence. A migrated table with no maintenance schedule accumulates the same problems the source had, plus snapshots.

One more that is easy to overlook: **write the first snapshot's identity down.** The snapshot created by the migration is the boundary between the pre-Iceberg history and everything after. Recording its ID and timestamp in the ledger makes a later question about when a table became Iceberg answerable in a second rather than by archaeology.

## Deciding whether to migrate at all

Not every table earns a migration, and the estate-level version of this question saves more effort than any technique in this article.

**Tables nobody reads.** The inventory will surface them: written regularly, read rarely or never. Migrating a table nobody queries is pure cost. The right action is to stop writing it, and a migration project is an unusually good moment to have that conversation, because someone is already looking at the whole estate.

**Tables that are about to be replaced.** A dataset scheduled for redesign next quarter migrates twice if you migrate it now. Sequence it after.

**Tables whose access pattern does not benefit.** A small reference table read occasionally works fine as it is. Iceberg's advantages concentrate on large tables with evolving schemas, many partitions, concurrent writers, and time-travel needs. A hundred-row lookup table gets none of them.

**Tables whose layout makes migration expensive.** The complicated bucket. For some of these, a rewrite that produces a well-laid-out table is cheaper in total than an in-place migration followed by extensive remediation, and it is worth pricing both rather than defaulting to in-place because it sounds cheaper.

The output of that filtering, on most estates, is that a meaningful fraction of tables should be retired rather than migrated, and another fraction should wait. Both outcomes are better than migrating everything, and neither is discoverable without the inventory.

## Timing the cutover

Scheduling decisions that reduce risk at no cost.

**Migrate during a quiet write window.** The procedures operate on metadata and a source table being actively written while it is converted is an unnecessary complication. For a table loaded nightly, the hours after the load complete are the obvious window.

**Cut consumers over on a weekday morning.** The instinct is to change things at 2am on a Saturday, and for a migration that instinct is wrong. Nothing here benefits from nobody watching. A change made when the whole team is available and users are around to report problems is a change whose problems get found in an hour rather than on Monday.

**Avoid the period around a reporting close.** Month-end, quarter-end, and any regulatory reporting window are the times when a discrepancy costs the most attention and the least patience. Migrate in the middle of a cycle.

**Leave a buffer before the next dependency.** Cutting over the day before a downstream team's major release means their release absorbs your problems. A week of separation makes attribution easy.

**Do not batch too many tables into one window.** A wave that goes wrong is easier to diagnose at ten tables than at two hundred. Waves sized so that a full rollback fits comfortably in an afternoon keep every step reversible in practice rather than only in principle.

## Common mistakes

**Purging on the drop.** Stated three times in this article because it is unrecoverable and because the command is one word longer than the safe version.

**Migrating without a metadata backup.** Cheap insurance, skipped because `migrate` succeeds so reliably that it feels unnecessary until the one time it does not.

**Trusting a row count.** The most common inadequate validation, and it passes on exactly the failures that matter.

**Registering a stale metadata file.** Silently rolls the table back. Read the current pointer from the source catalog.

**Leaving two catalogs pointing at one table.** The only entry on this list that corrupts data.

**Changing partitioning, format, and catalog in one step.** Three changes, one window, and any problem afterward has three candidate causes. Sequence them.

**Skipping the cross-engine read.** The data is correct and the engine your BI tool uses reads a timestamp an hour off. Found by users if not by you.

**Forgetting grants.** The table migrated perfectly and nobody can see it, or everybody can.

## A checklist

- Inventory the source: file count, formats, sizes, partition count, anomalies.
- Confirm the files are in a format Iceberg reads, or accept that this is a rewrite.
- `snapshot` first, always, and validate against it before anything irreversible.
- Reconcile with per-partition counts and per-column aggregates, not a sample.
- Read the result through every engine that consumes the table.
- Back up the source metadata before `migrate`.
- Know the rollback for the specific procedure you are running.
- Never purge on a drop during a migration.
- Migrate as-is, then evolve partitioning afterward.
- Stop writers before a catalog move, and drop from the old catalog after.
- Verify grants in the destination before cutting over.
- Script it, including reconciliation, if there is more than a handful of tables.
- Keep a ledger.
- Budget the post-migration compaction.

## Conclusion

The instinct that a migration means moving data comes from the warehouse era, where it did. In a lakehouse, if the files are already Parquet or ORC in object storage, they stay exactly where they are and the migration is a metadata operation that takes minutes.

Three procedures do three jobs. `snapshot` gives you a testable Iceberg table over the same files with the source untouched, which is where every migration should start. `add_files` builds a table from existing files additively, leaving the source in place, which makes dual-running free. `migrate` replaces the source, which is the one that needs a metadata backup taken beforehand. And `register_table` is the separate operation for moving an already-Iceberg table between catalogs, where the hazards are registering a stale pointer and leaving two catalogs owning one table.

What determines whether the migration is trustworthy is not the procedure, which is a single call. It is the reconciliation. Per-partition counts and per-column aggregates rather than a sample, because migration failures are systematic and a sample misses them. A read through every engine that consumes the table, because type handling differs exactly where migrations go wrong. And a rollback you knew before you started rather than one you constructed afterward.

Run `snapshot` on your largest table this week. It costs nothing, it touches nothing, and the reconciliation you run against it will tell you more about your data than the migration plan does.

## Keep Going

If this piece was useful, I have written a lot more on Iceberg adoption and operations. *Apache Iceberg: The Definitive Guide* covers the metadata model these procedures manipulate and the schema and partition evolution that follows a migration, and *Architecting an Apache Iceberg Lakehouse* covers planning an adoption across an estate rather than a table. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
