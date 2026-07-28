---
title: "Serving Sub-Second Queries Over an Iceberg Lakehouse With a Hot Tier"
date: "2026-07-28"
description: "A lakehouse cannot serve sub-second queries over seconds-old data. A hot tier in front solves it, with consequences for consistency, governance, and operational surface."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Streaming
  - Data Serving
  - Hot Tier
canonical: "https://iceberglakehouse.com/posts/hot-tier-iceberg-serving/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/hot-tier-iceberg-serving/).

# Serving Sub-Second Queries Over an Iceberg Lakehouse With a Hot Tier

A fraud detection agent evaluates a transaction. It needs the customer's activity over the last four hours, their ninety-day baseline, and the merchant's recent decline rate. Two of those live in an Iceberg table refreshed every ten minutes. One needs data from four seconds ago.

The lakehouse answers two of the three questions well and cannot answer the third at all, because the data has not been committed yet. So the team adds a second store for recent activity, and now they have two systems, two schemas, and application code that knows where the boundary is.

That architecture is correct. What follows is how to build it deliberately rather than discovering it, because the version teams stumble into has failure modes the designed version does not.

I work at Dremio, which builds a query engine over Iceberg, so I have a view on where the lakehouse fits in this picture. The pattern is engine-agnostic and the reasoning holds regardless of which systems you pick.

This piece covers what a lakehouse is structurally bad at, what a hot tier has to provide, how to size the boundary, how to keep two stores consistent, and when the whole pattern is unnecessary.

## What a lakehouse cannot do, structurally

Iceberg on object storage is excellent at a specific thing: cheap, durable, engine-neutral storage of large historical datasets with atomic commits. Three properties of that design put a floor under latency.

**Freshness is bounded by commit cadence.** A row is queryable after a snapshot commits. Frequent commits produce small files and heavy metadata, so the practical cadence sits in minutes for most tables. Nothing about tuning removes this, it is where the file-size and metadata-growth curves cross. Teams that push the commit interval down to seconds discover the cost a few weeks later, when query planning has slowed for everyone and compaction is permanently behind.

**Point lookups are not what the format optimizes.** Iceberg prunes files using partition values and column statistics, which is powerful for scans over ranges and poorly suited to fetching one row by key. A point lookup on an unsorted column reads far more than the row you wanted. Sorting the table on the lookup key helps substantially and does not close the gap against an actual index, because pruning narrows the candidate files while an index goes directly to the record.

**Object storage has a latency floor.** A first-byte latency of tens of milliseconds per request is normal, and a query touching several files pays it several times. That is fine at analytical scale and it is a lot when the budget for the whole answer is 50 milliseconds. Parallelism hides some of it, and the floor stays: a query cannot return faster than its slowest necessary request, and the request count grows with file count.

None of these is a defect. They are consequences of optimizing for cheap durable storage of large data with broad engine access, which is the right optimization for the job the lakehouse does.

The mistake is expecting one storage layer to serve both a nightly report over three years of history and a lookup an automated system waits on. Those workloads have opposite requirements, and the tiered architecture exists because no single system serves both well. Recognizing that early saves a lot of time spent tuning a lakehouse toward a latency target it structurally cannot reach.

The three serving options differ on the axes that decide between them.

| | Lakehouse only | Lakehouse plus engine cache | Lakehouse plus hot tier |
|---|---|---|---|
| Freshness floor | Commit cadence, minutes | Commit cadence, minutes | Sub-second |
| Point lookup by key | Poor | Poor | Fast |
| p99 under high concurrency | Variable | Good on cached results | Good |
| Systems to operate | One | One | Two |
| Consistency work | None | None | Real |
| Governance surface | One boundary | One boundary | Two boundaries |

The middle column is the one teams skip past and it covers more cases than expected. An engine that caches or materializes recent partitions gives you fast queries over minutes-old data with no second system. Only the freshness row forces the third column.

## What the hot tier has to provide

Four capabilities, and knowing which you actually need narrows the candidates considerably.

**Ingest latency measured in low seconds or less.** Data has to be queryable almost immediately after the event. This is the requirement that rules out anything writing to object storage on a commit cadence, and it is the requirement to test first, because a store that cannot meet it is disqualified regardless of how well it does the rest.

