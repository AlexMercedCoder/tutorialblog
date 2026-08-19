---
title: "The Five Layers of an Agentic Lakehouse"
date: "2026-08-19"
description: "The five layers of an agentic lakehouse: Storage, Catalog, Semantic, Gateway, and Agent Surface, and how one question travels through all of them."
author: "Alex Merced"
category: "AI & Agents"
canonical: https://iceberglakehouse.com/posts/five-layers-agentic-lakehouse/
tags:
  - agentic lakehouse
  - architecture
  - MCP
  - semantic layer
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/five-layers-agentic-lakehouse/).

Every architecture era gets its reference diagram. The warehouse era had its star schemas and its staging-to-mart flow. The big data era had its lambda architectures. The lakehouse era drew storage, format, catalog, and engines, and settled the argument about where data should live. The agentic era needs its own diagram, because the question changed: not where data lives, but how autonomous systems get to use it, correctly, governedly, and affordably, at machine scale. After two years of building, stalling, and rebuilding, the estates that work have converged on the same shape, and it has five layers: Storage, Catalog, Semantic, Gateway, and Agent Surface.

I have written a full article on nearly every layer of this stack, and this piece is deliberately the map rather than another territory: what each layer does, the contract it exposes upward, the open technology that fills it, what breaks when it is missing, and, most usefully, how the five compose into one path that a question travels from an agent's prompt to a governed number and back. The synthesis matters because the layers are routinely built by different teams, bought from different vendors, and argued about in different meetings, and the estates that treat them as one architecture get properties that no layer delivers alone: agents whose answers match the dashboards, security reviews that pass on structure rather than promises, and costs that scale with value instead of with enthusiasm.

A disclosure with full relevance: I work at Dremio, whose agentic lakehouse platform spans several of these layers, so this diagram is close to my employer's worldview. The layers themselves are defined by open standards at every seam, Apache Iceberg, the REST catalog protocol, the interchange formats, MCP, which means the architecture is buildable from open components, from multiple vendors, or from a mix, and the seams are precisely what make the vendor question survivable. That neutrality-by-standards is not a disclaimer. It is the design.

## Why Layers, and Why These Five

Before the tour, the argument for layering itself, because the alternative is what most first-generation agent deployments actually built: a pile. The pilot-era pattern wired agents directly to whatever was reachable, a warehouse connection here, an API there, schemas stuffed into prompts, and the pile worked in the demo and failed in production for reasons this series has cataloged at length: no shared meaning, no enforceable governance, no attribution, no scaling story. The failures were not independent. They were the same failure, responsibilities without homes, and a layered architecture is nothing more than the assignment of responsibilities to homes with contracts between them.

The five layers fall out of five questions that any agentic data estate must answer somewhere.

Where do the bytes live so that everything can read them and nothing owns them? That is Storage, and its answer is open formats on commodity object stores.

How do independent systems agree on what tables exist, what state they are in, and who touches them? That is Catalog: coordination, commits, and credentials.

What do the bytes mean, and who is allowed to see which slices of that meaning? That is Semantic: entities, metrics, and policies compiled into every access.

How do autonomous systems reach the meaning, at scale, with identity, limits, and logs? That is Gateway: the governed front door, stateless and metered.

And what do agents actually do with the access, in what workflows, with what authority, supervised how? That is the Agent Surface: the applications, assistants, and autonomous operators, with their scoping, evaluation, and autonomy tiers.

The map in one table, before the tour:

| Layer | Question it answers | Open standard at the seam | Contract upward |
|---|---|---|---|
| Storage | Where do bytes live neutrally? | Apache Iceberg, Parquet | Tables, snapshots, statistics |
| Catalog | How does everything agree? | Iceberg REST protocol | Governed, credentialed table access |
| Semantic | What does it mean, for whom? | Portable contracts, interchange formats | Compiled metrics, entities, policies |
| Gateway | How does autonomy reach it? | MCP, stateless 2026 revision | Scoped, metered, logged tool catalog |
| Agent Surface | What is judgment allowed to do? | Framework-agnostic by design | Evaluated, tiered, attributable agents |

