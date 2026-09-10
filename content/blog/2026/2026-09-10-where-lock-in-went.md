---
title: "Where Lock-In Went"
date: "2026-09-10"
description: "The format war ended and exit cost did not: where lock-in relocated after open tables won, how to measure it, and which costs are worth keeping down."
author: "Alex Merced"
category: "Market Analysis"
tags:
  - vendor lock-in
  - open formats
  - Apache Iceberg
  - procurement
  - data strategy
canonical: https://iceberglakehouse.com/posts/where-lock-in-went/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/where-lock-in-went/).

A CIO says the company is not locked in anymore, because the data is in Apache Iceberg on their own object storage in their own account. Any engine can read it. The format is an Apache project. Nobody owns the tables.

All of that is true, and the exit cost is still eighteen months.

The format war ended, and it ended in the right place: open table formats won, and every serious platform reads and writes them. What did not happen is the disappearance of lock-in. It relocated. The things that now bind an organization to a vendor are the catalog, the semantic definitions, the governance policies, the operational tooling, and the accumulated engine-specific artifacts nobody thinks of as assets until they try to leave.

This piece is about where it went, how to measure what leaving actually costs, and which of those costs are worth paying to keep down. Not whether open formats were worth adopting, which they were. I work at Dremio, which was acquired by SAP in May 2026, so I am inside one of the consolidations this subject concerns. Everything below applies to my employer as much as to anyone else's.

## What the format actually delivered

Give the win its due before picking at what remains, because the win was large and real.

**Your data is readable by things you do not buy.** Files in your bucket, in a documented format, with a specification anyone implements. Spark, Trino, DuckDB, Flink, Python, Rust, Go. That property did not exist in the proprietary warehouse era, where the data was in a format only the vendor's engine understood and getting it out meant a full export.

**You can run two engines on one copy.** Batch in one, interactive in another, streaming in a third, all against the same tables without duplication. That is a genuine architectural change and it is the practical basis for most lakehouse cost arguments.

**Storage cost is what storage costs.** Object storage at published rates rather than a bundled per-terabyte platform rate, billed by a provider whose pricing you can look up rather than negotiate. That transparency is itself worth something, because a cost you can predict is a cost you can plan around.

**Buyers gained real negotiating power.** Open-source communities steering the formats gave buyers options that loosen any single vendor's grip, and vendors know it. Pricing conversations changed.

So the format layer is genuinely open, and if lock-in were only about file formats the problem is solved. The mistake is thinking the format was where lock-in lived. It was where lock-in was *visible*.

## The seven places it went

Lock-in is not one thing. It is the aggregate cost of leaving, and it accumulates in seven layers.

**One: the catalog.** The service that maps table names to metadata files and serializes commits. Every engine needs it, it holds your permission model, and it is the most consequential relocation.

**Two: semantics.** Metric definitions, business rules, and the modeling that makes queries mean the right thing. The deepest and least reversible.

**Three: engine-specific artifacts.** Statistics formats, materialized views, cached layouts, and proprietary extensions that live alongside your open tables and do not travel.

**Four: governance and policy.** Row filters, column masks, classification, and the grant model. Expressed in vendor syntax, enforced by vendor machinery.

**Five: operational tooling.** Orchestration, maintenance jobs, monitoring, and the runbooks built around one platform's behavior.

**Six: the metadata platform.** Lineage, glossary, ownership, documentation. Organizational knowledge encoded in someone's proprietary graph.

**Seven: data gravity and egress.** Physics and pricing. The data is large, moving it costs money, and everything that reads it is pointed at where it currently sits.

The pattern worth noticing: **the format was the only layer that got standardized, and it was also the only layer anyone was arguing about.** The rest were assumed to be neutral infrastructure and turned out to be where the switching cost lives.

## The catalog is the new choke point

Of the seven, the catalog deserves the most attention, because it sits in the write path and holds the permission model.

**Every engine needs it, so it cannot be bypassed.** Reading a table means asking the catalog where the current metadata is. Writing means asking it to swap a pointer atomically. There is no way to use your open tables without going through whatever catalog owns them.

