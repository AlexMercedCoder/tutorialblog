---
title: "Disaster Recovery for Iceberg Tables: Replication, Backup, and Restore"
date: "2026-09-02"
description: "Disaster recovery for Iceberg across four tiers: snapshots, object versioning, catalog backup, and cross-region replication."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Disaster Recovery
  - Replication
  - Backup
  - Restore
canonical: https://iceberglakehouse.com/posts/disaster-recovery-for-iceberg-tables/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/disaster-recovery-for-iceberg-tables/).

A region goes dark on a Tuesday. The catalog service is unreachable, the object store returns errors, and the executive dashboard that reads from the lakehouse is blank. The team has a replicated bucket in a second region that they set up eighteen months ago. Someone points an engine at it and the first query fails, because every manifest in the replicated metadata still names files in the original region. The second query fails because the replicated catalog database restored from a nightly dump points at a metadata file that was written six hours after the dump was taken. The third query works, on one table, after someone finds the right metadata file by hand.

That sequence is the normal outcome of a disaster recovery (DR) plan for Apache Iceberg that was designed as if Iceberg were a pile of Parquet files. It is not. An Iceberg table is three things with three different failure modes: a catalog pointer, a tree of metadata files linked by absolute paths, and a set of data files. Protecting one without the others produces a backup that cannot be restored, and the gap only becomes visible during the restore.

This article lays out DR for Iceberg from the mechanism up. It covers the four things that can be lost and what each one needs, how the built-in snapshot model handles logical disasters without any external tooling, how object-store versioning covers accidental deletion, how to back up and restore a catalog, and the three strategies for cross-region replication given that Iceberg metadata stores absolute paths. It ends with a restore walkthrough, a verification script, and the ways DR plans fail in practice. I work at Dremio, whose catalog is built on Apache Polaris, but the mechanics here apply to every catalog and engine.

## What a Disaster Actually Destroys

DR planning starts with an inventory of what can be lost. For an Iceberg table there are four distinct things, and a plan has to cover each.

**The catalog pointer.** The catalog maps a table identifier to the path of its current metadata file, and provides the atomic swap that makes commits safe. If the catalog is lost, every table's metadata and data are intact on storage, but nothing knows where the current metadata file is. Recovery is finding the right file and registering it. Losing the catalog is inconvenient. Losing the catalog with no record of which metadata file was current is a forensic exercise across thousands of tables.

**The metadata tree.** Each metadata file names its manifest lists, each manifest list names its manifests, and each manifest names data files and delete files, all by absolute URI. The tree for one snapshot is a few files. The tree for a table's full history is every file any retained snapshot references. Losing any file in the tree breaks every snapshot that references it. Losing the metadata file breaks the whole table until an earlier metadata file is located.

**The data files.** Parquet, ORC, or Avro files plus Puffin files for deletion vectors and statistics. These are the bulk of the bytes and the least fragile part: they are immutable, they are referenced by many snapshots, and losing one affects only the rows it holds. They are also the part that takes the longest to copy.

**The storage location itself.** A region outage, a bucket deletion, or an account compromise removes all three at once. This is the case most people mean by DR, and it is the one where absolute paths matter most.

The disasters map onto these four in different combinations:

| Disaster | Catalog | Metadata | Data | Location |
|---|---|---|---|---|
| Bad `DELETE` or `MERGE` commits wrong rows | intact | intact | intact | intact |
| `DROP TABLE PURGE` by mistake | entry gone | deleted | deleted | intact |
| Overly aggressive `remove_orphan_files` | intact | intact | some deleted | intact |
| Catalog database corrupted or lost | gone | intact | intact | intact |
| Bucket or prefix deleted | intact | gone | gone | intact |
| Region unavailable | unreachable | unreachable | unreachable | gone |

The first row is a logical disaster and Iceberg handles it natively. The next four are recoverable with storage-level protection and a catalog backup. The last row requires a copy in another region and a way to make that copy's paths resolve. Each gets its own section.

## Tier One: Snapshots Are Your First Backup

