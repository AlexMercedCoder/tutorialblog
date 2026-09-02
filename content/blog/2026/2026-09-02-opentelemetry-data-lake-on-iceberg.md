---
title: "Logs, Traces, and Metrics as Tables: Building an OpenTelemetry Data Lake on Iceberg"
date: "2026-09-02"
description: "Building an OpenTelemetry data lake on Iceberg: schemas for spans, logs, and metrics, ingestion, query patterns, and retention."
author: "Alex Merced"
category: "Observability"
tags:
  - OpenTelemetry
  - Apache Iceberg
  - Logs
  - Traces
  - Metrics
  - Observability
canonical: https://iceberglakehouse.com/posts/opentelemetry-data-lake-on-iceberg/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/opentelemetry-data-lake-on-iceberg/).

An engineering organization pays its observability vendor by the gigabyte ingested and keeps thirty days of logs because ninety triples the bill. When an incident's root cause turns out to be a change deployed six weeks ago, the logs from that deploy are gone. The traces that show the latency regression starting were sampled at one percent to control cost. The metrics are there, downsampled to one point per hour after two weeks, which is too coarse to see the five-minute spike that started it.

None of that is a technology limit. Logs, traces, and metrics are the highest-volume, most append-only, most time-partitioned data most organizations produce, which is exactly the shape that Apache Iceberg on object storage handles best and cheapest. A terabyte of compressed telemetry on object storage costs a few dollars a month. The same terabyte in a hosted observability platform costs orders of magnitude more, and the platform decides what you can retain and how you can query it.

This article is about treating telemetry as tables: an OpenTelemetry (OTel) pipeline that lands logs, traces, and metrics in Iceberg, a schema for each signal that preserves the OTel data model and prunes well, an ingestion path that produces healthy tables rather than millions of small files, query patterns for the three signals and their correlation, a hot-and-cold design that keeps a fast tier for the last hours and the lake for everything else, and the retention and maintenance that make it cheap. It is not about observability of data pipelines, which is a different topic. It is about the telemetry every service emits, stored where the organization can keep it and query it with any engine. I work at Dremio, which is one such engine, and the design here is engine-neutral.

## Why Telemetry Fits Iceberg

Three properties of telemetry line up with three strengths of the format.

**It is append-only.** A span, once emitted, does not change. A log line is never updated. A metric data point is a fact about a moment. Iceberg's cheapest operation is an append that produces a snapshot with new files and no deletes, and a telemetry table never needs anything else on the write path. No merge-on-read, no deletion vectors, no copy-on-write. The maintenance story reduces to compaction and retention.

**It is time-partitioned.** Every telemetry query has a time range. Partitioning by hour or day and sorting within partitions by timestamp means the planner prunes to the hours in the query before opening a file, and min/max bounds on the timestamp column prune within the partition. Retention is dropping partitions, which in Iceberg is a metadata operation followed by expiry.

**It is high-cardinality and semi-structured.** Spans and logs carry attributes that vary by service, and the set of attributes changes as services evolve. Iceberg v3's `variant` type stores those attributes as semi-structured data with shredding, so that frequently queried attributes get typed subcolumns with statistics while the long tail stays in a binary column. Before v3, this was a `map<string, string>` that had to be scanned to filter. With v3, `attributes.http.status_code = 500` prunes.

There is a fourth property that matters for cost. Telemetry compresses extremely well in Parquet. Repeated service names, resource attributes, and low-cardinality span names dictionary-encode to almost nothing, and Zstandard on timestamp-sorted data achieves ratios of ten to twenty to one on typical logs. A petabyte of raw telemetry is tens of terabytes on object storage.

## The OTel Data Model and What It Means for Schemas

OpenTelemetry defines the three signals with a shared structure. Understanding it is what makes the schema design principled rather than ad hoc.

Every signal is emitted in the context of a **resource**, which is the entity producing it: a service, a host, a container. Resource attributes such as `service.name`, `service.version`, `k8s.pod.name`, and `cloud.region` are attached to every signal from that resource. Within a resource, an **instrumentation scope** identifies the library that produced the signal. Then the signal itself carries its own attributes and its own payload.

**Logs** are records with a timestamp, an observed timestamp, a severity number and text, a body (a string or structured value), attributes, and optionally a `trace_id` and `span_id` linking the log to a trace. The body is where the variety lives: it can be a plain message, a JSON object, or a structured event.

**Traces** are trees of spans. A span has a `trace_id`, its own `span_id`, a `parent_span_id`, a name, a kind (server, client, producer, consumer, internal), start and end timestamps at nanosecond precision, a status (unset, ok, error), attributes, events (timestamped annotations within the span, such as exceptions), and links to other spans. A trace is reconstructed by selecting every span with a given `trace_id` and following parent links.

