---
title: "Connect Apache Druid to Dremio Cloud: Add SQL Joins, AI, and Governance to Your Real-Time Analytics"
date: "2026-03-01"
description: "Apache Druid is a real-time analytics database designed for sub-second queries on high-ingestion-rate event data. Clickstream analytics, application monitori..."
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

Apache Druid is a real-time analytics database designed for sub-second queries on high-ingestion-rate event data. Clickstream analytics, application monitoring, IoT telemetry, and ad-tech workloads rely on Druid's columnar storage and inverted indexes for instantaneous queries.

Dremio Cloud connects to Druid as a federated data source, giving you the ability to join Druid event data with relational databases, data lakes, and cloud warehouses. Dremio adds governance (column masking, row-level filtering), Reflection-based acceleration, and AI capabilities (AI Agent, MCP Server, AI SQL Functions) that Druid doesn't provide natively.

Druid excels at one thing: fast aggregation queries on time-series event data. But production analytics rarely involve just one data source. When a product manager asks "Show me user engagement metrics correlated with support ticket volume and revenue impact," that query requires joining Druid's event data with a CRM database and a financial system. Druid can't do these joins natively — it doesn't support standard SQL JOINs. Dremio bridges this gap by reading Druid data and joining it with any other source in a single SQL query.

But Druid has fundamental limitations that become painful as analytics needs grow. It doesn't support traditional SQL joins between datasources. It doesn't connect to external databases. Its query model is optimized for aggregations on its own ingested segments, not for the kind of cross-source, enriched analytics modern organizations need.

Dremio Cloud connects to Apache Druid and queries it alongside relational databases, data lakes, and cloud warehouses. You get the speed of Druid for real-time aggregations combined with Dremio's ability to join that data with any other source, accelerate queries with Reflections, apply governance, and enable AI analytics.

## Why Druid Users Need Dremio

### SQL Joins with Real-Time Data

Druid doesn't support traditional SQL joins between datasources. If you want to answer "What is the conversion rate by customer segment in the last hour?" you need the real-time event data from Druid and the customer segment data from your CRM database. Without Dremio, you'd need to either pre-join the data before ingesting into Druid (losing flexibility) or build application code that queries both systems and merges results in memory.

Dremio queries Druid for its real-time aggregations and joins the results with PostgreSQL customer data, S3 behavior logs, Snowflake revenue data, or any other connected source — all in a single SQL query.

### Enrich Real-Time Metrics with Business Context

Druid provides fast counts, averages, percentiles, and approximate distinct counts on event data. But enriching those metrics with customer names, product descriptions, geographic hierarchies, or organizational data requires joining with dimensional data that lives in other systems.

Dremio's federation provides that enrichment without duplicating dimensional data into Druid. Your Druid segments stay lean (just events), and Dremio handles the enrichment at query time.

### Historical Analysis Across Time Ranges

Druid is optimized for recent data (hot segments). Historical analysis across months or years — trend analysis, year-over-year comparisons — often hits cold segments that are slower to query. Dremio's Reflections cache aggregated historical results, providing fast access to time-series trends without depending on Druid's tiered storage.

### Unified Governance

Druid has basic authentication but limited access control. There's no column masking, no row-level filtering, no consistent policy framework. Dremio's Fine-Grained Access Control adds these capabilities, ensuring that sensitive event data (user IDs, IP addresses, location data) is properly governed across Druid and every other connected source.

## Prerequisites

- **Druid Broker hostname or IP address** — the Broker node handles query routing
- **Port** — typically `8082` for the Broker HTTP API
- **Network access** from Dremio Cloud to the Druid Broker
- **Dremio Cloud account** — [sign up free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-apache-druid-dremio-cloud&utm_content=alexmerced) with $400 in compute credits

## Step-by-Step: Connect Druid to Dremio Cloud

### 1. Add the Source

In the Dremio console, click **"+"** and select **Apache Druid**.

### 2. Configure Connection Details

- **Name:** A descriptive identifier (e.g., `druid-realtime` or `event-analytics`).
- **Host:** Druid Broker hostname or IP.
- **Port:** Default `8082`.

### 3. Set Authentication

Configure credentials if your Druid deployment requires authentication.

### 4. Configure Advanced Settings

Set Reflection Refresh, Metadata refresh intervals, and any connection properties.

### 5. Set Privileges and Save

## Query Real-Time Druid Data

```sql
-- Real-time page view metrics
SELECT
  DATE_TRUNC('hour', __time) AS event_hour,
  page,
  COUNT(*) AS page_views,
  COUNT(DISTINCT user_id) AS unique_visitors,
  ROUND(COUNT(*) * 1.0 / COUNT(DISTINCT user_id), 2) AS views_per_visitor
FROM "druid-realtime".druid.pageviews
WHERE __time > CURRENT_TIMESTAMP - INTERVAL '24' HOUR
GROUP BY 1, 2
ORDER BY page_views DESC
LIMIT 20;
```

