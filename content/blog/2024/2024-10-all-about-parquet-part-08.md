---
title: All About  Parquet Part 08 - Reading and Writing Parquet Files in Python
date: "2024-10-21"
description: "All about the Apache Parquet File Format"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
  - apache parquet
---

- [Free Copy of Apache Iceberg the Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=allaboutparquet)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=allaboutparquet)
- [Iceberg Lakehouse Engineering Video Playlist](https://www.youtube.com/watch?v=SIriNcVIGJQ&list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe)

In previous posts, we explored the internal workings of the Parquet format and how it optimizes storage and performance. Now, it's time to dive into the practical side: how to **read and write Parquet files in Python**. With libraries like **PyArrow** and **FastParquet**, Python makes working with Parquet easy and efficient. In this post, we’ll walk through how to use these tools to handle Parquet files, covering both reading from and writing to Parquet.

## Why Use Parquet in Python?

Parquet has become a go-to format for handling large datasets, especially in the data engineering and analytics world. Here’s why you might choose Parquet over other formats (like CSV or JSON) when working in Python:

- **Efficient Data Storage**: Parquet's columnar format reduces file sizes and speeds up queries, making it ideal for large datasets.
- **Interoperability**: Parquet works seamlessly with distributed data processing tools like Apache Spark, Dremio, and Hadoop, as well as cloud storage services like AWS S3.
- **Schema Enforcement**: Parquet supports structured data and schema enforcement, ensuring data consistency.
- **Compatibility**: Python libraries like **PyArrow** and **FastParquet** make it easy to integrate Parquet with popular Python data science tools like Pandas.

Let’s start by looking at two of the most popular libraries for working with Parquet in Python: **PyArrow** and **FastParquet**.

## PyArrow: A Complete Parquet Solution

**PyArrow** is part of the Apache Arrow project and provides full support for Parquet. It’s widely used for reading and writing Parquet files and works seamlessly with other Arrow libraries. Let’s walk through how to use PyArrow to read and write Parquet files.

### Installing PyArrow

First, you’ll need to install PyArrow. You can do this with pip:

```bash
pip install pyarrow
Writing Parquet Files with PyArrow
Writing data to a Parquet file using PyArrow is straightforward. Below is an example of how to write a Pandas DataFrame to Parquet:

python
Copy code
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

# Create a sample DataFrame
df = pd.DataFrame({
    'Name': ['Alice', 'Bob', 'Charlie'],
    'Age': [25, 30, 35],
    'Salary': [50000, 60000, 70000]
})

# Convert the DataFrame to an Arrow Table
table = pa.Table.from_pandas(df)

# Write the Arrow Table to a Parquet file
pq.write_table(table, 'sample.parquet')
```

In this example, we first create a Pandas DataFrame, convert it to an Arrow Table (using pa.Table.from_pandas), and then write it to a Parquet file using pq.write_table. The resulting file will be a compressed, efficient Parquet file that can be easily queried and processed.

### Reading Parquet Files with PyArrow
Reading Parquet files with PyArrow is just as simple. You can load the data from a Parquet file into a Pandas DataFrame as follows:

```python
# Read the Parquet file into an Arrow Table
table = pq.read_table('sample.parquet')

# Convert the Arrow Table to a Pandas DataFrame
df = table.to_pandas()

print(df)
```
This code reads the Parquet file into an Arrow Table using `pq.read_table`, then converts it into a Pandas DataFrame using `to_pandas`. You can then manipulate the data in Pandas as usual.

### PyArrow and Partitioned Datasets
In many real-world use cases, especially in data lakes, Parquet files are partitioned by columns to improve query performance. PyArrow makes it easy to work with partitioned datasets:

```python
# Write partitioned Parquet files
pq.write_to_dataset(table, root_path='dataset/', partition_cols=['Age'])

# Read a partitioned dataset
table = pq.ParquetDataset('dataset/').read()
df = table.to_pandas()

print(df)
```

In this example, we write the dataset into multiple Parquet files partitioned by the Age column. You can later read the entire partitioned dataset as a single table and convert it back to a Pandas DataFrame.

## FastParquet: A Lightweight Alternative
FastParquet is another popular library for working with Parquet files in Python. It’s optimized for speed and integrates well with Pandas. While PyArrow provides a more comprehensive set of features, FastParquet offers a faster and more lightweight solution for common tasks.

### Installing FastParquet
You can install FastParquet using pip:

```bash
pip install fastparquet
```

### Writing Parquet Files with FastParquet
Writing a Parquet file using FastParquet is very similar to PyArrow:

```python
import pandas as pd
import fastparquet as fp

# Create a sample DataFrame
df = pd.DataFrame({
    'Name': ['Alice', 'Bob', 'Charlie'],
    'Age': [25, 30, 35],
    'Salary': [50000, 60000, 70000]
})

# Write the DataFrame to a Parquet file
fp.write('sample_fp.parquet', df)
```
Here, we directly write the Pandas DataFrame to a Parquet file using FastParquet’s write function.

### Reading Parquet Files with FastParquet
Reading Parquet files with FastParquet is just as easy:

```python
# Read the Parquet file into a Pandas DataFrame
df = fp.ParquetFile('sample_fp.parquet').to_pandas()

print(df)
```

FastParquet allows you to quickly load Parquet files into Pandas DataFrames, making it ideal for use in data science and analytics workflows.

### FastParquet and Partitioned Datasets
FastParquet also supports reading and writing partitioned datasets:

```python
# Write partitioned Parquet files
fp.write('dataset_fp/', df, partition_on=['Age'])

# Read a partitioned dataset
df = fp.ParquetFile('dataset_fp/').to_pandas()

print(df)
```

In this example, we partition the dataset by the Age column and later read it back into a Pandas DataFrame.

## PyArrow vs. FastParquet: Which to Choose?
Both PyArrow and FastParquet are excellent options for working with Parquet files in Python, but they have different strengths:

**PyArrow:** Offers full support for the Parquet format and works seamlessly with the broader Apache Arrow ecosystem. It’s the better choice for complex use cases, such as working with partitioned datasets or using advanced compression and encoding options.

**FastParquet:** Is faster and lighter, making it a great option for simple tasks, such as reading and writing Parquet files in data science workflows. It’s often more performant when dealing with small-to-medium datasets.

Ultimately, the choice between the two depends on your specific use case. If you’re working with large-scale data in distributed systems or need advanced features like schema evolution or deep integration with Arrow, go with PyArrow. If you need a fast, lightweight solution for reading and writing Parquet files in day-to-day data analysis, FastParquet is a great option.

## Conclusion
Python provides excellent libraries for reading and writing Parquet files, with PyArrow and FastParquet being two of the most popular options. Whether you need advanced features like partitioning and schema handling (PyArrow) or a lightweight, fast solution for simple file manipulation (FastParquet), both libraries offer robust support for the Parquet format.

In the next post, we’ll explore how Parquet fits into modern data lake architectures and how it powers data lakehouses with technologies like Apache Iceberg and Delta Lake.

Stay tuned for part 9: **Parquet in Data Lake Architectures**.
