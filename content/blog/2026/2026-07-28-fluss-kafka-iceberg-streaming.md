---
title: "Apache Fluss and Kafka Solve Different Problems in an Iceberg Pipeline"
date: "2026-07-28"
description: "Fluss puts a columnar, indexed hot tier between Kafka and Iceberg. Here's what it changes structurally, what Kafka still does better, and how to benchmark the comparison yourself."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Apache Fluss
  - Kafka
  - Streaming
canonical: "https://iceberglakehouse.com/posts/fluss-kafka-iceberg-streaming/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/fluss-kafka-iceberg-streaming/).

# Apache Fluss and Kafka Solve Different Problems in an Iceberg Pipeline

A streaming team is asked to cut dashboard latency from six minutes to under thirty seconds. The pipeline is Kafka into Flink into Apache Iceberg, and the six minutes is almost entirely the Flink sink's commit interval.

They shorten it. Latency drops and the table starts producing a file per bucket per commit, so the file count grows by a factor of twelve. Query planning slows, compaction cannot keep up, and within two weeks the dashboard is slower than it was at six-minute commits.

This is the fundamental tension in streaming to a lakehouse, and it is a property of the architecture rather than a tuning mistake. Iceberg commits are atomic metadata operations. Committing often means many small commits and many small files. Committing rarely means latency. There is no setting that resolves it.

Apache Fluss, currently incubating at the Apache Software Foundation, attacks that tension from a different angle: put a storage layer between the event stream and the table that serves reads at streaming latency while writing to Iceberg on a sane cadence. Whether that is worth adopting depends on questions this article tries to make answerable.

I work at Dremio, which builds a query engine reading Iceberg tables, so I care about what lands in those tables and how. Fluss is not a Dremio product and Kafka is not a competitor of ours. Everything below comes from the projects' own documentation.

This piece covers where the latency floor comes from, what Fluss changes structurally, what Kafka does that Fluss does not, and how to benchmark the comparison yourself rather than trusting anyone's numbers including mine.

## Where the latency floor comes from

Trace the path from an event to a queryable row.

An event is produced to Kafka. A Flink job consumes it, does whatever processing, and buffers output. On a checkpoint, the Iceberg sink writes buffered rows to data files in object storage and commits a new snapshot to the catalog. Readers see the row after that commit.

The latency is dominated by the checkpoint and commit interval, and that interval is bounded from below by three things.

**File size economics.** Each commit produces at least one file per bucket per partition. A ten-second commit interval on a table with 32 buckets produces 32 files every ten seconds, which is 276,480 files a day. Each one carries footer overhead and a metadata entry, and readers pay for both. The historical gap between streaming and lakehouse has been somewhere in the five to fifteen minute range for exactly this reason: that is roughly how long it takes to accumulate enough records to write a file worth writing.

**Metadata growth.** Every commit produces a snapshot and manifest entries. Frequent commits grow the metadata tree, and scan planning reads that tree. A table taking thousands of commits a day slows down for every reader unless expiration and manifest rewriting run aggressively.

**Commit contention.** Iceberg uses optimistic concurrency on the catalog pointer. More frequent commits means more chances to race other writers and maintenance jobs, which means retries.

So the floor is not arbitrary. It is where three curves cross, and the crossing point sits at minutes rather than seconds for most tables.

The usual workaround is a second serving system. Keep Kafka for the stream, add a low-latency store for recent data, query the lakehouse for history, and union the two. That works and it means two storage systems, two schemas, two sets of operational knowledge, and application code that knows where the boundary is.

The three architectures compare on the dimensions that decide between them.

| | Flink direct to Iceberg | Kafka plus Fluss plus Iceberg | Kafka replaced by Fluss |
|---|---|---|---|
| Achievable freshness | Minutes | Sub-second | Sub-second |
| Small-file pressure | High at low latency | Low | Low |
| Systems to operate | One pipeline | Three layers | Two layers |
| Point lookups on stream | No | Yes | Yes |
| General event transport | N/A | Kafka keeps it | Fluss takes it on |
| Maturity risk | Low | Moderate, isolated to one tier | Higher |
| Reversibility | N/A | Remove a tier | Rebuild ingestion |

The reversibility row is the one that decides the shape of a pilot. A design where Kafka still carries events can be unwound by deleting a layer. One where Fluss replaced Kafka cannot.

## What Fluss changes structurally

