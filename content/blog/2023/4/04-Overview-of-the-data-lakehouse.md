---
noteId: "d6eea4e0d3ec11ed8fd1ed948fd51e27"
tags: []
title: "Overview of the Data Lakehouse, Dremio and Apache Iceberg"
date: "2023-04-05T12:12:03.284Z"
description: "Understanding the Cutting Edge of Data Engineering"

---

In this article, I hope clarify the who, what, why, and how of:
- The Data Lakehouse
- Dremio
- Apache Iceberg

If you are looking for a more general overview of the data landscape, [check out this article I wrote about the data world at a high level](https://dev.to/alexmercedcoder/introduction-to-the-world-of-data-oltp-olap-data-warehouses-data-lakes-and-more-2me7).

## The Data Lakehouse

### What is the Data Lakehouse?

Before the concept of a data lakehouse, you had two different patterns:

- **Data Lake**: Using a relatively affordable storage solution like a Hadoop Cluster or Object Storage to be the main dumping ground of your data. You'd then move some of this data into a data warehouse for high-priority work and use a data lake query engine to ad-hoc query the remaining data on the lake. Affordable and flexible, but often had difficulty with performance and ease of use.

- **Data Warehouse**: Putting structured data in a database optimized for analytical workloads. Data Warehouses provided performance and ease of use but came with a hefty price tag, along with often having your data stuck in their available toolsets.

The data lakehouse arises from trying to combine the best of both worlds:
- affordability
- flexibility
- performance
- ease of use

You get affordability and flexibility by taking full ownership of your data, using your data lake storage solution as the place where the data will live. Solutions like object storage are not just cheaper, but running your workloads directly from them means you won't have to duplicate your data, and the cost of migration between tools is minimal as the data has no need to move.

You get ease of use and performance based on the modular abstraction you build on top of that data lake storage. Essentially different layers which different tools can interchangeably fill. The Layers are like so:

| Layer | Purpose |
|-------|---------|
| Storage | Where the data is stored (HDFS/Object Storage)|
| File Format | How the data is stored (Parquet/ORC/AVRO) |
| Table Format | Metadata that tools can use to treat your data like database tables (Apache Iceberg/Delta Lake/Apache Hudi) |
| Catalog + Semantic Layer | Tools for tracking what tables exist, documenting them, organizing them, controlling their access (Dremio Arctic/AWS Glue/Tabular/Onehouse/Select */Cube) |
| Query Engine | A tool that can run analytical workloads on the datasets visible through the catalogs it connects to (Dremio Sonar/Presto/Trino)|

So, instead of using a database or data warehouse that abstracts all these layers, leaving you stuck inside, the lakehouse lets you use any and as many tools at each layer as you like (you can use more than one).

## Dremio

### What is Dremio?

Dremio is a data lakehouse platform; it provides a lot of the tools necessary to fill in many of those data lakehouse layers.

1. It is a query engine that can read/write Apache Iceberg tables and read Delta Lake tables on your data lake (along with many other file formats like CSV, JSON, Parquet and more)
2. It has a built-in catalog and semantic layer to unify data on your lake with data in other places like data warehouses (Snowflake) and databases (MySQL, Postgres) so you can document, govern access and organize the data in one place for self-service access. (self-service = making it easy for end users to figure out what data they have access to and how to use it)
3. A high performance query engine for querying the data on your data lake (it's fast)

Essentially Dremio is an all-purpose tool for making your data lake or data lakehouse story easier, faster or more open meaning:

- **Easier**: Dremio's semantic layer makes your data self-service and easy to govern.
- **Faster**: Dremio's query engine allows you to query the data on your lake very fast and to [go faster at the flip of a switch with Dremio's Data Reflections feature](https://www.youtube.com/watch?v=K81CybjU4G8).
- **Open**: A high-performance query engine for querying the data on your data lake (it's fast)

### What is Dremio Cloud and Dremio Software

Dremio has two deployment models:
1. Self-deployment (maintain your own Dremio cluster on-prem or in the cloud)
2. Cloud SaaS Product (sign up in minutes for Dremio cloud)

The self-deployment model makes sense if:
- Due to internal or external rules, you can't use a cloud service
- Your data is currently on-prem
- You need custom connectors (large library of community connectors available for Dremio Software)
- You are using a cloud service not yet supported by Dremio Cloud

Cloud SaaS makes sense if:
- You use primarily one of the cloud services supported by Dremio Cloud
- You don't want to have to maintain a cluster
- You want access to Dremio Arctic (more on this soon)
- You prefer SaaS 

![Choosing a Dremio Deployment Model](https://i.imgur.com/ZSQVNvl.jpg)

Either deployment model has a way of evaluating it for free (You still have to pay for any associated cloud infrastructure):
- You can deploy [Dremio Community Edition](https://www.dremio.com/get-started-dremio-software/) to try out Dremio software today.
- You can [sign up for Dremio Cloud in minutes](https://www.dremio.com/sign-up/) and use it for free.

You can use Dremio today at no cost, and if you want to expand your use of Dremio to enterprise levels, reach out and Dremio will help assess your use case so you find the right solution.

### Why use Dremio

There are many benefits to choosing Dremio to be part of your data lakehouse story:

- You get a Semantic Layer & Query Engine in one tool, instead of paying for them seperately
- [It's performant](https://www.youtube.com/watch?v=CyhzXVLMMUE), especially when querying [data lake storage](https://www.youtube.com/watch?v=AyjYeOXwI6U)
- [Dremio's Semantic Layer can transform how your data is managed](https://www.youtube.com/watch?v=iz-PMYkzwyE) and reduce the number of copies that get generated
- Using Dremio's open access, it makes it easy to build data applications on top of it for any purpose.

### Common Dremio Use Cases

1. Migration from On-Prem Hadoop to Cloud Object Storage

![Migrating from On-Prem to Cloud with Dremio](https://i.imgur.com/d7Xz7NN.png)

2. Architecting a Data Mesh

![Creating a Data Mesh with Dremio](https://i.imgur.com/d2aO1Xk.jpg)

3. Accelerating your On-Prem or Cloud Data Lake

4. Unifying Your Data for Self-Service Access

![Unifying Data with Dremio](https://i.imgur.com/WvoI2qh.jpg)

5. Building Analytics Application (pulling data via REST/ARROW/JDBC from Dremio into your application)

6. Data Warehouse Offload (move some of that work to the data lakehouse and lower your costs)

### What is Sonar and Arctic

In the Dremio Cloud world, there are two products:

- Dremio Sonar, the query engine + semantic layer. Dremio Software is analogous to Dremio Sonar. This is probably what most people are referring to when they say "Dremio".

- Dremio Arctic is the intelligent metastore for Iceberg tables (Dremio Cloud Only). This is a [Project Nessie-powered Iceberg Catalog as a Service](https://projectnessie.org/tools/sql/). It provides you the catalog-level commits, branches and merging that are core to Nessie and automated table optimization services. So while you can query Iceberg tables from other catalogs with Dremio Sonar, tables in Arctic can be auto-optimized, branched and merged from any tool that supports connecting to Nessie Iceberg catalogs (Dremio Sonar, Presto, Flink, Spark, and more).

![Dremio Sonar & Dremio Arctic](https://i.imgur.com/sm7XHci.png)

## Apache Iceberg

### What is Apache Iceberg

Apache Iceberg is a data lakehouse table format that allows tools like Dremio and others to look at the data in your data lake storage as if they were tables in a database. Apache Iceberg is a standard specification for writing and reading table metadata that many tools have adopted (Dremio, Snowflake, Trino, Fivetran, AWS, Google Cloud, etc.)

Dremio, in particular, uses Apache Iceberg not just as a format you can write and read data from but as a performance lever in its data reflections feature. Dremio also provides the Nessie-powered Arctic catalog.

An Apache Iceberg Catalog is essentially a directory of Iceberg tables you've created with a reference to where their metadata exists. With an Iceberg catalog, you can take your Iceberg tables to any tool that supports that catalog. For example, if I have 10 tables in my Dremio Arctic catalog, I can do work on those tables with tools like Dremio Sonar, Apache Spark, Apache Flink, Presto and more. An Iceberg catalog makes your tables easily portable from tool to tool. The Dremio Arctic catalog has the additional benefits of Data as Code features (branching/merging) and automated table optimization.

![Apache Iceberg Catalog - Dremio Arctic](https://i.imgur.com/GkoBlmD.png)

Learn more about Apache Iceberg at this [Apache Iceberg 101 Article](https://www.dremio.com/blog/apache-iceberg-101-your-guide-to-learning-apache-iceberg-concepts-and-practices/)

![Learn More About Apache Iceberg](https://i.imgur.com/0oQpgwG.png)
