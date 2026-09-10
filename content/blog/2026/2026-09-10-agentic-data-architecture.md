---
title: "Agentic Data Architecture"
date: "2026-09-10"
description: "A six-layer reference architecture for agents on company data: planners, tool boundaries, identity, the semantic layer, and what breaks when a layer is missing."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - Agentic AI
  - data architecture
  - semantic layer
  - Model Context Protocol
  - data governance
canonical: https://iceberglakehouse.com/posts/agentic-data-architecture/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/agentic-data-architecture/).

Most agent projects on company data are built the same way. Someone connects a model to a warehouse, gives it a SQL tool, wraps it in a chat interface, and ships it. It works in the demo. Then a user asks something that takes four steps, the agent runs a query that scans eight terabytes, another user asks a question about data they are not allowed to see and gets an answer, and the whole thing gets quietly retired.

The problem is not that any single component was wrong. It is that there was no architecture. A model with a SQL tool is a prototype. The system that survives contact with an organization has planning separated from execution, tool boundaries that are boundaries rather than suggestions, identity that flows from the person through the agent to the data, a semantic layer between the question and the tables, and enough instrumentation to explain any answer it produced last Tuesday.

This piece is the reference architecture that most agentic data articles assume and few draw. Six layers, what each one does, where the boundaries go and why, the decisions that are load-bearing, and what breaks when a layer is missing. I work at Dremio, which builds pieces of this, so weigh the recommendations with that in mind. The structure is protocol-and-pattern rather than product.

## The three questions an architecture answers

Before layers, the questions the design exists to answer. Any proposed architecture that cannot answer all three is a prototype wearing a diagram.

**What is this agent allowed to do?** Not what it is capable of. What the system permits, enforced somewhere that a persuasive prompt cannot reach. An agent whose limits live only in its instructions has no limits, because instructions are text and text is the thing an attacker controls.

**Who is asking?** Every action taken against data has to trace to a person or a system with an identity, and the permissions applied have to be that identity's permissions. Agents that authenticate as themselves collapse every user's access into a single service account, which is a data leak with a chat interface in front of it.

**Why did it answer that?** Given an answer from three weeks ago, the system should be able to reconstruct the question, the plan, the tools called, the data returned, and the context supplied. Without that, you cannot debug it, audit it, or improve it.

Those three questions map onto authorization, identity, and observability, and none of them is the model's job. That is the central insight of the whole architecture: **the interesting engineering in an agentic data system is outside the model.**

## The six layers

Here is the shape, top to bottom, with what belongs in each.

**Interface.** Where the question arrives. Chat, an IDE, a scheduled trigger, an API call from another system. Its jobs are capturing the request, carrying the requester's identity, and rendering results in a form that shows provenance rather than just an answer.

**Orchestration.** The agent loop. Planning, tool selection, iteration, and the decision to stop. This is where the model lives and it is a smaller part of the system than its prominence suggests.

**Tools.** The bounded set of actions available. Query execution, metric lookup, schema search, freshness check, job trigger. Each with a declared contract, each independently authorized.

**Semantics.** The layer that turns business concepts into physical queries. Metrics, dimensions, join paths, business rules. The single largest accuracy lever in the entire system.

**Data platform.** Catalog, engines, tables, storage. The part that existed before anyone said the word agent.

**Governance and observability.** Cross-cutting rather than stacked: identity propagation, policy enforcement, audit, cost control, and evaluation. It touches every layer, which is why it fails when it is added at the end.

The layering matters because it localizes decisions. Accuracy problems live in semantics. Safety problems live in tools and governance. Cost problems live in orchestration and the platform. A system without these seams produces problems that live everywhere, which is another way of saying nobody can fix them.

## Orchestration: planning apart from execution

The most consequential structural decision is separating the plan from the act.

An agent that reasons and executes in one undifferentiated loop is hard to constrain, because there is no moment where a plan exists as an inspectable object. Splitting them creates that moment, and the moment is where policy, cost checks, and human approval attach.

**Planning produces a structured artifact.** Not prose, and not SQL. A description of intent: which metrics, which dimensions, which filters, which time grain, or for non-query work, which steps in which order. Structured plans are checkable, cacheable, comparable across runs, and legible in a log in a way generated SQL is not.

**Execution takes the artifact and runs it.** Compilation to SQL, tool invocation, result assembly. Deterministic, testable, and boring, which is the goal.

