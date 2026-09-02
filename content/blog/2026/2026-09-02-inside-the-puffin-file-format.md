---
title: "Inside the Puffin File Format"
date: "2026-09-02"
description: "The Puffin file format inside out, byte by byte, covering Theta sketches for distinct values and deletion vectors."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Puffin
  - File Format
  - Deletion Vectors
  - Theta Sketches
canonical: https://iceberglakehouse.com/posts/inside-the-puffin-file-format/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/inside-the-puffin-file-format/).

A query joins a 2-billion-row fact table to a 40,000-row dimension table. The optimizer has to decide which side to broadcast and which side to hash. It reads the manifests and finds row counts, min and max values, and null counts for every column in every file. What it does not find is how many distinct customer IDs exist in the fact table. Without that number it guesses, and a wrong guess means shuffling terabytes that a broadcast join avoids.

The same engine, a few minutes later, deletes 300 rows from a data file that holds 4 million. In format version 2 it writes a position delete file: a Parquet file listing the path of the data file and the position of each deleted row. Every subsequent read of that data file has to open the delete file, decode Parquet, build a set of positions, and filter. Do that across ten thousand data files and delete handling dominates query time.

Both problems have the same shape. Iceberg's manifests are the wrong place for the answer. Manifests are optimized for per-file scalar statistics that fit in a few bytes each. A distinct-value sketch is kilobytes. A delete bitmap is arbitrary size. Neither belongs inline in an Avro record that the planner reads for every file on every query.

Puffin is the file format Iceberg uses for information that does not fit in a manifest. It is a simple container: a magic number, a sequence of opaque blobs, and a JSON footer that describes what each blob is, what it was computed for, and where it sits in the file. Today the spec defines two blob types. One holds a Theta sketch for estimating distinct values. The other holds a deletion vector for row-level deletes in format version 3. This article takes the format apart byte by byte, explains both blob types from first principles, shows how table metadata and manifests reference Puffin content, and covers what goes wrong operationally. I work at Dremio, whose query engine consumes Puffin statistics, but nothing here is vendor-specific.

## Why Manifests Were Not Enough

Understanding Puffin starts with understanding what manifests already do and where they stop.

An Iceberg manifest is an Avro file with one entry per data file or delete file. Each entry carries the file path, format, partition tuple, record count, file size, and a set of per-column metrics: value counts, null counts, NaN counts, and lower and upper bounds. The planner reads these entries for every query. Bounds let it skip files whose value ranges cannot match a predicate. Counts let it estimate scan size.

These metrics share three properties. They are small, a few bytes per column per file. They are cheap to compute during the write, because a writer already sees every value. And they are per file, which is exactly the granularity the planner needs for pruning.

Table-level statistics for a cost-based optimizer violate all three. The number of distinct values (NDV) in a column across the whole table is not a per-file quantity, and you cannot sum per-file NDVs because the same value appears in many files. Computing it accurately requires a pass over the whole table or a mergeable sketch. And the sketch itself, the data structure that lets you merge partial results, is thousands of bytes, not a handful.

Row-level deletes have a different mismatch. A delete for a single data file is a set of row positions. The natural encoding is a bitmap. A bitmap for a 4-million-row file with scattered deletes compresses to a few kilobytes. That is too large to store inline in a manifest entry, and the manifest has to be rewritten on every delete if the bitmap lives there, which defeats Iceberg's append-only metadata design.

The Iceberg community's answer, proposed around 2022 alongside the Trino integration work, was a dedicated sidecar format with three design goals. It had to be trivially parseable by any language, so a new engine adopts it without a large dependency. It had to support random access to individual blobs, so a reader that wants one statistic does not read the whole file. And it had to be extensible, so new statistic and index types get added without changing the container.

The result was named Puffin, and the magic bytes spell out the joke: `PFA1` stands for *Fratercula arctica*, the Atlantic puffin, version 1.

## File Layout Byte by Byte

A Puffin file is a flat sequence with no internal structure beyond what the footer describes:

```
Magic  Blob₁  Blob₂  ...  Blobₙ  Footer
```

The leading `Magic` is four bytes: `0x50 0x46 0x41 0x31`, the ASCII characters `P`, `F`, `A`, `1`. Every blob follows immediately, back to back, with no headers, length prefixes, or padding between them. A blob is whatever bytes the writer chose to put there. The container does not interpret them. That interpretation is entirely the footer's job.

