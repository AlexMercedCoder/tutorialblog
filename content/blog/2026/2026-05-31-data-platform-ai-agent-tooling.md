---
title: "Data Platform Native AI Agent Tooling in 2026"
date: "2026-05-31"
description: "A comprehensive comparison of AI agent tooling across Dremio, Snowflake, Databricks, Microsoft Fabric, AWS, Google Cloud, ClickHouse, VeloDB, SpiceAI, Bauplan, and Qlik."
author: "Alex Merced"
category: "Data Engineering"
tags:
  - AI Agents
  - Data Platforms
  - MCP
  - Agentic Analytics
  - Data Engineering
---

# Data Platform Native AI Agent Tooling in 2026

<!-- Meta Description: A comprehensive comparison of AI agent tooling across Dremio, Snowflake, Databricks, Microsoft Fabric, AWS, Google Cloud, ClickHouse, VeloDB, SpiceAI, Bauplan, and Qlik in 2026. -->
<!-- Primary Keyword: Data platform AI agent tooling -->
<!-- Secondary Keywords: agentic analytics, data platform agents, MCP server data, lakehouse AI agents -->

Every data platform vendor now offers some form of AI agent tooling. The approaches vary widely, from full agent authoring frameworks to MCP server endpoints to semantic layers designed for agent consumption. This article walks through eleven platforms and what each one offers for building, deploying, and running AI agents on your data.

The common thread across all of them is the Model Context Protocol, or MCP. Anthropic released MCP in late 2024 as an open standard for connecting AI models to external tools and data sources. By mid-2026, nearly every major data platform ships an MCP server. MCP has become the default bridge between AI agents and enterprise data, replacing a patchwork of vendor-specific APIs.

Here is how each platform approaches native AI agent tooling.

## Dremio

Dremio took an early lead on agentic data access by shipping three integration paths in parallel.

The first path is the built-in AI agent inside the Dremio console. You click a button and get a conversational interface that can discover data, generate visualizations, debug slow queries, and share insights. No setup, no configuration. The agent runs against Dremio's semantic layer, which means every query respects existing user permissions. Users see only the data they are authorized to access.

The second path is the MCP server. Any MCP-compatible agent, including Claude Desktop, ChatGPT, or Gemini, connects to your Dremio lakehouse in minutes through a standardized endpoint. The MCP server exposes Dremio's full catalog, query engine, and semantic layer as tools that agents can discover and call. This is the path for business users and knowledge workers who work through chat-style interfaces.

The third path is the Dremio CLI. It gives programmatic control to AI coding agents like Claude Code, Codex, or Cursor. The CLI is self-describing, meaning agents can discover Dremio's full capabilities and compose them into workflows. Use cases include automated data ingestion, table creation, schema transformations, query diagnosis, and end-to-end pipeline automation. The CLI installs via pipx, uv, or npm.

Dremio also published its Agentic Lakehouse Architecture framework, which defines four technical layers for agent-ready data platforms: object storage, the Iceberg table format, the Polaris catalog for access control, and the query engine layer. The framework is useful for any team designing a data platform where AI agents are primary consumers.

## Snowflake

Snowflake delivers agentic AI through two products: Cortex Agents and Snowflake Intelligence.

Cortex Agents are Snowflake's framework for building AI agents that operate on your Snowflake data. A Cortex Agent combines Cortex Analyst for text-to-SQL, Cortex Search for hybrid search over unstructured data, and user-defined functions as callable tools. The agent uses a planner that breaks down complex questions into subtasks, executes them against Snowflake's compute layer, and reflects on results before responding.

Snowflake Intelligence sits one level above Cortex Agents. It is the entry point for business users. You ask questions in natural language, and Intelligence routes them to the appropriate Cortex Agent or Cortex Search service. Intelligence also connects to external services through Snowflake's managed MCP server, which exposes Snowflake objects as tools that external agents can discover and call.

The managed MCP server supports any MCP-compatible client. Snowflake also demonstrated multi-agent orchestration patterns that combine Snowflake Cortex with Microsoft AI Foundry agents, using MCP as the cross-platform bridge.

Cortex Code, released in early 2026, extends agentic capabilities to coding workflows. It is an AI coding agent that works with local files and Snowflake data together, understanding context from both sides.

## Databricks

Databricks built its agent tooling around Mosaic AI, which now includes a full agent development lifecycle.

The starting point is the AI Playground, a no-code interface for prototyping and testing LLMs and agents with prompt engineering and parameter tuning. From there, you can build Knowledge Assistants for domain-specific Q&A chatbots that use Unity Catalog for data discovery and governance.

