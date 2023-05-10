---
noteId: "fdb83ab0ef4311edbf7e1fae3043dfc4"
tags:
  - "data engineering"
  - "data lakehouse"
  - "dremio"
title: "Resources for Learning more about Catalog level versioning with Project Nessie & Dremio Arctic (Rollbacks, Branching, Tagging and Multi-Table Txns)"
date: "2023-05-10T12:12:03.284Z"
author: "Alex Merced"
category: "data engineering"
bannerImage: "/images/postbanner/2023/B216305A-28E8-48B7-B247-77805DC6E51D.png"

---

Data Quality, Governance, Observability, and Disaster Recovery are issues that are still trying to discover best practices in the world of the data lakehouse. A new trend is rising, borrowing from the practices used by software developers to manage these issues with code bases. This trend is called "Data as Code". Many of the practices this trend is trying to bring to the Lakehouse include:

- Versioning to enable isolating work on branches or marking particular reproducible states through tagging
- Commits to enable time travel and rollbacks
- The ability to use branching and merging to make atomic changes to multiple objects at the same time ( in data terms, multi-table transactions)
- Capturing data in commits to build audibility of who is making what changes and when
- The ability to govern who can access
- Automating the integration of changes (Continuous Integration) and automating publishing of those changes (Continuous Deployment) via CI/CD pipelines

## Project Nessie

Several solutions are arising in approaching this problem from different layers, such as the catalog, [table](https://www.dremio.com/blog/exploring-branch-tags-in-apache-iceberg-using-spark/), and file levels. [Project Nessie](https://projectnessie.org/) is an open-source project that solves these problems from the catalog level. Benefits of Nessie's particular approach:

- Isolate ingestion across your entire catalog by branching it, allowing you to audit and inspect data before publishing without exposing it to consumers and without having to make a "staging" copy of the data (branches do not create data copies like git branches don't duplicate your code).
- Make changes to multiple tables from a branch, then merge those changes as one significant atomic multi-table transaction.
- If a job fails or works in unintended ways, instead of rolling back several tables individually, you can roll back all your tables by rolling back your catalog.
- Manage access to the catalog, limiting which branches/tables a user can access and what kind of operations they can run on it.
- Commit logs can be used as an audit log to have visibility to your catalog updates.
- Nessie operations can all be done via SQL, making it more accessible to data consumers.
- Portability of your tables as they can be accessed by any tool with Nessie support, such as Apache Spark, Apache Flink, Dremio, Presto, and more.

## Project Nessie Resources

**Tutorials:**

- [Getting Started with Project Nessie, Apache Iceberg, and Apache Spark Using Docker](https://www.dremio.com/blog/getting-started-with-project-nessie-apache-iceberg-and-apache-spark-using-docker/)
- [A Notebook for getting started with Project Nessie, Apache Iceberg, and Apache Spark](https://www.dremio.com/blog/a-notebook-for-getting-started-with-project-nessie-apache-iceberg-and-apache-spark/)
- [What is Project Nessie & how to start a Nessie Server](https://www.youtube.com/watch?v=xsQ_uMBbDXI)
- [Create a Data Lakehouse with Apache Iceberg, Project Nessie and Apache Spark](https://www.youtube.com/watch?v=Q3qb93fuQAA)
- [Creating a Local Environment with Nessie, Spark and Apache Iceberg](https://github.com/developer-advocacy-dremio/quick-guides-from-dremio/blob/main/nessie-notebook.md)

## Dremio Arctic

While you can deploy your own Nessie server, you can have a cloud-managed one with some extra features using the Dremio Arctic service. Beyond the amazing catalog-level versioning features that you get with having a Nessie catalog for your tables, Dremio Arctic also provides:

- Automatic table optimization services
- Easy and Intuitive UI to view commit logs, manage branches, and more
- Easy integration with the Dremio Sonar Lakehouse query engine
- Zero Cost to get a catalog up and running in moments with a Dremio Cloud account

## Dremio Arctic Resources

- [Dremio Arctic Demo Video](https://www.youtube.com/watch?v=JCpWfsu-liw&t=684s&pp=ygUNRHJlbWlvIEFyY3RpYw%3D%3D)
- [Introduction to Arctic: Managing Data as Code with Dremio Arctic – Easily ensure data quality in your data lakehouse](https://www.dremio.com/blog/managing-data-as-code-with-dremio-arctic-easily-ensure-data-quality-in-your-data-lakehouse/)
- [Managing Data as Code with Dremio Arctic: Support Machine Learning Experimentation in Your Data Lakehouse](https://www.dremio.com/blog/managing-data-as-code-with-dremio-arctic-support-machine-learning-experimentation-in-your-data-lakehouse/)
- [Multi-Table Transactions on the Lakehouse – Enabled by Dremio Arctic](https://www.dremio.com/blog/multi-table-transactions-on-the-lakehouse-enabled-by-dremio-arctic/)
- [Automatic Iceberg Table Optimization with Dremio Arctic | Apache Iceberg](https://www.youtube.com/watch?v=N4NfvYeuwsY)
- [Gnarly Data Waves Episode 8 - Managing Data as Code](https://www.youtube.com/watch?v=FzOkbCvyE0I&t=1s&pp=ygUNRHJlbWlvIEFyY3RpYw%3D%3D)
- [EP15 - Getting Started with Dremio: Sonar | Arctic Live Demo and Customer Use Cases](https://www.youtube.com/watch?v=l2ocKRPC3zg)
- [EP16 - Easy Data Lakehouse Management with Dremio Arctic’s Automatic Data Optimization](https://www.youtube.com/watch?v=Bux3-J-g01E)
- [Dremio Cloud Tutorial: How to Set Up and Use an Arctic Project](https://www.youtube.com/watch?v=Z19iRHlXtIU)
- [Dremio Arctic with a Notebook](https://github.com/developer-advocacy-dremio/quick-guides-from-dremio/blob/main/arcticexercise.md)

## CI/CD

Essentially you can create automated pipelines that take advantage of Nessies branching using any tool that supports Nessie for example:

- Orchestration Tools
- CRON Jobs
- Severless Functions

These mechanisms can be used to send instructions to Nessie supporting tools like Dremio and Apache Spark. For example:

- Data Lands on S3 triggering a python scripts that sends the appropriate SQL queries to Dremio via Arrow Flight, ODBC or REST
- A pySpark script that runs on a schedule sending instructions to a Spark script

The jobs would follow a similar pattern too:

- Create a branch
- Switch to the branch
- make updates
- validate updates
- if validations are successful, merge changes
- if validations fail, generate error with details for remediation (consumers never exposed to inconsistent or incorrect data)

## Resources on CI/CD with Arctic/Nessie

- [DataOps in action with Nessie, Iceberg and Great Expectations](https://www.youtube.com/watch?v=wYpmqgtFGjg)
- [Subsurface LIVE 23 | CI CD on the Lakehouse - Making Data Changes and Repair Safe and Easy](https://www.youtube.com/watch?v=wYpmqgtFGjg)
