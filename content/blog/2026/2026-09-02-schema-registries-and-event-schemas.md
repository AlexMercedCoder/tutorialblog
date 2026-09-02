---
title: "Schema Registries and Event Schemas: Avro, Protobuf, and JSON Schema on the Way Into the Lakehouse"
date: "2026-09-02"
description: "How Avro, Protobuf, and JSON Schema evolve through a registry, and how that maps to the schema evolution rules of Iceberg."
author: "Alex Merced"
category: "Data Engineering"
tags:
  - Schema Registry
  - Avro
  - Protobuf
  - JSON Schema
  - Kafka
  - Apache Iceberg
canonical: https://iceberglakehouse.com/posts/schema-registries-and-event-schemas/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/schema-registries-and-event-schemas/).

A Kafka topic carries order events. A producer team adds a field. Downstream, three consumers keep working because the serialization format tolerates an unknown field, and a fourth crashes because it validates strictly. The Iceberg sink writing that topic to the lakehouse adds a column, which is the correct behavior. Two weeks later a producer changes a field's type from string to integer, and the sink cannot add that as a promotion, so it either fails the connector or coerces the column to string, and every downstream query that cast it breaks.

None of that is a Kafka problem or an Iceberg problem. It is a schema governance gap between two systems that both have schema evolution rules, and different ones. Kafka's schema registry governs what a producer is allowed to publish. Iceberg's spec governs what a table's schema is allowed to become. The rules overlap and do not match, and the sink between them is where the mismatch surfaces.

This article is about that seam. It covers the three event serialization formats and what their schemas can express, how a schema registry enforces compatibility and what the compatibility modes actually mean, how each format's types map to Iceberg types, where the evolution rules agree and diverge, how the sink applies changes to the table, and the governance design that keeps the two schema systems in agreement. I work at Dremio, which reads the tables at the end of this pipeline, and the material here is about open formats and open registries.

## Three Formats, Three Philosophies

Event data is serialized in one of three formats in almost every organization, and the choice shapes everything downstream.

**Apache Avro** was designed for exactly this job. A record's schema is JSON, the data is compact binary, and the schema travels with the data, either embedded in a file's header for Avro files or referenced by ID for messages. Avro's defining property is that a reader uses both the writer's schema and its own reader schema to decode, resolving differences by field name with defaults filling gaps. That two-schema resolution is why Avro's evolution story is the cleanest of the three: adding a field with a default is backward compatible by construction, and the reader never needs to have seen the writer's version.

Avro's type system is small and precise: null, boolean, int, long, float, double, bytes, string, plus records, enums, arrays, maps, unions, and fixed. Logical types annotate the primitives for dates, times, timestamps with millisecond or microsecond precision, decimals, and UUIDs. Nullability is expressed as a union with null, which is explicit and slightly awkward.

**Protocol Buffers (Protobuf)** was designed for RPC and inherits its priorities. Fields are identified by number, not by name, which makes renaming free and reordering irrelevant. The wire format is compact and fast. In proto3 every scalar field is optional with a zero-valued default, which means the format cannot distinguish "absent" from "zero" without wrapper types or explicit `optional` markers.

Protobuf's type system covers the numeric family with explicit widths and signedness, bool, string, bytes, enums, nested messages, repeated fields, maps, and `oneof` for tagged unions. Well-known types provide timestamps, durations, and struct-like values. The number-based identity is the closest analogue in the event world to Iceberg's field IDs, which makes the mapping conceptually clean.

**JSON Schema** describes JSON documents. It is the most flexible and the least precise: the underlying data is JSON, so numbers have no declared width, dates are strings by convention, and anything the schema does not constrain is permitted unless `additionalProperties` says otherwise. It is also the most human-readable and the easiest for a producer team with no schema tooling to adopt.

The tradeoff is that JSON Schema's flexibility pushes work downstream. A field that a JSON Schema declares as `type: number` can arrive as an integer or a float, and the sink writing Iceberg has to pick a type. Fields absent from the schema arrive anyway. This is where the `variant` type earns its place, covered later.

