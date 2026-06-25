---
title: "Composable Semantic Layers for Analytical Agents"
date: "2026-06-22"
description: "AI agents need more than metric names. They need composable business logic that survives multi-step analysis."
author: "Alex Merced"
category: "Lakehouse"
tags:
  - semantic layer agents
  - metrics catalogs
  - agentic analytics
---


AI agents need more than metric names. They need composable business logic that survives multi-step analysis. For analytics engineers and AI platform teams, the useful question is what changes in production and what simply sounds current.

![composable semantic modeling architecture map](/images/2026/week22-june-2026/beyond-metrics-lists-composable-semantic-layers-agents-diagram-1.png)

## Why a Metric Catalog Is Not Enough

A metric catalog can answer what revenue means, but an analytical agent also needs to know how revenue behaves inside cohorts, time windows, and exclusions.

The architecture matters because agents compress the time between question, query, interpretation, and action. That matters more now because agentic analytics changes the failure mode. A human analyst may notice when a table feels stale, a metric looks odd, or a query scans too much data. An agent can move through those steps quickly and confidently unless the platform gives it clear boundaries.

That does not mean every data platform needs to be rebuilt around agents. What it does mean is that semantic contracts already mattered, and now they matter more. Definitions, exclusion rules, cohort logic, and period comparisons have to be explicit enough for both people and software to rely on them.

## What the Specs and Tools Support

