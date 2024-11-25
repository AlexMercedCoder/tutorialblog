---
title: 10 Future Apache Iceberg Developments to Look forward to in 2025
date: "2024-11-25"
description: "What is cool about Apache Iceberg's Future"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - apache iceberg
  - dremio
---

- [Blog: What is a Data Lakehouse and a Table Format?](https://www.dremio.com/blog/apache-iceberg-crash-course-what-is-a-data-lakehouse-and-a-table-format/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg-developments&utm_content=alexmerced&utm_term=external_blog)
- [Free Copy of Apache Iceberg the Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg-developments&utm_content=alexmerced&utm_term=external_blog)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg-developments&utm_content=alexmerced&utm_term=external_blog)
- [Lakehouse Catalog Course](https://hello.dremio.com/webcast-an-in-depth-exploration-on-the-world-of-data-lakehouse-catalogs-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg-developments&utm_content=alexmerced&utm_term=external_blog)
- [Iceberg Lakehouse Engineering Video Playlist](https://www.youtube.com/watch?v=SIriNcVIGJQ&list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe) 

Apache Iceberg remains at the forefront of innovation, redefining how we think about data lakehouse architectures. In 2025, the Iceberg ecosystem is poised for significant advancements that will empower organizations to handle data more efficiently, securely, and at scale. From enhanced interoperability with modern data tools to new features that simplify data management, the year ahead promises to be transformative. In this blog, we’ll explore 10 exciting developments in the Apache Iceberg ecosystem that you should keep an eye on, offering a glimpse into the future of open data lakehouse technology.

## 1. Scan Planning Endpoint in the Iceberg REST Catalog Specification

One of the most anticipated updates in the Iceberg ecosystem for 2025 is the addition of a "Scan Planning" endpoint to the Iceberg REST Catalog specification. This enhancement will allow query engines to delegate scan planning—the process of reading metadata to determine which files are needed for a query—to the catalog itself. This new capability opens the door to several exciting possibilities:

- **Optimized Scan Planning with Caching**: By handling scan planning at the catalog level, frequently submitted queries can benefit from cached scan plans. This optimization reduces redundant metadata reads and accelerates query execution, irrespective of the engine used to submit the query.

- **Enhanced Interoperability Between Table Formats**: With the catalog managing scan planning, the responsibility of supporting table formats shifts from the engine to the catalog. This makes it possible for Iceberg REST-compliant catalogs to facilitate querying tables in multiple formats. For example, a catalog could generate file lists for queries across various table formats, paving the way for broader interoperability.

Looking ahead, the introduction of this endpoint is not only a step toward improving query performance but also a glimpse into a future where catalogs become the central hub for table format compatibility. To fully realize this vision, a similar endpoint for handling metadata writes may be introduced in the future, further extending the catalog's capabilities.

[Scan Planning Pull Request](https://github.com/apache/iceberg/pull/11369)

## 2. Interoperable Views in Apache Iceberg

Interoperable views are another major development to watch in the Apache Iceberg ecosystem for 2025. While Iceberg already supports a view specification, the current approach has limitations: it stores the SQL used to define the view, but since SQL syntax varies across engines, resolving these views is not always feasible in a multi-engine environment.

To address this challenge, two promising solutions are being explored:

- **SQL Transpilation with Frameworks like SQLGlot**: By leveraging SQL transpilation tools such as SQLGlot, the SQL defining a view can be translated between different dialects. This approach builds on the existing view specification, which includes a "dialect" property to identify the SQL syntax used to define the view. This enables engines to resolve views by translating the SQL into a dialect they support.

- **Intermediate Representation for Views**: Another approach involves using an intermediate format to represent views, independent of SQL syntax. Two notable projects being discussed in this context are:
  - **Apache Calcite**: An open-source project that provides a framework for parsing, validating, and optimizing relational algebra queries. Calcite could serve as a bridge, converting SQL into a standardized logical plan that any engine can execute.
  - **Substrait**: A cross-language specification for defining and exchanging query plans. Substrait focuses on representing queries in a portable, engine-agnostic format, making it a strong candidate for enabling true interoperability.

These advancements aim to make views in Iceberg truly interoperable, allowing seamless sharing and resolution of views across different engines and workflows. Whether through SQL transpilation or an intermediate format, these improvements will significantly enhance Iceberg's flexibility in heterogeneous data environments.

## 3. Materialized Views in Apache Iceberg

A materialized view stores a query definition as a logical table, with precomputed data that serves query results. By shifting the computational cost to precomputation, materialized views significantly improve query performance while maintaining flexibility. The Iceberg community is working towards a common metadata format for materialized views, enabling their creation, reading, and updating across different engines.

#### **Key Features of Iceberg Materialized Views**

- **Metadata Structure**: A materialized view is realized as a combination of an Iceberg view (the "common view") storing the query definition and a pointer to the precomputed data, and an Iceberg table (the "storage table") holding the precomputed data. The storage table is marked with states like "fresh," "stale," or "invalid" based on its alignment with source table snapshots.

- **Storage Table State Management**: 
  - A **fresh** state indicates the precomputed data is up-to-date.
  - A **stale** state requires the query engine to decide between full or incremental refresh.
  - An **invalid** state mandates a full refresh.

- **Refresh Mechanisms**: Materialized views can be refreshed through various methods, including event-driven triggers, query-time checks, scheduled refreshes, or manual operations. These methods ensure the precomputed data remains relevant to the underlying data.

- **Query Optimization**: Queries can use precomputed data directly if it meets freshness criteria (e.g., the `materialization.data.max-staleness` property). Otherwise, the query engine determines the next steps, such as refreshing the data or falling back to the original view definition.

- **Interoperability and Governance**: The shared metadata format supports lineage tracking and consistent states, making materialized views easy to manage and audit across engines.

#### **Impact on the Iceberg Ecosystem**

Materialized views in Iceberg offer a way to optimize query performance while ensuring that optimizations are portable across systems. By providing a standard for metadata and refresh mechanisms, Iceberg hopes to enable organizations to harness the benefits of materialized views without being locked into specific query engines. This development will make Iceberg an even more compelling choice for building scalable, engine-agnostic data lakehouses.

[Materilized View Pull Request](https://github.com/apache/iceberg/pull/11041)

## 4. Variant Data Format in Apache Iceberg

The upcoming introduction of the **variant data format** in Apache Iceberg marks a significant advancement in handling semi-structured data. While Iceberg already supports a JSON data format, the variant data type offers a more efficient and versatile approach to managing JSON-like data, aligning with the Spark variant format.

#### **How Variant Differs from JSON**

The variant data format is designed to provide a structured representation of semi-structured data, improving performance and usability:
- **Typed Representation**: Unlike traditional JSON, which treats data as text, the variant format incorporates schema-aware types. This allows for faster processing and easier integration with analytical workflows.
- **Efficient Storage**: By leveraging columnar storage principles, variant data optimizes storage space and access patterns for semi-structured data, reducing the overhead associated with parsing and serializing JSON.
- **Query Flexibility**: Variant enables advanced querying capabilities, such as filtering and aggregations, on semi-structured data without requiring extensive transformations or data flattening.

#### **Benefits of the Variant Format**

1. **Improved Performance**: By avoiding the need to repeatedly parse JSON strings, the variant format enables faster data access and manipulation, making it ideal for high-performance analytical queries.
2. **Better Interoperability**: With consensus on using the Spark variant format, this addition ensures compatibility across engines that support the same standard.
3. **Simplified Workflows**: Variant makes it easier to work with semi-structured data within Iceberg tables, allowing for more straightforward schema evolution and query optimizations.

[Variant Data Format Pull Request](https://github.com/apache/iceberg/pull/10831)

## 5. Native Geospatial Data Type Support in Apache Iceberg

The integration of geospatial data types into Apache Iceberg is poised to open up powerful capabilities for organizations managing location-based data. While geospatial data has long been supported by big data tools like GeoParquet, Apache Sedona, and GeoMesa, Iceberg's position as a central table format makes the addition of native geospatial support a natural evolution. Leveraging prior efforts such as Geolake and Havasu, this proposal aims to bring geospatial functionality into Iceberg without the need for project forks.

#### **Proposed Features**

The geospatial extension for Iceberg will introduce:
- **Geospatial Data Types**: Support for types like `POINT`, `LINESTRING`, and `POLYGON`.
- **Geospatial Expressions**: Functions such as `ST_COVERS`, `ST_COVERED_BY`, and `ST_INTERSECTS` for spatial querying.
- **Geospatial Partition Transforms**: Partitioning using geospatial transforms like `XZ2` to optimize query filtering.
- **Geospatial Sorting**: Sorting data with space-filling curves, such as the Hilbert curve, to enhance data locality and query efficiency.
- **Spark Integration**: Built-in support for working with geospatial data in Spark.

#### **Key Use Cases**

1. **Table Creation with Geospatial Types**: 
```sql
   CREATE TABLE geom_table (geom GEOMETRY);
```

2. **Inserting Geospatial Data**:

```sql
  INSERT INTO geom_table VALUES ('POINT(1 2)', 'LINESTRING(1 2, 3 4)');
```

3. **Querying with Geospatial Predicates**:

```sql
SELECT * FROM geom_table WHERE ST_COVERS(geom, ST_POINT(0.5, 0.5));
```

4. **Geospatial Partitioning**:

```sql
ALTER TABLE geom_table ADD PARTITION FIELD (xz2(geom));
```

5. **Optimized File Sorting for Geospatial Queries**:

```sql
CALL rewrite_data_files(table => `geom_table`, sort_order => `hilbert(geom)`);
```

### Benefits
- **Efficient Geospatial Analysis**: By natively supporting geospatial data types and operations, Iceberg will enable faster and more scalable location-based queries.
- **Improved Query Optimization**: Partition transforms and spatial sorting will enhance filtering and reduce data scan overhead.
- **Broad Ecosystem Integration**: With Spark integration and compatibility with geospatial standards like GeoParquet, Iceberg becomes a powerful tool for geospatial data management.

[GeoSpatial Proposal](https://github.com/apache/iceberg/issues/10260)


## 6. Apache Polaris Federated Catalogs

Apache Polaris is expanding its capabilities with the concept of **federated catalogs**, allowing seamless connectivity to external catalogs such as Nessie, Gravitino, and Unity. This feature makes the tables in these external catalogs visible and queryable from a Polaris connection, streamlining Iceberg data federation within a single interface.

#### **Current State**

At present, Polaris supports **read-only external catalogs**, enabling users to query and analyze data from connected catalogs without duplicating data or moving it between systems. This functionality simplifies data integration and allows users to leverage the strengths of multiple catalogs from a centralized Polaris environment.

#### **Future Vision: Read/Write Federation**

There is active discussion and interest within the community to extend this capability to **read/write catalog federation**. With this enhancement, users will be able to:
- **Read** data from external catalogs as they currently do.
- **Write** data directly back to external catalogs, making updates, inserts, and schema modifications possible.

#### **Key Benefits of Federated Catalogs**

1. **Unified Data Access**: Query data across multiple catalogs without the need for extensive ETL processes or duplication.
2. **Improved Interoperability**: Leverage the unique features of external catalogs like Nessie and Unity directly within Polaris.
3. **Streamlined Workflows**: Enable read/write operations to external catalogs, reducing friction in workflows that span multiple systems.
4. **Enhanced Governance**: Centralize metadata and access controls while interacting with data stored in different catalogs.

#### **The Road Ahead**

The move toward read/write federation make it easier for organizations to manage diverse data ecosystems. By bridging the gap between disparate catalogs, Polaris continues to simplify data management and empower users to unlock the full potential of their data.

## 7. Table Maintenance Service in Apache Polaris

A feature beign discussed in the Apache Polaris community is the **table maintenance service**, designed to streamline table optimization and maintenance workflows. This service would function as a notification system, broadcasting maintenance requests to subscribed tools, enabling automated and efficient table management.

#### **How It Could Works**

The table maintenance service allows users to configure maintenance triggers based on specific conditions. For example, users could set a table to be optimized every 10 snapshots. When this condition is met, the service broadcasts a notification to subscribed tools such as Dremio, Upsolver and any other service that optimizes Iceberg tables.

#### **Key Use Cases**

1. **Automated Table Optimization**: Configure tables to trigger maintenance tasks, such as compaction or sorting, at predefined intervals or based on conditions like snapshot count.
2. **Cross-Tool Integration**: Seamlessly integrate with multiple tools in the ecosystem, enabling flexible and automated workflows.
3. **Cadence Management**: Ensure maintenance tasks are performed on a schedule or event-driven basis, aligned with the table’s operational needs.

#### **Benefits**

- **Reduced Operational Overhead**: Automate repetitive maintenance tasks, minimizing the need for manual intervention.
- **Improved Performance**: Regular maintenance ensures tables remain optimized for query performance and storage efficiency.
- **Ecosystem Flexibility**: By supporting a wide range of subscribing tools, the service adapts to diverse data pipelines and optimization strategies.

## 8. Catalog Versioning in Apache Polaris

**Catalog versioning**, a transformative feature currently available in the [Nessie catalog](https://www.projectnessie.org), is under discussion for inclusion in the Apache Polaris ecosystem. Adding catalog versioning to Polaris would unlock a range of powerful capabilities, positioning Polaris as a unifying force for the most innovative ideas in the Iceberg catalog space.

#### **The Power of Catalog Versioning**

Catalog versioning provides a robust foundation for advanced data management scenarios by enabling:
- **Multi-Table Transactions**: Ensure atomic operations across multiple tables for consistent updates.
- **Multi-Table Rollbacks**: Revert changes across multiple tables to a consistent state, enhancing error recovery.
- **Zero-Copy Environments**: Create lightweight, zero-copy development or testing environments without duplicating data.
- **Multi-Table Isolation**: Create a branch to isolate work on data without affecting the main branch.
- **Tagging and Versioning**: Mark specific states of the catalog for easy access, auditing, or rollback.

#### **Proposed Integration with Polaris**

Discussions around bringing catalog versioning to Polaris also involve designing a new model that aligns with Polaris' architecture. This integration could enable:
- **Unified Catalog Management**: Allow users to manage table states and snapshots across all their data directly in Polaris.
- **Enhanced Interoperability**: Unify Polaris' capabilities with the multi-table capabilities of Nessie, creating a comprehensive solution for data management.

#### **Potential Impact**

- **Advanced Data Workflows**: Catalog versioning would enable Polaris users to orchestrate complex workflows with confidence and precision.
- **Improved Collaboration**: Teams could work in parallel using isolated views of the catalog, fostering innovation without risk to production data.
- **Ecosystem Leadership**: By adopting catalog versioning, Polaris would become the definitive platform for managing Iceberg catalogs, consolidating the best ideas from the community.

If implemented, catalog versioning in Polaris would elevate its capabilities, making it an indispensable tool for organizations looking to modernize their data lakehouse operations.

[Try Catalog Versioning on your Laptop](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/)

## 9. Updates to Iceberg's Delete File Specification

Apache Iceberg’s innovative delete file specification has been central to enabling efficient upserts by managing record deletions with minimal performance overhead. Currently, Iceberg supports two types of delete files:
- **Position Deletes**: Track the position of a deleted record in a data file.
- **Equality Deletes**: Track the values being deleted across multiple rows.

While these mechanisms are effective, each comes with trade-offs. Position deletes can lead to high I/O costs when reconciling deletions during queries, while equality deletes, though fast to write, impose significant costs during reads and optimizations. Discussions in the Iceberg community propose enhancements to both approaches.

#### **Proposed Changes to Position Deletes**

The key proposal is to transition position deletes from their current file-based storage to **deletion vectors** within Puffin files. Puffin, a specification for structured metadata storage, allows for compact and efficient storage of additional data.

**Benefits of Storing Deletion Vectors in Puffin Files**:
- **Reduced I/O Costs**: Instead of opening multiple delete files, engines can read a single blob within a Puffin file, significantly improving read performance.
- **Streamlined Metadata Access**: Puffin files consolidate metadata and auxiliary information, simplifying the reconciliation process.

#### **Reimagining Equality Deletes for Streaming**

Another area of discussion is rethinking equality deletes to better suit streaming scenarios. The current design prioritizes fast writes but incurs steep costs for reading and optimizing. Possible enhancements include:
- **Streaming-Optimized Delete Mechanisms**: Developing a model where deletes are reconciled incrementally in real-time, reducing read-time overhead.
- **Hybrid Approaches**: Combining aspects of position and equality deletes to balance the cost of writes, reads, and optimizations.

#### **Impact of These Changes**

1. **Improved Query Performance**: Faster reconciliation during queries, especially for workloads with high delete volumes.
2. **Better Streaming Support**: Lower overhead for real-time processing scenarios, making Iceberg more viable for continuous data ingestion and updates.
3. **Enhanced Scalability**: Reduced I/O during reconciliation improves scalability for large-scale datasets.

### 10. General Availability of the Dremio Hybrid Catalog

The **Dremio Hybrid Catalog**, currently in private preview, is set to become generally available sometime in 2025. Built on the foundation of the Polaris catalog, this managed Iceberg catalog is tightly integrated into Dremio, offering a streamlined and feature-rich experience for managing data across cloud and on-prem environments.

#### **Key Features of the Hybrid Catalog**

1. **Integrated Table Maintenance**: Automate table maintenance tasks such as compaction, cleanup, and optimization, ensuring that tables remain performant with minimal user intervention.
2. **Multi-Location Cataloging**: Seamlessly manage and catalog tables across diverse storage environments, including multiple cloud providers and on-premises storage solutions.
3. **Polaris-Based Capabilities**: Leverage the powerful features of the Polaris catalog, including RBAC, external catalogs, and potential catalog versioning (if implemented by Polaris).

#### **Benefits of the Dremio Hybrid Catalog**

- **Simplified Data Management**: Provides a unified interface for managing Iceberg tables across different environments, reducing complexity.
- **Enhanced Performance**: Automated maintenance and cleanup ensure tables are always optimized for fast and efficient queries.
- **Flexibility and Scalability**: Supports hybrid architectures, allowing organizations to manage data wherever it resides without sacrificing control or performance.

#### **Impact on the Iceberg Ecosystem**

The general availability of the Dremio Hybrid Catalog will mark a significant milestone for organizations adopting Iceberg. By integrating Polaris' advanced capabilities into a managed catalog, Dremio is poised to deliver a seamless and efficient solution for managing data lakehouse environments. This innovation underscores Dremio's commitment to making Iceberg a cornerstone of modern data management strategies.

### Conclusion

As we look ahead to 2025, the Apache Iceberg ecosystem is set to deliver groundbreaking advancements that will transform how organizations manage and analyze their data. From enhanced query optimization with scan planning endpoints and materialized views to broader support for geospatial and semi-structured data, Iceberg continues to push the boundaries of data lakehouse capabilities. Exciting developments like the Dremio Hybrid Catalog and updates to delete file specifications promise to make Iceberg even more efficient, scalable, and interoperable.

These innovations highlight the vibrant community driving Apache Iceberg and the collective effort to address the evolving needs of modern data platforms. Whether you're leveraging Iceberg for its robust cataloging features, seamless multi-cloud support, or cutting-edge query capabilities, 2025 is shaping up to be a year of remarkable growth and opportunity. Stay tuned as Apache Iceberg continues to lead the way in open data lakehouse technology, empowering organizations to unlock the full potential of their data.

- [Blog: What is a Data Lakehouse and a Table Format?](https://www.dremio.com/blog/apache-iceberg-crash-course-what-is-a-data-lakehouse-and-a-table-format/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg-developments&utm_content=alexmerced&utm_term=external_blog)
- [Free Copy of Apache Iceberg the Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg-developments&utm_content=alexmerced&utm_term=external_blog)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg-developments&utm_content=alexmerced&utm_term=external_blog)
- [Lakehouse Catalog Course](https://hello.dremio.com/webcast-an-in-depth-exploration-on-the-world-of-data-lakehouse-catalogs-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=iceberg-developments&utm_content=alexmerced&utm_term=external_blog)
- [Iceberg Lakehouse Engineering Video Playlist](https://www.youtube.com/watch?v=SIriNcVIGJQ&list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe) 
