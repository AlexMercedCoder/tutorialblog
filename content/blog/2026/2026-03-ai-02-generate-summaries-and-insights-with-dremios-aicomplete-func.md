---
title: "Generate Summaries and Insights with Dremio's AI_COMPLETE Function"
date: "2026-03-01"
description: "Every data team has a version of this problem: a table full of raw data that needs human-readable summaries, translations, or narrative descriptions. Product..."
author: "Alex Merced"
category: "AI Features"
bannerImage: "./images/AI_FEATURE_BLOGS/02/banner.png"
tags:
  - dremio
  - AI
  - SQL
  - data lakehouse
  - machine learning
---

Every data team has a version of this problem: a table full of raw data that needs human-readable summaries, translations, or narrative descriptions. Product descriptions that need rewriting for a new market. Customer records that need one-sentence executive summaries. Support interactions that need post-call notes.

`AI_COMPLETE` brings an LLM directly into your SQL query to produce that text. You write a prompt, pass in your data columns, and get generated text back as a `VARCHAR`. No Python notebooks, no external APIs, no data exports.

This tutorial builds a complete product analytics pipeline in a fresh Dremio Cloud account. You'll create sample product and sales data, build a medallion architecture, and use `AI_COMPLETE` to generate product summaries, executive briefings, marketing copy, and translations, all inside SQL.

## What You'll Build

By the end of this tutorial, you'll have:
- A product catalog with 50+ products and 50+ sales records
- Bronze views that standardize raw data
- Silver views that compute sales metrics per product
- Gold views that use `AI_COMPLETE` to generate summaries, marketing descriptions, and translated content
- Materialized Iceberg tables that persist generated text for dashboards
- Wiki metadata that enables the AI Agent to answer natural language questions about your enriched catalog

## Prerequisites

- **Dremio Cloud account** — [sign up free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=ai-complete-dremio-cloud&utm_content=alexmerced) with $400 in compute credits
- **AI enabled** — go to Admin → Project Settings → Preferences → AI section and enable AI features
- **Model Provider configured** — Dremio provides a hosted LLM by default, or connect your own (OpenAI, Anthropic, Google Gemini, AWS Bedrock, Azure OpenAI)

> **Note:** Tables in the built-in Open Catalog use `folder.subfolder.table_name` without a catalog prefix. External sources use `source_name.schema.table_name`.

## Understanding AI_COMPLETE

`AI_COMPLETE` sends a prompt to your configured LLM and returns the generated text as a `VARCHAR`. The function signature:

```sql
AI_COMPLETE(
  [model_name VARCHAR,]
  prompt VARCHAR
) → VARCHAR
```

**Parameters:**
- **model_name** (optional) — specify a model like `'openai.gpt-4o'`. Format is `modelProvider.modelName`. If omitted, Dremio uses your default model.
- **prompt** — the text instruction for the LLM. Typically you concatenate a task description with column values to give the model both the instruction and the data context.

The key difference from `AI_CLASSIFY` is that `AI_COMPLETE` returns free-text output. There's no array of allowed values. The LLM generates whatever text the prompt asks for: a summary, a translation, a paragraph, a sentence, or a structured response.

This flexibility is both the strength and the risk. A well-crafted prompt produces consistent, useful output. A vague prompt produces inconsistent results. Prompt engineering matters here more than with classification.

## Step 1: Create Your Folder Structure

Open the **SQL Runner** from the left sidebar in Dremio Cloud:

```sql
CREATE FOLDER IF NOT EXISTS aicompleteexp;
CREATE FOLDER IF NOT EXISTS aicompleteexp.catalog_data;
CREATE FOLDER IF NOT EXISTS aicompleteexp.bronze;
CREATE FOLDER IF NOT EXISTS aicompleteexp.silver;
CREATE FOLDER IF NOT EXISTS aicompleteexp.gold;
```

## Step 2: Seed Your Sample Data

### Products Table

This table simulates a SaaS product catalog with technical descriptions, pricing tiers, and categories. These descriptions are the raw material that `AI_COMPLETE` will use to generate marketing copy and summaries.

