---
title: "The Parquet Versioning Problem, and Why Iceberg Cares About It"
date: "2026-07-28"
description: "Parquet files have a version field that doesn't reliably signal feature requirements. A new versioning discipline is coming, borrowing from Iceberg's format version model."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Parquet
  - Apache Iceberg
  - Data Engineering
  - File Formats
canonical: "https://iceberglakehouse.com/posts/parquet-versioning-iceberg-v4/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/parquet-versioning-iceberg-v4/).

# The Parquet Versioning Problem, and Why Iceberg Cares About It

A Spark job writes a table. A Trino query against the same table fails with a decoding error on one column. Nothing in the Iceberg metadata looks wrong. The schema matches, the snapshot is current, the manifest lists the file. The file itself is fine, and Spark reads it back without complaint.

The problem is that Spark wrote a Parquet encoding that this Trino build does not implement, and nothing in the system was designed to tell you that in advance. Not the table format, not the catalog, not the file. You found out by running a query in production.

This class of failure is old, quiet, and getting more common. Parquet is thirteen years old and holds more analytical data than any other format, and for most of that history features got added without a version discipline that lets a reader know what it is about to encounter. In July 2026 the Parquet community opened a formal vote to adopt versioned releases for breaking changes, borrowing a governance model Apache Iceberg refined over several years.

I work at Dremio, which builds a query engine that reads a lot of Parquet, so cross-engine compatibility is a thing I care about professionally. Everything below comes from the Parquet specification documentation and the public dev list.

This piece covers how Parquet classifies changes today, why the existing version fields do not solve the problem, what a versioning discipline changes, how Iceberg's format versions work as the model being borrowed, and how to test your own engine matrix so you find these failures before your users do.

## Two kinds of change, and only one is safe

The Parquet spec classifies changes by their effect on compatibility, and the axis that matters is forward compatibility: whether an older reader can read files written with a newer feature.

**Forward compatible** features stay readable by older readers, possibly with a degraded experience. Some metadata goes unused or performance suffers, and the reader does not fail.

Bloom filters are the clean example. A reader that does not understand bloom filters skips the pruning metadata and reads the data correctly. It does more work than a modern reader and returns the same answer.

Logical type annotations behave the same way. The `VARIANT` logical type annotates an underlying physical column. An older reader that has never heard of `VARIANT` reads the underlying `BYTE_ARRAY` as raw bytes. It does not get the semantic interpretation, and it does not crash.

**Forward incompatible** features make the data unreadable to older software.

New encodings are the main category. A reader that does not implement `DELTA_BINARY_PACKED`, `BYTE_STREAM_SPLIT`, or `RLE_DICTIONARY` cannot decode those column values. There is no degraded mode. The bytes are meaningless without the algorithm.

Data Page V2 headers are the other big one. A reader that only understands `DataPageHeader` cannot parse `DataPageHeaderV2` pages, so the page structure itself is opaque.

Here is how the two categories break down across real features.

| Feature | Category | First in format release |
|---|---|---|
| Page index | Forward compatible | 2.4.0 |
| xxHash bloom filters | Forward compatible | 2.7.0 |
| FLOAT16 logical type | Forward compatible | 2.10.0 |
| Size statistics | Forward compatible | 2.10.0 |
| GEOMETRY and GEOGRAPHY | Forward compatible | 2.11.0 |
| VARIANT and variant shredding | Forward compatible | 2.12.0 |
| IEEE 754 total order and NaN counts | Forward compatible | 2.13.0 |
| Data Page V2 | Forward incompatible | 2.0.0 |
| RLE_DICTIONARY and the DELTA_* encodings | Forward incompatible | 2.0.0 |
| ZSTD, BROTLI compression | Forward incompatible | 2.4.0 |
| Modular encryption | Forward incompatible | 2.7.0 |
| LZ4_RAW | Forward incompatible | 2.9.0 |
| BYTE_STREAM_SPLIT for additional types | Forward incompatible | 2.11.0 |

