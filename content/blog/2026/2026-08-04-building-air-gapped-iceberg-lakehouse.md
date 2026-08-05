---
title: "Building Apache Iceberg Lakehouses That Run Without an Internet Connection"
date: "2026-08-04"
description: "How to build an Apache Iceberg lakehouse that runs fully offline: storage, catalog, compute, cross-zone transfer, compliance, and the failure modes that bite."
author: "Alex Merced"
category: "Data Lakehouse"
tags:
  - Apache Iceberg
  - Air-Gapped
  - On-Premises
  - MinIO
  - Lakekeeper
  - Security
canonical: "https://iceberglakehouse.com/posts/building-air-gapped-iceberg-lakehouse/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/building-air-gapped-iceberg-lakehouse/).

# Building Apache Iceberg Lakehouses That Run Without an Internet Connection

*By Alex Merced, Data Lakehouse and AI Evangelist*

A hospital system wants a lakehouse. Their security review says patient data never leaves facilities they control. A defense contractor wants the same architecture inside an enclave with no route to the public internet. A bank in a jurisdiction with data residency law wants it inside one country's borders, on hardware they own.

Every reference architecture they find assumes S3, a managed catalog service, and a query engine billed by the hour from a vendor's cloud. None of that is available to them.

The good news is that the lakehouse pattern separates cleanly into layers, and every layer has a self-hostable implementation. Object storage, table format, catalog, and query engine are independent choices connected by published protocols. That is the whole point of building on open standards, and the air-gapped case is where the point stops being philosophical.

The harder news is that the operational work you outsource to a cloud provider does not disappear. It becomes yours. This piece covers what each layer looks like when you run it yourself, how metadata moves between isolated zones, which compliance controls the architecture actually satisfies, and where these deployments break.

A disclosure. I work for Dremio, which was acquired by SAP and now sits within SAP Business Data Cloud. Dremio deploys on-premises, which is why I have spent time in these environments. The architecture below works with several engines and I have tried to describe it that way.

## What air-gapped means in practice

The term covers a range, and the deployment differs substantially across it. Get specific about which one you have before choosing components.

**Restricted egress** means the environment reaches internal services and a controlled allowlist, with no general internet access. Package installation goes through an internal mirror. This is the most common case and the easiest.

**Isolated enclave** means no route to the internet at all, but a controlled transfer mechanism exists for moving artifacts in and data out, usually through a review gate. Updates arrive on a schedule, in batches, after inspection.

**True air gap** means physical separation with data transfer by removable media under a documented procedure. Nothing crosses electronically.

The architecture is the same across all three. What changes is how you get software in, how you get telemetry out, and how long it takes to apply a security patch. A deployment plan that works for restricted egress and assumes weekly patching falls apart in a true air gap where every update is a scheduled transfer event.

Write down which tier you are in, then design the update path first. Teams design the data path first and discover the update path is the hard part.

## The storage layer

Everything sits on S3-compatible object storage. Iceberg does not care whose implementation it is, as long as the API behaves.

The options changed meaningfully in the last two years, mostly because MinIO moved to maintenance mode and its AGPL licensing pushed some organizations to look elsewhere. Here is the honest state of the field.

| Option | License | Fit | Cautions |
|---|---|---|---|
| MinIO | AGPL | Proven at scale, widely deployed, well understood | Maintenance mode, AGPL review required, some admin functions moved to CLI |
| Ceph RADOS Gateway | LGPL | Block, file, and object in one system, strong operational track record | Lower object throughput per node than dedicated object stores |
| SeaweedFS | Apache 2.0 | Billions of files with constant-time lookup, strong on small objects, cloud tiering, Kubernetes CSI driver | Fewer enterprise appliance integrations |
| Garage | AGPL | Lightweight, multi-site, good under 50 TB | Versioning and lifecycle features less complete |
| RustFS | Apache 2.0 | Drop-in MinIO binary replacement, strong small-object throughput | Newer project, evaluate maturity carefully before production |
| Hardware appliances | Commercial | Vendor support, certified configurations | Cost, and you are back to a vendor relationship |

Two points deserve emphasis for regulated deployments.

Small-object performance matters more than the headline number. Iceberg operations read manifests, list partitions, and load metadata files, all of which are small objects. A store optimized for large sequential reads and weak on small-object throughput produces a lakehouse where scans are fast and planning is slow. Benchmark with your metadata access pattern, not with a large-file throughput test.