The strongest public sources for this topic are the [dbt semantic layer documentation](https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl), [Cube semantic layer documentation](https://cube.dev/docs/product/semantic-layer), and [Dremio Agentic Lakehouse](https://www.dremio.com/get-started). I use those to ground the architecture and avoid treating every June 2026 announcement as a shipped production capability.

The evidence supports a few grounded points:

- Simple metric lists are not enough for multi-step analytical investigations.
- Agents need reusable semantic operations, not only text-to-SQL hints.
- Composable semantics reduce ambiguity when questions combine filters, cohorts, periods, and exclusions.

That is enough to write a useful technical article. It is not enough to make sweeping claims. I separate released behavior, design direction, and market language because readers can work with careful distinctions. They cannot operate slogans.

## The Architecture Pattern

A composable semantic layer treats business concepts as reusable operations. A metric is one object. A time comparison is another. A cohort filter is another. An exclusion rule is another. An agent should be able to combine those objects without rewriting business logic from scratch each time. That is how semantic modeling moves from documentation to execution.

For composable semantic layers, the five layers worth thinking about are storage, catalog, execution, semantics, and agent interface. Storage holds durable files and snapshots. The catalog resolves identity and access. The execution layer plans and runs work. The semantic layer gives business meaning. The agent interface controls which questions and actions are allowed.

The point is not to collapse those layers into one box. The point is to make the handoffs clear. If a user or agent asks for an answer, the platform should be able to explain which table, which snapshot, which definition, which identity, and which policy shaped the result.

![Operating workflow for composable semantic modeling](/images/2026/week22-june-2026/beyond-metrics-lists-composable-semantic-layers-agents-diagram-2.png)

## A Production-Shaped Example

Take a churn question: compare enterprise customers who expanded last quarter but reduced usage this month, excluding customers in onboarding. A text-to-SQL system can easily miss one part. A composable semantic layer can expose the approved customer segment, usage measure, expansion logic, and period comparison as separate trusted pieces.

The test should include a happy path and at least three failure paths. One failure should involve access. One should involve stale or incompatible data. One should involve an operational problem: retry behavior, latency, file layout, or unsupported engine behavior. Those failures are where the platform either earns trust or loses it.

The test should also produce evidence. Save query IDs, snapshot IDs when relevant, policy decisions, validation output, and rollback proof. If the team cannot find that evidence after the pilot, the rollout is not ready for a wider audience.

## What To Measure

Start with four specific measurements:

- **Semantic object reuse across agent sessions:** Track whether agents are reusing approved semantic objects or regenerating equivalent logic from raw SQL. High raw SQL generation is a sign that the semantic layer is not accessible enough.
- **Query explanations that include semantic object names:** Confirm that answers can be traced back to named semantic objects. If an agent cannot say which cohort definition or period comparison it used, neither can the data owner.
- **Definition drift between semantic objects and BI reports:** Check periodically whether the semantic objects agents use produce results that match what BI teams report. Silent drift is more dangerous than visible drift.
- **Cohort correctness across multi-step questions:** Test specifically whether cohort definitions hold when questions span multiple filters or time periods. That is where composability either works or breaks.

Measurements should connect to decisions. A metric that nobody uses is telemetry decoration. If semantic warnings appear often, decide whether the definitions need better ownership.

## Common Failure Modes

The first mistake is treating composable semantics as a feature checklist. A checklist can confirm that a capability exists, but it rarely explains how the capability behaves under pressure. The better move is to write the operating contract. Name the owner, supported versions, allowed operations, denied paths, and recovery steps before widening usage.

The second mistake is ignoring boundaries. Most lakehouse incidents appear where systems meet: catalog to engine, engine to storage, semantic model to query, or agent tool to policy. Boundary testing should be part of the rollout. If the happy path is the only path tested, the team has not tested production.

The third mistake is hiding tradeoffs behind category language. Words like semantic layer, composable, and agentic can be useful, but they are not a substitute for mechanics. Translate every category phrase into behavior. What changes in access, latency, correctness, cost, or auditability? If the answer is vague, the design is still vague.

The most expensive failures are usually quiet. The query works, but it answers the wrong business question. The metric is defined, but an exclusion rule was not applied to the cohort. The agent returns a number, but cannot explain whether the period comparison was year-over-year or sequential. Those failures do not show up as red alerts. They show up as eroded trust.

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

![Open lakehouse operating model for composable semantic modeling](/images/2026/week22-june-2026/beyond-metrics-lists-composable-semantic-layers-agents-diagram-3.png)

## What Engineers Should Verify

Engineers should verify exact versions, APIs, identities, allowed operations, failure behavior, and audit records. Claiming "support for composable semantic layers" is not enough. The team needs to know which semantic objects were tested and which combinations are explicitly out of scope.

The practical test is simple: can another engineer reproduce the setup, trigger a failure, understand the logs, and roll back without asking the original author for help? If not, the workflow is not ready for broader adoption.

The setup should also be tested under realistic concurrency. Many semantic layer designs behave well when a single analyst runs a clean demo. They behave differently when agents, notebooks, dashboards, and maintenance jobs all touch the same platform. Production readiness is about the second case.

## What Data Owners Should Verify

Data owners should verify meaning. The data owner should confirm the approved datasets, definitions, exclusions, freshness expectations, and sensitivity rules. Technical correctness is not enough if the business definition is ambiguous.

This review should happen before agent exposure. Once an agent can answer a question, people will treat the answer as part of the operating rhythm. That makes weak definitions more dangerous. If a revenue metric excludes credits, delayed invoices, or test accounts, that rule should be part of the semantic contract.

Data owners should also decide when a warning is required. Some stale data can still be useful with a visible caveat. Some stale data should block the answer. That is a business decision, not only a platform decision.

## What Executives Should Hear

The summary should be plain: composable semantic layers are useful when they make analytical work more trustworthy and reusable across teams and tools. They are risky when they are treated as a category label without operational proof.

The value is not novelty. The value is reducing the distance between governed business definitions and useful agent answers. That shows up in fewer custom metric definitions, clearer ownership of business logic, and safer multi-step analysis that does not silently drop exclusion rules.

Executives should also hear the limit. No semantic layer removes the need for data ownership, quality checks, access control, and cost management. Agentic systems raise the bar for those disciplines because they can ask more questions and take more steps in less time.

## A Good First Rollout

Start small. Pick one domain, one trusted dataset, one semantic path, one or two identities, and one measurable workflow. Run it manually first. Then run it through the intended platform path. Then run it through the agent or automation layer.

Define success with three outcomes. The first is correctness: the answer or operation matches the expected business meaning. The second is safety: denied paths fail clearly. The third is operability: logs and evidence are good enough for another team member to understand what happened.

After that, expand by adding another domain, another agent pattern, another tool, or another operation. Expanding one dimension at a time is slower than a dramatic launch, but it creates fewer mysteries.

## Deeper Design Notes

The design work should begin with the nouns in the workflow. Name the tables, snapshots, metrics, cohorts, exclusion rules, period definitions, owners, and failure states. When those nouns are vague, every later discussion becomes vague too. A team can spend weeks debating semantic architecture diagrams while still failing to say which customer segment definition is authoritative or which period comparison is approved. Start with the concrete objects and build outward.

The next step is to define the dimensions that actually change behavior: metrics, cohorts, period comparisons, exclusions, governed joins. These are not decorative details. They determine whether the system is predictable under real use. If one of those dimensions is unknown, write it down as an open risk instead of letting it hide inside a polished diagram.

## Review Questions Worth Asking

The first question is simple: what must be true before this workflow is allowed to run unattended? That question usually exposes missing assumptions about data freshness, ownership, permissions, or semantic object coverage. A manual workflow can rely on human judgment. An automated workflow needs those judgments turned into checks.

The second question: what should the system refuse to do? Refusal paths are a sign of maturity. They show that the platform understands its own limits. A tool that always returns something is not necessarily helpful. Sometimes the best answer is that the cohort definition does not cover the requested segment, the period comparison is ambiguous, or the metric would be misleading without a caveat.

The third question: who gets paged or notified when the workflow fails? If the answer is unclear, the rollout is not operationally ready. Agentic systems do not remove ownership. They make ownership more important because they can encounter edge cases faster than a human-only workflow.

## A Realistic Pilot Shape

A realistic pilot should look like an agent comparing expansion among enterprise customers while excluding onboarding accounts. That scenario is intentionally narrow enough to test and broad enough to reveal platform boundaries. It should include one normal path, one stale or invalid data path, one denied access path, and one operational failure path. The point is not to make the pilot impressive. The point is to make it diagnostic.

The pilot should run in stages. First, run the workflow manually and capture the expected answer or state transition. Second, run it through the engine, catalog, or semantic path that production will use. Third, expose only the narrow tool or automation layer needed for the agentic version. If the results differ, stop and understand why before adding scope.

Include a repetition test. Run the same workflow repeatedly across a few days or a few table changes. Many systems work once. Fewer systems remain understandable after schema changes, policy changes, retries, compaction, changed workload patterns, or a new client version.

## Metrics That Should Drive the Next Decision

The first metrics to watch are semantic object reuse, query explanation completeness, definition drift rate, and cohort correctness under multi-step questions. Those measurements should lead to a decision about whether to expand, tune, hold, or roll back the pilot. If the team cannot name the decision connected to a metric, the metric is probably not useful yet.

A second group of metrics should track trust: how often did the workflow return warnings? How often did it refuse correctly? How often did users accept the answer without asking a human to re-check it? Did data owners agree that the answers used the right definitions? Those signals matter because trust is not created by a successful query alone.

A third group should track cost and maintenance. Faster answers are good, but not if they create runaway refresh costs, fragile tables, noisy alerts, or hidden operational work. The goal is not just speed. The goal is sustainable speed with clear meaning and policy.

## What I Would Cut From a Weak Rollout

Cut broad table discovery first. Agents should not explore raw data estates as if every table is equally safe and equally meaningful. Start with certified views or narrow tools, then expand when the team has evidence.

Cut write access until read paths, audit records, and refusal behavior are boring. Writes add concurrency, rollback, and ownership questions. Some workflows need them, but they should not be the default just because the agent can call a tool.

Cut unsupported semantic combinations from the first phase. Multi-filter, multi-period, multi-cohort questions are valuable, but each new combination expands the test matrix. Start with one well-understood question shape. Add another when the base case is already clear.

## The Practical Standard

The practical standard is not perfection. It is explainability under pressure. When a user challenges an answer, an operator should be able to explain which semantic objects were used, which policy applied, which cohort or period definition shaped the result, and which evidence was saved. When a workflow fails, the failure should point to the layer that needs attention.

That standard is demanding, but it is realistic. It lets teams adopt agentic analytics without pretending that models make data architecture disappear. The model is one participant. The semantic contract is what makes the result usable.

## My Recommendation

Take composable semantic layers seriously, but do not oversell them. The useful bar is simple: can the team explain the contract, test the behavior, enforce the policy, measure the result, and recover from failure?

If the answer is yes, the pattern deserves a production pilot. If the answer is no, the next step is not a bigger announcement. The next step is a narrower contract and a better test.

This is a natural fit for platforms like Dremio, where the AI Semantic Layer is designed to give agents approved business context. The educational point comes first: agents need reusable meaning before they need more SQL generation. When that meaning is well-governed and composable, the architecture earns the agent's trust.

For a deeper foundation on lakehouse and AI architecture, explore Alex Merced's books on data lakehouses and AI at [books.alexmerced.com](https://books.alexmerced.com). To try a governed, open, agent-ready lakehouse in practice, start a free trial of Dremio's Agentic Lakehouse at [dremio.com/get-started](https://www.dremio.com/get-started).
