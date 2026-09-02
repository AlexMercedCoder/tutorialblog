---
title: "Orchestration in 2026: Airflow 3 vs Dagster vs Prefect vs Event-Driven"
date: "2026-09-02"
description: "Where Airflow 3, Dagster, Prefect, and event-driven triggering stand for lakehouse pipelines in 2026, after the Prefect acquisition of Dagster."
author: "Alex Merced"
category: "Data Engineering"
tags:
  - Airflow
  - Dagster
  - Prefect
  - Orchestration
  - Event-Driven
canonical: https://iceberglakehouse.com/posts/orchestration-in-2026/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/orchestration-in-2026/).

The orchestration question used to be simple: Airflow, or something that wanted to be Airflow. It is not simple in 2026. Apache Airflow 3 shipped in April 2025 and has moved through three minor releases since, each adding capabilities that its competitors spent years selling as differentiators. Prefect announced on July 13, 2026 that it is acquiring Dagster Labs, with both products continuing under their own names and licenses, which puts the two most widely adopted alternatives to Airflow inside one company. And a growing share of lakehouse pipelines do not run on any of the three, because the events that should trigger them, a snapshot committed, a file landed, a message published, are handled by the catalog, the object store, or a streaming engine directly.

For a team running an Apache Iceberg lakehouse the question is not which tool has the nicest UI. It is which combination of scheduling, dependency tracking, execution, and observability fits pipelines whose units of work are table snapshots rather than task completions. This article covers what orchestration has to do for a lakehouse, where each of the three major orchestrators stands as of mid-2026, what the Prefect acquisition means in practice, when event-driven triggering replaces an orchestrator entirely, and how the same pipeline looks in each model. I work at Dremio, and none of the tools discussed here is a Dremio product, though all of them are used to drive Dremio and every other engine.

## What Orchestration Does for a Lakehouse

Strip the marketing away and an orchestrator does four jobs.

**Triggering.** Deciding when work runs: on a schedule, when an upstream produces something, when an external event arrives, or when someone asks.

**Dependency tracking.** Knowing that the revenue model depends on the orders table which depends on the CDC stream, so that a failure upstream stops work downstream and a rerun upstream propagates.

**Execution.** Running the work somewhere, with isolation, retries, timeouts, and secrets, and increasingly in a language or environment the orchestrator does not control.

**Observability.** Showing what ran, what failed, what is late, and what changed, in enough detail to diagnose and enough history to audit.

A lakehouse adds specific demands to each. Triggering wants to be snapshot-aware: "run when the orders table has a new snapshot" rather than "run at 6 a.m. and hope the load finished." Dependency tracking wants to be table-grained, because the tables are the assets and the tasks are incidental. Execution has to span engines, since a pipeline commonly ingests with one tool, transforms with Spark or a dbt adapter on Trino or Dremio, compacts with a maintenance job, and publishes to a serving layer. And observability wants to know which snapshot each run produced, because that is how a bad run gets rolled back.

There is also the work an orchestrator has to schedule that has no equivalent in a warehouse: compaction, snapshot expiry, orphan-file removal, manifest rewrites, and statistics refreshes. Every table needs them on a cadence, the cadence depends on write patterns, and a team with two thousand tables has two thousand maintenance schedules to manage. Whether an orchestrator handles this well is a real differentiator, and none of the three does it natively.

## Apache Airflow 3: The Incumbent Rebuilt

Airflow 3.0 was the largest release in the project's history, and the three minor releases since have filled in what 3.0 started. As of Airflow 3.3, the relevant capabilities for a lakehouse team are these.

**Asset-based scheduling.** The dataset concept from Airflow 2 was redesigned as assets, with an `@asset` decorator that turns a Python function into a producer of a named data object and lets other DAGs schedule on it. Assets can be composed with logical operators: run when both A and B have updated, or when either has. Asset events carry metadata from the producing task to the consuming DAG through Jinja and the task context. Airflow 3.2 added asset partitioning, which maps upstream events to downstream partition keys and gives Airflow a partition model comparable to what Dagster had for years. Airflow 3.3 added `PartitionedAtRuntime` timetables for partitions assigned when a run starts.

