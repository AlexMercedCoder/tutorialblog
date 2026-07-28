---
title: "Governing Iceberg Tables Across Regions Without Three Sets of Permissions"
date: "2026-07-28"
description: "Catalog federation gives you one authorization model and one audit point across regions. Here's what it solves, what it doesn't, and how to build a topology you can actually govern."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Apache Polaris
  - Data Governance
  - Multi-Region
canonical: "https://iceberglakehouse.com/posts/multi-region-catalog-federation/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/multi-region-catalog-federation/).

# Governing Iceberg Tables Across Regions Without Three Sets of Permissions

An engineer needs to join sales data in eu-west-1 with product data in us-east-1. The sales tables live in a Polaris instance the European team runs. The product tables sit in AWS Glue in a US account. A third team has tables in a separate REST catalog nobody remembers standing up.

The join is a twenty-line query. Getting permission to run it takes three weeks, because it requires an access request in each system, three different approvers, and three different mental models of what a grant means. Two of the three approvers do not know what the third system is.

This is what multi-cloud, multi-region lakehouse governance looks like without a federation strategy. The data is in open formats. The engines can all read Iceberg. And the permission model is a fragmented set of per-system decisions that no one person can reason about.

I work at Dremio, which co-created Apache Polaris with Snowflake and ships a commercial catalog built on it, so I have an interest in this topic. The mechanics below come from the Apache project and its documentation.

This piece covers why the fragmentation happens, what catalog federation does and does not solve, how credential vending changes the security picture across regions, where cross-region reads get expensive, and how to design a topology you can actually govern.

## Why the estate fragments

Nobody plans a fragmented catalog estate. It accumulates, and the mechanisms are worth naming because they predict where the next one comes from.

**Acquisitions.** The acquired company had a Hive Metastore and a warehouse. Migration is scheduled for a quarter that keeps moving.

**Data residency.** European customer data has to stay in Europe, so a separate deployment exists for legal reasons rather than technical ones. That one is not going away.

**Cloud diversity.** One business unit ran on Google Cloud before the standardization decision. Their tables are in GCS and their catalog is whatever they used.

**Team autonomy.** A platform team stood up its own REST catalog because the central one had a six-week onboarding process. This is the most common cause and the least discussed.

**Vendor boundaries.** A partner shares data through their own catalog. You do not control it and you are not going to.

Four of those five are not solvable by migration. Residency is legal, vendor boundaries are contractual, cloud diversity is expensive to unwind, and acquisitions keep happening. Any strategy premised on consolidating everything into one catalog is planning for a state that will not arrive.

So the design question is not how to consolidate. It is how to govern a set of catalogs you will keep having.

The options for a fragmented estate compare like this.

| | Do nothing | Migrate everything | Federate | Federate plus selective migration |
|---|---|---|---|---|
| Time to first value | N/A | Quarters | Weeks | Weeks |
| Handles residency constraints | Yes | No | Yes | Yes |
| Handles partner catalogs | Yes | No | Yes | Yes |
| Single authorization model | No | Yes | Yes | Yes |
| Writes work everywhere | Yes | Yes | No | Partly |
| Long-run operational surface | Highest | Lowest | Moderate | Low |

The last column is the one most estates should land on. Federate now so governance works this quarter, and migrate the catalogs that genuinely can move over the following year. Treating federation and migration as alternatives is the mistake; they are sequential.

## What federation actually does

Catalog federation means one catalog instance presents tables that live in other catalogs alongside tables it owns directly.

In Polaris the distinction is explicit. **Internal catalogs** hold tables Polaris owns and manages, readable and writable through Polaris. **External catalogs** are managed by another provider, with tables synced into Polaris and read-only there. External sources include AWS Glue, Hive Metastore, and other Iceberg REST endpoints.

The read-only property on external catalogs is correct rather than a limitation. Another system owns the writes to those tables, and a second writer with a different view of the metadata is how you corrupt a table.

What federation buys you is worth being precise about, because it is often oversold.

**One discovery surface.** A client connects to one endpoint and sees the estate. No per-system integration, no wondering which catalog holds a table.

**One authorization model.** Grants on federated tables use the same principal-role-to-catalog-role-to-grant structure as everything else. The question "what can this identity see" has one answer rather than four partial ones.

