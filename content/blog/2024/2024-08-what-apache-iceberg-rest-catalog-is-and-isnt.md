---
title: What Apache Iceberg REST Catalog is and isn't
date: "2024-08-18"
description: "Understanding Iceberg Catalog Interoperability"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
  - apache iceberg
---

- [Free Copy of Apache Iceberg: The Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=rest_catalog_is_isnt)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=rest_catalog_is_isnt)

I've recently written a few blogs on the evolution of Apache Iceberg catalogs:

- [The Evolution of Apache Iceberg Catalogs](https://www.dremio.com/blog/the-evolution-of-apache-iceberg-catalogs/?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=rest_catalog_is_isnt)
- [The Future of Apache Iceberg Catalogs](https://medium.com/data-engineering-with-dremio/understanding-the-future-of-apache-iceberg-catalogs-ff2a2878fbc0)

In this article, I aim to clarify the scope of the REST catalog specification to provide a clearer understanding of the role it plays within the broader Apache Iceberg catalog ecosystem.

## What the REST Catalog Does

### Creates a Uniform Interface for Table Operations

The REST catalog provides an interface that allows any catalog to immediately support various table-level operations across multiple tools, including:

- Reading a table
- Creating a table
- Inserting data into a table
- Updating a table
- Branching at the table level
- Altering a table

## What the REST Catalog Does Not Do

### Does Not Create a Uniform Interface for Non-Table Operations

The REST catalog is focused solely on table operations and does not address:

- Non-table level management at the catalog (e.g., Nessie) or file level (e.g., LakeFS)
- Security at the table or catalog level
- Handling non-table objects like machine learning features and other related data

While catalog services can offer a wide range of functionalities beyond managing Iceberg tables, the REST catalog interface is specifically designed for table-level operations. This doesn’t preclude the possibility of future standard interfaces for broader catalog management APIs, which may emerge from open-source catalog projects like Nessie or Apache Polaris (Incubating).

### Is Not a Catalog Implementation

The REST catalog is not a deployable catalog; rather, it is a REST API specification. This specification enables multiple catalog implementations, such as Polaris and Nessie, to leverage existing REST catalog clients. By doing so, these catalogs avoid the need to create their own clients in various languages, and they can offload more logic to the server side, as opposed to the client, unlike previous catalog paradigms.

### REST Catalog Support Does Not Guarantee Full Functionality

Catalogs that claim to support the REST catalog specification may implement only a subset of the available endpoints. For example, Unity OSS might utilize endpoints that allow reading an Iceberg table as part of its Delta Lake support but may not support the write endpoints necessary for writing to an Iceberg table. Therefore, when evaluating a catalog's REST catalog support, it's essential to ensure it meets the specific needs of your workloads.

## Conclusion

The REST catalog specification is a powerful tool for standardizing table operations across various catalogs, but it’s important to understand its limitations and the scope of its functionality. As the Apache Iceberg ecosystem continues to evolve, the REST catalog will likely play a critical role in enabling interoperability between different catalogs, but users should remain aware of the specific capabilities and limitations of their chosen catalog implementations.

## Resources to Learn More about Iceberg

- [Apache Iceberg 101](https://www.dremio.com/lakehouse-deep-dives/apache-iceberg-101/?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=iceberg-acid)
- [Hands-on Intro with Apache iceberg](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=iceberg-acid)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=iceberg-acid)
- [Free Copy Of Apache Iceberg: The Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=iceberg-acid)