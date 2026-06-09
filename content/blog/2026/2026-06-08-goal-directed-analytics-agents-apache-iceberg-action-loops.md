---
title: "Goal-Directed Analytics Agents on Apache Iceberg"
date: "2026-06-08"
description: "How goal-directed analytics agents decompose business questions into sub-tasks, execute action loops over Apache Iceberg tables, and use the lakehouse as both a data source and a state store for agent action logs."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - "goal-directed analytics agents"
  - "action loops"
  - "OODA loop analytics"
  - "Iceberg state store"
  - "agent tool-use patterns"
  - "analytics agent security"
---

A prompt-response AI answers one question and stops. A goal-directed analytics agent holds a business objective, decomposes it into sub-tasks, executes each sub-task against live data, evaluates the result, and decides whether to continue or escalate. It does not stop after one query because one query is rarely enough to answer a real business question.

Consider a goal like "Find out why Q3 revenue dropped by 8 percent compared to Q2." A prompt-response AI might execute a single SQL query and produce a plausible-sounding but factually incorrect answer. A goal-directed agent would decompose that goal into sub-tasks: check revenue by product category, check revenue by region, check for pricing changes, check for inventory issues, check for marketing campaign timing, check for competitor activity in the news. Each sub-task produces data that the next sub-task builds on. The agent loops until it has enough evidence to form a conclusion.

This article covers the architecture of goal-directed analytics agents, the action loop pattern (inspired by the OODA loop: observe, orient, decide, act), and how Apache Iceberg tables serve as both the data source and the durable state store for agent action logs.

## Goal Decomposition: From Business Question to Query Plan

The first step in any goal-directed agent is decomposition. Given a natural language goal, the agent must produce a structured plan of sub-tasks. Each sub-task has a type (SQL query, semantic tool call, external data fetch, analysis step) and a dependency on previous sub-tasks.

The decomposition is not a static plan. It is a dynamic tree. The agent executes one sub-task, examines the result, and decides which branch of the tree to explore next. This is different from a fixed pipeline where step 1 always feeds into step 2. The agent's LLM evaluates the output of each step and chooses the next action based on what it found.

For an analytics agent, the sub-task types typically include:

- **Semantic query.** Call an MCP tool like `get_revenue(period, dimension)` that returns aggregated business data from a certified semantic view.
- **SQL exploration.** Run a raw SQL query against an Iceberg table to check data distributions, null counts, or outliers. This sub-task type requires stricter governance (read-only, limited rows, limited runtime).
- **Comparison.** Compare two data sets (current period vs prior period, region A vs region B) and summarize the difference.
- **External lookup.** Fetch data from an external API (currency exchange rates, competitor pricing, weather data) that enriches the analysis.
- **Summarization.** Produce a natural language summary of findings so far. This becomes the context for the next decision.

Each sub-task is logged to a state store. If the agent crashes (API timeout, LLM error, infrastructure failure), it can recover by reading the last completed sub-task from the state store and continuing from there.

## The Action Loop: Observe, Orient, Decide, Act

The execution model for goal-directed analytics agents is the action loop, directly adapted from Colonel John Boyd's OODA loop (observe, orient, decide, act). In the agent context, the four phases are:

**Observe.** The agent reads data from the lakehouse. This might be a SQL query against an Iceberg table, a call to a semantic tool, or a scan of recent agent action logs in the state store. The observation phase produces raw data that feeds into orientation.

**Orient.** The agent analyzes the observation in the context of the original goal and previous observations. This is where the LLM does its reasoning. It interprets the data, identifies patterns, and frames hypotheses. Orientation is the most computationally expensive phase and the most prone to hallucination. The quality of orientation depends on the quality of the semantic layer: if the agent has business context (metric definitions, dimension hierarchies), orientation is grounded in real meaning.

**Decide.** Based on the orientation, the agent decides what to do next. The decision could be: execute another sub-task, form a provisional conclusion, escalate to a human, or abort the goal (if it is determined to be unanswerable with available data). The decision is logged with the reasoning that produced it.

**Act.** The agent executes the decision. For most sub-tasks, this means calling a tool (MCP server, SQL engine, API). For escalation, this means sending a message to a human reviewer with the collected evidence and the agent's analysis.

The loop repeats until the agent reaches a terminal state (conclusion, escalation, or abort). Each iteration is self-contained and durable. If the agent crashes during the act phase, the next invocation reads the last logged decision from the state store and re-executes.

This is a fundamental difference from prompt-response AI. The action loop is stateful, durable, and auditable. Every observation, orientation, decision, and action is written to the state store. A reviewer (human or automated) can replay the agent's entire reasoning chain.

## Iceberg as the Agent Action State Store

The state store for agent action logs should be an Iceberg table. Specifically, a table partitioned by agent session and ordered by action timestamp.

The schema for an agent action log table looks like this:

```sql
CREATE TABLE catalog.system.agent_action_log (
    session_id VARCHAR,
    action_id VARCHAR,
    parent_action_id VARCHAR,       -- NULL for root actions
    goal TEXT,                      -- The original business goal
    sub_task_type VARCHAR,          -- semantic_query, sql_exploration, comparison, external_lookup, summarization
    phase VARCHAR,                  -- observe, orient, decide, act
    phase_started_at TIMESTAMP,
    phase_completed_at TIMESTAMP,
    input_data TEXT,                -- SQL query, tool call parameters, API request
    output_data TEXT,               -- Query results, analysis, decision text
    tokens_used INTEGER,
    model_id VARCHAR,
    status VARCHAR,                 -- completed, failed, escalated
    error_message TEXT
) PARTITIONED BY (date(phase_started_at))
```

Using Iceberg for this table gives you:

**Durable commit.** Every action log entry is an atomic Iceberg commit. If the agent crashes mid-log, the entries up to the crash point are already committed and visible.

**Time travel.** You can query the action log as it existed at any point during the agent's execution. Debugging a confusing agent decision means time-traveling to the exact state the agent saw.

**Schema evolution.** As you add new phases or sub-task types, the action log schema evolves without breaking existing queries. Old entries have NULL for new columns.

**Partition pruning.** When reviewing a specific agent session, the query planner prunes to the single date partition of that session. Reviewing a 10,000-action session takes milliseconds.

**Concurrent reads.** Multiple reviewers (human analysts, automated audit systems) can read the action log simultaneously without locks.

The action log is the agent's audit trail, debugging interface, and recovery checkpoint all in one table.

## Tool-Use Patterns for Analytics Agents

The tools available to a goal-directed analytics agent define its capabilities and its constraints. A poorly designed tool set is either too broad (the agent can write arbitrary SQL, which is dangerous) or too narrow (the agent cannot answer most questions, which is useless).

The correct set of tools for an analytics agent, ranked from most constrained to most flexible:

1. **Certified metric tools.** `get_revenue(period, dimension)`, `get_customer_count(period, segment)`. These tools return pre-aggregated, certified data from gold-layer semantic views. They are the safest tools. The agent cannot construct an invalid query. The results are always correct by definition.

2. **Schema discovery tools.** `list_catalogs()`, `list_schemas(catalog)`, `get_table_schema(catalog, schema, table)`. These tools let the agent discover what data is available. They return metadata only, no row data.

3. **Scoped SQL tools.** `run_read_only_query(sql, max_rows, max_duration_seconds)`. This tool executes arbitrary SQL but enforces strict limits: no DML, no DDL, max 10,000 rows returned, max 30 seconds execution. The SQL is logged, validated (parsed to confirm read-only), and executed under a restricted catalog principal.

4. **Comparison tools.** `compare_metrics(metric, period_a, period_b, dimensions)`. This tool computes a structured comparison between two time periods, highlighting changes and statistical significance.

5. **External data tools.** `fetch_url(url)`, restricted to a whitelist of approved external APIs. The agent can enrich its analysis with external context without unrestricted web access.

6. **Escalation tools.** `send_for_review(analysis_text, evidence_snapshot)`. This tool submits the agent's finding to a human reviewer with a link to the action log snapshot.

The agent should never have a tool that can modify Iceberg table metadata, delete files, or change catalog roles. Write access, when needed, should be through a separate "action agent" that is independently deployed, more restricted, and requires explicit human approval for non-append writes.

## Security Boundaries for Analytics Agent Write Operations

The default assumption for a goal-directed analytics agent is read-only. The agent observes data, orients, decides, and acts by producing a report or escalating to a human. It does not modify the source tables.

There are legitimate cases where an analytics agent needs write access. Creating a derived table for a forecast model. Writing back annotations to a source table. Inserting records into an action log. In each case, the write path must be isolated from the read path.

The isolation pattern works as follows:

1. The agent authenticates with a read-only principal for 99 percent of its operations.
2. When the agent decides it needs to write, it calls a special `request_write_capability(action_plan)` tool. This tool logs the request and returns a short-lived write token only if the action plan matches predefined patterns (append to specific tables, insert into approved log tables).
3. The write token is valid for one commit and expires after 60 seconds.
4. The agent uses the write token to perform the write. The token is invalidated after use.
5. The write is logged to the agent_action_log table with the token ID and the action plan that was approved.

This pattern prevents the agent from writing unless it explicitly reasons about why it needs to write and what it plans to write. It also ensures that writes are rare, audited, and reversible.

## Practical Example: A Goal-Directed Agent Investigating Revenue Drop

Here is a walkthrough of a goal-directed analytics agent using the patterns described above.

**Goal:** "Investigate why Q3 2026 revenue dropped 8 percent compared to Q2 2026."

**Action 1 (Observe):** Call `get_revenue(period='Q3-2026', dimension='product_category')`. Receive data showing the drop is concentrated in the Electronics and Home Goods categories.

**Action 2 (Orient):** Analyze that two categories account for 80 percent of the decline.

