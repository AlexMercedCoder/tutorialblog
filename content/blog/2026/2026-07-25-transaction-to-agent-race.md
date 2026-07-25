---
title: "Three Vendors Are Rebuilding the Path From Transaction to Agent"
date: "2026-07-25"
description: "Databricks, Snowflake, and SAP are closing the gap between operational databases and analytical platforms through acquisition, betting on different layers of the same five-part architecture."
author: "Alex Merced"
category: "Data Engineering"
tags:
  - data engineering
  - apache iceberg
  - lakehouse
  - databricks
  - snowflake
---

A customer changes their shipping address in your order system at 9:14 a.m. At 9:20 a.m. someone asks an AI agent where that order is going. The agent reads a table that was last refreshed at 6:00 a.m. and answers with the old address. Nobody did anything wrong. The change landed in Postgres, the change data capture job runs hourly, the transformation job runs after that, and the semantic model was built on the output of the transformation job. Every link in that chain works exactly as designed. The design is the problem.

That six-minute question exposes the most expensive structural gap in enterprise data: the system that records what happened and the system that explains what happened are different systems, and the distance between them is measured in pipelines, staff, and hours. For twenty years we accepted that distance because humans read dashboards on a daily cadence. Agents do not. An agent asked to approve a refund, reroute a shipment, or flag a fraud pattern operates on the timescale of the transaction, not the timescale of the nightly batch.

Three large vendors are attacking that gap right now with acquisitions rather than feature releases. Databricks bought Neon. Snowflake bought Crunchy Data. SAP bought Dremio, and before that Reltio, and alongside it Prior Labs. Different companies, different starting points, one shared thesis.

I should state my position up front. I work at Dremio, which SAP acquired in July 2026. I have opinions about which architecture wins, and I will keep them out of the parts of this piece where they do not belong. The mechanics below apply no matter whose logo is on the invoice.

## Why the Gap Exists in the First Place

Operational databases and analytical engines optimize for opposite physics. An operational database serves thousands of tiny requests per second, each touching a handful of rows, each needing an answer in single-digit milliseconds. It stores rows together so one record fetch is one page read. It maintains B-tree indexes so lookups skip the scan. It holds locks and transaction state so concurrent writes stay consistent.

An analytical engine serves a small number of enormous requests, each touching millions or billions of rows, each aggregating across a few columns. It stores columns together so a query that touches three of eighty columns reads three columns of bytes. It compresses aggressively because compression ratios improve when similar values sit next to each other. It prefers large immutable files because object storage rewards big sequential reads and punishes small random ones.

Those two designs fight each other inside a single engine. Row storage wastes bandwidth on scans. Column storage turns a single-row update into a rewrite. The industry tried to merge them before. Hybrid transactional and analytical processing, usually shortened to HTAP, was the label in the 2010s, and SAP HANA, Oracle, MemSQL, and several others shipped versions of it. The pattern that emerged was consistent: a single engine tuned for both workloads gave up something real on one side, and the analytical side usually lost when a heavy report started competing with checkout traffic for memory.

So the industry did the pragmatic thing and gave up on merging them. Instead we built the bridge: change data capture reads the write-ahead log of the operational database, a message bus carries the changes, a stream processor or batch job applies them to analytical storage, and a transformation layer reshapes the result into something a report can use. Each hop is a piece of software with its own scaling behavior, its own failure modes, and its own on-call rotation.

That bridge costs more than most teams admit. I have watched teams spend six months building the plumbing between two systems that both already worked, and then spend the following year keeping schema drift from breaking it. The pipeline is not the product. Nobody buys your software because your CDC lag is low. It is pure overhead that the business tolerates because the alternative used to be worse.

## What the New Architecture Actually Asks For

Strip the marketing off all three vendor strategies and the same five requirements appear.

First, a real operational database. Not a key-value store with SQL bolted on, and not an analytical engine pretending. Postgres has become the default answer because it is genuinely good, because the extension ecosystem covers vectors and geospatial and time series, and because every model trained on public code already knows how to write it.