Every commit to an Iceberg table produces a new snapshot and leaves the previous ones intact, along with every file they reference, until snapshot expiration removes them. This means a table with a five-day snapshot retention already contains five days of point-in-time backups, at zero additional storage cost beyond the files that changed.

Recovering from a bad commit is a metadata operation. In Spark:

```sql
CALL polaris.system.rollback_to_snapshot('sales.orders', 7168742983117921046);
```

The table's `main` branch now points at that snapshot. The bad commit's snapshot is still in the metadata and still on storage until expiry, so rolling forward again is possible if the rollback turns out to be wrong. `rollback_to_timestamp` does the same thing by time rather than ID, and `set_current_snapshot` moves the pointer to any snapshot including ones not in the current ancestry.

This is also where tags earn their keep. A tag is a named reference to a snapshot with its own retention:

```sql
ALTER TABLE sales.orders CREATE TAG `quarter-close-2026q2`
  AS OF VERSION 7168742983117921046
  RETAIN 3650 DAYS;
```

Snapshot expiration respects tag retention. The quarter-close snapshot and every file it references survive for ten years regardless of the table's default `history.expire.max-snapshot-age-ms`. Tagging is how you turn "we can recover to any point in the last five days" into "we can recover to every month-end for a decade" without a separate backup system. Data files shared between the tagged snapshot and later ones are stored once.

Branches extend this to write isolation. A pipeline that writes to an `audit` branch, validates, and then fast-forwards `main` never exposes a bad commit to readers in the first place. Write-audit-publish is a DR practice as much as a data quality practice, because the cheapest disaster is the one that was never published.

Two properties define the recovery window at this tier. `history.expire.max-snapshot-age-ms` defaults to five days and sets how far back rollback can reach. `history.expire.min-snapshots-to-keep` defaults to one and guarantees a floor even for tables that commit rarely. Raising the age to seven or fourteen days on critical tables costs only the storage for files that were rewritten or deleted in that window, which for append-heavy tables is close to nothing.

The limit of this tier is that it lives inside the table. `DROP TABLE PURGE` deletes every snapshot. A storage-level deletion removes the files snapshots point at. A region outage takes the whole thing offline. Tier one recovers from mistakes in the data. It does not recover from mistakes about the table.

## Tier Two: Object Versioning Covers Deletion

Every major object store supports versioning: a deleted or overwritten object is retained as a prior version rather than destroyed. For Iceberg this is the single highest-value DR setting, and it costs one configuration change per bucket.

Iceberg files are immutable, so versioning rarely stores overwritten copies. What it stores is deletion. When `remove_orphan_files` deletes a data file that was not actually an orphan, or `expire_snapshots` runs against a table whose retention was set too short, or an operator runs `DROP TABLE PURGE` against the wrong identifier, versioning keeps every deleted object as a non-current version behind a delete marker. Recovery is removing the delete markers, which restores the objects in place at their original paths. Because the paths did not change, no metadata rewrite is needed. Restore the objects, re-register the last known metadata file if the catalog entry was dropped, and the table is back.

Object lock, sometimes called immutability or write-once-read-many (WORM) mode, goes further by preventing deletion of a version for a retention period even by an administrator. It is the right setting for buckets holding regulated data, and it is the only protection that survives a compromised administrator credential. The cost is that legitimately expired files cannot be reclaimed until the lock period ends, so the lock period has to be shorter than the storage budget tolerates. Thirty days is a common compromise.

Lifecycle rules complete the picture. Without one, versioning keeps deleted files forever and the bucket grows without bound. A rule that permanently expires non-current versions after thirty days gives a thirty-day undo window for any deletion, after which the bytes are reclaimed. Match this window to the tier-one snapshot retention plus a margin: if snapshots expire after seven days and versions expire after thirty, there are three weeks during which any file that expiry removed is still recoverable.

