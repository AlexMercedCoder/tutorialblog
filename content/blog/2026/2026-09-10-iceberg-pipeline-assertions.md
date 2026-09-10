---
title: "What to Assert When You Test an Iceberg Pipeline"
date: "2026-09-10"
description: "Fixtures, in-memory catalogs, and golden metadata: the assertions that catch wrong rows, unsafe reruns, schema drift, and concurrent-write corruption in CI."
author: "Alex Merced"
category: "Data Engineering"
tags:
  - Apache Iceberg
  - testing
  - CI
  - data pipelines
  - PyIceberg
canonical: https://iceberglakehouse.com/posts/iceberg-pipeline-assertions/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-pipeline-assertions/).

Here is a test that passes on every pipeline I have ever seen and proves almost nothing:

```python
def test_pipeline_runs():
    run_pipeline()
    table = catalog.load_table("sales.orders")
    assert table.scan().to_arrow().num_rows > 0
```

It confirms the job did not throw and that something landed. It does not confirm the right rows landed, that reruns are safe, that the schema still matches what downstream expects, that a concurrent writer does not corrupt the result, or that the table's history looks like the pipeline intended. Every one of those has broken a production pipeline, and none of them shows up as an exception.

The environment question, how to get a catalog and a bucket running in CI, is largely solved. Containerized REST catalogs, local object storage, and in-memory catalogs make a realistic test environment a configuration file. What is much less settled is what to put in the tests once you have one.

This piece is about the assertions. Five classes of them, what each catches, the Iceberg-specific facts that make them checkable, and how to keep the suite fast enough that people run it. I work at Dremio, so the lakehouse enthusiasm is professional. The techniques below are library-level and apply wherever your tables live.

## Why row counts are the weakest assertion available

Counting rows checks one property and misses most failure modes.

**Wrong rows, right count.** A join with a subtly wrong condition returns the same number of rows and different values. A filter using the wrong timezone shifts a day's worth of records without changing the total.

**Right rows, wrong table state.** The data is correct and the pipeline wrote it as a full overwrite instead of an append, destroying the history downstream consumers time-travel against.

**Right result, unsafe to rerun.** The output is correct on the first run and doubles on the second, which nobody discovers until a backfill.

**Right output, broken contract.** A column got renamed and the data is fine, and the three downstream jobs that reference the old name are not.

**Right everything, until concurrency.** A test suite that runs one writer at a time never exercises the commit conflict path that production hits nightly.

The reframe that makes testing here tractable: **an Iceberg pipeline produces two artifacts, the data and the table's metadata, and both deserve assertions.** Most test suites check the first partially and the second not at all, which is unfortunate, because the metadata is the part Iceberg makes trivially inspectable.

## Five classes of assertion

The taxonomy worth organizing a suite around.

**One: output correctness.** The rows are what the logic should produce. Ordinary data testing, and the class most teams already do something about.

**Two: table state.** The snapshot history, the operation types, the file counts and sizes, the partition layout. What the pipeline did to the table, not just what it put in it.

**Three: schema contract.** The schema still satisfies what consumers depend on, and evolution happened the way it was supposed to.

**Four: idempotency and recovery.** Rerunning is safe, partial failure is recoverable, and a retry does not duplicate.

**Five: concurrency.** Behavior under simultaneous writers, which is the class almost nobody tests and which produces the most confusing production incidents.

The rest of this article is those five, with what to assert in each.

## Table state assertions

Start here, because it is the class Iceberg makes uniquely easy and almost nobody exploits. Every commit records what it did, in a summary you read directly.

```python
def test_daily_load_appends_rather_than_overwrites(catalog, seeded_table):
    before = seeded_table.current_snapshot().snapshot_id

    run_daily_load(date="2026-09-10")

    table = catalog.load_table("sales.orders")
    snapshot = table.current_snapshot()
    summary = snapshot.summary

    # The operation itself is an assertion target
    assert snapshot.parent_id == before
    assert summary["operation"] == "append"
    assert int(summary["added-data-files"]) > 0
    assert int(summary.get("deleted-data-files", 0)) == 0
    assert int(summary["added-records"]) == 4_820
```

Four things that test catches which a row-count test does not. A pipeline that switched from append to overwrite, which is a one-line change somebody makes to fix a duplicate problem and which destroys incremental consumers. A pipeline that deleted files it should not have. A commit that landed more than one snapshot when it was supposed to be atomic. And a load that wrote the right total by writing the wrong amount twice.

