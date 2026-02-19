---
title: "Dimensional Modeling: Facts, Dimensions, and Grains"
date: "2026-02-19"
description: "Dimensional modeling is the most widely used approach for organizing analytics data. Developed by Ralph Kimball, it structures data into two types of tables:..."
author: "Alex Merced"
category: "Data Modeling"
bannerImage: "./images/data_modeling/05/conformed-dimensions.png"
tags:
  - data modeling
  - data engineering
  - data lakehouse
  - star schema
  - data architecture
---

![Dimensional model showing a central fact table connected to surrounding dimension tables](images/data_modeling/05/dimensional-modeling.png)

Dimensional modeling is the most widely used approach for organizing analytics data. Developed by Ralph Kimball, it structures data into two types of tables: facts (what happened) and dimensions (the context around what happened). The technique optimizes for query speed and business readability, not for storage efficiency or transactional integrity.

If your goal is to answer business questions quickly and consistently, dimensional modeling is where you start.

## Facts and Dimensions: The Two Building Blocks

**Fact tables** store measurable events. Each row represents something that happened: a sale, a click, a shipment, a login. Fact tables are narrow (a few foreign keys and numeric measures) and deep (millions or billions of rows).

A typical sales fact table might look like:

```sql
CREATE TABLE fact_sales (
    sale_id BIGINT,
    date_key INT,
    customer_key INT,
    product_key INT,
    store_key INT,
    quantity INT,
    unit_price DECIMAL(10,2),
    total_amount DECIMAL(12,2)
)
```

**Dimension tables** provide context. They describe the "who, what, where, when, and how" behind each fact. Dimension tables are wide (many descriptive columns) and shallow (thousands to millions of rows).

A customer dimension might include: customer_name, email, signup_date, city, state, country, segment, lifetime_value, acquisition_channel.

Every analysis query joins a fact table to one or more dimension tables. "Revenue by region" joins the sales fact to the geography dimension. "Revenue by product category" joins the sales fact to the product dimension. The fact table provides the number; the dimensions provide the labels.

## Declaring the Grain

![Grain declaration as the foundation — one row per transaction per line item](images/data_modeling/05/grain-declaration.png)

The grain is the most important decision in dimensional modeling. It declares what one row in your fact table represents.

- "One row per order line item" — each product within an order gets its own row
- "One row per daily customer session" — each customer's daily activity is aggregated into one row
- "One row per monthly account balance" — snapshot taken once per month

**Getting the grain right matters because:**
- Too coarse: You lose detail. If your grain is "one row per order" you can't analyze individual line items.
- Too fine: You create an enormous table that's expensive to query. If your grain is "one row per page view" in a high-traffic application, the table grows by billions of rows per month.
- Inconsistent: If some rows represent individual items and others represent aggregated totals, every calculation produces wrong results.

Declare the grain first. Then identify which dimensions apply at that grain, and which numeric measures belong in the fact table. This order is not optional — skip it, and the model breaks down.

## Designing Fact Tables

Three types of fact tables handle different analytical patterns:

**Transaction facts** record individual events. One row per sale, one row per click. This is the most common type. It supports the most detailed analysis but produces the largest tables.

**Periodic snapshot facts** capture the state at regular intervals. One row per account per month. Useful for balance-tracking, inventory levels, and any measure that accumulates over time.

**Accumulating snapshot facts** track the lifecycle of a process. One row per order, with date columns for each milestone (order_placed, payment_received, shipped, delivered). Useful for analyzing process efficiency and bottleneck identification.

Best practices for fact tables:
- Keep facts additive when possible (SUM-able across dimensions)
- Avoid storing text in fact tables — that belongs in dimensions
- Use surrogate keys (integers) for dimension references, not natural keys
- Never mix grains in one fact table

## Designing Dimension Tables

Well-designed dimensions follow predictable patterns:

**Denormalize.** Include all descriptive attributes in one table. Product name, category, subcategory, brand, manufacturer, department — all in dim_products. This eliminates joins and makes queries readable.

**Use surrogate keys.** Assign an integer key (product_key) that acts as the primary key. Keep the natural business key (product_sku) as a regular attribute. Surrogate keys insulate your model from source system key changes.

**Add audit columns.** Include effective_date, expiry_date, and is_current flag for tracking changes over time (Slowly Changing Dimensions — covered in a separate article).

**Include "junk" dimensions.** Low-cardinality flags and indicators (is_promotional, is_online, payment_type) can be combined into a single "junk dimension" instead of cluttering the fact table.

## Conformed Dimensions

A conformed dimension is shared across multiple fact tables. The best example is the Date dimension — every fact table references dates, and they should all use the same date dimension to ensure consistent filtering and grouping.

Other conformed dimensions: Customer, Product, Employee, Geography. When Sales and Support both reference the same dim_customers table, you can analyze customer behavior across both domains without reconciling different customer definitions.

Conformed dimensions are the connective tissue of a dimensional model. Without them, each fact table exists in isolation.

Platforms like [Dremio](https://www.dremio.com/blog/agentic-analytics-semantic-layer/?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=next-gen-dremio&utm_term=blog-021826-02-18-2026&utm_content=alexmerced) support dimensional modeling through virtual datasets. Fact and dimension views live in the Silver layer of a Medallion Architecture. Conformed dimensions are defined once and referenced by multiple fact views. Wikis document what each dimension attribute means, and AI agents use that documentation to generate accurate queries.

## What to Do Next

![Conformed dimensions shared across multiple fact tables in a unified model](images/data_modeling/05/conformed-dimensions.png)

Start your dimensional model with one business process — the one your team queries most. Declare the grain. Identify the dimensions. Build the fact table. Then expand: pick the next business process, reuse the conformed dimensions, and add new ones as needed.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=next-gen-dremio&utm_term=blog-021826-02-18-2026&utm_content=alexmerced)
