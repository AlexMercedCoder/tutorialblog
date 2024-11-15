---
title: Deep Dive into Dremio's File-based Auto Ingestion into Apache Iceberg Tables
date: "2024-11-15"
description: "Auto ingesting data from JSON, CSV, and Parquet files into Apache Iceberg Tables"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
  - apache iceberg
---

- [Blog: What is a Data Lakehouse and a Table Format?](https://www.dremio.com/blog/apache-iceberg-crash-course-what-is-a-data-lakehouse-and-a-table-format/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=autoingestdremio&utm_content=alexmerced&utm_term=external_blog)
- [Free Copy of Apache Iceberg the Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=autoingestdremio&utm_content=alexmerced&utm_term=external_blog)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=autoingestdremio&utm_content=alexmerced&utm_term=external_blog)
- [Lakehouse Catalog Course](https://hello.dremio.com/webcast-an-in-depth-exploration-on-the-world-of-data-lakehouse-catalogs-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=autoingestdremio&utm_content=alexmerced&utm_term=external_blog)
- [Iceberg Lakehouse Engineering Video Playlist](https://www.youtube.com/watch?v=SIriNcVIGJQ&list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe) 

Manually orchestrating data pipelines to handle ever-increasing volumes of data can be both time-consuming and error-prone. Enter **Dremio Auto-Ingest**, a game-changing feature that simplifies the process of loading data into **Apache Iceberg** tables.

With Auto-Ingest, you can create event-driven pipelines that automatically respond to changes in your object storage systems, such as new files being uploaded to Amazon S3. This approach eliminates the need for constant manual intervention, enabling real-time or near-real-time updates to your Iceberg tables. Whether you’re ingesting structured CSV data, semi-structured JSON files, or compact Parquet formats, Dremio Auto-Ingest ensures a seamless, reliable pipeline.

But why choose Auto-Ingest over traditional methods? The answer lies in its ability to handle ingestion challenges like deduplication, error handling, and custom formatting, all while integrating smoothly with modern cloud infrastructure. 

## Understanding Auto-Ingest for Apache Iceberg

To fully appreciate the power of Dremio Auto-Ingest, it’s important to understand the core components and how they work together. At its heart, Auto-Ingest is designed to create a seamless pipeline that transfers files from object storage into **Apache Iceberg tables** with minimal manual intervention. Let’s break it down.

### What is a Pipe Object?

The **pipe object** is the central feature enabling Auto-Ingest. Think of it as a pre-configured connection between your cloud storage and an Iceberg table. The pipe listens for events, such as the arrival of a new file, and automatically triggers the ingestion process. This eliminates the need for periodic manual data loads or complex batch scripts.

Here’s what makes a pipe object powerful:
- **Notification Provider**: Specifies the mechanism for event detection, such as AWS SQS for Amazon S3.
- **Notification Queue Reference**: Points to the event queue where file changes are registered.
- **Deduplication**: Ensures no duplicate files are ingested, even if files are re-uploaded or processed multiple times.
- **Flexible Configuration**: Allows you to define file formats, custom settings, and error-handling rules.

### How Does Auto-Ingest Work?

Auto-Ingest leverages an **event-driven model**:
1. A file is added or updated in the storage location (e.g., an S3 bucket).
2. A notification is sent to the queue specified in the pipe configuration.
3. The pipe detects the notification and triggers the ingestion process using the `COPY INTO` command to move data into the Iceberg table.

This approach is both reactive and efficient, ensuring that your data remains fresh without the overhead of constant polling or manual triggers.

### Benefits of Using Auto-Ingest

Why choose Auto-Ingest for your Iceberg tables? Here are some key benefits:
1. **Real-Time Updates**: Ensure your Iceberg tables always reflect the latest data.
2. **Simplified Pipeline Management**: Replace complex, custom ingestion scripts with a single declarative configuration.
3. **Data Quality Assurance**: Built-in deduplication and error-handling mechanisms help maintain clean, accurate datasets.
4. **Scalability**: Auto-Ingest works seamlessly with cloud-native object storage, enabling pipelines that scale with your data.

By combining the power of Apache Iceberg with Dremio’s Auto-Ingest, you can build modern, efficient pipelines that support both analytical and operational workloads with ease.

## Step-by-Step Guide: Setting Up Auto-Ingest

 By following these steps, you can automate data ingestion from cloud storage and ensure seamless integration with your data lakehouse.

### 1. Prerequisites

Before creating an Auto-Ingest pipeline, ensure the following:
- **Cloud Storage Setup**: Configure your storage location (e.g., Amazon S3) as a source in Dremio.
- **Notification Service**: Set up an event notification provider, such as AWS SQS, to monitor changes in the storage location.
- **Apache Iceberg Table**: Ensure the target table exists and is properly configured in Dremio.
- **Supported File Formats**: Verify that your files are in one of the supported formats: CSV, JSON, or Parquet.

### 2. Creating a Pipe Object

The `CREATE PIPE` command is the foundation of the Auto-Ingest setup. It connects your storage location to an Iceberg table, specifying ingestion parameters.

#### Syntax
```sql
CREATE PIPE [ IF NOT EXISTS ] <pipe_name>
  [ DEDUPE_LOOKBACK_PERIOD <number_of_days> ]
  NOTIFICATION_PROVIDER <notification_provider>
  NOTIFICATION_QUEUE_REFERENCE <notification_queue_ref>
  AS COPY INTO <table_name>
    [ AT BRANCH <branch_name> ]
    FROM '@<storage_location_name>'
    FILE_FORMAT '<format>'
    [(<format_options>)]
```

#### Key Parameters
- **`DEDUPE_LOOKBACK_PERIOD:`** Defines the time window (in days) for deduplication. Default is 14 days.
- **`NOTIFICATION_PROVIDER:`** Specifies the event notification system, such as AWS_SQS for Amazon S3.
- **`NOTIFICATION_QUEUE_REFERENCE:`** Points to the notification queue (e.g., the ARN of an SQS queue).
- **`COPY INTO:`** Specifies the target Iceberg table and optional branch.
- **`@<storage_location_name>:`** Refers to the source storage location configured in Dremio.
- **File Format Options:** Custom configurations for CSV, JSON, or Parquet files.

#### Examples

Basic Pipe for CSV Files

```sql
CREATE PIPE my_pipe
  NOTIFICATION_PROVIDER AWS_SQS
  NOTIFICATION_QUEUE_REFERENCE 'arn:aws:sqs:us-east-1:123456789012:my-queue'
  AS COPY INTO sales_data
    FROM '@s3_source/data_folder'
    FILE_FORMAT 'csv';
```

Pipe with Deduplication

```sql
CREATE PIPE deduped_pipe
  DEDUPE_LOOKBACK_PERIOD 7
  NOTIFICATION_PROVIDER AWS_SQS
  NOTIFICATION_QUEUE_REFERENCE 'arn:aws:sqs:us-east-1:123456789012:dedupe-queue'
  AS COPY INTO analytics_table
    FROM '@s3_source/analytics'
    FILE_FORMAT 'parquet';
```

### 3. Customizing File Formats
Dremio allows you to tailor the ingestion process based on your file type and data requirements. Here’s how to configure each format:

**CSV Options:**
- **Delimiters (`FIELD_DELIMITER`)**
- **Null handling (`EMPTY_AS_NULL`)**
- **Header extraction (`EXTRACT_HEADER`)**
- **Error handling (`ON_ERROR`)**

**JSON Options:**
- **Date and time formatting (`DATE_FORMAT`, `TIME_FORMAT`)**
- **Null replacements (`NULL_IF`)**

**Parquet Options:**
- **Simplified setup with error handling (`ON_ERROR`)**

#### Example for CSV with custom settings:

```sql
CREATE PIPE custom_csv_pipe
  NOTIFICATION_PROVIDER AWS_SQS
  NOTIFICATION_QUEUE_REFERENCE 'arn:aws:sqs:us-east-1:123456789012:csv-queue'
  AS COPY INTO transactions_table
    FROM '@s3_source/csv_data'
    FILE_FORMAT 'csv'
    (FIELD_DELIMITER '|', EXTRACT_HEADER 'true', ON_ERROR 'skip_file');
```

### 4. Error Handling

Errors during ingestion are inevitable, but Dremio’s Auto-Ingest provides robust handling options:

#### ON_ERROR Options:
- **abort:** Stops the process at the first error (default for JSON and Parquet).
- **continue:** Skips faulty rows but processes valid ones (CSV only).
- **skip_file:** Skips the entire file if any error occurs.

For example:

```sql
CREATE PIPE error_handling_pipe
  NOTIFICATION_PROVIDER AWS_SQS
  NOTIFICATION_QUEUE_REFERENCE 'arn:aws:sqs:us-east-1:123456789012:error-queue'
  AS COPY INTO error_log_table
    FROM '@s3_source/faulty_data'
    FILE_FORMAT 'json'
    (ON_ERROR 'skip_file');
```

With your pipe configured, Dremio automatically monitors your storage for changes and ingests new files into the target Iceberg table. This setup provides a scalable, reliable pipeline for all your data ingestion needs.

## Real-World Use Cases for Dremio Auto-Ingest

Dremio’s Auto-Ingest for Apache Iceberg tables offers significant advantages across a variety of data engineering scenarios. Whether you’re building real-time pipelines or automating batch data processing, Auto-Ingest provides the flexibility and automation necessary to simplify workflows. Here are some real-world use cases to illustrate its impact.

---

### 1. **Streaming Data Pipelines**

**Scenario**: A smart city project collects real-time sensor data (e.g., temperature, traffic flow, air quality) from IoT devices. This data is stored as JSON files in an S3 bucket, and analytics teams require instant updates in their data warehouse for real-time dashboards.

**Solution**:
- Use Dremio Auto-Ingest with a pipe object that listens to the S3 bucket.
- Configure the pipe to process JSON files and load them into an Iceberg table.
- Leverage `ON_ERROR` settings to gracefully handle malformed sensor data.

**Example Configuration**:
```sql
CREATE PIPE streaming_pipe
  NOTIFICATION_PROVIDER AWS_SQS
  NOTIFICATION_QUEUE_REFERENCE 'arn:aws:sqs:us-west-2:123456789012:sensor-queue'
  AS COPY INTO smart_city.sensor_data
    FROM '@iot_source/live_data'
    FILE_FORMAT 'json'
    (ON_ERROR 'skip_file');
```

**Outcome:**

- Real-time dashboards reflect the latest sensor data without manual intervention.
- Faulty data is isolated for later analysis, ensuring system stability.

### 2. Batch Data Processing
**Scenario:** A retail company ingests daily sales logs in CSV format from its regional branches into a central data lake. These logs must be processed nightly and appended to a historical sales Iceberg table.

**Solution:**

- Configure an Auto-Ingest pipe to monitor the S3 bucket where sales logs are uploaded.
- Set a deduplication lookback period to avoid reprocessing files if logs are accidentally re-uploaded.
Example Configuration:

```sql
CREATE PIPE daily_batch_pipe
  DEDUPE_LOOKBACK_PERIOD 7
  NOTIFICATION_PROVIDER AWS_SQS
  NOTIFICATION_QUEUE_REFERENCE 'arn:aws:sqs:us-east-1:123456789012:sales-queue'
  AS COPY INTO retail.sales_history
    FROM '@s3_source/sales_logs'
    FILE_FORMAT 'csv'
    (EXTRACT_HEADER 'true', EMPTY_AS_NULL 'true');
```

**Outcome:**

- Daily sales logs are automatically appended to the historical table.
- The deduplication window ensures no duplicate records are ingested.

### 3. Data Lakehouse Modernization
**Scenario:** A financial services firm is transitioning from a traditional data warehouse to a modern lakehouse architecture. The team wants to automate ingestion from various sources (e.g., transactional Parquet files and JSON logs) into Iceberg tables for unified analytics.

**Solution:**

Use multiple Auto-Ingest pipes to handle ingestion for different file types and schemas.
Configure branch-specific ingestion for staging and production environments.
Example Configuration:

**Parquet Transactions:**

```sql
CREATE PIPE transactions_pipe
  NOTIFICATION_PROVIDER AWS_SQS
  NOTIFICATION_QUEUE_REFERENCE 'arn:aws:sqs:us-east-2:123456789012:transactions-queue'
  AS COPY INTO finance.transactions
    FROM '@finance_source/transactions'
    FILE_FORMAT 'parquet';
```

**JSON Application Logs:**

```sql
Copy code
CREATE PIPE logs_pipe
  NOTIFICATION_PROVIDER AWS_SQS
  NOTIFICATION_QUEUE_REFERENCE 'arn:aws:sqs:us-east-2:123456789012:logs-queue'
  AS COPY INTO finance.app_logs
    FROM '@logs_source/application'
    FILE_FORMAT 'json'
    (DATE_FORMAT 'YYYY-MM-DD', TIME_FORMAT 'HH24:MI:SS');
```

**Outcome:**

- Unified, structured Iceberg tables ready for analytical queries.
- Improved agility with automated pipelines for different data sources.

### 4. Event-Driven Reporting
**Scenario:** A marketing team tracks user engagement metrics (e.g., clicks, time on site, purchases) stored as CSV files in real-time. Reports must be updated immediately after new data arrives.

**Solution:**

Use an Auto-Ingest pipe with an AWS_SQS notification provider to ensure new engagement files are ingested as soon as they are uploaded.

**Example Configuration:**

```sql
CREATE PIPE engagement_pipe
  NOTIFICATION_PROVIDER AWS_SQS
  NOTIFICATION_QUEUE_REFERENCE 'arn:aws:sqs:us-west-1:123456789012:engagement-queue'
  AS COPY INTO marketing.user_engagement
    FROM '@engagement_source/metrics'
    FILE_FORMAT 'csv'
    (FIELD_DELIMITER ',', EXTRACT_HEADER 'true');
```

**Outcome:**

- Marketing reports are updated in near-real-time, enabling faster decision-making.
- Automated ingestion removes the need for manual ETL processes.

These use cases showcase how Dremio Auto-Ingest can be a versatile and powerful tool for a wide range of data engineering challenges. Whether your focus is on real-time data processing, batch workflows, or transitioning to a lakehouse architecture, Auto-Ingest simplifies and enhances your pipeline capabilities.

## Best Practices and Considerations for Dremio Auto-Ingest

To get the most out of Dremio Auto-Ingest for Apache Iceberg tables, it's essential to follow best practices and understand key considerations. These guidelines will help ensure your ingestion pipelines are reliable, efficient, and optimized for performance.


### 1. **Optimize Deduplication Settings**

**What It Does**: The `DEDUPE_LOOKBACK_PERIOD` parameter ensures that duplicate files (e.g., files with the same name uploaded multiple times) are not ingested repeatedly.

**Best Practices**:
- Set an appropriate lookback period based on your ingestion frequency:
  - For high-frequency updates (e.g., hourly ingestion), a shorter period (1–3 days) is sufficient.
  - For batch workflows with periodic reuploads, a longer window (7–14 days) may be needed.
- Avoid setting the period to `0` unless you are certain duplicates are not an issue, as it disables deduplication.

**Example**:
```sql
CREATE PIPE deduped_pipe
  DEDUPE_LOOKBACK_PERIOD 7
  NOTIFICATION_PROVIDER AWS_SQS
  NOTIFICATION_QUEUE_REFERENCE 'arn:aws:sqs:us-east-1:123456789012:dedupe-queue'
  AS COPY INTO my_table
    FROM '@s3_source/folder'
    FILE_FORMAT 'json';
```

### 2. Organize Storage for Better Performance
**Why It Matters:** Properly structured storage locations improve ingestion speed and reduce processing overhead.

**Best Practices:**

- Use folder-based organization in your storage buckets (e.g., `/year/month/day/`) for easier file management and regex-based ingestion.
- Keep related files in the same folder to avoid ingesting unrelated data by mistake.
- Avoid deeply nested directory structures, as they can slow down file scanning.

### 3. Choose the Right File Format
**Impact of File Format:** Different file formats affect storage size, query performance, and ingestion speed.

**Best Practices:**

- Use Parquet for columnar storage and analytics-heavy workloads due to its efficient storage and compression.
- Opt for CSV or JSON for semi-structured data but ensure proper formatting (e.g., consistent delimiters, headers, and escaping).
- Test ingestion performance with small sample files before committing to large-scale pipelines.

### 4. Leverage Error Handling Options
**Why It Matters:** Errors during ingestion can interrupt pipelines or lead to data inconsistencies.

**Best Practices:**

- Use `ON_ERROR 'skip_file'` to bypass files with errors and prevent pipeline interruptions.
- Regularly monitor the `sys.copy_errors_history` table for ingestion errors and address recurring issues.
- For non-critical pipelines, consider `ON_ERROR 'continue'` (CSV only) to process valid rows even if some are faulty.

**Example:**

```sql
CREATE PIPE error_handling_pipe
  NOTIFICATION_PROVIDER AWS_SQS
  NOTIFICATION_QUEUE_REFERENCE 'arn:aws:sqs:us-east-1:123456789012:error-queue'
  AS COPY INTO my_table
    FROM '@s3_source/folder'
    FILE_FORMAT 'csv'
    (ON_ERROR 'continue');
```

### 5. Monitor and Troubleshoot Pipelines
**Monitoring Tools:**

- **System Tables:** Query sys.copy_errors_history to review errors during ingestion.
- **Job Logs:** Check job logs in Dremio for detailed error messages and ingestion stats.

**Common Troubleshooting Tips:**

- **Notification Issues:** Ensure the SQS queue ARN matches the one specified in the `NOTIFICATION_QUEUE_REFERENCE`.
- **File Format Mismatches:** Double-check that the specified file format aligns with the actual file type (e.g., don’t label a Parquet file as CSV).
- **Deduplication Failures:** Verify that the deduplication period is set correctly and files aren’t inadvertently re-ingested due to naming conflicts.

### 6. Optimize Regex and File Selection
**Why It Matters:** Using overly broad regex patterns or processing unnecessary files can impact pipeline performance.

**Best Practices:**

Write regex patterns that are as specific as possible to match only the files you need.
Avoid processing large directories unless required. Use the `FILES` clause or specific folder paths to limit scope.
Example:

```sql
CREATE PIPE regex_pipe
  NOTIFICATION_PROVIDER AWS_SQS
  NOTIFICATION_QUEUE_REFERENCE 'arn:aws:sqs:us-west-2:123456789012:regex-queue'
  AS COPY INTO my_table
    FROM '@s3_source/folder'
    REGEX '^2024/11/.*.csv'
    FILE_FORMAT 'csv';
```

### 7. Plan for Schema Evolution
**Why It Matters:** Iceberg tables support schema evolution, but it’s crucial to manage changes thoughtfully to avoid ingestion failures.

**Best Practices:**

- Test schema changes in a staging environment before applying them to production pipelines.
- Use Iceberg’s branching capabilities to isolate schema updates during development.
- Validate data types and formats in source files to avoid mismatches with the target table schema.

### 8. Integrate with Data Lakehouse Workflows
**Why It Matters:** Auto-Ingest simplifies transitioning to a lakehouse architecture, but aligning with broader workflows ensures smooth integration.

**Best Practices:**

- Combine Auto-Ingest with Dremio’s SQL-based querying to enable seamless analytics on ingested data.
- Use Iceberg’s time-travel feature to track historical changes and validate pipeline performance over time.

By following these best practices and considerations, you can ensure your Dremio Auto-Ingest pipelines are robust, efficient, and well-suited to your data engineering needs. These guidelines will help you avoid common pitfalls and fully leverage the power of automated ingestion for Apache Iceberg tables.

## Troubleshooting and Debugging Auto-Ingest Pipelines

Even with a robust Auto-Ingest setup, you may encounter issues during the ingestion process. Dremio’s system tables, such as `SYS.COPY_ERRORS_HISTORY`, provide detailed insights into ingestion errors, making it easier to diagnose and resolve problems. This section outlines common issues and how to effectively use the system table to debug your pipelines.

### 1. **Common Issues and Resolutions**

#### **Notification Configuration Problems**
- **Symptom**: The pipe does not respond to new files being uploaded.
- **Resolution**:
  - Verify the `NOTIFICATION_PROVIDER` is configured correctly (e.g., `AWS_SQS` for S3).
  - Ensure the `NOTIFICATION_QUEUE_REFERENCE` points to the correct ARN of your event notification queue.

#### **File Format Mismatch**
- **Symptom**: The pipeline fails with file parsing errors.
- **Resolution**:
  - Double-check that the `FILE_FORMAT` in your pipe configuration matches the actual format of the uploaded files.
  - Validate format-specific options (e.g., delimiter, null handling) for correctness.

#### **Partial or Skipped File Loads**
- **Symptom**: Some files are partially loaded or skipped entirely.
- **Resolution**:
  - Use the `SYS.COPY_ERRORS_HISTORY` table to identify problematic files and the reasons for rejection.
  - Adjust error-handling options (`ON_ERROR`) in your pipe to match your tolerance for bad records.

### 2. **Using the `SYS.COPY_ERRORS_HISTORY` Table**

The `SYS.COPY_ERRORS_HISTORY` table logs detailed information about `COPY INTO` jobs where records were rejected due to parsing or schema issues. This includes jobs configured with `ON_ERROR 'continue'` or `ON_ERROR 'skip_file'`.

#### **Key Columns in the Table**
- **`executed_at`**: The timestamp when the job was executed.
- **`job_id`**: The unique identifier of the `COPY INTO` job.
- **`table_name`**: The target Iceberg table for the job.
- **`user_name`**: The username of the individual who ran the job.
- **`file_path`**: The path of the file with rejected records.
- **`file_state`**:
  - `PARTIALLY_LOADED`: Some records were loaded, but others were rejected.
  - `SKIPPED`: No records were loaded due to file-level errors.
- **`records_loaded_count`**: The number of successfully ingested records.
- **`records_rejected_count`**: The number of records rejected due to errors.

#### **Example Query: Identifying Problematic Files**
To view details about rejected files for a specific table:
```sql
SELECT executed_at, job_id, file_path, file_state, records_rejected_count
FROM SYS.COPY_ERRORS_HISTORY
WHERE table_name = 'my_table'
ORDER BY executed_at DESC;
```

**This query highlights:**

- When ingestion errors occurred.
- Which files were affected.
- Whether files were partially loaded or skipped.

### 3. Drilling into Error Details
Once you identify a problematic job using the job_id, you can use the `copy_errors()` function to extract detailed error information.

Example: Retrieving Error Details
```sql
SELECT *
FROM copy_errors('1aacb195-ca94-ec4c-2b01-ecddac81a900', 'my_table');
```

This query provides granular information about errors encountered during the ingestion process for the specified job.

### 4. Best Practices for Debugging
#### Proactive Monitoring
- Regularly query the `SYS.COPY_ERRORS_HISTORY` table to track ingestion health.
- Set alerts for high records_rejected_count values to identify recurring issues.

#### Validate Source Data
- Audit source files for schema inconsistencies or formatting errors.
- Ensure files match the expected format (e.g., proper delimiters for CSV).

#### Tuning Error Handling
- Use `ON_ERROR 'skip_file'` for critical pipelines where partial loads are unacceptable.
- Opt for `ON_ERROR 'continue'` in cases where maximum data recovery is desired, especially for CSV files.

#### Housekeeping the System Table
The `SYS.COPY_ERRORS_HISTORY` table can grow significantly over time. Manage its size using these configuration keys:

- `dremio.system_iceberg_tables.record_lifespan_in_millis`: Retains history for a specified number of days (default is 7).
- `dremio.system_iceberg_tables.housekeeping_thread_frequency_in_millis`: Controls how frequently old records are removed (default is daily).

### 5. Common Query Patterns for Debugging
Find Recently Skipped Files
```sql
SELECT file_path, file_state, records_rejected_count
FROM SYS.COPY_ERRORS_HISTORY
WHERE file_state = 'SKIPPED'
ORDER BY executed_at DESC;
```

Analyze Partially Loaded Files

```sql
SELECT file_path, records_loaded_count, records_rejected_count
FROM SYS.COPY_ERRORS_HISTORY
WHERE file_state = 'PARTIALLY_LOADED'
ORDER BY executed_at DESC;
```

By leveraging the `SYS.COPY_ERRORS_HISTORY` table and related debugging tools, you can effectively monitor and resolve issues in your Auto-Ingest pipelines. These capabilities ensure your pipelines are resilient and capable of handling a wide variety of data ingestion scenarios with minimal disruption.

## Conclusion
Dremio Auto-Ingest for Apache Iceberg tables brings a new level of automation and simplicity to data ingestion workflows. By leveraging event-driven pipelines, you can reduce manual intervention, ensure data freshness, and streamline the integration of your object storage systems with Iceberg tables.

From real-time updates to batch processing, Auto-Ingest handles diverse use cases with ease, offering powerful features like deduplication, error handling, and format-specific customization. By following best practices, monitoring your pipelines, and troubleshooting effectively, you can create reliable and efficient data ingestion workflows that scale with your business needs.

Whether you're modernizing your data lakehouse architecture or building advanced analytics pipelines, Dremio Auto-Ingest is a must-have tool to unlock the full potential of your data.

- [Blog: What is a Data Lakehouse and a Table Format?](https://www.dremio.com/blog/apache-iceberg-crash-course-what-is-a-data-lakehouse-and-a-table-format/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=autoingestdremio&utm_content=alexmerced&utm_term=external_blog)
- [Free Copy of Apache Iceberg the Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=autoingestdremio&utm_content=alexmerced&utm_term=external_blog)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=autoingestdremio&utm_content=alexmerced&utm_term=external_blog)
- [Lakehouse Catalog Course](https://hello.dremio.com/webcast-an-in-depth-exploration-on-the-world-of-data-lakehouse-catalogs-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=autoingestdremio&utm_content=alexmerced&utm_term=external_blog)
- [Iceberg Lakehouse Engineering Video Playlist](https://www.youtube.com/watch?v=SIriNcVIGJQ&list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe) 
