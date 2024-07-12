---
title: Databases Deconstructed: The Value of Data Lakhoues and Table Formats
date: "2024-07-12"
description: "Building up the Data Lakehouse"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
---

- [Checkout out my Apache Iceberg Crash Course](https://bit.ly/am-2024-iceberg-live-crash-course-1)
- [Get a free copy of Apache Iceberg the Definitive Guide](https://bit.ly/am-iceberg-book)


Databases and data warehouses are powerful systems that simplify working with data by abstracting many of the inherent challenges, including:

- **Storage:** How data is stored and persisted, what file formats are used, and how those files are managed.
- **Tables:** How we determine which data belongs to which table and what table statistics are tracked internally.
- **Catalog:** How the system keeps track of all the tables so that users can easily access them.
- **Processing:** When a user writes a query, how that query is parsed into relational algebra expressions, transformed into an execution plan, optimized, and executed.

The drawback of having such tightly coupled systems is that the data within them is only understood by that specific system. Therefore, if another system is needed for a particular use case, the data must be migrated and duplicated into that other system. While this is often manageable for transactions (e.g., adding a user, updating a user, recording a sale) as a single database system can handle all CRUD operations (Create, Read, Update, Delete), it becomes more problematic in analytics. Analytical use cases are far more diverse, as are the tools required to support them, making data migration and duplication cumbersome and inefficient.

## Enter the Lakehouse

In analytics, the status quo has been to duplicate your data across multiple systems for different use cases:

- **Data Lakes:** A universal storage layer for structured data in the form of CSV, JSON, ORC, AVRO, and Parquet files, as well as all other unstructured data like images, videos, and audio. Data lakes are often used as a repository for archiving all data and as a place to store the diverse data needed for training AI/ML models that require both structured and unstructured data.

- **Data Warehouses:** Essentially databases designed for analytics. They store and manage structured data with analytics in mind and are usually used as the data source for reports and Business Intelligence dashboards (visual panes built directly on the data).

In an ideal world, you wouldn't need the costs and complexity of duplicating your data across systems and figuring out how to keep it all consistent. This is where the data lakehouse pattern comes in. The data lakehouse is an architectural pattern that essentially builds a deconstructed database using your data lake as the storage layer. The benefit is that structured data can now exist once in your data lake, and both data lakehouse tools and data warehouse tools can access it.

Let's examine the construction of a data lakehouse layer by layer.

## The Storage Layer

The basic foundation of a data lakehouse is the storage layer, where we need to determine where and how to store the data. For the "where," the obvious choice is object storage.

**What is Object Storage?**

Object storage is a data storage architecture that manages data as objects, as opposed to file systems that manage data as a file hierarchy, or block storage which manages data as blocks within sectors and tracks. Each object includes the data itself, a variable amount of metadata, and a unique identifier. This approach is highly scalable, cost-effective, and suitable for handling large amounts of unstructured data.

**Benefits of Object Storage:**

- **Scalability:** Object storage can easily scale out by adding more nodes, making it suitable for growing data needs.
- **Durability and Reliability:** Data is stored redundantly across multiple locations, ensuring high durability and reliability.
- **Cost-Effectiveness:** Often cheaper than traditional storage solutions, especially when dealing with large volumes of data.
- **Metadata Management:** Object storage allows for rich metadata, enabling more efficient data management and retrieval.

We can opt for major cloud vendors like AWS, Azure, and Google Cloud. However, many other storage vendors, such as [NetApp, Vast Data, MinIO, and Pure Storage, provide additional value in object storage solutions](https://www.dremio.com/blog/3-reasons-to-create-hybrid-apache-iceberg-data-lakehouses/) both in the cloud and on-premises.

Next, we need to determine how we will store the data on the storage layer. The industry standard for this is Apache Parquet files.

**What are Apache Parquet Files?**

Apache Parquet is a columnar storage file format optimized for use with big data processing frameworks. It is designed for efficient data storage and retrieval, making it ideal for analytic workloads.

**Why Parquet Files are Good for Analytics:**

- **Efficiency:** Parquet's columnar storage layout allows for efficient data compression and encoding schemes, reducing the amount of data scanned and improving query performance.
- **Compatibility:** Parquet is widely supported by many data processing tools and frameworks, making it a versatile choice for data storage.

**How Row Groups Work in Parquet:**

Parquet files are divided into row groups, subsets of the data that can be processed independently. Each row group contains column chunks, each of which consists of pages. This structure enables efficient reads by allowing queries to skip irrelevant data and read only the necessary columns and rows.

```
+-----------------------------------------------------+
|                     Parquet File                    |
+-----------------------------------------------------+
|                    File Metadata                    |
|                                                     |
| - Schema                                            |
| - Key-Value Metadata                                |
| - Version                                           |
+-----------------------------------------------------+
|                    Row Group 1                      |
|  +-----------------------------------------------+  |
|  |                 Column Chunk 1                |  |
|  |  +-----------------------------------------+  |  |
|  |  |                  Page 1                 |  |  |
|  |  +-----------------------------------------+  |  |
|  |  |                  Page 2                 |  |  |
|  |  +-----------------------------------------+  |  |
|  |  |                  ...                    |  |  |
|  |  +-----------------------------------------+  |  |
|  +-----------------------------------------------+  |
|  +-----------------------------------------------+  |
|  |                 Column Chunk 2                |  |
|  |  +-----------------------------------------+  |  |
|  |  |                  Page 1                 |  |  |
|  |  +-----------------------------------------+  |  |
|  |  |                  Page 2                 |  |  |
|  |  +-----------------------------------------+  |  |
|  |  |                  ...                    |  |  |
|  |  +-----------------------------------------+  |  |
|  +-----------------------------------------------+  |
|  |                     ...                       |  |
|  +-----------------------------------------------+  |
+-----------------------------------------------------+
|                    Row Group 2                      |
|  +-----------------------------------------------+  |
|  |                 Column Chunk 1                |  |
|  |  +-----------------------------------------+  |  |
|  |  |                  Page 1                 |  |  |
|  |  +-----------------------------------------+  |  |
|  |  |                  Page 2                 |  |  |
|  |  +-----------------------------------------+  |  |
|  |  |                  ...                    |  |  |
|  |  +-----------------------------------------+  |  |
|  +-----------------------------------------------+  |
|  +-----------------------------------------------+  |
|  |                 Column Chunk 2                |  |
|  |  +-----------------------------------------+  |  |
|  |  |                  Page 1                 |  |  |
|  |  +-----------------------------------------+  |  |
|  |  |                  Page 2                 |  |  |
|  |  +-----------------------------------------+  |  |
|  |  |                  ...                    |  |  |
|  |  +-----------------------------------------+  |  |
|  +-----------------------------------------------+  |
|  |                     ...                       |  |
|  +-----------------------------------------------+  |
+-----------------------------------------------------+
|                     ...                             |
+-----------------------------------------------------+

```

By establishing a robust storage layer with object storage and using Apache Parquet files for data storage, we create a strong foundation for our data lakehouse. This setup ensures scalability, efficiency, and compatibility, essential for handling diverse and extensive data analytics workloads.

## The Table Format

While Parquet files are excellent for storing data for quick access, datasets can eventually grow large enough to span multiple files. Parquet files are only aware of themselves and are unaware of other files in the same dataset. This puts the analyst responsible for defining the dataset, which can lead to mistakes where a file isn't included or extra files are included, resulting in inconsistent data definitions across use cases. Additionally, engines still need to open every file to execute a query, which can be time-consuming, especially if many files aren't needed for the specific query.

In this case, we need an abstraction that helps do a few things:

- Define which files comprise the current version of the table.
- Maintain a history of the file listings for previous table versions.
- Track file statistics that can be used to determine which files are relevant to a particular query.

This abstraction allows for faster scanning of large datasets and consistent results. It is known as a "table format," a standard for how metadata is written to document the files in the table along with their statistics.

Currently, there are three main table formats: [Apache Iceberg, Apache Hudi, and Delta Lake](https://bit.ly/am-format-arch).

[Apache Iceberg is thought to have recently established itself as the industry standard.](https://blog.iceberglakehouse.com/summarizing-recent-wins-for-apache-iceberg-table-format-56bd60837181?source=collection_home---4------3-----------------------)

## The Catalog 

Now that we have folders with metadata and data that comprise a table, processing tools need a way to know these tables exist and where the metadata for each table can be found. This is where the lakehouse catalog comes into play. A lakehouse catalog can perform several functions:

- **Track Tables:** Keep track of which tables exist in a data lakehouse.
- **Metadata References:** Provide references to the current metadata of each table.
- **Access Governance:** Govern access to the assets it tracks.

The catalog becomes the mechanism for bundling your tables and making them accessible to your preferred data processing tools. Currently, there are four main lakehouse catalogs offering solutions for this layer:

- **Nessie:** An open-source catalog that offers unique catalog-level versioning features for git-like functionality, initially created by Dremio.
- **Polaris:** An open-source catalog created by Snowflake.
- **Unity OSS:** An open-source catalog from Databricks, which is a complete rewrite of their proprietary Unity catalog.
- **Gravitino:** An open-source catalog from Datastrato.

You can efficiently manage and access your data lakehouse tables by leveraging these catalogs, ensuring seamless integration with various data processing tools.

## Data Processing

Now that we have everything needed to store and track our data, we just need a tool to access that data and run queries and transformations for us. One such tool is [Dremio, a data lakehouse platform](https://www.dremio.com/solutions/data-lakehouse/) created to make working with data lakehouses easier, faster, and more open.

### Dremio provides:

- **Unified Analytics:** The ability to connect to data lakes, lakehouse catalogs, databases, and data warehouses, allowing you to work with all your data in one place.
- **SQL Query Engine:** An SQL query engine with industry-leading price/performance that can federate queries across all these data sources, featuring a semantic layer to track and define data models and metrics for fast reporting and business intelligence (BI).
- **Lakehouse Management:** Dremio has deep integrations with Nessie catalogs and an integrated lakehouse catalog that allows you to automate the maintenance of Iceberg tables, ensuring your data lakehouse runs smoothly.

Dremio becomes a powerful tool for unifying and organizing your data into data products for your users. Since your data is in a lakehouse, several tools can be part of the picture. For example, you can use Upsolver, Fivetran, or Airbyte to ingest data into your lakehouse, run graph queries on your lakehouse with Puppygraph, and explore many other possibilities—all without needing multiple copies of your data.

## Conclusion

## Conclusion

We've deconstructed the traditional database and data warehouse systems to highlight the value of data lakehouses and table formats. Databases and data warehouses simplify working with data by abstracting many inherent challenges, such as storage, table management, cataloging, and query processing. However, the tightly coupled nature of these systems often necessitates data duplication across different systems, leading to increased complexity and inefficiency.

The data lakehouse architecture emerges as a solution, offering the best of both data lakes and data warehouses. By leveraging object storage and Apache Parquet files, we establish a robust storage layer that ensures scalability, efficiency, and compatibility. The introduction of table formats like Apache Iceberg, Apache Hudi, and Delta Lake further enhances our ability to manage large datasets effectively.

To manage and track our data, lakehouse catalogs like Nessie, Polaris, Unity OSS, and Gravitino provide essential functionalities such as tracking tables, providing metadata references, and governing access. Finally, tools like Dremio offer potent data processing capabilities, enabling unified analytics, efficient query execution, and seamless lakehouse management.

By adopting a data lakehouse architecture, we can streamline data management, reduce costs, and accelerate time to insight, all while maintaining the flexibility to integrate various tools and technologies.

To learn more about the practical implementation of these concepts, be sure to check out my Apache Iceberg Crash Course and get a free copy of "Apache Iceberg: The Definitive Guide":

- [Check out my Apache Iceberg Crash Course](https://bit.ly/am-2024-iceberg-live-crash-course-1)
- [Get a free copy of Apache Iceberg: The Definitive Guide](https://bit.ly/am-iceberg-book)


## GET HANDS-ON

Below are list of exercises to help you get hands-on with Apache Iceberg to see all of this in action yourself!

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