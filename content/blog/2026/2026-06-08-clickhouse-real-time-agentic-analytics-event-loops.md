---
title: "Real-Time Agentic Analytics with ClickHouse"
date: "2026-06-08"
description: "ClickHouse has become the leading real-time analytics engine for AI agent workloads, with event-loop architectures that let agents query and act at sub-second speeds."
author: "Alex Merced"
category: "Data Platforms"
tags:
  - "real-time agentic analytics"
  - "ClickHouse AI agents"
  - "event-driven analytics"
  - "agent-facing analytics"
  - "streaming ingestion"
  - "Iceberg query engine"
---

## The Agent Query Wave

In February 2025, a ClickHouse engineer noticed something strange in the production metrics. Query volume had spiked 10x in under an hour. The first assumption was a DDoS attack. The actual cause was simpler. The company had deployed a fleet of autonomous AI agents that were monitoring and optimizing business metrics. The agents were running dozens of exploratory queries per second, each one probing a different slice of the data.

This story, recounted in the ClickHouse blog post "Agent-Facing Analytics" (Ryadh Dahimene, February 2025), captures the paradigm shift. AI agents are not human users. They do not open a BI dashboard, look at a chart, and move on. They run in sense-think-act loops. Sense the data. Think about what it means. Act on the conclusion. Then sense again.

Each loop can generate 5 to 20 SQL queries. An agent monitoring customer churn might query active subscriptions, then segment by region, then check historical trends, then correlate with support tickets, then calculate a retention offer budget. All within seconds. All without a human looking at intermediate results.

ClickHouse at Open House 2026 announced $250M+ ARR (more than triple a year ago), 4,000 total customers, and the ClickHouse Agents service powered by Anthropic's Claude (source: HPCwire AIwire, May 2026). The company has positioned itself as the real-time analytics engine for AI workloads, and the numbers suggest the market agrees.

## Why Real-Time Analytics Databases Fit AI Agents

Four properties make real-time analytics databases the natural query layer for AI agents.

**Near real-time data ingestion.** Agents need current data. An agent that calculates inventory reorder points using yesterday's data will either overstock or stock out. ClickHouse ingests at millions of rows per second through Kafka integrations, S3 queues, and ClickPipes. Data landing in the last second is available for queries.

**Complex aggregations at speed.** Agents do not just fetch rows. They compute ratios, running totals, percentiles, and anomaly scores. ClickHouse's columnar engine and vectorized execution mean aggregate queries on billions of rows return in milliseconds to seconds. An agent checking whether current sales deviate from the 30-day rolling average gets the answer before the user's next breath.

**High concurrency for exploratory workloads.** A single agent conversation can trigger dozens of queries. A hundred concurrent agents mean thousands of queries per second. ClickHouse handles this through its merge-tree architecture and connection pooling. The ClickHouse Agents service at Open House 2026 specifically targets this pattern with a no-code agent builder, sandboxed code interpreter, and native MCP support.

**A unified data sink.** Agents need context from multiple sources. ClickHouse can ingest from Kafka, query Iceberg tables in place via the Iceberg table engine, join with PostgreSQL data through dictionaries, and expose everything through a single SQL endpoint. The agent talks to one system. ClickHouse handles the federation.

## The Event Loop Architecture for Agentic Analytics

The ReAct pattern (sense-think-act) maps naturally to a query-session-compute loop when the analytics database is the environment.

In the sense phase, the agent queries a snapshot of current state. ClickHouse's `icebergS3Cluster` function can scan 95 billion rows across a 3-node cluster in 907 seconds, or about 105 million rows per second (source: ClickHouse blog, "Climbing the Iceberg with ClickHouse", February 2025). For smaller datasets that fit in ClickHouse's native MergeTree, response times drop to single-digit milliseconds.

In the think phase, the agent processes the results. This step runs in the LLM or reasoning model, not in the database. But the database shapes what the agent can think about. If the database exposes semantic metrics through a view layer, the agent reasons about business concepts. If the database only exposes raw column names, the agent guesses.

In the act phase, the agent may write results back to the database or trigger an external action. ClickHouse v25.7+ supports INSERT INTO existing Iceberg tables. v25.9 adds ALTER UPDATE and distributed writes. An agent can create a table of recommended actions, then a downstream system picks up the recommendation.

