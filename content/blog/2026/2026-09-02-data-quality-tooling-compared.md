---
title: "Data Quality Tooling Compared: Great Expectations, Soda, dbt Tests, and Anomaly Detection"
date: "2026-09-02"
description: "A comparison of Great Expectations, Soda, dbt tests, and anomaly detection, and a layered design that uses each where it fits."
author: "Alex Merced"
category: "Data Quality"
tags:
  - Great Expectations
  - Soda
  - dbt
  - Data Quality
  - Anomaly Detection
canonical: https://iceberglakehouse.com/posts/data-quality-tooling-compared/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/data-quality-tooling-compared/).

A revenue dashboard shows a 40 percent drop for yesterday. Every pipeline reported success. Every dbt test passed. The orders table has a fresh snapshot with a plausible row count. Three hours of investigation later, the cause is a source system that started sending amounts in cents instead of dollars after an upgrade nobody announced. No test checked that. No test was going to, because nobody knew to write it.

That story has two halves, and data quality tooling has split along the same line. The first half is validation: rules written in advance, evaluated after a load, that fail when the data violates them. Great Expectations, Soda, and dbt tests are validation tools, and they catch what someone anticipated. The second half is anomaly detection: statistical monitoring of volume, freshness, distribution, and schema over time, that alerts when the data departs from its own history. Elementary, Monte Carlo, Anomalo, Bigeye, and the observability features in the major platforms are detection tools, and they catch what nobody anticipated.

A lakehouse on Apache Iceberg changes what both halves can do, because the table format exposes a metadata layer that a warehouse does not: every commit is a snapshot with a summary, every file has statistics, and a rule or a monitor can read table state directly instead of scanning rows. This article compares the tools on how they express checks, where they run, what they cost to operate, and how they use Iceberg metadata, then lays out a layered design that uses each where it fits. The tooling itself shifted in 2026: Fivetran took stewardship of the Great Expectations open-source project in May and GX Cloud shut down on June 1, and Datadog's 2025 acquisition of Metaplane pulled one anomaly-detection vendor into an infrastructure monitoring platform. I work at Dremio, and none of these tools is a Dremio product.

## Validation and Detection Are Different Jobs

The distinction matters because teams buy one expecting the other.

Validation answers "does this data satisfy the rules I wrote?" A rule is a predicate over a table or column: not null, unique, within a set, within a range, matches a regex, referentially consistent with another table, row count above a floor. Rules are deterministic, cheap to evaluate, and precise about what failed. They are also only as good as the person who wrote them, and they are silent about anything they do not cover. Validation belongs in the pipeline, as a gate between a load and its publication.

Detection answers "does this data look like it usually does?" A monitor tracks a metric over time, row count per day, null rate per column, distinct count, mean and percentiles, time since last update, and fits a model of what is normal. When today's value falls outside the model's confidence band, it alerts. Detection requires history, produces probabilistic signals rather than pass/fail, and generates false positives that have to be tuned. It catches the cents-versus-dollars problem because the mean amount drops by two orders of magnitude, which no rule anticipated and every model notices. Detection belongs alongside the pipeline, as a monitor rather than a gate, because a probabilistic signal should page a human rather than block a load.

A mature setup has both. The validation layer gates known constraints. The detection layer watches everything else. And on an Iceberg lakehouse, a third layer sits underneath: the table's own metadata, which both validation and detection can read for free.

## What Iceberg Metadata Gives Both Layers

Every Iceberg commit produces a snapshot with a `summary` map: the operation type, files added and deleted, records added and deleted, and total sizes. Every data file has per-column value counts, null counts, and min/max bounds in its manifest entry. Every table has a `refs` map of branches and tags. All of this is queryable through metadata tables in Spark, Trino, Dremio, and PyIceberg without reading a single data file.

This changes the cost of the most common checks. Row count, null count per column, min and max per column, and freshness are aggregations over the manifests, not scans of the data. A check that a daily partition has at least a million rows reads one manifest entry. A check that `email` has no nulls reads one number. A freshness check reads the latest snapshot's timestamp. On a warehouse these are queries with a cost proportional to data size. On Iceberg they are metadata reads with a cost proportional to file count.

