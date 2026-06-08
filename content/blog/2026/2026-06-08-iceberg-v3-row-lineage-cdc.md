---
title: "CDC Without Complexity Using Iceberg v3 Row Lineage"
date: "2026-06-08"
description: "Row lineage gives Iceberg a native way to tell incremental consumers which rows changed and when they changed."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - "Iceberg v3"
  - "row lineage"
  - "CDC"
  - "change data capture"
---

Row lineage gives Iceberg a native way to tell incremental consumers which rows changed and when they changed. That is the useful lens for Iceberg v3 row lineage in June 2026. The market is not short on announcements. What matters is whether the new pattern changes ownership, performance, governance, and agent readiness in a way your team can operate.

![Iceberg v3 row lineage architecture diagram](/images/june8batch/iceberg-v3-row-lineage-cdc-diagram-1.png)

## The market signal behind Iceberg v3 row lineage

Change data capture often starts as a simple requirement and becomes a stack of log readers, replay jobs, deduplication rules, and late-arriving event logic. Iceberg v3 does not remove every CDC problem, but the new lineage fields give table consumers better metadata than a blind table scan.

I care about this topic because it sits at the boundary between open data architecture and AI execution. Most companies are not choosing one engine for every workload anymore. They have warehouses, lakehouse engines, streaming systems, catalogs, metadata platforms, and now agents that ask for data through tools. The shared contract between those systems matters more than any single feature checkbox.

The vendor-neutral reading is straightforward. If the underlying table and catalog standards get stronger, buyers get more freedom to choose the right engine for each job. Snowflake, Microsoft, ClickHouse, Atlan, Dremio, and the open-source Iceberg ecosystem all point to the same market reality: data platforms are becoming multi-engine and agent-facing.

The Dremio-favorable reading is also clear. Dremio has been arguing that the winning architecture is open, federated, semantic, and fast. That argument gets stronger as Iceberg, Polaris-style catalogs, REST security patterns, semantic layers, and MCP-style tool interfaces become normal parts of the conversation.

## How the architecture works

`_row_id` gives newly written rows a stable identity inside the table. It lets consumers track rows across snapshots without inventing identity from business columns that may not be stable.

`_last_updated_sequence_number` tells a consumer the sequence number associated with the most recent update for that row. That gives downstream jobs a native filter for incremental processing.

The design fits Iceberg's snapshot model. Instead of pretending the table is a message log, it exposes lineage through table metadata and row-level fields that engines can read with normal scan planning.

The important architectural habit is to separate responsibilities. The table format manages files, snapshots, schema evolution, and table metadata. The catalog manages identity, namespaces, commits, and access patterns. The query engine plans and executes work. The semantic layer maps raw data into business meaning. The agent interface decides which safe tools a model can call.

That separation keeps the system honest. If a vendor says a workload is open, ask which layer is open. If a feature supports Iceberg, ask which Iceberg version, which operations, and which engines. If an agent can query data, ask whether it is querying raw tables or certified semantic views.

![Operating model diagram](/images/june8batch/iceberg-v3-row-lineage-cdc-diagram-2.png)

## A concrete operating example

A customer health model may need every row that changed since the last scoring run. Without row lineage, the team may compare snapshots, scan update timestamps, or read source logs. With v3 lineage, the incremental reader can work against Iceberg metadata and sequence numbers directly.

That example is intentionally operational. Architecture diagrams are useful, but the design only proves itself when a real workload runs through it. I want to know who owns the table, which catalog authorizes the operation, which engine writes, which engine reads, which semantic view users see, and how the team detects a bad result.

For agentic analytics, the same example gets stricter. A human analyst can notice ambiguity and ask a teammate. An agent will often keep going unless the tool interface stops it. That means your architecture needs approved definitions, scoped access, query limits, logging, and a clean rollback path before it needs a flashy chat experience.