**It holds the grant model.** Principals, roles, and grants on catalogs, namespaces, and tables. That model is the accumulated result of years of access decisions, and it is expressed in the catalog's own vocabulary. Moving catalogs means re-deriving it, and re-deriving it means revisiting decisions whose rationale nobody recorded.

**It vends storage credentials.** As engines stop holding their own storage keys and receive scoped credentials from the catalog, the catalog becomes the trust anchor for data access. That is good security architecture and it deepens the dependency.

The mitigating development is that the REST catalog protocol standardized the *interface*. An engine talks to any conforming catalog over one HTTP API, which is a real constraint on how far a vendor drifts. Two qualifications keep that from being a complete answer.

**Implementations differ substantially in what they serve.** Independent probing of catalog implementations against the specification finds meaningful divergence: endpoints declared and not served, view operations widely absent, update actions inside the commit endpoint refused by some catalogs and accepted by others. A protocol both parties implement partially is a weaker guarantee than it looks.

**The management surface is not standardized.** The protocol covers table operations. Creating catalogs, defining roles, granting privileges, configuring storage, and federating to other catalogs are all vendor-specific APIs. So the part of the catalog that is genuinely portable is the part engines use, and the part that holds your organizational configuration is not.

The practical read: catalog portability is much better than warehouse portability was and materially worse than "it's just a REST API" suggests. Test it rather than assuming it, and treat the grant model as an artifact you own and maintain outside the catalog if portability matters to you.

## Semantics is the deepest layer

If the catalog is the choke point, semantics is the anchor, and it is the one people underestimate most.

Metric definitions, join paths, business rules, and the modeling that makes a question return the right number represent years of accumulated organizational decisions. They exist in the syntax of whatever tool holds them. They are usually the least documented part of a platform, because the definitions *are* the documentation.

Three properties make this the hardest layer to leave.

**The knowledge is not recoverable from the artifact alone.** A filter excluding a status code is a line of code. Why that code is excluded, which finance decision it implements, and what breaks if it changes are not in the file. A mechanical translation of definitions into a new tool's syntax carries the logic and loses the reasoning, and the reasoning is what you need when the translation does not map cleanly.

**Verification is expensive.** After migrating definitions, you have to prove the numbers still match, metric by metric, against a period of history. That is a real project, and it is the part of a migration that always overruns, because every discrepancy is a research question rather than a bug.

**It grows continuously.** Unlike a schema, which stabilizes, the semantic layer accumulates. Every quarter adds metrics, and the exit cost grows with it.

The defense is not avoiding a semantic layer. It is keeping the definitions in a form that is portable by construction: in version control, in a documented syntax, with the reasoning recorded alongside the logic. A definition file in your repository is an asset you own. The same logic clicked into a vendor's UI is an asset they hold.

## Engine-specific artifacts

The quiet accumulation. Your tables are open and the things built around them frequently are not.

**Statistics and acceleration structures.** Some engines maintain their own statistics or acceleration layers alongside open tables. They deliver real performance and they do not travel, so a new engine starts cold and the comparison you run during evaluation is between a warmed incumbent and a cold challenger.

**Materialized views and derived tables.** Where these are managed by the platform rather than defined as ordinary tables, they carry platform-specific definitions and refresh semantics.

**Proprietary extensions.** Vendor-specific SQL functions, procedures, and syntax used across hundreds of queries. Individually small, collectively a translation project.

**Query workload tuning.** Configuration, resource pools, caching policy, and the accumulated knowledge of what makes this platform fast. Genuinely valuable and entirely non-transferable.

None of this argues against using capabilities you paid for. It argues for knowing which ones create artifacts that do not move, and for deciding deliberately rather than accumulating them by default. A useful habit: when adopting a platform feature, ask what replaces it if the platform changes. Sometimes the answer is "nothing, and that is fine." Sometimes it is a surprise.

## Governance and the policy layer

Row filters, column masks, classification tags, and grants encode compliance requirements that took months of legal and security review to settle.

Two things make this layer stickier than it appears.

**Policy syntax is vendor-specific.** The concepts are common across platforms and the expressions are not, and the translation is exactly the kind of work where a subtle error produces a compliance failure rather than an error message.

