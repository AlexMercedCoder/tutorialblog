---
title: "What Zero-Copy Actually Costs"
date: "2026-07-25"
description: "Six architectures share the phrase zero-copy, and they have different costs, failure modes, and governance stories. A walk through federation, virtualization, sharing protocols, and materialization."
author: "Alex Merced"
category: "Data Engineering"
tags:
  - zero-copy
  - data federation
  - data sharing
  - apache iceberg
  - egress costs
canonical: https://iceberglakehouse.com/posts/zero-copy-actually-costs/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/zero-copy-actually-costs/).

A vendor demo I watched last year ended with a slide that said "no data movement." Thirty seconds earlier, the presenter had run a query joining a cloud warehouse table to an operational database and returned results in four seconds. Both statements were true. The bytes still moved. They moved over a network, from one region, into an engine, and then most of them were discarded after a filter that the remote system never saw.

The phrase "zero-copy" has become the most overloaded term in data architecture. Six genuinely different architectures use it, they have different failure modes, different cost profiles, and different governance stories, and buyers keep comparing them as if they were the same thing. A team picks the wrong one, discovers the cost in production, and concludes that federation does not work or that sharing is slow. Usually the technology was fine and the fit was wrong.

This is a walk through all six patterns: what each actually does with the bytes, what each costs, what breaks, and how to decide. I work at Dremio, now part of SAP, and query federation is one of the things we sell, so I have every incentive to oversell this category. I am going to do the opposite, because the fastest way to make federation look bad is to point it at a workload it was never built for.

## Six Architectures Wearing One Word

Start by separating them, because most confusion dissolves once the patterns have distinct names.

**Federated query.** The engine leaves data where it lives and reaches into the remote system at query time. A connector translates part of the query into the remote system's dialect, the remote system executes what it can, and results come back for the engine to finish. Nothing persists.

**Format virtualization.** The bytes stay in one physical format and get presented as another. Microsoft's OneLake serves Delta tables as Iceberg by generating Iceberg metadata on demand, using Apache XTable underneath, including conversion of Delta deletion vectors into Iceberg delete files. The data files are never rewritten. Only metadata is synthesized.

**Sharing protocols.** A provider publishes a share and a recipient reads it through a protocol that hands out short-lived, scoped access to the underlying files. Delta Sharing established the pattern, and its successor OpenSharing, announced June 10, 2026 and hosted by the Linux Foundation, extends it to Iceberg REST clients, on-premises storage providers, and AI assets like models and agent skills. Snowflake does the same thing through Iceberg and the REST catalog API for recipients who are not Snowflake customers.

**Catalog federation.** One catalog registers tables that live in another catalog and serves them to its own engines. AWS Glue federates to remote Iceberg catalogs so Redshift, Athena, EMR, and SageMaker query them with Lake Formation permissions applied. Snowflake's catalog-linked databases do it against external Iceberg REST catalogs. Unity Catalog, Apache Polaris, and Apache Gravitino all ship a version. Metadata moves. Data does not.

**External tables and mirroring.** A platform registers files it did not write, or continuously replicates an operational database into its own storage. Fabric mirroring replicates Azure SQL, PostgreSQL, and MongoDB into OneLake in near real time. This one is a copy, and it gets marketed under the same banner because the user does not build the pipeline.

**Caching and materialization.** The engine keeps a derived copy to accelerate repeated access: a result cache, a materialized view, a reflection, an incrementally maintained table. Also a copy, also marketed as no-ETL because the system maintains it.

Three of those six make a copy. That is not a criticism. It is the thing to know before you compare them.

## Where the Bytes Actually Go

Follow a single query through each pattern and the cost differences become obvious.

In **federated query**, the query planner splits the work. Whatever the connector can express in the remote dialect goes over as a remote query. What comes back travels the network into the engine's memory. If the filter pushed down, that is a small result. If it did not, the engine pulls rows and filters locally, and you paid full network and memory cost for data you discarded. The same work repeats on every execution, because nothing persists.

