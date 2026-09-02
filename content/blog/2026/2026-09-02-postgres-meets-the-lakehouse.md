---
title: "Postgres Meets the Lakehouse: pg_lake, pg_duckdb, and When Postgres Is Enough"
date: "2026-09-02"
description: "What pg_lake, pg_duckdb, and pg_mooncake do at the Iceberg level, and honest thresholds for when Postgres is enough."
author: "Alex Merced"
category: "Data Architecture"
tags:
  - Postgres
  - pg_lake
  - pg_duckdb
  - pg_mooncake
  - Lakehouse
  - DuckDB
canonical: https://iceberglakehouse.com/posts/postgres-meets-the-lakehouse/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/postgres-meets-the-lakehouse/).

For a long time the answer to "we need analytics on our Postgres data" was a pipeline. Replicate the transactional tables into a warehouse or a lake, transform them there, and query them with an engine built for scans. The pipeline was the tax you paid for keeping the operational database operational. Postgres was not going to scan a billion rows quickly, and nobody expected it to.

Three developments in 2025 and 2026 have changed the question. Snowflake acquired Crunchy Data in June 2025 and open-sourced its Postgres lakehouse extension as pg_lake in November 2025, under the Apache license. Databricks acquired Neon and the team behind pg_mooncake. And the DuckDB ecosystem produced pg_duckdb, which embeds DuckDB's vectorized engine inside Postgres, alongside DuckLake, a lakehouse format that uses Postgres as its catalog. The result is that a Postgres server can now read and write Apache Iceberg tables on object storage, run analytical queries on them at columnar-engine speed, and act as the catalog for a small lakehouse, all through the Postgres wire protocol and the Postgres SQL dialect.

That raises a question that is more interesting than the tooling: when is Postgres, with these extensions, enough? For what scale, what workload, and what organization does the pipeline go away, and where does it come back? This article covers what each of the major extensions actually does at the Iceberg level, how they differ architecturally, where Postgres-as-catalog fits relative to a REST catalog, and a set of honest thresholds for when the extended Postgres is the whole platform and when it is one engine among several. I work at Dremio, which is one of the engines that reads what these extensions write, and none of them is a Dremio product.

## Why This Became Possible Now

Three things had to be true for Postgres to become a lakehouse participant, and none of them were true five years ago.

**A columnar engine that embeds.** Postgres's executor is row-oriented and tuple-at-a-time, which is right for transactions and wrong for scans. DuckDB is a vectorized, columnar, single-process analytical engine that links as a library, reads Parquet natively, and has grown an Iceberg extension. Every one of the Postgres lake extensions is, at its core, a way of getting DuckDB's executor to run inside or beside Postgres. Without an embeddable engine of that quality, Postgres analytics meant either extension-level column stores like Citus's columnar tables, which were still Postgres executors, or leaving Postgres.

**A table format that is a file layout, not a service.** Iceberg tables are metadata files and data files on object storage. There is no server to run and no protocol to implement to write one, only a spec to follow. A Postgres extension can write Parquet, write the manifests and metadata file, and store the pointer in a Postgres table, and the result is a table every engine reads. A format requiring a running service on the write path, or a proprietary metadata store, keeps Postgres on the outside.

**Object storage as the shared disk.** S3 and its equivalents are where the data lives, and every engine reads from them with the same credentials model. Postgres reading and writing object storage directly, with credentials in its configuration or vended by a catalog, puts it on the same footing as Spark or Trino for data access. The shared filesystem that the Hadoop era assumed is now an HTTP API, and Postgres speaks HTTP.

The extensions are the combination. What differs between them is how much Postgres they preserve and how the engine is hosted, which is the subject of the next section.

## What the Extensions Do at the Table Level

The extensions share a goal, Iceberg and Parquet access from Postgres, and differ in how they get there. The differences matter because they determine what a table written by one looks like to every other engine.

### pg_lake

pg_lake is the most complete of the three and the one with the longest production history. It began at Crunchy Data in early 2024, shipped as Crunchy Bridge for Analytics and then Crunchy Data Warehouse, and was open-sourced by Snowflake as version 3.0.

