---
title: "Guardrails for Analytics Agents That Do More Than Answer Questions"
date: "2026-07-28"
description: "The risk isn't agents going rogue, it's agents acting correctly on bad input at machine speed. Here's how to classify actions by consequence, gate capability, and design approval steps people actually use."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - AI Agents
  - Guardrails
  - Data Governance
  - Human-in-the-Loop
canonical: "https://iceberglakehouse.com/posts/agent-guardrails-human-in-the-loop/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/agent-guardrails-human-in-the-loop/).

# Guardrails for Analytics Agents That Do More Than Answer Questions

An agent monitoring inventory levels notices a stockout risk, drafts a purchase order, and submits it. The logic was sound. The signal it read came from a table that had been double-loaded that morning, so the quantity on hand looked half what it was. The order goes out for 40,000 units of something the warehouse already has.

Nobody wrote a bug. The pipeline had a duplicate load, which happens, and the normal recovery is that someone notices the weird number and asks about it. That step is gone, because the thing reading the number acts on it in 200 milliseconds and does not find numbers weird.

This is the actual risk in agentic analytics, and it is not the risk most guardrail discussions address. The failure is not the agent going rogue. It is the agent being perfectly obedient on top of bad input, with no interval in which a human notices.

I work at Dremio, which builds a lakehouse platform that agents query, so the design problems here land on my desk regularly. Nothing below depends on any particular product.

This piece covers how to classify agent actions by consequence, why prompt-level guardrails fail as a control, how to gate capability rather than behavior, how to design an approval step people actually use, and how to stop runaway execution loops.

## Classify actions by what happens when they are wrong

Every guardrail decision follows from one question: what is the cost of this action being wrong, and how hard is it to undo?

Four categories cover the space.

**Read.** The agent queries data and returns an answer. A wrong read produces a wrong answer, and the cost lands on whoever acts on it. Reads are cheap to retry and leave no residue.

**Reversible write.** The agent writes something inside your own systems that you can undo. Creating a table, writing to a branch, appending to a staging area, updating a draft. A mistake costs cleanup time.

**Irreversible internal write.** The agent changes something in your systems that cannot be cleanly undone. Dropping a table, deleting rows past retention, overwriting a source of record. Recovery means restore from backup, if there is one, and reconciling whatever ran in the meantime.

**External effect.** The agent causes something outside your systems. A purchase order, an email to a customer, a payment, a support ticket, a price change on a live site. These cannot be undone at all. They can only be followed by a correction, which is a different and more expensive thing.

Here is how the categories map to controls.

| Category | Example | Undo cost | Default control |
|---|---|---|---|
| Read | Query gold datasets | None | Grants only |
| Reversible write | Write to a branch, create a draft | Minutes | Grants plus logging |
| Irreversible internal write | Drop table, overwrite partition | Hours to days | Approval required |
| External effect | Send order, email customer, move money | Unrecoverable | Approval plus rate limit plus reconciliation |

Two things about that table matter more than the categories themselves.

The boundary that deserves the most engineering is between reversible and irreversible, not between read and write. Teams instinctively guard "write" as a category, which over-restricts the reversible cases and under-restricts the external ones. An agent writing to an isolated branch is far safer than an agent sending one email.

And the classification belongs to the action, not to the agent. One agent doing both reads and external effects needs the controls of the strictest category it can reach. This is the argument for splitting agents by consequence class rather than by subject area, which I return to later.

## Read-only is not the same as risk-free

The taxonomy puts reads in the lowest control category, and that is correct for the controls. It is not correct as a statement about consequence, and the distinction is worth being precise about.

A read-only agent cannot change anything. It also produces the numbers people change things with. The chain runs: agent produces a wrong figure, a person believes it, the person acts. The agent has no write permission and the money still moves.

That chain has a human in it, which is exactly what everything above is designed to preserve. So the question becomes whether the human in that chain is in a position to catch the error, and often they are not, for a reason worth naming.

People calibrate trust in a source from its observed reliability. An agent that is right 95 percent of the time trains its users to believe it, and that training is rational. The 5 percent then arrives with the full weight of accumulated trust behind it. This is the same dynamic that makes a usually-accurate dashboard more dangerous than a known-flaky one, sharpened by the fact that an agent produces answers to novel questions where the user has no prior to check against.

Three cheap practices address it, and none is a permission.

