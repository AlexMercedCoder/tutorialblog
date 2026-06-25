---
title: "Server-Side Commit Deconflicting in REST Catalogs"
date: "2026-06-22"
description: "Server-side commit deconflicting is about moving concurrency control closer to the catalog contract."
author: "Alex Merced"
category: "Lakehouse"
tags:
  - Iceberg commits
  - REST catalog concurrency
  - optimistic concurrency control
---


Server-side commit deconflicting is about moving concurrency control closer to the catalog contract. For engineers responsible for high-concurrency lakehouse writes, the useful question is what changes in production and what simply sounds current.

![commit conflict handling architecture map](/images/2026/week22-june-2026/server-side-commit-deconflicting-rest-catalogs-diagram-1.png)

## When Many Automated Writers Update the Same Table, a Retry Loop in Every Client Is a Fragile Coordination Strategy

When many automated writers update the same table, a retry loop in every client is a fragile coordination strategy.

The architecture matters because agents compress the time between question, query, interpretation, and action. That matters because high-concurrency lakehouse environments can have streaming jobs, batch pipelines, compaction workers, and agent-driven writes all touching the same table simultaneously. If each client manages its own conflict detection independently, the behavior under load is inconsistent and hard to audit.

The contracts that already mattered now matter more. Snapshot preconditions, retry semantics, conflict detection behavior, and catalog-side logging have to be explicit enough for both platform operators and client authors to rely on them.

## What the Specs Support

