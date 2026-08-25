---
title: "Serverless Iceberg Ingestion with PyIceberg and DuckDB: Micro-Batches Without a Spark Cluster"
date: "2026-08-25"
description: "Land small Iceberg micro-batches with PyIceberg and DuckDB in a serverless function. Commits, concurrency, and why Spark is the wrong default."
author: "Alex Merced"
category: "Apache Iceberg"
canonical: https://iceberglakehouse.com/posts/serverless-iceberg-microbatch-pyiceberg-duckdb/
tags:
  - Apache Iceberg
  - PyIceberg
  - DuckDB
  - serverless
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/serverless-iceberg-microbatch-pyiceberg-duckdb/).

A team has 40 event feeds landing in an object store. Most of them produce a few hundred megabytes an hour. A handful spike to a few gigabytes during business hours. The data needs to end up in Apache Iceberg tables within a few minutes of arrival so analysts and agents can query it. The obvious answer is a Spark Structured Streaming job, so the team stands one up. Six months later they are paying for a three-node cluster that sits at 8 percent CPU, they have a checkpoint directory nobody fully understands, and every version upgrade of Spark, Iceberg, and the cloud connector jar is a week of work.

The cluster was never the right tool. Spark exists to shuffle terabytes across hundreds of cores. Landing a few hundred megabytes an hour into a table is not that job. It is a job for a function that wakes up, reads a batch, writes a few Parquet files, commits to a catalog, and goes back to sleep.

Two pieces of software make that function practical today. PyIceberg is the Python implementation of Iceberg, and it talks to REST catalogs, writes data files, and commits snapshots without a JVM. DuckDB is an embedded analytical engine that runs in-process, handles transformation in SQL, and since version 1.5.3 in May 2026 writes to Iceberg tables through an attached REST catalog with full support for MERGE INTO, ALTER TABLE, and the v3 format. Together they fit inside an AWS Lambda function, a Google Cloud Run job, or an Azure Function, and they cost nothing while idle.

This article covers the mechanics of an Iceberg commit so you understand what the function has to do, how PyIceberg and DuckDB divide the work, how to configure them against an Apache Polaris or other REST catalog with vended credentials, what breaks in serverless environments specifically, and how to keep the resulting table healthy. I work at Dremio, whose Open Catalog is built on Polaris, and I will use Polaris as the catalog in the examples because it is the open one I know best. Everything here applies to any REST-compliant catalog.

## The Cost of Running a Cluster for a Small Stream

Before the mechanism, the economics, because they are the reason to bother.

A streaming engine on a cluster has a fixed cost: the nodes run whether or not data is arriving. For a workload that produces data continuously at high volume, that cost is amortized over a lot of useful work. For a workload that produces data in bursts, or at low volume, most of the cluster's life is spent waiting.

There is also a fixed operational cost. A JVM streaming job has a checkpoint, an offset store, a driver that can fail, executors that can be preempted, and a dependency set (Spark version, Iceberg runtime jar, Hadoop cloud connectors, catalog client) that has to be kept mutually compatible. Each of those is a thing that pages someone at 3 AM. The team in the opening spent more engineer time maintaining the cluster than they saved by having it.

A serverless function inverts both. Compute cost is per invocation and per millisecond, so an idle feed costs nothing. The dependency set is a Python package list in a container image or a layer, and the function has no persistent state except what it writes to object storage and the catalog. The failure modes are simpler: an invocation either commits or it does not, and the platform retries.

The tradeoffs are real and I will get to them. Serverless environments have hard limits on execution time, memory, temporary disk, and package size. They have cold starts. They run many copies of your function concurrently, which is great for throughput and bad for a table format that serializes commits. Understanding an Iceberg commit is the way to reason about all of those.

## What a Micro-Batch Commit Actually Does

An Iceberg append is a sequence of file writes followed by one atomic catalog operation. Each step is worth knowing because each one is a place where a serverless function spends time, memory, or a network round trip.

First, the writer produces one or more data files. For a micro-batch that is Parquet, written by PyArrow or by DuckDB's Parquet writer, to the table's data location in object storage. The writer computes per-column statistics (min, max, null count, value count) as it goes, because those go into the manifest.

