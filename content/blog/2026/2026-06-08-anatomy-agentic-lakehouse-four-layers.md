---
title: "Anatomy of an Agentic Lakehouse"
date: "2026-06-08"
description: "The four-layer architecture of the agentic lakehouse: object storage, Apache Iceberg table format, Apache Polaris catalog, and the semantic/agent layer. How each layer provides guarantees for AI agent access."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - "agentic lakehouse architecture"
  - "four layers of agentic lakehouse"
  - "Apache Polaris catalog"
  - "Medallion architecture"
  - "Iceberg table format"
  - "AI semantic layer"
---

The term "agentic lakehouse" gets thrown around a lot in 2026. Most references describe it as a data platform that AI agents can query. That description is technically true and practically useless. A chatbot wired directly to Parquet files on S3 can "query data," but it will produce wrong answers, bypass security controls, and degrade under load.

The agentic lakehouse is a four-layer architecture where each layer provides a specific guarantee that makes AI agent access reliable, auditable, and performant. The layers are object storage, the Iceberg table format, the catalog (Apache Polaris or compatible), and the semantic/agent interface layer. Decisions made at each layer propagate upward and constrain what agents can safely do.

This article defines each layer, explains the guarantees it provides, and shows how they combine into an architecture that agents can discover, query, and write to without human supervision.

## Layer 1: Object Storage as the Physical Foundation

The bottom layer is object storage: Amazon S3, Azure Data Lake Storage Gen2, or Google Cloud Storage. This is where the actual bytes live: Parquet and ORC data files, Iceberg metadata files (table metadata JSON, manifest lists, manifest files), delete files, deletion vectors, and auxiliary files like bloom filters and column statistics.

The choice of storage class matters more for agent workloads than for batch ETL. Agents query interactively; they do not wait for Glacier restore. Gold-layer tables (certified, high-value datasets) should use hot storage tiers. Standard tier on S3, hot tier on ADLS Gen2, standard tier on GCS. Intelligent-tiering and cold tiers introduce first-byte latency that breaks the sub-second response expectation of conversational AI.

Namespace layout is another architectural decision with long tail effects. Organize storage paths by business domain, not by tool or team. A path like `s3://data/finance/revenue/` is stable across catalog migrations and engine swaps. A path like `s3://data/alexmerced-iceberg-test/` is not. Agent catalogs register namespace paths once and expect them to persist.

The storage layer also hosts the Iceberg metadata tree. This tree is not an index or a cache. It is the authoritative record of every valid snapshot, every data file, and every column statistic. When an agent asks "what data exists for this date range and product category," the answer comes from pruning the metadata tree, not from scanning data files. The storage layer must provide consistent read-after-write for metadata files. S3's strong consistency (announced in 2020 and generally available since 2021) meets this requirement. ADLS's hierarchical namespace guarantees it natively. GCS's strong consistency covers it.

IAM at the storage layer should be minimal. Give broad storage access only to the catalog service. Engines and agents receive short-lived, table-scoped credentials via credential vending. This is the zero-trust storage model: no agent directly touches S3. Every read goes through the catalog, the engine, and the semantic layer.

## Layer 2: The Iceberg Table Format

The second layer is the table format. Apache Iceberg is the standard for the agentic lakehouse because it provides guarantees that raw file formats and older table formats (Hive, Delta Lake without UniForm) do not.

**Snapshot isolation.** Every read or write operates on a consistent snapshot. An agent that reads a table at time T1 sees exactly the data that was committed at or before T1, regardless of concurrent writes. This is serializable isolation, defined in the Iceberg spec and enforced by the atomic metadata commit in the catalog.

**Time travel.** An agent can query the table as it existed at any previous snapshot. This is critical for reproducibility: if an agent's analysis depends on data from three hours ago, it can query the exact snapshot it needs, not the current state (which may have been updated by another agent).

