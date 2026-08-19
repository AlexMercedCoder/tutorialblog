---
title: "Query Routing at Machine Scale: Multi-Engine Workload Distribution for the Agentic Lakehouse"
date: "2026-08-19"
description: "Query routing at machine scale for the agentic lakehouse: engine selection, acceleration substitution, admission control, and placement across multi-engine estates."
author: "Alex Merced"
category: "AI & Agents"
canonical: https://iceberglakehouse.com/posts/query-routing-machine-scale/
tags:
  - query routing
  - workload management
  - multi-engine
  - agentic lakehouse
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/query-routing-machine-scale/).

For most of the analytics era, query routing was a human problem with human solutions. Analysts learned which tool to open for which job, platform teams published guidance about where the big joins belonged, and the estate's workload distribution was the sum of a few hundred people's habits, corrected quarterly by a wiki page nobody read. The arrangement survived because the query population grew with headcount, which is to say slowly, and because humans absorb routing rules the way they absorb office norms, imperfectly and well enough.

Agents ended the arrangement. A single analytics assistant generates more query traffic than the department it serves, an estate's agent population multiplies that by dozens, and the traffic's character changes along with its volume: machine-issued queries cluster into repeated shapes, arrive in bursts that follow model behavior rather than business hours, chain into workflows where one slow step stalls a plan, and originate from principals that read no wiki and absorb no norms. The question "which engine, which resources, which path" now gets asked thousands of times an hour by systems that need the answer computed, not remembered, and computing it well is the difference between an estate that scales with its agents and one that melts under them.

This article is the routing discipline in full: what machine-scale traffic actually looks like, the four routing dimensions that decide where work lands, engine selection, acceleration substitution, admission control, and federation placement, where the routing brain lives in the layered architecture my capstone article maps, how routing policies get declared and reviewed as code, the feedback loops that keep routing honest as workloads drift, and the failure modes that arrive when any of it is skipped. A disclosure as always: I work at Dremio, whose engine and semantic layer sit squarely in this territory, and the patterns here are architectural, stated for the multi-engine, open-catalog estate my other writing assumes, buildable across the vendor field.

## What Machine Scale Actually Changes

Routing design starts with an honest model of the traffic, and agent-era query traffic differs from the human era in five measurable ways, each with a routing consequence.

Volume decouples from headcount. Query counts scale with agent behavior, workflow steps, retries, verification passes, monitoring sweeps, so an estate's traffic multiplies without anyone being hired, and it multiplies again when a framework update changes planning depth. The routing consequence: capacity assumptions tied to user counts are dead, and admission control, the machinery that decides what runs now versus queues versus gets declined, graduates from warehouse nicety to load-bearing tier.

Shapes concentrate. Human queries are long-tail: everyone's exploration is a little different. Agent queries cluster hard, because they compile from a finite catalog of governed metrics and tool calls, the same shapes at the same grains, thousands of times. The routing consequence is the happiest one: concentrated shapes are exactly what acceleration tiers and caches serve best, so machine traffic is more routable than human traffic, provided the routing layer can see the shapes, which the selection-over-generation architecture guarantees and raw SQL generation destroys.

Bursts follow machines. Traffic arrives in synchronized waves, the nightly report agents, the post-deploy re-evaluations, the quality sweeps after a big commit, and the waves correlate across agents in ways human traffic never did, because the agents share triggers. The routing consequence: isolation between workload classes stops being about fairness among teams and becomes about protecting the interactive tier from the batch tier's synchronized surges, with the surge patterns predictable enough to schedule around.

Chains change the latency math. A human waits for one query. An agent workflow's latency is the sum of its steps' latencies, so a p95 that satisfied dashboards produces a p95-to-the-tenth-power problem for ten-step plans, and one mis-routed step, the interactive-class request that landed in the batch queue, stalls a whole workflow and everything downstream of it. The routing consequence: latency classes must be declared per request and honored per hop, because the workflow inherits its worst routing decision.