**Architecture.** pg_lake is a set of Postgres extensions plus a separate process, `pgduck_server`, that hosts a single DuckDB instance. Postgres parses and plans queries. When a query touches lake tables, the planner delegates fragments to DuckDB through the server process, and DuckDB reads Parquet from object storage with its own vectorized engine. Results flow back into Postgres for anything Postgres has to finish. Running DuckDB in one shared process rather than one instance per Postgres backend is a deliberate resource-management choice that the team credits for production stability.

**Iceberg tables.** pg_lake introduces an `iceberg` table type. `CREATE TABLE ... USING iceberg` creates an Iceberg v2 table whose data files live on object storage and whose metadata pointer lives in Postgres. Postgres is the catalog. The table participates in Postgres transactions: an `INSERT`, `UPDATE`, or `DELETE` against an Iceberg table commits or rolls back with the surrounding Postgres transaction, and the Iceberg snapshot is written on commit. The team's stated goal was that all Postgres SQL features and transaction semantics work on Iceberg tables, which is a stronger claim than any other Postgres-Iceberg integration makes.

**Reading external files.** Beyond its own Iceberg tables, pg_lake reads Parquet, CSV, JSON, and GeoJSON files from object storage as foreign tables, and reads Iceberg tables from other catalogs by metadata location. `COPY` to and from object storage in Parquet and other formats handles import and export.

**Interoperability.** Tables pg_lake creates are standard Iceberg v2 on standard Parquet. Any engine that can be pointed at the metadata file reads them. For engines that need a catalog rather than a metadata path, the practical pattern is to register the table's metadata location in a REST catalog, or to have pg_lake export to a location the catalog manages. The Postgres-as-catalog model does not speak the Iceberg REST protocol, which is the main interoperability limit and is covered below.

**Status.** Apache 2.0, maintained by the Snowflake team that built it, with Crunchy Data Warehouse customers on an upgrade path. Snowflake's stated position is that pg_lake is not a Snowflake competitor: Postgres is not a central governance and large-scale analytics platform, and pg_lake is for the data that lives near Postgres.

### pg_duckdb

pg_duckdb is a joint project from DuckDB Labs and Hydra, later joined by MotherDuck, that embeds DuckDB directly into the Postgres process.

**Architecture.** One DuckDB instance per Postgres backend, in-process. Queries that pg_duckdb can handle are executed by DuckDB reading Postgres heap tables through a bridge, or reading Parquet, CSV, and Iceberg from object storage through DuckDB's own readers. The in-process design is simpler to deploy and has the resource-isolation tradeoffs that pg_lake's separate-process design avoids: a DuckDB query's memory is the backend's memory.

**Iceberg.** Reading Iceberg tables uses DuckDB's Iceberg extension, which reads by metadata location and, in recent versions, through REST catalogs with credential vending. Writing Iceberg from pg_duckdb depends on DuckDB's write support, which arrived for REST catalogs in 2025 and 2026 and is newer than its read support. pg_duckdb's own writing story has centered on Parquet export and on DuckLake.

**MotherDuck.** pg_duckdb integrates with MotherDuck's hosted DuckDB, so that a Postgres query can offload to cloud compute. This is the scale-out path for pg_duckdb and is a commercial service.

**Fit.** Teams that want DuckDB's engine and ecosystem inside Postgres, lighter deployment than pg_lake, and are primarily reading lake data or exporting to it rather than running transactional Iceberg tables.

### pg_mooncake

pg_mooncake came from Mooncake Labs and was acquired by Databricks in 2025. Its first version stored columnar copies of Postgres tables as Iceberg or Delta on object storage and queried them with DuckDB. Its second version reframed the design as real-time replication: a Postgres table is mirrored into a columnar table on the lake with sub-second lag, and queries against the mirror run on DuckDB.

**Fit.** Teams that want the operational table and an analytical mirror with minimal setup, inside a Databricks-adjacent ecosystem. It is earlier in maturity than pg_lake and its direction is set by Databricks' broader Postgres strategy, which also includes Neon.

