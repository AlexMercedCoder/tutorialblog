---
title: "Deleting User Data From an Immutable Lakehouse: GDPR Hard Deletes on Iceberg"
date: "2026-09-02"
description: "How to turn a logical delete on immutable Iceberg into a physical erasure across snapshots, versions, replicas, and downstream copies."
author: "Alex Merced"
category: "Data Governance"
tags:
  - GDPR
  - Apache Iceberg
  - Data Privacy
  - Erasure
  - Compliance
canonical: https://iceberglakehouse.com/posts/gdpr-hard-deletes-on-iceberg/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/gdpr-hard-deletes-on-iceberg/).

A privacy team receives an erasure request under Article 17 of the General Data Protection Regulation (GDPR). The customer wants every record about them gone. An engineer runs `DELETE FROM events WHERE user_id = 48213` against the Apache Iceberg table, the query returns "1,204 rows deleted," and the ticket is closed. Three weeks later a compliance audit asks for proof, and the engineer time-travels to the snapshot from the day before the delete. All 1,204 rows are there. So are the ones in the snapshot from a month before, and the ones in the disaster-recovery replica, and the ones in the object store's version history.

Nothing about that outcome is a bug. Iceberg is designed so that a delete never destroys data. Every commit produces a new snapshot and leaves the old ones intact, and every data file is immutable. That design is what makes time travel, rollback, and concurrent writes safe. It is also exactly the wrong default for a legal obligation to make information cease to exist.

This article is about closing that gap. It covers what a delete actually does in Iceberg and where the deleted bytes remain afterward, the full sequence of operations that turns a logical delete into a physical one, the conflict between erasure deadlines and every retention mechanism the lakehouse depends on, and cryptographic shredding as the design that makes erasure instant across every copy. It ends with a working erasure pipeline and the ways these pipelines fail audits. I work at Dremio, and the mechanics here are spec and reference-implementation behavior that apply to any engine. Nothing in this article is legal advice. The regulatory requirements come from your counsel, and this article is about meeting whatever they turn out to be.

## What a Delete Does, and Where the Bytes Stay

A `DELETE` on an Iceberg table takes one of two forms depending on the table's `write.delete.mode` property.

In copy-on-write (COW) mode, the engine finds every data file containing a matching row, rewrites each of those files without the matching rows, and commits a snapshot that references the new files instead of the old ones. The old files are not deleted. They are still referenced by every prior snapshot, and they stay on storage until those snapshots expire.

In merge-on-read (MOR) mode, the engine leaves every data file untouched and writes a delete file. In format version 2 this is a position delete file naming the data file and the row positions to skip, or an equality delete file naming the column values to exclude. In format version 3 it is a deletion vector, a bitmap of row positions stored in a Puffin file. The new snapshot references the original data files plus the delete file. Readers apply the delete at scan time. The rows themselves are still in the data file, byte for byte, in the current snapshot.

Neither mode removes anything. That is the first thing an erasure process has to accept: the SQL `DELETE` is a statement about what the current snapshot returns, not about what exists on disk. The second thing is that the deleted bytes persist in more places than the obvious one. A complete inventory, for a single user's records:

**Prior snapshots.** Every snapshot committed before the delete references data files containing the rows. Under the default `history.expire.max-snapshot-age-ms` of five days, those snapshots and their files survive for five days after the next `expire_snapshots` run, which for a table nobody maintains is forever.

**The current data files, under MOR.** Until compaction rewrites them, the data files in the current snapshot still contain the rows, masked by a delete file. Any tool that reads Parquet directly, bypassing Iceberg, sees them.

**Equality delete files.** In v2 MOR, an equality delete for `user_id = 48213` stores the value `48213` in the delete file. If the deleted column is the user's email rather than a surrogate key, the delete file itself contains the personal data it was written to remove.

**Manifest bounds.** Manifests store per-file `lower_bounds` and `upper_bounds` for every column with metrics enabled. If `email` has `full` metrics and a data file's alphabetically first or last email belonged to the erased user, that email address is in the manifest as a bound. Under the default `truncate(16)` the first sixteen characters are there.