**Attach provenance to every answer.** Which datasets, which snapshots, what filters. Not as a footnote nobody reads, but as part of the answer. A user who sees the number came from a table that last refreshed nine hours ago has the information they need to be appropriately skeptical.

**Make refusal a first-class outcome.** An agent that answers everything is training its users badly. One that says the data does not support that question, here is what it does support, is teaching users where the edges are. This requires that refusal be built into the tools rather than left to the model's discretion.

**Reconcile a sample against a source of truth.** Take five numbers the agent produced this week and check them against the authoritative report. Do it monthly. This is the practice that reveals whether the 95 percent is actually 95 percent, and teams that assume rather than measure are usually wrong in the optimistic direction.

The reason to treat this seriously in a guardrails article is that most organizations start with a read-only agent, conclude that the risk profile is trivial because nothing can be written, and skip the measurement. Then they add the first acting capability on top of a system whose accuracy nobody ever quantified. The accuracy work belongs at the read-only stage, when it is cheap and nothing is at stake.

## Why telling the model not to do things is not a control

The most common guardrail in production today is a sentence in a system prompt: always ask before taking any action that affects external systems.

That sentence does useful work. It is not a control, and treating it as one produces a specific and predictable failure.

Three reasons.

**Compliance is probabilistic.** The model follows the instruction most of the time. Most of the time is the problem. A control that works 98 percent of the time on an action taken 500 times a month fails ten times a month, and the failures cluster in exactly the unusual situations where the instruction mattered.

**Instructions compete.** A system prompt says ask before acting. A user says this is urgent, just do it. The model resolves the conflict using judgment, and its judgment is influenced by how the request is phrased. That is not a property you want in an authorization decision.

**The instruction is invisible to review.** An auditor cannot verify that a prompt was followed. They can verify that a permission did not exist.

The general principle: prompt instructions shape behavior, and permissions determine capability. Use prompts to make the agent behave well within what it can do. Use permissions to determine what it can do. Do not use prompts to prevent things you actually need prevented.

There is a version of this that is worth keeping. Prompt-level guidance is excellent for quality: use this dataset rather than that one, prefer declining to guessing, explain your reasoning. Those are preferences where a 98 percent success rate is a real improvement over nothing. Save it for that.

## Gate capability, not behavior

The primary control is that the agent does not have the tool.

This sounds obvious and gets violated constantly, because the easy way to build an agent is to give it a broad tool and constrain it with instructions. A tool called `execute_sql` that accepts arbitrary SQL, with a prompt saying only run SELECT statements, is the canonical example. The prompt is the only thing between the agent and a DROP.

The alternative is narrow tools whose parameter schemas make dangerous operations unexpressible.

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("analytics-agent-tools")

# WRONG: capability constrained only by instruction
@mcp.tool()
def execute_sql(sql: str) -> str:
    """Run a SQL query. Only run SELECT statements."""
    return engine.execute(sql)


# RIGHT: capability constrained by the interface
@mcp.tool()
def aggregate_metric(
    metric: str,
    dimensions: list[str],
    start_date: str,
    end_date: str,
    filters: dict | None = None,
) -> str:
    """Compute a defined metric, grouped by dimensions, over a date range.

    Only metrics defined in the semantic layer are available. Call
    list_metrics first to see what exists and which dimensions each
    one supports.
    """
    definition = SEMANTIC_LAYER.get_metric(metric)
    if definition is None:
        return f"Unknown metric: {metric}. Call list_metrics."

    invalid = set(dimensions) - set(definition.dimensions)
    if invalid:
        return f"Metric {metric} cannot be sliced by {sorted(invalid)}."

    sql = definition.build_query(dimensions, start_date, end_date, filters)
    return engine.execute(sql, principal=AGENT_PRINCIPAL)
