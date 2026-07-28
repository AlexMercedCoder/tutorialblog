---
title: "What Agentic Analytics Actually Costs, and How to Keep It Bounded"
date: "2026-07-28"
description: "Agent analytics generates two cost streams that scale on different variables. Here's the arithmetic, the levers that actually move the number, and how to build attribution before you need it."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - AI Agents
  - Analytics
  - Cost Optimization
  - Apache Iceberg
canonical: "https://iceberglakehouse.com/posts/agentic-analytics-tco/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/agentic-analytics-tco/).

# What Agentic Analytics Actually Costs, and How to Keep It Bounded

A data platform team gets a question from finance in month four of an agent rollout. The engine bill is up 38 percent and the model provider invoice arrived at a number nobody forecast. What is driving it?

The team cannot answer. Every agent runs under the same service account, so engine cost attributes to one line item labeled with a machine name. Token spend arrives as one figure from the provider with no breakdown by use case. The honest answer is that the money went somewhere and the instrumentation to say where was never built.

That conversation is the norm rather than the exception, and it usually ends one of two ways. Either the program gets capped by a budget decision made without information, or it continues with cost as an accepted mystery. Both are worse than the third option, which is arithmetic.

I work at Dremio, which sells a query engine, so the compute half of this bill is something I have a commercial interest in. The cost model below is engine-agnostic and the levers work regardless of what you run.

This piece covers the two cost streams and how they behave differently, how to attribute spend to agents, the arithmetic that predicts your bill before you get it, why agent query patterns are shaped badly for cost, and the specific levers that move the number.

## Two bills that behave differently

Agentic analytics generates cost in two places, and they scale on different variables.

**Model inference** is charged by tokens, split into input and output. The input side dominates in analytics workloads, because tool definitions, schema context, retrieved descriptions, and conversation history all go in on every turn. Output is comparatively small, since a SQL query and a paragraph of explanation is not many tokens.

The critical property: input tokens grow with conversation length. Turn one sends the system prompt plus the question. Turn six sends the system prompt, the question, and everything from turns one through five including every tool result. A twelve-turn session does not cost twelve times a one-turn session. It costs substantially more, because each turn carries the accumulated context.

**Query compute** is charged by your engine's model, which is usually some combination of provisioned capacity, execution time, and bytes scanned. It scales with how much data each query touches and how many queries run.

These interact in a way worth noticing. An agent that lacks good datasets writes exploratory queries, which cost more compute. Those queries return results that go into context, which cost more tokens. Then the agent, having gotten a partial answer, asks another question. Bad data modeling raises both bills at once, which is why the cheapest cost lever is often not a cost lever at all.

A third cost that shows up in real budgets: the engineering time to build and maintain the semantic layer and the telemetry. That is real money and it is a one-time-plus-maintenance shape rather than a per-query shape, so it belongs in the business case rather than in the unit economics.

The three ways an organization answers the same question have very different cost shapes.

| | Dashboard | Human analyst | Agent |
|---|---|---|---|
| Cost per answer | Near zero after build | High (analyst hours) | Moderate (tokens plus compute) |
| Cost to add a new question | High (build cycle) | Moderate (analyst time) | Near zero |
| Latency to answer | Seconds | Hours to days | Seconds to minutes |
| Scales with question variety | Poorly | Well | Well |
| Scales with question volume | Very well | Poorly | Moderately |
| Marginal cost of a repeated question | Zero | High | Full price again |

The last row is where the money leaks. Agents have the worst repeat economics of the three, and repeats are common. Everything in the caching section exists to fix that row.

The row above it explains where agents earn their keep: questions that vary too much for a dashboard and arrive too often for an analyst. That is a real and large category, and it is the honest scope of the value case.

## Getting attribution before you need it

You cannot manage what you cannot attribute, and attribution has to be designed in. Retrofitting it means going back through months of undifferentiated spend and guessing.

Three things make attribution work, and none is difficult.

**One principal per agent use case.** Not one shared service account. Engine job history records the principal, so a distinct principal per agent turns the engine bill into a breakdown for free. This is the single highest-value thing on the list and it takes an hour.

**Session IDs propagated into queries.** Most engines accept a comment or tag on a query that lands in job history. Attach the agent's session ID and you can join engine-side cost records to your own agent telemetry.

