---
title: "The Lakehouse Ingestion Tool Landscape: Fivetran, Airbyte, dlt, and CDC vs Batch"
date: "2026-09-02"
description: "How Fivetran, Airbyte, dlt, and CDC and streaming tools land well-behaved Apache Iceberg tables, and how to choose and maintain them."
author: "Alex Merced"
category: "Data Engineering"
tags:
  - Ingestion
  - CDC
  - Fivetran
  - Airbyte
  - dlt
  - Apache Iceberg
canonical: https://iceberglakehouse.com/posts/lakehouse-ingestion-tools/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/lakehouse-ingestion-tools/).

Ingestion used to end at a warehouse. A connector pulled from Salesforce or Postgres, wrote to a staging schema in Snowflake or BigQuery, and the warehouse handled the rest. The lakehouse changes the destination. The connector now writes Apache Iceberg tables to object storage, registers them through a REST catalog, and hands them to whichever engines are reading. What the connector does with schema evolution, how often it commits, how it represents a deleted row, and who compacts the files afterward all become the ingestion tool's responsibility, because there is no warehouse to absorb the mistakes.

The tools have changed too. Fivetran completed its merger with dbt Labs on June 1, 2026, after acquiring Census and Tobiko Data in 2025, and now sells ingestion, transformation, and a managed lake as one product. Airbyte remains the open-source connector platform and has made Iceberg a first-class destination. dlt has become the code-first option for teams that write ingestion in Python and increasingly for AI agents that generate it. And a separate tier of change-data-capture (CDC) and streaming tools, from Debezium and the Kafka Connect Iceberg sink to managed services, handles the workloads where a batch connector is the wrong shape.

This article covers what ingestion into an Iceberg lakehouse actually requires, the difference between batch and CDC at the table level, where each of the major tools stands as of mid-2026 and how it handles Iceberg specifically, the concerns that decide fit regardless of tool, and the failure modes that show up after the first month. I work at Dremio, which reads what every one of these tools writes, and none of them is a Dremio product.

## What Ingestion Into a Lakehouse Requires

A warehouse destination is a database that accepts rows. An Iceberg destination is a table format on object storage plus a catalog, and writing to it well means getting six things right that a warehouse connector never had to think about.

**Schema mapping and evolution.** The tool infers or receives a source schema and maps it to Iceberg types. When the source adds a column, the tool has to add it to the Iceberg schema with a new field ID. When a column's type widens, the tool has to apply a legal Iceberg promotion or fall back to something safe. A tool that maps every uncertain type to `string` produces tables nobody wants to query.

**Commit semantics.** Every flush is a snapshot. A tool that commits every thirty seconds produces 2,880 snapshots a day and a matching number of small files. A tool that commits hourly produces stale data. The cadence is a tuning decision the tool has to expose.

**Delete and update representation.** A source row deleted or updated has to become either a rewritten data file (copy-on-write), a delete file or deletion vector (merge-on-read), or an appended change record with an operation flag. Which one the tool chooses determines read performance, storage growth, and what compaction has to do.

**Catalog integration.** The tool has to create tables in, and commit through, the catalog the engines use. A tool that writes to its own Glue database while the engines read through Polaris produces tables nobody can find. Credential vending through the REST catalog, where the tool receives scoped storage credentials from the catalog instead of holding its own, is the current standard and not every tool supports it.

**Table layout.** Partitioning, sort order, target file size, and table properties. Some tools expose these. Some choose for you. Some choose badly.

**Maintenance ownership.** Somebody has to compact, expire, and clean up. Some tools do it for tables they manage. Most do not, and the team has to run maintenance on tool-written tables with the same discipline as on any other.

The tools below are evaluated on these six, because they are what separates a connector that produces Iceberg tables from one that produces a well-behaved lakehouse.

## Batch and CDC at the Table Level

The batch-versus-CDC distinction is usually framed as latency. At the Iceberg level it is a distinction in what gets written.

