---
title: "Connect Amazon S3 to Dremio Cloud: Query Your Data Lake with SQL, Federation, and AI"
date: "2026-03-01"
description: "Amazon S3 is the default landing zone for data in the cloud. Log files, Parquet datasets, CSV exports, JSON events, IoT telemetry, and raw data dumps — it ..."
author: "Alex Merced"
category: "Dremio Connectors"
bannerImage: "./images/connector-blogs/07/banner.png"
tags:
  - dremio
  - data integration
  - connectors
  - data lakehouse
  - federated queries
---

Amazon S3 is the default landing zone for data in the cloud. Log files, Parquet datasets, CSV exports, JSON events, IoT telemetry, and raw data dumps — it all ends up in S3 buckets. But S3 is storage, not an analytics engine. You can't run SQL against S3 natively. To query it, you need Amazon Athena (per-TB pricing), AWS Glue ETL jobs (cluster management), or a data warehouse that imports the data. All add cost, complexity, and latency.

Dremio Cloud connects directly to S3 and lets you query files in place using standard SQL. Dremio reads Parquet, CSV, JSON, Delta Lake, and Apache Iceberg table formats. It pushes projection and filter operations into its vectorized query engine and caches frequently accessed data on local NVMe drives (Columnar Cloud Cache, or C3) for near-instantaneous repeat queries.

For organizations with hundreds or thousands of S3 buckets accumulated over years, data lake sprawl is a major challenge. Data lands in S3 from application logs, CDC pipelines, third-party integrations, and manual uploads — often without consistent naming conventions, schemas, or documentation. Dremio provides the organizational layer: connect S3 buckets, create views that standardize column names and types, build a semantic layer with wiki descriptions, and expose clean datasets to analysts and AI tools. This turns an unstructured "data swamp" into a governed, queryable data lake.

## Why S3 Users Need Dremio

### SQL on Your Data Lake Without Athena Costs

Athena charges per terabyte of data scanned. For large datasets queried frequently — dashboards refreshing every 15 minutes, analysts exploring data, scheduled reports — costs grow unpredictably. Dremio's Reflections pre-compute results so repeated queries don't re-scan S3. C3 caching further reduces S3 GET requests. You pay for Dremio compute time, not per-TB scanned.

### Format Flexibility

Dremio reads Parquet, CSV, JSON, Avro, Delta Lake, and Apache Iceberg from S3. You don't need to convert everything to one format before querying. Mixed-format data lakes work out of the box.

### Federation with Databases and Warehouses

Your event data is in S3, but your customer data is in PostgreSQL, your financial data is in Snowflake, and your marketing data is in BigQuery. Dremio joins across all of them in a single SQL query without copying data between systems.

### Apache Iceberg Table Management

Create Iceberg tables in Dremio's Open Catalog (backed by S3 or Dremio-managed storage) with full DML support. Dremio automatically handles compaction (merging small files), manifest rewriting, clustering, and vacuuming — no manual `OPTIMIZE` jobs needed.

### AI on S3 Data

Dremio's AI Agent, MCP Server, and AI SQL Functions make your raw S3 files queryable by business users and external AI tools — no data engineering required.

## Prerequisites

- **AWS Account** with S3 access
- **IAM Role or Access Key/Secret Key** with `s3:GetObject`, `s3:ListBucket`, and `s3:GetBucketLocation` permissions
- **Bucket names** or specific paths you want to query
- **Dremio Cloud account** — [sign up free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-amazon-s3-dremio-cloud&utm_content=alexmerced) with $400 in compute credits

## Step-by-Step: Connect S3 to Dremio Cloud

### 1. Add the Source

Click **"+"** and select **Amazon S3**.

### 2. Configure Connection

- **Name:** Descriptive identifier (e.g., `s3-datalake` or `event-logs`).
- **Authentication:** IAM Role ARN (recommended) or Access Key/Secret Key.

### 3. Configure Advanced Options

| Setting | Purpose | When to Use |
|---|---|---|
| **Root Path** | Starting path in the bucket | Restrict to subfolder: `/data/analytics/` |
| **Allowlisted Buckets** | Limit which buckets appear | Multi-bucket accounts |
| **Enable partition column inference** | Extract partition keys from folders | Hive-style partitioned data |
| **Default CTAS Format** | CREATE TABLE format | Iceberg recommended |
| **Encrypt Connection** | Enable SSL | Always recommended |
| **Requester Pays** | For requester-pays buckets | Cross-account access |
| **Enable compatibility mode** | S3-compatible storage | MinIO, R2, etc. |
| **Connection Properties** | Custom settings | `fs.s3a.endpoint` for non-AWS |

### 4. Set Reflection and Metadata Refresh, then Save

## Query S3 Data