Four things become possible once the seam exists.

**Policy evaluation on intent.** A plan naming a customer-level dimension gets checked against the requester's permissions before a query runs, rather than relying on the query failing. Failing after execution wastes compute and leaks the shape of what exists through error messages.

**Cost estimation before execution.** A plan compiles to SQL, the SQL gets estimated, and a plan whose estimate exceeds a threshold gets refused, downgraded, or escalated for approval. This is the single most effective control against the runaway-query problem, and it requires exactly the seam being described.

**Caching at the right granularity.** Two differently worded questions producing the same plan should not run twice. Plan-level caching catches this and text-level caching does not.

**Replay.** A stored plan re-executes against fresh data, which turns an ad hoc answer into something schedulable, and gives you regression testing for the agent itself.

The loop shape that works in practice: plan, validate the plan, execute one step, observe the result, decide whether to continue, with an iteration budget and a hard stop. The budget matters more than it looks. Agents that fail to make progress do not usually stop, they cycle, and an unbounded loop against a query engine is expensive in a way an unbounded loop against a text API is not.

One design note on where the model sits. Planning is a model task. Validation is not. Execution is not. Deciding whether the loop continues is a mixed decision and it benefits from hard rules alongside the model's judgment: stop after N steps, stop if the last two steps produced identical results, stop if cumulative cost exceeds the budget.

## What a plan artifact looks like

The plan is the load-bearing object in this design, so it is worth showing rather than describing.

```json
{
  "plan_id": "pln_01J8XQ2M4",
  "requested_by": "amerced@example.com",
  "question": "revenue by region for the last two fiscal quarters, flag drops over 10%",
  "steps": [
    {
      "step": 1,
      "tool": "query_metrics",
      "arguments": {
        "metrics": ["revenue"],
        "dimensions": ["region"],
        "grain": "fiscal_quarter",
        "time_range": {"last_n_complete": 2},
        "filters": []
      },
      "expects": "one row per region per fiscal quarter"
    },
    {
      "step": 2,
      "tool": "__local__",
      "operation": "period_over_period",
      "arguments": {"threshold_pct": -10, "on": "revenue"},
      "expects": "flagged rows where the decline exceeds the threshold"
    }
  ],
  "estimated_bytes_scanned": 41203847,
  "estimated_cost_usd": 0.021,
  "policy": {"evaluated_at": "2026-09-10T14:22:08Z", "decision": "allow"}
}
```

Five properties of that object do real work.

**It names concepts, not tables.** `revenue` and `region` are entries in the semantic layer. Nothing in the plan references a physical table, a column, or a dialect, which is why the same plan survives a platform migration.

**It is checkable before execution.** A policy engine reads `metrics` and `dimensions` and decides against the requester's grants without running anything. The cost estimate is attached and comparable to a budget.

**It distinguishes local work from data work.** Step two runs in the orchestration layer against results already in hand. Making that explicit stops the agent from issuing a second expensive query to do arithmetic.

**It carries expectations.** The `expects` field gives the loop something to check the result against, which is how a no-progress detector knows the difference between an answer and a repetition.

**It is comparable.** Two differently worded questions producing an identical plan hit the cache. A plan that changed between last week and this week explains why the answer changed.

The matching tool contract is equally worth declaring explicitly:

```yaml
name: query_metrics
description: >
  Run a governed metric query. Use this for any question about a defined
  business measure. Returns rows with the requested metrics and dimensions.
  Does not accept SQL and cannot read unmodeled tables.
read_only: true
requires_identity: true
authorization:
  - grant: metric.read
    on: "{{ arguments.metrics }}"
  - grant: dimension.read
    on: "{{ arguments.dimensions }}"
limits:
  max_estimated_bytes: 500000000
  max_rows_returned: 50000
arguments:
  metrics: { type: array, items: string, required: true }
  dimensions: { type: array, items: string, default: [] }
  grain: { type: string, enum: [day, week, month, fiscal_quarter, fiscal_year] }
  time_range: { type: object, required: true }
  filters: { type: array, default: [] }
```

The description is written for the model, since tool selection is a context-engineering problem. The `read_only` and `requires_identity` flags are enforced by the gateway rather than trusted. The authorization block names what has to be granted, evaluated per argument rather than per tool, which is what makes a single tool safe to expose broadly. And the limits are the last line of defense on cost, applied even when the plan-level estimate was wrong.