```

The second tool cannot express a DROP because SQL is not one of its inputs. It cannot read an undefined metric because the semantic layer is the source of what exists. It cannot slice by a dimension the metric does not support because that check runs in code.

This costs you flexibility, and the flexibility is worth less than it appears. An agent that composes arbitrary SQL handles novel questions and produces the fan-out joins, wrong grain, and missing filters that make agentic analytics unreliable. A narrow tool over a well-built semantic layer answers the questions the layer covers, correctly, and declines the rest. Declining is a feature.

Behind the tool sits the second layer: the principal. The agent's data access runs under an identity with grants. Even if a tool has a bug that lets something through, the catalog refuses operations the principal has no grant for. Two independent layers, one in the tool schema and one in the grants, is the shape you want. A single layer is a single point of failure.

For actions with external effects, add a third layer: the downstream system's own authorization. An agent that emails customers should be constrained by the email system's sending permissions and rate limits, not only by your tool. Systems you do not control are exactly where you want defense in depth.

## Designing an approval step people use

For anything irreversible, a human decides. The engineering question is how to present that decision so the human actually makes it rather than approving reflexively.

Approval fatigue is the failure mode, and it is well understood from every other domain that has tried this. A person asked to approve forty things a day approves them in a batch without reading. The approval step then provides no safety and considerable friction, which is the worst combination and eventually gets removed.

Four properties make an approval step work.

**Rarity.** If approvals arrive constantly, tune what triggers them until they do not. An approval queue that gets more than a handful of items a day per reviewer is miscalibrated, and the fix is usually that too broad a category is gated.

**Sufficient context in the request itself.** The reviewer should not need to open three systems. Show what the agent wants to do, why, what data it based the decision on, and what happens if it is wrong. A request that reads "approve action: create_purchase_order" is unreviewable.

```
APPROVAL REQUIRED

Action:     Create purchase order
Vendor:     [vendor]
Quantity:   40,000 units of SKU-8871
Value:      [amount]

Agent reasoning:
  On-hand quantity for SKU-8871 read as 12,400 against a reorder
  point of 25,000. Projected stockout in 6 days at trailing
  14-day consumption.

Data basis:
  gold.inventory.on_hand  snapshot 8891234, written 06:14 UTC
  gold.sales.consumption  snapshot 8891180, written 06:00 UTC

Anomaly checks:
  On-hand for this SKU changed -49% vs the 7-day average.  ⚠
  Consumption rate within normal range.
  Last PO for this SKU: 31 days ago, 18,000 units.

Approve / Reject / Ask agent for more detail
```

That anomaly line is the whole design. The agent read a halved quantity because of a duplicate load, and surfacing the deviation gives the reviewer the one fact that makes the decision easy. Computing that check is straightforward and almost nobody does it, because the instinct is to show what the agent decided rather than what should make you doubt it.

**Real ability to reject.** If rejection has no path forward, reviewers stop rejecting. Give them a way to send it back with a question, and make the agent's response to that question part of the record.

**A default that is safe.** Requests that time out without review are rejected, not approved. Say so in the request so nobody is surprised.

One structural point. Route approvals to the person who owns the consequence, not to whoever operates the agent. A purchase order goes to whoever normally approves purchase orders. That person has the context to spot a wrong number and the standing to say no. An engineer on the agent team has neither.

## Choosing what triggers an escalation

Gating a whole category is the blunt version. Finer triggers keep the approval volume low enough that reviews stay real.

Useful triggers, roughly in order of how much they earn their place.

**Value thresholds.** Actions above a monetary or volume bound. Simple, understandable, and set by whoever owns the risk rather than by engineering.

**Deviation from the agent's own history.** An action three standard deviations from what this agent typically does. A purchase agent that normally orders 15,000 to 20,000 units and suddenly wants 40,000 is worth a look regardless of whether that crosses a fixed threshold.

**Input anomaly.** The one from the example. A signal the agent relied on has moved sharply against its recent distribution. This catches the data quality class of failure, which is the most common cause of confidently wrong action.

**Data freshness violation.** The agent acted on a table that has not refreshed on schedule. Stale input plus autonomous action is a reliable way to produce a decision based on last week's world.

**Novelty.** The agent is taking an action type it has not taken before, or acting on an entity it has not touched before. First-time actions deserve a look on general principle.

**Cumulative rate.** Not this action, but the tenth action in an hour. Individually fine, collectively a runaway.

Implement these as checks the orchestration runs, not as things the model evaluates about itself. A model asked whether its own action is anomalous will sometimes say no because it has already convinced itself. The check belongs outside the reasoning loop.

```python
def requires_approval(action, agent_history, data_context) -> tuple[bool, list[str]]:
    """Return whether to escalate and the reasons. Runs outside the model."""
    reasons = []

    if action.value > THRESHOLDS[action.type]:
        reasons.append(f"value {action.value} above threshold")

    if agent_history.zscore(action.type, action.magnitude) > 3.0:
        reasons.append("magnitude unusual for this agent")

    for source in data_context.sources:
        if source.staleness_seconds > FRESHNESS_SLA[source.table]:
            reasons.append(f"{source.table} stale by {source.staleness_seconds}s")
        if abs(source.pct_change_vs_baseline) > 0.25:
            reasons.append(
                f"{source.table}.{source.column} moved "
                f"{source.pct_change_vs_baseline:+.0%} vs 7-day average"
            )

    if not agent_history.has_taken(action.type):
        reasons.append("first time taking this action type")

    if agent_history.count_in_window(hours=1) > RATE_LIMITS[action.type]:
        reasons.append("action rate above limit")

    return bool(reasons), reasons
