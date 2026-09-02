---
title: "Storage-Partitioned Joins and the Bucket Transform"
date: "2026-09-02"
description: "How the spec-defined bucket transform lets engines skip the shuffle in joins, and how to set it up and keep it engaged in Spark."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Bucketing
  - Query Planning
  - Storage-Partitioned Joins
  - Spark
canonical: https://iceberglakehouse.com/posts/storage-partitioned-joins-and-the-bucket-transform/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/storage-partitioned-joins-and-the-bucket-transform/).

A nightly job joins a 3-billion-row orders table to a 400-million-row customers table on `customer_id`. Both are Apache Iceberg tables. Both are large enough that neither side fits in a broadcast. The engine does what engines do: it reads both tables, hashes every row by `customer_id`, shuffles both sides across the network so that matching keys land on the same worker, sorts, and merges. The shuffle moves close to a terabyte. The job takes ninety minutes and most of that time is spent moving data that is already sitting in files, waiting to be rearranged.

Now suppose both tables had been written with `bucket(64, customer_id)` as a partition field. Every row with a given `customer_id` in the orders table sits in one of 64 buckets, and every row with that same `customer_id` in the customers table sits in the bucket with the same number, because both tables computed the bucket with the same hash function on the same value. The engine can read bucket 17 from both tables and join them on one worker without a shuffle. It can do that for all 64 buckets in parallel. No exchange, no sort, and the job finishes in the time it takes to read the files once.

That is a storage-partitioned join (SPJ), and it depends on a property of Iceberg that most people never think about: the bucket transform is defined in the table format specification, byte for byte, so that every engine computes identical bucket numbers for identical values. This article explains the transform at the spec level, walks through how a query planner uses it to skip the shuffle, shows how to configure it in Spark, and covers the ways it fails to engage. I work at Dremio, and I have kept the engine-specific parts to what the open-source implementations document.

## What Bucketing Is and Why It Is Different From Other Partitioning

Iceberg partitions a table by applying transforms to source columns. `day(ts)` turns a timestamp into a date. `truncate(3, region)` turns a string into its first three characters. `identity(country)` uses the value as-is. Each transform produces a partition value, and rows with the same partition value land in the same partition. Manifests record the partition value for every data file, and a query with a predicate on the source column prunes files whose partition value cannot match.

Every transform except one produces partition values that mean something about the data. A `day` partition contains rows from that day. A `truncate` partition contains rows that share a prefix. A predicate on the source column maps cleanly to a set of partitions.

The bucket transform is different. `bucket(64, customer_id)` produces an integer from 0 to 63 by hashing the value and taking the remainder. The bucket number says nothing about the customer. It says only that every row with this exact `customer_id` is in this bucket, and that rows are spread across buckets roughly evenly regardless of the distribution of the underlying values. A hot customer with a million orders and a cold customer with one both go to whichever bucket their hash selects.

This gives bucketing two properties that the other transforms lack. First, it bounds the number of partitions. A table partitioned by `identity(customer_id)` has one partition per customer, which for 400 million customers is unusable. A table partitioned by `bucket(64, customer_id)` has 64 partitions no matter how many customers exist. Second, it is deterministic across tables and engines. Two tables that both bucket a column into the same number of buckets, using the spec's hash function, agree on where every value goes.

The second property is what makes SPJ possible, and it is the reason the spec pins down the hash function so precisely.

## The Bucket Transform at the Spec Level

The Iceberg specification defines the bucket transform in one line of pseudo-code:

```
bucket_N(x) = (murmur3_x86_32_hash(x) & Integer.MAX_VALUE) % N
```

Three details in that line carry the whole design.

**The hash is 32-bit Murmur3, x86 variant, seed 0.** Murmur3 is a non-cryptographic hash designed for speed and even distribution. The spec names the exact variant so that a Java implementation, a Rust implementation, and a Python implementation produce bit-identical results. This is not a suggestion. A reader that computes a different hash looks for a value in the wrong bucket and returns nothing.

