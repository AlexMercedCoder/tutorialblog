---
title: "FSST and ALP: The Two Encodings Fixing Parquet's Weakest Compression Cases"
date: "2026-08-25"
description: "ALP and FSST target Parquet's worst cases: floats and high-cardinality strings. How they work and what they change for Iceberg tables."
author: "Alex Merced"
category: "Apache Iceberg"
canonical: https://iceberglakehouse.com/posts/fsst-alp-parquet-encodings/
tags:
  - Apache Parquet
  - encodings
  - ALP
  - FSST
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/fsst-alp-parquet-encodings/).

Look at the byte breakdown of a large Parquet table in a lakehouse and two column types dominate out of proportion to their row count. The first is high-cardinality strings: user agents, URLs, log messages, JSON fragments, free-text fields. The second is floating-point measurements: sensor readings, prices, model scores, embedding components. Both compress badly under the encodings Parquet has shipped for a decade, and both are becoming a larger share of what gets written as observability and AI workloads move into Apache Iceberg tables.

The symptom is easy to spot. Dictionary encoding on a string column with 40 million distinct values falls back to plain encoding, and a Zstandard block compressor gets a modest ratio on it while burning CPU on every read. A double column of sensor values compresses to maybe 80 percent of its raw size, because the low bits of IEEE 754 doubles look random to any byte-oriented compressor. You pay for storage, you pay for the bytes scanned, and you pay again for the decompression on every query.

In 2026 the Apache Parquet community is adding two encodings that attack exactly these cases. Adaptive Lossless floating-Point (ALP) compression targets doubles and floats. Fast Static Symbol Table (FSST) targets strings. The vote to add ALP to the format passed in late July with 11 +1 votes, 7 of them binding. FSST finished final design review in mid-August and is moving into implementation across the reference libraries. This article explains how each one works from first principles, where they stand in the standardization process, what they change for Iceberg tables, and how to plan for them.

A note on affiliation: I work at Dremio, which builds a lakehouse platform on Parquet, Arrow, and Iceberg. Nothing in this piece is Dremio-specific. These are open format changes that every reader and writer will pick up.

## Why General-Purpose Compression Struggles Here

To see why Parquet needs new encodings rather than a better compressor, it helps to separate the two layers Parquet already has.

Encoding is how values are laid out in a page before any compression runs. Parquet has a handful: plain, dictionary (RLE_DICTIONARY), run-length and bit-packing for small integers, delta encodings for integers and byte arrays, and byte stream split for floating point. Encodings are type-aware. A delta encoding knows it is looking at integers and stores differences. A dictionary knows it is looking at repeated values and stores each once.

Compression is a general-purpose codec applied to the encoded page bytes: Snappy, Zstandard, LZ4, Gzip, Brotli. Compressors are type-blind. They look for repeated byte sequences and entropy skew in a stream of bytes and know nothing about what the bytes mean.

The stack works well when the encoding exposes structure the compressor can exploit. Dictionary encoding turns a column of repeated strings into small integer codes, and Zstandard compresses those codes tightly. Delta encoding turns sorted timestamps into small deltas, and bit-packing squeezes them.

The stack fails when the encoding cannot find structure, which is exactly the two cases above.

High-cardinality strings defeat dictionary encoding by definition. Once the dictionary page hits its size limit, writers fall back to plain encoding, which is just length-prefixed bytes. A block compressor then looks for repeated byte sequences across the page. It finds some (URLs share prefixes, log lines share templates), but it has to work with a sliding window and generic matching, and decompression means running that codec across the whole page before you can read a single string. There is no way to fetch the 500th string without decompressing the 499 before it.

Floating-point values defeat everything. A double is 64 bits: 1 sign bit, 11 exponent bits, 52 mantissa bits. For real-world measurements the sign and exponent are predictable, but the mantissa carries the precision, and its low bits are effectively random from a byte compressor's point of view. Byte stream split helps by grouping the high bytes of every value together (which compress) and the low bytes together (which do not), but it leaves most of the mantissa untouched. Compressors routinely achieve ratios of 1.1 to 1.3 on double columns that a human looking at the data (which has two or three decimal places of real precision) knows should compress far better.

