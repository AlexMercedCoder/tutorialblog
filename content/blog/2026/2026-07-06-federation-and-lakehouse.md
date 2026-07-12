---
title: "Federation and the Lakehouse: Two Roads to Unified Data Access, and How to Know Which One to Take"
date: "2026-07-06"
description: "How federation and the lakehouse unify data access, with a decision framework, lifecycle pattern, and best practices for using both together."
author: "Alex Merced"
category: "Data Architecture"
tags:
  - federation
  - lakehouse
  - data virtualization
  - Apache Iceberg
  - data architecture
  - data governance
canonical: https://iceberglakehouse.com/posts/federation-and-lakehouse/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/federation-and-lakehouse/).
*By Alex Merced, Head of Developer Relations at Dremio*

Every data strategy document written this decade contains some version of the same sentence: we need a single place to access all our data. The sentence is right. The trouble starts on the next page, because there are two fundamentally different ways to build that single place, and the industry has spent years arguing about them as if they were rivals.

Road one is consolidation: bring the data together. Land everything in one governed store, in this era an open lakehouse, Apache Iceberg tables on object storage, and point every consumer at it. Road two is federation: leave the data where it lives and bring the access together instead. A query engine that speaks to your databases, warehouses, lakes, and applications in place, presenting one surface over many sources, with no copies made.

I work at Dremio, a company whose platform is built on the conviction that this is a false choice, that the right architecture uses both roads with judgment, and I will declare that bias now and then earn it with an honest treatment. Because the truth practitioners live is messier than either camp's marketing: federation without a lakehouse hits performance and scale ceilings, a lakehouse without federation spends years and fortunes migrating the long tail, and the teams that win treat the two as phases and partners rather than competitors.

So this article is the full playbook. What federation and the lakehouse each actually are, mechanically. The honest strengths and limits of each, including the failure modes their advocates gloss over. A concrete decision framework for when each one carries a workload. The lifecycle pattern that connects them, federate first, promote deliberately. And the unified architectures, mine included, that put both behind one governed door, which matters more than ever now that the consumers walking through that door increasingly are AI agents.

## Why Unify at All: The Cost of the Status Quo

Before the two roads, the destination deserves a paragraph, because the pain that motivates all of this is easy to forget once you are deep in architecture diagrams.

The default state of enterprise data is sprawl. Operational databases run the business. A warehouse or three serve analytics, each the legacy of some era or acquisition. A data lake holds the files that fit nowhere else. SaaS applications hold customer truth behind their own APIs. Every boundary between these systems is crossed by pipelines, copies, and extracts, and every copy is a liability: it costs money to store and move, it drifts from its source, it escapes governance, and it answers yesterday's question. Analysts spend their time hunting for which copy is right. Engineers spend theirs maintaining the plumbing between copies. One widely repeated industry figure holds that organizations now juggle fifty or more active data sources feeding their analytical estates, and my field experience says that undercounts the SaaS long tail badly.

Then the AI era raised the stakes. Agents and assistants need one governed door to the organization's data, because you cannot wire an agent to forty systems with forty permission models and expect either usefulness or safety. Unified access stopped being an efficiency project and became the prerequisite for the decade's headline initiative. Both roads, federation and consolidation, are answers to this same demand. They differ in where the unification happens: at query time, or at storage time.

## Federation, Mechanically: Unify at Query Time

Data federation, also called data virtualization in its earlier vendor generation, is the discipline of making many sources answer as one, live, with no copies.

The mechanics deserve plain explanation, because federation's strengths and limits both fall out of them. A federated engine holds connectors to heterogeneous sources: relational databases like PostgreSQL and SQL Server, warehouses like Snowflake and BigQuery, lakehouse tables in Iceberg or Delta, NoSQL stores, and file systems. When a query arrives spanning sources, the engine plans it globally: it decides which parts of the work each source should do itself, called pushdown, and which parts the engine must do after pulling intermediate results. A filter on a Postgres table gets pushed into Postgres as a WHERE clause, so only matching rows travel. An aggregation might push into the warehouse that holds the fact table. The join between the Postgres rows and the warehouse aggregate happens in the engine, ideally over Apache Arrow so the in-memory work is fast, and the answer returns as if one database had held everything.

