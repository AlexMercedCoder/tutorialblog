---
title: "What a Query Costs"
date: "2026-09-10"
description: "Four meters, their real proportions, and how to attribute compute to a query, a table, and a team so a platform can answer what a dashboard costs to run."
author: "Alex Merced"
category: "Cost Optimization"
tags:
  - lakehouse
  - cost optimization
  - unit economics
  - FinOps
  - data platform
canonical: https://iceberglakehouse.com/posts/lakehouse-unit-economics/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/lakehouse-unit-economics/).

Finance asks the data platform team what a dashboard costs to run. The honest answer is that nobody knows. The cloud bill arrives as a handful of large numbers: compute for a cluster several teams share, storage for a bucket holding everything, a transfer line nobody has looked at closely. Mapping those numbers onto the dashboard, the team that owns it, or the decision it supports is not a report anyone has built.

That gap is a strategy problem rather than an accounting one. A platform that cannot attribute spend cannot answer whether a workload is worth its cost, cannot tell a team what its choices cost, and cannot tell whether last quarter's optimization worked. It optimizes by anecdote, usually in response to a bill that surprised somebody.

This piece is about unit economics inside a lakehouse you already run. Not whether a lakehouse costs less than a warehouse, which is a procurement question with its own literature, but how to model, attribute, and forecast the cost of the platform you have. What a query costs, what a table costs, what a team costs, and which of those numbers are worth chasing. I work at Dremio, so I sell into this space. The arithmetic below uses public list prices you can check.

## Four meters and their real proportions

Every dollar a lakehouse spends lands on one of four meters, and the proportions are consistently different from where attention goes.

**Storage.** Object storage at published list pricing runs about $0.023 per GB-month in S3 Standard in us-east-1, roughly $23.55 per terabyte per month. Predictable, linear, and small. Storage is the meter everyone can see and the one that least often matters.

**Requests.** PUT, COPY, POST and LIST at $0.005 per 1,000, GET at $0.0004 per 1,000. The asymmetry matters: writes and listings cost more than twelve times what reads cost per request. Usually negligible, occasionally significant on operations that list large prefixes or write many small objects.

**Compute.** Query execution, ingestion, transformation, and maintenance. Industry analysis of cloud data platform spend has put compute at 60 to 80 percent of total expenditure, and the lakehouse case is no different in shape. This is the meter that matters and it is the hardest to attribute.

**Transfer.** Cross-region and cross-cloud movement, plus egress to tools and consumers outside the platform. Research on distributed enterprises has put data transfer as high as 30 percent of total cloud data platform expense, and it is the line most often discovered rather than planned.

The pattern worth internalizing: **storage is visible and small, compute is large and opaque, transfer is invisible until it is large.** Most optimization effort goes to storage because it is the number people can see, which is why so much of it produces nothing.

A quick sanity check for your own platform: take last month's bill, split it into those four, and compute the percentages. If storage is more than a quarter of the total, you have an unusual platform, probably one holding a lot of cold data with very little query traffic. If transfer is more than ten percent, something is reading across a boundary that it should not be.

## What a query actually costs

The unit that makes everything else computable. A query's cost has three components and one of them dominates.

**Compute time.** The cluster resources consumed while the query runs, times their rate. On a self-managed engine this is instance cost times duration times the share of the cluster the query held. On a managed engine it comes back as a vendor unit that needs converting.

**Bytes scanned, on scan-priced engines.** Some engines price directly on bytes read, which makes attribution trivial and makes the cost driver obvious.

**Request cost.** One GET per file opened, plus metadata reads. At $0.0004 per 1,000, a query opening 3,000 files pays about a tenth of a cent. Real and rarely material.

The worked version, for a query scanning 200 GB on a self-managed engine:

- Compute: 16 cores for 90 seconds at $0.05 per core-hour is 0.4 core-hours, about $0.02.
- Requests: 400 files at 512 MB each is 400 GETs, plus metadata, so a fraction of a cent.
- Total: roughly two cents.

