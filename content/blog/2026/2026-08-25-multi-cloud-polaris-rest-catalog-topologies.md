---
title: "Multi-Cloud REST Catalog Topologies: Running Apache Polaris Across AWS, Azure, and GCP"
date: "2026-08-25"
description: "Polaris can catalog Iceberg tables across AWS, Azure, and GCP. Four topologies, credential vending, and the tradeoffs of each design."
author: "Alex Merced"
category: "Apache Iceberg"
canonical: https://iceberglakehouse.com/posts/multi-cloud-polaris-rest-catalog-topologies/
tags:
  - Apache Polaris
  - REST catalog
  - multi-cloud
  - Apache Iceberg
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/multi-cloud-polaris-rest-catalog-topologies/).

A global company has analytics data in three places. Its retail arm runs on AWS in Virginia and Frankfurt. An acquisition brought a Google Cloud estate in Belgium. A regulatory requirement put a set of tables on Azure in a sovereign region. Every one of those is an Apache Iceberg lakehouse on the local object store, and every one has its own catalog, its own permissions model, and its own engine fleet. An analyst in the retail team who wants to join her sales table against the acquired company's customer table has to file a ticket, wait for a copy job, and then query a stale replica that nobody is responsible for keeping fresh.

The catalog is the piece that determines whether that situation is a permanent condition or a temporary one. An Iceberg table is a metadata pointer plus files in object storage, and nothing about the format ties it to one cloud. What ties it to one cloud is the catalog that holds the pointer, the credentials the catalog vends, and the network path between the engine and the storage. Get those three right and one catalog can present tables on three clouds to engines anywhere, with the physics of cross-cloud egress as the only remaining cost.

This article is about how to do that with Apache Polaris, the open source REST catalog that graduated to a top-level Apache project on February 18, 2026 and is now at version 1.7.0 as of August 2. I will cover what a REST catalog actually stores and why that makes multi-cloud tractable, the three topologies that work in practice and what each one gives up, how credential vending behaves on each cloud, what replication does and does not exist, and how to operate the result. I work at Dremio, whose Open Catalog is built on Polaris, so I have opinions about this, and I have tried to keep them fair. Everything here applies to any Iceberg REST catalog, though the specifics of credential vending and federation are Polaris features.

## What a REST Catalog Holds, and Why That Matters Across Clouds

Start with what the catalog is responsible for, because the multi-cloud design falls out of it.

An Iceberg REST catalog stores three things. First, the namespace and table hierarchy: which tables exist, under which namespaces, in which catalog. Second, for each table, a pointer to the current metadata file, which is a JSON document in object storage that in turn points at manifest lists, manifests, and data files. Third, the access control model: principals, roles, grants, and the storage configuration that lets the catalog hand out credentials for the table's location.

What the catalog does not store is the data. It does not store the metadata files either. Everything Iceberg-shaped lives in object storage, and the catalog holds only the pointer to the root of each table's tree. The catalog's own persistence (Polaris supports a relational JDBC backend on PostgreSQL or CockroachDB, and a NoSQL persistence layer) is small: a few kilobytes per table, plus the grants.

That has a consequence people miss. A Polaris instance running on AWS can hold a table whose metadata and data live in Google Cloud Storage. The pointer is a `gs://` URI. When an engine asks Polaris for that table, Polaris returns the metadata location and, if configured for it, a short-lived GCS credential scoped to that location. The engine reads GCS directly. Polaris never touches the data. The catalog's cloud and the data's cloud are independent.

The same is true in reverse. A Polaris instance on GCP can catalog tables on S3 and ADLS. A single Polaris catalog can hold tables across all three, because each table carries its own storage configuration. Polaris supports S3 (including S3-compatible stores like MinIO, Ceph, and Ozone through documented guides), Azure Data Lake Storage, and Google Cloud Storage as storage types, and a catalog's allowed-locations list can include prefixes on more than one of them.

The engine side is what makes this work end to end. Every engine that speaks the Iceberg REST protocol (Spark, Trino, Flink, Dremio, DuckDB, PyIceberg, iceberg-rust, and the rest) asks the catalog for a table, receives a location and credentials, and reads storage directly. The engine needs network reachability to the storage and a FileIO implementation for that storage type. Spark and Dremio ship with all three. PyIceberg needs the matching extra installed. DuckDB's Iceberg extension supports S3 and GCS for attached catalogs and does not yet support ADLS.

