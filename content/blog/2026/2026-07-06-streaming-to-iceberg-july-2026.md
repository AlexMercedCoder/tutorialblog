---
title: "The State of Streaming to Apache Iceberg in July 2026: Every Path, Its Latency, and What to Do When Seconds Are Not Fast Enough"
date: "2026-07-06"
canonical: https://iceberglakehouse.com/posts/streaming-to-iceberg-july-2026/
description: "Every path for streaming data into Iceberg in 2026 — Flink, Spark, Kafka Connect, broker-native, managed pipelines — with honest latency numbers and sub-second hybrid architectures."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - streaming
  - data engineering
  - lakehouse architecture
  - Kafka
  - CDC
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/streaming-to-iceberg-july-2026/).

# The State of Streaming to Apache Iceberg in July 2026: Every Path, Its Latency, and What to Do When Seconds Are Not Fast Enough

*By Alex Merced, Head of Developer Relations at Dremio*

The most common architecture question I get in 2026 is no longer "should we use Iceberg." That one is settled. The question now is "how fresh can our Iceberg tables be," followed immediately by "and what do we do when that is not fresh enough."

Those two questions deserve a serious answer, because the space has gotten crowded. Open source engines, Kafka Connect sinks, brokers that write Iceberg natively, managed vendor pipelines, and streaming databases all now claim the same job: moving events from a stream into an Iceberg table. They differ wildly in latency, cost, operational burden, and what they quietly break. Picking among them without understanding the underlying physics is how teams end up with a pipeline that technically works and a table that queries terribly.

So this article is my July 2026 map of the territory. We will start with the physics, because every option is a different negotiation with the same constraints. Then we will walk the options one by one, open source and vendor, with honest latency expectations and honest trade-offs. And we will finish with the part most articles skip: the architectural patterns for workloads where even a well-tuned Iceberg pipeline is not fast enough, and how to serve sub-second freshness without giving up the lakehouse.

As always, my goal is that the logic clicks. You should leave able to reason about any new streaming-to-Iceberg product from first principles, because new ones arrive monthly and the physics never changes.

## The Physics: Why Iceberg Has a Freshness Floor

Everything in this article follows from three facts about how Iceberg works. Get these into your head and every product claim becomes easy to evaluate.

**Fact one: data is invisible until committed.** An Iceberg table is defined by its metadata. A writer can push Parquet files to object storage all day, but no query sees a single row until a commit publishes a new snapshot that references those files. The commit is the moment of visibility. So end-to-end freshness is never just "how fast can I write data." It is "how often do I commit," plus the time the data spent buffering before the commit, plus the time a query engine takes to notice the new snapshot. Any latency number that ignores the commit cadence is marketing.

**Fact two: commits are not free.** Every commit writes new metadata, a fresh metadata file, manifest list, and manifests under the current v3 format, and performs an atomic swap through the catalog. That work takes real time against object storage, typically measured in seconds, and concurrent committers to the same table contend and retry. This creates a practical floor. Commit every second and metadata work dominates, the catalog becomes a chokepoint, and snapshot history balloons. The workable range for commit intervals today runs from a few seconds at the aggressive end to minutes at the comfortable end. This is exactly the write amplification problem that the Iceberg v4 proposals around single-file commits and adaptive metadata trees are designed to shrink, and it is worth knowing that help is coming at the format level. But you are building on v3 today, and on v3 the floor is real.

**Fact three: frequent commits create small files, and small files poison reads.** Commit every ten seconds and you produce 8,640 commits a day, each adding files sized by whatever trickled in during those ten seconds. Thousands of tiny Parquet files mean thousands of object store requests per query, bloated metadata, and planning that slows week by week. Streams with updates and deletes add delete files or deletion vectors on top. The only cure is maintenance: compaction to merge small files and snapshot expiration to trim history. Every streaming pipeline into Iceberg is therefore really two pipelines, the ingestion path and the maintenance path, and the most common failure I see in the field is deploying the first without the second. Freshness you cannot query is not freshness.

Hold those three facts and the whole vendor bake-off becomes legible. Every option below is a different answer to the same three questions: who buffers the data, who decides when to commit, and who runs the maintenance.

## The Open Source Workhorses

Start with the three options that dominate real deployments, all open source, all mature, each occupying a distinct point on the latency-versus-effort curve.

### Apache Flink: the low-latency standard

