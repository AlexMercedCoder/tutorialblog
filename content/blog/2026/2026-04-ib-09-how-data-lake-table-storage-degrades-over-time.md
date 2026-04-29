---
title: "How Data Lake Table Storage Degrades Over Time"
date: "2026-04-29"
description: "<!-- Meta Description: Iceberg tables degrade through small files, orphan files, metadata bloat, sort order decay, and partition skew. Here is how to..."
author: "Alex Merced"
category: "Apache Iceberg"
bannerImage: "./images/apache-iceberg-masterclass/09/health-diagnosis-checklist.png"
tags:
  - apache iceberg
  - data lakehouse
  - data engineering
  - table formats
---

<!-- Meta Description: Iceberg tables degrade through small files, orphan files, metadata bloat, sort order decay, and partition skew. Here is how to diagnose each problem. -->
<!-- Primary Keyword: Iceberg storage degradation -->
<!-- Secondary Keywords: small file problem, orphan files, Iceberg table maintenance -->

This is Part 9 of a 15-part [Apache Iceberg Masterclass](/tags/apache-iceberg/). [Part 8](/2026/2026-04-ib-08-when-catalogs-are-embedded-in-storage/) covered embedded catalogs. This article explains the five ways Iceberg table storage degrades and how to detect each problem before it impacts query performance.

An Iceberg table that works well on day one will not work well on day 365 without maintenance. Every append, update, and delete operation adds files and metadata. Without periodic cleanup and reorganization, query performance gradually deteriorates until someone notices that a dashboard that used to load in 2 seconds now takes 30.

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

## Five Types of Degradation

![The five ways Iceberg table storage degrades over time, from small files to partition skew](images/apache-iceberg-masterclass/09/storage-degradation-timeline.png)

### 1. The Small File Problem

![The small file problem comparing a healthy table with large files to a degraded table with thousands of tiny files](images/apache-iceberg-masterclass/09/small-file-problem.png)

This is the most common and most impactful degradation. Streaming ingestion, micro-batch pipelines, and frequent INSERT operations each create new data files. If these operations produce many small files (under 32 MB), the table accumulates thousands of files where dozens would suffice.

**Impact:** Each file becomes a manifest entry. A table with 10,000 small files has 10,000 entries that the query planner must evaluate, compared to 40 entries for the same data in properly-sized 256 MB files. Planning time increases linearly with file count.

**Cause:** Frequent commits with small amounts of data. A streaming pipeline committing every 30 seconds might add 2-3 files per commit, producing 5,000+ files per day.

### 2. Orphan Files

Orphan files are data files that exist in storage but are not referenced by any current or retained snapshot. They accumulate from:

- **Failed writes:** A write that crashes after creating data files but before committing ([Part 6](/2026/2026-04-ib-06-writing-to-an-apache-iceberg-table-how-commits-and-acid-actu/)) leaves orphan files.
- **Expired snapshots:** When snapshots are expired, the metadata references are removed, but the underlying data files remain in storage until explicitly cleaned up.
- **Compaction:** When [compaction](https://www.dremio.com/blog/compaction-in-apache-iceberg-fine-tuning-your-iceberg-tables-data-files/) merges files, the old files become orphans after their snapshots are expired.

**Impact:** Orphan files waste storage space and money. A heavily-written table can accumulate terabytes of orphan files over months. In one common scenario, a daily batch pipeline writing 50 GB per day with weekly compaction can produce 350 GB of orphan files every week. Without cleanup, this costs thousands of dollars annually in storage fees alone.

### 3. Metadata Bloat

Every commit creates a new snapshot in `metadata.json`. Over time, the metadata file grows as the snapshot list lengthens. The manifest list for each snapshot may also reference many manifest files, especially if the table has been modified in many different partitions.

**Impact:** The `metadata.json` file becomes large, taking longer to download from object storage. At 10,000+ snapshots, the metadata file itself can exceed 100 MB, adding seconds to every query's planning phase. The manifest list grows, making scan planning slower because there are more manifests to evaluate.

**How to detect it:** Check the snapshot count using [metadata tables](/2026/2026-04-ib-11-apache-iceberg-metadata-tables-querying-the-internals/). If it exceeds 1,000, configure snapshot expiry to keep the count manageable.

### 4. Sort Order Decay

If a table has a declared sort order (e.g., sorted by `customer_id` for efficient lookups), new data written by different engines or pipelines may not respect this sort order. Over time, the min/max statistics per file widen as new unsorted data is mixed with sorted data.

**Impact:** File skipping becomes less effective. As described in [Part 3](/2026/2026-04-ib-03-performance-and-apache-icebergs-metadata/), tight min/max ranges enable file pruning. Wide ranges mean no files can be skipped. A well-sorted table might skip 95% of files for a filtered query, while the same table with decayed sort order might skip only 10%.

**How to fix it:** Run [compaction with sorting](/2026/2026-04-ib-10-maintaining-apache-iceberg-tables-compaction-expiry-and-clea/) to rewrite files in the correct order and restore tight min/max ranges.

### 5. Partition Skew

Some partitions grow much larger than others. An event table partitioned by `day(event_time)` might have 10 GB on a normal day but 500 GB during a promotional event. The oversized partition contains files that are too large or too numerous for efficient processing.

**Impact:** Queries against skewed partitions are slower because they must process disproportionately more data. Parallel execution becomes unbalanced when one partition's task takes 50x longer than the others.

## Real-World Degradation Timeline

Consider a table receiving 100 small appends per day from a streaming pipeline:

- **Day 1:** 100 small files (3 MB each), 300 MB total. Queries are fast.
- **Day 30:** 3,000 small files, 9 GB total. Query planning starts to slow noticeably.
- **Day 90:** 9,000 small files, 27 GB total. Every query scans all 9,000 manifest entries. Dashboard queries that took 2 seconds now take 15 seconds.
- **Day 180:** 18,000 small files plus thousands of orphan files from expired snapshots. Metadata file is 50+ MB. Planning alone takes 10 seconds before any data is read.

Without compaction, the table becomes nearly unusable for interactive analytics within 6 months. With daily compaction, the same table stays at 40-50 well-sized files regardless of how many commits happen each day.

## How to Diagnose Table Health

![Checklist for diagnosing Iceberg table health using metadata table queries](images/apache-iceberg-masterclass/09/health-diagnosis-checklist.png)

Iceberg provides [metadata tables](/2026/2026-04-ib-11-apache-iceberg-metadata-tables-querying-the-internals/) that let you inspect table health. Here are the key diagnostic queries:

### Check File Sizes (Dremio / Spark)

```sql
-- Average file size
SELECT AVG(file_size_in_bytes) / 1024 / 1024 AS avg_mb
FROM TABLE(table_files('analytics.orders'))
```

If average file size is below 32 MB, you have a small file problem. Target: 128-512 MB.

### Check Snapshot Count

```sql
-- How many snapshots exist?
SELECT COUNT(*) AS snapshot_count
FROM TABLE(table_snapshot('analytics.orders'))
```

If snapshot count exceeds 1,000, you should expire older snapshots.

### Check File Count Growth

```sql
-- Files per partition
SELECT partition, COUNT(*) AS file_count
FROM TABLE(table_files('analytics.orders'))
GROUP BY partition
ORDER BY file_count DESC
```

Partitions with hundreds of files are candidates for compaction.

[Dremio](https://docs.dremio.com/cloud/sonar/query-manage/querying-metadata/) supports all Iceberg metadata table queries and provides a SQL interface for monitoring table health.

## The Maintenance Imperative

Every Iceberg table in production needs maintenance. The question is not whether to maintain tables but how: manually, through scheduled jobs, or through automated services. [Part 10](/2026/2026-04-ib-10-maintaining-apache-iceberg-tables-compaction-expiry-and-clea/) covers all three approaches in detail.

The cost of not maintaining Iceberg tables is both direct (wasted storage from orphan files) and indirect (slow queries leading to poor user experience, excessive cloud compute costs from reading unnecessary data). Organizations with hundreds of Iceberg tables often find that a single data engineer dedicated to table maintenance saves more in compute and storage costs than their salary. Automated maintenance through [Dremio](https://www.dremio.com/blog/table-optimization-in-dremio/) or S3 Tables removes this operational burden entirely.

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
