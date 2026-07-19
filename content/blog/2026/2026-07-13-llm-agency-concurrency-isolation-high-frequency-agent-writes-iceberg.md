---
title: "Iceberg Concurrency for AI Agent Writes"
date: "2026-07-13"
description: "An in-depth exploration of iceberg concurrency for ai agent writes"
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Concurrency
  - AI Agents
  - Data Engineering
canonical: "https://iceberglakehouse.com/posts/llm-agency-concurrency-isolation-high-frequency-agent-writes-iceberg/"
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/llm-agency-concurrency-isolation-high-frequency-agent-writes-iceberg/).

A single autonomous agent can attempt more table commits in an hour than a team of analysts produces in a week. Multiply that by a fleet of agents running remediation loops, annotation passes, feature backfills, and audit logging, and you get a write pattern that looks nothing like the batch jobs Apache Iceberg was first tuned for. The table format still holds. Iceberg's transactional guarantees are real. But the operational assumptions behind "a handful of well-behaved writers" fall apart when the writers are software that never sleeps and rarely coordinates with each other.

This post walks through why agentic write workloads stress lakehouse tables, how Iceberg's optimistic concurrency control actually behaves under contention, and the patterns that keep a table healthy: partition-level isolation, server-side commit queues, and ingestion gateways built around idempotency. The short version is that agents should almost never write directly to raw tables. They should write through a controlled path that batches, sequences, and validates their commits.

## Why Agent Writes Stress Lakehouse Tables

Human-driven analytics tends to produce writes in bursts that follow a schedule. An hourly ETL job appends. A nightly job rewrites partitions. A data engineer runs a backfill. These are large, infrequent, and often coordinated by an orchestrator that knows what else is running.

Agent writes break every one of those assumptions.

First, agents write small and write often. An agent that annotates records, updates a feature value, or logs an action tends to touch a few rows at a time and commit immediately so the next step in its reasoning loop can read fresh state. Each of those commits creates a new metadata file, a new snapshot, and frequently a new small data file. Iceberg tracks table state through a chain of metadata files and manifests, and every commit extends that chain. Hundreds of tiny commits per minute produce metadata churn that slows down planning for every reader, not just the writers.

Second, agents overlap. When a fleet of agents works the same domain, they naturally gravitate toward the same hot tables and, worse, the same hot partitions. Consider a customer support system where dozens of agents update a `case_status` table. If those updates land in the same partition, the agents are effectively competing to commit against the same slice of table state. That competition is where retries come from.

Third, agents retry aggressively and without backoff awareness unless you build it in. A naive agent tool that gets a commit conflict will often just try again immediately, which increases contention rather than relieving it. Under enough load this becomes a retry storm: agents failing, retrying, colliding again, and burning compute while the table makes little forward progress.

Fourth, agents mix write intents. The same fleet might append immutable audit events, update mutable state rows, and rewrite derived tables. Those three patterns have completely different concurrency profiles, and treating them uniformly means the append-only workload inherits the conflict risk of the mutable one.

The result is a workload characterized by high commit frequency, spatial concentration on hot partitions, poor coordination, and heterogeneous intent. Iceberg can serve this workload, but only if you shape it before it reaches the table.

It helps to put rough numbers on this. Imagine fifty agents, each producing one small write every two seconds during active work. That is twenty-five writes per second aimed at a single logical table. If each of those becomes its own commit, you are asking Iceberg to produce twenty-five new snapshots per second, each with its own metadata file and at least one small data file. Within an hour you have tens of thousands of snapshots and a comparable count of tiny files. Every reader that plans a scan against that table now has to reason over a large manifest set, and every writer that reads the base state before committing pays to load that growing metadata. The workload is self-worsening: the more the agents write, the more expensive each subsequent write and read becomes. This is why the answer is never "make Iceberg commit faster." The answer is to reduce the number of commits, which is a design problem, not a tuning problem.

## How Iceberg Optimistic Concurrency Works

Iceberg uses optimistic concurrency control, which is worth understanding precisely because the failure modes under agent load follow directly from how OCC commits.

A writer begins by reading the current table metadata to establish a base state: the current snapshot, the schema, the partition spec, and the set of data files that make up the table. The writer then plans its operation against that base. It figures out which files to add, which to delete, and what the new snapshot should look like. All of this happens without holding a lock.