```sql
CREATE TABLE aicompleteexp.catalog_data.products (
  product_id INT,
  product_name VARCHAR,
  category VARCHAR,
  description VARCHAR,
  price_monthly DECIMAL(10,2),
  launch_date DATE,
  target_audience VARCHAR
);

INSERT INTO aicompleteexp.catalog_data.products VALUES
(1, 'CloudSync Pro', 'Storage', 'Enterprise file synchronization platform supporting real-time sync across Windows Mac and Linux with conflict resolution selective sync and 256-bit AES encryption at rest and in transit', 29.99, '2023-03-15', 'IT Teams'),
(2, 'DataVault Enterprise', 'Security', 'Zero-knowledge encrypted cloud storage with SOC 2 Type II certification automated backup deduplication granular access controls and 99.99% uptime SLA for regulated industries', 89.99, '2022-11-01', 'Compliance Officers'),
(3, 'QuickReport', 'Analytics', 'Self-service business intelligence tool with drag-and-drop report builder 50+ chart types scheduled email delivery PDF export and REST API for automated report generation', 49.99, '2024-01-20', 'Business Analysts'),
(4, 'DevPipeline', 'DevOps', 'CI/CD platform with parallel build execution Docker and Kubernetes native deployment auto-scaling runners built-in secret management and integration with GitHub GitLab and Bitbucket', 79.99, '2023-07-10', 'Engineering Teams'),
(5, 'MailForge', 'Marketing', 'Email marketing automation platform with AI-powered subject line optimization A/B testing dynamic content personalization and real-time deliverability monitoring across 50+ ISPs', 39.99, '2024-05-01', 'Marketing Teams'),
(6, 'HelpDesk360', 'Support', 'Omnichannel customer support platform supporting email chat phone and social media with SLA tracking auto-routing knowledge base integration and customer satisfaction scoring', 59.99, '2023-09-15', 'Support Managers'),
(7, 'FormBuilder', 'Productivity', 'No-code form and survey creation tool with conditional logic payment collection 200+ templates analytics dashboard and WCAG 2.1 AA accessibility compliance', 19.99, '2024-02-28', 'Operations Teams'),
(8, 'APIGateway Pro', 'Infrastructure', 'API management platform with rate limiting OAuth 2.0 authentication request transformation caching analytics dashboard and support for REST GraphQL and gRPC protocols', 99.99, '2023-01-05', 'Platform Engineers'),
(9, 'InventoryTrack', 'Commerce', 'Multi-warehouse inventory management system with barcode scanning lot tracking reorder alerts multi-currency support and integration with Shopify WooCommerce and Amazon', 44.99, '2024-04-10', 'E-commerce Managers'),
(10, 'TeamBoard', 'Collaboration', 'Visual project management platform with Kanban Gantt and timeline views time tracking resource allocation dependencies and Slack Microsoft Teams integration', 24.99, '2023-06-20', 'Project Managers'),
(11, 'SecureSign', 'Legal', 'Electronic signature platform with legally binding signatures audit trails multi-party signing workflows template library and compliance with eIDAS UETA and ESIGN regulations', 34.99, '2024-03-01', 'Legal Teams'),
(12, 'DataStream', 'Data', 'Real-time data pipeline platform supporting Kafka Pulsar and Kinesis with schema registry exactly-once processing dead letter queues and built-in data quality checks', 149.99, '2023-04-18', 'Data Engineers'),
(13, 'AdOptimizer', 'Marketing', 'Cross-channel advertising platform with automated bid management audience segmentation attribution modeling creative testing and budget pacing across Google Facebook and LinkedIn', 199.99, '2024-06-15', 'Performance Marketers'),
(14, 'ContractManager', 'Legal', 'Contract lifecycle management platform with AI-assisted clause extraction version tracking approval workflows obligation monitoring and integration with Salesforce and HubSpot', 69.99, '2023-08-22', 'Legal Operations'),
(15, 'LogInsight', 'Infrastructure', 'Log aggregation and analysis platform with full-text search pattern detection anomaly alerts custom dashboards and retention policies supporting up to 10TB daily ingestion', 119.99, '2023-02-14', 'SRE Teams'),
(16, 'PayFlow', 'Finance', 'Payment processing platform with support for 135 currencies PCI DSS Level 1 compliance recurring billing invoice generation and fraud detection using ML models', 0.00, '2024-01-10', 'Finance Teams'),
(17, 'ChatAssist', 'Support', 'AI-powered chatbot platform with natural language understanding intent classification handoff to human agents conversation analytics and multi-language support for 40+ languages', 74.99, '2024-07-01', 'Customer Experience'),
(18, 'SchedulePro', 'HR', 'Employee scheduling platform with shift management availability tracking overtime calculation labor cost forecasting and integration with ADP Workday and BambooHR payroll systems', 14.99, '2023-11-05', 'HR Managers'),
(19, 'CloudBackup', 'Storage', 'Automated cloud backup solution with incremental backups point-in-time recovery cross-region replication ransomware protection and support for AWS Azure and GCP workloads', 54.99, '2023-05-30', 'IT Administrators'),
(20, 'DesignHub', 'Productivity', 'Collaborative design platform with real-time co-editing version history component libraries handoff-to-dev specs and integration with Figma Sketch and Adobe XD import', 29.99, '2024-08-10', 'Design Teams');
```