**The sign bit is discarded before the modulo.** Murmur3 produces a signed 32-bit integer, and the modulo of a negative number is negative in many languages. Masking with `Integer.MAX_VALUE` (0x7FFFFFFF) clears the sign bit, so the result of the modulo is always in `[0, N)`. Implementations in languages where `%` behaves differently have to reproduce this exactly.

**The input bytes are specified per type.** Hashing a value requires deciding what bytes to hash, and the spec's Appendix B fixes this for every bucketable type:

| Type | Bytes hashed | Test value from the spec |
|---|---|---|
| `int` | as a `long`, 8 bytes little-endian | `34` hashes to `2017239379` |
| `long` | 8 bytes little-endian | `34L` hashes to `2017239379` |
| `decimal(P,S)` | unscaled value as minimal big-endian two's complement | `14.20` hashes to `-500754589` |
| `date` | days from epoch, hashed as `int` | `2017-11-16` hashes to `-653330422` |
| `time` | microseconds from midnight, as `long` | `22:31:08` hashes to `-662762989` |
| `timestamp`, `timestamptz` | microseconds from epoch, as `long` | `2017-11-16T22:31:08` hashes to `-2047944441` |
| `timestamp_ns`, `timestamptz_ns` | microseconds from epoch (nanos truncated), as `long` | same as above |
| `string` | UTF-8 bytes | `iceberg` hashes to `1210000089` |
| `uuid` | 16 bytes big-endian | `f79c3e09-677c-4bbd-a479-3f349cb785e7` hashes to `1488055340` |
| `fixed(L)`, `binary` | the bytes | `00 01 02 03` hashes to `-188683207` |

Two entries in that table are deliberate design choices rather than accidents. An `int` is hashed as if it were a `long`, so `34` and `34L` produce the same hash. This is why the schema evolution rules allow promoting an `int` bucket source to `long` without repartitioning: every existing bucket number stays correct. And nanosecond timestamps are hashed at microsecond precision, so a `timestamp` column promoted to `timestamp_ns` keeps its bucket assignments too.

The types missing from the table are also deliberate. `float` and `double` are not bucketable because floating-point equality is unreliable and because `0.0` and `-0.0` compare equal but have different bit patterns. `boolean` has only two values, so bucketing it is pointless. `struct`, `list`, `map`, `variant`, `geometry`, and `geography` are not bucketable because they lack a canonical byte representation. The spec includes hash definitions for `boolean`, `float`, and `double` in case they are ever needed, but no implementation uses them for partitioning today.

The spec's test values are the contract. Any implementation that claims Iceberg compatibility must produce `1210000089` for the string `iceberg`, and the reference test suites check exactly that. It is worth confirming in a shell that the library you are using agrees:

```python
from pyiceberg.transforms import BucketTransform
from pyiceberg.types import StringType, LongType

print(BucketTransform(num_buckets=64).transform(StringType())("iceberg"))
print(BucketTransform(num_buckets=64).transform(LongType())(34))
```

For `iceberg`, `1210000089 & 0x7FFFFFFF` is `1210000089`, and `1210000089 % 64` is `25`. For `34`, `2017239379 % 64` is `19`. Any engine writing either table puts those values in buckets 25 and 19, and any engine reading them looks there.

### Verifying Hash Agreement Across Implementations

Because bucketed tables are increasingly written by one implementation and read by another, it is worth knowing how to check that two libraries agree before trusting a mixed fleet. The spec's test vectors make this a three-line exercise in each language.

In Java, using the reference library:

```java
import org.apache.iceberg.transforms.Transforms;
import org.apache.iceberg.types.Types;

int b = Transforms.bucket(64).bind(Types.StringType.get()).apply("iceberg");
System.out.println(b);   // 25
```

In Python with PyIceberg, as shown earlier, the same call returns 25. In Rust with iceberg-rust:

```rust
use iceberg::spec::Transform;
use iceberg::spec::Datum;

let t = Transform::Bucket(64);
let f = iceberg::transform::create_transform_function(&t)?;
let out = f.transform_literal(&Datum::string("iceberg"))?;
// Some(Datum::int(25))
```

