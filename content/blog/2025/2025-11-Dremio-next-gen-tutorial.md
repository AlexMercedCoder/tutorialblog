---
title: Comprehensive Hands-on Walk Through of Dremio Cloud Next Gen (Hands-on with Free Trial)
date: "2025-11-12"
description: "Walkthrough with the new trial of the Dremio Cloud Platform"
author: "Alex Merced"
category: "Data Engineering"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - Data Lakehouse
  - Data Engineering
  - Apache Iceberg
  - Apache Polaris
  - Dremio
---

On November 13, at the [Subsurface Lakehouse Conference](https://www.dremio.com/subsurface?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=pag&utm_term=nextgencloudtut&utm_content=alexmerced) in New York City, Dremio announced and released [Dremio Next Gen Cloud](https://www.dremio.com/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=pag&utm_term=nextgencloudtut&utm_content=alexmerced), the most complete and accessible version of its Lakehouse Platform to date. This release advances Dremio’s mission to make data lakehouses easy, fast, and affordable for organizations of any size.

This tutorial offers a hands-on introduction to Dremio and walks through the new free trial experience. With managed storage and no need to connect your own infrastructure or enter a credit card (until you want to), you can explore the full platform, including new AI features, Autonomous Performance Management, and the integrated lakehouse catalog, right away.

## What is Dremio?

Dremio is a Data Lakehouse Platform for the AI Era, let's explore what this means.

**What is a Data Lakehouse?**

A data lakehouse is an architecture that uses your data lake (object storage or Hadoop) as the primary data store for flexibility and openness, then adds two layers to operationalize it like a data warehouse:

- A table format such as Apache Iceberg, Delta Lake, Apache Hudi, or Apache Paimon. These formats allow structured datasets stored in Apache Parquet files to be treated as individual tables with ACID guarantees, snapshot isolation, time travel, and more—rather than just a collection of files without these capabilities.

- A lakehouse catalog that tracks your lakehouse tables and other assets. It serves as the central access point for data discovery and access control.

Dremio is designed to unify these modular lakehouse components into a seamless experience. Unlike platforms that treat Iceberg as an add-on to proprietary formats, Dremio is built to be natively Iceberg-first—delivering a warehouse-like experience without vendor lock-in.

**The Challenges of the Data Lakehouse**

While lakehouses offer the benefit of serving as a central source of truth across tools, they come with practical challenges during implementation.

- How do you make your lakehouse work alongside other data that isn’t yet in the lakehouse?

- How do you optimize storage as data files accumulate and become inefficient after multiple updates and snapshots?

- Which catalog should you use, and how do you deploy and maintain it for secure, governed access?

**How Dremio’s Platform Supports the Lakehouse**

Dremio simplifies many of these challenges with a platform that makes your lakehouse feel like it “just works.” It does this through several powerful features:

- **Query Federation**: Dremio is one of the fastest engines for Apache Iceberg queries, but it also connects to and queries other databases, data lakes, data warehouses, and catalogs efficiently. This means you can start using Dremio with your existing data infrastructure and transition to a full lakehouse setup over time.

- **Integrated Catalog**: Dremio includes a built-in Iceberg catalog, ready to use from day one. This catalog:

    - Is based on Apache Polaris, the community-led standard for lakehouse catalogs  
    - Automatically optimizes Iceberg table storage, eliminating manual tuning  
    - Provides governance for both Iceberg tables and SQL views with role-based and fine-grained access controls  

- **End-to-End Performance Management**: Managing query performance can be time-consuming. Dremio reduces this burden by automatically clustering Iceberg tables and applying multiple layers of caching. One key feature is Autonomous Reflections, which accelerate queries behind the scenes based on actual usage patterns—improving performance before users even notice a problem.

- **Semantic and Context Layer**: Dremio includes a built-in semantic layer where you can define business concepts using SQL views, track lineage, and write documentation. This structure not only supports consistent usage across teams but also provides valuable context to AI systems for more accurate analysis.

- **AI-Native Features**: Dremio Next Gen Cloud includes a built-in AI agent that can run queries, generate documentation, and create visualizations. For external AI systems, the MCP server gives agents access to both data and semantics. New AI functions also let you work with unstructured data for expanded analytical possibilities.

Dremio aims to provide a familiar and easy SQL interface to all your data.

## Registering For Dremio Trial

To get started with your Dremio Trial, head over to the [Getting Started Page](https://www.dremio.com/get-started/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=pag&utm_term=nextgencloudtut&utm_content=alexmerced) and create a new account with your preferred method.

![Getting Started Page with Dremio](https://i.imgur.com/ut2jBNf.png)

If using Google/Microsoft/Github you'll be all right up after authenticating, if signing up with your email you'll get an email to confirm your registration.

![Confirmation Email](https://i.imgur.com/fnzehGU.png)

When you create a new Dremio account, it automatically creates a new `Organization`, which can contain multiple `Projects`. The organization will be assigned a default name, which you can change later.

On the next screen, you’ll name your first project. This initial project will use Dremio’s managed storage as the default storage for the lakehouse catalog.

If you prefer to use your own data lake as catalog storage, you can create a new project when you're ready. Currently, only Amazon S3 is supported for custom catalog storage, with additional options coming soon.

Even though S3 is the only supported option for Dremio Catalog storage at the moment, Dremio still allows you to connect to other Iceberg catalogs backed by any cloud storage solution and data lakes using its wide range of source connectors.

![Choosing your Dremio Region and Project Name](https://i.imgur.com/fnzehGU.png)

Now you'll be on your Dremio Dashboard where you'll wait a few minutes for your organization to be provisioned.

![Provisioning of Dremio Project](https://i.imgur.com/JlPAxrI.png)

Once the environment is provisioned you'll see several options including a chat box to work with the new integrated Dremio AI Agent which we will revisit later in this tutorial.

![The Dremio environment is now active!](https://i.imgur.com/lO0aeGl.png)

One of the best ways to get started is by adding data to Dremio by clicking `add data` which will open a window where you can either:

- Connect an existing Database, Data Lake, Data Warehouse or Data Lakehouse catalog to begin querying data you have in other platforms

- Upload a CSV, JSON or PARQUET file which will convert the file into an Iceberg table in Dremio Catalog for you to be able to query.

If looking for some sample files to upload, [Kaggle](https://www.kaggle.com/) is always a good place to find some datasets to play with.

Although for this tutorial let's use SQL to create tables in Dremio Catalog, insert records into those tables and then query them.

## Curating Your Lakehouse

Let's go visit the data explorer to show you how you will navigate your integrated catalog and other datasources. Click on the second icon from the top in the menu that is to the left of the screen that looks like a table, this will take you to the dataset explorer.

![Dremio's Navigation Menu](https://i.imgur.com/iBnA0TP.png)

In the dataset explorer you'll see two sections:

- **Namespaces**: This is the native Apache Polaris based catalog that belongs to your project. You create namespaces as top-level folders to organize your Apache Iceberg Tables and SQL Views (view SQL can refer to Iceberg and Non-Iceberg datasets, like joining an Iceberg table and a Snowflake Table).

- **Sources**: These are the other sources you've connected to Dremio using Dremio's connectors. You can open up a source and see all the tables available inside of it from the dataset explorer.

Please click on the plus sign next to "namespaces" and add a new namespace called "dremio" this will be necessary to run some SQL scripts I give you without needing to modify them.

![Adding a new namespace](https://i.imgur.com/OSoBEP0.png)

Now you'll see the new `dremio` namespace and in their we can create new tables and views. You may notice there is already a sample data namespace which includes a variety of sample data you can use to experiment with if you want.

![The new namespace has been added to Dremio](https://i.imgur.com/3PfTjp1.png)

## Running Some SQL

Now head over to the the "SQL Runner" a full SQL IDE built right into the Dremio experience which includes autocomplete, syntax highlighting, function lookup, the typical IDE shortcuts and much more. It is accessed by clicking the third menu icon which looks like a mini terminal window.

![The Dremio SQL Runner](https://i.imgur.com/lKIFs6c.png)

Let me call out a few things to your attention:

- On the left you'll notice a column where you can browse available datasets you can use this drag dataset names or column names into your queries so you don't have to type things out everytime.

- You'll notice this column has a second tab called scripts, you can save the SQL in any tab as a script you can comeback to later, great for template scripts or scripts you haven't finished yet.

- The SQL editor is on top and the results viewer is on the bottom, if you run multiple SQL statements the results viewer will give you a tab for the result of each query run making it easy to isolate the results of different parts of your script.

There is a lot more to learn about the SQL runner, but let's go ahead and run some SQL. I've written several SQL scripts you can copy into the SQL Runner and run as is. Choose any of the below and copy them into SQL runner and run the SQL. Give the code a look over, comments in the code help explain what it is doing.

- [Finance Example](https://github.com/developer-advocacy-dremio/apache-iceberg-lakehouse-workshop/blob/main/industry-examples/finance_example.sql)
- [Government Example](https://github.com/developer-advocacy-dremio/apache-iceberg-lakehouse-workshop/blob/main/industry-examples/gov_example.sql)
- [Healthcare Example](https://github.com/developer-advocacy-dremio/apache-iceberg-lakehouse-workshop/blob/main/industry-examples/healthcare_example.sql)
- [Government Example](https://github.com/developer-advocacy-dremio/apache-iceberg-lakehouse-workshop/blob/main/industry-examples/insurance_example.sql)
- [Manufacturing Example with Data Health Checks](https://github.com/developer-advocacy-dremio/apache-iceberg-lakehouse-workshop/blob/main/industry-examples/manufacturing.sql)
- [Retail Example with Physical Transformations](https://github.com/developer-advocacy-dremio/apache-iceberg-lakehouse-workshop/blob/main/industry-examples/retail.sql)
- [Supply Chain Example](https://github.com/developer-advocacy-dremio/apache-iceberg-lakehouse-workshop/blob/main/industry-examples/supply_chain_example.sql)

The SQL for the majority of these examples follow a similar pattern:

- Create sub folder for the example
- Create a bronze/silver/gold subfolder in that subfolder
- Create and insert data in the base tables in the raw folder
- Join and model using a SQL view to create the silver layer
- Create a use case specific views from the silver view in the gold layer

This represents a very typical way of using Dremio where you model your datasets not by replicating your data but logically with SQL views. Dremio's autonomous reflections feature will see how these views are queried and dynamically determine what views should be materialized into the Dremio's reflection cache without anyone having to lift a finger keeping everything performance on storage and compute usage. A data engineer could also manually trigger the creation of a reflection and Dremio will assign that reflection a score to help understand whether the reflection is providing value or not, we'll show this when we got over Dremio's settings UI.

Two of the examples do something a little different:

- The Manufacturing example uses SQL views to create a medallion architecture, but it then also creates health check views which allow you to get a quick glance at the health of a dataset by aggregating nulls, duplicates, etc.

- The retail example shows you what it may look like if you don't want to model your data logically but physically using CTAS (Create Table As) statements to materialize the data as physical tables through the bronze/silver/gold layers.

## AI Visualizations

Now that you've added some data to your lakehouse but running some of my example scripts, let's show you some of the benefits of Dremio's new integrated AI Agent.

While if you are planning to build long lived BI dashboards you should still leverage integrations most BI tools like Tableau and Power BI have with Dremio, but if you need to just seem something visual quick or just need something to screenshot into a presentation the AI Agent can be quite helpful. 

So let's say I run the supply chain example, I could prompt the AI Agent with a prompt like:

`Can you create a bar chart based on the data in the gold layer of my supply chain data`

The AI Agent will pull the list of tables your particular user has access to and see if it finds the dataset I loosely referred to. It will then pull the schema and other data from the semantic layer to better understand the dataset before deciding how to best visualize it. But of course my prompt was vague and the AI agent decides to confirm some details with me:

```
I can create that bar chart — quick clarifying questions before I run the query
I inspected your gold layer and found the view dremio.supply_chain.gold.daily_supplier_delivery_kpis with these columns:

supplier_id (string)
receipt_date (date)
lines_received (int)
otif_rate (double)
on_time_rate (double)
in_full_rate (double)
total_received_qty (int)
total_order_qty (int)
gross_fill_rate (decimal)
To produce the bar chart I need to know which metric and timeframe you want visualized. Common options:

Average OTIF per supplier (bar per supplier showing average “otif_rate” across the dataset)
Average gross fill rate per supplier (bar per supplier showing average “gross_fill_rate”)
Total lines received per supplier for a specific date or date range (sum of “lines_received”)
Side-by-side bars per supplier showing two metrics (e.g., OTIF and gross_fill_rate) — I can produce grouped bars if you confirm.
Suggested defaults (if you don’t specify):

Metric: avg(otif_rate)
Timeframe: all available dates
Chart: vertical bar, supplier on x-axis, metric on y-axis, ordered by metric desc
If that works, I will run this SQL against the gold view and build the bar chart:

SELECT “supplier_id”, AVG(“otif_rate”) AS “avg_otif_rate”, AVG(“gross_fill_rate”) AS “avg_gross_fill_rate” FROM “first-project”.“dremio”.“supply_chain”.“gold”.“daily_supplier_delivery_kpis” — optionally add: WHERE “receipt_date” BETWEEN DATE ‘2025-08-01’ AND DATE ‘2025-08-31’ GROUP BY “supplier_id” ORDER BY “avg_otif_rate” DESC

Please confirm:

Which metric? (otif_rate, gross_fill_rate, lines_received, total_received_qty, etc.)
Timeframe (all data, a date, or a date range). If you say a month/week/day, I will assume the current year unless you specify otherwise.
Chart type (single bar, grouped bars for two metrics).
After you confirm I will run the query and produce the bar chart for you.
```

I respond with 

```
1. Average OTIF per supplier
2. All data
3. Vertical Bar
```

It then explains to the me it's thought process to illustrate where it needs more detail, I notice at this point it is including the project name `first-project` in the table name which is not necessary as this is assumed so it should start with the namespace `dremio`. I tell it this and get back my visualization.

![Generating a Visualization with the Dremio AI Agent](https://i.imgur.com/KeHWL8h.png)

We found success starting with quite a vague question but working with the AI we were able to get a visualization of a useful metric within a few minutes.

## AI Function

Using your data to create visualization isn't the only cool AI integration in the Dremio Arsenal. Dremio also has added a variety of new SQL AI Functions which allow you to do a variety of things like turn unstructured data into structured data. Let's see a very simple example you can run right in your SQL runner assuming you have a `dremio` namespace.

```sql
-- Create the recipes table with an ARRAY column for ingredients (sample rows)
-- Note: this uses CREATE TABLE AS SELECT to create a physical table with sample data.
CREATE FOLDER IF NOT EXISTS dremio.recipes;
CREATE TABLE IF NOT EXISTS dremio.recipes.recipes AS
SELECT 1 AS "id",
       'Mild Salsa' AS "name",
       ARRAY['tomato','onion','cilantro','jalapeno','lime'] AS "ingredients",
       CURRENT_TIMESTAMP AS "created_at"
UNION ALL
SELECT 2, 'Medium Chili', ARRAY['beef','tomato','onion','chili powder','cumin','jalapeno'], CURRENT_TIMESTAMP
UNION ALL
SELECT 3, 'Spicy Vindaloo', ARRAY['chicken','chili','ginger','garlic','vinegar','habanero'], CURRENT_TIMESTAMP;

-- Create View where AI is used to classify each recipe as Mild, Medium or Spicy
CREATE OR REPLACE VIEW dremio.recipes.recipes_enhanced AS SELECT id,
       name,
       ingredients,
       AI_CLASSIFY('Identify the Spice Level:' || ARRAY_TO_STRING(ingredients, ','), ARRAY [ 'mild', 'medium', 'spicy' ]) AS spice_level
from   dremio.recipes.recipes;
```

- The First SQL statement creates a table of recipes where the ingredients are an array of strings

- The Second SQL statement create a view where we use the AI_CLASSIFY function to prompt the AI given the ingredients whether the recipe is `mild`, `medium` or `spicy`. 

![The Dremio AI Functions](https://i.imgur.com/PiJGMmF.png)

With these AI functions you can also use it pull data from JSON files or folders of images to generate structured datasets. Imagine taking a folder of scans of paper applications and turning them into an iceberg table with all the right fields by having the AI scan these images, this is kind of use case made possible by these functions.

## Dremio Jobs Pane

Want to see what queries are coming or investigate deeper why a query may have failed or taken longer than expecting, the Dremio job pane which is the next option on the left menu will allow you see all your jobs and then click on them to see exaustive detail on how they were processed.

![Dremio Job Pane](https://i.imgur.com/EhD18PE.png)

## Dremio Settings

If you click on the last menu item, the gear, you'll get two options:

- Project Settings
- Org Settings

### Project Settings

![Dremio Project Settings](https://i.imgur.com/YCfoaMz.png)

- You can find project info like:
  - project name and id (project names are fixed, org names can change)
  - MCP server url to connect your external AI agent to leverage your Dremio instance
  - JDBC url to connect to Dremio using external JDBC clients and in custom scripts

**NOTE:** SQL can be sent to Dremio for execution outside of Dremio's UI using JDBC, ODBC, Apache Arrow Flight and Dremio's REST API. Refer to docs.dremio.com for documentation on how to leverage these interfaces.

Also in project settings you'll find sections like:

- Catalog: To update catalog settings like how often metadata refresh should happen. (**Note:** Lineage view is based on the metadata as of the last refresh so if something isn't reflected in lineage the metadata may not have refreshed yet. You can either make the metadata refresh more frequently or wait till it refreshes on its current schedule.)

- Engines: For managing your different Dremio execution engines, what is their size, when they should spin up and when they should spin down

- BI Tools: Enable or disable Tableu and Power BI buttons

- Monitor: Dashboard to monitor Dremio project health

- Reflections: See scores on reflections you have created, you can also delete reflections if you no longer need them from here

- Engine Routing: Create rules for which jobs should go to which engines, for example jobs from certain users may be routed to their own engine which is tracked for charge backs.

- Preferences: Turn on and off certain Dremio features

### Organization Settings

Under Organizations settings you'll find:

- name of org, which can be changed
- Manage authentication protocols
- Manage projects, users, and roles

### User Settings

At the very bottom left corner there is a button to see settings for the individual user. The Main use for this is to change to dark/light more and to create PAT tokens for authenticating external clients.

## Granting Access

Once you create new non-admin users in your Dremio org, they'll have zero access to anything so you'll need to give them precise access to particular projects, namespaces, folders, sources etc.

While you can do this for an individual user, it will likely be easier to create "roles" you can grant access to groups of users with. Below is the example of the kind of SQL you may use to grant access to a single namespace for a new user.

```
-- Give Permissions to project
GRANT SELECT, VIEW REFLECTION, VIEW JOB HISTORY, USAGE, MONITOR,
       CREATE TABLE, INSERT, UPDATE, DELETE, DROP, ALTER, EXTERNAL QUERY, ALTER REFLECTION, OPERATE
ON PROJECT
TO USER "alphatest2user@alexmerced.com";

-- Give Permissions to Namespace in Catalog
GRANT ALTER, USAGE, SELECT, WRITE, DROP on FOLDER "dremio" to USER "alphatest2user@alexmerced.com";

-- Give Permissions to a Folder in the namespace
GRANT ALTER, USAGE, SELECT, WRITE, DROP on FOLDER dremio.recipes to USER "alphatest2user@alexmerced.com";
```

## Connecting your Dremio Catalog to Other Engines Like Spark

Now you can connect to the Dremio Platform using JDBC/ODBC/ADBC-Flight/REST and send SQL to Dremio for Dremio to execute which I hope you take full advantage of. Although, sometimes you are sharing a dataset in your catalog with someone else who wants to use their preferred compute tool. Dremio Catalog bein  Apache Polaris based supports the Apache Iceberg REST Catalog SPEC meaning it can connect to pretty much to any Apache Iceberg supporting tool. Below is an example of how you'd connect in Spark.

```python
import os
import pyspark
from pyspark.sql import SparkSession
from pyspark.sql import Row

# Fetch Dremio base URL and PAT from environment variables
DREMIO_CATALOG_URI = os.environ.get('DREMIO_CATALOG_URI')
DREMIO_AUTH_URI = os.environ.get('DREMIO_AUTH_URI')
DREMIO_PAT = os.environ.get('DREMIO_PAT')

if not DREMIO_CATALOG_URI or not DREMIO_AUTH_URI or not DREMIO_PAT:
    raise ValueError("Please set environment variables DREMIO_CATALOG_URI, DREMIO_AUTH_URI and DREMIO_PAT.")

# Configure Spark session with Iceberg and Dremio catalog settings
conf = (
    pyspark.SparkConf()
        .setAppName('DremioIcebergSparkApp')
        # Required external packages For FILEIO (org.apache.iceberg:iceberg-azure-bundle:1.9.2, org.apache.iceberg:iceberg-aws-bundle:1.9.2, org.apache.iceberg:iceberg-azure-bundle:1.9.2, org.apache.iceberg:iceberg-gcp-bundle:1.9.2)
        .set('spark.jars.packages', 'org.apache.iceberg:iceberg-spark-runtime-3.5_2.12:1.9.2,com.dremio.iceberg.authmgr:authmgr-oauth2-runtime:0.0.5')
        # Enable Iceberg Spark extensions
        .set('spark.sql.extensions', 'org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions')
        # Define Dremio catalog configuration using RESTCatalog
        .set('spark.sql.catalog.dremio', 'org.apache.iceberg.spark.SparkCatalog')
        .set('spark.sql.catalog.dremio.catalog-impl', 'org.apache.iceberg.rest.RESTCatalog')
        .set('spark.sql.catalog.dremio.uri', DREMIO_CATALOG_URI)
        .set('spark.sql.catalog.dremio.warehouse', 'default')  # Not used but required by Spark
        .set('spark.sql.catalog.dremio.cache-enabled', 'false')
        .set('spark.sql.catalog.dremio.header.X-Iceberg-Access-Delegation', 'vended-credentials')
        # Configure OAuth2 authentication using PAT
        .set('spark.sql.catalog.dremio.rest.auth.type', 'com.dremio.iceberg.authmgr.oauth2.OAuth2Manager')
        .set('spark.sql.catalog.dremio.rest.auth.oauth2.token-endpoint', DREMIO_AUTH_URI)
        .set('spark.sql.catalog.dremio.rest.auth.oauth2.grant-type', 'token_exchange')
        .set('spark.sql.catalog.dremio.rest.auth.oauth2.client-id', 'dremio')
        .set('spark.sql.catalog.dremio.rest.auth.oauth2.scope', 'dremio.all')
        .set('spark.sql.catalog.dremio.rest.auth.oauth2.token-exchange.subject-token', DREMIO_PAT)
        .set('spark.sql.catalog.dremio.rest.auth.oauth2.token-exchange.subject-token-type', 'urn:ietf:params:oauth:token-type:dremio:personal-access-token')
)

# Initialize Spark session
spark = SparkSession.builder.config(conf=conf).getOrCreate()
print("✅ Spark session connected to Dremio Catalog.")

# Step 1: Create a namespace (schema) in the Dremio catalog
spark.sql("CREATE NAMESPACE IF NOT EXISTS dremio.db")
# spark.sql("CREATE NAMESPACE IF NOT EXISTS dremio.db.test1")
print("✅ Namespaces Created")

# Step 2: Create sample Iceberg tables in the Dremio catalog
spark.sql("""
CREATE TABLE IF NOT EXISTS dremio.db.customers (
    id INT,
    name STRING,
    email STRING
)
USING iceberg
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS dremio.db.orders (
    order_id INT,
    customer_id INT,
    amount DOUBLE
)
USING iceberg
""")

print("✅ Tables Created")

# Step 3: Insert sample data into the tables
customers_data = [
    Row(id=1, name="Alice", email="alice@example.com"),
    Row(id=2, name="Bob", email="bob@example.com")
]

orders_data = [
    Row(order_id=101, customer_id=1, amount=250.50),
    Row(order_id=102, customer_id=2, amount=99.99)
]

print("✅ Dataframes Generated")

customers_df = spark.createDataFrame(customers_data)
orders_df = spark.createDataFrame(orders_data)

customers_df.writeTo("dremio.db.customers").append()
orders_df.writeTo("dremio.db.orders").append()

print("✅ Tables created and sample data inserted.")
```

## Conclusion

Dremio Next Gen Cloud represents a major leap forward in making the data lakehouse experience seamless, powerful, and accessible. Whether you're just beginning your lakehouse journey or modernizing a complex data environment, Dremio gives you the tools to work faster and smarter—with native Apache Iceberg support, AI-powered features, and a fully integrated catalog.

From federated queries across diverse sources to autonomous performance tuning, Dremio abstracts away the operational headaches so you can focus on delivering insights. And with built-in AI capabilities, you're not just managing data—you’re unlocking its full potential.

If you haven’t already, [sign up for your free trial](https://www.dremio.com/get-started/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=pag&utm_term=nextgencloudtut&utm_content=alexmerced) and start building your lakehouse—no infrastructure or credit card required.

The next generation of analytics is here. Time to explore what’s possible.
