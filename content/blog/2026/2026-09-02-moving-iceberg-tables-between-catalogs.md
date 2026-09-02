---
title: "Moving Iceberg Tables Between Catalogs Without Rewriting Data"
date: "2026-09-02"
description: "Why moving Iceberg tables between catalogs is a pointer copy, and the protocol that makes a cutover safe for one table or thousands."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Catalogs
  - Migration
  - Polaris
  - PyIceberg
canonical: https://iceberglakehouse.com/posts/moving-iceberg-tables-between-catalogs/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/moving-iceberg-tables-between-catalogs/).

A platform team has 3,000 Iceberg tables in a Hive Metastore and 900 terabytes of Parquet behind them. They are moving to a REST catalog. Someone on the team asks how long the copy will take, and someone else starts pricing out the egress. Both questions are the wrong questions. An Iceberg table is not stored in its catalog. The catalog stores one string per table: the path of the current metadata file. Moving a table between catalogs means writing that string into a new catalog and deleting it from the old one. The 900 terabytes do not move.

That is the whole idea, and it is simple enough that people distrust it. The distrust is healthy, because while the operation is a pointer copy, the surrounding protocol has real hazards. Register a table in two catalogs at once and two engines commit divergent metadata to the same directory. Drop the table from the old catalog with the wrong flag and the catalog deletes every data file. Pick the wrong metadata file to register and the new catalog starts from a snapshot that is three days stale.

This article explains what a catalog actually owns, how the register operation works across the Java API, PyIceberg, Spark SQL, and the REST protocol, how to run a cutover safely for one table and for thousands, what each catalog implementation does differently, and what to do when the storage has to move too. I work at Dremio, whose catalog is built on Apache Polaris, but the mechanics are the same for every catalog that follows the spec.

## What a Catalog Actually Owns

The Iceberg spec defines a table as a tree of files rooted at a metadata file. The metadata file is JSON. It holds the table's UUID, location, schemas, partition specs, sort orders, properties, and a list of snapshots, each pointing at a manifest list, which points at manifests, which point at data files and delete files. Everything about the table's state lives in that tree, on storage, under the table's location.

The catalog's job is narrower than most people assume. The spec describes it as the component that provides atomic swaps of the current metadata pointer. A catalog maps a table identifier, meaning a namespace plus a name, to the location of the current metadata file, and it guarantees that updating that mapping is atomic: a commit replaces the pointer from the expected old value to the new value, or fails if someone else got there first. That compare-and-swap is what makes concurrent writers safe. It is the entire correctness contract.

Different catalog implementations store the pointer in different places, and this is the detail that matters for migration.

| Catalog | Where the pointer lives | Atomicity mechanism |
|---|---|---|
| Hive Metastore | Table parameter `metadata_location`, with `previous_metadata_location` alongside | HMS table lock or `alter_table` with expected value |
| AWS Glue | Table parameter `metadata_location` | Glue `UpdateTable` with version ID check |
| JDBC | A row in the `iceberg_tables` table with `metadata_location` | SQL transaction with expected old value |
| Hadoop (file-based) | `version-hint.text` in the metadata directory, naming the latest `vN.metadata.json` | Atomic rename, where the filesystem supports it |
| Nessie | A commit on a branch containing the table's metadata location | Git-style commit against an expected branch hash |
| REST (Polaris, Gravitino, Unity, others) | Whatever the server chooses. Clients only see `metadata-location` in responses | Server-side, expressed to clients as requirements on the update request |

Every one of these is a single string per table, plus a few catalog-specific properties. None of them contains schema, snapshots, or file lists. Those are all in the metadata file the pointer names. This is why the catalog is replaceable: if you know the current metadata file's path, you can reconstruct the catalog entry from nothing.

There are two things a catalog holds beyond the pointer. Namespaces, which are logical groupings and which some catalogs give properties. And in REST catalogs, access control, credential vending policies, and in Polaris the storage configuration that says which locations the catalog is allowed to touch. None of those are part of the table. They have to be recreated on the target side, and the migration plan needs to account for them, but they are configuration, not data.

## The Register Operation

