---
title: Intro to Apache Iceberg with Apache Polaris and Apache Spark
date: "2025-10-16"
description: "Learn how to leverage Apache Iceberg with Apache Polaris and Apache Spark to build scalable and efficient data lakehouses."
author: "Alex Merced"
category: "Data Engineering"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - Data Lakehouse
  - Data Engineering
  - Apache Iceberg
  - Apache Polaris
---

**Get Data Lakehouse Books:**
- [Apache Iceberg: The Definitive Guide](https://drmevn.fyi/tableformatblog)
- [Apache Polaris: The Defintive Guide](https://drmevn.fyi/tableformatblog-62P6t)
- [Architecting an Apache Iceberg Lakehouse](https://hubs.la/Q03GfY4f0)
- [The Apache Iceberg Digest: Vol. 1](https://www.puppygraph.com/ebooks/apache-iceberg-digest-vol-1)

**Lakehouse Community:**
- [Join the Data Lakehouse Community](https://www.datalakehousehub.com)
- [Data Lakehouse Blog Roll](https://lakehouseblogs.com)
- [OSS Community Listings](https://osscommunity.com)
- [Dremio Lakehouse Developer Hub](https://developer.dremio.com)

Modern analytics depend on flexibility. Teams want to query raw data with the same speed and reliability they expect from a warehouse. That goal led to the rise of the *data lakehouse*, an architecture that unifies structured and unstructured data while supporting multiple compute engines.  

The lakehouse model removes silos by allowing data to live in open formats, accessible to tools like Spark, Trino, Dremio, and Flink. Interoperability becomes the foundation of this design: storage is separated from compute, and metadata lives in a shared catalog. Apache Iceberg sits at the center of this open ecosystem.

## The Lakehouse and the Value of Interoperability

Traditional data systems often forced teams to choose between performance and openness. Data warehouses provided fast queries but required proprietary formats and vendor lock-in. Data lakes offered openness and low cost but lacked reliability and consistent schema management.  

The lakehouse combines both. It keeps data in object storage while using open table formats like Apache Iceberg to bring reliability, version control, and transactional guarantees. This allows multiple engines to read and write the same datasets without duplication.  

Interoperability is the key advantage. When organizations use open standards, they can build systems that evolve without re-platforming. Governance, lineage, and performance optimizations can be shared across tools, creating one consistent view of enterprise data.

## Apache Iceberg’s Role in the Lakehouse

Apache Iceberg is the open table format that makes the lakehouse possible. It defines how large analytic tables are stored, versioned, and accessed in cloud or on-premises object storage. Iceberg tracks snapshots of data files, enabling ACID transactions, schema evolution, and time travel.  

Each Iceberg table is independent of any single compute engine. Spark, Dremio, Trino, and Flink can all operate on the same tables because the format defines a consistent API for reading and writing data. This makes Iceberg a shared foundation for analytics across the open data ecosystem.  

In practice, Iceberg replaces the old Hive Metastore model with a more scalable and flexible metadata structure. Tables are self-describing, and every change creates a new immutable snapshot. This design not only enables concurrency and rollback but also ensures that the same data can be reliably queried from different engines without conflict.

## The Structure of an Apache Iceberg Table

An Apache Iceberg table is more than a collection of data files. It is a structured system that records every version of a dataset, allowing engines to read, write, and track changes with full transactional integrity. Understanding this structure helps explain how Iceberg enables features like time travel, schema evolution, and partition management.

At the top level, each table has a **metadata directory** that contains JSON files describing the current state of the table. These files point to **snapshot metadata**, which lists all the data files that make up the current version. Each snapshot references one or more **manifest lists**, and each manifest list points to multiple **manifest files**. Manifest files contain the actual list of data files, typically Parquet, ORC, or Avro, along with partition information and statistics.

Every time you insert, delete, or update data, Iceberg creates a new snapshot without rewriting the existing files. This immutable design ensures that multiple users and engines can safely interact with the same table at the same time. It also makes rollback and version tracking possible, since previous snapshots are always preserved until explicitly expired.

Iceberg also introduces a flexible approach to partitioning. Instead of static directories like in Hive, Iceberg uses **partition transforms** that record logical rules, such as `bucket(8, id)` or `months(order_date)`, directly in metadata. This allows the table to manage partitions dynamically, improving query performance while keeping partitioning transparent to users.

Together, these components form a self-contained and versioned system that makes object storage behave like a transactional database. In the next section, you’ll set up an environment using Apache Polaris and Apache Spark to see how this structure works in practice.

## Setting Up the Environment

To explore how Apache Iceberg works in practice, you’ll use a local setup that includes three components: **Apache Polaris**, **MinIO**, and **Apache Spark**. Polaris will serve as the catalog that manages Iceberg metadata, MinIO will act as your S3-compatible storage system, and Spark will be your compute engine for creating and querying tables.

A **catalog** in Iceberg defines where tables are stored and how their metadata is managed. It is responsible for keeping track of namespaces, table locations, and access control. Apache Polaris provides an open-source implementation of an Iceberg catalog that exposes a REST API for managing these operations. Polaris also adds governance features, authentication, roles, and permissions, making it more than just a metadata store.

Within Polaris, users and services are represented as **principals**, each with unique credentials that determine what they can access. You can assign roles and privileges to principals, giving them permission to create, update, or query catalogs and tables. This design allows multiple tools to share a single governed catalog while maintaining secure, fine-grained access.

### Starting the Environment

Clone the quickstart repository and start the environment using Docker Compose:

```bash
git clone https://github.com/AlexMercedCoder/Apache-Polaris-Apache-Iceberg-Minio-Spark-Quickstart.git
cd Apache-Polaris-Apache-Iceberg-Minio-Spark-Quickstart
docker compose up -d
```

This will launch:

- Polaris on port `8181` (catalog API)

- MinIO on ports `9000` and `9001` (S3 and web console)

- Spark with Jupyter Notebook on port `8888`

You can verify that all containers are running with:

```bash
docker ps
```

Once they’re up, open the Jupyter Notebook interface by visiting `http://localhost:8888`. Create a new Python notebook and copy the contents of `bootstrap.py` from the repository into a cell. Running this script will bootstrap Polaris by:

- Creating two catalogs—`lakehouse` and `warehouse`—that point to MinIO buckets.

- Defining a principal with access credentials.

- Assigning roles and granting full permissions to that principal.

When the script completes, it prints a ready-to-use Spark configuration block with all the connection details. You’ll use that configuration in the next section to create and manage Iceberg tables through Polaris.

## Creating Iceberg Tables

With Polaris bootstrapped and Spark connected, you’re ready to start working with Iceberg tables. The tables you create will live in the `polaris.db` namespace, with their data stored in your MinIO buckets. All catalog and permission management will happen automatically through Polaris.

Before you begin creating tables, make sure Spark is configured to connect to Polaris. When you ran `bootstrap.py`, the script printed out a Spark configuration block similar to the example below. This block contains the packages, catalog URI, warehouse name, and your principal’s credentials. Copy this block into a cell in your Jupyter Notebook and run it to initialize your Spark session.

```python
# Spark configuration for catalog: lakehouse
from pyspark.sql import SparkSession

spark = (SparkSession.builder
    .config("spark.jars.packages", "org.apache.polaris:polaris-spark-3.5_2.13:1.1.0-incubating,org.apache.iceberg:iceberg-aws-bundle:1.10.0,io.delta:delta-spark_2.12:3.3.1,org.apache.iceberg:iceberg-spark-runtime-3.5_2.12:1.10.0")
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")
    .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions,io.delta.sql.DeltaSparkSessionExtension")
    .config("spark.sql.catalog.polaris", "org.apache.polaris.spark.SparkCatalog")
    .config("spark.sql.catalog.polaris.uri", "http://polaris:8181/api/catalog")
    .config("spark.sql.catalog.polaris.warehouse", "lakehouse")
    .config("spark.sql.catalog.polaris.credential", "{client_id}:{client_secret}")
    .config("spark.sql.catalog.polaris.scope", "PRINCIPAL_ROLE:ALL")
    .config("spark.sql.catalog.polaris.header.X-Iceberg-Access-Delegation", "vended-credentials")
    .config("spark.sql.catalog.polaris.token-refresh-enabled", "true")
    .getOrCreate())

spark.sql("CREATE NAMESPACE IF NOT EXISTS polaris.db").show()
spark.sql("CREATE TABLE IF NOT EXISTS polaris.db.example (name STRING)").show()
spark.sql("INSERT INTO polaris.db.example VALUES ('example value')").show()
spark.sql("SELECT * FROM polaris.db.example").show()
```

The `client_id` and `client_secret` values should be filled in with the code printed at the end of running your bootstrap script. Once the Spark session starts, you’ll be able to issue SQL commands directly against Polaris.

### Creating a Basic Table
Start by setting your working namespace and creating a simple unpartitioned table:

```python
# eliminates the need to prefix table names with the namespace polaris.db
spark.sql("USE polaris.db")

spark.sql("""
CREATE TABLE customers (
    id INT,
    name STRING,
    city STRING
)
USING iceberg
""")
```
This creates a new Iceberg table tracked by Polaris. You can confirm its existence by listing all tables in the namespace:

```python
spark.sql("SHOW TABLES IN polaris.db").show()
```
Now open the MinIO console at `http://localhost:9001` (admin/password are the credentials) and explore the lakehouse bucket—you’ll see a new folder structure created for your table. This directory contains the Parquet data files and the metadata that Polaris manages.

### Partitioned Tables
Partitioning helps improve performance by organizing data into logical groups. Iceberg’s partition transforms let you define flexible strategies without depending on directory names.

Partition by a single column:

```python
spark.sql("""
CREATE TABLE polaris.db.sales (
    sale_id INT,
    product STRING,
    quantity INT,
    city STRING
)
USING iceberg
PARTITIONED BY (city)
""")
```

Partition by time:

```python
spark.sql("""
CREATE TABLE polaris.db.orders (
    order_id INT,
    customer_id INT,
    order_date DATE,
    total DECIMAL(10,2)
)
USING iceberg
PARTITIONED BY (months(order_date))
""")
```

Partition by hash buckets for even data distribution:

```python
spark.sql("""
CREATE TABLE polaris.db.transactions (
    txn_id BIGINT,
    user_id BIGINT,
    amount DOUBLE
)
USING iceberg
PARTITIONED BY (bucket(8, user_id))
""")
```

Each strategy changes how Iceberg organizes data, but all are tracked as metadata—not directories—making future changes safe and reversible.

After creating your tables, return to the MinIO console to explore the results. You’ll notice new directories and metadata files representing the structure of each table. These files are created and tracked automatically by Polaris, ensuring that every write, update, and schema change remains consistent across all engines that connect to the catalog.

## Inserting Data

Once your tables are created, you can begin inserting and modifying data through Spark. Every write operation, whether it’s an insert, update, or delete, creates a new **snapshot** in Iceberg. Each snapshot represents a consistent view of your table at a specific point in time and is recorded in Polaris’s metadata catalog.

Start with a simple insert:

```python
spark.sql("""
INSERT INTO polaris.db.customers VALUES
(1, 'Alice', 'New York'),
(2, 'Bob', 'Chicago'),
(3, 'Carla', 'Boston')
""")
```

After this insert, open the MinIO console and look inside the lakehouse bucket under polaris/db/customers. You’ll see a new folder structure containing Parquet files and Iceberg metadata files (metadata.json, snapshots, and manifests). Each write creates new files rather than overwriting existing ones, which is how Iceberg maintains atomic transactions and rollback capabilities.

### Inserting into Partitioned Tables
If you created partitioned tables earlier, Iceberg will automatically place data into the correct partitions based on your table definition:

```python
spark.sql("""
INSERT INTO polaris.db.sales VALUES
(101, 'Laptop', 5, 'New York'),
(102, 'Tablet', 3, 'Boston'),
(103, 'Phone', 7, 'Chicago')
""")
```

To confirm partitioning, you can check MinIO. Each partition value (in this case, city) will have its own subdirectory. Iceberg manages these directories automatically through metadata, keeping partitioning invisible to end users.

### Working with Larger Datasets
For larger datasets, you can also write directly from a DataFrame:

```python
data = [(201, 'Monitor', 2, 'Denver'),
        (202, 'Keyboard', 10, 'Austin')]

df = spark.createDataFrame(data, ['sale_id', 'product', 'quantity', 'city'])
df.writeTo("polaris.db.sales").append()
```
This method is efficient for batch operations and ensures your Spark DataFrames integrate cleanly with Iceberg’s transaction system.

Each time you perform a write, Polaris updates the catalog with a new snapshot ID. These snapshots allow you to query your table as it existed at any point in time, a capability you’ll explore later in the section on time travel.

For now, review the lakehouse bucket in MinIO after each insert to see how Iceberg adds new Parquet and metadata files. Each transaction tells a story of how the table evolves over time, tracked and governed by Polaris.

## Update, Delete, and Merge Into

Apache Iceberg provides full ACID transaction support, allowing you to update, delete, and merge data safely. Each of these operations creates a new snapshot while preserving older versions of the table, giving you consistent rollback and auditing capabilities. Polaris tracks these changes in its catalog so that every engine accessing the table sees a consistent state.

### Updating Data

Use `UPDATE` to modify existing records. For example, if one of your customers relocates:

```python
spark.sql("""
UPDATE polaris.db.customers
SET city = 'San Francisco'
WHERE name = 'Alice'
""")
```
This statement creates a new snapshot that replaces the affected rows with updated data. Iceberg performs this by rewriting only the data files that contain the changed rows, which keeps transactions efficient even at scale.

### Deleting Data
You can delete records using a standard `DELETE` statement:

```python
spark.sql("""
DELETE FROM polaris.db.customers
WHERE name = 'Bob'
""")
```
After running this command, open the MinIO console and look at the customers directory in the lakehouse bucket. You’ll notice new Parquet and metadata files have appeared, Iceberg never mutates existing files. Instead, it writes new ones and updates the catalog’s snapshot metadata through Polaris.

### Merging Data (Upserts)
The `MERGE INTO` command allows you to perform upserts, merging new records with existing data based on a matching key. This is especially useful when syncing incremental updates from another source.

First, create a temporary table or view that holds your new data:

```python
spark.sql("""
CREATE OR REPLACE TEMP VIEW updates AS
SELECT 1 AS id, 'Alice' AS name, 'Seattle' AS city
UNION ALL
SELECT 4 AS id, 'Dana' AS name, 'Austin' AS city
""")
```
Then merge it into your main table:

```python
spark.sql("""
MERGE INTO polaris.db.customers AS target
USING updates AS source
ON target.id = source.id
WHEN MATCHED THEN UPDATE SET city = source.city
WHEN NOT MATCHED THEN INSERT *
""")
```
After the merge completes, Polaris will record a new snapshot in the catalog. You can query the customers.history or customers.snapshots metadata tables to see when and how the change occurred.

Each of these operations, `UPDATE`, `DELETE`, and `MERGE INTO`, produces new files in MinIO and new snapshots in Polaris. This versioned structure ensures your tables remain fully auditable. Take a moment to check the lakehouse bucket again after running each command. You’ll see Iceberg’s design in action: immutable data files, evolving metadata, and transparent version control, all orchestrated through Polaris.

## Altering Partition Scheme

Over time, your table’s partitioning strategy may need to change as data grows or query patterns evolve. Apache Iceberg allows you to alter partition schemes safely, without rewriting existing files. This flexibility is one of Iceberg’s biggest advantages over traditional data lake formats. All changes are tracked by Polaris, ensuring that the catalog always reflects the current partition structure.

Suppose your `sales` table is currently partitioned by city. If queries start filtering by `product` instead, you can modify the table’s partitioning to better suit that use case. Start by dropping the old partition field:

```python
spark.sql("""
ALTER TABLE polaris.db.sales
DROP PARTITION FIELD city
""")
```
Then add a new partition field:

```python
spark.sql("""
ALTER TABLE polaris.db.sales
ADD PARTITION FIELD bucket(8, product)
""")
```
This change affects only future writes. Existing data remains organized by the previous partition scheme, while new records follow the new one. Iceberg’s metadata model keeps track of both versions, so queries continue to return complete results without manual migration.

To verify your table’s current partitioning, run:

```python
spark.sql("SHOW PARTITIONS polaris.db.sales").show()
```

You can also view the table’s partition history through the metadata tables:

```python
spark.sql("SELECT * FROM polaris.db.sales.partitions").show()
```

After altering partition fields, try inserting new records and observe how Iceberg places them into new directories in MinIO. Open the lakehouse bucket in the MinIO console, navigate to your sales folder, and you’ll see both the old and new partition structures coexisting under the same table. Polaris ensures the catalog references all of them correctly.

This feature makes partition evolution seamless. You can adapt to new data patterns or performance needs without downtime, data duplication, or complex ETL steps. In the next section, you’ll learn how to explore Iceberg’s built-in metadata tables and use time travel to query historical versions of your data.

## Metadata Tables and Time Travel

Apache Iceberg doesn’t just store data—it stores the entire history of your data. Every write operation creates a new snapshot, and every snapshot is tracked in the table’s metadata. These metadata tables give you full visibility into how your data changes over time. Because Polaris manages the catalog, you can query these tables from any engine that connects to it, ensuring a unified and governed view of your data lifecycle.

### Exploring Metadata Tables

Each Iceberg table automatically includes several metadata tables that you can query just like normal tables:

- **history** – shows when snapshots were created.
- **snapshots** – lists snapshot IDs and timestamps.
- **files** – lists all data and manifest files in each snapshot.
- **manifests** – details how files are grouped and filtered.

You can explore them with Spark SQL:

```python
spark.sql("SELECT * FROM polaris.db.sales.history").show()
spark.sql("SELECT * FROM polaris.db.sales.snapshots").show()
spark.sql("SELECT * FROM polaris.db.sales.files").show()
```

These tables reveal every version of your dataset, what files were written, when they were created, and by which operation. You can use this information for auditing, debugging, or optimizing table performance.

### Querying Past Versions with Time Travel
Because Iceberg stores all historical snapshots, you can query data as it existed at a specific point in time. You can travel through time using either a snapshot ID or a timestamp.

First, identify a snapshot ID from the snapshots table:

```python
spark.sql("SELECT snapshot_id, committed_at FROM polaris.db.sales.snapshots").show()
```

Then query that version:

```python
spark.read.option("snapshot-id", "<snapshot_id>").table("polaris.db.sales").show()
```
Alternatively, you can query the table as it existed at a given timestamp:

```python
spark.read.option("as-of-timestamp", "2025-10-10T12:00:00").table("polaris.db.sales").show()
```

This ability to reproduce historical states makes Iceberg ideal for debugging ETL processes, reproducing analytics, or auditing compliance-related datasets.

### Seeing It in MinIO
Each time you insert, update, or delete data, Iceberg records a new snapshot. Open the lakehouse bucket in MinIO and navigate through your table directories—you’ll notice subdirectories under metadata/ representing each snapshot and manifest. Every change to your data produces new metadata and data files, which together describe the complete history of your table.

Iceberg’s metadata and time travel capabilities, combined with Polaris’s catalog management, give you full traceability and reproducibility. In the next section, you’ll learn how to keep your tables healthy by compacting small files and expiring old snapshots.

## Compaction and Snapshot Expiration

As you run inserts, updates, and merges, Iceberg continuously creates new data and metadata files. Over time, this can lead to many small files and obsolete snapshots. To maintain performance and control storage costs, Iceberg provides built-in maintenance operations for compaction and snapshot expiration. With Polaris managing the catalog, these optimizations remain consistent and trackable across all compute engines that access your tables.

### Compacting Small Files

Small files are common in streaming or frequent batch ingestion workflows. Iceberg can merge them into fewer, larger files using the `rewrite_data_files` procedure. This reduces overhead during query planning and execution.

Run the following command from Spark to compact your table:

```python
spark.sql("""
CALL polaris.system.rewrite_data_files('polaris.db.sales')
""")
```
You can also target specific partitions or filter files by size:

```python
spark.sql("""
CALL polaris.system.rewrite_data_files(
  table => 'polaris.db.sales',
  options => map('min-input-files', '4', 'max-concurrent-rewrites', '2')
)
""")
```

After compaction, check your lakehouse bucket in MinIO. You’ll notice fewer Parquet files, each larger in size. Iceberg automatically updates manifests and metadata files so that queries continue to return accurate results with better performance.

### Expiring Old Snapshots
Every Iceberg operation creates a snapshot. Over time, unused snapshots can accumulate, consuming metadata space and storage. Iceberg allows you to remove these safely using the expire_snapshots procedure.

For example, to remove snapshots older than seven days:

```python
spark.sql("""
CALL polaris.system.expire_snapshots(
  table => 'polaris.db.sales',
  older_than => TIMESTAMPADD(DAY, -7, CURRENT_TIMESTAMP)
)
""")
```
You can also specify how many snapshots to retain regardless of age:

```python
spark.sql("""
CALL polaris.system.expire_snapshots(
  table => 'polaris.db.sales',
  retain_last => 5
)
""")
```

Polaris automatically tracks the catalog state after expiration, ensuring that all compute engines accessing the table remain synchronized with the current set of snapshots.

### Monitoring with Metadata Tables
After compaction or expiration, you can verify changes using the metadata tables:

```python
spark.sql("SELECT * FROM polaris.db.sales.snapshots").show()
spark.sql("SELECT * FROM polaris.db.sales.manifests").show()
```

You’ll see fewer manifests and snapshots, confirming that Iceberg has reclaimed space and simplified query planning.

Maintenance operations like compaction and snapshot expiration help keep your Iceberg tables fast and cost-efficient. Combined with Polaris’s centralized catalog, these operations stay consistent across all connected engines. Whether you’re using Spark, Dremio, Trino, or Flink, Polaris ensures a single source of truth for your Iceberg metadata, making performance optimization and governance effortless.

## Writing Efficiently to Apache Iceberg with Spark

When working with Apache Iceberg tables in Spark, how you write data has a major impact on performance, metadata growth, and maintenance frequency. Iceberg is designed for incremental writes and schema evolution, but inefficient write patterns—like frequent small updates or poor partitioning—can lead to excessive snapshots and small files. By tuning Spark and table-level settings, you can reduce the need for costly compaction and keep your tables query-ready.


### Optimize File Size and Shuffle Configuration

Each write produces data files that Spark generates in parallel tasks. If your partitions are too small or the number of shuffle tasks is too high, Spark creates many tiny files, increasing metadata overhead and slowing queries. To control this, adjust Spark’s shuffle and output configurations before writing:

```python
spark.conf.set("spark.sql.shuffle.partitions", 8)
spark.conf.set("spark.sql.files.maxRecordsPerFile", 5_000_000)
```

These settings reduce the number of output files per job and encourage larger Parquet files (typically `128–512 MB` each). You can also call `.coalesce()` or `.repartition()` before writes to further control file output:

```python
df.coalesce(8).writeTo("polaris.db.sales").append()
```

Balanced partitioning and file sizing keep your table fast and avoid unnecessary metadata bloat.

### Use Table Properties to Guide Iceberg Behavior
Iceberg provides table-level configuration options that influence how data is written, compacted, and validated. You can define them during table creation or later using `ALTER TABLE`.

For example:

```sql
CREATE TABLE polaris.db.sales (
  id BIGINT,
  region STRING,
  sale_date DATE,
  amount DOUBLE
)
USING iceberg
PARTITIONED BY (days(sale_date))
TBLPROPERTIES (
  'write.target-file-size-bytes'='268435456',  -- 256 MB target file size
  'commit.manifest-merge.enabled'='true',       -- reduces manifest churn
  'write.distribution-mode'='hash',             -- distributes data evenly
  'write.merge.mode'='copy-on-write'            -- ensures clean updates
);
```
You can also modify these settings later:

```sql
ALTER TABLE polaris.db.sales SET TBLPROPERTIES (
  'write.target-file-size-bytes'='536870912'  -- 512 MB
);
```

Setting appropriate table properties ensures consistent behavior across all engines—Spark, Dremio, or Flink—that share your Polaris catalog.

### Batch and Append Data Strategically
Each write in Iceberg creates a new snapshot. If your application writes too frequently (e.g., per record or small microbatch), metadata grows quickly and queries slow down. Instead, buffer data into larger batches before committing:

``` python
batch_df.writeTo("polaris.db.sales").append()
```
If you need streaming ingestion, tune the microbatch trigger interval and commit size. A five-minute trigger often balances latency and table stability better than writing every few seconds.

For update-heavy workloads, consider using Merge-Into operations periodically rather than constant row-level updates:

```sql
MERGE INTO polaris.db.sales t
USING updates u
ON t.id = u.id
WHEN MATCHED THEN UPDATE SET amount = u.amount
WHEN NOT MATCHED THEN INSERT *
```
This avoids snapshot sprawl and makes compaction less frequent.

### Align Partitioning with Query Patterns
Good partitioning reduces the number of files scanned per query. Avoid partitioning by high-cardinality columns like `user_id`. Instead, use transforms that group data efficiently:

```sql
ALTER TABLE polaris.db.sales REPLACE PARTITION FIELD sale_date WITH days(sale_date)
```

Or combine multiple transforms for balance:

```sql
CREATE TABLE polaris.db.sales (
  id BIGINT,
  region STRING,
  sale_date DATE,
  amount DOUBLE
)
USING iceberg
PARTITIONED BY (bucket(8, region), days(sale_date))
```

These partitioning rules make pruning effective and improve both reads and writes.

### Tune Commit and Validation Settings
For large write jobs, commit coordination and validation can also affect performance. Iceberg supports asynchronous manifest merging and snapshot cleanup to reduce contention:

```sql
ALTER TABLE polaris.db.sales SET TBLPROPERTIES (
  'commit.manifest-merge.enabled'='true',
  'commit.retry.num-retries'='5',
  'write.distribution-mode'='hash'
);
```
These settings help large concurrent writers (for example, in Spark and Flink) commit safely to the same table without conflicts.

Efficient Iceberg write patterns come from tuning Spark and table properties together. Use larger file targets, consistent partitioning, and controlled batch sizes to minimize small files and snapshot churn. By applying these strategies, your Iceberg tables will stay lean and performant—reducing the need for manual compaction or cleanup. Combined with Apache Polaris, your catalog enforces consistent governance, authentication, and metadata management across every compute engine in your lakehouse.

## 12. Understanding How Polaris Manages Your Iceberg Tables

Once you have optimized your write strategy, it’s worth understanding what happens behind the scenes when you write data into Iceberg tables through Apache Polaris. Polaris acts as a centralized catalog—responsible for managing all metadata about your tables, snapshots, and permissions—ensuring that every write or read operation is consistent across tools like Spark, Dremio, Trino, and Flink.

When Spark writes to an Iceberg table using Polaris, the process goes beyond simply saving files to MinIO or S3. Each commit updates a **snapshot**—a precise record of table state including data files, manifests, and partition metadata. Polaris stores the metadata pointers, enforces ACID guarantees, and validates that every write operation maintains table consistency.

### Coordinating Metadata and Commits

Each write to an Iceberg table involves several steps:
1. Spark writes data files (usually in Parquet format) to the storage layer, such as MinIO.
2. Spark generates a manifest list describing these new data files.
3. The Iceberg REST client, through Polaris, updates the catalog’s metadata location and commits the new snapshot.
4. Polaris enforces isolation and conflict detection to ensure concurrent writers don’t overwrite each other’s work.

Because Polaris manages these metadata transactions centrally, it becomes the single source of truth for all engines. This makes cross-engine interoperability reliable—Spark can write data, and Dremio or Trino can query it immediately without any manual refresh.

### Governance and Security

Polaris also introduces a security layer around Iceberg. Instead of embedding access keys or S3 credentials in your Spark jobs, Polaris can **vend temporary credentials** that enforce fine-grained access control. Each principal and catalog role determines what operations are allowed, ensuring that users and jobs interact only with the tables they are permitted to modify or query.

This approach decouples data governance from compute infrastructure. You can manage permissions, audit access, and rotate credentials—all directly through Polaris—while still using open data lakehouse standards like Apache Iceberg.

### Automatic Table Optimization in Dremio

If you use Dremio’s integrated catalog (built on Polaris), you also gain automated table optimization. Dremio monitors data size, file counts, and snapshot churn, then automatically runs compaction and metadata cleanup as needed. It maintains your Iceberg tables in an optimized state without requiring manual Spark procedures. 

That means you can focus on analytics, while Dremio and Polaris handle governance, credential management, and metadata consistency across all your compute platforms.

With this understanding, you now have a complete end-to-end view of how Apache Spark and Apache Polaris work together to maintain a modern, open lakehouse. From efficient write strategies to managed metadata and automated optimization, you can confidently scale your Iceberg data platform knowing it’s governed, interoperable, and future-proof.

## Next Steps and Expanding Your Lakehouse

Now that you’ve successfully set up Apache Polaris with Spark and Iceberg on your local machine, you’ve built a foundation for exploring the broader lakehouse ecosystem. This environment not only lets you understand Iceberg’s core table mechanics but also shows how a catalog like Polaris centralizes governance, metadata, and access control—key components of an interoperable lakehouse architecture.

### Connect More Compute Engines

Polaris is designed to work seamlessly across multiple compute engines. Once your Iceberg tables are registered in Polaris, you can connect tools such as:

- **Dremio** – Query and optimize Iceberg tables visually through its integrated Polaris-based catalog.  
- **Trino** – Use Polaris as a REST-based catalog for federated queries across your data lake.  
- **Flink** – Stream data into Iceberg tables managed by Polaris for real-time analytics.  
- **DuckDB** or **Python (PyIceberg)** – Interact directly with Iceberg tables for lightweight local exploration.

Each of these engines communicates through the same Polaris REST interface, ensuring that all metadata and access control remain consistent, no matter where you query from.

### Experiment with Advanced Iceberg Features

Once you’re comfortable with the basics, try exploring Iceberg’s advanced capabilities:

- **Schema Evolution** – Add, rename, or delete columns without rewriting data.  
- **Row-Level Deletes** – Use deletion vectors for efficient, fine-grained record removal.  
- **Table Branching and Tagging** – Experiment safely with data changes using versioned metadata.  
- **Snapshot Isolation** – Test concurrent writes to understand Iceberg’s transaction model.  

These features are fully tracked by Polaris, giving you a reliable, auditable history of every change.


### Extend with Automation and Orchestration

You can also automate your setup and maintenance workflows:
- Use **Airflow** or **Cron** to run the `bootstrap.py` script on a schedule, ensuring consistent initialization of catalogs and principals.
- Create periodic **compaction** or **snapshot expiration** jobs using Spark SQL.
- Deploy your Polaris setup in **Kubernetes** using Helm or Docker Compose for multi-user testing environments.

### Prepare for Cloud or Hybrid Deployment

The setup you’ve built locally with MinIO can easily extend to real cloud storage systems. Replace your MinIO endpoint with S3, GCS, or Azure Blob credentials, and Polaris will manage your Iceberg tables just as before—using the same metadata model and APIs.

This local-to-cloud continuity is one of the greatest advantages of Iceberg and Polaris: your data architecture can scale from a personal laptop demo to a full production lakehouse without refactoring or vendor lock-in.

### Wrapping Up

You’ve now seen how Apache Iceberg, Apache Polaris, and Apache Spark work together to form a robust, open lakehouse. Through this hands-on setup, you’ve learned how to:

- Write and optimize Iceberg tables in Spark.  
- Manage metadata, catalogs, and access through Polaris.  
- Explore advanced Iceberg features safely and efficiently.

For larger-scale deployments—or if you want automated optimization, integrated governance, and performance acceleration—explore **Dremio’s Intelligent Lakehouse Platform**, which builds directly on Apache Polaris and Iceberg to deliver a unified, self-service analytics experience.
