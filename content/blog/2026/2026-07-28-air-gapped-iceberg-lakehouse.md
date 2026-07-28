---
title: "Running an Apache Iceberg Lakehouse With No Internet Connection"
date: "2026-07-28"
description: "A practical guide to deploying an Iceberg lakehouse in air-gapped environments: component choices, artifact pipelines, identity without a cloud, and the operational realities that surprise teams."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Air-Gapped
  - Data Engineering
  - On-Premises
canonical: "https://iceberglakehouse.com/posts/air-gapped-iceberg-lakehouse/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/air-gapped-iceberg-lakehouse/).

# Running an Apache Iceberg Lakehouse With No Internet Connection

An engineer runs `pip install pyiceberg` on a classified network and it fails. There is no PyPI. There is no Maven Central, no Docker Hub, no GitHub. The deployment guide they are following assumes all four, on the first page, without saying so.

That is the first hour of every air-gapped lakehouse project, and it sets the tone. Nothing about the architecture is exotic. Iceberg on object storage with a REST catalog and a query engine is the same design everywhere. What changes is that every assumption about reaching the outside gets tested, and most of them are load-bearing without anyone having noticed.

This matters more than it used to, because the open lakehouse stack is a good fit for exactly these environments. Government, defense, financial institutions with regulatory isolation requirements, healthcare systems with strict data boundaries, and industrial operators running plant-floor analytics all end up wanting analytical infrastructure without a cloud dependency. Open formats and self-hostable components make that possible in a way that a managed warehouse does not.

I work at Dremio, which sells a query engine deployable on-premises, so I have a commercial interest in this space. The components discussed below are open source and the reasoning applies regardless of what engine you run.

This piece covers what air-gapped actually means in practice, the component choices that hold up without internet, how to handle artifacts and dependencies, credential and identity design without a cloud provider, and the operational realities that surprise teams coming from managed services.

## What air-gapped means, precisely

The term covers a spectrum, and where you sit on it determines a lot of design.

**Fully air-gapped.** No network path to the outside at all. Software arrives on physical media, reviewed and transferred through a controlled process. Updates are events measured in weeks. This is the strictest case and the one worth designing for, since a design that works here works everywhere below it.

**One-way transfer.** A data diode or equivalent allows data out and nothing in, or the reverse. Software still arrives through a controlled process. Telemetry sometimes leaves.

**Controlled egress.** Outbound connections permitted to an explicit allowlist through a proxy, with inspection. Most "air-gapped" environments are actually this one. The distinction matters because an allowlisted internal mirror solves most of the dependency problem here and solves none of it in a true air gap.

**Isolated network, no air gap.** A private network with no route to the internet but with internal shared services, including a package mirror somebody else maintains. Comfortable by comparison.

Get your organization's actual answer before designing. Teams routinely assume the strictest case and discover a proxy exists, or assume a proxy exists and discover it does not. The design differs substantially.

A second question with the same weight: what is the approved software intake process, how long does it take, and who runs it. A component that needs frequent updates is a bad fit for an environment where each update is a six-week review. That constraint shapes component selection more than any technical criterion.

The isolation level determines what your dependency strategy has to be.

| | Fully air-gapped | One-way transfer | Controlled egress | Isolated network |
|---|---|---|---|---|
| Package mirror | Physical media, batched | Physical media, batched | Allowlisted proxy | Shared internal mirror |
| Update cadence | Weeks to months | Weeks to months | Days | Continuous |
| Telemetry out | None | Possible | Possible | Yes |
| Vendor support loop | Manual, offline | Manual, offline | Partial | Normal |
| Design implication | Everything bundled | Everything bundled | Mirror solves most of it | Nearly normal |

The first two columns are the same engineering problem. The third looks similar in a policy document and is a completely different project in practice.

## The component stack

An air-gapped Iceberg lakehouse needs four things: object storage, a catalog, a catalog persistence backend, and one or more query engines. Each has viable self-hosted options.

