---
title: "Governing What Agents Cost You"
date: "2026-07-25"
description: "Agents break the four assumptions analytics platforms were built on. A practical guide to identity, budgets, semantic layers, caching, and instrumentation for agent workloads."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - AI agents
  - cost governance
  - data platform
  - semantic layer
  - apache iceberg
canonical: https://iceberglakehouse.com/posts/agent-cost-governance/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/agent-cost-governance/).

A platform team I spoke with watched their query volume rise 40 times in six weeks. No new dashboards, no new users, no new data sources. What changed was that three product teams shipped agents, and each agent issues somewhere between eight and sixty queries per user request depending on how many reasoning steps the task takes and how many of them fail and retry.

Their compute bill tripled. The part that hurt more than the bill was that nobody was able to say which agent caused it, because every agent connected with the same service account.

This is the operational story of 2026 for analytics platforms, and it is arriving faster than the governance tooling for it. The controls most data platforms carry were built for a world where a human wrote a query, waited, looked at the result, and thought about it. Agents remove the waiting and the thinking, and everything downstream that quietly depended on human pacing stops working.

This is a practical guide to governing agent access to data: what changes mechanically, what to instrument, which controls actually work, and what the failure modes look like before they show up on an invoice. I work at Dremio, now part of SAP, on exactly this problem, so treat the vendor-shaped parts as disclosure. The patterns are implementable on any platform.

## Four Assumptions Agents Break

**Query volume tracks headcount.** Capacity planning has always been a function of user count times queries per user per day. An agent population breaks the relationship entirely. One user request expands into a burst of queries whose size depends on task complexity, and the multiplier is not stable week to week because it moves whenever someone changes a prompt or adds a tool.

**Expensive queries get noticed.** A human who writes a query that scans two terabytes usually notices, because they waited. An agent issues it, gets a result, and continues. Nothing in the loop provides feedback about cost, so nothing corrects it. The correction has to come from the platform.

**Query shapes are predictable.** Materialized views, caches, and aggregate tables all rest on knowing which queries repeat. Agents generate SQL from natural language against a semantic description, and the shapes vary in ways that defeat exact-match caching while asking for the same underlying facts over and over.

**Identity is a person.** Every access control model assumes a principal that maps to a human or to a service with a well-defined job. An agent acting for a user, calling a sub-agent, which calls a tool, produces a chain. Answering "who ran this query" requires the chain, not the connection's credentials.

Each broken assumption maps to a control, and the controls are the rest of this article.

Worth saying plainly before going further: none of this is an argument against agents. The teams in these examples are shipping features that work and that users want. The gap is that the platform practice around agent access is roughly where cloud cost management sat in 2014, when everyone had elastic infrastructure and nobody had tagging. The fix then was attribution first, then limits, then architecture. The fix now is the same sequence applied to a different resource.

## Where the Money Actually Goes

Before adding controls, know the cost structure. Agent workloads spend in four places, and they are not the places human analytics spends.

**Repeated scans of the same data.** An agent exploring a question reads the same table with slightly different filters many times in one task. Without caching, each read is a full scan. This is usually the largest single line item and the easiest to fix.

**Exploratory metadata queries.** Agents list tables, read schemas, sample rows, and check distinct values to orient themselves. Individually cheap, collectively enormous at volume, and almost invisible because they do not look like analytical queries. A catalog that answers these from metadata rather than by scanning data changes this cost by orders of magnitude.

**Retry loops.** A query fails on a syntax error or a timeout, the agent adjusts and retries, sometimes several times. Each attempt costs. A retry loop that never succeeds costs indefinitely until something stops it.

**Reasoning tokens on the model side.** Separate budget, same root cause. An agent that issues sixty queries also generates sixty rounds of model reasoning. Model spend and query spend move together, which means a control on one without the other leaves the bill half-governed. Token efficiency became a headline feature across model releases in 2026 for exactly this reason, and routing cheap steps to a smaller model while reserving the frontier tier for hard reasoning is the model-side equivalent of everything in this article. The two budgets belong on one dashboard because the same agent behavior drives both.

The distribution matters for prioritization. In the deployments I have seen, exploratory metadata queries and repeated scans dominate, and both respond well to caching and to a good semantic layer. Attacking the analytical queries first is optimizing the smaller number.

## Control One: Give Every Agent an Identity

Nothing else in this article works without this, and it is an afternoon of work.

