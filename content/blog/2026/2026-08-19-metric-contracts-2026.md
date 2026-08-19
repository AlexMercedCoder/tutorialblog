---
title: "Metric Contracts in 2026: Standardizing Business Logic Across Multi-Agent Frameworks"
date: "2026-08-19"
description: "Metric contracts in 2026: versioned, testable definitions of business logic that let multi-agent frameworks compute revenue identically, with OSI interchange."
author: "Alex Merced"
category: "AI & Agents"
canonical: https://iceberglakehouse.com/posts/metric-contracts-2026/
tags:
  - metric contracts
  - semantic layer
  - AI agents
  - governance
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/metric-contracts-2026/).

For twenty years, the cost of an ambiguous metric was a meeting. Two dashboards disagreed, two teams defended their numbers, someone scheduled the reconciliation call, and the organization paid in hours and mild embarrassment. In 2026 the cost structure changed, because the consumers changed: business logic is now executed by agents, dozens of them, built on different frameworks, answering thousands of questions a day, each one an opportunity to re-derive "revenue" slightly differently at machine speed for an audience that cannot check the work. The ambiguous metric stopped being a meeting and became a defect generator, and the artifact that fixes it has a name worth taking seriously: the metric contract.

A metric contract is to business logic what a schema contract is to data and an API contract is to services: a versioned, owned, testable declaration of exactly what a business measure means, complete enough that any consumer, human, dashboard, or agent on any framework, computes it identically or does not compute it at all. The concept is not new, semantic layers have carried metric definitions for years, and 2026 is the year it hardened into a discipline, driven by the multi-agent estates that made informal definitions untenable and enabled by the interchange standards that made formal ones portable.

This article treats the contract as the first-class artifact it has become: why the multi-agent moment forced the formalization, the anatomy of a complete contract, its lifecycle from authorship through deprecation, how contracts get tested, how one contract serves every consumer from BI tools to agent frameworks, where the Open Semantic Interchange standard fits, and the organizational machinery that keeps contracts current. My companion article on semantic layer federation covers the platform that compiles and enforces contracts, and this piece stays on the artifact and its discipline. A disclosure as always: I work at Dremio, whose AI Semantic Layer is a product in exactly this territory, and the practices here are vendor-neutral, portable by design, which is rather the point of the subject.

## Why 2026 Forced the Issue

Metric definitions survived twenty years of informality because the consumers were few, slow, and human. Three shifts removed all three cushions at once.

The consumers multiplied into frameworks. The typical enterprise's agent estate in 2026 is plural by nature: an analytics assistant on one framework, a customer-facing copilot on another, workflow agents inside SaaS platforms, coding agents touching pipelines, and the orchestration layers composing them, each framework with its own context conventions, its own retrieval, its own prompt assembly. Business logic that lives in prose documentation, or in one BI tool's model, reaches these consumers unevenly or not at all, and each framework's agents fill the gap the way language models do, by generating something plausible. The fragmentation problem my semantic layer article describes for tools replays at agent speed: every framework is a redefinition surface, and the surfaces now number in the dozens.

The execution went autonomous. My text-to-SQL article dissects why generation-based metric derivation fails structurally, contested definitions, sampling variance, ungoverned access, and the practical consequence lands here: the fix, agents selecting governed definitions rather than deriving them, presupposes that governed definitions exist, are complete, and are current. The selection architecture is only as good as its catalog, which promoted the metric definition from documentation to load-bearing infrastructure, with infrastructure's requirements: versioning, testing, ownership, and change control.

And the numbers started reaching outward. Agent-computed figures now flow into customer communications, partner reports, and, at the regulated edge, filings and disclosures, which is the moment definitions acquire compliance weight. When an auditor asks how a disclosed number was produced, "the agent computed it" is an answer only if the computation traces to a versioned definition with an approval history, which is a description of a contract, not of a prompt.

