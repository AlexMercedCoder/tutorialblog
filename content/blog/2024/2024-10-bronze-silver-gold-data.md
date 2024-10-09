---
title: What is Three-Tier Data (Bronze, Silver, Gold) and How Dremio Simplifies It
date: "2024-10-09"
description: "Process Data from Raw to Clean Aggregated Data"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
---

- [Apache Iceberg 101](https://www.dremio.com/lakehouse-deep-dives/apache-iceberg-101/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=threelayers&utm_content=alexmerced&utm_term=external_blog)
- [Hands-on Intro with Apache iceberg](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=threelayers&utm_content=alexmerced&utm_term=external_blog)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=threelayers&utm_content=alexmerced&utm_term=external_blog)
- [Free Copy Of Apache Iceberg: The Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=threelayers&utm_content=alexmerced&utm_term=external_blog)

Organizing and curating data efficiently is key to delivering actionable insights. One of the most time-tested patterns for structuring data is the three-tier data organization pattern. This approach has been around for years, with each layer representing a different level of processing, from raw ingestion to fully prepared data ready for business use. While the names for these layers have changed over time, the concept remains foundational to managing data flows in complex environments.

In this blog, we’ll explore the evolution of the three-tier data organization pattern and how it has been referred to by different names like raw/business/application, bronze/silver/gold, and raw/clean/semantic. We will then dive into how this pattern is used to move data from one layer to the next. Lastly, we'll discuss how tools like Dremio, along with advanced features such as Incremental and Live Reflections, simplify managing these layers without needing excessive data copies, particularly when working with Apache Iceberg tables.

## The Evolution of the Three-Tier Data Organization Pattern

### Historical Terminologies

Over the years, the three-tier data organization pattern has been referenced using different naming conventions. Each naming scheme reflects the progression of data through its lifecycle—from unprocessed to refined and actionable. Here are some common terminologies used:

- **Raw / Business / Application**: One of the earliest naming conventions, where the focus is on raw data, business logic, and application-specific outputs.
- **Bronze / Silver / Gold**: A more modern take, especially in the context of data lakes and lakehouses. Bronze refers to raw data, Silver to cleaned or enriched data, and Gold to the most refined and consumable version of data.
- **Raw / Clean / Semantic**: A naming convention used often in data governance discussions. It emphasizes the transformation from raw ingested data to clean, validated data, and finally to a semantic layer where business logic and definitions are applied.

### A Universal Pattern

Despite the variation in names, the underlying concept remains the same: data is moved through different stages, each one adding more processing and value to the data. This structured movement helps ensure that organizations can have data at varying stages of readiness, depending on the use case. The pattern facilitates everything from raw data exploration to high-performance reporting.

In the next sections, we’ll explore how this pattern is applied to move data between layers, and how modern tools like Dremio can make managing this process easier and more efficient.

## 2. The Role of Each Layer in the Pattern

Each layer in the three-tier data organization pattern serves a distinct purpose in processing data, making it easier to manage and consume over time. Let's break down the role of each layer.

### Raw Layer (Bronze, Raw)
- **Definition:** The raw layer is where data lands directly after ingestion from the source, without any transformation. This data might come from transactional databases, sensors, logs, or third-party APIs, often in formats like JSON, CSV, or raw Parquet files.
- **Use Case:** The raw layer is vital for preserving the integrity of the original data. It’s useful for tracing back to the source, performing audits, and enabling detailed exploration of the untransformed data. However, it typically requires significant transformation before it can be useful for analytical purposes.

### Business Layer (Silver, Clean)
- **Definition:** In the business layer, data is cleaned, transformed, and partially processed. Here, duplicate records may be removed, data is normalized, and business rules are applied, but it still retains much of the underlying data structure.
- **Use Case:** This layer is useful for intermediate analysis and exploration, as the data is clean but not yet fully aggregated or processed. It allows data teams to explore trends and patterns before fully curating the data for business consumption. Often, this layer involves key transformations like joining data across multiple sources, removing irrelevant data, and applying first steps toward data modeling.