And principals replace people. Every query arrives under an agent principal with a declared budget, throttle, and priority, the economic envelope my TCO writing builds, which means the router has, for the first time, machine-readable context about every request's importance and allowance. The routing consequence is the opportunity the whole discipline stands on: routing can finally be policy, computed from declarations, rather than folklore, remembered by humans.

The traffic model is measurable, and the measuring belongs at the start of any routing program: shape concentration as the fraction of traffic covered by the top recurring compiled forms, surge correlation as the cross-agent timing clusters in the admission logs, chain depth distributions from the workflow traces, and per-principal traffic against declared envelopes. The four numbers, pulled from telemetry the layered estate already emits, tell the program where its biggest wins sit before any policy gets written, and their trends afterward are the program's own report card, which is why the worked example ahead starts with a month of measurement and why yours should too.

## The Routing Problem, Stated Properly

With the traffic model in place, the problem statement: for every unit of work, choose the execution path that meets its declared latency class, inside its principal's economic envelope, at the estate's lowest feasible cost, without letting any class's load damage another's. Four dimensions of choice compose into that path, and the discipline is seeing them as one problem rather than four settings pages.

Engine selection: which computational muscle runs the work, the warehouse-scale SQL engine, the batch framework, the embedded engine, the streaming tier, chosen per workload class from the portfolio my decoupling writing manages.

Acceleration substitution: whether the work runs at all, or answers from a materialization, the optimizer-level routing that turns repeated shapes into lookups.

Admission and resource assignment: when the work runs and with what resources, the queues, concurrency slots, and resource classes that implement isolation and priority.

And placement: where the work executes relative to the data, pushdown into federated sources, execution near the region that holds the partitions, the locality tier that egress economics and residency both govern.

The dimensions interact, which is why they need one brain: an acceleration hit makes engine selection moot, a placement decision changes which engines are candidates, an admission queue's depth should influence whether the router degrades a request to a cheaper class, and the sections ahead take the dimensions in turn before assembling the brain that composes them.

## What Routing Is Not: Three Clarifying Boundaries

The word routing carries neighbors, and three boundary clarifications keep the discipline's scope honest.

Routing is not load balancing. The gateway tier's replicas balance requests across identical pods, a solved web problem the stateless protocol made ordinary, and workload routing chooses among deliberately different execution paths with different costs, latencies, and freshness properties. Balancing distributes sameness. Routing selects among differences, which is why it needs policy where balancing needs an algorithm.

Routing is not the optimizer, and it employs one. Query optimization chooses the best plan for a given query on a given engine, join orders, pruning, and the acceleration substitution that this article claims as a routing dimension sits exactly on the boundary: it is optimizer machinery making what is architecturally a routing decision, which path serves this request, and the framing matters because it determines who governs the decision's inputs. Staleness tolerances and substitution eligibility are declared policy, reviewed like policy, even though an optimizer enforces them, which is the pattern throughout: routing is the policy layer, and optimizers, schedulers, and workload managers are its enforcement points.

And routing is not multi-engine federation of a single query. The estate's queries each run on one engine, chosen well, with federation handling the single-query-many-sources case inside the semantic layer's compilation. The exotic alternative, splitting one query's fragments across different engine vendors, exists in research and rarely earns its complexity in production estates, where the winning pattern is the one this article assumes: route whole units of work to whole execution paths, and let each path's own planner do its job. The boundary spares the routing program a science project and keeps its decisions explainable, which the trust sections ahead depend on.

## Dimension One: Engine Selection as Classified Policy

The multi-engine estate exists because no engine wins every workload, and machine scale converts the portfolio's informal mapping into classified policy: every request carries a workload class, and every class declares its engine.