The pattern is worth reading twice. Type and statistics additions tend to be safe. Encodings and compression codecs tend not to be. That is not an accident of taste. Types and statistics are annotations layered over bytes a reader already knows how to interpret. Encodings change what the bytes mean.

## Inspecting what a file actually contains

Since the version field cannot be trusted, the practical skill is reading a file's real capability requirements out of its metadata. This is not hard and almost nobody does it.

Parquet metadata records, per column chunk, which encodings were used and which codec compressed it. That is the ground truth a reader needs.

```python
import pyarrow.parquet as pq

def describe_requirements(path: str) -> dict:
    """Report the encodings, codecs, and page types a file requires."""
    pf = pq.ParquetFile(path)
    meta = pf.metadata

    encodings = set()
    codecs = set()

    for rg in range(meta.num_row_groups):
        row_group = meta.row_group(rg)
        for c in range(row_group.num_columns):
            col = row_group.column(c)
            codecs.add(col.compression)
            for enc in col.encodings:
                encodings.add(enc)

    return {
        "path": path,
        "declared_version_field": meta.format_version,
        "created_by": meta.created_by,
        "num_row_groups": meta.num_row_groups,
        "num_rows": meta.num_rows,
        "encodings": sorted(encodings),
        "codecs": sorted(codecs),
    }


FORWARD_INCOMPATIBLE_ENCODINGS = {
    "RLE_DICTIONARY",
    "DELTA_BINARY_PACKED",
    "DELTA_LENGTH_BYTE_ARRAY",
    "DELTA_BYTE_ARRAY",
    "BYTE_STREAM_SPLIT",
}

FORWARD_INCOMPATIBLE_CODECS = {"ZSTD", "BROTLI", "LZ4", "LZ4_RAW"}


def risk_report(path: str) -> None:
    info = describe_requirements(path)
    risky_enc = set(info["encodings"]) & FORWARD_INCOMPATIBLE_ENCODINGS
    risky_codec = set(info["codecs"]) & FORWARD_INCOMPATIBLE_CODECS

    print(f"{path}")
    print(f"  written by: {info['created_by']}")
    print(f"  version field says: {info['declared_version_field']}")
    print(f"  forward-incompatible encodings: {sorted(risky_enc) or 'none'}")
    print(f"  forward-incompatible codecs:    {sorted(risky_codec) or 'none'}")
```

Run that across a sample of files from a table and the answer stops being a guess.

Two things in the output are worth dwelling on.

`created_by` records the writer that produced the file, usually including a version string. On a table written by several processes over several years, grouping files by `created_by` shows you the writer inventory nobody documented. In my experience this list is always longer than the team expects, and the surprise entries are where the compatibility problems live.

`declared_version_field` is there so you can see for yourself how little it correlates with anything. Compare it against the encoding list across a few hundred files. Files marked version 1 carrying `RLE_DICTIONARY` are common, and that single observation usually ends any plan to route on the field.

Extend the risky sets as the spec adds features. The classification lives in the Parquet documentation and updates when the community approves a change, so the maintenance burden is a quarterly glance rather than ongoing work.

Sample rather than scan everything. Twenty files from each partition of a large table gives a reliable picture, and a full inventory on a table with millions of files is a job in itself.

## The version field that does not tell you the version

Every Parquet file carries a `version` field in its Thrift `FileMetadata`. Reading that field looks like the obvious solution. It is not.

The field has historically been used inconsistently. Writers populate `1` or `2` with no consistent relationship to the features actually used in the file. A file marked version 2 does not reliably contain V2 data pages. A file marked version 1 is not guaranteed to avoid forward incompatible encodings.

The reason is straightforward and worth understanding rather than judging. The field predates the classification framework. Writers implemented it independently, each with a reasonable-looking interpretation, and no test suite forced them to agree. Thirteen years later there are billions of files carrying values that mean whatever the writer that produced them thought they meant.

That leaves a reader with one reliable option: parse the metadata, look at what encodings and page types the file actually uses, and decide whether it can handle them. This works. It also means the decision happens at read time, per file, after you already committed to the query.

The gap is a planning-time answer. Nothing in the system lets an engine say "I cannot read this table" before it starts working, because there is no table-level or file-level declaration of required capabilities that readers can trust.