Every agent, or every agent role, gets its own principal in the catalog: its own credentials, its own grants, its own attribution in the query log. Not a shared service account. Not the developer's personal account, which happens more often than anyone admits.

Three things become possible immediately. Cost attribution, so the question "why did the bill move" has an answer. Access scoping, so a customer support agent reads support tables and nothing else. And revocation with a blast radius smaller than everything, so a misbehaving agent gets disabled without taking down the other nine.

The harder half is the delegation chain. When a user asks an agent, which calls a tool, which queries a table, the platform ideally knows both the agent and the user on whose behalf it acts. Some platforms support identity propagation through the chain, and several vendors have been building specifically for this, which is why agent identity has become a product category of its own with acquisitions attached.

Where full propagation is unavailable, an adequate approximation is a per-agent principal plus a request identifier passed as a query tag or session property, correlated with your application logs. That gets you attribution without waiting for the platform to catch up.

```sql
-- Per-agent principal with narrow, explicit grants.
CREATE ROLE agent_support_triage;

GRANT USAGE ON CATALOG lakehouse TO ROLE agent_support_triage;
GRANT USAGE ON SCHEMA lakehouse.support TO ROLE agent_support_triage;
GRANT SELECT ON TABLE lakehouse.support.tickets TO ROLE agent_support_triage;
GRANT SELECT ON TABLE lakehouse.support.ticket_metrics TO ROLE agent_support_triage;

-- No access to the wider estate. Not customer PII, not finance, not raw events.
```

The grant list being short is the point. Agents get scoped to the tables their job requires, and the review of that list is a security review that a human user rarely receives. The upside of agents arriving is that they force an access hygiene conversation that most organizations have deferred for years.

## Control Two: Budgets and Limits Per Principal

Once identity exists, limits attach to it. Four limits cover most of the risk.

**Query timeout.** The single most valuable control and the easiest to set. An agent has no patience to exhaust, so a runaway query runs until something kills it. Set an aggressive timeout on agent principals, far shorter than for humans. Thirty to sixty seconds is reasonable for most interactive agent work, and a query that exceeds it usually indicates a bad plan rather than a hard question.

**Bytes scanned per query.** A cap that fails the query rather than scanning a petabyte. This catches the missing-filter case, which is the classic generated-SQL failure.

**Daily budget per principal.** A rolling limit on bytes or credits, which converts an unbounded incident into a bounded one. The agent stops working, which is bad, and it stops working instead of generating a five-figure bill overnight, which is better.

**Concurrency cap.** Agents parallelize. A cap per principal keeps one agent from consuming the whole cluster and starving everything else, including humans.

Set these before the first agent reaches production, not after the first incident. The retrofit is harder because by then the agent's behavior depends on the absence of limits and tightening them looks like a regression.

## Control Three: Make the Semantic Layer Do the Work

Caching on exact query text catches very little agent traffic, because agents phrase the same underlying question many ways. The layer that does catch it is semantic.

A governed metric definition gives you three wins at once. Consistency, since every agent asking for revenue gets the same definition rather than writing its own aggregation. Cost, because a metric request resolves against a pre-aggregated result rather than a fresh scan. And correctness, which matters more than either, because an agent that writes its own revenue calculation from raw tables will eventually write a subtly wrong one and act on it.

Every major platform has converged on this. Metrics as governed objects in the catalog, semantic views and semantic modeling tools, ontology layers learned from usage, and semantic layers exposed to agents through MCP servers. The convergence is not coincidence. It is what happens when everyone discovers that natural language over raw schemas produces plausible wrong answers at scale.

The practical guidance: expose agents to a semantic layer, not to raw tables, wherever the question is about a business metric. Reserve raw table access for genuinely exploratory work by agents whose output a human reviews. The cost savings are real and secondary. The correctness benefit is the reason.

## Control Four: Cache at Three Levels

Caching is where the largest cost reductions live, and the three levels catch different traffic.

**Metadata cache.** Table lists, schemas, column statistics, and sample values. Agents request these constantly during orientation, and they change rarely. Serving them from catalog metadata rather than by touching data is close to free and removes a large share of query count. If your agent framework re-reads the schema on every step, fix that first, before anything else in this article.

**Result cache.** Exact-match on normalized query text with a short time to live. Catches retry loops and the case where two agents ask the identical question within the window. Cheap to enable, modest hit rate on agent traffic, still worth it because retries are common.

