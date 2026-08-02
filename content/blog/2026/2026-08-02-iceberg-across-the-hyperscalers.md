---
title: "Apache Iceberg Support Across the Major Hyperscalers"
date: "2026-08-02"
description: "How AWS, Google Cloud, and Microsoft Azure actually support Apache Iceberg: storage, catalogs, maintenance, governance, and interoperability, layer by layer."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - AWS
  - Google Cloud
  - Microsoft Azure
  - S3 Tables
  - Data Lakehouse
canonical: "https://iceberglakehouse.com/posts/iceberg-across-the-hyperscalers/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-across-the-hyperscalers/).

# Apache Iceberg Support Across the Major Hyperscalers

Every few weeks I get a version of the same question. A team has standardized on Apache Iceberg, they run most of their workloads on one cloud, and they want to know whether that cloud's Iceberg support is real or whether it is a checkbox on a slide. The answer is never a simple yes or no, because "Iceberg support" is not one feature. It is five or six separate capabilities that a vendor can ship independently, and each of the three big clouds has shipped them in a different order.

A note on where this comes from. I have spent the last several years working with teams wiring these services together, writing and teaching about open table formats, and most of what follows comes from watching those projects succeed and fail rather than from vendor documentation alone. I have a stake in open formats staying open, and I try to be plain about the tradeoffs on every side.

This piece breaks down what Amazon Web Services (AWS), Google Cloud, and Microsoft Azure actually provide for Apache Iceberg as of August 2026. Not the marketing summary. The mechanism: where the table metadata lives, who is allowed to commit, what happens to your files when nobody is looking, and which combinations break. By the end you should be able to look at any cloud's Iceberg story and grade it yourself.

## What "Iceberg support" actually means

Apache Iceberg is a table format. It defines how a set of Parquet, ORC, or Avro files becomes a table with schema evolution, snapshot isolation, and atomic commits. The format spec covers metadata files, manifest lists, manifests, and the rules for changing them. It does not cover who stores the pointer to the current metadata file, who enforces permissions, or who cleans up after you.

That gap is why vendor support fragments into layers. When someone tells me their cloud supports Iceberg, I ask about six things.

**Storage.** Can the object store hold Iceberg files efficiently, and does it handle the request patterns Iceberg generates? Iceberg reads are metadata-heavy at planning time and then highly parallel at scan time. Object stores with per-prefix throughput limits punish tables that write everything under one partition path.

**Catalog.** Where does the current metadata pointer live, and what protocol do clients use to read and update it? This is the single most consequential choice on the list. The catalog decides which engines see your table, how commits are serialized, and how portable the table is if you leave.

**Write path.** Which services in the cloud can create tables, append data, run MERGE, and evolve schemas? Read-only support is common and much cheaper to build. Write support is where vendors reveal how serious they are.

**Maintenance.** Iceberg tables degrade without compaction, snapshot expiration, and orphan file cleanup. Somebody has to run those jobs. A managed service that does it for you is worth real money. A service that quietly does not do it will hand you a performance cliff in month four.

**Governance.** Table-level and column-level permissions, row filters, audit logs, and credential vending. Credential vending matters more than most people expect. It lets the catalog hand a client a scoped, short-lived storage credential instead of requiring every engine to hold broad bucket access.

**Interoperability.** Can an engine that the cloud vendor does not own read and write the same table without a copy? This is the whole reason to adopt an open format. A cloud that supports Iceberg only through its own engines has sold you a proprietary warehouse with extra steps.

Hold those six in mind. Each cloud scores differently, and the differences follow from what each company was already good at.

## AWS: Iceberg pushed down into the storage layer

AWS made a bet that no other vendor has copied. Instead of treating Iceberg as a feature of the analytics services, it put Iceberg into Amazon S3 itself.

S3 Tables introduced a new bucket type called a table bucket. Amazon S3 Tables deliver the first cloud object store with built-in Apache Iceberg support, and they are specifically optimized for analytics workloads, with up to 3x faster query throughput and up to 10x higher transactions per second compared to self-managed tables. A table bucket is not a general purpose bucket with a naming convention. Tables are first-class AWS resources inside it, with their own ARNs and their own permissions.

