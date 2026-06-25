---
title: "Event-Driven Table Compaction with Agents"
date: "2026-06-22"
description: "Event-driven compaction is valuable when agents coordinate maintenance with workload signals, table health, and commit safety."
author: "Alex Merced"
category: "Lakehouse"
tags:
  - agentic compaction
  - Iceberg maintenance
  - table optimization
---


Event-driven compaction is valuable when agents coordinate maintenance with workload signals, table health, and commit safety. For lakehouse operators managing file layout and table health, the useful question is what changes in production and what simply sounds current.

![event-driven compaction architecture map](/images/2026/week22-june-2026/event-driven-table-compaction-agentic-coordination-diagram-1.png)

## Why Small Files Become a Platform Problem for Agents

Small files are not just a storage nuisance. They become planning, cost, and latency problems for humans and agents.

The useful test is practical: can a team explain the behavior, measure the outcome, and recover when something breaks? That matters because agentic analytics changes the failure mode. A human analyst may notice when a table feels stale, a metric looks odd, or a query scans too much data. An agent can move through those steps quickly and confidently unless the platform gives it clear boundaries.

The contracts that already mattered now matter more. Storage layout, catalog behavior, writer coordination, and rollback capability have to be explicit enough for both people and software to rely on them.

## What the Specs Support