**Event-driven scheduling.** Asset watchers monitor external systems and emit asset events when something happens. The initial watcher supported AWS SQS. Additional messaging providers have followed. This is what turns Airflow from a clock into a reactor, and combined with assets it means a DAG can run when a file lands in a bucket that publishes to a queue, without a sensor polling in a loop.

**The Task Execution API and Task SDK.** Tasks no longer need direct access to the metadata database. They communicate through an API, which means workers can run anywhere with network access to the API server, in any language with an SDK, and with a much smaller security surface. This is the change that lets Airflow tasks run on a remote Kubernetes cluster in another cloud, or as a Go binary, without the worker holding database credentials.

**DAG versioning.** Airflow tracks structural changes to a DAG over time. A run uses the version that existed when it started, even if the DAG file changed mid-run, and the UI shows which version produced each historical run. This closes a long-standing gap where a DAG's history was uninterpretable after a refactor.

**Scheduler-managed backfills.** Backfills are first-class runs with UI and API support rather than a CLI command that behaved differently from everything else. For a lakehouse, a backfill is a series of partition rewrites, and having the scheduler track them like ordinary runs means they retry, alert, and report the same way.

**Runs without a data interval.** DAGs can run with `logical_date=None`, which removes the assumption that every run corresponds to a time window. Model inference, on-demand maintenance, and asset-triggered runs no longer need to fake an interval.

**Multi-team deployments and human-in-the-loop.** Airflow 3.1 added operators that pause a DAG for human approval. Airflow 3.2 added multi-team support so that one deployment can host teams with separate execution environments and permissions.

**A task and asset state store.** Airflow 3.3 gives tasks a key-value store that survives retries and runs, and gives assets their own state. For lakehouse pipelines this is where a task records the last snapshot ID it processed, so the next run can do an incremental read from that snapshot without an external bookmark table.

What Airflow still is: the largest ecosystem of providers, the widest deployment base, and the most operational surface area. A production Airflow deployment is a scheduler, an API server, a database, workers, and a triggerer, and while the Task SDK has reduced what workers need, the control plane is not small. Teams that already run it well have few reasons to leave. Teams starting fresh have to decide whether the ecosystem is worth the operations.

For a lakehouse specifically, the provider ecosystem covers every engine, and the asset model now supports the table-grained dependency tracking that Dagster made the standard. What Airflow does not have is an opinion about table maintenance, and the state store plus assets are the raw materials for building one rather than a feature.

## Dagster: Assets First, Now Under Prefect

Dagster's founding idea was that pipelines should be modeled as the data assets they produce rather than the tasks that produce them. An `@asset` is a function that materializes a table, a file, or a model, with its upstream assets as arguments. The orchestrator derives the DAG from the asset graph, tracks materializations per asset, and surfaces lineage, freshness, and quality per asset rather than per run.

By 2026 the model has matured into a fairly complete platform.

**Declarative automation.** Instead of scheduling assets, a team declares conditions: materialize this asset when its upstreams have updated, or when it is stale beyond a freshness policy, or on a cron. Dagster evaluates the conditions continuously and materializes what is needed. Freshness policies reached general availability in 2026. This is the closest any orchestrator comes to "keep the table fresh" as a primitive.

**Partitions.** Assets are partitioned by time, by key, or by both, and a materialization targets a partition. Backfills are partition ranges. For an Iceberg table partitioned by day, a Dagster daily partition maps one-to-one, and a backfill of a month is thirty partition materializations that the scheduler tracks individually.

**Asset checks.** Data quality assertions attached to assets and evaluated after materialization, with results in the asset's history. A check that a table's row count grew, or that a column has no nulls, lives next to the asset that produces the table.

**Components and the `dg` CLI.** Dagster 1.13 made Components generally available: a YAML-driven way to define assets from templates, so that a dbt project, an ingestion source, or a Spark job becomes a component with configuration rather than hand-written Python. The `dg` CLI scaffolds and manages them. This lowered the cost of the asset model, which had been its main adoption barrier.

**dbt integration.** Dagster's dbt integration maps every dbt model to a Dagster asset, so a dbt project appears in the asset graph with lineage into and out of the non-dbt assets around it. For lakehouse teams whose transformation layer is dbt on Iceberg, this is the tightest integration available.