Second, the writer creates a manifest file listing the new data files with their partition values and statistics. A manifest is an Avro file (Parquet in the proposed v4 format) and it lives in the table's metadata location.

Third, the writer creates a new manifest list that references every manifest in the new snapshot: the new one plus all the existing ones that still hold live data. For an append, existing manifests are carried forward untouched. The manifest list is small, one row per manifest.

Fourth, the writer builds a new table metadata document. This JSON file holds the schema, partition spec, snapshot log, and a pointer to the new manifest list. It is a full copy of the previous metadata with the new snapshot added.

Fifth, the writer asks the catalog to commit. Against a REST catalog, that is a single HTTP POST to the table's update endpoint carrying the new metadata (or the list of changes to apply) plus a requirement: the table's current metadata must still be the one the writer started from. The catalog checks the requirement, and if it holds, swaps the pointer atomically. If it does not hold, because another writer committed first, the request fails with a conflict and the writer has to retry from the current state.

Steps one through four are object store writes. Step five is the only serialized operation in the whole flow, and it is the one that concurrent functions contend on. That single fact shapes the architecture: write files in parallel, commit in a way that tolerates conflicts.

A note on size: every commit adds at least one data file, one manifest, one manifest list, and one metadata file. A function that commits every 10 seconds produces 8,640 snapshots a day and at least that many tiny files at every level. That is the small-file problem, and it is the first failure mode I will cover. The batching decision is the most important design choice in the whole pipeline.

## How PyIceberg and DuckDB Divide the Work

The two libraries overlap a little and complement each other a lot.

PyIceberg is the Iceberg implementation. It loads a catalog, resolves a table to its current metadata, and exposes the write API: `append`, `overwrite`, `upsert`, `delete`, and dynamic partition overwrite. It takes Arrow tables as input and handles everything from step one through step five above, including statistics, manifests, and the REST commit with retry. It understands vended credentials from the catalog, so the function never holds long-lived storage keys. The 0.11 line (0.11.1 shipped in March 2026) is the current stable release, and it includes v3 read support, upsert, and the memory improvements that matter for small-footprint environments. A 0.12.0 release candidate went out in early August, drew a binding -1 after a user reported a correctness regression, and a new candidate is coming. Pin to 0.11.1 for production until 0.12.0 lands.

DuckDB is the transformation engine. It reads raw input (JSON, CSV, Parquet, Avro through extensions) at high speed, does the cleaning, typing, deduplication, and enrichment in SQL, and produces an Arrow table. It also has its own Iceberg extension that can attach a REST catalog and write directly, including MERGE INTO for upsert patterns, which arrived in the 1.5.3 release. The extension is separate from PyIceberg and the two do not share code.

That gives you two viable shapes.

The first is DuckDB for transform, PyIceberg for write. DuckDB reads the raw batch, produces an Arrow table, and hands it to PyIceberg's `append`. This is the shape I recommend as a default, because PyIceberg's write path is the reference Python implementation, its REST catalog client handles vended credentials and OAuth token refresh, and the Arrow handoff between DuckDB and PyIceberg is zero-copy.

The second is DuckDB end to end. DuckDB attaches the REST catalog, reads the raw batch, and runs `INSERT INTO` or `MERGE INTO` against the Iceberg table directly. This is simpler to write and the right choice when the ingestion is an upsert against a keyed table, because MERGE INTO in SQL is clearer than orchestrating PyIceberg's `upsert` with a join key. The DuckDB extension currently supports REST catalogs on S3, S3 Tables, and GCS, and not yet ADLS, which is the main reason to know both shapes.

Here is how the two compare on the dimensions that matter for a serverless function:

| Concern | PyIceberg (0.11.1) | DuckDB Iceberg extension (1.5.3) |
|---|---|---|
| Role | Iceberg catalog client and writer | SQL engine with Iceberg read and write |
| Input | Arrow tables and pandas DataFrames | Any DuckDB-readable source via SQL |
| Append | `table.append(arrow_table)` | `INSERT INTO catalog.ns.table` |
| Upsert | `table.upsert(arrow_table)` | `MERGE INTO` |
| Vended credentials | Yes, via REST catalog client | Yes, via attached REST catalog |
| Storage backends | S3, GCS, ADLS, and others via FileIO | S3, S3 Tables, GCS (ADLS not yet) |
| Format v3 | Read support | Read and write |
| Package footprint | Small (pyarrow is the bulk) | Single binary plus extension download |
| Commit conflict handling | Built-in retry with backoff | Transaction fails, caller retries |
| Best fit | Append-heavy ingestion, ADLS, custom partitioning | Upsert-heavy ingestion, SQL-native teams |

