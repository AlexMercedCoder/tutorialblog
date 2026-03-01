---
title: "Connect Any Iceberg REST Catalog to Dremio Cloud: Universal Lakehouse Access"
date: "2026-03-01"
description: "The Apache Iceberg REST Catalog specification defines a standard HTTP API for managing Iceberg table metadata. Any catalog implementation that conforms to th..."
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

The Apache Iceberg REST Catalog specification defines a standard HTTP API for managing Iceberg table metadata. Any catalog implementation that conforms to this specification — Apache Polaris, Amazon S3 Tables, Confluent Tableflow, Tabular, Apache Gravitino, and custom-built services — can connect to Dremio Cloud through a single connector type.

This is the most flexible catalog connector Dremio offers. Instead of needing a purpose-built connector for every catalog vendor, the Iceberg REST Catalog connector works with any compliant implementation. As new catalogs emerge — and they're emerging rapidly in the open lakehouse ecosystem — this connector ensures Dremio supports them from day one.

The Iceberg REST specification is becoming the universal standard for lakehouse catalog interoperability. AWS launched Amazon S3 Tables (a fully managed Iceberg catalog with REST API) in late 2024, Confluent released Tableflow for streaming-to-Iceberg ingestion, and Apache Gravitino provides multi-catalog governance. All of these work with Dremio's REST Catalog connector without any Dremio-side code changes.

### Credential Vending Advantage

Many REST catalogs support credential vending — the ability to issue temporary, scoped storage credentials to clients. When configured, Dremio receives short-lived tokens that grant access only to the specific data files needed for a query. This eliminates the need to store long-lived S3 access keys or Azure storage keys in Dremio's connection configuration, significantly reducing the security surface area. One REST catalog connection replaces what would otherwise require separate storage credentials for every S3 bucket, Azure container, or GCS bucket containing your Iceberg tables.

## Why Iceberg REST Catalog Users Need Dremio

### Universal Compatibility

The Iceberg REST Catalog connector works with any catalog implementation that conforms to the Iceberg REST API spec. This includes:

| Catalog | Type | Credential Vending |
|---|---|---|
| Apache Polaris | Open source | Yes |
| Amazon S3 Tables | AWS managed | Yes |
| Confluent Tableflow | Confluent managed | Yes |
| Tabular | SaaS | Yes |
| Apache Gravitino | Open source | Varies |
| Custom REST implementations | Self-hosted | Varies |

You're not locked into specific catalog vendors. Deploy Apache Polaris today, consider S3 Tables tomorrow — the same Dremio connector works for both.

### Read and Write Support

Dremio supports full DML (INSERT, UPDATE, DELETE, MERGE) on Iceberg tables managed by REST catalogs. You can create tables, run transformations, build data pipelines, and maintain your lakehouse entirely through Dremio's SQL engine. No need for separate Spark clusters or ETL jobs for routine operations.

### Multi-Catalog Federation

Connect multiple REST catalogs alongside databases (PostgreSQL, MySQL, Oracle), object storage (S3, Azure), cloud warehouses (Snowflake, BigQuery), and other catalogs (Glue, Unity) — then query across all of them in a single SQL statement.

### Automated Iceberg Maintenance

Dremio automatically compacts small files, rewrites manifests for faster metadata reads, and clusters data based on query patterns — even for tables managed by external REST catalogs.

### Multiple Authentication Methods

The connector supports Bearer Token, OAuth 2.0 (client credentials flow), and custom authentication headers, accommodating the security requirements of different catalog implementations.

### Flexible Storage Credential Management

Some REST catalogs vend temporary storage credentials (short-lived S3/Azure/GCS tokens) for reading and writing data files. Dremio supports credential vending where available. When a catalog doesn't vend credentials, you can configure storage access directly in Dremio.

## Prerequisites