```python
def run_agent_query(engine, sql: str, session_id: str,
                    agent: str, principal: str):
    tagged = f"-- session={session_id} agent={agent}\n{sql}"
    return engine.execute(tagged, principal=principal)
```

**Token accounting recorded per session.** The provider response carries token counts. Record them alongside the session. Without this, you have a monthly invoice and no way to decompose it.

With those three in place, the cost question becomes a query:

```sql
SELECT
    s.agent_name,
    count(DISTINCT s.session_id)                       AS sessions,
    sum(s.input_tokens)                                AS input_tokens,
    sum(s.output_tokens)                               AS output_tokens,
    sum(j.bytes_scanned) / power(1024, 4)              AS tb_scanned,
    sum(j.execution_ms) / 1000.0 / 3600.0              AS engine_hours,
    sum(s.input_tokens) / count(DISTINCT s.session_id) AS input_tokens_per_session
FROM governance.ai.agent_sessions s
JOIN engine.system.jobs j
  ON j.query_tag_session_id = s.session_id
WHERE s.started_at >= :month_start
  AND s.started_at <  :month_end
GROUP BY 1
ORDER BY engine_hours DESC;
```

Multiply by your rates and you have per-agent cost. Divide by sessions and you have unit economics, which is the number that lets you forecast.

I am deliberately not quoting model prices here. They change often enough that a printed figure misleads, and the ratios matter more than the absolutes. Pull current rates from your provider and put them in one configuration file that the cost query reads, so the arithmetic updates when prices do.

## The arithmetic that predicts your bill

Work the numbers before the rollout rather than after. The model is simple enough for a spreadsheet.

Start with the token side. For one session:

```
input_tokens  ≈ T × (S + D) + Σ(turn_content across turns)
```

Where `T` is turns, `S` is system prompt plus tool definitions, and `D` is the schema and description context you inject. The `S + D` term multiplies by turn count, which is the whole story.

Put numbers on it. A system prompt plus tool definitions at 3,000 tokens, schema context at 2,000, and a 10-turn session: the fixed portion alone is 10 × 5,000 = 50,000 input tokens before any content. Add accumulated tool results and conversation, realistically another 30,000 to 60,000 for a session that reads a few tables. Call it 100,000 input tokens for a moderate session.

Now scale. At 1,000 sessions a day, that is 100 million input tokens a day, roughly 3 billion a month. Whatever your rate is, multiply. The number is usually larger than the intuition that preceded it.

The compute side:

```
engine_cost ≈ queries_per_session × sessions × cost_per_query
```

Agent sessions in my experience run 3 to 12 queries. Cost per query depends entirely on whether the agent hits a well-shaped gold dataset or scans a raw table. That variance is enormous, often two orders of magnitude, which is why the compute forecast has to come from measurement rather than from a formula.

Three sensitivities to test in the spreadsheet, because they determine where to spend effort.

**Turn count.** Halving average turns from 10 to 5 nearly halves token spend, because the fixed context multiplies by turns. Turn count falls when the agent finds what it needs quickly, which is a data modeling outcome rather than a cost initiative.

**Fixed context size.** Trimming `S + D` from 5,000 to 3,000 tokens cuts 40 percent off the fixed portion of every turn of every session. This is often the fastest available win and it is usually available, because tool definitions and schema dumps accumulate cruft nobody prunes.

**Sessions per user per day.** This one grows on its own as adoption spreads, and it is the variable most likely to make your forecast wrong. Model it optimistically for capacity planning and pessimistically for budget.

## Why agent queries are shaped badly for cost

Human analytical workloads have properties that engines and cost models were designed around. Agent workloads violate several of them.

**Queries are exploratory rather than targeted.** An analyst who knows the data writes one query. An agent that does not writes three: one to see what is there, one that gets the shape wrong, one that works. Two of those three are pure cost.

**Filters are often absent or wrong.** A human writing a query against a partitioned table naturally filters on the partition column, because they know the table is big. An agent lacking that context writes a query with no partition filter and scans everything. On a table where a filtered query touches 2 GB and an unfiltered one touches 4 TB, this single behavior dominates the bill.

**Arrival is unpredictable.** Batch workloads run on a schedule and you provision for the peak you know. Agent workloads arrive when users ask things, which correlates with business hours and with nothing else. Provisioned capacity sized for the average is saturated at the peak, and sized for the peak is idle most of the time.

