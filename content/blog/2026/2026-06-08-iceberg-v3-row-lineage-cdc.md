---
title: "CDC Without Complexity Using Iceberg v3 Row Lineage"
date: "2026-06-08"
description: "Iceberg v3 row lineage adds _row_id and _last_updated_sequence_number to every table, enabling native change data capture without Debezium or Kafka. Technical deep dive with Snowflake and Databricks examples."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - "Iceberg v3 row lineage CDC"
  - "_row_id Iceberg"
  - "_last_updated_sequence_number"
  - "Change Data Capture lakehouse"
  - "incremental processing Iceberg"
---

Change data capture (CDC) has traditionally meant running a separate infrastructure stack. You install Debezium for MySQL or PostgreSQL, configure Kafka Connect, set up topics, tune the consumer lag, and then write a streaming pipeline that materializes the change events into your data lake. The operational burden is real: topic partitioning, schema registry compatibility, offset management, replay semantics, and the ever-present risk of a consumer falling behind and needing a full re-snapshot.

Apache Iceberg v3 row lineage eliminates most of that complexity. By assigning a unique, immutable `_row_id` and a monotonically increasing `_last_updated_sequence_number` to every row in every table, Iceberg gives you native CDC without any external tooling. The change tracking is built into the table format itself, readable by any engine that supports Iceberg v3.

This is not an abstract future capability. Row lineage is GA on Snowflake as of May 7, 2026. It is GA on Databricks Runtime 18.0+. Apache Spark 3.5+ supports it via the Iceberg 1.9+ library. The feature is specified in the Iceberg v3 spec and was contributed by Snowflake engineers Russell Spitzer, Nileema Shingte, and Attila-Peter Toth, with implementation support from Ryan Blue (Iceberg PMC chair) and Amogh Jahagirdar (Spark integration).

## What the v3 Spec Actually Requires

The Iceberg v3 spec mandates two new metadata columns for every table:

**`_row_id`:** A unique 64-bit integer assigned to each row at insert time. The value never changes for the lifetime of the row. Even if the row goes through 50 UPDATE operations, the `_row_id` stays the same. This is fundamentally different from surrogate keys defined at the application level, which might change during merges, re-ingests, or schema migrations.

**`_last_updated_sequence_number`:** The Iceberg commit sequence number of the snapshot that last modified the row. Every Iceberg snapshot has a monotonically increasing sequence number. When an UPDATE or MERGE operation touches a row, the `_last_updated_sequence_number` advances to the current snapshot's sequence number. Inserts set both `_row_id` and `_last_updated_sequence_number` in the same commit.

The `next-row-id` table property is mandatory for v3 tables. It tracks the next available row ID across all concurrent writers. The catalog is responsible for maintaining this counter, which ensures that two writers inserting rows at the same time do not produce duplicate `_row_id` values. This is the same kind of coordination that Iceberg already does for snapshot creation, so it does not add significant overhead to the commit protocol.

The lineage metadata is stored in the Parquet data files themselves, not in a separate metadata store. This means any engine that reads the Parquet files and understands the Iceberg v3 schema can query `_row_id` and `_last_updated_sequence_number` directly. The values are not hidden columns or system-managed metadata that only one engine can access. They are regular columns in the Parquet schema, fully exposed to SQL queries, and fully portable across engines.

A subtle but important requirement: OPTIMIZE TABLE (compaction) must preserve both `_row_id` and `_last_updated_sequence_number`. Without this guarantee, a routine maintenance operation would silently destroy the lineage chain. The spec requires that compaction jobs copy the existing values to the new files unchanged. The Databricks and Snowflake implementations both honor this requirement.

## How Row Lineage Enables CDC

Traditional CDC requires capturing database logs (binlog in MySQL, WAL in PostgreSQL) and converting them into a stream of INSERT, UPDATE, and DELETE events. Each event carries the before-and-after image of the row, plus metadata about the change operation. The consumer must replay these events in order and apply them to a target table.

Iceberg row lineage inverts this model. Instead of capturing changes at the source database, the lineage columns let you query for changes directly in the Iceberg table. The query pattern is:

```sql
SELECT *
FROM my_table
WHERE _last_updated_sequence_number > :last_processed_sequence
```

This returns every row that was inserted, updated, or deleted since the last time you polled. You do not need a separate CDC pipeline. You do not need Kafka. You do not need to maintain offset state for a source database connection. The sequence number is monotonically increasing and consistent across all writers, so your polling logic is straightforward: store the last sequence number you processed, then query for rows with a higher sequence number.

Detecting DELETEs requires an additional step because a deleted row no longer appears in the table. The Iceberg snapshot comparison API handles this. You can compare two snapshots (the current snapshot and the snapshot at your last poll) and list the files and row positions that changed. Combine this with `_row_id` values from before the delete, and you can identify exactly which rows were removed.