### Application Layer (Gold, Semantic)
- **Definition:** The application layer contains fully refined data, curated and optimized for consumption by business applications and reporting tools. At this point, business logic is fully applied, aggregations are completed, and the data is optimized for fast access.
- **Use Case:** The application layer is ideal for final reporting, business intelligence (BI) tools, and machine learning models. It's where the highest level of transformation occurs, and where performance is critical for real-time queries and analytics.

By organizing data in this tiered structure, organizations ensure that they can move data smoothly from raw to ready-for-business use, making each layer available for different types of analysis depending on the needs of the business or application.

## 3. Traditional Challenges with Data Movement Between Layers

While the three-tier data pattern is foundational in modern data systems, it comes with challenges, particularly around moving data from one layer to the next.

### Data Duplication
In traditional data systems, each layer typically involves creating separate copies of data. For example, data must be copied from the raw layer to the business layer, and again to the application layer. These copies consume storage resources and often lead to increased operational complexity in managing different versions of the same data.

### Latency and Sync Issues
As data moves between layers, transformation jobs are often scheduled as batch processes, leading to delays between the availability of new data in each layer. This latency can cause inconsistencies between layers, particularly when the data in one layer is updated while the data in another is outdated.

### Storage Overhead
Maintaining multiple copies of data across different layers results in significant storage overhead. For large-scale data systems, this can quickly become a burden, not only in terms of storage costs but also in terms of maintaining a clear lineage and understanding of the data.

In the next section, we’ll discuss how Dremio addresses these challenges by allowing organizations to streamline data movement through virtual views and reflections, reducing the need for excessive data duplication.

## 4. How Dremio Streamlines Three-Tier Data Curation

Dremio provides a modern approach to managing the three-tier data organization pattern, reducing many of the challenges traditionally associated with moving data between layers. By leveraging Dremio's features such as virtual views and reflections, organizations can streamline the process, minimize data duplication, and improve query performance without needing to manage multiple physical copies of data.

### Virtual Views: Logical Representation Without Duplication

One of Dremio’s most powerful features is the ability to create **virtual views**, which allow you to logically represent the data at different stages (raw, business, and application) without having to duplicate or physically move it. These virtual views are essentially SQL queries that define how the data should appear at each stage, offering the following benefits:

- **No Physical Copies Required:** Unlike traditional approaches that involve moving data into new tables for each layer, Dremio's virtual views allow you to create layers on top of the same physical data without creating extra copies.
- **Instant Access to Different Layers:** Data teams can quickly define how data should look at each layer by writing simple SQL queries, reducing the time and effort needed to curate and maintain different versions of the data.
- **Centralized Data Governance:** By managing the different layers through virtual views, organizations can maintain better control over how data is transformed and accessed across the business, ensuring consistent governance without managing separate physical datasets.

### Reflections: Efficiently Materializing Data When Needed

While virtual views provide logical representations of each layer, Dremio's **reflections** allow you to physically materialize data when necessary for performance optimization. Reflections are essentially pre-computed Iceberg-based data representations that Dremio can use to accelerate query performance across different layers. The key advantages include:

- **On-Demand Materialization:** Reflections let you materialize data at the final, most refined layer (application or gold) without requiring you to manage multiple physical copies at the intermediate stages.

- **Optimized Query Performance:** Dremio’s reflections enable fast query responses by allowing frequently accessed or complex views to be pre-computed and cached. This minimizes the need for repetitive transformations and significantly reduces query times across the entire data pipeline.

- **Transparent to End Users:** Reflections are completely transparent to end users; they automatically use the most efficient reflection to answer a query without the user needing to know about the underlying optimizations.

With these features, Dremio makes it much easier to manage the three-tier data pattern, offering flexibility in how data is represented and materialized while reducing the need for costly and complex data movement between layers. This is particularly valuable in modern data architectures, where the volume and velocity of data continue to grow.

