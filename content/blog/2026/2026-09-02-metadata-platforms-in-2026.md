---
title: "Metadata Platforms in 2026: DataHub, OpenMetadata, Atlan, and Catalog Convergence"
date: "2026-09-02"
description: "How the technical catalog and the metadata platform are converging in 2026, and how to arrange the two layers for a lakehouse."
author: "Alex Merced"
category: "Data Governance"
tags:
  - DataHub
  - OpenMetadata
  - Atlan
  - Metadata
  - Catalogs
  - Polaris
canonical: https://iceberglakehouse.com/posts/metadata-platforms-in-2026/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/metadata-platforms-in-2026/).

The word "catalog" has meant two different things in data infrastructure for about a decade, and in 2026 the two are colliding.

The first meaning is the technical catalog: the service that maps a table name to its current metadata file and provides the atomic swap that makes commits safe. Apache Polaris, AWS Glue, Databricks Unity Catalog, Nessie, and every other Iceberg REST catalog implementation are technical catalogs. They are in the write path. A query engine cannot read or commit to a table without one. They know what tables exist, where they are, what schema they have, and who is allowed to touch them, because they have to.

The second meaning is the metadata platform, also called a governance catalog or a data catalog: the system where people search for data, read descriptions, trace lineage across pipelines and dashboards, apply classifications and ownership, and manage glossaries and policies. DataHub, OpenMetadata, Atlan, Collibra, and Alation are metadata platforms. They are not in the write path. They observe the technical catalogs, the pipelines, the BI tools, and the databases, ingest what they find, and build a graph over it.

For most of their history the two layers were cleanly separate: technical catalogs held the truth about tables and metadata platforms held the context around them. Two developments have blurred that line. Technical catalogs, Polaris and Unity Catalog in particular, are adding governance features such as policies, tags, and lineage that were the metadata platform's territory. And metadata platforms are adding technical catalog features: DataHub shipped an Iceberg REST catalog implementation in 2025, so a DataHub instance can be the service an engine commits through. Apache Gravitino sits between the two, federating technical catalogs behind one interface.

This article covers what each layer does, where the four major metadata platforms stand as of mid-2026, what convergence means in practice, and how an Iceberg lakehouse should arrange the two layers so that the technical catalog stays the source of truth and the metadata platform stays the place people look. I work at Dremio, whose catalog is built on Polaris, and the analysis here applies to any technical catalog.

## How the Two Layers Came Apart, and Why They Are Coming Back

The split is historical rather than principled, and knowing the history explains the convergence.

The Hive Metastore was both catalogs for a decade. It held table locations and schemas for engines, and it was where people looked to find out what tables existed. It was a poor discovery tool, so companies built better ones on top: LinkedIn's WhereHows and then DataHub, Uber's Databook and then OpenMetadata, Lyft's Amundsen, Netflix's Metacat. These crawled the metastore and the warehouses and built a searchable graph. The metadata platform category was born as a layer over the metastore, because the metastore was not going to become a good catalog for humans.

The metastore was also a poor technical catalog for a multi-engine, object-storage world, and Iceberg's REST catalog specification replaced it with an HTTP contract that any engine implements once. The new technical catalogs, Polaris, Unity, Glue's REST endpoint, Nessie, Gravitino, are built for that contract and for credential vending, and they are designed by people who watched the metastore fail at governance. So they ship with roles, grants, and policies from the start.

Meanwhile the metadata platforms had a decade to mature discovery, lineage, and workflow, and to notice that their users kept asking for enforcement: if a steward classifies a column as sensitive, why does the platform not mask it? The answer was that the platform was not in the write path, and the fix was either to push decisions down to the systems that are, or to become one. DataHub chose to become one, for Iceberg. The others chose to push down.