### DuckLake and Supabase ETL

Two adjacent projects round out the picture. DuckLake is a lakehouse format from the DuckDB team that stores all metadata in a SQL database, with Postgres as one supported catalog database, and data in Parquet. It is not Iceberg, though it can export to and import from Iceberg, and it is the design the DuckDB ecosystem prefers when the catalog is Postgres. Supabase ETL replicates Postgres tables to Iceberg through Supabase's platform, which is the managed path for Supabase users.

## Comparison

| | pg_lake | pg_duckdb | pg_mooncake | DuckLake (with Postgres catalog) |
|---|---|---|---|---|
| Origin and steward | Crunchy Data, now Snowflake, Apache 2.0 | DuckDB Labs, Hydra, MotherDuck, MIT | Mooncake Labs, now Databricks | DuckDB Labs |
| Engine hosting | Separate `pgduck_server` process, one DuckDB instance | In-process, one DuckDB per backend | DuckDB | DuckDB, outside Postgres |
| Iceberg tables owned by Postgres | Yes, v2, full transaction semantics | Not the focus | Mirrors of heap tables | No, DuckLake format |
| Read external Iceberg | By metadata location | By location and REST catalog via DuckDB extension | Limited | Import from Iceberg |
| Write to REST catalog | Roadmap | Via DuckDB extension, newer | No | Export to Iceberg |
| Row-level updates on Iceberg | Copy-on-write | n/a | Mirror follows source | DuckLake semantics |
| Reads Parquet, CSV, JSON directly | Yes, foreign tables and `COPY` | Yes | Yes | Yes |
| Hybrid Postgres-plus-lake queries | Yes, fragment delegation | Yes, when DuckDB can handle the plan | Yes | n/a |
| Production history | Two commercial generations before open source | Growing | Early | Growing |
| Scale-out path | None in the extension | MotherDuck | Databricks | MotherDuck |

The table shows two philosophies. pg_lake preserves all of Postgres and adds the lake as a table type with full SQL and transactions, at the cost of a second process and, so far, Postgres-only catalog ownership. pg_duckdb preserves DuckDB's ecosystem and adds Postgres as a host, at the cost of resource isolation and with the write path still maturing. pg_mooncake and DuckLake are adjacent: the first is a replication product, the second is a different format.

## Postgres as Catalog Versus a REST Catalog

The most consequential design choice in this space is where the Iceberg metadata pointer lives. pg_lake's answer is Postgres. The lakehouse ecosystem's answer is a REST catalog. Both are valid and they serve different situations.

**Postgres as catalog** means the table's identity, its current metadata location, and its transactional guarantees all live in the Postgres instance. This gives a property no REST catalog can: an Iceberg write is part of a Postgres transaction. A single `BEGIN ... COMMIT` can update a heap table and an Iceberg table atomically. For applications where the operational data and its analytical copy must never disagree, that is a real capability.

The cost is that Postgres does not speak the Iceberg REST protocol, so other engines cannot discover, load, or commit to the table through a standard interface. They can read it if told the metadata location. They cannot safely write it, because their commits bypass Postgres's pointer and diverge. And the catalog's availability is the Postgres instance's availability, which for an operational database is usually high but is also usually not designed to serve analytical engines' catalog traffic.

**A REST catalog** such as Apache Polaris means the pointer lives in a service built for the purpose, every engine speaks to it the same way, it vends scoped credentials, it enforces roles and grants, and it can run maintenance policies. Multi-engine writes are safe because every writer goes through the same compare-and-swap. The cost is that Postgres becomes one client of the catalog rather than its owner, and a Postgres transaction cannot span a REST catalog commit.

The two compose. A Postgres server with pg_lake owns the tables that are transactionally tied to its operational data, and exports or registers them into a REST catalog for the rest of the organization to read. Tables that need multi-engine writes live in the REST catalog, and Postgres reads them through their metadata location or, as the extensions add REST catalog client support, through the catalog directly. The dividing line is who writes: if only Postgres writes, Postgres can be the catalog. If anything else writes, the REST catalog is.