Flink is the reference answer for the lowest-latency open path into Iceberg, and it earned that position. A Flink job consumes from Kafka or another source, processes events continuously, and writes to Iceberg with commits tied to Flink's checkpoint cycle. Checkpoints align with Iceberg snapshot commits, which is what gives Flink exactly-once delivery into the table: either a checkpoint completes and its data becomes a committed snapshot, or neither happens.

Latency lands wherever you set the checkpoint interval, and in practice that means seconds. Teams commonly run 10 to 60 second checkpoints against Iceberg, with aggressive setups pushing toward the low end of that range. Between commit floor physics and checkpoint overhead, think of well-run Flink-to-Iceberg freshness as roughly ten seconds to a minute, with the aggressive end paying more maintenance tax.

Flink's second superpower is change data capture. Flink CDC connects directly to database transaction logs, and Flink writes changelog streams, inserts, updates, and deletes, into Iceberg using equality deletes for the rows it cannot cheaply locate. This makes Flink the standard tool for maintaining a near-real-time Iceberg mirror of an operational database. The cost of that convenience is the equality delete backlog, which slows reads until maintenance resolves it. The good news in 2026 is that this exact pain is getting format-level and engine-level attention: v3 deletion vectors made positional deletes cheap to read, and work is active in the community on having Flink convert equality deletes into deletion vectors closer to write time, shrinking the window where readers pay the matching tax.

The trade-offs are operational. Flink is a distributed stateful system that you must size, checkpoint, upgrade, and debug, and Flink expertise is its own hiring line. Small file pressure is high at short checkpoint intervals, so the maintenance pipeline is mandatory. Choose Flink when you need seconds-level freshness, exactly-once guarantees, CDC semantics, or in-stream transformation, and you have or can rent the operational muscle. Managed Flink offerings from Confluent, AWS, Ververica, and Decodable exist precisely for teams that want the engine without the pager duty.

### Spark Structured Streaming: the pragmatic middle

Spark Structured Streaming writes to Iceberg on a micro-batch model. You set a trigger interval, Spark accumulates data, and each trigger produces one Iceberg commit. A 60 second trigger yields 1,440 commits a day, each with reasonably sized files. Freshness lands at seconds to minutes depending on the trigger, with a minute being the comfortable default.

The case for Spark is continuity. Most data teams already run Spark for batch, already know its APIs, and already operate its clusters. Adding a streaming ingestion job is an increment, not a new platform. The trigger interval gives you a single clean dial between freshness and file health: lengthen it and files fatten, shorten it and freshness improves. Spark also brings the full transformation library to the stream, and the same job pattern serves backfills.

The case against is the latency ceiling and the cost profile. Micro-batching means Spark will not chase Flink to the aggressive end of the freshness range, and always-on streaming clusters are frequently overprovisioned, with a large share of allocated compute idling between triggers. Choose Spark when a minute of freshness is fine and your team is already a Spark team. That describes a lot of teams, which is why this path is more common in practice than the discourse suggests.

### The Iceberg Kafka Connect sink: the no-code path

The community-maintained Iceberg sink connector for Kafka Connect reads topics, buffers records, and commits to Iceberg on a configurable interval, with a control-topic mechanism coordinating commits across connector tasks so the table gets clean, consistent snapshots. It supports automatic table creation, schema evolution driven by Schema Registry, and routing records to different tables or partitions.

There is no application code. You deploy a JSON configuration into a Kafka Connect cluster, and Connect handles scaling, offsets, and fault recovery. For an organization already running a Connect estate for other sinks, adding Iceberg is an afternoon. Freshness lands in the minutes range at typical configurations, since the connector's economics favor fewer, larger commits, and that gentler commit cadence is also why its small-file pressure runs lower than aggressive Flink or Spark setups.

The trade-offs: latency is minutes, not seconds, transformation capability is limited to lightweight single-message transforms, and CDC upsert flows are less natural here than in Flink, though supported patterns exist. And if you do not already run Kafka Connect, standing up a Connect cluster just for this erases much of the simplicity argument. Choose the sink when you have Kafka, you have Connect, minutes are acceptable, and you want the pipeline nobody has to babysit.

## The Broker-Native Wave: When Kafka Itself Writes Iceberg

The most interesting structural development of the past two years is the collapse of the pipeline itself. A generation of Kafka-compatible platforms now materializes topics as Iceberg tables from inside the broker layer, no Flink job, no Connect cluster, no separate ingestion service. The pitch is "stream once, query forever," and the implementations differ in ways that matter.

