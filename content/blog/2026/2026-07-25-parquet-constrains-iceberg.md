---
title: "Iceberg's Next Version Depends on Decisions Being Made in Parquet"
date: "2026-07-25"
description: "The Iceberg and Parquet specifications are co-evolving. Several of the most consequential Iceberg v4 proposals are waiting on Parquet work, and practitioners should read both dev lists."
author: "Alex Merced"
category: "Data Engineering"
tags:
  - apache iceberg
  - apache parquet
  - variant type
  - open formats
  - lakehouse
canonical: https://iceberglakehouse.com/posts/parquet-constrains-iceberg/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/parquet-constrains-iceberg/).

Follow an Apache Iceberg design discussion about column-level updates long enough and it stops being an Iceberg discussion. The question of whether a writer can replace one column in an existing file, without rewriting the other thirty-nine, turns on whether the file format underneath supports the idea of a logical file assembled from pieces. Iceberg cannot decide that alone. The answer lives in Apache Parquet.

This happens repeatedly, and most coverage of the lakehouse misses it because the two projects get discussed separately. Iceberg gets written about as the table format that won. Parquet gets treated as settled infrastructure that stopped being interesting in 2015. In 2026 both framings are wrong in the same way: the two specifications are co-evolving, decisions in one constrain the other, and several of the most consequential Iceberg v4 proposals are waiting on Parquet work.

Anyone planning a lakehouse roadmap benefits from reading both dev lists. This piece explains why, case by case, with the specific coupling points that matter. I work at Dremio, now part of SAP, and I co-authored the O'Reilly books on Iceberg and Polaris, so open format work is where I spend my attention. None of the mechanics below depend on that.

## The Layer Cake and Its Interfaces

Start with what belongs where, because the coupling only makes sense once the boundaries are clear.

**The file format** owns everything inside a single file: the physical layout of values, encodings, compression, page structure, column chunk boundaries, per-column statistics, and the footer that describes all of it. Parquet's contract is that a reader with the footer can find and decode exactly the bytes it needs.

**The table format** owns everything about a set of files: which files belong to the table right now, what schema they conform to, how partitioning maps values to files, what changed between snapshots, and how concurrent writers commit atomically. Iceberg's contract is that a reader with the current metadata pointer sees a consistent table.

**The catalog** owns the pointer to the current table metadata, plus access control, discovery, and multi-table coordination.

The interface between the first two layers is narrower than people assume and carries more weight than people notice. The table format's planner uses per-file statistics from the file format to skip files. The table format's schema evolution relies on the file format's ability to carry field identifiers. The table format's delete strategies depend on what the file format allows to be modified or annotated. Change what the file format can express and the set of table format designs that work changes with it.

That is the whole thesis. Now the cases.

## Case One: Variant, and Why It Had to Live in Parquet

Semi-structured data has been a second-class citizen in analytics forever. A JSON payload in a string column means every query that touches one field parses the entire blob for every row, with no statistics, no pruning, and no columnar advantage.

The variant type fixes this, and the fix had to happen at the file format layer. The Parquet community announced the variant type on February 27, 2026, bringing native support for semi-structured data with a compact binary encoding that replaces JSON text with an offset-navigable representation.

The half that matters most for query speed is shredding. Frequently occurring fields inside a variant get extracted into real Parquet columns with real statistics. A payload column holding attributes across millions of events can have its `channel` and `campaign` fields promoted to typed subcolumns. Once shredded, a filter on `payload.channel = 'mobile'` prunes using min and max statistics exactly like a filter on any typed column, and skips physical bytes rather than decoding blobs.

Iceberg v3 exposes variant as a table-level type. That exposure is only useful because the physical representation exists in Parquet. If shredding lived in the table format instead, every file format underneath needs its own version of it, and a Spark writer and a different engine's reader end up disagreeing about layout. Because the specification is Parquet's, one physical representation serves every engine and every table format that sits above it.

The dev list traffic since the announcement shows a specification in its hardening phase: threads on realistic depth limits for nested variants, on how readers that predate variant should behave when they encounter these columns, and on where shared components like the JSON parser belong. Those are exactly the questions that decide whether the feature works across a mixed-version estate, which is the situation every real deployment is in.

## Case Two: Geospatial, and the Statistics Problem

Geospatial data followed the same path with a sharper illustration of the coupling.

