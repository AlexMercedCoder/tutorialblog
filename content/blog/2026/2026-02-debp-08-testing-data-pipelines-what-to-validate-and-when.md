---
title: "Testing Data Pipelines: What to Validate and When"
date: "2026-02-19"
description: "Ask an application developer how they test their code and they'll describe unit tests, integration tests, CI/CD pipelines, and coverage metrics. Ask a data e..."
author: "Alex Merced"
category: "Data Engineering"
bannerImage: "./images/debp/08/regression-testing.png"
tags:
  - data engineering
  - best practices
  - data pipelines
  - data quality
  - data lakehouse
---

![Data pipeline testing pyramid with schema tests at the base, contract tests in the middle, and regression tests at the top](images/debp/08/testing-pyramid.png)

Ask an application developer how they test their code and they'll describe unit tests, integration tests, CI/CD pipelines, and coverage metrics. Ask a data engineer the same question and the most common answer is: "we check the dashboard."

Data pipelines are software. They have inputs, logic, and outputs. They can have bugs. They can break silently. And unlike application bugs that trigger error pages, data bugs produce numbers that look plausible — until someone makes a business decision based on them.

## Pipelines Are Software — They Need Tests

The bar for data pipeline testing shouldn't be lower than for application code. If anything, it should be higher. Application bugs are usually visible (broken UI, failed request). Data bugs are invisible (wrong aggregation, missing rows, stale values) and their impact compounds over time.

Yet most data teams have no automated tests. They rely on manual spot-checks, analyst complaints, and hope. Testing a pipeline means catching problems before they reach consumers, not after.

## The Testing Pyramid for Data

Borrow the testing pyramid from software engineering and adapt it for data:

**Base: Schema and contract tests.** Fast, cheap, run on every pipeline execution. Does the output schema match what consumers expect? Do required columns exist? Are data types correct? These tests catch structural problems (dropped columns, type changes) immediately.

**Middle: Data validation tests.** Check the values in the output. Are primary keys unique? Are required columns non-null? Do amounts, dates, and counts fall within valid ranges? These tests catch quality problems (duplicates, nulls, outliers) before they propagate.

**Top: Regression and integration tests.** Compare today's output to historical patterns. Did the row count change dramatically? Did the total revenue shift by more than 10%? These tests catch subtle logic errors and upstream data changes.

Run more tests at the base (they're cheap and fast) and fewer at the top (they're expensive but comprehensive).

## Schema and Contract Tests

Schema tests are the simplest and most impactful place to start. After every pipeline run, verify:

**Column existence.** Every expected column is present in the output. If a transformation accidentally drops a column, you want to know immediately — not when a downstream query fails.

**Data types.** Columns have their expected types. A revenue column that silently became a string will pass a NULL check but break calculations.

**Not-null constraints.** Required columns contain no nulls. An order table where `customer_id` is null means the join to the customer table will silently lose rows.

**Uniqueness.** Primary key columns have no duplicates. Duplicate order IDs mean double-counted revenue.

```sql
-- Example schema and contract tests
-- Check for unexpected nulls
SELECT COUNT(*) AS null_count
FROM orders
WHERE order_id IS NULL OR customer_id IS NULL;

-- Check for duplicates
SELECT order_id, COUNT(*) AS cnt
FROM orders
GROUP BY order_id
HAVING COUNT(*) > 1;
```

![Schema test examples: column existence, type validation, null checks, uniqueness checks](images/debp/08/schema-tests.png)

## Runtime Data Validation

Schema tests verify structure. Data validation tests verify content. Run these after every pipeline execution, before marking the job as successful:

**Range checks.** Numeric values fall within expected bounds. An order total of -$500 or $999,999,999 is likely a bug. Define acceptable ranges per column and flag outliers.

**Referential integrity.** Foreign keys reference existing records. An order with `product_id = 12345` should correspond to a row in the products table. Missing references indicate either missing data or a pipeline timing issue.

**Freshness checks.** The most recent event timestamp is within the expected window. If a daily pipeline's output contains no events from today, something went wrong — even if the job succeeded.

**Volume checks.** Row counts fall within historical norms. A daily feed that normally produces 50,000 rows but arrives with 500 should trigger an alert. Use percentage thresholds (±20% from the trailing 7-day average) to avoid false positives.

**Custom business rules.** Domain-specific assertions. "Every invoice must have at least one line item." "No employee should have a start date in the future." These rules encode business knowledge that generic tests can't capture.

## Regression and Anomaly Detection

Regression tests compare today's output to historical baselines:

**Aggregate comparison.** Compare key metrics (total revenue, row count, distinct customer count) against the previous run. Deviations beyond a threshold (e.g., ±15%) may indicate an upstream change, a bug in new transformation logic, or missing source data.

**Distribution checks.** Compare the distribution of categorical columns (status values, country codes) against historical norms. A sudden spike in "unknown" status may indicate a schema change in the source.

**Trend analysis.** Track metrics over time. A gradual decline in row count over weeks may indicate a leak that daily checks miss.

![Regression testing: comparing aggregates, distributions, and trends over time](images/debp/08/regression-testing.png)

Regression tests are more expensive to maintain because they require historical baselines and threshold tuning. Start simple (row count ± 20%) and refine as you learn what normal looks like.

## What to Do Next

Add three tests to your most critical pipeline today: a uniqueness check on the primary key, a null check on required columns, and a row count comparison against yesterday's output. Run them after every pipeline execution. These three tests alone will catch the majority of data problems before they reach consumers.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=next-gen-dremio&utm_term=blog-021826-02-18-2026&utm_content=alexmerced)
