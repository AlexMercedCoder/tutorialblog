---
title: "Connect Azure Storage to Dremio Cloud: Query Your Microsoft Data Lake with SQL and AI"
date: "2026-03-01"
description: "Azure Storage is Microsoft's cloud storage platform, spanning Blob Storage, Azure Data Lake Storage Gen2 (ADLS Gen2), and Azure Files. If your organization u..."
author: "Alex Merced"
category: "Dremio Connectors"
bannerImage: "./images/connector-blogs/08/banner.png"
tags:
  - dremio
  - data integration
  - connectors
  - data lakehouse
  - federated queries
---

Azure Storage is Microsoft's cloud storage platform, spanning Blob Storage, Azure Data Lake Storage Gen2 (ADLS Gen2), and Azure Files. If your organization uses Microsoft Azure, your data lake almost certainly lives in Azure Storage — Parquet files from Azure Data Factory pipelines, CSV exports from Azure SQL Database, JSON event streams from Azure Event Hubs, and raw data from Azure IoT Hub all land in Azure Storage containers.

Dremio Cloud connects directly to Azure Storage and lets you query these files in place using standard SQL. You don't need Azure Synapse Analytics (DWU-based pricing), Azure Databricks (DBU costs), or HDInsight (cluster management) to run analytical queries against your data lake. Dremio reads the data, accelerates repeated queries with Reflections, and federates Azure Storage with every other source in your data ecosystem.

Many Azure customers face a fragmented analytics experience: Synapse for warehouse workloads, Databricks for data engineering, Power BI for visualization, and Azure Data Explorer for log analytics — each with its own pricing model, access control, and query interface. Dremio consolidates the analytical layer by querying Azure Storage and other Azure (or non-Azure) services from a single SQL engine with unified governance and AI capabilities. Dremio reads Parquet, CSV, JSON, Delta Lake, and Apache Iceberg table formats from Azure Blob Storage and ADLS Gen2 containers. It pushes projection and filtering into its vectorized query engine and caches frequently accessed data on local NVMe drives (Columnar Cloud Cache, or C3) for near-instantaneous repeat queries.

## Why Azure Storage Users Need Dremio

### SQL Without Azure Synapse Costs

Azure Synapse serverless SQL charges per terabyte of data processed. For large datasets queried frequently — dashboard refreshes, ad-hoc exploration, scheduled reports — costs accumulate quickly. Dremio's Reflections eliminate repeat scans by caching pre-computed results. C3 caching further reduces Azure Storage API calls for frequently accessed files. Your first query scans Azure Storage; subsequent matching queries hit Dremio's cache.

### Federation Beyond Azure

Your Azure data lake holds event data and ETL outputs, but your operational database is in PostgreSQL on AWS, your marketing data is in Google BigQuery, and your CRM is in Salesforce (exported to S3). Dremio federates across all three cloud providers in a single SQL query — no ADF (Azure Data Factory) pipelines needed.

### Apache Iceberg Table Management

Create Iceberg tables backed by Azure Storage (or Dremio-managed storage) with full DML support (INSERT, UPDATE, DELETE, MERGE). Dremio automatically handles compaction, manifest rewriting, clustering, and vacuuming. No manual `OPTIMIZE` jobs, no maintenance scripts.

### AI on Azure Data

Dremio's AI Agent, MCP Server, and AI SQL Functions make your Azure data queryable by non-technical users and external AI tools. Build a semantic layer over your Azure files, and let AI do the heavy lifting.

## Prerequisites

- **Azure Storage Account** with Blob Storage or ADLS Gen2 enabled
- **Authentication:** Azure Active Directory OAuth 2.0, Shared Access Key, or Shared Access Signature (SAS) Token
- **Container names** you want to query
- **Network access** from Dremio Cloud to Azure Storage endpoints
- **Dremio Cloud account** — [sign up free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-azure-storage-dremio-cloud&utm_content=alexmerced) with $400 in compute credits

## Step-by-Step: Connect Azure Storage to Dremio Cloud

### 1. Add the Source

Click **"+"** in the Dremio console and select **Azure Storage**.

### 2. Configure Connection Details

- **Name:** Descriptive identifier (e.g., `azure-datalake` or `adls-analytics`).
- **Account:** Your Azure Storage account name.

### 3. Set Authentication

Choose from:
- **Azure AD (OAuth 2.0):** Most secure, uses service principal or managed identity.
- **Shared Access Key:** Full access to the storage account. Simpler but less granular.
- **SAS Token:** Scoped, time-limited access.

### 4. Configure Advanced Options

| Setting | Purpose | Default |
|---|---|---|
| **Root Path** | Starting container/path | `/` (all containers) |
| **CTAS Format** | Default CREATE TABLE format | Iceberg recommended |
| **Encrypt Connection** | Enable HTTPS | On |
| **Enable partition column inference** | Extract partition keys from folder structures | Off |
| **Enable file status check** | Verify file existence before reads | On |

