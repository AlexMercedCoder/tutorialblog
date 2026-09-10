---
title: "Kafka Connect to Iceberg: How the Commit Actually Works"
date: "2026-09-10"
description: "Exactly-once semantics in the Iceberg sink connector: the coordinator, the control topic, offsets stored inside Iceberg snapshots, and where duplicates still get in."
author: "Alex Merced"
category: "Streaming"
tags:
  - Apache Kafka
  - Kafka Connect
  - Apache Iceberg
  - exactly-once
  - streaming ingestion
canonical: https://iceberglakehouse.com/posts/kafka-connect-iceberg-commits/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/kafka-connect-iceberg-commits/).

A team runs the Iceberg sink connector for six months without thinking about it. Then a Kafka Connect worker gets restarted during a deployment, and a downstream reconciliation turns up several thousand rows that exist twice. The connector documentation says exactly-once. The team's assumption was that exactly-once meant exactly once.

It nearly does, and the qualifications matter. The connector delivers exactly-once from Kafka into Iceberg through a specific mechanism involving a coordinator, a control topic, and offsets stored inside Iceberg snapshots. That mechanism has boundaries, and duplicates that enter Kafka before the connector sees them are outside all of them.

This piece is about that mechanism: how a commit is coordinated across workers, what the control topic carries, where the offsets live, which configuration settings decide your file sizes and your freshness, and the failure modes that come from the coordination rather than from the writing. Understanding the commit path is what separates a connector you operate from one that operates you. I work at Dremio, so the lakehouse enthusiasm is professional.

## The architecture, in one pass

Kafka Connect runs a cluster of worker processes, and a connector distributes tasks across them. Deployment is configuration-driven, so running one involves no code. The Iceberg sink is distributed as a zip archive built as part of the Iceberg build, in two flavors, one bundling the Hive Metastore client and dependencies and one without.

What makes the Iceberg sink different from an ordinary sink connector is that its output has to be a single atomic commit rather than a series of independent writes. Several workers are each consuming different partitions of a topic and each writing data files. An Iceberg commit is a single pointer swap. Something has to gather what every worker wrote and commit it once.

That something is a **coordinator**, and the coordination happens over a **control topic**.

**Workers write data files.** Each task consumes its assigned partitions, buffers records, and writes Parquet files into the table's location. It does not commit anything to the table.

**Workers announce what they wrote.** When a commit cycle begins, each worker publishes a message to the control topic describing the files it produced and the offsets they cover. This is metadata at file granularity, which makes the control topic low-volume even for a very high-volume source topic: one message per file rather than per record.

**The coordinator collects and commits.** One coordinator gathers the announcements, determines when every expected partition has reported, and performs a single Iceberg commit containing all the files from all the workers, with the source offsets recorded in the snapshot.

**Offsets live in the Iceberg snapshot.** This is the load-bearing design decision and the reason exactly-once works at all. The table itself records how far into the source topic its contents reach. Recovery does not depend on Kafka Connect's offset bookkeeping agreeing with what landed in the table, because the table is the record.

The sink relies on KIP-447 for exactly-once semantics, which requires Kafka 2.5 or later. That version floor is worth checking before designing around the guarantee.

## What the commit cycle looks like

Walking the cycle step by step makes the configuration choices later in this article legible.

**A cycle begins.** The coordinator initiates on an interval, which is a configuration value defaulting to five minutes.

**Workers flush.** Each task closes the files it has open, writes them out, and publishes a completion message to the control topic naming those files and the offsets they cover.

**The coordinator waits for a full set.** It reads the control topic and checks whether every source partition has reported for this cycle. There is a timeout, defaulting to thirty seconds, after which it proceeds with what it has rather than blocking forever.

**A single Iceberg commit lands.** All files from all workers, one snapshot, with offsets in the snapshot summary. Atomic: either the whole cycle is visible or none of it is.

