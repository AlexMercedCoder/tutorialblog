---
title: "Automated Materialized Views in Dremio"
date: "2026-07-13"
description: "An in-depth exploration of automated materialized views in dremio"
author: "Alex Merced"
category: "Data Lakehouse"
tags:
  - Dremio
  - Materialized Views
  - Lakehouse Optimization
canonical: "https://iceberglakehouse.com/posts/automated-materialized-views-autonomous-table-optimization-dremio-agentic-lakehouse/"
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/automated-materialized-views-autonomous-table-optimization-dremio-agentic-lakehouse/).

Traditional lakehouse maintenance runs on a schedule. Someone writes a cron job to compact small files at 2 a.m., another to refresh a materialized view every hour, another to expire old snapshots on Sunday. This works when workloads are predictable, when the same dashboards hit the same tables in the same patterns week after week. AI-era workloads are not predictable. An agent investigating a business question does not run one query. It runs a burst of ten or twenty, each building on the last, joining datasets no one anticipated, filtering on columns no one indexed for, and it does this at whatever moment the business question arises rather than on a schedule you set in advance. Static maintenance built for steady BI traffic falls behind irregular agentic demand, and it falls behind in ways that are hard to see until latency and cost both creep up.

Dremio's answer is to make physical optimization a function of observed demand rather than a manual tuning exercise. Reflections, Autonomous Reflections, automatic table optimization for Iceberg, and multiple layers of caching let the platform adapt what it materializes and how it stores data to what queries are actually running. The sections ahead cover why cron-based maintenance falls behind, how Reflections differ from traditional materialized views, how Autonomous Reflections work from query patterns, what automatic Iceberg table optimization covers, and, importantly, how to measure whether all of this is actually saving you anything. The governing idea, in Dremio's own framing: performance is an automated byproduct of the architecture, not a manual tuning exercise. That claim only holds if you can measure it, which is why honest measurement gets its own treatment below rather than a footnote.

## Why Cron-Based Maintenance Falls Behind

Scheduled maintenance encodes an assumption: that you know in advance what optimization the workload will need and when. That assumption breaks in three specific ways under modern workloads.

First, agent queries are bursty and multi-step. A human analyst asks one question, looks at the result, thinks, and asks another a few minutes later. An agent decomposes a goal into a chain of queries and fires them in quick succession, sometimes in parallel. A materialized view refresh scheduled hourly is either stale for most of that burst or refreshing constantly against tables that are not being read at that moment. The refresh cadence and the query cadence are decoupled, and cron cannot couple them because it does not know when the burst will come.

Second, manual reflection and materialized-view design lags the workload. When an analyst decides they need a pre-aggregated summary table, they design it, build it, and schedule its refresh. That process takes days and assumes the query pattern is stable enough to be worth the investment. Agentic workloads change the shape of demand faster than a human can design for it. By the time you have hand-built the perfect materialized view for last month's queries, the queries have moved on. You are always optimizing for the past.

Third, cron-based compaction runs at the wrong time or against the wrong data. Compaction scheduled for 2 a.m. runs whether or not the tables that got written yesterday actually need it, and it does not run when a mid-afternoon ingestion burst produces thousands of small files that are slowing queries right now. The schedule is blind to the actual state of the tables. It compacts partitions no one queries and leaves hot partitions fragmented because the clock said 2 a.m. was maintenance time.

The common thread is that a fixed schedule cannot respond to a variable workload. It can only respond to the clock. When the workload's shape and timing are themselves variable, and agentic demand makes them highly variable, the schedule is optimizing against a model of the world that no longer matches reality.

It is worth being fair to cron here, because scheduled maintenance is not stupid, it is just limited. For a stable, well-understood workload, a schedule is a perfectly reasonable strategy, and plenty of production systems run on one successfully. The problem is not that schedules are wrong. It is that they encode a snapshot of the workload at the moment someone designed them, and they do not update themselves when the workload moves. A schedule is a decision made once and repeated. What irregular workloads need is a decision remade continuously as conditions change. That is a different control model, closer to a feedback loop than a timer, and it is the model autonomous optimization implements. The rest of this post is about what that feedback loop looks like at each layer of the stack.

## Reflections vs. Traditional Materialized Views