Now the same 200 GB spread across 6,400 files at 32 MB each. Bytes scanned are identical. File opens go from 400 to 6,400, adding round trips that the engine cannot parallelize away entirely, and planning has sixteen times the manifest entries to evaluate. The query takes three times as long, so compute is about $0.06, and the request cost is still trivial.

**Three cents of difference on one query, and that is the entire small-file argument expressed in money.** Multiply by a query run 200 times a day and it is $6 a day, $180 a month, on one query pattern against one table. That is the number to bring to a conversation about whether compaction is worth scheduling.

Two structural points fall out of the arithmetic.

**File layout is a cost variable, not a performance variable.** The same bytes cost different amounts depending on how they are arranged. Anyone treating layout as a tuning nicety is leaving a recurring cost in place.

**Query cost is dominated by wall-clock compute, which is dominated by how much the engine has to open and evaluate.** Pruning, layout, and partitioning are cost levers before they are latency levers.

## Attribution: making cost land on the thing that caused it

Unattributed compute is the reason nobody can answer the dashboard question. Four mechanisms, in increasing order of effort and usefulness.

**Query tagging.** Every query carries labels: team, workload, environment, and the asset it serves. Enforce it at the connection level rather than trusting each pipeline author, since untagged traffic is exactly the traffic that turns out to be expensive. Most engines support session properties or comments that propagate into query history. This is the foundation, it costs an afternoon of pipeline changes, and without it everything downstream is estimation.

```sql
-- Tags travel into query history and become the join key for attribution
SET SESSION query_label = 'team=growth,workload=daily_dashboard,asset=exec_summary';

SELECT region, sum(revenue)
FROM sales.orders_daily
WHERE order_date >= current_date - INTERVAL 90 DAYS
GROUP BY region;
```

**Warehouse or cluster separation.** Separate compute per team or per workload class makes attribution a billing question rather than an analysis question. Cleaner and less efficient, since separated clusters have lower utilization, and the tradeoff is worth taking when teams need hard cost boundaries more than they need efficiency.

**Query history joined to a cost model.** The engine records duration, resources, and bytes for each query. Joining that to a rate produces cost per query, which aggregates to any dimension your tags support:

```sql
WITH costed AS (
  SELECT
    q.query_id,
    q.started_at,
    element_at(q.labels, 'team')     AS team,
    element_at(q.labels, 'asset')    AS asset,
    q.bytes_scanned,
    q.execution_time_ms,
    -- convert engine units to dollars with your own rate
    (q.cpu_time_ms / 3600000.0) * 0.05        AS compute_usd,
    (q.files_opened / 1000.0) * 0.0004        AS request_usd
  FROM system.query_history q
  WHERE q.started_at >= current_date - INTERVAL 30 DAYS
)
SELECT
  team,
  asset,
  count(*)                                   AS query_count,
  round(sum(compute_usd + request_usd), 2)   AS total_usd,
  round(avg(compute_usd + request_usd), 4)   AS avg_usd_per_query,
  round(sum(bytes_scanned) / 1e12, 2)        AS tb_scanned
FROM costed
GROUP BY team, asset
ORDER BY total_usd DESC
LIMIT 25;
```

That query is the artifact this whole article exists to produce. Run it, and the top twenty rows are your cost structure. In my experience of how these distributions look, the top few rows are usually a much larger share of the total than anyone expects, which is the good news: the work is concentrated.

**Storage attribution per table.** Table size from Iceberg metadata, times the storage rate, gives cost per table. This one is exact rather than modeled, which makes it a useful anchor when the compute attribution is disputed: at least one number in the report is not an estimate. Add snapshot retention overhead and you have the real number rather than the current-state number:

```sql
SELECT
  'sales.orders' AS table_name,
  round(sum(file_size_in_bytes) / 1e9, 2)          AS current_gb,
  round(sum(file_size_in_bytes) / 1e9 * 0.023, 2)  AS current_usd_month
FROM catalog.sales.orders.files;
```