### Sales Data Table

This table tracks monthly sales performance for each product, giving us the raw numbers that `AI_COMPLETE` will summarize into narrative insights.

```sql
CREATE TABLE aicompleteexp.catalog_data.sales_data (
  sale_id INT,
  product_id INT,
  month_year VARCHAR,
  units_sold INT,
  revenue DECIMAL(12,2),
  new_customers INT,
  churned_customers INT,
  region VARCHAR
);

INSERT INTO aicompleteexp.catalog_data.sales_data VALUES
(1, 1, '2025-07', 342, 10256.58, 89, 12, 'North America'),
(2, 1, '2025-08', 389, 11666.11, 102, 8, 'North America'),
(3, 1, '2025-09', 415, 12446.85, 95, 15, 'Europe'),
(4, 2, '2025-07', 156, 14037.44, 34, 5, 'North America'),
(5, 2, '2025-08', 178, 16017.22, 41, 3, 'Europe'),
(6, 2, '2025-09', 201, 18087.99, 52, 7, 'North America'),
(7, 3, '2025-07', 267, 13346.33, 73, 18, 'North America'),
(8, 3, '2025-08', 234, 11697.66, 58, 22, 'Europe'),
(9, 3, '2025-09', 298, 14894.02, 81, 14, 'Asia Pacific'),
(10, 4, '2025-07', 123, 9837.77, 28, 4, 'North America'),
(11, 4, '2025-08', 145, 11598.55, 35, 6, 'Europe'),
(12, 4, '2025-09', 167, 13358.33, 42, 3, 'North America'),
(13, 5, '2025-07', 445, 17795.55, 112, 25, 'North America'),
(14, 5, '2025-08', 478, 19115.22, 98, 30, 'Europe'),
(15, 5, '2025-09', 512, 20475.88, 134, 19, 'Asia Pacific'),
(16, 6, '2025-07', 198, 11877.02, 45, 11, 'North America'),
(17, 6, '2025-08', 212, 12717.88, 52, 8, 'Europe'),
(18, 6, '2025-09', 189, 11331.11, 38, 16, 'North America'),
(19, 7, '2025-07', 567, 11334.33, 145, 32, 'North America'),
(20, 7, '2025-08', 612, 12234.88, 160, 28, 'Europe'),
(21, 7, '2025-09', 589, 11774.11, 138, 35, 'Asia Pacific'),
(22, 8, '2025-07', 89, 8899.11, 15, 2, 'North America'),
(23, 8, '2025-08', 95, 9499.05, 18, 1, 'Europe'),
(24, 8, '2025-09', 102, 10198.98, 22, 3, 'North America'),
(25, 9, '2025-07', 312, 14035.88, 78, 14, 'North America'),
(26, 9, '2025-08', 287, 12911.13, 65, 19, 'Europe'),
(27, 9, '2025-09', 345, 15520.55, 92, 11, 'Asia Pacific'),
(28, 10, '2025-07', 234, 5847.66, 67, 20, 'North America'),
(29, 10, '2025-08', 256, 6397.44, 72, 15, 'Europe'),
(30, 10, '2025-09', 278, 6946.22, 80, 18, 'Asia Pacific'),
(31, 11, '2025-07', 189, 6613.11, 48, 9, 'North America'),
(32, 11, '2025-08', 201, 7032.99, 55, 7, 'Europe'),
(33, 11, '2025-09', 223, 7802.77, 62, 5, 'North America'),
(34, 12, '2025-07', 67, 10049.33, 12, 1, 'North America'),
(35, 12, '2025-08', 78, 11699.22, 16, 2, 'Europe'),
(36, 12, '2025-09', 82, 12299.18, 19, 1, 'North America'),
(37, 13, '2025-07', 134, 26793.66, 28, 6, 'North America'),
(38, 13, '2025-08', 145, 28993.55, 32, 4, 'Europe'),
(39, 13, '2025-09', 167, 33393.33, 41, 8, 'North America'),
(40, 14, '2025-07', 112, 7838.88, 25, 5, 'North America'),
(41, 14, '2025-08', 128, 8959.72, 30, 3, 'Europe'),
(42, 14, '2025-09', 145, 10149.55, 38, 4, 'North America'),
(43, 15, '2025-07', 56, 6719.44, 10, 2, 'North America'),
(44, 15, '2025-08', 62, 7439.38, 13, 1, 'Europe'),
(45, 15, '2025-09', 71, 8519.29, 17, 2, 'North America'),
(46, 16, '2025-07', 890, 0.00, 234, 45, 'North America'),
(47, 16, '2025-08', 1023, 0.00, 267, 38, 'Europe'),
(48, 16, '2025-09', 1156, 0.00, 301, 52, 'Asia Pacific'),
(49, 17, '2025-07', 145, 10873.55, 38, 8, 'North America'),
(50, 17, '2025-08', 167, 12522.33, 45, 6, 'Europe'),
(51, 17, '2025-09', 189, 14173.11, 52, 10, 'Asia Pacific'),
(52, 18, '2025-07', 423, 6341.77, 110, 28, 'North America'),
(53, 18, '2025-08', 456, 6836.44, 118, 22, 'Europe'),
(54, 18, '2025-09', 489, 7331.11, 125, 30, 'Asia Pacific');
```