In **format virtualization**, the reader fetches real data files from object storage in their original format, plus synthesized metadata. Read cost equals normal read cost. The extra cost is metadata generation, which is small per table and grows with table count and commit frequency. The subtle cost is fidelity: any feature present in one format and absent in the other has to be translated or dropped, and translation quality is a moving target.

In **sharing protocols**, the recipient's engine gets a signed reference to the provider's files and reads them directly from the provider's storage. Compute is the recipient's. Storage stays the provider's. The cost that surprises people is egress: the provider pays cross-region and internet egress on every read, and a popular share read repeatedly by a recipient in another region generates a bill that has nothing to do with either party's compute.

In **catalog federation**, only metadata crosses. Table listings, schemas, snapshot pointers, and credentials. Data reads happen directly from storage afterward. The cost is per-operation metadata calls, which is negligible for hundreds of tables and stops being negligible at hundreds of thousands with aggressive refresh intervals.

In **mirroring**, you pay continuous replication compute, storage for the second copy, and the maintenance cost of whatever tables the replication produces. That is a real cost with a real benefit: reads never touch the source.

In **caching and materialization**, you pay build compute, storage, and refresh compute, in exchange for read cost that drops by one or two orders of magnitude on repeated access.

The pattern across all six: cost moves between network, compute, storage, and staleness. It never disappears. Every "zero-copy" claim is a statement about which of those four you chose to pay.

## Four Costs Nobody Puts in the Business Case

**Egress.** Cross-region reads and internet reads carry per-gigabyte charges that dwarf storage costs at volume. A shared table read a hundred times a day by a recipient in another region generates a hundred times the egress of a single nightly replication. Federation across clouds has the same property. Run the arithmetic before choosing live access over a copy: at a few cents per gigabyte, a 200 GB table scanned twenty times a day costs more per month in egress than storing a replicated copy costs per year.

**Repeated scan.** A copy is paid once per refresh. Live access is paid once per query. For a table queried twice a day by two analysts, live access wins easily. For a table underneath a dashboard that forty people load every morning, and now also underneath agents that query in loops, the arithmetic inverts hard.

**Source system load.** Federation to an operational database puts analytical queries on a system sized for transactions. The cost lands on a different team's error budget, which is why it stays invisible in the business case until checkout latency rises. Set a query timeout and a concurrency limit on every federated operational source, always.

**Metadata operations.** Catalog federation and virtualization both generate metadata traffic proportional to table count and refresh frequency. Cloud catalogs charge for metadata operations. At small scale this rounds to zero. At tens of thousands of tables with minute-level refresh it becomes a line item that nobody predicted.

## Pushdown Is the Whole Game

For federated query specifically, one property determines whether the architecture is excellent or terrible, and it is worth understanding precisely.

Pushdown means the engine translates part of the query into the remote system's language so the remote system does the work and returns less data. What pushes reliably across most connectors: column projection, simple predicates on indexed or partitioned columns, limits, and often simple aggregations with grouping.

What usually does not push: joins across two different remote systems, since neither system can see the other's data. Functions the remote dialect lacks or expresses differently, including many date manipulations and regular expression operations. Predicates on columns whose types need casting, because a cast on the remote side defeats index usage even when the predicate pushes. User-defined functions. Window functions on many connectors. And anything after a non-pushable operation in the plan, since once the engine has to materialize rows locally, everything downstream happens locally.

The practical difference between a query that pushes and one that does not is commonly three orders of magnitude in bytes transferred. Not a tuning detail. The difference between a two-second query and a query that destabilizes the source system.

Verification is the discipline that matters. Read the query profile or execution plan, find the remote scan node, and check the number of rows the remote system returned against the number of rows the final result used. When those numbers are far apart, something did not push. Do this once per federated query pattern before it reaches production, and put an alert on remote rows scanned when the pattern is important.

## The Code, Three Ways