The footer sits at the end of the file and has its own fixed structure:

```
Magic  FooterPayload  FooterPayloadSize  Flags  Magic
```

Reading it backward from the end of the file: the last four bytes are the magic again. Before that, four bytes of flags. Before that, a four-byte integer holding the size of the footer payload. Before that, the payload itself. And before the payload, the magic once more, marking where the footer begins.

All four-byte integers in Puffin are signed, two's complement, little-endian. The flags field is four bytes, but only one bit is defined today. Bit 0 of byte 0 indicates whether the footer payload is compressed. Every other bit is reserved and must be written as zero.

When the compression bit is set, the footer payload is a single LZ4 frame with content size present. When it is clear, the payload is raw bytes. In both cases the decompressed payload is UTF-8 JSON describing a single `FileMetadata` object.

The reason the layout ends with the magic and puts the size just before the flags is that it lets a reader locate the footer with two range reads and no scanning. Read the last 12 bytes of the file. Verify the trailing magic. Extract the flags and the payload size. Compute the payload's starting offset as `file_size - 12 - payload_size`, and do a second read of `payload_size + 4` bytes to pull the leading magic plus the payload. Two requests against object storage, and the reader knows every blob's type, location, and length.

Iceberg's table metadata makes this even cheaper by recording `file-footer-size-in-bytes` for every statistics file. A reader that has the table metadata skips the first probe entirely and fetches the footer in one range read of exactly the right size.

Once the footer is decoded, fetching a blob is one more range read at the offset and length the footer specifies. A reader that needs the NDV sketch for one column reads three small ranges from a file that is otherwise never touched. That is the random-access goal delivered.

## The Footer Payload: FileMetadata and BlobMetadata

The JSON payload is where the format gets its meaning. It has two levels.

`FileMetadata` is the root object. It has one required field, `blobs`, which is a list of `BlobMetadata` objects, and one optional field, `properties`, a flat map of string keys to string values for information about the file as a whole. The spec recommends that writers set a `created-by` property identifying the application and version, such as `"Trino version 381"`. That property is diagnostic gold when a stats file behaves oddly and you need to know which engine produced it.

Each `BlobMetadata` object describes one blob:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `type` | string | yes | Blob type identifier, one of the types defined in the spec |
| `fields` | list of int | yes | Iceberg field IDs the blob was computed for, in order |
| `snapshot-id` | long | yes | Snapshot the blob was computed from |
| `sequence-number` | long | yes | Sequence number of that snapshot |
| `offset` | long | yes | Byte offset in the file where the blob begins |
| `length` | long | yes | Byte length of the blob as stored (after compression) |
| `compression-codec` | string | no | `lz4` or `zstd`. Absent means uncompressed |
| `properties` | map | no | Blob-specific key-value pairs |

Three of these fields deserve a closer look.

`fields` is a list because a blob can describe several columns at once. A multi-column sketch, for instance a distinct-count of the combination of `customer_id` and `region`, lists both field IDs. Order matters, because the spec states that the order is used when computing sketches. A single-column NDV sketch has a one-element list. Using field IDs rather than names means the blob survives column renames, which is the same reason manifests use field IDs for their metrics maps.

`snapshot-id` and `sequence-number` pin the blob to a point in table history. A Theta sketch computed against snapshot 4 describes the data as of snapshot 4. After twenty more commits, it describes the data poorly. The planner compares the blob's snapshot to the current snapshot and decides how much to trust it. For deletion vectors, this pinning does not apply, and the spec requires both to be set to -1 because a delete file is written before the snapshot that contains it exists.

`compression-codec` is limited to two values for a reason the spec states plainly: for maximal interoperability, other codecs are not supported. `lz4` means a single LZ4 frame with content size present. `zstd` means a single Zstandard frame with content size present. Both are single-frame encodings, so a reader decompresses the blob with one call and needs no framing logic. A Puffin reader in any language needs an LZ4 library and a Zstandard library and nothing else.

Here is a footer payload for a statistics file with two NDV sketches:

```json
{
  "blobs": [
    {
      "type": "apache-datasketches-theta-v1",
      "fields": [2],
      "snapshot-id": 7168742983117921046,
      "sequence-number": 14,
      "offset": 4,
      "length": 32912,
      "compression-codec": "zstd",
      "properties": { "ndv": "1249831" }
    },
    {
      "type": "apache-datasketches-theta-v1",
      "fields": [5],
      "snapshot-id": 7168742983117921046,
      "sequence-number": 14,
      "offset": 32916,
      "length": 96,
      "compression-codec": "zstd",
      "properties": { "ndv": "6" }
    }
  ],
  "properties": {
    "created-by": "Spark 4.1 / Iceberg 1.11.0"
  }
}
```

The first blob starts at offset 4, immediately after the magic. The second starts at 32916, which is 4 plus 32912, immediately after the first. The `ndv` property on each is the pre-computed estimate, so an engine that only wants the number reads the footer and stops. The second column has an NDV of 6 and its sketch is under 100 bytes, because a Theta sketch of six values holds six 8-byte hashes plus a header. The first column has over a million distinct values and its sketch is about 32 KB, which is the saturation size of a compact Theta sketch at the DataSketches default of 4,096 nominal entries. Sketch size does not grow with cardinality past that point, which is the entire reason the structure is useful.

## Blob Type One: The Theta Sketch for Distinct Values

The `apache-datasketches-theta-v1` blob type stores a compact Theta sketch from the Apache DataSketches library. To understand why Iceberg chose this structure over a simple count, it helps to see how the sketch works.

Counting exact distinct values requires remembering every value you have seen, which for a billion-row column means a billion-entry hash set. A Theta sketch instead keeps a small, fixed-size sample of hashed values and uses the sample to estimate the total. The idea, known as K-Minimum Values, goes like this. Hash every value to a uniformly distributed 64-bit number, which maps it to a point in the interval [0, 1). Keep only the smallest `k` hashes you have seen. If you have seen `n` distinct values spread uniformly across [0, 1), the `k`-th smallest one sits at roughly `k / n`. Call that position theta. Then the estimate for `n` is `k / theta`. Duplicates hash to the same point and never increase the sample, so the estimate counts distinct values by construction.

DataSketches' Theta family generalizes this. Rather than a fixed `k`, the sketch tracks a threshold theta, keeps every hash below theta, and lowers theta as the sketch fills. The Alpha variant that Iceberg specifies uses a more sophisticated update rule that trades a bit of accuracy at small sizes for lower memory and faster updates. With the library's default of 4,096 nominal entries, the relative standard error on the estimate is about 1.6 percent. Doubling the size roughly divides the error by 1.4.

The property that matters most for Iceberg is that Theta sketches are mergeable. Two sketches built over two different sets of files union into one sketch that estimates the distinct count of the combined set, with no loss of accuracy versus building one sketch over everything. A writer that computes a sketch per data file, or per partition, or per Spark task, merges them into one table-level sketch. Re-analyzing after appending new files means sketching only the new files and merging with the old sketch. Intersection and set difference are also supported, which lets an optimizer estimate the overlap between two columns' value sets for join cardinality.

The spec fixes the inputs so sketches from different engines merge correctly. The sketch is built with the default seed. Each distinct value is converted to bytes using Iceberg's single-value serialization, the same encoding used for partition values and bounds in manifests. An `int` becomes four little-endian bytes, a `string` becomes UTF-8, a `decimal` becomes its unscaled big-endian two's complement bytes, and so on. If Trino used one byte encoding and Spark used another, the same value hashes differently and a union double-counts it. The shared serialization rule is what makes cross-engine merging valid.

The stored form is the "compact" serialization, which is the sorted array of retained hashes plus a small header holding theta and a few flags. The compact form is read-only and space-optimal, which is what you want in a file that gets written once and read many times.

The blob metadata for a Theta sketch carries an `ndv` property with the estimate already computed, stored as a decimal string with no leading or trailing spaces. The spec says the property "may" be included, but in practice every engine that writes sketches includes it, and the dev list has discussed making it required. Trino and Presto read the `ndv` property directly as their source of truth rather than deserializing the sketch. Spark's `compute_table_stats` procedure writes both the sketch and the property. The property is the fast path. The sketch is for engines that need to merge or intersect.

## Blob Type Two: The Deletion Vector

The `deletion-vector-v1` blob type was added to the Puffin spec for Iceberg format version 3, and it is the storage format for deletion vectors, the v3 replacement for position delete files.