## Step 3: Build Bronze Views

Bronze views standardize column names and cast dates to timestamps. No business logic at this layer.

```sql
CREATE OR REPLACE VIEW aicompleteexp.bronze.v_products AS
SELECT
  product_id,
  product_name,
  category,
  description,
  price_monthly,
  CAST(launch_date AS TIMESTAMP) AS launch_timestamp,
  target_audience
FROM aicompleteexp.catalog_data.products;

CREATE OR REPLACE VIEW aicompleteexp.bronze.v_sales AS
SELECT
  sale_id,
  product_id,
  month_year,
  units_sold,
  revenue,
  new_customers,
  churned_customers,
  region
FROM aicompleteexp.catalog_data.sales_data;
```

## Step 4: Build Silver Views

This Silver view aggregates sales performance per product across all months, giving us total revenue, total units, average deal size, net customer growth, and growth rate. The `AI_COMPLETE` function will use these metrics to generate narrative summaries.

```sql
CREATE OR REPLACE VIEW aicompleteexp.silver.v_product_performance AS
SELECT
  p.product_id,
  p.product_name,
  p.category,
  p.description,
  p.price_monthly,
  p.target_audience,
  COALESCE(SUM(s.units_sold), 0) AS total_units,
  COALESCE(SUM(s.revenue), 0) AS total_revenue,
  COALESCE(SUM(s.new_customers), 0) AS total_new_customers,
  COALESCE(SUM(s.churned_customers), 0) AS total_churned,
  COALESCE(SUM(s.new_customers), 0) - COALESCE(SUM(s.churned_customers), 0) AS net_customer_growth,
  CASE
    WHEN COALESCE(SUM(s.units_sold), 0) > 0
    THEN ROUND(COALESCE(SUM(s.revenue), 0) / SUM(s.units_sold), 2)
    ELSE 0
  END AS avg_revenue_per_unit,
  COUNT(DISTINCT s.region) AS regions_active
FROM aicompleteexp.bronze.v_products p
LEFT JOIN aicompleteexp.bronze.v_sales s ON p.product_id = s.product_id
GROUP BY p.product_id, p.product_name, p.category, p.description, p.price_monthly, p.target_audience;
```

