---
title: "Budgeting for Agentic Analytics When Every Question Costs Something Different"
date: "2026-08-04"
description: "Budgeting for agentic analytics when every question costs something different: token economics, query economics, instrumentation, and the cost controls that actually return."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - AI Agents
  - TCO
  - Cost Management
  - Token Budgets
  - Apache Iceberg
canonical: "https://iceberglakehouse.com/posts/agentic-analytics-tco-token-budgets/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/agentic-analytics-tco-token-budgets/).

# Budgeting for Agentic Analytics When Every Question Costs Something Different

*By Alex Merced, Data Lakehouse and AI Evangelist*

The pilot ran for six weeks with forty users and cost less than a team lunch. Someone approved rolling it out to eight hundred people. The first full month's bill arrived with two line items that nobody had modeled: a model provider invoice several times the projection, and a lakehouse compute figure that had roughly tripled.

Neither number is mysterious once you look. Both are predictable in advance. Almost nobody predicts them, because the cost structure of an agent asking questions of a data platform does not resemble anything the team has budgeted before.

A human analyst asking a question runs one query, maybe three. An agent answering the same question runs eight, plus a discovery call, plus a follow-up after reasoning over the first result, and it consumes tokens at every step in proportion to how much context you fed it. Multiply by a user base that finds asking questions easy, and the volume curve bends in a direction spreadsheets built on human behavior do not anticipate.

This piece is a cost model for agentic analytics. What actually drives spend, how to instrument it before you need to, which controls work and which ones only feel like they work, and how to measure return without fooling yourself.

A disclosure. I work for Dremio, which was acquired by SAP and now sits within SAP Business Data Cloud. Dremio sells lakehouse compute, which is one of the two costs discussed here. I have tried to be as direct about where that cost comes from as I am about the model provider's.

## Why the shape is different, not just the volume

Three structural differences matter more than raw quantity.

**Fan-out per question.** One user question produces many system operations. Discovery calls to learn what is available, description calls to read definitions, one or more data queries, and often a second round after the model reasons over the first result. A rough multiplier of five to ten operations per question is normal, and complex questions go higher.

**Query shape inverts.** Human analytics produces a modest number of large queries. Agentic analytics produces a large number of small queries. That inversion matters because per-query overhead, planning, metadata loading, catalog round trips, and engine startup, becomes the dominant cost rather than a rounding error. A platform tuned for large scans behaves badly under this pattern.

**Cost scales with context, not with answer size.** A model call's cost is driven mostly by input tokens. An agent handed a full schema dump on every call pays for that dump every call, whether or not it used any of it. The answer is often one number. The bill reflects everything you put in front of the model to produce it.

There is a fourth difference that is behavioral rather than technical. Making questions easy increases the number of questions dramatically. That is the point of the investment and it is also the reason volume projections based on current analytics usage are wrong by a large factor.

## The cost drivers, enumerated

Build the model on these categories. Anything you leave out becomes a surprise.

**Input tokens** are usually the largest model-side line. System prompt, tool definitions, conversation history, and every tool result that returns to the model. Conversation history is the one that compounds, since a ten-turn conversation re-sends the accumulated context on every turn.

**Output tokens** cost more per unit but arrive in smaller volumes. Reasoning-heavy configurations shift the balance toward output.

**Cached input tokens**, where the provider supports prompt caching, cost substantially less than uncached. This is the single largest available lever on model spend and it depends entirely on whether your prompt structure keeps the stable parts stable.

**Query compute** on the lakehouse or warehouse. Driven by query count more than by bytes scanned under this workload shape.

**Metadata and catalog operations.** Every query load hits the catalog. At agent volumes this stops being free, and a catalog that was sized for human query rates becomes a bottleneck before it becomes a cost.

**Retries and failed paths.** An agent that picks the wrong tool, gets an error, and tries again pays for both attempts. Loop behavior where the agent circles without converging is the expensive version of this.

**Storage for telemetry.** Logging every invocation with full reasoning text produces real volume. Worth it, and worth modeling.

## Token economics in practice

The structure of a data agent's context window determines most of its cost, and the parts are unequal.

Tool definitions are sent on every call. A server exposing forty tools with verbose schemas puts a large fixed cost on every single interaction. This is an argument for a small, well-chosen tool surface that is independent of the correctness argument for one.

