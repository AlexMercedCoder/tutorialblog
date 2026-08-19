---
title: "Building Lightweight Serverless Ingestion to Apache Iceberg with PyIceberg and DuckDB"
date: "2026-08-19"
description: "Build lightweight serverless ingestion to Apache Iceberg with PyIceberg and DuckDB, running small feeds in functions that bill for seconds."
author: "Alex Merced"
category: "Apache Iceberg"
canonical: https://iceberglakehouse.com/posts/serverless-iceberg-ingestion-pyiceberg-duckdb/
tags:
  - PyIceberg
  - DuckDB
  - serverless
  - ingestion
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/serverless-iceberg-ingestion-pyiceberg-duckdb/).

The most common ingestion job in most companies is small. A vendor drops a CSV in a bucket every hour. A webhook delivers a few thousand JSON events a minute. A SaaS export lands nightly at a few hundred megabytes. For years, the standard answer to "get this into the lakehouse" was the same regardless of size: stand up a Spark job, or buy a managed pipeline tool, and accept that the smallest task in the platform runs on the heaviest machinery.

That answer is obsolete, and the tools that obsoleted it matured fast enough that many teams have not noticed. PyIceberg, the pure-Python implementation of Apache Iceberg, writes tables directly from any Python runtime, no JVM, no cluster. DuckDB, the in-process analytical engine, now reads and writes Iceberg tables through a REST catalog, with MERGE INTO and v3 table support landing in its recent extension releases. Between them, a complete ingestion pipeline fits inside a serverless function that runs for seconds and bills for seconds.

This article builds that pipeline properly: the architecture, the working code, the design decisions that separate a demo from a production system, and the honest boundaries where small tools stop being the right tools. A disclosure up front: I work at Dremio, a query engine vendor in the Iceberg ecosystem, and I have written books on this format. Nothing here requires any vendor's product. That independence is the whole point of the pattern.

## The Case for Small Ingestion

Start with why this pattern deserves deliberate architecture rather than being treated as a toy. Three forces push real workloads toward lightweight ingestion, and each is worth naming precisely.

The first is the shape of the work. Ingestion at the edges of a platform is mechanical: fetch, parse, validate, maybe reshape, append, commit. There is no distributed join, no shuffle, no working set that exceeds one machine's memory. Distributed engines exist for problems that need distribution, and a 200 MB hourly file is not one of them. Running it through a cluster means paying cluster startup, cluster minimums, and cluster operations for a task a laptop finishes in seconds.

The second is economics, and the arithmetic is stark at the low end. A serverless function processing an hourly drop runs perhaps 30 seconds per invocation, 720 invocations a month, billed by the second at function rates. The equivalent always-on pipeline infrastructure, or per-job cluster spin-up, costs one to two orders of magnitude more for the same bytes moved, before counting the human cost of operating it. For a platform with dozens of small feeds, the difference funds an engineer.

The third is organizational. When ingestion requires the platform team's machinery, every new feed is a ticket in someone else's queue. When ingestion is a Python function writing through a governed catalog, the team that owns the data source owns its feed, and the platform team governs through the catalog instead of gatekeeping through infrastructure. The catalog-centric security model, short-lived credentials vended per table rather than storage keys handed to jobs, is what makes that delegation safe, and it is a newer capability than most teams' habits.

None of this argues that clusters are obsolete. It argues for matching machinery to work, and the honest observation is that the industry ran small work on big machinery for a decade because no alternative existed. Now one does, and the rest of this article is how to build it well.

## The Toolkit, Precisely

Three components make the pattern work, and knowing exactly what each does, and does not do, prevents most design mistakes.

PyIceberg is the Apache Iceberg project's native Python implementation, a library that speaks the table format and catalog protocols directly. It loads tables from REST, AWS Glue, Hive Metastore, and SQL catalogs, plans scans, and, critically for this article, writes: appends from Arrow tables, overwrites, upserts, schema changes, and table creation, all from a process that starts in milliseconds. Recent releases ride on a Rust core for the performance-critical paths, and the project's cadence through its 2026 releases has steadily closed the gap with the Java implementation for exactly the operations ingestion needs. What PyIceberg is not: a query engine. It reads and writes data, and it pushes down simple filters, and it does not execute SQL.