## Release numbers do not help either

The next obvious place to look is the format release version. That also does not work, for a reason stated plainly in the documentation.

The Thrift definition releases independently of implementations like parquet-java or arrow-rs, following the Apache release process. That release version is not recorded in the FileMetaData at all. A file does not carry which parquet-format release its writer was built against.

And release numbering does not follow semantic versioning. Minor releases sometimes contain forward incompatible features. The jump from 2.10.0 to 2.11.0 added `BYTE_STREAM_SPLIT` for additional types, which is forward incompatible. Under semantic versioning a change that breaks existing readers is a major version bump. Parquet's numbering does not promise that.

So a reader cannot reason from the number. "This engine supports parquet-format 2.11.0" does not mean it reads every 2.11.0 file, and "this file was written by a 2.9.0 writer" does not mean a 2.9.0-era reader handles it.

What exists today is a documented table of which features landed in which release, plus an implementation status page recording which implementations support each feature. That is genuinely useful and it is documentation, meaning a human reads it and reasons about their stack. No software consults it at query time.

This is the concrete problem the versioning vote addresses. Not "Parquet lacks versions" but "Parquet's versions do not carry a promise a reader can act on."

## The precedent that already works

Parquet has solved this problem once, narrowly, and the solution is instructive.

Modular encryption is forward incompatible. A reader without encryption support cannot make sense of an encrypted file. Rather than let that fail confusingly, the spec changed the magic bytes.

Files with an encrypted footer use `PARE` instead of `PAR1`. A reader that does not support modular encryption sees magic bytes it does not recognize and fails immediately with a clear signal, rather than parsing a footer into nonsense. Files using plaintext footer mode keep `PAR1`, so legacy readers still read their unencrypted columns.

Both halves of that design are good. The incompatible case announces itself at the first four bytes. The partially compatible case degrades gracefully.

What it demonstrates is that Parquet already accepts the principle: when a feature makes a file unreadable to older software, the file should say so up front rather than at the point of failure. Versioned releases generalize that principle from one feature to all of them.

## What versioned releases change

The vote is to adopt versioned releases for breaking changes. The mechanics are still being settled, so treat specifics as provisional and the direction as clear.

The core of the change is a promise. A version number that means something a reader can rely on gives three things nobody has today.

**A declaration a reader checks cheaply.** If a file or a table declares "requires format version N," a reader supporting up to N minus 1 fails fast with an accurate message. That turns a decoding error deep in a scan into a planning-time rejection with a name attached.

**A negotiation point.** Writers that know their readers pick a version everyone handles. A pipeline writing for a mixed fleet targets the lowest version in the fleet. Today the equivalent is disabling specific encodings by name in writer configuration, which requires knowing which encodings to worry about.

**A pruning discipline on the spec.** This is the underrated part. Version boundaries create places where a format removes things. Without them, every representation ever added has to be supported by every implementation forever. Parquet carries deprecated features from a decade ago because there has never been a boundary at which dropping them was legitimate. `BIT_PACKED` is deprecated. `INT96` is deprecated. `LZ4` is deprecated. They are all still in the spec.

The tradeoff is real and the community is debating it. Version boundaries fragment the ecosystem while implementations catch up. Every engine that lags a version becomes a compatibility problem for anyone writing at that version. The cost is paid in coordination.

The counterargument, which I find persuasive, is that the fragmentation exists already. It is just undocumented. A Trino build that cannot decode `BYTE_STREAM_SPLIT` for a given type is already incompatible with a Spark writer that produces it. Versioning does not create the incompatibility. It names it.

## The cost of never removing anything

The argument for version boundaries becomes concrete when you look at what Parquet still carries.

`BIT_PACKED` is deprecated. `INT96` is deprecated. `PLAIN_DICTIONARY` was superseded by `RLE_DICTIONARY`. The original `LZ4` codec is deprecated in favor of `LZ4_RAW`. The `ConvertedType` enum was superseded by the `LogicalType` union in release 2.4.0 and formally deprecated in 2.9.0. All of them remain in the spec.

