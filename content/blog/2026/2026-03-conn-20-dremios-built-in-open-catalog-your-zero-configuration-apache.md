---
title: "Dremio's Built-in Open Catalog: Your Zero-Configuration Apache Iceberg Lakehouse"
date: "2026-03-01"
description: "Every Dremio Cloud account starts with a built-in Open Catalog — a fully managed Apache Iceberg catalog with integrated storage. When you create a Dremio C..."
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

Every Dremio Cloud account starts with a built-in Open Catalog — a fully managed Apache Iceberg catalog with integrated storage. When you create a Dremio Cloud project, you immediately have a catalog where you can create namespaces (folders), tables, and views without connecting any external sources, configuring storage, or setting up credentials.

This isn't a bare-bones starting point. The built-in Open Catalog is a production-grade Iceberg catalog with automated performance management, Autonomous Reflections, time travel, branching, and full DML support. It's the fastest path from "sign up" to "running analytics."

Organizations typically spend days or weeks setting up external catalogs — provisioning S3 buckets, configuring IAM roles, debugging credential chains, and testing connectivity. With the built-in Open Catalog, you skip all of that. Your first `CREATE TABLE` runs minutes after account creation.

The Open Catalog is particularly powerful for teams adopting a lakehouse architecture for the first time. Instead of evaluating AWS Glue, Unity Catalog, and Snowflake Open Catalog (each with different setup complexity, vendor dependencies, and pricing models), start with the built-in catalog. You can always connect external catalogs later and federate across them.

### Cross-Catalog Federation

The Open Catalog works alongside external catalogs. A common architecture:

- **Open Catalog:** Dremio-created analytical tables and views (gold layer, semantic layer)
- **AWS Glue:** Existing Iceberg tables managed by Spark/EMR pipelines
- **PostgreSQL:** Operational application data

Dremio federates across all three in a single SQL query. Views in the Open Catalog can reference tables from any connected source, creating a unified analytical layer that spans your entire data estate.

### Branching and Tagging

The Open Catalog supports Iceberg's branching and tagging capabilities:

- **Branches:** Create isolated copies of table metadata for development and testing. Changes on a branch don't affect the main table until merged.
- **Tags:** Create named snapshots for milestone tracking (e.g., `quarterly-report-2024-Q2`).

These features enable data engineering workflows where teams can test transformations on branches before promoting changes to production tables.

## Why Start with the Built-in Open Catalog

### Zero Configuration

External catalogs (Glue, Unity, Snowflake Open Catalog) require AWS IAM roles, network configuration, credential management, and catalog-specific setup. The built-in Open Catalog requires nothing — it's already configured when your project is created. Create a folder, write SQL, and start working.

### Automated Performance Management

Dremio automatically manages the performance of Iceberg tables in the built-in catalog:

- **Auto-compaction:** Small files are automatically merged into optimally sized files (typically 256MB). This prevents the "small file problem" that degrades query performance over time.
- **Manifest rewriting:** Table manifests are automatically optimized for faster metadata reads.
- **Data clustering:** Dremio sorts data based on query patterns to improve predicate pushdown efficiency.
- **Vacuuming:** Expired snapshots and orphaned data files are automatically cleaned up.
- **Results caching:** Query results are cached and served for identical subsequent queries.

None of these require manual `OPTIMIZE` commands or scheduled maintenance jobs. Dremio handles it all in the background.

### Autonomous Reflections

For tables in the built-in catalog, Dremio can automatically create and manage Reflections based on observed query patterns. If a specific view is queried frequently with certain filters and aggregations, Dremio creates a Reflection to accelerate those patterns without any manual configuration. This automated acceleration means your most common queries get faster over time.

### Time Travel

Query any table as it existed at any point in the past:

```sql
-- Query table as it was 7 days ago
SELECT * FROM catalog_folder.my_table AT TIMESTAMP '2024-06-01 00:00:00';

-- Query a specific snapshot
SELECT * FROM catalog_folder.my_table AT SNAPSHOT '1234567890123456789';
```

Time travel is valuable for auditing ("What did customer balances look like at quarter end?"), debugging ("What changed in the last 24 hours?"), and compliance ("Show me the data as it was on the regulatory reporting date").

### Full DML Support

The built-in catalog supports all standard DML operations:

```sql
-- INSERT
INSERT INTO analytics.bronze.events
SELECT event_type, user_id, event_timestamp
FROM "s3-datalake".events.raw_events
WHERE event_date = CURRENT_DATE - INTERVAL '1' DAY;

-- UPDATE
UPDATE analytics.silver.customers
SET segment = 'Enterprise'
WHERE total_spend > 100000;

-- DELETE
DELETE FROM analytics.bronze.events
WHERE event_timestamp < CURRENT_DATE - INTERVAL '365' DAY;

-- MERGE (upsert)
MERGE INTO analytics.silver.customers AS target
USING (
  SELECT customer_id, SUM(amount) AS total_spend
  FROM analytics.bronze.orders
  GROUP BY customer_id
) AS source
ON target.customer_id = source.customer_id
WHEN MATCHED THEN UPDATE SET total_spend = source.total_spend
WHEN NOT MATCHED THEN INSERT (customer_id, total_spend) VALUES (source.customer_id, source.total_spend);
```

