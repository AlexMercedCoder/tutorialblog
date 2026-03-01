---
title: "Connect Microsoft SQL Server to Dremio Cloud: Federate Enterprise Data Without ETL"
date: "2026-03-01"
description: "Microsoft SQL Server is one of the most widely deployed enterprise databases in the world. ERP systems, CRM platforms, financial applications, and custom bus..."
author: "Alex Merced"
category: "Dremio Connectors"
bannerImage: "./images/connector-blogs/04/banner.png"
tags:
  - dremio
  - data integration
  - connectors
  - data lakehouse
  - federated queries
---

Microsoft SQL Server is one of the most widely deployed enterprise databases in the world. ERP systems, CRM platforms, financial applications, and custom business applications run on SQL Server across on-premises data centers and Azure cloud deployments. But connecting SQL Server data to a modern analytics platform typically requires building ETL pipelines, managing SSIS packages, or purchasing additional SQL Server Enterprise licenses for analytics workloads.

Dremio Cloud connects directly to SQL Server and queries it alongside S3, PostgreSQL, Snowflake, BigQuery, MongoDB, and every other connected source in a single SQL query. You don't need to extract data from SQL Server, build staging tables, or manage nightly ETL jobs. Dremio reads SQL Server in place, applies governance, and accelerates repeated queries with Reflections.

SQL Server licensing is notoriously expensive — Enterprise edition costs tens of thousands of dollars per core. Running analytical queries directly against production SQL Server instances consumes CPU capacity that's licensed for transactional workloads. Dremio's Reflections cache analytical results, offloading read-heavy queries from SQL Server and potentially allowing organizations to reduce their SQL Server core count or downgrade from Enterprise to Standard edition.

## Why SQL Server Users Need Dremio

### Escape Linked Server Limitations

SQL Server's linked servers provide basic federation, but they're limited: poor cross-platform support (try linking to MongoDB or BigQuery), no query optimization across links, no governance layer, and performance degrades with large result sets. Dremio's federation engine is purpose-built for cross-source queries — it pushes predicates to each source, optimizes join strategies, and handles large-scale data movement efficiently.

### Reduce SQL Server License Costs

SQL Server Enterprise licensing is expensive — especially when analytical workloads compete with transactional OLTP operations for CPU and memory. Dremio's Reflections offload repeated analytical queries from SQL Server: dashboard refreshes, scheduled reports, and ad-hoc exploration hit cached Reflections instead of SQL Server. This can reduce the SQL Server resources dedicated to analytics, potentially allowing you to downgrade from Enterprise to Standard edition or reduce core counts.

### Multi-Cloud, Multi-Database Analytics

Your SQL Server holds ERP data, but your data lake is on S3, your marketing data is in Google BigQuery, and your modern applications use PostgreSQL. Without Dremio, combining these requires SSIS packages, Azure Data Factory, or custom ETL for each source. Dremio queries all of them in a single SQL statement.

### Unified Governance Beyond Windows

SQL Server has Windows Authentication and SQL Logins, but these don't apply to your S3 data lake, BigQuery, or PostgreSQL. Dremio's Fine-Grained Access Control applies column masking and row-level filtering consistently across SQL Server and every other connected source.

### AI Analytics on Enterprise Data

SQL Server stores decades of business data — financial records, customer histories, inventory movements. Dremio's AI Agent, MCP Server, and AI SQL Functions make that historical data queryable by natural language and enrichable by AI, unlocking insights that would otherwise require a data analyst with deep institutional knowledge.

## Prerequisites

- **SQL Server hostname or IP address**
- **Port** — default `1433`
- **Database name**
- **Username and password** (SQL Authentication) — user needs SELECT permissions on target schemas and tables
- **Network access** — port 1433 must be reachable from Dremio Cloud. For on-premises SQL Server, configure VPN or firewall rules
- **Dremio Cloud account** — [sign up free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-sqlserver-dremio-cloud&utm_content=alexmerced) with $400 in compute credits

## Step-by-Step: Connect SQL Server to Dremio Cloud

### 1. Add the Source

Click **"+"** in the Dremio console and select **Microsoft SQL Server**.

### 2. Configure Connection

- **Name:** Descriptive identifier (e.g., `sqlserver-erp` or `production-db`).
- **Host:** SQL Server hostname or IP address.
- **Port:** Default `1433`.
- **Database:** The database name to connect to.

### 3. Set Authentication

Enter SQL Authentication credentials (username/password) or use Secret Resource URL for centralized credential management via AWS Secrets Manager.

### 4. Configure Advanced Options

| Setting | Purpose | Default |
|---|---|---|
| **Record fetch size** | Rows per batch from SQL Server | 200 |
| **Maximum Idle Connections** | Connection pool management | 8 |
| **Connection Idle Time (s)** | Seconds before idle connections close | 60 |
| **Encrypt Connection** | Enable SSL/TLS | Off |
| **SSL Verification** | Verify SSL server certificate | Off |
| **Hostname in Certificate** | Expected hostname in SSL certificate | None |
| **Connection Properties** | Custom JDBC parameters | None |

