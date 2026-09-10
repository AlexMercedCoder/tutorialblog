---
title: "Running an Iceberg Lakehouse on Kubernetes"
date: "2026-09-10"
description: "Catalog, maintenance, and compaction as Kubernetes workloads: scheduling classes, job structure, credential flow, and the failures that come from the interaction."
author: "Alex Merced"
category: "Data Engineering"
tags:
  - Kubernetes
  - Apache Iceberg
  - Apache Polaris
  - compaction
  - platform engineering
canonical: https://iceberglakehouse.com/posts/iceberg-on-kubernetes/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-on-kubernetes/).

A team moves their lakehouse onto Kubernetes because everything else already runs there. The catalog goes into a Deployment, Spark jobs run through the Spark operator, and maintenance becomes a CronJob. Six weeks later the catalog is getting evicted to make room for batch executors, a compaction job that overlaps with the next night's ingestion is producing commit conflicts nobody is watching, and a credential that expires mid-job takes down a maintenance run that then retries from the beginning.

None of that is a Kubernetes problem or an Iceberg problem. It is what happens when a stateful, latency-sensitive, permission-holding service and a set of long-running batch jobs get scheduled by a system that was told nothing about which is which.

This piece covers the parts of running a lakehouse on Kubernetes that are specific to the lakehouse: what the catalog needs from the scheduler and why it is different from every other pod in the cluster, how maintenance work should be structured as jobs, how credentials and identity flow, and the failure modes that come from the interaction rather than from either system alone. I work at Dremio, so lakehouse enthusiasm is professional. The patterns are engine-agnostic.

## The three workload classes

Everything in a Kubernetes lakehouse falls into one of three classes with different scheduling requirements, and treating them uniformly is the root of most trouble.

**The catalog is a critical service.** Stateless pods in front of a database that is the correctness boundary for every table. Every query from every engine starts with a call to it. It needs high availability, low latency, priority in scheduling, and protection from eviction. It looks like an API service and it should be treated like a tier-one one.

**Query engines are latency-sensitive and elastic.** They scale with demand, they hold no durable state, and users wait on them. They want fast scheduling and enough headroom that a burst does not queue.

**Maintenance and batch are interruptible and cost-sensitive.** Compaction, expiry, orphan cleanup, and scheduled transformations. Nobody is waiting, restarting is acceptable, and they are the best candidates for spot capacity in the cluster.

Those three want opposite things from the scheduler. The catalog wants guaranteed resources and stability. Batch wants cheap capacity and tolerates disruption. Engines want burst capacity on demand. A single node pool with default settings gives all three the same treatment, which means the catalog competes for resources with a Spark executor, and the scheduler has no basis for preferring one.

The structural fix is separation: distinct node pools with distinct instance types and pricing, priority classes that encode the ordering, and taints and tolerations so batch cannot land on the nodes reserved for the catalog.

```yaml
# Priority ordering, from a class the catalog references in its pod spec
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: lakehouse-catalog
value: 1000000
globalDefault: false
description: "Catalog service. Evicting this takes every engine offline."
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: lakehouse-batch
value: 1000
globalDefault: false
description: "Maintenance and batch. Interruptible by design."
```

That is ten lines and it prevents the most common failure in this whole architecture, which is a catalog evicted by a batch job.

## What the catalog needs

The catalog deserves its own section because its requirements are unlike anything else in the cluster.

**Three replicas minimum, spread across zones.** Not for throughput. For the fact that a catalog outage takes every engine with it, so a single-node failure or a zone failure should not be able to cause one.

```yaml
replicaCount: 3

topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: DoNotSchedule
    labelSelector:
      matchLabels:
        app.kubernetes.io/name: catalog

podDisruptionBudget:
  minAvailable: 2
```

The disruption budget is the part people skip, and it is what stops a node drain during a cluster upgrade from taking all three replicas at once.

**Requests equal to limits.** A guaranteed quality-of-service class rather than burstable. A catalog that gets throttled under CPU pressure produces latency spikes on every query in the cluster, and the throttling is invisible unless you are looking for it.