**Materialized aggregates.** The highest-value and highest-effort level. Pre-computed aggregates over the dimensions agents actually group by. The trick is that you do not know those dimensions in advance, which is why systems that observe query patterns and create materializations automatically are worth more in an agent-heavy environment than in a human one. Autonomous materialization features across several platforms exist for this reason, and the value of them scales with how unpredictable your query mix is.

A fourth level worth considering for high-volume agent deployments: a small local cache inside the agent's own process for facts it has already retrieved in the current task. Many agents re-query information they already have because nothing in the loop remembers. That is a framework fix rather than a platform fix, and it frequently cuts query count by a third.

## Building the Access Path Agents Should Use

Most of the cost and correctness problems above come from one architectural decision: what agents connect to. Three patterns exist, and they produce very different outcomes.

**Direct SQL against raw tables.** The agent gets a connection and writes SQL from the schema. Maximum flexibility, worst cost profile, worst correctness profile. Every metric gets reinvented, every join gets guessed, and every exploration scans raw data. This is where most teams start because it is the fastest thing to build.

**Tool-based access with fixed queries.** The agent calls named tools that run parameterized queries written by engineers. Excellent cost and correctness, poor flexibility. Works well for narrow agents with a known job, badly for exploratory ones, and creates a backlog because every new question needs an engineer.

**Semantic layer access through a protocol.** The agent queries governed metrics and dimensions through an interface that exposes business concepts rather than tables, commonly over the Model Context Protocol. The platform resolves the request against materialized aggregates where they exist and against raw data where they do not. Good flexibility, good cost, best correctness, because definitions are governed once and served everywhere.

The third is where the industry converged, which is why nearly every data platform shipped an MCP server and a semantic or metrics layer inside the same twelve months.

```python
# What an agent's data tool should expose: business concepts, not tables.
TOOLS = [
    {
        "name": "query_metric",
        "description": (
            "Retrieve a governed business metric. Metrics are defined once "
            "in the catalog and return consistent values across all callers."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "metric": {
                    "type": "string",
                    "enum": ["net_revenue", "active_customers",
                             "open_tickets", "avg_resolution_hours"],
                },
                "group_by": {
                    "type": "array",
                    "items": {"type": "string",
                              "enum": ["region", "segment", "month", "product"]},
                },
                "filters": {"type": "object"},
                "time_range": {"type": "string"},
            },
            "required": ["metric"],
        },
    },
    {
        "name": "check_freshness",
        "description": (
            "Return the last update time of the data behind a metric. "
            "Call this before acting on anything time-sensitive."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"metric": {"type": "string"}},
            "required": ["metric"],
        },
    },
]
```

Four properties of that tool definition matter more than the code.

The metric list is an enumeration, so the agent selects from governed definitions rather than inventing an aggregation. That single constraint eliminates the largest class of confidently wrong answers.

The grouping dimensions are enumerated too, which bounds the query shapes the platform has to serve and makes materialization tractable. An unbounded group-by is where cost surprises come from.

`check_freshness` exists as a first-class tool, so an agent about to take an action verifies staleness first. Exposing it as a tool rather than burying it in metadata is what makes agents actually call it.

The description text is part of the interface. Agents choose tools based on descriptions, and a vague description produces wrong tool selection as reliably as a bug. Treat these strings as production code with review, because that is what they are.

## Instrumenting It

Five measurements make agent cost governable. Collect them from day one, because retrofitting attribution after an incident is painful.

**Queries per principal per hour.** The base signal. A step change here explains most bill movements, and a sustained climb tells you an agent's behavior changed, usually because someone edited a prompt.

**Bytes scanned per principal per day.** The number that maps most directly to cost on consumption pricing. Track the top ten principals and alert on week-over-week growth.

**Query success rate per principal.** A falling success rate means retry loops, which means paying for failures. This is the most actionable single metric, because a retry loop is a bug with a fix rather than a capacity problem.

**Queries per user request.** The amplification factor, computed by correlating a request identifier with query logs. If it drifts from eight to thirty, something in the agent's reasoning changed and cost will follow within days.

**Cache hit rate by level.** Tells you whether the caching investment is landing, and which level to work on next.