**Metrics** are the most structured. A metric has a name, a description, a unit, and a type: gauge, sum (with monotonicity and aggregation temporality), histogram, exponential histogram, or summary. Each data point has a timestamp, a start timestamp for cumulative types, attributes (the dimensions), and a value that depends on the type: a number for gauges and sums, a set of bucket counts and boundaries for histograms, and optionally exemplars that link a point to a trace.

The OTel Protocol (OTLP) serializes all of this as protobuf, nested resource → scope → signal. The schema design task is to flatten that nesting into tables that keep every field queryable and prune on the fields queries filter by.

## Schema Design on Iceberg

The design below uses one table per signal, with resource and scope attributes denormalized onto every row, well-known attributes promoted to typed columns, and the remainder in `variant`. It targets Iceberg v3 for `variant`, `timestamp_ns`, and deletion-free operation. On v2, `variant` becomes `map<string, string>` and `timestamp_ns` becomes `timestamp` at microsecond precision.

### Spans

```sql
CREATE TABLE otel.spans (
  trace_id            BINARY        NOT NULL,   -- 16 bytes
  span_id             BINARY        NOT NULL,   -- 8 bytes
  parent_span_id      BINARY,
  start_time          TIMESTAMP_NS  NOT NULL,
  end_time            TIMESTAMP_NS  NOT NULL,
  duration_ns         BIGINT        NOT NULL,
  name                STRING        NOT NULL,
  kind                STRING        NOT NULL,
  status_code         STRING        NOT NULL,
  status_message      STRING,
  service_name        STRING        NOT NULL,
  service_version     STRING,
  deployment_env      STRING,
  scope_name          STRING,
  scope_version       STRING,
  http_method         STRING,
  http_route          STRING,
  http_status_code    INT,
  db_system           STRING,
  rpc_service         STRING,
  attributes          VARIANT,
  resource_attributes VARIANT,
  events              ARRAY<STRUCT<time: TIMESTAMP_NS, name: STRING, attributes: VARIANT>>,
  links               ARRAY<STRUCT<trace_id: BINARY, span_id: BINARY, attributes: VARIANT>>
) USING iceberg
PARTITIONED BY (hours(start_time), bucket(32, trace_id))
TBLPROPERTIES (
  'format-version' = '3',
  'write.parquet.shred-variants' = 'true',
  'write.target-file-size-bytes' = '268435456',
  'write.metadata.metrics.default' = 'counts',
  'write.metadata.metrics.column.start_time' = 'full',
  'write.metadata.metrics.column.service_name' = 'full',
  'write.metadata.metrics.column.http_status_code' = 'full',
  'write.metadata.metrics.column.status_code' = 'full',
  'write.parquet.bloom-filter-enabled.column.trace_id' = 'true',
  'write.parquet.bloom-filter-enabled.column.span_id' = 'true',
  'commit.manifest.min-count-to-merge' = '20',
  'write.metadata.delete-after-commit.enabled' = 'true',
  'history.expire.max-snapshot-age-ms' = '86400000'
);

ALTER TABLE otel.spans WRITE ORDERED BY service_name, start_time;
```

The decisions in that DDL, in order of importance.

**Partition by hour and by a bucket of `trace_id`.** The hour partition serves every time-range query and makes retention a partition drop. The bucket on `trace_id` serves trace reconstruction: selecting a trace prunes to one bucket, and the same bucket count on the logs table makes the spans-to-logs join a storage-partitioned join with no shuffle. Thirty-two buckets on hourly partitions yields 768 partitions a day, which for high-volume tracing is right and for low-volume tracing is too many, in which case daily partitions or fewer buckets.

**Promote the attributes queries filter by.** `service_name`, `http_status_code`, `http_route`, `status_code`, and a few others are typed columns with full metrics, so that "500s from the checkout service in the last hour" prunes on manifests. Which attributes to promote is workload-specific and the semantic conventions are the guide: whatever the dashboards group by belongs in a column.

**Everything else in `variant`, shredded.** The long tail of span attributes goes into `attributes` and resource attributes into `resource_attributes`. With shredding enabled, the writer extracts commonly present typed paths into Parquet subcolumns with statistics, so that a filter on an attribute that turns out to be common still prunes without a schema change.

**Bloom filters on IDs.** `trace_id` and `span_id` are high-cardinality, unsorted, and looked up by exact value. That is the Bloom filter's case. Min/max bounds on a random 16-byte ID prune nothing.

**Sort by service and time within files.** Rows from one service in one hour cluster together, which compresses well and makes the per-file `service_name` bounds tight.