Every Iceberg catalog client exposes a way to create a catalog entry for a metadata file that already exists. The operation reads the metadata file, validates that it parses, and writes the pointer. Nothing is copied. Nothing is rewritten.

In the Java API, the `Catalog` interface has `registerTable`:

```java
Table table = targetCatalog.registerTable(
    TableIdentifier.of("sales", "orders"),
    "s3://lake/warehouse/sales.db/orders/metadata/00212-6f1c-...-a9e2.metadata.json"
);
```

In Spark SQL with the Iceberg extensions, it is a procedure:

```sql
CALL polaris.system.register_table(
  table         => 'sales.orders',
  metadata_file => 's3://lake/warehouse/sales.db/orders/metadata/00212-6f1c-...-a9e2.metadata.json'
);
```

The procedure returns the current snapshot ID, total record count, and total data file count of the newly registered table, which is the first verification step: those numbers should match what the source catalog reports.

Trino has its own procedure with a different signature. It takes the table location rather than the metadata file, and optionally the metadata file name within that location's `metadata` directory. Without the file name it picks the newest metadata file it can find, which is the stale-file hazard covered later, so always pass it:

```sql
CALL iceberg.system.register_table(
  schema_name        => 'sales',
  table_name         => 'orders',
  table_location     => 's3://lake/warehouse/sales.db/orders',
  metadata_file_name => '00212-6f1c-...-a9e2.metadata.json'
);
```

The Trino connector also requires the `iceberg.register-table-procedure.enabled` catalog property to be set, and it applies the same rule that the table must not already exist in the catalog.

In PyIceberg:

```python
from pyiceberg.catalog import load_catalog

target = load_catalog("polaris")
table = target.register_table(
    "sales.orders",
    "s3://lake/warehouse/sales.db/orders/metadata/00212-6f1c-...-a9e2.metadata.json",
)
print(table.current_snapshot().snapshot_id)
```

And at the REST protocol level, which is what every REST client above sends under the hood:

```http
POST /v1/{prefix}/namespaces/sales/register
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "orders",
  "metadata-location": "s3://lake/warehouse/sales.db/orders/metadata/00212-6f1c-...-a9e2.metadata.json"
}
```

The server responds with the full table metadata and the metadata location it recorded. Some servers accept an `overwrite` flag to replace an existing entry. Most reject registration when the identifier already exists, which is the safer default.

What the server does on receipt is worth spelling out. It fetches the metadata file from storage using its own credentials, parses it, checks that the table location is somewhere it is permitted to manage, and inserts a row. Polaris also verifies the location against the catalog's allowed-locations list, which is the source of the most common registration error, covered below. No server rewrites the metadata file on registration. The file the source catalog pointed at is the same file the target catalog now points at, byte for byte.

The Spark procedure's documentation carries a warning that deserves to be quoted in spirit: having the same metadata file registered in more than one catalog leads to missing updates, data loss, and table corruption. Use registration only when the table is no longer in the source catalog or when you are in the middle of moving it. That warning is the subject of the next section.

## Why Two Catalogs Pointing at One Table Is Corruption Waiting to Happen

Registration copies a pointer. It does not link the two catalogs. After registration, the source catalog has a row saying `sales.orders` is at metadata file 212, and the target catalog has a row saying the same thing. Each catalog's compare-and-swap operates on its own row.

Now a Spark job commits through the source catalog. It reads metadata 212, writes a new snapshot, writes metadata 213, and swaps the source pointer from 212 to 213. The source catalog's CAS succeeds, because the source row still said 212. The target catalog still says 212. It has no idea 213 exists.

A Trino query commits through the target catalog. It reads metadata 212, writes a different snapshot, writes its own metadata 213 (Iceberg metadata file names include a version number and a UUID, so the two files have different names but the same version), and swaps the target pointer. The target's CAS succeeds, because the target row still said 212.

The table now has two heads. Two metadata files, each descending from 212, each with a snapshot the other does not know about. Both point at manifests that reference data files in the same directory. Neither catalog reports an error. A reader through the source sees one set of rows. A reader through the target sees another. The next compaction through either catalog rewrites files the other catalog's snapshots still reference, and now one lineage has dangling file references and fails on read.