Both problems have the same root cause. The encoding layer is not extracting the structure that is actually there, so the compression layer has nothing to work with. The fix has to happen in the encoding layer. That is what FSST and ALP are.

## How FSST Works

FSST was introduced in a 2020 VLDB paper by Peter Boncz, Thomas Neumann, and Viktor Leis, and it has been in production in DuckDB, MonetDB, and several commercial engines since. The idea is a compression scheme built specifically for short strings that need to be decoded individually and fast.

The core structure is a symbol table of at most 255 entries. Each symbol is a byte sequence of 1 to 8 bytes. The encoder scans the input and replaces every occurrence of a symbol with its 1-byte code. Bytes that are not part of any symbol are emitted as an escape (code 255) followed by the literal byte. The output for each string is a sequence of 1-byte codes plus occasional escapes.

Three properties of this design matter for a columnar file format.

Decoding is a table lookup with no state. To decode a string, you walk its codes, and for each code you copy the symbol's bytes from the table. There is no sliding window, no back-references to earlier output, and no dependency between one string and the next. That means decoding one string does not require decoding any other, so the format keeps random access. An engine that wants the 500th string in a page reads its codes and expands them, skipping the other 499 entirely. This is the property that block compressors lose and dictionary encoding keeps, and FSST keeps it while handling high cardinality.