The write surface deserves one more sentence of precision, because it defines what the pattern can do without SQL: beyond plain appends, PyIceberg performs overwrites scoped by filter, upserts keyed on identifier columns, deletes by predicate, and transactional combinations of these, along with table creation, partition spec definition, and schema evolution through a fluent update API. For ingestion purposes that list is complete, and the operations commit with the same snapshot semantics as any engine's writes, because they are the same specification implemented natively.

DuckDB is the query engine half. It runs in-process, starts instantly, and executes vectorized analytical SQL at speeds that embarrass much larger systems on single-node work. Its Iceberg extension grew from read-only beginnings into a full read-write client: attach an Iceberg REST catalog and DuckDB creates schemas and tables, inserts, updates, deletes, and, as of extension version 1.5.3, runs MERGE INTO, evolves schemas with ALTER TABLE, writes partitioned tables with partition transforms, and writes v3 tables where deletes become compact deletion vectors instead of Parquet positional delete files. The one boundary to respect: writes go through an attached REST catalog only, while the path-based iceberg_scan function stays read-only. That is the correct design, because the catalog is where commits become atomic and where governance lives.

The REST catalog is the piece that turns two libraries into a system. It is the standardized HTTP API for Iceberg catalogs, implemented by Apache Polaris, by managed platform catalogs, and by a growing field of others, and it does three jobs in this pattern: it arbitrates commits so concurrent writers do not corrupt each other, it vends short-lived storage credentials so functions never hold long-lived keys, and it gives every engine, from the Lambda writing the table to the warehouse-scale engine querying it, the same view of the same tables. Choosing REST catalog compatibility as a hard requirement is the single most future-proof decision in this architecture.

The division of labor follows naturally. PyIceberg owns table lifecycle and commits from Python. DuckDB owns SQL transformation, validation, and set-based operations like MERGE. The catalog owns atomicity and access. Some pipelines use PyIceberg alone, some use DuckDB alone, and the interesting ones compose both, with Arrow as the zero-copy handoff between them.

Two neighbors of this toolkit deserve a sentence each, so their absence reads as scoping rather than ignorance. Polars and Daft both read Iceberg and both interoperate with PyIceberg through Arrow, and either substitutes for DuckDB where a DataFrame API fits the team better than SQL. And the engines at the heavy end, Spark, Flink, Dremio, Trino, remain the right writers for large continuous streams and the right query layer for consumers. The pattern here occupies the space below them, and the shared catalog means nothing about choosing it now constrains choosing them later.

Choosing among the compositions is mostly reading the task:

| Pipeline shape | Right tool | Reason |
|---|---|---|
| Clean append, light reshaping | PyIceberg alone | Fewest moving parts, fastest start |
| Dedup, joins, aggregation before write | PyIceberg reads input, DuckDB transforms and writes | SQL where SQL wins |
| Upserts on business keys | DuckDB MERGE INTO | One atomic set-based statement |
| Table setup and evolution scripts | DuckDB SQL or PyIceberg API | Version-controlled DDL either way |
| Sustained high-volume streams | Graduate to a streaming engine | Beyond the pattern's boundaries |

## The Architecture: Event-Driven Ingestion

The reference architecture is short enough to hold in your head, which is one of its virtues.

An event source triggers a function. The classic trigger is object storage notification, a file landing in a raw bucket fires the function with the object's key, and the same shape serves queue-driven ingestion from SQS or Pub/Sub, scheduled pulls from APIs on a cron trigger, and webhook receivers behind an API gateway. The function authenticates to the REST catalog with its identity, not with storage keys. It reads the raw input, validates and transforms it into the target schema, appends or merges into the Iceberg table, and exits. The commit lands atomically through the catalog, and every downstream consumer, warehouse-scale engines included, sees the new snapshot on their next query.

