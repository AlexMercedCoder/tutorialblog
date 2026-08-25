---
title: "DataFusion Comet 1.0 and What Native Rust Scans Change for Spark on Iceberg"
date: "2026-08-25"
description: "DataFusion Comet 1.0 replaces Spark Iceberg scans with native Rust. What speeds up, what still falls back to the JVM, and how to deploy it."
author: "Alex Merced"
category: "Apache Iceberg"
canonical: https://iceberglakehouse.com/posts/datafusion-comet-1-spark-iceberg/
tags:
  - Apache Iceberg
  - Apache Spark
  - DataFusion Comet
  - Rust
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/datafusion-comet-1-spark-iceberg/).

A Spark job reads a 4 terabyte Apache Iceberg table, filters it down to a week of data, joins it against a dimension table, and aggregates. On paper the plan is simple. In the Spark UI, the scan stage takes 70 percent of the wall clock time, executors show long garbage collection pauses in the middle of the scan, and the CPU is busy but not busy doing anything you asked for. The work is decoding Parquet pages into Java objects, copying them into Spark's internal row format, and cleaning up the garbage afterward.

That cost is structural. Spark's execution engine runs on the Java Virtual Machine (JVM), and the JVM's memory model was not designed for scanning billions of columnar values. Every value that moves through the scan touches allocation, and every allocation eventually touches the garbage collector.

Apache DataFusion Comet 1.0.0, released August 7, 2026, is the first stable release of a plugin that replaces those scan and compute operators with native Rust code, without changing a line of your Spark application. This article explains what Comet does, how the native Iceberg scan is wired, where the speedup comes from, what still falls back to the JVM, and how to deploy it without getting surprised.

A note on where I sit: I work at Dremio, which builds a lakehouse platform on Apache Arrow and Apache Iceberg. Dremio's engine is a different tool from Spark and competes in a different part of the stack, and I have tried to keep this piece about the mechanism rather than about products.

## The JVM Memory Tax on Analytical Scans

To understand what Comet fixes, it helps to be precise about what Spark's built-in Parquet scan does with each row group it reads.

Spark's vectorized Parquet reader decodes pages into column batches. That part is already columnar and reasonably fast. The trouble starts after decoding. Most Spark operators consume rows, not columns, so the columnar batch gets converted to InternalRow objects through a ColumnarToRow step. Each row is an object. Each string inside it is a UTF8String object backed by a byte array. Each nested struct or array is another object graph. A scan that reads 500 million rows creates hundreds of millions of short-lived objects, and every one of them lives in the JVM heap until a garbage collection cycle reclaims it.

Spark's whole-stage code generation reduces this overhead by fusing operators into a single generated Java method that operates on rows without materializing intermediate objects. It helps a lot. It does not remove the fundamental cost, because the generated code still works on rows, still allocates for strings and nested types, and still runs under a garbage collector that has to pause the executor to compact the heap.

Off-heap memory in Spark, through Tungsten, moves some of this data out of the garbage-collected heap into raw memory managed by Spark itself. That reduces GC pressure for shuffle and sort buffers. It does not turn the execution model columnar.

The practical symptoms are familiar to anyone who has tuned a large Spark job:

- Executors show GC time that is 10 to 30 percent of task time during scans of wide tables.
- CPU utilization is high but throughput per core is low, because the cores are busy decoding, boxing, and collecting rather than evaluating the query.
- Memory settings are fragile. A job that runs fine at one executor size falls over with OutOfMemory at a slightly different size, because heap sizing for object-heavy workloads is hard to predict.
- String-heavy tables are dramatically slower than numeric tables, out of proportion to their byte size.

The fix that the broader engine ecosystem converged on years ago is to keep data in a columnar in-memory format from scan through aggregation and do the work in native code with vectorized kernels. Apache Arrow, co-created by Jacques Nadeau, is that format. Engines like Dremio, DuckDB, Polars, and DataFusion itself were built around it from the start. Spark was not, and retrofitting it is the problem Comet solves.

## What Comet Is and Where It Sits