## Serverless Constraints You Have to Design Around

Every serverless platform has the same five constraints in slightly different numbers. Design against them up front.

Execution time is capped. AWS Lambda tops out at 15 minutes. Cloud Run jobs and Azure Durable Functions go longer, but a function that regularly runs for 10 minutes is a function that is one slow object store call away from a timeout. Size batches so the typical invocation finishes in under 2 minutes and the worst case in under 5.

Memory is capped and it is what you pay for. Lambda goes to 10 gigabytes, and CPU scales with memory. DuckDB and PyArrow are both memory-hungry when they hold a whole batch. A 500-megabyte Parquet batch decompressed into Arrow is 2 to 4 gigabytes. Set DuckDB's `memory_limit` explicitly and stream through PyIceberg's writer rather than materializing everything twice.

Temporary disk is small. Lambda's `/tmp` defaults to 512 megabytes and can go to 10 gigabytes. DuckDB spills to disk when it exceeds its memory limit, and if `/tmp` is small it fails instead. Point DuckDB's `temp_directory` at `/tmp` and size both together.

Package size is capped. Lambda's deployment package is 250 megabytes unzipped, and PyArrow alone is a large fraction of that. Use a container image (up to 10 gigabytes) rather than a zip, and build it with only the extras you need. PyIceberg's `s3fs`, `gcsfs`, and `adlfs` extras each pull in a cloud SDK.

Cold starts are real. Importing PyArrow, DuckDB, and PyIceberg takes 1 to 3 seconds on a cold container. Loading the DuckDB Iceberg extension from the network adds more. For a function that runs every minute, cold starts are a small fraction of invocations. For one that runs every hour, they are every invocation. Bake the DuckDB extension into the image and initialize the catalog client outside the handler so warm invocations reuse it.

Concurrency is the sixth constraint, and it is the one that interacts with Iceberg most. Serverless platforms scale out by running many copies of the function at once. If 20 copies each try to commit to the same table at the same moment, 19 of them get a conflict on the first try and retry. Iceberg's optimistic concurrency handles this correctly, but each retry re-reads the table metadata and rebuilds the manifest list, and with enough contention the tail latency gets bad. The fix is architectural, and it is the next section.

Here are the limits that matter on the three major platforms, as of this writing. Check the current numbers before you design, because they move.

| Constraint | AWS Lambda | Google Cloud Run (jobs) | Azure Functions (Premium) |
|---|---|---|---|
| Max execution time | 15 minutes | 24 hours per task | Unbounded (60 min default) |
| Max memory | 10 GB | 32 GB | 14 GB |
| Ephemeral disk | 512 MB to 10 GB | In-memory filesystem, counts against memory | Up to 250 GB |
| Deployment | Zip (250 MB) or container (10 GB) | Container | Zip or container |
| Concurrency control | Reserved concurrency per function | Max instances, task parallelism | Max scale-out per plan |
| Native scheduling | EventBridge | Cloud Scheduler | Timer trigger |

Cloud Run's generous limits make it the easiest fit for larger batches, and its in-memory filesystem means DuckDB spills count against memory, so size the job accordingly. Lambda's 15-minute cap is the one that forces discipline about batch size, which is a feature as much as a constraint.

## Packaging the Function

The container image is where most of the cold start and package size problems get solved or created. Here is a Dockerfile for the Lambda variant that keeps the image lean and pre-loads the DuckDB Iceberg extension at build time so it never downloads at runtime:

```dockerfile
FROM public.ecr.aws/lambda/python:3.12

# Only the extras this function needs. Each cloud SDK adds 50 to 150 MB.
RUN pip install --no-cache-dir \
    "pyiceberg[s3fs,pyarrow]==0.11.1" \
    "duckdb==1.5.3"

# Pre-install the Iceberg and httpfs extensions into the image so a cold
# container does not fetch them over the network on first use.
RUN python -c "import duckdb; c = duckdb.connect(); \
    c.execute('INSTALL iceberg'); c.execute('INSTALL httpfs'); \
    c.execute('LOAD iceberg'); c.execute('LOAD httpfs')"

# DuckDB stores installed extensions under the home directory by default.
# Lambda's home is read-only at runtime, so point it at the writable /tmp
# and copy the pre-installed extensions there on startup, or set
# extension_directory in the handler before LOAD.
ENV DUCKDB_EXTENSION_DIR=/tmp/duckdb_ext

COPY ingest.py ${LAMBDA_TASK_ROOT}/
CMD ["ingest.handler"]
```

Three decisions in that file are worth explaining.

Pinning both libraries to exact versions is not optional. PyIceberg 0.11.1 is stable. The 0.12.0 release candidate is not, and a floating `>=` pin picks it up the day it ships to PyPI. DuckDB's Iceberg extension is versioned against the DuckDB binary, and the extension updates between DuckDB releases, so a mismatch between the two surfaces as a load error at cold start.

Installing extras selectively keeps the image small. `pyiceberg[s3fs,pyarrow]` pulls in the S3 filesystem and PyArrow and nothing else. Adding `gcsfs` or `adlfs` when you do not need them adds another cloud SDK and its transitive dependencies. Use one image per cloud rather than one image that can talk to all three.

Pre-installing the DuckDB extensions at build time removes a network fetch from the cold path. DuckDB installs extensions to a directory under the home directory, which is read-only in most serverless runtimes at execution time. The handler needs to either copy the pre-installed extensions to a writable path on startup or set `extension_directory` to the baked-in location before calling `LOAD`. Get this wrong and every cold start downloads 20 megabytes of extension from the DuckDB CDN before it does any work.

For the image size itself, expect 350 to 500 megabytes after these steps. That is well under Lambda's 10 gigabyte container limit and gives a cold start in the 2 to 4 second range on a mid-size memory setting. If that is too slow for a hot feed, provisioned concurrency keeps a container warm and the cost is a few dollars a month.

## An Architecture That Batches Before It Commits

The design goal is to make each commit carry as much data as possible while keeping latency within your target, and to keep the number of concurrent committers per table small.

A shape that works on every cloud:

1. Raw events land in object storage under a prefix per feed, or on a queue (SQS, Pub/Sub, Event Grid) that carries pointers to landed objects.
2. A scheduler triggers the ingestion function on an interval per feed, say every 2 minutes for hot feeds and every 15 for cold ones. The function lists or dequeues everything that arrived since the last watermark.
3. The function reads the whole batch through DuckDB, transforms it, and produces one Arrow table.
4. The function writes and commits once through PyIceberg.
5. The function advances the watermark (stored in a small key-value table, a DynamoDB item, or the queue's visibility semantics) only after the commit succeeds.

The interval trigger is the important part. It replaces the "one invocation per arriving object" pattern, which is how teams end up with a commit every two seconds and a table full of 40-kilobyte files. One function invocation per feed per interval means at most one committer per table at a time under normal conditions, and the retry logic only has to handle the occasional overlap when an invocation runs long.

For feeds that are too large for one invocation, shard by partition rather than by time. Give each shard its own function that writes only its partition values. Iceberg commits from writers that touch disjoint partitions still conflict at the metadata pointer, but they never conflict on data, so retries succeed immediately. That keeps the effective contention at the number of shards, which you control.

The watermark-after-commit rule is what makes the pipeline exactly-once at the batch level. If the function dies after writing files but before committing, the files are orphans (a maintenance job cleans them up) and the next invocation re-reads the same input and commits it. If the function dies after committing but before advancing the watermark, the next invocation re-reads the input and commits it again, producing duplicates. The way to close that gap is idempotency, which Polaris 1.7.0 added support for, and which I cover in the concurrency section.

## Code Walkthrough: A Lambda Handler With PyIceberg and DuckDB

Here is a complete handler for the "DuckDB transforms, PyIceberg writes" shape, targeting a Polaris catalog with vended credentials. The structure is the same on Cloud Run or Azure Functions with the handler signature changed.

```python
import os
import duckdb
import pyarrow as pa
from pyiceberg.catalog import load_catalog
from pyiceberg.exceptions import CommitFailedException

# Module scope: initialized once per container, reused across warm invocations.
CATALOG = load_catalog(
    "polaris",
    **{
        "type": "rest",
        "uri": os.environ["POLARIS_URI"],                   # https://.../api/catalog
        "warehouse": os.environ["POLARIS_WAREHOUSE"],       # catalog name in Polaris
        "credential": os.environ["POLARIS_CREDENTIAL"],     # client_id:client_secret
        "scope": "PRINCIPAL_ROLE:ALL",
        "header.X-Iceberg-Access-Delegation": "vended-credentials",
    },
)

DUCK = duckdb.connect()
DUCK.execute("SET memory_limit = '3GB'")
DUCK.execute("SET temp_directory = '/tmp/duckdb'")
DUCK.execute("SET threads = 2")

TABLE_ID = "events.web_clicks"
SOURCE_PREFIX = os.environ["SOURCE_PREFIX"]                # s3://raw-bucket/web_clicks/

def transform(batch_paths: list[str]) -> pa.Table:
    """Read raw JSON, clean and type it, deduplicate, return Arrow."""
    files = ", ".join(f"'{p}'" for p in batch_paths)
    return DUCK.execute(f"""
        WITH raw AS (
            SELECT * FROM read_json_auto([{files}], union_by_name = true)
        ),
        typed AS (
            SELECT
                CAST(event_id AS VARCHAR)                       AS event_id,
                CAST(user_id AS BIGINT)                         AS user_id,
                CAST(ts AS TIMESTAMP)                           AS event_time,
                lower(trim(page))                               AS page,
                CAST(duration_ms AS INTEGER)                    AS duration_ms,
                CAST(event_time AS DATE)                        AS event_date
            FROM raw
            WHERE event_id IS NOT NULL
        )
        SELECT * FROM typed
        QUALIFY row_number() OVER (PARTITION BY event_id ORDER BY event_time DESC) = 1
    """).arrow()

def handler(event, context):
    batch_paths = list_new_objects(SOURCE_PREFIX, since=read_watermark(TABLE_ID))
    if not batch_paths:
        return {"status": "empty"}

    arrow_table = transform(batch_paths)
    if arrow_table.num_rows == 0:
        advance_watermark(TABLE_ID, batch_paths)
        return {"status": "no-rows"}

    table = CATALOG.load_table(TABLE_ID)

    # PyIceberg retries the REST commit on conflict with backoff.
    # Surface a final failure so the platform retries the whole invocation.
    try:
        table.append(arrow_table)
    except CommitFailedException as exc:
        raise RuntimeError(f"commit failed after retries: {exc}") from exc

    advance_watermark(TABLE_ID, batch_paths)
    return {"status": "committed", "rows": arrow_table.num_rows, "files": len(batch_paths)}
```

Walk through the parts that matter.

The catalog client is created at module scope, outside the handler. Serverless platforms keep the container alive between invocations for a while, and everything at module scope survives. That means the OAuth token exchange with Polaris happens once per container rather than once per invocation, and PyIceberg's REST client refreshes the token when it expires. The `credential` property is the Polaris client ID and secret for a principal with write access to the catalog, and `scope` is the Polaris role scope to request.

The `X-Iceberg-Access-Delegation: vended-credentials` header tells the catalog to return short-lived storage credentials scoped to the table's location with every `loadTable` response. PyIceberg picks those up and uses them for the Parquet writes. The function's own IAM role needs no permission on the data bucket at all. This is the single biggest security improvement over the cluster approach, where every executor holds a long-lived key.

DuckDB is configured with an explicit memory limit, a temp directory on the writable disk, and a small thread count. The memory limit should be roughly 60 to 70 percent of the function's memory to leave room for PyArrow's copy of the result and PyIceberg's manifest building. `threads = 2` matches the vCPU count of a mid-size Lambda and avoids DuckDB oversubscribing.

The transform query does four things: reads every file in the batch as one relation with `union_by_name` so schema drift across files does not fail the read, casts every column to its target type, derives the partition column, and deduplicates by event ID keeping the latest. The `QUALIFY` clause is DuckDB's way of filtering on a window function without a subquery. The result comes back as an Arrow table with no copy.

`table.append` does all five steps of the commit: writes Parquet with statistics to the table's data location using the vended credentials, builds the manifest and manifest list, writes the new metadata, and POSTs the commit to Polaris with a requirement on the current metadata. If another writer committed in between, PyIceberg reloads, rebuilds, and retries with exponential backoff. If retries are exhausted it raises, and the handler re-raises so the platform's own retry runs the whole invocation again.

The watermark advances only after the commit returns. That is the ordering that makes the pipeline safe under crashes.

For the DuckDB end-to-end shape, the write section of the handler changes to an attached catalog and a SQL statement:

```python
DUCK.execute(f"""
    CREATE OR REPLACE SECRET polaris_secret (
        TYPE iceberg,
        CLIENT_ID '{client_id}',
        CLIENT_SECRET '{client_secret}',
        OAUTH2_SERVER_URI '{polaris_uri}/v1/oauth/tokens',
        OAUTH2_SCOPE 'PRINCIPAL_ROLE:ALL'
    )
""")
DUCK.execute(f"""
    ATTACH IF NOT EXISTS '{warehouse}' AS lake (
        TYPE iceberg,
        ENDPOINT '{polaris_uri}',
        SECRET polaris_secret
    )
""")
DUCK.execute("""
    MERGE INTO lake.events.web_clicks AS t
    USING typed_batch AS s
    ON t.event_id = s.event_id
    WHEN MATCHED THEN UPDATE SET
        event_time = s.event_time, page = s.page, duration_ms = s.duration_ms
    WHEN NOT MATCHED THEN INSERT
        (event_id, user_id, event_time, page, duration_ms, event_date)
        VALUES (s.event_id, s.user_id, s.event_time, s.page, s.duration_ms, s.event_date)
""")
```

Here `typed_batch` is a DuckDB relation registered from the transform step. The `MERGE INTO` runs as one Iceberg transaction: DuckDB reads the target, computes the changes, writes data and delete files (positional deletes for v2 tables, deletion vectors for v3), and commits through the REST catalog. If the commit conflicts, the statement raises and the handler retries the invocation.

## Concurrency, Conflicts, and Idempotency

Even with interval triggers and partition sharding, concurrent commits happen. A slow invocation overlaps with the next scheduled one, or a platform retry runs while the original is still alive. Iceberg handles this with optimistic concurrency, and it is worth being precise about what that means.

Every commit carries a requirement: "the table's current metadata is version N." The catalog checks that requirement atomically with the update. If two writers both started from version N, the first to commit wins and moves the table to N+1. The second writer's request fails with a conflict. The second writer reloads the table, sees N+1, checks whether its changes still apply (an append always does, since it adds files and touches nothing existing), rebuilds its manifest list on top of N+1, and commits again as N+2. Both appends land. Nothing is lost.

The cost is the retry itself: a metadata reload, a new manifest list, a new metadata file, and another round trip. Under light contention that is milliseconds. Under heavy contention, with dozens of writers, it becomes a thundering herd where every retry conflicts with a different winner. PyIceberg's backoff is exponential with jitter for exactly this reason, and you can tune it through the `commit.retry.num-retries`, `commit.retry.min-wait-ms`, and `commit.retry.max-wait-ms` table properties.

There is a subtler problem that optimistic concurrency does not solve: the duplicate commit from a retried invocation. Recall the crash window from earlier. A function commits successfully, then dies before advancing the watermark. The platform retries. The retry reads the same input, writes new files with the same rows, and commits again. Now the table has duplicate rows and nothing in Iceberg's concurrency model can tell the difference, because both commits were valid appends.

Polaris 1.7.0 added an opt-in fix at the catalog level. With `polaris.idempotency.enabled=true`, a client can send an `Idempotency-Key` header on `createTable` and `updateTable` requests. Polaris stores the key with the table entity in the same transaction as the commit. A retry carrying the same key within the TTL (default 5 minutes, configurable via `polaris.idempotency.ttl`) gets the original success response back instead of applying the change again. The catalog advertises the window through the `idempotency-key-lifetime` field in its `GET /v1/config` response, so a client can discover whether the feature is on.

To use it, derive the key from the batch identity (a hash of the sorted input object keys works) and send it as a header on the commit. PyIceberg's REST catalog client accepts arbitrary headers through `header.*` properties, but per-request headers for idempotency are not yet a first-class API as of 0.11.1, so this is either a small patch to the commit path or a wrapper around the REST call until the library exposes it. It is the right direction for the whole ecosystem and I expect the Iceberg REST spec's idempotency discussion, which has been running since late 2025, to standardize the header.

Until you have idempotency end to end, the fallback is deduplication on read (a `QUALIFY` on event ID at query time or in a downstream view) or a periodic compaction job that deduplicates as it rewrites. Both work. Neither is as clean as not committing the duplicate in the first place.

## Failure Modes and Warning Signs

These are the problems that show up in the first month of running this pattern, roughly in order of how often I see them.

**Small files.** The number one issue. Every commit produces at least one data file, and if the batch is small, that file is small. A table receiving a 2-megabyte commit every minute has 1,440 files a day and 40,000 a month, and query planning has to evaluate every one. The warning sign is query latency creeping up on a table whose total size is not growing much. The fix is two-part: batch bigger (raise the interval or the size threshold), and run compaction on a schedule. PyIceberg does not yet include a rewrite-data-files action, so compaction runs in a separate engine (Spark, Dremio, Trino, or DuckDB with a `INSERT OVERWRITE` style rewrite) on a daily or hourly cadence. Budget for it from day one.

**Tiny metadata files.** Same root cause, different layer. Each commit writes a manifest, a manifest list, and a metadata JSON. After 40,000 commits the metadata directory holds 120,000 small objects and the metadata JSON carries 40,000 snapshot entries. Set `history.expire.max-snapshot-age-ms` and run snapshot expiration, and run manifest rewrite alongside data compaction. Iceberg's v4 proposals for a root manifest with inlined small commits are the format-level fix, but they are not shipped yet.

**Commit conflicts under retry storms.** The sign is invocations that succeed but take 30 seconds longer than the batch size explains, with PyIceberg retry log lines. Usually the cause is a trigger misconfiguration that fires the same feed's function more than once per interval, or a platform retry policy that is more aggressive than it needs to be. Check the function's concurrency setting and cap it at 1 per feed if the platform supports reserved concurrency.

**Token expiry mid-batch.** Vended storage credentials have a lifetime, often 1 hour, and the OAuth token from the catalog has its own. A batch that runs long can outlive one or both. PyIceberg refreshes the catalog token, and the vended credentials are refreshed on the next `loadTable`, but a single `append` that runs past the storage credential expiry fails on the last Parquet write. The sign is an access-denied error near the end of a long invocation. Keep batches short enough that this cannot happen, and treat the failure as retryable.

**Memory blowups on wide JSON.** `read_json_auto` on a batch of heterogeneous JSON with `union_by_name` produces a wide relation with every key any file ever had. DuckDB handles it, but the Arrow table that comes out can be several times larger than the input. The sign is an out-of-memory kill on a batch that is not unusually large by byte count. Project the columns you need in the transform query rather than selecting `*` from the raw relation.

**Cold start on large images.** A container image with PyArrow, DuckDB, the DuckDB Iceberg extension, and a cloud SDK is 400 to 600 megabytes. Cold starts on that image are 3 to 8 seconds. The sign is p99 invocation latency an order of magnitude above p50. Strip unused extras, use provisioned concurrency or minimum instances for hot feeds, and accept it for cold ones.

**Schema drift that the catalog rejects.** A new key appears in the source JSON, DuckDB includes it in the Arrow table, and PyIceberg's `append` fails because the table schema does not have that column. PyIceberg checks schema compatibility before writing and raises on a mismatch. The sign is a clear error naming the extra column. Decide up front whether the pipeline evolves the schema automatically (PyIceberg's `update_schema().union_by_name()` does this) or drops unknown columns in the transform. Automatic evolution is convenient and also how a typo in a producer becomes a permanent column.