A fourth force deserves the honest mention even though it flatters nobody: the first generation of agent deployments produced the incidents. The estates that shipped generation-based analytics in 2024 and 2025 accumulated exactly the failure inventory my text-to-SQL article catalogs, the self-disagreeing assistants, the numbers that matched nothing, the security findings, and the postmortems of those pilots converge on the same missing artifact. The contract discipline is partly a standard emerging and partly an industry writing down what its stalled pilots taught it, which is worth remembering when prioritizing the program internally: the organization has probably already paid for this lesson once, and the contract corpus is the receipt that stops it paying twice.

The countervailing development made the formalization affordable: the industry's semantic layer vendors, who spent a decade competing on incompatible definition formats, converged on interchange. The Open Semantic Interchange initiative, with its core specification finalized in early 2026 and a coalition spanning the major platforms behind it, established a vendor-neutral representation for semantic models and metrics, which means a contract written once is no longer a bet on one vendor's longevity. Formality used to cost portability. Now it buys it, and that reversal is why 2026 is the year the discipline sticks.

## Anatomy of a Complete Contract

A contract's completeness test is behavioral: two independent implementations, given only the contract, produce identical numbers on identical data. Most metric definitions in the wild fail this test not through error but through silence, the unstated timezone, the assumed filter, the grain nobody wrote down. The complete contract closes every silence, and its anatomy has eight parts.

Identity and meaning: the metric's name, its aliases, its owner, and its business description written for a reasoning consumer, what this measures, when to use it, and what it deliberately excludes, the description-engineering discipline the agent surface demands, because for machine consumers the prose is part of the interface.

The measure: the calculation at the bottom, sum, count, ratio, or expression, stated over named fields of a named entity, with the entity reference reaching into the semantic model's governed definitions rather than raw tables, so the contract inherits the entity's blessed joins and cleaning.

Grain: the level at which the measure is valid, per order, per customer-day, per subscription-month, which is the field that kills double-counting, since a compiler refuses aggregation paths that violate it and an agent's request gets validated against it.

Dimensional scope: which slices are meaningful, region, product line, channel, and which are forbidden nonsense, with the allowed dimensions carrying their own conformance to governed dimension definitions, because "region" fragments exactly like metrics do.

Filters and business rules: the exclusions and adjustments baked into the metric's meaning, test accounts out, refunds netted, internal transfers excluded, stated declaratively, because these are the clauses reconciliation meetings are made of.

Time semantics: the calendar it rolls on, fiscal or Gregorian, the timezone that closes the day, whether the metric accumulates, snapshots, or averages over windows, and how partial periods present, the densest source of silent divergence in the wild and the section authors most want to skip.

Lineage and provenance: the upstream entities and sources the metric depends on, declared so that impact analysis, freshness inheritance, and the auditor's how-was-this-produced question all answer mechanically.

And governance metadata: version, status, effective dates, approval references, sensitivity classification, and the consumer tiers permitted, the fields that make the contract an instrument of change control rather than a wiki page with delusions.

Two anatomy extensions complete the corpus at maturity. Derived metrics, the ratios and compositions built from other metrics, margin as recognized_revenue minus recognized_cost over recognized_revenue, declare their construction by contract reference rather than by re-expression, so the derived measure inherits its components' definitions, versions, and changes: when recognized_revenue moves to a new major, the derived contracts surface in the impact set automatically, which is the dependency management that hand-copied formulas never had. And conformed dimensions get their own contract-grade treatment, because a dimension is a metric's silent partner: region, product hierarchy, and customer segment each carry a definition, an owner, a version, and the mapping tables their conformance depends on, and the estates that skip this relearn that two teams agreeing on revenue while disagreeing on which region Munich belongs to are still two teams disagreeing about revenue by region.

Concretely, in the definitions-as-code shape the ecosystem converged on:

```yaml
metric: recognized_revenue
version: 3.2.0
status: active
owner: finance-data
description: >
  Revenue recognized under the company's revenue recognition
  policy, net of refunds and credits. Use for financial
  reporting questions. Not bookings, not billings, not GMV:
  those are separate metrics with their own contracts.
measure:
  aggregation: sum
  field: recognized_amount
  entity: finance.revenue_facts
grain: revenue_event
dimensions:
  allowed: [region, product_line, segment, recognition_month]
filters:
  - exclude: is_test_account
  - exclude: is_internal_transfer
  - net_of: [refunds, credits]
time:
  calendar: fiscal_4_4_5
  timezone: America/New_York
  accumulation: additive
  partial_period: labeled_incomplete
lineage:
  upstream: [billing.invoices, finance.rev_rec_schedule]
governance:
  classification: financial_reporting
  consumer_tiers: [internal_bi, governed_agents]
  approved_by: metrics-council/2026-05-14
  supersedes: 3.1.2
```

Two design notes on the artifact. The contract declares, and the semantic layer's compiler implements: the YAML is the negotiated truth, the compiled SQL per platform is derived from it, and the direction never reverses, because a contract reverse-engineered from an implementation inherits the implementation's accidents. And the near-neighbor disambiguation in the description, naming what this metric is not, is there for the machine consumers: agent selection errors concentrate among sibling metrics, and the contracts that name their siblings measurably select better, which makes the paragraph a functional component, not documentation courtesy.

## Where the Contract Sits Among Its Neighbors

The word contract is having a decade in data, so precision about this artifact's borders prevents the confusion that dilutes programs.

Data contracts govern datasets at their producer boundary: schema, freshness, volume expectations, the interface between a pipeline and its consumers, and the metric contract sits above them, consuming governed entities that data contracts stabilize. The two compose vertically, a metric contract's lineage section names the datasets whose data contracts it leans on, and a data contract's breaking change triggers impact analysis up through the metrics that cite it, which is the cross-layer blast radius the declared lineage exists to compute.

Semantic models are the broader modeling layer, the entities, relationships, and dimensions my federation article builds, and the metric contract is the semantic model's most formalized citizen: entities and dimensions carry their own definitions with the same code-and-review discipline, and metrics get the fullest contract treatment because they are where the numbers meet the business, where versions matter most, and where the agents select. In practice the corpus is one repository with the metric contracts as its most heavily governed directory.

And quality goals, the declarations my data quality agents article builds on, are the contract family's runtime sibling: the metric contract declares what a measure means, the quality contract declares what its inputs must satisfy, and the two meet in monitoring, since a metric whose upstream datasets are under an active quality incident should say so, which the lineage threading makes mechanical. One family of declared, versioned, owned artifacts, each governing its layer, composing through references: that is the estate the contract disciplines are jointly building, and seeing the family shape keeps any one program from re-inventing its siblings.

## The Lifecycle: Contracts Change, Meetings Become Diffs

A metric definition's hardest property is that it is simultaneously stable and alive: everything downstream depends on it holding still, and the business it describes keeps moving. The contract discipline resolves the tension the way API engineering did, with explicit versioning and managed change, and the lifecycle has four stations.

Authorship is negotiation made artifact. New contracts get drafted where the definitional authority lives, finance for financial metrics, product for engagement, with the semantic platform team as editors rather than authors, and the draft review is the definitional argument the organization was going to have eventually, had cheaply and once. Language models earn their keep here as drafting assistants, translating legacy view logic and scattered documentation into candidate contracts for human review, the development-time generation my text-to-SQL article endorses, with the negotiated result governed thereafter.

Versioning follows semantic versioning's logic adapted to meaning. Patch versions clarify without changing results: description edits, added aliases. Minor versions extend compatibly: new allowed dimensions, added lineage. Major versions change the numbers: a filter added, time semantics adjusted, the measure redefined, and a major version is an event with machinery attached, because every consumer's history just forked. The machinery: both versions computable during a transition window, consumers migrating on their own schedules within it, restatement guidance published alongside, historical comparisons labeled by contract version, and the old version's sunset a dated decision with usage telemetry showing when its traffic actually died.