Branches add a second capability: validation before publication with no copy. A load writes to a branch, checks run against the branch, and `main` is fast-forwarded only on success. The checks see exactly the data that will be published, and a failure leaves `main` untouched. This is write-audit-publish, and it turns every validation tool into a gate by construction.

The tools below differ in how much of this they use. Most run SQL against the table and are unaware of the metadata layer, which works but leaves the free checks on the table. A few, and any custom check, can read the metadata tables directly.

## Checking at the Right Grain

A check that runs against a whole table every night is the default in every tool, and on a large lakehouse table it is the wrong grain. Incremental pipelines write a partition or a day. The check should validate what was written, not what has accumulated.

Every validation tool supports this with some configuration. GX Batch Definitions slice by a partition column so that a Checkpoint validates one day. Soda checks accept a `filter` clause that restricts the scan to a partition. dbt tests accept a `where` config that does the same. On Iceberg, a filter on the partition column prunes to the partition's files, so a partition-grained check on a table with three years of history reads one day.

Two things follow. The first is that the check's thresholds should be per partition: a row-count floor for a day, not for the table. The second is that the snapshot summary already tells you which partitions a commit touched, when `write.summary.partition-limit` is set, so a check can target exactly the partitions the last commit changed rather than a fixed window. A layer-one script that reads the summary and passes the touched partitions to the layer-two scan as a filter is the tightest loop available.

Detection has the same grain question in a different form. A daily row-count monitor on a table that receives late-arriving data sees yesterday's count grow for three days and flags every day as anomalous. Detection tools handle this with a settling window or by monitoring the partition's final count after a delay. Elementary's `time_bucket` and `days_back` settings, and equivalent settings in the commercial tools, are where this is configured, and getting it wrong is the main source of false positives on lakehouse tables.

The whole-table check still has a place, for referential integrity across the full history and for slow drift that partition checks miss. It belongs on a weekly cadence rather than a nightly one, and on Iceberg it should read from a tagged snapshot so that it is not racing with writes.

## Great Expectations

Great Expectations (GX) is the oldest of the modern validation frameworks and the most expressive. An Expectation is a declarative assertion, one of several hundred built-in types plus custom ones, applied to a Batch of data from a Data Source through a Validation Definition. Checkpoints group validations and run Actions on the results. Data Docs render results as static HTML.

**Expressing checks.** GX Core 1.x is a Python API. Expectations are objects with parameters, added to an Expectation Suite, and the suite is applied to data through a Batch Definition that knows how to slice a table by partition, date, or whole. The vocabulary is the broadest of any tool: distribution expectations such as Kolmogorov-Smirnov tests against a reference, multi-column expectations, and conditional expectations that apply only where a row filter matches. Expectations execute as SQL on SQL sources and as Spark or pandas operations on DataFrames.

**Where it runs.** Anywhere Python runs. GX has SQLAlchemy-based sources for the major warehouses and engines, Spark sources for DataFrames, and file sources for Parquet and CSV. Against an Iceberg table, the practical path is a Spark DataFrame source, which runs Expectations as Spark operations, or a SQL source through Trino or Dremio.

**Iceberg awareness.** None native. A Batch Definition can slice by a partition column, and an Expectation can be a SQL query against a metadata table if written as a custom Expectation, but GX does not know that the table has snapshots or that a null count is available without a scan.

**Operations.** GX Core is a library. It needs an orchestrator to run Checkpoints, storage for validation results and Data Docs, and someone to maintain the Python project. The learning curve is the steepest of the validation tools, and the payoff is expressiveness.

**2026 status.** On May 13, 2026, Fivetran announced it is becoming steward of the Great Expectations open-source community and the GX Core project, with GX Core continuing as open source and Fivetran hiring maintainers. GX Cloud, the commercial hosted product, stopped being publicly available on June 1, 2026. Teams on GX Cloud received transition information. Teams on GX Core have an open-source project whose maintenance is now funded by the company that also owns Fivetran and dbt, which is a reasonable position for the project and a concentration of the stack in one vendor.

