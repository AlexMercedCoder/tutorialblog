---
title: "How Iceberg V3 Variant Shredding Changed Semi-Structured Data on S3 Tables"
date: "2026-08-04"
description: "How Iceberg V3's Variant type and Parquet shredding turn JSON columns into prunable typed columns, with real benchmark tradeoffs and a migration path."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Iceberg V3
  - Variant
  - Parquet Shredding
  - S3 Tables
  - Semi-Structured Data
canonical: "https://iceberglakehouse.com/posts/iceberg-v3-variant-shredding-s3-tables/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-v3-variant-shredding-s3-tables/).

# How Iceberg V3 Variant Shredding Changed Semi-Structured Data on S3 Tables

*By Alex Merced, Data Lakehouse and AI Evangelist*

Every data engineer has inherited the same table. It has four or five real columns and one column called `payload`, `raw`, `body`, or `event_json`. That column holds a string. Inside the string is JSON. Analysts query it with `json_extract` or `get_json_object` or whatever the engine calls the function, and every query reads the entire string for every row in every file the planner cannot rule out. A filter on one field inside that JSON reads gigabytes to return a handful of rows.

That pattern worked because nothing better existed in open table formats. Proprietary warehouses solved it years ago with internal semi-structured types that shredded JSON into columns behind the scenes. Open formats did not have an answer, so teams either flattened everything up front with brittle ETL or accepted the scan cost.

The Apache Iceberg V3 specification changed that with the Variant type, and the ecosystem has now caught up. Amazon S3 Tables added Variant support in July 2026, so you write semi-structured data like JSON directly without defining a fixed schema first. V3-compatible engines shred that data into hidden columns during the write and generate Parquet column statistics that query engines use for file pruning. This piece explains what Variant is on disk, what shredding does, how to reason about the tradeoffs, and where it breaks.

One disclosure before I start. I work for Dremio, which was acquired by SAP and now sits inside SAP Business Data Cloud. Dremio is one of the engines that reads shredded Variant data. I will name it where the architecture calls for it and leave it alone everywhere else.

## The JSON column problem that never went away

Semi-structured data is not an edge case in modern pipelines. Application logs, clickstream events, IoT telemetry, webhook payloads, and API responses all arrive as nested documents with keys that change over time. A product team ships a feature and three new fields appear in the event. Nobody files a ticket with the data team first.

Two strategies dominated before V3, and both have real costs.

The first is full flattening. You define a strict schema, write a transformation that pulls each JSON field into a typed column, and reject or quarantine anything that does not fit. Query performance is excellent because every field is a real Parquet column with statistics. The cost is operational. Every upstream schema change breaks the pipeline, and the data team becomes a bottleneck on product velocity. I have watched teams spend entire quarters maintaining flattening logic for a single event stream.

The second is the string column. You store the raw JSON and parse at read time. Ingestion never breaks. Nothing is ever lost. The cost lands on every single query forever. The engine reads the full document to answer a question about one key, and Parquet statistics are useless because the only column statistic is the min and max of an opaque string.

Some teams split the difference with a hybrid: promote the ten most-queried fields to real columns, keep the rest in a JSON string. That works until field eleven becomes important. Then you are back to a backfill.

Variant exists to give you the ingestion flexibility of the string column with something much closer to the query performance of the flattened table. It does that by changing what actually lands on disk.

## What Variant is on disk

Variant is a binary encoding, not a string. When an engine calls `parse_json()` on an incoming document, it produces two byte arrays: a metadata array and a value array.

The metadata array holds the dictionary of field names used anywhere in the document. Keys appear once in the dictionary no matter how many times they repeat across nested objects. That alone saves space on documents with repetitive structure, which describes most event payloads.

The value array holds the actual data, encoded with type tags. A number is stored as a number, not as the ASCII characters that spell it. A boolean is one byte. A nested object is a header plus a set of field ID and offset pairs pointing into the same buffer. An array is a header plus offsets. The whole thing is self-describing, which means an engine reads any field without parsing the parts it does not need.

Two properties matter for how you design around it.

Variant preserves the original document faithfully. Mixed types across rows are fine. One row has `user_id` as an integer, the next has it as a string, and both survive. Nothing is coerced, nothing is dropped, and no ingestion job fails at 3am because a client sent an unexpected type.