## Choosing a Format When You Still Can

Most teams inherit their format. For teams that do not, the decision is worth making with the lakehouse in view rather than only the producers.

**Avro** if the pipeline is Kafka-centric, evolution happens often, and the destination is analytical tables. Its reader-writer schema resolution is the cleanest evolution model, its type system maps to Iceberg with the fewest surprises, its logical types cover the temporal and decimal cases that analytics needs, and the tooling around it in the Kafka ecosystem is the most mature. The awkwardness is the null-union syntax and the verbosity of the JSON schema.

**Protobuf** if the same message definitions serve RPC between services, if payload size and serialization speed matter at extreme volume, or if the organization already standardizes on it. The field-number identity is genuinely better than name-based identity for evolution, and it is wasted at the lakehouse boundary because sinks map by name. Budget for the unsigned-integer and zero-default handling.

**JSON Schema** if producer teams have no schema tooling, if payloads are genuinely heterogeneous, or if the events are consumed by web clients as well. Accept that types are advisory and design the table around a declared core plus a `variant` payload. The developer experience is the best of the three and the downstream cost is the highest.

The volume argument matters less than it used to. All three formats compress well once they land in Parquet, and the difference in wire size between Avro and JSON stops mattering the moment the data is columnar. The evolution and type-fidelity arguments are the ones that persist over a table's lifetime.

## What a Schema Registry Does

A schema registry stores schemas, assigns them IDs, and enforces compatibility rules when a new version is registered. Confluent Schema Registry established the pattern, and the Apicurio Registry, AWS Glue Schema Registry, Azure's registry, Karapace, and the registries built into managed Kafka services follow the same shape.

**Schemas are stored under subjects.** A subject is a namespace for a schema's versions, conventionally named for the topic and whether it governs keys or values: `orders-value`, `orders-key`. Alternative naming strategies key subjects by record type or by topic and record type, which matters for topics carrying multiple event types.

**Messages carry a schema ID, not a schema.** The producer serializes with a schema, registers it (or looks up its ID), and prefixes the message with a magic byte and the four-byte ID. The consumer reads the ID, fetches the schema from the registry, caches it, and decodes. The wire overhead is five bytes per message instead of a full schema, which is the whole point for high-volume topics.

**Compatibility is checked at registration.** When a producer registers a new version of a subject's schema, the registry checks it against previous versions according to the subject's compatibility setting and rejects it if the check fails. This is the enforcement point, and it is the reason a registry is worth running: a breaking change fails at deploy time in the producer's CI rather than at 3 a.m. in a consumer.

The compatibility modes are the part everyone half-remembers, and the definitions matter because they determine which changes reach the lakehouse.

| Mode | Check | Allowed changes | Upgrade first |
|---|---|---|---|
| `BACKWARD` | New schema can read data written with the previous version | Delete a field, add an optional field (with a default) | Consumers |
| `BACKWARD_TRANSITIVE` | Same, against all previous versions | Same | Consumers |
| `FORWARD` | Previous schema can read data written with the new version | Add a field, delete an optional field | Producers |
| `FORWARD_TRANSITIVE` | Same, against all previous versions | Same | Producers |
| `FULL` | Both directions, against the previous version | Add or delete optional fields with defaults | Either |
| `FULL_TRANSITIVE` | Both directions, against all previous versions | Same | Either |
| `NONE` | No check | Anything | Nothing is safe |

`BACKWARD` is the default in Confluent Schema Registry and is the right default for most event topics, because it lets a consumer upgraded to the new schema read the backlog of old messages. `FULL_TRANSITIVE` is the strictest useful setting and is what a topic feeding a lakehouse table should usually have, because it guarantees that every version of the schema can read every other, which is what a table containing years of data effectively requires.

What no compatibility mode allows, in any of the three formats, is an incompatible type change. String to integer, a field's meaning changing while its name stays, or removing a required field are rejected. That is the guarantee the registry provides and the reason the lakehouse side of the pipeline can make assumptions.

### Registries Beyond Kafka

