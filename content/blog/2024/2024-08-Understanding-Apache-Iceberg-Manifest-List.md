---
title: Understanding the Apache Iceberg Manifest List (Snapshot)
date: "2024-08-25"
description: "Continuing the Understand Apache Iceberg series, this article delves into the Manifest List, a critical component of Apache Iceberg's architecture."
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
  - Apache Iceberg
---
- [Free Copy of Apache Iceberg: The Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=social_free&utm_campaign=manifestlistblog&utm_content=alexmerced&utm_term=external_blog)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=social_free&utm_campaign=manifestlistblog&utm_content=alexmerced&utm_term=external_blog)

## Introduction

Apache Iceberg is an open lakehouse table format designed to take datasets in distributed file systems and turn them into database like tables. It has gained popularity for its ability to handle complex data engineering challenges, such as ensuring data consistency, enabling schema evolution, and supporting efficient query execution. One of the critical components that make this possible is its robust metadata management.

We will focus on a crucial aspect of Iceberg's metadata architecture—the **Manifest List** file. The Manifest List plays a pivotal role in Iceberg's snapshot mechanism, helping to track changes across the dataset and optimize query performance. Understanding the purpose of the Manifest List, the details it contains, and how query engines utilize it to plan which data files to scan is essential for data engineers looking to maximize the efficiency of their data lakehouses.

## What is a Manifest List?

The **Manifest List** is a fundamental component within Apache Iceberg’s architecture. It serves as a metadata file that tracks all the manifest files associated with a specific snapshot of a table. In simpler terms, when a snapshot is created, the Manifest List records which groups of data files (manifests) are included in that snapshot.

### The Role of the Manifest List in Iceberg

The primary role of the Manifest List is to efficiently manage and track the state of data within a snapshot. Unlike traditional systems where entire directories or large sets of files are scanned to identify relevant data, Iceberg uses the Manifest List to keep this process highly efficient. 

- **Efficient Data Tracking**: The Manifest List keeps a concise record of all manifest files, which in turn track the actual data files. This layered approach ensures that only the necessary metadata is accessed during query planning, significantly reducing the overhead.
  
- **Atomic Snapshot Management**: Every time a new snapshot is created, a new Manifest List is written. This allows for atomic updates, meaning that the changes to the dataset (like adding or removing data files) are committed in one go, ensuring consistency and isolation.

- **Optimization of Query Execution**: By summarizing information about the data in the manifests, the Manifest List allows query engines to quickly determine which parts of the data are relevant to a query, thus skipping over unnecessary files.

In essence, the Manifest List acts as a crucial index that ensures Iceberg can scale to manage massive datasets without compromising on query performance or data integrity.

## Contents Inside the Manifest List File

The Manifest List file is not just a simple pointer to other files; it is a rich metadata file that contains detailed information crucial for the efficient management and querying of data in Apache Iceberg. Each entry in a Manifest List corresponds to a manifest file and includes various fields that describe the state and characteristics of that manifest.

### Key Components of the Manifest List

Here are the essential fields you’ll find inside a Manifest List file:

- **`manifest_path`**: This field specifies the location of the manifest file. It is a string that points to the physical file in the storage system where the manifest is stored.

- **`manifest_length`**: This field indicates the size of the manifest file in bytes. Knowing the size helps in estimating the cost of reading the manifest, which can be important for optimizing query execution.

- **`partition_spec_id`**: Each table in Iceberg can have multiple partition specifications over time as the schema evolves. This field tracks the ID of the partition specification used to write the manifest, allowing Iceberg to apply the correct partitioning logic when reading the data.

- **`content`**: This field specifies the type of content tracked by the manifest, which could be either data files (`0`) or delete files (`1`). This distinction is critical for operations like merges and query planning, where data and deletes are handled differently.

- **`sequence_number` and `min_sequence_number`**: These fields are part of Iceberg's versioning system. The `sequence_number` represents when the manifest was added to the table, while `min_sequence_number` provides the earliest sequence number of all files tracked by this manifest. These fields are crucial for understanding the evolution of data and for implementing time-travel queries.

- **`added_files_count`, `existing_files_count`, `deleted_files_count`**: These fields provide a count of the files in different states within the manifest—added, existing, or deleted. This metadata helps query engines decide if a manifest is relevant for a particular operation, potentially skipping manifests that contain only deleted files or files outside the scope of the query.