Reflections are Dremio's mechanism for physical optimization, and the most important thing to understand about them is how they differ from the materialized views you may know from a warehouse. A traditional materialized view is a named object. To benefit from it, a query has to reference it explicitly, or you rely on a query-rewrite feature that is often limited and brittle. Analysts end up needing to know which materialized views exist and rewrite their SQL to hit them, which pushes physical optimization knowledge into every query author's head.

A Reflection is an optimized physical representation of data, such as a pre-aggregation or a sorted, partitioned copy, that Dremio's optimizer can substitute into a query plan transparently. Users and agents query the logical dataset, the virtual dataset in the semantic layer, and never reference the Reflection at all. The optimizer decides, per query, whether a Reflection can satisfy some or all of the plan and rewrites accordingly. This matters for three reasons.

It preserves semantic consistency. Because everyone queries the same logical dataset and the Reflection is an implementation detail, there is no risk of one team querying the raw table and getting a different answer than another team querying a hand-built summary. The definition of the data lives once, in the virtual dataset, and the Reflection is just a faster way to compute it.

It removes the burden from query authors. Nobody has to know a Reflection exists. An agent generating SQL against the semantic layer gets Reflection acceleration for free, without any Reflection-aware logic in the agent. That is exactly what you want when the query author is a model that should be reasoning about the business question, not about physical storage.

It decouples logical from physical. You can add, change, or remove Reflections without rewriting a single query, because queries reference logical datasets. Physical optimization becomes something the platform manages underneath a stable logical surface. Dremio's own comparison, [five ways Reflections outsmart traditional materialized views](https://www.dremio.com/blog/5-ways-dremio-reflections-outsmart-traditional-materialized-views/), goes deeper on the mechanics. The table below captures the core contrast.

| Property | Traditional materialized view | Dremio Reflection |
| --- | --- | --- |
| Query references it | Explicitly, or via limited rewrite | Never, optimizer substitutes transparently |
| Author awareness | Authors must know it exists | Invisible to authors and agents |
| Semantic consistency | Risk of divergent definitions | Single logical definition preserved |
| Changing it | Often requires query rewrites | No query changes needed |
| Optimizer control | Limited | Per-query plan substitution |

## Autonomous Reflections from Query Patterns

Reflections solve the transparency problem. Autonomous Reflections solve the design problem: deciding which Reflections to create in the first place, when to refresh them, and when to remove them. This is where the platform observes demand and acts on it.

The raw material is the query history. Every query Dremio runs leaves a record of what it touched: which datasets, which joins, which filter predicates, which aggregations, which columns. Across thousands of queries, patterns emerge. Certain joins recur constantly. Certain datasets are hot. Certain aggregations get recomputed over and over. That history is a precise, empirical description of what the workload actually needs, as opposed to what someone guessed it would need when they designed maintenance by hand.

Autonomous Reflections use those observed patterns to manage Reflections automatically. When a query pattern is frequent and expensive enough to justify materialization, the platform can create a Reflection that accelerates it. As patterns shift, it can refresh the Reflections that still earn their keep and remove the ones that no longer serve enough queries to justify their storage and refresh cost. The lifecycle, create, refresh, retire, tracks the workload instead of a calendar.

It is worth being precise about what this is and is not. This is not magic and it is not a model hallucinating optimizations. It is autonomous performance grounded in observed evidence: the system watches what queries run, quantifies which materializations would pay off, and manages them. The decisions are auditable because they trace back to actual query patterns. That distinction matters because "the platform tunes itself" can sound like a hand-wave. The honest version is narrower and more credible: the platform has a complete record of demand, and it uses that record to decide what to materialize, the same reasoning a good performance engineer would apply, done continuously instead of quarterly.

The advantage over a human doing this by hand is not that the machine is smarter. A skilled performance engineer given the full query log would reach similar conclusions. The advantage is scale and continuity. A human reviews query patterns occasionally, considers a handful of the most obvious candidates, and revisits the analysis maybe once a quarter because it is tedious work competing with everything else on their plate. The system does it across every query, all the time, without getting bored or falling behind. For a workload that changes weekly, quarterly human tuning is structurally too slow no matter how good the engineer is. Continuity is the real edge, and it is exactly the edge that matters most for agentic workloads that shift faster than any review cadence a person would keep up.

```
   query history
   (joins, filters, aggregations, hot datasets)
            │
            ▼
   pattern detection ──▶ candidate Reflections ranked by
            │             frequency × cost of recomputation
            ▼
   ┌──────────────────────────────────────────┐
   │  create   →  accelerate frequent patterns │
   │  refresh  →  keep valuable ones current   │
   │  retire   →  drop patterns that faded     │
   └──────────────────────────────────────────┘
            │
            ▼
   optimizer substitutes Reflections transparently
```