The practical effect shows up in three places. First, permissions stop being bucket policy gymnastics. S3 Tables are first-class AWS resources with table-level access control, encryption, and lifecycle management built in, which removes the need to manage S3 bucket policies for every table. Second, the transaction ceiling rises, which matters for streaming ingestion and for many small concurrent writers. Third, maintenance runs without you scheduling it. Table buckets perform continual compaction, snapshot management, and unreferenced file removal under a policy you set per table.

The maintenance point deserves emphasis because it is the thing teams underestimate. I have watched more Iceberg deployments hurt by neglected maintenance than by any format limitation. A service that compacts your tables in the background removes an entire class of operational failure.

### The catalog side on AWS

AWS runs two catalog surfaces that both speak Iceberg, and understanding the split saves a lot of confusion.

The first is S3 Tables' own catalog. S3 Tables offer table management APIs compatible with the Apache Iceberg REST Catalog standard, so any Iceberg-compatible application can create, update, list, and delete tables in an S3 table bucket. There is also an open source client library, the Amazon S3 Tables Catalog for Apache Iceberg, distributed as a Maven JAR that translates Iceberg operations from your query engine into S3 Tables API operations. That path suits a single table bucket and basic read and write access.

The second is the AWS Glue Data Catalog, which now exposes an Iceberg REST endpoint of its own and sits at the center of what AWS calls the lakehouse architecture of Amazon SageMaker. SageMaker Lakehouse provides open source Apache Iceberg REST APIs to access data in the lakehouse, so customers can use Amazon Redshift, Amazon EMR, Amazon Athena, and SageMaker, along with third-party engines compatible with the Iceberg REST spec, to query data in place. Permissions come from AWS Lake Formation, integrated into the Glue Data Catalog, which gives fine-grained control across warehouse and lake data from one place.

The most interesting piece of that architecture is what it does to Redshift. With SageMaker Lakehouse, tables stored in Amazon Redshift managed storage are accessible through Iceberg APIs using the Iceberg REST catalog backed by the Glue Data Catalog. Warehouse storage that was previously reachable only through Redshift becomes reachable through a standard Iceberg client. That is a meaningful concession to open access, and other warehouse vendors have made similar moves.

### What AWS gives you and what it costs

The AWS engine coverage is wide. Athena, EMR, Glue ETL, Redshift, Amazon Data Firehose, and QuickSight all work against Iceberg tables, and the Iceberg REST surface pulls in outside engines. AWS has also kept pace on the spec. S3 Tables added support for the Variant data type from the Iceberg V3 spec in July 2026, which lets you write semi-structured data like JSON without defining a fixed schema in advance, while V3-compatible engines shred the data into hidden columns that generate Parquet column statistics for file pruning. Compaction covers Variant columns too.

On the storage economics side, S3 Tables added an Intelligent-Tiering storage class that moves data between Frequent Access, Infrequent Access, and Archive Instant Access tiers based on access patterns, plus replication that maintains consistent Iceberg table replicas across regions and accounts without manual synchronization.

The cost of this approach is complexity of choice. A team on AWS has to decide between a general purpose S3 bucket with self-managed Iceberg, an S3 table bucket, the Glue Data Catalog, the S3 Tables catalog, and the SageMaker Lakehouse framing that ties several of them together. Those paths have different permission models and different maintenance behavior. I have sat in design reviews where the entire first hour went to untangling which of them the team was actually using. Pick one deliberately and write it down.

## Google Cloud: the catalog came first

Google took the opposite path. Rather than pushing Iceberg into Cloud Storage, it built a managed Iceberg catalog and made BigQuery a first-class client of it.

The naming changed recently, so I will state both forms. As of April 20, 2026, BigLake is called Lakehouse for Apache Iceberg, and BigLake metastore is called the Lakehouse runtime catalog, while the APIs, client libraries, CLI commands, and IAM names still reference BigLake. If you read older docs or blog posts, mentally map the old names onto the new ones. The service is the same.

