---
title: "Running Apache Polaris in Production"
date: "2026-09-10"
description: "Apache Polaris past the quickstart: persistence backends, realm bootstrap, replica token signing, upgrades, backups, and which failures take the lakehouse offline."
author: "Alex Merced"
category: "Apache Polaris"
tags:
  - Apache Polaris
  - Apache Iceberg
  - catalogs
  - Iceberg REST catalog
  - platform operations
canonical: https://iceberglakehouse.com/posts/apache-polaris-in-production/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/apache-polaris-in-production/).

The Polaris quickstart takes about four minutes. Pull a container, hit the OAuth endpoint, create a catalog, point Spark at it, write a table. It works, and it teaches you the object model, and then it quietly leaves you with a service that stores everything in memory, signs tokens with keys it generated at startup, and has never been asked what happens when the pod restarts.

The distance between that container and a catalog your data platform depends on is not conceptual. Nobody gets confused about what a catalog does. The distance is operational: which persistence backend, how realms get bootstrapped and what the root credential means afterward, how multiple replicas agree on token signing, what an upgrade does to the database schema, what a backup of a catalog even contains, and which failures take the whole lakehouse offline versus which degrade quietly.

This is that layer. Apache Polaris graduated to a Top-Level Project at the Apache Software Foundation on February 18, 2026, and it was co-created with Snowflake before being donated to the ASF. I work at Dremio, which ships a managed catalog built on Polaris, so treat my enthusiasm for the project accordingly. What follows is about the open-source service and applies wherever you run it.

## What the service is, and what it holds

Polaris is a catalog server. It implements the Iceberg REST catalog API for table operations, plus its own management API for the things the Iceberg specification does not cover: catalogs, principals, roles, grants, and storage configuration.

Its job in one sentence: for a given table, hold the pointer to the current metadata file, and swap that pointer atomically when a writer commits.

Everything else follows from that sentence. Because the pointer swap is the atomicity mechanism for the whole lakehouse, the store holding those pointers is the correctness boundary. Because engines get their storage access through the catalog, the service is also an authorization boundary. And because every query from every engine starts with a catalog call, it is on the critical path for all read traffic.

Three consequences shape every decision below:

**The database matters more than the server.** Polaris server pods are stateless. Losing one costs you in-flight requests. Losing the database costs you the mapping between table names and metadata files, which is not reconstructable from object storage without a painful scan and a lot of guessing.

**Availability is table-stakes, not a nice-to-have.** A catalog outage is not a degraded experience. Queries fail, writes fail, and scheduled jobs fail together. Single-replica deployments are a development pattern.

**Security posture is centralized here.** The credentials engines use to touch object storage come from this service. That concentration is the feature, and it means the blast radius of a misconfiguration is every table in the catalog.

## Persistence: pick the backend before anything else

Polaris supports several persistence types, and the choice is close to irreversible in practice.

**In-memory** is the default in the Helm chart and the container quickstart. Everything lives in the process. A restart loses the entire catalog. It exists for demos and tests, and the project documents plainly that it is unsuitable for production. The most common Polaris incident I have seen reported comes from someone running the default chart values and discovering this property empirically.

**Relational JDBC** is the production path for most deployments. It is a Quarkus-managed datasource, and it supports PostgreSQL for real use with H2 available for local work. This is where the majority of deployments should land.

**NoSQL with MongoDB** exists and is documented as beta. Choose it when you have strong operational reasons and a team that runs MongoDB well.

**EclipseLink** was the earlier generic option and is deprecated. New deployments should not start there.

The JDBC configuration surface is small, which is a good sign:

```properties
polaris.persistence.type=relational-jdbc
quarkus.datasource.db-kind=postgresql
quarkus.datasource.jdbc.url=jdbc:postgresql://polaris-db.internal:5432/polaris
quarkus.datasource.username=polaris_app
quarkus.datasource.password=${POLARIS_DB_PASSWORD}
```

Every one of those is settable through environment variables using the Quarkus convention, which is what the Helm chart and the admin tool both rely on:

```bash
POLARIS_PERSISTENCE_TYPE=relational-jdbc
QUARKUS_DATASOURCE_DB_KIND=postgresql
QUARKUS_DATASOURCE_JDBC_URL=jdbc:postgresql://polaris-db.internal:5432/polaris
QUARKUS_DATASOURCE_USERNAME=polaris_app
QUARKUS_DATASOURCE_PASSWORD=...
```

Managed Postgres works well and is the sane default. On AWS, the JDBC layer supports the Amazon RDS wrapper plugin, which lets Polaris authenticate to Aurora PostgreSQL with IAM instead of a static password:

```properties
quarkus.datasource.jdbc.url=jdbc:postgresql://polaris-cluster.cluster-xyz.us-east-1.rds.amazonaws.com:5432/polaris
quarkus.datasource.jdbc.additional-jdbc-properties.wrapperPlugins=iam
quarkus.datasource.jdbc.additional-jdbc-properties.ssl=true
quarkus.datasource.username=polaris_app
quarkus.datasource.db-kind=postgresql
```

Four database decisions to make deliberately rather than by default.

**Sizing.** Catalog metadata is small in bytes and hot in access pattern. Rows are counted in thousands to low millions for most deployments, and the working set fits in memory on a modest instance. Size for connection count and IOPS rather than storage. Every table load from every engine is a query here.

**Connection pooling.** Each Polaris replica holds a pool. Three replicas at a default pool size against a small Postgres instance exhausts `max_connections` faster than people expect. Set the pool explicitly and do the arithmetic: replicas times pool size stays under the database limit with headroom for admin sessions.

**Isolation.** Give Polaris its own database instance, or at minimum its own cluster with its own resource limits. Sharing a Postgres with an application that runs occasional heavy analytics puts your entire lakehouse behind someone else's table scan.

**Retries.** The JDBC layer exposes retry configuration under `polaris.persistence.relational.jdbc.*`. Tune it when your database is a managed service that does failovers, because a thirty-second failover with no retry surfaces as catalog-wide errors, and the same failover with sane retry settings surfaces as a brief latency spike.

Note one detail that surprises people: Polaris creates a schema named `polaris_schema` in the configured database during bootstrap. Grant accordingly, and do not put anything else in it.

## Bootstrap, and what the root credential actually is

Polaris will not serve traffic against a fresh database until you bootstrap it. This is a deliberate, manual, once-per-realm operation that creates the schema and the root principal.

The admin tool is a separate artifact from the server and runs with the same configuration:

```bash
docker run --rm -it \
  --env="polaris.persistence.type=relational-jdbc" \
  --env="quarkus.datasource.username=polaris_app" \
  --env="quarkus.datasource.password=$POLARIS_DB_PASSWORD" \
  --env="quarkus.datasource.jdbc.url=jdbc:postgresql://polaris-db.internal:5432/polaris" \
  apache/polaris-admin-tool:latest \
  bootstrap -r prod-realm -c prod-realm,root,$ROOT_SECRET
```

On Kubernetes the same command runs as a one-shot pod that reads the datasource values out of the secret the chart created:

```bash
kubectl run polaris-bootstrap -n polaris \
  --image=apache/polaris-admin-tool:latest \
  --restart=Never --rm -it \
  --env="polaris.persistence.type=relational-jdbc" \
  --env="quarkus.datasource.username=$(kubectl get secret polaris-persistence -n polaris \
      -o jsonpath='{.data.username}' | base64 --decode)" \
  --env="quarkus.datasource.password=$(kubectl get secret polaris-persistence -n polaris \
      -o jsonpath='{.data.password}' | base64 --decode)" \
  --env="quarkus.datasource.jdbc.url=$(kubectl get secret polaris-persistence -n polaris \
      -o jsonpath='{.data.jdbcUrl}' | base64 --decode)" \
  -- bootstrap -r prod-realm -c prod-realm,root,$ROOT_SECRET
```

Three things about that command deserve more attention than they usually get.

**The admin tool needs the same database configuration as the server.** It is not talking to the Polaris API. It connects directly to the metastore. A bootstrap that succeeds against the wrong database produces a server that starts and serves an empty catalog, which is a confusing failure to debug at 2am.