The gap between that number and what the bucket prefix actually holds is your retention and orphan overhead, and it is worth computing once per table because it is occasionally startling.

## The cost drivers that actually move the number

With attribution in place, the levers sort themselves by size. Here they are, roughly in order of return.

**File layout.** Covered above. The same query against the same bytes costs several times more against fragmented files. This is the highest-return lever on most platforms and it is addressed by maintenance you probably already run, scoped correctly.

**Partitioning and pruning.** A query that reads 200 GB when it needed 5 GB costs forty times what it should. Partition design, sort order, and predicate pushdown are the mechanisms, and the diagnostic is the ratio of bytes scanned to bytes returned. Ratios in the thousands mean the layout does not match the access pattern.

**Query patterns.** `SELECT *` on a wide table, dashboards refreshing every five minutes against data that lands hourly, notebooks scanning full tables to compute a count. Individually small, collectively large, and mostly fixed by showing people what their queries cost rather than by policy.

**Cluster sizing and idle time.** A cluster provisioned for peak and running at 15% average utilization is paying for capacity nobody uses. Autoscaling, aggressive idle timeouts, and separating interactive from batch capacity address it. This is where managed platforms with per-second billing and fast suspension genuinely earn their premium.

**Maintenance scope.** Compaction that rewrites the whole table nightly instead of what changed. Real money, and the fix is a filter.

**Retention.** Snapshot retention multiplies storage on update-heavy tables. On append-only tables the effect is modest, since old snapshots reference files the current one also references.

**Transfer.** Cross-region reads that should be local, egress to BI tools pulling extracts, cross-cloud movement. Invisible on a dashboard organized by service and obvious on one organized by data flow.

Notice what is not on the list: storage tiering, compression codec choices, and file format micro-optimizations. All real, all worth doing eventually, and all small compared to the six above.

## Three workload shapes, priced

Aggregate cost hides structure, and the structure is what tells you where to work. Three shapes that show up on every platform, priced on the same one-terabyte table so the comparison is clean.

**The interactive dashboard.** A BI tool refreshing an executive summary. Selective queries against recent partitions, run frequently, latency-sensitive. Say 40 queries per refresh, refreshing every fifteen minutes during business hours: about 12,800 queries a month. At two cents each that is $256 a month, and at six cents each, which is what fragmented files produce, it is $768.

The lever here is layout and caching, not compute pricing. A refresh interval matched to the data's actual arrival rate is the second lever, and it is free: a dashboard refreshing every fifteen minutes against a table that loads hourly is doing four times the necessary work.

**The scheduled transformation.** A nightly job reading a large slice and writing a derived table. Runs 30 times a month, reads 300 GB, writes 40 GB. Compute dominates: roughly 9 core-hours per run at $0.05 is about $0.45 a run, $13.50 a month, plus the write requests and the storage for the output.

The lever is incremental processing. A job reading the full table nightly when it needs the last two days is paying fifteen times what it should, and this is the single most common expensive pattern in scheduled work.

**The exploratory notebook.** An analyst working interactively. Unpredictable, often unfiltered, and occasionally enormous when someone runs a full scan by accident. Volume is low and variance is high.

The lever is guardrails rather than optimization: a scan limit that refuses queries above a threshold, with an override, converts the expensive accident into a conversation. This is also the workload where showback works best, since the expensive queries are unintentional and the person who wrote them wants to know.

| | Dashboard | Scheduled job | Notebook |
|---|---|---|---|
| Volume | High | Low | Low |
| Cost per query | Low | High | Highly variable |
| Dominant driver | File layout, refresh rate | Bytes reprocessed | Accidental full scans |
| Best lever | Compaction, refresh interval | Incremental logic | Scan limits, showback |
| Forecast growth | With users and dashboards | With sources | Flat |

