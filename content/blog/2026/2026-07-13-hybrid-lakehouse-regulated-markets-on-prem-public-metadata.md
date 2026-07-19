---
title: "Hybrid Lakehouse Design for Regulated Markets"
date: "2026-07-13"
description: "An in-depth exploration of hybrid lakehouse design for regulated markets"
author: "Alex Merced"
category: "Data Lakehouse"
tags:
  - Hybrid Lakehouse
  - Regulated Markets
  - Data Engineering
canonical: "https://iceberglakehouse.com/posts/hybrid-lakehouse-regulated-markets-on-prem-public-metadata/"
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/hybrid-lakehouse-regulated-markets-on-prem-public-metadata/).

A bank, a hospital network, and a defense contractor walk into a cloud migration and all three stop at the same wall: their data is not allowed to move. Not "would be inconvenient to move." Not allowed. A regulator, a national data residency law, or a contractual sovereignty clause says the bytes must stay inside a specific facility, jurisdiction, or network boundary. For teams in these positions, the standard advice to centralize everything in a public cloud data platform is a non-starter, and no amount of enthusiasm about analytics changes that.

The good news is that the lakehouse pattern does not actually require centralization. What it requires is open table formats, an open catalog, and an engine that can query data where it lives. Once you separate those ideas from "put it all in one cloud account," a hybrid design becomes possible: keep regulated data on-prem in private object storage, expose only the metadata and views that policy permits, and let governed analytics run against curated surfaces. This article walks through that design, its moving parts, and its honest limits.

## Why Regulated Data Cannot Always Move

Start with why the wall exists, because the design choices only make sense against the real constraints.

**Data residency and sovereignty.** Many jurisdictions require that certain categories of data physically reside within national borders and remain subject to local law. Financial records, health data, and citizen data are common examples. Sovereignty rules can go further and restrict which entities may operate the infrastructure, not just where it sits. A cloud region inside the right country is sometimes still insufficient if the operator is a foreign company subject to foreign legal process.

**Air-gapped and semi-connected environments.** Some networks have no direct internet path by design. Others have narrow, monitored, intermittently available links. A data architecture that assumes constant connectivity to a cloud control plane simply does not run in these environments. Anything that phones home to validate a license, fetch metadata, or check policy on every operation becomes a single point of failure or a compliance violation.

**Operational and access restrictions.** Beyond where data lives, regulated environments constrain who can touch it and how. Privileged access may require named individuals, background checks, and physical presence. Network egress may be blocked or logged at a level that makes casual data movement impossible. Change control may require sign-off that turns a "quick sync to the cloud" into a multi-week approval.

The consequence is that the usual centralization playbook inverts. You cannot bring the data to the compute in someone else's cloud. You have to bring governed access to the data where it already sits, and you have to design metadata and policy for a world where the network is not always there. That is the frame for everything below.

There is a second-order effect that catches teams off guard. When you cannot centralize, you also cannot rely on the convenient assumption that one system holds the single source of truth. Your regulated data lives in one boundary, some derived or less sensitive data may live elsewhere, and there is no single database that sees all of it. This is not a temporary state you will fix later. It is the permanent shape of a regulated hybrid environment, and the architecture has to treat "data lives in several places under different rules" as the starting condition rather than a problem to eliminate. Once you accept that, federation and metadata governance stop being nice-to-haves and become the load-bearing parts of the design.

## On-Prem Object Storage with Open Table Formats