```

The function returns reasons, not just a boolean, and those reasons go into the approval request. A reviewer who knows why they are being asked reviews better than one who only knows that they are.

## Staged execution for data changes

For actions inside the lakehouse rather than outside it, there is a pattern better than approval: let the agent do the work somewhere isolated, validate it, and promote.

Iceberg branches make this straightforward. The agent writes to its own branch, checks run against that branch, and a merge happens on success.

```sql
-- The agent works on an isolated branch
ALTER TABLE catalog.sales.orders
  CREATE BRANCH agent_correction_8871
  RETAIN 7 DAYS;

-- Agent applies its changes there. Readers on main see nothing.
UPDATE catalog.sales.orders.branch_agent_correction_8871
SET region_id = 4
WHERE order_id IN (SELECT order_id FROM staging.misrouted_orders);

-- Validation runs against the branch, not against production
SELECT
    (SELECT count(*) FROM catalog.sales.orders
       VERSION AS OF 'agent_correction_8871')          AS branch_rows,
    (SELECT count(*) FROM catalog.sales.orders
       VERSION AS OF 'main')                           AS main_rows,
    (SELECT count(*) FROM catalog.sales.orders
       VERSION AS OF 'agent_correction_8871'
     WHERE region_id NOT IN (SELECT region_id FROM ref.regions)) AS orphan_region;