The registry pattern is not Kafka-specific, and event data reaching a lakehouse takes other paths.

**Pulsar** has a built-in schema registry with per-topic schemas and compatibility checks, using the same conceptual model. Its Iceberg sink connectors face the same mapping questions.

**Cloud eventing services.** Amazon EventBridge has a schema registry with discovery that infers schemas from observed events. Google Pub/Sub supports Avro and Protobuf schemas per topic. Azure Event Hubs uses the Azure Schema Registry. Each enforces at publish time and each has its own compatibility vocabulary that maps roughly onto the modes above.

**Files with embedded schemas.** Avro object container files carry the writer's schema in the header, which makes a directory of Avro files self-describing without a registry. Parquet files carry their own schema. Ingesting these into Iceberg means reading the embedded schema rather than fetching one, and the evolution question becomes whether successive files' schemas are compatible, which nothing checks unless the pipeline does.

**API payloads.** Events arriving over HTTP from webhooks or partner APIs usually have a JSON Schema at best and a documentation page at worst. These are the strongest case for a declared core plus a `variant` payload, because the producer is outside the organization's control and the schema changes without notice.

The governance design is the same in each case: a place where the schema is recorded, a check that a new version is compatible, a mapping to the table's types, and visibility when the mapping changes. Kafka with a registry provides the first two out of the box. The other paths need them built.

## Mapping Each Format to Iceberg Types

The sink writing to Iceberg has to turn a decoded message into rows in a table with an Iceberg schema. The mapping is mostly obvious and has a handful of decisions that matter.

### Avro to Iceberg

Avro is the closest fit, because Iceberg itself uses Avro for manifests and the reference implementation has a well-tested conversion.

| Avro | Iceberg |
|---|---|
| `null` | not a type on its own, appears in unions |
| `boolean` | `boolean` |
| `int` | `int` |
| `long` | `long` |
| `float` | `float` |
| `double` | `double` |
| `bytes` | `binary` |
| `string` | `string` |
| `fixed(N)` | `fixed(N)` |
| `enum` | `string` |
| `record` | `struct` |
| `array` | `list` |
| `map` (string keys) | `map<string, V>` |
| `union [null, T]` | optional `T` |
| `union` of several non-null types | no clean mapping |
| logical `date` | `date` |
| logical `time-micros` | `time` |
| logical `timestamp-micros` | `timestamp` or `timestamptz` |
| logical `timestamp-millis` | `timestamp`, with precision loss |
| logical `decimal(P,S)` | `decimal(P,S)` |
| logical `uuid` | `uuid` |

Three items need decisions. Enums become strings, which loses the constraint, so a table that wants it enforced needs a validation check rather than a type. Millisecond timestamps map to Iceberg's microsecond `timestamp` with the low digits zero, which is lossless in value and misleading in precision. And unions of several non-null types have no Iceberg equivalent: the options are separate nullable columns per branch, a `variant` column on v3, or a string holding the serialized value. Multi-branch unions are rare in practice and are worth avoiding at the schema design stage.

The timestamp with or without zone question is the one that causes the most downstream confusion. Avro's `timestamp-micros` is defined as an instant in UTC, which maps to Iceberg's `timestamptz`. Avro's `local-timestamp-micros` maps to `timestamp` without zone. Producers that emit local timestamps as `timestamp-micros` produce tables where every value is offset by the producer's zone, and the mistake is invisible until someone compares two regions.

### Protobuf to Iceberg

| Protobuf | Iceberg |
|---|---|
| `bool` | `boolean` |
| `int32`, `sint32`, `sfixed32` | `int` |
| `uint32`, `fixed32` | `long` (to hold the full unsigned range) |
| `int64`, `sint64`, `sfixed64` | `long` |
| `uint64`, `fixed64` | `decimal(20,0)` or `long` with overflow risk |
| `float` | `float` |
| `double` | `double` |
| `string` | `string` |
| `bytes` | `binary` |
| `enum` | `string` (the name) or `int` (the number) |
| `message` | `struct` |
| `repeated T` | `list<T>` |
| `map<K,V>` | `map<K,V>` |
| `oneof` | struct of nullable fields, one populated |
| `google.protobuf.Timestamp` | `timestamptz` |
| `google.protobuf.Duration` | `long` nanoseconds, or a struct |
| `google.protobuf.StringValue` and wrappers | nullable primitive |