The classes that recur across estates, with their routing logic. Interactive governed reads, the agent metric requests and dashboard traffic, route to the warehouse-scale SQL engine with the semantic layer and acceleration tier, because sub-second consistency over governed meaning is that engine's whole justification. Bulk mechanical reads, the training-set pulls and feature exports, route to direct table access through native readers where governance permits, the engine-free path my Arrow and connectivity writing details, because a partition-range scan needs bandwidth, not a planner, and taking it off the interactive engine protects both. Heavy transformation routes to the batch framework, streaming apply to the streaming tier, development and CI validation to embedded engines against the same catalog, and maintenance, compaction, expiration, the quality agents' rewrites, to its own lane, sized and scheduled deliberately, because maintenance competing with serving is the oldest self-inflicted wound in the lakehouse book.

Two disciplines turn the mapping from diagram into system. Classification happens at declaration, not at guess-time: the workload class rides on the request, assigned by the tool definition at the gateway, the semantic layer's request type, or the pipeline's manifest, so the router reads the class rather than inferring it from SQL shape, and reclassification is a reviewed change to the declaring artifact. And the mapping lives in the routing policy as code, per class, with the portfolio review my decoupling writing prescribes as its change process: when the annual review moves a class to a different engine, the migration is a policy edit, consumers unaware, which is the layered architecture paying its dividend at the routing tier.

The selection dimension's machine-scale twist is graceful degradation as a declared path: each class names its fallback, the interactive class that degrades to a cached-or-queued response under pressure rather than timing out, the bulk class that yields its slots to a surge and resumes, because at machine scale the question is never whether pressure arrives but which classes bend and in what order, and writing the order down is the difference between load shedding and outage.

## Dimension Two: Acceleration as the First Router

The fastest query is the one that never runs, and in machine-scale estates the acceleration tier is not a performance feature that helps routing, it is the first routing decision, made silently on most requests before any engine is chosen.

The mechanism is the transparent substitution my semantic layer writing details: the optimizer holds a portfolio of materializations, reflections in Dremio's vocabulary, and answers any request those can serve from the precomputed form, falling through to live computation only when nothing matches, with consumers never knowing which path served them. Machine traffic transforms the economics of this tier twice over. The concentrated shapes raise hit rates: agent traffic compiled from a governed catalog hits materializations at rates human exploration never approached, so the marginal agent query costs a lookup. And the traffic's regularity feeds the tier's automation: the workload analysis that recommends, refreshes, and retires materializations reads a cleaner signal from clustered machine shapes than it ever read from human long tails, which is why the autonomous acceleration generation and the agent traffic generation arrived together and suit each other.

One sequencing note spares a common misinvestment: build this dimension's portfolio from measured shapes, not anticipated ones. The materialization built for the workload the architects expected serves the workload that arrives at whatever rate coincidence provides, while the portfolio seeded from a month of real traffic starts at the concentration the machine-scale model predicts, which is why the acceleration review belongs after the measurement month in every getting-started sequence, including the one ahead.

The routing discipline this dimension demands is freshness honesty at the routing decision: every materialization carries its as-of, every request class declares its staleness tolerance, and the router's substitution respects the pair, serving the reporting agent's daily rollup from last night's refresh while sending the operational copilot's live-state check through to computation. The declaration lives with the class, the enforcement lives in the optimizer, and the failure this prevents, the incident review that discovers a fresh-sounding answer was eight hours old, is the acceleration tier's one reputational risk, retired by making staleness a routed property instead of a surprise.

The dimension's second face is the caching stack above the optimizer: the semantic cache at the gateway serving repeated governed questions, policy-scoped as the TCO writing insists, and the workflow memoization catching intra-chain repeats. Composed, the acceleration dimension means a large fraction of machine-scale traffic never reaches an engine at all, which resizes every capacity conversation downstream and is the reason routing design starts here rather than at the queue.

## Dimension Three: Admission Control, Where Isolation Lives

What the acceleration tier passes through arrives at admission control, the dimension that decides now-versus-queued-versus-declined, and machine scale promotes it from tuning exercise to the estate's shock absorber.