-- Promote only after checks pass
CALL catalog.system.fast_forward(
  table  => 'sales.orders',
  branch => 'main',
  to     => 'agent_correction_8871'
);
```

Three properties make this better than an approval gate for this class of work.

The validation is automated and objective. Row counts match, no orphan foreign keys, no negative values where negatives are impossible. A machine checks these more reliably than a person reading a summary.

The blast radius during the work is zero. Readers on main are unaffected no matter what the agent does on its branch. A wrong change costs a discarded branch.

The human review, if you want one, happens against a real result rather than a proposal. A reviewer looking at "here is the branch, here are the validation results, here is a diff of what changed" makes a much better decision than one looking at "the agent proposes to update some rows."

Use approval gates for actions leaving your systems. Use staged execution for changes inside them. The two patterns cover different territory and teams often apply the wrong one.

## Separate the agent that decides from the agent that acts

Once an agent has both analytical reach and the ability to cause effects, controls get awkward. Everything it can reach falls under the strictest control class it can invoke, so either the reads get over-governed or the actions get under-governed.

Splitting the roles resolves it.

**The analyst agent** reads broadly. Wide access to gold datasets, generous step budgets, no approval overhead, because nothing it does is irreversible. Its output is a recommendation with reasoning and data basis attached. It has no tools that cause effects.

**The operator agent** takes actions. A narrow tool surface, one action type or a few closely related ones, tight bounds, and approval gates on anything irreversible. It has minimal analytical reach, because it does not need to explore. It receives a structured proposal and executes it.

The handoff between them is an explicit artifact rather than a conversation. A structured proposal object with the action, its parameters, the reasoning, and the data basis. That artifact is the thing a human reviews, the thing that gets logged, and the thing the operator agent validates before acting.

Four benefits fall out.

**Control surfaces get proportionate.** The analyst agent's broad access carries no action risk. The operator agent's action capability comes with a tiny reach. Neither one has the combination that makes governance hard.

**The proposal is reviewable in isolation.** A human reviewing a structured proposal sees the whole decision. A human reviewing a conversational agent session has to read a transcript and infer.

**Failures are attributable.** A wrong action traces either to a bad proposal, which is an analysis problem, or a bad execution, which is an operations problem. When both live in one agent, every failure investigation starts by untangling which half went wrong.

**The operator agent is testable.** With a fixed input shape and a small action surface, you can write real tests: valid proposals execute correctly, malformed ones are rejected, out-of-bounds values are refused. Testing a general-purpose agent's behavior is much harder.

The cost is a handoff, which adds latency and a place for things to be dropped. For anything with external effects, that trade is easy. For reversible internal changes it is often not worth the machinery, and a single agent with staged execution is simpler.

A related pattern worth knowing: the operator agent does not have to be an agent. Once the proposal is structured, executing it is ordinary code. If the action has no judgment in it past validation, write a function. Teams reach for a second model where a deterministic executor is both safer and cheaper, largely because the framing of the problem suggested agents throughout.

## Stopping runaway loops

An agent that retries produces the most expensive failures, and the mechanism is always the same: an action fails, the agent adjusts and retries, the adjustment does not address the cause, and the loop runs until something external stops it.

Four bounds, all enforced outside the model.

**Step budget per session.** A hard maximum on tool calls. When it trips, the session ends and reports what it accomplished. Set it from observed distributions with headroom, so an agent that normally uses 4 to 30 calls gets a budget of 50.

**Repeat detection.** Track a hash of each tool call and its arguments. The same call three times in a session means the agent is stuck, and the right response is to stop and report rather than to keep paying for it.

**Wall-clock and spend ceilings.** A session that has run twelve minutes or consumed a set token budget stops. Money is the bound people forget, and it is the one finance notices.

**Failure-streak breaker.** Consecutive tool errors past a small threshold stop the session. An agent that has failed five calls in a row is not one call away from success.

```python
class ExecutionBounds:
    """Bounds enforced by the orchestrator, outside the model's reasoning."""

    def __init__(self, max_steps=50, max_seconds=720,
                 max_repeats=3, max_consecutive_errors=5):
        self.max_steps = max_steps
        self.max_seconds = max_seconds
        self.max_repeats = max_repeats
        self.max_consecutive_errors = max_consecutive_errors
        self.steps = 0
        self.started = time.monotonic()
        self.call_counts = {}
        self.consecutive_errors = 0

    def check(self, tool_name, arguments) -> str | None:
        """Return a stop reason, or None to proceed."""
        self.steps += 1
        if self.steps > self.max_steps:
            return f"step budget exhausted ({self.max_steps})"

        if time.monotonic() - self.started > self.max_seconds:
            return f"time budget exhausted ({self.max_seconds}s)"

        key = (tool_name, json.dumps(arguments, sort_keys=True))
        self.call_counts[key] = self.call_counts.get(key, 0) + 1
        if self.call_counts[key] > self.max_repeats:
            return f"repeated identical call to {tool_name}"

        if self.consecutive_errors >= self.max_consecutive_errors:
            return "consecutive tool failures"
        return None

    def record_result(self, errored: bool) -> None:
        self.consecutive_errors = self.consecutive_errors + 1 if errored else 0