The snapshot summary is a dictionary of counts and it is the highest-value assertion surface in Iceberg testing. The keys worth asserting on regularly: `operation`, `added-data-files`, `deleted-data-files`, `added-records`, `deleted-records`, `added-position-deletes`, and `total-records`.

**Assert on file layout when layout matters.**

```python
def test_load_produces_reasonably_sized_files(catalog):
    run_daily_load(date="2026-09-10")
    table = catalog.load_table("sales.orders")

    files = table.inspect.files().to_pylist()
    todays = [f for f in files if f["partition"]["order_date"] == date(2026, 9, 10)]

    assert len(todays) <= 8, f"partition fragmented into {len(todays)} files"
    assert min(f["file_size_in_bytes"] for f in todays) > 8 * 1024 * 1024
```

A pipeline that starts writing 400 tiny files per partition because someone changed the parallelism is a performance regression that no functional test catches and that costs real money once it ships. Asserting a bound on file count per partition turns it into a failing build.

**Assert on partitioning.** That rows landed in the partitions they belong to, which catches a wrong transform or a timezone bug at the point where it is cheap to find:

```python
def test_rows_land_in_correct_partitions(catalog):
    run_daily_load(date="2026-09-10")
    table = catalog.load_table("sales.orders")

    partitions = {
        f["partition"]["order_date"]
        for f in table.inspect.files().to_pylist()
    }
    assert partitions == {date(2026, 9, 10)}, f"leaked into {partitions}"
```

That one has caught a UTC-versus-local bug in every pipeline I have seen it applied to that had one.

## Golden metadata

For pipelines whose table-shaping behavior needs to stay stable, snapshot-testing the metadata works well, with one requirement: normalize before comparing.

Raw Iceberg metadata contains snapshot IDs, timestamps, file paths with UUIDs, and sequence numbers, all of which change every run. A naive comparison fails always and teaches people to regenerate the golden file without reading it, which is worse than no test.

```python
NOISE = {"snapshot-id", "timestamp-ms", "sequence-number", "manifest-list",
         "metadata-file", "file-path", "parent-snapshot-id", "added-files-size",
         "removed-files-size", "total-files-size", "snapshot-log", "metadata-log"}

def normalize(node):
    """Strip run-specific values so structure and semantics remain comparable."""
    if isinstance(node, dict):
        return {
            k: normalize(v)
            for k, v in sorted(node.items())
            if k not in NOISE
        }
    if isinstance(node, list):
        return [normalize(v) for v in node]
    return node

def test_table_structure_matches_golden(catalog, golden_path):
    run_full_pipeline()
    table = catalog.load_table("sales.orders")

    actual = normalize({
        "schema": table.schema().model_dump(),
        "partition_spec": table.spec().model_dump(),
        "sort_order": table.sort_order().model_dump(),
        "properties": dict(table.properties),
        "operations": [s.summary["operation"] for s in table.snapshots()],
    })

    expected = json.loads(golden_path.read_text())
    assert actual == expected
```

What that catches: an unintended schema change, a partition spec evolution nobody meant to make, a table property silently altered by a library upgrade, and a change in the sequence of operations the pipeline performs. All of those are real regressions and all of them are invisible to data assertions.

Three rules keep golden tests useful rather than annoying.

**Golden files are reviewed in the pull request.** A diff in the golden file is the point. If regenerating is a reflex, the test is decoration.

**Keep the golden narrow.** Schema, spec, sort order, properties, operation sequence. Not the whole metadata document, which includes far too much churn.

**One golden per pipeline, not per test.** They are maintenance surface, and a suite with forty golden files gets regenerated in bulk the first time something structural changes.

## Schema contract assertions

Schema breakage is the most common way a data pipeline breaks something it does not own. Iceberg's field IDs make the contract precisely checkable.

```python
def test_schema_contract_preserved(catalog):
    table = catalog.load_table("sales.orders")
    schema = table.schema()

    # Consumers depend on these field IDs, not on names.
    contract = {1: "order_id", 2: "customer_id", 5: "order_date", 9: "amount"}

    for field_id, expected_name in contract.items():
        field = schema.find_field(field_id)
        assert field is not None, f"field {field_id} removed"
        assert field.name == expected_name, (
            f"field {field_id} renamed from {expected_name} to {field.name}"
        )

def test_no_required_field_added(catalog, previous_schema):
    schema = catalog.load_table("sales.orders").schema()
    new_ids = {f.field_id for f in schema.fields} - {f.field_id for f in previous_schema.fields}
    for fid in new_ids:
        assert schema.find_field(fid).optional, (
            f"new field {fid} is required, which breaks existing writers"
        )
```