**Offsets advance.** Offsets are stored in two consumer groups. The sink-managed group, named by the `iceberg.control.group-id` property, is the one the sink uses for exactly-once processing. The Kafka Connect managed group, named `connect-<connector name>` by default, is a fallback used only when the sink-managed group is missing.

That two-group detail is the source of a specific operational surprise: **resetting offsets requires resetting both groups.** Resetting only the Connect-managed one leaves the sink-managed group in place, the sink continues from where it was, and the reset appears to have done nothing.

Two properties follow from the design that are worth stating plainly.

**Duplicates are eliminated at the sink, not at the source.** If a producer wrote a record twice into Kafka, the connector faithfully writes it twice into Iceberg. Exactly-once here means each Kafka record lands in the table exactly once, which requires producer-side idempotency to become end-to-end exactly-once.

**Client-side retries can still introduce duplicates upstream.** The guarantee covers the infrastructure between Kafka and the table. Everything before Kafka is your producers' responsibility.

## Why offsets in the snapshot is the right design

Worth dwelling on, because it explains why this connector's guarantee is stronger than the usual sink connector's and because the same reasoning applies to any Iceberg writer.

The generic problem with exactly-once delivery into a data store is that two things have to agree: what the store contains, and what the consumer believes it has processed. Those live in different systems, and any window where one advances without the other produces either duplicates or gaps. Sink connectors typically manage this with careful ordering and idempotent writes, which works better for stores with primary keys than for append-only files.

Iceberg offers a way out that most stores do not: a commit is atomic and it carries arbitrary metadata. So the offsets can be committed *inside the same atomic operation* as the data they describe. There is no window. Either the files and the offsets both became visible or neither did.

Three consequences worth generalizing.

**The table is self-describing about its ingestion state.** Anyone with read access can answer how far into the source the table reaches, without access to Kafka or to Connect. That is useful for debugging, for auditing, and for the monitoring described earlier.

**Recovery does not require trusting external bookkeeping.** After any failure, the correct resume point is derivable from the table. External offset stores can be wrong, stale, or reset by mistake, and none of that produces data loss or duplication when the table holds the authoritative record.

**The pattern applies beyond Kafka.** Any writer with a notion of source position, whether a file cursor, a change-data-capture log sequence number, or a batch identifier, can record it in the snapshot summary and get the same property. Custom ingestion code that does this is meaningfully more recoverable than code that does not, and the change is a few lines at commit time.

That last point is the transferable lesson. If you write your own ingestion into Iceberg, put the source position in the snapshot summary. It costs almost nothing and it converts a whole category of recovery problems into a query.

## The configuration that decides your outcomes

A working configuration is short, and five settings determine nearly everything about how the connector behaves.

```properties
name=iceberg-sink-orders
connector.class=org.apache.iceberg.connect.IcebergSinkConnector
tasks.max=8
topics=orders

# Catalog connection
iceberg.catalog.type=rest
iceberg.catalog.uri=https://catalog.internal/api/catalog
iceberg.catalog.warehouse=prod_catalog

# Target table, static routing
iceberg.tables=sales.orders

# Coordination
iceberg.control.topic=control-iceberg-orders
iceberg.control.commit.interval-ms=300000
iceberg.control.commit.timeout-ms=30000
iceberg.control.group-id=cg-control-iceberg-orders
```

**`iceberg.tables` versus dynamic routing.** With `iceberg.tables.dynamic-enabled` at its default of false, you must specify `iceberg.tables`. Set it to true and you must instead specify `iceberg.tables.route-field`, naming the field in each record that holds the destination table. There is also regex-based routing, and a `route-field` mode selected by setting the dynamic flag.

**`iceberg.control.topic` must be unique per connector.** This deserves emphasis because sharing it is a documented source of trouble. A control topic reused across connectors means one coordinator reads another's completion events. A coordinator joining a fresh consumer group with `auto.offset.reset` set to earliest replays the entire control-topic history, and historical completion events can trigger commit cycles before the current ones are processed, producing snapshots whose offsets the legitimate commit then fails to validate against. Create the topic explicitly, name it after the connector, and never reuse it.