**Batch ingestion** extracts a set of rows on a schedule and writes them. A full refresh replaces the table, which in Iceberg is one atomic `replace` snapshot with all-new files. An incremental batch, using a cursor column such as `updated_at`, appends new and changed rows, which is an `append` snapshot, and leaves deduplication and delete handling to a downstream merge or to the tool's own upsert logic. Batch produces few, large snapshots with well-sized files, and its cost is latency measured in minutes to hours plus the load on the source of re-scanning changed rows.

**CDC ingestion** reads the source database's transaction log, either directly (log-based CDC through Debezium or a database-native stream) or through a query-based approximation, and produces a stream of change events: insert, update, delete, each with the row's before and after images. Landing these in Iceberg takes one of two shapes.

The first shape is an append-only change log: every event is a row, with `_op` and `_ts` columns, and the table is a history. This is the simplest write, produces only `append` snapshots, and defers the question of current state to a downstream view or model. It is the right shape when the history is itself valuable and when a merge can run on a schedule.

The second shape is an upsert into a current-state table: the tool applies each change to the target so that the table always reflects the source. This requires row-level writes. In v2 tables the common implementation is equality deletes, where the tool writes a delete file naming the primary key values that changed, plus new data files with the current rows. In v3 tables it is deletion vectors plus new data files, produced by a `MERGE` or by a writer that positions deletes. Equality deletes are cheap for the writer and expensive for every reader, which is why streaming CDC tables on v2 need frequent compaction. Deletion vectors shift the cost toward the writer and are the reason v3 matters for CDC.

The commit cadence question is sharpest for CDC. A tool that flushes every change event as it arrives produces a snapshot per event. Every tool batches, and the batch interval is the knob that trades latency for file count. A minute is common. Below that, the small-file and snapshot-count costs grow faster than the latency benefit for most analytical uses.

### Choosing Batch or CDC by Source

The right shape depends on the source more than on the tool, and a short decision table captures most cases.

| Source | Preferred shape | Reason |
|---|---|---|
| SaaS application API (CRM, billing, support) | Batch, incremental on a modified timestamp | No transaction log to read. APIs rate-limit and paginate. Minutes of latency is fine |
| Operational database, low change rate | Batch, incremental on `updated_at`, merge disposition | CDC infrastructure is not worth it for a table that changes a few thousand rows a day |
| Operational database, high change rate or deletes matter | Log-based CDC, upsert into current state | Query-based extraction misses deletes and hammers the source. The log is the only complete signal |
| Operational database, audit or history required | Log-based CDC, append-only change log | The history is the product. Current state is a downstream view |
| Event stream (clickstream, telemetry, IoT) | Streaming append with checkpointed commits | Already a stream. No updates. Commit interval is the only tuning |
| Files landing in object storage | Batch triggered by arrival events, replace or append per file | The unit of work is the file, and the event tells you when it exists |
| Third-party data shares | Batch replace on the share's refresh cadence | The provider decides freshness |

The pattern that this table produces in most organizations is two paths, not one. A connector platform for the SaaS and file sources, and a CDC path for the handful of operational databases where deletes and latency matter. Trying to force everything through one tool, either running CDC for a SaaS API that has no log or running hourly batches against a database that needs deletes, is the most common mismatch.

## Fivetran: Managed Ingestion, Now With Transformation Attached

Fivetran is the managed connector service with the widest coverage and the strongest reputation for CDC on operational databases. Its position in 2026 is shaped by acquisitions as much as by product.

**Connectors and CDC.** Several hundred prebuilt connectors across databases, SaaS applications, and files. Log-based CDC for the major databases, with schema drift handling and historical sync. A connector SDK for building custom sources. The core value is that the connectors are maintained by Fivetran, so a source API change is Fivetran's problem.

**Iceberg destination.** Fivetran's Managed Data Lake Service writes Iceberg (and Delta) tables to S3, Azure Data Lake Storage, or Google Cloud Storage, registers them with AWS Glue, Databricks Unity Catalog, Snowflake Open Catalog or Apache Polaris, or its own catalog, and handles compaction, snapshot expiry, and file cleanup for the tables it manages. This is the differentiator on the maintenance-ownership axis: Fivetran-managed lake tables come with their maintenance done. The tradeoff is that the tables are Fivetran's to lay out, and control over partitioning and properties is limited to what the service exposes.