The catalog is the center of the design. The Lakehouse runtime catalog manages Iceberg tables through an Iceberg REST catalog endpoint, giving a standard REST interface for compatibility with open source engines like Apache Spark, Apache Flink, and Trino, with tables stored in Cloud Storage. Google recommends this path over its earlier custom Iceberg catalog integration for BigQuery. The REST catalog supports credential vending for fine-grained access control along with cross-region replication and disaster recovery, while the older custom catalog remains supported for existing workflows.

Credential vending is the feature I point to when people ask what separates a serious managed catalog from a thin one. Credential vending lets users access their tables without having direct access to the underlying Cloud Storage bucket. Without it, every engine you add needs storage-level IAM grants, and your access model drifts away from your table model until nobody can explain who can read what.

### Two table types, one lake

Google Cloud exposes Iceberg through two distinct table types, and picking the wrong one causes real pain later.

Iceberg tables managed by the Lakehouse runtime catalog are created by open source engines and stored in Cloud Storage, with the REST endpoint acting as the coordination point. This is the path Google steers you toward for general lakehouse work, because it gives the widest engine compatibility.

Apache Iceberg managed tables in BigQuery are the other type. Formerly called BigLake tables for Apache Iceberg in BigQuery, these offer the same fully managed experience as standard BigQuery tables. BigQuery owns the metadata and writes Parquet files into your Cloud Storage buckets, which makes BigQuery the primary writer and other engines readers. The managed experience runs deep. Multi-statement transactions are supported for Iceberg managed tables created after July 2, 2026, with ACID properties and snapshot isolation, and table partitioning works similarly to standard BigQuery tables.

The tradeoff is exactly what you expect. BigQuery-managed tables give you warehouse ergonomics on open files. Catalog-managed tables give you multi-engine write access. Decide which side of that line each workload sits on before you create the table, because moving later means a rewrite or a careful re-registration.

There are sharp edges worth knowing. Views over Iceberg tables managed by the REST catalog cannot be created in BigQuery, and Iceberg metadata tables such as .snapshots or .files cannot be queried in BigQuery using five-part name identifiers, though you can query them from Spark. Small gaps like that shape how you build tooling.

Governance ties in through Dataplex Universal Catalog. BigLake metastore is integrated with Dataplex Universal Catalog for lineage, data quality, and discoverability, and it runs on Google's Spanner-based metadata infrastructure rather than a metastore you deploy yourself.

## Microsoft: interoperability through virtualization

Microsoft arrived at Iceberg from a different starting position. Fabric and OneLake were built on Delta Lake, and Microsoft had a large installed base already writing Delta tables. Rewriting all of that into Iceberg was never going to happen. So Microsoft built a translation layer instead.

OneLake serves Delta Lake tables as Apache Iceberg tables through on-the-fly conversion, which removes the need for data duplication or format-specific pipelines and lets Iceberg-native tools read existing Delta datasets. The mechanism is worth understanding rather than accepting on faith. The source metadata stays in its original Delta structure in the _delta_log directory, and OneLake's virtualization layer intercepts read requests on the metadata directory, generating Iceberg-compliant metadata on demand so engines interact with the table as if it were natively Iceberg, with no physical data movement.

The conversion uses Apache XTable for table format metadata translation, and Microsoft extended XTable to convert Delta deletion vectors into Iceberg positional delete files. XTable is an Apache project for cross-format metadata translation, so the plumbing here is open source rather than a black box.

Generated metadata has costs that native metadata does not. The Iceberg view of the table is derived, which means it reflects whatever the translation layer supports at that moment. Feature gaps in the translator show up as feature gaps in your table. Microsoft has been explicit that expanding data type coverage and V3 compatibility is active work.

### The catalog and API surface

OneLake exposes an Iceberg REST Catalog endpoint, which is how outside engines find these tables. The OneLake table API endpoint works with clients and libraries compatible with the Iceberg REST Catalog API open standard or the Unity Catalog API open standard. The base URL is `https://onelake.table.fabric.microsoft.com/iceberg`, and authentication uses Microsoft Entra ID with the Azure Storage token audience.

