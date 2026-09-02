---
title: "Default Column Values and Field IDs: How Iceberg Schema Evolution Works at the Spec Level"
date: "2026-09-02"
description: "How field IDs and initial and write defaults let Iceberg change schemas on large tables without rewriting data, at the spec level."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Schema Evolution
  - Field IDs
  - Default Values
canonical: https://iceberglakehouse.com/posts/iceberg-default-values-and-field-ids/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-default-values-and-field-ids/).

An engineer runs `ALTER TABLE orders ADD COLUMN channel STRING` against a 200-terabyte table. The command returns in under a second. Every query afterward sees the new column, old rows show `NULL`, and nothing was rewritten. The same engineer then renames `customer_id` to `account_id`, moves it to the front of the schema, and drops a column that had been there for three years. Still under a second. Still no rewrite. Queries against snapshots from last month return the old schema, and queries against the current snapshot return the new one, reading the same Parquet files.

Most people who use Iceberg know this works. Far fewer know why. The answer is two pieces of metadata design that the spec gets right and that most file formats and older table formats got wrong: every column has a permanent integer ID that never changes and is never reused, and every column added after the table was created can carry a default value that readers apply to files written before the column existed.

This article is about those mechanics. It covers how field IDs are assigned and stored in metadata and in data files, how a reader resolves a column that a file does not contain, what `initial-default` and `write-default` mean and how they are serialized, which type promotions are legal and why, and what a schema change actually writes to a metadata file. It also covers the ways this machinery breaks, which are subtle because the failures are silent. I work at Dremio, which implements these rules in its engine, but everything here is spec behavior that any conforming implementation follows.

## Why Names Were Never Enough

Before Iceberg, tables on object storage resolved columns by name or by position, and both approaches fail in ways that only show up months after the change.

Position-based resolution, which is how Hive tables backed by CSV or ORC behaved by default, treats the third column in the file as the third column in the schema. Add a column in the middle of the schema and every file written before the change now returns the wrong values for every column after the insertion point. Drop a middle column and the same thing happens in reverse. The failure is not an error. It is a table that returns `order_total` values under the `tax_amount` header and vice versa.

Name-based resolution, which is what Hive with Parquet and most ad hoc Parquet data lakes use, looks up each schema column by name in each file's footer. This survives reordering. It does not survive renames: rename `cust_id` to `customer_id` and every old file now returns null for the column, because no file has a column with the new name. It also does not survive the most dangerous operation of all, dropping a column and later adding a different column with the same name. Every old file has a column with that name, containing the old data, and the reader happily returns it as if it were the new column.

Both approaches also make schema history a problem. If the table's schema changed five times, a reader needs to know which schema each file was written with to interpret it, and neither position nor name encodes that.

The Iceberg spec solves all of this with one decision: columns are identified by integer IDs that are assigned once, stored in every data file, and never reused. Names become labels attached to IDs. Positions become the order of IDs in the current schema. Renames change the label. Reorders change the order. Neither touches the ID, and a file written with ID 7 named `cust_id` is read correctly by a schema where ID 7 is now named `customer_id` in a different position.

## Field IDs: Assignment, Uniqueness, and the Reserved Range

Every field in an Iceberg schema, including nested fields inside structs, lists, and maps, has an integer `id`. The rules governing those IDs are short and strict.

**IDs are assigned when a field is added and never change.** The table metadata tracks `last-column-id`, the highest ID ever assigned in the table. When a schema evolution adds a field, the new field gets `last-column-id + 1`, and `last-column-id` advances. When a field is deleted, its ID is retired. The spec's rule that adding a field assigns a new ID means that dropping `channel` (ID 12) and later adding a different `channel` yields ID 13, not 12. Files written with the old column still contain ID 12, and the new schema never asks for ID 12, so the old data is invisible. This is the single most important guarantee in the whole design.

**Nested fields get their own IDs.** A struct's fields each have an ID. A list has an `element-id` for its element type. A map has a `key-id` and a `value-id`. A column typed `list<struct<lat: double, lon: double>>` consumes four IDs: one for the column, one for the list element, and one each for `lat` and `lon`. All of them come from the same counter and all follow the same never-reuse rule. This is what lets you add a field to a nested struct, rename a map's value field, or drop an element field without touching files.

