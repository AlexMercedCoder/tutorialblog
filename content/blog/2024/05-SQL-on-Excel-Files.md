---
title: Running SQL on your Excel Files From Your Laptop with Dremio
date: "2024-05-03"
description: "How to run SQL on your Excel files easily"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - Data Architecture
  - Apache Iceberg
  - Data Lakehouse
---

Being able to quickly analyze and gain insights from your data is crucial. Excel is widely used for data storage, but when it comes to complex queries and analytics, SQL is often the preferred tool. [Dremio, a data lakehouse platform](https://www.dremio.com/solutions/data-lakehouse/), bridges this gap by allowing you to run SQL queries directly on your Excel files without extensive setup. In this tutorial, I'll guide you through setting up Dremio in a Docker container on your laptop and running SQL queries on an Excel file.

## Step 1: Setting Up Dremio Using Docker

To get started, you need to run Dremio on your machine using Docker. This approach ensures that the setup is isolated and does not interfere with other software on your system. Here’s the Docker command to start the Dremio server:

```bash
docker run -p 9047:9047 -p 31010:31010 -p 45678:45678 -p 32010:32010 -e DREMIO_JAVA_SERVER_EXTRA_OPTS=-Dpaths.dist=file:///opt/dremio/data/dist --name try-dremio dremio/dremio-oss
```

This command sets up the necessary port mappings and environment variables for Dremio to operate correctly.

## Step 2: Accessing the Dremio UI

Once Dremio is up and running, access the Dremio UI by navigating to localhost:9047 in your web browser. Here, you will log in to the Dremio interface, which is intuitive and user-friendly.

## Step 3: Uploading Your Excel File

Dremio makes it simple to upload and manage your data sources. To upload an Excel file:

Click the "+" button in the top right corner of the Dremio UI.
Select and upload your Excel file.

You can obtain a sample Excel file with structured data for this tutorial from [The Spreadsheet Guru](https://www.thespreadsheetguru.com/sample-data/).

## Step 4: Running SQL Queries

With your data uploaded, you can now use SQL to query and analyze your Excel file directly:

### Navigate to the dataset in Dremio.

Use the SQL Runner to execute SQL queries on your data.
This step is where Dremio shines, offering powerful tools to execute complex SQL queries on Excel data, allowing for deeper insights and analysis.

## Conclusion

Dremio offers a practical solution for running SQL queries on Excel files, combining the power of SQL with the ubiquity of Excel. By leveraging Docker, setup and scalability are simplified, making this approach ideal for personal projects and enterprise needs alike. Try it out, and start gaining more valuable insights from your data today!

Here are some more amazing tutorials to show you what you can do with Dremio, SQL and the Data Lakehouse.

- [End-to-End Basic Data Engineering Tutorial (Spark, Dremio, Superset)](https://amdatalakehouse.substack.com/p/end-to-end-basic-data-engineering)
- [From Postgres to Dashboards with Dremio and Apache Iceberg](https://www.dremio.com/blog/from-postgres-to-dashboards-with-dremio-and-apache-iceberg/)
- [From SQLServer to Dashboards with Dremio and Apache Iceberg](https://www.dremio.com/blog/from-sqlserver-to-dashboards-with-dremio-and-apache-iceberg/)
- [From MongoDB to Dashboards with Dremio and Apache Iceberg](https://www.dremio.com/blog/from-mongodb-to-dashboards-with-dremio-and-apache-iceberg/)
- [Intro to Dremio, Nessie, and Apache Iceberg on Your Laptop](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/)
- [Using Flink with Apache Iceberg and Nessie](https://www.dremio.com/blog/using-flink-with-apache-iceberg-and-nessie/)
- [Getting Started with Project Nessie, Apache Iceberg, and Apache Spark Using Docker](https://www.dremio.com/blog/getting-started-with-project-nessie-apache-iceberg-and-apache-spark-using-docker/)
- [Experience the Dremio Lakehouse: Hands-on with Dremio, Nessie, Iceberg, Data-as-Code and dbt](https://www.dremio.com/blog/experience-the-dremio-lakehouse-hands-on-with-dremio-nessie-iceberg-data-as-code-and-dbt/)