Read the scope carefully before you plan around it. Initially, read-only metadata table operations are supported, with more operations planned. That is a real constraint. An external engine discovers and reads Fabric tables through this endpoint. Writing back through it is not the same story, and you should verify current status against Microsoft's docs before designing a pipeline that assumes it.

Writes into OneLake happen through partner integrations instead. The Snowflake path is the most developed one. Microsoft and Snowflake expanded interoperability to include writing Snowflake tables to OneLake, using OneLake shortcuts to access Snowflake tables, reading OneLake tables directly from Snowflake, and full support for Apache Iceberg format in OneLake. At FabCon 2026, that Snowflake interoperability reached general availability, and native reading from OneLake through Azure Databricks Unity Catalog entered public preview. Microsoft and Databricks also stated they are jointly working to release Azure Databricks support for writing to and storing data directly in OneLake for full two-way interoperability.

The other Azure-side entry point is shortcuts. A Fabric lakehouse creates a shortcut pointing at Iceberg tables in external locations such as Amazon S3 or Azure Data Lake Storage Gen2, and OneLake virtualizes the metadata so Fabric's SQL and Spark engines read the shortcut folder as a native table. Mirroring covers the operational database side, replicating sources like Azure SQL and PostgreSQL into OneLake tables that Iceberg clients then read.

Azure also has a non-Fabric story that predates all this, since Synapse Analytics and Data Factory work with Iceberg tables on ADLS Gen2, and Purview handles cataloging and data quality. For new work, the Fabric and OneLake path is where the investment is going.

## Side by side

| Capability | AWS | Google Cloud | Microsoft Azure |
| --- | --- | --- | --- |
| Native Iceberg storage primitive | S3 Tables table buckets, Iceberg built into the object store | Cloud Storage with catalog-managed tables | OneLake, Delta-native with Iceberg virtualization |
| Managed Iceberg REST catalog | S3 Tables catalog API and Glue Data Catalog Iceberg REST endpoint | Lakehouse runtime catalog, formerly BigLake metastore | OneLake table APIs, Iceberg REST Catalog spec |
| Warehouse engine integration | Redshift, including RMS tables through Iceberg APIs | BigQuery Iceberg managed tables with multi-statement transactions | Fabric Warehouse and SQL analytics endpoint over OneLake |
| Automatic table maintenance | Built into table buckets, policy driven | Managed for BigQuery-managed Iceberg tables | Managed within Fabric for its own tables |
| Credential vending | Lake Formation integration with the Glue Iceberg REST endpoint | Supported by the Lakehouse runtime catalog | Entra ID scoped tokens at the table API endpoint |
| Third-party write access | Broad, through the Iceberg REST endpoints | Broad, through the REST catalog | Partner-specific today, expanding |
| Primary design philosophy | Iceberg in the storage layer | Iceberg in the catalog layer | Iceberg as a compatibility view |

Read that table as a description of emphasis, not as a scorecard. All three clouds run production Iceberg workloads at scale. They just put the intelligence in different places, and the place they put it determines what is easy and what is awkward.

## The catalog is the decision that actually locks you in

Storage is portable. Parquet files are Parquet files, and you can copy them anywhere. The catalog is where lock-in lives, because the catalog holds the pointer that makes a pile of files into a table, and it enforces the rules about who changes that pointer.

Three questions separate a catalog you can live with from one you will fight.

**Does it speak the Iceberg REST spec, and how completely?** All three clouds now expose a REST endpoint. Completeness varies. Read-only metadata operations are a different product from full table management. Test the specific operations your pipelines perform, not the presence of the endpoint.

**Does it vend credentials?** A catalog that vends scoped storage credentials keeps your access model in one place. A catalog that does not forces every engine to hold direct object store permissions, and your security review turns into an archaeology project.

**What happens to the table if you stop paying?** With Iceberg on a general purpose bucket and an open catalog, the answer is that you keep the files and the metadata and you register them somewhere else. With deeply managed table types, the answer is more complicated, and it deserves an explicit test rather than an assumption. Export a table, register it in a different catalog, and query it. Do that once, early, on a table you do not care about. The result tells you what your real exit cost is.