Fluss is a distributed streaming storage service providing high throughput and sub-second latency for streaming reads and writes. The framing that matters is that it is designed as streaming *table* storage tailored for analytical workloads, rather than as a message queue.

Four design decisions follow from that framing, and each one has consequences.

**Columnar storage on the stream.** Fluss uses the Apache Arrow IPC streaming format for its underlying file storage. Kafka persists data as unstructured, row-oriented logs, which is efficient for sequential scans and requires reading whole records.

Arrow on the stream means projection pushdown works. A consumer that needs four columns from a fifty-column record reads four columns. On wide records this changes the amount of data crossing the network by a large factor, and the factor grows with record width.

**Primary key tables with an index.** Fluss supports primary key tables backed by a RocksDB index, which makes real-time lookup queries on primary keys possible. Kafka has compacted topics, which retain the latest value per key and do not give you a point lookup.

This is the capability that removes a whole class of external system. Streaming pipelines that need dimension lookups typically keep a separate key-value store in sync. A stream with a queryable index does that job.

**Tiering into the lakehouse.** A tiering service continuously offloads data from Fluss into a standard lakehouse format, Iceberg or Apache Paimon. The stream is the hot tier, holding recent data on fast storage in Arrow format. The table is the cold tier, holding history in Parquet on object storage.

That split is the direct answer to the latency floor. Recent data is served from the hot tier at streaming latency. The tiering service writes to Iceberg on whatever cadence produces well-sized files, because nobody is waiting on those writes for freshness.

**Aligned data layout.** Fluss aligns partitions and buckets across the streaming and lakehouse layers so the data layout is consistent. That alignment allows direct Arrow-to-Parquet conversion without network shuffling or repartitioning.

The last one is subtler than the others and it is the one that makes the tiering cheap. Converting a stream into table files usually requires reorganizing data to match the table's partitioning, which means a shuffle. Aligning the layouts up front removes the shuffle from the conversion.

## Row-oriented and column-oriented are different bets

The Arrow decision deserves more than a bullet, because it explains what each system is good at.

Kafka's log is a sequence of opaque records. The broker does not parse them, does not know their schema, and cannot skip parts of them. That opacity is a feature: Kafka carries any payload, and the broker's job stays simple and fast.

The cost appears when the consumer is an analytical one. A Flink job reading fifty-column records to compute a sum over two of them transfers all fifty columns, deserializes all fifty, and discards forty-eight. Multiply by throughput and the waste is the dominant cost of the pipeline.

Fluss makes the opposite bet. The storage layer knows the schema, stores columnar, and serves projections. The consumer asks for two columns and two columns cross the network.

That bet costs something. A schema-aware store is more complex than an opaque log. Schema evolution becomes the storage layer's problem. And payloads that are not tabular, meaning binary blobs, arbitrary JSON, or protocol buffers with deep nesting, fit a columnar model less naturally than they fit an opaque one.

The honest summary: for analytical streaming with wide tabular records, columnar is clearly better. For general-purpose event transport across an organization with diverse payloads, an opaque log is the more appropriate abstraction. Those are different jobs and it is reasonable to want both.

Fluss offers Kafka protocol compatibility, aimed at helping existing streaming data migrate. That lowers the switching cost for producers and does not change the underlying architectural question of which model fits your workload.

## Bucket alignment, and why it removes the shuffle

The layout alignment property gets one sentence in most descriptions and it deserves more, because it is the mechanism that makes continuous tiering affordable.

Start with what normally happens converting a stream into table files. A stream is partitioned by whatever key the producer used, often for load balancing rather than for query patterns. A table is partitioned by whatever makes queries fast, typically a time column, and bucketed on a key with good distribution. Those two layouts have no reason to match.

Converting between them means redistributing records so each output file holds only records belonging to one table partition and bucket. That redistribution is a shuffle, meaning records move across the network from the node that read them to the node that writes them. Shuffles are the most expensive operation in distributed data processing, and doing one continuously to keep a table fresh is a permanent tax.

Aligning the layouts removes it. If the stream's bucket boundaries match the table's bucket boundaries, and the stream's partitioning matches the table's partitioning, then the node holding a chunk of stream data already holds exactly the records for one output file. It converts Arrow buffers to Parquet locally and writes. No network movement, no coordination.

Two consequences follow.