**`iceberg.control.commit.interval-ms`** is the freshness and file-size dial, discussed in its own section below. The default is five minutes.

**`iceberg.control.commit.timeout-ms`** bounds how long the coordinator waits for a full set of worker reports, defaulting to thirty seconds. Too short on a cluster with slow workers and cycles commit partially and repeatedly. Too long and a stuck worker delays every commit.

**Kafka client configuration for the control topic.** By default the connector uses the worker properties for connecting to the control topic. Where that config cannot be read, settings go in explicitly under `iceberg.kafka.*`. A transactional id prefix for the coordinator producer is configurable and defaults to empty, which matters when several connectors run on one cluster.

Two more worth knowing about. `iceberg.tables.auto-create-enabled` creates tables that do not exist, and `iceberg.tables.evolve-schema-enabled` evolves them as records change shape. Both are convenient in development and worth thinking hard about in production, since a malformed record stream that triggers automatic schema evolution changes a table's schema without review. There is also a setting to create columns as optional during creation and evolution rather than respecting the source schema's nullability, which defaults to false.

## Commit interval is a file size decision

The single most consequential tuning choice, and it is not primarily about latency.

The commit interval sets how often a snapshot lands, which sets how fresh the table is. It also sets how much data each worker accumulates before flushing, which sets the size of the files written. Those two pull in opposite directions.

Work the arithmetic. Take a topic receiving 20 MB per minute across 24 partitions, with 8 tasks.

**At a one-minute interval:** each cycle produces roughly 20 MB spread across the tasks, so files land around 2 to 3 MB each. Sixty snapshots an hour. The table is a minute fresh and it accumulates about 480 tiny files an hour, which is a compaction burden that grows faster than compaction typically runs.

**At the five-minute default:** roughly 100 MB per cycle, files in the 12 MB range, twelve snapshots an hour. Better, still small relative to a 512 MB target.

**At a fifteen-minute interval:** 300 MB per cycle, files around 37 MB, four snapshots an hour. Approaching reasonable, and the table is now fifteen minutes stale.

Three consequences follow.

**Streaming ingestion always produces small files.** No interval setting produces target-size files at moderate throughput, because the interval that gets you there is longer than anyone's freshness requirement. Compaction is not optional on a streaming table, it is part of the design.

**Snapshot count grows fast.** Twelve snapshots an hour is 288 a day and over 100,000 a year. Snapshot expiry needs to run on a cadence matched to that, and retention set in days rather than in snapshot counts. A retention policy expressed as a number of snapshots, written for a table loaded nightly, keeps about a day of history on a streaming table, which is a surprise discovered during a recovery rather than during configuration.

**More partitions means smaller files at the same interval.** Each worker writes its own files, so file size is roughly throughput divided by interval divided by writer count. A topic with 200 partitions and high task parallelism produces very small files even at a generous interval, which is an argument for fewer tasks than partitions when file size matters more than ingest parallelism.

The practical setting: start at the default five minutes, measure the resulting file size distribution from the `files` metadata table after an hour, and adjust from measurement. Then size compaction to the file production rate rather than to a calendar.
## Sizing the connector

Task and partition arithmetic decides throughput, file size, and how gracefully the thing degrades. Four numbers interact.

**Source partitions.** Fixed by the topic. This is the ceiling on parallelism, since a partition is consumed by one task.

**`tasks.max`.** How many tasks the connector runs. More tasks means more parallel consumption and more concurrent writers, which means more files per commit cycle and smaller files each.

**Worker count.** How many Kafka Connect processes the tasks spread across. Affects failure blast radius and rebalance behavior more than throughput.

**Commit interval.** Covered above, and it interacts with all three.

The relationship worth internalizing: **files per commit is roughly the number of tasks, sometimes multiplied by the number of partitions the table has.** A partitioned target table means each task writes at least one file per table partition it encounters in a cycle. A task consuming records spanning seven days of a daily-partitioned table writes seven files, not one.