Parquet added GEOMETRY and GEOGRAPHY logical types under PARQUET-2471, announced February 13, 2026. Iceberg v3 exposes geospatial types at the table level. Both were necessary, and neither alone delivered performance.

The performance came from a separate piece of work: statistics support for the geometry logical type, which computes bounding boxes per column chunk. Without those, a query filtering to a bounding region reads every file, because the table format has nothing to prune on. With them, the Iceberg planner skips files whose bounding box does not intersect the query region, and skipping is where all the speedup lives.

The subtlety that consumed real discussion time was bounding box handling for empty geometries and for shapes crossing the antimeridian, where naive min and max on longitude produce a box spanning the entire globe and pruning stops working exactly where it matters most. That is a file format problem with table format consequences, and it is the kind of detail that never appears in a product announcement.

The generalizable lesson: a type in the table format is a data modeling feature. A type with statistics in the file format is a performance feature. Ask which one a platform shipped.

## Case Three: Column Updates and the Logical File Question

This is the live one, and it is the clearest case of Iceberg waiting on Parquet.

The problem is concrete. A machine learning feature table has 2,000 columns and a billion rows. One feature gets recomputed. Under current mechanics, updating that column means rewriting every file that contains it, which means rewriting all 2,000 columns of data to change one. The write amplification is roughly 2,000 to 1 against the actual change.

Every proposed fix requires the ability to store a replacement column chunk somewhere and have readers assemble a logical row group from pieces that live in more than one physical file. That is a file format concept. Parquet today defines a file as a self-contained unit with a footer describing its own column chunks. A logical-file concept, where a footer references column chunks in other files, changes that contract.

The Iceberg side of the debate is about where the bookkeeping goes: whether the table format tracks column-level versions in its metadata, whether the file format handles assembly, or some split between them. That argument cannot resolve until the Parquet side settles what a file is allowed to reference. Which is why the column update thread is one of the most-watched and least-resolved items in the v4 discussion.

Two things follow for practitioners. First, if you run wide feature tables with partial column refreshes, this is the single spec development worth tracking, because it changes your storage economics by orders of magnitude. Second, any vendor claiming to solve column updates today is doing it with a proprietary mechanism, which is fine as long as you know that the tables involved are less portable than they look.

## Case Four: Metadata Size and the Footer

Iceberg v4 design work includes an adaptive metadata tree and single-file commits, both targeting the cost of committing frequently. A related strand is columnar metadata: storing table metadata in a columnar layout so planners read only the fields they need rather than parsing entire manifests.

That work leans on Parquet footer improvements, because if metadata is stored as Parquet, then reading a small slice of it efficiently depends on how cheaply a reader gets at the footer and skips to the relevant column chunks. Footer parsing cost is negligible when you read a gigabyte file and read the whole thing. It becomes the dominant cost when you read thousands of small metadata objects and want three fields from each.

The coupling is subtle and real. A table format optimization about planning speed turns into a file format question about small-read efficiency. Anyone who has profiled query planning on a table with a hundred thousand files has watched this cost directly, usually as a long tail of tiny object storage requests that add up to more time than the data scan.

## Case Five: Where Iceberg Owns the Boundary

Not everything crosses the line, and the cases where Iceberg owns the mechanism outright are instructive about how the projects divide work.

Deletion vectors are the best example. In Iceberg v3, a merge-on-read delete writes a compact bitmap identifying deleted row positions in a specific data file, stored in a Puffin file. Puffin is Iceberg's own format for auxiliary blobs, sitting alongside data files. The data files stay untouched and unaware.

That design keeps the file format out of it entirely. Parquet does not need to know that some rows in a file are logically deleted. The reader applies the bitmap after decoding. The tradeoff is that readers pay a reconciliation step, which is cheap for a bitmap and was expensive for the positional delete files v2 used.

Row lineage works the same way. Iceberg assigns stable row identifiers and sequence numbers, tracked in table metadata, surviving compaction. No file format change required.

The pattern across both: when a capability can be expressed as metadata about files, Iceberg does it alone and ships faster. When a capability requires changing what is inside a file or how it is read, the work moves to Parquet and moves at the pace of a specification with eight independent implementations. That difference in velocity explains why v3 landed the things it did and why v4's harder items are taking longer.

## Case Six: Encodings, and Why the Table Format Cares

Encoding work looks purely internal to the file format, and it changes table-level economics anyway.