Comet is a Spark plugin. It ships as a JAR that bundles a native Rust library, and you enable it with a handful of configuration properties. When it loads, it registers a set of physical planner rules. After Spark's Catalyst optimizer produces a physical plan, Comet's rules walk that plan and replace each Spark operator it recognizes with an equivalent Comet operator. Those Comet operators do not run Spark's code. At execution time they serialize the operator subtree into a protobuf description, hand it across the Java Native Interface (JNI) to the Rust library, and the Rust library builds and runs an equivalent DataFusion physical plan. Results come back across the boundary as Arrow record batches.

Apache DataFusion is a query engine written in Rust, built on Arrow, with its own Parquet reader, expression evaluator, and operator library. Comet reuses all of it. Comet's own contribution is the translation layer, the Spark-compatible expression semantics (a large library called datafusion-comet-spark-expr that makes DataFusion produce the same results Spark does for things like decimal arithmetic, date handling, and string functions), a native shuffle, and the JNI plumbing.

Comet was donated to the DataFusion project in March 2024 and cut its 0.1.0 release five months later with 13 operators and 106 expressions. The 1.0.0 release, 20 releases later, recognizes more than 400 Spark expressions and accelerates all four of Spark's join operators, window functions, generators like explode, sampling, in-memory table scans, and a fully native shuffle. It has drawn contributions from more than 120 developers. The 1.0 label means the project now follows semantic versioning, so upgrades within the 1.x line are backward-compatible and deprecations get a minor release of warning before removal.

The supported matrix for 1.0.0 is Spark 3.4 through 4.1, with experimental support for 4.2. Spark 3.4 and JDK 11 are deprecated and scheduled for removal in 1.1.0. Comet fully supports ANSI mode, which is the default from Spark 4.0 onward, and that matters because early releases fell back to Spark entirely when ANSI was on. The release upgrades the underlying libraries to DataFusion 54.1 and Arrow 58.4.

The single most important design property of Comet is graceful fallback. If Comet's planner hits an operator or expression it cannot run natively, it leaves that part of the plan in Spark and inserts conversion operators at the boundary. The query still runs and still returns correct results. The cost is the conversion between Arrow batches and Spark rows at each boundary, which can erase the gains if it happens too often. Most of the engineering effort in Comet's last year has gone into making fallback rarer and cheaper, and the next two sections explain how.

## Plan Translation From Spark to DataFusion

Walk through what happens to a simple query.

```sql
SELECT region, SUM(amount) AS total
FROM sales
WHERE sale_date >= DATE '2026-08-17'
GROUP BY region
```

Spark parses this, resolves it against the catalog, optimizes it, and produces a physical plan that looks roughly like this from the bottom up: a Parquet or Iceberg scan of `sales` with the date filter pushed down, a filter for whatever the scan cannot fully evaluate, a partial hash aggregate, an exchange (shuffle) on `region`, and a final hash aggregate.

Comet's planner rule visits each node. The scan becomes a CometNativeScan (for plain Parquet) or a Comet native Iceberg scan. The filter becomes a CometFilter. The partial aggregate becomes a CometHashAggregate. The exchange becomes a CometExchange, which is Comet's native shuffle. The final aggregate becomes another CometHashAggregate. At the top, where Spark needs rows to hand back to the driver, Comet inserts a CometColumnarToRow.

At execution time, each stage's Comet subtree is serialized once and sent to the native side. Inside Rust, DataFusion builds a plan: a ParquetExec with projection and pushed-down predicates, a FilterExec, an AggregateExec in partial mode, and so on. Data flows through as Arrow record batches, typically 8,192 rows at a time, and never touches the JVM heap until the final result crosses back.

Three things make this faster than Spark's own execution.

First, the data stays columnar the whole way. Aggregating `amount` by `region` operates on an Arrow array of amounts and an Arrow array of regions. The hash aggregate uses vectorized hashing and vectorized accumulation. There are no row objects.

Second, the memory is not garbage collected. Arrow buffers in Rust are allocated and freed deterministically. Comet uses an off-heap memory pool that it shares with Spark's off-heap accounting, so Spark still knows how much memory the native side is using, but the JVM garbage collector never sees it. This is why Comet's documentation recommends deploying with `spark.memory.offHeap.enabled=true` and a meaningful `spark.memory.offHeap.size`.