**The same question gets asked repeatedly.** Ten users ask about last month's revenue and produce ten independent full computations. A dashboard computes it once and serves it ten times.

That last property is the most tractable and the most ignored. Human workloads self-cache through dashboards and reports. Agent workloads do not, unless you build the caching.

The general shape: agent workloads are cheaper per question than a human analyst's time and more expensive per question than a dashboard. The economics work when agents replace analyst hours on questions that had no dashboard. They work badly when agents recompute things a dashboard already answers, which happens by default because nobody told the agent the dashboard exists.

## A worked example

Abstract formulas are less useful than one set of numbers carried all the way through. Here is a hypothetical deployment sized like ones I have seen.

**The setup.** A mid-sized organization. 200 people with access to an analytics agent. Average 3 sessions per active user per week, with 40 percent of licensed users active in a given week. That is 200 × 0.4 × 3 = 240 sessions per week, roughly 1,000 a month.

**Token side.** System prompt plus tool definitions: 3,000 tokens. Injected schema and description context: 2,000 tokens. Average 8 turns per session.

Fixed portion: 8 × 5,000 = 40,000 input tokens.
Accumulated content, meaning questions, tool results, and prior turns: call it 45,000.
Total input: about 85,000 tokens per session.
Output: about 4,000 tokens per session.

At 1,000 sessions a month: 85 million input tokens, 4 million output tokens.

**Compute side.** 6 queries per session, 6,000 queries a month. This is where the variance lives. Two scenarios:

*Without gold datasets.* Agents explore. Average 180 GB scanned per query, because unfiltered scans against wide raw tables are the default when nothing better exists. 6,000 × 180 GB = roughly 1.05 PB scanned per month.

*With gold datasets.* Agents hit shaped datasets with partition-aligned filters. Average 2 GB scanned per query. 6,000 × 2 GB = 12 TB per month.

That is a factor of about 88 between the two scenarios, on the same number of queries answering the same questions. Whatever your engine charges, that ratio is the headline finding.

**The turn count interaction.** In the exploratory scenario, sessions also run longer, because the agent takes more attempts to get a usable answer. Bump 8 turns to 13 and input tokens per session go from 85,000 to roughly 140,000, a 65 percent increase on the token bill as well.

So the comparison is not "gold datasets save compute." It is that the same investment cuts the compute bill by most of two orders of magnitude and the token bill by more than half.

**What this tells you about sequencing.** Do not start with a cost optimization project. Start by building gold datasets for the top questions, which you should do for accuracy anyway, and measure the cost before and after. The cost improvement is a side effect of the accuracy work, and framing it that way gets the work funded by two budgets instead of one.

**Sanity-checking your own numbers.** Take your actual sessions per month, your actual average turns, and your actual bytes scanned per query from job history. Plug them in. If bytes scanned per query is in the tens or hundreds of gigabytes, you are in the exploratory scenario and you know what to do. If it is single-digit gigabytes, your compute is already efficient and the token side is where to look.

## What actually makes an agent query expensive

Compute cost reduces to bytes scanned and work done, and four things drive both. Knowing which one you are hitting tells you what to fix.

**Missing partition filters.** The dominant factor by a wide margin. A table partitioned by day, holding three years of data, scans about 1,100 times more data without a date filter than with one narrowed to a single day. An agent that does not know the table is partitioned writes the unfiltered version.

The fix is not to teach the agent about partitioning. It is to make the tool require a date range as a parameter, so an unbounded query is unexpressible. A tool signature with required `start_date` and `end_date` arguments eliminates this failure entirely.

**Wide projection.** Columnar formats charge for the columns you read. An agent doing `SELECT *` on a 200-column table to "see what is there" reads all of them. On a wide table this is a large multiple of what the question needed.

The fix is a describe tool that returns the schema from metadata rather than from a data query, plus a sample tool with a hard row cap. An agent that gets its orientation from metadata never issues an exploratory `SELECT *`.

**Small files.** A table with 400,000 small files spends most of a query's time on file opens and metadata rather than on data. This is a maintenance problem rather than an agent problem, and agents make it visible because they issue more queries against more tables than a hand-built dashboard workload does.