**Schema evolution.** Agents can assume that table schemas evolve without breaking references. Iceberg supports adding columns, renaming columns, and changing column types without rewriting data files. An agent that queries `SELECT product_id, price FROM catalog.pricing.products` continues to work after a `description` column is added. In Hive, a schema change would require updating every downstream query.

**Hidden partitioning.** Agents do not need to know the physical partition layout. They query by column values (for example, `WHERE event_date >= '2026-01-01'`), and the engine uses partition statistics in the manifest files to prune irrelevant files. The physical partitions can be reorganized without changing queries.

**Iceberg V3 features for AI workloads.** Iceberg V3 introduces three capabilities that directly benefit agentic workloads:

- The variant type stores semi-structured JSON data in a binary-shredded format. Agent action logs, which are often nested JSON with varying schemas, can be stored in a variant column without defining a fixed schema upfront.
- Nanosecond timestamp precision supports high-frequency event streams from inference monitoring, real-time analytics agents, and sensor data.
- Deletion vectors enable efficient row-level updates without rewriting entire data files. Agents that update a small number of rows (correcting a prediction, updating a recommendation) generate only a bitmap change instead of a full file rewrite.

The table format decision constrains everything above it. Choose Iceberg with V2 as a minimum. Enable V3 features as they become stable in your engine.

## Layer 3: The Catalog as the Agentic Control Plane

The catalog is where every agent interaction begins. Before an agent writes a single SQL statement, it calls the catalog to discover what tables exist, where their metadata lives, and what access the agent has.

Apache Polaris, the open-source Iceberg REST catalog implementation, defines the reference architecture for this layer. Polaris uses a three-tier access model:

1. **Principal:** A user, service account, or agent identity.
2. **Principal Role:** A group of principals that share access characteristics.
3. **Catalog Role:** A set of privileges applied to a namespace or table.

For an AI agent, the minimum privilege set is `NAMESPACE_LIST` and `TABLE_READ_DATA` on specific namespaces. No agent should have `TABLE_WRITE_DATA` unless it is explicitly designed and tested for write operations.

**Credential vending** is the catalog's most important security feature. When an engine (or an agent through an engine) requests data, the catalog vends short-lived credentials scoped to the specific data files that the query will read. On AWS, this is a temporary STS token with an S3 path prefix that matches only the required files. On Azure, it is a SAS token with a similar scope. On GCS, it is a short-lived access token.

The credentials expire in minutes (configurable, typically 5 to 60 minutes). If an agent's token is exfiltrated, the attacker can read only the files covered by that specific query, and only until the token expires. This is the zero-trust data access model in practice.

**Commit arbitration.** The catalog also serializes metadata commits. When two agents write to the same table, the catalog's atomic compare-and-swap ensures that only one commit succeeds. The losing writer retries with the new table state. This is Iceberg's OCC, enforced at the catalog layer, not the storage layer or the engine layer.

**Multi-catalog federation.** An agentic lakehouse may have multiple catalogs. A production catalog (Polaris or Snowflake Horizon) holds certified tables. A development catalog holds experimental tables. An external catalog (AWS Glue or Hive Metastore) may exist for legacy data. The query engine federates across these catalogs, presenting a unified semantic layer to agents.

Dremio's architecture treats the catalog as the center of the stack. Dremio Open Catalog includes Polaris, federation connectors, and the AI semantic layer in a single deployment. Agents connect to the catalog; the catalog routes them to the right storage, the right engine, and the right semantic views.

## Layer 4: The Semantic and Agent Interface Layer

The top layer is where business meaning and AI interaction converge. This layer has two sublayers: the semantic layer (which provides business context for raw tables) and the agent interface (which exposes safe tools to AI models).

**The semantic layer** translates raw column names and table structures into business concepts. A column named `rev_amt` becomes `Revenue Amount`. A join of four tables becomes a single semantic view called `Monthly Customer Profitability`. The semantic layer stores metric definitions, dimension hierarchies, and business rules in a queryable format.