Reading the same logical data through three of these patterns makes the differences concrete.

**Sharing protocol.** The recipient gets a profile file with an endpoint and a bearer token, and reads without any account on the provider's platform.

```python
import delta_sharing

profile = "config.share"          # endpoint, token, expiration
client = delta_sharing.SharingClient(profile)

for share in client.list_shares():
    for schema in client.list_schemas(share):
        print([t.name for t in client.list_tables(schema)])

url = f"{profile}#sales_share.public.orders"
df = delta_sharing.load_as_pandas(url, limit=1_000_000)
```

The token authorizes the recipient against the provider's sharing server. The server returns pre-signed URLs to the underlying files, scoped and short-lived. The recipient's process reads those files directly from the provider's object storage. No account on the provider's platform, no data copied into the provider's compute, and the provider pays egress on every byte.

**Catalog federation over the Iceberg REST specification.** Here the recipient's engine treats a remote catalog as one of its own.

```sql
-- Register an external Iceberg REST catalog as a linked database.
CREATE CATALOG INTEGRATION partner_iceberg
    CATALOG_SOURCE = ICEBERG_REST
    REST_CONFIG = (
        CATALOG_URI = 'https://partner.example.com/api/catalog',
        WAREHOUSE = 'shared_analytics'
    )
    REST_AUTHENTICATION = (
        TYPE = OAUTH,
        OAUTH_TOKEN_URI = 'https://partner.example.com/oauth/tokens',
        OAUTH_CLIENT_ID = '<client-id>',
        OAUTH_CLIENT_SECRET = '<secret>',
        OAUTH_ALLOWED_SCOPES = ('PRINCIPAL_ROLE:ALL')
    )
    ENABLED = TRUE;

-- Tables discovered through that catalog now query like local ones.
SELECT region, SUM(amount)
FROM partner_db.public.orders
WHERE order_date >= '2026-07-01'
GROUP BY region;
```

The integration exchanges client credentials for a token, lists namespaces and tables, and resolves each table's current metadata pointer. Reads then go straight from the querying engine to object storage using credentials the remote catalog vends per scan. Metadata crossed the wire. Data did not cross anything except the normal storage path.

**Federated query against an operational source**, with the verification step attached.

```sql
EXPLAIN
SELECT c.account_tier, COUNT(*) AS open_orders
FROM lakehouse.sales.orders AS o
JOIN crm_postgres.public.accounts AS c
  ON o.customer_id = c.customer_id
WHERE o.status = 'OPEN'
  AND c.region = 'EMEA'
  AND c.created_at >= DATE '2024-01-01'
GROUP BY c.account_tier;
```

What you are looking for in that plan is the remote scan node for `crm_postgres`. The good version shows the region filter and the date filter inside the remote query text, with an estimated row count in the thousands. The bad version shows a bare `SELECT customer_id, account_tier, region, created_at FROM accounts` and an estimate in the millions, which means the engine will pull the whole table on every execution and filter locally. Same SQL, same result, wildly different cost, and the only way to know which one you have is to look.

## Governance Does Not Come Free Either

Each pattern places the policy enforcement point somewhere different, and that placement determines what your audit log can prove.

With **sharing protocols**, the provider controls what is in the share and revokes at share granularity. The provider's audit shows that a recipient read a table. It does not show which end user at the recipient organization ran the query, unless the recipient propagates that identity. For regulated data flows, that gap is the thing to design around.

With **catalog federation**, the enforcement question is which catalog wins. If the remote catalog vends credentials, the remote policy applies at scan time and holds regardless of the engine asking. If the local catalog cached metadata and the engine holds standing storage credentials, the remote policy is advisory. Ask this question explicitly of any federation feature, because the two designs look identical in a demo.

With **federated query**, the engine authenticates to the remote source, usually as a service account. Every user's query arrives at Postgres as the same principal unless the connector supports identity propagation. Row-level security defined in the source database then applies to the service account rather than to the user, which quietly disables it.

