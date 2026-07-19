---
title: "Dremio Lakehouse AI Report: Agentic Lessons"
date: "2026-07-13"
description: "An in-depth exploration of dremio lakehouse ai report: agentic lessons"
author: "Alex Merced"
category: "Data Lakehouse"
tags:
  - Dremio
  - Lakehouse
  - AI Report
canonical: "https://iceberglakehouse.com/posts/dremio-state-data-lakehouse-ai-report-agentic-lakehouse/"
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/dremio-state-data-lakehouse-ai-report-agentic-lakehouse/).

Most lakehouse roadmaps written in the last few years had the same top items: migrate off the expensive warehouse, cut storage costs, consolidate on open table formats. Those are still reasonable goals. They are also no longer the whole story, because the thing pulling on data platforms hardest right now is not cost. It is agents. The direction that data leaders are signaling, and that Dremio's [state of the data lakehouse and AI findings](https://www.dremio.com/resources/) point at, is a shift from the lakehouse as a place to store and query data toward the lakehouse as an operating foundation for AI.

I want to be careful with how I treat the report itself. Rather than quote survey percentages I cannot stand behind precisely, I am going to treat the findings as directional market signals: the shape of where enterprise priorities are moving, not a claim about an exact share of respondents. The signals are consistent and they line up with what teams are actually building. What they tell you is that the requirements for a lakehouse change once agents start doing real work on it, and that the platforms worth investing in now are the ones designed for that change.

## What the Report Signals About Enterprise Priorities

The clearest signal is a reordering of priorities. For several years, "get to the lakehouse" meant migration and consolidation. The emerging priority is readiness: is the lakehouse ready for agents to work on it reliably? That is a different question, and it pulls in a different set of requirements.

Data leaders are describing a move beyond retroactive dashboards toward live operational workflows. A dashboard is something a human looks at after the fact to understand what happened. An operational workflow is something that runs continuously and takes or recommends action. When an agent is in that loop, the demands on the data platform go up on four axes at once: faster query response, because agents chain queries and cannot wait; clearer semantics, because agents cannot fill gaps with human judgment; broader data access, because agents inspect many datasets to find the right one; and stronger policy enforcement, because agents act with more reach and more speed than any single person.

The directional signal, then, is that lakehouse roadmaps now need an agent-readiness track alongside the migration-and-cost track. Not instead of. The cost and consolidation work still matters. But a lakehouse that is cheap and consolidated and still cannot give an agent consistent metrics or interactive query speed is not ready for the workloads that are arriving. The rest of this post walks through what agent-readiness actually requires, using the report's themes as the frame.

## From Retroactive Reporting to Live Workflows

The move from reporting to live workflows is worth sitting with, because it changes the design center of the platform.

Retroactive reporting is forgiving. A dashboard that takes fifteen seconds to load is mildly annoying. A metric that is slightly off gets caught by an analyst who knows the business. A query pattern that is predictable, because humans ask roughly the same questions on roughly the same schedule, lets a DBA tune for it. The whole arrangement tolerates latency, absorbs small inconsistencies, and rewards predictable load.

Live agentic workflows are not forgiving on any of those axes. An agent reasoning through a problem issues a query, reads the result, decides what to ask next, and issues another. That loop might run five or ten queries deep for a single task. Latency does not add; it compounds, because each step waits for the last. A metric that is slightly off does not get caught, because there is no analyst in the loop watching for it, and the agent carries the error forward into every subsequent step. And the query patterns are not predictable, because an agent's path through the data depends on what it finds along the way. Two runs of the same task can take different routes.

That is the core reason agentic analytics changes lakehouse requirements. You are no longer building for a human who tolerates delay, catches errors, and asks predictable questions. You are building for a system that cannot tolerate compounding delay, will not catch semantic errors, and generates irregular load by design. The three themes that follow, semantic consistency, autonomous performance, and a staged roadmap, are all responses to those three shifts.

## Semantic Consistency Across Interfaces

The first requirement is that the data mean the same thing no matter what asks for it. In a modern data platform, a lot of things ask: BI tools, SQL editors, notebooks, Python libraries, MCP clients, and embedded agents. Each of those is a consumer, and each one is capable of computing "revenue" or "active customer" its own way if you let it.