**Partition values and paths.** A table partitioned by `identity(user_id)` or, worse, by a truncated email, carries the value in every manifest entry's partition tuple and, with the default location provider, in every data file's directory path. The path outlives the file's contents in storage listings, access logs, and any tool that indexed the bucket.

**Puffin statistics.** Theta sketches for distinct-value estimation store hashes of values, not values. They do not contain personal data in a recoverable form and are not part of the erasure inventory, though regenerating them after a large erasure is good hygiene.

**Object store versions.** Buckets with versioning enabled retain every deleted object as a non-current version until a lifecycle rule expires it. Every data file that `expire_snapshots` and `remove_orphan_files` delete is retained as a version. This is the layer that catches most teams, because it is invisible to Iceberg entirely.

**Replicas and backups.** Cross-region replicas, path-rewritten copies, and any backup taken before the erasure hold the original files. Replication of deletions is asynchronous and, for some configurations, disabled by default so that a mistaken deletion does not propagate.

**Downstream copies.** Materialized views, engine result caches, BI extracts, exported CSVs, feature stores, and training sets that were built from the table. None of these are Iceberg's concern, and all of them are the compliance team's concern.

An erasure process that handles the first item and stops has deleted nothing. The sections that follow address each layer in the order it has to happen.

## Personal Data in the Metadata Files Themselves

The inventory above covers where row values persist. There is a smaller category that erasure processes overlook because it is not row data at all: personal data written into Iceberg metadata by table design or by operational habit.

**Snapshot summaries.** Every snapshot has a `summary` map, and engines and pipelines are free to add keys to it. A pipeline that writes `"requested-by": "person@example.com"` into each commit's summary, or a job that stamps the summary with the identifier of the record it processed, has put personal data into every `metadata.json` that includes that snapshot. Snapshot summaries are deleted when the snapshot expires, but the old `metadata.json` files that listed the snapshot remain in the `metadata-log` until `write.metadata.previous-versions-max` and `write.metadata.delete-after-commit.enabled` remove them. A table with the default of 100 tracked versions and deletion disabled keeps every historical summary indefinitely.

**Default values.** A v3 column added with an `initial-default` or `write-default` stores that value in the schema, in every metadata file from that point on. A default is a constant, so it is almost never personal data, but a default of a real test user's email in a `contact` column is not unheard of.

**View definitions.** Iceberg views store SQL text in their own metadata files. A view defined as `WHERE email = 'person@example.com'` carries that address in every version of the view metadata, and view metadata has its own version history.

**Table and namespace properties.** Free-form properties such as `owner` or `contact` commonly hold an email address. That is usually the owner's business address rather than a data subject's, but it is worth knowing that properties live in every metadata file version.

**Partition values in partition-spec names and manifests**, covered above, and file paths that embed partition values, are the largest item in this category and the one that is hardest to remediate after the fact.

The mitigation for all of these is the same: keep identifiers out of metadata by policy, enable metadata file cleanup so historical `metadata.json` files do not accumulate, and include the metadata log in the erasure verification. A `grep` for the surrogate key across the table's `metadata` directory after step 5 is a cheap check that nothing was written where it should not have been.

## The Physical Erasure Sequence

Turning a logical delete into a physical one is a sequence of Iceberg maintenance operations, in a specific order, followed by storage-level cleanup. Each step removes the data from one layer of the inventory.

**Step 1: Delete the rows.** Run the `DELETE`. For erasure work, COW is the better mode because it physically rewrites the files in the same commit, which collapses steps 1 and 2 into one. On a table that is MOR for operational reasons, the delete writes a delete file and step 2 is mandatory.

```sql
DELETE FROM events WHERE user_id = 48213;
```

**Step 2: Compact the affected files.** On a MOR table, rewrite the data files that have delete files attached so that the rows are physically removed. `rewrite_data_files` with a filter limits the work to the partitions involved and the `rewrite-all` option forces rewriting even files that are already well-sized:

```sql
CALL polaris.system.rewrite_data_files(
  table   => 'events',
  where   => 'event_date >= DATE ''2024-01-01''',
  options => map('rewrite-all', 'true', 'delete-file-threshold', '1')
);
```

The `delete-file-threshold` of 1 tells the compaction to rewrite any file with at least one delete attached, which is every file that held one of the user's rows. After this commit, the current snapshot's data files no longer contain the rows and no longer have delete files attached.

**Step 3: Rewrite or drop delete files that contain the value.** Position delete files and deletion vectors store positions, not values, and compaction in step 2 drops them. Equality delete files store values. On a v2 table that used equality deletes, `rewrite_position_delete_files` does not touch them, and the only way to eliminate them is compaction of every data file they apply to, which step 2 does when its filter covers the right partitions. Confirm with the `files` metadata table that no delete files remain for the affected partitions.

**Step 4: Expire every snapshot that references the old files.** This is the step that removes the rows from history. Expire snapshots older than the compaction commit, keeping only the current one:

```sql
CALL polaris.system.expire_snapshots(
  table       => 'events',
  older_than  => current_timestamp(),
  retain_last => 1
);
```

`expire_snapshots` removes the snapshot entries from metadata and deletes every data file, delete file, manifest, and manifest list that is referenced only by the expired snapshots. This is where the pre-delete data files, and the pre-compaction MOR files, are physically deleted from the table's storage. It is also where manifests carrying old bounds are deleted, since manifests are per-snapshot.

Two things stop this step from working. Tags and branches: a snapshot referenced by a tag or a non-main branch is not expired regardless of age. Every tag and branch that predates the delete has to be dropped or moved forward first. And `gc.enabled`: if it is `false`, expiry refuses to run.

**Step 5: Remove orphan files.** Files that were written but never committed, or that a failed expiry left behind, sit under the table location unreferenced. `remove_orphan_files` deletes them. Its `older_than` parameter defaults to three days for safety against in-flight commits, and for erasure the value has to be set to cover the affected files while remaining longer than the longest concurrent write:

```sql
CALL polaris.system.remove_orphan_files(
  table      => 'events',
  older_than => current_timestamp() - INTERVAL 1 HOUR
);
```

Run this only when no write to the table has been in flight for longer than the interval, or the procedure deletes files a running job is about to commit.

**Step 6: Purge object versions.** Every file deleted in steps 4 and 5 is now a non-current version in a versioned bucket. Either wait for the lifecycle rule to expire non-current versions, which means erasure completes on the rule's schedule rather than yours, or delete the versions explicitly:

```bash
aws s3api list-object-versions --bucket lake --prefix warehouse/events/ \
  --query 'Versions[?IsLatest==`false`].[Key,VersionId]' --output text |
while read key version; do
  aws s3api delete-object --bucket lake --key "$key" --version-id "$version"
done
```

This is broad: it removes every non-current version under the table, not only the ones from this erasure. That is usually the desired outcome for a table where expired files are expired, but it also removes the undo capability that versioning provides, so it should run only after the erasure has been verified. Buckets with object lock cannot do this until the lock period ends, which makes object lock and erasure deadlines a direct conflict that the design section addresses.

**Step 7: Propagate to replicas and backups.** For a replica maintained by object-store replication, deletions propagate if delete-marker replication is enabled, and version purges have to be repeated on the replica. For a path-rewritten copy, the erasure sequence has to run against the copy as its own table, or the copy has to be regenerated from the erased primary. Backups taken before the erasure are either deleted, re-created, or documented as an exception with their own expiry.

**Step 8: Downstream.** Refresh or drop every derived artifact. This is the step that no Iceberg tooling helps with and that audits most often catch.

After step 8, the user's records exist in none of the layers in the inventory. The time from step 1 to step 8 is the erasure latency, and on a large table with a conservative retention configuration it is dominated by step 6.

## The Retention Conflict

Every mechanism in the previous section that protects data from accidental loss is a mechanism that delays erasure. The conflict is structural and has to be resolved at design time, not per request.