The result is two layers that were separated by the limitations of one old system and are reconverging because the new systems on both sides are better. Whether they fully merge depends on whether the technical catalogs are willing to take on discovery and workflow, which are large and not their focus, and whether the platforms are willing to take on write-path availability, which is a different kind of engineering. The likeliest outcome is that they stay two layers with much better integration between them, and that the "which catalog" question becomes "which pair."

## What the Two Layers Actually Do

The separation is easier to see as a list of responsibilities.

A technical catalog is responsible for:

- Mapping identifiers to metadata locations, with atomic compare-and-swap on commit.
- Namespaces, and the tables and views within them.
- Access control on those objects, and, for REST catalogs, vending scoped storage credentials so that engines never hold long-lived keys.
- Table-level policies where implemented: maintenance schedules, retention, allowed locations.
- Answering engine requests in the query path, at query-path latency.

A metadata platform is responsible for:

- Discovery: search across every data asset an organization has, with descriptions, tags, owners, and usage signals.
- Lineage: which pipeline produced which table from which sources, and which dashboards read it, at table and column grain, across systems.
- Business context: glossaries, domains, classifications, data products, and the mapping from technical names to business terms.
- Governance workflows: ownership assignment, certification, access requests, policy documentation, compliance evidence.
- Quality and observability signals aggregated from the tools that produce them.
- Serving all of this to humans through a UI and, increasingly, to agents through an API.

The technical catalog's knowledge is narrow and authoritative. The metadata platform's knowledge is broad and derived. A table's schema in the technical catalog is the schema. The same schema in the metadata platform is a copy, ingested on a schedule, possibly stale by an hour. That asymmetry is the reason the layers exist and the reason convergence is complicated.

## The Metadata Platforms in 2026

### DataHub

DataHub started at LinkedIn as the successor to WhereHows and became a top-level open-source project with a commercial company behind it, which rebranded from Acryl Data to DataHub. Its architecture is a metadata graph with a streaming ingestion backbone: metadata change events flow through Kafka into a graph store and a search index, and every entity, table, dashboard, pipeline, user, is a node with aspects that can be extended.

**Strengths.** The most programmable of the platforms. A strong metadata model with well-defined entity types and aspects, a Python SDK and a GraphQL API that expose all of it, and a large connector library that covers warehouses, lakes, orchestrators, BI tools, and dbt with column-level lineage where the source provides it. Real-time ingestion through the event stream rather than batch crawls. The community is the largest of the open-source options.

**The Iceberg REST catalog.** In 2025 DataHub shipped an implementation of the Iceberg REST catalog specification inside the platform. A DataHub instance can serve as the technical catalog: engines create, load, and commit Iceberg tables through DataHub's REST endpoint, DataHub stores the metadata pointer and vends credentials, and the same entity that engines commit through is the one users search and annotate. This collapses the two layers into one system for Iceberg tables specifically. It is the most consequential feature any metadata platform has shipped for lakehouse teams, and it is also new enough that operational maturity is worth verifying before committing production tables to it.

**Commercial.** DataHub Cloud adds hosting, observability features, and enterprise governance on top of the open-source core.

**Fit.** Teams that want a programmable metadata graph, are comfortable operating Kafka and a search cluster (or paying for the cloud), and, increasingly, teams that want one system to serve as both catalog layers for Iceberg.

### OpenMetadata

OpenMetadata came from the team behind Uber's Databook and was built around a schema-first design: every entity type has a JSON schema, the API is generated from those schemas, and the whole platform is defined by its standards document. It joined the Linux Foundation in March 2026, which put its governance under a neutral foundation, and released its standards specification v1.13 in April 2026.

**Strengths.** The broadest connector ecosystem of the open-source options and the simplest architecture: a server, a database, and a search index, with no streaming backbone required. Discovery, column-level lineage, a data quality module with profiling and test cases built in, classification, and glossaries in one deployment. The MCP server, which exposes the catalog's entities and lineage as tools an LLM agent can call, was an early and complete implementation of the pattern every platform now has.

