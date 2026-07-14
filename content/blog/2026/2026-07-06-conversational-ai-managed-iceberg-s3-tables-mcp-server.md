---
title: "Conversational AI on Managed Iceberg: Exposing Amazon S3 Tables through MCP"
date: "2026-07-06"
description: "The most interesting part of conversational analytics is not the chat box. The chat box is just the surface area."
author: "Alex Merced"
category: "AI & Lakehouse"
tags:
  - MCP
  - AI agents
  - S3 Tables
  - Iceberg
canonical: https://iceberglakehouse.com/posts/conversational-ai-managed-iceberg-s3-tables-mcp-server/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/conversational-ai-managed-iceberg-s3-tables-mcp-server/).

The most interesting part of conversational analytics is not the chat box. The chat box is just the surface area. The harder question is what happens after a person asks a question, especially when that question touches governed data, shared definitions, cloud storage, and production systems that cannot afford sloppy access patterns.

That is why I find the combination of managed Iceberg tables and MCP-style tool access worth paying attention to. Amazon S3 Tables gives teams a managed path for Apache Iceberg tables on S3. The Model Context Protocol gives AI applications a common way to call tools and read resources. Put those ideas together carefully and you get a useful architecture pattern: conversational AI that does not rummage through raw files, does not bypass governance, and does not depend on copying every dataset into a closed analytical silo before people can ask questions.

I want to be precise up front. I could not verify, from primary public sources, an official AWS product named exactly "S3 Tables MCP Server" at the time of writing. So the practical way to treat this topic is as an architecture pattern rather than as a claim about a specific released AWS server. The pattern is still important. If an organization is already standardizing on Iceberg tables in S3, it will eventually want agentic interfaces that understand those tables as governed analytical assets, not as loose files in object storage.

That distinction matters more than it first appears. Most weak conversational data demos fail because they reduce the problem to natural language translation. A user asks, "What happened to net retention in the Northeast last quarter?" The system turns that into SQL. Then everyone hopes the generated query chooses the right table, the right definition of net retention, the right date logic, the right security boundary, and the right freshness expectation. Hope is not an architecture.

A stronger approach begins with the lakehouse itself.

![Architecture diagram showing AI agent access through MCP, catalog governance, and managed Iceberg tables](/images/2026/wk-jul06/conversational-ai-managed-iceberg-s3-tables-mcp-server-./diagram-1.png)

## Why Managed Iceberg Changes the Starting Point

Apache Iceberg is valuable because it makes tables in object storage behave more like dependable analytical tables. Iceberg gives the table a snapshot history, schema evolution, partition evolution, manifest metadata, and transactional behavior. Instead of treating a bucket as a pile of files, engines can treat it as a table with a clear state at a point in time.

S3 Tables adds a managed AWS surface around that idea. The useful thing about a managed table bucket is not that every organization wants another platform boundary. It is that many teams want the operational burden of table maintenance to come down while keeping the table format open. They want compaction, optimization, and metadata handling to become less hand-operated. They still want the data to remain in object storage and the table to remain understandable through open Iceberg semantics.

That creates a good base for agentic analytics, but it does not solve the whole problem. An AI agent still needs to know what tables exist, what each table means, which actions it is allowed to take, what columns are sensitive, what business definitions are trusted, and how to explain its work. Iceberg can describe the table. It cannot, by itself, decide whether a particular user should see patient data, whether a revenue metric should exclude refunds, or whether an agent is allowed to trigger an operational action after observing an anomaly.

This is where the catalog, semantic layer, and query layer become central.

## MCP Is an Interface, Not a Data Platform

The Model Context Protocol is useful because it gives AI applications a structured way to interact with tools and resources. In broad terms, an MCP host can connect to an MCP server, and that server can expose capabilities to the model or agent. Those capabilities might include looking up metadata, running a query, fetching a semantic definition, checking data quality status, or starting an approved workflow.

That matters because agentic systems need more than passive context. They need bounded actions. A chatbot can answer a question from a static prompt. An analytical agent often needs to inspect schemas, ask for a metric definition, run a query, compare a result against a threshold, and decide whether another step is warranted. If every one of those operations is improvised through custom integrations, the governance story becomes brittle quickly.