**Compass and Dagster+AI.** Slack-native and in-product assistants that use the asset graph, run history, and failures as context for diagnosing problems.

**The acquisition.** On July 13, 2026, Prefect announced it is acquiring Dagster Labs. The stated commitments are specific: Dagster and Dagster+ keep their names, the open-source project keeps its license, pricing is unchanged, roughly forty members of the Dagster team join Prefect, and the founders become advisors. The combined company is expected to operate under the Prefect name from August 2026. Prefect's framing is that Dagster defines outcomes, Prefect executes work, and FastMCP governs what agents can access.

What that means for a team choosing today is a judgment call rather than a fact. The commitments are as strong as acquisition commitments get, the engineering team is largely continuing, and the open-source license means the code is not going anywhere. The risks are the ordinary ones: roadmap priorities shift toward the combined vision, two overlapping products eventually converge, and the pace of Dagster-specific development is set by a company whose name is on the other product. A team that adopts Dagster now should assume continuity for the next two years and watch the release cadence for signals after that.

For a lakehouse, Dagster's asset model is the most natural fit of the three, because the assets are the tables. Its weakness is the same as its strength: everything must become an asset, and workloads that are not asset-shaped, such as an operational job that sends notifications, fit awkwardly. Its pricing for the hosted product moved to per-materialization in 2026, which changes the calculation for teams with many small assets.

## Prefect 3: Python Workflows, Events, and Now Two Products

Prefect's approach has been the opposite of Dagster's. A workflow is a Python function with a `@flow` decorator, tasks are functions with `@task`, and the orchestrator runs them where they are, tracks state, and provides retries and observability. There is no asset graph to restructure code around. There is no scheduler process to run, because the control plane is either Prefect Cloud or a self-hosted server, and work runs in work pools that pull from it.

The relevant capabilities in 2026:

**Events and automations.** Prefect 3 is built around an event stream. Every flow run, task run, and state change is an event, and external systems can emit events too. Automations are rules over the event stream: when a flow fails, notify. When an upstream flow completes, trigger a downstream one. When no run has happened in an hour, alert. This is Prefect's answer to asset-based scheduling, expressed as reactions to events rather than as a declared graph.

**The `@materialize` decorator and asset checks.** Prefect added an asset layer in 2025 so that a task can declare which asset it produces, with lineage and checks. It is lighter than Dagster's model and optional, which is consistent with Prefect's design.

**Work pools and workers.** Flows run in Docker, Kubernetes, serverless, or process work pools. The control plane never touches the infrastructure, which is a security posture some enterprises prefer.

**Dynamic workflows.** Because a flow is ordinary Python, loops, conditionals, and runtime-determined fan-out are native. Pipelines whose shape depends on the data, such as one task per partition discovered at runtime, are simpler in Prefect than in either alternative.

**FastMCP.** Prefect built the Python framework for the Model Context Protocol (MCP) within days of MCP's announcement, and Anthropic adopted it as the official Python SDK. It is now Prefect's third product family and the piece of the combined company aimed at governing what AI agents can reach.

**The April 2026 Cloud release** closed several enterprise gaps around access control and audit that had been reasons to choose Airflow or Dagster in regulated environments.

For a lakehouse, Prefect fits pipelines that are operational and dynamic: reacting to file arrivals, orchestrating a maintenance sweep across whatever tables need it, coordinating agent workflows that query the catalog. It fits less well as the system of record for table lineage, which is where Dagster's asset graph has been stronger, and the acquisition is Prefect's own acknowledgment of that.

## Event-Driven: When the Orchestrator Is the Catalog

A meaningful fraction of lakehouse pipelines in 2026 have no orchestrator in the traditional sense. The triggering happens at the storage or catalog layer, and the work runs in whatever engine is subscribed.

The building blocks are familiar. Object stores emit notifications when objects land. Message brokers carry those notifications and any other event. Serverless functions and streaming engines subscribe and act. What is new is that the lakehouse itself has become a source of events worth reacting to.