**Point lookups by key.** Fetching one entity's recent state in single-digit milliseconds. This usually means an index, which is the capability an analytical table format deliberately does not carry.

**Bounded aggregations over recent data.** Counts, sums, and rates over the hot window. Not full historical aggregations, just the recent slice. The bound matters: a store that aggregates two hours of data quickly and ninety days slowly is fine here, because ninety days is the lakehouse's job.

**Predictable latency under concurrency.** An automated system issuing hundreds of queries per second needs the p99 to be close to the median. A store with occasional multi-second pauses breaks the loop even when its average looks fine. Garbage collection pauses, compaction stalls, and rebalancing are the usual sources, and they are exactly the behaviors a short benchmark misses.

Several systems provide these with different tradeoffs. Real-time analytical databases like ClickHouse and Apache Druid handle high-cardinality aggregation over recent data well and are less suited to single-row lookups. Key-value stores handle lookups and not aggregation. Streaming storage layers with primary key indexes cover both partially. In-memory caches serve precomputed answers and cannot compute new ones.

The selection criterion that matters is which of the four capabilities your workload actually needs. Teams routinely pick a system optimized for aggregation and then use it primarily for lookups, or the reverse, and then fight it.

Write down the query shapes before choosing. Three or four concrete queries with their latency budgets is enough, and it makes the selection nearly mechanical.

## Three query shapes and what each needs

The decision gets much easier once you separate the shapes, because they have different answers.

**Shape one: current state of one entity.** What is this customer's balance, this device's status, this order's stage. A point lookup on a key, needed in single-digit milliseconds, returning one row.

This wants an index. An analytical store scanning to find one row is doing the wrong kind of work, and the difference between a keyed lookup and a scan is several orders of magnitude. A key-value store or a primary-key-indexed streaming layer serves this best.

**Shape two: aggregate over a recent window.** How many declines has this merchant had in the last ten minutes. A bounded aggregation over recent data, needed in tens of milliseconds, returning one number or a few.

This wants a real-time analytical database. Columnar storage over recent data with fast aggregation is exactly what systems like ClickHouse and Druid are built for, and they do it very well over a bounded window.

**Shape three: recent activity joined against historical baseline.** How does this customer's last hour compare against their ninety-day pattern. This is the spanning query, and it is the one that motivates the whole architecture.

This wants both tiers and a union. It is also the most expensive shape and the one to minimize, because every spanning query pays for coordination across two systems.

Three design implications fall out.

**Precompute the historical side.** A ninety-day baseline recomputed on every request is enormous waste. Compute baselines on a schedule, store them small, and let the spanning query join recent activity against a precomputed row rather than against ninety days of raw events. This converts most shape-three queries into shape-one plus shape-two.

**Different shapes justify different stores.** A workload that is entirely shape one does not need an analytical database. One that is entirely shape two does not need a key-value store. Teams that pick one system for all three fight it on at least one.

**Count your shapes before selecting.** Instrument the actual queries. Teams frequently discover that ninety percent of their traffic is shape one, which they were serving with a system optimized for shape two.

The precomputation point is worth dwelling on because it is the highest-value optimization available here. Most "real-time analytics" requirements decompose into a fast lookup of recent state plus a comparison against something that changes slowly. Recognizing which part actually needs to be fresh usually shrinks the hot tier requirement substantially.

## Where the boundary goes

The hot window is the single most consequential parameter. Too short and queries needing slightly older data fall to the slow path. Too long and you are paying premium storage to hold data nobody queries at that latency.

Derive it from three measurements rather than picking a round number.

**Query time-range distribution.** Instrument your queries and record the time range each touches. Most workloads produce a sharp distribution, with a large share touching the last few minutes to hours and a long thin tail reaching back months. Set the window where the marginal query served stops justifying the storage.

Use observed queries rather than stated requirements. What people say they need skews toward the longest range anyone ever wanted, and what they run is much tighter.

**Ingest rate times window.** Hot storage is expensive storage. Multiply bytes per second by window seconds. At 30 MB/s and a two-hour window that is roughly 216 GB, which is unremarkable. The same rate at a one-week window is 18 TB, which is a different conversation.

