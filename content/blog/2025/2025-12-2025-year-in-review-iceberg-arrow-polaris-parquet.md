---
title: 2025 Year in Review Apache Iceberg, Polaris, Parquet, and Arrow
date: "2025-12-29"
description: "A look back at key developments in Apache Iceberg, Polaris, Parquet, and Arrow in 2025."
author: "Alex Merced"
category: "Data Engineering"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
  - apache iceberg
  - apache polaris
  - apache parquet
  - apache arrow
---

**Get Data Lakehouse Books:**
- [Apache Iceberg: The Definitive Guide](https://drmevn.fyi/tableformatblog)
- [Apache Polaris: The Defintive Guide](https://drmevn.fyi/tableformatblog-62P6t)
- [Architecting an Apache Iceberg Lakehouse](https://hubs.la/Q03GfY4f0)
- [The Apache Iceberg Digest: Vol. 1](https://www.puppygraph.com/ebooks/apache-iceberg-digest-vol-1)

**Lakehouse Community:**
- [Join the Data Lakehouse Community](https://www.datalakehousehub.com)
- [Data Lakehouse Blog Roll](https://lakehouseblogs.com)
- [OSS Community Listings](https://osscommunity.com)
- [Dremio Lakehouse Developer Hub](https://developer.dremio.com)

---

The open lakehouse is no longer a concept. In 2025, key Apache projects matured, making data warehouse performance on object storage a practical reality. This post walks through the most critical developments in four of those projects: Iceberg, Polaris, Parquet, and Arrow. Each is building a critical layer for an open, engine-agnostic analytics stack.

We start with Iceberg.

## Apache Iceberg

Iceberg spent 2025 delivering the core elements of Format Version 3, while setting the stage for a more indexable and cache-friendly V4 format. Its release cadence remained steady and focused. The project shipped three main versions: 1.8.0 in February, 1.9.0 in April, and 1.10.0 in September.

### What shipped in 2025

Iceberg 1.8.0 introduced deletion vectors, default column values, and row-level lineage metadata. These features help engines express updates more efficiently while tracking the origin of each record .

Version 1.9.0 expanded type support. Iceberg now includes a `variant` type for semi-structured data and geospatial types for geometry-based filtering. The release also added nanosecond timestamps and improved the semantics of equality deletes .

By 1.10.0, the project had added encryption key metadata, cleanup logic for orphaned delete vectors, and full compatibility with Spark 4.0 . Partition statistics were made incremental to reduce overhead in large-scale table planning.

These changes matter. Deletion vectors reduce the cost of updates. Default column values simplify table evolution. Variant support opens the door to querying nested JSON and evolving schemas. Together, these features make Iceberg more expressive and more efficient.

### What's coming next

The community has started preparing for Format V4. Key goals include native index support and a formal caching model. The Iceberg dev list also agreed to raise the Java baseline to JDK 17, clearing the way for future performance and security improvements .

Work is also underway to extend the REST catalog spec. This will improve consistency across catalogs like Polaris and make multi-engine deployments behave more predictably.

All of this reflects a clear direction. Iceberg is not only stable, but optimized. It is now equipped to support warehouse workloads with ACID guarantees, even on cloud object storage.

## Apache Polaris

Polaris is a new incubating project, but in 2025 it made a fast entrance. Its purpose is simple: act as a shared catalog and governance layer for Iceberg tables across multiple query engines. This includes Spark, Flink, Dremio, Trino, StarRocks, and any system that supports Iceberg's REST catalog protocol.

### Why Polaris matters

Today, companies often manage Iceberg tables across multiple engines. Each engine needs a way to authenticate, authorize, and operate on metadata safely. Polaris fills that gap. It provides a consistent API, stores policies centrally, and handles short-term credential vending through built-in integrations with cloud providers.

This makes Polaris one of the first Iceberg-native catalogs to support full multi-engine access, with RBAC and table-level security as first-class features.

### What shipped in 2025

Polaris released three versions in its first year: 1.0.0-incubating in July, 1.1.0 in September, and 1.2.0 in October.

The first release included core catalog APIs, a PostgreSQL-backed persistence layer, Quarkus runtime, and initial support for snapshot and compaction policies. It also supported external identity providers, ETag-based caching, and federated metadata views .

Version 1.1.0 added Hive Metastore integration, support for S3-compatible stores like MinIO, and improvements to modularity and CLI tooling .

Version 1.2.0 focused on governance. It expanded RBAC, introduced fine-grained update permissions, and added event logging. AWS Aurora IAM login support also shipped, helping teams standardize credentials across engines .

### What's coming next

Polaris is not standing still. Active mailing list discussions show interest in idempotent commit operations, improved retries, and broader NoSQL compatibility. The project is also planning to support Delta Lake tables through its generic table APIs.

Polaris is already production-ready for Iceberg. It supports time travel, commit retries, STS credential vending, and a policy-based governance model. These capabilities make it the metadata backbone of an open lakehouse.

## Apache Parquet

Parquet is the disk format most Iceberg tables use. In 2025, the project focused on performance and long-term maintainability. While its interface has changed little, its internals received key upgrades.

### What shipped in 2025

The biggest release was Parquet Java 1.16.0 in September. It removed legacy Hadoop 2 support, raised the Java baseline to 11, and enabled vectorized reads by default. These changes help projects like Iceberg, Trino, and Spark take advantage of faster scan paths with less configuration .

The update also refreshed core dependencies like Protobuf and Jackson, fixed bugs in nested field casting, and added CLI support for printing size statistics. For teams managing data layout at scale, this makes table introspection simpler and safer.

On the C++ side, version 12.0 of the Parquet format finalized support for Decimal32 and Decimal64 encodings. These types make aggregations and filters on fixed-point numbers more space-efficient .

### What's coming next

The Parquet community has begun discussing what a V3 format might look like. Topics include FSST-based string encoding, cleaner metadata layouts, and faster bloom filter indexing. These ideas aim to reduce scan times and improve filter pushdown without breaking compatibility .

The dev list also revisited lingering V2 features like optional checksums and page-level statistics. There is consensus that these will stabilize in 2026, completing the long tail of V2 work before any format transition.

Parquet’s future is evolutionary, not disruptive. The team is focused on speed, compatibility, and precision. That’s exactly what Iceberg and other engines need from their storage format.

## Apache Arrow

Arrow provides the in-memory columnar format that many engines use to exchange data without copying or re-encoding. In 2025, the project extended its feature set, added new bindings, and continued improving compute performance.

### What shipped in 2025

Arrow released versions 20.0.0 in April, 21.0.0 in July, and 22.0.0 in October. Each brought changes across the stack, including C++, Python, Java, and R bindings.

The October release expanded compute functions with new regex matchers, selection kernels, and logical operators. It also improved CSV read/write performance, added support for `attrs` in Pandas DataFrames, and stabilized Decimal32 and Decimal64 support across languages .

Arrow Flight, the RPC layer, shipped a working SQL client implementation. This lays the groundwork for distributed query pushdown using Arrow buffers. Timezone-aware types also advanced, with the community approving a new `TimestampWithOffset` type to better handle UTC offsets in analytical workflows .

Language support improved too. Arrow released official wheels for modern Linux platforms, added MATLAB bindings, and expanded test coverage for R and Julia. These improvements reduce friction when adopting Arrow across new platforms.

### What's coming next

Arrow’s roadmap points toward broader Flight SQL adoption, faster filter and projection kernels, and more alignment between language libraries. Mailing list discussion shows active work on offset encoding, enum types, and compression improvements.

More importantly, Arrow is no longer just a format. It’s becoming an interoperability layer for lakehouse engines. With zero-copy sharing across Spark, Dremio, DuckDB, and beyond, Arrow enables the low-latency experience users expect from a warehouse.

Arrow’s 2025 work reinforced that direction: fast, portable, and deeply integrated with the tools that matter.

## Wrapping up

Apache Iceberg, Polaris, Parquet, and Arrow all pushed forward in 2025. Each project focused on practical features that improve performance, governance, or compatibility. Together, they form a foundation for a warehouse experience on open data.

This year’s progress wasn’t about experimentation. It was about consolidation. The features that shipped—from deletion vectors to vectorized reads to Flight SQL—are already in production. They make it easier to build, operate, and scale lakehouse systems.

In 2026, expect the conversation to shift from format maturity to engine convergence. With multi-engine catalogs, index-aware tables, and in-memory interoperability in place, the future looks a lot more accessible. And a lot faster.