Redpanda's Iceberg Topics persist topic data directly into Iceberg format from the broker, with automated housekeeping like snapshot expiration and custom partitioning. Time-to-value is excellent, since enabling a table is a topic-level switch. StreamNative's Ursa engine takes a lakehouse-native approach, storing data through a write-ahead log for ingestion and Parquet for analytics, speaking the Kafka protocol on a leaderless architecture. AutoMQ, a stateless S3-native Kafka, offers table topics with a similar promise, and pairs it with query-time federation ideas aimed at hiding the gap between not-yet-committed stream data and committed table data. Bufstream targets Protobuf-heavy shops with schema governance built in and Iceberg as the landing format.

Now the honest physics. Moving the Iceberg writer into the broker does not repeal the commit floor. These systems still buffer, still write Parquet, still commit snapshots, and the freshness of the queryable table still lands in the seconds-to-minutes range depending on configuration, typically closer to minutes at sane settings. What broker-native designs actually buy you is the removal of an entire operational tier, and that is genuinely valuable. What they can cost you shows up in the fine print. Some zero-copy designs that make Iceberg the broker's primary storage push producer latency up several fold versus classic Kafka, since produces now ride object storage economics. Some produce tables that are effectively read-only from the outside, or that lack automatic compaction and snapshot hygiene, which quietly hands the maintenance pipeline back to you. And Kafka protocol compatibility varies at the edges, transactions and compacted topics being the classic gaps, which matters if the rest of your stack assumes full Kafka semantics.

My guidance: broker-native Iceberg is the right default for append-only event streams landing in a lakehouse when you are already choosing one of these platforms for other reasons. Interrogate three things before committing: producer latency impact, who runs compaction and expiration, and whether the resulting tables are first-class citizens that any engine can maintain and evolve, or a materialized view you can only look at.

## The Managed Layer: Vendor Pipelines and Cloud Services

Above the open source and broker options sits a thick layer of managed offerings, and in 2026 this is where most net-new pipelines I encounter actually get built. A tour of the ones that come up most.

Confluent's Tableflow is the highest-profile entry: a checkbox-level feature in Confluent Cloud that materializes Kafka topics as Iceberg tables, handling schema mapping, type conversion, file sizing, compaction, and catalog publication, with Delta Lake as an alternate output and integration into Confluent's governance stack. Paired with Confluent's managed Flink for in-stream transformation, it forms a complete stream-to-lakehouse path where you never touch a cluster. The trade is the classic managed trade: meaningful cost at scale and deep attachment to one vendor's ecosystem. Freshness is in the minutes class, governed by its materialization and compaction cadence. WarpStream, under the Confluent umbrella, offers its own TableFlow with a bring-your-own-cloud model that can source from any Kafka-compatible cluster, trading some polish for openness and cost control.

On AWS, the native path got legitimately good. Kinesis Data Firehose delivers streams directly into Iceberg tables with buffering measured in tens of seconds to minutes, and S3 Tables provide Iceberg storage with built-in automatic compaction and snapshot management, which removes the maintenance pipeline that self-managed teams forget. Glue and EMR cover the Spark and Flink routes with v3 support. The result is a fully AWS-native stream-to-Iceberg story with freshness in the one-to-several-minutes class and very little to operate, at the price of AWS coupling.

Snowflake's Snowpipe Streaming writes row-level streams into Snowflake-managed Iceberg tables with seconds-to-minute visibility, and those tables remain readable by external engines through the Iceberg REST protocol, which makes it a real option when Snowflake is already your center of gravity. Databricks reaches the same destination from the Delta side of the house with UniForm and managed Iceberg support in Unity Catalog.

And a healthy ecosystem of specialist pipeline vendors, Estuary, Streamkap, Decodable, Upsolver among them, sells CDC-to-Iceberg as a product: connect a database, get a continuously maintained Iceberg table, with freshness typically in the seconds-to-low-minutes band and the equality-delete and compaction machinery handled for you. For teams whose entire streaming need is "mirror these operational databases into the lakehouse," these are often the shortest path to done.

The pattern across the managed layer: you are buying the maintenance pipeline and the on-call rotation, not a better latency floor. The physics is the same physics. Evaluate managed offerings on the completeness of their table hygiene, the portability of the tables they produce, and cost at your volume, because the freshness numbers cluster tightly across vendors.