Third, the native shuffle avoids the row conversion that Spark's shuffle requires. Spark's default shuffle serializes rows. Comet's shuffle writes Arrow IPC batches directly, which is both faster to write and faster to read on the other side. The shuffle also supports the partitioning schemes Spark uses, including hash and range partitioning, so it slots in without changing the plan's semantics.

The translation is invisible to the application. A PySpark DataFrame pipeline, a Spark SQL query, or a Scala job all go through the same planner and get the same treatment. That zero-code-change property is what separates Comet from rewriting your job for a different engine.

## The Native Iceberg Scan and Where iceberg-rust Fits

Iceberg tables are the interesting case, because an Iceberg scan is two jobs: planning (reading metadata to decide which files and which byte ranges to read, and which delete files apply) and reading (decoding those files and applying deletes). Comet 1.0 splits those two jobs across the JVM and Rust, and it is worth being exact about the split, because it determines what gets faster and what does not.

Planning stays in Iceberg Java. When Spark plans a query against an Iceberg table, the Iceberg Spark integration reads the metadata tree, prunes manifests and files using partition values and column statistics, and produces a set of FileScanTask objects. Each task names a data file, a byte range, the residual filter to apply, and the delete files that affect it. Comet's native Iceberg reader extracts those FileScanTasks through reflection and serializes them to the native side. Metadata reading, manifest evaluation, and file pruning all happen on the driver in Java, exactly as they do without Comet.

Reading moves to Rust. The native side receives the serialized tasks and uses iceberg-rust, the Rust implementation of the Iceberg library, to open each data file with its own Rust object store client, decode Parquet into Arrow, apply positional and equality deletes, evaluate the residual filter, and hand Arrow batches to the rest of the DataFusion plan. The 0.14 and 0.15 releases contributed a number of reader performance improvements upstream to iceberg-rust, and Comet picks up the latest iceberg-rust release with each version.

So the JVM memory tax on the scan is gone, but the planning cost is unchanged. On a table with millions of files and wide statistics maps, planning time on the driver is the same with or without Comet. That is a real limitation, and it is one that the Iceberg v4 work on columnar metadata is separately addressing at the format level. If your bottleneck is planning rather than reading, Comet is not the tool that fixes it.

The native Iceberg reader in 1.0 supports table spec v1, v2, and v3, all primitive types including UUID, arrays, maps, and structs, schema evolution, time travel through VERSION AS OF, branch reads, positional and equality deletes including mixed delete types, and a broad set of pushed-down predicates. It supports standard partitioning plus the days, bucket, truncate, and hour transforms for pruning. It reads from local disk, HDFS, and S3-compatible storage. It also supports v3 full-table encryption with 128-bit and 256-bit AES-GCM keys on Iceberg 1.11, with the key envelope unwrapped on the driver and the plaintext data key passed in each file's key_metadata so the native side needs no KMS integration.

The reader falls back to the JVM Iceberg path for several cases, and you should know them before you plan a rollout:

- Iceberg table spec v4 or newer.
- v3 tables with columns that declare an initial default value.
- v3 column types the native reader cannot decode: variant, geometry, geography, and unknown.
- Deletion vectors (v3 Puffin-based deletes). Position and equality deletes in Parquet are supported.
- Tables with Avro or ORC data files. Only Parquet is accelerated.
- Tables partitioned on BINARY or high-precision DECIMAL columns.
- Residual filters that use truncate, bucket, year, month, day, or hour transform functions. Partition pruning on these still works, but row-level evaluation of the transform falls back.
- Writes. Comet accelerates reads. Writes go through Spark.

That last one is the biggest gap for teams whose Spark jobs are mostly ingestion. If your pipeline reads a small amount and writes a lot, Comet's benefit is limited to the read side and any transformation before the write.

One more detail on storage: the native reader has its own Rust object store client and does not go through Iceberg's JVM FileIO. It reads S3 configuration from the catalog's `s3.*` properties or from `spark.hadoop.fs.s3a.*` settings, and nothing else. If your REST catalog vends temporary credentials, the native reader does not consume them automatically, and you need the credential provider bridge described in Comet's S3 credential provider guide. This is the single most common reason a first Comet-on-Iceberg deployment fails with an access error while the plain Spark path works fine.

