---
title: "Designing Private, Air-Gapped Data Lakehouses: Scaling Iceberg in Highly Secure, On-Premises Clouds"
date: "2026-07-06"
description: "![Papercut architecture showing private air-gapped lakehouse with storage, Iceberg, catalog, query, semantic layer, and audit inside secure boundary](./diagram-1.png)"
canonical: https://iceberglakehouse.com/posts/private-air-gapped-data-lakehouses-iceberg-secure-clouds/
author: "Alex Merced"
category: "Lakehouse"
tags:
    - data lakehouse
    - on-premises
    - private cloud
    - apache iceberg
    - air-gapped
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/private-air-gapped-data-lakehouses-iceberg-secure-clouds/).



Some of the most important lakehouse work happens in environments that will never look like a simple public-cloud reference architecture. Defense, public sector, healthcare, financial services, manufacturing, energy, and research organizations often need private infrastructure, strict network boundaries, controlled software supply chains, and auditability that goes far beyond ordinary dashboard access.

That reality matters for AI. Agentic analytics does not remove security constraints. It makes them sharper. Agents can issue many queries, chain tools, inspect metadata, and request actions. If those systems operate over sensitive data, the platform has to be designed around least privilege, observability, and controlled execution from the start.

Apache Iceberg is useful in this context because it gives open table semantics over files that can live inside controlled object storage. But Iceberg alone does not make a deployment secure, compliant, or air-gapped. A secure lakehouse is an architecture. It includes identity, networking, encryption, catalogs, query engines, semantic layers, audit logs, upgrade paths, backup, disaster recovery, and operational discipline.

The Dremio-positive conclusion is that private environments still need modern lakehouse capabilities: open tables, fast SQL, query federation, semantic governance, and agent-safe access. The architecture should bring those capabilities inside the boundary rather than forcing sensitive data out of it.

![Papercut architecture showing private air-gapped lakehouse with storage, Iceberg, catalog, query, semantic layer, and audit inside secure boundary](/images/2026/week-2026-07-06/private-air-gapped-data-lakehouses-iceberg-secure-clouds-diagram-1.png)

## Air-Gapped Is a Spectrum

People use "air-gapped" to describe several levels of isolation. Some environments have no network path to the public internet. Some have controlled one-way transfer mechanisms. Some allow limited outbound access through reviewed gateways. Some are private clouds with strict egress controls but not fully disconnected.

The design should start by naming the actual boundary. What systems can connect? How are patches imported? How are logs exported? How are users authenticated? How are models, packages, and container images approved? How is data transferred in or out, if at all?

A lakehouse architecture that assumes normal SaaS connectivity will not work in these environments. The platform must function when external control planes, package registries, telemetry services, and cloud-native identity integrations are unavailable or restricted.

This affects every layer. Storage must be local or approved. Catalog services must run inside the boundary. Query engines must authenticate locally. Semantic metadata must be available internally. AI agents must use internal tools. Audit logs must be retained inside approved systems.

Security begins with being honest about the boundary.

## What Iceberg Contributes

Iceberg contributes an open table layer. It gives teams a way to organize data in object storage while maintaining table metadata, snapshots, schema evolution, partition evolution, and transactional behavior. In private environments, that openness is valuable because it reduces dependence on a single closed engine.

A private lakehouse may need several compute patterns. Batch jobs may transform data. SQL engines may serve analysts. Notebooks may support data scientists. Agentic workflows may query semantic assets. Compliance teams may inspect lineage. Iceberg gives these consumers a shared table foundation when engine support is validated.

Snapshots are especially useful. They help teams reason about table state at a point in time. That matters for audit, reproducibility, and incident investigation.

Schema evolution also matters. Secure environments often move more slowly. Changing every consumer at once may not be possible. Open table semantics help teams evolve tables with more control.

But Iceberg is not the whole security model. It does not replace network isolation, identity management, access control, encryption, monitoring, or compliance review. It is a strong table foundation inside a larger secure architecture.

## Storage Inside the Boundary

Private lakehouses still need scalable storage. That may be on-premises object storage, private cloud object storage, or an approved storage service inside a sovereign or regulated environment. The storage layer should support durability, encryption, access logging, lifecycle controls, and backup.

