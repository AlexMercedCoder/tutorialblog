---
title: "Classify Your Data with SQL: A Hands-On Guide to Dremio's AI_CLASSIFY Function"
date: "2026-03-01"
description: "Most classification workflows require exporting data to Python, running a model, and importing results back into your warehouse. Dremio's AI_CLASSIFY function..."
author: "Alex Merced"
category: "AI Features"
bannerImage: "./images/AI_FEATURE_BLOGS/01/banner.png"
tags:
  - dremio
  - AI
  - SQL
  - data lakehouse
  - machine learning
---

Most classification workflows require exporting data to Python, running a model, and importing results back into your warehouse. Dremio's `AI_CLASSIFY` function eliminates that entire pipeline. You write a SELECT statement, pass in your text and your categories, and the LLM assigns a label. The classified data stays in your lakehouse, governed and queryable immediately.

This tutorial walks you through a complete classification pipeline using a fresh Dremio Cloud account. You'll create sample customer feedback data, build a medallion architecture (Bronze → Silver → Gold), and use `AI_CLASSIFY` to categorize reviews by sentiment, support tickets by department, and product issues by urgency, all inside SQL.

## What You'll Build

By the end of this tutorial, you'll have:
- A customer feedback dataset with 50+ product reviews and 50+ support tickets
- Bronze views that standardize raw data
- Silver views that join reviews with ticket information
- Gold views that use `AI_CLASSIFY` to add sentiment labels, department routing, and urgency tiers
- An Iceberg table that persists your classified data for dashboards
- Wiki metadata that enables the AI Agent to answer natural language questions about your classified data

## Prerequisites

- **Dremio Cloud account** — [sign up free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=ai-classify-dremio-cloud&utm_content=alexmerced) with $400 in compute credits
- **AI enabled** — go to Admin → Project Settings → Preferences → AI section and enable AI features
- **Model Provider configured** — Dremio provides a hosted LLM by default, or you can connect your own (OpenAI, Anthropic, Google Gemini, AWS Bedrock, Azure OpenAI) under the AI preferences

> **Note:** Tables in the built-in Open Catalog use `folder.subfolder.table_name` without a catalog prefix. External sources use `source_name.schema.table_name`.

## Understanding AI_CLASSIFY

`AI_CLASSIFY` sends text to a configured LLM and asks it to pick the best matching label from an array you provide. The function signature:

```sql
AI_CLASSIFY(
  [model_name VARCHAR,]
  prompt VARCHAR,
  categories ARRAY<VARCHAR|INT|FLOAT|BOOLEAN>
) → VARCHAR|INT|FLOAT|BOOLEAN
```

**Parameters:**
- **model_name** (optional) — specify a particular model like `'gpt.4o'`. Format is `modelProvider.modelName`. If omitted, Dremio uses your default configured model.
- **prompt** — the text you want classified. This is typically a column value or a concatenation of columns that gives the LLM enough context.
- **categories** — an `ARRAY` of possible labels. The LLM must return one of these values. Supports `VARCHAR`, `INT`, `FLOAT`, and `BOOLEAN` types.

The return type matches the array element type. If you pass `ARRAY['Positive', 'Negative', 'Neutral']`, you get a `VARCHAR` back. If you pass `ARRAY[1, 2, 3, 4, 5]`, you get an `INT`.

## Step 1: Create Your Folder Structure

Open the **SQL Runner** from the left sidebar in Dremio Cloud and run:

```sql
CREATE FOLDER IF NOT EXISTS aiclassifyexp;
CREATE FOLDER IF NOT EXISTS aiclassifyexp.feedback_data;
CREATE FOLDER IF NOT EXISTS aiclassifyexp.bronze;
CREATE FOLDER IF NOT EXISTS aiclassifyexp.silver;
CREATE FOLDER IF NOT EXISTS aiclassifyexp.gold;
```

This creates a namespace that simulates a customer feedback analytics pipeline with separate layers for raw data, standardized views, business logic, and final outputs.

## Step 2: Seed Your Sample Data

### Customer Reviews Table

This table simulates product reviews collected from an e-commerce platform. Each review includes the customer name, product, a star rating, and the actual review text that we'll classify.

