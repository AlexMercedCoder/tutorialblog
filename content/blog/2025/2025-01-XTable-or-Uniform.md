---
title: When to use Apache Xtable or Delta Lake Uniform for Data Lakehouse Interoperability
date: 2025-01-07
description: "A Guide on when to use Apache Xtable or Delta Lake Uniform for Data Lakehouse Interoperability"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - apache iceberg
  - apache hudi
  - delta lake
  - dremio
---

- [Blog: What is a Data Lakehouse and a Table Format?](https://www.dremio.com/blog/apache-iceberg-crash-course-what-is-a-data-lakehouse-and-a-table-format/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=xtable-uniform&utm_content=alexmerced&utm_term=external_blog)
- [Free Copy of Apache Iceberg the Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=xtable-uniform&utm_content=alexmerced&utm_term=external_blog)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=xtable-uniform&utm_content=alexmerced&utm_term=external_blog)
- [Lakehouse Catalog Course](https://hello.dremio.com/webcast-an-in-depth-exploration-on-the-world-of-data-lakehouse-catalogs-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=xtable-uniform&utm_content=alexmerced&utm_term=external_blog)
- [Iceberg Lakehouse Engineering Video Playlist](https://www.youtube.com/watch?v=SIriNcVIGJQ&list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe)


The value of the [lakehouse model](https://www.datalakehousehub.com), along with the concept of "shifting left" by moving more data modeling and processing from the data warehouse to the data lake, has seen significant buy-in and adoption over the past few years. A lakehouse integrates data warehouse functionality into a data lake using open table formats, offering the best of both worlds for analytics and storage. 

Enabling lakehouse architecture with open table formats like Apache Iceberg, Delta Lake, Apache Hudi, and Apache Paimon has introduced the need to manage interoperability between these formats, especially at the boundaries of data systems. While many lakehouse implementations operate seamlessly with a single table format, scenarios arise where multiple formats are involved. To address these challenges, several solutions have emerged.

In this blog, we will explore these solutions and discuss when it makes sense to use them.

## The Solutions

There are primarily two types of interoperability solutions for working across different table formats:

### 1. Mirroring Metadata

These solutions focus on maintaining metadata for the same data files in multiple formats, enabling seamless interaction across systems.

**Apache XTable:**  
An open-source project initially developed at Onehouse and now managed by the community, Apache XTable enables bi-directional metadata conversion between different table formats. It includes incremental metadata update features, ensuring efficiency and consistency. For Iceberg, XTable generates the metadata, which can then be registered with your preferred catalog.

**Delta Lake Uniform:**  
A feature of the Delta Lake format, Delta Lake Uniform allows you to natively write to Delta Lake tables while maintaining a secondary metadata set in Iceberg or Hudi. For Iceberg, it can sync these tables to a Hive Metastore or Unity Catalog. When used with Unity Catalog, these tables can also be exposed for reading through an Iceberg REST Catalog interface, enabling greater flexibility and integration.

### 2. Data Unification Platforms

Unified Lakehouse Platforms like **Dremio** or open-source query engines such as **Trino** provide another solution by allowing queries across multiple formats without requiring metadata conversion. This approach enables various table formats to coexist while being queried seamlessly.

**Dremio’s Advantage with Apache Arrow and Reflections:**  
Dremio leverages the power of Apache Arrow to enable in-memory columnar processing, delivering greater performance to Trino. Additionally, Dremio’s **Reflections** feature provides pre-aggregated, incremental materializations that significantly accelerate query response times especially when paired with Apache Iceberg tables. With its built-in semantic layer, Dremio ensures uniform data models that can be consistently utilized across different teams and tools. This capability enables seamless collaboration, allowing data engineers, analysts, and BI tools to consume data efficiently without requiring duplicate efforts for model creation or maintenance.

## The Use Cases and Which Solution to Use

### 1. Joining Delta Lake Tables with On-Prem Data

If you're a Databricks user leveraging the Databricks ecosystem and its features but also have on-premises data you'd like to incorporate into certain workflows, a hybrid tool like **Dremio** can help. Dremio enables you to read Delta Lake tables directly from cloud storage and federate queries with your on-prem data. However, this approach bypasses the governance settings in Unity Catalog and doesn’t take full advantage of Dremio's powerful acceleration features, such as **Live Reflections** and **Incremental Reflections**. 

A better option is to connect Dremio to Unity Catalog tables and read the Uniform Iceberg version of the metadata. This allows you to maintain Unity Catalog governance while also leveraging Dremio’s advanced acceleration capabilities for optimized query performance.

### 2. Streaming with Hudi and Reading as Iceberg/Delta

Apache Hudi is widely used for low-latency, high-frequency upserts in streaming use cases. However, when it comes to consuming this data, broader read support exists for Iceberg and Delta Lake. This is an ideal scenario for **Apache XTable**, which can handle a continuous, one-way incremental metadata conversion. As data lands in Hudi, XTable can write new metadata in the preferred format, such as Iceberg or Delta, ensuring seamless consumption.

### 3. Using Snowflake and Databricks Side by Side

Snowflake in 2024 announce Polaris which has since become a community-run Incubating Apache project. Snowflake offers a managed Polaris service called **Open Catalog**. Apache Polaris features the ability to connect "external catalogs." This functionality allows Snowflake to read tables from other Iceberg REST Catalog-compliant systems, such as **Nessie**, **Gravitino**, **Lake Keeper**, **AWS Glue**, and **Unity Catalog** directly from Polaris. 

By connecting Unity Catalog as an external catalog, you can utilize **Uniform-enabled tables** from Delta Lake alongside other datasets within Snowflake, enabling seamless interoperability between Snowflake and Databricks environments.

### 4. Migrating Between Formats

If you're looking to migrate between table formats without rewriting all your data, **Apache XTable** stands out as the optimal solution. XTable enables smooth transitions allowing you to adopt a new format with minimal disruption to your existing workflows.

## Limitations to Keep in Mind

When using a mirrored metadata approach to interoperability, there are certain trade-offs to be aware of. One key limitation is the loss of write-side optimizations specific to the secondary format, such as **hidden partitioning** in Iceberg or **deletion vectors** in Delta Lake. Below is a list of specific limitations when using Uniform or XTable:

- **Uniform-enabled Delta Lake tables** do not currently support **Liquid Clustering**.
- **Deletion Vectors** cannot be utilized with Uniform-enabled Delta Lake tables.
- **XTable** supports only **Copy-on-Write** or **Read-Optimized Views** of tables.
- XTable has **limited support** for Delta Lake's **Generated Columns**.

## Conclusion

As organizations increasingly adopt lakehouse architectures, interoperability across multiple table formats has become a critical need. Solutions like **Apache XTable** and **Delta Lake Uniform** offer powerful ways to manage metadata and facilitate collaboration between different systems. Whether you're joining Delta Lake tables with on-premises data, leveraging Hudi for streaming, integrating Snowflake with Databricks, or migrating between formats, these tools provide flexibility and efficiency.

However, it’s important to evaluate the limitations of each approach to ensure it aligns with your use case. While mirrored metadata solutions simplify interoperability, they come with trade-offs, particularly on the write-side optimizations of the secondary format. By understanding these constraints and leveraging platforms like **Dremio** for advanced query acceleration and data unification, you can make informed decisions and maximize the potential of your lakehouse ecosystem.

- [Blog: What is a Data Lakehouse and a Table Format?](https://www.dremio.com/blog/apache-iceberg-crash-course-what-is-a-data-lakehouse-and-a-table-format/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=xtable-uniform&utm_content=alexmerced&utm_term=external_blog)
- [Free Copy of Apache Iceberg the Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=xtable-uniform&utm_content=alexmerced&utm_term=external_blog)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=xtable-uniform&utm_content=alexmerced&utm_term=external_blog)
- [Lakehouse Catalog Course](https://hello.dremio.com/webcast-an-in-depth-exploration-on-the-world-of-data-lakehouse-catalogs-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=xtable-uniform&utm_content=alexmerced&utm_term=external_blog)
- [Iceberg Lakehouse Engineering Video Playlist](https://www.youtube.com/watch?v=SIriNcVIGJQ&list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe)