The machinery is the engines' workload management, mature after two decades of warehouse practice: queues per workload class, concurrency slots, resource classes bounding memory and scan budgets, priorities and preemption rules, keyed at machine scale to the principals the gateway resolved, so the isolation follows identity. The design that works maps the classes to lanes with declared guarantees: the interactive lane sized and reserved so agent-facing and human-facing reads hold their latency class through any surge, the batch lanes elastic into whatever headroom exists, the maintenance lane scheduled into the quiet and capped always, and the bulk-read path throttled at its own tier since it bypasses the engines. The guarantees are the point: a lane's declared floor is what lets the layers above make latency promises, and an estate that cannot state each lane's floor has queues, not admission control.

Machine scale adds three behaviors the human era never needed. Surge choreography: the synchronized waves get schedules where they are schedulable, the nightly agents staggered by policy rather than colliding at midnight, and spillover rules where they are not, the declared degradation order from the engine dimension executing here. Envelope enforcement: the per-principal budgets and throttles from the economic discipline meter at this tier too, the query-class ceilings and scan caps that price-bound a principal's worst minute, so a looping agent exhausts its own envelope instead of the estate's. And workflow awareness: chained requests carry their workflow identifier, and the admission tier's fairness logic can see that starving one step stalls a plan, which at minimum means workflow-aware timeout alignment and at maturity means the workflow's declared deadline informing its steps' priorities.

The dimension's operating rule, learned expensively everywhere: admission decisions are visible decisions. Every queue wait, degradation, and decline lands in the telemetry with its reason, because at machine scale the alternative is agents experiencing mysterious latency and their owners filing tickets against the wrong layer, and the routing program's trust rests on being able to show any workflow exactly where its time went.

## Dimension Four: Placement, the Geography of Work

The final dimension is where the work executes relative to the data, and the multi-cloud, federated estate makes it a first-class routing choice rather than an accident of deployment.

Pushdown is placement at the query fragment grain: the federation tier's planner pushes filters, projections, aggregations, and join legs into the sources that hold the data, moving results instead of tables, the discipline my federation writing tests by reading plans. At machine scale the discipline compounds: agent traffic against federated sources multiplies whatever the pushdown misses, so the canary plan suite, representative federated shapes checked for pushdown health on every upgrade, moves from good practice to routing-tier regression testing, and the per-source workload contracts, the caps that keep analytics from becoming the operational database's incident, get enforced in the same admission machinery as everything else.

Regional placement is the same logic at the deployment grain: engine presence near the data gravity, work routed to the region holding the partitions, results traveling instead of scans, with egress economics and residency law both governing, and the semantic layer's compilation keeping meaning singular above the geography, as the multi-cloud writing maps. The machine-scale addition is that the router does the geography: the request's compiled plan knows its tables' regions from the catalog, the policy knows the egress prices and the residency constraints, and the placement decision computes, per request, instead of living in per-team deployment lore.

The write side gets its placement paragraph, because routing reads while ignoring writes leaves half the contention unmanaged: ingestion lands where the tables' regions and the pipelines' sources make it land, and the routable choices are the ones my ingestion writing sizes, the right-sized serverless writers for the long tail, the streaming tier for the firehoses, each in the maintenance-adjacent lanes that keep commit traffic and compaction from contending with serving. The one write-routing rule machine scale adds: the quality and maintenance agents' rewrites, branch staging and fast-forwards, serialize through their declared lane per table, because two automated writers optimistically retrying against each other is a throughput hole the commit-conflict hygiene predicts and the lane assignment prevents.

And the graduation rule ties placement to the estate's evolution: sources and regions that stay hot under machine traffic earn materializations or mirrors on the cheap side of the expensive path, the reflection of the remote warehouse refreshed incrementally, the CDC mirror that retires a federation hot spot, with the routing telemetry itself, cost and latency per source per class, generating the graduation candidates. Placement policy, done well, is how the estate's physical layout improves along the gradient the traffic reveals, which is the routing tier quietly doing the architecture's planning for it.

## Routing the Money: The Economic Dimension Woven Through