For AI agents, the semantic layer is the difference between a useful answer and a hallucinated number. An agent that queries `SELECT * FROM raw_transactions` has no context about what a "transaction" means, which transactions are excluded (test transactions, refunds, inter-company transfers), or how to aggregate them correctly. An agent that queries `SELECT * FROM semantic.monthly_revenue` has a certified, documented, and governed definition.

The semantic layer also enforces access control at the column and row level. A human analyst might see all columns. An agent serving a regional manager sees only the columns and rows relevant to that region. Row filters and column masks are applied transparently by the semantic layer, not pushed down to the storage layer.

**The agent interface** is the MCP server or similar protocol adapter that exposes the semantic layer as a set of callable tools. Each tool has a name, description, input parameters, and a clear return type. The agent does not write arbitrary SQL. It calls `get_product_revenue(product_id, date_range)` and receives a JSON response.

The agent interface enforces three constraints that raw SQL access does not:

1. **Validated inputs.** The tool checks that parameters are within expected ranges and types before executing the query.
2. **Scoped execution.** The tool runs under a specific catalog principal with a specific set of privileges. It cannot escalate privileges or access data outside its scope.
3. **Audit trail.** Every tool call is logged with agent identity, timestamp, parameters, and response size.

Dremio's MCP server (open source, apache-2.0 licensed, available at github.com/dremio/dremio-mcp) implements this pattern. It exposes tools for listing catalogs, describing schemas, getting table schemas, running SQL queries, and checking the status of Reflections (materialized views). The server authenticates via OAuth or personal access token, and every tool call runs under the authenticated principal's catalog role.

## The Medallion Architecture Applied to the Agentic Lakehouse

The medallion architecture (bronze, silver, gold) maps directly onto the four-layer agentic lakehouse. Each medallion layer sits at the storage and table format layers, with catalog and semantic layers on top.

**Bronze layer.** Raw ingested data. Minimal transformations. Full audit trail of source ingestion. Agent access to bronze is read-only and restricted to debugging and data quality checks. No semantic layer on top of bronze.

**Silver layer.** Cleaned, conformed, and validated data. Deduplicated, typed, and partitioned for query performance. Agents may query silver with oversight, using scoped catalog roles that limit access to specific namespaces. Limited semantic layer: column descriptions and basic metric definitions.

**Gold layer.** Aggregated, certified, business-ready data products. Defined metrics, documented dimensions, and owned data products. Agents query gold through the semantic layer. No direct table access. Every query goes through a semantic view or MCP tool.

This layering prevents the most common agent failure: treating raw data as though it were clean data. An agent assigned to "calculate monthly churn" should only see the gold layer view `monthly_churn` which incorporates the correct definitions, exclusions, and aggregation logic. If it accessed silver or bronze, it would compute churn incorrectly (or waste compute on full-scan queries of raw data).

## How the Layers Interact: An Agent Request Walkthrough

Here is what happens when an agent asks "What was revenue last quarter?" in a properly layered agentic lakehouse.

1. **Agent interface layer.** The agent calls the MCP tool `get_revenue(period='last_quarter')`. The MCP server validates the period parameter and authenticates the agent's principal.

2. **Catalog layer.** The MCP server passes the request to the query engine. The engine authenticates with the catalog (Polaris) using the agent's vended credentials. The catalog verifies that the principal has `TABLE_READ_DATA` on the `semantic.revenue_metrics` view.

3. **Iceberg table format layer.** The catalog returns the current metadata location for `semantic.revenue_metrics`. The engine reads the table metadata file, manifest list, and manifests. Pruning uses partition statistics to identify only the manfests and data files for the previous quarter.

4. **Object storage layer.** The engine requests credential vending from the catalog for the specific data files identified in pruning. The catalog returns scoped credentials. The engine reads only those files.

5. **Result.** The engine returns the aggregated revenue value. The MCP server formats it as JSON. The agent receives the answer.

Each layer provided a specific guarantee. The agent interface validated inputs. The catalog enforced access. The table format enabled partition pruning (reducing the scan from all files to only the relevant quarter). The storage layer provided consistent reads with scoped credentials.