This is where Apache Polaris matters to the conversation. Polaris is an open source Iceberg REST catalog that was co-created with Snowflake, donated to the Apache Software Foundation, and graduated to Top-Level Project on February 18, 2026. It gives teams a catalog implementation that is not owned by any cloud, which is useful for multi-cloud estates and for organizations that want the coordination point under their own control. Several vendors now ship managed builds of it, and the open source project stands on its own regardless of which one you use.

Catalog federation is the other pattern gaining ground. Rather than consolidating every table into one catalog, federation mounts external catalogs so one engine sees tables across several of them. AWS does this within SageMaker Lakehouse, Google supports catalog federation with BigQuery, and several independent query engines are built around the same idea. Federation reduces the pressure to make a single irreversible catalog choice, which is exactly why it spread so quickly.

## Maintenance, and who is actually doing it

An Iceberg table under an active pipeline accumulates three kinds of debt.

Small files pile up because every commit writes at least one file per partition it touches. A job that runs every five minutes across 200 partitions produces a lot of small files by the end of the week. Query planning slows because the engine opens more manifests, and scan throughput drops because each file carries fixed overhead.

Snapshots pile up because every commit creates one. Snapshots are cheap individually and expensive collectively, since each one pins the data files it references and blocks them from deletion.

Orphan files pile up from failed jobs. A writer that dies after writing data files but before committing leaves those files behind with nothing referencing them. They cost storage forever until something removes them.

The three clouds handle this differently, and it is one of the clearest points of separation. S3 Tables run compaction, snapshot management, and unreferenced file removal continually as a property of the table bucket. BigQuery-managed Iceberg tables get warehouse-style automatic management. Fabric manages its own tables inside Fabric. Tables you create yourself on general purpose storage with a self-managed catalog get exactly the maintenance you schedule and no more.

My advice on this has not changed in years. If you run self-managed tables, make maintenance a named pipeline with an owner, a schedule, and alerting, the same as any production job. If you use a managed table type, verify what the maintenance policy actually does and confirm it is on. The failure mode is silent. Nothing breaks. Queries just get slower every week until somebody profiles a dashboard and finds 400,000 files where 4,000 belong.

## Where cross-cloud setups break

Multi-cloud Iceberg works. It also fails in specific, repeatable ways, and knowing the list ahead of time is worth more than any architecture diagram.

**Two writers, one table, different catalogs.** This is the worst one. Iceberg's atomic commit depends on a single coordination point per table. If two catalogs both believe they own the current metadata pointer, you get lost commits, and you find out days later when a downstream count comes up short. One table, one catalog of record. Everything else reads.

**Format version skew.** V3 introduced deletion vectors, the Variant type, geometry types, row lineage, and type widening. Engines added support at different times. A table upgraded to V3 becomes unreadable to a client that only speaks V2, and the failure appears at the consumer, far from whoever ran the upgrade. Before changing a table's format version, inventory every engine, script, and tool that touches it. This applies with more force as V4 work progresses, since format version upgrades in Iceberg are opt-in table by table through a property change, and v2 and v3 tables keep working indefinitely.

**Virtualized metadata drift.** When one platform generates Iceberg metadata from another format on demand, the derived view carries the translator's limitations. A data type the translator does not handle, or a Delta feature with no Iceberg equivalent, surfaces as a broken or incomplete table on the Iceberg side. Test the specific columns and features you use, especially deletion vectors and nested types.

**Credential vending gaps.** A client that supports vended credentials against one catalog and not another turns into a wall of storage IAM tickets. Verify vending support per client, not per catalog.

**Egress and latency.** An engine in one cloud reading a table in another pays egress on every scan and eats cross-region latency on every metadata call. Planning latency hurts more than people expect, since planning is a chatty sequence of small reads. Cross-cloud reads make sense for exploration and for federated joins. They rarely make sense for a dashboard that refreshes every minute.

**Maintenance running against a table another system thinks it owns.** Expiring snapshots on a table that a second platform is time-traveling into breaks the second platform's queries. Snapshot expiration is destructive by design. Coordinate retention windows across every consumer before you shorten them.

