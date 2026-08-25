---
title: "Query Routing at Machine Scale: Dynamic Workload Distribution Across Lakehouse Engines"
date: "2026-08-25"
description: "Route each lakehouse query by shape, not by sender. Signals, rules, and how to keep dashboards, batch jobs, and agents from sharing one engine."
author: "Alex Merced"
category: "Data Engineering"
canonical: https://iceberglakehouse.com/posts/query-routing-lakehouse-engines/
tags:
  - query engines
  - lakehouse
  - routing
  - AI agents
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/query-routing-lakehouse-engines/).

At 9:15 on a Monday morning, a lakehouse receives four kinds of query in the same minute. An executive dashboard fires 40 sub-second lookups against a revenue view. A nightly transformation that ran late is still grinding through a 30-terabyte join. A data scientist submits an ad hoc query that will scan a year of events. And an AI agent, answering a question from a support rep, issues 22 small queries in a loop, each one shaped by the answer to the last. All four arrive at the same SQL endpoint, and the platform has to decide, in milliseconds, where each one runs.

If everything goes to one engine, the dashboard waits behind the join. If everything goes to a fast interactive engine, the join runs out of memory or crowds out the dashboards for an hour. If a human sorts it out by assigning queues to teams, the agent's 22 queries land in whichever queue the support tool was configured for, which was chosen before agents existed.

The right answer is a control plane that looks at each query's shape, not its sender, and routes it to the engine whose physics match. Sub-second interactive queries that an acceleration layer can answer go to the acceleration engine. Heavy scans and transformations go to a distributed batch engine. Agent loops get their own budget and their own path. The routing decision is made per query, from the query's estimated cost, its pruning breadth, its latency expectation, and the current load on each engine, and it is remade continuously as those inputs change.

This article is about building that control plane on an open lakehouse, where the same Apache Iceberg tables are readable by every engine and the catalog is shared. I will cover why one engine cannot serve every workload, what signals a router can extract from a query before it runs, how to turn those signals into routing rules, where the router physically sits, how to handle the machine-generated query streams that agents produce, how to size and scale the engines behind the router, and what goes wrong. I work at Dremio, whose engine is the acceleration layer in the examples, with Spark as the batch engine. The pattern is engine-neutral: any interactive engine and any batch engine that read the same Iceberg tables through the same catalog can sit behind the same router.

## Why One Engine Cannot Do Everything

Query engines are built around a set of physical assumptions, and the assumptions that make an engine good at one workload make it bad at another.

An interactive engine optimizes for latency. It keeps a warm pool of executors so there is no startup cost, plans queries in milliseconds, holds hot data and acceleration structures in memory or on local disk, and uses vectorized execution over Apache Arrow to make small and medium scans fast. Its scheduling favors many short queries and fair sharing among them. It is the right engine for a dashboard, a BI tool, a notebook cell, and an agent's tool call.

A batch engine optimizes for throughput on large work. It spins up executors per job, plans with an emphasis on shuffle strategy for large joins, spills to disk rather than failing when memory runs out, and is happy to run for an hour if that is what the job needs. Its scheduling favors a small number of large jobs that each get a lot of resources. It is the right engine for a 30-terabyte join, a backfill, a compaction, and a model training data pull.

Putting a 30-terabyte join on an interactive engine does one of two things: it fails when the join exceeds memory (interactive engines are tuned not to spill, because spilling destroys latency), or it succeeds slowly while consuming the executor pool that the dashboards needed. Putting a dashboard query on a batch engine means paying the job startup cost (seconds to tens of seconds) for a query that runs in 200 milliseconds.

Before open table formats, this tension was resolved by copying data: the warehouse held the dashboard data and the data lake held the batch data, and an ETL job moved data between them. With Iceberg tables in a shared catalog, both engines read the same files. The tension is still there, but it is now a scheduling problem rather than a data movement problem, and scheduling problems have a control-plane answer.

## What a Router Can Know Before a Query Runs

The routing decision has to be made before execution, which means the router can only use what is knowable from the query text, the catalog metadata, and the current state of the engines. That turns out to be a lot.

**Estimated scan breadth.** The router parses the query, extracts the tables and the predicates on each, and asks Iceberg how many files and how many bytes survive partition pruning and file skipping. This is exactly the scan planning a query engine does, and it can be done cheaply in the router with PyIceberg or by calling the REST catalog's scan planning endpoint. A query whose predicates prune a 900-terabyte table to 40 gigabytes is a very different query from one that prunes it to 12 terabytes, and the router knows which it is before choosing an engine.