So the building blocks exist. The design question is where to put the catalog instances, how many to run, and how to get metadata about tables in one region to engines in another. That is the topology question.

## Topology One: A Single Global Catalog

The simplest design is one Polaris deployment, reachable from every region and every cloud, holding every table.

Polaris itself is a stateless Quarkus service in front of a database. Run several replicas of the service behind a global load balancer and put the database somewhere with a strong multi-region story. The Polaris documentation includes a CockroachDB backend guide, and CockroachDB's multi-region deployment (with survival goals and locality-aware replica placement) is the most direct way to get a catalog database that survives a region loss with no manual failover. PostgreSQL with a managed cross-region replica (Aurora Global Database, Cloud SQL cross-region replicas) also works, with the caveat that failover promotes a replica and Polaris needs to be repointed.

Every engine, everywhere, talks to the same catalog endpoint. Every table has one entry. Permissions are defined once. A Spark job in Frankfurt and a Dremio cluster in Belgium see the same namespace, and if the Frankfurt job commits a snapshot, the Belgium cluster sees it on its next `loadTable`.

What you give up is latency and blast radius.

Latency first. A catalog request from an engine in Belgium to a Polaris service in Virginia is a transatlantic round trip, roughly 80 to 100 milliseconds. A query does several catalog calls (config, load table, and for writes, a commit), so that is a few hundred milliseconds of added planning time per query. For batch workloads that is nothing. For interactive dashboards on a sub-second budget it is a lot. Running Polaris service replicas in each region behind the global load balancer fixes the service hop, but every request still has to reach the database, and if the database is single-writer with regional read replicas, commits from the far regions pay the round trip to the writer.

Blast radius second. One catalog means one thing to break. A bad deployment, a database incident, or a misconfigured grant affects every region at once. Polaris 1.7.0's idempotent bootstrap and its improved authorization logging reduce the operational risk, but the architecture concentrates it.

When to choose this: when your engines are mostly batch, your regions are few, and your governance team wants one place to define access. It is the topology I recommend as a starting point for most companies, because the alternatives add real complexity and most companies do not need it yet.

## Topology Two: Regional Catalogs With Federation

The second design runs a Polaris instance per region (or per cloud), each holding the tables that live there, and adds a central Polaris instance that federates to all of them.

Catalog federation is the Polaris feature that makes this a single namespace rather than a collection of silos. A federated catalog in Polaris is an entry in the central instance that points at an external Iceberg REST catalog (or a Hive Metastore, supported since 1.1.0). When an engine asks the central instance for a table in a federated catalog, the central instance forwards the request to the remote catalog, receives the response, and returns it. The engine sees one endpoint and one namespace hierarchy. Polaris-to-Polaris federation is the case this topology uses, and it has been steadily hardened: 1.3.0 added credential vending for federated catalogs (toggled by `ALLOW_FEDERATED_CATALOGS_CREDENTIAL_VENDING`, on by default), SigV4 authentication for federating to AWS-hosted catalogs, and location-based restrictions that block credential vending for remote tables outside an allowed-location list. 1.7.0 added an optional `sessionPolicy` on SigV4 federation so the assumed role can be narrowed further.

Under this design, an engine in Frankfurt talks to the Frankfurt Polaris for Frankfurt tables and gets local latency. An engine that wants a Belgium table goes through the central instance, which forwards to the Belgium Polaris, and pays the cross-region hop only for that table. Writes to a table go to the instance that owns it, so there is no cross-region commit contention. Each region's catalog can be upgraded, restarted, or broken independently.

What you give up is uniformity of governance and a second hop on federated reads.

Governance is now defined in two places. The regional Polaris holds the grants for its own tables. The central Polaris holds the grants that control who can reach which federated catalog. Polaris does not (as of 1.7.0) replicate grants between instances, so a permission change on a Belgium table has to be made on the Belgium instance, and the central instance's view of it is whatever the Belgium instance enforces when the forwarded request arrives. That is correct behavior and it is also a second console to keep consistent.

The second hop adds latency and a failure mode. A federated `loadTable` is two network calls, central-to-regional and regional-to-response, plus the engine's own call. If the central instance is down, every federated table is unreachable even though the regional instances are fine. Engines that need high availability for a specific table should be configured to talk to that table's regional instance directly, with the central instance as the discovery layer rather than the only path.