Snapshot retention is the first collision. A table with fourteen days of snapshot history for disaster recovery cannot complete an erasure in less than fourteen days without expiring snapshots early, and expiring them early removes the recovery window for every other row in the table. The choices are to accept the retention window as the erasure latency, which works if the window fits inside the regulatory deadline, or to run erasure-specific expiry that trades the recovery window for speed.

Tags are the second collision. A tag on a quarter-end snapshot, retained for years for financial reporting, pins every data file that snapshot references, including files holding rows the user has asked to erase. There is no way to remove a row from a tagged snapshot without rewriting the snapshot, and rewriting a snapshot is not something Iceberg supports. The resolution is either that tagged snapshots are exempt from erasure on a documented legal basis, which counsel decides, or that tagged snapshots are re-created after erasure by rewriting the data as of that point in time into a new table, which is expensive.

Object versioning and object lock are the third collision. Versioning delays erasure by the lifecycle window. Object lock in compliance mode makes erasure impossible until the lock expires, which is the intended behavior of a compliance lock and the opposite of the intended behavior of an erasure obligation. Buckets that must support both need a lock period shorter than the erasure deadline, or need personal data segregated out of the locked bucket.

Replication is the fourth. A replica with its own retention and its own versioning doubles every problem above.

There are two ways out. The first is to set every retention window shorter than the erasure deadline on any table holding personal data, and to accept the operational cost. A GDPR deadline is one month, extendable under some circumstances. A table with seven-day snapshot retention, a seven-day version lifecycle, and weekly maintenance can complete the sequence in under three weeks, with margin. The second way out is to stop storing the personal data in a form that retention preserves, which is what cryptographic shredding does.

## Cryptographic Shredding: Erasure by Key Deletion

Crypto-shredding inverts the problem. Instead of finding and destroying every copy of the data, encrypt the data under a key that is unique to the data subject, store the key somewhere small and mutable, and delete the key. Every copy of the ciphertext, in every snapshot, version, replica, backup, and downstream extract, becomes unreadable at the same instant. The ciphertext is still there. The information is gone.

The design has four parts.

**Per-subject keys.** Each user gets a data encryption key (DEK). A user's personal data fields are encrypted under that user's DEK before being written to the lakehouse. The DEKs themselves are stored in a key store, wrapped by a master key in a key management service (KMS). The key store is a small table, or a dedicated database, with one row per user.

**Encrypted columns, not encrypted files.** The encryption is applied to the values of personal-data columns at the application layer or in the ingestion pipeline, so that the Iceberg table stores ciphertext in those columns and plaintext everywhere else. Non-personal columns stay queryable. Aggregations that do not touch personal fields run at full speed.

**A read path that decrypts.** Queries that need the personal fields join to the key store, fetch the subject's DEK, and decrypt. This is a user-defined function in most engines, or a view layer, or a decryption step in the application. Users whose keys have been deleted decrypt to nothing, and the read path treats a missing key as an erased subject.

**Erasure is a key deletion.** The erasure request deletes the user's row from the key store. The key store is small, has short retention, and is easy to purge completely, including from its own backups. The lakehouse is untouched.

This changes what the erasure sequence has to cover. Prior snapshots hold ciphertext that no longer decrypts. The MOR data files hold ciphertext. Manifest bounds, if metrics are enabled on the encrypted column, hold bounds of ciphertext, which are meaningless. Object versions, replicas, backups, and most downstream copies hold ciphertext. The only items left in the inventory are downstream copies that were made after decryption, such as a CSV export of plaintext emails, and the key store's own history.

Two things about Iceberg's native encryption are worth clarifying, because the feature name invites confusion. Iceberg 1.11 shipped table encryption with envelope encryption and KMS integration. That feature encrypts data files and metadata under per-table and per-file keys managed by the library, with the goal of protecting the table at rest from anyone who has storage access but not KMS access. It is not per-subject. Deleting the table key erases the whole table, not one user. Crypto-shredding for erasure is an application-level pattern layered on top of, and independent from, table encryption. The two compose: a table can be encrypted at rest with Iceberg's mechanism and hold per-subject ciphertext in specific columns.