A deletion vector is a bitmap over the row positions of one data file. A set bit at position P means row P is deleted. Reading the data file with the vector applied means skipping every row whose position is set. The engine gets a bitmap it can test in constant time rather than a set of positions it has to build from a Parquet file.

The bitmap encoding is Roaring. Roaring bitmaps partition the 32-bit integer space into 65,536 chunks of 65,536 values each, and store each chunk in whichever of three containers is smallest for its density: a sorted array of 16-bit values for sparse chunks, a 8-kilobyte bitset for dense chunks, and a run-length list for chunks with long consecutive runs. A vector marking 300 scattered rows out of 4 million uses a handful of array containers and totals a few hundred bytes. A vector marking rows 1,000,000 through 2,999,999 as deleted uses run containers and totals a few dozen bytes. This adaptivity is why Roaring became the standard for this job in Delta Lake, Lucene, and now Iceberg.

Iceberg rows can have positions above 2^32, since a single data file can in principle hold more than 4 billion rows. The spec handles this by splitting a 64-bit position into a 32-bit key from the high four bytes and a 32-bit sub-position from the low four bytes. For each distinct key, one 32-bit Roaring bitmap holds the sub-positions. Testing a position means finding the bitmap for its key, then testing the sub-position. Files under 4 billion rows, which is all of them in practice, have exactly one key and one bitmap. The structure supports the full 64-bit range without paying for it.

The serialized blob has a fixed envelope around the bitmap:

1. Four bytes, big-endian: the combined length of the magic and the vector.
2. Four magic bytes: `D1 D3 39 64`.
3. The vector, in Roaring's portable 64-bit format.
4. Four bytes, big-endian: a CRC-32 checksum over the magic and the vector.

Inside the vector, the portable format is: an 8-byte little-endian count of 32-bit bitmaps, then for each bitmap in unsigned key order, a 4-byte little-endian key followed by the standard 32-bit Roaring serialization.

The endianness mix is deliberate and the spec explains it. The Roaring format itself is little-endian, as defined by the Roaring specification. The length and CRC envelope is big-endian for byte compatibility with the deletion vectors Delta Lake already stored. Delta and Iceberg deletion vectors are wire-identical inside the envelope, which is one of the concrete outcomes of the cross-format convergence work that also produced the `variant` type.

The blob metadata for a deletion vector has strict requirements. It must include a `referenced-data-file` property whose value equals the data file's `location` in the table metadata, so a reader can pair the vector with the file it applies to. It must include a `cardinality` property with the number of set bits, so planners can estimate live row counts without decoding the bitmap. It must omit `compression-codec`, because Roaring is already compact and the spec forbids compressing deletion vectors. And `snapshot-id` and `sequence-number` must both be -1, since the vector is written before the commit that includes it.

Many deletion vectors can live in one Puffin file. A single delete operation that touches 500 data files writes 500 vectors into one file, back to back, and the footer lists all 500 with their offsets and lengths. This is what keeps the file count under control. In v2, that same operation wrote up to 500 position delete files. In v3 it writes one Puffin file.

## How Table Metadata and Manifests Point at Puffin

A Puffin file on its own is inert. It becomes part of the table when Iceberg metadata references it, and the two blob types are referenced in completely different ways.

**Statistics files are referenced from table metadata.** The table metadata JSON has an optional `statistics` list. Each entry is a struct with the snapshot ID the file belongs to, the `statistics-path`, `file-size-in-bytes`, `file-footer-size-in-bytes`, an optional `key-metadata` for encryption, and a `blob-metadata` list that mirrors a subset of the Puffin footer: each blob's type, snapshot ID, sequence number, field IDs, and properties. This duplication is intentional. An engine that reads the table metadata already knows every statistic available and its `ndv` estimate without opening the Puffin file at all. Only an engine that wants the sketch itself, for merging or intersection, goes to storage.

Statistics are informational. The spec is explicit that a reader can ignore them and that support is not required to read the table correctly. A table can hold many statistics files for different snapshots, and each is associated with exactly one snapshot ID. When a snapshot is expired, the statistics file tied to it is removed from the `statistics` list and its file becomes an orphan to be cleaned up by orphan-file removal.

There is a second, related list called `partition-statistics`. These files are not Puffin. They are Parquet, Avro, or ORC files with a fixed schema of per-partition row counts, file counts, and sizes, produced by the `compute_partition_stats` procedure. People conflate the two because both are "statistics" and both hang off the table metadata. Only column-level sketches use Puffin.

