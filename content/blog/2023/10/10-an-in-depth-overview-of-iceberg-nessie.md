---
tags:
  - "data lakehouse"
  - "data engineering"
author: "Alex Merced"
title: "An In-Depth Overview of Open Lakehouse Tech: Apache Iceberg & Nessie"
date: "2023-10-28T12:12:03.284Z"
category: "data lakehouse"
bannerImage: "https://i.imgur.com/no75OFq.png"
---

# Unleashing the Power of Open Lakehouse Technologies: Apache Iceberg and Project Nessie

Organizations are seeking innovative solutions to harness the full potential of their data while maintaining flexibility and avoiding vendor lock-in. Enter the era of the Data Lakehouse, a groundbreaking concept that marries the agility of a data lake with the structure and reliability of a data warehouse.

## The Data Lakehouse Revolution

Imagine operationalizing your data lake like a data warehouse, seamlessly blending the flexible, versatile nature data lakes are known for with the structured, organized nature of data warehouses. This is precisely what a Data Lakehouse aims to achieve. It represents a paradigm shift in data architecture that empowers organizations to combine the best of both worlds, providing the agility and scalability of a data lake while offering the performance, governance, and reliability of a data warehouse.

## Embracing Open Lakehouse: A Flexible Path Forward

Within the Data Lakehouse landscape, there is a particular breed known as the "Open Lakehouse." This approach hinges on the utilization of open-source, community-driven components such as Apache Iceberg and Project Nessie. By adopting Open Lakehouse technologies, organizations gain the maximum flexibility to mold their data infrastructure according to their unique needs while eliminating the constraints of vendor lock-in.

Apache Iceberg and Project Nessie are two key players in this open-source revolution, offering powerful tools and capabilities that take the concept of the Data Lakehouse to new heights. In this blog post, we will delve deeper into these game-changing technologies and explore how they are shaping the future of data management.

## The Essential Role of Tables and Catalogs

Every successful Data Lakehouse requires a structured approach to data management, much like a data warehouse. Table formats like Apache Iceberg play a pivotal role in enabling key warehouse functionalities, including ACID transactions, table evolution, and time-travel. However, it's not just about tables; you also need a robust catalog to help you keep track of these tables and make them portable across various ETL and querying tools.

This is where Project Nessie comes into play. It acts as the central repository for managing tables within your Data Lakehouse, ensuring that they remain organized, discoverable, and accessible. But Nessie goes beyond mere cataloging; it introduces the concept of Multi-Table Versioning, akin to "Git-for-Data", allowing you to track changes to your data tables over time, roll back to previous states, and maintain data lineage with ease.

Join us on this journey as we explore the Open Lakehouse and the transformative technologies of Apache Iceberg and Project Nessie. Discover how these open-source champions are reshaping data management paradigms, offering unparalleled flexibility, and empowering organizations to unlock the true potential of their data while embracing the future of data lakehouse architecture.

- [Get hands on with Apache Iceberg and Nessie by Building a Lakehouse on your laptop](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/)

# Apache Iceberg

## What is a Table Format

In the vast expanse of data stored within Data Lakehouses, you'll often find numerous individual data files, each meticulously organized in popular analytics formats like Parquet, ORC, or AVRO. While these file formats excel at storing and compressing data efficiently, they raise a crucial question: How do you transform a scattered collection of files into a cohesive and structured dataset that can be readily utilized for analytics, reporting, and other data-driven tasks?

The answer lies in understanding the concept of a "Table Format." A Table Format is essentially a mechanism that allows you to recognize and treat a group of these individual data files as a singular table or dataset. This recognition is not only about practicality but also about unlocking the full potential of your data and making it more manageable.

### Metadata Magic
At the core of the Table Format concept lies metadata. Metadata is like the blueprint that provides vital information about the data files, describing their schema, structure, and relationships. This metadata serves as a bridge between the raw data files and the analytical tools and systems that rely on structured datasets.

Here's why metadata is essential:

#### 1. Enabling Robust Functionality:

- **Schema Unification**: Metadata helps define a consistent schema for your dataset. This means that even if your data is stored in various formats or has evolved over time, the metadata ensures that you can access and query it with uniformity.