Second, replication into analytical storage that runs continuously and requires no hand-built pipeline. The target is measured in seconds of lag, not hours, and the operational team should not have to think about it.

Third, an open table format at rest. Apache Iceberg has become the settled answer here. The table format defines how a set of Parquet files becomes a table with atomic commits, schema evolution, and time travel, so that any compliant engine reads the same bytes without a conversion step.

Fourth, federation for everything that will never be replicated. No enterprise gets to a single copy of all data. Salesforce, a mainframe extract, a partner's S3 bucket, a regional warehouse the acquisition brought along: those stay where they are, and queries reach them in place.

Fifth, a semantic and governance layer that both people and agents read. An agent needs to know that "revenue" means the recognized figure net of returns, not the raw sum of an amount column, and it needs the access check to happen no matter which engine it drives.

Every architecture below is an attempt to own all five layers. The disagreement is about which layer to own first and how much of it to keep open.

## Databricks: Put the Transactional Store Inside the Lakehouse

Databricks paid roughly a billion dollars for Neon in May 2025. Neon built serverless Postgres with storage and compute separated, which allowed instant database branching and scale-to-zero. The interesting statistic from the deal was that around 80 percent of the databases on Neon had been created by agents rather than humans, which tells you what the technology was really being bought for.

The product became Lakebase, announced in June 2025, and generally available on AWS on February 3, 2026. The pitch is Postgres that lives inside the Data Intelligence Platform, governed by the same catalog as analytical tables, with managed synchronization to lakehouse tables instead of a custom pipeline.

The architectural claim escalated at the 2026 Data and AI Summit in June, where Databricks introduced LTAP, short for Lake Transactional/Analytical Processing. The design point is that Postgres-native transactional data gets written into Delta and Iceberg format at the point of write, and analytical engines read that same storage layer. Transactional compute and analytical compute run as separate services so they do not fight for memory, which is the exact failure that killed the earlier generation of HTAP systems, but they share one governed copy of the data.

Alongside it came Lakehouse//RT, a warehouse type built on a new engine called Reyden that targets sub-100-millisecond response on governed tables at high query volume. That fills the serving-layer hole that usually forces teams to copy analytical results back into a fast key-value store.

Databricks also moved on the sharing layer. OpenSharing, announced June 10, 2026 and hosted by the Linux Foundation, extends the Delta Sharing protocol to cover AI assets like agent skills and models, adds Iceberg REST catalog clients as recipients, and supports on-premises providers through storage vendors. Unity Catalog reached general availability for managed Iceberg tables and Iceberg v3, added external write access to managed Delta tables from engines like Spark and Flink, and grew a four-level namespace so one address resolves across accounts, regions, and clouds.

Read the whole sequence and the strategy is legible: own the storage layer and the governance layer, keep the formats open enough that nobody can call it a walled garden, and make the operational database a native citizen so the pipeline disappears.

## Snowflake: Buy Enterprise Postgres, Keep the Warehouse Discipline

Snowflake announced its intent to acquire Crunchy Data three weeks after the Neon deal. Crunchy was a different kind of company than Neon: fifteen years of Postgres operations experience, a widely used Kubernetes operator, and a customer list heavy with federal agencies and financial institutions. The buy was about enterprise credibility rather than serverless novelty.

Snowflake Postgres reached general availability on February 24, 2026. The design is deliberately conservative. Each instance runs a real Postgres server on a dedicated virtual machine with attached disks, in its own isolated network, with PrivateLink support, customer-managed keys, and built-in connection pooling through pgbouncer. That is not the Snowflake virtual warehouse model, and Snowflake says so plainly. It is Postgres, operated by people who have run Postgres for a long time, sitting inside the same account and governance perimeter as the analytical platform.

The rest of the Snowflake stack moved to meet it. Openflow covers managed connector-based ingestion, including an agentless Oracle change data capture connector built on XStream. Datastream adds a Kafka-compatible streaming path so data lands under Snowflake governance without a separate cluster, with topic and table duality that includes Iceberg support. Dynamic Tables push transformation toward declarative definitions where the platform keeps the result current.

