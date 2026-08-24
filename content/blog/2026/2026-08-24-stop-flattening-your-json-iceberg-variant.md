---
title: "Stop Flattening Your JSON: How Iceberg Variant Changes Semi-Structured Analytics"
date: "2026-08-24"
description: "Iceberg Variant stores JSON as navigable binary with shredding for columnar filters. Why flattening wide tables is no longer the only performance path."
author: "Alex Merced"
category: "Apache Iceberg"
canonical: https://iceberglakehouse.com/posts/stop-flattening-your-json-iceberg-variant/
tags:
  - Apache Iceberg
  - Variant
  - JSON
  - semi-structured
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/stop-flattening-your-json-iceberg-variant/).

Somewhere in your company there is a table with a column named `payload`, `properties`, `raw_event`, or `extra`, and inside it lives JSON stored as a string. Every query that touches it parses text, row by row, to pull out two or three fields. Someone once proposed flattening it into real columns, and the project died when the count came back at 400 columns, half of them null, with new fields arriving weekly. So the string column stayed, the parsing tax stayed, and everyone learned not to filter on anything inside it.

Apache Iceberg v3 ships the type that retires that column. Variant stores semi-structured data in a compact binary encoding that engines navigate without parsing, and an optimization called shredding pulls frequently occurring fields into real columnar storage with real statistics, so filters on JSON paths prune files the same way filters on normal columns do. The flexibility of JSON and the performance of columns stop being a trade-off.

This article explains the mechanism from the bottom up: the binary encoding, the shredding layout inside Parquet, the statistics path that makes pruning work, the SQL you write, what breaks, and where engine support honestly stands in August 2026. A disclosure before we start: I work at Dremio, which shipped Variant support including shredding in its Iceberg v3 rollout, and I co-authored the O'Reilly books on Apache Iceberg and Apache Polaris. Everything below is about the open specifications, which live in the Apache Parquet and Apache Iceberg projects and belong to no vendor.

## The Three Bad Options We Lived With

To appreciate what Variant fixes, catalog the workarounds it replaces. Each one trades away something you wanted.

Option one: JSON as a string. This is the default because it requires no decisions. Ingestion writes whatever arrives, schema drift never breaks a pipeline, and everything works until someone queries it. Then the costs land. The engine parses text on every row for every query, and JSON parsing is CPU-heavy work that scales with document size, not with how much of the document you need. Extracting one field from a 4 KB document costs nearly as much as extracting all of it. There is no pushdown, because the engine cannot know what is inside a string without reading and parsing it, so every query scans every file, every row group, every row. Field names repeat in full on every single row, which compresses poorly compared to columnar layouts. And types vanish: the number 42 and the string "42" look different in JSON text, but nothing at the storage layer helps an engine use that, so type errors surface at query time in the least helpful ways.

Option two: flatten everything into wide tables. Extract every field into its own typed column. Now you have pushdown, statistics, and compression, and you also have a table with hundreds or thousands of columns, most of them null for most rows, because event type A has fields event type B lacks. Every new field is a schema change, which means a migration, which means coordination between the producing team and the data team, which means the schema lags reality by weeks. Nested objects and arrays force choices between exploding rows and concatenating keys into column names like `device_settings_display_brightness_level`. The flattening pipeline itself becomes load-bearing infrastructure that breaks when upstream developers rename a field on a Friday.

Option three: STRUCT and MAP columns. Iceberg has always had proper nested types, and they are the right answer when structure is known and stable. A STRUCT gives you typed, named fields with statistics and pruning. But a STRUCT is a schema commitment. Fields not in the struct cannot be stored, so the "and sometimes there are extra keys" reality of event data does not fit. MAP goes the other direction: arbitrary keys, but one value type for the whole map, so mixed-type payloads degrade to MAP of string to string, and you are back to parsing values out of text, now with worse ergonomics. Neither type handles the honest shape of telemetry, logs, and API responses, which is "mostly consistent, occasionally surprising, always growing."