Similarly, Parquet modular encryption supports per-column keys, which is closer, but the key is per column per file, not per subject. It protects a column from readers without the column key. It does not let you shred one user out of a column.

The costs of crypto-shredding are real and should be weighed before adopting it.

**Key management at scale.** A hundred million users means a hundred million DEKs. The key store is a real database with real availability requirements, because every personal-data read depends on it. Wrapping DEKs under a KMS master key keeps the KMS call volume manageable, since the KMS is touched only to unwrap, and unwrapped DEKs can be cached per session.

**Query performance on encrypted columns.** Filtering on an encrypted column means decrypting to compare, which defeats pruning and pushdown. The standard mitigation is to store a deterministic token alongside the ciphertext for fields that need equality lookups, such as a keyed hash of the email, and to filter on the token. Range queries on encrypted fields are not possible and should not be needed on personal data.

**Randomized versus deterministic encryption.** Randomized encryption with a per-value nonce means identical plaintexts produce different ciphertexts, which prevents frequency analysis but makes joins on the encrypted value impossible. Deterministic encryption allows joins and leaks equality. Most designs use randomized encryption for the stored value and a separate keyed token for joins.

**Key rotation.** Rotating the master key rewraps every DEK without touching the lakehouse. Rotating a DEK means re-encrypting that user's data, which is a targeted rewrite. Most designs rotate master keys on a schedule and DEKs never, since the DEK's lifetime is the user's lifetime.

**Engine support for the decrypt step.** Every engine that needs plaintext needs the decryption function. Spark, Trino, Flink, and Dremio all support user-defined functions, but each has to be implemented and deployed, and each is a place where a bug leaks plaintext into a log or a cache.

A related and simpler pattern is the PII vault, or tokenization. Personal-data fields are stored in one small, tightly governed table keyed by subject ID, and every other table stores only the subject ID. Erasure is a delete from the vault, and the vault is small enough that the full physical erasure sequence runs in minutes. The fact tables never held the personal data and need no erasure at all. This is less general than crypto-shredding, because the subject ID itself is often personal data under GDPR when it can be linked back, but combined with a vault that is itself crypto-shredded it covers most designs.

### Designing the Key Store

The key store is the component that makes crypto-shredding work, and it deserves the same design attention as the tables it protects. A minimal version is itself an Iceberg table:

```sql
CREATE TABLE security.subject_keys (
  user_id      BIGINT NOT NULL,
  wrapped_dek  BINARY NOT NULL,
  kms_key_id   STRING NOT NULL,
  created_at   TIMESTAMP NOT NULL,
  erased_at    TIMESTAMP
) USING iceberg
PARTITIONED BY (bucket(32, user_id))
TBLPROPERTIES (
  'history.expire.max-snapshot-age-ms' = '86400000',
  'write.metadata.delete-after-commit.enabled' = 'true',
  'write.metadata.previous-versions-max' = '10',
  'write.delete.mode' = 'copy-on-write'
);
```

Each row holds a DEK wrapped by a KMS master key, so the table never contains a usable key in plaintext. Bucketing on `user_id` makes the single-subject lookup on every decrypt a one-bucket read. Snapshot retention is one day, metadata cleanup is aggressive, and deletes are copy-on-write, so the physical erasure sequence on this table completes in an hour rather than weeks. The `erased_at` column is optional and supports an audit pattern where the row is first marked erased and then physically deleted on the next maintenance pass, which gives a short window to reverse a mistaken request.

The read path caches unwrapped DEKs per session with a short lifetime, so that a query touching a million subjects makes a million key-store lookups but far fewer KMS calls. The decrypt function returns null for any subject whose row is absent, which is how an erased subject presents to a query: the row exists in the fact table, its personal fields read as null, and its non-personal fields are unchanged.