Compaction on a schedule fixes it. The signal is planning time growing while data volume is flat.

**Joins the agent should not be writing.** A join with the wrong cardinality does not just produce a wrong answer, it produces an expensive one, because the intermediate result explodes before anything filters it. A fan-out join on a large fact table can turn a 2 GB scan into a multi-terabyte shuffle.

The fix, again, is the dataset rather than the agent. Pre-joined gold datasets remove the join from the agent's job.

Notice the pattern across all four. Every fix is either a tool schema change or a data layout change, and none of them is a model change. That is characteristic of this whole problem area: the levers that move cost meaningfully sit in the data layer, and the ones people reach for first sit in the prompt.

A practical diagnostic. Pull the ten most expensive agent queries from job history over the last week and read them. Each one will exhibit one of these four patterns, usually obviously. Fixing the pattern behind the top three typically moves the monthly number more than any general optimization effort.

## The levers, in order of value

Ranked by what I have seen actually move the number.

**Build the gold datasets.** The single largest lever, and it does not look like a cost lever. An agent querying a well-shaped dataset with the business rules applied writes one query that scans a fraction of what an exploratory query touches. It also finishes in fewer turns, which cuts token spend. One investment, both bills.

The measurable version: track bytes scanned per session by agent. Agents with high values are exploring because they lack a dataset that answers the question directly. Each one is a gold dataset waiting to be built, and the cost data tells you which to build first.

**Cache aggressively at the result level.** Identical or near-identical questions recur constantly. A cache keyed on the normalized query, with a time to live matched to the underlying data's refresh cadence, removes a large share of repeat computation.

```python
def cached_query(sql: str, session_id: str, ttl_seconds: int = 900):
    key = hashlib.sha256(normalize_sql(sql).encode()).hexdigest()
    hit = cache.get(key)
    if hit is not None:
        telemetry.record(session_id, "cache_hit", key=key)
        return hit
    result = engine.execute(sql, session_id=session_id)
    cache.set(key, result, ttl=ttl_seconds)
    return result
```

`normalize_sql` matters more than the cache. Two agents asking the same question produce SQL that differs in whitespace, alias names, and clause order. Normalizing before hashing turns a 5 percent hit rate into something worth having. Record hits in telemetry so you know what the cache is buying.

**Trim the fixed context.** Audit what goes into every turn. Tool definitions written verbosely, schema for tables the agent rarely touches, examples that no longer earn their place. Cutting 2,000 tokens off the per-turn fixed cost saves that amount times every turn of every session, forever.

Specifically: do not inject the whole catalog schema. Give the agent a search tool that returns the two or three relevant datasets. That change alone often halves the context.

**Cap turns and bound spend.** A hard maximum on tool calls per session, and a token ceiling that ends the session with a partial answer rather than continuing. Sessions that run long are usually failing rather than making progress, so the cap costs less answer quality than it appears to.

**Use materialized aggregates for recurring shapes.** When telemetry shows the same aggregation pattern repeatedly, materialize it. Engines that manage materializations from observed query patterns do this automatically. Where yours does not, the telemetry tells you what to build by hand.

**Route by difficulty.** Not every step needs the largest model. Classification, extraction, dataset selection, and routing steps run acceptably on smaller models. Reserve the expensive model for the reasoning that needs it. This is real money and it is more engineering work than the other levers, so it comes after them.

A caution on this one. Routing introduces a quality cliff that is hard to see, because the small model handles the easy 90 percent well and fails on the hard 10 percent in ways that look like ordinary variation. If you route, evaluate the routed steps against your accuracy suite separately rather than trusting an aggregate number. A cost saving that quietly costs accuracy is a bad trade you will discover late.

**Separate agent compute from interactive compute.** Agent queries competing with human dashboard queries produce contention that makes both slower, and slower means more compute-seconds billed. Isolating them costs some capacity efficiency and buys predictability.

The isolation also gives you a clean measurement boundary. When agent traffic runs on its own capacity, the agent cost is whatever that capacity costs, with no allocation argument. Teams that share capacity spend real time arguing about what fraction of a shared cluster belongs to which workload, and the arguments are unresolvable because the answer depends on assumptions nobody agrees on. A separate engine turns a modeling problem into a reading of a bill.

