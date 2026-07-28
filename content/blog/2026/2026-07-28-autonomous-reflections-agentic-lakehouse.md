---
title: "When the Query Optimizer Starts Managing Its Own Materializations"
date: "2026-07-28"
description: "Autonomous materialized view management replaces quarterly review meetings with workload-driven scoring, and it's essential when AI agents generate unpredictable query patterns."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Query Optimization
  - AI Agents
  - Materialized Views
canonical: "https://iceberglakehouse.com/posts/autonomous-reflections-agentic-lakehouse/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/autonomous-reflections-agentic-lakehouse/).

# When the Query Optimizer Starts Managing Its Own Materializations

A data engineer maintains 60 materialized views. Twelve of them accelerate queries nobody runs anymore, because the dashboard they served got retired in March and nobody told her. Eight of the slowest queries in the system have no acceleration at all, because the analysts who run them never filed a ticket. She finds out about both problems during a quarterly review, six months late.

This is the normal state of materialized view management, and it is not a competence problem. It is an information problem. The person deciding what to materialize does not see the query log, and the system that sees the query log does not decide what to materialize.

The gap gets worse when the queries stop coming from people. An AI agent exploring a question generates query patterns nobody designed, at times nobody scheduled, against tables nobody expected. The quarterly review cadence was already too slow for human analysts. Against automated workloads it is not a cadence at all.

I work at Dremio, and the concrete system I use as a worked example here is Dremio's Autonomous Reflections. The general problem belongs to everyone building on a lakehouse, and the reasoning transfers to any system that maintains materializations. Every specific claim about the product comes from public documentation you can check.

This piece covers what the materialization selection problem actually is, how a cost-based scoring model decides what to build and what to drop, how freshness gets maintained against changing Iceberg tables, and what breaks when you hand this to a machine.

## The materialized view selection problem

Precomputing results is the oldest trick in analytical databases. If a query is expensive and runs often, compute it once and serve the answer from storage. The technique is not interesting. Deciding what to precompute is.

The problem has a formal name in database literature: view selection. Given a workload, a storage budget, and a maintenance budget, choose the set of materializations that minimizes total query cost. It is a hard optimization problem, and it has three properties that make manual solutions fail.

**The search space is enormous.** A single table with 12 columns and 4 common filter predicates has thousands of plausible aggregate materializations. A warehouse with 400 tables and views has more candidates than anyone enumerates by hand.

**The objective is a tradeoff, not a maximum.** Every materialization accelerates some queries and costs storage plus refresh compute. Building all of them is worse than building none, because the refresh load swamps the engine. The right answer sits somewhere in the middle, and the middle moves.

**The workload is nonstationary.** The queries that ran last quarter are not the queries that will run next quarter. A materialization that paid for itself in January is dead weight in June. Nobody notices, because nothing fails when a materialization stops being useful. It just quietly costs money.

That third property is the one that defeats human management. Creating materializations is a satisfying task with visible payoff. Removing them is thankless work with no obvious trigger, so it does not happen. Every mature deployment I have seen accumulates a layer of materializations nobody dares delete because nobody knows what depends on them.

The manual workflow also inverts the information flow. An engineer decides what to materialize based on what people complained about. Complaints are a biased sample. The queries that get complained about are the ones a person waited on, which excludes everything scheduled, everything automated, and everything a user gave up on rather than reporting.

The query log has all of this. The optimizer already parses every query, builds a plan, and estimates cost. Using that information to drive materialization decisions is the obvious move, and the reason it took the industry so long is that the last step, acting without asking, requires a lot of confidence in the scoring.

The three operating modes compare like this.

| | Manual | Recommendation-assisted | Autonomous |
|---|---|---|---|
| What to build | Engineer decides | System ranks, engineer approves | System decides |
| What to drop | Rarely happens | System scores, engineer approves | System decides, with grace period |
| Reaction time | Weeks to quarters | Days | Within the analysis window |
| Handles unstable workloads | Poorly | Partly | Yes |
| Audit trail | Change tickets | Change tickets | History log |
| Right for | Regulated or latency-critical assets | Building confidence in the scoring | The general case |

Most deployments end up mixed. Latency-critical assets stay manual, everything else runs autonomous, and the recommendation path exists for the occasional targeted fix.

## What a materialization is, mechanically