That backlog has three costs, and each one falls on someone different.

**Implementers pay in surface area.** A new Parquet reader has to handle every historical representation to claim compatibility. That is a substantial amount of code implementing things nobody has written intentionally in years. It raises the barrier to a new implementation, which matters because the ecosystem benefits from having several.

**Users pay in confusion.** `INT96` timestamps are the clearest case. They are deprecated, they still show up in files produced by older tooling, and different readers handle them differently. A team hitting that in 2026 is debugging a decision made by a Hadoop-era writer nobody at the company remembers installing.

**The format pays in inertia.** Adding a representation is easy and removing one has been impossible, so the type and encoding surface only grows. With a wave of machine-learning-driven additions arriving, growth without pruning is a trajectory toward a format that is expensive to implement correctly and easy to implement incorrectly.

Compare against Iceberg's V3 deprecation of position delete files. The spec said new tables must not add them, existing ones stay valid, and engines converge over a long tail. Two years from that decision, implementers have a clear signal about what to invest in, and the representation genuinely goes away.

That is what a version boundary buys. Not the ability to break things, which nobody wants, but a legitimate place to stop writing something so it eventually stops needing to be read.

The counterweight is that Parquet's install base is far larger than Iceberg's and much older. Files written in 2015 are still queried. Any removal discipline has to assume a very long tail, longer than a table format needs to assume, because a table format at least knows which files belong to it. A Parquet file sitting in a bucket belongs to nobody.

## The model Parquet is borrowing

Iceberg has run a format version discipline for years, and the process is worth describing because it is what the vote points at.

Iceberg format versions are integers on a table. V1 was append-only with no row-level deletes. V2 added merge-on-read through position and equality delete files. V3 added deletion vectors, row lineage, and default column values. V4 is in active discussion.

Four properties make it work.

**The version is on the table, not the file.** A reader loads table metadata, sees `format-version: 3`, and knows immediately whether it can proceed. That check happens once at planning time, not per file during a scan.

**Upgrades are explicit and metadata-only.** Moving a table from V2 to V3 changes a field in metadata. It does not rewrite data. The operation is fast, and the cost lands entirely on the reader side, which is where you want it because that is where you test.

**Versions remove things.** V3 deprecated position delete files. Position delete files must not be added to V3 tables, and existing ones stay valid. That is a spec removing a representation it decided was a dead end, which is a thing format specs almost never manage to do.

**Old data stays readable.** Deprecation targets the write path first. Files written under the old rules remain valid for a long tail while engines converge.

That last pair is the design insight. Removal is achievable when you separate "stop writing this" from "stop reading this" and put years between them. Parquet, without version boundaries, has never had a mechanism for the first half.

The layers are also co-evolving rather than independent. Iceberg's ambitions around efficient column updates depend on Parquet metadata getting cheaper, which is what the footer redesign work targets. Arrow's ecosystem supplies much of the implementation effort on both sides. Parquet adopting a versioning discipline is partly Parquet needing one for its own sake, and partly the table format above it needing a substrate whose capabilities can be reasoned about.

## Capability signaling and where Iceberg V4 fits

The recommendation that prompted this article framed Iceberg V4 as introducing capability flags that negotiate with Parquet versions. I want to be careful here, because that is further along than the actual state.

What is true: V4 is in active discussion, several of its threads concern how the format handles features engines implement unevenly, and the Parquet footer redesign is being discussed alongside the V4 metadata debates by overlapping people. The two conversations reference each other constantly.

What is not settled: any specific capability negotiation protocol between the two layers. I have not seen a ratified design, and writing about one as though it exists does readers a disservice.

What I take from watching both lists is a shared direction rather than a shared mechanism. Both communities have concluded that "write it and find out whether the reader copes" is not adequate for a substrate this widely deployed. Iceberg reached that conclusion earlier because table-level metadata gave it an obvious place to record a version. Parquet is reaching it now, with the harder problem of retrofitting the discipline onto a format with billions of existing files and no reliable version field.