With **virtualization**, the policy lives with whichever system owns the storage, and the translated view inherits it. The subtlety is that a feature dropped in translation can change what a filter does, and a masked column that survives translation as raw bytes is a real exposure.

With **materialization**, the copy is a new object that needs its own grants. This is the most common governance failure I see: a reflection or materialized view built over a restricted table, exposed to a broader audience because nobody re-applied the policy to the derived object. Systems that propagate lineage-based permissions handle this. Systems that do not leave you a landmine.

The rule that survives all five patterns: enforce policy at scan planning in the catalog, and vend short-lived credentials per query. That way the enforcement point sits below every engine and every access pattern, and no client is trusted to behave.

## Freshness Means Five Different Things

"Live data" is the other overloaded phrase, and each pattern gives it a different meaning.

**Federated query** gives you the source's current committed state at execution time, which is the strictest freshness available. It also gives you the source's isolation semantics, which for an operational database means a long analytical query sees a consistent snapshot at best and inconsistent reads across statements at worst.

**Sharing protocols** give you the provider's latest published snapshot. Publication is a deliberate act. A share pointing at an Iceberg table exposes the current snapshot, so freshness equals the provider's commit cadence, which is often minutes and sometimes hours.

**Catalog federation** gives you the remote catalog's current metadata pointer, refreshed on whatever interval the integration uses. That interval is the freshness bound, and it is frequently a configuration default nobody examined.

**Virtualization** gives you the source format's current state translated on read, so freshness matches the underlying table with a small metadata generation lag.

**Materialization** gives you the refresh time, which is the least fresh and the most predictable.

The failure this causes is not technical. It is a conversation where two teams both say "live" and mean thirty seconds and four hours. Write the number down per source, expose it as a queryable property, and stop using the word. For Iceberg tables the current snapshot's commit timestamp is exactly this number and costs one metadata read to fetch.

## Putting the Six Side by Side

| Pattern | Copies data | Main cost | Freshness | Best fit | Worst fit |
|---|---|---|---|---|---|
| Federated query | No | Network, repeated scan, source load | Source-current | Reference data, low query volume, data you cannot copy | High-concurrency dashboards, heavy joins across sources |
| Format virtualization | No | Metadata generation, translation fidelity | Near source-current | Cross-format interoperability on one storage estate | Cases needing format-specific features on both sides |
| Sharing protocol | No | Provider egress, no local optimization | Provider's published snapshot | Cross-organization and cross-platform delivery | Chatty access patterns from distant regions |
| Catalog federation | No | Metadata operations | Refresh interval | Multi-catalog estates, discovery without migration | Ultra-low-latency reads from cold remote storage |
| Mirroring | Yes | Replication compute, storage, maintenance | Seconds to minutes | Protecting operational systems from analytical load | Data with legal restrictions on duplication |
| Materialization | Yes | Build and refresh compute, storage | Refresh interval | Repeated queries over stable aggregates | Rapidly changing data, unpredictable query shapes |

Read the "worst fit" column first. Most disappointments with this family of technologies come from a pattern used in its worst-fit case, not from a bad implementation.

## When Copying Is the Right Answer

The industry spent three years arguing that copies are waste. Copies are not waste. Uncontrolled, undocumented, ungoverned copies are waste. A deliberate copy with a clear owner and a maintenance plan is often the cheapest and safest option.

Copy when read volume is high and stable. Amortizing one write across ten thousand reads is the oldest optimization in computing and it still works.

Copy when the source is an operational system with a latency budget. Nothing about live access is worth an outage in checkout.

Copy when queries need physical layout the source cannot provide. Sorting, clustering, partitioning, and column pruning are what make analytical queries fast, and a remote row store gives you none of them.

Copy when the two systems are in different regions or clouds and the access pattern is chatty. Egress arithmetic decides this one, and it decides it decisively.

Copy when you need a stable historical record. Federation shows current state. Reconstructing what a report said last March requires that somebody stored it.