Pricing your own three shapes takes an afternoon with the attribution query and it usually reveals that one of the three is a much larger share than anyone assumed.

## The cost of correctness

One category deserves separating out, because teams cut it first and it is the one that returns least well.

Compaction, statistics computation, quality checks, and retention all cost money and none of them answers a user question. They are the maintenance overhead that makes the rest of the platform work, and on a well-run platform they land at a modest fraction of the storage cost for the tables they protect.

The temptation during a cost review is to cut them, because they show up as compute with no visible consumer. Three reasons that trade goes badly.

**Cutting compaction moves cost to the query line.** The maintenance spend disappears and query compute rises, usually by more, and it rises on a meter watched by different people. The platform team looks efficient and the analytics bill grows.

**Cutting quality checks moves cost to the trust line.** Which never appears anywhere, and manifests as reconciliation work spread across everyone who consumes the data.

**Cutting retention moves cost to the recovery line.** Which appears once, during an incident, at the worst possible time.

The defensible version of this conversation is to scope maintenance correctly rather than to reduce it: filtered compaction rather than full-table, cadence matched to change rate, per-table policies rather than uniform ones, and statistics only where they earn it. That produces most of the savings of cutting without the consequences.

## Normalizing vendor units

Comparing anything across engines requires converting proprietary units into a common one, and vendors do not make this convenient. Credits, DBUs, RPU-hours, slots, and bytes scanned all describe the same underlying resource consumption in incompatible currencies.

The normalization that works: convert everything to **dollars per terabyte scanned** and **dollars per hour of effective compute**, then compare.

Worked examples using publicly cited 2026 list pricing, with the caveat that real prices depend on contracts, region, and tier.

A credit-based warehouse at around $2 to $3 per credit, with a medium warehouse consuming roughly 4 credits per hour, running ten hours a day for twenty-two days, lands near $2,640 per month for that warehouse alone. Its storage is roughly comparable to object storage at about $23 per terabyte per month.

A scan-priced engine at $5 per terabyte scanned, against 5 terabytes of monthly scanning, costs about $25 for the same query volume before governance tooling.

Those two numbers describe genuinely different workloads, and the comparison is still instructive: **time-based pricing charges for capacity, scan-based pricing charges for work.** A workload with steady heavy usage suits capacity pricing. A workload with bursty, selective queries suits work pricing, and moving a bursty workload onto capacity pricing is how platform bills get large quietly.

Three normalization traps.

**Compressed versus uncompressed.** Some vendors bill storage on compressed size, some on logical size. A three-times compression ratio makes a three-times difference in the comparison, which is larger than most of the differences people argue about.

**Concurrency multipliers.** A warehouse running one query per hour and one running twenty do not cost the same, and simple credit-per-hour math misses it. Estimate a concurrency factor from actual usage or the number is fiction.

**Bundled versus unbundled.** A platform rate covering compute, governance, and support compares badly against a compute rate that excludes the engineering time to run the equivalent. Price the whole envelope on both sides or neither.

## Building the rate model

Every dollar figure in this article depends on a rate model converting engine units into money, and a wrong rate model produces confident nonsense. Building one takes a day and it is the step teams skip.

**Measure cost per core-hour on your own infrastructure.** Instance price plus the overhead you actually pay: orchestration, storage attached to compute, network, and the utilization factor, since a cluster at 60% utilization costs more per useful core-hour than its sticker price. The number that goes into the model is the effective rate, not the list rate.

**Measure effective throughput on your own data.** Gigabytes per core-hour for a representative scan, with your compression codec, your file sizes, and your typical query shape. This varies by more than people expect between platforms and workloads, and a borrowed number distorts every downstream estimate.

**Convert vendor units with a measured factor, not a documented one.** Where an engine bills in credits or similar, run a known workload, record the units consumed and the wall-clock resources, and derive the conversion yourself. Documented conversions describe ideal conditions.