## What to Expect From Performance

The extensions do not make Postgres a distributed engine. They make it a single-node columnar engine with Postgres's front end, and the performance envelope follows from that.

DuckDB on one server scans Parquet at a rate bounded by the server's cores and by object storage throughput. A well-provisioned instance with local NVMe cache and a few dozen cores handles aggregations over tens of gigabytes in seconds and over a few hundred gigabytes in tens of seconds to minutes, depending on selectivity and on whether the data is partitioned and pruned. Filters on partition columns and min/max pruning on Parquet row groups are what make the difference between reading a terabyte and reading a gigabyte, exactly as in any Iceberg engine, and the extensions inherit DuckDB's pruning.

Joins between a lake table and a heap table depend on which side is larger and where the planner puts the join. pg_lake pushes heap rows into DuckDB when the heap side is small, which keeps the join columnar. When the heap side is large, the join runs in Postgres and the lake side's result has to flow back, which is slower. Keeping the operational side of such joins small, by filtering it first, is the main tuning lever.

Concurrency is the limit that arrives first. A single DuckDB instance shares memory and cores across queries. Ten concurrent dashboard queries each scanning a hundred gigabytes will contend, and the fiftieth concurrent user notices. This is the point at which a read replica dedicated to analytics, or a scale-out service, or a second engine reading the same Iceberg tables becomes the answer.

Latency for small queries is where Postgres shines and the lake tables do not. A point lookup on a heap table is sub-millisecond. The same lookup on an Iceberg table means opening a Parquet file on object storage, which is tens of milliseconds at best. Applications that need both keep operational lookups in heap tables and analytical scans in lake tables, which is the division the extensions are designed around.

The honest summary is that the extensions deliver warehouse-class scan performance for single-node-sized data, with Postgres's transactional semantics attached, and that they do not change the arithmetic of distributed processing above that size.

## When Postgres Is Enough

This is the question the extensions raise, and it deserves thresholds rather than a shrug.

**Postgres with pg_lake or pg_duckdb is enough when:**

The analytical data is measured in hundreds of gigabytes to low terabytes, not tens of terabytes. DuckDB's engine on a single well-provisioned server handles scans over that range at speeds that satisfy most dashboards and reports, and object storage holds the data at object-storage prices.

The writers are Postgres and things that feed Postgres. If every analytical table is derived from operational tables, or is loaded through Postgres, then Postgres-as-catalog is coherent and the transactional guarantee is valuable.

The consumers are applications and a small number of analysts. A product that shows customers their own usage analytics, an internal reporting tool, an operations dashboard. These are the workloads where the pipeline to a warehouse was always disproportionate to the need.

Concurrency is modest. A single DuckDB instance, shared or per-backend, serves tens of concurrent analytical queries well. It is not a fleet of executors.

The team is a Postgres team. Operating one more extension on a database they already run is cheaper than operating a catalog, an engine, and a pipeline they do not.

**Postgres is not enough when:**

The data is tens of terabytes and growing, or a single query needs to scan more than a server's memory can stage. This is the point where distributed engines exist for a reason, and where Spark, Trino, Dremio, or a cloud warehouse reading the same Iceberg tables earn their cost.

Multiple engines need to write. Streaming ingestion from Flink, batch loads from Spark, and transformations from dbt on Trino cannot coordinate through Postgres-as-catalog. They coordinate through a REST catalog.

Governance spans the organization. Role-based access across teams, credential vending, audit, data products, and a metadata platform ingesting from the catalog are REST catalog concerns. Postgres has grants and not much else.

Concurrency is high or spiky. A hundred analysts running ad hoc queries, or an agent fleet issuing thousands of queries an hour, wants an engine that scales out and a catalog that is not also the operational database.

Retention is long and cold. A decade of event history at petabyte scale belongs on object storage under a catalog with tiering and maintenance policies, read by engines built for it.

Most organizations are on both sides of these lines at once, for different data. The realistic architecture is not "Postgres or the lakehouse" but "which tables are Postgres's and which are the lakehouse's," with Iceberg as the format that lets both read the other's.