**Recovery time.** More state means longer recovery after a failure. If the hot tier is in the path of an automated decision loop, its recovery time is a availability constraint on that loop.

Those three give a range. Pick inside it and revisit quarterly, because ingest rates grow and query patterns shift.

One refinement worth applying: the window does not have to be uniform. A high-value entity type gets a longer window than a low-value one. Uniform windows are simpler and waste fast storage on data that does not need it.

The metric to watch afterward is the fraction of queries spanning the boundary. Spanning queries are more complex and slower than either side alone. A high spanning fraction means the window sits at exactly the wrong place, which is worse than setting it too short. Measure it and move the window to minimize it.

## Keeping two stores consistent

Two copies of overlapping data is the cost of this pattern, and consistency is where it goes wrong.

**Write once, fan out.** The pattern that works: one write path produces both. A stream feeds the hot tier, and the same stream feeds the lakehouse writer. Neither store is derived from the other at query time.

The alternative, writing to the hot tier and periodically copying to the lakehouse, creates a dependency where a hot tier failure means lost history. Fan-out from a durable stream means either store rebuilds from the stream.

**Make the overlap deliberate.** Hot and cold should overlap rather than abut. If the hot window is two hours and the lakehouse holds everything, there is a two-hour region present in both. That overlap is what lets a query spanning the boundary deduplicate rather than gap.

The failure without it: a boundary-spanning query at the exact moment the hot tier expired a record the lakehouse had not yet committed. The record exists nowhere. Overlap makes this impossible.

**Deduplicate on a stable key.** A spanning query that unions both sides gets duplicates in the overlap region. Deduplicate on an event identifier, keeping the hot tier's version, since it is the more recent write.

```sql
-- Union with overlap and deduplication. The overlap region is
-- deliberately present in both stores.
WITH combined AS (
    SELECT event_id, customer_id, event_time, amount_usd, 'hot' AS src
    FROM hot.events
    WHERE event_time >= current_timestamp - INTERVAL '2' HOUR

    UNION ALL

    SELECT event_id, customer_id, event_time, amount_usd, 'cold' AS src
    FROM lakehouse.gold.events
    WHERE event_time >= current_timestamp - INTERVAL '90' DAY
),
deduped AS (
    SELECT *, row_number() OVER (
        PARTITION BY event_id ORDER BY (src = 'hot') DESC
    ) AS rn
    FROM combined
)
SELECT customer_id, count(*) AS events, sum(amount_usd) AS total_usd
FROM deduped
WHERE rn = 1
GROUP BY customer_id;
```

The `row_number` with the source preference is the deduplication. Without it, every event in the overlap region counts twice, and totals are wrong by whatever fraction the overlap represents.

**Drive both schemas from one definition.** Schema drift between the two stores produces spanning queries that fail or silently return partial columns. Generate both from one source and test a spanning query in continuous integration.

**Reconcile daily.** Compare counts and aggregate totals over a window present in both stores. Divergence indicates a write path problem, and finding it the next morning beats finding it in a wrong number three weeks later.

## Hiding the boundary from consumers

Application code that knows about two stores is code that breaks when the boundary moves.

The layer that fixes this is a view. Consumers query one logical dataset. The view unions and deduplicates. Where the hot window sits, and which systems back which side, are implementation details.

Three properties that matter.

**Consumers never name a physical store.** They query `analytics.events_current`. Changing the hot window from two hours to six is a view definition change and nothing else.

**The view carries the deduplication.** Written once, correct once. Every consumer inherits it, rather than each implementing a union and getting the edge cases differently.

**The view documents its freshness and its limits.** What the hot window is, what the expected staleness on each side is, what the view is not suitable for. This matters for human consumers and matters more for automated ones, which act on what a dataset claims to be.

For agent consumers specifically, this is the difference between a working system and a confusing one. An agent given direct access to two stores has to decide which to query, and it will decide badly. An agent given one view with a clear description queries the view.

Whether your engine executes this efficiently is worth verifying rather than assuming. A federated union across two systems needs the predicates pushed into both sides. Read the plan. A view that pulls the full hot table and filters locally defeats the design.

## When you do not need this

The pattern costs a second system, a second write path, consistency work, and permanent operational surface. Four situations where it is not worth it.

