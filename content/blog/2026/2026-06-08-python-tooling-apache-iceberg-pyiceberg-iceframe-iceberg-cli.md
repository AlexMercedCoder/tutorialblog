---
title: "Modern Python Tooling for Apache Iceberg"
date: "2026-06-08"
description: "PyIceberg, IceFrame, and the Iceberg CLI form a complete Python toolchain for Iceberg table management. Each tool targets a different workflow from metadata inspection to data engineering."
author: "Alex Merced"
category: "Open Source"
tags:
  - "Python Apache Iceberg tooling"
  - "PyIceberg"
  - "IceFrame"
  - "iceberg-cli"
  - "Spark-free Iceberg"
  - "Iceberg Python ecosystem"
---

## The Python Iceberg Ecosystem in 2026

Apache Iceberg started as a Java project. The table format specification, the core libraries, and the major query engines all ran on the JVM. Python users who wanted to work with Iceberg tables had two options. Install PySpark and use the Spark Iceberg integration, or write raw HTTP calls against the Iceberg REST Catalog API.

Neither option was satisfying. PySpark is a 500MB dependency that takes minutes to start. Raw HTTP calls work but skip all the metadata handling that makes Iceberg useful.

The Python ecosystem around Iceberg has matured rapidly. PyIceberg, the official Apache Python client, now sees over 500,000 daily PyPI downloads according to PyPI download statistics. IceFrame provides a pandas-like DataFrame interface built on top of PyIceberg. The PyIceberg CLI gives command-line access to table metadata and properties.

These three tools form a complete Python toolchain for Iceberg table management. Each targets a different workflow. Together they cover metadata inspection, catalog automation, data engineering, and AI agent integration. None of them require a JVM.

## PyIceberg: The Foundation

PyIceberg is the official Apache Python library for Iceberg. It provides programmatic access to Iceberg table metadata and data without needing Java or Spark. The library works with any Iceberg REST catalog, including Apache Polaris, AWS Glue, and Databricks Unity Catalog.

PyIceberg's architecture mirrors the Iceberg specification. It handles catalog operations (listing namespaces, creating tables), metadata operations (reading snapshots, schema evolution), and data operations (appending files, reading table data). The library uses PyArrow for columnar data handling and supports Parquet, Avro, and ORC file formats.

A typical PyIceberg workflow looks like this:

```python
from pyiceberg.catalog import load_catalog

catalog = load_catalog(
    "default",
    **{
        "uri": "https://catalog.example.com/api/iceberg",
        "warehouse": "my_warehouse",
    }
)

table = catalog.load_table("sales.transactions")
for snapshot in table.snapshots():
    print(f"Snapshot {snapshot.snapshot_id}: "
          f"{snapshot.operation}, "
          f"{snapshot.timestamp_ms}")
```

This code connects to an Iceberg REST catalog, loads a table, and iterates its snapshots. No Spark context, no JVM startup, no Hadoop configuration. The entire operation runs in Python.

PyIceberg also supports schema evolution, partition pruning, time travel, and branch operations. You can add a column, roll back to a previous snapshot, or create a write-audit-publish branch. All through Python APIs.

The library's daily download count of 500,000+ reflects its adoption beyond the data engineering community. ML engineers use PyIceberg to read training data from Iceberg tables directly into PyArrow or pandas DataFrames. Platform engineers use it to automate catalog operations. AI agents use it through MCP servers for governed data access.

## PyIceberg CLI: Command-Line Metadata Management

The PyIceberg CLI ships with the `pyiceberg` package. No extra installation needed. It provides commands for listing namespaces and tables, describing table metadata, managing properties, and inspecting file layouts.

Common CLI workflows:

```bash
# List all namespaces in the catalog
pyiceberg list

# List tables in a namespace
pyiceberg list nyc

# Describe a table
pyiceberg describe nyc.taxis

# Get table schema
pyiceberg schema nyc.taxis

# List all files in a table
pyiceberg files nyc.taxis
```

The `--output json` flag enables programmatic consumption. Combined with `jq`, you can extract table metadata in pipelines without writing Python code:

```bash
pyiceberg --output json describe nyc.taxis | jq '.metadata.current-snapshot-id'
```

This makes the CLI useful in CI/CD scripts, monitoring dashboards, and incident response workflows. When a pipeline fails because of a schema mismatch, a quick `pyiceberg schema` command shows the current state without opening a notebook or a database console.