### 5. Configure Reflection Refresh and Metadata, Save

## Query SQL Server Data

```sql
-- Query ERP inventory data
SELECT
  product_id,
  product_name,
  warehouse_location,
  quantity_on_hand,
  reorder_point
FROM "sqlserver-erp".dbo.products
WHERE quantity_on_hand < reorder_point
ORDER BY quantity_on_hand ASC;

-- Financial reporting
SELECT
  department_code,
  account_category,
  fiscal_quarter,
  SUM(actual_amount) AS actual_spend,
  SUM(budget_amount) AS budgeted,
  ROUND((SUM(actual_amount) - SUM(budget_amount)) / NULLIF(SUM(budget_amount), 0) * 100, 1) AS variance_pct
FROM "sqlserver-erp".finance.budget_actuals
WHERE fiscal_year = 2024
GROUP BY department_code, account_category, fiscal_quarter
ORDER BY ABS(SUM(actual_amount) - SUM(budget_amount)) DESC;
```

## Federate SQL Server with Other Sources

```sql
-- Join SQL Server ERP with PostgreSQL CRM and S3 marketing data
SELECT
  ss.product_name,
  ss.quantity_on_hand,
  pg.total_orders,
  pg.avg_order_value,
  s3.click_through_rate,
  CASE
    WHEN pg.total_orders > 100 AND ss.quantity_on_hand < 50 THEN 'Reorder - High Demand'
    WHEN pg.total_orders < 10 AND ss.quantity_on_hand > 500 THEN 'Overstock - Reduce'
    ELSE 'Normal'
  END AS inventory_action
FROM "sqlserver-erp".dbo.products ss
LEFT JOIN (
  SELECT product_id, COUNT(*) AS total_orders, AVG(order_value) AS avg_order_value
  FROM "postgres-crm".public.orders
  WHERE order_date >= '2024-01-01'
  GROUP BY product_id
) pg ON ss.product_id = pg.product_id
LEFT JOIN "s3-marketing".analytics.product_clicks s3 ON ss.product_id = s3.product_id
WHERE ss.quantity_on_hand < ss.reorder_point OR pg.total_orders > 100
ORDER BY pg.total_orders DESC;
```

## Build a Semantic Layer

```sql
CREATE VIEW analytics.gold.inventory_management AS
SELECT
  p.product_id,
  p.product_name,
  p.warehouse_location,
  p.quantity_on_hand,
  p.reorder_point,
  CASE
    WHEN p.quantity_on_hand = 0 THEN 'Out of Stock'
    WHEN p.quantity_on_hand < p.reorder_point * 0.5 THEN 'Critical'
    WHEN p.quantity_on_hand < p.reorder_point THEN 'Low'
    ELSE 'Adequate'
  END AS stock_status,
  ROUND(p.quantity_on_hand * p.unit_cost, 2) AS inventory_value
FROM "sqlserver-erp".dbo.products p;
```

In the **Catalog**, click **Edit** → **Generate Wiki** and **Generate Tags**. Create descriptions like: "inventory_management: One row per product showing current stock levels, stock status classification, and estimated inventory value. Use this view to monitor reorder needs."

## AI-Powered Analytics on SQL Server Data

### Dremio AI Agent

The AI Agent lets operations managers ask "Which products are critically low at the Chicago warehouse?" without writing SQL. The Agent reads your wiki descriptions, understands "Critical" means stock below 50% of reorder point, and generates accurate queries. This is transformative for SQL Server environments where tribal knowledge about table schemas and column meanings lives in senior employees' heads.

### Dremio MCP Server

