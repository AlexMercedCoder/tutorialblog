---
title: "Building Iceberg Pipelines in Python Without Standing Up Spark"
date: "2026-07-28"
description: "A large share of production transformations fit comfortably on one machine. PyIceberg, DuckDB, and branch isolation give you a production path that debugs in an IDE."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Python
  - PyIceberg
  - Data Pipelines
canonical: "https://iceberglakehouse.com/posts/python-native-iceberg-pipelines/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/python-native-iceberg-pipelines/).

# Building Iceberg Pipelines in Python Without Standing Up Spark

A data scientist has a transformation that takes forty lines of pandas. It reads two Iceberg tables, joins them, applies a scoring function from a library the team maintains, and writes the result back. Getting it into production means learning Spark, packaging the library into a JAR-compatible environment or fighting PySpark's dependency model, and waiting on a platform team to provision a cluster.

The transformation runs in eight seconds on a laptop against a sample. The path to production takes three weeks.

That gap is the reason a category of Python-native lakehouse tooling exists. Spark is excellent and it is not the right tool for every transformation, and the cost of using it for small work is not compute, it is the operational and cognitive surface a team takes on.

I work at Dremio, which builds a query engine, so I have a view on where SQL engines fit in this picture. The tools discussed below are not Dremio products and the pattern is implementable with open libraries alone.

This piece covers when Spark is genuinely the wrong tool, how PyIceberg alone handles a large share of pipeline work, what branch-based isolation gives you and how to implement it, where the Python-native approach breaks down, and how to decide between the options.

## When Spark is the wrong tool

Spark solves a specific problem extremely well: distributing computation over data too large for one machine. Every design decision follows from that, and every one of them costs something when the data fits.

**The JVM boundary.** PySpark runs Python in worker processes alongside JVM executors, and data crosses between them. Arrow-based transfer made this dramatically better and it did not make it free. A pipeline whose work is mostly Python user-defined functions pays that crossing on every row.

**Cluster lifecycle.** Something has to provision, size, and tear down compute. Managed services hide this and do not eliminate it. A transformation running for eight seconds against a cluster that takes ninety seconds to start has a startup cost eleven times its runtime.

**Dependency management.** Getting a specific Python library onto every executor, at the right version, matching what ran locally, is a solved problem in the sense that solutions exist and an unsolved one in the sense that it consumes real time repeatedly.

**Conceptual surface.** Partitions, shuffles, broadcast joins, executor memory, serialization. Understanding these is necessary to operate Spark well and irrelevant to a transformation over four gigabytes.

None of this is a criticism. A framework built for a hundred terabytes carries machinery that a four gigabyte job does not need, and that is the correct design. The mistake is defaulting to it for everything because it is what the platform provides.

The honest threshold: if your data fits comfortably in the memory of one reasonably sized machine, and modern machines have a lot of memory, single-node processing is simpler and frequently faster than distributed processing. A significant share of production data transformations fall under that line, and teams run them on Spark because Spark was already there.

The three execution options line up like this.

| | Spark or Flink | SQL query engine | Python single-node |
|---|---|---|---|
| Data larger than one machine | Yes | Yes | No |
| Wide shuffle joins | Yes | Yes | Poorly |
| Arbitrary Python logic | With overhead | Via UDFs, awkward | Native |
| Startup cost | Seconds to minutes | Low, engine is running | Milliseconds |
| Dependency management | A recurring project | N/A | pip |
| Table maintenance procedures | Full coverage | Full coverage | Partial |
| Debuggable in an IDE | Painfully | No | Yes |

The last row is underrated. A transformation you step through in a debugger with real data gets fixed faster than one you diagnose from cluster logs, and that difference compounds across every iteration.

## What PyIceberg alone handles

Before reaching for any framework, know what the base library does, because the answer covers more than people expect.

PyIceberg reads and writes Iceberg tables from Python with no JVM. It handles catalog interaction, scan planning with predicate pushdown, and returns Arrow tables that hand off directly to pandas, Polars, DuckDB, or anything else in the Arrow ecosystem.