Every data team I talk to runs some blend of these three, usually a string column for raw data plus a flattening job for the fields analysts scream about most. Variant exists because that blend is expensive to run and worse to govern.

## What Variant Actually Is

Variant is a new type in the Iceberg v3 table specification for values whose structure varies from row to row. The spec is careful about its category: Variant is neither a primitive type nor a nested type, it is a semi-structured type, a third kind. A Variant value holds anything from a single integer to a deeply nested object of arrays of objects, and two rows in the same column owe each other no structural consistency.

Two design decisions define it, and both were choices to standardize rather than invent.

First, the type system is wider than JSON. JSON gives you strings, numbers, booleans, nulls, objects, and arrays, and that number type is famously ambiguous. Variant's primitive set includes proper integers of several widths, floats, doubles, decimals, dates, timestamps with and without time zone, binary, and strings. When a timestamp arrives in your events, it gets stored as a timestamp, compared as a timestamp, and pruned as a timestamp, not round-tripped through string formatting. Every value carries a type tag, so an engine knows 42 is an integer and "42" is a string without parsing anything, and type-checking functions work directly against the tags.

Second, and this is the decision that matters most for the ecosystem, the binary encoding is defined in the Apache Parquet project, not in Iceberg. Iceberg v3 adopted the Parquet community's Variant encoding and shredding specifications instead of writing its own. The encoding was ratified in the Parquet community in the fall of 2025, with the Parquet project announcing native support in February 2026, and the same encoding is used by Delta Lake and Apache Spark. One physical representation across formats and engines means a Variant value written by Spark into an Iceberg table is the same bytes a different engine reads, with no translation layer and no vendor-specific dialect at the file level. In an ecosystem that spent years fighting table format fragmentation, getting the semi-structured encoding standardized in one place, below all the table formats, was the right call.

The encoding itself splits every Variant value into two parts: a metadata section and a value section. The metadata section is a dictionary of field names. Consider event documents with fields like `user_id`, `event_type`, and `timestamp`. As JSON text, those names spell out in full on every row, millions of times. In the Variant encoding, names live once in the dictionary and the value section refers to them by small integer indexes. The value section encodes the actual data with type tags and offsets, laid out so a reader navigates directly to a requested path, jumping by offset rather than scanning, and decodes only the values it needs. Extracting one field from a large document stops costing what a full parse costs. That property, offset navigation instead of parsing, is the difference between a storage format and a serialization format, and it holds even before any shredding happens.

## A Worked Example of the Encoding

Abstract descriptions of encodings slide off the brain, so walk one small document through it. Take this event:

```json
{ "user_id": 42, "event_type": "click", "device": { "os": "android" } }
```

As UTF-8 text, that document costs 68 bytes, and 40 of them are field names and punctuation. Stored a million times, the names alone cost tens of megabytes before compression, and every read pays a full tokenize-and-parse to find anything.

The Variant encoding splits it. The metadata section builds a sorted dictionary of the distinct field names in the value: `device`, `event_type`, `os`, `user_id`, each stored once, referenced by index. The value section then encodes the structure: an object header saying "object with three fields," followed by compact entries pairing a dictionary index with an offset to that field's value. Each value carries a type tag and its data: `user_id` tags as an integer and stores the number 42 in binary, `event_type` tags as a string with its length and bytes, `device` tags as a nested object whose own entries follow the same pattern one level down.

Now watch a read of `$.device.os`. The reader consults the object header, binary-searches the field entries for the dictionary index of `device`, jumps by offset directly to the nested object, repeats for `os`, checks the type tag, and returns the string. It touched the header, two field entries, and one value. It never examined `user_id` or `event_type`, never validated punctuation, never allocated a parsed document tree. The work is proportional to the path depth, not the document size, and on wide documents that proportionality is the whole ballgame. A 6 KB document with 200 fields costs the same three jumps for that path as this toy did.