## Codegen Dispatch: Closing the Coverage Gap Without Losing Speed

The fallback problem deserves its own section, because Comet's answer to it is the most interesting piece of engineering in the 1.0 release.

Before 0.17, fallback was coarse. If any expression in an operator lacked a native implementation, the whole operator subtree fell back to Spark. That meant converting Arrow batches to rows before the operator, running Spark's code, and converting rows back to Arrow afterward. For a plan with one unsupported expression buried in a projection, the conversion cost often exceeded whatever Comet had saved elsewhere. Users hit this constantly with regular expressions, where Java's regex engine and any Rust regex crate differ in edge-case semantics, so Comet had to mark regex expressions as incompatible rather than risk wrong answers.

Codegen dispatch, introduced in 0.17 and widened in 1.0, narrows the fallback to the single expression. The Arrow batch stays in the Comet pipeline. For the one expression Comet cannot run natively, Comet invokes Spark's own generated Java code for just that expression, reading from Arrow input and writing Arrow output. Everything around it stays native.

This has four consequences the release notes call out, and I think they are worth restating because they change how you evaluate Comet's coverage.

Coverage becomes immediate. An expression that lacks a Rust port no longer blocks native execution of everything around it. It runs through dispatch until someone ports it.

Compatibility becomes exact for the hard cases. Regex is the canonical example. Because dispatch runs Spark's own implementation, the result is bit-for-bit identical to Spark, which a native reimplementation can never fully promise.

Expression trees get fused. A nested expression that routes through dispatch is compiled into a single method, so the Arrow reads, the evaluation, and the Arrow writes are one unit with no intermediate batch materialized between levels.

User-defined functions ride along. Scala and Java UDFs compile to the same codegen surface as built-in expressions, so a query that was previously disqualified from acceleration because it contained a UDF now runs natively everywhere except inside the UDF itself.

The 1.0 release widens dispatch in three ways. Previously, an expression reached the dispatcher only when Comet marked it incompatible for the given input. An unsupported report still sent the whole subtree back to Spark. In 1.0 both support levels route through dispatch. Casts join the same path, including legacy cast configuration variants. And the path is now visible: Comet's extended explain output reports which expressions ran natively and which ran through dispatch, so you can see the actual execution path rather than infer it.

There is also experimental support for accelerated PyArrow UDFs, which lets PyArrow-based Python UDFs participate in native execution rather than forcing a fallback. It is early and the project is asking for feedback, but it points at the same goal: make the set of queries that fall back as small as possible.

## How Comet Compares to Other Native Spark Accelerators

Comet is not the only project that swaps Spark's execution engine for native code, and it helps to place it. The approaches differ in what they replace, what language they use, and what license they carry.

Apache Gluten is the closest relative. Gluten is also an open source Spark plugin that offloads physical operators to a native backend, and its primary backend is Velox, the C++ execution library from Meta. Gluten and Comet solve the same problem with different native libraries: Velox for Gluten, DataFusion for Comet. Gluten has been in the field longer and has broad operator coverage. Comet's distinguishing choices are Rust, a smaller dependency surface, and the codegen dispatch mechanism for filling expression gaps with Spark's own code rather than reimplementing everything natively.

Photon is Databricks' proprietary C++ engine for Spark on the Databricks platform. It is not available outside Databricks and is not a plugin you install. It demonstrates the same thesis, that native columnar execution under the Spark API is a large win, but it is a platform feature rather than a portable component.

The RAPIDS Accelerator for Apache Spark, from NVIDIA, offloads Spark operators to GPUs. It targets a different hardware profile and pays off for workloads where GPU memory bandwidth dominates. Comet's documentation makes a point of the opposite: it runs on commodity CPUs with no special hardware, and its gains come from better utilization of what you already have.

Here is how the options line up on the axes that matter for an Iceberg shop:

| | DataFusion Comet 1.0 | Apache Gluten (Velox) | Photon | RAPIDS Accelerator |
|---|---|---|---|---|
| License and governance | Apache 2.0, ASF (DataFusion subproject) | Apache 2.0, ASF | Proprietary, Databricks only | Apache 2.0, NVIDIA |
| Native language | Rust | C++ | C++ | C++ and CUDA |
| Hardware | Commodity CPU (x86-64-v3, ARM neoverse-n1) | Commodity CPU | Commodity CPU | NVIDIA GPU |
| Installation | Spark plugin JAR | Spark plugin JAR | Built into Databricks runtime | Spark plugin JAR |
| Iceberg reads | Native via iceberg-rust, with documented fallbacks | Via JVM Iceberg with native Parquet decode | Native | Via JVM Iceberg with GPU decode |
| Iceberg writes | Spark (native writes in development) | Spark | Native | Spark |
| Gap-filling for unsupported expressions | Codegen dispatch to Spark's generated code | Fallback to Spark operator | Fallback to Spark operator | Fallback to Spark operator |
| Spark versions (as of Aug 2026) | 3.4 to 4.1, 4.2 experimental | Varies by release | Databricks runtime only | Varies by release |

A few observations from the table. Comet and Gluten are the two portable, open, CPU-based choices, and they are the ones to evaluate side by side if you run open source Spark. The right answer between them depends on your expression mix and your delete strategy on Iceberg, so run both on your top queries with fallback logging on. Photon is the answer if you are already on Databricks and not otherwise. RAPIDS is a separate decision about hardware.

The row I want to draw attention to is the Iceberg reads row. Comet is the only one of the four that reads Iceberg data files through a native Iceberg library (iceberg-rust) rather than through a native Parquet decoder fed by the JVM Iceberg reader. In practice the difference in 1.0 is modest, because planning is still Java in all of them. It becomes significant as iceberg-rust matures and as v4 metadata arrives, because it puts Comet in a position to move planning native without a new integration layer.

## Configuration Walkthrough

Here is a complete spark-submit configuration for running Comet 1.0.0 against an Iceberg table in a REST catalog. I will explain each group of settings after the block.

```bash
$SPARK_HOME/bin/spark-submit \
  --packages org.apache.datafusion:comet-spark-spark3.5_2.13:1.0.0,org.apache.iceberg:iceberg-spark-runtime-3.5_2.13:1.11.0 \
  --conf spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions \
  --conf spark.sql.catalog.lake=org.apache.iceberg.spark.SparkCatalog \
  --conf spark.sql.catalog.lake.catalog-impl=org.apache.iceberg.rest.RESTCatalog \
  --conf spark.sql.catalog.lake.uri=https://catalog.example.com/api/catalog \
  --conf spark.sql.catalog.lake.warehouse=analytics \
  --conf spark.sql.catalog.lake.io-impl=org.apache.iceberg.aws.s3.S3FileIO \
  --conf spark.sql.catalog.lake.client.region=us-east-1 \
  --conf spark.plugins=org.apache.spark.CometPlugin \
  --conf spark.shuffle.manager=org.apache.spark.sql.comet.execution.shuffle.CometShuffleManager \
  --conf spark.memory.offHeap.enabled=true \
  --conf spark.memory.offHeap.size=16g \
  --conf spark.comet.scan.icebergNative.enabled=true \
  --conf spark.comet.scan.icebergNative.dataFileConcurrencyLimit=4 \
  --conf spark.comet.explain.fallback.enabled=true \
  my_job.py
```

**The packages line.** Comet's artifact name encodes the Spark and Scala version it was built for. `comet-spark-spark3.5_2.13` is the Spark 3.5, Scala 2.13 build. Match it exactly to your Spark distribution, and use the same Scala version for the Iceberg runtime. The published Maven JARs bundle native libraries for Linux amd64 and arm64 only. On macOS you build from source. The amd64 build targets x86-64-v3 (AVX2 and later), and the arm64 build targets neoverse-n1 (Graviton2 and later), so very old hardware will fail with an illegal instruction error and also needs a source build.

**The Iceberg catalog block.** This is standard Iceberg-on-Spark configuration and has nothing Comet-specific in it. The native reader has been tested with Hadoop, Hive, and REST catalogs. I use REST here because it is the direction the ecosystem has gone. Any REST-compliant catalog works, including Apache Polaris, which graduated to a top-level Apache project on February 18, 2026, and Dremio's Open Catalog, which is powered by Polaris.