**The credential you pass is a bootstrap credential, not a permanent identity.** The `-c realm,client-id,client-secret` argument sets the root principal's initial credentials. If you omit it, Polaris generates a random client ID and secret and stores their hashes. Either way, that principal is the most privileged identity in the realm. Treat the secret as a break-glass credential: store it in a secrets manager, use it once to create the roles and service principals your platform actually uses, and never wire it into a pipeline.

**Bootstrap is per-realm and runs once.** Re-running it against an initialized realm is not how you recover from a mistake. The admin tool has a `purge` command for destroying a realm and everything in it, and that command is exactly as dangerous as it sounds.

After bootstrap, the sequence that gets you to a usable platform runs through the management API: create a catalog with its storage configuration, create catalog roles with the grants your workloads need, create principals for each engine or team, create principal roles, and bind them. Do that with a script committed to version control rather than by hand. The object model is small enough that the whole thing fits in one Terraform module or one idempotent Python script, and having it reproducible is what makes a disaster-recovery drill possible later.

## Realms are the tenancy boundary

A realm is a fully isolated Polaris instance sharing the same server process and the same database. Separate catalogs, separate principals, separate grants, separate root credential. Requests carry the realm identifier, and nothing crosses between realms.

Realms answer a question people usually try to answer with separate deployments: how do I keep production and staging apart without running two clusters? One Polaris deployment with `prod` and `staging` realms costs a fraction of two deployments and gives real isolation of the object model.

The limits are worth stating plainly. Realms share the database, so they share its availability and its performance. They share the server pods, so they share memory pressure and connection pool. And they share the deployment lifecycle, so an upgrade moves all of them at once. Realm isolation is an object-model boundary, not a blast-radius boundary.

Use realms for environments and business units inside one operational domain. Use separate deployments when the requirement is regulatory isolation, independent upgrade cadence, or separate availability targets.

One operational note: bootstrap each realm separately, and script it. A new realm that nobody bootstrapped presents as authentication failures rather than as a missing-realm error, and that costs an hour the first time.

## Deployment shape

The Helm chart is the shortest supported path onto Kubernetes:

```bash
helm repo add polaris https://downloads.apache.org/polaris/helm-chart
helm repo update
kubectl create namespace polaris
helm install polaris polaris/polaris --namespace polaris --values production-values.yaml
```

The chart defaults target development. Four areas need explicit values before this is production.

**Replicas.** Run at least three, spread across failure domains. The chart supports both a static `replicaCount` and horizontal autoscaling:

```yaml
replicaCount: 3

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 8
  targetCPUUtilizationPercentage: 80

topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: "topology.kubernetes.io/zone"
    whenUnsatisfiable: "DoNotSchedule"
```

The spread constraint is the part people skip. Three replicas on three nodes in one availability zone protects against a node failure and not against a zone failure, and a catalog outage takes every engine with it.

**Resources.** Set requests and limits, and set them equal for a service on the critical path. The project's production guidance uses 8Gi of memory and 4 CPUs as a starting point per pod. Adjust from measurement rather than from taste, and remember the JVM heap sits inside that limit.

```yaml
resources:
  requests:
    memory: "8Gi"
    cpu: "4"
  limits:
    memory: "8Gi"
    cpu: "4"
```

**Priority.** Give the pods a `PriorityClass` above your batch workloads. A catalog evicted to make room for a Spark executor is a self-inflicted outage, and the scheduler has no way to know the difference without being told.

```yaml
priorityClassName: "polaris-high-priority"
```

**Token signing keys.** This is the one that produces the strangest bug in the whole deployment. By default the chart uses internal authentication with auto-generated signing keys. With multiple replicas and auto-generated keys, each pod generates its own, and a token minted by pod A fails validation on pod B. What you observe is intermittent 401s at roughly one-over-N of your request rate, which looks like a load balancer problem and is not.

All replicas must share the same signing key material. Provision it as a secret, reference it in values, and rotate it deliberately.

## Authentication and authorization

Polaris supports internal authentication, where it holds principals and issues tokens itself, and external authentication through OIDC with providers like Keycloak, Okta, and Entra ID.