```sql
CREATE TABLE aiclassifyexp.feedback_data.customer_reviews (
  review_id INT,
  customer_name VARCHAR,
  product_name VARCHAR,
  star_rating INT,
  review_text VARCHAR,
  review_date DATE
);

INSERT INTO aiclassifyexp.feedback_data.customer_reviews VALUES
(1, 'Sarah Chen', 'CloudSync Pro', 5, 'Absolutely love this product. Setup took 5 minutes and sync speeds are incredible. Best purchase this year.', '2025-08-15'),
(2, 'James Rodriguez', 'CloudSync Pro', 1, 'Terrible experience. Lost three days of data after the last update. Support was unhelpful and dismissive.', '2025-08-22'),
(3, 'Emily Watson', 'DataVault Enterprise', 4, 'Solid encryption and good performance. The UI could use some polish but the core functionality is reliable.', '2025-09-01'),
(4, 'Michael Brown', 'CloudSync Pro', 3, 'It works fine most of the time but crashes occasionally when syncing large folders. Average product.', '2025-09-05'),
(5, 'Lisa Park', 'DataVault Enterprise', 5, 'Our security team approved this after a thorough review. Encryption standards exceed our compliance requirements.', '2025-09-10'),
(6, 'David Kim', 'QuickReport', 2, 'The reports look nice but generation takes forever. For the price point there are faster alternatives.', '2025-09-12'),
(7, 'Anna Kowalski', 'QuickReport', 4, 'Great templates and easy export options. Scheduling could be more flexible but overall a good tool.', '2025-09-18'),
(8, 'Robert Taylor', 'CloudSync Pro', 1, 'Second time this month it corrupted my files during sync. Considering switching to a competitor.', '2025-09-20'),
(9, 'Maria Garcia', 'DataVault Enterprise', 5, 'Migrated 50TB without a single issue. The deduplication feature alone saved us $2000/month in storage.', '2025-09-25'),
(10, 'Tom Williams', 'QuickReport', 3, 'Decent for basic reports. Falls short on complex multi-source dashboards. Not bad, not great.', '2025-10-01'),
(11, 'Jennifer Lee', 'CloudSync Pro', 4, 'Fast reliable syncing across all our devices. The mobile app needs improvement though.', '2025-10-05'),
(12, 'Chris Martinez', 'DataVault Enterprise', 2, 'Way too complicated for a small team. We spent two weeks just on initial configuration.', '2025-10-08'),
(13, 'Rachel Adams', 'QuickReport', 5, 'Finally a reporting tool that non-technical people can use. Our marketing team builds their own reports now.', '2025-10-12'),
(14, 'Kevin Thompson', 'CloudSync Pro', 1, 'Billing issue: charged twice and it took three weeks to get a refund. Product aside the billing system is broken.', '2025-10-15'),
(15, 'Sophia Nguyen', 'DataVault Enterprise', 4, 'Strong security features and audit logging. Integration with our SSO provider was straightforward.', '2025-10-20'),
(16, 'Daniel Wilson', 'QuickReport', 3, 'Good for monthly summaries but real-time dashboards lag noticeably. Suitable for batch reporting only.', '2025-10-22'),
(17, 'Amanda Clark', 'CloudSync Pro', 5, 'Our entire team switched from Dropbox. The conflict resolution on shared files is leagues better.', '2025-10-25'),
(18, 'Brian Harris', 'DataVault Enterprise', 1, 'Critical vulnerability found in version 3.2. Support acknowledged it but the patch took 6 weeks.', '2025-10-28'),
(19, 'Michelle Lopez', 'QuickReport', 4, 'Clean interface and the PDF export quality is excellent. API access for automation would be a welcome addition.', '2025-11-01'),
(20, 'Steven Moore', 'CloudSync Pro', 2, 'Sync works but the desktop app uses 800MB of RAM just sitting in the background. Needs optimization.', '2025-11-05'),
(21, 'Laura Jackson', 'DataVault Enterprise', 5, 'Passed our SOC 2 audit partly because of DataVault detailed access logs. Worth every penny.', '2025-11-08'),
(22, 'Andrew White', 'QuickReport', 2, 'Crashed twice during a client presentation. Embarrassing and unacceptable for a paid product.', '2025-11-10'),
(23, 'Catherine Hall', 'CloudSync Pro', 4, 'Selective sync feature is a lifesaver for laptops with small drives. Smart storage management.', '2025-11-15'),
(24, 'Mark Allen', 'DataVault Enterprise', 3, 'Good product hampered by poor documentation. We figured out most features through trial and error.', '2025-11-18'),
(25, 'Jessica Young', 'QuickReport', 5, 'The scheduled email reports feature saved our ops team 10 hours per week. Simple and effective.', '2025-11-20');
```