There is no repair short of picking one head, discarding the other's commits, and cleaning up. The divergence is invisible until it is expensive. Every migration protocol below exists to ensure the two-pointer window is either zero or write-free.

## A Safe Cutover Protocol for One Table

The protocol has six steps and one invariant: at no point are writes possible through both catalogs.

**1. Freeze writes through the source.** Stop the pipelines that commit to this table. Revoke write permissions in the source catalog if it supports that, which is a stronger guarantee than trusting that every job was paused. Reads can continue.

**2. Capture the current metadata location from the source.** Do not construct it. Read it. In Spark against the source catalog, `SELECT * FROM source.sales.orders.metadata_log_entries ORDER BY timestamp DESC LIMIT 1` returns the latest metadata file. In PyIceberg, `catalog.load_table("sales.orders").metadata_location` returns it. In HMS or Glue you can read the `metadata_location` table parameter directly. Record the current snapshot ID and record count alongside it.

**3. Confirm the target can read the location.** Before registering, verify that the target catalog's credentials and, for Polaris, its allowed-locations configuration cover the table's storage prefix. For a REST catalog with credential vending, the vended credentials for this table need to be scoped to the old prefix, which is not where the catalog's default location is. This is a configuration step on the target, and doing it before registration turns a mid-migration failure into a pre-migration one.

**4. Register in the target.** Use the metadata location from step 2. Compare the returned snapshot ID and record count with what you captured. If they differ, stop. Something committed after you captured, or you registered the wrong file.

**5. Redirect readers and writers to the target.** Update engine configurations, pipeline connection strings, BI tool connections. For a REST catalog this is often one URI change. Verify with a read through the target and a small write through the target, then confirm the target's snapshot advanced and the source's did not.

**6. Remove the entry from the source without purging.** This is the step that has ended careers. `DROP TABLE sales.orders` in Spark against an Iceberg catalog defaults to dropping the catalog entry only. `DROP TABLE sales.orders PURGE` deletes the catalog entry and every data and metadata file the table references. On the source catalog, after the table is live in the target, `PURGE` deletes the table out from under the new catalog. Use the Java `catalog.dropTable(identifier, false)` where the boolean is `purge`, or PyIceberg's `catalog.drop_table` which does not purge, or the plain SQL form. Read the engine's documentation for the default before running anything, because a few engines default to purge for tables they consider managed.

After step 6 the invariant holds again: one catalog, one pointer. Unfreeze writes.

The window between step 4 and step 6 is the two-pointer window. Step 1 makes it write-free. If you cannot freeze writes, do not register. Wait until you can.

## Bulk Migration and the Iceberg Catalog Migrator

Running the protocol above by hand for 3,000 tables is not realistic, and the community has a tool for it. The Iceberg Catalog Migrator lives in the `apache/polaris-tools` repository, and despite the home it works with every Iceberg catalog as source and target, not only Polaris.

It has two commands. `register` reads every table in the source catalog (or a selected namespace or identifier list), and registers each one in the target with the same identifier. It leaves the source entries in place, which means every table is in the two-pointer state until you clean up. `migrate` does the same registration and then deletes each table's entry from the source after the target registration succeeds, which closes the window per table. The README says what the Spark warning says: operating the same table from both catalogs corrupts it, so use `migrate`, or if you use `register`, never write through the source again.

A typical invocation moving a Hive Metastore's tables into a Polaris REST catalog:

```bash
java -jar iceberg-catalog-migrator-cli.jar migrate \
  --source-catalog-type HIVE \
  --source-catalog-properties \
    uri=thrift://hms.internal:9083,warehouse=s3a://lake/warehouse/,io-impl=org.apache.iceberg.aws.s3.S3FileIO \
  --target-catalog-type REST \
  --target-catalog-properties \
    uri=https://polaris.internal/api/catalog,warehouse=analytics,token=$TOKEN \
  --identifiers-from-file tables-batch-01.txt \
  --output-dir ./migration-logs
```

