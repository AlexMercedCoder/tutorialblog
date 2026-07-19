---
title: "Five-Layer Agentic Lakehouse Architecture"
date: "2026-07-13"
description: "An in-depth exploration of five-layer agentic lakehouse architecture"
author: "Alex Merced"
category: "Data Lakehouse"
tags:
  - Lakehouse Architecture
  - AI Agents
  - Enterprise
canonical: "https://iceberglakehouse.com/posts/five-layer-agentic-lakehouse-architecture-enterprise-pattern/"
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/five-layer-agentic-lakehouse-architecture-enterprise-pattern/).

Hand an AI agent a database connection string and broad SQL access, and you have built the fastest possible path to an inconsistent, unauditable, and occasionally dangerous analytics system. The agent will query things it should not, define metrics however the schema suggests, and leave you no clean record of why it did what it did. The problem is not the agent's competence. It is that you gave it raw storage access with no layer in between to supply meaning, constrain actions, and enforce policy.

Trusted agentic analytics needs architectural boundaries, the same way a well-built application does not let the UI reach straight into the database. The pattern that has emerged for this is a five-layer model: Data, Knowledge, Agent, Tool, and Policy. Each layer has a distinct job, and the separation is what makes the whole system reviewable and safe. This post walks through each layer, what belongs in it, and where the boundaries between them matter most. It closes with a checklist you can run against your own architecture.

## Why Agents Should Not Query Raw Storage Directly

Before the layers, it is worth being precise about what goes wrong when an agent talks straight to storage, because the layers are each a response to one of these failures.

**Semantic ambiguity.** Raw tables encode structure, not meaning. A `status` column with values `1`, `2`, and `3` means something to the team that built it and nothing to an agent reading it cold. "Revenue" could be any of five columns. Join two tables on a shared key and an agent can easily fan out a sum to several times its true value. An agent reasoning from schema alone will produce plausible, confident, wrong answers, and the wrongness is the silent kind that does not throw an error.

**Security risk.** An agent with a database connection has whatever that connection's account can see, which is almost always broader than any individual human should have. Row-level and column-level restrictions that apply to people do not automatically apply to an agent hitting the tables directly. The agent becomes a way to route around access control, not because anyone intended it but because nothing sat between the agent and the data to enforce the rules.

**Audit gaps.** When an agent generates and runs one-off SQL, that SQL is ephemeral. The conversation ends and the exact query is gone. When someone asks "how did the agent arrive at this number," there is nothing durable to point to. No named metric, no defined tool, no logged action tied to an identity. You cannot audit what you did not structure.

The five layers exist to close these three gaps. The Data layer makes storage reachable and governed. The Knowledge layer supplies meaning so the agent is not guessing. The Agent layer bounds what the agent tries to do. The Tool layer constrains how it acts. The Policy layer enforces identity and limits across all of it. Take the layers in order.

## Layer 1: Data

The Data layer is the physical and logical foundation: object storage, open table formats, source systems, catalogs, and the physical datasets themselves. Its job is to make data reachable, current, and governed at the storage level, so everything above it has a stable base to build on.

