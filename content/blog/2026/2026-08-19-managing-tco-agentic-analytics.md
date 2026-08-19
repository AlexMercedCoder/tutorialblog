---
title: "Managing the TCO of Agentic Analytics: Token Budgets, Query Throttles, and the Economics of Autonomy"
date: "2026-08-19"
description: "Managing the total cost of agentic analytics: token budgets, query throttles, unit economics, and the FinOps discipline that keeps AI spend under control."
author: "Alex Merced"
category: "AI & Agents"
canonical: https://iceberglakehouse.com/posts/managing-tco-agentic-analytics/
tags:
  - TCO
  - FinOps
  - token budgets
  - agentic analytics
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/managing-tco-agentic-analytics/).

The AI budget conversation changed its tone this year, and the numbers explain why. Industry surveys of enterprise AI spending in 2026 keep finding the same pattern: roughly three quarters of organizations blew through their original AI cost plans, agentic projects specifically overran by multiples rather than percentages, and the war stories went mainstream, including the widely-repeated one about a major tech company exhausting its annual AI budget in four months. The cruel twist is that unit prices moved the other way: the average price per token fell by well over half across the same period. Intelligence got cheaper, bills got bigger, and the gap between those two facts is where agentic analytics economics lives.

The mechanism is not mysterious once named. Agentic workflows consume tokens at a completely different rate than the chatbots the budgets were modeled on, commonly five to thirty times more per task, because agents plan, retry, call tools, retrieve context, and re-send their accumulated history every step. A consumption pattern that scales with model behavior rather than with headcount, priced per unit, deployed with autonomy: that is a cost category with the volatility of cloud spend at its worst, arriving at organizations whose budgeting still assumes seats and servers. The discipline that tames it is real and buildable, and it borrows the FinOps playbook while adding the controls that autonomy specifically demands: token budgets, query throttles, unit economics, and the architecture decisions that determine cost before any optimizer touches it.

This article is the operating manual: where agentic analytics spend actually goes, the metering architecture that makes it attributable, budgets and throttles as first-class platform controls, the optimization playbook in descending order of impact, the unit economics that separate value from waste, and the governance loop that keeps the whole thing honest. It leans on the platform this series builds, the gateway that meters, the semantic layer that compiles, the contracts that bound scope, because agentic cost management is mostly not a procurement problem: it is an architecture property, and the estates that built the governed stack discover they built most of the cost stack too. A disclosure as always: I work at Dremio, whose agentic analytics platform lives in this economy, and the practices here are vendor-neutral throughout.

## Where the Money Actually Goes

Cost management starts with an honest bill of materials, and agentic analytics spend decomposes into five lines that behave differently and get confused constantly.

Model inference is the headline line: input and output tokens, priced per million, across whichever providers and models the estate calls. Its internal structure is the part naive budgets miss. Output tokens price several times input tokens on most models, and agentic workloads skew output-heavy, plans, reasoning traces, generated narratives, so the common budgeting assumption of symmetric input and output, which surveys find at a large majority of engineering budget holders, structurally understates the bill. And input volume hides its own multiplier: every step of a multi-turn agent re-sends the conversation so far, so context accumulates and per-session token cost grows far faster than linearly with turns, the agentic tax that turns a twenty-step workflow into a token bonfire unless something intervenes.

Tool execution is the second line, and for analytics agents it is the sleeper: every tool call the agent makes lands somewhere with a meter, a semantic layer query, a warehouse scan, a federated pull with egress attached, a search API with per-call pricing. An agent that plans badly does not just burn tokens narrating, it triggers compute downstream, and the estates that meter only the model line discover the tool line when the query engine's bill arrives wearing the agent's fingerprints.

Retrieval and context infrastructure is the third: the embedding generation, vector search, and context assembly that feed the agent's working memory, small per request and multiplied by everything, with its own storage and refresh costs standing behind it.

