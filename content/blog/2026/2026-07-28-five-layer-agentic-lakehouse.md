---
title: "The Five Layers Between Your Lakehouse and a Trustworthy Agent"
date: "2026-07-28"
description: "Agent reliability is a property of the stack the model sits on. Five layers with distinct owners and failure modes turn the agent is unreliable into a specific diagnosis."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - AI Agents
  - Apache Iceberg
  - Data Architecture
  - Semantic Layer
canonical: "https://iceberglakehouse.com/posts/five-layer-agentic-lakehouse/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/five-layer-agentic-lakehouse/).

# The Five Layers Between Your Lakehouse and a Trustworthy Agent

An organization ships an analytics agent. It has access to the warehouse, a good model, and a well-written system prompt. Three weeks in, it has produced two wrong numbers that reached a meeting, one query that scanned a table nobody expected it to touch, and an answer nobody can reconstruct because the logs rolled off.

The reaction is usually to blame the model and try a better one. That reliably fails, because none of the three problems was a reasoning failure. The wrong numbers came from a table with an undocumented filter rule. The unexpected scan came from a permission that was broader than anyone had reviewed. The unreconstructible answer came from having no record of what the agent did.

Those are three different missing layers. Treating them as one problem called "the agent" is why remediation flails.

The useful frame is architectural: five layers between raw storage and a trustworthy agent, each with a distinct responsibility and a distinct owner. This piece is about the layering itself, the interfaces between the layers, and how to tell which one is failing when something goes wrong.

I work at Dremio, which builds a lakehouse platform, so I have a commercial interest in several of these layers. The structure is not vendor-specific and every layer has open implementations.

## The five layers

Stated plainly, then examined.

**Data.** Datasets shaped for machine consumption, with business rules applied. Not raw tables.

**Knowledge.** What those datasets mean. Semantic definitions, metric definitions, grain statements, and the documentation an agent reads to choose correctly.

**Agent.** The reasoning loop. Model, prompt, planning, and the bounds on execution.

**Tool.** The interface between reasoning and action. What the agent can call, with what parameters, returning what.

**Policy and telemetry.** What is permitted and what actually happened. Grants, approval gates, and the record.

The layering is not novel and its value is not novelty. It is that each layer has a different failure mode, a different fix, and usually a different owner, so naming them turns "the agent is unreliable" into a specific question with a specific answer.

Two properties make it work as an architecture rather than as a diagram.

**Each layer depends only on the one below.** The tool layer talks to data and knowledge. The agent layer talks to tools. Policy wraps all of it. When a layer reaches past its neighbor, meaning an agent constructing raw SQL against physical tables, the layering has been bypassed and its guarantees are gone.

**Each layer is independently testable.** You can evaluate the data layer without an agent, the knowledge layer with a fixed question set, and the tool layer with unit tests. That is what makes the architecture debuggable, and it is the property most implementations lack because they only ever test end to end.

A summary you can put on a wall.

| Layer | Provides | Owner | Failure signature |
|---|---|---|---|
| Data | Datasets with business rules applied | Data engineering | Valid SQL, wrong number |
| Knowledge | What datasets and columns mean | Analysts | Wrong dataset or column chosen |
| Agent | Reasoning, planning, execution bounds | Agent team | Loops, gives up, ignores context |
| Tool | Callable interface with a constraining schema | Platform | Impossible calls constructed |
| Policy and telemetry | What is permitted, what happened | Platform and security | Unexpected access, unreconstructible sessions |

The failure signature column is what makes this operationally useful. When something goes wrong, match the symptom to the row rather than reaching for the model.

## Layer one: data

The bottom layer is datasets with the business rules already applied.

An agent given a raw fact table hits the problem that everyone in the organization knows to filter cancelled orders and nobody wrote it down. The agent writes valid SQL and returns a number that is wrong by whatever share cancelled orders represent.

What this layer owes upward: a dataset where selecting everything and aggregating produces a correct answer. Filters applied. Test accounts removed. Currency normalized. One stated grain.

What it does not owe: coverage of every conceivable question. A data layer covering the top of the question distribution, with honest gaps, is better than one stretched thin across everything.

The design decisions that matter most here:

**Denormalize more than instinct suggests.** Joins are where agents produce wrong numbers, particularly fan-out on mismatched cardinality. A dataset with dimensions pre-joined at a stated grain removes the failure entirely. Storage is cheap and columnar compression is good.

