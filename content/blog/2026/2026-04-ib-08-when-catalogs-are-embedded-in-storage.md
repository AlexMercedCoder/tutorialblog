---
title: "When Catalogs Are Embedded in Storage"
date: "2026-04-29"
description: "<!-- Meta Description: S3 Tables and MinIO AI Stor embed the Iceberg catalog directly in the storage layer. Here is when embedded catalogs make sense and..."
author: "Alex Merced"
category: "Apache Iceberg"
bannerImage: "./images/apache-iceberg-masterclass/08/embedded-decision-tree.png"
tags:
  - apache iceberg
  - data lakehouse
  - data engineering
  - table formats
---

<!-- Meta Description: S3 Tables and MinIO AI Stor embed the Iceberg catalog directly in the storage layer. Here is when embedded catalogs make sense and when they do not. -->
<!-- Primary Keyword: embedded Iceberg catalog -->
<!-- Secondary Keywords: S3 Tables, MinIO AI Stor, storage-managed catalog -->

This is Part 8 of a 15-part [Apache Iceberg Masterclass](/tags/apache-iceberg/). [Part 7](/2026/2026-04-ib-07-what-are-lakehouse-catalogs-the-role-of-catalogs-in-apache-i/) covered the traditional catalog landscape. This article examines a newer approach: embedding the catalog directly inside the storage layer.

Traditional Iceberg architectures have three components: the query engine, a standalone catalog, and object storage. Embedded catalogs collapse the catalog into the storage layer itself, reducing the number of services to manage while providing built-in table maintenance.

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

## The Embedded Catalog Model

![Standalone catalogs versus embedded catalogs showing how the architecture simplifies](images/apache-iceberg-masterclass/08/embedded-vs-standalone.png)

In a traditional setup, a separate catalog service (Polaris, Glue, Nessie) runs alongside object storage. The engine talks to the catalog to get metadata pointers, then reads data from storage. Two services, two sets of credentials, two operational concerns.

In an embedded model, the storage service itself manages Iceberg metadata. When you create a table, the storage system creates the metadata files internally and handles atomic commits, compaction, and snapshot management. The engine interacts with a single endpoint that serves both catalog operations and data access.

## AWS S3 Tables

![S3 Tables architecture showing the built-in Iceberg catalog with automatic compaction](images/apache-iceberg-masterclass/08/s3-tables-architecture.png)

AWS launched S3 Tables in late 2024 as a new S3 bucket type designed specifically for Iceberg tables. When you create an S3 table bucket, AWS manages the Iceberg catalog internally.

**How it works:** You create tables through the S3 Tables API or through engines like Athena and EMR. S3 Tables stores the Iceberg metadata alongside the data in the same bucket, handling the catalog pointer, manifest management, and atomic commits behind the scenes.

**Built-in maintenance:** S3 Tables runs automatic compaction in the background, merging small files into optimally-sized ones without any user configuration. It also handles snapshot expiry and orphan file cleanup. This eliminates one of the biggest operational burdens of Iceberg (covered in [Part 10](/2026/2026-04-ib-10-maintaining-apache-iceberg-tables-compaction-expiry-and-clea/)).