### Support Tickets Table

This table simulates a customer support system. Each ticket has a description written by the customer, a status, and a priority that was manually assigned. We'll use `AI_CLASSIFY` to automatically route these tickets by department.

```sql
CREATE TABLE aiclassifyexp.feedback_data.support_tickets (
  ticket_id INT,
  customer_name VARCHAR,
  product_name VARCHAR,
  ticket_description VARCHAR,
  manual_priority VARCHAR,
  ticket_status VARCHAR,
  created_date DATE,
  resolved_date DATE
);

INSERT INTO aiclassifyexp.feedback_data.support_tickets VALUES
(1001, 'James Rodriguez', 'CloudSync Pro', 'Lost all synced files after update 4.2.1. Need immediate recovery assistance.', 'Critical', 'Resolved', '2025-08-20', '2025-08-25'),
(1002, 'Kevin Thompson', 'CloudSync Pro', 'Charged $49.99 twice on my credit card for October subscription. Need refund for duplicate charge.', 'Medium', 'Resolved', '2025-10-14', '2025-11-04'),
(1003, 'Robert Taylor', 'CloudSync Pro', 'Files corrupted during sync for the second time. Happening with files over 500MB.', 'High', 'Open', '2025-09-19', NULL),
(1004, 'Chris Martinez', 'DataVault Enterprise', 'Cannot figure out how to configure SSO integration. Documentation references outdated menu options.', 'Medium', 'Resolved', '2025-10-07', '2025-10-10'),
(1005, 'Brian Harris', 'DataVault Enterprise', 'Security scan flagged CVE-2025-1234 in version 3.2 encryption module. When will this be patched?', 'Critical', 'Resolved', '2025-10-27', '2025-12-08'),
(1006, 'Andrew White', 'QuickReport', 'App crashes when rendering charts with more than 10000 data points. Happens consistently in Chrome.', 'High', 'Open', '2025-11-09', NULL),
(1007, 'Sarah Chen', 'CloudSync Pro', 'Would love to see a Linux desktop client. Currently only Windows and Mac are supported.', 'Low', 'Open', '2025-08-30', NULL),
(1008, 'David Kim', 'QuickReport', 'Report generation takes 45+ seconds for simple 3-page reports. Was faster in the previous version.', 'Medium', 'Open', '2025-09-13', NULL),
(1009, 'Emily Watson', 'DataVault Enterprise', 'Need to add 50 new users to our plan. What are the volume discount options?', 'Low', 'Resolved', '2025-09-03', '2025-09-05'),
(1010, 'Steven Moore', 'CloudSync Pro', 'Desktop app consuming excessive memory (800MB+). Running Windows 11 with 16GB RAM.', 'Medium', 'Open', '2025-11-04', NULL),
(1011, 'Lisa Park', 'DataVault Enterprise', 'Can we get a custom retention policy for healthcare compliance? HIPAA requires 7-year retention.', 'Medium', 'Resolved', '2025-09-12', '2025-09-20'),
(1012, 'Tom Williams', 'QuickReport', 'How do I connect QuickReport to a PostgreSQL database? Only seeing MySQL option in connectors.', 'Low', 'Resolved', '2025-10-02', '2025-10-03'),
(1013, 'Mark Allen', 'DataVault Enterprise', 'API documentation has broken links on the authentication section. Pages return 404.', 'Low', 'Open', '2025-11-17', NULL),
(1014, 'Michael Brown', 'CloudSync Pro', 'Selective sync keeps re-enabling folders I excluded. Happens after every app restart.', 'Medium', 'Open', '2025-09-06', NULL),
(1015, 'Daniel Wilson', 'QuickReport', 'Real-time dashboard shows data that is 15 minutes stale. Expected near real-time refresh.', 'High', 'Open', '2025-10-23', NULL),
(1016, 'Anna Kowalski', 'QuickReport', 'Can you add a dark mode option? The white background is hard on the eyes during evening work.', 'Low', 'Open', '2025-09-19', NULL),
(1017, 'Sophia Nguyen', 'DataVault Enterprise', 'Our SSO integration broke after your last update. 200 users locked out for 4 hours.', 'Critical', 'Resolved', '2025-10-21', '2025-10-21'),
(1018, 'Jennifer Lee', 'CloudSync Pro', 'Mobile app on iOS frequently logs me out. Have to re-authenticate 3-4 times per day.', 'Medium', 'Open', '2025-10-06', NULL),
(1019, 'Rachel Adams', 'QuickReport', 'Love the product! Any plans for a Slack integration to send report summaries to channels?', 'Low', 'Open', '2025-10-13', NULL),
(1020, 'Amanda Clark', 'CloudSync Pro', 'Conflict resolution dialog is confusing. Hard to tell which version is newer when filenames match.', 'Medium', 'Resolved', '2025-10-26', '2025-10-30'),
(1021, 'Catherine Hall', 'CloudSync Pro', 'Bandwidth throttling feature needed. Sync saturates our office internet during business hours.', 'Medium', 'Open', '2025-11-16', NULL),
(1022, 'Maria Garcia', 'DataVault Enterprise', 'Deduplication incorrectly merged two different client folders. Data was mixed across accounts.', 'Critical', 'Resolved', '2025-09-26', '2025-09-28'),
(1023, 'Laura Jackson', 'DataVault Enterprise', 'Need export of all access logs for the past 12 months for our annual SOC 2 audit.', 'Medium', 'Resolved', '2025-11-09', '2025-11-11'),
(1024, 'Jessica Young', 'QuickReport', 'Scheduled reports occasionally skip a week. No error notification when this happens.', 'High', 'Open', '2025-11-21', NULL),
(1025, 'Michelle Lopez', 'QuickReport', 'Please add an API endpoint for programmatic report generation. We want to automate monthly client reports.', 'Low', 'Open', '2025-11-02', NULL);
```