**The `client.region` and `io-impl` settings.** The native reader configures its own Rust S3 client from the catalog's `s3.*` and `client.*` properties. Setting the region explicitly avoids a lookup and is required for non-AWS S3-compatible endpoints. If you use a custom endpoint, add `s3.endpoint` and `s3.path-style-access=true` here as well.

**`spark.plugins` and the shuffle manager.** These two lines are what turn Comet on. The plugin registers the planner rules and loads the native library. The shuffle manager swaps in Comet's Arrow-based shuffle. You can run Comet without the native shuffle by leaving the shuffle manager at the default, but you lose a large part of the benefit, because every exchange becomes a columnar-to-row boundary.

**Off-heap memory.** Comet's native execution allocates from an off-heap pool that shares Spark's off-heap accounting. Since 0.11 the default pool is a fair unified pool, and the project expects you to run with off-heap enabled. Size it generously. A reasonable starting point is to move most of what you previously gave to executor heap into off-heap, since the JVM heap has much less to do once scans and aggregates are native. Watch for native memory pressure in the logs and adjust.

**The Iceberg native scan settings.** The native reader is on by default in 1.0, so the `enabled` line is documentation more than configuration. The concurrency limit is the setting worth tuning. It defaults to 1 to preserve ordering behavior in Iceberg's own tests, and the project suggests 2 to 8 for real workloads. It controls how many data files a single task fetches in parallel to hide object store latency.

**Fallback explain.** With this on, Comet logs a warning for every part of a plan it cannot run natively, along with the reason. Turn it on during evaluation and keep it on in staging. It is the fastest way to find out why a query did not get faster.

To confirm Comet is active from inside a session, check the version property:

```sql
SET spark.comet.version;
```

And to see what actually ran natively, use explain on your query and look for Comet operators in the physical plan:

```
== Physical Plan ==
CometColumnarToRow
+- CometHashAggregate [region], [sum(amount)]
   +- CometExchange hashpartitioning(region, 200)
      +- CometHashAggregate [region], [partial_sum(amount)]
         +- CometFilter (sale_date >= 2026-08-17)
            +- CometIcebergNativeScan lake.db.sales [region, amount, sale_date]
```

Every operator carries the Comet prefix. If you see a plain HashAggregate or a ColumnarToRow followed by a RowToColumnar somewhere in the middle of the plan, that is a fallback boundary, and the fallback log will tell you which expression caused it.

## Reading Benchmarks Honestly

Comet's early releases reported modest speedups from small-scale, single-node TPC runs, and the project was candid about that. The picture has changed as coverage grew. The 0.15 release reported a 2x speedup on TPC-H at scale factor 1000 (1 terabyte), which the project framed as a choice between finishing the same workload in half the time or matching current performance on half the cluster. Independent results from AWS Labs on TPC-DS at 3 terabytes running on EKS show substantial speedups as well, and the 1.0 announcement points to those rather than to the project's own numbers.

I am not going to invent a number for your workload, because the honest answer is that it depends on three things you can measure yourself.

The first is scan share. If your job spends most of its time in scans and simple filters and aggregates over Parquet, Comet helps a lot. If it spends most of its time in a Python UDF or a write, Comet helps less.

The second is fallback rate. Turn on fallback explain, run your top 20 queries, and count how many have a fallback boundary in the middle of a hot path. Each one is a place where data crosses between Arrow and rows. Codegen dispatch has made this much rarer, but it has not made it zero.

The third is memory configuration. A Comet deployment with a starved off-heap pool spills constantly and looks slower than plain Spark. Most disappointing first benchmarks I have seen come down to this.

Run the comparison on your own queries with fallback logging on and off-heap sized properly. The TPC numbers tell you what is possible. Your numbers tell you what you will get.

## Failure Modes and Warning Signs

Comet is mature enough that most surprises are documented, but the documentation is spread across a dozen pages. Here are the failure modes I see teams hit, with the symptom that tips you off.