```sql
-- Query Parquet files
SELECT event_type, user_id, event_timestamp, page_url
FROM "s3-datalake".events."user_events.parquet"
WHERE event_type = 'purchase' AND event_timestamp > '2024-01-01';

-- Query partitioned data (e.g., year=2024/month=01/)
SELECT region, product_category, SUM(revenue) AS total_revenue
FROM "s3-datalake".sales.transactions
GROUP BY region, product_category
ORDER BY total_revenue DESC;
```

## Federate S3 with Other Sources

```sql
SELECT
  c.customer_name,
  c.segment,
  COUNT(e.event_id) AS s3_events,
  SUM(CASE WHEN e.event_type = 'purchase' THEN e.revenue ELSE 0 END) AS s3_revenue,
  pg.lifetime_value AS crm_lifetime_value
FROM "postgres-crm".public.customers c
LEFT JOIN "s3-datalake".events.user_events e ON c.customer_id = e.user_id
LEFT JOIN "postgres-crm".public.customer_metrics pg ON c.customer_id = pg.customer_id
GROUP BY c.customer_name, c.segment, pg.lifetime_value
ORDER BY s3_revenue DESC;
```

## Create Iceberg Tables from S3 Data

Promote raw S3 files into managed Iceberg tables:

```sql
CREATE TABLE analytics.bronze.clean_events AS
SELECT event_type, user_id, CAST(event_timestamp AS TIMESTAMP) AS event_time, page_url, revenue
FROM "s3-datalake".events."user_events.parquet"
WHERE event_type IS NOT NULL;
```

The Iceberg table benefits from automatic compaction, time travel, results caching, and Autonomous Reflections.

## S3-Compatible Storage

Dremio's S3 connector works with S3-compatible storage:

- **MinIO:** Enable compatibility mode, set `fs.s3a.endpoint` to your MinIO endpoint.
- **Cloudflare R2:** Same pattern, with R2's S3-compatible endpoint.
- **DigitalOcean Spaces:** Compatibility mode + custom endpoint.
- **Amazon FSx for NetApp ONTAP:** Set the S3 Access Point alias as the root path, ensure IAM permissions include FSx-specific actions.

## Build a Semantic Layer

```sql
CREATE VIEW analytics.gold.event_metrics AS
SELECT
  DATE_TRUNC('day', CAST(event_timestamp AS TIMESTAMP)) AS event_date,
  event_type,
  COUNT(*) AS event_count,
  COUNT(DISTINCT user_id) AS unique_users,
  SUM(revenue) AS daily_revenue,
  CASE
    WHEN COUNT(*) > 10000 THEN 'High Activity'
    WHEN COUNT(*) > 1000 THEN 'Normal Activity'
    ELSE 'Low Activity'
  END AS activity_level
FROM "s3-datalake".events.user_events
GROUP BY 1, 2;
```

In the **Catalog**, click **Edit** → **Generate Wiki** and **Generate Tags**.

## AI-Powered Analytics on S3 Data

### Dremio AI Agent

Ask "What's our daily purchase revenue trend this month?" and the AI Agent generates SQL from your semantic layer. The wiki descriptions guide the Agent's understanding of event types and metrics.

### Dremio MCP Server

