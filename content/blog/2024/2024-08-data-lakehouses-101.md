---
title: Data Lakehouse 101 - The Who, What and Why of Data Lakehouses
date: "2024-08-05"
description: "The Who, What and Why of Data Lakehouses"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
---

- [Sign-up for this free Apache Iceberg Crash Course](https://bit.ly/am-2024-iceberg-live-crash-course-1)
- [Get a free copy of Apache Iceberg the Definitive Guide](https://bit.ly/am-iceberg-book)

The scale of data is growing every day, with storage now reaching petabyte and exabyte levels that need to be utilized in increasingly diverse ways. This evolution's cost and practicality make the old paradigm—using data lakes to store both structured and unstructured data, then moving portions of that structured data into data warehouses for reporting, analytics, dashboards, and more—full of friction. The friction arises from storing multiple copies of data for each system used, keeping this data in sync and consistent, and delivering it at the high speeds modern data needs demand. Addressing these challenges is where a new architecture called data lakehouses comes into play.

## WHAT is a Data Lakehouse?

A data lakehouse aims to bring the performance and ease of use of a data warehouse to the data already stored in your data lake. It establishes your data lake (a storage layer for storing data as files) as the source of truth, with the goal of keeping the bulk of your data on the lake. This is made possible through several key technologies:

- **Apache Parquet**: A binary columnar file format for fast analytics on datasets, used for storing structured data.

- **Apache Iceberg**: An open lakehouse table format, a standard for reading and writing metadata that allows for consistent recognition of a group of Parquet files as a table. This enables tools to treat datasets across multiple Parquet files as singular database-like tables with features such as time travel, schema evolution, partition evolution, and ACID guarantees.

- **Open Source Catalogs (e.g., Nessie and Polaris)**: These technologies allow you to track the tables that exist in your data lakehouse, ensuring any tool can have immediate awareness of your entire library of datasets.

By using a storage layer like Hadoop or object storage and leveraging the technologies above, you can construct a data lakehouse, which can also be thought of as:

- A modern data lake
- A headless data warehouse
- A deconstructed data warehouse
- A modular data platform

At this point, you can use various tools like Dremio, Snowflake, Apache Spark, Apache Flink, and more to run workloads on your data lakehouse without duplicating your data across each platform you use.

```
            +----------------------------+
            |      Data Lakehouse        |
            +----------------------------+
                           |
           +------------------------------------+
           |           Storage Layer            |
           |  (Hadoop, Object Storage, etc.)    |
           +------------------------------------+
                           |
           +------------------------------------+
           |         File Formats               |
           |      (Apache Parquet, etc.)        |
           +------------------------------------+
                           |
           +------------------------------------+
           |           Table Formats            |
           |      (Apache Iceberg, etc.)        |
           +------------------------------------+
                           |
           +------------------------------------+
           |         Metadata Catalogs          |
           |      (Nessie, Polaris, etc.)       |
           +------------------------------------+
                           |
           +------------------------------------+
           |         Data Processing            |
           | (Dremio, Snowflake, Apache Spark,  |
           |        Apache Flink, etc.)         |
           +------------------------------------+

```

## WHY a data lakehouse?

Transitioning to a data lakehouse architecture offers significant advantages, particularly by reducing the need for multiple copies of your data. Traditional data architectures often require creating separate copies of data for different systems, leading to increased storage costs and complexities in data management. A data lakehouse centralizes your data storage, allowing various tools and applications to access the same data without duplication. This not only simplifies data governance and consistency but also reduces the storage overhead, resulting in substantial cost savings.

Moreover, a data lakehouse facilitates seamless toolset migration and concurrent use of multiple tools without incurring high migration costs. By leveraging open standards and interoperable technologies like Apache Iceberg and open-source catalogs, you can easily switch between different data processing and analytics tools such as Dremio, Snowflake, Apache Spark, and Apache Flink without needing to move or transform your data. This flexibility reduces the total cost of ownership, as you avoid the egress fees and compute expenses associated with transferring data between platforms. Consequently, you can achieve lower overall compute, storage, and egress costs, while simultaneously benefiting from the strengths of various tools operating on the same unified dataset.

## HOW to Migrate to a Data Lakehouse

Migrating from existing systems to a data lakehouse is a process where [Dremio, the data lakehouse platform](https://www.dremio.com/solutions/data-lakehouse/), truly excels, thanks to its data virtualization features. Dremio provides an easy-to-use interface across all your data, wherever it resides. If Dremio supports your legacy and new data systems, you can follow this migration pattern to ensure a smooth transition.

### Step 1: Apply Dremio Over Your Legacy System

Begin by implementing Dremio on top of your existing legacy system. This initial step offers immediate ease-of-use and performance improvements, allowing your teams to familiarize themselves with workflows that will persist throughout the migration process. This approach ensures minimal disruption, as teams can continue their operations seamlessly.

### Step 2: Connect Both Old and New Data Systems to Dremio

Next, connect both your legacy and new data systems to Dremio. Start migrating data to your data lakehouse while maintaining minimal disruption to your end users, who will continue using Dremio as their unified interface. This dual connection phase enables a smooth transition by ensuring that data is accessible and manageable from a single point, regardless of its location.

### Step 3: Retire Old Systems After Data Migration
Once the data migration is complete, you can retire your old systems. Thanks to Dremio's unified interface, this step involves no major disruptions. Users will continue to access data seamlessly through Dremio, without adapting to new systems or interfaces. This continuity ensures that your operations remain efficient and uninterrupted.

Dremio's power lies in providing a central, unified interface across all your data lakes, data warehouses, lakehouse catalogs, and databases. This means your end users don't have to worry about where the data lives, allowing them to focus on deriving insights and driving value from the data.

```
+-------------------------------------------------------+
|           Migration to a Data Lakehouse               |
+-------------------------------------------------------+
|                                                       |
| Step 1: Apply Dremio Over Legacy System               |
|   +---------------------------------------------+     |
|   |          Legacy System                      |     |
|   |---------------------------------------------|     |
|   |                                             |     |
|   | +-------------+    +-------------+          |     |
|   | |  Data Store |    |  Data Store |          |     |
|   | +-------------+    +-------------+          |     |
|   +---------------------------------------------+     |
|                         |                             |
|                         |                             |
|                         v                             |
|                  +-------------+                      |
|                  |    Dremio   |                      |
|                  +-------------+                      |
|                                                       |
+-------------------------------------------------------+
|                                                       |
| Step 2: Connect Both Old and New Systems to Dremio    |
|   +---------------------------------------------+     |
|   |          Legacy System                      |     |
|   |---------------------------------------------|     |
|   |                                             |     |
|   | +-------------+    +-------------+          |     |
|   | |  Data Store |    |  Data Store |          |     |
|   | +-------------+    +-------------+          |     |
|   +---------------------------------------------+     |
|                         |                             |
|                         v                             |
|                  +-------------+                      |
|                  |    Dremio   |                      |
|                  +-------------+                      |
|                         |                             |
|                         v                             |
|   +---------------------------------------------+     |
|   |           New Data Lakehouse                |     |
|   |---------------------------------------------|     |
|   |                                             |     |
|   | +-------------+    +-------------+          |     |
|   | |  Data Store |    |  Data Store |          |     |
|   | +-------------+    +-------------+          |     |
|   +---------------------------------------------+     |
|                                                       |
+-------------------------------------------------------+
|                                                       |
| Step 3: Retire Old Systems After Data Migration       |
|   +---------------------------------------------+     |
|   |           New Data Lakehouse                |     |
|   |---------------------------------------------|     |
|   |                                             |     |
|   | +-------------+    +-------------+          |     |
|   | |  Data Store |    |  Data Store |          |     |
|   | +-------------+    +-------------+          |     |
|   +---------------------------------------------+     |
|                         |                             |
|                         v                             |
|                  +-------------+                      |
|                  |    Dremio   |                      |
|                  +-------------+                      |
|                                                       |
+-------------------------------------------------------+

```

## When Should you go for a data lakehouse?

Moving to a data lakehouse or staying with your existing systems depends on several critical factors. Here are key parameters to consider:

### 1. Data Volume and Growth
- **Current Data Volume**: Assess the data you currently manage. A data lakehouse might offer better scalability if you are already dealing with petabytes of data.
- **Projected Data Growth**: Consider future data growth. If you expect a significant increase in data volume, a data lakehouse can provide the necessary infrastructure to handle it efficiently.

### 2. Data Complexity
- **Structured vs. Unstructured Data**: Evaluate the types of data you store. A data lakehouse is ideal for environments that handle a mix of structured and unstructured data.
- **Data Sources**: Determine the number of data sources you integrate. A data lakehouse can simplify management and access to diverse data sources.

### 3. Performance Needs
- **Query Performance**: If your current system struggles with slow query performance, a data lakehouse can offer improved speed and efficiency through optimized storage formats and indexing.
- **Real-Time Analytics**: Consider if real-time analytics are crucial for your business. Data lakehouses support real-time data processing and analytics, making them suitable for dynamic and fast-paced environments.

### 4. Cost Considerations
- **Storage Costs**: Compare the storage costs of maintaining multiple copies of data in your current system versus a centralized data lakehouse.
- **Compute Costs**: Analyze compute costs associated with your existing architecture. Data lakehouses often provide more cost-effective compute options.
- **Migration Costs**: Factor in the costs of migrating data and operations. Dremio's data virtualization can minimize migration expenses by allowing you to use existing workflows during the transition.

### 5. Tool Compatibility
- **Existing Tools**: Review the tools you currently use. Ensure that they are compatible with a data lakehouse architecture.
- **Future Tools**: Consider future tool requirements. A data lakehouse offers flexibility and interoperability with a wide range of data processing and analytics tools.

### 6. Data Governance and Compliance
- **Data Governance**: Evaluate your data governance needs. Data lakehouses provide robust governance features like metadata management and data lineage tracking.
- **Compliance Requirements**: Ensure that a data lakehouse can meet regulatory compliance standards relevant to your industry.

### 7. Business Objectives
- **Strategic Goals**: Align the decision with your strategic business goals. If agility, scalability, and innovation are priorities, a data lakehouse might be the right choice.
- **User Experience**: Consider the impact on end users. A unified interface through a data lakehouse can simplify data access and enhance user productivity.

By carefully evaluating these parameters, you can decide whether to transition to a data lakehouse or continue with your existing systems. Each organization’s needs are unique, so it’s essential to weigh these factors in the context of your specific requirements and objectives.

## Where can I learn more about Data Lakehouse?

Below are several tutorial you can use to get hands-on with the data lakehouse on your laptop to see this architecture in action so you can then apply it to your own use case.

- [End-to-End Basic Data Engineering Tutorial (Spark, Dremio, Superset)](https://main.datalakehousehub.com/blog/2024-04-end-to-end-data-engineering-tutorial-ingest-dashboards/)
- [Intro to Apache Iceberg, Nessie and Dremio on your Laptop](https://bit.ly/am-dremio-lakehouse-laptop)
- [JSON/CSV/Parquet to Apache Iceberg to BI Dashboard](https://bit.ly/am-json-csv-parquet-dremio)
- [From MongoDB to Apache Iceberg to BI Dashboard](https://bit.ly/am-mongodb-dashboard)
- [From SQLServer to Apache Iceberg to BI Dashboard](https://bit.ly/am-sqlserver-dashboard)
- [From Postgres to Apache Iceberg to BI Dashboard](https://bit.ly/am-postgres-to-dashboard)
- [Mongo/Postgres to Apache Iceberg to BI Dashboard using Git for Data and DBT](https://bit.ly/dremio-experience)
- [Elasticsearch to Apache Iceberg to BI Dashboard](https://bit.ly/am-dremio-elastic)
- [MySQL to Apache Iceberg to BI Dashboard](https://bit.ly/am-dremio-mysql-dashboard)
- [Apache Kafka to Apache Iceberg to Dremio](https://bit.ly/am-kafka-connect-dremio)
- [Apache Iceberg Lakehouse Engineering Video Playlist](https://bit.ly/am-iceberg-lakehouse-engineering)
- [Apache Druid to Apache Iceberg to BI Dashboard](https://bit.ly/am-druid-dremio)
- [Postgres to Apache Iceberg to Dashboard with Spark & Dremio](https://bit.ly/end-to-end-de-tutorial)
