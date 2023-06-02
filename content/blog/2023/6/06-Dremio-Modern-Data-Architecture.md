---
tags:
  - "data engineering"
  - "data lakehouse"
  - "dremio"
author: "Alex Merced"
title: "Dremio and Modern Data Architecture: Data Lakes, Data Lakehouses and Data Mesh"
date: "2023-06-02T12:12:03.284Z"
category: "data engineering"
bannerImage: "/images/postbanner/2023/dremio-arch.png"

---

Today it can seem like a buzzword onslaught in the data space with terms like Data Mesh, Data Lakehouse, and many more being thrown out with every vendor trying to make their claim that they provide "the answer." However, in this article, I will discuss the underlying reality that does leave a need for solutions to today's data challenges. Yes, I work for Dremio, but I also genuinely believe that after going over the problems in today's data world, you'll agree that Dremio is well-positioned to be part of the solution among many technologies rising up today.

## What has been

Up to now, Data Warehouses has been the end all of running analytics on your data. Data warehouses are just database platforms optimized for analytics workloads and needs. Like databases, data warehouses would handle the storage and processing/computation of queries on the data. The first issue that arose with scale was storage which came in two forms:

- Storing all my structured data in the data warehouse is expensive
- Where do I store all my unstructured data

This is where data lakes came into play, becoming the repository for storing all your data structured or unstructured; you'd then make an additional copy of a portion of that structured data and move it into a data warehouse for high-priority workloads. So data warehouses still handle storage and computation but on a subset of your data.

![Traditional Data Architecture](https://i.imgur.com/k0XEGP5.png)

## The Problems That Came

The problem is the amount of data and the ways it can be used kept growing and expanding, leading to several problems:

- Storage costs exploding as more and more data goes into the warehouse
- Agility, with so many data movements getting the data where it needs to be to meet agreed-upon standards (Service Level Agreements, SLAs) becomes harder and harder.
- With so much data covering so many different domains of business knowledge, it became harder and harder for centralized IT teams to properly govern, monitor and organize that data in a way that made the data discoverable and easily accessible by those who should have access.
- Any particular data warehouse has limitations to its scope, so you'd inevitably need additional tools, but your data was in proprietary formats leading to inaccessibility or further data copies.

New architectural patterns arose to deal with these and other issues, in particular, the Data Lakehouse and Data Mesh.

## The Data Lakehouse

The idea with a data lakehouse is to separate the responsibility of storing and processing the data. The data lake was already acting as a data repository, and more of it has been moved into formats like Parquet, which were structured for better analytics performance. What was needed was an abstraction layer that allowed tools to look at the files in your data lake not as a bunch of unrelated files but as singular tables like in a database, and this is where modern data lakehouse table formats such as Apache Iceberg come into play.

These tables can then be tracked by a data catalog like Project Nessie, which can then allow a variety of tools like Dremio, Apache Spark, Apache Flink and many more to discover and run computations on your data with typically data warehouse-like features like ACID guarantees for updates/deletes, the ability to rollback your data to prior states, evolve the schema and more.

So now, you don't need to copy your data but can still run those workloads using the tool that needs the job instead of being limited by a single tool or platform.

![Data Lakehouse](https://i.imgur.com/xtrlfMj.png)

## Data Mesh

While opening your data technologically is a significant advancement, there is also a culture of knowledge around your data. As data grows, having a data team responsible for all the data results in bottlenecks as data from different parts of your business have different context and nuances that are harder to acclimate to as the scope of that data grows. This is where data mesh comes in.

Once these tensions arise it makes sense to follow the principles of data mesh in how you organize the division of labor in producing and engineering your data.

- Divide up your data into "domains" that often represent a business unit or logically coupled realms of data, and each domain will have a different team responsible for its data.
- Each team creates a "data product" a production-quality collection of datasets with data on that domain available to those who need it.
- Some standard interface should deliver this data to make it "self-service"
- That platform should have features for applying "computational governance"

This allows people who can focus on the context of the data they are curating to do have a scope of work narrow enough to meet SLAs, but also deliver the data in a way that makes it easy for end users to discover and use these disparate data products.

![Data Mesh](https://i.imgur.com/BBcbHbh.png)

## Dremio: Part of the Solution

Dremio is data platform that offers many benefits when implementing any or multiple of the architectures above.

Watch this presentation to watch a demo of Dremio, an explanation of features along with user stories.

In a traditional data architecture, Dremio allows you to get faster performance and easier access to data on your data lake, allowing you to do more work from the data lake versus the data warehouse.

For data lakehouses, Dremio has deep integrations with the Apache Iceberg table format allowing you to use those data warehouse-like features like ACID Transactions, time travel and more. Dremio also provides a Nessie-backed data catalog service, Dremio Arctic, which brings an intuitive UI for managing tables, scheduling automated table maintenance and more.

For data mesh, Dremio's Semantic layer provides an easy-to-use standard interface for governance and self-service of data while being a perfect platform to enable teams to create, curate and document their data products from disparate sources. 
Find many presentations here regarding Dremio's Data Mesh story.

### Dremio For Data Lakhouses
![Dremio for Data Lakehouses](https://i.imgur.com/DJyBlNf.png)


### Dremio for Data Mesh
![Dremio for Data Mesh](https://i.imgur.com/ADh7LTo.png)