The strongest public sources for this topic are the [Apache Iceberg specification](https://iceberg.apache.org/spec/), the [Apache Iceberg REST catalog specification](https://iceberg.apache.org/rest-catalog-spec/), and [Apache Polaris documentation](https://polaris.apache.org/). I use those to ground the architecture and avoid treating every June 2026 announcement as a shipped production capability.

The evidence supports a few grounded points:

- Iceberg commits rely on atomic metadata updates and conflict detection.
- High-concurrency writers need predictable retry and failure semantics.
- Catalog-side coordination can make commit behavior more consistent across clients.

That is enough to write a useful technical article. It is not enough to make sweeping claims. I separate released behavior, design direction, and market language because readers can work with careful distinctions. They cannot operate slogans.

## The Architecture Pattern

A commit is not just a file write. Writers create data files, propose metadata changes, and attempt to advance the table snapshot. The catalog is where table identity and snapshot state become authoritative. If conflict detection is scattered across clients, each engine can interpret retries differently. If the catalog owns more of the deconflicting contract, clients can become simpler and audit records become cleaner.

For this architecture, the five layers worth keeping distinct are storage, catalog, execution, semantics, and agent interface. Storage holds durable files and snapshots. The catalog resolves identity and access. The execution layer plans and runs work. The semantic layer gives business meaning. The agent interface controls which questions and actions are allowed.

The point is not to collapse those layers into one box. The point is to make the handoffs clear. If a user or agent asks for an answer, the platform should be able to explain which table, which snapshot, which definition, which identity, and which policy shaped the result.

![Operating workflow for commit conflict handling](/images/2026/week22-june-2026/server-side-commit-deconflicting-rest-catalogs-diagram-2.png)

## A Production-Shaped Example

A practical test uses three concurrent writers. One appends files, one rewrites data through compaction, and one updates metadata. The test should prove which commits succeed, which retry, which fail, and what the operator sees in the catalog logs. The goal is not zero conflicts. The goal is conflicts that are understandable and recoverable.

The test should include a happy path and at least three failure paths. One failure should involve a commit precondition violation: an appender's snapshot requirement is not met because a compaction ran concurrently. One should involve a maintenance overlap: compaction and a metadata update attempt simultaneously. One should involve a retry limit: a writer exhausts its retry count without a successful commit and must be manually recovered. Those failures are where the platform either earns operational trust or creates incident chaos.

The test should also produce evidence. Save commit IDs, snapshot IDs, precondition check logs, retry counts, and rejection reasons. If the team cannot trace an incident to a specific commit rejection, the audit trail is incomplete.

## What To Measure

Start with four specific measurements:

- **Commit rejection reasons separated by conflict type:** Track whether a commit failed because of an append conflict (another writer advanced the snapshot), a rewrite conflict (compaction invalidated the expected file set), or a metadata conflict (the expected schema or partition spec changed). Grouping all rejections together makes it impossible to target the right fix. Append conflicts may require smarter client retry logic. Rewrite conflicts may require compaction scheduling adjustments.
- **Retry count per writer before success or failure:** Track how many retry attempts each writer makes before either succeeding or giving up. A high average retry count signals that the write concurrency is too high for the table's commit rate, or that the retry backoff interval is too short. A writer that succeeds on the first or second attempt is operating in a healthy concurrency window.
- **Maintenance job overlap with active writers:** Explicitly track when compaction, snapshot expiration, or orphan file cleanup jobs overlap with active append or rewrite writers. Maintenance operations are often the most disruptive concurrent actors on a high-write table. Knowing when they overlap with production writes is the first step to scheduling them more carefully.
- **Snapshot lineage integrity verified after concurrent operations:** After a high-concurrency test window, verify that the snapshot history is clean: no orphaned snapshots, no dangling file references, and no commits that bypassed the expected precondition checks. Snapshot lineage problems are often invisible until a reader unexpectedly sees partial data from a failed write attempt.

Measurements should connect to decisions. A metric that nobody uses is telemetry decoration.

## Common Failure Modes

The first mistake is treating server-side commit deconflicting as a feature checklist. A checklist can confirm that OCC exists, but it rarely explains how the catalog handles conflicts between different writer types (appenders versus rewriters) or between writers and maintenance jobs. The better move is to write the operating contract. Name the conflict types, the expected retry behavior, the maximum retry limit, and the recovery path for writers that fail.

The second mistake is ignoring boundaries. Most commit conflict incidents appear at the boundary between the writer and the catalog: the writer's snapshot precondition is valid when it starts the write but invalid by the time the commit is submitted. That race is the expected OCC behavior, but it becomes a problem when the retry logic is not implemented consistently across different client types.

The third mistake is hiding tradeoffs behind the deconflicting label. "Server-side commit deconflicting" is not a mechanic. The useful claim is: under this catalog, this number of concurrent writers, and this commit rate, the rejection rate is this, the average retry count is this, and the maintenance job overlap causes this specific impact on writer latency. If those numbers are vague, the design is still vague.

The most expensive failures are usually quiet. A compaction job and an append writer both succeed, but the compaction committed first and the appender's snapshot precondition was based on the pre-compaction state. The catalog correctly rejects the appender. The appender retries and succeeds. But the retry was not recorded, the operator does not know it happened, and the next capacity planning exercise assumes the table has less write contention than it actually does.

## Guardrails for Agentic Use

Agent-driven writes should start with narrow, controlled append operations. They should not perform compaction or broad rewrite operations without explicit human-reviewed scheduling. The write scope for agent tools should be append-only unless the agent workflow has been explicitly designed and tested for wider table modifications.

I would also require a visible commit failure path for agent writers. If a commit fails after the retry limit, the agent should report the failure with the rejection reason, not silently proceed. A write that the agent believes succeeded but the catalog rejected is a data integrity problem.

## Operational Checklist

| Area | Question to answer | Why it matters |
|---|---|---|
| Ownership | Who owns the write pipeline, the retry configuration, and the conflict recovery process? | Incidents need named owners, not shared confusion. |
| Scope | Which writer types are in scope for this rollout? | A narrow writer scope is easier to test and govern. |
| Concurrency | What is the maximum concurrent writer count for this table? | Concurrency limits define the expected conflict rate. |
| Evidence | Which commit IDs, rejection reasons, and retry counts are saved? | Audit trails need specific commit-level records. |
| Rollback | What is the recovery process when a writer exceeds the retry limit? | Failed writes need an explicit recovery path. |

This checklist is intentionally plain. The hard part is not implementing OCC. The hard part is defining the expected conflict types and recovery procedures before a high-concurrency incident reveals them.

![Open lakehouse operating model for commit conflict handling](/images/2026/week22-june-2026/server-side-commit-deconflicting-rest-catalogs-diagram-3.png)

## What Engineers Should Verify

Engineers should verify exact catalog versions, OCC behavior under concurrent append and rewrite writers, retry configuration, maintenance job overlap handling, and snapshot lineage integrity after high-concurrency windows. Claiming "commit deconflicting support" is not enough. The team needs to know which conflict types were tested and which recovery paths were verified.

The practical test is simple: can another engineer reproduce a compaction-versus-appender conflict, understand the rejection reason from the catalog logs, and verify that the appender's retry eventually succeeded without orphaned files? If not, the conflict handling is not verified.

The setup should also be tested under peak concurrency. Many catalogs handle low-concurrency writes correctly. Production readiness means the conflict detection and retry behavior are correct when ten or twenty concurrent writers are hitting the same table.

## What Data Owners Should Verify

Data owners should verify that the tables they own have defined maximum write concurrency levels and that maintenance job schedules are documented and reviewed before high-traffic write windows. A data owner who does not know when compaction runs on a high-write table cannot make informed decisions about write latency expectations.

This review should happen before agent-driven writes are deployed. If an agent can write to a table, the data owner should confirm the retry limit, the conflict recovery process, and the audit trail expectations.

## What Executives Should Hear

The summary should be plain: server-side commit deconflicting makes high-concurrency lakehouse writes more predictable by moving conflict detection closer to the catalog rather than relying on each client to implement its own retry logic. It is valuable when multiple writer types share a table and the conflict rate needs to be auditable.

The value is predictable write behavior and clean audit trails under concurrent load. The limit is that deconflicting does not eliminate conflicts. It makes them more observable and more recoverable.

## A Good First Rollout

Start with one table that has known concurrent writers: an append pipeline, a compaction job, and a metadata update process. Document the expected conflict types and retry behavior for each. Run all three simultaneously for a defined test window. Measure rejection rates, retry counts, and snapshot lineage integrity.

Define success with three outcomes. The first is correctness: no orphaned files or invalid snapshots after the concurrent test window. The second is observability: every rejection has a logged reason and every retry has a logged attempt. The third is operability: the recovery process for a writer that exceeds the retry limit is documented and tested.

After that, expand to more tables or higher concurrency. Expanding one table at a time is slower, but it creates a clear picture of each table's conflict profile before adding complexity.

## Deeper Design Notes

The design work should begin with the writer types on each high-traffic table. Name the appenders, the rewriters, the metadata updaters, and the maintenance jobs. Name their expected concurrency levels and their expected conflict types. When those are vague, the deconflicting design is solving a problem that has not been fully described. Start with the concrete writer inventory and build outward.

The next step is to define the dimensions that actually change behavior: snapshot preconditions, concurrent writer count, retry backoff interval, maintenance job scheduling, and catalog audit record format. These are not decorative details. They determine whether the commit behavior is predictable under real concurrency.

## Review Questions Worth Asking

The first question is simple: what are the concurrent writer types on each high-traffic table, and what is the expected conflict rate between them? If nobody has measured it, the concurrency design is based on assumptions.

The second question: what is the recovery process when an appender exceeds the retry limit because compaction ran concurrently? If the answer is "the operator manually retries," the process is not designed for automated scale.

The third question: who gets notified when the reject rate for a specific table exceeds a threshold? If the answer is unclear, the conflict monitoring is not operational.

## A Realistic Pilot Shape

A realistic pilot should look like three concurrent services: an appender, a compaction job, and a metadata updater, all writing to the same table over a two-hour window with logging enabled. The pilot should capture rejection rates, retry counts, maintenance overlap incidents, and snapshot lineage state at the end. The point is not to achieve zero conflicts. The point is to verify that the conflict behavior matches the operating contract.

Include a repetition test. Run the same concurrent writer scenario across several days. Conflict behavior under sustained write pressure is often different from behavior during a two-hour test window.

## Metrics That Should Drive the Next Decision

The first metrics to watch are commit rejection rate by conflict type, average retry count by writer type, maintenance job overlap frequency, and snapshot lineage integrity rate after concurrent windows. Those measurements should lead to a decision about whether to adjust the maintenance schedule, change the retry configuration, limit concurrent writer count, or split write workloads across tables.

A second group of metrics should track audit completeness: does every rejection have a logged reason? Does every retry have a logged attempt? Audit completeness is not a nice-to-have for high-concurrency write systems. It is required for post-incident analysis.

A third group should track engineering cost: how complex is the retry logic for each writer type? Complex client-side retry is a cost that server-side deconflicting should reduce over time. Track whether the server-side contract simplifies the client implementations.

## What I Would Cut From a Weak Rollout

Cut agent-driven writes from the first phase. Start with well-understood writer types: append pipelines and compaction jobs. Add agent-driven writes after the conflict model for the predictable writers is validated.

Cut unmonitored maintenance jobs. Any compaction or cleanup job that runs without logging its overlap with active writers is a blind spot in the conflict model.

Cut multi-table concurrent write testing from the first phase. Start with one table and a defined writer inventory. Add more tables after the first table's conflict model is understood.

## The Practical Standard

The practical standard for server-side commit deconflicting is not zero conflicts. It is predictable, observable, and recoverable conflict behavior under realistic concurrent load. When a write fails, the operator should be able to identify the conflict type, the snapshot precondition that was violated, and the recovery path from the catalog logs.

That standard is demanding, but it is realistic. It lets teams operate high-concurrency lakehouse tables without pretending that OCC eliminates write coordination complexity.

## My Recommendation

Take server-side commit deconflicting seriously for high-concurrency write environments, but invest in the operating contract before the implementation. The useful bar is simple: can the team name the concurrent writer types, define the expected conflict behavior, verify the retry and recovery logic, and audit specific failures from catalog logs?

If the answer is yes, the pattern deserves a production rollout. If the answer is no, the next step is not a more sophisticated deconflicting algorithm. The next step is a clearer writer inventory and a tested conflict model.

The open tables angle is operationally relevant when multiple engines participate safely on the same data and analytical users still get a reliable SQL layer above the table. That is a stronger story than claiming one product owns the whole commit path.

For a deeper foundation on lakehouse and AI architecture, explore Alex Merced's books on data lakehouses and AI at [books.alexmerced.com](https://books.alexmerced.com). To try a governed, open, agent-ready lakehouse in practice, start a free trial of Dremio's Agentic Lakehouse at [dremio.com/get-started](https://www.dremio.com/get-started).