The tool writes a log of successes and failures per identifier and can be rerun against the failure list. Run it in batches, not all at once, so a configuration problem shows up on the first hundred tables rather than the first three thousand. The `--dry-run` flag lists what it will do without doing it, and the first run should always be a dry run.

Two Polaris-specific settings come up on nearly every HMS-to-Polaris migration. Hive-created namespaces produce directories with a `.db` suffix, such as `sales.db/orders`, and Polaris by default expects table locations to sit under `<catalog-location>/<namespace>/<table>`. Set `ALLOW_UNSTRUCTURED_TABLE_LOCATION` on the Polaris server to accept the Hive layout. And the Polaris catalog's storage configuration must list the source warehouse prefix in `allowedLocations`, or every registration fails with a forbidden error naming the location. Both are one-time configuration on the target, and both are documented in the migrator's examples.

The migrator handles tables only. Views, namespace properties, and access grants are not migrated, and they need a separate plan.

## What Each Catalog Does Differently

The register operation is the same everywhere. What the source and target catalogs do around it is not.

**Hadoop catalog as source.** The file-based catalog has no metadata pointer in a database. The current version is whatever `version-hint.text` says, and the metadata files are named `v1.metadata.json`, `v2.metadata.json`, and so on. Read the hint file, construct the path, and register that file. Be aware that the Hadoop catalog's table identity is its path, so two tables at different paths are different tables even if they were once the same. Also note that the Hadoop catalog is deprecated for production use precisely because its atomicity depends on filesystem rename semantics that object stores do not provide. Migrating off it is the single most common reason to do a catalog move.

**Hive Metastore as source or target.** HMS stores `metadata_location` and `previous_metadata_location` as table parameters and marks the table with `table_type=ICEBERG`. When HMS is the target, registration writes those parameters. When it is the source, read `metadata_location` directly from the parameters rather than trusting a cached engine view. HMS also has the positional-schema-check behavior that rejects some Iceberg schema evolution, which is a reason to move away from it but not a migration concern.

**AWS Glue.** Glue stores the same `metadata_location` parameter. Registration into Glue creates a Glue table with that parameter set. Lake Formation permissions are a Glue-side concept and must be granted on the new entry. Glue-specific table parameters from a source Glue table, such as classification tags, do not travel with the metadata file because they are catalog properties, not table properties.

**Nessie as source or target.** Nessie is a versioned catalog with branches. A table's pointer is content on a branch. Registering into Nessie puts the table on the branch you are connected to, usually `main`. Migrating out of Nessie means choosing which branch's view of the table to register, and the metadata location on `main` is the one to take unless you are deliberately preserving a feature branch. Tables that exist only on non-main branches need to be registered individually from those branches or abandoned.

**Apache Polaris as target.** Beyond allowed locations, Polaris distinguishes internal catalogs, which Polaris manages and vends credentials for, from external catalogs, which point at another catalog's tables read-only. Registration goes into an internal catalog. If your goal is to make tables from another catalog visible through Polaris without moving them, catalog federation is the feature to look at instead of registration, and it avoids the two-pointer problem entirely because the external catalog remains the sole writer.

**Unity Catalog and other managed-table systems.** Some catalogs distinguish tables they manage from tables they reference. Registration of an arbitrary metadata file into a managed-table slot is often unsupported or lands the table as an external reference with restrictions on writes. Read the target's documentation for whether registered Iceberg tables are first-class or read-only before planning a migration into one.

**REST catalogs generally.** The `/register` endpoint is part of the Iceberg REST specification, but a server is free to reject registrations for locations outside its configured storage, for identifiers that already exist, or for metadata files that fail its validation. The client error usually says why. Credential vending is the feature most likely to need configuration: a table registered from an old prefix needs the server able to vend credentials for that prefix, which means the server's storage integration has to cover it.

## What Travels With the Metadata File and What Does Not

Since the metadata file is the table, it pays to know exactly what is inside it before pointing a new catalog at it. Some of it is portable. Some of it quietly assumes the old environment.