**Recompute quarterly, and after any infrastructure change.** Instance types change, pricing changes, and workload shape drifts. A rate model from a year ago is a source of arguments rather than answers.

**Publish the model, not just the numbers.** When a team disputes their attributed cost, the productive conversation is about the model's assumptions rather than about whether the number is fair. A published model with visible assumptions converts a political conversation into a technical one, which is the point of doing any of this.

One judgment call worth making explicitly: shared infrastructure allocation. Some compute genuinely serves everyone, and splitting it by usage share, by headcount, or leaving it unallocated as a platform overhead line are all defensible. Pick one, write down why, and stop relitigating it. Perfect allocation of shared costs is not achievable and the pursuit of it has killed more cost programs than inaccuracy ever did.

## Forecasting

Attribution tells you what happened. Forecasting is what turns it into a budget, and the model is simpler than most teams expect.

**Storage forecasting is close to arithmetic.** Current size, plus daily ingestion rate, times the retention multiplier for update-heavy tables. Growth is smooth and rarely surprises anyone. The only discontinuity comes from a new source landing, which is a known event.

**Compute forecasting has two drivers that move independently.** Query volume grows with users and with the number of scheduled jobs. Cost per query grows with data volume unless layout keeps pace, which is the part people miss: a table that doubles in size makes every unfiltered query against it twice as expensive, so compute grows super-linearly with data unless partitioning and compaction hold the per-query cost steady.

That gives a usable model:

```
monthly_compute ≈ (queries_per_month × avg_cost_per_query)
                + (scheduled_jobs_per_month × avg_job_cost)
                + maintenance_cost
```

Each term is measurable from query history once tagging is in place, and each has a different growth rate worth projecting separately.

**Agent traffic breaks the volume assumption.** This is the newest and largest forecasting risk. A human analyst asks a handful of questions an hour. An agent asks several per reasoning step and takes many steps, and it does not get tired at five o'clock. Platforms adding agent access see query volume patterns unlike anything in their history, and a forecast built on human usage growth underestimates badly. Budget agent traffic as its own line with its own growth assumption, and put hard per-identity limits on it from the start.

**Forecast the transfer line explicitly.** It grows with cross-region reads, with the number of BI extracts, and with every new consumer outside the platform. None of those correlate with data volume, so it needs its own driver.

## Finding the waste

With attribution in place, waste has recognizable signatures. Six patterns, each detectable with a query and each worth checking on a new platform.

**Scheduled jobs with no consumer.** A pipeline built for a dashboard that was retired eighteen months ago, still running nightly. Detect by joining scheduled job output tables against read activity: any table written regularly and never read is a candidate. This is the single largest one-time saving on most mature platforms and it is entirely free to take.

```sql
-- Tables written recently and never read: candidates for retirement
WITH writes AS (
  SELECT table_name, max(occurred_at) AS last_write
  FROM system.write_history
  WHERE occurred_at >= current_date - INTERVAL 90 DAYS
  GROUP BY table_name
),
reads AS (
  SELECT table_name, max(occurred_at) AS last_read, count(*) AS read_count
  FROM system.read_history
  WHERE occurred_at >= current_date - INTERVAL 90 DAYS
  GROUP BY table_name
)
SELECT w.table_name, w.last_write, r.read_count
FROM writes w
LEFT JOIN reads r ON r.table_name = w.table_name
WHERE r.read_count IS NULL OR r.read_count < 5
ORDER BY w.last_write DESC;
```

**Refresh rates exceeding data arrival rates.** A dashboard refreshing every five minutes against an hourly table does twelve times the necessary work. Compare refresh schedules against table commit frequency, which Iceberg snapshot history gives you directly.

**Duplicate transformations.** Two teams computing the same derived dataset because neither knew about the other. Detect by looking for jobs reading the same sources and producing similarly shaped outputs. Common in organizations that grew by acquisition or reorganization.