On the open-format side, Snowflake shipped Apache Iceberg v3 general availability along with bi-directional read and write through Apache Polaris inside the Horizon Catalog, and Snowflake-managed Iceberg storage went generally available on AWS and Azure. Catalog-linked databases federate to external Iceberg REST catalogs so tables discovered elsewhere become queryable without a copy. Sharing extended to consumers who do not use Snowflake at all, through Iceberg and the REST catalog API.

The through-line is the same as the Databricks one with a different emphasis. Snowflake is betting that enterprises want the operational database to feel like a normal, boring, well-run Postgres, and that the interesting integration work belongs one layer up in the catalog and the semantic layer.

## SAP: Start From the Business Process and Work Down

SAP arrived at the same destination from the opposite direction. Its starting asset is the transactional system itself. Most large enterprises run finance, procurement, and supply chain on SAP, which means the highest-value operational data already sits inside its perimeter, carrying business semantics that no downstream tool reconstructs perfectly.

The gap for SAP was everything outside that perimeter. SAP Business Data Cloud launched in 2025 as the answer, with SAP Databricks embedded and zero-copy sharing through the Delta Sharing protocol, later extended as BDC Connect so SAP data products appear inside Databricks with their semantics intact and Databricks assets appear back in SAP as virtual models.

Then came three acquisitions in three months. Reltio, announced in March 2026, brought master data management, which is the unglamorous discipline of deciding that these four customer records are one customer. Dremio, announced May 4, 2026 and completed July 6, 2026, brought an Iceberg-native lakehouse with federated query, an AI semantic layer, and stewardship of Apache Iceberg, Apache Polaris, and Apache Arrow. Prior Labs, announced the same day as Dremio with a commitment of more than a billion euros over four years, brought tabular foundation models.

That third one deserves attention because it is the piece nobody else bought. Large language models handle text well and handle tables poorly. Tabular foundation models, the TabPFN line in Prior Labs' case, are pretrained for structured prediction on tables, which is what enterprise questions actually look like: payment delay risk, supplier risk, churn probability. An agent that reasons in text and predicts in tables needs both kinds of model.

SAP's stated goal for the combination is that Business Data Cloud becomes an Iceberg-native lakehouse unifying SAP and non-SAP data. Philipp Herzig, SAP's CTO, framed the problem as data readiness rather than model quality, which matches what I see in the field. The projects that stall rarely stall on the model.

## The Shared Pattern, and Where They Diverge

Line the three up and the convergence is striking.

| Layer | Databricks | Snowflake | SAP |
|---|---|---|---|
| Operational store | Lakebase, from Neon, serverless with branching | Snowflake Postgres, from Crunchy Data, dedicated instances | SAP HANA Cloud plus the ERP systems of record |
| Path to analytics | LTAP writes Delta and Iceberg at write time | Openflow, Datastream, Dynamic Tables | Replication flows plus federation, Iceberg-native storage |
| Open format at rest | Delta and Iceberg, managed Iceberg GA | Iceberg v3 GA, managed Iceberg storage | Iceberg through Dremio, with Polaris and Arrow |
| Catalog and governance | Unity Catalog | Horizon Catalog, built on Apache Polaris | Open catalog work plus BDC governance |
| Cross-platform sharing | OpenSharing, Delta Sharing lineage | Iceberg REST sharing, zero-copy partnerships | BDC Connect on Delta Sharing, zero-copy with partners |
| Distinctive bet | Unify OLTP and OLAP on one storage layer | Enterprise-grade Postgres plus catalog federation | Business semantics from the process layer down |

The divergence is about which end of the problem is hardest. Databricks treats storage unification as the hard part and is willing to rebuild the database to get it. Snowflake treats operational reliability and governance as the hard part and keeps the two engines separate on purpose. SAP treats meaning as the hard part, on the theory that federated access to data you cannot interpret is a faster path to a wrong answer.

