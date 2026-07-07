---
title: "The Variant Type in Apache Iceberg: How Shredding Turns Messy JSON Into Fast Analytics"
date: "2026-07-06"
canonical: https://iceberglakehouse.com/posts/iceberg-v3-variant-type-ai-json-payloads/
description: "Apache Iceberg v3 introduces the Variant type for flexible JSON storage with columnar performance. Learn how shredding enables fast analytics on semi-structured data."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - data engineering
  - lakehouse architecture
  - open table formats
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-v3-variant-type-ai-json-payloads/).

# The Variant Type in Apache Iceberg: How Shredding Turns Messy JSON Into Fast Analytics

*By Alex Merced, Head of Developer Relations at Dremio*

Every data engineer I talk to has the same story. Somewhere in their company, there is a table with a column full of JSON strings. Maybe it holds event payloads from a mobile app. Maybe it holds sensor readings from a fleet of devices. Maybe it holds the raw output of some third party API that changes its shape every quarter. Whatever the source, that column is both the most valuable and the most painful part of the table.

It is valuable because it holds the raw truth. It is painful because every query that touches it pays a tax. The engine has to read the whole string, parse it, walk the structure, and pull out the one field the query actually wanted. Multiply that by billions of rows and you get slow dashboards, angry analysts, and cloud bills that make finance teams nervous.

Apache Iceberg version 3 of the table format spec introduces the Variant type to fix this problem. Variant gives you the flexibility of JSON with performance that gets close to regular typed columns. The trick that makes this possible is called shredding, and shredding is what I want to explain in this article.

My goal here is not to walk you through the spec line by line. The spec exists and you can read it. My goal is to make the logic of Variant and shredding click for you. I want you to finish this article and think, "oh, of course that is how it works." Once the mental model lands, the spec details, the engine documentation, and the benchmark numbers all become easy to reason about.

## The Two Bad Options We Lived With Before

To appreciate Variant, you need to feel the pain of the two options that came before it. For years, anyone storing semi-structured data in an analytic table picked their poison from a menu of two.

Option one: store the JSON as a string. You declare a column of type string or varchar, and you dump the raw JSON text into it. This is the path of least resistance. Ingestion is trivial. Nothing ever breaks on write, since any valid text fits in a string column.

The cost shows up at read time. Say you have a query that wants the `device_id` field out of a payload with two hundred fields. The engine cannot reach in and grab just that field. Text is opaque to a columnar engine. It has to load the full string for every row, run a JSON parser over it, build some internal representation of the document, and then extract the one value it wanted. That parsing work happens on every query, every time, forever. You pay full price for the whole document to read one field.

There is a storage cost too. JSON text is verbose. Field names repeat on every single row. The number 42 takes two bytes as a string plus quoting and structure, when a binary integer could hold far larger values in a fixed, compact encoding. Compression helps, but you are compressing waste rather than avoiding it.

Option two: flatten the JSON into real columns. You look at your payloads, decide which fields matter, and create a wide table where each field becomes a typed column. Now queries are fast. The engine reads only the columns it needs, the values are properly typed, and statistics let it skip files that cannot match a filter.

The cost here shows up in the schema. Semi-structured data earns the name because its structure is not stable. Devices get firmware updates and start sending new fields. Different event types carry different attributes. One team nests an object where another sends a flat value. Every one of those changes becomes a schema migration. Your table sprouts hundreds of mostly null columns. New fields arriving in production either break the pipeline or silently vanish before anyone maps them. You have traded query pain for operations pain.

Most real teams ended up running both patterns at once. A raw string column for completeness, plus a curated flattened table for the fields people query most, plus a pipeline keeping the two in sync. That is three things to maintain in exchange for zero new information.

Variant exists to collapse this menu. One column, flexible on write, fast on read.

## What Variant Actually Is

At the level of the Iceberg spec, Variant is a data type for values whose structure can differ from row to row. One row might hold an object with ten fields. The next row might hold an object with thirty different fields, or an array, or a plain number. The table schema does not care. The column is just typed as Variant, and each row carries whatever shape it carries.