**Fit.** Teams that need distribution tests, conditional expectations, or a large custom Expectation library, and that have the engineering capacity to run a Python validation project. Less fit for teams that want YAML and a CLI.

## Soda

Soda takes the opposite approach to expressiveness: a small, readable checks language, SodaCL, in YAML, evaluated by a CLI or library against a data source, with results optionally sent to Soda Cloud for history, alerting, and collaboration.

**Expressing checks.** SodaCL reads close to English:

```yaml
checks for orders:
  - row_count > 0
  - missing_count(customer_id) = 0
  - duplicate_count(order_id) = 0
  - invalid_percent(status) < 1%:
      valid values: [placed, shipped, delivered, cancelled]
  - freshness(placed_at) < 2h
  - avg(amount) between 20 and 500
  - schema:
      fail:
        when required column missing: [order_id, customer_id, amount]
        when wrong column type:
          amount: decimal
```

Metrics, thresholds, and a handful of check types cover the common cases. Custom SQL checks handle the rest. Anomaly checks, which apply a model to a metric's history, are available in the commercial product.

**Where it runs.** Soda Library (the successor to Soda Core for commercial users) and the open-source Soda Core connect to data sources through packages per source: Spark, Trino, Dremio, the warehouses, and Postgres among them. A scan runs the checks for a data source and reports. Airflow and Dagster integrations run scans as tasks. The dbt integration ingests dbt test results into Soda Cloud rather than running checks inside dbt.

**Iceberg awareness.** Soda runs SQL. Against an Iceberg table through Spark or Trino, every check is a query. Freshness is computed from a timestamp column rather than from the snapshot. A custom SQL check can query the metadata tables, but nothing in SodaCL is Iceberg-specific.

**Operations.** The CLI is minutes to install and run. Soda Cloud is the hosted layer for history, alerts, and the anomaly checks, and is where the commercial model lives. Self-hosted teams get checks without history unless they store results themselves.

**Fit.** Teams that want checks reviewable by analysts, a fast start, and a hosted option for history and alerting. Less fit for distribution tests and complex conditional logic, which need custom SQL.

## dbt Tests

dbt's testing is part of the transformation tool rather than a separate product, which is its main advantage and its main limit.

**Expressing checks.** Two kinds. Data tests are SQL that returns failing rows, either generic tests parameterized in YAML on a model's columns (`not_null`, `unique`, `accepted_values`, `relationships` built in, hundreds more in packages such as `dbt-utils` and `dbt-expectations`) or singular tests as `.sql` files. Unit tests, added in dbt 1.8, mock a model's inputs and assert its output, testing the transformation logic without touching the platform. Both are versioned with the models and run with `dbt test` or as part of `dbt build`, which stops downstream models when an upstream test fails.

```yaml
models:
  - name: fct_orders
    columns:
      - name: order_id
        data_tests: [unique, not_null]
      - name: status
        data_tests:
          - accepted_values:
              values: [placed, shipped, delivered, cancelled]
      - name: amount
        data_tests:
          - dbt_expectations.expect_column_values_to_be_between:
              min_value: 0
              max_value: 100000
```

**Where it runs.** Wherever dbt runs, against whatever adapter the project uses. On an Iceberg lakehouse that is Spark, Trino, Dremio, Athena, or DuckDB. A test is a query against the model's table.

**Iceberg awareness.** Singular tests can query metadata tables, so a test that the model's latest snapshot is an `overwrite`, or that its delete-file count is under a threshold, is a few lines of SQL. This is the most direct path to Iceberg-aware validation of any tool here, because dbt already knows the model's table name and the test is just SQL. The metadata table syntax differs per adapter, which a macro handles.