**Snapshot commits as events.** A commit to an Iceberg table is a discrete, observable event. REST catalogs are beginning to expose commit notifications, and where they do not, a lightweight poller on the `snapshots` metadata table detects new commits within seconds. A downstream job that runs "when orders has a new snapshot" is more precise than one that runs "when the orders DAG task succeeds," because it triggers on the actual outcome and works regardless of which engine or tool produced the commit.

**Streaming engines as orchestrators.** Apache Flink reading from Kafka and writing to Iceberg is a continuously running pipeline that needs no scheduler. Its checkpoints are its retries. Its backpressure is its rate control. For event data, this replaces a DAG entirely, and the orchestrator's role shrinks to monitoring the Flink job's health.

**Catalog-driven maintenance.** Apache Polaris and other catalogs have started to run maintenance policies, compaction and expiry on declared schedules, as catalog features. When the catalog owns maintenance, two thousand orchestrator DAGs become two thousand policy attachments, which is a different and better problem.

**Cloud-native workflow engines.** Argo Workflows on Kubernetes, AWS Step Functions, and similar tools orchestrate containers and functions in response to events, with no data-specific concepts. Teams that already run them for application workloads sometimes extend them to data pipelines rather than adding a data orchestrator.

**General-purpose durable execution.** Temporal and its relatives provide retries, timeouts, and state for long-running workflows in ordinary code. Some data teams use them for pipelines that are more application than analytics, such as an ingestion service with complex API interactions.

The tradeoff is dependency tracking and observability. An event-driven system knows that a function ran because a message arrived. It does not know that the revenue model is stale because the orders load failed three steps upstream, unless someone built that tracking. The orchestrators exist because that tracking is hard to build and valuable to have. The practical pattern is hybrid: events trigger, an orchestrator tracks. Airflow's asset watchers, Dagster's sensors and declarative automation, and Prefect's automations all exist to let the orchestrator react to events while keeping the dependency graph.

## Comparison

| Dimension | Airflow 3.3 | Dagster (2026) | Prefect 3 | Event-driven |
|---|---|---|---|---|
| Core model | DAGs of tasks, with assets as a scheduling layer | Graph of assets, tasks derived | Python flows and tasks, events and automations | Subscriptions to storage, catalog, or broker events |
| Table-grained lineage | Assets, with partitioning since 3.2 | Native, with partitions, checks, and freshness | Optional via `@materialize` | None unless built |
| Snapshot-aware triggering | Asset watchers plus a custom poller or provider | Sensors plus declarative automation | Events plus automations | Native where the catalog emits commit events |
| Backfills | Scheduler-managed since 3.0, partition-aware since 3.2 | Partition ranges, first-class | Flow parameters, manual | Replay from the event source |
| Execution isolation | Task SDK, remote workers, any language | Code locations, any executor | Work pools, control plane never touches infra | Whatever the subscriber is |
| dbt integration | Provider and Cosmos-style DAG generation | Every model an asset | Task wrapper | None |
| Maintenance scheduling | Build it with DAGs and the state store | Build it with assets and automation | Build it with flows and automations | Catalog policies where available |
| Operational footprint | Largest: scheduler, API server, DB, workers, triggerer | Medium: webserver, daemon, DB, code servers | Smallest self-hosted, or Cloud | Depends on the event infrastructure |
| Ecosystem | Largest by a wide margin | Strong in the modern stack, dbt especially | Growing, plus FastMCP | Cloud-provider native |
| Commercial status | Apache project, several vendors | Acquired by Prefect July 2026, continuing under its name | Independent, now owns Dagster | n/a |

## Observability: What Each Tool Shows About a Table

When a pipeline fails at 3 a.m., the question is not "which task failed" but "which table is wrong, since when, and what depends on it." How well each tool answers that is a function of how much it knows about tables.

**Airflow 3** shows a run's DAG version, its task states, its logs, and, if the DAG declares assets, the asset events it produced. The asset view lists which DAGs produce and consume each asset and when it last updated. What it does not show without extra work is what the asset contains, so the snapshot ID and row count have to be written into the asset event's metadata by the task. The OpenTelemetry traces added in Airflow 2.10 and extended in 3.x let a platform team correlate runs with engine-side metrics in a shared observability stack.