The commit itself is the atomic step. The writer attempts to swap the table's current metadata pointer from the base version it read to the new version it computed. This swap is conditional. It only succeeds if the table is still at the base version the writer started from. If another writer committed in between, the table has moved on, and the conditional swap fails.

At that point Iceberg does not silently overwrite the other writer's work. The failed writer must re-read the new current state and decide whether its operation is still valid. For an append that adds new files to a new partition, the answer is usually yes: appends are commutative, so the writer can rebase and retry cheaply. For an operation that deletes or overwrites files that another writer already changed, the answer may be no, and the operation genuinely conflicts. The Apache Iceberg [reliability documentation](https://iceberg.apache.org/docs/latest/reliability/) describes these guarantees, and the [Iceberg spec](https://iceberg.apache.org/spec/) defines the metadata structures that make the atomic swap possible.

Two consequences matter for agents.

The retry cost is not free. Every retry re-reads metadata and re-plans. When metadata is large, because thousands of tiny commits have bloated it, each retry gets more expensive. So high commit frequency raises both the probability of conflict and the cost of each retry, which is a bad combination.

Conflict probability scales with overlap, not just volume. Two agents appending to disjoint partitions rarely conflict even at high volume, because their commits do not invalidate each other. Two agents overwriting rows in the same partition conflict constantly. This is the single most important lever you control, and it is the reason partition design is the first defense.

It is worth being precise about which operations conflict and which do not, because the intuition is not obvious. Two appends generally do not conflict, because an append only adds new files and does not depend on the exact set of files another append added. Iceberg can rebase one append on top of another and commit it, so append-heavy workloads scale well even under high concurrency. The trouble comes from operations that delete or overwrite existing files. A row-level update, a merge, or a partition overwrite plans against a specific set of data files, and if another writer has already replaced some of those files, the plan is stale. The conflict detection is not arbitrary: it is checking whether the files your operation assumed would still be there have been changed underneath you. When they have, retrying means re-reading the new file set and re-planning, and if the two operations genuinely touch the same rows, one of them has to lose. Understanding this distinction tells you where to spend effort. Append workloads mostly take care of themselves. Update and merge workloads are where you need isolation and coordination, and they are exactly the workloads agents produce when they maintain mutable state.

## Partition-Level Isolation Patterns

If conflict probability tracks overlap, then the goal of partition design for agentic workloads is to route different writers toward different partitions whenever their business logic allows it.

**Partition by tenant.** In a multi-tenant system, partitioning by tenant means agent A working tenant 1 and agent B working tenant 2 write to entirely separate partitions. Their commits never invalidate each other regardless of frequency. This is the cleanest isolation when your access pattern is tenant-scoped anyway, which it usually is for governance reasons.

**Partition by time.** Time partitioning helps append-heavy workloads like event and audit logs. Agents writing events for the current window append to the active partition, and historical partitions stay untouched. The tradeoff is that a single hot time partition can still become a contention point if every agent writes to "now." Combining time with another dimension usually resolves this.

**Partition by workflow or agent domain.** If different agent workflows own different slices of a table, partitioning along that boundary keeps their writes apart. A pricing agent and a fraud agent writing to the same wide feature table can be isolated if the table is partitioned by the domain each owns.

**Partition by a hashed key when natural keys cluster.** Sometimes the natural write distribution is skewed. A hash or bucket partition spreads writes across more partitions and reduces the odds that many agents target the same one. This trades some query-time pruning efficiency for write-time isolation.

The anti-pattern to avoid is forcing many agents to repeatedly update the same small partition. If your design has a single `latest_state` partition that every agent rewrites, you have built a serialization point, and OCC will punish you for it. When mutable state genuinely must be shared, the answer is usually to move that coordination out of the table and into a gateway, which is the next section.

One honest limitation: partitioning cannot eliminate conflicts for workloads that are fundamentally about mutating shared rows. If ten agents must each update the same row's counter, no partition scheme makes those updates disjoint. That case needs application-level coordination, a different storage primitive for the hot counter, or acceptance that these updates serialize. Iceberg is a table format for analytics, not a high-contention OLTP key-value store, and pretending otherwise leads to disappointment.

## Server-Side Commit Queues for Agents

The most effective structural fix for high-frequency agent writes is to stop letting agents commit directly and put a commit queue in front of the table.

A commit gateway is a service that accepts write requests from many agents, holds them briefly, and turns them into a smaller number of well-formed commits. Instead of five hundred agents each committing three rows, the gateway collects those rows and commits them in batches. This changes the concurrency math in your favor: fewer, larger commits mean less metadata churn, fewer conflicts, and larger data files.