**One audit point.** Access requests flow through one service, so the record of who read what lives in one place.

**Reversible engine choices.** Because engines configure against the Iceberg REST protocol, and federation lets a new catalog coexist with the old one, catalog decisions stop being the one-way doors they were in the Hive era.

What federation does not buy you:

**It does not move data.** A table in eu-west-1 is still in eu-west-1. Federation changes the metadata path, not the data path. Every byte still crosses whatever network it crossed before.

**It does not eliminate the source system.** Glue still runs, still costs money, and still needs its own administration. Federation adds a governance layer over it rather than replacing it.

**It does not make writes work everywhere.** Federated tables are read-only through the federating catalog. Writes go to the owning system.

**It does not fix schema or semantic differences.** Two systems calling different things `customer_id` remains a data modeling problem.

That last set is where expectations break. Federation solves the governance fragmentation problem well and solves none of the physics.

## Credential vending across boundaries

The security mechanism that makes federation more than a directory is credential vending, and its cross-region behavior is where the design gets interesting.

The basic flow: a client asks the catalog to load a table. The catalog evaluates the principal's grants, and if the read is allowed, returns table metadata plus temporary storage credentials scoped to that table's location. The client reads data files directly from object storage with those credentials, which expire on a short timer. Query engines never hold long-lived storage keys.

Polaris extends this to federated catalogs. Federated credential vending means Polaris mints credentials on behalf of external catalogs rather than each client managing its own credentials against each storage system. Configuration gates it, since credential vending for external catalogs requires the external catalog credential vending setting to be enabled first.

Three consequences matter in a multi-region estate.

**One authorization decision covers many storage systems.** A principal reading a Glue-backed table in a US account and a Polaris-owned table in a European bucket gets both decisions from the same grant model, with credentials minted per request against each storage system. You revoke once and it takes effect everywhere.

**Credential sprawl stops growing.** The alternative is every engine in every region holding keys for every bucket it touches. That set only ever grows, and rotating it is a project. Vending replaces it with a per-request mint.

**Latency is added, per request.** Each credential mint involves a call to the cloud provider's token service, typically in the range of 100 to 200 milliseconds. On a query loading many tables, or an agent loading tables in a loop, that adds up. Cross-region it is worse, because the catalog and the storage system are further apart.

That third point drives a real design decision. Cache vended credentials for their validity window rather than minting per table load. Most clients do this. Verify that yours does, because a client that mints per request against a remote catalog turns a governance improvement into a latency complaint.

Two more capabilities worth knowing about in current Polaris. On GCP, federated catalogs backed by GCS can use Iceberg's GoogleAuthManager for credential pass-through, which supports an end-user credentials approach as an alternative to relying solely on OAuth. And GCS principal attribution through Workload Identity Federation chains a catalog-signed token through an STS exchange and service account impersonation, so the Polaris principal appears in GCS data access audit logs rather than a generic service identity. That second one matters for exactly the audit question this article is about: without it, cloud-side audit logs show the catalog's service account for every access, which is useless for attribution.

## Authorization that scales past one catalog

Polaris uses a two-tier RBAC model, and understanding the split is what makes multi-catalog grants manageable.

**Principal roles** attach to identities. They represent who someone or something is: a data engineer, an analytics agent, a partner integration.

**Catalog roles** attach to catalogs and carry the actual privileges on namespaces, tables, and views. They represent what can be done in a specific catalog.

A principal role is granted catalog roles. That indirection is the whole point. Adding a fourth catalog to your estate means creating catalog roles in it and granting them to existing principal roles. The identity side does not change, and no individual principal gets touched.

Without that indirection, adding a catalog means updating every principal that needs access to it, and the work scales with headcount rather than with catalogs.

Two configuration behaviors deserve attention in federated setups.

Polaris can create synthetic entities for entities in federated catalogs that do not exist in the local metastore, which is what lets you write RBAC rules against federated tables Polaris does not own. There is also a catalog property controlling sub-catalog RBAC for federated catalogs, and a server-level setting governing whether that property can be set or changed at all. Decide these deliberately. The default behavior determines whether a team administering a federated catalog can adjust its own authorization surface, which is a governance question rather than a technical one.