**Build at the finest grain that carries the rules.** Aggregation composes upward and does not decompose downward. A dataset at daily grain serves weekly, monthly, and quarterly questions. One at monthly grain serves nothing finer.

**Make gaps visible rather than fillable.** If the layer does not cover wholesale channel, the correct outcome is an agent that says so. That requires the agent to have no path to the underlying tables, which is a policy-layer decision that this layer depends on.

**Ownership:** data engineering, with business input on the rules. The split matters: engineers know what the pipeline does, and only the business knows why a rule exists, which is what stops a filter from being dropped as unnecessary during a refactor.

**How you know it is failing:** answers that are structurally correct and numerically wrong. The SQL is valid, the table exists, the number does not reconcile with the source of truth. This is the hardest failure to notice, because nothing errors and the answer looks like every other answer.

## Layer two: knowledge

Data without meaning is data an agent guesses about.

This layer holds what the datasets mean, in language a model reads: what one row represents, what each column means in business terms including units, what the dataset excludes, what it is not suitable for, how fresh it is, and who owns it.

The distinction from layer one is worth being firm about, because teams collapse them. A well-shaped dataset with no attached semantics is still one an agent has to guess about. `amt_usd_net_adj` is a correct column in a correct dataset and it tells a model nothing.

Two things belong here that are frequently missing.

**Metric definitions, separate from datasets.** Net revenue is a definition owned by finance, applying across several datasets, changing on finance's schedule. When it lives only inside dataset SQL it gets duplicated, drifts, and has no owner. Defined once with its own description and dimension list, it is discoverable and maintainable.

**Anti-guidance.** The most valuable descriptions name the mistake. "Use net_revenue_usd rather than gross_revenue_usd unless the question specifically says gross" changes behavior in a way that a neutral definition does not. This is prompt engineering applied to metadata, and metadata is a better place for it than a system prompt, because it reaches every consumer through every tool.

**Ownership:** analysts who have watched people get it wrong, with data engineering supplying the mechanical facts and business owners approving metric definitions. The prompt that works in a room is "what has someone gotten wrong with this table," and the answers become descriptions nearly verbatim.

**How you know it is failing:** the agent picks the wrong dataset or the wrong column. It found something plausible and had no basis for choosing correctly among alternatives.

## Layer three: agent

The reasoning loop: model, prompt, planning strategy, and execution bounds.

Less belongs here than people put here. The common anti-pattern is loading this layer with responsibilities the layers below should carry. Business rules in the system prompt. Column meanings in the prompt. Safety constraints in the prompt.

Each of those is misplaced for the same reason: a prompt is advisory and applies to one agent. A rule in the data layer applies to every consumer and cannot be argued with.

What genuinely belongs here:

**Planning strategy.** How the agent decomposes a question, when it asks a clarifying question, when it declines.

**Execution bounds.** Maximum tool calls, wall clock, token spend, repeat detection, consecutive failure limit. Enforced by the orchestrator outside the model's reasoning, because a model asked to evaluate whether it is stuck has already concluded it is not.

**Output shape.** How answers are presented, what caveats accompany them, whether provenance is attached.

**Uncertainty expression.** A path for the agent to flag low confidence and route to a human. Cheap to build and it catches a real category.

**Ownership:** the team building the agent, and this is the only layer where that team should be making decisions alone.

**How you know it is failing:** the agent has the right data, the right descriptions, and the right tools, and still reasons badly. Loops, gives up early, or ignores available information. If the layers below are weak, do not diagnose here, because a badly reasoning agent on a bad data layer is indistinguishable from a good one.

## Layer four: tool

The interface between reasoning and action, and the layer that pays back most relative to how much attention it gets.

A tool has a name, a description the model reads, a parameter schema, and an implementation. Every one of those is a design decision.

**The parameter schema is a constraint mechanism, not a formality.** A tool taking arbitrary SQL constrains nothing. A tool taking a metric name, a dimension list, and a date range makes a DROP unexpressible and an unbounded scan impossible. The schema is where you make bad actions impossible rather than discouraged.

**Required parameters prevent whole failure classes.** Requiring a date range means an unbounded query cannot be constructed. That single choice eliminates the most expensive query shape agents produce.

