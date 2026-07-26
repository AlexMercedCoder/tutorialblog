---
title: "Building a Lakehouse That Stays Inside the Border"
date: "2026-07-25"
description: "Residency is a storage location. Sovereignty is who can compel access, who operates the systems, and whether you can leave. A practical guide to sovereign lakehouse architecture in 2026."
author: "Alex Merced"
category: "Data Engineering"
tags:
  - data sovereignty
  - apache iceberg
  - GDPR
  - open formats
  - lakehouse
canonical: https://iceberglakehouse.com/posts/sovereign-lakehouse/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/sovereign-lakehouse/).

A manufacturer in southern Germany asked me a question during an architecture review that I have thought about since. Their data sat in a Frankfurt region. Their contract specified EU processing. Their auditor had signed off. Then somebody asked where the catalog ran, and the answer was a software-as-a-service control plane in Virginia.

The data files never left Germany. The metadata about them did: table names, column names, partition values, row counts, and the credentials that gate access to every byte. For a table named `patients_oncology_2026` partitioned by `treatment_center`, the metadata alone tells you a great deal, and it was sitting under a jurisdiction the compliance review never examined.

That gap between where the bytes live and where control over them lives is what data sovereignty actually means, and it is the part most architectures get wrong. Residency is a storage location. Sovereignty is a question about who can compel access, who operates the systems, who holds the keys, and whether you can leave.

This is a practical guide to building lakehouse architecture that survives that question: what the regulations actually require as of mid-2026, the three deployment tiers and their residual exposure, why open formats are the load-bearing piece, a reference architecture, and the failure modes that pass an audit and fail reality. I work at Dremio, now part of SAP, which is a European company selling into exactly this problem, so weigh the vendor-adjacent parts accordingly. The regulatory facts and the architecture are checkable.

## Three Properties People Treat as One

**Data residency** is where bytes are physically stored. It is the easiest property to satisfy and the easiest to verify. Pick a region, confirm replication targets, done.

**Operational sovereignty** is who can technically access the systems. Support engineers with production access, telemetry pipelines that phone home, break-glass procedures, and backup destinations all sit here. A system stored in Germany and administered by a follow-the-sun support rotation spanning three continents satisfies residency and fails operational sovereignty.

**Jurisdictional sovereignty** is whose law compels disclosure. This is the one that no amount of configuration fixes. The US CLOUD Act permits US authorities to demand data from US-incorporated providers regardless of where it is stored. No provision of European law prevents that demand from being issued, which creates a legal conflict that has stayed unresolved through 2026. A US-incorporated provider operating a Frankfurt data center remains subject to its home jurisdiction, and choosing Frankfurt over Dublin over Amsterdam changes nothing about that exposure.

The practical consequence: an architecture review that stops at "the data is in the EU" has verified one property out of three. Ask all three questions separately, of every component, including the ones nobody thinks of as data systems, which is where the catalog problem above came from.

## What the Rules Actually Say in 2026

A compressed picture of the European framework, since it is the most developed and the most likely to be copied elsewhere.

**The Cloud Sovereignty Framework**, published by the European Commission in October 2025, defines eight sovereignty objectives for EU institutions procuring cloud services and introduces a sovereignty score that assesses exposure to foreign legislation including the CLOUD Act. This is the first formal scoring mechanism in the EU market, and its significance is that sovereignty stopped being a binary claim and became a graded assessment. The objectives function as minimum requirements rather than precise specifications, so the level required varies by procurement.

**GDPR** remains the enforcement engine, with cumulative fines reaching roughly 7.1 billion euros by early 2026 and data transfer violations remaining a high-risk enforcement area.

**The EU Data Act** phases out vendor lock-in by 2027 and makes data portability a regulatory requirement rather than a nice architectural property. This is the provision most relevant to lakehouse design, and I will come back to it, because it converts a technical preference for open formats into a compliance argument.

**The EU AI Act** requires continuous monitoring and compliance documentation, including evidence that data stayed within approved jurisdictions. That pushes sovereignty questions into the model layer, not just the storage layer.

**The Cloud and AI Development Act**, introduced in the first quarter of 2026, aims to substantially expand EU data center capacity over the following five to seven years, which is the supply-side response to all of the above.