Before the automation, the mechanism.

In Dremio the unit is called a Reflection. A Reflection is an optimized materialization of an anchor table or view. It gets stored as Iceberg data, and it carries its own sort order, partitioning, and aggregation.

Two shapes cover most cases.

**Raw Reflections** retain the same rows as the anchor while allowing a subset of columns, with their own sort and partition layout. These accelerate queries that filter and project against a wide table. A table with 200 columns where queries touch 8 of them reads far less data from a raw Reflection carrying those 8, sorted on the common filter column.

**Aggregation Reflections** are summarized representations. They pre-group along chosen dimensions and precompute measures. Most BI tools generate aggregation and GROUP BY queries, so these accelerate the dashboard workload directly. The guidance for aggregation Reflections is to pick dimensions with relatively low cardinality, since a dimension with millions of distinct values produces a materialization nearly as large as the source.

The part that matters architecturally is substitution. Users query the view. The optimizer matches available Reflections against the query plan and substitutes one where it produces the same answer more cheaply. Nobody rewrites their SQL to point at a materialization. The acceleration is a planning decision.

That property is what makes automation possible at all. If users had to reference materializations by name, creating and dropping them automatically breaks queries constantly. Because substitution happens in the planner, a materialization appearing or disappearing changes performance and never changes results.

This is the transferable idea, and it holds outside any one product. Automatic materialization management requires transparent substitution. A system where materializations are addressed directly cannot manage them autonomously, because the addressing creates a dependency that automation has to respect.

## What substitution actually requires

Transparent substitution sounds simple and is not. The optimizer has to prove that answering from a materialization produces the same result as answering from the source. Understanding when that proof succeeds tells you why some materializations get used constantly and others sit unused.

**Column coverage.** A raw materialization carrying 8 columns accelerates a query touching those 8 or a subset. A query touching a ninth column cannot use it, and the optimizer falls back to the source. This is why a materialization built for one dashboard often does nothing for a similar dashboard that adds one field.

**Filter compatibility.** A materialization built over a filtered subset only serves queries whose filters are at least as restrictive. Materialize last 90 days and a query asking for last 30 days uses it. A query asking for last 180 days cannot.

**Aggregate rollup.** This is where aggregation materializations earn their value. A materialization grouped by day, region, and product serves a query grouped by month and region, because monthly totals roll up from daily ones and the region dimension is present. It does not serve a query grouped by day and customer, because customer was never in the grouping and no aggregation recovers a dimension that was collapsed.

The rollup rule has a practical consequence worth internalizing: grain matters more than dimension count. A materialization at daily grain serves weekly, monthly, and quarterly queries. One at monthly grain serves nothing below it. When the cost of the finer grain is tolerable, finer wins.

**Measure additivity.** Sums and counts roll up cleanly. Averages do not, unless the materialization stores the sum and the count separately rather than the average. Distinct counts do not roll up at all without sketches. A materialization storing an average by day cannot produce a correct monthly average, and a system that gets this wrong returns wrong answers rather than slow ones.

**Join structure.** A materialization defined over a join serves queries with the same join, and reasoning about whether a different join produces the same rows is harder. Systems are conservative here for good reason, which means materializations over complex joins tend to serve a narrower set of queries than their authors expect.

Why this matters for automation: the scoring model has to reason about all of these to estimate how many queries a candidate accelerates. A candidate that looks valuable on a naive count of similar queries turns out to serve a fraction of them once substitution rules apply. A cost-based analyzer that models substitution correctly produces recommendations that hold up. One that pattern-matches on query text produces recommendations that disappoint.

When you evaluate a recommendation manually, this is the reasoning to spot-check. Take the recommendation, look at the queries it claims to accelerate, and confirm the column coverage and grain actually work for all of them.

## Scoring: how the system decides what is worth keeping

Automation needs a number. The number here is a Reflection score, produced by a cost-based analyzer.

The inputs are the ones you expect a planner to have. How many prior jobs the materialization accelerates or has accelerated. The expected improvement per query. The cost of building and refreshing it. In the recommendation output, the improvement estimate surfaces as an average improvement factor, where a value of 2.34 means the recommended Reflection is likely to speed up each matching query by roughly 2.34 times on average.

Two capabilities had to exist before autonomy made sense, and they arrived separately.

