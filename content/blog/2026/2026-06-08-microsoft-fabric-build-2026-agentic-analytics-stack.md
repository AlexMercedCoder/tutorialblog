---
title: "Microsoft Fabric Build 2026 Agentic Analytics Stack"
date: "2026-06-08"
description: "Microsoft Build 2026 revealed an agentic analytics stack built on Fabric IQ, OneLake Iceberg support, and semantic models. The architecture shows how Microsoft competes with open lakehouse platforms."
author: "Alex Merced"
category: "Data Platforms"
tags:
  - "Microsoft Fabric agentic analytics"
  - "Fabric IQ"
  - "Copilot analytics"
  - "OneLake agents"
  - "Microsoft Build 2026"
  - "Iceberg OneLake"
---

## The Build 2026 Data Story

Microsoft Build 2026, held June 2-4, marked a clear shift in the company's data strategy. The theme was agentic applications, and the data foundation was Microsoft Fabric. The opening blog post by the Azure Database team put it directly: "The challenge is no longer model capability, but consistent, shared data context across the business" (source: Microsoft Azure Blog, June 2026).

This framing is significant. Microsoft is positioning Fabric as the shared context layer for AI agents. The company is not competing on model quality (it has OpenAI partnerships for that). It is competing on data integration, governance, and semantic consistency.

The announcements fell into three categories: a new application backend framework called Rayfin, a new PostgreSQL-compatible database called HorizonDB, and a set of Fabric IQ capabilities that unify data, semantics, and AI. Taken together, they form Microsoft's answer to the question "what infrastructure do AI agents need to operate on enterprise data?"

## Fabric IQ: Three Layers of Agent Context

Fabric IQ is the centerpiece of Microsoft's agentic data strategy. It operates through three integrated layers.

**Unified Data** is OneLake, Microsoft's multi-cloud data lake. OneLake stores data in Delta Lake format by default, but Microsoft added Iceberg support through metadata virtualization. When you write or create a shortcut to an Iceberg table folder, OneLake automatically generates virtual Delta Lake metadata for the table, enabling its use with Fabric workloads. Conversely, Delta Lake tables get virtual Iceberg metadata for Iceberg readers.

This bidirectional format conversion is the key architectural choice. Microsoft is betting that customers will store data in OneLake regardless of format preference, because OneLake can speak both Delta and Iceberg to any engine. The conversion is not a one-time migration. It is a virtual metadata layer that stays current as data changes.

**Semantic Models** are the second layer. Fabric IQ includes semantic models that define business metrics, dimensions, and relationships. These models feed Copilot for Microsoft Fabric, which generates natural language answers to business questions. The semantic models also feed AI agents through the MCP protocol, meaning external agents like Claude and Cursor can access governed Fabric metrics.

**Intelligent Actions** are the third layer. Copilot in Fabric can trigger actions based on data changes. When a sales metric crosses a threshold, Copilot can draft an email, create a Power BI alert, or start a Teams conversation. The agent does not just answer. It acts.

Microsoft IQ brings four IQ capabilities together. Work IQ understands how work happens. Fabric IQ understands how the business operates. Foundry IQ helps agents discover and reuse knowledge. Web IQ provides real-time global context from the web (new at Build 2026). Fabric IQ handles the analytical data portion.

## Rayfin: From Prompt to Production Backend

Rayfin is an open-source SDK and CLI that lets developers describe what to build and get an enterprise-grade application backend. It deploys to Microsoft Fabric, meaning the app gets enterprise security, scale, and data landing in OneLake.

The developer workflow is GitHub-based. You define data models, backend logic, and access policies entirely in code. Rayfin generates the database schema, authentication layer, and API endpoints. The code lives in your repository. The infrastructure runs in your Fabric tenant.

Rayfin's partnership with Replit is the most interesting aspect. Replit CEO Amjad Masad said at Build 2026: "Rayfin unlocks a new development model for our users. Agents write the code. Fabric ships it quickly and safely. Together, we are giving developers a path from idea to enterprise-grade production that is measured in hours, not months."