**The review process is the real cost.** Re-implementing a row filter takes an hour. Getting security and legal to re-certify that the new implementation satisfies the same requirement takes weeks, and it happens for every policy.

Organizations delegating policy decisions to an external engine, rather than expressing them in a platform's native syntax, hold this layer in a portable form. That is a real architectural benefit and it costs a network hop on the authorization path plus a second system to operate, which is why most teams do not do it. Knowing the trade is being made is the minimum.

## Data gravity and the operational layer

Two of the seven get less discussion than they deserve, and both are the kind of cost that surprises a migration plan.

**Data gravity is physics with a price attached.** Your data sits in one provider's object storage in one region. Everything that reads it is pointed there. Moving it means transfer charges, a synchronization window during which two copies exist, and a cutover where every consumer changes its connection. None of this is conceptually hard and all of it takes time proportional to volume.

The subtler part is that gravity accumulates around the data rather than in it. Pipelines land there. Consumers read from there. Compliance approvals name that location. A dataset in one region has a hundred small dependencies on being in that region, and enumerating them is most of the migration work.

Cross-cloud is where this bites hardest. Within a cloud, moving between services is largely a configuration exercise. Between clouds, the transfer bill is real and the surrounding integrations rarely port cleanly.

**Operational tooling is the layer built by your own team.** Orchestration DAGs, maintenance jobs, monitoring, alerting, and the runbooks that encode what to do when things break. All of it written against one platform's behavior, its error messages, its metrics, and its quirks.

Three things make this stickier than the technical work suggests. The knowledge is distributed across the team rather than documented. The runbooks encode failure modes specific to the platform, so a new platform means new failure modes and a period of not knowing them. And the monitoring thresholds were tuned empirically, which means re-tuning them empirically somewhere else.

The estimate people give for this layer is usually "we'll rewrite the jobs," which covers the code and misses the operational learning, and the operational learning is what determines how long the new platform feels unreliable.

## Two objections worth taking seriously

Two reasonable pushbacks on the argument above deserve engagement rather than dismissal.

**"This is just the cost of using anything."** Largely true. Any tool you adopt and configure creates switching cost, and a platform that created none is a platform doing nothing for you. The response is not that switching cost is bad, it is that switching cost should be visible and chosen rather than accumulated by default. A team that knows its exit cost is a team making decisions. A team that discovers it during a renewal is a team taking whatever terms it gets.

The distinction that matters is between switching cost you get value for and switching cost you get nothing for. Acceleration structures that make queries fast earn their unportability. Metric definitions authored in a UI, when a repository was available, are unportability for free, and that is the category to eliminate.

**"Optimizing for portability makes you slower."** Also true, taken to an extreme. A platform used only through its most generic interfaces wastes what you paid for, and teams that refuse every vendor capability on principle end up with a worse platform and an exit cost that is still not zero.

The proportionate version is narrower than it sounds. Keep definitions in files. Generate grants from a declarative source. Track proprietary syntax as a number. Verify export paths before signing. None of those slows anything down, and together they cover most of the difference between a bounded exit cost and an unknown one. Everything beyond that is a judgment call about a specific capability, made once, with the trade written down.

The bad version of this argument is the one that treats openness as an identity rather than an instrument. Open formats are valuable because of what they let you do, not because open is a virtue. The same reasoning applied consistently says: use the capability that makes your platform good, know what it costs to unwind, and keep the two layers where portability has to be designed in from the start.

## Measuring exit cost

"Are we locked in" is a bad question because it has no answer. "What does leaving cost" has one, and it is computable.

Build the estimate by layer. Here is the shape, with the drivers that determine each number.

| Layer | What moves | Cost driver | Typical difficulty |
|---|---|---|---|
| Storage and files | Nothing, or bytes | Volume, egress rate, whether paths resolve | Low to moderate |
| Table metadata | Pointers and paths | Table count, absolute path handling | Low |
| Catalog | Grants, roles, configuration | Number of principals and grants | Moderate |
| Semantics | Metric and model definitions | Definition count, verification depth | High |
| Governance | Policies, classifications | Policy count, re-certification process | High |
| Engine artifacts | Materializations, tuning, extensions | Query count using proprietary syntax | Moderate to high |
| Operational tooling | Jobs, monitoring, runbooks | Pipeline count, platform coupling | Moderate |
| Metadata platform | Lineage, glossary, ownership | Asset count, export fidelity | Moderate |
| People | Retraining, lost expertise | Team size, platform specificity | Underestimated |

