---
title: Hands-on with Apache Iceberg on Your Laptop - Deep Dive with Apache Spark, Nessie, Minio, Dremio, Polars and Seaborn
date: "2024-09-12"
description: "The Evolving Data Lakehouse World"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering

---

- [Free Copy of Apache Iceberg: The Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=introiceberg&utm_content=alexmerced&utm_term=external_blog)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=introiceberg&utm_content=alexmerced&utm_term=external_blog)

**Table of Contents**
- [What is a Data Lakehouse?](#what-is-a-data-lakehouse)
- [Data Lakehouse Technologies](#data-lakehouse-technologies)
- [Setting Up the Evvironment with Docker Compose](#setting-up-the-environment-with-docker-compose)
- [Verifying Services are Running](#verifying-that-the-services-are-running)
- [Ingesting Data Into Iceberg with Apache Spark](#ingesting-data-into-iceberg-with-apache-spark)
- [Verifying Iceberg Metadata Stored in Minio](#verifying-iceberg-data-and-metadata-in-minio)
- [Confirming Nessie is Tracking Tables](#confirming-nessie-is-tracking-the-iceberg-table-with-curl-commands)
- [Connecting Dremio to Minio and Nessie](#connecting-nessie-and-minio-as-sources-in-dremio)
- [Access Data From Dremio in BI Tools and Notebooks](#accessing-data-in-dremio-bi-tool-integrations-rest-api-jdbcodbc-and-apache-arrow-flight)
- [Conclusion](#conclusion)

Apache Iceberg and the Data Lakehouse architecture have garnered significant attention in the data landscape. Technologies such as Dremio, Nessie, and Minio play a vital role in enabling the Lakehouse paradigm, offering powerful tools for data management and analytics. In this blog, we'll explore the concept of the Lakehouse, introduce the key technologies that make it possible, and provide a hands-on guide to building your own Data Lakehouse environment right on your laptop. This will allow you to experience firsthand how these tools work together to revolutionize data storage and processing.

## What is a Data Lakehouse?

Traditional database and data warehouse systems typically bundle together several core components, such as storage, table format, cataloging, and query processing, into a single tool. While this approach is convenient, it comes with challenges. Each system implements these features differently, which can lead to issues when scaling, transferring data across platforms, or achieving seamless interoperability. As organizations grow and evolve, these limitations become more apparent, especially in terms of flexibility and performance.

Data Lakes, on the other hand, serve as a centralized repository where all types of data land in various forms, from structured to unstructured. Given this role, it makes sense to leverage the data lake as the storage foundation while decoupling the other functions—table metadata, cataloging, and query processing—into separate, specialized tools. This decoupled architecture forms the essence of the Data Lakehouse. It combines the flexibility and scalability of a Data Lake with the management features of a Data Warehouse, providing a unified solution for handling large-scale data storage, organization, and analytics.

## Data Lakehouse Technologies

A Data Lakehouse is powered by a combination of tools and technologies that work together to enable efficient storage, cataloging, and analytics. Below are key technologies that make up a modern data lakehouse:

### Minio

Minio is a high-performance object storage solution that can act as your data lake, whether in the cloud or on-premises. Object storage is unique because it allows data to be stored in flexible, scalable units called objects, which are well-suited for unstructured and structured data alike. Minio offers several unique features, including S3-compatible APIs, strong security, and efficient performance across different environments. Its ability to seamlessly store large amounts of data makes it ideal for serving as the foundation of a data lake in both hybrid cloud and on-prem environments.

### Apache Parquet

Apache Parquet is a specialized file format designed to store structured data for analytics at scale. What makes Parquet stand out is its columnar storage format, which is optimized for read-heavy analytical workloads. By organizing data by columns instead of rows, Parquet enables more efficient queries, especially when only a subset of columns is required. Additionally, its ability to compress data effectively reduces storage costs while speeding up query performance, making it a go-to format for modern data lakehouses.

### Apache Iceberg

Apache Iceberg introduces a new standard for handling large datasets in data lakes by offering a structured table format with built-in ACID guarantees. Iceberg organizes Parquet files into tables, allowing data lakes to be managed like traditional data warehouses with features such as schema evolution, time travel, and partitioning. Iceberg solves many of the challenges associated with using data lakes for complex analytics, enabling tables to evolve without downtime and providing reliable query performance across massive datasets.

### Nessie

Nessie is an open-source catalog designed to track Apache Iceberg tables, making it easy for different tools to interact with and understand the structure of your data lake. What sets Nessie apart is its catalog versioning features, which allow users to manage different versions of their table schemas over time, supporting experimentation and rollback capabilities. Nessie ensures that the state of your data lake is well-documented and consistently accessible across tools like Dremio and Apache Spark.

### Apache Spark

Apache Spark is a powerful data processing framework that plays a crucial role in moving data between different sources and performing transformations at scale. Its distributed nature allows it to process large datasets quickly, and it integrates well with other data lakehouse technologies like Iceberg and Parquet. Whether you're loading data into your lakehouse or transforming it for analysis, Spark provides the muscle to handle these operations efficiently.

### Dremio

Dremio is a lakehouse platform designed to connect all your data in one place, enabling SQL-based analytics directly on your data lake. Dremio provides native support for Apache Iceberg tables, allowing you to work with them as if they were traditional database tables, but without the constraints of a data warehouse. It also offers features such as reflections for query acceleration and a user-friendly interface for running complex queries across diverse datasets. With Dremio, data analysts can easily query large datasets stored in object storage, leveraging Iceberg's powerful table features without needing to move data into a warehouse.

## Setting Up the Environment with Docker Compose

Docker is a platform that allows you to package and run applications in isolated containers, ensuring that they run consistently across different environments. Containers bundle an application with all of its dependencies, making it easy to manage and deploy complex setups. Docker Compose is a tool specifically designed to handle multi-container applications, enabling you to define and run multiple services using a simple configuration file. By using Docker Compose, we can quickly set up an environment with all the necessary components for our data lakehouse—such as Spark, Dremio, Minio, and Nessie—without worrying about manual installation or configuration. This approach not only saves time but ensures that our setup is portable and easy to replicate across different systems.

### Understanding the Docker Compose File

A Docker Compose file is a YAML configuration file that defines how to run multiple containers in a single environment. The standard name for this file is `docker-compose.yml`, and it allows you to describe the services, networks, and volumes required for your setup in a straightforward and structured way. This file centralizes the configuration, so you can manage all the different parts of your environment in one place.

- **Services**: Services are the individual containers that will be running. Each service represents a specific component of your environment, such as a database, object storage, or an analytics engine. In the Compose file, you define each service’s configuration, including the image it will run, ports to expose, and any environment variables needed.

- **Networks**: Networks allow the different services to communicate with each other. By default, Docker Compose creates a network so all the containers can connect seamlessly. You can also define custom networks to further control how services interact with each other, which is especially useful in complex setups where you want to limit certain containers' access to one another.

- **Volumes**: Volumes are used for persisting data beyond the lifecycle of a container. When a container is removed, its data is lost unless it's saved to a volume. In a Docker Compose file, volumes are defined to store and share data between containers, making sure that critical information like database contents or file storage remains intact even when containers are restarted or recreated.

### Cloning the Demo Environment Repository

For this exercise, we will be working with a pre-built environment template hosted on GitHub: [AlexMercedCoder/dremio-spark-nessie-demo-environment-template](https://github.com/AlexMercedCoder/dremio-spark-nessie-demo-environment-template). This is a template repository, meaning you can generate your own copy of the repository to modify and use for your needs. To get started, go to the repository page, and click the "Use this template" button at the top to create a new repository under your own GitHub account. Once you've created your template copy, you can clone it to your local machine using the `git clone` command. This will allow you to have the full environment set up locally for hands-on experimentation.

### Our Docker Compose File

```yaml
version: "3"

services:
  # Nessie Catalog Server Using In-Memory Store
  nessie:
    image: projectnessie/nessie:latest
    container_name: nessie
    environment:
      - QUARKUS_PROFILE=prod
      - QUARKUS_HTTP_PORT=19120
      - QUARKUS_LOG_CONSOLE_FORMAT=%d{yyyy-MM-dd HH:mm:ss} %-5p [%c{1.}] (%t) %s%e%n
      - QUARKUS_LOG_LEVEL=INFO
      - QUARKUS_DATASOURCE_DB_KIND=rocksdb
      - QUARKUS_DATASOURCE_JDBC_URL=jdbc:rocksdb:file:///nessie/data
      - QUARKUS_DATASOURCE_USERNAME=nessie
      - QUARKUS_DATASOURCE_PASSWORD=nessie
    volumes:
      - ./nessie-data:/nessie/data  # Mount local directory to persist RocksDB data
    ports:
      - "19120:19120"  # Expose Nessie API port
    networks:
      intro-network:
  # Minio Storage Server
  minio:
    image: minio/minio
    container_name: minio
    environment:
      - MINIO_ROOT_USER=admin
      - MINIO_ROOT_PASSWORD=password
      - MINIO_DOMAIN=minio
      - MINIO_REGION_NAME=us-east-1
      - MINIO_REGION=us-east-1
    ports:
      - "9000:9000"
      - "9001:9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3
    volumes:
      - ./minio-data:/minio-data  # Mount the local folder to container
    entrypoint: >
      /bin/sh -c "
      minio server /data --console-address ':9001' &
      sleep 5;
      mc alias set myminio http://localhost:9000 admin password;
      mc mb myminio/datalake;
      mc mb myminio/datalakehouse;
      mc mb myminio/warehouse;
      mc mb myminio/seed;
      mc cp /minio-data/* myminio/seed/;
      tail -f /dev/null"
    networks:
      intro-network:
  
  # Spark
  spark:
    platform: linux/x86_64
    image: alexmerced/spark35nb:latest
    ports: 
      - 8080:8080    # Master Web UI
      - 7077:7077    # Master Port for job submissions
      - 8081:8081    # Worker Web UI
      - 4040-4045:4040-4045  # Additional Spark job UI ports for more jobs
      - 18080:18080  # Spark History Server
      - 8888:8888    # Jupyter Notebook
    environment:
      - AWS_REGION=us-east-1
      - AWS_ACCESS_KEY_ID=admin  # Minio username
      - AWS_SECRET_ACCESS_KEY=password  # Minio password
      - SPARK_MASTER_HOST=spark
      - SPARK_MASTER_PORT=7077
      - SPARK_MASTER_WEBUI_PORT=8080
      - SPARK_WORKER_WEBUI_PORT=8081
      - SPARK_HISTORY_OPTS=-Dspark.history.fs.logDirectory=/tmp/spark-events
      - SPARK_HOME=/opt/spark  # Set SPARK_HOME explicitly
    volumes:
      - ./notebook-seed:/workspace/seed-data  # Volume for seeding data into the container
    container_name: spark
    entrypoint: >
      /bin/bash -c "
      /opt/spark/sbin/start-master.sh && \
      /opt/spark/sbin/start-worker.sh spark://$(hostname):7077 && \
      mkdir -p /tmp/spark-events && \
      start-history-server.sh && \
      jupyter lab --ip=0.0.0.0 --port=8888 --no-browser --allow-root --NotebookApp.token='' --NotebookApp.password='' && \
      tail -f /dev/null
      "
    networks:
      intro-network:

  # Dremio
  dremio:
    platform: linux/x86_64
    image: dremio/dremio-oss:latest
    ports:
      - 9047:9047
      - 31010:31010
      - 32010:32010
      - 45678:45678
    container_name: dremio
    environment:
      - DREMIO_JAVA_SERVER_EXTRA_OPTS=-Dpaths.dist=file:///opt/dremio/data/dist
    networks:
      intro-network:

networks:
  intro-network:
```

### Understanding the Docker Compose File in Depth

This Docker Compose file sets up a multi-service environment that integrates Apache Iceberg, Nessie, Minio, Spark, and Dremio, providing a full hands-on data lakehouse experience. Each service is configured with specific parameters to ensure smooth interoperability between components, and it includes functionality to seed data into Minio and the Spark notebooks. Let's dive deeper into the configuration of each service and how it fits into the broader architecture.

#### 1. **Nessie**

Nessie is our catalog service, responsible for tracking the metadata of Apache Iceberg tables. The configuration for Nessie includes several important settings:

- **Image**: `projectnessie/nessie:latest` pulls the latest Nessie image from Docker Hub.
- **Environment Variables**:
  - `QUARKUS_PROFILE=prod`: Sets the profile to production mode.
  - `QUARKUS_HTTP_PORT=19120`: Configures Nessie's HTTP API to be exposed on port 19120.
  - `QUARKUS_DATASOURCE_DB_KIND=rocksdb`: Nessie uses RocksDB as its internal database to store catalog information.
  - `QUARKUS_DATASOURCE_JDBC_URL=jdbc:rocksdb:file:///nessie/data`: Defines the storage location for the RocksDB database, which is mounted as a volume to persist data across container restarts.
- **Volumes**: The local directory `./nessie-data` is mounted to `/nessie/data` inside the container, ensuring that catalog information is stored persistently.
- **Ports**: Port `19120` is exposed, allowing external tools (like Dremio and Spark) to access Nessie's API for catalog management.
- **Networks**: Nessie is part of the `intro-network`, enabling it to communicate with other services in the Compose setup.

This setup ensures that Iceberg table metadata is cataloged and persists across container lifecycles, allowing tools to query and manage the Iceberg tables effectively.

#### 2. **Minio**

Minio serves as the object storage system in this setup, simulating an S3-like environment to act as the data lake for our Apache Iceberg tables.

- **Image**: `minio/minio` is the latest version of the Minio server.
- **Environment Variables**:
  - `MINIO_ROOT_USER=admin` and `MINIO_ROOT_PASSWORD=password`: These define the credentials for accessing the Minio service.
  - `MINIO_DOMAIN=minio` and `MINIO_REGION_NAME=us-east-1`: Sets up the Minio domain and region, simulating a cloud-based object storage.
- **Ports**:
  - `9000:9000`: Exposes Minio’s S3-compatible API on port 9000.
  - `9001:9001`: Exposes Minio’s web console on port 9001, allowing you to manage your storage via a web interface.
- **Healthcheck**: Ensures that Minio is healthy by testing its liveness endpoint (`http://localhost:9000/minio/health/live`), and retries if needed.
- **Volumes**: The local `./minio-data` directory is mounted into the container as `/minio-data`. This allows you to seed data into the Minio server by placing files in the `./minio-data` folder.
- **Entrypoint**: 
  - Minio's entrypoint script initializes the object storage and creates several buckets (`datalake`, `datalakehouse`, `warehouse`, `seed`).
  - The `mc cp /minio-data/* myminio/seed/` command uploads all data from the `./minio-data` directory into the `seed` bucket in Minio. This provides a straightforward way to seed datasets into your object storage for later use.

Minio’s configuration makes it the core storage layer of the data lakehouse, and by automatically seeding data into it, we streamline the process of making datasets available for analytics.

#### 3. **Spark**

Spark is the processing engine for the environment, handling data transformations and moving data between sources. It also includes a Jupyter notebook for interactive data processing.

- **Image**: `alexmerced/spark35nb:latest` pulls a custom Spark image that includes Jupyter for notebook-based processing.
- **Ports**:
  - `8080:8080` and `8081:8081`: These expose the Spark Master and Worker web UIs, allowing you to monitor job submissions and worker performance.
  - `7077`: This is the Spark Master port used for job submissions.
  - `8888`: This exposes the Jupyter notebook interface, making it easy to run Spark jobs interactively in a notebook environment.
  - `4040-4045`: These ports are reserved for Spark's job UIs, which provide detailed information about running jobs.
  - `18080`: Exposes the Spark History Server, where you can review past jobs and their execution metrics.
- **Environment Variables**:
  - `AWS_ACCESS_KEY_ID=admin` and `AWS_SECRET_ACCESS_KEY=password`: These credentials allow Spark to access Minio's object storage as if it were S3.
  - Other Spark-specific environment variables ensure that Spark runs as a distributed system and can connect to the Minio object store.
- **Volumes**: The local directory `./notebook-seed` is mounted to `/workspace/seed-data` inside the container. This volume contains any data that you want to pre-load into the Spark environment, making it accessible within the Jupyter notebooks for processing.
- **Entrypoint**: 
  - The entrypoint script starts the Spark Master, Worker, and History Server. It also launches Jupyter Lab, providing an interactive environment to run Spark jobs and experiments.
  - The script ensures that the Spark processing engine is always running, ready to handle tasks, and that the notebook interface is accessible.

This Spark setup allows you to run interactive notebooks, process large datasets, and leverage Minio for data storage.

#### 4. **Dremio**

Dremio is the analytics layer of this environment, allowing you to perform SQL-based queries on your data lakehouse. It connects seamlessly to both Minio and Nessie to provide a smooth experience for querying Iceberg tables stored in the object storage.

- **Image**: `dremio/dremio-oss:latest` pulls the latest open-source version of Dremio.
- **Ports**:
  - `9047`: Exposes the Dremio web interface, where users can query datasets and manage the environment.
  - `31010`, `32010`, `45678`: These ports are used for Dremio’s internal services, handling query execution and communication between Dremio components. (31010 for JDBC, 32010 for Arrow Flight)
- **Environment Variables**: 
  - `DREMIO_JAVA_SERVER_EXTRA_OPTS=-Dpaths.dist=file:///opt/dremio/data/dist`: This sets the internal paths for Dremio to ensure it runs correctly in the Docker environment.
- **Networks**: Dremio is connected to the `intro-network`, enabling it to interact with Nessie and Minio for querying Iceberg tables and accessing object storage.

Dremio’s role in this setup is to serve as the query engine for your data lakehouse, allowing you to perform high-performance SQL queries on data stored in Minio and managed by Nessie.

### Seeding Data into Minio and Spark Notebooks

- **Minio**: The `./minio-data` folder on your local machine is mounted to the container and used to seed data into Minio. When the container starts, the `mc cp` command uploads any files in this directory to the `seed` bucket in Minio. This makes your datasets immediately available for querying or processing without needing to manually upload files after the environment is up.
  
- **Spark Notebooks**: Similarly, the `./notebook-seed` directory is mounted into the Spark container at `/workspace/seed-data`. This allows any data placed in the `./notebook-seed` folder to be available within the Jupyter notebook environment, making it easy to start analyzing or transforming data right away.

### Spinning Up and Down the Environment with Docker Compose

Once your Docker Compose file is configured, you can easily spin up and down the entire environment using simple Docker Compose commands. This process launches all the necessary services—Nessie, Minio, Spark, and Dremio—allowing them to work together as a cohesive data lakehouse environment.

#### Spinning Up the Environment

To start the environment, navigate to the directory containing your `docker-compose.yml` file, then run:

```bash
docker-compose up
```

This command will pull the necessary images (if they aren’t already on your machine) and start the services defined in the docker-compose.yml file. Each service will be launched in the background, with all the specified ports, networks, and volumes properly configured.

For additional control over how the environment is started, you can use the following flags:

`- -d` (Detached Mode): This runs the environment in the background, allowing you to continue using your terminal.

```bash
docker-compose up -d
```

In detached mode, you won't see the logs in the terminal, but the services will continue running in the background.

- `--build`: Use this flag to force a rebuild of the images, which is helpful if you've made changes to the Dockerfiles or configurations.

```bash
docker-compose up --build
```

- `--force-recreate`: If you want to ensure that all containers are recreated (even if their configurations haven't changed), you can use this flag.

```bash
docker-compose up --force-recreate
```

#### Spinning Down the Environment
To stop and remove all running services, use the following command:

```bash
docker-compose down
```

This stops the services and removes the associated containers, networks, and volumes. Your data will still be preserved in the mounted volumes, so any changes made to your data (such as in Minio or Nessie) will remain intact the next time you spin up the environment.

You can also use the following flags with docker-compose down:

- `--volumes`: This flag will remove all the associated volumes as well. Use this if you want to completely clean up the environment, including any persisted data in volumes.

```bash
docker-compose down --volumes
```

- `--remove-orphans`: If there are any containers running from previous Compose configurations that aren't defined in the current file, this flag will remove them.

```bash
docker-compose down --remove-orphans
```

#### Checking the Status of the Environment
You can check the status of the running services by using:

```bash
docker-compose ps
```
This command will show the state of each service (whether it’s up or down) and the ports they are mapped to.

#### Viewing Logs
If you want to view the logs of your services while they are running, use:

```bash
docker-compose logs
```
This will output logs for all services. To view logs for a specific service (for example, dremio), use:

```bash
docker-compose logs dremio
```
This allows you to monitor the activity of your environment and troubleshoot any issues that arise.

By using these commands and flags, you can easily manage the lifecycle of your environment, spinning it up for testing or development and shutting it down when you're done, while maintaining control over data persistence and configurations.

## Verifying That the Services Are Running

Once you've spun up the environment using Docker Compose, it's important to check that all the services are running correctly. Below are the steps to ensure that each service is functioning as expected.

### 1. Accessing the Jupyter Notebook Server

Spark is configured to run a Jupyter Notebook interface for interactive data processing. To confirm that the notebook server is running, open your browser and navigate to:

```
http://localhost:8888
```

You should see the JupyterLab interface. Since we configured it without a password, you will have immediate access. Inside the workspace, navigate to the `/workspace/seed-data` folder, where the seeded datasets are available. You can now create a new notebook or open an existing one to interact with the data. Remember where your notebooks are created, as file paths are relative when accessing other files.

### 2. Accessing Dremio and Setting Up Your User Information

Dremio provides the web interface for querying your data lakehouse. Open your browser and navigate to:

```
http://localhost:9047
```

On your first visit, Dremio will prompt you to create an admin user. Follow the steps to set up your user information, such as username, password, and email. Afterward, you’ll land on the Dremio dashboard. From here, you can start configuring Dremio to connect to Nessie and Minio (covered later), and explore the data in your lakehouse through SQL-based queries.

### 3. Accessing Minio and Verifying Buckets

To check that Minio is running and has the correct buckets, visit the Minio console by navigating to:

```
http://localhost:9001
```

Log in using the credentials defined in the Docker Compose file (`admin` for the username and `password` for the password). Once logged in, you should see the following buckets already created:

- `datalake`
- `datalakehouse`
- `warehouse`
- `seed`

These buckets were set up automatically when the Minio service started. The `seed` bucket should contain any data that was placed in the `./minio-data` directory. Verify that the buckets exist, and ensure that your data has been successfully uploaded.

#### 4. Verifying Nessie with a Basic Curl Request

To confirm that the Nessie catalog service is running correctly, you can make a simple `curl` request to its API. Open a terminal and run the following command:

```bash
curl -X GET http://localhost:19120/api/v1/trees
```

This command queries the list of available "trees" (branches or tags) in the Nessie catalog. If Nessie is running properly, you should receive a JSON response that includes information about the default branch, typically called main.

Example response:

```json
{
  "type": "BRANCH",
  "name": "main",
  "hash": "..."
}
```

This confirms that Nessie is responding and ready to track the Iceberg tables you will create.

By completing these steps, you can ensure that all the services—Jupyter, Dremio, Minio, and Nessie—are running smoothly and are ready for use in your data lakehouse environment.

## Ingesting Data into Iceberg with Apache Spark

In this section, we will create a PySpark script that simulates messy sales data and stores it in an Apache Iceberg table managed by the Nessie catalog. The data will contain duplicates and other issues, which we will address later in Dremio. Additionally, since Minio is used for object storage, we will need to inspect the Minio container to get its IP address to configure our storage correctly.

### Step 1: Inspect the Minio Container for IP Address

Before we start writing our PySpark script, we need the Minio service’s IP address to access object storage properly (the docker DNS doesn't always work as expected in referencing the minio container from Spark). Run the following command in your terminal to inspect the Minio container:

```bash
docker inspect minio
```

Look for the "IPAddress" field in the network settings. Once you find the IP address, note it down as you’ll use it to configure your storage URI.

Example:

```json
"IPAddress": "172.18.0.2"
```
We'll use this IP (172.18.0.2) for our Minio URI in our PySpark script.

### Step 2: PySpark Script to Create Iceberg Table with Messy Sales Data

Below is the PySpark code to create a DataFrame with some messy sales data and write it to an Apache Iceberg table stored in Minio and managed by the Nessie catalog.

```python
import pyspark
from pyspark.sql import SparkSession
from pyspark.sql.types import StructType, StructField, IntegerType, StringType, DoubleType
import os

## DEFINE SENSITIVE VARIABLES
CATALOG_URI = "http://nessie:19120/api/v1"  # Nessie Server URI
WAREHOUSE = "s3://warehouse/"               # Minio Address to Write to
STORAGE_URI = "http://172.18.0.2:9000"      # Minio IP address from docker inspect

# Configure Spark with necessary packages and Iceberg/Nessie settings
conf = (
    pyspark.SparkConf()
        .setAppName('sales_data_app')
        # Include necessary packages
        .set('spark.jars.packages', 'org.postgresql:postgresql:42.7.3,org.apache.iceberg:iceberg-spark-runtime-3.5_2.12:1.5.0,org.projectnessie.nessie-integrations:nessie-spark-extensions-3.5_2.12:0.77.1,software.amazon.awssdk:bundle:2.24.8,software.amazon.awssdk:url-connection-client:2.24.8')
        # Enable Iceberg and Nessie extensions
        .set('spark.sql.extensions', 'org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions,org.projectnessie.spark.extensions.NessieSparkSessionExtensions')
        # Configure Nessie catalog
        .set('spark.sql.catalog.nessie', 'org.apache.iceberg.spark.SparkCatalog')
        .set('spark.sql.catalog.nessie.uri', CATALOG_URI)
        .set('spark.sql.catalog.nessie.ref', 'main')
        .set('spark.sql.catalog.nessie.authentication.type', 'NONE')
        .set('spark.sql.catalog.nessie.catalog-impl', 'org.apache.iceberg.nessie.NessieCatalog')
        # Set Minio as the S3 endpoint for Iceberg storage
        .set('spark.sql.catalog.nessie.s3.endpoint', STORAGE_URI)
        .set('spark.sql.catalog.nessie.warehouse', WAREHOUSE)
        .set('spark.sql.catalog.nessie.io-impl', 'org.apache.iceberg.aws.s3.S3FileIO')
)

# Start Spark session
spark = SparkSession.builder.config(conf=conf).getOrCreate()
print("Spark Session Started")

# Define a schema for the sales data
schema = StructType([
    StructField("order_id", IntegerType(), True),
    StructField("customer_id", IntegerType(), True),
    StructField("product", StringType(), True),
    StructField("quantity", IntegerType(), True),
    StructField("price", DoubleType(), True),
    StructField("order_date", StringType(), True)
])

# Create a DataFrame with messy sales data (including duplicates and errors)
sales_data = [
    (1, 101, "Laptop", 1, 1000.00, "2023-08-01"),
    (2, 102, "Mouse", 2, 25.50, "2023-08-01"),
    (3, 103, "Keyboard", 1, 45.00, "2023-08-01"),
    (1, 101, "Laptop", 1, 1000.00, "2023-08-01"),  # Duplicate
    (4, 104, "Monitor", None, 200.00, "2023-08-02"),  # Missing quantity
    (5, None, "Mouse", 1, 25.50, "2023-08-02")  # Missing customer_id
]

# Convert the data into a DataFrame
sales_df = spark.createDataFrame(sales_data, schema)

# Create the "sales" namespace
spark.sql("CREATE NAMESPACE nessie.sales;").show()

# Write the DataFrame to an Iceberg table in the Nessie catalog
sales_df.writeTo("nessie.sales.sales_data_raw").createOrReplace()

# Verify by reading from the Iceberg table
spark.read.table("nessie.sales.sales_data_raw").show()

# Stop the Spark session
spark.stop()
```

Run the Script.

### Walkthrough of the PySpark Code for Creating an Iceberg Table with Nessie Catalog

This PySpark script creates a DataFrame of messy sales data and writes it to an Apache Iceberg table managed by the Nessie catalog. Let's break down the syntax and purpose of each part of the code:

#### 1. Importing Required Libraries

```python
import pyspark
from pyspark.sql import SparkSession
from pyspark.sql.types import StructType, StructField, IntegerType, StringType, DoubleType
import os
```

We start by importing the necessary libraries:

- `pyspark`: The core PySpark library for working with Spark in Python.
- `SparkSession`: Used to configure and initialize the Spark session.
StructType, StructField, and data types (IntegerType, StringType, etc.): These are used to define the schema of our DataFrame.
- `os`: Standard Python library for interacting with the operating system, although not used in this script.

#### 2. Defining Sensitive Variables
```python
CATALOG_URI = "http://nessie:19120/api/v1"  # Nessie Server URI
WAREHOUSE = "s3://warehouse/"               # Minio Address to Write to
STORAGE_URI = "http://172.27.0.3:9000"      # Minio IP address from docker inspect
```

Here, we define a few key variables:

- `CATALOG_URI`: The URL for the Nessie catalog API, which is hosted on port 19120.
- `WAREHOUSE`: The S3-like address that points to the Minio storage location, where Iceberg tables will be stored.
- `STORAGE_URI`: The Minio service’s IP address (found via docker inspect), used to access the Minio object storage.

#### 3. Configuring Spark with Iceberg and Nessie Settings
```python
conf = (
    pyspark.SparkConf()
        .setAppName('sales_data_app')
        # Include necessary packages
        .set('spark.jars.packages', 'org.postgresql:postgresql:42.7.3,org.apache.iceberg:iceberg-spark-runtime-3.5_2.12:1.5.0,org.projectnessie.nessie-integrations:nessie-spark-extensions-3.5_2.12:0.77.1,software.amazon.awssdk:bundle:2.24.8,software.amazon.awssdk:url-connection-client:2.24.8')
        # Enable Iceberg and Nessie extensions
        .set('spark.sql.extensions', 'org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions,org.projectnessie.spark.extensions.NessieSparkSessionExtensions')
        # Configure Nessie catalog
        .set('spark.sql.catalog.nessie', 'org.apache.iceberg.spark.SparkCatalog')
        .set('spark.sql.catalog.nessie.uri', CATALOG_URI)
        .set('spark.sql.catalog.nessie.ref', 'main')
        .set('spark.sql.catalog.nessie.authentication.type', 'NONE')
        .set('spark.sql.catalog.nessie.catalog-impl', 'org.apache.iceberg.nessie.NessieCatalog')
        # Set Minio as the S3 endpoint for Iceberg storage
        .set('spark.sql.catalog.nessie.s3.endpoint', STORAGE_URI)
        .set('spark.sql.catalog.nessie.warehouse', WAREHOUSE)
        .set('spark.sql.catalog.nessie.io-impl', 'org.apache.iceberg.aws.s3.S3FileIO')
)
```
This block configures the Spark session to work with Apache Iceberg and Nessie:

- `Packages`: Specifies the necessary Spark packages, including connectors for PostgreSQL, Iceberg, Nessie, and AWS SDK to interact with S3/Minio.
- `Extensions`: The IcebergSparkSessionExtensions and NessieSparkSessionExtensions are enabled to work with Iceberg and Nessie catalogs within Spark.
- `Nessie Catalog Configuration`: The Nessie catalog is defined using the nessie catalog name, pointing to the CATALOG_URI and using the main reference (branch) in Nessie. The Nessie catalog is implemented using NessieCatalog.
- `Storage Configuration`: The Minio service is set as the S3 endpoint (STORAGE_URI) and the warehouse path is configured for storing Iceberg tables.

#### 4. Starting the Spark Session
```python
spark = SparkSession.builder.config(conf=conf).getOrCreate()
print("Spark Session Started")
```
This line starts the Spark session using the previously defined configuration (conf). The session is the entry point for working with Spark data and accessing the Nessie catalog.

5. Defining the Schema for the Sales Data
```python
schema = StructType([
    StructField("order_id", IntegerType(), True),
    StructField("customer_id", IntegerType(), True),
    StructField("product", StringType(), True),
    StructField("quantity", IntegerType(), True),
    StructField("price", DoubleType(), True),
    StructField("order_date", StringType(), True)
])
```

Here, we define the schema for the sales data. This schema includes fields such as order_id, customer_id, product, quantity, price, and order_date, specifying their data types and whether they can contain null values (the True flag).

#### 6. Creating a DataFrame with Messy Sales Data
```python
sales_data = [
    (1, 101, "Laptop", 1, 1000.00, "2023-08-01"),
    (2, 102, "Mouse", 2, 25.50, "2023-08-01"),
    (3, 103, "Keyboard", 1, 45.00, "2023-08-01"),
    (1, 101, "Laptop", 1, 1000.00, "2023-08-01"),  # Duplicate
    (4, 104, "Monitor", None, 200.00, "2023-08-02"),  # Missing quantity
    (5, None, "Mouse", 1, 25.50, "2023-08-02")  # Missing customer_id
]

sales_df = spark.createDataFrame(sales_data, schema)
```
This section defines a list of tuples representing the sales data. Some rows intentionally contain duplicates and missing values, simulating messy data.

We convert this list into a Spark DataFrame (sales_df) using the schema defined earlier. This DataFrame will be written to an Iceberg table.

#### 7. Creating a Namespace in Nessie
```python
spark.sql("CREATE NAMESPACE nessie.sales;").show()
```

Before writing data to the Nessie catalog, we create a namespace called sales in the Nessie catalog using Spark SQL. The `CREATE NAMESPACE` command allows us to organize tables under a logical grouping, similar to a database schema.

#### 8. Writing the DataFrame to an Iceberg Table in Nessie
```python
sales_df.writeTo("nessie.sales.sales_data_raw").createOrReplace()
```
This line writes the sales_df DataFrame to an Iceberg table called sales_data_raw under the nessie.sales namespace. The createOrReplace() method ensures that if the table already exists, it is replaced with the new data.

#### 9. Verifying the Iceberg Table
```python
spark.read.table("nessie.sales.sales_data_raw").show()
```

We verify that the data has been successfully written to the Iceberg table by reading the table back from the Nessie catalog and displaying the contents.

#### 10. Stopping the Spark Session
```python
spark.stop()
```
Finally, we stop the Spark session to free up resources and end the application.

## Verifying Iceberg Data and Metadata in Minio

Once the sales data has been written to the Apache Iceberg table in the Nessie catalog, we can verify that both the data and metadata files have been successfully created and stored in Minio. Follow the steps below to inspect the structure of the Iceberg table in Minio, and then explore the metadata files directly to understand how Iceberg organizes and manages table metadata.

#### Step 1: Access the Minio UI to Verify Data and Metadata Files

1. Open your browser and navigate to the Minio UI at:

```
http://localhost:9001
```

2. Log in using the credentials defined in the `docker-compose.yml` file:
- **Username**: `admin`
- **Password**: `password`

3. Once logged in, locate the bucket where the Iceberg table is stored (e.g., the `warehouse` bucket).

4. Inside the bucket, you will see a directory structure that represents the Iceberg table. The structure typically includes:
- **Data Files**: These are the physical Parquet files containing the actual data for the table.
- **Metadata Files**: These are JSON files that track the state and evolution of the table, including schema changes, partitions, snapshots, and more.

5. Verify that both data and metadata files have been created for the `nessie.sales.sales_data_raw` table. This confirms that Iceberg has correctly managed both the physical data storage and the metadata needed for table management.

#### Step 2: Create a New Python Notebook to Examine Iceberg Metadata

To better understand how Apache Iceberg structures its metadata, we will now create a new Python notebook in the JupyterLab environment and directly examine the metadata files.

1. **Open the JupyterLab interface**:
- In your browser, navigate to the JupyterLab environment at:

  ```
  http://localhost:8888
  ```

2. **Create a new Python notebook**:
- In the JupyterLab interface, create a new Python notebook to run the following code, which will inspect the metadata files stored in Minio.

3. **Examine the Iceberg Metadata Files**:

The metadata files are stored as JSON in the Iceberg directory structure. Below is an example of Python code you can use to read and examine the content of these metadata files:

```python
import boto3
import json

# Define Minio connection parameters
minio_client = boto3.client(
    's3',
    endpoint_url='http://172.27.0.3:9000',  # Minio IP address from docker inspect
    aws_access_key_id='admin',
    aws_secret_access_key='password',
    region_name='us-east-1'
)

# Specify the bucket and metadata file path
bucket_name = 'warehouse'
metadata_file_key = 'sales/sales_data_raw_a2c0456f-77a6-4121-8d3a-1d8168404edc/metadata/00000-ea121056-0c00-46cb-b9ca-88643d3492cb.metadata.json'  # Example metadata path

# Download the metadata file
metadata_file = minio_client.get_object(Bucket=bucket_name, Key=metadata_file_key)
metadata_content = metadata_file['Body'].read().decode('utf-8')

# Parse and print the metadata content
metadata_json = json.loads(metadata_content)
print(json.dumps(metadata_json, indent=4))
```

This code does the following:

- **Connects to Minio**: Using the boto3 library, it establishes a connection to the Minio service using the credentials (admin and password).
- **Retrieves Metadata File**: It downloads one of the Iceberg metadata files (for example, v1.metadata.json) from the warehouse bucket.
- **Parses and Prints Metadata**: The metadata file is parsed as JSON and displayed in a readable format.

#### Explore the Metadata Structure:

```json
{
    "format-version": 2,
    "table-uuid": "2914be24-fd7d-4b54-bcc0-63edc5e03942",
    "location": "s3://warehouse/sales/sales_data_raw_a2c0456f-77a6-4121-8d3a-1d8168404edc",
    "last-sequence-number": 1,
    "last-updated-ms": 1726146520362,
    "last-column-id": 6,
    "current-schema-id": 0,
    "schemas": [
        {
            "type": "struct",
            "schema-id": 0,
            "fields": [
                {
                    "id": 1,
                    "name": "order_id",
                    "required": false,
                    "type": "int"
                },
                {
                    "id": 2,
                    "name": "customer_id",
                    "required": false,
                    "type": "int"
                },
                {
                    "id": 3,
                    "name": "product",
                    "required": false,
                    "type": "string"
                },
                {
                    "id": 4,
                    "name": "quantity",
                    "required": false,
                    "type": "int"
                },
                {
                    "id": 5,
                    "name": "price",
                    "required": false,
                    "type": "double"
                },
                {
                    "id": 6,
                    "name": "order_date",
                    "required": false,
                    "type": "string"
                }
            ]
        }
    ],
    "default-spec-id": 0,
    "partition-specs": [
        {
            "spec-id": 0,
            "fields": []
        }
    ],
    "last-partition-id": 999,
    "default-sort-order-id": 0,
    "sort-orders": [
        {
            "order-id": 0,
            "fields": []
        }
    ],
    "properties": {
        "owner": "root",
        "write.metadata.delete-after-commit.enabled": "false",
        "gc.enabled": "false",
        "write.parquet.compression-codec": "zstd"
    },
    "current-snapshot-id": 8859389821243348049,
    "refs": {
        "main": {
            "snapshot-id": 8859389821243348049,
            "type": "branch"
        }
    },
    "snapshots": [
        {
            "sequence-number": 1,
            "snapshot-id": 8859389821243348049,
            "timestamp-ms": 1726146520362,
            "summary": {
                "operation": "append",
                "spark.app.id": "local-1726146494182",
                "added-data-files": "6",
                "added-records": "6",
                "added-files-size": "10183",
                "changed-partition-count": "1",
                "total-records": "6",
                "total-files-size": "10183",
                "total-data-files": "6",
                "total-delete-files": "0",
                "total-position-deletes": "0",
                "total-equality-deletes": "0"
            },
            "manifest-list": "s3://warehouse/sales/sales_data_raw_a2c0456f-77a6-4121-8d3a-1d8168404edc/metadata/snap-8859389821243348049-1-b395c768-1348-4f50-a762-8033fe417915.avro",
            "schema-id": 0
        }
    ],
    "statistics": [],
    "partition-statistics": [],
    "snapshot-log": [
        {
            "timestamp-ms": 1726146520362,
            "snapshot-id": 8859389821243348049
        }
    ],
    "metadata-log": []
}
```

The metadata JSON file contains important information about the table, including:
- **Schema**: Defines the structure of the table (columns, types, etc.).
- **Snapshots**: Lists all snapshots of the table, which track historical versions of the data.
- **Partition Information**: Details about how the table is partitioned, if applicable.
By examining this metadata, you can gain insight into how Apache Iceberg tracks the state of the table, manages schema evolution, and supports features like time travel and partitioning.

#### Step 3: Analyze and Understand Iceberg Metadata
By exploring the Iceberg metadata files directly, you’ll see how Iceberg provides detailed information about your table’s state and changes over time. This metadata-driven architecture allows Iceberg to efficiently manage large datasets in a data lake, enabling advanced features such as:

- **Schema Evolution**: Support for adding, dropping, or modifying columns without downtime.
- **Partitioning**: Efficient querying of partitioned data for performance optimization.
- **Snapshots and Time Travel**: Ability to roll back or query previous versions of the table.
This deep integration of data and metadata makes Iceberg a powerful table format for modern data lakehouse architectures.

## Confirming Nessie is Tracking the Iceberg Table with Curl Commands

Now that we have created the `sales_data_raw` table in Apache Iceberg, it’s important to confirm that the Nessie catalog is properly tracking this table. We can use a series of `curl` commands to interact with the Nessie REST API and verify that the catalog has recorded the new table in the appropriate namespace.

### Step 1: List All Available Branches

First, let's confirm that we are working with the correct reference (branch). Nessie uses Git-like versioning, so tables are tracked within branches. To list the branches, run the following command:

```bash
curl -X GET "http://localhost:19120/api/v1/trees"
```

This command retrieves all available branches in the Nessie catalog. You should see a response that includes the main branch, where your sales_data_raw table is stored.

Example response:

```json
{
  "type": "BRANCH",
  "name": "main",
  "hash": "abcdef1234567890"
}
```

#### Step 2: List All Tables in the sales Namespace
Next, let’s verify that the sales_data_raw table exists in the nessie.sales namespace. Use the following curl command to list all entries in the sales namespace:

```bash
curl -X GET "http://localhost:19120/api/v1/contents/nessie.sales?ref=main"
```

This command will list all tables or objects in the nessie.sales namespace, on the main branch. You should see a response that includes the sales_data_raw table:

Example response:

```json
{
  "sales_data_raw": {
    "type": "ICEBERG_TABLE",
    "metadataLocation": "s3://warehouse/nessie/sales/sales_data_raw/metadata/v1.metadata.json"
  }
}
```

This confirms that the sales_data_raw table is tracked in the sales namespace, and the response includes the path to the Iceberg metadata file.

### Step 3: Retrieve Specific Metadata for the sales_data_raw Table
To get more detailed information about the sales_data_raw table, such as its metadata location and schema, run the following command:

```bash
curl -X GET "http://localhost:19120/api/v1/contents/nessie.sales.sales_data_raw?ref=main"
```

This command queries the specific entry for the sales_data_raw table. The response will include metadata such as the table’s schema, partitioning, and snapshot information.

Example response:

```json
{
  "type": "ICEBERG_TABLE",
  "metadataLocation": "s3://warehouse/nessie/sales/sales_data_raw/metadata/v1.metadata.json",
  "snapshotId": "1234567890abcdef",
  "schema": {
    "fields": [
      {"name": "order_id", "type": "int"},
      {"name": "customer_id", "type": "int"},
      {"name": "product", "type": "string"},
      {"name": "quantity", "type": "int"},
      {"name": "price", "type": "double"},
      {"name": "order_date", "type": "string"}
    ]
  }
}
```

This response provides detailed information about the sales_data_raw table, including its metadata location and schema. You can use this information to verify that the table has been correctly tracked and is ready for querying in Dremio or Spark.

### Step 4: List All Snapshots for the sales_data_raw Table
Nessie and Iceberg support snapshotting, which allows you to track the evolution of a table over time. To list all snapshots for the sales_data_raw table, run:

```bash
curl -X GET "http://localhost:19120/api/v1/tables/nessie.sales.sales_data_raw/refs/main/snapshots"
```

This command retrieves all snapshots of the table, allowing you to see previous versions and track how the table has changed. If snapshots are available, the response will include the snapshot ID, timestamp, and other relevant information.

Example response:

```json
[
  {
    "snapshotId": "1234567890abcdef",
    "timestamp": 1694653200000,
    "summary": {
      "operation": "append",
      "addedFiles": 1,
      "addedRecords": 1000
    }
  }
]
```

This response shows the details of the latest snapshot, including the number of records and files added.

### Step 5: Verify the Table's Current Reference (Optional)
If you want to verify that the table's current state matches the latest commit or branch reference, you can use the following command to check the state of the main branch:

```bash
curl -X GET "http://localhost:19120/api/v1/trees/main"
```

This command retrieves the latest commit on the main branch, including the hash. You can use this to ensure that the table’s current state is up to date with the latest commits.

## Connecting Nessie and Minio as Sources in Dremio

Now that we've confirmed that our Apache Iceberg table is being tracked by the Nessie catalog, it's time to connect Dremio to both Nessie and Minio so we can query the data and clean it up into more usable formats (Silver and Gold views). Dremio will allow us to access the raw data stored in Minio and transform it into higher-quality data, generating useful metrics from this process.

### Step 1: Adding the Nessie Source in Dremio

1. **Open Dremio**: Open your browser and navigate to the Dremio UI at:

```
http://localhost:9047
```


2. **Add a Nessie Source**:
- Click on the **“Add Source”** button in the bottom left corner of the Dremio interface.
- Select **Nessie** from the list of available sources.

3. **Configure the Nessie Source**:
There are two sections to fill out: **General** and **Storage Settings**.

- **General Settings (Connecting to the Nessie Server)**:
  - **Name**: Set the source name to `nessie`.
  - **Endpoint URL**: Enter the Nessie API endpoint URL as:

    ```
    http://nessie:19120/api/v2
    ```

  - **Authentication**: Set this to `None`.

- **Storage Settings**:
  - **Access Key**: Set this to `admin` (Minio username).
  - **Secret Key**: Set this to `password` (Minio password).
  - **Root Path**: Set this to `warehouse` (this is the bucket where our Iceberg tables are stored).
  - **Connection Properties**:
    - Set `fs.s3a.path.style.access` to `true`.
    - Set `fs.s3a.endpoint` to `minio:9000`.
    - Set `dremio.s3.compat` to `true`.
  - **Encrypt Connection**: Uncheck this option (since we are running Nessie locally on HTTP).

4. **Save the Source**: After filling out all the settings, click **Save**. The Nessie source will now be connected to Dremio, and you will be able to browse the tables stored in the Nessie catalog.

### Step 2: Adding Minio (Seed Bucket) as an S3 Source in Dremio

1. **Add an S3 Source**:
- Click on the **“Add Source”** button again and select **S3** from the list of sources.

2. **Configure the S3 Source for Minio**:

- **General Settings**:
  - **Name**: Set the source name to `seed`.
  - **Credentials**: Select **AWS access key**.
  - **Access Key**: Set to `admin` (Minio username).
  - **Secret Key**: Set to `password` (Minio password).
  - **Encrypt Connection**: Uncheck this option (since Minio is running locally).

- **Advanced Options**:
  - **Enable Compatibility Mode**: Set to `true` (to ensure compatibility with Minio).
  - **Root Path**: Set to `/seed` (this is where the seed data files are located in Minio).

- **Connection Properties**:
  - Set `fs.s3a.path.style.access` to `true`.
  - Set `fs.s3a.endpoint` to `minio:9000`.

3. **Save the Source**: After entering the configuration details, click **Save**. The `seed` bucket is now accessible in Dremio, and you can query the raw data stored in this bucket.

### Step 3: Cleaning the Raw Data into a Silver View

Now that both sources are connected, we can begin cleaning up the raw sales data stored in the Iceberg table. In Dremio, you can create a **Silver view**, which is a cleaned-up version of the raw data.

1. **Query the Raw Data**:
- Navigate to the Nessie source in Dremio.
- Locate the `sales_data_raw` table in the `nessie.sales` namespace.
- Right-click on the table and choose **New Query**.

2. **Clean the Data**:
In the SQL editor, you can clean the raw data by removing duplicates, fixing missing values, and standardizing the data. Here's an example of a SQL query to clean the sales data:

```sql
SELECT DISTINCT
  COALESCE(order_id, 0) AS order_id,
  COALESCE(customer_id, 0) AS customer_id,
  product,
  COALESCE(quantity, 1) AS quantity,
  price,
  order_date
FROM nessie.sales.sales_data_raw
WHERE customer_id IS NOT NULL
```

- COALESCE is used to fill in missing values with default values (e.g., order_id and customer_id are set to 0 if missing).
- DISTINCT removes duplicate rows from the dataset.
- WHERE customer_id IS NOT NULL filters out rows with missing customer_id.

##### Save the Query as a Silver View:
- After running the query, click on Save As and save this cleaned-up dataset as a Silver view.
- Name the view sales_data_silver, and choose the location under the Nessie catalog.

### Step 4: Generating Metrics from the Silver View (Gold Metrics)
With the Silver view cleaned up, we can now generate "Gold" metrics—higher-level aggregated data that provides business insights.

#### Create a New Query on the Silver View:

- Right-click on the sales_data_silver view and select New Query.

- Generate Gold Metrics: In this query, we can calculate metrics such as total sales, average order value, and total sales by product:

```sql
SELECT
  product,
  COUNT(order_id) AS total_orders,
  SUM(quantity) AS total_quantity_sold,
  SUM(quantity * price) AS total_sales,
  AVG(quantity * price) AS avg_order_value
FROM nessie.sales.sales_data_silver
GROUP BY product
```

This query generates the following metrics:

- Total Orders: The number of orders per product.
- Total Quantity Sold: The total quantity of each product sold.
- Total Sales: The total revenue generated by each product.
- Average Order Value: The average value of each order for each product.

Save the Query as a Gold View:

- After running the query, save the results as a Gold view.
- Name this view sales_data_gold, and store it in the Nessie catalog.

### Step 5: Visualizing Metrics and Insights
Once you have the Gold view ready, you can use Dremio's BI Tool integrations or export the data to BI tools like Apache Superset, Tableau or Power BI for further analysis. You now have clean, aggregated data (Silver and Gold views) ready for generating valuable insights and reporting.

This process demonstrates how to transform raw, messy data into clean, structured views and meaningful metrics using Apache Iceberg, Nessie, Minio, and Dremio.

## Accessing Data in Dremio: BI Tool Integrations, REST API, JDBC/ODBC, and Apache Arrow Flight

Dremio provides multiple ways to access your data, ensuring flexibility whether you're a data analyst using BI tools, a developer working with APIs, or a data scientist using Python notebooks. Here’s an overview of the different access methods available with Dremio.

### BI Tool Integrations

Dremio integrates seamlessly with popular BI tools such as Tableau, Power BI, and Qlik. These tools can connect to Dremio using either JDBC or ODBC drivers, allowing analysts to directly query data in the data lakehouse without needing to move the data into a traditional data warehouse. With these integrations, you can build dashboards, visualizations, and reports on top of Dremio's unified data access layer.

To connect your BI tool to Dremio:
- **Tableau**: Use the Dremio JDBC driver to connect, configure your data source, and start building dashboards.
- **Power BI**: Connect via the Dremio ODBC driver to query your Dremio datasets for report generation.

### REST API

Dremio’s REST API allows developers to interact programmatically with the Dremio platform. You can execute queries, manage datasets, and control various aspects of your Dremio instance through HTTP requests. This is especially useful for building custom applications or automation workflows.

Example:
- To authenticate and retrieve a token, you can use the `/login` endpoint with a payload containing your credentials.
- Once authenticated, you can submit queries to Dremio using the `/sql` endpoint, or manage sources and reflections through the API.

### JDBC/ODBC

For integration with more traditional analytics workflows, Dremio provides both JDBC and ODBC drivers. These drivers enable you to connect to Dremio from a wide range of applications, such as SQL clients, BI tools, and custom applications, to query data using SQL.

- **JDBC**: A common driver used in Java-based applications.
- **ODBC**: Useful for applications like Excel and other non-Java-based systems that support ODBC connections.

### Apache Arrow Flight

Arrow Flight is an optimized protocol for transferring large datasets across networks efficiently using Apache Arrow. Dremio’s Arrow Flight interface allows high-performance data access directly into memory, enabling tools like Python, R, or any Arrow-enabled environment to query data from Dremio with very low latency.

Arrow Flight is particularly useful for:
- Fast data retrieval for analytics or machine learning.
- Working with large datasets in memory for interactive notebooks or custom applications.

### Accessing Data in Jupyter Notebooks with `dremio-simple-query`

If you're working in Python notebooks, Dremio can be accessed using the `dremio-simple-query` library, which simplifies querying Dremio via Arrow Flight. This allows for high-performance querying and direct data manipulation in popular libraries like **Polars** and **Pandas**.

Let’s walk through a practical example of querying the Gold dataset (`sales_data_gold`) in Dremio and visualizing the results using `Polars` and `Seaborn`.

### Step 1: Setup the Dremio Connection in Python

Assuming that you have **Polars**, **Seaborn**, and **dremio-simple-query** installed in your environment (which is the case with our particular environment), you can start by setting up the Dremio connection.

```python
from dremio_simple_query.connect import get_token, DremioConnection
import polars as pl
import seaborn as sns
import matplotlib.pyplot as plt

# Dremio login details
login_endpoint = "http://dremio:9047/apiv2/login"
payload = {
    "userName": "admin",  # Dremio username
    "password": "password"  # Dremio password
}

# Get the token
token = get_token(uri=login_endpoint, payload=payload)

# Dremio Arrow Flight endpoint (no SSL for local setup)
arrow_endpoint = "grpc://dremio:32010"

# Create the connection
dremio = DremioConnection(token, arrow_endpoint)
Step 2: Query the Gold Dataset (sales_data_gold)
Next, we'll query the sales_data_gold dataset from Dremio using the toPolars() method to return the data in a Polars DataFrame.

python
Copy code
# Query the Gold dataset
query = "SELECT * FROM nessie.sales.sales_data_gold;"
df = dremio.toPolars(query)

# Display the Polars DataFrame
print(df)
Step 3: Visualize the Data with Seaborn
Using the queried data, we can now visualize key metrics. In this example, we'll plot total sales by product.

python
Copy code
# Convert the Polars DataFrame to a Pandas DataFrame for Seaborn visualization
df_pandas = df.to_pandas()

# Create a bar plot of total sales by product
sns.barplot(data=df_pandas, x="product", y="total_sales", palette="viridis")
plt.title("Total Sales by Product")
plt.xlabel("Product")
plt.ylabel("Total Sales")
plt.xticks(rotation=45)
plt.show()
```

### Step 4: Explanation of Query and Visualization
In this example:

- **Step 1**: We use the dremio-simple-query library to establish a connection to Dremio using the Arrow Flight protocol. This ensures high-speed data retrieval directly into memory.
- **Step 2**: We query the sales_data_gold table, which contains aggregated sales metrics, and load the data into a Polars DataFrame.
- **Step 3**: The data is converted into a Pandas DataFrame (for compatibility with Seaborn), and a simple bar plot is created to visualize total sales per product.

### Benefits of Arrow Flight for Data Access
- **High Performance**: By using Apache Arrow Flight, you can retrieve large datasets from Dremio into your local environment much faster than traditional methods like JDBC/ODBC.
- **In-Memory Processing**: The data is transferred as Arrow tables, which can be efficiently processed in memory by tools like Polars, Pandas, and DuckDB.
- **Easy Integration with Python**: With libraries like dremio-simple-query, accessing and visualizing Dremio data in Python notebooks becomes straightforward, enabling faster iterations for data analysis and experimentation.

By combining Dremio’s Arrow Flight capabilities with powerful Python libraries, you can build high-performance, interactive data analysis workflows directly from your Jupyter notebooks, making it easy to transform and visualize your datasets on the fly.

## Conclusion

Apache Iceberg and the Data Lakehouse architecture are revolutionizing the way organizations manage and analyze large-scale data. By decoupling storage, table formats, catalogs, and query engines, the lakehouse model combines the flexibility of data lakes with the powerful management features of data warehouses. In this blog, we’ve explored the technologies that enable the lakehouse paradigm, such as **Minio** for object storage, **Apache Iceberg** for ACID-compliant table formats, **Nessie** for catalog versioning, **Apache Spark** for distributed data processing, and **Dremio** for fast, SQL-based analytics.

We’ve walked through the steps of setting up a complete data lakehouse environment on your laptop using **Docker Compose**, integrating these technologies into a cohesive system that demonstrates how they work together. From ingesting raw data into Apache Iceberg, to querying and cleaning it in Dremio, and finally generating valuable business metrics, you now have the tools and knowledge to build, explore, and scale your own data lakehouse.

With powerful integrations like **Arrow Flight** for high-performance data access and flexible options for querying and visualizing your data, the Data Lakehouse model empowers data teams to handle increasingly complex and large-scale datasets, unlocking the full potential of modern analytics.

This hands-on guide is just the beginning—feel free to experiment with different datasets, configurations, and optimizations to see how this powerful architecture can meet your unique data needs. Whether you're running analytics or building scalable data pipelines, the lakehouse architecture provides the flexibility and performance required for the data-driven future.


- [Apache Iceberg 101](https://www.dremio.com/lakehouse-deep-dives/apache-iceberg-101/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=introiceberg&utm_content=alexmerced&utm_term=external_blog)
- [Hands-on Intro with Apache iceberg](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=introiceberg&utm_content=alexmerced&utm_term=external_blog)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=introiceberg&utm_content=alexmerced&utm_term=external_blog)
- [Free Copy Of Apache Iceberg: The Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=introiceberg&utm_content=alexmerced&utm_term=external_blog)