## Honest Latency Expectations, All Options on One Page

Let me compress the tour into the summary I wish every evaluation started with. These are realistic end-to-end freshness ranges, event occurrence to queryable in Iceberg, for well-configured deployments in 2026.

Tuned Flink with aggressive checkpoints lands around 10 to 30 seconds, the fastest sustainable open path, paid for with heavy small-file maintenance. Standard Flink and aggressive Spark Structured Streaming land in the 30 seconds to 2 minutes band. Comfortable Spark, the Kafka Connect sink, broker-native table features, Tableflow-class managed materialization, and Firehose land in the 1 to 15 minute band depending on buffer and commit settings. Specialist CDC vendors mostly quote and deliver the seconds-to-low-minutes band for database mirroring. Anything promising meaningfully sub-ten-second queryable freshness in an Iceberg table today deserves your sharpest questions, because it is either redefining "queryable," serving reads from somewhere that is not yet the table, or accepting a commit cadence whose maintenance bill arrives later.

One more component of end-to-end latency that evaluations routinely forget: the read side. A committed snapshot still has to be noticed. Query engines cache table metadata, dashboards poll on intervals, and a BI tool refreshing every minute adds a minute of perceived staleness no ingestion tuning can remove. When a stakeholder says the data is slow, profile the whole path. I have watched teams shave their commit interval from 60 seconds to 15, quadrupling their file count, to fix what turned out to be a five-minute dashboard cache.

## When Seconds Are Not Enough: Architectures for the Lowest Latency

Now the question the second half of this article exists for. Some workloads genuinely need sub-second or low-single-digit-second freshness: fraud scoring, operational monitoring, user-facing analytics, inventory decisions. The commit floor means you should not try to serve those directly from an Iceberg table on object storage today. The wrong conclusion is that Iceberg does not belong in those architectures. The right conclusion is that Iceberg plays a specific position, durable, open, queryable history, and something else plays the hot position. Three patterns dominate, and choosing among them is the real design decision.

**Pattern one: the hot and cold split, unified at query time.** Recent data lives in a low-latency serving layer, historical data lives in Iceberg, and the query layer spans both. The classic build is Kafka feeding a real-time OLAP engine, Apache Pinot, StarRocks, ClickHouse, or Apache Druid, for the hot window, while the same stream lands in Iceberg for history, increasingly with the OLAP engine itself able to read the Iceberg tables directly so one query surface covers both tiers. StarTree has been public about running exactly this Kafka to Iceberg to Pinot shape, keeping Iceberg as the single source of truth while Pinot answers production queries at high concurrency. The streaming world's version of the same idea pairs a sub-second stream storage layer like Apache Fluss with table-format cold storage and automatic tiering between them. This pattern gives you genuine sub-second freshness and warehouse-scale history with one logical dataset. Its cost is running the serving layer and keeping the seam honest: the boundary between hot and cold must be defined, monitored, and invisible to queries.

**Pattern two: the streaming database in front.** Systems like RisingWave and Materialize consume streams, maintain incrementally updated materialized views with sub-second internal freshness, and sink results continuously into Iceberg tables for durability and downstream analytics. Applications needing instant answers query the streaming database's views. Everything else, ad hoc analysis, ML training, BI, reads Iceberg. This shines when the low-latency need is for derived results, aggregates, joins, feature values, rather than raw events, because you get the derivation and the serving in one system and the lakehouse gets clean, already-shaped tables. The trade is another stateful system in the critical path and view semantics to reason carefully about.

**Pattern three: stream-table federation.** Keep exactly one copy of the stream, and make the query layer union the not-yet-committed tail from the broker with the committed body from Iceberg. Broker-native platforms are pushing here, AutoMQ's query-time federation being an explicit example, and it is philosophically the cleanest answer: no second serving store, no duplicated data, the seam handled by the reader. In 2026 I classify it as promising and young. It requires the query engine and the streaming platform to cooperate closely, engine support is narrow, and the operational story under failure is less proven than the older patterns. Watch it, pilot it where the stack aligns, and be honest about its maturity.

Across all three patterns, the strategic constant is Iceberg's role: the open, engine-neutral system of record that every hot layer drains into. Hot layers are increasingly replaceable components. The table format underneath is the twenty-year decision.

## A Worked Example: One Stream, Three Builds

Abstractions settle best in a story, so let me run one concrete scenario through three different freshness requirements and watch the architecture change shape each time.