The dictionary also explains a compression behavior that surprises people pleasantly. Because field names live once per value, and Parquet applies its own page compression on top, tables converted from JSON strings to unshredded Variant routinely shrink, sometimes substantially, before any shredding enters the picture. Storage savings were not the headline goal, but they show up on the bill.

Two encoding details worth knowing because they surface in migrations. Duplicate keys, which JSON text tolerates and most parsers resolve last-wins, get resolved at encoding time, so a document that relied on duplicate-key trickery changes meaning when converted. And because values carry real types, the encoder makes typing decisions for JSON numbers, integer versus decimal versus double, which is almost always what you want and occasionally worth checking at precision boundaries. Both are reasons the migration section later insists on validation.

## Choosing Among JSON Strings, STRUCT, MAP, and Variant

With the mechanism on the table, the comparison becomes concrete. Here is how the five approaches stack up on the dimensions that decide real designs:

| Dimension | JSON string | Wide/flattened | STRUCT | MAP | Variant | Shredded Variant |
|---|---|---|---|---|---|---|
| Schema flexibility | Total | None | None | Keys only | Total | Total |
| New fields need schema change | No | Yes | Yes | No | No | No |
| Typed values | No | Yes | Yes | One type | Yes, tagged | Yes, columnar |
| Field access cost | Full parse | Column read | Column read | Map probe | Offset jump | Column read |
| File/row-group pruning on fields | No | Yes | Yes | No | Partial, via field bounds | Yes, via column stats |
| Compression of names | Poor | N/A | N/A | Poor | Dictionary | Dictionary |
| Handles mixed types per field | Yes, badly | No | No | No | Yes | Yes, residual |
| Nested objects and arrays | Yes | Painful | Fixed shape | No | Yes | Yes |

Read the columns left to right and the story is a staircase. JSON strings maximize flexibility and pay for it everywhere else. Flattening and STRUCT maximize performance and pay in rigidity. MAP is the awkward middle nobody loves. Variant keeps the full flexibility while fixing typed access and field-level navigation. Shredded Variant then recovers the columnar performance that flattening promised, without the schema rigidity that killed the flattening project.

The decision rule I give teams is short. If the structure is fully known, stable, and always present, use real columns or a STRUCT, because a schema you can commit to is still the best contract in data engineering. If keys vary but every value is genuinely one type, MAP remains fine. For everything else, the logs, the events, the API responses, the payloads that grow a field every sprint, Variant is now the answer, and the string column is legacy.

One more distinction worth drawing. Variant is not "JSON support." JSON is one ingestion format for it. The type stores decimals, timestamps, and binary that JSON text cannot faithfully represent, and engines are adding ingestion paths from CSV and XML into Variant as well. Think of it as a typed, navigable container for irregular data, with JSON as the most common on-ramp.

## Shredding: Where the Performance Comes From

The binary encoding fixes parsing. Shredding fixes scanning, and shredding is where Variant earns its place in an analytics format rather than just a storage format.

Here is the layout. Inside Parquet, a Variant column is written as a group of fields, not a single blob. The group holds a binary `metadata` field carrying the field-name dictionary, a binary `value` field capable of holding the full variant, and a `typed_value` group. At write time, the writer analyzes the incoming variant data and selects fields to shred: fields that occur frequently and hold consistent types. Each selected field becomes a real, typed Parquet column inside the `typed_value` group, following the Parquet shredding specification's pattern of paired value and typed value entries at each level. A shredded `user_id` that is consistently an integer becomes an actual int64 Parquet column, with everything that entails: dictionary and run-length encoding, page compression, and column statistics.

What does not fit the shred schema does not get lost. Fields with inconsistent types, rare fields, and structural surprises stay in the residual `value` binary for that row. This is the design's quiet genius: shredding is an optimization layer, not a schema contract. A row whose `user_id` arrived as a string that one time lands in the residual, the query still returns it correctly, and the columnar fast path keeps working for the millions of rows that behaved. Correctness never depends on the shredder's choices. Only speed does.