That sounds like JSON, and conceptually it is close. Variant supports objects, arrays, strings, booleans, and nulls, just like JSON. It goes further on the primitive side. Variant values can hold real dates, timestamps with and without time zones, binary data, and exact decimals. JSON forces all of those into strings or lossy floating point numbers. Variant keeps them as first class typed values, which matters a lot for analytics where a timestamp should behave like a timestamp.

The key design decision is that Variant values are not stored as text. They are stored in a binary encoding defined in the Apache Parquet project. Iceberg v3 adopted this encoding rather than inventing its own, which was a smart move. It means the same physical representation works across Parquet, Iceberg, Spark, and every other engine that speaks the standard. No translation layers, no vendor lock-in at the file level.

The binary encoding splits every Variant value into two pieces: a metadata section and a value section.

The metadata section is essentially a dictionary of field names. Take a JSON document with fields like `user_id`, `event_type`, and `timestamp`. In text form, those names are spelled out in full on every row. In the Variant encoding, the names get collected into a dictionary once, and the actual values refer to them by a small integer ID. Think of it like a legend on a map. Instead of writing "hospital" next to every hospital, the map prints a small symbol and defines it once in the corner.

The value section holds the actual data, with each primitive stored in an efficient typed form. An integer is stored as an integer, not as digit characters. A timestamp is stored as a number, not as a formatted string. Objects and arrays are laid out with offsets, so an engine can jump directly to a specific field without scanning everything before it.

Stop and appreciate what that last part buys you. With JSON text, finding the `device_id` field means parsing characters from the start of the document until you happen upon it. With the Variant binary encoding, the engine looks up the field ID in the dictionary, follows an offset, and lands directly on the value. It is the difference between reading a book page by page to find a chapter and using the table of contents.

Binary encoding alone already beats string storage. Parsing is cheaper, storage is smaller, and typed values behave correctly. But binary encoding alone does not get you to columnar performance. For that, we need shredding.

## Why Binary Blobs Still Fight the File Format

Here is the tension. Parquet, the file format underneath most Iceberg tables, is columnar. Its entire performance story rests on one idea: store each column's values together, so a query reading three columns out of two hundred touches only those three. Column-by-column storage also enables great compression, since similar values sit next to each other, and it enables statistics, since the format can record the minimum and maximum value of each column in each chunk of the file.

Those statistics power one of the most important optimizations in analytics: pruning. Suppose a file's footer says the `event_date` column in this file ranges from March 1 to March 31. A query filtering for June dates never needs to open that file at all. At scale, pruning routinely eliminates the vast majority of data before any real work begins. Queries feel fast not because engines scan fast, but because they avoid scanning.

Now put a Variant value into a Parquet file as a single binary column. From Parquet's point of view, each row holds one opaque blob of bytes. Parquet cannot see inside it. There are no per-field statistics, because Parquet does not know fields exist. There is no way to read just the `device_id` bytes, because they are interleaved with everything else inside each row's blob.

So a query filtering on a field inside the Variant is back to brute force. Read every blob in every file, decode each one, extract the field, evaluate the filter. The decoding is much cheaper than JSON parsing, so this is still a win over strings. But all the pruning magic and column-skipping magic that makes columnar analytics fly is switched off.

The structure inside the blob is invisible to the format, and invisible structure cannot be optimized. Shredding is the answer to that. Shredding makes the structure visible.

## Shredding: The Core Idea

Here is shredding in one sentence: at write time, the engine looks at the Variant values it is about to store, notices which fields show up consistently, and stores those fields as real, separate, typed Parquet columns alongside the binary encoding.

Let me make that concrete. Imagine you are ingesting clickstream events. Nearly every event carries `user_id` as a string, `event_type` as a string, and `ts` as a timestamp. Beyond those, events carry a grab bag of extra fields that vary by event type. A page view has a `url`. A purchase has an `amount` and a `currency`. An error event has a `stack_trace`.