**Gaia-X** reached more than 400 certified service providers in 2025, creating a substantial European provider ecosystem, and national programs exist alongside it. France's Bleu and Germany's Delos Cloud are working examples of partner-operated sovereign deployments, where infrastructure is tailored to local mandates and only personnel with country-specific clearances administer the environments.

Outside Europe the pattern repeats with different specifics. China's Cybersecurity Law and Data Security Law impose localization requirements for critical information infrastructure operators. India, Saudi Arabia, Brazil, and others have their own regimes. Any architecture built for European sovereignty translates reasonably well, because the underlying properties are the same three.

## Minimum Sufficient Sovereignty

The analyst guidance that has held up best is to classify each workload by regulatory sensitivity and assign it the least expensive tier that satisfies its requirement, rather than forcing the whole estate to the strictest level. Three tiers cover the range.

**Tier one: hyperscaler in-region.** Standard cloud services with region pinning, customer-managed encryption keys, and contractual commitments about data location. Cheapest, best managed-service coverage, full elasticity. Residual exposure: jurisdictional, since the provider's home-country law still applies to the provider. Appropriate for the large majority of enterprise data.

**Tier two: sovereign programs and partner-operated clouds.** Hyperscaler technology operated by a local entity, with personnel holding country-specific clearances, local key management, and separated support paths. Substantially reduced exposure at moderate cost premium and a smaller service catalog, since not every managed service reaches these environments. Appropriate for regulated industry data and most public-sector work. Most enterprises need this tier for their sensitive workloads while keeping everything else on standard cloud.

**Tier three: on-premises or air-gapped.** Your hardware, your building, your staff, no external dependency. Complete sovereignty at the highest total cost of ownership. Required for some defense, intelligence-adjacent, and critical infrastructure workloads, and chosen by some organizations for national-security-adjacent industrial data.

The classification exercise is straightforward and nobody wants to do it, which is why estates default to the extremes: everything in the standard cloud until an incident, then a panicked push to move everything on-premises. The middle is where the correct answer usually sits, and getting there requires per-dataset classification with a named owner for each decision.

## Open Formats Are the Sovereignty Primitive

Here is the argument that changes how architects should think about this, and it comes directly from the Data Act's portability requirement.

Sovereignty is not only about where data sits today. It is about whether you can move it, on your own schedule, without the current provider's cooperation. A provider that stores your data in a proprietary format holds a practical veto over your exit regardless of what the contract says, because the cost and risk of extraction are high enough to make leaving theoretical.

An Apache Iceberg table on object storage inverts that. The data files are Parquet, readable by eight independent implementations. The table metadata is an open specification, readable by any compliant engine. The catalog speaks the Iceberg REST specification, so pointing a different engine at the same tables is a configuration change. Full reversibility, which the EU Data Act pushes toward, becomes a property of the storage layer rather than a clause in a contract.

That is why open formats belong in the sovereignty conversation and not only in the cost conversation. The exit plan stops being a document and becomes a demonstrable capability, which is exactly what an auditor asking about vendor dependency wants to see.

Three practical consequences follow.

Store in Iceberg regardless of tier. Even on a standard cloud deployment, the format choice preserves the option to relocate later, and relocation is what every sovereignty escalation eventually requires.

Run a catalog you control. This is the piece the German example got wrong. The catalog holds metadata, policy, and credential vending, which makes it the most jurisdictionally sensitive component in the stack after the data itself. Apache Polaris and Lakekeeper both deploy inside your own perimeter, which means the control plane sits under your jurisdiction rather than someone else's.

Keep the semantic definitions portable. Metric definitions, access policies, and lineage are the assets that take longest to rebuild. Whatever platform holds them should be able to export them in a form another system reads.

## A Reference Architecture

A tier-three deployment, since the stricter design degrades gracefully into the looser tiers.

**Storage.** S3-compatible object storage running on your hardware. MinIO, Apache Ozone, or storage from vendors implementing the interfaces natively. The S3 API is the compatibility layer that keeps every engine working without modification, which is the single most important property when you are assembling components yourself. Verify the specific API surface your engines depend on rather than assuming full parity, since conditional writes, multipart behavior, and listing semantics vary between implementations and Iceberg commit paths depend on some of them.