**The description tells the model when to call, not just what it does.** "Returns table schema" describes the mechanism. "Call this before writing any SQL, because column names here do not follow a predictable convention" changes behavior.

**Return shape controls context consumption.** A tool returning everything fills the context window and the agent forgets the question by the fourth call. Return what is needed and put depth behind a separate call.

**Tools are the enforcement point for gaps.** A tool that returns a clear refusal for an out-of-scope request produces an agent that declines. One that returns partial results produces one that answers anyway.

**Ownership:** platform engineering, working closely with whoever owns the knowledge layer, since tool descriptions are semantic artifacts that happen to live in code. Treating them as an engineering concern alone is how they end up accurate and useless.

**How you know it is failing:** the agent calls the wrong tool, calls tools in a loop, or constructs calls that should not be constructible. Also visible as context exhaustion, where early answers are good and later ones drift.

## Layer five: policy and telemetry

Two things bundled because they answer paired questions: what is permitted, and what happened.

**Policy** is the enforcement layer, and it lives in grants rather than in instructions. The agent's principal has permissions. Actions outside them fail regardless of what the model decides or how persuasively a user asks. For actions that are irreversible or leave your systems, an approval gate with a human who owns the consequence.

The test for this layer: for every action your agent can take, name the mechanism that prevents it being wrong. If the answer is a sentence in a prompt, that item is not done.

**Telemetry** is the record: session identity, model and configuration version, the request, retrieved context, every tool call with arguments and results, tables and columns touched, human approvals, and the outcome. Structured, queryable, retained for as long as anyone will plausibly ask.

Application logs do not serve this. They are mutable, scattered, short-retention, and require production access to read. An analytical table serves it: one place, queryable by a reviewer with a grant rather than a shell, cheap to retain for years.

The failure everyone regrets is discovering this layer is missing during an incident. Reconstructing what an agent did six weeks ago is impossible if nobody recorded it, and no amount of subsequent diligence recovers it.

**Ownership:** platform and security for the mechanism, with the review practice owned by whoever owns the domain the agent operates in.

**How you know it is failing:** you cannot answer "why did it do that" or "who had access to that." Both questions arrive eventually.

## Evaluating each layer independently

The property that makes this architecture debuggable is per-layer evaluation, and almost nobody builds it. End-to-end tests tell you something broke and not where.

**Data layer.** Reconciliation against an authoritative source. For each dataset with a counterpart, meaning a finance close, a regulatory report, or an operational system of record, compare aggregate totals on a schedule with a tolerance and an alert. This runs without an agent and it catches the definitional drift that silently survives every other check.

**Knowledge layer.** A dataset-selection test. Give the selection mechanism a set of questions with known-correct dataset answers and measure how often it picks right. No reasoning, no execution, just retrieval and selection.

```
Question: "revenue by region last quarter"
Correct: gold.sales.order_lines
Distractors: gold.sales.orders_legacy, gold.finance.gl_revenue

Question: "how many orders did we take in June"
Correct: gold.sales.orders
Distractor: gold.sales.order_lines  (line grain, wrong for counting orders)
```

The distractors are the test. A knowledge layer whose descriptions do not distinguish an order-grain dataset from a line-grain one fails here, and it fails silently in production as a number wrong by a multiple.

**Tool layer.** Ordinary unit tests. Valid calls succeed, malformed calls are rejected with a clear message, out-of-bounds parameters are refused, hard caps hold. Also a test that the tool's return actually carries the semantics from the knowledge layer, which is the interface most likely to be broken.

**Agent layer.** The end-to-end evaluation set, run only after the layers below pass. Questions with known answers, including questions the agent should decline. Measuring appropriate refusal matters as much as measuring correctness, because an agent that answers everything is worse than one that answers eighty percent and declines the rest.

**Policy layer.** Negative tests. Assert that the agent's principal cannot perform the operations it should not. A test asserting that a write attempt returns an authorization failure is the one that catches a grant drifting open, and grants drift.

Run the lower layers on every change and the agent layer on a schedule. When the end-to-end number drops, the lower-layer results tell you where to look, which converts a day of investigation into a glance.

The setup cost is a few days per layer. The return is that every subsequent failure has an address.

## Diagnosing which layer broke

The practical value of the layering is that it turns a vague complaint into a decision tree. Work down, not up.