**Credential errors on the native path only.** The native reader uses its own Rust object store client, and it only sees credentials that arrive through the catalog's `s3.*` properties or `spark.hadoop.fs.s3a.*`. A REST catalog that vends per-request temporary credentials does not automatically feed the native reader. The symptom is an access denied error on a table that the plain Spark path reads fine. The fix is the credential provider bridge in Comet's S3 documentation, or disabling the native Iceberg scan for that catalog until you wire it.

**Silent fallback erasing the speedup.** A query runs, returns correct results, and is no faster than before. Nine times out of ten there is a fallback boundary in the plan. The remaining time it is a write-heavy job where the read side was never the bottleneck. Turn on `spark.comet.explain.fallback.enabled` and read the reasons. Common triggers in 1.0 are deletion vectors on v3 tables, variant columns, residual filters on transform functions, and expressions with no native or dispatch path yet.

**Off-heap exhaustion.** Native operators spill when the off-heap pool is full, and spilling in Comet is slower than spilling in Spark because the project has spent less time on it. The symptom is a job that is fast on a sample and slow at scale, with native memory warnings in executor logs. Increase `spark.memory.offHeap.size`, and reduce executor heap correspondingly, since the JVM has less to hold.

**Illegal instruction on old hardware.** The published JARs target x86-64-v3 and neoverse-n1. On a CPU older than roughly 2013 for x86 or without Neoverse-N1-class ARM cores, the native library crashes with SIGILL at load. This shows up on some on-premises clusters and some budget cloud instance types. The fix is a source build for your target.

**Version drift between Comet, Spark, and Scala.** Comet's JAR is compiled against a specific Spark and Scala version. Mixing a Spark 3.5 Comet with Spark 4.0, or a 2.12 Comet with a 2.13 Iceberg runtime, produces class loading failures that look like Comet bugs but are packaging errors. The compatibility table in the installation guide is the source of truth, and the deprecation of Spark 3.4 and JDK 11 in 1.1 means the window is narrowing.

**Proprietary Spark forks.** Comet's documentation warns that it does not fully work with every vendor Spark distribution. The planner rules and the shuffle manager depend on Spark internals that forks sometimes change. Test on your actual distribution rather than assuming.

**Floating-point and regex differences.** Even with codegen dispatch for the hard cases, there are documented compatibility notes on floating-point comparison and regular expressions. If your workload has correctness tests that compare exact floating-point sums, run them with Comet on before trusting a rollout.

**Planning time unchanged on huge tables.** Because Iceberg planning stays in Java, a table where the driver spends 40 seconds evaluating manifests still spends 40 seconds. Comet's per-task input metrics will show a fast scan while the job's total time barely moves. This is not a Comet bug. It is a metadata layout problem that compaction and, eventually, Iceberg v4's columnar metadata address.

## Operational Guidance for a Rollout

If you are planning a Comet adoption on Iceberg workloads, here is the sequence I recommend.

**Inventory your Spark and Scala versions.** Get every cluster onto Spark 3.5 or 4.x with JDK 17 and Scala 2.13 before you start. That is where Comet's test coverage is deepest and where the project is heading. Spark 3.4 works in 1.0 but is going away in 1.1.

**Inventory your tables.** For each Iceberg table in the workload, check the format version, whether it uses deletion vectors, whether it has variant or geo columns, and what file format the data is in. Tables that fall into any fallback category will read through the JVM. That is fine, but you want to know in advance so a slow query does not send you on a wild goose chase.

**Fix credentials first.** If your catalog vends credentials, set up the credential provider bridge before running a single benchmark. Half of the first-week friction with Comet on Iceberg is this one issue.

**Start with fallback logging on and a read-heavy job.** Pick a job that is mostly scan, filter, join, and aggregate, and run it with and without Comet on the same data. Read the fallback log. Fix what you can (usually a config or a version) and note what you cannot (usually a data type or delete strategy).

**Re-balance memory.** Move memory from executor heap to off-heap in proportion to how much of the plan went native. A job that was 80 percent native scan and aggregate can typically run with a much smaller heap and a much larger off-heap pool. Do this deliberately rather than just adding off-heap on top, or you will over-provision.

**Tune the data file concurrency limit.** The default of 1 is conservative. Try 4 and measure. Object store reads are latency-bound, and parallel fetching within a task is one of the cheapest wins available.

