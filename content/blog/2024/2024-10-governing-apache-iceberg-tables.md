---
title: A Brief Guide to the Governance of Apache Iceberg Tables
date: "2024-10-07"
description: "Controlling Access to your Apache Iceberg Tables"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
  - apache iceberg
---

- [Apache Iceberg Crash Course: What is a Data Lakehouse and a Table Format?](https://www.dremio.com/blog/apache-iceberg-crash-course-what-is-a-data-lakehouse-and-a-table-format/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberggov&utm_content=alexmerced&utm_term=external_blog)
- [Free Copy of Apache Iceberg the Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=iceberggov)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=iceberggov)
- [Iceberg Lakehouse Engineering Video Playlist](https://www.youtube.com/watch?v=SIriNcVIGJQ&list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe) 

Apache Iceberg is a powerful table format designed for data lakes, offering many features that simplify the management and evolution of large datasets. However, one area that Apache Iceberg leaves outside its scope is **table governance**—specifically, managing access control and security for Iceberg tables. This means that Iceberg's metadata specification doesn't inherently govern who can view or modify tables. As a result, the responsibility of securing and governing access to Iceberg tables must be handled at different levels within your lakehouse architecture. Let’s explore these levels and their roles in controlling access.

### File Level Governance

At the most granular level, governance can be applied directly to the metadata files that describe the Iceberg table and the data files themselves. These files are typically stored in cloud storage (e.g., Amazon S3, Azure Blob Storage, or Google Cloud Storage). By configuring **bucket-level access rules** in your storage layer, you can control which users or services are allowed to interact with the underlying data. This approach, while effective, has its limitations. It’s challenging to enforce fine-grained access rules like row-level or column-level security at the file level, and it requires manual management of permissions across many objects.

### Engine Level Governance

Another layer where governance can be applied is at the **engine level**. Many query engines that interact with Iceberg tables, such as Dremio, Snowflake or Apache Spark, allow administrators to define access control rules for users on the platform. These engines can enforce permissions on who can execute certain queries or interact with specific datasets. However, this model has one significant limitation: the access rules only apply when queries are run **through the engine**. If someone accesses the data with a different engine, the engine-level permissions don't apply. This highlights the need for an additional layer of governance.

### Catalog Level Governance

The most effective way to secure Apache Iceberg tables is at the **catalog level**. With the recent adoption of the Iceberg REST Catalog specification  Catalogs can provide **storage credentials through credential vending**, ensuring that users can access the data metadata files. So catalogs are now introducing features to specify access rules based on catalog credentials, This centralized model offers a significant advantage: governance is applied **once**, and any engine or tool accessing the catalog adheres to the same access rules. This eliminates the need to configure permissions separately for each engine, simplifying governance and reducing the risk of misconfigurations.

With catalog-level governance, organizations can control access to Iceberg tables based on catalog credentials, making it the most comprehensive and secure approach to table governance.

## Catalog-Level Governance with Nessie and Apache Polaris

Now that we’ve established the importance of catalog-level governance for Iceberg tables, let’s explore how two prominent catalogs, **Nessie** and **Apache Polaris (Incubating)**, enable governance through catalog-level access controls.

### Nessie: Catalog-Level Governance for Iceberg

**Project Nessie** is an open-source catalog that supports Apache Iceberg and enables Git-like branching and versioning for your datasets. Nessie introduces an additional layer of governance by allowing you to control access to Iceberg tables based on **branches** and **references**. Here's how Nessie implements access control:

- **Reference-Based Access Control**: Nessie uses references such as branches and tags to control access to specific versions of your data. For instance, users may be granted read or write access to a specific branch (e.g., `prod`), while other branches may remain restricted.
  
- **Path-Based Access Control**: In Nessie, Iceberg tables are identified by a path (e.g., `namespace1/table1`), and permissions can be applied to paths. You can grant users or roles access to specific tables or namespaces, enabling fine-grained access controls.

- **Commit-Level Governance**: Nessie tracks changes through commits, and you can control who can commit changes to a branch. This ensures that only authorized users can make modifications to the Iceberg tables on a given branch.

With Nessie, governance isn’t just about who can read or write a table—it extends to controlling access to specific versions of your datasets, allowing for better control over data modifications and auditing capabilities.

### Apache Polaris (Incubating): Centralized Access Control with RBAC

**Apache Polaris (Incubating)** takes catalog-level governance even further by implementing a robust **Role-Based Access Control (RBAC)** model. Polaris provides a centralized platform to control access to Iceberg tables, namespaces, and even views. Here’s how Polaris manages access control:

- **Service Principals**: Polaris allows you to create **service principals**, which are unique identities for users or services interacting with the catalog. These service principals are granted access to resources like tables and namespaces via **principal roles**.

- **Principal Roles and Catalog Roles**: In Polaris, principal roles are used to group service principals logically. These roles can then be assigned **catalog roles**, which define specific privileges (such as read, write, or manage) on tables, namespaces, or entire catalogs. This hierarchical approach simplifies access control by grouping permissions at a high level.

- **Credential Vending**: Polaris employs **credential vending**, which securely provides short-lived credentials to query engines. This ensures that only authorized services can access Iceberg tables during query execution, enhancing security while maintaining performance.

- **Fine-Grained Privileges**: Polaris supports a wide range of table-level and namespace-level privileges, such as `TABLE_READ_DATA`, `TABLE_WRITE_DATA`, and `NAMESPACE_CREATE`. This allows you to define exactly what users or services can do with each resource in the catalog.

### Comparing Nessie and Polaris for Governance

While both Nessie and Apache Polaris offer catalog-level governance for Iceberg tables, their approaches differ in important ways:

- **Branching and Versioning**: Nessie’s Git-like model emphasizes controlling access based on branches and commits, making it ideal for scenarios where versioned access is critical. Polaris, on the other hand, focuses on centralized RBAC, with precise control over roles and permissions across multiple services.
  
- **Integration with Query Engines**: Both catalogs integrate seamlessly with popular query engines like Apache Spark, Dremio, and Trino, providing a secure and governed layer for accessing Iceberg tables. Polaris's credential vending system adds an extra layer of security by issuing temporary credentials for query execution.

- **Governance Scope**: Nessie shines in scenarios where tracking changes and managing versions is key, while Polaris excels at providing a centralized governance model with fine-grained control over a large number of users and services.

Apache Polaris offers a featured called "External Catalogs" so you can have a Nessie Catalog and Polaris Catalog and expose the Nessie Catalog for reading in that Polaris Catalog as external catalog. This allows you to take advantage of Nessie's git versioning and leverage Polaris's RBAC rules.

### Conclusion

Governance of Apache Iceberg tables is crucial for ensuring that only authorized users can access and modify your datasets. While Apache Iceberg's specification does not include governance within its scope, table-level governance can be achieved by applying access controls at the **file level**, **engine level**, and most effectively, the **catalog level**.

Both **Nessie** and **Apache Polaris (Incubating)** provide powerful catalog-level governance for Iceberg tables, each with its unique features and strengths. Whether you need Git-like versioning and branching with Nessie or centralized role-based access control with Polaris, both options offer robust solutions for securing your Iceberg tables and ensuring proper governance across your data lakehouse.