[Apache Iceberg](https://iceberg.apache.org/spec/) does a lot of work in this layer, and for good reasons. As a table format it provides table metadata that turns files in object storage into something that behaves like a database table. It gives you snapshots, so a table has a queryable history and an agent can reference a specific point in time for reproducible analysis. It supports schema evolution, so tables can change as the business changes without breaking existing queries or rewriting data. And because it is an open specification, it offers multi-engine interoperability: many engines can read and write the same tables, which keeps the data from being captured by any single engine.

The important extension at this layer is that the Data layer is not only Iceberg tables. Real enterprises have data in operational databases, in existing warehouses, and in object stores that will not all be migrated to Iceberg any time soon. This is where query federation matters. Federation lets the Data layer present a unified, queryable surface across Iceberg tables and other sources, querying each in place rather than forcing everything into one store first. For an agent that needs to inspect many datasets to find the one it needs, a federated Data layer is the difference between "I can reach the data that matters" and "I can only reach what someone already loaded into the one blessed store."

The tradeoff to acknowledge here is operational. Open tables require maintenance: compaction of small files, expiration of old snapshots, metadata cleanup. Federation requires a planner smart enough to push filters down to sources and prune irrelevant data, or cross-source queries get slow. These are real costs. A well-run Data layer either does this maintenance or uses a platform that automates it, and it is dishonest to present open, federated data as free of that work.

## Layer 2: Knowledge

The Knowledge layer is where physical data becomes business meaning. If the Data layer answers "what data exists and where," the Knowledge layer answers "what does it mean and how do I use it correctly." This is the layer that most directly prevents the semantic-ambiguity failures, and it is the one teams most often underbuild.

What lives here: semantic models and virtual datasets that encode joins and metric logic; metric contracts that define calculations, grain, and allowed usage; wikis and documentation that carry human context; labels that classify and describe datasets; data quality signals that tell an agent whether a dataset is trustworthy; and lineage that traces where data and metrics come from.

The point of this layer is to stop the agent from guessing. Instead of an agent inferring that `amount` means revenue and joining two tables in a way that fans out the total, the agent works against a virtual dataset where revenue is defined once, correctly, with the right filters and the right joins already encoded. The [semantic layer approach for agentic analytics](https://www.dremio.com/blog/agentic-analytics-semantic-layer/) describes building this from virtual datasets and views enriched with wikis, labels, and AI-generated metadata. The AI-generated metadata part is practically important: documenting a large data estate by hand never finishes, and an agent can only use context that has actually been written down. Generating first-draft documentation and metadata at scale is what makes broad semantic coverage achievable rather than aspirational.

Lineage deserves a specific mention because it is what makes agent answers trustworthy after the fact. When an agent reports a number, the follow-up question is always "where did that come from." Lineage that traces a metric back through its dimensions, its virtual datasets, and its source tables is the durable answer to that question. It lives in the Knowledge layer because it is metadata about meaning, not about storage.

The honest limitation, again, is coverage. The Knowledge layer only supplies meaning for the concepts it defines. It is an ongoing program, not a one-time build, because the business keeps generating new questions. What the layer buys you is that the modeling work is done once and reused by every consumer above it, rather than reinvented in every tool and every prompt. That reuse is the entire economic argument for the layer, and it is a strong one, but it does not make the work disappear.

## Layer 3: Agents

The Agent layer is where reasoning happens: task planning, reasoning loops, prompt templates, memory, evaluation, and tool selection. This is the layer people think of first when they hear "agentic," and it is deliberately placed third here, above Data and Knowledge, because an agent is only as good as the foundation it reasons over.

An agent in this model decomposes a goal into steps, decides which tools to call, calls them, reads results, and decides what to do next. Memory lets it carry context across steps. Evaluation, whether self-checks or external scoring, lets the system judge whether the agent's output is any good. Tool selection is the agent choosing, from a defined set, which capability to use for the current step.

The design principle that matters most here is the one that is easiest to violate: agents should operate against curated context and governed tools, not broad raw SQL by default. The temptation is to give the agent maximum flexibility, a general SQL tool and free rein, on the theory that a capable model will figure things out. That flexibility is exactly what produces the semantic and security failures from the top of this post. A well-designed Agent layer works against the Knowledge layer's defined metrics and datasets and the Tool layer's constrained actions. Raw SQL, if it is available at all, is a narrow, heavily governed fallback, not the default path.

Task boundaries belong here too. An agent should have a defined scope of what it is allowed to attempt. An analytics agent that is also somehow able to trigger production pipelines or modify data has a scope problem, and scope problems become incidents. Bounding what an agent tries is part of what makes it trustworthy, and it belongs in the Agent layer's design, reinforced by the Tool and Policy layers below and around it.

## Layer 4: Tools

The Tool layer is where the agent's intentions become specific, constrained capabilities. Instead of "the agent can do whatever it can express in SQL," the Tool layer offers a defined set of actions: query a metric, inspect lineage, validate data freshness, create a ticket, trigger a pipeline, request an approval. Each tool is a narrow door with a known shape.

A good tool definition specifies more than a name. It includes:

- **Parameters.** Exactly what the tool takes, with types, so the agent supplies structured input rather than free-form text that has to be parsed.
- **Limits.** Bounds on what the tool will do: maximum rows returned, maximum cost, allowed date ranges. A query tool that will happily scan a petabyte because an agent asked it to is a tool without limits, and it will eventually cost you.
- **Expected outputs.** The shape of what comes back, so the agent can reason about the result reliably.
- **Policy requirements.** What identity and permissions the tool requires, and whether it needs approval before it acts.

The reason this layer matters is that it converts open-ended risk into bounded, reviewable capability. A "query metric" tool that only resolves defined metrics from the Knowledge layer cannot produce a fan-out error, because it never generates raw joins. A "trigger pipeline" tool that requires approval cannot fire a production job unattended. Each tool is a place where you decide, in advance, what is allowed and what is not, and that decision is durable and auditable in a way that ad hoc SQL never is.

The [Model Context Protocol](https://modelcontextprotocol.io/) is the standard that has emerged for exposing tools to agents in a consistent way. MCP defines how an agent discovers available tools, understands their parameters, and calls them. Standardizing the tool interface matters because it means tools can be defined once and consumed by any MCP-capable agent, rather than every agent needing bespoke integrations. It also means the constraints you put on a tool travel with the tool, applying no matter which agent calls it.

The tradeoff at the Tool layer is between flexibility and safety, and it is a real tension. Narrow, well-defined tools are safe but only cover the actions you anticipated. An agent will eventually want to do something no tool covers. The disciplined answer is to add a reviewed tool for it, not to open a raw SQL escape hatch that undoes the layer's guarantees. That discipline is friction, and pretending it is not would be dishonest. It is the friction that keeps the system trustworthy.

## Layer 5: Policy

The Policy layer is different from the other four in an important way: it is not a layer in the stack so much as a wrapper around all of them. Identity, permissions, egress limits, action approvals, rate limits, and audit logs apply at every layer, not just at one point. Treating policy as a document that sits off to the side, disconnected from execution, is how governance becomes theater. Policy has to be enforced where the work happens.

What the Policy layer governs:

- **Identity.** Every action ties to an identity, whether a human, a service, or an agent acting on someone's behalf. Anonymous action is unauditable action.
- **Permissions.** Row-level and column-level access enforced where queries execute, so an agent cannot see what its identity is not allowed to see. This is the fine-grained access control that closes the security gap from the top of the post.
- **Egress limits.** Bounds on how much data can leave, so an agent cannot exfiltrate a table by asking for it a page at a time.
- **Action approvals.** Human-in-the-loop gates for consequential actions, so an agent proposes and a human confirms before a pipeline fires or data changes.
- **Rate limits.** Caps on how fast and how much an agent can query, so a reasoning loop that goes sideways does not become an unbounded cost or a denial-of-service against your own systems.
- **Audit logs.** A durable record of who did what, through which tool, against which data, for every layer. This is what makes the whole system reviewable after the fact.

The principle to hold onto is that policy wraps every layer rather than sitting as a disconnected governance document. Permissions enforced in the query engine at the Data layer, tool-level approval requirements at the Tool layer, identity threaded through the Agent layer, egress and rate limits spanning all of it, audit logs capturing everything. When policy is woven through the layers this way, the security and audit gaps from the top of the post close structurally, not by hoping everyone follows the rules.

## How the Layers Interact on a Single Request

The layers are easiest to trust when you watch a request pass through all five. Take a request an analyst makes to an agent: "Which product lines are trending down in enterprise accounts this quarter, and can you open a ticket for the sales lead to review?"

The Policy layer engages first and stays engaged. It resolves the analyst's identity and the agent's identity acting on their behalf, and it establishes what data this identity may see and what actions it may take. Everything that follows happens inside that boundary.

The Agent layer decomposes the goal. It recognizes two subtasks: an analytical question about trends, and an action to create a ticket. It plans to answer the question first, then decide whether the action is warranted, then act only if it is. This decomposition is the agent's reasoning, and it is bounded by the scope the agent was given, which does not include, say, modifying the underlying data.

For the analytical subtask, the agent selects a tool from the Tool layer: a query-metric tool. It does not write raw SQL. It calls the tool with parameters, a revenue-trend metric, a product-line dimension, an enterprise-account filter, and a this-quarter time window. The Tool layer's limits apply: the tool caps the rows and cost, so the agent cannot accidentally trigger a massive scan.

That tool resolves its meaning from the Knowledge layer. The revenue-trend metric is a defined contract; "enterprise account" is a defined segment; the fiscal quarter resolves against a known calendar. The Knowledge layer hands back correct, unambiguous logic, which the Data layer executes against governed, federated tables, with the Policy layer's row and column rules enforced in the engine so the agent sees only the enterprise accounts this identity is allowed to see.

The agent reads the result, identifies two declining product lines, and decides the ticket action is warranted. It reaches for a second Tool layer capability: create-ticket. That tool carries a policy requirement of human approval for consequential actions, so instead of firing blind, it surfaces the proposed ticket for the analyst to confirm. The analyst approves, the ticket is created, and the Policy layer's audit log records every step: who asked, which identity acted, which metrics were queried, which tables were read, and which action was taken with whose approval.

No step in that flow let the agent reconstruct business logic from schema, route around access control, or take an unattended consequential action. That is the five-layer pattern doing its job, and it is why the boundaries are worth the friction they add.

## The Layers Together

Described as a stack, with policy wrapping the whole thing:

```
+-------------------------------------------------------+
|  POLICY: identity, permissions, egress, approvals,    |
|          rate limits, audit  (wraps every layer)      |
|  +-------------------------------------------------+  |
|  |  AGENT: planning, reasoning, memory, evaluation |  |
|  +-------------------------------------------------+  |
|  |  TOOL: query metric, inspect lineage, validate  |  |
|  |        freshness, request approval (constrained)|  |
|  +-------------------------------------------------+  |
|  |  KNOWLEDGE: semantic models, metric contracts,  |  |
|  |             wikis, labels, lineage, quality     |  |
|  +-------------------------------------------------+  |
|  |  DATA: object storage, Iceberg, catalogs,       |  |
|  |        source systems, federation               |  |
|  +-------------------------------------------------+  |
+-------------------------------------------------------+
```

The agent reasons, but it reasons through tools; the tools resolve meaning from the knowledge layer; the knowledge layer describes governed data; and policy applies at every boundary. Each arrow from top to bottom is a place where open-ended risk gets narrowed into something defined and reviewable.

## Checklist for Your Current Architecture

Run these questions against what you have. Honest answers tell you where the gaps are.

**Data layer**
- Is your high-value analytical data in open table formats with a clear authoritative copy, or scattered across replicas nobody fully trusts?
- Can agents reach data across sources through federation, or only what has been loaded into one store?
- Is table maintenance (compaction, snapshot cleanup) handled, or quietly degrading performance?

**Knowledge layer**
- Are your key metrics defined once in a semantic layer, or reinvented per tool?
- Is there durable documentation and metadata agents can actually use, or is the meaning only in people's heads?
- Can you trace lineage from a reported number back to its sources?

**Agent layer**
- Do agents work against curated context and defined tools, or against broad raw SQL by default?
- Does each agent have a bounded scope of what it is allowed to attempt?

**Tool layer**
- Are agent capabilities exposed as defined tools with parameters, limits, and expected outputs?
- Do consequential tools require approval before they act?
- Are tools exposed through a standard interface like MCP, or bespoke per agent?

**Policy layer**
- Is row and column access enforced in the engine that runs queries, so agents cannot route around it?
- Are there egress limits, rate limits, and audit logs covering agent activity?
- Is policy enforced where work happens, or written down in a document nobody's execution path touches?

If most answers land on the wrong side, that is not a failure. It is a map. The layers give you an order to work in: shore up the Data and Knowledge layers first, because they are the foundation the Agent and Tool layers reason over, and thread Policy through as you go.

## Where Dremio Fits, and Where It Does Not

Being straight about scope: no single product is all five layers, and any vendor claiming to be one is overselling. The five-layer pattern spans data platforms, agent frameworks, workflow systems, and governance tooling.

Where Dremio maps naturally is the bottom two layers, the ones everything else stands on. It covers the Data layer as a unified lakehouse on open standards, Apache Iceberg, Apache Arrow, and Apache Polaris, with a federated query engine that reaches sources in place. It covers much of the Knowledge layer through its semantic layer of virtual datasets, wikis, labels, and AI-generated metadata, with lineage and governed access built in. It reaches into the Tool and Policy layers too: an open-source MCP server exposes governed data and semantic definitions as tools, and fine-grained access control enforces row and column policy in the engine where queries run, which is exactly where the Policy layer needs it.

What Dremio does not do is own your agent framework, your approval workflows, or your broader enterprise governance program. Those complete the pattern, and they should. The honest position is that a strong Data and Knowledge foundation is where agentic analytics succeeds or fails, because it is the context and access the agent reasons over. The model at the top gets the attention; the foundation at the bottom does the work. Get the bottom layers right on open standards, and the layers above have something trustworthy to stand on.

If you are designing the Data and Knowledge layers your agents will run on, the useful next step is to build a governed semantic view over open tables and expose it through MCP. You can start with a free Dremio account at [dremio.com/get-started](https://www.dremio.com/get-started), model a metric over federated data, and connect an agent to it, then walk your result up through the checklist above to see which layers you have covered and which still need work.