Without shredding, every event becomes one binary blob in one Parquet column. With shredding, the writer notices the common fields and pulls them out. Inside the Parquet file, the Variant column physically becomes a group of columns: one typed column for `user_id`, one for `event_type`, one for `ts`, and a residual binary column holding whatever did not get pulled out.

The word "shredding" describes exactly this. The document gets shredded into pieces, and the pieces that occur often enough get filed into their own columns.

I like to explain it with a mailroom analogy. Picture a mailroom that receives thousands of envelopes a day, each stuffed with a different mix of documents. The lazy approach is to shelve the sealed envelopes and open them whenever someone asks a question. That is the binary blob approach. The smart mailroom clerk notices that almost every envelope contains an invoice, a shipping label, and a receipt. So the clerk opens envelopes on arrival, files invoices in the invoice drawer, labels in the label drawer, receipts in the receipt drawer, and keeps the leftover odds and ends in the original envelope on the shelf. Now when someone asks "what was the total of all invoices in March," nobody opens a single envelope. They go straight to the invoice drawer.

The drawers are shredded columns. The envelope on the shelf is the residual binary. And the property that matters most is that nothing was thrown away. Every document is still findable. Common questions just got dramatically faster.

## The Mechanics: value and typed_value Pairs

Let us go one level deeper, because the mechanics are elegant and understanding them helps you predict performance.

The Parquet Variant Shredding spec defines how a shredded Variant is laid out. For each field the writer decides to shred, the file stores a pair of columns, conventionally called `typed_value` and `value`.

The `typed_value` column holds the field when it matches the expected type. If the writer decided `user_id` shreds as a string, then every row where `user_id` is actually a string lands in the typed column, as a plain Parquet string with all the usual columnar benefits.

The `value` column is the fallback. Semi-structured data does not sign contracts. Some rogue row might send `user_id` as a number, or omit it entirely. Rows that do not fit the expected type keep that field in binary Variant form in the fallback column. The pair together always represents the truth: for any given row and field, the data lives in exactly one of the two, and readers know how to check.

This pairing is what lets shredding coexist with chaos. The writer makes a bet on each field's type based on the data it observes. When the bet pays off, which is most of the time for genuinely common fields, the value sits in a fast typed column. When the bet misses, correctness is preserved through the fallback. No write ever fails because a row disagreed with the shredding scheme.

Nesting works the same way, recursively. If most payloads contain an `address` object with `city` and `zip` inside it, the writer can shred `address` into a group, and inside that group shred `city` and `zip` into their own typed columns. A query filtering on `city` reads one narrow string column, even though `city` lives two levels deep in the original documents.

Fields that appear rarely never get shredded at all. They stay in the residual binary alongside the row. That is the right call. A field that appears in one row per million would waste space as a dedicated column, since Parquet still has to track the nulls for the other 999,999 rows. Shredding concentrates its effort where repetition creates payoff.

One more mechanical detail worth knowing: the shredding scheme is decided per file at write time, not fixed in the table schema. The Iceberg table schema just says the column is a Variant. Which fields got shredded, and to what types, is recorded inside each Parquet file. Files written in January can shred different fields than files written in June as the data evolves. Readers discover each file's layout from the file itself. Flexibility survives all the way down.

## How the Writer Decides What to Shred

A fair question at this point: how does the writer know which fields deserve columns? Nobody declared a schema. That was the whole point.

Engines handle this through inference at write time, and implementations vary in the details. A common pattern is buffering. The writer holds a batch of incoming rows in memory, scans their structure, and tallies which fields appear, how often, and with what types. Fields that clear a frequency bar with a consistent type get picked for shredding. Then the writer flushes the batch into a Parquet file laid out according to that decision.

In Apache Spark's Iceberg integration, this behavior sits behind table properties. Setting `write.parquet.shred-variants` to true turns inference on, and a companion property controls how many rows the writer buffers to make its decision. A larger buffer means smarter decisions at the price of more memory during writes. Dremio's implementation applies shredding by default on write to Iceberg v3 tables and offers per-table control over the behavior. Other engines make their own choices, but the shape is the same everywhere: observe, decide, lay out.