Do not copy when the data cannot legally leave a jurisdiction or a tenant boundary, when the source is authoritative and staleness carries real risk, when volume is enormous and access is rare, or when you have no owner for the pipeline that maintains it. That last one is the real test. An unowned copy becomes an unmaintained copy, and an unmaintained copy becomes a wrong number in a board deck.

The mature architecture uses both, deliberately, with the boundary written down: replicate the hot tables, federate the long tail, share across organizational boundaries, and materialize the repeated aggregates.

## Running the Arithmetic on a Real Choice

Abstractions get decided by numbers, so here is a worked comparison with the kind of figures that appear in an actual evaluation. Adjust the rates to your provider and region, since the point is the method rather than the constants.

The scenario: a 400 GB fact table in a partner's cloud account in another region. Your team wants it for daily analytics. Typical queries touch roughly 5 percent of the data after partition pruning, so about 20 GB scanned per query. Forty queries a day from analysts, plus an agent-driven workload that adds another 300 queries a day as adoption grows.

**Option A, live access through sharing or federation.** Every query reads from the partner's storage across a region boundary. At 340 queries a day scanning 20 GB each, that is 6.8 TB per day crossing regions, roughly 204 TB a month. At two cents per gigabyte of cross-region egress, that lands near four thousand dollars a month, paid by whoever owns the source storage. Add the compute to scan 204 TB. Nothing was copied, and the bill is substantial.

**Option B, nightly replication.** One full copy at 400 GB, then daily incremental transfers of whatever changed, call it 20 GB a day. Monthly transfer is roughly 1 TB, which is about twenty dollars of egress. Storage for the copy at 400 GB is a few dollars a month. Queries then read from local storage with no egress at all. Add compaction and maintenance compute, and the whole thing sits well under a hundred dollars a month with better query latency, at the price of up to 24 hours of staleness.

**Option C, replication plus materialization.** Same as B, with pre-aggregated tables serving the top ten query shapes. Query compute drops by an order of magnitude on those shapes. Cost adds refresh compute. Staleness on the aggregates equals the refresh interval.

The 200-fold cost difference between A and B in this scenario is not a subtlety. It is the entire decision, and it comes from one variable: read frequency. Flip that variable to two queries a day and Option A becomes the obvious answer, because 40 GB a day of egress costs under a dollar and you avoid building and owning a pipeline.

This is why the read-frequency question sits second in the decision framework. Legal constraints come first because they are absolute. Everything after that is arithmetic, and the arithmetic is dominated by how many times the same bytes get read.

Two adjustments worth making to the model. First, agents change the read count by an order of magnitude and they arrive after the architecture is chosen, so size for the volume you expect in a year rather than the volume you have. Second, same-region access removes egress entirely and changes the answer completely, which is why "where is it physically" is a question with financial weight rather than a technicality.

## Who Implements Which Pattern

Every major platform ships several of these, and knowing which is which prevents comparing a sharing feature against a federation feature as if they competed.

**Databricks** leads with sharing. Delta Sharing established the category, and OpenSharing extends it to Iceberg REST recipients, on-premises providers through storage vendors, and AI assets. Unity Catalog adds catalog federation over external catalogs and cross-engine attribute-based access control, plus external write access to managed tables. Lakebase and LTAP handle the operational-to-analytical path by writing transactional data into open formats at write time, which is the mirroring pattern collapsed into the storage layer.

**Snowflake** leads with catalog federation and managed openness. Catalog-linked databases federate to external Iceberg REST catalogs. Horizon Catalog provides bi-directional access through Apache Polaris. Sharing extends to non-Snowflake recipients through Iceberg and the REST catalog API. Openflow and Datastream cover managed ingestion, which is the deliberate-copy path, and Dynamic Tables cover declarative materialization.