The symbol table is small. 255 symbols of up to 8 bytes is at most 2 kilobytes. It fits in L1 cache. Decoding a page is a tight loop over codes with cache-resident lookups, which is why FSST decodes at speeds comparable to memcpy in the original benchmarks. Building the table is the expensive part, and it happens once per page (or per column chunk, depending on the spec's final granularity) at write time.

Compression ratio comes from the symbol selection. The encoder trains the table by sampling the input, counting which byte sequences appear most often, and iteratively picking the set of up to 255 symbols that covers the most bytes. On text-heavy columns this lands around 2x to 3x depending on the corpus, in the same range as LZ4 on the same data but with random access and much faster decode. Arnav Balyan's original proposal to the Parquet list cited ratios up to 3.3x with minimal read and write overhead.

There is one more benefit that is easy to overlook. FSST-encoded strings can be compared for equality without decoding, because two strings encoded with the same symbol table produce the same code sequence if and only if they are the same string. A filter like `WHERE user_agent = 'Mozilla/5.0 ...'` encodes the literal once and compares codes. Prefix matching and ordering are more complicated and depend on the table, so engines fall back to decoding for those, but equality and hashing (for joins and group by) work on the compressed representation.

The August 2026 discussions on the Parquet list settled the remaining design questions. Julien Le Dem asked whether the spec should stick with the original 8-bit codes or allow larger code sizes. Prateek Gaur ran a comparison across 30 string columns and found that the dominant variable for compression ratio was how much of the column the writer samples before choosing symbols, not the code width or the search algorithm. That finding pushed the design toward a single encoding with fewer spec-level knobs: the writer trades compression against encode throughput by sampling more or less, and no format change is needed to tune it.

## How ALP Works

ALP comes from a 2024 SIGMOD paper by Azim Afroozeh, Leonardo Kuffo, and Peter Boncz, and it is already used in DuckDB and several other engines. The observation behind it is that real-world doubles are not random. They are decimal numbers that were converted to binary. A price of 19.99, a temperature of 72.4, a sensor reading of 0.0312 all started as short decimals, and the mantissa noise that defeats compressors is an artifact of the binary representation, not information.

ALP recovers the decimal. For a vector of doubles (typically 1,024 values), it searches for a pair of small integers, an exponent e and a factor f, such that for as many values as possible:

```
round(value * 10^e) / 10^f
```

produces an integer that, when converted back through the inverse operation, reproduces the original double bit for bit. For a column of prices with two decimal places, e = 2 and f = 0 works for nearly every value: 19.99 becomes 1999, and 1999 / 100 gives back exactly 19.99 in IEEE 754. The encoder verifies the round trip for every value, so the encoding is lossless by construction.

The resulting integers are small and clustered, which is the case Parquet's existing integer machinery handles best. ALP applies frame-of-reference (subtract the minimum) and bit-packing (store each value in the minimum bits needed for the range). A vector of 1,024 prices between 0.01 and 999.99 becomes 1,024 integers between 1 and 99,999, which fit in 17 bits each. That is 2,176 bytes instead of 8,192, before any general-purpose compression runs on top.

Values that do not fit the pattern are exceptions. A double like 0.1 + 0.2 in floating point (which is 0.30000000000000004) does not round trip through any small e and f. ALP stores such values verbatim in a separate exceptions list along with their positions, and the main vector stores a placeholder. The encoder chooses e and f to minimize the total size including exceptions, and when exceptions dominate, it switches strategies.

That switch is the second half of ALP, called ALPrd (for "real doubles"). Some columns are genuinely high-precision: scientific measurements, results of floating-point arithmetic, values that never were decimals. For those, ALPrd splits each double into a left part (the high-order bits, typically 16) and a right part (the remaining bits). The left parts cluster heavily because the sign, exponent, and top mantissa bits are similar across a column, so ALPrd dictionary-encodes them. The right parts are bit-packed as-is. This gets a modest but consistent ratio on data where the decimal trick fails.

The encoder samples each vector, tries both schemes, and picks the smaller result. That is the "adaptive" in the name. The Parquet sync notes from the proposal phase reported the prototype landing around 3x better than current encodings on the evaluation datasets, with the ALPrd fallback covering the high-precision cases.

Decoding is the inverse and it vectorizes cleanly. Unpack bits, add the frame of reference, multiply by a constant, patch in exceptions. Every step is a SIMD-friendly loop over a fixed-size vector, which is why ALP decodes faster than Zstandard decompresses on the same data.

## Where Each Encoding Stands in the Standard

The two encodings are at different points in Parquet's process, and the process itself changed this summer in a way that affects how fast they ship.

ALP is approved. Prateek Gaur announced in late July 2026 that the vote to add ALP to the Parquet format passed with 11 +1 votes, 7 binding. The specification had been through review since late 2025, a C++ prototype in Apache Arrow was available for evaluation, and example files were added to the parquet-testing repository so implementations can verify against known-good output. The community solicited feedback from Polars, cuDF, and other downstream projects before the vote so that the encoding did not surprise anyone who has to implement it. The next step is reference implementations across the language libraries.

FSST is in implementation. Arnav Balyan announced in the second week of August that the proposal had finished final design review and was moving from design to code. Devan Benz has an Arrow Rust implementation underway, Balyan has an Arrow C++ proof of concept, and the group is recruiting owners for Parquet Java and Arrow Go implementations. Those implementations are a prerequisite for the formal vote, because the Parquet community now requires cross-language interoperability before a format change is finalized. An encoding that only one library can read is worse than no encoding.

There is a related encoding called OnPair that Prateek Gaur benchmarked against FSST across 30 string corpora. OnPair decodes faster than every compressed alternative he measured and wins on ratio for most text-heavy columns, at the cost of substantially slower encoding due to its training pass. The discussion concluded that the sampling budget, not the algorithm, is the main lever, which favors shipping one string encoding with a tunable writer rather than two encodings in the spec. Watch this thread if you care about the final shape of string compression in Parquet.

The process change that matters most is the versioning vote. In mid-August, Julien Le Dem closed a vote on using version numbers to release forward-incompatible changes, with 5 binding +1s, 9 non-binding +1s, and no vetoes. For a decade, Parquet has been constrained by the rule that old readers must not break on new files, which made every new encoding a negotiation. The versioning proposal gives the format a formal mechanism for shipping changes that old readers cannot process. New encodings still aim for forward compatibility where possible (an old reader that hits an unknown encoding fails clearly rather than reading garbage), but the community now has a way to make bigger changes without holding them hostage to the oldest deployed reader.

## What This Means for Iceberg Tables

Here is the part that trips people up: Apache Iceberg does not know or care which Parquet encoding a column uses. Iceberg tracks files, partitions, snapshots, and column-level statistics. It reads the Parquet footer for row group and page statistics and never looks at how the pages are encoded. Encoding is a property of the column chunk inside the file, chosen by the writer.

That has three practical consequences.

First, adopting FSST or ALP in an Iceberg table is a writer-side decision. Once your Parquet library supports the encoding and you enable it in writer properties, new data files use it. Old data files keep their old encodings. A single Iceberg table can hold files with plain, dictionary, FSST, and byte-stream-split encodings on the same column across different snapshots, and readers handle each file according to its own footer. No table migration, no metadata change, no rewrite required. If you want old files converted, run a data file rewrite (compaction), which reads with the old encoding and writes with the new one.

Second, every reader of the table has to support the encoding before any writer uses it. This is the same discipline that applies to format version upgrades, but it is easier to forget here because nothing in the Iceberg metadata signals the change. A Spark job writes ALP-encoded doubles, and a Python service reading with an older pyarrow fails on that file with an unknown-encoding error. Inventory your readers before you flip the writer setting.

Third, Iceberg's statistics keep working. Min, max, null count, and value count are computed by the writer on the logical values and stored in the footer regardless of encoding. Partition pruning, file skipping, and page index pruning operate on those statistics and see no difference. ALP's exceptions and FSST's symbol tables are internal to the page.

For the query engine, the encodings change the read path. An engine with a vectorized Parquet reader adds an ALP decoder (bit unpack, scale, patch exceptions) and an FSST decoder (code lookup) next to its existing dictionary and delta decoders. Engines that decode into Apache Arrow get an interesting option: Arrow has no native ALP or FSST array type, but the Parquet sync notes recorded the question of whether new encodings should be supported in Arrow to enable processing on encoded values. If that happens, an engine gets to evaluate equality filters on FSST codes without expanding strings and aggregate ALP integers without converting to doubles. Dremio's engine, which is Arrow-native, is one of several that stand to benefit from that, along with DataFusion, DuckDB, Polars, and any other Arrow-based reader.

## A Worked Example of ALP in Python

The best way to internalize ALP is to run the core loop on real numbers. The following is a simplified reference implementation of the decimal-scaling half of ALP. It is not the Parquet encoding (the bit layout, vector size, and exception format are defined by the spec), but it is the same algorithm, and it will show you exactly why the trick works and where it fails.

```python
import struct
import math

def bits(x: float) -> int:
    """Return the IEEE 754 bit pattern of a double as an integer."""
    return struct.unpack("<Q", struct.pack("<d", x))[0]

def try_encode(values, e, f):
    """
    Attempt to encode a list of doubles with exponent e and factor f.
    Returns (encoded_integers, exceptions) where exceptions is a list
    of (position, original_value) for values that do not round-trip.
    """
    scale = 10.0 ** e
    unscale = 10.0 ** f
    encoded = []
    exceptions = []
    for i, v in enumerate(values):
        n = round(v * scale / unscale)
        back = n * unscale / scale
        if bits(back) == bits(v) and abs(n) < 2**48:
            encoded.append(n)
        else:
            encoded.append(0)             # placeholder
            exceptions.append((i, v))
    return encoded, exceptions

def choose_parameters(values, max_e=18):
    """
    Search a small grid of (e, f) pairs and pick the one that
    minimizes bits for the packed integers plus exception storage.
    """
    best = None
    for e in range(0, max_e + 1):
        for f in range(0, e + 1):
            enc, exc = try_encode(values, e, f)
            lo, hi = min(enc), max(enc)
            width = max(1, (hi - lo).bit_length())
            cost = len(enc) * width + len(exc) * (64 + 16)
            if best is None or cost < best[0]:
                best = (cost, e, f, width, len(exc))
    return best

prices = [19.99, 24.50, 3.15, 100.00, 0.99, 47.25, 12.30, 8.75]
cost, e, f, width, n_exc = choose_parameters(prices)
print(f"e={e} f={f} bits/value={width} exceptions={n_exc}")

noisy = [0.1 + 0.2, math.pi, math.e, 1.0 / 3.0, math.sqrt(2)]
cost, e, f, width, n_exc = choose_parameters(noisy)
print(f"e={e} f={f} bits/value={width} exceptions={n_exc}")
```

Running the first block prints something like `e=2 f=0 bits/value=14 exceptions=0`. Every price scales by 100 to an integer, the largest is 10000, and 14 bits covers the range. Eight doubles that took 512 bits now take 112 bits plus a few bytes of header. That is the entire mechanism.

Running the second block prints `e=0 f=0 bits/value=1 exceptions=5`. None of those doubles round trip through any decimal scaling within the width limit, so every value becomes an exception, the main vector carries nothing, and the decimal path stores nothing useful and the real encoder switches to ALPrd for that vector. The point of the example is that ALP does not guess. It verifies bit-for-bit and only claims a value when the reconstruction is exact.

Walk through the pieces:

The `bits` function is the correctness check. Comparing floats with `==` is not enough, because two different bit patterns can compare equal (positive and negative zero) and NaN never compares equal to itself. Comparing the raw 64-bit patterns guarantees a lossless round trip.

The `try_encode` function is one candidate encoding. It scales, rounds, and unscales, and the `abs(n) < 2**48` guard rejects encodings where the integer is so wide that packing it saves nothing over the raw double. Real ALP bounds the exponent and factor for the same reason: scaling pi by 10^17 does round trip, but at 58 bits per value it is not compression. Everything that fails becomes an exception with its position.

The `choose_parameters` function is the adaptive search. The real ALP implementation samples a subset of each vector rather than trying every combination on every value, and it uses a smarter cost model, but the shape is the same: pick the (e, f) that minimizes total bits including exception overhead.

Once you have the integers, Parquet's existing frame-of-reference and bit-packing take over. Subtract the minimum, pack at `width` bits, write the exceptions list, done.

To check what encodings an existing Parquet file uses today, pyarrow exposes them in the footer metadata:

```python
import pyarrow.parquet as pq

meta = pq.ParquetFile("sensor_readings.parquet").metadata
for rg in range(meta.num_row_groups):
    for c in range(meta.num_columns):
        col = meta.row_group(rg).column(c)
        print(rg, col.path_in_schema, col.encodings,
              col.compression, col.total_compressed_size)
```

Once ALP and FSST land in the libraries, the same `encodings` field is where you will see them appear, and the compressed size column is where you will measure the difference.

## A Worked Example of FSST in Python

FSST is even simpler to demonstrate, because the hard part (training the symbol table) is separable from the part that matters at read time (using it). The following toy hardcodes a symbol table for a column of URLs so you can see the encode, decode, random access, and equality properties directly. A real encoder discovers the symbols by sampling. The real spec uses a compact binary table layout and a specific escape convention. The mechanism is the same.

```python
SYMBOLS = ["https://", "www.", ".com/", "api/v",
           "/users/", "?id=", "example", "shop"]
table = {i: s for i, s in enumerate(SYMBOLS)}
ESC = 255

def encode(s, table):
    """Greedy longest-match encoding to 1-byte codes plus escapes."""
    out = []
    i = 0
    while i < len(s):
        best = None
        for code, sym in table.items():
            if s.startswith(sym, i) and (best is None or len(sym) > len(table[best])):
                best = code
        if best is None:
            out.append(ESC)
            out.append(ord(s[i]))
            i += 1
        else:
            out.append(best)
            i += len(table[best])
    return bytes(out)

def decode(codes, table):
    """Stateless table lookup. No window, no back-references."""
    out = []
    i = 0
    while i < len(codes):
        c = codes[i]
        if c == ESC:
            out.append(chr(codes[i + 1]))
            i += 2
        else:
            out.append(table[c])
            i += 1
    return "".join(out)

urls = [
    "https://www.example.com/api/v2/users/42?id=7",
    "https://shop.example.com/users/9",
    "https://www.example.com/api/v1/shop?id=3",
]
encoded = [encode(u, table) for u in urls]
for u, e in zip(urls, encoded):
    print(len(u), len(e), decode(e, table) == u)

# equality without decoding: same table, same string, same codes
print(encode(urls[1], table) == encoded[1])
```

The first URL is 44 bytes as plain text and 15 bytes as FSST codes. The third is 40 and 13. Every decode round-trips. The final line shows the equality property: encoding a search literal with the same table produces the same bytes as the stored value, so a filter compares code sequences without expanding anything.

Three things to notice about the code.

The encoder is greedy longest-match. Real FSST does the same thing, with a lookup structure optimized for speed rather than a linear scan over the table. The output for each string depends only on that string and the table, never on neighboring strings. That is what gives the format random access: to read the second URL you decode the second code sequence and touch nothing else.

The decoder has no state. It reads a code, copies a symbol, moves on. There is no dictionary being built as it goes, no sliding window over prior output. That loop runs at close to memory bandwidth, and it is the reason FSST decode is faster than LZ4 decode on the same strings.

The escape path is the cost of coverage. Characters that no symbol covers cost two bytes each, which is worse than plain encoding. A well-trained table minimizes escapes by covering the most frequent byte sequences, and a badly trained table (too few samples, or samples from an unrepresentative part of the column) produces escapes everywhere and a ratio worse than 1. That is the sampling-budget effect Prateek Gaur measured, made concrete.

## Which Encoding for Which Column

Parquet now has, or is about to have, more than one reasonable choice for most physical types. Here is how I think about the options for the column types that dominate storage in a typical lakehouse. Compression ratios are rough, vary widely by data, and are meant to set expectations rather than predict results.

| Column type | Encoding today | Typical ratio today | New encoding | Typical ratio with new encoding | Read path change |
|---|---|---|---|---|---|
| Low-cardinality strings (status, country, category) | RLE_DICTIONARY | 10x or better | No change needed | No change | None |
| High-cardinality strings (URLs, user agents, log text) | PLAIN, then Zstandard | 1.5x to 3x, full-page decode | FSST | 2x to 3x with random access | Table lookup per string |
| Decimals stored as doubles (prices, percentages, scaled metrics) | PLAIN or BYTE_STREAM_SPLIT, then Zstandard | 1.1x to 1.5x | ALP (decimal path) | 3x to 5x | Bit unpack, multiply, patch |
| High-precision doubles (scientific, model outputs, arithmetic results) | BYTE_STREAM_SPLIT, then Zstandard | 1.1x to 1.3x | ALPrd (fallback path) | 1.2x to 1.6x | Dictionary lookup plus bit unpack |
| Sorted integers and timestamps | DELTA_BINARY_PACKED | 4x to 10x | No change needed | No change | None |
| Boolean and small integers | RLE / bit-packed | 8x or better | No change needed | No change | None |

The table makes the scope of the change clear. FSST and ALP do not touch the cases Parquet already handles well. They fill the two gaps. If your table is mostly dictionary-friendly strings and sorted integers, the new encodings are close to irrelevant for you. If your table is observability data, financial time series, ML feature stores, or web logs, they are the biggest storage change to hit Parquet in years.

## What Breaks and When

New encodings are lower risk than new types or new metadata structures, because they are contained inside a page. They still have edges.

**Old readers fail on new files.** This is the big one and it is not subtle. A reader that does not recognize an encoding cannot decode the page. Well-behaved readers raise a clear error. Poorly behaved readers, particularly hand-rolled or very old ones, produce garbage or crash. Before enabling either encoding on a shared table, confirm every consumer: query engines, notebooks, streaming jobs, data quality tools, lineage crawlers, ML feature pipelines, anything with a Parquet reader. Iceberg's metadata will not warn you.

**ALP exceptions can dominate.** On a column where most values are genuine high-precision floats, the decimal path produces mostly exceptions and ALPrd takes over. ALPrd's ratio is modest, often around 1.2x to 1.5x, and it costs encode-time CPU to discover that. If you know a column is high-precision (model logits, raw scientific measurements), it is reasonable to leave it on byte stream split plus Zstandard and skip ALP for that column. The encoding is a per-column writer choice, so use it where it helps.

**FSST training costs write time.** Building a symbol table means sampling the column and running an iterative selection. Prateek Gaur's benchmarks found that the sampling budget is the main determinant of ratio, which means the writer has a real dial: sample more for better compression and slower writes, sample less for the reverse. Streaming writers that flush small files every few seconds pay the training cost on every file and get less benefit, because small pages have less redundancy to exploit. Batch and compaction writers are where FSST pays off most.

**Small pages get small gains.** Both encodings amortize a header (a symbol table or exception list) over a page or vector. On tiny pages the header overhead eats the gain. Tune page size up if you enable either encoding on a column that was previously using small pages for random-access reasons.

**Compression on top still matters, differently.** ALP output is dense bit-packed integers, and FSST output is code bytes. Both still benefit from a fast codec like LZ4 or Zstandard at a low level, but the gain from the codec drops because the encoding already removed most redundancy. Teams that measure "compressed size with Zstandard level 9" before and after will see the encoding gain, then wonder why dropping to Zstandard level 3 costs almost nothing. That is expected and it is a CPU win.

**Statistics on FSST columns.** Min and max for string columns are computed on the logical values by the writer, so they are correct. But some readers compute additional statistics or bloom filters at read time, and those need to decode. Engines that add FSST support have to make sure every path that touches string bytes either decodes first or is FSST-aware. This is the most likely source of early correctness bugs in implementations, and it is worth testing string filters carefully when your engine first ships FSST support.

**Mixed encodings across snapshots complicate debugging.** Once a rollout starts, the same column carries different encodings in different data files, and a performance or correctness problem that shows up on some queries and not others is often an encoding boundary. A query that touches only compacted files runs fast. A query that reaches into a recent partition with un-compacted, plain-encoded files runs slow, and the difference looks like a partition pruning problem until someone checks the footers. Add the column chunk encoding to whatever per-file diagnostics you already collect, so the mixed state is visible rather than inferred.

**Bloom filters and FSST.** Parquet bloom filters are built on the logical values at write time and stored separately from the pages, so they keep working. But an engine that reads the page and then probes a bloom filter it built itself at read time has to decode first. Same rule as statistics: every code path that hashes or compares string bytes needs to know whether it is holding codes or characters.

## Operational Guidance

If you run a lakehouse and want to be ready for these encodings, here is the order of operations.

**Profile your columns now.** Use the pyarrow snippet above, or your engine's equivalent, to find the columns where compressed size is largest relative to row count. Sort by `total_compressed_size`. The top of that list is almost always a mix of high-cardinality strings and doubles, and those are your ALP and FSST candidates. Knowing the byte share in advance tells you what the encodings are worth to you before a single library ships them.

**Inventory readers and their Parquet library versions.** Make a table of every consumer of your Iceberg tables and the Parquet implementation it uses (parquet-java, arrow-cpp via pyarrow, arrow-rs, arrow-go, DuckDB's own reader, an engine's proprietary reader). Track which version of each adds ALP and then FSST support. Your rollout date for each encoding is the date the last reader in that table supports it.

**Plan a compaction-driven rollout.** Do not flip the encoding on your ingestion writers first. Enable it in your compaction or rewrite job, which processes whole partitions with large pages and gives the encoder the most redundancy to work with. That converts historical data at the best ratio and lets you measure the gain on real files before touching the hot path.

**Set per-column encoding, not per-table.** Both parquet-java and the Arrow libraries let you set encoding properties per column path. Use that. ALP on measurement columns, FSST on text columns, existing encodings on everything else. A blanket setting wastes CPU on columns that do not benefit.

**Re-tune page size and compression level together.** After enabling an encoding on a column, retest with a larger page size and a lower compression level. The likely outcome is similar or better compressed size at noticeably lower write and read CPU.

**Keep one un-encoded copy of a test partition.** While you are validating an engine's new encoding support, keep a small partition written with the old encodings alongside the same data written with the new ones. Run your regression queries against both and diff the results. Correctness bugs in a new decoder show up as row count or aggregate differences between the two copies, and having the pair on hand turns a vague "results look wrong" report into a ten-minute reproduction.

**Measure scan throughput, not just size.** The storage gain is the visible one, but the read-side gain is often bigger. ALP decode is a vectorized integer unpack. FSST decode is a table lookup. Both are faster than Zstandard decompression on the same logical data. Track bytes scanned per second and CPU per query on your top queries before and after.

## Where the Ecosystem Is Heading

Step back and this summer's Parquet activity reads as a coordinated push to make the format safe to extend. The versioning vote supplies the delivery mechanism for changes that old readers cannot handle. The example files in parquet-testing and the cross-language implementation requirement for FSST supply the verification gate. And the sort-order thread, where Ed Seidl tested several implementations to confirm that old readers ignore an unrecognized sort order rather than failing before parquet-java flipped the default, supplies the compatibility playbook. Every encoding now moves through that machinery, and every encoding moves faster because of it.

Three follow-on developments are worth tracking.

The first is Arrow-native processing on encoded values. If Arrow grows array types or extension types that carry FSST codes or ALP integers, engines can push filters and aggregates onto the compressed representation and defer decoding until output. That is where the real performance ceiling is, and it is an open question on the Arrow side rather than the Parquet side.

The second is the interaction with Iceberg v4. The v4 work moves Iceberg's manifests from Avro to Parquet and restructures column statistics into typed columns. Manifests hold a lot of file paths (long, prefix-heavy strings) and a lot of bounds (many of them doubles). FSST on the path column and ALP on the bounds columns are a natural fit, and they make the metadata layer smaller and faster to scan for the same reasons they help data. Nobody has proposed that yet, but it is the obvious next step once both encodings are in the libraries.

The third is the string encoding decision. FSST is furthest along, OnPair benchmarks better on some corpora with a heavier encode cost, and the community's finding that sampling budget matters more than algorithm points toward shipping one encoding with a tunable writer. Which one, and with what knobs, is the question the Parquet list will settle this fall.

The larger pattern is that Parquet, which spent a decade as a stable format nobody wanted to touch, is now evolving on a schedule. Variant and geospatial types landed. A File type for unstructured payloads passed its vote. Fixed-size lists for embeddings are under discussion. ALP is approved and FSST is close behind. For the two column types that have always compressed worst, the fix is finally in the format rather than in a workaround.

## Conclusion

Parquet's encoding layer extracts structure from data before a general-purpose compressor sees it, and for a decade it had no encoding that understood the structure of high-cardinality strings or floating-point measurements. FSST fixes strings with a 255-entry symbol table that decodes by lookup and keeps random access. ALP fixes floats by recovering the decimal that each double came from, encoding the result as small bit-packed integers, and falling back to a bit-splitting scheme for genuinely high-precision data. Both are lossless, both decode faster than the compressors they partially replace, and both are now on their way into the format: ALP approved in July, FSST in implementation as of August.

For Iceberg tables, the change is invisible to the metadata and entirely a writer decision, which makes adoption easy and also makes it easy to break a reader you forgot about. Profile your columns, inventory your readers, roll out through compaction, and set encodings per column. The storage savings are real and the scan speedup is bigger.

## Keep Going

If this piece was useful, I have written a lot more on Parquet, Iceberg, and the storage layer of the lakehouse. *Apache Iceberg: The Definitive Guide* (O'Reilly) covers how Iceberg tracks Parquet files and their statistics, which is the context for understanding why encoding changes stay invisible to the table format. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