Schema context is where the worst waste happens. An agent given the full DDL of a warehouse with two thousand tables is carrying an enormous input payload to answer a question about one metric. This is the strongest cost argument for a semantic layer: a metric definition is a few hundred tokens, a schema dump is tens of thousands, and the metric definition produces better answers.

Tool results returning to the model are the variable cost, and they are bounded by your result limits. A query returning ten thousand rows into a context window is expensive and rarely more useful than the top fifty with an aggregate.

Conversation history compounds. Turn ten re-sends turns one through nine. Summarizing older turns rather than replaying them verbatim cuts this substantially, at some cost in fidelity.

The practical structure that minimizes cost looks like this.

| Context component | Cost behavior | Control |
|---|---|---|
| System prompt | Fixed per call, cacheable | Keep stable so it caches |
| Tool definitions | Fixed per call, cacheable | Minimize tool count, keep schemas terse |
| Metric definitions | Fetched per call, cacheable | Serve from a cached discovery endpoint |
| Conversation history | Grows per turn | Summarize beyond N turns |
| Tool results | Variable | Hard result limits, return aggregates |
| Model output | Variable | Bounded by max output tokens |

Prompt caching is the lever worth engineering around. It requires the stable prefix of your context to actually stay stable, which means putting the system prompt and tool definitions first and everything variable after. Teams that interleave dynamic content into the prefix get no caching and pay full price on every call without understanding why.

## Query economics

The lakehouse side is where the tripling in the opening happened.

Under human analytics, per-query overhead disappears into query duration. A scan that runs for forty seconds does not care about two hundred milliseconds of planning.

Under agentic analytics, a query that returns fifty rows from a pruned partition runs in under a second, and the planning, catalog round trip, and credential vending are a meaningful share of that. Multiply by a query count an order of magnitude higher and overhead becomes the bill.

Four consequences follow.

**Metadata quality matters more.** A table with hundreds of thousands of small files has expensive planning. Under human workloads you notice that occasionally. Under agent workloads you pay for it thousands of times an hour. Compaction moves from hygiene to a cost control.

**Caching pays differently.** Agents ask overlapping questions constantly, and discovery calls are near-identical. Result caching on repeated metric queries and definition caching on discovery calls remove a large share of the volume. This is the highest-return single optimization on the query side.

**Idle compute is less of a problem, sustained compute is more.** A cluster that used to sit idle between analyst sessions now has continuous low-level load. That changes the autoscaling calculus and often means a smaller always-on footprint beats a large bursty one.

**Concurrency limits bind earlier.** Many small concurrent queries hit connection and slot limits that large sequential queries never approached.

## Instrumenting before you need it

You cannot control what you have not measured, and retrofitting instrumentation after the surprise bill means you have no baseline. Log every invocation into an Iceberg table from the first day of the pilot.

```sql
CREATE TABLE ops.agents.invocations (
    invocation_id       STRING,
    session_id          STRING,
    principal           STRING,
    surface             STRING,   -- which app or loop originated it
    started_at          TIMESTAMP,
    duration_ms         BIGINT,

    model_id            STRING,
    input_tokens        BIGINT,
    cached_input_tokens BIGINT,
    output_tokens       BIGINT,

    tool_calls          INT,
    data_queries        INT,
    rows_returned       BIGINT,
    engine_ms           BIGINT,

    outcome             STRING,   -- answered, abstained, error, budget_exceeded
    retries             INT,
    question_category   STRING
)
USING iceberg
PARTITIONED BY (days(started_at))
TBLPROPERTIES ('format-version' = '3');
```

Two fields deserve emphasis.

`cached_input_tokens` separated from `input_tokens` is what tells you whether your caching strategy is working. A cache hit rate below fifty percent on a mature deployment means the prompt prefix is not stable and there is money on the table.

`question_category` requires a small classification step and pays for itself immediately. Cost per question type is the number that drives every subsequent decision, and without it you have one aggregate figure that hides everything.

From that table, three queries answer the questions people actually ask.