Scoring recommendations came first. The system analyzes job history, identifies patterns that a materialization accelerates, and ranks candidates by expected impact. Dremio's recommendation engine looks at all jobs within a rolling 7-day window and surfaces the 10 Reflections with the most impact, updated daily, ranked by the number of prior jobs a recommendation accelerates and the expected average improvement.

Scoring existing materializations came second, in version 25.2, when the cost-based analyzer was extended to evaluate Reflections already in place. This is the harder half and the more valuable one. A score on an existing materialization answers "is this still earning its keep," which is the question nobody asks manually.

With both halves, the autonomous decision becomes a comparison. Take the highest-scoring recommendations. Take the lowest-scoring existing materializations. Decide whether swapping is worth it. Dremio shipped that logic in version 26.0, giving the system the ability to create and drop Reflections without user approval.

Notice the structure of the decision. It is not "build everything above a threshold." It is a cost-benefit comparison against a bounded budget, which is the correct framing for view selection and the reason the system does not spiral into building thousands of materializations.

The budget is explicit. Dremio creates up to 100 Reflections, with a maximum of 10 per day. The actual number depends on query patterns and on the configuration and utilization of the engine assigned to refresh jobs. Bounds like these are what make autonomous behavior safe to run. A system with an unbounded action space and an imperfect scoring function finds the flaw in the scoring function and exploits it.

## The drop decision, and why it has a grace period

Creating a materialization is low risk. If the score was wrong, you wasted some storage and refresh compute.

Dropping one is different. A materialization that scored low because the workload was quiet for a week gets removed, and then the workload returns and every query it served is slow again. Rebuilding takes time. The user experience is a performance regression with no obvious cause.

The handling here is worth studying as a general pattern. When Dremio determines a Reflection has a low score, it is not immediately dropped. The Reflection is disabled for 7 days before removal, and administrators view disabled Reflections through an Autonomous Reflection History Log.

Three things fall out of that design.

**Disabling is reversible and cheap.** The materialization still exists on storage. If the workload returns during the window, restoring it costs nothing.

**The window matches the analysis window.** Scores come from a 7-day rolling view, so a 7-day disable period gives a full analysis cycle to observe the consequence of the decision before it becomes permanent.

**The log makes the automation auditable.** An administrator seeing a performance regression checks what was recently disabled. Without that log, autonomous behavior is a black box and the first unexplained regression destroys trust in it permanently.

That last point generalizes past this feature. Any system acting autonomously against production needs a record of what it decided and why, readable by the person who gets paged. Automation without an audit trail gets turned off after the first incident, regardless of whether it was at fault.

## Freshness against changing tables

A materialization is a cache, and a cache serving stale data is worse than no cache.

The freshness problem on a lakehouse has a particular shape. Source tables change through many engines, not just the one maintaining the materialization. A Spark job, a Flink stream, or an agent writing through a different path all modify an Iceberg table, and the materialization has to notice.

Iceberg makes noticing cheap. Every change produces a new snapshot, and the current snapshot ID is a single value in catalog metadata. Detecting change is comparing one identifier, not scanning data.

Dremio polls Iceberg tables every 10 seconds and refreshes Autonomous Reflections when the table is modified, whether the modification came through Dremio or another engine. Parquet datasets refresh when their metadata is updated in Dremio, which is a weaker guarantee, because plain Parquet has no snapshot mechanism to poll.

That difference is a real argument for Iceberg over bare Parquet in a lakehouse where materializations matter. Snapshot-based change detection is the property that makes freshness tractable. Without it, you are either rescanning on a schedule or trusting a pipeline to signal.

Refresh compute has to go somewhere, and this is where deployments go wrong. Refresh jobs competing with interactive queries produce the outcome where turning on acceleration makes the system slower during the build window. Dremio recommends configuring a dedicated refresh engine with at least two nodes to isolate refresh jobs. If the assigned refresh engine reaches capacity, Autonomous Reflections pause, and users get notified through the console prompting them to scale up.

Pausing rather than degrading is the right failure behavior. A system that keeps accepting refresh work past its capacity produces a queue that never drains and materializations that are perpetually stale, which is the worst of both worlds. Stopping and asking for more capacity is honest.

## Why automated query workloads break the manual model