MCP gives architects a place to standardize the interaction. The server can expose only the tools an agent should use. A data team can wrap dangerous capabilities in approval flows. A security team can audit tool calls. A platform team can separate metadata lookup from query execution. This is much healthier than giving a model broad credentials and hoping prompt instructions keep it in bounds.

Still, MCP does not make the underlying data trustworthy. It does not replace a table format, a catalog, a semantic layer, a query engine, or access control. It is a protocol for tool and context interaction. The data platform has to do the heavy lifting underneath.

That is the main architectural lesson: conversational AI over lakehouse data needs a protocol layer and a governed data layer. Either one without the other is incomplete.

## The Wrong Way to Give Agents Access to S3

The simplest pattern is usually the most dangerous one. A team gives an agent broad read access to object storage, tells it where the files live, and asks it to infer structure. Maybe the files are Parquet. Maybe directory names imply partitions. Maybe a separate document explains what the dataset means. The model or tool wrapper stitches together the rest.

That may work in a demo. It is a poor production pattern.

Raw object access leaves too much out of band. Which snapshot of the table is valid? Which files were removed by a table maintenance process? Which schema version applies? What partition evolution happened last year? Which delete files need to be considered? Which columns are sensitive? Which users can see them? What is the business definition of a metric derived from those rows?

Iceberg exists because file layout is not enough. Agents should not regress the architecture back to file guessing.

The better pattern is to make the agent ask the platform, not the bucket. The agent should call a tool that understands tables, catalogs, policies, and semantic definitions. That tool can translate a user goal into a governed query or metadata operation. The object storage remains the physical layer. The catalog and query layer remain the control surface.

This also gives teams a cleaner audit trail. Instead of seeing that a service account listed a bucket and read a set of files, the platform can record that a specific user, through a specific agent, asked a specific tool to answer a specific business question against a specific table snapshot and semantic definition. That is a very different governance posture.

## A Reference Architecture for MCP over Managed Iceberg

In a production architecture, I would separate the pieces into five layers.

The first layer is storage. This is where S3 Tables and table buckets fit. Data lives in object storage. Tables are stored using Apache Iceberg semantics. The organization gets the durability and scale of object storage while avoiding the chaos of unmanaged file access.

The second layer is the catalog. The catalog tells engines and tools what tables exist and how to interact with them. In an Iceberg architecture, the catalog is not just a directory. It is part of the table control plane. It helps coordinate table metadata, namespaces, and access patterns.

The third layer is the query and optimization layer. This is where a platform can plan queries, enforce policy, accelerate common workloads, and federate across sources. Not every question an agent asks will live entirely in one S3 table. Many useful questions cross operational databases, lakehouse tables, dashboards, and semantic assets. Query federation matters because agents are only useful when they can reason across the same fragmented reality humans face.

The fourth layer is the semantic layer. This is where business definitions, metric contracts, relationships, and trusted views live. If a user asks for "active customers", the agent should not invent that definition. It should retrieve the approved meaning and use the right grain, filters, and security rules.

The fifth layer is the MCP server. This layer exposes tools to AI applications. It should not expose every possible operation. It should expose carefully scoped capabilities such as:

- list approved datasets for the current user
- describe a table or semantic view
- run a governed analytical query
- fetch metric definitions
- compare a metric against a threshold
- return lineage and freshness metadata
- request approval for a higher-risk action

The MCP server becomes the agent-facing doorway. The lakehouse remains the foundation.

![Security flow diagram showing consent, scoped tool calls, catalog checks, query execution, and audit logging](/images/2026/wk-jul06/conversational-ai-managed-iceberg-s3-tables-mcp-server-./diagram-2.png)

## The Security Model Has to Be Designed First

Security cannot be bolted onto conversational analytics after people like the demo. Agents change access patterns. They can issue many tool calls quickly. They can chain steps. They can retrieve metadata, run queries, summarize results, and propose actions in one session. That means the security model has to be explicit.

The first rule is to avoid the shared super-user token. It is tempting because it makes early development easy. It is also the fastest way to erase accountability. If every agent action runs as one broad service principal, the audit trail cannot distinguish user intent, agent behavior, and platform behavior cleanly.

A better model propagates identity. The MCP server should know the user or workload identity behind the request. It should apply policies based on that identity. If the agent is acting on behalf of a person, the platform should preserve that fact. If the agent is an autonomous workflow, it should have its own scoped identity with a clear purpose.