**Object storage.** Iceberg requires an object store with specific properties: in-place write, meaning files are not moved or altered after writing, seekable reads, and deletes. That is a modest requirement set and several self-hosted systems meet it.

MinIO is the common choice, presenting an S3-compatible API so every client library works unchanged. Ceph offers object storage through its own gateway and suits organizations already running Ceph for block and file. Apache Ozone is another option with Hadoop-ecosystem heritage. The Polaris project documents storage guides for Ozone, Ceph, MinIO, and RustFS, which is a reasonable indication of what people actually run.

The selection criterion that matters most is not throughput, it is whether your team can operate it. Object storage is a stateful distributed system, and the failure modes are yours now.

**Catalog.** Apache Polaris implements the Iceberg REST Catalog specification and is self-hostable. That is the property that matters: engines configure against the REST protocol, so a self-hosted catalog is a drop-in for engines that already speak it. Polaris graduated to an Apache Top-Level Project in February 2026, which matters in this context because governance stability is part of what a long-horizon isolated deployment is buying.

**Catalog persistence.** Polaris runs on a JDBC backend, with Postgres and CockroachDB both documented. In an air-gapped environment this database is a critical dependency, since catalog availability determines whether any query can plan. Treat it with the operational seriousness of a production transactional store.

**Query engines.** Spark, Flink, Trino, Dremio, and others all read Iceberg and configure against a REST catalog. The engine choice is more about your workload and your operational capacity than about air-gap suitability, since none of them require internet at runtime.

The thing worth appreciating: this stack has no component whose function depends on reaching the internet. Every piece runs disconnected by design rather than by workaround. That is a property of the open lakehouse specifically, and it is the actual reason these environments gravitate toward it.

## Artifacts and dependencies

This is where the projects fail, and it is not a technology problem.

**Build a complete internal mirror before anything else.** Maven artifacts, Python packages, container images, operating system packages, Helm charts. All of them, with transitive dependencies resolved. Nexus and Artifactory both do this and both run disconnected once populated.

The word that causes trouble is complete. A build works on a connected machine, gets moved inside, and fails on a transitive dependency nobody enumerated. The reliable method is to resolve dependencies on a connected machine with an empty local cache, capture everything that gets fetched, and transfer that set.

```bash
# Maven: resolve everything into a clean local repository, then transfer it
mvn -Dmaven.repo.local=./offline-repo \
    dependency:go-offline \
    de.qaware.maven:go-offline-maven-plugin:resolve-dependencies

# Python: download wheels for the exact platform, not the build machine's
pip download -r requirements.txt \
    -d ./offline-wheels \
    --platform manylinux2014_x86_64 \
    --python-version 3.11 \
    --only-binary=:all:

# Container images: save with all layers
docker save \
    apache/polaris:1.5.0 \
    minio/minio:latest \
    postgres:16 \
    -o lakehouse-images.tar
```

Two details in there that people get wrong.

The `--platform` and `--python-version` flags on `pip download` matter because pip defaults to the machine you are running on. A wheel downloaded on a developer laptop is frequently the wrong architecture or ABI for the target, and the failure appears after transfer when fixing it is expensive.

Container images need every layer, and `docker save` on an image built from a base you have not also saved leaves you with a reference to something that does not exist inside.

**Verify checksums on both sides.** Transfer media corrupts, and a corrupted jar produces a failure that looks like a code bug. Record hashes before transfer and verify after, as an automated step rather than a habit.

**Plan the intake cadence deliberately.** If updates take six weeks to clear review, batch them. A quarterly cadence with a well-tested bundle beats continuous small transfers that each consume the review process.

**Include the things nobody thinks of.** Documentation, because you cannot search the web from inside. Source for anything you expect to debug. Test fixtures. The specific Iceberg release notes for the versions you run. Engineers inside an air gap lose access to the entire body of internet knowledge, and that is a productivity cost you mitigate by bringing the documentation with you.

