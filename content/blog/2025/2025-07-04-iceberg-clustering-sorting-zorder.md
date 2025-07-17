---
title: Smarter Data Layout — Sorting and Clustering Iceberg Tables
date: "2025-08-05"
author: Alex Merced
description: Improve query performance in Apache Iceberg by organizing your data layout with sorting and Z-order clustering. Learn how to reduce scan cost and improve filter effectiveness.
tags:
  - Apache Iceberg
  - Clustering
  - Sorting
  - Z-order
  - Query Optimization
category: "Apache Iceberg"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
---

- **[Free Apache Iceberg Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=optimization_blogs&utm_content=alexmerced&utm_term=external_blog)**  
- **[Free Copy of “Apache Iceberg: The Definitive Guide”](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=optimization_blogs&utm_content=alexmerced&utm_term=external_blog)**  
- **[Free Copy of “Apache Polaris: The Definitive Guide”](https://hello.dremio.com/wp-apache-polaris-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=optimization_blogs&utm_content=alexmerced&utm_term=external_blog)**  
- **[2025 Apache Iceberg Architecture Guide](https://medium.com/data-engineering-with-dremio/2025-guide-to-architecting-an-iceberg-lakehouse-9b19ed42c9de)**  
- **[Iceberg Lakehouse Engineering Video Playlist](https://youtube.com/playlist?list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe&si=WTSnqjXZv6Glkc3y)**  
- **[Ultimate Apache Iceberg Resource Guide](https://medium.com/data-engineering-with-dremio/ultimate-directory-of-apache-iceberg-resources-e3e02efac62e)** 

# Smarter Data Layout — Sorting and Clustering Iceberg Tables

So far in this series, we've focused on optimizing file sizes to reduce metadata and scan overhead. But **how data is laid out within those files** can be just as important as the size of the files themselves.

In this post, we'll explore **clustering techniques in Apache Iceberg**, including **sort order** and **Z-ordering**, and how these techniques improve query performance by reducing the amount of data that needs to be read.

## Why Clustering Matters

Imagine a query that filters on a `customer_id`. If your data is randomly distributed, every file needs to be scanned. But if the data is sorted or clustered, the engine can skip over entire files or row groups — reducing I/O and speeding up execution.

Clustering benefits:
- Fewer files and rows scanned
- Better compression ratios
- Faster joins and aggregations
- More efficient pruning of partitions and row groups

## Sorting in Iceberg

Iceberg supports **sort order evolution**, which lets you define how data should be physically sorted as it's written or rewritten.

You can define sort orders during write or compaction:

```scala
import org.apache.iceberg.SortOrder
import static org.apache.iceberg.expressions.Expressions.*;

table.updateSortOrder()
  .sortBy(asc("customer_id"), desc("order_date"))
  .commit();
```

## Use Cases for Sorting
- **Time-series data:** sort by event_time to improve range queries

- **Dimension filters:** sort by commonly filtered columns like region, user_id

- **Joins:** sort by join keys to speed up hash joins and reduce shuffling

## Z-order Clustering
Z-ordering is a multi-dimensional clustering technique that co-locates related values across multiple columns. It's ideal for exploratory queries that filter on different combinations of columns.

Example:
```scala
table.updateSortOrder()
  .sortBy(zorder("customer_id", "product_id", "region"))
  .commit();
```
Z-ordering works by interleaving bits from multiple columns to keep related rows close together. This increases the chance that queries filtering on any subset of these columns can benefit from data skipping.

**Note:** Z-ordering is supported by Iceberg through integrations like Dremio's Iceberg Auto-Clustering and Spark jobs using RewriteDataFiles.

## Choosing Between Sort and Z-order
| Use Case                     | Best Technique     |
|-----------------------------|--------------------|
| Filtering on one key column | Simple Sort        |
| Range queries on timestamps | Sort on time       |
| Multi-column filtering      | Z-order            |
| Joins on a key column       | Sort on join key   |
| Complex OLAP-style filters  | Z-order            |


## When to Apply Clustering
Clustering is typically applied:

- During initial writes, if the engine supports it

- As part of compaction jobs, using RewriteDataFiles with sort order

- In Spark, you can specify sort order in rewrite actions:

```scala
Actions.forTable(spark, table)
  .rewriteDataFiles()
  .sortBy("region", "event_time")
  .execute();
```
Make sure the sort order aligns with your most frequent query patterns.

## Tradeoffs
While clustering helps query performance, it comes with tradeoffs:

- Sorting increases job duration: Sorting is more expensive than just rewriting files

- Clustering can become outdated: Evolving data patterns may require adjusting sort orders

- Not all engines respect sort order: Make sure your query engine leverages the layout

## Summary
Smart data layout is essential for fast queries in Apache Iceberg. By leveraging sorting and Z-order clustering:

- You reduce the volume of data scanned

- Improve filter selectivity

- Optimize performance for a wide variety of workloads

In the next post, we’ll look at another silent performance killer: metadata bloat, and how to clean it up using snapshot expiration and manifest rewriting.