Two compressions get proposed in every architecture review, and both fail on inspection, which is worth documenting because the proposals recur. Merging Semantic into Catalog, one metadata tier to rule them, founders on the layers' different physics: the catalog coordinates state across engines and must stay lean, fast, and universally implemented, while the semantic layer compiles meaning and grows with the business's vocabulary, and welding them couples the estate's most stable component to its most alive one. The layers cooperate, the catalog trend of registering semantic assets points at shared discovery, and the responsibilities stay distinct. Merging Gateway into Agent Surface, letting each framework carry its own governance, founders on plurality: frameworks multiply and churn, and governance embedded per-framework is governance reimplemented per-framework, which is the N-times-M integration problem this architecture exists to collapse, returned wearing agent clothes. The gateway exists because the frameworks will not agree, and does not need to.

The layering discipline is the standard one from every architecture that survived its decade: each layer consumes only the contract of the layer below, each contract is an open standard, and responsibilities live in exactly one layer, so that a change in any layer, a storage migration, a catalog swap, a new agent framework, propagates as a configuration change at one seam rather than as a rewrite of the pile. The rest of this article walks the layers bottom-up, then runs a question through all five, because the composition is where the architecture earns its diagram.

## Layer One: Storage, Where Neutrality Begins

The foundation layer is the least glamorous and the most consequential, because every property the upper layers promise is inherited from decisions made here.

The layer's job: hold the estate's data durably and cheaply, in formats every present and future consumer parses, on infrastructure that imposes no allegiance. Its modern answer is settled: Apache Parquet files organized as Apache Iceberg tables on S3-compatible object storage, cloud or on-premises, with Iceberg supplying what raw files never had, atomic commits, snapshot isolation, time travel, schema evolution, and the statistics that make planning cheap. My writing covers this layer's depths, the v3 features that made streaming mutation affordable, the v4 direction on metadata scale, and none of the depth changes the layer's architectural role: it is the neutral ground.

What the layer contributes to the agentic story specifically is worth stating, because it predates the agents and they inherit it whole. Immutable snapshots are why an agent's read is consistent mid-workflow and why the quality machinery can quarantine and roll back without endangering readers. Time travel is why restatements, reproductions, and audits address exact historical states. Branches are why autonomous remediation stages safely before publishing. And the open format is why the agent frameworks of 2028, whatever they are, will read this estate without a migration, which is the neutrality argument my decoupling article makes, extended one consumer generation forward.

The layer's operational floor rides along and matters at machine scale: the maintenance metabolism, compaction, snapshot expiration, orphan cleanup, owned and scheduled per table, because agent-cadence reads amplify every small-file and metadata debt, and the scan hygiene that was a performance nicety for human traffic is a cost control under machine traffic, as the TCO writing quantifies.

The layer's contract upward is deliberately thin: tables, snapshots, and files, addressed through the catalog above, never directly. And what breaks without it is the pile's oldest failure: data in proprietary or ad-hoc formats makes every upper layer vendor-bound or fragile, which is why estates that skipped this layer's discipline find their agent programs inheriting a migration project as a prerequisite.

## Layer Two: Catalog, Where Coordination Lives

The second layer answers the agreement question, and my decoupling article calls it the linchpin for reasons the agentic era only sharpened.

The layer's job: be the single authority on what tables exist, what their current state is, and who accesses them, for every engine and every agent alike. Its modern answer is the Iceberg REST catalog protocol, implemented by Apache Polaris and a healthy field of alternatives, carrying three responsibilities that the agentic estate leans on constantly. Commit arbitration: every write, human pipeline or autonomous agent, resolves through the catalog's atomic pointer swap, which is why a fleet of writers, including the quality agents and maintenance services, coexists without corruption. Discovery: the namespace is the estate's map, which the upper layers enrich but never replace. And credential vending: no consumer holds standing storage keys, access arrives short-lived and scoped per table per principal, which is the floor of the entire security story, the property that makes "what can this compromised agent reach" an enumerable question.

Ownership at this layer means production treatment, the point my decoupling writing presses: the catalog is a tier-one dependency whose backing database gets rehearsed recovery, whose upgrades run against the engine matrix, and whose availability math the agent estate inherits, because a catalog outage pauses every write and every fresh plan in the building, machine consumers included.

The agentic additions to this layer are arriving as protocol evolution rather than replacement, which is the standard working: server-side scan planning moves metadata traversal behind the API where lightweight consumers need it, and the catalog's audit stream, every table access by every principal, is the record that the observability and compliance planes read. The layer's contract upward: named tables with governed, credentialed access and atomic writes. What breaks without it: the estate fragments into per-engine views of truth, direct storage access sprawls into an unauditable mess, and the agent program's security review fails on its first question.