Writing tool contracts this way takes an afternoon per tool and it is what converts "the agent should not do that" from an instruction into a property of the system.

## Tools: the actual boundary

Tool design is where an architecture becomes safe or does not, and the common failure is a single tool that is really an escape hatch.

**One generic SQL tool is not an architecture.** "Execute this SQL" grants everything the connection can do. Every constraint you care about now depends on the model choosing to respect it, and prompt injection through data content turns that choice into an attacker's choice. Tool responses containing text that the model reads as instructions is a documented attack, and the defense is that the tools available are incapable of the damaging action, rather than that the model was told not to.

**Tools should be narrow, declared, and separately authorized.** A working set for a data agent looks like this:

| Tool | Does | Authorized by |
|---|---|---|
| `search_concepts` | Finds metrics and dimensions by description | Read on the semantic catalog |
| `describe_entity` | Returns definitions, rules, owners | Read on the semantic catalog |
| `query_metrics` | Runs a structured metric request | Per-metric and per-dimension grants |
| `check_freshness` | Reports load status for an entity | Read on operational metadata |
| `run_sql` | Executes raw SQL, read-only, budgeted | A separate grant, off by default |
| `trigger_job` | Starts a pipeline run | Write, requires approval |

Two properties of that set matter more than its contents.

**The default path avoids raw SQL.** `query_metrics` handles governed questions by compiling a structured request. Raw SQL exists for exploration, is separately granted, and shows up distinctly in the audit trail so anyone reviewing knows which answers were governed.

**Write actions are a different category.** Reading is recoverable. Triggering a pipeline, writing a table, or modifying a definition is not, and those tools deserve approval flows, stricter identity requirements, and their own alerting. The distinction that MCP encodes through hints about whether a tool is read-only or destructive is the right one, and treating it as advisory rather than enforced is a mistake.

**Tool descriptions are part of your context engineering.** The model chooses tools based on their descriptions, so a vague description produces wrong tool selection in the same way a vague column description produces wrong column selection. Write them with the same care, and test tool selection specifically in your evaluations.

**Fewer tools work better than more.** Every additional tool expands the selection space and the error surface. A dozen well-chosen tools outperform forty overlapping ones, and the temptation to expose every capability the platform has is worth resisting.

## The protocol layer

Tools have to reach the agent somehow, and that has largely standardized. MCP became the common interface between agent runtimes and tools, and in December 2025 it moved to vendor-neutral governance under the Agentic AI Foundation at the Linux Foundation. Its 2026 revisions pushed toward enterprise deployment: a stateless core that makes servers ordinary HTTP workloads, support for long-running work, and enterprise-managed identity.

Two things about the protocol shape the architecture.

**It standardizes the wire format and deliberately not the control plane.** The protocol answers whether a caller is authorized to reach a server. It does not answer which agents are allowed to call which tools, with which models, at what cost, or what governance was applied to a given call. That scope line is explicit in the specification's own framing, and it means the governance layer in your architecture is yours to build or buy. Teams that assume adopting MCP delivers governance discover the gap in a review.

**A gateway is the practical answer.** Putting a governed proxy between the agent runtime and tool execution gives you one place for policy evaluation, argument validation, payload inspection, rate limiting, and audit. Treat MCP servers with the same posture as public-facing services: validate every argument, inspect every response, and route egress through something that logs. The alternative, agents connecting directly to whatever servers exist, produces an environment where nobody can enumerate what the agents can do.

## Where the semantic layer sits

The semantic layer belongs below the tools and above the platform, and that placement is a decision rather than an inevitability. Two alternatives get proposed and both are worse.

**Semantics inside the agent prompt.** Metric definitions and rules injected as text, with the agent expected to apply them when writing SQL. This fails for a structural reason: the rules are advisory. An agent that has been told revenue excludes cancelled orders forgets it on the fourth step of a complex question, and nothing catches the omission. Text-based rules degrade under pressure, and complex questions are pressure.

**Semantics after the query, as validation.** Generate SQL, then check it against rules. Better than nothing and fundamentally limited, because verifying that arbitrary SQL implements a business definition correctly is harder than generating the SQL from the definition in the first place.