The properties worth noticing are the ones missing. There is no pipeline server, nothing running between invocations, no cluster to size, and no orchestration for the simple case, because the event is the orchestration. State lives in exactly two places: the raw bucket, which is the replay log, and the Iceberg table, whose snapshots are the record of what committed. That statelessness is what makes the pattern reliable, and preserving it is a design discipline the later sections defend.

One layout convention pays for itself immediately: structure the raw bucket as a permanent landing zone, not a scratch space. Prefix objects by feed and arrival date, never delete on success, and apply lifecycle rules that transition old objects to cold storage rather than removing them. The raw zone is the system's replay log and its audit trail: reprocessing after a bug means re-firing events over existing objects, backfilling a new column means replaying a date range, and answering "what exactly did the vendor send us on March 3rd" means reading the object, not archaeology. Storage at cold tiers costs almost nothing, and the first bad-transform incident repays a decade of it.

Two boundaries define where the pattern applies cleanly. Payload size per invocation should fit comfortably in function memory as Arrow data, which in practice means inputs up to the low gigabytes per event on the largest function sizes, and far less on default configurations. Commit frequency across all writers to one table should stay in the tens per minute at most, for reasons the concurrency section makes concrete. Inside those boundaries, the pattern is not a compromise. It is the correct architecture, and it covers a remarkable share of real feeds.

## The Code: A Working Ingestion Function

Here is a complete ingestion handler in the PyIceberg-only style, the shape I reach for first when the transformation is light. The example is AWS Lambda for concreteness, and nothing about it is AWS-specific.

```python
import json
import pyarrow as pa
import pyarrow.csv as pv
import pyarrow.fs as pafs
from pyiceberg.catalog import load_catalog

CATALOG_URI = "https://catalog.example.com/api/catalog"
TABLE_NAME = "sales.vendor_orders"

def handler(event, context):
    record = event["Records"][0]
    bucket = record["s3"]["bucket"]["name"]
    key = record["s3"]["object"]["key"]

    catalog = load_catalog(
        "lakehouse",
        **{
            "type": "rest",
            "uri": CATALOG_URI,
            "warehouse": "prod",
            "credential": "CLIENT_ID:CLIENT_SECRET",
        },
    )
    table = catalog.load_table(TABLE_NAME)

    s3 = pafs.S3FileSystem()
    with s3.open_input_stream(f"{bucket}/{key}") as stream:
        arrow_table = pv.read_csv(stream)

    arrow_table = arrow_table.cast(table.schema().as_arrow())

    table.append(arrow_table)

    return {
        "status": "committed",
        "rows": arrow_table.num_rows,
        "source": key,
    }
```

Walk the load-bearing lines. The catalog configuration authenticates the function's identity to the REST catalog, and the credential shown as a placeholder belongs in your secret manager, injected at runtime, never in code. From that point, storage access flows through credentials the catalog vends for this table, scoped and short-lived, which is why the function's IAM role needs no direct grant on the warehouse bucket at all. The CSV is read straight into Arrow, cast against the table's schema, which is the cheapest validation gate you will ever install, because a column drift or type change fails loudly here instead of landing silently as bad data. The append writes Parquet into the table's location and commits a new snapshot through the catalog in one atomic step. If anything above the append raises, nothing committed, and the object storage event redelivers for retry.

Cold starts deserve one honest paragraph, because they are the serverless tax everyone asks about. The imports above, PyArrow especially, cost a second or two on a cold invocation, and catalog authentication adds a round trip. For hourly and minutely feeds this is noise. For latency-sensitive webhook ingestion, standard mitigations apply, provisioned concurrency or a slim container image, and if single-digit-millisecond ingestion latency is a genuine requirement, this is the wrong pattern entirely, and a streaming engine is the right one. Choosing tools honestly includes naming what they are not for.

## Adding DuckDB: SQL in the Middle

The PyIceberg-only function covers clean appends. Real feeds are rarely clean, and the moment the work becomes relational, deduplicate against what already landed, join a reference table, aggregate before writing, upsert on a business key, you want SQL, and DuckDB supplies it in-process.