**AWS** leads with catalog federation and storage-level features. Glue Data Catalog federates to remote Iceberg catalogs with Lake Formation permissions applied across the federation and real-time metadata synchronization. S3 Tables handle managed storage with automatic maintenance. Zero-ETL integrations from operational databases into the analytics estate are the mirroring path.

**Google** leads with managed tables and cross-engine interoperability. Managed Iceberg tables under the Lakehouse runtime catalog provide read and write access from BigQuery, managed Spark, open source engines, and third-party engines. Cross-cloud interconnect and caching target the specific case of Iceberg data sitting in another cloud's storage, which is the honest engineering answer to cross-cloud federation: cache it.

**Microsoft** leads with virtualization. OneLake presents Delta tables as Iceberg through table format virtualization and exposes an Iceberg REST endpoint. Mirroring replicates operational databases into OneLake continuously. Shortcuts register data that lives elsewhere without moving it.

**SAP** leads with semantics attached to sharing. Business Data Cloud shares data products through the Delta Sharing protocol with business semantics preserved, and BDC Connect makes that bi-directional with partner platforms. With Dremio in the portfolio, federation and Iceberg-native storage join that picture.

**Dremio**, where I work, implements federated query with pushdown, Iceberg-native storage, a catalog powered by Apache Polaris, and autonomous materialization through reflections. Treat that as disclosure of my position rather than a recommendation.

Read the list and one thing stands out. Nobody ships only one pattern, because no single pattern covers the real access mix. Which means the evaluation question is never "does this platform do zero-copy." It is "which patterns does it implement well, and do those match my access profile."

## Instrumenting It So the Cost Stays Visible

Every failure mode in the next section is detectable with four measurements, and almost nobody collects them until after the incident.

**Bytes read per source per day.** This is the number that predicts the egress bill and the source system load. Collect it per federated source, per share, and per catalog integration. Alert on week-over-week growth above a threshold you pick, because growth is what turns a reasonable architecture into an expensive one.

**Remote rows scanned versus rows returned.** The pushdown health metric. A ratio far above one on a repeating query means a predicate stopped pushing. Sample query profiles on a schedule rather than reading them by hand, and alert on the ratio.

**Freshness per object, exposed to consumers.** For Iceberg tables, the current snapshot commit timestamp. For materializations, the last successful refresh. For federated sources, the connector's cache TTL. Publish these as queryable properties so a consumer, including an agent, can check staleness before acting on a number.

**Query attribution by principal.** Which identity generated the load. Without this, the answer to "why did the bill move" is a guess. With agents in the system, per-agent attribution is the only way to find the loop that is scanning a table three hundred times an hour.

Add one operational habit to those four: a quarterly review of every federated connection, share, and materialization, asking whether it still has an owner, still serves a live use case, and still fits its access pattern. Half the cost problems in this space are not architecture failures. They are objects that outlived their purpose and nobody turned off.

## Failure Modes

**Pushdown regression after an upgrade.** Symptom: a query that ran in two seconds for a year takes four minutes. Cause: a connector or engine upgrade changed how a predicate translates, and the filter stopped pushing. Warning sign: remote rows scanned in the query profile. This is the single most common federation incident and it is invisible without profile monitoring.

**Federation used as replication.** Symptom: the operational database slows during business hours. Cause: analytical queries and now agent loops hitting a production system through a connector. Fix: replicate the hot tables and put a hard timeout plus concurrency cap on every remaining federated operational source.

**Egress bill discovery.** Symptom: a cloud bill line item nobody recognizes, usually months in. Cause: a cross-region share or federation pattern reading the same data repeatedly. Fix: measure bytes read per source per day before going live, and cache or replicate anything above your threshold.

**Materialization drift.** Symptom: two dashboards disagree. Cause: a materialized view or reflection whose refresh failed silently, or whose definition drifted from the underlying logic. Fix: freshness monitoring on every derived object, with the refresh timestamp exposed to consumers.

