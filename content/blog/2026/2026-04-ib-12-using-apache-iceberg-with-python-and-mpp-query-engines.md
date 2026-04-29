---
title: "Using Apache Iceberg with Python and MPP Query Engines"
date: "2026-04-29"
description: "<!-- Meta Description: Access Iceberg tables from Python with PyIceberg, DuckDB, and Polars, or through MPP engines like Dremio, Spark, and Trino. Here is..."
author: "Alex Merced"
category: "Apache Iceberg"
bannerImage: "./images/apache-iceberg-masterclass/12/mpp-engine-comparison.png"
tags:
  - apache iceberg
  - data lakehouse
  - data engineering
  - table formats
---

<!-- Meta Description: Access Iceberg tables from Python with PyIceberg, DuckDB, and Polars, or through MPP engines like Dremio, Spark, and Trino. Here is how each approach works. -->
<!-- Primary Keyword: Python Apache Iceberg -->
<!-- Secondary Keywords: PyIceberg, DuckDB Iceberg, Dremio Arrow Flight, MPP query engine -->

This is Part 12 of a 15-part [Apache Iceberg Masterclass](/tags/apache-iceberg/). [Part 11](/2026/2026-04-ib-11-apache-iceberg-metadata-tables-querying-the-internals/) covered metadata tables. This article covers the two main ways to access Iceberg data: directly from Python libraries and through MPP (massively parallel processing) query engines.

## Table of Contents