The platform tier is the fourth: the gateways, evaluation suites, observability, and orchestration that this series builds, mostly boring compute with one exception worth flagging, evaluation and testing token spend, which mature estates find becomes a visible fraction of the model line as selection suites and regression tests run on every change, a good cost with a real number.

And the fifth line is the one finance sees last: retries and failure. Timeouts that re-trigger chains, poison loops, abandoned multi-step tasks whose partial work billed anyway, the waste share of spend, invisible without workflow-level tracking and routinely material when first measured. The five lines together frame the discipline's real scope: token budgeting is the headline control, and the system it governs spans the model bill, the data platform bill, and the failure modes that multiply both.

## Why Token Costs Break Cloud Budgeting Instincts

The overrun statistics have a structural explanation worth internalizing, because teams keep applying cloud cost instincts to a category that violates their assumptions in four ways.

Consumption decouples from deployment. Cloud spend moves when engineers deploy infrastructure, which makes change control a cost control: nothing gets expensive without a change ticket. Agent spend moves when behavior changes, a model swap upstream, a framework update that plans differently, a prompt edit that lengthened outputs, user questions drifting toward harder shapes, none of which files a ticket, all of which reprice the estate overnight. The famous budget-in-four-months stories share this signature: no single decision spent the money, the behavior integral did.

Elasticity runs the wrong direction for comfort. Cloud's variable cost came with capacity as the brake: exhaust the cluster and work queues. Token capacity is effectively unbounded at the meter, so demand spikes convert directly into spend rather than into backlog, which is precisely why the throttle tier exists: the estate has to build the brake the infrastructure no longer provides.

The unit price is a moving illusion. Per-token prices fell dramatically across the period the bills exploded, and the falling price actively fuels consumption, cheaper steps justify longer chains, more retries, broader retrieval, the efficiency paradox the industry has met before in every resource whose unit cost collapsed. Budgeting on price trends without consumption discipline is how the plan misses by multiples.

And the invoice hides the structure. Provider bills aggregate by model and month, while the questions that matter, which workflow, which step class, which retry storm, live at a grain the invoice never sees, which is why the surveys keep finding organizations that track every dollar and cannot say which agent earns its keep. The metering architecture exists because the invoice is a reconciliation document, not a management one.

The instincts that transfer from cloud FinOps transfer well, allocation, anomaly detection, unit economics, accountability, and they transfer onto this category only after the four differences are engineered for, which is the work the rest of this article describes.

## Metering: The Attribution Architecture

Nothing in cost management works without attribution, and the attribution architecture for agentic analytics has a specific shape because the spend has a specific shape: costs accrue per request, compose per workflow, and matter per task.

The atomic record is the instrumented request: every model call logs its input and output tokens, model, latency, and computed cost, and every tool call logs its downstream resource consumption, each tagged with the principal, the agent, the workflow identifier, and the step within it. The gateway architecture from this series is the natural metering point for exactly the reason it was the natural governance point: agent traffic converges there, principals are already resolved there, and the telemetry the security section wanted is the telemetry the cost section needs, one instrumentation serving both. Provider-side dashboards and invoices reconcile the totals, and the request-level layer is where the questions get answered, because invoices say what was spent and requests say by whom on what.

Standards help the plumbing age well: the telemetry rides the same OpenTelemetry conventions the rest of the stack traces with, which is what lets the cost spans join the latency spans in one trace, and the billing normalization work happening across the FinOps ecosystem, common schemas for usage data across providers, is worth adopting where the tooling supports it, for the same reason every seam in this series prefers a standard: the meters outlive the vendors on both ends of them.

The composition layer assembles requests into workflows: a task's cost is its chain's cost, branches, retries, tool calls, and retrieval included, which is the view that makes the failure line visible, the abandoned chain that billed eleven steps, the retry storm inside one task's identifier. Workflow-level tracking is the capability the survey data keeps finding missing, and it is the difference between knowing the model bill rose and knowing which agent's planning regression raised it.

