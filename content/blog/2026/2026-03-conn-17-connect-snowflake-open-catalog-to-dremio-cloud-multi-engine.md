---
title: "Connect Snowflake Open Catalog to Dremio Cloud: Multi-Engine Iceberg Analytics"
date: "2026-03-01"
description: "Snowflake Open Catalog is Snowflake's managed implementation of the Apache Iceberg REST catalog specification, based on the open-source Apache Polaris projec..."
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

Snowflake Open Catalog is Snowflake's managed implementation of the Apache Iceberg REST catalog specification, based on the open-source Apache Polaris project. It serves as a centralized metadata catalog for Apache Iceberg tables, enabling multiple compute engines — including Dremio, Spark, Trino, and Flink — to read from and write to the same Iceberg tables without metadata conflicts.

Dremio Cloud connects to Snowflake Open Catalog as a first-class Iceberg data source. You get full read and write access to Iceberg tables, automatic table maintenance (compaction, manifest optimization, vacuuming), and the ability to federate catalog data with databases, object storage, cloud warehouses, and other catalogs — all through standard SQL.

For organizations already invested in Snowflake, the Open Catalog is a strategic choice for multi-engine interoperability. Unlike Snowflake's proprietary internal catalog (which is only accessible through Snowflake compute), the Open Catalog exposes Iceberg metadata via a standard REST API. This means you're not locked into Snowflake compute for every analytical query — Dremio can read the same tables at a fraction of the credit cost for repetitive workloads. Dremio also provides its federated engine, Reflections, governance, and AI capabilities — all without duplicating data or metadata.

## Why Snowflake Open Catalog Users Need Dremio

### Multi-Engine Strategy Without Vendor Lock-In

Snowflake Open Catalog is designed for multi-engine compatibility, which makes it an ideal complement to Dremio. By connecting Dremio to your Snowflake Open Catalog, you add a query engine that specializes in areas Snowflake doesn't:

- **Federation:** Join catalog tables with PostgreSQL, MongoDB, S3, BigQuery, and any other Dremio-connected source in a single SQL query — something Snowflake can't do natively with non-Snowflake sources.
- **Autonomous performance management:** Dremio automatically compacts files, rewrites manifests, and builds Reflections based on query patterns for external catalog tables.
- **AI-powered querying:** Dremio's AI Agent, MCP Server, and AI SQL Functions bring LLM capabilities to your catalog data.

### Cost Optimization

Instead of running all workloads through Snowflake credits, offload analytical queries to Dremio. Dremio's Reflections cache results so repeated queries don't consume Snowflake credits. For organizations spending significant amounts on Snowflake compute, routing read-heavy analytical workloads through Dremio can reduce overall costs.

### Federate with Non-Snowflake Sources

Snowflake's data sharing works within Snowflake. But what if you need to join your Snowflake Open Catalog data with PostgreSQL application data, MongoDB user profiles, or S3 raw event logs? Dremio's federation engine does exactly that — no ETL pipelines, no data duplication.

### Credential Vending

Snowflake Open Catalog supports credential vending, meaning Dremio doesn't need separate storage credentials to access the underlying S3, Azure, or GCS data. The catalog provides temporary, scoped credentials for accessing data files. This simplifies security configuration and reduces the credentials you need to manage.

### Write Support for External Catalogs

Dremio can write to external Snowflake Open Catalogs, enabling you to create tables, run transformations, and build data pipelines using Dremio's SQL engine while keeping metadata managed in Snowflake's catalog.

## Prerequisites

Before connecting to Snowflake Open Catalog, confirm you have:

- **Snowflake Open Catalog account URL** — the endpoint for your catalog instance
- **OAuth or Personal Access Token (PAT) credentials** — for authenticating to the catalog
- **Catalog names** — the specific catalogs you want to access (internal read-only and/or external read-write)
- **Storage configuration** — if credential vending isn't available for your setup, you'll need S3, Azure, or GCS credentials for the underlying data
- **Dremio Cloud account** — [sign up free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-snowflake-open-catalog-dremio-cloud&utm_content=alexmerced) with $400 in compute credits

## Step-by-Step: Connect Snowflake Open Catalog to Dremio Cloud

### 1. Add the Source

In the Dremio console, click the **"+"** button in the left sidebar and select **Snowflake Open Catalog** from the catalog source types.

### 2. Configure Connection Details

- **Name:** A descriptive identifier (e.g., `snowflake-open-catalog` or `lakehouse-catalog`). This appears in SQL queries as the source prefix.
- **Catalog URL:** The Snowflake Open Catalog endpoint.
- **Credentials:** OAuth client ID/secret or a Personal Access Token.

### 3. Select Catalogs

Choose which catalogs to enable:
- **Internal catalogs** are read-only from Dremio's perspective — you can query but not write.
- **External catalogs** support full read and write operations (INSERT, UPDATE, DELETE, MERGE).

### 4. Configure Advanced Settings