```yaml
resources:
  requests: { memory: "8Gi", cpu: "4" }
  limits:   { memory: "8Gi", cpu: "4" }
```

**Shared signing keys across replicas.** The failure that consumes a full day the first time it happens. With multiple replicas and auto-generated token signing keys, each pod generates its own, and a token minted by one fails validation on another. The symptom is intermittent authentication failures at roughly one over the replica count, which looks exactly like a load balancer problem and is not. Provision the key material as a Secret and reference it.

**Readiness wired to the database.** The catalog is stateless and its database is not. A readiness probe that returns healthy while the database is unreachable keeps a useless pod in the load balancer rotation, answering requests it cannot serve. Point readiness at a check that touches persistence, and keep liveness pointed at something shallower, so a brief database blip removes pods from rotation rather than restarting them all at once.

**The database itself is not in the cluster.** Running the catalog's Postgres as a StatefulSet is possible and it is rarely the right call. The catalog database holds the mapping from table names to metadata files, which is the one piece of state whose loss is not recoverable from object storage. Managed database services provide backups, point-in-time recovery, and failover that a StatefulSet gives you the opportunity to build yourself. Use a managed instance and connect to it.

If the database must run in-cluster, then it needs an operator that handles failover, storage that survives node loss, verified restore drills, and a backup destination outside the cluster. That is a real project and it should be a deliberate decision rather than a default.

## Maintenance as scheduled jobs

Compaction, expiry, orphan cleanup, and statistics are the natural fit for Kubernetes jobs, and the structure matters more than the commands.

**One CronJob per operation, not one per everything.** The four maintenance operations have different costs, different cadences, and different failure consequences. Bundling them means the expensive one sets the schedule for all of them and a failure in one blocks the rest.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: iceberg-expire-snapshots
spec:
  schedule: "0 2 * * *"
  concurrencyPolicy: Forbid          # never two expiries at once
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 5
  startingDeadlineSeconds: 3600      # skip rather than pile up after an outage
  jobTemplate:
    spec:
      backoffLimit: 2
      activeDeadlineSeconds: 7200    # bounded, so a hung job does not run all day
      template:
        spec:
          priorityClassName: lakehouse-batch
          restartPolicy: Never
          serviceAccountName: iceberg-maintenance
          tolerations:
            - key: workload
              operator: Equal
              value: batch
              effect: NoSchedule
          containers:
            - name: expire
              image: registry.internal/iceberg-maintenance:1.11.0
              args: ["expire-snapshots", "--catalog", "prod", "--older-than", "7d"]
              resources:
                requests: { memory: "4Gi", cpu: "2" }
                limits:   { memory: "8Gi", cpu: "4" }
```

Five settings in that manifest each prevent a specific failure.

`concurrencyPolicy: Forbid` stops two runs of the same maintenance operation from colliding. Two compaction jobs on one table produce commit conflicts and duplicated work, and the default policy allows exactly that.

`startingDeadlineSeconds` prevents the pile-up after a cluster outage, where every missed schedule fires at once and a night's worth of maintenance jobs start simultaneously.

`activeDeadlineSeconds` bounds a hung job. Without it, a compaction that stalls on a stuck connection runs until someone notices, holding capacity and blocking the next scheduled run.

`backoffLimit` bounds retries. Maintenance failures are frequently deterministic, and retrying a deterministic failure six times wastes an hour to reach the same conclusion.

The toleration and priority class keep it on batch capacity where it belongs.

**Order the operations across schedules, not inside one job.** Expiry before compaction, so compaction does not rewrite files that expiry is about to dereference. Compaction before manifest rewriting. Statistics last. Separate CronJobs with staggered times express this and keep each operation independently observable.

**Stagger across tables.** A platform with hundreds of tables firing maintenance at 2am needs a cluster sized for the peak, idle the rest of the day. Spreading the same work across a six-hour window lets much smaller capacity absorb it, and since nothing waits on the result, the longer wall clock costs nothing. On a cluster with an autoscaler this shows up directly in the node count graph: a staggered schedule produces a gentle plateau overnight, and an unstaggered one produces a spike that provisions nodes for twenty minutes of work.
## The maintenance runner, in practice

Rather than one CronJob per table, most platforms past a few dozen tables want a single scheduled runner that decides what to work on. The shape is small enough to sketch.

```python
"""Runs as a CronJob. Reads policy, inspects table state, picks targets."""
import os
from datetime import datetime, timedelta
from pyiceberg.catalog import load_catalog