Restatement deserves its own mechanics, because major versions meet history and history is where trust lives. The working pattern: the contract's major change declares its restatement policy, restate history under the new definition, label the boundary and leave history as-was, or publish both series through the transition, and the semantic layer computes accordingly, with every result carrying its version so a chart spanning the boundary can mark it. Iceberg's time travel earns a specific mention here: because the underlying tables address historical snapshots, restating history under a new definition is a recomputation against addressable past states rather than an archaeology project, and validating a restatement means reconciling the new series against the old at the boundary, mechanically, with the reconciliation archived beside the approval. Finance teams, who have run restatement discipline for decades under harsher supervision than any data team, recognize this machinery immediately, which makes them the program's natural allies rather than its skeptics.

Deprecation is retirement with receipts: contracts move through deprecated status with sunset dates before removal, the semantic layer's usage logs identify every consumer still requesting the old version, and the platform contacts them through the ownership metadata rather than through breakage. The estates that skip this station relearn why API engineering invented it.

The lifecycle's watchful edge is upstream change detection: because contracts declare their lineage, the machinery watches the declared upstreams for the changes that threaten meaning, a schema evolution on a cited entity, a data contract's breaking version, a source migration from the zero-copy program, and opens the impact review automatically, with the affected contracts and their consumers enumerated from the declarations. The estates that wire this report the discipline's most satisfying inversion: definitional drift, historically discovered downstream by a confused consumer, becomes an upstream review item with names attached, opened by tooling before any number moved.

And the whole lifecycle runs on the governance-as-code rails my other writing details: contracts in the repository, changes as pull requests with the diff routed by classification, financial metrics requiring the finance owner and, above a sensitivity line, the metrics council, applies promoted through environments, history as the audit trail. A metric's biography, every definition it has had, who approved each, and when each governed, becomes a query against version control, which is exactly the biography the auditor, the debugging analyst, and the confused executive all eventually request.

## Testing Contracts: Trust Is a Suite

Contracts earn trust the way code does, through tests that run on every change, and the metric testing pyramid has four layers.

Golden values anchor correctness: for each contract, a fixture dataset with hand-verified expected results, computed through the full compilation path on every contract change and every platform upgrade, because the compiler is software and software regresses. The fixtures encode the edge cases the definition negotiated, the refund that spans periods, the partial month, the timezone-straddling event, which turns the negotiation's hard-won conclusions into permanent regression guards.

Cross-implementation reconciliation catches divergence where it breeds: where a metric computes in more than one place during transitions, the semantic layer and a legacy warehouse view, two vendor platforms bridged by interchange, scheduled reconciliation queries compare results and alert on drift, the same discipline my zero-copy migration article applies to data, applied to logic.

Selection tests protect the agent path: a suite of natural-language questions with expected metric selections, run against the catalog on every description change, because for machine consumers the contract's prose is behavior and behavior gets tested. The suite doubles as the disambiguation early-warning system: new contracts that degrade existing selection accuracy are colliding with a sibling, and the collision surfaces in CI instead of in production confusion.

And invariant tests assert the estate's constitutional rules across all contracts: every financial-classification metric names an owner in finance, no two active contracts share an alias, every metric's dimensions resolve to governed dimension definitions, additive metrics never declare snapshot accumulation. These are the policy tests of the governance discipline, applied to meaning, and they are what lets the contract corpus grow past the size any human reviews end to end.

## One Contract, Every Consumer

The contract's economic argument is distribution: defined once, it serves every consumption surface without copies, and the surfaces in a 2026 estate are worth enumerating because each used to host its own definition.

BI tools consume through the semantic layer's standard interfaces, SQL over the governed model, or native semantic connections where the tools delegate deeply, with the layer compiling the contract identically for each, the passthrough discipline my federation article prescribes. The dashboard's revenue and the notebook's revenue stop being different artifacts because both are requests against contract version 3.2.0, and the version is visible in the metadata each result carries.