The ClickHouse MCP server, released November 2024 and maintained by ClickHouse, exposes this loop through three tools: `list_databases`, `list_tables`, and `run_select_query`. A demo with Claude Sonnet 3.5 against ClickHouse Cloud public playground showed the pattern. First prompt: the agent explored datasets by listing tables and sampling rows. Second prompt: "Which tech stocks were hit worst by the dot-com bubble?" The agent deduced the methodology, metric, and time range without explicit instructions. It generated 10 SQL queries in seconds.

This is the event loop in action. Sense (list tables, sample data). Think (deduce methodology). Act (run analytical query). Sense again (refine time range). The agent completes multiple loops before presenting a single answer.

## ClickHouse as an Iceberg Query Engine

ClickHouse's Iceberg integration matured significantly between 2024 and 2026. Three mechanisms now exist.

The **Iceberg table engine** creates a persistent table definition pointing to an existing Iceberg table. It supports schema evolution, partition pruning, time travel (since v25.4), and write operations (INSERT since v25.7, ALTER DELETE since v25.8, ALTER UPDATE since v25.9). The `IcebergS3Cluster` variant distributes query processing across cluster nodes with near-linear scaling.

The **Iceberg table function** enables ad-hoc queries without persistent definitions. `icebergS3('s3://bucket/path/')` returns a ClickHouse table you can query directly. The `icebergS3Cluster` variant distributes across nodes. ClickHouse docs recommend the table function for most read-only use cases.

The **DataLakeCatalog database engine** auto-discovers all tables from external catalogs. Point it at a Polaris, Glue, or Unity Catalog endpoint and ClickHouse lists every Iceberg table in that catalog. No manual table definitions needed. The engine auto-detects Iceberg versus Delta Lake tables and routes queries accordingly.

These three mechanisms create a spectrum. Ad-hoc queries use table functions. Frequent queries on specific tables use the table engine. Full catalog exploration uses DataLakeCatalog.

Performance varies by pattern. Ad-hoc queries run at 2-3x slower than native MergeTree (seconds instead of milliseconds). The gap is shrinking with improved Parquet reader performance. For high-concurrency dashboard workloads, the hot/cold pattern works best: recent data stays in native MergeTree for speed, older data lives in Iceberg on S3 for cost efficiency.

A common production architecture uses a UNION ALL view to span both tiers:

```sql
CREATE VIEW unified_events AS
SELECT * FROM events_hot WHERE event_date >= today() - 7
UNION ALL
SELECT * FROM icebergS3('s3://lake/events/') WHERE event_date < today() - 7;
```

## Streaming Ingestion Patterns for AI Agents

Agents operating in real time need streaming ingestion. ClickHouse supports multiple patterns.

**ClickPipes** is the managed ingestion service. It connects to Kafka, Confluent Cloud, Amazon MSK, and Redpanda. Data flows from source to ClickHouse table with exactly-once semantics. ClickPipes for Iceberg CDC was on the 2025 roadmap, enabling direct CDC from Iceberg tables into ClickHouse without intermediate Kafka topics.

**s3Queue** provides incremental loading from S3 with exactly-once semantics. Applications write data to S3, ClickHouse polls the bucket, and new files get ingested automatically. This pattern supports append-only tables well. UPDATE and DELETE support in Iceberg CDC is planned.

**Kafka engine tables** connect ClickHouse directly to Kafka topics. Each row in the Kafka topic becomes a row in the ClickHouse table. The engine supports Avro, JSON, Protobuf, and other formats. Agents can query the Kafka-backed table in real time.

The key architectural decision is whether data flows through ClickHouse as a hot layer with Iceberg as a cold archive, or whether ClickHouse queries Iceberg directly. Most production deployments use the hot/cold pattern. Netflix, for example, processes 5 PB of logs per day at 10.6 million events per second through ClickHouse for real-time queries, with Iceberg providing long-term storage.

## ClickHouse Versus Dremio for Different Workload Patterns

ClickHouse and Dremio both query Iceberg tables, but they target different workload patterns.