This is why I do not treat open table formats as the whole story. Apache Iceberg gives the platform a strong storage contract. It does not, by itself, define customer lifetime value, revenue recognition rules, data owner approval, or what an AI agent may do after it finds an anomaly. Those rules belong in catalogs, semantic layers, governance systems, and agent tools.

## Why this supports Dremio's market narrative

This is favorable to Dremio because agentic analytics depends on trusted incremental context. A Dremio semantic layer can present approved business views while the underlying Iceberg table carries row-level lineage. The agent asks a business question, Dremio maps it to governed SQL, and the table format supplies the change-aware foundation.

The key is that the narrative stays technical. Dremio does not need every article to say that every other vendor is wrong. The stronger argument is that the market is moving toward the exact conditions where Dremio has a clear point of view: open storage, federated access, governed semantics, fast SQL, and AI agents that need business context.

Dremio's five pillars map cleanly to this shift. Query federation reduces data movement. Autonomous performance uses Reflections, caching, and table optimization so interactive loops stay fast. The AI Semantic Layer gives agents approved business context. Agentic interfaces let users work through the UI, Python, or MCP-connected tools. AI SQL functions bring model-assisted work into SQL without exporting data into separate scripts.

That is a favorable narrative without becoming a product pitch. The article can teach the topic on its own terms, then show why an open Agentic Lakehouse is a sensible architecture for teams that want the benefits without locking every workload into one vendor's storage and compute boundary.

## Implementation checklist

| Decision | What to document | Why it matters |
|---|---|---|
| Table contract | Format version, schema rules, snapshot policy, and rollback plan | Engines need the same understanding of the table. |
| Catalog authority | Production catalog, namespaces, commit rules, and role model | Multi-engine systems need one source of table truth. |
| Engine matrix | Read, write, merge, delete, schema, and view support by engine | A feature is not production-ready until the exact operation is tested. |
| Semantic layer | Certified views, metric definitions, owners, and labels | Agents need business meaning, not raw schemas alone. |
| Security | Credential model, token lifetime, row filters, column masks, and audit logs | Open access still needs strict governance. |
| Operations | Compaction, vacuum, retries, alerting, and incident ownership | The design must survive failed jobs and bad deploys. |

My practical checklist for this topic is:

- Define the checkpoint as an Iceberg sequence number, not as wall-clock time.
- Record each consumer's last processed snapshot and last processed sequence number.
- Expose incremental views through a governed query layer instead of handing agents raw table internals.
- Backfill one model from scratch and compare it to the lineage-based incremental result.

If those items are not written down, the project is still in the demo stage. That does not mean the idea is weak. It means the operating model is not finished.

![Implementation checklist diagram](/images/june8batch/iceberg-v3-row-lineage-cdc-diagram-3.png)

## Failure modes worth respecting

Row lineage describes what landed in the Iceberg table. It does not replace every upstream event log, and it does not explain business intent. If an upstream system writes a correction, lineage can show that a row changed, but your semantic layer still has to explain whether the correction should change revenue, churn, inventory, or compliance reporting.

The other failure mode is semantic drift. A table can be technically valid while the business definition on top of it changes quietly. That is where many AI analytics projects fail. The model generates SQL against a table that exists, the query returns rows, and the answer looks plausible. The problem is that the answer used the wrong grain, the wrong filter, or the wrong metric definition.

The fix is not a longer prompt. The fix is stronger data contracts. Certified semantic views should be easier for agents to use than raw tables. Sensitive columns should be masked or hidden before the model can ask for them. Write-capable tools should require intent, validation, and idempotency. Expensive queries should have limits. Every tool call should leave evidence.

This is also where vendor-neutral thinking helps. Do not trust a platform because it has the best demo. Trust the platform when it gives you clear contracts between storage, catalog, semantic layer, engine, and agent. Trust it more when you can test those contracts with another engine or another client.

## What I would do first