**Small file storms from streaming ingestion.** Streaming into Iceberg without compaction produces thousands of tiny files per hour. This is where the transaction rate improvements in table buckets and continual compaction earn their cost.

**Schema changes made from the wrong side.** Iceberg tracks schema at the table level, and a column rename or type change committed through one platform propagates to every reader instantly. That is the feature working correctly. It still surprises teams when a BI tool breaks minutes after a data engineer renames a field in a notebook on another cloud. Treat schema changes as deployments with a change window and a notification, not as ad hoc edits.

## Connecting one client to all three

The payoff for the REST catalog standard is that a single client library talks to all three clouds with a configuration change rather than a code change. Here is PyIceberg, the Python implementation of Iceberg, pointed at each of them.

```python
from pyiceberg.catalog import load_catalog
from azure.identity import DefaultAzureCredential

# --- AWS: Glue Data Catalog Iceberg REST endpoint ---
# SigV4 signing is the key detail. The endpoint is a standard Iceberg
# REST catalog, but AWS authenticates it with its own request signing
# rather than a bearer token, so the client signs each call as a
# "glue" service request in the target region.
aws_catalog = load_catalog(
    "aws_lakehouse",
    **{
        "type": "rest",
        "uri": "https://glue.us-east-1.amazonaws.com/iceberg",
        "rest.sigv4-enabled": "true",
        "rest.signing-name": "glue",
        "rest.signing-region": "us-east-1",
    },
)

# --- Google Cloud: Lakehouse runtime catalog (BigLake metastore) ---
# The warehouse value is a full resource path, not a bucket URI.
# That is the tell that the catalog, not the storage location,
# is the unit of organization on Google Cloud.
gcp_catalog = load_catalog(
    "gcp_lakehouse",
    **{
        "type": "rest",
        "uri": "https://biglake.googleapis.com/iceberg/v1/restcatalog",
        "warehouse": "gs://my-lakehouse-bucket/warehouse",
        "header.X-Goog-User-Project": "my-project-id",
        "token": gcp_access_token,
    },
)

# --- Microsoft: OneLake table APIs ---
# The catalog name is workspaceID/dataItemID, which scopes the client
# to one Fabric data item. The token audience is Azure Storage, the
# same audience used for OneLake filesystem calls.
credential = DefaultAzureCredential()
onelake_token = credential.get_token("https://storage.azure.com/.default").token

azure_catalog = load_catalog(
    "onelake",
    **{
        "type": "rest",
        "uri": "https://onelake.table.fabric.microsoft.com/iceberg",
        "warehouse": "<workspace-id>/<data-item-id>",
        "token": onelake_token,
    },
)

# From here the API is identical regardless of which catalog you loaded.
for catalog in (aws_catalog, gcp_catalog, azure_catalog):
    for namespace in catalog.list_namespaces():
        print(namespace, catalog.list_tables(namespace))
```

Walk through what differs and what does not.

The `type` is `rest` in all three cases. That is the point. Your application code calls `load_catalog`, `list_tables`, and `scan` the same way everywhere.

Authentication differs completely. AWS signs requests with SigV4, which is why the config carries `rest.sigv4-enabled`, a signing name, and a signing region rather than a token. Google and Microsoft both use OAuth-style bearer tokens, but the token audiences and the identity systems behind them are different. Whatever secret management you build has to handle all three shapes.

The `warehouse` parameter means something different on each cloud. On Google it names a catalog resource path. On Microsoft it identifies a Fabric workspace and data item. On the AWS Glue endpoint the account context comes from the signed request itself. This is the most common source of connection failures I see, because people copy a config from one cloud's docs and change only the URI.

Spark configuration follows the same shape. You set `spark.sql.catalog.<name>` to `org.apache.iceberg.spark.SparkCatalog`, set `catalog-impl` or `type` to point at REST, and supply the same URI and auth values. The Iceberg Spark runtime JAR handles the rest.

```sql
-- Once the catalog is registered, ordinary SQL works against any of them.
CREATE TABLE aws_lakehouse.sales.orders (
    order_id      BIGINT,
    customer_id   BIGINT,
    order_ts      TIMESTAMP,
    amount        DECIMAL(12,2),
    payload       VARIANT
)
USING iceberg
PARTITIONED BY (days(order_ts))
TBLPROPERTIES (
    'format-version' = '3',
    'write.target-file-size-bytes' = '536870912'
);
```

