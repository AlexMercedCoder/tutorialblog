---
title: Avoiding Metadata Bloat with Snapshot Expiration and Rewriting Manifests
date: "2025-08-12"
author: Alex Merced
description: Learn how to prevent and clean up metadata bloat in Apache Iceberg by expiring snapshots and rewriting manifests for better performance and manageability.
tags:
  - Apache Iceberg
  - Metadata Optimization
  - Snapshot Expiration
  - Manifest Rewrite
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

# Avoiding Metadata Bloat with Snapshot Expiration and Rewriting Manifests

As your Apache Iceberg tables evolve—through continuous writes, schema changes, and compaction jobs—they generate a growing amount of **metadata**. While metadata is a powerful feature in Iceberg, enabling time travel and auditability, **unchecked metadata growth** can lead to:

- Slower planning and query times
- Increased storage costs
- Longer table commit and rollback operations
- Excessive memory usage during scans

In this post, we’ll explore how to **expire old snapshots** and **rewrite manifests** to keep your Iceberg tables lean, responsive, and cost-efficient.

## What Causes Metadata Bloat?

Iceberg tracks table state through a series of **snapshots**. Each snapshot references a set of **manifest lists**, which in turn reference **manifest files** describing individual data files.

Bloat occurs when:
- Snapshots accumulate and are not expired
- Manifests are duplicated across snapshots
- Files are replaced by compaction but older snapshots still reference them
- Streaming ingestion creates frequent small commits, generating excessive metadata

## Expiring Snapshots

You can safely remove older snapshots using Iceberg’s built-in expiration functionality. This deletes metadata for snapshots that are no longer needed for time travel, rollback, or audit purposes.

### Example in Spark:

```scala
import org.apache.iceberg.actions.Actions

Actions.forTable(spark, table)
  .expireSnapshots()
  .expireOlderThan(System.currentTimeMillis() - TimeUnit.DAYS.toMillis(7)) // keep 7 days
  .retainLast(2) // keep last 2 snapshots no matter what
  .execute();
```

This keeps recent snapshots while cleaning up older ones, freeing up metadata and unreferenced data files (if garbage collection is also enabled).

### Guidelines:
- Retain at least a few recent snapshots for rollback safety

- Use a time-based and count-based retention policy

- Coordinate expiration with your data governance policies

## Rewriting Manifests
Over time, manifest files can become inefficient:

- Many may reference the same files across snapshots

- Some may contain only a few files due to small writes

- Their layout may be suboptimal for query planning

- You can rewrite manifests to consolidate and reorganize them for improved performance.

### Example in Spark:
```scala
Actions.forTable(spark, table)
  .rewriteManifests()
  .execute();
```

This reduces metadata file count, organizes manifests by partition and sort order, and can improve query planning times.

## When Should You Perform Metadata Cleanup?
- After large ingestion spikes (e.g., backfills)

- Following streaming workloads with high commit frequency

- Post compaction or schema evolution

- On a scheduled basis (e.g., daily or weekly)

## Bonus: Use Metadata Tables to Inspect Bloat
Iceberg’s metadata tables help you inspect how much bloat has built up.

Example:
```sql
SELECT snapshot_id, added_files_count, total_data_files_count
FROM my_table.snapshots
ORDER BY committed_at DESC;
```

```sql
SELECT COUNT(*) FROM my_table.manifests;
```

These insights can help you determine when cleanup is needed.

## Tradeoffs and Cautions
- Snapshot expiration is irreversible: Make sure you don’t need the old snapshots for recovery or audit.

- Manifests rewrites are safe but can be compute-intensive on large tables—schedule wisely.

- Storage GC may require coordination with your catalog to clean up unreferenced files.

## Summary
Metadata is a powerful part of Iceberg’s architecture, but without routine maintenance, it can weigh down your table performance. By:

- Expiring stale snapshots

- Rewriting bloated manifests

- Monitoring metadata tables regularly

- You ensure that your Iceberg tables remain agile, scalable, and ready for production workloads.

In the next post, we’ll explore how to design the ideal cadence for compaction and snapshot expiration so your optimizations are timely and cost-effective.