Done well, this is a genuinely remarkable capability. The consumer writes one SQL statement against one namespace, and the operational reality of forty systems disappears behind it. Dremio's version of this carries the brand name Zero-ETL Federation, and the name states the value: the pipeline that would have copied those sources into a staging area simply never gets built.

The strengths follow directly. Time to value is unmatched: connecting a source takes minutes, and the first cross-source query can run the same afternoon, against data that was never migrated, modeled, or copied. Freshness is perfect by construction: you are reading the source itself, so the answer reflects this second's truth, which matters enormously for operational questions. The long tail becomes tractable: the four-hundredth data source, the departmental database nobody will ever justify a pipeline for, can still be queried, governed, and joined. Regulated and sovereign data gets an honest answer: when law or policy says the data cannot leave its system or country, federation queries it in place rather than pretending. And exploration gets cheap: analysts can discover whether data is even useful before anyone invests in moving it, which reorders the entire migration conversation.

Now the limits, stated as plainly, because federation earns skepticism when they are hidden. Performance has a ceiling set by the sources: a federated query is only as fast as its slowest pushdown, and an operational Postgres was sized for transactions, not for an analyst's table scan. Source load is a real hazard: pointing BI concurrency or, worse, agent-scale concurrency at production databases can degrade the systems that run the business, which is why every mature federation practice pairs connectors with guardrails, workload limits, and acceleration. Cross-source joins can be brutal when pushdown cannot save you: joining two large tables that live in different systems means moving at least one of them over the network at query time, every time. Availability couples: your unified surface is up only when the sources are, and a maintenance window in one system becomes a partial outage of the whole. Semantics vary underneath: types, collations, SQL dialects, and null behaviors differ across sources, and the engine's job of papering over them is hard, permanent work. And history is absent: federation shows you sources as they are now, but operational systems overwrite their past, so time travel, trend analysis over years, and reproducible training data are not federation's game.

Read that limit list again and notice its shape: everything on it is exactly what a lakehouse is good at.

## Pushdown, the Skill That Decides Federation's Fate

Since everything about federation's viability hinges on pushdown, the topic deserves a proper mechanical treatment rather than a passing mention, because evaluating a federation engine is mostly evaluating its pushdown, and the differences between implementations are enormous.

Pushdown is the planner's art of delegating work to the source instead of hauling raw data back. It comes in escalating grades. Predicate pushdown is table stakes: the WHERE clause travels to the source, so a query filtering to one customer pulls one customer's rows, not the table. Projection pushdown sends the column list, so a source with two hundred columns returns the four the query touches. Aggregate pushdown sends the GROUP BY, and this one changes the economics by orders of magnitude: a daily-revenue-by-region query against a billion-row source returns a few hundred aggregated rows instead of a billion raw ones. Join pushdown sends whole join subtrees to a source that holds both sides, letting the warehouse do warehouse work. Limit and sort pushdown keep top-N queries from becoming full transfers. The grade an engine achieves varies per connector and per SQL construct, which is why serious evaluations test the actual queries against the actual sources rather than reading the connector matrix.

Then comes the harder judgment: when not to push. A cost-based federated planner weighs source capabilities, statistics, and load before delegating, because pushdown into a struggling operational database can be worse than pulling data and computing in the engine, and because some sources handle certain operations badly. The mature engines keep statistics about remote tables, estimate transfer costs against computation costs, and choose per query. The immature ones apply fixed rules and produce the war stories that gave the old virtualization era its reputation.

Two patterns fill the gaps where pushdown cannot reach. The first is the intermediate representation: when the engine must compute across sources, doing so over Apache Arrow means the pulled data lands columnar and vectorized, so the engine-side join or aggregate runs at native analytical speed instead of row-at-a-time middleware speed. This single architectural fact, the Arrow-native execution core, is most of why modern federation outperforms its ancestors, and readers of my Arrow article will recognize the pattern: the copy tax removed at one more boundary. The second is acceleration as a pushdown substitute: when a federated pattern is hot but unpushable, a materialized Reflection over the federated view converts the recurring query-time cost into a scheduled refresh cost, which is usually the right trade for anything consulted daily.