## Getting Started: Create Your First Tables

When you query items in the built-in catalog, you don't include a source name prefix — just the folder path and table/view name:

```sql
-- Create namespace structure
CREATE FOLDER IF NOT EXISTS analytics;
CREATE FOLDER IF NOT EXISTS analytics.bronze;
CREATE FOLDER IF NOT EXISTS analytics.silver;
CREATE FOLDER IF NOT EXISTS analytics.gold;

-- Create a table from an external source
CREATE TABLE analytics.bronze.raw_orders AS
SELECT order_id, customer_id, product_id, quantity, price, order_date
FROM "postgres-orders".public.orders
WHERE order_date >= '2024-01-01';

-- Create a transformed table
CREATE TABLE analytics.silver.enriched_orders AS
SELECT
  o.order_id,
  o.customer_id,
  c.customer_name,
  c.region,
  o.product_id,
  p.product_name,
  p.category,
  o.quantity,
  o.price,
  o.quantity * o.price AS total_amount,
  o.order_date
FROM analytics.bronze.raw_orders o
JOIN "postgres-orders".public.customers c ON o.customer_id = c.customer_id
JOIN "postgres-orders".public.products p ON o.product_id = p.product_id;

-- Create an analytics view
CREATE VIEW analytics.gold.revenue_summary AS
SELECT
  region,
  category,
  DATE_TRUNC('month', order_date) AS month,
  SUM(total_amount) AS revenue,
  COUNT(*) AS orders,
  COUNT(DISTINCT customer_id) AS unique_customers,
  ROUND(SUM(total_amount) / COUNT(DISTINCT customer_id), 2) AS revenue_per_customer
FROM analytics.silver.enriched_orders
GROUP BY region, category, DATE_TRUNC('month', order_date);
```

## Build a Semantic Layer

```sql
CREATE VIEW analytics.gold.product_performance AS
SELECT
  category,
  product_name,
  SUM(total_amount) AS revenue,
  COUNT(*) AS orders,
  CASE
    WHEN SUM(total_amount) > 100000 THEN 'Top Performer'
    WHEN SUM(total_amount) > 10000 THEN 'Solid'
    ELSE 'Emerging'
  END AS performance_tier
FROM analytics.silver.enriched_orders
GROUP BY category, product_name;
```

In the **Catalog**, click **Edit** (pencil icon) → **Generate Wiki** and **Generate Tags**. These descriptions power AI features.

## AI-Powered Analytics

### Dremio AI Agent

The AI Agent reads your semantic layer to answer questions in plain English: "What's our top performing product category this quarter?" or "Show me revenue per customer by region." The wiki descriptions you create tell the Agent what "top performing" and "revenue per customer" mean, generating accurate SQL automatically.

### Dremio MCP Server