Set Reflection Refresh and Metadata schedules. For catalogs with frequently changing tables, more frequent metadata refreshes ensure Dremio sees new tables and schema changes quickly.

### 5. Set Privileges and Save

Optionally restrict which Dremio users can access this catalog. Click **Save**.

## Query Snowflake Open Catalog Data

```sql
-- Query an Iceberg table managed by Snowflake Open Catalog
SELECT customer_id, customer_name, total_spend, signup_date
FROM "sf-open-catalog".analytics.customer_summary
WHERE total_spend > 10000 AND signup_date >= '2024-01-01'
ORDER BY total_spend DESC;

-- Write to an external catalog
INSERT INTO "sf-open-catalog".analytics.monthly_metrics
SELECT
  DATE_TRUNC('month', order_date) AS month,
  COUNT(*) AS order_count,
  SUM(total_amount) AS revenue
FROM "sf-open-catalog".ecommerce.orders
GROUP BY 1;
```

## Federate with Other Sources

Join catalog data with non-Snowflake sources in a single query:

```sql
SELECT
  soc.customer_name,
  soc.total_spend AS catalog_spend,
  pg.region,
  pg.account_manager,
  s3.support_ticket_count,
  CASE
    WHEN soc.total_spend > 100000 AND s3.support_ticket_count < 3 THEN 'Platinum'
    WHEN soc.total_spend > 50000 THEN 'Gold'
    WHEN soc.total_spend > 10000 THEN 'Silver'
    ELSE 'Standard'
  END AS customer_tier
FROM "sf-open-catalog".analytics.customer_summary soc
JOIN "postgres-crm".public.customers pg ON soc.customer_id = pg.customer_id
LEFT JOIN "s3-support".tickets.customer_tickets s3 ON soc.customer_id = s3.customer_id
ORDER BY catalog_spend DESC;
```

## Build a Semantic Layer

Create views that combine catalog data with business logic:

```sql
CREATE VIEW analytics.gold.customer_health AS
SELECT
  soc.customer_id,
  soc.customer_name,
  soc.total_spend,
  soc.signup_date,
  CASE
    WHEN soc.total_spend > 100000 THEN 'Enterprise'
    WHEN soc.total_spend > 25000 THEN 'Mid-Market'
    ELSE 'SMB'
  END AS customer_segment,
  ROUND(soc.total_spend / GREATEST(DATEDIFF('MONTH', soc.signup_date, CURRENT_DATE), 1), 2) AS monthly_spend_rate
FROM "sf-open-catalog".analytics.customer_summary soc;
```

Navigate to the **Catalog**, click **Edit** (pencil icon) on this view, and **Generate Wiki** and **Generate Tags**. This creates the business context that powers Dremio's AI features.

## AI-Powered Analytics

### Dremio AI Agent

The AI Agent lets users ask questions in plain English. For example: "Who are our highest-spending enterprise customers?" The Agent reads your wiki descriptions and view definitions to generate the correct SQL. Better wikis produce better results — describe what "enterprise customer" and "monthly spend rate" mean in business terms.

### Dremio MCP Server