**IDs are unique within a table, not just within a schema.** A table's metadata holds a list of every schema it has ever had, each with a `schema-id`, and a `current-schema-id` pointing at the active one. Because field IDs come from a table-wide counter, an ID means the same thing in every schema in the list. Schema 0 and schema 4 agree that ID 7 is the customer identifier, whatever it was called in each.

**The top of the integer range is reserved.** The spec forbids user field IDs greater than 2,147,483,447, which is `Integer.MAX_VALUE - 200`. That reserved range holds metadata columns that engines expose in user queries: `_file` for the path of the file a row came from, `_pos` for the row's position, `_spec_id`, `_partition`, and in v3 the row-lineage columns `_row_id` and `_last_updated_sequence_number`. Reserving IDs for these means an engine can project them alongside user columns using the same ID-based machinery without colliding with anything a user adds.

**Partition fields have a separate ID space.** A partition spec's fields carry their own `field-id`, starting at 1,000 in the reference implementation and tracked by `last-partition-id`. A partition field references its source column by `source-id`, which is a schema field ID. So the partition spec `{"source-id": 4, "field-id": 1000, "name": "ts_day", "transform": "day"}` says: partition field 1000, named `ts_day`, is the day transform applied to schema field 4. If schema field 4 is renamed, the partition spec does not change, because it refers to the ID.

**Identifier fields are a set of IDs.** A schema can declare `identifier-field-ids`, the list of field IDs that together identify a row. This is what engines use for upserts and what equality delete files use to match rows. Because it is a list of IDs rather than names, renaming a key column does not break the table's row identity.

Here is what a small schema looks like in the metadata JSON, with the nested IDs visible:

```json
{
  "type": "struct",
  "schema-id": 2,
  "identifier-field-ids": [1],
  "fields": [
    { "id": 1, "name": "order_id", "required": true, "type": "long" },
    { "id": 2, "name": "account_id", "required": true, "type": "long" },
    { "id": 3, "name": "placed_at", "required": true, "type": "timestamptz" },
    { "id": 4, "name": "items", "required": false,
      "type": { "type": "list", "element-id": 5, "element-required": true,
                "element": { "type": "struct", "fields": [
                  { "id": 6, "name": "sku", "required": true, "type": "string" },
                  { "id": 7, "name": "qty", "required": true, "type": "int" }
                ] } } },
    { "id": 8, "name": "channel", "required": true, "type": "string",
      "initial-default": "web", "write-default": "web" }
  ]
}
```

Field 8 is a column added after the table was created, which is why it carries defaults. Fields 5, 6, and 7 are nested inside the `items` list and have their own IDs. The `identifier-field-ids` entry says field 1 identifies rows. And `last-column-id` in the enclosing table metadata is at least 8.

## How IDs Travel Into Data Files

An ID in the table metadata is only useful if the data files carry the same ID, because the reader's job is to match schema IDs against file columns. Each file format has a slot for this.

In Parquet, every column in the file schema has an optional `field_id` in the Thrift `SchemaElement`. Iceberg writers are required to set it. The Parquet footer for the schema above has a column named `account_id` with `field_id: 2`, a group `items` with `field_id: 4`, and so on down to `qty` with `field_id: 7`. When a reader opens the file, it walks the Parquet schema, builds a map from `field_id` to column, and looks up each requested schema ID in that map. The Parquet column's name is ignored.

In Avro, the same information goes into the schema JSON as a `field-id` attribute on each record field, an `element-id` on arrays, and `key-id` and `value-id` on the key and value fields of the record that Iceberg uses to represent maps. Avro is what Iceberg uses for manifests and manifest lists, so this is also how the metadata layer's own columns are identified.

In ORC, IDs are stored as an `iceberg.id` attribute on each type in the ORC type tree, along with an `iceberg.required` attribute.

The consequence of this design is that a data file is self-describing with respect to IDs. You can drop a Parquet file from an Iceberg table into a debugging tool, read its footer, and know exactly which table fields it holds, independent of any catalog. That property matters for recovery, for migration, and for tools that read Iceberg data without loading the full table metadata.

Files that were not written by Iceberg have no IDs. This is the case for tables migrated from Hive, for Parquet files added through the `add_files` procedure, and for anything produced by a writer that predates the table. For these, the spec provides `schema.name-mapping.default`, a table property holding a JSON list of mappings from column names to field IDs. When a reader opens a file with no `field_id` values, it consults the name mapping to assign IDs by name. The mapping can be nested, with a `fields` list for children of structs and maps, and a single field can list several `names` so that a column known by different names in different legacy files resolves to one ID. Files that do carry IDs ignore the mapping entirely.