## Identity and credentials without a cloud

Outside, storage credentials come from a cloud provider's identity system and short-lived tokens come from its token service. Neither exists here, and the replacement design is worth getting right.

The mechanism that carries the weight is credential vending. A client asks the catalog to load a table, the catalog evaluates the principal's grants, and if allowed, returns table metadata plus temporary credentials scoped to that table's location. Engines never hold long-lived storage keys.

That design works on self-hosted storage, because S3-compatible systems implement the security token service interface. MinIO does. The vending flow is the same as on a cloud, with your storage system issuing the temporary credential instead of a provider.

Getting this right matters more in an isolated environment, not less, and the reason is worth stating. Isolation is often treated as the security control, so internal controls get relaxed. That reasoning fails on the insider case, which is the threat model these environments are frequently most concerned with. An air gap stops external attackers and does nothing about a cleared user reading data they are not authorized for.

For identity, Polaris documents Keycloak for authentication, which runs self-hosted and speaks the standard protocols. It bridges to whatever directory the organization already runs, which in these environments is usually Active Directory or LDAP with an established account lifecycle process.

Polaris uses a two-tier model: principal roles attach to identities and represent who someone is, while catalog roles attach to catalogs and carry the actual privileges. That indirection is worth using deliberately here, because these environments tend to have well-defined clearance-based access tiers that map naturally onto principal roles.

For organizations with an existing policy system, Polaris 1.5.0 added a pluggable authorizer interface that separates the authorization decision from Polaris's internal principal resolution, with Apache Ranger in beta joining Open Policy Agent. That is useful in exactly this setting, since regulated organizations usually have access policy expressed somewhere already, and maintaining a second copy in a catalog's native model creates drift between two things auditors will compare.

## Moving data across the boundary

Isolated environments rarely mean data never moves. Reference data comes in, results go out, and both happen through a controlled process. Designing for that from the start beats improvising it later.

**Bringing a dataset in.** An Iceberg table is a directory of data files plus a metadata tree plus a catalog entry. Transferring it means moving the files and registering the table.

The complication is that Iceberg has historically stored absolute paths. Every manifest and metadata file embeds full URIs down to the bucket. A table copied from a bucket named one thing into a bucket named another has metadata pointing at locations that do not exist, and fixing that means rewriting the metadata tree.

Two workable approaches today.

Match the location naming across environments so the paths remain valid. Contrived, and it works, and it turns a metadata rewrite into a file copy plus a catalog registration.

Or rewrite the metadata on import. Tooling exists for this, including catalog migration utilities in the Polaris tools repository, and it is a real operation with real runtime on a large table rather than an instant one.

This is why the relative-path direction in the Iceberg V4 discussion matters disproportionately in these environments. Storing paths relative to a table root, with the catalog supplying the root, turns a cross-environment transfer into a directory move and a catalog update. For teams doing this routinely, that is a substantial difference.

**Getting results out.** Usually the requirement is aggregate results rather than raw data, and it usually goes through a review step, which is a feature of the environment rather than an obstacle.

The pattern that works: write the exportable result to a dedicated table in a dedicated location, so the export boundary is explicit in the storage layout rather than implicit in a process. Whatever review the organization requires operates on that table. Nothing is exported from anywhere else.

```sql
-- Export staging: everything leaving the environment lands here first
CREATE TABLE export.staging.weekly_metrics (
    period_start   date,
    metric_name    string,
    metric_value   double,
    row_count      bigint,
    generated_at   timestamp,
    generated_by   string,
    review_status  string
)
USING iceberg
PARTITIONED BY (period_start)
LOCATION 's3://export-review/weekly_metrics';
```

The `review_status` column and the dedicated location are the design. Anything in that location is a candidate for export and nothing else is, which makes the control auditable by looking at one place.