For organizations that already run a policy system, Polaris 1.5.0 added a pluggable authorizer interface that separates the authorization decision from Polaris's internal principal resolution, so external authorizers do not need to understand Polaris-native RBAC concepts. Apache Ranger support arrived in beta, joining Open Policy Agent as a second external authorizer.

That matters in a multi-region estate for a specific reason. Organizations with a mature access-control practice usually already have policies expressed somewhere, often covering more than the lakehouse. Reimplementing those policies in a catalog's native model creates two sources of truth that drift. Pointing the catalog at the existing authorizer keeps one.

The realm mechanism handles hard multi-tenancy. Polaris supports realms with per-realm credentials, and a useful safety property: when realm-specific credentials are provided but incomplete, the server does not fall back to global credentials for that realm. A partial configuration failing closed is the correct behavior, and it is what stops a client scoped to a development realm from silently authenticating against production.

## When consolidation is actually the right answer

Federation is the default and it is not always the answer. Some catalogs should go away, and knowing which is worth the analysis.

Three signals that a catalog is a migration candidate.

**No structural reason to exist.** It was stood up because central onboarding was slow, or because one team preferred a different tool. The data has no residency constraint, no partner ownership, no cloud dependency. It exists because of an organizational moment that has passed.

**Writes matter.** Federated tables are read-only through the federating catalog. If consumers need to write, federation forces them back to the source system, which means they keep two configurations and the governance benefit is partial. A catalog whose tables are actively written by many consumers is a stronger migration candidate than one that serves reads.

**The operational cost is real.** Every catalog needs upgrades, backups, monitoring, and someone who knows how it works. A catalog holding forty tables costs nearly as much to operate as one holding four thousand. Small catalogs are the ones where the operational overhead is most disproportionate.

Against those, three signals to leave it alone.

**Legal or contractual constraint.** Residency, partner ownership, regulatory separation. No amount of engineering elegance overrides these, and attempting the migration wastes a quarter and produces a compliance question.

**Active migration fatigue.** A team that has been through two platform migrations in three years has a limited appetite for a third, and a technically correct migration that the team resists produces a shadow system rather than consolidation.

**The source is the system of record for something else.** A Hive Metastore that also serves a legacy processing framework nobody is retiring is not really a catalog you can migrate. It is part of another system.

For the ones that should move, the mechanics are more approachable than people expect. Iceberg tables are self-describing, so migration is registering existing tables against a new catalog rather than rewriting data. The Polaris project ships tooling for this, including a catalog migrator and a synchronizer, which is worth knowing before anyone writes a custom script.

The sequencing that works: federate first so governance is unified immediately, then migrate the movable catalogs on a normal roadmap, then decommission. Federation makes the migration optional rather than urgent, which is what lets it happen at a sane pace and lets you stop partway without the estate being in a broken state.

One caution on the cutover. Registering tables in a new catalog while the old one still points at them creates two writers, which is how you corrupt a table. The migration has to include a hard cutoff on the old catalog's write path, verified rather than announced.

## The physics you cannot federate away

Governance unifies. Data movement does not, and this is where multi-region designs go wrong.

**Egress charges.** Reading data across a cloud region boundary or between clouds costs money per byte, and the rates are not small at analytical volumes. A single unfiltered cross-region scan of a large table produces a line item people notice. Federation makes that query easy to write, which is exactly the risk.

**Latency on the data path.** Object storage reads across regions run at a fraction of same-region throughput, with much higher per-request latency. A query that scans 500 files locally in eight seconds takes far longer when those files are a continent away, and the difference is dominated by round trips rather than bandwidth.

**Compliance boundaries.** If European customer data cannot leave Europe, a query engine in us-east-1 reading those files is a violation regardless of how elegant the catalog topology is. The catalog made access possible and the law says no.

Three patterns handle this, and choosing among them is the core architectural decision.

**Compute follows data.** Run an engine in each region, and route queries to the engine nearest the data. Cross-region joins are handled by moving the smaller side. This is the default and the right answer for most estates.

**Replicate the small side.** Reference data, dimensions, and lookup tables are usually small and change slowly. Replicating them to every region means most joins become local. A 40 GB dimension table replicated to three regions is cheap and removes a large share of cross-region traffic.

**Federate metadata, restrict data.** For compliance-bound data, let the catalog present the table so people know it exists and can see its schema, while grants prevent reads from outside the permitted region. Discoverability without access is a legitimate and useful state, and it beats pretending the table does not exist.