**Table UUID.** Every metadata file carries a `table-uuid` assigned at creation. It does not change across catalogs, and the target catalog records it. Some catalogs use it to detect that a registered table is the same table as one they already know about, and a few refuse to register a UUID that already exists in a different namespace. The UUID is also what Iceberg's own commit validation checks, so a metadata file whose UUID differs from the one a client loaded is rejected on commit. This is a safety feature that also means you cannot "fix" a table by registering an unrelated metadata file over it.

**Location.** The `location` field is the table's root directory, and it is absolute. New data files and metadata files are written under it, using the `write.data.path` and `write.metadata.path` properties if set. After registration, the target catalog writes to the same location the source did, which is why the target needs write access to the old prefix. If the target catalog expects tables under its own warehouse root and the table's location is elsewhere, the catalog either rejects the registration or accepts it and writes to the old location forever. Neither is wrong, but the second surprises people who assumed a catalog move meant a storage move.

**Metadata log and snapshot log.** The `metadata-log` lists previous metadata files with timestamps, and the `snapshot-log` lists snapshot IDs with timestamps. Both are absolute paths and both come along. They are what make `metadata_log_entries` and `history` metadata tables work after migration, and they are what a time-travel query uses. Nothing in them needs to change.

**Refs: branches and tags.** Format version 2 and later store named references in a `refs` map, with `main` as the default branch. Every branch and tag travels with the file, along with its retention settings. An engine reading through the target sees the same branches as one reading through the source. This is also a trap: if a team was using a branch in the source for write-audit-publish and the migration happens mid-cycle, the unpublished branch comes along unpublished. Finish or abandon in-flight branch work before cutover.

**Statistics and partition statistics.** The `statistics` and `partition-statistics` lists reference Puffin and stats files by absolute path. They travel, and the target reads them if it has access to the paths. During a storage move, `rewrite_table_path` rewrites these references along with manifests.

**Properties.** The `properties` map travels intact. Properties like `write.format.default`, `commit.retry.num-retries`, `history.expire.max-snapshot-age-ms`, and `schema.name-mapping.default` all keep working. What does not travel is anything the source catalog stored on its own side under the same conceptual name. Glue table parameters and HMS table comments are catalog rows, not table properties.

**Encryption keys.** Tables using Iceberg's table encryption reference key metadata that a key management service resolves. The target catalog's engines need access to the same KMS and the same key IDs, or every file read fails after registration with an error that looks like corruption and is actually a permissions gap.

A pre-flight inspection catches most of these before registration. Read the metadata file directly and check the fields that matter:

```python
import json
import fsspec

def preflight(metadata_location):
    with fsspec.open(metadata_location, "rb") as f:
        meta = json.load(f)
    print("format-version:", meta["format-version"])
    print("table-uuid:", meta["table-uuid"])
    print("location:", meta["location"])
    print("current-snapshot-id:", meta.get("current-snapshot-id"))
    print("refs:", list(meta.get("refs", {}).keys()))
    print("statistics files:", len(meta.get("statistics", [])))
    print("metadata-log entries:", len(meta.get("metadata-log", [])))
    props = meta.get("properties", {})
    for k in ("write.data.path", "write.metadata.path",
              "schema.name-mapping.default", "encryption.key-id"):
        if k in props:
            print("property", k, "=", props[k][:80])

preflight("s3://lake/warehouse/sales.db/orders/metadata/00212-6f1c-...-a9e2.metadata.json")
```

The output tells you the format version the target must support, the location the target must be able to write to, whether there are branches beyond `main` to reconcile, whether statistics files exist at paths the target must read, whether custom write paths point somewhere unexpected, and whether encryption is in play. Five minutes per namespace of running this across a sample of tables prevents most of the failure modes below.

## Walkthrough: Migrating a Namespace With Verification

This script moves every table in one namespace from a Glue catalog to a Polaris REST catalog, verifies each one, and drops the source entry only after verification passes. It uses PyIceberg so that it runs without a Spark cluster.

