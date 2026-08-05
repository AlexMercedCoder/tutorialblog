---
title: "Building an Honest TCO Model for Open Lakehouses and Proprietary Warehouses"
date: "2026-08-04"
description: "An honest TCO framework for open lakehouses versus proprietary warehouses: five cost categories, measured numbers, sensitivity analysis, and where each side still wins."
author: "Alex Merced"
category: "Data Lakehouse"
tags:
  - TCO
  - Data Lakehouse
  - Data Warehouse
  - Cost Analysis
  - Apache Iceberg
canonical: "https://iceberglakehouse.com/posts/lakehouse-vs-warehouse-tco/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/lakehouse-vs-warehouse-tco/).

# Building an Honest TCO Model for Open Lakehouses and Proprietary Warehouses

*By Alex Merced, Data Lakehouse and AI Evangelist*

Someone in finance forwards the cloud data warehouse invoice with a one-line question: why is this number growing faster than our data. An architect pulls up a comparison showing object storage at a fraction of the warehouse's per-terabyte rate, and the migration proposal writes itself.

Then the migration happens and the savings come in at half of what the model promised, because the model counted storage and compute and forgot that four engineers now spend a day a week on compaction schedules, catalog upgrades, and a query engine that needs tuning nobody had to do before.

Total cost of ownership for a data platform includes everything spent storing, processing, governing, and operating it over a multi-year horizon. Headline billing metrics are one part of that, and they are the part that comparison articles stop at.

This piece gives you a framework to run the comparison for your own workload. It covers the five cost categories that matter, the parts where open lakehouses genuinely win, the parts where they genuinely lose, and what changed in 2026 that makes the old version of this argument obsolete.

A disclosure. I work for Dremio, which was acquired by SAP and now sits within SAP Business Data Cloud. Dremio sells a lakehouse query engine, so I have a stake in one side of this comparison. I have tried to write the version I want to read when I am on the other side of the table, including the sections where the lakehouse case is weaker than its advocates admit.

## Why headline comparisons mislead

The standard comparison puts a warehouse's blended per-terabyte rate next to object storage's per-gigabyte rate and declares a winner. Two structural problems make that arithmetic close to meaningless.

The architectures bundle differently. A proprietary warehouse stores data in its own internal format and typically charges a blended rate that covers storage plus a base level of maintenance, optimization, and metadata management. An open lakehouse charges object storage rates for bytes and nothing else, because the maintenance is your problem. Comparing those two numbers compares a bundled price to an unbundled one and pretends the difference is savings.

The compression basis differs. Warehouses generally bill compressed on-disk size. Your raw data volume is not the number on the invoice, and the ratio between them varies by an order of magnitude across datasets. Iceberg tables on Parquet compress well too, but the ratios are not identical and you cannot assume they are.

The result is that a comparison built on list prices produces a conclusion that survives until the first real invoice. Build the model on your own measured numbers instead.

## The five cost categories

Every honest model covers these. Skipping any one of them is where comparisons go wrong.

**Storage** is where data lives and what it costs per gigabyte per month, including any replicas, snapshots, and retained versions.

**Compute** covers query execution, ingestion, and transformation. This is usually the largest line and the one that varies most with architecture.

**Egress and movement** covers fees for moving data out of a system or between regions and clouds.

**Engineering** covers hours spent building, maintaining, and operating the platform. Convert to money at a fully loaded rate and it belongs in the model as an equal line item.

**Operational overhead** covers governance configuration, security, maintenance automation, and the tooling around them.

Write all five down for both options over a three-year horizon. A one-year model favors whichever option requires no migration, and a five-year model requires guessing at pricing changes nobody can predict.

## Storage economics

This is the category where the lakehouse advantage is real and also smaller than people expect.

Object storage list prices are public and stable. Standard tiers on the major clouds run in the low pennies per gigabyte per month, with infrequent-access and archive tiers dropping substantially below that. For 100 TB of Parquet in a standard tier, you are looking at a few thousand dollars a year.

Warehouse storage rates are higher per unit but bill against compressed size and bundle services you otherwise build yourself. The gap on storage alone rarely exceeds a few percent of total platform spend at typical volumes.