**Deletion vectors are referenced from delete manifests.** This is the more interesting integration, because deletion vectors are not informational. They are required for correctness. A reader that ignores them returns deleted rows.

A delete manifest entry for a deletion vector is a normal manifest entry with `content` set to position deletes, `file_format` set to `puffin`, and `file_path` pointing at the Puffin file. Three fields added in v3 do the rest. `referenced_data_file` holds the location of the one data file the vector applies to. `content_offset` holds the byte offset of the vector's blob inside the Puffin file. `content_size_in_bytes` holds the blob's length. The spec requires that these two values exactly match the `offset` and `length` in the Puffin footer for that blob.

The effect is that a reader never has to parse the Puffin footer to apply a deletion vector. The manifest entry already says: open this file, seek to this offset, read this many bytes, and you have a bitmap for that data file. One range read per vector, no footer decode. The Puffin footer still exists and is still valid, which keeps the file inspectable by generic tooling, but the hot path bypasses it.

Two rules from the spec govern the lifecycle. First, there can be at most one deletion vector per data file in a snapshot. A writer that adds deletes to a file that already has a vector must read the old vector, union in the new positions, write a new vector, and replace the manifest entry. This is different from v2 position deletes, where multiple delete files for one data file accumulated and every reader merged them. Second, when a data file is removed, the writer must remove its deletion vector from the delete manifests, but is not required to rewrite the Puffin file containing that vector. The vector's bytes stay in the file as dead space until the file has no live references and gets cleaned up.

The result is a very different file count profile from v2. A table with a million data files and frequent updates in v2 accumulates position delete files at roughly one per touched data file per commit. In v3 it accumulates one Puffin file per commit, holding as many vectors as that commit touched files. Ten thousand small update commits produce ten thousand Puffin files rather than millions of delete files.

## Walkthrough: Reading a Puffin File From Scratch

Nothing demonstrates a format's simplicity like a reader that fits on one screen. The following Python reads a Puffin footer and lists its blobs, using only the standard library plus `lz4` for the optional footer compression. It does not need Iceberg, PyIceberg, or any JVM.

```python
import json
import struct

MAGIC = b"PFA1"

def read_puffin_footer(path):
    with open(path, "rb") as f:
        f.seek(0, 2)
        file_size = f.tell()

        # Trailer: FooterPayloadSize (4) + Flags (4) + Magic (4)
        f.seek(file_size - 12)
        trailer = f.read(12)
        payload_size, flags, magic = struct.unpack("<ii4s", trailer)
        assert magic == MAGIC, "bad trailing magic"

        # Payload plus the magic that precedes it
        f.seek(file_size - 12 - payload_size - 4)
        head_magic = f.read(4)
        assert head_magic == MAGIC, "bad footer-start magic"
        payload = f.read(payload_size)

    compressed = flags & 0x01
    if compressed:
        import lz4.frame
        payload = lz4.frame.decompress(payload)

    return json.loads(payload.decode("utf-8"))

def read_blob(path, blob):
    with open(path, "rb") as f:
        f.seek(blob["offset"])
        raw = f.read(blob["length"])
    codec = blob.get("compression-codec")
    if codec == "zstd":
        import zstandard
        return zstandard.ZstdDecompressor().decompress(raw)
    if codec == "lz4":
        import lz4.frame
        return lz4.frame.decompress(raw)
    return raw

meta = read_puffin_footer("stats.puffin")
print("created-by:", meta.get("properties", {}).get("created-by"))
for b in meta["blobs"]:
    print(b["type"], "fields", b["fields"],
          "snapshot", b["snapshot-id"],
          "ndv", b.get("properties", {}).get("ndv"))
```

Walking through it. The trailer is read as one 12-byte chunk and unpacked with `struct` using the `<` prefix for little-endian and `i` for signed 32-bit integers, matching the spec's integer rule. The payload's starting position is computed arithmetically from the file size and payload size, then the reader verifies the magic that precedes the payload before trusting it. The compression bit is bit 0 of the flags integer, tested with a bitwise AND. `read_blob` seeks to the offset from the footer, reads exactly `length` bytes, and decompresses based on the codec string. The only third-party dependencies are the two compression libraries, and only when a codec is actually used.

Decoding a Theta sketch blob past this point needs the DataSketches library for your language. Decoding a deletion vector needs a Roaring bitmap library and the envelope logic from the spec:

```python
import struct
import zlib

DV_MAGIC = bytes.fromhex("D1D33964")

def decode_deletion_vector(blob_bytes):
    (length,) = struct.unpack(">i", blob_bytes[:4])
    magic = blob_bytes[4:8]
    assert magic == DV_MAGIC, "bad deletion vector magic"
    vector = blob_bytes[8:4 + length]
    (crc,) = struct.unpack(">I", blob_bytes[4 + length:8 + length])
    assert zlib.crc32(blob_bytes[4:4 + length]) == crc, "crc mismatch"

    # Portable 64-bit Roaring: count (8 LE), then key (4 LE) + 32-bit bitmap
    (n_bitmaps,) = struct.unpack("<q", vector[:8])
    return n_bitmaps, vector[8:]
```

The length and CRC use `>` for big-endian, the magic is checked, and the CRC is computed over the magic and vector together, exactly as the spec states. What comes back is the count of 32-bit bitmaps and the raw Roaring bytes, which the `pyroaring` package or any Roaring implementation deserializes. The point of showing this is not that you should write your own reader. It is that a complete, correct reader is under a hundred lines, which is what "trivially parseable" was supposed to mean.

To see how table metadata references a stats file, query the metadata JSON directly. In Spark, the `statistics` list is not exposed as a metadata table, but you can read the current metadata file location from the `metadata_log_entries` table and inspect it:

```sql
SELECT file FROM db.orders.metadata_log_entries
ORDER BY timestamp DESC LIMIT 1;
```

Opening that JSON and looking at the `statistics` array shows the `statistics-path`, `file-footer-size-in-bytes`, and the embedded `blob-metadata` with `ndv` properties. That is the fast path an optimizer uses.

## Producing and Consuming Statistics Across Engines

Puffin statistics are not written automatically. Every engine that supports them requires an explicit analyze step, and the commands differ.

In Spark with the Iceberg extensions, the procedure is:

```sql
CALL polaris.system.compute_table_stats(
  table => 'sales.orders',
  columns => array('customer_id', 'product_id', 'order_status')
);
```

Without the `columns` argument it computes sketches for every column, which on a wide table is expensive and mostly wasted. Restrict it to join keys, filter columns, and group-by columns. An optional `snapshot_id` argument computes against an older snapshot. The procedure returns the path of the Puffin file it wrote and registers it in the table metadata in the same commit.

In Trino, the command is the standard `ANALYZE sales.orders`, optionally with a `columns` property to restrict scope. Trino was the first engine to write Theta sketches to Puffin, in 2022, and its optimizer reads the `ndv` property during planning. Presto reads them the same way.

Dremio's cost-based optimizer consumes NDV statistics when planning joins, and statistics collection is triggered through the platform's own commands rather than the Spark procedure. Amazon Athena and Redshift Spectrum read Puffin NDV statistics from tables analyzed by other engines. The pattern across the ecosystem is that reading is more widely supported than writing, and a single analyze job in Spark or Trino benefits every reader that shares the table.

What each engine does with the number varies. The common use is join ordering: a three-way join has six possible orders, and the intermediate result size between the best and worst can differ by 100x. NDV estimates on the join keys let the optimizer predict output cardinality for each order and pick the smallest. The second use is broadcast decisions: a table with low distinct-count keys and few rows is a broadcast candidate. The third is aggregation sizing: `GROUP BY customer_id` with an NDV of 1.2 million tells the engine to plan for a 1.2-million-entry hash table rather than guessing.

Deletion vectors, unlike statistics, are produced automatically by any v3-capable writer that performs a delete, update, or merge. Spark 3.5 and 4.x with Iceberg 1.8 and later write them by default on v3 tables. Flink's dynamic sink gained deletion vector support in Iceberg 1.11. Any engine that reads v3 tables must apply them, and every engine claiming v3 read support does. There is no analyze step and no opt-in beyond upgrading the table's format version.

## Failure Modes: What Breaks and the Warning Signs

Puffin is simple, and most Puffin problems are not format problems. They are lifecycle problems: stale content, orphaned files, and mismatched expectations between engines.