```sql
-- Daily agent cost and behavior summary from query history.
SELECT
    user_name                                        AS principal,
    DATE(start_time)                                 AS day,
    COUNT(*)                                         AS queries,
    SUM(bytes_scanned) / POWER(1024, 4)              AS tb_scanned,
    AVG(total_elapsed_time_ms) / 1000.0              AS avg_seconds,
    SUM(CASE WHEN execution_status = 'FAIL' THEN 1 ELSE 0 END) AS failures,
    SUM(CASE WHEN result_from_cache THEN 1 ELSE 0 END) AS cache_hits,
    COUNT(DISTINCT query_tag)                        AS distinct_requests
FROM platform.account_usage.query_history
WHERE start_time >= DATEADD(day, -7, CURRENT_TIMESTAMP())
  AND user_name LIKE 'agent_%'
GROUP BY 1, 2
ORDER BY tb_scanned DESC;
```

The `distinct_requests` column, populated from a query tag your agent framework sets per user request, is what turns raw query counts into the amplification factor. Dividing queries by distinct requests gives you the number that predicts cost growth better than any other single metric. Watch it weekly.

## A Worked Cost Model

Numbers make this concrete, and the model is simple enough to build in a spreadsheet during a planning meeting.

Start with four inputs. User requests per day, call it 2,000. Queries per request, the amplification factor, call it 12. Average bytes scanned per query, call it 4 GB. And your platform's cost per terabyte scanned, which varies widely but sits in the low single-digit dollars on most consumption pricing.

That gives 24,000 queries a day scanning 96 TB, which at three dollars per terabyte is roughly 288 dollars a day, or about 8,600 dollars a month, for one agent product with 2,000 daily requests.

Now apply the four controls and watch what each one does.

**Schema caching in the agent session** removes the orientation queries, which are frequently 40 percent of the count and almost none of the bytes. Query count drops to 14,400. Cost barely moves, but concurrency pressure and platform overhead drop sharply, and latency per request improves noticeably.

**A semantic layer with pre-aggregated metrics** changes the bytes, which is where the money is. Metric requests that scanned 4 GB of raw events now scan tens of megabytes of aggregate. If half the analytical queries resolve against aggregates, average bytes per query falls to around 2 GB. Monthly cost drops to roughly 4,300 dollars.

**Result caching with a five-minute window** catches retries and duplicate questions across concurrent users. A 20 percent hit rate on the remaining traffic takes it to about 3,400 dollars.

**Fixing a retry loop** found by watching success rate takes another slice off the top. Retry traffic is pure waste and commonly runs 10 to 25 percent of query volume in an untuned deployment.

The compounded effect lands somewhere near a third of the starting cost, and the largest single contributor is the semantic layer, not the caching. That ordering surprises people, because caching feels like the cost lever and semantics feels like a correctness project. In agent workloads they are the same project.

Two sensitivities worth checking in your own model. First, the amplification factor dominates everything: doubling it doubles the bill, and it moves whenever anyone edits a prompt or adds a tool. Second, bytes per query is where architecture choices land, which means partitioning, sorting, and materialization decisions show up directly in agent cost rather than only in dashboard latency.

## Rate Limiting Without Breaking the Product

Hard limits stop runaway cost and produce a bad user experience when they fire. The better design gives the agent information rather than errors.

**Expose remaining budget to the agent.** An agent that knows it has used 80 percent of its budget for the hour can behave differently: answer from what it already has, ask the user whether to continue, or narrow the scope of the next query. An agent that receives an opaque failure retries, which makes the situation worse.

**Degrade rather than deny.** Several graceful behaviors beat a hard stop. Route to cached or pre-aggregated results when fresh computation is unavailable. Sample rather than scan when the question tolerates approximation. Return partial results with an explicit note about what was omitted. Each of those keeps the product working while the cost curve flattens.

**Separate interactive from background.** Agent work that a user waits for deserves priority and tighter latency guarantees. Agent work running on a schedule deserves lower priority and a bigger budget over a longer window. Running both under one policy means either the interactive path is starved or the background path is uncapped.

**Set limits from the tail, not the mean.** Observed behavior has a long right tail: most requests are cheap and a few are expensive for legitimate reasons. Limits set at twice the mean will fire constantly on legitimate hard questions. Limits set at the 95th percentile with headroom fire on genuine anomalies.

**Roll out in monitoring mode.** Log every request the limits catch for a week before enforcing. The list is always surprising, and it usually contains one legitimate workload that needs a higher limit and one bug nobody knew about.