### A Sizing Rule of Thumb

Since "enough" is a matter of scale, a rough sizing rule helps. Take the largest analytical table's compressed Parquet size and the number of concurrent analytical users at peak.

Under a terabyte and under twenty concurrent users: a single Postgres replica with pg_lake, sized with 128 to 256 GB of memory and local NVMe, handles it, and nothing else is needed.

One to five terabytes, or twenty to fifty users: still workable on a large single node for scan-heavy but simple queries, with partition pruning doing most of the work. This is the range where teams start to feel the concurrency ceiling and where a second engine reading the same tables through a REST catalog is a natural addition rather than a replacement.

Above five terabytes for a single table, or above fifty concurrent analytical users, or any workload where one query needs more memory than one server has: the distributed engines exist for this, and Postgres becomes the writer of its own tables and a reader of the rest.

These are not hard lines. A team with a 3-terabyte table that is only ever queried by day partition is fine on one node. A team with a 500-gigabyte table and two hundred analysts hammering it is not. The rule is a starting point for the conversation about which pattern applies.

## Architectural Patterns

Four patterns cover most deployments.

**Pattern one: Postgres is the lakehouse.** A single Postgres with pg_lake. Operational tables in heap storage, analytical tables as Iceberg on object storage, everything queried through Postgres, everything in Postgres transactions. Object storage is the cheap tier and DuckDB is the fast scan. No catalog service, no pipeline, no second engine. Right for the "enough" cases above.

**Pattern two: Postgres exports to the lakehouse.** Postgres with pg_lake or pg_duckdb writes Iceberg tables and registers them in a REST catalog, or exports Parquet that a lakehouse pipeline picks up. Other engines read them. Postgres never reads the lakehouse's other tables. This is a replacement for the CDC pipeline in the direction of Postgres to lake, with the write happening inside Postgres on a schedule or a trigger rather than through a log reader.

**Pattern three: Postgres reads the lakehouse.** Postgres with pg_duckdb or pg_lake reads Iceberg tables that live under a REST catalog, for operational queries that need analytical context: an application that shows a customer's lifetime value computed on the lake, or a service that enriches a request with a lakehouse lookup. Postgres is a read-only client of the catalog. This is the pattern that most directly reduces the need to copy aggregates back into Postgres.

**Pattern four: Postgres as one engine of many.** Postgres reads and writes Iceberg through a REST catalog alongside Spark, Trino, Dremio, and the rest. Postgres's transactional guarantee on Iceberg tables is given up, because the catalog is external, in exchange for full interoperability. This pattern depends on the extensions' REST catalog client support, which is arriving in pg_duckdb through DuckDB's Iceberg extension and is a roadmap item for pg_lake.

The patterns are not exclusive. A Postgres server commonly runs pattern one for its own analytical tables and pattern three for reading organizational data at the same time.

### Postgres as the Agent's Single Endpoint

One more case belongs in the "enough" column. Agent workflows that answer questions over operational and analytical data together benefit from a single endpoint that serves both, and Postgres with lake access is that endpoint for organizations whose analytical data fits the sizing rule.

An agent asked "which of our enterprise customers had a support ticket this week and what is their annual spend" needs a transactional lookup (tickets, in heap tables) and an analytical aggregation (spend, in an Iceberg table). Through pg_lake, that is one SQL statement over one connection with one set of credentials, executed by the planner that knows which side to push where. Through a warehouse, it is two systems, two credential sets, and a join the agent has to perform itself.

The MCP servers that expose Postgres to agents already exist and are widely deployed, because Postgres is where operational data lives. Adding lake tables to the same server extends what those agents can answer without adding a second tool. The governance caveat from earlier applies with force: an agent with a Postgres role that can read Iceberg tables has whatever access that role has, and Postgres's grant model is the whole of the access control. For an organization where that is acceptable, the single endpoint is a real simplification. Where it is not, the REST catalog's role model and credential vending are the reason to keep the agent's analytical reads on the lakehouse side.

## Walkthrough: pg_lake End to End

