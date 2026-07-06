---
title: "Preparing Your Data Lakehouse for the EU AI Act: Auditable Lineage and Data Provenance"
date: "2026-07-06"
description: "![Layered papercut provenance chain from source systems through Iceberg tables to AI tools](./diagram-1.png)"
canonical: https://iceberglakehouse.com/posts/eu-ai-act-data-lakehouse-lineage-provenance-compliance/
author: "Alex Merced"
category: "Lakehouse"
tags:
    - apache iceberg
    - data lakehouse
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/eu-ai-act-data-lakehouse-lineage-provenance-compliance/).



The EU AI Act changes the conversation around AI architecture because it makes trust operational. It is not enough to say that an AI system is useful, accurate, or monitored. For many use cases, especially those that fall into high-risk categories, organizations need a way to explain how data is governed, how systems are documented, how activity is logged, how human oversight works, and how accuracy, robustness, and cybersecurity are addressed.

This is technical guidance, not legal advice. The legal interpretation belongs with counsel and compliance teams. The point I want to focus on is the data architecture implication: if an organization cannot explain where data came from, how it changed, who touched it, what logic shaped it, and how an AI workflow consumed it, then AI governance becomes a meeting exercise instead of an engineering capability.

That is where the modern lakehouse matters. Open table formats, catalog metadata, semantic layers, query logs, access controls, lineage systems, and agent-facing tool contracts can turn compliance readiness from a spreadsheet into a living platform capability. The goal is not to create paperwork after the fact. The goal is to build a data foundation where evidence is generated as part of normal analytical and AI operations.

For teams building toward agentic analytics, this is even more important. A dashboard user may run a handful of queries a day. An analytical agent may run many queries, inspect intermediate results, call tools, compare metrics, and recommend actions. That raises the standard for auditability. The platform needs to know not only what data exists, but what path each answer traveled.

![Layered papercut provenance chain from source systems through Iceberg tables to AI tools](/images/2026/week-2026-07-06/eu-ai-act-data-lakehouse-lineage-provenance-compliance-diagram-1.png)

## Why the AI Act is a data platform issue

The EU AI Act is a regulatory framework for AI systems in the European Union. It uses a risk-based structure, with stricter requirements for high-risk systems. The exact impact on any organization depends on role, jurisdiction, use case, and deployment context, but the data platform concerns are clear. High-risk AI systems place pressure on documentation, logging, data governance, transparency, human oversight, accuracy, robustness, and security.

Those words may sound like policy language, but each one maps to concrete platform design choices.

Technical documentation needs more than architecture diagrams. It needs traceable descriptions of datasets, transformations, features, metrics, model inputs, evaluation data, and runtime behavior. Logging needs more than application logs. It needs query history, identity context, access decisions, tool calls, model prompts where appropriate, model outputs where retained, and state transitions. Data governance needs more than a role matrix. It needs enforceable policies across physical tables, views, semantic definitions, and agent tools.

The hard part is not writing a policy that says these things matter. The hard part is making them true every day.

Many organizations have built AI workflows on top of fragmented data estates. Data moves from source systems into object storage, then into warehouses, then into extracts, then into feature stores, then into notebooks, then into vector databases, then into application-specific caches. Each hop may have a different access model, metadata model, retention policy, and audit log. When something goes wrong, the team reconstructs history manually.

That may be tolerable for experimental analytics. It is a weak foundation for governed AI.

The lakehouse pattern is compelling because it lets teams consolidate analytical data around open storage, open table formats, governed catalogs, and shared execution paths. The strongest versions of this pattern avoid treating the lake as a passive file dump. They make the lakehouse an active control plane for data quality, access, lineage, semantics, and AI consumption.

## Provenance starts before the table

Provenance answers a basic question: where did this data come from? For AI systems, the answer needs to be specific. It is not enough to say “customer data” or “transaction data.” A useful provenance record identifies the source system, extraction method, ingestion time, source schema, data owner, quality checks, transformation logic, and target table snapshot.

That last phrase matters. In a lakehouse, the physical data and table metadata can change over time. A model evaluation, agent answer, or business decision may depend on the version of a table that existed at a particular moment. If the platform only records the current table state, it cannot explain historical behavior.

Open table formats such as Apache Iceberg are useful because they make table evolution explicit. Snapshots, manifests, schema evolution, partition evolution, and metadata files provide a structured record of table state. That does not automatically create a complete compliance program, but it gives the platform an excellent technical substrate for reproducibility.

