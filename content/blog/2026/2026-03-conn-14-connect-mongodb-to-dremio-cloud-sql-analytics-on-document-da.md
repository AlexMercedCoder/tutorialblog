---
title: "Connect MongoDB to Dremio Cloud: SQL Analytics on Document Data"
date: "2026-03-01"
description: "MongoDB is the most popular NoSQL document database. It stores data in flexible JSON-like documents, making it ideal for applications with evolving schemas �..."
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

MongoDB is the most popular NoSQL document database. It stores data in flexible JSON-like documents, making it ideal for applications with evolving schemas — user profiles, product catalogs, IoT sensor data, and content management systems. But MongoDB's document model creates analytics challenges: you can't run SQL joins natively, aggregation pipelines are complex, and connecting MongoDB data to relational sources requires custom application code or ETL.

Dremio Cloud connects to MongoDB and exposes its collections as SQL-queryable tables. Nested documents appear as structured columns, and you can join MongoDB data with relational databases, data lakes, and cloud warehouses using standard SQL.

## Why MongoDB Users Need Dremio

**SQL on documents.** MongoDB's query language (MQL) is powerful but different from SQL. Your analysts know SQL. Dremio transforms MongoDB collections into SQL-queryable tables, so analysts don't need to learn MQL or write aggregation pipelines.

**Join documents with relational data.** Your user profiles are in MongoDB, your order data is in PostgreSQL, and your marketing data is in S3. Without Dremio, combining these requires application code that queries each system separately and merges results in memory. Dremio federates all three in a single SQL query.

**Flatten nested structures.** MongoDB documents often contain nested objects and arrays. Dremio's `FLATTEN` function expands arrays into rows, and nested objects become addressable columns (e.g., `address.city`, `preferences.theme`).

**Consistent governance.** MongoDB has authentication and roles, but they don't extend to other data sources. Dremio's FGAC applies consistent column masking and row filtering across MongoDB and all other connected sources.

**AI analytics.** MongoDB's unstructured nature makes it difficult for AI tools to query directly. Dremio's semantic layer creates structured views with business context, enabling the AI Agent to answer questions about MongoDB data.

## Prerequisites

- **MongoDB hostname or IP address** (or MongoDB Atlas connection string)
- **Port** — default `27017`
- **Database name(s)** — MongoDB databases you want to query
- **Username and password** (with `read` role on target databases)
- **Network access** — port 27017 open to Dremio Cloud. For MongoDB Atlas, add Dremio's IP range to the Atlas IP Access List
- **Dremio Cloud account** — [sign up free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-mongodb-dremio-cloud&utm_content=alexmerced)

## Connect MongoDB to Dremio Cloud

1. Click **"+"** and select **MongoDB**.
2. Enter **Name**, **Host**, **Port** (27017).
3. **Authentication Type:** Choose Standard (username/password) or No Authentication.
4. Configure **Advanced Options**:
   - **Use SSL:** Enable for MongoDB Atlas or SSL-configured instances.
   - **Auth Database:** The database used for authentication (default: `admin`).
   - **Read preference:** Control whether queries hit primary or secondary replicas (`primary`, `primaryPreferred`, `secondary`, `secondaryPreferred`, `nearest`).
   - **Subpartition size:** Controls how Dremio partitions large collections for parallel reads.
5. Configure **Reflection Refresh** and **Metadata**.
6. Set **Privileges** and **Save**.

## Query MongoDB Data with SQL

```sql
-- Query a MongoDB collection as a SQL table
SELECT user_id, name, email, signup_date
FROM "mongo-users".app.users
WHERE signup_date > '2024-01-01'
ORDER BY signup_date DESC;

-- Access nested fields
SELECT
  user_id,
  name,
  address.city AS city,
  address.state AS state,
  preferences.theme AS ui_theme
FROM "mongo-users".app.users
WHERE address.state = 'CA';
```

## Flatten Nested Arrays

MongoDB documents frequently contain arrays. Use `FLATTEN` to expand them into rows:

```sql
-- If each user document has an orders array
SELECT
  u.user_id,
  u.name,
  o.order_id,
  o.total_amount,
  o.order_date
FROM "mongo-users".app.users u,
  FLATTEN(u.orders) AS t(o)
WHERE o.total_amount > 100
ORDER BY o.order_date DESC;
```

## Federate MongoDB with Relational Sources

```sql
-- Join MongoDB user profiles with PostgreSQL orders and S3 analytics
SELECT
  m.name AS customer_name,
  m.address.city AS city,
  COUNT(pg.order_id) AS total_orders,
  SUM(pg.amount) AS total_spent,
  COUNT(s3.event_id) AS engagement_events
FROM "mongo-users".app.users m
LEFT JOIN "postgres-orders".public.orders pg ON m.user_id = pg.customer_id
LEFT JOIN "s3-events".clickstream.events s3 ON m.user_id = s3.user_id
GROUP BY m.name, m.address.city
ORDER BY total_spent DESC;
```