Nobody in this group is anti-Iceberg, which is the genuinely new fact. Three years ago the table format was a competitive weapon. Now all three treat it as shared infrastructure, and the competition has moved up to the catalog, the semantic layer, and the agent interface.

The hyperscalers are running the same play with their own assets. AWS pairs S3 Tables with Glue catalog federation to remote Iceberg catalogs and Redshift writes directly to Iceberg. Google made managed Iceberg tables generally available under a Lakehouse runtime catalog, with read and write interoperability out to Spark, Trino, Flink, and third-party engines, plus Iceberg interoperability from AlloyDB on the transactional side. Microsoft virtualizes Delta tables as Iceberg in OneLake using Apache XTable, exposes an Iceberg REST endpoint, and mirrors operational databases into OneLake continuously.

And IBM bought Confluent for eleven billion dollars, closing in 2026, which puts Kafka, Flink, and Tableflow, the feature that materializes streams directly into Iceberg tables, inside the same portfolio as watsonx.data. Fivetran and dbt Labs completed their merger on June 1, 2026. The middle of the stack is consolidating as fast as the ends.

## The Mechanics Nobody Puts on the Slide

Marketing says "no data movement." The bytes disagree. Something still reads the operational log and writes columnar files. What changed is who operates it, not whether it happens. Understanding the mechanism tells you where the architecture strains.

Change capture starts at the write-ahead log. Postgres logical replication decodes the WAL into a stream of row-level events with a transaction boundary and a log sequence number. Every downstream guarantee depends on that stream: ordering within a transaction, ordering across transactions, and the ability to resume from a known position after a crash. If the consumer falls behind and the source recycles WAL segments, the slot goes invalid and you resnapshot the table. On a two-terabyte table that is a very long afternoon.

The events then have to become table state. Insert, update, and delete arrive as separate events, and an analytical table has to fold them into the current row. Iceberg gives you two strategies. Copy-on-write rewrites every data file that contains an affected row at commit time, which makes reads fast and writes expensive. Merge-on-read writes a delete file alongside the new data and lets the reader reconcile at scan time, which makes writes cheap and reads progressively slower until compaction runs. Iceberg v3 replaced positional delete files with deletion vectors, a compact bitmap per data file, which cuts the reader's reconciliation cost significantly. Streaming CDC into an Iceberg table without a maintenance strategy is the single most common way teams end up with a slow lakehouse.

Commit frequency is the next constraint. Every Iceberg commit produces a new metadata file and a new snapshot, and commits to the same table serialize through the catalog. A pipeline committing every five seconds produces 17,280 snapshots a day per table. Query planning walks manifests, snapshot expiration jobs fall behind, and the metadata directory becomes the bottleneck long before the data directory does. This is exactly the pressure that drove the Iceberg v4 design work on single-file commits and a more adaptive metadata tree.

Federation has its own physics. Pushdown is the whole game. When you query a federated Postgres table with a filter and an aggregate, the engine either pushes the filter and aggregate into Postgres and pulls back a small result, or it pulls the rows across the wire and aggregates locally. The difference is three orders of magnitude. Pushdown breaks on function calls the remote system does not understand, on joins across two different sources, and on type mismatches that force a cast. Federation is excellent for reference data, for sources with low query volume, and for anything you are legally not allowed to copy. It is a poor substitute for replication under heavy concurrent analytical load, and a vendor that tells you otherwise is selling.

## A Worked Example

Here is the shape of the pattern in real syntax. Start with the catalog, because the catalog is the control plane in every one of these architectures. This is a Spark session configured against an Iceberg REST catalog, which is the interface Apache Polaris, Lakekeeper, Unity Catalog, Glue, and the cloud vendors all implement.

```python
from pyspark.sql import SparkSession

spark = (
    SparkSession.builder
    .config("spark.sql.extensions",
            "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
    .config("spark.sql.catalog.lakehouse", "org.apache.iceberg.spark.SparkCatalog")
    .config("spark.sql.catalog.lakehouse.type", "rest")
    .config("spark.sql.catalog.lakehouse.uri", "https://polaris.example.com/api/catalog")
    .config("spark.sql.catalog.lakehouse.warehouse", "operational_mirror")
    .config("spark.sql.catalog.lakehouse.credential", "<client-id>:<client-secret>")
    .config("spark.sql.catalog.lakehouse.header.X-Iceberg-Access-Delegation",
            "vended-credentials")
    .getOrCreate()
)
```