Then attach numbers from your own environment. The inputs are countable: how many tables, how many grants, how many metric definitions, how many queries use vendor-specific syntax, how many pipelines, how many policies.

A grep against your query history answers the proprietary-syntax question in an afternoon:

```sql
-- How much of the query surface uses syntax that does not travel
SELECT
  count(*) FILTER (WHERE query_text ILIKE '%<vendor_function>%')  AS proprietary_calls,
  count(*)                                                        AS total_queries,
  round(100.0 * count(*) FILTER (WHERE query_text ILIKE '%<vendor_function>%')
        / count(*), 1)                                            AS pct
FROM system.query_history
WHERE started_at >= current_date - INTERVAL 90 DAYS;
```

Published estimates for migrating a warehouse of a few dozen terabytes run well into six figures on engineering time alone once pipeline rework and BI reconfiguration are counted, and that is for a move where the data format itself is not the problem. Your number will differ. Having a number at all changes the conversation from ideology to arithmetic.

Two ways teams get this estimate wrong.

**Counting only the technical work.** The migration is engineering plus verification plus re-certification plus retraining plus the opportunity cost of a team not building anything else for two quarters. The last one is usually the largest and it never appears in the estimate.

**Assuming the destination is ready.** Exit cost includes the gap between what you use today and what the destination supports. A capability you depend on that the alternative lacks is either a workaround to build or a feature to wait for.

## Designing for exit without paying for it constantly

Optimizing purely for portability produces a platform that uses nothing well. The useful posture is to keep exit cost bounded and known rather than minimal.

**Keep definitions in version control.** Metric definitions, transformation logic, and policy expressions as files in a repository, applied to the platform rather than authored inside it. This single practice does more for portability than any architectural choice, and it is good engineering discipline regardless.

**Own the grant model outside the catalog.** Roles and grants generated from a declarative source rather than clicked in. Rebuilding them in a new catalog becomes a script instead of an archaeology project.

**Prefer the standard interface where it exists and is adequate.** The REST catalog protocol for table operations, standard SQL where the vendor extension does not buy much, open policy expression where your requirements allow it. And use the vendor capability when it is genuinely better, knowing what it costs to unwind.

**Track proprietary surface as a metric.** The percentage of queries using vendor-specific syntax, reviewed quarterly. It rises silently, and reviewing it once a quarter keeps it a choice rather than a drift. The number also makes a useful conversation with the team: when it jumps, somebody adopted something, and asking what they got for it is a better response than a policy against vendor features.

**Test portability occasionally.** Point a second engine at your tables and run a real workload. Once a year is enough to discover that something you assumed was portable is not, while it is still cheap to fix.

**Insist on export in procurement.** Every layer should have a documented export path that returns everything in a documented format. Metadata platforms are the clearest case here, since the lineage and glossary are the organization's knowledge rather than the vendor's, and export in a standard format with no proprietary encoding is a reasonable requirement to state before signing.

The framing that keeps this proportionate: **you are not trying to make leaving free. You are trying to make sure leaving is a decision rather than an impossibility.** A platform you stay on because it is the best option is a good outcome. A platform you stay on because you cannot afford to leave is a negotiating position you handed away.

## What to ask before signing

Six questions that surface exit cost during procurement, when you have leverage, rather than during a migration, when you do not.

**"How do we get our permission model out?"** An API returning every principal, role, and grant in a documented format. If the answer is a screen, the answer is no.

**"What in your platform does not travel?"** Ask directly. A vendor who names the acceleration structures, the proprietary functions, and the platform-managed materializations is being honest about a normal situation. A vendor who says everything is portable has either not thought about it or is not saying.

**"Which parts of the catalog protocol do you implement?"** Specifically: views, the update actions inside the commit endpoint, credential delegation, and whether the capability declaration matches actual behavior. Test it rather than accepting the answer.

**"Can our definitions live in our repository?"** Version-controlled, applied through an API or CLI, with the platform as the execution target rather than the system of record.