And the allocation layer maps workflows to the organization: team, application, feature, and, where the estate charges back, cost center, carried on the principal and workflow tags, rolled into the same allocation machinery cloud FinOps already runs. The design rule that makes allocation survive contact with reality: tags are assigned at principal creation, in the governance repository, not asserted per request by the agents themselves, because self-reported attribution from autonomous systems is exactly as reliable as it sounds.

The output of the three layers is the cost surface everything else stands on: spend by principal, by workflow, by model, by tool, by team, in near real time, reconciled to invoices monthly, with the unit-economics layer ahead reading from it and the budget enforcement below acting on it.

## Budgets and Throttles: Controls With Teeth

Visibility without enforcement is a slideshow, and the autonomy that defines agentic workloads is precisely why enforcement must be mechanical: a runaway loop does not read dashboards, and neither does a Friday-evening deploy that changed planning behavior. Two control families do the work, and they live at the gateway because that is where every request already passes.

Budgets are spend ceilings with escalation ladders. Each principal, and each workflow class where the granularity earns itself, carries a budget in the governance repository beside its grants: a monthly ceiling, an alerting threshold, and a hard behavior at exhaustion. The pattern the field converged on is the eighty percent rule: the alert fires at a threshold well before the ceiling, routed to the owning team with the workflow-level breakdown attached, so intervention happens before the overage rather than after the invoice, and the ceiling itself enforces, degrading the principal to a designated cheap mode or suspending it per its declared policy. The declaration matters: a customer-facing copilot's exhaustion policy is degrade-and-page, a batch analysis agent's is suspend-and-queue, and writing the choice down beside the budget is what turns exhaustion from an outage into a designed state. Budgets are also the anomaly substrate: spend rate per principal against its own baseline, alerting on the spike shape that means a loop or a regression, which catches the runaway the day it starts, the failure the famous overrun stories all share.

Budget granularity has a maturity curve worth naming so estates neither over-engineer the start nor stall there: per-principal budgets are the launch tier and catch the catastrophic failures, per-workflow-class budgets arrive once the composition layer distinguishes the assistant's cheap exchanges from its expensive deep-dives, and the mature estates add per-task ceilings on the workflows whose worst case justifies it, a single research task allowed a bounded spend before it pauses for human continuation, which is the budget concept meeting the multi-round-trip machinery from the gateway architecture. Each tier is a field in the same declared file, and the progression is demand-driven like everything else in the discipline: the audit's findings, not the framework's completeness, decide which tiers a workflow earns.

Throttles are rate ceilings, and for analytics agents they come in two currencies. Request throttles, calls per minute per principal with concurrency caps, bound the loop blast radius and are table stakes. Query throttles are the analytics-specific tier: ceilings on what a principal's tool calls demand of the data platform, concurrent query slots, per-query cost classes, scan-size limits on the expensive paths, enforced through the workload management the query engines already have, keyed to the same principals the gateway resolved. The composition matters more than either alone: a request throttle without query ceilings lets one expensive call per minute soak the warehouse, and query ceilings without request throttles let a thousand cheap calls do the same, while together they price-bound a principal's worst minute, which is the number capacity planning actually needs.

The controls' design principle, worth stating because it separates this discipline from naive cost-cutting: budgets and throttles bound the failure modes, not the work. Their thresholds are set from measured workflow costs with headroom, reviewed as the workflows evolve, and the estates that set them punitively discover the shadow-agent problem, teams routing around the governed path exactly as they route around slow governance everywhere, which costs more than the tokens ever did. The paved road stays generous. It just refuses to let anyone drive off a cliff at machine speed.

## The Optimization Playbook, In Order of Impact

With metering and controls in place, optimization is a ranked list, and the ranking matters because teams reliably start at the bottom. In descending order of typical impact:

Architecture first: selection over generation. The largest single cost decision in agentic analytics is the one my text-to-SQL article argues on correctness grounds, and the economics agree: agents that select governed metrics through compact catalog requests spend a fraction of the tokens of agents that carry schemas in their prompts and author queries, because the context that generation re-sends every step is precisely what the catalog architecture moved to fetch-on-demand discovery. The governed stack's cost advantage compounds with its correctness advantage, and estates that adopted it for trust reasons routinely discover the token line noticing. The same architectural lens covers context discipline generally: system prompts audited for freight they no longer need, retrieval that returns the relevant slice rather than the reassuring bulk, and the resources pattern moving reference material out of every prompt.

Model routing second: fit the model to the step. Multi-step workflows are heterogeneous, planning and synthesis steps earn the capable model, extraction, classification, and formatting steps run identically on models priced an order of magnitude lower, and routing by step class, with the gateway or orchestrator holding the routing table, is the intervention the optimization vendors keep measuring in double-digit percentages. The guardrail is the quality suite: routing changes ship like any change, against the evaluation suites, because the failure mode is silent quality decay wearing a savings costume, and the discipline is measuring both lines on the same dashboard.

Caching third: stop paying for the same answer. Three caches stack. Provider-side prompt caching discounts the re-sent prefix, the system prompt and stable context, which the context-accumulation tax makes disproportionately valuable, and which prompt structure has to earn by keeping the stable prefix stable. Semantic caching at the gateway serves repeated and near-repeated questions from cached governed results, with hit rates in the double digits reported by estates whose traffic has the repetitive shape analytics traffic has, and with the semantic layer's own acceleration tier, the materializations my federation article covers, serving as the data-side cache that makes the tool line cheap. And workflow memoization catches the intra-chain repeats, the agent re-fetching what step two already fetched, which workflow-level tracing exposes and a step cache retires.

Semantic caching carries one governance clause worth writing down before the hit rate seduces anyone: cached answers inherit the access policies of their computation, so the cache keys include the principal's policy context, and a result compiled under one user's row-level scope never serves another's near-duplicate question. The compile-time enforcement architecture makes this tractable, the policy context is explicit at compilation, and bolt-on caches in front of generation-era agents historically fumbled exactly this, which adds one more entry to the ledger of costs the governed architecture quietly avoids: the incident review for the cache that leaked across scopes.

Failure reduction fourth: the waste line from the bill of materials. Tightened retry policies with backoff and budgets, loop detection at the gateway, timeout alignment so chains die once rather than three times at three layers, and the quality investments that reduce abandoned tasks, all measured through the workflow lens that made the waste visible. This is unglamorous double-digit territory in most first audits.

And procurement last, deliberately: committed-use discounts, provider negotiation, and batch-tier routing for the latency-tolerant workloads are real money and they are the layer to optimize after the architecture, because a discount on waste is still waste, and the committed volumes are only forecastable once the consumption above is disciplined.

## The Data Platform Side of the Bill

Analytics agents distinguish themselves from the general agent population by what their tool calls do, and the data platform's own cost machinery deserves its section, because half the TCO lives there and the controls are older than the agents.

The semantic layer's acceleration tier is the tool line's biggest lever: agent question traffic is repetitive in exactly the shape that transparent materializations serve, the same governed metrics at the same grains, so the reflections machinery my federation article details converts the marginal agent query from a scan into a lookup, and the acceleration portfolio's refresh costs amortize across every consumer, human and machine. Estates report the pattern's signature clearly: agent adoption raises query volume dramatically and raises engine spend modestly, provided the acceleration tier was tuned from the workload, which the agent traffic's regularity actually makes easier.

Workload isolation keeps the meters honest and the humans fast: agent principals map to their own engine workload queues with their own concurrency and resource classes, so the 2 a.m. reporting agent cannot starve the 9 a.m. dashboards, and the engine's per-queue accounting gives the allocation layer its tool-line numbers for free. This is the same principal-per-consumer discipline the security architecture demanded, collecting its third dividend.