**Aggregation before export as a control.** Where policy allows aggregate release and forbids row-level release, computing the aggregate inside and exporting only the result is both the compliant path and the cheaper one. Record the query that produced each exported number alongside it, because the first question on any exported figure is how it was computed.

**Version the reference data you import.** External reference datasets arrive periodically and analyses depend on which version they used. Keep the import version in the table, and keep old versions until analyses depending on them are retired. Reproducing a six-month-old result requires the reference data as it was, and in an isolated environment you cannot re-fetch it.

## Snapshot immutability and the audit trail

Iceberg's design gives you several properties these environments need without extra work, and it is worth being precise about which ones are free and which are not.

**Every change produces a snapshot.** Snapshots record what changed, when, and under which operation. The history is queryable through metadata tables, which means the audit trail is SQL rather than a log file.

```sql
SELECT
    committed_at,
    snapshot_id,
    parent_id,
    operation,
    summary['added-records']   AS added,
    summary['deleted-records'] AS deleted
FROM catalog.secure.observations.snapshots
ORDER BY committed_at DESC;
```

**Data files are immutable.** Iceberg requires in-place write, so files are never modified after creation. A change produces new files and a new snapshot. That property means the historical state genuinely exists rather than being reconstructed from a log.

**Time travel gives you point-in-time reconstruction.** Reading the table as of a past snapshot is a normal query. For an investigation asking what a system knew at a specific moment, that is the answer directly.

What is not free: tamper evidence. Snapshot history is immutable in the sense that Iceberg does not modify files, and it is not cryptographically protected against someone with write access to the storage and the catalog. Anyone claiming Iceberg alone gives you tamper-proof records is overselling it.

Where evidentiary weight is required, the pattern is to hash metadata and anchor those hashes somewhere with independent control: a separate storage account, a separate retention policy, or a write-once medium. In an air-gapped environment that anchor is likely a physically separate system with different administrators, which is a stronger separation than most connected environments manage.

The practical middle ground for most deployments: restrict write access on sensitive tables to a small set of principals, keep catalog administration separate from storage administration, and log changes to those grants. Separation of duties between whoever can change data and whoever can change permissions is the control that does the real work.

## What surprises teams coming from managed services

Seven things, roughly in the order they arrive.

**You own the upgrade path, and it is slow.** Cloud services upgrade themselves. Here every component upgrade is an intake, a test, a rollout, and a rollback plan. Version skew across components becomes a standing concern, and a security patch that ships upstream on Tuesday reaches you when the process allows.

**Capacity is fixed.** No elastic scaling. Compute is what you provisioned, and adding more is a procurement cycle measured in months. This changes query engine sizing from an optimization into a hard constraint, and it makes workload management, meaning queues and priorities and admission control, far more important than it is when you can add nodes.

**Object storage performance differs from cloud object storage.** Self-hosted systems on your hardware have different throughput, latency, and concurrency characteristics from a hyperscaler's. Iceberg tuning guidance written for cloud storage, particularly around file sizes and request patterns, needs revalidation on your storage. Measure rather than assume.

**Debugging is harder.** No searching an error message. No vendor support portal from inside. No pasting a stack trace anywhere. This is a real productivity difference and the mitigation is bringing documentation and source inside, plus an established process for taking a question outside when needed.

**Monitoring you build yourself.** Polaris exposes telemetry through Prometheus and Jaeger, which is what you want, and standing up and operating that stack is your work. Budget for it as infrastructure rather than assuming it comes along.

**Backup and recovery are entirely yours.** The catalog database, object storage, and configuration all need backup, and the restore has to be tested. There is no managed point-in-time recovery. An untested backup in an isolated environment is a serious exposure, because there is no vendor to escalate to when the restore fails.

**Certificates expire.** Internal TLS certificates need rotation, and an expired certificate on the catalog stops every query. This is mundane and it is one of the most common causes of self-inflicted outages in isolated environments, because the automated renewal that works outside frequently depends on something unreachable.