Without a shared semantic layer, that is exactly what happens. The BI tool has revenue defined in a workbook. The notebook has it defined in a pandas transformation. The agent generates SQL that picks a definition from column names. Now you have three definitions of revenue that mostly agree and occasionally do not, and the occasions when they disagree are the ones that erode trust. For a human, divergence across tools is a nuisance you learn to work around. For an agent, it is a correctness problem, because the agent has no way to know its definition differs from the finance team's, and it will confidently report a number that does not reconcile.

The fix is a semantic layer that every interface resolves through. In Dremio's model, described in the [semantic layer for agentic analytics work](https://www.dremio.com/blog/agentic-analytics-semantic-layer/), that layer is built from virtual datasets and views enriched with wikis, labels, and AI-generated metadata. The virtual datasets encode the joins and the metric logic once. The wikis and labels carry the human context, what a field means and when to use it. The AI-generated metadata helps document large numbers of datasets that would otherwise stay opaque, which matters because an agent can only use context that has actually been written down.

The payoff is that when the BI tool, the notebook, and the agent all resolve "revenue" through the same virtual dataset, they get the same number. The agent is not guessing from schema. It is calling a defined metric, and the definition is the same one the humans use. Semantic consistency is not a nice-to-have for agentic analytics. It is the precondition for an agent's answers to reconcile with everyone else's.

The honest limitation is coverage. A semantic layer only governs the concepts it defines. Building good semantic coverage over a large data estate is ongoing work, and it is never finished because the business keeps inventing questions. The value of centralizing that work is that it gets done once and reused everywhere, rather than being reinvented in every tool. But it does not do itself, and any roadmap that treats the semantic layer as a checkbox rather than a program will find its agents falling back to raw SQL on everything the layer does not cover.

## Autonomous Performance for Irregular AI Workloads

The second requirement is speed that holds up under load nobody can predict. This is where the traditional performance playbook runs out of road.

The traditional playbook is manual tuning. A DBA looks at the query patterns, identifies the hot paths, builds materialized views or indexes for them, and tunes for the predictable load. That works when the load is predictable. Agentic load is not. Agents generate query patterns that no DBA anticipated, because the patterns emerge from the agents' reasoning at runtime rather than from a fixed set of dashboards. By the time you have hand-tuned for last week's agent behavior, this week's agents are doing something different. Manual tuning cannot keep up with load that reinvents itself.

Dremio's answer is to make performance autonomous rather than hand-managed. Several mechanisms work together here, and it is worth being specific about what each does.

**Reflections** are Dremio's acceleration structures. A Reflection is an optimized, often pre-aggregated or re-sorted representation of data that the query planner can transparently substitute for the raw scan when it will make a query faster. The consumer does not query the Reflection directly and does not need to know it exists. The planner decides. That transparency matters for agents, because the agent asks its natural question and the platform handles acceleration underneath, without the agent needing to know which materialization to target. The [comparison of Reflections to traditional materialized views](https://www.dremio.com/blog/5-ways-dremio-reflections-outsmart-traditional-materialized-views/) covers why the planner-driven substitution model behaves differently from views you have to query explicitly.

**Autonomous Reflections** extend that by deciding what to accelerate based on observed query patterns, rather than requiring someone to define every Reflection by hand. This is the direct answer to unpredictable agent load: the system observes what the agents are actually doing and adapts its acceleration to match, instead of waiting for a DBA to notice and react.

**C3 caching** keeps frequently accessed data close to the compute, so repeat access does not pay the full cost of reading from object storage each time. Agent workloads are bursty and often revisit the same data across steps, so keeping hot data close pays off directly.

**Query plan cache and results cache** avoid redundant work. If the planner has already figured out how to execute a shape of query, or if an identical query has already produced a result, the platform can skip re-doing that work. Agents that ask similar questions repeatedly benefit from both.

**Table optimization** handles the maintenance that open table formats require: compacting small files, cleaning up old snapshots and metadata. Left undone, that overhead slowly degrades query performance. Automating it keeps the tables fast without a human running maintenance jobs.

The framing that ties these together is that autonomous performance is a response to irregular, high-volume agent workloads. You cannot hand-tune for load you cannot predict, so the platform has to tune itself. That is a genuine design shift from the DBA-driven model, and it is one of the clearer signals in where lakehouse platforms are heading.

## Broad Access With Consistent Governance