If you want to track this properly, watch the Parquet dev list versioning thread and the Iceberg V4 spec discussions together. The single longest thread on the Parquet list in recent memory, running past eighty messages, is about exactly this question.

## Testing your own engine matrix

Everything above is context. This is the part you act on.

You have some set of engines reading the same tables. The compatibility question is empirical, and the test takes an afternoon.

Build a table that exercises the features you care about, then read it from every engine.

```python
import pyarrow as pa
import pyarrow.parquet as pq

schema = pa.schema([
    ("id", pa.int64()),
    ("name", pa.string()),
    ("price", pa.float64()),
    ("small_float", pa.float16()),
    ("ts_nanos", pa.timestamp("ns")),
    ("uid", pa.uuid()),
])

table = pa.table(
    {
        "id": pa.array(range(1000), type=pa.int64()),
        "name": pa.array([f"item-{i}" for i in range(1000)]),
        "price": pa.array([float(i) * 1.5 for i in range(1000)]),
        "small_float": pa.array([float(i) for i in range(1000)],
                                type=pa.float16()),
        "ts_nanos": pa.array([1_700_000_000_000_000_000 + i
                              for i in range(1000)],
                             type=pa.timestamp("ns")),
        "uid": pa.array([bytes(range(16))] * 1000, type=pa.uuid()),
    },
    schema=schema,
)

# One file per configuration you want to test
configs = {
    "v1_snappy_plain": dict(
        version="1.0", compression="snappy",
        use_dictionary=False, data_page_version="1.0",
    ),
    "v2_zstd_dict": dict(
        version="2.6", compression="zstd",
        use_dictionary=True, data_page_version="2.0",
    ),
    "v2_bytestreamsplit": dict(
        version="2.6", compression="zstd",
        column_encoding={"price": "BYTE_STREAM_SPLIT"},
        data_page_version="2.0",
    ),
    "v2_bloom": dict(
        version="2.6", compression="zstd",
        write_bloom_filter=["id", "name"],
        data_page_version="2.0",
    ),
}

for name, opts in configs.items():
    pq.write_table(table, f"/tmp/compat_{name}.parquet", **opts)
    print(f"wrote {name}")
```

Each configuration isolates one axis. `v1_snappy_plain` is the maximally conservative baseline every reader in existence handles. `v2_zstd_dict` combines Data Page V2, ZSTD compression, and dictionary encoding, all forward incompatible individually. `v2_bytestreamsplit` targets the encoding that landed most recently in the forward incompatible category. `v2_bloom` tests a forward compatible feature, and any reader that fails on it has a bug rather than a version gap.

Then read every file from every engine and record the outcome:

```sql
-- Run this from each engine against each file
SELECT count(*)          AS row_count,
       sum(id)           AS id_checksum,
       min(ts_nanos)     AS min_ts,
       max(small_float)  AS max_f16
FROM parquet_scan('/tmp/compat_v2_bytestreamsplit.parquet');
```

The checksums matter more than the count. A reader that silently mishandles an encoding sometimes returns the right number of rows with wrong values, and a count-only test passes. Sum the numeric columns and compare across engines.

Record the result in a matrix: engine version down the side, configuration across the top, pass or fail in the cells. That matrix is the artifact. It tells you what your writers are allowed to produce, and it is the thing to rerun after any engine upgrade.

Then pin your writers to the intersection. If one engine in your fleet fails on `BYTE_STREAM_SPLIT`, configure your writers to not produce it, table by table if necessary. This is configuration you set deliberately rather than a default you inherit.

## Who actually bears the coordination cost

The versioning debate is partly technical and mostly about who absorbs the work. Understanding the shape of the ecosystem explains why the discussion has run past eighty messages.

Parquet has several independent implementations. parquet-java sits under Spark and much of the JVM ecosystem. arrow-cpp and its Python bindings cover the Arrow and pandas world. arrow-rs covers the Rust engines. There are others, including implementations inside commercial engines that are not public. Each one moves at its own pace, driven by its own maintainers and its own users.