The four dimensions each carry a price tag, and the machine-scale estate routes cost alongside latency, which deserves its explicit assembly because the TCO discipline's controls meet the routing tier here.

Every path has a computable cost: the acceleration hit is nearly free at the margin, the interactive engine's slot has its rate, the direct read prices in requests and bandwidth, the federated pull prices in source load and egress, and the cross-region execution prices in whatever the geography charges. The routing policy composes them by class: latency-critical classes buy the fast path at its price, batch classes route to the cheapest path meeting their deadline, and the degradation orders are cost cliffs written down, the interactive request that falls back to cache rather than to an expensive live recomputation under pressure.

The economic envelopes enforce per principal what the classes declare per shape: a principal approaching its budget threshold degrades to its economy profile, the routing tier executing the exhaustion policy the budget file declared, cheaper substitutions preferred, batch lanes instead of interactive, the graceful poverty that keeps the assistant answering when its month runs long. And the unit economics close the loop upward: cost per task by workflow, decomposed by routing path, shows exactly which routing improvements move which workflows' economics, which is how the medium loop's tuning gets its priorities from the business's numbers rather than from the platform's instincts.

The section's rule of thumb for the design review: any routing decision that cannot state its cost delta is not yet a decision, it is a preference, and the telemetry exists to retire preferences.

## The Routing Brain: Where Decisions Live

Four dimensions need composition, and the composition question is architectural: where does routing intelligence live in the five-layer estate? The answer that works is distributed enforcement under centralized policy, with each decision made at the layer that has the context to make it, reading one declared policy.

The gateway routes at the request grain: workload class attached from the tool definition, principal and envelope resolved, the semantic cache consulted, and the request dispatched to the right backend, the semantic layer for governed reads, the direct path for bulk mechanical work, with the header-visible routing the stateless protocol provides doing exactly this job.

The semantic layer routes at the compilation grain: the optimizer's acceleration substitution, the staleness-tolerance matching, the placement of compiled fragments across federated sources and regions, decisions that need the compiled plan's knowledge and live nowhere else.

The engines route at the execution grain: admission into lanes, resource assignment, preemption, the workload management enforcing the guarantees the policy declared, keyed to the principals the upper layers resolved.

And the policy that all three read lives where every other authority in this series lives: the governance repository, as code, reviewed and versioned, which is the design's whole trick. No single component is "the router," routing is a property the layers enforce jointly, and the estate still has one place where routing behavior is declared, diffed, and reverted, which is what centralized means once you stop expecting a central box.

One property binds the distributed brain together and earns its sentence before the policy skeleton: explainability per request. Any workflow's trace reconstructs its routing story end to end, classified here, cache-missed there, admitted after this wait for that reason, executed on this engine in that region against a materialization of this age, because each layer's decision logged its reason into the shared trace. The property is what makes the distributed design governable, the answer to "why was this slow" or "why did this cost that" being a lookup rather than a cross-team investigation, and it is the standing argument against every clever routing shortcut that cannot explain itself.

The policy's shape, compressed to its skeleton:

```yaml
workload_classes:
  interactive_governed:
    latency_class: interactive
    engines: [sql_primary]
    lane: interactive
    lane_floor_slots: 24
    staleness_tolerance: 1h
    degrade_order: [serve_cached, queue_bounded, decline_polite]
  bulk_mechanical:
    latency_class: batch
    engines: [direct_read]
    lane: bulk
    throttle: per_principal
    degrade_order: [yield_and_resume]
  maintenance:
    latency_class: background
    engines: [batch_framework]
    lane: maintenance
    schedule_window: "01:00-05:00"
    cap_slots: 8

placement:
  regions:
    - name: us_east
      holds: [sales, finance]
    - name: eu_west
      holds: [eu_customers]
      residency: eu_only
  egress_policy: aggregates_travel
  federation:
    sources:
      - name: ops_postgres
        max_concurrency: 4
        pushdown_required: [filters, aggregates]

surge_schedule:
  nightly_reporting_agents:
    stagger_minutes: 15
    window: "02:00-04:00"
```