Internal authentication is fine for machine principals: an ingestion service, a query engine, a maintenance job. Each gets a client ID and secret, and each shows up in audit output as itself.

External OIDC is the right answer for human access and for organizations that already run an identity provider. The identity lifecycle belongs to the IdP, group membership maps onto Polaris roles, and offboarding a person stops working in one place rather than several.

Most production deployments end up running both: OIDC for people, internal principals for services. That is a supported configuration and a sensible one.

The authorization model has four moving parts, and the mental model is simpler than the vocabulary suggests. A **principal** is an identity. A **principal role** groups identities. A **catalog role** holds grants on catalog objects. Binding a principal role to a catalog role gives those identities those grants. Grants themselves are privileges on catalogs, namespaces, and tables.

Two habits keep this manageable at scale.

**Grant at the namespace level, not the table level.** Table-level grants multiply with your table count and turn into an unmaintainable list within a year. Namespace grants scale with your organization instead, which is a much slower-growing number.

**One catalog role per workload shape, not per team.** A `readers` role, a `writers` role, and a `maintenance` role that holds the privileges compaction and expiry need. Teams map onto those through principal roles. Modeling roles after the org chart means re-modeling them after every reorg.

Polaris also supports delegating authorization decisions to an external policy decision point, with Open Policy Agent as the documented integration:

```yaml
polarisServerConfig:
  polaris:
    authorization:
      type: opa
      opa:
        base-uri: "http://opa.data-platform.svc:8181"
```

Reach for this when policy already lives in OPA and you need catalog decisions to follow the same rules as everything else. Skip it when the built-in RBAC covers your requirements, because it adds a network hop to the authorization path and a second system to keep available.

## Upgrades

Polaris publishes explicit expectations about what evolves and how, and reading that guidance before the first upgrade saves a bad afternoon.

On the API side, the management API is versioned, and changes within a version are intended to stay compatible with older clients. Endpoints and parameters get deprecated with a transition window before removal, and incompatible changes arrive as new URI paths rather than as silent behavior changes. On the Iceberg REST catalog side, the specification belongs to the Iceberg community, and a given Polaris release implements the parts it implements. Optional features are not guaranteed to land immediately, so a client depending on a newly specified endpoint needs to check the release rather than assume.

The database side is where the operational work sits. Each persistence type evolves on its own track, and each release supports a set of schema versions. The upgrade sequence that works:

1. **Read the release notes for every version you are skipping**, not just the target. Breaking changes and required SQL statements are documented per release, and skipping three versions means inheriting three sets of notes. Earlier releases in the 1.x line have shipped upgrade notes containing explicit SQL to run against `polaris_schema` before starting the new server, including creating a version table and adding columns.
2. **Snapshot the database.** Not a logical dump taken sometime last night. A snapshot taken immediately before the upgrade, verified restorable.
3. **Apply schema changes with the admin tool or the documented SQL**, from a single place, with the server not yet upgraded.
4. **Roll the server pods** one at a time, watching the readiness endpoint.
5. **Verify with a real workload**, not just a health check. Load a table, commit an update, list a namespace, and check that vended credentials still work end to end.

Two hazards specific to this project. Feature flags introduced alongside schema changes stay off until the corresponding data exists, and the release notes say which ones. Turning one on because it sounds like an optimization, before the column it depends on is populated, produces incorrect behavior rather than an error. And the admin tool version has to match the server version you are moving to, because it carries the schema knowledge.

Test the whole sequence against a copy of production data before touching production. The catalog database is small, which makes a realistic rehearsal cheap.

## Backups, and what a catalog backup contains

This is the part most teams get wrong, because a catalog backup protects against a failure mode people have not thought through.

Your Iceberg tables live in object storage. Data files, manifests, manifest lists, and metadata JSON files are all there, versioned, and durable. What object storage does not contain is the mapping from a table name to its current metadata file. That mapping lives in the Polaris database. Lose it and you have every byte of your data and no supported way to answer "which metadata file is table `sales.orders` on right now".

So the backup story has two halves that fail differently.

