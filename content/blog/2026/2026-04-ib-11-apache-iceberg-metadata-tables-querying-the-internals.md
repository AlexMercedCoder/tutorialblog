---
title: "Apache Iceberg Metadata Tables: Querying the Internals"
date: "2026-04-29"
description: "<!-- Meta Description: Iceberg metadata tables let you query snapshots, files, manifests, and partitions using SQL. Here is every metadata table and how to..."
author: "Alex Merced"
category: "Apache Iceberg"
bannerImage: "./images/apache-iceberg-masterclass/11/metadata-tables-overview.png"
tags:
  - apache iceberg
  - data lakehouse
  - data engineering
  - table formats
---

<!-- Meta Description: Iceberg metadata tables let you query snapshots, files, manifests, and partitions using SQL. Here is every metadata table and how to use them. -->
<!-- Primary Keyword: Iceberg metadata tables -->
<!-- Secondary Keywords: table snapshots, table files, table history, Iceberg time travel -->

This is Part 11 of a 15-part [Apache Iceberg Masterclass](/tags/apache-iceberg/). [Part 10](/2026/2026-04-ib-10-maintaining-apache-iceberg-tables-compaction-expiry-and-clea/) covered maintenance operations. This article covers the metadata tables that let you inspect Iceberg table internals using standard SQL.

Iceberg exposes its internal metadata as queryable virtual tables. You can use them to check table health, debug performance issues, audit changes, and build monitoring dashboards. No special tools required, just SQL.

## Table of Contents