## Column Projection: What a Reader Does When a File Lacks a Column

The spec states the resolution procedure for a requested field ID that is not present in a data file as an ordered list, and the order matters.

1. If the field is the source of an `identity` partition transform and the partition value is present in the manifest entry's `partition` struct, return the partition value. This is what makes Hive migration metadata-only: Hive stored partition columns in directory names rather than in the files, and Iceberg reconstructs them from the manifest.
2. If the file has no field IDs, apply `schema.name-mapping.default` and use the column if the mapping finds it.
3. If the field has an `initial-default`, return it.
4. Otherwise return `null`.

Rule three is the default-value mechanism. A file written before `channel` existed has no column with ID 8. The reader reaches rule three, finds `initial-default: "web"`, and fills every row with that value. No file was touched.

The spec includes a worked example that shows the full behavior. A file written with schema `1: a int, 2: b string, 3: c double` is read with projection schema `3: measurement, 2: name, 4: a`. The reader selects file column `c` (renamed to `measurement`), then `b` (now called `name`), then a column of nulls called `a`, in that order. Notice that the requested field named `a` has ID 4, not ID 1. The file's ID 1 column, which happens to be named `a`, is not returned, because the reader matches on ID. The name collision is irrelevant. This is precisely the drop-and-re-add scenario, handled correctly.

## Default Values: `initial-default` and `write-default`

Format version 3 added two default attributes to every schema field. They answer two different questions and it is important not to conflate them.

`initial-default` answers: what value should a reader return for this field in rows written before the field existed? It is set exactly once, when the field is added, and the spec says it cannot change. It applies to files that lack the field's ID and to nothing else. Changing it later retroactively alters what historical data says, which is why the spec freezes it.

`write-default` answers: what value should a writer store for this field when the caller does not supply one? It starts equal to `initial-default` and can be changed by later schema evolution. It affects only rows written after the change and only when the writer omits the value. Because the value is physically written into the file, changing `write-default` never changes what any existing row returns.

The two together produce what the spec calls SQL default value behavior without rewriting data files. Adding `channel STRING NOT NULL DEFAULT 'web'` to a table with a billion existing rows makes every one of them read as `'web'`, and every new row that does not set `channel` is stored with `'web'`. Later deciding that new rows should default to `'app'` changes the `write-default` only. Old rows still read `'web'`, rows written in between still read `'web'`, and rows written afterward read `'app'` unless the writer said otherwise. This is exactly what a relational database does, and it is what Iceberg lacked before v3.

Several spec rules constrain how defaults are used.

**Writers must always write every known field.** The spec is explicit that omitting a known field when writing a data file is never allowed, and that the write default must be written when a value is not supplied. This means a data file never relies on `write-default` at read time. The default is materialized. If a required field has no `write-default` and the caller does not supply a value, the writer must fail rather than write a null or skip the column.

**Required fields added to an existing table need non-null defaults.** Before v3, adding a required column to a table with existing data was impossible, because old rows had no value and required means non-null. With v3, adding a required field is legal as long as both `initial-default` and `write-default` are set to non-null values. Optional fields can have null defaults, and the spec asks that they be set explicitly even when null.

**Some types cannot have non-null defaults.** Columns of type `unknown`, `variant`, `geometry`, and `geography` must default to null. A non-null `initial-default` or `write-default` on any of them is invalid metadata.

**Struct defaults are composed from field defaults.** A default for a struct-typed field is either `null` or an empty object `{}`. It never contains values for the struct's fields. Each nested field carries its own `initial-default` and `write-default`, and the reader assembles the effective struct default by filling each field from its own default. The spec's example is a struct `point` with fields `x` and `y` each defaulting to 0:

| `point` default | Data value | Result |
|---|---|---|
| `null` | (missing) | `null` |
| `null` | `{"x": 3}` | `{"x": 3, "y": 0}` |
| `{}` | (missing) | `{"x": 0, "y": 0}` |
| `{}` | `{"y": -1}` | `{"x": 0, "y": -1}` |

The second row is the subtle one. Even when the struct's own default is null, a partially populated struct value gets its missing fields filled from field-level defaults. Defaults compose downward through the type tree.