When to choose this: when you have several regions with meaningful local workloads, when different regions have different operators or compliance boundaries, and when you can accept that governance lives in more than one place. This is the topology that matches the opening scenario, where an acquisition and a sovereign region each came with their own catalog and nobody wants to re-register 10,000 tables.

## Topology Three: Active-Passive With Synchronized Standby

The third design is for disaster recovery rather than for locality. One Polaris instance is primary. A second instance in another region or cloud is a standby that is kept in sync and promoted if the primary fails.

Polaris does not have a built-in replication protocol between instances. What it has is the Polaris Synchronizer, a tool in the polaris-tools repository that migrates entities (catalogs, namespaces, tables, principals, roles, grants) from one Polaris instance to another. It is designed for migration, and it runs as a job rather than as a continuous stream. For active-passive, you run it on a schedule against the standby, and your recovery point objective is the schedule interval.

The catalog entities are only half of what needs to survive. The other half is the table metadata in object storage. If the primary region's object store is unreachable, having a standby catalog that points at unreachable metadata files does not help. So active-passive for the catalog only makes sense alongside cross-region replication of the storage bucket, and that is where it gets hard, because Iceberg metadata files contain absolute paths.

A metadata JSON in `s3://lake-us-east/warehouse/sales/metadata/` references manifests by full URI. Replicate the bucket to `s3://lake-eu-west/` and the copied metadata files still point at `lake-us-east`. Iceberg's `register table` can take the replicated metadata file, but the paths inside it are wrong. Fixing this requires either rewriting the metadata tree with new paths (which several engines and the Iceberg Java library support through a rewrite-table-path action) or using a storage abstraction that presents the same URI in both regions (a global bucket name that resolves regionally, or an S3-compatible gateway in front of the replica). Neither is free. The path-rewrite approach adds a step to every replication cycle. The gateway approach adds a component in the read path.

The honest summary is that catalog-level active-passive is the easy part, and most teams should think of it as "replicate the bucket with a path-aware tool, and re-register tables in the standby catalog from the replicated metadata." The Iceberg Catalog Migrator, also in polaris-tools, is the piece that does the re-registration in bulk.

When to choose this: when a regulatory or business requirement says the catalog must survive a full region loss with a defined recovery time, and you have already solved (or are willing to solve) the storage replication and path problem. Do not adopt it for locality. Topology two does locality better.

Here is how the three compare:

| | Single global catalog | Regional catalogs with federation | Active-passive standby |
|---|---|---|---|
| Namespace view | One | One (via central instance) | One (primary only) |
| Governance definition | One place | Per region plus central | Primary, synced to standby |
| Catalog latency for local tables | Cross-region for far regions | Local | Local (primary region) |
| Catalog latency for remote tables | Cross-region | Two hops via central | N/A |
| Write contention across regions | Shared database | None (each region owns its tables) | None |
| Region loss impact | Depends on database multi-region config | Region's tables unavailable, others fine | Failover to standby with data replication lag |
| Polaris features used | Multi-storage-type catalog, multi-region database | Catalog federation, federated credential vending | Synchronizer, Catalog Migrator |
| Operational complexity | Lowest | Medium | Highest |

## Credential Vending Across Three Clouds

Credential vending is the feature that makes a multi-cloud catalog secure rather than just possible, and it behaves differently on each cloud. Understanding the differences is most of the work of a multi-cloud deployment.

The principle is the same everywhere. An engine authenticates to Polaris with a principal credential (an OAuth client ID and secret, or a token from an external identity provider). Polaris checks the principal's grants. When the engine loads a table with the `X-Iceberg-Access-Delegation: vended-credentials` header, Polaris uses its own cloud identity to mint a short-lived, narrowly scoped credential for the table's storage location and returns it in the `loadTable` response. The engine uses that credential to read or write the files. The engine never holds a long-lived storage key, and the credential it does hold cannot reach any location the table does not own.

On AWS, Polaris calls STS `AssumeRole` on a role you configure in the catalog's storage configuration, with a session policy that scopes the resulting credentials to the table's prefix. The response carries an access key, secret, session token, and an expiry (`s3.session-token-expires-at-ms`). Two details matter for multi-region. First, the STS endpoint: Polaris 1.5.0 added explicit configuration of the regional STS client, so a catalog serving tables in `eu-central-1` can be told to call the Frankfurt STS endpoint rather than the global one, which avoids cross-region latency on every credential request and respects regional policy restrictions. Second, session tags: Polaris attaches the principal identity as an STS session tag, so CloudTrail records which Polaris principal performed each S3 access rather than showing every access as the catalog's role.