**"What does a full export of metadata and lineage look like?"** Standard format, complete, API-accessible.

**"What happens to our data if we stop paying?"** Access to the object storage, the metadata files, and a way to re-register the tables elsewhere. In an open-format architecture this answer should be strong, and it is worth having in writing rather than in principle.

None of those questions is adversarial. They are the questions a competent buyer asks, and vendors who have thought about their answers give them readily.

## What openness actually bought you

It is worth being precise about the value received, since the argument above is easy to misread as disillusionment.

**Optionality on engines.** Running a different engine on the same tables is a configuration change rather than a migration. That is the largest practical benefit and it gets used constantly, not just at exit: a team adds a single-node engine for local work or a streaming engine for one pipeline without a procurement cycle.

**A floor under the exit cost.** Data conversion, which used to be the dominant term in any migration estimate, is now close to zero. The remaining costs are real and they are smaller than the old ones by a wide margin.

**A stronger negotiating position.** A credible alternative changes pricing conversations, and format openness is what makes the alternative credible.

**Ecosystem participation.** Tools, libraries, and engines you did not have to buy, in languages you did not have to wait for. The Python and Rust implementations of the format arrived because the specification was public, and every one of them expanded what your existing data supports without a purchase.

Compared to the era where the data itself was hostage, this is an enormous improvement. The point of cataloguing where lock-in moved is not that openness failed. It is that the industry declared victory at the format layer and stopped auditing the layers above it, and those layers are where the current costs sit.

## What "open" is worth measuring

The word does more work in marketing than in analysis, so it helps to have a checklist that distinguishes kinds of openness with different practical value.

**Governed by a foundation.** A specification maintained by a community with an open process, where changes require consensus and no single vendor decides direction. This survives acquisitions and strategy changes, and it is the strongest form.

**Specified but single-vendor.** A documented format or protocol controlled by one company. Better than undocumented, and the roadmap belongs to someone whose interests change.

**Open source but effectively single-implementation.** The code is available and only one organization understands it well enough to operate it at scale. Portable in principle.

**Open interface, proprietary implementation.** Standard API, closed system behind it. Genuinely useful for portability at the interface, and everything the interface does not cover stays proprietary.

**Open in name.** Marketing.

Sorting a platform's components into those five is a twenty-minute exercise that clarifies a lot. Most real platforms are a mix, which is fine. The finding to look for is a component you assumed was in the first category sitting in the fourth, since that is where expectations and reality diverge most expensively.

Two questions sharpen the sort. Who decides the next version, and what happens to that decision if the company is acquired? A specification with an answer to both is a different asset from one without.

## Consolidation changes the calculation

The market is consolidating, and consolidation interacts with lock-in in ways worth thinking through before they apply to you.

Acquisition activity in this space has been steady, with acquirers prioritizing open-format ecosystem assets and governance platforms. Databricks acquired Tabular in 2024. SAP announced its acquisition of Dremio in May 2026 alongside a research lab focused on foundation models for structured data. Analysts describe open-format interoperability and AI-powered governance as the dominant themes in the sector's deal activity, and expect the trend to continue as buyers pursue consolidated platforms with lower operational complexity.

Three consequences for anyone assessing lock-in.

**The vendor you chose is not necessarily the vendor you have.** A product acquired by a larger platform company acquires that company's strategy, roadmap, and pricing model. Nothing about the product changes on day one, and the trajectory over three years is set by different people with different incentives.

**Fewer independents mean fewer credible alternatives.** The negotiating power that comes from a real alternative weakens as the number of independent options falls. This is a straightforward consequence of consolidation and it is the strongest practical argument for keeping your own exit cost bounded.

**Open standards become more important, not less.** When the vendor landscape consolidates, the artifacts governed by community specifications are the ones whose behavior is predictable across a change of ownership. A table format governed by an Apache project does not change because a company was acquired. A proprietary acceleration layer has no such guarantee.

The practical response is not to avoid acquired vendors, since that rule eliminates much of the market. It is to keep the layers that matter in portable form, so that a change of ownership is an event you evaluate rather than one that happens to you. And to note, when a vendor's openness is a selling point, whether that openness lives in a specification or in a product decision, because the two survive acquisition differently.