Two Iceberg procedures deserve specific attention because they are the ones that delete data on purpose. `expire_snapshots` deletes files no longer referenced by any retained snapshot. `remove_orphan_files` deletes files under the table location that no metadata references, and it is the more dangerous of the two because "not referenced" includes files from a commit that is in progress. Its `older_than` parameter defaults to three days precisely to avoid sweeping in-flight writes. Lowering it is the most common cause of self-inflicted data loss on Iceberg, and versioning is what makes that recoverable.

### Walkthrough: Recovering a Purged Table From Versions

The sequence for undoing `DROP TABLE PURGE` on a versioned bucket makes the mechanism concrete. Assume the table lived at `s3://lake-primary/warehouse/sales/orders/` and the purge ran ten minutes ago.

First, confirm what happened. Listing object versions under the prefix shows every deleted object with a delete marker as its current version:

```bash
aws s3api list-object-versions \
  --bucket lake-primary \
  --prefix warehouse/sales/orders/ \
  --query 'DeleteMarkers[?IsLatest==`true`].[Key,VersionId]' \
  --output text | wc -l
```

That count is the number of objects the purge removed. Second, remove the delete markers, which makes the most recent real version current again. For a table with thousands of files this is a loop over the marker list:

```bash
aws s3api list-object-versions \
  --bucket lake-primary --prefix warehouse/sales/orders/ \
  --query 'DeleteMarkers[?IsLatest==`true`].[Key,VersionId]' --output text |
while read key version; do
  aws s3api delete-object --bucket lake-primary --key "$key" --version-id "$version"
done
```

Deleting a delete marker is the object-store idiom for "undelete." Every data file, manifest, manifest list, metadata file, and Puffin file is back at its original path with its original bytes. Third, find the metadata file that was current before the purge. The pointer ledger has it. Without a ledger, list the metadata directory and take the highest-numbered `metadata.json` whose tree verifies. Fourth, register:

```sql
CALL polaris.system.register_table(
  table         => 'sales.orders',
  metadata_file => 's3://lake-primary/warehouse/sales/orders/metadata/00212-6f1c-...-a9e2.metadata.json'
);
```

The table is back, with its full snapshot history, in roughly the time it takes to iterate the marker list. Nothing was copied and no path changed. The same sequence recovers from a bad `remove_orphan_files` run, with the difference that only data files need their markers removed and the catalog entry is still intact, so the final step is unnecessary.

The lifecycle rule's expiry window is the deadline. If non-current versions expire after thirty days, this procedure works for thirty days after the purge and not on day thirty-one.

## Tier Three: Backing Up and Restoring the Catalog

The catalog holds one critical string per table: the current metadata location. Everything else it holds is configuration that can be recreated. A catalog backup is a backup of those strings, taken often enough that the gap between the backup and the current state is acceptable.

How to take it depends on the catalog. A Hive Metastore or a JDBC catalog is a relational database, and its native backup tooling captures the table rows, including the `metadata_location` parameter. AWS Glue supports exporting table definitions and has replication patterns for the Data Catalog. Nessie's backing store, whether RocksDB, DynamoDB, or a relational database, is backed up with that store's tooling and captures every branch's commit history. Apache Polaris stores its entities in a metastore, relational by default, that is backed up the same way as any other database.

Two things go wrong with catalog backups. The first is frequency. A nightly dump of a catalog with tables that commit every five minutes means a restore lands up to a day behind, and each table's actual latest metadata file has to be found by other means. The second is that the dump captures the pointer but not proof that the pointer's target exists. If storage replication is behind, the restored catalog points at a metadata file that has not arrived yet.

The approach that solves both is a pointer ledger: a small job that runs on a short interval, lists every table in the catalog, records each table's identifier and current metadata location with a timestamp, and writes that record to storage in both regions. It is a few lines of PyIceberg:

```python
import json
import time
import fsspec
from pyiceberg.catalog import load_catalog

catalog = load_catalog("polaris")
ledger = []
for namespace in catalog.list_namespaces():
    for identifier in catalog.list_tables(namespace):
        table = catalog.load_table(identifier)
        snapshot = table.current_snapshot()
        ledger.append({
            "identifier": ".".join(identifier),
            "metadata_location": table.metadata_location,
            "snapshot_id": snapshot.snapshot_id if snapshot else None,
            "recorded_at": int(time.time() * 1000),
        })

stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
for prefix in ("s3://lake-primary/dr/ledger/", "s3://lake-dr/dr/ledger/"):
    with fsspec.open(f"{prefix}{stamp}.json", "w") as f:
        json.dump(ledger, f)
```

Run every fifteen minutes, this produces a record that says, for every table, which metadata file was current as of a known time. Catalog restore becomes: read the latest ledger, register every table at its recorded metadata location. The ledger is small, it is stored on the same replicated storage as the tables, and it does not depend on the catalog's own backup mechanism. When the catalog is a REST service in another team's control, the ledger is also the only catalog backup you can take yourself.

The restore side is the register operation. For each ledger entry, call `register_table` with the recorded location, compare the returned snapshot ID to the ledger's, and move on. A few hundred tables register in minutes. The `iceberg-catalog-migrator` tool in `apache/polaris-tools` can bulk-register from a list if a script is not preferred.

One caution: a catalog restored from a ledger is missing every commit that happened after the ledger was taken. Those commits produced newer metadata files on storage, and they are recoverable by listing the table's metadata directory and choosing the newest file whose full tree resolves. That is a manual step, and it is why the ledger interval should be short.

### Warm Standby Catalogs

The ledger-and-register approach assumes the DR catalog is empty until failover. A warm standby goes one step further: a catalog in the DR region that already holds an entry for every table, pointing at the newest verified metadata file in the replica, updated continuously and never written to by anyone but the sync job.

The benefit is recovery time. At failover, there is nothing to register. Engines in the DR region are already configured against the standby catalog, and the only step is lifting the write restriction. For hundreds of tables this turns a twenty-minute registration loop into a permission change.

The hazard is the same two-pointer divergence that catalog migration faces. If any client can commit through the standby while the primary is live, the two diverge. So the standby must be locked down: the sync job's principal has write access to update pointers, and no other principal has anything beyond read. In Apache Polaris this is a catalog role with only read privileges granted to every principal except the sync service. In Nessie it is a branch that only the sync job commits to. In Glue it is an IAM policy on the DR-region catalog.

The sync job itself is the ledger job with one extra step. For each table, it reads the primary's current metadata location, verifies the tree in the replica, and if the tree verifies, updates the standby's pointer. If the standby entry does not exist, it registers. If it exists and points at an older file, it updates. Updating a pointer in a catalog without going through a normal Iceberg commit is catalog-specific: the REST protocol's update-table request with an assert-current-metadata requirement does it, the Java `registerTable` with an overwrite option does it on catalogs that allow it, and for HMS or Glue it is a direct table-parameter update. The Polaris Synchronizer tool automates this pattern between two Polaris instances.

A warm standby also changes the failback story for the better, because the primary catalog can be treated as a standby in the other direction once the outage ends: lock it, sync it from the DR side, verify, and then swap which side is writable. The mechanism is symmetric.

The cost is operating a second catalog and a sync job with a short interval. For a fleet where the RTO target is measured in minutes rather than hours, that cost is the price of the target.

## Tier Four: Cross-Region Replication and the Absolute Path Problem

A copy of every file in a second region is straightforward to produce. Every object store has cross-region replication (CRR) that copies new objects asynchronously, typically within minutes. The hard part is that Iceberg metadata in format versions 1 through 3 records absolute paths. A manifest in the replica names `s3://lake-primary/warehouse/sales/orders/data/00042.parquet`, and an engine in the DR region reading that manifest tries to fetch from the primary bucket, which is the bucket that is down.

There are three strategies for making the replica's paths resolve, and the choice shapes everything else about the DR design.

