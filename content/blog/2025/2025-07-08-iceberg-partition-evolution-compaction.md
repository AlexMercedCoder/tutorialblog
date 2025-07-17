---
title: Hidden Pitfalls — Compaction and Partition Evolution in Apache Iceberg
date: "2025-09-02"
author: Alex Merced
description: Partition evolution in Apache Iceberg is a powerful feature, but if not managed carefully, it can introduce fragmentation and impact compaction performance. Learn how to handle it effectively.
tags:
  - Apache Iceberg
  - Partition Evolution
  - Table Optimization
  - Compaction
  - Data Engineering
category: "Apache Iceberg"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
---

- **[Free Apache Iceberg Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=optimization_blogs&utm_content=alexmerced&utm_term=external_blog)**  
- **[Free Copy of “Apache Iceberg: The Definitive Guide”](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=optimization_blogs&utm_content=alexmerced&utm_term=external_blog)**  
- **[Free Copy of “Apache Polaris: The Definitive Guide”](https://hello.dremio.com/wp-apache-polaris-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=optimization_blogs&utm_content=alexmerced&utm_term=external_blog)**  
- **[2025 Apache Iceberg Architecture Guide](https://medium.com/data-engineering-with-dremio/2025-guide-to-architecting-an-iceberg-lakehouse-9b19ed42c9de)**  
- **[Iceberg Lakehouse Engineering Video Playlist](https://youtube.com/playlist?list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe&si=WTSnqjXZv6Glkc3y)**  
- **[Ultimate Apache Iceberg Resource Guide](https://medium.com/data-engineering-with-dremio/ultimate-directory-of-apache-iceberg-resources-e3e02efac62e)** 

# Hidden Pitfalls — Compaction and Partition Evolution in Apache Iceberg

Apache Iceberg offers **partition evolution**, allowing you to change how your data is partitioned over time without rewriting historical files. This is a major advantage over legacy file formats, but it also introduces new challenges—especially when it comes to **compaction and query optimization**.

In this post, we’ll explore how partition evolution can impact compaction, metadata management, and query performance—and how to avoid the most common pitfalls.

## What Is Partition Evolution?

Partition evolution allows you to:
- Add new partition fields
- Drop old partition fields
- Change partition transforms (e.g., from `day(ts)` to `hour(ts)`)

Unlike traditional systems that enforce a single static layout, Iceberg lets you evolve the partitioning strategy without rewriting or invalidating historical data.

### Example:

```sql
-- Original partitioning
ALTER TABLE sales ADD PARTITION FIELD day(order_date);

-- Later evolve to hourly
ALTER TABLE sales DROP PARTITION FIELD day(order_date);
ALTER TABLE sales ADD PARTITION FIELD hour(order_date);
```
Each snapshot will respect the partition spec that was active at the time the data was written.

## The Pitfall: Compaction Across Partition Specs
When compaction jobs span files written under different partition specs, several challenges arise:

1. File Layout Inconsistency
Compaction may combine files that don’t share a common layout, resulting in mixed partition values that reduce query pruning efficiency.

2. Reduced Predicate Pushdown
Query engines rely on partition columns for efficient pruning. If files are mixed across specs, pruning may be incomplete, increasing scan cost.

3. Compaction Failures or Misbehavior
Some engines may fail to rewrite or rewrite files improperly when specs conflict, especially in older versions of Iceberg libraries or poorly configured environments.

## Best Practices to Manage Partition Evolution Safely
### 1. Compact Within Partition Spec Versions
Query the files metadata table to identify which files belong to which spec:

```sql
Copy
Edit
SELECT spec_id, COUNT(*) AS file_count
FROM my_table.files
GROUP BY spec_id;
```
Run compaction per spec_id to preserve consistency and avoid mixing files.

### 2. Track and Align Sorting and Clustering
When evolving partitions, ensure that sort orders are also updated. Mismatched sort and partition strategies can undermine clustering efforts.

```sql
SELECT spec_id, sort_order_id, COUNT(*) 
FROM my_table.files 
GROUP BY spec_id, sort_order_id;
```

### 3. Repartition Carefully and Gradually
Avoid abrupt changes like:

- Switching from coarse to fine partitioning (e.g., day to minute)

- Dropping too many partition fields at once

- These can lead to over-fragmentation and more small files unless paired with compaction and sort order realignment.

### 4. Use Metadata Tables to Guide Evolution
Before evolving a partition spec:

- Inspect query patterns (e.g., WHERE clauses)

- Evaluate partition sizes and access frequencies

- Use tools like Dremio’s catalog lineage and query analyzer if available

### 5. Communicate Changes Across Teams
If your tables are used across multiple teams or tools:

- Document changes to partitioning logic

- Include schema and partition spec history in data documentation

- Coordinate compaction jobs after major partition changes

## Summary
Partition evolution is one of Iceberg’s superpowers—but like all powerful features, it must be used wisely. To avoid performance and optimization issues:

- Don’t mix files with different partition specs in compaction jobs

- Update sort orders and clustering with partition changes

- Monitor partition usage and access patterns continuously

In the next post, we’ll move from structural design to execution tuning—exploring how to scale compaction operations efficiently using parallelism, checkpointing, and fault tolerance.