**The catalog database.** Back it up like the system of record it is. Automated snapshots with a retention window measured in weeks. Point-in-time recovery enabled, because the realistic disaster is a bad script that dropped a hundred tables at 14:32, and you want 14:31. Cross-region copies if your recovery plan spans regions. And restore drills on a schedule, because an untested backup is a hypothesis.

**The table metadata in object storage.** Versioning enabled on the bucket, and a lifecycle policy that does not delete non-current versions faster than your catalog retention window. Object-lock or equivalent on the metadata prefix for regulated data.

Then the part that requires actual thought: **these two halves have to be restored to consistent points**. Restore a catalog database from Tuesday against an object store where a maintenance job expired snapshots on Wednesday, and the catalog points at metadata files that no longer exist. Tables fail to load with missing-file errors that look like corruption.

Three practices keep that from happening.

**Pause maintenance during a restore.** Snapshot expiry and orphan-file cleanup are the operations that delete files a restored catalog expects. Stop them first, restore, then verify before restarting them.

**Set snapshot retention longer than your catalog recovery window.** If you keep seven days of point-in-time recovery on the database, keeping only three days of Iceberg snapshots guarantees an inconsistent restore. Retention on both sides is one decision, not two.

**Rehearse a realm-level restore end to end.** Restore the database to a scratch instance, point a scratch Polaris at it, and load a table through it. The drill takes an afternoon and it is the only way to find out that a grant, a storage configuration, or a signing key lives somewhere your backup does not cover.

One more scenario worth planning for, because it is more likely than total loss: a partial mistake. Someone drops a namespace, or a script deletes the wrong catalog. Point-in-time recovery of the whole database recovers that namespace and also rolls back every commit that happened elsewhere in the meantime. The practical answer is to restore to a scratch instance, extract what you need, and re-create it through the API against the live catalog. Plan for that, because a full rollback of a shared catalog is rarely acceptable.

## Storage configuration and credential vending

The catalog holds the storage configuration, which means it holds the trust relationship between your lakehouse and your object store. This is the security surface that matters most in the deployment and the one that produces the most confusing incidents.

Each catalog carries a storage configuration naming the storage type, the base location, and the role Polaris assumes to reach it. When an engine loads a table, Polaris returns a short-lived credential scoped to what that engine is allowed to touch. The engine reads and writes object storage directly with that credential, and the catalog never sits in the data path.

That design has three operational consequences.

**The Polaris service role is powerful.** It assumes a role with access to the storage locations of every catalog it serves. Scope that role to exact prefixes, not to a whole bucket, and use separate roles per catalog when the data has different sensitivity. A single over-broad role turns any catalog misconfiguration into cross-tenant exposure.

**Credential lifetime is a real tradeoff.** Short lifetimes limit the damage from a leaked token and increase catalog request volume, because engines refresh more often. Long-running Spark jobs that outlive a credential fail partway through unless the client refreshes correctly. Pick a lifetime, then test it against your longest-running job rather than your shortest.

**Vended credentials and storage policy have to agree.** A credential that Polaris issues correctly and the object store denies produces a table that creates fine and never accepts a write. Every probe against the catalog passes. The workload fails. Test the full path in monitoring: load a table, request credentials, write a small file, read it back.

For regulated data, look at remote signing where your catalog and engines support it. Instead of handing the engine a token scoped to a prefix for some minutes, the catalog signs each individual object request, scoped to one file and one operation. The engine never holds broad access at all. That costs a catalog round trip per file and buys a much tighter blast radius, and the implementations offering it are converging on shared configuration properties so engines configure it the same way everywhere.

## Federation: tables Polaris does not own

Polaris supports federation, where a catalog inside your Polaris deployment points at an external catalog rather than holding the tables itself. The documented federation targets include other Iceberg REST catalogs, Hive Metastore, and BigQuery Metastore.

The reason to care operationally is migration and consolidation. A platform team that wants one endpoint for every engine, while tables still live in a legacy Hive Metastore and a cloud catalog somebody else owns, gets that with federation instead of a migration project that has to finish before anything improves.

Three things to plan for.

**Availability composes badly.** A federated catalog is only as available as the system behind it. Your Polaris uptime target now depends on a Hive Metastore that a different team operates on a different schedule. Monitor the federated targets as dependencies, and set expectations accordingly.