catalog = load_catalog("prod", uri=os.environ["CATALOG_URI"])
BUDGET = timedelta(minutes=int(os.environ.get("BUDGET_MINUTES", "45")))

def needs_compaction(table, policy) -> bool:
    files = table.inspect.files().to_pylist()
    if not files:
        return False
    by_partition = {}
    for f in files:
        key = str(f["partition"])
        by_partition.setdefault(key, []).append(f["file_size_in_bytes"])
    return any(
        len(sizes) >= policy["min_files"]
        and (sum(sizes) / len(sizes)) < policy["target_bytes"] / 4
        for sizes in by_partition.values()
    )

def main():
    deadline = datetime.utcnow() + BUDGET
    for identifier, policy in load_policy().items():          # from a table or ConfigMap
        if datetime.utcnow() > deadline:
            print("budget exhausted, remaining tables deferred to next run")
            break
        table = catalog.load_table(identifier)
        if needs_compaction(table, policy):
            print(f"compacting {identifier}")
            run_compaction(identifier, policy)                # emits bytes_rewritten
        else:
            print(f"skipping {identifier}: layout within policy")

if __name__ == "__main__":
    main()
```

Four properties make this preferable to per-table CronJobs at scale.

**Decisions come from table state, not from a calendar.** A table whose layout is already within policy gets skipped, which is the difference between maintenance cost proportional to need and maintenance cost proportional to table count.

**A time budget bounds the run.** Work that does not fit rolls to the next run rather than overrunning the window. Combined with `activeDeadlineSeconds` as a hard stop, the job cannot become the thing that blocks tomorrow's schedule.

**Policy is data.** Adding a table means a row, not a manifest and a deployment. Changing a threshold across a hundred tables is one edit.

**One place emits the metrics.** Bytes rewritten, tables considered, tables acted on, per run. That is the instrumentation the cost model and the anomaly alert both need, and it exists because the runner is one program rather than a hundred jobs.

The trade is that a single runner is a single point of failure for maintenance and processes tables serially. Both are addressable by running several instances partitioned by table prefix, which is a small change to the same design and keeps the operational surface at a handful of manifests.

## Identity and credentials

The place where Kubernetes and lakehouse security models have to meet, and where getting it wrong is expensive.

**Use workload identity, not static keys in Secrets.** Every cloud provider offers a mechanism binding a Kubernetes service account to a cloud identity, so a pod receives short-lived credentials without a stored key. A Secret holding a static access key is a credential with no expiry, mounted into a pod, readable by anyone with access to the namespace, and rotated by a process nobody has written.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: iceberg-maintenance
  annotations:
    # Cloud-specific binding to a role scoped to the warehouse prefix
    iam.example.com/role: arn:aws:iam::123456789012:role/iceberg-maintenance
```

**Give each workload class its own service account.** The catalog, query engines, and maintenance jobs need different access. The catalog needs its database and the storage locations it delegates. Maintenance needs read and write on table data plus catalog API access. Query engines increasingly need neither, because they receive vended credentials from the catalog. Three service accounts with three scoped roles rather than one shared identity.

**Prefer catalog-vended credentials for engines.** Where the catalog issues scoped, short-lived storage credentials, the engine pods hold no storage access of their own, and permissions are enforced in one place. This composes well with Kubernetes, because the engine's service account needs only enough to authenticate to the catalog.