The composition pattern that keeps the best of both: DuckDB attaches the REST catalog and does the relational work, including the write, while Arrow moves data between Python and SQL with zero copies. Here is the upsert version of the handler's core, replacing the plain append:

```python
import duckdb

con = duckdb.connect()
con.execute("INSTALL iceberg; LOAD iceberg;")
con.execute("""
    CREATE SECRET catalog_auth (
        TYPE iceberg,
        CLIENT_ID 'CLIENT_ID',
        CLIENT_SECRET 'CLIENT_SECRET',
        OAUTH2_SERVER_URI 'https://catalog.example.com/api/catalog/v1/oauth/tokens'
    )
""")
con.execute("""
    ATTACH 'prod' AS lakehouse (
        TYPE iceberg,
        ENDPOINT 'https://catalog.example.com/api/catalog'
    )
""")

con.register("incoming", arrow_table)

con.execute("""
    MERGE INTO lakehouse.sales.vendor_orders t
    USING (
        SELECT * EXCLUDE (rn) FROM (
            SELECT *, row_number() OVER (
                PARTITION BY order_id ORDER BY updated_at DESC
            ) AS rn
            FROM incoming
        ) WHERE rn = 1
    ) s
    ON t.order_id = s.order_id
    WHEN MATCHED THEN UPDATE SET
        status = s.status,
        updated_at = s.updated_at
    WHEN NOT MATCHED THEN INSERT *
""")
```

The register call is the seam: the Arrow table from the ingestion step becomes a SQL-queryable relation with no serialization, because DuckDB reads Arrow memory directly. The inner query deduplicates the batch itself, keeping the latest version per key, which matters because vendor files and webhook batches routinely contain their own duplicates. The MERGE then reconciles against the live table, and on a v3-format table the extension writes the delete side of matched updates as deletion vectors, the compact Puffin-encoded form, rather than as a scatter of positional delete Parquet files. The whole statement commits as one Iceberg snapshot through the catalog.

Two version-sensitive notes keep this section honest over time. The extension's write capabilities grew in visible stages, initial writes in its 1.4 line with update and delete support arriving for v2 tables under merge-on-read semantics, then the 1.5.3 wave adding MERGE, partitioned write support with transforms, ALTER TABLE, and v3 tables where the extension writes deletion vectors and supports the Variant type for semi-structured payloads. The extension updates between DuckDB releases, so running its update command in your build process, and pinning what you deploy, are both worth the minute they take. And the extension respects the table's declared write modes: tables configured for copy-on-write updates refuse merge-on-read writers rather than silently disobeying the table's contract, which is exactly the behavior you want from a polite guest in a multi-engine lakehouse, and one more reason to set those table properties deliberately at creation.

The same attached catalog turns DuckDB into the table lifecycle tool for the pipeline's setup scripts: CREATE SCHEMA and CREATE TABLE with partition transforms, ALTER TABLE as feeds evolve, all in SQL that lives in version control next to the function code. Between PyIceberg's programmatic API and DuckDB's SQL surface, choose per task and feel no guilt: they commit through the same catalog into the same tables, and mixing them is normal, not messy.

## What Actually Happens on a Small Commit

Trusting a pattern in production is easier when you can narrate its critical path, so walk what the append in that handler physically does, because the details explain both the reliability and the maintenance metabolism.

The append call takes the Arrow table and writes it as one or more Parquet files into the table's data location, sized by what arrived, using storage credentials the catalog vended when the table loaded. Nothing about those files is visible to any reader yet, which is the property that makes crashes benign: data files without metadata are inert bytes. PyIceberg then constructs the metadata for the new snapshot, a manifest listing the new files with their column statistics, and the commit machinery above it, and asks the catalog to advance the table from the snapshot it loaded to the new one.

The catalog performs the only step that needs coordination: an atomic compare-and-swap on the table pointer. If no other writer committed since this function loaded the table, the swap succeeds and the snapshot is live, all files at once, for every engine on their next planning call. If another writer got there first, the swap fails cleanly, the library refreshes to the current snapshot, reapplies the append against it, and retries, which for pure appends is conflict-free reconciliation, since two batches of new files never contend for the same rows. Upserts reconcile with more care, and the same retry loop governs them.