## Three scenarios, priced

Exit cost is not one number, because leaving is not one thing. Three realistic scenarios with different profiles.

**Swapping the query engine, keeping everything else.** The scenario open formats were built for. Point a different engine at the same tables through the same catalog. Costs: query translation for proprietary syntax, rebuilding acceleration structures, re-tuning, and re-validating a sample of results. Weeks to a few months depending on query volume, and genuinely feasible, which is why it happens.

**Changing the catalog, keeping the data and engines.** Re-register tables, rebuild the grant model, reconfigure storage and credential vending, update every engine's connection, and verify access control end to end. The technical work is moderate and the access-control verification is the long pole, since it means re-proving that permissions match intent across every namespace.

**Changing the whole platform.** Everything above plus semantics, governance, orchestration, monitoring, and retraining. Quarters rather than months, and the estimate is dominated by verification and re-certification rather than by moving anything.

The useful exercise is to price all three for your own environment and notice the shape. In most organizations the first is affordable, the second is a project, and the third is a strategic decision. That distribution is exactly what open formats were supposed to produce, and it means the freedom you retained is real at the engine layer and thinner above it.

## A migration that went well

Abstract cost categories are easier to accept with a shape attached, so here is the pattern that shows up when an engine change goes smoothly, assembled from how these projects tend to run.

**What made it feasible.** The tables were already Iceberg in the organization's own bucket, so no data moved. The catalog stayed in place, so grants and credential vending were untouched. Transformation logic lived in version control as SQL and configuration rather than inside the platform. That combination reduced the project to two questions: what does the new engine do differently, and how do we know the numbers still match.

**Where the time actually went.** Not the migration. Verification. Running both engines against the same tables for a period, comparing results query by query, and investigating every discrepancy. Most discrepancies turn out to be legitimate differences in null handling, type coercion, or rounding, and each one takes an hour to establish that.

**What surprised them.** Performance on the new engine started worse, because the incumbent had accumulated acceleration structures and tuning the challenger had not. The comparison during evaluation was between a cold system and a warm one, and reading the early benchmarks as a verdict on the engine rather than on the warm-up state is a mistake that gets made regularly.

**What made the next one easier.** They wrote down the discrepancy catalogue, kept the dual-run tooling, and added a portability test to their quarterly routine. The second engine evaluation cost a fraction of the first.

**The generalizable lesson.** The engine layer is where open formats delivered, and moving there is a project rather than an ordeal, provided the layers above it were kept portable by ordinary engineering discipline. Nothing exotic was required. Definitions in files and a catalog that stayed put did most of the work.

## The layers ranked by stickiness

Putting the seven layers in order of how hard each is to leave clarifies where to spend defensive effort.

**Hardest: semantics.** Years of accumulated definitions whose reasoning was never written down, requiring metric-by-metric verification against history. Nothing else on this list requires proving that numbers still match.

**Then governance.** The re-implementation is mechanical and the re-certification is a process involving people whose calendars you do not control.

**Then the catalog.** Standardized where engines touch it, vendor-specific where your configuration lives, and the access-control verification is substantial.

**Then engine artifacts.** A translation project whose size is measurable in advance from query history, which makes it plannable even when it is large.

**Then operational tooling.** Real work, well understood, and the kind of thing teams have done before.

**Then the metadata platform.** Mostly a question of whether export is complete. Good export makes this easy and poor export makes it a re-documentation project.

**Easiest: the data itself.** Which is exactly the point of open formats, and it is the layer everyone still talks about. The gap between where the discussion sits and where the cost sits is the whole argument of this article.

The ranking suggests where the defensive effort goes: keep semantic definitions and policy expressions in your own repository, because those are the two layers where portability has to be designed in rather than added later. The rest can be assessed and planned when the time comes.

## A portability review that takes an afternoon

Once a year, answer eight questions about your own platform. The answers tell you where exit cost is accumulating.

- What percentage of queries use vendor-specific syntax, and is it rising?
- Are metric definitions in version control, or authored inside a product?
- Can the grant model be exported and rebuilt from a declarative source?
- Which platform capabilities in active use produce artifacts that do not travel?
- Does the catalog implement the parts of the REST protocol our engines actually need, verified by test?
- Can lineage and glossary be exported in full, in a documented format?
- How many policies need re-certification, and who signs off?
- If we stopped paying tomorrow, what do we still have access to?