And in DuckDB's Iceberg extension or any Go-based reader, the equivalent check is a point lookup on a known key against a table written by another engine. If the row comes back, the hashes agree.

The reason to run this once per implementation is that the failure mode is silent. A library with a subtly wrong Murmur3 variant, or one that hashes an `int` as four bytes instead of eight, produces plausible bucket numbers that are simply different from everyone else's. Tables it writes are unreadable by point lookup from other engines, and tables it reads return empty results for keys that exist. The spec's test vectors exist to make this checkable in seconds, and every conforming implementation includes them in its own test suite, so the check is more a habit than a necessity. It is a good habit.

## Bucketing in a Partition Spec

A partition spec with a bucket field looks like this in the table metadata:

```json
{
  "spec-id": 0,
  "fields": [
    { "source-id": 2, "field-id": 1000, "name": "customer_id_bucket",
      "transform": "bucket[64]" },
    { "source-id": 3, "field-id": 1001, "name": "placed_at_day",
      "transform": "day" }
  ]
}
```

The `source-id` is the schema field ID of `customer_id`. The transform is `bucket[64]`. The partition field ID `1000` is what manifests use to identify the partition value in each file's `partition` struct. The name is conventional and can be anything.

Creating it in Spark SQL:

```sql
CREATE TABLE sales.orders (
  order_id    BIGINT NOT NULL,
  customer_id BIGINT NOT NULL,
  placed_at   TIMESTAMP NOT NULL,
  amount      DECIMAL(12,2)
) USING iceberg
PARTITIONED BY (bucket(64, customer_id), days(placed_at));
```

Because bucket values are hidden partitioning, no query ever references `customer_id_bucket` by name. A predicate `WHERE customer_id = 8812345` is enough. The planner computes `bucket_64(8812345)`, finds the bucket number, and prunes every file whose partition tuple has a different bucket. This is the same hidden-partition pruning Iceberg applies to `day(placed_at)`, and it works for equality predicates and `IN` lists. It does not work for range predicates, because a hash destroys ordering: `customer_id BETWEEN 100 AND 200` touches every bucket.

Bucket count is a decision with consequences. Too few buckets and each bucket is large, so a point lookup still reads a lot of data and a join has limited parallelism. Too many and each bucket is small, so files are tiny and there are many of them. The usual guidance is to pick a count such that each bucket, within whatever other partitioning the table has, holds a few hundred megabytes to a few gigabytes. For a table with a `day` partition and 10 GB per day, 16 or 32 buckets gives files in the healthy range. Bucket counts that are powers of two are conventional but not required.

Changing the bucket count later is partition evolution. A new spec with `bucket[128]` is added, new files are written under it, old files keep their `bucket[64]` values, and the planner handles both. But SPJ needs both sides of a join to agree on the bucket count, and a table with files under two specs is, for SPJ purposes, two tables. Rewriting old data into the new spec with `rewrite_data_files` restores a single layout. Plan bucket counts with growth in mind so that this is rare.

## How Writers Assign Rows to Buckets

The read side computes a bucket from a predicate. The write side computes a bucket for every row, and how it distributes those rows across tasks determines the file count.

A writer evaluates the partition spec on each row: `bucket_64(customer_id)` and `day(placed_at)`, producing a partition tuple. Rows with the same tuple belong in the same file. If the writer's input is not organized by tuple, each task sees rows from many tuples and either keeps many files open at once or writes many small files. That is the small-file problem that `write.distribution-mode` exists to solve. With `hash` distribution, the engine shuffles rows by partition tuple before writing so that each task owns a set of tuples and writes one file per tuple. With `range`, it sorts globally. With `none`, it writes whatever each task has.

For a bucketed table this shuffle-before-write is often unnecessary when the input is already bucket-aligned, which is exactly the situation after a storage-partitioned join or merge. The output of an SPJ on `customer_id` is already grouped by bucket. Redistributing it by partition tuple is a second shuffle that moves the data back to where it already was. Setting `write.distribution-mode` to `none` for that job, or `spark.sql.iceberg.distribution-mode=none` at the session level, skips it. This is the write-side half of the SPJ benefit, and it is worth the same attention as the join.