**Schema evolution.** Fivetran adds columns, widens types where it can, and handles renames as adds with soft-deleted old columns. Its type mapping is conservative and documented per source.

**The merger.** With dbt Labs now part of the same company, and dbt Fusion open-sourced as the engine for dbt Core 2.0, Fivetran sells the full path from source to modeled table, with SQLMesh from the Tobiko acquisition as a second transformation option. For lakehouse teams the relevant effect is that Fivetran's roadmap now favors landing in Iceberg and transforming in place, which aligns with the lakehouse and reduces the incentive to land in a warehouse first. The concern that observers raise, and that is reasonable to hold, is vendor neutrality: dbt was tool-agnostic, and integration and pricing are expected to favor the bundle.

**Pricing.** Consumption-based on monthly active rows, with tier changes in late 2025 that pushed some workloads' costs up. CDC-heavy sources with high churn are the expensive case.

**Fit.** Teams that want ingestion to be someone else's problem, have the budget, and are comfortable with managed tables whose layout they do not control. The maintenance handling alone justifies it for organizations without a platform team.

## Airbyte: Open Source Connectors and the S3 Data Lake Destination

Airbyte is the open-source connector platform, with a self-hosted deployment, a managed cloud, and a large catalog of community and certified connectors.

**Connectors.** Six hundred and more, of varying quality. Certified connectors are maintained by Airbyte. Community connectors are maintained by whoever wrote them. The Connector Builder, a low-code interface for API sources, and the connector development kit are how teams cover sources nobody else has. Openness is the value: the connector code is inspectable and modifiable.

**CDC.** Embedded Debezium for log-based CDC on Postgres, MySQL, SQL Server, MongoDB, and others. Change events land with Airbyte's metadata columns, and the destination's sync mode decides whether they are appended or deduplicated.

**Iceberg destination.** The S3 Data Lake destination writes Iceberg tables with a choice of catalog: AWS Glue, a REST catalog such as Polaris or Lakekeeper, or Nessie. Sync modes map to Iceberg operations: `append` produces append snapshots, `append + dedup` produces upserts on the primary key. Airbyte controls file layout with defaults it has tuned, and exposes some table configuration.

**Schema evolution.** Airbyte's typing system normalizes source types into a fixed set, adds columns, and handles type conflicts by widening. Its earlier reputation for coercing to JSON strings has improved with the destinations rewrite, and the Iceberg destination maps to native types.

**Maintenance.** Airbyte does not compact or expire on your behalf. Tables it writes need the same maintenance as any other.

**Fit.** Teams that want to self-host, need a source no managed vendor covers, or want to see and change the connector code. The cost is operating Airbyte, which is a real platform with a scheduler, workers, and a database, and operating maintenance on what it writes.

## dlt: Code-First Ingestion in Python

dlt (data load tool) is a Python library rather than a platform. A pipeline is a Python script with a source, which yields data, and a destination, which receives it. dlt infers schemas, evolves them, tracks incremental state, and loads.

**The model.** `@dlt.resource` decorates a generator that yields dictionaries or Arrow tables. `dlt.pipeline` configures a destination. `pipeline.run(source)` does the rest: schema inference from the data, evolution when the data changes, normalization of nested structures into child tables, and loading with a write disposition of `append`, `replace`, or `merge`. Incremental loading uses a cursor declared on the resource, and dlt persists the cursor state.

**Iceberg destination.** dlt's Iceberg support is built on PyIceberg. The open-source filesystem destination writes Iceberg tables through a SQL catalog. The dltHub Iceberg destination, which requires a commercial license, supports REST catalogs including Polaris and Lakekeeper with credential vending and location vending, and supports all write dispositions including merge. A community-maintained `dlt-iceberg` destination also targets REST catalogs with atomic multi-file commits and merge support. Because it is PyIceberg underneath, there is no JVM, and a dlt pipeline runs anywhere Python runs, including a serverless function or a CI job.