The unsigned integers are the trap. Protobuf's `uint64` covers a range Iceberg's `long` cannot, and a value above 2^63 silently becomes negative. Most producers never emit values that large, and the ones that do (certain IDs and hashes) are exactly the fields where the corruption matters. Mapping `uint64` to `decimal(20,0)` or to a string is the safe choice for those fields.

The proto3 zero-default behavior is the other one. Without explicit `optional` markers, a field that was not set decodes as its zero value: an unset `int32` is 0, an unset `string` is empty. The sink writing Iceberg cannot distinguish that from an actual zero, so the table's null counts are wrong and `WHERE amount IS NULL` finds nothing. Producers that care about the distinction use `optional` fields (which proto3 reintroduced) or wrapper types, and the sink maps those to nullable columns.

### JSON Schema to Iceberg

| JSON Schema | Iceberg |
|---|---|
| `boolean` | `boolean` |
| `integer` | `long` |
| `number` | `double`, or `decimal` if `multipleOf` implies scale |
| `string` | `string` |
| `string` with `format: date` | `date` |
| `string` with `format: date-time` | `timestamptz` |
| `string` with `format: uuid` | `uuid` |
| `object` with declared properties | `struct` |
| `object` with `additionalProperties` | `map<string,string>` or `variant` |
| `array` | `list` |
| `oneOf` / `anyOf` | `variant` on v3, or a string |
| absent from the schema | `variant`, or dropped |

JSON Schema's looseness means the mapping involves more judgment. `integer` maps to `long` because JSON does not declare width and a producer that starts emitting values above 2^31 should not break the table. `number` maps to `double` unless the schema constrains it, and monetary values declared as `number` are a well-known source of rounding complaints, which is a schema design problem: money should be `string` with a decimal format, or an integer count of minor units.

The `additionalProperties` case is where Iceberg v3's `variant` type changes the design. Before v3, an open-ended JSON object had to become a `map<string,string>` (losing types) or a JSON string (losing queryability). With `variant` and shredding enabled, the object goes in as semi-structured data, common paths get typed Parquet subcolumns with statistics, and `WHERE payload:customer.tier = 'gold'` prunes. For JSON-based event pipelines this is the single most useful v3 feature.

## Where the Evolution Rules Agree and Diverge

Both systems allow schemas to change and both restrict how. The overlap is large and the gaps are where pipelines break.

**Adding an optional field** is allowed everywhere. In the registry it passes every compatibility mode when it has a default. In Iceberg it is `ADD COLUMN` with a new field ID, and on v3 it can carry `initial-default` so old rows read as the default rather than null. This is the common case and it works.

**Deleting a field** is allowed under `BACKWARD` in the registry and is `DROP COLUMN` in Iceberg. The important difference: Iceberg retires the field ID permanently, so a field deleted and later re-added is a different column and the old data is unreachable. Registries have no such rule, and a producer that removes a field and adds it back with the same name considers it the same field. A sink that drops and re-adds the Iceberg column loses the history. The safer sink behavior, and what the Iceberg Kafka Connect sink does, is to leave removed columns in place and stop populating them.

**Renaming a field** is the sharpest divergence. Protobuf renames are free because identity is the field number. Avro renames are handled with aliases in the reader schema. Iceberg renames are free because identity is the field ID. But the sink sees a decoded record with field names and maps them to Iceberg columns by name, so a producer-side rename looks to the sink like a delete plus an add. The old column stops being populated, a new column starts, and the history is split across two columns with no engine understanding they are the same thing. The fix is a manual Iceberg `RENAME COLUMN` applied before the producer's rename ships, coordinated between the two teams, which is exactly the kind of coordination the registry was supposed to make unnecessary.