**Permission leakage through derived objects.** Symptom: someone reads data they should not, via an aggregate. Cause: a materialization built over restricted source data without inheriting the policy. Fix: lineage-aware access control, or a review gate on every derived object built over a restricted table.

**Identity collapse at the connector.** Symptom: the source system's audit log shows one service account for every query. Cause: no identity propagation. Fix: connectors that support end-user identity pass-through, or enforcement moved up into the catalog where the real identity is known.

**Translation fidelity gaps.** Symptom: row counts differ between the native and virtualized views of the same table. Cause: a format feature that translated imperfectly, commonly around deletes, nested types, or newer type additions. Fix: reconciliation checks on any virtualized table that matters, run on a schedule rather than once at setup.

**Agent-driven amplification.** Symptom: any of the above, at ten times the volume, starting the week agents went live. Cause: agents query in loops and retry on failure. Fix: caching, per-agent budgets, and treating agent identities as first-class principals with their own limits.

## What Changes When the Consumer Is an Agent

Every pattern in this article was designed for human-paced access. Agents break the assumptions in four specific ways, and the fixes are worth planning before the traffic arrives.

**Volume becomes unpredictable and large.** A human analyst issues a query and thinks. An agent issues a query, reads the result, decides the result was insufficient, and issues another, often dozens of times inside one task, with retries on failure. A single user request expands into a burst. Patterns that priced well against forty queries a day price badly against four thousand, and federation and cross-region sharing are exactly the patterns whose cost scales linearly with query count.

**Query shapes stop being predictable.** Materialization works because you know which aggregates get requested. An agent writes SQL from a semantic description and produces shapes nobody anticipated, including expensive ones like wide scans with high-cardinality grouping. Static materialization covers less of the traffic than it used to, which pushes the value toward systems that create and maintain materializations automatically from observed patterns.

**Identity becomes a chain rather than a person.** A user asks an agent, the agent calls a sub-agent, the sub-agent calls a tool that queries a table. The principal that reaches the catalog has a delegation chain behind it. Enforcement designs that trust the calling engine break here. Enforcement at scan planning against a principal the catalog knows holds up, which is why catalog-level policy has moved from a nice property to a requirement.

**Freshness needs to be machine-readable.** A human reads "as of 6 a.m." on a dashboard and adjusts. An agent takes an action. Exposing the snapshot commit timestamp or the last refresh time as a queryable property, and instructing agents to check it before acting on anything time-sensitive, is a small piece of work that prevents a category of confident wrong actions.

The practical response has four parts.

Give every agent its own catalog principal, with its own grants and its own query attribution. This costs an hour and it is the prerequisite for every other control. Without it, cost attribution and audit both collapse into a single service account.

Put budgets and concurrency caps on agent principals specifically, separate from human users. A per-principal daily byte limit and a per-query timeout stop a reasoning loop from turning into an incident. Federated operational sources need the tightest limits, since that is where a runaway loop reaches a system with a latency budget.

Cache aggressively at the semantic layer rather than at the query layer. Agents ask the same underlying business question many ways, so caching on normalized query text catches less than caching on the metric being requested. Governed metric definitions serve double duty here: they make the answer consistent and they make the caching effective.

Prefer replicated, well-laid-out local tables for anything an agent touches frequently. The arithmetic that favored live access at human query volumes usually reverses at agent volumes, and the switch is cheaper to make deliberately than to discover through a bill.

One broader observation. The zero-copy conversation of the last few years was largely about avoiding pipeline work. The agent-era version is about controlling read amplification. Those two goals point in different directions often enough that architectures chosen for the first reason need re-examining under the second. A design that eliminated a nightly job and replaced it with live access looks elegant until a hundred agents start reading through it.

## A Decision Framework

Five questions, answered in order, settle almost every case.

**Can the data legally be copied, and out of which boundary?** If the answer is no, federation, sharing with the provider's storage, or an in-region deployment are the only options, and the rest of the analysis happens inside that constraint.