**Semantics as a compilation target.** The agent produces a structured request naming modeled concepts, and the semantic layer compiles it into correct SQL. The rules are not advisory, they are in the compiler. The agent cannot omit an exclusion because it never wrote the filter.

That third arrangement is what produces the measured accuracy differences between agents grounded in raw tables and agents grounded in modeled semantics, and it also produces three architectural benefits that have nothing to do with accuracy.

**Authorization becomes expressible.** Permissions on metrics and dimensions map to business rules in a way permissions on physical tables do not. "This role sees revenue by region but not by customer" is a sentence about concepts.

**The audit trail becomes readable.** A logged structured request naming a metric and two dimensions tells a reviewer what was asked. A logged forty-line generated SQL query does not, and the difference shows up the first time somebody has to answer a question about access to sensitive data.

**Engine portability comes free.** The compiler handles dialects. Agents keep working when the platform changes underneath them, which over a five-year horizon is not a hypothetical.

The honest limitation, worth designing around rather than hiding: the semantic layer only covers what has been modeled. Real systems need a governed path for modeled questions and an explicitly labeled ungoverned path for exploration, with the second one clearly marked in both the interface and the logs.

## Identity, all the way down

The failure that ends agent projects fastest in a security review is an agent that authenticates as itself.

The pattern is easy to fall into. The agent has a service account. The service account has access to the data. Users talk to the agent. Now every user has the union of everything the service account can reach, mediated only by the agent's willingness to refuse, which is a text-based control on a system whose inputs include text from data.

The correct arrangement propagates identity end to end. The user authenticates at the interface. That identity travels through orchestration into every tool call. Tools authorize against the user's permissions. The query engine and the catalog see the user, not the agent. Vended credentials, where the platform supports them, are scoped to what the user is allowed to touch.

Three consequences worth planning for.

**Retrofitting is a rewrite.** An agent built around a service account, with permissions baked into that account's grants, does not gain per-user identity through configuration. The change touches the interface, the loop, every tool, and the platform integration. Decide this at design time.

**Some actions legitimately need elevation.** A maintenance agent compacting tables acts with platform permissions rather than a user's. That is fine, and it should be a separately identified principal with its own audit trail and its own approval requirements, not the same service account the chat agent uses.

**Delegation needs a record.** When an agent acts on a user's behalf, the log should show both: which user, through which agent, at which time. One field is not enough, and the distinction matters the first time an investigation asks whether a human or an automation initiated something.

## Governance, cost, and the observability that makes both possible

Cross-cutting concerns, grouped because they share an implementation: everything the system does has to be recorded in a form you can query later.

**What to record per request.** The question as asked, the requester's identity, the plan produced, each tool call with arguments, each result summary, the context retrieved and injected, the cost incurred, and the final answer. That record is the substrate for debugging, auditing, evaluation, and cost attribution, and it is nearly impossible to reconstruct after the fact.

**Policy enforcement points.** Two of them, minimum. On the plan, before execution, checking intent against permissions and budget. And inside tool authorization, checking the specific action. Defense in depth here is not paranoia, since the plan check catches most problems cheaply and the tool check catches everything the plan check missed.

**Cost control is a first-class layer, not a dashboard.** Agents generate query volume that behaves nothing like human analysts. A person asks four questions in an hour. An agent asks four questions per step and takes eleven steps. Three controls that work: a per-request budget enforced against the estimate before execution, a per-user daily budget, and a global circuit breaker that stops all agent traffic when spend crosses a line. The circuit breaker feels excessive until the first runaway loop.

**Evaluation belongs in the architecture.** A stored set of questions with verified answers, re-run against the system on every change to prompts, tools, context, or models, with results segmented by question type. Without it, every change is a guess, and agent systems accumulate changes faster than most software.

**The prompt injection surface is your data.** Tool responses carry content the system did not write. A description field in a table containing text that reads as an instruction is an injection vector, and this is not exotic on a platform where users can name things. The mitigations that work are structural: tools that cannot perform damaging actions, clear separation between instruction and observation in how content is presented to the model, and validation on the way out rather than trust on the way in.

## What breaks when a layer is missing

A quick diagnostic, since most real systems are missing exactly one.

**No semantics.** Accuracy plateaus low and never recovers. Answers are plausible and wrong, metric definitions fork across users, and every improvement effort gets aimed at the model, which does not move the number.

**No tool boundary.** The system is one persuasive input away from doing something unrecoverable. Also, nobody can enumerate what it is able to do, which makes the security review unanswerable rather than merely difficult.