Direct storage access should be limited. Users and agents should not browse buckets casually. Engines and maintenance services should access storage through scoped credentials and controlled network paths. Catalogs and query layers should mediate most interaction.

In highly secure environments, storage credentials should be rotated, scoped, and audited. If credential vending or remote signing patterns are used, those services must run inside the boundary and integrate with internal identity systems.

The physical layout should also support recoverability. Iceberg metadata, data files, manifests, and snapshots need backup strategies. A table is only useful if the metadata and data can be recovered together.

## Catalog and Metadata Services

The catalog is a critical control plane. It tells engines what tables exist, where metadata lives, and how table operations are coordinated. In a private lakehouse, the catalog must be available inside the secure boundary.

Catalog access should integrate with internal identity and policy systems. It should support audit logs. It should restrict table discovery where necessary. In some environments, even knowing that a dataset exists may be sensitive.

Open catalog interfaces are useful because they reduce dependence on one engine. Apache Polaris-style catalog patterns and Iceberg REST Catalog ideas are part of the broader direction. The exact implementation matters less than the control principle: table governance should be inspectable, auditable, and compatible with the approved engines.

Metadata itself needs protection. Schemas, table names, column names, tags, lineage, and statistics can reveal sensitive information. Treat metadata as part of the security model, not as harmless decoration.

![Papercut control flow showing identity, policy, query engine, catalog, Iceberg tables, and audit logs inside secure perimeter](/images/2026/week-2026-07-06/private-air-gapped-data-lakehouses-iceberg-secure-clouds-diagram-2.png)

## Query Engine Placement

In a private or air-gapped environment, query engines should run close to the data. Pulling sensitive data into an external SaaS query service defeats the purpose of the boundary. The engine should operate inside the approved infrastructure, with local authentication, local logs, and local policy enforcement.

Query federation still matters, but federation has to respect network boundaries. The platform may federate across internal databases, private object stores, message systems, and approved application databases. It may not be allowed to reach public endpoints.

This is where Dremio's lakehouse direction is relevant. The need for fast SQL, federation, semantic access, and acceleration does not disappear in secure environments. If anything, it becomes more important because copying data out to easier tools is not acceptable. The platform has to bring the analytical experience to the data.

Performance also matters. Secure environments sometimes accept poor user experience because the constraints are hard. But slow analytics creates pressure for shadow extracts. If users cannot get answers through governed tools, they will ask for exceptions. A strong private lakehouse reduces that pressure.

## Semantic Layer for Secure Analytics

The semantic layer is not optional in secure AI environments. It helps translate physical tables into approved business or mission concepts. It can define metrics, relationships, allowed dimensions, sensitivity levels, and usage notes.

For human users, this reduces confusion. For agents, it reduces risk. An agent should not infer the meaning of sensitive tables from column names. It should query approved semantic assets with clear definitions and access rules.

Semantic assets should carry classification metadata. A metric may be broadly visible while the underlying raw table is restricted. A view may mask sensitive fields. A dimension may be allowed only for certain roles. Agents need to know these boundaries.

This is also how secure lakehouses support AI without exposing raw sensitive data. Agents can work through curated metrics, governed views, and narrow tools. Raw data inspection remains limited to approved workflows.

## Agent Access Inside the Boundary

If AI agents operate inside a private lakehouse, they should be treated as workload identities with specific permissions. They should not borrow a human admin account. They should not receive broad storage credentials. They should not be able to discover every dataset by default.

Agent tools should be scoped. A tool might retrieve approved metric definitions, run a governed query, inspect lineage for a permitted asset, or request a maintenance action. Higher-risk actions should require approval.

Every tool call should be logged. The log should include the user or agent identity, tool name, dataset, semantic asset, query, table snapshot where possible, policy decisions, and response status. In secure environments, this is how teams maintain accountability.

Agents should also have refusal behavior. If data is restricted, stale, undefined, or outside the agent's scope, the correct answer is not a guess. The correct answer is a clear refusal or escalation.

![Papercut secure AI agent access pattern with approved tools, semantic layer, query service, catalog, private Iceberg tables, and audit loop](/images/2026/week-2026-07-06/private-air-gapped-data-lakehouses-iceberg-secure-clouds-diagram-3.png)

## Software Supply Chain and Upgrades