- **ACID Transactions**: Metadata plays a critical role in ensuring data integrity. It enables support for ACID (Atomicity, Consistency, Isolation, Durability) transactions, making sure that your data remains reliable and transactionally consistent.

- **Time-Travel Queries**: With metadata, you can track changes to your data over time, enabling time-travel queries that allow you to retrieve historical versions of your dataset.

### 2. Consistent Definitions:

- **Data Abstraction**: Metadata abstracts the underlying complexity of your data. Instead of dealing with myriad individual files, you interact with a well-defined table, making it easier to work with the data.

In essence, a Table Format, backed by metadata, transforms your scattered data files into a structured and organized dataset that can be efficiently used across various analytics and reporting tools. It acts as a unifying force, making your data more accessible, reliable, and consistent—a vital component in the world of Data Lakehouses.

- [Read More about the Metadata Structure Apache Iceberg, Apache Hudi and Delta Lake here](https://www.dremio.com/blog/exploring-the-architecture-of-apache-iceberg-delta-lake-and-apache-hudi/)

## Enter Apache Iceberg

Netflix, the streaming giant, found itself at the forefront of innovation. As they grappled with massive amounts of data, they needed a solution that could address the limitations of the existing Hive standard, which was prevalent at the time. This led to the creation of Apache Iceberg, a revolutionary table format that would transform the way Netflix managed and utilized their data.

### The Hive Standard Dilemma

Before Apache Iceberg came into the picture, the Apache Hive table standard was widely used for organizing and querying data within Netflix's data lake. 

> Apache Hive, a widely-used data warehousing and SQL-like query language tool in the Hadoop ecosystem, traditionally tracked tables using a directory-centric approach. In this schema, tables were essentially represented as directories within the Hadoop Distributed File System (HDFS). Each table directory contained subdirectories for partitions, and metadata such as schema and statistics were stored in the Hive Metastore, a separate database. 

However, it was not without its shortcomings. These limitations included:

1. **Stale Table Statistics**: Table statistics were not generated on every query, instead you had to regularly run ANALYZE TABLE queries to update table stats.

2. **ACID Guarantees on Updates**: The Hive standard struggled with providing ACID (Atomicity, Consistency, Isolation, Durability) guarantees on updates that spanned more than one partition. This posed a significant challenge for Netflix as they needed reliable data updates and consistency.

3. **Slow Speed Due to File Listing**: The Hive Metastore's approach of tracking tables as directories and sub-directory partitions led to slow file listing operations. This hindered the speed and efficiency of queries, which was a critical concern for a company like Netflix that relies on real-time data processing.

### Enter Apache Iceberg

Recognizing the need for a more efficient and robust solution, Netflix embarked on the journey to create Apache Iceberg. This innovative table format took a different approach to address the limitations of the Hive standard.

#### 1. Tracking Tables as Lists of Individual Files:

   - Instead of representing tables as directories and sub-directory partitions, Apache Iceberg tracks tables as lists of individual files. Groups of Individual files are tracked in "manifests" which also contain file statistics that can be used for pruning individual files from query plans.

#### 2. Leveraging Manifest Lists for Snapshots:

   - Each table snapshot is represented by a "manifest list" which list all the manifests relevant to the snapshot of the table. This file would also have manifest level stats for each manifest listed which could be used to prune whole manifests before pruning individual files.

#### 3. Enabling Time-Travel with Multiple Snapshots:

   - One of the standout features of Apache Iceberg is its support for multiple snapshots. Each snapshot captures the state of the data at a particular point in time. This feature enables time-travel queries, allowing users to access historical versions of the dataset effortlessly.

#### 4. Ensuring Up-to-Date Table Statistics:

   - Apache Iceberg's metadata-rich approach ensures up-to-date table statistics, addressing the issue of stale statistics that plagued the Hive standard. Accurate statistics are crucial for query optimization and performance.

#### 5. Optimistic Concurrency Control for ACID Transactions:

   - To provide ACID guarantees on data updates, Apache Iceberg employs optimistic concurrency control mechanisms. This means that updates can be made concurrently while maintaining data consistency and integrity, even when affecting multiple partitions.

Apache Iceberg emerged as a game-changing solution for Netflix, addressing the limitations of the Hive standard head-on. Its innovative approach to tracking tables as lists of individual files with rich metadata, along with support for multiple snapshots and ACID transactions, paved the way for faster queries, time-travel capabilities, and more reliable data management. Netflix's adoption of Apache Iceberg showcased how cutting-edge technology could revolutionize the way organizations handle their data within the context of a Data Lakehouse.

- [Learn more about Apache Iceberg from this Apache Iceberg 101 Article](https://www.dremio.com/blog/apache-iceberg-101-your-guide-to-learning-apache-iceberg-concepts-and-practices/)

### Apache Icebergs Features

Apache Iceberg, at the forefront of modern data lakehouse technology, boasts a robust set of features that empower organizations to manage their data efficiently and effectively. Here's a closer look at some of the standout features that make Apache Iceberg a game-changer in the world of data management:

#### ACID Transactions
Apache Iceberg brings ACID (Atomicity, Consistency, Isolation, Durability) transactions to your data lakehouse. It ensures that operations like creating, inserting, updating, and deleting data tables are carried out with transactional guarantees. This means your data remains reliable, consistent, and immune to data corruption even during concurrent operations.

#### Schema Evolution
Your data needs are never static, and Apache Iceberg understands that. It allows you to evolve your tables seamlessly without the need for a full rewrite. You can add columns, remove columns, rename columns, or change column types as your requirements change over time. This flexibility ensures your data schema can adapt to evolving business needs effortlessly.

#### Partition Evolution
Apache Iceberg introduces a unique and powerful feature known as partition evolution. You can modify how your table is partitioned without the need to rewrite the entire table. Since partitioning is primarily handled through metadata, new files are written with the new partitioning scheme. Any old files rewritten by compaction jobs also adopt the new partitioning scheme. This feature significantly reduces data movement and improves efficiency.

- [Read this Article on Partition Evolution](https://www.dremio.com/subsurface/future-proof-partitioning-and-fewer-table-rewrites-with-apache-iceberg/)

#### Hidden Partition
Typical partitioning patterns like month, day, hour, and year, or even custom truncation and bucketing, are seamlessly tracked as explicit transformations on the partition column within the metadata. This eliminates the need to create additional columns for partitioning, such as creating a "month" column based on a timestamp column. By doing so, Apache Iceberg simplifies the data structure and allows intuitive query patterns to take full advantage of partitioning, making data management more intuitive and user-friendly.

- [Read this Article on Hidden Partitioning](https://www.dremio.com/subsurface/fewer-accidental-full-table-scans-brought-to-you-by-apache-icebergs-hidden-partitioning/)

#### Time-Travel
Apache Iceberg empowers you to query tables at any valid snapshot in time. This feature, known as time-travel, is a game-changer for data analysis and auditing. You can easily access historical versions of your dataset, providing valuable insights and simplifying data lineage tracking. It ensures that your data remains a reliable source of information, not just for the present, but for the entire historical context of your organization's data.

Articles on other Iceberg Features:
- [Object Store Layout]()
- [Rollback inidividual tables](https://www.dremio.com/blog/dealing-with-data-incidents-using-the-rollback-feature-in-apache-iceberg/)
- [Table Level Branching and Tagging](https://www.dremio.com/blog/exploring-branch-tags-in-apache-iceberg-using-spark/)

### The Open Nature of the Apache Iceberg Ecosystem

The Apache Iceberg ecosystem stands as a testament to the power of open-source development, fostering a vibrant and collaborative community that continually pushes the boundaries of data lakehouse technology. Apache Iceberg's open nature is not just a philosophy; it's the driving force behind its widespread adoption and continuous innovation.

#### Interoperability Across Tools
One of the standout advantages of Apache Iceberg's open ecosystem is its compatibility with a vast array of data tools and platforms. This compatibility ensures that your data works seamlessly across a wide spectrum of tools, enabling a unified data experience. Apache Iceberg is not limited to a single tool or vendor; instead, it enjoys integration with an extensive list of tools, including Dremio, Apache Spark, Apache Flink, Bauplan, Snowflake, Trino, Presto, Starrocks, AWS Athena, and many more. This flexibility allows organizations to choose the tools that best suit their needs while maintaining data consistency and accessibility.

#### Transparent Development Process
Apache Iceberg embraces a transparent and inclusive development process that encourages community engagement and collaboration. Its public development meetings provide a forum for contributors and users to discuss features, improvements, and challenges openly. These meetings foster a sense of community ownership and ensure that development efforts align with the broader community's interests and needs.

Furthermore, discussions around Apache Iceberg's development happen on a public mailing list, allowing anyone to participate, share ideas, and contribute to the evolution of the project. This open and democratic approach ensures that the roadmap and priorities are shaped collectively, resulting in a more inclusive and community-driven development process.

#### Decentralized Governance
Perhaps one of the most compelling aspects of Apache Iceberg's open nature is its decentralized governance. Unlike proprietary solutions controlled by a single company, Apache Iceberg has no central entity that dictates the evolution of the format. Instead, it operates within the Apache Software Foundation (ASF), a nonprofit organization dedicated to open-source software development. This governance structure ensures that the focus of Apache Iceberg's development remains squarely in the broader community's interest.

The absence of a single controlling entity fosters an environment where innovation is driven by the collective expertise and needs of the community. It ensures that the technology remains vendor-neutral and free from the constraints of proprietary agendas. Consequently, Apache Iceberg evolves to meet the diverse requirements of a wide range of users and use cases.

- [Get hands on with Apache Iceberg and Nessie by Building a Lakehouse on your laptop](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/)

## Project Nessie

Various solutions, including Relational Databases and Hive, were employed as catalogs to track Apache Iceberg tables in data lakehouses, but they primarily focused on table tracking, offering limited flexibility and additional features. Recognizing this gap, Dremio spearheaded the development of an open-source project that would revolutionize Apache Iceberg table cataloging and introduce multi-table versioning in the data lakehouse ecosystem. This initiative gave birth to what we now know as Project Nessie.

Project Nessie is not just another catalog; it's a transactional catalog designed to track your Iceberg tables with finesse. What sets Nessie apart is its ability to handle multi-table versioning, akin to the famed version control system "Git," but tailored specifically for the data lakehouse. This unique feature empowers organizations to manage and version their data with the same level of control and precision as they do with code repositories.

### How Nessie Works

Nessie takes a lightweight approach to tracking metadata for Apache Iceberg tables enabling it to handle high throughput. Instead of creating full snapshots for every change, it primarily tracks the file paths to the latest metadata.json for each table. This metadata file contains crucial information about the table's structure and history. Engines, when querying the table, use this reference to discover the manifest lists and manifests they need to read the data.

Now, let's visualize the Nessie commit history:


```sql
Commit 1:
         +-------------------+
         | Table A - v1      |
         | Table B - v1      |
         +-------------------+

Commit 2 (Update to Table B):
         +-------------------+
         | Table A - v1      |
         | Table B - v2      |
         +-------------------+

Commit 3 (Creation of Table C):
         +-------------------+
         | Table A - v1      |
         | Table B - v2      |
         | Table C - v1      |
         +-------------------+
```

In the above ASCII art diagram:

**Commit 1 represents the initial commit**, where Table A is at version 1, and Table B is also at version 1. A change in version implies a change in the reference to the metadata.json location to a newer more up-to-date file.

**Commit 2 illustrates an update to Table B**, which moves it to version 2, while Table A remains at version 1.

**Commit 3 shows the creation of a new table**, Table C, which starts at version 1. Table A and Table B maintain their respective versions from the previous commits.
This Git-like approach allows Nessie to efficiently track changes across multiple tables, versions, and branches, making it a powerful tool for managing data in a data lakehouse environment with flexibility and granularity.

### Branching and Tagging with Nessie
One of the key advantages of using Nessie is its ability to enable branching and tagging, which are familiar concepts for those experienced with version control systems like Git. This capability enhances the management and organization of your data in a data lakehouse, allowing for parallel development, experimentation, and clear identification of specific points in the dataset's history.

#### Branching in Nessie
Branching in Nessie allows you to create isolated workstreams for your data tables, just like you would create branches in a code repository. This means you can work on different versions of your data concurrently without affecting the main dataset. Branches are excellent for tasks like ETL (Extract, Transform, Load) processes, where you may want to experiment with changes before incorporating them into the primary dataset.

#### Tagging in Nessie
Tagging, on the other hand, is a way to mark specific points in your dataset's history as significant milestones or releases. Tags serve as named references to specific commits, providing a way to easily reference and retrieve a particular snapshot of your data for auditing, reproducibility, or historical analysis.

Let's illustrate how branching and tagging work in Nessie with an ASCII art example:

```sql
Commit 1 (on Main branch):
         +-------------------+
         | Table A - v1      |
         +-------------------+

Branch "ETL" is created from Commit 1:
         +-------------------+
         | Table A - v1      |
         +-------------------+
               |
               V
           (ETL Branch)

Commit 2 (on ETL branch):
         +-------------------+
         | Table A - v1      |
         | Table B - v1      |
         +-------------------+

Commit 3 (on ETL branch):
         +-------------------+
         | Table A - v1      |
         | Table B - v1      |
         | Table C - v1      |
         +-------------------+

Merge from Commit 3 on ETL back into Main:
         +-------------------+
         | Table A - v1      |
         | Table B - v1      |
         | Table C - v1      |
         +-------------------+
```

**In this example:**

- Commit 1 represents the initial state of the main branch.

- The "ETL" branch is created from Commit 1.

- Commit 2 and Commit 3 are added to the "ETL" branch, introducing changes to Tables A, B, and C.

Finally, we merge the changes from Commit 3 on the "ETL" branch back into the main branch, resulting in an updated main branch with the changes from the ETL branch incorporated.
This branching and tagging approach in Nessie empowers data teams to manage and version data more flexibly, experiment with changes in isolated environments, and maintain clear historical records of dataset snapshots for various purposes, such as auditing and reproducibility.

### The Benefits of Multi-Table Versioning with Nessie
Multi-table versioning, a distinctive feature of Project Nessie, offers a host of benefits that fundamentally transform the way data is managed, maintained, and utilized in a data lakehouse environment. Let's explore these advantages in detail:

#### Reproducibility
Multi-table versioning enables reproducibility, a critical requirement for data-driven organizations. By tagging commits in Nessie, you can easily time-travel through your entire catalog. This means you can effortlessly revisit and access specific snapshots of your data, ensuring that your analyses, reports, and experiments are consistent and reproducible over time. Whether it's for compliance, auditing, or simply to recreate past states, Nessie's versioning capabilities ensure data reproducibility is a seamless process.

#### Isolation
With multi-table versioning, you gain the power of isolation. You can work on ETL processes and data transformations in isolated branches without affecting the production dataset. This is invaluable for data teams, as it allows for parallel development and experimentation. You can confidently experiment with changes, knowing that the main dataset remains unaffected until you choose to merge your work. This isolation mitigates risks and ensures that production data remains stable and reliable.

#### Multi-Table Transactions
Nessie's multi-table versioning introduces the capability for multi-table transactions. This means you can perform transactions that span multiple tables within a branch and publish those changes atomically to the production branch. This atomicity ensures data consistency, reliability, and integrity, even when dealing with complex data operations that involve multiple tables. Data engineers and analysts can confidently update and maintain data across various tables while guaranteeing that the changes are applied as a single, coherent unit.

#### Zero-Copy Environments
Creating copies of environments for experimentation is made efficient with Nessie's multi-table versioning. You can set up environments for testing and development without duplicating all data or metadata files. This "zero-copy" approach reduces storage overhead and speeds up the environment provisioning process. It also ensures that you are working with the most up-to-date data, making experimentation and development more agile and resource-efficient.

#### Multi-Table Rollback
When things go awry, Nessie's multi-table versioning provides a safety net through multi-table rollback capabilities. If an error or issue arises across multiple tables, you have the ability to rollback your entire catalog to a previous state, effectively undoing changes across all affected tables. This rapid recovery mechanism minimizes downtime and data inconsistencies, ensuring that your data remains resilient and dependable.

#### Data Quality Assurance
Data quality is paramount in any data-driven organization, and Nessie empowers data teams to enforce data quality assurance practices effectively. With multi-table versioning, you can validate and clean your data on a branch without exposing the changes to production until they pass quality checks. This means you can thoroughly inspect, validate, and refine your data, ensuring that only high-quality, accurate data is integrated into the production catalog. It's a proactive approach that safeguards data integrity and minimizes the risk of poor data impacting downstream processes.

- [Get hands on with Apache Iceberg and Nessie by Building a Lakehouse on your laptop](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/)

## Dremio - Bridging the Gap to Adopting Apache Iceberg, Nessie and The Open Lakehouse

[Dremio](https://www.dremio.com/get-started), a leading data lakehouse platform, plays a pivotal role in simplifying the adoption of Apache Iceberg and Nessie, making data management and analytics more accessible, efficient, and powerful. Here's how Dremio eases the integration and utilization of these technologies:

### 1. Robust Support for Apache Iceberg Tables Across Multiple Catalogs
Dremio offers robust support for working with Apache Iceberg tables across an expanding number of catalogs. Whether your data resides in Hive, S3, ADLS, AWS Glue, Nessie, and more, Dremio provides a unified interface for accessing and querying these tables. This compatibility ensures that you can leverage Apache Iceberg's benefits without being locked into a specific catalog.

### 2. Full DML Support for Apache Iceberg Tables
Dremio goes beyond read-only operations and provides full Data Manipulation Language (DML) support for Apache Iceberg tables. This means you can seamlessly perform inserts, updates, deletes, and other data manipulation tasks directly on Iceberg tables using Dremio.

### 3. Unique Commands for Apache Iceberg Tables
Dremio introduces unique commands tailored for Apache Iceberg tables. These commands include:

- **COPY INTO:** Adding files to an existing Iceberg table, simplifying data ingestion and management.

- **OPTIMIZE:** Initiating compaction operations to optimize table performance.

- **VACUUM:** Expiring snapshots and cleaning up unnecessary files to manage storage efficiently.

These commands enhance your control over Iceberg tables, making data management more efficient and automated.

### 4. ZeroETL with Reflections
Dremio's "Reflections" feature enables the creation of optimized Apache Iceberg-based materializations of datasets from any source connected to Dremio. This facilitates ZeroETL (Zero Extract, Transform, Load) patterns and data virtualization at scale. You can accelerate query performance by pre-aggregating and optimizing data in a way that suits your specific analytics needs.

### 5. Deep Nessie Integration
Dremio offers deep integration with Nessie, including Dremio Arctic, a cloud-managed version of Nessie from Dremio. With Dremio Arctic, you gain automated table optimization and cleanup, along with an intuitive UI for managing and auditing your Nessie/Arctic branches and tags. This integration simplifies version control and governance of your data assets.

### 6. Versioned Views and Data Marts
With Nessie catalogs, you can version views on your datasets in Dremio. This capability allows you to create "virtual data marts" with ease, enabling controlled access and versioning of data views. Combined with ZeroETL and data virtualization, Dremio minimizes manual data movement in your data lakehouse architecture.

### 7. Seamless Integration with BI Tools
Dremio provides a straightforward way to deliver your Apache Iceberg tables to your favorite Business Intelligence (BI) tools. With reflections, you can achieve sub-second query performance, ensuring that your BI users get the real-time insights they need.

### 8. Robust Semantic Layer
Dremio offers a robust semantic layer for organizing, documenting, and governing your Apache Iceberg tables. This layer enables data cataloging, data lineage tracking, and comprehensive governance capabilities, ensuring data is well-documented, understood, and governed throughout its lifecycle.

In essence, Dremio serves as the bridge that simplifies the adoption of Apache Iceberg and Nessie. It empowers organizations to harness the full potential of these technologies, enabling agile data management, data virtualization, and analytics at scale while ensuring governance, performance, and ease of use for data professionals.

- [Get hands on with Apache Iceberg, Nessie and Dremio by Building a Lakehouse on your laptop](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/)