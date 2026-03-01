---
title: "Connect AWS Glue Data Catalog to Dremio Cloud: Query and Manage Your AWS Iceberg Tables"
date: "2026-03-01"
description: "AWS Glue Data Catalog is AWS's managed metadata service for data lakes. It stores table definitions, schemas, partition information, and statistics for data ..."
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

AWS Glue Data Catalog is AWS's managed metadata service for data lakes. It stores table definitions, schemas, partition information, and statistics for data stored in Amazon S3. If you've built your data lake on AWS using Apache Spark (on EMR), AWS Glue ETL jobs, or Amazon Athena, your table metadata lives in Glue. But Glue is just a catalog — a registry of what's where. To actually query the data, you need Athena (per-TB pricing), EMR clusters (infrastructure management), or Redshift Spectrum (additional cost).

Dremio Cloud connects to your Glue Data Catalog and queries the underlying Iceberg tables with full read and write support. You get enterprise-grade SQL, Reflections for query acceleration, governance, and AI analytics — all on top of your existing Glue-managed lakehouse.

## Why Glue Users Need Dremio

### Query Without Athena's Per-TB Pricing

Athena charges per terabyte of data scanned, regardless of whether the query is the same one you ran 5 minutes ago. For teams running dashboard queries, scheduled reports, and ad-hoc exploration, this pricing model creates unpredictable costs. Dremio's Reflections cache results so repeated queries don't re-scan S3. C3 (Columnar Cloud Cache) caches file data on local NVMe for frequently accessed datasets. You pay for Dremio compute time, not per-TB scanned.

### Full Read and Write on Iceberg Tables

Dremio supports full DML (INSERT, UPDATE, DELETE, MERGE) on Glue-cataloged Iceberg tables. Create tables, run transformations, build data pipelines, and maintain your lakehouse entirely through Dremio's SQL engine — no need to spin up EMR clusters or Glue ETL jobs for simple transformations.

### Federate Glue with Non-AWS Sources

Your Glue-managed data lake covers AWS data, but your application database is on Azure (Azure SQL), your analytics warehouse is Snowflake, and your marketing data is in Google BigQuery. Dremio federates across all of them in a single SQL query.

### Automated Iceberg Maintenance

Dremio automatically compacts small files into optimally sized ones, rewrites manifests for faster metadata reads, and clusters data based on query patterns — all on Glue-cataloged Iceberg tables. This eliminates the need for manual `OPTIMIZE` jobs or scheduled Glue ETL maintenance tasks.

### Credential Vending

Dremio uses Glue's credential vending to securely access the underlying S3 data without separate S3 credentials. The catalog provides temporary, scoped credentials for each data request.

## Prerequisites

- **AWS Account** with Glue Data Catalog configured
- **IAM Role** with permissions: `glue:GetDatabase`, `glue:GetTable`, `glue:GetTables`, `glue:GetPartitions`, and S3 read/write permissions for underlying data
- **AWS Region** where your Glue catalog is deployed
- **Dremio Cloud account** — [sign up free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-aws-glue-dremio-cloud&utm_content=alexmerced) with $400 in compute credits

## Step-by-Step: Connect Glue to Dremio Cloud

### 1. Add the Source

Click **"+"** in the Dremio console and select **AWS Glue Data Catalog**.

### 2. Configure Connection

- **Name:** Descriptive identifier (e.g., `glue-catalog` or `aws-lakehouse`).
- **AWS Region:** The region where your Glue catalog is deployed.

### 3. Set Authentication

Provide IAM Role ARN (recommended for Dremio Cloud) or AWS Access Key/Secret Key.

### 4. Select Databases

Choose which Glue databases to expose. You can enable specific databases or allow access to all.

### 5. Configure Advanced Settings

Set Reflection Refresh, Metadata refresh intervals, and click **Save**.

## Query and Write to Glue Iceberg Tables

```sql
-- Query a Glue-cataloged Iceberg table
SELECT product_id, product_name, category, price, inventory_count
FROM "glue-catalog".ecommerce.products
WHERE category = 'Electronics' AND price > 50 AND inventory_count > 0
ORDER BY price ASC;

-- Write to Glue Iceberg tables
INSERT INTO "glue-catalog".analytics.daily_summary
SELECT
  DATE_TRUNC('day', order_date) AS day,
  COUNT(*) AS order_count,
  SUM(total) AS revenue,
  AVG(total) AS avg_order_value
FROM "glue-catalog".ecommerce.orders
WHERE order_date = CURRENT_DATE - INTERVAL '1' DAY
GROUP BY 1;

-- MERGE for upserts
MERGE INTO "glue-catalog".analytics.product_metrics AS target
USING (
  SELECT product_id, COUNT(*) AS orders, SUM(quantity) AS units_sold
  FROM "glue-catalog".ecommerce.order_items
  WHERE order_date >= CURRENT_DATE - INTERVAL '7' DAY
  GROUP BY product_id
) AS source
ON target.product_id = source.product_id
WHEN MATCHED THEN UPDATE SET orders = source.orders, units_sold = source.units_sold
WHEN NOT MATCHED THEN INSERT (product_id, orders, units_sold) VALUES (source.product_id, source.orders, source.units_sold);
```