Connect [Claude or ChatGPT](https://github.com/dremio/dremio-mcp) to your S3 data:

1. Create a Native OAuth app in Dremio Cloud
2. Configure redirect URLs
3. Connect via `mcp.dremio.cloud/mcp/{project_id}`

A product analyst asks Claude "Analyze user engagement patterns from S3 event data this week" and gets governed results.

### AI SQL Functions

```sql
-- Classify events with AI
SELECT
  event_type,
  event_count,
  AI_CLASSIFY(
    'Based on this event pattern, classify the business impact',
    'Event: ' || event_type || ', Count: ' || CAST(event_count AS VARCHAR) || ', Revenue: $' || CAST(daily_revenue AS VARCHAR),
    ARRAY['Revenue Driver', 'Engagement Signal', 'Support Indicator', 'Churn Signal']
  ) AS business_impact
FROM analytics.gold.event_metrics
WHERE event_date = CURRENT_DATE - INTERVAL '1' DAY;

-- Process unstructured data from S3
SELECT
  file['path'] AS file_path,
  AI_GENERATE(
    'Extract key information from this document',
    ('Summarize the main topics in this file', file)
    WITH SCHEMA ROW(summary VARCHAR, category VARCHAR)
  ) AS extracted_info
FROM TABLE(LIST_FILES('@"s3-datalake"/documents/'))
WHERE file['path'] LIKE '%.pdf';
```

`AI_GENERATE` with file references can process unstructured documents (PDFs, images) stored in S3 directly in SQL queries.

## Reflections and C3 Caching

For frequently queried S3 data, Dremio provides two layers of acceleration:

**Reflections** pre-compute query results. Create them on your semantic layer views:

1. In the **Catalog**, navigate to the view
2. Click the **Reflections** tab
3. Choose Raw or Aggregation Reflections
4. Select columns and set the refresh interval
5. Click **Save**

**C3 (Columnar Cloud Cache)** automatically caches frequently accessed file data on local NVMe drives. C3 works transparently — no configuration needed. When Dremio reads S3 files, it caches the columnar data locally. Subsequent reads of the same files come from NVMe instead of S3, eliminating S3 GET request costs and latency.

Together, Reflections and C3 mean that frequently executed queries against S3 data run in milliseconds, not seconds.

## Governance on S3 Data

S3 has bucket-level IAM policies, but no column-level masking or row-level filtering. Dremio's Fine-Grained Access Control (FGAC) adds these capabilities:

- **Column masking:** Mask PII fields (email, IP, user ID) from specific roles. Data engineers see everything; marketing analysts see aggregated metrics only.
- **Row-level filtering:** Restrict data by user role. Regional analysts see only their region's events.
- **Unified policies:** Same governance applies across S3, PostgreSQL, Snowflake, and all other sources.

These policies apply across SQL Runner, BI tools (Arrow Flight/ODBC), AI Agent, and MCP Server.

## Connect BI Tools via Arrow Flight

Arrow Flight provides 10-100x faster data transfer than JDBC/ODBC:

- **Tableau:** Dremio connector for direct Arrow Flight access
- **Power BI:** Dremio ODBC driver or native connector
- **Python/Pandas:** `pyarrow.flight` for programmatic access
- **Looker:** Connect via JDBC
- **dbt:** `dbt-dremio` adapter for transformation workflows

All queries benefit from Reflections, governance, and the semantic layer.

## VS Code Copilot Integration

Dremio's VS Code extension with Copilot lets developers query S3 data from their IDE. Ask Copilot "Show me purchase event trends from S3 data this week" and get SQL generated using your semantic layer.

## S3 Data Organization Best Practices

How you organize data in S3 directly impacts Dremio's query performance:

### Partition Strategy

Hive-style partitions (`year=2024/month=01/day=15/`) enable Dremio to skip irrelevant partitions during query planning. The right partition key depends on your query patterns:

- **Time-based queries:** Partition by `year/month/day` or `year/month`. Dremio reads only the partitions matching your `WHERE` clause.
- **Regional queries:** Partition by `region/date` for multi-region datasets.
- **Mixed access:** Partition by the most common filter column first (e.g., `region/year/month`).

Avoid over-partitioning (too many small files per partition) or under-partitioning (too few partitions with huge files). Aim for partition sizes between 128 MB and 1 GB.

### File Format Recommendations

| Format | Best For | Dremio Support |
|---|---|---|
| **Parquet** | Structured analytics data | Full support, columnar optimization |
| **Apache Iceberg** | ACID transactions, time travel | Full read/write support |
| **Delta Lake** | Databricks ecosystem compatibility | Read support |
| **JSON** | Semi-structured event data | Full support, schema inference |
| **CSV** | Legacy data imports | Full support, limited performance |
| **Avro** | Schema-evolved event streams | Read support |

For analytical workloads, convert CSV and JSON files to Parquet or Iceberg for 10-50x better query performance. Dremio can perform this conversion:

```sql
CREATE TABLE analytics.bronze.events_optimized AS
SELECT * FROM "s3-datalake".raw."events.csv";
```

This creates an Iceberg table from CSV data, giving you columnar storage, automatic compaction, and time travel.

### Data Lake Layers

Organize your S3 bucket with a medallion architecture:

- **`raw/`** — Landing zone for incoming data (CSV, JSON, Parquet from external sources)
- **`bronze/`** — Cleaned, typed versions of raw data (Iceberg tables)
- **`silver/`** — Joined, deduplicated, enriched datasets
- **`gold/`** — Business-ready views and aggregations for the semantic layer

Dremio's SQL engine handles the transformations between layers using `CREATE TABLE AS SELECT` and `MERGE` statements — no external ETL tools needed.

## When to Use S3 vs. Other Storage

**Use S3 when:** Your data originates in AWS, you need cost-effective long-term storage, you want to use Apache Iceberg tables, your data is in file formats (Parquet, JSON, CSV).

**Use managed databases when:** Your data requires real-time OLTP operations, your applications need row-level transactions, your data model is heavily relational.

Dremio federates across both — S3 for your data lake and databases for operational data, in a single query.

## Get Started

Amazon S3 is the most common data lake storage layer. Dremio Cloud turns it into a queryable, federated, AI-ready analytics platform without Athena costs or data warehouse ETL. Whether your S3 data is in Parquet, CSV, JSON, or Iceberg format, Dremio reads it directly and makes it available for SQL queries, cross-source joins, and AI-powered analytics.

Start by connecting your primary S3 bucket to Dremio Cloud. Create views that standardize your data into business-friendly structures, add wiki descriptions for the AI Agent, and build Reflections on frequently accessed datasets. Within hours, your S3 data lake transforms from raw file storage into a governed, AI-ready analytical platform. No infrastructure to manage and no data to move.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-amazon-s3-dremio-cloud&utm_content=alexmerced) and connect your S3 buckets.