**The number is wrong.** Check whether the dataset produces that number when queried directly. If yes, layer one: the business rules in the dataset are wrong or incomplete. If no, continue.

**The agent used the wrong dataset or column.** Layer two. Read what the descriptions actually say about the alternatives. In my experience the description was accurate and neutral, and neutral is what causes this.

**The agent had no basis for choosing correctly.** Still layer two, and the fix is anti-guidance rather than more accuracy.

**The agent constructed something it should not be able to construct.** Layer four. The parameter schema allowed it. No prompt change fixes a schema that permits the wrong thing.

**The agent had everything it needed and reasoned poorly.** Layer three, and only after ruling out the others. This diagnosis is reached far more often than it is correct.

**The agent touched something it should not have access to.** Layer five. The grants were broader than the intent.

**You cannot tell what happened.** Layer five, telemetry side, and this one blocks diagnosing anything else.

The most common misdiagnosis by a wide margin is attributing a layer one or two failure to layer three. It happens because the agent is the visible component and the model is the changeable knob. Changing models to fix a missing business rule produces a differently wrong answer.

A useful discipline: before changing anything in the agent layer, verify that a competent human analyst with access to only what the agent had gets it right. If they do not, the problem is below.

## The interfaces between layers

The contracts are where the design either holds or leaks.

**Data to knowledge.** Semantics attach to datasets and travel with them. A description in a wiki is documentation; one in the catalog or semantic layer is a contract, because it reaches every consumer automatically.

**Knowledge to tool.** The tool layer surfaces semantics in its returns. This is the most commonly broken interface: an organization writes excellent descriptions and the MCP server returns bare column names. Check what your tools actually return, which takes five minutes and is rarely done.

**Tool to agent.** Tools return structured results with clear success and failure. Ambiguous returns are what agents handle worst, and a tool that half-succeeds produces confident wrong reasoning downstream.

**Policy across everything.** Enforcement is not a layer the others pass through by convention. It sits in the catalog's grants, evaluated on every access regardless of which path reached it.

**Telemetry from everywhere.** Every layer emits. A record with tool calls but no data access, or the reverse, cannot reconstruct a session.

The pattern in the failures: they happen where one layer assumes another did something. The semantics exist and do not reach the tool. The grants exist and the agent has a second path. The telemetry exists and does not correlate. Testing each interface explicitly, not just each layer, is what catches these.

## Building the layers in order

The order matters and it is not the order of enthusiasm.

**Data first.** Nothing above it works without it. This is weeks of work per subject area and it is the actual cost of doing this well. It also delivers value independently, since well-shaped datasets improve human analysis immediately, which makes it the easiest part to fund.

**Knowledge second, alongside data.** Write the semantics as you build each dataset, with the people who know the traps. Retrofitting descriptions onto datasets built months earlier means reconstructing knowledge that was fresh at the time.

**Policy third, before any agent exists.** Create the principal, set the grants, decide what the agent reaches. Doing this before the first agent means the boundary is a design decision rather than a retrofit after someone notices the scope.

**Telemetry fourth, before broad use.** The record has to exist before there is anything to record. Building it after the first incident means the first incident is unreconstructible.

**Tools fifth.** Now you have something to expose and semantics to expose with it. Narrow schemas, descriptions that name failures, hard caps in code.

**Agent last.** The reasoning loop over a stack that already constrains it correctly. This is the smallest piece of work and the one most teams start with.

The common sequence is the reverse: agent first, then tools, then discovering the data problem. That order produces a demo in a week and a system that cannot be made reliable, because every fix requires going back to a layer that should have come first.

If you are already inverted, the recovery is the same order applied retroactively. Stop tuning the agent. Build the data layer for the top questions. The agent gets better without being touched.

## The organizational shape

The layers have different owners, which is the point and also the difficulty. An architecture whose layers span four teams needs the coordination designed rather than assumed.

Three patterns, with different failure modes.

**One team owns everything.** Fast, coherent, and it does not scale past a couple of subject areas. The team becomes the bottleneck for every dataset anyone wants, and the knowledge layer suffers most because the people who know the traps are elsewhere.

**Layers owned by function.** Data engineering owns data, analysts own knowledge, platform owns tools and policy, an agent team owns reasoning. Scales well and produces the classic handoff problem, where each layer is individually fine and the interfaces leak.