## Step 5: Build Gold Views with AI_COMPLETE

### Gold View 1: Executive Product Summaries

This view generates a one-sentence executive summary for each product based on its sales performance. Product managers use these summaries in weekly reports without manually writing them.

The prompt includes specific data points (revenue, units, customer growth) so the LLM produces factual summaries rather than generic descriptions.

```sql
CREATE OR REPLACE VIEW aicompleteexp.gold.v_product_summaries AS
SELECT
  product_id,
  product_name,
  category,
  total_revenue,
  total_units,
  net_customer_growth,
  AI_COMPLETE(
    'Write a single-sentence executive summary for this product. Be specific with numbers. Product: '
    || product_name
    || '. Category: ' || category
    || '. Total revenue: $' || CAST(total_revenue AS VARCHAR)
    || '. Units sold: ' || CAST(total_units AS VARCHAR)
    || '. Net customer growth: ' || CAST(net_customer_growth AS VARCHAR)
    || '. Target audience: ' || target_audience
  ) AS executive_summary
FROM aicompleteexp.silver.v_product_performance;
```

### Gold View 2: Marketing Description Generator

This view transforms technical product descriptions into customer-facing marketing copy. The LLM rewrites the description in a style that emphasizes benefits rather than features, suitable for a product landing page.

```sql
CREATE OR REPLACE VIEW aicompleteexp.gold.v_marketing_copy AS
SELECT
  product_id,
  product_name,
  category,
  description AS technical_description,
  price_monthly,
  target_audience,
  AI_COMPLETE(
    'Rewrite this technical product description as a compelling 2-3 sentence marketing paragraph for a product landing page. Focus on benefits not features. Avoid buzzwords like transformative or revolutionary. Product: '
    || product_name
    || '. Technical description: ' || description
    || '. Price: $' || CAST(price_monthly AS VARCHAR) || '/month'
    || '. Target audience: ' || target_audience
  ) AS marketing_description
FROM aicompleteexp.bronze.v_products;
```

### Gold View 3: Translated Descriptions

`AI_COMPLETE` handles translation by including the target language in the prompt. This view generates Spanish translations of product descriptions for a localization initiative.

```sql
CREATE OR REPLACE VIEW aicompleteexp.gold.v_spanish_catalog AS
SELECT
  product_id,
  product_name,
  description AS english_description,
  AI_COMPLETE(
    'Translate this product description to Spanish. Return only the Spanish text, no explanations: ' || description
  ) AS spanish_description
FROM aicompleteexp.bronze.v_products;
```

### Choosing the Right Model

For summarization tasks, you can specify a model optimized for speed or quality:

```sql
-- Use a specific high-quality model for executive summaries
SELECT
  product_name,
  AI_COMPLETE(
    'openai.gpt-4o',
    'Write a brief executive summary: Product ' || product_name
    || ' generated $' || CAST(total_revenue AS VARCHAR) || ' in revenue'
  ) AS summary
FROM aicompleteexp.silver.v_product_performance;
```

### Prompt Engineering Patterns

The quality of `AI_COMPLETE` output depends heavily on prompt structure. Here are patterns that produce consistent results:

**Be specific about format:** "Write a single-sentence summary" produces better output than "Summarize this." Specify the expected length and format.

**Include constraints:** "Avoid buzzwords like transformative or revolutionary" steers the LLM away from generic marketing language. "Return only the Spanish text, no explanations" prevents the model from adding unwanted context.