## Designing for capacity you cannot add

Fixed capacity is the constraint that most changes how you build, and it is the one cloud-native habits handle worst.

Outside, a slow query is a cost problem. Inside, a slow query consumes a resource nobody can add, so it is a contention problem affecting everyone else. That difference propagates into several design decisions.

**Admission control comes first, not last.** A system with fixed capacity needs to refuse work rather than accept everything and degrade. Queue depth limits, per-user concurrency caps, and query timeouts stop a single heavy query from taking the cluster down. Configure these before the first user arrives, because retrofitting them after an incident is politically harder than establishing them as normal.

**Reserve headroom for maintenance.** Compaction, snapshot expiration, manifest rewriting, and orphan cleanup all consume compute, and they are not optional. On elastic infrastructure you run them on separate capacity. Here they compete with queries. Reserve a share, run maintenance in a defined window, and treat that window as protected rather than as the first thing sacrificed when users complain.

**Model growth against a hard ceiling.** Storage capacity is procured and finite. Take your ingest rate, add your snapshot and metadata overhead, and project forward to when you hit the ceiling. That date is a planning input, and procurement lead times in these environments run to months, so the alert has to fire long before the wall.

**Retention becomes a capacity control, not just a policy.** Outside, keeping ten years of snapshots costs money. Inside, it consumes a fixed resource that eventually runs out. Snapshot expiration and orphan file cleanup shift from hygiene to necessity, and their schedules deserve the same scrutiny as backup schedules.

**Prefer predictability over peak throughput.** A query engine configuration that is fast on average and occasionally saturates the cluster is worse here than one that is consistently adequate. Users adapt to a system that is reliably a bit slow. They cannot adapt to one that is fast until it is unusable.

A useful exercise before go-live: run your expected peak concurrent workload against the provisioned capacity and see what happens. Not a synthetic benchmark, the actual mix of queries you expect at the busiest hour. Teams routinely discover their peak assumption was optimistic, and discovering it before users arrive is worth the day it takes.

## Multiple classification levels in one environment

Many of these deployments serve data at more than one sensitivity level, and the isolation boundary around the whole environment does not resolve the boundaries inside it.

Two structural approaches, and the choice is usually made by policy rather than by engineering.

**Separate deployments per level.** Physically or logically distinct environments, each with its own storage, catalog, and compute. Strong separation, and it multiplies operational surface by the number of levels, which in a fixed-capacity environment also multiplies the capacity you must provision for each.

**One deployment with enforced separation.** Shared infrastructure, with the catalog's access control carrying the boundary. Efficient, and correctness now depends on configuration rather than on physics, which is a harder argument to make to an accreditor.

Where the second is permitted, several design points matter.

Use realms if your catalog supports them for hard tenant separation. Polaris supports realms with per-realm credentials, and the behavior on incomplete configuration is the right one: when realm-specific credentials are provided but incomplete, the server does not fall back to global credentials for that realm. Failing closed on partial configuration is exactly what you want when the configuration expresses a classification boundary.

Structure principal roles around clearance tiers rather than around job functions. The two-tier model, with principal roles for identity and catalog roles for privilege, maps cleanly onto this: a principal role per clearance level, catalog roles per catalog expressing what that level can do there.

Keep storage locations separated by level, not just tables. Credential vending scopes credentials to a table's location, so a location shared across levels weakens the scoping. Separate prefixes at minimum, separate buckets where policy calls for it.

Watch aggregation carefully. A view joining data from two levels produces a result whose classification is at least the higher of the two, and the catalog will happily let you define it if the grants permit. Where this matters, the control is on view creation rather than on query, and it needs a human in the approval path.

Audit the grant model on a schedule and treat drift as a finding. In an environment where access control carries a classification boundary, a grant that drifted open is a security incident rather than a configuration issue. Version-controlled grants applied by a pipeline are what make drift detectable, which is the practical argument for that practice here.