```python
from pyiceberg.catalog import load_catalog
from pyiceberg.expressions import GreaterThanOrEqual, EqualTo, And
import pyarrow.compute as pc

catalog = load_catalog(
    "prod",
    **{
        "type": "rest",
        "uri": "https://catalog.example.com/api/catalog",
        "credential": "pipeline-writer:<secret>",
        "scope": "PRINCIPAL_ROLE:pipeline_writer",
        "warehouse": "analytics",
    },
)

orders = catalog.load_table("silver.sales.orders")

# Predicates push down to scan planning: partitions and files get pruned
# before any data is read, not filtered afterward in memory.
scan = orders.scan(
    row_filter=And(
        GreaterThanOrEqual("order_date", "2026-07-01"),
        EqualTo("status", "COMPLETE"),
    ),
    selected_fields=("order_id", "customer_id", "order_date", "amount_usd"),
)

arrow_table = scan.to_arrow()
print(f"{arrow_table.num_rows:,} rows, {arrow_table.nbytes / 1e6:.1f} MB")
```

Two things in that snippet do most of the work.

`row_filter` pushes predicates into scan planning. Iceberg uses partition values and column statistics in manifests to eliminate files before reading them. A filter on a partition column touches only the relevant partitions, and a filter on a sorted column skips files whose value range excludes it. This is the difference between reading four gigabytes and reading forty.

`selected_fields` limits column projection. Parquet is columnar, so requesting four columns from a fifty-column table reads roughly the bytes those four columns occupy.

Get these two right and a surprising amount of data becomes single-node data. Teams that report needing a cluster frequently need one because they are scanning full tables to filter in memory.

Writing back is direct:

```python
import pyarrow as pa

# Transform with whatever Python you want. Nothing here knows about Iceberg.
scored = arrow_table.append_column(
    "risk_score",
    pa.array(score_batch(arrow_table.to_pandas())),
)

target = catalog.load_table("gold.sales.scored_orders")

# Append is the safe default: it conflicts with almost nothing.
target.append(scored)
```

`append` is worth preferring wherever the semantics allow. Iceberg uses optimistic concurrency, and appends add files without depending on existing content, so they conflict with almost nothing. Overwrites and merges validate against table state and fail when another writer touched what they depend on.

PyIceberg also supports overwrite with a filter and upsert operations. Use them when you need them and know that they carry conflict risk that append does not.

## The pattern that matters: branch isolation

The capability that changes how pipelines are built is not the Python part. It is writing to an isolated branch, validating, and promoting only on success.

Without it, a pipeline writes to the production table and validation happens afterward. Bad output is already visible to readers, and fixing it means another write. With it, the expensive work happens somewhere nobody reads, validation runs against the real result rather than a proposal, and promotion is one cheap atomic operation.

Iceberg supports this natively through branches, and the whole cycle is expressible in Python.

```python
from datetime import datetime
import uuid

table = catalog.load_table("gold.sales.scored_orders")
branch = f"job_{datetime.utcnow():%Y%m%d}_{uuid.uuid4().hex[:8]}"

# Zero-copy branch: a new named reference to the current snapshot.
# No data is duplicated.
table.manage_snapshots().create_branch(
    snapshot_id=table.current_snapshot().snapshot_id,
    branch_name=branch,
).commit()

try:
    # All writes land on the branch. Readers on main see nothing.
    table.append(scored, branch=branch)

    # Validate against the actual written result
    branch_scan = table.scan(snapshot_id=table.snapshot_by_name(branch).snapshot_id)
    result = branch_scan.to_arrow()

    checks = {
        "row_count_nonzero": result.num_rows > 0,
        "no_null_scores": result.column("risk_score").null_count == 0,
        "scores_in_range": pc.all(
            pc.and_(
                pc.greater_equal(result.column("risk_score"), 0.0),
                pc.less_equal(result.column("risk_score"), 1.0),
            )
        ).as_py(),
        "no_duplicate_keys": (
            len(pc.unique(result.column("order_id"))) == result.num_rows
        ),
    }

    failed = [name for name, passed in checks.items() if not passed]
    if failed:
        raise ValueError(f"validation failed: {failed}")

    # Promote atomically. Readers see all of it or none of it.
    table.manage_snapshots().fast_forward(
        from_branch="main", to_branch=branch
    ).commit()

finally:
    table.manage_snapshots().remove_branch(branch).commit()
```

Several properties make this worth the extra code.

**Branch creation is zero-copy.** A branch is a named reference to a snapshot. Creating one copies no data and takes milliseconds regardless of table size.

**Readers are unaffected during the work.** Someone querying the table while the pipeline runs sees the pre-job state, consistently, for their whole query.

