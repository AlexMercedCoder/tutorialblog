---
title: Using the alexmerced/datanotebook Docker Image
date: "2024-08-30"
description: "Setting up a quick and easy data environment for data science and analytics"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
  - data analytics
---

- [Watch My Intro to Data Playlist](https://www.youtube.com/watch?v=nq8ETrTgT7o&list=PLsLAVBjQJO0p_4Nqz99tIjeoDYE97L0xY&pp=iAQB)
- [Download Free Copy of "Apache Iceberg: The Definitive Guide"](https://drmevn.fyi/datanotebook830)
- [Enroll in the Free Apache Iceberg Crash Course](https://drmevn.fyi/datanotecourse830)

Sometimes, you want to spin up a quick data notebook environment when doing quick data work or practice. For this purpose, I've built the [alexerced/datanotebook](https://hub.docker.com/repository/docker/alexmerced/datanotebook/general) docker image, and this blog explains how you can use it for work you'd like to do. The most significant difference between this image and the [alexmerced/spark35notebook](https://hub.docker.com/repository/docker/alexmerced/spark35notebook/general) image is that while the image does have pySpark installed, it does not have Spark running within the same container. You don't have to worry about a token to access the notebook with this image (I'll probably do the same with my next spark image whenever I build it).

To use it just navigate to empty folder on your computer in your terminal and run the following command:

```
docker run -p 8888:8888 -v $(pwd):/home/pydata/work --name my_notebook alexmerced/datanotebook
```

This will map the home directory in the container to your current directory for file persistence. Then, you'll be able to go to localhost:8888 and start creating notebooks. Here is an example script you can try out.

```py
# Import the Polars library
import polars as pl

# Create a sample DataFrame
data = {
    "id": [1, 2, 3, 4, 5],
    "name": ["Alice", "Bob", "Charlie", "David", "Eve"],
    "age": [25, 30, 35, 40, 45],
    "city": ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"]
}

# Convert the dictionary to a Polars DataFrame
df = pl.DataFrame(data)

# Display the DataFrame
print("DataFrame:")
print(df)

# Define the output file path
output_file = "output_data.parquet"

# Write the DataFrame to a Parquet file
df.write_parquet(output_file)

# Confirm the file was written
print(f"\nDataFrame successfully written to {output_file}")
```

## Libraries Provided

Libraries you'll have available out of the box:

  - Data manipulation: `pandas`, `numpy`, `polars`, `dask`, `ibis`
  - Machine learning: `scikit-learn`, `tensorflow`, `torch`, `xgboost`, `lightgbm`
  - Visualization: `matplotlib`, `seaborn`, `plotly`
  - Database access: `psycopg2-binary`, `mysqlclient`, `sqlalchemy`, `duckdb`, `pyarrow`
  - Object storage: `boto3`, `s3fs`, `minio`
  - Other utilities: `openpyxl`, `requests`, `beautifulsoup4`, `lxml`, `pyspark`, `dremio-simple-query`

If you want to install additional libraries you can use the following syntax.

```py
# Install Polars and any other necessary libraries
!pip install polars
```

## Connecting to Remote Spark Servers

pySpark is installed so you can write and run pySpark code but against external Spark servers, so how would you configure that Spark session would look something like this:

```py
from pyspark.sql import SparkSession

# MinIO configurations
minio_endpoint = "http://minio-server:9000"  # Replace with your MinIO server URL
access_key = "your-access-key"
secret_key = "your-secret-key"
bucket_name = "your-bucket"
minio_path = f"s3a://{bucket_name}/output_data.parquet"

# Configure the SparkSession to connect to a remote Spark server and MinIO
spark = SparkSession.builder \
    .appName("MinIOConnection") \
    .master("spark://remote-spark-server:7077") \  # Replace with your Spark master URL
    .config("spark.driver.memory", "2g") \
    .config("spark.executor.memory", "4g") \
    .config("spark.hadoop.fs.s3a.endpoint", minio_endpoint) \
    .config("spark.hadoop.fs.s3a.access.key", access_key) \
    .config("spark.hadoop.fs.s3a.secret.key", secret_key) \
    .config("spark.hadoop.fs.s3a.path.style.access", "true") \
    .config("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem") \
    .config("spark.hadoop.fs.s3a.connection.ssl.enabled", "false") \
    .getOrCreate()

# Confirm the connection by printing the Spark configuration
print("Spark session connected to:", spark.sparkContext.master)
print("MinIO path:", minio_path)

# Example DataFrame creation
data = [
    (1, "Alice", 25),
    (2, "Bob", 30),
    (3, "Charlie", 35)
]
columns = ["id", "name", "age"]

df = spark.createDataFrame(data, columns)

# Show the DataFrame
df.show()

# Perform some operations (e.g., filtering)
filtered_df = df.filter(df.age > 28)
filtered_df.show()

# Write the DataFrame to MinIO as a Parquet file
filtered_df.write.parquet(minio_path)

# Optionally, read the Parquet file back from MinIO
read_df = spark.read.parquet(minio_path)
read_df.show()

# Stop the Spark session
spark.stop()

```

## Conclusion

Hope you find this docker image a functional flywheel for ad-hoc data engineering and data analytics work!


- [Watch My Intro to Data Playlist](https://www.youtube.com/watch?v=nq8ETrTgT7o&list=PLsLAVBjQJO0p_4Nqz99tIjeoDYE97L0xY&pp=iAQB)
- [Download Free Copy of "Apache Iceberg: The Definitive Guide"](https://drmevn.fyi/datanotebook830)
- [Enroll in the Free Apache Iceberg Crash Course](https://drmevn.fyi/datanotecourse830)