## Step 3: Build Bronze Views

Bronze views standardize column names and data types without applying business logic. This creates a consistent foundation for downstream analysis.

The reviews table needs its `DATE` column cast to `TIMESTAMP` for consistent joins later. The tickets table also needs date casting, and we rename `manual_priority` to `assigned_priority` to distinguish it from AI-generated classifications.

```sql
CREATE OR REPLACE VIEW aiclassifyexp.bronze.v_reviews AS
SELECT
  review_id,
  customer_name,
  product_name,
  star_rating,
  review_text,
  CAST(review_date AS TIMESTAMP) AS review_timestamp
FROM aiclassifyexp.feedback_data.customer_reviews;

CREATE OR REPLACE VIEW aiclassifyexp.bronze.v_tickets AS
SELECT
  ticket_id,
  customer_name,
  product_name,
  ticket_description,
  manual_priority AS assigned_priority,
  ticket_status,
  CAST(created_date AS TIMESTAMP) AS created_timestamp,
  CAST(resolved_date AS TIMESTAMP) AS resolved_timestamp
FROM aiclassifyexp.feedback_data.support_tickets;
```

## Step 4: Build Silver Views

This Silver view joins reviews with related support tickets for the same customer and product. This gives us a combined picture: what did the customer say in their review, and did they also file a support ticket? The `LEFT JOIN` ensures we keep all reviews even if the customer never opened a ticket.

```sql
CREATE OR REPLACE VIEW aiclassifyexp.silver.v_customer_feedback AS
SELECT
  r.review_id,
  r.customer_name,
  r.product_name,
  r.star_rating,
  r.review_text,
  r.review_timestamp,
  t.ticket_id,
  t.ticket_description,
  t.assigned_priority,
  t.ticket_status,
  t.created_timestamp AS ticket_created,
  t.resolved_timestamp AS ticket_resolved,
  CASE WHEN t.ticket_id IS NOT NULL THEN 'Yes' ELSE 'No' END AS has_support_ticket
FROM aiclassifyexp.bronze.v_reviews r
LEFT JOIN aiclassifyexp.bronze.v_tickets t
  ON r.customer_name = t.customer_name
  AND r.product_name = t.product_name;
```

## Step 5: Build Gold Views with AI_CLASSIFY

This is where the AI functions do real work. Each Gold view applies `AI_CLASSIFY` to categorize text that would otherwise require manual review or an external ML pipeline.

### Gold View 1: Sentiment Classification

This view classifies every review as Positive, Negative, or Neutral. Instead of relying solely on star ratings (which can be inconsistent with the actual text), the LLM reads the full review and assigns a sentiment label. We concatenate the product name with the review text to give the model full context.

```sql
CREATE OR REPLACE VIEW aiclassifyexp.gold.v_review_sentiment AS
SELECT
  review_id,
  customer_name,
  product_name,
  star_rating,
  review_text,
  review_timestamp,
  AI_CLASSIFY(
    'Classify the sentiment of this product review: ' || review_text,
    ARRAY['Positive', 'Negative', 'Neutral']
  ) AS ai_sentiment,
  has_support_ticket
FROM aiclassifyexp.silver.v_customer_feedback;
```