Write the answers down and compare them to last year's. The trend matters more than the level, because exit cost accumulates quietly and any single year's increase looks reasonable.

One habit that makes this review cheap: record the answer to "what does this cost to unwind" at adoption time, for every significant platform capability you turn on. A one-line note when the decision is fresh saves reconstructing the reasoning years later.

## The buyer's side of the trend

One more angle, because most writing on lock-in addresses architects and the decisions that matter most are made in procurement.

**Time your questions to your leverage.** Everything in the checklist above is easy to ask before signing and awkward to ask afterward. A vendor competing for your business answers export questions in a paragraph. A vendor holding your platform answers them in a support ticket.

**Write the answers into the agreement.** An export capability described in a sales call is a description. The same capability named in a contract, with a format and a completeness standard, is a commitment. This is ordinary procurement practice applied to a category where buyers frequently skip it because the technology feels open by default.

**Ask about continuity explicitly.** Given the consolidation in this sector, what happens to the product, its roadmap, and its pricing under a change of ownership is a reasonable question. Nobody can promise not to be acquired, and a vendor who has thought about what stays constant for customers is telling you something useful.

**Watch renewal timing against your exit cost.** The negotiation you get is a function of what leaving costs, and if that number has doubled since the last renewal because two more layers accumulated, the negotiation reflects it. This is the practical reason to track exit cost as a number over time rather than assessing it when a decision arrives.

**Separate the platform decision from the format decision.** They were the same decision in the warehouse era and they are not now. Choosing a vendor's platform while keeping the data in an open format under your own account is the normal arrangement, and it is worth confirming that the arrangement is real rather than nominal: your bucket, your account, your catalog, verified rather than assumed.

## Where this is heading

Three developments that will move these costs over the next few years.

**More of the stack is getting specified.** The catalog protocol standardized table operations. Work continues on the parts around it, and the agent-facing tool protocols are standardizing how systems reach data. Every layer that gets a specification is a layer where lock-in becomes a matter of implementation completeness rather than of architecture. Watch which layers get specifications, because those are the ones where portability becomes real.

**Semantic layers are the current frontier.** There is no widely adopted open standard for metric definitions comparable to what Iceberg did for tables. Several efforts exist and none has consolidated the field. If one does, the deepest lock-in layer becomes portable, and that is the largest change to this picture since the format war ended.

**Metadata portability is becoming a purchasing requirement.** Buyers increasingly ask whether lineage and glossary can leave, and vendors increasingly answer yes, because the metadata is plainly the organization's rather than the vendor's. Expect this to become table stakes in the way open storage formats did.

The direction is good, and the pattern is consistent: layers get specified one at a time, and lock-in relocates to whichever layer is next. Anyone reading this in a few years should ask the same question about whatever is unspecified then.

## Conclusion

Open table formats did what they promised. Your data is readable by engines you do not buy, a migration no longer starts with a full export, and the negotiating position that comes from a credible alternative is real. That was the largest single improvement in data platform economics in a decade and it is worth defending.

It also was not the end of lock-in. The switching cost moved up the stack into the catalog that serializes your commits and holds your grants, the semantic definitions that make your numbers mean the right thing, the governance policies that took months to certify, the engine-specific artifacts that make the incumbent fast, and the metadata platform that holds what your organization knows about its own data. Consolidation makes each of those matter more, because the number of credible alternatives is falling.

The response is not to optimize for portability at the expense of using anything well. It is to keep exit cost bounded and known: definitions in version control, grants generated from a declarative source, proprietary surface tracked as a metric, export paths verified in procurement rather than discovered in a migration, and a portability review once a year.

Ask what leaving costs and get a number. If the number surprises you, that is the finding, and it is much better to have it now than during a renewal.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and open standards. *Architecting an Apache Iceberg Lakehouse* covers the layer-by-layer design decisions this article prices, and *Apache Polaris: The Definitive Guide* covers the catalog layer that turned out to be the choke point. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