The second test encodes an Iceberg-specific compatibility rule as an assertion. Adding a required field breaks writers that do not supply it, and it is exactly the kind of change that looks harmless in review.

Two more worth having.

**Type widening only.** Iceberg permits certain type promotions and forbids others. A test that fails on a narrowing change catches a class of data loss before it reaches a table.

**Field ID stability across a rebuild.** If your pipeline ever recreates a table rather than evolving it, field IDs change, and every consumer relying on them silently reads different columns. A test asserting that a specific field ID maps to a specific name catches a table that was dropped and recreated when it should have been altered.

## Idempotency

The property most often assumed and least often tested. The assertion is simple: run it twice, get the same table.

```python
def test_daily_load_is_idempotent(catalog):
    run_daily_load(date="2026-09-10")
    first = catalog.load_table("sales.orders").scan().to_arrow()

    run_daily_load(date="2026-09-10")     # same input, again
    second = catalog.load_table("sales.orders").scan().to_arrow()

    assert first.num_rows == second.num_rows
    assert first.sort_by("order_id").equals(second.sort_by("order_id"))
```

Then the more interesting variant, which tests recovery rather than repetition:

```python
def test_partial_failure_leaves_no_partial_data(catalog, monkeypatch):
    before = catalog.load_table("sales.orders").scan().to_arrow().num_rows

    # Fail after data files are written but before the commit lands
    monkeypatch.setattr("mypipeline.writer.commit", raise_io_error)
    with pytest.raises(IOError):
        run_daily_load(date="2026-09-10")

    after = catalog.load_table("sales.orders").scan().to_arrow().num_rows
    assert after == before, "uncommitted data became visible"

    # And the retry succeeds cleanly
    monkeypatch.undo()
    run_daily_load(date="2026-09-10")
    assert catalog.load_table("sales.orders").scan().to_arrow().num_rows > before
```

That test asserts the property Iceberg gives you and your pipeline is capable of throwing away: atomicity. Data files written before a failed commit are orphans, not visible rows. A pipeline that reads its own uncommitted output, or that registers files outside the commit path, breaks this, and the failure only appears during an incident.

**The orphan question deserves its own assertion.** A failed run leaves files behind. That is correct behavior and it is worth knowing:

```python
def test_failed_run_leaves_orphans_for_cleanup(catalog, warehouse_path):
    files_before = set(list_all_objects(warehouse_path))
    with pytest.raises(IOError):
        run_daily_load(date="2026-09-10")
    orphans = set(list_all_objects(warehouse_path)) - files_before

    referenced = {f["file_path"] for f in
                  catalog.load_table("sales.orders").inspect.files().to_pylist()}
    assert orphans, "expected uncommitted files to exist"
    assert not (orphans & referenced), "orphaned files are referenced by the table"
```
## Output correctness, done properly

The class everyone already attempts. Three upgrades make it much stronger than a row count.

**Compare content, not cardinality.** Sort both sides on a stable key and compare the tables. Arrow makes this cheap and it catches the wrong-values-right-count failure that counts miss entirely.

```python
def test_daily_aggregate_values(catalog, expected_frame):
    run_daily_aggregate(date="2026-09-10")
    actual = (catalog.load_table("sales.daily_revenue")
              .scan(row_filter="report_date = '2026-09-10'")
              .to_arrow()
              .sort_by("region"))
    assert actual.select(["region", "revenue"]).equals(expected_frame)
```

**Assert business invariants, not just expected output.** Expected-output tests break whenever the fixture changes, which trains people to update fixtures rather than investigate. Invariants survive fixture changes and encode what has to stay true:

```python
def test_revenue_invariants(catalog):
    df = catalog.load_table("sales.daily_revenue").scan().to_arrow().to_pandas()

    assert (df["revenue"] >= 0).all(), "negative revenue"
    assert df["region"].isin(VALID_REGIONS).all(), "unknown region code"
    assert not df.duplicated(subset=["report_date", "region"]).any(), "duplicate grain"
    assert df["revenue"].sum() <= df["gross_amount"].sum(), "net exceeds gross"
```

Those four lines encode more of what "correct" means than any golden output file, and they keep working when someone adds a region.

**Test the edges deliberately.** Empty input, a single row, a day with no activity, a late-arriving record for a closed period, a null in a column the logic assumes is populated. Each is a fixture and an assertion, and each is a production incident in most pipelines that has not tested it. The empty-input case in particular deserves a test, because a pipeline that overwrites a partition with an empty result set deletes a day of data and reports success.

## History and time travel

Iceberg's history is a feature consumers depend on, which makes it a contract worth asserting.