Variant is type-aware without being schema-bound. The engine knows that a given value is a 64-bit integer because the encoding says so. Contrast that with a JSON string, where the engine knows only that bytes exist and has to run a parser to learn anything else.

By itself, the binary encoding is a solid improvement over strings. Extraction gets faster and storage shrinks. What it does not give you on its own is file skipping. For that you need shredding.

## Shredding turns JSON paths into real Parquet columns

Shredding is the second half of the design, and it lives in the Parquet Variant Shredding specification rather than in Iceberg itself. That separation is deliberate and worth understanding, because it is why the feature works across engines.

When shredding is enabled on write, the engine looks at the documents in a batch and identifies fields that appear consistently with a consistent type. Those fields get written as genuine typed Parquet columns inside the Variant column's storage group. Anything that does not fit the shredded shape lands in a fallback binary value that preserves the rest of the document.

The result is a hybrid physical layout. A field like `payload.status_code` that shows up in ninety-nine percent of documents as an integer becomes an actual `INT32` Parquet column. A field like `payload.debug_context` that appears in two percent of documents with wildly varying shape stays in the fallback. Reading either one uses the same query syntax. The engine picks the fast path when it exists.

Real Parquet columns carry real Parquet metadata. Each column chunk gets min and max values, null counts, and distinct count estimates. Row groups get their own statistics. Those numbers are what predicate pushdown runs on.

Iceberg participates at its own level too. The V3 spec allows Variant columns to carry lower and upper bounds for fields inside the Variant, keyed by normalized JSON path expressions. Those bounds flow into Iceberg manifest files, where scan planning happens before a single data file is opened.

Chain those together and you get the behavior that makes the feature worth the trouble. A query filtering on `payload.severity = 'critical'` prunes manifests during planning, prunes files by Parquet footer statistics, and prunes row groups inside surviving files. A query that used to read four hundred gigabytes reads four.

## How the layers stack

It helps to see where each piece of the system does its job, because the vocabulary blurs together fast.

| Layer | What it stores | What it enables |
|---|---|---|
| Variant binary encoding | Dictionary of keys plus type-tagged values | Field access without full JSON parsing, faithful type preservation |
| Parquet shredding | Consistent fields promoted to typed columns, remainder in a fallback value | Column chunk statistics, row group skipping, projection pushdown per field |
| Parquet footer statistics | Min, max, null count per shredded column chunk | File-level and row-group-level pruning at scan time |
| Iceberg V3 manifest bounds | Lower and upper bounds keyed by JSON path | Manifest and file pruning during query planning, before any data file opens |
| Catalog (S3 Tables, Polaris, others) | Table metadata pointers, snapshots, permissions | Multi-engine access to the same physical layout |

The reason this stack works across vendors is that every layer is a published specification. Spark writes shredded Variant data. Trino, Dremio, DuckDB, and Snowflake read it. No engine needs to know which engine produced the file. That is the practical payoff of open formats, and it is the part that gets lost when people describe Variant as "a new data type."

## Where S3 Tables fits

Amazon S3 Tables is a managed Iceberg catalog and storage service. You create a table bucket, and AWS handles the catalog endpoint, the metadata, and background maintenance like compaction and snapshot expiration. The tables are ordinary Iceberg tables sitting in S3.

Variant support on S3 Tables matters for a specific reason. S3 Tables runs its own maintenance, which means the compaction that rewrites small files also has to understand the shredded layout. A managed service that compacted Variant columns naively destroys the shredded structure and quietly turns your fast table into a slow one. Support at the service level means the maintenance path preserves the physical layout you paid to create.

The access pattern is the standard Iceberg REST flow. Your engine authenticates, talks to the S3 Tables catalog endpoint, gets table metadata and scoped storage credentials, and reads Parquet files directly from S3. Nothing about Variant changes that shape.

Getting the engine versions right is where teams lose an afternoon. Variant requires format version 3 tables, and V2 tables cannot hold Variant columns at all. Spark support arrived with Spark 4.x, which is why EMR 8.0 is the first EMR line with native `parse_json` and `variant_get`. DuckDB needed a recent iceberg extension build rather than just a recent DuckDB. Before you plan a migration, pin the exact versions of every engine that touches the table and test a read from each one.

## A worked example