I want to be honest about the cost, because there is one. Inference and restructuring are real work. Published community benchmarks on this are useful for calibration. One set of experiments on GitHub event data found that enabling shredding added roughly 35 percent to write time across repeated append runs. Another benchmark on EMR with Iceberg 1.11 measured writes at about 2.7 times slower with shredding on, in exchange for reads that averaged about 34 percent faster across 21 filter and aggregation tests, with the shredded table winning 20 of the 21 patterns. Storage grew about 20 percent in that test, since the file carried both the shredded columns and residual data, though results vary a great deal with data shape.

Do not treat those exact numbers as gospel for your workload. Treat them as evidence of the trade shape: pay once at write time, collect on every read for the life of the file. For the standard analytic pattern of write once and query thousands of times, that trade is excellent. For a write-heavy stream that almost nobody queries by field, it might not be. I will come back to this when we talk about when to use what.

## Statistics and Pruning: Where the Real Speed Comes From

Faster field extraction is nice. But the biggest wins from shredding come from something quieter: statistics.

Remember that once a field is shredded, it is a genuine Parquet column. Genuine Parquet columns get min and max values, null counts, and all the other metadata that Parquet records per column chunk. Iceberg's own metadata layer participates too. The v3 spec allows Variant columns to carry lower and upper bounds for fields within the variant, keyed by normalized JSON path expressions, so field-level bounds can flow up into Iceberg manifests where scan planning happens.

Connect the dots and you get pruning on JSON fields. Say your telemetry table holds a Variant payload with a shredded `severity` field, and a query asks for rows where severity equals "critical". The planner checks the bounds. Any file whose severity values range only from "debug" to "info" is skipped without being opened. Any row group inside a surviving file whose stats rule out "critical" is skipped too. The query might touch two percent of the physical data.

This is the exact optimization that made structured columnar analytics fast in the first place, now applied to fields buried inside semi-structured documents. Before Variant shredding, that entire class of optimization was simply unavailable to JSON data. Every query was a full scan wearing different clothes. After shredding, semi-structured fields play by the same rules as ordinary columns.

It helps to tally the layers of savings on a filtered query against a shredded field. First, file pruning skips whole files using Iceberg metadata. Second, row group pruning skips chunks inside files using Parquet stats. Third, column projection reads only the shredded column for the field, not the residual binary and not the other shredded fields. Fourth, the values arrive already typed, so there is no per-row decoding of documents. Each layer multiplies with the others. That compounding is why benchmark deltas on filter-heavy workloads look so large, and why vendors are competing on Variant scan performance. Snowflake, for instance, published an eleven-query Iceberg v3 Variant benchmark showing per-workload speedups like 9.47x on full-object retrieval, precisely because implementation quality on shredded layouts differs.

## The Read Path: variant_get and Transparent Fallback

Let us follow a query through the system, because the read path is where all the design choices pay off or do not.

The standard way to pull a field out of a Variant is a function most engines call `variant_get`. You hand it the column, a JSON path like `$.device.firmware.version`, and optionally the type you want back. Spark exposes it this way, Dremio provides VARIANT_GET, and other engines follow similar conventions.

Here is the important part: you write the same query whether or not the field is shredded. The path expression describes the logical document. What happens physically is the engine's job.

When the engine plans the query, it inspects the Parquet files in play and checks each file's shredding layout. In files where `$.device.firmware.version` was shredded, the engine reads that one narrow typed column and is done. In files where it was not, the engine falls back to reading the binary Variant and extracting the field from the encoding. A single query can mix both behaviors across files, since layout is a per-file decision. The user never sees the seam.

This transparency matters more than it might seem. It means shredding is purely an optimization, never a contract. Your queries do not break when the writer's inference changes its mind between files. Your pipelines do not need to know which fields made the cut. Old files written before you enabled shredding keep working next to new files written after. The logical model stays simple while the physical model does whatever is fastest.