Everything above holds for human analysts. Agent workloads change three things, and each one pushes harder in the same direction.

**Query patterns are generated, not designed.** A person building a dashboard produces a small set of query shapes and reuses them for months. An agent answering a question composes SQL for that question. Across a thousand agent sessions you get a distribution of query shapes rather than a handful, and the manual process of eyeballing the top queries stops producing a useful answer.

**Volume arrives without warning.** A new agent integration goes live and query volume against a subject area triples in a day. The manual process discovers this at the next review. A workload-driven system discovers it inside its analysis window.

**Patterns churn.** Agents get their prompts updated, their tools changed, their models swapped. Each change alters the query distribution. Materializations tuned to last month's agent behavior accelerate queries the agent no longer writes.

That third property is the one that makes automatic dropping matter more than automatic creating. A human workload accumulates dead materializations slowly. An automated workload does it fast, and the storage plus refresh cost of materializing patterns nobody generates anymore compounds.

I want to keep this claim honest, because the surrounding marketing tends to overstate it. Agent queries are not magic and they do not require a different kind of acceleration. They are queries. What changes is the rate at which the query distribution moves, and the rate at which it moves is what determines whether a human-cadence process can keep up. Weekly review handles a distribution that shifts quarterly. It does not handle one that shifts weekly.

A workload analyzer does not care who issued the query. It reads job history and finds patterns. That indifference is the feature. A system driven by the actual workload adapts to agent traffic without anybody deciding to treat agent traffic specially.

## Doing it manually when you need to

Autonomous management is the default answer, and there are cases where you want direct control. A regulated workload where every materialization needs sign-off. A specific slow query somebody needs fixed today. A capacity-constrained environment where you are choosing carefully.

The recommendation machinery is available directly. Dremio exposes a table function that takes job IDs and returns recommended Reflections:

```sql
SELECT *
FROM TABLE(SYS.RECOMMEND_REFLECTIONS(
  ARRAY['844c0023-6272-8b16-aef3-aea289acadb1']
));
```

The argument must be an array literal, and you list up to 100 job IDs per query. You need permission to view every job you list.

The workflow is: find the slow query on the Jobs page, take its job ID, run the function, and read the recommendation. For a raw Reflection recommendation, the output gives you the path to the view to define the Reflection on plus the parameters to use. For an aggregation Reflection, the output includes parameters for a view to create first and then the Reflection parameters on top of it. The improvement estimate comes back as an average improvement factor, so a value of 3.1 means matching queries speed up around 3.1 times on average.

Feeding it a batch of related jobs works better than one at a time:

```sql
SELECT *
FROM TABLE(SYS.RECOMMEND_REFLECTIONS(
  ARRAY[
    '844c0023-6272-8b16-aef3-aea289acadb1',
    '9b1f7c44-0e2a-4f39-b8c1-2d5e7a9c3b10',
    'c72e15aa-83d4-4bb7-9e6f-1a0c4d8e2f77'
  ]
));
```

Ten job IDs representing the same underlying pattern produce a recommendation tuned to the pattern rather than to one query's specifics. That is the same logic the automatic path uses, just with you choosing the sample instead of the last 7 days of history choosing it.

Use the manual path to build confidence before enabling the automatic one. Run recommendations against your known-slow queries, create a few by hand, measure the improvement, and compare it against the predicted factor. When the predictions match reality on your workload, the scoring is trustworthy enough to act on its own.

Enabling the automatic path is a toggle. Navigate to Settings, go to the Preferences tab, and turn on Autonomous Reflections. Once enabled, the system creates and manages Reflections from workload analysis over the last seven days.

## The cost model and its blind spots

A scoring model is a model. Knowing where it is weakest tells you where to keep a human in the loop.

**What it sees well.** Query frequency over the analysis window. Plan cost from the optimizer, which is the same estimate driving every other planning decision and stays consistent with how the engine actually behaves. Data volume scanned. Which candidates substitute into which plans. Refresh cost, since building a materialization is itself a query the planner estimates.

**What it sees poorly.**

*Business criticality.* A query run four times a day by the CFO scores lower than one run four hundred times a day by a monitoring job. Frequency is the wrong proxy for importance, and no workload analysis fixes it because the information is not in the query log. This is the single best argument for keeping critical assets under manual management.