**Your latency requirement is above a minute.** Flink writing to Iceberg at a two-minute commit interval, with a query engine that accelerates recent partitions, meets a two-minute requirement. Adding a tier buys complexity and no capability. This case covers more requirements than anyone expects, because "real-time" in a requirements document usually means "not the nightly batch" rather than a specific number.

**Your queries are analytical, not operational.** A dashboard refreshed when someone opens it does not need sub-second freshness. Dashboards feel fast at two-second query latency over ten-minute-old data, and the second requirement is much cheaper than the first.

**Your data volume is small.** A dataset that fits in memory in the query engine does not need a separate hot store. Caching in the engine covers it, and the threshold for what fits in memory on a modern machine is higher than most people assume.

**Nobody is waiting on the answer programmatically.** The strongest case for a hot tier is a loop where a system takes an action based on the query result. Where a human reads the result, seconds of staleness rarely change a decision.

The test that settles it: name a decision that changes based on data from thirty seconds ago versus five minutes ago, and name what it costs to get it wrong. If you cannot, the requirement is aspirational and the architecture should not carry it.

Aspirational latency requirements are common and they are expensive. "Real-time" gets written into a requirements document because it sounds correct, and it commits the team to a second storage system serving a dashboard nobody refreshes more than hourly.

## The operational cost nobody budgets

Adding a second storage system to a data platform has costs that do not appear in an architecture diagram.

**Two on-call surfaces.** The hot tier fails differently from object storage. Node failures, memory pressure, ingestion lag, and rebalancing are all new failure modes with new runbooks. Someone has to know them at 3am.

**Two capacity planning exercises.** Object storage is effectively unbounded and priced per byte. A hot tier runs on machines with fixed memory and disk, and outgrowing them is an event rather than a bill. Growth in ingest rate hits the hot tier first and hardest.

**Two upgrade paths.** Versions, compatibility, and maintenance windows for both. Where the hot tier is in an automated decision path, its maintenance window is a period where that decision path degrades.

**Two security reviews.** Access control, encryption, network exposure, and audit for both. The hot tier is frequently the one that gets less attention, which is why it is the one holding the same sensitive records with weaker controls.

**Two backup and recovery stories.** The hot tier's recovery is usually "rebuild from the stream," which is correct and needs to be tested. How long does rebuilding two hours of data take, and what happens to the decision loop meanwhile.

**Doubled write-path complexity.** One write path becomes a fan-out with two sinks, two failure modes, and a consistency requirement between them. Every schema change now touches two systems.

The honest accounting: adding a hot tier is roughly the ongoing operational cost of a second production database, plus consistency work that neither system helps with. That is worth it for a genuine sub-second requirement and not worth it for a dashboard.

Two mitigations worth applying if you proceed.

**Use a managed service if one fits.** The operational cost is the dominant cost here, and paying to remove it is frequently the right trade even at a higher unit price.

**Give it a named owner from day one.** The most common way this goes wrong is not technical. It is that the hot tier was added by whoever needed it, nobody else learned it, and two years later it is a system one person understands and everyone depends on.

## Agent feedback loops specifically

The pattern predates agents and agents change the requirements in ways worth stating, because the assumptions baked into a serving tier designed for applications do not all hold.

**Query shapes are generated, not designed.** An application issues a fixed set of queries a developer wrote. An agent composes queries for the question in front of it. A hot tier tuned for three known access patterns handles a distribution of unknown ones less predictably, and the ones that fall outside the tuning are slow.

The mitigation is a narrow tool surface rather than open query access. An agent given a function that takes an entity identifier and a time window produces queries in the shape the store was tuned for. One given arbitrary SQL does not.

**Concurrency arrives in bursts.** An agent reasoning through a problem issues several queries in quick succession, then nothing, then several more. Multiplied across concurrent sessions, this produces a spikier load profile than steady application traffic. Size for the burst, not the average.

**Retries compound.** An agent framework retries a slow or failed query. A hot tier under load gets retried into more load. Configure retry at one layer and set a timeout below the agent's patience so a degraded query fails fast rather than occupying a connection.