### 5. Set Reflection and Metadata Refresh, then Save

## Query Azure Storage Data

```sql
-- Query Parquet files directly
SELECT transaction_id, customer_id, amount, transaction_date
FROM "azure-datalake".sales."transactions.parquet"
WHERE transaction_date >= '2024-01-01' AND amount > 100
ORDER BY amount DESC;

-- Query partitioned data (Hive-style partitions)
SELECT region, product_category, SUM(revenue) AS total_revenue
FROM "azure-datalake".sales.transactions
WHERE year = '2024' AND quarter = 'Q1'
GROUP BY region, product_category
ORDER BY total_revenue DESC;
```

## Federate with Other Clouds

```sql
-- Join Azure data with AWS and Google Cloud sources
SELECT
  c.customer_name,
  c.segment,
  SUM(a.amount) AS azure_revenue,
  COUNT(s.event_id) AS aws_events,
  bq.campaign_clicks
FROM "postgres-crm".public.customers c
LEFT JOIN "azure-datalake".sales.transactions a ON c.customer_id = a.customer_id
LEFT JOIN "s3-events".analytics.user_events s ON c.customer_id = s.user_id
LEFT JOIN "bigquery-marketing".analytics.customer_clicks bq ON c.customer_id = bq.user_id
GROUP BY c.customer_name, c.segment, bq.campaign_clicks
ORDER BY azure_revenue DESC;
```

Four clouds, one query.

## Build a Semantic Layer

```sql
CREATE VIEW analytics.gold.customer_transactions AS
SELECT
  a.customer_id,
  a.transaction_date,
  a.amount,
  CASE
    WHEN a.amount > 1000 THEN 'High Value'
    WHEN a.amount > 100 THEN 'Standard'
    ELSE 'Micro'
  END AS transaction_tier,
  DATE_TRUNC('month', a.transaction_date) AS transaction_month
FROM "azure-datalake".sales.transactions a
WHERE a.transaction_date >= '2024-01-01';
```

In the **Catalog**, click **Edit** (pencil icon) → **Generate Wiki** and **Generate Tags**.

## AI-Powered Analytics on Azure Data

### Dremio AI Agent

Ask questions in plain English: "What's our total revenue from high-value transactions this quarter?" The AI Agent reads your wiki descriptions and generates accurate SQL against your Azure data.

### Dremio MCP Server