**Operations.** None beyond dbt. Test results are stored where dbt stores artifacts, and history requires either dbt Cloud, Elementary, or a custom store. `dbt build`'s gating behavior means a failed test on `fct_orders` stops `fct_revenue` from building, which is the write-audit-publish gate for free, and on Iceberg it pairs naturally with branch-based builds so that the failed model's snapshot never reaches `main`.

**Fit.** Every dbt project should use dbt tests for the models it builds. They are not a substitute for validating ingested data before dbt sees it, and they are not detection.

### Unit Tests Are a Different Layer Again

dbt 1.8 added unit tests, and they are worth separating from data tests because they answer a different question. A data test asks whether the data in a table satisfies a rule. A unit test asks whether the transformation logic produces the expected output from a given input, with the input mocked. It runs before any data exists and catches logic errors, such as a `CASE` statement that maps a status incorrectly or a join that drops rows, that data tests only catch after the bad output has been produced.

```yaml
unit_tests:
  - name: test_fct_orders_status_mapping
    model: fct_orders
    given:
      - input: ref('stg_orders')
        rows:
          - {order_id: 1, raw_status: "SHIPPED"}
          - {order_id: 2, raw_status: "unknown_code"}
    expect:
      rows:
        - {order_id: 1, status: "shipped"}
        - {order_id: 2, status: "other"}
```

Unit tests run in CI on every pull request, cost nothing in platform compute beyond a trivial query, and are the reason a logic bug never reaches the lakehouse. They are also entirely unaware of Iceberg, which is fine, because they test the SQL and not the table. A dbt project on Iceberg should have unit tests for models with non-trivial logic, data tests for the constraints on their output, and the layers described here for everything the models do not cover.

## Anomaly Detection

The detection tools share a design: connect to the platform, collect metrics on a schedule (row counts, freshness, null rates, distributions, schema), build a model per metric, and alert on departures. They differ in what they connect to, how much they automate, and what they cost.

**Elementary.** An open-source dbt package plus a CLI. The package adds anomaly-detection tests to a dbt project (`volume_anomalies`, `freshness_anomalies`, `column_anomalies`, `dimension_anomalies`) that collect metrics into tables in the warehouse and evaluate them against history as ordinary dbt tests. The CLI generates an observability report and sends alerts. Elementary Cloud adds a hosted UI, lineage, and incident management. For a dbt shop, this is detection with no new infrastructure, and it is the most common first detection tool.

**Monte Carlo.** The largest of the commercial observability platforms. Connects to warehouses, lakes, BI tools, and orchestrators, builds column-level lineage across them, applies automated monitors to every table it sees, and routes incidents with impact analysis based on lineage. Coverage is broad, setup for a large estate takes weeks, and pricing is enterprise.

**Anomalo.** Automated detection with an emphasis on unsupervised monitoring: point it at a table and it finds what to watch. Strong on distribution shifts and on explaining what changed. Enterprise pricing.

**Bigeye.** Metric-based monitoring with a large library of metrics and configurable thresholds, plus lineage. Positioned between Elementary's simplicity and Monte Carlo's breadth.

**Metaplane.** Acquired by Datadog in 2025 and now part of Datadog's observability platform, which puts data monitoring next to infrastructure and application monitoring. For organizations already on Datadog, this is the path of least resistance. For others, it is a Datadog purchase.

**Platform-native monitoring.** Snowflake, Databricks, and BigQuery each ship data quality monitoring for their own tables. For a lakehouse spanning engines, these cover one engine's view and not the others.

**Iceberg awareness.** Detection tools compute metrics by querying. A tool that queries the `snapshots` table for row-count deltas and the `files` table for null counts collects most of its metrics for free, and a few are beginning to. Most still scan. For freshness specifically, the snapshot timestamp is the right signal and is available to any tool that reads the catalog.

**Fit.** Elementary for dbt shops starting out. A commercial platform once the estate is large enough that nobody can write rules for it, which in practice is somewhere past ten sources and a few hundred tables.

### Cross-Table Checks