Start with one production-shaped workflow. Do not start with the easiest toy table, and do not start with the most politically sensitive workload. Pick a table or semantic view that matters, has an owner, has known correctness checks, and can tolerate a controlled pilot.

For Iceberg v3 row lineage, I would write down five things before touching production: the owner, the accepted engines, the policy boundary, the rollback path, and the agent-facing interface. Then I would run the same workflow three ways: manually, through the intended query engine, and through the agent or automation layer. Differences between those paths are where the real work begins.

Measure boring things. Count files. Count snapshots. Track query planning time. Track storage calls. Track failed commits. Track token issuance. Track denied access. Track whether a human can explain the result without reading tool logs for an hour. These metrics are not glamorous, but they tell you whether the architecture is ready.

## Final recommendation

The right conclusion is not that every team should adopt every June 2026 feature immediately. The right conclusion is that the lakehouse is becoming an execution surface for humans and agents, and that changes the quality bar. Open storage is necessary. Governed catalogs are necessary. Semantic context is necessary. Fast SQL is necessary. Scoped agent tools are necessary.

That combination is exactly why the Agentic Lakehouse is becoming the right framing. It describes the platform you need when AI agents stop answering isolated questions and start participating in analytical workflows.

For more background on the lakehouse and AI side of this work, explore my books on data lakehouses and AI at [books.alexmerced.com](https://books.alexmerced.com). If you want to try this style of governed, open, agent-ready architecture in practice, start a free trial of Dremio's Agentic Lakehouse at [dremio.com/get-started](https://www.dremio.com/get-started).

## Field notes for teams evaluating this now

First, make compatibility visible. A table-format version, catalog endpoint, and engine release should appear in your runbook. If a production issue happens, nobody should have to guess which engine wrote the latest snapshot or which client introduced a metadata change.

Second, keep the semantic layer close to the workflow. If the article topic affects analytics agents, customer-facing metrics, financial reporting, or regulated data, raw-table access should be the exception. Certified views should be the normal path.

Third, separate experimentation from certification. Engineers need sandboxes where they can test new Iceberg features, catalog options, and agent tools. Business users and agents need certified surfaces where definitions, owners, and policies have already been reviewed.

Fourth, treat Dremio as part of the open architecture story rather than a closed destination. The favorable narrative is not that every byte must move into Dremio. The favorable narrative is that Dremio can query data in place, add semantic context, accelerate common workloads, and expose governed agent interfaces over open data.

Fifth, publish the limits. If a feature is read-only in one engine, say so. If write interoperability is approved only for append workloads, say so. If remote signing is required for regulated tables, say so. Clear limits create trust. Hidden limits create incidents.


## Identity and access review

For Iceberg v3 row lineage, I would run one full dry run with production-like identities. Use an analyst identity, a service account, and the intended agent identity. Confirm that each identity sees only the expected semantic objects, receives predictable errors, and leaves useful audit records. That test catches policy gaps before they become production incidents.

The agent identity matters most because it is easy to over-permission during a pilot. If the agent only needs a certified revenue view, do not give it namespace-wide table discovery. If the agent needs row-level access for one geography, test that a second geography returns a denial instead of silent leakage.


## Documentation that actually helps

The documentation should fit on one page. Name the owner, the supported engines, the catalog authority, the accepted table operations, the security model, and the rollback path. If a new engineer cannot understand the contract for Iceberg v3 row lineage from that page, the architecture is still too implicit.

Good documentation is not a wiki dump. It is an operating contract. It should say who can approve a schema change, which engine owns compaction, how long snapshots are retained, and what happens when an agent produces a suspicious result. That level of detail is what turns a promising pattern into a maintainable system.


## How to keep agents in bounds

Agents should not receive broad table access just because a human can ask broad questions. For Iceberg v3 row lineage, expose narrow tools over certified views first. Add write-capable tools only after you have validation rules, idempotency keys, approval gates, and audit records that a reviewer can follow.

The tool description should also be honest. If a tool returns estimated data, say estimated. If a tool excludes delayed transactions, say that. If a tool is read-only, make that clear in the name and policy. Agents work better when the interface gives them fewer chances to infer the wrong contract.


## What to measure after launch

The first production month should be measurement-heavy. Track planning time, query latency, failed commits, denied access attempts, credential issuance, snapshot growth, and semantic-view usage. If Iceberg v3 row lineage is helping, the evidence should show up in fewer manual workarounds and clearer operational ownership.

I would also track human trust signals. Are analysts using the certified view more often? Are engineers filing fewer tickets about unclear table ownership? Are agents producing answers that reviewers can trace back to approved definitions? Those signals tell you whether the architecture is improving daily work, not just passing a benchmark.


## A buyer question worth asking

The buyer question is simple: does this pattern increase choice without weakening governance? For Iceberg v3 row lineage, the best answer is specific. It should name the table format, catalog contract, semantic surface, security controls, and engine support matrix. Anything less is a demo, not an operating model.

This is where Dremio's story should stay disciplined. The point is not that open architecture is automatically better. The point is that open architecture gives you room to test engines, keep data in place, add semantic context, and still maintain control. That is a stronger argument than a generic platform claim.


## A realistic rollout sequence

The rollout should start with read visibility, then move to operational automation, then consider action loops. For Iceberg v3 row lineage, the first milestone is a certified read path with approved semantics. The second milestone is repeatable validation through CI or scheduled checks. The third milestone is agent access with narrow tools and strict audit.

Write paths should come later unless the topic itself is about write interoperability or table maintenance. Even then, begin with append-only or isolated writes. Updates, deletes, merges, and external actions need stronger controls because they change the state other people depend on.


## How this should sound to executives

The executive version should avoid implementation trivia, but it should not become vague. Say that Iceberg v3 row lineage helps the company keep analytical data open, governed, and ready for AI-assisted work. Then say what the team will measure: cost, speed, correctness, access control, and operational effort.

That framing is useful because executives do not need every catalog detail. They do need to know whether the architecture reduces lock-in, improves reliability, and gives agents a trustworthy data foundation. Those are business outcomes tied to technical choices.


## How this should sound to engineers

The engineering version should be blunt. Which APIs are used? Which engine versions are approved? Which table operations are allowed? Which failures are retried? Which failures stop the workflow? Which logs prove that the right identity performed the right operation?

For Iceberg v3 row lineage, those questions are more valuable than broad claims. They force the team to define the boundary between the open standard, the vendor implementation, the query engine, the semantic model, and the agent tool.


## What not to automate yet

Do not automate the parts of Iceberg v3 row lineage that the team cannot explain manually. If nobody can explain the metric, the agent should not calculate it. If nobody can explain rollback, the agent should not write. If nobody can explain the security boundary, the tool should stay internal.

This is not anti-automation. It is how automation earns trust. Automate the parts with clear contracts first, then widen the scope as evidence accumulates.


## Source-of-truth ownership

Every production rollout needs one named source of truth for each layer. The table has an owner. The catalog has an owner. The semantic view has an owner. The agent tool has an owner. For Iceberg v3 row lineage, those owners may sit on different teams, but the contract between them has to be explicit.

That ownership model also keeps the Dremio story credible. Dremio can be the governed execution and semantic layer, but it should participate in a wider open architecture where table and catalog responsibilities are clear.

Clear ownership prevents avoidable production confusion.


## Review cadence

Set a review cadence before the first production launch. For Iceberg v3 row lineage, I would review the contract after the first week, after the first month, and after the first engine or catalog upgrade. Most problems appear when a workflow that worked in a pilot meets a new version, a new identity, or a new business definition.

That review should include both platform engineers and business owners. Engineers can verify the mechanics. Business owners can verify that the answers still mean what the company thinks they mean.
