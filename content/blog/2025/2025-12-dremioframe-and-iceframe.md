---
title: dremioframe & iceberg - Pythonic interfaces for Dremio and Apache Iceberg
date: "2025-12-05"
description: "Discover DremioFrame and IceFrame, two new Python libraries that simplify working with Dremio and Apache Iceberg. Learn how these tools streamline data management and enhance productivity for modern data teams."
author: "Alex Merced"
category: "Data Engineering"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - Dremio
  - Data Engineering
  - Python
---

Modern data teams want simple tools to work with Iceberg tables and Dremio. Two new Python libraries now make that work easier. The first is DremioFrame. It gives you a clear set of functions for managing your Dremio Cloud or Dremio Software project through code. The second is IceFrame. It gives you a direct way to create and maintain Iceberg tables using PyIceberg and Polars with native extensions. Both libraries are in alpha. This is the best time to try them, share your ideas, and report issues.

You can test them with a free 30-day Dremio Cloud trial that includes $400 in credits. Sign up [here to get started](https://drmevn.fyi/am-get-started) . The trial includes a built-in Apache Polaris-based Iceberg catalog (on the ui you'll see a namespaces section, that's the catalog), so you can create tables and explore them from both libraries. This lets you know how the tools fit into real workflows with no setup.

The goal of both libraries is simple. They remove friction. They give you short, readable code. They help you move from idea to result with less effort. They both have built-in AI Agents for assisting you generate code using the library and more. Early feedback from real users will shape their future. Your tests and your questions will guide the next steps. This article introduces the two projects and shows how they work together.

![dremioframe and iceframe](https://i.imgur.com/Sj9EKFC.png)

## Why These Libraries Exist

Python is the language many teams use for data work. People write scripts, build pipelines, and test ideas in notebooks. Yet working with Iceberg tables or the Dremio REST API often means long code and many repeated steps. These two libraries remove that weight.

DremioFrame gives you a direct way to manage your Dremio catalog, users, views, and jobs. You write clear code that creates folders, defines views, and handles security rules. You no longer need to build each API request by hand.

IceFrame gives you a focused set of tools for Iceberg tables. You can compact files, evolve partitions, and run maintenance tasks with short commands.

Both libraries aim to shorten the path from idea to action. They help you test new patterns, share scripts with your team, and work with Iceberg and Dremio in a direct way.

![How dremioframe and iceframe work](https://i.imgur.com/NgAbTNY.png)

## Meet DremioFrame

DremioFrame is a Python client for Dremio Cloud and Dremio Software. It wraps the REST API in a clean set of methods. You can manage sources, folders, views, tags, and security rules with short commands. You can also run SQL and work with query results as DataFrames.

The library gives you a clear structure. You access the catalog through `client.catalog`. You manage users and roles through `client.admin`. You can also manage reflections that speed up queries. Each action is a direct Python call that maps to a known Dremio feature.

The design is simple. You write code that creates a source, builds a view, assigns a policy, or deletes an item. You do not handle request URLs or version tags yourself. This helps teams move faster and keep their scripts readable.

DremioFrame fits well in automation. You can create large batches of folders or datasets through parallel calls. You can also use it in small scripts that update a single view. The goal is to make Dremio easier to use in everyday work.

![dremioframe leverages the Dremio Engine](https://i.imgur.com/1G2hEi2.png)

## Meet IceFrame

IceFrame is a Python library that gives you direct control over Iceberg tables. It focuses on clear commands that help you maintain data and keep tables fast. You can compact small files, sort data, evolve partitions, and clear old snapshots. Each task uses a short call that reflects the action you want to take.

The library also supports Iceberg views when the catalog allows it. You can define a view with a simple SQL string and replace it when your logic changes. You can also call stored procedures that handle cleanup and maintenance. This includes rewriting files, removing orphan files, and keeping only recent snapshots.

IceFrame includes an AI assistant for table exploration. You can ask questions in plain language. The tool can show schemas, write example code, and suggest filters or joins. This helps new users learn how the data is shaped and how to work with it.

The goal is steady control with minimal code. You keep your tables healthy and easy to query. You also gain tools to understand your data without long setup or manual checks.

![iceframe](https://i.imgur.com/E9p232c.png)

## Why Dremio Cloud Is the Best Place to Try Them

Dremio Cloud gives you a smooth way to test both libraries. The trial includes a built-in Iceberg catalog with hosted storage (you can use your own storage with a non-trial account), so you can create tables right away. You do not need to run a separate service or set up extra storage. You write code, create a table, and see it in the Dremio catalog within seconds.

The free 30-day trial includes $400 in credits. You can sign up at [the get started page](https://drmevn.fyi/am-get-started). This gives you enough room to explore IceFrame operations, build views with DremioFrame, and test how the two tools work together.

The setup is light. You create a personal access token, connect through Python, and begin writing code. You can also switch between the console and your scripts to see changes in real time. This makes the trial a strong place for experiments, quick tests, and early feedback.

![Dremioframe in action](https://i.imgur.com/ipzlvnA.png)

![Iceframe in Action](https://i.imgur.com/1XHwCGQ.png)

## Using Both Libraries Together

You can use IceFrame and DremioFrame in the same workflow. IceFrame lets you create and shape Iceberg tables locally. DremioFrame lets you see those tables in the catalog, build views on top of them alongside other databases/lakes/warehouses, and apply rules for access or masking. This gives you one flow from data creation to data use.

A simple pattern looks like this. You can write to and manage lightweight Iceberg tables using iceframe for local processing, and use dremioframe to work with Dremio for extensive data processing and query federation with databases/lakes/warehouses, and to curate a semantic and governance layer on top of your data.

You do not move between many tools. You do not manage long request bodies. You write small blocks of code that express the action you need. This helps teams test new ideas and keep their work easy to read and share.

![Using dremioframe and iceframe together](https://i.imgur.com/BBJMzRh.png)

## How to Get Started

- [Dremioframe Repo](https://github.com/developer-advocacy-dremio/dremio-cloud-dremioframe)
- [Dremioframe on Pypi](https://pypi.org/project/dremioframe/)
- [Iceframe Repo](https://github.com/AlexMercedCoder/iceframe)
- [Iceframe on Pypi](https://pypi.org/project/iceframe/)

You can install both libraries with a single step. Run `pip install dremioframe` and `pip install iceframe`. You can then import them in any script or notebook. This gives you direct access to the Dremio catalog and your Iceberg tables.

You do not need to clone the repos to use the tools. Cloning is only needed if you want to read the source code or contribute changes. Most users will install the packages from PyPI and begin writing code right away.

After installation, you create a personal access token in Dremio Cloud. You pass that token to DremioFrame when you create the client. You also point IceFrame at your Iceberg catalog. Once this is done, you can create tables, define views, and run cleanup tasks with short commands.

## Side-by-Side Examples

The two libraries serve different roles, but they work well together. The examples below show how to connect, run a simple query, and create a table in each library. The code stays short in both cases.

### Connect

**DremioFrame**
```python
from dremioframe.client import DremioClient

client = DremioClient(
    token="YOUR_DREMIO_CLOUD_PAT",
    project_id="YOUR_PROJECT_ID"
)
```

**IceFrame**

```python
from iceframe import IceFrame

ice = IceFrame(
    {
        "uri": "https://catalog.dremio.cloud/api/iceberg/v1",
        "token": "YOUR_DREMIO_CLOUD_PAT",
        "project_id": "YOUR_PROJECT_ID"
    }
)
```

### Run a Query
**DremioFrame**

```python
df = client.sql.run("SELECT 1 AS value")
print(df)
```

**IceFrame**

```python
result = ice.query("some_table").limit(10).execute()
print(result)
```

### Create a Table
**DremioFrame**
You create a view or dataset through the catalog. Here is a simple view example.

```python
client.catalog.create_view(
    path=["Samples", "small_view"],
    sql="SELECT * FROM Samples.samples.Employees"
)
```

**IceFrame**
You create an Iceberg table by writing data.

```python
from datetime import datetime

data = [
    {"id": 1, "name": "Ada", "created_at": datetime.utcnow()},
    {"id": 2, "name": "Max", "created_at": datetime.utcnow()}
]

ice.create_table("my_table", data=data)
```

These examples show the contrast. DremioFrame works with the Dremio catalog. IceFrame works with Iceberg storage. When used together, they give you a complete path from data creation to query.

## Query Builder Examples

Both libraries include a query builder. Each builder keeps the code readable and avoids long SQL strings. The examples below show how each one works.

### DremioFrame Query Builder

DremioFrame can build SQL through a fluent API. You call `client.table(...)` to start. You then add filters, selects, joins, or limits. The builder compiles the final SQL when you run the query.

```python
# Start with a table in the Dremio catalog
df = (
    client.table("Samples.samples.Employees")
        .select("employee_id", "full_name", "department")
        .filter("department = 'Engineering'")
        .limit(5)
        .run()
)

print(df)
```

This pattern helps when you want to build queries from variables or reuse parts of the logic. The SQL stays clean, and the structure is easy to read.

### IceFrame Query Builder
IceFrame includes a builder for Iceberg tables. You call `ice.query("table_name")` to start. You can then filter rows, pick columns, join tables, or sort results. The builder runs the final plan with `execute()`. It will determine what parts of the query should be used for Iceberg predicate pushdown and what should be handled after scanning the data for better peformance.

```python
from iceframe.expressions import Column

result = (
    ice.query("my_table")
        .filter(Column("id") > 10)
        .select("id", "name")
        .sort("id")
        .limit(5)
        .execute()
)

print(result)
```

This pattern keeps the logic simple. You express intent with short steps. The code stays close to how you think about the data.

Both builders help you avoid long SQL strings. They also make it easier to share examples with your team and adapt them to new cases.

## Agents and Procedures

Both libraries include features that help you work faster with less manual code. Each tool offers an agent that can guide you through common tasks. IceFrame also includes direct access to Iceberg procedures that keep tables healthy.

### Agents

**DremioFrame Agent**  
DremioFrame includes an optional agent that can help you work with DremioFrame and Dremio. It can help you write queries, write DremioFrame scripts, and much more.

**IceFrame Agent**  
IceFrame includes a chat agent for Iceberg tables. You can ask about table schemas, filters, and joins. The agent can write Python code for common IceFrame tasks. It can also explain how to compact files or clean snapshots. This helps new users understand how each feature works. It also helps teams share patterns in a simple way.

### IceFrame Procedures

IceFrame gives you access to Iceberg maintenance procedures. These keep data clean and reduce the cost of reading tables. You call each procedure with a short command.

```python
# Rewrite data files
ice.call_procedure("my_table", "rewrite_data_files", target_file_size_mb=256)

# Remove old snapshots
ice.call_procedure("my_table", "expire_snapshots", older_than_ms=7 * 24 * 3600 * 1000)

# Remove orphan files
ice.call_procedure("my_table", "remove_orphan_files")

# Fast-forward a branch
ice.call_procedure("my_table", "fast_forward", to_branch="main")
```

These steps help you keep tables tidy. They reduce file counts, remove unused data, and keep history at a safe size. You can schedule them or run them by hand. Paired with the agent, you have a clear path from learning a task to running it.

The two libraries share a goal. They help you act faster and with less effort. The agents guide you. The procedures handle the work that keeps your tables stable.

![dremioframe and iceframe](https://i.imgur.com/F1xxpWP.png)
