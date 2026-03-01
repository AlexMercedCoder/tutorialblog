---
title: "Connect Databricks Unity Catalog to Dremio Cloud: Query Delta Lake Tables with Federation and AI"
date: "2026-03-01"
description: "Databricks Unity Catalog is Databricks' governance layer for data and AI assets. It manages Delta Lake tables, machine learning models, feature stores, and o..."
author: "Alex Merced"
category: "Dremio Connectors"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - dremio
  - data integration
  - connectors
  - data lakehouse
  - federated queries
---

Databricks Unity Catalog is Databricks' governance layer for data and AI assets. It manages Delta Lake tables, machine learning models, feature stores, and other data objects across Databricks workspaces. If your data engineering team uses Databricks for ETL and ML, your curated analytical datasets likely live in Unity Catalog as Delta Lake tables.

With UniForm, Databricks generates Iceberg-compatible metadata for Delta Lake tables, making them readable by non-Databricks engines without data conversion. This is where Dremio Cloud enters the picture: connect to Unity Catalog through the UniForm Iceberg compatibility layer and query your Delta Lake tables alongside every other data source in your organization — with federation, governance, AI analytics, and performance acceleration that Databricks alone doesn't provide.

## Why Unity Catalog Users Need Dremio

### Multi-Engine Analytics Beyond Databricks

Unity Catalog centralizes governance for Databricks. But your data consumers use tools beyond Databricks notebooks — Tableau, Power BI, custom Python applications, and business analysts who work in SQL. Dremio provides a high-performance SQL layer that serves all these tools via Arrow Flight (10-100x faster than JDBC/ODBC) or standard ODBC connections.

Instead of provisioning Databricks SQL warehouses for BI workloads (which consume Databricks Units), route those queries through Dremio where Reflections cache results and Autonomous Reflections automatically optimize query performance.

### Federate with Non-Databricks Sources

Your Delta Lake tables in Unity Catalog contain curated, processed analytics data. But your operational databases (PostgreSQL, SQL Server, Oracle) live outside Databricks. Your cloud warehouses (Snowflake, Redshift) hold other analytical datasets. Your raw files (S3, Azure Storage) contain event logs and unstructured data. Without a federation layer, combining these with Delta Lake data requires Databricks ingestion pipelines for each source.

Dremio queries each source in place and joins them in a single SQL statement — no ingestion required.

### Unified Governance Beyond Databricks

Unity Catalog governs data within Databricks. Dremio's Fine-Grained Access Control (FGAC) governs data across Unity Catalog, PostgreSQL, S3, BigQuery, and every other connected source. One set of column masking and row-level filtering policies, applied consistently everywhere.

### AI Analytics on Delta Lake Data

Dremio's semantic layer, AI Agent, MCP Server, and AI SQL Functions add capabilities that Databricks' Genie doesn't replicate — particularly for cross-source analytics and integration with external AI clients like Claude and ChatGPT.

### Credential Vending

Unity Catalog supports credential vending across AWS, Azure, and GCS. This means Dremio doesn't need separate S3 or Azure Storage credentials to access the underlying data files — the catalog provides temporary, scoped credentials automatically.

## Prerequisites

- **Databricks workspace URL** — your Databricks deployment URL (e.g., `https://mycompany.cloud.databricks.com`)
- **Personal Access Token (PAT)** or OAuth credentials for Databricks
- **UniForm enabled** on the Delta Lake tables you want to query (this generates Iceberg-compatible metadata)
- **Storage configuration** — AWS, Azure, or GCS (credential vending handles this if configured)
- **Dremio Cloud account** — [sign up free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-unity-catalog-dremio-cloud&utm_content=alexmerced) with $400 in compute credits

### Enabling UniForm on Delta Lake Tables

To make Delta Lake tables readable from Dremio, enable UniForm in Databricks:

```sql
-- In Databricks, enable UniForm when creating a table
CREATE TABLE my_catalog.my_schema.my_table (
  id BIGINT,
  name STRING,
  value DOUBLE
) TBLPROPERTIES (
  'delta.universalFormat.enabledFormats' = 'iceberg'
);

-- Or alter an existing table
ALTER TABLE my_catalog.my_schema.my_table SET TBLPROPERTIES (
  'delta.universalFormat.enabledFormats' = 'iceberg'
);
```

## Step-by-Step: Connect Unity Catalog to Dremio Cloud

### 1. Add the Source

In the Dremio console, click **"+"** and select **Unity Catalog**.

### 2. Configure Connection Details

- **Name:** A descriptive identifier (e.g., `unity-catalog` or `databricks-lakehouse`).
- **Workspace URL:** Your Databricks workspace URL.
- **Credentials:** Personal Access Token or OAuth credentials.

### 3. Select Catalogs and Schemas

Choose which Unity Catalog catalogs and schemas to expose in Dremio. Only tables with UniForm enabled will be readable.

### 4. Configure Advanced Settings

Set Reflection Refresh and Metadata schedules. More frequent metadata refreshes help Dremio discover new tables and schema changes faster.

### 5. Set Privileges and Save

Optionally restrict access, then click **Save**.

## Query Delta Lake Tables via UniForm

From Dremio's perspective, UniForm tables appear as standard Iceberg tables:

```sql
-- Query ML model predictions
SELECT
  customer_id,
  churn_probability,
  predicted_ltv,
  prediction_date
FROM "unity-catalog".ml_models.customer_predictions
WHERE churn_probability > 0.7 AND prediction_date >= '2024-06-01'
ORDER BY churn_probability DESC;
```

## Federate with Non-Databricks Sources

Join Delta Lake model outputs with operational data from other systems:

```sql
-- Combine ML predictions with CRM data and support logs
SELECT
  uc.customer_id,
  uc.churn_probability,
  uc.predicted_ltv,
  pg.customer_name,
  pg.contract_end_date,
  pg.account_manager,
  s3.last_login_date,
  s3.support_tickets_30d,
  CASE
    WHEN uc.churn_probability > 0.8 AND pg.contract_end_date < CURRENT_DATE + INTERVAL '90' DAY THEN 'Critical - Immediate Action'
    WHEN uc.churn_probability > 0.7 THEN 'High Risk - Outreach Needed'
    WHEN uc.churn_probability > 0.5 THEN 'Watch List'
    ELSE 'Healthy'
  END AS action_required
FROM "unity-catalog".ml_models.customer_predictions uc
JOIN "postgres-crm".public.customers pg ON uc.customer_id = pg.customer_id
LEFT JOIN "s3-logs".activity.user_activity s3 ON uc.customer_id = s3.user_id
WHERE uc.churn_probability > 0.5
ORDER BY uc.churn_probability DESC;
```

Three data systems (Databricks, PostgreSQL, S3), one query, and actionable churn intervention recommendations.

## Build a Semantic Layer

```sql
CREATE VIEW analytics.gold.customer_risk_dashboard AS
SELECT
  uc.customer_id,
  pg.customer_name,
  pg.region,
  uc.churn_probability,
  uc.predicted_ltv,
  CASE
    WHEN uc.predicted_ltv > 100000 THEN 'Enterprise'
    WHEN uc.predicted_ltv > 25000 THEN 'Mid-Market'
    ELSE 'SMB'
  END AS value_segment,
  CASE
    WHEN uc.churn_probability > 0.7 THEN 'High Risk'
    WHEN uc.churn_probability > 0.4 THEN 'Moderate Risk'
    ELSE 'Low Risk'
  END AS risk_tier
FROM "unity-catalog".ml_models.customer_predictions uc
JOIN "postgres-crm".public.customers pg ON uc.customer_id = pg.customer_id;
```