## The build-and-test loop, offline

Software development inside an isolated environment is slower than outside, and most of the slowdown is avoidable with deliberate setup.

**Run CI inside.** A build pipeline that reaches out for dependencies works outside and fails inside, so the pipeline that matters is the one running against the internal mirror. Establish it early, because a team that develops outside and only integrates inside discovers every dependency problem at the worst moment.

**Build in a network-denied container.** Not a container that happens to lack a route, one where egress is explicitly refused. The difference shows up when a dependency resolves through a proxy nobody documented, which produces a build that works on the build host and fails on the target.

```bash
# Verify the offline build genuinely has no external dependencies
docker run --rm --network none     -v "$PWD":/work -v "$PWD/offline-repo":/root/.m2/repository     -w /work maven:3.9-eclipse-temurin-17     mvn -o clean verify
```

The `--network none` and the `-o` offline flag together are the test. A build that passes this passes inside.

**Keep a representative test dataset inside.** Real production data is frequently not usable for development, and synthetic data that does not resemble it produces tests that pass on shapes you do not have. Generating a good synthetic dataset that matches the real distributions is worth a week of someone's time, and it pays back on every subsequent piece of work.

**Mirror the internal environment outside where policy allows.** A staging environment on the connected side, running the same component versions with synthetic data, lets engineers reproduce problems where they have documentation and search. This is the single largest productivity intervention available in these environments and it is frequently not permitted, so ask rather than assume.

**Batch questions that need outside answers.** When something requires vendor support or a question the internal documentation does not answer, the round trip is long. Accumulate questions, send them in batches, and keep working on other things meanwhile. Teams that block on each question individually lose enormous time to the latency.

**Record the answers internally.** Every question answered from outside becomes internal documentation, because the next person cannot search for it either. An internal knowledge base is not optional here, it is the replacement for the internet.

## Failure modes

**Incomplete artifact mirror discovered mid-deployment.** A transitive dependency was missed, and getting it takes a full intake cycle. Warning sign: the mirror was populated by hand rather than by resolving from an empty cache. Fix: automate the resolution and verify by building in a network-isolated container before transfer.

**Silent reliance on an external endpoint.** A component checks for updates, fetches a schema, or reports telemetry on startup, and blocks or degrades when it cannot. Warning sign: unexplained startup delays that resolve after a timeout. Fix: run everything in a network-isolated environment during testing, with egress denied rather than merely absent, so the dependency fails loudly.

**Catalog database as an untested single point of failure.** Everything plans through the catalog, the catalog is a database, and nobody has restored from backup. Warning sign: a backup with no restore test. Fix: restore into a scratch environment and point a client at it, on a schedule.

**Storage credentials distributed statically because vending seemed complicated.** Long-lived keys on every engine host, in configuration files, rotated never. Warning sign: storage keys appearing in any configuration file. Fix: enable vending, and verify the client actually uses it rather than falling back.

**Cloud-tuned Iceberg configuration carried over.** Target file sizes, request concurrency, and retry settings tuned for a hyperscaler applied to on-premises storage. Warning sign: throughput far below what the storage benchmarks at. Fix: tune against your storage, starting from measurement.

**Compaction never scheduled because nobody owned it.** Small files accumulate, planning slows, and the fixed capacity makes it worse than it is elsewhere because you cannot add compute to compensate. Warning sign: file count growing steadily. Fix: schedule maintenance from day one, with an owner.

**Certificate expiry taking down the catalog.** Covered above and worth listing because it recurs. Warning sign: no calendar entry for certificate renewal. Fix: monitor expiry dates as a metric with alerting weeks ahead.

**Documentation gap discovered during an incident.** An engineer needs a detail that lives on a website they cannot reach, at 2am. Warning sign: nobody has checked whether the documentation mirror is current. Fix: bring documentation in with every artifact bundle, and treat it as part of the release.