The third demand agents place on a platform is broad data access that does not sacrifice governance, and these two goals pull against each other in most architectures. Broad access usually means loading everything into one place, which multiplies copies and governance surfaces. Tight governance usually means restricting access, which starves agents of the data they need to be useful. The signal in the report is that enterprises want both at once, and that tension is exactly what a federated, governed lakehouse is built to resolve.

Broad access, in the agent context, means the agent can reach data wherever it lives: object storage, existing warehouses, operational databases. Agents inspect many datasets to find the right one, so a platform that only exposes what has already been loaded into a single store leaves the agent blind to most of the enterprise's data. Federation solves the access side by querying sources in place, so the agent's reach is not limited to what a prior loading job happened to bring in.

Consistent governance means the access rules apply the same way regardless of which interface issues the query. This is where per-tool governance breaks down badly once agents arrive. If row-level security is enforced in the BI tool but not in the path the agent uses, the agent can see data that the equivalent human cannot, and you have created a compliance problem by accident. The fix is to enforce fine-grained access control in the engine that runs the query, so the same row and column restrictions apply whether a human clicks a dashboard, a data scientist runs a notebook, or an agent calls through an MCP client. Governance attached to the query engine, rather than reimplemented per tool, is what keeps broad access from becoming a security regression.

The report's directional signal here is that data leaders increasingly recognize these as one requirement rather than two. You cannot give agents broad access and worry about governance later, because "later" is after the agent has already seen something it should not have. The governance has to be built into the same layer that provides the access, which is a design constraint that favors platforms where federation and access control live together rather than in separate tools that have to be kept in sync.

## Standard Lakehouse Versus Agentic Lakehouse

The gap between where many lakehouses are and where agent-readiness requires them to be is easier to see laid out directly.

| Capability | Standard lakehouse | Agentic lakehouse requirement |
| --- | --- | --- |
| Primary consumer | Human analysts and dashboards | Agents plus humans across many interfaces |
| Query latency tolerance | Seconds are fine | Must stay interactive; latency compounds in agent loops |
| Metric definitions | Often per-tool, divergent | One semantic layer resolved by every interface |
| Performance tuning | Manual, DBA-driven, for predictable load | Autonomous, adapts to unpredictable agent patterns |
| Data access | What has been loaded or modeled | Broad federated reach with consistent governance |
| Access control | Enforced per tool | Enforced in the engine, uniform across consumers |
| Interface | BI and SQL clients | Adds MCP clients and native agent interfaces |

The left column is not wrong. It is a perfectly good lakehouse for the workloads it was built for. The point of the table is that agent-readiness is not a small increment on top of it. It is a different set of requirements on latency, semantics, performance management, and interfaces, and closing that gap is what the report's signals are really pointing at.

## A Practical Roadmap for Agent-Ready Data

None of this argues for a rip-and-replace. It argues for a staged path, and the sequence matters because some steps are prerequisites for others.

**Inventory data products and trusted metrics first.** Before you point any agent at your data, know what your authoritative data products are and which metrics are trusted. This is unglamorous cataloging work, and it is the foundation everything else sits on. An agent given access to data whose trustworthiness nobody has established will produce confident answers from untrustworthy sources.

**Move high-value analytical datasets to open table formats.** Get the datasets agents will actually use onto open Iceberg tables in object storage. This gives you multi-engine access, snapshots for reproducibility, and a single authoritative copy rather than a scatter of replicas. Do the high-value datasets first; you do not have to migrate everything at once, and you should not try to.

**Build the semantic layer before giving agents broad query access.** This is the step teams are most tempted to skip, and skipping it is where agentic analytics projects go wrong. Define the metrics, the joins, and the business context as virtual datasets before the agents arrive. Giving agents broad raw SQL access to un-modeled data is how you get inconsistent numbers at scale. The semantic layer is the guardrail, and it needs to exist first.

**Add observability for query cost, lineage, and agent behavior.** Once agents are working, you need to see what they are doing: which queries they run, what they cost, where the data came from, and how the agents behave over time. Agents can generate a lot of query volume quickly, and without observability, a misbehaving agent is an unbounded cost and an unaudited actor. Lineage lets you answer "where did this answer come from," which is the question that follows every agent-produced number.

The staging is deliberate. Each step makes the next one safe. Inventory before migration so you migrate the right things. Open tables before semantics so the semantic layer sits on a stable foundation. Semantics before agent access so the agents have guardrails. Observability alongside agent access so nothing runs unwatched. A roadmap that skips a step does not save time; it moves the failure later, where it is more expensive to fix.