```python
from pyiceberg.catalog import load_catalog

source = load_catalog(
    "glue",
    **{"type": "glue", "glue.region": "us-east-1"},
)
target = load_catalog(
    "polaris",
    **{
        "type": "rest",
        "uri": "https://polaris.internal/api/catalog",
        "warehouse": "analytics",
        "credential": "client-id:client-secret",
        "scope": "PRINCIPAL_ROLE:ALL",
        "header.X-Iceberg-Access-Delegation": "vended-credentials",
    },
)

namespace = ("sales",)
if not target.namespace_exists(namespace):
    target.create_namespace(namespace)

report = []
for identifier in source.list_tables(namespace):
    src_table = source.load_table(identifier)
    metadata_location = src_table.metadata_location
    src_snapshot = src_table.current_snapshot()
    src_snapshot_id = src_snapshot.snapshot_id if src_snapshot else None

    # Register the exact file the source points at. Never construct a path.
    tgt_table = target.register_table(identifier, metadata_location)
    tgt_snapshot = tgt_table.current_snapshot()
    tgt_snapshot_id = tgt_snapshot.snapshot_id if tgt_snapshot else None

    if tgt_snapshot_id != src_snapshot_id:
        report.append((identifier, "MISMATCH", src_snapshot_id, tgt_snapshot_id))
        continue

    # Read-side check through the target: a scan plan should resolve every file.
    files = list(tgt_table.scan().plan_files())

    # Close the two-pointer window. drop_table in PyIceberg does not purge.
    source.drop_table(identifier)
    report.append((identifier, "OK", src_snapshot_id, len(files)))

for row in report:
    print(row)
```

Each part of this does a specific job. Loading the source table and reading `metadata_location` gets the real pointer rather than a guess. Capturing the snapshot ID before registering gives a value to compare against. `register_table` on the target is the pointer write. Comparing snapshot IDs catches both a stale registration and a concurrent commit. Planning a scan through the target exercises the target's credentials against every manifest and data file path, which is where a missing allowed-location or an under-scoped vended credential shows up. And dropping from the source only after all of that passes means a table that fails any check stays in the source, untouched, for a retry.

What the script does not do is freeze writes. That has to happen outside it, before it runs, by pausing pipelines and removing write grants on the source. It also does not migrate namespace properties or grants, which need their own step.

For a Spark-based variant of the same thing, `register_table` in the target catalog followed by `DROP TABLE` without `PURGE` in the source catalog per table is the equivalent, and the `metadata_log_entries` metadata table is where the source's current metadata file comes from.

## When the Storage Has to Move Too

Sometimes the catalog move comes with a storage move: a new bucket, a new region, a new cloud. Registration alone does not handle this, because Iceberg metadata in format versions 1 through 3 stores absolute paths. Every manifest list names manifests by full URI, every manifest names data files by full URI, and every metadata file names its manifest lists the same way. Copy the directory to a new bucket and register the copied metadata file, and every path inside it still points at the old bucket.

The `rewrite_table_path` procedure exists for this. It stages a copy of every metadata file, manifest list, manifest, and position delete file with a source prefix replaced by a target prefix, and it produces a CSV listing every file that needs to be copied, including the data files it did not touch:

```sql
CALL source_catalog.system.rewrite_table_path(
  table         => 'sales.orders',
  source_prefix => 's3://old-lake/warehouse/sales.db/orders',
  target_prefix => 's3://new-lake/warehouse/sales/orders'
);
```

The procedure returns the name of the latest rewritten metadata file, the path to the file list, and counts of rewritten manifests and delete files. The staged metadata lands in a staging directory under the table's metadata folder by default. The procedure copies nothing itself. You take the file list, run the copy with your storage tool of choice, and then register the rewritten latest metadata file, now at its target path, in the target catalog.

The procedure supports an incremental mode with `start_version` and `end_version`, which rewrites only the metadata added between two versions. This is how a large table gets moved without a long write freeze: do a full rewrite and copy while the table is live, then freeze, do an incremental rewrite for the commits since, copy the small delta, register, and cut over.

Format version 4 changes this picture. v4 introduces relative paths, where a data file's path is stored relative to the table location and joined at read time. A v4 table whose metadata uses relative paths can be copied to a new prefix and registered directly, with no path rewrite. Tables upgraded from v3 keep their absolute paths until their metadata is rewritten, so the benefit arrives for new tables first.

## Failure Modes

The pointer copy is simple. The things around it are where migrations fail.