There is a practical wrinkle worth flagging. Since shredding decisions live inside data files, it is not obvious from a SQL prompt which paths in your table actually got shredded. DESCRIBE TABLE shows one Variant column either way. Community tooling has started to appear that audits Parquet files and reports which paths are fully shredded, partially shredded, or left in binary, so you can check whether your hot filter paths are getting the columnar treatment. If a critical query filters on a path that inference did not shred, that is a signal to look at your write settings or your data distribution.

## Interoperability: Why the Parquet Spec Matters So Much

I spend a lot of my time in the Apache Iceberg community, and one thing I have watched closely is how the Variant work got structured across projects. The type semantics live in the Iceberg spec. The binary encoding and the shredding layout live in the Parquet project. That split was deliberate, and it is the reason Variant is more than a feature. It is a standard.

Because the physical layout is defined at the Parquet level, any engine that implements the spec can read any other engine's shredded files. Spark 4.1 can write shredded Variant data into a shared Iceberg v3 table, and Dremio reads it and uses the shredded layout transparently on its read path. A team can run ingestion on one engine and analytics on another with no coordination beyond both conforming to the published specs. Snowflake has brought its decade of production Variant experience to the same open layout, and DuckDB has introduced native Variant support in the same family of encoding. The Iceberg v3 spec was ratified in June 2025, and since then engine support has been landing across Spark, Flink, and the commercial platforms at a steady clip.

Compare this to how semi-structured support used to work. Every warehouse had its own proprietary internal representation. Your JSON was fast inside one vendor's walls and inert everywhere else. Moving engines meant re-ingesting and re-optimizing everything. With Variant on Iceberg, the optimized representation itself is portable. The shredded columns, the statistics, the residual encoding, all of it sits in open files on your own object storage, readable by whatever engine comes next.

For anyone building a lakehouse, this is the property to care about. Performance features come and go. Formats that multiple competing vendors implement against a shared spec tend to stick around.

## When to Use Variant, and When Not To

New capabilities invite overuse, so let me offer some judgment about where Variant fits.

Variant shines when structure genuinely varies or genuinely evolves. Application logs, where every service logs its own fields. Event telemetry, where the schema changes with every app release. IoT payloads, where a fleet of devices runs a mix of firmware versions, each emitting slightly different JSON. API responses from systems you do not control. Configuration snapshots and user profiles with sparse optional attributes. In all of these, the flexible column absorbs change that would otherwise become schema migrations and pipeline breakage.

Variant is the wrong tool when your data has a stable, known structure. If every row has the same twelve fields and always will, declare twelve columns. Plain columns are still simpler and faster than shredded Variant fields, with no inference step and no residual overhead. Do not wrap structured data in a flexibility layer it does not need. I have started seeing tables where someone made every column a Variant "to be safe," and that is a mistake. You pay flexibility costs for rigidity you already had.

The shredding toggle deserves its own judgment call, and the write benchmarks give us the frame. Read-heavy tables with field-level filters and aggregations should shred. That is the classic analytics profile, and the write penalty amortizes across thousands of queries. High-frequency streaming ingestion with tight latency budgets might leave shredding off, or shred later during compaction and maintenance, if the engine supports rewriting files with a different layout. Workloads that always retrieve full documents rather than individual fields get less from shredding, since the residual read happens anyway.

A few operational notes from the field. Variant requires format version 3, so tables on v1 or v2 need to migrate first, and adding a Variant column to an older-format table is not supported by the spec. Engine support is real but still maturing, so check the exact versions in your stack. Spark's mainstream support arrived in the 4.x line with Iceberg 1.10 and later. And some surrounding features lag: fine-grained access control on Variant columns, for example, is not yet supported in certain catalog and governance integrations. Test your specific combination before betting production on it.

## A Worked Example, End to End

Let me tie the whole model together with a small scenario you can hold in your head.

You run analytics for a company with a fleet of delivery vehicles. Each vehicle reports telemetry every few seconds as JSON. Core fields appear on nearly every message: `vehicle_id`, `ts`, `speed`, `fuel_pct`, and a `location` object with `lat` and `lon`. Beyond that, messages vary. Refrigerated trucks report `cargo_temp`. Newer models report a `battery` object. Diagnostic events attach fault codes that older firmware formats differently than newer firmware.