**Serialization uses single-value JSON.** Defaults are stored in the schema JSON as the `initial-default` and `write-default` attributes on the field object, encoded with Iceberg's single-value JSON serialization. Integers are JSON numbers, strings are JSON strings, dates are `"YYYY-MM-DD"` strings, timestamps are ISO-8601 strings, decimals are strings to preserve precision, binary is a hex string, and UUIDs are their canonical string form. The spec's own example of a required `uuid` field with an `initial-default` of one UUID and a `write-default` of a different one shows the two attributes side by side.

**Backward compatibility is one-directional.** The spec notes that `write-default` is forward-compatible, because only writers use it, and that an old writer that does not understand it will fail on a required field it cannot populate. `initial-default` is readable by old readers only when it is null for optional fields. An old reader that does not know about `initial-default` returns null for any missing optional column, which is correct only if the default was null anyway, and fails on a missing required column because it cannot supply a value. A v2-only engine cannot read a v3 table at all, so in practice this is a statement about how v3 implementations must behave, not about mixed-version fleets.

## Type Promotion: Which Changes Are Legal and Why

Changing a column's type without rewriting data is possible only when every existing value is representable in the new type and every existing statistic remains valid. The spec enumerates exactly which promotions meet that bar.

| From | v1 and v2 | v3 and later | Constraint |
|---|---|---|---|
| `unknown` | | any type | The `unknown` type is v3-only and holds only nulls, so anything is a widening |
| `int` | `long` | `long` | |
| `date` | | `timestamp`, `timestamp_ns` | Not to `timestamptz` variants. Out-of-range values must fail at runtime |
| `float` | `double` | `double` | |
| `decimal(P, S)` | `decimal(P', S)` where `P' > P` | same | Precision widens, scale is fixed |

Every entry is a strict widening. `int` to `long` loses nothing. `float` to `double` loses nothing. Widening decimal precision at a fixed scale adds digits on the left. `date` to `timestamp` maps a day to midnight of that day. The excluded promotions are the ones that change meaning: `date` to `timestamptz` is forbidden because a timestamp with time zone needs a zone to interpret midnight, and the data does not carry one. `long` to `string` is forbidden because it changes the byte encoding of every value and every statistic.

The statistics point is where the spec gets interesting. Manifests store `lower_bounds` and `upper_bounds` as raw bytes keyed by field ID, without recording the type the bytes were written in. After `float` is promoted to `double`, old manifest entries still hold 4-byte float bounds while new entries hold 8-byte double bounds. A reader has to know which is which. The spec resolves this by byte length: a `double` column with a 4-byte bound was written as `float`, a `long` column with a 4-byte bound was written as `int`, a `timestamp` column with a 4-byte bound was written as `date`. For decimals, any bound with precision at or below the current precision is valid and decodes with the same scale. This inference table is the reason promotion is limited to pairs whose encodings are distinguishable by length.

There is one more constraint, and it involves partitioning. Type promotion is not allowed on a field that is the source of a partition transform if promoting changes the transform's output. The spec's example is `bucket[N]`, which hashes the value's bytes. The hash of `34` as an int and `34` as a long are identical by design, because the spec mandates that int and long hash the same. The hash of `34` as an int and `"34"` as a string are different. So an `int` bucket source can be promoted to `long` but never to `string`. The one legal promotion that trips this rule is `date` to `timestamp` on a bucketed date column, because bucketing a day and bucketing a microsecond timestamp produce different hashes. That promotion fails.

Iceberg v3 added `unknown` as a type precisely to make one more kind of evolution possible. A column of type `unknown` can hold only nulls. It exists so that a writer inferring schema from data with an all-null column has somewhere to put it, and so that the column can later be promoted to whatever type the data turns out to have once non-null values arrive.

## What a Schema Change Writes to Metadata

Every schema operation in Iceberg produces the same kind of result: a new schema object appended to the `schemas` list in table metadata, a new `schema-id`, and `current-schema-id` updated to point at it. The old schemas stay in the list forever, because old snapshots reference them by ID and time travel needs them.

The operations allowed on any struct, including the top-level schema, are: add a field, delete a field, rename a field, reorder fields, and promote a primitive type using the table above. Each maps to a small change in the JSON.

**Add** appends a field object with a fresh ID from `last-column-id + 1` and, in v3, its defaults. Nested types inside the new field get their own fresh IDs. `last-column-id` advances by the number of IDs consumed.