**Registering a stale metadata file.** Someone lists the metadata directory, picks the file with the highest number, and registers it. The catalog pointer was three files behind because a failed commit wrote metadata files that never became current. Or someone registers from a note written yesterday. Either way the target starts from an old snapshot, and every commit since is orphaned. The fix is to always read the pointer from the source catalog at registration time, never from a listing or a note.

**Writes that were not actually frozen.** A pipeline nobody remembered commits through the source after registration. The two heads diverge. The symptom appears days later as a row count discrepancy between engines. Freezing writes means removing the ability to write, not asking people to stop.

**Dropping with purge.** Covered above, and worth repeating: `PURGE` on the source after registration deletes the target's data. Check the engine's default. Prefer API calls where the purge flag is an explicit boolean.

**Target cannot access the storage prefix.** Registration succeeds because the server only needed to read the metadata file, and the server's own credentials covered that. The first query through the target fails because vended credentials are scoped to the catalog's default location and the table lives elsewhere. On Polaris this presents as a forbidden error naming the location. On other REST catalogs it presents as an access-denied from the object store. Fix the storage configuration, then the vended credential scope.

**Orphan cleanup from the wrong side.** A scheduled `remove_orphan_files` job on the source catalog runs after the table was dropped there. It finds no table and does nothing, which is fine. But a job configured by location rather than identifier, or a job that runs against a source-side table that was registered but not yet dropped, treats files written through the target as orphans and deletes them. Disable maintenance jobs on the source before starting, and re-enable them on the target after.

**Views left behind.** Iceberg views are catalog entries with their own metadata files, and the migrator does not move them. Queries that depended on views fail after cutover. Inventory views separately and re-create them in the target, or register their view metadata if the target supports view registration.

**Identifier case and namespace depth.** Some catalogs are case-insensitive and some are not. Some support multi-level namespaces and some flatten them. A table `Sales.Orders` in HMS becomes `sales.orders` in a case-folding target, and a nested namespace `finance.eu.reporting` has no representation in a two-level catalog. Check the identifier mapping on a dry run before the real run.

**Catalog-specific table properties.** Properties stored in the metadata file's `properties` map travel with the table. Properties the source catalog stored on its side, such as Glue parameters or HMS table comments, do not. If your governance depends on them, extract them before migration and reapply on the target.

**Concurrent migration runs.** Two people run the migrator against overlapping identifier lists. The second registration for a table fails because the identifier exists, which is safe, but if the tool is configured to overwrite, the second run resets the target pointer to whatever the source said at that moment, which is behind if anything was committed through the target in between. Coordinate on a single runner and a single identifier list.

## Operational Guidance

A migration that goes well is one where the verification was designed before the registration.

**Inventory first.** List every table and view in the source, with identifier, current metadata location, current snapshot ID, record count, and table location prefix. This list is both the migration input and the verification baseline. Generate it with a script, not by hand.

**Configure the target completely before touching any table.** Allowed locations, storage integrations for credential vending, namespaces, and access grants for the migration principal. Test with one throwaway table registered from a scratch metadata file and then dropped.

**Migrate in batches by namespace.** A namespace is usually a team or a domain, which means one group of pipeline owners to coordinate the write freeze with. Batch size of a few hundred tables keeps each run short enough to redo.

**Rehearse on a copy, not on the table.** The temptation during planning is to register a production table into the new catalog "just to see if it works" and drop it afterward. That creates the two-pointer state on a live table, and a stray write through either side during the test is a real divergence. The safe rehearsal uses `rewrite_table_path` to stage a full copy of one representative table at a scratch prefix, copies the files, and registers the copy under a scratch identifier in the target. Every check in the cutover protocol can be run against the copy: credential vending on the target, scan planning, a test write, snapshot expiry, compaction. The copy has its own UUID only if you rewrite it, so use a distinct identifier and a distinct location, and drop the copy with purge when done, since nothing else references its files. A rehearsal on a 50-gigabyte table takes an hour and surfaces every configuration gap that a 3,000-table run finds on table one.