Most checks are within one table. The ones that catch the worst problems are across tables: every `customer_id` in orders exists in customers, the sum of line items equals the order total, the count of events per session matches the session table's event count.

dbt's `relationships` test covers referential integrity between models with a query that joins the two. GX has multi-table Expectations. Soda covers it with a custom SQL check. All of them are joins, and on a lakehouse the join's cost depends on the tables' layout: two tables bucketed on the join key let the engine run the check as a storage-partitioned join with no shuffle, which turns a nightly referential check on billion-row tables from an expensive job into a cheap one.

The consistency question is subtler than the cost. A cross-table check reads two tables that were committed at different times. If orders was loaded at 02:00 and customers at 02:10, a check at 02:05 finds orders with no customer and fails for a reason that resolves itself five minutes later. On Iceberg the fix is to check against a consistent pair of snapshots: either both tables tagged at the end of the load cycle and the check run against the tags, or both tables on the same branch in a multi-table transaction where the REST catalog supports one. Checks that read `main` on both sides during an active load window are the most common source of spurious cross-table failures.

## Comparison

| | Great Expectations | Soda | dbt tests | Elementary | Commercial detection |
|---|---|---|---|---|---|
| Kind | Validation | Validation, plus detection in Cloud | Validation, plus unit tests | Detection as dbt tests | Detection with lineage |
| Check language | Python Expectations | SodaCL YAML | YAML generic tests and SQL | dbt test configs | UI and API |
| Expressiveness | Highest | Medium, custom SQL for the rest | Medium, packages extend | Metric-based | Metric-based, automated |
| Runs where | Python, Spark, SQL | CLI or library, per-source packages | dbt adapter | dbt | Vendor-hosted, connects in |
| Iceberg metadata use | Custom Expectations only | Custom SQL checks only | Singular tests against metadata tables | Not natively | Emerging |
| History and alerting | Data Docs, bring your own | Soda Cloud | dbt Cloud or Elementary | Package tables and CLI, Cloud | Built in |
| Gating | Checkpoint actions | Scan exit code | `dbt build` stops downstream | No, alerts | No, alerts |
| Operations | Python project plus orchestrator | CLI, optional Cloud | None beyond dbt | dbt package plus CLI | Vendor-managed, integration effort |
| 2026 status | GX Core under Fivetran stewardship, GX Cloud closed June 1 | Independent | Part of dbt, now Fivetran + dbt Labs | Independent open source plus Cloud | Metaplane in Datadog, others independent |

## A Layered Design for an Iceberg Lakehouse

The tools compose into four layers, each doing what it does best.

**Layer one: metadata checks, on every commit.** Before any tool runs, the snapshot summary and manifests answer the cheapest questions. Did the commit add a plausible number of rows? Is the operation type what the pipeline expected? Did any file land with an unexpected partition? Are null counts on required columns zero? These run as a small job triggered by the snapshot, in whatever orchestrator the team uses, reading metadata tables through PyIceberg or SQL. They cost nothing in scan time and they catch load failures within seconds.

**Layer two: validation on the branch, before publication.** The load writes to a branch. Soda, GX, or dbt tests run against the branch. On success, `main` is fast-forwarded. On failure, the branch is dropped and the failure is reported with the failing rows. This is the gate. For dbt-built models, `dbt build` on a branch target is the same thing.

**Layer three: detection on `main`, continuously.** Elementary or a commercial platform monitors published tables for volume, freshness, distribution, and schema anomalies, alerts humans, and does not gate anything. Its history is what catches the cents-versus-dollars problem.

**Layer four: contracts at the boundary.** For tables shared across teams, the schema and the checks in layers one and two are the contract, expressed in a format such as the Open Data Contract Standard and versioned with the producing pipeline. A consumer that reads the contract knows what is guaranteed and what is merely monitored.

A team does not need four tools for four layers. Layer one is a script. Layer two can be dbt tests alone for a dbt shop, or Soda for ingested tables. Layer three is Elementary until it is not enough. Layer four is a YAML file. The point is that validation and detection are separate layers with separate tools, and that the Iceberg metadata layer underneath makes the first layer nearly free.