At read time, the engine prunes inside the group. A query extracting `$.event_type` reads the `metadata` field, the residual `value` field, and only the `typed_value` sub-column for `event_type`, skipping every other shredded column. A filter on a shredded field pushes down to that Parquet column's statistics and encodings exactly as a filter on a normal column does. Row groups whose `event_type` bounds exclude `'click'` never decompress. Files whose bounds exclude it never open. The wide-table performance model, reconstructed automatically under a column that still accepts anything.

The write-time cost is real and worth stating plainly. Shredding is analysis plus extra columns, and experiments published by practitioners this spring measured meaningful append-time overhead when shredding is enabled, with the exact penalty depending on document shape, field consistency, and how many fields shred. You are spending write CPU to buy read performance, which is the correct trade for analytics tables read hundreds of times per write, and the wrong trade for an archive nobody queries. Know which one you are building.

How much read performance? The Parquet and engine communities have published numbers in the same range my own testing suggests: shredded reads landing several times faster than unshredded Variant, and an order of magnitude or more faster than JSON strings, with the biggest wins on filter-heavy queries where pruning eliminates most of the scan. Databricks reported roughly 8x over unshredded Variant and 30x over strings in its announcement of the ratified standard. Treat all such numbers as shapes rather than promises, run your own workload, and expect the gap to widen as your filters get more selective, because selectivity is exactly what statistics-based pruning converts into skipped work.

## The Statistics Path: How a JSON Filter Skips Files

The piece that makes shredding matter for a table format, rather than just a file format, is what happens above Parquet. Iceberg's planning power comes from statistics flowing up the metadata tree: file stats live in manifests, manifest stats summarize partitions, and engines prune at each level before touching data. Variant plugs into that tree.

The v3 specification allows Variant columns to carry lower and upper bounds for fields within the variant, keyed by normalized JSON path expressions. A manifest entry for a data file can record that, within this file, `$.event_type` ranges from `'click'` to `'view'` and `$.amount` from 4 to 9750. Scan planning matches query predicates on those paths against the recorded bounds, and files that cannot contain matches drop out of the plan before any Parquet footer is read. The same pruning logic that makes Iceberg fast on structured columns now operates on paths inside semi-structured data.

Below the file level, the shredded Parquet columns carry ordinary row-group and page statistics, and engines apply them during scans. This layer is young enough to have visible growing pains: the Iceberg 1.11 release cycle included a fix for variant type filtering in the Parquet metrics row-group filter, exactly the kind of correctness hardening you expect while a statistics path moves from specification to production. The direction is unambiguous, though. Bounds at the manifest level, statistics at the row-group level, and encodings at the page level, all keyed by paths into data whose schema was never declared. That stack is what "first-class lakehouse workload" means mechanically, and it is why I keep saying Variant is a bigger deal than a convenience type.

## One Query, Every Layer

To fix the whole stack in your head, trace a single query top to bottom. The table holds 5,000 data files of clickstream events with `event_type` and `amount` shredded. The query:

```sql
SELECT variant_get(payload, '$.user_id', 'bigint') AS user_id
FROM lake.events
WHERE variant_get(payload, '$.event_type', 'string') = 'purchase'
  AND variant_get(payload, '$.amount', 'double') > 500.0;
```

Layer one, scan planning against manifests. The planner matches the predicates against the path-keyed bounds recorded for the Variant column. Files whose `$.event_type` bounds exclude `'purchase'`, or whose `$.amount` upper bound sits at or below 500, drop out. In clickstream data, purchases are rare, so suppose 4,300 of 5,000 files drop here. No storage read has happened for them beyond the metadata the planner already held.