Three practical consequences fall out of this narration. Readers never see partial data, which is why downstream jobs can trigger on table updates without coordination protocols. Failed invocations litter only unreferenced files, which is why orphan cleanup exists and why storage alarms should not panic on them. And every commit costs a catalog round trip plus a pointer race, which is the physical reason the concurrency section preached batching: the pattern's ceiling is not bandwidth, it is commit arbitration, and designing around single-digit commits per table per minute keeps the race trivially winnable.

## The Design Decisions That Separate Production From Demo

The handler above works. Whether the system works after six months depends on decisions the happy path never exercises. These five are the ones that matter, in the order teams usually learn them.

**Idempotency, because every trigger delivers twice eventually.** Object notifications, queues, and webhooks all deliver at-least-once, and a function that blindly appends turns every redelivery into duplicate rows. The defenses, in increasing strength: make the write an upsert on a business key, as the MERGE version does, so replays converge instead of duplicating. Track processed source objects in a small manifest table and skip keys already ingested, checked and updated in the same pipeline. Or write each source object to a deterministic target, overwriting a partition derived from the input key, so replays overwrite themselves. Pick one deliberately and write it in the runbook, because "we retry safely" is the property everything else leans on.

**Commit concurrency, because functions scale out and catalogs arbitrate.** Iceberg commits are optimistic: concurrent writers race to swap the table pointer, losers re-apply against the new snapshot and retry. PyIceberg and the DuckDB extension handle retries for you, and the arithmetic still binds: dozens of functions committing to one table simultaneously spend their time retrying, and throughput collapses precisely when the feed gets busy. The design answers are batching and serialization. Batch upstream, an SQS queue in front of the function with batch size tuned so each invocation commits once for many events. Serialize per table, function concurrency limits or FIFO queues keyed by table, so one table sees one committer at a time while different tables ingest in parallel. A useful rule: design for commits per table per minute in the single digits, and treat anything beyond as a signal to batch harder or graduate the feed to a streaming writer.

**File sizes, because small writers write small files.** A function committing every few minutes writes files sized by what arrived, often single-digit megabytes, and a table accumulating thousands of tiny Parquet files punishes every reader. Mitigate at write time by batching, which helps everything else too, and accept that mitigation has limits: the real answer is scheduled compaction, covered below, treated as part of the table's contract rather than an apology.

**Schema drift, because upstreams change without warning.** The cast against the table schema catches drift and turns it into a clear failure, which is the right default: better a dead-letter queue full of the vendor's surprise column than a table quietly missing it. For sources you control, evolve deliberately, PyIceberg's schema update API or DuckDB's ALTER TABLE, committed as part of a release. For sources you do not control, route cast failures to a dead-letter location with the original payload intact, alert, and decide as humans. Automatic schema evolution on external feeds is how tables end up with seventeen variants of the same column.

**Secrets and identity, because functions multiply.** The catalog-credential model earns its keep here: functions hold only their client credentials from the secret manager, storage access arrives vended and scoped per table, and rotating one client secret in one place rotates the fleet. Resist the shortcut of granting functions direct bucket access, because it works immediately and then becomes a permanent, unauditable bypass of the governance the catalog exists to provide.

## Maintenance Is Part of the Table's Contract

A table written by small, frequent committers has a predictable metabolism: many small data files, many snapshots, and, for upsert feeds on v3 tables, accumulating deletion vectors. None of this is pathology. All of it is scheduled work, and the serverless pattern is only complete when maintenance is designed in rather than borrowed from whoever notices slow queries first.

Three jobs, on calendars, per table. Compaction rewrites small files into read-optimized ones, targeting the streaming-written partitions, daily on active tables. Snapshot expiration trims history to the agreed time-travel window, weekly. Orphan cleanup removes files abandoned by failed writes, less often and reliably. The jobs themselves run anywhere: a scheduled function invoking an engine's maintenance procedures, a small container on a scheduler, or a managed catalog's automatic table services, which increasingly handle exactly this and suit this pattern beautifully, since the whole point is minimizing infrastructure you operate.