Floating point columns compress poorly under classic Parquet encodings. Dictionary encoding does nothing for high-cardinality floats, and general purpose compression finds little structure in IEEE754 bit patterns. Work on specialized floating point encodings targets exactly this gap, and the effect on a table of measurements or prices is large.

Why the table format cares: file size drives file count for a fixed target size, file count drives manifest count and planning time, and scan volume drives query cost. A 30 percent improvement in compression for a column type that dominates your fact tables shows up as a smaller storage bill, faster scans, and less maintenance work, without a single change to the table format.

This is also where the research pressure sits. Ideas from newer columnar research have been influencing Parquet's encoding roadmap, and the pattern is consistent: a research format demonstrates a technique, the technique gets adopted into Parquet where the ecosystem already is, and the installed base benefits without a migration.

## The Pluggable Format Question

A reasonable reader asks why Iceberg does not simply swap in a better file format when one appears. Iceberg's specification has a file format field, and a set of newer columnar formats have arrived with credible claims: one built around fast random access and native vector indexing for AI retrieval, one built by a hyperscaler for decoding extremely wide machine learning feature tables, and one positioning itself as a general purpose successor with an Arrow-native, cascading-compression design under Linux Foundation governance.

The field exists. Using it is a different matter, and the reasons are worth understanding because they explain why format transitions take years.

**Statistics contracts.** Iceberg planning depends on per-file and per-column statistics with specific semantics. Any replacement format has to supply equivalents, including for the newer types, and has to agree on edge case behavior like nulls, NaNs, and the geometry bounding box questions mentioned above.

**Field identifier mapping.** Iceberg's schema evolution works because columns are tracked by identifier rather than by name or position. The file format has to carry those identifiers. Formats designed without that assumption need a mapping layer, and mapping layers are where subtle evolution bugs live.

**Delete and lineage interaction.** Deletion vectors reference row positions within a file. A format with a different notion of row ordering or of physical layout changes what a position means.

**Engine support.** This is the real gate. A table written in a format that three of your five engines cannot read is not a table, it is a liability. Parquet's advantage is not technical superiority on every axis. It is that first-class read implementations exist across Arrow C++, parquet-java, Arrow Go, Arrow Rust, cuDF on NVIDIA hardware, DuckDB, Polars, and browser-side readers, and that every commercial engine reads it.

The realistic near-term outcome is not replacement. It is specialization: newer formats winning specific workloads like vector retrieval and training data feeding, while Parquet absorbs the applicable ideas and keeps the general analytical estate. Watching whether Iceberg's file format field gets exercised in production by anyone other than a vendor demo is a good indicator of whether that changes.

## Implementation Status Is the Real Ship Date

A specification merge is not availability. For anyone deciding when to adopt a new type, the gate is the implementation matrix, and Parquet publishes one.

Eight engines hold first-class Parquet read implementations, and each feature lands in each of them at its own pace. A type merged into the specification in February is usable in your estate only when every writer and reader that touches the affected tables supports it. That gap is commonly two to four quarters, and it is longer for readers embedded in commercial products that ship on their own release cycles.

Parquet's compatibility model classifies changes by their effect on old readers, and the distinction matters enormously in a mixed estate. A logical type annotation like variant is forward compatible in a limited sense: an older reader reads the underlying physical column as raw bytes without applying the logical type, so it gets data it does not understand rather than an error. A new encoding is forward incompatible: an older reader cannot decode the bytes at all and fails.

That distinction should drive your rollout order. Logical types are relatively safe to enable early, because worst case is a reader seeing binary it does not interpret. Encodings need every reader upgraded first, because worst case is a broken pipeline.

## Checking What Your Estate Actually Supports

Before enabling anything new on a shared table, verify rather than assume. This is a five-minute exercise that prevents a bad week.

```python
import pyarrow.parquet as pq
import pyarrow as pa
import json

# What does this specific file use, and what does an old reader see?
pf = pq.ParquetFile("s3://lake/warehouse/events/data/00001.parquet")
meta = pf.metadata
schema = pf.schema_arrow

print("created_by:", meta.created_by)
print("num_row_groups:", meta.num_row_groups)
print("format_version:", meta.format_version)

for i in range(meta.num_row_groups):
    rg = meta.row_group(i)
    for c in range(rg.num_columns):
        col = rg.column(c)
        print(
            col.path_in_schema,
            col.physical_type,
            col.encodings,
            col.compression,
            "stats" if col.is_stats_set else "NO STATS",
        )
```