You create an Iceberg v3 table with an id column and a Variant column named `payload`, with shredding enabled on write. Ingestion parses each JSON message into the Variant binary encoding and appends in batches.

At write time, the engine buffers rows and tallies structure. It sees `vehicle_id`, `ts`, `speed`, `fuel_pct`, `location.lat`, and `location.lon` on nearly every row with stable types, so those become typed Parquet columns inside the Variant group. It sees `cargo_temp` on 20 percent of rows. Depending on thresholds, that may shred too. The long tail of fault codes and firmware quirks stays in the residual binary. Each Parquet file records its own layout, and each file's footer carries min and max stats for every shredded column, with field bounds flowing into Iceberg manifests.

Now the queries arrive. An analyst asks for average speed by hour for one vehicle last Tuesday. The planner prunes to files whose `ts` bounds overlap Tuesday and whose `vehicle_id` bounds include the target. Inside surviving files, it reads exactly two narrow typed columns. No JSON is parsed anywhere. The query runs like it would on a fully structured table, because for these fields, it effectively is one.

An operations engineer asks a rarer question: show me the raw fault payloads for refrigerated trucks that reported cargo temperature above threshold. The temperature filter runs against a shredded column with stats, pruning hard. For the surviving rows, the engine pulls the fault details out of the residual binary. Slower per row than a typed column, but the pruning already shrank the row count so much that nobody cares.

Three months later, a firmware update adds a `tire_pressure` object to new messages. Nothing breaks. No migration runs. New files start shredding the new fields once they become common. Old files keep their old layout. Queries spanning both eras read each file according to its own footer.

That is the promise, delivered: JSON-grade flexibility at write time, columnar-grade behavior at read time, and evolution absorbed without ceremony.

## The Deeper Pattern Worth Noticing

Step back from the mechanics for a second, because Variant shredding is an instance of a design pattern that shows up all over great data systems, and recognizing the pattern will serve you beyond this one feature.

The pattern: keep the logical model simple and let the physical layer be clever. Users see one flexible column and one extraction function. Underneath, writers infer structure, split values across typed and fallback storage, record per-file layouts, and publish statistics. Readers stitch it all back together invisibly. Complexity gets pushed to the layer that can automate it, and simplicity is preserved at the layer humans touch.

Iceberg does this everywhere. Hidden partitioning lets users query natural columns while the format manages partition values. Snapshot metadata lets users time travel with one clause while the format manages manifest trees. Variant shredding extends the same philosophy to the shape of the data itself. The schema-on-read versus schema-on-write debate that consumed a decade of data architecture arguments quietly dissolves, since shredding gives you schema discovery on write with schema flexibility preserved.

It also tells you where the ecosystem is heading. The v3 spec allows Variant bounds in metadata but leaves plenty of room for engines to compete on inference quality, shredding policy, and scan implementation. Expect maintenance procedures that re-shred old files based on observed query patterns. Expect smarter inference that watches which paths queries actually filter on. The spec defines the contract, and the innovation happens inside it. That is exactly how open standards are supposed to work.

## Questions I Hear Most Often

Whenever I present on Variant at conferences or community meetups, the same handful of questions come up. Answering them here rounds out the picture, and each answer reinforces some part of the mental model we built above.

**Does shredding change what my data means?** No. Shredding is a physical layout decision, invisible to the logical model. The set of documents in the table is identical whether shredding is on or off. A full retrieval of any row reconstructs the exact same value either way. This is why you can flip the setting between writes without breaking anything. Think of it like reorganizing a warehouse. The inventory did not change, only where things sit on the shelves.

**What happens when a field has mixed types across rows?** This is the case the value and typed_value pairing exists for. Suppose `status_code` arrives as an integer on 95 percent of rows and as a string on the rest, thanks to one misbehaving service. The writer might shred it as an integer. The integer rows land in the typed column and enjoy full columnar treatment. The string rows fall back to the binary encoding for that field. Queries still see every row correctly. Filters against the field evaluate both storage locations. You lose some performance on the messy rows, and that is the honest, proportionate cost of messy data.