**Orphan files from failed invocations.** A function that writes Parquet and dies before committing leaves files in the data location that no snapshot references. They cost storage and nothing else. Run an orphan-file cleanup on a weekly cadence, with a grace period longer than your longest possible invocation so an in-flight commit's files are not deleted from under it.

## Operational Guidance

For teams standing this up, here is the checklist I hand out.

**Pick batch targets before writing code.** A data file target of 128 to 512 megabytes and a commit interval that gets you there is the goal. For a feed producing 300 megabytes an hour, that is a 30-to-60-minute interval, not a 1-minute one. If the freshness requirement is tighter than the batch math allows, accept smaller files and compact more often, but make that a conscious trade.

**One function per feed, reserved concurrency of 1.** This keeps commits to one writer per table under normal operation and makes the retry path a rare event rather than a steady state. Scale by adding feeds or partition shards, not by raising concurrency on a single table.

**Put the catalog client at module scope.** Token exchange once per container, not once per invocation. Same for the DuckDB connection and the extension load.

**Set DuckDB's memory limit, temp directory, and threads explicitly.** The defaults assume a laptop. A function is not a laptop.

**Use vended credentials and give the function no bucket permissions.** Polaris scopes the vended credential to the table location. That is the least-privilege story, and it means a compromised function cannot read any table it was not writing to.