The practitioner's summary: pushdown quality determines what federation can carry, Arrow-native execution determines how gracefully it handles what cannot be pushed, and acceleration determines what to do about the stubborn middle. Ask all three questions of any platform, with your queries.

## The Lakehouse, Mechanically: Unify at Storage Time

The lakehouse is the consolidation road, rebuilt on open foundations, and readers of my series know its anatomy well, so I will compress: data lands as Apache Parquet files on cheap, durable object storage, Apache Iceberg turns collections of those files into real tables with transactions, schema evolution, and time travel, an open catalog, Apache Polaris in my telling, governs access and identity, and any engine that speaks the open standards, Spark, Flink, Trino, Dremio, DuckDB, queries the same tables without copies between engines.

The strengths are the mirror image of federation's limits. Performance and scale are engineered, not inherited: files are laid out, sorted, compacted, and indexed for analytics, statistics prune most data before it is read, and the storage layer scales to petabytes without a production database anywhere in the blast radius. Concurrency is decoupled: a thousand analysts and ten thousand agent queries hammer object storage and elastic compute, and the systems that run the business never feel it. History is native: snapshots give you time travel, reproducibility, and the longitudinal record that operational sources discard. Cost curves bend the right way: object storage is the cheapest durable substrate there is, and one copy serving every engine beats a copy per tool. Engine neutrality is structural: because the formats are open, the lakehouse is the one consolidation strategy that does not trade silo sprawl for vendor capture, which is the entire reason I have spent years writing about these standards. And transformation has a home: the refinement from raw to modeled to consumption-ready data, the medallion patterns, lives naturally in a versioned, governed store.

The limits are equally structural. The data must get there: every source needs an ingestion path, batch or streaming, and I wrote a full article on what streaming ingestion honestly costs, pipelines to build, freshness floors measured in seconds to minutes at best, small files to compact, maintenance to run forever. Latency to truth is nonzero: the lakehouse copy trails its source by the pipeline's cadence, which is fine for trend analysis and fatal for "what is this customer's balance right now." The long tail never fully arrives: pipeline economics mean sources get onboarded in priority order, and the four-hundredth source, again, never justifies its pipeline, so a pure-consolidation strategy quietly abandons the tail. Migration is a program, not a project: years, budgets, and organizational will, with the old systems running in parallel throughout. And it is, at the end of the day, another copy: better governed and better formatted than the copies it replaces, but a copy nonetheless, with the drift and reconciliation obligations copies always carry, managed rather than eliminated.

Read that list again too: everything on it is what federation is good at. The two roads are not rivals. They are complements with embarrassingly perfect coverage of each other's weaknesses, and the only interesting question is how to run them together.

## The Decision Framework: Which Road Carries Which Workload

Here is the framework I actually use with teams, workload by workload, because the unit of decision is never "the company," it is the individual data flow.

**Federate when freshness is the requirement.** Operational dashboards, customer-state lookups, inventory positions, anything where the answer must reflect the source system's current truth. No pipeline cadence will ever beat reading the source, and these queries are typically narrow enough, filtered lookups rather than scans, that pushdown keeps them cheap.

**Federate the long tail.** The departmental databases, the acquired company's warehouse during integration, the SaaS sources queried monthly. If a source is touched rarely, lightly, or temporarily, a connector beats a pipeline on every dimension: cost, time, and maintenance. My rule of thumb: no source earns a pipeline until its query telemetry proves it deserves one.

**Federate what cannot move.** Data residency laws, sovereignty requirements, contractual boundaries, and systems of record whose owners will never bless an extract. Federation with strong governance is the architecture that respects these constraints instead of working around them.

**Federate during exploration and migration.** Before any consolidation decision, federated access lets analysts discover what the data is worth, and during migration, a federated surface lets consumers keep working while sources move behind it, one at a time, invisibly. This is the most underrated federation use of all: it makes migration a background activity instead of a big bang.