Three factors change the picture more than the headline rate.

**Retention behavior.** Object storage is cheap enough that retaining everything becomes the default. That is an advantage for analytics and a cost multiplier if nobody sets lifecycle policies. Warehouse pricing creates pressure to prune. Lakehouse pricing removes that pressure, and volume grows accordingly.

**Snapshot and version overhead.** Iceberg keeps old snapshots until expiration runs. A table under heavy update load with a ninety-day snapshot retention holds far more bytes than the current state suggests. This surprises teams on their first quarterly bill.

**Tiering.** The lakehouse can move cold partitions to cheaper storage classes while keeping them queryable, since the files are yours. That flexibility is a genuine structural advantage and one most teams never configure.

Model storage as current data volume, times a growth rate, times a snapshot overhead multiplier, split across tiers. Not as a single rate.

## Compute economics

Compute is where the money is, and the interesting comparison is structural rather than per-unit.

Warehouse compute is sold in vendor units at a vendor margin. You buy credits, slots, or warehouse-hours, and the price includes the engine, the optimizer, the storage layer integration, and the operational work of running all of it. The markup over raw infrastructure is real and is the price of not doing that work yourself.

Lakehouse compute has two shapes. Managed engines resell infrastructure with a margin, at a smaller multiple than a full warehouse because less is bundled. Self-managed engines on your own instances cost close to infrastructure price plus the engineering to run them.

The separation of storage and compute is the structural argument, and it is worth stating precisely. It does not mean compute is cheaper per unit. It means you buy compute independently of storage, run several engines against one copy of the data, and scale each workload to what it needs.

That matters most for mixed workloads. A machine learning pipeline reading training data, a BI tool serving dashboards, and an ingestion job writing continuously have different resource profiles. Under one warehouse, they share a pricing model built around SQL analytics. Under a lakehouse, each uses an engine sized for it against the same files.

The cost trap is idle and over-provisioned compute. Warehouse pricing with automatic suspension bills close to zero when nobody queries. A self-managed cluster left running bills whether or not anyone uses it. I have seen lakehouse migrations that increased compute spend because a cluster that used to auto-suspend now runs continuously.

Model compute as workload-hours by workload type, at the price of the engine that will serve it, plus an explicit idle assumption.

## Egress and movement

The category everyone forgets until the invoice.

Cross-region reads charge per byte. Cross-cloud reads charge more. A lakehouse where storage sits in one region and a query engine in another pays egress on every scan, forever, and no amount of query tuning removes it.

Warehouses hide this inside their bundled pricing when everything lives in their environment, and expose it sharply when you export data out. That asymmetry is intentional and worth naming: the architecture that makes reading cheap inside the platform makes leaving expensive.

Federation patterns add movement too. A federated query that fails to push down a filter moves the whole table across a boundary. That is an egress line item generated by a query planning decision, which is not where most cost models look.

Model egress as bytes crossing each boundary per month, at the published rate for that boundary. Then check the number against actual billing data, because the estimate is always low.

## Engineering and operational cost

This is where the lakehouse case is weakest, and pretending otherwise is how migrations disappoint.

A lakehouse requires expertise in table formats, partitioning strategy, file compaction, snapshot expiration, and metadata management. Those are real skills, they are not free, and the work does not end after setup. It is ongoing operational load.

The specific recurring jobs on an Iceberg lakehouse include compaction of small files, snapshot expiration, orphan file cleanup, manifest rewriting, and sort order maintenance. Managed catalogs and platforms handle some of this. Self-managed deployments handle all of it.

A warehouse does this work invisibly and bills for it in the compute and storage rates. That is the bundle. Whether the bundle is expensive depends entirely on what your engineers cost and what else they do with that time.

Run the arithmetic honestly. Two engineers at a fully loaded cost, spending a quarter of their time on platform maintenance, is a six-figure annual line item. That number belongs next to the compute savings, not in a footnote.

There is a scale threshold here. Below a certain data volume and query concurrency, the engineering cost of running an open lakehouse exceeds the compute markup you avoid. Above it, the markup dominates and the lakehouse wins on total cost. Where that threshold sits depends on your team, but it is real and it is higher than lakehouse advocates usually suggest.