**Tiering cost scales with data volume, not with cluster size.** A shuffle-based conversion gets more expensive as you add nodes, because more nodes means more cross-node traffic for the same data. A local conversion does not.

**Tiering can run continuously rather than in batches.** The reason conventional pipelines batch the write is partly to amortize the shuffle over more records. Remove the shuffle and continuous conversion becomes reasonable, which is what lets the table stay fresh without the writer waiting.

The practical implication for anyone designing this: the alignment is a constraint you accept up front. Your stream's bucketing is determined by your table's bucketing, which is determined by your query patterns. That is a coupling between layers, and it is the price of the property.

It also means changing the table's partitioning is not a table-only operation any more. Iceberg supports partition evolution without rewriting data, and if a stream layer is aligned to the old spec, evolving the table's spec breaks the alignment until the stream is reconfigured. Plan partition changes as changes to both layers.

Worth noting the general lesson, since it is not specific to any project: co-designing the layout of adjacent layers buys efficiency that neither layer achieves alone. The same reasoning shows up in how query engines choose join strategies and in how compaction picks file groupings.

## The changelog question

One capability difference that decides some architectures on its own: what happens when a record is updated.

A Kafka topic carrying updates is a sequence of events, and reconstructing current state means replaying and folding. Compacted topics retain the latest value per key, which gives you current state and destroys the history of how it got there. You pick one.

Fluss supports changelog generation and consumption alongside primary key tables, so a consumer subscribes to either current state or the stream of changes, from the same table. That combination is what CDC pipelines actually need and what usually requires assembling two systems.

Why this matters downstream: Iceberg's own change capture depends on being able to determine which rows a snapshot changed. When updates arrive as a stream of upserts resolved somewhere upstream, the table gets a clean picture. When they arrive as delete-and-insert pairs the table has to reconcile, the picture is muddier and incremental consumers downstream of the table suffer.

Three consumer patterns and what each needs:

**Dashboards on current state.** Need the latest value per key at low latency. A primary-key-indexed hot tier serves this directly, and a compacted Kafka topic plus a lookup store serves it with more parts.

**Incremental downstream processing.** Needs the change stream, with enough information to apply changes to a derived dataset. This is where a changelog is required and current-state-only storage fails.

**Historical analysis.** Needs the full record of what happened when. This belongs in the table, not the stream, and it is what the cold tier is for.

Most real pipelines need at least two of the three, and the architecture question is how many systems it takes. Kafka plus a key-value store plus a table is three. A changelog-capable primary key table plus a table is two.

A caution worth attaching. Changelog semantics are one of the places where systems differ in details that matter and are documented loosely. What exactly a changelog record contains, whether it carries before and after images, how deletes are represented, and what ordering guarantees hold across buckets are all questions to answer concretely rather than assume. Write a test that exercises an update and a delete and inspect the actual records before designing anything on top of the semantics you expect.

## What Kafka does that Fluss does not

Any comparison that only lists what the newer system adds is marketing. Here is the other direction, and it is substantial.

**Ecosystem breadth.** Kafka has a decade and a half of connectors, client libraries in every language, monitoring integrations, managed offerings from every cloud provider, and an enormous body of operational knowledge. Fluss is incubating. The gap is not a matter of quality, it is a matter of years.

**General-purpose event transport.** Kafka carries microservice events, audit logs, application messages, and analytical data on one substrate. Fluss is purpose-built for analytical streaming, and putting general application messaging on it is using a specialized tool for a general job.

**Engine and language diversity.** Kafka consumers exist for everything. Fluss is deeply optimized for Flink, and that depth is a real advantage inside Flink and a constraint outside it. Fluss aims to integrate with other engines and Flink is where the integration is deepest today.

**Operational maturity.** Kafka's failure modes are documented in painful detail by thousands of teams. When something goes wrong at 3am, someone has written about it. Fluss is new enough that you are more likely to be the first person hitting a given problem.

**Recovery characteristics.** Fluss uses synchronous replication with an in-sync-replicas strategy like Kafka's, and log table recovery is within seconds. Primary key table recovery can take minutes, because it downloads RocksDB snapshots from remote storage. That is an honest tradeoff for the indexing capability and it is a real difference in your recovery time objective.

**Rebalancing.** Fluss scales linearly by adding TabletServers, and a table scales throughput by adding buckets. Data rebalancing across nodes has been a work in progress rather than a shipped capability. Check current status before planning around it, and know that adding capacity and redistributing existing data are different operations.