**Strategy one: make the paths the same.** If the replica is reachable at the same URI as the primary, no rewrite is needed. AWS Multi-Region Access Points (MRAP) do this: tables are created with an MRAP alias as their location, the access point routes to whichever replica is healthy, and the metadata's absolute paths resolve in either region because they name the access point, not a bucket. Iceberg's S3 file IO has supported MRAP-style paths since 2022. The equivalent on other clouds is a DNS alias or a storage-level access point that fronts both replicas. The constraint is that tables must be created with the access point path from the start. Existing tables with bucket-specific paths need a one-time path rewrite to adopt it.

**Strategy two: rewrite the paths.** The `rewrite_table_path` Spark procedure stages a copy of every metadata file, manifest list, manifest, and delete file with a source prefix replaced by a target prefix, and emits a list of files to copy. Run in full mode once, then in incremental mode with `start_version` and `end_version` on a schedule, it keeps a path-correct replica current:

```sql
CALL polaris.system.rewrite_table_path(
  table            => 'sales.orders',
  source_prefix    => 's3://lake-primary/warehouse/sales/orders',
  target_prefix    => 's3://lake-dr/warehouse/sales/orders',
  start_version    => '00210-....metadata.json',
  end_version      => '00212-....metadata.json',
  staging_location => 's3://lake-primary/dr/staging/sales/orders'
);
```

The procedure returns the rewritten latest metadata file name and a CSV of source-to-target copies. A copy job consumes the CSV, and the DR-side ledger records the rewritten metadata file's target path. At failover, registering that file in the DR catalog produces a table whose every path names the DR bucket. The cost is a scheduled Spark job per table, or per batch of tables, plus the copy. The benefit is that the replica is fully independent: different bucket name, different account if desired, no shared routing layer.

**Strategy three: use format version 4 relative paths.** v4 stores data and metadata file paths relative to the table location and joins them at read time. A v4 table with relative paths can be copied byte-for-byte to another prefix and registered there with no rewrite, because the paths inside the metadata are `data/00042.parquet` rather than a full URI. This is the long-term answer. It applies to tables created on v4 or rewritten after upgrade, and engine support for v4 is still arriving, so most production tables today are on strategies one or two.

Whatever the strategy, replication has an ordering problem that DR plans routinely miss. Iceberg writes data files first, then manifests, then the manifest list, then the metadata file, and finally swaps the catalog pointer. Asynchronous replication does not preserve that order. The replica can hold a metadata file whose manifests have not arrived, or manifests whose data files have not arrived. A DR-side reader that opens that metadata file gets a missing-file error. The fix is to record in the DR ledger only metadata files whose entire tree has been verified present in the replica, which is what the verification script in the next section does. The DR recovery point is then "the latest fully-replicated snapshot," which is a precise and honest statement rather than "whatever replicated."

### Why Replicated Metadata Is Not a Consistent Snapshot

The ordering problem deserves a concrete example, because it is the difference between a replica that looks complete and one that is complete.

A commit to `sales.orders` writes three data files at 10:00:00, one manifest at 10:00:02, one manifest list at 10:00:03, and metadata file 213 at 10:00:04, then swaps the catalog pointer at 10:00:05. Cross-region replication picks objects up independently. Metadata file 213 is 40 kilobytes and arrives in the DR bucket at 10:03. The manifest list arrives at 10:04. Two of the three data files arrive by 10:07. The third is 900 megabytes and arrives at 10:19.

Between 10:03 and 10:19, the DR bucket holds a metadata file that describes a snapshot it cannot serve. A DR ledger that recorded "213 is current" at 10:05 based on the primary catalog is correct about the primary and wrong about the replica. An engine that registers 213 in the DR catalog at 10:10 succeeds, because registration reads only the metadata file, and then fails on the first query that touches the missing data file.

The recovery point at 10:10 is not snapshot 213. It is metadata file 212, whose tree finished replicating earlier. That is what the verification script determines, and it is why the DR ledger should record two things per table: the primary's current metadata file, and the newest metadata file whose tree verifies in the replica. The gap between them is the live RPO, measured in commits or minutes, and it is the number that belongs on a dashboard.

Iceberg's immutability makes this tractable. Because no file is ever modified in place, a file that has arrived is complete and correct. The only question is presence, and presence is cheap to check.