Here is the end-to-end shape using Spark, which is the most common ingestion path today. The syntax below reflects Iceberg 1.11 and Spark 4.x.

Start with the table definition. The important parts are the format version and the table property that turns shredding on.

```sql
CREATE TABLE s3_catalog.telemetry.device_events (
    event_id      BIGINT,
    device_id     STRING,
    received_at   TIMESTAMP,
    payload       VARIANT
)
USING iceberg
PARTITIONED BY (days(received_at))
TBLPROPERTIES (
    'format-version' = '3',
    'write.parquet.shred-variants' = 'true',
    'write.target-file-size-bytes' = '536870912'
);
```

`format-version = 3` is mandatory. Without it the `VARIANT` column type is rejected outright.

`write.parquet.shred-variants = true` is the switch that produces hidden typed columns. Leave it off and you get the binary encoding with none of the pruning benefit. This property is the single most consequential line in the definition, and it is off by default in most distributions.

`days(received_at)` gives you coarse partition pruning on time. Variant shredding handles pruning inside the payload. Partitioning still handles pruning across the time dimension, and the two are complementary rather than redundant.

Target file size at 512 MB is a reasonable starting point. Shredding produces more columns per file, and very small files amplify per-column metadata overhead.

Now the write path. Incoming JSON gets converted to the binary encoding with `parse_json`.

```sql
INSERT INTO s3_catalog.telemetry.device_events
SELECT
    raw.event_id,
    raw.device_id,
    CAST(raw.received_at AS TIMESTAMP),
    parse_json(raw.body)
FROM staging_kafka_landing AS raw
WHERE raw.body IS NOT NULL;
```

`parse_json` does the encoding work. It builds the metadata dictionary and the value buffer. Shredding happens after that, during the Parquet write, driven by the table property.

Reads use `variant_get` to pull typed values out by path.

```sql
SELECT
    device_id,
    variant_get(payload, '$.telemetry.battery_pct', 'int') AS battery_pct,
    variant_get(payload, '$.telemetry.firmware',    'string') AS firmware
FROM s3_catalog.telemetry.device_events
WHERE received_at >= current_date() - INTERVAL 7 DAYS
  AND variant_get(payload, '$.severity', 'string') = 'critical';
```

Two details in that query drive the performance.

The third argument to `variant_get` is the expected type. Supplying it lets the engine bind directly to the shredded column when one exists, skipping type inspection at runtime. Omit it and the engine falls back to a slower generic path.

The predicate on `$.severity` is what shredding earns its keep on. If `severity` shredded into a real column, the planner pushes that predicate down to Parquet statistics and skips files where the range excludes `critical`. If it did not shred, the predicate still returns correct results, just by reading more data.

For a quick check on what actually shredded, inspect the Parquet schema of one data file. Engines expose this differently, but every one of them has a way to print the physical schema. A file with three logical columns and several hundred physical columns tells you shredding is doing its job.

## What the numbers look like

Published benchmarks paint a consistent picture, and the shape of the tradeoff matters more than any single figure.

Independent testing on Iceberg 1.11 with Spark on EMR against S3 Tables found that shredding produced roughly 34 percent faster reads across a suite of filter and aggregation tests, while writes ran about 2.7 times slower and storage grew about 20 percent. Shredding won 20 of 21 read patterns tested. The single loss was a filter on a nested array field, which is a case shredding handles poorly for structural reasons I cover below.

Vendor benchmarks show larger gains on specific access patterns, with the biggest wins on full-object retrieval and array element access. Treat vendor numbers as directional. They are run on tuned configurations by people who want a specific answer.

The honest summary is this. Shredding trades write throughput and storage for read performance. If your table is written once and read hundreds of times, that trade is obviously correct. If you are landing a firehose that gets queried twice a week for compliance, it is not.

The storage increase surprises people. Shredding writes the typed columns and keeps a fallback value for the unshredded remainder, so there is genuine duplication in the physical layout. Compression reclaims some of it because typed columns compress far better than JSON text, and highly repetitive payloads sometimes come out smaller than the string equivalent. Measure it on your own data instead of assuming either direction.

## Failure modes

Shredding fails in specific, diagnosable ways. Knowing them in advance saves a lot of confused benchmarking.