**Estimated cost.** Beyond bytes, the router can estimate the join structure (how many tables, whether the join keys align with partitioning or sort order, whether a small dimension will broadcast), the aggregation cardinality (a `GROUP BY` on a high-cardinality column produces a large result), and the presence of expensive operations (window functions over large partitions, regular expressions, user-defined functions). A cost model in the router does not have to be as good as the engine's. It has to be good enough to separate "this is a dashboard lookup" from "this is a batch job."

**Acceleration eligibility.** If the interactive engine has a reflection (a materialized aggregate or raw copy) that can answer the query, the query is cheap regardless of what the raw scan costs. The router can ask the interactive engine's planner whether a reflection matches, or maintain its own index of reflection definitions and check coverage. A query that hits a reflection goes to the interactive engine even if its raw scan estimate is large.

**Latency expectation.** Some clients say what they need. A BI tool's connection is tagged interactive. A scheduled job's connection is tagged batch. An agent's MCP tool call carries a timeout. The router treats the tag as a strong hint, not a rule: a BI tool that submits a 12-terabyte scan gets routed to batch with a message, because the alternative is failing the query or starving everyone else.

**Principal and workload.** Who submitted the query and on behalf of what. This is the input most routing schemes over-rely on (queue per team), and it is still useful as a tiebreaker and as the key for budgets. An agent principal gets a per-session query and byte budget. A batch principal gets a queue with a concurrency limit.

**Engine state.** How loaded each engine is right now: queued queries, executor utilization, memory pressure, queue wait time. A query that normally goes to the interactive engine goes to batch if the interactive engine's queue wait exceeds the query's latency budget, and comes back when it clears.

Here is the signal set, with where each comes from and how expensive it is to obtain:

| Signal | Source | Cost to obtain | Weight in routing |
|---|---|---|---|
| Tables and predicates | SQL parse | Microseconds | Prerequisite for everything else |
| Files and bytes after pruning | Iceberg metadata via PyIceberg or REST scan planning | Milliseconds to low seconds on huge tables | Highest |
| Join and aggregation structure | SQL parse plus table statistics | Microseconds | High |
| Reflection coverage | Interactive engine's planner or router's reflection index | Milliseconds | High (overrides scan size) |
| Client latency tag | Connection properties or request header | Free | Medium (hint) |
| Principal and workload | Authentication | Free | Medium (budgets, tiebreaks) |
| Engine load | Engine metrics endpoint | Free (cached, refreshed per second) | High under contention |

The most important row is the second one. Scan planning in the router is what separates a real router from a queue-per-team scheme. It costs a metadata read, and on the largest tables that read is the same one the engine does, which is why the Iceberg REST catalog's server-side scan planning matters here: the catalog does the planning once, close to the metadata, and hands the router (and then the engine) the file list.

## Turning Signals Into Routes

With the signals in hand, routing is a decision tree with thresholds that the platform team tunes. Here is the shape of the policy for a two-engine deployment, expressed as configuration rather than code so it can be reviewed and versioned:

```yaml
# routing-policy.yaml
engines:
  interactive:
    kind: dremio
    endpoint: grpc+tls://dremio.example.com:32010
    max_queue_wait_ms: 2000
    max_bytes_per_query: 500 GB
    supports_reflections: true
  batch:
    kind: spark
    endpoint: https://spark-gateway.example.com
    max_queue_wait_ms: 300000
    max_bytes_per_query: unlimited

rules:
  # Evaluated in order. First match wins.

  - name: accelerated
    when:
      reflection_covers_query: true
    route: interactive
    reason: "reflection match"

  - name: interactive_small
    when:
      estimated_bytes_lt: 50 GB
      join_tables_lte: 4
      no_expensive_ops: true
    route: interactive
    reason: "small pruned scan"

  - name: interactive_medium_if_idle
    when:
      estimated_bytes_lt: 500 GB
      interactive_queue_wait_ms_lt: 500
      client_tag: [interactive, agent]
    route: interactive
    reason: "medium scan, interactive engine idle"

  - name: agent_over_budget
    when:
      principal_class: agent
      session_bytes_remaining_lt: 0
    route: reject
    reason: "agent session byte budget exhausted"

  - name: batch_large
    when:
      estimated_bytes_gte: 500 GB
    route: batch
    reason: "large scan"
    notify_client: true

  - name: batch_expensive
    when:
      any_of:
        - join_tables_gt: 4
        - has_window_over_large_partition: true
        - has_udf: true
    route: batch
    reason: "expensive plan shape"

  - name: interactive_overloaded_spill
    when:
      interactive_queue_wait_ms_gte: 2000
      client_tag: [interactive]
      estimated_bytes_lt: 500 GB
    route: batch
    reason: "interactive queue saturated, spilling to batch"
    notify_client: true

  - name: default
    route: interactive

budgets:
  agent_session:
    max_queries: 200
    max_bytes: 2 TB
    max_wall_ms: 600000
  batch_principal:
    max_concurrent: 4
```