**Domain teams own their vertical slice.** Each domain owns its data, knowledge, and tools, with a platform team owning policy, telemetry, and the agent framework. This scales best and requires real platform investment, since every domain team needs paved paths rather than the freedom to invent.

The third is where most organizations end up if they get large enough, and getting there prematurely is its own failure, because domain teams without a platform build five incompatible versions.

Whichever shape, three roles have to exist explicitly.

**Someone owns each dataset and its semantics.** Named in the metadata, not in a spreadsheet. The most common cause of semantic rot is diffusion of responsibility rather than any technical cause.

**Someone owns the interfaces.** The contracts between layers are where failures concentrate, and they are the thing no single layer owner is accountable for. This is a platform responsibility and it needs naming, because otherwise every interface bug is somebody else's.

**Someone reviews the telemetry.** Sampled sessions, read by a person, on a schedule. Without this the record is storage rather than governance, and the reviewer should not be the person who built the agent, because the builder reads the trace charitably.

One coordination mechanism that works well: a shared evaluation set owned jointly. When the data team, the analysts, and the agent team all watch the same numbers, arguments about whose problem a failure is get resolved by the per-layer results rather than by seniority.

## Practical starting points

If you are standing this up, the first month.

**Week one: pick one subject area and inventory the questions.** Real questions in users' words, from support tickets, Slack, and existing dashboard filters. Twenty to fifty is enough. This is the requirements document for everything else.

**Week two: build two or three gold datasets covering the top of that distribution.** Business rules applied, grain stated, dimensions pre-joined. Do not attempt coverage. Attempt correctness on the common cases.

**Week three: write the semantics with the analysts.** Sit with people who have watched others get these tables wrong and ask what the mistakes are. Their answers become descriptions almost verbatim. This is a room and a whiteboard, not a documentation project.

**Week four: policy and telemetry.** Create the agent principal, grant it the gold datasets and nothing else, stand up the session and event tables. No agent exists yet, and both are ready when one does.

**Week five onward: tools and agent.** Now the work at the top of the stack sits on a foundation that constrains it correctly.

Two things to resist.

**Resist starting with the agent.** It demos in a day and it produces a system whose every subsequent problem lives in a layer you skipped.

**Resist broad shallow coverage.** One subject area done properly teaches you what the next one costs and produces something that works. Five subject areas half-built produce an agent that is unreliable everywhere, and unreliable everywhere is indistinguishable from broken.

The honest timeline for one subject area, done properly, is four to six weeks with a small team. Anyone promising a working analytics agent in a week is describing the top layer only.

## Where the layers physically live

The architecture is conceptual and it has to land on real systems. Two mappings that work, and the tradeoffs between them.

**Consolidated on the lakehouse platform.** Data as Iceberg tables and views. Knowledge as descriptions and properties attached to those objects in the catalog, plus metric definitions in a semantic layer. Policy as catalog grants. Telemetry as Iceberg tables. Tools as a server over the catalog and engine. Agent as an application.

The advantage is that five layers land on two or three systems, and the interfaces between them are short. The catalog is doing a lot of the work, which is appropriate because the catalog is the thing every consumer already goes through.

**Distributed across specialized systems.** A separate semantic layer product, a separate policy engine, a separate observability platform, a separate agent framework. Each layer gets a system built for it.

The advantage is depth per layer. The cost is interfaces, and the interfaces are where this architecture fails, so multiplying them has a real price.

My view, stated as a preference rather than as a fact: consolidate where you can, and specialize where a layer genuinely exceeds what the general system does. Most organizations are better served by descriptions in the catalog than by a separate documentation system, because the catalog version reaches every consumer automatically and the separate one requires an integration that will eventually be stale.

Two specific cases where specialization is usually right.

**Policy, where you already have a policy system.** Organizations with a mature access-control practice have policies expressed somewhere, often spanning more than the lakehouse. Reimplementing them in a catalog's native model creates two sources of truth. Pointing the catalog at the existing authorizer keeps one, and catalogs are getting better at supporting exactly this.

**Metric definitions, where they serve more than the lakehouse.** A metric used by BI, by finance systems, and by agents wants a home that all three reach. Whether that is a semantic layer product or an open definition format, it should not be exclusive to one consumer.