**Dagster** shows an asset's materialization history, its metadata per materialization (which is where the snapshot ID goes), its check results, its freshness against policy, and its upstream and downstream assets. A stale asset is visible as stale, with the failed upstream highlighted. This is the most complete table-level picture of the three, and it is why Dagster is often chosen as the lineage system of record even when other tools do some of the execution.

**Prefect** shows flow and task run states, logs, and the event stream, and with `@materialize` it shows asset lineage and check results. Its strength is the event stream as a queryable timeline: every state change and every custom event, filterable by resource, which is a good fit for the snapshot-as-event pattern. Its weakness is that lineage across flows depends on assets being declared.

**Event-driven** systems show what the event infrastructure shows: messages delivered, functions invoked, Flink checkpoints completed. Table-level state comes from the catalog and the metadata tables, queried directly. A dashboard over `snapshots`, `refs`, and `files` for the tables that matter often gives a clearer picture than any orchestrator UI, because it shows the actual state of the tables rather than the orchestrator's belief about them.

That last point applies to all four. The table's metadata is the ground truth, and a team that queries it directly for freshness, row counts, and file health has an observability layer that does not depend on which orchestrator ran the job or whether the job reported honestly. The orchestrator's view is the process record. The metadata tables are the outcome record. Both are needed, and confusing one for the other is how a green dashboard hides a stale table.

## Lakehouse-Specific Concerns

Four concerns come up regardless of which orchestrator a team picks, and each has a pattern that works.

**Triggering on snapshots, not on task success.** A task that "loads orders" can succeed while producing no commit, or produce a commit that fails validation downstream. The reliable signal is the snapshot. In any orchestrator, a lightweight check that the target table's current snapshot ID changed during the task, and that the new snapshot's summary shows the expected operation and a plausible row count, turns task success into data success. The snapshot ID is then the run's output, recorded in the orchestrator's state, and it is what a rollback targets.

**Idempotency through branches.** Every orchestrator retries, and every retry of a non-idempotent Iceberg write produces duplicate rows or a duplicate snapshot. Writing each run to a branch named for the run, validating, and fast-forwarding `main` on success makes any run rerunnable. A failed run's branch is dropped. This is write-audit-publish, and it makes orchestrator retries safe by construction.

**Maintenance as a fleet operation.** Rather than one DAG per table, a single job on a schedule reads the catalog, evaluates each table's delete-file count, manifest count, and snapshot age against a policy, and runs the maintenance procedures that the policy calls for. Airflow's dynamic task mapping, Dagster's dynamic partitions, and Prefect's dynamic flows all express "one task per table that needs work" naturally. Where the catalog runs maintenance itself, the job becomes a policy audit.

**Multi-engine handoffs.** A pipeline where PyIceberg ingests, Spark transforms, and Dremio serves has three execution environments. The orchestrator's job is to sequence them and pass the snapshot IDs between them, not to run any of them itself. Airflow's Task SDK, Dagster's code locations, and Prefect's work pools all support running each step in its own environment. The anti-pattern is an orchestrator worker that has every engine's client installed.

### A Snapshot-Aware Sensor

Because triggering on snapshots is the single most useful lakehouse-specific practice and none of the orchestrators ship it natively, here is what it looks like as a reusable piece. The logic is the same in every tool: read the table's current snapshot ID, compare it to the last one processed, and fire if it changed.

```python
from pyiceberg.catalog import load_catalog

def latest_snapshot(table_name: str) -> int | None:
    table = load_catalog("polaris").load_table(table_name)
    snap = table.current_snapshot()
    return snap.snapshot_id if snap else None

def new_snapshot_since(table_name: str, last_seen: int | None) -> int | None:
    current = latest_snapshot(table_name)
    if current is not None and current != last_seen:
        return current
    return None
```

In Airflow 3 this is the body of a deferrable sensor, or with a REST catalog that publishes commit notifications to a queue, it is replaced by an asset watcher and needs no polling at all. The last-seen ID lives in the task state store from Airflow 3.3, so it survives restarts. In Dagster it is a sensor that yields a `RunRequest` with the snapshot ID as a tag, and the cursor mechanism stores the last-seen value. In Prefect it is a small flow on a short schedule that emits an `iceberg.snapshot.committed` event, and automations react to the event.

