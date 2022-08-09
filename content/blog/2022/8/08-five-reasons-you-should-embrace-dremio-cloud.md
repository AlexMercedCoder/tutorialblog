---
title: 5 Reasons Your Data Lakehouse should Embrace Dremio Cloud
date: "2022-08-09"
description: "How your data lakehouse can expand what's possible with Dremio Cloud."
author: "Alex Merced"
category: "data lakehouse"
bannerImage: "/images/postbanner/2022/5reasonsdremio.png"
tags:
  - data engineering
  - data lake
  - data lakehouse
---

[Dremio Cloud](https://www.dremio.com/get-started/) makes it easier to enjoy the performance and ease of use often associated with data warehouses. It combines that performance/ease of use with the openness and affordability associated with data lakes, the data lakehouse dream. In this article, I hope to discuss five reasons Dremio Cloud is a tool every data lakehouse should have in its arsenal.

## One - It's Easy

Making the data lake the center of your data analytics up till recently has been a difficult proposition as many tools in the space require complex deployments and extensive configuration before you can even begin using the product. Dremio Cloud makes getting started with a data lakehouse as easy as signing up for email.

- Sign-up with your email, Google, Microsoft or GitHub account
- choose a name for your organization and initial project
- connect your AWS account with a click of a button (Azure and GCP support to eventually be added)
- done

Within a minute or two you can connect your data lake sources which can be data on S3, tables in an AWS Glue catalog, relational databases and more. Now, run queries on your data with the [Dremio Sonar](https://www.dremio.com/platform/sonar/) query engine.

Although, it's not just getting started that is easy but every aspect of Dremio:

- Easily control access to all your data from one place
- Easily control compute scaling to limit costs but also to handle any level of concurrency
- With [Dremio Arctic](https://www.dremio.com/platform/arctic/) catalogs, you can create and merge branches to isolate work on your data with an easy-to-use graphical UI.
- The SQL Editor makes creating the right SQL queries easy with tools to assist in joins, lookup SQL functions, autocomplete, and more.

Bottom Line, Dremio makes Data Lakehouses easy.

## Two - Low Cost

The Dremio cloud platform's standard tier is **forever free**, with no software or licensing costs. The only cost would be the cost of any AWS clusters that exist to execute your queries (an AWS expense, not a Dremio one). Still, with Dremio's intuitive auto-scaling, clusters can be automatically created and scaled when there are workloads to execute and then automatically shut off where there is none, so no bills for unused compute create tremendous savings over other solutions.

Dremio's performance optimizations also save you money by reducing the amount of compute you need to complete queries at scale. As your needs grow, you can upgrade your Dremio Cloud account for advanced security features and enterprise support. Getting started minimizes your costs to their bare minimum while giving you access to the full power of an enterprise-scale platform.

The more workloads you have Dremio execute, the more savings you'll see.

## Three - Fast

Dremio is not only easy and affordable but also blazing fast. At the core of Dremio's performance are three technologies:

- [Apache Arrow](https://www.youtube.com/watch?v=vIqDm8zgaLI): An open source project (to which Dremio is a key contributor) that does several things to help improve the performance of data platforms.
  - Creates a standard columnar in memory format to reduce serialization/deserialization bottlenecks when loading and processing data from columnar file formats like Apache Parquet.
  - Creates a new standard for columnar data transport (Arrow Flight/Arrow Flight SQL) to reduce serialization/deserialization bottlenecks when transporting data between systems for [huge performance benefits over ODBC/JDBC](https://www.youtube.com/watch?v=dQszohqgZbQ).
  - With Apache Arrow Gandiva common operations of arrow formatted data can be pre-compiled to binary for huge performance benefits
  
- [Columnar Cloud Cache (C3)](https://www.dremio.com/platform/sonar/query-engine/#:~:text=Columnar%20Cloud%20Cache%20(C3)%20enables,cache%20individual%20microblocks%20within%20datasets.): A technology developed by Dremio to overcome bottlenecks in accessing data on cloud object storage making cloud-based data lakehouses faster and more performant.

- [Reflections](https://docs.dremio.com/software/acceleration/reflections/): This patented query optimization technology gives you the benefits you'd expect from materialized tables on other platforms in a more flexible and easier-to-use package. You just turn on reflections on high-priority datasets and they'll be used to optimize queries and be automatically updated behind the scenes, and even better Dremio can determine when one or more existing reflections can be used to optimize queries on other datasets. This improves performance and cuts down storage and compute costs, a game-changing feature.

Dremio enables analytics on the data lakehouse at scale with optimizations that speed up your queries while reducing your compute bill, not increasing it.

## Four - Open

One of the things that leads to the high cost of data warehouses is the vendor lock-in, they know they can charge you more because its too hard to leave when your data is stored in proprietary formats. This lock-in also creates "lock-out" as your data may not be able to be used with other tools with other desirable features since it's stuck in the data warehouse box.

Dremio embraces open architecture at every step so you can rest easy knowing you are not locked-in or locked-out:
  - The Dremio Sonar query engine can query your data where it exists whether it's AWS Glue, S3, [Nessie Catalogs](https://projectnessie.org/), MySQL, Postgres, RedShift and an ever-growing list of sources.
  - You can query data in a variety of file formats like ORC, Parquet, JSON, CSV and more.
  - You can query data organized in many open table formats like [Apache Iceberg](https://iceberg.apache.org/) and [Delta Lake](https://delta.io/). ([Here is a good article on what is a table format and the differences between different ones](https://www.dremio.com/subsurface/comparison-of-data-lake-table-formats-iceberg-hudi-and-delta-lake/))
  - When using Dremio Arctic to catalog your data into Apache Iceberg tables, any engine that supports Nessie catalogs can connect and do operations on the data. (Arctic/Nessie catalogs enable branching and merging so you can isolate work on your data to avoid exposing partially updated data to your consumers)

Dremio lets you run analytics on any data and doesn't lock out your data from other tools giving you more flexibility in creating the right mix of data sources and tools for your use case.
  
## Five - The Semantic Layer

Aside from querying your data, Dremio has several features that allow you to create a semantic layer over your data. By organizing your datasets into spaces and folders:

  - You can granularly control what users and roles have access to particular spaces, folders and datasets
  - You can control the level of access they have (can they read, can they create reflections on the dataset, etc.)
  - You can create [row and column policies](https://www.dremio.com/blog/new-row-level-and-column-level-access-controls/) to make sure only the right people can access sensitive data
  
With these granular controls to organize and secure your data Dremio can satisfy many use cases:

  - Dremio becomes the interface for your data consumers to access the data they need access to whether sharing data with in-house users or external partners
  - Dremio becomes a key platform for implementing architectural patterns like [Data Mesh](https://www.dremio.com/blog/enabling-a-data-mesh-with-an-open-lakehouse/) (one more [article](https://www.dremio.com/blog/from-monolithic-data-architectures-to-data-mesh/) on data mesh).
  - An easier place to manage regulatory compliance when it comes to data access
  
## Conclusion

[Dremio Cloud](https://www.dremio.com/get-started/) makes big data analytics easy, fast, affordable and open and provides a semantic layer that makes security and implementing a data mesh a breeze. With a free tier, there is very little reason not to make Dremio Cloud part of your data analytics toolbelt.


**Other Resources for Learning about Data Lakehouses**
- [Subsurface Data Lakehouse Community Blog](https://www.dremio.com/subsurface/)
- [Subsurface Meetup Group](https://www.meetup.com/subsurface-global/)
- Twitter: [Dremio](https://twitter.com/dremio), [Subsurface]([https://twitter.com/Dipankartnt](https://twitter.com/SubsurfaceComm)), [Alex Merced](https://twitter.com/AMdatalakehouse), [Dipankar Mazumdar](https://twitter.com/Dipankartnt)