## Automatic Table Optimization for Iceberg

Reflections sit above the tables. There is a second layer of optimization at the table level, on the physical Iceberg files themselves, and Dremio can automate that too for managed Iceberg tables.

Iceberg tables accumulate wear as they are written. Streaming and frequent ingestion produce many small files, which are slow to scan because each file carries per-file overhead. Metadata grows: manifests that list data files can become large and numerous, which slows planning. Data written in ingestion order may not be clustered the way queries filter it, so queries read more than they need. And old snapshots and orphaned files pile up, consuming storage. The [Iceberg maintenance documentation](https://iceberg.apache.org/docs/latest/maintenance/) describes these operations in the format's own terms.

Dremio's automatic table optimization addresses these directly. It can compact small files into right-sized ones so scans read fewer, larger files. It can rewrite manifests to keep table metadata efficient so query planning stays fast. It can cluster data so that files are organized around common filter columns, letting the engine skip files that cannot match a predicate. And it can vacuum old snapshots and orphaned files to reclaim storage. The point of automating this is the same as with Reflections: the platform can decide when a table actually needs compaction based on its state, rather than compacting everything on a schedule regardless of whether it helps. A table that got heavy writes today gets attention; a cold table that no one touched does not waste maintenance compute. Dremio's writeup on [delivering an Iceberg lakehouse without the headaches](https://www.dremio.com/blog/5-ways-dremio-delivers-an-apache-iceberg-lakehouse-without-the-headaches/) covers how this fits the broader operational picture.

Two more caches complete the performance stack. C3, the columnar cloud cache, caches data read from object storage onto local NVMe, so repeated reads of hot data hit fast local storage instead of paying the object-store round trip every time. This matters because object storage, while cheap and durable, has real latency per request, and a query that reads the same columns of the same hot dataset repeatedly should not pay that latency every time. C3 turns the second and subsequent reads into local NVMe reads, which are far faster. And results cache and plan cache reduce repeated execution overhead, so identical or near-identical queries, common in agentic bursts where similar queries fire in sequence, do not redo work from scratch. The plan cache saves the work of planning a query that has been planned before; the results cache saves the work of executing one whose answer has not changed. None of these require configuration per workload; they respond to what is actually being read.

It helps to see how these layers stack, because they are not alternatives, they compose. At the top, Reflections can satisfy a query from a pre-computed physical representation, skipping the raw scan entirely. Below that, if a query does hit raw tables, automatic table optimization has already made those tables cheaper to scan by compacting files and clustering data. Below that, C3 keeps the hot bytes on local NVMe so the scan is fast. And across all of it, plan and results caches short-circuit repeated work. A single agent query burst can benefit from every layer at once: the first query warms caches and possibly triggers a Reflection, later queries in the burst hit the warm caches and the accelerated structures, and the tables underneath were already well-organized before the burst started. That composition is the point. No single mechanism carries the whole load, and each one covers a case the others do not.

## Measuring Savings Honestly

Here is where a lot of "the platform optimizes itself" claims get uncomfortable, so it is worth being direct. Automation is not free, and materialization can cost more than it saves if it is unmanaged. A Reflection consumes storage and costs compute to refresh. If you materialize an aggregation that few queries actually use, you are paying storage and refresh cost for little benefit. Automatic compaction consumes compute every time it runs. The whole argument for autonomous optimization rests on the claim that it makes good decisions about when the benefit exceeds the cost, and the only way to trust that claim is to measure both sides.

Measure the benefit side across several dimensions. Query latency reduction is the most visible: how much faster do queries run when a Reflection accelerates them versus scanning raw tables. Compute time avoided is the aggregate version of that: how much execution work the substitutions and caches saved across the whole workload. Both of these are where the value shows up.

Measure the cost side just as carefully. Storage overhead is what the Reflections and cached data actually consume, and it can be substantial for large pre-aggregations. Reflection refresh cost is the recurring compute spent keeping materializations current, which for a frequently refreshed Reflection over a slowly queried dataset can quietly exceed the savings. A Reflection that costs more to refresh than it saves in query time is a net loss, and you only know that if you track both numbers.

Then measure the operational dimension, which is easy to forget and often the largest saving: operator time. The hours a DBA or data engineer used to spend designing materialized views, tuning refresh schedules, and hand-writing compaction jobs are hours the automation gives back. That saving does not show up on a compute bill, but it is real and it compounds. The table below maps the manual tasks to their automated counterparts.

| Manual DBA / engineer task | Dremio automated capability |
| --- | --- |
| Design summary tables for hot patterns | Autonomous Reflections created from query history |
| Schedule and tune materialized view refreshes | Refresh managed against observed demand |
| Retire unused summary tables | Reflections retired when patterns fade |
| Cron compaction of small files | Automatic Iceberg compaction on table state |
| Manual manifest rewrites | Automatic manifest optimization |
| Schedule snapshot expiration and cleanup | Automatic vacuum of old snapshots and orphans |
| Warm caches manually | C3, results cache, and plan cache respond to reads |

There is a subtler cost worth flagging: the refresh-versus-freshness tradeoff. A materialized structure is only useful if it reflects current data, which means it has to refresh as the underlying tables change. Refresh more often and the materialization stays fresh but costs more compute. Refresh less often and you save compute but risk serving slightly stale results, or you force the optimizer to fall back to raw scans when the Reflection is too stale to trust. There is no free lunch here. The value of autonomous management is that it makes this tradeoff per Reflection based on how often the underlying data actually changes and how often the Reflection is actually used, rather than applying one refresh cadence to everything. A Reflection over a slowly changing dataset can refresh rarely; one over a fast-changing dataset queried constantly justifies frequent refresh. A human setting a single schedule cannot make that distinction at scale. But the tradeoff itself does not disappear, and you should watch refresh cost as a first-class number, not assume it away.

The honest conclusion is that autonomous optimization is a bet that the platform's cost-benefit decisions beat what a busy human team would do by hand on a schedule. For irregular, agent-driven workloads, that bet is well founded, because a human on a schedule cannot react to demand that changes hour to hour, while a system watching the query log can. But it is still a bet you should verify with the metrics above rather than take on faith. Watch the storage and refresh costs alongside the latency wins, and the picture will be clear.

## Why Autonomous Performance Matters for the Agentic Lakehouse

Tie this back to what agents do. An agent working a business problem generates unpredictable, bursty, multi-step query patterns against datasets it selects on the fly. That is precisely the workload that defeats static tuning and precisely the workload that autonomous optimization is built for. When the platform observes demand and adapts, the agent's tenth query in a burst benefits from the acceleration and caching warmed by its first nine, without anyone having provisioned for that specific burst in advance.

This is why performance being an automated byproduct of the architecture matters for agentic analytics specifically. If performance depended on humans predicting agent query patterns and hand-tuning for them, agents would be slow exactly when they are most active, because no human predicted the burst. Dremio, the data platform built for AI agents and managed by AI agents, closes that loop: the same query history that records what agents ask feeds the optimization that makes the next round of asking fast. It all runs on open standards, Apache Iceberg tables, Apache Arrow, and an open catalog built on Apache Polaris, so the optimization accelerates open data you are not locked into. Dremio's overview of [the AI foundation of the agentic lakehouse](https://www.dremio.com/blog/the-ai-foundation-of-the-agentic-lakehouse/) puts this in the wider context of how the platform serves agents.

One caution keeps this grounded. Autonomous does not mean unattended in the sense of never looking. The platform makes the tuning decisions, but you still own the guardrails: budgets for how much storage materializations can consume, visibility into which Reflections exist and what they cost, and the judgment to intervene when a particular workload has unusual requirements the automation should not be left to guess at. Think of it as moving from doing the work to supervising it. The tedious, continuous part, watching demand and adjusting materializations, is handled. The strategic part, deciding how much you are willing to spend on performance and where the hard constraints lie, stays with you. That division is the right one. It puts the repetitive optimization where machines excel and keeps the cost-and-priority tradeoffs where human judgment belongs.

The takeaway is not that you never think about performance again. It is that the default posture flips. Instead of performance being a manual project you schedule and maintain, it becomes something the platform manages against real demand, with the metrics available for you to verify it is worth it. For workloads too irregular to tune by hand, that is the difference between chasing the workload and keeping up with it.

Want to see autonomous optimization against your own query patterns? [Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started), point it at your Iceberg tables, and watch Reflections and table optimization adapt to what your queries actually do.