**Watch credential lifetime against job duration.** The failure that presents as a permissions error two hours into a four-hour job. A vended credential valid for one hour, held by a maintenance job that runs longer, expires mid-run. The fix is either a longer lifetime or a client that refreshes, and the diagnostic is the timing: the job ran successfully for exactly the credential lifetime.

**Never put the catalog's bootstrap credential in a Deployment.** It is a break-glass identity. It belongs in a secrets manager, used once by a human during setup to create the service principals everything else uses, and rotated afterward.

## Where the state lives

A useful exercise when designing any of this: enumerate every piece of state and decide deliberately where it sits, because Kubernetes makes it easy to put stateful things in places that do not survive.

**Table data and metadata.** Object storage. Durable, replicated by the provider, and entirely outside the cluster. Nothing in Kubernetes affects it.

**The table-name to metadata-file mapping.** The catalog database. The one piece of state whose loss is not recoverable from object storage without a painful reconstruction. Managed instance, backed up, restore drilled.

**Grants, principals, and catalog configuration.** Also the catalog database, and worth generating from a declarative source in version control so that rebuilding it is a script rather than an excavation.

**Token signing keys.** A Secret, provisioned rather than generated, shared across replicas, rotated deliberately.

**Maintenance policy.** A table or a ConfigMap, in version control either way.

**Job history and outcomes.** Kubernetes keeps a bounded history and it is not a record. Anything you want to reason about later belongs in a table you write to from the job.

**Engine caches and shuffle data.** Ephemeral by design. The only question is whether losing them is expensive, and that determines your spot and autoscaling posture.

The pattern that falls out: almost nothing durable belongs inside the cluster. The cluster runs compute and holds configuration, the object store holds data, and a managed database holds the one piece of critical mutable state. A team that can name where each item on that list lives has a recovery story. A team that cannot has a cluster whose loss is an open question.

## Query engines in the cluster

Engines have their own considerations, and one that is specific to running them next to a lakehouse.

**Executors are elastic and drivers are not.** A Spark driver holding job state is disruption-sensitive in a way its executors are not. Running executors on spot capacity with drivers on stable nodes is the standard arrangement and it works well, provided the driver's node pool is actually stable.

**Shuffle data outlives the pod that produced it.** Executor loss during a shuffle-heavy job means recomputation. Where the engine supports external shuffle or remote shuffle storage, it changes the economics of spot capacity substantially, because a preempted executor stops being expensive.

**Locality is mostly irrelevant and network throughput is not.** Compute and storage are separate by design, so there is no data locality to preserve. What matters is network bandwidth to object storage, which varies by instance type by more than people expect, and a node type chosen for CPU price can bottleneck on network for scan-heavy work.

**Cache warmth is a real asset with no home.** Engines that cache data or metadata locally lose it when pods recycle. Aggressive autoscaling that terminates idle executors keeps costs down and throws away cache, and the tradeoff is worth measuring rather than assuming in either direction.

**Give interactive and batch separate capacity.** An interactive engine competing with a nightly batch job for the same nodes produces exactly the latency profile users complain about, and the fix is capacity separation rather than tuning. Teams try query queue configuration first because it is closer to hand, and it manages contention rather than removing it.

## Networking and storage access

Two areas where cluster configuration affects lakehouse behavior directly.

**Egress path to object storage.** Traffic from pods to object storage should use a private endpoint rather than routing over the public internet through a NAT gateway. The NAT path is slower, less reliable under load, and charged per gigabyte, which on a lakehouse means charging for every byte every query reads. This is one of the most common unnoticed costs in a Kubernetes lakehouse, and the fix is a configuration change.

**DNS caching and long-running JVMs.** JVM engines cache DNS resolution, sometimes indefinitely, and a catalog endpoint whose backing pods move produces connections to addresses that no longer serve. Setting a bounded DNS TTL in the JVM configuration avoids a class of failure that presents as intermittent connectivity after an unrelated deployment.