Snowflake's Dynamic Iceberg Tables use this mechanism internally. Dynamic Tables with declarative INSERT, UPDATE, DELETE, and MERGE operations use row lineage to track which rows need to be refreshed in the materialized result. The Snowflake v3 announcement confirmed this: "row lineage powers Dynamic Iceberg Tables with declarative syntax for INSERT, UPDATE, DELETE, and MERGE operations."

## The Debezium and Kafka Comparison

To understand row lineage's value, compare the operational complexity of the traditional CDC stack against the Iceberg-native approach.

**Traditional CDC (Debezium + Kafka + Kafka Connect):**

Components required: Debezium connector for each source database, Kafka cluster (typically 3+ brokers), Kafka Connect cluster, schema registry, consumer application or streaming pipeline. Each component has its own configuration, monitoring, failure recovery, and version management.

Failure modes: Debezium connector crashes and lags behind the database binlog position. Kafka topic retention expires and unprocessed events are lost. Schema registry compatibility check fails on a column rename. Consumer application crashes and offset commits are out of sync. Each of these failure modes requires manual intervention.

Latency: End-to-end latency from source database commit to Iceberg table visibility is typically 30-60 seconds in well-tuned pipelines, dominated by the Kafka round-trip and the Iceberg commit cycle.

**Iceberg row lineage CDC:**

Components required: Iceberg v3 table. That is it. No connectors, no Kafka, no schema registry.

Failure modes: The polling query might miss rows if the application crashes between processing rows and storing the sequence number. Mitigate by using an atomic transaction to store the sequence number and process the rows (or by accepting at-least-once semantics and deduplicating on `_row_id`).

Latency: Limited by the Iceberg commit frequency. If your writer commits every 30 seconds, you can poll every 30 seconds and see changes within that window. For real-time use cases, you can reduce the commit interval. The minimum practical commit interval is 1-2 seconds for most Iceberg implementations.

The tradeoff is that Iceberg row lineage tracks changes within the Iceberg table only. It does not capture changes in the source operational database. If you need to replicate from a transactional database (PostgreSQL, MySQL) into your lakehouse, you still need a CDC pipeline to extract the changes. Once those changes land in Iceberg, however, row lineage lets you propagate them through downstream materialized views, aggregation tables, and data marts without additional CDC infrastructure.

Russell Spitzer, Snowflake engineer and Iceberg PMC member, summarized the impact: "Iceberg users will be able to accurately determine the history of any row in their tables. Previously, we could only guess based on user-defined identity columns, but now it's built into the format itself."

## Incremental Processing Without External State

The most practical use case for row lineage is incremental processing. Batch ETL pipelines traditionally operate on full table scans. Every hour, the pipeline reads the entire source table, applies transformations, and writes the result. As tables grow beyond billions of rows, full scans become expensive in both compute cost and query time.

With row lineage, you can replace full scans with incremental queries:

```sql
-- Instead of reading the full source table every hour:
-- SELECT * FROM source_table

-- Read only rows that changed since last poll:
SELECT * FROM source_table
WHERE _last_updated_sequence_number > 1570000
```

A pipeline that was scanning 500 GB every hour can reduce to scanning 1-5 GB per hour, depending on the change rate. The compute savings are proportional to the ratio of changed rows to total rows. For tables with single-digit-percentage daily change rates, the operation changes from O(total rows) to O(changed rows), which is the difference between scanning 500 GB and scanning 5 GB per cycle.

The incremental pattern extends to multi-step pipelines. The first stage pulls changes from the source table. The second stage applies transformations to only the changed rows. The third stage writes the result to a target table with a MERGE operation that matches on `_row_id`. The entire pipeline runs incrementally, limited only by the change volume rather than the total table size.

## Audit and Compliance Use Cases

Row lineage provides a tamper-evident audit trail. Every row carries its creation time (via the `_row_id` assignment timestamp) and its last modification sequence number (mappable to a specific snapshot, which has a timestamp and a committer identity).

**Financial reconciliation:** When a discrepancy appears in a settlement table, you can query the `_last_updated_sequence_number` for the affected rows and map those sequence numbers back to Iceberg snapshots. Each snapshot has a commit timestamp and the identity of the writer that created it (in Snowflake, the warehouse and user context). You get an exact answer: "these rows were modified by user X, at time Y, as part of snapshot Z."

**GDPR right-to-erasure:** You delete rows for a specific user. Later, you need to confirm that the deletion is effective and that the rows have not been reintroduced by a downstream merge or reprocessing job. Query for the `_row_id` values of the deleted user. If they appear in any active snapshot, the deletion was incomplete. The `_row_id` is permanent, so you can verify its absence regardless of how many compaction or repartitioning jobs have run.

**Data quality debugging:** A batch load produces incorrect values in a fact table. The traditional approach is to sample rows and guess which operation introduced the bad data. With row lineage, you filter the affected rows by `_last_updated_sequence_number` and identify the exact snapshot that wrote them. The bad snapshot can be rolled back atomically, and the corrected pipeline can reprocess only the rows from that snapshot.