Spark also exposes the bucket function directly, through Iceberg's registered SQL functions, so that a job can compute the bucket for its own purposes:

```sql
SELECT system.bucket(64, customer_id) AS b, count(*)
FROM staging.orders
GROUP BY b;
```

That function uses the same spec-defined hash, so its output matches the partition value the writer will assign. It is useful for pre-partitioning a DataFrame with `repartition(64, expr("system.bucket(64, customer_id)"))` before a write with distribution mode `none`, which produces exactly one file per bucket per task with no Iceberg-driven shuffle. It is also the quickest way to check, in any Spark session, which bucket a given key lives in when debugging a lookup that returned nothing.

## The Pruning Path for Point Lookups

The join benefit gets the attention, but bucketing earns its place on most tables through simple pruning, and understanding that path explains why the spec is so exact about the hash.

A manifest entry for a data file in the bucketed orders table carries a `partition` struct with two fields: `customer_id_bucket` (field ID 1000) holding an integer from 0 to 63, and `placed_at_day` (field ID 1001) holding a date. When a query arrives with `WHERE customer_id = 8812345 AND placed_at >= DATE '2026-08-01'`, the planner does two things before opening any file.

It projects the predicate through the partition spec. `customer_id = 8812345` becomes `customer_id_bucket = bucket_64(8812345)`. The planner computes the hash in-process, using the same Murmur3 implementation the writer used, and gets a bucket number, say 41. `placed_at >= DATE '2026-08-01'` becomes `placed_at_day >= 2026-08-01`. The predicate is now expressed in partition terms.

It then evaluates that projected predicate against the partition struct of every manifest entry, and before that against the partition summaries in the manifest list, which record the range of partition values each manifest covers. Manifests whose bucket range excludes 41 are skipped without being read. Entries whose bucket is not 41 or whose day is before August are skipped without their files being opened. What remains is the set of files in bucket 41 on or after August 1, which for a 64-bucket table is one sixty-fourth of the August data.

`IN` lists work the same way. `customer_id IN (8812345, 2200191, 77)` projects to `customer_id_bucket IN (41, 7, 58)` and prunes to three buckets. A list of a thousand IDs projects to at most 64 distinct buckets, which for a large list is every bucket, so the benefit fades as lists grow.

What does not project is any predicate that is not an equality. `customer_id > 8812345` cannot be turned into a bucket predicate because the hash has no order. `customer_id LIKE '88%'` on a string column has the same problem. A bucketed column supports equality pruning and nothing else, which is why bucketing is chosen for high-cardinality identifier columns that are always looked up by exact value and never by range.

The hash computation on the read side is the reason the spec's test vectors matter. A planner whose hash disagrees with the writer's by even one bit computes the wrong bucket and prunes away the file that holds the row. The result is not an error. It is a query that returns zero rows for a customer who exists. Every Iceberg implementation ships a test asserting that `iceberg` hashes to `1210000089`, and that test is the difference between correct pruning and silent data loss on read.

## How a Planner Skips the Shuffle

A hash join needs matching keys on the same worker. Without any prior knowledge about how the data is laid out, the engine achieves this by shuffling: every row is hashed on the join key and sent to the worker responsible for that hash range. Both sides pay this cost.

A storage-partitioned join replaces that step with knowledge. The planner asks each table for its partitioning, which Iceberg reports through the engine's data source interface as "these files are grouped by `bucket(64, customer_id)`." The planner checks three things:

1. Both sides are partitioned on the join key by the same transform with the same parameters. `bucket(64, customer_id)` on both, not `bucket(64)` on one and `bucket(32)` on the other, and not `bucket` on one and `identity` on the other.
2. Both sides use the same hash function. For Iceberg tables this is guaranteed by the spec.
3. The scan can deliver each partition's files as a unit, so that bucket 17 of the left side and bucket 17 of the right side can be handed to one task.