The [Dremio MCP Server](https://github.com/dremio/dremio-mcp) connects external AI tools to your catalog data:

1. Create a Native OAuth app in Dremio Cloud
2. Configure redirect URLs for your AI client (Claude, ChatGPT)
3. Connect via `mcp.dremio.cloud/mcp/{project_id}`

A VP of Product asks Claude "Compare our product category performance and identify emerging categories with high growth potential" and gets governed, accurate analysis.

### AI SQL Functions

```sql
-- Generate product analysis with AI
SELECT
  product_name,
  performance_tier,
  revenue,
  AI_GENERATE(
    'Write a one-sentence growth strategy for this product',
    'Product: ' || product_name || ', Category: ' || category || ', Revenue: $' || CAST(revenue AS VARCHAR) || ', Tier: ' || performance_tier
  ) AS growth_strategy
FROM analytics.gold.product_performance;

-- Classify products for portfolio management
SELECT
  product_name,
  AI_CLASSIFY(
    'Based on revenue and order volume, classify investment priority',
    'Revenue: $' || CAST(revenue AS VARCHAR) || ', Orders: ' || CAST(orders AS VARCHAR),
    ARRAY['Strategic Investment', 'Maintain', 'Optimize', 'Sunset']
  ) AS investment_priority
FROM analytics.gold.product_performance;
```

## Built-in vs. External Catalogs

| Feature | Built-in Open Catalog | External Catalogs (Glue, Unity, etc.) |
|---|---|---|
| Setup | Zero configuration | Requires IAM, networking, credentials |
| Auto-compaction | ✅ Automatic | ✅ For Iceberg tables |
| Autonomous Reflections | ✅ Automatic | Manual Reflections only |
| Time travel | ✅ Full support | ✅ For Iceberg tables |
| Write support | ✅ Full DML | Varies by catalog |
| Credential management | None needed | IAM roles or keys required |
| Storage costs | Included in Dremio | Separate cloud storage costs |

The built-in catalog is ideal for getting started, prototyping, and production workloads. External catalogs are valuable when your organization already manages data in Glue, Unity, or Snowflake Open Catalog and wants to query that data through Dremio.

## Governance in the Open Catalog

Dremio's Fine-Grained Access Control (FGAC) provides enterprise-grade governance on all Open Catalog data:

- **Column masking:** Mask sensitive columns (customer PII, financial details) from specific roles. A data analyst sees `customer_name` but not `social_security_number`.
- **Row-level filtering:** Automatically restrict data visibility based on user roles. A regional manager querying `revenue_summary` sees only their region.
- **Unified policies:** The same governance policies apply across Open Catalog tables, external catalogs, and database sources — one set of rules for all data.

These policies apply across SQL Runner, BI tools (Arrow Flight/ODBC), AI Agent queries, and MCP Server interactions.

## Connect BI Tools via Arrow Flight

Dremio's Arrow Flight connector provides 10-100x faster data transfer than JDBC/ODBC. After building views in the Open Catalog:

- **Tableau:** Use the Dremio connector for direct Arrow Flight access
- **Power BI:** Use Dremio's ODBC driver or native connector
- **Python/Pandas:** Use `pyarrow.flight` for high-speed programmatic data access
- **Looker:** Connect via JDBC
- **dbt:** Use `dbt-dremio` adapter for SQL-based transformations

All queries benefit from Autonomous Reflections, governance, and the semantic layer.

## VS Code Copilot Integration

Dremio's VS Code extension with Copilot integration lets developers query Open Catalog data from their IDE. Ask Copilot "Show me this week's revenue by product category" and it generates SQL using your semantic layer — without switching to the Dremio console.

## Data Lifecycle Management

The Open Catalog supports a complete data lifecycle:

1. **Bronze layer:** Ingest raw data from external sources using `CREATE TABLE ... AS SELECT`
2. **Silver layer:** Apply transformations, deduplication, and type casting with `CREATE TABLE ... AS SELECT` or `MERGE` for incremental updates
3. **Gold layer:** Create analytical views with business logic for the semantic layer
4. **Archival:** Use `DELETE` with time-based conditions to remove old data; use time travel to access historical snapshots before deletion

This medallion architecture runs entirely within Dremio — no external ETL tools, Spark clusters, or scheduled scripts needed.

### Incremental Loading Patterns

For ongoing data ingestion, use `MERGE` to incrementally update tables without full reloads:

```sql
-- Incremental merge: only update changed records
MERGE INTO analytics.silver.customers AS target
USING (
  SELECT customer_id, customer_name, email, segment, updated_at
  FROM "postgres-crm".public.customers
  WHERE updated_at > (SELECT MAX(updated_at) FROM analytics.silver.customers)
) AS source
ON target.customer_id = source.customer_id
WHEN MATCHED THEN UPDATE SET
  customer_name = source.customer_name,
  email = source.email,
  segment = source.segment,
  updated_at = source.updated_at
WHEN NOT MATCHED THEN INSERT (customer_id, customer_name, email, segment, updated_at)
  VALUES (source.customer_id, source.customer_name, source.email, source.segment, source.updated_at);
```

This pattern transfers only changed records, minimizing network traffic and compute costs.

### Time Travel Best Practices

Time travel is particularly valuable in the Open Catalog for:

- **End-of-quarter reporting:** Query tables at exact quarter-end timestamps for regulatory submissions
- **Debugging data issues:** Compare current data with a previous snapshot to identify when and what changed
- **Audit trails:** Demonstrate data state at any point in time for compliance requirements
- **Recovery:** If a bad `UPDATE` or `DELETE` corrupts data, query the pre-change snapshot and restore

```sql
-- Compare current vs 24-hours-ago to find changed records
SELECT current_data.customer_id, current_data.segment AS new_segment, old_data.segment AS old_segment
FROM analytics.silver.customers current_data
JOIN analytics.silver.customers AT TIMESTAMP '2024-06-14 00:00:00' old_data
  ON current_data.customer_id = old_data.customer_id
WHERE current_data.segment <> old_data.segment;
```

## Get Started

Every Dremio Cloud account includes the Open Catalog, ready to go. No setup, no configuration, no external dependencies. Create your first table in under a minute.

The Open Catalog isn't just for prototyping — it's production-grade from day one. Organizations run terabyte-scale analytical workloads on the built-in catalog with automated performance management handling compaction, vacuuming, and Reflection optimization in the background. Start small with a few tables, then scale to hundreds of tables and dozens of users as your lakehouse grows. The same zero-configuration promise holds at scale.

For teams new to the lakehouse concept, the Open Catalog is the lowest-friction entry point available. Data engineers familiar with SQL can build a complete medallion architecture (bronze → silver → gold) in a single afternoon, with AI capabilities and governance ready to activate immediately.

[Sign up for Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-dremio-open-catalog-dremio-cloud&utm_content=alexmerced) and start building your lakehouse immediately.