```python
def test_time_travel_returns_prior_state(catalog):
    table = catalog.load_table("sales.orders")
    baseline_snapshot = table.current_snapshot().snapshot_id
    baseline_rows = table.scan().to_arrow().num_rows

    run_daily_load(date="2026-09-10")

    table = catalog.load_table("sales.orders")
    assert table.scan().to_arrow().num_rows > baseline_rows

    historical = table.scan(snapshot_id=baseline_snapshot).to_arrow()
    assert historical.num_rows == baseline_rows
```

Two related assertions worth having.

**Tags and branches, where you use them.** A pipeline that creates a tag for an audited period should be tested for creating it, and for the tag continuing to resolve after subsequent writes and after expiry runs. A tagged snapshot that expiry removes is a compliance problem discovered late.

**Rollback works.** Roll the table back to a prior snapshot in a test and assert the data matches that snapshot's state. Rollback is the recovery mechanism for a bad load, and the first time you use it should not be during the bad load.

```python
def test_rollback_restores_prior_state(catalog):
    table = catalog.load_table("sales.orders")
    good = table.current_snapshot().snapshot_id
    good_rows = table.scan().to_arrow().num_rows

    run_bad_load()                      # writes wrong data
    table = catalog.load_table("sales.orders")
    assert table.scan().to_arrow().num_rows != good_rows

    rollback_to(table, good)
    table = catalog.load_table("sales.orders")
    assert table.scan().to_arrow().num_rows == good_rows
```

## Cross-engine assertions

If more than one engine touches your tables, and in a lakehouse that is the normal case, the interesting failures live between them.

**Write in one, read in the other.** The single most valuable cross-engine test. A pipeline writing from Python and a consumer reading from a JVM engine should agree on every value, and the disagreements when they occur are in the places you expect: timestamp precision and timezone handling, decimal scale, nested type representation, and null versus empty for collections.

```python
@pytest.mark.integration
def test_python_write_readable_by_spark(catalog, spark, temp_namespace):
    table_id = f"{temp_namespace}.roundtrip"
    create_table_with_all_types(catalog, table_id)
    catalog.load_table(table_id).append(edge_case_batch())

    rows = spark.sql(f"SELECT * FROM lake.{table_id} ORDER BY id").collect()
    assert rows[0]["event_ts"] == expected_timestamp
    assert rows[0]["amount"] == Decimal("12345.67")
    assert rows[0]["tags"] == []          # empty list, not null
```

**Assert on delete semantics across engines** where you use merge-on-read. An engine writing equality deletes and another reading them is a path with real historical variation, and a test with a delete followed by a cross-engine read is cheap insurance.

**Pin versions and test the upgrade.** Cross-engine compatibility is version-specific. Pinning the engine and library versions in the test environment makes the suite stable, and adding a scheduled job that runs the same suite against the newest versions tells you about an incompatibility before an upgrade rather than after.

## A suite layout that scales

Concretely, how to organize this so it stays maintainable at a few hundred tests.

```
tests/
  unit/                      # no catalog, pure logic, milliseconds
    test_transformations.py
    test_business_rules.py
  table/                     # local catalog on tmpdir, no containers, seconds
    conftest.py              # catalog fixture, namespace fixture, seed helpers
    test_snapshot_behavior.py
    test_schema_contract.py
    test_idempotency.py
    test_partitioning.py
  integration/               # containers: REST catalog, object store, engines
    conftest.py
    test_cross_engine.py
    test_concurrency.py
    test_maintenance.py
  golden/
    orders_pipeline.json
```

The properties that make this hold up.

**The middle tier does most of the work.** Snapshot assertions, schema contracts, idempotency, and partitioning all run against a local catalog with no containers. That tier is fast enough to run constantly and it contains the majority of the assertions in this article.

**Fixtures build tables directly.** Seed helpers that append batches to construct a table in a known state, rather than running pipelines to produce fixtures. Faster, deterministic, and the fixture's intent is readable.

**Each module owns a namespace.** Created in a module-scoped fixture with a unique suffix, dropped afterward, so parallel execution is safe.

**Integration tests are marked and separable.** A marker that lets developers run everything except containers locally, with CI running the full set.

## What CI should run, and when

Different assertions belong at different points, and running everything everywhere is how a suite gets disabled.

**On every commit: unit and table tiers.** Seconds to a couple of minutes. Fast enough that nobody routes around it.

**On every pull request: add integration.** Containers, cross-engine, concurrency, maintenance. Several minutes is acceptable here, and the pull request is the right place to pay it.