Read the file as the article compressed: classes with their engines, lanes, floors, staleness tolerances, and declared degradation orders, placement with residency as constraint and egress as policy, federation sources with their contracts, and the surge choreography written down where the review can see it. A routing behavior change, the interactive lane's floor raised for a launch, a class migrated to a new engine, ships as a diff with an owner, which is the property the folklore era never had and the machine era cannot live without.

## Feedback: Routing as a Learning System

Static routing policy decays as workloads drift, and the machine-scale estate closes the loop deliberately, with three feedback cycles at three speeds.

The fast loop is operational, minutes to hours: lane depths, latency-class attainment, acceleration hit rates, degradation activations, and per-source federation health, on the routing dashboard, with the alerts keyed to declared guarantees rather than raw utilization, because the promise breached is the event, not the busy engine. The fast loop's job is catching the surge the choreography missed and the pushdown regression the upgrade shipped, and its instrument is the reason-annotated telemetry the admission dimension insisted on.

The medium loop is the tuning cycle, weekly to monthly: the acceleration portfolio reviewed against hit rates and refresh costs, the materialization and mirror candidates the placement telemetry generated, lane floors adjusted from attainment trends, and the surge schedule updated as the agent population changes. At maturity much of this loop automates, the autonomous acceleration tier managing its own portfolio, with the humans reviewing recommendations, which is the compounding level the maturity model names.

Capacity planning becomes a routing artifact once the loops run: engine demand forecasts from acceleration-miss rates rather than raw traffic, lane floors from attainment trends with the launch calendar's known additions, and the scenario the human era never modeled, the framework update that changes agent planning depth, handled as the step-function it is, with the change log beside the forecast the way the TCO discipline prescribes. The estates that plan this way stop buying compute for traffic their materializations already absorb, which is the routing program quietly funding itself.

And the slow loop is the portfolio review, quarterly: workload classes re-validated against their engines with the measured cost and latency per class per engine that the routing telemetry accumulates, the graduation decisions, sources to mirrors, hot paths to materializations, classes to different engines, and the policy file's diff as the review's output. The slow loop is where routing meets the estate's evolution, and its quiet superpower is evidence: the multi-engine estate's perennial arguments, whether the workload belongs on the engine, settle with the routing tier's own numbers, per class, on the estate's own tables, which is the annual-review discipline my decoupling writing wanted, now fed automatically.

The loops share one integrity rule: quality rides along. Every routing change that touches result freshness or computation path gates through the evaluation suites the agent surface maintains, because the failure mode of cost-and-latency-only tuning is the silently staler, subtly different answer, and the routing program's credibility is the sameness the whole governed architecture promised.

## Teaching the Agents the Map

The routing tier's newest consumers can read, which opens a design surface the human era never had: the routing system's properties, published into the tool catalog's descriptions and metadata, become inputs to the agents' own planning, and the estates that exploit this convert routing from something done to agent traffic into something agents cooperate with.

The cooperative patterns, in ascending sophistication. Latency-aware planning: tool descriptions carry their latency classes, the metric request is interactive, the bulk export is batch with a completion callback, so a planning agent sequences its workflow around the slow steps instead of blocking on them, parallelizing the batch pulls behind the interactive narrative work. Freshness-aware selection: the as-of metadata on responses and the declared tolerances per tool let an agent answer "how current is this" honestly and choose the live-computation tool only when the question genuinely needs it, which offloads the staleness routing to the consumer with the context to decide. Deadline propagation: workflows that carry their deadlines let the admission tier prioritize coherently, and agents that receive queue-position feedback on degraded requests plan around the wait rather than retrying into it, the retry storm defused by information. And budget-aware moderation: an agent that can read its own envelope's remaining headroom, a gateway resource like any other, chooses its economy behaviors before the exhaustion policy chooses for it.