For more complex scenarios, Databricks offers Agent Bricks. These are pre-built agent patterns including a Supervisor Agent that orchestrates multiple sub-agents, Genie Spaces, Unity Catalog functions, MCP servers, and custom Python agents. The Supervisor Agent is effectively a multi-agent orchestrator running inside Databricks.

Custom agents are built with Python using the Databricks Agent Framework. The framework supports tool calling, RAG with Vector Search, and multi-agent coordination. Agents are deployed on scalable inference endpoints with built-in monitoring through MLflow Tracing.

Databricks also supports MCP natively. You can register MCP servers as tools in Unity Catalog, and agents discover them through the catalog. This means your agent can call internal MCP servers alongside Databricks-native tools using a single discovery mechanism.

The Unity AI Gateway provides governance across the entire stack, with usage tracking, payload logging, and security controls for LLMs and agents.

## Microsoft Fabric

Microsoft's approach to data AI agents runs through two channels: Copilot in Fabric and Fabric Data Agents.

Copilot in Fabric is integrated into every Fabric workload. In notebooks, it generates, refactors, and validates code with awareness of workspace context, schemas, and runtime state. In the data warehouse, it converts natural language to SQL and suggests completions. In Power BI, it builds reports from a topic description and writes DAX queries. In Real-Time Intelligence, it generates KQL queries for log and event data.

Fabric Data Agents are a separate, more powerful capability released in late 2025. These are agents that operate on Fabric data with access to structured and unstructured content. They integrate with Microsoft 365 Copilot, so an agent working in Fabric can surface insights inside Teams or Outlook.

Microsoft also provides a managed MCP server endpoint for Fabric. This lets third-party AI assistants query Fabric data through a standardized interface. At Ignite 2025, Microsoft demonstrated Fabric agents that use ontology models to understand business context and relationships across data sources.

The deeper play is Azure AI Foundry. Foundry lets you build custom agents that orchestrate across Fabric, Azure OpenAI, AI Search, and external MCP servers. Snowflake and Microsoft jointly published a reference architecture for multi-agent orchestration using Cortex MCP with AI Foundry, showing how the platforms interoperate.

## AWS

AWS centers its agent tooling on Amazon Bedrock, which has evolved significantly through 2025 and 2026.

Amazon Bedrock Agents let you build generative AI applications that automate multi-step tasks. An agent receives a natural language request, breaks it into steps, calls the appropriate tools or APIs, and returns a result. Tools can be Lambda functions, data sources indexed by Knowledge Bases, or external APIs.

The major 2026 addition is AgentCore. AgentCore is a platform layer for building, connecting, and optimizing AI agents. It is framework-agnostic, meaning you can deploy agents built with any framework and any model. AgentCore handles identity, access control, observability, and cost tracking across all your agents.

AWS also announced Quick, a new AI assistant targeted at business users that works across AWS services. Quick joins Bedrock in providing both a managed AI assistant experience and a builder framework.

At What's Next 2026, AWS pushed hard on vertical agents for healthcare, financial services, and supply chain. These are pre-built agent templates with domain-specific tools and knowledge bases, deployed through Bedrock.

For data access, AWS provides MCP server implementations for S3, Glue, Athena, and Redshift. Agents discover these through the Bedrock tool registry and call them during execution.

## Google Cloud

Google Cloud's agent story runs through Gemini Enterprise Agent Platform, the rebranded and expanded version of Vertex AI Agent Builder.

The platform provides a no-code agent builder, a code-based agent SDK, and a tool governance system. You define agent behavior, connect tools, and deploy on Google's infrastructure. Tools include BigQuery, Discovery Engine for enterprise search, and third-party APIs registered through the Cloud API Registry.

Vertex AI Agent Builder was originally focused on customer service and search agents. In 2026, Google expanded it to cover data analytics agents that can query BigQuery, Looker, and Spanner. These agents use Gemini's native SQL generation capabilities and can chain multiple queries to answer complex analytical questions.

The Cloud API Registry is the tool governance layer. It lets platform teams register, version, and manage APIs that agents can call. This addresses the operational problem of agent tool sprawl, where agents accumulate dozens of undocumented tool dependencies.

Google also ships an MCP server for BigQuery. It exposes BigQuery's full SQL interface, table metadata, and job management as MCP tools. Combined with Gemini's long-context window, this creates a usable pattern for analytical agents that iterate on SQL queries based on results.