The catalog's own placement is a separate question with a simpler answer. Metadata operations are small and frequent, and query planning waits on them. Put the catalog where the engines are, or run a catalog per region with federation between them, rather than making every engine in every region round-trip to one continent for every table load.

## Building the topology

Concretely, here is a shape that works for a three-region estate.

A Polaris instance per region. Each owns the internal catalogs for tables physically in that region. Each federates the other regions' catalogs plus any external systems relevant to it, such as a Glue catalog in a US account or a partner's REST endpoint.

Principal roles are defined consistently across regions with the same names, because an identity called `analytics-reader` meaning different things in different regions is a governance failure waiting to happen. Catalog roles are region-specific and carry the actual privileges.

Configuration for a client against one region:

```properties
# Engine configuration against the regional Polaris
iceberg.catalog.type=rest
iceberg.catalog.uri=https://polaris.eu-west-1.example.com/api/catalog
iceberg.catalog.warehouse=eu_analytics
iceberg.catalog.security=oauth2
iceberg.catalog.oauth2.credential=${CLIENT_ID}:${CLIENT_SECRET}
iceberg.catalog.oauth2.scope=PRINCIPAL_ROLE:analytics_reader
iceberg.catalog.vended-credentials-enabled=true
aws.s3.region=eu-west-1
```

The `vended-credentials-enabled` setting is the one to check. With it off, the engine falls back to whatever static credentials it holds, which defeats the purpose and does so silently. Assert on it in your deployment configuration rather than trusting it stayed set.

The scope names the principal role, which is what the two-tier model gives you: the client asks for a role, and the grants attached to that role in this catalog determine what it sees.

Three rules for keeping this governable.

**Name things identically across regions.** Principal roles, namespace structure, table naming. An engineer moving between regions should find the same shapes. Divergence here is the thing that makes the estate feel like four systems again.

**Define ownership per catalog, written down.** Who administers it, who approves grants, who gets paged. A federated catalog with no named owner becomes the one nobody maintains.

**Automate the grant model.** Principal roles and catalog roles defined in configuration under version control, applied by a pipeline. Hand-administered RBAC across four catalogs drifts within a quarter, and the drift is discovered during an audit.

## Putting numbers on the cross-region question

Architectural arguments about data movement land better with arithmetic, and the arithmetic is simple enough to do before the design meeting.

Three costs to model.

**Egress per byte.** Cross-region and cross-cloud transfer is charged per gigabyte at rates that are small individually and meaningful at analytical volume. Take your rate, multiply by the bytes a typical cross-region query scans, and multiply by expected query frequency. A 400 GB scan run twenty times a day is 8 TB a day of egress, and at any current rate that is a number worth a design decision.

**Latency cost.** Not billed directly, and it shows up as compute time. Object storage reads across regions have higher per-request latency, and a scan touching thousands of files pays that latency per request. The practical effect is that the same query costs more compute-seconds when the data is remote, on top of the egress.

**Replication cost.** Storing a copy in a second region costs storage plus the transfer to get it there plus the pipeline to keep it current. For a table that changes daily, the ongoing transfer is the recurring cost and it is bounded by the change volume rather than the table size.

The comparison that decides the pattern: replication costs the change volume per period, and cross-region reading costs the scan volume per query. A 200 GB dimension table that changes by 2 GB a day and gets joined in forty queries a day is dramatically cheaper to replicate. A 40 TB fact table queried twice a week from another region is cheaper to read remotely, assuming compliance allows it.

The crossover is roughly where daily change volume approaches daily scan volume. Below it, replicate. Above it, read remotely or move the compute.

Two practical notes.

Push the join down when you can. A cross-region join that transfers a filtered and aggregated result rather than raw rows moves orders of magnitude less data. Whether your engine does this depends on the engine, and it is worth verifying rather than assuming, because the difference is large enough to change the architecture.

Watch for the query that scans a remote table to compute something small. An agent or a dashboard that pulls 400 GB across a region boundary to produce one number is the shape that generates surprising bills, and it is almost always fixable with a materialized aggregate in the remote region.

## Onboarding a new catalog

This happens more often than the design work suggests, since acquisitions and new business units arrive on their own schedule. Having a runbook turns a two-week project into a two-day one.