**Table format.** Apache Iceberg. Parquet files underneath, with variant and geospatial types available at format version 3 for the workloads that need them.

**Catalog.** Apache Polaris or Lakekeeper, deployed in-cluster, backed by your own database, integrated with your own identity provider. This gives you multi-catalog management, role-based access control, credential vending, and a policy store, with the control plane inside your perimeter.

**Engines.** Whatever fits the workload, pointed at the same catalog. Trino or Spark for large batch, ClickHouse or StarRocks for low-latency serving, DuckDB and DataFusion for local and embedded work, and a commercial engine if you want a supported semantic layer and federation. The REST catalog is what makes this list interchangeable.

**Ingestion.** Kafka or Redpanda for streaming, Debezium for change data capture, Flink or Spark for stateful processing. Each of these runs on your own Kubernetes and none of them requires an external service to function, which is the property to check when evaluating any addition to the stack. Redpanda's ability to write Iceberg tables directly from the broker removes a component from the path, which matters more when you operate every component yourself.

**Orchestration and transformation.** Airflow or Dagster, with dbt or SQLMesh. All deployable on your own Kubernetes.

**Observability.** Prometheus and Grafana for metrics, plus a log stack you operate. This one gets skipped in reference architectures and matters more here than anywhere else, because the managed observability platform most teams reach for ships logs and query text to a foreign jurisdiction. Running your own is the price of the sovereignty position, and the query logs it holds are among the most sensitive artifacts in the estate.

**Sharing across the boundary.** This is the newest capability worth knowing about. The OpenSharing protocol, announced June 10, 2026 and hosted by the Linux Foundation, extends zero-copy sharing to on-premises and private-cloud providers, with storage vendors implementing it natively, and adds Iceberg REST catalog clients as recipients. That gives a sovereign deployment a standards-based way to share specific datasets outward without relocating anything, which used to require building a custom export.

**Models.** Covered below, because sovereign AI has become its own problem.

One component deserves a specific note. The catalog is the piece that most determines whether this architecture holds together, because it is simultaneously the control plane, the policy enforcement point, the credential authority, and the discovery interface. Deploying it inside the perimeter is what makes the other choices meaningful. A sovereign storage layer under a foreign control plane is a partial answer, and it is the most common partial answer in the field.

Everything in that list is open source or commercially supported software that runs on your infrastructure. The assembly cost is real, and I have written elsewhere about the staffing that a self-operated stack requires. For sovereignty-constrained workloads that cost is not optional, which changes the calculation: the question stops being whether to operate it yourself and becomes how to operate it with the fewest moving parts.

## Pinning Data to a Place, in Configuration

Sovereignty claims become real in configuration files. Here is the shape of the pieces that enforce locality rather than describing it.

Start with the catalog, since it is the control point. This is a Polaris catalog whose storage configuration constrains where data lands, with credential vending scoped so no engine holds standing access.

```json
{
  "name": "eu_regulated",
  "type": "INTERNAL",
  "properties": {
    "default-base-location": "s3://sovereign-eu-central/warehouse/regulated"
  },
  "storageConfigInfo": {
    "storageType": "S3",
    "allowedLocations": [
      "s3://sovereign-eu-central/warehouse/regulated"
    ],
    "roleArn": "arn:aws:iam::000000000000:role/polaris-eu-central",
    "region": "eu-central-1",
    "endpoint": "https://minio.internal.example.de:9000",
    "pathStyleAccess": true
  }
}
```

The `allowedLocations` array is the enforcement mechanism, and it is worth understanding precisely. Polaris rejects any attempt to create or register a table whose storage location falls outside that list. A well-meaning engineer who registers a table pointing at a bucket in another region gets an error rather than a compliance incident. That is a small feature with outsized value, because the most common residency violation I see is not a deliberate transfer. It is a table registered against the wrong bucket by someone who did not know the difference.

The `endpoint` and `pathStyleAccess` settings point the catalog at self-hosted S3-compatible storage, which is how the same configuration serves an on-premises deployment. The interface stays S3, the implementation is yours.