Three things to look for in that output.

`created_by` tells you which writer produced the file and at what version, which is how you trace a compatibility problem to its source.

The `encodings` list tells you whether the writer used anything an older reader cannot decode. This is the field that predicts hard failures.

`NO STATS` on a column is the quiet performance killer. A column without statistics cannot be used for file pruning, which means every query filtering on it scans everything. This happens more often than people expect, especially for newer types where the writer supports the type but not yet its statistics, and for columns above the writer's statistics truncation threshold for long strings.

Then check the table side for how those files are being described:

```sql
-- Which format version and file formats does this table actually use?
SELECT * FROM lakehouse.events.web_events.metadata_log_entries
ORDER BY timestamp DESC LIMIT 5;

-- Per-file record, including format and column-level statistics coverage.
SELECT
    file_format,
    COUNT(*)                                        AS files,
    CAST(AVG(file_size_in_bytes)/1048576 AS INT)    AS avg_mb,
    SUM(CASE WHEN lower_bounds IS NULL THEN 1 ELSE 0 END) AS files_without_bounds
FROM lakehouse.events.web_events.files
GROUP BY file_format;
```

`files_without_bounds` above zero means part of your table is unprunable. On a table with mixed writers, that number tells you which writer is producing files the planner cannot skip, which is usually worth more than any tuning parameter you reach for instead.

## Writing the New Types Deliberately

When the matrix checks out, adopting the new types is straightforward and worth doing explicitly rather than by default.

```sql
CREATE TABLE lakehouse.events.web_events (
    event_id     BIGINT,
    occurred_at  TIMESTAMP,
    user_id      STRING,
    location     GEOGRAPHY,
    payload      VARIANT
)
USING iceberg
PARTITIONED BY (days(occurred_at))
TBLPROPERTIES (
    'format-version'                       = '3',
    'write.parquet.compression-codec'      = 'zstd',
    'write.parquet.compression-level'      = '3',
    'write.metadata.metrics.default'       = 'truncate(16)',
    'write.metadata.metrics.column.user_id' = 'full',
    'write.target-file-size-bytes'         = '536870912'
);
```

The two metrics properties are the ones people skip and then wonder why pruning underperforms. Iceberg computes column statistics at write time and stores them in manifests, and the default truncates long string bounds to keep metadata small. Setting `full` on a column you filter by equality gives the planner exact bounds and better skipping, at the cost of larger manifests. Setting it on every column bloats metadata and slows planning, which is the opposite of what you wanted. Pick the three or four columns your queries actually filter on.

For variant specifically, the shredding decision belongs with the writer. When the read pattern is known, supplying an explicit shredding schema for the fields queries touch produces typed subcolumns with statistics. When it is not known, inference decides. The difference in query time on a filter against a nested field is the difference between pruning and full decode, so it is worth being explicit for the two or three fields that matter.

## The Third Layer: Arrow

Two layers is a simplification. There is a third, and it constrains the other two in a quieter way.

Apache Arrow defines the in-memory columnar representation that engines use once bytes are decoded. Co-created by Jacques Nadeau, it became the common currency between systems: a reader decodes Parquet into Arrow batches, a query engine operates on Arrow, a client receives Arrow over the wire through Flight or ADBC, and a Python process reads Arrow with zero copy.

The coupling to the format layers runs through type systems. A type that exists in Parquet and Iceberg but not in Arrow has to be translated at the boundary, and translation costs both performance and fidelity. This is why type additions tend to move through all three projects rather than one, and why the variant and geospatial work involved coordination well beyond the file format specification.

The coupling also runs through decode efficiency. The whole value of a columnar file format is that decoding produces something an engine operates on directly with vectorized kernels. Parquet's encodings are designed with that destination in mind, which is why encoding decisions weigh decode speed alongside compression ratio. A format that compresses 20 percent better and decodes 40 percent slower loses in practice, and that tradeoff shapes what gets accepted.

Where this becomes strategically interesting is compute on encoded data. Some newer format research keeps data compressed in memory and executes over the compressed representation, which cuts both memory bandwidth and decode cost. If that technique matures and reaches the mainstream, the boundary between file format and in-memory format blurs, and both the Parquet and Arrow specifications change shape around it. That is a multi-year question and it is the most interesting one in this stack.