The strongest public sources for this topic are the [Apache Iceberg specification](https://iceberg.apache.org/spec/), [Apache Flink documentation](https://flink.apache.org/), and [Apache Kafka documentation](https://kafka.apache.org/documentation/). I use those to ground the architecture and avoid treating every June 2026 announcement as a shipped production capability.

The evidence supports a few grounded points:

- Compaction should respond to file layout, workload pressure, and commit safety.
- Automated maintenance must coordinate with concurrent writers.
- Agentic coordination is useful only when decisions are auditable and reversible.

That is enough to write a useful technical article. It is not enough to make sweeping claims. I separate released behavior, design direction, and market language because readers can work with careful distinctions. They cannot operate slogans.

## The Architecture Pattern

A compaction agent should not simply wake up on a timer and rewrite files. It should observe table health, file counts, query patterns, and writer activity. It should choose candidate partitions, coordinate with the catalog, execute safely, and record the before and after state. The value is not autonomy for its own sake. The value is maintenance that responds to evidence.

For this architecture, the five layers worth keeping distinct are storage, catalog, execution, semantics, and agent interface. Storage holds durable files and snapshots. The catalog resolves identity and access. The execution layer plans and runs work. The semantic layer gives business meaning. The agent interface controls which questions and actions are allowed.

The point is not to collapse those layers into one box. The point is to make the handoffs clear. If a user or agent asks for an answer, the platform should be able to explain which table, which snapshot, which definition, which identity, and which policy shaped the result.

![Operating workflow for event-driven compaction](/images/2026/week22-june-2026/event-driven-table-compaction-agentic-coordination-diagram-2.png)

## A Production-Shaped Example

A useful pilot watches one high-churn table. When small-file count crosses a threshold and no heavy writer is active, the agent proposes compaction for a narrow partition range. The workflow records the snapshot before the rewrite, validates row counts after the rewrite, and keeps a rollback path.

The test should include a happy path and at least three failure paths. One failure should involve access. One should involve stale or incompatible data. One should involve an operational problem: retry behavior, latency, file layout, or concurrent writer conflict. Those failures are where the platform either earns trust or loses it.

The test should also produce evidence. Save snapshot IDs before and after, policy decisions, validation output, and rollback proof. If the team cannot find that evidence after the pilot, the rollout is not ready for a wider audience.

## What To Measure

Start with four specific measurements:

- **Small-file count and partition health before triggering compaction:** Track the actual small-file distribution across partitions before any compaction runs. Compaction that targets the wrong partitions wastes compute and can conflict with active writers.
- **Writer activity detection before rewrite:** Confirm that the agent checks for active writers before rewriting any partition. Compaction that runs concurrently with a heavy writer risks OCC failures, which may silently break snapshot history.
- **Snapshot state recorded before and after rewrite:** Every compaction run should produce a before snapshot ID and an after snapshot ID. Those IDs are the rollback path. Without them, recovery requires manual inspection.
- **Planning time and scan latency compared before and after:** Measure whether compaction actually reduced planning time and scan cost. If the metrics do not improve, the partition selection or file size targets need adjustment.

Measurements should connect to decisions. A metric that nobody uses is telemetry decoration.

## Common Failure Modes

The first mistake is treating event-driven compaction as a feature checklist. A checklist can confirm that a capability exists, but it rarely explains how the capability behaves under pressure. The better move is to write the operating contract. Name the owner, supported versions, allowed operations, denied paths, and recovery steps before widening usage.

The second mistake is ignoring boundaries. Most compaction incidents appear where systems meet: writer to catalog, rewrite job to snapshot history, or maintenance agent to active query load. Boundary testing should be part of the rollout. If the happy path is the only path tested, the team has not tested production.

The third mistake is hiding tradeoffs behind category language. Words like intelligent compaction and autonomous maintenance can be useful, but they are not a substitute for mechanics. Translate every category phrase into behavior. What changes in file count, planning cost, query latency, and rollback capability? If the answer is vague, the design is still vague.

The most expensive failures are usually quiet. The compaction succeeds, but it runs during a heavy write window and creates OCC failures. The file count drops, but the partition layout makes the next query slower. The snapshot history looks clean, but the validation skipped row count checks. Those failures do not show up as red alerts. They show up as intermittent query slowdowns and unexplained data mismatches.

## Guardrails for Agentic Use

Compaction agents should start with narrow partition scope, explicit writer-detection checks, and defined rollback paths. They should not receive broad rewrite authority over the entire table estate just because they can observe file counts.

I would also require a visible refusal path. If active writers are detected, the agent should defer and record why. If the compaction estimate exceeds a cost threshold, the workflow should pause for human review. If snapshot validation fails post-rewrite, the rollback should be automatic and the failure should be logged. Those refusals are the safety net.

## Operational Checklist

| Area | Question to answer | Why it matters |
|---|---|---|
| Ownership | Who owns the table, catalog path, and compaction policy? | Incidents need named owners, not shared confusion. |
| Scope | Which partitions and tables are in scope for this rollout? | A narrow launch is easier to test and govern. |
| Identity | Which service identity triggers compaction and holds the write permission? | Machine-speed maintenance needs machine-enforced policy. |
| Evidence | Which snapshot IDs, row counts, and cost estimates are saved? | Rollback requires a paper trail. |
| Rollback | What happens when the rewrite fails or introduces regression? | Recovery is part of the design, not an afterthought. |

This checklist is intentionally plain. If it feels too basic, that is usually a good sign. The hard part is not inventing a complex maintenance framework. The hard part is answering the simple questions before the compaction agent touches production tables.

![Open lakehouse operating model for event-driven compaction](/images/2026/week22-june-2026/event-driven-table-compaction-agentic-coordination-diagram-3.png)

## What Engineers Should Verify

Engineers should verify exact versions, APIs, identities, allowed operations, failure behavior, and audit records. Claiming "support for event-driven table compaction" is not enough. The team needs to know which partition types were tested, which write patterns were observed, and which failure paths are explicitly handled.

The practical test is simple: can another engineer reproduce the setup, trigger a writer-conflict failure, understand the logs, and roll back without asking the original author for help? If not, the workflow is not ready for broader adoption.

The setup should also be tested under realistic concurrency. Many compaction designs behave well when the table has no active writers. They behave differently when streaming ingestion, batch updates, and maintenance jobs all touch the same table simultaneously. Production readiness is about the second case.

## What Data Owners Should Verify

Data owners should verify that compaction does not change the logical meaning of the table. Rewriting files should not change row counts, column values, or partition boundaries in ways that surprise downstream consumers.

This review should happen before automated compaction runs on production tables. If a data owner has approved the table for a specific retention period or deletion schedule, compaction needs to respect those rules. Silent conflicts between compaction and deletion policy are a real risk.

Data owners should also confirm the validation checks that run after compaction. The minimum check is row count parity. A stronger check includes spot-reading a sample of rows from the new snapshot and comparing to the previous snapshot. If the numbers do not match, the compaction job should not complete.

## What Executives Should Hear

The summary should be plain: event-driven table compaction is useful when it keeps table health high without requiring manual operator intervention for every high-churn table. It is risky when automation runs without writer coordination, snapshot validation, or rollback capability.

The value is operational: lower scan costs, better planning latency, and fewer manual maintenance windows. The risk is silent data corruption if the automation skips validation or conflicts with writers.

Executives should also hear the limit. Compaction automation does not remove the need for table ownership, quality checks, and cost management. An agent that compacts aggressively without cost controls can create a runaway compute bill.

## A Good First Rollout

Start with one high-churn table in a non-critical domain. Watch it manually for a week. Understand its write patterns, its typical small-file accumulation rate, and its downstream query load. Then configure the compaction agent with a narrow partition scope, a cost threshold, and writer-detection logic.

Define success with three outcomes. The first is correctness: row counts match before and after. The second is safety: writer conflicts cause a graceful defer, not a failed commit. The third is operability: the compaction history log is clear enough for another operator to understand what happened.

After that, expand to another table or a wider partition scope. Expanding one dimension at a time is slower than a dramatic rollout, but it creates fewer surprises.

## Deeper Design Notes

The design work should begin with the nouns in the workflow. Name the tables, partitions, snapshot IDs, writer identities, cost thresholds, and failure states. When those nouns are vague, every later discussion becomes vague too. A team can spend weeks designing an autonomous compaction system while still failing to say which service identity is allowed to rewrite which table or what happens when validation fails. Start with the concrete objects and build outward.

The next step is to define the dimensions that actually change behavior: small-file count thresholds, writer-detection logic, partition selection heuristics, cost limits, and rollback triggers. These are not decorative details. They determine whether the system is predictable under real use.

## Review Questions Worth Asking

The first question is simple: what must be true before the compaction agent is allowed to rewrite a partition unattended? That question usually exposes missing assumptions about writer activity, snapshot validation, and cost approval. A manual compaction job can rely on an operator watching the output. An automated job needs those checks built in.

The second question: what should the compaction agent refuse to do? Refuse to run when active writers are detected. Refuse to continue when post-rewrite validation fails. Refuse to exceed the cost threshold without human approval. Those refusals are not failure modes. They are the design.

The third question: who gets notified when compaction fails or when the cost threshold is crossed? If the answer is unclear, the automation is not operationally ready. Agents do not remove ownership. They make ownership more important because they can trigger more maintenance events in less time.

## A Realistic Pilot Shape

A realistic pilot should look like a high-churn streaming ingestion table whose file count crosses a threshold after a busy ingest window. That scenario is narrow enough to test and broad enough to reveal platform boundaries. It should include one clean compaction run, one run that detects active writers and defers, one run where post-rewrite validation finds a mismatch, and one run that exceeds the cost threshold. The point is not to make the pilot impressive. The point is to make it diagnostic.

Include a repetition test. Run compaction repeatedly across a few days of normal ingestion. Many systems succeed on the first clean run. Fewer systems remain safe across multiple cycles, schema changes, ingestion spikes, and concurrent query load.

## Metrics That Should Drive the Next Decision

The first metrics to watch are file count before and after, planning time improvement, rewrite compute cost, and post-compaction validation pass rate. Those measurements should lead to a decision about whether to expand scope, tune thresholds, hold, or roll back. If the team cannot name the decision connected to a metric, the metric is probably not useful yet.

A second group of metrics should track reliability: how often did the agent defer due to writer detection? How often did post-rewrite validation fail? How often did cost threshold checks block a run? Those signals tell you whether the safety logic is working.

A third group should track cost. Compaction that reduces scan cost but creates runaway compute cost is not an improvement. Track both sides of the cost equation.

## What I Would Cut From a Weak Rollout

Cut broad partition scope first. An agent targeting every partition in every table is much harder to test than an agent targeting one high-churn partition in one table. Start narrow and expand when the behavior is understood.

Cut unvalidated rewrites. Any compaction run that does not record snapshot IDs and verify row counts is not safe for production. The validation step is not optional.

Cut concurrent writer support from the first phase. Some tables need compaction while writers are active, but that is a harder problem requiring OCC coordination. Start with tables that have clean write windows.

## The Practical Standard

The practical standard is not perfection. It is explainability under pressure. When an operator questions a compaction run, there should be a log showing the trigger signal, the writer-detection check, the partition selection rationale, the cost estimate, the before and after snapshot IDs, and the validation result. When a compaction fails, the failure should point to the layer that needs attention.

That standard is demanding, but it is realistic. It lets teams automate table maintenance without pretending that agents remove the need for careful operational design.

## My Recommendation

Take event-driven table compaction seriously, but do not oversell it. The useful bar is simple: can the team explain the contract, test the behavior, enforce the policy, measure the result, and recover from failure?

If the answer is yes, the pattern deserves a production pilot. If the answer is no, the next step is not a bigger announcement. The next step is a narrower contract and a better test.

Well-maintained tables help every query engine and make governed analytical loops less brittle. Platforms that combine open storage with workload-aware performance monitoring, like Dremio, benefit when the tables underneath them are clean and well-organized. The agent that keeps those tables healthy is doing infrastructure work that the analytical layer directly benefits from.

For a deeper foundation on lakehouse and AI architecture, explore Alex Merced's books on data lakehouses and AI at [books.alexmerced.com](https://books.alexmerced.com). To try a governed, open, agent-ready lakehouse in practice, start a free trial of Dremio's Agentic Lakehouse at [dremio.com/get-started](https://www.dremio.com/get-started).