If any layer were missing, the system would degrade. Without the catalog, the agent would need direct storage access (violating zero-trust). Without the table format, pruning would require scanning partition directories (O(n) with partition count). Without the semantic layer, the agent would guess which table contains "revenue" (high hallucination risk). Without the agent interface, the agent would write raw SQL (risk of injection, expensive queries, and ungoverned access).

## Practical Guidance for Building Each Layer

**Storage.** Use a separate storage bucket or container for each medallion layer (bronze, silver, gold). Set lifecycle policies: bronze retains data indefinitely; silver retains for 90 days after gold certification; gold retains per business retention policy. Enable object versioning for recovery.

**Table format.** Start with Iceberg V2. Enable V3 deletion vectors for tables with frequent row-level updates from agents. Use the variant type for agent action logs. Configure snapshot retention to keep at least 30 days of history for time travel.

**Catalog.** Deploy Apache Polaris or use a compatible managed catalog (Snowflake Horizon Catalog, Dremio Open Catalog). Define catalog roles that map to agent functions, not individual agent instances. Use credential vending with a token lifetime of 15 minutes or less for interactive queries.

**Semantic layer.** Create semantic views for every gold-layer table. Include metric definitions, dimension hierarchies, and business rules in the semantic model. Test each semantic view by asking an agent to produce a known-correct answer and verifying the output.

**Agent interface.** Deploy an MCP server that exposes semantic views as tools. Use OAuth 2.0 for authentication. Log every tool call. Set query timeout limits (30 seconds for interactive agents, 5 minutes for analytical agents). Set result size limits (10,000 rows default, configurable).

## Why Four Layers Instead of Three or Five

The four-layer architecture is the minimum viable decomposition for agentic data access. Three layers (storage, table format, agent) would require the agent to resolve catalog and semantic issues internally, which is what causes hallucinations and access control violations. Five layers (splitting semantic and agent interface) is possible but adds complexity without proportional benefit for most deployments.

The key insight is that each layer has a different rate of change. Storage layer decisions change every few years. Table format decisions change with each Iceberg spec release (yearly). Catalog decisions change when teams reorganize or policies change (quarterly). Semantic and agent decisions change with each new agent or business requirement (weekly or daily). Separating these change domains is what makes the architecture maintainable.

## Summary

The agentic lakehouse is not a single product. It is a four-layer architecture where object storage provides durable physical storage, Iceberg provides table-level guarantees (snapshot isolation, time travel, schema evolution), the catalog provides access control and commit arbitration, and the semantic/agent layer provides business context and safe tool interfaces.

Each layer is independently deployable and independently replaceable. You can run Iceberg tables on S3 with Polaris and Dremio's semantic layer. You can run the same Iceberg tables with Snowflake Horizon Catalog and Snowflake's semantic layer. The architecture is open, and the guarantees are defined by standards, not vendor APIs.

For teams building agentic lakehouse infrastructure, start with the catalog and storage layers. Those are the hardest to change later. Add the semantic layer before you add agents. The semantic layer is what prevents agents from producing confidently wrong answers. Add the agent interface last, after you have tested that the lower layers enforce the right constraints.

Dremio's Agentic Lakehouse platform provides a unified implementation of all four layers: object storage connectors, Iceberg table support, Open Catalog (Polaris-compatible), and the AI semantic layer with MCP server. Explore the full architecture at [dremio.com/agenticai](https://www.dremio.com/agenticai) or try it free at [dremio.com/get-started](https://www.dremio.com/get-started).

*Sources: Dremio Blog "Agentic Lakehouse Architecture: The Four Technical Layers" (dremio.com), Apache Iceberg Specification (iceberg.apache.org), Apache Polaris Documentation, Databricks "What is Medallion Architecture" (databricks.com), Informatica "Building the Semantic Data Layer for Agentic AI" (informatica.com).*