Layer two, Parquet footers. For each surviving file, the engine reads the footer and finds the Variant column's group: `metadata`, `value`, and the `typed_value` sub-columns for `event_type` and `amount`. Row-group statistics on those typed columns repeat the pruning at finer grain, and half the row groups drop.

Layer three, pages and decoding. Within surviving row groups, the engine reads the `event_type` and `amount` typed columns, dictionary-encoded and compressed like any string and double columns, evaluates the filter vectorized, and produces a selection of matching rows. Only for those rows does it read what the projection needs: the `user_id` values, from a typed column when shredded, or by offset-jumping into the residual `value` binary when not, merging the two sources where rows split between them.

Layer four, result assembly. Matching `user_id` values return as ordinary bigints. Nothing downstream knows the data was semi-structured.

Count what never happened. No JSON parsing, anywhere. No reads of the dozens of other shredded sub-columns. No decompression of 4,300 files and half the row groups of the rest. Now run the same query against the legacy string column: every file opens, every row group decompresses, every row parses in full, and the two predicates evaluate against freshly built document trees a billion times. Same data, same question, and the difference is structural, not incremental, which is why filter-heavy workloads see the largest gains and why "several times faster" is the modest end of reported numbers.

The trace also shows where the design spends its correctness insurance. Every step that used shredded columns had the residual `value` as fallback for rows that did not conform, and the merge in layer three is where conforming and non-conforming rows reunite. Fast for the disciplined majority, correct for everything, and the boundary between them decided per row rather than per table.

## Working With Variant: The SQL

Enough mechanism. Here is what using it looks like, in Spark SQL syntax that carries to other engines with minor dialect differences.

Create a v3 table with a Variant column and shredding enabled:

```sql
CREATE TABLE lake.events (
  event_id   BIGINT,
  event_ts   TIMESTAMP,
  payload    VARIANT
) USING iceberg
TBLPROPERTIES (
  'format-version' = '3',
  'write.parquet.shred-variants' = 'true'
);
```

Two properties do the work. The format version opts the table into the v3 specification, which is where the Variant type lives. The shredding property tells the Parquet writer to analyze incoming variant data and extract consistent fields into typed columns. Without it, values still store in the binary encoding and still beat JSON strings on access cost, but you leave the columnar pruning on the table.

Ingest JSON by parsing it into the binary encoding at write time:

```sql
INSERT INTO lake.events VALUES (
  1001,
  TIMESTAMP '2026-08-01 10:00:00',
  PARSE_JSON('{
    "user_id": 42,
    "event_type": "click",
    "device": { "os": "android", "version": 14 },
    "tags": ["promo", "mobile"]
  }')
);
```

`PARSE_JSON` runs once, at ingestion. This is the architectural inversion that pays for everything: the old model parsed on every read forever, the new model parses on the single write. Streaming ingestion from Kafka does the same conversion in the sink, so documents land in binary form and no reader ever sees text.

Query fields with path extraction:

```sql
SELECT
  variant_get(payload, '$.user_id', 'bigint')      AS user_id,
  variant_get(payload, '$.device.os', 'string')    AS os,
  variant_get(payload, '$.tags[0]', 'string')      AS first_tag
FROM lake.events
WHERE variant_get(payload, '$.event_type', 'string') = 'click';
```

`variant_get` takes a path in JSON path syntax and a target type. Nested objects traverse with dots, arrays index with brackets. When `event_type` is shredded, that WHERE clause prunes files through manifest bounds, prunes row groups through Parquet statistics, and reads one sub-column, and the query plan looks like a filter on an ordinary string column. Many engines also support a shorthand colon syntax, `payload:user_id`, which desugars to the same operation.

The type tags enable checks that text JSON never supported cleanly:

```sql
SELECT count(*)
FROM lake.events
WHERE NOT IS_BIGINT(variant_get(payload, '$.user_id'));
```

That query audits type drift in the field producers promised was an integer, directly against storage-level type tags, without a parse. Run it after onboarding a new event source and you learn in seconds what used to surface as a 2 a.m. pipeline page.