If an agent answered a question using a particular table snapshot, a well-designed lakehouse should be able to retain the relevant context:

- The catalog and table identifier.
- The snapshot or commit referenced by the query.
- The schema visible at query time.
- The identity or service principal that initiated the request.
- The policy decisions applied before data was returned.
- The semantic definition or view used by the tool.
- The downstream action, if the result triggered one.

This turns provenance from folklore into evidence.

The same discipline should apply before data reaches the lakehouse. Ingestion pipelines should record source offsets, file hashes, batch identifiers, change data capture positions, and validation outcomes. When a source field is renamed, recoded, masked, or dropped, that should be captured as part of the data contract. If data arrives through third-party feeds, the platform should track vendor, license, allowed use, refresh schedule, and any restrictions on model training or automated decisioning.

AI governance often fails because the training and inference data is described too loosely. A provenance-first lakehouse makes that harder to do. It creates pressure to name the data, version the data, and preserve the journey.

## Lineage connects governance to impact

Provenance tells us where data originated. Lineage tells us how it moved and changed. Both matter, but lineage is the bridge from raw data to business consequence.

In an AI-ready lakehouse, lineage should cover at least four layers.

The first layer is physical lineage. This includes source tables, raw zones, curated tables, derived datasets, snapshots, schema changes, and transformation jobs. Physical lineage helps answer questions such as “Which downstream datasets used this column?” and “Which AI workflow might be affected if this source system sent invalid values yesterday?”

The second layer is semantic lineage. This includes metrics, dimensions, business entities, calculations, filters, joins, row-level constraints, and certified views. Semantic lineage helps answer a different kind of question: “Which business definition of revenue did this agent use?” or “Did two tools use the same definition of active customer?”

The third layer is model and agent lineage. This includes prompt templates, retrieval sources, feature inputs, tool calls, query plans, policy decisions, and generated outputs. This is where agentic analytics raises the standard. If an autonomous workflow observes an anomaly, runs follow-up queries, validates the pattern, and opens an operational ticket, the lineage graph should show that chain.

The fourth layer is decision lineage. This connects analytical output to action. Did the system only summarize data for a human reviewer? Did it recommend an action? Did it call an external API? Did a human approve the step? Was the action reversed later? In regulated environments, these distinctions matter.

![Layered papercut lineage map across raw, curated, semantic, and model-facing lakehouse layers](/images/2026/week-2026-07-06/eu-ai-act-data-lakehouse-lineage-provenance-compliance-diagram-2.png)

The reason I like framing this through the lakehouse is that it puts lineage near the data, not only inside a separate governance tool. Governance catalogs, lineage systems, and documentation platforms are important, but they work best when the underlying architecture produces strong signals. Query engines should emit meaningful history. Catalogs should know table versions and policies. Semantic layers should expose business meaning in machine-readable form. Orchestrators should record job context. AI tools should carry identity and purpose through each request.

When those signals exist, governance tools can assemble a faithful map. When they do not exist, governance tools become annotation systems that people have to maintain by hand.

## The problem with fragmented AI data paths

The fastest way to make AI governance hard is to let every team build its own private data path. One team reads directly from object storage. Another copies data into a warehouse. Another exports CSV files for model experiments. Another creates embeddings from a stale extract. Another wraps a text-to-SQL tool around a production database. Each path may be reasonable in isolation, but collectively they create a foggy estate.

That fragmentation causes several problems.

First, access control becomes inconsistent. A user may be blocked from a sensitive column in one system but able to retrieve the same value from an extract or derived dataset elsewhere. AI agents make this worse because they can combine tools quickly and find indirect paths to sensitive facts.

Second, definitions drift. The customer count in the warehouse may differ from the customer count in the semantic layer, which may differ from the feature table used by a model. Once agents start reasoning over those definitions, small semantic differences become operational risk.

Third, lineage breaks. The organization may know where a raw table came from, but lose visibility once the data is copied into a notebook, cache, or application-specific store. That makes investigations slow and weakens confidence in AI outputs.

Fourth, cost and performance tuning become disconnected from governance. Teams create copies to improve speed, but each copy adds another object to secure, document, validate, and retire.

The answer is not to ban every specialized system. Modern AI stacks will still use vector indexes, feature stores, orchestration systems, observability platforms, and application services. The better goal is to make the lakehouse the governed system of record for analytical data and to ensure every downstream system can trace back to it.