The [Dremio MCP Server](https://github.com/dremio/dremio-mcp) extends AI capabilities to Claude, ChatGPT, and other AI chat clients. Connect through the hosted MCP Server:

1. Create a Native OAuth application in Dremio Cloud
2. Configure redirect URLs for your AI client (e.g., `https://claude.ai/api/mcp/auth_callback`)
3. Connect using `mcp.dremio.cloud/mcp/{project_id}`

Your team can then ask Claude "Show me customer health trends from our Snowflake catalog data" and get governed, accurate results without writing SQL.

### AI SQL Functions

Enrich catalog data with AI inline in your queries:

```sql
SELECT
  customer_name,
  total_spend,
  AI_CLASSIFY(
    'Based on spending patterns, classify customer risk of churn',
    'Customer: ' || customer_name || ', Total Spend: $' || CAST(total_spend AS VARCHAR) || ', Months Active: ' || CAST(months_active AS VARCHAR),
    ARRAY['Low Risk', 'Moderate Risk', 'High Risk', 'Critical']
  ) AS churn_risk
FROM "sf-open-catalog".analytics.customer_summary
WHERE total_spend > 5000;
```

`AI_CLASSIFY` runs LLM inference in your SQL query. `AI_GENERATE` produces narrative summaries, and `AI_SIMILARITY` finds semantic matches between text fields.

## Reflections for Performance

Create Reflections on frequently queried views to cache results:

1. In the **Catalog**, select the view and click the **Reflections** tab
2. Choose **Raw Reflection** (full cache) or **Aggregation Reflection** (pre-computed metrics)
3. Select columns and aggregations to include
4. Set the **Refresh Interval** — balance freshness against compute cost
5. Click **Save**

BI tools connected via Arrow Flight or ODBC get sub-second responses from Reflections instead of re-reading Iceberg files from storage. This reduces Snowflake credit consumption for workloads routed through Dremio.

## Governance Across Snowflake Open Catalog and Other Sources

Dremio's Fine-Grained Access Control (FGAC) adds governance that spans Snowflake Open Catalog and all other sources:

- **Column masking:** Mask sensitive customer data from specific roles. A marketing analyst sees spending behavior but not PII.
- **Row-level filtering:** Regional users see only their region's data automatically.
- **Unified policies:** One set of governance rules applies across Snowflake Open Catalog, database connectors, and other external catalogs.

These policies apply across SQL Runner, BI tools (Arrow Flight/ODBC), AI Agent, and MCP Server.

## Connect BI Tools via Arrow Flight

Arrow Flight provides 10-100x faster data transfer than JDBC/ODBC:

- **Tableau:** Dremio connector for direct Arrow Flight access
- **Power BI:** Dremio ODBC driver or native connector
- **Python/Pandas:** `pyarrow.flight` for high-speed programmatic access
- **Looker:** Connect via JDBC
- **dbt:** `dbt-dremio` adapter for transformation workflows

All queries benefit from Reflections, governance, and the semantic layer.

## VS Code Copilot Integration

Dremio's VS Code extension with Copilot integration lets developers query Snowflake Open Catalog data from their IDE. Ask Copilot "Show me customer churn risk from the catalog" and get SQL generated using your semantic layer — without switching tools.

## When to Use Snowflake Open Catalog vs. Other Catalogs

**Use Snowflake Open Catalog when:** You're already in the Snowflake ecosystem and want multi-engine Iceberg access, your team uses Snowflake for data management but needs Dremio for federation and AI.

**Use AWS Glue when:** You're AWS-native and want tight integration with EMR, Athena, and S3.

**Use Dremio's Open Catalog when:** You want zero-configuration automatic maintenance, Autonomous Reflections, and no external catalog dependencies.

You can connect multiple catalogs simultaneously. Many organizations use Snowflake Open Catalog for shared enterprise data and Dremio's Open Catalog for Dremio-specific analytical workloads.

## Credential Vending in Detail

Credential vending is a key feature of Snowflake Open Catalog that simplifies Dremio's access to underlying storage. Here's how it works:

1. **You configure storage in Snowflake Open Catalog** — specify the S3, Azure, or GCS bucket where Iceberg data files live.
2. **When Dremio queries a table**, it requests access from the catalog API.
3. **Snowflake Open Catalog returns temporary, scoped credentials** — short-lived tokens with permissions limited to the specific data files needed.
4. **Dremio uses these credentials** to read (or write, for external catalogs) directly from storage.
5. **Credentials expire automatically** — no long-lived keys to rotate or manage.

This means your Dremio Cloud connection needs only the catalog API credentials (OAuth), not separate storage credentials for every S3 bucket or Azure container. One connection, automatic credential management, reduced security surface area.

## Multi-Engine Architecture with Snowflake Open Catalog

Snowflake Open Catalog enables a powerful multi-engine architecture:

- **Snowflake:** Data engineering, SQL analytics, and catalog management
- **Dremio:** Federation, AI analytics, and Reflection-based BI serving
- **Apache Spark:** Large-scale data processing and ML model training
- **Trino/Presto:** Ad-hoc query engine for open-source workflows

All engines read from the same Iceberg tables managed by Snowflake Open Catalog — no data duplication, no metadata sync issues, no format conversion. Each engine reads the latest table metadata from the catalog and accesses data files via credential vending.

Dremio's unique contribution to this architecture is federation (joining catalog tables with non-Iceberg sources), AI capabilities (Agent, MCP, SQL Functions), and Reflections (sub-second BI serving without re-reading storage).

## Snowflake Open Catalog vs. Apache Polaris

Snowflake Open Catalog is based on the open-source Apache Polaris (incubating) project. Key differences:

| Feature | Snowflake Open Catalog | Apache Polaris (self-managed) |
|---|---|---|
| **Hosting** | Managed by Snowflake | Self-hosted |
| **Credential Vending** | Built-in | Requires configuration |
| **Authentication** | Snowflake OAuth | Custom |
| **Support** | Snowflake support | Community |
| **Cost** | Snowflake pricing | Infrastructure costs |

If you use Snowflake's managed offering, you get turnkey catalog management. If you prefer self-managed, Apache Polaris works with Dremio's Iceberg REST Catalog connector.

## Get Started

Snowflake Open Catalog users can build a truly multi-engine lakehouse — manage Iceberg metadata in Snowflake's infrastructure while querying with Dremio's federated engine, AI capabilities, and Reflection-based acceleration.

Connect your Snowflake Open Catalog to Dremio Cloud, build views over your Iceberg tables, and start leveraging AI Agent, MCP Server, and Reflections for cost-optimized analytical serving. The setup takes minutes and works immediately.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-snowflake-open-catalog-dremio-cloud&utm_content=alexmerced) and connect your Snowflake Open Catalog.