Because the key store is small, it is the one table in the design where every retention mechanism can be turned off or set to hours. Versioning on its bucket can have a one-day lifecycle. It should not be replicated to a DR region with longer retention than the primary, and it should never be in a bucket with object lock. The design concentrates all the erasure difficulty into a table built to make erasure easy.

## Walkthrough: An Erasure Pipeline

This section puts the sequence together as a job that runs against a v3 MOR table. It takes a list of subject IDs, performs every Iceberg-level step, and verifies the result. Storage-level steps are noted where they attach.

```python
from pyspark.sql import SparkSession

spark = SparkSession.builder.getOrCreate()
table = "polaris.analytics.events"
subjects = [48213, 77001, 90412]

# Step 1: logical delete. The predicate targets the surrogate key,
# never an email or other direct identifier, so the delete file and
# the query log contain no personal data.
ids = ",".join(str(s) for s in subjects)
spark.sql(f"DELETE FROM {table} WHERE user_id IN ({ids})")

# Step 2: physically rewrite every file that received a delete.
spark.sql(f"""
  CALL polaris.system.rewrite_data_files(
    table   => 'analytics.events',
    options => map('rewrite-all', 'false',
                   'delete-file-threshold', '1',
                   'target-file-size-bytes', '268435456')
  )
""")

# Step 3: confirm no delete files remain.
remaining = spark.sql(f"""
  SELECT count(*) AS n FROM {table}.files WHERE content > 0
""").collect()[0]["n"]
assert remaining == 0, f"{remaining} delete files still present"

# Step 4: drop any tag or branch that pins pre-erasure snapshots,
# then expire everything but the current snapshot.
refs = spark.sql(f"SELECT name, type FROM {table}.refs").collect()
for r in refs:
    if r["name"] != "main":
        kind = "TAG" if r["type"] == "TAG" else "BRANCH"
        spark.sql(f"ALTER TABLE {table} DROP {kind} `{r['name']}`")

spark.sql(f"""
  CALL polaris.system.expire_snapshots(
    table       => 'analytics.events',
    older_than  => current_timestamp(),
    retain_last => 1
  )
""")

# Step 5: orphan cleanup, with a window longer than any running write.
spark.sql(f"""
  CALL polaris.system.remove_orphan_files(
    table      => 'analytics.events',
    older_than => current_timestamp() - INTERVAL 2 HOURS
  )
""")

# Verification at the Iceberg layer: only one snapshot, no rows for
# any subject, and no data file's bounds on user_id include a subject.
snaps = spark.sql(f"SELECT count(*) AS n FROM {table}.snapshots").collect()[0]["n"]
assert snaps == 1, f"{snaps} snapshots remain"

rows = spark.sql(f"SELECT count(*) AS n FROM {table} WHERE user_id IN ({ids})").collect()[0]["n"]
assert rows == 0, f"{rows} rows remain"

print("Iceberg-layer erasure complete; proceed to object versions and replicas")
```

Each assertion corresponds to a layer in the inventory. Zero delete files means step 2 completed and no equality or position delete carrying anything remains. One snapshot means no historical reference to the old files survives in metadata. Zero rows means the current snapshot is clean. What the script cannot check is object-store versions, which requires a storage API, and replicas, which are separate tables.

The refs loop is the part most likely to need a policy decision rather than automation. Dropping every tag to complete an erasure is correct for a table with no retention obligations and wrong for one with them. The alternative, when tags must survive, is a per-tag exception recorded with the erasure ticket and a legal basis, which is not an engineering decision.

The job also deliberately uses `user_id` and never a direct identifier in any predicate, procedure argument, or log line. The Spark history server, the catalog's audit log, and the query log all retain the text of every statement, and a `DELETE ... WHERE email = 'person@example.com'` puts the email in all three, where it persists after the table itself is clean.

For a crypto-shredded table, the whole job collapses to one statement against the key store:

```sql
DELETE FROM security.subject_keys WHERE user_id IN (48213, 77001, 90412);
```

followed by the same physical erasure sequence run against `security.subject_keys`, which is a small table with short retention and completes in minutes. The events table is not touched.

