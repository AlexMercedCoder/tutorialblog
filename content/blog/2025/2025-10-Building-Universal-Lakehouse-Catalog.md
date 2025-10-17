---
title: Building a Universal Lakehouse Catalog - Beyond Iceberg Tables
date: "2025-10-17"
description: "Exploring paths to a universal lakehouse catalog that supports multiple data formats and engines, building on Apache Iceberg's success."
author: "Alex Merced"
category: "Data Engineering"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - Data Lakehouse
  - Data Engineering
  - Apache Iceberg
  - Apache Polaris
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

[Will be recording an episode on this topic on my podcast, so please subscribe to the podcast to not miss it (Also on iTunes and other directories)](https://open.spotify.com/show/2PRDrWVpgDvKxN6n1oUsJF?si=e1a55e628ce74a10)

Apache Iceberg has done something few projects manage to pull off, it created a standard. Its table format and REST-based catalog interface made it possible for different engines to read, write, and govern the same data without breaking consistency. That’s a big deal. For the first time, organizations could mix and match engines while keeping one clean, transactional view of their data.

But this success brings new expectations.

As lakehouse adoption grows, teams want more than just Iceberg tables under one roof. They want to treat *all* their datasets, raw Parquet files, streaming logs, external APIs, or even other formats like Delta and Hudi, with the same consistency and governance. The problem? Today’s Iceberg catalogs don’t support that. They’re built for Iceberg tables only.

So how do we move beyond that? How do we build a **universal** lakehouse catalog that works across engines *and* across formats?

Let’s explore two possible paths and what’s still missing.

## Iceberg’s Success: A Case Study in Standardization

To understand where catalogs could go next, it helps to look at what made Iceberg successful in the first place.

Before Iceberg, working with data lakes was messy. You could store files in open formats like Parquet or ORC, but there was no clean way to manage schema changes, version history, or transactional consistency. Each engine had to implement its own logic, or worse, teams had to build brittle pipelines to fill in the gaps.

Iceberg changed that. It introduced:

- A table format that handles schema evolution, ACID transactions, and partitioning without sacrificing openness.
- A catalog interface that lets any engine discover tables and retrieve metadata in a consistent way.

These two specs, the table format and the REST catalog interface, created a plug-and-play model. Spark, Flink, Trino, Dremio, and others could all speak the same language. As a result, Iceberg became the neutral zone. No vendor lock-in, no hidden contracts.

But that neutrality came with a scope: Iceberg REST Catalog only tracks and governs **Iceberg tables**. If your dataset isn’t an Iceberg table, there is no modern open interoperable standard for governing and accessing. And that’s where the limitation begins.

## The Problem: No Standards Beyond Iceberg

While Iceberg catalogs are tightly defined for Iceberg tables, some catalogs *do* allow you to register other types of datasets, raw Parquet, Delta tables, external views, or even API-based data sources.

But there’s a catch.

Each catalog handles this differently. One might use a custom registration API, another might expose a metadata file format, and yet another might treat external sources as virtual tables with limited capabilities. The result is a patchwork of behavior:

- Some tools can read those datasets.
- Some can't see them at all.
- Others behave inconsistently depending on the engine and the catalog.

This makes interoperability fragile. What works in one engine may not work in another, even if they both support the same table format. Teams are left stitching together workarounds or writing custom integrations just to get basic access across systems.

So what’s really missing here? A **standard API** for non-Iceberg datasets. Something that defines:

- How to register a dataset that isn't an Iceberg table.
- How to describe its metadata (schema, location, stats).
- How to govern access across different engines.

The big question is: where should this standard come from, and what should it look like?

## Where Should the Standard Come From?

This brings us to the real crossroads: if we need a standard API for universal lakehouse catalogs, where should it come from?

There are a few possibilities:

- **Should it come from the Iceberg REST spec?**  
That would keep things in the same family and build on an existing community standard. But Iceberg’s current REST spec is tightly scoped around Iceberg tables, and expanding it to cover other data types could be a big shift and expand the project beyond what the community may be comfortable with.

- **Should it be defined inside a single catalog project like Polaris or Unity?**  
A vendor-backed project can move quickly, implement end-to-end features, and ship a working solution but then be a source of lock-in. If an open standard catalog dominates, then it becomes the home of the API standard by default. 

- **Is it acceptable if the spec starts with a vendor?**  
Maybe. If that vendor drives real adoption and the API is later opened up, it can evolve into a neutral standard. But it would need wide buy-in and careful governance, to avoid becoming another moving target.

No matter how you look at it, there are really only two main paths forward:

1. **An implementation becomes the de facto standard.**  
One catalog (open source or commercial) builds enough momentum that its API becomes the standard, similar to how S3 became the API for object storage.

2. **A neutral API spec is created independently.**  
This would follow the Iceberg model, where the spec came first, then vendors and engines built around it.

If history teaches us anything, it’s that vendor-driven standards can create long-term friction. S3 is a good example: it's ubiquitous, but it’s also tightly bound to a single provider’s roadmap leading to a whack-a-mole like catch up game for those who support the API they have no control over. That experience shaped how the industry approached table formats, this time, the community came together around Iceberg to avoid that kind of lock-in and vendor catch-up.

So whatever path we take toward universal cataloging, the smart money is on a **community standard**. The only question is whether that standard comes from an existing implementation, or from a new, vendor-neutral spec that everyone agrees to follow.

## Exploring the Implementation-First Path: Apache Polaris and Table Sources

If the path to a universal catalog starts with an implementation, Apache Polaris (incubating) is worth watching closely. Among the open catalog projects, Polaris stands out for two reasons:

1. It's built as an open implementation of the Apache Iceberg REST Catalog spec.
2. It's actively proposing new features to extend catalog support beyond Iceberg tables.

While Polaris already supports Iceberg tables through the standard REST interface, it's exploring how to bring non-Iceberg datasets into the same catalog. This includes both structured file-based datasets like Parquet or JSON, and unstructured data like images, PDFs, or videos.

Right now, Polaris includes a feature called **Generic Tables**, but a more robust proposal called **Table Sources** is under active discussion.

### What Are Table Sources?

[Discussion of this proposal on the Dev List](https://lists.apache.org/thread/652z1f1n2pgf3g2ow5y382wlrtnoqth0)

**Table Sources** are a proposed abstraction that lets Polaris register and govern external data that isn’t already an Iceberg table. Instead of forcing everything into the Iceberg format, Polaris acts as a bridge: mapping object storage locations to queryable tables using metadata services that live outside the catalog itself.

Each **Table Source** includes:

- A name (used as the table identifier)
- A source type (structured data, unstructured objects, or Iceberg metadata)
- A configuration (like file format, storage location, credentials, filters, and refresh intervals)

For example:

- **Data Table Source**: Represents structured files like Parquet or JSON. These are registered read-only tables with metadata generated by an external service.
- **Object Table Source**: Describes unstructured data like videos or documents, exposing file metadata (size, path, modification time) in table format.
- **Iceberg Table Source**: Adapts metadata from existing Iceberg tables stored outside Polaris.

Polaris doesn’t scan or interpret these datasets directly. Instead, **Source Services**, external processes, use the registered configurations to scan file systems, generate table metadata, and push it back to Polaris. This decouples the engine from the source and the catalog from the scanning logic.

At query time, engines can interact with these registered tables using the same APIs as they would for Iceberg, even though the backing data may not follow Iceberg’s spec.

### Why This Matters

If adopted, the **Table Source** feature could give Polaris a head start as the reference implementation for a broader catalog API. It defines a reusable contract for registering external data, managing its lifecycle, and governing access, all in a way that’s decoupled from specific engines or formats.

But this also raises the bigger question: will other catalogs follow this model? Will engines adopt the same contract for recognizing external data? Or will each system continue to define its own rules?

That tension, between an evolving implementation like Polaris and the desire for an extension to the REST Catalog API standard, sets the stage for what comes next in the catalog story.

## The API-First Path: Extending the Iceberg REST Catalog Spec

Now let’s explore the other side of the equation: what if instead of extending a specific implementation, we expanded the **Iceberg REST Catalog specification itself**?

This approach would focus on defining a **neutral contract** that any catalog, Polaris, Unity, Glue, or others, could implement to support more than just Iceberg tables. Rather than focusing on what a specific system can do today, it asks: *what could a future REST catalog look like if it supported universal datasets by design?*

One of the most interesting signs of this potential is already in the spec: the **Scan Planning Endpoint**.

### What Is Scan Planning?

In the typical read path, an engine:

1. Requests a table from the catalog.
2. The catalog responds with the metadata location.
3. The engine reads the metadata files (manifests, snapshots, etc.) and plans which Parquet files to scan.

But with the **Scan Planning Endpoint**, the flow changes:

1. The engine calls the endpoint directly.
2. The catalog does the heavy lifting: it traverses the metadata, evaluates filters, and returns a **list of data files** to scan.

This makes the engine’s job simpler if the catalog and engine support the endpoint. It no longer needs to understand Iceberg’s metadata structure. It just gets files to read.

### Why This Matters for Universal Catalogs

By pushing scan planning into the catalog, the spec opens the door to something bigger:

- The catalog could expose **non-Iceberg** datasets, like Delta Lake, Hudi, or raw Parquet, and return scan plans for them.
- It could also **cache metadata** in a relational database, avoiding repeated reads from object storage.
- Engines remain agnostic to metadata formats, they just scan files.

This is a fundamental shift: the **catalog becomes the query planner for metadata**, not just a metadata store.

But here’s the big catch: this currently only exists on the **read** side.

There’s no equivalent in the spec today for the **write path**.

### A Hypothetical Write-Side Extension

Imagine this: instead of asking the engine to write metadata files (as is required today), the engine submits a write payload to the catalog:

- The namespace of the table
- The table type
- A list of new data files and associated summary statistics

The catalog could then:

- Internally update its metadata, whether that’s JSON files, a manifest database, or some other format
- Enforce governance rules
- Trigger compaction or indexing tasks

In this model, the catalog fully owns metadata management for both reads and writes. Engines don’t need to understand Iceberg’s internals, or any other format’s internals. They just write and read data and delegate everything else.

### The Trade-Offs

This model is clean and powerful. It simplifies engine logic and opens the door for catalogs to support any file-based dataset. But it comes at a cost:

- The **catalog must be deeply optimized** to handle scan planning at scale.
- It must support high concurrency, incremental updates, and aggressive caching.
- Metadata operations become tightly coupled to catalog performance.

In other words, this model places a lot more responsibility on the catalog itself. That’s not necessarily bad, but it changes the design expectations.

Still, if the goal is to build a **universal contract** for working with datasets across formats, pushing more of that logic into the catalog, via a standardized API that even the major cloud vendors follow, might be the path forward.

## Comparing the Two Paths: Implementation vs. API Standard

Both the *Table Sources* approach and the *Scan Planning API model* offer ways to move beyond Iceberg-only catalogs. But they take fundamentally different routes. One starts by expanding what a specific catalog can do and becomes the standard if that catalog becomes the standard. The other extends an API Spec that is already an industry standard with a narrower scope (standardizing transactions with Iceberg tables).

Let’s weigh the trade-offs.

### 1. **Flexibility and Expressiveness**

- **Table Sources (Implementation-first)**  
  ✅ Easier to move quickly, Polaris can prototype and evolve features as it is a younger project with a younger community that can reach consensus quicker.  
  ✅ Can support structured and unstructured datasets with source-specific logic.  
  ✅ Avoid the lock-in of a vendor implementation becoming the standard, since Apache Polaris is a incubating Apache Project anyone can deploy.

- **Scan Planning Extension (API-first)**  
  ✅ Treats all datasets as files with a metadata interface, engines don’t need to know anything about the metadata format.  
  ✅ Opens the door for catalogs to expose Delta, Hudi, Paimon, or other sources using the same scan API.  
  ⚠️ Metadata management becomes much more complex for the catalog, especially for large tables or real-time use cases.

In both scenarios, there is still always the question of a specific engines support for reading different file formats or metadata formats. Although, in both scenarios the catalog can still be the central listing governing access to all lakehouse datasets.

### 2. **Governance and Control**

- **Table Sources**  
  ✅ Catalog remains the system of record and point of governance.  
  ✅ Supports configuration-based registration, access control, and credential vending.  
  ⚠️ Each source type needs its own metadata strategy, increasing maintenance complexity.

- **Scan Planning + Write Delegation**  
  ✅ Centralizes all metadata handling, which could unify governance and simplify access rules.  
  ⚠️ Puts more strain on catalog durability, uptime, and scalability, it's now a bigger bottleneck for reads and writes.

### 3. **Ecosystem Alignment**

- **Table Sources**  
  ✅ Works well for ecosystems already aligned around Polaris or compatible systems.   
  ⚠️ Other catalogs would need to implement Polaris-compatible logic to ensure portability. (We saw catalogs adopt the Iceberg REST Spec as it become the standard, so there is precedent)

- **REST Spec Extension**  
  ✅ Builds on a known spec (Iceberg REST), which already has buy-in across many vendors.  
  ✅ Keeps catalogs interchangeable if they adhere to the same read/write API contract.  
  ⚠️ Requires coordination and consensus across the community, which can slow down adoption.

### 4. **Developer Experience**

- **Table Sources**  
  ✅ Clear division of responsibility: catalog governs metadata, engines execute logic.  
  ✅ External services (source services) handle complexity and can evolve independently.  
  ⚠️ Requires more infrastructure components to be deployed and maintained.

- **API Extensions**  
  ✅ Simplifies engine logic, engines just hand off files and scan what they’re told.  
  ⚠️ Catalog APIs become more complex and require tighter validation of inputs and outputs.

### Summary

In practice, both paths have strengths, and challenges. A hybrid model could even emerge: catalogs like Polaris could lead the way with working implementations, while the community formalizes an API spec based on what works.

The real question isn’t which is “better”, it’s which path brings the most durable, portable, and scalable standard to life.