```sql
-- Cost drivers by question category
SELECT
    question_category,
    COUNT(*)                                  AS invocations,
    ROUND(AVG(input_tokens), 0)               AS avg_input_tokens,
    ROUND(AVG(cached_input_tokens) * 100.0
          / NULLIF(AVG(input_tokens), 0), 1)  AS cache_hit_pct,
    ROUND(AVG(data_queries), 1)               AS avg_queries,
    ROUND(AVG(engine_ms) / 1000.0, 2)         AS avg_engine_sec
FROM ops.agents.invocations
WHERE started_at >= current_date - INTERVAL '30' DAY
GROUP BY question_category
ORDER BY invocations DESC;
```

```sql
-- Sessions that ran away
SELECT
    session_id,
    principal,
    COUNT(*)                AS invocations,
    SUM(tool_calls)         AS total_tool_calls,
    SUM(input_tokens
      + output_tokens)      AS total_tokens,
    SUM(retries)            AS retries
FROM ops.agents.invocations
WHERE started_at >= current_date - INTERVAL '7' DAY
GROUP BY session_id, principal
HAVING SUM(tool_calls) > 50
ORDER BY total_tokens DESC;
```

That second query is the one to run first. Every deployment I have seen has a small number of sessions consuming a disproportionate share, and they are almost always agents looping without converging rather than users doing anything unusual.

```sql
-- Abstention and error rate over time
SELECT
    date_trunc('day', started_at) AS day,
    outcome,
    COUNT(*)                      AS n
FROM ops.agents.invocations
WHERE started_at >= current_date - INTERVAL '30' DAY
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC;
```

Rising error and retry rates are a cost problem before they are a quality problem, because every failed path is paid for.

## Building the model before you deploy

A projection built on structure rather than on the pilot's total is the one that survives. Here is how to construct it.

Start with population and behavior. Number of users with access, share who use it in a given week, and questions per active user per week. That last number is the one people get wrong. Pilot participants are enthusiasts and ask considered questions. A general population asks more questions, more casually, with a lower average value per question. Assume the rate goes up by a multiple rather than staying flat, and run the model at several multiples so you know where the pain starts.

Then get per-question cost from the pilot, broken out by category rather than averaged. A schema-exploration question and a single-metric lookup differ by an order of magnitude, and the mix in general availability will not match the pilot's mix.

Multiply out and you have a model spend projection. Now do the engine side separately, because it behaves differently. Queries per question times cost per query, where cost per query is dominated by planning rather than by scan volume. Pull actual query duration from the pilot rather than estimating, and check what share of it is planning.

Add three lines people omit.

Retries and failed paths, as a percentage uplift on both sides. Ten to twenty percent is typical on a mature deployment and higher early.

Telemetry storage and the compute to query it. Full reasoning text at scale is real volume, and the observability queries you run daily have their own cost.

The engineering time to operate it. Prompt tuning, tool surface changes, metric definitions, cost investigations. This is a standing load, not a project cost.

Then run sensitivity. In every model I have built, two assumptions dominate: questions per user per week, and the prompt cache hit rate. Compute rates and model choice matter less than either. That result should change where you spend engineering effort.

## Getting the pilot to predict the rollout

Pilots mislead in specific, correctable ways. Four adjustments make a pilot's numbers usable.

**Recruit non-enthusiasts.** A pilot staffed entirely by people who volunteered produces behavior that does not generalize. Include a group who were assigned rather than volunteered, and track their cost profile separately.

**Run long enough for novelty to fade.** The first two weeks of any new tool produce exploratory usage that is unrepresentative in both directions: more questions, lower value. Weeks four through eight are the ones to model from.

**Do not tune during the measurement window.** Teams optimize prompts and tools continuously during a pilot, which is correct engineering and makes the cost data unusable. Freeze the configuration for the measurement period.

**Include the awkward questions.** Cost per question is driven by the tail. Deliberately seed questions the semantic layer does not cover, ambiguous questions, and questions requiring multi-step reasoning, then measure what they cost. Those questions will occur in production whether or not you planned for them.

One more adjustment worth making: measure abstention. A pilot where the agent answers every question is either operating in an unusually well-covered domain or approximating, and approximation shows up as cost later when someone has to check the numbers.

## The cheapest optimization nobody runs

Before tuning anything else, look at what your agents are asking for and how often the same question arrives.