### Producing Evidence for an Audit

An erasure that cannot be demonstrated has not, for compliance purposes, happened. The verification steps in the walkthrough produce most of the evidence, and it is worth assembling it into a record at the time rather than reconstructing it later.

A complete evidence bundle for one erasure contains the surrogate keys erased, the ticket or request identifier, the table's snapshot ID before the delete and after the final expiry, the output of the `files` query showing zero delete files, the output of the `snapshots` query showing one snapshot, the output of the `refs` query showing only `main`, the count query returning zero, a storage API listing showing no non-current versions under the table prefix, and the equivalent outputs from each replica. For crypto-shredded tables it contains the key-store deletion's snapshot IDs and the same physical-erasure evidence for the key store.

Store the bundle somewhere with its own retention policy, keyed by ticket, and containing no direct identifiers. It is the artifact that turns "we ran the delete" into "here is what existed before, here is what exists after, and here is how we know."

## Failure Modes

Erasure processes fail audits in consistent ways.

**MOR without compaction.** The delete file masks the rows, the ticket closes, and the rows sit in the data file until a compaction that was never scheduled. Any Parquet-level read shows them. This is the most common failure and the one the `files` table check catches immediately.

**Snapshots never expired.** The delete and compaction ran, and every prior snapshot still references the original files. A time-travel query returns the rows. Tables with no maintenance schedule are in this state indefinitely.

**A forgotten tag.** Snapshot expiry ran and reported success. One tag, created for a one-off analysis two years ago and never dropped, pins a snapshot and every file under it. `SELECT * FROM table.refs` before expiry is the check.

**Direct identifiers in predicates.** The erasure job filtered on email. The email is now in the query log, the Spark event log, the catalog audit trail, and possibly a monitoring dashboard's slow-query panel. Erasure jobs should resolve identifiers to surrogate keys in a step that does not log, then use only the keys.

**Personal data in partition values.** A table partitioned by `identity(email_domain)` is fine. A table partitioned by `identity(user_id)` where the ID is linkable, or by `truncate(20, email)`, has the value in manifests and in file paths. Paths survive in storage inventories and access logs after the files are gone. Partition on nothing that identifies a person.

**Full metrics on identifying columns.** `write.metadata.metrics.column.email = 'full'` puts the first and last email in each file into the manifest as bounds. Manifests are deleted on expiry, so this is covered by step 4, but until then every manifest is a small list of real addresses. Set identifying columns to `counts` or `none`.

**Object versioning treated as out of scope.** The Iceberg-layer verification passes. Every deleted file is retrievable from the bucket's version history for thirty more days. Auditors who ask "can this data be recovered" get the wrong answer.

**Object lock on a bucket holding personal data.** Erasure is blocked until the lock expires. If the lock period exceeds the regulatory deadline, the design is noncompliant by construction.

**Replica with delete-marker replication disabled.** The primary is clean. The replica still has every file, and because deletions did not replicate, it always will until someone runs the sequence there too.

**`remove_orphan_files` deleting an in-flight write's data.** The erasure job set `older_than` to one hour. A backfill that started ninety minutes earlier had its uncommitted data files deleted. The backfill's commit succeeds and references files that no longer exist. Erasure jobs need to coordinate with the write schedule.

**Downstream extracts.** The table is clean. The BI tool's extract from last Tuesday, the data scientist's notebook checkpoint, and the model training set in a different bucket all have the rows. No Iceberg operation helps. Only an inventory of derived artifacts does.

## Operational Guidance

Most of what makes erasure tractable is decided when the table is created.

**Never partition on a direct or linkable identifier.** Partition on time, region, event type, or a bucket of a surrogate key. Bucketing on `user_id` is acceptable because the bucket number is a hash and not linkable, and it makes the erasure delete prune to one bucket per subject.

**Set metrics to `counts` or `none` on identifying columns.** Bounds on an email column serve no query and populate manifests with addresses.

