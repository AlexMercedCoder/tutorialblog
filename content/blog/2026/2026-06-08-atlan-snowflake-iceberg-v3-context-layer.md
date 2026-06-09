---
title: "Lakehouse Context Layers with Atlan and Iceberg v3"
date: "2026-06-08"
description: "Lakehouse context layers bridge the gap between raw Iceberg tables and AI agents that need business meaning. Atlan and Snowflake Horizon each take different approaches to the same problem."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - "lakehouse context layer"
  - "Atlan Snowflake Iceberg"
  - "Iceberg v3 lineage"
  - "AI-ready metadata"
  - "Snowflake Horizon"
  - "context plane"
---

## The Gap Between Table Formats and Business Meaning

Apache Iceberg v3 went GA on Snowflake on May 7, 2026, bringing deletion vectors, row lineage, VARIANT types, and nanosecond timestamps to the open table format. These are real technical advances. Deletion vectors alone deliver up to 10x faster DML operations by replacing positional delete files with O(1) binary bitmap lookups (source: Atlan Knowledge Base, June 2026). Row lineage adds native CDC through `_row_id` and `_last_updated_sequence_number` fields that track every row change without external tooling.

But here is the problem. A faster table format does not tell an AI agent what a column means. It does not tell a data consumer whether `revenue` in table A means the same thing as `revenue` in table B. It does not explain that `ACCT_STAT_CD` maps to a lookup table from 2004 that nobody remembers.

A 2025 ACL study by Ji et al. quantified this gap dramatically. The same frontier LLM models that scored 94-95% accuracy on the standard BIRD text-to-SQL benchmark dropped to 39.1% on BIRD-Ent, an enterprise version with abbreviated column names, massive schemas over 4,000 columns, and scattered domain knowledge. The models did not get worse. The data got real.

This is where the context layer enters. A context layer sits above the table format layer. It enriches raw metadata with business meaning, relationships, governance policies, and usage patterns. It is what transforms an Iceberg table from a Parquet file with a metadata pointer into a governed business asset that AI agents can query without guessing.

## What a Context Layer Actually Contains

A production context layer has four distinct components that work together.

**Metadata management** is the foundation. This means catalog schemas, column types, partition specs, and snapshot histories. Atlan connects to 100+ systems including Snowflake, Databricks, Tableau, Power BI, dbt, and Fivetran. Its active metadata platform ingests technical metadata from every source and normalizes it into a unified graph. Without this breadth, a context layer is just a warehouse catalog with a new name.

**Semantic modeling** adds business meaning. In Snowflake, semantic views define TABLES, RELATIONSHIPS, FACTS, DIMENSIONS, and METRICS in DDL. You declare that `orders.sale_amount` is a fact and `total_revenue` is `SUM(orders.sale_amount)`. The semantic view becomes a schema-level object that Cortex Analyst, CoCo, and any SQL client can query. Snowflake's approach is warehouse-native. It costs nothing extra, but it only sees Snowflake data.

**Governance policies** enforce who can see what. Row-level security, column masking, and RBAC must travel with the context. Snowflake Horizon Context makes governance native to the semantic layer. A metric restricted to the finance team stays restricted in Power BI, in Salesforce, and in any AI agent that queries it. No sync drift between a separate governance engine and a separate semantic layer.

**Lineage and provenance** track where data comes from and how it was transformed. Iceberg v3 row lineage helps at the table level. But full column-level lineage across ETL pipelines, BI dashboards, and manual SQL queries needs a context platform. Atlan ingests OpenLineage events, parses query logs, and maps column-level dependencies across systems.

## Atlan versus Snowflake Horizon: Two Context Architectures

Snowflake Horizon Context, announced at Summit 2026, is Snowflake's bet on becoming the context control plane. It follows a collect-enrich-activate pattern. It collects metadata via connectors to PostgreSQL, MS SQL Server, Tableau, Power BI, and dbt. It enriches through column-level lineage, popularity scores from query logs, and AI-generated documentation. It activates through context search in CoCo, automatic semantic view discovery, and MCP interoperability for external agents like Claude and Cursor.

