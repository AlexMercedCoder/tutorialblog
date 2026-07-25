---
title: "The Apache Iceberg Market in the Middle of 2026"
date: "2026-07-25"
description: "A survey of the Apache Iceberg market in July 2026: the state of the specification, platform support, the acquisition wave, the catalog contest, and how to evaluate real Iceberg support."
author: "Alex Merced"
category: "Data Engineering"
tags:
  - apache iceberg
  - lakehouse
  - data engineering
  - polaris
  - catalog
canonical: https://datalakehousehub.com/blog/iceberg-market-2026/
---

> **Cross-posted.** This article's canonical home is [datalakehousehub.com](https://datalakehousehub.com/blog/iceberg-market-2026/).

Two years ago the interesting question was whether your data platform supported Apache Iceberg. Today every platform claims it does, and the claim tells you almost nothing. One vendor means an engine that reads Iceberg tables somebody else wrote. Another means it writes tables but only through its own catalog. A third means outside engines can create, write, and commit to its managed tables through the standard REST API with credentials the catalog hands out per query. Those are three completely different products wearing one word.

That confusion is the defining feature of the Iceberg market right now, and it exists because the format won. Apache Iceberg is the table format layer for the open lakehouse, and the fight moved somewhere else: to the catalog, to table maintenance, to who governs access when the caller is an agent instead of a person, and to which parts of the stack stay open once a vendor manages them for you.

This is a survey of where that market stands in July 2026: the state of the specification, what each major platform actually shipped, what the acquisitions of the past twelve months signal, where the catalog fight sits, and how to tell real Iceberg support from the marketing kind. I work at Dremio, now part of SAP, and I co-authored the O'Reilly books on Iceberg and Polaris, so my enthusiasm for open standards is a matter of public record. The facts below hold regardless.

## Where the Specification Actually Stands

The current stable line is Apache Iceberg 1.11, released in May 2026, and it sits firmly in the version 3 era of the table specification. Understanding the difference between the library version and the table format version saves a lot of confusion in vendor conversations. The library version, 1.11, is the Java implementation. The format version, currently 3, is the on-disk contract that any implementation in any language has to honor.

Format version 3 brought four changes that matter in production.

Deletion vectors replaced positional delete files. In version 2, a merge-on-read delete wrote a file listing the positions of deleted rows, and readers merged those lists at scan time. As deletes accumulated, readers spent more and more effort on reconciliation. A deletion vector is a single compact bitmap per data file, stored in a Puffin file, which collapses that reconciliation to a bitmap check. For anyone streaming change data into Iceberg, this is the most consequential change in v3.

Row lineage assigns every row a stable identifier and a sequence number that survives compaction and rewrites. That gives downstream systems a way to build incremental processing that follows individual rows through table maintenance rather than treating a compaction rewrite as a wholesale change.

The variant type gives semi-structured data a real home. Instead of storing a JSON blob in a string column and paying parse costs on every scan, variant stores a binary encoding with shredded sub-columns, so queries against specific fields get columnar performance. Variant is a joint effort across the Iceberg and Parquet specifications, which is why the two projects now move together.

Geospatial types arrived as first-class citizens, with geometry and geography supported natively rather than encoded into strings or binary blobs by convention.

Version 4 is under active design and is not released. There is no v4 setting you can put on a table today. Anyone selling you v4 support is selling you a design document. What the dev list shows is a spectrum of maturity. Relative paths in metadata, which make a table portable across storage locations and finally make disaster recovery and table relocation practical, are settled. Content statistics are settled. Single-file commits and an adaptive metadata tree are heavily developed with active design syncs, and both target the same problem: the cost of committing frequently to a table.

The contested end includes what happens to the partition tuple and where column-level updates belong. That last debate reaches down into Parquet, because efficient column updates depend partly on whether the file format grows a logical-file concept. Following the Iceberg dev list without also following the Parquet dev list gives you half the picture in 2026.

Iceberg Summit 2026 in San Francisco drew more than 600 attendees across two days and over 70 sessions, and the notable thing about the program was that not one talk argued for adoption. Every session assumed production usage and asked what to fix next. Engineers from Google, Apple, Snowflake, Databricks, Microsoft, Netflix, and LinkedIn sit in the same design discussions. That cross-vendor participation is the actual moat around the format, more than any technical property.