**Hiring and knowledge.** You can hire someone who knows Kafka. You will train someone on Fluss, and that training has no external curriculum to draw on yet.

**Multi-tenancy and quotas.** Kafka has mature controls for isolating tenants: per-client quotas on bandwidth and request rate, and access control lists at topic granularity. A shared streaming layer serving many teams needs those controls, and their absence or immaturity is a constraint on how widely you deploy.

None of this argues against Fluss. It argues that the comparison is not "which is better" but "which layer of your architecture is this."

## The architecture that uses both

The framing that resolves most of the confusion: Fluss and Kafka are not necessarily alternatives. Fluss sits between Kafka and Iceberg in the ingestion path. Events land in Fluss at streaming speed, and Fluss continuously writes to Iceberg in the background.

That composition looks like this:

- **Kafka** carries events across the organization. Producers do not change. Every existing consumer keeps working.
- **Fluss** holds the analytical hot tier. Recent data, columnar, primary-key indexed, served at sub-second latency.
- **Iceberg** holds history. Everything past the hot window, in Parquet on object storage, queryable by every engine.

Each layer does the thing it is good at. Kafka does durable general-purpose transport. Fluss does low-latency analytical serving. Iceberg does cheap durable history with broad engine support.

The alternative composition, replacing Kafka with Fluss entirely using the protocol compatibility, is available and is a bigger commitment. It suits organizations whose streaming is predominantly analytical and whose event transport needs are modest. For most organizations Kafka is doing a job Fluss is not trying to do.

There is a third option worth naming, which is doing neither. Flink writing directly to Iceberg with a commit interval in the low minutes, plus a query engine that accelerates recent partitions, is a simpler architecture with fewer moving parts. If your actual requirement is "under two minutes" rather than "under two seconds," that architecture meets it, and adding a streaming storage layer buys you complexity you do not need. Be honest about the requirement before adding a tier.

## Benchmarking it yourself

You will find published latency comparisons between these systems. Treat all of them, including any I produce, with suspicion. Streaming benchmark results depend so heavily on record width, projection ratio, hardware, network, and configuration that a headline number tells you almost nothing about your workload, and benchmarks in this space are frequently constructed by people with a preferred outcome.

What is useful is a method. Here is one you can run in a week.

**Define the metric precisely.** End-to-end latency means the time from an event being produced to a query returning it. Instrument it with an event timestamp written by the producer and compare against query time at the consumer. Do not measure sink throughput and call it latency.

```sql
-- End-to-end latency measurement, run continuously against each candidate
SELECT
    percentile_cont(0.50) WITHIN GROUP (ORDER BY lag_ms) AS p50_ms,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY lag_ms) AS p95_ms,
    percentile_cont(0.99) WITHIN GROUP (ORDER BY lag_ms) AS p99_ms,
    count(*)                                             AS sample_rows
FROM (
    SELECT
        timestampdiff(MILLISECOND, produced_at, current_timestamp) AS lag_ms
    FROM measurement.events
    WHERE produced_at >= current_timestamp - INTERVAL '5' MINUTE
);
```

Report p95 and p99, not the average. Streaming latency distributions have long tails and the average hides exactly the behavior users notice.

**Use your own record shape.** This is the variable that matters most and the one synthetic benchmarks get wrong. If your records have 60 columns and your queries touch 5, build the test that way. The columnar advantage scales with the projection ratio, so a benchmark on 5-column records understates it and one on 200-column records overstates it relative to your reality.

**Measure the cost of freshness, not just freshness.** For the Kafka-to-Flink-to-Iceberg baseline, run it at several commit intervals and record latency, file count per hour, and query planning time at each. That curve is the real finding. It shows you what a given latency target costs in table health, and it is what makes the comparison meaningful.

```sql
-- Track what a commit interval costs the table
SELECT
    date_trunc('hour', committed_at) AS hour,
    count(*)                          AS snapshots,
    (SELECT count(*) FROM catalog.stream.events.files) AS current_files,
    (SELECT count(*) FROM catalog.stream.events.manifests) AS manifests
FROM catalog.stream.events.snapshots
WHERE committed_at >= current_timestamp - INTERVAL '24' HOUR
GROUP BY 1
ORDER BY 1 DESC;
```

**Include maintenance in the measurement window.** A benchmark run for twenty minutes on a fresh table tells you nothing about the state you will actually operate in. Run for at least a day, with compaction and snapshot expiration on their normal schedules, and measure query performance at the end rather than the beginning.