Round-tripping back to text exists for the consumers that need it. `TO_JSON(payload)` reconstructs a JSON string from the binary encoding, which serves export paths, debugging, and the validation step of migrations. Values with no JSON equivalent, a binary field or a timestamp, serialize through defined conventions, another reminder that Variant is a superset of what JSON text expresses.

Notice also what schema evolution looks like now: it does not. When producers add a `campaign_id` field next sprint, no DDL runs, no migration coordinates, no pipeline redeploys. New documents carry the field, old documents lack it, `variant_get` returns null where it is absent, and once the field occurs consistently, writers begin shredding it in new files without anyone asking. The half of schema evolution meetings that were really "the payload changed again" meetings simply stop happening. Evolution of the table's real columns, adding, renaming, promoting a field out of the payload, remains ordinary Iceberg schema evolution, as safe as it has always been.

## What Breaks: Failure Modes to Design Around

Variant removes an old set of problems and introduces a newer, smaller set. These are the ones I have seen or expect to see.

Mixed types silently disable the fast path. Shredding extracts fields with consistent types. A field that is an integer in 95 percent of rows and a string in 5 percent lands in the residual for the inconsistent rows, and depending on writer policy, the field's shred quality degrades. Queries stay correct and quietly slow down. The fix is upstream discipline plus monitoring: the type-audit query above, run per source, catches drift while it is small. Treat type consistency in high-value fields the way you treat schema compatibility in your streaming contracts, as a producer obligation.

The shred schema is invisible in DESCRIBE. Your table shows one Variant column. Your Parquet files contain dozens of sub-columns, and which fields shredded is a per-file fact determined at write time, not a table-level declaration you can read from the schema. Two files written by different engine versions, or before and after a workload shift, shred differently. Practitioners have already built tooling to report shred coverage from data files, and until such inspection is a built-in, assume you cannot answer "is this path shredded" without looking at files. If a hot query path stopped pruning, this is the first thing to check.

High-cardinality and unbounded key spaces bloat everything. Documents that use data as keys, session IDs as field names, dates as field names, defeat the design. Every unique key enters metadata dictionaries, and no such field ever shreds, because no such field recurs. This was always an anti-pattern, and Variant does not absolve it. Restructure those documents so keys are values, turning `{"2026-08-01": 17}` into `{"date": "2026-08-01", "count": 17}`, and everything downstream improves.

Whole-document reads gain the least. If your access pattern reads entire documents, an archival or replay workload, shredding buys little, since reassembling the document touches every sub-column, and you paid write-time cost for it. Unshredded Variant, or even staying with your current format, is defensible there. Shredding is for analytical access to parts of documents, which is most workloads, but not all.

Engine asymmetry is the current tax. Reading and writing Variant, reading shredded files, and writing shredded files are four separate capabilities, and engines hold different subsets in August 2026. The residual design keeps mixed fleets correct, an engine that ignores shredding reads the binary value and returns right answers slowly, and writes from an engine without shredding produce unshredded files that faster readers handle fine. Correctness composes, performance does not. Audit each engine in your fleet against those four capabilities before you commit a shared table to Variant-heavy design.

Streaming ingestion multiplies the small-file problem's surface. Frequent small commits already produce small files, and each small file now carries its own independently decided shred schema plus per-file dictionary overhead. Shred analysis works best with a representative batch of documents to analyze, and a 200-row micro-batch is not representative, so streaming-written variant files tend to shred worse than batch-written ones on top of being small. The remedy is the one streaming Iceberg always needs, aggressive compaction, with the added requirement from the next paragraph that the compactor be shred-aware, since compaction is precisely your opportunity to re-shred with full knowledge of the data.