On Azure, Polaris vends a SAS (shared access signature) token for the ADLS container or path, generated through the catalog's service principal or managed identity. The response carries the SAS token and, since 1.7.0, bare ADLS credential keys alongside the prefixed ones, which fixed a compatibility gap with PyIceberg. Azure has no direct equivalent of STS session tags, so per-principal attribution in Azure storage audit logs is not available through vending as of 1.7.0. If attribution matters for compliance on Azure, log at the Polaris layer (the audit event listeners cover this) rather than expecting it from the storage side.

On GCP, Polaris vends a downscoped OAuth access token for the GCS bucket and path through the catalog's service account. Polaris 1.7.0 added GCS principal attribution as the GCP counterpart of AWS session tags. When `GCS_PRINCIPAL_ATTRIBUTION_ENABLED=true` is set, along with a Workload Identity Federation audience, a token issuer, and a signing key, Polaris chains a catalog-signed JWT through a WIF token exchange and service-account impersonation, and the resulting credential carries the Polaris principal into GCS Data Access audit logs under `serviceAccountDelegationInfo.principalSubject`. That closes the "who read this table" gap on GCP. It requires a `gcpServiceAccount` on the catalog's storage configuration, and a missing flag is a fatal configuration error rather than a silent fallback.

Two cross-cutting controls apply on every cloud.

The first is location-based restriction. Every catalog has an allowed-locations list, and Polaris refuses to vend credentials for a table whose location falls outside it. Since 1.3.0 this applies to federated catalogs too, so a central instance can be configured to vend credentials only for remote tables under approved prefixes. Combine this with the 1.7.0 `ALLOW_CLIENT_SPECIFIED_TABLE_LOCATION` flag (on by default, set it to false to force Polaris to manage all table locations) and the `DEFAULT_UNIQUE_TABLE_LOCATION_ENABLED` flag (off by default, gives each table an unpredictable path suffix so no two tables share a prefix) and you get a catalog where a credential vended for one table provably cannot reach another.

The second is credential lifetime. Vended credentials expire, typically within an hour. Long-running queries and long-running writes have to handle refresh. Most engines re-call `loadTable` on expiry. PyIceberg does. Spark's Iceberg integration does. Check yours.

Here is what a catalog's storage configuration looks like for a table on each cloud, using the Polaris management API's JSON shape. These are three separate catalogs in this example, which is the common pattern (one catalog per storage location and cloud), though a single catalog can list multiple allowed locations of the same storage type.

```json
{
  "name": "retail_us",
  "type": "INTERNAL",
  "properties": {
    "default-base-location": "s3://lake-us-east/retail/"
  },
  "storageConfigInfo": {
    "storageType": "S3",
    "roleArn": "arn:aws:iam::123456789012:role/polaris-retail-us",
    "region": "us-east-1",
    "allowedLocations": ["s3://lake-us-east/retail/"]
  }
}
```

```json
{
  "name": "sovereign_eu",
  "type": "INTERNAL",
  "properties": {
    "default-base-location": "abfss://lake@sovereignlake.dfs.core.windows.net/eu/"
  },
  "storageConfigInfo": {
    "storageType": "AZURE",
    "tenantId": "00000000-0000-0000-0000-000000000000",
    "multiTenantAppName": "polaris-sovereign-eu",
    "allowedLocations": ["abfss://lake@sovereignlake.dfs.core.windows.net/eu/"]
  }
}
```

```json
{
  "name": "acquired_gcp",
  "type": "INTERNAL",
  "properties": {
    "default-base-location": "gs://lake-europe-west1/acquired/"
  },
  "storageConfigInfo": {
    "storageType": "GCS",
    "gcpServiceAccount": "polaris-acquired@project.iam.gserviceaccount.com",
    "allowedLocations": ["gs://lake-europe-west1/acquired/"]
  }
}
```

Three things to notice. Each catalog names exactly one storage type and one identity for that cloud (an IAM role, an Azure app registration, a GCP service account). Each has an allowed-locations list that fences the credentials it will vend. And the `default-base-location` is where new tables go if a client does not specify a location, which with `ALLOW_CLIENT_SPECIFIED_TABLE_LOCATION=false` becomes the only place new tables can go.