Scan economics reward the same hygiene the lakehouse always rewarded, now at machine query rates: partition and clustering strategies that let agent-shaped queries prune, the table maintenance that keeps small files from taxing every retrieval, and the format-level improvements this series tracks compounding underneath. An agent asking a thousand governed questions a day against well-maintained Iceberg tables is a rounding error. The same agent against a small-file swamp is a budget line, and the difference is the platform work that predates the agents entirely.

And federation's egress mathematics get a new multiplier: agents that touch federated sources at machine frequency turn the pushdown-depth and materialize-the-hot-remote decisions from my multi-cloud writing into cost controls, with the same answer, aggregates travel, raw scans do not, and the hot remote earns a local materialization on a refresh schedule.

The section's summary for the budget owner: the model line gets the headlines, the data platform line responds to engineering the estate already knows how to do, and the TCO program's cheapest wins are often a compaction schedule and an acceleration review away.

The procurement layer's standing duty is the price watch: per-token rates swing widely between providers and move quarterly, capability tiers reshuffle with each model generation, and pricing models themselves keep shifting between flat and usage-based shapes, which makes the routing table a quarterly review item rather than a launch decision. The estates that treat model selection as portfolio management, capability requirements from the evaluation suites, prices from the watch, routing as the reviewable configuration the budget file showed, collect the falling-unit-price curve the surveys describe instead of watching it pass by, and the discipline's whole promise is exactly that collection: consumption managed well enough that cheaper intelligence finally means a cheaper bill.

## Unit Economics: Cost Per Task or Nothing

The spend controls keep the estate safe, and the question that decides the program's future is different: is the spending worth it? The unit that answers is cost per task, and building it is the discipline's second half.

The denominator is the workflow the business recognizes: the answered question, the produced report, the resolved ticket, the contained incident, counted from the same workflow identifiers the metering composes, with quality gates deciding what counts, a completed task being one the evaluation machinery or the human acceptance marked good, because cost per attempted task rewards exactly the wrong things. The numerator is the workflow's full cost from the composition layer, model, tools, retrieval, and its share of the platform tier.

What the ratio buys, in ascending order of consequence. Comparability: cost per task across agent versions is the regression test for economics, run in the same CI rhythm as the quality suites, catching the planning change that doubled step counts before it ships. Comparability again, across implementations: the routing experiment, the caching change, the architecture migration, each argued with the same number instead of with anecdotes. And the business case: cost per task against the alternative's cost, the analyst-hours the workflow replaces or augments, is the ROI arithmetic the survey data says most budget holders cannot produce, the value-blindness gap where a large majority admit unsureness about which AI investments pay. Estates that report cost per task by workflow, trending, beside a value estimate the workflow's owner signs, convert the annual AI budget fight into a portfolio review, funding the workflows whose economics work, fixing or retiring the ones whose do not, which is what managing TCO means once the panic subsides.

One honest complication belongs in the model: task boundaries blur in composed and conversational workloads, and the pragmatic answer is tiered units, per-exchange for assistants, per-artifact for producers, per-incident for the operational agents, defined once per workflow class in its contract and held stable so the trends mean something. Precision matters less than consistency, because the ratio's job is direction.

## The Budget Declaration, As Code

The controls' home completes the architecture: budgets, throttles, and exhaustion policies live in the governance repository beside the principal's grants, reviewed and versioned like everything else in the estate, because a spend ceiling is an authority boundary and authority boundaries are code here. The declaration's shape:

```yaml
principal: agent-analytics-assistant
owner: data-platform
cost:
  budget:
    monthly_usd: 4000
    alert_at_pct: 80
    on_exhaustion: degrade
    degrade_profile: economy_routing
  throttles:
    requests_per_minute: 120
    max_concurrent_workflows: 20
    query_class_ceiling: interactive_medium
    max_scan_gb_per_query: 50
  routing:
    default: capable_v3
    steps:
      extraction: economy_v2
      classification: economy_v2
      synthesis: capable_v3
  unit:
    task_type: answered_exchange
    target_cost_usd: 0.18
```