**Stale statistics that the optimizer trusts.** A sketch is pinned to a snapshot. Nothing forces an engine to distrust it after the table has moved on. If you analyzed a table when it had 10 million rows and it now has 800 million, the `ndv` for `customer_id` reflects the old population, and the optimizer plans joins against a number that is off by an order of magnitude. The warning sign is a join that was fast and turned slow with no query change. Comparing the snapshot ID in the `statistics` entry to the current snapshot ID tells you immediately how far behind the stats are.

**No statistics at all.** Because writing is opt-in, most tables have never been analyzed. The optimizer falls back to row counts from manifests and heuristics for NDV. Query plans are frequently reasonable anyway, which hides the problem until a workload arrives where join order matters. Checking whether the `statistics` list in table metadata is empty is a thirty-second diagnostic that many teams never run.

**Statistics computed by one engine that another engine ignores.** Every engine reads the `ndv` property, but not every engine deserializes the sketch. If you rely on an engine to intersect sketches for join selectivity and it only reads the property, you get a cruder estimate than you expected. Engines also differ in how they weight stale stats. Knowing which of your engines does what is part of running a shared table.

**Orphaned Puffin files after snapshot expiry.** When `expire_snapshots` removes a snapshot, the statistics file registered to it is dropped from the metadata list. The file is not deleted. Deletion vectors follow the same pattern: when data files are rewritten by compaction, their vectors are dropped from manifests but the Puffin files stay on storage. Over months, a busy table collects thousands of unreferenced Puffin files. They cost storage and, on some object stores, slow down listing. Regular `remove_orphan_files` runs are the fix, and the same job cleans up orphaned data files, so most teams already have it scheduled.

**Deletion vector accumulation.** A v3 table that receives frequent small updates and is never compacted ends up with a Puffin file per commit and a deletion vector for a large fraction of its data files. Reads stay correct, and each vector is a single range read, so the per-file cost is low. But the aggregate still adds up: ten thousand data files each with a vector means ten thousand extra range requests per full scan. The signal is scan latency rising with the number of delete manifests. `rewrite_data_files` merges deletes into new data files and drops the vectors, and it should run on the same cadence as any other compaction.

**A vector that does not match its manifest entry.** The spec requires `content_offset` and `content_size_in_bytes` in the manifest to match the blob's `offset` and `length` in the Puffin footer exactly. A writer bug or a manually edited manifest that breaks this produces a reader that seeks to the wrong bytes. Good readers verify the deletion vector magic and CRC and fail loudly. A CRC mismatch error on read is the sign, and the fix is to rewrite the affected data files.

**Mismatched serialization between sketch writers.** If two engines build sketches with different value serializations and you union them, the same value counts twice. The spec fixes the serialization to prevent this, but a nonconforming writer breaks it silently. The symptom is a merged NDV that exceeds the sum of the parts' plausible ranges. In practice this has not been a common problem because the writer count is small, but it becomes one as more implementations appear.

**Puffin files written with an unsupported codec.** The spec allows only `lz4` and `zstd`. A writer that uses another codec produces a file no conforming reader opens. This does not happen with mainstream engines, but a home-grown stats writer is a place to check.

## Operational Guidance: Cadence, Scope, Cleanup, and Monitoring

A handful of practices keep Puffin content useful and keep the file count under control.

**Analyze on a schedule tied to growth, not time.** Refresh statistics when the table has grown or changed enough that the old sketch is misleading. A rule that works: re-run `compute_table_stats` when the row count has changed by more than 20 percent since the snapshot the current stats were computed against, or after any large backfill or rewrite. For slowly changing dimension tables, once a month is plenty. For a fact table that doubles weekly, tie the analyze job to the ingestion pipeline.

**Restrict the column list.** Sketch only the columns the optimizer uses: join keys, common filter columns, common group-by columns. A 200-column event table with sketches on every column produces a 6-megabyte statistics file and spends an hour of cluster time on columns no query joins on. Twenty well-chosen columns cover almost every plan.

**Use incremental merging where the engine supports it.** Since Theta sketches merge, an engine that sketches only new files since the last analyze and unions with the prior sketch does the job in a fraction of the time. Check whether your engine's analyze implementation is incremental. If it is not, and the table is large, schedule the full analyze during a low-traffic window.

**Compact deletion vectors on the same cadence as data files.** Treat a high ratio of delete manifests to data manifests as a compaction trigger. `rewrite_data_files` with the default settings rewrites files that have deletes attached and removes the vectors. Running `rewrite_position_delete_files` on v3 tables is less relevant since vectors are already one per file, but it still helps consolidate Puffin files that hold only a few live vectors each.