Read the rules in order. A query a reflection can answer goes to the interactive engine regardless of its raw scan size, because the reflection makes it cheap. A small, simple query goes interactive. A medium query goes interactive only if the interactive engine is idle and the client asked for interactive latency. An agent that has exhausted its session budget is rejected with a message, before any engine does work. A large scan goes to batch and the client is told. An expensive plan shape goes to batch. An interactive client whose query is medium-sized but arrives while the interactive queue is saturated spills to batch with a notification. Everything else defaults to interactive.

The thresholds are the tuning surface. 50 gigabytes and 500 gigabytes are reasonable starting points for an interactive engine with a few hundred gigabytes of executor memory, and they move with the engine's size. The queue wait thresholds encode the latency budget: 500 milliseconds of queue wait is fine for a dashboard, 2 seconds is not.

Here is the router's core loop, using PyIceberg for scan planning and SQLGlot for parsing. It is a sketch of the mechanism, not a production gateway:

```python
import sqlglot
from sqlglot import exp
from pyiceberg.catalog import load_catalog
from pyiceberg.expressions import parser as ice_expr

CATALOG = load_catalog("polaris", **catalog_props)

def tables_and_predicates(sql: str):
    tree = sqlglot.parse_one(sql)
    tables = {t.sql(): t for t in tree.find_all(exp.Table)}
    where = tree.find(exp.Where)
    return tables, (where.this if where else None)

def estimate_bytes(sql: str) -> int:
    """Sum of data file sizes surviving Iceberg pruning, per table in the query."""
    tables, where = tables_and_predicates(sql)
    total = 0
    for name in tables:
        table = CATALOG.load_table(name)
        row_filter = to_iceberg_filter(where, table) if where is not None else None
        scan = table.scan(row_filter=row_filter) if row_filter else table.scan()
        for task in scan.plan_files():
            total += task.file.file_size_in_bytes
    return total

def plan_shape(sql: str) -> dict:
    tree = sqlglot.parse_one(sql)
    return {
        "join_tables": len(list(tree.find_all(exp.Table))),
        "has_window": tree.find(exp.Window) is not None,
        "has_udf": any(f.sql().upper().startswith("UDF_") for f in tree.find_all(exp.Anonymous)),
        "group_by": tree.find(exp.Group) is not None,
    }

def route(sql: str, principal: str, client_tag: str, engines: dict, policy: dict) -> dict:
    signals = {
        "estimated_bytes": estimate_bytes(sql),
        "reflection_covers_query": engines["interactive"].reflection_matches(sql),
        "interactive_queue_wait_ms": engines["interactive"].queue_wait_ms(),
        "principal_class": classify_principal(principal),
        "client_tag": client_tag,
        "session_bytes_remaining": budgets.remaining(principal, "bytes"),
        **plan_shape(sql),
    }
    for rule in policy["rules"]:
        if matches(rule.get("when", {}), signals):
            return {"engine": rule["route"], "reason": rule["reason"],
                    "notify": rule.get("notify_client", False), "signals": signals}
    return {"engine": "interactive", "reason": "default", "signals": signals}
```

The `estimate_bytes` function is the heart of it. `table.scan(row_filter=...).plan_files()` runs Iceberg's planning (manifest filtering by partition and column statistics) and yields the files that survive. Summing their sizes gives the pruned scan estimate. On a huge table this reads the manifests, which is the same work the engine does, and it is where the Iceberg v4 columnar manifest work pays off twice: once in the router and once in the engine.