A commit queue does several jobs at once.

**Batching.** The gateway buffers incoming writes for a short window or up to a size threshold, then writes them as one commit. This is the difference between hundreds of tiny snapshots and a handful of substantial ones.

**Sequencing.** By serializing commits to a given table or partition through a single writer path, the gateway removes the collision entirely for that path. There is no OCC conflict when there is only one committer. Agents still work in parallel; only the final commit step is coordinated.

**Retry with backoff.** When a conflict does occur, because you are running multiple gateway workers across partitions, the gateway handles the rebase and retry with proper backoff instead of pushing that logic into every agent. Agents get a simple accepted or rejected response and do not need to understand Iceberg internals.

**Schema validation and quotas.** The gateway is a natural place to validate that incoming records match the expected schema, reject malformed writes before they reach the table, and enforce per-agent quotas so one runaway agent cannot dominate the write path.

**Audit metadata.** Because every write flows through one place, the gateway can attach consistent audit metadata: which agent, which user on whose behalf, which tool call, and when. That metadata is what makes the write path governable later.

There is a design decision inside the gateway worth calling out: how you shard the committer. A single global committer for a table is the simplest way to eliminate conflicts, because with one writer there is no one to conflict with, but it caps your write throughput at what that one committer can sustain. The alternative is one committer per partition, which lets partitions commit in parallel while still serializing writes within each partition. This scales better and matches the partition-isolation strategy from the previous section: if agents are already routed to disjoint partitions, then per-partition committers rarely have to coordinate at all. The tradeoff is complexity. Per-partition committers need a way to route each incoming write to the right committer and a way to rebalance when partition load shifts. For most agent fleets, starting with per-partition committers keyed on the same column you partition the table by is the pragmatic middle ground: it inherits the isolation you already designed and gives you parallelism without a global bottleneck.

Here is the shape of the pattern, described conceptually. Exact APIs and configuration should be verified against your engine and catalog documentation.

```
Agents (hundreds)                Commit Gateway                 Iceberg Table
   |  write(record, key) ---->   [ buffer + dedupe ]
   |                             [ batch by window/size ]
   |                             [ validate schema ]
   |                             [ single committer per partition ]  --> atomic commit
   |  <---- accepted/rejected    [ retry with backoff on conflict ]
```

The tradeoff is real. A commit queue adds a component you must operate, monitor, and scale. It introduces a small amount of latency between when an agent writes and when the data is visible in the table, because batching means waiting. For workloads where an agent must immediately read back its own write, you either accept that latency, provide a read-your-writes path through the gateway's buffer, or route those specific interactions differently. You are trading a bit of freshness and one more service for dramatically better table health under load. For most agent fleets that is the right trade.

## Designing Ingestion Gateways

The commit queue is the coordination layer. The ingestion gateway is the broader design around it that keeps the physical table layout sane. A few principles carry most of the weight.

**Use idempotency keys.** Agents retry, and networks drop responses. If an agent sends a write, times out, and resends, you do not want the record committed twice. Every agent write should carry an idempotency key, a stable identifier derived from the logical operation rather than the attempt. The gateway records keys it has already committed and drops duplicates. This turns "at least once" delivery, which is what you actually get from retrying agents, into "effectively once" storage, which is what you need for correct state.

**Separate append logs from mutable state.** These two patterns should not share a table. Audit events, tool-call logs, and agent action histories are append-only and immutable by nature. Partition them by time, write them with appends, and never update them. Mutable state, like current status or current feature values, is a different table with different concurrency handling, usually funneled through the sequencing path in the commit queue. Mixing them means your cheap, conflict-free append workload inherits the conflict risk of your expensive mutable one.

**Batch small records into larger files.** Even with a commit queue, you want the files themselves to be reasonably sized. Many small files hurt read planning and scan performance. The gateway should accumulate records into files large enough to be efficient before committing. This is a direct lever on the small-file problem that high-frequency writes create.

**Run compaction and maintenance as background work.** No matter how careful the write path is, a busy table accumulates small files, old snapshots, and orphaned metadata over time. Iceberg's [maintenance operations](https://iceberg.apache.org/docs/latest/maintenance/) address exactly this: rewriting data files to compact small files, expiring old snapshots to trim metadata history, and removing orphan files. These jobs should run on a schedule against agent-written tables, and they should be treated as part of the ingestion design rather than an afterthought. A table that agents write to constantly but no one maintains degrades steadily.