**Validation runs against reality.** The checks read what was actually written, including whatever the transformation did with edge cases you did not anticipate. This is stronger than validating the in-memory result before writing, because the write itself has behaviors: type coercion, partitioning, null handling.

**Failure is clean.** An exception leaves the branch, which the finally block removes. The main table was never touched.

**Promotion is atomic.** `fast_forward` moves the branch pointer. Readers see the complete result or the previous state, never a partial one.

The constraint on fast-forward is that main must not have moved past the branch point. That makes concurrent pipelines against one table awkward, and it is also the property that makes the operation safe. For tables with a single writing pipeline, which describes most gold tables, it is not a limitation.

## Handling data that does not fit in memory, on one machine

The memory ceiling is softer than it appears, because you do not have to materialize everything at once. Two techniques extend the single-node range substantially.

**Iterate over record batches.** PyIceberg's scan produces batches rather than requiring one table in memory. A transformation applied per batch, with results appended incrementally, processes datasets far larger than RAM.

```python
import pyarrow as pa

scan = orders.scan(
    row_filter=GreaterThanOrEqual("order_date", "2026-01-01"),
    selected_fields=("order_id", "customer_id", "order_date", "amount_usd"),
)

target = catalog.load_table("gold.sales.scored_orders")
buffer, buffered_rows = [], 0
TARGET_ROWS_PER_FILE = 2_000_000

for batch in scan.to_arrow_batch_reader():
    scored_batch = score_arrow_batch(batch)
    buffer.append(scored_batch)
    buffered_rows += scored_batch.num_rows

    # Accumulate to a sensible file size before writing, so the table
    # does not end up with one small file per batch.
    if buffered_rows >= TARGET_ROWS_PER_FILE:
        target.append(pa.Table.from_batches(buffer), branch=branch)
        buffer, buffered_rows = [], 0

if buffer:
    target.append(pa.Table.from_batches(buffer), branch=branch)
```

The accumulation logic is the part people leave out, and leaving it out is how a streaming-style pipeline produces thousands of tiny files. Batches arriving from a scan are sized for reading, not for writing. Buffer until you have enough for a file worth writing.

This works when the transformation is row-independent, meaning each row's output depends only on that row and on data small enough to hold. Scoring, enrichment from a lookup table, filtering, type conversion, and derived columns all qualify.

**Push the heavy relational work to DuckDB.** When the transformation needs a join, an aggregation, or a window function over data larger than memory, an embedded analytical engine handles it with spilling and a real optimizer, inside your Python process with no cluster.

```python
import duckdb

con = duckdb.connect()

# Register Arrow scans directly. DuckDB reads them without a copy.
con.register("orders", orders.scan(row_filter=recent).to_arrow())
con.register("customers", customers.scan().to_arrow())

result = con.execute("""
    SELECT
        c.region,
        date_trunc('month', o.order_date)          AS month,
        count(DISTINCT o.customer_id)              AS active_customers,
        sum(o.amount_usd)                          AS revenue_usd,
        sum(o.amount_usd) / count(DISTINCT o.order_id) AS avg_order_value
    FROM orders o
    JOIN customers c ON o.customer_id = c.customer_id
    GROUP BY 1, 2
""").arrow()

target.append(result, branch=branch)
```

This is the combination that covers most of the middle ground. Iceberg handles storage and pruning, Arrow handles the handoff with no serialization cost, DuckDB handles relational computation with an optimizer, and Python handles the logic that is genuinely Python.

The reason it works well is that all three speak Arrow. No conversion, no serialization boundary, no copy. That is the same property distributed engines spend a lot of machinery to approximate across a network, available for free when everything is in one process.

The ceiling is still real. A join between two hundred-gigabyte tables on a high-cardinality key is a shuffle, and one machine does it slowly if at all. Know where your ceiling is by measuring rather than by guessing, because the guess is usually far too low.

## A multi-step pipeline without a framework

Real pipelines have several steps with dependencies. You do not need a framework to express that cleanly, and seeing the plain version clarifies what a framework is actually buying.