**Establish ownership before anything technical.** Who administers this catalog, who approves grants against it, who gets paged. If nobody will claim it, that is the finding, and federating an unowned catalog just distributes the problem.

**Classify the data.** Residency constraints, sensitivity classification, and whether any of it is subject to contractual restrictions. This determines the grants and it is much cheaper to establish now than to reconstruct later.

**Inventory the writers.** Every process that writes to these tables. Federated tables are read-only through the federating catalog, so every writer keeps its existing path, and you need to know what they are before someone assumes otherwise.

**Register it as an external catalog.** Configure the connection and the credentials Polaris uses to sync. Verify that sync actually runs and that a schema change on the source appears within the expected window. Test this rather than trusting the configuration, because a sync that silently fails looks identical to one that has nothing to report.

**Create catalog roles matching your standard set.** If your estate has `reader`, `writer`, and `admin` catalog roles, create the equivalents here even where some are unusable due to read-only status. Consistency is what makes the estate comprehensible.

**Grant the existing principal roles.** This is the step the two-tier model makes trivial. Attach the new catalog roles to the principal roles that already exist, and every identity that should have access gets it without individual changes.

**Verify credential vending end to end.** Have a client load a table and confirm it receives vended credentials rather than falling back to static ones. This is where misconfiguration hides, since a client with static credentials that happen to work looks successful.

**Check the audit trail.** Read a table and confirm the access appears in both the catalog record and the cloud-side log, with an identity you can attribute. If cloud logs show a generic service identity, enable principal attribution where your cloud supports it before this catalog carries real traffic.

**Document it.** One page: what it holds, who owns it, what the constraints are, whether it is a migration candidate and on what timeline. The undocumented federated catalog is the one that becomes an orphan in eighteen months.

The whole runbook is a day of work when the answers are known and a week when they are not, and the week is mostly spent finding an owner. That is the honest bottleneck in most estates.

## Disaster recovery across a federated estate

Federation changes what an outage looks like, and most designs do not think it through until the first one.

Three failure shapes, with different blast radii.

**A source catalog goes down.** Its federated tables become unavailable through your catalog, since Polaris syncs metadata but the data still lives behind the source's storage configuration. Queries touching those tables fail. Everything else works. This is the benign case and it is what federation buys you: a partial failure stays partial.

**A regional Polaris instance goes down.** Every engine configured against it loses catalog access, which means no query planning, which means everything in that region stops. Data is untouched and unreachable. The recovery is standing the catalog back up, which depends entirely on your backup posture for its persistence backend.

That second one deserves attention because it is the highest-impact single point in the design. Polaris runs on a JDBC backend, with Postgres and CockroachDB both documented. Your catalog's availability is your database's availability. Treat the catalog database with the operational seriousness of a production transactional store, meaning replication, tested restores, and a documented recovery time. Teams routinely run a production catalog on a database with a backup nobody has ever restored from.

**A storage region goes down.** Data is unreachable and the catalog is fine. Queries touching that region fail with storage errors rather than catalog errors, which is a useful diagnostic distinction to know in advance.

Two design choices materially improve the picture.

**Fail gracefully on federated catalog errors.** An engine configured to abort on any catalog error takes the whole estate down when one federated source is unavailable. Configure clients to degrade, so a query touching only healthy catalogs succeeds. Test this by deliberately breaking a federated source in a non-production environment, because the default behavior is often the bad one.

**Keep the grant model reproducible.** If your principal roles, catalog roles, and grants live in version-controlled configuration applied by a pipeline, rebuilding a catalog is restoring the database and reapplying the configuration. If they were hand-administered over two years, rebuilding is an archaeology project conducted under time pressure.

That second point is the practical payoff of the automation recommendation elsewhere in this article. Version-controlled RBAC is usually justified on audit grounds, and its disaster recovery value is larger and rarely mentioned.

One thing worth testing on a schedule: restore the catalog database into a scratch environment, apply the grant configuration, and point a client at it. An annual drill takes a day and converts a documented recovery plan into a verified one. The gap between those two is where outages become long ones.

## Failure modes

