---
title: "Composable Analytics Beats Metric Catalogs"
date: "2026-06-08"
description: "Metric catalogs define what terms mean. Composable analytics defines how terms combine, transform, and relate. For AI agents, composability is what turns definitions into reasoning."
author: "Alex Merced"
category: "Data Architecture"
tags:
  - "composable analytics"
  - "semantic layer expressiveness"
  - "AI analytics maturity"
  - "metric catalogs"
  - "Cube Metricflow Dremio"
---

## The Definition Trap

A metric catalog tells you that "Monthly Recurring Revenue" equals `SUM(recurring_charges) WHERE subscription_status = 'active'`. That is useful. It resolves the ambiguity between gross MRR and net MRR. It gives the AI agent one correct formula to use.

But the agent's job is rarely "what is MRR." The agent's job is "why did MRR drop 12% in the West region last month, and which customer segments drove the decline?" That question requires composing multiple metrics, dimensions, filters, and time comparisons. A static catalog entry cannot answer it.

This is the limitation of pure metric catalogs. They define vocabulary but not grammar. They tell you what the words mean but not how to combine them into sentences.

Composable analytics adds the grammar. It is a semantic layer where metrics, dimensions, relationships, and aggregation rules exist as composable objects. You can reference `total_revenue` in any query, join it with `customer_region`, filter by `subscription_tier`, and compare across time periods. The semantic layer understands the relationships and generates the correct SQL.

For AI agents, the difference is material. An agent connected to a metric catalog knows what MRR means. An agent connected to a composable semantic layer can reason with MRR. It can ask follow-up questions, drill into dimensions, and combine metrics in ways the catalog author never anticipated.

## Metric Catalogs Versus Composable Semantic Layers

A 2026 buyer's guide from Strategy Mosaic identified four types of semantic layer solutions. Platform-embedded layers (Snowflake Semantic Views, Databricks Metric Views) are convenient but locked to a single warehouse. Specialized layers focus on semantic modeling but have limited federation or performance. Comprehensive independent layers provide multi-source federation, in-memory caching, AI-assisted modeling, and MCP support. And metric catalogs provide definitions without composability.

The distinction between the last two is critical for AI readiness. A metric catalog is a list of definitions. You look up a term, you get its formula. A composable semantic layer is a graph of definitions, relationships, aggregation rules, and access policies. You combine them freely within the rules of the graph.

Promethium.ai's March 2026 guide on semantic layer tools reported that organizations implementing composable semantic layers achieve 4x faster time-to-insight and reduce warehouse query costs by 30-70%. More importantly for the AI context, internal testing showed LLM accuracy improved from approximately 40% without a semantic layer to over 83% when grounded in governed semantic definitions.

The gap between 40% and 83% is the difference between an agent that guesses and an agent that knows. And the gap between a metric catalog and a composable semantic layer is the difference between a dictionary and a fluent speaker.

## Cube: API-First Composable Semantics

Cube is the leading open-source semantic layer built for composability. Its architecture uses cubes (facts) and views (joins) defined in JavaScript or YAML. Each cube declares measures, dimensions, and joins. A view combines cubes into a unified model.

Cube exposes SQL (Postgres-compatible), REST, GraphQL, and MCP endpoints. An AI agent can query semantic metrics the same way it queries any Postgres database. The semantic layer handles the translation from business terms to optimized SQL, including pre-aggregation caching that reduces warehouse load.

Brex chose Cube over the dbt Semantic Layer and LookML for building an embedded AI financial analyst. Their reasoning was instructive. They needed an API-first platform that could serve governed metrics to an AI agent running inside their application. dbt's MetricFlow required dbt Cloud and did not support pre-aggregation. LookML tied them to Looker. Cube gave them a decoupled semantic layer with caching, row-level security, and an MCP server for agent access.

Cube's 2026 positioning as an "agentic analytics platform" reflects this shift. The semantic layer is no longer just about consistent BI metrics. It is the foundation for AI agents that need to query business concepts safely.