```python
from dataclasses import dataclass
from typing import Callable
import pyarrow as pa

@dataclass
class Step:
    name: str
    depends_on: tuple[str, ...]
    run: Callable[[dict[str, pa.Table]], pa.Table]


def load_orders(_: dict) -> pa.Table:
    return catalog.load_table("silver.sales.orders").scan(
        row_filter=GreaterThanOrEqual("order_date", RUN_DATE),
        selected_fields=("order_id", "customer_id", "order_date", "amount_usd"),
    ).to_arrow()


def load_customers(_: dict) -> pa.Table:
    return catalog.load_table("silver.crm.customers").scan(
        selected_fields=("customer_id", "region", "segment"),
    ).to_arrow()


def enrich(inputs: dict[str, pa.Table]) -> pa.Table:
    con = duckdb.connect()
    con.register("o", inputs["orders"])
    con.register("c", inputs["customers"])
    return con.execute(
        "SELECT o.*, c.region, c.segment FROM o JOIN c USING (customer_id)"
    ).arrow()


def score(inputs: dict[str, pa.Table]) -> pa.Table:
    enriched = inputs["enrich"]
    return enriched.append_column(
        "risk_score", pa.array(score_batch(enriched.to_pandas()))
    )


PIPELINE = [
    Step("orders",    (),                          load_orders),
    Step("customers", (),                          load_customers),
    Step("enrich",    ("orders", "customers"),     enrich),
    Step("score",     ("enrich",),                 score),
]


def execute(steps: list[Step]) -> dict[str, pa.Table]:
    results: dict[str, pa.Table] = {}
    remaining = list(steps)
    while remaining:
        ready = [s for s in remaining if all(d in results for d in s.depends_on)]
        if not ready:
            raise RuntimeError("cycle or missing dependency in pipeline")
        for step in ready:
            results[step.name] = step.run(results)
            remaining.remove(step)
    return results
```

That is a working DAG executor in about thirty lines. Wrapped in the branch pattern from earlier, it is a complete production pipeline.

What it does not give you, and what a framework does:

**Persistent intermediates.** This version holds every intermediate in memory for the whole run. Fine for moderate data and wrong for large data, where you want intermediates spilled to storage.

**Partial re-execution.** A failure in `score` reruns everything. A framework that materializes intermediates resumes from the failed step, which matters when the earlier steps are expensive.

**Distributed execution.** Steps run sequentially in one process. Independent steps run in parallel under a real scheduler, and steps too large for one machine do not run here at all.

**Per-step environments.** Every step shares one Python environment. When two steps need conflicting library versions, this design has no answer, and a framework managing environments per function does.

**Observability.** No timing, no lineage, no run history. You add these yourself.

Whether those gaps matter is a judgment about your pipelines. A four-step transformation over moderate data run daily does not need any of them. A forty-step pipeline with expensive intermediates and conflicting dependencies needs all of them, and writing that yourself is how you accidentally build a worse framework.

The useful discipline: start with the plain version, and adopt a framework when you can name which specific gap is hurting you. Adopting one first means inheriting its concepts before you know whether you need them.

## Where frameworks add value over raw PyIceberg

Everything above uses only open libraries. What a framework adds is the parts around the transformation.

**DAG orchestration.** Real pipelines are several transformations with dependencies. Expressing that as a graph, with the runtime handling ordering and materialization of intermediates, beats writing the coordination yourself.

**Environment management per step.** Different steps need different dependencies. A framework that manages Python packages declaratively at the function level, and caches the resulting environments, removes a category of work.

**Execution infrastructure.** Something has to run the functions. A serverless runtime that handles this without you provisioning anything is a real convenience for bursty pipeline work.

Bauplan is one implementation of this shape, described in a WoSC10 2024 paper by its authors as a data-aware, zero-copy function-as-a-service runtime for declarative DAGs. Its execution engine uses Apache Arrow for passing data between DAG nodes, it provides a declarative API for managing Python packages at the function level rather than through container images, and it uses a git-for-data model with zero-copy branches over Iceberg tables in your own object storage.

The paper reports build process improvements against general-purpose serverless platforms in their test scenarios. Those are the authors' numbers on their workloads, and the reason they are plausible is architectural rather than magical: a worker with a local container factory avoids reinstalling common packages across runs, which removes network calls to a package index from the critical path. Narrowing the use case relative to a general FaaS platform is what permits that optimization.

That tradeoff is the thing to understand generally, and it applies to any tool in this category. Reduced generality in exchange for data-awareness. A runtime that knows its inputs and outputs are tables optimizes in ways a runtime accepting arbitrary payloads cannot. It also does less.