## Snowflake: Managed Storage, Open Catalog, Both at Once

Snowflake's Iceberg position in 2026 rests on three shipped capabilities.

Iceberg v3 went generally available, which puts deletion vectors, variant, and the rest of the v3 feature set into production use on the platform. Snowflake-managed storage for Iceberg tables went generally available on AWS and Azure, with Google Cloud following. That option matters more than it sounds. Until it existed, using Iceberg in Snowflake meant provisioning your own object storage bucket and the identity configuration that comes with it. Managed storage lets you create Iceberg tables where Snowflake handles metadata, layout, compaction, and file optimization internally, while the tables stay in the open format. You get Iceberg semantics plus platform conveniences like fail-safe and transient tables.

The third piece is the catalog. Horizon Catalog includes bi-directional read and write access through Apache Polaris, the open catalog Snowflake and Dremio co-created and donated to the Apache Software Foundation. Catalog-linked databases federate to external Iceberg REST catalogs, so tables registered elsewhere become discoverable and queryable without a copy step. Data sharing extended to consumers who are not Snowflake customers at all, through Iceberg and the REST catalog API, which means a provider publishes once and recipients read from whatever engine they run.

Around that core, the ingestion story filled in. Openflow provides managed connector-based ingestion, including an agentless Oracle change data capture connector using XStream. Datastream adds a Kafka-compatible streaming path with topic and table duality, and it writes into governed tables including Iceberg. Snowflake also kept expanding zero-copy partnerships, with the SAP integration reaching general availability alongside additions like Workday and IBM watsonx.data.

The pattern is a warehouse company that decided open storage is not a threat to a warehouse business as long as the catalog and the governance layer are strong. Whether that holds depends on how much of the value ends up in the parts of Horizon that are not Polaris.

## Databricks: Interoperability as a Competitive Claim

Databricks bought Tabular, the company founded by Iceberg's creators, in 2024. What followed was two years of convergence work between Delta Lake and Iceberg inside Unity Catalog, and by mid-2026 that work reached a recognizable state.

Unity Catalog has managed Iceberg tables generally available and Iceberg v3 generally available. The 2026 Data and AI Summit added external access to managed Delta tables in public preview, meaning engines like Spark and Flink can create and write Unity Catalog managed tables rather than only reading them. That closes the longest-standing criticism of the platform's openness, which was that managed tables were a one-way door.

Three other announcements matter for the format ecosystem. Multimodal data in open formats introduced a FILE type so managed Delta and Iceberg tables govern PDFs, images, audio, and video alongside structured columns. Geospatial types in Delta and Iceberg v3 went generally available. Catalog federation lets Unity govern tables that live in other catalogs, with cross-engine attribute-based access control.

Then there is OpenSharing, announced June 10, 2026 and hosted by the Linux Foundation. It is the next generation of the Delta Sharing protocol, and two parts of it are relevant here. It adds support for Iceberg REST catalog clients as recipients, so a provider publishing through the protocol reaches Iceberg-native consumers including Snowflake. And it extends the protocol to AI assets, sharing agent skills and models through the same zero-copy mechanism as tables, with on-premises storage vendors implementing it natively.

The strategic read is straightforward. Databricks decided that being the most interoperable catalog is a better position than being the exclusive home of a format. Every announcement in the past year pushes the same direction: keep the governance layer, open the storage layer, and compete on the intelligence built on top.

## The Hyperscalers Each Built a Different Iceberg

The three large clouds arrived at Iceberg from different assets, and their products reflect that.

**Amazon** turned it into a storage product. S3 Tables are table buckets with built-in Iceberg support, where the object store itself performs table maintenance. AWS has since added sort and z-order compaction strategies for both S3 Tables and general purpose buckets, replication support and intelligent tiering for S3 Tables, and Storage Lens export into S3 Tables. On the analytics side, S3 Tables integrate with SageMaker Lakehouse, and Glue Data Catalog gained federation to remote Iceberg catalogs so Redshift, EMR, Athena, Glue, and SageMaker query remote Iceberg tables in place with metadata synchronized in real time and Lake Formation enforcing permissions across the federation. Redshift now writes directly into Iceberg tables. The AWS bet is that the storage layer is the right place to own the format, and the analytics services all become clients.

