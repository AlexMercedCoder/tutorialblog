---
title: Understanding Spark Configurations with Apache Iceberg
date: "2022-11-22"
description: "How to configure Spark for using Apache Iceberg"
author: "Alex Merced"
category: "data"
bannerImage: "/images/postbanner/2022/5reasonsdremio.png"
tags:
  - Apache Iceberg
  - data
---

## Apache Iceberg
[Apache Iceberg is quickly becoming the industry standard for interfacing with data on data lakes](https://www.dremio.com/blog/why-should-i-care-about-table-formats-like-apache-iceberg/). A lot of the time when people first [try out Iceberg they do so using Apache Spark](https://www.dremio.com/subsurface/introduction-to-apache-iceberg-using-spark/).

Often to start spark up you may run a command like this: 

```
spark-sql --packages org.apache.iceberg:iceberg-spark-runtime-3.2_2.12:1.0.0\
    --conf spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions \
    --conf spark.sql.catalog.spark_catalog=org.apache.iceberg.spark.SparkSessionCatalog \
    --conf spark.sql.catalog.spark_catalog.type=hive \
    --conf spark.sql.catalog.local=org.apache.iceberg.spark.SparkCatalog \
    --conf spark.sql.catalog.local.type=hadoop \
    --conf spark.sql.catalog.local.warehouse=$PWD/warehouse
```

The goal of this article will to help demystify this so you can configure Spark for Iceberg in any context.

## Spark Configurations

Spark configs can be defined in a few ways:

- As flags when starting Spark
- Using Imperitive function calls 

#### Flags

There are are several flags you can pass to the `spark-shell` or `spark-sql` commands.

- `--package` will identify maven packages you want installed and useable during the Spark session

```
--packages org.projectnessie:nessie-spark-3.2-extensions:0.43.0,org.apache.iceberg:iceberg-spark-runtime-3.2_2.12:0.14.0,software.amazon.awssdk:bundle:2.17.178,software.amazon.awssdk:url-connection-client:2.17.178
```

- `--jar` will allow you to pass paths to existing 

```
--jars /home/docker/iceberg-spark-runtime-3.2_2.12-1.0.0.jar,/home/docker/nessie-spark-extensions-3.2_2.12-0.44.0.jar
```

- `--conf` will allow you configure many properties of your spark session it a "key"="value" format.

```
    --conf spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions \
    --conf spark.sql.catalog.spark_catalog=org.apache.iceberg.spark.SparkSessionCatalog \
```

#### Function Calls

Similarly you can configure your Spark Session directly from your Scala or Python Spark scripts:

**SCALA**

```scala
val conf: SparkConf = new SparkConf()
  conf.setAppName("yo")
  conf.set("spark.jars.packages", "org.projectnessie:nessie-spark-3.2-extensions:0.43.0,org.apache.iceberg:iceberg-spark-runtime-3.2_2.12:0.14.0,software.amazon.awssdk:bundle:2.17.178,software.amazon.awssdk:url-connection-client:2.17.178")
  conf.set(spark.sql.catalog.spark_catalog","org.apache.iceberg.spark.SparkSessionCatalog")

```

**PYTHON**

```py
conf = SparkConf()

conf.set(
    "spark.jars.packages",
    "org.projectnessie:nessie-spark-3.2-extensions:0.43.0,org.apache.iceberg:iceberg-spark-runtime-3.2_2.12:0.14.0,software.amazon.awssdk:bundle:2.17.178,software.amazon.awssdk:url-connection-client:2.17.178",
)

conf.set("spark.sql.catalog.spark_catalog", "org.apache.iceberg.spark.SparkSessionCatalog")
```

## Packages

Here is a list of the some of the packages you may want to include with your `--packages` flag and why.

| Library | Purpose |
|---------|---------|
|org.apache.iceberg:iceberg-spark-runtime-3.3_2.12:1.0.0 | The main iceberg library, make sure to use the right one for the version of spark and iceberg you are using |
|org.projectnessie:nessie-spark-extensions-3.3_2.12:0.44.0| Library for working with Nessie based catalogs like Dremio Arctic |
| software.amazon.awssdk:bundle:2.17.178,software.amazon.awssdk:url-connection-client:2.17.178 | Libraries for working with AWS S3 |

## Configurations

| Configuration | Purpose | Possible Values |
|-----------|--------|-------|
|spark.sql.extensions | Configure any extensions to SQL support in Spark. Each extension can be seperated with a comma | "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions,org.projectnessie.spark.extensions.NessieSparkSessionExtensions"|
|spark.sql.catalog.CatalogName| This configures a new catalog under whatever name you want (just change CatalogName to desired name) to a particular implementation of SparkCatalog |  org.apache.iceberg.spark.SparkCatalog |
| spark.sql.catalog.CatalogName.io-impl | This changes IO implementations of the target catalog, mainly changed for writing to Object Storage | org.apache.iceberg.aws.s3.S3FileIO |
|spark.sql.catalog.CatalogName.warehouse| Determines where new tables will be written to for that particular catalog | A file or S3 path |
|spark.sql.catalog.CatalogName.catalog-impl|The particular type of catalog your using | Nessie - `org.apache.iceberg.nessie.NessieCatalog`, Hive - NA, JDBC - `org.apache.iceberg.jdbc.JdbcCatalog`, AWS Glue - `org.apache.iceberg.aws.glue.GlueCatalog` |
|


## Amazon S3 Credentials

```
--conf spark.hadoop.fs.s3a.access.key=$AWS_ACCESS_KEY \
--conf spark.hadoop.fs.s3a.secret.key=$AWS_SECRET_ACCESS_KEY
```

## Environmental Variables

In a lot of the upcoming snippets I'll be using different environmental variables. If you want to use the snippets as is then define the follow environmental variables:

```
export TOKEN=XXXXXX
export WAREHOUSE=s3a://.../
export AWS_ACCESS_KEY_ID=XXXXXX
export AWS_SECRET_ACCESS_KEY=XXXXXX
export URI=https://...
export AWS_REGION=us-east-1
export DB_USERNAME=xxxxxx
export DB_PASSWORD=xxxxx
```

- TOKEN: auth token for Nessie catalogs
- WAREHOUSE: Where tables will be written
- AWS_XXXX= AWS Credentials
- URI= The Hive, Nessie or JDBC URI
- DB_USERNAME and DB_PASSWORD are for using a JDBC database like mySQL or Postgres

## Sample Configurations

Below you'll find sample configurations for many catalog types for reference.

If you want to try some of things in a locally running Docker container with Spark, use this command to spin one up.

```
docker run -it -p 8080:8080 --name spark-playground alexmerced/spark33playground
```
*NOTE: port 8080 is exposed in case you want run a Jupyter Notebook server in the container*

**HIVE**

```
spark-sql --packages org.apache.iceberg:iceberg-spark-runtime-3.3_2.12:1.0.0\
    --conf spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions \
    --conf spark.sql.catalog.spark_catalog=org.apache.iceberg.spark.SparkSessionCatalog \
    --conf spark.sql.catalog.spark_catalog.type=hive \
    --conf spark.sql.catalog.hive=org.apache.iceberg.spark.SparkCatalog \
    --conf spark.sql.catalog.hive.type=hadoop \
    --conf spark.sql.catalog.hive.uri=$URI \
    --conf spark.sql.catalog.hive.warehouse=$WAREHOUSE
```

**AWS GLUE**

```
spark-sql --packages "org.apache.iceberg:iceberg-spark-runtime-3.3_2.12:1.0.0,software.amazon.awssdk:bundle:2.17.178,software.amazon.awssdk:url-connection-client:2.17.178" \
    --conf spark.sql.catalog.glue=org.apache.iceberg.spark.SparkCatalog \
    --conf spark.sql.catalog.glue.warehouse=$WAREHOUSE \
    --conf spark.sql.catalog.glue.catalog-impl=org.apache.iceberg.aws.glue.GlueCatalog \
    --conf spark.sql.catalog.glue.io-impl=org.apache.iceberg.aws.s3.S3FileIO \
    --conf spark.hadoop.fs.s3a.access.key=$AWS_ACCESS_KEY \
    --conf spark.hadoop.fs.s3a.secret.key=$AWS_SECRET_ACCESS_KEY
```


**NESSIE/DREMIO ARCTIC**

```
spark-sql --packages "org.apache.iceberg:iceberg-spark-runtime-3.3_2.12:1.0.0,org.projectnessie:nessie-spark-extensions-3.3_2.12:0.44.0,software.amazon.awssdk:bundle:2.17.178,software.amazon.awssdk:url-connection-client:2.17.178" \
--conf spark.sql.extensions="org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions,org.projectnessie.spark.extensions.NessieSparkSessionExtensions" \
--conf spark.sql.catalog.nessie.uri=$ARCTIC_URI \
--conf spark.sql.catalog.nessie.ref=main \
--conf spark.sql.catalog.nessie.authentication.type=BEARER \
--conf spark.sql.catalog.nessie.authentication.token=$TOKEN \
--conf spark.sql.catalog.nessie.catalog-impl=org.apache.iceberg.nessie.NessieCatalog \
--conf spark.sql.catalog.nessie.warehouse=$WAREHOUSE \
--conf spark.sql.catalog.nessie=org.apache.iceberg.spark.SparkCatalog \
--conf spark.sql.catalog.nessie.io-impl=org.apache.iceberg.aws.s3.S3FileIO
```

**JDBC**

This allows you to use Postgres, MySQL or any JDBC compatible database as a catalog.

Make sure to pass the right username and password for your database.

```
spark-sql --packages org.apache.iceberg:iceberg-spark-runtime-3.2_2.12:1.0.0 \
    --conf spark.sql.catalog.my_catalog=org.apache.iceberg.spark.SparkCatalog \
    --conf spark.sql.catalog.jdbc.warehouse=$WAREHOUSE \
    --conf spark.sql.catalog.jdbc.catalog-impl=org.apache.iceberg.jdbc.JdbcCatalog \
    --conf spark.sql.catalog.jdbc.uri=$URI \
    --conf spark.sql.catalog.jdbc.jdbc.verifyServerCertificate=true \
    --conf spark.sql.catalog.jdbc.jdbc.useSSL=true \
    --conf spark.sql.catalog.jdbc.jdbc.user=$DB_USERNAME \
    --conf spark.sql.catalog.jdbc.jdbc.password=$DB_PASSWORD
```

## Conclusion

Once you've configured your Spark session keep in mind you must used the configured namespace for all queries. For example if I configured the catalog with:

```
    --conf spark.sql.catalog.mycoolcatalog.catalog-impl=org.apache.iceberg.jdbc.JdbcCatalog \
```

Then creating a table would look like:

```sql
CREATE TABLE mycoolcatalog.table1 (name STRING) USING iceberg;
```

Aside from that [consult the Iceberg Documentation](https://iceberg.apache.org/) or this [Apache Iceberg 101](https://www.dremio.com/subsurface/apache-iceberg-101-your-guide-to-learning-apache-iceberg-concepts-and-practices/) article for more information.