This is where an Agentic Lakehouse approach becomes attractive without needing a hard sales pitch. The architecture says: keep data open, governed, versioned, queryable, and semantically understandable at the foundation, then let agents and applications consume that foundation through controlled interfaces. That is a practical response to both innovation pressure and compliance pressure.

## What auditability should look like

Auditability is often treated as a log retention problem. Logs matter, but auditability is broader. A useful audit trail should let a reviewer reconstruct the path from source data to decision with enough detail to understand what happened.

For a lakehouse supporting AI systems, I would want auditability across these areas:

- Data ingestion: source, time, method, validation result, and responsible pipeline.
- Table state: snapshot, schema, partitioning, files, manifests, and retention policy.
- Transformations: job identity, code version, input tables, output tables, and quality checks.
- Semantic access: metric definition, view definition, filters, joins, and approved business context.
- Identity: human user, service account, agent identity, delegated authority, and session context.
- Policies: row filters, column masks, purpose restrictions, and denied access attempts.
- Queries: query text, execution context, referenced tables, result sensitivity, and runtime metadata.
- Agent behavior: tool calls, intermediate steps, validation checks, human approvals, and external actions.

This list can sound heavy, but much of it can be captured automatically if the architecture is designed with observability in mind. The wrong pattern is asking developers to write manual compliance summaries after every workflow. The right pattern is making the platform emit evidence as part of normal operation.

The semantic layer is especially important here. AI agents do not only need data access. They need meaning. If a tool exposes a raw table with hundreds of columns, the agent has too much room to infer incorrectly. If the tool exposes governed metrics, documented entities, accepted filters, and approved relationships, the agent operates inside a more reliable frame.

That is why I keep coming back to semantic context as a core lakehouse layer. It is not just a nicer way for humans to query data. It is the contract between business meaning and machine action.

## Human oversight needs platform hooks

The EU AI Act places importance on human oversight for relevant AI systems. From a platform perspective, the key lesson is that oversight cannot be bolted on as a vague approval step. It needs hooks in the workflow.

Consider an agent that monitors supply chain risk. It detects a pattern, checks supplier metrics, compares recent delivery data, and recommends changing inventory allocation. A weak oversight design sends a summary to a human with little context. A stronger design shows the source tables, metric definitions, relevant snapshots, confidence limits, policy constraints, and recommended action. It also records who approved, changed, or rejected the recommendation.

The lakehouse can support this by making context retrievable. The approval interface should not have to guess which data was used. It should be able to call back into the platform and retrieve the evidence chain. That requires stable table identifiers, retained snapshots, consistent semantic definitions, and query history.

This is also where open architecture helps. If the evidence trail depends entirely on a closed application layer, the organization may struggle to validate or migrate it later. Open table formats and open metadata practices make the evidence more durable. They also make it easier for governance, observability, and compliance teams to inspect the system without being trapped behind one application surface.

## Accuracy and robustness begin with data contracts

AI accuracy is often discussed at the model layer, but many production failures start in the data layer. A source system changes a code. A pipeline silently drops late-arriving records. A metric excludes a segment after a schema change. A feature table contains stale values. An agent receives a partial view because a permission rule changed. The model may be doing exactly what it was asked to do, while the data context has become unreliable.

Lakehouse teams can reduce this risk with explicit data contracts.

A data contract should define the expected schema, freshness, allowed values, quality thresholds, ownership, and downstream usage. For AI workloads, it should also capture whether the dataset can be used for training, evaluation, retrieval, automated decisioning, or only human-reviewed analytics. These distinctions matter because the same dataset may be appropriate for one AI use case and inappropriate for another.

Contracts should be enforced where possible. Schema evolution should be tracked. Quality checks should run before data is promoted. Breaking changes should notify downstream owners. Agent tools should refuse to serve datasets that fail freshness or quality requirements. When a dataset is deprecated, the platform should know which semantic views, tools, and workflows depend on it.

This is another reason table formats and catalogs matter. A lakehouse built on object storage alone has files. A lakehouse built with table metadata, catalog governance, semantic contracts, and query observability has a control plane.

## Security for AI agents is identity design

AI agents should not run as one powerful system account. That pattern is convenient at first and dangerous later. If every agent request looks like the same super-user, the platform cannot distinguish intent, enforce fine-grained permissions, or explain who did what on whose behalf.