Navigate to the **Catalog**, click **Edit** (pencil icon), and **Generate Wiki** and **Generate Tags**. This creates business descriptions like "customer_risk_dashboard: Contains one row per customer combining ML churn predictions from Databricks with CRM account details" — context that powers AI features.

## AI-Powered Analytics on Delta Lake Data

### Dremio AI Agent

The AI Agent lets business users ask questions in plain English: "Which enterprise customers are at high risk of churning?" or "Show me our top 10 customers by predicted lifetime value." The Agent reads your wiki descriptions to understand what "enterprise," "high risk," and "lifetime value" mean in your data context, then generates accurate SQL.

This is particularly powerful for Delta Lake data because model outputs (churn scores, predictions) often need business interpretation. The semantic layer bridges the gap between ML model outputs and business-friendly analytics.

### Dremio MCP Server

The [Dremio MCP Server](https://github.com/dremio/dremio-mcp) connects Claude, ChatGPT, and other AI clients to your Dremio data. Setup:

1. Create a Native OAuth application in Dremio Cloud
2. Configure redirect URLs (e.g., `https://claude.ai/api/mcp/auth_callback` for Claude, `https://chatgpt.com/connector_platform_oauth_redirect` for ChatGPT)
3. Connect using `mcp.dremio.cloud/mcp/{project_id}` (US) or `mcp.eu.dremio.cloud/mcp/{project_id}` (EU)

A customer success manager can ask Claude "Show me all high-risk enterprise customers with contracts ending in the next 90 days" and get accurate, governed results from your Unity Catalog ML predictions — without knowing SQL.

### AI SQL Functions

Use AI directly in queries against Unity Catalog data:

```sql
-- Generate personalized retention messages for at-risk customers
SELECT
  customer_name,
  churn_probability,
  predicted_ltv,
  AI_GENERATE(
    'Write a one-sentence personalized retention offer for this at-risk customer',
    'Customer: ' || customer_name || ', Segment: ' || value_segment || ', Risk: ' || risk_tier || ', LTV: $' || CAST(predicted_ltv AS VARCHAR)
  ) AS retention_message
FROM analytics.gold.customer_risk_dashboard
WHERE risk_tier = 'High Risk' AND value_segment = 'Enterprise';

-- Classify intervention urgency
SELECT
  customer_name,
  AI_CLASSIFY(
    'Based on these risk factors, classify the intervention urgency',
    'Churn probability: ' || CAST(churn_probability AS VARCHAR) || ', LTV: $' || CAST(predicted_ltv AS VARCHAR) || ', Segment: ' || value_segment,
    ARRAY['Immediate', 'This Week', 'This Month', 'Monitor']
  ) AS urgency
FROM analytics.gold.customer_risk_dashboard
WHERE risk_tier IN ('High Risk', 'Moderate Risk');
```

## Important Notes

- **Read-only access.** Dremio connects to Unity Catalog tables in read-only mode. Write operations continue through Databricks.
- **UniForm required.** Only Delta Lake tables with UniForm enabled appear as queryable Iceberg tables in Dremio.
- **Table format transparency.** From Dremio's perspective, UniForm tables look and behave like standard Iceberg tables.
- **Credential vending.** When configured, Dremio receives temporary credentials from Unity Catalog, simplifying storage access.

## Reflections for Performance

Create Reflections on Unity Catalog views to cache results and serve dashboard queries without re-reading Delta Lake files:

1. Navigate to the view in the **Catalog**
2. Click the **Reflections** tab
3. Choose **Raw Reflection** or **Aggregation Reflection**
4. Select columns and aggregations
5. Set the **Refresh Interval** — balance between data freshness and compute cost
6. Click **Save**

BI tools connected to Dremio get sub-second response times from Reflections. This eliminates the need for Databricks SQL warehouses for read-heavy BI workloads.

## Governance Across Unity Catalog and Other Sources

Unity Catalog governs data within Databricks. Dremio's Fine-Grained Access Control (FGAC) extends governance across Unity Catalog and every other connected source:

- **Column masking:** Mask churn probability or predicted LTV from specific roles. A sales rep sees risk tier but not raw probability scores.
- **Row-level filtering:** Regional account managers see only customers in their territory.
- **Unified policies:** Same rules apply across Unity Catalog, PostgreSQL, S3, and all other sources.

These policies apply across SQL Runner, BI tools (Arrow Flight/ODBC), AI Agent, and MCP Server.

## Connect BI Tools via Arrow Flight

Arrow Flight provides 10-100x faster data transfer than JDBC/ODBC. For Delta Lake data:

- **Tableau:** Dremio connector — avoids Databricks SQL warehouse costs for BI
- **Power BI:** Dremio ODBC or native connector
- **Python/Pandas:** `pyarrow.flight` for programmatic access to ML model outputs
- **Looker:** Connect via JDBC
- **dbt:** `dbt-dremio` for transformations

All queries benefit from Reflections, governance, and the semantic layer.

## VS Code Copilot Integration

Dremio's VS Code extension with Copilot lets developers query Unity Catalog data from their IDE. Ask Copilot "Show me high-risk enterprise customers from the churn model" and get SQL from your semantic layer — without switching to Databricks notebooks or SQL warehouses.

## When to Use Dremio vs. Databricks SQL

**Use Dremio when:** You need cross-source federation (joining Delta Lake with PostgreSQL, S3, Snowflake), you want AI analytics on federated data, you need governance across multiple data sources, you want Reflection-based caching for BI tools.

**Use Databricks SQL when:** You need write-heavy workloads on Delta Lake, you're running Databricks-native jobs (streaming, ML training), your queries use Databricks-specific SQL extensions.

Both can coexist — Databricks for data engineering and ML, Dremio for federated analytics, AI, and BI serving.

## Delta Lake Tables in Dremio

Dremio reads Delta Lake tables from Unity Catalog with full Delta protocol support:

- **Time travel:** Query tables at specific versions using Delta Lake's transaction log
- **Schema evolution:** Dremio automatically detects schema changes made by Databricks jobs
- **Partition pruning:** Dremio leverages Delta Lake's partition statistics to skip irrelevant data files
- **Column statistics:** Delta Lake's min/max statistics enable efficient predicate pushdown

For write operations, use Dremio's Open Catalog with Iceberg tables for new analytical workloads. Unity Catalog remains the source of truth for Databricks-managed Delta Lake tables.

## Databricks Cost Optimization

Databricks pricing is based on Databricks Units (DBUs) consumed by SQL warehouses, clusters, and jobs. Dremio helps optimize costs:

- **BI serving:** Instead of running a Databricks SQL warehouse 24/7 for dashboards, create Reflections in Dremio. Dashboard queries hit Dremio, SQL warehouse auto-stops.
- **Ad-hoc exploration:** Analysts query Dremio's cached Reflections instead of waking Databricks clusters. Less start/stop overhead.
- **Cross-source queries:** Joining Delta Lake with PostgreSQL or S3 doesn't require moving all data into Databricks — Dremio federates in place.

For organizations spending $50K+/month on Databricks, routing read-heavy analytical workloads through Dremio can reduce DBU consumption by 30-50% on those workloads.

## Get Started

Unity Catalog users can extend their Databricks investment with Dremio's federation, AI analytics, and performance acceleration — without moving data out of Delta Lake. Dremio and Databricks are complementary: Databricks handles data engineering, ML training, and streaming workloads on Delta Lake tables, while Dremio serves analytical queries, BI dashboards, and AI-powered natural language access across your entire data estate.

Connect your Unity Catalog to Dremio Cloud, build Reflections on frequently queried tables, and enable the AI Agent for business users who need answers without writing SQL.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-unity-catalog-dremio-cloud&utm_content=alexmerced) and connect your Unity Catalog.