```sql
SELECT
    question_category,
    normalized_question,
    COUNT(*)                          AS asks,
    COUNT(DISTINCT principal)         AS askers,
    ROUND(AVG(input_tokens
            + output_tokens), 0)      AS avg_tokens
FROM ops.agents.invocations
WHERE started_at >= current_date - INTERVAL '30' DAY
GROUP BY question_category, normalized_question
HAVING COUNT(*) > 20
ORDER BY asks DESC
LIMIT 40;
```

The output of that query is a list of questions your organization asks repeatedly through an expensive general-purpose path. Some of them belong as a scheduled report, a cached dashboard tile, or a saved metric view that costs a fraction of an agent invocation.

This is not a criticism of the agent. It is the natural result of making questions easy: people ask the useful ones over and over. The correct response is to promote the repeated ones into cheaper delivery mechanisms and keep the agent for the questions that vary.

Teams that skip this step end up paying reasoning-model prices to answer the same six questions several thousand times a month.

The same logic applies to tool call patterns. If eighty percent of invocations begin with the same three discovery calls, those results belong in the cached prefix rather than being fetched every time.

## Controls that work

In rough order of return.

**Cap tool results hard.** A maximum in the input schema, enforced at the server. This is one line of configuration and it eliminates the worst tail cases.

**Cache discovery and definitions.** Metric lists and descriptions change on a review cycle and get requested constantly. Caching them removes a large fraction of tool call volume with no correctness cost.

**Structure prompts for provider caching.** Stable prefix first, variable content after. Measure the cache hit rate and treat anything under fifty percent as a bug.

**Replace schema context with semantic definitions.** Orders of magnitude fewer tokens and better answers. This is the rare optimization that improves quality and cost simultaneously.

**Per-session budgets.** A hard cap on tool calls or tokens per session, with a clear message when it trips. This converts a runaway loop from an unbounded cost into a bounded one.

**Compact your tables.** Planning cost multiplied by agent query volume is real money. Treat compaction as a cost control and fund it that way.

**Route by complexity.** A smaller model handles classification, routing, and simple lookups. The larger model handles genuine reasoning. This requires building a router and it is worth it once volume is meaningful.

**Result caching on repeated metric queries.** Agents ask overlapping questions. A short cache TTL on identical metric plus dimension plus filter combinations removes duplicate execution.

**Concurrency caps per principal.** Protects the engine from one agent framework and protects your bill from a runaway integration.

Two controls that feel useful and mostly are not.

Reducing max output tokens rarely helps, because output is a small share of the cost and truncating answers degrades quality for a marginal saving.

Aggressively shortening the system prompt is usually counterproductive. A short prompt that produces wrong tool selection costs more in retries than it saved in tokens.

## Attribution and chargeback

Once spend is material, someone asks who is spending it. Design for that before you are asked.

Attribute at the principal level, which requires that end-user identity flows through to the catalog and appears in the invocation record. A deployment where every request arrives as one service account cannot attribute anything, which is a governance problem before it is a finance one.

Roll up by team through your directory rather than by hand-maintained mapping.

Publish cost per question category. That is the number that lets a business owner decide whether a use case is worth its spend, and it turns a vague concern about AI costs into a specific conversation about one workflow.

Set budgets at the team level with soft and hard thresholds. Soft triggers a notification, hard degrades to a cheaper model or a lower rate limit rather than cutting access entirely. An agent that stops working without warning generates more organizational damage than the overage it prevented.

## Measuring return honestly

The cost side is measurable. The value side is where people fool themselves.

Three measurements hold up.

**Displaced work.** Count the questions the agent answered that previously went to an analyst as a ticket. Multiply by average handling time and a loaded rate. This is the most defensible number and it requires a before baseline, so collect ticket volume before launch.

**Time to answer.** The distribution shift from days to minutes has value even where nobody is displaced, because decisions get made earlier. This is harder to monetize and easier to demonstrate.

**Decisions that never got made before.** Questions nobody bothered to ask because asking was expensive. This is where most of the real value sits and it is nearly impossible to quantify. Report it qualitatively rather than fabricating a number.

Two measurements that mislead.

Query volume growth is not value. An agent that runs eight queries instead of one has not produced eight times the insight.

User satisfaction scores on a new tool are inflated by novelty for the first quarter. Wait before treating them as evidence.