**Schema evolution.** dlt's schema is a first-class object with contracts: a resource can be configured to evolve freely, to freeze, or to fail on new columns or type changes. Type inference is from the data, and dlt supports explicit column hints for cases where inference is wrong. Evolution in the Iceberg destination maps to `add column` and type promotion where legal.

**CDC.** dlt has a Postgres replication source built on logical decoding and sources for Debezium-produced events. The merge disposition with a primary key and a hard-delete column applies updates and deletes as upserts.

**Maintenance.** None. dlt writes and stops.

**Agents.** dlt's design, a Python script with a declarative schema and a well-documented API, has made it the ingestion tool that AI coding agents generate most readily. dltHub has invested in this explicitly, with tooling that lets an agent scaffold a source from API documentation. For teams where ingestion pipelines are increasingly written by agents and reviewed by engineers, this matters.

**Fit.** Python teams, custom sources, serverless and embedded ingestion, and pipelines that need to be versioned as code. The cost is that dlt is a library, so scheduling, monitoring, and retries come from whatever runs the script, and the commercial license for the REST catalog destination is a consideration.

## Schema Evolution Behavior, Tool by Tool

The abstract requirement "handle schema evolution" hides six distinct source changes, and tools differ on each.

**A new column appears.** Every tool covered here adds it to the Iceberg schema with a new field ID. Existing rows read as null. This is the easy case and it is universal.

**A column disappears from the source.** Fivetran and Airbyte keep the column and stop populating it, which is the safe choice and matches Iceberg's model where dropping a column retires its field ID. dlt keeps it under the default evolution mode and can be configured to fail. The Connect sink keeps it. No tool drops columns automatically, which is correct.

**A column is renamed.** No tool detects a rename. Every one of them sees a drop plus an add, and the new column starts empty. This is a source-side problem: a rename in the source is a breaking change to the pipeline and should be handled as one, either by aliasing in the source query or by an Iceberg `RENAME COLUMN` applied manually before the next sync so that the field ID carries over.

**A column's type widens.** Integer to bigint, float to double, and decimal precision increases are legal Iceberg promotions. Fivetran applies them. Airbyte's typing system widens within its type families. dlt applies legal promotions and can be told to fail otherwise. The Connect sink applies promotions when schema evolution is enabled. Widenings outside Iceberg's rules, such as integer to string, are where tools diverge: some coerce the column to string, which is lossless but degrades the table, and some fail the sync, which is loud but safe. Know which yours does.

**A column's type narrows or changes incompatibly.** String to integer, timestamp to date. Iceberg does not support these as in-place promotions. Every tool either fails or coerces to string. The right response is a new column, which means the pipeline needs a human decision.

**Nested structure changes.** A JSON field gains a key, or an array's element type changes. Fivetran and Airbyte flatten or store as JSON strings depending on configuration. dlt normalizes nested objects into child tables and evolves those tables independently, which is its most distinctive behavior. On v3 tables, a `variant` column is the right destination for semi-structured fields whose shape changes, and tool support for writing `variant` is arriving but not universal.

The operational advice that follows from this list: pin the type mapping for every column that queries depend on, so that inference cannot drift it. Treat renames as breaking changes with a manual step. Choose a tool whose behavior on incompatible changes is to fail rather than to coerce, unless the pipeline has downstream validation that catches the coercion. And test evolution against a local Iceberg stack before it happens in production, because every tool handles the edge cases a little differently and the differences are silent.

## Streaming and CDC-Native Tools

For workloads where the source is a stream or a transaction log and the latency target is seconds, a separate set of tools writes Iceberg directly.

**Debezium and the Kafka Connect Iceberg sink.** Debezium captures database changes into Kafka topics. The Iceberg sink connector, originally from Tabular and now maintained in the Apache Iceberg project, reads topics and commits to Iceberg tables on a configurable interval, with exactly-once semantics coordinated through a control topic, automatic table creation, schema evolution, and upsert mode for CDC topics with keys. This is the open-source reference architecture for CDC into Iceberg, and it is what many managed products wrap.