*Latency sensitivity.* A batch query taking 40 seconds instead of 8 costs nobody anything. An interactive query doing the same drives a user to a different tool. The cost model sees the same seconds saved in both cases.

*Seasonality longer than the window.* A 7-day analysis window has no view of a quarterly close pattern. Materializations serving quarter-end reporting score low for eleven weeks and get dropped, then quarter-end arrives and everything is slow. If you have strongly seasonal workloads, this is the case where a manually managed materialization is correct.

*Cold-start value.* A new dataset nobody queries yet scores zero. The scoring is workload-driven, so it cannot anticipate. This is fine and worth stating plainly, because people expect prediction and get reaction.

*Cross-engine workload.* Materialization decisions come from jobs the engine ran. Queries against the same Iceberg tables from Spark or Trino do not appear in that history. In a multi-engine shop, the analysis sees a slice.

The pattern across these blind spots is consistent: the model reasons well about cost and badly about value. Cost is measurable from the system. Value lives outside it.

The practical response is not to distrust the scoring. It is to keep the small number of assets whose value the model cannot see under explicit management, and let it handle everything else. In most estates that split is a handful of materializations manual and the rest autonomous, which is a much better use of engineering attention than managing all of them by hand.

## Failure modes

**Refresh engine undersized at enable time.** The most common bad first day. Autonomous Reflections start creating materializations, refresh jobs pile up on an engine sized for interactive work, and everything slows. Warning sign: the pause notification, or refresh queue depth climbing steadily after enabling. Fix: configure a dedicated refresh engine with at least two nodes before turning the feature on, not after.

**Aggregation Reflections on high-cardinality dimensions.** A materialization grouped on a dimension with millions of distinct values is nearly the size of the source and accelerates almost nothing. Warning sign: a materialization whose storage footprint approaches its anchor's. Fix: the scoring generally avoids this, and when you are creating manually, check cardinality before choosing dimensions.

**Chasing a workload that has not stabilized.** A newly launched agent integration produces a week of exploratory query patterns that never repeat. The system materializes for them. The patterns vanish. Warning sign: materializations created and disabled within consecutive analysis cycles. Fix: this is self-correcting through the drop logic, and it costs storage and refresh compute in the meantime. Introduce new automated workloads against a subset of tables first.

**Storage growth nobody budgeted.** Up to 100 materializations, each carrying its own copy of data, adds up. Warning sign: storage cost rising with no growth in source data. Fix: budget for it explicitly. Materialization is a compute-for-storage trade and the storage side is real.

**Stale materializations on non-Iceberg sources.** Parquet datasets refresh on metadata update rather than on snapshot change. A pipeline writing Parquet files without updating metadata in the engine produces a materialization serving old data. Warning sign: query results that disagree with the underlying files. Fix: move those datasets to Iceberg, which gives snapshot-based change detection.

**Trust collapse after one unexplained regression.** An engineer sees a query get slow, does not know why, and the team turns off autonomy. Warning sign: this is a social failure, not a technical one, and the sign is somebody asking whether the feature can be disabled. Fix: introduce the history log to the on-call team before the first incident, not during it. The information exists. People need to know where to look.

**Treating the improvement factor as a guarantee.** An average improvement factor is an estimate from a cost model. Real improvement varies with data distribution, cache state, and concurrency. Warning sign: capacity planning built on predicted factors. Fix: measure actual latency before and after on your own workload and plan from measurements.

**Interactive workload starved by refresh during a backfill.** A large source table gets rewritten, every dependent materialization needs a full refresh, and the refresh engine saturates. Warning sign: refresh volume spiking after a bulk load. Fix: schedule bulk source changes deliberately and expect a refresh wave behind them.

## Operational guidance

**Size the refresh engine from your change rate, not your query rate.** Refresh work scales with how often source tables change and how many materializations depend on them. A table modified every few minutes with eight dependent materializations generates far more refresh work than a table modified daily with thirty. Two nodes is the documented starting point. Measure and grow from there.

**Establish a latency baseline before enabling.** Pick fifteen representative queries, record median and p95 latency, and keep the numbers. Without a baseline you have no way to evaluate whether autonomy helped, and "it feels faster" does not survive a budget conversation.