Connect [Claude or ChatGPT](https://github.com/dremio/dremio-mcp) to your Azure data:

1. Create a Native OAuth app in Dremio Cloud
2. Configure redirect URLs
3. Connect using `mcp.dremio.cloud/mcp/{project_id}`

An operations team member can ask Claude "Show me a summary of our Azure sales data by region this month" — no SQL required.

### AI SQL Functions

```sql
-- Classify transactions with AI
SELECT
  transaction_id,
  amount,
  AI_CLASSIFY(
    'Based on this transaction, classify the likely purchase category',
    'Amount: $' || CAST(amount AS VARCHAR) || ', Date: ' || CAST(transaction_date AS VARCHAR),
    ARRAY['Subscription', 'One-Time Purchase', 'Refund', 'Upgrade']
  ) AS inferred_category
FROM "azure-datalake".sales.transactions
WHERE transaction_date = CURRENT_DATE;

-- Generate data quality summaries
SELECT
  transaction_month,
  COUNT(*) AS total_transactions,
  AI_GENERATE(
    'Write a one-sentence summary of this month data quality',
    'Transactions: ' || CAST(COUNT(*) AS VARCHAR) || ', Avg Amount: $' || CAST(ROUND(AVG(amount), 2) AS VARCHAR) || ', Nulls: ' || CAST(SUM(CASE WHEN customer_id IS NULL THEN 1 ELSE 0 END) AS VARCHAR)
  ) AS quality_summary
FROM analytics.gold.customer_transactions
GROUP BY transaction_month;
```

## Create Iceberg Tables from Azure Data

Promote raw Azure files into managed Iceberg tables with full ACID transaction support:

```sql
CREATE TABLE analytics.bronze.azure_events AS
SELECT event_type, user_id, CAST(event_timestamp AS TIMESTAMP) AS event_time, payload
FROM "azure-datalake".events."raw_events.parquet"
WHERE event_type IS NOT NULL;
```

Iceberg tables benefit from automatic compaction, time travel, results caching, and Autonomous Reflections. You can also use time travel to query historical states:

```sql
-- Query as table existed 7 days ago
SELECT * FROM analytics.bronze.azure_events
AT TIMESTAMP '2024-06-01 00:00:00';
```

## Governance on Azure Data

Dremio's Fine-Grained Access Control (FGAC) adds governance capabilities that Azure Storage doesn't provide natively:

- **Column masking:** Mask PII fields (email, IP address, user ID) from specific roles. Marketing analysts see aggregated metrics but not individual user data.
- **Row-level filtering:** Automatically filter data by the querying user's role. A regional manager sees only their region's Azure data.
- **Unified policies:** Same governance applies whether data comes from Azure Storage, PostgreSQL, BigQuery, or any other connected source.

These policies apply across SQL Runner, BI tools (via Arrow Flight/ODBC), AI Agent queries, and MCP Server interactions.

## Connect BI Tools via Arrow Flight

Dremio's Arrow Flight connector provides 10-100x faster data transfer than JDBC/ODBC. After building views over your Azure data:

- **Power BI:** Use Dremio's native connector or ODBC driver — ideal for Azure-centric organizations
- **Tableau:** Use the Dremio connector for direct Arrow Flight access
- **Python/Pandas:** Use `pyarrow.flight` for high-speed data access
- **dbt:** Use `dbt-dremio` adapter for SQL-based transformations
- **Looker:** Connect via JDBC

All queries benefit from Reflections, governance, and the semantic layer.

## VS Code Copilot Integration

Dremio's VS Code extension with Copilot integration lets developers query Azure data directly from their IDE. Ask Copilot "Show me daily transaction trends from Azure storage" and it generates SQL using your semantic layer — without leaving your development environment.

## Reflections and C3 Caching

For frequently queried Azure Storage data, create Reflections to pre-compute results:

1. Navigate to the view in the Catalog
2. Click the **Reflections** tab and create a Raw or Aggregation Reflection
3. Select columns and set the refresh interval

C3 (Columnar Cloud Cache) automatically caches frequently accessed file data on local NVMe drives for sub-second access. You don't configure C3 manually — it works transparently.

## When to Keep Data in Azure Storage vs. Migrate to Iceberg

**Keep as raw files:** Data landing zones for Azure Data Factory, files consumed by Azure-native services (Databricks, Synapse, Azure ML), raw data in formats required by other tools.

**Migrate to Iceberg tables:** Analytical datasets consumed by SQL queries, data that benefits from ACID transactions and time travel, historical data needing snapshot management, datasets consumed by BI tools and AI agents.

For raw Azure files, query through the connector and create manual Reflections. For Iceberg tables (either in Dremio's Open Catalog or external catalogs), Dremio provides automated compaction, Autonomous Reflections, and zero-maintenance performance optimization.

## Azure Storage Tiers and Dremio Performance

Azure Storage offers multiple access tiers that affect query performance:

| Tier | Access Latency | Cost | Dremio Recommendation |
|---|---|---|---|
| **Hot** | Milliseconds | Highest storage, lowest access | Active analytics data — best performance |
| **Cool** | Milliseconds | Lower storage, higher access | Infrequent queries — still fast |
| **Cold** | Milliseconds | Even lower storage, higher access | Archival analytics — acceptable latency |
| **Archive** | Hours (rehydrate required) | Lowest storage, highest access | Not suitable for Dremio queries — rehydrate first |

For optimal Dremio performance, keep analytical data in Hot or Cool tiers. Use Azure lifecycle management policies to automatically transition data between tiers based on last access time.

## ADLS Gen2 vs. Blob Storage

Dremio's Azure Storage connector supports both Azure Data Lake Storage Gen2 (ADLS Gen2) and Azure Blob Storage:

**ADLS Gen2** is the recommended option for analytical workloads:
- Hierarchical namespace enables true directory operations (faster metadata operations)
- Fine-grained POSIX-like permissions for directory and file-level access
- Optimized for large-scale analytics workloads
- Required for Iceberg table creation and Azure Synapse integration

**Azure Blob Storage** works for read-only access to existing file datasets but lacks hierarchical namespace features.

When creating your Azure Storage source in Dremio, specify the storage account and container. For ADLS Gen2 accounts, Dremio automatically uses the `abfss://` protocol for optimized access.

## Azure-Specific Integration Patterns

### Azure Data Factory + Dremio

Azure Data Factory (ADF) lands data into Azure Storage containers. Dremio queries this data in place:

1. ADF pipelines extract from Azure SQL, Cosmos DB, or external APIs
2. ADF writes Parquet files to ADLS Gen2 containers
3. Dremio queries the Parquet files via the Azure Storage connector
4. Dremio creates Iceberg tables from the Parquet data for optimized analytics

### Azure Synapse + Dremio + Azure Storage

Connect both Azure Synapse and Azure Storage to Dremio Cloud. Dremio federates data across both:
- Synapse contains summarized, modeled data
- Azure Storage contains raw files and Iceberg tables
- Dremio joins both sources in a single query

This eliminates the need to load all Azure Storage data into Synapse, reducing Synapse DWU consumption and costs.

## Get Started

Azure Storage users can query their cloud data lake with SQL, federate with other sources, build a semantic layer, and enable AI analytics — all without data movement or ETL pipelines.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-azure-storage-dremio-cloud&utm_content=alexmerced) and connect your Azure Storage accounts alongside your other data sources.