Size targets give the compaction job its goal, and the streaming-written partitions their contract: rewrite toward the table's target file size, typically in the low hundreds of megabytes, and confine each run to recent partitions where the small files concentrate, since cold partitions compact once and stay compacted. On upsert feeds, fold delete cleanup into the same pass, so files carrying accumulated deletion vectors get rewritten clean in one motion rather than in two jobs that each rewrite the same bytes. One targeted pass, one owner, one calendar entry per table is the entire ambition, and it is enough.

The organizational half matters as much as the technical half. The maintenance schedule belongs in the dataset's documentation next to its schema and owner, and one team owns it per table. The anti-pattern to avoid by name: every consumer of a slow table independently running compaction against it, conflicting with each other and with the writers. One metabolism, one caretaker.

## The Cost Model, Honestly

The economics of this pattern are its loudest selling point, so they deserve honest arithmetic rather than a slogan, and the honest version includes where costs hide.

The visible costs are function seconds and object storage requests. A minutely feed running two-second invocations totals well under an hour of compute per day, which at serverless rates is coffee money monthly. Compare any always-on alternative, and the pattern wins by an order of magnitude or more for feeds below a few gigabytes per hour. This comparison is real and durable, and it is the one on the slide.

The hidden costs are requests and maintenance. Small commits mean proportionally more PUT requests per byte, and the catalog round trips add API traffic. The maintenance jobs consume compute that the ingestion saved. Sum honestly and the pattern still wins comfortably at small scale, and the margin narrows as volume grows, which is the correct intuition for when to graduate: when a feed's function time, request charges, and compaction load approach what a right-sized continuous writer costs, the feed outgrew the pattern. Put a monthly cost line per feed on a dashboard and the graduation moment announces itself, no philosophy required.

## The Development Loop Nobody Advertises

An underrated property of this stack: the entire production pipeline runs on a laptop, unchanged, because nothing in it requires infrastructure that only exists in the cloud. This is worth designing into your workflow deliberately, because it collapses the develop-and-test cycle from minutes to seconds.

The local setup mirrors production in miniature. A REST catalog runs as a local container, several open implementations ship images that start in seconds, backed by local object storage or a temp directory. The function's handler code imports and runs as a plain Python function in a test, with the event payload constructed as a fixture. PyIceberg and DuckDB behave identically locally and deployed, because they are libraries, not services, and the catalog protocol is the same protocol.

That enables a testing pyramid that most pipeline stacks cannot offer honestly. Unit tests exercise transformation logic against Arrow tables in memory, no I/O at all. Integration tests run the full handler against the containerized catalog, asserting on committed snapshots: row counts, schema, and, for the idempotency test that the design section demanded, invoking the handler twice with the same event and asserting the table converged instead of duplicating. That double-invocation test is the single highest-value test in the suite, and it runs in seconds in CI on every commit. Deployment stops being the first time the pipeline meets a real catalog.

Keep one honest gap on the checklist: local containers do not reproduce cloud identity, so credential vending and IAM interplay still need a staging environment pass. Everything else, logic, commits, merges, schema drift handling, dead-letter routing, tests locally, which is precisely what makes small feeds cheap to build as well as cheap to run.

## Observability for Pipelines That Are Not Running

Serverless ingestion inverts the monitoring problem: there is no pipeline server to health-check, and silence is ambiguous between "nothing arrived" and "everything is broken." Observability here means instrumenting outcomes rather than processes, and four signals cover it.

Freshness is the primary signal: the lag between now and the newest data in the table, measured from the table itself, snapshot timestamps or a max event-time query, and alerted per feed against that feed's expected cadence. Freshness catches every failure mode upstream of it, dead triggers, failing functions, poisoned queues, without knowing which one fired, and it is the alert that pages.

Volume validates plausibility: rows committed per window against historical bands, catching the silent partial failures freshness misses, the vendor file that arrived half-sized, the webhook that started dropping fields that fail validation upstream of the count.