An engine that wants all three sees them as three catalogs on one Polaris endpoint (topology one) or as three federated entries on a central Polaris (topology two). Either way it authenticates once and gets per-table credentials for whichever cloud the table lives on.

## A Request Trace: What an Engine Actually Does

It helps to see the exact calls an engine makes, because the multi-cloud behavior is entirely in the responses.

An engine configured against Polaris starts with a config request:

```
GET /api/catalog/v1/config?warehouse=acquired_gcp
Authorization: Bearer <token from /v1/oauth/tokens>
```

The response tells the engine what the catalog supports and any overrides it should apply. In 1.7.0 with idempotency enabled, this is where the `idempotency-key-lifetime` field appears. It also tells the engine the prefix to use for subsequent calls.

Then the engine loads the table:

```
GET /api/catalog/v1/acquired_gcp/namespaces/customers/tables/profiles
Authorization: Bearer <token>
X-Iceberg-Access-Delegation: vended-credentials
```

The response is where the cloud-specific behavior shows up. Trimmed to the relevant parts:

```json
{
  "metadata-location": "gs://lake-europe-west1/acquired/customers/profiles/metadata/00042-....metadata.json",
  "metadata": { "...": "full table metadata" },
  "config": {
    "gcs.oauth2.token": "ya29.....",
    "gcs.oauth2.token-expires-at": "1756070000000"
  }
}
```

The `config` block is the vended credential. For an S3 table it holds `s3.access-key-id`, `s3.secret-access-key`, `s3.session-token`, and `s3.session-token-expires-at-ms`. For ADLS it holds the SAS token under the storage account key. The engine feeds these into its FileIO for that storage type and reads `metadata-location` directly from the cloud that hosts it. Polaris is out of the loop from this point until the engine needs to commit or the credential expires.

For a federated table, the engine's request is identical. The central Polaris receives it, looks up the federated catalog entry, authenticates to the regional Polaris using the stored federation credentials, forwards the load, and passes back the response including the vended credential that the regional instance minted. The engine cannot tell the difference, which is the point.

On the engine side, here is how a Spark session sees the three catalogs from the storage configuration examples above, through a single Polaris endpoint:

```
spark.sql.catalog.retail_us=org.apache.iceberg.spark.SparkCatalog
spark.sql.catalog.retail_us.catalog-impl=org.apache.iceberg.rest.RESTCatalog
spark.sql.catalog.retail_us.uri=https://polaris.example.com/api/catalog
spark.sql.catalog.retail_us.warehouse=retail_us
spark.sql.catalog.retail_us.credential=<client-id>:<client-secret>
spark.sql.catalog.retail_us.scope=PRINCIPAL_ROLE:ALL
spark.sql.catalog.retail_us.header.X-Iceberg-Access-Delegation=vended-credentials

spark.sql.catalog.sovereign_eu=org.apache.iceberg.spark.SparkCatalog
spark.sql.catalog.sovereign_eu.catalog-impl=org.apache.iceberg.rest.RESTCatalog
spark.sql.catalog.sovereign_eu.uri=https://polaris.example.com/api/catalog
spark.sql.catalog.sovereign_eu.warehouse=sovereign_eu
spark.sql.catalog.sovereign_eu.credential=<client-id>:<client-secret>
spark.sql.catalog.sovereign_eu.scope=PRINCIPAL_ROLE:ALL
spark.sql.catalog.sovereign_eu.header.X-Iceberg-Access-Delegation=vended-credentials

spark.sql.catalog.acquired_gcp=org.apache.iceberg.spark.SparkCatalog
spark.sql.catalog.acquired_gcp.catalog-impl=org.apache.iceberg.rest.RESTCatalog
spark.sql.catalog.acquired_gcp.uri=https://polaris.example.com/api/catalog
spark.sql.catalog.acquired_gcp.warehouse=acquired_gcp
spark.sql.catalog.acquired_gcp.credential=<client-id>:<client-secret>
spark.sql.catalog.acquired_gcp.scope=PRINCIPAL_ROLE:ALL
spark.sql.catalog.acquired_gcp.header.X-Iceberg-Access-Delegation=vended-credentials
```