**Network policy between namespaces.** Engines need to reach the catalog and object storage, and not each other or the cluster's control plane. Default-allow networking makes a compromised job pod a reachable path to everything else, and a modest set of policies closes it.

**Service mesh is optional and not free.** A mesh adds latency to every catalog call, and catalog calls are on the critical path for every query. Where a mesh is already mandated, measure the added latency at p99 rather than at the mean. Where it is not, the lakehouse is not the workload that justifies introducing one.

## Autoscaling that matches the workload

Three different scaling behaviors are needed, and applying one policy to all of them produces either waste or queuing.

**The catalog scales on concurrency, not throughput.** Its bottleneck is rarely CPU on the pods. It is database connections and request concurrency. Horizontal scaling with a CPU target frequently does the wrong thing here: it adds replicas that each open a connection pool, and the database's connection ceiling is what actually binds.

```yaml
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 8
  targetCPUUtilizationPercentage: 70
```

Set `maxReplicas` from the arithmetic rather than from optimism: replicas times per-pod pool size has to stay under the database's `max_connections` with headroom for administrative sessions. A catalog that scales itself into connection exhaustion produces a latency cliff that looks like a database problem and is a configuration problem.

**Engines scale on queue depth.** CPU-based scaling for query engines lags, because a burst of queries queues before it consumes CPU. Where the engine exposes pending-work metrics, scaling on those responds correctly. Where it does not, over-provision modestly and accept the cost, since the alternative is users waiting for a scale-up that starts after they are already waiting.

**Batch does not autoscale, it schedules.** Maintenance jobs request what they need and the cluster autoscaler adds nodes to satisfy them. What matters here is node provisioning latency: a job that waits four minutes for a node to join has a four-minute floor on its runtime, which matters when a job takes six.

**Scale-down needs protection.** Aggressive scale-down terminates pods mid-work. For engines that means recomputation, for maintenance it means a lost run. Annotations preventing eviction of pods running batch work, plus disruption budgets on the catalog, are what keep the cluster autoscaler from being counterproductive.

One number worth watching across all three: the fraction of pod scheduling events that wait more than a minute. Rising scheduling latency is the earliest signal that the node pools are sized wrong, and it shows up before anything fails.

## Multi-tenancy inside one cluster

Platforms serving several teams face a choice between namespace isolation and separate clusters, and namespaces are usually sufficient with a few additions.

**Resource quotas per namespace.** Without them, one team's runaway Spark job consumes the cluster. With them, it consumes its own quota and fails, which is the correct blast radius.

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-quota
  namespace: analytics-growth
spec:
  hard:
    requests.cpu: "200"
    requests.memory: 800Gi
    count/jobs.batch: "50"