The general principle: cost controls that the agent can reason about produce better outcomes than controls that only the platform knows about. That means budget state belongs in the agent's context, which is a framework capability more than a platform one, and it is where the tooling is currently weakest.

## This Is a Security Problem Too

Cost is the visible half. The access half deserves equal attention and gets less.

**Agents expand the blast radius of over-permissioning.** A human with access to a table they do not need is a latent risk. An agent with the same access is an active one, because it explores. Broad grants that were tolerable for years become material the day an agent starts using them.

**Data-borne prompt injection is real.** An agent that reads a support ticket, a product review, or a document field is reading text an outsider wrote. Text that contains instructions can redirect an agent that treats retrieved content as trustworthy. The mitigations are architectural: keep retrieved data out of the instruction channel, scope what tools an agent can call, and require confirmation for actions with side effects. From the data platform's side, the control is narrow grants, so a redirected agent reaches nothing valuable.

**Exfiltration looks like analytics.** An agent induced to run a series of aggregate queries reveals information that no single query would. Differential exposure through repeated aggregates is a known attack pattern and it is much easier at agent query rates. The defenses are the same as always, applied more seriously: minimum necessary access, row and column level policy enforced during scan planning, and monitoring on unusual query patterns per principal.

**Audit needs the chain.** "Agent 7 read the customer table" is insufficient for an incident review. You need the user request that triggered it, the agent, any sub-agents, and the query. That means a request identifier threaded through every hop and recorded in the query log, which is the same plumbing that makes cost attribution work. Build it once and it serves both.

**Credentials should be short-lived and scoped per query.** Standing storage credentials held by an engine are a poor fit for a world where the caller is an agent whose identity shifts by task. Catalogs that vend short-lived, scoped credentials per scan, and enforce policy during planning, keep the guarantee below every client. This is the reason catalog-level enforcement moved from a nice property to a requirement over the past year, and why a security company paid nine figures for a lakehouse operations startup whose real asset was visibility into how tables get used.

The synthesis: cost governance and access governance for agents want the same three primitives. Per-agent identity, catalog-level policy enforcement, and end-to-end attribution. Build them for one reason and you get the other for free.

## Sizing Capacity for Agent Traffic

Capacity planning changes shape when the consumer is an agent, and three adjustments cover most of it.

**Plan for burst, not average.** Agent traffic is spiky at the request level and correlated across users, since a product feature that triggers agent work triggers it for everyone at once. Peak-to-average ratios of five or ten are normal. Autoscaling helps and has a warm-up cost that shows up as latency on the first requests of a burst.

**Concurrency matters more than throughput.** A human workload of 100 queries per minute from 40 analysts is easy. The same rate from 8 agents running parallel steps concentrates on fewer, larger, simultaneous requests with tighter latency expectations. Size for concurrent query slots rather than for daily volume.

**Isolate agent workloads from human ones.** Separate compute for agent traffic keeps a runaway loop from degrading the dashboards executives look at every morning. It also makes cost attribution trivially easy, since the bill splits by cluster. The cost of the isolation is some lost efficiency from a smaller shared pool, and it is usually worth paying for the first year while behavior is still unpredictable. Revisit the decision once the amplification factor stabilizes and the limits have been enforced for a quarter without incident, since by then a shared pool with per-principal caps gives you the efficiency back without the risk that motivated the split.

One planning number worth writing down: track queries per user request weekly, and treat any sustained change as a capacity event. That single ratio predicts both cost and capacity needs better than any other metric available, and it moves for reasons that have nothing to do with user growth.

## Failure Modes

**The shared service account.** Symptom: cost rises and attribution is impossible. Cause: every agent connecting as one principal. This is the root failure that makes every other problem unfixable. Fix it first.

**The retry storm.** Symptom: query volume spikes, success rate collapses, cost climbs with no output. Cause: an agent whose generated SQL fails against a schema it misunderstands, retrying with variations. Fix: cap retries in the agent framework, alert on success rate, and improve the schema description the agent works from, because the root cause is usually a confusing model rather than a confused agent.

**Schema re-read on every step.** Symptom: enormous counts of trivial metadata queries. Cause: agent frameworks that fetch context fresh each iteration. Fix: cache schema in the agent session. This one is often the single largest reduction available and it is a few lines of code.