**Action 3 (Decide):** Decompose further. Check each category for price changes, volume changes, and regional effects.

**Action 4 (Act):** Call `get_revenue(period='Q3-2026', dimension='region')` filtered to Electronics. Observe that the Electronics drop is exclusively in the North America region.

**Action 5 (Orient):** Form hypothesis that a specific product line or pricing change in North America Electronics is the cause.

**Action 6 (Decide):** Need to check product-line-level data. This requires a scoped SQL tool because the semantic layer does not have a certified view at the product-line granularity.

**Action 7 (Act):** Call `run_read_only_query("SELECT product_line, SUM(revenue) as rev FROM catalog.gold.revenue WHERE quarter = 'Q3-2026' AND region = 'North America' GROUP BY product_line ORDER BY rev")`.

**Action 8 (Orient):** Identify that the "Premium Laptops" product line dropped 40 percent quarter over quarter.

**Action 9 (Decide):** Need external data to understand why. Check news for product recalls or competitor launches.

**Action 10 (Act):** Call `fetch_url(whitelist='news_api')` with query "premium laptop recall North America Q3 2026."

**Action 11 (Orient):** Discover a major battery recall for the top-selling premium laptop model, announced in early Q3.

**Action 12 (Decide):** Enough evidence. Conclude that the Q3 revenue drop is caused by a battery recall affecting Premium Laptops in North America.

**Action 13 (Act):** Call `send_for_review(analysis_text, evidence_snapshot=snapshot_id)`.

The entire trajectory is recorded in the agent_action_log table. A human reviewer can open the evidence snapshot (a time-travel query at the exact snapshot the agent used) and verify every claim. If the agent hallucinated the battery recall, the evidence trail makes it trivially discoverable.

## Recovering from Failure

Goals and Sub-Tasks are not always possible to complete. The action log makes partial recovery practical.

If the agent crashes during Action 7 (the SQL query), the next invocation reads the action log and sees that Actions 1 through 6 are complete. It resumes from Action 7. The agent does not re-query for revenue by category or region. It continues from the last durable checkpoint.

If the agent crashes during Action 10 (the external lookup), and the external API is temporarily unavailable, the agent retries with exponential backoff (logged as additional orient/decide/act cycles). After three retries, the agent marks the external lookup as failed and decides whether to proceed with incomplete external data or escalate.

This resilience is possible only because every action is durably committed to an Iceberg table. An in-memory state store would lose the agent's state on crash. A relational database would work, but Iceberg provides the same durability plus time travel, schema evolution, and concurrent read access for debugging.

## Metrics for Goal-Directed Analytics Agent Performance

Measuring agent performance requires metrics beyond simple pass/fail rates. The action log enables these measurements:

- **Goal completion rate.** What percentage of goals result in a conclusion (versus escalation or abort).
- **Average actions per goal.** How many sub-tasks a typical goal requires. This measures the agent's efficiency.
- **Average goal duration.** Wall-clock time from goal submission to conclusion.
- **Tool call distribution.** Which tools are used most often. A high ratio of SQL exploration tools to certified metric tools indicates gaps in the semantic layer.
- **Restart rate.** How often the agent recovers from a crash. A high restart rate indicates infrastructure instability or flaky external APIs.
- **Escalation rate.** How often the agent sends findings to a human. A low escalation rate means the agent is confident. A high escalation rate means the agent lacks sufficient data or tool access.

These metrics are queryable from the agent_action_log table. A dashboard built on top of Iceberg can show live agent performance across all sessions.

## Summary

Goal-directed analytics agents represent a shift from question-answering to objective-achieving. They decompose business goals into sub-tasks, execute an OODA-inspired action loop against Iceberg tables, and log every action to a durable state store.

The action loop pattern (observe, orient, decide, act) provides a structured framework for agent reasoning that is auditable, debuggable, and crash-resistant. Iceberg's durability, time travel, and schema evolution make it the ideal state store for agent action logs.

The security model for analytics agents defaults to read-only. Write access, when required, is short-lived, narrowly scoped, and explicitly reasoned about. The semantic layer provides certified tools for common business questions. Raw SQL tools are available but restricted.

The result is an agent that can investigate complex business questions across multiple data sources and reasoning steps, producing a fully auditable chain of evidence that a human can verify. That is the production standard for analytics AI, and it is achievable with the combination of goal-directed agents and the Iceberg lakehouse.

For more on building analytics agents with governed data access, explore Dremio's Agentic Lakehouse platform at [dremio.com/agenticai](https://www.dremio.com/agenticai) or try the open-source Dremio MCP server at [github.com/dremio/dremio-mcp](https://github.com/dremio/dremio-mcp).

*Sources: Dremio Blog "AI Agents for Analytics" (dremio.com), OODA Loop Reference (thedecisionlab.com), ArXiv "The Evolution of Agentic AI Software Architecture" (arxiv.org), LakeOps "Iceberg Lakehouse with AI Agents" (lakeops.dev), IBM "What Are AI Agents" (ibm.com).*