Two properties there matter for portability. Setting `format-version` explicitly documents your intent rather than inheriting a default that shifts between engine versions. Setting a target file size of 512 MB gives compaction a goal and keeps writers from producing files that are too small to scan efficiently. The `VARIANT` column only works where V3 Variant support exists, which is the kind of dependency worth writing into your table documentation.

## Choosing without regretting it later

Here is the decision path I walk teams through.

**If your workloads are already on one cloud and staying there,** use that cloud's managed Iceberg path and take the maintenance automation. The interoperability arguments matter less when there is one consumer, and the operational savings are immediate.

**If you have a real second engine, on the same cloud or another one,** the catalog decision becomes the architecture decision. Pick a catalog whose REST implementation supports the full set of operations both engines need, verify credential vending on both clients, and designate exactly one catalog as the writer of record per table.

**If you are on Azure and Iceberg is a hard requirement rather than a preference,** understand the virtualization model before committing. Delta-native storage with generated Iceberg metadata behaves well for read interoperability and has constraints on the write side. Confirm the current state of write support against Microsoft's documentation for your specific pattern, because this area has been moving quickly.

**If you expect to move data between clouds regularly,** stop and cost it out first. Egress and cross-region planning latency dominate. Copying a narrow subset on a schedule often beats live cross-cloud reads, and federation at the query layer beats both for exploratory work.

**If your organization has a policy requirement for vendor-neutral infrastructure,** run an open catalog such as Apache Polaris yourself or through a vendor, and treat cloud-native catalogs as federated sources rather than as the system of record.

One habit is worth more than any of the above. Write down, for every table, which catalog owns it, which system writes to it, what its format version is, and who runs its maintenance. Four facts per table. Teams that keep that list have calm migrations. Teams that do not spend their migration doing forensics.

## Where this is heading

Three trends are visible from the dev lists and the release notes rather than the press releases.

The first is that spec adoption now moves faster than it used to. Apache Iceberg 1.11.0 is the current release, following 1.10.2 in May 2026. V3 features that landed across the 1.8 through 1.10 line are now reaching managed services, with S3 Tables adding Variant support in July 2026 as a recent example. V4 work is underway in public. Pieces of v4 are now formally ratified spec text, with the community voting in May 2026 to add relative path support, and the direction is settled while the timeline is not. Relative paths matter more than they sound, since they make table content movable between locations without rewriting every path in metadata.

The second is that the REST catalog spec is becoming the real compatibility surface. Work on capability headers, which let a client and catalog negotiate what each supports, exists specifically to make fleet coordination less painful during format transitions. When that lands broadly, the version skew problem gets much easier to manage.

The third is agents. All three clouds are wiring AI access into their lakehouse layers, and Model Context Protocol (MCP) servers are appearing across the ecosystem, including on S3 Tables and across the independent engine and catalog vendors. An agent querying a lakehouse has the same needs a BI tool has, plus one more: it needs semantic context, because it has no analyst reading column names and guessing intent. Table format is settled enough that the interesting work is moving up a layer, into catalogs, semantic models, and governance that agents can read.

None of that changes the advice for the next twelve months. Standardize on Iceberg, choose your catalog deliberately, keep format versions consistent across your engine fleet, and make maintenance somebody's job.

## The challengers worth watching

Limiting the conversation to three clouds misses something that changes the math for a lot of teams. Egress fees are the main reason cross-cloud Iceberg is painful, and at least one vendor has attacked that directly.

Cloudflare built R2 Data Catalog into R2 buckets as a managed Iceberg catalog exposing a standard Iceberg REST interface, and R2 charges no egress fees. The combination is the point. Data sits in one place, and engines in any cloud read it without a transfer bill. Cloudflare has since built out the surrounding pipeline as well, with Pipelines for ingestion and R2 SQL for querying, and the catalog performs ongoing maintenance including compaction. A recent addition rewrites and clusters manifest files by partition during compaction, skipping tables that are already well clustered, which reduces the number of manifests an engine opens during planning.