Maturity is a security property, not just a stability one. RustFS shipped a critical vulnerability in its alpha series where a hardcoded gRPC authentication token allowed anyone with access to the port to bypass authentication entirely. It carried a CVSS score of 9.8 and was fixed in a later alpha. That is normal for a young project and completely unacceptable in an environment where patching takes six weeks through a transfer gate. In an air-gapped deployment, prefer components with a long patch history over components with better benchmarks.

The features you actually need from the storage layer are S3 API compatibility including multipart upload and conditional writes, object versioning, server-side encryption, erasure coding or replication for durability, and lifecycle management. Confirm each one against your candidate rather than trusting a compatibility claim.

## The catalog layer

The catalog is the component most people underestimate in an air-gapped design, because in the cloud it is a service somebody else runs.

Self-hostable Iceberg REST catalogs include Apache Polaris, Apache Gravitino, and Lakekeeper. All three implement the REST protocol, so engines connect to them identically.

Apache Polaris was co-created with Snowflake, donated to the Apache Software Foundation, and graduated to Top-Level Project on February 18, 2026. It brings a full RBAC model with principals, principal roles, and catalog roles, plus credential vending. It runs against a relational backing store, which is what you want for commit atomicity.

Lakekeeper is written in Rust and built explicitly with on-premises S3 in mind alongside the hyperscalers. It supports vended credentials and remote signing, integrates with an OpenID provider for authentication, ships a Helm chart for high-availability Kubernetes deployment, and can authenticate Kubernetes service accounts natively. It also emits change events as CloudEvents and supports external change approval, which lets an outside system block a commit that violates a data contract. In a regulated environment, that hook is worth more than it sounds, because it gives compliance tooling a place to sit in the write path.

Apache Gravitino covers a broader metadata scope than tables alone and is worth evaluating if your governance requirements extend past the lakehouse.

Three requirements matter more in an air-gapped deployment than in a cloud one.

**Identity integration without external calls.** The catalog must authenticate against your internal identity provider. An OpenID Connect integration pointed at an internal issuer works. A catalog that assumes a cloud identity service does not.

**Credential vending against on-premises storage.** MinIO, RustFS, and Ceph all support STS-style temporary credentials. Confirm your catalog vends against your specific store, because vending implementations are often written and tested against AWS first.

**A backing store you already operate.** Polaris and Lakekeeper both use a relational database. Use the one your organization already runs and backs up, rather than introducing a new one that nobody has a recovery procedure for.

## The compute layer

Query engines that deploy on-premises include Trino, Spark, Presto, StarRocks, ClickHouse, and Dremio, among others. The selection criteria shift in an isolated environment.

Deployment model matters most. Kubernetes with Helm charts and pre-pulled images into an internal registry is the path of least resistance. Engines distributed only as a cloud service are out regardless of their merits.

Dependency footprint matters second. An engine that pulls artifacts at runtime from a public repository fails in an enclave. Check what the engine does on startup, not just what the installer does.

Semantic layer and access control matter third, because in these environments the query engine often serves business users directly rather than sitting behind a separate BI platform. Row filters, column masks, and governed views defined in the engine avoid deploying yet another component into a space where every additional component is a separate security review. Dremio's on-premises deployment exists for exactly this set of constraints, and since the SAP acquisition it also fits organizations standardizing on SAP Business Data Cloud that still have workloads which cannot leave their own facilities.

## A deployment shape

Here is the structure of a working stack. Adapt the specifics to your platform.

```yaml
# Object storage: S3-compatible, erasure coded across nodes
storage:
  endpoint: https://objects.internal.acme.local
  region: us-internal-1
  path_style_access: true          # required by most self-hosted stores
  tls_ca_bundle: /etc/pki/acme-internal-ca.pem

# Catalog: Iceberg REST, backed by an internal Postgres cluster
catalog:
  image: internal-registry.acme.local/lakekeeper/lakekeeper:pinned-tag
  database_url: postgresql://catalog-db.internal.acme.local:5432/catalog
  openid_provider_uri: https://sso.internal.acme.local/auth/data
  s3_endpoint: https://objects.internal.acme.local
  s3_path_style_access: true
  enable_vended_credentials: true

# Engine: connects only to the catalog, never directly to storage config
engine:
  catalog_uri: https://catalog.internal.acme.local/catalog
  warehouse: acme_lakehouse
  access_delegation: vended-credentials
```

