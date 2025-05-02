---
title: Introduction to Data Engineering Concepts | Understanding Data Sources and Ingestion
date: "2025-05-02"
description: "Introduction to the terms in data engineering"
author: "Alex Merced"
category: "Data Engineering"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - Data Engineering
  - Databases
  - Data Lakes
  - Data Lakehouses
---

## Free Resources  
- **[Free Apache Iceberg Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=intro_to_de&utm_content=alexmerced&utm_term=external_blog)**  
- **[Free Copy of “Apache Iceberg: The Definitive Guide”](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=intro_to_de&utm_content=alexmerced&utm_term=external_blog)**  
- **[Free Copy of “Apache Polaris: The Definitive Guide”](https://hello.dremio.com/wp-apache-polaris-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=intro_to_de&utm_content=alexmerced&utm_term=external_blog)**  
- **[2025 Apache Iceberg Architecture Guide](https://medium.com/data-engineering-with-dremio/2025-guide-to-architecting-an-iceberg-lakehouse-9b19ed42c9de)**  
- **[How to Join the Iceberg Community](https://medium.alexmerced.blog/guide-to-finding-apache-iceberg-events-near-you-and-being-part-of-the-greater-iceberg-community-0c38ae785ddb)**  
- **[Iceberg Lakehouse Engineering Video Playlist](https://youtube.com/playlist?list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe&si=WTSnqjXZv6Glkc3y)**  
- **[Ultimate Apache Iceberg Resource Guide](https://medium.com/data-engineering-with-dremio/ultimate-directory-of-apache-iceberg-resources-e3e02efac62e)** 

Before we can analyze, model, or visualize data, we first need to get it into our systems. This step—often taken for granted—is known as data ingestion. It’s the bridge between the outside world and the internal data infrastructure, and it plays a critical role in how data is shaped from day one.

In this post, we’ll break down the types of data sources you’ll encounter, the ingestion strategies available, and what trade-offs to consider when designing ingestion workflows.

## What Are Data Sources?

At its core, a data source is any origin point from which data can be extracted. These sources vary widely in structure, velocity, and complexity.

Relational databases like MySQL or PostgreSQL are common sources in transactional systems. They tend to produce highly structured, row-based data and are often central to business operations such as order processing or customer management.

APIs are another rich source of data, especially in modern SaaS environments. From financial data to social media feeds, APIs expose endpoints where structured (often JSON-formatted) data can be requested in real-time or on a schedule.

Then there are flat files—CSV, JSON, XML—often used in data exports, logs, and external data sharing. While simple, they can carry critical context or fill gaps that structured sources miss.

Sensor data, clickstreams, mobile apps, third-party tools, and message queues all add to the landscape, each bringing its own cadence and complexity.

## Ingestion Strategies: Batch vs Streaming

Once you identify your sources, the next question becomes: **how** will you ingest the data?

**Batch ingestion** involves collecting data at intervals and processing it in chunks. This could be once a day, every hour, or even every minute. It's suitable for systems that don't require real-time updates and where data can afford to be a little stale. For example, nightly financial reports or end-of-day sales data.

Batch processes tend to be simpler and easier to maintain. They can rely on traditional extract-transform-load (ETL) workflows and are often orchestrated using tools like Apache Airflow or simple cron jobs.

**Streaming ingestion**, on the other hand, handles data in motion. As new records are created—say, a customer clicks a link or a sensor detects a temperature change—they’re ingested immediately. This method is crucial for use cases that require low-latency or real-time processing, such as fraud detection or live recommendation engines.

Apache Kafka is a popular tool for enabling streaming pipelines. It allows systems to publish and subscribe to streams of records, ensuring data flows continuously with minimal delay.

## Structured, Semi-Structured, and Unstructured Data

Understanding the shape of your data also influences how you ingest it.

Structured data is highly organized and fits neatly into tables. Think SQL databases or CSV files. Ingestion here often involves direct connections via JDBC drivers, SQL queries, or file uploads.

Semi-structured data, like JSON or XML, has an internal structure but doesn’t conform strictly to relational models. Ingesting this data may require parsing logic and schema inference before it's usable downstream.

Unstructured data includes images, videos, PDFs, and raw text. These formats typically require specialized tools and more complex handling, often involving metadata extraction or integration with machine learning models for classification or tagging.

## Considerations in Designing Ingestion Pipelines

Data ingestion isn’t just about moving bytes—it’s about doing so reliably, efficiently, and with the future in mind.

Latency requirements play a major role. Does the business need data as it happens, or is yesterday’s data good enough? That determines your choice between batch and streaming.

Scalability is another concern. What works for 10,000 records a day might break under 10 million. Tools like Kafka and cloud-native services such as AWS Kinesis or Google Pub/Sub help handle high throughput without compromising performance.

Error handling is essential. What happens if a source API goes down? What if a file arrives with missing fields? Designing retry logic, alerts, and fallback mechanisms helps ensure ingestion pipelines are robust.

Finally, schema evolution can’t be overlooked. Data changes over time—columns get added, data types shift. Your ingestion pipeline must be flexible enough to adapt without breaking downstream systems.

## Looking Ahead

Getting data into the system is just the beginning. Once it’s ingested, it often needs to be transformed to fit the analytical or business context.

In the next post, we’ll explore the concepts of ETL and ELT—two core paradigms for moving and transforming data—and look at how they differ in practice and purpose.
