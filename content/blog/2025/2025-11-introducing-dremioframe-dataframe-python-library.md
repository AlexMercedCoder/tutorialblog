---
title: Introducing dremioframe - A Pythonic DataFrame Interface for Dremio
date: "2025-11-29"
description: "Discover dremioframe, a new Python library that offers a DataFrame-like experience for interacting with Dremio's data lakehouse platform. Learn how to leverage its intuitive API to streamline your data engineering workflows."
author: "Alex Merced"
category: "Data Engineering"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - Dremio
  - Data Engineering
  - Python
---

If you're a data analyst or Python developer who prefers chaining expressive `.select()` and `.mutate()` calls over writing raw SQL, you're going to love `dremioframe` — the unofficial Python DataFrame library for Dremio (currently in Alpha).

Dremio has always made it easy to query across cloud and on-prem datasets using SQL. Some users prefer the ergonomics of DataFrame-style APIs, where transformations are composable, readable, and testable — especially when working in notebooks or building data pipelines in Python.

That’s where `dremioframe` comes in. It bridges the gap between SQL and Python by letting you build Dremio queries using intuitive DataFrame methods like `.select()`, `.filter()`, `.mutate()`, and more. Under the hood, it still generates SQL and pushes down queries to Dremio, but you write it the way you're used to in Python.