**Nightly: the slow and probabilistic ones.** Larger fixtures, longer concurrency runs with more writers, and the full maintenance sequence against a table with real history. Concurrency tests are inherently a bit probabilistic, so running them repeatedly at night finds the race a single run misses.

**Weekly, against unpinned versions.** The same suite against the latest engine and library releases, allowed to fail without blocking anyone, reporting into a channel somebody reads. This is how you find out that the next Spark or PyIceberg release changes a behavior you depend on, with time to react.

**On a schedule against production-shaped data.** Where you can, a copy of a real table's structure with synthetic data at realistic scale. Assertions about file counts and partition layout mean something at scale and very little on a fixture with forty rows.

The organizing principle: fast assertions early and often, expensive assertions where someone is already waiting, and probabilistic assertions repeatedly on a schedule.

## Concurrency

The class nobody tests and the one that produces the incidents nobody can reproduce.

Iceberg commits are optimistic. Two writers touching the same table both prepare a commit, the first wins, and the second either retries against the new state or fails. Whether your pipeline handles that correctly is a property of your code, not of Iceberg, and it is testable in a single process.

```python
def test_concurrent_appends_both_land(catalog):
    table_id = "sales.orders"
    before = catalog.load_table(table_id).scan().to_arrow().num_rows

    def append(batch_id):
        # Each thread loads its own table instance, mirroring separate processes
        tbl = catalog.load_table(table_id)
        tbl.append(make_batch(batch_id, rows=100))

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(append, range(4)))

    after = catalog.load_table(table_id)
    assert after.scan().to_arrow().num_rows == before + 400

    # Four separate commits, each an append, none lost
    ops = [s.summary["operation"] for s in after.snapshots()][-4:]
    assert ops == ["append"] * 4
```

That test catches a real and common bug: a pipeline that loads the table once, holds the reference, and commits against stale state. Under low concurrency it works. Under load it either fails with a conflict or, worse, retries in a way that duplicates.

The more valuable version pits a writer against maintenance, which is the collision that actually happens in production:

```python
def test_append_during_compaction_does_not_lose_data(catalog, spark):
    load_partition(date="2026-09-10", rows=5_000)
    expected = catalog.load_table("sales.orders").scan().to_arrow().num_rows

    with ThreadPoolExecutor(max_workers=2) as pool:
        compaction = pool.submit(run_compaction, partition="2026-09-10")
        appending  = pool.submit(load_partition, date="2026-09-10", rows=1_000)
        compaction.result()
        appending.result()

    final = catalog.load_table("sales.orders").scan().to_arrow().num_rows
    assert final == expected + 1_000
```

Whichever one loses the race retries and both effects survive. If your compaction job or your writer swallows a conflict and moves on, this test fails and a production run silently drops a thousand rows.

**Assert on retry behavior explicitly** where your pipeline configures it. A commit retry setting changed to zero during debugging and never changed back is a real thing that happens, and a test reading the table property catches it in seconds. The same applies to the retry backoff and the maximum retry window, both of which get tuned during an incident and forgotten afterward.

## Assertions for migrations and backfills

Two operations that touch tables destructively and get tested least, because they are one-off work that nonetheless runs against production.

**Backfills.** A backfill rewrites history, which means it interacts with everything above: idempotency, partition placement, file layout, and any consumer time-travelling through the period being rewritten.

Three assertions worth having before a backfill runs against anything real. That the backfill for a single partition changes only that partition, verified by comparing file lists outside the target range before and after. That running the backfill twice produces the same table, since backfills get interrupted and restarted more often than daily loads. And that the row count and key aggregates for untouched periods are unchanged, which catches an overly broad filter before it rewrites a year of data.

**Migrations into Iceberg.** Bringing an existing dataset in, whether from Hive tables, another format, or raw files, is a one-time operation with permanent consequences. The assertion that matters most is a full reconciliation: row counts and per-column aggregates on both sides, computed independently, compared. Sampling is not enough here, because migration failures are frequently systematic rather than random, affecting a partition or a type rather than scattered rows.

Two further checks for migrations. That the resulting partition spec matches intent, since a migration that lands everything in one partition works and performs badly forever. And that field IDs were assigned in a way that supports the schema evolution you plan next, which is a detail nobody thinks about during a migration and which constrains everything afterward.

**The general rule for one-off operations.** Write the assertions as a script that runs before and after, rather than as tests in a suite. They execute once, they need to be reviewable by whoever approves the operation, and they belong in the runbook next to the command they verify.

## Testing maintenance

Maintenance jobs are pipelines too and they modify tables destructively, which makes them worth the same scrutiny.