## Walkthrough: Checks That Read Iceberg Metadata

The following is a layer-one check as a standalone Python job, reading only metadata. It runs after a commit, takes seconds, and produces pass/fail signals that any orchestrator can gate on.

```python
from pyiceberg.catalog import load_catalog

EXPECTED_OPERATION = "overwrite"
MIN_ADDED_RECORDS = 10_000
REQUIRED_NON_NULL = {"order_id": 1, "customer_id": 2}   # name -> field id

catalog = load_catalog("polaris")
table = catalog.load_table("analytics.fct_orders")
snapshot = table.current_snapshot()
summary = snapshot.summary

failures = []
if summary.get("operation") != EXPECTED_OPERATION:
    failures.append(f"operation was {summary.get('operation')}")
if int(summary.get("added-records", 0)) < MIN_ADDED_RECORDS:
    failures.append(f"only {summary.get('added-records')} records added")

for entry in table.scan(snapshot_id=snapshot.snapshot_id).plan_files():
    nulls = entry.file.null_value_counts or {}
    for col, fid in REQUIRED_NON_NULL.items():
        if nulls.get(fid, 0) > 0:
            failures.append(f"{entry.file.file_path} has nulls in {col}")
            break

if failures:
    raise SystemExit("metadata checks failed: " + "; ".join(failures))
print(f"snapshot {snapshot.snapshot_id} passed metadata checks")
```

The snapshot summary check confirms the pipeline did what it intended. The added-records floor catches an empty or truncated load. The null-count loop walks manifest entries, reading the per-file null counts that the writer computed, and fails on the first file with a null in a required column. None of this reads a data file.

The same checks in a dbt singular test, for a dbt-built model on Spark:

```sql
-- tests/assert_fct_orders_latest_snapshot_healthy.sql
WITH latest AS (
  SELECT operation,
         CAST(summary['added-records'] AS BIGINT) AS added_records
  FROM {{ ref('fct_orders') }}.snapshots
  ORDER BY committed_at DESC
  LIMIT 1
)
SELECT * FROM latest
WHERE operation <> 'overwrite' OR added_records < 10000
```

And a layer-two Soda scan against a branch, which on Spark uses the branch selector in the table reference:

```yaml
checks for analytics.fct_orders:
  - row_count > 10000
  - duplicate_count(order_id) = 0
  - missing_count(customer_id) = 0
  - avg(amount) between 20 and 500
  - freshness(placed_at) < 26h
```

run with `soda scan -d spark -c config.yml checks.yml` after setting the Spark session's read branch to the audit branch. The scan's exit code is the gate.

### Handling a Failed Check

A gate that fails needs a path that is not "page someone and wait." Iceberg's branch model gives a few.

**Drop the branch and retry.** The default for transient failures. The load's branch is deleted, nothing reached `main`, and the pipeline reruns from the source. Because the branch's files are unreferenced after the drop, orphan cleanup reclaims them.

**Quarantine the branch.** For failures that need investigation, the branch is kept under a name such as `quarantine-2026-09-01-run-4471`, the failing rows are queryable on it, and `main` stays at its last good state. The investigator has the exact data that failed and the exact checks that failed it. When the fix is a data correction, it is applied on the branch and the checks rerun before fast-forward. When the fix is upstream, the branch is dropped after the reload succeeds.

**Publish with a warning.** For checks at `warn` severity, the fast-forward proceeds and the warning is recorded. This is right for thresholds that are informational and wrong for anything a consumer depends on.

**Partial publication.** When a load spans partitions and only some fail, the passing partitions can be published by rewriting the branch to exclude the failing ones, or the whole load can be held. Most teams hold the whole load, because partial publication makes the consumer's view inconsistent, and the exceptions are append-only event tables where partitions are independent.