**Use surrogate keys for subjects everywhere, and keep the mapping small.** Fact tables reference `user_id`. The mapping from `user_id` to real-world identity lives in one governed table with short retention. Erasure predicates use the surrogate.

**Pick retention windows shorter than the erasure deadline, on tables that hold personal data.** Snapshot retention, version lifecycle, replica retention, and backup retention all inside the deadline with margin for the maintenance schedule. Tables without personal data can keep longer windows.

**Schedule compaction on MOR tables at least as often as the erasure SLA requires.** A weekly compaction on a table with a thirty-day deadline is fine. A monthly one is not.

**Treat tags and object lock as incompatible with in-place erasure.** Either keep them off tables holding personal data, or adopt crypto-shredding so that the pinned snapshots hold only ciphertext.

**Adopt crypto-shredding or a vault for any table where the retention requirements and the erasure requirements cannot both be met in place.** That is most tables with a DR replica, a compliance lock, or long-lived tags.

**Log erasures, not identities.** The erasure audit record stores the surrogate key, the ticket, the timestamp, and the snapshot IDs before and after. It never stores the identifier the request arrived with.

**Verify at every layer, and keep the verification.** The `files`, `snapshots`, and `refs` metadata tables for the Iceberg layer. The storage API for versions. The replica's own verification. The derived-artifact inventory. An erasure that cannot be demonstrated is, for audit purposes, an erasure that did not happen.

## Where the Ecosystem Is Heading

**Row lineage in v3** gives every row a stable `_row_id` and a `_last_updated_sequence_number`. This does not change what erasure requires, but it makes the audit trail precise: an erasure record can cite the exact row IDs removed, and a downstream system that tracks lineage can prove which of its own rows descended from them.

**Table encryption in Iceberg 1.11** is at-rest protection, not subject-level shredding, but it establishes the key-management plumbing, including KMS integration and per-file key wrapping, that a subject-level scheme can build on. The gap between "encrypt the table" and "encrypt each subject's fields under their own key" is an application concern today and is a plausible future extension.

**Catalog-level policy.** Apache Polaris has introduced policies attached to catalog entities, initially for maintenance settings such as snapshot expiry and compaction. A retention policy enforced by the catalog, applied to every table tagged as holding personal data, is the natural way to guarantee that the windows described above are actually set, rather than relying on each table's properties being configured by hand.

**Erasure as a procedure.** The sequence in this article is the same on every table, and several teams have wrapped it as a stored procedure or a scheduled job. A first-class `purge_rows` or equivalent that performs delete, compaction, expiry, and orphan removal in one coordinated commit sequence is a small step for the reference implementation and a large step for compliance teams.

**Convergence with other formats.** Delta Lake's `VACUUM` and Hudi's cleaner services face the same layering. The pattern of logical delete, physical rewrite, history expiry, and storage-version purge is universal to immutable table formats, and the tooling is converging on similar shapes.

## Conclusion

Iceberg's immutability is a feature everywhere except in the one case where the law requires information to stop existing. A `DELETE` changes what the current snapshot returns and nothing else. The bytes stay in prior snapshots, in unrewritten MOR files, in equality delete files, in manifest bounds, in partition paths, in object versions, in replicas, and in every downstream copy.

Physical erasure is a sequence: delete, compact, expire, remove orphans, purge versions, propagate to replicas, refresh downstream. Every step conflicts with a retention mechanism, and the conflicts have to be resolved by design, with retention windows inside the erasure deadline on tables holding personal data, no identifying columns in partitions or metrics, and surrogate keys in every predicate. For tables where retention and erasure cannot both be satisfied in place, crypto-shredding makes erasure a key deletion and leaves every immutable copy holding ciphertext that means nothing.

The teams that pass audits are the ones that treated erasure as a table design constraint rather than as a query. The delete statement is the easy part.

## Keep Going

If this piece was useful, I have written a lot more on operating Iceberg tables under real constraints, including retention, maintenance, and governance. *Architecting an Apache Iceberg Lakehouse* from Manning covers maintenance and lifecycle design in the depth this article draws on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