- **Partition Summaries**: The Manifest List can also include summaries of partition fields, such as `lower_bound` and `upper_bound` for partition values, `contains_null`, and `contains_nan`. These summaries are incredibly useful for partition pruning during query planning, as they allow the query engine to skip entire manifests that do not contain relevant data based on the query’s filter conditions.

### How These Fields Relate to Data Files

Each of these fields in the Manifest List provides critical metadata that links the snapshot to its underlying data files:

- **Tracking Data Evolution**: The `sequence_number` fields ensure that Iceberg can accurately track the evolution of data over time, allowing for advanced features like time travel and consistent reads across multiple queries.

- **Optimizing Queries**: The combination of `content`, `partition_spec_id`, and partition summaries allows query engines to prune unnecessary data early in the query planning phase. For instance, if a query’s filter condition does not match the `lower_bound` or `upper_bound` of a partition, the query engine can skip reading the associated manifest and, consequently, the data files it tracks.

- **Efficient Data Management**: By summarizing the number and type of files (`added_files_count`, `existing_files_count`, `deleted_files_count`), Iceberg ensures that only the necessary manifests are read, further optimizing performance and reducing I/O operations.

```json
{
  "manifest-list": [
    {
      "manifest_path": "s3://bucket/path/to/manifest1.avro",
      "manifest_length": 1048576,
      "partition_spec_id": 1,
      "content": 0,
      "sequence_number": 1001,
      "min_sequence_number": 1000,
      "added_files_count": 5,
      "existing_files_count": 10,
      "deleted_files_count": 2,
      "added_rows_count": 500000,
      "existing_rows_count": 1000000,
      "deleted_rows_count": 200000,
      "partitions": [
        {
          "contains_null": false,
          "contains_nan": false,
          "lower_bound": "2023-01-01",
          "upper_bound": "2023-01-31"
        }
      ]
    },
    {
      "manifest_path": "s3://bucket/path/to/manifest2.avro",
      "manifest_length": 2097152,
      "partition_spec_id": 2,
      "content": 0,
      "sequence_number": 1002,
      "min_sequence_number": 1001,
      "added_files_count": 8,
      "existing_files_count": 7,
      "deleted_files_count": 3,
      "added_rows_count": 750000,
      "existing_rows_count": 700000,
      "deleted_rows_count": 150000,
      "partitions": [
        {
          "contains_null": true,
          "contains_nan": false,
          "lower_bound": "2023-02-01",
          "upper_bound": "2023-02-28"
        }
      ]
    }
  ]
}
```

### Conclusion

The Manifest List is an essential component of Apache Iceberg's architecture, playing a critical role in managing large datasets with efficiency and precision. By tracking the manifest files associated with each snapshot, the Manifest List enables Iceberg to provide powerful features like atomic snapshots, time travel, and optimized query execution. 

Through its detailed metadata, the Manifest List allows query engines to intelligently decide which data files to scan, significantly reducing unnecessary I/O and speeding up query performance. Whether you're dealing with a data lakehouse or a complex analytics platform, understanding how the Manifest List operates can help you harness the full potential of Apache Iceberg.

As the landscape of data engineering continues to evolve, tools like Iceberg, with its robust metadata management, will be increasingly vital in ensuring that data platforms remain scalable, efficient, and capable of handling the demands of modern data workloads.

For those looking to dive deeper into Apache Iceberg, consider exploring the following resources:

## Resources to Learn More about Iceberg

- [Apache Iceberg 101](https://www.dremio.com/lakehouse-deep-dives/apache-iceberg-101/?utm_source=ev_external_blog&utm_medium=social_free&utm_campaign=manifestlistblog&utm_content=alexmerced&utm_term=external_blog)
- [Hands-on Intro with Apache iceberg](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/?utm_source=ev_external_blog&utm_medium=social_free&utm_campaign=manifestlistblog&utm_content=alexmerced&utm_term=external_blog)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=social_free&utm_campaign=manifestlistblog&utm_content=alexmerced&utm_term=external_blog)
- [Free Copy Of Apache Iceberg: The Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=social_free&utm_campaign=manifestlistblog&utm_content=alexmerced&utm_term=external_blog)