## Operational guidance

**Establish the intake process before the architecture.** How software gets in, how long it takes, who approves. Every other decision depends on it, and a component chosen without knowing the cadence is a component you cannot maintain.

**Test in a network-isolated environment, not a network-absent one.** Run with egress explicitly denied so failed external calls produce errors rather than working by accident through a route you did not know about. This is the single most effective way to find hidden dependencies.

**Version-control the entire configuration.** Catalog configuration, principal roles, catalog roles, grants, storage settings. In an environment where rebuilding from scratch is a realistic recovery scenario, reproducible configuration is the difference between a day and a month.

**Size for the peak you cannot exceed.** With fixed capacity, the question is not average utilization, it is what happens at peak. Add workload management, admission control, and query queuing, because the alternative to queuing is failure.

**Bring documentation in with every bundle.** Component docs, release notes, and the Iceberg spec for the versions you run. Make it part of the release artifact rather than something someone remembers.

**Set retention and maintenance policies explicitly.** Snapshot expiration, orphan file cleanup, compaction, manifest rewriting. On fixed storage, unbounded growth has a hard ceiling and hitting it is an outage rather than a bill.

**Keep an offline runbook.** Printed or on an internal wiki that does not depend on any component being up. The runbook you need during a catalog outage cannot live behind the catalog.

**Record every version in one manifest.** Every component, every version, every configuration hash, in one document updated on each release. Reconstructing what was running six months ago is a routine question in these environments and impossible without this.

**Practice the full restore annually.** Catalog database, object storage, configuration, all of it, into a scratch environment, with a client pointed at the result. A day a year, and it converts a documented plan into a verified one.

**Keep a connected mirror of your own environment if you can.** A staging environment outside with the same versions lets you reproduce issues where you have internet access and documentation. Not always permitted, and enormously valuable where it is.

## Agents and analytics assistants in an isolated environment

Organizations running isolated infrastructure are asking the same questions about AI-assisted analytics as everyone else, and the constraints change the answer in ways worth stating.

**A hosted model is not available.** Whatever runs has to run inside, which means self-hosted open-weight models on your own hardware. That is feasible and it is a substantial capacity commitment on infrastructure that is already fixed. Inference competes with query execution for the same finite compute unless you provision separately for it.

**Model updates go through intake.** A model is a large artifact arriving through the same controlled process as everything else, on the same cadence. Plan for the version you can maintain rather than the version that is current outside.

**The governance picture is more favorable than outside.** Everything the assistant touches is already inside a boundary, the catalog already carries access control, and the audit requirements are already established practice. The hard parts of governing an analytics agent, meaning access scoping, credential handling, and audit trail, are problems these environments have already solved for human users. Extending the same model to a machine principal is a smaller step than it is in an organization improvising governance for the first time.

**Accuracy work matters more, because verification is harder.** An analyst who cannot search the web to sanity-check an unfamiliar number relies more heavily on the system being right. The semantic layer work that makes agents accurate, meaning well-shaped datasets with business rules applied and definitions attached, has a higher return here.

**Capacity constraints argue for narrow scope.** An agent exploring broadly consumes query capacity you cannot add. Narrow tools over well-defined datasets produce targeted queries instead of exploratory scans, which matters more when the scan competes with a person's report.

The practical recommendation for teams in this position: build the semantic layer first regardless of whether an assistant ever ships. Well-defined datasets with business rules applied and clear documentation improve human analysis immediately, they are the prerequisite for machine consumption later, and they are useful work whether or not the model procurement ever completes. That sequencing is right everywhere and it is especially right where the model side has a long lead time.

## A phased build

For a team starting from nothing, the order that avoids the most rework.

**Phase zero: answer the two constraint questions.** Where on the isolation spectrum, and how long the intake process takes. Write both down with a name attached. Everything after depends on these and neither is an engineering decision.