Read the file as the article compressed. The budget block is the ceiling with its escalation ladder and its declared exhaustion behavior, the degrade profile naming the economy routing that keeps the assistant answering cheaply rather than going dark. The throttle block prices the worst minute in both currencies, requests and query demand. The routing block is the model-fit optimization as reviewable configuration rather than scattered code. And the unit block declares the task definition and its target, which is what turns the cost-per-task dashboard from description into contract: the number the owner signed, the number reviews argue against, the number the anomaly detection baselines.

The file's location does the last job, the same one it does throughout this series: changing an agent's economic envelope is a pull request, diff-classified, owner-routed, historied, and revertable, so the estate's answer to who raised the assistant's budget and when is a commit, not a meeting. Cost governance and access governance turn out to be the same discipline wearing different fields, which is why they share a repository.

## The Operating Loop: FinOps Cadence for Agent Estates

The pieces assemble into a loop, and the loop is what the FinOps playbook contributes once the agent-specific controls exist: visibility, allocation, optimization, and accountability, run on a cadence.

Daily is the anomaly watch, largely automated: spend-rate alerts against baselines, budget threshold crossings, waste-share spikes, each routed to the owning team with the workflow breakdown attached, with the platform team watching the aggregate for the estate-wide shifts, a provider price change, a framework update that moved consumption, that no single team sees.

The chargeback decision deserves its honest paragraph, because the culture question decides more than the accounting one. Showback, costs published to owners without internal billing, is the right opening posture for most estates: it builds the accountability muscle without the perverse incentives premature chargeback breeds, teams gaming task definitions or starving valuable exploration to protect a number. Chargeback earns its place once the unit economics are trusted and the workflows are stable, typically the second year, and even then with the exploration budget carved out explicitly, because an agent estate that bills every experiment kills the pipeline that feeds its portfolio. The FinOps movement's arc ran the same way for cloud, and the shortcut past showback is the mistake the veterans warn about first.

Monthly is the allocation and reconciliation pass: metered spend reconciled to invoices, allocations published to teams, chargeback or showback per the organization's culture, and the waste report, the failure line by workflow, with its top items ticketed. The monthly artifact worth institutionalizing is the unit economics page per workflow: cost per task trending, quality trending beside it, budget utilization, and the owner's one-line commentary, which is the page the quarterly review reads.

One line item resists the meter and belongs in the review anyway: human attention. The approval queues, the evaluation grading, the override work that the autonomy tiers across this series depend on, all consume the hours the automation was funded to save, and the supervision-load metric from the quality-agent discipline generalizes to the whole estate: minutes of human time per workflow per week, trending down as trust tiers rise, reported beside the dollar lines. An estate whose token bill falls while its babysitting bill climbs has moved cost, not managed it, and only the paired reporting catches the move.

Quarterly is the portfolio review, the accountability station: workflows ranked by unit economics against their value estimates, budgets reset from measured need rather than incremented from history, the optimization backlog reprioritized by the measured impact ranking, and the retire-or-fix conversation for the tail, held with the numbers on the table. This is also where the forecasting discipline lives, and agentic forecasting has its own honest method: capacity-based, workflows times expected volume times cost per task with scenario bands, rather than trend extrapolation, because agent consumption moves in steps when behavior changes, and the step function is exactly what the quarterly's what-changed review explains.

The loop's cultural target is the one the cloud FinOps movement eventually reached: cost as an engineering signal rather than a finance ambush, visible in the same dashboards as latency and quality, owned by the teams that generate it, with finance as the loop's auditor rather than its police. The agent estates getting this right report the tell that it is working: engineers citing cost-per-task in design reviews unprompted, the same adoption signature the contract discipline shows when versions get cited in decks.