Several details in that configuration are the ones that break first-time deployments.

`path_style_access: true` is required by nearly every self-hosted object store. AWS moved to virtual-hosted-style addressing, and clients default to it. A self-hosted store behind an internal DNS name usually needs path style, and the failure without it is a confusing bucket-not-found error.

`tls_ca_bundle` pointing at your internal certificate authority is mandatory. Internal environments use private CAs, and every component in the stack needs to trust it. This is the single most common cause of days lost in these deployments. Java-based engines need the CA in a truststore, not just in the system bundle.

`openid_provider_uri` pointing at an internal issuer is what keeps authentication inside the boundary.

`enable_vended_credentials: true` with the engine configured for `vended-credentials` access delegation means the engine holds no storage credentials of its own. That is worth as much on-premises as it is in the cloud, and it is easier to justify to a security review than a shared access key in a configuration file.

Pin every image tag to a digest and mirror it into an internal registry. `latest` in an air-gapped environment means whatever was current the last time someone ran a transfer, which is not a version anyone can reason about during an incident.

## Moving data and metadata across zones

Multi-zone deployments are where the architecture gets genuinely interesting, because Iceberg's design helps in a way that is easy to miss.

An Iceberg table is fully described by its files. The data files, the manifests, the manifest lists, and the metadata JSON together are the table. There is no hidden state in the catalog beyond a pointer to the current metadata file.

That property makes one-way transfer between zones tractable. Copy the files, register the table in the destination catalog by pointing at the metadata file location, and the table exists on the other side with its full snapshot history, schema evolution, and statistics.

The obstacle today is absolute paths. Iceberg metadata records full URIs, so a table copied to a different bucket or endpoint has metadata pointing at the source location. Fixing that means rewriting every metadata file, which for a large table is a batch job measured in hours.

The relative paths work in the Iceberg V4 proposal set addresses this directly and is among the more settled pieces of that effort. Metadata records paths relative to a table root, resolved at read time. Once that lands broadly, cross-zone transfer becomes a file copy plus a catalog registration.

Until then, three practical approaches work.

**Mirror the path structure.** If the destination zone uses the same bucket name and prefix layout, absolute paths resolve correctly. This requires coordination between zone owners and is the cheapest option when you can get it.

**Rewrite metadata during transfer.** A transfer job that rewrites paths as it copies. This is well-trodden ground and there are open source tools for it, but it adds a processing step inside your transfer gate, which is exactly where added complexity is least welcome.

**Transfer at the data layer and rebuild.** Copy Parquet files and re-register them as a new table in the destination. You lose snapshot history, which matters for some compliance postures and not others.

For incremental transfer, snapshot-based export is the right shape. Track the last transferred snapshot ID, compute the files added since, and transfer only those. Iceberg metadata tables give you exactly this.

```sql
SELECT f.file_path, f.file_size_in_bytes
FROM prod.clinical.encounters.files f
JOIN prod.clinical.encounters.snapshots s
  ON f.snapshot_id = s.snapshot_id
WHERE s.committed_at > TIMESTAMP '2026-07-01 00:00:00'
ORDER BY s.committed_at;
```

That gives the transfer manifest for a delta shipment. Combine it with the metadata file for the target snapshot and the destination zone gets a consistent table state, not a partial copy.

One rule matters above all in cross-zone design. Transfer complete snapshots, never partial ones. A destination that receives some data files from a snapshot and not others has a table that references files which do not exist, and the failure appears at query time rather than at transfer time.

## What the architecture gives you for compliance

Be precise here, because architecture claims in compliance conversations get scrutinized.

The architecture supports data residency directly. Storage runs on hardware in a location you specify, and no component calls out to a service in another jurisdiction. That is a strong and verifiable claim.

Encryption at rest comes from the object store's server-side encryption. Encryption in transit comes from TLS between every component. Both are configuration, both are auditable.

Access control comes from the catalog's RBAC model, with authentication against your internal identity provider and short-lived vended credentials rather than shared static keys. The audit story is much stronger with vending, since storage access logs tie to a catalog principal rather than to a shared engine role.