**Google** turned it into a managed table service with a planet-scale metadata backend. Managed Iceberg tables in Lakehouse, formerly BigLake, went generally available with automatic table management, Iceberg partitioning, multi-table transactions, change data capture, and history-based optimizations. The Lakehouse runtime catalog, formerly BigLake metastore, implements the Iceberg REST specification and supports credential vending, with read and write interoperability between BigQuery, Google's managed Spark, open source engines like Spark, Trino, and Flink, and third-party engines including Databricks and Snowflake in preview. Cross-cloud interconnect and caching target Iceberg data sitting in S3. AlloyDB gained Iceberg interoperability on the transactional side. Google's differentiator is metadata infrastructure built on Spanner, which is a genuine advantage for tables with extreme file counts.

**Microsoft** turned it into a virtualization layer. OneLake stores Fabric data in Delta natively and serves the same tables as Iceberg on demand through table format virtualization, using Apache XTable to generate Iceberg metadata without rewriting or copying data, including conversion of Delta deletion vectors into Iceberg delete files. OneLake exposes an Iceberg REST catalog endpoint so outside engines connect with standard configuration. Fabric mirroring replicates operational databases like Azure SQL, PostgreSQL, and MongoDB into OneLake continuously, and the mirrored output is reachable as Iceberg. Microsoft and Snowflake built bi-directional integration on top of that, so Snowflake-managed Iceberg tables written into OneLake are queryable by Fabric engines and Fabric tables are readable by Snowflake.

Three strategies, three different answers to where the format belongs: in the storage layer, in the metadata service, or in a translation layer. All three end up interoperable through the same REST specification, which is the strongest evidence that the specification is doing its job.

## The Acquisition Wave and What It Signals

The past twelve months rearranged the vendor map more than the previous five combined.

**SAP acquired Dremio**, announced May 4, 2026 and completed July 6, 2026, ahead of the projected Q3 close. SAP's stated plan is that Business Data Cloud becomes an Iceberg-native enterprise lakehouse combining SAP and non-SAP data, and SAP committed publicly to continuing the open source work on Iceberg, Polaris, and Arrow. Alongside it, SAP acquired Prior Labs and its tabular foundation model research, and earlier in March it acquired Reltio for master data management. Three acquisitions, three layers: identity resolution, open lakehouse, and models built for tables rather than text.

**Cyera acquired Ryft** on April 23, 2026, at a price Israeli press put between 100 and 130 million dollars against an eight million dollar seed round. Ryft built automated Iceberg table management: compaction scheduling based on observed query and ingestion behavior, lifecycle and retention policies, compliance-driven deletion. Cyera is not an analytics company. It is a data security platform focused on posture management in the age of autonomous agents. A security vendor paying nine figures for an Iceberg operations startup is the single most informative transaction in this list. It says table maintenance is now table stakes rather than a business, and it says the control point everyone wants is governed, traceable data access for agents, at the layer where the data actually lives.

**IBM acquired Confluent** for about eleven billion dollars, announced December 8, 2025 and completed in 2026. That brings Kafka, Flink, and Tableflow, the feature that materializes Kafka topics directly into Iceberg or Delta tables, into the same portfolio as watsonx.data. Streaming into open table formats stopped being a specialty product and became part of an enterprise software giant's data platform.

**Fivetran and dbt Labs completed their merger** on June 1, 2026, combining ingestion and transformation under one company, with the dbt Fusion engine open sourced under Apache 2.0 as part of dbt Core v2.0.

**Snowflake and Databricks kept buying** in adjacent layers. Snowflake added Crunchy Data for Postgres, Datavolo which became Openflow, Select Star for metadata and lineage, Observe for observability, and Natoma for agent identity. Databricks added Neon for Postgres and, before that, MosaicML and Tabular.

Read the whole list at once and the pattern is clear. Nobody is buying table formats anymore, because the format is settled and free. They are buying the layers around it: identity, semantics, ingestion, security, operations, and observability. For practitioners this cuts both ways. Integration gets better and the number of independent vendors gets smaller. Iceberg itself is the hedge, because the data stays readable by whatever survives.

## The Catalog Is Where the Real Contest Sits

