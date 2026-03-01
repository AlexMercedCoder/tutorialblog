---
title: "Connect Azure Synapse Analytics to Dremio Cloud: Multi-Cloud Data Warehouse Federation"
date: "2026-03-01"
description: "Microsoft Azure Synapse Analytics combines big data analytics and enterprise data warehousing into a single Azure-integrated platform. If your organization h..."
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

Microsoft Azure Synapse Analytics combines big data analytics and enterprise data warehousing into a single Azure-integrated platform. If your organization has chosen the Microsoft cloud ecosystem, your cleaned and modeled analytical data likely lives in Synapse dedicated SQL pools or serverless SQL pools. Synapse works well within Azure, but it creates challenges when you need to connect that data with AWS, Google Cloud, or on-premises databases. Azure Data Factory pipelines handle some of this, but they add cost, latency, and engineering complexity.

Dremio Cloud connects to Azure Synapse and federates it with every other data source in your organization. Synapse queries push down to Synapse's engine for processing, and Dremio handles cross-source joins, query acceleration with Reflections, unified governance, and AI-powered analytics. You keep your investment in Synapse while extending its reach beyond the Azure ecosystem.

## Why Azure Synapse Users Need Dremio

### Multi-Cloud Analytics Without Data Movement

Your Azure Synapse workspace holds curated sales and finance data, but your application database runs on Amazon RDS (PostgreSQL), your marketing attribution data is in Google BigQuery, and your raw event logs sit in Amazon S3. Without a federation layer, joining these datasets requires Azure Data Factory to extract data from non-Azure sources, transform it, and load it into Synapse — a process that can take hours and costs real money in compute and data egress.

Dremio eliminates this entirely. Connect Synapse, PostgreSQL, BigQuery, and S3 as separate sources in Dremio, and write a single SQL query that joins across all four. Dremio's query optimizer pushes filtering and aggregation to each source (predicate pushdown), transfers only the results, and handles the cross-source join in its own engine. No pipelines. No data movement.

### Cost Optimization Through Reflections

Synapse dedicated SQL pools charge based on the Data Warehouse Units (DWUs) provisioned, and serverless pools charge per TB of data processed. Dashboard queries that run every 15 minutes, ad-hoc exploration by analysts, and scheduled reports all consume Synapse compute resources.

Dremio's Reflections create pre-computed materializations of your most frequently run queries. After the initial execution, subsequent queries that match the Reflection pattern are served from Dremio's cache — not from Synapse. This can reduce Synapse compute consumption by 50-80% for dashboard and reporting workloads, directly lowering your Azure bill.

### Unified Governance Across Clouds

Azure Synapse has role-based access control and Azure Active Directory integration within the Azure ecosystem. But those policies don't extend to your AWS databases or Google Cloud data. Dremio's Fine-Grained Access Control (FGAC) applies consistent column masking (hiding Social Security numbers, email addresses) and row-level filtering (restricting data by region or department) across Synapse and every other connected source. One governance policy, applied everywhere.

### The Semantic Layer for Business Context

Raw Synapse tables have technical column names and no business context. Dremio lets you create views that encapsulate business logic (what "active customer" or "quarterly revenue" means), then attach wiki descriptions and labels to those views. This semantic layer makes your data self-documenting and powers Dremio's AI capabilities.

## Prerequisites

Before connecting Azure Synapse to Dremio Cloud, confirm you have:

- **Synapse SQL endpoint** — the fully qualified server name from your Synapse workspace (e.g., `myworkspace.sql.azuresynapse.net`)
- **Port number** — default `1433` (Synapse uses the same port as SQL Server)
- **Database name** — the specific SQL pool (dedicated or serverless) you want to connect
- **Username and password** — SQL authentication credentials with read access to the tables you want to query
- **Network access** — Synapse's firewall must allow connections from Dremio Cloud's IP addresses. Configure this in the Synapse workspace's networking settings
- **Dremio Cloud account** — [sign up free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-azure-synapse-dremio-cloud&utm_content=alexmerced) with $400 in compute credits

## Step-by-Step: Connect Azure Synapse to Dremio Cloud

### 1. Add the Synapse Source

In the Dremio console, click the **"+"** button in the left sidebar and select **Microsoft Azure Synapse Analytics** from the database source types. Alternatively, navigate to **Databases** and click **Add database**.

### 2. Configure General Settings

- **Name:** A descriptive identifier for this source (e.g., `synapse-analytics` or `azure-sales-warehouse`). This name appears in your SQL queries as the source prefix. Cannot include `/`, `:`, `[`, or `]`.
- **Host:** Your Synapse SQL endpoint (e.g., `myworkspace.sql.azuresynapse.net`).
- **Port:** Default `1433`.
- **Database:** The SQL pool name you want to connect to.

### 3. Set Authentication

- **Master Credentials:** Enter the SQL authentication username and password with `SELECT` permissions on the schemas and tables you want to query.
- **Secret Resource URL:** Store the password in AWS Secrets Manager and provide the ARN. Dremio fetches the password at connection time for centralized credential management.