The `route` function evaluates rules in order against the signal set and returns the engine, the reason, and whether to tell the client. The reason string goes into the query log, which is how the platform team tunes thresholds: a report of "queries routed to batch by rule X that finished in under 5 seconds" says the threshold for X is too low.

## A Worked Trace of the Monday Minute

Run the four queries from the opening through the policy to see the router make decisions.

The dashboard's 40 lookups are `SELECT segment, SUM(revenue_usd) FROM sales.revenue WHERE order_date >= CURRENT_DATE - 30 GROUP BY segment` and its siblings. The router parses each, finds `sales.revenue`, asks the interactive engine's planner whether a reflection covers it, and gets yes (the aggregate reflection by segment and day). Rule `accelerated` matches. All 40 go interactive with reason "reflection match." Scan estimation was skipped because the reflection check ran first and short-circuited. Each finishes in under 200 milliseconds from a local reflection scan.

The late transformation is a `MERGE INTO warehouse.fact_orders USING staging.orders_delta ...` with a 30-terabyte target. The orchestrator routed it to Spark directly at 2 AM. It never touched the gateway. It is still running on the batch engine at 9:15, and its executors are Spark's, not the interactive engine's, so the dashboards do not feel it.

The data scientist's query is `SELECT user_id, event_type, COUNT(*) FROM events WHERE event_date BETWEEN '2025-08-01' AND '2026-08-01' GROUP BY 1, 2`. The router parses it, finds `events`, translates the date predicate into an Iceberg filter, runs `plan_files`, and sums 11.4 terabytes across the surviving files. No reflection covers a year-long grouping by user. Rule `batch_large` matches. The query goes to Spark with a notification back to the notebook: "routed to batch, estimated scan 11.4 TB, expect several minutes." The data scientist sees the message, decides that is fine, and gets a result in eight minutes. Had she added `AND event_type = 'purchase'`, the estimate drops to 400 gigabytes, and with the interactive queue idle it goes interactive under `interactive_medium_if_idle`.

The agent's 22 queries arrive over 30 seconds from principal `agent-support-assistant`. The first is a schema probe on `support.tickets` (bytes: near zero, interactive). The next several are filtered lookups by ticket ID (interactive, small). The twelfth is `SELECT * FROM support.ticket_events WHERE customer_id = 'C-4471'`, estimated at 90 gigabytes because `ticket_events` is partitioned by day and the customer filter does not prune. It exceeds the small threshold. The interactive queue wait is 120 milliseconds, the client tag is agent, so `interactive_medium_if_idle` matches and it goes interactive. It runs in four seconds. The session's byte counter is now at 95 gigabytes of the 2-terabyte budget. Queries 13 through 22 are small aggregates over the result, all interactive. The session ends with 22 queries, 96 gigabytes, and 41 seconds of wall time, well within budget, and the support rep gets the answer.

Here is the minute in the router's log:

| Query class | Count | Rule matched | Engine | Estimated bytes | p95 queue wait | Outcome |
|---|---|---|---|---|---|---|
| Dashboard lookups | 40 | accelerated | interactive | skipped (reflection) | 15 ms | all under 200 ms |
| Nightly MERGE | 1 | orchestrator (bypassed gateway) | batch | 30 TB | N/A | running, 2 AM start |
| Ad hoc year scan | 1 | batch_large | batch | 11.4 TB | N/A | 8 min, client notified |
| Agent session | 22 | 21 interactive_small, 1 interactive_medium_if_idle | interactive | 96 GB total | 120 ms | 41 s session, within budget |

One minute, four workloads, three destinations, no contention, and a log that explains every decision. That is what the control plane is for.

## Translating SQL Predicates Into Iceberg Filters

The `to_iceberg_filter` call in the router sketch hides the step that determines whether the scan estimate is accurate, and it is worth showing, because it is where most routers get their estimates wrong.

Iceberg's planning prunes on partition values and column statistics, and it does so from a filter expression in Iceberg's own expression language, not from SQL. The router has to translate the query's `WHERE` clause into that language, and it has to be conservative: a predicate it cannot translate must be dropped (so the estimate is an upper bound) rather than guessed (so the estimate is wrong in either direction).

Here is a translator that handles the predicate shapes that prune, and drops the rest:

```python
from pyiceberg.expressions import (
    And, Or, EqualTo, NotEqualTo, GreaterThan, GreaterThanOrEqual,
    LessThan, LessThanOrEqual, In, IsNull, NotNull, AlwaysTrue,
)
from sqlglot import exp

COMPARISONS = {
    exp.EQ:  EqualTo,
    exp.NEQ: NotEqualTo,
    exp.GT:  GreaterThan,
    exp.GTE: GreaterThanOrEqual,
    exp.LT:  LessThan,
    exp.LTE: LessThanOrEqual,
}

def to_iceberg_filter(node, table):
    """Translate a sqlglot WHERE expression to a PyIceberg expression.
    Anything not translatable becomes AlwaysTrue (no pruning from that clause)."""
    cols = {f.name for f in table.schema().fields}

    def lit(n):
        if isinstance(n, exp.Literal):
            return n.to_py()
        if isinstance(n, exp.Cast) and isinstance(n.this, exp.Literal):
            return n.this.to_py()
        raise ValueError("non-literal")

    def go(n):
        if isinstance(n, exp.And):
            return And(go(n.left), go(n.right))
        if isinstance(n, exp.Or):
            l, r = go(n.left), go(n.right)
            # An OR where either side is untranslatable cannot prune at all.
            if isinstance(l, AlwaysTrue) or isinstance(r, AlwaysTrue):
                return AlwaysTrue()
            return Or(l, r)
        if isinstance(n, exp.Paren):
            return go(n.this)
        for sqltype, icetype in COMPARISONS.items():
            if isinstance(n, sqltype):
                col, val = n.left, n.right
                if isinstance(col, exp.Column) and col.name in cols:
                    try:
                        return icetype(col.name, lit(val))
                    except ValueError:
                        return AlwaysTrue()
                return AlwaysTrue()   # function on the column, or column vs column
        if isinstance(n, exp.In) and isinstance(n.this, exp.Column) and n.this.name in cols:
            try:
                return In(n.this.name, [lit(v) for v in n.expressions])
            except ValueError:
                return AlwaysTrue()
        if isinstance(n, exp.Between) and isinstance(n.this, exp.Column) and n.this.name in cols:
            try:
                return And(GreaterThanOrEqual(n.this.name, lit(n.args["low"])),
                           LessThanOrEqual(n.this.name, lit(n.args["high"])))
            except ValueError:
                return AlwaysTrue()
        if isinstance(n, exp.Is) and isinstance(n.this, exp.Column):
            return IsNull(n.this.name) if isinstance(n.expression, exp.Null) else AlwaysTrue()
        return AlwaysTrue()

    return go(node)
```

Three properties matter.

Untranslatable clauses become `AlwaysTrue`, which prunes nothing. A `WHERE DATE_TRUNC('month', order_date) = '2026-08-01'` is a function on the partition column. Iceberg cannot prune on it (the engine will evaluate it row by row), so the router does not pretend it can. The estimate for that query is the whole table, which is correct: the engine will scan the whole table. The rejection message can then suggest rewriting the predicate as a range, which does prune.

An `OR` with an untranslatable side collapses to `AlwaysTrue`, because `pruned_side OR anything` cannot exclude a file. This is the conservative rule that keeps estimates from being too low.

Column-versus-column comparisons and joins are not translated. They do not prune a single table's scan anyway. The join structure feeds `plan_shape`, not the byte estimate.

A router with this translator produces estimates that are exact for the predicate shapes Iceberg prunes on and upper bounds for everything else. That is the right bias. An overestimate sends a query to batch that finishes fast, which costs startup latency. An underestimate sends a query to the interactive engine that runs for ten minutes, which costs every other interactive user.

## Where the Router Sits

The router has to be on the path of every query, and there are three places to put it, with different tradeoffs.

**A protocol gateway.** The router is a service that speaks the client protocols (Arrow Flight SQL, JDBC, ODBC, HTTP) on the front and forwards to engines on the back. Clients connect to the gateway. It parses, routes, forwards, and streams the result back. This is the cleanest design because it is engine-agnostic and every query passes through it, and it is the most work because the gateway has to implement the protocols. Arrow Flight SQL makes this tractable: a Flight SQL gateway receives a `CommandStatementQuery`, routes it, and returns the chosen engine's `FlightInfo` with endpoints pointing at that engine, so the client fetches results directly from the engine and the gateway is out of the data path. That is the design I recommend for a new build.