**Delete** removes the field object from the new schema. The ID is never reused. The spec adds a rule that deletion cannot be rolled back unless the field was nullable or the current snapshot has not changed since the delete. The reasoning: if a required field was deleted and new files were written without it, restoring the field makes those files invalid, because required fields must be present in every file.

**Rename** changes the `name` attribute and nothing else. The ID is unchanged.

**Reorder** changes the position of the field object in the `fields` list and nothing else.

**Promote** changes the `type` attribute to the wider type. Bounds in existing manifests are not rewritten and are decoded using the length-inference rule.

Some transformations are explicitly forbidden because no ID-preserving mapping exists. You cannot group a subset of a struct's fields into a new nested struct, and you cannot flatten a nested struct's fields into its parent. `struct<a, b, c>` cannot become `struct<a, struct<b, c>>` or the reverse. You cannot turn a primitive into a struct or a single-field struct into a primitive. `map<string, int>` cannot become `map<string, struct<int>>`. Every one of these changes the type tree in a way that gives an existing ID a different shape, and readers have no rule for reconciling that.

In practice, a schema change is one commit. The engine reads current metadata, builds the new schema, writes a new `vN.metadata.json` file with the appended schema and updated pointers, and swaps the catalog's metadata pointer with an atomic compare-and-swap against the previous version. Concurrent schema changes race on that swap, and the loser retries against the new base or fails with a commit conflict. Two engineers adding two different columns at the same moment both succeed, with the second one rebasing onto the first, and each new column gets a distinct ID because the second commit reads the first commit's `last-column-id`.

## Walkthrough: Adding a Required Column With a Default

This section shows the metadata before and after a single operation and the code that produces it.

Start with a v3 table `orders` whose `last-column-id` is 7 and whose current schema has ID 1. An engineer adds a required `channel` column with a default of `'web'`. Through the Java API, which is the reference implementation every engine either uses or mirrors:

```java
import org.apache.iceberg.Table;
import org.apache.iceberg.expressions.Literal;
import org.apache.iceberg.types.Types;

Table table = catalog.loadTable(TableIdentifier.of("sales", "orders"));

table.updateSchema()
    .addRequiredColumn(
        "channel",
        Types.StringType.get(),
        Literal.of("web"))   // sets both initial-default and write-default
    .commit();
```

The `addRequiredColumn` overload that takes a `Literal` is the v3 API. It sets `initial-default` and `write-default` to the same value, which is the only way a required column can be added to a table with data. Calling the two-argument overload without a default on a table that already has rows fails validation, because old files have no value for a required field and no default to fall back on.

In SQL, engines that support v3 defaults accept the standard clause. Dremio and Databricks accept `DEFAULT` on `ADD COLUMN` for write defaults, and Databricks documents that it does not support initial defaults, so a column added there with a default reads as null for old rows. Spark's SQL layer gained default-value schema conversion in Iceberg 1.11. Check your engine, because "supports v3" and "supports both defaults" are not the same claim.

After the commit, the new metadata file differs from the old in four places. The `schemas` list has a new entry with `schema-id: 2`. `current-schema-id` is 2. `last-column-id` is 8. And the new schema contains:

```json
{
  "id": 8,
  "name": "channel",
  "required": true,
  "type": "string",
  "initial-default": "web",
  "write-default": "web"
}
```

Nothing under the table's data directory changed. Every manifest still references the same files. A query against the current snapshot selects field 8, finds it missing from every file, and returns `"web"` for every row via projection rule three. A query with `VERSION AS OF` an older snapshot uses schema 1, which has no field 8, and returns seven columns.

To change the write default later:

```java
table.updateSchema()
    .updateColumnDefault("channel", Literal.of("app"))
    .commit();
```

This produces schema 3 with `write-default: "app"` and `initial-default` still `"web"`. Files written from now on that omit `channel` store `"app"` physically. Old files still resolve to `"web"`. Nothing was rewritten, and the history of what the default was at each point is preserved in the schemas list.

To see the effect at the file level, read a Parquet footer from before and after with PyArrow:

```python
import pyarrow.parquet as pq

old = pq.read_schema("s3://lake/orders/data/00042-old.parquet")
new = pq.read_schema("s3://lake/orders/data/00098-new.parquet")

print([ (f.name, f.metadata.get(b"PARQUET:field_id")) for f in old ])
print([ (f.name, f.metadata.get(b"PARQUET:field_id")) for f in new ])
```