## Layer Three: Semantic, Where Meaning Becomes Infrastructure

The third layer is the one the agentic era promoted from convenience to prerequisite, and my writing spends more words here than anywhere because this is where the pilots died.

The layer's job: hold the estate's meaning, entities with their blessed joins and grain, metrics as versioned contracts, conformed dimensions, and the row and column policies that scope meaning per principal, and compile every request against that meaning identically, whoever asks. Its components are the semantic layer platform with its virtual datasets and compiler, the metric contract corpus with its lifecycle and testing, and the federation reach that lets meaning span data that has not consolidated, cloud warehouses, operational databases, the lakehouse itself, one definition over all of it.

Three properties make this layer the agentic keystone, each argued at length elsewhere in this series and compressed here. Determinism: the same governed request compiles to the same query forever, which is what replaces generation's sampling variance with infrastructure's sameness. Enforcement position: policies fold in at compilation, before any SQL exists, so an agent's access is bounded structurally, uninstructably, and identically to every other consumer's. And encoded negotiation: the contracts are the organization's settled meaning, which converts the agent's impossible job, rediscovering what revenue means per request, into its tractable one, selecting among described, versioned definitions.

Two of the layer's newer duties round out its agentic profile. Discovery became semantic: the catalog of meaning is searchable in natural language, for humans and agents alike, which is the routing tier that maps a question to the governed definition before any computation, and whose quality lives in the descriptions the contract discipline engineers. And runtime data health joined the metadata: the quality layer's incident state threads through the lineage, so a compiled answer over a table under active containment carries the disclosure, which is the difference between an estate that is honest with its consumers and one that is merely fast for them.

The layer's contract upward is the catalog of meaning: entities, metrics, and dimensions, each described for reasoning consumers, requestable by name, compiled with policy, returning results stamped with version and freshness. Its acceleration tier, the transparent materializations, is a private implementation detail behind that contract, which is exactly where performance machinery belongs. What breaks without it is this series' most documented failure: agents that author against raw schemas, fluently, inconsistently, and ungovernedly, the text-to-SQL trap in full, plus the quieter organizational cost, the definition arguments that never end because no artifact settles them.

## Layer Four: Gateway, Where Autonomy Meets Operations

The fourth layer answers the reach question, and it is the newest, hardened by the protocol work of the last year.

The layer's job: be the operated, governed surface through which every agent reaches the estate's capabilities, with the properties any production front door owes: authentication of every request, authorization per principal per tool, rate and budget enforcement, complete telemetry, and web-grade scalability. Its modern answer is an MCP gateway tier on the stateless 2026 protocol, built with frameworks like FastMCP, deployed as ordinary horizontally-scaled services, composing many teams' tool servers into one published catalog, with header-visible routing, cacheable discovery, and per-request authorization that the specification's evolution made native.

The gateway's architectural weight comes from convergence: because all agent traffic passes here, the responsibilities that need a single point stack naturally. Security: principals resolved, tool grants enforced, throttles applied, the blast-radius bounding my security writing details. Economics: the metering that attribution, budgets, and unit economics stand on, one instrumentation serving the cost program and the audit trail both. And operations: the health, scaling, and rollout machinery that turns the agent estate from an experiment into a service with an on-call rotation. The tool design disciplines live here too, bounded outputs, idempotent mutations, descriptions engineered as interface, versioned contracts, because the gateway is where tools are published, which makes it where their quality is governed.

The layer's economics duty deserves the explicit sentence the TCO discipline earns it: the gateway is where agent spend becomes attributable, per principal, per workflow, per tool, and the budget and throttle declarations that bound autonomy's worst minute live in its configuration, in the repository, beside the grants they parallel. An estate evaluating gateway options should weigh the metering surface as heavily as the protocol compliance, because the cost program inherits whatever the gateway measures.

The contract upward: a discoverable, scoped catalog of tools, resources, and prompts, callable by authenticated principals within declared limits, with every call logged and priced. What breaks without it: the side-door estate, each agent wired directly to whatever it reached, no enumeration of capability, no meter, no revocation story, which is the configuration that turns the first serious incident into a program review.

## Layer Five: Agent Surface, Where Judgment Gets Organized

The top layer is where the humans' intent and the machines' autonomy actually meet, and it is the layer most often mistaken for the whole architecture, because it is the layer people see.

