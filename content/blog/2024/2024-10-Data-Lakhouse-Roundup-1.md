---
title: Data Lakehouse Roundup 1 - News and Insights on the Lakehouse
date: "2024-10-16"
description: "What's Going on in the Data Lakehouse Space"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
  - streaming

---

I’m excited to kick off a new series called "Data Lakehouse Roundup," where I’ll cover the latest developments in the data lakehouse space, approximately every quarter. These articles are designed to quickly bring you up to speed on new releases and features related to data lakehouses. Each edition will start with a brief overview of key trends, followed by a roundup of major news from the past few months. Let’s dive in!

## Trends

Data lakehouses are an emerging trend that help organizations achieve the best of both worlds—offering the structured, queryable data of a data warehouse while decoupling storage from compute. This shift allows organizations to model their data and define business-critical assets as structured tables, but instead of being tied to a compute system, the data is stored independently on a distributed storage system like Object Storage or HDFS. This modular and composable architecture reduces the need for excessive data movement, cutting down on time and resource costs. 

Two key abstractions make this possible. First, table formats enable datasets saved in groups of Parquet files to be recognized as singular tables, while maintaining the same transactional guarantees as an integrated data warehouse or database system. Second, catalogs serve as directories for lakehouse assets like tables, namespaces, and views. These catalogs allow any tool to connect and view assets on the lakehouse in a way similar to how one would interact with data warehouse assets. The result is a composable system that behaves much like traditional, tightly coupled systems.

When it comes to table formats, there are four primary options: Apache Iceberg, Apache Hudi, Apache Paimon, and Delta Lake. The first three are Apache projects with diverse development communities, while Delta Lake’s primary repository and roadmap are largely driven by Databricks, with a broader community helping to replicate the API in other languages like Rust and Python.

### Table Formats

In terms of analytics and data science workloads, the two dominant table formats are Apache Iceberg and Delta Lake. Apache Iceberg is favored for analytics because of its SQL-centric design and ease of use, while Delta Lake is often popular for AI/ML workloads, due to its mature Python support and the powerful enhancements provided by the Databricks platform, which is highly regarded for AI/ML. Although Iceberg and Delta lead the race in terms of consumption, Apache Iceberg has gained significant momentum, with major announcements from a wide range of companies, including Dremio, Snowflake, Upsolver, Estuary, AWS, Azure, Google, and Cloudera, all offering support for Iceberg lakehouses. Meanwhile, Apache Hudi and Apache Paimon have been embraced for their low-latency streaming ingestion capabilities. Often, these formats are converted into Iceberg or Delta for consumption later using tools like Apache Xtable.

Given this level of community adoption, Apache Iceberg is quickly becoming the industry standard for data lakehouse tables. However, there are still many questions as organizations architect their lakehouses.