That multiplication is the reason streaming ingestion into a partitioned table fragments so quickly, and it produces a specific, avoidable mistake: partitioning a streaming table more finely than the ingestion pattern warrants. An hourly-partitioned table fed by eight tasks produces at minimum eight files per hour partition per cycle, which at a five-minute interval is 96 files per hour partition per hour. Daily partitioning on the same stream produces a twelfth of that.

**The practical guidance.** Start with tasks equal to a modest fraction of partitions rather than matching them. Partition the target table coarsely relative to the ingest rate. Then measure file counts per partition after an hour and adjust, rather than reasoning about it in advance.

**Rebalances are a cost.** Adding or removing tasks triggers a rebalance, which pauses consumption. Frequent rebalances from unstable workers show up as gaps in ingestion and as unusual commit cycles, and they interact badly with coordinator stability. Stable worker capacity matters more here than elasticity, which is an argument against aggressive autoscaling on the Connect cluster itself.

## What the snapshot summary tells you

The connector records source offsets in the Iceberg snapshot, which makes the table self-describing about its ingestion state. That is worth exploiting operationally, since it answers questions Kafka Connect's own status cannot.

```sql
-- What the table itself says about its ingestion
SELECT
  committed_at,
  summary['added-data-files']   AS files,
  summary['added-records']      AS records,
  summary                       AS full_summary
FROM catalog.sales.orders.snapshots
ORDER BY committed_at DESC
LIMIT 10;
```

Three questions this answers directly.

**Is the connector actually committing, or just running?** A task in a healthy state and a table whose newest snapshot is two hours old is a stalled pipeline that every Kafka Connect dashboard reports as fine. The table is the source of truth for whether data is arriving.

**Is the commit cadence what I configured?** Gaps between `committed_at` values should track the commit interval. Consistently longer gaps mean cycles are timing out or the coordinator is behind. Irregular gaps mean instability.

**How large are the commits, and is that changing?** Records per commit rising means throughput grew. Files per commit rising faster than records means fragmentation is getting worse, which is the signal to revisit the interval or the task count.

A dashboard with those three, drawn from the table rather than from the connector, catches every stall mode I have seen described. It also survives a connector restart, a version upgrade, and a migration to a different ingestion tool, because it describes the outcome rather than the mechanism.

## Recovering from an incident

The recovery paths differ by what failed, and knowing which is which saves the wrong action.

**The connector stopped and data accumulated in Kafka.** The easy case. Restart it, and it resumes from the offsets in the sink-managed consumer group, writing everything since. Watch the first few commits, which will be large, and watch file sizes, since a catch-up cycle spanning hours of backlog writes much bigger files than steady state and occasionally spans many table partitions at once.

**The catalog was unavailable and commits failed.** Workers kept writing files that never got committed. Those files are orphans and they are not visible in the table. Recovery is automatic once the catalog returns, and cleanup of the uncommitted files is orphan cleanup's job, with its retention interval set longer than the outage duration so it does not delete files from a run still in flight.

**A bad record stream created or evolved tables incorrectly.** Auto-create and schema evolution did what they were told. Recovery involves fixing the schema, which for an added column means dropping it, and for a wrong type means a rewrite. This is why leaving both enabled in production deserves a decision rather than a default.

**Duplicates landed.** Determine where they entered first. If the same Kafka offsets appear twice in the table, that is a connector-side problem and worth reporting with the version. If the same business record appears at two different offsets, the duplicate entered Kafka and the connector behaved correctly. The snapshot summaries and the table's own offset records make this distinguishable, which is one more argument for the design that puts offsets in the snapshot.

**You need to reprocess from an earlier point.** Reset both consumer groups, and decide what happens to the data already in the table, since reprocessing appends rather than replaces. For an append-only table that means duplicates unless you delete the affected range first. For an upsert-mode table the mutations are idempotent by key, which makes reprocessing much cleaner and is a real argument for upsert mode on tables that get reprocessed.