The Horizon Context approach has clear strengths. It is native to the Snowflake engine. Governance is baked in. Semantic View Autopilot, which reached GA on February 3, 2026, automates semantic view creation from query history and BI assets (source: Snowflake blog, February 2026). It uses clustering algorithms to identify consensus business logic. If 200 queries calculate active user as `user_engagement_score > 50 AND last_login_days < 30`, Autopilot proposes that filter.

But Horizon Context is warehouse-bounded. It only sees Snowflake data. Most enterprises run 15 to 30 systems beyond Snowflake. A company using Snowflake for analytics, Databricks for ML, and Postgres for transactions needs context that spans all three.

Atlan takes the opposite approach. It positions itself as the context plane, not the format layer. Atlan ingests metadata from 100+ connectors, maps column-level lineage across systems, and publishes governed context through MCP servers for AI agents. Its Open Semantic Interchange (OSI) participation with 54 vendors means context definitions can travel across tools.

The practical difference shows up in multi-system queries. An AI agent that needs to join Snowflake revenue data with Salesforce pipeline data and Zendesk customer sentiment needs a context layer that understands all three systems. Snowflake Horizon Context cannot help with the Salesforce or Zendesk portions. Atlan can.

## Iceberg v3 as a Context Enabler

Iceberg v3 does not solve the context problem, but it makes some parts dramatically easier.

Row lineage is the clearest example. The `_row_id` field provides a unique identifier per row that never changes. The `_last_updated_sequence_number` field tracks which commit last modified the row. Together they enable CDC without Debezium, without Kafka connect workers, without any external infrastructure. A simple SQL query on `_last_updated_sequence_number` identifies every changed row in a commit window.

For a context layer, this means lineage tracking can operate at row granularity instead of file granularity. When Atlan ingests Snowflake query logs enriched with row lineage, it can show exactly which rows contributed to a specific metric at a specific point in time. This closes the loop between metadata management and actual data.

Deletion vectors also matter for context. In Iceberg v2, row-level deletes required positional delete files with O(log n) merge-join operations at read time. In v3, a single binary bitmap per data file per snapshot gives O(1) lookup. For context layers that need to track soft deletes and historical corrections, deletion vectors make time-travel semantics more reliable.

The VARIANT type in v3 is another context enabler. In v2, semi-structured JSON data had to be stored as STRING, forcing full-payload parsing on every query. v3 VARIANT uses high-performance binary encoding with shredding for SQL filter pushdown. For context layers ingesting API event logs, IoT sensor data, or observability telemetry, VARIANT means the context layer can index and query semi-structured data directly instead of forcing a schema-on-write approach.

Iceberg v3 metadata also helps. The `next-row-id` tracking property, mandatory for row lineage, provides a distributed counter that works across all writers. Multi-argument partition transforms enable bucketing on composite columns for more granular partition pruning. Default column values recorded in schema metadata eliminate NULL-versus-default logic downstream.

## The Polaris Catalog and Metadata Federation

Snowflake Horizon Catalog is powered by Apache Polaris. Polaris provides the Iceberg REST Catalog interface that enables cross-engine metadata access. A single Polaris instance can serve metadata to Snowflake, Spark, Flink, Trino, and Dremio.

For a context layer, Polaris solves the discovery problem. Instead of manually pointing each engine at an Iceberg table path, the catalog registers tables once and all authorized engines can discover them. Atlan integrates with Polaris to ingest metadata without needing direct database access.

The key architectural insight is that Polaris handles table-level metadata while the context layer handles column-level and business-level semantics. Polaris knows a table exists, where its files live, and what its current schema looks like. The context layer knows that the `total_revenue` metric sums `sale_amount` after subtracting returns, and that this metric is only visible to finance directors.

This separation of concerns matters for performance. Catalog operations like listing namespaces and describing tables run at metadata speed. Context queries like "which metrics use the orders table" run through the context platform's graph. Neither one blocks the other.

## AI Agents Need Business Context

The ACL study numbers frame the urgency. A 39% accuracy rate on enterprise schemas is not a small gap. It is a showstopper for any agentic workflow that crosses trust boundaries.

