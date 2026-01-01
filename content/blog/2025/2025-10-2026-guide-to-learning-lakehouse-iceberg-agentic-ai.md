---
title: 2025-2026 Guide to Learning about Apache Iceberg, Data Lakehouse & Agentic AI
date: "2025-10-23"
description: "A curated guide to mastering Apache Iceberg, data lakehouse architectures, and the emerging field of Agentic AI for data professionals."
author: "Alex Merced"
category: "Data Engineering"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - Data Lakehouse
  - Data Engineering
  - Apache Iceberg
  - Apache Polaris
---

The data world is evolving fast. Just a few years ago, building a modern analytics stack meant stitching together tools, ETL pipelines, and compromises. Today, open standards like Apache Iceberg, modular architectures like the data lakehouse, and emerging patterns like Agentic AI are reshaping how teams store, manage, and use data.

But with all this innovation comes one challenge: where do you start?

This guide was created to answer that question. Whether you're a data engineer exploring the Iceberg table format, an architect building a lakehouse, or a developer curious about AI agents that interact with real-time data, this resource will walk you through it. No hype. No fluff. Just a curated directory of the best learning paths, tools, and concepts to help you build a practical foundation.

We will break down the links into many categories to help you find what you are looking for. There is more content beyond what I have listed here and here are two good directories where you can find more content to explore.

**Lakehouse Blog Directories**
We will break down the links into many categories to help you find what you are looking for. There is more content beyond what I have listed here and here are two good directories where you can find more content to explore.

