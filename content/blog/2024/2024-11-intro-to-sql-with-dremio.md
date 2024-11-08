---
title: Intro to SQL using Apache Iceberg and Dremio
date: "2024-11-08"
description: "Intro to SQL using Apache Iceberg and Dremio"
author: "Alex Merced"
category: "sql"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - sql
  - apache iceberg
  - dremio
---

- [Blog: What is a Data Lakehouse and a Table Format?](https://www.dremio.com/blog/apache-iceberg-crash-course-what-is-a-data-lakehouse-and-a-table-format/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=introtosql&utm_content=alexmerced&utm_term=external_blog)
- [Free Copy of Apache Iceberg the Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=introtosql&utm_content=alexmerced&utm_term=external_blog)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=introtosql&utm_content=alexmerced&utm_term=external_blog)
- [Lakehouse Catalog Course](https://hello.dremio.com/webcast-an-in-depth-exploration-on-the-world-of-data-lakehouse-catalogs-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=introtosql&utm_content=alexmerced&utm_term=external_blog)
- [Iceberg Lakehouse Engineering Video Playlist](https://www.youtube.com/watch?v=SIriNcVIGJQ&list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe)

## Introduction

SQL (Structured Query Language) has long been the standard for interacting with data, providing a powerful and accessible language for data querying and manipulation. However, traditional data warehouses and databases often fall short when dealing with the scale and flexibility demanded by modern data workloads.

This is where Apache Iceberg and Dremio come in. Apache Iceberg is an open table format designed for large-scale data lakes, enabling reliable data management with features like ACID transactions, schema evolution, and time-travel. Iceberg brings structure and governance to data lakes, making them more capable of handling enterprise data needs. Dremio, on the other hand, is a data lakehouse platform that brings SQL querying capabilities to data lakes, providing a unified interface to query and analyze data across various sources.

By the end of this tutorial, you'll understand the basics of SQL in Dremio and how to perform essential data operations with Apache Iceberg tables.

## What is SQL, Apache Iceberg, and Dremio, and Why They Matter

### What is SQL?

SQL, or Structured Query Language, is a language specifically designed for managing and querying data in relational databases. Its versatility and power make it ideal for a wide range of data operations, including data extraction, aggregation, and transformation. SQL's widespread use in data analysis and reporting has made it a cornerstone in the world of data management.

### What is Apache Iceberg?

Apache Iceberg is an open-source table format that brings structure and governance to data lakes. Designed with scalability in mind, Iceberg offers features such as:

- **ACID Transactions**: Ensuring data consistency across large datasets.
- **Time-Travel**: Querying historical versions of data, which is essential for audits and analysis.
- **Schema Evolution**: Modifying table schemas without disrupting ongoing operations.
  Iceberg’s approach to data management provides a reliable foundation for large-scale analytics and data processing, making it a valuable component in any data lakehouse architecture.

### What is Dremio?

Dremio is a data lakehouse platform that unifies data access, enabling users to perform SQL queries across data lakes, warehouses, and other data sources through a single, user-friendly interface. Dremio simplifies data analytics by providing:

- **Unified Semantic Layer**: Organizes and documents datasets for easier discovery and analysis.
- **Support for Apache Iceberg**: Seamless integration with Iceberg tables, allowing users to query and manipulate large datasets with SQL.
- **Data Versioning and Governance**: Through integrations with Nessie, Dremio supports versioned, Git-like data management, making it ideal for maintaining data accuracy and history.

### Why They Matter Together

When combined, SQL, Apache Iceberg, and Dremio offer a powerful solution for data management and analysis. SQL provides the querying foundation, Apache Iceberg delivers the scalability and governance, and Dremio brings everything together in a streamlined, accessible environment. For businesses looking to harness the full potential of their data lakes, this stack delivers efficient querying, advanced data governance, and high performance.

Let's set up an environment to work with these tools and walk through practical examples of using SQL with Apache Iceberg tables in Dremio.

## Setting Up an Environment with Dremio, Nessie, and MinIO with Docker Compose

To start working with Apache Iceberg and Dremio, we'll set up a local environment using Docker Compose, a tool that allows us to configure and manage multiple containers with a single file. In this setup, we'll use:

- **Dremio** as the query engine for our data lakehouse.
- **Nessie** as the catalog for versioned data management.
- **MinIO** as S3-compatible storage to hold our data.

This environment will give us a powerful foundation to perform SQL operations on Apache Iceberg tables with Dremio.

### Prerequisites

- **Docker**: Ensure Docker is installed on your machine. You can download it from [Docker's official website](https://www.docker.com/).
- **Docker Compose**: Typically included with Docker Desktop on Windows and macOS; on Linux, it may require separate installation.

### Step 1: Create a Docker Compose File

1. Open a text editor of your choice (such as VS Code, Notepad, or Sublime Text).
2. Create a new file named `docker-compose.yml` in a new, empty folder. This file will define the services and configurations needed for our environment.

3. Copy and paste the following configuration into `docker-compose.yml`:

   ```yaml
   version: "3"

   services:
     # Nessie Catalog Server Using In-Memory Store
     nessie:
       image: projectnessie/nessie:latest
       container_name: nessie
       networks:
         - iceberg
       ports:
         - 19120:19120

     # MinIO Storage Server
     ## Creates two buckets named lakehouse and lake
     minio:
       image: minio/minio:latest
       container_name: minio
       environment:
         - MINIO_ROOT_USER=admin
         - MINIO_ROOT_PASSWORD=password
       networks:
         - iceberg
       ports:
         - 9001:9001
         - 9000:9000
       command: ["server", "/data", "--console-address", ":9001"]
       entrypoint: >
         /bin/sh -c "
         minio server /data --console-address ':9001' &
         sleep 5 &&
         mc alias set myminio http://localhost:9000 admin password &&
         mc mb myminio/lakehouse &&
         mc mb myminio/lake &&
         tail -f /dev/null
         "

     # Dremio
     dremio:
       platform: linux/x86_64
       image: dremio/dremio-oss:latest
       ports:
         - 9047:9047
         - 31010:31010
         - 32010:32010
       container_name: dremio
       environment:
         - DREMIO_JAVA_SERVER_EXTRA_OPTS=-Dpaths.dist=file:///opt/dremio/data/dist
       networks:
         - iceberg

   networks:
     iceberg:
   ```

   **Explanation of the Services**:

   - **Nessie**: Acts as the catalog for Iceberg tables, providing version control for data through branching and merging.
   - **MinIO**: Stores data in buckets, simulating an S3-compatible environment. We configure two buckets, `lakehouse` and `lake`, to separate structured Iceberg data from raw data.
   - **Dremio**: The engine for querying data stored in Iceberg tables on MinIO. Dremio will allow us to use SQL for managing and analyzing our data.

### Step 2: Start the Environment

With the `docker-compose.yml` file ready, follow these steps to launch the environment:

1. Open a terminal (Command Prompt, PowerShell, or terminal app) and navigate to the folder where you saved `docker-compose.yml`.
2. Run the following command to start all services in detached mode:

   ```bash
   docker-compose up -d
   ```

3. Wait a few moments for the services to initialize. You can check if the services are running by using:

   ```bash
   docker ps
   ```

   This command should list `nessie`, `minio`, and `dremio` as running containers.

### Step 3: Verify Each Service

After starting the containers, verify that each service is accessible:

- **Dremio**: Open a browser and go to `http://localhost:9047`. You should see the Dremio login screen.
- **MinIO**: In a new browser tab, go to `http://localhost:9001`. Log in with the username `admin` and password `password` to access the MinIO console.
- **Nessie**: Nessie doesn’t have a direct UI in this setup, but you can interact with it through Dremio, as we’ll cover in later sections.

### Step 4: Optional - Shutting Down the Environment

To stop the environment when you're done, run the following command in the same folder as your `docker-compose.yml` file:

```bash
docker-compose down -v
```

This command stops and removes all containers and associated volumes, allowing you to start fresh next time.

With our environment up and running, we’re ready to start using Dremio to create and manage Apache Iceberg tables. In the next section, we’ll explore how to connect Nessie to Dremio and begin querying our data.

## Accessing Dremio and Connecting Nessie

Now that our environment is up and running, let’s connect to Dremio, which will act as our query engine, and configure Nessie as a source catalog. This setup will allow us to take advantage of Apache Iceberg’s versioned data management and perform SQL operations in a streamlined, unified environment.

### Step 1: Accessing Dremio

1. **Open Dremio in Your Browser**:

   - Go to `http://localhost:9047` in your browser. You should see the Dremio login screen.
   - If this is your first time setting up Dremio, you may need to create an admin user. Follow the on-screen instructions to set up your login credentials.

2. **Familiarize Yourself with Dremio’s Interface**:
   - After logging in, explore Dremio’s main interface. Key areas include:
     - **SQL Runner**: Where you can run SQL queries.
     - **Datasets**: A section for browsing and managing tables, views, and sources.
     - **Jobs**: A log of executed queries and their performance metrics.
   - The SQL Runner will be our primary workspace for running queries and interacting with Apache Iceberg tables.

### Step 2: Connecting Nessie as a Catalog in Dremio

Nessie acts as the catalog for our Iceberg tables, enabling us to manage data with version control features such as branching and merging. Let’s add Nessie as a source in Dremio.

1. **Add a New Source**:

   - In Dremio, click on the **Add Source** button in the lower left corner of the interface.

2. **Configure the Nessie Source**:

   - Select **Nessie** from the list of source types.

3. **Enter Nessie Connection Settings**:

   - **General Settings**:
     - **Name**: Enter a name for the source, such as `lakehouse`.
     - **Endpoint URL**: Enter the endpoint for the Nessie API:
       ```
       http://nessie:19120/api/v2
       ```
     - **Authentication**: Choose **None** (since Nessie is running locally and does not require additional credentials in this setup).
   - **Storage Settings**:
     - **Access Key**: Enter `admin` (the MinIO username).
     - **Secret Key**: Enter `password` (the MinIO password).
     - **Root Path**: Enter `lakehouse` (this is the bucket where our Iceberg tables will be stored).
   - **Connection Properties**:
     - **fs.s3a.path.style.access**: Set this to `true`.
     - **fs.s3a.endpoint**: Set to `minio:9000`.
     - **dremio.s3.compat**: Set to `true`.
     - **Encrypt Connection**: Uncheck this option, as we’re running Nessie locally over HTTP.

4. **Save the Source**:
   - After filling out all the fields, click **Save**. Dremio will now connect to the Nessie catalog, and you’ll see `lakehouse` (or the name you assigned) listed in the **Datasets** section of Dremio’s interface.

### Step 3: Adding MinIO as an S3 Source in Dremio

In addition to Nessie, we can add MinIO as a general S3-compatible source in Dremio. This source allows us to access raw data files stored in the MinIO `lake` bucket, enabling direct SQL queries on various file types (e.g., JSON, CSV, Parquet) without the need to define tables.

1. **Add a New Source**:

   - Click the **Add Source** button in Dremio again, then select **S3** as the source type.

2. **Configure the MinIO Connection**:

   - **General Settings**:
     - **Name**: Enter a name like `lake`.
     - **Credentials**: Choose **AWS access key**.
     - **Access Key**: Enter `admin`.
     - **Secret Key**: Enter `password`.
     - **Encrypt Connection**: Uncheck this option, as we’re running locally.
   - **Advanced Options**:
     - **Enable Compatibility Mode**: Set this to `true` to ensure compatibility with MinIO.
     - **Root Path**: Set to `/lake` (the bucket name for general storage).
   - **Connection Properties**:
     - **fs.s3a.path.style.access**: Set this to `true`.
     - **fs.s3a.endpoint**: Set to `minio:9000`.

3. **Save the Source**:
   - After configuring these settings, click **Save**. Dremio will connect to MinIO, and the `lake` source will appear in the **Datasets** section.

### Verifying the Connections

With both sources connected, you should see `lakehouse` and `lake` listed under **Datasets** in Dremio. These sources provide access to structured, versioned data in the `lakehouse` bucket and general-purpose data in the `lake` bucket.

Let's explore how to use SQL within Dremio to create tables, insert data, and perform various data operations on our Iceberg tables.

## How to Create Tables with SQL

Now that our environment is configured and connected, let's dive into creating tables using SQL in Dremio. Apache Iceberg tables in Dremio allow us to take advantage of Iceberg’s powerful features, such as schema evolution and advanced partitioning.

### Creating Tables with `CREATE TABLE`

The `CREATE TABLE` command in Dremio allows us to define a new Iceberg table with specific columns, data types, and optional partitioning. Below, we’ll cover the syntax and provide examples for creating tables.

### Basic Syntax for `CREATE TABLE`

```sql
CREATE TABLE [IF NOT EXISTS] <table_name> (
  <column_name1> <data_type>,
  <column_name2> <data_type>,
  ...
)
[ PARTITION BY (<partition_transform>) ];
```

- **`IF NOT EXISTS`**: Optionally add this clause to create the table only if it does not already exist.
- **table_name**: The name of the table to be created. In our setup, you can use lakehouse.`<table_name>` to specify the location in the Nessie catalog.
- **column_name / data_type**: Define each column with a name and a data type (e.g., `VARCHAR`, `INT`, `TIMESTAMP`).
- **`PARTITION BY`**: Specify a partitioning strategy, which is especially useful for Iceberg tables. Iceberg supports several partition transforms, such as year, month, day, bucket, and truncate.

#### Example 1: Creating a Basic Table

Let’s create a simple table to store customer data.

```sql
CREATE TABLE lakehouse.customers (
  id INT,
  first_name VARCHAR,
  last_name VARCHAR,
  age INT
);
```

In this example:

We define a customers table within the lakehouse source, where each row represents a customer with an `ID`, `first name`, `last name`, and `age`.

#### Example 2: Creating a Partitioned Table

To optimize queries, we can partition the customers table by the first letter of the last_name column using the truncate transform.

```sql
CREATE TABLE lakehouse.customers_partitioned (
  id INT,
  first_name VARCHAR,
  last_name VARCHAR,
  age INT
) PARTITION BY (truncate(1, last_name));
```

Here, we use the `PARTITION BY` clause with `truncate(1, last_name)`, which will partition the data by the first character of the `last_name` column. Partitioning helps to improve query performance by allowing Dremio to read only the relevant data based on query filters.

#### Example 3: Creating a Date-Partitioned Table

If we have a table to store order data, we may want to partition it by the date the order was placed.

```sql
CREATE TABLE lakehouse.orders (
  order_id INT,
  customer_id INT,
  order_date DATE,
  total_amount DOUBLE
) PARTITION BY (month(order_date));
```

In this case, `month(order_date)` partitions the table by the month of the `order_date` field, making it easier to run queries filtered by month, as Iceberg will only read the relevant partitions.

### Viewing Tables in Dremio

Once the tables are created, you can view them in Dremio’s Datasets section:

- Navigate to the lakehouse source in the Dremio interface.
- You should see the `customers`, `customers_partitioned`,`and`orders` tables listed.
- Clicking on a table name will show you the table, and in the metadata bar on the left show the schema, documentation and other information.

Now let's look at how to insert data into these tables using SQL.

## How to Insert into Tables with SQL

With our tables created, the next step is to populate them with data. Dremio’s `INSERT INTO` command allows us to add data to Apache Iceberg tables, whether inserting individual rows or multiple records at once.

### Basic Syntax for `INSERT INTO`

```sql
INSERT INTO <table_name> [(<column1>, <column2>, ...)]
VALUES (value1, value2, ...), (value1, value2, ...), ...;
```

- **table_name:** The name of the table to insert data into, such as lakehouse.customers.
- **column1, column2, ...:** Optional column names if you’re inserting values into specific columns.
- **`VALUES`:** A list of values to insert. You can insert one or more rows by adding sets of values separated by commas.

#### Example 1: Inserting a Single Row

Let’s add a single row to the customers table.

```sql
INSERT INTO lakehouse.customers (id, first_name, last_name, age)
VALUES (1, 'John', 'Doe', 28);
```

In this example:

We specify values for each column in the customers table: `id`, `first_name`, `last_name`, and `age`.

This inserts a single record for a customer named John Doe, age 28.

#### Example 2: Inserting Multiple Rows

To add multiple rows to a table in one command, list each row in the VALUES clause.

```sql
INSERT INTO lakehouse.customers (id, first_name, last_name, age)
VALUES
  (2, 'Jane', 'Smith', 34),
  (3, 'Alice', 'Johnson', 22),
  (4, 'Bob', 'Williams', 45),
  (5, 'Charlie', 'Brown', 30);
```

In this example:

- We insert multiple records into the customers table in a single command.

- Each set of values corresponds to a different customer, making it easy to populate the table quickly.

#### Example 3: Inserting Data into a Partitioned Table

For partitioned tables, Dremio and Iceberg automatically manage the partitioning based on the table’s partitioning rules. Let’s add some data to the customers_partitioned table, which is partitioned by the first letter of last_name.

```sql
INSERT INTO lakehouse.customers_partitioned (id, first_name, last_name, age)
VALUES
  (6, 'Emma', 'Anderson', 29),
  (7, 'Frank', 'Baker', 35),
  (8, 'Grace', 'Clark', 41);
```

- This inserts three records into the customers_partitioned table, and Dremio will handle partitioning based on the first letter of each last_name (e.g., "A" for Anderson, "B" for Baker, and "C" for Clark).

#### Example 4: Inserting Data with a Select Query

You can also insert data into a table by selecting data from another table. This is particularly useful if you need to copy data or load data from a staging table.

```sql

INSERT INTO lakehouse.customers_partitioned (id, first_name, last_name, age)
SELECT id, first_name, last_name, age
FROM lakehouse.customers
WHERE age > 30;
```

In this example:

We insert rows into `customers_partitioned` by selecting records from the `customers` table.
Only customers older than 30 are inserted into `customers_partitioned`.

### Verifying Inserted Data

To confirm that data was successfully inserted, you can use a SELECT query to retrieve and view the data:

```sql
Copy code
SELECT * FROM lakehouse.customers;
```

This command will display all rows in the customers table, allowing you to verify that your insertions were successful.

With INSERT INTO, you can populate your Iceberg tables with data, either by inserting individual rows, multiple records at once, or copying data from other tables. Next, let's explore how to query this data with SQL.

## How to Query Tables with SQL

With data inserted into our tables, we can now use SQL to query and analyze it. Dremio supports various SQL features, including filtering, grouping, ordering, and even Iceberg’s unique time-travel capabilities.

### Basic `SELECT` Query Syntax

The `SELECT` command allows you to retrieve data from a table. Here’s the basic syntax:

```sql
SELECT [ALL | DISTINCT] <columns>
FROM <table_name>
[WHERE <condition>]
[GROUP BY <expression>]
[ORDER BY <column> [DESC]]
[LIMIT <count>];
```

- **`ALL` | `DISTINCT`:** ALL returns all values, while DISTINCT eliminates duplicates. If omitted, ALL is used by default.
- **columns:** Specify the columns you want to retrieve (e.g., id, first_name) or use \* to retrieve all columns.
- **`WHERE`:** Filters records based on a condition.
- **`GROUP BY`:** Groups records with similar values, allowing aggregate functions like `COUNT`, `SUM`, and `AVG`.
- **`ORDER BY`:** Sorts results by one or more columns; add `DESC` for descending order.
- **`LIMIT`:** Restricts the number of rows returned.

#### Example 1: Selecting All Columns

To view all data in the customers table, use SELECT \*:

```sql
SELECT * FROM lakehouse.customers;
```

This query retrieves every row and column in the customers table.

#### Example 2: Filtering Results with WHERE

Use the `WHERE` clause to filter records based on a condition. For instance, let’s retrieve all customers over the age of 30:

```sql
SELECT * FROM lakehouse.customers
WHERE age > 30;
```

This query returns only the rows where age is greater than 30.

### Example 3: Grouping Results with GROUP BY

The GROUP BY clause groups records based on a specified column, allowing you to calculate aggregates. For example, let’s count the number of customers by age:

```sql
SELECT age, COUNT(*) AS customer_count
FROM lakehouse.customers
GROUP BY age;
```

In this example:

- We group customers by age and count the number of customers in each age group.
- The result shows unique ages and the number of customers for each age.

#### Example 4: Ordering Results with ORDER BY

You can sort query results by one or more columns. To get a list of customers ordered by age in descending order:

```sql
SELECT * FROM lakehouse.customers
ORDER BY age DESC;
```

This will display customers from the oldest to the youngest.

#### Example 5: Limiting the Number of Rows with LIMIT

Use LIMIT to restrict the number of rows returned. This is useful for viewing a sample of your data.

```sql
SELECT * FROM lakehouse.customers
LIMIT 5;
```

This query will return only the first five rows in the customers table.

#### Example 6: Using Iceberg’s Time-Travel with Snapshots

One of Iceberg’s powerful features is time-travel, which allows you to query historical versions of a table. You can specify a particular snapshot ID or timestamp to view data as it was at that moment.

**Query by Snapshot ID:**

```sql
SELECT * FROM lakehouse.customers AT SNAPSHOT '1234567890123456789';
```

Replace '1234567890123456789' with the actual snapshot ID.

**Query by Timestamp:**

```sql
SELECT * FROM lakehouse.customers AT TIMESTAMP '2024-01-01 00:00:00.000';
```

Replace '2024-01-01 00:00:00.000' with the desired timestamp. This lets you view the table as it existed at that specific time.

#### Example 7: Aggregating with Window Functions

Window functions allow you to perform calculations across rows related to the current row within a specified window. For example, if we want to rank customers by age within groups, we can use RANK():

```sql
SELECT id, first_name, last_name, age,
  RANK() OVER (ORDER BY age DESC) AS age_rank
FROM lakehouse.customers;
```

This query assigns a rank based on age, with the oldest customers ranked first.

### Verifying Query Results

To ensure your queries are correct, you can run them in Dremio’s SQL Runner and examine the results in the output pane. Dremio provides performance insights and query details, making it easy to optimize and validate your SQL queries.

With SELECT statements, you can retrieve, filter, group, and order data in Dremio, as well as take advantage of Iceberg’s time-travel capabilities. Next, we’ll look at how to update records in your tables using SQL.

## How to Update Records with SQL

In Dremio, you can use SQL to update existing records in Apache Iceberg tables, making it easy to modify data without rewriting entire datasets. The `UPDATE` command lets you change specific columns for rows that meet certain conditions.

### Basic Syntax for `UPDATE`

```sql
UPDATE <table_name>
SET <column1> = <value1>, <column2> = <value2>, ...
[WHERE <condition>];
```

- **table_name:** The name of the table you want to update, such as lakehouse.customers.
- **`SET`:** Specifies the columns and new values to assign.
- **`WHERE`:** An optional clause to filter the rows that should be updated. Without `WHERE`, all rows in the table will be updated.

#### Example 1: Updating a Single Column

Suppose we want to update the age of a specific customer. We can use the WHERE clause to target the correct row:

```sql
UPDATE lakehouse.customers
SET age = 29
WHERE id = 1;
```

In this example:

- We update the age of the `customer` with `id` = 1 to 29.

- Only rows that match the condition `id` = 1 are affected.

#### Example 2: Updating Multiple Columns

You can update multiple columns in a single UPDATE command. Let’s change both the first_name and last_name of a customer:

```sql
UPDATE lakehouse.customers
SET first_name = 'Jonathan', last_name = 'Doe-Smith'
WHERE id = 1;
```

Here:

- We update both `first_name` and `last_name` for the customer with `id` = 1.
- This operation only affects rows that meet the `WHERE` condition.

#### Example 3: Conditional Updates with WHERE

The `WHERE` clause allows you to apply updates based on specific conditions. For instance, let’s increase the age of all customers under 25 by 1 year:

```sql
UPDATE lakehouse.customers
SET age = age + 1
WHERE age < 25;
```

In this example:

- We increase the age by 1 for all customers where age is less than 25.

This approach is useful for performing bulk updates based on a condition.

#### Example 4: Updating Records in a Specific Branch

If you’re using Nessie to manage versions, you can update records within a specific branch. This allows you to make updates in an isolated environment, which you can later merge into the main branch.

First you'd need to create a new branch

```sql
CREATE BRANCH development IN lakehouse;
```

Then you can update records in the branch

```sql
UPDATE lakehouse.customers
AT BRANCH 'development'
SET age = 30
WHERE id = 3;
```

In this case:

- We update the age of the customer with id = 3 to 30 on the development branch.
- This change will only affect the specified branch until it is merged back into main.
- This only works for Nessie sources

```sql
MERGE BRANCH development INTO main IN lakehouse;
```

### Verifying Updates

To confirm your updates, you can query the table to view the modified records:

```sql
SELECT * FROM lakehouse.customers WHERE id = 1;
```

This query will display the updated row, allowing you to verify that the changes were applied successfully.

### Important Notes on Updates

- **Transactional Safety:** With Apache Iceberg, updates are transactional, so they ensure data consistency and reliability.
- **Using Branches:** When working with branches in Nessie, remember to specify the branch in your `UPDATE` command if you want to limit changes to a specific branch.

Using the `UPDATE` command, you can easily modify data in your Apache Iceberg tables in Dremio. Whether updating single rows or multiple records based on conditions, Dremio’s SQL capabilities make data management flexible and efficient. In the next section, we’ll explore how to alter a table’s structure using SQL.

## How to Alter a Table with SQL

As your data needs evolve, you may need to modify the structure of an Apache Iceberg table. Dremio’s `ALTER TABLE` command provides flexibility to add, drop, or modify columns in existing tables, allowing your schema to evolve without significant disruptions.

### Basic Syntax for `ALTER TABLE`

```sql
ALTER TABLE <table_name>
[ ADD COLUMNS ( <column_name> <data_type> [, ...] ) ]
[ DROP COLUMN <column_name> ]
[ ALTER COLUMN <column_name> SET MASKING POLICY <policy_name> ]
[ MODIFY COLUMN <column_name> <new_data_type> ];
```

- **table_name:** The name of the table you want to alter, such as lakehouse.customers.
- **`ADD COLUMNS`:** Adds new columns to the table.
- **`DROP COLUMN`:** Removes a specified column from the table.
- **`ALTER COLUMN`:** Allows you to set a masking policy for data security.
- **`MODIFY COLUMN`:** Changes the data type of an existing column.

#### Example 1: Adding a New Column

To add a new column to an existing table, use the `ADD COLUMNS` clause. Let’s add an email column to the customers table.

```sql
ALTER TABLE lakehouse.customers
ADD COLUMNS (email VARCHAR);
```

In this example:

- We add a new column email with the data type `VARCHAR` to store customer email addresses.

- All existing rows will have `NULL` as the default value in the new email column until data is populated.

#### Example 2: Dropping a Column

If a column is no longer needed, you can remove it using `DROP COLUMN`. Let’s remove the age column from the customers table.

```sql
ALTER TABLE lakehouse.customers
DROP COLUMN age;
```

Here:

- The age column is removed from the customers table.

- Once a column is dropped, the action cannot be undone, so use this command carefully.

#### Example 3: Modifying a Column’s Data Type

To change the data type of an existing column, use `MODIFY COLUMN`. For example, let’s change the id column from `INT` to `BIGINT` to allow larger values.

```sql
ALTER TABLE lakehouse.customers
MODIFY COLUMN id BIGINT;
```

In this example:

- We modify the id column to have a data type of `BIGINT`, which can store larger values than `INT`.
- Changing data types is restricted to compatible types (e.g., `INT` to `BIGINT`).

#### Example 4: Setting a Masking Policy on a Column

Data masking can enhance data security by obscuring sensitive information. In Dremio, you can apply a masking policy to a column, making sensitive data less accessible to unauthorized users.

```sql
ALTER TABLE lakehouse.customers
ALTER COLUMN email
SET MASKING POLICY mask_email (email);
```

In this case:

- We set a masking policy called mask_email on the email column. (these policies are UDF's you must create before hand)

- The masking policy defines how the data in this column is obscured when queried by users who do not have permission to view the raw data.

#### Example 5: Adding a Partition Field

For Iceberg tables, you can adjust partitioning without rewriting the table. Let’s add a partition field to the customers table to partition data by the first letter of `last_name`.

```sql
ALTER TABLE lakehouse.customers
ADD PARTITION FIELD truncate(1, last_name);
```

Here:

- We partition the customers table by the first letter of `last_name`, making queries more efficient when filtering by `last_name`.

- Iceberg’s partition evolution feature enables you to add or change partition fields without rewriting the existing data.

### Verifying Alterations

After altering a table, you can verify the changes by checking the schema in Dremio’s Datasets section or by running a `SELECT` query to observe the modified structure:

```sql
SELECT * FROM lakehouse.customers;
```

#### Important Notes on Table Alterations

- **Schema Evolution:** Apache Iceberg supports schema evolution, allowing you to make changes to table structure with minimal disruption.
- **Partition Evolution:** Changes to partitioning do not require data rewriting, making it easy to adapt your partition strategy over time.
- **Data Masking:** Applying masking policies ensures sensitive information is protected while maintaining accessibility for authorized users.

Using the ALTER TABLE command in Dremio, you can evolve the structure of your Apache Iceberg tables by adding, modifying, or removing columns, as well as updating partitioning strategies. In the next section, we’ll look at how to delete records from tables using SQL.

## How to Delete Records with SQL

Deleting specific records from an Apache Iceberg table in Dremio can be done using the `DELETE` command. This allows you to remove rows based on conditions, keeping your data relevant and up-to-date without needing to rewrite the entire dataset.

### Basic Syntax for `DELETE`

```sql
DELETE FROM <table_name>
[WHERE <condition>];
```

- **table_name:** The name of the table from which you want to delete records, such as lakehouse.customers.
- **WHERE:** An optional clause that filters rows based on a condition. Without WHERE, all rows in the table will be deleted.

#### Example 1: Deleting Specific Records

Suppose we want to delete records of customers under the age of 18. We can use the WHERE clause to filter these rows and remove them from the customers table.

```sql
DELETE FROM lakehouse.customers
WHERE age < 18;
```

In this example:

- Only rows where age is less than 18 are deleted from the customers table.

- The `WHERE` clause ensures that only specific records are affected by the deletion.

#### Example 2: Deleting All Records

If you need to clear all data from a table but keep the table structure intact, simply omit the `WHERE` clause.

```sql
DELETE FROM lakehouse.customers;
```

This command:

- Removes all rows from the customers table without deleting the table itself.
- The table schema remains intact, allowing new data to be inserted into the table later.

#### Example 3: Deleting Records in a Specific Branch

When using Nessie for versioned data management, you can delete records in an isolated branch. This allows for safe experimentation without affecting the main data.

```sql
DELETE FROM lakehouse.customers
AT BRANCH development
WHERE age > 60;
```

In this example:

- We delete records where age is greater than 60 on the development branch.
- The main branch remains unaffected by this operation until the changes are merged back.

### Verifying Deletions

To confirm that records were successfully deleted, run a `SELECT` query on the table:

```sql
SELECT * FROM lakehouse.customers;
```

This command will display the remaining records, allowing you to verify that the desired rows were removed.

#### Important Notes on Deleting Records

- **Transactional Deletions:** With Iceberg’s support for ACID compliance, deletions are transactional, ensuring consistency and reliability.
- **Version Control with Branches:** Using Nessie’s branching capabilities, you can isolate deletions in specific branches, allowing safe experimentation.

The `DELETE` command in Dremio provides a straightforward way to remove unwanted data from your Apache Iceberg tables. This completes the basics of SQL operations with Apache Iceberg and Dremio, empowering you to handle data from creation to deletion with ease.

## Conclusion

We explored the essentials of SQL operations using Apache Iceberg and Dremio. By combining Dremio’s powerful query engine with Apache Iceberg’s robust data management capabilities, you can efficiently handle large datasets, support schema evolution, and take advantage of advanced features like time-travel and branching. Here’s a quick recap of what we covered:

1. **What is SQL, Apache Iceberg, and Dremio**: We introduced the importance of SQL, Apache Iceberg as a data lakehouse table format, and Dremio as a platform that enhances querying capabilities in a data lakehouse environment.

2. **Setting Up an Environment with Dremio, Nessie, and MinIO**: We configured a local environment using Docker Compose, allowing us to work with Dremio, Nessie for version control, and MinIO for S3-compatible storage.

3. **Accessing Dremio and Connecting Nessie**: We connected Dremio to Nessie and MinIO, providing a foundation for managing and querying data.

4. **How to Create Tables with SQL**: Using the `CREATE TABLE` command, we created Apache Iceberg tables, including partitioned tables for optimized performance.

5. **How to Insert into Tables with SQL**: We populated our tables using the `INSERT INTO` command, demonstrating single and batch inserts.

6. **How to Query Tables with SQL**: With `SELECT` queries, we retrieved data, applied filters, grouped results, and explored Iceberg’s time-travel capabilities.

7. **How to Update Records with SQL**: We used the `UPDATE` command to modify specific records based on conditions, showing how to evolve data as needs change.

8. **How to Alter a Table with SQL**: Using `ALTER TABLE`, we modified the structure of our tables, adding, dropping, and modifying columns as our data needs evolved.

9. **How to Delete Records with SQL**: Finally, we covered the `DELETE` command, enabling record removal based on conditions and managing data cleanly.

### Next Steps

With these SQL basics under your belt, here are a few ways to continue expanding your skills with Apache Iceberg and Dremio:

- **Explore More SQL Functions**: Dive deeper into SQL functions supported by Dremio to handle more complex analytical tasks.
- **Experiment with Data Branching and Merging**: Use Nessie’s branching and merging capabilities for safe experimentation, making it easier to test changes without affecting production data.
- **Leverage Dremio Reflections**: Learn about Dremio’s Reflections feature to accelerate queries and enhance performance.
- **Scale to the Cloud**: Consider deploying Dremio and Iceberg in a cloud environment for greater scalability and to integrate with larger data sources.

By mastering these core SQL operations, you’re well-prepared to build, maintain, and analyze data in a modern data lakehouse architecture. Whether you’re managing structured or unstructured data, Dremio and Apache Iceberg offer the tools you need for efficient, flexible, and high-performance data workflows.

- [Blog: What is a Data Lakehouse and a Table Format?](https://www.dremio.com/blog/apache-iceberg-crash-course-what-is-a-data-lakehouse-and-a-table-format/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=introtosql&utm_content=alexmerced&utm_term=external_blog)
- [Free Copy of Apache Iceberg the Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=introtosql&utm_content=alexmerced&utm_term=external_blog)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=introtosql&utm_content=alexmerced&utm_term=external_blog)
- [Lakehouse Catalog Course](https://hello.dremio.com/webcast-an-in-depth-exploration-on-the-world-of-data-lakehouse-catalogs-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=introtosql&utm_content=alexmerced&utm_term=external_blog)
- [Iceberg Lakehouse Engineering Video Playlist](https://www.youtube.com/watch?v=SIriNcVIGJQ&list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe)
