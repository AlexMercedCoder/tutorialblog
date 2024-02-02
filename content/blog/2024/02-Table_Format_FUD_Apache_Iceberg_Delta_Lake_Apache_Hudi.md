---
title: Table Format FUD - Thinking Through the Table Format Conversion (Apache Iceberg, Apache Hudi, Delta Lake)
date: "2024-02-02"
description: "Understanding how to choose a table format"
author: "Alex Merced"
category: "Data Lakehouse"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - Data Lakehouse
  - Data Lake
  - Apache Iceberg
  - Delta Lake
  - Apache Hudi
---

## Context

This article is meant to be a sober reflection on the data lakehouse table format conversation I have had as a participant over the last two years. I've written the following articles over the years on the subject:

- [Table Format Comparison](https://www.dremio.com/subsurface/comparison-of-data-lake-table-formats-iceberg-hudi-and-delta-lake/?utm_source=blogs&utm_medium=external&utm_content=content&utm_campaign=alexmercedcontent&utm_term=iceberg+lakehouse+nessie)
- [Table Format Comparison: Partitioning](https://www.dremio.com/subsurface/table-format-partitioning-comparison/?utm_source=blogs&utm_medium=external&utm_content=content&utm_campaign=alexmercedcontent&utm_term=iceberg+lakehouse+nessie)
- [Table Format Comparison: Governance](https://www.dremio.com/subsurface/table-format-governance-and-community-contributions-apache-iceberg-apache-hudi-and-delta-lake/?utm_source=blogs&utm_medium=external&utm_content=content&utm_campaign=alexmercedcontent&utm_term=iceberg+lakehouse+nessie)
- [Architecture of the Lakehouse Table Formats](https://www.dremio.com/blog/exploring-the-architecture-of-apache-iceberg-delta-lake-and-apache-hudi/?utm_source=blogs&utm_medium=external&utm_content=content&utm_campaign=alexmercedcontent&utm_term=iceberg+lakehouse+nessie)
- [Apache Iceberg 101](https://www.dremio.com/blog/apache-iceberg-101-your-guide-to-learning-apache-iceberg-concepts-and-practices/?utm_source=blogs&utm_medium=external&utm_content=content&utm_campaign=alexmercedcontent&utm_term=iceberg+lakehouse+nessie)

I am writing this article in response to these two pieces:
- [Jacques Nadeau: Overview of state of table formats](https://www.linkedin.com/posts/jacquesnadeau_deltalake-apacheiceberg-activity-7158331703898337283-KK-L?utm_source=share&utm_medium=member_desktop)
- [Kyle Weller: Don’t Worry About Data Lakehouse Features, Trust in Google Search…](https://medium.com/@kywe665/dont-worry-about-data-lakehouse-features-trust-in-google-search-5d8d13675680)

**DISCLOSURE:** I work for [Dremio, the Data Lakehouse Platform](https://www.dremio.com/solutions/data-lakehouse/), who is a contributor to Apache Iceberg and has robust support for Apache Iceberg Data Lakehouses (DDL, DML, Cataloging, Table Optimization) and also can read Delta Lake tables.

## Introduction
Choosing the right [open source table format](https://www.dremio.com/blog/open-source-and-the-data-lakehouse-apache-arrow-apache-iceberg-nessie-and-dremio/) for your data lakehouse is more top of mind than ever as people explore implementing [data lakehouses](https://www.dremio.com/blog/why-lakehouse-why-now-what-is-a-data-lakehouse-and-how-to-get-started/) and data [lakehouse platforms](https://www.dremio.com/blog/what-is-a-data-lakehouse-platform/). With three prominent options in Apache Iceberg, Apache Hudi and Delta Lake all vying to be the heart of your lakehouse, it's easy to get lost in the noise of feature sets and performance benchmarks. This blog aims to cut through the fear, uncertainty, and doubt (FUD) surrounding table formats, providing a clear path to understanding what really matters in your selection process.

## Short Version for Quick Readers
All major table formats are mature projects that are constantly improving performance and feature sets. The existence of multiple formats is a boon to the industry, as it fosters a competitive environment that drives improvements across the board. However, when it comes down to choosing a format, it's not just about features and performance. The critical decision should be based on the ecosystem of tools you plan to use and how well they integrate with the format. By focusing on your use cases and testing with your actual workloads, you'll find the table format that best meets your needs.

## My Journey with Table Formats and Lakehouses
Over the last two years, I've immersed myself in the world of table formats and lakehouses, a journey that I plan to continue for the foreseeable future. My entry into this conversation began with an article comparing different table formats. That piece, which became one of my most-viewed writings, initially focused on the various features of these formats. However, as I've updated the article over time, I've noticed the narrowing differences between them, leading to a significant realization.

### Ecosystem Over Features
What truly matters is not the array of features a format possesses but the ecosystem that supports these features and their usability. After all, what's the point of advanced functionality if it's not utilized effectively or is too complex to integrate? The real value lies in how these features are implemented within the ecosystem and how seamlessly they can be adopted into your workflows.

### Key Takeaways
**Ecosystem and Usability Over Features**
The first major takeaway from my experience is the paramount importance of the ecosystem and usability over the raw feature set. A table format might boast an impressive list of capabilities, but if those features are not accessible or practical for your team's use, their value diminishes. Thus, when evaluating table formats, consider the supporting tools, documentation, community, and ease of integration into your existing systems.

## Performance Considerations: Beyond Benchmarks

When delving into the world of table formats, it's easy to get caught up in the numbers game of performance benchmarks. While these metrics offer a snapshot of efficiency under ideal conditions, they seldom provide the full picture needed for informed decision-making.

#### The Limitations of Benchmarks
Benchmarks, particularly those in Apache Spark environments, have their place in performance evaluation. However, they often reflect a momentary advantage, influenced by specific configurations and data sets that may not align with everyday usage. 

The reality is that the performance of a table format is not static; it evolves with each update to its libraries, the processing too, and as users configure the table and tools to suit their unique workloads.True performance evaluation requires a broader lens, one that considers how a table format behaves with the suite of tools you rely on and the nature of your data.

#### Making Informed Choices
Choosing a table format based on performance means looking beyond Spark-centric benchmarks. It involves testing how each format manages your specific data types and use cases, across the tools and technologies that form the backbone of your data infrastructure. Only by assessing performance in this holistic manner can you ensure that your chosen table format aligns with your operational realities and performance expectations.

## Understanding the Metric of Open Source Contributors

A critical aspect I'd like to clarify from my original blog post is the rationale behind using the number of open source contributors as a key metric. This choice might have raised some eyebrows, especially considering the complex structure of repository management across many table formats. These projects often distribute their development efforts across multiple repositories, separating the core project—typically written in Java—from implementations in other programming languages like Python, Go, and Rust.

#### Why Focus on Core Contributors?
The decision to concentrate on contributors to the core format was deliberate. The core repository is where the most significant decisions regarding the format's evolution are made. It's the heart of the project, determining not just current functionalities but also setting the direction for future developments. The distribution of influence over these decisions is crucial. It reveals whether the evolution of the format is being guided by a diverse group of stakeholders or if it's under the control of a few, potentially leading to a bias in development priorities.

#### The Impact on the Ecosystem
While there are undoubtedly many talented contributors working across the various language-specific repositories, their work often focuses on mirroring the functionality established in the core. Although valuable, this does not typically drive the project's overall direction. The core repository's contributor diversity is therefore a more accurate indicator of the project's health and its alignment with the broader community's needs.

#### The Importance of Competitive Diversity
From a consumer's perspective, the diversity of contributors to the core repository is more than a technicality; it's a safeguard against vendor lock-in, budget inflation, and the potential stagnation of innovation in a controlled market. A table format steered by a community with varied interests ensures that no single entity can dominate the project's direction to the detriment of the community. This competitive diversity fosters an environment where vendors can innovate on equal footing, driving technological advancements and more favorable pricing for end-users.

#### The Value of Contributor Diversity
In aiming for a competitive market, the significance of an open format governed by a broad coalition cannot be overstated. The diversity of core repo contributors matters because it ensures that the format remains open, adaptable, and free from monopolistic control. By prioritizing formats with a wide array of contributors, we champion the principles of open innovation and collective progress that are foundational to the open source ethos.

## Conclusion

It's clear that the table format conversation transcends mere technical specifications and performance metrics. The past two years have illuminated the paramount importance of ecosystem compatibility, the tangible benefits of a broad, diverse community of open-source contributors, and the nuanced understanding required to evaluate performance in real-world scenarios. As we navigate the choices between Apache Iceberg, Apache Hudi, and Delta Lake, it becomes evident that the true value lies in fostering an open, competitive market that drives innovation, ensures flexibility, and avoids vendor lock-in. By prioritizing formats that align with our technological ecosystems, supported by a vibrant community, and delivering performance on our workloads with our desired tooling, we can build data infrastructures that are not only robust and efficient but also adaptable and forward-looking. 

- [Try the Dremio Lakehouse Platform Today](https://bit.ly/am-dremio-get-started-external-blog)

- [Build a Prototype Data Lakehouse on Your Laptop with This Tutorial](https://bit.ly/am-dremio-lakehouse-laptop)