Two cases where consolidation is usually right.

**Dataset descriptions.** They belong with the dataset, which means the catalog. A description in a separate system drifts by exactly the amount of friction between the systems.

**Telemetry.** An Iceberg table is a better home for agent traces than a log platform: queryable by reviewers without production access, cheap to retain for years, and joinable to the engine's own job history.

The test to apply when deciding: which system will still be there in five years, and which consumer needs this. Semantics that outlive the tool that produced them belong somewhere neutral.

## Failure modes of the architecture itself

**Layers collapsed into one component.** A single service holding data access, semantics, tool definitions, and reasoning. It works and it cannot be debugged, because a failure has no layer to attribute it to. Warning sign: nobody can say which component owns business rules. Fix: separate at least the data and policy layers into things with their own owners.

**Policy implemented in the agent layer.** Safety as prompt instructions. Warning sign: for a dangerous action, nobody can name the grant preventing it. Fix: move enforcement to grants and tool schemas.

**Semantics that never reach the model.** Covered above and the most common leak. Warning sign: confident descriptions plus an agent behaving as though there are none.

**No owner for the knowledge layer.** Data engineers assume analysts own it, analysts assume the platform does. Descriptions rot. Warning sign: nothing edited in six months. Fix: name an owner per subject area.

**Telemetry nobody reads.** Built for compliance, written to faithfully, never queried. It drifts and the drift goes unnoticed. Warning sign: no reads in the query history. Fix: build the debugging queries and put them in front of engineers, since a table with users stays correct.

**The agent layer as the tuning knob.** Every problem gets a prompt change. Warning sign: a system prompt that has grown past a page. Fix: for each instruction, ask which lower layer should carry it, and move it.

**Independent evaluation never done.** Only end-to-end tests exist, so a failure has no attribution. Warning sign: no way to evaluate the data or knowledge layers without an agent. Fix: an evaluation set at each layer, run separately.

**Gaps papered over instead of surfaced.** The agent has a fallback path to raw tables, so coverage gaps become confident wrong answers rather than refusals. Warning sign: an answer for everything. Fix: remove the fallback and let gaps show as refusals you can fill.

## What the layering does not solve

An architecture article that only describes what its structure fixes is incomplete. Five things this layering does not address, so you know what remains.

**Questions nobody anticipated.** The data layer covers the question distribution you built for. A genuinely novel question, the kind an analyst explores toward with no prior idea of the shape, is outside it. That work still needs a person with access to the unshaped data and the judgment to interpret it. Agentic analytics on a good stack replaces the repetitive middle of the analytics workload, not its exploratory edge, and setting that expectation early prevents a lot of disappointment.

**Disagreement about what a number means.** When finance and operations define revenue differently, the semantic layer records whichever definition someone put in it. It does not resolve the disagreement, and an agent confidently reporting one of two contested definitions is a governance problem wearing a technical costume. This layering forces the disagreement into the open, which is genuinely useful, and it does not settle it.

**Data that is wrong at the source.** Every layer above assumes the underlying records are accurate. A duplicate load, a broken upstream integration, or a sensor reporting garbage produces correct processing of wrong inputs. Source data quality is a prerequisite rather than something this structure provides, and it is where the majority of confidently wrong answers actually originate.

**Model failures that look like reasoning.** Even on a well-built stack, a model sometimes produces a plausible wrong answer for reasons no layer catches: a subtle arithmetic error, an unwarranted inference, a misreading of an ambiguous question. Reducing the frequency is what the layers do. Reaching zero is not on offer, which is why the review practice and the reconciliation checks matter.

**Organizational willingness to act on findings.** The telemetry shows an agent making the same mistake repeatedly. Whether anyone edits the description is a question about incentives and ownership. I have seen more programs decay from nobody owning the maintenance than from any technical shortcoming.

Naming these matters for expectation-setting. A stakeholder told the architecture makes an agent reliable will judge it against reliability. One told it makes an agent reliable within a defined scope, with known failure modes and a review practice, is evaluating something real.

The honest summary of what the layering buys: failures become attributable, most of them become preventable, and the remainder become visible. That is a substantial improvement over the alternative and it is not the same as solving the problem.

## Retrofitting an inverted stack

Most teams reading this already shipped an agent and are dealing with the consequences. The recovery sequence is worth spelling out, because the instinct is to rebuild everything and that is neither necessary nor affordable.