**Test recovery.** Kill a node. Measure how long until the pipeline is healthy and whether anything was lost. Do this separately for log tables and primary key tables if you are testing Fluss, because their recovery characteristics differ.

**Measure the operational surface.** Not a number, and it belongs in the decision. How long did it take to stand up, how many configuration surprises, how good was the documentation when something broke. A system that is faster and takes three engineers to operate loses to one that is adequate and takes half of one.

Keep a running log during the evaluation: every time someone was blocked, for how long, and what unblocked them. That log is the most honest artifact the exercise produces, and it is the one that gets forgotten if nobody writes it down at the time.

**Run the same test against your existing pipeline first.** Establish the baseline with the architecture you already have, at its current settings, before touching anything. Teams routinely discover their current latency is better or worse than they believed, and either finding changes the evaluation.

## The governance gap in a hot tier

An architectural question that streaming comparisons routinely skip: who is allowed to read the hot tier, and how do you know they did?

The lakehouse has an answer to this. An Iceberg table sits behind a catalog, and catalogs like Apache Polaris enforce role-based access control, vend short-lived scoped storage credentials rather than distributing long-lived keys, and record access. A query for a table goes through an authorization decision, and revoking a grant takes effect for every engine at once.

A streaming storage layer holding the last hour of the same data is, in governance terms, a copy of that data outside that boundary. If the table is restricted and the stream is not, the restriction is decorative for anyone who knows the stream exists.

This is not a criticism specific to Fluss. It applies equally to a Kafka topic carrying the same records, and Kafka's access control is topic-level rather than column-level or row-level, which means it cannot express the policies a lakehouse catalog can. Organizations have lived with this gap for years mostly by not thinking about it.

It gets harder to ignore for two reasons.

The first is regulatory. Data subject to residency, retention, or deletion requirements is subject to them wherever it lives. A deletion request satisfied against the Iceberg table and not against the hot tier is not satisfied, and the hot tier's retention window determines how long that matters.

The second is agents. Automated consumers proliferate faster than human ones and query whatever they have access to. A governance boundary with a hole in it is a bigger problem when the population of consumers grows quickly and none of them exercises judgment about what they should not look at.

Three practical mitigations, none of which fully closes the gap.

**Keep the hot window short.** Retention is your primary control. A one-hour window bounds the exposure and bounds the deletion problem to one hour of data.

**Do not put restricted columns in the hot tier.** If the hot tier's purpose is low-latency serving of recent activity, it frequently does not need the sensitive columns at all. Project them out at the write path rather than filtering at the read path.

**Mirror the access model deliberately.** Whatever grants exist on the table, write down the equivalent on the streaming layer and check them together. This is manual and it is better than assuming.

The direction worth watching is whether streaming storage layers get pulled inside the catalog's governance boundary the way table storage has been. That is the clean answer, and I have not seen it solved anywhere yet.

## A pilot that you can unwind

Adopting an incubating project in production is defensible when the adoption is structured so that reverting is cheap. Here is a shape that keeps that property.

**Pick one pipeline with a real latency requirement.** Not the biggest one and not a toy. Something where the current freshness genuinely constrains a use case, so the evaluation answers a question that matters, and small enough that reverting is a day rather than a quarter.

**Keep Kafka in the path.** Producers keep producing to Kafka. Fluss consumes from Kafka rather than replacing it. This single decision is what makes the pilot reversible: removing Fluss means pointing the Flink job back at Kafka directly.

**Run the old path in parallel.** Keep the existing Flink-to-Iceberg pipeline writing to its table while the new path writes to a second table. Two tables, same source, different freshness characteristics. This costs storage and compute for the duration and it gives you a direct comparison on real data with real traffic patterns.

**Compare on four axes for at least two weeks.** End-to-end p95 and p99 latency. File count and query planning time on both tables. Operational incidents and how long each took to diagnose. Total cost including the extra tier.

Two weeks matters because week one is dominated by setup problems that are not representative, and because table health problems take days to appear.

**Test failure explicitly.** Kill a Fluss node during the pilot. Kill it during a primary key table workload specifically. Measure recovery. Do this on a scheduled afternoon rather than waiting for it to happen unscheduled.