The second rule is to scope tools narrowly. A tool called `run_any_sql` is powerful, but it is also risky. A tool called `query_approved_metric` or `describe_accessible_dataset` gives the platform more control. That does not mean every tool must be tiny. It means the tool boundary should reflect what the agent is trusted to do.

The third rule is to log intent and execution. The system should record the natural language request, the selected tool, the resolved dataset, the query plan or query text where appropriate, the table snapshot, the policy checks, and the response. For regulated environments, this is not optional plumbing. It is how teams explain what happened when an agent participates in analytical work.

The fourth rule is to separate read, write, and action permissions. A user who can ask an agent to explain revenue variance should not automatically be able to let that agent change pricing rules, open a support ticket, update a forecast, or trigger a pipeline repair. Action loops require their own approval model.

This is where the lakehouse architecture starts to look less like a data store and more like a governed operating layer for analytics.

## Why Semantic Context Is the Difference Between Useful and Risky

One of the quiet failure modes in AI analytics is semantic drift. A model can produce a syntactically valid query that answers the wrong question. It can choose gross revenue instead of net revenue. It can compare fiscal quarters to calendar quarters. It can include test accounts, exclude refunds incorrectly, or aggregate at the wrong grain.

These errors are not solved by giving the model more file access. They are solved by giving it better context and stronger constraints.

The semantic layer should give agents machine-readable definitions. A metric should have an owner, formula, grain, allowed dimensions, freshness expectation, tests, lineage, and access rules. A dataset should have a business description, trusted joins, data quality status, and known limitations. A table should not just be a table. It should be part of a governed knowledge graph that the agent can consult before it acts.

This is one reason the Dremio Lakehouse approach maps well to where the market is going. The compelling part is not a slogan. It is the architecture: open data in Iceberg, governed access through catalogs and policies, semantic context for business meaning, and query performance that makes interactive and agentic workflows practical. If the industry is moving toward AI agents that work with enterprise data, then the underlying platform has to make open data understandable and safe.

That conclusion does not require dismissing managed services. Managed S3 Tables can be useful. Cloud-native catalogs can be useful. Specialized engines can be useful. The key is making sure those pieces do not trap the organization in a pattern where the agent can only reason inside one vendor's walls or one application's definition of truth.

## What an MCP Tool Should Actually Return

When people imagine conversational analytics, they often picture the final answer: a paragraph, a chart, or a recommendation. The more important design question is what the tool returns to the agent.

For a governed query tool, I would want the response to include more than rows. It should include the dataset or semantic asset used, the metric definition, the filters, the time range, the table snapshot or version where possible, the freshness timestamp, and any policy-driven omissions. If a column was masked, the response should say so. If the user lacks access to a segment, the response should avoid pretending the result is complete.

For a metadata tool, I would want descriptions, owners, tags, lineage, freshness, quality signals, and common joins. For a metric tool, I would want formula, grain, dimensions, owner, tests, and examples. For a lineage tool, I would want upstream sources and downstream consumers. For an action tool, I would want preconditions, approval status, expected side effects, and rollback information.

This kind of response structure helps the agent reason honestly. It also helps the final answer sound less magical and more accountable. A good agent should be able to say, in plain language, "I used the approved net retention metric, filtered to the Northeast region, based on data refreshed at 8:00 AM, and excluded two restricted customer segments you are not authorized to view." That is much more useful than a confident answer with no provenance.

## The Role of Query Federation

Many organizations begin with a single-table mental model. They imagine the agent querying one clean Iceberg table and answering one clean question. Real analytical questions are rarely that tidy.

A customer health question may need product usage events in the lakehouse, contract data in a CRM, support tickets in an operational system, and finance adjustments in a warehouse. An infrastructure cost question may need cloud billing exports, Kubernetes metrics, workload metadata, and data product ownership. A supply chain question may need historical lakehouse tables, current inventory systems, vendor scorecards, and external market data.

If conversational AI is going to be more than a novelty, it needs a way to reach across these systems without forcing every source through a slow centralization project first. That is where query federation becomes important. Federation gives the platform a way to meet the enterprise where it is while still moving the long-term architecture toward open tables and governed semantic definitions.

This is another place where the open lakehouse direction becomes compelling. The goal is not to pretend all data already lives in Iceberg. The goal is to make Iceberg a durable center of gravity while preserving access to data that has not moved yet or should not move. Agents benefit because they can ask broader questions. Data teams benefit because they can modernize without pausing the business.