## Restore Walkthrough: Verify, Then Register

A restore in the DR region has two steps per table. Confirm that every file the candidate metadata file references exists in the DR bucket. Then register it. The script below does the first step by walking the tree directly, using only PyIceberg's file IO so that it runs without a catalog or a Spark cluster, which is exactly the situation during a regional outage.

```python
import json
from pyiceberg.io.pyarrow import PyArrowFileIO
from pyiceberg.manifest import read_manifest_list, ManifestFile

io = PyArrowFileIO(properties={"s3.region": "us-west-2"})

def exists(path):
    try:
        io.new_input(path).open().close()
        return True
    except FileNotFoundError:
        return False

def verify_tree(metadata_location):
    with io.new_input(metadata_location).open() as f:
        meta = json.load(f)
    current = meta.get("current-snapshot-id")
    snapshot = next(s for s in meta["snapshots"] if s["snapshot-id"] == current)
    manifest_list = snapshot["manifest-list"]
    missing = []
    if not exists(manifest_list):
        return [manifest_list]
    for manifest in read_manifest_list(io.new_input(manifest_list)):
        if not exists(manifest.manifest_path):
            missing.append(manifest.manifest_path)
            continue
        for entry in manifest.fetch_manifest_entry(io, discard_deleted=True):
            if not exists(entry.data_file.file_path):
                missing.append(entry.data_file.file_path)
    return missing

candidate = "s3://lake-dr/warehouse/sales/orders/metadata/00212-6f1c-...-a9e2.metadata.json"
missing = verify_tree(candidate)
if missing:
    print(f"NOT READY: {len(missing)} files missing, first: {missing[0]}")
else:
    print("READY to register")
```

The script opens the metadata file, finds the current snapshot, reads its manifest list, reads each manifest, and checks that every live data file and delete file exists. It checks only the current snapshot, because that is what a restore needs to serve queries. A fuller check for time-travel readiness walks every retained snapshot, which is the same loop over `meta["snapshots"]`.

When it reports ready, registration is one call:

```python
from pyiceberg.catalog import load_catalog

dr_catalog = load_catalog("polaris-dr")
table = dr_catalog.register_table("sales.orders", candidate)
print(table.current_snapshot().snapshot_id)
```

When it reports missing files, there are two choices. Wait for replication to catch up, if the primary is still alive and replicating. Or step back to the previous metadata file in the `metadata-log` list and verify that one, which trades recency for completeness. The pointer ledger tells you which metadata file was current at each point, and the verification tells you which is complete. The intersection is the recovery point.

Run in a loop over the ledger, this restores a whole catalog. The tables that verify clean register immediately. The ones that do not go on a list for manual attention, which in practice is the handful that were mid-commit when the region went down.

## Testing: A DR Plan That Was Never Run Is a Hypothesis

The reason the opening scenario plays out the way it does is that nobody restored from the replica until the day it mattered. DR for Iceberg has three specific things to test, and they can all be tested without touching production.

**Test the restore, not the replication.** Replication dashboards report bytes copied. They do not report whether a metadata file's tree is complete in the replica. Run the verification script against the DR bucket on a schedule, for every table, and alert on tables whose latest ledger entry does not verify. This turns replication lag from an invisible risk into a measured recovery point objective (RPO).

**Register into a scratch catalog.** Stand up a throwaway catalog in the DR region, register every table from the DR ledger, run a row count on each, and compare to the primary. Tear it down. This exercises credentials, allowed locations, path correctness, and the register operation itself. Doing it quarterly catches configuration drift on the DR side before an outage does.

**Measure the recovery time.** Time the full sequence: read ledger, verify trees, register tables, redirect one engine, run a canary query. That number is the recovery time objective (RTO) you can actually deliver, and it is usually dominated by the verification step on large tables. Knowing it lets you decide which tables need the faster same-path strategy and which can tolerate a slower rewrite-based one.

A game day that fails is a success, because it failed on a Wednesday afternoon with the primary region healthy.