**Keep a kill switch.** `spark.comet.enabled=false` disables Comet entirely for a session, and `spark.comet.scan.icebergNative.enabled=false` disables just the native Iceberg reader. Put both in your job template so an on-call engineer can flip them without a redeploy.

**Track fallback rate as a metric.** Once you are in production, the number of queries with fallback boundaries is the health metric that matters. A rising fallback rate after a Spark or Iceberg upgrade tells you something changed in the plans before users notice slower jobs.

For teams that also run interactive SQL against the same tables, it is worth being clear about scope. Comet makes Spark faster at Spark's job, which is batch and pipeline workloads. It does not turn Spark into a sub-second interactive engine, because Spark's scheduling, job startup, and shuffle architecture were built for throughput rather than latency. Interactive analytics on the same Iceberg tables is a different tool class. Dremio's engine, for example, is Arrow-native from the ground up with query acceleration through Autonomous Reflections, and it reads the same Iceberg tables Comet-accelerated Spark writes. The open table format is what lets both engines share one copy of the data, which is the whole point of the lakehouse.

## Where This Is Heading

Three developments around the 1.0 release point at where Comet and the surrounding ecosystem go next.

The first is governance. Alongside the 1.0 release, Andy Grove opened a discussion about promoting Comet from a DataFusion subproject to a top-level Apache project. That reflects both the size of the contributor base and the fact that Comet's user community (Spark operators) overlaps only partly with DataFusion's (engine builders). A top-level project gets its own PMC, its own release cadence, and its own roadmap.

The second is writes. Comet 1.0 accelerates Iceberg reads and leaves writes to Spark. The development snapshot documentation already has an Iceberg writes page, which means native write support is being built. When it lands, ingestion-heavy pipelines get the same treatment scans have now, and the JVM tax on writing Parquet (encoding, dictionary building, statistics) goes away too.

The third is the Iceberg format itself. The v4 specification work happening on the Iceberg dev list this year moves metadata to Parquet, restructures statistics into typed columns, and redesigns the manifest list as a root manifest. Comet's native Iceberg reader currently falls back for v4 tables, which is expected for a spec that is not final. Once v4 stabilizes, the interesting question is whether planning moves native too. iceberg-rust already reads manifests, and Parquet manifests with typed statistics are exactly the kind of input a vectorized Rust reader is good at. A future Comet that plans and reads Iceberg tables entirely in Rust removes the last piece of the scan path from the JVM.

Zoom out and the pattern is the same one the rest of the data ecosystem has followed. Arrow became the shared in-memory format. Parquet became the shared on-disk format. Iceberg became the shared table format. DataFusion is becoming a shared execution library that gets embedded in engines rather than competing with them. Comet is what that looks like inside Spark: the query language and the scheduler stay, and the execution engine underneath gets swapped for a shared native one. I expect more of the JVM data stack to go the same way.

## Conclusion

Spark's execution model was built on rows and JVM objects, and analytical scans pay for that with garbage collection, boxing, and copying that no amount of tuning fully removes. DataFusion Comet 1.0.0 replaces the scan, filter, aggregate, join, and shuffle operators with native Rust code that keeps data in Arrow batches from the first Parquet page to the final result, without changing the Spark application at all.

For Iceberg tables, the split is precise: planning stays in Iceberg Java on the driver, and reading moves to iceberg-rust on the executors. That fixes the memory tax on the scan itself and leaves metadata planning unchanged, which is worth understanding before you benchmark. The fallback categories in 1.0 (deletion vectors, variant columns, v4 tables, writes, transform residuals) are documented and specific, and codegen dispatch has shrunk the general fallback problem from whole subtrees to single expressions.

If you run Spark on Iceberg and your jobs are read-heavy, Comet 1.0 is the point where the project is stable enough to adopt. Get on Spark 3.5 or later with JDK 17, sort out credentials, turn on fallback logging, re-balance memory toward off-heap, and measure on your own queries. The speedup is real, and so are the edges.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg, query engines, and lakehouse architecture. *Apache Iceberg: The Definitive Guide* (O'Reilly) covers how engines plan and read Iceberg tables, which is the foundation for understanding what Comet changes and what it leaves alone. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
