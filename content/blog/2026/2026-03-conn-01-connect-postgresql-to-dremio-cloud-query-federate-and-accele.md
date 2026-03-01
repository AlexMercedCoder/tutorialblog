---
title: "Connect PostgreSQL to Dremio Cloud: Query, Federate, and Accelerate Your Data"
date: "2026-03-01"
description: "PostgreSQL powers more production applications than almost any other open-source database. It's where your customer records, transaction logs, product catalo..."
author: "Alex Merced"
category: "Dremio Connectors"
bannerImage: "./images/connector-blogs/01/banner.png"
tags:
  - dremio
  - data integration
  - connectors
  - data lakehouse
  - federated queries
---

PostgreSQL powers more production applications than almost any other open-source database. It's where your customer records, transaction logs, product catalogs, and operational data live. But running analytics directly against PostgreSQL creates problems: heavy analytical queries compete with transactional workloads, cross-database joins require custom ETL, and your data team can't access PostgreSQL data alongside data in S3, Snowflake, or other systems without building pipelines.

Dremio Cloud solves this by connecting directly to PostgreSQL and querying it in place. No data movement, no ETL pipelines, no replica databases. You write SQL in Dremio, and it pushes filtering and aggregation work back to PostgreSQL when possible, fetches only the results, and lets you join that data with any other connected source in the same query.

This guide walks through connecting PostgreSQL to Dremio Cloud, from prerequisites to your first federated query.

## Why PostgreSQL Users Need Dremio

PostgreSQL is an excellent transactional database, but it wasn't designed for the analytics patterns that modern teams need. Here are the problems Dremio solves:

**Cross-source analytics without pipelines.** Your customer data is in PostgreSQL, your clickstream data is in S3, and your revenue data is in Snowflake. Without Dremio, joining these datasets requires building ETL pipelines to centralize everything into one system. With Dremio, you connect all three as sources and write a single SQL query that joins across them. Dremio handles the federation.

**Protect production performance.** Running heavy `GROUP BY` queries or full-table scans against your production PostgreSQL instance can degrade application performance. Dremio's Reflections solve this by creating pre-computed materializations of your most common analytical queries. After the first query, subsequent queries hit the Reflection instead of PostgreSQL, eliminating load on your production database.

**Business context for AI.** Raw PostgreSQL tables have technical column names like `cust_id` and `txn_amt`. Dremio's semantic layer lets you create views that rename and restructure these columns with business logic, then attach wiki descriptions and labels. When your team asks Dremio's AI Agent "Who are our highest-value customers?", the Agent understands what "highest-value" means because you've defined it in the semantic layer.

**Governance without modifying PostgreSQL.** Dremio's Fine-Grained Access Control (FGAC) lets you mask sensitive columns (Social Security numbers, email addresses) and filter rows based on user roles. You don't need to modify PostgreSQL permissions or create restricted database views — the governance layer lives in Dremio and applies across all tools and users.

## What You Need Before Connecting

Before configuring the connection in Dremio, make sure you have:

- **PostgreSQL hostname or IP address** — the network address of your database server
- **Port number** — PostgreSQL defaults to `5432`
- **Database name** — the specific database you want to connect
- **Username and password** — credentials for a user with read access to the tables you want to query
- **Network accessibility** — Dremio Cloud connects to your PostgreSQL instance over the public internet by default. Ensure port 5432 (or your custom port) is open in your AWS Security Group, Azure NSG, or firewall rules