**Iceberg.** OpenMetadata ingests from Iceberg catalogs, including REST catalogs, Glue, Hive, and Nessie, as metadata sources. It reads schemas, partition specs, properties, and snapshot-level statistics and represents them in the graph. It does not serve as a technical catalog. Tables are committed through Polaris or another catalog and OpenMetadata observes them.

**Commercial.** Collate offers hosted OpenMetadata with AI agents for documentation, quality, and governance layered on top.

**Fit.** Teams that want the stewardship workflow in one package, a lighter operational footprint than DataHub, and a foundation-governed open-source project. The quality module in particular reduces the need for a separate validation tool on tables that OpenMetadata already profiles.

### Atlan

Atlan is a commercial metadata platform positioned as the collaboration layer over the stack, with a strong emphasis on the user experience for analysts and business users rather than only for engineers.

**Strengths.** Search and personalization that are widely regarded as the best in the category. A large connector library. Active-metadata features where changes in one system trigger actions in another: a tag applied in Atlan propagates to the warehouse, a schema change in the warehouse triggers a notification to downstream owners. Deep integrations with the modern stack, dbt, the orchestrators, and the BI tools. Column-level lineage across all of it.

**Iceberg.** Atlan ingests Iceberg table metadata from Unity Catalog, Glue, Snowflake, and the REST catalogs, and represents lakehouse tables alongside everything else. It is an observer, not a technical catalog.

**Commercial only.** There is no open-source Atlan. Pricing is enterprise.

**Fit.** Organizations with many non-engineer consumers of the catalog, budget for a commercial platform, and a stack Atlan already integrates with. The polish is the product.

### Collibra and Alation

Both are enterprise governance platforms that predate the modern stack and have adapted to it. Collibra's emphasis is governance and compliance, with tooling for regulations such as the EU AI Act and ISO 42001, and its strength is workflow: approval chains, policy management, and audit evidence. Alation's emphasis is the catalog for analysts, with query-log-driven usage signals and a pivot toward agentic automation of stewardship tasks. Both ingest lakehouse metadata through connectors, neither is a technical catalog, and both are enterprise-priced. They are the right choice for regulated organizations where governance workflow is the requirement and the lakehouse is one of many systems.

## Comparison

| | DataHub | OpenMetadata | Atlan | Collibra / Alation | Polaris | Unity Catalog | Gravitino |
|---|---|---|---|---|---|---|---|
| Layer | Metadata platform, plus technical catalog for Iceberg | Metadata platform | Metadata platform | Governance platform | Technical catalog | Technical catalog growing up | Federation over technical catalogs |
| Open source | Yes, plus DataHub Cloud | Yes, Linux Foundation, plus Collate | No | No | Yes, Apache | Yes, LF AI & Data, plus Databricks-hosted | Yes, Apache |
| In the write path | For Iceberg tables, optionally | No | No | No | Yes | Yes | Yes, as a proxy |
| Discovery and search | Strong | Strong | Best in category | Strong, analyst-focused | Minimal | Basic | Basic |
| Cross-system lineage | Column-level, event-driven | Column-level | Column-level, active metadata | Column-level | None | Within Databricks | None |
| Glossary and domains | Yes | Yes | Yes | Extensive | No | Tags only | No |
| Quality module | Ingests results, assertions | Built-in profiling and tests | Ingests results | Ingests results | Policies | Monitoring in hosted version | No |
| Access enforcement | No, except via Iceberg catalog mode | No | No, pushes to systems | Workflow, not enforcement | Yes, with credential vending | Yes | Delegates |
| Agent API | MCP server, GraphQL | MCP server, SDK | MCP and API | API, AI features | REST for engines | REST, MCP in hosted | REST |
| Operational footprint | Kafka, graph store, search, or Cloud | Server, DB, search, or Collate | SaaS | SaaS or enterprise deployment | Server and metastore | Server and metastore | Server and metastore |