**Step one: stop tuning the agent.** Freeze the prompt. Every further prompt change is compensating for a lower layer and it makes attribution harder, because now the agent behaves differently for reasons unrelated to what you fix.

**Step two: build the telemetry, if it does not exist.** Before diagnosing anything. Sessions and events, with tool calls, arguments, and tables touched. Two tables and a week. Without them every subsequent step is guesswork and you cannot measure whether a fix worked.

**Step three: collect twenty real failures.** Actual wrong answers, actual bad tool calls, actual unexpected accesses. Real ones, from the telemetry, not hypotheticals.

**Step four: attribute each one to a layer.** Using the decision tree earlier. This is the highest-value hour in the whole recovery. The distribution tells you where to spend, and it is almost never where the team assumed.

In my experience the distribution comes out heavily weighted toward layers one and two, with a handful in four and very few in three. Teams expect the opposite and spend accordingly.

**Step five: fix the largest bucket first, for one subject area.** Not everywhere. Take the subject area producing the most failures and build its data and knowledge layers properly. Measure the failure rate for that subject area before and after.

That before-and-after number is what funds the rest. A demonstrated reduction on one subject area, attributable to work that did not touch the agent, is a much stronger argument than any architectural diagram.

**Step six: close the policy gap.** For every action the agent can take, name the enforcement mechanism. Anything defended only by a prompt gets moved to a grant or a tool schema. This is usually a day of work and it eliminates a whole class of incident.

**Step seven: unfreeze the agent layer.** Now changes there are addressing reasoning rather than compensating for missing foundations, and you can tell the difference because the layers below are measured.

The thing that makes this recovery work rather than turning into a rewrite is that it is incremental and subject-area scoped. You are not rebuilding the platform. You are building the missing layers under one slice, proving the effect, and repeating.

One political note. This sequence involves telling stakeholders that the shipped agent needs foundational work, which is an uncomfortable conversation. It goes considerably better with the attributed failure distribution in hand, because it converts "the agent is unreliable" into "sixteen of twenty failures came from two datasets missing business rules," and the second is a work item rather than a verdict.

## Where this is heading

Three directions.

The layers are converging on the catalog. Data lives there, semantic assets increasingly live there, policy enforcement lives there, and access records originate there. A catalog that holds tables, views, metrics, and policies with one authorization model collapses several of these from separate systems into one governed place, which is a substantial simplification.

Semantic definitions are becoming portable artifacts rather than properties of one tool. A definition locked inside a BI tool serves that tool. Expressed in an engine-neutral form, it serves every consumer including agents, and there is active ecosystem work on standardizing that representation.

The feedback loop from telemetry back into knowledge is the obvious missing piece. Today a wrong answer gets noticed by a person and, if they are conscientious, someone edits a description. A system that records which datasets and columns produced each answer, and lets a reviewer mark answers wrong, has the raw material to point directly at the description that misled the model. Nobody has built it well and it is the thing that turns semantic maintenance from a discipline into a process.

## Conclusion

Agent reliability is not a model property. It is a property of the stack the model sits on, and that stack has five layers with distinct owners and distinct failure modes.

Data provides datasets with business rules applied. Knowledge provides what they mean, including the mistakes to avoid. Agent provides reasoning and bounds. Tool provides an interface whose parameter schema makes bad actions unexpressible. Policy and telemetry provide what is permitted and what happened.

The value of naming them is diagnostic. A wrong number is a data or knowledge failure, not a reasoning one. An action that should have been impossible is a tool schema or a grant, not a prompt. An answer nobody can reconstruct is a telemetry gap that blocks diagnosing everything else.

Build them bottom-up, which is the opposite of how most programs start. Data and knowledge take weeks per subject area and deliver value on their own. Policy and telemetry come before the agent exists rather than after the first incident. The agent is the last and smallest piece.

If you are already inverted, stop tuning the agent and build the layers underneath it. The agent gets better without being touched, which is the clearest evidence that the problem was never the model.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and the semantic layer. *Architecting an Apache Iceberg Lakehouse* from Manning covers data product design, semantic modeling, and platform layering as architectural decisions. *Apache Polaris: The Definitive Guide*, which I co-authored for O'Reilly, covers the catalog's role in governing all of it across engines. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