**Do the first real batch with the smallest namespace.** After the rehearsal, pick the namespace with the fewest tables and the fewest downstream consumers, and run the full protocol on it end to end, including redirecting its clients and re-enabling maintenance on the target. Let it run for a day. Confirm that scheduled jobs commit through the target, that BI dashboards resolve, and that the source shows no activity. That day of observation is what tells you the client redirect actually reached everyone.

**Verify three things per table.** Snapshot ID matches. Record count matches. A scan plan through the target resolves every file. The third catches permission problems the first two miss.

**Drop from the source only after verification, and never with purge.** Log every drop with the identifier and the metadata location, so a rollback has the information it needs.

**Keep a rollback path for 24 hours.** If nothing has been committed through the target, rollback is registering the same metadata file back into the source and dropping from the target. If commits have happened, rollback is registering the target's current metadata file into the source, which carries the new commits with it. Either way the data never moved, so rollback is another pointer operation.

**Disable maintenance on the source before starting and enable it on the target after.** Snapshot expiry, orphan removal, and compaction all rewrite or delete files. None of them should run against a table in transit.

**Update every client.** Engines, pipelines, BI tools, notebooks, and agents that query through a catalog need the new URI. A client left pointing at the source finds no table, which is a loud failure and the right one.

**Plan grants and views as their own workstream.** They are not part of the table and no table-migration tool moves them. The same is true for namespace-level properties.

## Where the Ecosystem Is Heading

Catalog migration is getting easier, mostly because the catalog layer is converging on the REST protocol and gaining features that reduce the need to move tables at all.

**REST as the common surface.** With Apache Polaris, Apache Gravitino, Unity Catalog, Nessie, and the cloud providers all exposing the Iceberg REST API, source and target increasingly speak the same protocol. A migration between two REST catalogs is `/register` on one side and a drop on the other, with no catalog-specific client libraries, and tooling can be written once.

**Catalog federation instead of migration.** Polaris's external catalogs and the federation work in the community let one catalog present tables that live in another, with the origin catalog remaining the sole writer. For teams that want a single governance and access-control plane over tables managed by several systems, federation removes the reason to migrate. Migration becomes the choice for consolidating ownership, not for consolidating visibility.

**Relative paths in v4.** Storage moves without path rewrites are the most concrete v4 benefit for this topic. As v4 tables become the default, "move to a new bucket" becomes copy plus register, the same as "move to a new catalog."

**Catalog synchronization tools.** The Polaris Synchronizer, also in polaris-tools, copies entities between two Polaris instances, and similar tools for other catalogs are appearing. These are for standby and disaster-recovery topologies rather than one-time migration, and they raise the same two-pointer questions, which they handle by keeping the standby read-only.

**Catalogs as registries for more than tables.** Proposals in the Polaris community to treat the catalog as a registry for tables, views, functions, metrics, and models expand what a migration has to move. The table pointer stays simple. The surrounding inventory gets bigger.

## Conclusion

An Iceberg catalog owns one thing per table: the location of the current metadata file, and the ability to swap it atomically. Everything else about the table lives on storage in a self-describing tree of files. That is why moving a table between catalogs is a pointer operation, and why 900 terabytes stay exactly where they are while 3,000 tables change catalogs.

The register operation is the same across the Java API, PyIceberg, Spark SQL, and the REST protocol. What differs is the protocol around it. Freeze writes so no two catalogs ever both accept a commit. Read the pointer from the source at the moment of registration. Verify snapshot ID, record count, and file resolution through the target. Drop from the source without purging. Configure the target's storage access before the first registration, not after the first failure. For storage moves, rewrite paths first or wait for v4 relative paths. For thousands of tables, use the Iceberg Catalog Migrator in batches with dry runs.

Do that and a catalog migration is an afternoon of configuration and a few hours of scripted registration. Skip the write freeze or drop with purge and it is a recovery project.

## Keep Going

If this piece was useful, I have written a lot more on Iceberg catalogs, the REST protocol, and how Apache Polaris fits into a multi-engine lakehouse. *Apache Polaris: The Definitive Guide* from O'Reilly covers catalog architecture, credential vending, storage configuration, and the migration paths into Polaris in depth. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