The table makes the division visible. The right three columns enforce. The left five describe. DataHub is the one that does both, for one table format.

## The Technical Catalogs Reaching Up

The convergence runs in both directions. The technical catalogs are adding what the metadata platforms had.

**Apache Polaris** graduated as an Apache top-level project in February 2026. Beyond the core catalog functions, it has added a policy framework for attaching maintenance and governance policies to catalogs, namespaces, and tables, catalog federation for presenting external catalogs' tables, and role-based access control with grants at each level. It is Iceberg-only by design. It does not do discovery, business glossaries, or cross-system lineage, and it is not trying to.

**Unity Catalog.** Databricks open-sourced Unity Catalog in 2024, and the open-source version has grown to cover tables in Delta and Iceberg, volumes for unstructured data, functions, and models, with an Iceberg REST endpoint for external engines. The Databricks-hosted version adds lineage, tags, and governance features that overlap with the metadata platforms. Unity is the clearest case of a technical catalog growing toward being a full catalog, and the open-source and hosted versions differ substantially in how far along that path they are.

**Apache Gravitino.** Gravitino, which came from Datastrato and is an Apache project, is a federation layer: it presents one metadata API over many technical catalogs (Hive, Iceberg REST, JDBC, Kafka, object storage) and supports Iceberg's REST catalog interface itself so that engines can commit through it. It is the piece that lets an organization with Polaris in one cloud, Glue in another, and Hive on-premises present one namespace tree. It also covers unstructured data and AI assets, which most technical catalogs ignore.

**AWS Glue, Snowflake Horizon, Google's catalog, Microsoft Purview.** Each cloud's catalog has grown lakehouse and governance features. Glue serves an Iceberg REST endpoint and integrates with Lake Formation for permissions. Horizon is Snowflake's governance layer over its own and external Iceberg tables. Purview is Microsoft's governance platform that has absorbed Fabric's catalog. All are strongest inside their own platform.

The pattern is that every technical catalog now has tags, ownership, some lineage, and access policies, and every metadata platform now ingests from every technical catalog. What none of the technical catalogs has is cross-system lineage into orchestrators and BI, glossaries and domains, or the stewardship workflow. What none of the metadata platforms has, except DataHub for Iceberg, is a place in the write path.

## What Convergence Means in Practice

Three architectures are emerging, and which one fits depends on how much of an organization's data lives in Iceberg and how much governance workflow it needs.

**Two layers, cleanly separated.** A technical catalog (Polaris, Unity, Glue) in the write path. A metadata platform (DataHub, OpenMetadata, Atlan) ingesting from it and from everything else. Users search in the platform and click through to the table. Engineers commit through the catalog. Governance decisions made in the platform, such as a classification or an access rule, are pushed down to the catalog through the platform's active-metadata features or through automation. This is the current majority architecture and the safest.

**Three layers, with federation.** The same two layers plus Gravitino between them, presenting many technical catalogs as one. For multi-cloud or hybrid organizations that have several technical catalogs and do not want to consolidate them. The metadata platform ingests from Gravitino rather than from each catalog. The cost is one more system in the query path.

**One layer, for Iceberg.** DataHub as both the technical catalog and the metadata platform. Engines commit through DataHub's REST endpoint. The entity that gets committed to is the entity that gets searched, described, and traced. Non-Iceberg assets are still ingested and observed. This is the newest option and the most integrated, and it puts the metadata platform in the write path with everything that implies for availability and latency.

The question to ask about any of the three is where the truth lives. In the two-layer design it lives in the technical catalog and the platform is a view. In the one-layer design the two are the same system. The failure mode of the two-layer design is drift: the platform says the table has twelve columns and the catalog says thirteen. The failure mode of the one-layer design is coupling: a platform outage is a catalog outage.

## Data Products, Domains, and the Lakehouse