**Latency composes too.** Every table load through a federated catalog is a call to the external system, plus your own. Cache behavior matters more here than in a native catalog, and a slow external metastore shows up as slow queries with no obvious cause in your own metrics.

**Authorization semantics differ.** Grants in Polaris apply to what Polaris controls. How far RBAC extends into a federated catalog depends on configuration, and recent releases have added finer-grained control over sub-catalog RBAC for federated catalogs. Read the current documentation for the release you run rather than assuming parity with native catalogs.

Federation is a bridge. It works well as a bridge and poorly as a permanent architecture, because it leaves you operating two catalogs while paying the availability cost of both.

## Capacity and latency

Catalog load looks nothing like data load, which is why sizing intuitions from other services mislead here.

The request mix is dominated by table loads. Every query from every engine starts with one. Commits are rarer by an order of magnitude or more in most workloads, and they are the expensive path because they involve a conditional update in the database. List operations are cheap individually and get expensive when a namespace holds thousands of tables and a client pages through all of it on every planning cycle.

Four things drive latency, in rough order of impact:

| Factor | Symptom when wrong | Where to look |
|---|---|---|
| Database round trip | p99 table load climbs while CPU stays flat | Connection pool saturation, slow query log |
| Connection pool sizing | Latency cliff after scale-up | replicas × pool size against `max_connections` |
| Commit contention | Retries and conflict errors on hot tables | Concurrent writers on one table, retry settings |
| Authorization path | Uniform latency increase across all operations | External policy decision point round trips |

Two capacity notes specific to this workload.

**Scale replicas for concurrency, not throughput.** The bottleneck is rarely CPU on the Polaris pods. It is database connections and commit contention. Adding replicas without raising the database's connection ceiling makes things worse rather than better.

**Watch commit conflicts as a workload signal.** Rising conflict rates on a table mean concurrent writers are colliding, and the fix lives in the pipeline design rather than in the catalog. The catalog is telling you something true about your ingestion pattern.

Benchmark before you commit to a shape. The project publishes a benchmark tool for exactly this, and a few hours with it against your own database instance produces sizing numbers grounded in your latency budget rather than in a blog post's defaults.

## Multi-region shape

Teams with a regional failover requirement ask whether to run Polaris in two regions. The honest answer is that the catalog is the easy part and the database is the whole question.

The server is stateless, so a second region running the same image against a reachable database is trivial. What is not trivial is what that database looks like across regions. Three shapes show up in practice.

**Active-passive with a read replica.** Primary database in one region, replica in another, Polaris deployed in both but only serving in the primary. Failover promotes the replica and shifts traffic. Recovery point equals replication lag, which is usually seconds. This is the shape most teams should pick, because it is understood, testable, and does not change commit semantics.

**Active-active with a distributed database.** Polaris serving in both regions against a database that handles multi-region writes. The JDBC layer works against distributed Postgres-compatible engines, and the project documents CockroachDB as a backend. Commit latency now includes a cross-region consensus round trip on every table update, which is a real cost on write-heavy workloads and invisible on read-heavy ones.

**Independent deployments per region.** Separate catalogs, separate databases, no shared state, with tables replicated at the storage layer if they need to exist in both places. This gives the cleanest failure isolation and the most work, because table identity is now managed in two places and staying consistent is your problem.

Whichever shape you pick, the object storage side has to match it. A catalog in region B pointing at metadata files whose absolute paths reference a bucket in region A is a catalog that survives the outage and cannot serve a single table. Cross-region table availability requires replicated storage and metadata whose locations resolve in both places, and that is a table-layer design question rather than a catalog setting.

Two failure-drill items specific to multi-region. Test that vended credentials work in the failover region, because the storage role trust relationship is region-aware and gets forgotten. And test that clients pick up the new endpoint, because DNS caching in long-running JVM engines has taken down more failovers than database promotion has.

## Observability

Three signal sources, each answering a different question.

**Health endpoints.** The management port exposes readiness and liveness checks. Wire readiness into the load balancer, and treat a pod that fails readiness on database connectivity as the leading indicator it is. A catalog whose database is unreachable fails every request downstream.