Immutability and audit trails come partly from Iceberg itself. Snapshots record every change with a timestamp and a summary, and time travel lets an auditor query the table as it existed at a past moment. That is a genuinely useful property for regulated workloads and one that warehouse platforms charge extra for.

Change approval hooks, where the catalog supports them, give compliance tooling a place in the write path rather than a report after the fact.

What the architecture does not give you is a certification. HIPAA, FedRAMP, and similar frameworks certify organizations and systems, not components. Running open source software in your own environment means the assessment burden is yours, including for every component you assembled. A managed service in an authorized cloud region transfers part of that burden to the provider. That tradeoff is the real decision, and it is an organizational one rather than a technical one.

## Failure modes

**Certificate trust.** Private CA not in the Java truststore, not in the container image, not trusted by the object store client. This costs more days than any other single issue.

**Path style addressing.** Clients default to virtual-hosted style and fail against self-hosted stores.

**Clock skew.** Signed S3 requests and OIDC tokens both fail on skewed clocks. Air-gapped environments without a reliable internal NTP source drift, and the errors point at authentication rather than at time.

**Patch latency.** A component with a critical vulnerability sits unpatched while the update moves through a transfer gate. Design your component selection around this rather than assuming you patch quickly.

**No managed maintenance.** Compaction, snapshot expiration, and orphan cleanup are yours. Nobody runs them for you, and a lakehouse without them degrades in months.

**Backing store neglect.** The catalog database holds the pointer to every table's current state. Losing it loses the lakehouse even though every data file survives. Back it up with the same rigor as any production database and test the restore.

**Capacity planning without elasticity.** Cloud deployments absorb bad estimates by scaling. On-premises deployments do not. Size for peak, monitor headroom, and treat capacity as a lead-time item measured in months.

**Single-node object storage in production.** Someone stands up a single-node store for a proof of concept and it quietly becomes production. Erasure coding across nodes is not optional at that point.

## Operational guidance

Build a golden artifact bundle. Every container image pinned to a digest, every JAR, every Helm chart, in one versioned set that moves through the transfer gate as a unit. Partial updates in an isolated environment produce version combinations nobody has tested.

Stand up a replica of the environment outside the boundary for testing. The whole stack is open source and self-hostable, so a non-isolated staging environment with identical versions costs little and catches most upgrade problems before they reach a place where rollback is a scheduled event.

Automate maintenance from day one. Compaction, snapshot expiration, and orphan file cleanup on schedules, with alerting when they fail. In cloud deployments a managed service covers for you when a job breaks. Here nothing does.

Monitor small-object latency on the storage layer specifically. Metadata operations degrade before data operations do, and planning time is the leading indicator.

Document the transfer procedure as an operational runbook with a named owner, not as a project artifact. Cross-zone transfer is a recurring operation, and the person who built it will not always be the person running it.

Keep an inventory of every component version and its known vulnerabilities, refreshed on each transfer cycle. Air-gapped does not mean unexposed. It means slower to fix.

## A phased build plan

Standing this up in order saves rework. The sequence below reflects what goes wrong when teams do it out of order.

**Phase one: prove the transfer path.** Before any lakehouse component exists, move a container image and a JAR through your gate end to end and time it. If that takes four weeks, every subsequent decision changes. Teams that skip this discover their patch cadence after they have chosen components that need frequent patching.

**Phase two: certificates and identity.** Get your internal certificate authority trusted by a plain Java client, a Python client, and a container. Get an OIDC token from your internal issuer and validate it. Neither of these involves Iceberg, and both block everything that follows.

**Phase three: object storage with a real durability configuration.** Erasure coding across nodes, versioning on, server-side encryption configured, lifecycle policy defined. Then run a small-object benchmark that mimics manifest reads, not a large-file throughput test.

**Phase four: catalog with its backing database.** Stand up the relational store on infrastructure your DBA team already backs up. Bootstrap the catalog, capture the root credentials into your secret manager, and build the role structure before any table exists.

**Phase five: one engine, one table, vended credentials.** Read a table with an engine whose own identity has no storage permissions at all. If the read succeeds, the security model is real. If it fails, you learn that now rather than during an audit.

**Phase six: maintenance automation.** Compaction, snapshot expiration, orphan cleanup, and catalog backup, all scheduled with alerting, before production data lands. This is the phase most likely to be deferred and most expensive to add later.