Pipelines and applications consume programmatically: a materialization job requests the metric at its grain for downstream serving, an application embeds the metric request in its reporting path, and neither reimplements the calculation, which retires the pipeline-copy drift that used to be the largest divergence source in estates with mature engineering and immature semantics.

Agents consume through the discovery-and-selection path the gateway architecture provides: the contract's identity, description, dimensions, and permitted tiers publish through MCP, the agent selects and requests, the compiler enforces, and the multi-agent problem in this article's title reduces to a distribution property: every framework's agents, whatever their internals, converge on the same catalog because the catalog is the only path to computation. Framework plurality stops being a semantic risk the moment no framework computes anything.

Performance rides the same rails without bending the rule: the acceleration machinery my federation article details, transparent materializations of hot metric-dimension combinations, serves contract requests from precomputed results with the compilation's policies intact, so the enforcement rule costs nothing at dashboard speeds, and the freshness contracts those materializations carry surface in the metric's response metadata beside its version. Consumers learn to read the pair, version and as-of, as the result's full citation, which is the small literacy that makes every downstream argument shorter.

And humans consume the contract itself: the rendered catalog, searchable, with each metric's meaning, owner, version, and lineage, is the reference that ends the hallway disagreement, and the estates that publish it well report the quiet win of analysts citing contract versions in their own work unprompted, which is what adoption looks like from inside.

The distribution architecture has one rule that protects everything: computation happens only through the contract's compiler. Extracts that carry computed metrics carry their version labels, caches respect the compilation, and any surface that wants to compute independently is asking to reintroduce the problem, which is the request the platform declines politely and firmly, with the semantic layer's speed as the sweetener that makes declining stick.

## Interchange: The OSI Layer and What Portability Buys

The formalization's affordability rests on the interchange development, so it deserves its own precise treatment.

The Open Semantic Interchange specification defines a vendor-neutral, YAML-based representation for semantic models, metrics, relationships, and their metadata, with its core finalized in early 2026 and the coalition behind it spanning the semantic platform vendors, the warehouse vendors, and major enterprise adopters, the breadth being the point: the companies that spent a decade competing on definition formats co-authored the format that makes definitions leave. Vendor transformers, translating each platform's native model to and from the interchange shape, are the layer's working parts, and their coverage is maturing unevenly across the ecosystem, which is the honest current state: the standard exists, the direction is set, and the transformer matrix is the thing to evaluate in procurement rather than assume.

What portability buys, concretely. Platform optionality: the contract corpus, the organization's negotiated meaning, exports in a standard shape, which converts semantic platform selection from a marriage into a lease and shows up in pricing conversations accordingly. Multi-platform estates: organizations running more than one semantic tier, through acquisition or through the BI-embedded layers that refuse to die, synchronize definitions through the interchange shape instead of by hand, with the reconciliation tests from the previous section verifying the synchronization holds. And ecosystem tooling: linters, testers, catalog renderers, and the drafting assistants all target one format instead of five, which is how the discipline's tooling gets good, the same compounding that made infrastructure-as-code's ecosystem.

The planning posture for 2026 estates: author in your platform's code format, keep the corpus exportable, weight transformer coverage in procurement, and treat OSI conformance as this year's version of REST catalog conformance in my decoupling writing, the seam requirement that keeps every other decision revisable. The metric contract is the organization's asset. The interchange layer is what makes the sentence true.

## The Multi-Agent Estate: Contracts as the Coordination Layer

The title's promise deserves its own section, because multi-agent coordination is where contract discipline pays its newest dividends, and three specifics carry it.

Cross-framework consistency is the baseline dividend, already covered: agents on any framework converge through the single computation path. The subtler dividend is cross-agent coherence in composed workflows: when an orchestrating agent delegates to specialists, the finance analysis agent, the forecast agent, the narrative agent, their outputs compose only if their numbers share definitions, and the contract catalog is the shared vocabulary that makes one agent's recognized_revenue safe as another agent's input. Estates running composed workflows without contract discipline report exactly the failure the arithmetic predicts: individually correct agents producing jointly incoherent reports, each having chosen a defensible definition, none having chosen the same one.