**Consolidate into the lakehouse when analytics is heavy and repeated.** The fact tables scanned by every dashboard, the event history feeding every model, the data where the same expensive read happens hundreds of times a day. Paying the pipeline cost once to make ten thousand reads fast and cheap is the best trade in data engineering.

**Consolidate when history matters.** Trend analysis, auditability, reproducible ML training sets, anything needing the past. Operational sources overwrite. The lakehouse remembers, with time travel to prove it.

**Consolidate when concurrency threatens the sources.** The moment BI or agent traffic against a federated source starts affecting the system's real job, that source's hot data has earned its promotion. Watch for this actively. It is the most common forced migration, and it is far better done proactively than during an incident.

**And consolidate the transformed.** Derived, modeled, conformed data, the products of your refinement work, belong in the versioned, governed store where their lineage and history live, essentially always.

Notice what the framework implies: nearly every organization has workloads in both columns, permanently. The long tail and the operational lookups never stop wanting federation. The heavy analytics and the history never stop wanting the lakehouse. The strategy question was never which road. It is how the two roads meet.

## The Lifecycle Pattern: Federate First, Promote Deliberately

The best operational answer I know to how they meet is a lifecycle, and it deserves its own section because it converts an architecture debate into a management process.

Stage one: federate broadly. Connect the sources, cheaply and quickly, behind one governed surface. Day-one value is discovery and access: for the first time, one namespace answers what exists, and cross-source questions become possible at all. Nothing has migrated. The organization is already better off.

Stage two: watch the telemetry. The federated surface sees every query, which makes it something no migration plan ever had before: an evidence engine. Which sources are hit hardest, which queries repeat, which federated joins are slow, which operational systems feel load. The access layer's query history is a continuously updated, demand-weighted map of what deserves consolidation.

Stage three: promote the proven. When a source or dataset crosses the thresholds, heavy repeated scans, concurrency pressure, history requirements, build its pipeline and land it in Iceberg. Because consumers query the unified surface rather than the source directly, the promotion is invisible to them: the view that pointed at Postgres now points at the lakehouse table, and dashboards never notice. This invisibility is the pattern's superpower. Migration without consumer disruption, one dataset at a time, justified by evidence instead of estimates.

Stage four: accelerate the seams. Some workloads sit stubbornly in between: the federated query that is important but whose source cannot take the load, the cross-source join that matters weekly. This is where acceleration layers earn their keep, materializations managed by the platform that cache governed results without the consumer changing a line. In Dremio's architecture these are Reflections, transparently substituted and increasingly autonomously managed, and the claimed ceiling of up to 100x on fitting workloads is precisely what makes a federated view feel like a local table. Acceleration is the diplomatic solution to the federation-versus-consolidation border disputes: the data stays where it lives, and the performance arrives anyway.

Run the lifecycle continuously and the estate finds its own equilibrium: hot, historical, heavy data in the lakehouse, fresh, long-tail, immovable data federated, and the boundary redrawn monthly by telemetry rather than annually by committee.

## One Door: The Unified Architectures

The lifecycle only works if both roads genuinely meet behind one surface, so let me survey what unified actually looks like in 2026, house position included and labeled.

The essential ingredients are three. One query layer that treats federated sources and lakehouse tables as peers in the same namespace, so a view can join a Postgres table to an Iceberg table and consumers cannot tell which is which. One governance layer that binds them identically: the same roles, the same row and column policies, the same audit trail, whether the bytes came from a connector or from Parquet, which in the open world increasingly roots in the catalog, Apache Polaris, whose own federation features let it govern external catalogs alongside native tables, unifying even the metadata plane. And one semantic layer on top, because unified access without unified meaning just lets everyone compute different numbers faster, the argument of my semantic layer article compressed to a sentence.

Dremio's platform is my home example of all three in one: Zero-ETL Federation and an Iceberg-native lakehouse as peer capabilities of a single engine, Reflections accelerating across both, the Open Catalog on Polaris governing both, the AI Semantic Layer defining meaning over both, and the MCP Server handing the whole governed surface to agents through one door. The through-line to evaluate, at Dremio or anywhere: does the platform treat federation and the lakehouse as one architecture, or as two products with a brochure between them?