The scenario: you run data platform for a food delivery company. Order events flow through Kafka at a few thousand events per second, with a steady stream of updates as orders progress from placed to assigned to delivered to occasionally refunded. Three internal customers want this data. Finance wants daily and hourly reporting. Operations wants dashboards that track order flow by city with a freshness target of about a minute. And the dispatch team wants a live view of active orders per courier zone that must reflect reality within about a second, because humans make routing decisions from it.

**Build one: finance only.** If the minute-level and second-level customers did not exist, this is barely a streaming problem. The Iceberg Kafka Connect sink, committing every five minutes into an orders table, covers hourly reporting with enormous headroom. Files land at healthy sizes because five minutes of buffering at this volume produces real Parquet files, not confetti. A nightly compaction and weekly snapshot expiration keep the table tidy. Total new operational surface: one connector configuration and two scheduled maintenance jobs. On AWS, Firehose into S3 Tables gets the same result with the maintenance handled for you. The lesson of build one is that most streaming requirements are secretly this build, and teams that recognize it save themselves a distributed systems project.

**Build two: finance plus operations.** The minute-level dashboard changes the ingestion tier but not the philosophy. The Connect sink's comfortable cadence now sits too close to the requirement, so the pipeline moves to Flink or Spark Structured Streaming committing every 20 to 30 seconds, which lands end-to-end freshness comfortably under the minute target after you account for dashboard refresh. Because orders update as they progress, this is a CDC-shaped stream, and Flink's changelog handling makes it the natural pick, writing updates through the merge-on-read path. Now the maintenance pipeline earns its keep: compaction must run frequently enough to fold the delete backlog and merge the small files that 30 second commits produce, and you monitor commit rate, file sizes, and compaction lag as first-class health metrics. Same lakehouse, same table, roughly triple the operational attention. The dashboard reads the Iceberg table directly, and everyone is happy, including finance, who quietly benefits from fresher hourly numbers.

**Build three: all three customers.** The dispatch view breaks the pattern, and the correct response is to stop pushing the table harder. Chasing one-second freshness with one-second commits would produce 86,400 snapshots a day, a small-file blizzard, and a catalog under siege, and it would still miss the target once query-side latency is counted. Instead the architecture splits the serving, not the truth. The same Kafka stream now also feeds a hot layer: a real-time OLAP engine like Pinot or StarRocks holding the last few hours of order events with sub-second ingestion, serving the dispatch view at high concurrency, or a streaming database like RisingWave maintaining the active-orders-per-zone aggregate as an incrementally updated materialized view. The Iceberg pipeline from build two continues unchanged as the durable spine, and where the hot engine can read Iceberg directly, historical questions from the dispatch team run against the same tables everyone else uses. Iceberg remains the single source of record. The hot layer is a serving detail, chosen for the moment and replaceable without migrating history.

Three builds, one stream, one table format. The freshness requirement, stated as an honest number, was the only variable, and it alone determined whether the right answer was a connector, an engine, or an architecture.

## The Half of the System Nobody Demos: Maintenance

I have said it throughout, and it deserves its own section because it is the difference between streaming pipelines that survive and those that quietly rot.

A streaming Iceberg deployment is ingestion plus maintenance, always. The maintenance side has three standing jobs. Compaction merges the small files that frequent commits necessarily produce, and for CDC streams it also resolves delete backlogs, folding equality deletes into deletion vectors and rewriting heavily deleted files. Snapshot expiration trims the history that thousands of daily commits generate, without which metadata grows unboundedly and storage fills with unreachable files. And monitoring watches the health metrics that predict query pain before users feel it: commits per hour, average file size, compaction lag, and end-to-end freshness measured honestly from event time to queryability.

The v3 format quietly improved this picture. Deletion vectors keep read performance stable between maintenance runs in ways v2 position deletes never did, which relaxes how aggressively compaction must chase ingestion. Managed table services increasingly bundle maintenance, S3 Tables' automatic compaction being the cleanest example, and engines and platforms, Dremio among them, ship automated optimization so the maintenance pipeline is configuration rather than custom Spark jobs. And the v4 work on single-file commits aims at the root cause, making small frequent commits dramatically cheaper at the metadata layer. The trajectory across format versions is unmistakable: streaming is being promoted from tolerated workload to first-class citizen. But trajectory is not present tense. On the format you run today, schedule the maintenance before you celebrate the ingestion.