One caveat on sizing the isolated capacity: agent traffic is peakier than dashboard traffic, so the isolated pool needs more headroom relative to its average than the shared pool did. Budget for that rather than being surprised by queuing in the first busy week.

## Building the business case honestly

Cost control only matters against a value number, and value cases for agentic analytics are frequently built badly. Two failure patterns.

The first is counting hours saved that were never spent. "This agent answers 400 questions a month, an analyst takes 30 minutes per question, so we saved 200 analyst hours." That arithmetic assumes all 400 questions were headed for an analyst. Most of them were not. They went unasked, or someone guessed, or a stale dashboard got squinted at. The agent created demand as much as it absorbed it.

That is not a criticism of the value. Questions getting answered that previously went unanswered is genuinely valuable. It is a different claim from cost displacement, and conflating them produces a business case that collapses the first time finance asks whether headcount went down.

The second failure is ignoring the build cost. The gold datasets, the semantic layer, the telemetry, the guardrails. That work is substantial, it is mostly front-loaded, and it does not go away. A value case that counts only per-query costs against analyst hours omits the largest line item in year one.

A defensible frame separates three things.

**Displaced work.** Questions that genuinely consumed analyst time and now do not. Measure it by asking the analysts, not by counting agent sessions. This number is usually smaller than expected and it is real.

**New capability.** Questions now getting answered that previously were not. Value it qualitatively rather than pretending to a dollar figure, or value it by the decisions it changed if you can trace any.

**Latency improvement.** Answers in minutes rather than days. On some decisions this is worth a lot and on most it is worth little. Be specific about which decisions.

Against those, put the full cost: tokens, compute, and the loaded engineering time for building and maintaining the layer underneath. Include an ongoing maintenance figure, because semantic layers that stop being maintained stop working within a couple of quarters.

The reason to do this carefully is not accounting hygiene. It is that a program with an inflated value case gets cut hard when the inflation is discovered, and one with a modest defensible case survives budget scrutiny. I have watched both outcomes and the second is much better for everyone including the people who wanted the ambitious number.

One more thing worth putting in the case: the gold datasets and semantic definitions built for agents serve humans too. Dashboards get easier to build, analysts get a better starting point, and the definitions become the organization's shared vocabulary. That investment does not depend on the agent program continuing, which makes it much easier to justify than agent-specific spend.

## Failure modes

**No attribution, so no management.** The opening scenario. Warning sign: agents sharing a service account. Fix: one principal per use case, and do it before the second agent ships rather than after the fourth.

**Context bloat by accretion.** Every incident adds a line to the system prompt and a new tool. Nothing ever gets removed. Six months later the fixed context has doubled and so has the token bill. Warning sign: nobody has measured the system prompt token count this quarter. Fix: measure it monthly, treat growth as a regression.

**Retry multiplication.** The agent framework retries, the engine retries the commit, the client retries the HTTP call. One logical operation becomes nine, each one billed. Warning sign: engine job counts far exceeding tool call counts in your telemetry. Fix: retry at one layer only.

**Runaway sessions with no ceiling.** An agent loops, each turn carrying more context than the last, and the session runs until something external stops it. This is the shape that produces a single alarming invoice line. Warning sign: a long tail of sessions with high turn counts. Fix: hard bounds on turns, wall clock, and spend.

**Cache that never hits.** Built, deployed, celebrated, and returning a 2 percent hit rate because SQL normalization was skipped. Warning sign: cache hit rate below 15 percent on a workload with repeated questions. Fix: normalize before hashing, and check what near-miss keys look like.

**Optimizing tokens while compute dominates, or the reverse.** Teams pick a lever based on which bill arrived most recently rather than which is larger. Warning sign: a cost initiative with no measurement of the split. Fix: compute the split first. It differs a lot by workload and determines where effort belongs.

**Scheduled agents nobody remembers.** An agent set up to run hourly for a pilot, still running eight months later, answering a question nobody reads. Warning sign: agents with steady cost and no interactive users. Fix: quarterly inventory with an owner named for each agent, and delete the orphans.

**Sizing capacity from the average.** Agent traffic is peaky. Capacity sized for the mean saturates during business hours, queries queue, and the user experience degrades in a way that gets blamed on the agent. Warning sign: latency varying by time of day more than by question complexity. Fix: size from the p95 of concurrent sessions.

## Operational guidance