**Provide data context:** Concatenate actual numbers into the prompt. "Total revenue: $34,000" gives the LLM facts to work with, reducing hallucination. Never ask the LLM to calculate; provide pre-computed metrics and ask it to narrate them.

**Test with LIMIT:** Before running `AI_COMPLETE` on your full dataset, test with `LIMIT 5` to check output quality and token costs:

```sql
SELECT product_name, AI_COMPLETE('Summarize in one sentence: ' || description)
FROM aicompleteexp.bronze.v_products
LIMIT 5;
```

## Persisting Results with CTAS

LLM calls cost tokens on every execution. For dashboards or reports that display generated summaries, materialize the results:

```sql
CREATE TABLE aicompleteexp.gold.product_summaries_materialized AS
SELECT * FROM aicompleteexp.gold.v_product_summaries;
```

Refresh this table on a schedule (weekly, after each sales data update) to keep summaries current without running LLM calls on every dashboard load.

## Step 6: Enable AI-Generated Wikis and Tags

Add metadata context to your Gold views so the AI Agent can answer questions about your enriched catalog:

1. Click **Admin** in the left sidebar, then go to **Project Settings**.
2. Select the **Preferences** tab.
3. Scroll to the **AI** section and enable **Generate Wikis and Labels**.
4. Go to the **Catalog** and navigate to your Gold views under `aicompleteexp.gold`.
5. Click the **Edit** button (pencil icon) next to each view.
6. In the **Details** tab, click **Generate Wiki** and **Generate Tags**.
7. Repeat for all Gold views.

To enhance the generated wiki, copy it into the AI Agent and ask for improvements. For example: "Add context explaining that the executive_summary column is generated by an LLM using actual revenue and customer data, and that summaries are refreshed weekly after the sales data pipeline runs."

## Step 7: Ask Questions with the AI Agent

Navigate to the AI Agent and try these prompts:

**"Which products have the highest net customer growth?"**

The Agent queries `v_product_summaries`, sorts by `net_customer_growth`, and returns the top products with their AI-generated summaries.

**"Show me a chart of total revenue by product category"**

The Agent groups products by `category` in `v_product_performance`, sums revenue, and generates a bar chart showing which categories drive the most revenue.

**"List all products in the Security category with their marketing descriptions"**

The Agent filters `v_marketing_copy` for `category = 'Security'` and returns product names alongside the LLM-generated marketing paragraphs.

**"Create a chart comparing new customers vs churned customers by product"**

The Agent queries `v_product_performance` and creates a grouped bar chart showing customer acquisition and churn side by side, making it easy to spot products with healthy vs. concerning net growth.

## Why Apache Iceberg Matters

Your materialized summary tables are Apache Iceberg tables in the built-in Open Catalog. This means:

- **Time travel:** Compare this week's AI-generated summaries with last week's to see how the narrative changed as sales data evolved
- **Schema evolution:** Add new generated columns (like translations to additional languages) without rewriting existing data
- **ACID transactions:** CTAS jobs write atomically; dashboards never see partial results

### Iceberg vs. Federated for AI_COMPLETE Workloads

**Keep data federated when:** Your source data updates frequently and you want the latest products or sales figures in real-time queries. Use manual Reflections to cache results.

**Migrate to Iceberg when:** You're generating summaries on historical data or building a curated catalog of marketing copy. CTAS materializes the generated text once, and Iceberg's automated performance management (compaction, manifest optimization) keeps the table fast as it grows.

## Next Steps

1. **Connect your real product database** — replace simulated tables with federated connections to your actual catalog and CRM
2. **Generate descriptions in multiple languages** — create additional Gold views with French, German, or Japanese translations
3. **Add FGAC** — mask revenue numbers in generated summaries for roles that shouldn't see financial data
4. **Build Reflections** — create Reflections on materialized tables to accelerate dashboard queries at zero LLM cost

If your team spends time manually writing product summaries, translating content, or creating executive briefings from raw data, `AI_COMPLETE` automates that work inside the same SQL engine where your data already lives. Write a prompt, run a query, and get your generated text in the same governed platform where everything else runs.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=ai-complete-dremio-cloud&utm_content=alexmerced) and start generating insights with SQL.