> Want to try this yourself?  
> You can [sign up for a free 30-day trial of Dremio Cloud](https://drmevn.fyi/am-get-started), which includes full access to Agentic AI features, native Apache Iceberg integration, and support for all Iceberg catalogs (e.g. AWS Glue, Nessie, Snowflake, Hive, etc.).  
> Or if you'd rather run Dremio locally for free, check out the [Community Edition setup guide](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/). Community Edition doesn’t include Agentic AI or full catalog support, but still lets you run federated queries and work with some Iceberg catalogs like Glue and Nessie.

In this post, we’ll walk through how to get started with `dremioframe`—from installing the library and configuring authentication, to writing powerful queries using SQL, DataFrame chaining, and expression builders. We’ll wrap up with a look at some of the more advanced features it unlocks for analytics, ingestion, and administration.

Let’s dive in.

## Installing `dremioframe` and Setting Up Your Environment

To get started, you’ll need to install the `dremioframe` Python package. It’s published on PyPI and can be installed with pip:

```bash
pip install dremioframe
```

Once installed, you’ll need to set up authentication so the library can connect to your Dremio instance. The easiest way to do this is by setting environment variables in a .env file or directly in your shell.

### For Dremio Cloud (recommended for full feature access):
In your .env file (or shell), set the following:

```env
DREMIO_PAT=<your_personal_access_token>
DREMIO_PROJECT_ID=<your_project_id>
DREMIO_PROJECT_NAME=<your_project_name>
```
These credentials can be generated in your Dremio Cloud account by going to project settings.

#### Don’t have an account?
[Start your free 30-day trial of Dremio Cloud](https://drmevn.fyi/am-get-started) to use dremioframe with Agentic AI, native Apache Iceberg support, and full access to all Iceberg catalogs.

### For Dremio Community Edition (local setup):
If you're running Dremio locally, for example using the Community Edition, you’ll use a different set of environment variables or pass connection parameters directly in code:

```env
DREMIO_HOSTNAME=localhost
DREMIO_PORT=32010
DREMIO_USERNAME=admin
DREMIO_PASSWORD=password123
DREMIO_TLS=false
```

#### Not ready for the cloud yet?
You can [try the Community Edition locally by following this guide](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/).
It supports federated queries and works with some Iceberg catalogs (like AWS Glue and Nessie), though it doesn’t include the AI features or full catalog support available in Dremio Cloud and Enterprise.

With your environment configured, you’re ready to connect to Dremio and start querying like a Pythonista.

## Creating a Dremio Client (Sync or Async)

Once your environment is set up, the next step is to create a `DremioClient` instance. This object is your entry point for running queries with `dremioframe`.

### Synchronous Client

For most use cases, the synchronous client is sufficient and straightforward to use. If you've set your environment variables, you can initialize the client like this:

```python
from dremioframe.client import DremioClient

client = DremioClient()  # reads config from environment
```
If you prefer to pass credentials explicitly (useful in scripts or when using the Community Edition), you can do:

```python
client = DremioClient(
    hostname="localhost",
    port=32010,
    username="admin",
    password="password123",
    tls=False  # Set to True if connecting over HTTPS
)
```
This sets up a connection to your Dremio instance using standard authentication.

### Asynchronous Client
If you're working in an async application (e.g., FastAPI, asyncio notebooks, etc.), dremioframe also supports an async client:

```python
from dremioframe.client import AsyncDremioClient

async with AsyncDremioClient(
    pat="YOUR_PAT", 
    project_id="YOUR_PROJECT_ID"
) as client:
    df = await client.table("Samples.samples.dremio.com.zips.json") \
                    .select("city", "state") \
                    .limit(5) \
                    .toPandas()
    print(df)
```

The async API mirrors the sync one, but allows you to await results in event-driven applications.

## Running a Pure SQL Query

Even though `dremioframe` shines with its DataFrame-style interface, you can still execute raw SQL when needed using the `.query()` method. This is helpful when you already have a SQL statement or want to run ad hoc queries.

Here’s a simple example that selects city and state from the sample zips dataset:

```python
df = client.query("""
    SELECT city, state
    FROM Samples.samples.dremio.com.zips.json
    WHERE state = 'CA'
    ORDER BY city
    LIMIT 10
""")

print(df)
```

The result is a lightweight wrapper around a Pandas DataFrame, so you can treat it just like any other DataFrame in Python.

You can also convert it explicitly to a Pandas DataFrame if needed:

```python
pdf = df.toPandas()
```

**Tip:** Dremio optimizes and accelerates this query under the hood, especially when you're on [Dremio Cloud](https://drmevn.fyi/am-get-started), where features like autonomous reflection caching are automatic and don't need manual usage.

If you prefer a hybrid approach, dremioframe allows mixing SQL and DataFrame APIs freely—which we'll explore next.

## Querying with `.select()` and SQL Functions

The real power of `dremioframe` comes from its expressive, Pandas-like query builder. You can use `.select()` to pick columns and include SQL expressions, just like in raw SQL — but with the clarity and structure of method chaining.

Let’s say we want to select a few fields and apply a SQL function like `UPPER()` to transform the state name:

```python
df = client.table("Samples.samples.dremio.com.zips.json") \
           .select(
               "city", 
               "state", 
               "pop", 
               "UPPER(state) AS state_upper"  # using SQL function
           ) \
           .filter("pop > 100000") \
           .limit(10) \
           .collect()

print(df)
```

This returns 10 rows where the population is over 100,000 and includes the state_upper column that’s uppercased using Dremio’s SQL engine.

**Remember:** even though you're using .select(), these expressions are passed through directly to Dremio and fully optimized as part of the SQL query plan.

You can freely combine standard column names with SQL functions, aliases, expressions, and computed columns. This lets you build powerful queries without writing SQL directly.

Want to experiment yourself? Spin up a [free Dremio Cloud workspace](https://drmevn.fyi/am-get-started) or try the [Community Edition on your laptop](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/).

## Transforming Data with `.mutate()`

While `.select()` is great for choosing and computing columns in one go, `.mutate()` lets you **add new derived columns** to an existing selection — much like `mutate()` in R or `.assign()` in Pandas.

Let’s take the same query from before and add a new column that calculates population density by dividing population by a fictional land area (just for demo purposes):

```python
df = client.table("Samples.samples.dremio.com.zips.json") \
           .select("city", "state", "pop") \
           .mutate(
               pop_thousands="pop / 1000",               # create a scaled version
               pop_label="CASE WHEN pop > 100000 THEN 'large' ELSE 'small' END"
           ) \
           .filter("state = 'TX'") \
           .limit(10) \
           .collect()

print(df)
```
In this example:

- `pop_thousands` is a new numeric column.

- `pop_label` is a new string column based on a conditional expression using CASE WHEN.

You can pass any SQL-compatible string expressions into .mutate() using column_name=expression syntax. The expressions are compiled into the underlying SQL query, so performance is fully optimized.

**Pro tip:** You can chain multiple .mutate() calls if you prefer smaller, incremental steps.

Try experimenting with your own columns! If you’re using [Dremio Cloud](https://drmevn.fyi/am-get-started), you can test these queries on larger datasets with full query acceleration and Iceberg table support. Or run [Community Edition](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/) locally to follow along with your own data.

## Building Queries Programmatically with the Function API

For more complex or dynamic queries, `dremioframe` provides a powerful **function builder API** through the `F` module — similar to how PySpark or dplyr work. This lets you construct expressions programmatically rather than writing raw SQL strings.

Let’s rewrite the previous example using `F`:

```python
from dremioframe import F

df = client.table("Samples.samples.dremio.com.zips.json") \
           .select(
               F.col("city"),
               F.col("state"),
               F.col("pop"),
               (F.col("pop") / 1000).alias("pop_thousands"),
               F.case()
                 .when(F.col("pop") > 100000, F.lit("large"))
                 .else_(F.lit("small"))
                 .end()
                 .alias("pop_label")
           ) \
           .filter(F.col("state") == F.lit("TX")) \
           .limit(10) \
           .collect()

print(df)
```
### What’s happening here?
- `F.col("column_name")` references a column.

- `F.case().when(...).else_(...).end()` builds a SQL `CASE WHEN` expression.

- `F.lit("value")` injects a literal value into the expression.

- Arithmetic operations like / can be done using Python operators.

This method is especially useful when building queries dynamically — for instance, choosing which fields to include or filter based on user input.

**Tip:** You can mix function objects with standard strings if needed. Just make sure each expression passed to `.select()` or `.mutate()` is either a string or an `F` object.

Want to try building dynamic queries against Iceberg tables or REST-ingested datasets? Sign up for [Dremio Cloud](https://drmevn.fyi/am-get-started) or use [Community Edition](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/) to test these locally.

## What Else Can `dremioframe` Do?

By now, you’ve seen how `dremioframe` lets you run SQL, build DataFrame-style queries, and programmatically compose logic using expressions. But there’s much more under the hood.

Here’s a quick overview of some additional capabilities you might find useful:

### 🔄 Joins, Unions, and Time Travel

- Join tables with `.join()`, `.left_join()`, `.right_join()`, or `.full_join()` using either SQL expressions or `F` functions.
- Use `.union()` to combine rows from two datasets.
- Query historical snapshots of Iceberg tables using `.at_snapshot("SNAPSHOT_ID")`.

```python
df = client.table("sales").at_snapshot("123456789")
```

- Iceberg time travel is fully supported in Dremio Cloud and Dremio Enterprise.

### Ingest External Data
You can pull data from REST APIs and ingest it directly into Dremio:

```python
client.ingest_api(
    url="https://jsonplaceholder.typicode.com/posts",
    table_name="sandbox.api_posts",
    mode="merge"
)
```

You can also insert Pandas DataFrames into Dremio tables using:

```python
client.table("sandbox.my_table").insert("sandbox.my_table", data=pd_df)
```

### Analyze, Visualize, and Export

Use `.group_by()` with aggregates like `.sum()`, `.count()`, `.mean()`.

Sort with `.order_by()`, paginate with `.offset()`, and chart using `.chart()`.

```python
df.chart(kind="bar", x="state", y="pop")
```

Export results to local files:

```python
df.to_csv("output.csv")
df.to_parquet("output.parquet")
```

### Data Quality Checks
Built-in expectations let you validate your data:

```python
df.quality.expect_not_null("pop")
df.quality.expect_column_values_to_be_between("pop", min=1, max=1000000)
```

### Admin and Debug Tools
- Create and manage reflections (Dremio's Unique Acceleration Layer).

- Retrieve and inspect job profiles with `.get_job_profile()`.

- Use `.explain()` to debug SQL plans:

```python
df.explain()
```

### Asynchronous Queries & CLI Access
- Use AsyncDremioClient for non-blocking workflows.

- Run queries via the command-line tool dremio-cli.

**Pro tip**: Want to test features like data ingestion, Iceberg catalog browsing, and AI-powered analytics? [Dremio Cloud’s 30-day trial](https://drmevn.fyi/am-get-started) gives you full access. For local development, [Community Edition](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/) is a great way to experiment.

`dremioframe` is still evolving, but it's already a powerful toolkit for Pythonic analytics on top of Dremio’s lakehouse engine. Whether you're running federated queries, ingesting external APIs, or interacting with Iceberg tables, it helps you stay in the Python world while leveraging all the power of Dremio under the hood.

## Conclusion

Whether you're an analyst who loves the clarity of chained DataFrame operations, or a Python developer looking to integrate Dremio into your data pipelines, `dremioframe` offers a compelling, flexible, and powerful interface to Dremio's lakehouse capabilities.

With just a few lines of code, you can:

- Connect securely to Dremio Cloud or Community Edition
- Run raw SQL or chain DataFrame-style queries
- Add computed columns with `.mutate()` or build expressions with the `F` API
- Work with federated sources, Apache Iceberg tables, and even ingest external data

By using `dremioframe`, you get the best of both worlds: the expressiveness of Python and the performance of Dremio’s SQL engine.

> Don’t forget — you can [sign up for a free 30-day trial of Dremio Cloud](https://drmevn.fyi/am-get-started) to experience all the advanced features like Agentic AI and native support for all Iceberg catalogs.  
> Or, if you're experimenting locally, [try Community Edition](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/) to run federated queries and interact with Glue or Nessie-based Iceberg tables.

The `dremioframe` project is still evolving, but it’s already a powerful toolkit for building readable, maintainable, and scalable data workflows in Python. Give it a try and let us know what you build.

## NOTE

`dremioframe` is an unofficial library and currently in Alpha. Please submit any issues or pull requests to the [git repo](https://github.com/developer-advocacy-dremio/dremio-cloud-dremioframe?tab=readme-ov-file).