Published estimates of lakehouse consolidation savings cluster in the thirty to sixty percent range, with Mordor Intelligence reporting thirty-five to forty percent total-cost savings among large enterprises that consolidated onto lakehouse architectures. Those figures come from organizations at the scale where the threshold has been crossed and where consolidation eliminated duplicate copies across separate systems. Treat them as evidence that the ceiling is high, not as a forecast for your own estate.

## A worked model

Here is the structure for a 100 TB comparison. Substitute your own measured numbers for every figure.

| Cost category | Proprietary warehouse | Open lakehouse | Notes |
|---|---|---|---|
| Storage | Blended rate on compressed size | Object storage rate on Parquet, plus snapshot overhead | Measure your actual compression, do not assume parity |
| Query compute | Vendor credits or slots | Engine pricing or instance cost | Model by workload, include idle |
| Ingestion compute | Vendor units | Separate engine or service | Streaming ingest often cheaper outside a warehouse |
| Transformation compute | Vendor units | Spark or engine of choice | This is where multi-engine flexibility pays |
| Egress | Low internally, high on export | Per boundary crossed | Check region alignment first |
| Catalog and governance | Bundled | Catalog service plus policy engine | Managed catalogs narrow this gap |
| Table maintenance | Bundled, invisible | Compute for compaction and expiration, plus engineering time | The line item most models omit |
| Platform engineering | Lower | Higher | Convert hours to money at a loaded rate |
| Migration cost | Zero if staying | One-time, real, usually underestimated | Amortize over the model horizon |
| Exit cost | High, format is proprietary | Low, files are yours | Rarely modeled and strategically important |

Work it as a spreadsheet with three years of columns and a growth assumption on volume and query count. Two outputs matter: the crossover month where cumulative lakehouse spend drops below cumulative warehouse spend, and the sensitivity of that date to your engineering cost assumption.

If the crossover lands past your model horizon, do not migrate for cost reasons. There are other good reasons to migrate. Cost is not one of them in that case.

## Measuring your own numbers first

Every figure in the model should come from your systems rather than from a pricing page. Here is how to get them.

Start with actual stored bytes on the lakehouse side, including the snapshot overhead that surprises people.

```sql
SELECT
    ROUND(SUM(file_size_in_bytes) / 1099511627776.0, 2) AS current_tb,
    COUNT(*)                                            AS file_count,
    ROUND(AVG(file_size_in_bytes) / 1048576.0, 1)       AS avg_file_mb
FROM prod.sales.orders.files;
```

That gives you the current snapshot. Now compare it against everything storage is actually holding, which includes files from older snapshots that expiration has not removed yet.

```sql
SELECT
    COUNT(DISTINCT snapshot_id)                          AS retained_snapshots,
    MIN(committed_at)                                    AS oldest_retained,
    ROUND(SUM(CAST(summary['total-files-size'] AS DOUBLE))
          / 1099511627776.0, 2)                          AS sum_across_snapshots
FROM prod.sales.orders.snapshots;
```

The ratio between what the current snapshot holds and what storage is billing you for is your snapshot overhead multiplier. On tables under heavy update load with long retention, that multiplier reaches two or three. Apply it in the model rather than assuming one.

Next, get compression reality rather than assumption.

```sql
SELECT
    ROUND(SUM(file_size_in_bytes) / 1099511627776.0, 3)  AS compressed_tb,
    SUM(record_count)                                    AS rows_stored,
    ROUND(SUM(file_size_in_bytes)
          / NULLIF(SUM(record_count), 0), 1)             AS bytes_per_row
FROM prod.sales.orders.files;
```

Bytes per row is the portable number. Multiply it by projected row growth to forecast storage, and compare it against the same number on the warehouse side. Warehouses that bill compressed size have their own ratio, and it is often better on wide, repetitive tables and worse on tables full of high-cardinality strings.

For compute, pull query history from both systems over the same window and bucket by workload rather than by user. Warehouse consoles expose credit or slot consumption per query. Lakehouse engines expose CPU-seconds or executor-seconds in job history. Convert both to money at the rate you actually pay, including any committed-use discount you already hold.