A feature approved on the dev list ships in the next parquet-format release, which is a Thrift definition. Implementations pick it up whenever they pick it up. The documentation maintains an implementation status page precisely because "is this feature available" has a different answer per implementation.

That structure produces an asymmetry. A writer implementation adds a new encoding and gets a performance win immediately. Reader implementations across the ecosystem then have to catch up, and until they do, every file using that encoding is a compatibility hazard. The benefit is local and the cost is distributed.

Versioned releases redistribute that. A writer producing files at version N is making a claim readers can check, which moves the burden of compatibility from "everyone discovers the problem in production" to "the writer decided what to target." That is a better allocation, and it also constrains writers more than they are constrained today, which is where the debate gets spirited.

For practitioners, the actionable read is this: your compatibility exposure depends on which implementation each engine in your stack uses, not on engine branding. Two engines both "supporting Parquet" behave differently because they embed different implementations at different versions. When you build the test matrix I described earlier, record the underlying implementation and its version alongside the engine name. That column explains most of the results.

## The statistics wrinkle

One more compatibility axis deserves mention, because it bites differently from encodings and is easy to miss.

Parquet carries statistics: min and max values per column chunk, null counts, and more recently size statistics and geospatial statistics. Engines use them for pruning. A reader that skips a row group because the max value in a column is below the filter predicate never reads that data, which is where a large share of Parquet's speed comes from.

Statistics are forward compatible in the sense that matters for reading. An older reader that does not understand size statistics ignores them and reads correctly, just with less pruning.

The wrinkle is correctness rather than readability. Statistics have to agree with the data, and different writers have historically had different ideas about edge cases. Sorting order for strings depends on collation. Comparison for floating point depends on how you treat NaN. A writer that records a max using one comparison rule and a reader that prunes using another produces a query that skips a row group containing matching rows, which is a wrong answer with no error message.

The community has been working this. IEEE 754 total order and NaN counts landed as a forward compatible addition in release 2.13.0, approved on 2026-05-26, which gives floating point statistics a defined ordering instead of leaving it to individual implementations to decide for themselves. Collation for string comparison is an open discussion on the Iceberg side too, where it has to reconcile cross-engine consistency against the freedom to upgrade ICU versions. Whatever that discussion decides will echo in every engine that sorts strings, which is all of them.

There is also an unresolved multi-engine statistics conflict on the Iceberg list, concerning which layer owns statistics and what happens when the two layers disagree. Iceberg keeps column-level statistics in its manifests, and Parquet keeps them in file metadata. When those disagree, because one was written by a different engine or updated at a different time, the behavior depends on which one your engine trusts.

For practitioners, two things follow.

Add a pruning correctness check to your test matrix. Write a file with values that stress the edges, meaning NaN, negative zero, empty strings, and strings that differ only in case or accent. Query with predicates that should and should not match. A reader that returns different row counts from another reader on the same predicate has a statistics disagreement, not an encoding problem, and the diagnosis is completely different.

Treat statistics disagreements as higher severity than decode failures. A decode failure is loud and stops the pipeline. A statistics disagreement returns fewer rows than it should and looks like a normal answer. The first costs you an afternoon. The second costs you a quarter of reporting that nobody questioned.

## Failure modes

**Silent wrong answers on partially supported encodings.** The worst case. A reader parses a page it does not fully understand and returns plausible garbage. Warning sign: aggregates that disagree between engines on the same table. Fix: checksum comparisons across engines in your test matrix, not just row counts.

**An engine upgrade changes the writer defaults.** A Spark or Arrow upgrade flips a default encoding or bumps the default data page version, and files written after the upgrade stop reading on a lagging engine. Warning sign: failures that start at a deployment boundary and affect only new partitions. Fix: pin writer properties explicitly rather than relying on defaults, and rerun the matrix after every engine upgrade.

**Trusting the FileMetadata version field.** Somebody builds tooling that reads the `version` field and routes based on it. Since writers populate it inconsistently, the routing is wrong in ways that depend on which writer produced each file. Warning sign: compatibility tooling that works for some sources and not others. Fix: inspect actual encodings and page types instead.