Fairness requires the rest of the field. Trino and its commercial steward Starburst built the most widely deployed open federation engine of the era, with deep connector coverage and increasingly serious lakehouse capabilities alongside. The virtualization veterans, Denodo foremost, serve enterprises whose emphasis is logical data management across hundreds of systems. The cloud warehouses federate outward from their own centers of gravity, external tables, cross-cloud query features, each strongest when their platform is your center. And catalog-level federation, Polaris registering Glue, Hive, and BigQuery Metastore as governed sources, is the newest layer of the same idea, unifying access to metadata the way engines unify access to data. The pattern across all of them: every serious platform now ships both roads, and the differentiation has moved to how honestly they integrate, how open the formats underneath remain, and how well governance spans the seam.

## Best Practices From the Field

The distilled operating rules, learned mostly from watching them violated.

Protect your sources like production, because they are. Every federated connector to an operational system gets workload management: concurrency caps, query timeouts, off-peak scheduling for anything heavy, and acceleration for anything popular. The fastest way to kill a federation program politically is one incident where analytics hurt the business's transaction path.

Let telemetry, not opinions, drive promotion. The loudest team's data is not necessarily the hottest data. Publish the query-history-based promotion criteria, review them monthly, and make the lakehouse earn its pipelines with evidence. This also kills the pipeline-by-default culture that rebuilds sprawl inside your new architecture.

Put the semantic layer over the seam early. Definitions that span federated and consolidated data, a revenue metric joining the lakehouse fact table with the CRM's live pipeline, are exactly where inconsistency breeds. Governed semantics over the unified surface is what makes the seam invisible to meaning, not just to SQL.

Design for promotion from day one. Name and organize federated sources so that datasets can move behind their views without renaming anything downstream. The two hours of naming discipline at connection time buys years of invisible migrations.

Mind the egress and the load bills. Federation moves intermediate data at query time, and cross-cloud federation moves it across egress meters. Pushdown quality, result caching, and acceleration are cost features as much as performance features. Measure bytes moved per query the way you measure warehouse credits.

And never let unified access outrun unified governance. The moment one door opens to everything, that door's permission model is your entire security posture. Principals, roles, credential vending, and audit at the access layer, agents included, are the prerequisite, not the fast-follow.

## The Anti-Patterns: Six Ways Teams Get This Wrong

The failure modes are as instructive as the practices, and I have watched each of these enough times to describe them from memory.

**The eternal federation.** The team discovers how fast federation delivers, ships everything as federated views, and never builds the promotion muscle. Eighteen months later the operational sources are groaning, the heavy dashboards are slow, there is no history for the ML team, and the platform gets blamed for physics. Federation without a lakehouse behind it is a demo that overstayed.

**The big-bang migration.** The opposite vice: the two-year program to consolidate everything before delivering anything, with federation dismissed as a distraction. The long tail blows the timeline, the business builds shadow systems while waiting, and the AI initiative launches against whatever it can reach, ungoverned. Consolidation without federation in front of it is a bridge built from the far bank.

**The double door.** Federation through one product, the lakehouse through another, with separate namespaces, separate permission models, and a growing pile of glue between them. Consumers learn two systems, governance forks, and the unified surface the strategy promised never actually exists. If the seams are visible to consumers, the architecture has not shipped yet.

**Analytics against production, unguarded.** The connector to the operational database goes in without workload management, the quarterly report scans it at 9 a.m., and the checkout path slows. One such incident can set a federation program back a year politically, and every one of them was preventable with caps, timeouts, and a Reflection.

**Copy sprawl reborn.** The lakehouse becomes the new landing zone for reflexive pipelines, ingesting sources nobody queries because pipelines are what the team knows how to build. The old sprawl reassembles inside the new architecture, now with better file formats. The fix is cultural and procedural: pipelines are earned by telemetry, not granted by habit.