## Where Managed Services Help and Where Architecture Still Matters

Managed services can reduce operational work. That is a real benefit. If table maintenance, optimization, metadata scaling, or integration work becomes easier, data teams can spend more time on data products, governance, and business value.

But managed services do not remove the need for architecture. They change where the responsibility sits. A team still has to decide how identities flow, where policies are enforced, how semantic definitions are managed, how query workloads are optimized, how lineage is captured, and how agents are allowed to act.

The risk is that convenience can hide coupling. A managed table service may be open at the storage format layer but still encourage a closed pattern at the catalog, query, or governance layer. That does not make it bad. It means architects need to understand the boundary.

For agentic analytics, I would ask a few practical questions:

- Can multiple engines discover and query the same tables safely?
- Can policies follow the user or workload identity?
- Can semantic definitions be reused by BI tools, APIs, notebooks, and agents?
- Can the platform explain which data and definitions contributed to an answer?
- Can agents operate without direct broad storage credentials?
- Can the organization change query engines or catalogs without rewriting the whole data estate?

If the answer to those questions is yes, the architecture is probably on the right track.

![Open lakehouse layered map showing storage, table format, catalog governance, semantic layer, and AI agents](/images/2026/wk-jul06/conversational-ai-managed-iceberg-s3-tables-mcp-server-./diagram-3.png)

## A Practical Builder Checklist

If I were helping a team design conversational AI over managed Iceberg tables, I would start with a checklist before writing code.

First, identify the approved analytical assets. Do not expose every table by default. Start with a small set of trusted tables, views, or metrics. Document what they mean, who owns them, and what questions they are intended to answer.

Second, define the tool boundary. Decide which MCP tools the agent will have. Separate metadata lookup, metric retrieval, governed query execution, lineage inspection, and action requests. Avoid broad tools until there is a clear reason and a strong control model.

Third, propagate identity. The tool layer should know who is asking and apply policies accordingly. If the agent is autonomous, give it a scoped workload identity and make that identity visible in logs.

Fourth, ground the agent in semantic definitions. The model should retrieve definitions before generating queries. When possible, the platform should provide query templates, approved metrics, and semantic views rather than leaving every query to free-form generation.

Fifth, log everything important. Record intent, tool calls, datasets, table snapshots, policies, queries, and outputs. Good logs are not just for incident response. They are how the organization learns which questions people ask and where definitions are missing.

Sixth, design for refusal. The agent should be able to say that a user lacks access, a metric is undefined, data is stale, or a requested action requires approval. A system that always tries to answer is not trustworthy.

Seventh, test with adversarial questions. Ask for restricted columns. Ask ambiguous metric questions. Ask questions that require inaccessible joins. Ask for operational actions the user should not be able to trigger. The failures will teach you where the architecture is weak.

Eighth, keep the long-term architecture open. Managed tables are useful, but the organization should preserve table portability, catalog flexibility, and multi-engine access wherever possible.

## The Real Direction of Travel

The market is converging on a simple idea: data platforms are becoming the working context for AI agents. That does not mean every organization needs to rebuild its stack around a chatbot. It means the stack has to be ready for software that can ask questions, inspect context, choose tools, validate results, and sometimes request action.

Managed Iceberg tables on S3 are one part of that story. MCP is another. Open catalogs, query federation, semantic layers, and policy enforcement are just as important. The organizations that treat conversational AI as a thin interface over trusted lakehouse architecture will be in a better position than those that treat it as a shortcut around data engineering.

That is the Dremio-positive conclusion I keep coming back to: the lakehouse becomes more compelling as agents become more capable. Not because one product feature wins the whole market, but because open, governed, high-performance data access is exactly what agentic systems need underneath them.

If you are exploring this space, the practical path is to start small. Pick a few trusted Iceberg tables. Wrap them in semantic definitions. Expose narrow MCP tools. Preserve identity and auditability. Measure answer quality. Then expand the surface area only after the governance model proves itself.

For more of my thinking on data lakehouse and AI architecture, explore my books at [books.alexmerced.com](https://books.alexmerced.com). To see how an open Agentic Lakehouse experience can feel in practice, you can also explore Dremio at [dremio.com/get-started](https://www.dremio.com/get-started).