A better design gives agents explicit identities and scopes. An agent should have a role, allowed tools, allowed datasets, allowed actions, and purpose constraints. When an agent acts for a human, the platform should record both the agent identity and the delegated human context. When an agent calls a tool, the tool should enforce policy at execution time rather than trusting that the agent made the right choice.

For sensitive data, this means row-level filters, column-level masking, token controls, and policy-aware semantic views. It also means logging denied attempts, not only successful access. Denied requests are useful signals. They show where agents are reaching beyond their intended authority and where tool descriptions may need tightening.

Security also intersects with provenance. If a model answer includes a sensitive fact, the platform should be able to determine which dataset and policy path exposed it. Without that trace, incident response becomes guesswork.

## The Dremio-positive architecture without the marketing fog

The most durable message here is not “buy a compliance feature.” It is that AI governance favors architectures where data remains open, governed, versioned, and close to shared semantic context.

That naturally points toward the lakehouse direction. When data lives in open formats, organizations preserve optionality. When catalogs and query engines enforce consistent access, organizations reduce shadow data paths. When semantic layers define business meaning, agents have a better chance of producing correct answers. When query history, lineage, and table snapshots are available, compliance teams can work with evidence instead of memory.

Dremio’s Agentic Lakehouse narrative fits this market direction because it emphasizes governed access to open lakehouse data, semantic understanding, and AI-ready interaction patterns. The important phrasing is support, not substitute. A platform can support compliance readiness. It cannot replace legal analysis, organizational governance, model risk management, or domain-specific controls.

That distinction is useful because it keeps the conversation honest. The value of an Agentic Lakehouse is not that it makes regulation disappear. The value is that it gives data teams a coherent place to implement the controls that regulation increasingly expects.

## A practical readiness checklist

If I were helping a data team prepare its lakehouse for AI governance and EU AI Act readiness, I would start with a checklist like this.

First, inventory AI-facing datasets. Identify which tables, views, feature sets, metrics, document stores, and embeddings are used by AI systems. Include experiments if they influence production decisions.

Second, map sources to table snapshots. For each important dataset, capture source system, ingestion path, validation checks, ownership, retention, and table version history.

Third, define semantic contracts. Name business entities, metrics, filters, joins, and allowed use cases. Do not make agents infer the business model from raw table names.

Fourth, separate human, service, and agent identities. Avoid shared super-user credentials. Record delegation when agents act on behalf of people.

Fifth, retain query and tool-call evidence. Store enough context to reconstruct how an answer or action was produced.

Sixth, connect lineage across layers. Physical lineage, semantic lineage, model lineage, and decision lineage should be connected, even if different systems capture different parts.

Seventh, enforce quality gates. AI tools should know when data is stale, incomplete, restricted, or failing validation.

Eighth, design human review points with evidence. Approval workflows should expose the data path, not only the final recommendation.

Ninth, test incident response. Pick a table, column, model answer, or agent action and see how quickly the team can reconstruct what happened.

Tenth, keep documentation close to execution. Documentation that drifts from the platform will fail when scrutiny arrives.

![Layered papercut control plane for compliance-ready Agentic Lakehouse governance](/images/2026/week-2026-07-06/eu-ai-act-data-lakehouse-lineage-provenance-compliance-diagram-3.png)

## The real goal: explainable operations

Regulation tends to expose architectural truth. If a data platform is fragmented, undocumented, and dependent on copy-heavy workflows, AI governance will be painful. If the platform already captures provenance, lineage, access context, semantic meaning, and operational evidence, compliance work becomes more grounded.

That does not make the work easy. It does make it possible.

The lakehouse has always been about more than cheaper storage. Its deeper promise is architectural clarity: data in open formats, governed by shared metadata, queried by multiple engines, and made understandable through semantic context. In the AI era, that clarity becomes a prerequisite for trustworthy automation.

As agents become more capable, the systems around them need to become more accountable. A useful agentic data platform should answer not only “What is the metric?” but “Which data produced this metric, which definition was used, which policies applied, who requested it, and what action followed?”

That is the standard I would build toward. Not because a single regulation says so, but because serious AI systems need serious data foundations.

For more of my thinking on data lakehouse and AI architecture, explore my books at [books.alexmerced.com](https://books.alexmerced.com). To try a modern Agentic Lakehouse experience, visit [dremio.com/get-started](https://www.dremio.com/get-started).