Same endpoint, same principal, three warehouses. The `warehouse` property selects the Polaris catalog. Everything else is identical, and the Spark session needs the Iceberg AWS, Azure, and GCP bundles on its classpath so the FileIO for each storage type is available. With that in place, the analyst's join is a single statement:

```sql
SELECT s.order_id, s.amount, c.segment
FROM retail_us.sales.orders s
JOIN acquired_gcp.customers.profiles c
  ON s.customer_id = c.customer_id
WHERE s.order_date >= DATE '2026-08-01'
  AND c.country = 'DE';
```

Spark plans both scans with pushdown, reads the S3 table with an STS credential and the GCS table with a downscoped OAuth token, and joins them in its own executors. The only cross-cloud traffic is the filtered rows from whichever side is remote to the cluster.

## Health Checks and Cross-Catalog Consistency Verification

A multi-catalog deployment needs monitoring that a single catalog does not, because the failure modes are between instances rather than inside one.

Per-instance health is the easy part. Polaris exposes standard Quarkus health endpoints, Prometheus metrics, and (in 1.7.0) HTTP request duration histograms with configurable SLO boundaries. Alert on request latency percentiles per instance and on error rates per endpoint. A rise in 403s after a deployment means a grant went missing. A rise in 5xx on `loadTable` with vended credentials means the cloud identity behind a catalog lost a permission.

Federation health needs a synthetic check. From the central instance, load one known table from each federated catalog on a schedule, with vended credentials, and read the metadata file it points to. That exercises the federation credential, the regional instance, the credential vending chain, and the storage path in one call. When it fails, the error identifies which link broke.

Cross-catalog consistency is the part nobody builds until after the first incident. In topology two, the things that should match across instances are the grant definitions (if you manage them as code, the check is a diff against the repository). In topology three, the things that should match are the entity sets between primary and standby: every catalog, namespace, table, principal, and role on the primary should exist on the standby with the same metadata location. Write a job that lists entities from both through the management and catalog APIs and diffs them, and run it after every Synchronizer pass. The gap it reports is your real recovery point, which is often larger than the schedule interval suggests because the Synchronizer runs long on large catalogs.

For the data itself, verification means confirming that a table's current metadata location on the standby catalog resolves to a readable file in the replicated bucket and that the paths inside it resolve too. A small script that loads each table through the standby, reads its manifest list, and HEADs the first manifest is enough to catch a broken path rewrite before a real failover finds it.

## Choosing Where the Data Lives

A question that sits underneath every topology decision is where new tables should be created, and the catalog can enforce the answer.

The default is data gravity: a table lives on the cloud where it is produced and where most of its readers run. A retail sales table produced by an AWS pipeline and read by an AWS Spark fleet belongs on S3. Putting it anywhere else means every write and most reads cross a cloud boundary. Polaris's `default-base-location` on the producing catalog makes that the path of least resistance, and `ALLOW_CLIENT_SPECIFIED_TABLE_LOCATION=false` makes it the only path.

The exception is shared reference data. A small dimension table (countries, currencies, product hierarchy) that every region joins against is cheaper to copy to every cloud than to read remotely on every query. This is the one case where maintaining replicas is worth it, and it is worth it because the tables are small and change slowly. Give each copy its own entry in the local catalog, refresh them from a single source of truth on a schedule, and name them identically in each regional catalog so the same SQL runs everywhere.

The anti-pattern is a "global" catalog whose default location is on one cloud and whose producers are on three. Every producer outside the home cloud pays egress on every write, and the table's readers on the home cloud get the data late. If you see a catalog whose write egress is a meaningful fraction of its storage cost, the default location is in the wrong place.

## What Replication Does and Does Not Exist

This is the section where I have to be direct, because vendor material on "multi-cloud catalogs" often implies capabilities that do not exist in the open source project.

Polaris does not replicate catalog state between instances continuously. There is no built-in active-active mode where two Polaris instances accept writes and reconcile. The Synchronizer is a batch migration tool. The persistence layer's multi-region story is whatever your database provides, which is why the CockroachDB guide matters: a multi-region CockroachDB cluster under a single logical Polaris deployment (topology one with regional service replicas) is the closest thing to active-active that exists today, and it is the database doing the work, not Polaris.