**Mixed writers on one table.** A table written by both Spark and a Python job accumulates files with different encoding profiles. A reader that handles the Spark files fails on the Python ones, and the failure looks intermittent because it depends on which files a query touches. Warning sign: the same query succeeding and failing depending on its filter predicate. Fix: standardize writer configuration across every process writing to a table, and treat that config as part of the table's contract.

**Compaction rewriting into a newer profile.** A compaction job runs with different defaults than the original writer and rewrites old files into encodings a downstream reader cannot handle. The table was fine yesterday. Warning sign: read failures on partitions that were recently compacted. Fix: give maintenance jobs the same pinned writer configuration as ingestion.

**Assuming Iceberg protects you.** The table format tracks which files belong to a table and what the schema is. It does not validate that every reader can decode every file. An Iceberg table is exactly as compatible as the Parquet files under it. Warning sign: a team treating format-version 2 as a compatibility guarantee. Fix: understand that the two layers version independently, and test both.

**Deprecated features still in production.** `INT96` timestamps are deprecated and still written by older tooling. Some modern readers handle them grudgingly and some not at all. Warning sign: timestamp columns that read as integers or fail outright on newer engines. Fix: identify and rewrite `INT96` columns rather than carrying them forward indefinitely.

## Operational guidance

**Pin writer properties for every table.** Compression codec, dictionary usage, data page version, and any column-specific encoding. Write them down as table properties or pipeline configuration, and treat a change to them as a change requiring the same testing as a schema change.

**Set your baseline at the least capable reader in your fleet.** Every engine that reads a table constrains what writers to that table produce. Inventory those engines, including the ones nobody remembers, like a reporting tool with an embedded Parquet reader from four years ago.

**Rerun the matrix on every engine upgrade.** This is a twenty-minute automated job once you build it. The value is not the first run, it is the twentieth, when an upgrade quietly changes something.

**Track the parquet-format release notes for forward incompatible additions.** The documentation maintains the classification and the release each feature landed in. A new forward incompatible feature is a signal to check whether your writers have started producing it.

**Prefer forward compatible features when you have a choice.** Bloom filters, page index, size statistics, and the newer logical types improve performance and readability without risking a reader. They are the safe part of the surface, and most teams under-use them while worrying about the risky part.

**Use Iceberg format version as a separate axis in your planning.** Table format version and file format capabilities are independent. Upgrading a table to Iceberg V3 does not change what Parquet features its files use, and switching a writer to a newer Parquet encoding does not change the Iceberg version. Track both.

**Record the Parquet implementation, not just the engine.** Two engines at similar release dates behave differently because they embed different Parquet implementations. Your matrix needs a column for the implementation and its version, and that column is what makes the results explicable rather than mysterious.

**Audit `created_by` on your largest tables once.** Group files by writer string. The exercise takes an hour and produces the writer inventory that your compatibility policy actually has to cover, including the processes nobody documented.

**Keep a conservative escape hatch.** For every table, know the writer configuration that produces maximally compatible files, and be able to switch to it. When a compatibility incident hits, rewriting a partition in the conservative profile buys you time while you work out the real fix.

## What to do about a compatibility incident in progress

The abstract version of this problem is interesting. The version where a pipeline is broken right now needs a different treatment, so here is the sequence.

**Identify the failing read precisely.** Which engine, which table, which files. Iceberg helps here, because the manifest tells you exactly which files a query touched. Narrow to one file that reproduces the failure before doing anything else. A compatibility failure that reproduces on one file is a twenty-minute problem. One described as "queries are failing" is a day.

**Run the metadata inspection on that file.** Encodings, codec, page version, `created_by`. Compare it against a file from the same table that reads correctly. The difference is almost always a single encoding or codec, and now you know what you are dealing with.

**Check whether the difference is recent.** Sort the table's files by modification time and inspect a sample from before and after the failure started. A change that begins at a specific timestamp points at a deployment. A profile that has always been mixed points at a reader that recently changed rather than a writer.

**Decide between rewriting data and upgrading the reader.** Upgrading the lagging engine is the correct fix and often the slower one. Rewriting the affected files in a conservative profile is a workaround and often available within the hour. Do the workaround to restore service, then do the fix.