**No identity propagation.** Data access is uniform across users regardless of their permissions. Usually discovered by an auditor rather than by the team.

**No plan or execution seam.** Cost controls and policy checks have nowhere to attach, caching is ineffective, and answers cannot be replayed or explained.

**No observability.** Failures are unexplainable, improvements are unmeasurable, and the first serious incident produces a meeting where nobody can say what happened.

**No evaluation.** The system's quality is a matter of opinion, and it drifts steadily as prompts, tools, and models change underneath it. Anecdotes replace numbers, the loudest recent failure drives the roadmap, and nobody can tell whether last month's changes helped.

Missing observability and missing evaluation are the two that let a project run for a long time before anyone notices, which makes them the most expensive omissions rather than the least.

## A worked request

Following one request through the layers makes the boundaries concrete.

**The request arrives.** A finance analyst asks in chat: "revenue by region for the last two fiscal quarters, and flag anything down more than 10%."

**Interface.** Captures the question and attaches the analyst's identity from the corporate identity provider. That identity is now part of the request and stays with it through every subsequent hop.

**Orchestration, planning.** The model calls `search_concepts` to find what exists, gets back the revenue metric and the region dimension with their descriptions, and emits a structured plan: the revenue metric, grouped by region, at fiscal quarter grain, for the two most recent complete quarters, with a post-processing step comparing the periods.

**Policy check on the plan.** The plan names revenue and region. The analyst has grants on both. Cost estimation compiles the plan and estimates the scan, which comes in well under the per-request budget. The plan is approved and stored.

**Execution.** `query_metrics` runs the structured request. The semantic layer compiles it, applying the exclusions carried in the revenue definition and resolving the fiscal calendar, and the engine runs the resulting SQL under credentials scoped to what the analyst is allowed to read.

**Second step.** The comparison and the 10% flag happen in the orchestration layer against the returned result set, not as a second database query. Small post-processing belongs where the data already is.

**Observation and stop.** The loop checks whether the result answers the question, finds it does, and stops well inside its iteration budget.

**Response.** The answer renders with the numbers, the metric definition used, the fiscal quarters covered, and a note that the orders table loaded successfully at 06:14. The user sees provenance rather than a bare table.

**Record.** One row written with identity, question, plan, tool calls, compiled SQL, bytes scanned, cost, and answer.

Now change one thing. The analyst asks the same question but adds "broken out by individual customer." The plan names a customer-level dimension the analyst has no grant on. The policy check on the plan refuses before any query runs, and the response explains which part was refused rather than returning a partial answer or a raw permission error. That refusal cost nothing, happened before execution, and is legible in the log.

The second version is the whole argument for the architecture, in one interaction.

## Failure modes to design against

Six that show up repeatedly once these systems meet real users.

**The runaway loop.** An agent that fails to make progress cycles rather than stopping, and each cycle issues queries. Bounded by an iteration cap, a cumulative cost budget, and a no-progress detector that stops when consecutive steps produce identical results.

**Injection through data.** Content in a table name, a column description, or a returned row that reads as an instruction. Structural defenses only: narrow tools that cannot do damage, clear separation of instruction from observation, validation on outputs.

**Silent permission collapse.** An agent quietly falling back to its own service credentials when user identity is unavailable, and answering anyway. Fail closed instead, and alert on the fallback path being taken at all.

**Definition drift between the agent and the dashboards.** The agent is correct according to the semantic layer and inconsistent with a report the executive already trusts. This reads as the agent being wrong regardless of which one is right, so reconcile before launch.

**Cost concentration in a few users.** Agent spend is heavily skewed, with a small number of users driving most of it, and without per-user budgets the platform bill arrives before the pattern is visible. Attribute cost per user from day one.

**Quality drift after a model change.** A model upgrade shifts behavior in ways no one predicted, and without the eval set the change is invisible until users complain. Re-run the eval on every model change, and treat model version as a deployment artifact rather than a setting.

## Agent shapes, and how the architecture changes per shape

Not every agent needs every layer at full strength. Four common shapes, with what each stresses.

**The analytics agent.** Answers business questions in chat. Stresses semantics above everything, since accuracy is the product. Read-only tools, per-user identity essential because it touches whatever the user asks about, moderate cost exposure. This is the shape most teams build first and the one where the semantic layer decides success.