**Unbounded exploration.** Symptom: an agent scanning tables unrelated to its task. Cause: broad grants plus a reasoning loop that wanders. Fix: narrow grants. An agent that cannot see the raw event table cannot scan it by accident.

**Semantic ambiguity producing repeat work.** Symptom: an agent asks the same underlying question five ways in one task. Cause: the first answers were ambiguous or inconsistent, so the agent kept probing. Fix: governed metrics with clear definitions, which shortens tasks and cuts queries.

**Silent policy bypass through derived objects.** Symptom: an agent surfaces data it should not have. Cause: a materialized aggregate or cached result built over restricted data without inheriting the policy. Fix: enforcement at scan planning in the catalog rather than in each engine, plus lineage-aware grants on derived objects.

**Cost controls that break the product.** Symptom: agents fail during peak hours after limits are introduced. Cause: limits set from average behavior rather than from the tail. Fix: set limits from the 95th percentile of observed behavior with headroom, roll them out in monitoring mode first, and alert before enforcing.

**Model spend forgotten.** Symptom: query costs governed, total AI spend still rising. Cause: reasoning tokens tracked separately or not at all. Fix: one dashboard with both, attributed to the same agent principals.

## What Good Looks Like

A reasonable target state for an organization running agents against analytical data.

Every agent has a principal, and the principal name identifies the team and function. Grants are scoped to the tables that agent needs, reviewed quarterly. Timeouts, byte caps, concurrency limits, and daily budgets are set per principal, derived from observed behavior with headroom, and enforced by the platform rather than by the application.

Agents reach data through a semantic layer for anything that involves a business metric, with raw table access reserved for exploratory work under human review. Metric definitions live in the catalog as governed objects and serve people and agents through the same interface.

Metadata is served from the catalog. Repeated aggregates are materialized, ideally by a system observing query patterns rather than by a human maintaining a list. Freshness is exposed as a queryable property so an agent checks staleness before acting on time-sensitive data.

Attribution runs end to end: request identifier in the query tag, principal per agent, dashboard showing queries, bytes, failures, amplification factor, and model spend by agent. Alerts fire on amplification drift and on success rate drops, both of which lead cost changes by days.

Access policy is enforced at scan planning in the catalog, so it holds regardless of which engine or agent asks, and regardless of how many hops the delegation chain has.

None of that is exotic. Most of it is a week of platform work plus a habit of reviewing the dashboard. The reason it does not exist in most places yet is that agent traffic arrived faster than the operational practice around it.

## A Thirty-Day Plan

For a team with agents already in production and no controls, here is an order of operations that front-loads the highest-value work.

**Week one, attribution.** Create a principal per agent. Thread a request identifier from the application through to a query tag. Stand up the daily summary query as a dashboard. Do nothing else. You cannot manage what you cannot attribute, and one week of clean data reveals which of the following weeks matters most.

**Week two, the cheap wins.** Cache schema in the agent session. Turn on result caching. Cap retries in the agent framework. Set query timeouts on agent principals. Each of these is hours of work and together they commonly remove a third to a half of query volume.

**Week three, scope and limits.** Review each agent's grants against what its job actually requires and narrow them. Set byte caps and concurrency limits in monitoring mode. Collect the list of what the limits catch and adjust before enforcing.

**Week four, semantics.** Identify the five metrics agents ask for most, define them as governed objects, and expose them through the tool interface. This is the week with lasting value, because it improves cost and correctness simultaneously and it compounds as more agents arrive.

**Ongoing.** Watch the amplification factor and the success rate weekly. Review grants quarterly. Add materialized aggregates as usage patterns stabilize, ideally through a system that observes rather than a human maintaining a list.

The reason for this ordering is that steps one and two produce measurable results immediately, which buys the political room for steps three and four. Starting with the semantic layer is technically correct and organizationally hard, because it is a multi-week project with no visible result until it lands.

## The Organizational Part

Two governance questions cause more trouble than any technical control.

**Who owns the agent's spend?** If the platform team's budget absorbs it, they get punished for other teams' prompt changes and will respond by making access difficult. If the product team owns it, they optimize, because the feedback lands where the decisions get made. Chargeback by agent principal is a small amount of work with a large behavioral effect, and per-principal attribution makes it possible.