## Getting Started: The First Ninety Days

The program's sequence matters, because controls without attribution punish blindly and attribution without controls describes the fire. The ordering that works:

Weeks one through four build the surface on what exists: request instrumentation at the gateway, workflow identifiers into the orchestrations, principal tags reconciled against the governance repository, and the first composition views. No controls yet, deliberately, because the first honest picture is the program's political capital and its threshold data at once, and every first audit finds its versions of the same three things: a dominant workflow nobody suspected, a waste share nobody measured, and a tool-line pattern the platform team already suspected.

Weeks five through eight install the safety tier: budgets with the alert ladder on every principal, sized from the measured month with generous headroom, exhaustion policies declared, request throttles universally, query throttles on the principals whose tool patterns earned them, and the anomaly watch on spend rates. This tier's job is bounding catastrophe, not shaping behavior, and saying so out loud keeps the teams onside.

Weeks nine through twelve take the top of the optimization list and build the first unit: the worst context-burner from the audit gets the architecture treatment or the routing table, the retry and timeout hygiene ships, and one flagship workflow gets its task definition, quality gate, and cost-per-task page with an owner's signature. The quarter ends with the first portfolio mini-review on that page, which is the ritual the quarterly loop grows from.

The anti-pattern to refuse at kickoff is the tooling-first instinct: a quarter evaluating cost platforms while the estate runs unmetered buys a decision about dashboards for a surface that does not exist. The gateway instrumentation is days of work on the architecture this series builds, the controls are configuration on machinery already deployed, and the buy-versus-build question for the reporting layer answers itself more sensibly once real telemetry exists to pour into whatever wins.

## A Worked Example: The Quarter the Bill Got Managed

The composite, in this series' pattern, with no invented benchmark numbers beyond the survey figures already cited.

The company enters the story mid-overrun: an agent estate that grew from pilot to production in a year, the analytics assistant, a reporting agent, two operational copilots, and a monthly model bill that tripled in two quarters while nobody can say which agent did it, plus a query engine bill with a new plateau the platform team suspects but cannot prove is agent traffic. The CFO's question is the survey's question, what are we getting for this, and the honest answer is the program's starting condition: nobody knows, because nothing attributes.

The first month builds the surface: request instrumentation at the gateway the estate already runs, workflow identifiers threaded through the orchestrations, principal tags verified against the governance repository, and the composition layer assembling the first honest picture. The picture reads like the audits always read: one workflow, the reporting agent's nightly run, accounts for a plurality of the model line through a planning loop that re-summarizes its whole context every step, the waste share sits in double digits led by a retry misconfiguration between the assistant and its slowest tool, and the query engine plateau maps cleanly to two agents' unthrottled scan patterns, which the platform team circulates with the quiet satisfaction of the vindicated.

The second month installs the controls and takes the top of the playbook: budgets with the eighty percent ladder on every principal, the two-currency throttles keyed to the engine's workload management, the reporting agent's planning rebuilt against the semantic catalog, which cuts its context freight by the architecture's usual margin, and the retry misconfiguration fixed in an afternoon once named. The anomaly watch catches its first real event in week six, a framework upgrade that doubled the assistant's step counts, rolled back the same day on the cost regression alone, which becomes the internal story that sells the program better than the dashboards do.

The third month builds the economics: task definitions per workflow, quality gates wired from the existing evaluation suites, cost per task published with owner sign-off, and the first portfolio review held against them. Two workflows show economics that fund their expansion, one shows a fixable architecture problem with a named plan, and one operational copilot shows a cost per resolved incident that no value story survives, retiring with its budget redistributed, which is the review doing exactly its job. The CFO's question gets its answer in the review's summary page, and the program's steady state is the loop from the previous section, with the quarter's meta-lesson written into the runbook: the estate did not have a spending problem, it had an attribution problem, and every control that mattered was buildable in weeks once the platform underneath was the governed one.