**Review the history log weekly for the first month.** Read what was created and what was disabled. The goal is calibration, meaning you want to reach the point where the decisions match what you expect. If they consistently surprise you, the workload analysis is seeing something you are not, and finding out what is valuable information about your own system.

**Keep manual materializations for the queries that must never regress.** Autonomy manages the general case well. A latency-critical query backing a customer-facing feature deserves an explicit materialization you control, so no scoring decision touches it. Mixed management is a legitimate configuration, not a compromise.

**Watch storage as a first-class metric.** Track the total footprint of materializations alongside source data growth. A healthy ratio depends on your workload, and what matters is that you know the number and see it move.

**Materializations are not a substitute for table layout.** A source table with no sort order relevant to its filters makes every materialization refresh expensive, because each refresh scans more than it needs. Fixing sort order on the anchor table lowers refresh cost across every materialization built on it. Do the layout work first and the acceleration work second.

**Name your engines clearly.** When refresh runs on a dedicated engine, jobs on that engine are refresh jobs and nothing else. Mixing one interactive workload onto it "just for now" is how the isolation guarantee quietly stops holding, and the symptom is interactive latency that varies with refresh activity rather than with query complexity.

**Check permission scope on the recommendation path.** The recommendation function requires permission to view every job listed. An engineer running it against jobs they cannot see gets an error rather than a partial result, which is correct and occasionally confusing. Give the people doing performance work the job visibility their role needs.

**Treat the ceiling as a signal, not a limit.** If the system sits at or near 100 materializations continuously, your workload is more fragmented than the acceleration budget accommodates. The productive response is not to ask for a higher ceiling. It is to look at why so many distinct patterns exist, which usually points at a view layer where similar questions get asked five slightly different ways. Consolidating those views reduces the candidate count and improves acceleration for all of them at once.

**Do not enable it in the same change window as anything else.** If you turn on autonomous materialization management the same week you upgrade the engine and add three pipelines, you cannot attribute any performance change to anything. Isolate the change.

**Reconsider your view layer.** Materializations get defined on views, and their quality depends on the views being sensible. A semantic layer with well-defined views produces better acceleration than a flat pile of tables, because the recommendation engine has meaningful units to work with. Time spent on view design pays into this.

## A staged rollout

Enabling this well takes about a month of low-effort attention. Here is the sequence I recommend.

**Week zero: baseline and capacity.** Record median and p95 latency for fifteen representative queries. Record total storage. Provision the dedicated refresh engine with at least two nodes. Do nothing else. The baseline is the thing you regret not having.

**Week one: manual recommendations only.** Pull job IDs for your ten slowest frequent queries and run them through the recommendation function. Create two or three by hand. Measure actual improvement against the predicted improvement factor. You are calibrating trust in the cost model against your data, and the answer is specific to your workload rather than general.

**Week two: enable autonomy on a bounded scope.** Turn the feature on. Watch the refresh engine queue depth daily. Read the history log at the end of the week and check that what got created matches where you know the slow queries are.

**Week three: observe a drop cycle.** By now some materializations will have been disabled. Read why. Confirm that the disabled ones correspond to workloads that genuinely quieted down. This is the week where trust is either established or not, and it is worth the attention.

**Week four: compare against baseline.** Rerun the fifteen queries and compare. Check storage growth. Check refresh engine utilization. You now have the numbers for a real conversation about whether the trade is good on your workload.

**After that: weekly log review, monthly baseline.** The steady state is light. Read the history log weekly for a few minutes. Rerun the baseline queries monthly. Escalate only when something surprises you.

Two things to avoid during rollout.

Do not change anything else. Engine upgrades, new pipelines, source table restructuring, all of it waits. Attribution is the entire value of a staged rollout and concurrent changes destroy it.

Do not judge in the first three days. Materializations take time to build, the analysis window is 7 days, and the first drop decisions have not happened yet. A verdict on day two is a verdict on the build phase, which is the least representative period there is.

## The storage side of the trade

Materialization converts compute cost into storage cost plus refresh compute. Teams evaluate the compute savings carefully and the storage side barely at all, which is how the surprise arrives on a cloud bill three months later.

The arithmetic is worth doing before you enable anything.

**Raw materializations** carry a subset of columns for the full row count. A table with 200 columns where the materialization carries 8 costs roughly the fraction of total bytes those 8 columns represent, which is not 4 percent, because column widths vary enormously. A single wide string column often outweighs fifty integers. Check actual column sizes rather than counting columns.