The following runs through pg_lake's core operations on a Postgres instance with the extensions installed, `pgduck_server` running, and object storage credentials configured.

Create an Iceberg table and load it from the operational data:

```sql
CREATE EXTENSION IF NOT EXISTS pg_lake_iceberg;

CREATE TABLE analytics.orders_iceberg (
  order_id     BIGINT NOT NULL,
  customer_id  BIGINT NOT NULL,
  placed_at    TIMESTAMPTZ NOT NULL,
  amount       NUMERIC(12,2),
  status       TEXT
) USING iceberg
WITH (location = 's3://lake/pg/analytics/orders_iceberg');

INSERT INTO analytics.orders_iceberg
SELECT order_id, customer_id, placed_at, amount, status
FROM public.orders
WHERE placed_at < now() - interval '90 days';
```

The `INSERT` writes Parquet files to the location and commits an Iceberg snapshot when the Postgres transaction commits. A second `INSERT` produces a second snapshot. The metadata pointer is in Postgres's catalog tables, and the table's history is inspectable through pg_lake's metadata functions.

Query it with Postgres SQL, executed by DuckDB:

```sql
SELECT date_trunc('month', placed_at) AS month,
       count(*)                       AS orders,
       sum(amount)                    AS revenue
FROM analytics.orders_iceberg
WHERE status = 'delivered'
GROUP BY 1
ORDER BY 1;
```

The planner recognizes that every referenced table is a lake table, pushes the whole query to DuckDB, and DuckDB prunes Parquet by the `status` filter and aggregates in its vectorized engine. A query that joins the Iceberg table to a heap table runs the Iceberg side in DuckDB and the join in Postgres, or pushes the heap table's rows to DuckDB when that is cheaper, which is the hybrid execution that distinguishes pg_lake.

Update and delete work as they do on any Postgres table:

```sql
BEGIN;
UPDATE analytics.orders_iceberg SET status = 'refunded' WHERE order_id = 8812345;
UPDATE public.orders SET status = 'refunded' WHERE order_id = 8812345;
COMMIT;
```

Both updates commit atomically. The Iceberg side produces a new snapshot with a rewritten data file, since pg_lake's v2 implementation uses copy-on-write for row-level changes.

Read a Parquet file and an external Iceberg table without importing them:

```sql
CREATE FOREIGN TABLE staging.events_raw ()
  SERVER pg_lake
  OPTIONS (path 's3://lake/raw/events/2026-08/*.parquet');

CREATE FOREIGN TABLE shared.customers ()
  SERVER pg_lake
  OPTIONS (path 's3://lake/warehouse/crm/customers/metadata/00412-....metadata.json',
           format 'iceberg');

SELECT c.segment, count(*)
FROM staging.events_raw e
JOIN shared.customers c ON e.customer_id = c.customer_id
GROUP BY 1;
```

The empty column list tells pg_lake to infer the schema from the files. The external Iceberg table is read at the snapshot its metadata file names, and updating to a newer snapshot means pointing at a newer metadata file, which is the limitation of reading by location rather than through a catalog.

Export to the organizational lakehouse:

```sql
COPY (SELECT * FROM analytics.orders_iceberg WHERE placed_at >= '2026-08-01')
TO 's3://lake/warehouse/staging/orders_from_pg/2026-08.parquet'
WITH (format 'parquet');
```

A downstream `add_files` or a PyIceberg script registers the Parquet into a REST-catalog table. Or, for the whole Iceberg table, a one-time `register_table` in Polaris pointing at pg_lake's current metadata file makes it visible to every engine, with the understanding that only Postgres writes it afterward.

### Replacing a CDC Pipeline With pg_lake

The most common reason teams evaluate pg_lake is a CDC pipeline they want to retire: Debezium reading the Postgres write-ahead log, Kafka carrying it, a sink writing Iceberg, and a maintenance job on the result. For the tables where Postgres is the only writer and the analytical consumers can read a Postgres-owned Iceberg table, pg_lake replaces the whole chain with a scheduled statement.

