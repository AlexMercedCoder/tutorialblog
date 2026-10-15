---
title: The Apache Iceberg Lakehouse - The Great Data Equalizer
date: "2024-03-06"
description: "Disrupting the Snowflake/Databricks status quo"
author: "Alex Merced"
category: "Data Lakehouse"
tags:
  - Data Architecture
  - Apache Iceberg
  - Data Lakehouse
canonical: https://iceberglakehouse.com/posts/2024-3-06-apache-iceberg-the-great-data-equalizer/
---

> **Cross-posted.** This article's canonical home is [Alex Merced's Lakehouse Blog](https://iceberglakehouse.com/posts/2024-3-06-apache-iceberg-the-great-data-equalizer/).

[Get an Early Release Copy of Apache Iceberg the Definitive Guide](https://bit.ly/am-iceberg-book)

[Follow this tutorial to create a Data Lakehouse on your Laptop](https://bit.ly/am-dremio-lakehouse-laptop)

[Iceberg Lakehouse Engineering Video Playlist](https://bit.ly/am-iceberg-lakehouse-engineering)

In the dynamic realm of data platform development, competition among vendors and technologies is fierce. For several years, Snowflake and Databricks, have carved out significant market shares. Snowflake has been lauded for its user-friendly cloud data warehouse solutions, which, despite their effectiveness, [can be expensive](https://www.dremio.com/blog/using-dremio-to-reduce-your-snowflake-data-warehouse-costs/). On the other hand, Databricks has made its mark by offering a managed Spark environment that fosters collaboration in AI/ML development through notebooks, all while managing data with its Delta Lake table format.

Just a few years ago, the idea that an open-source project from Netflix, known as [Apache Iceberg](https://www.dremio.com/blog/apache-iceberg-101-your-guide-to-learning-apache-iceberg-concepts-and-practices/), could challenge the status quo of these tech giants seemed far-fetched. Yet, Apache Iceberg has done precisely that, unveiling the vulnerabilities of Snowflake and Databricks and charting a new course for data platforms. This shift underscores the impact and potential of open-source innovation in reshaping the data landscape.

## Dueling Dragons

Creating barriers to prevent users from easily transitioning to competitive platforms is a long-standing tactic used by companies to retain customers and stifle disruption. Traditionally, Snowflake's data warehouse platform necessitated that users migrate their data into Snowflake's storage, use its compute resources, and adhere to its pricing structure. This approach meant that transitioning to a different platform later would require moving the data again, creating substantial friction in adopting the preferred tools.

Databricks represented a progressive shift by allowing users to decouple their data storage from their compute services, enabling them to utilize existing data lakes. This flexibility potentially reduced costs associated with proprietary storage. However, Databricks introduced its own form of [lock-in by controlling table metadata and governance through Delta Lake](https://www.dremio.com/subsurface/table-format-governance-and-community-contributions-apache-iceberg-apache-hudi-and-delta-lake/), an ostensibly open-source format under Databricks' influence, and Unity Catalog, their proprietary catalog service.

In contrast, leading-edge data vendors like Dremio started advocating for Apache Iceberg, an open-source format birthed at Netflix, as a solution to this problem. Apache Iceberg offers a community-driven, vendor-neutral standard for table metadata, safeguarding against lock-in. As the adoption of Apache Iceberg grew, even Snowflake recognized its value, seeing it as a gateway to the lakehouse domain and a strategy to challenge Databricks' stronghold, particularly concerning Delta Lake.

## Stalemate

The endorsement of Apache Iceberg by an increasing number of vendors, including Snowflake, significantly bolstered Iceberg's momentum in the data platform space. Databricks, evidently recognizing this shift, made a strategic move with the introduction of Delta Lake 3.0. This new version features 'Uniformat,' a capability designed to manage an additional set of Iceberg metadata for Delta Lake tables tracked in Unity Catalog. While Databricks promotes Uniformat as a bidirectional project supporting various table formats, its functionality, for now, is limited to mirroring Iceberg metadata for Delta Lake tables and necessitates the use of Unity Catalog.

This development follows a recurring pattern with Databricks' Delta Lake, where new features are presented as enhancements to the 'open' Delta Lake format but, in practice, are closely tied to the Databricks ecosystem, blurring the lines between what is genuinely open-source and what is proprietary. Such strategies reflect the intricate dance of openness and control in the evolving landscape of data platforms, where companies navigate the balance between contributing to open standards and maintaining competitive advantages.

Snowflake's initial foray into Apache Iceberg support began with external tables, enabling users to point Snowflake to an Iceberg table in their storage for read-only operations. However, this early implementation faced performance challenges. Evolving from this, Snowflake introduced a two-tiered approach to Iceberg table management. On one side, there are Snowflake Managed Iceberg tables, which reside in the user's data lake but have write and read restrictions; they can only be written to by Snowflake and read either through Snowflake or externally using Snowflake's Iceberg SDK. However, this SDK is currently only supported in Apache Spark, which somewhat limits the flexibility and maintains a degree of vendor lock-in.

On the other hand, Snowflake also offers support for externally managed tables through catalog integrations, though this is restricted to read-only access and offers limited interaction with the platform. This approach illustrates a cautious expansion of the open capabilities Apache Iceberg promises, yet it's apparent that both Snowflake and Databricks are navigating this transition with an eye toward maintaining their proprietary ecosystems to some extent.

This nuanced dance—balancing between embracing open data platforms and preserving 'walled gardens'—underscores the complexity of the industry's evolution toward truly open data lakehouse architectures. Now, let's delve into the realm of fully open data lakehouse implementations to understand how they contrast with the approaches taken by Snowflake and Databricks.

## We Need a Hero

The landscape for working with [Apache Iceberg is rich with options, encompassing a range of tools and services](https://www.youtube.com/watch?v=hh7wU9H2jz8&t=1s&pp=ygUYQXBhY2hlIEljZWJlcmcgRWNvc3lzdGVt). Open-source data integration can be achieved through tools like Apache Spark and Apache Flink, while services such as Upsolver, Fivetran, and Airbyte offer additional flexibility. For managed Iceberg catalogs, options include [Dremio](https://www.dremio.com/blog/managing-data-as-code-with-dremio-arctic-easily-ensure-data-quality-in-your-data-lakehouse/), Tabular, AWS, alongside open-source catalog solutions like [Nessie](https://www.dremio.com/blog/what-is-nessie-catalog-versioning-and-git-for-data/) and Gravitino. Among these, [Dremio's Lakehouse Platform](https://www.dremio.com/blog/what-is-a-data-lakehouse-platform/) stands out for its comprehensive, open approach that avoids vendor lock-in.

### Key Features of Dremio's Lakehouse Platform:

**Data Connectivity:** Dremio seamlessly connects to your data lake, supporting a variety of data formats including CSV, JSON, Parquet, Iceberg, and Delta Lake tables.

**Versatile Integration:** Offering integration with both cloud and on-premise data lakes, Dremio provides a versatile solution that extends beyond the capabilities of Snowflake and Databricks, which are predominantly cloud-focused.

**Broad Database Support:** Dremio facilitates connections to a wide range of databases, from traditional relational ones like MySQL, SQLServer, and Postgres to noSQL varieties like MongoDB.

**Comprehensive DML Support:** It offers [full DML (Data Manipulation Language) support for Apache Iceberg tables](https://www.dremio.com/blog/ingesting-data-into-apache-iceberg-tables-with-dremio-a-unified-path-to-iceberg/) across diverse data lakes and a growing list of supported catalogs, ensuring flexibility and scalability.

**Integration with Other Platforms:** Dremio can integrate with Snowflake, allowing users to leverage datasets from the Snowflake marketplace. For Databricks users, it provides the capability to read Delta Lake tables, enhancing the speed and efficiency of BI dashboards.

**Flexible Catalog Options:** Featuring its own integrated [Apache Iceberg catalog with 'git-for-data' features](https://www.dremio.com/platform/lakehouse-management/), Dremio supports a variety of engines such as Apache Spark and Apache Flink, avoiding catalog lock-in.

**Universal Data Access:** With support for JDBC/ODBC, Apache Arrow Flight, and REST API interfaces, [Dremio ensures data can be accessed widely, facilitating integration with notebook environments like Deepnote and Hex](https://www.dremio.com/blog/connecting-to-dremio-using-apache-arrow-flight-in-python/).

**Semantic Layer:** [Dremio includes a semantic layer to document, organize, and govern data](https://www.dremio.com/platform/unified-analytics/universal-semantic-layer/) across all sources, enhancing data management and governance.

In essence, Dremio embodies the principles of the open data lakehouse, leveraging open formats and technologies to fulfill the vision of a truly open and flexible data platform.

## Conclusion

In the rapidly evolving landscape of data platforms, the battle for dominance and innovation continues. Snowflake and Databricks have established themselves as formidable players, each with their unique strengths and limitations. Yet, the emergence of Apache Iceberg has introduced a new chapter in this narrative, challenging established paradigms and offering a glimpse into a more open and flexible future.

As we've explored, the integration of Apache Iceberg by various vendors, including Snowflake and Databricks, signifies a pivotal shift towards openness. However, the journey is fraught with complexities as these giants navigate the fine line between embracing open-source innovation and maintaining their proprietary interests. This delicate balance is crucial, as it influences the broader ecosystem and the strategic decisions of companies across the industry.

Enter Dremio's Lakehouse Platform, a beacon of true openness in the data lakehouse domain. With its comprehensive support for Apache Iceberg and a commitment to open standards, Dremio is not just participating in the open data movement; it's leading it. By offering robust connectivity, broad database support, comprehensive DML capabilities, and a semantic layer for data governance, Dremio empowers organizations to break free from vendor lock-in and embrace a future where data is accessible, manageable, and governed on their terms.

As we stand at this inflection point, the significance of open-source technologies like Apache Iceberg cannot be overstated. They are not merely tools or platforms; they are the harbingers of a new era in data management, where flexibility, collaboration, and innovation take precedence over walled gardens and restrictive practices. The narrative of Snowflake and Databricks, their responses to Apache Iceberg, and the rise of Dremio's Lakehouse Platform all underscore a fundamental truth: in the world of data, openness is not just a feature—it's the future.

As we look ahead, the trajectory of data platforms will undoubtedly be shaped by the principles of openness and community-driven innovation. In this context, Dremio's Lakehouse Platform stands out as a testament to what is possible when the boundaries of data are reimagined, offering a compelling vision of what the future of data platforms can and should be. In this era of rapid technological advancement, embracing the open data lakehouse is not just a strategic move—it's a step towards a more interconnected, innovative, and transparent data future.

[Get an Early Release Copy of Apache Iceberg the Definitive Guide](https://bit.ly/am-iceberg-book)

[Follow this tutorial to create a Data Lakehouse on your Laptop](https://bit.ly/am-dremio-lakehouse-laptop)

[Iceberg Lakehouse Engineering Video Playlist](https://bit.ly/am-iceberg-lakehouse-engineering)