The reason to standardize this rather than let each pipeline poll differently is that the snapshot ID becomes the currency of the whole system. Upstream runs produce it, downstream runs consume it, checks validate it, and rollbacks target it. A pipeline where every step knows which snapshot it read and which it wrote is a pipeline where "what changed" always has an answer.

## Walkthrough: One Pipeline, Three Ways

The pipeline: ingest orders from a source into a raw Iceberg table, run a dbt model that produces a fact table, compact the fact table, and record the resulting snapshot. Each version is abbreviated to the shape rather than the full code.

In Airflow 3 with assets:

```python
from airflow.sdk import asset, dag, task
from airflow.sdk import Asset

@asset(schedule="@hourly", uri="iceberg://lake/raw/orders")
def raw_orders():
    from ingest import load_orders_to_iceberg
    return load_orders_to_iceberg()   # returns new snapshot id

@asset(schedule=[Asset("iceberg://lake/raw/orders")],
       uri="iceberg://lake/analytics/fct_orders")
def fct_orders():
    from dbt_runner import run_model
    return run_model("fct_orders")

@dag(schedule=[Asset("iceberg://lake/analytics/fct_orders")])
def maintain_fct_orders():
    @task
    def compact():
        from maintenance import rewrite_data_files
        return rewrite_data_files("analytics.fct_orders")
    compact()

maintain_fct_orders()
```

The raw asset runs hourly. The fact asset runs when the raw asset updates. The maintenance DAG runs when the fact asset updates. Each asset function returns a snapshot ID that lands in the asset event's metadata for downstream inspection. Adding an SQS watcher to the raw asset replaces the hourly schedule with a reaction to source events.

In Dagster:

```python
import dagster as dg

@dg.asset
def raw_orders() -> dg.MaterializeResult:
    from ingest import load_orders_to_iceberg
    snap = load_orders_to_iceberg()
    return dg.MaterializeResult(metadata={"snapshot_id": snap})

@dg.asset(deps=[raw_orders],
          automation_condition=dg.AutomationCondition.eager())
def fct_orders() -> dg.MaterializeResult:
    from dbt_runner import run_model
    return dg.MaterializeResult(metadata={"snapshot_id": run_model("fct_orders")})

@dg.asset_check(asset=fct_orders)
def fct_orders_has_rows():
    from checks import row_count
    return dg.AssetCheckResult(passed=row_count("analytics.fct_orders") > 0)

@dg.asset(deps=[fct_orders],
          automation_condition=dg.AutomationCondition.eager())
def fct_orders_compacted():
    from maintenance import rewrite_data_files
    rewrite_data_files("analytics.fct_orders")

defs = dg.Definitions(
    assets=[raw_orders, fct_orders, fct_orders_compacted],
    asset_checks=[fct_orders_has_rows],
    schedules=[dg.ScheduleDefinition(name="hourly", cron_schedule="0 * * * *",
                                     target=dg.AssetSelection.assets(raw_orders))],
)
```

The eager automation condition materializes each downstream asset whenever its upstream does. The check runs after the fact table materializes and its result is part of the asset's history. In practice the dbt model is a `dbt_assets` component rather than a wrapped function, and it appears in the graph with every other model.

In Prefect:

```python
from prefect import flow, task
from prefect.events import emit_event

@task(retries=3)
def ingest():
    from ingest import load_orders_to_iceberg
    return load_orders_to_iceberg()

@task
def transform():
    from dbt_runner import run_model
    return run_model("fct_orders")

@task
def compact():
    from maintenance import rewrite_data_files
    return rewrite_data_files("analytics.fct_orders")

@flow
def orders_pipeline():
    raw_snap = ingest()
    fct_snap = transform()
    compact()
    emit_event(event="iceberg.snapshot.committed",
               resource={"prefect.resource.id": "table.analytics.fct_orders",
                         "snapshot_id": str(fct_snap)})
```

The flow is a plain sequence, and the interesting part is the event at the end. An automation subscribed to `iceberg.snapshot.committed` for that resource triggers whatever should follow, in this flow or another, without the flow knowing about it. Scheduling is a deployment setting, not code.