**Run orphan-file removal monthly.** Puffin files become orphans through both snapshot expiry and compaction. The standard `remove_orphan_files` procedure handles them along with everything else. Set the `older_than` threshold to comfortably exceed your longest-running job so an in-flight write's files are never swept.

**Monitor three numbers.** The age of the current statistics in commits or days. The count of delete manifests relative to data manifests. The count of Puffin files on storage relative to the count referenced in metadata. Each one drifting upward has a specific fix, and each is cheap to compute from the metadata tables.

**Record `created-by` and check it.** When a Puffin file behaves strangely, the `created-by` property in its footer tells you which engine and version wrote it. Encourage every writer in your stack to set it, and include it in any debugging checklist.

**Encrypt if the table is encrypted.** Iceberg's table encryption, which gained envelope encryption and key management integration in 1.11, extends to statistics files through the `key-metadata` field in the `statistics` entry. A Puffin file holding a sketch of customer IDs leaks value hashes, not values, but a deletion vector file discloses which rows changed. If the data files are encrypted, the Puffin files should be too.

## Where the Ecosystem Is Heading

Puffin was designed to hold more than two blob types, and the pressure to add more is growing.

**More statistics blob types.** The obvious candidates are histograms for range selectivity, which let an optimizer estimate what fraction of rows fall between two values rather than assuming uniform distribution, and most-frequent-value lists for skew detection. Both are mergeable in sketch form and both are well understood from decades of database work. Proposals for these come up on the dev list with regularity.

**Indexes, not just statistics.** A blob type for a Bloom filter or a min-max index over a whole partition lets an engine prune at a finer grain than per-file manifests without touching Parquet footers. Spatial indexes for the v3 `geometry` and `geography` types are a natural fit: bounding boxes in manifests are coarse, and a cell-based index in Puffin gives the planner a second, finer cut. Vector-search indexes for embedding columns are further out but follow the same pattern.

**Non-JVM readers and writers.** PyIceberg, iceberg-rust, and iceberg-go all read deletion vectors as part of their v3 support, because reads are not correct without them. Writing statistics from these implementations is newer. As DuckDB, Polars, and the Rust-based engines become first-class Iceberg writers, expect them to produce Theta sketches with the DataSketches ports for their languages, and expect the shared serialization rule to matter more as the writer count grows.

**A second Puffin version.** The spec currently defines a single version and reserves every flag bit but one. A version bump becomes likely when a blob type needs a container-level feature, such as per-blob encryption keys or a blob-level checksum for statistics (deletion vectors already have one). The design leaves room for this without breaking the two-range-read footer discovery.

**Format version 4.** The v4 spec restructures manifests and moves column statistics into typed structs. It does not change Puffin. Deletion vectors and statistics files continue to be referenced the same way, which is a sign the container has held up.

## Conclusion

Puffin solves two problems that Iceberg's manifests were never designed for: table-wide statistics that need mergeable sketches, and row-level deletes that need bitmaps. It solves them with a container so simple that a complete reader is a hundred lines in any language. A magic number, a run of opaque blobs, a JSON footer with offsets and lengths, and a trailer that locates the footer in two range reads.

The two blob types show the range of what fits in that container. A Theta sketch is a probabilistic structure that estimates distinct counts within a couple of percent, merges across engines because the spec fixes the value serialization, and ships its estimate in the footer so most readers never decode it. A deletion vector is a Roaring bitmap wrapped in a Delta-compatible envelope, referenced directly from delete manifests by offset and length so the hot read path skips the footer entirely.

The operational lessons are about lifecycle rather than format. Statistics are opt-in and go stale, so analyze on a growth-driven cadence and scope it to columns the optimizer uses. Deletion vectors accumulate and get orphaned, so compact and clean up on the same schedule as data files. Do those two things and Puffin is invisible infrastructure that makes joins faster and deletes cheap. Skip them and you have a table with statistics from six months ago and ten thousand small delete files that nobody sweeps.

## Keep Going

If this piece was useful, I have written a lot more on the Iceberg metadata layer and how engines use it to plan and execute queries. *Apache Iceberg: The Definitive Guide* from O'Reilly covers manifests, snapshots, row-level deletes, and the statistics that feed query planning, which is the context every section of this article sits inside. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