**Sync lag on federated catalogs.** External catalogs sync metadata rather than sharing it live. A schema change in Glue appears in Polaris at the next sync, and queries between those moments run against stale metadata. Warning sign: column-not-found errors shortly after an upstream schema change. Fix: set sync cadence from how fast the source actually changes, and verify the number rather than assuming it.

**A cross-region query nobody meant to write.** Federation makes a table in another continent look like a local one, and an engineer joins it without noticing. The egress bill arrives a month later. Warning sign: egress charges that do not correlate with any known pipeline. Fix: make region visible in namespace naming, and alert on cross-region scan volume.

**Compliance violation through a legitimate grant.** Someone grants access to a residency-restricted table without knowing about the restriction. The catalog enforces the grant faithfully. Warning sign: nobody can list which tables carry residency constraints. Fix: tag those tables in metadata, and put an approval step on grants that touch them.

**Credential minting on the hot path.** A client that does not cache vended credentials pays the token service round trip on every table load, and cross-region that round trip is worse. Warning sign: query planning time dominated by catalog and token calls rather than by metadata reads. Fix: verify client-side caching, and check the credential validity window is long enough to be worth caching.

**Divergent role names.** `analytics_reader` in one region and `analytics-read` in another, with slightly different privileges. Warning sign: access requests that specify a region because the requester knows the names differ. Fix: define principal roles once in configuration applied to all regions.

**The federated catalog nobody owns.** Stood up during a migration, still federated, tables still visible, and the person who ran it left. Warning sign: catalogs whose owner field is empty or names a former employee. Fix: quarterly inventory with an owner named per catalog, and a decommission path for orphans.

**Assuming federation means writable.** A team builds a pipeline writing to a federated table and discovers it is read-only through Polaris. Warning sign: this shows up in development, which is the good case. Fix: document which catalogs are internal and which are external, prominently.

**Audit logs that attribute everything to the catalog.** Cloud-side access logs show the catalog's service identity for every read, so cloud audit and catalog audit cannot be reconciled. Warning sign: an auditor asking who read a bucket and getting one answer for everything. Fix: enable principal attribution where your cloud supports it, and keep the catalog-side record as the primary attribution source.

## Operational guidance

**Inventory before designing.** Every catalog, its owner, its region, its storage backend, whether it is internal or external, and whether it is a migration candidate. Most organizations discover two catalogs they forgot about, and finding them during design beats finding them during an incident. A useful way to surface the forgotten ones: check which storage buckets carry Iceberg metadata directories and work backward to whatever is writing them.

**Decide the residency map first.** Which datasets have legal constraints on where they live and where they can be read from. This constrains everything downstream and it is a legal input rather than an engineering choice. Get it in writing, from someone who owns the answer, and re-confirm it when you enter a new market or sign a new data-sharing agreement.

**Put the catalog near the compute.** Planning waits on metadata operations. A catalog a continent away from its engines adds latency to every query, including ones that read purely local data.

**Cache vended credentials, and check that you do.** This is the single most common performance issue in a federated setup and the easiest to verify. Load one table with debug logging on and count the token service calls; anything above one per credential lifetime means caching is off.

**Alert on cross-region data movement.** Not on cost, which arrives late, but on bytes read across a region boundary, which you can see the same day.

**Replicate reference data.** Small, slow-changing dimensions replicated to every region remove a disproportionate share of cross-region traffic for very little storage. Pick the candidates by counting how often each table appears on the non-local side of a cross-region join, not by table size alone.

**Set a sync-lag alert on every federated catalog.** Metadata that has not synced in longer than its expected window is a silent correctness risk, since queries run against stale schemas without erroring. Alert on staleness rather than on sync failures, because a sync process that stopped running produces no failures at all.

**Keep a written residency map and review it quarterly.** Which datasets have constraints, what the constraints are, and which grants they affect. This document is what an auditor asks for, and reconstructing it under pressure is much harder than maintaining it.

**Version-control the grant model.** Principal roles, catalog roles, and their relationships as configuration, applied by a pipeline, reviewed like code. This is what makes the estate auditable.

**Test the failure mode where one region is unreachable.** A regional catalog outage should degrade queries touching that region and leave everything else working. Verify that rather than assuming it, because a client configured to fail hard on any catalog error takes the whole estate down with one region.

## The agent wrinkle

Automated consumers change the federation calculus in ways worth planning for, because they arrive after the topology is set and stress it differently than human users do.