The pattern's boundary keeps it safe: agents receive routing information and routing suggestions, never routing authority, the lanes, floors, and envelopes staying policy the agents cannot vote on, because a cooperative consumer is a design win and a consumer that negotiates its own priority is the class-inflation failure mode with an API. Information down, requests up, policy sovereign: the same shape as every layer boundary in the estate, applied to the map itself.

## Getting Started: The Routing Program's First Quarter

The discipline installs in the order the worked example runs, and the sequence generalizes.

Weeks one through four are declaration and visibility, no behavior changes: workload classes attached to the tool definitions, request types, and pipeline manifests the estate already maintains, the reason-annotated telemetry wired through the layers' existing traces, and the routing dashboard assembled from what the observability plane already carries. The deliverable is the measured traffic model, shapes, concentrations, surges, per-class latency attainment, and its first honest read reliably produces the program's priority list unaided, because the melting estate's causes are visible the day the instruments exist.

Weeks five through eight install the protective tier: lanes with floors for the classes that need guarantees, the maintenance window, the obvious surge staggering, the federation source contracts, and the economic envelopes' enforcement points, each shipped as policy diffs with before-and-after attainment on the dashboard, because the program's credibility compounds from visible, reversible wins. The acceleration review runs in parallel, seeding the materialization portfolio from the measured shapes, which is routinely the quarter's largest single improvement and arrives without touching a queue.

Weeks nine through twelve close the first loops: the canary plan suite for federation, the evaluation-suite gating on routing changes, the medium cycle's first scheduled pass, and the quarter-end review that runs on real per-class economics, producing the first graduation candidates and the policy file's first considered rewrite. The anti-pattern to refuse at kickoff is tuning before declaring: adjusting queues and engines against undeclared classes optimizes folklore, and every hour spent on classification pays back in every loop that follows.

## A Worked Example: The Estate That Stopped Melting

The composite, in this series' pattern, with no invented benchmark numbers.

The estate enters the story succeeding too fast: the governed agent program from the earlier articles worked, adoption tripled the query population in two quarters, and the symptoms arrived in the classic order, dashboard latency complaints every morning at nine, a nightly window where everything contended with everything, an operational PostgreSQL owner discovering analytics in their pager, and an interactive assistant whose ten-step workflows stalled unpredictably on one slow step. Nothing was down. Everything was slower, in the way that files no single ticket.

The first month builds the visibility the diagnosis needs: workload classes declared across the tool definitions and pipeline manifests, reason-annotated admission telemetry on, the routing dashboard assembled, and the traffic model measured honestly. The findings read like the section on machine scale wrote them: two-thirds of interactive-class traffic answerable by materializations that did not exist, the nightly reporting agents synchronized at midnight by nobody's decision, the assistant's stalls tracing to metric requests admitted into the general queue behind batch scans, and the PostgreSQL pain mapping to one agent's federated sweep that pushed down nothing after a connector upgrade, the canary suite that did not exist yet failing retroactively.

The second month installs the policy: classes to lanes with floors, the interactive lane reserved and the assistant's stalls ending the same week, the maintenance lane scheduled and capped, the nightly agents staggered by the surge schedule, the federation source given its concurrency contract and the pushdown regression fixed and canaried, and the acceleration review seeding the materialization portfolio from the measured shapes, after which the morning-nine complaints stop arriving because the dashboard traffic that caused them mostly stopped reaching the engine.

The third month closes the loops: the medium cycle's first pass graduates the hottest federated table to a CDC mirror, retiring the PostgreSQL contract's tightest cap, the quarterly review runs on real per-class economics and moves one batch workload to a cheaper engine with a policy diff, and the estate's capacity plan rebuilds on the new arithmetic, engine demand sized to acceleration misses rather than to raw traffic. The fourth month adds the cooperative tier, and its results earn the epilogue: latency classes published into the tool descriptions let the assistant's planner parallelize its batch pulls behind its narrative work, cutting its end-to-end workflow times without a single infrastructure change, and the deadline propagation defuses the one remaining retry storm, the impatient orchestrator that had been re-requesting into its own queue wait. The routing dashboard's most-watched panel by then is the one nobody predicted at kickoff: the explanation view, workflow traces with their routing stories, which the agent teams adopted as their first debugging stop and which turned the platform team's oldest complaint, being the default suspect for every slow anything, into a link they paste.