In the next section, we’ll explore how Dremio’s **Incremental Reflections** and **Live Reflections** enhance this process even further, particularly when using Apache Iceberg tables as the underlying data format.

## 5. The Impact of Dremio’s Incremental and Live Reflections

Dremio takes data acceleration a step further with **Incremental Reflections** and **Live Reflections**, especially when working with **Apache Iceberg tables**. These features significantly enhance the efficiency of the three-tier data organization pattern by optimizing how reflections are updated and refreshed, ensuring data consistency without the need for full table reprocessing.

### Incremental Reflections: Optimizing Data Refreshes

**Incremental Reflections** allow Dremio to refresh only the parts of a reflection that have changed, rather than reprocessing the entire dataset. This is particularly valuable in large-scale environments where data is constantly being ingested and updated. Incremental Reflections provide several key benefits:

- **Faster Updates:** Since only the modified data is refreshed, the time and resources needed to update a reflection are significantly reduced. This ensures that data at each tier can be kept up to date without the latency or overhead associated with full data reprocessing.
- **Reduced Costs:** Incremental updates minimize the compute resources required to keep data synchronized between layers, reducing operational costs while maintaining high performance.
- **Seamless Integration with Iceberg:** When using Apache Iceberg tables, which support efficient partitioning and metadata management, Incremental Reflections leverage the ability to track data changes, making the refresh process even more streamlined and scalable.

### Live Reflections: Always Fresh Data

**Live Reflections** take the concept of data freshness even further by automatically updating whenever underlying data changes. This means that whenever the raw Iceberg tables are updated, the reflections built on top of them are automatically kept in sync without manual intervention. The advantages include:

- **Automatic Updates:** With Live Reflections, you don’t need to schedule jobs or manually trigger reflection updates. Changes to the data are automatically propagated, ensuring that all layers are always up-to-date.
- **Consistency Across Layers:** As new data is ingested into the raw layer, the business and application layers are immediately refreshed, ensuring consistency across the entire data pipeline.
- **Ideal for Real-Time Analytics:** Live Reflections are particularly useful for real-time or near-real-time analytics use cases, where having the most up-to-date data is critical. This enables decision-makers to rely on the most current data without delays caused by batch processing.

### Use Case: Incremental and Live Reflections with Apache Iceberg

When combined with Apache Iceberg, Dremio's Incremental and Live Reflections offer a powerful solution for managing data across the three-tier pattern. If the underlying data sources are Apache Iceberg tables then reflections across your layers can be refreshed incrementally and triggered when data changes vs full refreshes and scheduled refreshes for non-Iceberg sources (databases, data warehouses, non-iceberg data on your data lake):

- **Maintain Fresh Data:** As Iceberg’s metadata structure tracks data changes, Dremio’s Live Reflections ensure that updates are immediately reflected.

- **Scale Efficiently:** Iceberg’s optimized partitioning enables Incremental Reflections to process only the changed partitions, reducing compute and storage costs.

- **Deliver Fast Queries:** With both Incremental and Live Reflections, users can execute high-performance queries on curated data without worrying about outdated data or long refresh times.

In summary, Dremio’s Incremental and Live Reflections bring significant improvements to the three-tier data organization pattern by ensuring data remains fresh and synchronized with minimal overhead.

By leveraging these powerful features, Dremio not only simplifies the process of managing the three-tier data pattern but also ensures that organizations can do so with optimal efficiency and minimal cost.

## 6. Real-World Benefits of Using Dremio with the Three-Tier Data Organization Pattern

Now that we’ve explored how Dremio’s virtual views, reflections, and advanced features like Incremental and Live Reflections enhance the three-tier data organization pattern, let’s dive into the real-world benefits this approach delivers to data teams and organizations.

### 1. Minimized Data Duplication

Traditional data architectures often rely on creating multiple physical copies of data at each tier, which leads to increased storage costs, operational complexity, and data governance challenges. With Dremio’s virtual views and reflections, you can represent data at different stages without needing to physically copy it. By reducing data duplication, organizations can save significantly on storage costs and maintain a more streamlined data architecture.