**Flink and Flink CDC.** Apache Flink with the Iceberg connector writes with checkpoint-aligned commits, and Flink CDC connectors read database logs directly without Kafka in between. Flink handles upserts with equality deletes on v2 and gained deletion vector support for v3 in the Iceberg 1.11 sink. It is the heavier option and the most capable for transformations in the stream.

**Managed CDC services.** Estuary, Decodable, Striim, Upsolver, and similar products provide CDC into Iceberg with less operational work than running Debezium and Connect. Several also run compaction on tables they write. They differ in catalog support, in whether they use equality deletes or merge, and in pricing model.

**Warehouse-native ingestion.** Snowflake's OpenFlow, built on Apache NiFi, and equivalents from other platforms ingest into that platform's Iceberg tables. These are the warehouses building the connector layer that Fivetran's merger was partly a response to.

**Cloud provider services.** AWS Database Migration Service and Glue, Google Datastream, and Azure Data Factory all have Iceberg-writing paths of varying maturity.

The choice within this tier is mostly about whether the team runs Kafka. If it does, Debezium plus the Connect sink is the default. If it does not, Flink CDC or a managed service avoids adding Kafka for ingestion alone.

## Comparison

| | Fivetran | Airbyte | dlt | Debezium + Connect sink | Managed CDC |
|---|---|---|---|---|---|
| Model | Managed service | Open-source platform, self-host or cloud | Python library | Kafka-based streaming | Managed streaming |
| Source coverage | Widest, vendor-maintained | Wide, mixed maintenance, custom builder | Anything Python can reach, plus verified sources | Databases with log access, plus any Kafka topic | Databases and streams |
| CDC | Log-based, mature | Embedded Debezium | Postgres logical replication, Debezium sources | Native | Native |
| Iceberg catalogs | Glue, Unity, Polaris, own | Glue, REST, Nessie | SQL, REST with vending (commercial), Glue via REST | Any Java catalog | Varies |
| Delete representation | Managed upsert | Dedup on key | Merge disposition | Upsert mode with equality deletes | Varies |
| Layout control | Limited | Some | Partitioning hints | Table properties | Varies |
| Maintenance | Done for managed tables | None | None | None | Some products |
| Runs without JVM | n/a | No | Yes | No | n/a |
| Cost model | Monthly active rows | Compute plus optional cloud | Free library, commercial hub | Infrastructure | Subscription or consumption |

## The Concerns That Decide Fit

Across all of these, five questions determine whether a tool works for a specific lakehouse, and they are worth asking before any feature comparison.

**Which catalog, and how does the tool authenticate?** The tool must commit through the catalog the engines read. If that is a REST catalog, the tool should support credential vending so that it never holds long-lived storage keys. Fivetran and dltHub do. Airbyte's REST support does. The Connect sink does through any Java catalog implementation. A tool that only writes to its own catalog, or that requires bucket-wide credentials, is a governance problem before it is an ingestion tool.

**What does an update become?** Equality deletes on v2 mean every reader pays until compaction. Deletion vectors on v3 are cheaper to read and compact. Append-only change logs defer the cost entirely. Ask which one the tool produces and on which format version, because it determines the maintenance load.

**How often does it commit?** Configurable batch intervals, and a sensible default, are the difference between a table with a hundred snapshots a day and one with ten thousand. Tools that commit per record or per page of an API response produce tables that need constant compaction.

**Who compacts?** If the answer is "the tool," confirm that it does, on what cadence, and whether it also expires snapshots and removes orphans. If the answer is "you," budget for it from day one, because CDC tables without compaction degrade within days.

**Can the table be tuned?** Partitioning on the columns queries filter on, sort order, target file size, and metrics on the right columns are what make the table fast. A tool that owns the table and exposes none of these produces a table that works and is slow. Some teams land tool-written tables in a raw layer and rewrite into a tuned layer, which is a valid design and doubles storage.