Dead-letter depth is the third alert, because the dead-letter queue is where designed-for failures accumulate, and an unwatched dead-letter queue is just a slower way to lose data. Non-zero depth is a work item, sustained growth is a page.

And commit retries per table, exported from the function's logs, is the early-warning gauge on concurrency: a climbing retry rate says writers are colliding and batching needs adjustment, weeks before it becomes visible as latency.

All four derive from the table, the queue, and function logs, no agents, no monitoring infrastructure, which keeps the operational surface as small as the compute surface. Wire them into the same dashboard as the per-feed cost line, and each feed becomes a glanceable row: fresh, plausible, clean, cheap.

One more line belongs in the economics discussion because procurement teams ask about it: portability. Every component in this pattern is either open source or a commodity cloud primitive with an equivalent on every provider. The handler code changes its trigger parsing and storage client between clouds and nothing else, the catalog protocol is a standard, and the tables are open format on object storage. A platform built this way negotiates with its cloud provider from a position no proprietary pipeline product offers, and the tail of small feeds, usually the stickiest and most scattered integrations in a migration audit, becomes the easiest part of the estate to move. Optionality is a cost line too, and this pattern's optionality is close to total.

## Failure Modes Worth Rehearsing

**The partial-batch trap.** A function processing a hundred queue messages commits once, then crashes before acknowledging, and the batch redelivers. Without idempotency this is silent duplication at batch scale. This is failure mode number one in practice, which is why idempotency led the design section, and rehearsing it means literally forcing a redelivery in staging and checking row counts.

**The runaway retry loop.** A poison input, a malformed file, a payload that always fails the cast, redelivers forever, burning invocations and burying real errors. Every trigger needs a dead-letter destination and a maximum receive count, configured on day one, because the day you need it is not the day to add it.

**Timeout mid-write.** Functions have wall-clock limits, and an invocation that dies during the write phase leaves data files without a commit, invisible to readers, cleaned by orphan maintenance. The failure is benign for the table and looks alarming in storage. Size timeouts generously against worst-case inputs, and let orphan cleanup do its quiet job.

**The catalog outage.** Every write path in this pattern runs through the catalog, which is the correct design and a real dependency. During a catalog outage, ingestion pauses, events accumulate in queues, and recovery is automatic when service returns, which is exactly the behavior you want and exactly what to verify in a game day. The raw bucket plus replayable triggers is the disaster story: nothing is lost, everything is re-runnable.

**The silent version drift.** The function image pins PyIceberg, the extension autoloads its version, the table sits at a format version, and a year passes. A v3 table gains features some pinned client cannot write, or a new client writes what an old reporting tool cannot read. Same discipline as every fleet: a compatibility note per table, versions bumped deliberately, one canary feed upgraded first.

## Backfills and Replays, Designed In

Every ingestion system eventually runs backward: a transform bug corrupts three weeks of a table, a new column needs history, a vendor resends corrected files. Pipelines designed only for forward flow handle these moments with panic and hand-written scripts. This pattern handles them with the pieces it already has, provided two designs were honored: the permanent raw landing zone and an idempotent write path.

The replay itself is mechanical. Re-fire events over the raw objects for the affected range, a short script listing keys and invoking the function or re-enqueueing messages, and let the idempotent writes converge the table. For an upsert-shaped feed, replays simply reapply and the table settles to correct values. For an overwrite-partition feed, replays rewrite the affected partitions cleanly. For plain-append feeds with a processed-keys manifest, the replay script clears the affected keys from the manifest first, and this is the moment the manifest strategy proves its worth, because it makes the replay's scope explicit and auditable.

Iceberg contributes its own tools to the story. Snapshot history means the pre-bug state remains queryable while the replay runs, so validation is a query comparing the corrected range against expectations, and communication to consumers cites concrete snapshots. For the sharpest incidents, rolling the table back to the last good snapshot, then replaying forward from the raw zone, turns a corruption into a rewind, and the table's audit trail records the whole episode. Rehearse a small replay once in staging, write the script into the runbook, and this failure category loses its teeth permanently.

