---
title: "Agentic Lakehouse Concurrency and Isolation"
date: "2026-06-08"
description: "How Iceberg optimistic concurrency control, partition-level isolation, and idempotency keys enable safe concurrent writes from multiple AI agents to the same lakehouse tables."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - "agentic lakehouse concurrency"
  - "Iceberg optimistic concurrency control"
  - "AI agent write conflicts"
  - "partition-level isolation"
  - "idempotency keys"
  - "lakehouse isolation contracts"
---

When a human analyst runs a query, they wait for the result before deciding the next step. When a fleet of AI agents runs against the same Iceberg table, every agent discovers, reads, reasons, and writes simultaneously. The result is a new class of concurrency problem that the lakehouse must solve at the storage layer, not just the application layer.

Apache Iceberg's optimistic concurrency control (OCC) was designed for ETL pipelines and human-driven BI tools, not for agent swarms that retry, back off, and retry again within seconds. The 2026 reality is that companies like Slack and Magnite, presenting at Iceberg Summit 2026, are running agent workloads that generate write patterns no traditional data platform expected. These workloads demand isolation contracts that go beyond table-level commits.

This article covers the mechanics of Iceberg OCC, the failure modes specific to agent concurrency, and the architectural patterns that keep multiple agents writing to the same lakehouse without data corruption or infinite retry loops.

## How Iceberg Optimistic Concurrency Control Actually Works

Iceberg's reliability model starts with snapshot isolation. Every write operation produces a new snapshot: a complete, immutable view of the table's metadata tree at a point in time. The metadata tree consists of a table metadata JSON file that points to a manifest list (an Avro file), which indexes manifest files (also Avro), which finally point to the actual data files in Parquet or ORC format. Commits atomically swap the pointer to the current table metadata file in the catalog.

The atomic swap is the critical operation. Iceberg catalogs (the REST catalog, Polaris, AWS Glue, or Hive Metastore) provide a compare-and-swap primitive for the metadata pointer. If two writers attempt to commit simultaneously, only one succeeds. The loser must retry.

The retry is not a simple replay. Iceberg structures commits as a set of assumptions and actions. When a writer retries, it re-reads the current table state and checks whether its original assumptions still hold. For an append operation, the assumption is that the files being added do not collide with files added by the concurrent commit. For a compaction operation, the assumption is that the source files being rewritten still exist in the table. If the assumptions hold, the writer re-applies its actions and commits. If they do not, the operation fails.

This design keeps retry costs low for append-only workloads. A writer that adds new data files creates a new manifest file for those files. On retry, it simply links that manifest into the new metadata tree without rewriting it. The Iceberg spec refers to this as "work reuse," and it is the primary reason append-heavy pipelines suffer few retry penalties.

The problem for agentic workloads is that agents do not only append. They update, delete, merge, and compact. Each of these operations invalidates more assumptions and makes retry more expensive.

## The Agent Concurrency Problem: Three Distinct Failure Modes

Agent workloads introduce three failure modes that traditional ETL pipelines rarely trigger.

**Failure mode 1: The thundering herd commit storm.** A monitoring agent detects an anomaly and spawns ten diagnostic sub-agents. Each sub-agent independently decides to write a diagnostic record to the same Iceberg table. All ten attempt to commit within the same 500-millisecond window. Iceberg's OCC allows one to succeed. The other nine retry. Because they are writing to different partitions (each agent is assigned a different time window), the retries succeed quickly. But the metadata churn is wasteful: nine failed commits and nine retry cycles for ten records that could have been written in a single batch.

**Failure mode 2: The partition-level tug of war.** Two pricing agents operate on the same product catalog table. Agent A reads the current snapshot, computes new prices for electronics products, and attempts to commit. Agent B does the same for home goods. They do not touch the same rows, but they are writing to the same table under the same partition tree. Iceberg's conflict detection considers the entire table state. If Agent A's commit changes metadata files that affect partition statistics, Agent B's commit may fail even though the actual data files are disjoint. This is a false conflict, and it is the most common source of retry overhead in agent workloads.