The honest framing for a business case is that costs are precisely measurable and benefits are partly measurable. Present both at their real precision rather than manufacturing symmetry.

## Governance and cost are the same control surface

One structural point that saves money and gets missed because it sits between two teams.

Nearly every control in this piece is also a governance control, and nearly every governance control is also a cost control.

Result limits cap tokens and prevent bulk extraction of data through an agent. The same parameter serves both.

A constrained tool surface with no arbitrary SQL reduces the fixed token cost of tool definitions and eliminates the class of queries that scan a table nobody intended. Cheaper and safer for the same reason.

Semantic definitions instead of schema context cut input tokens by orders of magnitude and produce correct numbers instead of plausible ones.

Per-principal identity propagation is what makes chargeback possible and what makes the audit trail meaningful. A shared service account defeats both simultaneously.

Rate limits and session budgets bound the bill and bound the blast radius of a misbehaving integration.

Catalog-enforced authorization means a metric a principal cannot see is never fetched, described, or reasoned over, which removes its cost as well as its exposure.

That alignment is worth naming explicitly in internal conversations, because cost work and governance work usually compete for the same engineering time. Here they are the same work, and framing it that way is often what gets it funded.

The inverse holds too. A deployment that skipped the semantic layer and gave agents raw schema access has a cost problem and a correctness problem and a governance problem, and all three have one fix.

## What to review monthly

A short standing agenda keeps this from drifting.

Cost per question category, compared to last month. A category whose unit cost rose without a volume change means something in the path degraded, usually caching or table layout.

Prompt cache hit rate. Treat a decline as a defect and find what destabilized the prefix.

Top ten sessions by consumption. Look at what they were doing. Runaway loops and pathological question patterns surface here before they surface in the total.

Abstention rate and the questions that produced it. That list is your semantic coverage backlog, ordered by demand.

Repeated question list from the query above. Anything appearing consistently belongs in a cheaper delivery path.

Retry and error rate. Rising numbers are paid-for failures.

Query planning share of engine time on the tables agents hit most. Rising planning share means compaction is behind.

Team-level spend against budget, with a note on which use case drove any variance.

Seven of those eight come from the invocations table with a single query each. The one that requires human judgment is reviewing what the expensive sessions were doing, and that is the one worth the time.

## Failure modes

**No baseline.** Instrumentation added after the surprise bill leaves you unable to explain what changed. Instrument during the pilot.

**Aggregate-only reporting.** One total spend figure hides that eighty percent comes from one use case with a fixable pattern.

**Ignoring the engine side.** Model provider cost is visible on an invoice with a familiar name. Lakehouse compute increases hide inside an existing bill that was already growing. Split the attribution.

**Pilot economics projected linearly.** Pilots have engaged users asking considered questions. General availability has casual users asking many more, cheaper questions with a worse ratio of value to cost.

**Caching assumed rather than verified.** Teams believe prompt caching is working because they configured it. Measure the hit rate.

**Runaway loops undetected.** A single agent circling for hours consumes more than a thousand normal interactions. Detect it with per-session caps rather than a monthly review.

**Cost controls that break correctness.** Truncating results to save tokens produces wrong answers from partial data. Never let a cost control silently reduce the data an answer is based on. If a limit trips, say so in the response.

## Conclusion

Agentic analytics costs are predictable in structure and surprising in magnitude, because the workload shape differs from anything the team has budgeted before: many small queries instead of few large ones, and a bill driven by context volume rather than answer size.

Model the seven drivers, instrument every invocation into a table on day one of the pilot, and split reporting by question category so you can see which use case is expensive.

Then apply the controls that actually return: hard result caps, cached discovery, a prompt structure that lets provider caching work, semantic definitions instead of schema dumps, per-session budgets, and compaction on the tables agents query most.

Measure return against a baseline you collected before launch, report the parts you can quantify at their real precision, and describe the rest qualitatively. A business case that admits which half is soft survives scrutiny better than one that does not.

## Keep Going

If this piece was useful, I have written a lot more on agentic architecture and lakehouse economics. *Architecting an Apache Iceberg Lakehouse* covers the table design and maintenance practices that drive the query-side costs discussed here, and *Apache Polaris: The Definitive Guide* covers the identity and catalog layer that makes per-principal attribution possible. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