Four of those settings matter more than the rest. The `type` of `rest` says the catalog is reached over the Iceberg REST specification rather than a file path or a Hive metastore, which is what makes the same table readable from Trino, Flink, DuckDB, or a vendor engine without reconfiguration. The `warehouse` names the catalog inside a multi-catalog server. The `credential` authenticates the client as a principal, not as a machine with bucket access. The vended-credentials header asks the catalog to hand back short-lived, scoped storage credentials for exactly the files this query needs, so the engine never holds standing access to the bucket. That last one is how governance survives multi-engine access, and it is the piece most self-built stacks skip and later regret.

Now the CDC merge. Assume a stream job has landed a batch of change events into a staging table with an operation column and a sequence number.

```sql
MERGE INTO lakehouse.sales.orders AS t
USING (
    SELECT order_id, customer_id, status, ship_to, amount, op, lsn
    FROM (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY lsn DESC) AS rn
        FROM lakehouse.staging.orders_cdc
        WHERE lsn > (SELECT COALESCE(MAX(last_lsn), 0) FROM lakehouse.sales.orders_watermark)
    )
    WHERE rn = 1
) AS s
ON t.order_id = s.order_id
WHEN MATCHED AND s.op = 'D' THEN DELETE
WHEN MATCHED AND s.op IN ('U', 'I') THEN UPDATE SET
    t.customer_id = s.customer_id,
    t.status      = s.status,
    t.ship_to     = s.ship_to,
    t.amount      = s.amount,
    t.last_lsn    = s.lsn
WHEN NOT MATCHED AND s.op IN ('U', 'I') THEN INSERT *
```

The window function is the part people leave out. A single micro-batch often contains three changes to the same order, and applying them in arbitrary order produces a row that never existed in the source. Ranking by log sequence number and keeping only the newest event per key makes the merge idempotent, which matters because streaming systems replay batches after failure. The watermark subquery makes the whole statement safe to rerun. The `op = 'D'` branch handles deletes explicitly, because a soft delete that never propagates is how an agent ends up recommending a product you discontinued.

Then the maintenance, which is not optional:

```sql
CALL lakehouse.system.rewrite_data_files(
    table => 'sales.orders',
    strategy => 'sort',
    sort_order => 'customer_id ASC',
    options => map('min-input-files', '25', 'target-file-size-bytes', '536870912')
);

CALL lakehouse.system.rewrite_manifests(table => 'sales.orders');

CALL lakehouse.system.expire_snapshots(
    table => 'sales.orders',
    older_than => TIMESTAMP '2026-07-18 00:00:00',
    retain_last => 100
);

CALL lakehouse.system.remove_orphan_files(table => 'sales.orders');
```

Compaction merges the small files a streaming writer produces into half-gigabyte files and, with a sort strategy, clusters rows so that filters on `customer_id` skip most of the data through min and max statistics. Manifest rewriting keeps the metadata layer from growing linearly with commit count. Snapshot expiration bounds time travel and lets the storage actually get deleted. Orphan file removal catches files written by failed jobs that no snapshot references. Every managed platform in this article runs some version of these four operations for you, and every self-managed stack has to schedule them. Dremio's Autonomous Reflections and similar features go a step further and maintain derived materializations automatically, which is the same idea applied one layer up.

Finally, the federated join that makes the whole thing worth building:

```sql
SELECT
    o.order_id,
    o.status,
    c.account_tier,
    c.region
FROM lakehouse.sales.orders AS o
JOIN crm.public.accounts AS c
  ON o.customer_id = c.customer_id
WHERE o.status = 'IN_TRANSIT'
  AND c.region = 'EMEA'
```