## Fan-out, fan-in, and routing

One of the connector's strongest properties, and the reason teams pick it over alternatives.

**Fan-out** writes from one topic to multiple Iceberg tables, routed per record. **Fan-in** writes from multiple topics into one table. Both are supported, along with static routing, dynamic routing, and filtering.

The operational argument for fan-out is consolidation. A change-data-capture stream carrying records for a hundred source tables can be handled by one connector writing to a hundred Iceberg tables, rather than by a hundred separate jobs. Contrast that with stream-processing frameworks capable of exactly-once multi-table writes but not of easy fan-out across many tables and databases, where the equivalent means many jobs. One connector instance versus a hundred jobs is a large operational difference.

Three things to plan for when using fan-out.

**Commit coordination spans all target tables.** A cycle commits to every table it touched. A catalog problem on one table affects the cycle, which affects the others. That coupling is usually fine and it is worth knowing about when a single table's catalog namespace is misconfigured.

**Table creation and schema evolution multiply.** With auto-create enabled and a hundred destinations, a malformed record creates a table. Naming discipline and a route field with a constrained set of values matter more here than in a single-table setup.

**Per-table file sizes get smaller.** The throughput that produced acceptable files for one table, split across a hundred, produces very small files in each. Fan-out at scale makes compaction more important rather than less.

## Schema handling in practice

Schema is where a streaming pipeline most often surprises its owners, because the source changes without asking.

**Inference is for development.** With JSON values, schemas are inferred, and inference reflects the records it happened to see. A field absent from the first thousand records does not exist in the table. A field that is integral early and decimal later gets the early type. Both produce a table that is wrong in a way nobody notices until a query returns fewer rows than expected.

**Carry a schema with the data where you can.** A format with an embedded or registry-backed schema removes inference entirely and gives you a contract that changes deliberately. This is the single highest-value change available to a JSON-based streaming pipeline, and it belongs at the producer rather than at the sink.

**Automatic evolution is a policy decision.** Enabled, a new field in the source adds a column to the table without review. That is convenient and it means a producer-side bug can alter a table's schema. Disabled, a new field is dropped or the records fail, depending on configuration, and somebody has to make the change deliberately.

The middle path most teams land on: evolution enabled in development, disabled in production, with schema changes applied through the same review process as any other change to a table. That trades convenience for the property that no table's shape changes without a human deciding.

**Optionality deserves a decision too.** A setting controls whether columns are created as optional during creation and evolution rather than respecting the source schema's nullability, defaulting to false. Optional-everywhere is forgiving of source variation and it removes a constraint that catches real data problems. Required columns catch missing fields at write time, which is where you want to catch them.

**Column mapping handles name mismatches.** Field name mapping through Iceberg's column mapping functionality covers the case where source field names and target column names differ, which is common when the target table predates the stream.

## Upserts and deletes

The connector supports row mutations and an upsert mode, which is what makes it usable for change-data-capture rather than only for append-only event streams.

Three practical notes.

**Upsert mode produces delete files.** Every update writes a delete alongside the new row under merge-on-read semantics. Read cost grows with accumulated deletes, continuously, until something rewrites the affected data files. On a high-churn CDC stream this accumulates faster than most teams expect.

**Equality deletes carry an ongoing cost.** They are matched at read time against data files, which makes them cheap to write and expensive to read. Monitor delete file counts per partition and treat a rising count as a trigger for rewriting rather than as a background detail.

**The connector is write-only.** It writes to Iceberg and does not read from it, and Iceberg management procedures are not part of it. Compaction, expiry, and orphan cleanup run elsewhere, through Spark or another engine or a catalog-managed service. A team standing up the connector and nothing else has built half a pipeline.

## Compaction alongside a live stream

Every streaming table needs compaction, and running it against a table a connector is actively writing to has its own rules.

**Conflicts are expected and survivable.** The connector commits on its interval, compaction commits when it finishes, and the two collide when they touch the same partitions. Iceberg's optimistic concurrency handles this: whichever commits second retries against the new state. What matters is that both sides are configured to retry rather than to fail, and that neither swallows a conflict silently.