```

When a bound trips, stopping cleanly matters. Report what was accomplished, what was attempted, and why it stopped. An agent that dies silently at its step budget looks identical to one that crashed, and the operator learns nothing.

One point specific to lakehouse workloads. Retries interact badly across layers. An agent retries a failed write, the engine retries the commit, the catalog client retries the HTTP call. Three retry layers multiply into nine attempts for one logical operation, and under contention that pattern turns a busy table into an unavailable one. Turn retries off at the outer layers and let the layer that understands the semantics handle it.

## Failure modes

**Approval fatigue.** The queue is long, reviewers approve in batches without reading, and the control provides friction with no safety. Warning sign: median time between an approval request and its approval measured in seconds. Fix: tighten triggers until volume drops, and measure that latency as a health metric.

**The urgent override.** Somebody adds a bypass for time-critical cases. It gets used for everything within a quarter. Warning sign: a bypass path exists at all. Fix: if some actions genuinely cannot wait for approval, make those actions reversible instead of making the approval optional.

**Approval routed to the wrong person.** Requests go to the agent's engineering team because they built it. They lack the domain context to evaluate a purchase quantity. Warning sign: approvers who cannot explain what makes a request unusual. Fix: route by consequence ownership.

**Guardrails only in the prompt.** Somebody reads the prompt, sees the constraints, and considers the system controlled. Warning sign: nobody can name the grant that prevents the dangerous action. Fix: for every dangerous action, be able to state the permission that makes it impossible.

**One agent spanning consequence classes.** An agent that answers questions and also sends emails gets the strictest controls applied to everything, or the loosest applied to everything. Either is bad. Warning sign: an agent whose tool list mixes read tools and external-effect tools. Fix: split by consequence class, with the read agent handing off to the acting agent through an explicit step.

**Validation checks written by the same person who built the agent.** They test what the builder thought about and miss what they did not. Warning sign: validation suites that always pass. Fix: have someone from the domain write the checks, phrased as what must never be true.

**Silent bound exhaustion.** The agent hits its step budget, returns a partial answer, and nobody notices it was truncated. The user treats an incomplete answer as complete. Warning sign: no metric on bound-trip frequency. Fix: report truncation to the user explicitly, and alert when trip rate rises.

**Anomaly checks against a baseline the agent influences.** If the baseline is computed from recent history and the agent's own actions shape that history, a drift the agent causes becomes normal to the check. Warning sign: anomaly triggers that stop firing over time. Fix: compute baselines from a period or a source the agent does not affect.

## After a bad action

Controls reduce frequency and do not reach zero. The response plan matters as much as the prevention, and it is the part nobody writes down until they need it.

**Stop the class, not the instance.** The first move on discovering a bad action is to disable the capability, not to fix the single case. If an agent sent one wrong purchase order, the assumption is that it will send another before you understand why. Revoke the grant. Restore it after diagnosis, not before.

**Establish scope from telemetry.** How many actions of this type, over what window, on what data. This is the question that determines whether you have an incident or an anomaly, and answering it requires that you logged tool calls with their arguments. Teams without that logging spend the first day of the incident reconstructing what happened instead of fixing it.

**Trace to the input, not to the model.** The instinct is to examine the agent's reasoning. Look at the data first. In my experience the large majority of bad autonomous actions trace to an input problem: a duplicate load, a stale table, a schema change that shifted a column's meaning, a filter that no longer matches an enumerated value that gained a new member. The reasoning was fine on the input it received.

**Fix in three places.** The input problem, because that is the cause. The check that should have caught it, because the anomaly detection missed a shape it should cover. And the blast radius, because whatever let one bad action become forty is a bounding problem independent of the trigger.

That third one gets skipped and it is the most valuable. An incident where one wrong order went out is annoying. The same trigger producing forty is a bounding failure, and fixing the trigger without fixing the bound leaves you exposed to the next unrelated trigger.

**Write the check as a test.** Whatever condition should have stopped this becomes an automated check that runs against the agent in a test environment. Incidents that do not produce tests recur.

**Tell the affected people.** If an agent sent wrong information to customers or wrong orders to vendors, the correction is a human process and it starts immediately. Nothing technical here, and it is the part that determines whether the organization keeps trusting the program.

One process note that matters more than it sounds. Treat agent incidents with the same review process as any other production incident: a written timeline, a stated cause, action items with owners. The temptation is to treat them as a novelty, discussed informally and remembered as "the time the agent did that weird thing." That produces no organizational learning, and it produces a second incident that surprises everyone equally.

## Operational guidance

**Write down the action inventory before building controls.** Every action the agent can take, its consequence class, its undo cost, and who owns the consequence. This document takes an afternoon and determines every control decision that follows. Teams that skip it end up guarding by intuition.

**Set thresholds with the consequence owner, in their units.** Finance sets the monetary threshold. Operations sets the volume threshold. Engineering implements. Thresholds set by engineers are set to whatever seems reasonable, which is not the same as what the business tolerates.

**Log every approval decision alongside the action.** Who approved, when, what they saw, what they decided. An approval that is not recorded did not happen as far as any later review is concerned, and the reviewer's view of the request matters as much as their answer.

**Run a drill.** Feed the agent deliberately bad data in a test environment and see whether the controls catch it. Duplicate a load, stale a table, spike a value, add a new enumerated status the filters do not cover. Most teams discover their anomaly checks do not fire on the shapes that actually occur, and finding that out in a drill costs an afternoon.

**Review triggered escalations monthly.** Both the ones that fired and the actions that proceeded without firing. The second set is where you find the trigger you should have had.

**Start with everything gated, then loosen.** Beginning restrictive and relaxing based on evidence is safer than beginning permissive and tightening after an incident. The loosening conversations are also easier, because they come with data about what the agent actually did.

**Give the agent a way to express uncertainty.** A tool that lets it flag "I am not confident about this" and route to a human is cheap and catches a real category. Models are imperfectly calibrated and not useless at it, and a flagged action is better than a confident wrong one.

**Reconcile external effects daily.** For anything leaving your systems, compare what the agent believes it did against what the downstream system records. Divergence indicates a failed action the agent thinks succeeded, or a duplicate. Both are worth catching within a day rather than within a billing cycle, and the reconciliation is a small scheduled job rather than a project.

**Give every action an idempotency key.** Generate it from the decision rather than from the attempt, so a retried action carries the same key and the downstream system rejects the duplicate. This single practice eliminates the most common way one bad moment becomes forty bad outcomes.

## Getting the first controls in place

The action inventory is the starting point, and here is what a first pass looks like on a real system rather than in the abstract.

**Sit down with the tool list.** Every tool the agent has. For each one, answer three questions in writing: what is the worst outcome if this runs with wrong arguments, how do we undo it, and who owns that consequence. This takes about an hour for a typical agent and produces more clarity than any amount of architecture discussion.

**Sort by undo cost, not by how the tool feels.** Teams consistently misjudge here. A tool named `update_record` sounds dangerous and often writes to a staging area with full history. A tool named `notify_team` sounds harmless and sends messages to people who then act. Sort on the answer to question two, not on the verb in the name.

**Draw the line.** Everything above your undo-cost threshold gets an approval gate or gets removed from this agent. Everything below runs freely with logging. Resist a middle tier on the first pass, because a three-tier scheme with fuzzy boundaries produces more argument than safety.

**Verify each gate is a permission.** For every gated action, find the grant or the tool schema that makes the ungated path impossible. If the only thing stopping it is a sentence in the prompt, that item is not done. This step catches most of what the earlier steps miss.

**Set the bounds.** Step budget, time budget, spend ceiling, repeat detection. Use observed distributions with headroom rather than round numbers pulled from nowhere. If you have no observations yet, instrument first and set bounds after a week of data.

**Then ship, and watch the escalation rate for a month.** Too many escalations means triggers are miscalibrated and reviews will decay into rubber-stamping. Zero escalations over a month usually means the triggers do not fire on real conditions, which is worth verifying with a deliberate test rather than accepting as good news.

The whole exercise is a day of work spread over a couple of weeks. The reason it gets skipped is that it produces no demo. The reason to do it anyway is that the alternative is discovering your control model during an incident, in front of people who are asking why nobody thought about this beforehand.

## Where this is heading

Three developments worth tracking.

Policy engines that sit between agent and action are becoming standard infrastructure rather than hand-rolled code. Apache Polaris has a policy framework with an operation for querying which policies apply to an object, and Polaris 1.5.0 added a pluggable authorizer interface with Apache Ranger joining Open Policy Agent as an external authorizer. That direction, where authorization decisions are externalized to a system built for them, is the right one. An agent that queries applicable policy before acting is not itself a control, since a model that reads a policy can ignore it. As a layer above grants that do enforce, it adds real signal to the record.

Approval interfaces are still primitive. Most implementations are a Slack message with approve and reject buttons. The example earlier in this article, with data basis and anomaly checks inline, is not hard to build and is rare. Expect this to become a product category, because the quality of the decision depends almost entirely on the quality of the presentation.

The harder open problem is agents that coordinate. Guardrails on one agent taking one action are tractable. An agent that invokes another agent, which invokes a third, produces a chain where no single step crosses a threshold and the aggregate does. Bounding a call graph rather than a call is genuinely unsolved, and it is where I expect the next class of expensive surprises.

## Conclusion

The risk in agentic analytics is not a model deciding to do harm. It is a model acting correctly on bad input at a speed that removes the interval where a person notices something is off.

Design from consequence. Classify every action by how hard it is to undo, and put the engineering at the boundary between reversible and irreversible rather than between read and write. Prompt instructions shape quality and do not control capability, so use grants and narrow tool schemas for anything you actually need prevented.

For actions inside your lakehouse, prefer staged execution over approval. Let the agent work on a branch, validate objectively, and promote. For actions leaving your systems, gate on approval, and design the request so the reviewer sees the anomaly rather than only the conclusion. Keep the volume low enough that reviews stay real.

Bound execution outside the model: steps, time, spend, repeats, consecutive failures. Report clearly when a bound trips.

The whole thing reduces to one habit. For every action your agent can take, be able to name the mechanism that stops it from being wrong, and check that the mechanism is a permission or a check rather than a sentence in a prompt.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and governance. *Apache Polaris: The Definitive Guide*, which I co-authored for O'Reilly, covers the access control model that most of these controls sit on. *Architecting an Apache Iceberg Lakehouse* from Manning covers branching, validation, and staged promotion patterns as platform design. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