If all three hold, the planner generates a plan with no exchange. Each task reads one bucket from each side and joins them locally. Parallelism is the bucket count. A table with 64 buckets produces 64 tasks.

Spark's implementation has some refinements worth knowing because they are behind configuration flags.

**Partially clustered distribution.** When one side has far more data per bucket than the other, the smaller side's bucket can be replicated to several tasks that each handle a slice of the larger side's bucket. This handles skew where one bucket is much larger than average.

**Pushing partition values.** When one side has buckets that are empty (no files in bucket 42, for example), the planner can push the set of populated bucket values down so that the other side skips reading its bucket 42 too.

**Join keys as a subset of partition keys.** By default Spark requires the join keys to match the partition keys exactly. A flag relaxes this so that a table partitioned by `bucket(64, customer_id), day(placed_at)` can participate in an SPJ on `customer_id` alone, with the planner grouping by the bucket and treating the day as a sub-grouping.

**One-side shuffle.** Newer Spark versions can shuffle only one side to match the other's partitioning when only one side is bucketed. This still saves half the network traffic.

The output of the join inherits the partitioning. A `MERGE INTO` from a bucketed staging table into a bucketed target, both on the same key and count, runs the match without a shuffle and writes the results without a redistribution. This is the case where SPJ pays off most, because merges on large tables are dominated by the shuffle and sort of both sides.

## Bucketing, Sorting, and Z-Ordering: Which Layout for Which Question

Bucketing is one of three layout tools Iceberg offers for clustering related rows, and the three answer different questions.

**Partition-level bucketing** places rows in separate partitions by hash. It bounds partition count, supports equality pruning at the manifest level, and enables storage-partitioned joins. Its weakness is that it says nothing about ordering within a bucket, and it adds a partition dimension that multiplies file count when combined with time partitioning. A table with 365 days and 64 buckets has at least 23,360 partitions per year.

**Sort order** arranges rows within files and, with a range distribution, across files. A table sorted by `customer_id` within each day partition has files whose min/max bounds on `customer_id` are narrow, so the same equality lookup prunes at the file level via column statistics rather than at the partition level. It also supports range predicates, which bucketing does not. Its weakness is that it does not help joins, because the planner has no guarantee that a given key is in a predictable file, and it requires a sort on write, which costs a shuffle.

**Z-order** is a multi-column sort that interleaves the bits of several columns so that rows close in any one of them tend to be close in the file. It is applied through `rewrite_data_files` with a `zorder` strategy rather than through the table's sort order, and it serves tables queried by several different columns with no dominant one. It does not help joins either.

The decision comes down to the query pattern:

| Query pattern | Best layout |
|---|---|
| Equality lookups on one high-cardinality key, plus joins on that key | Bucket on the key |
| Range and equality lookups on one key, no large joins | Sort on the key |
| Lookups on several unrelated columns | Z-order on those columns |
| Time-range scans with occasional key lookups | Time partition, sort on the key within it |
| Large joins on a key plus range scans on time | Time partition plus bucket on the key |

The last row is the most common design for fact tables, and it is what the orders table in this article uses. The combination is deliberate: the time partition serves retention and range scans, and the bucket serves joins and point lookups. The trade is a higher partition count, which is why the bucket count should be chosen so that each day-bucket pair holds a reasonably sized file rather than a sliver.

Bucketing inside a sort order is a fourth option that the ecosystem is starting to use. `WRITE ORDERED BY bucket(64, customer_id), customer_id` sorts rows by bucket and then by key within each file, without adding a partition. Files then have narrow min/max on the bucket value, which prunes at the file level for equality lookups, without the partition-count multiplication. It does not enable SPJ, because the planner cannot see the grouping, but it gives most of the pruning benefit on tables where the partition count is already high.

## Walkthrough: Enabling SPJ in Spark

Spark supports SPJ through its DataSource V2 interface, and Iceberg has reported partitioning to it since Iceberg 1.2 and Spark 3.3. The feature is off by default because it changes plans, and turning it on requires several flags. This is the full set as of Spark 3.5 and 4.x:

```sql
-- Report Iceberg partitioning to Spark and keep partitions together in tasks
SET spark.sql.sources.v2.bucketing.enabled = true;
SET spark.sql.iceberg.planning.preserve-data-grouping = true;

-- Allow SPJ when join keys are a subset of partition keys
SET spark.sql.requireAllClusterKeysForCoPartition = false;

-- Let the planner prune empty buckets on the other side and handle skew
SET spark.sql.sources.v2.bucketing.pushPartValues.enabled = true;
SET spark.sql.sources.v2.bucketing.partiallyClusteredDistribution.enabled = true;

-- Optional: prefer hash join over sort-merge so no sort is added
SET spark.sql.join.preferSortMergeJoin = false;
```

`pushPartValues.enabled` became true by default in Spark 4.0. The others still need to be set. `preserve-data-grouping` is the Iceberg-side flag that tells the Iceberg scan not to combine files from different partitions into one split, which it otherwise does to balance task sizes. Without it, Spark sees the partitioning but cannot rely on it, because a task is free to hold files from two buckets.

With those set, run the join and check the plan:

```sql
EXPLAIN FORMATTED
SELECT o.order_id, o.amount, c.segment
FROM sales.orders o
JOIN sales.customers c ON o.customer_id = c.customer_id
WHERE o.placed_at >= TIMESTAMP '2026-08-01';
```

A plan that uses SPJ has no `Exchange hashpartitioning` node between the two `BatchScan` nodes and the join. A plan that did not engage SPJ has one on each side. The `BatchScan` node's description includes the reported partitioning when SPJ is in effect. This is the fastest way to confirm the feature is doing anything, and it should be the first check when a join that was supposed to be shuffle-free is slow.

When testing, two settings interfere. Adaptive query execution (AQE) can coalesce partitions after planning, which changes the plan shape and occasionally defeats SPJ in Spark 3.x. Disabling it for the test isolates the behavior, but leaving it off in production is not advisable, and Spark 4.x handles the interaction correctly. And the broadcast join threshold will turn a small-enough side into a broadcast regardless of bucketing, which is fine in production and confusing in a test. Setting `spark.sql.autoBroadcastJoinThreshold = -1` during the test forces the planner to consider SPJ.

For writes, the same bucketing helps. A `MERGE INTO sales.orders t USING staging.orders s ON t.customer_id = s.customer_id` where both are bucketed identically runs the matching phase without a shuffle. If `write.distribution-mode` is `hash`, Spark will still redistribute before writing to cluster by partition. Setting the write distribution mode to `none` for that job, when the input is already bucket-aligned, skips that too.

### Checking Bucket Balance From the Metadata Tables

Before relying on SPJ, it is worth confirming that the buckets are balanced, because the join's runtime is the runtime of its slowest bucket. The `files` metadata table exposes each file's partition tuple, so bucket sizes are one query away:

```sql
SELECT partition.customer_id_bucket AS bucket,
       count(*)                       AS files,
       sum(record_count)              AS rows,
       round(sum(file_size_in_bytes) / 1048576) AS mb
FROM sales.orders.files
WHERE content = 0
GROUP BY partition.customer_id_bucket
ORDER BY mb DESC;
```

A healthy table shows 64 rows with sizes within a factor of two of each other. A skewed table shows one or two buckets several times larger than the rest, which points at hot keys. The same query grouped by both `customer_id_bucket` and `placed_at_day` shows whether the per-partition files are in the target size range or whether the bucket count is too high for the daily volume.

Comparing this output across the two tables in a join also confirms the bucket counts match, since a table with 32 buckets returns 32 rows. And running it after a partition evolution shows whether old-spec files remain, because those files carry a partition tuple from the old spec and appear under a different `spec_id` in the `files` table.

### Aligning an Existing Table

Tables that were created without bucketing, or with a different count from their join partner, can be brought into alignment without recreating them. Partition evolution adds the bucket field to a new spec:

```sql
ALTER TABLE sales.customers ADD PARTITION FIELD bucket(64, customer_id);
```

New writes land under the new spec. Existing files remain under the old one, and until they are rewritten the table cannot participate in SPJ. The rewrite that moves them is a full compaction with the `rewrite-all` option, which forces every file to be rewritten rather than only the small ones:

```sql
CALL polaris.system.rewrite_data_files(
  table   => 'sales.customers',
  options => map('rewrite-all', 'true', 'target-file-size-bytes', '268435456')
);
```

After it completes, every data file carries a partition tuple with the bucket value, the `files` table shows a single `spec_id`, and the join can be planned without a shuffle. For a large table this is a one-time cost proportional to the table's size, and it is a good moment to also apply a sort order and a metrics change, since the files are being rewritten anyway. Old files stay referenced by prior snapshots until expiry.

Removing a bucket field later is the same operation in reverse: `DROP PARTITION FIELD`, then a rewrite. The spec's rule that partition field IDs are never reused means the old field's values remain readable in old snapshots.

## Beyond Spark: What Other Engines Do With Buckets

SPJ as described is a Spark planner feature built on Spark's V2 partitioning interface. Other engines use bucket information differently, and knowing what each does prevents assuming a benefit that is not there.

**Trino** reads Iceberg bucket partitions for pruning and, on tables bucketed by the join key, can use the bucketing to co-locate join processing when both tables share bucket count and function. Trino's support has evolved across releases and depends on the connector version.

**Flink** uses bucket partitions for pruning and for distributing writes so that each subtask owns a set of buckets, which reduces small files in streaming sinks. It does not perform SPJ in the Spark sense.

**Dremio** uses bucket partitions for pruning on equality predicates and reads partition metadata during planning. Join co-location decisions are made by its own cost-based planner based on statistics.

**DuckDB and other single-node engines** prune on bucket predicates and otherwise ignore the layout, since a single-node engine has no shuffle to avoid.

The common thread is pruning. Every engine benefits from the bucket transform on point lookups and `IN` list queries, because the spec-defined hash lets any engine find the right bucket. The shuffle-free join is a distributed-planner feature, and Spark's is the most complete.

## Failure Modes

SPJ silently falls back to a shuffle when any precondition fails, and the fallback produces correct results, so the failures show up as slow jobs rather than errors.

**Bucket count mismatch.** One table has `bucket(64, customer_id)` and the other `bucket(32, customer_id)`. The planner sees different partitionings and shuffles both. This includes the case where one table's bucket count was evolved and the other's was not. Check `SHOW CREATE TABLE` on both.

**Bucket on different types.** `customer_id` is `BIGINT` in one table and `STRING` in the other, holding the same digits. The spec hashes them differently, so the buckets do not line up even with the same count. Spark also refuses the SPJ because the transforms are on different types. Align the types before bucketing.

**Partition evolution left files under two specs.** After changing the bucket count, old files sit under the old spec. Iceberg reports the table as partitioned by the current spec, but the scan includes files from the old one, and Spark cannot guarantee grouping. The symptom is SPJ working on newly written tables and not on evolved ones, and the fix is a full `rewrite_data_files` after evolution.

**`preserve-data-grouping` not set.** Every other flag is on, the plan still shows exchanges. This flag is Iceberg-specific and easy to miss because it is not in Spark's own documentation.

**Join keys that include a non-partition column.** Joining on `customer_id AND region` when only `customer_id` is bucketed. Without the subset-of-partition-keys flag, Spark requires all cluster keys to match and falls back. With it, the bucket is used and `region` is compared within the task.

**Skewed buckets.** A single `customer_id` with 20 percent of all orders makes its bucket 13 times larger than average. With 64 tasks, one runs 13 times longer. Partially clustered distribution helps by splitting the large side. Beyond that, the fix is a different key or a composite bucket on `(customer_id, order_id)`, which sacrifices the join benefit.

