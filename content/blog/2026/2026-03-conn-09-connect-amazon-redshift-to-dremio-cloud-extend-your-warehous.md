---
title: "Connect Amazon Redshift to Dremio Cloud: Extend Your Warehouse with Federation and AI Analytics"
date: "2026-03-01"
description: "Amazon Redshift is AWS's managed data warehouse, designed for petabyte-scale analytics. If your organization chose Redshift for analytical workloads, you've ..."
author: "Alex Merced"
category: "Dremio Connectors"
bannerImage: "./images/connector-blogs/09/banner.png"
tags:
  - dremio
  - data integration
  - connectors
  - data lakehouse
  - federated queries
---

Amazon Redshift is AWS's managed data warehouse, designed for petabyte-scale analytics. If your organization chose Redshift for analytical workloads, you've built data pipelines, ETL jobs, and dashboards around it. But as data ecosystems grow, Redshift's limitations become painfully clear: connecting data outside Redshift requires ETL or Redshift Spectrum (additional cost per TB scanned), sharing Redshift data with non-AWS tools means exporting to S3, and Redshift's concurrency limits constrain how many dashboards and users can query simultaneously.

Dremio Cloud connects to Redshift and queries it alongside every other data source in your organization. Instead of moving all your data into Redshift, or exporting Redshift data out, Dremio federates across sources and accelerates repeated queries with Reflections so your Redshift cluster handles less load.

Redshift's concurrency scaling feature helps handle burst query volumes, but it charges per-second of additional cluster time. By routing repeated dashboard queries through Dremio Reflections, you reduce the need for concurrency scaling entirely — cached results are served without any Redshift cluster involvement. This difference is particularly impactful for organizations running dozens of auto-refreshing dashboards.

### Redshift Data Sharing vs. Dremio Federation

Redshift Data Sharing allows sharing data between Redshift clusters. But it only works within the Redshift ecosystem — you can't share Redshift data with Snowflake, BigQuery, or PostgreSQL through Data Sharing. Dremio's federation provides a broader solution: join Redshift data with any connected source. Data Sharing works for Redshift-to-Redshift use cases; Dremio handles everything else.

### Redshift Serverless Consideration

With Redshift Serverless, you pay per RPU-second consumed. Every query, including repeated dashboard queries, consumes RPUs. Dremio Reflections eliminate RPU consumption for cached queries — a direct and measurable cost reduction. For Serverless users, the ROI from Reflections is immediately visible in the AWS billing dashboard.

Redshift's RA3 instances introduced compute-storage separation using Managed Storage backed by S3. While this improved scalability, all queries still consume RA3 compute resources. Dremio provides a complementary compute layer: Reflections handle repetitive analytical workloads while RA3 focuses on the data transformations and ingestion pipelines that require Redshift's native capabilities. This architectural separation — Redshift for data engineering, Dremio for analytics serving — maximizes the value of both platforms.

## Why Redshift Users Need Dremio

### Extend Redshift Without Spectrum Costs

Redshift Spectrum charges per TB scanned against S3. Dremio's federation queries S3 data directly through its own engine without per-TB charges. You still get SQL joins between Redshift and S3 data — Dremio handles the federation transparently.

### Reduce Redshift Cluster Costs

Redshift pricing scales with cluster size (RA3, DC2, or Serverless credits). Analytical dashboards that run the same queries repeatedly consume cluster resources on every refresh. Dremio's Reflections serve cached results for matching queries, offloading that load from Redshift. For organizations with heavy dashboard workloads, this can reduce the Redshift cluster size needed.

### Multi-Warehouse Federation

Your Redshift warehouse holds sales data, but your Snowflake instance has marketing data, your BigQuery project has Google Analytics data, and your PostgreSQL database has CRM data. Dremio federates across all four in a single query.

### External Queries

Dremio supports external queries against Redshift, allowing you to run Redshift-native SQL (including Redshift-specific functions like `APPROXIMATE COUNT(DISTINCT)`, window functions, and late binding views) through Dremio when needed.

### AI Analytics

Dremio's semantic layer, AI Agent, MCP Server, and AI SQL Functions add natural language querying and AI enrichment to Redshift data without building a separate BI layer.

## Prerequisites

- **Redshift cluster endpoint** (hostname) — from the Redshift console
- **Port** — default `5439`
- **Database name** — your Redshift database
- **Username and password** — Redshift database user with SELECT permissions
- **Network access** — Redshift cluster must be publicly accessible, or configure VPC peering with Dremio Cloud
- **Dremio Cloud account** — [sign up free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-amazon-redshift-dremio-cloud&utm_content=alexmerced) with $400 in compute credits

## Step-by-Step: Connect Redshift to Dremio Cloud

### 1. Add the Source

Click **"+"** in the Dremio console and select **Amazon Redshift**.

### 2. Configure Connection Details

- **Name:** Descriptive identifier (e.g., `redshift-warehouse` or `sales-analytics`).
- **Host:** Your Redshift cluster endpoint (e.g., `mycluster.xxxx.us-east-1.redshift.amazonaws.com`).
- **Port:** Default `5439`.
- **Database:** Your Redshift database name.