- [Dremio Developer Hub which has an OSS Blogroll](https://developer.dremio.com)
- [The Lakehouse Blog Directory](https://lakehouseblogs.com)

**Get Data Lakehouse Books:**
I've had the honor of getting to participate in some long form written content around the lakehouse, make of these you can get for free, links below:

- [Apache Iceberg: The Definitive Guide](https://drmevn.fyi/tableformatblog)
- [Apache Polaris: The Defintive Guide](https://drmevn.fyi/tableformatblog-62P6t)
- [Architecting an Apache Iceberg Lakehouse](https://hubs.la/Q03GfY4f0)
- [The Apache Iceberg Digest: Vol. 1](https://www.puppygraph.com/ebooks/apache-iceberg-digest-vol-1)

**Lakehouse Community:**
Below are some links where you can network with other lakehouse enthusiasts and discover lakehouse conferences and meetups near you!

- [Join the Data Lakehouse Community](https://www.datalakehousehub.com)
- [OSS Community Listings](https://osscommunity.com)

## The Data Lakehouse

The idea behind a data lakehouse is simple: keep the flexibility of a data lake, add the performance and structure of a warehouse, and make it all accessible from one place. But turning that idea into a working architecture takes more than just buzzwords. In this section, you'll find tutorials, architectural guides, and practical walkthroughs that explain how lakehouses work, when they make sense, and how to get started, whether you’re running everything on object storage or looking to unify data access across teams and tools.

- [2026 Guide to the Data Lakehouse Ecosystem](https://amdatalakehouse.substack.com/p/the-2025-and-2026-ultimate-guide?r=h4f8p)
- [Looking back the last year in Lakehouse OSS: Advances in Apache Arrow, Iceberg & Polaris (incubating)](https://www.dremio.com/blog/looking-back-the-last-year-in-lakehouse-oss-advances-in-apache-arrow-iceberg-polaris-incubating/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [Scaling Data Lakes: Moving from Raw Parquet to Iceberg Lakehouses](https://www.dremio.com/blog/scaling-data-lakes-moving-from-raw-parquet-to-iceberg-lakehouses/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [5 Ways Dremio Makes Apache Iceberg Lakehouses Easy](https://www.dremio.com/blog/5-ways-dremio-makes-apache-iceberg-lakehouses-easy/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [2025 Guide to Architecting an Apache Iceberg Lakehouse](https://medium.com/data-engineering-with-dremio/2025-guide-to-architecting-an-iceberg-lakehouse-9b19ed42c9de)


## Apache Iceberg

Apache Iceberg is the table format that makes data lakehouses actually work. It brings support for ACID transactions, schema evolution, time travel, and scalable performance to your cloud storage, without locking you into a vendor or engine. If you’ve ever wrestled with Hive tables or brittle partitioning logic, this section is for you. Here, you'll find beginner-friendly resources, deep dives into metadata and catalogs, and hands-on guides for working with Iceberg using engines like Spark, Flink, and Dremio.

### What are Lakehouse Open Table Formats
Table formats are the backbone of the modern lakehouse. They define how data files are organized, versioned, and transacted, bringing warehouse‑level reliability to open storage. This section explores what makes formats like Apache Iceberg, Delta Lake, and Apache Hudi so important. You’ll learn how they handle schema evolution, partitioning, and ACID transactions while staying engine‑agnostic, ensuring your data remains open, performant, and ready for any workload.

- [What is a Data Lakehouse Table Format](https://www.dremio.com/blog/apache-iceberg-crash-course-what-is-a-data-lakehouse-and-a-table-format/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [Ultimate Guide to Open Table Formats](https://amdatalakehouse.substack.com/p/the-ultimate-guide-to-open-table?r=h4f8p)
- [Exploring the Architecture of Apache Iceberg, Delta Lake, and Apache Hudi](https://www.dremio.com/blog/exploring-the-architecture-of-apache-iceberg-delta-lake-and-apache-hudi/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)

### Apache Iceberg Tutorials
Getting hands‑on is the fastest way to learn Apache Iceberg. In these tutorials, you’ll spin up local environments, run your first SQL commands, and connect Iceberg tables with catalogs like Apache Polaris or engines like Spark and Dremio. Each guide walks you through setup, basic operations, and troubleshooting so you can move from theory to practice without friction.

- [Intro to Iceberg with Apache Spark, Apache Polaris & Minio](https://amdatalakehouse.substack.com/p/tutorial-intro-to-apache-iceberg?r=h4f8p)
- [Try Apache Polaris (incubating) on Your Laptop with Minio](https://www.dremio.com/blog/try-apache-polaris-incubating-on-your-laptop-with-minio/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [Intro to Dremio, Nessie, and Apache Iceberg on Your Laptop](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)

### Iceberg Migration Tooling and Ingestion
Moving existing datasets into Apache Iceberg doesn’t have to be painful. This section highlights migration patterns, ingestion tools, and automation workflows that make it easier to adopt Iceberg at scale. You’ll find step‑by‑step resources covering snapshot‑based migrations, bulk ingests, and hybrid models that help teams modernize data lakes while minimizing downtime and duplication.

- [Migration Guide for Apache Iceberg Lakehouses](https://www.dremio.com/blog/migration-guide-for-apache-iceberg-lakehouses/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [8 Tools For Ingesting Data Into Apache Iceberg](https://www.dremio.com/blog/8-tools-for-ingesting-data-into-apache-iceberg/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)

### Iceberg Catalogs
A table format is only as useful as the catalog that organizes it. Iceberg catalogs manage metadata, access control, and engine interoperability, essential pieces of a production lakehouse. In this section, you’ll explore the expanding catalog ecosystem, from open implementations like Apache Polaris to commercial and hybrid options. These resources explain how catalogs enable discoverability, governance, and smooth multi‑engine coordination across your data environment.

- [An Exploration of Commercial Ecosystem of Iceberg Catalogs](https://amdatalakehouse.substack.com/p/an-exploration-of-the-commercial?r=h4f8p)
- [Building a Universal Lakehouse Catalog: Catalogs beyond Iceberg](https://amdatalakehouse.substack.com/p/building-a-universal-lakehouse-catalog?r=h4f8p)
- [The Growing Apache Polaris Ecosystem (The Growing Apache Iceberg Catalog Standard)](https://www.dremio.com/blog/the-growing-apache-polaris-ecosystem-the-growing-apache-iceberg-catalog-standard/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)

### Apache Iceberg Table Optimization
Keeping Iceberg tables fast requires more than good schema design. Over time, data fragmentation, small files, and metadata sprawl can slow queries and inflate costs. The articles in this section show how to maintain healthy tables through compaction, clustering, and automatic optimization. You’ll also learn how modern platforms like Dremio manage this maintenance autonomously so performance tuning doesn’t become a full‑time job.

- [Optimizing Apache Iceberg Tables – Manual and Automatic](https://www.dremio.com/blog/optimizing-iceberg-tables/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [Apache Iceberg Table Performance Management with Dremio’s OPTIMIZE](https://www.dremio.com/blog/apache-iceberg-table-performance-management-with-dremios-optimize/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [Minimizing Iceberg Table Management with Smart Writing](https://www.dremio.com/blog/minimizing-iceberg-table-management-with-smart-writing/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [Apache Iceberg Table Storage Management with Dremio’s VACUUM TABLE](https://www.dremio.com/blog/apache-iceberg-table-storage-management-with-dremios-vacuum-table/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [Materialization and Query Optimization in the Iceberg Era](https://medium.com/@alexmercedtech/materialization-and-acceleration-in-the-iceberg-lakehouse-era-comparing-dremio-trino-doris-de3c96413b1a)

### Iceberg Technical Deep Dives
Once you understand the basics, the real fun begins. These deep dives unpack how Iceberg works under the hood, covering metadata structures, query caching, authentication, and advanced performance topics. Whether you’re benchmarking, extending the format, or building your own catalog integration, this section will help you understand Iceberg’s architecture and internal mechanics in detail.

- [Query Results Caching on Iceberg Tables](https://www.dremio.com/blog/query-results-caching-on-iceberg-tables/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [Benchmarking Framework for the Apache Iceberg Catalog, Polaris](https://www.dremio.com/blog/benchmarking-framework-for-the-apache-iceberg-catalog-polaris/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [Too Many Roundtrips: Metadata Overhead in the Modern Lakehouse](https://www.dremio.com/blog/too-many-roundtrips-metadata-overhead-in-the-modern-lakehouse/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [Introducing Dremio Auth Manager for Apache Iceberg](https://www.dremio.com/blog/introducing-dremio-auth-manager-for-apache-iceberg/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [Dremio’s Apache Iceberg Clustering: Technical Blog](https://www.dremio.com/blog/dremios-apache-iceberg-clustering-technical-blog/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)

### The Future of Apache Iceberg
Apache Iceberg continues to evolve alongside emerging workloads like Agentic AI and next‑generation file formats. This section looks ahead at what’s coming; new format versions, engine integrations, and evolving standards such as Polaris and REST catalogs. If you want to stay informed on where Iceberg is heading and how it fits into the broader open‑data movement, start here.

- [Exploring the Evolving File Format Landscape in AI Era: Parquet, Lance, Nimble and Vortex And What It Means for Apache Iceberg](https://www.dremio.com/blog/exploring-the-evolving-file-format-landscape-in-ai-era-parquet-lance-nimble-and-vortex-and-what-it-means-for-apache-iceberg/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [What’s New in Apache Iceberg Format Version 3?](https://www.dremio.com/blog/apache-iceberg-v3/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [The State of Apache Iceberg v4](https://medium.com/data-engineering-with-dremio/the-state-of-apache-iceberg-v4-october-2025-edition-c186dc29b6f5)


## Agentic AI

Agentic AI is a new class of systems that don’t just answer questions, they take action. These agents make decisions, follow workflows, and learn from outcomes, but they’re only as smart as the data they can access. That’s where open lakehouse architectures come in. This section explores the intersection of data architecture and autonomous systems, with content focused on how to power agents using structured, governed, and real-time data from your Iceberg-based lakehouse. From semantic layers to zero-ETL federation, you'll see what it takes to build AI that isn't just reactive, but genuinely useful.

- [The Model Context Protocol (MCP): A Beginner’s Guide to Plug-and-Play Agents](https://www.dremio.com/blog/the-model-context-protocol-mcp-a-beginners-guide-to-plug-and-play-agents/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [Understanding the Role of RPC in Agentic AI & MCP](https://amdatalakehouse.substack.com/p/understanding-rpc-and-mcp-in-agentic?r=h4f8p)
- [Who Benefits From MCP on an Analytics Platform?](https://www.dremio.com/blog/who-benefits-from-mcp-on-analytics-platforms/)
- [Tutorial: Multi-Agent Collaboration with LangChain, MCP, and Google A2A Protocol](https://amdatalakehouse.substack.com/p/tutorial-multi-agent-collaboration?r=h4f8p)
- [Composable Analytics with Agents: Leveraging Virtual Datasets and the Semantic Layer](https://amdatalakehouse.substack.com/p/composable-analytics-with-agents?r=h4f8p)
- [Unlocking the Power of Agentic AI with Dremio and Apache Iceberg](https://amdatalakehouse.substack.com/p/unlocking-the-power-of-agentic-ai?r=h4f8p)
- [Why Agentic AI Needs a Data Lakehouse](https://www.dremio.com/blog/why-agentic-ai-needs-a-data-lakehouse/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [Test Driving MCP: Is Your Data Pipeline Ready to Talk?](https://www.dremio.com/blog/testing-mcp-integration-in-existing-data-pipelines/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [Using Dremio’s MCP Server with Agentic AI Frameworks](https://www.dremio.com/blog/using-dremios-mcp-server-with-agentic-ai-frameworks/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [Using Dremio MCP with any LLM Model](https://www.dremio.com/blog/using-the-dremio-mcp-server-with-any-llm-model/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [How Dremio Reflections Give Agentic AI a Unique Edge](https://www.dremio.com/blog/how-dremio-reflections-give-agentic-ai-a-unique-edge/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
- [Optimizing Apache Iceberg for Agentic AI](https://www.dremio.com/blog/optimizing-apache-iceberg-for-agentic-ai/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg&utm_term=2026-content-guide&utm_content=alexmerced)