The retrospective's transferable line is the discipline's thesis: the estate did not need more compute, it needed the traffic to land where the architecture always intended, and the routing tier is just the architecture, finally enforced per request.

## Failure Modes

Routing's failures share a family trait: each is a promise the estate stopped keeping quietly, which is why every defense below leans on the visibility the discipline installed first.

**The invisible router.** Routing decisions happen, unlogged, across three layers, and every latency mystery becomes an archaeology project across them. The defense is the visibility rule enforced from day one: every degradation, queue wait, substitution, and placement carries its reason into the workflow's trace, and the routing dashboard is built before the routing policy is tuned.

**Class inflation.** Everything declares itself interactive, the reserved lane grows until reservation means nothing, and the isolation collapses by consensus. The defenses: class assignment lives in reviewed artifacts with owners, the lane floors are budgeted capacity somebody pays for, and the fast loop's attainment metrics expose the classes whose declared latency needs their actual usage never justified.

**Stale-fast at scale.** Acceleration hit rates climb, staleness tolerances were never declared, and the estate serves yesterday with sub-second latency until an incident asks how old the answer was. The defense is the freshness-honesty discipline as routing law: no substitution without a declared tolerance, as-of stamps in every response's metadata, and the misses alerting.

**The unthrottled side path.** The bulk direct-read lane, engine-free and fast, grows ungoverned because it bypassed the engines' admission machinery, and object-store throttling or egress bills announce it. The defense: the direct path gets its own admission tier, per-principal, at the gateway, because engine-free never meant control-free.

**Choreography rot.** The surge schedule, tuned once, drifts from the agent population it choreographed, and the midnight collision quietly reassembles. The defense is the medium loop's calendar review plus the launch template: every new scheduled agent declares its window in the policy file, where the collision is a merge conflict instead of an incident.

**Routing without quality gates.** A tuning change reroutes a class to a cheaper path, the evaluation suites never ran, and the savings ship with a subtle answer change attached. The defense is the integrity rule made mechanical: routing policy changes trigger the affected classes' evaluation suites in CI, cost and quality on one dashboard, the pairing this series refuses to separate.

## Conclusion

Query routing was folklore for as long as the query population read wikis, and the agent era replaced the population: traffic that scales with model behavior, clusters into governed shapes, surges in synchronized waves, chains into latency-multiplying workflows, and arrives under principals with declared envelopes. The discipline that serves it composes four dimensions under one policy: engines selected per declared class, acceleration substituting before computation with staleness as law, admission control holding lane guarantees and economic envelopes, and placement computing the geography of work from pushdown to region. The brain is distributed, gateway, compiler, and engine each deciding at their grain, and the policy is singular, in the repository, diffed and owned like every authority in the governed estate.

The deeper conclusion joins the series' refrain: routing at machine scale is not a new system bolted onto the architecture, it is the architecture's layers doing their jobs per request, with the declarations the governance discipline already writes and the telemetry the observability plane already carries. The estates that melt under their agents are the ones where routing stayed folklore. The ones that scale are the ones that wrote it down, enforced it everywhere, and let the traffic itself teach the policy where to improve next. Machine scale was never the threat the melting estates experienced it as. It was the first consumer population regular enough to route well, and the discipline in this article is simply the estate finally saying yes to that regularity, per request, in writing.

## Keep Going

If this piece was useful, the estate it routes is the one my other writing builds: the engine portfolio and catalog seams in my decoupled lakehouse writing, the semantic and acceleration tiers in the federation article, and the platform foundations in *Architecting an Apache Iceberg Lakehouse* from Manning. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