**The loop is only as fast as its slowest step.** A hot tier answering in 20 milliseconds inside a loop where the model takes 800 milliseconds has not bought what it appears to. Measure the whole loop before optimizing the storage step. Teams optimize the part they understand rather than the part that dominates, and in agent loops the inference step usually dominates.

That last point deserves emphasis because it changes the economics of this whole architecture. If the decision loop includes a model call, the sub-second storage requirement is frequently softer than it looks. Where the loop is pure code, meaning a rules engine or a scoring function evaluating a threshold, storage latency is the budget and the hot tier earns its place. Where a model is in the loop, a few hundred extra milliseconds of storage latency is a fraction of the total and possibly not worth a second system.

Work out where your loop's time actually goes before committing to the architecture. It is a morning of instrumentation and it occasionally saves the entire project.

## Tiering the data out

The hot tier holds a window, so something has to remove data leaving it. Getting expiry wrong is one of the two ways this architecture loses records.

**Expire on the same clock the lakehouse commits on.** The hot tier's retention has to exceed the lakehouse's worst-case commit lag by a comfortable margin. If the lakehouse commits every ten minutes and occasionally takes forty under load, a two-hour hot window is fine and a fifteen-minute one is a data loss incident waiting for a slow Tuesday.

**Verify the cold side before expiring the hot side.** The safest design does not expire on a timer at all. It expires records the lakehouse has confirmed committing. That requires the hot tier to know the lakehouse's watermark, which is a small piece of coordination and worth building.

```sql
-- Watermark: the newest event time fully committed to the lakehouse.
-- Hot tier expiry should never advance past this minus a safety margin.
SELECT
    max(event_time)                     AS cold_watermark,
    max(committed_at)                   AS last_commit,
    timestampdiff(SECOND, max(committed_at), current_timestamp) AS commit_lag_s
FROM lakehouse.gold.events;
```

Publish that watermark somewhere the expiry job reads. Expiry advances to the watermark minus the overlap margin, never past it. A lakehouse writer that stalls stops hot expiry rather than causing data loss, which is the correct failure direction: the hot tier grows and someone gets paged, instead of records vanishing silently.

**Alert on the gap between the watermark and now.** A growing gap means the lakehouse writer is falling behind, which is the upstream cause of every boundary problem in this architecture. It is the single most useful metric in the whole design.

**Size the safety margin from the worst case, not the median.** Take the maximum commit lag you have observed over a month and multiply by three. Commit lag distributions have long tails, driven by contention with maintenance jobs and by occasional large batches.

**Handle backfills explicitly.** A backfill writing historical data to the lakehouse does not move the watermark forward in a useful way, and a naive watermark query over a table receiving backfilled rows produces a wrong answer. Compute the watermark over the streaming write path only, or track it separately rather than deriving it from table contents.

That last one is a real bug that appears months after a working system has been running, when someone runs their first backfill and the hot tier expires two hours of live data because the watermark query saw old event times. Scope the watermark to the live path.

## A staged build

An order that gets value early and keeps the option to stop.

**Step one: measure the loop.** Where does the time actually go. Storage, inference, network, application logic. If storage is not the dominant term, stop here and fix the dominant term instead. This step is a morning and it prevents the most expensive possible mistake.

**Step two: try the engine cache first.** Materialization or caching over recent partitions in your existing query engine, with no second system. This covers freshness requirements down to minutes with no new operational surface. A meaningful share of stated sub-second requirements are met by a well-cached engine over ten-minute-old data, and finding that out costs a week.

**Step three: prototype the hot tier against one query shape.** Pick the single highest-value query, stand up a candidate store, and measure end to end. One shape, one store, real data. This answers whether the latency is achievable before you commit to the consistency work.

**Step four: build the fan-out write path.** Stream to both. This is the step that makes the architecture durable rather than a cache with a data loss risk, and it is more work than it sounds.

**Step five: publish the view and move one consumer.** Union, deduplication, documentation. Move one real consumer onto it and watch for a week.

**Step six: watermark-driven expiry and reconciliation.** The correctness machinery. Doing this before step five is premature; doing it much after is how a working prototype quietly loses records in production.

**Step seven: broaden, with the governance model mirrored.** More consumers, more query shapes, and access controls on the hot tier matching the lakehouse table.

Two ordering notes.