Connect [Claude or ChatGPT](https://github.com/dremio/dremio-mcp) to your SQL Server data:

1. Create a Native OAuth app in Dremio Cloud
2. Configure redirect URLs for your AI client
3. Connect via `mcp.dremio.cloud/mcp/{project_id}`

A warehouse manager asks Claude "Show me all products that need reordering, sorted by how critical the shortage is" and gets actionable results from the semantic layer over SQL Server — no SQL, no SSMS.

### AI SQL Functions

```sql
-- Generate reorder recommendations with AI
SELECT
  product_name,
  stock_status,
  quantity_on_hand,
  reorder_point,
  AI_GENERATE(
    'Write a one-sentence reorder recommendation based on inventory status',
    'Product: ' || product_name || ', Stock: ' || CAST(quantity_on_hand AS VARCHAR) || ', Reorder Point: ' || CAST(reorder_point AS VARCHAR) || ', Status: ' || stock_status
  ) AS reorder_recommendation
FROM analytics.gold.inventory_management
WHERE stock_status IN ('Critical', 'Out of Stock');

-- Classify financial variances
SELECT
  department_code,
  variance_pct,
  AI_CLASSIFY(
    'Based on the budget variance, classify the financial risk level',
    'Department: ' || department_code || ', Variance: ' || CAST(variance_pct AS VARCHAR) || '%',
    ARRAY['On Track', 'Minor Variance', 'Significant Overspend', 'Critical Overspend']
  ) AS financial_risk
FROM (
  SELECT department_code, ROUND((SUM(actual_amount) - SUM(budget_amount)) / NULLIF(SUM(budget_amount), 0) * 100, 1) AS variance_pct
  FROM "sqlserver-erp".finance.budget_actuals
  WHERE fiscal_year = 2024
  GROUP BY department_code
);
```

## Reflections for Performance

SQL Server Enterprise charges per-core licensing. Offloading analytical queries to Reflections reduces compute pressure on SQL Server cores:

1. Navigate to the view in the **Catalog**
2. Click the **Reflections** tab
3. Choose **Raw Reflection** or **Aggregation Reflection**
4. Select columns and set the **Refresh Interval** — for ERP data updated throughout the day, hourly; for financial data, match to reporting cycles
5. Click **Save**

BI tools get sub-second response times from Reflections. SQL Server focuses on transactional OLTP workloads. A financial dashboard refreshing every 15 minutes generates zero SQL Server load after the Reflection is built.

## Governance Across SQL Server and Other Sources

Dremio's Fine-Grained Access Control (FGAC) extends SQL Server security to every connected source:

- **Column masking:** Mask financial data, salary details, or PII from specific roles. A warehouse manager sees inventory levels but not cost data.
- **Row-level filtering:** Regional managers see only their region's data. Department heads see only their department.
- **Unified policies:** Same governance applies across SQL Server, PostgreSQL, S3, and all other sources.

These policies apply across SQL Runner, BI tools (Arrow Flight/ODBC), AI Agent, and MCP Server.

## Connect BI Tools via Arrow Flight

Arrow Flight provides 10-100x faster data transfer than JDBC/ODBC for SQL Server data:

- **Power BI:** Dremio native connector — ideal for Microsoft-centric organizations
- **Tableau:** Dremio connector for direct Arrow Flight access
- **Python/Pandas:** `pyarrow.flight` for programmatic data access
- **Looker:** Connect via JDBC
- **dbt:** `dbt-dremio` adapter for transformation workflows

All queries benefit from Reflections, governance, and the semantic layer.

## VS Code Copilot Integration

Dremio's VS Code extension with Copilot integration lets developers query SQL Server data from their IDE. Ask Copilot "Show me products below reorder point at the Chicago warehouse" and get SQL generated from your semantic layer.

## When to Keep Data in SQL Server vs. Migrate

**Keep in SQL Server:** Transactional data for active applications, data with stored procedures and triggers, operational systems that depend on SQL Server features (SSRS, SSIS, linked servers).

**Migrate to Iceberg:** Historical records and archives, reporting data, data consumed by non-SQL-Server tools, datasets where SQL Server per-core licensing cost exceeds analytical value. Migrated Iceberg tables get Dremio's automatic compaction, time travel, and Autonomous Reflections.

For data staying in SQL Server, create manual Reflections. For migrated Iceberg data, Dremio handles optimization automatically.

## Query Pushdown to SQL Server

Dremio's federation engine optimizes cross-source queries by pushing operations to SQL Server whenever possible:

- **Filter pushdown:** `WHERE` clauses are pushed to SQL Server, so only matching rows are transferred
- **Projection pushdown:** Only the columns referenced in your query are requested from SQL Server
- **Aggregate pushdown:** `SUM`, `COUNT`, `AVG` operations can be executed on SQL Server when the full query allows

This minimizes data transfer between SQL Server and Dremio, reducing network traffic and improving query performance.

## ERP Integration Patterns

SQL Server frequently powers ERP systems (Microsoft Dynamics, custom internal ERPs). Dremio enables analytics that combine ERP data with external sources:

| SQL Server (ERP) | External Source | Analytics Use Case |
|---|---|---|
| Inventory levels | S3 demand forecasts | Automated reorder predictions |
| Purchase orders | PostgreSQL supplier data | Supplier performance scoring |
| Financial actuals | BigQuery market data | Revenue benchmarking |
| Customer accounts | MongoDB support tickets | Churn risk assessment |

These cross-source analytics are impossible with SQL Server alone and traditionally require SQL Server Integration Services (SSIS) to build ETL pipelines. Dremio eliminates this requirement entirely.

## SQL Server Always Encrypted and SSL

Dremio supports SSL/TLS connections to SQL Server. For databases using Always Encrypted columns, be aware that Dremio reads the encrypted values — decryption requires the Column Master Key, which is managed by the application. For analytical workloads, consider creating views on the SQL Server side that expose non-encrypted analytical summaries.

## Get Started

SQL Server users can federate enterprise data, reduce license costs, deploy AI analytics, and apply unified governance across their entire data estate. Start by connecting your primary SQL Server instance to Dremio Cloud. Create Reflections on your most-queried reporting tables to offload analytical queries from SQL Server immediately, reducing CPU load and freeing licensed cores for transactional workloads.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-sqlserver-dremio-cloud&utm_content=alexmerced) and connect your SQL Server instances.
