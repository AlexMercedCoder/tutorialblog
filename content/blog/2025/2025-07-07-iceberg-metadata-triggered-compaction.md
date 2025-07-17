---
title: Using Iceberg Metadata Tables to Determine When Compaction Is Needed
date: "2025-08-26"
author: Alex Merced
description: Discover how to use Apache Iceberg's metadata tables to proactively detect small files, bloated manifests, and table fragmentation—so you can trigger compaction only when it's needed.
tags:
  - Apache Iceberg
  - Metadata Tables
  - Table Optimization
  - Automation
  - Compaction
category: "Apache Iceberg"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
---

- **[Free Apache Iceberg Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=optimization_blogs&utm_content=alexmerced&utm_term=external_blog)**  
- **[Free Copy of “Apache Iceberg: The Definitive Guide”](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=optimization_blogs&utm_content=alexmerced&utm_term=external_blog)**  
- **[Free Copy of “Apache Polaris: The Definitive Guide”](https://hello.dremio.com/wp-apache-polaris-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=optimization_blogs&utm_content=alexmerced&utm_term=external_blog)**  
- **[2025 Apache Iceberg Architecture Guide](https://medium.com/data-engineering-with-dremio/2025-guide-to-architecting-an-iceberg-lakehouse-9b19ed42c9de)**  
- **[Iceberg Lakehouse Engineering Video Playlist](https://youtube.com/playlist?list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe&si=WTSnqjXZv6Glkc3y)**  
- **[Ultimate Apache Iceberg Resource Guide](https://medium.com/data-engineering-with-dremio/ultimate-directory-of-apache-iceberg-resources-e3e02efac62e)** 

# Using Iceberg Metadata Tables to Determine When Compaction Is Needed

Scheduling compaction at fixed intervals is better than not optimizing at all—but it can still lead to unnecessary compute spend or delayed maintenance. A smarter approach is to **dynamically trigger compaction** based on **real-time metadata signals**.

Apache Iceberg makes this possible with its powerful system of **metadata tables**, which expose granular details about files, snapshots, and manifests.

In this post, we'll explore how to query these tables to:
- Detect small files
- Identify bloated partitions
- Spot manifest inefficiencies
- Automate event-driven compaction workflows

## What Are Iceberg Metadata Tables?

Every Iceberg table automatically maintains a set of virtual tables that expose its internals. The most relevant for optimization include:

- `files` – List of all data files in the table, including size, partition, and metrics
- `manifests` – List of manifest files and the data files they reference
- `snapshots` – History of table changes and snapshot metadata
- `history` – Timeline of snapshot commits and their lineage

These tables can be queried like any other SQL table, making it easy to introspect your table’s health.

## 1. Detecting Small Files with the `files` Table

To identify partitions suffering from small file syndrome:

```sql
SELECT
  partition,
  COUNT(*) AS file_count,
  AVG(file_size_in_bytes) AS avg_size_bytes
FROM my_table.files
GROUP BY partition
HAVING COUNT(*) > 10 AND AVG(file_size_in_bytes) < 134217728; -- 128 MB
```

You can use this to:

- Trigger compaction on specific partitions

- Monitor trends in file size distribution over time

## 2. Finding Fragmented or Stale Manifests
Bloated metadata can come from too many or inefficient manifest files. Use the manifests table to explore:

```sql
SELECT
  COUNT(*) AS manifest_count,
  AVG(added_data_files_count) AS avg_files_per_manifest
FROM my_table.manifests;
```

Low averages can indicate fragmented manifests that are good candidates for rewriting.

## 3. Tracking Snapshot Volume and Velocity
To see if snapshots are accumulating too fast (and increasing metadata overhead):

```sql
SELECT
  COUNT(*) AS snapshot_count,
  MIN(committed_at) AS first_snapshot,
  MAX(committed_at) AS latest_snapshot
FROM my_table.snapshots;
```

You can also inspect how many files each snapshot adds or removes to identify noisy patterns from ingestion jobs.

## 4. Building a Health Score
By combining file count, file size, manifest count, and snapshot frequency, you can compute a "table health score":

```sql
-- Example: High file count + small average size = poor health
WITH file_stats AS (
  SELECT COUNT(*) AS total_files, AVG(file_size_in_bytes) AS avg_file_size
  FROM my_table.files
),
manifest_stats AS (
  SELECT COUNT(*) AS total_manifests
  FROM my_table.manifests
)
SELECT
  total_files,
  avg_file_size,
  total_manifests,
  CASE
    WHEN avg_file_size < 67108864 AND total_files > 1000 THEN 'Needs compaction'
    ELSE 'Healthy'
  END AS status
FROM file_stats, manifest_stats;
```

## 5. Triggering Compaction Automatically
Once you identify problematic patterns, you can wire up your orchestration layer to act:

- Use Airflow, Dagster, or dbt Cloud to run SQL-based checks

- When thresholds are breached, trigger Spark/Flink compaction jobs

- Track results and update monitoring dashboards

- This ensures you optimize only when needed, keeping costs and latency low.

## Benefits of Metadata-Driven Optimization
- Precision: Only touch affected partitions

- Efficiency: Avoid unnecessary compute jobs

- Responsiveness: React to real-time ingestion patterns

- Governance: Create audit trails for all compaction decisions

## Summary
Apache Iceberg gives you visibility and control over your tables through metadata tables. By tapping into this metadata:

- You avoid blind scheduling of compaction

- You build smarter, more efficient optimization workflows

- You reduce both query latency and operational cost

In the next post, we’ll dive into partition evolution and layout pitfalls, and how to avoid undermining your compaction and clustering strategies when schemas or partitions change.

