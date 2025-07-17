---
title: Optimizing Compaction for Streaming Workloads in Apache Iceberg
date: "2025-07-29"
author: Alex Merced
description: Learn how to design fast, incremental compaction strategies in Apache Iceberg to support high-throughput streaming pipelines without disrupting freshness or performance.
tags:
  - Apache Iceberg
  - Data Optimization
  - Streaming
  - Compaction
  - Table Maintenance
category: "Apache Iceberg"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
---

- **[Free Apache Iceberg Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=optimization_blogs&utm_content=alexmerced&utm_term=external_blog)**  
- **[Free Copy of “Apache Iceberg: The Definitive Guide”](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=optimization_blogs&utm_content=alexmerced&utm_term=external_blog)**  
- **[Free Copy of “Apache Polaris: The Definitive Guide”](https://hello.dremio.com/wp-apache-polaris-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=optimization_blogs&utm_content=alexmerced&utm_term=external_blog)**  
- **[2025 Apache Iceberg Architecture Guide](https://medium.com/data-engineering-with-dremio/2025-guide-to-architecting-an-iceberg-lakehouse-9b19ed42c9de)**  
- **[Iceberg Lakehouse Engineering Video Playlist](https://youtube.com/playlist?list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe&si=WTSnqjXZv6Glkc3y)**  
- **[Ultimate Apache Iceberg Resource Guide](https://medium.com/data-engineering-with-dremio/ultimate-directory-of-apache-iceberg-resources-e3e02efac62e)** 

# Optimizing Compaction for Streaming Workloads in Apache Iceberg

In traditional batch pipelines, compaction jobs can run in large windows during idle periods. But in streaming workloads, data is written continuously—often in small increments—leading to rapid small file accumulation and tight freshness requirements.

So how do we compact Iceberg tables without interfering with ingestion and latency-sensitive reads? This post explores how to **design efficient, incremental compaction jobs** that preserve performance without disrupting your streaming pipelines.

## The Challenge with Streaming + Compaction

Streaming ingestion into Apache Iceberg often uses micro-batches or event-driven triggers that:
- Generate many small files per partition
- Write new snapshots frequently
- Introduce high metadata churn

A naive compaction job that rewrites entire partitions or the whole table risks:
- **Commit contention** with streaming jobs
- **Stale data** in read replicas or downstream queries
- **Latency spikes** if compaction blocks snapshot availability

The key is to **optimize incrementally and intelligently.**

## Techniques for Streaming-Safe Compaction

### 1. **Compact Only Cold Partitions**

Don’t rewrite partitions actively being written to. Instead:
- Identify "cold" partitions (e.g., older than 1 hour if partioned by hour)
- Compact only those to avoid conflicts with streaming writes

Example query using metadata table:

```sql
SELECT partition, COUNT(*) AS file_count
FROM my_table.files
WHERE last_modified < current_timestamp() - INTERVAL '1 hour'
GROUP BY partition
HAVING COUNT(*) > 10;
```

This can drive dynamic, safe compaction logic in orchestration tools.

### 2. Use Incremental Compaction Windows
Instead of full rewrites:

- Compact only a subset of files at a time (e.g., oldest or smallest)

- Avoid reprocessing already optimized files

- Reduce job run time to minutes instead of hours

Spark's RewriteDataFiles and Dremio's `OPTIMIZE` features both support targeted rewrites.

### 3. Trigger Based on Metadata Metrics
Rather than scheduling compaction at fixed intervals, use metadata-driven triggers like:

- Number of files per partition > threshold

- Average file size < target

- File age > threshold

You can track these via files and manifests metadata tables and use orchestration tools (e.g., Airflow, Dagster, dbt Cloud) to trigger compaction.

Example: Time-Based Compaction Script (Pseudo-code)
```python
# For each partition older than 1 hour with many small files
for partition in get_partitions_older_than(hours=1):
    if count_small_files(partition) > threshold:
        run_compaction(partition)
```

This pattern allows incremental, scoped jobs that don’t touch fresh data.

## Tuning for Performance
Parallelism: Use high parallelism for wide tables to speed up job runtime

Target file size: Stick to 128MB–256MB range unless your queries benefit from larger files

Retries and check-pointing: Make sure jobs are fault-tolerant in production

## Summary
To maintain performance in streaming Iceberg pipelines:

- Compact frequently, but narrowly

- Use metadata to guide scope

- Avoid active partitions and large rewrites

- Leverage orchestration and branching when available

With the right setup, you can keep query performance and data freshness high—without sacrificing one for the other.