```sql
-- runs every five minutes via pg_cron
INSERT INTO analytics.orders_iceberg
SELECT order_id, customer_id, placed_at, amount, status
FROM public.orders
WHERE updated_at > (SELECT coalesce(max(placed_at), '1970-01-01') FROM analytics.orders_iceberg)
ON CONFLICT DO NOTHING;
```

A merge-style statement handles updates, at copy-on-write cost, and a periodic full refresh of a partition handles deletes for tables where deletes are rare. The latency is the schedule interval rather than CDC's seconds, the operational footprint is `pg_cron` and the extension rather than four services, and the Iceberg table is transactionally consistent with the source because it was written in the same database.

What it does not give up cleanly: the Iceberg table is Postgres-owned, so engines that need it through a REST catalog read it by registered metadata location and cannot write it. Deletes are the awkward case, since detecting them without the log means either soft-delete flags in the source or periodic reconciliation. And the write happens on the Postgres host, so heavy syncs contend with transactions, which is one more reason to run the extension on a replica. For tables where those constraints hold, the pipeline goes away. For the rest, CDC stays.

## Failure Modes

**Treating Postgres-as-catalog as a shared catalog.** A Spark job is pointed at a pg_lake table's metadata location and commits to it. Postgres's pointer does not advance. Postgres's next commit produces a second head. The table is corrupted in the way any dual-catalog table is. Only Postgres writes pg_lake tables.

**Expecting REST catalog features.** No credential vending, no role grants beyond Postgres's, no maintenance policies, no discovery by other engines. Teams that need these have outgrown pattern one.

**Sizing the DuckDB process like a Postgres backend.** pg_lake's `pgduck_server` and pg_duckdb's in-process instances need memory for analytical queries, which is a different profile from transactional backends. A server sized for OLTP runs out of memory on the first large aggregation. Size for the scan.

**Analytical load on the operational instance.** Even with DuckDB doing the work, the queries run on the Postgres host. A heavy report at peak transactional load contends for CPU, memory, and network. The standard mitigation is a read replica dedicated to analytics with the extension installed, which is also where most teams end up.

**Copy-on-write on high-update tables.** pg_lake's row-level operations rewrite files. An Iceberg table that receives frequent small updates from application logic accumulates rewritten files and snapshots, and needs the same compaction and expiry as any Iceberg table. The extensions provide maintenance functions, and they have to be scheduled.

**Reading external Iceberg by stale location.** A foreign table pointed at a metadata file is pinned to that snapshot. The source table advances and the foreign table does not. Until the extensions read through REST catalogs, external tables need their metadata path refreshed.

**Object storage latency in transactional paths.** An Iceberg `INSERT` inside an application transaction waits for Parquet writes to object storage. That is milliseconds to seconds, not microseconds. Application transactions that touch Iceberg tables have different latency characteristics from those that do not.

**Version drift between DuckDB and the engines.** pg_lake and pg_duckdb pin a DuckDB version, and DuckDB's Iceberg support has evolved quickly. A feature in the standalone DuckDB Iceberg extension is not necessarily in the version an extension ships with.

## Operational Guidance

**Decide which tables Postgres owns.** Tables derived from operational data and written only by Postgres are pg_lake's. Tables shared across engines belong in a REST catalog. Write the boundary down.

**Run analytics on a replica.** Install the extension on a read replica or a dedicated analytical instance, and keep the primary for transactions. Physical replication carries the Postgres catalog entries, so the replica sees the same Iceberg tables.

**Size for scans.** Memory for the DuckDB process or backends proportional to the largest expected query's working set, and local NVMe for DuckDB's spill.

**Schedule maintenance.** Compaction and snapshot expiry on pg_lake tables, on the same cadence used for any Iceberg table with the same write pattern. The functions exist and do nothing until called.

**Register, do not dual-write.** To share a pg_lake table with the lakehouse, register its metadata location in the REST catalog as read-only, or export snapshots on a schedule. Never let a second engine commit.

**Watch the extension release notes for REST catalog support.** The moment pg_lake or pg_duckdb reads and writes through a REST catalog with vended credentials, pattern four opens up and the boundary can move.