Reconciliation belongs before broad adoption, not after. It is the check that tells you the architecture is working, and the period between shipping and building it is the period where problems accumulate unseen.

And the governance mirroring is not a step six or seven concern in every organization. Where the data is sensitive, it belongs at step four, because the moment a second copy of restricted records exists is the moment the governance gap opens.

## Failure modes

**Silent gap at the boundary.** Hot expires a record before the lakehouse commits it, and the record exists in neither. The spanning query returns a count that is quietly low. Warning sign: totals that do not reconcile with the source stream. Fix: deliberate overlap, sized larger than your worst-case lakehouse commit lag.

**Duplicates in the overlap.** Union without deduplication double-counts. Warning sign: totals higher than the source. Fix: deduplicate on a stable event key in the view.

**Schema drift.** A column added to one store and not the other. Warning sign: spanning queries failing after a schema change. Fix: one schema definition driving both, with a spanning query in CI.

**Hot tier as system of record.** The lakehouse is loaded from the hot tier rather than from the stream. A hot tier failure loses data permanently. Warning sign: no path from the durable stream to the lakehouse that bypasses the hot store. Fix: fan out from the stream.

**Window sized by intuition.** Someone picked one hour because it sounded right. Half the queries span the boundary. Warning sign: nobody measured the query time-range distribution. Fix: measure it and set the window to minimize spanning.

**Push-down failure in the union view.** The view looks correct and pulls the entire hot table on every query. Warning sign: hot tier load scaling with query count rather than with result size. Fix: read the execution plan and confirm predicates reach both sides.

**Governance boundary bypassed.** The lakehouse table is governed by a catalog with role-based access control and credential vending. The hot tier holding the same records has its own weaker access model. Warning sign: nobody can state who can read the hot store. Fix: mirror the access model deliberately, and keep sensitive columns out of the hot tier entirely where the use case does not need them.

**Recovery time unmeasured.** The hot tier is in an automated decision path and nobody has measured how long it takes to come back. Warning sign: a recovery objective that was never tested. Fix: kill a node during a drill and measure.

**Two systems, one team, no runbook.** The hot tier was added by whoever needed it and its operational knowledge lives in one person. Warning sign: one name appears on every incident touching it. Fix: document it to the same standard as the lakehouse.

## Operational guidance

**Write down three query shapes with latency budgets before selecting anything.** This makes the choice of hot store nearly mechanical and prevents picking a system optimized for the wrong access pattern.

**Fan out from a durable stream.** Both stores derive from the same source, and either rebuilds independently. This single decision eliminates the worst failure mode in the pattern, which is a hot tier failure taking history with it.

**Size the overlap from your worst observed lakehouse commit lag, times three.** The overlap exists to cover the gap between hot expiry and cold commit, so it needs to survive a slow commit, not just a typical one.

**Instrument the spanning fraction.** Percentage of queries touching both tiers, tracked over time. Rising means the window needs revisiting.

**Reconcile daily on an overlapping window.** Counts and aggregate totals, compared between stores, alerting on divergence past a tolerance.

**Publish one view, not two datasets.** Consumers query the view. Nobody references the physical stores directly, including internal services and especially including agents. Enforce it with grants rather than with a convention, because a convention holds until someone is in a hurry.

**Record which consumers depend on the boundary position.** When you eventually move the hot window, you want to know who is affected. A short list maintained alongside the view definition costs nothing and saves an afternoon of investigation later.

**Keep the hot window as short as the queries allow.** It bounds cost, bounds recovery time, and bounds your exposure on the governance and deletion questions. Every one of those improves as the window shrinks, which makes it the parameter to revisit first whenever any of them becomes a problem.

**Test the rebuild path quarterly.** Wipe the hot tier in a non-production environment and rebuild it from the stream. Measure how long it takes and confirm the result reconciles. This is the recovery procedure and an untested one is a hope.

**Alert on ingestion lag, not just on errors.** A hot tier that is up and running twenty minutes behind is worse than one that is down, because it answers with stale data confidently. Lag is the metric that catches it.

**Mirror the access model.** Whatever grants exist on the lakehouse table, write down the equivalent on the hot store and review them together. A governed table with an ungoverned copy is a governed table in name only.