## Failback: Returning to the Primary

Every DR plan describes failover. Few describe failback, and failback is where the second disaster happens. Once the primary region is healthy again, the DR catalog has been accepting commits for hours or days. The primary's storage has the old state plus whatever replication delivered before the outage. The primary's catalog, if it survived, points at metadata files that are now behind.

Failback is a catalog migration in reverse, and it carries the same two-pointer hazard. The safe sequence is the same as the cutover protocol for moving tables between catalogs. Freeze writes on the DR side. Ensure reverse replication has copied every file the DR-side tables reference back to the primary bucket, using the verification script against the primary location. If the DR side used the path-rewrite strategy, run `rewrite_table_path` in the opposite direction so the metadata names primary paths again. Take a fresh DR ledger. Register every table into the primary catalog from that ledger, overwriting the stale primary pointers. Verify snapshot IDs. Redirect clients to the primary. Drop the DR catalog entries without purge, or leave the DR catalog as a read-only standby with its pointers frozen.

The temptation during failback is to skip the freeze because the DR side "is just a standby." It is not a standby once it has accepted a commit. It is the primary, and it has to be treated as one until the pointer has moved back.

Reverse replication deserves specific attention. Cross-region replication is usually configured in one direction. If the DR bucket does not replicate back, files written during the outage exist only in the DR region until someone copies them. Bidirectional replication with the object store's replication-metadata tags to prevent loops is the standard configuration, and it should be in place before the first failover, not after.

## Failure Modes

The ways DR plans for Iceberg fall short are consistent enough to list.

**Replicating data without the ledger.** Every file is in the DR bucket, and nobody knows which metadata file was current for any table. Listing the metadata directory and picking the highest-numbered file works only if that file's tree fully replicated and if no failed commits left orphan metadata files with higher numbers. A ledger costs nothing to keep and removes this entirely.

**Backing up the catalog nightly for tables that commit hourly.** The restored pointer is a day stale. Every commit since is on storage and reachable, but only by hand.

**Snapshot retention shorter than the replication window.** If a table expires snapshots after one day and replication takes six hours, the replica can contain metadata files referencing data files that expiry already deleted from the primary before they were copied. Retention must exceed replication lag with margin.

**Orphan removal on the replica.** A maintenance job pointed at the DR bucket sees files that the DR catalog does not reference, because the DR catalog is empty until failover, and deletes them. Never run `remove_orphan_files` against a replica.

**Versioning without lifecycle rules.** The bucket grows forever. The first time someone notices is a cost review, and the fix, adding a rule, sometimes gets set to an aggressive window that removes the undo capability that versioning existed to provide.

**Encryption keys that do not replicate.** Tables using Iceberg table encryption or SSE-KMS reference keys in a key management service. If the KMS is regional and the key is not replicated, every file in the DR bucket is unreadable. Multi-region keys or key replication is part of the DR plan, not an afterthought.

**Failing over without freezing the primary.** The primary comes back mid-failover, a pipeline commits to it, and now two catalogs have diverged on the same logical table. Failover has to include disabling writes to the primary, and failback has to reconcile which side's commits win.

**Access points configured for one region's endpoints.** With the same-path strategy, engines in the DR region need to resolve the access point through DR-region endpoints, which is a networking configuration that is easy to test and easy to skip.

**Forgetting views, statistics, and Puffin files.** Views have their own metadata files and their own catalog entries. Statistics files are referenced by absolute path from table metadata. Deletion vectors live in Puffin files that manifests reference. All of them have to replicate, and all of them have paths that rewrite strategies have to cover. `rewrite_table_path` handles delete files and statistics references, but views are separate.

## Operational Guidance

Putting the tiers together produces a short, defensible plan.

