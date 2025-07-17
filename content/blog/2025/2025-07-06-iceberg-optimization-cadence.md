---
title: Designing the Ideal Cadence for Compaction and Snapshot Expiration
date: "2025-08-19"
author: Alex Merced
description: Learn how to design an effective schedule for compaction and snapshot expiration in Apache Iceberg to balance cost, performance, and data freshness.
tags:
  - Apache Iceberg
  - Table Optimization
  - Compaction
  - Snapshot Expiration
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

# Designing the Ideal Cadence for Compaction and Snapshot Expiration

In previous posts, we explored how compaction and snapshot expiration keep Apache Iceberg tables performant and lean. But these actions aren’t one-and-done—they need to be **scheduled strategically** to balance compute cost, data freshness, and operational safety.

In this post, we’ll look at how to design a **cadence** for compaction and snapshot expiration based on your workload patterns, data criticality, and infrastructure constraints.

## Why Cadence Matters

Without a thoughtful schedule:
- **Over-optimization** can waste compute and create unnecessary load
- **Under-optimization** leads to performance degradation and metadata bloat
- **Poor coordination** can cause clashes with ingestion or query jobs

You need a cadence that fits your data’s lifecycle and your platform’s SLAs.

## Key Factors to Consider

### 1. **Ingestion Rate and Pattern**
- **Streaming data?** Expect high file churn. Compact frequently (hourly or near-real-time).
- **Batch jobs?** Compact after each large load or on a daily schedule.
- **Hybrid?** Monitor ingestion metrics and trigger compaction based on thresholds.

### 2. **Query Frequency and Latency Expectations**
- **High query volume tables** benefit from more frequent compaction to improve scan performance.
- **Low-usage tables** can tolerate more infrequent optimization.

### 3. **Storage Costs and File System Limits**
- Cloud storage costs can balloon with small files and lingering unreferenced data.
- File system metadata limits may also be a concern at massive scale.

### 4. **Retention and Governance Requirements**
- Snapshots may need to be retained longer for audit or rollback policies.
- Balance expiration with compliance needs.

## Suggested Cadence Models

| Use Case                        | Compaction Cadence     | Snapshot Expiration        |
|--------------------------------|------------------------|-----------------------------|
| High-volume streaming pipeline | Hourly or event-based  | Daily, keep 1–3 days        |
| Daily batch ingestion          | Post-batch or nightly  | Weekly, keep 7–14 days      |
| Low-latency analytics          | Hourly                 | Daily, keep 3–5 days        |
| Regulatory or audited data     | Weekly or on-demand    | Monthly, retain 30–90 days  |

Use metadata queries (e.g., from `files`, `manifests`, `snapshots`) to drive dynamic policies.

## Automating the Schedule

You can use orchestration tools like:
- **Airflow / Dagster / Prefect**: Schedule and monitor compaction and expiration tasks
- **dbt Cloud**: Use post-run hooks or scheduled jobs to optimize models backed by Iceberg
- **Flink / Spark Streaming**: Trigger compaction inline or via micro-batch jobs

Tip: Tag critical jobs with priorities and isolate them from ingestion workloads where needed.

## Coordinating Between Compaction and Expiration

Ideally:
- **Compact first**, then **expire snapshots**
- This ensures snapshots written by compaction are retained at least temporarily
- Avoid expiring snapshots too soon after compaction to prevent data loss

### Example Workflow:
1. Run metadata scan to detect small file bloat
2. Trigger compaction on affected partitions
3. Delay snapshot expiration by a few hours
4. Run snapshot expiration with a safety buffer

## Monitoring and Adjusting Over Time

Cadence isn’t static—adjust based on:
- Changing ingestion rates
- New query patterns
- Storage trends
- Platform feedback (slow queries, GC delays, etc.)

Use logs, metadata tables, and query performance dashboards to guide adjustments.

## Summary

An effective compaction and snapshot expiration cadence keeps your Iceberg tables fast, lean, and cost-effective. Your schedule should:
- Match your workload patterns
- Respect operational and governance needs
- Be flexible and monitorable

In the next post, we’ll look at how to use **Iceberg’s metadata tables** to dynamically determine *when* optimization is needed—so you can make it event-driven instead of fixed-schedule.