**Full scans that need a filter.** The bytes-scanned to bytes-returned ratio, per recurring query. Anything in the thousands is a query reading a table to return a handful of rows.

**Development workloads on production compute.** Notebooks, tests, and experiments running on the cluster sized and priced for production traffic. Separating them costs a little utilization and makes both lines legible.

**Idle capacity.** Clusters running outside the hours anyone uses them. Trivial to detect from utilization history and trivial to fix with schedules, and it persists on most platforms because nobody owns the question rather than because it is hard.

Running those six checks quarterly is maybe two hours of work. On a platform that has never done it, the first pass typically finds more than the next six months of optimization effort.

## Agent traffic as its own cost center

Agents change platform economics enough to deserve their own accounting from the first day one is deployed, rather than after the first surprising invoice.

**The volume profile is different in kind.** A human analyst issues a handful of queries an hour and stops in the evening. An agent issues several per reasoning step, takes many steps per question, and runs whenever it is asked. One user driving an agent generates query volume that in the old model represented a whole team.

**The cost per query is often worse.** Agents explore. They run a query, look at the result, and run a broader one. Without a semantic layer constraining what they ask for, they scan more than a knowledgeable analyst needs to answer the same question, and the retry path after a failed query costs again.

**The distribution is heavily skewed.** A small number of agent-heavy users typically account for most agent spend. That concentration is good news for control, because a per-identity budget applied to a handful of accounts does most of the work.

**Failed and abandoned work still costs.** A loop that runs eleven steps and produces nothing consumed eleven queries. Human abandonment costs one. Instrument cost per completed answer rather than cost per query, since the gap between them is the efficiency number that matters.

Four controls, all of which belong in place before the first agent reaches production rather than after: a per-request cost budget checked against an estimate before execution, a per-identity daily budget, a global circuit breaker on aggregate agent spend, and attribution that separates agent traffic from human traffic in every report.

The reporting view worth building: cost per agent identity, cost per human driving each agent, cost per completed answer, and the ratio of query cost to answered questions. Those four numbers tell you whether an agent deployment is economically sensible, and none of them is visible in a report organized by cluster.

## Showback, chargeback, and what each one does to behavior

Once cost lands on teams, the question is what to do with the information. Three postures, with different effects.

**Showback.** Teams see their costs, nobody gets billed. Cheap to implement, no procurement involvement, and it changes behavior more than people expect, because most expensive queries are accidental rather than intentional. An engineer who discovers their hourly refresh costs $400 a month fixes it that week.

**Chargeback.** Costs are billed to team budgets. Stronger behavior change and much more overhead: disputes about attribution accuracy, arguments about shared infrastructure allocation, and pressure to make the model perfect before anyone will accept it. Worth it in organizations that already run this way for other infrastructure, and a large project in organizations that do not.

**Budgets and limits.** Per-team quotas with enforcement. The strongest control and the most likely to produce workarounds. Reserve it for cases where cost genuinely has to be bounded, and prefer escalating friction over hard blocks.

The sequencing that works: showback first, universally, for a quarter. Most of the available savings arrive from visibility alone. Then decide whether the remaining gap justifies the overhead of chargeback, and in a lot of organizations it does not.

One implementation detail that determines whether showback works: **the report has to reach the person who can change the thing.** A monthly cost report to a director is information. A weekly note to the engineer who owns the pipeline, naming their most expensive query and what it costs, is action.

## The costs that never appear on the cloud bill

A cost model built only from infrastructure spend understates the platform by a wide margin, and the missing pieces are the ones that decide architecture.

**Engineering time.** The largest cost in most data platforms and the one no dashboard shows. A lakehouse shifts work rather than removing it: table formats, metadata, partitioning, access controls, quality checks, and lifecycle policies all need owners. A platform whose infrastructure spend looks excellent while analysts wait weeks on engineering is not cheap, it is expensive in a currency nobody is measuring.