For security, Google enforces access controls through its IAM system. Agent tool calls respect the same permissions as direct user calls.

## ClickHouse

ClickHouse took a pragmatic approach. Rather than building a proprietary agent framework, it shipped an open-source MCP server and a comprehensive set of integration guides.

The ClickHouse MCP server, mcp-clickhouse, exposes three core tools: run_select_query, list_databases, and list_tables. These are intentionally few. ClickHouse's philosophy is that agents should interact with the database through SQL, not through a layer of abstraction. The MCP server gives agents schema discovery and query execution, and the agents decide what to do with that capability.

ClickHouse published integration guides for 17 different AI agent frameworks, including LangChain, LlamaIndex, CrewAI, DSPy, OpenAI Agents, Microsoft Agent Framework, PydanticAI, and Chainlit. Each guide shows how to connect the framework to ClickHouse through MCP. This breadth of coverage reflects ClickHouse's position as an infrastructure layer that teams access through whatever agent framework they prefer.

The ClickHouse Agent Skills repository provides packaged instructions for AI coding agents. These are markdown files that extend Claude Code, Cursor, and Copilot with ClickHouse domain knowledge covering schema design, query optimization, and data ingestion patterns.

In ClickHouse Cloud, the remote MCP server is managed by ClickHouse. You do not need to host it yourself. Cloud customers connect their agents directly.

## VeloDB and Apache Doris

VeloDB, the managed cloud platform powered by Apache Doris, positions itself as the analytics database for the agentic AI era.

Doris provides the Apache Doris MCP Server, built with Python and FastAPI. The MCP server supports three transport modes: Server-Sent Events for real-time bidirectional communication, Streamable HTTP for large streaming queries, and Stdio for low-latency IDE integration with tools like Cursor.

The Doris MCP server exposes tools including exec_query for core SQL execution, get_table_schema and get_table_column_comments for metadata discovery, and get_recent_audit_logs for compliance. The server includes smart connection pooling, automatic SQL safety checks, intelligent LIMIT enforcement, and query timeout controls.

Doris also supports vector search through native ANN vector indexes. This enables hybrid search patterns where agents combine structured SQL filters with semantic similarity. Doris has LLM SQL functions for summarization, sentiment analysis, classification, and entity extraction, all callable from standard SQL.

The Doris multi-catalog feature lets agents query data across MySQL, PostgreSQL, Iceberg, Hive, and S3 through a single MCP endpoint. This federated query capability is important for agents that need to reason across data silos without moving data.

VeloDB's AI observability story is also strong. The same engine that serves agent queries can ingest and analyze agent logs, traces, and performance metrics. Teams use Doris as the backend for agent monitoring dashboards.

## Spice AI

Spice AI takes a different approach from the large cloud vendors. Spice is an open-source SQL query and hybrid search engine, written in Rust, designed specifically as a data sidecar for AI applications and agents.

Spice runs as a local or containerized process next to your agent. It connects to your data sources, accelerates queries through caching and materialization, and exposes a SQL interface plus vector search. The key design decision is that Spice sits close to the agent, not in the cloud. This gives sub-millisecond query latencies and offline capability.

Spice provides its own MCP server, making it discoverable by any MCP-compatible agent. It also acts as a federated MCP client, meaning it can connect to external MCP servers and expose their tools to your agent through a single interface. This is useful when your agent needs data from multiple sources that each provide their own MCP server.

The hybrid search capability combines SQL filtering with full-text search and vector similarity. Agents can ask questions that require both structured conditions and semantic matching in a single query.

Spice AI's data acceleration layer caches query results and pre-computes aggregations. For agent workloads with repeated access patterns, this avoids hitting the source database for every query. Spice detects access patterns and optimizes the cache automatically.

## Bauplan Labs

Bauplan is the most unusual entry on this list. It does not provide an AI agent. It provides infrastructure where AI agents build data pipelines safely.

The core concept is Git for data. Bauplan gives you isolated branches of your Iceberg tables, each with its own commit history. An AI coding agent like Claude Code creates a branch, runs Python or SQL pipelines against it, verifies the results, and merges back to main. If something goes wrong, you roll back or branch from a historical commit.

Bauplan Skills are the mechanism that makes this work. A Skill is a markdown file that describes a workflow: ingestion, data quality checks, pipeline creation, or debugging. When Claude Code starts in a Bauplan repo, it discovers the Skills and loads them as instructions. The Skills tell the agent how to interact with Bauplan's branch-based environment safely.