The metadata platforms have absorbed the vocabulary of data mesh: domains that own data, data products that are published with contracts, and a marketplace where consumers find them. Whether or not an organization adopts the full mesh model, the vocabulary maps onto an Iceberg lakehouse cleanly and is worth using.

A domain is a namespace, or a tree of them, in the technical catalog, with ownership and access grants at the namespace level. Polaris roles granted on a namespace, Unity's schema-level grants, and Glue's database-level Lake Formation permissions all express "this team owns this set of tables." The metadata platform's domain entity points at those namespaces and adds the owner, the description, and the business context.

A data product is a table or a small set of tables with a contract: a schema, the checks that are guaranteed, a freshness commitment, and an owner who answers for it. On Iceberg the schema is the table's schema, the checks are the validation that gates its `main` branch, the freshness commitment is a monitor on its snapshot timestamp, and the owner is a property. The metadata platform's data product entity bundles these and marks the product certified. The contract itself, in the Open Data Contract Standard or the platform's own format, is what consumers read.

The marketplace is the platform's search, filtered to certified products, with the access request workflow attached. A consumer finds the product, requests access, the owner approves in the platform, and an automation grants the role in the technical catalog. That last step is where most implementations break: the approval happens in the platform and someone still has to grant the role by hand. The platforms with active-metadata features automate it, and for the others it is a small service that watches approval events and calls the catalog's API.

The Iceberg-specific benefit of this model is that a data product's history is its snapshots. A consumer who found a number in a dashboard last quarter can be pointed at the snapshot that produced it. A product owner who wants to know what changed between certifications has the snapshot diff. The metadata platform holds the product's definition, and the technical catalog holds its every version.

## Lineage: The Feature That Decides the Purchase

Search is table stakes. Lineage is the capability that most often decides which platform an organization picks, and it is also the one where the lakehouse changes the mechanics.

Lineage at the table level says which tables were read to produce which. Column-level lineage says which source columns fed which target columns. The platforms build it from three sources: parsing SQL from query logs and dbt manifests, receiving lineage events from orchestrators and engines through OpenLineage, and, for some systems, native integrations that report lineage directly.

On an Iceberg lakehouse, two more sources exist. The first is the snapshot summary, which can carry lineage properties set by the writer: the job that produced the snapshot, the source snapshots it read, the commit it corresponds to. Engines and pipelines that write `spark.app.id`, dbt invocation IDs, or custom lineage keys into the summary make every snapshot self-describing. The second is v3 row lineage, which gives each row a stable `_row_id` and a `_last_updated_sequence_number`, so that row-level provenance across merges is recoverable from the table itself.

The metadata platforms are starting to read both. DataHub and OpenMetadata ingest snapshot summaries as properties on the table entity, and lineage properties in the summary become edges. OpenLineage events emitted by Spark, Flink, Airflow, and dbt carry the Iceberg snapshot ID in recent versions of the integrations, which links a pipeline run to the specific snapshot it produced. This is the mechanism that answers "which run produced the data the dashboard is showing" precisely rather than approximately.

The practical guidance is to emit lineage at the source. Set summary properties on every commit. Configure OpenLineage on every engine and orchestrator. The platform then has authoritative lineage rather than lineage inferred from parsing SQL, and the inference, which is fragile, becomes a fallback.

## Agents and the Metadata Platform

Every platform shipped an MCP server or an equivalent agent API in the past year, and the reason is that a metadata platform is close to the ideal context source for an agent working with data.

An agent asked "what is our monthly recurring revenue by region" needs to know which table holds revenue, what the region column is called, whether the table is certified, who owns it, and what the glossary says "recurring" means in this organization. That is exactly what the metadata platform holds. Exposing it as tools the agent can call, search for a table, get its schema and description, get its lineage, get the glossary term, is what the MCP servers do.