## Native Interfaces and AI Inside the Query Layer

There is one more theme worth pulling out of the report's direction, and it is the one that most clearly separates a lakehouse retrofitted for AI from a lakehouse built for it: how the AI actually connects, and where the AI work happens.

The interface question is straightforward but consequential. A standard lakehouse exposes SQL and BI connectivity, which is right for humans and human-driven tools. An agent-ready lakehouse also has to speak the protocols agents use. The Model Context Protocol has become the common way to expose data and tools to agents, and a platform that ships an MCP server lets agents discover governed datasets and semantic definitions as tools rather than through a bespoke integration built per agent. The difference matters at scale, because bespoke integrations do not compose. Every new agent needs new plumbing. A standard interface means the governed data surface is defined once and any MCP-capable agent can reach it, with the governance and semantics coming along for free.

The deeper shift is bringing AI functions into the query layer itself. Traditionally, applying a language model to data meant extracting the data, sending it to a model somewhere else, processing the response, and loading results back. That round trip is slow, it creates more copies, and it scatters the AI logic across application code. AI functions embedded in SQL collapse that loop. Functions like AI_GENERATE, AI_CLASSIFY, and AI_COMPLETE let you apply model reasoning to data directly in a query, where the data already lives and where governance already applies. Classifying support tickets, generating summaries of records, or completing structured extractions become part of the query rather than a separate pipeline.

For agentic workflows, in-query AI functions matter because they keep the AI operation inside the governed, performant data layer instead of forcing every model call out to an ungoverned application tier. An agent can compose a query that both retrieves data and applies a classification to it in one governed operation. The result stays auditable, the data does not leave to be processed, and the access rules still apply. This is the concrete meaning of "AI-native" as opposed to "AI-adjacent": the AI capability lives in the same layer as the data and the governance, not bolted on beside it.

The honest tradeoff is that in-query AI functions are newer ground than the well-worn parts of SQL, and applying model calls at scale inside queries raises real questions about cost and latency that you have to design around. Model calls are not free, and a query that invokes one per row across a large table can get expensive quickly. That is a reason to use these functions deliberately, on the right slices of data, rather than everywhere, and to pair them with the same acceleration and caching that govern the rest of the platform's performance.

## Why the Agentic Lakehouse Direction Makes Sense

Pull the threads together and the direction the report signals is coherent. Enterprises are moving from retroactive reporting to live workflows. Live workflows put agents in the loop. Agents demand semantic consistency, interactive performance under unpredictable load, broad governed data access, and native interfaces. A lakehouse that provides those things is what agent-readiness means.

This is the [foundation Dremio has been building toward](https://www.dremio.com/blog/the-ai-foundation-of-the-agentic-lakehouse/), and it lines up with the requirements point by point. Dremio is a unified lakehouse on open standards, Apache Iceberg, Apache Arrow, and Apache Polaris, so the data stays open and portable rather than captured in a proprietary store. Its federated query engine reaches data in place across sources, which covers the broad-access requirement without a copy-everything project. The semantic layer of virtual datasets, wikis, labels, and AI-generated metadata covers semantic consistency. Reflections, Autonomous Reflections, and caching cover autonomous performance for irregular load. Fine-grained access control enforced in the engine covers uniform governance. And native agentic interfaces, including an open-source MCP server plus built-in AI SQL functions like AI_GENERATE, AI_CLASSIFY, and AI_COMPLETE, cover the interface requirement.

The honest caveat is that adopting any of this is a program, not a switch. The roadmap above is real work: inventory, migration, semantic modeling, observability. What a purpose-built agentic lakehouse changes is that you are doing that work against a foundation designed for the destination, rather than bolting agent-readiness onto a platform built for retroactive dashboards. The thing that makes agentic analytics work is not the model you plug in at the end. It is the foundation underneath: consistent context, governed access, and interactive speed. Get the foundation right and a competent model does trustworthy work on it.

If your 2026 roadmap has an agent-readiness track on it, the useful next step is to build one governed semantic view over open tables and see how it behaves under real query load. You can start with a free Dremio account at [dremio.com/get-started](https://www.dremio.com/get-started), stand up a semantic layer over your own data, and connect an agent to it through the MCP server to see where your architecture is ready and where the gaps are.