## Deletion, retention, and the second copy

A consequence of holding the same records in two places that architecture discussions skip and compliance reviews do not.

**Deletion requests apply to both.** Where an individual has a right to erasure, satisfying it against the lakehouse table and not against the hot tier does not satisfy it. The hot tier's retention window bounds how long that matters, which is one more argument for keeping the window short.

The practical approach: keep the hot window short enough that expiry satisfies most deletion timelines on its own, and have an explicit delete path for the cases where it does not.

**Retention policy applies to both, with different mechanics.** The lakehouse expires data through partition deletes and snapshot expiration, with a history that persists until snapshots are expired. The hot tier expires through its own retention. These are different systems with different guarantees, and a retention policy written for one does not automatically hold for the other.

Write the policy once, then verify each system implements it. The verification step gets skipped and it is where the gap lives.

**Sensitive columns do not need to be in both.** The strongest mitigation available. A hot tier serving recent activity for a decision loop usually needs identifiers, timestamps, and amounts, not names, addresses, or free-text fields. Project the sensitive columns out at the hot write path rather than filtering them at the read path.

This costs nothing when the use case does not need them and it removes the column from the second copy entirely, which resolves the deletion question, the access control question, and the audit question all at once for those fields.

**Audit both reads.** If access to the lakehouse table is recorded and access to the hot tier is not, your audit trail has a hole shaped exactly like your low-latency path. Record hot tier queries with the same fields: who, what, when, which records.

**Encryption and network exposure deserve a review of their own.** The lakehouse sits behind object storage with its own encryption and a catalog vending scoped credentials. A hot tier is frequently a database on a network with different defaults. It gets less scrutiny because it feels like infrastructure rather than like a data store, and it holds the same records.

The general point: a second copy of governed data is a second governance surface, and the effort that went into the first one does not transfer automatically. Budget for doing it twice, or design so the second copy holds less.

## Where this is heading

Three directions.

Streaming storage designed for this role is maturing. Systems built specifically as an analytical hot tier, holding recent data in a columnar format with primary key indexing and tiering into the lakehouse automatically, are a better fit for this pattern than repurposing a general analytical database. Apache Fluss, currently incubating, is one example of that shape. Whether purpose-built layers displace repurposed ones is an open question and the design pressure is real.

Engines are getting better at hiding the boundary. A query engine that federates across a hot store and a lakehouse table, with correct pushdown into both, makes the union view a real abstraction rather than a leaky one. This is engine work rather than storage work and it is where the developer experience improves most.

The unresolved problem is governance. Everything the industry has built for lakehouse governance, meaning catalogs with role-based access control, credential vending, and audit, stops at the lakehouse boundary. A hot tier holding the same records with a different access model is a hole in that boundary, and it gets harder to ignore as automated consumers multiply and as deletion requirements have to be satisfied wherever data lives. Pulling the hot tier inside the catalog's governance boundary is the clean answer and I have not seen it done anywhere.

## Conclusion

A lakehouse cannot serve sub-second queries over data seconds old, and that is a consequence of the design rather than a gap in it. Commit cadence bounds freshness, point lookups are not what file pruning optimizes, and object storage has a latency floor.

Where a system genuinely waits on the answer, a hot tier in front of Iceberg is the right architecture. Size the window from measured query time-range distribution, not from a round number. Fan out from a durable stream so both stores derive from one source and either rebuilds. Overlap the tiers deliberately and deduplicate on a stable key, because the alternative is a silent gap at the boundary. Publish one view so consumers never know the boundary exists.

Before any of it, name a decision that changes based on thirty-second-old data versus five-minute-old data, and name what getting it wrong costs. Most requirements labeled real-time do not survive that question, and the ones that do justify the second system easily.

And mirror the governance. A carefully governed Iceberg table with an ungoverned copy of its recent rows in another store is not a governed table. That gap is the one this architecture opens and the one most teams forget to close.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture. *Architecting an Apache Iceberg Lakehouse* from Manning covers tiering, serving layers, and the design decisions behind where data lives at each latency requirement. *Apache Iceberg: The Definitive Guide*, which I co-authored for O'Reilly, goes deeper on the commit and pruning mechanics that put the latency floor where it is. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