## When to Graduate

The pattern's boundaries, stated as symptoms rather than dogma. Graduate a feed to a streaming writer or engine-based pipeline when sustained volume keeps invocations near their memory or time ceilings, when required commit frequency defeats reasonable batching, when latency requirements drop below what cold starts and batching allow, or when transformation logic grows joins and state that fight the stateless shape. Graduate nothing merely because it grew steadily, because the pattern scales further than instinct suggests, and the cost dashboard tells the truth about the crossover.

Notice what graduation does not require: migrating the table. The Iceberg table, its catalog entry, its history, and every consumer stay exactly where they are while the writer changes underneath. That is the payoff of standing everything on open formats and a standard catalog, and it is the reason this architecture ages gracefully: every component is replaceable because every interface is open.

## A Worked Example: Thirty Feeds, One Pattern

To see the pattern operating as a platform rather than a trick, here is a composite of deployments I have watched teams build, with no invented benchmark numbers.

The setting is a mid-sized company whose analytics platform runs on Iceberg with a REST catalog, warehouse-scale engines serving BI, and a long tail of inbound data: a dozen SaaS exports landing nightly as files, several vendor drops on odd schedules, webhook event streams from two product surfaces, and a handful of partner APIs polled hourly. Before the migration, the tail ran through a mix of a managed ETL tool, two cron servers someone inherited, and three feeds that were "temporarily" manual. The monthly bill for the tail exceeded the bill for the core pipelines, and every new feed was a three-week ticket.

The platform team's move was to build the pattern once as a template rather than thirty times as functions. The template is a repository scaffold: a handler skeleton with the catalog connection, schema cast, and dead-letter routing already wired, the double-invocation idempotency test already written and failing until the feed author picks a strategy, Terraform for the trigger, queue, and alarms, and a manifest file where the feed declares its table, cadence, and expected volume band, from which the freshness and volume alerts generate. A new feed is a pull request: implement the transform, choose the idempotency strategy from the three documented options, set the manifest values, and the paved road does the rest.

Adoption sorted the feeds naturally. The nightly files and API polls moved first, each a day or two of work, mostly PyIceberg-only handlers. The webhook streams took the DuckDB MERGE shape with SQS batching in front, tuned until commits per table settled into single digits per minute. Two feeds refused the pattern honestly: a high-volume clickstream stayed on its streaming writer, correctly, and one legacy feed's transformation was so stateful it went to the engine-based pipeline where it belonged. The template's boundary documentation names both outcomes as success, because the pattern owning everything was never the goal.

The steady state a few quarters in: several dozen feeds, each a glanceable dashboard row, maintenance centralized through the catalog platform's table services plus one scheduled compaction job the team owns, and the tail's infrastructure bill reduced to function seconds and requests. The change nobody predicted mattered most: source teams began shipping their own feeds through the template, with the platform team reviewing pull requests instead of holding a queue, and the three-week ticket became a two-day PR. The architecture's cheapest resource turned out to be permission.

## Conclusion

Small ingestion deserved small machinery for years before small machinery existed. Now it does, and it is not a compromise: PyIceberg gives Python direct, correct table writes, DuckDB puts real SQL, MERGE included, inside the same process, and the REST catalog makes the whole thing governed, atomic, and engine-agnostic. A function, a queue, a catalog, and two libraries cover the long tail of feeds that never needed a cluster, at costs that round toward zero and with an operational surface a single team can own.

Build it with the five production decisions made deliberately, idempotency, concurrency, file sizes, schema drift, and identity, put maintenance on the calendar as part of each table's contract, and watch the cost line for the day a feed earns heavier tools. The tables stay open, the writers stay swappable, and the platform team gets out of the queue-ticket business. That is what right-sized architecture feels like.

## Keep Going

If this piece was useful, I have written much more on building lakehouses at every scale. *Apache Iceberg: The Definitive Guide* from O'Reilly covers the format underneath this whole pattern, and *Architecting an Apache Iceberg Lakehouse* from Manning covers the platform design decisions around it. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