**Scope compaction away from the active partition.** The most effective mitigation. A stream writing into today's partition and a compaction job filtered to exclude the current day almost never collide, because they touch disjoint file sets. Yesterday's data is stable and it is where the fragmentation to fix lives.

```sql
-- Compact everything except the partition the stream is writing into
CALL catalog.system.rewrite_data_files(
  table => 'sales.orders',
  where => 'order_date < current_date()',
  options => map(
    'target-file-size-bytes', '536870912',
    'min-input-files', '10',
    'partial-progress.enabled', 'true',
    'partial-progress.max-commits', '20'
  )
);
```

**Partial progress matters more here than elsewhere.** A compaction run competing with a live writer has a higher chance of a failed commit at the end. Committing in batches means a conflict late in the run does not discard the whole thing.

**Watch conflict rates as a workload signal.** Rising conflicts mean the compaction filter and the ingestion pattern overlap more than intended, usually because late-arriving data is landing in partitions compaction considers stable. That is worth knowing about for reasons beyond compaction, since late arrivals affect every downstream consumer's assumptions.

**Expiry needs a cadence matched to snapshot production.** Twelve snapshots an hour is a very different retention problem from twelve a day. Set retention in time, run expiry daily, and check the snapshot count periodically rather than assuming the policy is holding.

## Failure modes worth knowing before they happen

The coordination design introduces failure modes that do not exist in a simple sink, and several are documented in the project's own issue history.

**Zombie coordinators.** A data-loss scenario has been reported with default configurations, where a coordinator fails to exit cleanly after a new one is elected, becomes a zombie holding a stale in-memory control-topic offset, and interacts badly with control topic retention and the default `auto.offset.reset`. The reported chain involves a coordinator that cannot exit because of a failure while writing to object storage, leaving it assigned no partitions while still holding stale state.

The practical protections: give the control topic generous retention rather than a short one, be deliberate about the `auto.offset.reset` setting for the control topic consumer, keep the connector version current since this is an area of active fixing, and monitor for coordinator elections as an event worth alerting on rather than a routine occurrence.

**Shared control topics.** Described earlier and worth repeating as a failure mode. Two connectors sharing a control topic produce coordinators consuming each other's completion events, replayed history triggering premature commit cycles, and offset validation failures on the legitimate commit. One control topic per connector, created explicitly, never reused.

**Backlog on the control topic degrades non-linearly.** A performance issue has been reported where the coordinator's commit-readiness check loops over all previous completion messages, making the check quadratic in the number of messages. Under normal operation the message count is bounded by workers and partitions and this is invisible. When a backlog builds, the cost rises sharply and the system degrades further, which builds more backlog.

The backlog itself typically starts elsewhere: a network problem, or a catalog that becomes unavailable so the coordinator cannot commit. So the failure sequence is a catalog blip, followed by a backlog, followed by degradation that outlasts the original problem. The protections are catalog availability, alerting on control-topic consumer lag, and keeping the connector version current.

**Offset resets that do not take.** Two consumer groups, and resetting one leaves the other authoritative. Reset both.

**Catalog unavailability stalls commits.** Workers keep writing data files and the coordinator cannot commit them. Files accumulate uncommitted, which is correct behavior and looks like a stall. When the catalog returns, a large commit lands. Two things to watch: disk or object storage accumulation during the outage, and the size of the recovery commit.

**Schema inference producing wrong types.** With JSON record values, schemas are inferred by default, and inference is not always correct or optimal. A field that is always integral in the first hour and occasionally decimal afterward creates a table with the wrong type. Supply an explicit schema for anything you care about, or use a format that carries one.

**Kafka metadata support is limited.** The transform injecting topic, partition, offset, and timestamp is experimental. Teams that want lineage back to the source record should verify what is available in their version rather than assuming.

## Multiple connectors on one cluster