The check results themselves belong in a table. A `quality.check_results` Iceberg table with the table name, snapshot ID, check name, status, and failing-row count per run is the history that detection tools build for their own metrics and that most teams never keep for validation. It answers which checks fail most, which tables are noisiest, and whether a rule has ever caught anything, which is the information needed to prune rules that do not earn their maintenance.

## What Each Layer Costs at Scale

The cost of quality tooling is rarely the license. It is the compute the checks consume and the people who maintain the rules.

**Metadata checks** cost a few catalog and storage requests per commit. At ten thousand tables committing hourly, that is a modest, steady load on the catalog and nothing on the engines. They scale with commit count, not data size.

**Validation scans** cost a query per check per run. A Soda scan with twenty checks on a table is twenty aggregations, or one if the tool batches them, over whatever the filter selects. Partition-grained and this is small. Whole-table on large tables and this is the dominant cost of the quality program. A team with five hundred tables each scanned nightly in full is paying for five hundred full scans a day, which is often more compute than the pipelines that produced the tables. Filters and metadata-first checks are the fix, and the savings are large.

**Detection** costs a metric collection per table per interval, which for the automated platforms is a scan of recent partitions, plus the vendor's fee. Commercial detection is priced per table or per monitored asset, and the bill is proportional to how much is monitored. Tiering the tables, with full monitoring on the important ones and freshness-only on the rest, is how the cost is controlled.

**Maintenance** is the cost nobody budgets. Rules go stale as schemas and business logic change. A check that has failed every night for a month and been ignored is negative value: it trains people to ignore the channel. A quarterly pass that removes rules with no catches and adjusts thresholds on noisy ones keeps the rule set honest. The `check_results` table is what makes that pass a query rather than a guess.

A reasonable target for a mature program is that quality checks consume under ten percent of the compute the pipelines consume. Programs that exceed that are usually scanning for what the metadata already knows or monitoring tables nobody reads.

## Failure Modes

**Buying detection and expecting validation, or the reverse.** A team adopts Monte Carlo and is surprised that it does not block bad loads. A team writes five hundred dbt tests and is surprised when an unanticipated change gets through. Both are the correct behavior of the tool that was bought.

**Rules on every column.** Validation that checks everything is validation nobody maintains. Rules belong on the columns that matter: keys, amounts, timestamps, and status fields. The rest is detection's job.

**Scanning for what the metadata already knows.** A nightly Soda scan computing `row_count` and `missing_count` on a 10-terabyte table is a 10-terabyte scan for numbers that sit in the manifests. Read the metadata for those and reserve scans for checks that need rows.

**Validating after publication.** Checks that run against `main` after the load is live are alerts, not gates. Consumers have already read the bad data. Branches exist to fix this and are underused.

**Detection with no history.** A detection tool installed this week alerts on everything, because it has no baseline. Budget two to four weeks of tuning and expect false positives until the models settle.

**Alert fatigue.** Detection on every table at default sensitivity produces alerts nobody reads. Tier the tables, monitor the important ones closely, and let the rest alert only on freshness and schema.

**Tests that stop the pipeline for the wrong reason.** A `not_null` test on a column that is legitimately null one percent of the time fails every night and gets disabled. Thresholds and `warn` severity exist for this.

**Ignoring the vendor changes.** A team that built on GX Cloud in 2025 had a June 2026 deadline. A team evaluating Metaplane is evaluating Datadog. A team on GX Core now has a project stewarded by the company that also owns their ingestion and transformation tools. None of these is a reason to avoid the tool, and all of them belong in the decision.

## Operational Guidance

**Start with metadata checks.** They are a script, they cost nothing, and they catch the most common failures. Every Iceberg pipeline should assert on the snapshot summary of what it just wrote.

**Gate on a branch.** Write-audit-publish with whichever validation tool the team already has. This is the single highest-value practice on the list.

**Use dbt tests for dbt models, and something else for ingested tables.** dbt tests only see what dbt builds. Raw tables need Soda, GX, or the metadata checks.

**Add detection when rules stop scaling.** Elementary first for dbt shops. A commercial platform when the estate outgrows it.