1. [What Are Table Formats and Why Were They Needed?](/2026/2026-04-ib-01-what-are-table-formats-and-why-were-they-needed/)
2. [The Metadata Structure of Current Table Formats](/2026/2026-04-ib-02-the-metadata-structure-of-modern-table-formats/)
3. [Performance and Apache Iceberg's Metadata](/2026/2026-04-ib-03-performance-and-apache-icebergs-metadata/)
4. [Technical Deep Dive on Partition Evolution](/2026/2026-04-ib-04-partition-evolution-change-your-partitioning-without-rewriti/)
5. [Technical Deep Dive on Hidden Partitioning](/2026/2026-04-ib-05-hidden-partitioning-how-iceberg-eliminates-accidental-full-t/)
6. [Writing to an Apache Iceberg Table](/2026/2026-04-ib-06-writing-to-an-apache-iceberg-table-how-commits-and-acid-actu/)
7. [What Are Lakehouse Catalogs?](/2026/2026-04-ib-07-what-are-lakehouse-catalogs-the-role-of-catalogs-in-apache-i/)
8. [Embedded Catalogs: S3 Tables and MinIO AI Stor](/2026/2026-04-ib-08-when-catalogs-are-embedded-in-storage/)
9. [How Iceberg Table Storage Degrades Over Time](/2026/2026-04-ib-09-how-data-lake-table-storage-degrades-over-time/)
10. [Maintaining Apache Iceberg Tables](/2026/2026-04-ib-10-maintaining-apache-iceberg-tables-compaction-expiry-and-clea/)
11. [Apache Iceberg Metadata Tables](/2026/2026-04-ib-11-apache-iceberg-metadata-tables-querying-the-internals/)
12. [Using Iceberg with Python and MPP Engines](/2026/2026-04-ib-12-using-apache-iceberg-with-python-and-mpp-query-engines/)
13. [Streaming Data into Apache Iceberg Tables](/2026/2026-04-ib-13-approaches-to-streaming-data-into-apache-iceberg-tables/)
14. [Hands-On with Iceberg Using Dremio Cloud](/2026/2026-04-ib-14-hands-on-with-apache-iceberg-using-dremio-cloud/)
15. [Migrating to Apache Iceberg](/2026/2026-04-ib-15-migrating-to-apache-iceberg-strategies-for-every-source-syst/)

## The Python Ecosystem for Iceberg

![How Python libraries and MPP engines connect to Iceberg tables](images/apache-iceberg-masterclass/12/python-iceberg-stack.png)

### PyIceberg: Native Python Access

PyIceberg is the official Python library for Apache Iceberg. It reads Iceberg metadata directly and can scan data files without an external query engine.

```python
from pyiceberg.catalog import load_catalog

# Connect to a REST catalog
catalog = load_catalog("my_catalog", **{
    "type": "rest",
    "uri": "https://catalog.example.com",
})

# Load and scan a table
table = catalog.load_table("analytics.orders")
scan = table.scan(row_filter="amount > 100")
df = scan.to_pandas()
```

![The five-step PyIceberg workflow from catalog connection to analysis](images/apache-iceberg-masterclass/12/pyiceberg-workflow.png)

PyIceberg leverages Iceberg's [metadata-driven pruning](/2026/2026-04-ib-03-performance-and-apache-icebergs-metadata/): the `row_filter` is pushed down to manifest evaluation, so only relevant data files are read. For reading subsets of large tables into Python for analysis or ML training, this is remarkably efficient.

PyIceberg also supports writes (appending data from Arrow tables), schema evolution, and table management operations. It connects to any catalog that implements the REST protocol, including [Dremio Open Catalog](https://www.dremio.com/platform/open-catalog/).

### DuckDB: SQL-Based Python Analysis

DuckDB can read Iceberg tables through its Iceberg extension:

```python
import duckdb

conn = duckdb.connect()
conn.execute("INSTALL iceberg; LOAD iceberg;")

df = conn.execute("""
    SELECT customer_id, SUM(amount) as total
    FROM iceberg_scan('s3://warehouse/orders')
    GROUP BY customer_id
""").fetchdf()
```

DuckDB processes the query locally using its columnar execution engine, which is significantly faster than pandas for analytical queries. It supports Iceberg's partition pruning and column statistics for file skipping. DuckDB runs entirely in-process, so there is no separate server to manage. This makes it a strong choice for local analysis, CI/CD data validation, and notebooks where starting a Spark cluster would be overkill.

DuckDB also supports reading Iceberg metadata tables, which means you can use it for [table health diagnostics](/2026/2026-04-ib-09-how-data-lake-table-storage-degrades-over-time/) without standing up a full query engine.

### Polars: High-Performance DataFrames

Polars can read Iceberg tables through its `scan_iceberg` method, providing lazy evaluation and parallel processing:

```python
import polars as pl

df = pl.scan_iceberg("s3://warehouse/orders").filter(
    pl.col("amount") > 100
).collect()
```

Polars uses a lazy evaluation model: the `scan_iceberg` call does not read data immediately. Instead, it builds an execution plan. When `collect()` is called, Polars optimizes the plan (predicate pushdown, column pruning, parallel reads) and executes it. For large Iceberg tables, Polars can scan data several times faster than pandas because it uses all available CPU cores and processes data in Apache Arrow columnar format.

### Writing from Python

PyIceberg supports writes through Apache Arrow tables:

```python
import pyarrow as pa

# Create an Arrow table with new data
new_data = pa.table({
    "order_id": [1001, 1002, 1003],
    "amount": [150.00, 275.50, 89.99],
    "order_date": ["2024-03-15", "2024-03-15", "2024-03-16"],
})

# Append to the Iceberg table
table.append(new_data)
```

This creates a new Iceberg [commit](/2026/2026-04-ib-06-writing-to-an-apache-iceberg-table-how-commits-and-acid-actu/) with the data files, manifests, and metadata. PyIceberg handles the entire write lifecycle, including partition assignment based on the table's [partition spec](/2026/2026-04-ib-05-hidden-partitioning-how-iceberg-eliminates-accidental-full-t/).

For bulk writes from Python, using PyIceberg with Arrow is often simpler than setting up Spark. However, PyIceberg runs on a single machine, so it is not suitable for writing terabyte-scale datasets. For that, use an MPP engine.

## MPP Query Engines

![Comparison of MPP engines for Iceberg workloads showing read, write, and maintenance capabilities](images/apache-iceberg-masterclass/12/mpp-engine-comparison.png)

For production workloads at scale, Python libraries running on a single machine are not sufficient. MPP engines distribute query execution across multiple nodes, handling petabyte-scale tables with sub-minute response times.

### Dremio

[Dremio](https://www.dremio.com/blog/apache-iceberg-101-your-guide-to-learning-apache-iceberg-concepts-and-practices/) provides full Iceberg support with several unique capabilities: [query federation](https://www.dremio.com/platform/federation/) across Iceberg and non-Iceberg sources, [automatic table optimization](https://www.dremio.com/blog/table-optimization-in-dremio/) through Open Catalog, a [semantic layer](https://www.dremio.com/platform/semantic-layer/) for governed access, and [AI-powered analytics](https://www.dremio.com/platform/ai/) through its built-in agent and MCP server.

For Python users, Dremio exposes data through Apache Arrow Flight, which is a high-performance data transfer protocol. Arrow Flight sends data in columnar Arrow format directly to the client, avoiding the serialization overhead of JDBC/ODBC. This makes it 10-100x faster than traditional database connectors for large result sets:

```python
from dremio_simple_query import DremioConnection

conn = DremioConnection("https://your-dremio.cloud", token="...")
df = conn.query("SELECT * FROM analytics.orders WHERE amount > 100")
```

The result is a pandas DataFrame populated via Arrow Flight. Because the data stays in Arrow format end-to-end (Iceberg Parquet to Dremio to Arrow Flight to pandas), there are no format conversion bottlenecks.

Dremio also provides a [Columnar Cloud Cache](https://www.dremio.com/blog/dremios-columnar-cloud-cache-c3/) that stores frequently accessed data on local NVMe drives, making subsequent queries against the same Iceberg data dramatically faster without requiring reflections or materialized views.

### Spark

Apache Spark is the most mature Iceberg engine for both reads and writes. It handles batch ETL, streaming ingestion ([Part 13](/2026/2026-04-ib-13-approaches-to-streaming-data-into-apache-iceberg-tables/)), and all [maintenance operations](/2026/2026-04-ib-10-maintaining-apache-iceberg-tables-compaction-expiry-and-clea/). Most Iceberg production pipelines use Spark for data ingestion because of its extensive connector ecosystem (Kafka, JDBC, file formats) and its ability to process large volumes across a distributed cluster.

Spark supports all Iceberg operations: CREATE, INSERT, MERGE, DELETE, UPDATE, schema evolution, partition evolution, and every maintenance procedure (compaction, snapshot expiry, orphan cleanup).

### Trino

Trino (formerly PrestoSQL) is optimized for interactive, ad-hoc queries with low latency. It reads and writes Iceberg tables and supports the REST catalog protocol. Trino is popular for exploration and dashboarding workloads where sub-second response times matter and data is being read rather than written. Its architecture keeps no persistent state, making it easy to scale up and down based on query demand.

### Other Engines

Several other engines provide Iceberg support: AWS Athena (serverless, AWS-native), Snowflake (read-only for external Iceberg tables), StarRocks (sub-second analytics), and Doris (real-time analytics). The Iceberg community maintains a [compatibility matrix](https://iceberg.apache.org/multi-engine-support/) showing which engines support which operations.

### Choosing the Right Approach

| Scenario | Recommended |
|---|---|
| Quick analysis of a table subset | PyIceberg or DuckDB |
| Production dashboards and reports | [Dremio](https://www.dremio.com/platform/) |
| Batch ETL pipelines | Spark |
| Interactive data exploration | Trino or Dremio |
| ML feature extraction | PyIceberg + pandas |
| Multi-source analytics | [Dremio federation](https://www.dremio.com/platform/federation/) |
| Serverless AWS queries | Athena |

The key takeaway: Python libraries (PyIceberg, DuckDB, Polars) are best for local analysis and development. MPP engines (Dremio, Spark, Trino) are necessary for production-scale analytics. Many teams use both: PyIceberg for data science experimentation, and Dremio for production dashboards and governed access.

[Part 13](/2026/2026-04-ib-13-approaches-to-streaming-data-into-apache-iceberg-tables/) covers how to stream data into Iceberg tables.

### Books to Go Deeper

- [Architecting the Apache Iceberg Lakehouse](https://www.amazon.com/Architecting-Apache-Iceberg-Lakehouse-open-source/dp/1633435105/) by Alex Merced (Manning)
- [Lakehouses with Apache Iceberg: Agentic Hands-on](https://www.amazon.com/Lakehouses-Apache-Iceberg-Agentic-Hands-ebook/dp/B0GQL4QNRT/) by Alex Merced
- [Constructing Context: Semantics, Agents, and Embeddings](https://www.amazon.com/Constructing-Context-Semantics-Agents-Embeddings/dp/B0GSHRZNZ5/) by Alex Merced
- [Apache Iceberg & Agentic AI: Connecting Structured Data](https://www.amazon.com/Apache-Iceberg-Agentic-Connecting-Structured/dp/B0GW2WF4PX/) by Alex Merced
- [Open Source Lakehouse: Architecting Analytical Systems](https://www.amazon.com/Open-Source-Lakehouse-Architecting-Analytical/dp/B0GW595MVL/) by Alex Merced

### Free Resources

- [FREE - Apache Iceberg: The Definitive Guide](https://drmevn.fyi/linkpageiceberg)
- [FREE - Apache Polaris: The Definitive Guide](https://drmevn.fyi/linkpagepolaris)
- [FREE - Agentic AI for Dummies](https://hello.dremio.com/wp-resources-agentic-ai-for-dummies-reg.html?utm_source=link_page&utm_medium=influencer&utm_campaign=iceberg&utm_term=qr-link-list-04-07-2026&utm_content=alexmerced)
- [FREE - Leverage Federation, The Semantic Layer and the Lakehouse for Agentic AI](https://hello.dremio.com/wp-resources-agentic-analytics-guide-reg.html?utm_source=link_page&utm_medium=influencer&utm_campaign=iceberg&utm_term=qr-link-list-04-07-2026&utm_content=alexmerced)
- [FREE with Survey - Understanding and Getting Hands-on with Apache Iceberg in 100 Pages](https://forms.gle/xdsun6JiRvFY9rB36)