The bucket that matters most is transformation. It usually consumes more than analytics and it is the workload with the most engine flexibility, which makes it the largest single source of modeled savings.

Then measure idle. Take the total hours your compute existed and subtract the hours it was doing work. A warehouse with auto-suspend has near-zero idle cost by construction. A lakehouse cluster sized for peak and left running has an idle percentage that often exceeds fifty. This one number moves crossover dates by quarters.

Finally, measure engineering time honestly. Pull the last two quarters of tickets, pull requests, and incidents tagged to platform work, count the hours, and multiply by a fully loaded rate. Do not estimate this from memory. Every team I have asked has guessed low by a factor of two.

## Sensitivity is more useful than a point estimate

A TCO model that produces one number invites an argument about that number. A model that produces a range with named drivers produces a decision.

Build three scenarios rather than one.

The **conservative** case assumes engineering time at the high end of your measurement, idle compute at current levels, no lifecycle tiering, and no reduction in duplicate copies. This is what happens if you migrate and change nothing else about how you operate.

The **expected** case assumes engineering time stays flat, idle drops to a reasonable target through autoscaling, cold data moves to a cheaper tier, and one duplicate copy gets eliminated.

The **optimistic** case assumes the consolidation actually happens: several duplicate pipelines retired, transformation moved to the cheapest suitable engine, and cold data aggressively tiered.

Then test which single assumption moves the answer most. In nearly every model I have built, it is one of two: the fully loaded engineering hours, or the number of duplicate data copies eliminated. Compute rates rarely dominate, which is counterintuitive because compute rates are what the comparison articles argue about.

That result has a practical implication. If your migration plan does not include retiring specific pipelines and copies by name, the optimistic case is not available to you, and you should model the conservative one.

## The costs that never make it into models

Five line items get omitted almost universally. Each one is real money.

**Dual running.** During migration you pay for both platforms. A migration planned for six months and delivered in fourteen pays fourteen months of double platform cost. Model the overlap at your realistic timeline, not your planned one.

**Query rewriting.** SQL written against one engine's dialect, functions, and performance characteristics does not move unchanged. Someone rewrites it, someone else validates the results match, and both of those are engineering hours against a deadline.

**Retraining and hiring.** Table format expertise, partitioning strategy, and compaction tuning are skills your team does not necessarily have today. Either you train people, which costs time, or you hire, which costs more and takes longer than the plan assumes.

**Tooling replacement.** BI connectors, data quality frameworks, orchestration integrations, and lineage tools all have platform-specific pieces. Inventory them before the model is final. There is usually one tool with no equivalent on the other side, and finding it late is expensive.

**Governance rebuild.** Permissions, masking rules, and audit configuration accumulated over years in the source platform. They do not export. Rebuilding them deliberately is the right call and it is a project, not a task.

Add these five and the crossover date moves later, often by a year. A model that shows the lakehouse winning even after including them is a model you can defend in front of someone whose job is to find the holes in it. A model that only wins by leaving them out is a model that gets you approval and then a difficult conversation eighteen months later.

## Presenting the result

The audience for this model is rarely other data engineers, and the presentation determines whether it survives contact with a finance review.

Lead with the crossover month and the assumption it is most sensitive to. One sentence: cumulative cost crosses in month nineteen, and that date moves to month twenty-eight if platform engineering time comes in at the high end of our estimate.

Show three years of cumulative cost as a chart rather than a table of annual totals. The shape communicates the migration hump and the payback, which annual totals hide.

Separate one-time costs from recurring costs visibly. Finance treats them differently, and a model that blends them invites the objection that you have padded the recurring case.

State the exit cost qualitatively rather than pretending to a number. A sentence about what leaving each platform requires is more credible than a fabricated figure, and it lands the strategic point without inviting an argument about methodology.

Name what has to be true for the savings to materialize. If the case depends on retiring four pipelines and consolidating two copies, those become commitments with owners rather than assumptions in a spreadsheet.

## Lock-in as a cost line

Exit cost belongs in the model even though nobody bills for it monthly.

A proprietary warehouse stores data in an internal format. Snowflake uses micro-partitions, BigQuery uses Capacitor. The engine and the format are closed, and the data is computationally expensive to use anywhere else. Leaving means an export and a re-ingest at full data volume, plus rewriting every pipeline and every piece of SQL that depends on vendor-specific behavior.