**The pipeline agent.** Investigates failures, proposes fixes, sometimes applies them. Stresses tool boundaries and approval flows, because its useful actions are write actions. Runs as its own principal with platform permissions rather than a user's. Needs the strongest audit trail of any shape, since its actions change state.

**The maintenance agent.** Decides what to compact, when to expire, which tables need attention. Stresses observability and cost control. Its inputs are metadata rather than user questions, which makes prompt injection less relevant and cost discipline more so, since its actions are expensive by nature.

**The embedded agent.** Lives inside another product and answers questions about a customer's own data. Stresses identity propagation hardest of all, because a tenancy mistake is a cross-customer data leak rather than an internal permissions problem. Also stresses cost predictability, since the spend is per-customer and usually not separately billed.

The general rule: **read-heavy shapes stress semantics, write-capable shapes stress tool boundaries and approvals, and anything touching multiple users stresses identity.** Build the layer your shape stresses first, and keep the others present but thin until the shape changes.

## Multi-agent, and when it earns its complexity

Multi-agent architectures are fashionable and frequently unnecessary, so it is worth being specific about when the structure pays.

**It pays when tool sets genuinely differ and should not be combined.** An agent that reads analytics and an agent that modifies pipelines have different permissions, different approval requirements, and different risk profiles. Merging them means the combined agent holds the union of both tool sets, which is exactly what tool boundaries exist to prevent. Separating them keeps each blast radius small.

**It pays when a task decomposes into independent subtasks.** Several questions researched in parallel and assembled at the end genuinely runs faster and uses context better than one sequential loop.

**It does not pay as a substitute for a plan.** Three agents passing messages to accomplish what one agent with a structured plan accomplishes is more moving parts, more latency, more cost, and less legibility. If the motivation is that the single agent gets confused on long tasks, the fix is usually better planning structure, not more agents.

**It does not pay when the agents share everything.** Two agents with the same tools and the same permissions differ only in their instructions, which means they are one agent with a routing step.

When you do split, the boundaries that hold up are permission boundaries rather than topical ones. "Read agent" and "write agent" is a durable split. "Sales agent" and "marketing agent" usually is not, since both need the same tools and the difference is context that a single agent handles with retrieval.

The coordination question then becomes real: how agents pass state, how identity propagates across a hop, and how the audit trail stitches together across several actors. Interoperability protocols address parts of this, and analysis of the current generation notes that what they express well is coordination and what they express poorly is governance across agent boundaries. That gap is worth knowing about before designing a system that depends on it being closed.

## A reference deployment

Concretely, for a mid-sized platform standing this up.

**Interface.** Chat in the existing collaboration tool plus an API. Authentication through the corporate identity provider, so the requester is known from the first message. Answers render with the plan, the metrics used, and a freshness note, so the user sees provenance rather than a bare number.

**Orchestration.** A service running the agent loop with an iteration cap, a per-request cost budget, and structured plan output. Plans persist. The model is configurable per deployment, because it changes more often than anything else in the system.

**Tools.** Six, exposed through MCP behind a gateway. Four read-only and available to everyone, `run_sql` granted to analysts only, `trigger_job` requiring approval. The gateway validates arguments, enforces rate limits, and logs every call with the user identity attached.

**Semantics.** A modeled layer covering the top metrics, growing by demand. Governed questions compile through it. Ungoverned exploration goes through `run_sql` and is labeled as such in the answer and the log.

**Platform.** The lakehouse that already exists. The catalog enforces per-user permissions and vends scoped credentials. Nothing here was built for agents, and the agent-facing work happens above it.

**Governance.** One record per request in an Iceberg table, holding identity, question, plan, tool calls, cost, and answer. A daily job computes accuracy against the eval set and cost per user. A circuit breaker on total spend.

That deployment is maybe six weeks of work for a team that already has a semantic layer, and considerably more for a team that does not, which is the honest sequencing point: **the semantic layer is the long pole, and starting the agent work before it is underway means building the fast parts first and waiting.**

## Build versus buy, per layer

The market sells pieces of this, and the sensible split follows how specific each layer is to your organization.

**Interface: buy or use what exists.** Chat surfaces are commodity. Building one is a distraction from the layers that matter.