**How many times will this data be read per day, and by how many concurrent consumers?** Under a few dozen reads, live access almost always wins. Above a few hundred with real concurrency, a copy almost always wins. In between, measure.

**Does the query shape push down?** Verify with a plan, on a representative query, before committing. If the important predicates do not push, treat federation as a bulk transfer and price it accordingly.

**Where are the two systems, physically?** Same region is a different economic question from cross-region, which is a different question again from cross-cloud or on-premises to cloud. Egress and latency both scale with distance.

**Who owns the thing you are about to create?** A federated connection, a share, a catalog integration, and a materialization all need an owner, a monitor, and a review cadence. If nobody will own it, you are choosing between a fast decay and a slow one.

## Where This Is Heading

Three developments are reshaping this space through 2026 and into 2027.

Sharing protocols are converging on open standards with wider reach. OpenSharing's addition of Iceberg REST clients as recipients means a provider publishes once and reaches consumers on platforms that share no vendor with the provider. Snowflake's Iceberg-based sharing to non-Snowflake consumers is the same move from the other direction. The practical effect is that cross-organization data exchange stops requiring both parties to run the same platform, which has been the quiet blocker on data collaboration for a decade.

Catalog federation is becoming the default topology rather than a migration tool. Every major catalog now federates to others, which means the realistic end state for large enterprises is several catalogs with a designated primary, rather than the single-catalog consolidation everyone planned for and nobody achieved.

Agents are pushing the economics toward materialization. A dashboard loaded forty times a day is a predictable load. An agent population issuing queries in reasoning loops is not, and it is orders of magnitude larger. The answer is more caching, more pre-aggregation, and more automatic materialization driven by observed query patterns rather than by a human deciding what to build. That is what autonomous materialization features across several platforms are reaching for, and it is the part of this space where the next real advance shows up.

## Seven Rules of Thumb

Compressed versions of everything above, for the architecture review where you have four minutes.

1. Replicate what is read often. Federate what is read rarely. The crossover is read count, not data size.
2. Never point analytical concurrency at an operational database without a timeout and a concurrency cap.
3. Verify pushdown with a query plan before any federated pattern goes to production, and monitor it afterward.
4. Price egress before choosing live access across a region or cloud boundary. It dominates every other cost at volume.
5. Enforce policy at scan planning in the catalog and vend short-lived credentials per query. Anything else trusts the client.
6. Publish a freshness number per object and stop saying "live."
7. Give every derived object an owner, and review the whole inventory quarterly.

## Conclusion

There is no such thing as zero copy. There is copy at write time, copy at read time, copy into a cache, or copy into a network buffer that gets discarded. The engineering question is which of those you are choosing and whether the choice matches the access pattern.

The useful reframing is to stop asking whether an architecture copies data and start asking four concrete questions. Where does the byte travel on each query. Who pays for that travel. What is the freshness bound in seconds. Where is the policy enforced, and does it hold if the caller is an agent instead of a person.

Every vendor in this market has good answers for some access patterns and bad answers for others. The ones worth trusting will tell you which is which. If a demo ends with "no data movement" and no discussion of pushdown, egress, or enforcement points, you did not see an architecture. You saw a slide.

The last thing worth saying is about vocabulary. Teams that stop using the phrase entirely make better decisions. Replace it with the specific pattern name in every conversation: say federated query, or sharing protocol, or catalog federation, or mirroring. The moment the pattern has a name, the right questions about egress, pushdown, freshness, and enforcement follow on their own, because each pattern has its own well-known weak spot. The generic phrase hides all of them, which is precisely why it survives on slides.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture, federation, and the open standards underneath both.
*Architecting an Apache Iceberg Lakehouse* (Manning) covers the storage, catalog, and access patterns that determine when live access beats a copy, and *Apache Polaris: The Definitive Guide* (O'Reilly) goes deep on the catalog layer where credential vending and cross-catalog federation are decided.
You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at
[books.alexmerced.com](https://books.alexmerced.com).