**Keep the pipeline for what the pipeline is for.** CDC into the lakehouse for high-volume operational tables that many engines consume is still the right design. pg_lake replaces the pipeline for the tables where Postgres is the only writer and the volume fits.

## Choosing Among the Extensions

**pg_lake** when the requirement is Iceberg tables that Postgres owns, with full SQL and transactions, and when production maturity matters more than deployment simplicity. Its two commercial generations before open source are the evidence. The separate `pgduck_server` process is an operational component to run, and it is the reason the extension is stable under load.

**pg_duckdb** when the requirement is DuckDB's engine and ecosystem inside Postgres, primarily for reading lake data and Parquet, with the lightest possible deployment. Its REST catalog client support through DuckDB's Iceberg extension is the most direct path to pattern four, and MotherDuck is the scale-out option for teams that want one.

**pg_mooncake** when the requirement is a real-time analytical mirror of operational tables with the least configuration, and when the organization is Databricks-aligned. Watch its roadmap alongside Neon's.

**DuckLake** when the whole analytical estate is DuckDB and Postgres, no second engine is coming, and simplicity of metadata wins over interoperability. Export to Iceberg is available for the day a second engine does arrive.

**None of them, keep the CDC pipeline** when many engines write, the data is large, governance is organizational, or the operational database cannot host analytical load even on a replica.

Whichever is chosen, the tables are Iceberg or convertible to it, and the format is what keeps the decision reversible.

## Where the Ecosystem Is Heading

**REST catalog clients in the extensions.** DuckDB's Iceberg extension reads and writes through REST catalogs with credential vending, and pg_duckdb inherits it. pg_lake reading and writing external catalogs is the feature that turns it from a Postgres-owned lakehouse into a full lakehouse client, and the team has discussed it publicly.

**Iceberg v3 in pg_lake.** The current implementation is v2. Deletion vectors make row-level updates cheaper than copy-on-write, and the `variant` type maps naturally to Postgres's `jsonb`. Both are natural next steps.

**Databricks and Snowflake as Postgres companies.** Snowflake owns Crunchy Data and pg_lake. Databricks owns Neon and pg_mooncake. Both platforms now offer Postgres as a first-class service adjacent to their lakehouses, and both have an interest in making Postgres-to-Iceberg frictionless in their own ecosystems. Expect the extensions to converge with each vendor's catalog and to diverge from each other in the details.

**DuckLake versus Iceberg for the small case.** For teams whose whole lakehouse is Postgres plus DuckDB, DuckLake's SQL-catalog design is simpler than Iceberg's file-based metadata and trades interoperability for simplicity. The interoperability argument for Iceberg holds as soon as a second engine appears, which for most organizations is soon.

**Postgres in the agent stack.** Agents that query operational data and analytical data in one conversation benefit from one endpoint that serves both. Postgres with lake access is that endpoint for the small and medium case, and MCP servers over Postgres are already common.

## Conclusion

Postgres can now be a lakehouse client, a lakehouse writer, and, for tables it alone owns, a lakehouse catalog. pg_lake does this most completely, with Iceberg tables in Postgres transactions and DuckDB for the scans. pg_duckdb does it more lightly, in-process, with DuckDB's ecosystem. pg_mooncake mirrors operational tables to the lake in near real time. All three write standard Iceberg and Parquet that any engine reads.

Postgres is enough when the data is hundreds of gigabytes to a few terabytes, the writers are Postgres, the consumers are applications and a few analysts, and the team runs Postgres. It is one engine among several when the data is larger, the writers are many, or governance spans the organization, and at that point a REST catalog is the coordination layer and Postgres is a client of it. The line between the two is which tables Postgres owns, and the value of the open format is that the line can move without a migration.

## Keep Going

If this piece was useful, I have written a lot more on how engines and catalogs fit together in an Iceberg lakehouse, including where the catalog belongs and how multiple writers coordinate. *Architecting an Apache Iceberg Lakehouse* from Manning covers engine selection and catalog architecture in depth. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