**Aggregation materializations** carry a row per distinct combination of the grouping dimensions. Three dimensions with 400, 12, and 30 distinct values gives at most 144,000 rows regardless of whether the source has a billion. That is the case where aggregation is enormously cheaper than the source. Add a fourth dimension with 2 million distinct values and the arithmetic inverts.

**Refresh writes new data.** Each refresh produces new files, and old snapshots persist until expiration. A materialization refreshed frequently against a changing source accumulates snapshot history like any other Iceberg table, and it needs the same expiration discipline. This is the quiet cost that grows without anyone deciding to grow it.

With a ceiling of 100 materializations, worst-case storage is bounded but not small. The realistic planning approach is to enable, watch actual growth for a month, and extrapolate from measurement. Predicting it from first principles takes longer than measuring it and produces a worse number.

There is a second-order effect worth naming. Materializations reduce compute cost, which reduces the pressure that made someone look at query performance in the first place. A team that materializes aggressively often stops fixing the underlying problems: the view with the accidental cross join, the table with no useful sort order, the dashboard querying raw rows to compute a number it needs once. Acceleration hides those. They stay in the system, and they get more expensive as data grows.

The habit that guards against it is checking what the system chose to accelerate and asking whether the query deserved to be slow. A materialization built to rescue a badly written view is a signal to fix the view. The autonomous system will not tell you that, because it optimizes what it is given rather than questioning it. That judgment stays human, and it is the more valuable half of the work.

## Where this is heading

The interesting direction is not better scoring. It is wider scope.

Right now the autonomous loop covers one decision: which materializations to keep. The same workload analysis informs several adjacent decisions that are still manual almost everywhere. What sort order a table should carry. Which partition layout matches actual filter predicates. When compaction should run and on which partitions. Which columns deserve richer statistics. All of these are workload-driven optimization problems with the same shape, and all of them are handled today by an engineer reading a dashboard once a quarter.

Iceberg makes several of them accessible in a way they were not before, since sort order and partition spec live in table metadata and evolve without rewriting data. A system that reads the workload and adjusts table layout is a smaller step from here than it looks.

The second direction is cross-engine. Materialization decisions today are made by one engine from the jobs that engine ran. In a lakehouse where Spark, Flink, Trino, and several agents all read the same Iceberg tables, no single engine sees the full workload. The catalog does see every table access, which makes catalog-level workload analysis the obvious architecture and an unsolved problem in practice.

The third is explanation. An autonomous system that reports what it did is auditable. One that reports why it did it is teachable. An engineer who reads "this materialization was disabled because the four query patterns it served dropped from 900 executions a week to 3" learns something about their own system. That is a better outcome than the acceleration itself.

## Conclusion

Materialized view selection is a hard optimization problem that organizations have been solving with quarterly meetings and intuition. It works badly for human workloads and it does not work at all for automated ones, because the query distribution moves faster than the review cycle.

The pieces required to automate it are specific. Transparent substitution in the planner, so materializations appear and disappear without breaking queries. A cost model that scores both candidates and existing materializations, so the decision is a comparison rather than a threshold. Bounded action, so an imperfect score cannot cause unbounded damage. A grace period on removal, so a wrong drop is recoverable. An audit log, so the automation survives its first surprise.

Dremio's implementation gives you concrete values for each: up to 100 Reflections with a maximum of 10 per day, a rolling 7-day analysis window, a 7-day disable period before removal, 10-second polling on Iceberg tables, and a history log for review.

The lesson generalizes past any product. If you are building or evaluating a system that manages its own optimizations, those five properties are the checklist. A system missing the grace period or the audit log gets disabled after its first bad decision, no matter how good its scoring is the rest of the time.

If you run a lakehouse where automated query traffic is growing, this is the part of the stack to look at first. Not because agents need special acceleration, but because they move the query distribution faster than any human process tracks.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and query acceleration. *Architecting an Apache Iceberg Lakehouse* from Manning covers the semantic layer and materialization design decisions this article depends on, including how view structure affects what a system can accelerate. *Apache Iceberg: The Definitive Guide*, which I co-authored for O'Reilly, goes deeper on the snapshot and metadata mechanics that make change detection cheap. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