Next, principal and role definitions bound to an identity provider you operate:

```bash
# Create a catalog role scoped to one namespace, then grant it.
curl -X POST "$POLARIS/api/management/v1/catalogs/eu_regulated/catalog-roles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"catalogRole": {"name": "clinical_reader"}}'

curl -X PUT "$POLARIS/api/management/v1/catalogs/eu_regulated/catalog-roles/clinical_reader/grants" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"grant": {"type": "namespace", "namespace": ["clinical"], "privileges": ["TABLE_READ_DATA"]}}'
```

Two properties matter for sovereignty. Privileges are granted at the catalog layer rather than inside each engine, so the policy holds no matter which engine or agent asks. And when a query runs, the catalog vends short-lived credentials scoped to the specific files that query needs, which means no engine and no user holds standing access to the bucket. Revocation becomes immediate rather than eventual, and the audit trail sits in one place.

Then the engine configuration, which contains no storage credentials at all:

```python
spark = (
    SparkSession.builder
    .config("spark.sql.catalog.eu", "org.apache.iceberg.spark.SparkCatalog")
    .config("spark.sql.catalog.eu.type", "rest")
    .config("spark.sql.catalog.eu.uri", "https://polaris.internal.example.de/api/catalog")
    .config("spark.sql.catalog.eu.warehouse", "eu_regulated")
    .config("spark.sql.catalog.eu.credential", f"{CLIENT_ID}:{CLIENT_SECRET}")
    .config("spark.sql.catalog.eu.header.X-Iceberg-Access-Delegation", "vended-credentials")
    .getOrCreate()
)
```

The absence of storage keys in that configuration is the point. An engine compromised or misconfigured cannot reach storage on its own, and an engine deployed outside the approved region cannot obtain credentials if the catalog's policy restricts by network or principal. Sovereignty enforcement moves from a promise about behavior into a property of the credential path.

Finally, a verification query that any auditor can run:

```sql
-- Prove every registered table lives inside approved storage.
SELECT
    table_namespace,
    table_name,
    location,
    CASE
        WHEN location LIKE 's3://sovereign-eu-central/%' THEN 'compliant'
        ELSE 'REVIEW'
    END AS residency_status
FROM eu.information_schema.tables
ORDER BY residency_status DESC, table_namespace;
```

Running that on a schedule and alerting on anything in the `REVIEW` state converts a policy into a control. Auditors respond well to evidence that a rule is checked continuously rather than asserted annually.

## The Components People Forget

Passing an audit on the data path and failing on everything around it is the standard outcome. Seven components carry data or metadata across boundaries and get overlooked.

**The catalog.** Covered above and worth repeating because it is the most common miss. A software-as-a-service catalog holding table names, column names, partition values, statistics, and credential vending for on-premises data places the most sensitive metadata in the vendor's jurisdiction.

**Telemetry and product analytics.** Platform components report usage, errors, and performance to their vendors. Query text in an error report contains column names, filter values, and sometimes literal customer data. Ask every vendor what leaves the deployment, and confirm the setting that disables it exists and works.

**Support access.** Break-glass procedures where vendor engineers access production during incidents. Ask who is in the rotation, what clearances they hold, and where they sit. Partner-operated sovereign programs exist specifically because this question has no good answer in a standard cloud deployment.

**Backups and disaster recovery.** The secondary region is a residency decision, and DR plans are written by different people than data platform architecture. A perfectly compliant primary with a backup target in another jurisdiction is a common finding.

**Model inference.** Covered in the next section, and the fastest-growing gap.

**Third-party embedded services.** Geocoding, entity enrichment, currency conversion, address validation, fraud scoring. Each is an API call carrying data outward, and each was added by a developer solving a small problem. Inventory every outbound call from your transformation layer.

**Log aggregation.** Application and query logs frequently ship to a managed observability platform in another jurisdiction, and query logs contain query text.

The pattern across all seven: they are treated as infrastructure rather than as data flows, so the data governance process never examines them. A useful exercise is to draw every network egress from the platform and label it with what it carries. The list is always longer than expected.