**Governance as a fast-follow.** The unified surface ships open, permissions to be tightened later, and later arrives after the first incident. The one-door architecture concentrates risk precisely because it concentrates access, and the door's lock is not a phase-two item. Roles, policies, credential vending, and audit go live with the first connector, or the first connector waits.

Every anti-pattern above is a partial adoption of the lifecycle: federation without promotion, promotion without federation, both without one door, one door without a lock. The pattern only pays whole.

## The Economics: What Each Road Actually Costs

Money decides more architecture debates than diagrams do, so let me lay out the cost structures honestly, because they are shaped differently and the shapes matter.

Federation's costs are query-time costs. Compute in the engine for the unpushable work, load on the sources for the pushed work, and network for the intermediate transfers, including cloud egress when sources and engine sit in different clouds or regions, which is the line item that surprises people. The shape is pay-per-use: a rarely queried source costs almost nothing to keep connected, which is exactly why federation wins the long tail, and a heavily queried source costs every single time, which is exactly why hot paths eventually want promotion. Acceleration bends this curve: a Reflection converts a hundred daily query-time costs into one refresh cost, and Dremio's C3 caching attacks the I/O component directly, with a claimed elimination of up to 90 percent of I/O costs on cached workloads.

The lakehouse's costs are pipeline-and-storage costs. Engineering time to build and maintain ingestion, compute for the pipelines and the permanent maintenance jobs, compaction, snapshot expiration, and storage for the copy, though object storage's pricing makes that the smallest line. The shape is pay-up-front, amortize-forever: expensive to onboard a source, nearly free per query afterward, which is exactly why heavy repeated analytics wants consolidation and the four-hundredth source never does.

Put the shapes together and the lifecycle falls out of the arithmetic on its own. Every dataset has a break-even query volume where pipeline-and-storage beats pay-per-query, and the telemetry-driven promotion process is simply the practice of noticing when a dataset crosses it. The strategic mistake in both directions is ignoring the shapes: all-federation pays query-time costs on workloads long past break-even, and all-consolidation pays pipeline costs on workloads that will never reach it. The unified architecture is, among everything else, the cost-optimal one, which is a sentence worth bringing to the budget meeting.

## A Worked Example: One Company, Eighteen Months

The composite story I have now watched a dozen times, compressed.

A retailer starts the year with the standard estate: an aging warehouse, three years of clickstream in a raw lake, operations on PostgreSQL and a SaaS CRM, plus the acquired brand's separate warehouse. Strategy documents demand the single place. The old plan, migrate everything to one warehouse, was budgeted at two years, and the AI initiative cannot wait for it.

Month one, they take the federation road first: the unified engine connects all five systems behind one namespace with one RBAC model. Analysts get cross-source queries immediately, the merged-company revenue view that the migration plan had promised for year two ships as a federated view in week three, and the agent pilot gets its one governed door.

Months two through six, the telemetry does its work. The clickstream and order history are scanned constantly and crush the warehouse bill: promoted to Iceberg, where compaction, pruning, and cheap storage cut the cost of the heaviest workloads dramatically. The Postgres product catalog is hit by every dashboard: too hot for the source, too small for ceremony, an acceleration Reflection makes it interactive without a pipeline. The CRM stays federated forever: its queries are narrow and its freshness is the point. The acquired warehouse migrates dataset by dataset behind its views, and its decommissioning, the old plan's year-two finale, becomes a quiet month-nine cost saving nobody downstream notices.

Month eighteen, the equilibrium: heavy history in the lakehouse, live operational truth federated, everything behind one engine, one catalog, one semantic layer, one MCP door for the agents, and, tellingly, no migration program in sight, just a promotion queue reviewed monthly with query stats attached. The strategy document's sentence came true. It just took both roads to get there.

## Questions I Hear Most Often

**Where does catalog federation fit versus query federation?** They unify different planes and compose. Query federation unifies the data plane: one engine reads many sources. Catalog federation, the Apache Polaris capability I covered in my Polaris article, unifies the metadata plane: one catalog governs tables that live in Glue, Hive Metastore, BigQuery Metastore, and other catalogs, projecting them through standard Iceberg REST endpoints with one access model. A mature architecture runs both: the catalog federation gives every engine one governed map of what exists, and the query federation gives consumers one engine across all of it. The two together are what make the one door real at both the metadata and data levels.