### 3. Set Authentication

Master Credentials (username/password) or Secret Resource URL (AWS Secrets Manager).

### 4. Configure Advanced Options

| Setting | Purpose | Default |
|---|---|---|
| **Record fetch size** | Rows per batch from Redshift | 200 |
| **Maximum Idle Connections** | Connection pool management | 8 |
| **Connection Idle Time** | Seconds before idle connections close | 60 |
| **Encrypt Connection** | Enable SSL/TLS | Off |

### 5. Set Reflection and Metadata Refresh, then Save

## Query Redshift Data

```sql
SELECT
  date_trunc('month', sale_date) AS month,
  product_category,
  SUM(revenue) AS monthly_revenue,
  COUNT(DISTINCT customer_id) AS unique_customers,
  ROUND(SUM(revenue) / COUNT(DISTINCT customer_id), 2) AS revenue_per_customer
FROM "redshift-warehouse".public.sales
WHERE sale_date >= '2024-01-01'
GROUP BY 1, 2
ORDER BY 1, monthly_revenue DESC;
```

## External Queries

Run Redshift-native SQL through Dremio when you need Redshift-specific functions:

```sql
SELECT * FROM TABLE(
  "redshift-warehouse".EXTERNAL_QUERY(
    'SELECT TOP 100 querytxt, elapsed, starttime FROM stl_query WHERE starttime > GETDATE() - 7 ORDER BY elapsed DESC'
  )
);
```

## Federate Redshift with Other Sources

```sql
-- Join Redshift sales with PostgreSQL CRM and S3 marketing data
SELECT
  c.customer_name,
  c.segment,
  SUM(s.revenue) AS total_revenue,
  COUNT(s.sale_id) AS total_sales,
  m.campaign_name,
  m.attribution_channel,
  ROUND(SUM(s.revenue) / NULLIF(m.campaign_spend, 0), 2) AS roas
FROM "postgres-crm".public.customers c
JOIN "redshift-warehouse".public.sales s ON c.customer_id = s.customer_id
LEFT JOIN "s3-marketing".attribution.customer_campaigns m ON c.customer_id = m.customer_id
WHERE s.sale_date >= '2024-01-01'
GROUP BY c.customer_name, c.segment, m.campaign_name, m.attribution_channel, m.campaign_spend
ORDER BY total_revenue DESC;
```

## Build a Semantic Layer

```sql
CREATE VIEW analytics.gold.sales_performance AS
SELECT
  s.product_category,
  date_trunc('month', s.sale_date) AS month,
  SUM(s.revenue) AS revenue,
  COUNT(*) AS transactions,
  COUNT(DISTINCT s.customer_id) AS unique_buyers,
  ROUND(SUM(s.revenue) / COUNT(*), 2) AS avg_transaction_value,
  CASE
    WHEN SUM(s.revenue) > 500000 THEN 'Top Performer'
    WHEN SUM(s.revenue) > 100000 THEN 'Solid'
    ELSE 'Emerging'
  END AS performance_tier
FROM "redshift-warehouse".public.sales s
GROUP BY s.product_category, date_trunc('month', s.sale_date);
```

In the **Catalog**, click **Edit** → **Generate Wiki** and **Generate Tags**.

## AI-Powered Analytics on Redshift Data

### Dremio AI Agent

The AI Agent lets users ask "What were our top performing product categories last quarter?" and generates accurate SQL from your semantic layer. The wiki descriptions attached to views tell the Agent what "top performing" means in your data context.

### Dremio MCP Server