The old file lists seven columns with field IDs 1 through 7. The new file lists eight, with `channel` at field ID 8 and a physical `"app"` or `"web"` value in every row. The reader never needs to know which file is which. It asks for ID 8, gets it from the new file, and defaults it for the old one.

## Failure Modes: The Silent Ones

Because schema evolution in Iceberg is designed never to fail loudly for legal changes, the problems that do occur are quiet. These are the ones to watch for.

**Dropping and re-adding a column and expecting the old data back.** An engineer drops `discount_pct`, realizes the mistake, and adds `discount_pct` again. The new column has a new ID. Every old file's `discount_pct` is under the retired ID and is unreachable. The data is still in the files, but no schema will ever ask for it. The only recovery is rolling back to the snapshot before the drop, which is possible if nothing has been committed since and the field was nullable. Otherwise the recovery is a rewrite that reads the files by name outside Iceberg. The lesson is that `DROP COLUMN` is the one schema operation to treat as destructive even though it touches no files.

**Files without field IDs and no name mapping.** After `add_files` or a Hive migration, if `schema.name-mapping.default` was not set, every column in the imported files resolves to null, because rule two finds no mapping and rule three finds no default. The table appears to have rows but every column is empty. Setting the name mapping fixes it instantly with no rewrite, but the failure is confusing the first time.

**A name mapping that goes stale.** If imported files are still arriving and a column in the Iceberg schema is renamed, the name mapping still points the old file column name at the right ID, which is correct. But if a new column is added to the imported files and never added to the mapping, it resolves to null. Name mappings need to be maintained as long as unmapped files keep arriving.

**Required columns and engines that ignore `initial-default`.** If one engine in your fleet does not implement initial defaults, it returns null for a required column in old files, and depending on the engine that is either a null in a NOT NULL column or a hard read failure. Adding a required column with a default is safe only when every reader honors the default.

**Promotion on a bucketed column.** Promoting a bucketed `date` column to `timestamp` is rejected. The error is clear, but teams sometimes work around it by dropping the partition field, promoting, and re-adding the partition field. That produces a new partition spec, and files written under the old spec are no longer bucketed the same way as new files. Queries stay correct, because Iceberg handles partition evolution, but bucket-based join optimizations stop applying across the boundary.

**Hive Metastore positional checks.** When the catalog is a Hive Metastore, HMS validates schema changes by comparing column types positionally. Adding a column with `FIRST` or `AFTER`, reordering, or dropping a non-last column trips that check and fails, even though Iceberg itself is fine with it. The fix is disabling `hive.metastore.disallow.incompatible.col.type.changes` on the metastore. This is the catalog getting in the way of the format.

**Writers that skip known fields.** A writer that omits a column from its output files because the caller did not provide it is violating the spec. Readers then rely on `write-default` at read time, which is not a defined behavior, and different engines fill the gap differently. The spec's rule that every known field is written exists to make files self-sufficient. A writer that breaks it produces files that read correctly in one engine and not in another.

**Bound decoding after promotion in custom tools.** A homegrown metadata scanner that decodes `lower_bounds` for a `long` column as 8-byte values crashes or returns garbage on 4-byte bounds left over from when the column was an `int`. Any tool that reads manifest bounds directly has to implement the length-inference table.

## Operational Guidance

The mechanics above translate into a short list of habits that keep schema evolution safe.

**Prefer rename over drop-and-add.** If a column's meaning is changing, rename it and add a new one. The old ID keeps its data reachable under the old name, and the new ID starts clean. Reserve `DROP COLUMN` for columns you are certain nobody needs, and tag the snapshot before dropping so a rollback target exists.

**Set both defaults deliberately.** When adding a column, decide what old rows should say (`initial-default`) and what new rows should say when unspecified (`write-default`). They are usually the same value at first, but choosing null for one and a value for the other is legitimate: null `initial-default` means "unknown for historical rows" and a non-null `write-default` means "assume this going forward."

**Treat required-with-default as a fleet-wide decision.** Before adding a required column with a default, confirm every engine that reads the table honors `initial-default`. If one does not, add the column as optional with a `write-default` and enforce non-null at the application layer until the engine catches up.