## Sovereign AI Is Now Part of the Problem

The AI layer inherits every sovereignty question and adds a few, and the EU AI Act's documentation requirements make it explicit.

**Hosted frontier models are a jurisdictional decision.** Sending prompts to an API means sending whatever context the prompt carries, which for enterprise agents is business data. Provider region commitments help with residency and do not resolve the jurisdictional question when the provider is foreign-incorporated. Several providers now process interactions in-country for a growing list of nations, which addresses part of it.

**Self-hosted open-weight models are the strong answer.** Weights you download and run on your own hardware create no external dependency at inference time. The field is unusually good here as of 2026: Mistral ships permissively licensed models with European incorporation and self-hosting as a first-class path, Google's Gemma line covers the local sizes, and the leading open-weight releases from several labs ship under MIT and Apache licenses. Teuken and similar European projects target multilingual coverage across official EU languages specifically.

**Licenses carry territorial restrictions.** This surprises teams every time. Some widely used open-weight licenses have included terms restricting use in specific jurisdictions, which has made certain models unusable for organizations domiciled in the European Union. Read the license before the proof of concept, not before the launch.

**Model selection belongs in the data classification.** The tier assigned to a dataset should determine which models are permitted to see it. Tier one data reaches a hosted API. Tier two data reaches an EU-resident managed endpoint or a self-hosted model. Tier three data reaches only models running inside the perimeter. Encoding that as policy rather than as guidance is what keeps it from eroding under deadline pressure.

**Small models do most of the work.** The practical enabler for sovereign AI is that classification, extraction, summarization, and routing run well on models in the 4B to 30B range that fit on modest hardware. Reserve the frontier tier for the small share of tasks that genuinely need it, and a lot of the sovereignty problem disappears along with a lot of the cost.

**Tabular models are a special case worth knowing.** Enterprise prediction over structured data runs on tabular foundation models that are small, open, and easy to self-host. For the payment delay, supplier risk, and churn questions that dominate enterprise prediction, there is no jurisdictional exposure at all if you run the weights yourself.

The synthesis: sovereign AI in 2026 is more achievable than sovereign cloud, because the open-weight model field is genuinely strong and the hardware requirements for useful models fit inside a single rack. The gap is tooling and habit, not capability.

## What Sovereignty Costs

Honest accounting, because the business case gets made on incomplete numbers.

**You give up managed table maintenance.** Compaction, snapshot expiration, manifest rewriting, and orphan cleanup run automatically on managed platforms and become your scheduler on a self-operated stack. Budget the compute and the engineering attention.

**You give up elastic scale.** On-premises capacity is provisioned for peak, which means paying for idle. Hybrid designs that burst non-sensitive workloads to cloud capacity recover part of this, at the cost of a boundary that has to be enforced.

**You give up service breadth.** Sovereign programs and on-premises deployments carry a smaller catalog of managed services than standard cloud regions. Features arrive later, and some never arrive.

**You take on staffing.** A serious self-operated lakehouse needs a platform team, which realistically starts at two to four engineers who stay. That is the number I keep coming back to because it is the one most often omitted from proposals.

**You gain three things.** Predictable cost, since capacity is capital rather than consumption. Complete control over upgrade timing, which matters enormously in regulated environments where change control is heavy. And a demonstrable exit path, which under the EU Data Act's portability requirement is moving from an advantage to an obligation.

The tier-two middle path exists precisely because these tradeoffs are steep. Partner-operated sovereign clouds keep most of the managed-service benefit while addressing operational sovereignty, and they carry residual jurisdictional exposure that the sovereignty scoring framework now makes explicit rather than leaving to argument.

## The Hybrid Pattern Most Organizations Actually Need

Pure tier-three deployments are rare and pure tier-one deployments fail sensitive workloads. The design that fits most regulated enterprises is a sovereign core with an elastic perimeter, and the boundary between them is where the engineering happens.

**The core** holds classified data: an in-perimeter object store, Iceberg tables, a self-operated catalog, and engines running on your own capacity. Everything that touches regulated records happens here.