## A Decision Framework You Can Actually Use

Strip everything above down to the sequence of questions I walk teams through.

Start with the honest freshness requirement, stated as a number with a stakeholder's name attached. Most requests for "real time" dissolve under this question into "within a few minutes," which is wonderful news, because the minutes band is where the cheap, boring, reliable options live: Kafka Connect sink, Spark on a comfortable trigger, Firehose, broker-native tables, managed materialization. Pick whichever aligns with the platforms you already run, and spend the savings on maintenance and monitoring.

If the requirement genuinely lands in the seconds band, you are choosing between Flink, aggressively tuned Spark, or a specialist managed pipeline, and you are signing up for the small-file consequences. Decide who operates the engine, you or a vendor, and stand up the compaction pipeline the same week as the ingestion pipeline.

If the requirement is sub-second, stop trying to make the table do it. Choose a hot-layer pattern: real-time OLAP over the hot window with Iceberg as history, a streaming database serving derived views and sinking to Iceberg, or, where your stack aligns and your risk tolerance allows, an emerging federation design. Keep Iceberg as the system of record in every variant.

And in all three bands, ask every option the same three physics questions: who buffers, who commits and how often, and who maintains. Any product that answers all three crisply is worth evaluating. Any product that answers with a latency number and a smile is asking you to discover the answers in production.

## Questions I Hear Most Often

The same questions surface every time I present on this topic, and answering them here rounds out the map.

**Why not just commit to Iceberg every second and skip the hot layer?** Run the arithmetic and the answer states itself. One commit per second is 86,400 snapshots a day, each writing fresh metadata against object storage, each contending at the catalog, each adding files sized by one second of traffic. Within days the table carries hundreds of thousands of files, planning slows, and compaction cannot merge files as fast as ingestion mints them. You would pay warehouse prices in maintenance compute to deliver freshness the read path still cannot honor once caching is counted. The commit floor is not a product limitation to shop around. It is the current cost structure of coordinating snapshots on object storage, and the v4 work is the honest path to lowering it.

**Is the small file problem really that serious?** It is the number one operational failure mode I encounter in streaming lakehouse deployments, ahead of everything else combined. The insidious part is the timeline: the pipeline demos beautifully, the first week is fine, and the degradation compounds quietly until a month later queries take ten times longer and nobody changed anything. By then the backlog is large enough that the first compaction run is itself a heavy job. The fix is cultural as much as technical. Treat file count and average file size as service health metrics from day one, alert on them, and never sign off on an ingestion pipeline whose maintenance pipeline is a to-do item.

**Should I use equality deletes or avoid them?** Use them for what they are: a write-side deferral mechanism for streams that cannot afford to locate rows at write time, which mostly means Flink CDC. Then treat the backlog as a liability with a burn-down schedule. Reads pay for every unresolved equality delete, so the operational goal is a short half-life: frequent maintenance that resolves them into deletion vectors and rewritten files. The ecosystem is moving to shorten that half-life automatically, with active work on converting equality deletes to deletion vectors near the point of write. If your pipeline is append-only, the entire question disappears, which is one more reason to model streams as append-plus-derived-tables when the semantics allow it.

**Do I still need Kafka at all, or can sources write straight to Iceberg?** Direct writes are possible, plenty of pipelines run Spark or a vendor tool from source to table with no broker, and for pure batch-shaped flows that is fine. What the broker buys in a streaming architecture is decoupling and replay: many consumers off one stream, backpressure absorption, the ability to rebuild a table from history after a bug, and a natural feed for the hot layer patterns in this article. Notice that the industry is answering this question in an interesting way: rather than removing Kafka in favor of Iceberg, it is fusing them, with brokers that materialize Iceberg natively and tiered designs that use the table format as the broker's own cold storage. The stream and the table are becoming two temperatures of one system rather than two systems.

**How does the choice of catalog affect streaming?** More than most evaluations account for. Every commit is a catalog interaction, so a streaming table's commit rate becomes the catalog's write load, and a catalog that handles commits slowly or serializes them poorly becomes the pipeline's bottleneck regardless of engine tuning. The REST catalog protocol has become the meeting point of the ecosystem, with implementations like Apache Polaris, and the practical advice is to load-test your catalog at your intended commit rate across all streaming tables combined, not per table. Multi-table streaming estates concentrate surprising write pressure on this one small service.