An open lakehouse stores Parquet files described by Iceberg metadata in your own object storage. Changing query engines means pointing a different engine at the same catalog. The switching cost is a configuration change and a testing cycle, not a data migration.

That difference has a price even if you never exercise it, because it changes your negotiating position at renewal. A vendor whose customer can leave in a month prices differently than one whose customer cannot leave at all. Quantifying this is uncomfortable and approximate, and leaving it out of the model entirely assigns it a value of zero, which is definitely wrong.

## What changed in 2026

The version of this argument from a few years ago is out of date, and using it makes you look uninformed in front of anyone who has been paying attention.

The warehouses opened up. Every major warehouse engine now reads Iceberg tables in customer-owned object storage, and all of them write it in some form. Snowflake's managed Iceberg tables are generally available with full DML. BigQuery's arrived with catalog integration. Redshift shipped append-only Iceberg writes in late 2025. A warehouse whose tables are open files in your own buckets is not the closed silo the original lakehouse argument targeted.

The lakehouses grew warehouse manners. Dedicated SQL engines over lake storage now ship serverless compute, cost-based optimizers, workload isolation, and catalog-level governance with lineage and audit. Choosing a lakehouse no longer means giving up warehouse ergonomics.

The consequence for your TCO model is that the storage format is no longer where the difference lives. Both sides can put open files in your bucket. What remains is a narrower and more practical question: which engine, whose catalog, and what workload mix.

The catalog is where lock-in now sits. A catalog that only one vendor's engines can read reproduces the old problem one layer up, with open files underneath that nothing else can find or govern. When you model exit cost, model catalog exit cost specifically. That is the question that determines whether your open files are actually portable.

## Where each side still wins

Honest guidance rather than a verdict.

The warehouse wins on BI-heavy, high-concurrency, governance-mature workloads with a stable query pattern and a small platform team. The bundle is worth paying for when your engineers have better things to do and your workload fits what the bundle optimizes.

The warehouse wins below the scale threshold. A 20 TB estate with three analysts does not generate enough compute spend for the markup to matter, and the operational load of an open lakehouse is a bad trade.

The lakehouse wins on mixed SQL and machine learning workloads over one copy of data. Every duplicate copy you eliminate removes storage, pipeline compute, and a synchronization failure mode at once. The consolidation savings figures cited earlier come mostly from this.

The lakehouse wins when several engines need the same data. Once you have three consumers, paying a warehouse to export to two of them costs more than serving all three from one set of files.

The lakehouse wins on regulated and on-premises deployments, where object storage and self-hosted engines run in environments a cloud warehouse cannot reach at all. Engines with on-premises deployment options, Dremio among them, exist because this requirement does not go away and cloud-only platforms cannot serve it.

The common arrangement in 2026 is not one or the other. It is a lakehouse as the system of record with a warehouse serving specific reporting marts, both reading open tables. Model that shape too, since it often beats either pure option.

The hybrid has one cost that pure architectures avoid, and it belongs in the model: you operate two platforms and pay two sets of governance and monitoring overhead. It wins when the workload split is genuine and loses when it is really one workload that nobody wanted to migrate. Be honest about which one you have.

## Conclusion

Build the model on five categories, not two, and build it on numbers you measured rather than numbers you read. Storage, compute, egress, engineering, and operational overhead, over three years, with your own measured numbers.

Expect the storage advantage to be smaller than the marketing suggests, the compute advantage to be real but dependent on workload mix, and the engineering cost to be the line that decides the answer. Include exit cost even though it is uncomfortable to estimate.

Then check whether the question you are asking is still the right one. The format war ended. Warehouses read and write open tables, lakehouses ship real SQL engines, and one copy of data in object storage serving several engines is the shape both sides converged on. The live question is which engine, whose catalog, and what workload mix, and the catalog is where the next generation of lock-in is being built.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and the decisions around it. *Architecting an Apache Iceberg Lakehouse* covers platform design, cost structure, and the operational work that TCO models tend to omit, and *Apache Iceberg: The Definitive Guide* covers the format underneath. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