| Tier | Protects against | Setting or job | Recovery time |
|---|---|---|---|
| Snapshots and tags | bad commits | retention of 7 to 14 days on critical tables, tags on milestone snapshots | seconds |
| Object versioning | accidental deletion, purge, bad orphan cleanup | versioning on, lifecycle expiry of non-current versions at 30 days, object lock on regulated buckets | minutes per table |
| Catalog ledger | catalog loss | ledger job every 15 minutes, written to both regions | minutes for hundreds of tables |
| Cross-region replica | region or bucket loss | CRR plus same-path access points, or scheduled `rewrite_table_path`, or v4 relative paths | tens of minutes to hours, dominated by verification |

**Decide the strategy per table class, not globally.** Tables that must fail over in minutes get the same-path strategy and are created with access-point locations. Tables that can tolerate an hour get scheduled path rewrites. Archive tables get versioning and a monthly copy.

**Set retention with the replication lag in mind.** Snapshot retention at least twice the worst-case replication lag. Version expiry at least three times snapshot retention.

**Own the ledger.** It is the one artifact that turns a pile of replicated files into a restorable catalog, and it is trivially cheap. Store it on the replicated storage itself, in a prefix that lifecycle rules never touch.

**Disable maintenance on the replica and restrict it on the primary.** `remove_orphan_files` with an `older_than` shorter than the longest running job is the most common way a team deletes its own data. Versioning is the backstop, but not needing the backstop is better.

**Verify continuously, register quarterly, time it annually.** The verification script on a schedule gives a live RPO. A quarterly scratch-catalog registration proves the mechanism. An annual full game day gives the RTO number that goes in the runbook.

**Write the failback plan before the failover plan is needed.** Failback is a migration from the DR catalog to the restored primary catalog, and it has the same two-pointer hazard as any catalog migration. Freeze the DR side, register into the primary from the DR ledger, verify, drop DR entries without purge.

## Where the Ecosystem Is Heading

The hardest part of Iceberg DR today, absolute paths, is being designed out.

**Format version 4 relative paths** remove the need for path rewrites on tables that adopt them. As engines land v4 support, the rewrite strategy becomes a transitional technique for older tables rather than the default plan. Copying a v4 table is copying a directory.

**Catalog synchronization tools** such as the Polaris Synchronizer in `apache/polaris-tools` keep a standby catalog's entries current without a hand-built ledger, for deployments where both sides run the same catalog software. They raise the same divergence question that migration raises, and they answer it by keeping the standby read-only until failover.

**Access-point-native table locations** are becoming a default recommendation rather than an advanced configuration on the clouds that support them, because they collapse the DR problem for new tables into "replicate the bucket."

**Catalog-level replication guidance** from the Polaris community and from cloud providers is converging on the pattern described here: replicate storage with a path-aware tool, keep a pointer record, and register at failover. Expect that pattern to be productized, with the ledger and verification steps handled by the catalog itself.

**Verification as a first-class operation.** The tree-walk in this article is something every engine already does during scan planning. Exposing it as a table-level "is this snapshot fully present at this location" check, in the REST protocol or as a procedure, is a small step that makes DR testing routine. Several implementations are moving in that direction.

## Conclusion

Disaster recovery for Iceberg is a layered problem because an Iceberg table is a layered thing. Snapshots and tags recover from bad commits with a pointer move. Object versioning recovers from deletion with a delete-marker removal. A pointer ledger recovers from catalog loss with a batch of `register_table` calls. And a cross-region replica recovers from losing everything, provided its paths resolve, whether through a shared access point, a scheduled rewrite, or v4 relative paths, and provided someone verified that the replicated tree was complete before declaring a recovery point.

None of the pieces are exotic. Most are a configuration flag or a fifty-line script. What separates a plan that works from the Tuesday-morning scramble in the opening is that someone recorded which metadata file was current, someone checked that the replica had the whole tree, and someone ran the restore on a day when it did not matter. Do those three things and a regional outage becomes a runbook with a known duration.

## Keep Going

If this piece was useful, I have written a lot more on running Iceberg tables in production, including maintenance, catalogs, and multi-region design. *Architecting an Apache Iceberg Lakehouse* from Manning covers the operational side of Iceberg, from retention and compaction through catalog architecture and recovery. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