Maintenance now covers hidden columns. Compaction, the routine rewrite of small files into large ones, interacts with shredding, because rewriting variant data means re-running shred analysis, and a maintenance engine that does not shred can rewrite fast files into slow ones. Managed services have started advertising variant-aware compaction, Amazon S3 Tables specifically calls out maintenance including compaction for Variant columns, and if you run your own maintenance, verify the engine performing it preserves or improves shred quality. A compaction job that silently unshreds your hottest table is a performance incident with a delayed fuse.

## When Not to Use Variant

A type this useful will get overused, so let me draw the boundary from the other side.

Stable, contractual schemas still belong in real columns. If a field appears in every row, holds one type, and downstream consumers depend on its presence, promoting it to a top-level column buys you things Variant does not: NOT NULL enforcement where engines support it, participation in partitioning and sort orders, cleaner join keys, and a schema that documents the contract in DESCRIBE instead of in tribal knowledge. The strongest table designs I see are hybrids: identity, time, and the five fields every query touches as real columns, and the long tail as one Variant column beside them. Shredding does not change this advice, because a shredded field is still invisible to the schema, to partitioning, and to constraint enforcement.

Partition and cluster keys cannot live inside a Variant. Iceberg's hidden partitioning transforms operate on schema columns, so if you need to partition by an event date buried in the payload, extract it to a column at ingestion. The same goes for sort orders that drive clustering. Data layout is decided by schema-level fields, and burying layout-critical values in the payload forfeits the biggest lever Iceberg gives you.

Extreme document sizes deserve a second look. Multi-megabyte documents technically store fine, but analytics on them usually means you are warehousing what is really an object storage workload, and a pointer to a file often serves better than an embedded blob. In the other direction, if every document is three fixed fields, Variant is ceremony, and three columns are simpler.

And regulated deletion cuts across documents awkwardly. Row-level deletes work normally on Variant tables, deletion vectors and all. But a compliance requirement to remove one field from historical documents, scrub an accidentally logged email address out of `payload`, means rewriting files, exactly as it does for any immutable columnar data. Fields with foreseeable redaction requirements are better extracted to their own columns, where column-level handling and eventual removal stay tractable. Put differently, Variant is schema freedom for analytics, not an exemption from data governance design.

## Where Engine Support Stands in August 2026

The honest map, because "supports Variant" is doing a lot of work in vendor sentences right now.

Spark carries the reference implementation, aligned with the VARIANT type that entered Spark itself in the 4.0 line, and Spark is where the table-property-driven shredding workflow above runs today. Improved pushdown for `variant_get` on shredded data and native shredded writes were still landing in the reference implementation through this year, so even the most mature path is actively improving. Amazon EMR and Amazon S3 Tables shipped v3 Variant support this summer, with S3 Tables shredding into hidden columns and generating statistics for pruning. Databricks ships Variant with shredding across Delta and Iceberg given its role in the shared specification. Snowflake ships v3 Variant with shredding informed by its long history with the type. Dremio, my employer, shipped v3 support with write-time shred analysis that types consistent fields and leaves mixed fields in the binary representation. Native library support is spreading through the Iceberg subprojects, with the Go library tracking the non-shredded path first and shredding after, which is the sensible order.

Two ecosystem signals tell you where this sits on the maturity curve. First, the Iceberg community is actively discussing what remains before v3 becomes the default table format version, and Variant completeness keeps coming up as a gating item in those dev list threads, with a dedicated tracking effort scheduled this month. Second, the Parquet community publishing Variant as a native, ratified part of the format means every downstream project, not just Iceberg, converges on one representation. Neither signal says "wait." Both say "the paved road is Spark-shaped today and widening fast."

My adoption guidance follows from that map. New event and log tables on v3-capable platforms: start with Variant now, it is the design that ages well. Existing string-JSON tables with painful query performance: migrate the hot ones, measure, then batch the rest. Tables shared across engines with uneven v3 support: adopt the type, delay reliance on shredded-read performance until every reader in the fleet handles it, and lean on the residual's correctness guarantee in the meantime.