## Build a Semantic Layer

```sql
CREATE VIEW analytics.gold.customer_profile AS
SELECT
  m.user_id,
  m.name,
  m.email,
  m.address.city AS city,
  m.address.state AS state,
  m.signup_date,
  CASE
    WHEN m.subscription.tier = 'premium' THEN 'Premium'
    WHEN m.subscription.tier = 'pro' THEN 'Pro'
    ELSE 'Free'
  END AS subscription_tier
FROM "mongo-users".app.users m;
```

Navigate to the **Catalog**, click **Edit** (pencil icon), go to the **Details** tab, and click **Generate Wiki** and **Generate Tags**. Dremio's generative AI samples the view schema and data to produce descriptions like: "customer_profile: Contains one row per user combining profile data from MongoDB with subscription tier classification." Review and refine these descriptions — add business context like "Premium subscribers qualify for the dedicated support tier and priority feature access."

These wikis and labels are the context that powers Dremio's AI capabilities.

## AI-Powered Analytics on MongoDB Data

MongoDB's flexible document model makes it notoriously difficult for AI tools to query directly — nested objects, variable schemas, and BSON types create barriers. Dremio's semantic layer solves this by creating structured, well-documented views over MongoDB data that AI tools can understand and query accurately.

### Dremio AI Agent

The AI Agent lets business users ask questions about MongoDB data in plain English. Instead of learning MongoDB's aggregation framework or SQL with nested field syntax, a product manager asks "How many Premium subscribers are in California?" and the Agent generates the correct SQL using your semantic layer.

The Agent reads the wiki descriptions you attached to views to understand what "Premium" means in your data (subscription.tier = 'premium'), what "California" maps to (address.state = 'CA'), and which view to query. Better wikis produce more accurate AI responses.

### Dremio MCP Server