ClickHouse excels at high-throughput ingest and sub-second analytical queries on structured data. Its columnar engine is optimized for single-table aggregates with filter predicates. The MergeTree engine family provides native performance that handily beats Iceberg table functions. If your workload is "ingest millions of events per second and query them in real time," ClickHouse wins.

Dremio excels at multi-source federation and semantic layer queries. Its query engine optimizes across Iceberg tables, relational databases, and file stores without moving data. The built-in semantic layer means analysts and AI agents query business metrics instead of raw column names. If your workload is "query Iceberg tables across multiple catalogs and expose governed metrics to AI agents," Dremio wins.

The two systems are complementary. A common architecture uses ClickHouse for the real-time ingestion and hot query tier, Iceberg for the open storage tier, and Dremio for the federation and semantic layer tier. Each system does what it does best.

CostBench, launched by ClickHouse at Open House 2026, provides an open reproducible benchmark for comparing cost-per-query across ClickHouse Cloud, Snowflake, Databricks, BigQuery, and Redshift. ClickHouse claims to be the only system in the "Fast and Low-Cost" zone across datasets of varying scale, with the nearest competitor at 23x worse on cost-performance (source: HPCwire, May 2026).

## When to Use Specialized Engines Versus Federated Query

The debate between specialized engines and federated query is not settled by one right answer. It depends on query pattern, data volume, and latency requirements.

**Use a specialized engine** (ClickHouse native MergeTree) when queries need sub-second response times on frequently accessed data. Dashboards, monitoring alerts, and real-time agent decisions need native performance. The hot/cold pattern with data movement is the right trade-off.

**Use federated query** (ClickHouse Iceberg table functions or Dremio federation) when data lives in open formats and you prioritize zero-copy access over raw speed. Data exploration, cross-system joins, and occasional analytical queries run acceptably at second-level response times.

**Use both** when your architecture has clear hot and cold tiers. Keep the last 7-30 days in native ClickHouse for speed. Archive older data to Iceberg on S3 for cost. Query cold data through Iceberg table functions when needed. This pattern delivers the best balance of performance and cost for most production workloads.

## The Bottom Line

ClickHouse has become the real-time analytics engine for the agentic era. Its $250M ARR, 4,000 customers, and Open House 2026 announcements confirm the market trajectory. The event loop architecture of AI agents maps naturally to ClickHouse's query model, and the Iceberg integration means data does not have to move to be analyzed.

The key architectural decision is whether agents query native MergeTree tables for speed or Iceberg tables for openness. The answer depends on the workload. But the pattern is clear. Agents query. ClickHouse answers. The loop repeats. And the gap between data ingestion and data action shrinks to milliseconds.

## Practical Architecture: ClickHouse Agents in Production

The ClickHouse Agents service, announced at Open House 2026 and powered by Anthropic's Claude, is the most concrete expression of the agentic analytics vision. It provides a no-code agent builder, a sandboxed code interpreter, shareable artifacts, skills management, memory, and multi-agent workflows. The service connects natively to ClickHouse Cloud and supports MCP-compatible third-party connections.

A production architecture using ClickHouse Agents might look like this. An agent monitors customer churn signals. It queries real-time subscription data from a ClickHouse MergeTree table. It correlates with historical churn patterns stored in an Iceberg table on S3, accessed through the Iceberg table function. It cross-references support ticket sentiment from a Kafka-backed table. When the churn probability exceeds a threshold, the agent writes a recommendation to an output table and triggers a Slack notification through a webhook.

The entire loop runs without human intervention. The agent senses, thinks, and acts within seconds. If the churn pattern changes, the agent adapts because its next query will return different data.

This is the practical difference between agentic analytics and traditional business intelligence. BI dashboards show what happened yesterday. Agentic analytics triggers actions on what is happening now. The database is not just a reporting tool. It is the agent's environment for continuous decision-making.

---

**Ready to build agentic analytics on your Iceberg lakehouse?** Dremio combines Apache Iceberg-native storage with a semantic layer that makes your data AI-ready. Query Iceberg tables across clouds and catalogs without moving data, and expose governed business metrics to any AI agent through SQL or MCP. [Learn more at dremio.com](https://www.dremio.com).