For the agentic analytics stack, Rayfin closes the loop. An AI agent can query Fabric data through Copilot. It can also build a new application on top of that data through Rayfin. The same semantic models that power the query experience also power the application backend. There is no separate modeling layer for apps versus analytics.

## OneLake Iceberg Support: The Open Format Strategy

Microsoft's Iceberg support in OneLake is pragmatic but limited. OneLake can read Iceberg tables through metadata virtualization. It generates virtual Delta Lake metadata for Iceberg folders, and virtual Iceberg metadata for Delta Lake folders. This means data stored in either format is accessible from engines that support the other format.

The implementation works with any Iceberg table using Parquet-formatted data files. You can create a shortcut in a Fabric lakehouse that points to an Iceberg table on S3, ADLS, or GCS. The table appears as a Delta Lake table ready for Fabric workloads. Conversely, Snowflake can read Delta Lake tables stored in OneLake by accessing the virtual Iceberg metadata.

Current limitations are significant. OneLake only supports Iceberg v2. V3 support is not available. Only the most recent table metadata version is converted. Data type mapping has issues, especially with Snowflake INT64, double, and Decimal types. And metadata storage is not portable because it uses absolute path references.

The v3 gap matters. Iceberg v3 features like deletion vectors, row lineage, and VARIANT types are available on Snowflake and Databricks but not in OneLake. For Microsoft Fabric users who need v3 features, the path is to store data in Delta Lake format (which has its own deletion vector implementation) rather than Iceberg.

## GPU-Accelerated Analytics in Fabric

A quieter but important Build 2026 announcement was GPU-accelerated analytics in Fabric. UNC Health reported up to 5x improvement in query speeds using the GPU-accelerated data warehouse (source: Microsoft Azure Blog, June 2026).

The GPU acceleration applies to the Fabric data warehouse workload within OneLake. It accelerates large-scale scans and aggregations by running Parquet decoding and filter evaluation on GPU cores instead of CPU cores. For AI agent workloads where agents frequently scan large historical datasets, GPU acceleration can reduce query latency by 3-5x.

This puts Fabric in an interesting competitive position. Most cloud data warehouses run on CPU. Snowflake's compute layer uses CPU-bound virtual warehouses. Databricks' Photon engine uses CPU with some SIMD optimization. Microsoft's GPU-accelerated warehouse offers a different performance profile for scan-heavy workloads.

## Semantic Models for Agents

Microsoft's semantic models in Fabric IQ mirror the semantic view concept in Snowflake and the metric view concept in Databricks. They define business metrics, dimensions, and relationships that Copilot and AI agents use for natural language querying.

The key difference is Microsoft's MCP support. Fabric IQ connects to the Model Context Protocol, meaning agents built with Claude, Cursor, or any MCP-compatible framework can query Fabric semantic models directly. The agent talks to Fabric IQ through MCP, receives the semantic model definition, and generates queries using governed business terms.

This is the same MCP integration that Snowflake Horizon Context and Atlan offer. The industry is converging on MCP as the standard protocol for agent-data interaction. The semantic layer publishes its vocabulary through MCP. The agent discovers and uses that vocabulary. The database executes the query.

Fabric IQ's differentiation is the breadth of the IQ ecosystem. Work IQ understands work patterns through Microsoft 365 data. Foundry IQ connects to Azure AI Foundry for model discovery. Web IQ provides real-time context from Bing. An agent using Fabric IQ can potentially combine internal sales data with external market trends and internal communication patterns in a single query. Whether this integration is practical in production depends on the agent's design and the user's governance policies.

## Comparison with Dremio's Open Lakehouse Approach

Microsoft Fabric and Dremio take different paths to the same destination: making Iceberg data queryable by AI agents.