**The perimeter** holds everything else on standard cloud, where elasticity and managed services are cheap: web analytics, marketing data, public datasets, aggregated and anonymized outputs, development environments with synthetic data.

**The boundary** is the interesting part, and three mechanisms carry traffic across it safely.

Catalog federation lets the core's catalog register tables in the perimeter for discovery and query, with the data staying where it is. The metadata direction matters: federating outward from a sovereign catalog to a cloud catalog is usually acceptable, and the reverse frequently is not, since it places sovereign metadata in a foreign control plane.

Aggregate publication moves derived, non-identifying results outward on a schedule. A daily aggregate with suppression rules applied is a different regulatory object than the underlying records, and the transformation that produces it is the control. Document the suppression logic, because it is what makes the publication defensible.

Sharing protocols work in the inbound direction. When a partner publishes a dataset, an Iceberg REST client inside the perimeter reads it without an outbound data flow, since the traffic is a read of their storage rather than an export of yours.

Two rules keep the boundary from eroding. Traffic crossing it is explicit and inventoried, never incidental. And the classification tier travels with the data, so a dataset promoted into the core stays in the core even when someone builds a convenient pipeline outward.

The hybrid pattern also solves the burst problem that makes pure on-premises expensive. Non-sensitive computation scales into cloud capacity, sensitive computation stays fixed, and the capacity planning question narrows to only the workloads that genuinely need to stay inside.

## Sizing the Core

Concrete numbers for the part that gets guessed at.

**Storage.** Size for three copies of your regulated data: the primary, the erasure-coded overhead of the object store, and a DR copy inside the same jurisdiction. Object storage systems with erasure coding typically carry 1.4 to 1.5 times raw overhead, so a 200 TB dataset becomes roughly 300 TB of raw capacity before DR. Add growth at your observed rate and buy eighteen months ahead, since procurement cycles for on-premises hardware are long.

**Compute.** Separate the three profiles. Streaming ingestion runs continuously at modest size. Batch transformation is bursty and tolerates queuing. Interactive query needs headroom for concurrency. Sizing for the sum of peaks wastes money, and sizing for the average produces queuing at exactly the wrong moments. A practical starting split is continuous capacity for ingestion, a scheduled window for batch, and elastic-within-the-cluster allocation for interactive.

**GPU capacity for models.** A single node with a few current-generation accelerators serves a large amount of inference for models in the sizes that handle enterprise classification, extraction, and prediction work. Fine-tuning needs more and happens rarely. Start smaller than instinct suggests, measure, and expand.

**People.** Two to four platform engineers for the core, plus whatever data engineering the workloads require. The platform engineers are the constraint, not the hardware, and they need to be retained rather than rotated, because the operational knowledge of a self-assembled stack lives in the people who built it.

**Network.** The boundary crossing needs monitored, logged egress with an explicit allowlist. This is a security control and a compliance artifact at once, and it is the cheapest piece of the design.

## Questions for the Procurement Process

Eight questions that surface real sovereignty posture, worth asking every vendor in a regulated evaluation.

**Where does your control plane run, physically and legally?** Separate from where the data runs. This is the question that catches the catalog problem.

**What is your corporate jurisdiction, and what is your parent's?** Foreign incorporation determines exposure regardless of deployment region, and the sovereignty scoring framework treats it explicitly.

**Who administers the environment, from where, and what clearances do they hold?** Partner-operated sovereign programs have good answers. Standard cloud deployments usually do not.

**What telemetry leaves the deployment, and can it be fully disabled?** Ask for the list, not the assurance. Query text in error reports is the common surprise.

**Where do backups and DR replicas land, by default and by configuration?** Confirm the actual configured targets in a test deployment.

**If we stop paying, what do we run to keep reading our data?** For an Iceberg deployment the honest answer is a catalog endpoint and a bucket. Longer answers describe a dependency.

**Can an outside engine read and write your managed tables through the Iceberg REST specification with catalog-vended credentials?** The ten-minute test that separates open storage from open-format storage behind a closed control plane.

**What is your commitment on in-country processing for AI inference, and for which models?** The newest question and the one with the least mature answers.

## Failure Modes