### Sizing Maintenance for Ingested Tables

Because most tools leave maintenance to the team, the maintenance job for ingested tables is part of the ingestion design. Its parameters follow from the tool's write pattern.

A batch tool committing hourly with merge disposition produces 24 `overwrite` snapshots a day, each with a handful of new files and, on merge-on-read tables, a handful of delete files. Compaction with a delete-file threshold every few hours, manifest rewrite daily, and snapshot expiry at seven days keeps such a table healthy at near-zero cost.

A CDC sink committing every minute produces 1,440 snapshots a day. Manifest merging at the default threshold of 100 handles the manifest count, but `commit.manifest.min-count-to-merge` lowered to 20 keeps planning faster. Compaction has to run at least every few hours, targeting files with deletes attached, or the delete file count climbs into the thousands. Snapshot expiry has to be aggressive, one to three days, because each snapshot pins files and 1,440 snapshots a day for a week is 10,000 snapshots of metadata. `write.metadata.delete-after-commit.enabled` should be on, or the metadata directory collects 1,440 JSON files a day.

An append-only event stream produces the same snapshot rate with no delete files, so compaction is about file size rather than deletes, and can run less often on a bin-packing strategy with a sort order if queries filter on a key.

The general rule is that the maintenance cadence has to be at least as frequent as the rate at which the tool's write pattern degrades the table, and that rate is set by the commit interval and the delete representation. Setting the commit interval without setting the maintenance cadence is the design error that produces most unhealthy ingested tables.

## Walkthrough: Three Paths Into One Catalog

The same source, a Postgres `orders` table with a primary key and an `updated_at` column, lands in an Iceberg table in a Polaris catalog three ways.

**dlt with the merge disposition.** A resource with a cursor and a primary key, and a pipeline configured for the Iceberg destination:

```python
import dlt
from dlt.sources.sql_database import sql_database

source = sql_database("postgresql://app:secret@db:5432/shop").with_resources("orders")
source.orders.apply_hints(
    primary_key="order_id",
    incremental=dlt.sources.incremental("updated_at"),
    write_disposition="merge",
)

pipeline = dlt.pipeline(
    pipeline_name="shop_orders",
    destination="iceberg",       # dltHub Iceberg destination, REST catalog configured in secrets
    dataset_name="raw",
)
info = pipeline.run(source)
print(info)
```

The catalog configuration lives in `.dlt/secrets.toml` with the REST URI, warehouse, and client credentials, and credential vending means no storage keys appear anywhere. Each run reads rows with `updated_at` past the stored cursor and merges them on `order_id`, producing one `overwrite` snapshot per run. Scheduling is external: a cron, an orchestrator, or a serverless trigger.

**Airbyte with append plus dedup.** A Postgres source connection with CDC enabled and an S3 Data Lake destination configured with the Polaris REST catalog, warehouse, and credentials. The `orders` stream set to incremental sync with `append + dedup` on `order_id`. Airbyte's scheduler runs the sync on the configured interval, Debezium reads the write-ahead log, and each sync produces new data files plus deletes for changed keys. The configuration is entirely in the UI or in Airbyte's Terraform provider, and there is no code.

**Debezium and the Connect sink.** A Debezium Postgres connector publishes `shop.public.orders` to Kafka. The Iceberg sink consumes it:

```json
{
  "name": "orders-iceberg-sink",
  "config": {
    "connector.class": "org.apache.iceberg.connect.IcebergSinkConnector",
    "topics": "shop.public.orders",
    "iceberg.catalog.type": "rest",
    "iceberg.catalog.uri": "https://polaris.internal/api/catalog",
    "iceberg.catalog.warehouse": "analytics",
    "iceberg.catalog.credential": "client-id:client-secret",
    "iceberg.catalog.header.X-Iceberg-Access-Delegation": "vended-credentials",
    "iceberg.tables": "raw.orders",
    "iceberg.tables.upsert-mode-enabled": "true",
    "iceberg.tables.auto-create-enabled": "true",
    "iceberg.tables.evolve-schema-enabled": "true",
    "iceberg.control.commit.interval-ms": "60000",
    "transforms": "debezium",
    "transforms.debezium.type": "org.apache.iceberg.connect.transforms.DebeziumTransform"
  }
}
```

