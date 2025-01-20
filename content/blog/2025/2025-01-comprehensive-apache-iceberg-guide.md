---
title: 2025 Comprehensive Guide to Apache Iceberg
date: "2025-01-20"
description: "What is Apache Iceberg, How it Works, and Why it Matters!"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - apache iceberg
---

- [Free Apache Iceberg Crash Course](https://university.dremio.com/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=2025-iceberg-comp-guide&utm_content=alexmerced&utm_term=external_blog)
- [Free Copy of “Apache Iceberg: The Definitive Guide”](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=2025-iceberg-comp-guide&utm_content=alexmerced&utm_term=external_blog)
- [2025 Apache Iceberg Architecture Guide](https://medium.com/data-engineering-with-dremio/2025-guide-to-architecting-an-iceberg-lakehouse-9b19ed42c9de)
- [How to Join the Iceberg Community](https://medium.alexmerced.blog/guide-to-finding-apache-iceberg-events-near-you-and-being-part-of-the-greater-iceberg-community-0c38ae785ddb)
- [Iceberg Lakehouse Engineering Video Playlist](https://youtube.com/playlist?list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe&si=WTSnqjXZv6Glkc3y)
- [Ultimate Apache Iceberg Resource Guide](https://medium.com/data-engineering-with-dremio/ultimate-directory-of-apache-iceberg-resources-e3e02efac62e)

Apache Iceberg had a monumental 2024, with significant announcements and advancements from major players like Dremio, Snowflake, Databricks, AWS, and other leading data platforms. The Iceberg ecosystem is evolving rapidly, making it essential for professionals to stay up-to-date with the latest innovations. To help navigate this ever-changing space, I’m introducing an annual guide dedicated to Apache Iceberg. This guide aims to provide a comprehensive overview of Iceberg, highlight key resources, and offer valuable insights for anyone looking to deepen their knowledge. Whether you’re just starting with Iceberg or are a seasoned user, this guide will serve as your go-to resource for 2025.

[Read this article for details on migrating to Apache Iceberg.](https://www.dremio.com/blog/migration-guide-for-apache-iceberg-lakehouses/)

## What is a Table Format?

A table format, often referred to as an “open table format” or “lakehouse table format,” is a foundational component of the data lakehouse architecture. This architecture is gaining popularity for its ability to address the complexities of modern data management. Table formats transform how data stored in collections of analytics-optimized Parquet files is accessed and managed. Instead of treating these files as standalone units to be opened and read individually, a table format enables them to function like traditional database tables, complete with ACID guarantees.

With a table format, users can interact with data through SQL to create, read, update, and delete records, bringing the functionality of a data warehouse directly to the data lake. This capability allows enterprises to treat their data lake as a unified platform, supporting both data warehousing and data lake use cases. It also enables teams across an organization to work with a single copy of data in their tool of choice — whether for analytics, machine learning, or operational reporting — eliminating redundant data movements, reducing costs, and improving consistency across the enterprise.

Currently, there are four primary table formats driving innovation in this space:

- **Apache Iceberg:** Originating from Netflix, this blog’s focus, Iceberg is known for its flexibility and robust support for big data operations.
- **Delta Lake:** Developed by Databricks, it emphasizes simplicity and seamless integration with their ecosystem.
- **Apache Hudi:** Created by Uber, Hudi focuses on real-time data ingestion and incremental processing.
- **Apache Paimon:** Emerging from the Apache Flink Project, Paimon is designed to optimize streaming and batch processing use cases.

Each of these table formats plays a role in the evolving data lakehouse landscape, enabling organizations to unlock the full potential of their data lakehouse.

## How Table Formats Work

At the core of every table format is a metadata layer that transforms collections of files into a table-like structure. This metadata serves as a blueprint for understanding the data, providing essential details such as:

- **Files included in the table:** Identifying the physical Parquet or similar files that make up the dataset.
- **Partitioning scheme:** Detailing how the data is partitioned to optimize query performance.
- **Schema:** Defining the structure of the table, including column names, data types, and constraints.
- **Snapshot history:** Tracking changes over time, such as additions, deletions, and updates to the table, enabling features like time travel and rollback.

This metadata acts as an entry point, allowing tools to treat the underlying files as a cohesive table. Instead of scanning all files in a directory, query engines use the metadata to understand the structure and contents of the table. Additionally, the metadata often includes statistics about partitions and individual files. These statistics enable advanced query optimization techniques, such as pruning or skipping files that are irrelevant to a specific query, significantly improving performance.

While all table formats rely on metadata to bridge the gap between raw files and table functionality, each format structures and optimizes its metadata differently. These differences can influence performance, compatibility, and the features each format provides.

## How Apache Iceberg’s Metadata is Structured

Apache Iceberg’s metadata structure is what enables it to transform raw data files into highly performant and queryable tables. This structure consists of several interrelated components, each designed to provide specific details about the table and optimize query performance. Here’s an overview of Iceberg’s key metadata elements:

- **metadata.json**:
  - The metadata.json file is the primary entry point for understanding the table.
  - This semi-structured JSON object contains information about the table’s schema, partitioning scheme, snapshot history, and other critical details.

- **Manifest List**:
  - Each snapshot in Iceberg has a corresponding Avro-based “manifest list.” This list contains rows representing each manifest (a group of files) that makes up the snapshot.
  - Each row includes:
    - The file location of the manifest.
    - Partition value information for the files in the manifest.
  - This information allows query engines to prune unnecessary manifests and avoid scanning irrelevant partitions, improving query efficiency.

- **Manifests**:
  - A manifest lists one or more Parquet files and includes statistics about each file, such as column summaries.
  - These statistics allow query engines to determine whether a file contains data relevant to the query, enabling file skipping for improved performance.

- **Delete Files**:
  - Delete files track records that have been deleted as part of “merge-on-read” updates. During queries, the engine reconciles these files with the base data, ensuring that deleted records are ignored.
  - There is ongoing discussion about transitioning from delete files to a “deletion vector” approach, inspired by Delta Lake, where deletions are tracked using Puffin files. As of this writing, this proposal has not yet been implemented.

- **Puffin Files**:
  - Puffin files are a format for tracking binary blobs and other metadata, designed to optimize queries for engines that choose to leverage them.

- **Partition Stats Files**:
  - These files summarize statistics at the partition level, enabling even greater optimization for queries that rely on partitioning.

## The Evolution of Iceberg’s Specification

Apache Iceberg’s specification is constantly evolving through community contributions and proposals. These innovations benefit the entire ecosystem, as improvements made by one platform are shared across others. For example:

- Partition Stats Files originated from work by Dremio to enhance query optimization.
- Puffin Files were introduced by the Trino community to improve how Iceberg tracks metadata.

This collaborative approach ensures that Apache Iceberg continues to evolve as a cutting-edge table format for modern data lakehouses.

[Read this article on the Apache Iceberg Metadata tables.](https://www.dremio.com/blog/apache-iceberg-metadata-tables/)

## The Role of Catalogs in Apache Iceberg

One of the key features of Apache Iceberg is its immutable file structure, which makes snapshot isolation possible. Every time the data or structure of a table changes, a new metadata.json file is generated. This immutability raises an important question: how does a tool know which metadata.json file is the latest one?

This is where Lakehouse Catalogs come into play. A Lakehouse Catalog serves as an abstraction layer that tracks each table’s name and links it to the most recent metadata.json file. When a table’s data or structure is updated, the catalog is also updated to point to the new metadata.json file. This update is the final step in any transaction, ensuring that the change is completed successfully and meets the atomicity requirement of ACID compliance.

Lakehouse Catalogs are distinct from Enterprise Data Catalogs or Metadata Catalogs, such as those provided by companies like Alation and Collibra. While Lakehouse Catalogs focus on managing the technical details of tables and transactions, enterprise data catalogs are designed for end-users. They act as tools to help users discover, understand, and request access to datasets across an organization, enhancing data governance and usability.

[Read this article to learn more about Iceberg catalogs.](https://www.dremio.com/blog/the-evolution-of-apache-iceberg-catalogs/)

## The Apache Iceberg REST Catalog Spec

As more catalog implementations emerged, each with unique features and APIs, interoperability between tools and catalogs became a significant challenge. This lack of a unified standard created a bottleneck for seamless table management and cross-platform compatibility.

To address this issue and drive innovation, the REST Catalog specification was developed. Rather than requiring all catalog providers to adopt a standardized server-side implementation, the specification introduced a universal REST API interface. This approach ensures that:

- Tools and systems can rely on a consistent, client-side library to interact with catalogs.
- Catalog providers maintain the flexibility to implement their server-side systems in ways that suit their needs, as long as they adhere to the standard REST endpoints outlined in the specification.

With the REST Catalog specification, interoperability and ease of integration have dramatically improved. This innovation allows developers and enterprises to adopt or build catalogs that align with their technical and business requirements while still being compatible with any tool that supports the REST API interface. This forward-thinking design has strengthened the role of catalogs in modern lakehouse architectures, ensuring that Iceberg tables remain accessible and manageable across diverse platforms.

[Read more about the Iceberg REST Spec in this article.](https://medium.com/data-engineering-with-dremio/what-iceberg-rest-catalog-is-and-isnt-b4a6d056f493)

## Soft Deletes vs Hard Deleting Data

When working with table formats like Apache Iceberg, it’s important to understand how data deletion is handled. Unlike traditional databases, where deleted data is immediately removed from the storage layer, Iceberg follows a different approach to maintain snapshot isolation and enable features like time travel.

When you execute a delete query, the data is not physically deleted. Instead:

- A new snapshot is created where the deleted data is no longer present.
- The original data files remain intact because the old snapshots are still valid and accessible.

This approach allows users to query previous versions of the table using time travel, providing a powerful mechanism for auditing, debugging, and historical analysis.

However, this also means that data marked for deletion continues to occupy storage until it is physically removed. To address this, snapshot expiration procedures are performed during table maintenance using tools like Spark or Dremio. These procedures:

- Invalidate old snapshots that are no longer needed.
- Remove the associated data files from storage, freeing up space.

Regular maintenance is a critical part of managing Iceberg tables to ensure storage efficiency and maintain optimal performance while leveraging the benefits of its snapshot-based architecture.

## Optimizing Iceberg Data

### Minimizing Storage

The first step in reducing storage costs is selecting the right compression algorithm for your data. Compression not only reduces the amount of space required to store data but can also improve performance by accelerating data transfer across networks. These compression settings can typically be adjusted at both the table and query engine levels to suit your specific use case.

### Improving Performance

Optimizing performance largely depends on how data is distributed across files. This can be achieved through regular maintenance procedures using tools like Spark or Dremio. These optimizations result in two key outcomes:

- **Compaction**:
  - Reduces the number of small files and consolidates delete files into fewer, larger files.
  - Minimizes the number of I/O operations required during query execution, leading to faster reads.

- **Clustering/Sorting**:
  - Reorganizes data to co-locate similar records within the same files based on commonly queried fields.
  - Allows query engines to skip more files during a query, as the data being searched for is concentrated in a smaller subset of files.

By leveraging these strategies, Iceberg users can maintain a balance between efficient storage and fast query performance, ensuring their data lakehouse operates at peak efficiency. Regular maintenance is essential for reaping the full benefits of these optimizations.

[Read this article for more detail on optimizing Apache Iceberg tables.](https://www.dremio.com/blog/guide-to-maintaining-an-apache-iceberg-lakehouse/)

## Hands-on Tutorials

- [Hands-on Intro with Apache iceberg](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=2025comp-iceberg-guide&utm_content=alexmerced&utm_term=external_blog)
- [Intro to Apache Iceberg, Nessie and Dremio on your Laptop](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=2025comp-iceberg-guide&utm_content=alexmerced&utm_term=external_blog)
- [JSON/CSV/Parquet to Apache Iceberg to BI Dashboard](https://www.dremio.com/blog/from-json-csv-and-parquet-to-dashboards-with-apache-iceberg-and-dremio/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=2025comp-iceberg-guide&utm_content=alexmerced&utm_term=external_blog)
- [From MongoDB to Apache Iceberg to BI Dashboard](https://www.dremio.com/blog/from-mongodb-to-dashboards-with-dremio-and-apache-iceberg/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=2025comp-iceberg-guide&utm_content=alexmerced&utm_term=external_blog)
- [From SQLServer to Apache Iceberg to BI Dashboard](https://www.dremio.com/blog/from-sqlserver-to-dashboards-with-dremio-and-apache-iceberg/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=2025comp-iceberg-guide&utm_content=alexmerced&utm_term=external_blog)
- [From Postgres to Apache Iceberg to BI Dashboard](https://www.dremio.com/blog/from-postgres-to-dashboards-with-dremio-and-apache-iceberg/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=2025comp-iceberg-guide&utm_content=alexmerced&utm_term=external_blog)
- [Mongo/Postgres to Apache Iceberg to BI Dashboard using Git for Data and DBT](https://www.dremio.com/blog/experience-the-dremio-lakehouse-hands-on-with-dremio-nessie-iceberg-data-as-code-and-dbt/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=2025comp-iceberg-guide&utm_content=alexmerced&utm_term=external_blog)
- [Elasticsearch to Apache Iceberg to BI Dashboard](https://www.dremio.com/blog/from-elasticsearch-to-dashboards-with-dremio-and-apache-iceberg/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=2025comp-iceberg-guide&utm_content=alexmerced&utm_term=external_blog)
- [MySQL to Apache Iceberg to BI Dashboard](https://www.dremio.com/blog/from-mysql-to-dashboards-with-dremio-and-apache-iceberg/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=2025comp-iceberg-guide&utm_content=alexmerced&utm_term=external_blog)
- [Apache Druid to Apache Iceberg to BI Dashboard](https://www.dremio.com/blog/from-apache-druid-to-dashboards-with-dremio-and-apache-iceberg/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=2025comp-iceberg-guide&utm_content=alexmerced&utm_term=external_blog)
- [BI Dashboards with Apache Iceberg Using AWS Glue and Apache Superset](https://www.dremio.com/blog/bi-dashboards-with-apache-iceberg-using-aws-glue-and-apache-superset/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=2025comp-iceberg-guide&utm_content=alexmerced&utm_term=external_blog)
- [End-to-End Basic Data Engineering Tutorial (Spark, Apache Iceberg Dremio, Superset)](https://medium.com/data-engineering-with-dremio/end-to-end-basic-data-engineering-tutorial-spark-dremio-superset-c076a56eaa75)