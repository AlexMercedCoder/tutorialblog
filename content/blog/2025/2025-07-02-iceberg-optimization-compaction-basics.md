---
title: The Basics of Compaction — Bin Packing Your Data for Efficiency
date: "2025-07-22"
author: Alex Merced
description: Learn how standard compaction works in Apache Iceberg and why bin packing your data files is essential for maintaining query performance and cost efficiency.
tags:
  - Apache Iceberg
  - Data Optimization
  - Table Maintenance
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

# The Basics of Compaction — Bin Packing Your Data for Efficiency

In the first post of this series, we explored how Apache Iceberg tables degrade when left unoptimized. Now it's time to look at the most foundational optimization technique: **compaction**.

Compaction is the process of merging small files into larger ones to reduce file system overhead and improve query performance. In Iceberg, this usually takes the form of **bin packing** — grouping smaller files together so they align with an optimal size target.

## Why Bin Packing Matters

Query engines like Dremio, Trino, and Spark operate more efficiently when reading a smaller number of larger files instead of a large number of tiny files. Every file adds cost:
- It triggers an I/O request
- It needs to be tracked in metadata
- It increases planning and scheduling complexity

By merging many small files into fewer large files, compaction directly addresses:
- **Small file problem**
- **Metadata bloat in manifests**
- **Inefficient scan patterns**

## How Standard Compaction Works

A typical Iceberg compaction job involves:
1. **Scanning the table** to identify small files below a certain threshold.
2. **Reading and coalescing records** from multiple small files within a partition.
3. **Writing out new files** targeting an optimal size (commonly 128MB–512MB per file).
4. **Creating a new snapshot** that references the new files and drops the older ones.

This process can be orchestrated using:
- **Apache Spark** with Iceberg’s `RewriteDataFiles` action
- **Dremio** with its `OPTIMIZE` command

### Example: Spark Action

```scala
import org.apache.iceberg.actions.Actions

Actions.forTable(spark, table)
  .rewriteDataFiles()
  .option("target-file-size-bytes", 134217728) // 128 MB
  .execute()
```

This will identify and bin-pack small files across partitions, replacing them with larger files.

## Tips for Running Compaction
- **Target file size:** Match your engine’s ideal scan size. 128MB or 256MB often work well.

- **Partition scope:** You can compact per partition to avoid touching the entire table.

- **Job parallelism:** Tune parallelism to handle large volumes efficiently.

- **Avoid overlap:** If streaming ingestion is running, compaction jobs should avoid writing to the same partitions concurrently (we’ll cover this in Part 3).

## When Should You Run It?
That depends on:

- **Ingestion frequency:** Frequent writes = more small files = more frequent compaction

- **Query behavior:** If queries touch recently ingested data, compact often

- **Table size and storage costs:** The larger the table, the more benefit from compaction

In many cases, a daily or hourly schedule works well. Some platforms support event-driven compaction based on file count or size thresholds.

## Tradeoffs
While compaction boosts performance, it also:

- Consumes compute and I/O resources

- Temporarily increases storage (until old files are expired)

- Can interfere with concurrent writes if not carefully scheduled

That’s why timing and scope matter—a theme we’ll return to later in this series.

## Up Next
Now that you understand standard compaction, the next challenge is applying it without interrupting streaming workloads. In Part 3, we’ll explore techniques to make compaction faster, safer, and more incremental for real-time pipelines.