Whether you want a framework or raw libraries plus your existing orchestrator depends on how much of the surrounding machinery you already have. A team with a working Airflow deployment and an environment story has less to gain than a team starting from nothing.

## Where the Python-native approach breaks down

The honest boundaries, because this approach is oversold as often as Spark is over-applied.

**Data that genuinely does not fit.** Single-node processing has a ceiling set by machine memory. Above it you need distribution, and Spark is the mature answer. The ceiling is higher than most people assume and it exists.

**Wide shuffles.** Joining two large tables on a high-cardinality key requires redistributing both sides. That is what distributed engines are for, and doing it on one node means spilling to disk and slow performance.

**Long-running stateful streaming.** Flink and Spark Structured Streaming handle continuous processing with checkpointed state. A Python function is the wrong shape for that.

**Heavy SQL workloads.** If your transformation is SQL, a query engine executes it better than Python orchestrating library calls. Engines have optimizers, and an optimizer beats a hand-written execution plan on anything nontrivial. DuckDB embedded in the Python process is a good middle ground here, giving you a real optimizer without a cluster.

**Compaction and table maintenance.** Rewriting data files, expiring snapshots, and rewriting manifests are engine operations exposed as procedures. PyIceberg's coverage of maintenance operations is narrower than Spark's, so most Python-native shops still run maintenance through an engine.

**Very high concurrency writes.** The branch pattern assumes a small number of writers. Many concurrent pipelines against one table need a different design regardless of language.

The realistic picture in most organizations is a mix. Spark or Flink for large-scale and streaming work, a query engine for SQL transformations and serving, and Python-native tooling for the long tail of medium-sized transformations that involve real Python logic. Those are three different jobs, and insisting on one tool for all three is what produces the three-week path to production described at the top.

## Cost, honestly

The cost argument for Python-native pipelines is real and it is smaller than the developer experience argument.

**Compute cost** for a transformation over a few gigabytes is small either way. A Spark cluster idling between runs costs more than the work, which is an argument for serverless execution rather than for a specific framework. Serverless Spark exists and closes much of this gap.

**Engineering time** is where the difference concentrates. The three weeks in the opening scenario is not compute, it is packaging, provisioning, and waiting. A path where a data scientist ships their own transformation removes a handoff and the queue behind it.

**Operational cost** favors having fewer systems, which cuts both ways. Adding a Python-native runtime to an organization already running Spark well is a new thing to operate. The argument is strongest for teams whose Spark usage is entirely small jobs, where removing Spark is a net simplification.

The case that does not hold up: claiming large compute savings from avoiding Spark on workloads that were small to begin with. Small workloads are cheap on any engine. Be precise about which cost you are reducing, because a business case built on the wrong one falls apart under scrutiny.

## Testing, which is the real advantage

The strongest argument for Python-native pipelines is not performance or cost. It is that they are testable in a way SQL in a scheduler is not, and most teams do not exploit it.

**Separate transformation from I/O.** Every step above is a function from Arrow tables to an Arrow table. That function has no catalog, no network, no credentials, and no side effects. It runs in a unit test in milliseconds.

```python
import pyarrow as pa

def test_score_handles_null_amounts():
    fixture = pa.table({
        "order_id":    pa.array([1, 2, 3]),
        "customer_id": pa.array(["a", "b", "c"]),
        "amount_usd":  pa.array([100.0, None, 50.0]),
        "region":      pa.array(["EU", "US", "EU"]),
    })

    result = score({"enrich": fixture})

    assert result.num_rows == 3
    assert result.column("risk_score").null_count == 0
    assert all(0.0 <= v <= 1.0 for v in result.column("risk_score").to_pylist())
```

The null in row two is the point. Production data has nulls in columns your sample did not, and a test that encodes the expectation explicitly is how you find out what your function does with them before the pipeline does.

**Build a fixture library of hostile inputs.** Empty tables. Single-row tables. Duplicated keys. Nulls in every column. Values at type boundaries. Unicode in string columns. Timestamps at daylight-saving transitions. Each of these has produced a production incident somewhere, and each is three lines of Arrow to construct.

**Test the Iceberg interaction separately, against a real catalog.** Use a scratch catalog and a temporary table rather than mocking PyIceberg. Mocks encode your belief about how the library behaves, which is exactly the thing worth testing.