Air-gapped lakehouses require a plan for software supply chain. Engines, libraries, connectors, container images, model artifacts, and security patches must be imported through approved processes. This is often more work than the initial architecture diagram suggests.

The platform team should maintain an internal artifact repository. Dependencies should be scanned and approved. Upgrade procedures should be rehearsed in a staging environment that mirrors production constraints. Rollback plans should be documented.

Iceberg table compatibility should be part of upgrade testing. If a new engine version changes support for delete files, schema evolution, catalog behavior, or table properties, the team needs to know before production workloads are affected.

Agent tooling adds another layer. Prompt templates, tool definitions, model versions, evaluation datasets, and policy rules should be versioned and reviewed. In secure environments, "just pull the latest package" is not a plan.

## Observability and Audit

A private lakehouse needs deep observability. It should capture query latency, catalog latency, table maintenance health, file counts, metadata growth, failed authorization events, agent tool calls, and data quality signals.

Audit logs should be protected and retained according to policy. They should be searchable by user, workload, dataset, table snapshot, semantic asset, and time window. If an incident occurs, the team should be able to reconstruct what happened.

Observability also supports performance management. If query performance degrades, the team needs to know whether the cause is file layout, stale metadata, catalog latency, network constraints, concurrency, or engine configuration.

In air-gapped environments, external telemetry may be restricted. The platform must provide enough local observability to operate independently.

## Backup, Recovery, and Continuity

Secure lakehouses need recovery planning. Backing up data files without metadata is not enough. Backing up metadata without data files is not enough. Iceberg tables depend on the relationship between metadata files, manifests, snapshots, and data files.

Recovery procedures should be tested. Can the team restore a table to a previous snapshot? Can it recover after accidental metadata deletion? Can it rebuild catalog state? Can it verify that restored data matches audit expectations?

Continuity planning should also account for identity systems, catalogs, query engines, semantic metadata, and audit logs. A lakehouse is a system, not a bucket.

## The Dremio-Positive Reading

This topic is naturally favorable to a Dremio Lakehouse approach because secure organizations still need openness and performance. They cannot solve every problem by centralizing data in a public SaaS warehouse. They need strong query access inside controlled infrastructure.

Open Iceberg tables help preserve portability. Query federation helps reach internal systems without unnecessary copying. Semantic layers help agents and humans work from approved definitions. Acceleration helps keep governed access usable. Agentic interfaces can operate safely when they call scoped tools over trusted assets.

The conclusion is not "security means no innovation." The conclusion is that innovation has to live inside the security model.

## Practical Deployment Checklist

Define the boundary. Be specific about network isolation, approved ingress and egress, identity sources, and operational constraints.

Choose storage that supports durability, encryption, audit, backup, and internal access patterns.

Deploy catalog services inside the boundary. Protect metadata as sensitive.

Run query engines close to the data. Avoid designs that require sensitive data to leave the environment.

Build semantic assets for approved analytical use cases.

Scope agent tools narrowly. Log every tool call.

Establish software supply-chain procedures for engines, connectors, models, and dependencies.

Test upgrades against table-format compatibility.

Monitor table health, query performance, catalog behavior, and policy decisions locally.

Test backup and recovery before production reliance.

## Data Movement In and Out

Highly secure environments need an explicit data movement policy. What data can enter? What data can leave? Who approves transfers? How are transfers scanned, logged, and reconciled?

Inbound data may come from operational systems, partner feeds, sensor networks, batch exports, or controlled media. Each path needs validation. Files should be checked for integrity, malware, schema compatibility, classification, and provenance before they become lakehouse tables.

Outbound data is even more sensitive. Aggregated reports, model outputs, audit extracts, and derived datasets may all carry information that policy treats as controlled. A secure lakehouse should make export workflows explicit. Users should not be able to bypass governed query layers by copying raw files.

For Iceberg tables, data movement must account for metadata as well as data files. Moving a table between environments requires preserving the relationship between metadata files, manifests, snapshots, and data files. A partial transfer can create confusion or break reproducibility.

This is another reason semantic assets are useful. In many cases, users do not need raw data to leave the boundary. They need approved aggregates, metrics, or reports. A semantic layer can reduce the pressure to export sensitive detail.

