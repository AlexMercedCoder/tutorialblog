---
title: ACID Guarantees and Apache Iceberg - Turning Any Storage into a Data Warehouse
date: "2024-08-15"
description: "What are ACID Guarantees? WHy do they matter?"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
---

Apache Iceberg has become a prominent name in the data world, with numerous platforms integrating support for Iceberg tables as part of the growing open data lakehouse ecosystem. A key feature often highlighted is Iceberg's ability to enable ACID transactions. In this blog, I will explore what ACID guarantees mean and how Iceberg delivers them, to help you better understand the value Apache Iceberg brings to the table.

## What are ACID Guarantees?

ACID is an acronym that outlines the key guarantees a data system should provide—guarantees that are typically offered by most SQL-based databases and data warehouses. These guarantees include:

- **Atomicity**: This ensures that when a change is made, it either completes successfully or doesn't occur at all. This prevents partial changes, which can be difficult and time-consuming to resolve. If a change doesn't succeed, you can simply retry it without worry.
  
- **Consistency**: This ensures that everyone accessing the data sees the same version of it, maintaining uniformity across the system.
  
- **Isolation**: This allows multiple users to make updates or query data simultaneously without interfering with one another.
  
- **Durability**: This guarantees that once data is stored, it remains available for future access.

## How Databases and Data Warehouses Do ACID

Database and Data Warehouse systems manage these guarantees by tightly coupling all the functions of a data system within their software. Their software writes data to storage in a format they control, employs its own method to catalog the written data into different tables to consistently return the correct data, and has built-in mechanisms to prevent concurrent transactions from affecting each other or allowing partial completion. These guarantees are possible because every aspect of the system is designed to work seamlessly together, effectively trapping the data within the system.

## Apache Iceberg Unleashes ACID on Data Lakes

A Lakehouse Table Format like Apache Iceberg takes what previously required tightly coupled systems and achieves it by creating a specification for a series of metadata files that define a table and the individual files from storage that belong to that table. This metadata inherently ensures consistency, as instead of manually listing which files constitute a dataset, users can simply point their tools to the metadata to get a consistent definition.

To incorporate atomicity and isolation, Iceberg introduces the concept of a catalog, which acts as both an arbiter of truth and a traffic controller for those requesting to update or read particular tables. An update isn't visible to readers until the catalog is updated with the address of the newest metadata from the successful transaction. If a transaction partially completes and fails, the data is never exposed since the catalog never references it. Each update to the table is assigned a sequence number, allowing subsequent updates to predict what number they should receive and double-check whether other transactions have completed before committing their own. This approach effectively turns many of the traditional guarantees into file-based operations rather than software-based, with the software that fills in the gaps being decoupled and modular. This creates a plug-and-play data system that doesn't lock the data within any particular layer.


## Conclusion

Apache Iceberg represents a significant evolution in how ACID guarantees can be applied turning storage system based data lakes into data warehouse like data lakehouses. By decoupling the traditional functions of databases and data warehouses, Iceberg empowers data lakes with the ability to maintain consistency, atomicity, isolation, and durability without the need for tightly coupled systems. This flexibility allows for a modular, scalable, and open architecture that can adapt to various use cases and integrate with a wide range of tools.

## Resources to Learn More about Iceberg

- [Apache Iceberg 101](https://www.dremio.com/lakehouse-deep-dives/apache-iceberg-101/?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=iceberg-acid)
- [Hands-on Intro with Apache iceberg](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=iceberg-acid)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=iceberg-acid)
- [Free Copy Of Apache Iceberg: The Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=alexmerced&utm_medium=external_blog&utm_campaign=iceberg-acid)