**Metrics.** Polaris exports Prometheus metrics, including HTTP latency. Configure histogram buckets rather than accepting averages, because catalog latency problems live in the tail and an average hides them completely:

```yaml
polarisServerConfig:
  polaris:
    metrics:
      http:
        histogram-buckets: "50ms,100ms,250ms,500ms,1s,2s,5s"
```

The four metrics to alert on: p99 latency on table load, error rate by status class, database connection pool saturation, and authentication failure rate. That last one catches the shared-signing-key problem described earlier, and it catches credential expiry before your pipelines do.

**Events.** Polaris supports pluggable event listeners, with multiple destinations running side by side, and recent releases added OpenTelemetry and Kafka destinations:

```yaml
polarisServerConfig:
  polaris:
    event-listener:
      types: "opentelemetry,kafka"
```

Catalog events are the audit trail for your lakehouse. Who created a table, who changed a grant, who dropped a namespace, and when. Route them somewhere durable and queryable from day one, because the day you need them is a day when reconstructing history from memory is not an option. Iceberg tables are a reasonable destination, and the symmetry of a catalog auditing itself into a table it manages is a nice property.

Also export the database's own metrics. Connection counts, slow queries, replication lag on a managed instance. Most Polaris latency problems are database problems wearing a catalog costume.

## A production values file, annotated

Here is the shape of a values file that covers the decisions above. Treat it as a map of the settings that need a deliberate answer rather than as something to copy without reading, because names and defaults move between chart versions.

```yaml
image:
  tag: "1.7.0"          # pin it, never track latest in production

replicaCount: 3

# Persistence. In-memory is the chart default and loses everything on restart.
persistence:
  type: relational-jdbc

# All replicas must validate each other's tokens, which means shared key
# material. Auto-generated keys plus multiple pods produce intermittent 401s.
authentication:
  tokenBroker:
    secret:
      name: polaris-token-signing

polarisServerConfig:
  polaris:
    # Audit trail. Multiple destinations run side by side.
    event-listener:
      types: "opentelemetry,kafka"
    # Latency lives in the tail. Averages hide catalog problems completely.
    metrics:
      http:
        histogram-buckets: "50ms,100ms,250ms,500ms,1s,2s,5s"

resources:
  requests:
    memory: "8Gi"
    cpu: "4"
  limits:
    memory: "8Gi"
    cpu: "4"

priorityClassName: "polaris-high-priority"

topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: "topology.kubernetes.io/zone"
    whenUnsatisfiable: "DoNotSchedule"
```

Four settings in that file each prevent a specific outage.

Pinning the image tag prevents a pod restart from silently moving you to a release with a schema expectation your database does not meet. Chasing `latest` in a service that owns a database schema is how you discover an upgrade at 3am instead of on a Tuesday morning.

Setting persistence explicitly prevents the single most common Polaris incident, which is running chart defaults into production and losing the catalog on the first pod recycle.

Shared token signing keys prevent the intermittent-401 failure that presents as a load balancer problem and consumes a day of investigation.

Equal resource requests and limits, plus a priority class, keep the catalog out of the eviction path. A service that every engine calls on every query does not belong in the same scheduling tier as batch work.

Two things deliberately absent from that file. Database credentials belong in a secret managed outside the chart, ideally with IAM authentication where the cloud supports it, so no static password exists to rotate. And the root bootstrap credential appears nowhere, because it lives in a secrets manager and gets used by a human during setup, never by the deployment.

## A ninety-day rollout sequence

Teams that end up with a healthy Polaris deployment tend to move in the same order. Teams that struggle usually skipped step two or step five.

**Weeks one and two: model the object graph.** Catalogs, namespaces, principal roles, catalog roles, grants. Write it as code, apply it against a throwaway realm, tear it down, apply it again. The object model is small, and getting it reproducible now is what makes every later drill possible.

**Weeks three and four: build the database story before the traffic.** Provision the real Postgres, size the pools, enable point-in-time recovery, run a restore into a scratch instance, and confirm a Polaris pointed at the restored copy serves tables. Do this while nothing depends on it.