Nothing about that query tells you `orders` lives in Iceberg on object storage and `accounts` lives in a Postgres instance the CRM team owns. That is the point. The engine plans the scan against Iceberg with partition and statistics pruning, pushes the region filter into Postgres, and joins the two small result sets. Check the query profile to confirm the pushdown actually happened, because when it does not, this exact query pulls a million CRM rows across the network every time an agent asks about EMEA shipments.

## Failure Modes and the Warning Signs

**Commit contention on hot tables.** Symptom: retry storms in the writer logs and commit latency climbing from milliseconds to tens of seconds. Cause: multiple writers committing to one table through one catalog, each retrying on conflict. Fix: fewer, larger commits, partition the write path, or move the high-frequency table to a serving engine designed for it. Warning sign to watch: commit duration percentiles, not averages.

**Maintenance debt.** Symptom: query planning time growing week over week while data volume grows linearly. Cause: unexpired snapshots, unrewritten manifests, and thousands of small files per partition. I have seen planning time alone go from under two seconds to over forty on a table that was never compacted. Fix: schedule the four operations above and alert on file count per partition.

**Merge-on-read decay.** Symptom: read latency degrading through the day and recovering after the nightly job. Cause: delete files accumulating faster than compaction clears them. Fix: raise compaction frequency for high-churn tables, or switch those specific tables to copy-on-write if the write volume tolerates it.

**Schema drift breaking the mirror.** Symptom: the CDC job fails or, worse, silently drops a column. Cause: someone added a column to the operational table, and the analytical side did not evolve. Fix: schema evolution handled explicitly in the pipeline, plus a contract test that fails loudly. Iceberg handles column addition and rename by field ID rather than by position, which prevents the ugliest version of this, but only if the writer actually applies the change.

**Semantic drift.** Symptom: two agents give two different revenue numbers, both defensible. Cause: metric definitions living in query text rather than in a governed layer. This is the failure mode that scales worst with agents, because an agent generates SQL faster than a human reviews it. Fix: metrics defined once as governed objects, exposed to every consumer through the same interface. This is what Unity Catalog Metrics, Snowflake's semantic views and Semantic Studio, and Dremio's AI Semantic Layer are all reaching for.

**Agent-driven query storms.** Symptom: the compute bill triples in a week with no new dashboards. Cause: an agent loop that issues a query per reasoning step, with retries. Fix: result caching, query cost limits per agent identity, and materialized aggregates for the questions agents actually ask. Give agents their own identity in the catalog so you can attribute and cap the spend.

**Federation used as a replication substitute.** Symptom: the source operational database gets slow during business hours. Cause: analytical queries hitting production Postgres through a federation connector because nobody wanted to build the mirror. Fix: replicate the hot tables, federate the cold ones, and set a query timeout on federated sources so an agent cannot take down the order system with a bad join.

## The Path Nobody Sells You

Every architecture in this article can be assembled from open components. That path is real, it is well trodden, and it deserves a fair description rather than a straw man.

The stack looks like this. Postgres or MySQL as the operational store. Debezium reading the write-ahead log, feeding Apache Kafka or Redpanda. Apache Flink or Spark Structured Streaming applying the merge into Apache Iceberg tables. Apache Polaris or Lakekeeper as the Iceberg REST catalog, providing multi-catalog management, role-based access control, and credential vending. Object storage from MinIO, Apache Ozone, or a cloud provider. Trino, Spark, DuckDB, Apache DataFusion, ClickHouse, or StarRocks as query engines, each pointed at the same catalog. dbt or SQLMesh for transformation. Apache Airflow or Dagster for orchestration. OpenLineage for lineage, OpenMetadata or Apache Gravitino for the metadata layer.

Every one of those projects is production quality. Companies run all of it at petabyte scale today. The Iceberg REST specification is what makes the assembly work, because it lets you swap the engine without rewriting the storage layer and swap the catalog without rewriting the engines.