**Arrays of objects shred poorly.** A field like `$.payload.commits` holding a variable-length array of nested objects has no fixed columnar shape. Elements land in the fallback value, and filters on paths inside those arrays read the full document. Independent testing found this was the one pattern where an unshredded table beat a shredded one, and the reason is structural rather than an implementation gap. Design around it. If you routinely filter on values inside a nested array, extract those values to a real top-level column at ingestion or explode the array into its own table.

**High-cardinality key spaces defeat the optimizer.** Some payloads use keys as data, with structures like `{"metric_a4f9": 12, "metric_b71c": 8}` where the key names come from user input. Each distinct key becomes a candidate shredded column. Thousands of sparse columns produce enormous Parquet footers, and footer parsing overhead swamps the scan savings. Reshape that data into key-value pairs before writing, or leave shredding off for that column.

**Type drift breaks the fast path silently.** A field that arrives as an integer for six months and starts arriving as a string produces two shapes in the same table. Newer files shred it one way, older files another, and some rows fall to the fallback. Queries still return correct results. Performance quietly degrades, and nothing in the query plan announces it. Monitor the ratio of shredded to fallback access if your engine exposes it, and alert on upstream schema changes.

**Nested Variant is not universally supported.** Patterns like an array of Variant or an object containing a Variant field are restricted in several implementations today. Check your engine's documentation before designing a schema that depends on it.

**Small files hurt more than they used to.** Shredded files carry more per-file metadata because they have more physical columns. A table with thousands of tiny files pays that cost repeatedly during planning. Compaction was already important on Iceberg tables. On shredded Variant tables it is closer to mandatory.

**Version mismatches produce confusing errors.** An engine that understands V3 but not the shredding spec reads the fallback and returns correct data slowly. An engine that does not understand V3 at all refuses the table. Both look like configuration problems. Test every reader against a real V3 table before committing.

## Operating a Variant table

A few practices hold up across the teams I have talked to.

**Shred selectively.** Not every Variant column deserves shredding. A column holding rarely-queried audit context is fine as plain binary Variant. Turn shredding on for the columns your analysts filter and aggregate on.

**Promote the hot paths anyway.** Shredding is not a reason to abandon schema design. If three fields inside the payload drive eighty percent of queries, extract them to real top-level columns during ingestion and keep the payload for everything else. Top-level columns partition, sort, and cluster. Shredded fields inside a Variant do not participate in partitioning at all. That distinction alone justifies the extra ingestion step.

**Separate write and read tuning.** The write penalty is real. If your ingestion path is latency-sensitive, land data into a staging table without shredding and run a scheduled job that rewrites into the shredded analytics table. Ingestion stays fast, analytics stays fast, and you pay the shredding cost once on a schedule you control.

**Keep compaction running.** Managed catalogs like S3 Tables run maintenance for you. Self-managed catalogs do not. If you run your own Iceberg tables, schedule rewrite and snapshot expiration jobs and confirm that your compaction path preserves shredding rather than silently dropping it.

**Sort within files where it pays.** Parquet statistics only prune well when values cluster. A shredded `severity` column with random distribution across files gives every file a min of `critical` and a max of `warning`, which prunes nothing. Sorting on high-selectivity shredded fields during compaction makes the statistics meaningful. This is the same lesson from ordinary columnar tuning, applied one level down.

**Validate cross-engine reads on a schedule.** The value of the open spec is that any engine reads any engine's files. That value is only real if you check it. A nightly job that reads the same table from each engine in your stack catches version drift before an analyst does.

## Migrating an existing JSON string column

Most teams reading this already have the string column in production. The migration path is straightforward and does not require downtime, but the order of operations matters.

Start by creating the V3 table alongside the existing one rather than altering in place. You cannot add a Variant column to a V2 table, and an in-place format upgrade on a large production table under active write load is a bad first move. A parallel table lets you validate before you cut over.

Backfill with a single conversion query. The source string column becomes a Variant through `parse_json`, and the shredded layout gets built during the write.

```sql
INSERT INTO s3_catalog.telemetry.device_events
SELECT
    event_id,
    device_id,
    received_at,
    parse_json(event_json)
FROM legacy.device_events_v2
WHERE received_at >= '2025-01-01';
```

Run the backfill in date ranges rather than as one job. A year of event data converted in a single Spark job produces a task set that fails at hour six and restarts from nothing. Partition-sized batches restart cheaply.