**`counts` metrics by default.** The table has many columns, most of which are never filtered. Bounds on them bloat manifests. Full metrics only where they prune.

**Aggressive metadata housekeeping.** Telemetry tables commit every minute. Manifest merging at 20, metadata file deletion on, and one-day snapshot retention keep the metadata tree small. There is no reason to time-travel telemetry beyond a day, and incidents that need a preserved view get a tag.

### Logs

```sql
CREATE TABLE otel.logs (
  time                TIMESTAMP_NS  NOT NULL,
  observed_time       TIMESTAMP_NS,
  trace_id            BINARY,
  span_id             BINARY,
  severity_number     INT,
  severity_text       STRING,
  body                STRING,
  body_structured     VARIANT,
  service_name        STRING        NOT NULL,
  service_version     STRING,
  deployment_env      STRING,
  host_name           STRING,
  k8s_namespace       STRING,
  k8s_pod             STRING,
  scope_name          STRING,
  attributes          VARIANT,
  resource_attributes VARIANT
) USING iceberg
PARTITIONED BY (hours(time), bucket(32, trace_id))
TBLPROPERTIES (
  'format-version' = '3',
  'write.parquet.shred-variants' = 'true',
  'write.metadata.metrics.default' = 'counts',
  'write.metadata.metrics.column.time' = 'full',
  'write.metadata.metrics.column.service_name' = 'full',
  'write.metadata.metrics.column.severity_number' = 'full',
  'write.parquet.bloom-filter-enabled.column.trace_id' = 'true',
  'write.parquet.compression-codec' = 'zstd',
  'write.parquet.compression-level' = '6',
  'commit.manifest.min-count-to-merge' = '20',
  'write.metadata.delete-after-commit.enabled' = 'true',
  'history.expire.max-snapshot-age-ms' = '86400000'
);

ALTER TABLE otel.logs WRITE ORDERED BY service_name, time;
```

The log body is stored twice when it is structured: as a string for full-text style search and as `variant` for field access. When the body is a plain message, `body_structured` is null. The bucket on `trace_id` matches the spans table so that logs for a trace and spans for a trace are co-located. Logs with no `trace_id` (a null) all land in one bucket, which is a known skew and is acceptable because those logs are not joined to traces. Compression level 6 is worth it on logs, which are the largest signal by volume and the least frequently queried per byte.

Full-text search over log bodies is the one capability the lakehouse does not provide natively. Engines evaluate `body LIKE '%timeout%'` by scanning, and Parquet has no inverted index. The mitigations are a hot tier with a search engine for recent data, covered below, and the observation that most log searches are filtered by service and time first, so the scan is over a small slice.

### Metrics

```sql
CREATE TABLE otel.metrics (
  time                TIMESTAMP_NS  NOT NULL,
  start_time          TIMESTAMP_NS,
  metric_name         STRING        NOT NULL,
  metric_type         STRING        NOT NULL,   -- gauge, sum, histogram, exp_histogram, summary
  unit                STRING,
  is_monotonic        BOOLEAN,
  temporality         STRING,                   -- cumulative, delta
  service_name        STRING        NOT NULL,
  service_version     STRING,
  deployment_env      STRING,
  host_name           STRING,
  attributes          VARIANT,                  -- the dimensions
  resource_attributes VARIANT,
  value_double        DOUBLE,
  value_int           BIGINT,
  hist_count          BIGINT,
  hist_sum            DOUBLE,
  hist_min            DOUBLE,
  hist_max            DOUBLE,
  hist_bounds         ARRAY<DOUBLE>,
  hist_counts         ARRAY<BIGINT>,
  exp_hist_scale      INT,
  exp_hist_zero_count BIGINT,
  exp_hist_pos_offset INT,
  exp_hist_pos_counts ARRAY<BIGINT>,
  exp_hist_neg_offset INT,
  exp_hist_neg_counts ARRAY<BIGINT>,
  exemplars           ARRAY<STRUCT<time: TIMESTAMP_NS, value: DOUBLE, trace_id: BINARY, span_id: BINARY>>
) USING iceberg
PARTITIONED BY (hours(time), metric_name)
TBLPROPERTIES (
  'format-version' = '3',
  'write.parquet.shred-variants' = 'true',
  'write.metadata.metrics.default' = 'counts',
  'write.metadata.metrics.column.time' = 'full',
  'write.metadata.metrics.column.service_name' = 'full',
  'write.metadata.metrics.column.metric_name' = 'full',
  'commit.manifest.min-count-to-merge' = '20',
  'write.metadata.delete-after-commit.enabled' = 'true',
  'history.expire.max-snapshot-age-ms' = '86400000'
);

ALTER TABLE otel.metrics WRITE ORDERED BY metric_name, service_name, time;
```