**Schedule maintenance from the start.** Compaction daily or hourly depending on commit rate, snapshot expiration daily, orphan cleanup weekly. Run them in whatever engine you already have. Dremio's Open Catalog runs these automatically on tables it manages, and Polaris 1.7.0's Helm chart added a maintenance service for table cleanup tasks, but the data file rewrite still needs an engine.

**Track four metrics per table.** Files per snapshot (should be small and stable), average data file size (should approach your target), commits per hour (should match your interval), and retry count per commit (should be near zero). Alert on the last one first.

**Emit catalog events if you can.** Polaris 1.7.0 added a Kafka event listener and an OpenTelemetry event listener, so every commit to every table becomes an event stream. That is the cleanest way to trigger downstream processing and to audit what the ingestion functions did without scraping snapshot logs.

## Where This Is Heading

Three things will make this pattern better over the next year.

PyIceberg's Rust core. The `pyiceberg-core` package, built from iceberg-rust and now at 0.10.1, is where the heavy operations are moving: manifest parsing, statistics, and eventually data file writing. As more of PyIceberg's write path delegates to the Rust core, the memory footprint drops and the cold start gets shorter, both of which matter more in a function than anywhere else. Async scan planning through the REST catalog is planned for a future release, which reduces the metadata work a function does before it can commit.