## Federate: Enrich Real-Time Data with Business Context

```sql
-- Join Druid real-time events with PostgreSQL user segments and S3 product data
SELECT
  d.event_hour,
  c.user_segment,
  p.product_category,
  SUM(d.page_views) AS total_views,
  COUNT(DISTINCT d.user_id) AS unique_users,
  CASE
    WHEN c.user_segment = 'Enterprise' THEN ROUND(SUM(d.page_views) * 2.5, 2)
    WHEN c.user_segment = 'Pro' THEN ROUND(SUM(d.page_views) * 1.5, 2)
    ELSE ROUND(SUM(d.page_views) * 0.5, 2)
  END AS estimated_value
FROM (
  SELECT
    DATE_TRUNC('hour', __time) AS event_hour,
    user_id,
    page,
    COUNT(*) AS page_views
  FROM "druid-realtime".druid.pageviews
  WHERE __time > CURRENT_TIMESTAMP - INTERVAL '24' HOUR
  GROUP BY 1, 2, 3
) d
LEFT JOIN "postgres-crm".public.users c ON d.user_id = c.user_id
LEFT JOIN "s3-catalog".products.page_mappings p ON d.page = p.page_url
GROUP BY d.event_hour, c.user_segment, p.product_category
ORDER BY estimated_value DESC;
```

Druid handles the real-time event aggregation, PostgreSQL provides user context, S3 maps pages to products, and Dremio joins everything.

## Build a Semantic Layer Over Real-Time Data

```sql
CREATE VIEW analytics.gold.realtime_engagement AS
SELECT
  DATE_TRUNC('hour', __time) AS event_hour,
  page,
  COUNT(*) AS page_views,
  COUNT(DISTINCT user_id) AS unique_visitors,
  ROUND(COUNT(*) * 1.0 / COUNT(DISTINCT user_id), 2) AS views_per_visitor,
  CASE
    WHEN COUNT(*) > 10000 THEN 'Trending'
    WHEN COUNT(*) > 1000 THEN 'Active'
    WHEN COUNT(*) > 100 THEN 'Normal'
    ELSE 'Low Traffic'
  END AS traffic_tier
FROM "druid-realtime".druid.pageviews
WHERE __time > CURRENT_TIMESTAMP - INTERVAL '7' DAY
GROUP BY 1, 2;
```

Navigate to the **Catalog**, click **Edit** (pencil icon), and **Generate Wiki** and **Generate Tags**. Create descriptions like "realtime_engagement: Hourly page view metrics from the real-time clickstream, classified by traffic tier."

## AI-Powered Analytics on Real-Time Data

### Dremio AI Agent

The AI Agent lets users ask questions about real-time event data in plain English. Instead of writing complex time-window SQL, a product manager asks "Which pages are trending in the last 6 hours?" or "What's the average engagement per visitor for enterprise users today?" The Agent reads your wiki descriptions and generates accurate SQL.

This is particularly valuable for Druid data because time-series queries can be complex — date truncation, windowing, and aggregation syntax varies. The AI Agent handles this complexity automatically.

### Dremio MCP Server