**Discovery volume goes up sharply.** A human opens a catalog browser once and remembers what they found. An agent lists namespaces and describes tables on every session, and it does so against whatever endpoint it is pointed at. On a federated instance presenting four hundred tables across four catalogs, an agent doing broad discovery generates hundreds of metadata calls per session.

The implication for topology: put the agent's endpoint close to the agent, and make sure the federating catalog caches synced metadata rather than proxying every describe call to the source. A federated describe that round-trips to a Glue catalog in another account, per table, per session, is a latency problem that shows up as the agent feeling slow.

**Cross-region queries become easier to write accidentally.** This is the failure mode from earlier, amplified. A human engineer joining two tables generally notices they are in different regions, because they had to find both. An agent presented with a single unified namespace has no signal that one table is local and one is a continent away, and no reason to care.

The fix is to make region legible in the namespace structure, so `eu.sales.orders` and `us.product.catalog` are visibly different, and to expose that fact in whatever descriptions the agent reads. A dataset description that says this table is in eu-west-1 and cross-region joins against it are expensive gives the model something to reason with. It is not a control, and it does reduce the accident rate.

The actual control is grants. An agent principal scoped to one region's catalog roles cannot write a cross-region join, because it cannot see the other region. For agents serving a regional team, that is usually the correct scoping anyway.

**Credential minting multiplies.** An agent loading twelve tables in a session, without client-side caching, pays twelve token service round trips. Cross-region that is meaningful latency on every session. Verify caching for agent clients specifically, since they are often custom code rather than a mature engine with sensible defaults.

**Attribution becomes more important, not less.** With human users, a cloud audit log showing a service identity is annoying. With agents, it is disqualifying, because the whole question in an agent access review is which agent read what. This is the argument for enabling principal attribution before agents arrive rather than after.

None of this changes the topology recommendation. It sharpens the case for putting catalogs near compute, caching aggressively, and scoping principals narrowly, all of which were already the right calls.

## Where this is heading

Three directions worth watching.

The catalog is becoming a general asset registry rather than a table registry. Community work on extending the catalog toward tables, views, functions, metrics, and models points at a state where the governance boundary covers everything a consumer needs rather than just the data. In a multi-region estate that matters more than in a single one, because semantic definitions diverging across regions is exactly the failure federation is meant to prevent.

Authorization is externalizing. The pluggable authorizer interface, with Ranger and OPA as implementations, moves policy decisions out of the catalog and into systems built for policy. That is the right layering for organizations whose access rules span more than the lakehouse, and I expect more integrations.

The unresolved problem is cross-catalog transactions. Reading across federated catalogs works. Writing atomically across them does not, and the failure modes when a multi-catalog operation partially succeeds are unpleasant. Most designs sidestep this by keeping writes local to one catalog, which is the right call today and a real constraint on what you can build.

## Conclusion

A multi-region, multi-cloud catalog estate is the normal end state, not a failure of planning. Residency law, acquisitions, vendor boundaries, and team autonomy all produce catalogs you keep, and a strategy built on consolidating everything into one is planning for a world that does not arrive.

Federation is the answer to the governance half. One discovery surface, one authorization model, one audit point, with external catalogs presented read-only because their owning systems still own the writes. The two-tier RBAC split, principal roles for identity and catalog roles for privilege, is what keeps grants manageable as catalogs multiply, because adding a catalog does not mean touching every identity.

Credential vending is what makes it a security boundary rather than a directory, and it extends across federated catalogs so one revocation takes effect everywhere. Cache the vended credentials, since minting on every table load turns a governance win into a latency complaint.

What federation cannot do is move data or repeal egress pricing. Design the data path separately: compute in each region, reference data replicated, and compliance-bound tables discoverable but not readable from outside their permitted region.

Then automate the grant model and put it under version control. An estate of four catalogs administered by hand diverges within a quarter, and the divergence is discovered by an auditor rather than by you.

## Keep Going

If this piece was useful, I have written a lot more on catalogs and lakehouse architecture. *Apache Polaris: The Definitive Guide*, which I co-authored for O'Reilly, covers the RBAC model, credential vending, and federation mechanics behind everything in this article. *Architecting an Apache Iceberg Lakehouse* from Manning takes the same material up into multi-region platform design. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