Notice that we keep both `star_rating` and `ai_sentiment`. This lets you compare the two signals. A 3-star review with "Negative" AI sentiment suggests the customer is more frustrated than the rating alone indicates.

### Gold View 2: Ticket Department Routing

This view uses `AI_CLASSIFY` to automatically route support tickets to the right department based on the ticket description. Instead of a human reading every ticket and assigning it, the LLM reads the description and selects from four departments.

```sql
CREATE OR REPLACE VIEW aiclassifyexp.gold.v_ticket_routing AS
SELECT
  ticket_id,
  customer_name,
  product_name,
  ticket_description,
  assigned_priority,
  ticket_status,
  created_timestamp,
  resolved_timestamp,
  AI_CLASSIFY(
    'Based on this support ticket, which department should handle it: ' || ticket_description,
    ARRAY['Billing', 'Technical Support', 'Feature Request', 'Account Management']
  ) AS ai_department,
  AI_CLASSIFY(
    'Rate the urgency of this support ticket: ' || ticket_description,
    ARRAY['Critical', 'High', 'Medium', 'Low']
  ) AS ai_urgency
FROM aiclassifyexp.bronze.v_tickets;
```

This view applies two separate `AI_CLASSIFY` calls on each row: one for department routing and one for urgency. You can compare `ai_urgency` against the manually assigned `assigned_priority` to find tickets where human triage may have underestimated or overestimated severity.

### Using Numeric Categories

`AI_CLASSIFY` also supports numeric arrays. If you want a 1-5 satisfaction score instead of text labels:

```sql
SELECT
  review_id,
  review_text,
  AI_CLASSIFY(
    'Rate customer satisfaction from 1 (very dissatisfied) to 5 (very satisfied): ' || review_text,
    ARRAY[1, 2, 3, 4, 5]
  ) AS ai_satisfaction_score
FROM aiclassifyexp.bronze.v_reviews;
```

The LLM returns an `INT` because the array contains integers. This is useful when you need numeric scores for aggregation, averages, or trend analysis.

## Persisting Results with CTAS

AI function calls consume LLM tokens on every query execution. For dashboards or reports that run the same classification repeatedly, materialize the results into an Iceberg table with `CREATE TABLE AS SELECT` (CTAS):

```sql
CREATE TABLE aiclassifyexp.gold.classified_reviews AS
SELECT * FROM aiclassifyexp.gold.v_review_sentiment;
```

This creates a physical Iceberg table with the AI classifications baked in. Subsequent queries against `classified_reviews` are standard SQL queries with no LLM cost. Refresh the table periodically (daily, weekly) as new reviews come in by running CTAS again with `CREATE OR REPLACE TABLE`.

## Managing AI Workloads

AI function queries are more resource-intensive than standard SQL. Dremio provides engine routing to isolate these workloads:

```sql
-- Dremio provides these routing functions for workload management:
-- query_calls_ai_functions() — returns true if the query uses AI functions
-- query_has_attribute('AI_FUNCTIONS') — same check, different syntax
```

In your Dremio Cloud project settings, you can create engine routing rules that automatically direct queries containing AI functions to a dedicated engine. This prevents a large classification batch job from competing with your executive dashboards for compute resources. Set up a separate engine with appropriate scaling for AI workloads, and create a routing rule using `query_calls_ai_functions()` to send AI queries there automatically.

## Choosing Your Model Provider

The optional `model_name` parameter lets you target specific models for different tasks:

```sql
-- Use a specific model for classification
SELECT AI_CLASSIFY(
  'openai.gpt-4o',
  'Classify this ticket: ' || ticket_description,
  ARRAY['Billing', 'Technical Support', 'Feature Request']
) AS department
FROM aiclassifyexp.bronze.v_tickets;
```

Dremio supports multiple providers: OpenAI, Anthropic, Google Gemini, AWS Bedrock, and Azure OpenAI. You configure providers in Admin → Project Settings → Preferences → AI. The format is `providerName.modelName`, where `providerName` is the name you gave the provider during setup.

If you skip `model_name`, Dremio uses your default model. For most classification tasks, the default model works well. Specifying a model makes sense when you need a particular model's strengths (like a smaller, faster model for simple sentiment vs. a larger model for nuanced multi-class categorization).