The [Dremio MCP Server](https://github.com/dremio/dremio-mcp) connects Claude, ChatGPT, and other AI clients to your Dremio data:

1. Create a Native OAuth application in Dremio Cloud
2. Configure redirect URLs for your AI client
3. Connect using `mcp.dremio.cloud/mcp/{project_id}`

A marketing team lead can ask Claude "Show me our highest-traffic pages from Druid data in the last 24 hours, broken down by user segment" and get real-time insights without writing SQL.

### AI SQL Functions

Use AI to classify and analyze real-time event patterns:

```sql
-- Classify page traffic patterns with AI
SELECT
  page,
  page_views,
  unique_visitors,
  AI_CLASSIFY(
    'Based on this web traffic pattern, classify the likely content type',
    'Page: ' || page || ', Views: ' || CAST(page_views AS VARCHAR) || ', Unique visitors: ' || CAST(unique_visitors AS VARCHAR) || ', Views per visitor: ' || CAST(views_per_visitor AS VARCHAR),
    ARRAY['Product Page', 'Blog Content', 'Landing Page', 'Documentation', 'Support']
  ) AS inferred_content_type
FROM analytics.gold.realtime_engagement
WHERE traffic_tier = 'Trending';

-- Generate real-time traffic summaries
SELECT
  event_hour,
  AI_GENERATE(
    'Write a brief traffic summary for this hour',
    'Hour: ' || CAST(event_hour AS VARCHAR) || ', Total Views: ' || CAST(SUM(page_views) AS VARCHAR) || ', Unique Visitors: ' || CAST(SUM(unique_visitors) AS VARCHAR) || ', Trending Pages: ' || CAST(COUNT(CASE WHEN traffic_tier = 'Trending' THEN 1 END) AS VARCHAR)
  ) AS hourly_summary
FROM analytics.gold.realtime_engagement
GROUP BY event_hour
ORDER BY event_hour DESC
LIMIT 24;
```

## Accelerate with Reflections

For historical aggregations over Druid data, create Reflections:

1. Build a view that aggregates Druid data by day/hour/week
2. Navigate to the view in the **Catalog** and click the **Reflections** tab
3. Choose **Raw Reflection** or **Aggregation Reflection**
4. Select columns and set the **Refresh Interval** — for real-time data, hourly; for historical trends, daily
5. Click **Save**

Dashboard queries for "last 30 days" or "year-over-year" hit the Reflection instead of scanning Druid's cold segments. Real-time queries for "last hour" still go directly to Druid for sub-second latency.

## Governance on Real-Time Data

Druid has basic authentication but no column masking or row-level filtering. Dremio's Fine-Grained Access Control (FGAC) adds these capabilities:

- **Column masking:** Mask user IDs, IP addresses, and location data from specific roles. A product manager sees engagement metrics but not individual user data.
- **Row-level filtering:** Restrict real-time data access by team or region. A regional marketing team sees only their region's clickstream.
- **Unified policies:** Same governance applies across Druid, PostgreSQL, S3, and all other sources.

These policies apply across SQL Runner, BI tools (Arrow Flight/ODBC), AI Agent, and MCP Server.

## Connect BI Tools via Arrow Flight

Arrow Flight provides 10-100x faster data transfer than JDBC/ODBC:

- **Tableau:** Dremio connector for direct Arrow Flight access to real-time dashboards
- **Power BI:** Dremio ODBC driver or native connector
- **Python/Pandas:** `pyarrow.flight` for programmatic access to event data
- **Looker:** Connect via JDBC
- **dbt:** `dbt-dremio` for SQL-based transformations on event data

All queries benefit from Reflections, governance, and the semantic layer.

## VS Code Copilot Integration

Dremio's VS Code extension with Copilot integration lets developers query Druid data from their IDE. Ask Copilot "Show me trending pages from Druid in the last 6 hours" and get SQL generated from your semantic layer.

## When to Keep Data in Druid vs. Migrate

**Keep in Druid:** Real-time event streams that need sub-second query latency, high-ingestion-rate data (thousands of events per second), data that powers real-time operational dashboards with sub-second SLAs.

**Migrate to Iceberg:** Historical event archives older than 30-90 days, data that needs SQL joins (Druid can't do them natively), analytics that combine events with dimensional data, data consumed by BI tools that expect standard SQL, archival data for compliance and auditing.

For active Druid data, create manual Reflections with refresh schedules that balance freshness and performance. For migrated Iceberg data in Dremio's Open Catalog, you get automated compaction, Autonomous Reflections, and significantly lower storage costs.

## Real-Time Tiering Strategy

Combine Druid's real-time capabilities with Dremio's historical analysis:

### Tier 1: Real-Time (Druid — 0 to 24 hours)
Druid ingests and serves sub-second queries on live event data. Dremio queries Druid directly for "last hour" or "last 6 hours" dashboards.

### Tier 2: Recent Historical (Iceberg — 1 to 90 days)
Daily batch jobs move yesterday's data from Druid into Iceberg tables in Dremio's Open Catalog. Analytical queries for "last 30 days" hit Iceberg tables with Autonomous Reflections.

### Tier 3: Long-Term Archive (Iceberg — 90+ days)
Older data stays in Iceberg cold storage (S3 Infrequent Access). Compliance and audit queries use time travel against archived snapshots.

```sql
-- Dremio view that combines real-time and historical data
CREATE VIEW analytics.gold.unified_events AS
SELECT event_type, user_id, event_timestamp, 'real-time' AS data_tier
FROM "druid-cluster".clickstream.events
WHERE event_timestamp >= CURRENT_TIMESTAMP - INTERVAL '24' HOUR
UNION ALL
SELECT event_type, user_id, event_timestamp, 'historical' AS data_tier
FROM analytics.silver.events_archive
WHERE event_timestamp < CURRENT_TIMESTAMP - INTERVAL '24' HOUR
  AND event_timestamp >= CURRENT_TIMESTAMP - INTERVAL '90' DAY;
```

## Event Pipeline Integration

Common Druid deployment patterns that work with Dremio:

- **Kafka → Druid → Dremio:** Real-time events flow through Kafka into Druid. Dremio queries Druid for analytics and joins with slow-changing dimensional data from PostgreSQL or S3.
- **Kafka → Druid + S3:** Events land in both Druid (real-time) and S3 (archive). Dremio queries both seamlessly through federation.
- **Kinesis → Druid → Dremio:** AWS-native pattern where Kinesis streams feed Druid, and Dremio provides multi-source analytics over streamed data.

## Get Started

Apache Druid users can extend their real-time analytics with cross-source joins, AI-powered insights, enterprise governance, and Reflection-based acceleration — all through Dremio Cloud.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-apache-druid-dremio-cloud&utm_content=alexmerced) and connect your Druid cluster.