In an event-driven setup, the ingest step is a Flink job or a Lambda subscribed to source events, the transform is triggered by a snapshot poller or a catalog notification on the raw table, and compaction is a catalog policy. There is no code that expresses the pipeline as a whole, which is either the point or the problem depending on whether anyone needs to see it.

## Operating Cost: What Each One Asks of a Platform Team

Feature comparisons understate the dimension that decides most orchestration choices in practice, which is what it costs to run.

**Airflow** self-hosted is a scheduler, an API server, a triggerer, a metadata database, and a worker fleet, plus the Task SDK's execution API. Each is a process to size, monitor, upgrade, and secure. Managed offerings from Astronomer, the cloud providers, and others exist because this is real work. The Task SDK reduced worker requirements, and multi-team mode reduced the number of deployments a large organization needs, but the control plane is the largest of the three. A team that runs it well has a platform engineer on it.

**Dagster** self-hosted is a webserver, a daemon for schedules and sensors, a database, and one gRPC code server per code location. Code locations are the unit of isolation, so a team with many repositories runs many code servers. Dagster+ removes the control plane and charges per materialization, which is predictable for a stable asset graph and less so for one that grows. The asset model's learning cost is front-loaded: teams report weeks to months to restructure existing pipelines, and near-zero marginal cost afterward.

**Prefect** self-hosted is a server, a database, and workers in work pools. It is the lightest of the three to operate, and Prefect Cloud removes the server entirely. The cost shows up in what is not there: without deliberately using `@materialize` and automations, a Prefect deployment has flows and runs but no dependency graph across them, and building one later is work.

**Event-driven** costs whatever the event infrastructure costs, which for a team already running Kafka or cloud eventing is near zero incrementally, and whatever it takes to build the dependency record that the orchestrators provide out of the box. That second cost is the one that gets underestimated.

The decision is often made by which of these a team already knows how to run. That is a legitimate criterion, and it is why Airflow's installed base persists despite its footprint and why the Prefect-Dagster combination is attractive to teams that want one vendor for both models.

## Migrating Between Orchestrators Without Rewriting Pipelines

Consolidation makes migration a live question: an Airflow 2 shop moving to Airflow 3, a Dagster shop watching the acquisition, a Prefect shop now offered Dagster's asset graph. The migration that works keeps the orchestrator thin.

The pattern is to put every unit of work behind an interface that has no orchestrator dependency: a Python function, a container image, or a dbt command that takes inputs and returns a snapshot ID. The ingest function in the walkthrough above, `load_orders_to_iceberg()`, is called identically from an Airflow asset, a Dagster asset, and a Prefect task. The orchestrator-specific code is the decorator and the scheduling declaration, which is a few lines per pipeline. Migrating is rewriting those lines, not the work.

Teams that instead wrote operators, resources, and IO managers deep into the orchestrator's abstractions find that a migration is a rewrite. Airflow operators that embed engine logic, Dagster IO managers that handle Iceberg reads and writes, and Prefect blocks that hold connection logic are all convenient and all couple the work to the tool. The convenience is real. The coupling is the price.

For Airflow 2 to Airflow 3 specifically, the Task SDK changed the import paths and the execution model, and a codebase that used `airflow.sdk` imports and avoided direct metadata database access migrates cleanly. One that reached into the database from tasks, which was common, does not. The project's migration tooling flags most of it.

For a hypothetical Dagster to Prefect move, or the reverse, the asset graph is the hard part. Dagster's assets have no direct equivalent in Prefect's flow model, and Prefect's `@materialize` is lighter than a full asset. The combined company's stated direction is to keep both, so the practical advice is not to plan such a move unless the products actually converge, and to keep the work behind interfaces so that the option stays cheap.

## Failure Modes

**Choosing by feature list.** Every tool now has assets, events, partitions, and a nice UI. The differences are in the model each is built around and in operations. A team that picks Dagster because of asset checks and then fights the asset model for its operational jobs, or picks Airflow for the ecosystem and then runs a control plane it cannot staff, chose by the wrong criterion.