Metrics are partitioned by hour and by `metric_name` as an identity partition, because metric queries always name the metric and the cardinality of metric names is bounded (hundreds to low thousands). The value columns are a union: one of `value_double`, `value_int`, or the histogram fields is populated depending on `metric_type`. This is wider than a table per metric type but keeps one table per signal and lets a dashboard query across types. Exponential histograms, which are the OTel default for latency, are stored with their scale and bucket arrays so that percentile computation is possible at query time with a UDF or with an engine that has native support.

A common addition is a pre-aggregated table, `otel.metrics_5m`, produced by a scheduled job that downsamples raw points to five-minute buckets per metric and dimension set. Raw points are kept for a shorter window and the downsampled table for years, which is the retention tiering that observability platforms do internally and that the lakehouse makes explicit.

### Why One Table Per Signal and Not One Table Per Service

Two alternatives to the three-table design come up often enough to address.

A table per service per signal, `otel.checkout_spans`, `otel.payments_spans`, and so on, removes `service_name` from the filter and gives each team ownership of its table. It also produces hundreds of tables with identical schemas, makes cross-service trace reconstruction a union over all of them, and defeats the bucketed join. Partitioning by hour with `service_name` bounds in the manifests gives the same pruning inside one table. Ownership is better expressed as row-level access on `service_name` through the catalog's policies than as table proliferation.

A single wide table for all three signals, with a `signal_type` column, is the other extreme. It simplifies ingestion to one sink and makes "everything about this trace" one query. It also forces every row to carry every signal's columns as nulls, which Parquet handles well enough, and it makes the metrics table's identity partition on `metric_name` impossible, since spans and logs have none. The three-table design is the compromise that keeps each signal's partitioning right.

The variant that does work is a thin `otel.trace_index` table: one row per trace with `trace_id`, root service, root span name, start time, duration, and error flag, produced by a scheduled aggregation over spans. It answers "find traces matching these criteria" without touching the spans table, and it is the table a UI's trace search reads. It is derived, rebuilt per closed hour, and cheap.

## The Ingestion Path

The OpenTelemetry Collector is the universal receiver. Services emit OTLP to a Collector, and the Collector processes and exports. The question is what the exporter writes and how the result becomes healthy Iceberg tables.

There is, as of this writing, no Iceberg exporter in the Collector contrib distribution. There are three practical paths, and one that is emerging.

**Path one: Collector to Kafka to the Iceberg sink.** The Collector's Kafka exporter publishes OTLP-encoded messages to topics per signal. The Apache Iceberg Kafka Connect sink consumes them, applies a transform that flattens OTLP into the table schema, and commits on a fixed interval with exactly-once coordination across tasks. This is the path with the most control over the resulting tables: the sink's commit interval bounds the snapshot rate, the sink writes to the table's partitioning, and the transform is where promotion of attributes to columns happens. The cost is Kafka and Connect, which many organizations emitting telemetry at scale already run.

**Path two: Collector to object storage, then register.** The Collector's `awss3` exporter (and its equivalents for other clouds) writes Parquet with a configurable marshaler, partitioned by time in the key. A scheduled job then adds the files to Iceberg tables with `add_files` or a PyIceberg script, applying a name mapping since the Collector's Parquet has no Iceberg field IDs. This path has no Kafka, and its weakness is that the Collector's Parquet schema is the Collector's, not the table's, so promotion and `variant` shredding happen in a rewrite step rather than at write time.

**Path three: Collector to a streaming engine.** Flink with the OTel format reads from the Collector (through Kafka or directly), transforms, and writes Iceberg with checkpoint-aligned commits. This is the path for organizations that want transformation, enrichment, or sampling decisions in the stream, and it is the heaviest.

**Emerging: direct OTLP-to-Iceberg writers.** Community tools such as otlp2parquet and otlp2pipeline receive OTLP and write Parquet or Iceberg directly, and a few cloud services accept OTLP and land it in their managed Iceberg tables with maintenance included. These remove the middle tier and are earlier in maturity.

Whichever path, three settings determine table health. The commit interval, sixty seconds being a reasonable default that yields 1,440 snapshots a day and files that reach a useful size at moderate volume. The file size target, which the sink honors per partition and which at hourly-by-bucket partitioning needs volume per partition-hour to reach, so low-volume environments should use daily partitions. And compaction, which for telemetry is a bin-packing rewrite on a schedule of every few hours for the current day's partitions and once for each closed day, after which the partition is never touched again.

A Collector configuration for path one, abbreviated to the relevant parts:

```yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

processors:
  batch:
    send_batch_size: 8192
    timeout: 5s
  resource:
    attributes:
      - key: deployment.environment
        action: upsert
        value: prod
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: errors
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: slow
        type: latency
        latency: { threshold_ms: 2000 }
      - name: baseline
        type: probabilistic
        probabilistic: { sampling_percentage: 10 }

exporters:
  kafka/traces:
    brokers: [kafka:9092]
    topic: otel.traces
    encoding: otlp_proto
  kafka/logs:
    brokers: [kafka:9092]
    topic: otel.logs
    encoding: otlp_proto
  kafka/metrics:
    brokers: [kafka:9092]
    topic: otel.metrics
    encoding: otlp_proto

service:
  pipelines:
    traces:  { receivers: [otlp], processors: [resource, tail_sampling, batch], exporters: [kafka/traces] }
    logs:    { receivers: [otlp], processors: [resource, batch], exporters: [kafka/logs] }
    metrics: { receivers: [otlp], processors: [resource, batch], exporters: [kafka/metrics] }
```

Tail sampling keeps every error and every slow trace and ten percent of the rest, which is the sampling policy that makes trace storage tractable without losing the traces that matter. The sampling decision is one of the largest cost levers in the whole design, and the lakehouse's cheap storage means it can be far more generous than a hosted platform's per-gigabyte pricing allows.

The sink side, for the spans topic:

```json
{
  "name": "otel-spans-sink",
  "config": {
    "connector.class": "org.apache.iceberg.connect.IcebergSinkConnector",
    "tasks.max": "8",
    "topics": "otel.traces",
    "iceberg.catalog.type": "rest",
    "iceberg.catalog.uri": "https://polaris.internal/api/catalog",
    "iceberg.catalog.warehouse": "observability",
    "iceberg.catalog.credential": "client-id:client-secret",
    "iceberg.catalog.header.X-Iceberg-Access-Delegation": "vended-credentials",
    "iceberg.tables": "otel.spans",
    "iceberg.control.commit.interval-ms": "60000",
    "iceberg.tables.evolve-schema-enabled": "false",
    "value.converter": "com.example.otel.OtlpSpansConverter",
    "transforms": "flatten",
    "transforms.flatten.type": "com.example.otel.OtlpSpanFlattenTransform"
  }
}
```

The converter and transform are the custom pieces: they decode the OTLP protobuf, unnest resource → scope → span, denormalize resource and scope attributes onto each row, promote the semantic-convention attributes to columns, and pack the rest into `variant`. Schema evolution is disabled because the table schema is deliberate and the transform targets it. Eight tasks write in parallel and the sink coordinates one commit per interval across them.

## Query Patterns

The three signals have characteristic queries, and the schema above is built so each prunes.

**Error rate for a service over time**, from spans:

```sql
SELECT date_trunc('minute', start_time) AS minute,
       count(*)                                          AS requests,
       count_if(status_code = 'ERROR')                   AS errors,
       approx_percentile(duration_ns, 0.99) / 1e6        AS p99_ms
FROM otel.spans
WHERE service_name = 'checkout'
  AND kind = 'SERVER'
  AND start_time >= now() - INTERVAL 6 HOURS
GROUP BY 1
ORDER BY 1;
```

The hour partition prunes to six partitions, `service_name` bounds prune to the files from checkout within each, and the aggregation runs on a few files.

**Reconstruct a trace**, joining spans to their logs:

```sql
WITH t AS (
  SELECT * FROM otel.spans
  WHERE trace_id = unhex('4bf92f3577b34da6a3ce929d0e0e4736')
    AND start_time >= TIMESTAMP '2026-09-01 14:00:00'
    AND start_time <  TIMESTAMP '2026-09-01 15:00:00'
)
SELECT t.name, t.service_name, t.start_time, t.duration_ns / 1e6 AS ms,
       t.status_code, l.severity_text, l.body
FROM t
LEFT JOIN otel.logs l
  ON l.trace_id = t.trace_id AND l.span_id = t.span_id
  AND l.time >= TIMESTAMP '2026-09-01 14:00:00'
  AND l.time <  TIMESTAMP '2026-09-01 15:00:00'
ORDER BY t.start_time;
```

The `trace_id` equality projects through the bucket transform to one bucket in both tables. The time bounds, which the caller knows from the trace's rough time, prune to one hour partition. The Bloom filter on `trace_id` skips row groups inside the remaining files. And with both tables bucketed identically on `trace_id`, an engine with storage-partitioned joins runs the join without a shuffle. A trace lookup over a petabyte of telemetry reads a handful of files.

**Latency percentiles from exponential histograms**:

```sql
SELECT date_trunc('minute', time) AS minute,
       exp_hist_percentile(exp_hist_scale, exp_hist_zero_count,
                           exp_hist_pos_offset, exp_hist_pos_counts, 0.99) AS p99
FROM otel.metrics
WHERE metric_name = 'http.server.request.duration'
  AND service_name = 'checkout'
  AND time >= now() - INTERVAL 1 DAY
GROUP BY 1
ORDER BY 1;
```

`exp_hist_percentile` is a UDF that merges the bucket arrays within each group and interpolates. Engines without a native implementation need it registered. The `metric_name` identity partition and the hour partition prune to twenty-four partitions of one metric.

**Correlate a metric spike with traces**, through exemplars:

```sql
SELECT e.trace_id, e.value, e.time
FROM otel.metrics m
CROSS JOIN UNNEST(m.exemplars) AS e
WHERE m.metric_name = 'http.server.request.duration'
  AND m.service_name = 'checkout'
  AND m.time BETWEEN TIMESTAMP '2026-09-01 14:03:00' AND TIMESTAMP '2026-09-01 14:08:00'
  AND e.value > 2.0
ORDER BY e.value DESC
LIMIT 20;
```

Exemplars carry the `trace_id` of a representative request in each bucket, which is the bridge from "p99 spiked at 14:05" to "here are twenty slow traces from 14:05." The result feeds the trace reconstruction query.

**Log search with structured filter**:

```sql
SELECT time, severity_text, body
FROM otel.logs
WHERE service_name = 'payments'
  AND time >= now() - INTERVAL 2 HOURS
  AND severity_number >= 17          -- ERROR and above
  AND attributes:exception.type = 'TimeoutException'
ORDER BY time DESC
LIMIT 200;
```

The `attributes:exception.type` path reads a shredded `variant` field. If `exception.type` is common enough to have been shredded, the filter prunes on its subcolumn statistics. If not, the engine parses the variant for the rows that survived the other filters, which is a small set.

## Walkthrough: From Empty Catalog to First Trace Query

The sequence to stand this up, end to end, is short enough to list.

**Create the namespace and tables.** The three DDL statements above, run through Spark or any engine with v3 DDL support, against the REST catalog. Set the sort orders. Grant the sink's principal write on `otel` and the analysts' role read.

**Deploy the Collector with the configuration above.** Point application SDKs at it. Verify with the Collector's own metrics that batches are flowing to the three Kafka topics.

**Deploy the sink connectors**, one per signal, with the flatten transform for each. Watch the first commit land: the `snapshots` metadata table for `otel.spans` shows an `append` with a few files after the first interval.

**Verify the partition layout.** `SELECT partition, count(*), sum(file_size_in_bytes) FROM otel.spans.files GROUP BY 1` after an hour shows the hour-and-bucket partitions with file sizes. If files are tiny, the volume does not justify the bucket count, and the fix is a partition evolution to fewer buckets before more data accumulates.

**Run the first trace reconstruction query** with a `trace_id` copied from an application log. It should return in well under a second on an hour partition, and the query plan should show a single bucket on each side of the join and no exchange if the engine supports storage-partitioned joins.

**Schedule the maintenance.** Compaction of today's and yesterday's partitions every four hours. Retention delete daily at the retention boundary. Snapshot expiry daily. Downsampling of metrics to `otel.metrics_5m` hourly. The trace index rebuild hourly.

**Add the hot tier.** A second exporter in the Collector to whichever fast system the on-call team uses, with short retention. Point alerts at it.

**Write the views.** `otel.v_error_rate`, `otel.v_trace`, `otel.v_latency_p99`, `otel.v_exemplars`, parameterized where the engine allows, so that every consumer, human or agent, reaches for the same query.

From empty catalog to a queryable, maintained telemetry lake is a day of work for a team that already runs Kafka and a REST catalog, and most of that day is the flatten transform.

## Hot and Cold: Keeping a Fast Tier

The lakehouse is the right system of record for telemetry and the wrong system for the on-call engineer's first thirty seconds. A query that opens Parquet on object storage takes hundreds of milliseconds at best. Full-text search over log bodies scans. Dashboards that refresh every ten seconds need sub-second responses over the last fifteen minutes.

The standard design is two tiers. A hot tier holds the last few hours to a few days in a system built for low-latency telemetry queries: ClickHouse (including through SigNoz or HyperDX), OpenObserve, Elasticsearch, or a vendor. The Collector dual-exports, to the hot tier for now and to the lake for always. The hot tier's retention is short and its cost is bounded. The lake's retention is long and its cost is object storage.