- [What is a Table Format?](https://www.dremio.com/blog/apache-iceberg-crash-course-what-is-a-data-lakehouse-and-a-table-format/?utm_medium=influencer&utm_content=alexmerced&utm_source=ev_external_blog&utm_term=evolutions1)
- [Architecture of Iceberg, Hudi and Delta](https://www.dremio.com/blog/exploring-the-architecture-of-apache-iceberg-delta-lake-and-apache-hudi/?utm_medium=influencer&utm_content=alexmerced&utm_source=ev_external_blog&utm_term=evolutions1)
- [Free Copy of O'Reilly's Apache Iceberg Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_medium=influencer&utm_content=alexmerced&utm_source=ev_external_blog&utm_term=evolutions1)

### Streaming

While using Hudi or Paimon and converting to Delta or Iceberg is an option, this conversion can cause a loss of benefits provided by formats like Iceberg—such as partition evolution and hidden partitioning, which optimize how data is organized and written. Native Iceberg streaming pipelines can be built with open-source tools like Kafka Connect, Flink, and Spark Streaming. Additionally, managed streaming services from companies like Upsolver and Estuary are emerging, making it easier to stream data into Iceberg tables with high performance.

- [A Guide to Apache Iceberg CDC](https://www.dremio.com/blog/cdc-with-apache-iceberg/?utm_medium=influencer&utm_content=alexmerced&utm_source=ev_external_blog&utm_term=evolutions1)
- [Streaming to Apache Iceberg with Upsolver](https://www.dremio.com/blog/streaming-and-batch-data-lakehouses-with-apache-iceberg-dremio-and-upsolver/?utm_medium=influencer&utm_content=alexmerced&utm_source=ev_external_blog&utm_term=evolutions1)
- [Streaming into Apache Iceberg Tables with Kafka Connect](https://www.dremio.com/blog/ingesting-data-into-nessie-apache-iceberg-with-kafka-connect-and-querying-it-with-dremio/?utm_medium=influencer&utm_content=alexmerced&utm_source=ev_external_blog&utm_term=evolutions1)

### Catalogs

Managing governance rules for data lakehouse tables across different compute tools can be cumbersome. To address this, there’s a growing interest in shifting access control and data management responsibilities from the compute engine to the catalog. Open-source catalogs like Apache Polaris (incubating), Apache Gravitino (incubating), Nessie, and Unity OSS provide options for tracking and governing lakehouse tables. Polaris, Gravitino, and Nessie all support Iceberg tables, while Unity OSS supports Delta Lake. Managed services for these open-source catalogs are also on the rise, with companies like Dremio, Snowflake, Datastrato, and Databricks offering solutions (though Databricks' managed Unity service uses a different codebase than Unity OSS). Over the next year, catalog management will likely become a central focus in the lakehouse ecosystem. Multi-catalog management will also become more feasible as Polaris and Gravitino offer catalog federation features, and all of these catalogs support the Apache Iceberg REST API, ensuring compatibility with engines that follow the Iceberg REST spec.

- [The Evolution of Apache Iceberg Catalogs](https://www.dremio.com/blog/the-evolution-of-apache-iceberg-catalogs/?utm_medium=influencer&utm_content=alexmerced&utm_source=ev_external_blog&utm_term=evolutions1)
- [Why Apache Polaris and Nessie Matter](https://www.dremio.com/blog/why-thinking-about-apache-iceberg-catalogs-like-nessie-and-apache-polaris-incubating-matters/?utm_medium=influencer&utm_content=alexmerced&utm_source=ev_external_blog&utm_term=evolutions1)
- [The Nessie Ecosystem](https://www.dremio.com/blog/the-nessie-ecosystem-and-the-reach-of-git-for-data-for-apache-iceberg/?utm_medium=influencer&utm_content=alexmerced&utm_source=ev_external_blog&utm_term=evolutions1)

### Hybrid Lakehouse

As organizations face regulations, cost considerations, and other factors, many are moving data from the cloud back to on-premise data centers or private clouds. While some data remains in the cloud for accessibility and regional performance, other data is stored on-premise for long-term archiving, to co-locate with on-prem compute, or for similar reasons. In this hybrid data lakehouse model, organizations need vendors that provide high-performance, feature-rich storage. Vendors like Minio, Pure Storage, Vast Data, and NetApp are stepping up to fill this need. Additionally, organizations require compute solutions that can access both on-prem and cloud data seamlessly, which is where Dremio excels. With its hybrid design, Dremio brings together a query engine, semantic layer, virtualization, and lakehouse catalog features to offer a unified view of all your data, whether in the cloud or on-premise.

- [3 Reasons to Have a Hybrid Lakehouse](https://www.dremio.com/blog/3-reasons-to-create-hybrid-apache-iceberg-data-lakehouses/?utm_medium=influencer&utm_content=alexmerced&utm_source=ev_external_blog&utm_term=evolutions1)
- [Hybrid Solutions: Minio](https://www.dremio.com/blog/hybrid-lakehouse-storage-solutions-minio/?utm_medium=influencer&utm_content=alexmerced&utm_source=ev_external_blog&utm_term=evolutions1)
- [Hybrid Solutions: Pure Storage](https://www.dremio.com/blog/hybrid-lakehouse-storage-solutions-purestorage/?utm_medium=influencer&utm_content=alexmerced&utm_source=ev_external_blog&utm_term=evolutions1)
- [Hybrid Solutions: Vast Data](https://www.dremio.com/blog/hybrid-lakehouse-infrastructure-solutions-vast-data/?utm_medium=influencer&utm_content=alexmerced&utm_source=ev_external_blog&utm_term=evolutions1)
- [Hybrid Solutions: NetApp](https://www.dremio.com/blog/hybrid-lakehouse-storage-solutions-netapp/?utm_medium=influencer&utm_content=alexmerced&utm_source=ev_external_blog&utm_term=evolutions1)

## Conclusion

There is still of a lot of growth in the lakehouse spaces and keeping an eye on streaming, catalogs and hybrid lakehouse solutions will keep you forward looking in the lakehouse world. Look forward to discussing trends in a few months in the next Lakehouse roundup.