## AI Models in Secure Lakehouses

Agentic lakehouse discussions often focus on data access, but model deployment matters too. In air-gapped or private environments, teams may not be allowed to call external model APIs. They may need internally hosted models, approved model weights, controlled inference services, and local evaluation workflows.

The model supply chain should be treated like the software supply chain. Model artifacts need provenance, approval, scanning, versioning, and rollback. Prompt templates and tool definitions should be stored and reviewed. Evaluation datasets should remain inside the boundary if they contain sensitive examples.

Agents should run close to the governed data services they use. If an agent calls a query tool, semantic tool, or lineage tool, that call should stay inside the approved network path. The agent should not smuggle context to an external system.

This is where open lakehouse architecture and local AI deployment reinforce each other. The data remains in controlled storage. The table metadata remains in local catalogs. The query engine runs inside the boundary. The agent uses local tools. The audit trail remains available for review.

## Compliance Readiness Without Overclaiming

No table format or query engine makes an organization compliant by itself. Compliance depends on laws, policies, controls, evidence, and operating discipline. The lakehouse can help produce that evidence, but it cannot replace governance work.

A private lakehouse should be able to show who accessed data, which policies applied, which table version was queried, which semantic definition was used, and which agent tool produced a result. It should also show how data entered the system, how it changed, and how long it was retained.

Those capabilities support compliance readiness. They help teams answer questions from auditors, security reviewers, and business owners. They also support internal accountability when an AI system produces a questionable answer or action.

The key is to design for evidence before the incident. Retrofitting auditability after agentic workflows are already in production is painful.

## A Reference Operating Day

Imagine a secure analytics team starting its day. Overnight ingestion jobs landed approved files into private object storage. Validation services checked schemas and row counts. Iceberg metadata was committed through the internal catalog. Maintenance jobs compacted a high-use table. The semantic layer refreshed certified metrics. Audit logs recorded each step.

An analyst later asks a question through a governed SQL interface. The query engine checks identity, resolves the semantic definition, reads the relevant Iceberg snapshot, applies column masking, and returns an answer. The audit system records the table snapshot, metric definition, and policy decisions.

An internal agent then investigates an anomaly. It can inspect only approved metrics, retrieve lineage for permitted assets, and run scoped queries. It cannot browse raw storage, export files, or change access policies. When the agent recommends a follow-up action, the workflow requires human approval.

That operating day is not flashy. It is the point. Secure lakehouses succeed when strong controls become ordinary work rather than emergency ceremony.

## Performance Pressure Inside the Boundary

Performance deserves special attention because secure users still have real deadlines. If governed systems are too slow, people will ask for extracts, local copies, or special access paths. Those exceptions can become security problems.

A private lakehouse should treat performance as part of control. Iceberg table maintenance, file sizing, partition evolution, metadata cleanup, query acceleration, and workload management all reduce the temptation to bypass the platform. Fast governed access is safer than slow governed access plus informal workarounds.

Agentic workflows increase this pressure. An agent may run several queries to answer one question. It may compare time windows, inspect lineage, validate a threshold, and summarize results. If each step is slow, the workflow becomes impractical. If the team responds by giving the agent broader direct access, the security model weakens.

The better answer is to make the secure path performant. That is why acceleration and autonomous optimization belong in the private lakehouse conversation, not only in cloud analytics marketing.

Security and speed should reinforce each other when the architecture is working.

That is the standard secure analytics teams should expect.

It is achievable.

Today.

## The Direction of Travel

Private and air-gapped lakehouses will become more important as AI reaches regulated and mission-critical environments. The organizations with the strictest controls still need modern analytics. They still need open tables. They still need semantic context. They still need agents that can help without bypassing policy.

Apache Iceberg provides a strong table foundation, but the secure lakehouse is much more than a table format. It is a coordinated system of storage, catalog, query, semantics, identity, audit, operations, and agent controls.

That is where the Dremio Lakehouse approach becomes compelling. It points toward a world where open, governed, high-performance analytics can live where the data needs to live.

For more of my thinking on data lakehouse and AI architecture, explore my books at [books.alexmerced.com](https://books.alexmerced.com). To try a modern Agentic Lakehouse experience, visit [dremio.com/get-started](https://www.dremio.com/get-started).