**What about streaming reads from Iceberg, not just writes?** A real and useful capability that deserves its own article. Engines can consume an Iceberg table incrementally, processing new snapshots as they commit, which turns the table into a replayable, governed stream for downstream jobs. The v3 row lineage feature strengthens this by giving rows stable identity across commits, making change feeds more trustworthy. Freshness of a streaming read is bounded by the upstream commit cadence, so everything in this article about the write side sets the floor for the read side. Teams increasingly chain these: stream into a raw table, stream out of it into derived tables, with Iceberg as the durable seam between stages.

**Will Iceberg v4 change the advice in this article?** It will move the boundaries and keep the structure. Single-file commits and the adaptive metadata tree attack the commit floor directly, which should pull sustainable commit cadences down and make the seconds band cheaper to operate, and the maintenance story shifts as metadata rebalancing joins the housekeeping roster. What v4 does not change is the shape of the reasoning: visibility still arrives at commits, hot serving still wants purpose-built layers, and maintenance still balances writers against readers. When v4 lands and vendors reprice their latency claims, re-run the three physics questions and the map will redraw itself correctly.

**What is the single most common mistake you see?** Chasing a freshness number nobody actually needs. The most expensive words in streaming architecture are "real time" spoken without a number attached. Teams build Flink estates, hot layers, and compaction fleets to hit seconds when their consumers act on minutes, and the carrying cost of that gap compounds monthly. Interrogate the requirement first, with the stakeholder in the room and a specific decision or experience on the table. The best streaming architecture is the slowest one that meets the honest requirement.

## How to Evaluate the Next Entrant

One more tool before the closing, because this market is not done producing products. Roughly once a month a new offering claims to have solved streaming into Iceberg, and you will be asked to evaluate one. Here is the interrogation I run, in order.

First, ask where the data lives during the gap between arrival and commit, and who can query it there. This single question separates the honest architectures from the redefined ones. If the answer is a buffer nobody can query, the product's freshness is its commit cadence, full stop. If the answer is a queryable hot tier, you are looking at a hybrid architecture wearing a product name, which is fine, but then evaluate it as a hybrid: what engine queries the hot tier, what guarantees span the seam, and what happens to in-flight data when a node dies.

Second, ask for the commit cadence at your volume and the file sizes it produces, then ask who compacts them and on whose compute bill. Vendors quote latency at the cadence that flatters them and file health at the cadence that flatters them, and those are rarely the same cadence. Getting both numbers for one configuration tells you what you will actually run.

Third, ask whether the tables it writes are fully standard. Can Spark, Dremio, Trino, and Flink read them with no vendor library. Can an external engine run compaction and snapshot expiration, or does maintenance route exclusively through the vendor. Can you evolve the schema from outside. Tables that pass all three are assets. Tables that fail any of them are a rental with an Iceberg logo.

Fourth, ask what happens during the bad hour: a schema change upstream, a poison message, a catalog outage, a rebalance under peak load. Streaming pipelines earn their keep in the bad hour, and the maturity gap between a two-year-old product and a battle-tested one is invisible in every demo and vivid in every incident.

A product with good answers to all four is worth a pilot regardless of how new it is. A product that dodges any of them has answered anyway.

## Closing Thoughts

Streaming to Iceberg in July 2026 is a solved problem with unsolved edges. The middle of the market, minutes-fresh tables fed from Kafka or CDC, is genuinely commoditized, with a dozen good answers spanning open source and managed. The seconds band is achievable and operationally demanding, with Flink still the standard-bearer and the maintenance pipeline as the entry fee. The sub-second band belongs to hybrid architectures where Iceberg anchors history while a hot layer serves the moment, and the most interesting engineering of the next two years, in v4's commit redesign and in stream-table federation, is aimed at narrowing exactly that gap.

If you take one model from this article, take the three physics facts: nothing is visible until committed, commits have a floor, and frequent commits demand maintenance. Every product in this crowded space is a different negotiation with those three constraints, and now you can read the negotiations yourself.

If this way of working through architecture is useful to you, it is the same approach I take at book length. I co-authored Apache Iceberg: The Definitive Guide and Apache Polaris: The Definitive Guide for O'Reilly, and I have written additional titles on lakehouse architecture, data engineering, and agentic analytics, all built to take you from the mental models to running systems.

Browse the full collection of my books on data and AI at [books.alexmerced.com](https://books.alexmerced.com).