- **Storage Savings:** By eliminating redundant copies, organizations reduce their data storage footprint, which is particularly important as datasets grow.

- **Simplified Data Governance:** Managing fewer copies means a clearer lineage of data transformations and a reduced risk of governance issues, ensuring better control over data access and compliance.

### 2. Faster Time to Insights

One of the core objectives of the three-tier data organization pattern is to move data through different stages of readiness, from raw to fully processed, as efficiently as possible. Dremio’s reflections dramatically speed up query times by precomputing views of the data, allowing users to access insights faster, particularly at the business and application layers.

- **Accelerated Analytics:** Reflections optimize query performance across different tiers, so analysts and decision-makers can run complex queries on highly processed data without waiting for lengthy transformations.

- **Reduced Latency:** With Incremental and Live Reflections, the time required to refresh and propagate data between layers is minimized, ensuring up-to-date data is always available for analysis.

### 3. Real-Time Data with Minimal Overhead

The combination of Apache Iceberg’s efficient data partitioning and Dremio’s Live Reflections enables organizations to maintain real-time or near-real-time data freshness without the operational overhead typically associated with traditional batch processing. Live Reflections automatically update when new data arrives, ensuring that the entire pipeline—from raw to application-ready data—stays consistent and up-to-date.

- **Real-Time Updates:** Live Reflections ensure that every layer in the data pipeline reflects the most current state of the underlying data, which is essential for real-time analytics and decision-making.

- **Lower Maintenance Costs:** By automating data synchronization across layers, organizations can reduce the operational burden on their data engineering teams, freeing up resources for more strategic work.

### 4. Scalability and Flexibility with Apache Iceberg

Using Dremio alongside Apache Iceberg provides an ideal foundation for scaling the three-tier data architecture. Iceberg’s design allows for efficient handling of large datasets, versioning, and schema evolution, which are crucial for maintaining data consistency and performance as data volumes grow.

- **Seamless Scaling:** Iceberg’s metadata and partitioning capabilities make it easy to scale data systems without sacrificing performance, while Dremio’s reflections ensure that queries remain fast and responsive as the dataset grows.

- **Flexible Data Management:** Iceberg’s ability to handle schema changes and partition evolution allows organizations to adapt their data models over time without reprocessing entire datasets, further optimizing costs and resources.

### 5. Better Resource Utilization

With Dremio’s ability to streamline data movement between layers and optimize query performance, organizations can make better use of their computational resources. Instead of spending significant compute power on redundant data transformations or processing entire datasets for minor changes, Incremental Reflections ensure that only the necessary data is processed, reducing costs and improving efficiency.

- **Optimized Compute Costs:** Incremental processing allows organizations to use their compute resources more efficiently, focusing on changes rather than processing entire datasets repeatedly.

- **Improved Query Performance:** By precomputing reflections, Dremio ensures that even complex queries across large datasets are executed with minimal compute overhead, freeing up resources for other critical tasks.

These real-world benefits make Dremio an invaluable tool for implementing and optimizing the three-tier data organization pattern. By leveraging its advanced features like virtual views, reflections, and its seamless integration with Apache Iceberg, organizations can achieve faster, more cost-effective data management, while maintaining the flexibility to scale as their data needs grow.

- [Apache Iceberg 101](https://www.dremio.com/lakehouse-deep-dives/apache-iceberg-101/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=threelayers&utm_content=alexmerced&utm_term=external_blog)
- [Hands-on Intro with Apache iceberg](https://www.dremio.com/blog/intro-to-dremio-nessie-and-apache-iceberg-on-your-laptop/?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=threelayers&utm_content=alexmerced&utm_term=external_blog)
- [Free Apache Iceberg Crash Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=threelayers&utm_content=alexmerced&utm_term=external_blog)
- [Free Copy Of Apache Iceberg: The Definitive Guide](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=threelayers&utm_content=alexmerced&utm_term=external_blog)