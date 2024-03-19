---
title: 5 Open Source Data Projects You Should Be Following
date: "2024-03-19"
description: "Apache Iceberg, Apache Arrow, Nessie, Ibis, Substrait"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - Data Architecture
  - Apache Iceberg
  - Data Lakehouse
  - Open Source
---

[Follow Me On Social](https://bio.alexmerced.com/data)
[Subscribe to my SubStack](https://amdatalakehouse.substack.com)

Open source technology significantly impacts various development areas, and the data sector is no exception. Today's data landscape features increasingly large datasets that often rely on external sources worldwide, necessitating rapid conversion into insights. The proprietary formats and platforms of the past, with their artificial barriers designed to maintain vendor lock-in, hinder this process. Fortunately, numerous open source projects are revolutionizing the data realm. These projects are utilized by [open data platforms like Dremio](https://www.dremio.com/get-started?utm_medium=website&utm_source=externalblog&utm_term=2024-03-19-website&utm_content=alex&utm_campaign=organic_posts), among others, with some still in the early stages of their disruptive journey.

## Apache Iceberg (Lakehouse Table Format)

![Apache Iceberg Logo](https://iceberg.apache.org/assets/images/Iceberg-logo.svg)

The first noteworthy technology is [Apache Iceberg, a data lakehouse table format](https://www.dremio.com/blog/apache-iceberg-101-your-guide-to-learning-apache-iceberg-concepts-and-practices/). It introduces a metadata layer over Parquet datasets in your data lake, enabling various tools to interact with them as if they were database tables, complete with ACID transactions, time-travel capabilities, table evolution, and more. Apache Iceberg stands out for its ease of use, [particularly with lakehouse platforms like Dremio](https://bit.ly/am-dremio-lakehouse-laptop), its robust ecosystem of compatible tools and integrations, and its community-driven culture. With [Apache Iceberg](https://iceberg.apache.org/), you can seamlessly work across all your preferred tools and platforms without the need for multiple data copies.

## Nessie (Lakehouse Catalog with Git-Like Catalog Versioning)

![Project Nessie Logo](https://projectnessie.org/img/nessie.svg)

[Nessie is an open-source lakehouse catalog](https://www.dremio.com/blog/what-is-nessie-catalog-versioning-and-git-for-data/) that enables you to track your Apache Iceberg tables and views within your data lake, integrating them seamlessly with popular tools like Dremio, Apache Spark, Apache Flink, and others. What sets Nessie apart is its catalog versioning capability, which allows you to work on your catalog in isolated branches and publish all changes simultaneously through branching. This feature also facilitates catalog-level rollbacks, enhances data reproducibility with tagging, and supports the creation of branches for experimentation and validation, as well as zero-copy environments for development. While [Nessie](https://projectnessie.org/) can be deployed in a self-managed manner, it is also now [integrated into the Dremio Cloud Lakehouse platform](https://www.dremio.com/blog/managing-data-as-code-with-dremio-arctic-easily-ensure-data-quality-in-your-data-lakehouse/).

## Apache Arrow (Standard In-Memory Format and Transfer Protocol)

![Apache Arrow Logo](https://arrow.apache.org/img/arrow-logo_hex_black-txt_white-bg.png)

[Apache Arrow introduces](https://www.dremio.com/blog/how-dremio-delivers-fast-queries-on-object-storage-apache-arrow-reflections-and-the-columnar-cloud-cache/) a range of standards to the data arena. Its in-memory format sets a standard for columnar data, enabling rapid analytical processing while reducing the overhead of serialization and deserialization when reading and writing data. The Apache Arrow Flight GRPC protocol facilitates data transfer between systems in the Arrow format, further minimizing the need for conversion and enhancing performance. This protocol can be used directly or through JDBC/ODBC drivers that Dremio has contributed to the community, allowing connections to any Arrow Flight server using a single driver. A notable addition to the project is ADBC (Arrow Database Connectivity), a new transfer protocol that supports various drivers for columnar data transfer. This means you can use an Arrow Flight driver for Arrow Flight servers, while other platforms can develop custom ADBC drivers for their columnar formats, optimizing the benefits of columnar transfer. Essentially, [Apache Arrow](https://arrow.apache.org/) enables faster data processing and transfer, meeting the increasing demand for speed in data handling.

## Ibis

![Ibis Logo](https://ibis-project.org/logo.svg)


[Ibis is a project that separates the Python dataframe API from the compute layer](https://ibis-project.org/), facilitating a unified dataframe API that can interact with various compute engines. This approach simplifies the process for analysts, allowing them to work with data from different systems using a single dataframe API, streamlining their workflows and enhancing efficiency.

## Substrait

![Substrait Logo](https://substrait.io/img/logo.svg)

[Substrait](https://substrait.io/) is a distinctive project targeting the standardization of a layer often invisible to users: the algebraic representation of queries. When a query is executed using a query language, it must be compiled into an intermediate format that the engine uses to determine the operations to execute. Typically, this format is unique to each engine, resulting in cross-platform SQL incompatibility. Substrait's goal is to establish a standard intermediate format that bridges the gap between the user's query and the relational algebra that the query engine processes, aiming to streamline and unify the querying process across different platforms.

[Read More about the value of Open Source Here](https://www.dremio.com/blog/open-source-and-the-data-lakehouse-apache-arrow-apache-iceberg-nessie-and-dremio/)