**Compute the split before choosing a lever.** Token spend versus compute spend, per agent, per month. On workloads with long sessions and small queries, tokens dominate. On workloads with short sessions and heavy scans, compute dominates. The right lever differs completely.

**Set unit economics as the tracked metric.** Cost per session, cost per successful answer. Total cost rising because usage doubled is good news. Cost per session rising means something regressed, and only the unit number distinguishes them.

**Track cost of failed sessions separately.** Sessions that ended without a useful answer cost the same as successful ones. That figure is usually a meaningful share of the total, and it converts an accuracy problem into a budget argument that gets funded. Define failure concretely before you measure it: a session that ended at a bound, produced an error, or got an explicit thumbs-down all count, and sessions where the user simply left are ambiguous enough to report separately.

**Put a spend ceiling on every agent, enforced in code.** Daily or monthly, with an alert before the cap and a hard stop at it. The stop should degrade gracefully with a message to users rather than failing opaquely.

**Review the top ten sessions by cost every week.** Ten minutes. The expensive tail is where the pathologies live, and reading a few of them teaches more about your workload than any dashboard. The pattern you find is rarely exotic: a loop, a missing filter, or a question the datasets do not cover.

**Rate limit per user, not just per agent.** One user in a loop with an agent generates a surprising amount of spend. A per-user ceiling catches it without constraining the agent overall.

**Model the cost of a new agent before approving it.** Expected sessions per day, turns per session, queries per session, bytes per query. The estimate will be wrong and it establishes the order of magnitude, which is what prevents a surprise.

**Alert on bytes scanned per session, not just on total spend.** Total spend rises with adoption, which is expected and not actionable. Bytes scanned per session rising means queries got worse, which is a regression with a specific cause you can find.

**Put the top-cost query into your weekly review.** One query, read by a person. It is nearly always instructive, and it takes two minutes.

**Instrument the cache hit rate as a first-class metric.** It is the cheapest large win available and it degrades silently when SQL patterns shift. A hit rate that fell from 40 percent to 12 percent after an agent update is a regression worth catching in a week rather than in a quarter.

**Separate one-time build cost from recurring run cost in every report.** Finance reads a single blended number as a run rate and forecasts forward from it. Splitting the two prevents a front-loaded investment from being projected as a permanent expense.

**Publish the numbers.** Cost per session and total spend by agent, visible to the teams using them. Transparency does more for optimization behavior than any policy, and it costs a dashboard.

**Keep rates in configuration, not in a spreadsheet.** Model prices and engine rates change. A cost query reading a rate table stays correct. A spreadsheet someone built in March does not.

## Forecasting before you commit

The budget conversation happens before the data exists, which means the first forecast is an estimate. Estimates are fine as long as they are structured and revisited.

Build it in three tiers so the range is visible rather than hidden inside a single number.

**Conservative.** Adoption at half of licensed users, 2 sessions per active user per week, gold datasets in place for the top questions. This is what happens if the program works and stays scoped.

**Expected.** Adoption at 40 percent active weekly, 3 sessions each, mixed dataset coverage. The middle case, and usually the one that turns out closest.

**Runaway.** Adoption at 70 percent, 6 sessions each, no gold datasets built because the timeline slipped. This is not a pessimistic case, it is the specific case where the enabling work does not happen and usage grows anyway. It is also the case most likely to produce the surprise invoice, because both variables move in the wrong direction together.

The spread between conservative and runaway on a typical deployment is often 30 to 50 times, driven almost entirely by the dataset coverage variable rather than by adoption. Showing that spread to a budget holder makes an argument that a single number cannot: the enabling work is not a nice-to-have that improves quality, it is the difference between two wildly different bills.

Revisit monthly for the first quarter. The variable that will be most wrong is sessions per user, and you find out fast. Adoption curves for internal tools are hard to predict and easy to measure.

One thing to include in the forecast that teams leave out: the cost of the period before the gold datasets exist. If you turn the agent on in month one and the datasets land in month four, months one through three run in the expensive regime. That is a real line item and it argues for sequencing the datasets first and the agent second, rather than the reverse, which is the order most rollouts actually follow.