```python
def test_expire_snapshots_respects_retention(catalog, spark):
    # Table seeded with snapshots spanning 30 days
    table = catalog.load_table("sales.orders")
    before = len(list(table.snapshots()))

    run_expiry(older_than=days_ago(7), retain_last=10)

    table = catalog.load_table("sales.orders")
    remaining = list(table.snapshots())
    assert len(remaining) >= 10
    assert all(
        s.timestamp_ms >= days_ago_ms(7) or s in remaining[-10:]
        for s in remaining
    )
    # And the current data is untouched
    assert table.scan().to_arrow().num_rows == expected_rows
```

Three maintenance assertions worth having in any suite.

**Expiry never touches current data.** The row count before and after is identical. An expiry misconfiguration that deletes live files is unrecoverable, and this test costs nothing.

**Compaction preserves rows exactly.** Not approximately. Read the full table before and after and compare sorted content, not just counts. Compaction is a rewrite, and a rewrite that drops or duplicates rows is the worst possible bug in a data platform.

**Orphan cleanup respects its retention interval.** Write a file, do not commit it, run cleanup with a retention interval longer than the file's age, and assert the file survives. This test protects against the configuration change that deletes in-flight data from a running job.

## Fixtures that make assertions possible

Half the difficulty of the assertions above is arranging a table in the state a test needs. Four fixture patterns cover nearly everything.

**The seeded table.** A table with a known schema and a known set of rows, built by direct appends rather than by running a pipeline. Module-scoped so it is built once, with each test working inside its own namespace.

```python
@pytest.fixture(scope="module")
def seeded_table(catalog, temp_namespace):
    identifier = f"{temp_namespace}.orders"
    catalog.create_table(identifier, schema=ORDERS_SCHEMA, partition_spec=BY_DAY)
    table = catalog.load_table(identifier)
    for day in range(1, 8):
        table.append(orders_batch(date(2026, 9, day), rows=1_000))
    return table
```

Seven appends produce seven snapshots, which is what expiry and time-travel tests need, and it takes under a second.

**The history-rich table.** For maintenance tests: many snapshots spanning a wide time range. Building it by appending with an injected clock, rather than by waiting, is the trick that makes retention testing practical.

**The fragmented table.** For compaction tests and file-layout assertions: many small files in one partition, produced by many tiny appends. Deliberately creating the pathological state is how you assert that maintenance fixes it.

**The edge-case batch.** One row exercising every type the schema contains, with the values that historically differ across engines: a timestamp with sub-second precision, a decimal at the scale boundary, an empty list, a null in a nested field, a string with non-ASCII characters. One batch, reused across cross-engine tests, and it catches type-handling differences far more efficiently than realistic data.

Two habits keep fixtures from becoming their own maintenance problem. Build them from small composable helpers rather than large snapshots of data, so a schema change is one edit. And keep fixture data obviously synthetic, since realistic-looking test data invites people to reason about it as if it were real.

## What the metadata tables give you

Iceberg exposes its own metadata as queryable tables, and each one supports a class of assertion that is awkward to write any other way.

**`files`**. every data file with its partition, size, record count, and column statistics. The basis for file-layout assertions, partition placement checks, and any test about fragmentation.

**`snapshots`**. the commit history with operation types and summaries. The basis for table-state assertions and for anything about what a pipeline did.

**`manifests`**. the manifest files and their partition summaries. Useful when asserting that manifest rewriting actually clustered by partition.

**`history`**. the sequence of current-snapshot changes, including rollbacks, which distinguishes "this snapshot exists" from "this snapshot was current at some point."

**`partitions`**. aggregates per partition, which makes skew and distribution assertions a single query.

**`refs`**. branches and tags, for asserting that a tag your compliance process depends on still exists after maintenance ran.

A pattern worth adopting: when you find yourself writing a test that scans the whole table to check something structural, look for the metadata table that answers it directly. The test gets faster and it usually gets more precise, because the metadata answers the structural question exactly while a scan answers it by inference.

## Testing the tests

One last loop, because a suite that passes when it should fail is worse than no suite.

**Break something on purpose, once per assertion class.** Change an append to an overwrite and confirm the snapshot test fails. Introduce a duplicate and confirm the idempotency test fails. Rename a field and confirm the contract test fails. This takes an hour and it is the only way to know the assertions are wired to what you think they are.

**Watch for assertions that never fail.** A test that has passed unchanged for two years across many pipeline changes is either protecting something genuinely stable or asserting nothing. Reviewing them occasionally against what they actually check catches the second case.