The metadata platforms are also where agent activity should be recorded. An agent that queries a table is a consumer of it, and its queries are usage signals and potential lineage. Platforms that ingest agent query logs the way they ingest BI tool logs give a complete picture of who reads what, including the non-human readers.

For the technical catalog, the agent question is access. An agent that can call the metadata platform's MCP server to find a table still needs the technical catalog to grant it read access and vend it a credential. Polaris's principal and role model, Unity's grants, and Glue's Lake Formation permissions are where an agent's identity is enforced. The convergence question here is whether the metadata platform's classification (this column is PII) drives the technical catalog's policy (mask it for this role) automatically. Atlan's active metadata and OpenMetadata's policy features both push in this direction, and the catalog policy frameworks are the receiving end.

## Evaluating a Platform for a Lakehouse

Feature checklists for metadata platforms run to hundreds of items. For an organization whose data is mostly in Iceberg, a shorter list decides fit.

**Does it ingest from the REST catalog natively?** Not from Spark's view of the catalog, not from a JDBC connection to an engine, but from the Iceberg REST endpoint, so that every table is seen regardless of which engine reads it and so that partition specs, properties, and snapshot summaries come through intact.

**Does it read snapshot summaries and expose them?** Row counts per commit, operation types, and custom properties are the cheapest observability signal a lakehouse has. A platform that shows only the current schema is discarding most of what the catalog offers.

**Does it accept OpenLineage events with Iceberg facets?** The lineage from engines and orchestrators carries snapshot IDs. A platform that drops the facet loses the link between a run and its output version.

**Can its classifications drive catalog policies?** Either through a native integration with Polaris, Unity, or Glue, or through an event stream that an automation can subscribe to. If a steward's decision cannot reach the write path, governance is documentation.

**Does its agent API respect certification and access?** An MCP server that returns every table to every agent is a discovery tool, not a governance tool.

**What does it cost to run at the estate's size?** Open-source platforms are free to license and real to operate. Commercial platforms are priced per user, per asset, or per connector, and a lakehouse with tens of thousands of tables can be expensive under per-asset pricing.

**Can the metadata leave?** Export in a standard format, an API that returns everything, and no proprietary lineage encoding. The platform market is consolidating, and the metadata is the organization's, not the vendor's.

Two or three of these usually eliminate most candidates for a given organization, and the remaining choice is between similar platforms on user experience and price.

## Walkthrough: Wiring the Two Layers Together

A concrete configuration for the two-layer design, with Polaris as the technical catalog and OpenMetadata as the platform, looks like this.

OpenMetadata ingests from Polaris through its Iceberg connector, configured against the REST endpoint:

```yaml
source:
  type: iceberg
  serviceName: polaris_analytics
  serviceConnection:
    config:
      type: Iceberg
      catalog:
        name: analytics
        connection:
          uri: https://polaris.internal/api/catalog
          credential:
            clientId: ${OM_POLARIS_CLIENT_ID}
            clientSecret: ${OM_POLARIS_CLIENT_SECRET}
        warehouseLocation: analytics
  sourceConfig:
    config:
      type: DatabaseMetadata
      includeTables: true
      includeViews: true
      markDeletedTables: true
sink:
  type: metadata-rest
  config: {}
workflowConfig:
  openMetadataServerConfig:
    hostPort: https://openmetadata.internal/api
    authProvider: openmetadata
```

The ingestion principal in Polaris has a read-only role on the catalog, so OpenMetadata can list namespaces and load table metadata but never commit. On each run it reads every table's schema, partition spec, properties, and current snapshot summary, and updates the corresponding entities. `markDeletedTables` handles tables dropped from Polaris by marking them deleted in the platform rather than leaving stale entries.

Lineage arrives separately, from OpenLineage. Spark jobs are configured with the OpenLineage listener pointed at OpenMetadata's OpenLineage endpoint:

```properties
spark.extraListeners                    io.openlineage.spark.agent.OpenLineageSparkListener
spark.openlineage.transport.type        http
spark.openlineage.transport.url         https://openmetadata.internal/api/v1/openlineage
spark.openlineage.namespace             lakehouse-prod
```

Every Spark job that reads and writes Iceberg tables now emits run events with input and output datasets, and the Iceberg integration includes the snapshot ID in the output dataset's facets. dbt emits the same through its OpenLineage integration. Airflow's OpenLineage provider emits task-level events. The platform stitches them into a graph where a table's lineage node shows the job, the run, and the snapshot.

The pipeline side sets summary properties on commit so that the snapshot carries its own provenance:

```python
table.append(df, snapshot_properties={
    "pipeline": "orders_hourly",
    "run_id": run_id,
    "source_snapshots": "raw.orders:7168742983117921046",
})
```

OpenMetadata's Iceberg connector surfaces these as table properties per snapshot, and a small custom step in the ingestion workflow turns `source_snapshots` into lineage edges for cases where OpenLineage was not available, such as a PyIceberg script with no listener.

Classification flows the other way. A column tagged `PII.Sensitive` in OpenMetadata is picked up by an automation that applies the matching Polaris policy to the table, so that engines reading through Polaris see the masking rule. The automation is a small service subscribed to OpenMetadata's change events, and it is where the governance decision made by a steward becomes an enforcement decision in the write path.

### Running the Platform

The operational shape of each platform differs enough to affect the choice.

DataHub self-hosted is a metadata service, a graph database, a search index, Kafka for the event stream, and the ingestion executors, plus a frontend. It is the heaviest of the open-source options and the one that scales furthest, and its cloud offering exists because most teams do not want to run Kafka for their catalog. As an Iceberg technical catalog it adds the requirement of catalog-grade uptime, which means the whole stack is tier one.

OpenMetadata self-hosted is a server, a relational database, and a search index, with ingestion running as Airflow tasks or as standalone workflows. It is the lightest to operate and the easiest to stand up in a day. Collate is the hosted path.

Atlan, Collibra, and Alation are operated by the vendor. The organization's work is connector configuration, identity integration, and stewardship, and the cost is the subscription.

For all of them, ingestion is the ongoing operational task. Each connector is a scheduled job against a source system with credentials, rate limits, and schema drift of its own. A platform with forty sources has forty ingestion pipelines, and they fail the way pipelines fail. The platform's own health is measured by ingestion freshness per source, and that metric belongs on the same dashboard as the lakehouse's table freshness.

## Failure Modes

**The platform as the source of truth.** A team treats the metadata platform's schema as authoritative and builds on it. The technical catalog has a newer schema. The team's code breaks on the column the platform did not know about yet. The catalog is the truth. The platform is a view with ingestion lag.

**Ingestion that never runs.** The platform was set up in a project, the ingestion schedule was left at "manual," and six months later the platform describes a lakehouse that no longer exists. Ingestion is a pipeline and needs monitoring like one.

**Lineage from SQL parsing alone.** Parsers miss dynamic SQL, procedures, and anything outside the query log. Lineage that is 80 percent complete is worse than no lineage for impact analysis, because people trust it. Emit from the source.

**Two systems of tags.** Tags in the technical catalog and tags in the platform, applied independently, disagreeing. Pick one as the authoring surface and sync to the other.

**Putting the platform in the write path without the operational investment.** DataHub as the Iceberg catalog is attractive and requires DataHub to have catalog-grade availability. A platform sized for nightly ingestion and daytime search is not sized for every engine's commit traffic.

**Federation as an afterthought.** Gravitino added on top of several catalogs that were never meant to be presented together produces namespace collisions and permission mismatches. Federation is a design, not a patch.

**Agents reading uncertified tables.** The MCP server exposes everything the platform knows, including tables that are deprecated, experimental, or wrong. Agent tool access should respect certification status, and most platforms let it.