Two developments narrow the gap. ClickHouse's hybrid table engine, from Altinity's Project Antalya branch and moving toward the mainline, presents a MergeTree segment for recent data and Iceberg segments for older data as one table, with queries spanning both and data tiering from one to the other automatically. OpenObserve stores everything as Parquet on object storage from the start, with its own indexing and caching, and reads Iceberg. Both point at a future where the hot tier is a cache in front of the lake rather than a separate copy.

Whichever tier design, the discipline is that the lake is the truth and the hot tier is derived. Alerts can fire from the hot tier. Postmortems, capacity planning, cost attribution, security investigations, and machine learning on telemetry read the lake. And when the hot tier's vendor changes, the lake does not.

## Retention, Maintenance, and Cost

Telemetry retention on Iceberg is a partition lifecycle, and it is cheap enough that the question changes from "how little can we keep" to "how much is useful."

**Retention by partition drop.** A daily job deletes rows older than the retention window. Because the tables are partitioned by hour and the predicate is on the partition column, the delete is a metadata operation that removes whole partitions' files from the snapshot without rewriting anything. Snapshot expiry a day later deletes the files. Different signals get different windows: raw logs for 90 days, spans for 180, raw metrics for 30 and downsampled metrics for years, all configurable per table and all far beyond what per-gigabyte pricing allowed.

**Compaction for the current day, then never.** Partitions for the current day receive small files every minute and are compacted every few hours. Once a day closes, one final compaction produces target-sized files, and the partition is immutable until it is dropped. The compaction job filters on the partition column so that closed days are never rewritten, which keeps the maintenance cost proportional to daily volume rather than total volume.

**Snapshot expiry, aggressive.** One-day retention. With 1,440 commits a day per table, anything longer accumulates metadata that nobody uses. Incident investigations that need a stable view take a tag before they start and drop it after.

**Cost arithmetic.** At a compression ratio of ten to one, a service fleet emitting ten terabytes of raw telemetry a day stores a terabyte a day. At object storage prices, a year of that is 365 terabytes at roughly seven to nine thousand dollars a month across the whole year's data, with query compute on top and paid only when queries run. The equivalent ingestion volume at hosted-platform per-gigabyte rates is a number with two more digits. The lake design's cost is dominated by query compute for heavy investigations and by the hot tier, not by storage.

**Governance.** Logs carry personal data whether or not anyone intended it: user IDs in URLs, email addresses in error messages, IP addresses in resource attributes. Two practices follow. Redaction in the Collector, with the `redaction` and `transform` processors, before the data is written anywhere. And the erasure discipline that any Iceberg table holding personal data needs, which for telemetry is simplest as a short retention window that bounds the exposure, since crypto-shredding per subject is impractical for data that identifies subjects incidentally.

### Access Control and Multi-Tenancy on Telemetry Tables

Telemetry is read by more people than most data: every engineer on call, security teams, finance for cost attribution, and increasingly agents. The single-table-per-signal design puts every team's data in one table, so access control is by row and by column rather than by table.

Row-level policies on `service_name` or on a `team` resource attribute promoted to a column let the catalog restrict each team to its own services while keeping cross-service trace reconstruction available to the platform and on-call roles. Apache Polaris and the other REST catalogs express this as policies attached to the table and enforced by the engines that honor them. Column masking on `body` and on specific `variant` paths handles the case where a log body is readable by the owning team but must be redacted for everyone else.

Security teams typically want the opposite: every service, every signal, long retention, and the ability to run detection queries across all of it. That is a role with unrestricted read on the `otel` namespace and its own compute, and it is one of the strongest arguments for the lake design, because a security investigation over six months of logs from every service is a query the hosted platform's retention limits made impossible.

Agents get the narrowest role that answers their questions: read on the views, not the tables, with the same row policies as the human whose question they are answering. The views are where the histogram UDF and the correlation logic live, so an agent that reads views produces correct percentiles without knowing how exponential histograms work.

## Failure Modes

**Small files from short commit intervals and fine partitioning.** Hourly-by-32-bucket partitioning at a sixty-second commit interval on a low-volume environment produces thousands of tiny files an hour. Match partition granularity to volume: daily partitions and eight buckets for small fleets.

**No sampling on traces.** Every span from every request at full volume is the largest signal by an order of magnitude and mostly uninteresting. Tail sampling that keeps errors, slow requests, and a baseline is standard, and the lake's cheap storage is a reason to keep more, not everything.

**Attributes as `map<string, string>` on v2.** Every filter on an attribute scans. The `variant` type with shredding is the reason to run telemetry tables on v3.

**Promoting too few or too many attributes.** Too few and the common dashboards filter on `variant` paths. Too many and the table has three hundred sparse columns. The semantic conventions plus the actual dashboards are the guide, and shredding covers the middle ground.

