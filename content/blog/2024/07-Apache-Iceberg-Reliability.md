---
title: Apache Iceberg Reliability
date: "2024-07-26"
description: "Why Apache Iceberg Works"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
  - Apache Iceberg
---

- [Get a Free Copy of "Apache Iceberg: The Definitive Guide"](https://bit.ly/am-iceberg-book)
- [Sign Up for the Free Apache Iceberg Crash Course](https://bit.ly/am-2024-iceberg-live-crash-course-1)
- [Calendar of Data Lakehouse Events](https://lu.ma/Lakehouselinkups)

[Apache Iceberg](https://www.dremio.com/blog/apache-iceberg-101-your-guide-to-learning-apache-iceberg-concepts-and-practices/) is a powerful table format designed to handle large analytic datasets reliably and efficiently. Reliability in data management is crucial for ensuring data integrity, consistency, and availability. This blog explores how Apache Iceberg addresses reliability concerns and provides robust solutions for data lakehouse architectures.

## Background

### Problems with Hive Tables in S3

Hive tables have long been used for managing data in distributed systems like S3. However, they come with several inherent problems:

- **Central Metastore and File System Tracking**: Hive tables use a central metastore to track partitions and a file system to track individual files. This setup makes atomic changes to a table's contents complex beyond updating a single partition by rewriting and then swapping.
- **Eventual Consistency**: In eventually consistent stores like S3, listing files to reconstruct the state of a table can lead to incorrect results.
- **Slow Listing Calls**: Job planning requires many slow listing calls (O(n) with the number of partitions), which can significantly impact performance.

## Apache Iceberg's Approach to Reliability

### Persistent Tree Structure

Apache Iceberg was designed to overcome these issues by [implementing a persistent tree structure](https://www.dremio.com/blog/how-apache-iceberg-is-built-for-open-optimized-performance/) to track data files:

- **Snapshots**: Each write or delete operation produces a new snapshot that includes the complete list of data files.

- **Metadata Reuse**: Iceberg reuses as much of the previous snapshot's metadata tree as possible to minimize write volumes.

### Atomic Operations

Iceberg ensures atomicity in its operations by:

- **Table Metadata File**: Valid snapshots are stored in the table metadata file (metadata.json), with a reference to the current snapshot.

- **Atomic Commits**: Commits replace the path of the current table metadata file using an atomic operation, ensuring that all updates to table data and metadata are atomic. This is the basis for serializable isolation.

### Serializable Isolation

Serializable isolation is a key feature that enhances reliability:

- **Linear History**: All table changes occur in a linear history of atomic updates.

- **Consistent Snapshot Reads**: Readers always use a consistent snapshot of the table without holding a lock, ensuring reliable reads.

- **Version History and Rollback**: Table snapshots are kept as history, allowing tables to roll back to previous states if a job produces bad data.

- **Safe File-Level Operations**: By supporting atomic changes, Iceberg enables safe operations like compacting small files and appending late data to tables.

## Benefits of Iceberg's Design

### Improved Reliability Guarantees

Iceberg's design provides several reliability guarantees:

- **Serializable Isolation**: Ensures all changes are atomic and occur in a linear sequence.

- **Reliable Reads**: Readers always access a consistent state of the table.

- **Version History and Rollback**: Facilitates easy rollback to previous table states.

- **Safe File-Level Operations**: Supports operations that require atomic changes, enhancing data integrity.

### Performance Benefits

In addition to reliability, Iceberg's design also offers performance advantages:

- **O(1) RPCs for Job Planning**: Instead of listing O(n) directories, planning a job requires O(1) RPC calls.

- **Distributed Planning**: File pruning and predicate push-down are distributed to jobs, eliminating the metastore as a bottleneck.

- **Finer Granularity Partitioning**: Removes barriers to finer-grained partitioning, improving query performance.

## Concurrent Write Operations

### Optimistic Concurrency

Apache Iceberg supports multiple concurrent writes using optimistic concurrency:

- **Assumption of No Concurrent Writers**: Each writer operates under the assumption that no other writers are working simultaneously.

- **Atomic Swaps**: Writers attempt to commit by atomically swapping the new table metadata file for the existing one.

- **Retry Mechanism**: If the atomic swap fails due to another writer's commit, the failed writer retries by writing a new metadata tree based on the latest table state.

### Cost of Retries

Iceberg minimizes the cost of retries by structuring changes to be reusable:

- **Reusable Work**: For instance, appends usually create a new manifest file for the appended data files, which can be added without rewriting the manifest on every attempt.

- **Efficient Retry**: This approach avoids expensive operations during retries, making the process efficient and reliable.

### Retry Validation

Commit operations in Iceberg are based on assumptions and actions:

- **Assumption Checking**: A writer checks if the assumptions are still valid based on the current table state after a conflict.

- **Safe Re-application**: If the assumptions hold, the writer re-applies the actions and commits the changes.

- **Example**: A compaction operation might rewrite `file_a.avro` and `file_b.avro` into `merged.parquet`. The commit is safe if both source files remain in the table. If not, the operation fails.

## Compatibility and Format Versioning

### Compatibility with Object Stores

Iceberg tables are designed to be compatible with any object store:

- **Avoiding File Listing and Rename Operations**: Iceberg tables do not rely on these operations, which makes them compatible with eventually consistent stores like S3.

- **Metadata-Driven Operations**: All operations are driven by metadata, ensuring consistency and reliability.

## Conclusion

Apache Iceberg's design principles and features make it a highly reliable solution for managing large analytic datasets:

- **Serializable Isolation and Atomic Operations**: Ensure data consistency and reliability.

- **Optimistic Concurrency**: Supports efficient and reliable concurrent write operations.

- **Compatibility and Performance**: Offers compatibility with various object stores and enhances performance through efficient metadata management.

By adopting Apache Iceberg, organizations can achieve a reliable, scalable, and performant data lakehouse architecture, ensuring data integrity and consistency across their data management workflows.

##### GET HANDS-ON

Below are list of exercises to help you get hands-on with Apache Iceberg to see all of this in action yourself!

- [Intro to Apache Iceberg, Nessie and Dremio on your Laptop](https://bit.ly/am-dremio-lakehouse-laptop)
- [JSON/CSV/Parquet to Apache Iceberg to BI Dashboard](https://bit.ly/am-json-csv-parquet-dremio)
- [From MongoDB to Apache Iceberg to BI Dashboard](https://bit.ly/am-mongodb-dashboard)
- [From SQLServer to Apache Iceberg to BI Dashboard](https://bit.ly/am-sqlserver-dashboard)
- [From Postgres to Apache Iceberg to BI Dashboard](https://bit.ly/am-postgres-to-dashboard)
- [Mongo/Postgres to Apache Iceberg to BI Dashboard using Git for Data and DBT](https://bit.ly/dremio-experience)
- [Elasticsearch to Apache Iceberg to BI Dashboard](https://bit.ly/am-dremio-elastic)
- [MySQL to Apache Iceberg to BI Dashboard](https://bit.ly/am-dremio-mysql-dashboard)
- [Apache Kafka to Apache Iceberg to Dremio](https://bit.ly/am-kafka-connect-dremio)
- [Apache Iceberg Lakehouse Engineering Video Playlist](https://bit.ly/am-iceberg-lakehouse-engineering)
- [Apache Druid to Apache Iceberg to BI Dashboard](https://bit.ly/am-druid-dremio)
- [Postgres to Apache Iceberg to Dashboard with Spark & Dremio](https://bit.ly/end-to-end-de-tutorial)