**Can I control which fields get shredded instead of relying on inference?** This depends on the engine, and it is an area of active development across the ecosystem. Inference is the default posture in current implementations, with table properties controlling whether shredding happens and how much data the writer samples. As implementations mature, expect finer controls, since teams with well-understood hot paths will want to pin them. The spec itself does not care how the decision gets made. It only defines how a decision, once made, is recorded in the file.

**How does Variant interact with compaction and table maintenance?** Cleanly, and sometimes to your advantage. Compaction jobs rewrite small files into larger ones, and a rewrite is a fresh chance to make shredding decisions with more data in view. A stream of tiny files written under latency pressure without shredding can be compacted later into large, well-shredded files. This gives you a nice division of labor: the ingestion path optimizes for write speed, and the maintenance path optimizes the layout for reads. Several engines are moving in exactly this direction.

**Should I still extract truly critical fields into top-level table columns?** Often, yes. Variant does not forbid promotion, it just makes promotion optional rather than mandatory. If `tenant_id` drives your partitioning, or a field participates in join keys and access policies, giving it a real top-level column keeps it visible to every part of the system, including layers that do not yet understand Variant internals. A sensible pattern is a handful of promoted structural columns plus one Variant column for the evolving payload. You get governance and partitioning on the stable spine, and flexibility on everything else.

**Is Variant just for JSON?** JSON is the headline use case, but the type is broader than the format. Anything that parses into objects, arrays, and primitives can flow into a Variant, and the primitive set exceeds what JSON text can express. Data arriving from Avro sources, protocol buffers, or engine-native structs can be converted with type fidelity. Dremio, for example, offers TO_VARIANT for converting SQL-typed values while preserving their types, alongside PARSE_JSON for raw text. A date that enters through TO_VARIANT stays a real date inside the Variant, which JSON alone could never promise.

**What is the catch?** I have covered the write penalty and the storage overhead, so let me name the softer catch: observability. Shredding decisions are made by machines, per file, based on sampled data. When a hot query path underperforms, the reason may be that inference never shredded the path it filters on, and nothing at the SQL layer will tell you that directly. Until engines surface layout information natively, auditing tools that inspect Parquet footers fill the gap. Build the habit of verifying that your important paths actually got the columnar treatment, especially after changing write settings or data sources.

**Where does this leave the old string column pattern?** Retirement, gradually. There is no scenario where a fresh design should store JSON as varchar in an Iceberg v3 table. The one legitimate reason to keep raw text around is byte-exact archival of the original message for audit or replay, and even then, the text column should sit next to a Variant column rather than replace it. For existing tables, the migration is a rewrite: parse the string column into a Variant column, backfill, then repoint queries. It is real work, but every query on that data pays the parsing tax until you do it.

## Closing Thoughts

Semi-structured data stopped being an edge case a long time ago. Logs, events, telemetry, and API payloads make up an enormous share of what modern organizations actually collect, and the tooling for it inside open table formats had lagged behind the warehouses for years. The Variant type in Apache Iceberg v3 closes that gap, and shredding is the mechanism that makes it more than a convenience.

If you take one mental model away from this article, take this one. Variant stores every document in a compact binary form so nothing is ever lost, and shredding notices the structure your data repeats and quietly promotes it into real columns with real statistics. Common questions hit fast typed storage. Rare questions fall back to the binary. The engine decides per file, the reader adapts per file, and you write the same query either way.

The mailroom clerk files the invoices in the invoice drawer and keeps the envelope on the shelf. That is the whole idea. Everything else is careful engineering to make that idea safe, portable, and fast across an open ecosystem of engines.

If you found this style of explanation useful, this is exactly how I approach the books I write on data architecture and AI. I co-authored Apache Iceberg: The Definitive Guide and Apache Polaris: The Definitive Guide for O'Reilly, along with other titles on lakehouse architecture and agentic analytics, all aimed at making complex systems make sense. You can browse the full collection of my books on data and AI at [books.alexmerced.com](https://books.alexmerced.com).