The foundation of a private lakehouse is S3-compatible object storage running inside your boundary. Two mature options are [MinIO](https://min.io/docs/) and [Ceph](https://docs.ceph.com/en/latest/radosgw/), both of which present an S3 API that the rest of the ecosystem already understands. Because the S3 API is the lingua franca of the lakehouse, tools that expect S3 generally work against MinIO or Ceph without special handling. That compatibility is the whole point: it lets you keep the open ecosystem while the bytes never leave the building.

On top of that storage you use [Apache Iceberg](https://iceberg.apache.org/spec/) as the table format. Iceberg tables are just data files plus metadata files in object storage, which means an Iceberg table can live entirely inside a private storage zone. There is nothing in the format that requires a cloud service. The metadata that describes snapshots, schema, and partitioning is itself stored as files alongside the data, so a fully air-gapped Iceberg table is a normal thing, not a workaround.

The openness of the format is what makes this durable rather than a clever hack. Because Iceberg is an open specification and the files sit in plain object storage, an auditor can inspect them with standard tools, and you are not dependent on a single vendor's software remaining available to read your own data years from now. For regulated organizations with long retention requirements, that independence is not a philosophical preference. It is a practical hedge against the day a vendor changes terms, gets acquired, or discontinues a product. The data stays readable because the format that describes it is open and the storage that holds it is yours.

A useful mental model is storage zones. You can carve your private environment into zones with different sensitivity levels and different network reachability. A restricted zone holds the most sensitive tables and has the tightest network policy. A curated zone holds derived, filtered, or aggregated tables that are cleared for wider analytical use. Data flows from restricted to curated through controlled, audited processes, and only the curated zone is reachable by downstream analytics. The raw regulated data never becomes directly queryable by a broad audience, even inside the organization.

This zoning matters because "on-prem" is not automatically "safe." Putting sensitive data in a private data center and then letting every analyst query it directly recreates the original risk in a different location. The zones, and the policy between them, are what make on-prem storage a governed lakehouse rather than a private free-for-all.

A practical detail that people underestimate is the promotion process between zones. Moving a table from the restricted zone to the curated zone is not a copy. It is a transformation that applies the rules: it filters or removes rows that must not be exposed more widely, masks or drops columns that carry sensitive identifiers, and aggregates where raw values are too revealing. That transformation is itself a governed, audited job, and it is where a lot of the real compliance work lives. If the promotion step is sloppy, the curated zone quietly inherits sensitive data it was never supposed to hold, and the zoning becomes theater. Treat the promotion job with the same review rigor you would apply to publishing data externally, because in effect that is what it is: publishing regulated data to a wider internal audience.

The other reason zones earn their keep is failure containment. If a credential leaks or a policy is misconfigured, the blast radius is bounded by which zone that identity could reach. An analyst identity that only ever touches the curated zone cannot expose raw regulated records even if its credentials are stolen, because the raw records are not reachable from where that identity operates. Designing for the assumption that something will eventually be misconfigured is more realistic than assuming perfect policy, and zoning is how you make the inevitable mistake survivable.

## Catalog Patterns with Nessie and Polaris

A table format needs a catalog to track which tables exist and where their current metadata lives. In an open lakehouse, that catalog speaks a REST protocol so multiple engines can share it. Two relevant open catalogs are [Project Nessie](https://projectnessie.org/), which adds Git-like branching and versioning to Iceberg metadata, and [Apache Polaris](https://polaris.apache.org/), a REST catalog implementation for Iceberg. Dremio's Open Catalog is built on Apache Polaris, which means the catalog layer is a shared open-source project rather than a proprietary lock-in point.

For regulated environments the catalog is where several hard requirements land, so treat it as a governance surface and not just a lookup table.

**Write authority stays local when the rules require it.** In many regulated setups, the authority to commit a new snapshot to a table must remain inside the boundary that owns the data. You do not want a remote control plane to be the thing that can mutate your regulated tables. Keeping the catalog that holds write authority local, inside the same trust zone as the data, satisfies this. Reads and metadata exposure can be handled separately and more permissively.

**Branching supports approval workflows.** A catalog with branching lets you stage changes on a branch, run validation and review, and only merge to the main branch after approval. In a regulated context this maps naturally onto change control: nothing becomes the official version of a table until a reviewer signs off, and the branch history is an audit artifact.

**The catalog is an access decision point.** What a given identity is allowed to see and do is decided with reference to the catalog and the policies attached to it. This is the same idea as the storage zones, expressed at the metadata layer: the catalog knows which tables are restricted and which are curated, and it can refuse to hand out metadata that a caller is not entitled to.

A subtle but important consequence of the REST-catalog design is that multiple engines can share the same table metadata without each one maintaining its own copy. In a regulated setting this reduces the number of places where sensitive metadata is duplicated, which is a genuine security benefit, because every copy is another thing to secure and audit. It also means the catalog becomes a natural chokepoint for policy. Rather than trying to enforce access rules in five different query tools, you enforce them once at the catalog and the query layer, and every engine that reads through them inherits the same rules. Consolidating the decision point is easier to reason about and easier to prove to an auditor than a scattered set of per-tool permissions that may or may not agree with each other.

The honest tradeoff with a shared catalog is availability. If the catalog is the single point through which all engines resolve table metadata, then the catalog's uptime and its network reachability become critical. In an air-gapped or semi-connected environment you have to design for the catalog being local and resilient, and you cannot lean on a remote managed catalog that assumes constant connectivity. This is a real constraint, and it is the reason keeping the authoritative catalog inside the boundary is not just a compliance preference but an operational necessity.

## Cross-Region Metadata Without Data Leakage

Here is where hybrid designs get genuinely tricky, and where a lot of naive implementations leak information without realizing it. Suppose you want a central team, or a second region, or a semi-connected analytics environment to know that certain data exists and to query approved views of it. You want to replicate some metadata outward. The danger is that metadata itself can be sensitive.

Think about what lives in table metadata. Table names can reveal the existence of a program or an investigation. Column names can disclose what you collect about people. Partition values can leak the very facts you are trying to protect: a table partitioned by `patient_country` or `case_classification` exposes the distribution of those values in its partition metadata even if no data rows ever leave. Min and max statistics in Iceberg metadata can reveal ranges, such as the earliest and latest dates in a sensitive dataset. So "we only replicated metadata, not data" is not automatically safe.

This is a failure mode that even careful teams walk into, because metadata feels harmless. It is small, it is not "the data," and the tooling replicates it almost for free. But an adversary who learns that a table named `active_investigations_2026` exists, partitioned by `subject_region`, has learned a great deal without reading a single row. Partition metadata alone can reveal which regions have active cases and roughly how many, because Iceberg tracks per-partition file and record counts. Statistics compound this: a min and max on a date column outlines exactly when activity started and stopped. The lesson is to treat metadata as data for classification purposes. If a table's mere existence or shape is sensitive, its metadata must not cross the boundary, and the thing you expose outward is a curated projection with a neutral name and only the columns cleared for exposure.

The discipline for cross-boundary metadata is minimization and control:

- **Replicate only allowed metadata.** Decide explicitly what may cross the boundary. Often that is a curated subset: sanitized table names, approved column lists, and the location of cleared views, not the raw metadata of restricted tables.
- **Avoid leaking sensitive identifiers and partition values.** If a table name, column name, or partition value is itself regulated, it must not appear in anything that leaves the boundary. This sometimes means exposing a renamed, curated projection rather than the source table's real metadata.
- **Sign metadata snapshots.** Use cryptographic signing so a remote consumer can verify that a metadata snapshot is authentic and unmodified. In semi-connected environments where you cannot re-validate against a live source, a signature is how you trust a snapshot you received earlier.
- **Require explicit approval workflows.** Metadata that crosses a boundary should do so through a reviewed process, not automatically. Branch-and-merge in the catalog gives you a place to enforce this.
- **Keep audit logs on both sides.** Record what metadata was exposed, to whom, and when, in both the source and the destination.

Here is a compact way to map regulated requirements to design responses. The point of the table is to make the mapping explicit so no requirement is silently unaddressed.

| Regulated requirement | Lakehouse design response |
| --- | --- |
| Data must physically reside in-boundary | Iceberg tables on on-prem MinIO or Ceph; raw data never replicated out |
| No constant internet connectivity | Signed metadata snapshots and local write authority; no per-operation control-plane dependency |
| Sensitive names or partition values must not leak | Metadata minimization; expose curated projections, not raw table metadata |
| Changes require sign-off | Catalog branching plus approval workflow before merge to main |
| Access must be least-privilege and logged | Fine-grained row and column policy plus full audit trail at the query engine |
| Write authority must stay with the data owner | Local catalog holds write authority; remote consumers get read-only, filtered views |

## Federated Read-Only Gateways for Analytics

Once regulated data sits in governed zones with controlled metadata, the question is how analysts, applications, and agents actually query it. The answer is a federated, read-only gateway: a query surface that reaches the curated data, enforces policy, and exposes results, without giving anyone a direct pipe to raw storage.

The gateway is where several controls converge. It authenticates the caller and resolves their identity. It applies row filters so a caller sees only the rows their policy permits. It applies column masking so restricted fields are hidden or obfuscated even within tables the caller can otherwise read. It enforces rate limits and egress restrictions so a single query cannot pull an unbounded volume out of the environment. And it logs everything.

Agentic clients deserve special mention because they are becoming a primary consumer and they are easy to over-trust. An agent should receive restricted tools, not broad raw SQL access. This is the same principle that applies to human callers, amplified. An agent acts quickly, at scale, and can be manipulated by content it reads through prompt injection. If an agent's only access to regulated data is through a handful of narrow, parameterized, policy-enforced tools, then the worst it can do is bounded by those tools. If the agent has open SQL against curated tables, the worst case is much larger and depends on your prompt hygiene, which is not a control you want to rely on for compliance. Enforce the boundary in the engine, not in the instructions.

The federated part matters because regulated organizations rarely have all their data in one system. There is on-prem Iceberg for the regulated core, plus operational databases, plus perhaps some cleared data in a cloud region for less sensitive workloads. A federated gateway can present a unified query surface across these without physically consolidating them. Query in place, apply policy per source, and return only what is allowed.

Federation also solves a subtler problem: it lets analysts and agents work against current data rather than a stale copy. The alternative to querying in place is copying data into an analytics store on a schedule, which means every copy is out of date the moment it lands and every copy is another place the data can leak. In a regulated environment, minimizing copies is both a security win and a freshness win. The gateway queries the source at query time, so the answer reflects the source as it is now, and there is no secondary dataset sitting around waiting to be misgoverned. There is a performance tradeoff here, since querying remote or on-prem sources in place can be slower than reading a local pre-aggregated copy, and I will not pretend otherwise. The usual resolution is to accelerate the hot, frequently asked queries with materialized results or caching while keeping the raw path federated, so you get freshness where it matters and speed where it is needed.

The gateway is also the right place to enforce egress limits, which are easy to forget until an incident forces the question. A federated read-only gateway can cap how many rows or bytes leave the environment per query and per identity, and it can block result patterns that look like bulk extraction. This is a different control from row and column policy. Row and column policy decides what a caller may see; egress limits decide how much of it they may pull out at once. Both matter, because a caller who is legitimately allowed to see a curated dataset might still not be allowed to export the whole thing in one pass. Designing egress limits into the gateway from the start is far easier than retrofitting them after a data-loss review demands them.

## Why This Supports the Agentic Lakehouse Direction

The pattern in this article is deliberately vendor-neutral: open storage, open table format, open catalog, and a policy-enforcing gateway. That openness is the protection. It means you are not betting your regulated data on a single vendor's continued cooperation, and it means an audit can inspect standard formats rather than a black box.

Within that open pattern, [Dremio](https://www.dremio.com/) fits regulated hybrid environments well because its core capabilities are query federation and governed access over open standards rather than data movement. A few pieces line up directly. Query federation lets a single governed surface reach on-prem Iceberg, operational sources, and cloud data in place, which is exactly what a hybrid regulated design needs. Open Catalog built on Apache Polaris keeps the catalog layer on a shared open-source foundation. Fine-grained access control enforces row filters and column masking at the engine, where the gateway design says security belongs. A semantic layer of views, wikis, and labels lets you expose curated, certified projections instead of raw regulated tables. And the same open-source MCP server that connects agents to governed data gives agentic clients the restricted-tool access pattern rather than broad SQL. The [federation and virtualization discussion](https://www.dremio.com/blog/why-agentic-analytics-requires-federation-virtualization-and-the-lakehouse-how-dremio-delivers/) covers this in more depth.

One honest limitation, stated plainly: no platform solves compliance by itself. Dremio, MinIO, Ceph, Iceberg, Nessie, and Polaris are components you assemble into a compliant design. They enforce the controls you configure, but the decisions about which data is restricted, what metadata may cross a boundary, and who may see what remain yours, made with your compliance and legal teams. A query engine can enforce a row filter; it cannot tell you what the row filter should be. Treat the technology as the mechanism and the governance decisions as the substance.

## Where to Start

If your data cannot move, do not treat that as a reason to skip the lakehouse. Treat it as a constraint the architecture already accommodates. Put regulated data on private S3-compatible storage as Iceberg tables, keep write authority and the most sensitive metadata inside the boundary, minimize and sign anything that crosses a line, and query everything through a read-only gateway that enforces policy in the engine.

To see how federated query, an open catalog on Apache Polaris, fine-grained access control, and a semantic layer come together over data that stays where it lives, start a project at [dremio.com/get-started](https://www.dremio.com/get-started) and connect a governed view to sources you cannot centralize.