1. [What Are Table Formats and Why Were They Needed?](/2026/2026-04-ib-01-what-are-table-formats-and-why-were-they-needed/)
2. [The Metadata Structure of Current Table Formats](/2026/2026-04-ib-02-the-metadata-structure-of-modern-table-formats/)
3. [Performance and Apache Iceberg's Metadata](/2026/2026-04-ib-03-performance-and-apache-icebergs-metadata/)
4. [Technical Deep Dive on Partition Evolution](/2026/2026-04-ib-04-partition-evolution-change-your-partitioning-without-rewriti/)
5. [Technical Deep Dive on Hidden Partitioning](/2026/2026-04-ib-05-hidden-partitioning-how-iceberg-eliminates-accidental-full-t/)
6. [Writing to an Apache Iceberg Table](/2026/2026-04-ib-06-writing-to-an-apache-iceberg-table-how-commits-and-acid-actu/)
7. [What Are Lakehouse Catalogs?](/2026/2026-04-ib-07-what-are-lakehouse-catalogs-the-role-of-catalogs-in-apache-i/)
8. [Embedded Catalogs: S3 Tables and MinIO AI Stor](/2026/2026-04-ib-08-when-catalogs-are-embedded-in-storage/)
9. [How Iceberg Table Storage Degrades Over Time](/2026/2026-04-ib-09-how-data-lake-table-storage-degrades-over-time/)
10. [Maintaining Apache Iceberg Tables](/2026/2026-04-ib-10-maintaining-apache-iceberg-tables-compaction-expiry-and-clea/)
11. [Apache Iceberg Metadata Tables](/2026/2026-04-ib-11-apache-iceberg-metadata-tables-querying-the-internals/)
12. [Using Iceberg with Python and MPP Engines](/2026/2026-04-ib-12-using-apache-iceberg-with-python-and-mpp-query-engines/)
13. [Streaming Data into Apache Iceberg Tables](/2026/2026-04-ib-13-approaches-to-streaming-data-into-apache-iceberg-tables/)
14. [Hands-On with Iceberg Using Dremio Cloud](/2026/2026-04-ib-14-hands-on-with-apache-iceberg-using-dremio-cloud/)
15. [Migrating to Apache Iceberg](/2026/2026-04-ib-15-migrating-to-apache-iceberg-strategies-for-every-source-syst/)

## The Seven Metadata Tables

![The seven Iceberg metadata tables and what each reveals about your table](images/apache-iceberg-masterclass/11/metadata-tables-overview.png)

### Snapshots

The `$snapshots` table lists every snapshot in the table's history. Each row represents a committed transaction.

```sql
-- Dremio syntax
SELECT * FROM TABLE(table_snapshot('analytics.orders'))

-- Spark syntax
SELECT * FROM analytics.orders.snapshots
```

Key columns: `snapshot_id`, `committed_at`, `operation` (append, overwrite, delete), `summary` (files added/removed counts).

### History

The `$history` table shows the timeline of which snapshot was current at each point in time.

```sql
SELECT * FROM TABLE(table_history('analytics.orders'))
```

### Files

The `$files` table lists every data file in the current snapshot with detailed statistics.

```sql
SELECT file_path, file_size_in_bytes, record_count, partition
FROM TABLE(table_files('analytics.orders'))
```

This is the primary diagnostic table for checking [file sizes](/2026/2026-04-ib-09-how-data-lake-table-storage-degrades-over-time/) and identifying the small file problem.

### Manifests

The `$manifests` table lists the manifest files for the current snapshot.

```sql
SELECT path, length, added_data_files_count, existing_data_files_count
FROM TABLE(table_manifests('analytics.orders'))
```

### Partitions

The `$partitions` table provides statistics per partition: row counts, file counts, and size.

```sql
SELECT partition, record_count, file_count
FROM TABLE(table_partitions('analytics.orders'))
```

## Practical Use Cases

![Three categories of metadata table use cases: monitoring, debugging, and auditing](images/apache-iceberg-masterclass/11/metadata-use-cases.png)

### Monitoring: Average File Size

```sql
SELECT
  AVG(file_size_in_bytes) / 1048576 AS avg_file_mb,
  MIN(file_size_in_bytes) / 1048576 AS min_file_mb,
  COUNT(*) AS total_files
FROM TABLE(table_files('analytics.orders'))
```

If `avg_file_mb` drops below 64, schedule compaction.

### Debugging: Files Per Partition

```sql
SELECT partition, COUNT(*) AS files, SUM(record_count) AS rows
FROM TABLE(table_files('analytics.orders'))
GROUP BY partition
ORDER BY files DESC
LIMIT 20
```

Partitions with hundreds of files are compaction candidates. Use this query as a daily health check and pipe the results into your monitoring system.

### Debugging: Sort Order Effectiveness

Column statistics in the files table reveal whether your sort order is effective:

```sql
SELECT
  file_path,
  lower_bounds['customer_id'] AS min_customer_id,
  upper_bounds['customer_id'] AS max_customer_id
FROM TABLE(table_files('analytics.orders'))
```

If the min/max ranges overlap heavily across files, the sort order has decayed and compaction with sorting ([Part 10](/2026/2026-04-ib-10-maintaining-apache-iceberg-tables-compaction-expiry-and-clea/)) will restore effectiveness.

### Monitoring: Commit Velocity

Track how frequently the table is being written to:

```sql
SELECT
  DATE_TRUNC('hour', committed_at) AS hour,
  COUNT(*) AS commits,
  SUM(CAST(summary['added-data-files'] AS INT)) AS files_added
FROM TABLE(table_snapshot('analytics.orders'))
WHERE committed_at > CURRENT_TIMESTAMP - INTERVAL '24' HOUR
GROUP BY DATE_TRUNC('hour', committed_at)
ORDER BY hour
```

High commit velocity (hundreds of commits per hour) indicates a [streaming workload](/2026/2026-04-ib-13-approaches-to-streaming-data-into-apache-iceberg-tables/) that needs aggressive compaction.

### Auditing: Recent Changes

```sql
SELECT committed_at, operation, summary
FROM TABLE(table_snapshot('analytics.orders'))
ORDER BY committed_at DESC
LIMIT 10
```

This shows the last 10 operations: how many files were added or removed per commit.

## Time Travel

![How snapshots enable querying the table at any point in its history](images/apache-iceberg-masterclass/11/time-travel-metadata.png)

Metadata tables enable time travel queries. Use the snapshot list to find the snapshot ID for a specific point in time, then query the table at that snapshot:

```sql
-- Query the table as it existed on February 15
SELECT * FROM analytics.orders
AT SNAPSHOT '1234567890123456789'

-- Or by timestamp
SELECT * FROM analytics.orders
AT TIMESTAMP '2024-02-15 00:00:00'
```

Time travel is useful for debugging data issues ("what did this table look like before yesterday's pipeline ran?"), auditing ("what was the account balance at end-of-quarter?"), and reproducible analysis ("run this report against last month's data").

### Incremental Reads

Metadata tables also enable incremental processing. By comparing two snapshots, you can identify which files were added between them and process only the new data:

```sql
-- Find files added in the last snapshot
SELECT file_path, record_count
FROM TABLE(table_files('analytics.orders'))
WHERE file_path NOT IN (
  SELECT file_path FROM TABLE(table_files('analytics.orders'))
  AT SNAPSHOT '1234567890'
)
```

This pattern is the foundation for CDC (Change Data Capture) on Iceberg tables: read only what changed since the last processing run, rather than re-scanning the entire table.

### Rollback

If a bad write corrupts your table, use the snapshot list to rollback:

```sql
-- Find the last good snapshot
SELECT snapshot_id, committed_at, operation
FROM TABLE(table_snapshot('analytics.orders'))
ORDER BY committed_at DESC

-- Rollback to it (Spark)
CALL system.rollback_to_snapshot('analytics.orders', 1234567890)
```

Rollback does not delete data. It simply changes the current snapshot pointer to an earlier snapshot, making the table appear as it was at that point. The rolled-back data files remain in storage for potential recovery.

[Dremio](https://docs.dremio.com/cloud/sonar/query-manage/querying-metadata/) supports all Iceberg metadata table queries through its TABLE() function syntax and provides time travel in both SQL and its semantic layer.

## Building a Health Dashboard

Combine metadata table queries into a scheduled monitoring job:

```sql
-- Table health summary
SELECT
  (SELECT COUNT(*) FROM TABLE(table_snapshot('analytics.orders'))) AS snapshots,
  (SELECT COUNT(*) FROM TABLE(table_files('analytics.orders'))) AS files,
  (SELECT AVG(file_size_in_bytes)/1048576 FROM TABLE(table_files('analytics.orders'))) AS avg_mb,
  (SELECT COUNT(*) FROM TABLE(table_manifests('analytics.orders'))) AS manifests
```

Set alerts when snapshots exceed 1,000, average file size drops below 64 MB, or manifest count exceeds 500.

### Engine Syntax Variations

Different engines use different syntax for metadata tables:

| Engine | Syntax |
|---|---|
| Dremio | `TABLE(table_files('db.table'))` |
| Spark | `db.table.files` |
| Trino | `"db"."table$files"` |
| Flink | `table$files` |

The underlying data is identical; only the SQL syntax differs. Regardless of which engine you use, these metadata tables are the key diagnostic tool for understanding and maintaining Iceberg table health.

### Automating Decisions with Metadata

You can use metadata table queries to drive automated maintenance decisions. For example, a scheduler can check whether compaction is needed before running it:

```sql
-- Only compact if average file size is below threshold
SELECT CASE
  WHEN AVG(file_size_in_bytes) / 1048576 < 64 THEN 'COMPACT_NEEDED'
  ELSE 'HEALTHY'
END AS table_status
FROM TABLE(table_files('analytics.orders'))
```

This avoids running compaction on tables that are already well-organized, saving compute costs and preventing unnecessary data rewrites.

For production environments, integrate these checks into your orchestration tool (Airflow, Dagster, Prefect). Schedule a daily metadata scan across all tables, collect the health metrics, and trigger maintenance jobs only for tables that need them. This approach scales to hundreds of tables without manual oversight. [Dremio's autonomous optimization](https://www.dremio.com/blog/table-optimization-in-dremio/) automates this entire workflow for tables managed by Open Catalog.

[Part 12](/2026/2026-04-ib-12-using-apache-iceberg-with-python-and-mpp-query-engines/) covers using Iceberg from Python and MPP query engines.

### Books to Go Deeper

- [Architecting the Apache Iceberg Lakehouse](https://www.amazon.com/Architecting-Apache-Iceberg-Lakehouse-open-source/dp/1633435105/) by Alex Merced (Manning)
- [Lakehouses with Apache Iceberg: Agentic Hands-on](https://www.amazon.com/Lakehouses-Apache-Iceberg-Agentic-Hands-ebook/dp/B0GQL4QNRT/) by Alex Merced
- [Constructing Context: Semantics, Agents, and Embeddings](https://www.amazon.com/Constructing-Context-Semantics-Agents-Embeddings/dp/B0GSHRZNZ5/) by Alex Merced
- [Apache Iceberg & Agentic AI: Connecting Structured Data](https://www.amazon.com/Apache-Iceberg-Agentic-Connecting-Structured/dp/B0GW2WF4PX/) by Alex Merced
- [Open Source Lakehouse: Architecting Analytical Systems](https://www.amazon.com/Open-Source-Lakehouse-Architecting-Analytical/dp/B0GW595MVL/) by Alex Merced

### Free Resources

- [FREE - Apache Iceberg: The Definitive Guide](https://drmevn.fyi/linkpageiceberg)
- [FREE - Apache Polaris: The Definitive Guide](https://drmevn.fyi/linkpagepolaris)
- [FREE - Agentic AI for Dummies](https://hello.dremio.com/wp-resources-agentic-ai-for-dummies-reg.html?utm_source=link_page&utm_medium=influencer&utm_campaign=iceberg&utm_term=qr-link-list-04-07-2026&utm_content=alexmerced)
- [FREE - Leverage Federation, The Semantic Layer and the Lakehouse for Agentic AI](https://hello.dremio.com/wp-resources-agentic-analytics-guide-reg.html?utm_source=link_page&utm_medium=influencer&utm_campaign=iceberg&utm_term=qr-link-list-04-07-2026&utm_content=alexmerced)
- [FREE with Survey - Understanding and Getting Hands-on with Apache Iceberg in 100 Pages](https://forms.gle/xdsun6JiRvFY9rB36)