Property management is another CLI strength. You can set Iceberg table properties like `write.metadata.delete-after-commit.enabled` directly from the command line:

```bash
pyiceberg properties set table nyc.taxis \
    write.metadata.delete-after-commit.enabled true
```

This is useful for maintenance operations that need to run across many tables. A shell loop can apply the same property to every table in a namespace, something that would require separate code in PyIceberg or Spark.

## IceFrame: Pandas-Like Iceberg Operations

IceFrame is a newer library that provides a DataFrame-like interface for Iceberg operations. Created by Alex Merced and available on GitHub, IceFrame builds on PyIceberg, PyArrow, and Polars to provide simplified table management.

The key difference from PyIceberg is abstraction level. PyIceberg exposes the Iceberg metadata model directly. You work with `Table`, `Snapshot`, `ManifestFile` objects. IceFrame wraps these into a higher-level API:

```python
from iceframe import IceFrame
from iceframe.utils import load_catalog_config_from_env

config = load_catalog_config_from_env()
ice = IceFrame(config)

# Create a table with a simple schema
schema = {"id": "long", "name": "string", "created_at": "timestamp"}
ice.create_table("my_table", schema)

# Append data from a Polars DataFrame
import polars as pl
data = pl.DataFrame({
    "id": [1, 2, 3],
    "name": ["Alice", "Bob", "Charlie"],
    "created_at": [pl.datetime(2024, 1, 1),
                   pl.datetime(2024, 1, 2),
                   pl.datetime(2024, 1, 3)]
})
ice.append_to_table("my_table", data)

# Read data back
df = ice.read_table("my_table")
print(df)
```

IceFrame includes a Query Builder API for filtering, grouping, and aggregating:

```python
from iceframe.expressions import col
from iceframe.functions import sum

result = (ice.query("my_table")
          .select("name", sum(col("id")).alias("total_id"))
          .group_by("name")
          .execute())
```

For AI agent workflows, IceFrame provides an MCP server that exposes Iceberg operations through the Model Context Protocol. An agent can create tables, write data, and query results through standardized MCP tools.

IceFrame's maintenance features are also notable. The `bin_pack` and `sort` compaction strategies use Polars for efficient data rewriting. The `GarbageCollector` removes orphan files. The `rollback_to_timestamp` method handles point-in-time recovery. These operations typically require Spark or custom scripts. IceFrame runs them locally using PyArrow and Polars.

Current status is alpha. The library has 24 GitHub stars and a single contributor as of June 2026. The API may change. But the design direction is clear: make Iceberg as easy to use as pandas, without requiring a cluster.

## When to Use Each Tool

The three tools serve different workflow patterns.

**Use PyIceberg directly** when you need fine-grained control over Iceberg metadata. Schema evolution, snapshot management, partition operations, and direct catalog integration all work best through the core library. PyIceberg is also the right choice when you are building automation tools that other teams will consume, because it is the standard Apache library with no abstraction overhead.

**Use the PyIceberg CLI** for ad-hoc metadata inspection and property management. When you need to check a table schema during an incident, apply a property change across many tables, or integrate Iceberg checks into a CI/CD pipeline, the CLI is faster than writing Python code. It is also the most accessible tool for operations teams who may not write Python regularly.

**Use IceFrame** when you want a pandas-like experience for Iceberg operations. Data scientists and ML engineers who are comfortable with DataFrames may find IceFrame's API more natural than PyIceberg's metadata-object model. IceFrame is also a good choice for small to medium-scale ETL workflows where the overhead of Spark or Flink is not justified.

All three tools run without a JVM. This is the unifying advantage. A Python-based Iceberg toolchain means you can manage Iceberg tables in the same environment where you train ML models, run web applications, or operate CI/CD pipelines. No separate Spark cluster, no infrastructure coordination.

## Practical Workflow: Automated Table Maintenance

A common production workflow combines all three tools. Consider a maintenance script that runs daily on an Iceberg table.

First, the script uses the CLI to check the table's current partition layout and snapshot count:

```bash
SNAPSHOT_COUNT=$(pyiceberg --output json describe \
    sales.transactions | jq '.metadata.snapshots | length')
if [ "$SNAPSHOT_COUNT" -gt 100 ]; then
    echo "Need to expire old snapshots"
fi
```