### 4. Configure Advanced Options

| Setting | What It Does | Default |
|---|---|---|
| **Record fetch size** | Rows per batch from Synapse | 200 |
| **Maximum Idle Connections** | Idle connection pool size | 8 |
| **Connection Idle Time (s)** | Seconds before idle connections close | 60 |
| **Encrypt Connection** | Enable SSL/TLS encryption | Off |
| **Connection Properties** | Custom JDBC parameters | None |

### 5. Set Reflection Refresh and Metadata

- **Reflection Refresh:** How often Dremio re-queries Synapse to update cached materializations. For dashboards with hourly data, set to 1-4 hours. For stable reporting data, daily or weekly.
- **Metadata Refresh:** How often Dremio checks for new tables or schema changes. Default 1 hour for discovery, 1 hour for details.

### 6. Set Privileges and Save

Optionally restrict which Dremio users or roles can access this Synapse source. Click **Save** to create the connection.

## Query Azure Synapse Data from Dremio

Once connected, browse your Synapse schemas and tables in the SQL Runner:

```sql
SELECT region, product_line, SUM(revenue) AS total_revenue, COUNT(order_id) AS order_count
FROM "synapse-analytics".dbo.sales_summary
WHERE fiscal_year = 2024 AND region IN ('EMEA', 'APAC', 'Americas')
GROUP BY region, product_line
ORDER BY total_revenue DESC;
```

Dremio pushes the `WHERE` clause and aggregation to Synapse — only the summarized result crosses the network.

## Federate Azure Synapse with Other Sources

The real power emerges when you combine Synapse data with non-Azure sources:

```sql
-- Join Synapse sales data with AWS-hosted CRM and S3 marketing data
SELECT
  syn.region,
  syn.product_line,
  syn.total_revenue AS synapse_revenue,
  pg.customer_count,
  s3.marketing_spend,
  ROUND(syn.total_revenue / NULLIF(s3.marketing_spend, 0), 2) AS revenue_per_marketing_dollar
FROM (
  SELECT region, product_line, SUM(revenue) AS total_revenue
  FROM "synapse-analytics".dbo.sales_summary
  WHERE fiscal_year = 2024
  GROUP BY region, product_line
) syn
LEFT JOIN (
  SELECT region, COUNT(DISTINCT customer_id) AS customer_count
  FROM "postgres-crm".public.customers
  GROUP BY region
) pg ON syn.region = pg.region
LEFT JOIN "s3-marketing".campaigns.regional_spend s3
  ON syn.region = s3.region
ORDER BY revenue_per_marketing_dollar DESC;
```

Three clouds (Azure, AWS, S3), one query, no ETL pipelines.

## Build a Semantic Layer Over Synapse Data

Create views that translate technical Synapse schemas into business-friendly analytics:

```sql
CREATE VIEW analytics.gold.regional_performance AS
SELECT
  s.region,
  s.product_line,
  SUM(s.revenue) AS total_revenue,
  SUM(s.cost) AS total_cost,
  SUM(s.revenue) - SUM(s.cost) AS gross_profit,
  ROUND((SUM(s.revenue) - SUM(s.cost)) / NULLIF(SUM(s.revenue), 0) * 100, 1) AS profit_margin_pct,
  CASE
    WHEN SUM(s.revenue) > 1000000 THEN 'Major Market'
    WHEN SUM(s.revenue) > 250000 THEN 'Growth Market'
    ELSE 'Emerging Market'
  END AS market_tier
FROM "synapse-analytics".dbo.sales_summary s
WHERE s.fiscal_year = 2024
GROUP BY s.region, s.product_line;
```

Navigate to the **Catalog**, click **Edit** (pencil icon) on this view, go to the **Details** tab, and click **Generate Wiki** and **Generate Tags**. Dremio's generative AI samples the view schema and data to produce descriptions that help analysts and AI tools understand the dataset.

## AI-Powered Analytics on Synapse Data

Dremio provides three AI capabilities that transform how you work with Synapse data:

### Dremio AI Agent

The built-in AI Agent lets users ask questions about your Synapse data in plain English. Instead of writing SQL, a business user can ask "What's our profit margin by region?" and the AI Agent generates the correct SQL based on the semantic layer (wikis, labels, view definitions) you've built.

The AI Agent reads the wiki descriptions you attached to your views to understand what columns mean in business terms. This is why the semantic layer matters — better metadata produces more accurate AI-generated queries. For example, if your `regional_performance` view has a wiki that says "profit_margin_pct represents the gross profit margin after cost of goods sold," the Agent uses that context to correctly answer "Which regions are most profitable?"

### Dremio MCP Server