Polaris does not replicate Iceberg metadata or data. It holds pointers. Cross-cloud replication of a table is a storage-layer operation (bucket replication, `rclone`, a cloud transfer service) followed by a metadata path rewrite and a re-registration in the destination catalog. The Iceberg community has a rewrite-table-path action in the Java library for the path problem, and the Catalog Migrator handles bulk re-registration. Nothing in Polaris automates the whole loop.

Polaris does have consistency work in progress at the persistence layer. The August 2026 dev list activity included an ongoing discussion between Robert Stupp and Dmitri Bourlatchkov on consistent multi-object changes in Polaris persistence, working through what a backend-agnostic change-set primitive needs to guarantee. That is the foundation that any future replication feature builds on, and it is worth following if you are planning a multi-region deployment for next year rather than this one.

What this means in practice: if you need a table readable in two clouds with low latency in both, you have two data copies, two catalog entries, and a replication job you own. The catalog gives you a single namespace over those copies (name them differently, or put them in different catalogs), credential vending on each side, and a governance model that spans both. It does not give you one table that is magically in two places.

For most workloads, that is fine, because cross-cloud reads are rarer than the architecture diagrams suggest. The analyst in the opening does not need the customer table replicated. She needs a credential to read it where it lives, and a query engine that can join a Frankfurt table against a Belgium table over the network. Egress costs money (roughly 5 to 12 cents per gigabyte across cloud boundaries as of this writing), so the engine should push filters and projections down to minimize what crosses, but a one-time join over a few gigabytes is cheaper than maintaining a replica forever.

## Failure Modes and Warning Signs

**Vended credentials rejected in the far region.** The engine gets a credential from Polaris and the storage rejects it. On AWS this is usually a regional STS mismatch: the credential was minted by the global STS endpoint and the bucket region has a policy requiring regional tokens, or vice versa. Configure the regional STS client per catalog. On Azure it is usually a clock skew or a SAS scope narrower than the engine's actual request path. On GCP it is usually a WIF audience mismatch when attribution is enabled.

**Clock skew across clouds.** Vended credentials carry expiry timestamps, and SAS tokens in particular carry start times. An engine node whose clock runs a few minutes ahead of the issuing cloud rejects a credential as expired, or a storage endpoint rejects a token as not yet valid. The sign is intermittent authorization failures on a subset of nodes. Keep every engine node on NTP and treat a credential failure that only some executors see as a clock problem before a permissions problem.

**Federated catalog unreachable through the central instance but fine directly.** The central Polaris cannot reach the regional one, or its stored credential for the remote catalog expired. Check the federation authentication type (OAuth, SigV4, bearer, or implicit) and its rotation. The 403 logs in 1.7.0 now name the missing privilege server-side, which shortens this investigation.

**Cross-region commit latency spikes.** In topology one with a single-writer database, every commit from a far region pays the round trip to the writer. If commit latency from Belgium is three times commit latency from Virginia, that is the cause. The fix is either a multi-region database with local writes (CockroachDB with region-scoped tables) or a move to topology two.

**Split-brain after a standby promotion.** In topology three, the primary comes back after the standby was promoted, and both accept writes. Polaris has no fencing for this. Your failover runbook has to make the old primary read-only (or unreachable) before clients can reach it again, and the Synchronizer has to run from the new primary to the old one before the old one is reintroduced.

**Egress bills.** A query engine that scans a remote-cloud table without pushdown pulls the whole table across the boundary. The sign is a storage egress line item that appears the month after federation went live. Confirm your engine pushes partition and column filters to the scan, and consider pinning heavy cross-cloud workloads to a scheduled replica rather than live reads.

**Grants drift between regional instances.** In topology two, a role exists in one regional catalog and not another, and a user who can read a table in Frankfurt cannot read the equivalent table in Belgium. Nothing in Polaris detects this. Export grants from each instance on a schedule and diff them, or manage grants as code (the management API is a plain REST surface) and apply the same definitions to every instance from one repository.

## Operational Guidance

**Start with topology one.** One Polaris, regional service replicas, a multi-region-capable database. Add federation when a region's latency or autonomy requirement forces it, not before. Most companies never need topology three.

**One catalog per storage location and cloud.** It makes the allowed-locations list unambiguous, gives each catalog one cloud identity, and maps cleanly to how cloud IAM is scoped. Use namespaces for organization within a catalog, not catalogs for organization within a cloud.

**Configure regional STS from day one on AWS.** It costs nothing and avoids the most common cross-region credential failure.