**Failure mode 3: The orphaned writer.** An agent crashes mid-commit after writing new data files to object storage but before updating the catalog pointer. The data files exist but are not referenced by any valid snapshot. In traditional ETL, a monitoring process catches these orphans during compaction. In agent workloads, the orphaned files accumulate faster because agents generate many small, independent writes.

Each failure mode has a solution, but the solutions live at different layers of the architecture.

## Partition-Level Isolation: Separating Agent Work by Physical Boundaries

The most effective strategy for reducing false conflicts is partition-level isolation. If you can assign each agent or agent class to a specific partition range, commits from different agents almost never collide.

Iceberg's hidden partitioning makes this approach practical. Because partition values are derived from column values (for example, `date(transaction_ts)` or `bucket(customer_id, 16)`), an agent writing to a specific date or bucket naturally writes to a specific partition. The partition is invisible to the agent's SQL but physically real in the metadata tree.

The practical implementation looks like this:

1. Define a partition column that maps to agent domains. For a multi-tenant analytics agent, partition by `tenant_id` or `region`. For a monitoring agent, partition by `date_hour`.
2. Configure each agent with a restricted catalog role that only allows writes to specific namespace paths.
3. Use Iceberg's `WRITE_DISTRIBUTION_MODE = hash` to ensure that data files within a partition are well-distributed and do not create hotspot files.