**Weeks five and six: one engine, one catalog, real workload.** Pick the engine with the most representative write pattern and move a genuine pipeline onto it. Watch commit conflicts, credential expiry against long-running jobs, and p99 table load. Fix what you find before adding engines.

**Weeks seven and eight: identity.** Wire OIDC for people, internal principals for services, and remove any use of the root credential from anything automated. Confirm audit events are landing somewhere durable and queryable.

**Weeks nine and ten: rehearse the failures.** Kill the database primary. Kill a pod mid-commit. Expire a credential during a long write. Restore a realm from backup with maintenance jobs paused. Each rehearsal produces a runbook entry, and the runbook is the actual deliverable.

**Weeks eleven and twelve: upgrade once, deliberately.** Move a minor version with the release notes read, the database snapshotted, and the rehearsal done on a copy. An upgrade you have performed calmly once is a very different thing from an upgrade you have never performed, and doing the first one while nothing is on fire is worth scheduling.

After that the operating rhythm is ordinary: watch four metrics, read release notes, drill restores quarterly, and revisit grants when the organization changes shape.

## Failure modes worth rehearsing

**Database unreachable.** Every request fails. Detection is immediate through readiness checks. Recovery depends entirely on your database's own failover story, which is why the retry settings and a managed instance with automated failover matter. Rehearse it by killing the primary in staging.

**Signing keys diverge across replicas.** Intermittent 401s proportional to replica count. Diagnosed by testing a token against each pod directly. Prevented by provisioning shared key material as a secret.

**Connection pool exhaustion.** Latency climbs, then requests queue, then time out. Usually appears after a scale-up, because more replicas times the same per-pod pool crosses the database limit. Alert on pool saturation, not just on errors.

**A misconfigured storage configuration on one catalog.** Vended credentials come back scoped wrong, and engines get access denied on writes while every catalog API call succeeds. Confusing because the catalog looks healthy. Test the full path, credential vending plus an actual write, in monitoring rather than only at deploy time.

**Root credential in a pipeline.** Not a failure until it is. The bootstrap credential ends up in a job because it was handy during setup, then it never gets rotated, and eventually it is in a log. Audit for it now.

**Maintenance job races a restore.** Snapshot expiry runs against tables whose catalog state was just rolled back, deletes files the restored pointers reference, and turns a recoverable incident into missing-file errors across a namespace. This is the reason the restore runbook starts by pausing maintenance rather than ending with it. Rehearse the pause as part of the drill, and confirm the jobs actually stopped rather than trusting the scheduler.

**A namespace with thousands of tables meets an unpaginated client.** List calls get slow, then clients that ignore page tokens silently see a truncated set, and a discovery job quietly stops finding half your tables. Nothing errors. Detection comes from comparing table counts between the catalog API and a direct database query, which is worth having as a scheduled check.

**Upgrade with a skipped release note.** Server starts, some operations behave incorrectly, and the cause is a schema change that was documented in a version you jumped over. Prevented by reading every intervening release note and by rehearsing the upgrade on a copy.

## Conclusion

Polaris is a small service holding a large responsibility. The server is stateless and easy to run. The database behind it is the correctness boundary for every table in your lakehouse, and most of the operational work is about treating it that way: a real Postgres with real backups, connection pools sized deliberately, retries tuned for failover, and restore drills that actually run.

The rest is a short list. Bootstrap each realm once and script the object model that follows. Share token signing keys across replicas. Spread pods across zones and give them scheduling priority. Grant at namespace level and model roles on workload shapes. Read every release note between your version and your target, and rehearse the upgrade. Keep Iceberg snapshot retention longer than your catalog recovery window, and pause maintenance jobs during a restore.

None of that is exotic. It is the same discipline you apply to any system of record, applied to a service that people mistake for infrastructure plumbing because the quickstart is four minutes long. The catalog is the one component whose failure takes every engine with it. Run it accordingly.

## Keep Going

If this piece was useful, I have written a lot more on catalogs and lakehouse operations. *Apache Polaris: The Definitive Guide* covers the service end to end, from the object model and RBAC through federation, deployment, and day-two operations, and *Architecting an Apache Iceberg Lakehouse* covers where the catalog sits in the wider architecture. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