Most platforms end up running several of these, and a few settings stop them from interfering.

**Distinct control topics, distinct control group ids, distinct transactional id prefixes.** The three identifiers that must not collide. The transactional id prefix for the coordinator producer defaults to empty, which is fine for one connector and a source of confusion for several.

**Separate connectors per source system, not per table.** Fan-out means one connector handles many tables from one topic or set of topics. Splitting by source system keeps the failure domain aligned with the thing that fails, since an upstream outage affects one system's tables and not everything.

**Watch aggregate load on the catalog.** Each connector commits on its own interval, and twenty connectors on five-minute intervals produce a commit somewhere every fifteen seconds. That is fine and it is worth knowing when sizing the catalog and reading its latency graphs.

**Stagger the intervals.** Twenty connectors that all started at the same time commit at the same moment, producing a periodic spike in catalog load and object storage writes. A small offset per connector spreads it, and it costs nothing.

**Name everything after the connector.** Control topic, group id, prefix, and the connector itself sharing a naming convention makes an incident tractable. Discovering during an outage that `control-iceberg` is used by three connectors is an avoidable bad afternoon.

## Monitoring

Five signals, and the first two are the ones that catch problems before users do.

**Control-topic consumer lag.** The leading indicator for the backlog spiral. Rising lag means the coordinator is falling behind, and falling behind gets worse rather than better.

**Time since last successful commit.** Not the connector's task status, which stays healthy while commits fail. The table's own snapshot timestamp compared to now is the honest freshness measure, and it comes from table metadata rather than from Kafka Connect.

```sql
-- Real freshness, from the table rather than from the connector
SELECT
  max(committed_at)                                        AS last_commit,
  current_timestamp - max(committed_at)                    AS staleness
FROM catalog.sales.orders.snapshots;
```

**Files per commit and their sizes.** The file-size distribution tells you whether the commit interval is producing a manageable table. Rising file counts per snapshot with falling average size means throughput grew and the interval no longer matches.

**Coordinator elections.** Frequent elections mean instability, and instability in this component is what the zombie coordinator scenario is built on. Rare elections are fine, repeated ones are a signal.

**Delete file accumulation, on upsert streams.** Per partition, with a threshold that triggers a rewrite.

Two alerts are enough for most deployments: staleness beyond a stated bound, and control topic lag beyond a bound. Both catch the failures that produce no errors.

## Getting the first one running

The path from nothing to a working connector, with the steps that trip people up called out.

**One: the catalog and the table.** Create the target table explicitly rather than relying on auto-create for the first run, with the schema and partitioning you want. Auto-create is convenient and it makes the first debugging session harder, because a wrong table shape looks like a connector problem.

**Two: the control topic.** Create it by hand, named for this connector, with generous retention and a small partition count. It carries one message per file, so it needs no throughput capacity, and its retention is a safety property rather than a performance one.

**Three: credentials that reach both Kafka and the catalog.** The worker needs to talk to Kafka, to the control topic, to the catalog, and to object storage. That last one is frequently forgotten, since the connector writes data files directly. Where the catalog vends credentials, the worker needs only catalog access, which is a meaningfully simpler posture and worth configuring for that reason.

**Four: a single task, a single partition, a low volume.** Prove the path end to end before scaling anything. Watch the first commit land, inspect the snapshot summary, confirm the offsets are recorded, and read the data back with a different engine.

**Five: scale tasks and measure.** Raise `tasks.max`, watch file counts per commit, and settle the interval from what you observe.

**Six: schedule the maintenance.** Compaction, expiry, orphan cleanup. Before the table has been running a week, not after somebody notices query times.

**Seven: wire the two alerts.** Table staleness and control-topic lag.

The whole sequence is an afternoon for a first connector and considerably less for subsequent ones, since steps three through seven become templates. The step that most often gets skipped is six, and the symptom arrives about a month later as a table nobody can query efficiently.

## Two things worth verifying yourself

Claims in this area are easy to accept and cheap to test, and both tests take under an hour on a development cluster.