## Migrating the Payload Column You Already Have

Since most readers have that string column from the opening paragraph, here is the migration shape that works.

Create the v3 target table with a Variant column and shredding enabled. Backfill with a single transformation, `PARSE_JSON` over the old string column, which is an idempotent, restartable batch job. Validate with three checks: row counts match, a sampled set of documents round-trips byte-equivalent through `TO_JSON`, and the type-audit queries confirm your critical paths hold the types your queries assume. Repoint ingestion to write Variant directly, cut readers over view-first so query text changes once, and keep the old table until a full reporting cycle passes.

Budget real attention for the validation step, because this migration changes physical representation, not just location. Documents with duplicate keys, with numbers at precision edges, or with strings that were never valid JSON at all will surface here, and every one of them is a data quality bug you already had, now visible. Teams consistently report the migration's main cost was discovering what had been hiding in the string column, and its main benefit, beyond speed, was that things stopped hiding.

After cutover, put three things on a dashboard. Track scan-side pruning effectiveness on the migrated table, files planned versus files matched, because a drop in pruning is your earliest signal that a hot path stopped shredding. Track the type-audit counts for your critical paths weekly, so producer-side drift gets a conversation instead of a slowdown. And track file size distribution alongside your compaction cadence, since the streaming interplay described earlier means shred quality and file size degrade together and recover together. None of these takes more than a scheduled query, and together they turn the invisible parts of this feature, the shred schema and the residual, into things you manage on purpose rather than discover under load.

## Where This Goes Next

Three developments are worth watching, plus a fourth on the horizon. The v4 specification work now underway concentrates on making metadata cheaper to update and richer to query, with proposals for restructured metadata trees and columnar metadata encodings. Variant benefits directly from that direction, because path-keyed field statistics are exactly the kind of wide, sparse metadata that a columnar metadata layer stores and queries better than today's Avro manifests do. A future where planners consult field-level bounds across millions of files as a cheap columnar read is a future where Variant pruning gets sharper without any change to your tables. The type landed in v3, and v4 looks set to make the ground under it firmer.

More immediately, three developments are worth watching. Pushdown keeps deepening, with `variant_get` on shredded data increasingly fetching only required sub-fields rather than reconstructing values, work the community has been explicit about. Shredded write support spreads from Spark across the reference implementations and native libraries, which dissolves the engine asymmetry tax. And ingestion widens beyond JSON, with paths from CSV, XML, and application objects into the binary encoding, at which point "semi-structured" stops meaning "JSON-shaped" and starts meaning "anything without a declared schema."

Step further back and Variant slots into a pattern this format has repeated for years. Iceberg took transactions, schema evolution, hidden partitioning, and time travel, warehouse capabilities, and rebuilt them on open files in open storage. Variant does the same for the semi-structured type warehouses treated as a proprietary differentiator for a decade. That capability is now a ratified open specification shared across Parquet, Iceberg, Delta, and Spark, which means it stops being a reason to choose a vendor and becomes ground everyone builds on. That is what progress looks like in open data infrastructure, and it is why the boring-sounding sentence "Iceberg v3 adds a Variant type" is one of the most consequential in the specification.

## Conclusion

The `payload` string column was never a design, it was a surrender. Variant ends the war that forced it. The binary encoding makes irregular data navigable without parsing, shredding rebuilds columnar performance underneath schema freedom, and path-keyed statistics let the Iceberg metadata tree prune semi-structured filters the way it has always pruned structured ones. The costs are knowable and manageable: write-time analysis, type discipline on hot fields, shred visibility tooling, and an engine capability audit before fleet-wide reliance. Flatten your JSON when its structure is truly stable, and stop flattening it as a performance ritual, because the format finally does that work for you.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg and lakehouse architecture. *Apache Iceberg: The Definitive Guide*, which I co-authored for O'Reilly, covers the table specification, metadata tree, and the design principles that features like Variant build on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