**Metadata in the wrong jurisdiction.** The opening story. Symptom: an architecture that passes a residency review and exposes table structure, statistics, and credentials to a foreign control plane. Fix: run the catalog inside the perimeter.

**Residency verified once.** Symptom: a compliant estate that drifts as new tables get registered against convenient buckets. Fix: `allowedLocations` enforcement in the catalog plus the scheduled verification query above.

**The DR plan nobody reviewed.** Symptom: compliant primary, non-compliant secondary. Fix: include backup and replication targets in the same classification exercise as primary storage, and verify the actual configured targets rather than the documented ones.

**Support access as an unexamined channel.** Symptom: a vendor engineer with production access during an incident, in a jurisdiction nobody assessed. Fix: ask the question during procurement, and prefer arrangements with cleared local personnel for sensitive tiers.

**Model API calls carrying regulated data.** Symptom: an agent enriching records through a hosted model, with prompts containing exactly the data the classification prohibits leaving. Fix: model tier policy tied to data classification, enforced at the gateway rather than trusted to developers.

**Sovereignty applied uniformly.** Symptom: enormous cost, slow delivery, and a platform team stretched across workloads that never needed the strictest tier. Fix: per-dataset classification. Minimum sufficient sovereignty is the guidance for a reason.

**Open formats without an open catalog.** Symptom: data in Iceberg, exit still blocked, because the catalog, the policies, and the semantic definitions are proprietary. Fix: treat the catalog as part of the portability requirement, and test the exit by pointing an outside client at the tables.

**Third-party enrichment calls.** Symptom: a transformation step calling an external service for every row, discovered during an audit rather than during design. Fix: an inventory of outbound network calls from the transformation layer, reviewed like any other data flow.

## A Classification Workflow That Works

The process matters more than any individual technology choice, and it is simpler than most organizations make it.

**Step one, inventory by dataset, not by system.** Systems hold mixed sensitivity. A single database contains reference data that needs nothing and personal data that needs the strictest handling. Classification at the system level always over-protects most of it and under-protects some of it.

**Step two, classify against three questions.** What law applies to this data. What is the consequence of foreign access. What is the consequence of unavailability. The third question is the one that gets skipped, and it is the one that argues against air-gapping things that need high availability more than they need isolation.

**Step three, assign a tier and a named owner.** The owner signs off on the tier and reviews it annually. Tiers without owners revert to whatever is convenient within a year.

**Step four, encode the tier as metadata.** Table property, catalog namespace, or governance table. The tier has to be machine-readable so that policies, model routing, and the verification query can act on it. A classification living in a spreadsheet is a document, not a control.

**Step five, verify continuously.** The residency query, the egress inventory, and the model routing policy all checked on a schedule with alerts. Point-in-time compliance is the failure mode that produces confident wrong answers during audits.

**Step six, test the exit.** Once a year, pick a dataset and demonstrate reading it with an independent client against a catalog endpoint, then demonstrate relocating a copy to different storage. That exercise produces the evidence the Data Act's portability requirement is reaching for, and it usually finds one broken assumption.

The whole workflow takes a few weeks for a first pass over a large estate and a day or two per quarter to maintain. Compared with the cost of discovering a misclassification during a regulatory inquiry, that is inexpensive, and the inventory it produces turns out to be useful for a dozen other purposes: cost allocation, incident response scoping, retention policy, and deciding which datasets deserve the operational freshness tier.

## Why This Became Urgent Now

Sovereignty requirements existed for a decade before anyone built architecture around them. Four things changed at once, and understanding the timing helps when explaining the priority to people who remember this as a niche public-sector concern.

**The legal conflict stopped being theoretical.** The tension between extraterritorial disclosure law and European data protection has been discussed since 2018. What changed is enforcement volume and the arrival of a formal scoring mechanism, which converts a philosophical disagreement into a procurement criterion with a number attached.

**AI made the exposure concrete.** Analytics kept data mostly at rest. Enterprise AI moves it: prompts carrying business records to inference endpoints, retrieval systems assembling context from regulated tables, agents taking actions on the basis of both. Every one of those is a data flow that did not exist in the architecture diagram two years ago, and the AI Act's documentation requirements mean someone has to describe them.