If the format is settled, the catalog is not. A practitioner survey I ran with Andrew Madson in January 2026 found AWS Glue leading at 39.3 percent, Nessie at 28.6 percent, Amazon S3 Tables at 25 percent, and Apache Polaris and Lakekeeper each at 21.4 percent, with Hive Metastore implementations still at 17.9 percent. Respondents use multiple catalogs, which is exactly the point. No single catalog dominates, and Glue's lead reflects AWS gravity rather than a technical verdict.

**Apache Polaris** graduated from the Apache Incubator to a Top-Level Project on February 18, 2026. Snowflake and Dremio co-created it and donated it to the ASF in August 2024, and the incubating community grew to include contributors from Google, Microsoft, Confluent, AWS, and dozens of others. Polaris implements the Iceberg REST specification and adds what the specification deliberately leaves out: multi-catalog management, role-based access control, credential vending, federation to other catalogs, and a policy store. Version 1.0 shipped in the summer of 2025 with a single binary, a Helm chart, and external identity provider support, plus three experimental seeds: generic tables for non-Iceberg formats, an event listener framework, and catalog federation. The releases since then are largely the story of those three growing up, with 1.3.0 in January 2026 maturing two of them.

**Lakekeeper** is the Rust implementation of the REST catalog, appealing to teams that want a small, fast, self-hostable server without a JVM.

**Apache Gravitino** takes a broader position as a metadata layer across Hive, MySQL, PostgreSQL, HDFS, S3, Iceberg, Hudi, Paimon, ClickHouse, StarRocks and more, exposed through one API, while also running a native Iceberg REST endpoint. Its 1.2.0 release added a table maintenance service, a ClickHouse catalog, authorization for Iceberg view operations, and scan planning offload so engines like DuckDB and Spark delegate planning to the catalog. Gravitino also shipped an MCP server, a model catalog, and a Lance REST service for vector data, which is the clearest example of catalogs positioning themselves as the interface agents talk to.

**Project Nessie** holds its position on the strength of git-style branching and tagging over catalog state, which remains the cleanest way to do isolated multi-table experimentation and atomic multi-table publishing.

**Unity Catalog** open sourced its core and now competes on breadth of governance across data, models, and agents. **AWS Glue** and **S3 Tables** win on default placement inside AWS. **BigLake** and **OneLake** do the same in their clouds.

Two capabilities separate the serious catalogs from the rest in 2026. The first is credential vending: the catalog hands back short-lived, scoped storage credentials per query, so engines never hold standing bucket access. The second is enforcement during scan planning, where the catalog applies row filters and column masks while planning the scan rather than trusting each engine to enforce policy. That second one is what makes governance survive an environment where the caller is an agent whose identity shifts by task and whose chain of delegation matters. It is also, not coincidentally, why a security company bought an Iceberg operations startup.

## Streaming, Ingestion, and the Small-File Problem

The fastest-growing category of Iceberg writer is not a batch job. It is a stream.

**Confluent Tableflow** materializes Kafka topics into Iceberg or Delta tables with schema and governance carried across from Stream Governance. **Redpanda Iceberg Topics** does it at the broker: enable a topic property and the broker writes Parquet files in Iceberg layout to object storage alongside tiered storage log segments, with the topic's registered schema defining the table, or a simple key, value, and timestamp schema when no schema is registered. **Snowflake Datastream** brings a Kafka-compatible interface with table duality inside the platform. **Apache Flink** remains the workhorse for stateful streaming writes, and **Debezium** remains the standard change data capture source. **RisingWave**, **Estuary**, and others occupy the streaming-database and managed-pipeline slots.

All of them run into the same physics. Frequent commits produce many small files and many snapshots. Every commit adds a metadata file, and commits to a table serialize through the catalog. A pipeline committing every few seconds generates tens of thousands of snapshots a day per table, and query planning walks manifests. The result is the most common Iceberg performance complaint in production: planning time growing while data volume stays flat.

The mitigations are well understood. Buffer writes to a target file size rather than committing on a timer. Run compaction continuously rather than nightly on high-churn tables. Expire snapshots aggressively and keep only the time travel window you actually use. Rewrite manifests so the metadata tree stays shallow. This is exactly the maintenance work that S3 Tables, Snowflake managed storage, BigLake managed tables, Unity managed tables, Dremio's Autonomous Reflections, and the late Ryft all automate, in five different ways, because everyone hit the same wall.