If your PostgreSQL instance is in a private subnet (common for production databases), you'll need to configure networking to allow Dremio Cloud to reach it. Check [Dremio's network connectivity documentation](https://docs.dremio.com/dremio-cloud/bring-data/connect/?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-postgresql-dremio-cloud&utm_content=alexmerced) for options.

**Dremio Cloud account:** Sign up at [dremio.com/get-started](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-postgresql-dremio-cloud&utm_content=alexmerced) for a free 30-day trial with $400 in compute credits.

## Step-by-Step: Connect PostgreSQL to Dremio Cloud

### 1. Add a New Source

In the Dremio console, click the **"+"** button in the left sidebar and select **PostgreSQL** from the database source types. Alternatively, navigate to **Databases** in the data panel and click **Add database**.

### 2. Configure General Settings

Fill in the connection details:

- **Name:** Enter a descriptive name for this source (e.g., `production-postgres` or `crm-database`). This name will appear in your SQL queries when referencing tables from this source. Note: the name cannot include `/`, `:`, `[`, or `]`.
- **Host:** Enter your PostgreSQL hostname (e.g., `my-db.cluster-abc123.us-east-1.rds.amazonaws.com`).
- **Port:** Enter the port number. The default is `5432`.
- **Database:** Enter the database name you want to connect to.
- **Encrypt connection:** Toggle this on to use SSL encryption between Dremio and PostgreSQL. Recommended for production connections, especially when connecting over the internet.

### 3. Set Authentication

Choose one of two authentication methods:

**Master Authentication (default):** Provide a username and password directly. This is the simplest option — enter the credentials for a PostgreSQL user that has `SELECT` permissions on the tables you want to query.

**Secret Resource URL:** Instead of storing the password in Dremio, provide an AWS Secrets Manager ARN (e.g., `arn:aws:secretsmanager:us-west-2:123456789012:secret:my-rds-secret-VNenFy`). Dremio fetches the password from Secrets Manager at connection time. This is the preferred option for production deployments because it centralizes credential management and supports rotation.

### 4. Configure Advanced Options (Optional)

The advanced options let you fine-tune connection behavior:

| Setting | What It Does | Default |
|---|---|---|
| **Record fetch size** | Number of rows Dremio fetches per batch. Set to 0 for automatic. | 200 |
| **Maximum Idle Connections** | How many idle connections Dremio maintains to PostgreSQL. | 8 |
| **Connection Idle Time** | Seconds before an idle connection is closed. | 60 |
| **Encryption Validation Mode** | When SSL is enabled: validate certificate + hostname, certificate only, or no validation. | Validate both |
| **Connection Properties** | Custom key-value pairs for JDBC connection parameters. | None |

For most users, the defaults work fine. If you're connecting to an Amazon RDS or Aurora instance, the default SSL settings are compatible.

### 5. Set Reflection Refresh Schedule

This controls how often Dremio refreshes pre-computed Reflections built on PostgreSQL data:

- **Refresh every:** How often Reflections update (hours, days, or weeks). More frequent refreshes mean fresher data but more queries against PostgreSQL.
- **Expire after:** How long before unused Reflections are automatically removed.

For operational PostgreSQL data that changes throughout the day, a refresh interval of 1-4 hours is typical. For historical data that rarely changes, daily or weekly is sufficient.

### 6. Configure Metadata Refresh

These settings control how often Dremio checks PostgreSQL for new or changed tables:

- **Dataset Discovery (Fetch every):** How often Dremio looks for new tables or schema changes. Default is 1 hour.
- **Dataset Details (Fetch every):** How often Dremio refreshes detailed metadata for tables you've already queried. Default is 1 hour.

### 7. Set Privileges and Save

Optionally, restrict which Dremio users or roles can access this PostgreSQL source. Click **Save** to create the connection.

## Query PostgreSQL Data from Dremio

Once connected, your PostgreSQL database appears as a source in Dremio's SQL Runner. Browse the source to see schemas and tables, then query them directly:

```sql
SELECT customer_id, first_name, last_name, signup_date
FROM "production-postgres".public.customers
WHERE signup_date > '2024-01-01'
ORDER BY signup_date DESC
LIMIT 100;
```

The source name (`production-postgres`) is the name you gave the source. PostgreSQL schemas appear as sub-folders, and tables appear within those schemas.

## Federate PostgreSQL with Other Sources

The real value appears when you combine PostgreSQL data with other sources. Here's an example that joins PostgreSQL customer data with S3 clickstream data:

```sql
SELECT
  c.customer_id,
  c.first_name || ' ' || c.last_name AS customer_name,
  c.segment,
  COUNT(e.event_id) AS total_events,
  SUM(CASE WHEN e.event_type = 'purchase' THEN 1 ELSE 0 END) AS purchases
FROM "production-postgres".public.customers c
LEFT JOIN "s3-clickstream".events.user_events e
  ON c.customer_id = e.user_id
GROUP BY c.customer_id, c.first_name, c.last_name, c.segment
ORDER BY purchases DESC;
```

Dremio pushes the filter and projection operations to PostgreSQL (this is called **predicate pushdown**), fetches only the matching rows, then joins them with the S3 data in Dremio's query engine. PostgreSQL handles what it's good at (filtering indexed columns), and Dremio handles the cross-source join.

## Build a Semantic Layer Over PostgreSQL

Create views to give your PostgreSQL data business-friendly names and logic:

```sql
CREATE VIEW analytics.gold.customer_overview AS
SELECT
  c.customer_id,
  c.first_name || ' ' || c.last_name AS full_name,
  c.email,
  c.segment AS customer_segment,
  c.signup_date,
  CASE
    WHEN c.segment = 'Enterprise' AND c.lifetime_value > 50000 THEN 'Strategic'
    WHEN c.lifetime_value > 10000 THEN 'High Value'
    ELSE 'Standard'
  END AS account_tier
FROM "production-postgres".public.customers c;
```

Then attach wiki descriptions and labels through the Catalog (edit pencil icon → Details tab → Generate Wiki/Tags) so the AI Agent understands the data when users ask natural language questions.

## Predicate Pushdown: What Dremio Offloads to PostgreSQL

Dremio doesn't download entire PostgreSQL tables and process them locally. When possible, it pushes operations back to PostgreSQL to minimize data transfer. PostgreSQL supports an extensive set of pushdowns in Dremio, including:

- **Logical operators:** AND, OR, NOT
- **Comparisons:** =, !=, <, >, <=, >=, BETWEEN, IN, LIKE, IS NULL, IS NOT NULL
- **Aggregations:** SUM, AVG, COUNT, MIN, MAX, STDDEV, MEDIAN, VAR_POP
- **Math functions:** ABS, CEIL, FLOOR, ROUND, MOD, SQRT, POWER, LOG
- **String functions:** CONCAT, SUBSTR, LENGTH, LOWER, UPPER, TRIM, REPLACE, REVERSE
- **Date functions:** DATE_ADD, DATE_SUB, DATE_TRUNC (day, hour, month, quarter, year), EXTRACT

This means a query like `SELECT department, AVG(salary) FROM postgres.hr.employees WHERE hire_date > '2023-01-01' GROUP BY department` runs mostly on PostgreSQL — Dremio sends the filter, aggregation, and grouping to Postgres and only transfers the summarized result.

## Accelerate PostgreSQL Queries with Reflections

For queries that run frequently, create Reflections to avoid hitting PostgreSQL repeatedly:

1. Build a view over your PostgreSQL data.
2. In the Catalog, select the view and create a Reflection.
3. Choose the columns and aggregations to include.
4. Set the refresh interval (how often Dremio re-queries PostgreSQL to update the Reflection).

After the Reflection is built, Dremio's query optimizer automatically routes matching queries to the Reflection instead of PostgreSQL. Your analysts see the same tables and write the same SQL — the acceleration is transparent.

This is particularly valuable for dashboard queries. BI tools like Tableau or Power BI connected to Dremio via Arrow Flight/ODBC get sub-second response times from Reflections, even though the source data lives in PostgreSQL.

## Data Type Mapping

Dremio automatically maps PostgreSQL types to Dremio types. The key mappings to know:

| PostgreSQL | Dremio | Notes |
|---|---|---|
| BIGINT / BIGSERIAL | BIGINT | |
| INT / SERIAL | INTEGER | |
| NUMERIC | DECIMAL | Preserves precision |
| VARCHAR / TEXT / CHAR | VARCHAR | |
| BOOLEAN / BIT | BOOLEAN | |
| DATE | DATE | |
| TIMESTAMP / TIMESTAMPTZ | TIMESTAMP | Timezone-aware types convert |
| FLOAT4 / FLOAT8 | FLOAT / DOUBLE | |
| BYTEA | VARBINARY | |
| MONEY | DOUBLE | Converted to numeric |

Most types map directly. If you use PostgreSQL-specific types like `JSONB`, `ARRAY`, or `HSTORE`, those are not supported in Dremio's connector and won't appear in query results.

## AI-Powered Analytics on PostgreSQL Data

### Dremio AI Agent

The built-in AI Agent lets users ask questions about PostgreSQL data in plain English. Instead of writing SQL, a business user asks "Who are our highest-value enterprise customers?" and the Agent generates the correct query by reading the wiki descriptions attached to your semantic layer views. The Agent understands that "highest-value" maps to `lifetime_value` and "enterprise" maps to `segment = 'Enterprise'` because you've defined it in the view's wiki.

### Dremio MCP Server

The [Dremio MCP Server](https://github.com/dremio/dremio-mcp) connects external AI chat clients — Claude, ChatGPT, and others — to your PostgreSQL data through Dremio. The hosted MCP Server provides OAuth authentication that propagates user identity and authorization for every interaction:

1. Create a Native OAuth application in Dremio Cloud
2. Configure redirect URLs for your AI client (e.g., `https://claude.ai/api/mcp/auth_callback`)
3. Connect using `mcp.dremio.cloud/mcp/{project_id}`

A sales director can ask Claude "Show me our strategic account customers who signed up in Q1" and get governed, accurate results from your PostgreSQL data without SQL.

### AI SQL Functions

Use AI directly in queries against PostgreSQL data:

```sql
-- Classify customers based on their profile data
SELECT
  full_name,
  customer_segment,
  account_tier,
  AI_CLASSIFY(
    'Based on this customer profile, predict their likely next action',
    'Customer: ' || full_name || ', Segment: ' || customer_segment || ', Tier: ' || account_tier,
    ARRAY['Upsell Opportunity', 'Renewal Risk', 'Expansion Ready', 'Stable']
  ) AS predicted_action
FROM analytics.gold.customer_overview
WHERE account_tier IN ('Strategic', 'High Value');

-- Generate personalized engagement plans
SELECT
  full_name,
  AI_GENERATE(
    'Write a one-sentence personalized engagement recommendation',
    'Customer: ' || full_name || ', Segment: ' || customer_segment || ', Tier: ' || account_tier || ', Signup: ' || CAST(signup_date AS VARCHAR)
  ) AS engagement_recommendation
FROM analytics.gold.customer_overview
WHERE account_tier = 'Strategic';
```

`AI_CLASSIFY` categorizes data with LLM inference inside SQL. `AI_GENERATE` produces text. `AI_SIMILARITY` (not shown) finds semantic matches between text fields. All run directly in your query.

## Get Started

If you run PostgreSQL for your application data and want to include it in cross-source analytics, AI-driven queries, or governed dashboards without building ETL pipelines, Dremio Cloud is the fastest path.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-postgresql-dremio-cloud&utm_content=alexmerced) and connect your PostgreSQL instance in under 5 minutes.
