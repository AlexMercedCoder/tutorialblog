---
title: "Connect MySQL to Dremio Cloud: Federated Analytics Without ETL"
date: "2026-03-01"
description: "MySQL runs more web applications, SaaS platforms, and e-commerce backends than any other database. It's fast for transactional reads and writes, but it becom..."
author: "Alex Merced"
category: "Dremio Connectors"
bannerImage: "./images/connector-blogs/02/banner.png"
tags:
  - dremio
  - data integration
  - connectors
  - data lakehouse
  - federated queries
---

MySQL runs more web applications, SaaS platforms, and e-commerce backends than any other database. It's fast for transactional reads and writes, but it becomes a bottleneck when your data team needs to run analytical queries, join MySQL data with other sources, or build dashboards that don't compete with application traffic.

Dremio Cloud connects directly to MySQL and queries it in place. Your data stays where it is. Dremio pushes filters (called predicate pushdowns) to MySQL when possible, joins MySQL data with any other connected source, and accelerates repeated queries with pre-computed Reflections so your production database isn't hit by every dashboard refresh.

This guide covers everything from prerequisites to federated queries across MySQL and your other data sources.

## Why MySQL Users Need Dremio

**Analytics compete with application traffic.** MySQL was built for OLTP (Online Transaction Processing) — fast inserts, updates, and single-row lookups. Analytical queries that scan millions of rows, compute aggregations, or join large tables create lock contention and slow down application responses. Dremio's Reflections solve this: after the first query, analytical workloads hit Dremio's pre-computed cache instead of MySQL.

**Data is siloed.** Your order data is in MySQL, customer engagement data is in MongoDB, and marketing attribution data is in S3. Joining these requires building ETL pipelines that extract, transform, and load data into a central warehouse. Dremio eliminates this by querying each source in place and joining the results in its query engine. One SQL query, multiple sources.

**Read replicas are expensive and complex.** The common workaround for MySQL analytics is creating a read replica. This adds infrastructure cost, replication lag, and operational complexity. Dremio's Reflections provide the same benefit (offloading analytical reads) without a separate database instance. The query optimizer transparently serves results from Reflections when they match.

**No built-in semantic layer.** MySQL tables have raw column names and no business context. Dremio lets you create views with business logic (like defining what "active customer" means), attach wiki descriptions and labels to those views, and then let the AI Agent answer questions in plain English based on that context.

## Prerequisites

Before connecting MySQL to Dremio Cloud, confirm you have:

- **MySQL hostname or IP address**
- **Port number** — MySQL defaults to `3306`
- **Username and password** — a MySQL user with `SELECT` privileges on the tables you want to query
- **Network access** — port `3306` must be reachable from Dremio Cloud. Open the port in your AWS Security Group, Azure NSG, or firewall configuration
- **Dremio Cloud account** — [sign up free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-mysql-dremio-cloud&utm_content=alexmerced)

## Step-by-Step: Connect MySQL to Dremio Cloud

### 1. Add the MySQL Source

In the Dremio console, click the **"+"** button in the left sidebar, then select **MySQL** under database sources. Alternatively, go to **Databases** and click **Add database**.

### 2. Configure General Settings

- **Name:** A descriptive identifier (e.g., `ecommerce-mysql`). This name appears in SQL queries as the source prefix. Cannot include `/`, `:`, `[`, or `]`.
- **Host:** Your MySQL server's hostname (e.g., `my-rds-instance.abc123.us-east-1.rds.amazonaws.com`).
- **Port:** Default `3306`.
- **Database (optional):** Specify a single database to connect to, or leave blank to access all databases the user can see.

### 3. Set Authentication

Two options:

- **No Authentication:** For development instances with no password requirement.
- **Master Credentials:** Enter the MySQL username and password with `SELECT` permissions on your tables.

### 4. Configure Advanced Options

| Setting | What It Does | Default |
|---|---|---|
| **Net write timeout (in seconds)** | How long to wait for data from MySQL before dropping the connection. | 60 |
| **Record fetch size** | Rows per batch. Set to 0 for automatic. | 200 |
| **Maximum Idle Connections** | Idle connection pool size. | 8 |
| **Connection idle time (s)** | Seconds before idle connections close. | 60 |
| **Query timeout (s)** | Maximum query execution time before cancellation. | None |
| **Properties** | Custom JDBC connection key-value pairs. | None |

### 5. Set Reflection and Metadata Refresh

- **Reflection Refresh:** Controls how often Dremio re-queries MySQL to update pre-computed Reflections. For frequently changing data, set to 1-4 hours. For stable data, daily or weekly.
- **Metadata Refresh:** Controls how often Dremio checks for new tables or schema changes. Default is 1 hour for both discovery and details.

### 6. Set Privileges and Save

Optionally restrict which Dremio users can access this source. Click **Save**.