**Phase seven: cross-zone transfer, if required.** Build it against a test table with a full snapshot history and verify that the destination reproduces the source exactly, including time travel to an old snapshot.

Only then bring production workloads across.

## Capacity and sizing without elasticity

The absence of autoscaling changes how you plan, and the numbers that matter are different from the cloud equivalents.

Storage sizing needs three multipliers on top of your raw data estimate. Erasure coding or replication overhead, typically somewhere between 1.3x and 2x depending on the scheme. Snapshot retention overhead, which on update-heavy tables reaches 2x or more before expiration runs. And headroom, because expanding an on-premises cluster is a procurement cycle rather than an API call. Plan the physical footprint at least two years out.

Compute sizing follows the peak rather than the average, and the peak in analytics is rarely where teams expect. Month-end close, regulatory reporting deadlines, and model retraining cycles all produce spikes an order of magnitude above the daily norm. Size for those, then decide deliberately whether some workloads queue instead.

The catalog is the component people undersize. Every query plan on every engine hits it. Two instances behind a load balancer with a properly sized backing database is the floor, and the database needs connection headroom for the concurrency your engines actually generate.

Network between compute and storage is the constraint that surprises cloud-native teams. In a cloud, that bandwidth is somebody else's problem. On your own hardware it is a specific number, and a scan-heavy workload saturates it. Measure the aggregate read throughput your engines demand at peak and compare it against what the fabric provides before buying either side.

## AI workloads inside the boundary

The reason these deployments matter more in 2026 than they did in 2023 is that the workloads pushing hardest on isolated environments are AI workloads.

Regulated organizations want to run models against their own data without that data leaving the boundary. The lakehouse is where the data sits, so the model serving, the retrieval layer, and the agent tooling all have to run inside the same perimeter.

Three architectural notes hold up in these environments.

Local inference means the model weights and the serving infrastructure are components in your artifact bundle like everything else, with the same patch latency and the same version pinning discipline. Model updates go through the transfer gate.

Retrieval over lakehouse tables works the same isolated as connected, since embeddings and vector search run against files in your object store. The V4 typed statistics work is relevant here, since it opens the metadata layer to approximate nearest neighbor information rather than only scalar bounds.

Governed access matters more, not less, for agent consumers. An agent issuing queries at machine speed against regulated data needs the same catalog authorization, the same short-lived credentials, and the same audit trail as a human, applied per request. Isolated environments often have the strictest audit requirements and the least tolerance for a shared service account, which makes credential vending and identity propagation the load-bearing part of the design rather than a refinement.

The pattern that works is the same one that works in the cloud: put the governance in the catalog and the semantics in a shared layer, so that every consumer, human or otherwise, goes through one enforcement point. The isolation constraint does not change the design. It just removes the option of outsourcing any of it.

## Where this goes

Relative path support landing broadly is the change that most improves this architecture. It turns cross-zone replication from a metadata rewrite into a copy operation.

The REST catalog protocol continuing to standardize helps too, since capability negotiation lets a mixed fleet of engines at different patch levels share tables safely. In an environment where engines update on different transfer schedules, that is not a convenience.

The S3-compatible storage field is consolidating around Apache-licensed options after MinIO's shift, and the projects filling that space are maturing quickly. Re-evaluate on a schedule rather than making a permanent choice today.

## Conclusion

An air-gapped Iceberg lakehouse is the same architecture as a cloud one with different implementations of each layer. S3-compatible storage you run, a REST catalog you host, an engine you deploy, and a table format that is a specification rather than a service.

The layering is what makes it possible. The operational work is what makes it hard, and that work does not shrink because the environment is isolated. It grows, because the maintenance a managed service performed invisibly is now scheduled by you, and patching is measured in weeks rather than hours.

Choose components for patch history over benchmarks. Design the update path before the data path. Get certificates and path-style addressing right on day one. Automate maintenance immediately. Back up the catalog database like the critical component it is. And transfer complete snapshots, never partial ones.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and deployment. *Architecting an Apache Iceberg Lakehouse* covers the layered design, storage and catalog selection, and the operational practices these deployments depend on, and *Apache Polaris: The Definitive Guide* covers the self-hosted catalog in depth. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