The layer's job: host the agents themselves, the analytics assistants, the report producers, the operational copilots, the quality and maintenance operators, and organize their judgment: what each is for, what it is scoped to, how well it works, and how much authority it holds. Its components are the frameworks and orchestrations the organization runs, plural by nature and by design, and the disciplines this series builds around them: per-agent principals with deliberately narrow catalogs, selection-over-authoring as the interaction shape, evaluation as standing infrastructure, golden sets, consistency under paraphrase, selection suites, adversarial governance tests, and the graduated autonomy tiers with their evidence-based promotion, observe, propose, act-with-approval, act-within-bounds.

Two surface-layer concerns deserve their placement because they tempt architectural drift. Agent memory, the case histories, preferences, and working context that make agents useful across sessions, lives in governed stores like all state, tables under the catalog or the externalized stores the gateway's state discipline names, never in the pile's ambient middleware, because memory is data with policies like everything else. And multi-agent composition, orchestrators delegating to specialists, stays inside the layer: the orchestration patterns change monthly, and the architecture's stability comes from every participant, orchestrator and specialist alike, being an ordinary principal on the governed path, with the metric contracts as their shared vocabulary and the workflow identifiers threading their joint work through the observability plane.

The layer's most important property is the one the architecture beneath makes possible: agents here hold no privileged machinery. They are clients of the gateway's catalog, principals in the governance repository, entries in the cost allocation, workflows in the evaluation suites, which means framework plurality is safe, agents from any vendor on any orchestration converge on the same governed path, and the estate's answer to the next framework wave is a principal grant, not an integration project. What breaks when this layer lacks its disciplines, even atop a perfect stack below: unscoped agents with maximal catalogs, unmeasured quality, autonomy granted by enthusiasm rather than evidence, which is how good architectures still produce bad incidents.

The contract upward from this layer is to the organization itself: agents whose capabilities are enumerable, whose answers are citable, whose costs are attributable, and whose authority is a reviewed, revertible setting, which is the set of sentences that lets autonomy into rooms where consequences live.

## The Counterfeit Versions of Each Layer

Every layer has a counterfeit, a component that occupies the diagram's box without delivering the layer's contract, and naming them protects the audit from checkbox architecture.

Counterfeit storage is open format without open access: Iceberg tables readable only through one vendor's runtime, or parked behind a proprietary catalog with no REST seam, which delivers the format's letter and none of its neutrality. The tell is the vendor-change test failing despite the Parquet on disk.

Counterfeit catalog is a table registry without the security model: discovery and commits present, vending absent, engines still holding standing bucket credentials, which keeps the coordination and forfeits the governance floor. The tell is the storage policy audit: if anything reads the warehouse bucket without a catalog-minted credential, the layer is decorative.

Counterfeit semantic is documentation wearing the layer's name: a metrics glossary, a data dictionary, definitions humans read and no compiler enforces, which is meaning as aspiration rather than infrastructure. The tell is the agreement test: if the assistant and the dashboard compute independently and merely reference the same wiki, the layer does not exist where it counts.

Counterfeit gateway is a proxy without a control plane: agent traffic technically passes through a tier that authenticates nothing per-tool, meters nothing per-principal, and publishes whatever every team registered, a load balancer cosplaying as governance. The tell is the two questions the real layer answers instantly: what can this agent reach, what did it cost, and the counterfeit answers neither.

And counterfeit surface discipline is evaluation theater: a demo-day golden set run at launch and never again, autonomy tiers written down and promoted by calendar rather than case history. The tell is asking for last month's selection-suite trend and receiving a shrug.

The counterfeits share a genealogy: each is the real layer's first milestone, frozen and declared done, which is why the maturity path ahead treats every layer as a program with a trajectory rather than a purchase with a checkbox.

## One Question, Five Layers: The Composition

The architecture earns its diagram in the traversal, so walk one request through the whole stack: a regional sales director asks the analytics assistant, "how did recognized revenue trend in my region last quarter, and what drove the dip in May?"

The Agent Surface receives the question. The assistant, running on whichever framework its team chose, resolves its plan: this needs the recognized_revenue metric by month for one region, plus a driver decomposition, two governed requests and a synthesis. Its principal is the assistant's own, scoped to the finance-published catalog, and its budget file bounds what this exchange is allowed to cost.

The Gateway takes the calls. Each request arrives stateless, authenticated, headers naming the tool, and the gateway checks the principal's grants, applies the throttles, stamps the telemetry, and routes to the semantic tool server, with the whole exchange already visible to the meter and the audit stream before any data moves.