What you are signing up for is the integration surface. Roughly speaking: version compatibility across Iceberg library versions in five different engines, a maintenance scheduler that nobody ships for you, an upgrade path for the catalog that does not break the running writers, credential vending wired to your identity provider, a monitoring stack that can tell you why planning got slow, and enough Flink expertise on staff to debug a stateful job at 2 a.m. That is a platform team, not a side project. Two to four engineers is the honest floor for a serious deployment, and those engineers need to stay.

The tradeoff is straightforward and worth stating without spin. Assembling it yourself gives you complete control over cost, placement, and upgrade timing, no per-query pricing, no vendor deprecation schedule, and genuine portability. Buying it gives you those engineers back and a support contract when the catalog wedges. Organizations that already run serious platform engineering and have opinions about their infrastructure do well on the open path. Organizations whose data team is four analysts and a contractor do not, and the failure shows up eighteen months in as an unmaintained lakehouse nobody trusts.

The middle path is the most common one in practice and the least discussed: open formats and an open catalog, with a commercial engine and commercial table maintenance on top. Because the data sits in Iceberg under a REST catalog you control, the exit cost is the cost of pointing a different engine at the same catalog. That is a meaningfully different position than a proprietary storage format, and it is the reason the format question mattered so much in the first place.

## Choosing, and What to Watch Next

A few practical filters.

If most of your high-value operational data already lives in one vendor's system of record, the integration story from that vendor starts with an advantage that is hard to replicate, because it carries business semantics that a generic pipeline reconstructs poorly.

If your workload is genuinely multi-engine, with data science on Spark, dashboards on one engine, and embedded analytics on another, weight the catalog more heavily than the engine. The catalog is the piece that determines whether the multi-engine story works or collapses into per-engine copies.

If your freshness requirement is seconds rather than minutes, look hard at the serving layer specifically. Sub-second serving on lakehouse storage is the newest capability in every one of these stacks, and new capabilities carry the most surprises.

If a regulator has opinions about where your data lives, federation and on-premises support move to the top of the list, and the answer changes: several of these platforms only recently extended to on-premises storage through sharing protocols.

Three things to watch through the rest of 2026. First, whether managed transactional storage in open formats actually stays readable by outside engines, or whether "open format" turns out to mean open bytes behind a closed control plane. The Iceberg REST catalog is the test: if an external engine can plan and commit against those tables with vended credentials, the openness is real. Second, whether tabular foundation models earn a place next to language models in enterprise agents, because prediction over structured data is most of what these systems are actually asked to do. Third, the Iceberg v4 work on commit efficiency, which determines how close streaming ingestion gets to true continuous freshness without a separate serving tier.

## Operating It: Sizing, Monitoring, and the Order of Migration

Architecture diagrams do not tell you how many tables to move first or what to put on a dashboard. Here is the operational shape of these systems as they run in practice.

**Size the mirror by change rate, not table size.** A one-terabyte dimension table that changes a thousand rows a day costs almost nothing to keep current. A fifty-gigabyte events table taking twenty thousand writes a minute dominates the pipeline. Rank every candidate table by rows changed per hour, and plan compute against the top of that list. The initial snapshot is a separate sizing exercise, and it is usually the one that surprises people: backfilling a large table through the same path the incremental stream uses saturates it for hours.

**Set freshness targets per table, not per platform.** Reference data on a daily refresh is fine. Order status needs seconds. Financial close data needs correctness more than speed. Writing one number on the whole platform forces you to pay streaming prices for daily data, and I have watched that single decision double a platform bill with no user-visible improvement.

**Instrument four numbers and alert on all of them.** End-to-end lag from source commit to queryable, measured by writing a heartbeat row and timing its arrival. Data file count per partition, which predicts planning time better than any other single metric. Snapshot count per table, which tells you whether expiration is keeping up. Commit failure rate, which tells you about contention before users feel it. Every one of those has a threshold you can pick in an afternoon and a runbook you can write in a day.

**Give agents their own identities.** Not a shared service account. A catalog principal per agent or per agent role, with its own grants, its own credential vending scope, and its own query attribution. This costs an hour to set up and pays for itself the first time you need to answer why the compute bill moved, or which system read a table it should not have. Access rules enforced during scan planning at the catalog, rather than inside each engine, hold no matter which engine or agent asks. That property is what makes multi-engine governance work at all.