The Debezium transform unwraps change events into rows with an operation column. Upsert mode applies them by key. The commit interval of sixty seconds bounds the snapshot rate. Auto-create and schema evolution let the sink handle new tables and new columns without intervention. The sink coordinates commits across tasks through a control topic so that a table gets one snapshot per interval regardless of parallelism.

All three land in the same Polaris catalog, in the same namespace, readable by every engine. The differences are latency (seconds for the sink, minutes for Airbyte, whenever the script runs for dlt), operational footprint (Kafka and Connect, an Airbyte deployment, a Python process), and control (properties in the sink config, some in Airbyte, hints in dlt). None of the three compacts. A maintenance job on `raw.orders` is part of the design in every case.

## A Reference Architecture for Mixed Ingestion

Putting the pieces together, the ingestion layer of a multi-engine Iceberg lakehouse in 2026 tends to look like this.

**One catalog.** A REST catalog, Apache Polaris or another implementation, that every tool commits through and every engine reads from. Tools authenticate as service principals with roles scoped to the namespaces they write. Credential vending means no tool holds a storage key.

**A raw namespace per source system.** `raw.salesforce`, `raw.shop_db`, `raw.events`. Tables here are tool-written, in whatever layout the tool produces, with the tool's metadata columns intact. This namespace is the tool's territory.

**Two ingestion paths.** A connector platform, managed or open source, for the SaaS and file sources, running on a schedule. A CDC path, Debezium and the Connect sink or a managed equivalent, for the operational databases, running continuously. Both land in `raw`.

**A maintenance job that covers `raw`.** Scheduled, policy-driven, reading each table's delete-file count and snapshot age and acting accordingly. Owned by the platform team regardless of which tool wrote the table. Where the catalog runs maintenance policies, this becomes a policy attached to the `raw` namespace.

**A curated layer built by transformation.** dbt, SQLMesh, or Spark reads `raw` and produces tuned tables in `analytics` with chosen partitioning, sort orders, metrics, and format versions. This is where layout control lives, which is why the lack of it in tool-written tables is tolerable.

**Observability on the tables, not only on the tools.** Freshness computed from each raw table's latest snapshot timestamp, row counts from snapshot summaries, and file health from the metadata tables, on a dashboard that does not depend on any tool's own reporting.

The design accepts that tool-written tables are not perfectly laid out and that storage is spent twice, once in `raw` and once in `analytics`. In exchange it gets tool independence: any source's connector can be swapped, the CDC path can move from one product to another, and the curated layer does not change, because it reads Iceberg tables and does not care who wrote them. That independence is the reason to build on an open table format in the first place, and the ingestion layer is where it is either preserved or given away.

## Failure Modes

**Small files from short commit intervals.** A CDC sink committing every ten seconds produces 8,640 snapshots and tens of thousands of files per day per table. Reads slow, metadata grows, and compaction runs constantly. The commit interval and the compaction cadence have to be set together.

**Equality delete accumulation on v2.** A streaming upsert table on format version 2 with no compaction has every reader applying thousands of equality delete files. The symptom is read latency growing linearly with days since last compaction. Upgrade to v3 where the writer supports deletion vectors, and compact on a schedule regardless.

**Tool-owned tables that cannot be tuned.** The managed service created the table with no partitioning and truncated metrics on the join key. Queries scan everything. The options are to accept it, to rewrite into a tuned table, or to switch tools.

**Type widening to string.** A source column that was integer becomes a string in the target because the tool saw one malformed value. Every downstream cast breaks. Schema contracts in dlt, type overrides in Airbyte, and source-side cleanup are the fixes, and they have to be in place before the malformed value arrives.

**Catalog mismatch.** The tool writes to Glue. The engines read through a REST catalog that federates Glue, or do not federate it at all. Tables exist and are invisible, or visible but with stale pointers. One catalog, and the tool commits through it.