The Semantic layer compiles. The metric request resolves against contract version 3.2.0, the compiler folds in the director's row policy, this principal's requests scope to their granted regions structurally, chooses the blessed joins from the entity definitions, and the optimizer answers from the acceleration tier's materialization, current as of last night's incremental refresh, falling through to live computation only where no materialization serves. The driver decomposition compiles the same way against the same definitions, which is why its numbers will reconcile with the trend it explains.

The Catalog and Storage layers serve the leaves. Where computation touches tables, the engine resolves them through the catalog, reads with vended credentials against the Iceberg snapshots, prunes with the format's statistics, and every access lands in the audit stream under the compiling principal. Nothing in the path held a standing key, nothing read an ungoverned byte, and the dip under investigation, it turns out, touches a period flagged by the quality layer's history, a contained incident on an upstream feed, which the response's metadata surfaces as a footnote because the lineage threading carries it.

The answer returns up the same path: numbers with their contract versions and freshness stamps, the narrative synthesized at the surface, the citation trail intact, the cost of the exchange attributed to the assistant's budget, the whole traversal logged at every layer. The director gets an answer that matches the dashboard, because it is the dashboard's computation, and the estate gets what the pile never had: one path, five contracts, every property inherited rather than hoped.

## A Second Traversal: The Write Path

The read traversal shows the composition's happy path, and the write path shows its teeth, so run one more request through: the operations copilot, at tier three for its duplicate playbook, handling the 2 a.m. incident my quality writing narrates, this time watched from the layers' perspective.

The Agent Surface holds the authority question: the copilot's contract declares its tier, its bounds, and its playbook scope, so the decision "am I allowed to contain this autonomously" is a lookup against a reviewed file, not a judgment call, and the case history that earned the tier is addressable when the morning review asks why.

The Gateway holds the capability question: containment is a composition of bounded tools, quarantine-by-predicate, open-branch, run-verification, fast-forward, each a separate grant in the copilot's catalog, each call metered and logged, and the tool the copilot does not hold, raw table deletion, is not refused at runtime, it is absent from the reachable world.

The Semantic layer holds the meaning question at verification time: the checks that gate the publish, totals moving by exactly the quarantined amount, distributions rejoining baseline, compile against the same governed definitions the business reports use, which is why the morning's finance review and the agent's midnight verification cannot disagree about what the numbers meant.

And Catalog plus Storage hold the safety question: the containment stages on an Iceberg branch, invisible to every reader, verifies against real data at full scale, publishes through the catalog's atomic swap under the copilot's own principal, and remains reversible by snapshot for as long as the retention window runs. The write path's summary is the architecture's whole security argument in one sentence: the agent's autonomy is real, and every layer it acts through was designed for exactly this actor, which is why the incident review reads like operations rather than like forensics.

## The Cross-Cutting Planes

Three disciplines run through all five layers rather than living in any one, and the architecture is incomplete without naming them, because they are how the layers stay one estate instead of five fiefdoms.

Governance as code is the change plane: the namespaces and grants of the catalog, the policies and contracts of the semantic layer, the tool grants, budgets, and throttles of the gateway, and the scopes and autonomy tiers of the agent surface all live as versioned definitions in one repository family, changed by reviewed diffs, promoted through environments, tested by policy suites, reconciled against drift. The plane's payoff is the sentence this series keeps earning: any question of the form "who changed what, when, and under whose approval" answers from history, at every layer, in one grammar, and the composite changes, a new agent's launch touching identity, meaning, money, and access, ship as one reviewed unit.

Observability is the seeing plane: the catalog's audit stream, the semantic layer's request log with versions and policies applied, the gateway's traces with principals and costs, and the surface's evaluation results, joined by the identifiers that thread a workflow through all of them, so that one trace shows a question's full traversal and one dashboard shows the estate's health per layer. The plane's design rule is the one the layers make cheap: instrument at the convergence points the architecture already built, and derive the rest.

And economics is the accountability plane: metering at the gateway, workload accounting at the engines, unit costs per task at the surface, budgets in the repository, the whole TCO discipline from its own article, running on the same identifiers as observability because cost is just telemetry with prices attached. The three planes share a property worth noticing: none required new enforcement points, because the five layers' convergence points, catalog, compiler, gateway, are where cross-cutting concerns naturally attach, which is the quiet structural argument for the layering over the pile.