## Federate with Non-AWS Sources

```sql
-- Join Glue products with external review and supplier data
SELECT
  g.product_name,
  g.price,
  g.category,
  pg.avg_rating,
  pg.review_count,
  sf.supplier_name,
  sf.lead_time_days
FROM "glue-catalog".ecommerce.products g
LEFT JOIN "postgres-reviews".public.product_reviews pg ON g.product_id = pg.product_id
LEFT JOIN "snowflake-supply".PUBLIC.SUPPLIERS sf ON g.supplier_id = sf.supplier_id
WHERE g.category = 'Electronics'
ORDER BY pg.avg_rating DESC;
```

## Build a Semantic Layer

```sql
CREATE VIEW analytics.gold.product_performance AS
SELECT
  g.product_id,
  g.product_name,
  g.category,
  g.price,
  SUM(oi.quantity) AS units_sold,
  SUM(oi.quantity * g.price) AS revenue,
  CASE
    WHEN SUM(oi.quantity) > 1000 THEN 'Best Seller'
    WHEN SUM(oi.quantity) > 100 THEN 'Popular'
    ELSE 'Niche'
  END AS popularity_tier
FROM "glue-catalog".ecommerce.products g
LEFT JOIN "glue-catalog".ecommerce.order_items oi ON g.product_id = oi.product_id
GROUP BY g.product_id, g.product_name, g.category, g.price;
```

In the **Catalog**, click **Edit** → **Generate Wiki** and **Generate Tags**.

## AI-Powered Analytics

### Dremio AI Agent

Ask "Which electronics products are best sellers?" and the AI Agent generates SQL from your semantic layer. The wiki descriptions you've attached to views guide the Agent's understanding of terms like "best seller" and "popularity tier."

### Dremio MCP Server