For practitioners the immediate implication is narrower. When evaluating whether a new type is genuinely usable end to end, check three things rather than one: does the file format store it with statistics, does the table format expose it, and does the Arrow-based client you use get it back with the right type rather than as opaque binary. Estates hit the third gap most often, and it surfaces as a Python notebook receiving bytes where a timestamp or a geometry was expected.

## How the Two Communities Actually Work

Following these projects is a learnable skill, and it takes less time than most people assume.

Both communities do their real work on dev mailing lists. Design ideas enter as a discussion thread, usually paired with a design document and a GitHub issue. Larger changes become enhancement proposals with a formal number. Contentious items get recurring design syncs where the participants argue through the open questions on a call and post notes back to the list. Consensus forms on the list, code lands in the implementation repositories, and a release ships it.

Reading that pipeline gives you a maturity signal that no blog post provides. An idea in a fresh discussion thread with no design document is a conversation. An idea with a design document and an active sync is likely to land. An idea that has been merged into the specification is real but not yet available, because availability depends on the implementation matrix.

Release cadences differ between the layers in a way worth knowing. The Iceberg Java implementation ships regularly, with the 1.11 line current as of May 2026 and firmly in the v3 era. The Parquet Java implementation moves on its own schedule, with 1.17.0 as the current line. The Rust, Go, and C++ implementations of both projects ship independently again. A feature is available to you when the specific implementation your engine embeds supports it, which is a different date than any project's release announcement.

Participation is more open than the enterprise gravity of the topic suggests. Engineers from Google, Apple, Snowflake, Databricks, Microsoft, Netflix, and LinkedIn sit in the same Iceberg design discussions, and the Parquet community spans a similar range. Cross-vendor participation is the actual guarantee behind these formats, more than any technical property. A specification that a dozen competitors maintain together cannot be quietly bent toward one of them.

If you want the efficient version of following along: subscribe to both dev lists, skim thread subjects weekly, and read the design documents for the two or three threads that touch your architecture. That is maybe thirty minutes a week and it puts you two to three quarters ahead of anyone reading only release notes.

## Three Roadmap Decisions This Changes

Abstract coupling is interesting. Here is where it changes what you decide this quarter.

**Wide feature tables.** If you run tables with hundreds or thousands of columns where individual columns get recomputed on different schedules, the current answer is to split them into several narrower tables joined at read time, accepting join cost to avoid rewrite cost. That workaround exists specifically because column-level updates are unresolved at the file format layer. Do not architect around a fix that has not landed. Do watch the thread, because when it lands the narrow-table workaround becomes unnecessary and consolidating back is a straightforward migration.

**Streaming freshness targets.** Teams frequently promise sub-minute freshness on Iceberg tables and then discover the metadata cost of committing that often. Today the honest answer is that very high commit rates carry a maintenance and planning tax, and the mitigations are writer-side buffering and aggressive compaction. The v4 work on single-file commits and adaptive metadata targets exactly this. Plan current systems for the current cost, and revisit the target when that work ships rather than promising it now.

**Semi-structured modeling.** With variant available at both layers, the old pattern of parsing JSON into a wide set of nullable columns at ingestion is no longer the only reasonable choice. The new pattern is variant with explicit shredding on the fields that get filtered. That decision is available today with v3, gated by whether your engines support it, which brings you back to the implementation matrix. Check first, then adopt, and be explicit about the shredding schema for the fields that matter.

A fourth, smaller decision: geospatial workloads that have been living in a specialized system on the side now have a credible home in the lakehouse, provided your engines support the types with statistics. The pruning behavior is what makes it viable, and pruning is the thing to test rather than assume.

## Failure Modes at the Layer Boundary

**Type available, statistics absent.** Symptom: a new type works and queries filtering on it are slow. Cause: the writer supports the logical type but not statistics for it. Fix: check `files_without_bounds`, upgrade the writer, and rewrite affected files.

**Mixed-version writers on one table.** Symptom: intermittent read failures or inconsistent pruning across partitions. Cause: two writers at different library versions producing structurally different files. Fix: inventory client versions per table, and pin the format version below the lowest common denominator until upgrades complete.

**Encoding adopted before readers upgraded.** Symptom: hard read failures on new files from an older engine. Cause: a forward-incompatible change. Fix: upgrade readers first, always, before enabling new encodings on shared tables.

