---
tags:
  - "data lakehouse"
  - "data engineering"
author: "Alex Merced"
title: "Overview of the Open Lakehouse: Why Dremio?"
date: "2023-10-11T12:12:03.284Z"
category: "data lakehouse"
bannerImage: "https://i.imgur.com/no75OFq.png"
---

## Pain Points

### What are the modern data pain points:

- My cloud infrastructure bill has run wild

- My datasets have many derived copies for different use cases, which can be complex to maintain and keep consistent.

- Creating performant BI Dashboards requires extracts and cubes, which can quickly become stale and inconsistent.

- I have to move the data into different platforms for different use cases, which compounds my costs and adds additional pipelines.

- I have to set permission rules in several different places, which can be challenging to track and maintain for compliance.

- My data infra is so complex developing potential projects may take forever.

## Who has overcome

[Many companies](https://www.dremio.com/customers/) are overcoming these challenges:

- [OTP Bank has saved 60% on their storage costs](https://www.dremio.com/customers/opt-bank/)

- [DB Cargo is now able to provide faster, easier access to all of their data to 300+ users](https://www.dremio.com/customers/db-cargo/)

- [eMag reduced their report generation time from weeks to hours](https://www.dremio.com/customers/emag/)

- [Douglas has reduced the time deliver data to end users from 3 days to 3 minutes](https://www.dremio.com/customers/douglas/)

### How did they Overcome

The pillar that has enabled these outcomes has been Dremio, a platform allowing more flexible data lakehouse architectures (enabling your data anywhere to work everywhere and avoid excessive data copies and cumbersome data silos). 

Dremio offers solutions to several pain points in delivering data.

- Connect to several data sources, providing a unified access layer for your users

- Dremio integrates with all your favorite tools and enables a sub-second BI dashboard directly on your data

- Govern Access to all your data sources from one access point so you know who can access what from one dashboard.

- Git-for-Data features allow for isolation, multi-table transactions, reproducibility, zero-copy environment creation and more for Apache Iceberg datasets in a Dremio Arctic catalog.

- Dremio's self-service features allow data users to independently curate data from connected sources, even if they aren't SQL experts.

- Dremio allows the data to be easily consumed via Web UI, REST API, JDBC/ODBC and Arrow Flight

![Dremio](https://i.imgur.com/U6edErN.png)

[The best way to see Dremio's value is to get hands-on and try it out, this blog will walk you through setting up Dremio on your laptop.](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/)

## How do you get there?

### #1 - Greenfield: Starting from scratch

If you are starting your data infrastructure from scratch, you are in the fortunate position of being able to use best practices to get the most benefit in lower costs, better performance and self-service from the Dremio platform. The steps would look like this:

1. Land your data into [Apache Iceberg tables in Dremio's Arctic catalog](https://www.dremio.com/blog/apache-iceberg-101-your-guide-to-learning-apache-iceberg-concepts-and-practices/) (may want to use Arctics Git-for-Data features to isolate ingestion on a branch).

1. Use DBT's Dremio integration to take that data and automate generating the views you need (joins, column/row masking, etc.)

1. Use Dremio's reflection recommendations to identify datasets to turn reflections on for accelerated performance (reflections on Iceberg tables are incrementally updated for near real-time freshness of the physical cache created by reflections)

1. Grant users permission to the datasets they should have access to, craft documentation for easy discoverability of the data, and allow users to curate the views they need from here using Dremio's intuitive UI.

![Dremio Open Lakehouse Architecture](https://i.imgur.com/nsyw9L2.png)

### #2 Early Stages: Don't want to move data from your operational databases yet

So, you are in the early stages of your analytics story and want to ensure data across multiple operation databases are available to your analysts in an easy-to-use way.

1. Connect your databases to Dremio

1. Create views from your data that your analysts will have access to

1. Turn on reflections on tables so you minimize the impact of analytics on the operational use of your database and improve performance for analytics.

1. Grant access to your analysts

1. Let your analyst enjoy access to your data

![Zero-ETL Lakehouse - Connect your Exisitng Databases](https://i.imgur.com/l32Ti7i.png)

### #3 Already using Established Platforms: Snowflake and Databricks

You may be already using platforms like Snowflake and Databricks, maybe even at the same time. Dremio can help make the data from one or both platforms more performant for BI dashboards or more make the data  more easily usable with data you have elsewhere.

1. Connect any object stores with your Delta Lake tables made on Databricks and promote them into Delta Lake tables using Dremio

1. Connect Snowflake to Dremio

1. distribute views, grant permissions and allow your users to use the data without having to worry which platform it came from.

![Enhancing Snowflake and Databricks with Dremio](https://i.imgur.com/XwQJaGV.png)

### #4 On-Prem Data

Your data lives on-prem in a Hadoop cluster or an on-premises object store like Minio. You may want:

- Better performance and easier use, but most new tools are cloud-only

- You may want to migrate to the cloud with minimal disruption

In either situation, Dremio is here for you.

1. Connect your on-prem data sources to Dremio

1. curate data, grant permissions, let analysts work with the data

1. If migrating to the cloud, connect that to Dremio and now analysts can access the data, whether on-prem or in the cloud, eliminating any disruption as you relocate.

![Dremio for on-prem data lakes](https://i.imgur.com/4cyD37c.png)

### #5 Data Sharing

So many data-sharing platforms, such as Snowflake's Marketplace, Delta Sharing, and Amazon's Data Exchange. What if your use case needs you to access data from all three platforms to curate new datasets you need to share with someone else?

1. Connect data from all these sources to Dremio so they can be analyzed in one place without having to move the data

1. Share the data from everyone on Dremio by either creating an account for them on your Dremio instance, or by giving access to another Dremio instance through the Dremio-to-Dremio connector.

![Dremio Unifying Data Sharing Platforms](https://i.imgur.com/8IQSHvz.png)

Dremio provides unique value regardless of what your existing data infrastructure looks like. It will reduce storage, computing and data movement costs while expanding access, ease and performance. [Try Dremio today.](https://www.dremio.com/get-started/)