Context economics favor contracts. Framework-native approaches to shared logic, stuffing definitions into every agent's system prompt, pay per-token per-request forever and drift as prompts get edited per agent, while the catalog approach moves definitions to fetch-on-demand discovery, the resources pattern of the gateway architecture, shrinking prompts and guaranteeing that agents share one current version. The cost management article in this series quantifies the token side, and the correctness side is this section's point: prompts fork, catalogs do not.

And provenance composes. Agent-produced artifacts, the generated board narrative, the automated variance analysis, carry the contract versions of every metric they cite, threaded through from the compiler's response metadata, which means a multi-agent workflow's output arrives with its semantic bill of materials. When a number in the narrative gets questioned, the answer traces through the citing agent to the contract version to the approval to the lineage, mechanically, which is the auditability story that lets agent-produced analysis into rooms where numbers have consequences.

## The Organizational Machinery

Contracts are negotiated artifacts, and negotiations need forums, so the discipline's organizational half is as load-bearing as its technical half. The shape that works borrows from the API governance playbook with one addition.

Ownership is domain-anchored and named: every contract carries an owning team with definitional authority, finance owns the financial metrics, product owns engagement, and ownership means answering for the definition, reviewing its changes, and working its backlog, not merely appearing in a field. The platform team owns the machinery, the compiler, the testing suites, the catalog, and owns no definitions, the same editors-not-authors division that keeps the semantic layer from becoming the platform team's opinions about the business.

The metrics council is the addition, and it earns its meeting where cross-domain metrics live: the measures that span ownership, customer counts that marketing, product, and finance all touch, margin metrics crossing revenue and cost domains, the enterprise KPIs on the board deck. The council, small, senior enough to bind, meeting on a cadence, owns exactly the contracts no single domain can, plus the constitutional layer: the invariant tests, the naming conventions, the classification scheme, and the approval thresholds. Its decisions land as PRs like everything else, and its existence answers the question that otherwise deadlocks contract programs, who decides when finance and product disagree about active customers, with a forum instead of a stalemate.

Staffing the machinery is lighter than its description: the platform side is a fraction of the semantic team the estate already runs, the council is a monthly hour for people already in the arguments it replaces, and domain ownership is a review duty attached to authority the domains already claimed. What the program actually costs is negotiation attention in its first two quarters, which is spending the organization was doing anyway, in meetings, without producing an artifact, and the reframe worth using in the funding conversation is exactly that: the contracts do not add the arguments, they end them.

Two cultural practices keep the machinery alive. Definitions get argued once, in the contract review, with the review's reasoning captured in the PR, because the alternative is arguing forever, in hallways, without records. And the catalog is where questions go: the organizational habit of checking the contract before disputing a number, built by making the catalog fast, findable, and authoritative, is the discipline's actual end state, and it is built by repetition, leadership citing versions in their own decks being the accelerant that costs nothing.

## Adopting the Discipline: Sequence and Scope

Contract programs succeed by concentration and stall by census, and the sequence that works fits the pattern this series keeps confirming.

Scope the first corpus by consequence, not coverage: the metrics on the executive deck, the ones agents already answer questions about, and the ones with a live disagreement, typically ten to twenty measures, because the program's currency is resolved arguments and the first corpus should spend it where resolution is visible. The estate-wide metric inventory, the census instinct, produces four hundred shallow definitions and no changed behavior, which is the failure mode to name at kickoff and decline.

Draft with the model, negotiate with the owners, and time-box the negotiations: a contract review that cannot converge in two sessions has found a genuine business disagreement, which goes to the council with the options documented rather than cycling in review, because surfacing the deadlock is the program working, not failing. The drafting assistant's role has a second act worth planning: pointed at the estate's existing views, dashboard SQL, and pipeline logic, it inventories where each draft metric is currently computed and how the computations differ, which converts the migration map from archaeology into a generated report.