The five core Skills are data assessment, safe ingestion with audit checks, data pipeline scaffolding, data quality checks with anomaly detection, and debug and fix pipeline. Each Skill enforces the branch-run-verify-merge loop.

Bauplan's approach addresses a real problem. Coding agents are good at writing code. But data work is different from code work. Data is shared, does not have Git semantics, and downstream systems depend on it. Bauplan gives agents the safety rails to work on production data without breaking things.

## Qlik

Qlik entered the agent space with a focus on the analytics workflow from discovery through action.

Qlik Answers is the entry point. It combines structured analytics with unstructured content to provide contextual answers with follow-up reasoning. Below Answers sits the Semantic Layer, a shared set of business definitions that ensures consistent meaning across Qlik Answers, apps, and third-party assistants.

Qlik ships four specialized agents. The Discovery Agent monitors key data areas and surfaces anomalies and changes. The Predict Agent builds ML models, generates predictions, and interprets results for forward-looking questions. The Automate Agent triggers workflows in downstream systems through natural language. The Analytics Agent supports analytics development tasks.

Qlik also provides an MCP server that exposes its analytics capabilities to third-party AI assistants. This lets existing assistants use Qlik's calculations and data models without migrating to Qlik's native interface.

The flow Qlik promotes is detect, investigate, predict, act. Data changes trigger the Discovery Agent, which passes signals to the Predict and Automate agents for action. This is a full agentic analytics pipeline inside a BI platform.

## How to Choose

The platforms break into three rough categories.

First are the full agent authoring platforms. Databricks with Mosaic AI, Snowflake with Cortex Agents, and AWS with Bedrock AgentCore let you build, deploy, and monitor custom agents that weave together data access and external tool calls. These are for teams that need to ship production agents with governance and observability out of the box.

Second are the data access layer platforms. Dremio, Spice AI, ClickHouse, and VeloDB focus on making their query engines agent-accessible. They ship MCP servers and CLIs that let any agent discover and query data. These are for teams that already have an agent framework and need a reliable data connection layer.

Third are the workflow and analytics platforms. Microsoft Fabric, Qlik, Bauplan, and Google Cloud occupy different parts of this space. Fabric and Qlik embed agents into existing analytics workflows. Google provides agent tooling alongside BigQuery. Bauplan provides safety infrastructure for agent-driven data engineering.

Most teams will end up using platforms from multiple categories. A typical stack in 2026 might be Databricks for agent authoring, Dremio or Spice for multi-source data access, and Qlik for the analytics front end. The interoperability through MCP makes this practical in a way it was not two years ago.

## Tradeoffs and Limitations

Agentic data tooling is still immature in several areas.

Cost control is the biggest open problem. Agent queries are not like dashboard queries. An agent can issue dozens of exploratory queries before arriving at an answer, and each one consumes compute. Few platforms offer budget-aware query routing or cost caps on agent sessions.

Evaluation is another gap. Databricks and Snowflake provide basic agent evaluation through MLflow and Cortex tracing respectively. But there is no standard way to measure whether an agent answered a data question correctly. Most teams rely on manual spot checks.

Data quality is a hidden risk. An agent is only as good as the data it finds. If the catalog is poorly named, the schema is undocumented, or the data has known quality issues, the agent will produce confident but wrong answers. Semantic layers and data contracts help, but most organizations have not invested in these yet.

MCP interoperability is not as seamless as the marketing suggests. Every MCP server implements the protocol slightly differently. Tool naming conventions vary. Authentication models differ. A LangChain agent that works with ClickHouse MCP out of the box may need custom wiring for Dremio MCP. The protocol standardizes the transport, not the semantics.

Security models vary by implementation. Snowflake and Dremio enforce data access through their existing permission systems. Databricks uses Unity Catalog for governance. But not all MCP servers implement credential vending or scoped access. If you expose an unrestricted MCP endpoint, an agent can query anything it can reach.

## Conclusion

Data platform native AI agent tooling in 2026 means MCP servers, semantic layers, and agent authoring frameworks that understand data. The separation between data platforms and AI platforms is dissolving. If you are designing a data architecture today, you should assume that a significant fraction of queries in the next two years will come from AI agents, not human analysts.

Start with MCP compatibility as a baseline requirement for any data tool you evaluate. Then decide whether you need a full agent authoring platform or a data access layer for your existing agent framework. The right answer depends on how much control you need over agent behavior and how much you already have invested in your agent stack.

If you want to go deeper on these patterns and architectures, Alex Merced has written extensively on data platforms, AI agents, and modern data architecture. You can find his books at books.alexmerced.com.