## Build Order: The Maturity Path

Nobody builds five layers in a quarter, and the architecture's practical virtue is that it builds bottom-up in value-bearing increments, each layer useful before the next exists.

Storage and Catalog first, because everything inherits from them: open tables under a REST catalog with vending, which is simply the modern lakehouse, valuable for entirely pre-agentic reasons, engine freedom, governance floor, cost, and the migration paths my zero-copy writing maps. Estates already here, and many are, start the agent journey two layers up.

Semantic second, and start it before the agents demand it, with the adoption sequence its own article prescribes: one painful metric, one owned entity, the BI estate converging on compiled definitions, the contract discipline growing by demonstrated relief. This layer's pre-agentic payoff, the reconciliation meetings that stop, funds its build, and its existence is what makes the next layer's catalog worth publishing.

Gateway third, arriving with the first serious agent ambitions: the tool tier over the semantic catalog, principals and grants in the repository, metering from day one because retrofitting attribution is the audit that never ends. The gateway can precede broad agent deployment, and should, because the first agent launched onto a governed path sets the pattern every subsequent one inherits.

Agent Surface last and continuously: agents launched narrow, evaluated always, promoted on evidence, with the launch template, identity, scope, budget, evaluation, autonomy tier, as one reviewed artifact. The maturity signal at this layer is cultural: new agent proposals arriving already shaped to the template, because the paved road became the obvious road.

A maturity vocabulary helps the roadmap conversations, and three levels per layer cover the honest range. Present: the layer exists and delivers its contract on some scope, the first namespace vended, the first dozen contracts compiled, the first agents gatewayed. Governing: the layer's discipline runs, changes as code, drift detected, the counterfeit tells all passing on the covered scope. And Compounding: the layer's telemetry drives its own improvement, acceleration tuned from workloads, contracts expanded from declines, tiers promoted from case history, which is the level where the layer stops costing attention and starts generating it. The estate's maturity is its weakest layer's level on the scopes that matter, and the quarterly audit's output is each layer's level with its next milestone, which turns the five-layer diagram from a poster into a plan.

The sequencing's honest caveat: estates rarely build cleanly, acquisitions arrive mid-stack, pilots run ahead of foundations, and the architecture tolerates it, provided the debts are named: an agent shipped against an incomplete semantic layer is a debt with a plan, an agent shipped around the gateway is a debt with a deadline, and the layering's gift to the messy reality is that every debt has a defined home to migrate toward.

## Auditing Your Estate Against the Layers

The diagram doubles as a diagnostic, and the audit is five questions with observable answers.

| Layer | The test question | Passing looks like |
|---|---|---|
| Storage | What breaks if we change engine vendors? | Configuration changes, data untouched |
| Catalog | Who accessed table X last Tuesday? | One query, one audit stream, complete |
| Semantic | Do the assistant and the dashboard agree? | Same number, same version, by construction |
| Gateway | What can this agent reach, and what did it cost? | Enumerable grants, attributed spend |
| Surface | Why does this agent hold this authority? | Evidence in the case history, tier in the contract |

Run the questions honestly, with the actual artifacts open rather than from memory, and most estates find their shape: a strong bottom two from the lakehouse investment, a semantic layer partially built and unevenly adopted, gateway machinery half-assembled from the first agent project, and a surface running ahead of everything below it, which is the modal 2026 configuration and a perfectly workable starting position, because the audit's output is the roadmap, each failing answer naming its layer and each layer having its article, its adoption sequence, and its first quarter's plan.

The audit's second pass is the seams: is each boundary an open standard, Iceberg at the bottom, REST catalog above it, portable contracts in the middle, MCP at the gateway, or has a proprietary seam crept in where a standard exists? The seam audit is the optionality audit from my decoupling writing, extended up the stack, and its findings price the estate's real switching costs, which is information worth having before any renewal conversation, and occasionally the whole reason the diagram gets drawn.

## Where the Familiar Pieces Fit

The diagram triggers a predictable set of "where does X go" questions, and answering the recurring ones sharpens the layers' edges.

Query engines are not a layer, deliberately: they are the computational muscle that several layers employ, the semantic layer's compiler targets them, the catalog governs their access, pipelines run on them, and the portfolio discipline from my decoupling writing manages them as replaceable clients of the estate rather than as its skeleton. The engine question, which one for which workload, is real and has its own article in this series on routing at machine scale, and it is an operations question inside the architecture, not a layer of it.