Wire enforcement early and expansion follows demand: the computation-only-through-contracts rule applies from the first corpus, on the surfaces that corpus covers, with the gateway telemetry and agent declines ranking what gets contracted next, the same demand-driven expansion the semantic adoption playbook prescribes. And publish the wins in the organization's language: the reconciliation meeting that stopped recurring, the QBR with one customer count, the audit question answered from the catalog in minutes, because the program's budget renews on stories the CFO retells, and this discipline, done right, generates them quarterly.

## A Worked Example: Fourteen Contracts and Three Frameworks

The composite, in this series' pattern, with no invented benchmark numbers.

The company enters the story with the 2026 configuration: a semantic layer over the lakehouse serving BI competently, and an agent estate that grew fast and plural, an analytics assistant on one framework from the data team, a customer-success copilot on another from the CS tools team, and workflow agents inside two SaaS platforms, each estate reaching data its own way, two through the governed layer, two through service accounts that predate the governance. The presenting incident is composed: the quarterly business review draft, assembled by an orchestration of three agents, cites three different active-customer counts in one document, and the CFO's margin note asks which is real, which nobody can answer in under a day.

The program starts with the incident's metrics: the fourteen measures the QBR workflow touches become the first contract corpus, drafted by the model from the existing view logic and documentation, negotiated in reviews that surface exactly the buried disagreements everyone suspected, active customer alone yielding three legitimate business concepts that become three named contracts with disambiguating descriptions. The metrics council convenes for the four cross-domain cases, its first real decisions, and the corpus lands in the governance repository with golden fixtures and the selection suite.

Distribution follows the enforcement rule: the two ungoverned agent estates migrate to the gateway path, their service accounts retired for scoped principals, which the security review had wanted anyway, and the QBR orchestration rebuilds its data steps as contract requests with version threading into the narrative's citations. The interchange shape enters at the edge the team did not predict: one SaaS platform's embedded semantic model imports the corpus through an OSI transformer, replacing its hand-maintained copy, which retires the last independent computation path the fourteen metrics had.

The second quarter tests the lifecycle rather than the launch, which is where programs prove out. The pricing model changes, recognized_revenue needs its first major version, and the machinery runs its designed course: the finance owner drafts 4.0.0 with the new recognition timing, the impact set enumerates the six derived contracts and forty-one consumers from the declared lineage, the transition window runs both versions with the QBR workflow migrating mid-window, and the restatement recomputes two fiscal years against historical snapshots with the boundary reconciliation archived beside the council's approval. The change ships as a managed month, the board deck's footnote cites the version boundary, and the program's skeptic, the analytics lead who predicted the contracts calcifying at first contact with a real change, becomes its second-loudest advocate, the first being finance, which had been running this movie manually for years and finally got the projector.

The next quarter's QBR is the acceptance test: one active-customer count, cited with its contract version, and the CFO's question, asked again deliberately, answers in the meeting from the catalog. The program's expansion then follows demand through the mechanism the discipline provides, agent declines and selection telemetry ranking which undefined metrics get contracts next, and the retrospective's transferable line belongs to the finance owner: the contracts did not slow the agents down, they made the agents citable, which was the property nobody knew to ask for until the first document that had it.

## Measuring the Program

The program's dashboard needs numbers that track meaning rather than motion, and four earn their tiles.

Coverage by consequence, not by count: the share of executive-deck metrics, agent-answered question volume, and outbound-report figures computed through active contracts, which is the metric that resists the census temptation, since contracting four hundred long-tail measures moves it less than contracting the twelve on the board deck. The companion number is the ungoverned remainder, enumerated, because a named backlog is a plan and an unnamed one is a risk register.

Divergence incidents, trending to zero on covered metrics: the reconciliation meetings, the two-dashboards tickets, the QBR contradictions, counted through the incident process before and after coverage, because this is the line the program was funded to move and the story the sponsor retells.