```python
def test_branch_isolation_leaves_main_untouched(scratch_table):
    before = scratch_table.scan().to_arrow().num_rows

    with pytest.raises(ValueError, match="validation failed"):
        run_pipeline_with_deliberately_bad_data(scratch_table)

    after = scratch_table.scan().to_arrow().num_rows
    assert before == after
    assert "job_" not in [r for r in scratch_table.refs()]
```

That test asserts the two properties the branch pattern exists to provide: main was untouched, and no branch leaked. Write it once and it protects the pattern across every pipeline that uses it.

**Assert on the output schema.** A transformation that silently adds a column evolves the target table's schema on append and surprises downstream consumers. A test comparing the produced schema against an expected one turns that into a build failure.

**Run the validation checks in tests too.** The checks that gate promotion are assertions about correctness, so they should also run against fixture data in the test suite. A check that has never fired has never been proven to work.

What this adds up to is a pipeline you change with confidence. That is worth more than the runtime difference, and it is the thing that actually shortens the three-week path from the opening.

## Scheduling and where these pipelines live

A pipeline that runs on someone's laptop is a script. Making it production infrastructure requires a few decisions that are easy to defer and expensive to defer for long.

**Something has to trigger it.** Cron, an orchestrator, or an event. Whatever you already run is usually the right answer, and this is not the interesting decision.

**Something has to hold the identity.** The pipeline authenticates to the catalog as a principal, and that principal has grants. Give each pipeline its own principal rather than sharing one, because a shared identity makes every audit question unanswerable and every grant broader than it needs to be.

**Something has to handle failure.** A step fails, and the question is whether the run retries, alerts, or does both. The branch pattern makes retry safe, since a failed run left no trace, but retrying a failure caused by bad input data just fails again. Retry on transient errors, meaning network and commit conflicts, and alert on validation failures, which indicate a data problem a retry does not fix.

**Something has to report.** Run started, run finished, rows processed, duration, outcome. Write it somewhere queryable rather than to logs. A small run-history table lets you answer whether last night's job was slow relative to normal, which is not answerable from a log aggregator without effort.

```python
run_log = catalog.load_table("ops.pipelines.run_history")
run_log.append(pa.table({
    "pipeline":     [PIPELINE_NAME],
    "run_date":     [RUN_DATE],
    "started_at":   [started],
    "finished_at":  [finished],
    "rows_in":      [rows_in],
    "rows_out":     [rows_out],
    "outcome":      [outcome],
    "branch":       [branch],
}))
```

That table costs nothing, is append-only so it conflicts with nothing, and answers most operational questions about a fleet of pipelines with a GROUP BY.

**Compute placement.** The options are a long-running machine, a container invoked per run, or a serverless runtime. For pipelines that run a few times a day and finish in minutes, a container per run is the simplest thing that is not wasteful. A long-running machine is simpler still and idles most of the time, which is fine at small scale and silly at large scale.

The thing to avoid: a pipeline whose home is a data scientist's development environment. It works until they change something, take leave, or leave. Getting the transformation into version control with a deployment path is the step that turns an experiment into infrastructure, and it is worth doing early because the retrofit is annoying.

One useful intermediate state. The transformation lives in a repository, is tested in CI, and is run by hand on a schedule by a person while the pattern proves itself. That is a legitimate place to be for a few weeks, and it is different from a script nobody else can find.

## Failure modes

**Scanning full tables and filtering in memory.** The most common performance mistake and the one that makes people conclude they need a cluster. Warning sign: scan times that scale with total table size rather than with the filtered subset. Fix: use `row_filter` and `selected_fields` so pruning happens during planning.

**Memory exhaustion on an unbounded scan.** A filter that matches more than expected produces an Arrow table larger than available memory, and the process dies. Warning sign: intermittent out-of-memory failures correlated with data volume. Fix: check estimated scan size before materializing, and iterate over record batches rather than calling `to_arrow` on everything.

**Branch leakage.** Pipelines fail before cleanup, branches accumulate, and each one pins snapshots that expiration cannot remove. Storage grows and nobody knows why. Warning sign: a growing list of branches with old timestamps. Fix: cleanup in a finally block, plus a scheduled sweep for branches past a retention window.

**Concurrent fast-forwards.** Two pipelines branch from the same point, both validate, and the second fast-forward fails because main moved. Warning sign: intermittent promotion failures under load. Fix: one writing pipeline per table, or coordinate through a lock.