**Migration and change cost.** Moving a large workload between platforms runs into serious engineering time once pipeline rework and BI reconfiguration are counted, and published estimates for a 50 TB migration run well into six figures on engineering alone. That number belongs in any architecture decision, and it is the practical content of the phrase "lock-in cost."

**Opportunity cost of slow queries.** An analyst waiting forty seconds instead of four does less analysis. Not measurable precisely, and real enough that it changes how a platform gets used, and eventually whether it gets used.

**The trust tax.** A platform where numbers are occasionally wrong generates reconciliation work, parallel spreadsheets, and shadow pipelines. This is expensive and it never appears as a line item, because it manifests as everyone's work taking slightly longer.

The framing for a budget conversation: infrastructure spend is the number you have, and it is usually a minority of true platform cost. Presenting it as the whole picture invites optimization that trades a small infrastructure saving for a large engineering cost, which is a bad trade made regularly because only one side is visible.

## A cost review that takes an hour a month

The operating rhythm that keeps this current without becoming a project.

**Top twenty queries by monthly cost.** From the attribution query above. Look at each and ask whether the cost matches the value. Most months a couple of them are obviously wrong: a scheduled job nobody uses, a dashboard refreshing far more often than its data changes.

**Bytes scanned to bytes returned ratio, per top query.** Ratios in the thousands are a pruning failure. This one number finds most layout problems.

**Top ten tables by storage, with retention overhead broken out.** Where the gap between current size and actual storage is large, retention is the cause and it is usually adjustable.

**Compute utilization.** Average against peak. Persistent low utilization means the cluster is sized for a peak that autoscaling handles on demand.

**Transfer, broken out by direction and region.** Any cross-region read that should have been local, and any egress line growing faster than usage.

**Cost per team, month over month.** The trend rather than the level. A team whose cost doubled while its usage did not is where the interesting question is.

**One agent-specific view, if you have agents.** Query volume and cost per agent identity, and per user driving that agent. This will look nothing like your human traffic and it needs its own eye.

Six queries and a look. The value is entirely in the regularity, because cost problems are cheap to fix when they are a week old and expensive when they are a year old and load-bearing.

## Presenting cost to people who do not run the platform

The last mile of this work is communication, and it is where good analysis most often fails to change anything.

**Lead with percentages, not dollars.** "Compute is 74% of platform spend and it grew 18% while data volume grew 40%" is a sentence a finance partner acts on. A table of dollar figures per team invites a debate about allocation instead.

**Express optimizations as a rate, not an event.** "This change saves $180 a month, recurring" travels further than "we saved $2,160," because the recurring frame makes the case for doing more of it.

**Give every number a driver.** Cost that moves with a driver anyone recognizes, users, data volume, number of dashboards, is forecastable, which makes it fundable. Cost with no attached driver reads as unpredictable, and unpredictable costs attract blunt cuts.

**Show the counterfactual for maintenance.** Maintenance spend defended on its own terms sounds like overhead. Presented as the thing preventing a larger query bill, with the arithmetic attached, it is an investment with a return.

**Never present infrastructure spend as total platform cost.** Say plainly that engineering time is the larger line and is not in the chart. A team that omits it wins an argument once and loses the next one when someone proposes an optimization that costs a quarter of engineering to save a few hundred dollars a month.

The goal of the whole exercise is not a lower bill. It is that every significant cost has a name, an owner, and a driver, so the conversation about whether it is worth paying is one anyone can participate in.

## Getting to a defensible number

For a team starting from a cloud bill and no attribution, the order that gets to something usable fastest.

**Week one: split the bill four ways.** Storage, requests, compute, transfer. Percentages, not dollars, because the percentages tell you where to spend the next three weeks. This alone corrects most teams' intuitions.

**Week two: tag queries.** Team, workload, environment, asset. Propagate the tags from every pipeline and every BI connection. Nothing downstream works without it.

**Week three: build the attribution query.** Query history joined to a rate model, aggregated by tag. Publish the top twenty.