The fourth month, past the program's formal end, delivers the compounding the architecture argument promised. The reporting agent's semantic-catalog rebuild, done for cost, retires the agent's oldest correctness complaint in the same commit, the self-disagreeing quarterly numbers, because the context it stopped re-sending was the same generation-era schema freight the selection architecture replaces. The budget files' presence in the governance repository turns the next agent launch into a complete review, access, meaning, and money in one PR, which the platform team institutionalizes as the launch template. And the anomaly baseline, two months trained, pages once more, correctly, on a provider-side pricing change the price watch had flagged, with the routing table's economy tier absorbing the shift in a reviewed change the same week. None of it is dramatic, which the retrospective names as the point: the estate's economics became operable, and operable is what the overrun stories were missing.

## Failure Modes

**Optimization theater.** The team ships caching and routing tweaks while the architecture burns context at generation-era rates, and the savings percentages decorate a bill that keeps climbing. The defense is the playbook's ordering enforced in the review: architecture questions answered first, with the selection-over-generation migration priced against every downstream optimization it obsoletes.

**Punitive throttling.** Budgets set to last year's chatbot assumptions strangle legitimate work, teams route around the gateway, and the estate trades visible spend for invisible spend plus ungoverned access. The defenses: thresholds from measured workflow costs with headroom, the degrade-not-dark exhaustion patterns, and the shadow-usage watch, provider spend outside the metered path, as a standing reconciliation check.

**Quality-blind savings.** Routing and truncation changes ship on cost numbers alone, quality decays silently, and the workflow's value erodes faster than its cost. The defense is structural: cost and quality on the same dashboard, every optimization change gated through the evaluation suites, and the unit economics defined with quality gates so degraded tasks stop counting as delivered.

**Attribution rot.** Tags drift, workflows fork without identifiers, and six months in the cost surface is confidently wrong. The defenses: tags at principal creation in the repository, workflow identifier propagation as a platform library rather than per-team convention, and the monthly invoice reconciliation as the drift detector it doubles as.

**The forecast that extrapolates.** Finance trends the token line like a cloud line, a behavior change steps the consumption, and the variance meeting relitigates the program. The defense is the capacity-based method with scenario bands, plus the change log, framework upgrades, routing changes, new workflows, published beside the forecast so steps arrive explained.

**Governing the meter, ignoring the value.** The program perfects cost control and never builds the denominator, spend becomes minimized rather than managed, and the estate optimizes toward cheap uselessness. The defense is the article's second half taken as seriously as its first: cost per task with owner-signed value context, and the portfolio review that funds, fixes, or retires on both numbers.

## Conclusion

Agentic analytics arrived with a cost structure the enterprise had not priced: consumption that scales with model behavior, multiplies through chains and retries, and lands across the model bill and the data platform bill at once, which is how estates with falling unit prices produced the overrun statistics 2026's surveys keep publishing. The discipline that manages it is neither austerity nor procurement: it is attribution at the request, composition at the workflow, budgets and throttles with declared exhaustion behavior at the gateway, optimization in impact order with architecture first, and unit economics that put cost per task beside quality and value where the funding decisions can see all three.

The deeper conclusion is the one this series keeps converging on from different directions: the governed agent stack and the affordable agent stack are the same stack. The gateway that scoped access is the meter. The semantic catalog that fixed correctness is the context diet. The contracts that bounded meaning bound spend. The governance repository that carried grants carries budgets. Estates that built the architecture for trust discover the economics arrived in the same shipment, and estates trying to bolt cost control onto ungoverned agents discover they are building the governed stack anyway, one incident at a time. Autonomy at scale was always going to need an economy. Build it on purpose.

## Keep Going

If this piece was useful, the platform it stands on runs through this series and my books: the gateway and governance machinery in my recent agentic analytics writing, and the lakehouse foundation in *Architecting an Apache Iceberg Lakehouse* from Manning. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