**Who approves what an agent can see?** An agent's grant list is a security decision that deserves the same review as a new integration. The pattern that works is a lightweight approval where the requesting team names the tables, the purpose, and the expected volume, and a data owner signs off. The pattern that fails is agents inheriting a developer's access because it was faster.

There is a cultural point underneath both. Agents make previously abstract data governance questions concrete and urgent. Nobody measured the cost of an ambiguous metric definition when humans reconciled it in their heads. When an agent picks one interpretation and takes an action, the cost of ambiguity becomes visible. Teams that treat the agent rollout as a forcing function for governance work they already needed come out ahead. Teams that treat it as a cost problem to be solved with limits alone end up with limited agents and unchanged ambiguity.

## The Controls at a Glance

| Control | Effort | What it fixes | Where it lives |
|---|---|---|---|
| Principal per agent | Hours | Attribution, scoping, revocation | Catalog |
| Query timeout | Minutes | Runaway queries | Platform |
| Bytes scanned cap | Hours | Missing-filter scans | Platform |
| Daily budget per principal | Hours | Unbounded incidents | Platform |
| Concurrency cap | Minutes | Noisy-neighbor starvation | Platform |
| Schema caching | Hours | Metadata query flood | Agent framework |
| Result caching | Hours | Retry and duplicate traffic | Platform |
| Governed metrics | Weeks | Cost and correctness together | Catalog and semantic layer |
| Materialized aggregates | Weeks, or automatic | Repeated heavy scans | Platform |
| Freshness as a tool | Hours | Actions on stale data | Semantic layer |
| Request-level attribution | Days | Amplification visibility, audit | Application and platform |

Read the effort column against the value column and the priority is obvious. Six of the eleven take hours, and together they cover most of the exposure. The two multi-week items are the ones with durable value, and they are worth starting once the quick controls have bought you time.

## Where This Goes

Three developments look likely over the next year.

**Agent identity becomes platform infrastructure.** Per-agent principals, delegation chains, and scoped credentials are moving from custom work into products, with acquisitions in this space already completed. Expect the manual identity plumbing described above to become a configuration screen.

**Optimization becomes usage-driven.** Systems that watch what agents ask and build materializations to match are worth more in an agent world than a static optimizer, because the query mix is less predictable. The platforms investing here are betting correctly.

**Cost controls move into the agent framework.** Today limits live in the data platform. The better place is both: a budget the agent knows about, so it can decide to stop or ask for approval, rather than a query that fails at the platform boundary and produces a confusing user experience. Frameworks that expose remaining budget to the reasoning loop will produce better behavior than frameworks that get errors.

The bigger shift underneath all three is that the data platform is becoming an operational system rather than an analytical one. Analytical systems tolerated variable performance and loose cost controls because a human absorbed the variance. When an agent's answer drives an action in a product, the platform inherits product-grade requirements for latency, availability, cost predictability, and access control. Most data platforms were not built for that, and the next few years of platform engineering are largely about closing the gap.

## Conclusion

Agents did not introduce a new category of data governance problem. They removed the human pacing that hid the old ones. Ambiguous metrics were always ambiguous. Broad grants were always broad. Missing cost controls were always missing. What changed is that a system operating at machine speed converts each of those into a measurable outcome inside a week.

The controls that work are unglamorous and available today. One identity per agent. Scoped grants reviewed like security changes. Timeouts, byte caps, and daily budgets set from observed behavior. Metadata served from the catalog. A semantic layer between agents and raw tables. Caching at three levels. Attribution end to end, with the amplification factor on a dashboard.

Do those seven things and agent cost becomes a line item you manage rather than a surprise you explain. Skip the first one and none of the others are possible, which is why the shared service account is the failure worth eliminating this week.

A closing note on framing, because it affects whether this work gets funded. Presenting agent governance as cost control invites a negotiation about whether the savings justify the effort. Presenting it as the prerequisite for shipping agents that give correct answers to real questions changes the conversation, because correctness is not optional and the same seven controls deliver both. The team that instruments attribution in week one and defines governed metrics in week four ends up with cheaper agents, and more importantly with agents whose answers a business leader is willing to act on.

## Keep Going

If this piece was useful, I have written a lot more on the data architecture underneath AI systems.
*Architecting an Apache Iceberg Lakehouse* (Manning) covers the catalog, governance, and semantic layers that make agent access to enterprise data both affordable and correct.
You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at
[books.alexmerced.com](https://books.alexmerced.com).