**Type changes** are where the two rule sets are strictest and least aligned. The registry rejects incompatible type changes outright. Iceberg allows a specific set of widenings: `int` to `long`, `float` to `double`, `decimal` precision increase, and on v3 `date` to `timestamp`. An Avro `int` to `long` change is compatible in both systems and the sink applies it as an Iceberg promotion. An Avro `string` to `int` change is rejected by the registry, which is the right outcome. The gap is changes the registry permits under a loose compatibility mode (or under `NONE`) that Iceberg cannot represent, which is why the topic's compatibility mode is a lakehouse concern.

**Default values** exist in both and mean different things. An Avro or Protobuf default is what a reader substitutes when the field is absent from the message. An Iceberg `initial-default` is what a reader returns for rows in files written before the column existed, and `write-default` is what a writer stores when no value is supplied. A sink that maps the event schema's default onto Iceberg's `initial-default` gives old rows in the table the same value that old messages decode to, which is usually the intent and is not automatic in any sink today.

**Nested and repeated structures** evolve in both systems with the same field-identity logic, and Iceberg's nested field IDs mean a field added inside a struct is as cheap as one added at the top level. Where they diverge is that Iceberg forbids restructuring: a set of flat fields cannot become a nested struct, and a struct cannot be flattened. Producers that reorganize their message structure force a new column tree in the table, and the old columns keep the old data.

## The Sink's Job

Between the registry and the table sits the sink, and its configuration determines which of the above happens automatically and which fails loudly.

The Apache Iceberg Kafka Connect sink is the reference implementation for this path. Its relevant settings:

```json
{
  "connector.class": "org.apache.iceberg.connect.IcebergSinkConnector",
  "topics": "orders",
  "key.converter": "io.confluent.connect.avro.AvroConverter",
  "key.converter.schema.registry.url": "https://registry.internal",
  "value.converter": "io.confluent.connect.avro.AvroConverter",
  "value.converter.schema.registry.url": "https://registry.internal",
  "iceberg.catalog.type": "rest",
  "iceberg.catalog.uri": "https://polaris.internal/api/catalog",
  "iceberg.catalog.warehouse": "analytics",
  "iceberg.catalog.header.X-Iceberg-Access-Delegation": "vended-credentials",
  "iceberg.tables": "raw.orders",
  "iceberg.tables.auto-create-enabled": "true",
  "iceberg.tables.evolve-schema-enabled": "true",
  "iceberg.tables.default-partition-by": "hours(event_time)",
  "iceberg.control.commit.interval-ms": "60000"
}
```

The converter is what connects the two schema systems. `AvroConverter` with a registry URL decodes messages using the registry's schemas and produces Connect records with a Connect schema attached. The equivalents are `ProtobufConverter` and `JsonSchemaConverter`. The sink then maps the Connect schema to an Iceberg schema.

`evolve-schema-enabled` is the setting that decides behavior on change. With it on, the sink adds new columns and applies legal type promotions when a message arrives with a schema the table does not have. With it off, messages with unknown fields have those fields dropped, which is safe for the table and silently loses data. Neither is universally right: `true` for raw landing tables where the goal is to capture everything, `false` for tables with a governed schema that a transformation layer depends on, with schema changes applied deliberately.

`auto-create-enabled` with `default-partition-by` handles new topics without a manual DDL step, which is convenient for a landing layer and produces tables with no thought given to sort order or metrics. Auto-created tables should be treated as drafts and tuned.

`route-field` and multi-table configuration handle topics carrying several event types, routing each to its own table based on a field's value, which pairs with the record-name subject naming strategy in the registry.

What the sink does not do is coordinate with the registry beyond decoding. It does not read the subject's compatibility mode, does not know a rename was a rename, and does not map event-schema defaults to Iceberg defaults. Those are the gaps the governance design has to fill.

### Partitioning and Layout for Event Tables

The schema conversation dominates this topic, and the layout decisions that go alongside it are worth stating because auto-created tables get them wrong.