A note on capacity as distinct from cost. If your engine is provisioned rather than consumption-priced, the forecast question changes from spend to saturation. The number to model is concurrent sessions at peak, not sessions per month, because that is what determines whether queries queue. Peak concurrency on a business-hours workload runs several times the daily average rate, and sizing from the average is the reliable way to produce a system that feels slow at exactly the times people use it.

## Chargeback and who pays

Once attribution works, a governance question follows: does the cost sit with the platform team or with the teams using the agents?

Both models are defensible and they produce different behavior, which is the point worth understanding before picking one.

**Central budget.** The platform team absorbs the cost. Adoption is frictionless, which is what you want early, and nobody optimizes because nobody feels the bill. This is the right model for a pilot and a bad one at scale, because the platform team ends up defending a growing number they do not control.

**Full chargeback.** Each consuming team pays for its agents. Teams optimize, because the cost is theirs. They also under-adopt, because a team weighing a new use case against its own budget says no more often than is optimal for the organization. And you inherit a reporting burden, since chargeback with imprecise attribution produces disputes rather than accountability.

**Showback.** Report cost per team without billing it. Teams see their number, comparison creates pressure, and adoption stays frictionless. This is my default recommendation once you are past the pilot, and many organizations find it sufficient permanently.

Whichever you pick, two design rules hold.

Attribute at the use case level, not the team level. "Marketing spent this much" is less actionable than "the campaign performance agent spent this much." The second names a thing someone can improve.

Report the enabling cost separately. The gold datasets and semantic layer serve everyone including humans. Loading that cost onto the first agent that used a dataset produces a distorted picture and discourages exactly the investment you want. Keep platform investment in the platform budget and charge only the marginal per-session cost.

One organizational trap worth naming. When cost lands on consuming teams and the levers that control it sit with the platform team, you have created accountability without authority, which produces frustration rather than optimization. If you charge back, publish which levers a consuming team controls: turn counts, session volume, which agents they run. And be clear that dataset coverage, the biggest lever of all, sits with the platform team and is funded centrally.

## Where this is heading

Three trends bear on the arithmetic.

Model prices per token have fallen consistently and I expect that to continue, which pushes the balance toward compute over time. It does not make token spend irrelevant, because falling prices reliably get absorbed by longer sessions and larger context rather than by lower bills. Plan on the unit price dropping and the usage rising.

Caching is moving into the infrastructure. Provider-side context caching, which discounts repeated prefix content, directly targets the fixed-context problem described earlier and rewards designs that keep the stable part of the prompt stable. Structuring prompts so the invariant portion comes first is a cheap adaptation worth making now.

On the compute side, the interesting direction is workload-driven optimization. Engines that observe query patterns and manage materializations automatically handle the recurring-shape problem without anyone filing a ticket, which matters more for agent traffic than for human traffic because the pattern distribution moves faster than a human review cycle. Expect that scope to widen from materializations toward table layout, since sort order and partitioning are workload-driven decisions with the same shape.

The thing I have not seen solved well is cross-agent deduplication. Ten agents asking overlapping questions today produce ten independent computations, and a shared semantic result cache across agents is an obvious win nobody has built cleanly.

## Conclusion

Agentic analytics costs money in two streams that behave differently. Token spend scales with turns times fixed context, which means conversation length and prompt size drive it more than question complexity does. Compute spend scales with what each query scans, which depends almost entirely on whether the agent has a dataset that answers the question directly.

You cannot manage either without attribution, and attribution has to be designed in: one principal per agent, session IDs propagated into queries, token counts recorded per session. Three small pieces of work that turn the monthly invoice from a mystery into a query.

The largest lever does not look like a cost lever. Building the gold datasets that let an agent answer in one targeted query rather than five exploratory ones cuts both bills at once, and the telemetry tells you exactly which datasets to build by showing which agents scan the most per session. After that: cache with proper SQL normalization, trim the fixed context, bound sessions, and materialize the recurring shapes.

Measure the split before picking a lever. Track cost per session rather than total. Watch the expensive tail weekly. That is the whole practice, and it takes less effort than the budget conversation you have without it.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and query economics. *Architecting an Apache Iceberg Lakehouse* from Manning covers the data modeling and layout decisions that determine what a query costs to run. *Apache Iceberg: The Definitive Guide*, which I co-authored for O'Reilly, goes deeper on partitioning, statistics, and the metadata that lets an engine skip data instead of scanning it. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