## Snowflake and Databricks Implementation Status

**Snowflake:** Row lineage is GA on Snowflake as of May 7, 2026 (Iceberg v3 GA). It is available for both Snowflake-managed Iceberg tables and tables accessed through the Horizon Iceberg REST Catalog API. Row lineage values are written for all INSERT, UPDATE, DELETE, and MERGE operations on v3 tables. The columns are queryable through standard SQL. Snowflake's Dynamic Tables use row lineage internally for incremental refresh.

**Databricks:** Row lineage is GA on Databricks Runtime 18.0+. Databricks emphasizes the compatibility between Iceberg v3 row lineage and Delta Lake row tracking. The two formats use compatible encodings, meaning a table written by Databricks can be read by Snowflake with lineage values intact, and vice versa. Databricks confirmed this in their v3 blog post: "Row lineage in Iceberg v3 is compatible with Delta's row tracking."

**Spark:** Apache Spark 3.5+ with Iceberg 1.9+ supports reading row lineage columns. Write support for the `next-row-id` metadata requires the Iceberg 1.11+ library (released May 19, 2026).

**Trino:** As of June 2026, Trino does not support v3 row lineage columns. The Trino Iceberg connector is not ready for v3 reads. This is consistent with Trino's slower adoption of the Iceberg spec.

## When Row Lineage Is Not Sufficient

Row lineage solves CDC within Iceberg tables, but it does not replace all CDC scenarios.

**Source database replication:** If you need to replicate changes from PostgreSQL, MySQL, MongoDB, or another operational database into Iceberg, you still need a CDC pipeline at the source. Row lineage only tracks changes once the data is already in Iceberg.

**Binary log-level granularity:** Traditional CDC captures every individual row change, including intermediate states that are quickly overwritten. Row lineage only tracks the final state of each row as of each Iceberg commit. You cannot replay the exact sequence of insert-update-update-delete that a row went through; you can only query the latest state and compare snapshots.

**Transactional consistency across tables:** Row lineage tracks changes within a single table. If you need change tracking across multiple tables in a single transaction, you need Iceberg's multi-table commit feature, which is supported in the Iceberg REST catalog spec but not yet uniformly implemented across engines.

**Real-time sub-second latency:** Row lineage operates at the Iceberg commit granularity. If your use case requires millisecond-level change visibility, you need a streaming platform (Kafka, Pulsar) that delivers events at sub-second latency. Row lineage is optimized for batch and micro-batch increments (seconds to minutes), not real-time streaming.

## Operational Practices

To use row lineage effectively, you need a small amount of operational discipline.

**Track the sequence number externally.** Your CDC consumer needs to persist the last processed sequence number. If the consumer crashes and restarts, it resumes from the stored sequence number. The storage can be a simple database table, a file in object storage, or a key-value store. The critical requirement is that the sequence number update and the downstream side effects are atomic or idempotent.

**Handle the at-least-once semantics.** The polling query reads all rows with a sequence number greater than the stored value. If the consumer crashes after reading but before persisting the new sequence number, some rows will be reprocessed. Your downstream operations should be idempotent on `_row_id`: a MERGE that matches on `_row_id` is safe to execute multiple times.

**Monitor the change rate.** If your table experiences a sudden spike in changes (a backfill, a full data reload, a schema migration), the incremental query will scan more data than usual. Monitor the number of rows returned by the CDC query and alert when it exceeds a threshold. This catches both unexpected data volume and potential consumer lag.

**Plan for snapshot retention.** Row lineage is useful only while the relevant Iceberg snapshots still exist. If your VACUUM policy deletes snapshots older than 7 days, you can only trace changes within that window. Adjust your snapshot retention to match your audit and compliance requirements. Snowflake recommends retaining at least 14 days of snapshots for tables with lineage-dependent downstream pipelines.

## The Bottom Line

Iceberg v3 row lineage eliminates the infrastructure tax of traditional CDC for lakehouse workloads. Two metadata columns (`_row_id` and `_last_updated_sequence_number`) provide change tracking that works across any Iceberg-compatible engine, requires no external infrastructure, and adds no ongoing operational burden beyond storing the values.

The technology is mature enough for production use. Snowflake and Databricks both support it at GA level. The spec is standardized and forward-compatible. If you are building a lakehouse architecture with multi-engine access, row lineage is the simplest way to implement incremental processing, audit tracking, and change data capture for data that already lives in Iceberg.

For source-to-lakehouse replication, you still need a CDC tool. But once the data is in Iceberg, row lineage replaces the Kafka-to-Iceberg pipeline, the debezium-to-iceberg connector, and the incremental processing framework. That is a significant simplification for any team managing data pipelines at scale.

---

*For more on Apache Iceberg v3, row lineage, and the Iceberg specification, visit [iceberg.apache.org](https://iceberg.apache.org). To try Iceberg v3 with row lineage in a governed multi-engine lakehouse, start a free trial at [dremio.com/get-started](https://www.dremio.com/get-started).*