**Migrate in this order.** Start with one high-value, moderate-churn table that a real team depends on, and run the old pipeline and the new path side by side with a reconciliation query comparing row counts and checksums by partition. Second, move the tables that feed the metrics people argue about, because the semantic layer work is where the real value shows up. Third, move the high-churn tables, once you have learned what your compaction cadence needs to be. Federate the long tail and leave it federated. Retire the old pipeline only after two full close cycles pass without a discrepancy.

**Budget for maintenance compute explicitly.** Compaction, manifest rewriting, and snapshot expiration burn real compute, often ten to twenty percent of query compute on write-heavy tables. Teams that do not budget for it either skip maintenance, which degrades queries, or discover it as an unexplained line item. On managed platforms this cost is bundled and invisible until it is not, which is a reason to ask directly how table maintenance is priced before signing.

## What Agents Change About the Access Pattern

Most of this architecture makes sense for human analytics too. The reason it became urgent is that agents break four assumptions that human-facing systems relied on.

Humans ask few questions. An analyst runs maybe fifty queries a day and thinks between them. An agent runs fifty queries in a minute during a single reasoning chain, and it retries when a query fails. Concurrency assumptions built for a hundred analysts do not survive a hundred agents.

Humans tolerate ambiguity. Show an analyst two revenue numbers and they notice, ask, and reconcile. An agent picks one and proceeds to act on it. This is why the semantic layer stops being a convenience and becomes a correctness requirement. A governed metric definition is the only thing standing between an ambiguous schema and a confidently wrong automated decision.

Humans work in one interface. Agents move across interfaces, and the same agent reaches a SQL engine, an object store, a REST catalog, and a vector index in one task. Access control that lives in the BI tool does not survive that. It has to live where the data is described, which is the catalog, and it has to be enforced at planning time.

Humans read stale data and know it is stale. A dashboard says "as of 6 a.m." and everyone adjusts. An agent taking an action has no such context unless you give it one. Exposing data freshness as a queryable property, and having agents check it before acting, is a small piece of engineering that prevents a large class of embarrassing outcomes. Iceberg snapshot metadata makes this straightforward: the commit timestamp of the current snapshot is the freshness of the table, and it costs one metadata read to check.

Those four shifts explain why the vendor strategies all converged on the same layers at the same time. It was not fashion. Agents made the old latency and governance tradeoffs untenable, and the acquisitions followed.

## Conclusion

The gap between the database that runs the business and the platform that explains it is not a technology gap anymore. Every layer needed to close it exists and is shipping. What the three big acquisition sprees represent is a bet on who assembles those layers into something an ordinary enterprise team operates without a dedicated staff of specialists.

Databricks is betting the storage layer should be one thing. Snowflake is betting the operational database should stay recognizably itself while the catalog does the unifying. SAP is betting that meaning is the scarce resource, and that federated access without business semantics gets you to a wrong answer faster. The hyperscalers are running variants of all three with their own storage as the anchor.

What makes this moment different from the HTAP wave of the 2010s is that the storage format is shared. Apache Iceberg, the Iceberg REST catalog, Apache Parquet, and Apache Arrow belong to no single vendor. That gives buyers something they did not have in the last cycle: the ability to pick a platform for its operational qualities while keeping the data in a format the next platform reads. Use it. Ask every vendor in the evaluation to demonstrate an outside engine reading and writing their managed tables through the REST catalog, with credentials vended by the catalog. The ones who can do it live have built the open thing. The ones who need a follow-up call have built the other thing.

The pipeline was never the product. The sooner it stops consuming a third of your data team, the sooner that team works on questions that matter.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and the systems that connect operational data to analytics.
*Architecting an Apache Iceberg Lakehouse* (Manning) covers the storage, catalog, and maintenance decisions behind everything described here in far more depth, including the ingestion patterns and table layout choices that determine whether a lakehouse stays fast.
You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at
[books.alexmerced.com](https://books.alexmerced.com).