Pipelines and ingestion live below and beside: they are writers, governed by the catalog like every writer, increasingly right-sized per feed as my serverless ingestion writing argues, and their outputs become the estate the layers serve. The transformation frameworks' assertion suites pair with the quality layer's runtime watch, deploy-time and data-time coverage composing.

Vector search and retrieval infrastructure lands by its role: embeddings over governed content are semantic-layer citizens, published and policy-scoped like any meaning, the indexes are acceleration machinery behind the contract, and the format-level direction on richer statistics points at storage-layer participation growing. What retrieval never gets to be is a side door: content reachable through the retrieval path carries the same policies as content reachable through the metric path, which is a one-sentence design review that catches a whole incident class.

Legacy warehouses and operational systems attach through federation at the semantic layer and through the migration gradients my zero-copy writing maps: reachable immediately, governed through the same compilation, consolidating underneath at their own economic pace. The diagram absorbs the messy estate. It does not wait for a clean one.

And the humans' BI is simply the agent surface's older sibling: dashboards and analysts consume the same semantic contracts through the same compiler with the same policies, which is not a coincidence but the whole point, one meaning tier serving both consumer generations, with the agents' arrival having finally funded the layer the humans deserved all along.

## Failure Modes of the Whole

Each layer's article carries its own failure catalog, and the composed architecture adds failure modes that live between layers, which are the ones this capstone should name.

**The bypass gradient.** Every layer can be skipped by the layer above under deadline: agents reaching around the gateway, tools querying around the semantic layer, jobs reading around the catalog, and each bypass works, which is the problem, because the pile rebuilds itself one exception at a time. The defense is structural where possible, storage policies that only honor vended credentials, network paths that route agent traffic through the gateway, and cultural where not: bypass requests logged as debts with deadlines, reviewed where exceptions are granted, with the paved road's speed as the standing argument.

**Layer skew.** The layers evolve at different rates, a semantic corpus racing ahead of the catalog hygiene beneath it, an agent surface consuming faster than the gateway's operations matured, and the skew presents as the upper layer's incidents with the lower layer's causes. The defense is the audit run quarterly, with each layer's owner present, because the composed estate needs the cross-layer review the per-team view never provides.

**Responsibility leakage.** Meaning creeps into agent prompts, policy creeps into tool code, state creeps into gateway pods, and each leak is a responsibility escaping its home, recreating the pile inside the diagram. The defenses are the per-layer disciplines plus one composed habit: the design review question, asked of every new component, which layer owns this, with "several" treated as the wrong answer it almost always is.

**The unowned middle.** Storage and agents both have natural owners, and the middle layers, semantic especially, fall between platform and domain teams unless deliberately assigned, which is how estates end up with a magnificent bottom, an ambitious top, and a hollow middle that everything routes around. The defense is the ownership models each layer's article prescribes, with the capstone's addition: the estate needs one architectural owner for the composition itself, the role that runs the quarterly audit and holds the seam standards, whatever the organization titles it.

## Conclusion

The agentic lakehouse is five layers because autonomous consumption asks five questions, and every question needs a home with a contract: open storage so nothing owns the bytes, a catalog so everything agrees on state and access, a semantic layer so meaning is compiled rather than guessed, a gateway so autonomy arrives authenticated, limited, and metered, and an agent surface so judgment is scoped, evaluated, and promoted on evidence. The seams between them are open standards, which is what keeps every layer replaceable and the whole survivable, and the cross-cutting planes, governance as code, observability, economics, run through the convergence points the layering conveniently built.

The composed claim is the one to carry out of this series: the trustworthy agent estate and the well-architected data estate are the same estate, and the diagram's five boxes are one investment wearing five names. Every layer exists for reasons that predate the agents, and the agents are simply the consumer generation demanding that the architecture finally be finished. Finish it in order, audit it quarterly, defend the seams, and the next wave of consumers, whatever they are, will find five contracts waiting instead of a pile, which is what an architecture era's reference diagram is actually for.

## Keep Going

If this piece was useful, it is the map to a territory my other writing covers in depth, layer by layer: the table format and lakehouse foundations in *Apache Iceberg: The Definitive Guide* from O'Reilly and *Architecting an Apache Iceberg Lakehouse* from Manning, the catalog layer in *Apache Polaris: The Definitive Guide*, and the semantic, gateway, and agent layers across my recent agentic analytics writing. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