**Open formats got good enough to be the answer.** In 2022, choosing sovereignty meant choosing a materially worse platform. In 2026 an Iceberg lakehouse with an open catalog, several strong engines, and automated maintenance is a competitive architecture regardless of where it runs. Sovereignty stopped requiring a capability sacrifice, which removed the main argument against it.

**On-premises rejoined the ecosystem.** Storage vendors implementing sharing protocols natively, and catalogs that federate across boundaries, mean a sovereign deployment is no longer an island. That was the practical objection for years: isolation meant exclusion from data collaboration. It no longer does.

There is a fifth factor that is less comfortable to state and shapes budgets anyway. Geopolitical uncertainty has made boards ask what happens if a supplier relationship changes for reasons unrelated to service quality. That question does not have a technical answer, and the architectural response to it is the same as the compliance response: keep the data in formats anyone can read, keep the control plane where you control it, and be able to demonstrate the exit.

The result is that sovereignty work now gets funded in organizations that ignored it for a decade, and the teams doing it are frequently the same platform teams already running an Iceberg estate. The good news in that overlap is that most of the required architecture is the architecture they already chose for other reasons.

## Where This Is Heading

Three developments worth tracking through 2027.

**Sovereignty scoring becomes procurement standard.** The Commission's framework introduced a scoring mechanism for exposure to foreign legislation. Formal scoring tends to spread from public-sector procurement into regulated private sectors, which means vendors will be answering these questions in structured form rather than in prose, and buyers will be comparing scores.

**Portability requirements bite in 2027.** The Data Act's phase-out of lock-in arrives on a timeline that is now close. Architectures built on open table formats with self-operated catalogs satisfy it almost incidentally. Architectures built on proprietary storage will be doing migration projects on a regulatory schedule rather than a business one.

**On-premises rejoins the mainstream through sharing protocols.** The most interesting technical development for sovereignty is that cross-boundary data sharing no longer requires relocating data. Protocols that treat on-premises storage as a first-class provider, with Iceberg REST clients as recipients, let a sovereign deployment participate in a broader data ecosystem while keeping every byte in place. That capability arrived in 2026 and most organizations have not absorbed what it makes possible.

A fourth, quieter trend: the open-weight model field is strong enough that sovereign AI is now easier than sovereign cloud. That inverts the assumption most strategy documents were written under, which is that AI capability requires accepting foreign dependency. For a large share of enterprise AI work, it no longer does.

## Conclusion

Data sovereignty is three questions wearing one word, and most architectures answer only the first. Where the bytes sit is the easy part. Who can technically reach the systems, and whose law compels disclosure, are the questions that determine whether a compliance position survives contact with a regulator or an incident.

The architectural answer is more available than it was two years ago. Open table formats give you portability that is demonstrable rather than contractual. Self-hosted catalogs put the control plane, the policies, and the credential vending under your own jurisdiction. S3-compatible storage from vendors who ship on-premises keeps every engine working without modification. Sharing protocols let sovereign deployments participate in wider ecosystems without relocating data. And the open-weight model field is strong enough that AI capability no longer requires a foreign API call.

What none of that removes is the classification work. Minimum sufficient sovereignty means deciding, per dataset, what actually needs protecting and at what tier, then encoding the decision somewhere a machine can check it. Organizations that do that work spend appropriately and prove their position on demand. Organizations that skip it either overspend on protecting reference data or discover during an audit that their catalog was in Virginia.

Start with the inventory of what crosses the boundary. Not the data path, which everyone has mapped, but everything else: the catalog, the telemetry, the support rotation, the backups, the enrichment calls, the model APIs, and the logs. That list is where the real exposure lives, and it takes an afternoon to produce.

## Keep Going

If this piece was useful, I have written a lot more on open lakehouse architecture and the catalog layer that makes it portable.
*Apache Polaris: The Definitive Guide* (O'Reilly) covers the catalog deployment, identity integration, credential vending, and storage configuration that this article's sovereignty controls depend on, and *Architecting an Apache Iceberg Lakehouse* (Manning) covers the storage and maintenance side of running one yourself.
You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at
[books.alexmerced.com](https://books.alexmerced.com).