**Partition on the event time, not the ingest time.** Every query filters on when the thing happened. A table partitioned by ingestion hour scatters an event's day across whatever hours the pipeline was running, and a query for yesterday reads every partition. `hours(event_time)` or `days(event_time)` depending on volume.

**Handle late arrivals with the partition, not with the pipeline.** An event that arrives three days late writes into its own event-time partition, producing a small file in a partition that was already compacted. That is correct and it means compaction has to revisit recent partitions rather than only the current one. A window of a week is typical.

**Sort within partitions by the columns queries filter on** after the partition column: the entity ID, the event type, the service. This tightens min/max bounds and improves compression on repeated values.

**Set metrics deliberately.** Event tables are wide and mostly unfiltered. `counts` by default, `full` on the event time, the entity key, and the two or three fields dashboards group by.

**Choose the format version.** v3 for `variant`, for deletion vectors if any correction path exists, and for nanosecond timestamps where the event source produces them. Event tables are append-only, so the v3 benefits are mostly about types rather than deletes.

**Commit interval and compaction together.** A sixty-second commit interval and compaction every few hours for the current day, with a final compaction when the day closes, is the same shape any streaming Iceberg table needs.

Auto-created tables from the sink get none of this. The pattern that works is to create event tables with deliberate DDL, keep `auto-create-enabled` off in production, and let the sink evolve columns within a table whose layout was chosen.

## A Governance Design That Closes the Gap

The pieces above compose into a design where schema changes are safe by construction rather than by vigilance.

**Set topic compatibility to `FULL_TRANSITIVE` for topics that feed lakehouse tables.** A table holds every version of the data ever written. A compatibility mode weaker than transitive allows a chain of individually compatible changes that together make version 1 unreadable by version 10's schema, and the table has rows from both.

**Register schemas in CI, not at runtime.** The producer's build pipeline registers the schema against the subject and fails the build on incompatibility. Producers that auto-register on first publish move the failure to production and to whichever instance published first.

**Keep schemas in version control next to the producer's code**, with the registry as the enforcement point rather than the source of truth. A schema diff in a pull request is reviewable by the consuming teams, which is where a rename gets caught.

**Treat the Iceberg table's schema as a downstream contract with its own review.** For raw landing tables, `evolve-schema-enabled` handles additions and the review is the registry's. For modeled tables, schema changes are deliberate DDL applied by the owning team.

**Handle renames as a coordinated two-step.** Apply the Iceberg `RENAME COLUMN` first, so the field ID and its history carry over, then ship the producer change. This requires knowing a rename is coming, which requires the schema diff to be visible, which is why schemas belong in version control.

**Map event defaults to Iceberg defaults when adding columns.** On v3 tables, an added column whose event schema has a default should get that value as `initial-default` so that historical rows read consistently with historical messages. No sink does this automatically today, so it is a manual `ALTER TABLE` after the sink adds the column, or a small automation watching for new columns.

**Put open-ended payloads in `variant`.** For JSON-based events especially, a `payload` column of type `variant` with shredding enabled captures everything the schema does not declare, prunes on the paths that turn out to be common, and removes the pressure to evolve the table's column list on every producer change.

**Validate the table after schema changes.** A check that the new column's null rate is plausible, that no existing column's null rate jumped, and that row counts are steady catches the coercion and the silent-drop cases. This is the layer-one metadata check from any quality design, pointed at the schema-change event.

**Record the schema ID on the row.** A `schema_id` column populated from the message's registry ID makes it possible to query which rows were written under which schema version, which turns a schema investigation from archaeology into a `GROUP BY`.

## Walkthrough: A Compatible Change, End to End

Following one field addition through the whole path makes the pieces concrete.

The producer team adds a `promo_code` field to the order event. In Avro:

```json
{
  "type": "record",
  "name": "OrderPlaced",
  "namespace": "com.example.orders",
  "fields": [
    { "name": "order_id",    "type": "long" },
    { "name": "customer_id", "type": "long" },
    { "name": "event_time",  "type": { "type": "long", "logicalType": "timestamp-micros" } },
    { "name": "amount",      "type": { "type": "bytes", "logicalType": "decimal", "precision": 12, "scale": 2 } },
    { "name": "status",      "type": "string" },
    { "name": "promo_code",  "type": ["null", "string"], "default": null }
  ]
}
```