**Engine-native workload management.** Most interactive engines have a workload manager that classifies incoming queries into queues with resource limits. Dremio's engine routing and workload management assign queries to engines (compute pools) based on rules over the query's cost estimate, principal, and tags. Using this means the interactive engine is the front door and its rules decide what stays and what gets rejected or redirected. It routes within the interactive engine's pools well and routes to an external batch engine only by rejecting with a hint the client has to act on. Good for the interactive side, incomplete for the batch side.

**Orchestrator-level routing.** Scheduled workloads (dbt, Airflow, Dagster) already know whether a job is big. The orchestrator picks the engine per model or task, and the interactive engine never sees the batch jobs at all. This handles the predictable half of the traffic with no runtime router. It does nothing for ad hoc queries and agents.

In practice the three combine: the orchestrator routes scheduled batch work directly to the batch engine, the protocol gateway routes ad hoc and agent traffic with the policy above, and the interactive engine's workload manager handles fair sharing among what the gateway sends it. The gateway is the piece most teams are missing.

Here is how the three compare:

| | Protocol gateway | Engine-native workload management | Orchestrator routing |
|---|---|---|---|
| Sees every query | Yes | Only those sent to that engine | Only scheduled jobs |
| Routes across engines | Yes | Within one engine's pools, rejects otherwise | Yes, at job definition time |
| Uses Iceberg scan planning | Yes, via catalog | Yes, engine's own planner | Rarely, static per job |
| Handles agents | Yes, with budgets | Partially, via principal rules | No |
| Data path | Out of it with Flight SQL endpoints | Is the engine | N/A |
| Build effort | Highest | Configuration | Configuration |
| Fit | Ad hoc, BI, agents | Fair sharing on the interactive engine | Scheduled pipelines |

## Machine-Generated Query Streams

Agents change the routing problem in three ways, and a router built for humans handles them badly.

Agents are bursty and recursive. A single question produces a sequence of queries, each shaped by the previous result. The first query is a schema probe, the second a sample, the third an aggregate, the fourth a re-aggregate with a different grouping because the third looked wrong. Twenty queries in thirty seconds from one principal is normal, and a router that rate-limits per principal at human scale throttles the agent mid-reasoning and it fails the task.

Agents do not know what they are asking for. A human analyst who writes `SELECT * FROM events` knows it is a bad idea. An agent that writes it is exploring. The query's cost is unbounded and the agent has no intent to wait an hour. Routing it to batch is wrong (the agent will time out and retry). Rejecting it with a reason the agent can read is right: "this query scans 12 terabytes, add a date filter or use the `events_summary` view," and a well-built agent adjusts.

Agents multiply. One user's question fans out into several agents, each running its own loop. The aggregate query volume from one human interaction is ten to a hundred times what a dashboard load produces, and it arrives at the interactive engine because that is where sub-second answers come from.

The router's answer is a per-session budget, enforced before routing, with rejection messages written for a model to read:

```python
class AgentBudget:
    def __init__(self, max_queries=200, max_bytes=2 * 1024**4, max_wall_ms=600_000):
        self.max_queries, self.max_bytes, self.max_wall_ms = max_queries, max_bytes, max_wall_ms

    def check(self, session, signals) -> tuple[bool, str]:
        if session.queries >= self.max_queries:
            return False, f"Session query budget ({self.max_queries}) exhausted. Summarize what you have."
        if session.bytes + signals["estimated_bytes"] > self.max_bytes:
            gb = signals["estimated_bytes"] / 1024**3
            return False, (f"This query scans about {gb:.0f} GB and exceeds the session's remaining budget. "
                           f"Add a narrower filter, or query a pre-aggregated view such as "
                           f"{suggest_summary_view(signals)}.")
        if session.wall_ms >= self.max_wall_ms:
            return False, "Session time budget exhausted."
        return True, ""
```

The rejection message names the estimated bytes, suggests a narrower filter, and names a summary view. That is what an agent can act on. A generic "query rejected" makes it retry the same query. The `suggest_summary_view` function looks up reflections and semantic layer views over the same tables, which is the same index the routing rule `accelerated` uses.

Budgets also give the platform a circuit breaker. An agent loop that has gone wrong (the same query 50 times, or a query that grows each iteration) hits the query count or byte budget and stops, and the session's log shows the loop. That is the difference between an agent that costs $2 of compute and one that costs $2,000.