- **REST Catalog endpoint URL** — the base URL of the catalog API (e.g., `https://my-polaris.example.com/api/catalog`)
- **Authentication credentials** — Bearer token, OAuth client ID/secret, or custom headers depending on the catalog
- **Storage access** — either through credential vending (catalog provides temporary tokens) or direct storage credentials (S3, Azure, GCS)
- **Dremio Cloud account** — [sign up free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-iceberg-rest-catalog-dremio-cloud&utm_content=alexmerced) with $400 in compute credits

## Step-by-Step: Connect to Dremio Cloud

### 1. Add the Source

Click **"+"** and select **Iceberg REST Catalog**.

### 2. Configure Connection Details

- **Name:** Descriptive identifier (e.g., `polaris-catalog` or `s3-tables`).
- **Catalog Endpoint URL:** The base URL for the REST API.

### 3. Set Authentication

Choose from:
- **Bearer Token:** For token-based authentication (e.g., PAT tokens).
- **OAuth 2.0:** Client ID and client secret for OAuth client credentials flow.
- **None:** For catalogs that use other authentication methods (configured via custom headers).

### 4. Configure Storage

If credential vending is supported, Dremio receives temporary credentials automatically. Otherwise, configure S3 (access key/secret or IAM role), Azure (shared key or service principal), or GCS (service account key) credentials.

### 5. Advanced Settings

- **Custom Headers:** Additional HTTP headers required by the catalog.
- **Query Parameters:** URL parameters appended to catalog API requests.
- **Catalog-specific properties:** Key-value pairs for vendor-specific configuration.

### 6. Set Reflection and Metadata Refresh, then Save

## Query and Write to REST Catalog Tables

```sql
-- Query Iceberg tables from a REST catalog
SELECT order_id, customer_id, order_total, order_date
FROM "rest-catalog".ecommerce.orders
WHERE order_date >= '2024-01-01' AND order_total > 100
ORDER BY order_total DESC;

-- Write to the catalog
INSERT INTO "rest-catalog".analytics.daily_summary
SELECT
  DATE_TRUNC('day', order_date) AS day,
  COUNT(*) AS order_count,
  SUM(order_total) AS revenue,
  AVG(order_total) AS avg_order_value
FROM "rest-catalog".ecommerce.orders
WHERE order_date = CURRENT_DATE - INTERVAL '1' DAY
GROUP BY 1;

-- MERGE for upserts
MERGE INTO "rest-catalog".analytics.customer_metrics AS target
USING (
  SELECT customer_id, COUNT(*) AS orders, SUM(order_total) AS total_spent
  FROM "rest-catalog".ecommerce.orders
  WHERE order_date >= CURRENT_DATE - INTERVAL '30' DAY
  GROUP BY customer_id
) AS source
ON target.customer_id = source.customer_id
WHEN MATCHED THEN UPDATE SET orders = source.orders, total_spent = source.total_spent
WHEN NOT MATCHED THEN INSERT (customer_id, orders, total_spent) VALUES (source.customer_id, source.orders, source.total_spent);
```

## Federate with Other Sources

```sql
-- Join REST catalog data with PostgreSQL and S3
SELECT
  rc.order_id,
  rc.order_total,
  pg.customer_name,
  pg.region,
  s3.support_tickets
FROM "rest-catalog".ecommerce.orders rc
JOIN "postgres-crm".public.customers pg ON rc.customer_id = pg.customer_id
LEFT JOIN "s3-support".tickets.customer_counts s3 ON rc.customer_id = s3.customer_id
WHERE rc.order_total > 500
ORDER BY rc.order_total DESC;
```

## Build a Semantic Layer