**Decide on written criteria set in advance.** Latency target met, table health improved or unchanged, operational burden acceptable, cost within a stated bound. Criteria written after the results are criteria fitted to the results.

**If you proceed, expand by pipeline rather than wholesale.** Each additional pipeline is an independent decision with its own latency requirement. Some of them will not need the hot tier, and moving them anyway for architectural consistency is how you take on complexity without benefit.

**If you do not proceed, write down why.** The evaluation is worth something even when the answer is no, and the specific reason, whether it was latency, operations, cost, or maturity, tells you what has to change before it is worth revisiting.

One point on timing. Evaluating an incubating project is most useful when you have a requirement you cannot meet otherwise. Evaluating it because it is interesting produces a pilot nobody has a reason to finish, and those consume real engineering time and end inconclusively.

## Sizing the hot tier

The hot window is the parameter that determines both cost and usefulness, and it deserves to be set from data rather than from a round number.

Three inputs.

**Query time-range distribution.** Instrument your existing queries and record the time range each one touches. Most workloads produce a sharp distribution: a large share of queries touch the last few minutes to few hours, a smaller share reaches back days, and a tail spans months. Set the hot window at the point where the marginal query served is no longer worth the storage.

Do this from real query logs rather than from what people say they need. Stated requirements skew toward the longest range anyone has ever wanted; observed behavior is much tighter.

**Ingest rate times window.** Hot tier storage is fast storage, priced accordingly. Multiply your bytes per second by the window in seconds and you have the resident set. At 50 MB/s and a one-hour window that is 180 GB, which is unremarkable. At 50 MB/s and a one-day window it is 4.3 TB of NVMe, which is a budget conversation.

**Recovery time.** A longer window means more state to restore after a failure, particularly for primary key tables that download RocksDB snapshots from remote storage. Recovery time scales with the state size, so the window is bounded above by your recovery objective as well as by cost.

Those three give you a range. Pick from within it and revisit quarterly, because ingest rates grow and query patterns shift.

Two refinements worth knowing.

**The window does not have to be uniform across tables.** A high-value, latency-critical table gets a longer window than a table whose freshness nobody depends on. Setting one window globally is simpler and wastes fast storage on tables that do not need it.

**Boundary-spanning queries are the thing to minimize, not eliminate.** A query touching both tiers is more complex to execute and slower than one touching either alone. If a large share of your queries span the boundary, the window is set at exactly the wrong place, which is a worse outcome than setting it too short. Measure the spanning fraction and move the window to reduce it.

## Failure modes

**Adopting a hot tier for a requirement that did not need one.** The most common and most expensive mistake. A team adds a streaming storage layer to hit a latency target that a two-minute commit interval already met. Warning sign: nobody wrote down the actual latency requirement before designing. Fix: get the requirement in writing from whoever owns the use case, with a number.

**The hot window sized wrong.** Set too short and queries needing recent history hit the cold tier and slow down. Set too long and you are paying for fast storage to hold data nobody queries at that latency. Warning sign: a large share of queries spanning the tier boundary. Fix: measure the actual time range your queries touch and size from the distribution.

**Two systems, two schemas, drift.** The hot tier and the table diverge after a schema change applied to one and not the other. Queries spanning the boundary fail or silently return partial columns. Warning sign: schema changes applied by hand in more than one place. Fix: drive schema changes from one definition, and test a boundary-spanning query in CI.

**Incubating-project risk taken without planning.** Fluss is incubating. APIs change, releases are less predictable, and the operational knowledge base is thin. Warning sign: a production dependency with no exit plan. Fix: know what reverting looks like, and prefer the composition where Kafka still carries the events so reverting means removing a tier rather than rebuilding ingestion.

**Primary key table recovery time unmeasured.** Recovery downloads RocksDB snapshots from remote storage and takes minutes rather than seconds. A team that measured recovery on log tables assumes the same for primary key tables. Warning sign: a recovery time objective that was never tested on the table types you actually run. Fix: test both.

**Small files persisting anyway.** Tiering writes to Iceberg on a background cadence, and that cadence still needs to produce well-sized files. Misconfigured, you get the same small file problem one layer removed. Warning sign: file counts growing despite the hot tier absorbing the freshness requirement. Fix: check the tiering configuration and run compaction regardless.

**Flink coupling underestimated.** The deepest integration is with Flink. A team running Spark Structured Streaming discovers the story is thinner. Warning sign: an evaluation that assumed engine parity. Fix: verify integration depth for your specific engine before committing.