Microsoft's path is a managed platform. OneLake stores the data. Fabric runs the compute. Copilot provides the AI interface. Semantic models define the business vocabulary. Everything runs in Microsoft's tenant. The advantage is simplicity. One vendor, one bill, one support team. The trade-off is lock-in. Moving data out of OneLake means rewriting pipelines, reformatting tables, and rebuilding semantic models.

Dremio's path is open federation. Iceberg tables stay in your cloud storage (S3, ADLS, GCS). Dremio queries them in place. The semantic layer sits on top of the query engine without requiring data movement. The Polaris catalog handles metadata across engines. The advantage is portability. You can switch query engines without migrating data. The trade-off is that you manage more infrastructure choices.

For organizations already deep in the Microsoft ecosystem, Fabric IQ is the natural choice. For organizations that want an open, multi-cloud, multi-engine lakehouse, Dremio's approach offers more flexibility. Both platforms converge on the same core belief: AI agents need governed semantic context to query data safely.

## The Path to Production Agentic Analytics

Microsoft's Build 2026 announcements lay out a clear path for teams building agentic analytics on Fabric.

Start with OneLake as the unified data store. Ingest data from operational systems through built-in mirroring or Azure Database for PostgreSQL connectors. Enable Iceberg format conversion so external engines can read the same data. Then build semantic models on top of the OneLake tables. Define the metrics, dimensions, and relationships that matter to your business. Connect Copilot for Microsoft Fabric to the semantic models for natural language querying. Finally, expose the semantic models through MCP for external AI agents.

The Fabric IQ architecture handles the rest. Data refresh is continuous through mirroring. Query optimization is automatic through GPU acceleration. Governance is baked in through Microsoft Entra ID and Fabric RBAC. The agent sees governed metrics, not raw tables.

## HorizonDB and the Database Hub

Azure HorizonDB, announced in public preview at Build 2026, represents Microsoft's vision for AI-native transactional databases. It is a fully managed, PostgreSQL-compatible database with elastic storage up to 128 TB, scale-out compute up to 3,072 vCores, and sub-millisecond multi-zone commit latency.

For the agentic analytics stack, HorizonDB fills the transactional gap. Fabric IQ provides analytical context through OneLake and semantic models. HorizonDB provides operational context through its PostgreSQL-compatible query surface, vector search, and integrated AI model management. An AI agent can query Fabric IQ for "what was last quarter's revenue by region" and HorizonDB for "what are the current inventory levels for those regions' top products."

The Database Hub in Fabric (private preview) unifies these capabilities. It provides a central management interface for Microsoft databases and mirrors operational data into OneLake for analytical queries. The mirroring is continuous and zero-ETL. Data written to HorizonDB appears in OneLake within seconds, available for Fabric IQ queries.

This tight integration between transactional and analytical databases is Microsoft's competitive advantage over point-solution vendors. Snowflake and Databricks offer analytical querying but do not manage transactional databases. Microsoft offers both, connected through OneLake.

## The Bottom Line

Microsoft Fabric at Build 2026 is a platform designed for the agentic era. Rayfin turns prompts into production backends. OneLake bridges Delta Lake and Iceberg formats. Fabric IQ provides three layers of agent context from unified data to semantic models to intelligent actions.

The Iceberg v2 limitation is the main gap for teams that need v3 features like row lineage or deletion vectors. But for teams already in the Microsoft ecosystem, Fabric IQ offers the shortest path from data to agentic applications. The platform handles integration, governance, and AI connectivity in one stack. The trade-off is the lock-in. For teams that value open formats and multi-engine flexibility, a federated approach with Dremio may be a better fit.

---

**Building an agentic analytics stack on open Iceberg tables?** Dremio's lakehouse platform queries Iceberg tables across clouds and catalogs without data movement, while the AI Semantic Layer provides governed business context for AI agents. No lock-in, no format conversion tricks. [Learn more at dremio.com](https://www.dremio.com).