Selection accuracy from the agent suites, per metric and in aggregate, with its regression alerts, because for the machine consumers this is the program's runtime quality metric, and its trend under catalog growth is the early warning on sibling sprawl.

And lifecycle velocity: time from proposed change to active version, and time from deprecation to retirement, the pair that measures whether the discipline stayed alive or calcified, read together with the override-free adoption signal, consumers citing versions unprompted, that marks the culture actually shifting. A program green on all four is doing the quiet thing the discipline promises: making the organization's numbers boring, in the only sense that matters.

## Failure Modes

**The contract that describes nothing.** Definitions get formalized as aspirations rather than as the computation anyone runs, the corpus and the estate diverge from day one, and the catalog becomes fiction with version numbers. The defense is the completeness test taken literally: golden fixtures computed through the real compiler on real platforms, and no contract reaches active status without its implementation reconciling.

**Version paralysis.** Major changes are so ceremonial that owners avoid them, definitions fossilize while the business moves, and consumers route around the stale catalog. The defense is making the change machinery genuinely cheap, the transition windows, the dual-computation support, the restatement templates, so that a definition change is a managed month, not a feared project, and the lifecycle metrics, time from proposed change to active, get watched like the deployment lead times they are.

**Sibling sprawl.** Every disagreement resolves by minting another metric, the catalog grows nine revenue variants, and selection accuracy decays with the crowd. The defenses: the council's authority to consolidate, naming conventions that force variants to declare their distinction, the selection suite as the regression gate, and the periodic pruning that usage telemetry makes evidence-based.

**Prompt smuggling.** Teams under deadline paste definitions into agent prompts instead of waiting for contracts, the fork machine restarts quietly, and the drift returns wearing the new architecture's clothes. The defenses: making contract requests genuinely faster than prompt engineering, lint rules in the agent estates' repositories that flag inline metric logic, and the cultural version, treating a definition in a prompt the way code review treats a hardcoded credential.

**The council that governs everything.** Success breeds jurisdiction creep: the metrics council starts reviewing domain-owned contracts, becomes the bottleneck the federated design existed to avoid, and domain teams disengage from artifacts they no longer control. The defense is the charter enforced by the routing itself: council review triggers on cross-domain ownership and the sensitivity classification, mechanically, and everything else flows through domain code-owners, with the quarterly meta-review asking one question of the routing rules, what fraction of changes escalated, and treating a rising answer as the failure it is.

**Interchange optimism.** The corpus gets authored against the standard's promise before the transformer coverage exists for the platforms in play, and the portability turns out to be aspirational at the moment it is needed. The defense is the procurement posture from the interchange section: author in the platform's format, verify exports continuously as a CI step, and treat transformer coverage as a tested claim, not a roadmap slide.

## Conclusion

Business logic spent two decades as the least-governed critical asset in the enterprise, defined everywhere, owned nowhere, and reconciled in meetings, and the arrangement survived because its consumers were human and its costs were hours. Multi-agent estates ended the arrangement: logic now executes at machine scale, across frameworks, in front of audiences that cannot check it, and the fix is the metric contract, complete enough that independent implementations agree, versioned like the interface it is, tested like the code it compiles to, distributed through one computation path to every consumer, portable through the interchange layer the industry finally built, and owned by the humans with the authority to mean it.

The deeper reading of the discipline is the one worth ending on: contracts do not slow the agentic estate down, they are what permit its speed. An organization that has negotiated its meaning once can let a hundred agents cite it safely. An organization that has not is running a definition lottery at machine frequency. The difference between the two is not model quality or framework choice. It is whether the company wrote down what its numbers mean, in a form machines and auditors both accept, and 2026 is the year that stopped being optional.

## Keep Going

If this piece was useful, the surrounding architecture connects across my writing: the semantic layer that compiles these contracts, the agent access patterns that consume them, and the governance machinery that changes them safely. *Architecting an Apache Iceberg Lakehouse* from Manning covers the platform foundation, and my recent titles on semantics and agentic analytics build the layers above it. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
