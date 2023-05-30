---
tags:
  - "data engineering"
  - "data lakehouse"
  - "dremio"
author: "Alex Merced"
title: "What is Nessie and Why as a Data Engineer or Architect you should care?"
date: "2023-05-30T12:12:03.284Z"
category: "data engineering"
bannerImage: "/images/postbanner/2023/nessie-matters.png"

---

We need to establish a few things to understand why the open-source data catalog, Project Nessie, matters so much.

## Why do Data Lakehouses Matter?

The amount of data and use cases for that data are exploding faster than any single tool can develop sufficient support for. However, many tools support different use cases like BI, Machine Learning, Analytical Applications and more. It can be cumbersome and expensive to have to store data on each platform to get access to each tool set and, on top of that, keep that in sync and governed.

The solution is to separate the storage and maintenance of the physical data in open formats like Apache Parquet (Format for the raw files) and Apache Iceberg (Format to track groups of files as tables) and tools can separately develop to work with that format so you can use the tool you need for the particular job.

The open storage layer many have already been using is the data lake. It makes sense to extend this layer to have those data warehouse capabilities, and this pattern is called a data lakehouse.

![The Basic View of a Data Lakehouse](https://i.imgur.com/a9839hL.png)

## Why does Apache Iceberg matter?

To enable data warehouse-like functionality, which includes ACID Transactions, time travel, disaster recovery, and table evolution, an abstraction layer was needed over our raw data files so compute engines can see groups of files as a table in the same way you'd experience tables in a data warehouse. The abstraction layer is a table format, a layer of metadata that helps engines understand several things:

- The design of the table (schema, partitioning)
- History of the Table and ACID Transaction (snapshot isolation and optimistic concurrency control)
- Allow the table to evolve its schema and partition

This is the space where Apache Iceberg works with a unique design enabling many unique features, an open community with transparent development and vast ecosystem adoption with various ingestion and query tools either releasing or developing support for the format.

### Here is some further reading on Apache Iceberg:

- [Apache Iceberg 101](https://www.dremio.com/blog/apache-iceberg-101-your-guide-to-learning-apache-iceberg-concepts-and-practices/)
- [Apache Iceberg FAQ](https://www.dremio.com/blog/apache-iceberg-faq/)
- [Apache Iceberg Overview Video - May 2023](https://www.youtube.com/watch?v=qozYWn6jk28)

While Apache Iceberg tables are great, you still need a way of bundling up your tables together so different tools can discover and work with your tables.

## Why does Project Nessie Matter?

To bundle and make tables discoverable is the job of a data catalog and several data catalog mechanisms for Apache Iceberg tables, including JDBC, AWS Glue, Hive, DynamoDB,  and Hadoop, which all make your table discoverable but don't go beyond that. With the open standard Apache Iceberg REST catalog spec, you can implement your own catalog without creating client libraries. Still, only some people will want to implement a custom catalog.

Project Nessie provides an open-source implementation of catalog that goes beyond making your tables discoverable into territory known as "Data-as-Code" enabling patterns similar to those used in software development. How does Nessie do this?

What Nessie does differently is that it not only tracks the current metadata location of your Apache Iceberg tables but maintains a commit history of your entire catalog, which like git can be branched, tagged and merged enabling:

- Isolation of ETL on a branch
- Executing Queries on Multiple tables and publishing them simultaneously
- Rolling back the entire catalog
- Tagging the particular state of the entire catalog
- The ability to establish access control rules that travel with the catalog, not the engine

Nessie brings all these features to compute engines that support the Nessie catalog, such as Dremio, Spark, Flink, Presto, Trino and more.

Even better, you can get a cloud-managed Nessie catalog through the Dremio Arctic service that also brings:

- Intuitive UI to manage catalog branches commits and merges
- Automated table maintenance operations
- Additional portable governance features

### Resources for Learning more about Nessie/Arctic: 

- [Data as Code Demo Video](https://www.youtube.com/watch?v=JCpWfsu-liw&t=684s&pp=ygURRGF0YSBhcyBDb2RlIERlbW8%3D)
- [Intro to Data as Code Article/Tutorial](https://www.dremio.com/blog/managing-data-as-code-with-dremio-arctic-easily-ensure-data-quality-in-your-data-lakehouse/)
- [Intro to Nessie with Spark](https://www.dremio.com/blog/getting-started-with-project-nessie-apache-iceberg-and-apache-spark-using-docker/)
- [Intro to Nessie with Jupyter Notebook](https://www.dremio.com/blog/a-notebook-for-getting-started-with-project-nessie-apache-iceberg-and-apache-spark/)
- [Multi-Table Transactions Tutorial](https://www.dremio.com/blog/multi-table-transactions-on-the-lakehouse-enabled-by-dremio-arctic/)
- [Data as Code: ML Reproducability](https://www.dremio.com/blog/managing-data-as-code-with-dremio-arctic-support-machine-learning-experimentation-in-your-data-lakehouse/)

![A Fleshed Out Data Lakehouse](https://i.imgur.com/5Jv0dh7.png)