The [Dremio MCP Server](https://github.com/dremio/dremio-mcp) connects Claude and ChatGPT to your Glue-cataloged data:

1. Create a Native OAuth app in Dremio Cloud
2. Configure redirect URLs for your AI client
3. Connect using `mcp.dremio.cloud/mcp/{project_id}`

A product manager asks ChatGPT "Show me niche electronics products with high ratings that might be under-marketed" and gets governed results from your Glue lakehouse.

### AI SQL Functions

```sql
-- Generate product descriptions from catalog data
SELECT
  product_name,
  category,
  price,
  AI_GENERATE(
    'Write a one-sentence marketing description for this product',
    'Product: ' || product_name || ', Category: ' || category || ', Price: $' || CAST(price AS VARCHAR) || ', Popularity: ' || popularity_tier
  ) AS marketing_description
FROM analytics.gold.product_performance
WHERE popularity_tier = 'Best Seller';

-- Classify inventory risk
SELECT
  product_name,
  inventory_count,
  AI_CLASSIFY(
    'Based on inventory levels and sales velocity, classify the reorder urgency',
    'Product: ' || product_name || ', Stock: ' || CAST(inventory_count AS VARCHAR) || ', Units Sold (7d): ' || CAST(units_sold AS VARCHAR),
    ARRAY['Order Now', 'Order Soon', 'Adequate Stock', 'Overstocked']
  ) AS reorder_urgency
FROM "glue-catalog".ecommerce.products g
JOIN analytics.gold.product_performance pp ON g.product_id = pp.product_id;
```

## Reflections for Performance

Create Reflections on product performance and daily summary views to cache results and serve BI tools with sub-second response times:

1. In the **Catalog**, navigate to the view you want to accelerate
2. Click the **Reflections** tab
3. Choose **Raw Reflection** to cache the full view or **Aggregation Reflection** to pre-compute specific SUM/COUNT/AVG aggregations
4. Select columns to include in the Reflection
5. Set the **Refresh Interval** — how often Dremio re-queries the underlying Iceberg tables to update the cache
6. Click **Save**

Dashboard queries from Tableau, Power BI, or Looker connected via Arrow Flight hit the Reflection instead of re-reading S3 Iceberg files, providing sub-second response times even for complex aggregations.

## Time Travel on Glue Iceberg Tables

Iceberg tables cataloged in Glue support time travel through Dremio:

```sql
-- Query a table as it existed 7 days ago
SELECT product_id, price, inventory_count
FROM "glue-catalog".ecommerce.products
AT TIMESTAMP '2024-06-01 00:00:00';

-- Compare current state to a historical snapshot
SELECT
  curr.product_name,
  curr.price AS current_price,
  hist.price AS previous_price,
  ROUND((curr.price - hist.price) / hist.price * 100, 2) AS price_change_pct
FROM "glue-catalog".ecommerce.products curr
JOIN "glue-catalog".ecommerce.products AT TIMESTAMP '2024-01-01 00:00:00' hist
  ON curr.product_id = hist.product_id
WHERE curr.price != hist.price
ORDER BY ABS(price_change_pct) DESC;
```

Time travel is valuable for auditing ("What were inventory levels at quarter end?"), debugging ("What changed in the last 24 hours?"), and compliance ("Show data as it was on the regulatory reporting date").

## Governance on Glue Data

Dremio's Fine-Grained Access Control (FGAC) adds governance capabilities that Glue and Athena don't provide natively:

- **Column masking:** Hide sensitive fields (customer PII, pricing details) from specific roles while allowing full access for authorized users. For example, mask `customer_email` for marketing analysts but show it for customer support teams.
- **Row-level filtering:** Automatically filter data based on the querying user's role. A regional manager sees only their region's data. A global admin sees everything.
- **Unified policies:** The same governance policies apply whether data comes from Glue, PostgreSQL, Snowflake, or any other connected source.

These policies apply across all access methods — SQL Runner, BI tools via Arrow Flight/ODBC, AI Agent queries, and MCP Server interactions.

## Connect BI Tools via Arrow Flight

Dremio's Arrow Flight connector provides 10-100x faster data transfer compared to JDBC/ODBC for BI tools. After creating views over your Glue data, connect:

- **Tableau:** Use the Dremio connector, enter your Dremio Cloud endpoint
- **Power BI:** Use the Dremio ODBC driver or Arrow Flight connector
- **Python/Pandas:** Use `pyarrow.flight` client for high-speed data access
- **dbt:** Use the `dbt-dremio` adapter for transformation workflows

All queries from these tools benefit from Reflections, governance, and the semantic layer.

## VS Code Copilot Integration

Dremio's VS Code extension with Copilot integration lets developers query Glue-cataloged data directly from their IDE. Ask Copilot "Show me product inventory trends from the Glue catalog" and it generates SQL using Dremio's semantic layer — all without leaving your development environment.

## Glue vs. Athena vs. Dremio: When to Use Each

| Feature | AWS Glue | Amazon Athena | Dremio Cloud |
|---|---|---|---|
| **Purpose** | Metadata catalog | Serverless SQL | Federated analytics + catalog |
| **Pricing** | Free (metadata) | Per TB scanned | Compute-based |
| **Write support** | Via ETL jobs | Limited | Full DML |
| **Federation** | No | Federated queries (limited) | Full cross-source federation |
| **AI analytics** | No | No | AI Agent, MCP, SQL Functions |
| **Reflections** | No | No | Yes (automatic caching) |
| **Governance** | IAM only | IAM + Lake Formation | FGAC + semantic layer |

Glue is the metadata catalog. Athena is a query engine with per-TB pricing. Dremio is a federated platform that uses Glue as one of many catalogs and adds AI, governance, and performance acceleration.

## When to Keep Tables in Glue vs. Use Dremio's Open Catalog

**Keep in Glue:** Tables managed by existing AWS-native pipelines (EMR, Glue ETL), tables shared across multiple AWS services, data consumed by Athena or Redshift Spectrum alongside Dremio.

**Use Dremio's Open Catalog:** New analytical tables, data created through Dremio transformations, datasets where you want zero-configuration automatic maintenance (compaction, vacuuming, Autonomous Reflections).

You can use both simultaneously — Glue for your existing AWS lakehouse, Dremio's Open Catalog for new analytical workloads.

## Dremio vs. Athena for Querying Glue-Managed Tables

Both Dremio and Athena can query tables registered in the Glue Data Catalog. Key differences:

| Feature | Dremio Cloud | Amazon Athena |
|---|---|---|
| **Pricing** | Compute-based | $5/TB scanned |
| **Reflections** | ✅ Cache results | ❌ Scans every time |
| **Federation** | PostgreSQL, MongoDB, BigQuery, etc. | S3 + federated queries (limited) |
| **AI Agent** | ✅ Natural language queries | ❌ |
| **MCP Server** | ✅ Claude/ChatGPT integration | ❌ |
| **BI Tool Connectivity** | Arrow Flight (10-100x faster) | ODBC/JDBC only |
| **Governance** | Column masking + row filtering | Lake Formation policies |
| **Iceberg Write Support** | Full DML | Full DML |

For organizations already using Athena, Dremio adds federation, AI analytics, and cost savings through Reflections. Many teams run both: Athena for quick ad-hoc S3 queries, Dremio for cross-source analytics and BI tool serving.

## AWS Lake Formation Integration

AWS Lake Formation provides fine-grained access control for Glue-managed tables. When connecting to Glue through Dremio:

- **Lake Formation permissions** govern which tables and columns the Dremio IAM role can access
- **Dremio FGAC** adds additional governance layers (column masking, row-level filtering) on top of Lake Formation
- **Both layers work together:** Lake Formation controls what Dremio can see; Dremio FGAC controls what individual users see

This dual-layer governance model gives you AWS-native access control at the storage level and Dremio-managed access control at the query level — comprehensive governance without compromising on either side.

## Get Started

AWS Glue Data Catalog users can query, write, optimize, and AI-enrich their Iceberg tables through Dremio Cloud — with federation, governance, and performance acceleration that Athena and EMR don't provide.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-aws-glue-dremio-cloud&utm_content=alexmerced) and connect your Glue catalog.
