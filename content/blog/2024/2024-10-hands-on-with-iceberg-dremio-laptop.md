---
title: Hands-on with Apache Iceberg & Dremio on Your Laptop within 10 Minutes
date: "2024-10-31"
description: "How to get hands-on with Apache Iceberg"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
  - apache iceberg
---

- [Free Copy of Apache Iceberg the Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberggov&utm_content=alexmerced&utm_term=external_blog)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberggov&utm_content=alexmerced&utm_term=external_blog)
- [Iceberg Lakehouse Engineering Video Playlist](https://www.youtube.com/watch?v=SIriNcVIGJQ&list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe)

Efficiently managing and analyzing data is essential for business success, and the data lakehouse architecture is leading the way in making this easier and more cost-effective. By combining the flexibility of data lakes with the structured performance of data warehouses, lakehouses offer a powerful solution for data storage, querying, and governance.

For this hands-on guide, we’ll dive into setting up a data lakehouse on your own laptop in just ten minutes using **Dremio**, **Nessie**, and **Apache Iceberg**. This setup will enable you to perform analytics on your data seamlessly and leverage a versioned, Git-like approach to data management with pre-configured storage buckets for simplicity.

### Tools We’ll Use:
- **Dremio**: A lakehouse platform that organizes, documents, and queries data from databases, data warehouses, data lakes and lakehouse catalogs in a unified semantic layer, providing seamless access to data for analytics and reporting.
- **Nessie**: A transactional catalog that enables Git-like branching and merging capabilities for data, allowing for easier experimentation and version control.
- **Apache Iceberg**: A data lakehouse table format that turns your data lake into an ACID-compliant structure, supporting operations like time travel, schema evolution, and advanced partitioning.

By the end of this tutorial, you’ll be ready to set up a local lakehouse environment quickly, complete with sample data to explore. Let’s get started and see how easy it can be to work with Dremio and Apache Iceberg on your laptop!

## Environment Setup

Before diving into the data lakehouse setup, let’s ensure your environment is ready. We’ll use **Docker**, a tool that allows you to run applications in isolated environments called "containers." If you’re new to Docker, don’t worry—this guide will walk you through each step!

### Step 1: Install Docker

1. **Download Docker**: Go to [docker.com](https://www.docker.com/products/docker-desktop/) and download Docker Desktop for your operating system (Windows, macOS, or Linux).
2. **Install Docker**: Follow the installation instructions for your operating system. This will include some on-screen prompts to complete the installation process.
3. **Verify Installation**: After installing Docker, open a terminal (Command Prompt, PowerShell, or a terminal app on Linux/macOS) and type:

```bash
   docker --version
```

This command should display the version number if Docker is successfully installed.

Once Docker is installed and running, you’ll have the core tool needed to set up our data lakehouse.

### Step 2: Create a Docker Compose File

With Docker installed, let’s move on to Docker Compose, a tool that helps you define and manage multiple containers with a single configuration file. We’ll use it to set up and start Dremio, Nessie, and MinIO (an S3-compatible storage solution). Docker Compose will also automatically create the storage "buckets" needed in MinIO, so you won’t need to configure them manually.

**Open a Text Editor:** Open any text editor (like VS Code, Notepad, or Sublime Text) and create a new file called docker-compose.yml in a new, empty folder. This file will contain all the configuration needed to launch our environment.

**Add the Docker Compose Configuration:** Copy the following code and paste it into the docker-compose.yml file:

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
  ## tail -f /dev/null is to keep the container running
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

### Explanation of the Code:
This file defines three services: 
- nessie (the catalog)
- minio (the storage server)
- dremio (the query engine).

Each service has specific network settings, ports, and configurations to allow them to communicate with each other.

### Step 3: Start Your Environment
With your docker-compose.yml file saved, it’s time to start your data lakehouse environment!

**Open a Terminal:** Navigate to the folder where you saved the docker-compose.yml file.

**Run Docker Compose:** In your terminal, type:

```bash
docker-compose up -d
```

This command tells Docker to start each of the services specified in docker-compose.yml and run them in the background (the -d flag).

**Wait for Setup to Complete:** It may take a few minutes for all services to start. You’ll see a lot of text in your terminal as each service starts up. When you see lines indicating that each service is "running," the setup is complete.

### Step 4: Verify Each Service is Running
Now that the environment is up, let’s verify that each service is accessible:

- **Dremio:** Open a web browser and go to http://localhost:9047. You should see a Dremio login screen.
- **MinIO:** In a new browser tab, go to http://localhost:9001. Log in with the username admin and password password. You should see the MinIO console, where you can view storage "buckets."
### Step 5: Optional - Shutting Down the Environment
When you’re done with the setup and want to stop the services, simply open a terminal in the same folder where you created the `docker-compose.yml` file and run:

```bash
docker-compose down -v
```

This command will stop and remove all containers, so you can start fresh next time.

The `-v` flag removes any volumes associated with the containers, which is important if you want to start fresh next time.

Congratulations! You now have a fully functional data lakehouse environment running on your laptop. In the next section, we’ll connect Dremio to Nessie and MinIO and start creating and querying tables.

## Getting Started with Dremio: Connecting the Nessie and MinIO Sources

Now that Dremio is up and running, let's connect it to our MinIO buckets, `lakehouse` and `lake`, which will act as the main data sources in our local lakehouse environment. This section will guide you through connecting both the Nessie catalog (using the `lakehouse` bucket) and a general S3-like data lake connection (using the `lake` bucket) in Dremio.

### Step 1: Adding the Nessie Source in Dremio

1. **Open Dremio**: In your web browser, navigate to [http://localhost:9047](http://localhost:9047) to access the Dremio UI.

2. **Add the Nessie Source**:
   - Click on the **"Add Source"** button in the bottom left corner of the Dremio interface.
   - Select **Nessie** from the list of available sources.

3. **Configure the Nessie Source**:
   - You’ll need to fill out both the **General** and **Storage** settings as follows:

   **General Settings**:
   - **Name**: Set the source name to `lakehouse`.
   - **Endpoint URL**: Enter the Nessie API endpoint URL:
     ```
     http://nessie:19120/api/v2
     ```
   - **Authentication**: Select **None** (no additional credentials are required).

   **Storage Settings**:
   - **Access Key**: Set to `admin` (MinIO username).
   - **Secret Key**: Set to `password` (MinIO password).
   - **Root Path**: Set to `lakehouse` (this is the bucket where our Iceberg tables will be stored).
   
   **Connection Properties**:
   - **fs.s3a.path.style.access**: Set this to `true`.
   - **fs.s3a.endpoint**: Set to `minio:9000`.
   - **dremio.s3.compat**: Set to `true`.
   - **Encrypt Connection**: Uncheck this option since we’re running Nessie locally on HTTP.

4. **Save the Source**: Once all settings are configured, click **Save**. The `lakehouse` source will now be connected in Dremio, allowing you to browse and query tables stored in the Nessie catalog.

### Step 2: Adding MinIO as an S3 Source in Dremio (Data Lake Connection)

In addition to Nessie, we’ll set up a general-purpose data lake connection using the `lake` bucket in MinIO. This bucket can store non-Iceberg table data, making it suitable for raw data or other types of files. So if you wanted to upload CSV, JSON, XLS or Parquet files you can put them in the "lake" bucket and view them from this source in Dremio.

1. **Add an S3 Source**:
   - Click the **"Add Source"** button again and select **S3** from the list of sources.

2. **Configure the S3 Source for MinIO**:
   - Use the following settings to connect the `lake` bucket as a secondary source.

   **General Settings**:
   - **Name**: Set the source name to `lake`.
   - **Credentials**: Choose **AWS access key**.
   - **Access Key**: Set to `admin` (MinIO username).
   - **Secret Key**: Set to `password` (MinIO password).
   - **Encrypt Connection**: Uncheck this option since MinIO is running locally.

   **Advanced Options**:
   - **Enable Compatibility Mode**: Set to `true` to ensure compatibility with MinIO.
   - **Root Path**: Set to `/lake` (the bucket name for general storage).

   **Connection Properties**:
   - **fs.s3a.path.style.access**: Set this to `true`.
   - **fs.s3a.endpoint**: Set to `minio:9000`.

3. **Save the Source**: After filling out the configuration, click **Save**. The `lake` bucket is now accessible in Dremio, and you can query the raw data stored in this bucket.

### Next Steps

With both sources connected, you now have access to structured, versioned data in the `lakehouse` bucket and general-purpose data in the `lake` bucket. In the next section, we’ll explore creating and querying Apache Iceberg tables in Dremio to see how easy it is to get started with data lakehouse workflows.

## Running Transactions on Apache Iceberg Tables and Inspecting the Storage

With our environment set up and sources connected, we’re ready to perform some transactions on an Apache Iceberg table in Dremio. After creating and inserting data, we’ll inspect MinIO to see how Dremio stores files in the `lakehouse` bucket. Additionally, we’ll make a `curl` request to Nessie to check the catalog state, confirming our transactions.

### Step 1: Creating an Iceberg Table in Dremio

1. **Open the SQL Editor** in Dremio:
   - In the Dremio UI, select **SQL Runner** from the menu on the left.

2. **Set the Context to Nessie**:
   - In the SQL editor, click on **Context** (top right of the editor) and set it to our Nessie source `lakehouse`. If you don't do this then you'll need to include fully qualified table names in your queries like `lakehouse.customers`.

3. **Create an Iceberg Table**:
   - Run the following SQL to create a new table named `customers` in the `lakehouse` bucket:
     ```sql
     CREATE TABLE customers (
       id INT,
       first_name VARCHAR,
       last_name VARCHAR,
       age INT
     ) PARTITION BY (truncate(1, last_name));
     ```
   - This SQL creates an Apache Iceberg table with a partition on the first letter of `last_name`. The partitioning is handled by Apache Iceberg’s **Hidden Partitioning** feature, which allows for advanced partitioning without additional columns in the schema.

4. **Insert Data into the Table**:
   - Now, add some sample data to the `customers` table:
     ```sql
     INSERT INTO customers (id, first_name, last_name, age) VALUES
     (1, 'John', 'Doe', 28),
     (2, 'Jane', 'Smith', 34),
     (3, 'Alice', 'Johnson', 22),
     (4, 'Bob', 'Williams', 45),
     (5, 'Charlie', 'Brown', 30);
     ```
   - This will insert five records into the `customers` table, each automatically stored and partitioned in the `lakehouse` bucket.

### Step 2: Inspecting Files in MinIO

With data inserted into the `customers` table, let’s take a look at MinIO to verify the files were created as expected.

1. **Open MinIO**:
   - Go to [http://localhost:9001](http://localhost:9001) in your browser, and log in with:
     - **Username**: `admin`
     - **Password**: `password`

2. **Navigate to the `lakehouse` Bucket**:
   - From the MinIO dashboard, click on **Buckets** and select the `lakehouse` bucket.
   - Inside the `lakehouse` bucket, you should see a directory for the `customers` table.
   - Browse through the folders to locate the partitioned files based on the `last_name` column. You’ll find subfolders that store the data by partition, along with metadata files that track the state of the table.

This inspection verifies that Dremio is writing data to the `lakehouse` bucket in Apache Iceberg format, which organizes the data into Parquet files and metadata files.

### Step 3: Checking the State of the Nessie Catalog with `curl`

Now, let’s make a `curl` request to the Nessie catalog to confirm that the `customers` table was created successfully and that its metadata is stored correctly.

1. **Open a Terminal**:
   - In your terminal, run the following command to view the contents of the main branch in Nessie:
     ```bash
     curl -X GET "http://localhost:19120/api/v2/trees/main/entries"
     ```
   - This command retrieves a list of all entries (tables) in the `main` branch of the Nessie catalog.

2. **Review the Response**:
   - The JSON response will contain details about the `customers` table. You should see an entry indicating the presence of `customers` in the catalog, confirming that the table is tracked in Nessie.

3. **Inspect Specific Commit History (Optional)**:
   - To view the specific commit history for transactions on this branch, you can run:
     ```bash
     curl -X GET "http://localhost:19120/api/v2/trees/tree/main/log" \
          -H "Content-Type: application/json"
     ```
   - This command shows a log of all changes made on the `main` branch, providing a Git-like commit history for your data transactions.

### Next Steps

Now that you have verified your transactions and inspected the storage, you can confidently work with Apache Iceberg tables in Dremio, knowing that both the data and metadata are tracked in the Nessie catalog and accessible in MinIO. In the next section, we’ll explore making additional table modifications, like updating partitioning rules, and see how Apache Iceberg handles these changes seamlessly.

## Modifying the Apache Iceberg Table Schema and Partitioning

With our initial `customers` table set up in Dremio, we can take advantage of Apache Iceberg’s flexibility to make schema and partition modifications without requiring a data rewrite. In this section, we’ll add a new column to the table, adjust partitioning, and observe how these changes reflect in MinIO and the Nessie catalog.

### Step 1: Adding a New Column

Suppose we want to add a new column to store customer email addresses. We can easily update the table schema with the following `ALTER TABLE` statement:

1. **Open the SQL Editor** in Dremio:
   - Navigate back to the **SQL Runner**.

2. **Add the Column**:
   - Run the following SQL to add an `email` column to the `customers` table:
     ```sql
     ALTER TABLE customers
     ADD COLUMNS (email VARCHAR);
     ```
   - This command adds the `email` column to the existing table without affecting the existing data.

3. **Verify the Column Addition**:
   - After running the command, you can confirm the addition by querying the `customers` table in Dremio:
     ```sql
     SELECT * FROM customers;
     ```
   - You’ll see an `email` column now appears, ready for data to be added.

### Step 2: Updating Partitioning Rules

Iceberg allows for flexible partitioning rules through **Partition Evolution**, meaning we can change how data is partitioned without rewriting all existing data. Let’s add a new partition rule that organizes data based on the first letter of the `first_name` as well.

1. **Add a Partition Field**:
   - To partition data by the first letter of `first_name`, use the following SQL:
     ```sql
     ALTER TABLE customers
     ADD PARTITION FIELD truncate(1, first_name);
     ```
   - This command instructs Iceberg to partition any new data by both the first letters of `last_name` and `first_name`.

2. **Insert Additional Data to Test the New Partitioning**:
   - Let’s insert some more records to see how the new partition structure organizes the data:
     ```sql
     INSERT INTO customers (id, first_name, last_name, age, email) VALUES
     (6, 'Emily', 'Adams', 29, 'emily.adams@example.com'),
     (7, 'Frank', 'Baker', 35, 'frank.baker@example.com'),
     (8, 'Grace', 'Clark', 41, 'grace.clark@example.com');
     ```
   - This data will be partitioned according to both `first_name` and `last_name`, following the new rules we set.

### Step 3: Inspect the New Partitions in MinIO

1. **Open MinIO** and navigate to the `lakehouse` bucket:
   - Go to [http://localhost:9001](http://localhost:9001), and log in with:
     - **Username**: `admin`
     - **Password**: `password`

2. **Locate the Updated `customers` Folder**:
   - Within the `lakehouse` bucket, locate the `customers` table folder.
   - Open the folder structure to view the newly created subfolders, representing the partitioning by `last_name` and `first_name` that we configured. You should see the additional folders and Parquet files for each new partition based on `first_name`.

### Step 4: Confirm the Changes in Nessie with `curl`

Finally, let’s make a `curl` request to the Nessie catalog to verify that the schema and partitioning changes are recorded in the catalog’s metadata.

1. **Open a Terminal** and run the following command to check the schema:
   ```bash
   curl -X GET "http://localhost:19120/api/v2/trees/main/history"
    ```
This will return a JSON response listing the recent commits to the `main` branch, including the schema and partitioning updates.

### Summary

We’ve successfully modified the schema and partitioning of an Apache Iceberg table in Dremio, and we can observe these changes directly in MinIO’s file structure and the Nessie catalog’s metadata. This example demonstrates the flexibility of Iceberg in managing evolving data schemas and partitioning strategies in real-time, without requiring downtime or data rewrites. In the next section, we’ll explore how to utilize Iceberg’s version control capabilities for branching and merging datasets within the Nessie catalog.

## Branching and Merging with Nessie: Version Control for Data

One of the powerful features of using Nessie with Apache Iceberg is its Git-like branching and merging functionality. Branching allows you to create isolated environments for data modifications, which can then be merged back into the main branch once verified. This section will walk you through creating a branch, performing data modifications within that branch, and then merging those changes back to the main branch.

### Step 1: Creating a Branch

Let’s start by creating a new branch in Nessie. This branch will allow us to perform data transactions without impacting the main data branch, ideal for testing and experimenting.

1. **Open the SQL Editor** in Dremio.
2. **Create a New Branch**:
   - Run the following SQL to create a new branch named `development` in the `lakehouse` catalog:
     ```sql
     CREATE BRANCH development IN lakehouse;
     ```
   - This command creates a new branch in the Nessie catalog, providing an isolated environment for data changes.

3. **Switch to the Development Branch**:
   - Now, let’s set our context to the `development` branch either using the context selector or using the following sql before any queries so that any changes we make only affect this branch:
     ```sql
     USE BRANCH development IN lakehouse;
     ```

### Step 2: Performing Data Modifications on the Branch

With the `development` branch active, let’s modify the `customers` table by adding new data. This data will remain isolated on the `development` branch until we choose to merge it back to `main`.

1. **Insert Additional Records**:
   - Run the following SQL to add new entries to the `customers` table (make sure to either use the context selector or use the `use branch` sql before any queries so that any changes we make only affect this branch):
     ```sql
     INSERT INTO customers (id, first_name, last_name, age, email) VALUES
     (9, 'Holly', 'Grant', 31, 'holly.grant@example.com'),
     (10, 'Ian', 'Young', 27, 'ian.young@example.com'),
     (11, 'Jack', 'Diaz', 39, 'jack.diaz@example.com');
     ```
   - These records are added to the `customers` table on the `development` branch only, meaning they won’t affect the main branch until merged.

2. **Verify the Records in the Development Branch**:
   - You can verify the new records by running:
     ```sql
     SELECT * FROM customers AT BRANCH development;
     SELECT * FROM customers AT BRANCH main;
     ```
   - This query will display the data, including the recently inserted records, as it is within the context of the `development` and `main` branches.

### Step 3: Merging Changes Back to the Main Branch

Once satisfied with the changes in `development`, we can merge the `development` branch back into `main`, making these records available to all users accessing the main branch.

1. **Switch to the Main Branch**:
   - First, change the context back to the `main` branch:
     ```sql
     USE BRANCH main IN lakehouse;
     ```

2. **Merge the Development Branch**:
   - Now, merge the `development` branch into `main` using the following SQL:
     ```sql
     MERGE BRANCH development INTO main IN lakehouse;
     ```
   - This command brings all changes from `development` into `main`, adding the new records to the main version of the `customers` table.

3. **Verify the Merge**:
   - To confirm the records are now in `main`, run:
     ```sql
     SELECT * FROM customers AT BRANCH main;
     ```
   - You should see all records, including those added in the `development` branch, are now present in the `main` branch.

### Step 4: Verifying the Branching Activity in Nessie with `curl`

You can use `curl` commands to check the branch status and view commit logs in Nessie, providing additional validation of the branching and merging activity.

1. **List Branches**:
   - Run the following `curl` command to list all branches in the `lakehouse` catalog:
     ```bash
     curl -X GET "http://localhost:19120/api/v2/trees/"
     ```
   - The response will include the `main` and `development` branches, confirming the branch creation.

2. **Check the Commit Log**:
   - To view a log of commits, including the merge from `development` to `main`, run:
     ```bash
     curl -X GET "http://localhost:19120/api/v2/trees/main/history"
     ```

     ```bash
     curl -X GET "http://localhost:19120/api/v2/trees/development/history"
     ```
   - This log will show each commit, giving you a clear view of data versioning over time.

### Summary

Branching and merging in Nessie allows you to safely experiment with data modifications in an isolated environment, integrating those changes back into the main dataset only when ready. This workflow is invaluable for testing data updates, creating data snapshots, or managing changes for compliance purposes. In the next section, we’ll explore how to use Nessie tags to mark important states in your data, further enhancing data version control.

## Tagging Important States with Nessie: Creating Data Snapshots

In addition to branching, Nessie also offers the ability to tag specific states of your data, making it easy to create snapshots at critical moments. Tags allow you to mark key data versions—such as a quarterly report cutoff or pre-migration data state—so you can refer back to them if needed.

In this section, we’ll walk through creating tags in Nessie to capture the current state of the data and explore how to use tags for historical analysis or recovery.

### Step 1: Creating a Tag

Let’s create a tag on the `main` branch to mark an important point in the dataset, such as the completion of initial data loading. This tag will serve as a snapshot that we can return to if necessary.

1. **Open the SQL Editor** in Dremio.
2. **Create a Tag**:
   - Run the following SQL command to create a tag called `initial_load` on the `main` branch:
     ```sql
     CREATE TAG initial_load AT BRANCH main IN lakehouse;
     ```
   - This tag marks the state of all tables in the `lakehouse` catalog on the `main` branch at the current moment, capturing the data exactly as it is now.

### Step 2: Modifying the Data on the Main Branch

To understand the usefulness of tags, let’s make a few changes to the `customers` table on the `main` branch. Later, we can use the tag to compare or even restore to the original dataset state if needed.

1. **Insert Additional Records**:
   - Add some new data to the `customers` table to simulate further data processing:
     ```sql
     INSERT INTO customers (id, first_name, last_name, age, email) VALUES
     (12, 'Kate', 'Morgan', 45, 'kate.morgan@example.com'),
     (13, 'Luke', 'Rogers', 33, 'luke.rogers@example.com');
     ```

2. **Verify Changes**:
   - Run the following query to confirm that the new records have been added:
     ```sql
     SELECT * FROM customers;
     ```

### Step 3: Accessing Data from a Specific Tag

Tags in Nessie allow you to view the dataset as it was at the time the tag was created. To access the data at the `initial_load` state, we can specify the tag as the reference point in our queries.

1. **Query the Data Using the Tag**:
   - Use the following SQL command to switch to the `initial_load` tag and view the dataset as it was at that point:
     ```sql
     USE TAG initial_load IN lakehouse;
     SELECT * FROM customers;
     ```
   - This query will display the `customers` table as it was when the `initial_load` tag was created, without the new records that were added afterward.

2. **Return to the Main Branch**:
   - Once you are done exploring the `initial_load` state, switch back to the `main` branch to continue working with the latest data:
     ```sql
     USE BRANCH main IN lakehouse;
     ```

### Step 4: Verifying the Tag Creation with `curl`

To verify the tag’s existence in the Nessie catalog, we can make a `curl` request to list all tags, including `initial_load`.

1. **List Tags**:
   - Run the following `curl` command to retrieve all tags in the `lakehouse` catalog:
     ```bash
     curl -X GET "http://localhost:19120/api/v2/trees/tags" \
          -H "Content-Type: application/json"
     ```
   - The JSON response will list all tags, including the `initial_load` tag you created.

2. **Review Tag Details** (Optional):
   - To get detailed information about the `initial_load` tag, including its exact commit reference, you can use:
     ```bash
     curl -X GET "http://localhost:19120/api/v2/trees/tags/initial_load" \
          -H "Content-Type: application/json"
     ```

### Summary

Tags in Nessie provide a reliable way to snapshot important states of your data. By creating tags at critical points, you can easily access previous states of your data, helping to support data auditing, historical reporting, and data recovery. In the next section, we’ll cover querying the Apache Iceberg Metadata tables.

## Exploring Iceberg Metadata Tables in Dremio

Iceberg metadata tables offer insights into the underlying structure and evolution of your data. These tables contain information about data files, snapshots, partition details, and more, allowing you to track changes, troubleshoot issues, and optimize queries. Dremio makes querying Iceberg metadata simple, giving you valuable context on your data lakehouse. 

In this section, we’ll explore the following Iceberg metadata tables:
- `table_files`: Lists data files and their statistics.
- `table_history`: Displays historical snapshots.
- `table_manifests`: Shows metadata about manifest files.
- `table_partitions`: Provides details on partitions.
- `table_snapshot`: Shows information on each snapshot.

### Step 1: Querying Data File Metadata with `table_files`

The `table_files` metadata table provides details on each data file in the table, such as the file path, size, record count, and more. This is useful for understanding storage distribution and optimizing queries.

1. **Query the Data Files**:
   - Run the following SQL command to retrieve data file information for the `customers` table:
     ```sql
     SELECT * FROM TABLE(table_files('customers'));
     ```
   - You’ll see results with columns like `file_path`, `file_size_in_bytes`, `record_count`, and more, giving insights into each file's specifics.

### Step 2: Exploring Table History with `table_history`

Iceberg tracks the history of a table’s snapshots, which allows you to review past states or even perform time-travel queries. The `table_history` table displays each snapshot’s ID and timestamp.

1. **Query the Table History**:
   - Use the following SQL to retrieve the history of the `customers` table:
     ```sql
     SELECT * FROM TABLE(table_history('customers'));
     ```
   - This query will return a list of snapshots, showing when each snapshot was created (`made_current_at`), the `snapshot_id`, and any `parent_id` linking to previous snapshots.

### Step 3: Analyzing Manifests with `table_manifests`

Manifest files are metadata files in Iceberg that track changes in data files. The `table_manifests` table lets you inspect details like the number of files added or removed per snapshot, helping you monitor data evolution and resource usage.

1. **Query Manifest Metadata**:
   - Run the following SQL to view manifest metadata for the `customers` table:
     ```sql
     SELECT * FROM TABLE(table_manifests('customers'));
     ```
   - The results will include fields like `path`, `added_data_files_count`, and `deleted_data_files_count`, which show how each manifest contributes to the table’s state.

### Step 4: Reviewing Partition Information with `table_partitions`

The `table_partitions` table provides details on each partition in the table, including the number of records and files in each partition. This helps with understanding how data is distributed across partitions and can be used to fine-tune partitioning strategies.

1. **Query Partition Statistics**:
   - Run the following query to get partition statistics for the `customers` table:
     ```sql
     SELECT * FROM TABLE(table_partitions('customers'));
     ```
   - You’ll see fields such as `partition`, `record_count`, and `file_count`, which show the breakdown of data across partitions, helping identify skewed partitions or performance bottlenecks.

### Step 5: Examining Snapshots with `table_snapshot`

The `table_snapshot` table provides a summary of each snapshot, including the operation (e.g., `append`, `overwrite`), the commit timestamp, and any manifest files associated with the snapshot.

1. **Query Snapshot Information**:
   - Run the following SQL to see snapshot details for the `customers` table:
     ```sql
     SELECT * FROM TABLE(table_snapshot('customers'));
     ```
   - The result will include fields like `committed_at`, `operation`, and `summary`, providing a high-level view of each snapshot and its impact on the table.

### Using Metadata for Time-Travel Queries

The Iceberg metadata tables also support time-travel queries, enabling you to query the data as it was at a specific snapshot or timestamp. This can be especially useful for auditing, troubleshooting, or recreating analysis from past data states.

1. **Perform a Time-Travel Query**:
   - Suppose you want to view the data in the `customers` table at a specific snapshot. First, retrieve the `snapshot_id` using the `table_history` or `table_snapshot` table.
   - Then, run a query like the following to access data at that snapshot:
     ```sql
     SELECT * FROM customers AT SNAPSHOT '<snapshot_id>';
     ```
   - Replace `<snapshot_id>` with the ID from the metadata tables to view the data as it was at that specific point.

### Summary

Iceberg metadata tables in Dremio provide a wealth of information on table structure, partitioning, and versioning. These tables are essential for monitoring table evolution, diagnosing performance issues, and executing advanced analytics tasks like time travel.

## Conclusion

Congratulations! You’ve just set up a powerful data lakehouse environment on your laptop with Apache Iceberg, Dremio, and Nessie, and explored hands-on techniques for managing and analyzing data. By leveraging the strengths of these open-source tools, you now have the flexibility of data lakes with the performance and reliability of data warehouses—right on your local machine.

From creating and querying Iceberg tables to managing branches and snapshots with Nessie’s Git-like controls, you’ve seen how this stack can simplify complex data workflows. Using Dremio’s intuitive interface, you connected sources, ran queries, explored metadata, and learned how to use Iceberg's versioning and partitioning capabilities for powerful insights. Iceberg metadata tables also provide detailed information on data structure, making it easy to track changes, optimize storage, and even run time-travel queries.

This hands-on setup is just the beginning. As your data grows, you can explore Dremio’s cloud deployment options and advanced features like reflections and incremental refreshes for scaling analytics. By mastering this foundational environment, you’re well-prepared to build efficient, scalable data lakehouse solutions that balance data accessibility, cost savings, and performance.

If you enjoyed this experience, consider diving deeper into Dremio Cloud or [exploring further capabilities with Iceberg and Nessie by deploying a self-managed single node instance](https://www.dremio.com/blog/evaluating-dremio-deploying-a-single-node-instance-on-a-vm/?utm_source=ev_externalblog&utm_medium=influencer&utm_campaign=handson10minutes&utm_content=alexmerced). Happy querying!

