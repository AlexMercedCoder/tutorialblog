---
title: 
date: "2022-07-18"
description: "Engineer a Data Lakehouse with Apache Iceberg"
author: "Alex Merced"
category: "frontend"
bannerImage: "/images/postbanner/2022/batch-streaming.png"
tags:
  - data engineering
  - data lake
---

As a Developer Advocate for [Dremio](https://www.dremio.com) I spend a lot of time doing research on technology and best practices around engineering Data Lakehouses and sharing what I learn through content for [Subsurface - The Data Lakehouse Community](https://www.dremio.com/subsurface). One of the major topics I've been diving deep into is the topic of Data Lakehouse Table Formats, these allow you to take the files on your data lake and group them into tables data processing engines like Dremio can operate on.

What I'd like to do today is show you how to very quickly get a docker container up and running to get hands on and try Apache Iceberg with Spark, do keep an eye out for an even more in-depth introduction on Subsurface. Before we get into our exercise, here is some content to help get you introduced to Apache Iceberg and the world of Data Lakehouse table formats.

**Introduction to Table Formats and Apache Iceberg**
- [Meetup: Comparison of Data Lakehouse Table Formats](https://www.dremio.com/subsurface/subsurface-meetup-comparison-of-data-lakehouse-table-formats/)
- [Meetup: Apache Iceberg and Architectural Look Under the Covers](https://hello.dremio.com/webinar-apache-iceberg-an-architectural-look-under-the-covers-reg.html)
- [DataNation Podcast: Episode of Table Formats](https://host.alexmercedpodcast.com/podcast/data-lakehouse-table-formats-iceberg-hudi-delta-lake/)

**Other Content on Apache Iceberg**
- [Blog: How maintain Apache Iceberg Tables](https://www.dremio.com/subsurface/maintaining-iceberg-tables-compaction-expiring-snapshots-and-more/)
- [Blog: Apache Iceberg's Hidden Partitioning](https://www.dremio.com/subsurface/fewer-accidental-full-table-scans-brought-to-you-by-apache-icebergs-hidden-partitioning/)
- [Blog: Migrating Apache Iceberg tables from Hive](https://www.dremio.com/subsurface/how-to-migrate-a-hive-table-to-an-iceberg-table/)
- [Blog: Hands-on Hive Migration Exercise](https://www.dremio.com/subsurface/migrating-a-hive-table-to-an-iceberg-table-hands-on-tutorial/)
- [Blog: Table Format Comparison (Iceberg, Hudi, Delta Lake)](https://www.dremio.com/subsurface/comparison-of-data-lake-table-formats-iceberg-hudi-and-delta-lake/)
- [Blog: Table Format Comparison - Governance](https://www.dremio.com/subsurface/table-format-governance-and-community-contributions-apache-iceberg-apache-hudi-and-delta-lake/)
- [Blog: Table Format Comparison - Partitioning](https://www.dremio.com/subsurface/table-format-partitioning-comparison/)

## Setting Up a Practice Environment

For this tutorial you do need to have Docker installed, as we will be using this docker image I created for easy hands on experimenting with Apache Iceberg, Apache Hudi and Delta Lake.

[alexmerced/table-format-playground](https://hub.docker.com/r/alexmerced/table-format-playground)

You can get this up and running easily with the following command:

```
docker run -it --name format-playground alexmerced/table-format-playground
```

*Note: This container was built from 64-bit Linux machine, so the image may not work on an M1/ARM chipset. All you have to do is rebuild the image, you can find the dockerfiles for this image in [this repo](https://github.com/AlexMercedCoder/apache-iceberg-docker-starter-image/blob/main/TABLEFORMAT.DOCKERFILE).*

Once the docker image is running you can easily open up Spark with any of the table formats with the following commands:

- `iceberg-init` - to open Spark Shell with Apache Iceberg configured
- `hudi-init` - to open Spark Shell with Apache Hudi configured
- `delta-init` - to open Sparh Shell with Delta Lake configured.

This blog will focus on Apache Iceberg, but feel free to play with the other table formats using their documentation.

## Getting Hands On with Apache Iceberg

- Start the Docker Container `docker run -it --name format-playground alexmerced/table-format-playground`

- Open Spark with Iceberg `iceberg-init`

Now we are inside of SparkSQL where we can run SQL statements against our Iceberg catalog that was configured by the `iceberg-init` script. If you are curious to the settings I used you can run `cat iceberg-init.bash` back in terminal.

#### Creating a Table in Iceberg

Keep in mind, we are not working with a traditional database but with a [data lakehouse](https://dev.to/alexmercedcoder/introduction-to-the-world-of-data-oltp-olap-data-warehouses-data-lakes-and-more-2me7). So we are creating and reading files that would exist in your data lake storage (AWS/Azure/Google Cloud). So it may feel like working with a traditional database, and that is the beauty that table formats like Iceberg enable, working with files stored in our data lake in the same way we work with data in a database or data warehouse.

To create a new Iceberg table we can just run the following command.

```sql
CREATE TABLE iceberg.cool_people (name string) using ICEBERG;
```

Looks like a regular run of the mill SQL statement (if unfamiliar with SQL, learn more [here](https://www.youtube.com/playlist?list=PLY6oTPmKnKbb8R-o64IT1vLp5mUTXUuyx)), but there is a few things to call out.

- `iceberg.cool_people` in Spark we have to configure a name for our catalog of tables, in my script I called it "iceberg", so `iceberg.cool_people` means I'm creating a table called `cool_people` in my catalog called `iceberg`.

- `using ICEBERG` clause tells Spark to use Iceberg to create the table instead of its default of using Hive.

*Note: the time it takes to complete these statements may vary as we're running it in a docker container on our computer. Spark is software meant to be running on many computers in a cluster, so keep that in mind when working with Spark or any MPP (Massively Parallel Processing) tool on a single computer.*

#### Adding Some Records

Run the following:

```sql
INSERT INTO iceberg.cool_people VALUES ("Claudio Sanchez"), ("Freddie Mercury"), ("Cedric Bixler");
```

*Bonus points if you get the musical references*

#### Querying the Records

Run the following:

```sql
SELECT * FROM iceberg.cool_people;
```

#### Ending the Session

- To quit out of SparkSQL `exit;`

- To quit out the docker container `exit`

If you want to use this container again in the future:

- `docker start format-playground`

- `docker attach format-playground`


## Conclusion

Now you know how to quickly set yourself up so you can experiment with Apache Iceberg. Check out their [docs](https://iceberg.apache.org/docs/latest/spark-ddl/) for many of the great features that exist in Iceberg such as Time Travel, Hidden Partitioning, Partition Evolution, Schema Evolution, ACID transactions and more.

One of the best aspects of Iceberg is that so many tools are building support for Iceberg such as Dremio (which is also an Iceberg contributor). Dremio provides the following for working with Iceberg on their Dremio Cloud platform which allows you to create an open data lakehouse free of software/licensing costs enabling companies of any size to start building sophisticated and open data pipelines:

- The ability to query Iceberg tables using the [Sonar Query Engine](https://www.dremio.com/platform/sonar/)
- Full Iceberg DML to run deletes/updates/upserts on your Iceberg tables from the [Sonar Query Engine](https://www.dremio.com/platform/sonar/)
- The ability to use a Nessie based catalog for your Iceberg tables using the [Arctic Intelligent Metastore](https://www.dremio.com/platform/arctic/) (Enables Git like features on your data)

Keep an eye out for more in-depth Iceberg tutorials on the [Subsurface Website](https://www.dremio.com/subsurface) and make sure to follow me on [twitter](https://www.twitter.com/amdatalakehouse) to not miss any of my future Data Lakehouse content.

*Note: for web development content, follow [this twitter account](https://www.twitter.com/alexmercedcoder)*



