---
title: End-to-End Basic Data Engineering Tutorial (Spark, Dremio, Superset)
date: "2024-04-01"
description: "Ingesting Data and Building BI Dashboards"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - Data Architecture
  - Apache Iceberg
  - Data Lakehouse
---

Data engineering aims to make data accessible and usable for data analytics and data science purposes. This involves several key aspects:

- Transferring data from operational systems like databases to systems optimized for analytical access.
  
- Modeling and optimizing data for improved accessibility and performance.
  
- Governing data access to ensure that only authorized individuals can access specific data.
  
- Creating abstractions to simplify data access.

This tutorial focuses on the initial step of moving data between systems, introducing various systems commonly used in modern data platforms. Specifically, [we'll explore a "Data Lakehouse" architecture](https://bit.ly/dremio-blog-why-lakehouse).

## What is a Data Lakehouse?

In many data systems, there are two primary hubs for data:

- **Data Lake:** A storage system like Hadoop or Object Storage (ADLS/S3) that stores structured and unstructured data.
  
- **Data Warehouses:** These systems store structured data optimized for analytical workloads, in contrast to databases that are designed for transactional tasks.

Data engineers typically move data from operational systems to JSON/CSV/Parquet files in the data lake, and then transfer a subset of that data to the data warehouse. However, as data volumes increased, this two-step process became time-consuming and costly, emphasizing the need for faster data delivery.

The evolution involved enhancing data lake capabilities to resemble data warehouse functionalities. This included implementing components like table formats to organize data files into tables and a catalog to track these tables. These enhancements enable [data lakehouse platforms](https://bit.ly/dremio-blog-lakehouse-platform) like [Dremio](https://bit.ly/am-dremio-get-started-external-blog) to process data on the data lake as efficiently as a data warehouse.

## Summary of Exercises

In this exercise, we assume our operational applications use Postgres as a database. Our goal is to migrate this data to our data lakehouse, specifically into [Apache Iceberg tables](https://bit.ly/am-iceberg-101) managed stored in Minio as our object storage, these tables will tracked by a [Nessie catalog](https://bit.ly/am-nessie-101). We'll utilize Apache Spark as the data movement tool to the data lake and Dremio as the query engine powering our business intelligence (BI) dashboards through [Apache Superset](https://www.dremio.com/blog/bi-dashboards-101-with-dremio-and-superset/).

## Environment Setup

To setup our environment you will need docker desktop installed on your machine. Then in an empty folder create a `docker-compose.yml` file and include the following:

```yaml
version: "3"

services:
  # Nessie Catalog Server Using In-Memory Store
  nessie:
    image: projectnessie/nessie:latest
    container_name: nessie
    networks:
      de-end-to-end:
    ports:
      - 19120:19120
  # Minio Storage Server
  minio:
    image: minio/minio:latest
    container_name: minio
    environment:
      - MINIO_ROOT_USER=admin
      - MINIO_ROOT_PASSWORD=password
      - MINIO_DOMAIN=storage
      - MINIO_REGION_NAME=us-east-1
      - MINIO_REGION=us-east-1
    networks:
      de-end-to-end:
    ports:
      - 9001:9001
      - 9000:9000
    command: ["server", "/data", "--console-address", ":9001"]
  # Dremio
  dremio:
    platform: linux/x86_64
    image: dremio/dremio-oss:latest
    ports:
      - 9047:9047
      - 31010:31010
      - 32010:32010
    container_name: dremio
    networks:
      de-end-to-end:
  # Spark
  spark:
    platform: linux/x86_64
    image: alexmerced/spark35notebook:latest
    ports: 
      - 8080:8080  # Master Web UI
      - 7077:7077  # Master Port
      - 8888:8888  # Notebook
    environment:
      - AWS_REGION=us-east-1
      - AWS_ACCESS_KEY_ID=admin #minio username
      - AWS_SECRET_ACCESS_KEY=password #minio password

    container_name: spark
    networks:
      de-end-to-end:
  # Postgres
  postgres:
    image: postgres:latest
    container_name: postgres
    environment:
      POSTGRES_DB: mydb
      POSTGRES_USER: myuser
      POSTGRES_PASSWORD: mypassword
    ports:
      - "5435:5432"
    networks:
      de-end-to-end:
  #Superset
  superset:
    image: alexmerced/dremio-superset
    container_name: superset
    networks:
      de-end-to-end:
    ports:
      - 8088:8088
networks:
  de-end-to-end:
```

### Breakdown of the docker-compose file

This Docker Compose file defines a set of services that work together to create a data engineering environment. Let's break down each service and its purpose:

1. **Nessie Catalog Server (nessie):**
   - Image: `projectnessie/nessie:latest`
   - Purpose: This service sets up a Nessie catalog server using an in-memory store.
   - Ports: Exposes port 19120 for external communication.

2. **Minio Storage Server (minio):**
   - Image: `minio/minio:latest`
   - Environment Variables:
     - `MINIO_ROOT_USER=admin`
     - `MINIO_ROOT_PASSWORD=password`
     - `MINIO_DOMAIN=storage`
     - `MINIO_REGION_NAME=us-east-1`
     - `MINIO_REGION=us-east-1`
   - Purpose: Sets up a Minio storage server for object storage.
   - Ports: Exposes ports 9001 and 9000 for external access and uses port 9001 for the Minio console.
   - Command: Starts the server with the specified parameters.

3. **Dremio (dremio):**
   - Platform: `linux/x86_64`
   - Image: `dremio/dremio-oss:latest`
   - Ports: Exposes ports 9047, 31010, and 32010 for Dremio communication.
   - Purpose: Sets up Dremio, a data lakehouse platform, for data processing and analytics.

4. **Spark (spark):**
   - Platform: `linux/x86_64`
   - Image: `alexmerced/spark35notebook:latest`
   - Ports: Exposes ports 8080, 7077, and 8888 for Spark services, including the web UI, master port, and notebook.
   - Purpose: Sets up Apache Spark for distributed data processing and analytics.

5. **Postgres (postgres):**
   - Image: `postgres:latest`
   - Environment Variables:
     - `POSTGRES_DB=mydb`
     - `POSTGRES_USER=myuser`
     - `POSTGRES_PASSWORD=mypassword`
   - Ports: Exposes port 5435 for external access.
   - Purpose: Sets up a Postgres database with a specified database name, username, and password.

6. **Superset (superset):**
   - Image: `alexmerced/dremio-superset`
   - Ports: Exposes port 8080 for Superset access.
   - Purpose: Sets up Apache Superset, a data visualization and exploration platform, for creating BI dashboards.

Additionally, the file defines a network called `de-end-to-end` that connects all the services together, allowing them to communicate with each other within the Docker environment.

This Docker Compose file creates a comprehensive data engineering environment with services for data storage, processing, analytics, and visualization.

## Populating the Postgres Database

The first step is to populate our Postgres database with some data to represent operational data.

### 1. Spin up the Postgres Service:

Open a terminal, navigate to the directory containing the Docker Compose file, and run the following command to start the Postgres service:

```bash
docker-compose up postgres
```

### 2. Access the Postgres Shell:
After the Postgres service is running, you can access the Postgres shell using the following command in another terminal:

```bash
docker exec -it postgres psql -U myuser mydb
```

Enter the password when prompted (use `mypassword` in this example).

### 3. Create a Table and Add Data:
Once you're in the Postgres shell, you can create a table and add data. Here's an example SQL script:

```sql
-- Create a table for a mock BI dashboard dataset
CREATE TABLE sales_data (
    id SERIAL PRIMARY KEY,
    product_name VARCHAR(255),
    category VARCHAR(50),
    sales_amount DECIMAL(10, 2),
    sales_date DATE
);

-- Insert sample data into the table
INSERT INTO sales_data (product_name, category, sales_amount, sales_date)
VALUES
    ('Product A', 'Electronics', 1000.50, '2024-03-01'),
    ('Product B', 'Clothing', 750.25, '2024-03-02'),
    ('Product C', 'Home Goods', 1200.75, '2024-03-03'),
    ('Product D', 'Electronics', 900.00, '2024-03-04'),
    ('Product E', 'Clothing', 600.50, '2024-03-05');
```

Run the above SQL script in the Postgres shell to create the sales_data table and populate it with sample data ideal for a mock BI dashboard. Leave the postgres shell with the command:

```
\q
```

## Moving the Data to the Data Lake with Spark

Next, we need to move the data to our data lake so need to spin up the following services.

- minio: This will be our storage layer, an object storage service for holding all our files.

- nessie: This will be our Apache iceberg catalog, tracking our different tables and the location of their latest metadata file in our storage.

- spark: This will have Apache Spark, a data processing framework running along with a Python notebook server to write code to send Spark instructions for processing data.

### 1. Starting Up Our Data Lake

To run these services in an available terminal run the following command:

```
docker compose up spark nessie minio dremio
```

Keep an eye out cause in the terminal output the URL to access the Python notebook server will appear, and this will be needed to access the server running on localhost:8888.

```
spark   | [I 2024-04-01 15:02:50.052 ServerApp]     http://127.0.0.1:8888/lab?token=bdc8479a80be54e723eb636e1b62de141a553b75e984a9da
```

Put the URL in the browser and you'll be able to create a new notebook, which we'll add some code to later on.

### 2. Creating a Bucket in Our Data Lake

Head over to `localhost:9001` and enter in the username `admin` and the password `password` to get access to the minio console where you can create a new bucket called "warehouse".


### 3. Running the PySpark Script

 with the following code:

```py
import pyspark
from pyspark.sql import SparkSession
import os


## DEFINE SENSITIVE VARIABLES
CATALOG_URI = "http://nessie:19120/api/v1" ## Nessie Server URI
WAREHOUSE = "s3://warehouse/" ## S3 Address to Write to
STORAGE_URI = "http://minio:9000"


conf = (
    pyspark.SparkConf()
        .setAppName('app_name')
  		#packages
        .set('spark.jars.packages', 'org.postgresql:postgresql:42.7.3,org.apache.iceberg:iceberg-spark-runtime-3.5_2.12:1.5.0,org.projectnessie.nessie-integrations:nessie-spark-extensions-3.5_2.12:0.77.1,software.amazon.awssdk:bundle:2.24.8,software.amazon.awssdk:url-connection-client:2.24.8')
  		#SQL Extensions
        .set('spark.sql.extensions', 'org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions,org.projectnessie.spark.extensions.NessieSparkSessionExtensions')
  		#Configuring Catalog
        .set('spark.sql.catalog.nessie', 'org.apache.iceberg.spark.SparkCatalog')
        .set('spark.sql.catalog.nessie.uri', CATALOG_URI)
        .set('spark.sql.catalog.nessie.ref', 'main')
        .set('spark.sql.catalog.nessie.authentication.type', 'NONE')
        .set('spark.sql.catalog.nessie.catalog-impl', 'org.apache.iceberg.nessie.NessieCatalog')
        .set('spark.sql.catalog.nessie.s3.endpoint', STORAGE_URI)
        .set('spark.sql.catalog.nessie.warehouse', WAREHOUSE)
        .set('spark.sql.catalog.nessie.io-impl', 'org.apache.iceberg.aws.s3.S3FileIO')

)

## Start Spark Session
spark = SparkSession.builder.config(conf=conf).getOrCreate()
print("Spark Running")

# Define the JDBC URL for the Postgres database
jdbc_url = "jdbc:postgresql://postgres:5432/mydb"
properties = {
    "user": "myuser",
    "password": "mypassword",
    "driver": "org.postgresql.Driver"
}

# Load the table from Postgres
postgres_df = spark.read.jdbc(url=jdbc_url, table="sales_data", properties=properties)

# Write the DataFrame to an Iceberg table
postgres_df.writeTo("nessie.sales_data").createOrReplace()

# Show the contents of the Iceberg table
spark.read.table("nessie.sales_data").show()

# Stop the Spark session
spark.stop()
```

> If you run into a "Unknown Host" issue using `http://minio:9000` then there may be an issue with the DNS in your Docker network that watches the name `minio` with the ip address of the image on the docker network. In this situation replace `minio` with the containers ip address. You can look up the ip address of the container with `docker inspect minio` and look for the ip address in the network section and update the STORAGE_URI variable for example `STORAGE_URI = "http://172.18.0.6:9000"`

### Breakdown of the PySpark Code

This PySpark script demonstrates how to configure a Spark session to integrate with Apache Iceberg and Nessie, read data from a PostgreSQL database, and write it to an Iceberg table managed by Nessie.

1. **Import necessary modules:**
   - `pyspark`: The main PySpark library.
   - `SparkSession`: The entry point to programming Spark with the Dataset and DataFrame API.

2. **Define sensitive variables:**
   - `CATALOG_URI`: The URI for the Nessie server.
   - `WAREHOUSE`: The S3 bucket URI where the Iceberg tables will be stored.
   - `STORAGE_URI`: The URI of the S3-compatible storage, in this case, a MinIO instance running at `172.18.0.6:9000`.

3. **Configure Spark session:**
   - Set the application name.
   - Specify necessary packages (`spark.jars.packages`) including PostgreSQL JDBC driver, Iceberg, Nessie, and AWS SDK.
   - Enable required SQL extensions for Iceberg and Nessie (`spark.sql.extensions`).
   - Configure Nessie catalog settings such as URI, reference branch, authentication type, and implementation class.
   - Set the S3 endpoint for Nessie to communicate with the S3-compatible storage (MinIO).

4. **Start the Spark session:**
   - The `SparkSession` is initialized with the above configuration.

5. **Database connection setup:**
   - Define the JDBC URL for the PostgreSQL database.
   - Set connection properties including user, password, and driver.

6. **Data ingestion from PostgreSQL:**
   - Read data from the `sales_data` table in PostgreSQL into a DataFrame (`postgres_df`).

7. **Write data to an Iceberg table:**
   - Write the DataFrame to an Iceberg table named `sales_data` in the Nessie catalog.

8. **Read and display the Iceberg table:**
   - Read the newly created Iceberg table from the Nessie catalog and display its contents.

9. **Stop the Spark session:**
   - Terminate the Spark session to release resources.

### Can This Be Easier?

Configuring Apache Spark while a standard tool for the Data Engineer, can be really tedious to configure and trouble shoot. We could alternatively use our Data Lakehouse Platform, Dremio, to handle the ingestion of the data with simple SQL statements. To see an example of this check out the following tutorials:

- [From Postgres -> Dremio -> Dashboards](https://www.dremio.com/blog/from-postgres-to-dashboards-with-dremio-and-apache-iceberg/)
- [From SQLServer -> Dremio -> Dashboards](https://www.dremio.com/blog/from-sqlserver-to-dashboards-with-dremio-and-apache-iceberg/)
- [From MongoDB -> Dremio -> Dashboards](https://www.dremio.com/blog/from-mongodb-to-dashboards-with-dremio-and-apache-iceberg/)
- [From AWS Glue -> Dremio -> Dashboard](https://www.dremio.com/blog/bi-dashboards-with-apache-iceberg-using-aws-glue-and-apache-superset/)

## Connecting Our Data to Dremio

[Dremio is powerful data lakehouse platform](https://www.dremio.com/solutions/data-lakehouse/) that can connect several data sources across cloud and on-prem sources and deliver them anywhere you need like [BI Dashboards](https://www.dremio.com/blog/bi-dashboards-101-with-dremio-and-superset/) and [Python notebooks](https://www.dremio.com/blog/connecting-to-dremio-using-apache-arrow-flight-in-python/). We will use Dremio to process queries that power our BI Dashboards.

Now, head to `localhost:9047` in your browser to set up your Dremio admin account. Once set up, click “add a Source” and select a “Nessie” as the source. Enter in the following settings:

- General settings tab
    - Source Name: nessie
    - Nessie Endpoint URL: http://nessie:19120/api/v2
    - Auth Type: None
- Storage settings tab
    - AWS Root Path: warehouse
    - AWS Access Key: admin
    - AWS Secret Key: password
    - Uncheck “Encrypt Connection” Box (since we aren’t using SSL)
    - Connection Properties
        - Key: fs.s3a.path.style.access | Value: true
        - Key: fs.s3a.endpoint | Value: minio:9000
        - Key: dremio.s3.compat | Value: true

Click on “Save,” and the source will be added to Dremio. You can then run full DDL and DML SQL against it. Dremio turns your data lake into a data warehouse—a data lakehouse!

Now we can connect superset and build BI dashboards over any data we have connected to Dremio which can not only include our data lake but many sources like Postgres, SQLServer, Mongo, ElasticSearch, Snowflake, Hadoop, ADLS, S3, AWS Glue, Hive and much more!

## Building our BI Dashboard

Dremio can be used with most existing BI tools, with one-click integrations in the user interface for tools like Tableau and Power BI. We will use an open-source option in Superset for this exercise, but any BI tool would have a similar experience. Let's run the Superset service:

```
docker compose up superset
```

We need to initialize Superset, so open another terminal and run this command:
```
docker exec -it superset superset init
```

This may take a few minutes to finish initializing but once it is done you can head over to `localhost:8080` and log in to Superset with the username “`admin`” and password “`admin`”. Once you are in, click on “Settings” and select “Database Connections”.

- Add a New Database
- Select “Other”
- Use the following connection string (make sure to include Dremio username and password in URL):

```
dremio+flight://USERNAME:PASSWORD@dremio:32010/?UseEncryption=false
```
- Test connection
- Save connection

The next step is to add a dataset by clicking on the + icon in the upper right corner and selecting “create dataset”. From here, choose the table you want to add to Superset, which is, in this case, our sales_data table.

We can then click the + to add charts based on the datasets we’ve added. Once we create the charts we want we can add them to a dashboard, and that’s it! You’ve now taken data from an operational database, ingested it into your data lake, and served a BI dashboard using the data.

## Conlclusion


In conclusion, this comprehensive guide has journeyed through the critical steps of data engineering, from moving data between operational systems and analytical platforms to leveraging modern data architectures like the Data Lakehouse. By utilizing tools such as Apache Iceberg, Nessie, Minio, Apache Spark, and Dremio, we've demonstrated how to efficiently migrate data from a traditional database like Postgres into a scalable and manageable data lakehouse environment. Furthermore, the integration of Apache Superset for BI dashboarding illustrates the seamless end-to-end data workflow. 

Here are many other tutorials and resources to help you learn even more about the data engineering world.

- [Video: Data 101 Video Playlist](https://youtube.com/playlist?list=PLsLAVBjQJO0p_4Nqz99tIjeoDYE97L0xY&si=gVaGFq4cDgIthTfz)
- [Video: Using Dremio with Deepnote Collaborative Notebooks](https://www.youtube.com/watch?v=CKTGkQbryX8)
- [Video: Using Dremio with Hex Collaborative Notebooks](https://www.youtube.com/watch?v=sglNHVg42ns)
- [Video: Using Dremio Cloud with dbt](https://www.youtube.com/watch?v=KE0DkxF-GI8)
- [Video: Using Dremio Software with dbt](https://www.youtube.com/watch?v=p8UrOsnBg6Q)
- [Blog: Running Graph Queries on your Apache Iceberg Tables with Puppygraph & Dremio]()
- [Video: Branching and Merging with Nessie](https://www.youtube.com/watch?v=CLde-63N2bc)
- [Video: Dremio Demonstrations Playlist](https://youtube.com/playlist?list=PL-gIUf9e9CCsBMa0DN2_oVicpcUYXuSMT&si=ju-75Z-lOt95kYpD)
- [Reference: Dremio Quick Guides Repo](https://github.com/developer-advocacy-dremio/quick-guides-from-dremio)