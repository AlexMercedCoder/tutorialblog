---
title: "Connect Snowflake to Dremio Cloud: Federate, Govern, and Accelerate Beyond Snowflake"
date: "2026-03-01"
description: "Snowflake is a popular cloud data warehouse known for its separation of storage and compute, near-zero maintenance, and broad ecosystem. Many organizations h..."
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

Snowflake is a popular cloud data warehouse known for its separation of storage and compute, near-zero maintenance, and broad ecosystem. Many organizations have made Snowflake their primary analytics platform. But as data ecosystems mature, limitations emerge: Snowflake credits are consumed on every query, connecting Snowflake data to non-Snowflake sources requires data sharing agreements or ETL, and running all workloads in Snowflake means paying Snowflake prices for everything — including repetitive dashboard queries and ad-hoc exploration.

Dremio Cloud connects to Snowflake as a federated data source. You can query Snowflake tables directly, join them with PostgreSQL, S3, MongoDB, BigQuery, and any other connected source in a single SQL query, and accelerate repeated queries with Reflections so they don't burn Snowflake credits on every execution.

Snowflake's native Iceberg Tables feature allows managing Iceberg-formatted data within Snowflake. However, this still keeps your compute costs within Snowflake's pricing model. By combining Dremio Cloud with Snowflake (and potentially Snowflake's Open Catalog for shared Iceberg access), organizations can use Snowflake for data engineering while leveraging Dremio for cost-optimized analytical serving. This hybrid approach gives you Snowflake's data engineering strengths without paying Snowflake credit rates for every analytical query.

The cost concern is real: organizations regularly report that 40-60% of their Snowflake spend comes from dashboards, scheduled reports, and ad-hoc queries — workloads that are fundamentally repetitive and ideal for Reflection-based caching.

## Why Snowflake Users Need Dremio

### Reduce Snowflake Credit Consumption

Every query in Snowflake consumes credits based on the warehouse size and query runtime. Dashboard queries that run every 15 minutes, analytics training sessions, ad-hoc data exploration by 50 analysts, and nightly scheduled reports all consume credits.

Dremio's Reflections create pre-computed materializations of frequently executed queries. After the initial run, matching queries are served from Dremio's cache instead of Snowflake. For organizations spending over $100K/year on Snowflake compute, routing read-heavy analytical and dashboard workloads through Dremio can reduce credit consumption by 30-70% on those workloads.

### Federation Beyond Snowflake

Snowflake's data sharing works between Snowflake accounts. But what about your PostgreSQL application database, your S3 data lake, your MongoDB user profiles, or your on-premises Oracle ERP? Joining these with Snowflake data requires ETL pipelines — extracting from each source, transforming, and loading into Snowflake. Dremio queries each source in place and joins the results in its own engine. No data movement, no Snowflake ingestion costs.

### Unified Governance

Snowflake has robust access controls within Snowflake. But governing data across Snowflake, PostgreSQL, S3, and MongoDB requires separate policies in each system. Dremio's Fine-Grained Access Control applies consistent column masking and row-level filtering across all connected sources from a single interface.

### AI Analytics Across All Sources

Snowflake has AI/ML features within its ecosystem (Cortex). Dremio adds AI capabilities that span your entire data estate, not just Snowflake — including an AI Agent for natural language queries, an MCP Server for external AI tools, and SQL-level AI functions.

## Prerequisites

- **Snowflake account URL** (e.g., `myaccount.snowflakecomputing.com`)
- **Username and password** (or OAuth/key pair authentication)
- **Warehouse name** — the compute resource Snowflake uses for queries
- **Database name** — the Snowflake database you want to connect
- **Network access** from Dremio Cloud to your Snowflake instance
- **Dremio Cloud account** — [sign up free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-snowflake-dremio-cloud&utm_content=alexmerced) with $400 in compute credits

## Step-by-Step: Connect Snowflake to Dremio Cloud

### 1. Add the Snowflake Source

In the Dremio console, click **"+"** in the left sidebar and select **Snowflake**.

### 2. Configure Connection Details

- **Name:** A descriptive identifier (e.g., `snowflake-warehouse` or `analytics-snowflake`).
- **Account URL:** Your Snowflake account URL.
- **Warehouse:** The Snowflake virtual warehouse to use for queries.
- **Database:** The Snowflake database to connect to.

### 3. Set Authentication

Choose from Master Credentials (username/password), OAuth, or key pair authentication.

### 4. Configure Advanced Settings

| Setting | Purpose |
|---|---|
| **Record fetch size** | Rows per batch from Snowflake |
| **Maximum Idle Connections** | Connection pool management |
| **Connection Properties** | Custom Snowflake connection parameters |

### 5. Set Reflection and Metadata Refresh

Configure how often Reflections refresh and how often Dremio checks for schema changes. Click **Save**.

## Query Snowflake Data from Dremio

```sql
SELECT
  product_category,
  SUM(sales_amount) AS total_sales,
  COUNT(DISTINCT customer_id) AS unique_buyers,
  ROUND(SUM(sales_amount) / COUNT(DISTINCT customer_id), 2) AS avg_spend_per_customer
FROM "snowflake-warehouse".PUBLIC.SALES_FACT
WHERE sale_date >= '2024-01-01' AND sale_date < '2024-07-01'
GROUP BY product_category
ORDER BY total_sales DESC;
```

## Federate Snowflake with Other Sources

```sql
-- Join Snowflake sales with PostgreSQL reviews and S3 return data
SELECT
  sf.product_category,
  sf.total_sales,
  sf.unique_buyers,
  pg.avg_review_score,
  pg.review_count,
  s3.return_rate,
  ROUND(sf.total_sales * (1 - s3.return_rate), 2) AS net_revenue
FROM (
  SELECT product_category, SUM(sales_amount) AS total_sales, COUNT(DISTINCT customer_id) AS unique_buyers
  FROM "snowflake-warehouse".PUBLIC.SALES_FACT
  WHERE sale_date >= '2024-01-01'
  GROUP BY product_category
) sf
LEFT JOIN "postgres-reviews".public.product_reviews pg ON sf.product_category = pg.category
LEFT JOIN "s3-analytics".returns.category_return_rates s3 ON sf.product_category = s3.category
ORDER BY net_revenue DESC;
```

## Build a Semantic Layer

```sql
CREATE VIEW analytics.gold.product_health AS
SELECT
  sf.product_category,
  SUM(sf.sales_amount) AS total_revenue,
  COUNT(DISTINCT sf.customer_id) AS unique_customers,
  ROUND(SUM(sf.sales_amount) / COUNT(DISTINCT sf.customer_id), 2) AS customer_value,
  CASE
    WHEN SUM(sf.sales_amount) > 1000000 THEN 'Category Leader'
    WHEN SUM(sf.sales_amount) > 250000 THEN 'Growth Category'
    ELSE 'Emerging'
  END AS category_tier
FROM "snowflake-warehouse".PUBLIC.SALES_FACT sf
GROUP BY sf.product_category;
```

Click **Edit** (pencil icon) in the Catalog, then **Generate Wiki** and **Generate Tags** to create AI-readable business context.

## AI-Powered Analytics on Snowflake Data

### Dremio AI Agent

Users ask questions in plain English: "Which product categories are growing fastest?" The AI Agent reads your wiki descriptions and generates accurate SQL. The semantic layer you've built is the foundation — better descriptions mean better AI responses.

### Dremio MCP Server

The [Dremio MCP Server](https://github.com/dremio/dremio-mcp) connects external AI tools (Claude, ChatGPT) to your Dremio data with OAuth authentication:

1. Create a Native OAuth application in Dremio Cloud
2. Configure redirect URLs for your AI client
3. Connect using `mcp.dremio.cloud/mcp/{project_id}`

A product manager can ask ChatGPT "What are our top 5 product categories by net revenue from Snowflake?" and get governed, accurate results.

### AI SQL Functions

```sql
-- Generate product insights with AI
SELECT
  product_category,
  total_revenue,
  customer_value,
  AI_GENERATE(
    'Write a one-sentence product strategy recommendation',
    'Category: ' || product_category || ', Revenue: $' || CAST(total_revenue AS VARCHAR) || ', Customer Value: $' || CAST(customer_value AS VARCHAR) || ', Tier: ' || category_tier
  ) AS strategy_recommendation
FROM analytics.gold.product_health;

-- Classify product categories
SELECT
  product_category,
  AI_CLASSIFY(
    'Based on these metrics, classify the investment priority',
    'Revenue: $' || CAST(total_revenue AS VARCHAR) || ', Customers: ' || CAST(unique_customers AS VARCHAR),
    ARRAY['High Priority', 'Medium Priority', 'Low Priority', 'Divest']
  ) AS investment_priority
FROM analytics.gold.product_health;
```

## Accelerate with Reflections

Create Reflections on frequently queried Snowflake views to offload repeated queries from Snowflake credits:

1. In the **Catalog**, navigate to the view you want to accelerate
2. Click the **Reflections** tab
3. Choose **Raw Reflection** (full dataset cache) or **Aggregation Reflection** (pre-computed SUM/COUNT/AVG)
4. Select the columns and aggregations to include
5. Set the **Refresh Interval** — balance between data freshness and Snowflake credit consumption
6. Click **Save**

After creation, Dremio's query optimizer automatically routes matching queries to the Reflection. Dashboard queries and scheduled reports hit the cache instead of consuming Snowflake credits. BI tools connected via Arrow Flight get sub-second response times.

### Example: Dashboard Acceleration

A Tableau dashboard that refreshes every 15 minutes queries `product_health`. Without Reflections, that's 96 Snowflake queries per day. With a Reflection that refreshes every 2 hours, Dremio serves 84 of those queries from cache — an 87.5% reduction in Snowflake credit consumption for that dashboard alone. Multiply that across 50 dashboards and the savings become significant.

## Governance Across Snowflake and Other Sources

Dremio's Fine-Grained Access Control (FGAC) provides governance capabilities that work across Snowflake and every other connected source:

- **Column masking:** Mask sensitive customer data (PII, financial details) from specific user roles. A marketing analyst sees `customer_name` but not `social_security_number`. An auditor sees both.
- **Row-level filtering:** Automatically filter data based on the querying user's role. A regional manager sees only their region's data across all sources.
- **Unified policies:** The same governance rules apply whether data comes from Snowflake, PostgreSQL, S3, or any other source — no per-source policy management.

These policies apply across all access methods: SQL Runner, BI tools, AI Agent, MCP Server, and Arrow Flight clients.

## Connect BI Tools via Arrow Flight

Arrow Flight provides 10-100x faster data transfer compared to JDBC/ODBC. After building views over Snowflake data:

- **Tableau:** Use the Dremio connector for direct Arrow Flight access
- **Power BI:** Use Dremio's ODBC driver or native connector
- **Python/Pandas:** Use `pyarrow.flight` for programmatic data access
- **Looker:** Connect via JDBC with Dremio's driver
- **dbt:** Use `dbt-dremio` for SQL-based transformations

All queries benefit from Reflections, governance, and semantic layer context.

## VS Code Copilot Integration

Dremio's VS Code extension with Copilot integration lets developers query Snowflake data from their IDE. Ask Copilot "Show me product health metrics from Snowflake" and it generates SQL using your semantic layer — without switching to the Dremio console or Snowflake's Worksheets.

## External Queries

For Snowflake-specific functions not natively supported in Dremio's SQL, use external queries:

```sql
SELECT * FROM TABLE(
  "snowflake-warehouse".EXTERNAL_QUERY(
    'SELECT APPROX_COUNT_DISTINCT(customer_id), MEDIAN(sales_amount) FROM PUBLIC.SALES_FACT WHERE sale_date >= ''2024-01-01'''
  )
);
```

External queries pass raw SQL to Snowflake for execution, returning results through Dremio. This is useful for functions like `APPROX_COUNT_DISTINCT`, `QUALIFY`, or Snowflake-specific window functions.

## When to Keep Data in Snowflake vs. Migrate

**Keep in Snowflake:** Data consumed by Snowflake-native tools (Snowpipe, Streams, Tasks), data shared through Snowflake Data Sharing, workloads with Snowflake-specific features (materialized views, dynamic tables), datasets actively managed by Snowflake-based ETL.

**Migrate to Iceberg:** Historical data that rarely changes, archival tables, datasets consumed primarily through non-Snowflake tools, workloads where Snowflake credit costs exceed the analytical value delivered. Migrated Iceberg tables benefit from Dremio's automatic compaction, time travel, Autonomous Reflections, and zero per-query storage costs.

For data that stays in Snowflake, create manual Reflections to reduce credit consumption. For migrated Iceberg data, Dremio handles optimization automatically.

## Snowflake Credit Optimization with Dremio

### Credit Consumption by Warehouse Size

| Warehouse Size | Credits/Hour | Dremio Reflection Impact |
|---|---|---|
| X-Small | 1 | Reflections serve cached queries — warehouse suspends faster |
| Small | 2 | Same pattern — faster auto-suspend reduces credit burn |
| Medium | 4 | Dashboard workloads offloaded — downsize to Small |
| Large | 8 | Interactive + scheduled workloads offloaded — significant savings |
| X-Large | 16 | Heavy analytical workloads cached — potential 50%+ reduction |

### Quantifying Credit Savings

Example calculation for a medium-sized analytics team:

- **Without Dremio:** 50 analysts + 20 dashboards consume ~$15,000/month in Snowflake credits
- **With Dremio Reflections:** Dashboard queries (60% of total) served from cache → ~$6,000/month savings
- **Net impact:** $9,000/month Snowflake bill + Dremio costs, typically netting 20-40% total savings

### Snowflake Data Cloud Integration

Dremio doesn't replace Snowflake's Data Cloud capabilities — it complements them:

- **Data Sharing:** Continue sharing datasets via Snowflake Data Sharing with other Snowflake accounts
- **Marketplace:** Access Snowflake Marketplace datasets alongside your own, but federate them with non-Snowflake sources through Dremio
- **Snowpark:** Continue using Snowpark for Python/Java/Scala processing within Snowflake
- **Dremio's role:** Federation with non-Snowflake data, AI analytics, Reflection-based BI serving, and unified governance

## Get Started

Snowflake users can reduce credit consumption, federate beyond Snowflake's ecosystem, and add AI analytics — all through Dremio Cloud. The combination of Reflections (offloading repetitive dashboard and report queries), federation (joining Snowflake with PostgreSQL, S3, MongoDB, and other sources without ETL), and AI capabilities (Agent, MCP Server, SQL Functions) makes Dremio a natural complement to any Snowflake deployment.

Start by connecting Snowflake to Dremio Cloud, creating Reflections on your most-queried views, and monitoring the reduction in Snowflake credit consumption. Most organizations see measurable savings within the first week as dashboard queries shift to Dremio's Reflection cache. The setup takes minutes and the ROI is immediate.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-snowflake-dremio-cloud&utm_content=alexmerced) and connect your Snowflake warehouse.