**Duplicate rows from replays.** A CDC tool that restarts from an old offset, or a batch tool whose cursor was reset, replays rows. Append-mode tables get duplicates. Merge-mode tables are idempotent on the key and are the reason to prefer merge for any source that can replay.

**Long-lived storage credentials in the tool.** A connector configured with a bucket-wide access key, because the tool does not support vending, is a credential that outlives every rotation policy. Prefer tools that vend, and scope the key tightly where they do not.

**Nobody owns maintenance.** The ingestion team assumes the platform team compacts. The platform team assumes the tool does. The table is unusable in six weeks. Assign it explicitly.

**Pricing surprises on CDC volume.** Monthly-active-row pricing on a table where every row updates daily is a bill that scales with churn, not with data size. Model the cost against the source's update pattern before committing.

## Choosing

**Managed, broad, and maintained for you:** Fivetran, with the understanding that the tables are Fivetran's and that the roadmap now favors the dbt bundle.

**Open, self-hosted, and inspectable:** Airbyte, with a maintenance job and an operations budget for the platform.

**Code-first, Python, serverless, agent-friendly:** dlt, with an orchestrator for scheduling and a decision about the commercial hub for REST catalog vending.

**Streaming CDC with Kafka already in place:** Debezium and the Connect sink, with compaction from day one and v3 tables where possible.

**Streaming CDC without Kafka:** Flink CDC for teams that run Flink, a managed CDC service for teams that do not.

Most organizations end up with two: a managed or open-source connector platform for the long tail of SaaS sources, and a CDC path for the operational databases where latency matters. The unifying requirement is that both land in the same catalog, through vended credentials, with maintenance assigned.

## Where the Ecosystem Is Heading

**Consolidation into platforms.** Fivetran plus dbt plus SQLMesh plus Census is the template: ingestion, transformation, reverse ETL, and a managed lake from one vendor. Expect the open-source alternatives to respond by tightening integration with each other and with catalogs rather than by merging.

**Catalogs absorbing ingestion concerns.** Credential and location vending already moved the "where do tables go and who can write them" question into the catalog. Maintenance policies are following. A tool's Iceberg destination becomes thinner as the catalog does more.

**Deletion vectors as the CDC default.** Every writer that produces upserts is moving to v3 deletion vectors. Equality deletes remain for compatibility and for the writers that have not caught up, and the compaction burden of v2 CDC tables is the main reason to push writers forward.

**Agents writing ingestion.** The pattern of an agent generating a dlt source from API documentation, a human reviewing it, and CI testing it against a local Iceberg stack is already in use. Tools whose configuration is code or declarative YAML are the ones agents can produce and validate. That favors dlt and the Connect sink over UI-driven configuration.

**The warehouses' ingestion services.** Snowflake OpenFlow and its counterparts make the platforms themselves the connector layer for their own Iceberg tables. For teams inside one platform, this is convenient. For multi-engine lakehouses, it is another catalog to federate.

## Conclusion

Ingesting into a lakehouse is ingesting into a table format and a catalog, and the tool's handling of schema evolution, commit cadence, delete representation, catalog integration, layout, and maintenance decides whether the result is a lakehouse or a pile of small files. Fivetran manages all six for tables it owns and now sells the transformation layer alongside. Airbyte makes the connectors open and leaves maintenance to you. dlt makes ingestion Python and runs anywhere. Debezium with the Connect sink is the open reference for CDC. Managed CDC services trade money for operations.

The choice between batch and CDC is a choice about latency and about what a change becomes in the table, and on Iceberg the second half matters as much as the first. Whatever the tool, land in one catalog, use vended credentials, prefer merge semantics for anything that can replay, push CDC writers to deletion vectors, and assign maintenance before the first sync.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and the systems that feed and read Iceberg tables. *Architecting an Apache Iceberg Lakehouse* from Manning covers ingestion patterns, streaming writes, and the maintenance that keeps ingested tables healthy. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