**Benchmarking against a fresh table.** Both candidates look great on an empty table with no maintenance history. Warning sign: benchmark duration measured in minutes. Fix: run for a day minimum, with maintenance running.

## Operational notes

**Instrument the tier boundary.** Track what fraction of queries touch only the hot tier, only the cold tier, and both. That distribution tells you whether your hot window is sized correctly, and it changes as usage patterns shift.

**Keep one schema definition driving both layers.** Schema drift between a hot tier and a table produces boundary-spanning queries that fail in confusing ways. Generate both from one source and test a spanning query in CI.

## A decision framework

Work through these in order.

**What is the actual latency requirement, in seconds, and who owns it?** If the answer is above roughly two minutes, Flink writing directly to Iceberg meets it and everything else in this article is optional complexity. This question eliminates most cases.

**How wide are your records and what fraction do consumers read?** Narrow records with full projection get little from a columnar stream. Wide records with narrow projection get a lot, and the benefit scales with the ratio.

**Do you need point lookups on the stream?** If your pipeline maintains a separate key-value store for dimension lookups, a primary-key-indexed stream removes a system. That consolidation is often worth more than the latency improvement.

**Is Flink your stream processor?** If yes, the integration depth is available to you. If no, evaluate carefully rather than assuming.

**Can you absorb incubating-project risk?** This is an organizational question, not a technical one. Some teams can run a young project in production and some cannot, and both answers are legitimate.

**What is your recovery time objective, and have you tested it?** Primary key tables recover in minutes rather than seconds. If your objective is tighter than that, either the table type or the objective has to change.

A useful shortcut: if you answered "under 30 seconds," "wide records with narrow projection," "yes to point lookups," and "Flink," the case is strong. If you answered "a few minutes is fine," the case is weak regardless of how the other answers came out.

## Where this is heading

Three things worth watching.

The streaming and lakehouse layers keep converging, and there are now several designs attacking it from different starting points. Apache Paimon brought log-structured merge trees to the table format so the table itself handles high update rates. Iceberg is adding capability on the delete and lineage side to make streaming writes cheaper for readers. Fluss puts a purpose-built storage layer in front. These are genuinely different architectures and it is too early to say which the industry settles on.

Layout alignment between the stream and the table is the technically interesting piece and the one most likely to spread. The observation that aligning partitions and buckets across both layers removes the shuffle from the conversion is not specific to any one project. Any streaming-to-lakehouse path benefits from it, and I expect the idea to show up in more places.

The catalog question is unresolved and it matters more than it appears. Historically, streaming storage and lake storage kept separate metadata, so Flink users maintained two catalogs and manually switched between them to reach one dataset or the other. Unifying that is part of the Fluss design. How it interacts with Iceberg REST catalogs and with catalogs like Apache Polaris, which are becoming the governance layer for the lakehouse, is a question I have not seen answered well. A hot tier outside your governance boundary is a real gap once anyone asks who can read what.

## Conclusion

The small-files-versus-latency tension in streaming to Iceberg is structural. Commits are atomic metadata operations, so committing often produces small files and heavy metadata, and committing rarely produces latency. No configuration resolves it.

Fluss addresses it by separating the tiers: a columnar, Arrow-based, primary-key-indexed hot tier serving recent data at sub-second latency, with a tiering service writing to Iceberg on a cadence that produces well-sized files. Aligned partitioning across both layers is what makes that conversion cheap.

What it gives up against Kafka is substantial and worth being clear-eyed about: ecosystem breadth, general-purpose transport, engine diversity beyond Flink, operational maturity, and the recovery characteristics of primary key tables. It is incubating.

The composition most organizations should evaluate keeps all three: Kafka for event transport, Fluss for the analytical hot tier, Iceberg for history. That treats them as layers rather than alternatives, which is what they are.

Before any of that, write down the latency requirement with a number and an owner. If it is above a couple of minutes, Flink into Iceberg on a sane commit interval already meets it, and the right answer is the architecture you already have.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and streaming ingestion. *Architecting an Apache Iceberg Lakehouse* from Manning covers ingestion patterns, tiering, and the file-size and maintenance decisions that determine whether a streaming table stays healthy. *Apache Iceberg: The Definitive Guide*, which I co-authored for O'Reilly, goes deeper on the commit protocol and metadata mechanics behind the latency floor described here. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