**Separate concerns by write intent.** Append logs, mutable state, and derived tables each get their own table, partition strategy, and gateway policy. This lets you tune each independently and keeps a problem in one workload from spilling into the others.

**Design idempotency keys carefully.** The value of an idempotency key depends entirely on how you derive it. A key based on the retry attempt is useless, because every retry gets a new key and nothing is deduplicated. A key based on the logical operation is what you want: the same annotation of the same record should produce the same key no matter how many times it is sent. For agents, a good key often combines the agent's identity, the target entity, and a stable operation identifier from the agent's task, so that a genuine retry collides with its earlier attempt but two legitimately different operations do not. Getting this wrong in either direction causes real problems. Keys that are too coarse suppress writes that should happen. Keys that are too fine let duplicates through. Spend the time to define what "the same operation" means for each agent workflow, because that definition is the whole basis of correctness for the dedupe path.

A related consideration is how long the gateway remembers keys. Deduplication requires storing seen keys somewhere, and that store cannot grow forever. In practice you keep a window: keys are remembered long enough to cover the realistic retry horizon, which is usually seconds to minutes, and then aged out. This bounds the memory cost and is almost always sufficient, because a retry that arrives hours after the original is a different situation that probably deserves to be treated as a new operation anyway. The window length is a tunable you set based on how long your agents might plausibly retry a stalled write.

The following table summarizes the concurrency risks and the pattern that addresses each.

| Concurrency risk | What causes it | Mitigation pattern |
| --- | --- | --- |
| Metadata churn | Many tiny commits per minute | Batching in a commit queue |
| Commit conflicts | Overlapping writes to the same partition | Partition-level isolation; single committer per partition |
| Retry storms | Agents retry conflicts without backoff | Gateway-managed retry with backoff |
| Duplicate records | Agents resend after timeouts | Idempotency keys and dedupe |
| Small-file proliferation | Frequent small writes | File batching plus scheduled compaction |
| Metadata bloat over time | Long snapshot history | Snapshot expiration and orphan cleanup |
| Cross-workload interference | Append and mutable writes share a table | Separate tables by write intent |

## Why Governed Lakehouse Writes Need Platform Controls

Everything above is an argument for a governed write path. Agents write through gateways that batch, dedupe, validate, and audit, into Iceberg tables that are partitioned for isolation and maintained on a schedule. The read and maintenance side of that story is where a governed lakehouse platform does real work.

Dremio approaches this as a data platform built for and managed by AI agents, on open standards. The table format is Apache Iceberg, so the concurrency model above is exactly the one in play, and there is no proprietary lock-in on the storage layer. Dremio's Open Catalog, built on Apache Polaris, coordinates Iceberg metadata and governs who can read and write which tables, which is the authorization foundation your commit gateway enforces against. You can read more about how that catalog is structured in [Dremio's write-up on its Open Catalog architecture](https://www.dremio.com/blog/the-brain-of-the-agentic-lakehouse-inside-dremios-open-catalog-architecture/).

On the maintenance side, the platform handles the table-health work that agent writes make constant rather than occasional. Automated optimization keeps file layouts efficient so that the small files produced by frequent writes get compacted without a human scheduling every job. Reflections and Autonomous Reflections precompute and maintain query acceleration structures over these tables, so the read path stays fast even as the underlying tables churn. C3 caching keeps hot data close to compute. Fine-grained access control, including row-level security and column masking through UDFs, means the same governance that gates who can read a table also constrains what agents can do.

The point is a division of labor. Ingestion gateways you build absorb the high-frequency write problem: batching, sequencing, idempotency, and audit metadata. The governed lakehouse platform handles the read, maintenance, catalog, and access-control side, on open formats that any engine can also read. Agents get fast, governed access to fresh data. The tables stay healthy because no agent ever writes to them uncoordinated.

If you are designing an agentic write path today, start with three decisions: partition your tables so that concurrent agents naturally land in disjoint partitions, put a commit queue in front of any table that agents write to frequently, and separate your append logs from your mutable state. Those three choices resolve most of what makes high-frequency agent writes hard, and they leave the platform free to do the maintenance and governance that keeps the whole thing fast.

To see how a governed, Iceberg-native lakehouse handles agent reads, maintenance, and catalog governance in one place, [get started with Dremio](https://www.dremio.com/get-started).