It is also the problem driving Iceberg v4 design work on single-file commits and adaptive metadata trees. The format was built for large, slow-moving analytical tables. The workloads running on it now commit every few seconds, carry thousands of columns, and need to move between storage locations. v4 is the community's answer to the problems that adoption created.

## The Engine Field

The engine list keeps growing because the REST catalog made engine choice separable from storage choice.

**Dremio** is where I work, so treat this as disclosure rather than a recommendation: it is an Iceberg-native engine with a built-in catalog powered by Apache Polaris, an AI semantic layer, zero-ETL federation to outside sources, autonomous table and reflection maintenance, and an MCP server for agent access.

**Apache Spark** remains the reference implementation for Iceberg writes and the most complete surface for table maintenance procedures. **Apache Flink** owns streaming writes. **Trino** is a widely deployed federated SQL engine with mature Iceberg support. **ClickHouse** built genuine Iceberg integration through its DataLakeCatalog database engine, connecting to REST catalogs including Polaris, Glue, Unity, Hive Metastore, and OneLake, with schema evolution, partition pruning, time travel by snapshot or timestamp, and a native Parquet reader. **StarRocks** targets sub-second customer-facing analytics on Iceberg. **DuckDB** and **Apache DataFusion** brought Iceberg into the single-node and embedded world, where an enormous amount of practical data work now happens. **PyIceberg** made table access from plain Python normal, without a JVM.

Format-adjacent, **DuckLake** deserves a mention because it asked the sharpest architectural question of the past year: what if the catalog were simply a SQL database and the metadata lived in tables rather than in files on object storage. **Apache Paimon** owns the streaming-native design space and reaches the batch world through an Iceberg compatibility mode. **Delta Lake** and **Apache Hudi** continue in their respective ecosystems, with **Apache XTable** providing translation between formats without rewriting data, which is what Microsoft uses under OneLake.

The practical consequence for buyers is that engine lock-in and storage lock-in decoupled. Pick the engine that fits the workload, point it at the catalog, and change your mind later. That is the entire promise of the format, and in 2026 it mostly holds.

## What Real Iceberg Support Looks Like in Code

Vendor claims collapse into something testable when you write the configuration yourself. Here is a v3 table created through a REST catalog, exercising the features that separate current implementations from ones written against version 2.

```sql
CREATE TABLE lakehouse.telemetry.device_events (
    event_id        BIGINT,
    device_id       STRING,
    recorded_at     TIMESTAMP,
    location        GEOMETRY,
    payload         VARIANT,
    ingested_at     TIMESTAMP
)
USING iceberg
PARTITIONED BY (days(recorded_at), bucket(64, device_id))
TBLPROPERTIES (
    'format-version'                        = '3',
    'write.delete.mode'                     = 'merge-on-read',
    'write.update.mode'                     = 'merge-on-read',
    'write.merge.mode'                      = 'merge-on-read',
    'write.parquet.compression-codec'       = 'zstd',
    'write.target-file-size-bytes'          = '536870912',
    'write.metadata.delete-after-commit.enabled' = 'true',
    'write.metadata.previous-versions-max'  = '50',
    'history.expire.max-snapshot-age-ms'    = '604800000'
)
```

Several things are doing real work here. `format-version = 3` is what activates deletion vectors, row lineage, variant, and the geospatial types. The `GEOMETRY` and `VARIANT` columns are native v3 types, not workarounds. Partitioning combines a time transform with a bucket transform, which is Iceberg's hidden partitioning: queries filter on `recorded_at` and `device_id` normally, and the engine derives the partition predicate from the transform without anyone writing a partition column into the WHERE clause. The three merge-on-read settings suit a table receiving continuous updates, at the cost of compaction pressure. The metadata properties bound the growth of the metadata directory, which is the setting most teams discover only after their metadata folder holds a hundred thousand files.

Reading the same table from a completely different runtime is the test that matters:

```python
from pyiceberg.catalog import load_catalog

catalog = load_catalog(
    "lakehouse",
    **{
        "type": "rest",
        "uri": "https://polaris.example.com/api/catalog",
        "warehouse": "analytics",
        "credential": "<client-id>:<client-secret>",
        "header.X-Iceberg-Access-Delegation": "vended-credentials",
    },
)

table = catalog.load_table("telemetry.device_events")

scan = table.scan(
    row_filter="device_id = 'dev-8891' AND recorded_at > '2026-07-01T00:00:00'",
    selected_fields=("event_id", "recorded_at", "payload"),
)

arrow_table = scan.to_arrow()
print(arrow_table.num_rows, table.current_snapshot().snapshot_id)
```