The [Dremio MCP Server](https://github.com/dremio/dremio-mcp) extends AI capabilities beyond Dremio's own interface. It's an open-source project that enables AI chat clients like Claude and ChatGPT to securely interact with your Dremio data using natural language.

The Dremio-hosted MCP Server provides OAuth support, which guarantees user identity, authentication, and authorization for all interactions. Once connected, you can use natural language in Claude or ChatGPT to:

- Explore your Synapse data schemas and tables
- Run analytical queries and get results
- Create visualizations from query results
- Build and save views

**Setup is straightforward:**
1. Create a Native OAuth application in Dremio Cloud
2. Configure the redirect URLs for your AI chat client
3. Connect using the MCP endpoint: `mcp.dremio.cloud/mcp/{project_id}` (US) or `mcp.eu.dremio.cloud/mcp/{project_id}` (EU)

This means a marketing manager can ask Claude "Show me our top 5 regions by profit margin from the Synapse sales data" and get accurate, governed results — without knowing SQL or having direct Synapse access.

### AI SQL Functions

Dremio provides built-in AI SQL functions that you can use directly in queries against any connected data, including Synapse:

```sql
-- Classify products based on their Synapse metadata
SELECT
  product_line,
  total_revenue,
  AI_CLASSIFY(
    'Based on this revenue and growth pattern, classify the product health',
    product_line || ': $' || CAST(total_revenue AS VARCHAR) || ' revenue',
    ARRAY['Thriving', 'Stable', 'Declining', 'At Risk']
  ) AS product_health
FROM "synapse-analytics".dbo.product_summary;

-- Generate summaries from Synapse data
SELECT
  region,
  AI_GENERATE(
    'Write a one-sentence business summary for this regional performance',
    'Region: ' || region || ', Revenue: $' || CAST(revenue AS VARCHAR) || ', Growth: ' || CAST(yoy_growth AS VARCHAR) || '%'
  ) AS executive_summary
FROM "synapse-analytics".dbo.regional_metrics;
```

These functions run LLM inference directly in your SQL queries, turning raw Synapse data into AI-enriched insights.

## Accelerate Synapse Queries with Reflections

For queries that run repeatedly (dashboard refreshes, scheduled reports):

1. Build a view over your Synapse data (like `regional_performance` above).
2. In the Catalog, select the view and create a **Reflection**.
3. Choose the columns and aggregations to include.
4. Set the refresh interval (how often Dremio re-queries Synapse to update the Reflection).

After the Reflection is built, Dremio's query optimizer automatically routes matching queries to the Reflection. Your BI tools (Power BI, Tableau) connected via Arrow Flight or ODBC get sub-second responses from the Reflection instead of waiting for Synapse to process the query. The acceleration is completely transparent — users write the same SQL and see the same data, just faster.

## When to Keep Data in Synapse vs. Migrate to Iceberg

**Keep in Synapse:** Data actively consumed by Azure-native tools (Power BI with DirectQuery, Azure Machine Learning), data with complex Synapse-specific transformations, data shared through Azure Data Share.

**Migrate to Iceberg:** Historical archive data that's rarely updated, large analytical datasets that would benefit from automated compaction and manifest optimization, datasets that need time travel (query as of any past timestamp), data that other teams access through non-Azure tools.

For data that stays in Synapse, create manual Reflections with refresh schedules matching your data freshness requirements. For migrated Iceberg data, Dremio's Open Catalog provides automated compaction, time travel, and Autonomous Reflections.

## Governance Across Azure Synapse and Other Sources

Dremio's Fine-Grained Access Control (FGAC) extends Synapse's Azure AD-based security to every connected source:

- **Column masking:** Mask revenue, cost, and margin data from specific roles. A marketing analyst sees conversion counts but not financial details.
- **Row-level filtering:** Regional managers see only their region's data automatically across all sources.
- **Unified policies:** Same governance applies to Synapse, PostgreSQL, S3, BigQuery, and all other sources — no per-service security configuration.

These policies apply across SQL Runner, BI tools (Arrow Flight/ODBC), AI Agent, MCP Server, and Arrow Flight clients.

## Connect BI Tools via Arrow Flight

Arrow Flight provides 10-100x faster data transfer than JDBC/ODBC:

- **Power BI:** Dremio native connector — ideal for Azure-centric organizations
- **Tableau:** Dremio connector for direct Arrow Flight access
- **Python/Pandas:** `pyarrow.flight` for programmatic data access
- **Looker:** Connect via JDBC
- **dbt:** `dbt-dremio` adapter for SQL-based transformations

All queries benefit from Reflections, governance, and the semantic layer.

## VS Code Copilot Integration

Dremio's VS Code extension with Copilot integration lets developers query Synapse data from their IDE. Ask Copilot "Show me regional profit margins from Azure Synapse" and get SQL generated from your semantic layer.

## Get Started

Azure Synapse users can extend their warehouse beyond the Azure ecosystem, reduce compute costs with Reflections, and enable AI-powered analytics across all their data sources — all through Dremio Cloud.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-azure-synapse-dremio-cloud&utm_content=alexmerced) and connect your Azure Synapse workspace alongside your other data sources.
