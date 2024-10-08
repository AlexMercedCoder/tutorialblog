---
title: Exploring Data Operations with PySpark, Pandas, DuckDB, Polars, and DataFusion in a Python Notebook
date: "2024-10-07"
description: "Learning to work with Python to ingest and query data"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
  - Python
---

- [Apache Iceberg Crash Course: What is a Data Lakehouse and a Table Format?](https://www.dremio.com/blog/apache-iceberg-crash-course-what-is-a-data-lakehouse-and-a-table-format/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=pythondata&utm_content=alexmerced&utm_term=external_blog)
- [Free Copy of Apache Iceberg the Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=pythondata)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=pythondata)
- [Iceberg Lakehouse Engineering Video Playlist](https://www.youtube.com/watch?v=SIriNcVIGJQ&list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe) 

Data engineers and scientists often work with a variety of tools to handle different types of data operations—from large-scale distributed processing to in-memory data manipulation. The `alexmerced/spark35nb` Docker image simplifies this by offering a pre-configured environment where you can experiment with multiple popular data tools, including PySpark, Pandas, DuckDB, Polars, and DataFusion.

In this blog, we'll guide you through setting up this environment and demonstrate how to perform basic data operations such as writing data, loading data, and executing queries and aggregations using these tools. Whether you’re dealing with large datasets or just need to manipulate small, in-memory data, you'll see how these different libraries can complement each other.

## Section 1: Setting Up Your Environment

### 1.1 Pull the Docker Image
To get started, you'll first need to pull the `alexmerced/spark35nb` Docker image from Docker Hub. This image comes with a pre-configured environment that includes Spark 3.5.2, JupyterLab, and many popular data manipulation libraries like Pandas, DuckDB, and Polars.

Run the following command to pull the image:

```bash
docker pull alexmerced/spark35nb
```
Next, run the container using the following command:

```bash
docker run -p 8888:8888 -p 4040:4040 -p 7077:7077 -p 8080:8080 -p 18080:18080 -p 6066:6066 -p 7078:7078 -p 8081:8081  alexmerced/spark35nb
```
Once the container is up and running, open your browser and navigate to localhost:8888 to access JupyterLab, where you will perform all your data operations.

Now that you have your environment set up, we can move on to performing some basic data operations using PySpark, Pandas, DuckDB, Polars, and DataFusion.

## Section 2: Working with PySpark

### 2.1 What is PySpark?

PySpark is the Python API for Apache Spark, an open-source engine designed for large-scale data processing and distributed computing. It allows you to work with big data by distributing data and computations across a cluster. While Spark is usually run in a distributed cluster, this setup allows you to run it locally on a single node—perfect for development and testing.

Using PySpark, you can perform data manipulation, SQL queries, machine learning, and more, all within a framework that handles big data efficiently. In this section, we'll walk through how to write and query data using PySpark in the JupyterLab environment.

#### 2.2 Writing Data with PySpark
Let’s start by creating a simple dataset in PySpark. First, initialize a Spark session, which is necessary to interact with Spark's functionality. We will create a small DataFrame with sample data and display it.

```python
from pyspark.sql import SparkSession

# Initialize the Spark session
spark = SparkSession.builder.appName("PySpark Example").getOrCreate()

# Sample data: a list of tuples containing names and ages
data = [("Alice", 34), ("Bob", 45), ("Catherine", 29)]

# Create a DataFrame
df = spark.createDataFrame(data, ["Name", "Age"])

# Show the DataFrame
df.show()
```

In this example, we created a DataFrame with three rows of data, representing people's names and ages. The df.show() function allows us to display the contents of the DataFrame, making it easy to inspect the data we just created.

### 2.3 Loading and Querying Data with PySpark
Next, let’s load a dataset from a file and run some basic queries. PySpark can handle various file formats, including CSV, JSON, and Parquet.

For this example, let’s assume we have a CSV file with more data about people, which we’ll load into a DataFrame. Then we’ll demonstrate a simple filter query and aggregation to count the number of people in each age group.

```python
# Load a CSV file into a DataFrame
df_csv = spark.read.csv("data/people.csv", header=True, inferSchema=True)

# Show the first few rows of the DataFrame
df_csv.show()

# Filter the data to only include people older than 30
df_filtered = df_csv.filter(df_csv["Age"] > 30)

# Show the filtered DataFrame
df_filtered.show()

# Group by Age and count the number of people in each age group
df_grouped = df_csv.groupBy("Age").count()

# Show the result of the grouping
df_grouped.show()
```

In this example, we loaded a CSV file into a PySpark DataFrame using `spark.read.csv()`. Then, we applied two different operations:

- **Filtering**: We filtered the DataFrame to show only rows where the age is greater than 30.
- **Aggregation**: We grouped the data by age and counted how many people are in each age group.

With PySpark, you can perform more complex queries and aggregations on large datasets, making it a tool for big data processing.

In the next section, we'll explore Pandas, which is great for smaller, in-memory data operations that don't require distributed processing.

## Section 3: Data Manipulation with Pandas

### 3.1 What is Pandas?
Pandas is one of the most widely used Python libraries for data manipulation and analysis. It provides easy-to-use data structures, like DataFrames, which allow you to work with tabular data in an intuitive way. Unlike PySpark, which is designed for large-scale distributed data processing, Pandas works in-memory, making it ideal for small to medium-sized datasets.

With Pandas, you can read and write data from various formats, including CSV, Excel, and JSON, and perform common data operations like filtering, aggregating, and merging data with simple and readable syntax.

### 3.2 Loading Data with Pandas
Let’s start by loading a dataset into a Pandas DataFrame. We’ll read a CSV file, which is a common file format for data storage, and display the first few rows.

```python
import pandas as pd

# Load a CSV file into a Pandas DataFrame
df_pandas = pd.read_csv("data/people.csv")

# Display the first few rows of the DataFrame
print(df_pandas.head())
```
In this example, we read the CSV file people.csv using pd.read_csv() and loaded it into a Pandas DataFrame. The head() method lets you view the first few rows of the DataFrame, which is useful for quickly inspecting the data.

### 3.3 Basic Operations with Pandas
Now that we have loaded the data, let’s perform some basic operations, such as filtering rows and grouping data. Pandas allows you to apply these operations easily with simple Python syntax.

```python
# Filter the data to show only people older than 30
df_filtered = df_pandas[df_pandas["Age"] > 30]

# Display the filtered data
print(df_filtered)

# Group the data by 'Age' and count the number of people in each age group
df_grouped = df_pandas.groupby("Age").count()

# Display the grouped data
print(df_grouped)
```

Here, we filtered the data to include only people older than 30 using a simple boolean expression. Then, we used the groupby() function to group the DataFrame by age and count the number of people in each age group.

Pandas is incredibly efficient for in-memory data operations, making it a go-to tool for smaller datasets that can fit in your machine's memory. In the next section, we’ll explore DuckDB, a SQL-based tool that enables fast querying over in-memory data.

## Section 4: Exploring DuckDB
### 4.1 What is DuckDB?
DuckDB is an in-memory SQL database management system (DBMS) designed for analytical workloads. It offers high-performance, efficient querying of datasets directly within your Python environment. DuckDB is particularly well-suited for performing complex SQL queries on structured data, like CSVs or Parquet files, without needing to set up a separate database server.

DuckDB is lightweight, yet powerful, and can be used as an alternative to tools like SQLite, especially when working with analytical queries on large datasets.

### 4.2 Writing Data into DuckDB
DuckDB can easily integrate with Pandas, allowing you to transfer data from a Pandas DataFrame into DuckDB for SQL-based queries. Here’s how to create a table in DuckDB using the data from Pandas.

```python
import duckdb

# Connect to an in-memory DuckDB instance
conn = duckdb.connect()

# Create a table in DuckDB from the Pandas DataFrame
conn.execute("CREATE TABLE people AS SELECT * FROM df_pandas")

# Show the content of the 'people' table
conn.execute("SELECT * FROM people").df()
```

In this example, we connected to DuckDB and created a new table people from the Pandas DataFrame df_pandas. DuckDB’s `execute()` function allows you to run SQL commands, making it easy to interact with data using SQL queries.

### 4.3 Querying Data in DuckDB
Once your data is loaded into DuckDB, you can run SQL queries to filter, aggregate, and analyze your data. DuckDB supports a wide range of SQL functionality, making it ideal for users who prefer SQL over Python for data manipulation.

```python
# Query to select people older than 30
result = conn.execute("SELECT Name, Age FROM people WHERE Age > 30").df()

# Display the result of the query
print(result)

# Query to group people by age and count the number of people in each age group
result_grouped = conn.execute("SELECT Age, COUNT(*) as count FROM people GROUP BY Age").df()

# Display the grouped result
print(result_grouped)
```

In this example, we used SQL to filter the people table, selecting only those who are older than 30. We then ran a grouping query to count the number of people in each age group.

DuckDB is an excellent choice when you need SQL-like functionality directly in your Python environment. It allows you to leverage the power of SQL without the overhead of setting up and managing a database server. In the next section, we will explore Polars, a DataFrame library known for its speed and efficiency.

## Section 5: Leveraging Polars for Fast DataFrame Operations

### 5.1 What is Polars?
Polars is a DataFrame library designed for high-performance data manipulation. It’s known for its speed and efficiency, particularly when compared to libraries like Pandas. Polars is written in Rust and uses an optimized query engine to handle large datasets quickly and with minimal memory usage. It also provides a similar interface to Pandas, making it easy to learn and integrate into existing Python workflows.

Polars is particularly well-suited for processing large datasets that might not fit into memory as easily or for scenarios where performance is a critical factor.

### 5.2 Working with Polars
Let’s start by creating a Polars DataFrame from a Python dictionary. We’ll then perform some basic operations like filtering and aggregating data.

```python
import polars as pl

# Create a Polars DataFrame
df_polars = pl.DataFrame({
    "Name": ["Alice", "Bob", "Catherine"],
    "Age": [34, 45, 29]
})

# Display the Polars DataFrame
print(df_polars)
```

In this example, we created a Polars DataFrame using a Python dictionary. The syntax is similar to Pandas, but the operations are optimized for speed. Polars offers lazy evaluation, which means it can optimize the execution of multiple operations at once, reducing computation time.

### 5.3 Filtering and Aggregating with Polars
Now, let’s perform some common data operations such as filtering and aggregating the data. These operations are highly optimized in Polars and can be done using a simple and expressive syntax.

```python
# Filter the DataFrame to show only people older than 30
df_filtered = df_polars.filter(pl.col("Age") > 30)

# Display the filtered DataFrame
print(df_filtered)

# Group by 'Age' and count the number of people in each age group
df_grouped = df_polars.groupby("Age").count()

# Display the grouped result
print(df_grouped)
```
In this example, we filtered the data to show only rows where the age is greater than 30, and then we grouped the data by age to count how many people are in each group. These operations are highly efficient in Polars due to its optimized memory management and query execution engine.

Polars is ideal when you need the speed of a DataFrame library for both small and large datasets, and when performance is a key requirement. Next, we will explore DataFusion, a tool for SQL-based querying over Apache Arrow data.

## Section 6: DataFusion for Query Execution
### 6.1 What is DataFusion?
DataFusion is an in-memory query execution engine built on top of Apache Arrow, an efficient columnar memory format for analytics. It provides a powerful SQL engine that allows users to run complex queries over structured data stored in Arrow format. DataFusion is part of the Apache Arrow ecosystem, which aims to provide fast data interoperability across different data processing tools.

DataFusion is particularly well-suited for scenarios where you need to query large in-memory datasets using SQL without the overhead of traditional databases. Its integration with Arrow ensures that the data processing is both fast and memory-efficient.

### 6.2 Writing and Querying Data with DataFusion
DataFusion allows you to execute SQL queries on in-memory data using Apache Arrow. Let’s first create a DataFrame using DataFusion and then perform a few SQL queries on it.

```python
from datafusion import SessionContext

# Initialize a DataFusion session
ctx = SessionContext()

# Create a DataFrame with some data
data = [
    {"Name": "Alice", "Age": 34},
    {"Name": "Bob", "Age": 45},
    {"Name": "Catherine", "Age": 29}
]

# Register the DataFrame as a table
df = ctx.create_dataframe(data)
ctx.register_table("people", df)

# Query the data to select people older than 30
result = ctx.sql("SELECT Name, Age FROM people WHERE Age > 30").collect()

# Display the result
print(result)
```
In this example, we used DataFusion’s SessionContext to create a DataFrame and registered it as a table. We then performed a simple SQL query to filter the data for people older than 30. DataFusion allows you to combine the power of SQL with the speed and efficiency of Apache Arrow’s in-memory format.

### 6.3 Aggregating Data with DataFusion
Just like in DuckDB, we can perform aggregation queries to group data by a specific field and count the number of records in each group. Let’s see how this works in DataFusion.

```python
# Group by 'Age' and count the number of people in each age group
result_grouped = ctx.sql("SELECT Age, COUNT(*) as count FROM people GROUP BY Age").collect()

# Display the grouped result
print(result_grouped)
```

In this query, we grouped the data by the 'Age' column and counted how many people were in each age group. DataFusion’s SQL execution engine ensures that queries run efficiently, even on large datasets stored in-memory.

DataFusion is a great tool for users who need fast, SQL-based querying of large in-memory datasets and want to take advantage of Apache Arrow’s high-performance columnar data format. It’s particularly useful for building analytical pipelines that involve heavy querying of structured data.

## Bonus Section: Integrating Dremio with Python

### What is Dremio?
Dremio is a powerful data lakehouse platform that helps organizations unify and query their data from various sources. It enables users to easily govern, join, and accelerate queries on their data without the need for expensive and complex data warehouse infrastructures. Dremio's ability to access and query data directly from formats like Apache Iceberg, Delta Lake, S3, RDBMS, and JSON files, along with its performance enhancements, reduces the workload on traditional data warehouses.

Dremio is built on top of Apache Arrow, a high-performance columnar in-memory format, and utilizes Arrow Flight to accelerate the transmission of large datasets over the network. This integration provides blazing-fast query performance while enabling interoperability between various analytics tools.

In this section, we will demonstrate how to set up Dremio in a Docker container and use Python to query Dremio's data sources using the `dremio-simple-query` library.

### 6.1 Setting Up Dremio with Docker
To run Dremio on your local machine, use the following Docker command:

```bash
docker run -p 9047:9047 -p 31010:31010 -p 45678:45678 -p 32010:32010 -e DREMIO_JAVA_SERVER_EXTRA_OPTS=-Dpaths.dist=file:///opt/dremio/data/dist --name try-dremio dremio/dremio-oss
```

Once Dremio is up and running, navigate to http://localhost:9047 in your browser to access the Dremio UI. Here, you can configure your data sources, create virtual datasets, and explore the platform's capabilities.

### 6.2 Querying Dremio with Python using dremio-simple-query
The dremio-simple-query library allows you to query Dremio using Apache Arrow Flight, providing a high-performance interface for fetching and analyzing data from Dremio sources. With this library, you can easily convert Dremio queries into Pandas, Polars, or DuckDB DataFrames, or work directly with Apache Arrow data.

Here’s how to get started:

#### Step 1: Install the necessary libraries
Make sure you have the dremio-simple-query library installed (It is pre-installed on the alexmerced/spark35nb image). You can install it using pip:

```bash
pip install dremio-simple-query
```

#### Step 2: Set up your connection to Dremio
You’ll need your Dremio credentials to retrieve a token and establish a connection. Here’s a basic example:

```python
from dremio_simple_query.connect import get_token, DremioConnection
from os import getenv
from dotenv import load_dotenv

# Load environment variables (TOKEN and ARROW_ENDPOINT)
load_dotenv()

# Login to Dremio and get a token
login_endpoint = "http://{host}:9047/apiv2/login"
payload = {
    "userName": "your_username",
    "password": "your_password"
}
token = get_token(uri=login_endpoint, payload=payload)

# Dremio Arrow Flight endpoint, make sure to put in the right host for your Dremio instance

arrow_endpoint = "grpc://{host}:32010"

# Establish connection to Dremio using Arrow Flight
dremio = DremioConnection(token, arrow_endpoint)
```
If you are running this locally using the docker run command, the host should be the IP address of the Dremio container on the docker network which you can find by running `docker inspect`.

In this code, we use the `get_token` function to retrieve an authentication token from Dremio's REST API and establish a connection to Dremio's Arrow Flight endpoint.

#### Step 3: Query Dremio and retrieve data in various formats
Once connected, you can use the connection to query Dremio and retrieve results in different formats, including Arrow, Pandas, Polars, and DuckDB. Here’s how:

##### Querying Data and Returning as Arrow Table:
```python
# Query Dremio and return data as an Apache Arrow Table
stream = dremio.toArrow("SELECT * FROM my_table;")
arrow_table = stream.read_all()

# Display Arrow Table
print(arrow_table)
```

##### Converting to a Pandas DataFrame:
```python
# Query Dremio and return data as a Pandas DataFrame
df = dremio.toPandas("SELECT * FROM my_table;")
print(df)
```

##### Converting to a Polars DataFrame:
```python
# Query Dremio and return data as a Polars DataFrame
df_polars = dremio.toPolars("SELECT * FROM my_table;")
print(df_polars)
```
##### Querying with DuckDB:
```python
# Query Dremio and return as a DuckDB relation
duck_rel = dremio.toDuckDB("SELECT * FROM my_table")

# Perform a query on the DuckDB relation
result = duck_rel.query("my_table", "SELECT * FROM my_table WHERE Age > 30").fetchall()

# Display results
print(result)
```

With the `dremio-simple-query` library, you can efficiently query large datasets from Dremio and immediately start analyzing them with various tools like Pandas, Polars, and DuckDB, all while leveraging the high-performance Apache Arrow format under the hood.

### 6.3 Why Use Dremio?
Dremio provides several benefits that make it a powerful addition to your data stack:

- **Governance:** Centralize governance over all your data sources, ensuring compliance and control.

- **Data Federation:** Join data across various sources, such as Iceberg, Delta Lake, JSON, CSV, and relational databases, without moving the data.

- **Performance:** Accelerate your queries with the help of Dremio's query acceleration features and Apache Arrow Flight.

- **Cost Savings:** By offloading workloads from traditional data warehouses, Dremio can reduce infrastructure costs.

Dremio's close relationship with Apache Arrow ensures that your queries are both fast and efficient, allowing you to seamlessly integrate various data sources and tools into your analytics workflows.

### Conclusion

In this blog, we explored how to use a variety of powerful tools for data operations within a Python notebook environment. Starting with the `alexmerced/spark35nb` Docker image, we demonstrated how to set up a development environment that includes PySpark, Pandas, DuckDB, Polars, and DataFusion—each optimized for different data processing needs. We showcased basic operations like writing, querying, and aggregating data using each tool’s unique strengths.

- **PySpark** enables scalable, distributed processing for large datasets, perfect for big data environments.
- **Pandas** offers in-memory, easy-to-use data manipulation for smaller datasets, making it the go-to tool for quick data exploration.
- **DuckDB** provides an efficient, in-memory SQL engine, ideal for analytical queries without the need for complex infrastructure.
- **Polars** brings lightning-fast DataFrame operations, combining performance and simplicity for larger or performance-critical datasets.
- **DataFusion**, with its foundation in Apache Arrow, allows for high-performance SQL querying, particularly for analytical workloads in memory.

Finally, we introduced **Dremio**, which integrates with Apache Arrow to enable lightning-fast queries across a range of data sources. With the `dremio-simple-query` library, Dremio allows analysts to quickly fetch and analyze data using tools like Pandas, Polars, and DuckDB, ensuring that data is available when and where it's needed without the overhead of traditional data warehouses.

Whether you're working with small datasets or handling massive amounts of data in distributed environments, this setup provides a versatile, efficient, and scalable platform for any data engineering or data science project. By leveraging these tools together, you can cover the full spectrum of data processing, from exploration to large-scale analytics, with minimal setup and maximum performance.