Connect [Claude or ChatGPT](https://github.com/dremio/dremio-mcp) to your Redshift data through Dremio:

1. Create a Native OAuth app in Dremio Cloud
2. Configure redirect URLs for your AI client
3. Connect via `mcp.dremio.cloud/mcp/{project_id}`

A VP of Sales asks Claude "Compare our Q1 revenue per customer across product categories using the Redshift data" and gets a governed, accurate benchmark without SQL.

### AI SQL Functions

```sql
-- Generate strategic recommendations from sales data
SELECT
  product_category,
  revenue,
  performance_tier,
  AI_GENERATE(
    'Write a strategic recommendation for this product category',
    'Category: ' || product_category || ', Revenue: $' || CAST(revenue AS VARCHAR) || ', Tier: ' || performance_tier || ', Avg Transaction: $' || CAST(avg_transaction_value AS VARCHAR)
  ) AS strategic_recommendation
FROM analytics.gold.sales_performance
WHERE month = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1' MONTH);

-- Classify product categories for budget allocation
SELECT
  product_category,
  AI_CLASSIFY(
    'Based on this sales performance, classify the marketing budget priority',
    'Revenue: $' || CAST(revenue AS VARCHAR) || ', Customers: ' || CAST(unique_buyers AS VARCHAR) || ', Avg Transaction: $' || CAST(avg_transaction_value AS VARCHAR),
    ARRAY['Increase Investment', 'Maintain Investment', 'Optimize Spend', 'Reduce Budget']
  ) AS budget_recommendation
FROM analytics.gold.sales_performance
WHERE month >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '3' MONTH);
```

## Accelerate with Reflections

Create Reflections on Redshift views for dashboard acceleration:

1. Navigate to the view in the **Catalog**
2. Click the **Reflections** tab
3. Choose **Raw Reflection** (full dataset cache) or **Aggregation Reflection** (pre-computed SUM/COUNT/AVG)
4. Select columns and aggregations
5. Set the **Refresh Interval** — balance freshness against Redshift cluster load
6. Click **Save**

BI tools connected via Arrow Flight get sub-second responses from Reflections instead of waiting for Redshift cluster processing. A Tableau dashboard refreshing every 15 minutes generates zero Redshift cluster load after the Reflection is built.

## Governance Across Redshift and Other Sources

Dremio's Fine-Grained Access Control (FGAC) adds governance capabilities that work uniformly across Redshift and every other connected source:

- **Column masking:** Mask sensitive revenue data or PII from specific roles. A marketing analyst sees conversion rates but not individual customer records.
- **Row-level filtering:** Restrict data visibility based on user roles. Regional managers see only their region's sales data.
- **Unified policies:** The same governance applies to Redshift, PostgreSQL, S3, and all other sources — no per-database security configuration.

These policies apply across all access methods: SQL Runner, BI tools, AI Agent, MCP Server, and Arrow Flight clients.

## Connect BI Tools via Arrow Flight

Arrow Flight provides 10-100x faster data transfer than JDBC/ODBC for BI tools:

- **Tableau:** Use the Dremio connector for direct Arrow Flight access
- **Power BI:** Use Dremio's ODBC driver or native connector
- **Python/Pandas:** Use `pyarrow.flight` for programmatic data access
- **Looker:** Connect via JDBC
- **dbt:** Use `dbt-dremio` for transformation workflows

All queries benefit from Reflections, governance, and the semantic layer — whether the underlying data comes from Redshift or any other source.

## VS Code Copilot Integration

Dremio's VS Code extension with Copilot integration enables developers to query Redshift data from their IDE. Ask Copilot "Show me sales performance by category from Redshift" and it generates SQL using your semantic layer, eliminating context switching between tools.

## When to Keep Data in Redshift vs. Migrate

**Keep in Redshift:** Data actively used by Redshift-native tools and materializations, workloads with existing Redshift-based ETL pipelines, datasets managed by Redshift's automatic table optimization (sort keys, distribution styles).

**Migrate to Iceberg:** Historical data and archives, datasets consumed primarily by non-Redshift tools, data where Redshift cluster costs exceed analytical value. Migrated Iceberg tables benefit from Dremio's automatic compaction, time travel, Autonomous Reflections, and zero per-query storage costs.

For data that stays in Redshift, create manual Reflections to reduce cluster load. For migrated Iceberg data, Dremio handles optimization automatically.

## Redshift Cost Optimization with Dremio

### Redshift Pricing Models

| Model | How It's Priced | Dremio's Impact |
|---|---|---|
| **RA3 Provisioned** | Per-node-hour + managed storage | Reflections reduce node utilization, enabling cluster downsizing |
| **DC2 Provisioned** | Per-node-hour, SSD storage included | Same as RA3 — lower utilization means fewer nodes needed |
| **Serverless** | Per RPU-hour (compute consumed) | Reflections eliminate RPU consumption for cached queries |
| **Spectrum** | Per TB scanned in S3 | Dremio queries S3 directly without per-TB charges |

### Quantifying Savings

A typical dashboard workload might include:
- 20 production dashboards, each refreshing every 15 minutes
- 50+ ad-hoc queries per day from analysts
- Weekly scheduled reports generating 100+ queries

With Dremio Reflections, only the Reflection refresh queries hit Redshift. If Reflections refresh hourly:
- Dashboard queries drop from 1,920/day to 24/day (hourly Reflection refresh × 24 hours) — a **98.7% reduction**
- Ad-hoc queries matching Reflection patterns are served from cache — zero Redshift load
- Scheduled reports matching Reflections run instantly

### Migration Strategy

1. **Assess:** Identify Redshift tables by query frequency and size. High-frequency, read-heavy tables are prime candidates for Reflections.
2. **Accelerate:** Create Reflections on the 10-20 most-queried views. Monitor Redshift cluster utilization.
3. **Right-size:** As utilization drops, reduce Redshift node count or switch from Provisioned to Serverless.
4. **Migrate:** Move historical and archival data from Redshift to Iceberg tables. Use `CREATE TABLE ... AS SELECT` in Dremio.
5. **Optimize:** Continue moving more tables as Redshift costs decrease and Dremio handles more workloads.

## Get Started

Redshift users can extend their warehouse with federation, reduce cluster costs with Reflections, add AI analytics, and apply unified governance across their entire data estate. Whether you're running Redshift Provisioned, Serverless, or RA3, Dremio Reflections immediately reduce compute costs by caching repetitive queries. Start by connecting your cluster and creating Reflections on your most-queried views to see immediate results.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-amazon-redshift-dremio-cloud&utm_content=alexmerced) and connect your Redshift cluster.