```sql
CREATE VIEW analytics.gold.customer_value AS
SELECT
  rc.customer_id,
  pg.customer_name,
  pg.region,
  SUM(rc.order_total) AS lifetime_value,
  COUNT(*) AS total_orders,
  ROUND(AVG(rc.order_total), 2) AS avg_order_value,
  CASE
    WHEN SUM(rc.order_total) > 50000 THEN 'Platinum'
    WHEN SUM(rc.order_total) > 10000 THEN 'Gold'
    WHEN SUM(rc.order_total) > 1000 THEN 'Silver'
    ELSE 'Bronze'
  END AS value_tier
FROM "rest-catalog".ecommerce.orders rc
JOIN "postgres-crm".public.customers pg ON rc.customer_id = pg.customer_id
GROUP BY rc.customer_id, pg.customer_name, pg.region;
```

In the **Catalog**, click **Edit** → **Generate Wiki** and **Generate Tags**.

## AI-Powered Analytics

### Dremio AI Agent

Ask "Who are our Platinum customers?" and the AI Agent generates SQL from your semantic layer. The wiki descriptions you attached explain what "Platinum" means (lifetime value > $50,000), so the Agent produces accurate results.

### Dremio MCP Server

Connect [Claude or ChatGPT](https://github.com/dremio/dremio-mcp) to your catalog data:

1. Create a Native OAuth app in Dremio Cloud
2. Configure redirect URLs for your AI client
3. Connect via `mcp.dremio.cloud/mcp/{project_id}`

A sales director asks Claude "Show me our top 20 Gold and Platinum customers by lifetime value" and gets governed results from your Iceberg catalog.

### AI SQL Functions

```sql
-- Generate personalized engagement plans
SELECT
  customer_name,
  value_tier,
  lifetime_value,
  AI_GENERATE(
    'Write a one-sentence personalized engagement recommendation',
    'Customer: ' || customer_name || ', Tier: ' || value_tier || ', LTV: $' || CAST(lifetime_value AS VARCHAR) || ', Orders: ' || CAST(total_orders AS VARCHAR && ', Region: ' || region)
  ) AS engagement_plan
FROM analytics.gold.customer_value
WHERE value_tier IN ('Platinum', 'Gold');

-- Classify churn risk
SELECT
  customer_name,
  AI_CLASSIFY(
    'Based on order patterns, classify churn risk',
    'Orders: ' || CAST(total_orders AS VARCHAR) || ', Avg Order: $' || CAST(avg_order_value AS VARCHAR) || ', LTV: $' || CAST(lifetime_value AS VARCHAR),
    ARRAY['Low Risk', 'Moderate Risk', 'High Risk']
  ) AS churn_risk
FROM analytics.gold.customer_value;
```

## Reflections for Performance

Create Reflections on views to cache results and serve BI dashboards with sub-second response times.

## When to Use REST Catalog vs. Other Iceberg Catalogs

**Use REST Catalog when:** Your organization uses Tabular, Apache Polaris, Gravitino, or another REST-compliant catalog server; you need a vendor-neutral catalog interface; you want portability across different compute engines (Dremio, Spark, Trino, Flink).

**Use AWS Glue when:** You're primarily in the AWS ecosystem and want tight integration with EMR, Athena, and AWS-native tools.

**Use Dremio's Open Catalog when:** You want zero-configuration automatic table maintenance, Autonomous Reflections, and no external catalog setup.

You can use multiple catalogs simultaneously — for example, REST Catalog for cross-engine shared tables and Dremio's Open Catalog for Dremio-specific analytical workloads.

## Governance on REST Catalog Data

Dremio's Fine-Grained Access Control (FGAC) adds governance that REST catalogs don't provide:

- **Column masking:** Mask sensitive columns from specific roles. A business analyst sees aggregated metrics but not individual customer data.
- **Row-level filtering:** Restrict data by the querying user's role. Regional users see only their data.
- **Unified policies:** Same governance applies across REST Catalog, database sources, and other catalogs.

These policies apply across SQL Runner, BI tools (Arrow Flight/ODBC), AI Agent, and MCP Server.

## Connect BI Tools via Arrow Flight

Arrow Flight provides 10-100x faster data transfer than JDBC/ODBC for BI tools:

- **Tableau:** Dremio connector for direct Arrow Flight access
- **Power BI:** Dremio ODBC driver or native connector
- **Python/Pandas:** `pyarrow.flight` for programmatic data access
- **Looker:** Connect via JDBC
- **dbt:** `dbt-dremio` adapter for transformation workflows

All queries benefit from Reflections, governance, and the semantic layer.

## VS Code Copilot Integration

Dremio's VS Code extension with Copilot integration lets developers query REST Catalog data from their IDE. Ask Copilot "Show me transaction trends from the Iceberg catalog" and get SQL generated using your semantic layer.

## REST Catalog Protocol Details

The Iceberg REST Catalog protocol is an HTTP-based interface defined by the Apache Iceberg project. Any catalog that implements this protocol works with Dremio's connector. This includes:

- **Apache Polaris (Incubating):** Open-source REST catalog by Snowflake
- **Tabular:** Managed Iceberg catalog service (now part of Databricks)
- **Gravitino:** Apache-incubating multi-catalog governance platform
- **Amazon S3 Tables:** AWS-managed Iceberg tables with REST API access
- **Custom implementations:** Any service implementing the Iceberg REST spec

Dremio handles authentication through OAuth2 bearer tokens or custom headers, making it compatible with most enterprise authentication systems.

### REST Catalog Endpoints

The Iceberg REST specification defines standard endpoints for catalog operations:

| Operation | Endpoint | Dremio Support |
|---|---|---|
| List namespaces | `GET /v1/namespaces` | ✅ |
| List tables | `GET /v1/namespaces/{ns}/tables` | ✅ |
| Load table | `GET /v1/namespaces/{ns}/tables/{table}` | ✅ |
| Create table | `POST /v1/namespaces/{ns}/tables` | ✅ |
| Update table | `POST /v1/namespaces/{ns}/tables/{table}` | ✅ |
| Drop table | `DELETE /v1/namespaces/{ns}/tables/{table}` | ✅ |
| Get config | `GET /v1/config` | ✅ |

Dremio uses these endpoints to discover tables, read metadata, perform DML operations, and manage table lifecycle — all through standard HTTP.

### Multi-Catalog Architecture

Many organizations run multiple Iceberg catalogs for different purposes:

- **REST Catalog A (Polaris):** Shared enterprise data, governed access for all teams
- **REST Catalog B (S3 Tables):** AWS-native data, auto-managed by AWS
- **Dremio Open Catalog:** Dremio-specific analytical workloads with Autonomous Reflections
- **AWS Glue:** Legacy Iceberg tables managed by existing EMR pipelines

Dremio connects to all of them simultaneously and federates across them. Views in the semantic layer can join tables from different catalogs:

```sql
CREATE VIEW analytics.gold.unified_orders AS
SELECT o.order_id, o.order_total, c.customer_name, i.inventory_status
FROM "polaris-catalog".ecommerce.orders o
JOIN "s3-tables".customers.profiles c ON o.customer_id = c.customer_id
JOIN "glue-catalog".warehouse.inventory i ON o.product_id = i.product_id;
```

## Get Started

Iceberg REST Catalog users can query, write, federate, and AI-enrich their Iceberg tables through Dremio Cloud — with governance, Reflections, and AI capabilities that no compute engine provides natively. The REST Catalog connector is the most future-proof choice for organizations adopting Iceberg: as new catalog implementations emerge (and the Iceberg ecosystem is expanding rapidly), this single connector supports them all.

Start by connecting your REST catalog to Dremio Cloud, building a semantic layer over your most important tables, and enabling the AI Agent for natural language querying. The same views and Reflections work regardless of which REST catalog implementation you use — Apache Polaris today, S3 Tables tomorrow, or a custom catalog next year.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-iceberg-rest-catalog-dremio-cloud&utm_content=alexmerced) and connect your REST catalog.