Consider what happens in a multi-agent system. Agent A extracts revenue numbers from Snowflake. Agent B calculates churn rate from Salesforce and Zendesk data. Agent C consolidates both into a board report. If each agent guesses at column meanings independently, the errors compound. Agent A might use gross revenue while Agent B uses net revenue. The board report gets a number that matches neither definition.

A governed context layer prevents this cascade. It publishes one definition for revenue that all agents consume. When an agent queries through MCP, it receives the metric definition, the allowed dimensions, and the access policy together. The agent does not guess. It does not hallucinate. It reads.

Atlan's MCP server is a concrete example. An Anthropic Claude agent connected to Atlan's MCP server can list catalogs, describe tables, read column-level lineage, and query semantic metrics. The agent receives business context alongside technical metadata. The result is SQL generation that uses governed metric names instead of raw column names.

Snowflake Horizon Context takes a similar approach through CoCo. When CoCo answers a question, it auto-finds relevant semantic views and falls back to raw tables only when no semantic view exists. The context layer becomes the default pathway for AI interaction.

## Context Layer Adoption Patterns

Teams adopting context layers follow one of three patterns.

**Single-platform context** uses Snowflake Horizon or Databricks Unity Catalog as the sole context layer. This works when all analytical data lives in one warehouse. The setup is simple. Governance is native. But the context layer cannot extend to other systems.

**Hub-and-spoke context** uses Atlan as the hub that ingests metadata from multiple platforms. Snowflake may be the primary warehouse, but Atlan also connects to Databricks, Tableau, and Salesforce. The context layer spans the entire data estate. Governance policies get defined in Atlan and enforced at each spoke.

## Hybrid context uses platform-native semantic layers for performance-critical queries and an external context platform for cross-system governance. Snowflake semantic views handle the core analytical metrics. Atlan handles the cross-system lineage and discovery. This pattern is emerging as the most common in 2026 enterprises.

## The ACL Study and Why Context Matters

The 2025 ACL study by Ji et al. is worth examining closely because it quantifies the exact problem a context layer solves. The researchers created enterprise versions of the standard BIRD and Spider benchmarks. They renamed columns with abbreviations (CUST_NM, ORD_DT, ACCT_STAT_CD). They expanded schemas to over 4,000 columns. They removed the implicit semantic hints that clean benchmarks provide.

The results were stark. Accuracy dropped from 95% to 39% on BIRD-Ent. The models did not get worse. The schemas got real. The lesson is that LLMs are exceptionally good at guessing meaning from well-named columns like `customer_name`. They are terrible at guessing meaning from `CUST_NM` or `revenue` when different systems define that term differently.

A governed context layer eliminates the guessing. When an AI agent queries through MCP and the context layer returns "CUST_NM maps to customer.name with data type string and valid format [A-Za-z ]+", the agent does not guess. It knows. The column name becomes irrelevant. The context layer provides the meaning.

This is why context layers are not optional for production agentic workflows. A 39% accuracy rate means the agent gets the answer wrong more often than it gets it right. No business can operate on those odds.

## The Bottom Line

Iceberg v3 makes table-level operations faster and more traceable. Deletion vectors, row lineage, and VARIANT types are genuine improvements. But they solve the format problem, not the meaning problem.

The context layer fills the gap between format and meaning. Whether you choose Snowflake Horizon's native approach, Atlan's multi-system platform, or a combination of both, the key is that your AI agents never touch raw schemas directly. Every column name, every metric definition, every join path goes through governed context first.

The 2025 ACL study showed what happens without context. A 39% accuracy rate on real enterprise schemas is not a foundation for agentic workflows. With a proper context layer, that rate jumps above 83% according to enterprise benchmarks reported by Promethium.ai in 2026. The gap is not about model capability. It is about whether the data carries its own meaning.

---

**Ready to build a context layer for your lakehouse?** Dremio's lakehouse platform combines Apache Iceberg-native storage with a built-in semantic layer and AI-powered semantic search. Teams use Dremio to query Iceberg tables across clouds and on-premises data without moving data, while the semantic layer ensures AI agents always get governed business context. [Learn more at dremio.com](https://www.dremio.com).