## Query MySQL Data in Dremio

Once connected, browse your MySQL schemas and tables in the SQL Runner:

```sql
SELECT order_id, customer_id, total_amount, order_date, status
FROM "ecommerce-mysql".shop.orders
WHERE order_date >= '2024-06-01'
  AND status = 'completed'
ORDER BY total_amount DESC;
```

Dremio pushes the date filter, status filter, and sort to MySQL — only the matching rows are transferred.

## Federate MySQL with Other Sources

Join MySQL order data with S3 clickstream data and PostgreSQL customer profiles in a single query:

```sql
SELECT
  c.customer_name,
  c.region,
  COUNT(o.order_id) AS total_orders,
  SUM(o.total_amount) AS total_revenue,
  COUNT(DISTINCT e.session_id) AS web_sessions
FROM "postgres-crm".public.customers c
LEFT JOIN "ecommerce-mysql".shop.orders o
  ON c.customer_id = o.customer_id
LEFT JOIN "s3-analytics".clickstream.sessions e
  ON c.customer_id = e.user_id
GROUP BY c.customer_name, c.region
ORDER BY total_revenue DESC;
```

No ETL. No data warehouse loading. Three sources, one query.

## Build Views and Enable the AI Agent

Create business-friendly views over MySQL data:

```sql
CREATE VIEW analytics.gold.order_summary AS
SELECT
  o.order_id,
  o.customer_id,
  o.total_amount,
  CAST(o.order_date AS TIMESTAMP) AS order_timestamp,
  o.status AS order_status,
  CASE
    WHEN o.total_amount > 500 THEN 'High Value'
    WHEN o.total_amount > 100 THEN 'Medium Value'
    ELSE 'Standard'
  END AS order_tier
FROM "ecommerce-mysql".shop.orders o
WHERE o.status IN ('completed', 'shipped');
```

Then navigate to the **Catalog**, click **Edit** (pencil icon) on the view, go to the **Details** tab, and click **Generate Wiki** and **Generate Tags**. This gives Dremio's AI Agent the context it needs to answer questions like "How many high-value orders shipped last month?"

## Predicate Pushdown: What Runs on MySQL

Dremio pushes a wide range of operations directly to MySQL, including:

- **Logical:** AND, OR, NOT
- **Comparisons:** =, !=, <, >, <=, >=, LIKE, NOT LIKE, IS NULL, IS NOT NULL
- **Aggregations:** SUM, AVG, COUNT, MIN, MAX, STDDEV, VAR_POP
- **Math:** ABS, CEIL, FLOOR, ROUND, MOD, SQRT, POWER, LOG, EXP
- **String:** CONCAT, SUBSTR, LENGTH, LOWER, UPPER, TRIM, REPLACE, REVERSE
- **Date/Time:** DATE_ADD, DATE_SUB, DATE_TRUNC, EXTRACT, TIMESTAMPADD, TIMESTAMPDIFF

This minimizes data transfer between MySQL and Dremio. Only the results of pushed-down operations cross the network.

## Data Type Mapping

Key MySQL-to-Dremio type conversions:

| MySQL | Dremio | Notes |
|---|---|---|
| INT / INTEGER | INTEGER | |
| BIGINT | BIGINT | UNSIGNED converts to BIGINT |
| FLOAT | FLOAT | |
| DOUBLE / REAL | DOUBLE | |
| DECIMAL | DECIMAL | |
| VARCHAR / TEXT / CHAR | VARCHAR | ENUM and SET also map to VARCHAR |
| DATE | DATE | |
| DATETIME / TIMESTAMP | TIMESTAMP | |
| TIME | TIME | |
| BLOB / BINARY / VARBINARY | VARBINARY | |
| BIT | BOOLEAN | |
| TINYINT / SMALLINT / MEDIUMINT | INTEGER | |
| YEAR | INTEGER | |

MySQL-specific types like `JSON` or `GEOMETRY` are not supported through the connector.

## MySQL vs. Iceberg: When to Migrate

Keep data in MySQL when it's actively written and read by your application. Migrate historical or analytical datasets to Apache Iceberg tables in Dremio's Open Catalog when:

- The data doesn't change often (closed orders, historical logs)
- You need time travel (query the table as of any past timestamp)
- You want automated performance management (compaction, manifest optimization)
- You want Autonomous Reflections (Dremio auto-creates materializations based on query patterns)

For data that's still being written by your app, query it through the MySQL connector and create manual Reflections with a refresh schedule that matches your freshness needs.

## AI-Powered Analytics on MySQL Data

### Dremio AI Agent

The AI Agent lets business users ask questions about MySQL data in plain English. A marketing manager asks "How many high-value orders shipped last month?" and the Agent generates the correct SQL by reading your view's wiki descriptions. It understands "high-value" means `total_amount > 500` and "shipped" means `status = 'shipped'` because you defined those in the semantic layer.