**Buying for the UI.** The demo is beautiful. Six months later, adoption is three people. Metadata platforms succeed when they are wired into the workflows people already have, the pull request that adds a model, the incident that traces a bad number, the access request, and fail when they are a destination people are supposed to visit.

## Operational Guidance

**Keep the technical catalog authoritative.** Every consumer that needs the schema reads it from the catalog. The platform is for humans and agents looking for context.

**Ingest on a short schedule and monitor it.** Hourly for the technical catalogs, and alert on ingestion failures like any pipeline.

**Emit lineage at the source.** OpenLineage on every engine and orchestrator, snapshot properties on every commit. Treat parsed lineage as a fallback.

**Pick one authoring surface for tags and classifications.** Usually the platform, with automation syncing to the catalog's policies.

**Certify tables and expose certification to agents.** The MCP server should default to certified assets.

**Treat the platform's quality module as one signal among several.** OpenMetadata's built-in tests and the platforms' ingested quality results are useful. They do not replace validation in the pipeline before publication.

**Decide the one-layer question deliberately.** If DataHub is to be the Iceberg catalog, plan for it as a tier-one service. If not, do not let it become one by accident because someone registered a table through it.

**Match the platform to the audience.** Engineers get by with DataHub or OpenMetadata. A large analyst and business population is where Atlan's experience or Collibra's workflow justifies the cost.

## Where the Ecosystem Is Heading

**Iceberg REST as the integration surface.** Every metadata platform ingests from Iceberg REST catalogs, and DataHub serves one. Expect OpenMetadata and the commercial platforms to follow DataHub's lead on serving, and expect the REST specification to gain endpoints for the metadata the platforms need, such as change notifications and lineage hints.

**Standards converging.** Open Semantic Interchange for business semantics, the Open Data Contract Standard for contracts, OpenLineage for lineage, and Iceberg REST for tables are the four vendor-neutral surfaces, and the platforms are converging on all of them. A team that emits in these formats is not locked to any platform.

**Foundation governance.** OpenMetadata under the Linux Foundation, Polaris and Gravitino under Apache, Unity Catalog under the Linux Foundation's LF AI & Data. The open-source catalogs are now all foundation-governed, which reduces the vendor-capture risk that shaped the previous generation.

**The catalog as the agent's world model.** The platforms are repositioning from "where people find data" to "what agents know about data," and the MCP servers are the first step. The next is the platform holding the semantic layer, the contracts, and the certification status that an agent needs to produce a trustworthy answer, which makes the metadata platform the governance boundary for AI as much as for people.

**Consolidation.** The prediction most observers make is three commercial platforms and two open-source projects surviving, with the smaller and older tools fading. The pattern in ingestion, orchestration, and quality during 2025 and 2026 suggests the metadata platform category will not be exempt.

## Conclusion

Two things are called catalogs. The technical catalog is in the write path, knows the truth about tables, and vends the credentials that let engines touch them. The metadata platform observes everything, builds the graph of lineage and context, and is where people and agents go to find and understand data. Polaris, Unity, Glue, and Gravitino are the first kind. DataHub, OpenMetadata, Atlan, Collibra, and Alation are the second, and DataHub has become both for Iceberg tables.

The convergence is real and it runs both ways, but the responsibilities have not merged. The technical catalog is authoritative and the platform is derived, unless the two are the same system, in which case the platform has to be run like infrastructure. Emit lineage at the source, author classifications in one place and sync them down, keep ingestion running and monitored, and expose the result to agents with certification enforced. Do that and the two catalogs stop being a source of confusion and become a layered system where each does what it is built for.

## Keep Going

If this piece was useful, I have written a lot more on catalogs, from the technical catalog's role in the commit path to the governance features that are growing on top of it. *Apache Polaris: The Definitive Guide* from O'Reilly covers the technical catalog side in depth, and *Architecting an Apache Iceberg Lakehouse* from Manning covers how catalogs fit into the wider platform. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