No Spark, no JVM, no vendor SDK. The catalog authenticates the client, vends scoped storage credentials for the specific files this scan touches, and returns Apache Arrow. If a platform's managed tables work through this path, its openness claim is real. If the same code needs a proprietary connector, a special driver, or standing bucket credentials, the tables are open in format only.

The maintenance side is equally concrete:

```sql
CALL lakehouse.system.rewrite_data_files(
    table => 'telemetry.device_events',
    strategy => 'sort',
    sort_order => 'device_id ASC NULLS LAST, recorded_at ASC',
    where => 'recorded_at >= current_date() - INTERVAL 2 DAYS',
    options => map(
        'min-input-files', '20',
        'target-file-size-bytes', '536870912',
        'partial-progress.enabled', 'true'
    )
);

CALL lakehouse.system.rewrite_position_delete_files(table => 'telemetry.device_events');
CALL lakehouse.system.rewrite_manifests(table => 'telemetry.device_events');
CALL lakehouse.system.expire_snapshots(
    table => 'telemetry.device_events',
    older_than => current_timestamp() - INTERVAL 7 DAYS,
    retain_last => 50
);
```

The `where` clause on compaction is the detail that separates a job that finishes from one that rewrites a petabyte every night. Restricting compaction to recently written partitions handles the small files that streaming produced while leaving settled history alone. `partial-progress.enabled` commits results in batches so a failure four hours in does not discard four hours of work. Rewriting delete files clears merge-on-read debt. Expiration bounds the metadata and lets storage reclamation actually happen, since data files stay alive as long as any snapshot references them.

## A Buyer's Checklist for "Iceberg Support"

Support falls into five tiers, and the word alone never tells you which one you are being sold.

| Tier | What it means | The question that reveals it |
|---|---|---|
| Read external | Queries Iceberg tables written by others | Can it read v3 deletion vectors and variant columns? |
| Write external | Creates and writes tables in your storage | Which catalogs does it write through besides its own? |
| Catalog client | Uses the Iceberg REST specification | Does it support credential vending and OAuth against a third-party catalog? |
| Managed tables, open access | Manages storage and maintenance, outside engines still read and write | Can PyIceberg commit to a managed table through the REST endpoint? |
| Managed tables, closed access | Stores Iceberg bytes, controls all access | Is there any supported path for an external writer? |

Six questions to ask in an evaluation, in order of how much they reveal.

First, show me an outside engine writing to your managed tables through the REST catalog. Not reading. Writing. The demo takes ten minutes if the answer is yes.

Second, how does credential vending work, and can I scope it per principal? If the answer involves handing an engine long-lived bucket credentials, the governance story has a hole in it.

Third, where are row filters and column masks enforced? Enforcement inside each engine means the policy is only as good as your least trustworthy client. Enforcement during scan planning at the catalog holds regardless of caller.

Fourth, what table maintenance runs automatically, on what schedule, and how is it priced? Compaction is real compute. Bundled and invisible is fine until it appears as an unexplained line item.

Fifth, what format version do you write by default, and what happens to my tables when v4 lands? A vendor with a clear answer is participating in the specification work. A vendor without one is consuming it.

Sixth, if I stop paying you tomorrow, what do I run to keep reading these tables? The honest answer is a catalog endpoint and a bucket. Anything longer is worth understanding before signing.

## Failure Modes I Keep Seeing

**Metadata growth outrunning data growth.** Planning time climbs while table size stays flat. The cause is unexpired snapshots and unrewritten manifests, usually on tables that a streaming job writes. The warning sign is file count per partition and snapshot count per table, neither of which appears on a default dashboard. Check both weekly.

**Merge-on-read tables that nobody compacts.** Read latency degrades steadily through the week and improves after a manual run. Deletion vectors in v3 make this far less painful than positional deletes did, and they do not eliminate it. High-churn tables need compaction measured in hours, not days.