The results are measurable. In testing with concurrent agent workloads on AWS Glue catalogs (documented in AWS's 2025 blog post on managing concurrent write conflicts), partition-aligned writes reduced retry rates from 30 percent to under 3 percent for append-heavy workloads.

The limitation is that partition-level isolation does not help when multiple agents must write to the same partition. For that scenario, you need idempotency keys.

## Idempotency Keys: Making Retries Safe by Design

An idempotency key is a unique identifier that an agent attaches to each write operation. If the agent crashes, retries, and re-sends the same operation with the same key, the system recognizes the duplicate and does not apply it twice. This is a standard pattern in payment processing and API design, and it translates directly to Iceberg writes.

The challenge is that Iceberg does not natively support idempotency keys. The table format has no concept of a client-supplied deduplication token. You implement idempotency at the application layer by storing a deduplication log in a separate Iceberg table.

The pattern works as follows:

1. The agent generates a UUID for each write operation and includes it in the data being written (for example, as an `_idempotency_key` column).
2. The write targets a staging table or a specific partition reserved for the agent.
3. A post-commit validation step queries the deduplication log to verify that the key has not been applied before.
4. If the key exists, the later write is discarded via a merge-on-read pattern or a simple `DELETE WHERE _idempotency_key = ?` followed by a re-commit.

This approach adds latency and storage overhead. Each idempotency key consumes space in the deduplication log. For high-volume agent workloads (thousands of writes per hour), the log must be periodically compacted and pruned.

At Magnite, the advertising technology company that presented at Iceberg Summit 2026, agents writing bid optimization data use idempotency keys combined with a 24-hour deduplication window. Keys older than 24 hours are pruned during nightly compaction. This window covers the maximum expected retry duration for any agent action.

## Orchestration Patterns: Coordinating Concurrent Agent Writes

Partition isolation and idempotency keys handle the data plane. The control plane needs orchestration rules that prevent agents from fighting over the same resources.

The three orchestration patterns that work for agentic lakehouse concurrency are:

**Pattern 1: The write-ahead log (WAL) mediator.** Agents do not write directly to production Iceberg tables. Instead, they write to an append-only WAL table. A dedicated writer process reads the WAL, validates each entry, and applies it to the production table in a single, serialized commit. This converts N concurrent agent writes into N WAL appends (which rarely conflict) and one serialized merge into production. The tradeoff is increased end-to-end latency. The WAL must be polled and processed, adding seconds or minutes between agent action and visible result.

**Pattern 2: The partition scheduler.** A lightweight scheduler assigns each agent a time-bound partition slot. Agent A gets the 09:00:00 to 09:00:59 partition for writes. Agent B gets the 09:01:00 to 09:01:59 partition. Because the agents never write to the same partition, commits never conflict. This pattern works well for periodic batch agents (run hourly, write to the current hour's partition) but breaks for real-time agents that need to write immediately.

**Pattern 3: The merge-on-read collector.** Agents write independent delta files to a staging area. A background compaction job merges the deltas into the production table. Iceberg's merge-on-read capabilities (delete files in V2, deletion vectors in V3) make this pattern efficient because the deltas are small and the merge is an O(1) metadata operation. The tradeoff is read overhead: readers must resolve delete files or deletion vectors at query time, adding latency to every scan.

Slack's agent infrastructure, discussed at Iceberg Summit 2026, uses a hybrid approach. Read-heavy agents use the merge-on-read collector. Write-heavy agents use the partition scheduler. The alerting agents that detect anomalies use the WAL mediator, because correctness matters more than latency for anomaly records.

## Iceberg V3 Deletion Vectors and Their Impact on Agent Writes

Iceberg V3 introduces deletion vectors as a native metadata structure for efficient row-level updates. For agentic concurrency, deletion vectors change the retry calculus.

In Iceberg V2, an update is implemented as a delete-file plus an insert-file. If two agents update different rows in the same data file, their commits conflict because both modify the table's set of delete files. In V3, the deletion vector is a bitmap that lives in the metadata tree. Two agents that update disjoint rows produce disjoint bit regions. Theoretically, the commits should not conflict.

The practical implementation is still maturing. The Iceberg V3 spec uses a "delta" approach for deletion vectors: each commit writes a new deletion vector that is the union of the previous vector and the new deletions. Two concurrent writers that create union-based deltas still encounter conflicts if the union operation is not commutative. The Snowflake engineering team, in their Iceberg Summit 2026 recap, described this as an active area of specification work for Iceberg V4.

For now, assume that V3 deletion vectors reduce but do not eliminate write conflicts for concurrent agents. Continue to use partition isolation and idempotency keys as your primary safety mechanisms.

## Practical Implementation: A Multi-Agent Write Pipeline

Here is a concrete implementation of a multi-agent write pipeline on Iceberg, using the patterns described above.

Assume you have three agents: a pricing agent that updates product prices hourly, an inventory agent that records stock movements in real time, and a recommendation agent that writes user interaction logs continuously.

**Step 1: Table design.** Create three tables in separate catalog namespaces:

```
catalog.pricing.product_prices (partitioned by date, bucketed by product_id)
catalog.inventory.stock_movements (partitioned by date_hour)
catalog.recommendations.user_interactions (partitioned by date)
```

**Step 2: Catalog roles.** Create three catalog roles with scoped write permissions:

```
ROLE pricing_writer: TABLE_WRITE_DATA ON catalog.pricing
ROLE inventory_writer: TABLE_WRITE_DATA ON catalog.inventory
ROLE recommendation_writer: TABLE_WRITE_DATA ON catalog.recommendations
```

Each agent authenticates with a principal that is assigned exactly one role. No agent can write outside its namespace.

**Step 3: Write behavior.** Configure each agent's writer with these settings:

- `commit.retry.num-retries=5` (maximum retries before failing)
- `commit.retry.min-wait-ms=100` (initial backoff)
- `commit.retry.max-wait-ms=5000` (maximum backoff)
- `write.distribution-mode=hash` (distribute files within partitions)

**Step 4: Idempotency.** Add an `_idempotency_key` column (UUID, VARCHAR) to each table. Create a deduplication log table:

```sql
CREATE TABLE catalog.system.agent_dedup_log (
    agent_id VARCHAR,
    idempotency_key VARCHAR,
    table_name VARCHAR,
    committed_at TIMESTAMP
) PARTITIONED BY (date(committed_at));
```

After each agent commit, insert a row into the dedup log. Before applying a merge or update, query the dedup log to reject duplicate operations.

**Step 5: Monitoring.** Track the agent_write_retry_rate metric. If the rate exceeds 10 percent in a 5-minute window, investigate partition hot spots or agent scheduling conflicts.

This pipeline handles the three failure modes described earlier. The thundering herd is absorbed by partition isolation and backoff. The partition tug of war is eliminated by namespace-scoped roles. Orphaned writers are detected by the dedup log (committed entries without corresponding data files).

## Isolation Contracts as the Operating Model

The technical patterns matter, but the operating model matters more. An isolation contract is not a configuration file. It is a written agreement between the data platform team and the agent development team that specifies:

- Which tables the agent may write to.
- Which partition ranges the agent owns.
- How retries work and when they escalate to human review.
- How idempotency is enforced.
- How orphaned data is detected and cleaned.
- How the agent's access can be revoked without affecting other agents.

Atlassian, another company with agent workloads in production, publishes isolation contracts as YAML files in the same repository as the agent code. The contract is reviewed in the same pull request that introduces the agent. This tight coupling between code and contract prevents the "it worked in staging" problem that occurs when agent permissions are configured outside the deployment pipeline.

## Measuring Success: Metrics for Agent Concurrency

You cannot improve what you do not measure. For agentic lakehouse concurrency, track these five metrics:

1. **Commit success rate.** The percentage of commit attempts that succeed on the first try. Target: above 95 percent.
2. **Retry rate by agent.** The number of retries per commit, broken down by agent identity. A single agent with a high retry rate indicates a partition hot spot or a false conflict pattern.
3. **Metadata churn rate.** The number of manifest files and metadata versions created per hour. High churn indicates excessive commits. Batch writes where possible.
4. **Orphaned file count.** The number of data files in object storage that are not referenced by any valid snapshot. Scan for orphans daily during compaction.
5. **End-to-end write latency.** The time between an agent's decision to write and the write being visible to readers. This includes commit time plus any WAL or collector processing.

Dremio's query engine provides system tables that expose these metrics for Iceberg tables. The `sys.iceberg_commits` table tracks commit attempts, successes, failures, and retries. The `sys.iceberg_orphan_files` view lists unreferenced data files. Agent teams can query these tables directly to monitor their write health without platform team intervention.

## The Road Ahead: Iceberg V4 and Intent-Based Commits

The Iceberg community is actively working on improvements for concurrent write scenarios. At Iceberg Summit 2026, the V4 specification discussions included "intent-based commits": a mechanism where a writer declares its intent (which files it plans to modify, which partitions it targets) before executing the write. The catalog reserves the intent and rejects conflicting intents from other writers. This is closer to a pessimistic locking model than Iceberg's current optimistic approach.

Intent-based commits would eliminate false conflicts: if Agent A intends to modify partition 1 and Agent B intends to modify partition 2, the catalog allows both intents and accepts both commits. The tradeoff is increased catalog load (every writer must register and release intents) and the risk of deadlock if intents are not released properly.

The V4 specification is expected to go through several review rounds before finalization. For current production workloads, partition isolation and idempotency keys remain the reliable approach.

## Summary

Agentic lakehouse concurrency requires more than Iceberg's built-in OCC. The three failure modes (thundering herd, partition tug of war, orphaned writers) demand partition-level isolation, idempotency keys, and orchestration patterns that match the agent's operational profile.

Start with namespace-scoped catalog roles that restrict each agent to its own tables and partitions. Add idempotency keys to make retries safe. Choose an orchestration pattern (WAL mediator, partition scheduler, or merge-on-read collector) based on your latency and correctness requirements. Measure commit success rates, retry patterns, and orphaned file counts. Write your isolation contracts as code and review them alongside agent deployments.

The platforms that get this right will be the ones where agents write reliably to the same tables without human babysitting. That is the production standard for the agentic lakehouse, and it is achievable with today's Iceberg features.

For a hands-on evaluation of these concurrency patterns, Dremio's Agentic Lakehouse platform provides built-in support for partition-level access control, credential vending, and the system tables needed to monitor agent write health. Start a free trial at [dremio.com/get-started](https://www.dremio.com/get-started) or explore the open-source Dremio MCP server at [github.com/dremio/dremio-mcp](https://github.com/dremio/dremio-mcp).

*Sources: Apache Iceberg Reliability Documentation (iceberg.apache.org), AWS Blog on Concurrent Write Conflicts in Iceberg (aws.amazon.com), Iceberg Summit 2026 presentations from Slack and Magnite, Snowflake Iceberg Summit 2026 Recap (snowflake.com), Iceberg V3 Specification.*