## dbt MetricFlow: Code-First Metric Governance

dbt's MetricFlow takes a code-first approach. Metrics are defined in YAML alongside dbt models, version-controlled in Git, and deployed through dbt Cloud. The architecture defines four primitives: metrics, dimensions, entities, and measures.

MetricFlow's strength is governance through code review. Every metric change goes through the same pull request process as every model change. The lineage from raw table to transformed metric is fully visible in dbt's DAG. For teams that already use dbt as their transformation layer, MetricFlow is the natural extension.

The limitation is architectural. MetricFlow is a middleware proxy that routes queries through dbt Cloud servers. It adds latency compared to a native database semantic layer. It does not support pre-aggregation caching. And it is metric-centric rather than offering a full composable model. Some teams model in dbt and then serve through Cube to get both code-governed definitions and API-first serving.

The YAML-based metric definitions in MetricFlow and Snowflake Semantic Views share a common syntax heritage. Both use entities, measures, and dimensions. But where Snowflake stores semantic views as native database objects (no external infrastructure), MetricFlow requires dbt Cloud and generates SQL through its query engine.

## Dremio's AI Semantic Layer: Federation Plus Semantics

Dremio's AI Semantic Layer combines semantic modeling with a query engine that federates across sources. This is a different architectural choice than Cube's API-first approach or dbt's code-first approach.

The Dremio semantic layer does two things that matter for AI agents. First, it provides semantic search. Users and agents can discover data assets using natural language instead of browsing schema trees. This reduces data discovery time from days to seconds according to Dremio's benchmarks (source: HPCwire BigDataWire, 2025).

Second, the semantic layer sits on top of Dremio's query engine, which can run SQL queries against Iceberg tables on S3, relational databases, and file stores without moving data. An AI agent asks about "total revenue by region in Q3." The semantic layer resolves "total revenue" to its metric definition. The query engine pushes the computation to the source systems. The agent gets the answer without knowing that revenue data lives in Snowflake and region data lives in a Postgres table.

This federation-plus-semantics combination is rare. Most semantic layers define metrics but depend on the warehouse to execute queries. Dremio does both. The semantic catalog in Dremio (backed by Apache Polaris) and the query engine are coupled, which means metric definitions and query optimization can work together.

## Why Composability Matters for AI Agents

The fundamental reason composable analytics beats metric catalogs comes down to the way AI agents explore data.

Human analysts follow a pattern. They ask a question, get an answer, then ask a follow-up that combines the previous answer with a new dimension or metric. The process is iterative and combinatorial. Each step builds on the last.

AI agents operate the same way, but faster and with more parallel branches. A single agent conversation can explore dozens of metric-dimension combinations. A static metric catalog requires each combination to be pre-defined. A composable semantic layer allows any valid combination.

The ACL 2025 study by Ji et al. showed what happens without composable semantics. Frontier LLMs dropped from 95% accuracy on clean benchmarks to 39% on enterprise schemas with 4,000+ columns and abbreviated names. A composable semantic layer solves this by presenting the agent with a small, well-defined vocabulary of business concepts. The agent does not need to guess which of 4,000 columns represents revenue. The semantic layer tells it. And the agent can combine revenue with any dimension in the semantic model without needing a pre-defined query.

Put concretely, a metric catalog answers "What is revenue QoQ?" A composable semantic layer answers "What is revenue QoQ for enterprise customers in the West region, segmented by product category, and compared to the same quarter last year, with the option to drill into the top 10 customers driving the change?" The first question is definitional. The second is analytical. AI agents need the second.

## The Semantic Layer as the Agent's Business Vocabulary

Every AI agent needs a bounded vocabulary to operate correctly. Raw database schemas with 4,000 columns are unbounded. The agent has no way to know which columns matter for a given question. It has to guess.

A semantic layer bounds the vocabulary. It defines 30 to 200 business metrics with clear formulas, allowed dimensions, and valid join paths. The agent operates within this bounded set. When it needs a metric not in the vocabulary, it asks the data team to add it. When it uses a metric in the vocabulary, it gets the same definition every time.