**Statistics truncation defeating equality filters.** Symptom: filtering on a long identifier column scans everything. Cause: default truncation of string bounds makes the min and max useless for equality on long values. Fix: `full` metrics on that specific column.

**Variant used as a schema substitute.** Symptom: a table where everything is one variant column and queries are slow across the board. Cause: treating variant as permission to skip modeling. Variant is for genuinely variable payloads. Fields that appear on every row belong in real columns, shredded or declared.

**Assuming the table format hides file format differences.** Symptom: a portability plan that assumes any Iceberg reader handles any Iceberg table. Cause: reading only the table specification. The table format guarantees the metadata contract, not that every reader supports every physical feature inside the files.

## Every Table Format Faces This, Not Just Iceberg

The coupling described here is not an Iceberg quirk. It applies to every table format sitting on Parquet, which is most of them.

Delta Lake converged on the same variant representation, which is the entire reason cross-format work functions at all. Apache Hudi, Apache Paimon, and the newer entrants all inherit the same constraint: what the table can express about a column depends on what the file format stores about it.

That shared dependency has a useful consequence. Apache XTable provides translation between table formats without rewriting data files, which is what Microsoft uses under OneLake to serve Delta tables as Iceberg on demand. Translation is possible precisely because the data files are the same Parquet files with the same physical layout, and only the metadata differs. Two formats that disagreed at the file level resist translation this cheap.

It also sets the limits of translation. Anything that exists in one table format's metadata and has no equivalent in the other has to be converted or dropped. Delta deletion vectors converting into Iceberg delete files is a solved case that took real engineering. New features arriving in one format ahead of the other reopen the gap each time, which is why translation layers need continuous maintenance rather than a one-time build.

For architects evaluating a multi-format estate, that yields a clean rule. Interoperability at the file level is nearly free and durable. Interoperability at the metadata level is engineering work that tracks two moving specifications. Design so that the cheap interoperability carries the weight, and treat the expensive kind as a bridge with a maintenance cost rather than a permanent architecture.

## What Portability Claims Actually Mean

"Your data stays in open formats" is the reassurance every platform offers, and the layer cake gives you a way to test it.

There are four distinct levels of portability, and vendors rarely say which one they mean.

**Byte-level portability.** The data files are standard Parquet, readable by any Parquet reader anywhere, with no vendor software involved. Nearly every vendor clears this bar, and clearing it alone means very little. Files you cannot locate or interpret as a table are an archive, not a lakehouse.

**Table-level portability.** The metadata is standard Iceberg or Delta, so an outside engine reconstructs the table from the metadata pointer. This is meaningful and still incomplete, because it says nothing about how you find the current pointer.

**Catalog-level portability.** An outside engine discovers and reads the table through a standard catalog interface, with credentials the catalog vends. This is the level that makes multi-engine architecture real, and it is the bar that separates genuinely open managed tables from open-format storage behind a closed control plane.

**Feature-level portability.** Every physical feature inside the files is supported by the readers you plan to use. This is the level the implementation matrix governs, and it is the one that fails silently. A table using a type your second engine cannot decode is portable on paper and unusable in practice.

The test for the third level is the one I keep recommending because it takes ten minutes: point PyIceberg at the vendor's catalog endpoint, load a managed table, run a filtered scan, and get Arrow back. The test for the fourth level is the metadata inspection code above, run against files written by each writer in your estate.

Running both tests during an evaluation changes the conversation with vendors more than any amount of architectural debate. Openness is a property you verify, not a claim you accept.

## What to Watch Through 2027

Four threads, in rough order of consequence.

**The column update question and the logical file concept.** This one changes write economics for wide tables by orders of magnitude and it is genuinely unresolved. If it lands, feature table architecture changes materially.

**Metadata efficiency across both layers.** Single-file commits and an adaptive metadata tree in Iceberg, plus footer and small-read efficiency in Parquet. Together they determine how close streaming ingestion gets to continuous freshness without a separate serving tier.

**Variant hardening.** Depth limits, reader behavior across versions, and where shared components live. Boring work that decides whether the feature is safe in a mixed estate, which is the only estate that exists.

**Encoding advances reaching stable releases.** Compression improvements on numeric columns translate directly into storage and scan cost across every table anyone has.

