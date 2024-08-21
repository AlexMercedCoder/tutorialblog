---
title: Understanding Apache Iceberg's Metadata.json
date: "2024-08-21"
description: "The role and content of the metadata.json"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
  - apache iceberg
---

- [Free Copy of Apache Iceberg: The Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=metadatajson)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=metadatajson)

## Introduction

Apache Iceberg is a data lakehouse table format designed to solve many of the problems associated with large-scale data lakes turning them in data warehouses called data lakehouses. It allows for schema evolution, time travel queries, and efficient data partitioning, all while maintaining compatibility with existing data processing engines. Central to Iceberg's functionality is the `metadata.json` file, which serves as the heart of table metadata management.

### Purpose of metadata.json

The `metadata.json` file in Apache Iceberg serves several critical purposes:

- **Centralized Table Information**: It acts as a single source of truth for all metadata related to an Iceberg table. This includes schema definitions, partitioning strategies, and snapshot history, making it easier for data engines to understand and interact with the table.

- **Schema Evolution**: Iceberg tables can evolve over time, with new columns added or existing ones modified. The `metadata.json` tracks these changes, ensuring that historical data remains accessible and that queries can be executed against any point in the table's history.

- **Data Partitioning and Organization**: By defining how data is partitioned, `metadata.json` helps in optimizing data storage and query performance. Partitioning strategies can be updated (partition evolution), and this file keeps track of all such changes.

- **Snapshot Management**: Iceberg allows for snapshots, which are essentially versions of the table at different points in time. The metadata file records these snapshots, enabling features like time travel queries where users can query the table as it existed in the past.

- **Consistency and Integrity**: It ensures that all operations on the table maintain data integrity by providing a clear reference for what data should exist where and in what state.

This file is not just a static record but a dynamic document that evolves with the table, making it an indispensable component of Apache Iceberg's architecture. 

## Detailed Breakdown of Fields

### Identification and Versioning

#### **format-version**
- **Data**: Integer (1 or 2).
- **Purpose**: This field indicates the version of the Iceberg format used by the table. It's crucial for compatibility reasons; if an implementation encounters a version higher than what it supports, it must throw an exception to prevent potential data corruption or misinterpretation.

#### **table-uuid**
- **Data**: UUID.
- **Purpose**: Each table in Iceberg has a unique identifier, the `table-uuid`. This UUID is generated upon table creation and is used to ensure that the table's metadata matches across different operations, especially after metadata refreshes. If there's a mismatch, it indicates a potential conflict or corruption, prompting an exception.

### Table Structure and Location

#### **location**
- **Data**: URI.
- **Purpose**: This field specifies the base location where the table's data files, manifest files, and metadata files are stored. Writers use this to determine where to place new data, ensuring all parts of the table are correctly located.

#### **last-updated-ms**
- **Data**: Timestamp in milliseconds since the Unix epoch.
- **Purpose**: This field records the last time the metadata was updated. It's updated just before writing the metadata file, providing a timestamp for when the latest changes were committed.

### Schema Management

#### **schemas** and **current-schema-id**
- **Data**: `schemas` is a list of schema objects, each with a unique `schema-id`. `current-schema-id` is the ID of the schema currently in use.
- **Purpose**: Iceberg supports schema evolution, allowing tables to change over time. The `schemas` list keeps track of all schemas that have been used for the table, while `current-schema-id` points to the latest schema. This setup allows for historical data to be queried with the schema it was originally written with, ensuring data consistency and flexibility in schema changes.

### Data Partitioning

#### **partition-specs** and **default-spec-id**
- **Data**: `partition-specs` is a list of full partition spec objects, each detailing how data should be partitioned. `default-spec-id` points to the ID of the partition spec that writers should use by default.
- **Purpose**: Partitioning in Iceberg is crucial for data organization and query optimization. This field defines how data is divided into partitions, which can be based on various criteria like date, category, etc. The `default-spec-id` ensures that new data is partitioned according to the latest strategy unless specified otherwise.

### Snapshots and History

#### **last-sequence-number**, **current-snapshot-id**, **snapshots**, **snapshot-log**
- **Data**: `last-sequence-number` is a monotonically increasing long, `current-snapshot-id` is the ID of the latest snapshot, `snapshots` is a list of valid snapshots, and `snapshot-log` records changes in the current snapshot.
- **Purpose**: These fields manage the history of the table's states. Snapshots allow for time travel queries, where data can be queried as it existed at any point in time. The `snapshot-log` helps in tracking changes to the current snapshot, aiding in understanding the evolution of the table over time.

### Metadata Logging

#### **metadata-log**
- **Data**: A list of timestamp and metadata file location pairs.
- **Purpose**: This field logs previous metadata files, providing a history of metadata changes. It's useful for auditing, rollback operations, or understanding the evolution of the table's metadata over time.

### Sorting and Ordering

#### **sort-orders** and **default-sort-order-id**
- **Data**: `sort-orders` is a list of sort order objects, and `default-sort-order-id` specifies the default sort order.
- **Purpose**: These fields define how data is sorted within partitions or tables. While sorting is more relevant for writers, it can also affect how data is read, especially for certain types of queries where data order matters.

## Example Metadata.json

