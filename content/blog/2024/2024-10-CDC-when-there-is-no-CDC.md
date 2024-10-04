---
title: Change Data Capture (CDC) when there is no CDC
date: "2024-10-04"
description: "Handling Synching Changing Data Across Systems"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
  - streaming
---

- [Free Copy of Apache Iceberg: The Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=cdc_when_there_is_no_cdc)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=cdc_when_there_is_no_cdc)
- [A Guide to Change Data Capture (CDC) with Apache Iceberg](https://www.dremio.com/blog/cdc-with-apache-iceberg/?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=cdc_when_there_is_no_cdc)
- [Using Apache Iceberg with Kafka Connect](https://www.dremio.com/blog/ingesting-data-into-nessie-apache-iceberg-with-kafka-connect-and-querying-it-with-dremio/?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=cdc_when_there_is_no_cdc)
- [Using Apache Iceberg with Flink](https://www.dremio.com/blog/using-flink-with-apache-iceberg-and-nessie/?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=cdc_when_there_is_no_cdc)
- [Streaming and Batch Data Lakehouses with Apache Iceberg, Dremio and Upsolver](https://www.dremio.com/blog/streaming-and-batch-data-lakehouses-with-apache-iceberg-dremio-and-upsolver/?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=cdc_when_there_is_no_cdc)

## Introduction

### Overview of CDC

Change Data Capture (CDC) is the process of identifying and capturing changes made to data within a database. It's a critical technique in modern data architectures, enabling systems to stay synchronized, whether for analytical purposes, replication, or near-real-time data streaming. CDC helps minimize the need to reprocess entire datasets by focusing on only the incremental changes—new inserts, updates, and deletions.

### Challenges with Systems Lacking Native CDC

Many databases offer native CDC features, such as change logs or triggers, that automatically track data modifications. However, when working with systems that don’t provide these built-in features, implementing CDC becomes more challenging. You need to design tables and processes that allow you to track changes manually while minimizing performance impact. Without proper design, you may face issues like slow updates, data inconsistencies, and complex synchronization logic.

### Goals of This Blog

In this blog, we will explore:
- **How to design tables** that enable efficient incremental updates, even in systems without CDC.
- **How to write SQL** for applying changes to other tables effectively, reducing the overhead of full table scans or complete reloads.

## Designing Tables for Incremental Updates

### Use of Timestamps and Version Columns

One of the simplest and most effective ways to track changes in systems without CDC is by adding `updated_at` and `created_at` columns to your tables. These timestamp columns can provide a clear audit trail of when rows were inserted or modified. For updates, the `updated_at` field gets refreshed, allowing you to easily query records that have changed since the last update.

Additionally, incorporating a version column helps track the number of times a record has been modified. Each time a row is updated, the version increases, making it easier to detect whether a record needs to be synchronized elsewhere. For soft deletes, adding a `deleted_at` column can signal when a row has been marked for deletion without physically removing it.

### Storing Historical Data

Maintaining historical data is another technique for simulating CDC. You can create history or audit tables that store every change made to a record, preserving its previous versions. This enables you to recreate the full history of changes while still maintaining a "live" table with only the current state.

When capturing history:
- Use a combination of `INSERT` and `UPDATE` triggers, or manually insert new versions into the history table.
- Each entry can include metadata like `modified_by` and `operation_type` (insert, update, delete) to clarify how the change occurred.

### Partitioning and Indexing Strategies

For larger tables, partitioning by time or version can help optimize incremental updates. By partitioning on columns like `updated_at`, you can narrow down the scope of queries to the most recent partitions, avoiding costly full table scans.

Similarly, indexing on these columns can accelerate queries by making it faster to retrieve the most recently modified rows. Keep in mind that partitioning and indexing come with trade-offs, such as increased write overhead, so it’s important to balance these optimizations based on the use case.

## Writing SQL for Efficient Incremental Updates

### Identifying the Changes

Once your tables are designed to track changes, the next step is to efficiently query for only the modified rows. This can be achieved by leveraging the `updated_at` or `version` columns.

For example, to select all records updated in the last hour, you can use a query like:

```sql
SELECT * 
FROM your_table
WHERE updated_at > NOW() - INTERVAL '1 hour';
```

Alternatively, if you're using a versioning system, you can select all records with a version greater than the last processed version:

```sql
SELECT * 
FROM your_table
WHERE version > :last_processed_version;
```

These queries allow you to efficiently identify incremental changes without having to scan the entire table.

### Merging Changes into Target Tables

After identifying the changes, you'll want to apply them to the target tables (such as a reporting or analytics table). Depending on the database you're using, you might employ different strategies. If the database supports the MERGE statement, it can handle inserts, updates, and deletions in a single query.

Here’s an example of how you can merge changes from a source table into a target table:

```sql
MERGE INTO target_table AS t
USING source_table AS s
ON t.id = s.id
WHEN MATCHED AND s.updated_at > t.updated_at THEN
  UPDATE SET t.column1 = s.column1, t.updated_at = s.updated_at
WHEN NOT MATCHED THEN
  INSERT (id, column1, updated_at) 
  VALUES (s.id, s.column1, s.updated_at);
```

In systems where MERGE isn’t supported, you can use a combination of INSERT and UPDATE queries:

```sql
-- Update existing records
UPDATE target_table AS t
SET column1 = s.column1, updated_at = s.updated_at
FROM source_table AS s
WHERE t.id = s.id AND s.updated_at > t.updated_at;

-- Insert new records
INSERT INTO target_table (id, column1, updated_at)
SELECT s.id, s.column1, s.updated_at
FROM source_table AS s
WHERE NOT EXISTS (
    SELECT 1 FROM target_table t WHERE t.id = s.id
);
```

### Handling Conflicts
When applying incremental changes, conflicts can arise, especially if multiple systems or users are updating the same data. One common conflict occurs when duplicate records are inserted or when simultaneous updates lead to inconsistencies.

To manage this, databases often provide clauses like `ON CONFLICT` (in PostgreSQL) or similar approaches in other systems. For example, to avoid conflicts during inserts, you can specify an action in case of a duplicate key:

```sql
INSERT INTO target_table (id, column1, updated_at)
VALUES (:id, :column1, :updated_at)
ON CONFLICT (id) DO UPDATE
SET column1 = EXCLUDED.column1, updated_at = EXCLUDED.updated_at;
```

This ensures that if the row already exists, it will be updated rather than throwing an error.

## Batch Processing and Scheduling Incremental Updates

### Batching Updates
To avoid overwhelming your system or locking your database during large updates, batching incremental updates can be an effective strategy. Instead of applying all changes at once, process them in smaller, manageable chunks. For example, you can process updates in batches of 1,000 rows at a time.

Here’s how you could implement batch processing in SQL:

```sql
-- Assume a batch size of 1000 rows
WITH batch AS (
    SELECT * FROM source_table 
    WHERE updated_at > :last_processed_time
    ORDER BY updated_at
    LIMIT 1000
)
-- Apply the batch to the target table
MERGE INTO target_table AS t
USING batch AS b
ON t.id = b.id
WHEN MATCHED AND b.updated_at > t.updated_at THEN
  UPDATE SET t.column1 = b.column1, t.updated_at = b.updated_at
WHEN NOT MATCHED THEN
  INSERT (id, column1, updated_at) 
  VALUES (b.id, b.column1, b.updated_at);
```

After processing each batch, you can update your tracking mechanism (e.g., the last processed timestamp or version) and continue with the next batch.

### Efficient Scheduling of Updates
To ensure that your incremental updates happen regularly, you need an efficient scheduling mechanism. For databases without native job scheduling, you can rely on external tools such as cron jobs, Airflow, or other orchestration systems.

Here’s an example of how you might schedule your updates using a cron job:

```bash
# Run every 10 minutes
*/10 * * * * /path/to/script/incremental_update.sh
```

In environments using more complex workflows, you can configure tools like Apache Airflow to orchestrate these updates, handling dependencies and retries in case of failure.

```python
# Airflow DAG for incremental updates
from airflow import DAG
from airflow.operators.bash_operator import BashOperator
from datetime import datetime

dag = DAG('incremental_update', start_date=datetime(2023, 1, 1))

run_incremental_update = BashOperator(
    task_id='run_incremental_update',
    bash_command='python /path/to/incremental_update.py',
    dag=dag
)

run_incremental_update
```
By automating these updates, you can ensure your target systems stay synchronized with minimal manual intervention.

## Monitoring and Validating Incremental Updates

### Tracking Changes Applied

To ensure that your incremental updates are working as expected, it's essential to track and log the changes applied to your target tables. This can be done by maintaining control tables or logs that record the status of each update operation. These logs can store details such as the number of rows processed, the time the update occurred, and any errors that were encountered.

For example, you can create a simple audit table to track update operations:

```sql
CREATE TABLE update_log (
    update_id SERIAL PRIMARY KEY,
    table_name TEXT,
    rows_updated INT,
    update_time TIMESTAMP DEFAULT NOW(),
    status TEXT,
    error_message TEXT
);
```

After each incremental update, you can insert a record into this log to track the operation:

```sql
INSERT INTO update_log (table_name, rows_updated, status)
VALUES ('target_table', :rows_updated, 'success');
```

If an error occurs, you can capture it and log the details:

```sql
INSERT INTO update_log (table_name, status, error_message)
VALUES ('target_table', 'failed', 'Error details...');
```

### Data Validation and Consistency Checks
Beyond simply logging updates, you should also perform regular validation checks to ensure the correctness of the data. One approach is to compare record counts between the source and target tables to ensure they are in sync:

```sql
-- Count of records in the source table since last update
SELECT COUNT(*) FROM source_table WHERE updated_at > :last_update_time;

-- Count of records updated in the target table
SELECT COUNT(*) FROM target_table WHERE updated_at > :last_update_time;
```

If the counts don't match, it could indicate a data inconsistency or a problem with the update process.

You can also compute checksums or hash values of critical columns to validate that the data was transferred without corruption:

```sql
-- Compute checksum on the source
SELECT MD5(ARRAY_AGG(column1 || column2)) AS checksum
FROM source_table WHERE updated_at > :last_update_time;

-- Compute checksum on the target
SELECT MD5(ARRAY_AGG(column1 || column2)) AS checksum
FROM target_table WHERE updated_at > :last_update_time;
```

If discrepancies are found, you can investigate and reprocess the affected batches. Regular consistency checks ensure that the target table accurately reflects the latest state of the source data.

## Real-world Example: Applying Incremental Changes

### Scenario Setup
Let’s take a practical example where you are managing sales transactions in a source table and need to keep an analytics table in sync for reporting purposes. The source table contains new and updated transactions, and the target table is an aggregated summary of sales per product.

- **Source Table (sales_transactions):** Contains individual transaction records with `transaction_id`, `product_id`, `amount`, and `updated_at`.
- **Target Table (product_sales):** Aggregates total sales by product with `product_id`, `total_sales`, and `last_updated`.

### Step-by-step Guide

#### Design the source table:

Ensure the source table includes an `updated_at` column to track when each transaction was last modified.

```sql
CREATE TABLE sales_transactions (
    transaction_id SERIAL PRIMARY KEY,
    product_id INT,
    amount DECIMAL(10, 2),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Write SQL for incremental updates:

Use SQL to identify the new or modified transactions since the last update. For example, select transactions that occurred in the last 24 hours:

```sql
SELECT product_id, SUM(amount) AS total_sales
FROM sales_transactions
WHERE updated_at > NOW() - INTERVAL '24 hours'
GROUP BY product_id;
```

#### Merge changes into the target table:

Use a `MERGE` or `UPSERT` query to update the `product_sales` table with the latest totals. If the product exists, update its total_sales; otherwise, insert a new record:

```sql
MERGE INTO product_sales AS p
USING (SELECT product_id, SUM(amount) AS total_sales
       FROM sales_transactions
       WHERE updated_at > NOW() - INTERVAL '24 hours'
       GROUP BY product_id) AS s
ON p.product_id = s.product_id
WHEN MATCHED THEN
  UPDATE SET p.total_sales = p.total_sales + s.total_sales, p.last_updated = NOW()
WHEN NOT MATCHED THEN
  INSERT (product_id, total_sales, last_updated)
  VALUES (s.product_id, s.total_sales, NOW());
```
### Handle batching and scheduling:

If the transaction volume is large, you can batch these updates by limiting the number of rows processed in each run. For example:
```sql
SELECT product_id, SUM(amount) AS total_sales
FROM sales_transactions
WHERE updated_at > :last_update_time
ORDER BY updated_at
LIMIT 1000
GROUP BY product_id;
```
Schedule this query to run periodically using a job scheduler like cron or an orchestration tool like Airflow to ensure the data stays up-to-date.

## Real-World CDC Alternatives for Non-CDC Systems

### Leveraging Triggers for Change Capture

In databases that support triggers but lack full CDC features, you can use triggers to manually implement a change tracking system. Triggers allow you to capture row-level changes on insert, update, or delete operations and store these changes in a separate table.

For example, in PostgreSQL, you can create a trigger to capture changes:

```sql
CREATE TABLE change_log (
    id SERIAL PRIMARY KEY,
    table_name TEXT,
    operation_type TEXT,
    record_id INT,
    old_data JSONB,
    new_data JSONB,
    change_time TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION log_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO change_log (table_name, operation_type, record_id, old_data, new_data)
    VALUES (TG_TABLE_NAME, TG_OP, NEW.id, OLD, NEW);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER capture_changes
AFTER INSERT OR UPDATE OR DELETE
ON your_table
FOR EACH ROW
EXECUTE FUNCTION log_changes();
```

This approach simulates CDC by writing changes to a log table. You can then process this change log periodically to apply updates to your target systems.

### Using External CDC Tools
In cases where implementing your own CDC system becomes too complex or resource-intensive, third-party CDC tools like Debezium can provide a reliable solution. Debezium, for instance, is an open-source platform that captures database changes and publishes them as events in Kafka, allowing you to stream changes to other systems in near-real-time.

Debezium supports databases like MySQL, PostgreSQL, and MongoDB and can track insert, update, and delete operations via the database’s binlog or equivalent. This tool can be particularly useful when scaling up your CDC needs across multiple systems.

### Batch Processing with ETL Pipelines
Another alternative is to simulate CDC through traditional ETL (Extract, Transform, Load) pipelines. Many ETL tools allow you to set up incremental data loads where only the changes since the last load are processed. This approach might not provide real-time changes, but it can work well for batch processing use cases.

Tools like Apache NiFi, Airflow, and Talend allow you to build robust ETL workflows that can efficiently handle incremental updates. You can configure them to read from source tables based on timestamps or other tracking columns and apply those changes to target systems.

This approach is often more suitable for less frequent updates or larger datasets where near-real-time processing is not necessary.


## Conclusion

### Summary of Key Takeaways

In systems that don’t have native CDC (Change Data Capture) capabilities, it is still possible to design a process for capturing and applying incremental updates efficiently. By carefully structuring your tables with timestamps, version columns, or history tables, you can track changes without requiring full table scans. Writing efficient SQL for merging, batching, and scheduling updates ensures that the changes are applied in a scalable and reliable manner.

Key points to remember:
- **Design your tables** to support change tracking by using columns like `updated_at`, `created_at`, and `version`.
- **Use SQL strategies** like `MERGE` or `UPSERT` to apply changes to your target tables, minimizing resource consumption.
- **Batch your updates** to avoid overwhelming your database and schedule these operations for optimal performance.
- **Monitor and validate** changes to ensure your target data remains consistent and correct.

### Further Improvements

While the approaches covered in this blog offers practical solutions for implementing CDC in systems without built-in features, there are always opportunities for further optimization:
- **Adopting middleware or third-party tools**: Tools like **Debezium** or **Apache Kafka** can provide change capture capabilities even for systems without native CDC support.
- **Moving towards CDC-enabled databases**: As data needs grow, switching to databases with native CDC features can offer better scalability and reliability.
- **Implementing more advanced validation mechanisms**: Consider using more sophisticated data quality tools or building in redundancy checks for mission-critical data.

With these principles, you can handle incremental updates in a variety of systems, helping to synchronize your data with efficiency and reliability.

- [Free Copy of Apache Iceberg: The Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=cdc_when_there_is_no_cdc)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=cdc_when_there_is_no_cdc)
- [A Guide to Change Data Capture (CDC) with Apache Iceberg](https://www.dremio.com/blog/cdc-with-apache-iceberg/?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=cdc_when_there_is_no_cdc)
- [Using Apache Iceberg with Kafka Connect](https://www.dremio.com/blog/ingesting-data-into-nessie-apache-iceberg-with-kafka-connect-and-querying-it-with-dremio/?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=cdc_when_there_is_no_cdc)
- [Using Apache Iceberg with Flink](https://www.dremio.com/blog/using-flink-with-apache-iceberg-and-nessie/?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=cdc_when_there_is_no_cdc)
- [Streaming and Batch Data Lakehouses with Apache Iceberg, Dremio and Upsolver](https://www.dremio.com/blog/streaming-and-batch-data-lakehouses-with-apache-iceberg-dremio-and-upsolver/?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=cdc_when_there_is_no_cdc)