The meta-observation is about how to read this ecosystem. Announcements come from vendors. Decisions come from dev lists. The gap between a specification merge and usable capability in a real estate is measured in quarters and gated by an implementation matrix that nobody puts on a slide. Reading both project lists gives you two to three quarters of warning on changes that affect your architecture, which is enough time to plan instead of react.

## A Short History of Why the Layers Split

Understanding why these are separate projects explains why the coupling is a feature rather than an accident.

Parquet arrived in 2013 out of a collaboration between Twitter and Cloudera, targeting the Hadoop era's problem: scanning wide tables efficiently on cheap disks. It solved that so well that it stopped being discussed. The design assumptions were batch scans over modest-width tables of numbers, strings, and dates, written once and read many times.

Iceberg arrived at Netflix several years later to solve a different problem that Parquet by design does not address: how a set of files becomes a table with atomic commits, correct concurrent writes, schema evolution, and hidden partitioning. Hive had answered that question with a directory-listing convention that fell apart at scale, and the correction was to track files explicitly in metadata.

Keeping the layers separate produced two benefits worth preserving. Any table format works over any compliant file format, and any file format serves any table format, which is why the ecosystem has multiple options at each layer instead of four vertically integrated stacks. And each layer evolves at the pace its own community can sustain, which is why Iceberg shipped deletion vectors and row lineage quickly while file-level changes take longer.

The cost of the separation is exactly the coupling this article describes. Capabilities that span the boundary require both communities to agree, which is slower than one project deciding alone. The variant and geospatial work shows the mature version of that process: joint design across specifications, one physical representation, and adoption by multiple table formats.

Anyone tempted to see the coupling as dysfunction should consider the alternative. A single project owning both layers moves faster and produces exactly one implementation, controlled by whoever maintains it. The reason your Iceberg tables are readable by eight independent Parquet implementations and a dozen engines is that no one organization gets to decide.

## A Reading Checklist

For anyone who wants to act on this without becoming a specification reader, six checks cover the practical surface.

1. For every table format feature on your roadmap, identify whether it requires file format support. If it does, find the corresponding specification work before committing a date.
2. Inventory the Iceberg and Parquet library versions embedded in every engine, client, and job that touches shared tables. Keep the list current. It is the artifact you need for every upgrade decision.
3. Enable logical types early and encodings late. The first fails softly, the second fails hard.
4. Verify statistics coverage per column with the metadata queries above, and treat missing bounds as a bug rather than a detail.
5. Set full metrics on the three or four columns your queries filter by equality, and leave truncation on the rest.
6. Test outside-reader access at the catalog level with a minimal client, on managed tables, before you sign anything.

## Conclusion

Apache Iceberg won the table format question, and that victory made the file format underneath more important rather than less. Every table format capability that touches what is inside a file requires Parquet to move first. Variant needed a binary encoding and shredding. Geospatial types needed bounding box statistics. Column-level updates need a notion of a logical file that does not exist yet. Metadata efficiency needs cheap small reads from footers.

The projects know this and work together, with the variant and geospatial specifications developed as joint efforts. The practitioner takeaway is simpler than the engineering: when you plan a lakehouse roadmap around Iceberg features, check the layer underneath before you commit a date. A type in the table specification with no statistics in the file format is a modeling feature, not a performance feature. A capability announced by a vendor with no corresponding file format support is proprietary, whatever the surrounding marketing says.

Read both lists. The Iceberg dev list tells you where the table is going. The Parquet dev list tells you when it gets to arrive. And the implementation status pages for both projects tell you the only date that affects your systems, which is the date your engines can read what your writers produce. That third source is the one to check before any roadmap commitment, because a specification is a promise and an implementation matrix is a schedule.

One more thing worth internalizing about how this ecosystem communicates. Vendors announce capabilities at the layer their product sits on, which is usually the table format or the platform. The enabling work almost always happened one layer down, months earlier, in a project with no marketing budget. Tracing a feature announcement back to the specification change that made it possible is the fastest way to tell a real capability from a repackaged one, and it takes about ten minutes per claim.

## Keep Going

If this piece was useful, I have written a lot more on the open formats that make the lakehouse work.
*Apache Iceberg: The Definitive Guide* (O'Reilly) covers the table format's metadata layers and how they interact with the file format underneath, which is exactly the boundary this article walks.
You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at
[books.alexmerced.com](https://books.alexmerced.com).