**Task success as data success.** Covered above. The orchestrator says green, the table has no new snapshot.

**One DAG per table for maintenance.** It works at fifty tables and collapses at a thousand. Fleet jobs or catalog policies from the start.

**Orchestrator workers as the compute layer.** Running Spark, dbt, and PyIceberg inside orchestrator workers couples the orchestrator's upgrade cycle to every engine's dependencies. Remote execution in every tool exists to prevent this.

**Ignoring the asset model until lineage is needed.** Airflow DAGs that never declared assets, Prefect flows that never used `@materialize`, and the day someone asks which tables a failed job affected. Declaring assets is cheap at the start and expensive to retrofit.

**Betting on a roadmap during an acquisition.** Adopting Dagster in August 2026 because of a feature promised for 2027 is a bet on priorities that are being reset. Adopt for what ships today.

**Event-driven without a dependency record.** Three months in, nobody can say why the revenue table is stale, because the chain of events that should have produced it is spread across four systems' logs.

## Choosing

The decision is closer to a workload profile than to a product ranking.

A team with an existing Airflow deployment and the operations capacity to run it should upgrade to Airflow 3, adopt assets and watchers, and use the state store for snapshot bookmarks. The ecosystem advantage is real and the gap to the alternatives has closed on the features that mattered.

A team whose pipeline is mostly dbt on Iceberg with ingestion around it, and whose primary need is table-grained lineage, freshness, and quality, fits Dagster's model best. The acquisition is a reason to confirm the commitments are being kept, not a reason to avoid it.

A team whose workloads are dynamic, operational, or agent-driven, and which wants the smallest self-managed footprint, fits Prefect. The addition of Dagster to the same company means the asset-heavy parts of that team's stack have a path that stays in-house.

A team whose pipelines are streaming-first, or whose catalog handles maintenance, or whose organization already runs a cloud-native workflow engine, should ask whether an orchestrator adds anything beyond a dependency record, and if the answer is only that, whether a lighter tool provides it.

And any team should insist on three things regardless of tool: snapshot IDs as the unit of success, branches for idempotency, and maintenance as a fleet operation.

## Where the Ecosystem Is Heading

**Consolidation continues.** Two of the three independent orchestrators are now one company. The Fivetran and dbt Labs merger that completed in June 2026 put ingestion and transformation under one roof. Expect the remaining independent tools to either grow into platforms or attach to one.

**Agents as orchestration clients.** Every orchestrator shipped an AI assistant in the past year, and the more consequential change is agents as callers: an agent that decides a table needs a backfill and triggers it through the orchestrator's API, governed by what FastMCP or an equivalent lets it reach. The orchestrator becomes the safety layer between agent intent and infrastructure.

**Catalogs absorbing scheduling.** Maintenance first, then commit notifications, then possibly declarative freshness at the table level. The more the catalog does, the less the orchestrator has to.

**Airflow's asset model catching up on partitions and state.** Airflow 3.2 and 3.3 closed most of the gap to Dagster on the data-aware side. The next releases will show whether the project intends to close the rest.

**Standardization of lineage events.** OpenLineage is supported by all three orchestrators and by most engines, and a common event format for "this run produced this snapshot of this table" is the piece that lets event-driven pipelines keep a dependency record without an orchestrator. It is close.

## Conclusion

Orchestration for a lakehouse in 2026 is a choice between three mature tools that have converged on the same feature set from different starting points, and a fourth option where the catalog and the event infrastructure do the triggering and the orchestrator, if present, keeps the record. Airflow 3 rebuilt its architecture and closed the data-aware gap. Dagster refined the asset model to the point where it is the reference design, and is now continuing inside Prefect. Prefect built the lightest execution model and the event system, and bought the asset graph it lacked. Event-driven pipelines are real and are growing where the catalog participates.

The tool matters less than the practices: trigger on snapshots, write to branches, treat maintenance as a fleet, keep the execution layer out of the orchestrator, and declare assets from the first pipeline. A team that does those things with any of the four options has an orchestration layer that survives the next acquisition.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and the systems that surround the table format. *Architecting an Apache Iceberg Lakehouse* from Manning covers pipeline design, maintenance, and the operational patterns this article draws on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
