---
title: "The Context Layer for AI Agents"
date: "2026-06-22"
description: "A semantic layer is necessary, but agents also need lineage, quality, freshness, compliance, and ownership context."
author: "Alex Merced"
category: "Lakehouse"
tags:
  - AI metadata
  - lineage
  - data quality
---


A semantic layer is necessary, but agents also need lineage, quality, freshness, compliance, and ownership context. For data governance and AI platform leaders, the useful question is what changes in production and what simply sounds current.

![AI context layer architecture map](/images/2026/week22-june-2026/context-layer-semantic-lineage-quality-ai-agents-diagram-1.png)

## Why Semantic Definitions Are Not Enough Alone

An agent can use the right metric and still make the wrong recommendation if it cannot see freshness, lineage, or quality warnings.

This is where lakehouse design is changing. The platform is no longer only serving dashboards. It is serving automated workflows that need context and limits. That matters because agentic analytics changes the failure mode. A human analyst may notice when a table feels stale, a metric looks odd, or a query scans too much data. An agent can move through those steps quickly and confidently unless the platform gives it clear boundaries.

The contracts that already mattered now matter more. Semantic definitions, lineage, freshness expectations, ownership, and quality checks have to be explicit enough for both people and software to rely on them.

## What the Tools and Docs Support

The strongest public sources for this topic are [Atlan resources](https://atlan.com/resources/), [Great Expectations documentation](https://docs.greatexpectations.io/), and [dbt tests documentation](https://docs.getdbt.com/docs/build/data-tests). I use those to ground the architecture and avoid treating every June 2026 announcement as a shipped production capability.

The evidence supports a few grounded points:

- Agents need operational context in addition to semantic definitions.
- Lineage, quality, freshness, ownership, and policy labels should affect tool behavior.
- Context should be available at execution time, not buried in a wiki.

That is enough to write a useful technical article. It is not enough to make sweeping claims. I separate released behavior, design direction, and market language because readers can work with careful distinctions. They cannot operate slogans.

## The Architecture Pattern

The context layer sits above raw metadata and below agent action. It gathers semantic definitions, lineage, freshness, ownership, quality checks, privacy tags, and usage guidance. The agent should not simply ask whether a table exists. It should ask whether this table is approved for this question, whether it is fresh enough, and whether the answer requires a warning.

For this architecture, the five layers worth keeping distinct are storage, catalog, execution, semantics, and agent interface. Storage holds durable files and snapshots. The catalog resolves identity and access. The execution layer plans and runs work. The semantic layer gives business meaning. The agent interface controls which questions and actions are allowed.

The point is not to collapse those layers into one box. The point is to make the handoffs clear. If a user or agent asks for an answer, the platform should be able to explain which table, which snapshot, which definition, which identity, and which policy shaped the result.

![Operating workflow for AI context layer](/images/2026/week22-june-2026/context-layer-semantic-lineage-quality-ai-agents-diagram-2.png)

## A Production-Shaped Example

Imagine an agent answering weekly pipeline questions. The revenue metric is certified, but the source table missed its latest refresh. A context-aware tool should return the stale-data warning with the result or block the answer, depending on policy. Without that context, the agent can sound confident while spreading bad data.

The test should include a happy path and at least three failure paths. One failure should involve access. One should involve stale or incompatible data. One should involve an operational problem: retry behavior, latency, file layout, or unsupported engine behavior. Those failures are where the platform either earns trust or loses it.

The test should also produce evidence. Save query IDs, snapshot IDs when relevant, policy decisions, validation output, and rollback proof. If the team cannot find that evidence after the pilot, the rollout is not ready for a wider audience.

## What To Measure

Start with four specific measurements:

- **Freshness machine-readable and query-time accessible:** Confirm that freshness information is not just recorded in a wiki. It should be available to the query tool at execution time so the tool can warn or block based on staleness.
- **Quality gate status linked to tool responses:** Every query result should carry the outcome of recent quality tests against the source data. A passed quality check is part of the answer. A failed check is a warning.
- **Ownership included in answer traces:** Track whether answer traces include the dataset owner's name and the ownership category (certified, provisional, experimental). If an agent cannot cite ownership, the answer lacks accountability.
- **Compliance labels active as execution controls:** Verify that data classified as sensitive or restricted actually blocks access for identities that should not see it. Labels that only exist in a catalog are not access controls.

Measurements should connect to decisions. A metric that nobody uses is telemetry decoration.

## Common Failure Modes

The first mistake is treating the context layer as a feature checklist. A checklist can confirm that a capability exists, but it rarely explains how the capability behaves under pressure. The better move is to write the operating contract. Name the owner, supported versions, allowed operations, denied paths, and recovery steps before widening usage.

The second mistake is ignoring boundaries. Most lakehouse incidents appear where systems meet: catalog to engine, engine to storage, semantic model to query, or agent tool to policy. Boundary testing should be part of the rollout. If the happy path is the only path tested, the team has not tested production.

The third mistake is hiding tradeoffs behind category language. Words like context layer and governed AI can be useful, but they are not a substitute for mechanics. Translate every category phrase into behavior. What changes in access, latency, correctness, cost, or auditability? If the answer is vague, the design is still vague.

The most expensive failures are usually quiet. The query works, but it answers the wrong business question. The table is valid, but the lineage is broken. The agent returns a number, but cannot explain freshness or policy. Those failures do not show up as red alerts. They show up as eroded trust.

## Guardrails for Agentic Use

Agents should start with certified views, narrow tools, and explicit tool descriptions. They should not receive broad table discovery just because a human analyst has it. A tool should say what it can answer, what it cannot answer, what freshness it requires, and whether it can write or only read.

I would also require a visible refusal path. If data is stale, the agent should say so. If the question crosses a policy boundary, the agent should stop. If the engine cannot perform the operation safely, the workflow should fail with a useful message. A graceful refusal is not a bad user experience. It is a trust feature.

## Operational Checklist

| Area | Question to answer | Why it matters |
|---|---|---|
| Ownership | Who owns the table, catalog path, semantic definition, and agent tool? | Incidents need named owners, not shared confusion. |
| Scope | Which operations are allowed for this rollout? | A narrow launch is easier to test and govern. |
| Identity | Which human, service, or agent identities are mapped to access? | Machine-speed access needs machine-enforced policy. |
| Evidence | Which logs, query IDs, snapshots, or validation outputs are saved? | Trust needs a trail. |
| Rollback | What happens when the workflow is wrong or unsafe? | Recovery is part of the design, not an afterthought. |

This checklist is intentionally plain. If it feels too basic, that is usually a good sign. The hard part is not inventing a complex control framework. The hard part is answering the simple questions before users and agents depend on the system.

![Open lakehouse operating model for AI context layer](/images/2026/week22-june-2026/context-layer-semantic-lineage-quality-ai-agents-diagram-3.png)

## What Engineers Should Verify

Engineers should verify exact versions, APIs, identities, allowed operations, failure behavior, and audit records. Claiming "support for an AI context layer" is not enough. The team needs to know which context dimensions were tested, how they affect agent behavior, and which are explicitly out of scope.

The practical test is simple: can another engineer reproduce the setup, trigger a failure, understand the logs, and roll back without asking the original author for help? If not, the workflow is not ready for broader adoption.

The setup should also be tested under realistic concurrency. Many designs behave well when a single analyst runs a clean demo. They behave differently when agents, notebooks, dashboards, and maintenance jobs all touch the same platform. Production readiness is about the second case.

## What Data Owners Should Verify

Data owners should verify meaning. The data owner should confirm the approved datasets, definitions, exclusions, freshness expectations, and sensitivity rules. Technical correctness is not enough if the business definition is ambiguous.

This review should happen before agent exposure. Once an agent can answer a question, people will treat the answer as part of the operating rhythm. That makes weak definitions more dangerous. If a revenue metric excludes credits, delayed invoices, or test accounts, that rule should be part of the semantic contract.

Data owners should also decide when a warning is required. Some stale data can still be useful with a visible caveat. Some stale data should block the answer. That is a business decision, not only a platform decision.

## What Executives Should Hear

The summary should be plain: a context layer for AI agents is useful when it makes analytical work more trustworthy and auditable. It is risky when it is treated as a category label without operational proof.

The value is not novelty. The value is reducing the distance between governed data and reliable agent answers. That shows up in fewer incorrect answers, clearer ownership of data quality, better reuse of semantic definitions, and safer automation when the context layer is wired into the execution path.

Executives should also hear the limit. No context layer removes the need for data ownership, quality checks, access control, and cost management. Agentic systems raise the bar for those disciplines because they can ask more questions and take more steps in less time.

## A Good First Rollout

Start small. Pick one domain, one trusted dataset, one semantic path, one or two identities, and one measurable workflow. Run it manually first. Then run it through the intended platform path. Then run it through the agent or automation layer.

Define success with three outcomes. The first is correctness: the answer or operation matches the expected business meaning. The second is safety: denied paths fail clearly. The third is operability: logs and evidence are good enough for another team member to understand what happened.

After that, expand by adding another domain, another context dimension, another tool, or another operation. Expanding one dimension at a time is slower than a dramatic launch, but it creates fewer mysteries.

## Deeper Design Notes

The design work should begin with the nouns in the workflow. Name the tables, snapshots, metrics, identities, tools, owners, and failure states. When those nouns are vague, every later discussion becomes vague too. A team can spend weeks debating architecture diagrams while still failing to say which dataset is authoritative or which identity is allowed to perform the operation. Start with the concrete objects and build outward.

The next step is to define the dimensions that actually change behavior: lineage, freshness, quality checks, ownership, compliance tags. These are not decorative details. They determine whether the system is predictable under real use. If one of those dimensions is unknown, write it down as an open risk instead of letting it hide inside a polished diagram.

## Review Questions Worth Asking

The first question is simple: what must be true before this workflow is allowed to run unattended? That question usually exposes missing assumptions about data freshness, ownership, permissions, or engine behavior. A manual workflow can rely on human judgment. An automated workflow needs those judgments turned into checks.

The second question: what should the system refuse to do? Refusal paths are a sign of maturity. They show that the platform understands its own limits. A tool that always returns something is not necessarily helpful. Sometimes the best answer is that the data is stale, the identity is not allowed, the quality check failed, or the result would be misleading without a caveat.

The third question: who gets paged or notified when the workflow fails? If the answer is unclear, the rollout is not operationally ready. Agentic systems do not remove ownership. They make ownership more important because they can encounter edge cases faster than a human-only workflow.

## A Realistic Pilot Shape

A realistic pilot should look like an agent answering pipeline questions while a source refresh is delayed. That scenario is intentionally narrow enough to test and broad enough to reveal platform boundaries. It should include one normal path, one stale or invalid data path, one denied access path, and one operational failure path. The point is not to make the pilot impressive. The point is to make it diagnostic.

The pilot should run in stages. First, run the workflow manually and capture the expected answer or state transition. Second, run it through the engine, catalog, or semantic path that production will use. Third, expose only the narrow tool or automation layer needed for the agentic version. If the results differ, stop and understand why before adding scope.

Include a repetition test. Run the same workflow repeatedly across a few days or a few table changes. Many systems work once. Fewer systems remain understandable after schema changes, policy changes, retries, compaction, changed workload patterns, or a new client version.

## Metrics That Should Drive the Next Decision

The first metrics to watch are freshness warning coverage, quality gate status per answer, lineage coverage in traces, and owner escalation frequency. Those measurements should lead to a decision about whether to expand, tune, hold, or roll back the pilot. If the team cannot name the decision connected to a metric, the metric is probably not useful yet.

A second group of metrics should track trust: how often did the workflow return warnings? How often did it refuse correctly? How often did users accept the answer without asking a human to re-check it? Those signals matter because trust is not created by a successful query alone.

A third group should track cost and maintenance. Faster answers are good, but not if they create runaway refresh costs, fragile tables, noisy alerts, or hidden operational work. The goal is not just speed. The goal is sustainable speed with clear meaning and policy.

## What I Would Cut From a Weak Rollout

Cut broad table discovery first. Agents should not explore raw data estates as if every table is equally safe and equally meaningful. Start with certified views or narrow tools, then expand when the team has evidence.

Cut write access until read paths, audit records, and refusal behavior are boring. Writes add concurrency, rollback, and ownership questions. Some workflows need them, but they should not be the default just because the agent can call a tool.

Cut unsupported engines or clients from the first phase. Multi-engine support is valuable, but every additional engine expands the test matrix. Start with one well-understood path. Add another path when the table behavior, semantic behavior, and policy behavior are already clear.

## The Practical Standard

The practical standard is not perfection. It is explainability under pressure. When a user challenges an answer, an operator should be able to explain which data was used, which policy applied, which definition shaped the result, and which evidence was saved. When a workflow fails, the failure should point to the layer that needs attention.

That standard is demanding, but it is realistic. It lets teams adopt agentic analytics without pretending that models make data architecture disappear. The model is one participant. The context layer is what makes the result trustworthy.

## My Recommendation

Take the AI context layer seriously, but do not oversell it. The useful bar is simple: can the team explain the contract, test the behavior, enforce the policy, measure the result, and recover from failure?

If the answer is yes, the pattern deserves a production pilot. If the answer is no, the next step is not a bigger announcement. The next step is a narrower contract and a better test.

Dremio enters this conversation through governed semantic access and fast query paths over open data. The broader lesson is that agents need context as infrastructure, not as prose around a dashboard. A platform that makes freshness, lineage, and ownership part of the query path will naturally produce more trustworthy agent answers.

For a deeper foundation on lakehouse and AI architecture, explore Alex Merced's books on data lakehouses and AI at [books.alexmerced.com](https://books.alexmerced.com). To try a governed, open, agent-ready lakehouse in practice, start a free trial of Dremio's Agentic Lakehouse at [dremio.com/get-started](https://www.dremio.com/get-started).