For routing itself, agent queries mostly go to the interactive engine, because they are small and latency-sensitive, and the ones that are not small get rejected with guidance rather than sent to batch. The exception is an agent with a batch tag (a scheduled agentic pipeline that expects to wait), which routes like any batch principal.

## Sizing and Scaling the Engines Behind the Router

A router that knows every query's estimated cost has the best possible input for capacity decisions, and the engines should be sized and scaled from it.

The interactive engine's size is set by its p95 queue wait under peak load. The router records queue wait per query. If p95 queue wait at 9:15 on Monday exceeds the latency budget (say 500 milliseconds), the interactive engine needs more executors during that window, or more of its load needs to spill to batch. Dremio's engines scale by adding replicas to a compute pool, and the router's `interactive_queue_wait_ms` signal is the metric to autoscale on, with a floor that keeps a warm pool during business hours.

The batch engine's size is set by queue depth and job duration. The router's byte estimates, summed over the batch queue, tell you how much work is waiting. Spark on Kubernetes or a serverless Spark service scales executors per job, so the batch side is elastic by construction and the cost is per job. The lever is concurrency (how many batch jobs run at once), which the `max_concurrent` budget caps to keep any one principal from monopolizing the pool.

Reflections are the third capacity lever and the one that changes the routing distribution. Every reflection that covers a class of queries moves those queries from "medium scan on interactive" or "large scan on batch" to "accelerated on interactive" at near-zero cost per query. The router's log is where reflection candidates come from: queries routed to batch with a `GROUP BY` shape that repeats are aggregate reflection candidates, and queries routed to interactive medium that repeat with the same filter are raw reflection candidates. Autonomous Reflections in Dremio build these from the workload automatically. Either way, the router's log is the input.

Here is the feedback loop between the router and capacity:

1. The router logs every query with its estimated bytes, chosen engine, reason, queue wait, and actual duration.
2. A daily job aggregates the log: p95 queue wait per engine per hour, bytes routed to batch by rule, repeated query shapes.
3. Interactive engine autoscaling targets p95 queue wait.
4. Reflection candidates come from repeated shapes routed to batch or medium-interactive.
5. Threshold tuning comes from misroutes: batch-routed queries that finished fast, interactive-routed queries that timed out.

That loop is what makes the router improve over time rather than being a static set of thresholds that drift out of date as the workload changes. It also gives the platform team a defensible answer when a user asks why their query went to batch: the log has the estimate, the rule, and the engine state at the moment of the decision.

## Failure Modes and Warning Signs

**Scan estimate far off from actual.** The router estimated 20 gigabytes and the engine scanned 800, because the predicate did not push down (a function on the partition column, an `OR` across partition values, a type mismatch). The sign is queries routed to interactive by the small-scan rule that run for minutes. Compare estimated to actual bytes in the log, alert on ratios above 5x, and fix the predicate translation in the router for the patterns that miss.

**Cost of estimation on huge tables.** The router's `plan_files` call on a table with millions of files takes seconds, which is longer than the dashboard query it is routing. The sign is routing latency that exceeds query latency for small queries. Short-circuit: check reflection coverage and the client tag first, and only run scan planning when the cheaper signals do not settle the route. Cache plan results keyed by table snapshot and predicate for the interval between commits. Use the catalog's server-side planning so the metadata read happens once close to storage.

**Reflection check that is stale.** The router's reflection index says a query is covered. The reflection was dropped or is refreshing. The query goes interactive and hits the raw scan. The sign is accelerated-routed queries with large actual bytes. Ask the engine's planner rather than maintaining a separate index, or refresh the index on reflection change events.

**Batch spill that never comes back.** The interactive engine saturates, the router spills interactive clients to batch, the interactive engine recovers, and the router keeps spilling because the spill rule checks queue wait at routing time and the batch-routed queries are not on the interactive queue. The sign is interactive clients on batch with an idle interactive engine. Add hysteresis: stop spilling when queue wait has been under the threshold for N seconds.

**Agent budget too tight.** Legitimate agent tasks fail on the query count budget mid-reasoning. The sign is agent sessions ending with a budget rejection and no summary. Raise the query budget, tighten the byte budget, and give agents a summary view for the tables they probe most.

