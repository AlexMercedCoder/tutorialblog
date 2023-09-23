---
tags:
  - "data engineering"
  - "data lakehouse"
  - "dremio"
author: "Alex Merced"
title: "An Approach to Architecting a Lower Cost, Fast and Self-Service Data Lakehouse"
date: "2023-09-22T12:12:03.284Z"
category: "data engineering"
bannerImage: "/images/postbanner/2023/arch-lakehouse.png"

---

There are several goals data architects are perpetually trying to improve upon:


- **Speed:** Data Analysts and scientists need data to derive insights to create business value in predictive models, dashboards to help in strategic planning, and more. Fast access to the data goes a long way in enabling more productivity of data consumers as they can focus on querying data instead of creating local copies and extracts to meet their SLAs. Good performance also reduces the overall compute costs of your data infrastructure as cloud computing can be shorter lived, preventing runaway expenses.


- **Self-Service Access:** Some stakeholders using the data may have technical knowledge enabling them to use it. However, many less technical potential users can get value from data if it were easier to discover, access, and understand, which can maximize the value an institution brings from its data. 

- **Open Architecture:** Components come and go. A platform you are using may become stale and not keep up with modern needs; new platforms may arise, enabling new use cases for your data. You want your data to be nimble, so you are not stuck with costly and complex migrations as the tooling environment changes.

- **Maintainability:** Data needs to be maintained, whether compaction, clustering or one of many other practices. Good architecture should make this maintenance as easy as possible so the data doesn't become too unkept, affecting performance and potential storage costs from storing unneeded data snapshots.

## How has this been done up until now?

![Old-School Data Architecture](https://i.imgur.com/xku46Uf.png)

1. Land raw data from differing sources in any format into the data lake in a "raw zone"
1. Make all your transformations, data validations, schema updates, denormalizations and land the data into optimized parquet files in the "silver zone"
1. Generate aggregated data into another set  of parquet files that live in a "gold zone"
1. Copy selected data from silver and gold into a data warehouse platform.
1. Make additional physical and logical copies of that data into data marts for different usage of different businesses.
1. Users of the marts may still download extracts of subsets of the data to improve the performance of the dashboards they are running on the data.

## Problems with this approach:
- Each step is a pipeline that must be created and maintained; if one step breaks, it creates data quality issues for all downstream steps. It's fragile and brittle.

- Creating multiple copies of the same data results in exploding storage costs along with consistency and compliance challenges.

- The compute needed for each pipeline adds up.

- Egress fees as you move data from the data lake into the data warehouse can also add up.

- Self-service is difficult because the data available to the end user depends on all upstream pipelines, creating a vast log of requests to the data engineering team for every minor needed change that results in updating and testing multiple pipelines. 

- Essentially, changes are slow and painful.

- Data has to be governed from the data lake and data warehouse, along with the issue of ungovernable local extracts.

## The Principles of a Better Approach:
- Only one copy of the data should be at the center and on the data lake. Keeping one copy of the data in one place reduces storage, compute, and egress costs.
- The maintenance of the data and synching of alternate physical caches for acceleration should be automated.
- One central access layer for all use cases so governing and monitoring the data is more accessible and transparent.
- Giving users the ability to curate the data changes they need (last-mile ETL) should be easy so the engineering team can focus on the health of the entire architecture versus a backlog of schema changes, access requests, etc.

## How do we make this happen:

![Dremio Based Lakehouse Architecture](https://i.imgur.com/JhRNkOz.png)

1. Land your raw data in the open-source Apache Iceberg table format in your data storage, cataloged by an open-source Nessie or Dremio Arctic catalog. The catalog will allow us to track the newly ingested data on an isolated branch that doesn't affect previously validated production data on our "main" branch which fuels the queries of our end users.
1. Run all your data validation, transformation and clean-up work on the branch, then merge the changes across all your tables as one large multi-table commit when done. At this point, no data duplicates have been generated. (Nessie tracks chains of iceberg snapshots, and each Iceberg snapshot only adds manifests and data files to cover the new, updated or deleted records of that transaction, meaning existing data isn't necessarily replicated)
1. Connect your catalog to Dremio and use Dremio's semantic layer to model the data we want to be available to our end users via logical views. For example, I may create a view of denormalized joined together and save that view into multiple folders for each business unit that needs it. You can organize your semantic layer using a medallion (bronze, silver, gold) architecture, data mesh architecture or any other approach without making copies upon copies of the data.
1. Grant access to each business unit's folder to each business unit's users and let them curate additional views on the data for their particular use cases.
1. Use the built-in wiki to document every folder and view for easy context and discoverability.
1. Dremio's reflections allow you to create physical caches for data you may need additional performance on (like materialized views, but better), but these caches are automatically synched and optimized. Dremio will recommend which reflections we should make based on our query patterns. If the source data is an Apache Iceberg table, those reflections will be incrementally updated, keeping them in sync near real-time. Views derived from a table or view with reflections enabled will also see a performance boost from the reflection built on its parent, maximizing acceleration while minimizing the storage necessary to deliver it.
1. If a Dremio Arctic catalog tracks your Apache Iceberg tables, you can also turn on automatic table optimization so the underlying source data is always in optimal form.

## Benefits:
- There is only one major pipeline, which lands your data into Apache Iceberg

- The pipelines that generally handle syncing materialized views or conducting table maintenance are automated through the Dremio platform.

- Data doesn't move out of your data lake storage, so less egress fees

- Dremio engine performance, reflections and columnar cloud cache optimize performance while reducing storage, compute and data access footprints, exponentially lowering cloud infrastructure costs.

- End users have one central point of access where they can easily see what data they have access to, run last-mile ETL to get the data in the format they need, and easily access it through either a web interface, JDBC/ODBC, Rest API and Arrow Flight. Many BI platforms like Tableau and Power BI already have deep Dremio integrations.

## Conclusion:
You can...
- Lower the cost of your data infrastructure
- Make it easier to maintain
- Make it easier to consume
- Make it easier to engineer

All you have to do is embrace modern open technologies like [Apache Iceberg & Nessie](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/) and open platforms like Dremio to bring you endless benefits to your data life. Getting started [Dremio is free whether self-deployed or on cloud](https://www.dremio.com/get-started), and [Dremio has many possible use cases](https://www.dremio.com/blog/5-use-cases-for-the-dremio-lakehouse/) from which it can bring you value. Bottom line, [try Dremio out today](https://www.dremio.com/get-started)!