**Audit name mappings on imported tables quarterly.** Any table that was migrated or that receives files through `add_files` has a name mapping that has to track both the source files and the Iceberg schema. Compare the mapping to a sample of recent source file footers and to the current schema.

**Keep `last-column-id` visible in monitoring.** A table whose `last-column-id` is far ahead of its current field count has had a lot of drops. That is not wrong, but it is a signal to check that the drops were intentional and that nobody is waiting for data that is now under a retired ID.

**Know your promotion paths before choosing initial types.** If a key has any chance of overflowing `int`, start with `long`, because `int` to `long` is free but the reverse is impossible. If a measure has any chance of needing more precision, start with a wider decimal precision, because precision widens and scale never changes. If a timestamp column has any chance of needing a zone later, start with `timestamptz`, because `timestamp` cannot be promoted to it.

**Expire schemas only by expiring snapshots.** Old schemas in the `schemas` list are harmless. They are small and they are needed for time travel. They disappear from active use when every snapshot that references them is expired, and the reference implementation prunes unreferenced schemas from metadata during commits. Do not hand-edit the list.

## Where the Ecosystem Is Heading

The v3 additions to schema evolution are recent enough that engine support is still filling in, and the next spec version continues in the same direction.

**Engine coverage for defaults.** Reading `initial-default` is required for v3 conformance and every engine that reads v3 tables implements it. Writing defaults through SQL DDL is arriving engine by engine, and the split between engines that support write defaults only and engines that support both is closing. Expect `ALTER TABLE ... ADD COLUMN ... DEFAULT` to behave identically across Spark, Flink, Trino, Dremio, and the commercial warehouses within a couple of release cycles.

**Typed statistics in v4.** Format version 4 moves per-column statistics out of byte-keyed maps and into typed structs, where each field's stats struct gets an ID range of 200 starting at `10,000 + 200 * field-id`. The 4-byte-versus-8-byte inference rule for promoted bounds goes away in v4, because the stats struct records the bound in the field's current type. This is a direct cleanup of the promotion mechanics described above.

**More promotion paths.** With v3's `unknown` and v4's typed stats, the community has discussed additional widenings that were previously blocked by the bound-decoding problem, such as `int` to `decimal` or `string` to `variant`. None are in the spec today, and the byte-length inference constraint is the reason. Watch the dev list for proposals that become possible once v4 tables are common.

**Variant shredding interacts with field IDs.** Shredded `variant` columns store frequently accessed paths as typed Parquet subcolumns. Those subcolumns get IDs from the table's column ID space so that manifests can carry statistics for them. This is another place where the ID counter and the projection rules extend to a new kind of column without a new mechanism.

**Schema evolution through REST catalogs.** The REST catalog protocol sends schema changes as a list of requirements and updates, where the requirement asserts the expected `last-column-id` or current schema ID and the update carries the new schema. This is the same optimistic concurrency the file-based commit uses, expressed as an API, and it is how multi-engine schema evolution stays consistent through Apache Polaris and other REST implementations.

## Conclusion

Iceberg's schema evolution is fast because it never touches data, and it never touches data because the spec separates a column's identity from its name, its position, and its presence in any given file. A field ID is assigned once from a table-wide counter and never reused, it is stored in every data file's footer, and readers match on it alone. A column that a file lacks is resolved through a fixed procedure: partition value, then name mapping, then `initial-default`, then null. Type changes are limited to widenings whose byte encodings can be told apart by length. And every schema change is one appended object in a list, one pointer update, and one atomic swap.

The v3 defaults complete the picture. `initial-default` gives historical rows a value without a rewrite and is frozen so history cannot be rewritten later. `write-default` gives writers a fallback and is materialized into files so no reader ever depends on it. Together they give Iceberg the same `ADD COLUMN ... DEFAULT` semantics a relational database has, on tables that are orders of magnitude larger.

The mechanism rewards understanding. Rename instead of dropping. Set both defaults on purpose. Start with the wider type. Maintain name mappings on imported files. Do those things and schema changes stay what they are supposed to be: a metadata commit that finishes before you can switch windows.

## Keep Going

If this piece was useful, I have written a lot more on Iceberg's metadata layer and how its design decisions play out in production. *Apache Iceberg: The Definitive Guide* from O'Reilly walks through schemas, field IDs, partition specs, and the commit protocol in the depth this article builds on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
