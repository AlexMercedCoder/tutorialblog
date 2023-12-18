---
title: No Code - Convert XLS/CSV files into Parquet with Dremio
date: "2023-12-18"
description: "Convert XLS/CSV Files without having to write python"
author: "Alex Merced"
category: "Data Engineering"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - Data Engineering
  - Excel
  - CSV
  - Parquet
---

XLS and CSV files continue to be widely used for storing and exchanging data. They are simple, human-readable, and universally supported. However, as the need for high-performance analytics and big data processing grows, a new standard has emerged - Parquet files. Parquet is a columnar storage format that offers significant advantages in terms of speed and efficiency, making it increasingly popular in the analytics community.

The challenge often lies in the conversion process. To convert XLS and CSV files into Parquet typically requires knowledge of programming languages like Python. This can be a barrier for analysts, data engineers, or business professionals who might not be proficient in coding.

But fear not! There's a user-friendly solution that allows you to perform this conversion without writing a single line of code. [Enter Dremio](https://www.dremio.com/get-started/), a powerful data platform that simplifies data analytics tasks. In this blog, we will walk you through the process of converting XLS and CSV files into Parquet format using Dremio's intuitive no-code interface. 

With Dremio, you can say goodbye to complex scripts and hello to a streamlined and efficient way of transforming your data for analytics. Let's get started by setting up Dremio.

## Setting up Dremio

Before you can start converting XLS and CSV files into Parquet with Dremio, you need to set up the Dremio platform on your local machine. Don't worry; it's a straightforward process. Follow these steps:

### 1. Install Docker-Desktop

If you haven't already, you'll need to install Docker-Desktop on your machine. Docker is a platform that allows you to containerize applications, making it easy to deploy and manage them. You can download Docker-Desktop from the official Docker website (https://www.docker.com/products/docker-desktop) and follow the installation instructions for your operating system.

### 2. Pull the Dremio Docker Image

Once Docker-Desktop is installed.

You can pull the image using the docker-desktop UI using the search bar.

![Using the Docker Desktop Search Par to Pull Dremio Image](https://i.imgur.com/7D6XwpO.png)

If you comfortable with terminal this can also be done from a terminal/shell environment with the following command:

```shell
docker pull dremio/dremio-oss
```

This command will download the Dremio open-source (oss) image to your local machine.

### 3. Run the Dremio Container

Now that you have the Dremio Docker image, you can run a Dremio container. 

First, click on the run button on the Docker Desktop UI:

![Using Docker Desktop UI to Run Dremio](https://i.imgur.com/sIctQKO.png)

Then click on "Optional Settings" then map each port on the container to the equivalent port on your host machine (your laptop) then click run, refer to the image below:

![Desktop Docker - Mapping Ports](https://i.imgur.com/xsNwT0q.png)

The container should be up and running in a minute.

For terminal/shell users, use the following command, replacing [container-name] with a name of your choice:

```
docker run -d --name [container-name] -p 9047:9047 -p 45678:45678 -p 32010:32010 -p 31010:31010 dremio/dremio-oss
```
This command starts a Dremio container and maps the necessary ports (9047, 45678, 32010, and 31010) from the container to your local machine, allowing you to access Dremio's web interface.

### 4. Access Dremio from localhost
With the Dremio container up and running, you can access the Dremio web interface by opening your web browser and navigating to:

```
http://localhost:9047
```

You should now see the Dremio admin user creation page, fill this out and you're ready to start using Dremio for your data needs. In the next section, we'll guide you through the process of uploading your CSV and XLS files and performing the necessary conversions using Dremio's user-friendly interface.

## Uploading and Converting Your Data with Dremio

Now that you have Dremio set up on your local machine, it's time to upload your CSV and XLS files and convert them into Parquet format using Dremio's user-friendly interface. Follow these steps:

### 1. Upload Your CSV and XLS Files

Once you're logged in, you'll be greeted by the Dremio home screen. To upload your data files, follow these steps:

- Click on the "+" icon in the upper right which can be used to upload single XLS, JSON, CSV, and PARQUET files to your Dremio insance.

![Uploading a File to Dremio](https://i.imgur.com/ZWRi4bI.png)

Then you'll see the upload document as a purple icon which stands for "Physical Datasets" (The Original Dataset)

![See the Uploaded Data Set](https://i.imgur.com/hJew19o.png)

### 2. Explore and Prepare Your Data

Dremio may detect the schema of your CSV and XLS files. You can now explore and prepare your data within the Dremio interface. This includes:

- Viewing a preview of your data to ensure it was correctly detected.
- Renaming columns.
- Changing data types.
- Applying filters and transformations.

Dremio's intuitive UI makes it easy to perform these operations without writing any code.

### 4. Convert to Parquet

Once you are satisfied with the data preparation, it's time to convert your data to Parquet:

- One you are exploring your dataset
- Click the download icon right above the right of the results pane
- Select Parquet and a Parquet file with your data will download

![Download the Dataset as Parqet](https://i.imgur.com/D24sfFt.png)

## Conclusion: Simplifying Data Tasks with Dremio

In this blog, we've explored how Dremio can streamline the process of converting XLS and CSV files into Parquet format, all without the need for coding. Let's summarize the benefits of using Dremio for this task:

1. **No Code Required**: Dremio's user-friendly interface allows individuals without coding skills to perform data transformations effortlessly. This lowers the barrier to entry for data-related tasks and empowers business professionals and analysts to work with data more effectively.

2. **Efficiency**: Dremio's underlying architecture is optimized for high-performance data processing. By converting data to Parquet format, you can take advantage of the speed and efficiency of columnar storage, making queries and analytics faster.

3. **Data Exploration**: Dremio's data exploration features enable you to preview, clean, and shape your data visually. This interactive approach to data preparation speeds up the data-to-insight journey.

4. **Flexibility**: Dremio supports a wide range of data sources and formats, making it a versatile tool for various data-related tasks. You can seamlessly integrate data from external databases, data lakes, and data warehouses, and work with them using the same intuitive interface.

But Dremio's capabilities go beyond just data conversion. Consider other use cases for Dremio on your laptop:

- **SQL on Data**: You can write SQL queries directly in Dremio to analyze and transform data. Whether your data resides in a local CSV file, a remote database, or a cloud-based data lake, Dremio provides a unified SQL interface.

- **Connect to External Data Sources**: Dremio can connect to external data sources, allowing you to access and analyze data from databases, cloud storage, and data warehouses without the need for complex configurations. You also are able to create, read, update and delete Apache Iceberg tables on S3/Minio/ADLS/Google Cloud data lakes.

- **Data Virtualization**: Dremio's data virtualization capabilities enable you to create virtual datasets that combine data from various sources, providing a unified view for analysis and reporting.

In conclusion, Dremio is a powerful tool that simplifies data tasks and empowers users to work with data efficiently and intuitively. Whether you're converting files to Parquet, running SQL queries on diverse data sources, or creating virtual datasets, Dremio is a valuable addition to your data toolkit.

If you haven't already, give Dremio a try and experience firsthand how it can enhance your data analytics workflow. With Dremio, you'll spend less time wrestling with data and more time deriving valuable insights.

Thank you for reading, and we hope you found this guide on converting XLS and CSV files into Parquet with Dremio informative and helpful. If you have any questions or feedback, please feel free to reach out.