If maintenance is needed, a Python script using PyIceberg expires old snapshots and removes orphan files:

```python
from pyiceberg.catalog import load_catalog

catalog = load_catalog("default", **config)
table = catalog.load_table("sales.transactions")

# Expire snapshots older than 7 days
table.expire_snapshots(
    timestamp_ms=int(time.time()) * 1000 - 7 * 86400 * 1000
)

# Remove orphan files
table.remove_orphan_files(retention_threshold=datetime.timedelta(days=3))
```

Finally, IceFrame compacts small files if the data file count exceeds a threshold:

```python
from iceframe import IceFrame

ice = IceFrame(config)
table_stats = ice.get_table_stats("sales.transactions")

if table_stats["data_file_count"] > 1000:
    ice.compact_table("sales.transactions",
                      strategy="bin_pack",
                      target_file_size_mb=128)
```

This three-tool workflow handles the complete maintenance cycle without Spark, without a Java environment, and without custom infrastructure.

## AI Agent Integration Through Python

The Python Iceberg ecosystem connects to AI agents through two patterns. The first is direct library calls. An agent running in a Python environment can import PyIceberg or IceFrame and interact with Iceberg tables programmatically. This is the pattern for automated data engineering agents that need full control over table operations.

The second pattern is MCP. An agent using the Model Context Protocol connects to an MCP server that wraps Iceberg operations. PyIceberg and IceFrame both support MCP server implementations. The agent discovers tables, reads schemas, and queries data through standardized MCP tools.

The MCP pattern is safer for general-purpose AI agents because the server controls which operations are allowed. A typical MCP server for Iceberg might expose `list_tables`, `describe_table`, and `run_select_query` tools while blocking `drop_table` and `alter_schema`. The agent never gets direct catalog credentials.

Both patterns benefit from the JVM-free Python stack. An agent container can include PyIceberg and IceFrame without the multi-gigabyte Spark dependency. Startup times are measured in milliseconds instead of minutes. Resource usage stays proportional to the data being processed, not the cluster being started.

## Iceberg Branching and Time Travel in Python

Iceberg's branching feature, inspired by Git, lets you create isolated copies of a table for development, testing, or audit purposes. PyIceberg provides full branch and tag support through its Python API.

A typical branching workflow looks like this. You create a branch for a data quality experiment. You run transformations on the branch without affecting the main table. If the results look good, you fast-forward the main branch to include the changes. If the experiment fails, you delete the branch and the main table remains unchanged.

PyIceberg supports this through its snapshot management API:

```python
table = catalog.load_table("analytics.revenue")
# Create a branch for experimentation
table.create_branch("quality-checks")
# Check the current state
refs = table.list_refs()
for ref_name, ref in refs.items():
    print(f"{ref_name}: snapshot {ref.snapshot_id}")
```

IceFrame adds convenience methods for the same operations. The `create_branch`, `fast_forward`, and `rollback_to_timestamp` methods handle common branching patterns with fewer lines of code.

Time travel is available in both PyIceberg (via snapshot selection) and the CLI (via `iceberg_timestamp_ms` setting in ClickHouse queries). An agent that needs to compare current data with a previous state can use time travel to query both snapshots in a single session.

## The Bottom Line

The Python Iceberg ecosystem in 2026 is mature enough for production use. PyIceberg handles core metadata and data operations with 500,000+ daily downloads and a growing community. The PyIceberg CLI provides command-line access for operations teams and CI/CD workflows. IceFrame offers a higher-level DataFrame experience for data scientists and smaller-scale ETL.

All three tools share the critical advantage of running without a JVM. Teams can manage Iceberg tables in the same Python environments where they train models, run web applications, and deploy agents. The Spark requirement, once the biggest barrier to Python-based Iceberg adoption, is no longer necessary for most Iceberg operations.

The remaining gap is write support for complex transformation pipelines. PyIceberg supports appending data and overwriting partitions, but full-fledged ETL with multi-table joins, window functions, and CDC still benefits from Spark or Flink. For metadata management, catalog automation, maintenance operations, and AI agent integration, the Python toolchain is ready.

---

**Building data pipelines on Apache Iceberg?** Dremio's lakehouse platform provides a SQL query engine and semantic layer for Iceberg tables across any cloud or catalog. Pair it with PyIceberg and IceFrame for a complete Python-to-Iceberg workflow. [Learn more at dremio.com](https://www.dremio.com).