## Step 6: Enable AI-Generated Wikis and Tags

Good metadata makes the AI Agent more accurate when answering natural language questions. Here's how to add context to your Gold views:

1. Click **Admin** in the left sidebar, then go to **Project Settings**.
2. Select the **Preferences** tab.
3. Scroll to the **AI** section and enable **Generate Wikis and Labels**.
4. Go to the **Catalog** and navigate to your Gold views under `aiclassifyexp.gold`.
5. Click the **Edit** button (pencil icon) next to the desired view.
6. In the **Details** tab, find the **Wiki** section and click **Generate Wiki**. Do the same for the **Tags** section by clicking **Generate Tags**.
7. Repeat for each Gold view.

To enhance the generated wiki with additional business context, copy the output into the **AI Agent** on the homepage and ask it to produce an improved version in a markdown code block. For example, ask the Agent to add details like "Positive sentiment reviews are candidates for testimonial collection. Negative sentiment reviews with support tickets should trigger a customer success outreach." Copy the Agent's refined output and paste it back into the wiki editor.

Wikis and labels are the context that Dremio's AI Agent reads before generating SQL. Better metadata produces more accurate natural language responses.

## Step 7: Ask Questions with the AI Agent

With your classified data and enriched wikis in place, navigate to the AI Agent on the Dremio homepage and try these prompts:

**"Which products have the most negative reviews?"**

The Agent queries `v_review_sentiment`, filters by `ai_sentiment = 'Negative'`, groups by `product_name`, and returns a count. You'll see which products need attention based on LLM-analyzed sentiment rather than just star ratings.

**"Show me a chart of ticket routing by department"**

The Agent queries `v_ticket_routing`, groups by `ai_department`, and generates a bar chart showing how tickets distribute across Billing, Technical Support, Feature Request, and Account Management.

**"List all critical urgency tickets that are still open, ordered by creation date"**

The Agent filters `v_ticket_routing` for `ai_urgency = 'Critical'` and `ticket_status = 'Open'`, sorts by `created_timestamp`, and returns the results. This surfaces tickets that AI flagged as critical but haven't been resolved.

**"Create a chart showing sentiment distribution by product and whether the customer has a support ticket"**

The Agent creates a multi-dimensional visualization from `v_review_sentiment`, cross-referencing `product_name`, `ai_sentiment`, and `has_support_ticket`. This reveals patterns like "CloudSync Pro has the most negative reviews among customers who also filed support tickets."

## Why Apache Iceberg Matters

All the tables you created in this tutorial are Apache Iceberg tables stored in Dremio's built-in Open Catalog. Iceberg provides ACID transactions, schema evolution, and time travel, but the performance benefits are especially relevant for AI-classified data.

### Iceberg vs. Federated for AI Workloads

**Keep data federated when:** Your classification needs real-time source data; for example, classifying support tickets as they arrive from a live PostgreSQL database. Use manual Reflections with a short refresh interval to accelerate federated queries.

**Migrate to Iceberg when:** You're running batch classification jobs on historical data. The CTAS approach above creates Iceberg tables. Iceberg's automated performance management (compaction, manifest optimization, clustering) keeps these growing tables fast. Autonomous Reflections can auto-create pre-computed materializations based on how your dashboards query the classified data.

### Cost Optimization Pattern

Run `AI_CLASSIFY` once via CTAS to materialize results. Build Reflections on the materialized table for dashboard queries. This pattern means you pay for LLM tokens once during classification, and all subsequent analytical queries hit cached Reflections at zero LLM cost.

## Next Steps

1. **Connect real data sources** — replace the `feedback_data` folder with federated connections to your actual CRM, support platform, and review system
2. **Add Fine-Grained Access Control (FGAC)** — mask customer names or PII in classified results so analysts see sentiment patterns without accessing personal data
3. **Experiment with Boolean classification** — use `ARRAY[true, false]` for binary decisions like "Is this review about a security concern?" or "Does this ticket mention data loss?"
4. **Scale with Reflections** — create Reflections on your materialized classification tables to accelerate dashboard queries

If you're running manual classification processes today, whether it's tagging support tickets, scoring reviews, or categorizing feedback, `AI_CLASSIFY` replaces those workflows with a single SQL query. The classification runs inside the same platform where your data lives, governed by the same access controls, and immediately available to every BI tool and AI agent connected to Dremio.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=ai-classify-dremio-cloud&utm_content=alexmerced) and start classifying your data with SQL.
