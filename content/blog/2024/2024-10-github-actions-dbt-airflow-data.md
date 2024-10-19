---
title: A Deep Dive Into GitHub Actions From Software Development to Data Engineering
date: "2024-10-19"
description: "Advanced GitHub Actions for Data Engineering"
author: "Alex Merced"
category: "DevOps"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - devOps
  - Continuous Integration
  - Continuous Deployment
---

- [Free Copy of Apache Iceberg the Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=githubactionsairflow)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=githubactionsairflow)
- [Iceberg Lakehouse Engineering Video Playlist](https://www.youtube.com/watch?v=SIriNcVIGJQ&list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe)

Maintaining a persistent Airflow deployment can often add significant overhead to data engineering teams, especially when orchestrating tasks across diverse systems. While Airflow is a powerful orchestration tool, the infrastructure required to keep it running 24/7 may not always be necessary, particularly for workflows that can be triggered on demand.

In this blog, we'll explore how to use **GitHub Actions** as a lightweight alternative to trigger **Airflow DAGs**. By leveraging GitHub Actions, we avoid the need for a persistent Airflow deployment while still orchestrating complex data pipelines across external systems like **Apache Spark**, **Dremio**, and **Snowflake**.

The example we'll walk through involves:
- Ingesting raw data into a data lake with Spark,
- Using **Dremio** and **dbt** to create bronze, silver, and gold layers for your data without data replication,
- Accelerating access to the gold layer using **Dremio Reflections**, and
- Ingesting the final gold-layer data into **Snowflake** for further analysis.

This approach allows you to curate data efficiently while reducing operational complexity, making it ideal for teams looking to streamline their data orchestration without sacrificing flexibility or performance.

## Why Trigger Airflow with GitHub Actions?

Orchestrating workflows with Airflow traditionally requires a persistent deployment, which often involves setting up infrastructure, managing resources, and ensuring uptime. While this makes sense for teams running continuous or complex pipelines, it can become an unnecessary overhead for more straightforward, on-demand workflows.

**GitHub Actions** offers an elegant alternative, providing a lightweight and flexible way to trigger workflows directly from your version-controlled repository. Instead of maintaining an Airflow instance 24/7, you can set up GitHub Actions to trigger the execution of your Airflow DAGs only when necessary, leveraging cloud resources efficiently.

Here’s why this approach is beneficial:
- **Reduced Infrastructure Overhead**: By running Airflow in an ephemeral environment triggered by GitHub Actions, you eliminate the need to manage a persistent Airflow deployment.
- **Version Control Integration**: Since GitHub Actions is tightly coupled with your repository, any code changes to your DAGs, dbt models, or other workflows can seamlessly trigger orchestration tasks.
- **Cost Efficiency**: You only spin up resources when necessary, optimizing cloud costs and avoiding expenses tied to idle infrastructure.
- **Flexibility**: GitHub Actions can integrate with a variety of external systems such as Apache Spark, Dremio, and Snowflake, allowing you to trigger specific data tasks from ingestion to transformation and loading.

With GitHub Actions, your Airflow DAGs become an extension of your repository, enabling streamlined and automated data orchestration with minimal setup.

## Setting up GitHub Actions to Trigger Airflow DAGs

To trigger Airflow DAGs using GitHub Actions, we need to create a workflow that runs an Airflow instance inside a Docker container, executes the DAG, and then cleans up after the job is complete. This approach avoids maintaining a persistent Airflow deployment while still enabling orchestration across different systems.

### Step 1: Define Your Airflow DAG

First, ensure your Airflow DAG is defined within your repository. The DAG will contain tasks that handle each stage of your pipeline, from data ingestion with Spark to data transformation with Dremio and loading into Snowflake. Here's an example of a simple Airflow DAG definition:

```python
from airflow import DAG
from airflow.operators.dummy_operator import DummyOperator
from airflow.operators.python_operator import PythonOperator
from datetime import datetime

def run_spark_job():
    # Logic for running the Spark job
    pass

def run_dbt_task():
    # Logic for running dbt transformations in Dremio
    pass

def load_into_snowflake():
    # Logic for loading the gold layer into Snowflake
    pass

dag = DAG('example_dag', description='A sample DAG',
          schedule_interval='@once', start_date=datetime(2024, 10, 1), catchup=False)

start = DummyOperator(task_id='start', dag=dag)
spark_task = PythonOperator(task_id='run_spark_job', python_callable=run_spark_job, dag=dag)
dbt_task = PythonOperator(task_id='run_dbt_task', python_callable=run_dbt_task, dag=dag)
snowflake_task = PythonOperator(task_id='load_into_snowflake', python_callable=load_into_snowflake, dag=dag)

start >> spark_task >> dbt_task >> snowflake_task
```

### Step 2: Create a GitHub Actions Workflow
Next, you'll define a GitHub Actions workflow that will be triggered when certain conditions are met (e.g., a pull request or a scheduled run). This workflow will launch an ephemeral Airflow environment, execute the DAG, and then shut down the environment.

Here’s an example of a GitHub Actions workflow file (`.github/workflows/trigger-airflow.yml`):

```yaml
name: Trigger Airflow DAG

on:
  push:
    branches:
      - main

jobs:
  trigger-airflow:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Set up Docker
        uses: docker/setup-buildx-action@v2

      - name: Start Airflow with Docker
        run: |
          docker-compose up -d  # Start Airflow containers defined in a docker-compose.yml file

      - name: Trigger Airflow DAG
        run: |
          docker exec -ti <airflow-webserver-container> airflow dags trigger example_dag

      - name: Clean up
        run: |
          docker-compose down  # Stop and remove Airflow containers
```

### Step 3: Docker Compose for Airflow
You’ll also need a `docker-compose.yml` file in your repository to define how to launch Airflow in a containerized environment:

```yaml
version: '3'
services:
  postgres:
    image: postgres:13
    environment:
      POSTGRES_USER: airflow
      POSTGRES_PASSWORD: airflow
      POSTGRES_DB: airflow
  webserver:
    image: apache/airflow:2.5.1
    environment:
      - AIRFLOW__CORE__SQL_ALCHEMY_CONN=postgresql+psycopg2://airflow:airflow@postgres/airflow
    ports:
      - "8080:8080"
    depends_on:
      - postgres
```

With this setup, the Airflow instance will run only when triggered by GitHub Actions, allowing you to execute your DAG tasks without maintaining a permanent deployment.

### Step 4: Automating and Monitoring
After your workflow is triggered, GitHub Actions will orchestrate the process of starting Airflow, executing the DAG, and cleaning up. You can monitor the status of your DAGs and tasks directly within the GitHub Actions interface, making it easy to track your pipeline’s progress.

## Ingesting Data into Your Lake with Apache Spark

The first step in our pipeline is ingesting raw data into a data lake using **Apache Spark**. Spark, as a distributed computing engine, excels at handling large-scale data ingestion tasks, making it a popular choice for data engineering workflows. In this setup, rather than running Spark locally or within Docker containers, we’ll configure our Airflow DAG to submit PySpark jobs to a **remote Spark cluster**. This cluster can be independently deployed or managed by services like **AWS EMR** or **Databricks**.

Once triggered, the PySpark job will read raw data from an external source (such as a cloud storage service or database) and write the processed data into the data lake.

#### Step 1: Configuring the Airflow Task for Spark Ingestion

In the Airflow DAG, we define a task that submits a PySpark job to the remote Spark cluster. The code will use the PySpark library to establish a connection to the remote Spark master, perform data ingestion, and write the results into the data lake.

Here’s an example of the `run_spark_job` function that sends the Spark job to a remote cluster:

```python
def run_spark_job():
    # Example of a Spark job for data ingestion
    from pyspark.sql import SparkSession

    # Connect to a remote Spark cluster (e.g., AWS EMR, Databricks)
    spark = SparkSession.builder \
        .master("spark://<remote-spark-master>:7077") \
        .appName("DataIngestion") \
        .getOrCreate()

    # Read data from an external source (e.g., S3 bucket)
    raw_data = spark.read.format("csv").option("header", "true").load("s3://my-bucket/raw-data")

    # Write the data to the "bronze" layer of the data lake in Parquet format
    raw_data.write.format("parquet").save("s3://my-data-lake/bronze/raw_data")

    # Stop the Spark session
    spark.stop()
```
In this example:

- **Connection to the Remote Cluster:** The master argument specifies the Spark master URL for your remote Spark cluster. This could be the endpoint of an AWS EMR cluster, Databricks, or a standalone Spark cluster.
- **Data Ingestion:** The task reads raw data from an external source (e.g., an S3 bucket) using Spark's read API and writes it in a columnar format (Parquet) to the bronze layer of the data lake.

### Step 2: Configuring Remote Spark Cluster Access
Since we are submitting Spark jobs to a remote cluster, it's crucial that your Airflow tasks have the correct information about the Spark cluster. This configuration includes specifying the Spark master URL, cluster authentication details (if required), and any additional Spark configuration needed for interacting with the cluster (e.g., access keys for cloud storage).

- **For AWS EMR:** You would configure Airflow to submit Spark jobs via the EMR cluster's master node. Make sure to use the appropriate security settings and AWS credentials for accessing S3 and interacting with the EMR cluster.

- **For Databricks:** Use the Databricks REST API to submit Spark jobs, or configure the Spark session to interact with Databricks directly.

Here’s how you can adjust the Spark connection in Airflow for AWS EMR:

```python
spark = SparkSession.builder \
    .master("yarn") \
    .config("spark.yarn.access.hadoopFileSystems", "s3://<my-s3-bucket>") \
    .appName("DataIngestion") \
    .getOrCreate()
```

For Databricks, you might use:

```python
spark = SparkSession.builder \
    .master("databricks") \
    .config("spark.databricks.service.token", "<your-databricks-token>") \
    .getOrCreate()
```

### Step 3: Automating Spark Job Submission via Airflow

Once your Airflow DAG is configured to submit PySpark jobs to the remote cluster, the workflow can be triggered automatically based on events such as code changes or data availability. Airflow will take care of scheduling and running the task, ensuring that your PySpark job is executed at the right time.

### Key Benefits of Using a Remote Spark Cluster:

- **Scalability:** By offloading the job to a remote Spark cluster, you take advantage of its distributed nature, enabling large-scale data ingestion and processing.
- **Flexibility:** Spark can handle a wide range of data formats (CSV, JSON, Parquet) and data sources (databases, cloud storage).

- **Managed Infrastructure:** When using managed services like AWS EMR or Databricks, you don't need to manage and maintain the Spark cluster yourself, reducing operational overhead.
With the data successfully ingested into the bronze layer of your data lake, the next step in your pipeline is to transform and curate this data using other tools such as Dremio and dbt.

_note: For smaller scale data where you may not want to to manage a Spark cluster, consider using the alexmerced/spark35nb to run Spark at a container within your github actions enviroment_

## Creating Bronze/Silver/Gold Views in Dremio with dbt

After ingesting data into the **bronze** layer of your data lake using Spark, the next step is to curate and organize the data into **silver** and **gold** layers. This involves transforming raw data into cleaned, enriched datasets and ultimately into the most refined, ready-for-analysis forms. To avoid data duplication, we’ll leverage **Dremio**'s virtual datasets and **dbt** for managing these transformations, while **Dremio Reflections** will accelerate queries on the gold layer.

[Resources on using Dremio with dbt](https://www.dremio.com/blog/value-of-dbt-with-dremio/?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=githubactionsairflow)

#### Step 1: Defining Bronze, Silver, and Gold Layers

- **Bronze**: Raw, unprocessed data that’s ingested into the lake (as achieved in the previous Spark ingestion step).
- **Silver**: Cleaned and partially processed data, prepared for business analysis.
- **Gold**: Fully transformed, aggregated data ready for reporting and advanced analytics.

Using **Dremio**’s virtual datasets allows you to define each of these layers without physically copying data. Dremio provides a powerful semantic layer on top of your data lake, which, combined with dbt’s SQL-based transformations, enables easy curation of these layers.

#### Step 2: Configuring dbt to Transform Data in Dremio

We’ll use dbt (data build tool) to define the transformations that move data from the bronze layer to the silver and gold layers. This is done using SQL models in dbt, and Dremio acts as the engine that executes these transformations.

Example dbt model for transforming bronze to silver:

```sql
-- models/silver_layer.sql
WITH bronze_data AS (
  SELECT *
  FROM my_lake.bronze.raw_data
)
SELECT 
  customer_id,
  order_date,
  total_amount,
  -- Additional transformations
  CASE 
    WHEN total_amount > 100 THEN 'high_value'
    ELSE 'regular'
  END AS customer_value_category
FROM bronze_data
WHERE order_status = 'completed';
```

This model:

- Reads data from the bronze layer.
- Applies basic filtering and transformations.
- Outputs a cleaned dataset for the silver layer.

### Step 3: Creating Virtual Views for Bronze, Silver, and Gold
In Dremio, dbt creates virtual datasets (views), meaning the data is not physically replicated at each stage of the pipeline. Instead, you define logical views that can be queried as needed. This reduces the need for storage while still allowing for efficient querying of each layer.

In your Airflow DAG, you can add a task to trigger dbt transformations:

```python
def run_dbt_task():
    import subprocess
    # Run the dbt transformation
    subprocess.run(["dbt", "run"], check=True)
```

This Airflow task will run the dbt transformation, applying changes to your Dremio virtual datasets, curating the data from bronze to silver, and then from silver to gold. _(Note: Make sure your dbt project is copied to  your Airflow environment, and that the dbt command is run in the directory where your dbt project is located.)_

### Step 4: Accelerating Queries with Dremio Reflections
To ensure fast access to the gold layer, you can enable Dremio Reflections. Reflections are Dremio’s optimization mechanism that pre-computes and caches the results of expensive queries, significantly improving query performance on large datasets.

In your pipeline, after creating the gold layer with dbt, configure Dremio to create an Incremental Reflection on the gold layer dataset:

```sql
ALTER TABLE my_lake.gold_data
  CREATE RAW REFLECTION gold_accelerator USING DISPLAY (id,lastName,firstName,address,country)
    PARTITION BY (country)
    LOCALSORT BY (lastName);
```
This ensures that queries on the gold layer are accelerated, reducing response times and improving the performance of downstream analytics tasks.

### Step 5: Automating the Transformation Process
Assuming the dbt job is part of your Airflow DAG, you can automate the transformation process by scheduling the dbt job to run when the Airflow Dag runs based on your Github Actions workflow. This ensures that your data is always up-to-date and ready for analysis.

### Why Use dbt and Dremio for Data Transformation?

- **Data Virtualization:** Dremio’s virtual datasets allow you to define and query data layers without physically copying data.
- **Transformation Management:** dbt’s SQL-based transformation framework simplifies defining and maintaining transformations between data layers.
- **Performance Boost:** Dremio Reflections enable fast querying of curated data, making the process efficient for reporting and analytics.

With the gold layer now refined and optimized for fast querying. While you can run AI/ML and BI workloads directly from Dremio, you may still want some of your gold datasets in your data warehouse so the final step is to load this data into Snowflake for further business analysis.

## Ingesting the Gold Layer into Snowflake via Dremio and Apache Arrow Flight

In this section, we’ll demonstrate how to ingest the **gold layer** from **Dremio** into **Snowflake** using **Apache Arrow Flight** and the **dremio-simple-query** library. This method allows you to efficiently fetch large datasets from Dremio using Arrow Flight, convert them into a Pandas DataFrame, and load the results into Snowflake. This approach allows us to maxmize our leveraging of fast data retrieval from Dremio to feed pre-curated data into Snowflake for further analysis.

#### Step 1: Configuring the Airflow Task for Data Retrieval via Apache Arrow Flight

The Airflow task will connect to Dremio, retrieve the gold-layer dataset using **Apache Arrow Flight**, convert the result into a Pandas DataFrame, and then ingest that data into Snowflake. Here's how you can define the Airflow task:

```python
def load_into_snowflake():
    import snowflake.connector
    from dremio_simple_query.connect import DremioConnection
    import pandas as pd

    # Dremio connection details
    token = "<your_dremio_token>"
    arrow_endpoint = "grpc://<dremio_instance>:32010"

    # Establish connection with Dremio via Apache Arrow Flight
    dremio = DremioConnection(token, arrow_endpoint)

    # Query to fetch the gold layer dataset from Dremio
    df = dremio.toPandas("SELECT * FROM my_lake.gold.final_data;")

    # Connect to Snowflake
    conn = snowflake.connector.connect(
        user='<your_user>',
        password='<your_password>',
        account='<your_account>',
        warehouse='<your_warehouse>',
        database='<your_database>',
        schema='<your_schema>'
    )

    # Write the gold layer data to Snowflake
    cursor = conn.cursor()

    # Ingest the data using Snowflake's PUT and COPY INTO
    # Convert the DataFrame to a CSV for ingestion (or another format supported by Snowflake)
    df.to_csv("/tmp/gold_data.csv", index=False)

    cursor.execute("PUT file:///tmp/gold_data.csv @my_stage")
    cursor.execute("""
        COPY INTO snowflake_table
        FROM @my_stage/gold_data.csv
        FILE_FORMAT = (TYPE = 'CSV', FIELD_OPTIONALLY_ENCLOSED_BY = '"');
    """)

    conn.commit()
    cursor.close()
    conn.close()
```
### Step 2: Fetching Data from Dremio with Apache Arrow Flight
The key to this approach is using Apache Arrow Flight to pull data from Dremio efficiently. The dremio-simple-query library allows you to run SQL queries against Dremio and fetch results in formats that are easy to manipulate in Python, such as Arrow Tables or Pandas DataFrames.

In the Airflow task, we use the `.toPandas()` method to retrieve the gold layer dataset as a Pandas DataFrame:

```python
# Fetch data from Dremio using Arrow Flight
df = dremio.toPandas("SELECT * FROM my_lake.gold.final_data;")
```

This method ensures fast retrieval of large datasets, which can then be directly ingested into Snowflake. Keep in mind for extra large datasets, you can use the `toArrow` method to get a recordBatchReader to processed the data in batches (iterate through each batch and process it).

### Step 3: Ingesting the Data into Snowflake
Once the data is retrieved from Dremio, it’s converted into a format Snowflake can ingest. In this case, we’re using CSV for simplicity, but you can use other formats (such as Parquet) supported by both Snowflake and Dremio.

The ingestion process involves:

- Uploading the data to a Snowflake staging area using the PUT command.
- Copying the data into the target Snowflake table using the COPY INTO command.

```python
cursor.execute("PUT file:///tmp/gold_data.csv @my_stage")
cursor.execute("""
    COPY INTO snowflake_table
    FROM @my_stage/gold_data.csv
    FILE_FORMAT = (TYPE = 'CSV', 
    FIELD_OPTIONALLY_ENCLOSED_BY = '"');
""")
```

### Step 4: Automating the Process with GitHub Actions

As with previous steps, the ingestion process can be fully automated and triggered by GitHub Actions by being part of your Airflow DAG. When the GitHub Actions workflow is triggered the Airflow DAG that retrieves the gold layer data from Dremio and loads it into Snowflake.


### Why Use Apache Arrow Flight and Dremio for Data Ingestion?

- **High-performance data retrieval:** Apache Arrow Flight allows for fast, efficient transfer of large datasets between Dremio and external systems.
- **Simplified data handling:** With the ability to retrieve data as Pandas DataFrames, it’s easy to manipulate and process the data before loading it into Snowflake.
- **Seamless integration:** Using Arrow Flight ensures that the data transfer between Dremio and Snowflake is both high-performing and streamlined, reducing data replication and improving the overall efficiency of your pipeline.

This completes the final step of your pipeline, with the gold layer data now available in Snowflake for reporting and analytics.

## Ensuring Python Libraries, Environment Variables, DAGs, and dbt Projects are Accessible in the Airflow Container

When setting up an Airflow DAG to interact with external systems like **Dremio**, **Snowflake**, and **Apache Spark**, it's essential to properly configure the environment to ensure all Python libraries, environment variables, DAG files, and **dbt** projects are accessible inside the Dockerized Airflow environment. This section will guide you through configuring your environment to:

1. Install required Python libraries using **Docker Compose**.
2. Ensure **environment variables** (e.g., API tokens, credentials) are securely passed from **GitHub Secrets** to Docker containers.
3. Make **DAGs** from your repository available to the Airflow container.
4. Copy and configure your **dbt project** inside the Airflow environment.

### Step 1: Setting up Docker Compose to Include Python Libraries

To ensure that all necessary Python dependencies (e.g., `dremio-simple-query`, `snowflake-connector-python`, `pandas`, `dbt-core`, `pyspark`) are installed in the Airflow container, you can extend the default Airflow image using a custom `Dockerfile` and adjust your `docker-compose.yml` configuration to use this image.

Here’s an example `Dockerfile` that installs the required libraries:

```Dockerfile
# Use the official Airflow image
FROM apache/airflow:2.5.1

# Install required Python libraries
RUN pip install dremio-simple-query==<version> snowflake-connector-python==<version> pandas==<version> dbt-core==<version> pyspark==<version>

# Copy the dbt project into the container
COPY ./dbt_project /usr/local/airflow/dbt_project
```
In your `docker-compose.yml file`, reference this custom image to ensure the Airflow container includes all the necessary dependencies:

```yaml
version: '3'
services:
  webserver:
    build: 
      context: .
      dockerfile: Dockerfile  # Use the custom Dockerfile for the Airflow container
    environment:
      - LOAD_EXAMPLES=no
      - EXECUTOR=LocalExecutor
    ports:
      - "8080:8080"
    volumes:
      - ./dags:/opt/airflow/dags  # Mount the DAGs from the local folder
    depends_on:
      - postgres
  postgres:
    image: postgres:13
    environment:
      POSTGRES_USER: airflow
      POSTGRES_PASSWORD: airflow
      POSTGRES_DB: airflow
```

This ensures that all required Python libraries and the dbt project are installed in the Airflow container, allowing it to execute tasks involving Dremio, Spark, Snowflake, and dbt.

### Step 2: Configuring Environment Variables from GitHub Secrets
To securely pass environment variables, such as API tokens or credentials, from your GitHub repository’s secrets to the Docker container, you can use GitHub Actions. These variables may be required to connect to external services such as Dremio, Snowflake, and your Spark cluster.

#### Steps:

- Store the necessary secrets in GitHub Secrets (e.g., DREMIO_TOKEN, SNOWFLAKE_USER, SPARK_MASTER).
- Pass these secrets to the Airflow container by configuring your GitHub Actions workflow.

Here’s an example of how to pass environment variables using GitHub Actions:

```yaml
jobs:
  trigger-airflow:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Set up Docker
        uses: docker/setup-buildx-action@v2

      - name: Run Airflow containers
        run: |
          docker-compose up -d
        env:
          DREMIO_TOKEN: ${{ secrets.DREMIO_TOKEN }}
          SNOWFLAKE_USER: ${{ secrets.SNOWFLAKE_USER }}
          SNOWFLAKE_PASSWORD: ${{ secrets.SNOWFLAKE_PASSWORD }}
          SPARK_MASTER: ${{ secrets.SPARK_MASTER }}
```

In your `docker-compose.yml`, ensure the container receives these environment variables:

```yaml
services:
  webserver:
    environment:
      - DREMIO_TOKEN=${DREMIO_TOKEN}
      - SNOWFLAKE_USER=${SNOWFLAKE_USER}
      - SNOWFLAKE_PASSWORD=${SNOWFLAKE_PASSWORD}
      - SPARK_MASTER=${SPARK_MASTER}
```

This ensures that all required credentials and tokens are securely passed to the container environment and accessible during Airflow task execution.

### Step 3: Mounting DAGs from the Repository into the Airflow Container
To ensure that your DAGs from the repository are available in the Airflow container, you need to mount the DAGs folder from the local environment into the container. This is achieved through volume mapping in your docker-compose.yml file.

Example configuration:

```yaml
services:
  webserver:
    volumes:
      - ./dags:/opt/airflow/dags  # Mounts the local DAGs folder into the Airflow container
```
This ensures that any DAGs in your GitHub repository are made available to the Airflow container and can be automatically picked up for execution. In GitHub Actions, ensure that the repository is checked out before running the docker-compose up command to make sure the latest DAGs are present.

```yaml
- name: Checkout repository
  uses: actions/checkout@v3

- name: Run Airflow containers
  run: |
    docker-compose up -d
```

### Step 4: Copying the dbt Project and Creating dbt Profiles Using Environment Variables
To enable Airflow to run dbt models, you need to copy the dbt project into the Airflow container and configure the dbt profiles.yml file with the necessary environment variables (such as credentials for Dremio or Snowflake).

#### Copying the dbt Project:
In your Dockerfile, ensure that the COPY command includes your dbt project directory, as shown below:

```Dockerfile
# Copy the dbt project into the container
COPY ./dbt_project /usr/local/airflow/dbt_project
```
_note: You could also use a volume mapping in your docker-compose.yml file to achieve the same result._

#### Creating the dbt Profile:
The dbt `profiles.yml` file typically contains the connection details for the database or data warehouse you're working with. You can generate this file dynamically inside the Airflow container, using environment variables passed from GitHub Secrets.

Example of creating a dbt `profiles.yml` file:

```python
def create_dbt_profile():
    profiles_content = f"""
    dremio:
      target: dev
      outputs:
        dev:
          type: odbc
          driver: Dremio ODBC Driver
          host: {os.getenv('DREMIO_HOST')}
          port: 31010
          user: {os.getenv('DREMIO_USER')}
          password: {os.getenv('DREMIO_PASSWORD')}
          database: {os.getenv('DREMIO_DB')}
    """
    with open('/usr/local/airflow/dbt_project/profiles.yml', 'w') as file:
        file.write(profiles_content)
```

Ensure this function is called before running any dbt models in your Airflow DAG to dynamically create the profiles.yml with the correct environment variables for each environment.


### Summary
By following these steps, you ensure that:

- All required Python libraries (for Dremio, Snowflake, dbt, etc.) are installed in the Airflow container via a custom Docker image.
- Environment variables (such as API tokens and credentials) are securely passed from GitHub Secrets to the container environment.
- DAG files and dbt projects from your repository are mounted and configured in the Airflow container.
- The dbt profiles are dynamically created using environment variables for flexibility across environments.

With this setup, your Airflow container is fully configured to run your data pipeline, handling tasks from Spark data ingestion to dbt transformations and Snowflake loading, all triggered by GitHub Actions.

## Optimizing Performance of the Workflow

When building a data pipeline using **GitHub Actions** to trigger **Airflow DAGs**, it’s important to ensure that your workflow is not only functional but also optimized for performance. This becomes especially critical when dealing with large datasets or complex workflows involving multiple external systems like **Apache Spark**, **Dremio**, and **Snowflake**. In this section, we will explore several strategies to optimize the performance of your GitHub Actions workflow, from reducing unnecessary triggers to improving the efficiency of your data processing tasks.

### 1. **Use Caching to Avoid Rebuilding Images**

One of the biggest performance bottlenecks in Docker-based workflows is the repeated building of Docker images each time the workflow is triggered. To optimize performance, you can use GitHub Actions’ built-in **caching** feature to cache dependencies and intermediate stages of your Docker builds. This avoids having to rebuild your container and re-download libraries every time the workflow runs.

**How to implement caching:**
- **Cache Docker layers**: Cache Docker build layers to speed up image builds.
- **Cache Python dependencies**: If your workflow installs Python libraries (e.g., `dremio-simple-query`, `snowflake-connector-python`), cache the `pip` packages between runs.

Example using Docker layer caching in GitHub Actions:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2

      - name: Cache Docker layers
        uses: actions/cache@v3
        with:
          path: /tmp/.buildx-cache
          key: ${{ runner.os }}-buildx-${{ github.sha }}
          restore-keys: |
            ${{ runner.os }}-buildx-

      - name: Build and push Docker image
        run: docker-compose build --cache-from type=local,src=/tmp/.buildx-cache
```

#### Benefits:

- **Reduces build times:** Speeds up the workflow by avoiding the need to rebuild the entire Docker image or re-install Python dependencies each time.
- **Improves CI efficiency:** Caching is particularly useful for speeding up continuous integration processes where workflows are frequently triggered.

### 2. Trigger Workflows Only When Necessary
To avoid unnecessary executions of your workflow, ensure that the pipeline only runs when changes relevant to the DAG or pipeline configuration are made. This can be achieved by using conditional triggers or path filters in your GitHub Actions workflow file. By narrowing down the workflow to run only when critical files (e.g., DAG files, configuration files) are changed, you reduce unnecessary execution and improve overall performance.

Example of filtering based on path:

```yaml
on:
  push:
    branches:
      - main
    paths:
      - 'dags/**'
      - 'dbt/**'
```

#### Benefits:

- **Avoids unnecessary runs:** Prevents the workflow from running when unrelated files are changed, conserving computational resources.
- **Optimizes execution frequency:** Ensures that the pipeline only runs when relevant changes occur, reducing the load on your infrastructure.

### 3. Parallelize Tasks in the DAG
If your DAG contains multiple independent tasks (e.g., ingesting data with Spark, transforming data with Dremio, and loading data into Snowflake), you can improve performance by running these tasks in parallel. Airflow natively supports task parallelization, and you can configure it to run tasks concurrently to reduce the overall runtime of your workflow.

Example of parallel tasks in an Airflow DAG:

```python
from airflow import DAG
from airflow.operators.python_operator import PythonOperator
from datetime import datetime

def task_1():
    # Task 1 logic here
    pass

def task_2():
    # Task 2 logic here
    pass

dag = DAG('my_dag', start_date=datetime(2024, 1, 1), schedule_interval='@daily')

# Define parallel tasks
t1 = PythonOperator(task_id='task_1', python_callable=task_1, dag=dag)
t2 = PythonOperator(task_id='task_2', python_callable=task_2, dag=dag)

# Run tasks in parallel
[t1, t2]
```
#### Benefits:

- **Reduces workflow runtime:** Parallelizing tasks that don’t depend on each other cuts down the total time required to complete the workflow.
- **Scalability:** Allows your workflow to scale as you add more tasks, without increasing the runtime proportionally.

### 4. Optimize Data Processing with Arrow and Dremio Reflections
For workflows involving large datasets, it’s important to optimize how data is processed and moved between systems. In this pipeline, you’re leveraging Apache Arrow Flight and Dremio Reflections to efficiently retrieve and accelerate access to large datasets. To further optimize performance:

- Use Arrow Flight to transport large datasets between Dremio and external systems, minimizing serialization/deserialization overhead.
- Enable Dremio Reflections on your datasets, particularly for gold-layer data, to accelerate queries and transformations.

Example of creating a Dremio Reflection:

```sql
ALTER TABLE my_lake.gold.final_dataset
  CREATE RAW REFLECTION gold_accelerator USING DISPLAY (id,lastName,firstName,address,country)
    PARTITION BY (country)
    LOCALSORT BY (lastName);
```

#### Benefits:

- **Minimizes data transfer latency:** Apache Arrow Flight reduces the overhead of transferring large datasets, improving overall workflow performance.
- **Speeds up queries:** Dremio Reflections cache results, reducing the time required for frequently executed queries.

5. Limit Resource Usage in GitHub Actions
Finally, you can optimize the performance of the workflow by managing resource usage in GitHub Actions. This includes specifying appropriate runner types (e.g., ubuntu-latest or custom runners) and limiting the number of jobs that run concurrently to avoid hitting resource limits.

Example of limiting concurrency in GitHub Actions:

```yaml
concurrency:
  group: my-workflow-${{ github.ref }}
  cancel-in-progress: true
```

#### Benefits:

- **Avoids resource contention:** By controlling concurrency, you prevent multiple runs of the same workflow from competing for resources, improving stability and performance.
- **Efficient use of runners:** Ensures that the workflow uses only the necessary resources, reducing cost and improving execution efficiency.

### Summary
Optimizing the performance of your GitHub Actions-triggered Airflow workflow involves a combination of techniques such as caching, task parallelization, data transport optimization, and using distributed executors. By implementing these strategies, you can ensure that your pipeline runs efficiently, scales with increasing data or complexity, and delivers fast results across your data systems like Apache Spark, Dremio, and Snowflake.

## Troubleshooting Considerations

When building a complex data pipeline using GitHub Actions to trigger Airflow DAGs and interact with external systems such as Dremio, Snowflake, and Apache Spark, you may encounter issues related to dependencies, environment variables, and connectivity. This section outlines key troubleshooting considerations to ensure your workflow runs smoothly and is properly configured.

### 1. **Ensuring All Python Libraries Are Installed**

One of the most common issues in Dockerized Airflow environments is missing Python libraries. If the necessary dependencies (e.g., `dremio-simple-query`, `snowflake-connector-python`, `pandas`, etc.) are not installed, your DAG tasks will fail during execution.

**Steps to Troubleshoot:**
- **Check Dockerfile**: Ensure all required Python libraries are listed in your `Dockerfile`. If a package is missing, add it and rebuild the Docker image.
  
  Example:
```Dockerfile
  RUN pip install dremio-simple-query==<version> snowflake-connector-python==<version> pandas==<version>
```
#### Common Gotchas:

- **Dependency Conflicts:** Ensure that library versions are compatible with each other to avoid conflicts.
- **Rebuild Docker Image:** After making changes to the Dockerfile, don’t forget to rebuild the Docker image and restart the containers.

### 2. Ensuring Environment Variables Are Passed Correctly
Incorrect or missing environment variables can lead to issues connecting to external systems like Dremio, Snowflake, or Apache Spark. These variables often include API tokens, usernames, passwords, and endpoints.

#### Steps to Troubleshoot:

**Check docker-compose.yml:** Make sure all necessary environment variables are listed in the environment section of the `docker-compose.yml` file.

Example:

```yaml
environment:
  - DREMIO_TOKEN=${DREMIO_TOKEN}
  - SNOWFLAKE_USER=${SNOWFLAKE_USER}
  - SNOWFLAKE_PASSWORD=${SNOWFLAKE_PASSWORD}
```

**Check GitHub Secrets:** Verify that GitHub Secrets are correctly passed to the workflow. If a secret is missing, update the GitHub repository's Secrets settings and ensure they are referenced properly in the GitHub Actions workflow.

Example:

```yaml
env:
  DREMIO_TOKEN: ${{ secrets.DREMIO_TOKEN }}
  SNOWFLAKE_USER: ${{ secrets.SNOWFLAKE_USER }}
```

**Log Environment Variables:** Temporarily log environment variables in the Airflow task to verify that they are being passed correctly:

```python
import os
print(os.getenv('DREMIO_TOKEN'))
```

#### Common Gotchas:

- **Variable Case Sensitivity:** Ensure the environment variables in the `docker-compose.yml` file match exactly with those in GitHub Secrets, as they are case-sensitive.
- **Missing Secrets:** If a required secret is not present, the workflow will fail. Double-check that all secrets are configured in GitHub.

### 3. Ensuring DAGs Are Visible to the Airflow Container
If Airflow doesn’t detect your DAGs, it could be due to incorrect volume mounting or file path issues in the Docker setup.

#### Steps to Troubleshoot:

**Check Volume Mounting:** Ensure that the dags directory is correctly mounted in the `docker-compose.yml` file.

Example:

```yaml
services:
  webserver:
    volumes:
      - ./dags:/opt/airflow/dags
```

**Check DAG Folder Structure:** Ensure that your DAGs are in the correct folder structure inside the repository. The dags directory should be at the root level of your project and contain .py files defining the DAGs.

**Restart the Airflow Webserver:** Sometimes, new DAGs are not detected until the Airflow webserver is restarted:

#### Common Gotchas:

- **Incorrect File Paths:** If DAGs are not mounted properly, Airflow won’t be able to find them. Double-check the volume path in docker-compose.yml.
- **DAG Parsing Errors:** Check for syntax errors in your DAGs that may prevent Airflow from loading them.

### 4. Ensuring PySpark Scripts Connect to the Remote Spark Cluster
If your Airflow DAG includes tasks that run PySpark scripts, you need to ensure that the scripts have the correct information to connect to a remote Spark cluster.

#### Steps to Troubleshoot:

**Check Spark Configuration:** Verify that the Spark configuration in your PySpark script points to the correct Spark master node (either in standalone mode or on a distributed cluster like YARN or Kubernetes):

Example:

```python
spark = SparkSession.builder \
  .master("spark://<remote-spark-master>:7077") \
  .appName("MyApp") \
  .getOrCreate()
```

**Pass Spark Configuration via Environment Variables:** If you’re dynamically assigning the Spark master or other settings, ensure that these values are passed as environment variables:

```python
spark_master = os.getenv('SPARK_MASTER', 'spark://<default-spark-master>:7077')
spark = SparkSession.builder.master(spark_master).getOrCreate()
```

#### Common Gotchas:

**Incorrect Spark Master URL:** If the Spark master URL is incorrect or inaccessible, the PySpark script will fail.

**Firewall Issues:** Make sure there are no firewall rules blocking communication between the Airflow container and the Spark cluster.

### 5. Other Possible Gotchas
**File Permissions:** If you’re accessing local files (e.g., configuration files or data), ensure that the file permissions allow access from within the container. You can fix this by adjusting the file permissions in your local environment or specifying correct permissions when mounting volumes.

**Container Resource Limits:** If the Airflow container or any associated services (e.g., Spark, Dremio, Snowflake) are consuming too much memory or CPU, they might hit resource limits and cause the workflow to fail. Check your Docker resource allocation settings and ensure you’ve allocated sufficient resources to each service.

**Airflow Scheduler Issues:** If your DAG is not running even though it’s visible in the UI, the issue could be with the Airflow scheduler. Ensure the scheduler is running correctly:

**Data Transfer Bottlenecks:** If your pipeline involves moving large datasets (e.g., between Dremio and Snowflake), ensure that you’re using efficient formats like Parquet and leveraging high-performance data transport protocols like Apache Arrow Flight.

### Summary
By following these troubleshooting guidelines, you can identify and resolve common issues related to Python dependencies, environment variables, DAG visibility, PySpark configuration, and other potential gotchas. Ensuring that your environment is properly set up and configured will help you run your GitHub Actions-triggered Airflow workflows smoothly and efficiently.

### Conclusion

The example provided in this blog serves as an **illustrative guide** to show how you can trigger Airflow DAGs using GitHub Actions to orchestrate data pipelines that integrate external systems like **Apache Spark**, **Dremio**, and **Snowflake**. While the steps outlined offer a practical starting point, it's important to recognize that this pattern can be **customized and expanded** to meet your specific data workflow requirements.

Every data pipeline has unique characteristics depending on the nature of the data, the scale of processing, and the systems involved. Whether you're dealing with more complex DAGs, additional external systems, or specialized configurations, this guide can serve as the foundation for implementing your own tailored solution.

Key optimizations, such as efficient data transport with **Apache Arrow Flight**, distributed task execution with **Airflow Executors**, and performance improvements through **Dremio Reflections**, are flexible tools that can be adjusted to meet the scale and performance needs of your project. Additionally, the GitHub Actions workflow can be adapted to trigger the pipeline on various events, such as code changes or scheduled jobs, giving you full control over your pipeline orchestration.

By starting with this example and iterating based on your organization's specific needs, you can build a scalable, cost-effective, and performant data orchestration pipeline. Whether you’re managing data lake transformations, synchronizing with cloud warehouses, or running periodic ingestion jobs, this workflow pattern can be a valuable framework for your data operations.
