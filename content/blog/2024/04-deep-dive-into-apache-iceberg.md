---
title: A Deep Intro to Apache and Resources for Learning More
date: "2024-04-04"
description: "Learning about Apache Iceberg"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - Data Architecture
  - Apache Iceberg
  - Data Lakehouse
---

For a long time, siloed data systems such as databases and data warehouses were sufficient. These systems provided convenient abstractions for various data management tasks, including:

- Storage locations and methods for data.
- Identification and recognition of unique datasets or tables.
- Cataloging and tracking available tables.
- Parsing, planning, and executing queries.

However, as needs evolved, it became necessary to utilize multiple systems to process the data, leading to costly and time-consuming data duplication and copying. This also introduced challenges in troubleshooting and maintaining the pipelines required for these data movements. This is where the concept of a [data lakehouse architecture](https://www.dremio.com/blog/why-lakehouse-why-now-what-is-a-data-lakehouse-and-how-to-get-started/) becomes valuable. It leverages the existing open storage layer of a data lake and allows for the modular introduction of table, catalog, and query execution layers in a decoupled, modular manner.

In a typical lakehouse, we:
- Store data in object storage or Hadoop using formats like Parquet.
- Organize these Parquet files into tables using table formats such as Apache Iceberg or Delta Lake.
- Catalog these tables for easier discoverability using systems like Nessie or Gravitino.
- Run operations on these tables using engines like Dremio, Apache Spark, or Apache Flink.

Crucially, the table format is key to enabling these functionalities. In this article, we will explore what [Apache Iceberg](https://iceberg.apache.org/) is and provide resources for further learning.

## How Apache Iceberg Works

![Apache Iceberg Architecture](https://i.imgur.com/AUaKseG.png)

Apache Iceberg consists of four key components:

- **Iceberg Catalog**: This component tracks the list of tables and references the location of the latest metadata, specifically pointing to the current `metadata.json` file.
- **Metadata.json**: This file contains details about the table, such as its partitioning scheme, schema, and a historical list of snapshots.
- **Manifest List**: Each manifest list corresponds to a snapshot and aggregates statistics for each manifest comprising the snapshot. This metadata is used to apply partition pruning, allowing queries to skip manifests with partition values that are irrelevant to the query.
- **Manifests**: Each manifest represents a bundle of data files, along with their statistics, which can be used for min/max filtering to skip files that do not contain query-relevant values.

Ultimately, these layers of metadata enable tools to efficiently scan the table and exclude unnecessary data files from the scan plan.

### Additional Resources

- [Blog: Apache Iceberg 101](https://www.dremio.com/subsurface/apache-iceberg-101-your-guide-to-learning-apache-iceberg-concepts-and-practices/)
- [Podcast: Catalogs, Manifests and Metadata! Oh My!](https://open.spotify.com/show/6hyWZj8k2o0Yuicr8PZesm?si=b23b0a77cc6d4b79)
- [Video Playlist: Apache Iceberg Lakehouse Engineering](https://youtube.com/playlist?list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe&si=KpoHVyW6LysdIFkI)

## Apache Iceberg Features

Data Lakehouse table formats such as Apache Iceberg, Apache Hudi, and Delta Lake provide essential features for enabling ACID transactions on data lakes along with Schema evolution and Time Travel, which allows querying historical versions of tables. However, Apache Iceberg offers a variety of unique features:

- **Partition Evolution**: Apache Iceberg tracks the history of partitioning in the `metadata.json` file, enabling tables to change their partitioning scheme without rewriting the entire dataset and metadata. This cost-saving feature adds flexibility to table management.

- **Hidden Partitioning**: Apache Iceberg tracks partitions not only by the raw value of a column but also by transformed values. This approach eliminates the need for extra columns dedicated to partitioning and reduces the need for additional predicates in queries, simplifying partition implementation and minimizing full table scans.

- **Table Level Versioning**: Iceberg's metadata not only tracks snapshots of a table within a single table history but also supports branching versions of a table. This capability allows for isolated work and experimentation on a single table.

- **Catalog Level Versioning**: An open source project, Nessie, introduces versioning at the catalog level, enabling branching and tagging semantics across multiple tables. This feature supports multi-table transactions, rollbacks, and reproducibility.

### Additional Resources

- [Blog: What is Nessie?](https://www.dremio.com/blog/what-is-nessie-catalog-versioning-and-git-for-data/)
- [Blog: Hidden Partitioning](https://www.dremio.com/subsurface/fewer-accidental-full-table-scans-brought-to-you-by-apache-icebergs-hidden-partitioning/)
- [Blog: Partition Evolution](https://www.dremio.com/subsurface/future-proof-partitioning-and-fewer-table-rewrites-with-apache-iceberg/)

## The Apache Iceberg Ecosystem

One of the most significant advantages of Apache Iceberg is its open and extensive vendor and developer ecosystem.

- **Development Transparency**: The development of the platform is conducted transparently via public Slack channels, mailing lists, and Google Meet communications. This openness allows anyone to participate and contribute to the evolution of the format, ensuring it meets the needs of the community rather than favoring any specific vendor.

- **Vendor Support**: Unlike most table formats that offer tools for reading and writing tables, Apache Iceberg is distinct in having a variety of vendors who manage your tables (including table optimization and garbage cleanup). Notable vendors include Dremio, Upsolver, Tabular, AWS, and others, providing an ecosystem that prevents vendor lock-in.

- **Open Catalog Specification**: Apache Iceberg features an open catalog specification that enables any vendor or open-source project to develop diverse catalog solutions. These solutions are readily supported by the ecosystem of Iceberg tools, fostering robust innovation beyond the table specification itself.

### Additional Resources

- [Video: Exploring the Apache Iceberg Ecosystem](https://www.youtube.com/watch?v=QdLt3z_Vgfs&pp=ygUYQXBhY2hlIEljZWJlcmcgZWNvc3lzdGVt)
- [Blog: Comparison of Table Format Governance](https://www.dremio.com/subsurface/table-format-governance-and-community-contributions-apache-iceberg-apache-hudi-and-delta-lake/)

## Getting Hands-on

### Tutorials that can be done from your laptop without cloud services

- [End-to-End Basic Data Engineering Tutorial (Spark, Dremio, Superset)](https://amdatalakehouse.substack.com/p/end-to-end-basic-data-engineering)
- [From Postgres to Dashboards with Dremio and Apache Iceberg](https://www.dremio.com/blog/from-postgres-to-dashboards-with-dremio-and-apache-iceberg/)
- [From SQLServer to Dashboards with Dremio and Apache Iceberg](From SQLServer to Dashboards with Dremio and Apache Iceberg)
- [From MongoDB to Dashboards with Dremio and Apache Iceberg](https://www.dremio.com/blog/from-mongodb-to-dashboards-with-dremio-and-apache-iceberg/)
- [Intro to Dremio, Nessie, and Apache Iceberg on Your Laptop](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/)
- [Using Flink with Apache Iceberg and Nessie](https://www.dremio.com/blog/using-flink-with-apache-iceberg-and-nessie/)
- [Getting Started with Project Nessie, Apache Iceberg, and Apache Spark Using Docker](https://www.dremio.com/blog/getting-started-with-project-nessie-apache-iceberg-and-apache-spark-using-docker/)

### Tutorials that require cloud services

- [How to Convert JSON Files Into an Apache Iceberg Table with Dremio](https://www.dremio.com/blog/how-to-convert-json-files-into-an-apache-iceberg-table-with-dremio/)
- [How to Convert CSV Files into an Apache Iceberg table with Dremio](https://www.dremio.com/blog/how-to-convert-csv-files-into-an-apache-iceberg-table-with-dremio/)
- [Run Graph Queries on Apache Iceberg Tables with Dremio & Puppygraph](https://www.dremio.com/blog/run-graph-queries-on-apache-iceberg-tables-with-dremio-puppygraph/)
- [BI Dashboards with Apache Iceberg Using AWS Glue and Apache Superset](https://www.dremio.com/blog/bi-dashboards-with-apache-iceberg-using-aws-glue-and-apache-superset/)
- [Streaming and Batch Data Lakehouses with Apache Iceberg, Dremio and Upsolver](https://www.dremio.com/blog/streaming-and-batch-data-lakehouses-with-apache-iceberg-dremio-and-upsolver/)
- [Git for Data with Dremio’s Lakehouse Catalog: Easily Ensure Data Quality in Your Data Lakehouse](https://www.dremio.com/blog/managing-data-as-code-with-dremio-arctic-easily-ensure-data-quality-in-your-data-lakehouse/)
- [How to Create a Lakehouse with Airbyte, S3, Apache Iceberg, and Dremio](https://www.dremio.com/blog/how-to-create-a-lakehouse-with-airbyte-s3-apache-iceberg-and-dremio/)