**Enable attribution where it exists.** STS session tags on AWS are automatic. GCS principal attribution on GCP is opt-in as of 1.7.0 and requires WIF setup. Turn it on before an auditor asks who read a table.

**Force catalog-managed locations.** Set `ALLOW_CLIENT_SPECIFIED_TABLE_LOCATION=false` and `DEFAULT_UNIQUE_TABLE_LOCATION_ENABLED=true`. This removes the class of problems where a client creates a table with a path that overlaps another table's prefix and inherits its credentials.

**Manage grants as code.** Every Polaris instance exposes the same management API. Define principals, roles, and grants in a repository and apply them to every instance from CI. This is the only reliable way to keep topology two consistent, and it is a good idea in topology one too.

**Emit events.** Polaris 1.7.0 added Kafka and OpenTelemetry event listeners. Route every instance's events to one place. That gives you a cross-region audit trail and a way to trigger downstream work when a table in another cloud changes.

**Test the failover before you need it.** For topology three, run the promotion runbook quarterly against a copy. The path-rewrite and re-registration steps are the ones that break as tables are added.

**Audit trail per instance.** Every Polaris instance writes its own audit events. In topology two, "who read this table" is a question you answer by querying the instance that owns the table, and if you route Kafka events from all instances to one topic, by querying that topic with the instance name as a field. Decide the routing before the first compliance request rather than after.

**Version skew between instances.** Regional instances drift apart in version when teams upgrade on their own schedules. Federation between a 1.7.0 central instance and a 1.4.1 regional one works for the Iceberg REST surface, because the protocol is stable, but management features (session policies, attribution flags, idempotency) exist only where they have been deployed. Keep a version matrix and upgrade the central instance last, since it has to talk to every version below it.

**Watch commit latency per region and egress per catalog.** Those two metrics tell you when the topology you chose has stopped fitting the workload.

## Where the Ecosystem Is Heading

The direction of the Polaris project is toward making the catalog trustworthy enough to be the single control point across clouds, and the 1.x line since the July 2025 1.0 release has been a steady march in that direction. Federation went from single-instance to multi-type. Credential vending grew per-cloud attribution. The persistence layer is getting transactional guarantees that a future replication story can build on. The Helm chart grew a maintenance service. Events became a first-class output.

Three developments to watch.

Persistence consistency. The multi-object change-set work on the dev list is the prerequisite for any Polaris-native replication or multi-primary mode. When it lands, expect proposals for cross-instance synchronization that go beyond the batch Synchronizer.

Iceberg REST spec idempotency and multi-table transactions. Polaris 1.7.0 shipped opt-in idempotency keys ahead of the spec. As the REST specification standardizes these, cross-region clients that retry across a flaky link stop producing duplicate commits, and multi-table commits stop being a per-catalog feature.

Engines that understand cost. A federated catalog that presents tables on three clouds is only as good as the query engine's ability to avoid pulling data across boundaries. Cost-based planners that account for egress, pushdown that reaches the remote scan, and acceleration layers that keep a local materialization warm are the engine-side pieces. Dremio's Autonomous Reflections are one example of the last pattern, and I expect every serious lakehouse engine to grow something similar, because the catalog is going multi-cloud faster than the network is getting free.

## Conclusion

An Iceberg REST catalog holds pointers, permissions, and storage configurations, and nothing about that ties it to one cloud. Apache Polaris can catalog tables on S3, ADLS, and GCS from one instance, vend short-lived credentials appropriate to each, and federate to other Polaris instances so that regional catalogs present as one namespace. Those are the real capabilities, and they are enough to solve the opening problem: give the analyst a credential to read the table where it lives.

What Polaris does not do, as of 1.7.0, is replicate itself or the data. Multi-region resilience comes from the database under it. Cross-cloud table copies come from storage replication plus a path rewrite plus re-registration, and you own that loop. Pick the topology that matches the problem you actually have, which for most teams is a single global catalog with regional service replicas, configure credential vending correctly on each cloud, manage grants as code, and turn on the audit trail. The catalog was the piece that kept the data siloed. Set up right, it is the piece that stops it.

## Keep Going

If this piece was useful, I have written a lot more on Apache Polaris, catalogs, and lakehouse architecture across clouds. *Apache Polaris: The Definitive Guide* (O'Reilly) covers federation, credential vending, and deployment topologies in depth. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