**Keep failure messages specific.** `assert len(files) <= 8` tells a future engineer nothing at 3am. Including the actual count and the partition in the message turns a failed build into a diagnosis, and it takes ten extra characters.

**Track suite runtime as a metric.** A suite that grows from ninety seconds to nine minutes gets skipped, and the growth is always gradual. Watching the number keeps the tiering honest.

## Keeping the suite fast

Assertions people do not run are worth nothing, so speed is a correctness property of the test suite itself.

**Tier the tests by what they need.** Most assertions in this article run against a local catalog on a temp directory with no containers at all: schema contracts, idempotency of pure logic, snapshot summaries from small appends. Reserve containerized catalogs and JVM engines for the tests that genuinely need cross-engine behavior. The fast tier should run on every save and the slow tier on every push.

**Seed with fixtures, not with pipelines.** A test asserting expiry behavior needs a table with thirty snapshots. Producing that by running the pipeline thirty times is slow. Producing it by appending thirty tiny batches directly takes a second.

**Isolate with namespaces rather than resets.** Each test module creates a uniquely suffixed namespace and drops it afterward. Tests run in parallel against one catalog, a failure's leftovers stay confined, and no ordering dependencies get hidden by a reset between tests.

**Make data deterministic.** Fixed seeds, fixed timestamps, injected clocks. A pipeline reading `current_date()` internally cannot be asserted against a known result, and passing the date in as a parameter is a design improvement as well as a testing one.

**Assert on summaries before scanning data.** Reading a snapshot summary is a metadata operation. Reading the table is a scan. Where a metadata assertion catches the bug, prefer it, and the suite stays fast at larger fixture sizes.

## Assertions for streaming pipelines

Streaming writers need a different set, because the failure modes differ from batch.

**Commit cadence.** A streaming job committing every record produces a snapshot per record and a metadata explosion. A job committing every hour when it was configured for every minute has a freshness problem. Both are assertions on snapshot count over a bounded run:

```python
def test_streaming_commit_cadence(catalog, stream_harness):
    stream_harness.run_for(seconds=60, records_per_second=500)

    snapshots = list(catalog.load_table("events.clicks").snapshots())
    assert 3 <= len(snapshots) <= 8, (
        f"expected roughly one commit per 10s, got {len(snapshots)}"
    )
```

**Exactly-once under restart.** Kill the writer mid-stream, restart it, and assert no duplicates and no gaps. This is the property streaming writers claim and the one most worth verifying, since the mechanism depends on checkpoint and commit coordination that is easy to configure wrong.

**File size under streaming.** Streaming produces small files by nature, and the assertion is a bound on how small. A test that fails when the average file in a partition drops below a threshold catches a parallelism or commit-interval change before it produces a table nobody can query efficiently.

**Delete accumulation on upsert streams.** Where a streaming job writes equality deletes, assert a bound on delete file count per partition over a run. Unbounded delete accumulation degrades reads continuously and shows up as a gradual slowdown that nobody attributes to the writer.

## Two objections

**"This is a lot of tests for a data pipeline."** The list is long because it is a menu rather than a mandate. The realistic minimum is one snapshot summary assertion and one idempotency test per pipeline, plus schema contracts on tables with external consumers. That is perhaps two hours per pipeline and it catches the majority of what this article describes. The concurrency, cross-engine, and golden metadata tiers earn their cost on tables where the corresponding risk is real, and not everywhere.

**"Our data tests already cover this."** Usually they cover output correctness and nothing else. The distinguishing question: does any current test fail if the pipeline switches from append to overwrite while producing identical rows? In most suites the answer is no, and that single change has broken incremental consumers, deleted history that compliance needed, and multiplied storage costs. It is a one-word diff in a job definition, and a three-line assertion catches it.

## The habit worth building

Every incident that reaches production should leave a test behind, and the useful discipline is being specific about which class it belongs to.

A duplicate-rows incident is an idempotency test. A downstream break after a rename is a schema contract test. A partition that filled up with tiny files is a file-layout assertion. A nightly job that started failing under a new maintenance schedule is a concurrency test. Mapping the incident to the class produces a test that catches the category rather than the instance, which is the difference between a suite that grows in value and one that grows in length.

Over a year that practice produces a suite shaped like your actual failure modes rather than like a testing checklist, and the assertions in it are the ones your pipelines have earned.

## Anti-patterns

Six patterns that produce test suites people stop trusting.

**Asserting on exact file paths.** They contain UUIDs and change every run. Assert on counts, sizes, and partitions instead.