The new field is a union with null and has a default, which passes `FULL_TRANSITIVE`. The producer's CI registers it against `orders-value` and the registry assigns version 4 and a new schema ID. The build passes.

The producer deploys and starts emitting messages with the new schema ID. The sink's `AvroConverter` fetches schema 4 from the registry, decodes, and produces Connect records with the new field.

The sink compares the Connect schema to `raw.orders`'s Iceberg schema, finds `promo_code` missing, and with `evolve-schema-enabled` applies an `ADD COLUMN` in a metadata commit. The column gets the next field ID from the table's `last-column-id`. Existing files have no column with that ID, so every historical row reads null.

The next data commit writes files containing the new column. From that snapshot forward, `promo_code` is populated where the producer set it.

Two follow-ups make the change complete rather than merely successful. First, if the intent is that historical orders had no promo code, null is correct and nothing more is needed. If the intent is that they had an implicit value, an `ALTER TABLE ... ALTER COLUMN promo_code SET DEFAULT` sets `initial-default` so historical rows read that value instead of null. Second, if `promo_code` is going to be filtered on, its metrics mode should be set:

```sql
ALTER TABLE raw.orders SET TBLPROPERTIES (
  'write.metadata.metrics.column.promo_code' = 'full'
);
```

Which applies to files written afterward, so a compaction of recent partitions makes it effective sooner.

Verifying from the table side, the schema change and its effect are both visible in metadata:

```sql
-- when did the column appear, and in which snapshot
SELECT snapshot_id, operation, summary['added-data-files'] AS files
FROM raw.orders.snapshots ORDER BY committed_at DESC LIMIT 5;

-- how many rows have it populated, by day
SELECT date_trunc('day', event_time) AS day,
       count(*) AS rows,
       count(promo_code) AS with_promo
FROM raw.orders
WHERE event_time >= now() - INTERVAL 7 DAYS
GROUP BY 1 ORDER BY 1;
```

The day the producer deployed shows the transition from zero to nonzero, which is the confirmation that the change reached the table and the timestamp an investigation needs later.

## Failure Modes

**Compatibility set to `NONE` or `BACKWARD` on a lakehouse topic.** Individually compatible changes accumulate into a schema that cannot read old data, and the table has old data. `FULL_TRANSITIVE`.

**Producers auto-registering schemas.** The first instance to deploy defines the schema, incompatibilities surface in production, and the registry becomes a record of what happened rather than a gate. Register in CI.

**Renames splitting a column's history.** Covered above, and the most common data-loss-shaped failure in this pipeline. Coordinate the Iceberg rename first.

**Proto3 zero values read as data.** Unset fields arrive as 0 and empty string, the table's null counts are meaningless, and consumers computing averages include zeros that were absences. Use `optional` or wrapper types for fields where the distinction matters.

**Unsigned 64-bit overflow.** `uint64` values above 2^63 become negative longs. Map those fields to `decimal(20,0)`.

**Millisecond precision presented as microsecond.** Avro `timestamp-millis` into Iceberg `timestamp` produces values whose last three digits are always zero, and consumers assume microsecond precision. Document it or promote precision at the producer.

**Local timestamps typed as instants.** The most damaging quiet error in this pipeline. Producer emits local time as `timestamp-micros`, the table says `timestamptz`, and every value is off by the producer's offset. Cross-region comparisons are wrong and nothing errors.

**`evolve-schema-enabled` false with silent drops.** A new field is added upstream and the sink drops it. The producer team believes the data is landing. Months later someone asks for it. Either enable evolution or alert on unmapped fields.

**JSON `number` for money.** Floating-point rounding in financial columns. `string` with a decimal format, or minor units as an integer.

**Multi-branch unions and `oneOf`.** No clean Iceberg mapping, and sinks handle them inconsistently. Design them out, or route to `variant`.