That last detail is a good signal of maturity. Manifest-level optimization is not a headline feature. It is the kind of thing you build after watching real query plans, and it tells you the service is being tuned by people who profile planning time.

The same pattern shows up elsewhere. Storage vendors and warehouse vendors keep adding Iceberg REST endpoints because the endpoint is now the price of entry for selling analytics infrastructure. For an architect, the takeaway is that "which cloud" is a smaller question than it was three years ago. The catalog protocol travels. Your evaluation criteria travel with it.

## A migration path that does not go sideways

Teams moving existing tables into one of these managed paths tend to run the same sequence, and the order matters.

**Inventory before you move anything.** List every table, its current catalog, its format version, its writers, its readers, and its maintenance schedule. Tables nobody reads show up in this step, and dropping them is the cheapest win available.

**Register before you rewrite.** Iceberg supports registering an existing table into a new catalog by pointing at its current metadata file. Registration is a metadata operation and takes seconds. Rewriting data is expensive and often unnecessary. Try registration first and reserve rewrites for tables with genuine layout problems.

**Move readers before writers.** Point a read-only consumer at the new catalog and run it in parallel with the old path for a week. Compare row counts and a few aggregates daily. Cheap insurance.

**Cut over one writer at a time, and never run two.** The moment two writers commit through two catalogs, you have a correctness problem instead of a migration. Turn the old writer off, confirm it is off, then turn the new one on.

**Set maintenance policy on day one.** A newly migrated table with no compaction schedule degrades exactly as fast as the old one did. If the managed service handles it, confirm the policy is enabled and check the target file size matches your query patterns.

**Keep the old metadata for a retention window.** Do not expire snapshots aggressively during a migration. Keep enough history that you can point back at the previous state if the new path surprises you.

I have watched this sequence run smoothly across dozens of tables and I have watched it fail exactly twice, both times for the same reason: two writers. Everything else is recoverable.

## Sources and further reading

- Amazon S3 Tables product page and documentation, including the S3 Tables Catalog for Apache Iceberg client library
- AWS announcement of Iceberg REST Catalog APIs for S3 Tables, March 2025
- AWS announcement of Variant data type support for Iceberg V3 in S3 Tables, July 2026
- AWS documentation on Apache Iceberg support in the lakehouse architecture of Amazon SageMaker
- Google Cloud documentation on Lakehouse for Apache Iceberg, the Lakehouse runtime catalog, and the Iceberg REST catalog endpoint
- Google Cloud documentation on Apache Iceberg managed tables in BigQuery
- Microsoft Fabric documentation on OneLake table APIs for Iceberg and the Fabric blog post on table format virtualization
- Microsoft Fabric blog coverage of FabCon 2026 OneLake interoperability announcements
- Apache Iceberg project release notes and the branching and tagging documentation
- Cloudflare R2 Data Catalog documentation and changelog

## Conclusion

The three big clouds all support Apache Iceberg, and they support it in structurally different ways. AWS pushed it into storage, which delivers automatic maintenance and high transaction rates at the cost of having several overlapping paths to choose from. Google built a managed catalog with credential vending and made BigQuery a client of it, which gives clean multi-engine access at the cost of a table-type decision you make early. Microsoft translates its Delta-native lake into Iceberg on demand, which gives broad read interoperability today with write support arriving through partnerships.

Grade any of them on the six layers: storage, catalog, write path, maintenance, governance, and interoperability. Then grade your own situation on how many engines you truly run and how likely you are to add one. Most teams find their answer sits in the catalog row, because that is the layer where portability is won or lost.

The format itself has already done its job. Iceberg is neutral ground, and every major cloud now competes on how well it serves that neutral ground rather than on whether to support it. That is a better position for practitioners than the one we had five years ago.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and open table formats.
*Architecting an Apache Iceberg Lakehouse* (Manning) covers catalog selection, maintenance strategy, and multi-engine design in far more depth than one article allows.
You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at
[books.alexmerced.com](https://books.alexmerced.com).