**Asserting on snapshot IDs.** Same problem. Assert on relationships, like a snapshot's parent being what you expect, rather than on values.

**Golden files regenerated without review.** The diff is the test. A workflow where regenerating is the standard response to a failure is a workflow with no test.

**Tests that share a table.** Order dependence, mysterious failures under parallelism, and one test's cleanup breaking another. Namespace per module fixes it.

**Mocking the catalog.** Tempting for speed and it removes the thing you are testing. Iceberg's semantics live in the commit path, and a mocked commit asserts that your mock works. A local catalog on a temp directory runs in milliseconds, so mocking buys almost nothing and costs the entire class of table-state assertions described here.

**Testing only the happy path.** Every assertion class above except the first is about a path that is not the happy one, and those are the paths that break in production, because the happy path is the one that got manual attention during development. The rerun, the conflict, the empty input, and the partial failure all happen for the first time in production unless a test made them happen first.

## What this catches, in practice

To make the case concrete, here are failures that each assertion class has caught, stated as the incident they prevent.

**Snapshot summary assertions.** A change from append to overwrite made while fixing a duplicate-row bug, which fixed the duplicates and deleted three years of history that the finance team time-travelled against monthly. The pull request looked correct and every data test passed.

**File layout assertions.** A parallelism increase from 8 to 200 in a Spark job, made to speed up a slow load. It sped up the load and produced 200 files per partition instead of 8. Query latency on the table tripled and the cause was found two weeks later.

**Partition placement assertions.** A pipeline reading timestamps as UTC and partitioning on a local date, so every day's data straddled two partitions. Queries filtering on a single day silently missed several hours of records, and reconciliation against the source system was the eventual discovery mechanism.

**Idempotency assertions.** A retry after a transient failure that appended a batch a second time, in a pipeline whose commit was atomic and whose input-marking was not. Discovered by a business user noticing revenue was too high on one day.

**Schema contract assertions.** A column rename described in a pull request as a clarity improvement, breaking four downstream jobs that referenced it by name, in three different teams.

**Concurrency assertions.** A compaction job and a streaming writer colliding, where the compaction retried and the writer swallowed the conflict, dropping a few thousand records per collision. Invisible in aggregate and found during an audit.

The pattern across all six: none threw an exception, all produced a table that looked healthy, and each cost far more to diagnose after the fact than the matching assertion costs to write. That asymmetry is the argument for the whole practice.

## Where to start

For a team with an environment and thin assertions, the order that finds bugs fastest.

**First, snapshot summary assertions on every pipeline.** One test per pipeline asserting the operation type and the added file and record counts. Half a day of work across a codebase, and it catches append-versus-overwrite regressions immediately.

**Second, idempotency.** Run twice, compare. This one finds real bugs in a surprising share of pipelines that have never been tested for it, and the test is four lines.

**Third, schema contracts on tables with external consumers.** Field IDs, optionality of new fields, no narrowing type changes.

**Fourth, one concurrency test per table with more than one writer.** Including maintenance as one of the writers.

**Fifth, partition placement.** Cheap, and it catches timezone bugs that otherwise surface as a customer noticing a number is wrong weeks later.

**Then golden metadata**, once the rest is in place and the structure is stable enough that a diff means something.

That sequence puts the highest-yield assertions first and leaves the maintenance-heavy ones for last, which is the right order for a practice you want people to keep up.

## Conclusion

An Iceberg pipeline produces two things worth asserting on, and most test suites check one of them partially. The data matters and the table state matters, and the table state is the part Iceberg hands you for free in a snapshot summary you can read in three lines.

Assert that the operation was the operation you meant. Assert on added and deleted file counts, so a pipeline that quietly switched from append to overwrite fails a build rather than a downstream consumer. Assert that rows landed in the partitions they belong to. Assert that running twice produces the same table, and that a failure partway through leaves nothing visible. Assert that field IDs your consumers depend on still map to the columns they think they do. And run two writers at once, including maintenance, because that collision happens nightly in production and never in a test suite that runs one thing at a time.

None of it is exotic and all of it is cheap once the environment exists. The reason it goes unwritten is that a passing pipeline feels like a working pipeline, and the failures in this list do not throw exceptions. They produce a table that looks fine and is not.

Start with the snapshot summary. It is three lines and it will fail on something.

## Keep Going

If this piece was useful, I have written a lot more on Iceberg internals and engineering practice. *Apache Iceberg: The Definitive Guide* covers the snapshot, manifest, and schema mechanics every assertion in this article relies on, and *Architecting an Apache Iceberg Lakehouse* covers the platform practices around them. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