This bounded vocabulary is also the governance boundary. Row-level security, column masking, and RBAC policies defined at the semantic layer apply to every agent query. An agent serving a regional sales manager cannot see national averages. An agent serving a CFO cannot expose PII. The semantic layer enforces this automatically. No custom code, no per-agent permissions, no audit gaps.

The 2026 Enterprise Semantic Layer Buyer's Guide from Strategy Mosaic reports that organizations see a 22% reduction in AI hallucinations and 28% faster AI deployment after implementing a semantic layer. These gains come directly from the bounded vocabulary. The agent spends less time guessing column meanings and more time analyzing actual data.

## AtScale: Enterprise Semantic Virtualization

AtScale takes a different approach from Cube and dbt. It provides a visual design canvas for drag-and-drop semantic modeling, with enterprise governance baked in. AtScale claims sub-second queries across billions of rows, with 80% of queries completing in under one second according to their 2026 benchmarks.

AtScale's unique feature is autonomous aggregate management. The platform monitors query patterns and automatically creates materialized aggregates for frequently accessed metric-dimension combinations. When a new query pattern emerges, AtScale builds the needed aggregate without manual intervention. For SaaS platforms with unpredictable query patterns from AI agents, this auto-tuning capability reduces warehouse costs by 30-70%.

AtScale also supports MCP for AI agent connectivity. An agent can discover metrics through AtScale's MCP server and query them through the platform's multi-source federation layer. AtScale supports Snowflake, Databricks, BigQuery, and on-premises data sources through a single semantic model.

The trade-off is complexity. AtScale is an additional infrastructure layer to deploy and manage. It is designed for enterprises with dedicated data platform teams. Small teams may find the operational overhead exceeds the benefits.

## The Composable Analytics Maturity Model

Strategy Mosaic's 2026 guide defines three levels of semantic layer maturity. They map directly to composability.

**Level 1: Basic and Fragmented.** Metrics are duplicated across BI tools. Business logic is embedded in dashboard calculations and spreadsheet formulas. AI agents cannot access governed metrics at all. This describes most organizations in 2026, and it is where the 39% ACL accuracy numbers come from.

**Level 2: Standardized.** Metrics have consistent definitions across major BI tools. A metric catalog or basic semantic layer exists. AI agents can query governed metrics through SQL or API endpoints, but composability is limited. Pre-defined metric combinations work. Ad-hoc compositions do not.

**Level 3: Comprehensive and AI-Ready.** A composable semantic layer with multi-source federation, pre-aggregation caching, AI-assisted modeling, MCP support, and active governance. AI agents can compose metrics freely within governed boundaries. The semantic layer handles the translation, optimization, and security.

Most organizations targeting Level 3 start with one platform. They deploy a composable semantic layer for their most contested KPI, prove the value in 6-8 weeks, then expand. The 2026 ROI study from UserEvidence reports an average net annual impact of $3.4M per deployment, with 551% average ROI and a 2-month payback period.

## The Bottom Line

Metric catalogs are table stakes. They resolve naming conflicts and give each metric one canonical definition. But they do not enable the kind of ad-hoc, combinatorial, multi-dimensional analysis that makes AI agents useful.

Composable analytics adds the grammar. Metrics combine with dimensions. Filters apply across sources. Time comparisons work automatically. The semantic layer becomes the agent's business vocabulary, giving it a bounded, governed, and composable set of concepts to reason with.

The difference shows up in the numbers. 40% LLM accuracy without a semantic layer. 83% with one. 22% fewer hallucination incidents. 28% faster AI deployment. $3.4M average annual impact. The metric catalog is a start. The composable semantic layer is the destination.

---

**Ready to move beyond metric catalogs?** Dremio's AI Semantic Layer combines business context, semantic search, and automatic data discovery in a single platform. Query Iceberg tables across clouds and catalogs through a governed semantic layer that AI agents can access via SQL or MCP. [Learn more at dremio.com](https://www.dremio.com).