**Router as a single point of failure.** The gateway goes down and every client loses access. The sign is obvious. Run the gateway as a stateless replicated service behind a load balancer, with the Flight SQL endpoint design keeping it out of the data path so a gateway restart does not kill in-flight result streams.

**Parse failures on dialect.** The router's parser rejects SQL the engine accepts (a vendor-specific function, an unusual quoting style). The sign is queries routed to default with no signals. Fall back to routing by client tag and principal when parsing fails, and log the SQL for parser improvement.

**Thresholds tuned for last year's engine.** The interactive engine doubled in size and the 50-gigabyte threshold is now far too conservative, so medium queries that it handles easily go to batch and pay the startup cost. The sign is batch-routed queries finishing in seconds. Re-derive thresholds from the engine's actual capacity quarterly.

## Operational Guidance

**Put a gateway in front, and keep it out of the data path.** Flight SQL endpoints let the gateway route and step aside.

**Estimate scan bytes from Iceberg metadata for every query.** It is the signal that makes the router a router. Use the catalog's server-side planning if it has it.

**Rules in order, thresholds in config, reasons in the log.** The reason string per query is the tuning surface.

**Reflection coverage overrides scan size.** Ask the engine's planner.

**Budget agents per session, reject with guidance.** Query count, bytes, wall time. The rejection message names the bytes and suggests a view.

**Spill with hysteresis.** Otherwise the spill rule oscillates.

**Autoscale the interactive engine on p95 queue wait.** That is the metric the router already has.

**Mine the log for reflection candidates and misroutes.** Weekly.

**Route scheduled batch work at the orchestrator.** The gateway is for ad hoc and agents. A scheduled job that has to go through the gateway anyway should carry a batch tag so the router does not spend a scan estimate on something the orchestrator already sized.

**Short-circuit cheap signals before expensive ones.** Reflection coverage and client tags are free. Scan planning is not. Order the checks so most queries route without touching metadata.

**Re-tune thresholds when engines change size.** Quarterly at least.

## Where This Is Heading

Three developments make routing better.

Server-side scan planning in the REST catalog. The Iceberg REST catalog's planning endpoints let the catalog do the manifest scan once and hand the pruned file list to whoever asked. A router that calls the same endpoint the engine will call gets the estimate for free, and the engine gets a cache hit. As catalogs implement this and as v4 columnar manifests make it fast on huge tables, the router's most expensive signal becomes cheap.

Engines converging on Arrow-native execution. When the interactive engine and the batch engine both execute over Arrow (Dremio natively, Spark through DataFusion Comet), the cost of routing a medium query to either one narrows, and the router's decision becomes more about scheduling and less about physics. The threshold between the engines moves up as the batch engine's per-query overhead falls.

Agents as first-class principals in workload management. The budget-and-guidance pattern for agent sessions is currently something the router implements. Engines are starting to build it in, with per-session limits and structured rejection messages designed for a model to read. When that is native, the router's agent logic simplifies to passing the session through.

The pattern underneath is the same one that separated storage from compute a decade ago: the open lakehouse separated data from engines, and now the control plane is separating query admission from execution. A query's destination is a policy decision made from its shape, and the engines are pools behind that decision. That is what lets a platform serve dashboards, batch jobs, and agent loops from the same tables without any of them degrading the others.

## Conclusion

Four kinds of query arrive at the same endpoint at 9:15 on Monday, and one engine cannot serve them all because interactive and batch engines are built on opposite physical assumptions. A router that parses each query, estimates its pruned scan from Iceberg metadata, checks reflection coverage, reads the client's latency expectation and the engines' current load, and applies an ordered rule set sends each query to the engine whose physics match. Agent streams get per-session budgets with rejections a model can act on. The router's log drives engine autoscaling, reflection candidates, and threshold tuning.

Build the gateway on Flight SQL so it stays out of the data path. Make scan estimation the first signal. Put the rules in config with reasons in the log. Budget the agents. The dashboards stay sub-second, the join gets the cluster it needs, the data scientist's year-long scan lands where it belongs, and the agent's 22 queries finish in the time it takes the support rep to read the answer.

## Keep Going

If this piece was useful, I have written a lot more on query engines, workload management, and lakehouse platform design. *Architecting an Apache Iceberg Lakehouse* (Manning) covers engine selection, acceleration, and the control plane patterns this article builds on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
