---
title: Apache Iceberg, Git-Like Catalog Versioning and Data Lakehouse Management - Pillars of a Robust Data Lakehouse Platform
date: "2024-01-03"
description: "This is where the combined power of Dremio’s Lakehouse Management features and Project Nessie's catalog-level versioning comes into play."
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - Data Lakehouse
  - Data Lake
  - Apache Iceberg
---

Managing vast amounts of data efficiently and effectively is crucial for any organization aiming to leverage its data for strategic decisions. The key to unlocking this potential lies in advanced data management practices, particularly in versioning and catalog management. This is where the combined power of Dremio’s Lakehouse Management features and Project Nessie's catalog-level versioning comes into play.

> [Blog: Try Dremio and Nessie on your laptop](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/)

Imagine managing your data with the same flexibility and ease as code versioning in Git. That's the revolutionary idea behind Project Nessie. It brings Git-like semantics to data, enabling data teams to handle versioning at the catalog level with unprecedented ease. This approach to data versioning not only enhances data reliability and reproducibility but also opens up new possibilities for data experimentation and rollback, without the risk of data corruption or loss.

> [Blog: BI Dashboard Acceleration with Dremio's Reflections](https://www.dremio.com/blog/bi-dashboard-acceleration-cubes-extracts-and-dremios-reflections/)

[Dremio’s Lakehouse Management features](https://docs.dremio.com/cloud/arctic/) build upon Nessie's capabilities, offering a user-friendly interface that simplifies monitoring and managing the data catalog. The seamless integration with Project Nessie means that Dremio users can enjoy all the benefits of catalog versioning while leveraging a platform that is intuitive and easy to navigate.

> [Video: ZeroETL & Virtual Data Marts - Cutting Edge Data Lakehouse Engineering](https://www.youtube.com/watch?v=mDwpsg8btto)

One of the standout features of Dremio's Lakehouse Management is its [automated maintenance and cleanup of Apache Iceberg tables](https://docs.dremio.com/cloud/arctic/automatic-optimization). This automation not only reduces the manual workload for data teams but also ensures that the data lakehouse remains efficient, organized, and free from redundant or obsolete data.

### Catalog Versioning on the Dremio Lakehouse Platform

To truly appreciate the impact of these advancements in data management, let’s dive into a practical example. This example can be in any Dremio environment with a self-managed Nessie catalog or an Arctic catalog from Dremio Cloud. We'll breakdown this example after the code snippet.

```sql
-- Creating the main employee data table in the default branch
CREATE TABLE HR_EmployeeData (
    employeeId INT,
    employeeName VARCHAR,
    department VARCHAR,
    salary FLOAT,
    startDate DATE
);

-- Creating a staging table for incoming employee data updates in the default branch
CREATE TABLE HR_StagingEmployeeData (
    employeeId INT,
    employeeName VARCHAR,
    department VARCHAR,
    salary FLOAT,
    startDate DATE
);

-- Inserting sample employee data into the staging table
INSERT INTO HR_StagingEmployeeData (employeeId, employeeName, department, salary, startDate) VALUES
(1, 'John Doe', 'Finance', 55000, '2021-01-01'),
(2, 'Jane Smith', 'Marketing', -48000, '2022-01-02'),  -- Negative salary (problematic)
(3, 'Alice Johnson', 'IT', 62000, '2023-02-15');       -- Future date (problematic)

-- Creating a new branch for data integration
CREATE BRANCH HR_dataIntegration_010224;

-- Switching to the dataIntegration branch
USE BRANCH HR_dataIntegration_010224;

-- Merging staging data into the EmployeeData table on the dataIntegration branch
MERGE INTO HR_EmployeeData AS target
USING HR_StagingEmployeeData AS source
ON target.employeeId = source.employeeId
WHEN MATCHED THEN
    UPDATE SET employeeName = source.employeeName, department = source.department, salary = source.salary, startDate = source.startDate
WHEN NOT MATCHED THEN
    INSERT (employeeId, employeeName, department, salary, startDate) VALUES (source.employeeId, source.employeeName, source.department, source.salary, source.startDate);

-- Performing data quality checks on the dataIntegration branch
-- Check for non-negative salaries
SELECT COUNT(*) AS InvalidSalaryCount
FROM HR_EmployeeData
WHERE salary < 0;

-- Check for valid start dates (not in the future)
SELECT COUNT(*) AS InvalidStartDateCount
FROM HR_EmployeeData
WHERE startDate > CURRENT_DATE;

-- QUERY MAIN BRANCH
SELECT * FROM HR_EmployeeData AT BRANCH main;

-- QUERY INGESTION BRANCH
SELECT * FROM HR_EmployeeData AT BRANCH HR_dataIntegration_010224;

-- Assuming checks have passed, switch back to the main branch and merge changes from dataIntegration
USE BRANCH main;
MERGE BRANCH HR_dataIntegration_010224 INTO main;

-- QUERY MAIN BRANCH
SELECT * FROM HR_EmployeeData AT BRANCH main;

-- QUERY INGESTION BRANCH
SELECT * FROM HR_EmployeeData AT BRANCH HR_dataIntegration_010224;

-- The checks for data quality (negative salaries and future start dates) are simplified for this example.
-- In a real-world scenario, more sophisticated validation logic and error handling would be required.
```

In our scenario, we start by establishing two tables within our Dremio environment:

- **DACSalesData**: This is the main table where we store consolidated sales data.
- **DACStagingSalesData**: This staging table is used to manage incoming sales data before it's confirmed for integration into the main table.

```sql
CREATE TABLE DACSalesData (id INT, productId INT, saleAmount FLOAT, saleDate DATE);
CREATE TABLE DACStagingSalesData (id INT, productId INT, saleAmount FLOAT, saleDate DATE);
```
These tables represent a typical data setup in a lakehouse, where data is ingested, staged, and then integrated.

We simulate real-world data entries by inserting sample sales records into the `DACStagingSalesData` table. This data includes various scenarios like standard sales, negative amounts (perhaps due to refunds or errors), and future-dated sales (possibly indicating scheduled transactions or data entry errors).

```sql
INSERT INTO DACStagingSalesData (id, productId, saleAmount, saleDate) VALUES
(1, 101, 150.0, '2022-01-01'),
(2, 102, -50.0, '2022-01-02'),
(3, 103, 200.0, '2023-01-03');
```

Here’s where Nessie’s branching model plays a pivotal role. We create a new branch called dataIntegration_010224 for integrating our staging data. This branch acts as a sandbox where we can safely test and validate our data before it affects the main dataset.

```sql
CREATE BRANCH dataIntegration_010224;
USE BRANCH dataIntegration_010224;
```

This branching mechanism is akin to Git workflows, providing a safe space for data manipulation without impacting the main data branch.

We use the MERGE INTO statement to integrate data from the staging table into the main sales data table.

```sql
MERGE INTO DACSalesData AS target
USING DACStagingSalesData AS source
ON target.id = source.id ...
```

Before finalizing the integration, we perform critical data quality checks. We scrutinize the data for negative sales amounts and future-dated records, ensuring the integrity and accuracy of our sales data.

```sql
SELECT COUNT(*) AS InvalidAmountCount FROM DACSalesData WHERE saleAmount < 0;
SELECT COUNT(*) AS InvalidDateCount FROM DACSalesData WHERE saleDate > CURRENT_DATE;
```

Upon successful validation, we switch back to the main branch and merge our verified data from the dataIntegration_010224 branch. This process highlights the strength of Nessie's versioning system, ensuring that our main dataset remains pristine and error-free.

```sql
USE BRANCH main;
MERGE BRANCH dataIntegration_010224 INTO main;
```

Through this example, we've seen how Dremio and Project Nessie provide an efficient, reliable, and intuitive platform for managing and versioning data in a lakehouse architecture. The combination of Dremio's user-friendly interface and Nessie's robust versioning capabilities, including branching and merging, empowers data teams to handle complex data workflows with ease. This not only enhances data integrity but also accelerates the decision-making process, making it an invaluable asset in today's data-centric landscape.