**Tier tables and put rules where the money is.** Keys, amounts, timestamps, statuses. Detection on everything, at a sensitivity that matches the tier.

**Store results somewhere queryable.** Validation results in an Iceberg table are themselves data, and a history of which checks failed when is how a team learns which rules matter.

**Read the metadata layer from every tool that can.** Freshness from the snapshot timestamp. Row counts and null counts from manifests. Custom checks in GX, custom SQL in Soda, singular tests in dbt.

## Choosing

**A dbt shop starting from nothing:** dbt tests on the models, Elementary for detection, a layer-one metadata script on the raw tables, branches for gating. No new vendors, and it covers most of the value.

**An organization with many ingested tables that dbt does not build:** Soda for validation on the raw layer, because analysts can read and write SodaCL, and the metadata script for the cheap checks. GX if the checks need distributions or conditionals that SodaCL cannot express.

**A Python-heavy team with complex validation logic:** GX Core, with an eye on how the Fivetran stewardship plays out, and a plan for where results and Data Docs live now that GX Cloud is gone.

**An estate past a few hundred tables and ten sources:** a commercial detection platform, chosen partly on which of the lakehouse's engines and catalogs it connects to and whether it reads Iceberg metadata for freshness and volume. Monte Carlo for breadth, Anomalo for automated discovery, Bigeye for metric control, Metaplane for organizations already on Datadog.

**Any of the above:** the four layers, in order. Metadata checks on every commit. Validation on a branch. Detection on `main`. Contracts at the boundary.

The tool matters less than the layering, and the layering matters less than the habit of gating before publication. A team with dbt tests and branches beats a team with every tool on this list and checks that run after consumers have already read the data.

## Where the Ecosystem Is Heading

**Iceberg-native monitors.** Detection tools computing metrics from manifests and snapshot summaries rather than scans is the obvious optimization, and the tools that connect through Iceberg REST catalogs are positioned to do it. Expect freshness and volume monitors to go metadata-first within a couple of release cycles.

**Contracts as the interface.** The Open Data Contract Standard and similar formats are becoming the way a producing team publishes what it guarantees. Validation tools are adding contract import, so the contract generates the checks rather than the checks being written separately.

**Consolidation.** Fivetran now stewards GX Core alongside owning dbt. Datadog owns Metaplane. The independent validation tools are Soda and Elementary, and the independent detection tools are Monte Carlo, Anomalo, and Bigeye. The trend is toward quality as a feature of a larger platform rather than a category.

**Agents as check authors and triagers.** Every vendor shipped an AI assistant that proposes checks from a table's profile or explains an anomaly. The more useful direction is agents that read a failed check, trace lineage, and draft the fix, which requires the lineage and the check results to be available through an API the agent can call.

**Catalog-level quality metadata.** Storing check results and quality tiers as catalog metadata, next to the table, so that consumers see quality status where they discover the table. Apache Polaris's policy framework and the governance catalogs are both moving toward holding this.

## Conclusion

Data quality tooling is two categories that get sold as one. Validation, in Great Expectations, Soda, and dbt tests, gates known constraints and belongs before publication. Detection, in Elementary and the commercial platforms, watches for the unknown and belongs alongside. On an Iceberg lakehouse a third layer sits underneath both: the table's own metadata, which answers the cheapest questions at no scan cost and, through branches, turns any validation tool into a gate.

The tools have shifted in 2026, with GX Core under Fivetran's stewardship and GX Cloud closed, Metaplane inside Datadog, and dbt tests now part of a company that also sells ingestion. None of that changes the design: check the metadata on every commit, validate on a branch before publishing, detect on `main` continuously, and write the contract down. The cents-versus-dollars problem still gets through the first two layers. The third one catches it in an hour instead of three.

## Keep Going

If this piece was useful, I have written a lot more on operating Iceberg lakehouses, including the metadata layer that makes these checks cheap and the branch model that makes them gates. *Architecting an Apache Iceberg Lakehouse* from Manning covers write-audit-publish and table metadata in depth. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