The [Dremio MCP Server](https://github.com/dremio/dremio-mcp) extends AI capabilities to external chat clients. Connect Claude or ChatGPT to your MongoDB data through the hosted MCP Server with OAuth authentication:

1. Create a Native OAuth application in Dremio Cloud
2. Configure redirect URLs (e.g., `https://claude.ai/api/mcp/auth_callback` for Claude, `https://chatgpt.com/connector_platform_oauth_redirect` for ChatGPT)
3. Connect using `mcp.dremio.cloud/mcp/{project_id}` (US) or `mcp.eu.dremio.cloud/mcp/{project_id}` (EU)

Now your team can ask Claude "Show me user growth trends by subscription tier from MongoDB data" and get governed, accurate results — without knowing MongoDB query syntax or SQL.

### AI SQL Functions

Use Dremio's built-in AI SQL functions to enrich MongoDB data directly in queries:

```sql
-- Classify users based on their MongoDB profile data
SELECT
  name,
  subscription_tier,
  city,
  state,
  AI_CLASSIFY(
    'Based on this user profile, classify their likely engagement level',
    'Name: ' || name || ', Subscription: ' || subscription_tier || ', City: ' || city || ', State: ' || state,
    ARRAY['Highly Engaged', 'Active', 'At Risk', 'Churned']
  ) AS engagement_prediction
FROM analytics.gold.customer_profile
WHERE subscription_tier IN ('Premium', 'Pro');

-- Generate personalized outreach messages
SELECT
  name,
  subscription_tier,
  AI_GENERATE(
    'Write a one-sentence personalized upgrade message for this user',
    'User: ' || name || ', Current Tier: ' || subscription_tier || ', Location: ' || city || ', ' || state
  ) AS upgrade_message
FROM analytics.gold.customer_profile
WHERE subscription_tier = 'Free';
```

`AI_CLASSIFY` categorizes users based on profile attributes. `AI_GENERATE` creates personalized text. Both run inline in your SQL queries, enriching MongoDB data with AI in real time.

## Accelerate MongoDB Analytics with Reflections

MongoDB isn't designed for heavy analytical workloads. Running 50 dashboard queries per hour against MongoDB competes with your application's read/write operations. Create Reflections on your MongoDB views to cache results:

1. Navigate to the view in the Catalog
2. Create a Reflection with the columns and aggregations used most
3. Set the refresh interval (e.g., every 30 minutes for near-real-time, hourly for daily reporting)

BI tools connected to Dremio via Arrow Flight or ODBC get sub-second response times from Reflections — MongoDB handles zero analytical load.

## MongoDB-Specific Considerations

**Schema sampling.** MongoDB is schema-less — each document can have different fields. Dremio samples documents to infer the schema. If your documents have highly variable schemas, some fields might not appear until more documents are sampled. You can increase the sample size in the source configuration.

**Read preference.** For MongoDB replica sets, use `secondaryPreferred` to route analytical queries to secondary replicas, avoiding impact on your primary node's CRUD operations.

**Data types.** MongoDB's BSON types map to Dremio types: `ObjectID` → `VARCHAR`, `NumberLong` → `BIGINT`, `NumberInt` → `INT`, `Date` → `TIMESTAMP`. Nested objects become structured columns addressable with dot notation. Arrays can be flattened with `FLATTEN`.

**MongoDB Atlas.** Add Dremio Cloud's IP range to your Atlas IP Access List. Enable SSL in the Dremio connection settings. Use the standard connection string hostname (not the SRV hostname).

## When to Keep Data in MongoDB vs. Migrate to Iceberg

**Keep in MongoDB:** Data your application actively reads and writes, documents with evolving schemas that benefit from MongoDB's flexibility, operational data where real-time updates matter, data where document-level transactions are important.

**Migrate to Iceberg:** Historical user data, analytics-heavy aggregations, datasets that need SQL joins with relational sources, time-series data you query in aggregate, data consumed primarily by BI tools or AI agents.

For data that stays in MongoDB, create manual Reflections with refresh schedules matching your data freshness needs. This offloads analytical load from MongoDB while keeping data current. For migrated Iceberg data, Dremio provides automated compaction, time travel, results caching, and Autonomous Reflections.

## Governance on MongoDB Data

MongoDB has database-level and collection-level access control, but no column masking or row-level filtering. Dremio's Fine-Grained Access Control (FGAC) adds these capabilities:

- **Column masking:** Mask user emails, phone numbers, or payment details from specific roles. A product analyst sees user behavior patterns but not PII.
- **Row-level filtering:** Restrict data by user role. A regional team sees only their region's user data.
- **Unified policies:** Same governance applies across MongoDB, PostgreSQL, S3, Snowflake, and all other sources.

These policies apply across SQL Runner, BI tools (Arrow Flight/ODBC), AI Agent, and MCP Server.

## Connect BI Tools via Arrow Flight

Arrow Flight provides 10-100x faster data transfer than JDBC/ODBC:

- **Tableau:** Dremio connector — turns MongoDB documents into tabular data for Tableau
- **Power BI:** Dremio ODBC driver or native connector
- **Python/Pandas:** `pyarrow.flight` for programmatic access to flattened MongoDB data
- **Looker:** Connect via JDBC
- **dbt:** `dbt-dremio` for SQL-based transformations on MongoDB data

All queries benefit from Reflections, governance, and the semantic layer.

## VS Code Copilot Integration

Dremio's VS Code extension with Copilot integration lets developers query MongoDB data from their IDE. Ask Copilot "Show me user signup trends from MongoDB" and get SQL generated using your semantic layer — no aggregation pipeline knowledge needed.

## Schema Flattening and Nested Documents

MongoDB stores data as nested JSON documents. Dremio automatically converts nested structures into queryable columns:

- **Top-level fields** map directly to columns (`name`, `email`, `created_at`)
- **Nested objects** use dot notation (`address.city`, `address.state`)
- **Arrays** can be flattened using `FLATTEN()` to create one row per array element

```sql
-- Flatten nested order items from MongoDB documents
SELECT
  o.customer_id,
  o.order_date,
  f.item_name,
  f.quantity,
  f.unit_price
FROM "mongodb-app".ecommerce.orders o,
LATERAL FLATTEN(o.items) AS f(item_name, quantity, unit_price);
```

This SQL approach is simpler than MongoDB's aggregation pipeline (`$unwind`, `$lookup`, `$group`) for most analytical queries.

## Dremio vs. MongoDB Atlas Data Federation

MongoDB Atlas Data Federation provides SQL-like access to MongoDB data. Key differences:

| Feature | Dremio Cloud | Atlas Data Federation |
|---|---|---|
| **Cross-source joins** | PostgreSQL, S3, Snowflake, etc. | MongoDB + S3 only |
| **Reflections** | ✅ Cache results | ❌ Query every time |
| **AI Agent** | ✅ Natural language queries | ❌ |
| **Governance** | Column masking + row filtering | MongoDB role-based access |
| **BI connectivity** | Arrow Flight (10-100x faster) | ODBC/JDBC only |
| **Semantic layer** | Views with wiki + tags | ❌ |

Dremio provides a broader analytical platform, while Atlas Data Federation is specific to the MongoDB ecosystem.

## Document-to-Analytics Pipeline

Optimize how MongoDB data flows into analytics:

1. **Source layer:** Dremio reads MongoDB collections directly — no ETL
2. **Flattened views:** Create SQL views that flatten nested documents into tabular format
3. **Enrichment:** Join flattened MongoDB data with relational and data lake sources
4. **Semantic layer:** Create business-ready views with wiki descriptions for AI

This pipeline runs entirely in SQL, eliminating the need for custom Python/Node.js ETL scripts to extract and transform MongoDB data.

## Get Started

MongoDB users can query their document data with SQL, flatten nested structures, join MongoDB with relational databases and data lakes, and enable AI analytics — all without ETL pipelines or learning MongoDB's aggregation framework.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-mongodb-dremio-cloud&utm_content=alexmerced) and connect your MongoDB instances.
