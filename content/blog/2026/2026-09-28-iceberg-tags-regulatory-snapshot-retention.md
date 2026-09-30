---
title: "Keeping Audit Snapshots Alive While Iceberg Snapshot Expiration Runs Every Night"
date: "2026-09-28"
description: "How Iceberg snapshot tags keep audit snapshots alive through nightly expiration: retention calendars, RETAIN semantics, compaction cost, and erasure conflicts."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Snapshot Expiration
  - Data Governance
  - Compliance
  - Table Maintenance
canonical: https://iceberglakehouse.com/posts/iceberg-tags-regulatory-snapshot-retention/
---

> **Cross-posted.** This article's canonical home is [Alex Merced's Lakehouse Blog](https://iceberglakehouse.com/posts/iceberg-tags-regulatory-snapshot-retention/).

To keep a specific Apache Iceberg snapshot through routine expiration, point a tag at it. Snapshot expiration never removes a snapshot that a live branch or tag references. A tag's `RETAIN` clause sets how long the tag itself lives, measured from the snapshot's own timestamp. A tag created without `RETAIN` lives until someone drops it.

That answer fits in a paragraph, but the problem behind it does not. A data platform team runs nightly maintenance on hundreds of tables. Snapshot expiration keeps metadata small, and orphan file cleanup keeps storage bills sane. Then the finance team asks for the exact state of the general ledger table as it stood at the close of the third quarter last year. The auditors want to rerun a query against that state and get the same numbers the board saw.

If the maintenance job has been doing its work, that snapshot is gone. The data files it referenced are gone too, because expiration deletes files that no surviving snapshot needs. Time travel only reaches as far back as your retention window, and most retention windows are measured in days.

This article covers how to run aggressive maintenance and still hold specific points in time for years. It explains how expiration chooses what to delete, how tags change that choice, and how to build a retention calendar from tags. It also covers what compaction does to your storage bill once tags pin old files, and what happens when a retention hold collides with a data deletion request.

## Why Expiration and Retention Pull in Opposite Directions

Every commit to an Iceberg table creates a new snapshot. A snapshot is a complete, immutable description of the table at one moment. It points to a manifest list, which points to manifests, which point to data files and delete files. Readers pick a snapshot at planning time and read exactly the files it lists. That is what gives Iceberg reader isolation and time travel.

The cost is accumulation. A streaming ingestion job that commits every minute creates 1,440 snapshots a day. Each one adds an entry to the table metadata file and keeps its own manifest list alive. Rewrites and deletes leave behind files that only old snapshots still reference. Without cleanup, metadata files grow, planning slows, and storage fills with bytes no current query will ever read.

Snapshot expiration is the cleanup. It removes old snapshots from table metadata and then deletes the files that only those snapshots referenced. Orphan file removal is the second pass. It deletes files in the table location that no snapshot references at all, such as leftovers from failed writes.

Both jobs are designed to forget. That is their purpose, and it is the right default for most tables.

Regulated data has a second requirement that points the other way. Financial reporting, audit, and many industry rules require an organization to show what a record looked like at a specific time. Often that means the state as of a reporting date, not just the current state. The requirement is usually narrow. Nobody needs every one-minute snapshot from three years ago. They need a small number of named points: month-end closes, quarter-end closes, fiscal year-end, the state at the moment a regulatory filing was produced.

The mistake teams make is treating this as a tension that forces a single compromise. They set the global retention window long enough to cover the audit need, maybe 400 days, and then wonder why planning is slow and storage costs keep climbing. A 400-day window on a table that commits every minute holds more than half a million snapshots.

The better model separates the two concerns. The global retention window handles operational needs such as rollback after a bad write, debugging, and incremental reads. That window stays short, often 3 to 7 days. Named points in time get explicit protection through snapshot references, and those references carry their own lifetimes. Iceberg supports this directly. The mechanism is the tag.

For the operational side of this, including how long the global window should be and how often to run expiration, see [Designing an Immutable Data Lakehouse: Best Practices for Iceberg Snapshot Expiration](https://iceberglakehouse.com/posts/iceberg-snapshot-expiration/). This article focuses on the other half: guaranteeing that specific snapshots survive it.

## How Expiration Decides What Gets Deleted

To protect a snapshot, you need to know exactly how expiration chooses its victims. The Iceberg table specification defines a retention policy that engines apply during expiration. The policy draws on three properties, which can be set globally as table properties and overridden on individual snapshot references.

The properties are:

- `min-snapshots-to-keep`: the minimum number of snapshots to keep on a branch, counting back from the branch head.
- `max-snapshot-age-ms`: the maximum age of snapshots to keep on a branch.
- `max-ref-age-ms`: the maximum age of the reference itself, after which the branch or tag is removed.

The table-level versions are `history.expire.min-snapshots-to-keep` (default 1), `history.expire.max-snapshot-age-ms` (default five days, or 432,000,000 milliseconds), and `history.expire.max-ref-age-ms` (default no expiry).

When expiration runs, the evaluation follows a fixed order. First, the engine removes any reference other than `main` whose referenced snapshot is older than that reference's `max-ref-age-ms`. The `main` branch never expires. Second, for each surviving branch, the engine walks back through the branch's ancestors and marks snapshots to keep. A snapshot survives if it is within the branch's `min-snapshots-to-keep` count or younger than its `max-snapshot-age-ms`. Third, each surviving tag keeps exactly the snapshot it points to. Finally, every snapshot not marked for retention is removed from table metadata.

After snapshots leave metadata, the engine computes which files were referenced only by the removed snapshots. Those files get deleted, unless `gc.enabled` is set to false on the table. With garbage collection disabled, expiration still drops snapshots from metadata but leaves every file in storage.

Three details in that algorithm matter for regulated retention.

The first is that references are evaluated before snapshots. A live tag protects its snapshot from the age cutoff entirely. The engine never compares a tagged snapshot's age against `max-snapshot-age-ms`. The only thing that removes a tagged snapshot is the removal of the tag.

The second is that a tag protects one snapshot, not a history. A branch keeps a run of ancestors according to its own settings. A tag keeps the single snapshot it names. If you tag the quarter-end snapshot, you keep the quarter-end state. You do not keep the 90 days of intermediate snapshots that led to it. For audit reproduction that is usually exactly what you want.

The third is that expiration calls typically pass explicit arguments such as `older_than` and `retain_last`. In the Spark procedure, those arguments override the table-level properties for that run. They do not override reference protection. A call that expires everything older than yesterday still skips every snapshot a live tag points to.

That last point is the whole foundation of this approach. Your maintenance job does not need to know which snapshots are special. The table metadata carries that knowledge, and every engine that implements the spec's retention policy honors it.

## Tags Are Retention Policy, Not Just Labels

Most introductions to Iceberg tags present them as friendly names for snapshot IDs. That framing undersells them. A tag is a snapshot reference with a lifetime, and that lifetime is a retention policy stored inside the table.

In Spark SQL, you create a tag like this:

```sql
ALTER TABLE finance.gl.journal_entries
  CREATE TAG `fy2025-q3-close`
  AS OF VERSION 7340029183526114402
  RETAIN 2557 DAYS;
```

The `AS OF VERSION` clause names the snapshot. Without it, the tag points to the current snapshot. The `RETAIN` clause sets the tag's `max-ref-age-ms`. Without `RETAIN`, the tag has no maximum age, and the Iceberg documentation states that the default retention for branches and tags is forever.

Here is the detail that catches people. The age of a reference is measured from the timestamp of the snapshot it points to. It is not measured from the moment you created the tag. The PyIceberg change that added reference expiry describes these semantics explicitly as matching the Java implementation: a ref's age comes from the referenced snapshot's timestamp, compared against the ref's own `max-ref-age-ms` or the table default.

So if the quarter closed on September 30 and your close process finished and tagged the snapshot on October 14, a tag with `RETAIN 2557 DAYS` expires about 2,557 days after September 30, not after October 14. For a seven-year requirement anchored to the reporting date, that is correct. For a requirement anchored to the date a filing was submitted, you need to add the gap. The safest habit is to compute the retention value from the snapshot's `committed_at` timestamp and the actual end date the rule requires, rather than typing a round number.

The second decision is whether to use `RETAIN` at all. There are two sound patterns.

**Scheduled retention.** The rule says to keep month-end states for 13 months and year-end states for seven years. Each tag gets a `RETAIN` value computed from the rule. Expiration removes the tag when the time comes, and the next expiration run after that removes the snapshot and any files only it referenced. Nobody has to remember to clean up. This fits routine reporting retention.

**Indefinite holds.** Litigation holds and regulator inquiries have no known end date. Create these tags without `RETAIN`. They last until a person with authority drops them. This fits any case where deleting data early carries legal risk and keeping it longer only costs storage.

Mixing the two on one table is normal. A quarter-end snapshot can carry a scheduled tag for routine retention and, if an inquiry arrives, a second tag without `RETAIN` for the hold. Two references to the same snapshot are allowed. The snapshot survives as long as either reference survives. When the hold is released, the hold tag is dropped and the scheduled tag takes over again.

Naming matters more than it looks. The tag name is the only human-readable record in table metadata of why a snapshot is being kept. A name like `q3` tells a future engineer nothing. A name like `fy2025-q3-close` or `hold-2026-0412-sec-inquiry` tells them the purpose and, for holds, gives them something to look up before touching it. Pick a convention, write it down, and enforce it in the job that creates tags.

## Designing a Retention Calendar With Tags

A retention calendar maps business events to tags. It answers four questions for each event: which snapshot gets tagged, what the tag is called, how long it lives, and who creates it.

Here is a calendar for a typical financial reporting table. The retention periods are examples, not legal guidance. Your compliance team owns the real numbers.

| Event | Snapshot to tag | Tag name pattern | Retention | Created by |
|---|---|---|---|---|
| Daily operations | none (global window covers it) | none | 7 days via table properties | nightly maintenance |
| Month-end close | first snapshot after close sign-off | `fy2026-m03-close` | 400 days | close workflow |
| Quarter-end close | snapshot used for the quarterly report | `fy2026-q1-close` | 2,557 days | close workflow |
| Fiscal year-end | snapshot used for the annual report | `fy2026-close` | no RETAIN, reviewed yearly | controller approval |
| Legal or regulatory hold | snapshot named in the hold notice | `hold-<ticket-id>` | no RETAIN | legal request only |

Several design choices sit behind that table.

The global window stays short. Seven days covers rollback after a bad write and most debugging. Everything longer goes through tags. That keeps the snapshot count on the `main` branch bounded no matter how long the audit horizon is.

The tagged snapshot is the one actually used for reporting, not the last snapshot on the calendar date. Close processes often run late adjustments for days after the period ends. The snapshot that matters is the one the published numbers came from. If your reporting pipeline records the snapshot ID it read, the tag job uses that ID. If it does not record it, fix that first. Without a recorded ID, you are guessing which state the board saw.

Tagging happens as part of the close workflow, not as a separate cleanup task. The best time to tag a snapshot is the moment it becomes significant, while its ID is known and before any expiration run can reach it. With a seven-day global window, a tag job that runs a week late finds nothing to tag.

Year-end tags use no `RETAIN` and get an annual review. Seven-year rules sometimes turn into ten-year rules after an acquisition or a change in regulator. A tag without an expiry fails safe. The yearly review converts old year-end tags to scheduled ones, or drops them, with a named approver.

Holds are a separate category with their own naming prefix and their own creation path. Only the legal or compliance team triggers them. Keeping holds visually and procedurally distinct from routine retention prevents an engineer from dropping one while cleaning up routine tags.

## Walkthrough: Configuring, Tagging, Auditing, and Expiring

This section walks through the full cycle in Spark SQL on an Iceberg table. The same concepts apply in other engines that support Iceberg references, though the syntax differs.

Start with the table-level properties. These define the operational window that applies to the `main` branch and to any reference that does not set its own values.

```sql
ALTER TABLE finance.gl.journal_entries SET TBLPROPERTIES (
  'history.expire.max-snapshot-age-ms'   = '604800000',   -- 7 days
  'history.expire.min-snapshots-to-keep' = '50',
  'gc.enabled'                           = 'true'
);
```

The age setting keeps a week of history. The minimum count guarantees that a quiet table with few commits still keeps its last 50 snapshots. This matters for tables that receive a burst of corrections and then go idle. The `gc.enabled` line is explicit because some teams disable garbage collection during migrations and forget to turn it back on.

Next, find the snapshot to tag. If your reporting pipeline logged the snapshot ID, use it directly. If you need to find it by time, query the snapshots metadata table.

```sql
SELECT snapshot_id, committed_at, operation, summary['added-records'] AS added
FROM finance.gl.journal_entries.snapshots
WHERE committed_at <= TIMESTAMP '2026-10-14 18:00:00'
ORDER BY committed_at DESC
LIMIT 5;
```

This lists the five most recent snapshots before the close sign-off time. The `operation` column shows whether each commit was an append, overwrite, or delete. Pick the snapshot that matches the published report, then tag it.

```sql
ALTER TABLE finance.gl.journal_entries
  CREATE TAG IF NOT EXISTS `fy2026-q3-close`
  AS OF VERSION 7340029183526114402
  RETAIN 2557 DAYS;
```

`IF NOT EXISTS` makes the statement safe to rerun from an orchestrator. If the close workflow retries after a partial failure, the second run does not fail on a duplicate tag.

For a hold, omit `RETAIN`:

```sql
ALTER TABLE finance.gl.journal_entries
  CREATE TAG `hold-lgl-2291`
  AS OF VERSION 7340029183526114402;
```

Now audit what the table is holding. The refs metadata table lists every branch and tag with its retention settings.

```sql
SELECT name, type, snapshot_id,
       max_reference_age_in_ms / 86400000 AS retain_days
FROM finance.gl.journal_entries.refs
ORDER BY type, name;
```

A `NULL` in the retention column means the reference never expires on its own. For a regulated table, every row in this output needs an owner and a reason. Anything unexplained is either a missing hold record or a forgotten tag that is inflating storage.

To check that a tag actually resolves to readable data, query it directly:

```sql
SELECT count(*) AS rows_at_close, sum(amount) AS total_at_close
FROM finance.gl.journal_entries VERSION AS OF 'fy2026-q3-close';
```

Store the result of this query alongside the tag in your retention ledger. When the auditors rerun it in three years, the numbers must match. If they do not match, something has corrupted or removed files, and you want to find out on your own schedule, not theirs.

Finally, run expiration as usual:

```sql
CALL spark_catalog.system.expire_snapshots(
  table       => 'finance.gl.journal_entries',
  older_than  => TIMESTAMP '2026-10-21 00:00:00',
  retain_last => 50
);
```

This removes every snapshot older than the cutoff that is not among the last 50 on `main` and is not referenced by a live branch or tag. The tagged quarter-end snapshot survives, and so does the hold. Files referenced only by the expired snapshots are deleted. Files still referenced by a tagged snapshot stay.

Orphan cleanup comes last:

```sql
CALL spark_catalog.system.remove_orphan_files(
  table      => 'finance.gl.journal_entries',
  older_than => TIMESTAMP '2026-10-18 00:00:00'
);
```

Orphan detection works by comparing files in storage with files reachable from snapshots in current metadata. Tagged snapshots are in current metadata, so their files are reachable and safe. The `older_than` margin protects files from writes still in progress. Three days is the common floor, and Spark refuses very short values unless you override its safety check.

## Automating the Calendar From an Orchestrator

Hand-typed SQL works for a demonstration. Regulated retention needs a job that runs the same way every time, refuses to guess, and leaves evidence. The function below does that with PyIceberg, the Python implementation of Iceberg, and it has been tested against PyIceberg 0.12 with a local SQL catalog. Any orchestrator that runs Python can call it at the end of a close workflow.

```python
from datetime import datetime, timezone

DAY_MS = 86_400_000


def tag_for_retention(table, snapshot_id, tag_name, keep_until=None):
    """Tag a snapshot so it survives expiration until keep_until (UTC).

    keep_until=None creates an indefinite hold with no max-ref-age-ms.
    """
    snapshot = table.snapshot_by_id(snapshot_id)
    if snapshot is None:
        raise RuntimeError(f"snapshot {snapshot_id} no longer exists")

    existing = table.refs().get(tag_name)
    if existing is not None:
        if existing.snapshot_id != snapshot_id:
            raise RuntimeError(f"{tag_name} already points to {existing.snapshot_id}")
        return existing  # safe rerun

    max_ref_age_ms = None
    if keep_until is not None:
        # Reference age is measured from the snapshot's commit time,
        # so compute the lifetime from timestamp_ms, not from "now".
        until_ms = int(keep_until.timestamp() * 1000)
        max_ref_age_ms = until_ms - snapshot.timestamp_ms + DAY_MS  # one day margin

    table.manage_snapshots().create_tag(
        snapshot_id=snapshot_id,
        tag_name=tag_name,
        max_ref_age_ms=max_ref_age_ms,
    ).commit()
    return table.refs()[tag_name]
```

Each part of this function exists to prevent one of the quiet failures described later in this article.

The first check looks up the snapshot by ID and raises an error if it is gone. That turns the "tagged too late" failure into a loud one. The orchestrator marks the task failed, and whoever owns the close hears about it the same day, not three years later.

The second check makes the function safe to rerun. If the tag already exists and points to the same snapshot, the function returns it and does nothing else. If the tag exists but points somewhere else, the function refuses to continue. A close workflow that retries must never move a tag that an earlier run created. Moving a regulated tag is a deliberate act with an approver, not a side effect of a retry.

The retention math is the part people get wrong by hand. The caller passes the date the rule says the data must survive until, such as seven years after the reporting date. The function subtracts the snapshot's own commit timestamp from that date, because the engine measures reference age from the snapshot, not from the tag. It adds one day of margin so that a maintenance run landing a few hours early does not remove a tag on its final day. Passing `keep_until=None` creates a hold with no expiry at all.

The last step commits the tag through the catalog. With a REST catalog such as Apache Polaris, that commit goes through the same optimistic concurrency path as any other table metadata update. If another writer commits at the same moment, PyIceberg retries against the new metadata. The tag lands on the requested snapshot either way, because the snapshot ID is fixed in the request.

The companion job runs every night and compares each regulated table against the ledger:

```python
def reconcile(table, ledger_rows):
    """Compare a table's tags with the retention ledger. Returns problems."""
    problems = []
    tags = {
        name: ref for name, ref in table.refs().items()
        if ref.snapshot_ref_type.value == "tag"
    }
    expected = {row["tag_name"]: row for row in ledger_rows}

    for name, row in expected.items():
        ref = tags.get(name)
        if ref is None:
            problems.append(f"MISSING: {name} is in the ledger but not on the table")
        elif ref.snapshot_id != row["snapshot_id"]:
            problems.append(f"MOVED: {name} points to {ref.snapshot_id}, "
                            f"ledger says {row['snapshot_id']}")
        elif ref.max_ref_age_ms != row["max_ref_age_ms"]:
            problems.append(f"CHANGED: {name} retention differs from the ledger")

    for name in tags.keys() - expected.keys():
        problems.append(f"UNTRACKED: {name} exists on the table with no ledger entry")

    return problems
```

The four problem types map to four different responses. A missing tag means something dropped a regulated reference, and it goes straight to the compliance owner. A moved tag means someone changed what the held state is, which needs an explanation and an approval record. A changed retention value means someone shortened or lengthened a hold outside the workflow. An untracked tag is usually a forgotten engineering tag that is pinning storage, and it goes to the data platform team for cleanup.

Run the reconciliation before the nightly expiration, not after it. If a hold tag vanished yesterday, you want to know before expiration deletes the files it was protecting. With the reconciliation first, a missing hold can block the maintenance run for that table until someone restores the tag from the ledger. Restoring works only while the snapshot is still in metadata, which is one more reason the global window should never be shorter than the time it takes your team to respond to an alert.

## What Compaction and Cleanup Do to Tagged Snapshots

Tags are cheap in metadata. They are not always cheap in storage. The storage cost of a tag depends on how much the table changes after the tagged snapshot.

Consider what compaction does. A rewrite of data files reads many small files and writes fewer large ones. The new snapshot references the large files. The old snapshot still references the small ones. After the global window passes, expiration removes the old snapshots and the small files become unreferenced, so they get deleted. Storage returns to roughly one copy of the data.

Now add a tag on a snapshot from before the compaction. That snapshot still references the small files. Expiration cannot touch them, because a live reference points to a snapshot that lists them. The table now holds two physical copies of the same logical rows: the compacted copy for current reads and the original copy for the tagged state.

The same thing happens with every rewrite. Merge-on-read tables that periodically compact delete files, copy-on-write tables that rewrite files on update, and tables that change their partition layout all produce new files for old rows. Each tag from before the rewrite pins the old files.

For an append-only table, this effect is small. Tagged snapshots share almost all their files with later snapshots, because appends only add files. For a table with heavy updates and regular compaction, the effect compounds. Twelve month-end tags over a year of weekly full-partition rewrites can pin close to twelve extra copies of the affected partitions.

There are three responses, and the right one depends on the table.

The first is to accept the cost and measure it. Compute, for each tagged snapshot, the bytes of files that no newer snapshot references. The files metadata table queried with `VERSION AS OF` gives you each snapshot's file list. Comparing those lists shows the unique storage each tag holds. Put that number in front of whoever owns the retention requirement. A requirement that costs a known amount per month gets reviewed on a regular basis. A requirement with an invisible cost does not.

The second is to align compaction with the retention calendar. If month-end snapshots matter, run major compaction right before month-end, not right after. The tagged snapshot then references the compacted files, and later appends share them. This does not help tables that rewrite continuously, but it helps many reporting tables that are mostly append with periodic corrections.

The third is to export the tagged state. For long holds on hot tables, some teams copy the tagged snapshot into a separate archive table using `CREATE TABLE ... AS SELECT ... VERSION AS OF`. They verify totals match, record the archive in the retention ledger, and then drop the tag on the hot table. The archive table rarely changes, so it holds one compact copy. The tradeoff is that the archive is a new table with a new history. Some auditors accept that with a documented reconciliation. Others want the original table's snapshot. Ask before you do it.

## When Retention Collides With Erasure

Retention holds keep data. Privacy law sometimes requires deleting it. On an Iceberg table, those two requirements meet at the same files.

When a data subject requests deletion under a law like the EU General Data Protection Regulation (GDPR), a standard Iceberg deletion is not enough. A `DELETE` statement creates a new snapshot without the person's rows. The old snapshots still reference files that contain them. The rows disappear from current reads but remain in time travel until expiration removes every snapshot that references those files. The process for making that deletion complete is covered in [Deleting User Data From an Immutable Lakehouse: GDPR Hard Deletes on Iceberg](https://iceberglakehouse.com/posts/gdpr-hard-deletes-on-iceberg/).

A tag breaks that process by design. If a tagged snapshot references a file with the person's rows, expiration will never delete that file while the tag lives. The erasure request and the retention hold are now in direct conflict.

The legal answer is not an engineering decision, and you need counsel involved. GDPR Article 17(3) lists exceptions to the right to erasure, including processing needed to comply with a legal obligation and processing needed for legal claims. Many retention rules fall under those exceptions. Some do not. The engineering job is to make the conflict visible and give the legal team real options.

Four engineering patterns cover most cases.

**Separate personal data from records that must be retained.** If the ledger table carries customer names and addresses only because it was convenient, move them to a separate table keyed by an identifier. The retained financial record keeps the identifier. The personal attributes live on a table with a short retention window and no long-lived tags. Erasure then touches a table that has no holds. This is the cleanest fix, and it pays off beyond compliance.

**Record the exception.** When counsel decides a hold overrides an erasure request, record that decision in the retention ledger next to the tag. When the tag expires or the hold is released, the erasure becomes due, and the workflow that drops the tag must trigger the delete. Without that link, the person's data survives the hold by accident.

**Replace the tag after rewriting.** In some cases the requirement is to keep the financial state but not the personal fields. You can create a new snapshot with the personal data rewritten or masked, verify that the retained measures match, and move the tag to the new snapshot with `REPLACE TAG`. Expiration then removes the old snapshot. This changes what the tag points to, so the audit evidence must show the reconciliation. Moving a tag silently is the kind of change auditors treat as tampering.

**Crypto-shredding.** If personal fields are encrypted with per-subject keys at the application level, destroying a subject's key makes their data unreadable in every snapshot, including tagged ones. The files stay, but their personal content becomes noise. This works well for long holds on large tables, but it requires the encryption to be designed in from the start. Retrofitting it onto existing data means rewriting that data, which runs straight back into the tag problem.

Whatever pattern you use, test it. Pick a test subject, create a tagged snapshot that contains their rows, run your erasure process, and confirm what remains in each snapshot. Do this before a real request arrives.

## Failure Modes and Warning Signs

Tag-based retention fails in predictable ways. Most of them are quiet. The table keeps working, queries keep returning results, and the failure only surfaces when someone asks for a snapshot that is no longer there.

**The tag job ran after the snapshot expired.** With a seven-day global window, a close workflow that tags snapshots two weeks after period end finds nothing. The `CREATE TAG ... AS OF VERSION` statement fails because the snapshot ID no longer exists. If the orchestrator swallows that error, nobody knows. The warning sign is any tag creation step that does not alert on failure. Treat a failed tag creation on a regulated table as a paging event.

**A retention value computed from the wrong date.** Because reference age is measured from the snapshot's timestamp, a `RETAIN` value that assumes creation time is short by the gap between commit and tagging. For a quarter-end snapshot tagged three weeks late, a seven-year tag expires three weeks early. The warning sign is a retention job that uses a fixed day count without reading `committed_at`.

**An engine that does not honor references.** The retention algorithm lives in the spec, but each engine and library implements expiration itself. Older versions of some libraries expired snapshots by age without evaluating references correctly, or lacked support for removing expired references. Before pointing any new maintenance tool at a regulated table, test it on a copy. Tag a snapshot older than the cutoff, run expiration, and confirm the snapshot survives.

**Someone dropped the tag.** Tags are table metadata. Anyone with permission to change the table's metadata can drop a tag or move it with `REPLACE TAG`. There is no built-in write-once protection at the Iceberg layer. The warning sign is a refs table whose contents do not match your retention ledger. Run that comparison every night.

**Someone dropped the table.** `DROP TABLE ... PURGE` removes the table and its files regardless of any tags. Tags protect snapshots from expiration. They do not protect a table from deletion. Regulated tables need catalog-level controls that restrict who can drop them, and ideally storage-level protection as a backstop.

**Garbage collection was disabled and forgotten.** With `gc.enabled` set to false, expiration never deletes files. Tags then appear to work perfectly, because nothing gets deleted at all. Storage grows without bound. The warning sign is a table whose storage footprint keeps climbing while its snapshot count stays flat.

**Storage-level lifecycle rules delete files underneath Iceberg.** An object storage lifecycle policy that deletes objects older than 365 days does not know about Iceberg tags. It removes files that a tagged snapshot still references, and the tagged snapshot becomes unreadable. The warning sign is any bucket lifecycle rule on a path that holds Iceberg data files. Iceberg must own deletion for its own files.

**The tag points to a snapshot whose files are damaged.** A tag preserves references, not bytes. If a file is corrupted or removed by something outside Iceberg, the tag still resolves and the query fails or returns wrong results. This is why the verification query from the walkthrough matters. Rerun it on a schedule, compare against the stored totals, and alert on any mismatch.

## Operational Guidance

Running tag-based retention at scale comes down to a few habits.

**Keep a retention ledger outside the table.** The table's refs list says which snapshots are held. It does not say why, who approved it, what the verified totals were, or which rule required it. Keep that in a separate system of record, which can itself be an Iceberg table. Each row holds the table name, tag name, snapshot ID, `committed_at`, rule reference, approver, verification query, and verified results. The nightly reconciliation compares the ledger to each table's refs and flags differences in both directions.

**Make tag creation part of the business process.** The close workflow, the filing workflow, and the legal hold workflow each create their own tags through a single shared function. That function computes `RETAIN` from the snapshot timestamp and the rule, applies the naming convention, runs the verification query, and writes the ledger row. Engineers do not create regulated tags by hand.

**Restrict who can change references on regulated tables.** Use your catalog's access controls to limit metadata changes on these tables to the service identities that run the workflows. Human engineers get read access and a break-glass path. The open REST catalog protocol commits reference changes through the same table update mechanism as other metadata changes, so check exactly which privilege your catalog maps those updates to. If your catalog cannot separate reference changes from other metadata updates, compensate with the nightly reconciliation.

**Monitor pinned storage.** Track, per table, the bytes referenced only by tagged snapshots. Report it monthly to the owner of each retention rule. Growth in that number is the early signal that compaction and retention are fighting.

**Test the maintenance stack on every upgrade.** Keep a small test table with a tag older than the global window, a tag with a short `RETAIN` value that should expire, and a hold tag with no `RETAIN`. After any upgrade to Spark, the Iceberg runtime, PyIceberg, or a managed maintenance service, run expiration against it. Confirm the old tag survives, the short tag and its snapshot go, and the hold stays.

**Back up the metadata trail.** Keep old table metadata files for regulated tables longer than the default by raising `write.metadata.previous-versions-max`, or copy them to archival storage. Those files record when each tag was created, moved, or dropped. They are your evidence trail if anyone questions whether a held snapshot was altered.

**Plan for catalog migration.** Tags live in table metadata, so they move with the table when you migrate between catalogs by registering the metadata file. Verify after any migration that the refs table matches the ledger, and that the new catalog's maintenance service honors references.

## Where the Ecosystem Is Heading

Reference-aware retention is spreading from engines into catalogs and managed services, and implementations are converging on the spec's algorithm.

Library support is catching up. PyIceberg has been adding reference expiry that follows the Java semantics, including a `history.expire.max-ref-age-ms` table property and removal of references whose snapshots have aged past their limit. The Rust implementation's expiration action documents the same model. As these libraries converge, teams can run lightweight maintenance from Python or Rust without losing reference protection.

Catalogs are taking over maintenance scheduling. AWS Glue's snapshot retention optimizer, for example, documents that it honors branch and tag retention policies. Lakekeeper exposes warehouse-level expiration settings, including a maximum reference age that applies to every reference except `main`. Apache Polaris has been adding policy support for table maintenance as well. Moving scheduling into the catalog helps, but it moves the testing burden too. You now need to verify that the catalog's service implements the retention algorithm correctly, not just your engine.

The larger open question is enforceability. Tags are policy, not protection. The spec gives no way to mark a reference as immutable or to require a second approver before dropping one. Some catalog vendors add their own controls on top. Standardized protections for references at the catalog layer are the missing piece that lets regulated teams rely on the table format alone. Until then, the safe design combines tags for policy, catalog permissions for access control, and a ledger for evidence.

## Conclusion

Aggressive maintenance and long-term retention are compatible on Apache Iceberg, as long as you stop asking the global retention window to do both jobs. Keep the window short for operational needs. Protect specific points in time with tags that carry their own lifetimes.

The details decide whether it works. Reference age is measured from the snapshot's timestamp, not the tag's creation. Tags protect one snapshot, not its history. Rewrites after a tag pin old files and grow storage. Tags do not stop anyone with metadata permissions from dropping them, and they do nothing against storage lifecycle rules or table drops. Retention holds and erasure requests meet at the same files, and resolving that takes both engineering design and legal judgment.

Build tag creation into your business workflows, keep a ledger that explains every reference, reconcile the two every night, and test your maintenance tools against a known set of references after every upgrade. That gives auditors reproducible numbers years later, and it keeps your nightly maintenance running at full speed.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg table design and operations. *Apache Iceberg: The Definitive Guide* covers snapshots, branching, tagging, and table maintenance in depth, and *Architecting an Apache Iceberg Lakehouse* walks through the operational design of a production lakehouse. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