**Full-text search expectations.** `body LIKE '%something%'` over a day of logs is a scan. The hot tier or a search index is where that query belongs. On the lake, filter by service, time, and severity first.

**Nanosecond timestamps on v2.** OTel timestamps are nanoseconds and v2's `timestamp` is microseconds. Truncation loses ordering between spans in the same microsecond, which matters for reconstructing fast traces. v3's `timestamp_ns` preserves them.

**Compacting closed partitions.** A compaction job without a partition filter rewrites the whole table's history nightly. Filter to the current and previous day.

**Retention that forgets the hot tier.** The lake keeps 90 days. The hot tier keeps three. A dashboard pointed at the hot tier shows three days and the on-call engineer assumes that is all there is.

**Personal data in bodies.** Redact at the Collector. A log body with an email address in it is personal data in an append-only table with a long retention window.

## Operational Guidance

**Run telemetry tables on v3.** `variant`, `timestamp_ns`, and no deletes. The design assumes it.

**One table per signal, resource attributes denormalized.** Joining to a resource table is a shuffle on every query for no storage benefit after compression.

**Partition by hour and bucket by `trace_id` on spans and logs, with the same bucket count.** Trace reconstruction becomes a storage-partitioned join.

**Promote what dashboards group by, shred the rest.** Revisit quarterly as services and conventions change.

**Commit every sixty seconds, compact the current day every few hours, close each day with a final compaction, expire snapshots daily.** Retention by partition drop, per signal.

**Dual-export to a hot tier for the last days.** Alerts and on-call from the hot tier. Everything else from the lake.

**Sample traces at the tail, redact at the Collector.** The two decisions that most affect cost and compliance happen before the data lands.

**Use a REST catalog with vended credentials for the sink.** The Collector's Kafka sink should not hold a bucket key.

**Write the queries down as views.** Error rate, trace reconstruction, percentile from histograms, exemplar lookup. Analysts and agents should not have to rediscover the histogram UDF.

## Where the Ecosystem Is Heading

**A native Iceberg exporter for the Collector.** The pieces exist and the demand is visible. A contrib exporter that writes Iceberg through a REST catalog with the table schema conventions above, or through the Iceberg Go library, removes the Kafka tier for organizations that do not otherwise need it.

**OTel Arrow.** The OpenTelemetry Arrow protocol encodes OTLP as Arrow record batches for transport, which compresses better on the wire and maps directly to Parquet on landing. Collector-to-sink paths that stay in Arrow end to end avoid a protobuf decode and re-encode.

**Iceberg's own telemetry.** A proposal in the Iceberg project adds an OpenTelemetry-based metrics reporter, so that scan and commit metrics from the library itself flow into the same pipeline as application telemetry. The lakehouse observing itself through the lakehouse is a fitting outcome.

**Hybrid engines.** ClickHouse hybrid tables and OpenObserve's object-storage-first design point toward hot tiers that are caches over Iceberg rather than copies, which collapses the two-tier design into one system with two performance profiles.

**Semantic conventions as schema.** The OTel semantic conventions define which attributes exist and what they mean. Tooling that generates the promoted-column schema from the conventions, and updates it as they evolve, replaces the hand-maintained DDL above.

**Agents on telemetry.** An agent investigating an incident wants exactly the queries in this article, over exactly this data, with the ability to follow a trace ID from a metric spike to the logs. Telemetry as tables in a catalog with an MCP server is the substrate for that, and it is where several observability vendors are heading.

## Conclusion

Logs, traces, and metrics are append-only, time-partitioned, semi-structured, and compressible, which is the profile Apache Iceberg on object storage is built for. One table per signal, partitioned by hour and bucketed by trace ID, with the attributes dashboards use promoted to columns and the rest in shredded `variant`, gives a schema that preserves the OpenTelemetry data model and prunes on every common query. A Collector feeding Kafka feeding the Iceberg sink, committing every minute and compacting the current day, produces healthy tables at any volume. Retention becomes a partition drop, cost becomes object storage, and the query engine is whichever one the organization already runs.

The hot tier does not go away. The first thirty seconds of an incident belong to a system built for sub-second queries over recent data, and full-text search belongs to an index. What changes is that the lake holds everything, for as long as it is useful, at a cost that does not force the thirty-day decision, and that the six-week-old deploy's logs are there when the incident needs them.

## Keep Going

If this piece was useful, I have written a lot more on designing Iceberg tables for high-volume, append-only data and on the v3 features this design depends on. *Architecting an Apache Iceberg Lakehouse* from Manning covers partitioning, layout, and streaming ingestion in depth. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