**Verify exactly-once through a restart.** Produce a known set of records, kill a worker mid-cycle, let it recover, and compare the count and the keys in the table against what was produced. This is the guarantee everything else rests on, and confirming it in your configuration, at your version, is worth more than reading that it holds.

**Verify the file size math.** Run at realistic throughput for an hour and query the `files` metadata table for the distribution. Nearly every team is surprised by this number the first time, in the direction of files being smaller than expected, and it is the input to both the interval setting and the compaction schedule.

## Choosing between the ingestion paths

Three ways to get Kafka data into Iceberg, with the trade that actually decides it.

**Kafka Connect with the Iceberg sink.** Configuration-driven, no code, exactly-once from Kafka into the table, and fan-out across many tables and databases from one connector. Write-only, so table maintenance lives elsewhere. Best when you have many destinations and want operations rather than engineering.

**A stream processing framework.** Capable of exactly-once multi-table writes and of arbitrary transformation before the write, which the connector does not do. The limitation is fan-out convenience: covering a hundred tables typically means many jobs rather than one. Best when the pipeline needs real processing, not just delivery.

**Micro-batch from object storage.** Kafka to files, files to Iceberg on a schedule. More moving parts, more latency, and the most control over file sizes since the batch decides them. Best when freshness requirements are loose and file layout matters.

The decision heuristic: if the work is delivery rather than transformation and there are many destinations, the connector wins on operational simplicity. If records need meaningful processing before landing, a stream processor is the right tool and the fan-out cost is real. Running the connector for delivery and doing transformation downstream in the lakehouse is a common and sensible split.

## A deployment checklist

- Kafka 2.5 or later, since the exactly-once mechanism depends on it.
- One control topic per connector, created explicitly, with generous retention.
- A distinct control group id per connector.
- A transactional id prefix set when several connectors share a cluster.
- Commit interval set from measured file sizes rather than from the default.
- Commit timeout sized for your slowest worker under load.
- Auto-create and schema evolution considered deliberately rather than left on.
- Explicit schemas for anything whose types matter, rather than inference from JSON.
- Compaction, expiry, and orphan cleanup scheduled elsewhere, sized to the connector's file production rate.
- Snapshot retention set in time, matched to the snapshot production rate.
- Alerts on table staleness and control-topic lag.
- Producer-side idempotency, if end-to-end exactly-once is the actual requirement.
- Connector version current, given the active fixing in the coordination path.

## Conclusion

The Iceberg sink connector delivers exactly-once from Kafka into Iceberg through a real mechanism rather than a marketing claim: workers write files, announce them on a low-volume control topic, and a coordinator gathers a complete set and performs one atomic Iceberg commit with the source offsets recorded in the snapshot. The table knows how far into the topic it reaches, which is why recovery works without trusting external bookkeeping.

The boundaries of that guarantee are worth stating precisely. It covers Kafka to table. Duplicates produced before Kafka are yours to prevent with producer idempotency. Offsets live in two consumer groups and resetting one accomplishes nothing.

The settings that matter are few. The control topic must be unique per connector, because sharing it produces coordinators consuming each other's events and commits that fail offset validation. The commit interval is a file-size decision more than a latency one, and no setting produces target-sized files at real throughput, which makes compaction part of the design rather than an afterthought. And the failure modes that hurt come from coordination: zombie coordinators, control-topic backlog that degrades non-linearly, and a catalog blip that turns into a much longer degradation.

Set the interval from measured file sizes, give every connector its own control topic, alert on table staleness rather than task health, and schedule the maintenance the connector does not do. That covers most of the distance between a connector that works and one you can leave running.

## Keep Going

If this piece was useful, I have written a lot more on streaming ingestion and Iceberg internals. *Apache Iceberg: The Definitive Guide* covers the commit mechanics, delete files, and maintenance operations this article depends on, and *Architecting an Apache Iceberg Lakehouse* covers where streaming ingestion fits in a wider platform. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