**Schema registry as a single point of failure.** Consumers cannot decode without it. Caching helps and does not cover a cold start during an outage. The registry is tier-one infrastructure for anything downstream of Kafka.

**Table auto-created and never tuned.** Auto-create produces a table with default partitioning, no sort order, and default metrics. It works and it is slow. Treat auto-created tables as drafts.

## Operational Guidance

**One format per organization where possible.** Avro for Kafka-centric event pipelines with strong evolution needs, Protobuf where the same schemas serve RPC, JSON Schema where producer teams have no tooling and the payloads are genuinely open-ended. Mixing all three means three converters, three mappings, and three sets of edge cases.

**`FULL_TRANSITIVE` on lakehouse topics, registered in CI, schemas in version control.**

**Design event schemas with the table in mind.** Nullable fields with defaults, explicit optionality in proto3, decimals for money, instants for timestamps, no multi-branch unions, and stable field names because the sink maps by name.

**Use `variant` for the open part.** Declare the fields that matter, and let the rest land in a shredded `variant` column rather than forcing a table schema change per producer change.

**Separate landing from modeled.** Raw tables evolve automatically and keep everything. Modeled tables have deliberate schemas, and the transformation layer between them is where breaking changes are absorbed.

**Carry the schema ID onto the row.**

**Alert on schema changes.** A notification when the sink adds a column, and a check on null rates afterward. Schema changes should be noticed, not discovered.

**Treat the registry as tier-one.** Its availability is every consumer's availability.

## Where the Ecosystem Is Heading

**Registries speaking the table format's rules.** The natural next step is a sink, or a registry integration, that knows an Iceberg table is downstream and rejects a schema change the table cannot represent, or that maps a registry-recorded rename to an Iceberg `RENAME COLUMN` automatically. The information exists on both sides and nothing joins it today.

**`variant` becoming the default for open payloads.** As v3 support broadens and shredding matures, the pattern of a declared core schema plus a `variant` payload column becomes the default shape for event tables, which removes most of the schema-evolution pressure from the sink.

**Data contracts spanning both systems.** The Open Data Contract Standard and its peers describe a dataset's schema, guarantees, and owner. A contract that covers both the topic and the table, generated from one source and enforced in both the registry and the catalog, is the coherent version of the governance design above.

**Iceberg-native ingestion from Kafka.** Several efforts aim to reduce or remove the Connect tier, with Kafka storage backed directly by Iceberg tables or with brokers writing Iceberg segments. Where those land, the registry-to-table mapping becomes part of the broker's configuration rather than a separate connector's.

**Catalogs holding schema lineage.** A REST catalog that records which registry subject and version a table's schema derives from turns the two-system investigation into a single lookup, and the metadata platforms are the natural place for that link to be visible.

## Conclusion

A schema registry and a table format both govern schema change, with rules that overlap and do not match, and a sink between them that translates without reconciling. Avro maps to Iceberg most cleanly, Protobuf's field numbers are conceptually closest to Iceberg's field IDs but its unsigned integers and zero defaults need care, and JSON Schema's looseness is best absorbed by `variant` rather than by forcing a rigid column list.

The changes that work are additions of optional fields with defaults, which pass every compatibility mode and land as Iceberg `ADD COLUMN`. The changes that break are renames, which split a column's history because the sink maps by name while both systems identify by ID, and type changes the registry permits but Iceberg cannot represent. Setting topics that feed the lakehouse to `FULL_TRANSITIVE`, registering in CI, keeping schemas in version control where consumers review them, coordinating renames as an Iceberg operation first, and putting the open-ended part of the payload in `variant` closes most of the gap. The rest is noticing when the schema changed, which the table's own metadata will tell you if anyone asks it.

## Keep Going

If this piece was useful, I have written a lot more on Iceberg schema evolution, the field-ID mechanics underneath it, and streaming ingestion into open tables. *Apache Iceberg: The Definitive Guide* from O'Reilly covers the schema and metadata layer in the depth this article draws on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
