---
title: "Turning an Analytics Question Into a Verified Agentic Graph"
date: "2026-09-28"
description: "A complete AGS 1.0 graph for governed metric questions, with verification gates, deterministic check scripts, and reconciliation against a semantic layer."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - AI Agents
  - Agentic Graph Specification
  - Multi-Agent
  - Semantic Layer
  - Verification
canonical: https://iceberglakehouse.com/posts/ags-multi-agent-analytics-workflow/
---

> **Cross-posted.** This article's canonical home is [Alex Merced's Lakehouse Blog](https://iceberglakehouse.com/posts/ags-multi-agent-analytics-workflow/).

A multi-agent analytics workflow built with the Agentic Graph Specification (AGS) is a YAML file that splits one business question into bounded steps. Each step declares its inputs, outputs, model tier, budget, and machine-checkable success criteria. Verification gates sit between steps, so a wrong number fails a check before any person reads it.

Here is the problem that design solves. An analyst asks an AI agent a simple question: what was the conversion rate by region last quarter? The agent has a SQL tool, a catalog browser, and a good model. It returns a clean table in 40 seconds. The east region shows 9.5 percent. The real figure is 4.2 percent.

Nothing errored. The agent found a daily stats table with a precomputed conversion rate column and averaged it across days. One low-traffic day with a high rate pulled the average up. The query was valid SQL against a real table. It answered a different question than the one asked.

This article shows how to structure that workflow as an agentic graph instead of a single agent loop. It walks through a complete, validated AGS 1.0 graph for answering governed metric questions. The graph separates planning, metric resolution, SQL synthesis, execution, reconciliation, and writing. Each step has its own model tier and budget, and each step must pass explicit checks before the next one starts.

A disclosure before going further. I wrote the Agentic Graph Specification, and I work at Dremio, which ships an MCP Server and an AI Semantic Layer. The graph in this article is vendor-neutral and runs against any semantic layer that exposes its definitions through the Model Context Protocol (MCP). For the design of the specification itself, including why the plan and the agent are separate files, see [The Plan and the Worker: Two Open Specifications for Agent Harnesses](https://datalakehousehub.com/blog/agentic-graph-open-agent-profile-two-open-specs-agent-harnesses). This piece is the applied half: one real graph, built for analytics, explained node by node.

## Why One Agent With Every Tool Fails on Analytics Questions

The default architecture for AI analytics is one agent in one loop. It gets the question, a set of tools, and a large context window. It plans, calls tools, reads results, and repeats until it produces an answer. For exploratory work, that design is fine. For numbers that people will act on, it fails in specific ways.

**Planning and execution blur together.** The agent decides what "conversion rate" means at the same moment it writes the query. There is no point where the interpretation is written down and checked before data gets touched. If the interpretation is wrong, every step after it is wrong in the same direction.

**Nothing forces verification.** A single loop stops when the model decides it is done. The model is good at producing answers that look finished. It is not reliably good at noticing that a join multiplied rows, or that a ratio got averaged. Verification happens only if the model thinks of it, and a model that made the error in the first place is poorly placed to catch it.

**Cost and capability are one setting.** The whole loop runs on one model. Transcribing a result file gets the same expensive model as designing a join across three fact tables. Either you overpay for the easy parts, or you underpower the hard parts.

**Failures have no structure.** When the loop goes wrong, you get a long transcript. You do not get a record that says the metric resolution step succeeded, SQL synthesis failed its fan-out check twice, and the third attempt passed at a higher model tier. Without that structure, nobody can improve the process, and nobody can audit an answer later.

**Humans are either everywhere or nowhere.** Either a person approves every tool call, which makes the agent pointless, or the answer goes straight out. There is no clean place to put a single review at the moment it matters.

Every one of those problems comes from the same root. The decomposition of the work lives inside the model's head, recomputed on every run and invisible to everyone else. The fix is to write the decomposition down.

## What the Agentic Graph Specification Adds

AGS makes the plan a file. An agentic graph is a directed acyclic graph in which every node is a bounded agentic loop, meaning one unit of work an agent runs from start to finish, and every edge is a control-flow dependency. A node is not a prompt and not a function call. It is a complete small task with a defined result.

The specification is at version 1.0 under the Apache 2.0 license. Support libraries at version 1.0.4 exist for Python, TypeScript, Go, Rust, and Java, each with a validator. Documents are YAML or JSON, and the two encodings are equivalent.

The parts of a node that matter most for analytics are these.

**Typed inputs and outputs.** Each node declares what it receives and what it must produce. An output can carry a JSON Schema. A node that finishes without producing its required outputs has failed, whatever the model claims.

**Success criteria.** Each node lists checks that decide whether it passed. There are several kinds: a shell command that must exit zero, a file that must exist, an output that must match a schema or a regular expression, an expression over the node's outputs, a model-scored rubric, or a human sign-off. When a check fails, the node retries with the failed check's description and evidence injected into the next attempt.

**Intelligence tiers.** Instead of naming a model, a node declares how hard the task is: `minimal`, `standard`, `advanced`, or `frontier`. The harness maps tiers to models through its own routing profile. The spec forbids a harness from quietly routing a node to a weaker model class than it asked for. Retries can escalate one tier at a time.

**Budgets.** Nodes carry ceilings on agent steps, tokens, cost, and wall-clock time. The graph carries global ceilings too. The effective ceiling for a node is the smaller of its own limit and what remains of the global budget.

**Control flow.** Decision nodes select one labeled branch. Gate nodes are human checkpoints that never call a model. Loops and fan-out exist, but only with hard iteration ceilings, because the graph must stay acyclic and its termination must be visible by inspection.

**Conformance levels.** A harness declares a level from 0 to 3. Level 1 runs tasks and gates. Level 2 adds decisions, conditional edges, and expression and schema checks. Level 3 adds loops, fan-out, subgraphs, model-judged criteria, and run records. A graph declares the level it needs, and a harness below that level must refuse the graph rather than silently skip features.

None of that is specific to analytics. What makes it fit analytics well is that numbers are checkable. A reconciliation is a comparison of two numbers. A fan-out is a row count. A misused ratio is visible in the query text. Analytics questions offer more deterministic verification points than almost any other agent task, and AGS gives each one a place in the plan.

## Decomposing the Question Into Roles

The graph in this article has eight nodes. Each one exists because a single loop tends to fail at that exact point.

**Scope the question.** The first node restates the question as a structured plan: metrics, dimensions, grain, time window, filters. It does not touch data. Writing the interpretation down first means the interpretation itself can be checked, logged, and shown to a person later. This is a `standard` tier task. The instruction mostly determines the answer, and a schema check catches malformed plans.

**Resolve metrics.** The second node looks up every planned metric and dimension in the semantic layer through an MCP server. It records each definition, its additivity, and the grains it supports. Anything not found goes on an unresolved list. The node is told explicitly not to guess. This step is where "conversion rate" stops being a phrase and becomes a governed definition with a numerator and a denominator.

**Decide coverage.** The third node is a decision node with no model call. It checks whether the unresolved list is empty. If it is, the graph proceeds to SQL. If not, the graph routes to a node that writes a gap report for the data team and stops. An agent that cannot find a governed definition should say so. It should not improvise one.

**Write SQL.** The fourth node writes one query against the resolved definitions. It is the only `advanced` tier node, because this is where a plausible wrong answer is born. It must pass two command checks before it counts as done: a static scan for re-aggregated non-additive measures and a probe for join fan-out. It gets three attempts, each retry receives the failed check's output, and each retry escalates the model tier.

**Run the query.** The fifth node executes the approved query and records the Apache Iceberg snapshot ID of every table it read. This is `minimal` tier work with reproducible sampling. Recording snapshot IDs is what makes the answer reproducible later with time travel.

**Reconcile.** The sixth node asks the semantic layer for the headline metric total over the same window and filters through the semantic layer's own metric path, not through the generated SQL. It compares the two totals and reports the percentage difference. The success check is an expression: the difference must be within a tolerance passed in as a graph parameter. If it fails, the node escalates to a human analytics engineer with both numbers.

**Write the finding.** The seventh node writes a short answer with numbers, window, grain, and snapshot IDs. A regular expression checks that at least one snapshot ID appears. A model-judged rubric, sampled three times, checks that every number in the text appears in the result file.

**Sign off.** The eighth node is a gate. An analyst sees the finding and the reconciliation explanation and approves or rejects. No model runs here.

Two roles are deliberately absent. There is no general "supervisor" agent that watches the others, because the graph structure does that job deterministically. There is also no separate "critic" agent re-reading the SQL in free form. Criticism that can be expressed as a check is a check. Criticism that cannot be expressed as a check goes to the human at the gate.

## Verification Gates Are the Point

The graph's value comes from where it refuses to continue. Here is how each check maps to a failure that a single loop lets through.

The plan must match a JSON Schema that requires metrics, dimensions, grain, and a time window. That catches an answer that never committed to a grain, which is the most common source of numbers that cannot be compared with anything.

The resolution step must account for every name in the plan. Its success check is an expression that the count of resolved plus unresolved names is at least the count of planned names. That stops the agent from quietly dropping a metric it failed to find.

The coverage decision is pure expression evaluation. No model reads the unresolved list and decides it is "close enough."

The SQL step's two command checks are deterministic programs. They are the heart of the design, and the next sections show them in detail. They check the query text and the query's behavior, not the model's confidence.

Reconciliation compares two independently computed numbers. If the generated SQL and the semantic layer's own metric path disagree by more than half a percent, something is wrong with one of them, and a person needs to look before anyone reads the answer.

The writing step pairs a model judge with a deterministic regular expression. The spec recommends exactly this pairing: a model-scored criterion is legitimate for work that is not mechanically checkable, but authors should pair it with at least one deterministic check, and should sample the judge three times for anything that gates expensive downstream work. The judge also runs at a higher tier than the writer, with an adversarial review hint.

The gate is last. By the time an analyst sees the finding, the plan was checked, every metric was governed, the query passed static and dynamic checks, and the total reconciled. The analyst's review goes to what only a person can judge: whether the answer actually addresses what the business wanted to know.

## The Graph, Section by Section

The full graph is 435 lines and validates with zero errors and zero warnings against the AGS 1.0 validator. It is published alongside this article as `governed-metric-question.agraph.yaml`. The excerpts below cover the parts that carry the design.

The header declares identity, the conformance level required, parameters, shared context, and global limits:

```yaml
ags_version: "1.0"
kind: AgenticGraph
id: analytics/governed-metric-question
title: Answer a business question from governed metrics, with verification gates
version: 1.0.0
requires_conformance: 3

params:
  question:
    type: text
    description: The business question, in plain language.
    required: true
  max_reconcile_delta_pct:
    type: number
    description: Largest allowed gap between the SQL answer and the semantic layer total.
    required: false
    default: 0.5

context:
  metric_rules: >
    Use only metrics and dimensions that exist in the semantic layer. Never invent a
    metric. Never average a ratio metric across rows. Recompute ratios from their
    numerator and denominator at the requested grain. Report the table snapshot IDs
    every query read.

constraints:
  max_cost_usd: 8.0
  max_wall_clock_seconds: 3600
  max_node_executions: 25

policy:
  on_node_failure: halt
  checkpointing: per_node
```

Level 3 is required because the writing step uses a model-judged criterion. A harness at level 2 refuses the graph. The `metric_rules` context is shared text that any node can bind as an input, so every agent that touches metrics sees the same rules. The eight-dollar budget and 25-execution ceiling cap a runaway run. `on_node_failure: halt` means the first unrecovered failure stops everything. For a workflow whose output is a number people will trust, partial answers are worse than no answer.

The metric resolution node shows how MCP fits in:

```yaml
  resolve_metrics:
    type: task
    title: Resolve every planned metric against the semantic layer
    depends_on: [scope_question]
    inputs:
      plan:
        type: object
        description: The analysis plan.
        from: nodes.scope_question.outputs.plan
    outputs:
      resolved:
        type: array
        description: Metric and dimension definitions found in the semantic layer.
      unresolved:
        type: array
        description: Names from the plan that the semantic layer does not define.
    intelligence:
      tier: standard
      hints: [tool_use_heavy]
    requirements:
      mcp_servers: [semantic_layer]
      network: restricted
      workspace: none
    success:
      criteria:
        - id: accounted_for
          kind: expression
          description: Resolved plus unresolved covers every name in the plan.
          expr: >
            len(self.outputs.resolved) + len(self.outputs.unresolved) >=
            len(self.inputs.plan.metrics) + len(self.inputs.plan.dimensions)
```

`mcp_servers` names the server the node needs. The name is logical. The harness maps it to a real endpoint, and if it cannot supply it, the node is blocked before any tokens are spent. `workspace: none` means this node cannot read or write files at all. It only talks to the semantic layer. Every node gets the narrowest permissions its job requires, and the spec treats declared permissions as a ceiling the harness can lower but never raise.

The coverage decision needs no model:

```yaml
  coverage:
    type: decision
    title: Check whether the semantic layer covers the question
    depends_on: [resolve_metrics]
    decision:
      question: "Did every planned metric and dimension resolve?"
      evaluator: expression
      branches:
        - label: covered
          description: Everything resolved.
          when: len(nodes.resolve_metrics.outputs.unresolved) == 0
        - label: gaps
          description: At least one name has no governed definition.
          when: len(nodes.resolve_metrics.outputs.unresolved) > 0
      default_branch: gaps
```

With `evaluator: expression`, the harness evaluates each branch's condition in order and picks the first true one. The default is `gaps`, so any evaluation surprise routes to the safe path. Two conditional edges at the bottom of the file connect `covered` to SQL synthesis and `gaps` to the gap report.

The SQL node is where most of the design effort goes:

```yaml
  write_sql:
    type: task
    title: Write SQL against the governed definitions
    intelligence:
      tier: advanced
      hints: [code_generation, precision_critical]
      escalate_to: frontier
      rationale: A wrong join or aggregation returns a plausible number with no error.
    requirements:
      tools: [file_write, file_read, shell_exec]
      mcp_servers: [semantic_layer]
      permissions:
        - fs:write:work/**
        - fs:read:checks/**
        - shell:exec:python checks/*
      workspace: read_write
    constraints:
      max_agent_steps: 20
      max_cost_usd: 2.0
    failure:
      retry:
        max_attempts: 3
        retry_on: [criteria_failed, tool_error]
        feedback: failed_criteria
        escalate_intelligence: true
      on_exhausted: fail
    success:
      evaluation_order: cheapest_first
      criteria:
        - id: static_semantics
          kind: command
          description: No ratio or distinct-count metric is re-aggregated with SUM or AVG.
          run: python checks/lint_semantics.py work/query.sql
          expect_exit_code: 0
          timeout_seconds: 60
        - id: no_fanout
          kind: command
          description: Joins in the query do not multiply rows of the fact table.
          run: python checks/fanout_probe.py work/query.sql
          expect_exit_code: 0
          timeout_seconds: 300
```

The `rationale` field explains why this node earns an expensive tier. The spec recommends a rationale on every `advanced` or `frontier` node, so a reviewer can challenge the routing cost. The shell permission allows only the check scripts. `cheapest_first` lets the harness run the 60-second lint before the five-minute probe and stop at the first failure.

The retry block turns failures into guidance. With `feedback: failed_criteria`, the next attempt receives the failed check's description and its recorded evidence, which here is the lint script's stdout. The agent's second attempt sees a line like "AVG(conversion_rate) re-aggregates a non_additive measure" instead of a vague instruction to try again. With `escalate_intelligence: true`, the second attempt runs at `frontier`.

The reconciliation node carries the graph's most important check:

```yaml
    failure:
      escalation:
        to: human
        roles: [analytics_engineer]
        message: >
          SQL and semantic layer totals differ by ${{ nodes.reconcile.outputs.delta_pct }}
          percent for: ${{ params.question }}
        include: [outputs, failed_criteria]
      on_exhausted: escalate
    success:
      criteria:
        - id: within_tolerance
          kind: expression
          description: The difference is inside the allowed tolerance.
          expr: self.outputs.delta_pct <= params.max_reconcile_delta_pct
```

No retry is configured here on purpose. If two independent computations disagree, running the comparison again with a different model does not fix the underlying data or definition problem. The node goes straight to a person, with both outputs attached.

The gate closes the graph:

```yaml
  analyst_signoff:
    type: gate
    title: Analyst approves the finding
    depends_on: [write_findings]
    gate:
      mode: approve
      roles: [analyst]
      prompt: "Approve this answer to: ${{ params.question }}"
      present:
        - nodes.write_findings.outputs.findings
        - nodes.reconcile.outputs.explanation
      timeout_seconds: 172800
      on_timeout: hold
      on_reject: fail
```

The gate shows the analyst the finding and the reconciliation explanation together. With `on_timeout: hold` and per-node checkpointing, an unanswered gate suspends the run instead of approving by default. The run resumes when someone answers, even days later.

## The Check Scripts Behind the Command Criteria

Command criteria are only as good as the programs they run. Here is the static check, tested against sqlglot, the open source SQL parser.

```python
"""Fail when a query re-aggregates a column the semantic layer marks non-additive."""
import json
import sys

import sqlglot
from sqlglot import exp

# Exported from the semantic layer: column name -> additivity
ADDITIVITY = json.load(open("checks/additivity.json"))
REAGGREGATES = (exp.Sum, exp.Avg)


def violations(sql: str):
    tree = sqlglot.parse_one(sql)
    found = []
    for agg in tree.find_all(*REAGGREGATES):
        for col in agg.find_all(exp.Column):
            kind = ADDITIVITY.get(col.name.lower())
            if kind in ("non_additive", "semi_additive"):
                found.append(f"{agg.key.upper()}({col.name}) re-aggregates a {kind} measure")
    return found


if __name__ == "__main__":
    problems = violations(open(sys.argv[1]).read())
    for p in problems:
        print(p)
    sys.exit(1 if problems else 0)
```

The script parses the query into a syntax tree and finds every `SUM` and `AVG`. For each column inside one, it looks up that column's additivity in a file exported from the semantic layer. If a non-additive or semi-additive column sits inside a re-aggregation, the script prints the violation and exits with status 1. The AGS harness sees a nonzero exit, marks the criterion failed, and feeds the printed line into the retry.

I ran it against the query from the opening. `SELECT region, AVG(conversion_rate) ...` fails with one violation. The corrected form, `SUM(orders) * 1.0 / SUM(sessions)`, passes. On a four-row test table, the averaged version reports 9.5 percent for the east region, and the ratio of sums reports 4.2 percent. The difference comes from one day with 3 orders on 20 sessions, weighted the same as a day with 40 orders on 1,000 sessions.

The additivity file is the key dependency. The check only knows what the semantic layer tells it. A metric store that does not record additivity cannot power this check, which is a strong argument for recording it.

The fan-out probe checks behavior instead of text. Its logic is simple: take the query's `FROM` and `JOIN` clauses, and compare the row count of the join against the count of distinct primary keys of the fact table being measured.

```sql
SELECT count(*)                   AS joined_rows,
       count(DISTINCT o.order_id) AS distinct_orders
FROM orders o
JOIN order_items i USING (order_id);
```

On a small test set with five orders and nine line items, this returns 9 joined rows for 5 distinct orders. Summing `order_total` across that join returns 1,330 instead of the true 950. The probe exits nonzero whenever the two counts differ for a measure declared at the order grain. The retry feedback tells the agent which join multiplied which fact, and the usual fix is to aggregate line items in a subquery before joining.

Neither script calls a model. Both run in seconds on sampled data. That is the pattern to follow when adding checks: turn each known way a query goes wrong into a program that fails loudly.

## A Worked Run, Node by Node

Structure is easier to trust once you see it catch something. Here is how the graph handles the question from the opening, step by step, using the failure behavior the specification defines.

The analyst submits "What was the conversion rate by region last quarter?" as the `question` parameter.

`scope_question` produces a plan: metric `conversion_rate`, dimension `region`, grain of one row per region, time window of July 1 through September 30, no filters. The plan matches the schema, so the node succeeds. This plan is now fixed. Every later node reads it through an input binding, and a harness reuses resolved inputs verbatim across retries. No later step can reinterpret the question.

`resolve_metrics` calls the semantic layer. It finds `conversion_rate` defined as orders divided by sessions, marked non-additive, with numerator and denominator available at daily grain. It finds `region` as a dimension on the sessions fact. The unresolved list is empty. The expression check confirms two names resolved for two names planned.

`coverage` evaluates its first branch condition. The unresolved list has length zero, so the decision is `covered`, and the conditional edge to `write_sql` activates. The edge to `report_gaps` stays inactive, and that node is skipped.

`write_sql` starts at the `advanced` tier. Suppose the first attempt finds the precomputed daily stats table and writes `AVG(conversion_rate)` grouped by region. The harness runs the criteria in cheapest-first order. The lint script exits with status 1 and prints one violation. The node's attempt outcome is `criteria_failed`, which is in the retry list.

The second attempt starts at `frontier`, because `escalate_intelligence` is on and `escalate_to` names that tier. Its context includes the failed criterion's description, "No ratio or distinct-count metric is re-aggregated with SUM or AVG," and the evidence, the lint output naming `AVG(conversion_rate)`. The agent rewrites the query as the sum of orders divided by the sum of sessions. The lint passes. The fan-out probe runs, finds that the query reads one table with no joins, and exits zero. The node succeeds on attempt two.

`run_query` executes the approved SQL, writes the result file, and records the snapshot ID of the stats table. It is a `minimal` tier node with reproducible sampling, so the harness pins the sampling settings where the routed model supports them.

`reconcile` asks the semantic layer for the conversion rate for the quarter through its metric query tool. That path computes the ratio from its own definition. The two totals match, the difference is zero, and the expression check passes against the half-percent tolerance.

`write_findings` writes a three-sentence answer citing the per-region rates, the quarter, the regional grain, and the snapshot ID. The regular expression finds the ID. The judge scores the text against the result file three times, and the median score clears the 0.9 threshold.

`analyst_signoff` pauses the run. The analyst sees the finding and the reconciliation explanation, approves, and the graph completes. The run record now shows the committed plan, both SQL attempts with the lint failure between them, the tier escalation, the snapshot ID, the zero difference, the judge scores, and the approver.

Now change one thing. Suppose the agent's second attempt had joined sessions to an orders table at line-item grain. The lint passes, because no non-additive column is re-aggregated. The fan-out probe catches the join multiplying order rows and fails. The third attempt receives that evidence. If it also fails, the node exhausts its retries and fails, `on_node_failure: halt` stops the run, and nobody sees a number. A failed run with a precise reason is the correct outcome when the agent cannot produce a verified answer.

## Adapting the Graph to Other Questions

The graph answers one question per run, with the question passed in as a parameter. That shape covers most ad hoc metric questions without changes. A few adaptations handle the cases it does not.

**Several independent questions at once.** Wrap the graph as a subgraph and call it from a parent graph with a `map` node. The map runs the child once per question, with a hard `max_items` ceiling and a `max_parallel` limit. Each question gets its own verification and its own snapshot IDs. The parent collects the findings in input order. Keep the gate inside the child, or add one gate at the parent level that shows every finding together.

**Questions that need a comparison against a target.** Add a second resolution step for the target metric, and a second reconciliation for it. Targets often live at a coarser grain than actuals, such as a monthly budget against daily sales. Add a check that the plan's grain is compatible with the target's grain, and route to the gap report when it is not.

**Recurring reports.** A weekly report is the same graph run on a schedule with a fixed question. The run records become a time series of verification results. A week where reconciliation fails is a data problem found before the report ships.

**Lower-risk exploration.** Copy the graph under a new `id`, lower the conformance requirement by removing the model judge, and drop the gate. Keep the lint, the fan-out probe, and reconciliation. Deterministic checks are cheap, and they are the part that stops wrong numbers. The model judge and the human gate are the parts that cost time.

In every adaptation, the rule is the same. Add structure where a failure has already happened or where the cost of a wrong number is high. Do not add agents. Add checks.

## Running the Graph Against a Governed Lakehouse

The graph assumes three things about the platform under it.

First, a semantic layer that exposes definitions through MCP. The resolution, execution, and reconciliation nodes all call the same logical `semantic_layer` server. The server needs tools to look up a metric definition, run SQL, and run a metric query through the semantic layer's own path. Dremio's MCP Server over its AI Semantic Layer is one implementation of that shape, and it is the one I use, but any server offering those tools satisfies the graph.

Second, tables that record snapshots. On Apache Iceberg, every query reads a specific snapshot, and the snapshot ID is the precise answer to "which data did this number come from." The execution node records those IDs, the finding cites them, and anyone can rerun the query later with time travel against the same state.

Third, a catalog that enforces access. The agent's MCP identity must only see what the requesting user is allowed to see. The graph's permission ceilings control what the agent can do in its own workspace. The catalog and semantic layer control what data it can read. Those are separate layers, and both need to be in place.

The harness produces a run record at level 3. It is a portable JSON document, with its own schema in the specification, that records every node's attempts, routing decisions, criteria results, and timings. For analytics, that record is the audit trail for a number. It shows the plan the agent committed to, the definitions it resolved, the checks the SQL passed, the reconciliation difference, and who approved it. Store it next to the finding.

To validate the graph before running it, use any of the support libraries' validator commands. The Python one is a single command: `python3 tools/validate_agraph.py governed-metric-question.agraph.yaml`. The npm package provides `npx ags-validate`. Put that in CI next to the graph file, so a broken edit fails a pull request instead of a production run.

## Failure Modes and Warning Signs

A verified graph still fails. The difference is that its failures are visible and specific. Here are the ones to watch.

**The semantic layer is thin.** If most questions route to the gap report, the graph is working correctly and the semantic layer is missing definitions. The gap reports are a backlog for the data team. The warning sign is pressure to relax the coverage decision so the agent "just answers." Relaxing it brings back the improvised metrics the graph exists to prevent.

**The additivity metadata is wrong or missing.** The lint check trusts the exported additivity map. A ratio column marked additive passes the check and produces a wrong answer. The warning sign is a reconciliation failure on a query that passed the lint. Treat each one as a metadata bug.

**Reconciliation compares a number to itself.** If the semantic layer's metric path compiles to the same SQL the agent wrote, the two totals always agree and the check proves nothing. The reconciliation must use an independent path, such as a metric query API or a precomputed aggregate. Test this by feeding the graph a deliberately wrong query and confirming the check fails.

**Tolerance drift.** The half-percent default is a parameter. Every time someone raises it to get a run through, the graph gets weaker. Log the tolerance used in every run record, and alert when runs use a value above the default.

**Retries mask a hard problem.** Three attempts with escalating tiers eventually produce a query that passes the checks. Some of those queries are still wrong in ways the checks do not cover. The warning sign is a high rate of third-attempt passes. When SQL synthesis routinely needs three attempts, add a check for whatever the first two attempts got wrong.

**The judge shares the writer's blind spots.** A model-judged criterion scores the finding against the result file. If the judge and the writer run on the same model, they share failure patterns. The spec requires the harness to record when the same model instance judges its own output within an attempt. Route the judge to a different model class where you can, and keep the regular expression check alongside it.

**The gate becomes a rubber stamp.** Approval gates lose value when every run gets approved in seconds. Track the time analysts spend at the gate and their rejection rate. A rejection rate of zero over hundreds of runs means either the graph is perfect or nobody is reading.

**Budgets are too tight to succeed.** A two-dollar cap on SQL synthesis combined with frontier-tier escalation can exhaust the budget before the third attempt starts. The node then fails with a budget failure rather than a criteria failure. Check that per-node budgets cover the full retry ladder at the escalated tier.

## Operational Guidance

**Version the graph like code.** The graph is a document with an `id` and a `version`. Keep it in Git, review changes in pull requests, and validate it in CI. A change to a success criterion changes what "verified" means, and that deserves the same review as a change to a metric definition.

**Keep a library of check scripts.** The lint and fan-out probe are the start. Each new way a query goes wrong in production becomes a new script and a new criterion. Keep the scripts in a shared directory with their own tests, and reference them from every analytics graph.

**Tune tiers from run records.** Run records show which tier each node actually used and how many attempts it needed. If the resolution step never fails at `standard`, leave it there. If SQL synthesis succeeds on the first attempt at `advanced` almost every time, the escalation tier rarely costs anything. If it frequently escalates, either the checks are catching real errors or the base tier is too low.

**Separate graphs by risk.** A graph for exploratory questions can drop the gate and loosen the tolerance. A graph for numbers that go to executives or regulators keeps both. Use the graph `id` to make the risk class visible, and never let a run of the exploratory graph produce output labeled as verified.

**Test the graph with planted errors.** A verification step that has never failed has never been tested. Keep a small fixture set of known-bad queries: an averaged ratio, a summed distinct count, a join that multiplies an order-grain measure, and a query with a filter on the wrong date column. Run each through the SQL node's criteria in CI and confirm each one fails with the expected message. Do the same for reconciliation by pointing it at a result file with a deliberately altered total. When someone edits a check script or the additivity export, these fixtures tell you within minutes whether the graph still catches what it used to catch.

**Watch cost per verified answer.** The global cost cap bounds a single run. The meaningful metric is cost per approved answer, including runs that failed or were rejected. Run records hold everything you need to compute it.

## Where This Is Heading

Three trends shape how graphs like this one evolve.

Semantic layers are standardizing the questions agents can ask. Open efforts on semantic model interchange and query interfaces are converging on metric definitions that carry grain and additivity as first-class fields. When those fields are standard, checks like the lint script become portable across semantic layers instead of depending on a custom export.

MCP servers are becoming the default interface between agents and governed data. The resolution and reconciliation nodes depend on a server that can answer "what is this metric" and "compute this metric" separately from "run this SQL." Servers that expose those as distinct tools make independent reconciliation straightforward.

Harness support for plan specifications is spreading. AGS started in harnesses I maintain so the spec got tested against real code from the first release. The goal is for any harness to run the same graph with the same guarantees. A graph like the one in this article then becomes a reusable asset that a data team publishes once and every agent platform in the organization runs the same way.

## Conclusion

The failure in the opening, a clean-looking 9.5 percent that should have been 4.2, is not a model quality problem. It is a structure problem. A single agent loop has no committed plan, no mandatory checks, no separation between cheap and expensive work, and no clean place for a person to review.

An agentic graph fixes the structure. The plan is written before data is touched. Every metric resolves to a governed definition or the run stops. SQL passes deterministic checks for the known ways queries go wrong, and retries receive the specific failure as guidance. Two independent computations must agree. The written answer must cite snapshot IDs and match the result file. A person approves last, looking only at what a person can judge.

The graph in this article is a starting point. Download it, point it at your semantic layer, and add a check every time a wrong answer gets through. The graph gets better each time, and each improvement applies to every future question.

## Keep Going

If this piece was useful, I have written a lot more on governed data for AI agents and the lakehouse underneath them. *Architecting an Apache Iceberg Lakehouse* covers the catalog, snapshot, and semantic layer foundation that agent workflows like this one depend on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