```json
{
  "format-version": 2,
  "table-uuid": "5f8b14d8-0a14-4e6a-8b04-7b1b9341c939",
  "location": "s3://my-bucket/tables/my_table",
  "last-updated-ms": 1692643200000,
  "last-sequence-number": 100,
  "last-column-id": 10,
  "schemas": [
    {
      "schema-id": 1,
      "columns": [
        {"name": "id", "type": "integer", "id": 1},
        {"name": "name", "type": "string", "id": 2}
      ]
    },
    {
      "schema-id": 2,
      "columns": [
        {"name": "id", "type": "integer", "id": 1},
        {"name": "name", "type": "string", "id": 2},
        {"name": "age", "type": "integer", "id": 3}
      ]
    }
  ],
  "current-schema-id": 2,
  "partition-specs": [
    {
      "spec-id": 1,
      "fields": [
        {"name": "name", "transform": "identity", "source-id": 2}
      ]
    },
    {
      "spec-id": 2,
      "fields": [
        {"name": "age", "transform": "bucket[4]", "source-id": 3}
      ]
    }
  ],
  "default-spec-id": 2,
  "last-partition-id": 4,
  "properties": {
    "commit.retry.num-retries": "5"
  },
  "current-snapshot-id": 3,
  "snapshots": [
    {"snapshot-id": 1, "timestamp-ms": 1692643200000},
    {"snapshot-id": 2, "timestamp-ms": 1692643500000},
    {"snapshot-id": 3, "timestamp-ms": 1692643800000}
  ],
  "snapshot-log": [
    {"timestamp-ms": 1692643200000, "snapshot-id": 1},
    {"timestamp-ms": 1692643500000, "snapshot-id": 2},
    {"timestamp-ms": 1692643800000, "snapshot-id": 3}
  ],
  "metadata-log": [
    {"timestamp-ms": 1692643200000, "metadata-file": "s3://my-bucket/tables/my_table/metadata/00001.json"},
    {"timestamp-ms": 1692643500000, "metadata-file": "s3://my-bucket/tables/my_table/metadata/00002.json"}
  ],
  "sort-orders": [
    {
      "order-id": 1,
      "fields": [
        {"name": "id", "direction": "ASC", "null-order": "NULLS_FIRST"}
      ]
    }
  ],
  "default-sort-order-id": 1,
  "refs": {
    "main": {"snapshot-id": 3}
  },
  "statistics": [
    {
      "snapshot-id": "3",
      "statistics-path": "s3://my-bucket/tables/my_table/stats/00003.puffin",
      "file-size-in-bytes": 1024,
      "file-footer-size-in-bytes": 64,
      "blob-metadata": [
        {
          "type": "table-stats",
          "snapshot-id": 3,
          "sequence-number": 100,
          "fields": [1, 2, 3],
          "properties": {
            "statistic-type": "summary"
          }
        }
      ]
    }
  ],
  "partition-statistics": [
    {
      "snapshot-id": 3,
      "statistics-path": "s3://my-bucket/tables/my_table/partition_stats/00003.parquet",
      "file-size-in-bytes": 512
    }
  ]
}
```

## How Engines Use metadata.json

### Query Planning

One of the primary uses of the `metadata.json` by data processing engines is in query planning. Here's how:

- **Partition Pruning**: With the `partition-specs` information, engines can have a the details of each historical partitioning scheme to match up with the partition id's referenced in manifest lists and manifest entries allowing it to prune data in unnecessary partitions from the scan plan.

- **Schema Validation**: Before executing a query, engines check the `current-schema-id` and the corresponding schema to ensure it uses the write schema to write new data files.

### Schema Evolution

- **Schema Tracking**: The `schemas` list and `current-schema-id` allow engines to understand the evolution of the table's schema. When a query involves historical data, the engine can use the schema that was active at the time the data was written, ensuring accurate results.

### Data Consistency

- **Snapshot Management**: Engines use the `current-snapshot-id` and `snapshots` list to ensure they are working with the latest state of the table or a specific historical snapshot. This feature is particularly useful for time travel queries or ensuring data consistency in distributed environments.

### Data Layout and Sorting

- **Data Layout**: By looking at the fields regarding partitioning and sort order, engines can make sure to write new data organized based on the right partitioning and sorting logic.

### Metadata Updates

- **Metadata Logging**: The `metadata-log` provides engines with a history of metadata changes. This can be used for rolling back the table to a previous state by identifying which metadata.json the catalog should reference.

### Optimistic Concurrency Controls

- **Sequence Number**: The sequence number property can be used to help maintain consistency when there are concurrent transactions. A write will project it's new sequence number before it begins and confirm that number is still the next one in sequence before committing. If another transaction has claimed the next sequence number before the original write commits, then the write can be reattempted.

### Conclusion on Engine Usage

The `metadata.json` in Apache Iceberg acts as a comprehensive guide for data engines, enabling them to efficiently manage, query, and evolve large-scale data tables. By providing detailed metadata, it allows for optimizations at various levels, from query planning to data consistency, making Iceberg tables highly performant and flexible.


## Resources to Learn More about Iceberg

- [Apache Iceberg 101](https://www.dremio.com/lakehouse-deep-dives/apache-iceberg-101/?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=metadatajson)
- [Hands-on Intro with Apache iceberg](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=metadatajson)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=metadatajson)
- [Free Copy Of Apache Iceberg: The Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=metadatajson)