```

**Limit ranges to catch unbounded pods.** A pod with no resource requests schedules anywhere and consumes whatever is available. A default limit range in every namespace stops that pattern at admission.

**Separate service accounts and catalog principals per team.** The Kubernetes identity and the catalog identity should correspond, so that a job's data access matches its namespace's intent. Where they diverge, a team's job running in their namespace with a shared catalog principal reaches data the namespace was not supposed to touch.

**Network policy between team namespaces.** Default-deny between namespaces, with explicit allowances to the catalog and shared services. This is standard practice and it gets skipped often enough to be worth stating.

**The catalog stays shared and central.** Per-team catalogs fragment the metadata and multiply operational burden. One catalog with proper role separation, in its own namespace, reachable from team namespaces through policy, is the arrangement that scales.

Separate clusters become the right answer at the point where teams need independent upgrade cadences or genuinely separate availability targets, and not before. The operational cost of a second cluster is higher than most teams estimate.

## Images and dependency pinning

A small section for a category of failure that wastes disproportionate time.

**Pin every image by digest, not by tag.** A maintenance image tagged `latest`, or even a version tag that gets rebuilt, means a CronJob that ran correctly for months starts behaving differently with no change on your side. Digest pinning makes the job deterministic and makes an upgrade an explicit commit.

**Bake the engine dependencies into the image.** A Spark job that downloads its Iceberg runtime from a package repository at startup adds a minute or more to every cold start, depends on an external service being available, and introduces version drift between runs. Building an image with the jars already present removes all three problems, and it is the single largest reliability improvement available to containerized Spark work.

**Match the Iceberg version across everything that touches a table.** The catalog, the engines, and the maintenance tooling should agree. A writer producing metadata a catalog validates differently, or a maintenance job using a newer library against an older catalog, produces errors that read as corruption and are version mismatches.

**Keep an upgrade job that runs the same work against the next versions.** Scheduled, allowed to fail, reporting somewhere visible. It is how you learn that the next release changes something you depend on, with time to plan rather than during an upgrade window.

**Size the image for startup speed.** Maintenance jobs run frequently and briefly. An image that takes ninety seconds to pull on a cold node adds ninety seconds to every run and to every retry, which matters when the job itself takes four minutes. Multi-stage builds and a pre-pulled base on the batch node pool both help.

## Upgrades without an outage

Three upgrade paths intersect here and each has its own hazard.

**Cluster upgrades drain nodes.** A rolling node upgrade evicts pods in waves. With a disruption budget on the catalog, the drain waits rather than taking all replicas, which is the entire reason the budget exists. Without one, a routine cluster upgrade produces a catalog outage in the middle of a business day.

**Catalog upgrades touch a database schema.** The sequence that works: read the release notes for every version being skipped rather than only the target, snapshot the database, apply schema changes from a single place with the old version still running, then roll the pods one at a time watching readiness, then verify with a real workload rather than a health check. The admin tooling version has to match the target server version, because it carries the schema knowledge.

**Engine and library upgrades change table behavior.** A new engine version writes metadata a catalog validates differently, or changes a default that alters file layout. The protection is a staging environment where the same tables get exercised by the new version before production, plus the assertion suite from your testing practice running against it.

The ordering across all three: upgrade the catalog before the engines that depend on it, and never in the same window. Two moving parts in one change window means an incident with two candidate causes.

## What this looks like when it is working

The steady state, described concretely, since checklists read better against a picture of the destination.

The catalog runs three pods across three zones, on nodes nothing else touches, at a priority nothing preempts. Its p99 latency sits in the low tens of milliseconds and its dashboard has one line that matters, which is the database connection pool. Its database is a managed instance in the same region with point-in-time recovery and a restore that somebody has actually performed.

Query engines scale between a floor that handles the morning and a ceiling nobody has hit, on their own node pool, with interactive and batch capacity separated so a nightly job cannot slow a dashboard.

Maintenance runs as a dozen CronJobs spread across a six-hour overnight window, each bounded, none able to overlap itself, all on spot capacity with partial progress enabled. Their output flows into a table that records bytes rewritten per run, and a weekly review looks at the two or three tables whose numbers moved.

Every workload authenticates through a service account bound to a scoped cloud identity. No static keys exist in any Secret. Engines hold no storage credentials at all, receiving scoped ones from the catalog per table.

Five alerts exist. Most weeks none of them fires.

That is achievable, most of it is configuration rather than engineering, and the gap between it and a default deployment is where the incidents in this article live.

## Observability

Three signal sources, each answering a question the others cannot.

**Catalog metrics.** Request latency by endpoint at p99, error rate by status class, database connection pool saturation, and authentication failure rate. That last one catches the shared-signing-key problem and credential expiry before anyone files a ticket. Configure explicit histogram buckets, because catalog latency problems live in the tail and averages hide them completely.

**Job outcomes and duration.** CronJob success and failure are visible in Kubernetes and job *behavior* is not. A compaction job that succeeds while rewriting the entire table instead of one partition looks identical to a correct run. Emit the bytes rewritten and files affected from the job itself, into a metric or a table, and alert on a large deviation rather than on failure alone.

**Table-level signals.** File counts per partition, snapshot age, and delete accumulation. These are properties of the data rather than of the cluster, and they are how you find out that maintenance has been silently ineffective for a month because a filter stopped matching.

The alert set worth having: catalog p99 latency, catalog error rate, connection pool saturation, any maintenance CronJob with no successful run in twice its period, and bytes rewritten deviating sharply from its baseline. Five alerts, and they cover the failures that are otherwise invisible.

## Cost, specifically

Running a lakehouse on Kubernetes changes where the money goes, and three lines are worth watching that a general cluster cost review misses.

**Idle catalog capacity is the price of availability.** Three guaranteed pods at four cores each, sized for peak concurrency, sit mostly idle. That is the correct trade, since the alternative is a catalog that degrades under load and takes every engine with it, and it is worth stating explicitly in a cost review so it does not get cut by someone reading utilization numbers without context.

**Batch on spot is where the savings are.** Maintenance is interruptible work with nobody waiting, which makes it close to an ideal spot workload. Combined with partial progress on compaction, so interruptions do not discard completed work, spot capacity takes a substantial bite out of the largest compute line in a lakehouse.

**NAT egress is the silent one.** Pods reading object storage through a NAT gateway pay per gigabyte for every byte of every scan. On a lakehouse that is an enormous volume, and the charge appears on a networking line nobody associates with query cost. Private endpoints remove it. This is worth checking on day one of any Kubernetes lakehouse, because the fix is a configuration change and the cost accrues continuously until someone makes it.

Two habits keep the rest legible. Label every workload with a team and a workload class, so cluster cost tooling can attribute spend the way the four-meter model attributes platform spend. And review node pool utilization separately per pool, since an aggregate number blends a deliberately idle catalog pool with a batch pool that should be running hot, and the blend tells you nothing about either.

## Failure modes from the interaction

Six problems that come from running these two systems together rather than from either alone.

**Catalog evicted by a batch job.** The scheduler had no reason to prefer it. Priority classes and dedicated node pools with taints, plus a disruption budget so cluster maintenance does not do the same thing more slowly.

**Missed schedules piling up after an outage.** Every CronJob that missed its window fires at once when the cluster recovers, and the resulting stampede is worse than the outage. Bounded by `startingDeadlineSeconds` on every CronJob.

**Two maintenance runs on one table.** A long-running compaction still going when the next schedule fires. Commit conflicts, doubled work, and occasionally a failure that leaves the table's file layout worse than before. `concurrencyPolicy: Forbid`, plus an `activeDeadlineSeconds` that bounds how long a run can hold the slot.

**Maintenance colliding with ingestion.** Not a Kubernetes concern and it becomes one when schedules are managed separately by different teams. The compaction CronJob and the streaming writer both touch the same partitions, conflicts rise, and both sides retry. Schedule maintenance in the ingestion trough and scope compaction filters away from actively written partitions.

**OOM kills on maintenance jobs.** Compaction memory scales with file group size and parallelism, and a job whose limit was set from a small table gets killed when the table grows. The signature is a job that succeeded for months and now fails at the same point. Set limits from measurement and revisit them when tables grow.

**Spot preemption without partial progress.** A compaction job on spot capacity that gets preempted at 90% and commits nothing has wasted all of it. Enabling partial progress in the compaction configuration, so work commits in batches, turns preemption from a total loss into a small one, and it is what makes spot capacity sensible for this workload at all.

## Migrating an existing lakehouse onto the cluster

For a team whose catalog and jobs currently run on virtual machines, the order that avoids surprises.

**First, move the batch work.** Maintenance jobs and scheduled transformations are the safest starting point: interruptible, easy to run in parallel with the existing arrangement, and a genuine test of image building, service accounts, and storage access. Run them in both places for a week and compare outcomes.

**Second, move the query engines.** Elastic, stateless, and the place where cluster autoscaling proves itself. Route a fraction of traffic first, watch latency at p99 rather than at the mean, and pay attention to network throughput on the node type you chose.

**Third, move the catalog, and last.** It is the piece whose failure takes everything down, so it moves once the surrounding pieces are proven. Run it in the cluster alongside the existing one, pointed at the same database, and shift traffic gradually. The database itself does not move.

**Never move the database as part of this.** If the catalog's Postgres is being changed at the same time as the catalog's runtime, an incident has two candidate causes and a rollback has two moving parts. Move the runtime first, the database later or never.

**Keep the old path warm until the new one has survived a full cycle.** A month covering a cluster upgrade, a node pool scale event, a maintenance weekend, and at least one unexpected failure. The failures that matter here are the interaction ones from earlier in this article, and they need time and load to appear.

The whole sequence runs a couple of months at an unhurried pace, and the pace is the point. Every step is reversible until the catalog moves, and the catalog step is the one worth doing slowly.

## An operator, or manifests

The question every team asks eventually.

**Plain manifests and Helm charts get you a long way.** A catalog Deployment, a few CronJobs, service accounts, and priority classes. Everything above is expressible this way, it is transparent, and it uses knowledge the team already has.

**Operators earn their keep at a certain scale.** When maintenance policy needs to be table-driven rather than manifest-driven, when the number of tables makes generating CronJobs unwieldy, or when you want table state to drive scheduling decisions, a controller that reads table metadata and creates jobs accordingly is the right shape. That is a real piece of software to own.

**The middle path is usually right.** A single scheduled job that reads a policy table and decides what to do, rather than one CronJob per table. Policy lives in a table or a config map, the job queries table state to pick targets, and Kubernetes only sees a handful of manifests. This scales to hundreds of tables without becoming a controller.

**Catalog-managed maintenance changes this calculation.** As catalogs take over scheduling maintenance based on table policy, the cluster-side work shrinks to running the catalog well. That direction of travel is worth knowing about before investing heavily in cluster-side maintenance orchestration.

## A deployment checklist

For a team standing this up, in order.

- Separate node pools for catalog, engines, and batch, with taints and tolerations.
- Priority classes encoding the ordering, referenced by every workload.
- Catalog at three replicas, spread across zones, with a disruption budget and guaranteed resources.
- Shared token signing key material provisioned as a Secret.
- Catalog database on a managed service outside the cluster, with verified restore.
- Readiness probes that touch persistence.
- Workload identity for every service account, no static keys.
- One CronJob per maintenance operation, with `Forbid` concurrency, a starting deadline, an active deadline, and a bounded backoff.
- Maintenance staggered across tables and ordered across operations.
- Partial progress enabled on compaction if it runs on spot capacity.
- Private endpoint egress to object storage.
- The five alerts: catalog latency, catalog errors, pool saturation, stale CronJobs, and anomalous bytes rewritten.

Most of that is an afternoon of YAML, and it prevents the failures that otherwise take a quarter to find one at a time.

## Conclusion

Kubernetes runs a lakehouse well once the scheduler is told which workloads are which. The catalog is a tier-one service whose failure takes every engine offline, and it needs the treatment that implies: replicas across zones, guaranteed resources, a disruption budget, shared signing keys, and a database that lives somewhere with real backups. Maintenance is interruptible batch work, and it belongs in bounded CronJobs that cannot overlap themselves, cannot pile up after an outage, cannot run forever, and commit partial progress so preemption is survivable. Engines sit in between, elastic and latency-sensitive, and they want their own capacity rather than competing with either.

The failures worth designing against come from the interaction. A batch job evicting the catalog. Two compaction runs colliding on one table. A maintenance job whose credential expires halfway through. Egress routed through a NAT gateway and charged per gigabyte for every byte every query reads. None of those is visible in either system's documentation, because each is a consequence of running them together.

Start with priority classes and node pool separation, which is ten lines of YAML and prevents the worst of it. Then bound every CronJob. Then wire the five alerts. The rest is ordinary Kubernetes, applied to a workload with an unusual amount at stake in one small service.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse operations. *Apache Polaris: The Definitive Guide* covers the catalog service this article spends most of its attention protecting, including its persistence and deployment model, and *Architecting an Apache Iceberg Lakehouse* covers how the pieces fit together across environments. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