**Should federated views be treated as data products?** Yes, and this is the practice that separates durable federation programs from science projects. A federated view with a name, an owner, a documented definition in the semantic layer, and a service expectation is a product that can be trusted, promoted, and evolved. An ad hoc federated query shared in a Slack thread is a liability with syntax. The data product discipline, ownership, documentation, versioned definitions, applies identically whether the product's bytes come from a connector or from Iceberg, which is precisely the point: consumers should contract with the product, and the product's team should be free to move its physical implementation along the lifecycle without renegotiating anything.

**Isn't federation just the old data virtualization that disappointed everyone?** Same idea, different era, and three things changed. Engines got dramatically faster, columnar execution over Arrow versus row-at-a-time middleware. The consolidation partner got real: virtualization failed hardest when it was asked to be the whole answer, and the lakehouse now absorbs exactly the workloads that broke it. And acceleration matured: transparent materialization gives federated views a performance floor the old generation never had. Federation as the only strategy still disappoints. Federation as the access-and-discovery layer of a lakehouse strategy is the pattern that works.

**Doesn't the lakehouse eventually make federation unnecessary?** No, because three federation use cases never expire: operational freshness, the long tail that never justifies pipelines, and data that legally cannot move. The lakehouse share of the estate grows over time, and the federated share never reaches zero. Plan for permanent coexistence.

**Is federated query performance good enough for BI?** For filtered, pushdown-friendly queries against healthy sources, yes, routinely. For repeated heavy scans and big cross-source joins, no, and it should not have to be: that is what promotion and acceleration are for. The honest engineering answer is that federation's job is to make everything reachable and the lifecycle's job is to make the hot paths fast.

**How does this play with data mesh?** Beautifully, and the mesh crowd figured this out early: domain ownership of data with federated, governed access across domains is practically the mesh's technical definition. The lakehouse hosts the domains' published products, federation reaches their operational edges, and the shared catalog and semantic layers are the mesh's federated governance made concrete.

**What about agents specifically? Which road do they need?** Both, behind one door, more than any human consumer ever did. Agents ask operational questions, "what is this customer's status", that need federation's freshness, and analytical questions, "how has this segment trended", that need the lakehouse's history, often in the same task. What agents cannot tolerate is per-source wiring and per-source permissions. The unified, governed, semantically documented surface is not an optimization for agents. It is the admission ticket.

**What is the single most common mistake?** Choosing a camp. The all-federation shop hits the performance and history walls by year two. The all-consolidation shop burns years and budget on the long tail and starves its AI initiative waiting for migration. The teams that win never chose: they federated first, promoted on evidence, and let the boundary move with the workloads.

## Closing Thoughts

The single place for all our data was never going to be a single storage system, because the forces that scatter data, operations, acquisitions, regulation, the SaaS economy, never rest. What it could be, and in the best architectures now is, is a single surface: one query layer, one governance model, one semantic truth, with consolidation and federation as the two hands working behind it, each carrying what it carries best, the boundary between them redrawn continuously by evidence.

That is also, not incidentally, the open lakehouse thesis I have argued across this entire series, extended one layer outward: open formats made the consolidated data engine-neutral, open catalogs made its governance portable, and federation makes the whole remaining world reachable without waiting for it to move. The organizations that internalize the both-roads pattern are finishing their unification in quarters. The ones still litigating federation versus lakehouse are choosing which half of the problem to fail at.

If you want the deep foundations under all of it, the table formats, the catalogs, the semantics, and the AI workloads arriving on top, that is what my books are for. I co-authored Apache Iceberg: The Definitive Guide and Apache Polaris: The Definitive Guide for O'Reilly, with further titles on lakehouse architecture, data engineering, and agentic analytics.

Browse the full collection of my books on data and AI at [books.alexmerced.com](https://books.alexmerced.com).