DuckDB's Iceberg extension closing the storage gap. ADLS support for attached REST catalogs is the missing piece for Azure teams who want the SQL-native shape. The extension updates between DuckDB releases, so watch the extension changelog rather than the DuckDB release notes.

Idempotent commits in the REST spec. Polaris 1.7.0's opt-in implementation is the first shipped version. Once the Iceberg REST specification standardizes the header and PyIceberg and DuckDB send it, the duplicate-on-retry gap closes for every catalog, and the watermark-after-commit dance becomes belt-and-suspenders rather than load-bearing.

The larger shift is that Iceberg is becoming a library rather than a platform. Two years ago writing an Iceberg table meant a JVM. Today it means a Python package and a SQL engine that fit in a container image under a gigabyte and cost nothing while idle. The Spark cluster from the opening is still the right tool for the terabyte-scale backfill and for the compaction job. It is no longer the right tool for landing the stream, and the teams that figure that out first are the ones whose data platform bills stop growing with their feed count.

## Conclusion

An Iceberg commit is a handful of object store writes and one atomic pointer swap at the catalog. Nothing about that requires a cluster. PyIceberg handles the catalog protocol, vended credentials, Parquet writing, manifest building, and conflict retry from Python. DuckDB handles reading and transforming the raw batch in SQL at speeds that make a 500-megabyte micro-batch a two-minute job, and since 1.5.3 it writes to REST-cataloged Iceberg tables directly when MERGE INTO is the natural shape.

The design work is in the batching. Trigger per feed on an interval sized to your file target, keep one writer per table, advance the watermark only after the commit, and schedule compaction and snapshot expiration from the first day. Watch files per snapshot and retry count, and plan for idempotent commits as Polaris and the REST spec make them standard. Do that and the function costs a few dollars a month per feed, has no checkpoint to babysit, and holds no long-lived credentials. That is a better deal than the cluster ever was.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg internals and the practical side of running lakehouse pipelines. *Architecting an Apache Iceberg Lakehouse* (Manning) covers ingestion patterns, table maintenance, and catalog design in depth, and *Apache Polaris: The Definitive Guide* (O'Reilly) covers the REST catalog and credential vending that make this pattern secure. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