**Schema drift on append.** A transformation adds a column, the append succeeds by evolving the table schema, and downstream consumers get a surprise. Warning sign: table schemas changing without a corresponding change ticket. Fix: assert the output schema against the expected one before writing.

**Small files from frequent small writes.** A pipeline running every fifteen minutes and appending a few thousand rows produces many small files. Query planning degrades over weeks. Warning sign: file count growing faster than data volume. Fix: run compaction on a schedule, and batch writes where the freshness requirement allows.

**Dependency drift between local and production.** The pipeline works on a laptop and fails in the runtime because a library version differs. Warning sign: failures that only reproduce in the deployed environment. Fix: pin exact versions and use the same resolution mechanism in both places.

**Credentials in code.** A `credential` string in a script, committed. Warning sign: any secret in a repository. Fix: environment variables or a secret manager, and prefer credential vending so the storage credentials the pipeline holds are short-lived and scoped.

## Operational guidance

**Establish the size threshold and write it down.** Above some data volume, use the distributed engine. Below it, use Python. Picking a number, even an imperfect one, prevents every pipeline from being an architecture debate.

**Use the branch pattern for every write to a table anyone reads.** The extra code is a template you write once. The property it gives you, that a failed job leaves no trace, is worth it on every pipeline rather than only on important ones.

**Write validation checks as assertions about what must never be true.** Not "the data looks right" but "no null keys, no duplicate identifiers, no scores outside range, row count within a factor of the previous run." Negative assertions catch more than positive ones.

**Keep the transformation separate from the I/O.** A pure function taking an Arrow table and returning one is testable without a catalog, a network, or credentials. The Iceberg interaction wraps it. This single discipline makes Python pipelines unit-testable, which is a large share of their advantage over SQL-in-a-scheduler.

**Run maintenance through an engine.** Compaction, snapshot expiration, and manifest rewriting are better covered by Spark or a query engine's procedures than by PyIceberg today. Schedule them regardless of what writes the data.

**Use credential vending.** Configure the catalog connection so storage credentials come from the catalog, scoped to the table and short-lived, rather than putting long-lived storage keys in pipeline configuration. Verify the client actually uses vended credentials rather than silently falling back to static ones, which is a one-line check in debug logging and a common misconfiguration.

**Log the row counts at every step.** In, out, and the ratio. A step whose output-to-input ratio changed since yesterday tells you something happened, and it is the cheapest anomaly detection available.

**Pin the run date rather than using now().** A pipeline reading "the last seven days" relative to execution time produces different results on a rerun, which makes reproducing yesterday's output impossible. Take the date as a parameter.

**Measure before assuming you need distribution.** Instrument a representative job with the filters applied properly and see how long it actually takes on one machine. Teams routinely discover the answer is seconds.

**Prefer append, and know when you cannot.** Appends conflict with almost nothing. When the semantics require overwrite or merge, expect commit conflicts under concurrency and configure retry properties accordingly.

## Reproducibility, which Iceberg gives you cheaply

A property worth building on deliberately: every read in these pipelines can be pinned to a snapshot, which makes a run exactly reproducible.

A scan without a snapshot argument reads the table's current state, so two runs an hour apart read different data. That is usually what you want in production and it makes debugging a past run impossible.

Pin the inputs instead.

```python
# Capture the snapshot each input was read at, and record it
input_snapshots = {}
for name, identifier in INPUT_TABLES.items():
    tbl = catalog.load_table(identifier)
    input_snapshots[name] = tbl.current_snapshot().snapshot_id

# All reads use the captured snapshot, so the run sees one consistent
# view even if a source table changes mid-run.
def load_pinned(name: str) -> pa.Table:
    tbl = catalog.load_table(INPUT_TABLES[name])
    return tbl.scan(snapshot_id=input_snapshots[name], **SCAN_ARGS[name]).to_arrow()
```

Two benefits, and the second is the bigger one.

**Consistency within a run.** A multi-step pipeline reading the same source twice gets the same data both times. Without pinning, a source table updated between step one and step three produces internally inconsistent output, and that class of bug is miserable to diagnose because it only appears when the timing lines up.

**Exact reproduction later.** Record the input snapshot identifiers in your run history table alongside the output. Six months later, when someone asks why a number looks wrong, you rerun the pipeline against the exact data it saw. Not approximately, exactly.

That second property is unusual. Most data pipelines cannot be reproduced because their inputs have moved on. Iceberg keeps old snapshots until expiration removes them, so the reproduction window is your retention policy.