**Week four: measure your own rates.** Cost per core-hour, effective throughput, cost per terabyte scanned on your own hardware with your own data. Vendor numbers and blog numbers are starting points, not inputs.

**Week five: storage per table with retention overhead.** From Iceberg metadata plus the bucket, per table.

**Week six: showback.** Publish per-team costs and send each owner their most expensive workload. Then wait a month before doing anything else, because visibility alone will move the number and you want to see how far.

**Ongoing: the monthly review.** Six queries, one hour.

At the end of six weeks the dashboard question has an answer, and so does the harder version of it: what this platform costs per team, per workload, and per query, with a model that updates itself.

## Two numbers worth tracking forever

Most cost programs collapse under the weight of their own dashboards. If everything else lapses, two metrics carry most of the value.

**Cost per terabyte scanned, platform-wide, monthly.** This is the efficiency of your platform expressed as one number. It falls when layout improves, when pruning improves, and when idle capacity shrinks. It rises when tables fragment, when queries lose their filters, and when clusters get provisioned for a peak that never comes. Watching it monthly catches drift long before an invoice does, and it is comparable across time in a way absolute spend is not, because it is normalized against usage.

**Compute as a share of total platform spend.** The proportion tells you which meter to work on without needing to look at anything else. A platform where compute drifts above the typical band has a query efficiency problem. One where transfer climbs has a data flow problem, usually a consumer reading across a boundary. One where storage climbs has a retention problem.

Both numbers fit in one sentence in a monthly update, both are computable from data you already have once tagging exists, and both survive reorganizations, tool changes, and staff turnover in a way that a twenty-panel dashboard does not.

## Where this is going

Three shifts worth planning for.

**Agent traffic changes the shape of demand.** Query volume driven by automated clients grows on a curve unrelated to headcount, and its cost per query is often worse than a human's because agents explore. Platforms that treat agent traffic as ordinary usage will be surprised by both the volume and the concentration, since a small number of agent-heavy users typically drive most of it. Per-identity budgets stop being a nicety.

**Cost attribution is moving into the platform.** Query tagging, per-workload accounting, and chargeback-ready reporting are becoming standard platform features rather than things every team builds. That is a straightforward improvement and it removes a common excuse for not doing this.

**Maintenance is moving into the write path and into catalogs.** Compaction inside the streaming job that writes the data, and catalog-scheduled maintenance driven by table-level policy, both reduce the read-and-rewrite cycle that shows up in the compute line. The cost of well-managed tables falls, and the gap between managed and unmanaged tables widens.

What stays constant is the arithmetic. Compute dominates, compute tracks bytes touched and files opened, and both are set by decisions about layout and query patterns that were made months before the bill arrived. Every durable cost improvement is upstream of the invoice.

## Conclusion

The dashboard question has an answer, and getting to it is a six-week project rather than a research program.

Split the bill four ways and check the percentages against your intuition, because storage is visible and small while compute is large and opaque. Tag every query with team, workload, and asset. Join query history to a rate model and publish the top twenty by cost. Measure your own throughput rather than borrowing a number. Compute storage per table including retention overhead. Then show teams what they spend and wait a month, because visibility does most of the work before any policy does.

The levers that move the number are layout, pruning, query patterns, cluster utilization, maintenance scope, retention, and transfer, roughly in that order. The ones that feel productive and are not include storage tiering and compression tuning.

And keep the costs that never reach the bill in the frame. Engineering time is usually the largest line in a data platform, migration cost is the practical meaning of lock-in, and a platform whose numbers people do not trust generates reconciliation work forever. Optimizing infrastructure spend against those is how a team saves a thousand dollars and spends a quarter of engineering to do it.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and operations. *Architecting an Apache Iceberg Lakehouse* covers the design decisions upstream of every number in this article, and *Apache Iceberg: The Definitive Guide* covers the metadata that makes per-table attribution possible. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