### Dremio MCP Server

The [Dremio MCP Server](https://github.com/dremio/dremio-mcp) connects external AI chat clients (Claude, ChatGPT) to your MySQL data through Dremio with OAuth authentication:

1. Create a Native OAuth application in Dremio Cloud
2. Configure redirect URLs (e.g., `https://claude.ai/api/mcp/auth_callback` for Claude)
3. Connect using `mcp.dremio.cloud/mcp/{project_id}`

An e-commerce manager asks Claude "What's our average order value by region this quarter from MySQL?" and gets governed, accurate results — no SQL required.

### AI SQL Functions

Use AI directly in queries against MySQL data:

```sql
-- Classify orders by likely customer intent
SELECT
  order_id,
  total_amount,
  order_tier,
  AI_CLASSIFY(
    'Based on this order, classify the likely purchase motivation',
    'Amount: $' || CAST(total_amount AS VARCHAR) || ', Status: ' || order_status || ', Tier: ' || order_tier,
    ARRAY['Impulse Buy', 'Planned Purchase', 'Bulk Order', 'Reorder']
  ) AS purchase_motivation
FROM analytics.gold.order_summary
WHERE order_status = 'completed';

-- Generate order analysis summaries
SELECT
  DATE_TRUNC('week', order_timestamp) AS week,
  COUNT(*) AS orders,
  SUM(total_amount) AS revenue,
  AI_GENERATE(
    'Write a one-sentence weekly sales summary',
    'Orders: ' || CAST(COUNT(*) AS VARCHAR) || ', Revenue: $' || CAST(SUM(total_amount) AS VARCHAR) || ', High Value Orders: ' || CAST(SUM(CASE WHEN order_tier = 'High Value' THEN 1 ELSE 0 END) AS VARCHAR)
  ) AS weekly_summary
FROM analytics.gold.order_summary
GROUP BY DATE_TRUNC('week', order_timestamp)
ORDER BY week DESC
LIMIT 12;
```

`AI_CLASSIFY` runs LLM inference inline, categorizing each order. `AI_GENERATE` produces narrative summaries. Both enrich MySQL data with AI in real time.

## Reflections for Performance

MySQL is optimized for OLTP — row-level reads and writes. Analytical aggregation queries compete with application workloads. Dremio's Reflections offload these:

1. Navigate to the view in the **Catalog**
2. Click the **Reflections** tab
3. Choose **Raw Reflection** or **Aggregation Reflection**
4. Select columns and set the **Refresh Interval**
5. Click **Save**

BI tools get sub-second responses from Reflections. MySQL focuses on serving your application.

## Governance on MySQL Data

MySQL has database-level grants but no column masking or row-level filtering. Dremio's Fine-Grained Access Control (FGAC) adds these:

- **Column masking:** Mask customer email, payment details, or pricing from specific roles. A marketing analyst sees order counts but not individual customer data.
- **Row-level filtering:** Restrict data by store, region, or department based on user role.
- **Unified policies:** Same governance applies across MySQL, PostgreSQL, S3, and all other sources.

These policies apply across SQL Runner, BI tools (Arrow Flight/ODBC), AI Agent, and MCP Server.

## Connect BI Tools via Arrow Flight

Arrow Flight provides 10-100x faster data transfer than JDBC/ODBC:

- **Tableau:** Dremio connector for direct Arrow Flight access
- **Power BI:** Dremio ODBC driver or native connector
- **Python/Pandas:** `pyarrow.flight` for programmatic data access
- **Looker:** Connect via JDBC
- **dbt:** `dbt-dremio` for SQL-based transformations

All queries benefit from Reflections, governance, and the semantic layer.

## VS Code Copilot Integration

Dremio's VS Code extension with Copilot integration lets developers query MySQL data from their IDE. Ask Copilot "Show me high-value orders from MySQL this week" and get SQL generated from your semantic layer.

## When to Keep Data in MySQL vs. Migrate

**Keep in MySQL:** Transactional data for active applications, data with application-level foreign key constraints, operational data where real-time writes matter.

**Migrate to Iceberg:** Historical order archives, reporting data, data consumed by non-application tools, datasets where MySQL replication lag creates analytics latency. Migrated Iceberg tables get automatic compaction, time travel, and Autonomous Reflections.

For data staying in MySQL, create manual Reflections to offload analytical queries. For migrated Iceberg data, Dremio handles optimization automatically.

## Get Started

MySQL users don't need to build ETL pipelines or provision a data warehouse to get analytical value from their data. Dremio Cloud connects to MySQL in minutes and gives you federation, acceleration, governance, and AI analytics on top.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-mysql-dremio-cloud&utm_content=alexmerced) and connect your MySQL databases.