Which produces a retention consideration worth stating: your snapshot expiration policy on source tables determines how far back you can reproduce pipeline runs. If reproducibility matters for audit or debugging, set expiration on source tables from that requirement rather than only from storage cost.

The same pinning works for validation. A check comparing today's output against yesterday's reads yesterday's snapshot directly, with no need to have saved a copy.

## Choosing, in five questions

Run through these in order and the answer usually falls out.

**Does the filtered input fit in the memory of one machine you can rent?** Not the whole table, the filtered and projected subset your transformation actually reads. Measure it. If yes, Python is on the table. If no, use a distributed engine and stop here.

**Is the transformation mostly SQL?** If a query expresses it, run it in a query engine. An optimizer beats hand-written Python orchestration, and the engine already exists in your stack. Python earns its place when the logic is genuinely Python: a model, a library, a parsing routine, something with control flow.

**How many steps, and are the intermediates expensive?** Under five steps with cheap intermediates, plain Python and your existing scheduler are sufficient. Above that, or where a failed late step means recomputing expensive early ones, a framework with materialized intermediates earns its keep.

**Do steps need conflicting dependencies?** If two steps need incompatible library versions, you need per-step environments, which means a framework or separate containers. This one is binary rather than a judgment call.

**What already exists in your organization?** A team with a working orchestrator, a container platform, and a deployment pipeline has most of the machinery and should be reluctant to add a runtime. A team with none of it gets more from a framework that supplies all three.

The failure mode on both sides is the same shape. Teams standardized on Spark run four-gigabyte jobs on clusters because that is the paved path, and teams enthusiastic about Python-native tooling try to push a genuinely distributed workload through one machine. Both are choosing by preference rather than by fit.

A reasonable default for most organizations: a query engine for SQL transformations and serving, a distributed engine for the genuinely large and the streaming, and Python for the middle where real logic lives. Write down which is which so the choice stops being relitigated per pipeline.

## Where this is heading

Three directions.

The Python lakehouse ecosystem keeps filling in. PyIceberg's coverage of the spec broadens with each release, and the gaps that force teams back to Spark, particularly around maintenance operations, are narrowing. The Rust implementation is developing alongside it and provides a performance path for the same access patterns.

Single-node processing keeps getting more capable. DuckDB and Polars have made a lot of workloads that required a cluster in 2019 comfortable on a laptop in 2026, and machine memory keeps growing. The threshold where distribution becomes necessary moves upward every year, which steadily expands the range where this approach applies.

The branch-based pattern is becoming the default way to write to a lakehouse rather than a technique. Write to a branch, validate, promote is the same shape as a pull request, and its value is not language-specific. Expect it to show up as a first-class concept in more orchestration tools rather than as something each team implements.

The open question I find most interesting is governance for these pipelines. A Python function running somewhere with a catalog credential is a writer, and catalogs are getting better at expressing what a writer can do. Aligning the pipeline runtime's identity model with the catalog's grant model, so a pipeline's permissions are as legible as a person's, is unfinished work in most deployments.

## Conclusion

Spark is the right tool for data that does not fit on one machine and the wrong tool for a transformation over four gigabytes. Using it for the second case costs a JVM boundary, a cluster lifecycle, a dependency problem, and a conceptual surface that has nothing to do with the work.

A large share of production transformations run comfortably in Python on one machine, provided you push filters and projections into scan planning rather than scanning tables and filtering in memory. PyIceberg does this natively, returns Arrow, and hands off to whatever you want to use for the actual computation.

The pattern worth adopting regardless of tooling is branch isolation. Create a zero-copy branch, do the work there, validate against the written result, and fast-forward on success. Readers are unaffected throughout, failures leave no trace, and promotion is atomic. It is a template you write once.

Frameworks in this space add DAG orchestration, per-function environment management, and execution infrastructure, trading generality for data-awareness. Whether that trade is worth it depends on how much of that machinery you already run.

Set a size threshold, write it down, and stop having the architecture conversation on every pipeline. Most of them will land on the simple side.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg and lakehouse architecture. *Apache Iceberg: The Definitive Guide*, which I co-authored for O'Reilly, covers branching, snapshot management, and the scan planning mechanics that make predicate pushdown work. *Architecting an Apache Iceberg Lakehouse* from Manning covers pipeline design and where each processing engine fits in a platform. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