**Access via REST API:** S3 Tables exposes tables through a REST-catalog-compatible interface. [Dremio](https://www.dremio.com/blog/getting-hands-on-with-s3-tables-from-dremio/), Spark, Trino, and other engines that support the Iceberg REST catalog can connect to S3 Tables directly.

**Built-in lifecycle management:** Beyond compaction, S3 Tables handles the entire table maintenance lifecycle. Snapshot expiry happens automatically based on configurable retention policies. Orphan files are cleaned up without user intervention. For teams that do not want to manage [maintenance schedules](/2026/2026-04-ib-10-maintaining-apache-iceberg-tables-compaction-expiry-and-clea/), this is a significant operational advantage.

**Limitations:** S3 Tables is AWS-only. Tables are stored exclusively in S3 and cannot be moved to other cloud providers without migration. Cross-engine governance is limited to what AWS IAM provides. If you need fine-grained access control beyond IAM policies (column-level masking, row-level filters), you need a standalone catalog layer on top.

**Cost model:** S3 Tables uses a different pricing model than standard S3. Storage and request costs are similar, but the built-in maintenance operations (compaction, expiry) are included in the service price. Compare this to running Spark compaction jobs on EMR, which adds compute costs on top of storage.

**Table bucket vs. general-purpose bucket:** S3 Tables uses a new "table bucket" type, separate from standard S3 buckets. You cannot mix table data with other objects in a table bucket, and standard S3 operations (ls, cp, rm) do not work on table bucket contents. All interaction goes through the S3 Tables API or through Iceberg-compatible engines.

## MinIO AI Stor

MinIO AI Stor takes a similar approach for on-premises and private cloud deployments. MinIO, the leading S3-compatible object storage system, embeds Iceberg catalog functionality directly into the storage layer.

**How it works:** MinIO manages Iceberg table metadata as part of its storage operations. When data is written, MinIO handles the catalog updates, file tracking, and maintenance internally.

**Key differentiator:** MinIO is designed for on-premises deployments and private clouds, making it the embedded catalog option for organizations that cannot use public cloud services. It also integrates vector storage capabilities for AI workloads alongside Iceberg tables.

**S3 compatibility:** Because MinIO implements the S3 API, engines that work with S3 (Spark, Trino, [Dremio](https://www.dremio.com/platform/)) can interact with MinIO-managed Iceberg tables with minimal configuration changes. This makes it a drop-in replacement for S3 in on-premises environments.

**GPU-accelerated analytics:** MinIO AI Stor integrates with GPU-aware processing frameworks, enabling direct analytics on Iceberg data without moving it to a separate compute layer. This is relevant for organizations running AI/ML workloads alongside traditional analytics.

## When Embedded Catalogs Make Sense

![Decision tree for choosing between embedded and standalone catalogs](images/apache-iceberg-masterclass/08/embedded-decision-tree.png)

| Scenario | Recommendation |
|---|---|
| AWS-only, want minimal ops | S3 Tables |
| On-premises, private cloud | MinIO AI Stor |
| Multi-cloud portability needed | Standalone catalog ([Dremio Open Catalog](https://www.dremio.com/platform/open-catalog/)) |
| Cross-engine governance needed | Standalone catalog ([Polaris](https://www.dremio.com/blog/the-polaris-catalog-what-it-is-and-getting-started/)) |
| Multiple storage systems | Standalone catalog |
| Single storage, simple setup | Embedded catalog |

Embedded catalogs are the right choice when you have a single storage system and want to minimize operational complexity. They trade flexibility for simplicity.

Standalone catalogs remain the better choice when you need multi-cloud support, cross-engine governance, or the ability to query data across multiple storage systems through [federation](https://www.dremio.com/platform/federation/).

## The Hybrid Approach

Many organizations use both. An embedded catalog handles the storage-managed tables (S3 Tables for their AWS data), while a standalone catalog like [Dremio Open Catalog](https://www.dremio.com/platform/open-catalog/) provides a unified view across all data sources. Dremio can connect to S3 Tables, AWS Glue tables, and standalone catalog tables simultaneously, presenting them all through a single semantic layer.

This hybrid approach lets you pick the simplest catalog for each use case while maintaining a unified analytics experience.

## Operational Planning for Embedded Catalogs

When adopting an embedded catalog, plan for these considerations:

**Vendor dependency:** An embedded catalog ties your tables to the storage vendor's lifecycle. If the vendor changes pricing, deprecates features, or discontinues the product, migrating away requires converting all tables to a different catalog. With a standalone catalog, switching storage providers only requires changing the storage configuration.

**Monitoring limitations:** Embedded catalogs provide limited visibility into their internal maintenance operations. You cannot inspect the compaction schedule, tune the target file size, or monitor orphan cleanup progress as precisely as you can with manual maintenance via Spark procedures.

**Cross-region access:** Embedded catalogs are scoped to a storage region. If your analytics workloads run in a different region than your storage, the embedded catalog adds cross-region latency. A standalone catalog can be deployed in the same region as your compute for lower latency.

**Integration testing:** Before committing to an embedded catalog for production, test your full query stack (dashboards, notebooks, scheduled pipelines) against the embedded catalog endpoint. Verify that your engines handle the catalog's REST API implementation correctly, as there can be subtle differences between implementations.

[Part 9](/2026/2026-04-ib-09-how-data-lake-table-storage-degrades-over-time/) covers how table storage degrades over time and why maintenance matters regardless of which catalog you use.

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