**Phase one: prove the artifact pipeline.** Before any lakehouse component, establish the mirror and prove a build works network-denied. This is the capability everything else depends on, and proving it with a trivial application is far cheaper than discovering its gaps while deploying a stack.

**Phase two: storage and catalog, minimal.** Object storage, catalog, catalog database. One table, one principal, one grant. Prove that a client authenticates, loads the table, receives vended credentials, and reads data. This is the smallest configuration that exercises every layer, and it surfaces most integration problems.

**Phase three: one engine, one real workload.** Add a query engine and move one genuine pipeline onto it. Real data, real users, real queries. Resist adding a second engine until the first is operating cleanly, because two engines with unresolved storage tuning produce ambiguous problems.

**Phase four: maintenance and monitoring.** Compaction, snapshot expiration, orphan cleanup, telemetry, alerting, backup with a tested restore. This phase is unglamorous and skipping it is how a working deployment becomes an unworking one over six months.

**Phase five: broaden.** More engines, more workloads, more users, with admission control in place before the user population grows.

Two ordering points that people get wrong.

Backup and restore belongs in phase four, not phase six. The restore test is the thing most likely to reveal a design problem, and finding it while the deployment is small is much cheaper.

Monitoring belongs before broad adoption, not after. A system whose behavior nobody has baselined is a system where you cannot tell whether today is normal, and the first performance complaint arrives without any history to compare against.

The whole sequence for a small team runs a quarter or two, and most of the elapsed time is intake cycles rather than engineering. That ratio is the defining characteristic of working in these environments, and planning around it is more useful than fighting it.

## Where this is heading

Three developments relevant to isolated deployments.

Self-hosted storage options for the lakehouse keep broadening. Polaris documents storage guides for Ozone, Ceph, MinIO, and RustFS, which reflects a real ecosystem rather than one blessed option. Choice matters in these environments, since procurement, existing operational skills, and hardware constraints frequently determine what is viable.

The authorizer work is directly useful here. Separating the authorization decision from the catalog's internal model, with Ranger and OPA as external options, lets a regulated organization keep its access policy in the system it already validated rather than maintaining a second expression of it. In an environment where policy changes go through review, one source of truth is worth a lot.

The relative-path work in the Iceberg V4 discussion is worth watching for a reason specific to these environments. Iceberg has always stored absolute paths, embedding full URIs in every manifest and metadata file, which means moving a table between environments requires rewriting the metadata tree. The V4 direction stores paths relative to a table root, with the catalog supplying the root. For an isolated environment, where moving a dataset across a boundary through a controlled transfer is a routine operation, that changes a metadata rewrite project into a directory move plus a catalog update.

## Conclusion

An air-gapped Iceberg lakehouse is not architecturally unusual. Object storage, a REST catalog, a persistence backend, and query engines, all of which run disconnected because none of them needs the internet to function. That is the actual argument for open formats in these environments, and it holds up.

The difficulty is operational rather than architectural. Every dependency has to arrive through a controlled process, which means a complete internal mirror resolved from an empty cache rather than assembled by hand. Capacity is fixed, so workload management replaces elastic scaling. Upgrades are slow, so component choice has to account for the intake cadence. Debugging loses the internet, so documentation comes in with the artifacts.

Do not relax the internal security model because the network is isolated. Credential vending works on self-hosted storage, the insider threat is the one these environments usually care most about, and an air gap does nothing about it.

Start with two answers written down: exactly where on the isolation spectrum you sit, and how long the software intake process takes. Those two facts constrain more of the design than any technical decision you will make afterward.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and catalogs. *Architecting an Apache Iceberg Lakehouse* from Manning covers deployment topology, storage selection, and maintenance planning as platform decisions, including on-premises considerations. *Apache Polaris: The Definitive Guide*, which I co-authored for O'Reilly, covers self-hosting the catalog, its RBAC model, and credential vending in detail. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