**Over-partitioning.** Someone partitions by hour and by customer, and a table with modest volume ends up with a million partitions holding two-megabyte files. Query planning suffers more than scanning does. Iceberg's partition evolution lets you fix this without rewriting history, which is a genuine advantage over the previous generation, but the fix still costs a maintenance window of attention.

**Catalog sprawl.** One team stands up Glue, another uses a vendor catalog, a third runs Polaris, and the same logical table exists three times with three sets of permissions. The survey data showing no dominant catalog reflects this reality. Catalog federation features from Glue, Unity, Polaris, and Gravitino exist precisely because everyone has this problem. Pick a primary catalog and federate to the rest rather than replicating tables.

**Assuming the format guarantees portability by itself.** The data files and metadata are portable. The catalog entries, the access policies, the maintenance schedules, and the semantic definitions are not, unless you chose components that keep them portable. Relative paths in the v4 work will improve the storage-relocation half of this. The governance half stays a design decision you make when you pick a catalog.

**Trusting version numbers over behavior.** A platform claiming v3 support does not necessarily write deletion vectors by default, and one claiming REST catalog support does not necessarily implement credential vending. Test the specific capability with the specific version you plan to run. The compatibility matrix is real and it moves.

## Migrating Into Iceberg Without a Rewrite

Most teams reading a market survey are not starting from zero. They have Hive tables, or raw Parquet in a bucket, or a warehouse they want to unwind. Iceberg gives you three migration paths, and picking the wrong one costs weeks.

**In-place migration** converts an existing Hive or Parquet dataset into an Iceberg table by writing new metadata over the existing data files. Nothing gets rewritten. The Spark procedure looks like this:

```sql
CALL lakehouse.system.snapshot(
    source_table => 'hive_prod.web.page_views',
    table => 'lakehouse.web.page_views_iceberg'
);
```

`snapshot` creates an independent Iceberg table pointing at the same data files, leaving the original untouched so you can validate and run both in parallel. When validation passes, `migrate` performs the one-way conversion of the original table in place. Run `snapshot` first, always. The cost of an extra metadata copy is nothing against the cost of a one-way conversion you were not ready for.

**Additive registration** brings existing files into an Iceberg table you already created, which suits a bucket full of Parquet that no table ever described:

```sql
CALL lakehouse.system.add_files(
    table => 'lakehouse.web.page_views',
    source_table => '`parquet`.`s3://raw/web/page_views/`',
    check_duplicate_files => true
);
```

This reads footers to build statistics and writes manifests. It does not validate that every file has a compatible schema, so a single file with a mismatched column type surfaces later as a read error on one partition. Sample the schema across the file set before running it on a large directory.

**Full rewrite** reads the source and writes new files. It costs the most compute and gives the best result: correct file sizes, a chosen sort order, current compression, and clean statistics. Use it when the source layout is bad, which it usually is when the source is a Hive table nobody maintained.

A practical sequence that has worked repeatedly. Pick one table with a real consumer. Snapshot it. Point one non-critical consumer at the Iceberg copy for a week and compare results with a reconciliation query that counts rows and sums a numeric column by partition on both sides. Add the maintenance jobs before you add the second table, because the habits you form on table one propagate to table two hundred. Then migrate by descending query volume, not by descending table size. Finally, keep the Hive metastore alive in read-only mode for a full quarter after the last cutover, because something always still points at it.

One trap worth naming. Teams often migrate storage first and governance later, which leaves a period where the same data has permissions in two systems that disagree. Move the access policy in the same change as the table, even when that slows the migration down. Discovering a permission gap through an audit is more expensive than the delay.

## Who Is Actually Running This

Adoption evidence matters more than vendor claims, and the public record is substantial. Iceberg came out of Netflix, and Netflix still runs event data at a scale measured in petabytes per day. Apple, Airbnb, and LinkedIn were early large deployments. Pinterest manages petabyte-scale user and engagement data on Iceberg over S3 and has presented on the specific challenges at that size. Bloomberg, Slack, and Booking.com adopted more recently. Spotify has spoken publicly about building on Google Cloud's Iceberg products to remove the separation between its lake and warehouse.

The pattern in those deployments is consistent and worth internalizing. They all run more than one engine against the same tables. They all invested in table maintenance early, usually after learning the small-file lesson the hard way. And they all treat the catalog as infrastructure with an owner, not as a configuration detail.

What has changed in the last year is who else is in the room. The survey data shows Iceberg deployments in organizations that have four-person data teams, not just at companies with platform engineering departments. Managed table services from the three clouds and the platform vendors are the reason. That accessibility is the real story of 2026: the format stopped being a large-company technology, and the operational burden that used to gate it moved into products.

## Where This Goes Next

Three directions look well established for the rest of 2026 and into 2027.

The specification work continues toward commit efficiency. Single-file commits, an adaptive metadata tree, relative paths, and content statistics all target the gap between a format designed for slow analytical tables and workloads that commit every few seconds. Whether that gap closes determines how much separate serving infrastructure real-time use cases still need.

The catalog becomes the agent interface. Gravitino shipped an MCP server and a model catalog. Snowflake, Databricks, and Dremio all put semantic layers and metric definitions into their catalogs and expose them to agents. Ryft's lakehouse context layer turned table usage signals into agent-readable context, and Cyera bought that capability to extend a security control plane into the lake. The catalog is where identity, policy, semantics, and metadata already meet, so it is the natural place for an agent to ask what exists and what it is allowed to touch. Expect the next round of differentiation to happen there rather than in the query engine.

Table maintenance finishes commoditizing. Every platform automates it, a startup built entirely around it got acquired by a security company, and the operations that used to justify a dedicated tool are becoming a checkbox. That is good for practitioners and it means the remaining independent value sits in workload-aware optimization rather than in running compaction on a cron.

The quieter trend worth watching is the file format layer. Variant and geospatial types are joint Iceberg and Parquet efforts. The column update debate depends on Parquet growing new capabilities. Columnar metadata leans on Parquet footer improvements. Anyone who wants to predict where the table format goes in 2027 should read both dev lists, because the layers are now moving together and decisions in one ricochet into the other.

## The Unstructured Question

One gap in the format story is worth naming because it is where the next argument starts. Iceberg governs tables. A growing share of the data agents need is not tabular: contracts, images, call recordings, support tickets, product photos.

The responses so far split three ways. Databricks introduced a FILE type so managed Delta and Iceberg tables govern unstructured objects alongside columns, which keeps one governance layer over both. Gravitino added a Lance REST service for vector data and a model catalog, treating vectors and models as first-class catalog citizens next to tables. And several vendors take the simpler route of storing pointers and metadata in Iceberg tables while the bytes live in object storage under separate policy.

The variant type covers the semi-structured middle, and it covers it well. JSON payloads that used to sit in string columns now get columnar treatment on the fields queries actually touch. That handles event payloads, API responses, and configuration blobs. It does not handle a PDF.

My read is that the catalog absorbs this rather than the table format. Extending a table format designed around columnar files to govern arbitrary binary objects strains the design. Extending a catalog that already holds identity, policy, and metadata to also register non-tabular assets is a natural fit, and the catalog is already where agents look. Watch which approach the specification work follows over the next year, because it determines whether "the lakehouse" means structured data with attachments or something genuinely broader.

## Conclusion

The Iceberg market in mid-2026 is a market where the standard won and the competition moved up a layer. Every major platform reads and writes the format. The differences that matter now are whether managed tables stay reachable by outside engines, whether the catalog enforces policy at planning time, whether maintenance happens without a team behind it, and whether the semantic definitions an agent depends on live somewhere portable.

The acquisitions tell the story better than the product announcements do. A master data management company, a Postgres company, a streaming company, a metadata company, and an Iceberg operations company all changed hands in a year, and not one of them was a table format. The format is the shared floor. Everything built on top of it is the contest.

For practitioners the practical advice has stayed constant while everything around it changed. Put the data in Iceberg. Put a catalog in front of it that implements the REST specification and vends credentials. Keep the semantic definitions in something you can export. Then pick engines by workload and change your mind whenever the workload changes. That posture survived three years of vendor churn, two acquisitions of the companies that invented the pieces, and one format version bump. It will survive v4 too.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg and the open lakehouse.
*Apache Iceberg: The Definitive Guide* (O'Reilly) covers the format, the metadata layers, and the maintenance behavior described here from the ground up, and *Apache Polaris: The Definitive Guide* does the same for the catalog layer where most of the current competition is happening.
You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at
[books.alexmerced.com](https://books.alexmerced.com).