**Orchestration: buy the framework, own the loop.** Agent frameworks handle the mechanics competently. What stays yours is the plan schema, the stopping rules, and the budget enforcement, because those encode decisions specific to your risk tolerance.

**Tools: build.** Your tools reflect your platform and your permission model. Generic tools are the ones that turn into escape hatches.

**Semantics: buy the layer, own the model.** Semantic layer products are mature. The modeling inside them is entirely yours and it is where the accuracy comes from, which is the recurring theme of this whole subject.

**Platform: already bought.** The catalog, engines, and storage predate the agent work, and the agent-facing effort happens in the layers above them rather than inside them.

**Governance: buy the gateway, own the policy.** Gateway products handle inspection, rate limiting, and logging. What policies apply to which principals is organizational knowledge that no vendor supplies.

The pattern: buy the mechanics, own the meaning. Every layer where the value comes from knowing your business is a layer to own, and every layer where the value comes from correct plumbing is a layer to buy.

## Sequencing a build

The order that avoids the common dead ends.

**First, the eval set.** Real questions with verified answers, before any architecture. It is the only way to know whether anything you build works, and it takes a week.

**Second, identity.** Decide per-user propagation now, wire it through the skeleton, and never build a version that authenticates as itself. This is the decision that is most expensive to revisit.

**Third, the tool boundary.** Even with two tools, establish that tools are narrow, declared, and separately authorized. The pattern is what matters early, not the coverage.

**Fourth, the plan and execution seam.** Structured plans from the start. Retrofitting this into a loop that emits SQL directly means rewriting the loop.

**Fifth, observability.** The per-request record, from the first deployment. Adding it later means the early failures, which are the informative ones, were never captured.

**Sixth, semantics, continuously.** Model the metrics the eval questions use, measure, expand by demand. This never finishes and it should not block the rest.

**Last, breadth.** More tools, more question types, more users. Breadth before the previous six is how a system gets popular and then gets retired.

The pattern in that order: the things that are structurally hard to change come first, and the things that are easy to expand come last. Most struggling agent projects did the reverse, because breadth demos well and structure does not.

## Where this is heading

Three shifts to design for.

**Governance moving into the protocol ecosystem.** The current specification draws a deliberate scope line: it connects applications to tools and leaves identity, observability, and governance outside the core, with most enterprise work expected to land as extensions rather than core changes. Proposals for governance extensions covering what policy was applied at a tool call boundary, and whether a third party can verify it, are active. Expect the gateway pattern people build today to become partly standardized, and design your gateway so its policy logic survives that transition.

**Catalogs becoming agent-aware.** The catalog already holds identity, permissions, table metadata, and freshness. Serving that to agents through a standard interface, with per-user scoping, makes it the natural context and authorization point rather than something each agent integrates with separately. That consolidation is underway and it removes a lot of glue.

**Planning getting cheaper and more structured.** As models improve at emitting structured plans reliably, the plan artifact becomes richer and the case for the plan-execution seam gets stronger rather than weaker. Architectures built around that seam age well.

The thing that will not change is the division of labor. Models will keep getting better at reasoning over the context they are given, and none of that improvement supplies the context, enforces the permissions, records what happened, or bounds the cost. Those are architecture, they are yours, and they are where agent projects succeed or fail.

## Conclusion

A model with a SQL tool is a prototype. The architecture that survives production has six layers and three properties.

The layers: an interface that carries identity, orchestration that separates planning from execution, narrow and separately authorized tools, a semantic layer that compiles concepts into queries, the data platform underneath, and governance and observability cutting across all of it.

The properties are the questions from the top. What is this agent allowed to do, enforced somewhere text cannot reach. Who is asking, propagated from the person through every hop to the data. Why did it answer that, reconstructable from a record you wrote at the time.

The sequencing advice is the practical part. Build the eval set first, decide identity second, establish the tool boundary and the plan seam third and fourth, wire observability before the first real user, and grow the semantic layer continuously. Save breadth for last, because breadth is easy to add and the structural decisions are not.

None of that is about the model, and that is the point. The model is the component you will swap most often and think about least.

## Keep Going

If this piece was useful, I have written a lot more on data architecture and AI. I have a book on AI and labor economics covering how these systems reshape the work around them, available at [https://a.co/d/06SeOKw8](https://a.co/d/06SeOKw8), and *Architecting an Apache Iceberg Lakehouse* covers the platform and semantic layers this architecture sits on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