Validate before cutting over. Run your ten most expensive analyst queries against both tables and compare row counts and aggregate values, not just execution time. `parse_json` is faithful, but a query rewritten from `get_json_object` to `variant_get` introduces its own bugs, particularly around null handling and type coercion on fields with mixed types.

Dual-write during the transition. Point the ingestion pipeline at both tables for a week. That gives you a rollback that does not involve a second backfill.

Retire the old table by expiring snapshots rather than dropping it immediately. Snapshot expiration on the V2 table frees the storage on your schedule, and the table stays queryable until you are confident.

## An operational checklist

Print this and work through it before declaring a Variant table production-ready.

- Table property `format-version` is set to `3`, confirmed by reading table metadata rather than by reading your own DDL.
- `write.parquet.shred-variants` is explicitly set. Do not rely on a default.
- The physical Parquet schema of a sample data file shows more physical columns than logical columns, confirming that shredding actually ran.
- Every engine in your stack has been tested against a real V3 table with a Variant column, with exact versions recorded.
- The fields driving your top queries are either confirmed shredded or promoted to real top-level columns.
- Partitioning is defined on top-level columns, since shredded fields inside a Variant do not participate in partition pruning.
- Compaction and snapshot expiration are scheduled, or the managed catalog handles them and you have confirmed which.
- Sort order on compaction includes your high-selectivity shredded fields so that Parquet statistics prune rather than covering the full value range in every file.
- Storage footprint before and after has been measured on your own data, not estimated from a benchmark post.
- Write throughput after enabling shredding has been measured against your ingestion SLA.
- An alert exists for upstream schema changes on the source stream, since type drift degrades performance without producing errors.

## Where the engines are

Support has landed broadly since the V3 spec was ratified in June 2025, and the practical situation in 2026 looks like this.

Spark 4.x provides `parse_json` and `variant_get` natively and writes shredded output when the table property is set. It is the most common ingestion path.

DuckDB reads Variant from S3 Tables with a recent enough iceberg extension, which makes it a good tool for local validation of what actually shredded.

Snowflake shipped Iceberg v3 Variant to general availability and applies its own longstanding shredding implementation to the open Parquet layout.

Dremio reads shredded Variant on its query path and uses the physical layout transparently, which means a table written by Spark serves queries and semantic layer views without a conversion step. Since the SAP acquisition, that read path also feeds SAP Business Data Cloud, so the same physical Iceberg table backs both engineering-facing SQL and business-facing analytics without copying data.

The architectural point underneath all of that is worth stating plainly. Ingestion engine and query engine are separate choices, and they stay separate because the physical layout is a published spec rather than a vendor internal. Teams pick the writer that fits their pipeline and the reader that fits their users. Ten years ago that combination required a nightly export.

## Where this goes next

Three developments are worth watching.

Automatic shredding decisions are the obvious next step. Today the choice is a table property. A system that samples incoming documents, measures query patterns, and decides which paths to shred without human input removes the tuning burden entirely. Several vendors have signaled work in this direction, and it fits naturally into the autonomous optimization features that lakehouse platforms have been building.

Deeper statistics integration is coming. Variant field bounds in manifests exist in the spec, and implementations are still filling in coverage. Full support means better planning-time pruning for more query shapes.

Better handling of nested arrays remains open. The array-of-objects case is the biggest remaining gap, and it is common enough in real payloads that a solution meaningfully expands where the feature applies.

## Conclusion

The JSON string column was a compromise everyone accepted because open formats had no alternative. Iceberg V3 Variant plus Parquet shredding removes the compromise. You get ingestion that never breaks on a schema change and queries that prune files based on values buried inside the document.

The tradeoff is concrete rather than magical. Writes get slower, storage grows, and arrays of objects stay hard. Read performance improves substantially on the access patterns most analytics workloads actually use.

Turn on `format-version = 3`, set `write.parquet.shred-variants = true`, promote your genuinely hot fields to real top-level columns anyway, keep compaction running, and measure against your own data rather than someone's benchmark. That gets you most of the value in an afternoon.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg and lakehouse architecture. *Apache Iceberg: The Definitive Guide* covers the specification, the metadata layers, and the operational practices behind tables like the ones described here, and *Architecting an Apache Iceberg Lakehouse* works through the surrounding platform decisions. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