**A broadcast that should have been an SPJ, or the reverse.** If the smaller side fits under the broadcast threshold, Spark broadcasts it and SPJ does not engage. That is usually fine. The reverse is worse: a side that was a cheap broadcast candidate is instead read bucket by bucket because the threshold was set to -1 during testing and left there.

**Delete files that break grouping.** In v2 tables, position delete files written at partition granularity apply to files within a partition, which is fine. Equality delete files can apply across partitions, and their presence can prevent the scan from guaranteeing that a task's data is fully contained within one bucket. v3 deletion vectors are per data file and do not have this problem.

## Operational Guidance

**Bucket both sides of the join, on the same column, with the same count, on the same type.** This is the entire precondition, and it has to be decided when the tables are created. Retrofitting means a partition evolution and a rewrite on at least one side.

**Pick the count from data volume, not from a round number.** Target a few hundred megabytes to a few gigabytes per bucket within the table's other partitions. Sixteen to 128 covers most cases.

**Order partition fields with the bucket last when combined with a time partition.** `days(placed_at), bucket(64, customer_id)` produces a directory layout of day then bucket, which matches how compaction and retention operate on time ranges. The partition tuple order does not affect pruning or SPJ.

**Enable the Spark flags in the cluster default configuration**, not per job, so that every join between bucketed tables benefits. Keep AQE on. Do not carry a disabled broadcast threshold from testing into production.

**Verify with EXPLAIN after any partition change.** An evolution on either table can break the alignment, and the job will not tell you.

**Compact with the bucket in the sort order.** `rewrite_data_files` on a bucketed table preserves partition values by definition, since partition values are stored per file, but a compaction that merges across specs after an evolution is what restores a single layout.

**Use bucketing for point lookups even without joins.** A customer-service tool that queries one `customer_id` at a time reads one bucket instead of scanning a day's files. That benefit needs no engine flags.

## Where the Ecosystem Is Heading

**Spark's SPJ is maturing toward default-on.** Each release has moved a flag to true by default and fixed a category of fallbacks. The one-side shuffle work in Spark 4.x, which lets a bucketed table join a non-bucketed one at half the shuffle cost, broadens the cases where bucketing on one table alone is worthwhile.

**Other distributed engines are adding equivalent planning.** The Iceberg partition spec is public metadata, and any planner that understands `bucket[N]` can implement co-located joins. Expect Trino and Flink to close the gap with Spark.

**Multi-argument transforms in v3.** Format version 3 allows partition transforms to take multiple source columns through the `source-ids` field. This is the mechanism for a future `bucket` over a composite key, which lets tables that join on two columns bucket on both together.

**Bucketing as a sort-order tool.** Iceberg sort orders accept transforms, so a table can be sorted by `bucket(64, customer_id)` within a partition without being partitioned by it. This clusters rows by bucket inside files, giving row-group-level pruning without a directory-level partition. Engines are beginning to use sort-order bucketing as a lighter alternative when partition counts are already high.

**Native hash agreement across languages.** With iceberg-rust, iceberg-go, and PyIceberg all implementing the spec's Murmur3 requirements and passing the spec's test vectors, the guarantee that "every engine agrees on the bucket" now covers engines that never touch the JVM, which is what makes bucketed tables safe to share across a mixed fleet.

## Conclusion

The bucket transform is a single line in the spec: Murmur3, mask the sign bit, take the remainder. That line, with a table of per-type byte encodings and a set of test vectors, is what lets any engine find the bucket for any value and lets two tables agree on where matching keys live. Everything a storage-partitioned join does follows from that agreement. The planner sees identical partitioning on both sides, hands each bucket pair to one task, and the shuffle that dominates large joins disappears.

The requirements are strict and the failures are silent. Same column, same count, same type, both sides. The Spark flags set. No stale spec. Check the plan, not the runtime. Do that and a join that moved a terabyte becomes a join that reads one, once.

## Keep Going

If this piece was useful, I have written a lot more on Iceberg partitioning, layout, and how engines plan queries against table metadata. *Apache Iceberg: The Definitive Guide* from O'Reilly covers partition transforms, hidden partitioning, and partition evolution in the depth this article builds on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