The rewrite looks like this, using whatever engine can read the files:

```sql
-- Set conservative writer settings BEFORE rewriting
ALTER TABLE catalog.sales.orders SET TBLPROPERTIES (
  'write.parquet.compression-codec' = 'snappy',
  'write.parquet.page-version'      = 'v1'
);

CALL catalog.system.rewrite_data_files(
  table   => 'sales.orders',
  where   => 'event_date >= cast(:cutoff as date)',
  options => map('min-input-files', '1')
);
```

Setting the table properties before the rewrite is what makes the rewrite produce compatible output. Running the rewrite first and setting properties afterward produces files in the same profile you were trying to escape, which is a mistake I have watched people make under time pressure.

**Then close the loop.** Add the failing configuration to your test matrix. The incident happened because that combination was untested, and an incident that does not produce a test is an incident you get to have again.

One judgment call worth naming. There is a temptation, during an incident, to set every writer in the estate to the most conservative profile permanently. That works and it costs you real performance, since ZSTD compression and dictionary encoding earn their keep. Scope the conservative profile to the tables the lagging reader touches rather than applying it everywhere, and revisit once the reader catches up.

A related judgment call concerns partial rewrites. Rewriting only the affected partitions leaves the table with a mixed encoding profile, which is the condition that produced intermittent failures in the first place. That is acceptable as a deliberate temporary state and dangerous as a permanent one. Write down which partitions are in which profile, and set a date to reconcile them.

## Where this is heading

Three things to watch, in rough order of when they resolve.

The versioning vote itself. Whether it passes, and what the resulting discipline looks like in detail. The outcome shapes what remedies are available for the other problems on the list, which is why it is being watched so closely.

The footer redesign. Parquet's footer carries metadata that has grown expensive to parse on wide tables, and a working group has been meeting openly on restructuring it. Alongside it runs a proposal to support non-contiguous pages, loosening layout constraints so writers organize data and metadata more flexibly. Consensus that the problem is real is complete. Consensus on the remedy is not formed, and the versioning outcome determines which remedies are deliverable at all.

The type system extensions for machine learning workloads. Variant for semi-structured data and geospatial types are already in. Proposals for embeddings and unstructured payloads are in discussion. The 2013 format assumed data was numbers, strings, and dates. The pressure now comes from workloads where data is whatever a model touches, and that pressure is what makes the versioning question urgent rather than academic. A format about to add a lot of new representations needs a mechanism for retiring old ones.

My read as of this writing: the direction is settled and the details are not. Anyone building on Parquet should expect the compatibility story to get better over the next two years and expect some coordination pain along the way.

## Conclusion

The compatibility failures teams hit with Parquet across engines are not mysterious once you know the framework. Some features stay readable by older readers and some do not, the spec classifies which is which, and nothing in a Parquet file reliably tells a reader in advance which category it falls into.

The `version` field in FileMetadata has been populated inconsistently for a decade and cannot be trusted. Release numbers are not recorded in files and do not follow semantic versioning, so a minor release sometimes breaks older readers. The one place Parquet does signal incompatibility clearly, the `PARE` magic bytes on encrypted footers, shows the pattern works when applied.

The versioning vote generalizes that pattern, borrowing a discipline Iceberg has run for years: an explicit version, cheap for readers to check, that creates boundaries at which the format removes things it regrets.

Until that lands, the practical work is yours and it is not hard. Build the compatibility matrix for your engine fleet. Pin writer configuration to the intersection of what your readers handle. Rerun the matrix on every upgrade. That turns a class of production surprises into a test that runs on a schedule, which is where this kind of problem belongs.

## Keep Going

If this piece was useful, I have written a lot more on the open lakehouse stack and how its layers fit together. *Architecting an Apache Iceberg Lakehouse* from Manning covers the file format, table format, and catalog layers as a system, including the cross-engine compatibility decisions that span them. *Apache Iceberg: The Definitive Guide*, which I co-authored for O'Reilly, goes deeper on the table format's own version discipline. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
