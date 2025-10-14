---
title: The State of Apache Iceberg v4 - October 2025 Edition
date: "2025-10-14"
description: "What's Coming in Apache Iceberg v4: A Deep Dive into the Future of Open Table Formats"
author: "Alex Merced"
category: "Data Engineering"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - Data Lakehouse
  - Data Engineering
  - Apache Iceberg
---

**Get Data Lakehouse Books:**
- [Apache Iceberg: The Definitive Guide](https://drmevn.fyi/tableformatblog)
- [Apache Polaris: The Defintive Guide](https://drmevn.fyi/tableformatblog-62P6t)
- [Architecting an Apache Iceberg Lakehouse](https://www.manning.com/books/architecting-an-apache-iceberg-lakehouse)
- [The Apache Iceberg Digest: Vol. 1](https://www.puppygraph.com/ebooks/apache-iceberg-digest-vol-1)

**Lakehouse Community:**
- [Join the Data Lakehouse Community](https://www.datalakehousehub.com)
- [Data Lakehouse Blog Roll](https://lakehouseblogs.com)
- [OSS Community Listings](https://osscommunity.com)
- [Dremio Lakehouse Developer Hub](https://developer.dremio.com)

---

Apache Iceberg has come a long way since its early days of bringing reliable ACID transactions and schema evolution to the data lake. It helped teams move beyond brittle Hive tables and built the foundation for modern lakehouse architectures. But with wider adoption came new challenges—especially as workloads shifted from batch-heavy pipelines to streaming ingestion, faster commits, and more interactive use cases.

That pressure has exposed some cracks in the foundation. Write-heavy applications hit metadata bottlenecks. Query planners struggle with inefficient stats. Teams managing large tables face complex migrations due to rigid path references.

The Apache Iceberg community has responded with a set of focused, forward-looking proposals that make up the v4 specification. These aren’t just incremental tweaks. They represent a clear architectural shift toward scalability, operational simplicity, and real-time readiness.

In this post, we’ll walk through the key features proposed for Iceberg v4, why they matter, and what they mean for data engineers, architects, and teams building at scale.

## The New Iceberg Vision: Performance Meets Portability

Apache Iceberg was initially built for reliable batch analytics on cloud object storage. It solved core problems like schema evolution, snapshot isolation, and data consistency across distributed files. That foundation made it a favorite for building open data lakehouses.

But today’s data platforms are evolving fast. Teams are mixing streaming and batch. Ingest rates are higher. Table sizes are bigger. Query expectations are more demanding. Managing metadata at scale has become one of the biggest friction points.

The proposals in Iceberg v4 address these shifts head-on. Together, they aim to:

- **Reduce write overhead** so commits scale with ingestion speed
- **Improve query planning** by making metadata easier to scan and use
- **Simplify operations** like moving, cloning, or backing up tables

In short, Iceberg is being re-tuned for modern workloads—ones that demand both speed and flexibility. The v4 changes aren’t just about performance. They’re about making Iceberg easier to run, easier to optimize, and better suited for the next generation of data systems.

## Proposal 1: Single-File Commits – Cutting Down Metadata Overhead

Every commit to an Iceberg table today creates at least two new metadata files: one for the updated manifest list, and another for any changed manifests. In fast-moving environments—like streaming ingestion or micro-batch pipelines—this adds up quickly.

The result? Write amplification. For every small data change, there’s a burst of I/O to update metadata. Over time, this leads to thousands of small metadata files, bloated storage, and a slowdown in commit throughput. Teams often have to schedule compaction jobs to clean up the data.

The v4 proposal introduces **Single-File Commits**, a new way to consolidate all metadata changes into a single file per commit. This reduces:

- The number of file system operations per commit
- The coordination overhead for concurrent writers
- The need for frequent compaction

By minimizing I/O and simplifying commit logic, this change unlocks faster ingestion and makes Iceberg friendlier to real-time workflows. It also means fewer moving parts to manage and fewer edge cases to debug in production.

## Proposal 2: Parquet for Metadata – Smarter Query Planning

Today, Iceberg stores metadata files—like manifests and manifest lists—in **Apache Avro**, a row-based format. While this made sense early on, it’s become a bottleneck for query performance.

Why? Because most query engines don’t need every field in the metadata. For example, if a planner wants to filter files based on a column’s min and max values, it only needs that one field. But with Avro, it has to read and deserialize entire rows just to access a few columns.

The proposed change in Iceberg v4 is to **use Parquet instead of Avro** for metadata files. Since Parquet is a columnar format, engines can:

- Read only the fields they need
- Skip over irrelevant parts of the file
- Load metadata faster and use less memory

This shift isn’t just about speed—it enables smarter planning. Engines can project just the stats they care about, sort and filter more effectively, and better optimize execution plans. It’s a small architectural change with a big ripple effect across the query lifecycle.

## Proposal 3: Column Statistics Overhaul – Better Skipping, Smarter Queries

Metadata isn't just about file paths—it's also about understanding what’s inside each file. Iceberg uses column-level statistics to help query engines skip files that don’t match filter conditions. But the current stats format has limitations that hold back performance.

Right now, statistics are:
- Flat and untyped, with no indication of data type
- Stored as generic key-value pairs
- Lacking detail on things like null counts or nested fields

These gaps make it hard for query planners to fully optimize their logic. For example, it's difficult to distinguish between a missing value and a null, or to reason about nested data structures like structs and arrays.

The v4 spec proposes a **redesigned statistics format** with:
- Type information for every stat
- Projectable structures for selective reads
- Support for more detailed metrics, including null counts and nested fields

This richer structure enables more precise file pruning and better cost-based optimization. Engines can make smarter decisions about which files to read and which filters to push down—leading to faster queries, less I/O, and improved overall performance.

## Proposal 4: Relative Paths – Making Tables Portable Again

In current versions of Iceberg, metadata files store **absolute file paths**. That might seem fine at first—until you try to move a table.

If you change storage accounts, rename a bucket, or migrate between environments, every path in every metadata file becomes invalid. Fixing that means scanning and rewriting all metadata—an expensive, error-prone operation that often requires a distributed job.

The v4 proposal introduces support for **relative paths** in metadata. Instead of locking a table to a fixed storage location, file references are stored relative to a base URI defined in the table metadata.

This change unlocks several real-world benefits:
- **Simpler migrations** across cloud regions or storage platforms
- **Easier disaster recovery** with portable backups
- **Less brittle operations** when storage configurations evolve

Relative paths decouple the logical structure of a table from its physical location. That means fewer rewrites, less maintenance overhead, and more flexibility when managing Iceberg tables at scale.

## Iceberg’s Direction: Toward Operational Simplicity

Taken together, these proposals reflect a clear shift in how the Iceberg community is thinking about the format—not just as a technical layer, but as an operational foundation for modern data platforms.

Here’s what’s changing:

- **From batch-first to real-time ready**: Single-file commits and smarter stats make Iceberg more suitable for streaming ingestion and low-latency use cases.
- **From fixed to flexible**: Relative paths reduce the coupling between metadata and storage, making operations like migration and backup less painful.
- **From rigid to optimized**: Moving to columnar metadata and richer statistics gives query engines more room to optimize without heavy lifting.

This is Iceberg growing up.

The format has always prioritized correctness and openness. Now it’s doubling down on speed, scalability, and ease of use—especially for teams managing hundreds or thousands of tables across dynamic environments.

Whether you're building AI pipelines, federated queries, or traditional dashboards, these changes aim to reduce the friction and complexity of working with large-scale tables. It’s about making Iceberg not just powerful, but practical.

## A Glimpse Ahead: v4 in Context

Just a few months ago, Apache Iceberg v3 was approved—bringing meaningful improvements to the table format. That release introduced new data types, deletion vectors, and other enhancements that expanded what Iceberg can represent and how it supports evolving workloads.

Right now, the ecosystem is heads-down implementing v3 features across engines, catalogs, and query layers. You’ll see more engines support features like row-level deletes and richer data modeling as v3 adoption matures.

The proposals for v4 aren’t intended to replace that momentum—they build on it.

Think of v3 as expanding what Iceberg can do. V4 focuses on how efficiently and cleanly it can perform the task. These early discussions around v4 offer a forward-looking roadmap for how Iceberg will continue to evolve—toward higher throughput, better portability, and more brilliant query performance.

While these changes are still in the design and discussion phase, they signal where Iceberg is heading. For data teams investing in the lakehouse stack today, it’s reassuring that the foundation will only get stronger over time.
