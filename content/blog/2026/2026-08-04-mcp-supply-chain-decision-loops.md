---
title: "Moving From Supply Chain Dashboards to Decision Loops With the Model Context Protocol"
date: "2026-08-04"
description: "Moving from supply chain dashboards to decision loops with MCP: sense, decide, act, and verify, with typed action tools, idempotency keys, and graduated human approval."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - AI Agents
  - MCP
  - Supply Chain
  - Decision Loops
  - Apache Iceberg
canonical: "https://iceberglakehouse.com/posts/mcp-supply-chain-decision-loops/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/mcp-supply-chain-decision-loops/).

# Moving From Supply Chain Dashboards to Decision Loops With the Model Context Protocol

*By Alex Merced, Data Lakehouse and AI Evangelist*

A supply chain control tower shows a red tile. A supplier's on-time delivery rate dropped below threshold four days ago. The tile has been red for four days because the planner who owns that category has been in meetings, and the alert email went to a distribution list with two hundred people on it.

By the time someone acts, the safety stock is gone and a line is down. The postmortem concludes that the team needs better visibility, which is the one thing it already had.

The dashboard did its job. It sensed the condition, computed the metric, and rendered it. What it cannot do is decide anything or act. That gap between detection and action is where most of the value in operational analytics leaks away, and it is measured in days across almost every enterprise I have seen.

The Model Context Protocol is what makes closing that gap tractable, and not because agents are smart. It is because MCP gives an agent a standard way to both read from analytical systems and invoke actions in operational ones, through typed tools with schemas, permissions, and audit. That combination is what turns a passive metric into a loop.

This piece is about the engineering of those loops. What the architecture looks like, how to integrate real-time event streams with a lakehouse, where to put human approval, and what the failure modes are when an automated system is allowed to change things in the physical world.

A disclosure. I work for Dremio, which was acquired by SAP and now sits inside SAP Business Data Cloud. Supply chain execution systems are a domain where SAP has deep presence, and I have tried to keep the architecture vendor-neutral because the pattern applies regardless of which ERP sits at the end of it.

## What a decision loop is

A loop has four stages, and each one is a distinct engineering problem.

**Sense.** Detect that a condition of interest has occurred. This is the part dashboards already do, except a dashboard senses only when a human looks at it.

**Decide.** Determine what the condition means and what response fits. This is where the agent contributes, because the mapping from condition to response depends on context that is expensive to encode as rules.

**Act.** Execute the response through a system of record. Create a purchase order, reroute a shipment, adjust a forecast, open a case.

**Verify.** Confirm the action produced the intended effect in the real world, and escalate if it did not. This is the stage everybody skips and the one that determines whether the loop is trustworthy.

These four stages have different latency requirements and different failure semantics, and they fail in different ways. Sensing needs to be fast and can tolerate false positives. Acting needs to be correct and cannot tolerate duplicates. Building all four with the same tooling and the same assumptions is the most common design mistake.

## Why rules engines did not already solve this

Supply chain systems have had automated rules for decades. Reorder point crossed, generate a requisition. Understanding why that did not close the gap explains what agents actually add.

Rules handle conditions that were anticipated. A reorder point is a threshold somebody set. It works when demand is stable and the supply picture is simple.

The conditions that cause real disruption are combinations. A supplier's lead time is drifting upward, a port is congested, a competing product launch moved demand forward, and the alternate supplier has a minimum order quantity that makes the obvious substitution uneconomic. Encoding that as a rule requires anticipating the combination. Nobody does, and the attempt produces a rules estate that nobody dares change.

Agents handle it differently. Rather than matching a pattern, the agent gathers context across sources, reasons about the interaction, and proposes a response with an explanation. The explanation is as valuable as the decision, because it is what lets a human approve or reject quickly.

What agents are bad at is arithmetic consistency and adherence to constraints. That is exactly why the loop needs governed metrics on the read side and constrained tools on the write side. The agent contributes judgment about an unanticipated combination. The infrastructure contributes correctness.

## Streams and tables serve different stages

The sense stage and the decide stage want different data systems, and forcing one to serve both is where architectures get expensive.

Event streams carry the present. A shipment scan, an inventory movement, a supplier acknowledgment. Latency is seconds. The access pattern is a continuous evaluation against a moving window.

The lakehouse carries history and context. Twelve months of supplier performance, seasonal demand patterns, cost structures, contract terms. Latency is seconds to minutes. The access pattern is analytical.

The clean split is that stream processing detects conditions, and the lakehouse provides the context for deciding what they mean.

A stream processor evaluates a condition against recent events and emits a signal when it fires. That signal is a small message: which entity, which condition, when, and the values that triggered it. It is not a decision.

The signal starts an agent invocation. The agent then queries the lakehouse for the context that turns a condition into a judgment. What has this supplier's performance looked like over twelve months. What is the demand forecast for this SKU. What alternates exist and at what cost. Those are analytical questions and they belong on analytical infrastructure.

Iceberg's role here is worth naming precisely. Streaming writers land events into Iceberg tables continuously, and V3 deletion vectors made frequent small updates cheap enough on the read side that the same table serves both the ingest path and the interactive queries the agent issues. Before that, teams maintained a landing table and a separate serving table with a lag between them, which meant the agent reasoned about a stale picture.

Signals themselves belong in an Iceberg table too. That gives you a queryable history of every condition that ever fired, which is what you need to tune thresholds and to answer why a loop did or did not act on a given day.

```sql
CREATE TABLE ops.signals.supply_conditions (
    signal_id        STRING,
    condition_type   STRING,
    entity_type      STRING,
    entity_id        STRING,
    severity         STRING,
    detected_at      TIMESTAMP,
    trigger_values   VARIANT,
    disposition      STRING
)
USING iceberg
PARTITIONED BY (days(detected_at))
TBLPROPERTIES (
    'format-version'      = '3',
    'write.delete.mode'   = 'merge-on-read',
    'write.update.mode'   = 'merge-on-read'
);
```

`trigger_values` as a Variant column holds whatever the condition produced without requiring a schema change every time somebody adds a condition type. Merge-on-read handles the disposition field, which updates as the loop progresses from detected to decided to acted to verified.

## The tool surface for a loop

An agent in a decision loop needs three categories of tool, and the design constraints differ sharply between them.

**Read tools** expose governed metrics and context. These are the tools covered by a semantic layer design: metric discovery, metric queries, dimension exploration. No arbitrary SQL.

**Action tools** invoke operations in systems of record. These are the ones that change the world, and they carry the strictest requirements.

**Escalation tools** hand a decision to a human with the context needed to act on it.

Here is what a well-designed action tool looks like.

```json
{
  "name": "create_replenishment_request",
  "description": "Create a replenishment request for review. Does not place a purchase order. Requires human approval before the request becomes an order.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sku":              { "type": "string" },
      "destination_site": { "type": "string" },
      "quantity":         { "type": "integer", "minimum": 1, "maximum": 5000 },
      "supplier_id":      { "type": "string" },
      "need_by_date":     { "type": "string", "format": "date" },
      "rationale":        { "type": "string", "minLength": 50 },
      "signal_id":        { "type": "string" },
      "idempotency_key":  { "type": "string" }
    },
    "required": ["sku", "destination_site", "quantity", "supplier_id",
                 "rationale", "signal_id", "idempotency_key"]
  }
}
```

Six properties of that schema are doing real work.

**The name and description state the blast radius.** This tool creates a request, not an order. The distinction between proposing and committing should be visible in the tool name itself, because the model reads names and descriptions when choosing.

**Quantity has a maximum.** Bounds in the schema are enforced at the protocol boundary. An agent that reasons its way to ordering fifty thousand units gets rejected rather than executed.

**`rationale` is required with a minimum length.** This forces the agent to articulate its reasoning as part of the call. That text is what a human reads when approving, and it is what an auditor reads later. Making it a required input rather than an optional output means it always exists.

**`signal_id` ties the action to the condition that triggered it.** Every action traces back to a sensed event. Actions that cannot name their trigger are the ones worth investigating.

**`idempotency_key` is mandatory.** Retries happen. Network timeouts leave outcomes ambiguous. Without an idempotency key, a retried call creates a second request, and the physical world ends up with duplicate inventory. This is the single most important field in the schema.

**Nothing is free text except the rationale.** Every operational parameter is typed and validated against a schema, which means the agent cannot construct a call with a malformed date or a site code that does not exist.

## Where the human goes

The autonomy question is the one every stakeholder asks first, and the right answer varies by action rather than by system.

Sort actions along two axes: reversibility and blast radius.

| Action character | Example | Autonomy level |
|---|---|---|
| Reversible, narrow | Adjust a forecast, flag a record for review | Automatic, logged |
| Reversible, wide | Reroute a shipment already in transit | Automatic with notification, easy override |
| Irreversible, narrow | Release a small replenishment within contract terms | Approval by exception, auto-approve under threshold |
| Irreversible, wide | Commit a new supplier, cancel a production run | Explicit human approval, always |

The useful pattern is graduated autonomy with a threshold. Actions below a value or quantity limit execute automatically with notification. Actions above it queue for approval. The threshold starts low and rises as the loop earns trust through measured outcomes.

Two design details make approval workflows work rather than become a bottleneck.

**Approval requests carry the full reasoning and the alternatives considered.** A request that says "order 400 units from supplier B" gets deferred. A request that says the primary supplier's lead time has drifted from 12 to 19 days over six weeks, current stock covers 11 days of forecast demand, supplier B can deliver in 8 days at a 6 percent cost premium, and the alternative of expediting from the primary costs more, gets a decision in thirty seconds.

**Timeouts have defined behavior.** An approval request that nobody answers must do something specific. Escalate to a second approver, expire safely, or execute a conservative default. Leaving it undefined means the loop silently stops, which is the failure mode that returns you to the four-day red tile.

## Verification closes the loop

The stage that separates a real loop from an automation script.

After acting, the loop confirms the intended effect occurred. The supplier acknowledged the order. The shipment rerouted. Inventory rose. Each of those is an observable condition, and each has a time window in which it should appear.

In production, verification failures are more common than action failures, because the action succeeded in your system and something downstream did not happen. An order was created and the supplier never acknowledged it. A reroute was requested and the carrier rejected it silently.

Design verification as its own scheduled check reading the signals table.

```sql
SELECT
    s.signal_id,
    s.entity_id,
    s.detected_at,
    a.action_type,
    a.executed_at,
    a.expected_effect_by
FROM ops.signals.supply_conditions s
JOIN ops.signals.actions a
  ON s.signal_id = a.signal_id
WHERE a.verified_at IS NULL
  AND a.expected_effect_by < current_timestamp
ORDER BY a.expected_effect_by;
```

Anything that query returns is an action that was taken and never confirmed by an observable effect. That list is the operational report the loop's owner reads every morning, and it is far more informative than a dashboard of green tiles.

## A worked loop

Here is one condition traced end to end, with the pieces named.

**The condition.** A stream processor evaluates supplier acknowledgment latency against a rolling window. For supplier 4417, the median time from purchase order to acknowledgment has moved from under four hours to over two days across the last three weeks. The processor emits a signal and writes a row into `ops.signals.supply_conditions` with severity `elevated`.

**The invocation.** A consumer on the signals table starts an agent run with the signal as its opening context. The agent's identity is a dedicated catalog principal named for this loop, holding read grants on the supply domain and access to a defined set of action tools.

**The context gathering.** The agent calls governed read tools in sequence. Supplier performance history over twelve months, sliced by month. Open orders with this supplier and their need-by dates. Stock cover in days for the affected SKUs. Qualified alternate suppliers with lead times and contract terms. Each call returns a small typed result from a validated metric definition, and each one records the as-of timestamp of the underlying data.

**The reasoning.** The agent identifies that three SKUs have stock cover below the supplier's current effective lead time, that one of them feeds a production line with no substitute, and that a qualified alternate can cover the shortfall at a modest premium with a minimum order quantity that fits the demand forecast.

**The action.** For the two lower-risk SKUs, the agent calls `create_replenishment_request` with an idempotency key derived from the signal ID and SKU, and a rationale explaining the lead-time drift and the stock cover math. Both fall under the auto-approve threshold and execute with notification.

For the production-critical SKU, the value exceeds the threshold. The agent calls the escalation tool, which routes an approval request to the category planner with the full reasoning, the alternatives considered, and the cost delta.

**The verification.** A scheduled check confirms that the two auto-approved requests became acknowledged orders within their expected windows. One did. The other did not, and it appears on the unverified actions report the next morning with the elapsed time visible.

**The record.** Every stage wrote a row. The signal, the agent invocation with its full reasoning text, each tool call with parameters and results, each action with its idempotency key, and each verification outcome. Six months later, when someone asks why an order went to a secondary supplier in August, the answer is a query rather than an investigation.

Notice what the agent did and did not do. It did not compute stock cover, since that came from a governed metric. It did not decide the approval threshold, since that is configuration. It did not write SQL. What it did was recognize that a lead-time drift interacted with a specific stock position and a specific production dependency, which is exactly the combination nobody wrote a rule for.

## Instrumenting a loop from day one

The telemetry design deserves the same attention as the loop logic, because it is what lets you tune and defend the system.

Model it as four tables in the lakehouse, joined on identifiers that flow through every stage.

The **signals** table records every condition that fired, whether or not anything came of it. The rows that led to nothing are as valuable as the ones that led to action, since a condition type that fires two hundred times a week and never produces an action is a threshold that needs adjusting.

The **invocations** table records each agent run: which signal started it, which identity ran it, how many tool calls it made, how many tokens it consumed, how long it took, and the full reasoning text. Token consumption per invocation is your cost attribution primitive.

The **actions** table records every action tool call with its parameters, its idempotency key, its outcome, and the timestamp by which the effect should be observable. Include actions that were rejected by schema validation, since a rising rejection rate means the agent is reasoning toward calls that fall outside the bounds you set, and that is worth investigating before you widen the bounds.

The **verifications** table records the observed outcome and the delta between expected and actual. This is where you compute the loop's real success rate rather than its execution success rate.

Two queries run off this schema constantly.

Time from condition to resolved action, by condition type, tells you whether the loop is actually faster than the humans it replaced. If it is not, the loop is adding risk without adding speed.

Override rate by action type, meaning how often a human rejects or modifies what the agent proposed, is the trust metric. Track it weekly. A rising override rate on a previously stable action type means something in the world changed and the loop's context has not caught up.

Both of those are ordinary analytical queries over Iceberg tables, which is a small point with a large implication: the observability layer for your agents is the same lakehouse the agents query. There is no separate system to buy or operate, and the retention and governance properties you already established apply to agent telemetry automatically.

## Failure modes

**Duplicate actions from retries.** The dominant failure in production. Idempotency keys on every action tool, enforced server-side with a persisted key store, not just accepted as an input.

**Oscillation.** The loop acts, the metric moves, the condition fires in the opposite direction, and the loop acts again. Classic control theory problem with classic answers: hysteresis bands so the clear threshold differs from the trigger threshold, and cooldown periods per entity so the same SKU cannot trigger twice in an hour.

**Correlated triggers.** A single upstream event, say a port closure, fires conditions on four hundred SKUs simultaneously. The loop generates four hundred replenishment requests and floods the approval queue, or worse, executes them. Aggregate signals by root cause before invoking the agent, and cap actions per time window globally rather than per entity.

**Stale context.** The agent queries a table whose last commit was six hours ago and reasons about a picture that has changed. Freshness requirements belong in the tool contract, and a read tool should report the data's as-of time so the agent and the auditor both see it.

**Prompt injection through operational data.** A supplier name field containing instruction-shaped text becomes context in the model window. Sanitize and constrain what returns to the model, and never treat retrieved field content as instructions.

**Approval fatigue.** A loop that requests approval for everything trains reviewers to click approve without reading. That is worse than full autonomy because it manufactures the appearance of oversight. Set thresholds so approvals are rare enough to get real attention.

**Silent degradation.** The loop keeps running as conditions change underneath it, and its decisions get gradually worse without any error appearing. Track decision quality as a metric, sampled and reviewed by humans on a schedule.

**Unbounded cost.** Each loop invocation involves model calls and several analytical queries. A condition that fires frequently generates continuous cost. Budget per loop, cap invocations per hour, and alert on volume anomalies.

**Ownership decay.** The engineer who built the loop moves teams, and eighteen months later nobody can explain why a threshold is set where it is. Every loop needs a named business owner separate from its engineering owner, and a documented statement of what it is for that a non-engineer can read.

**Testing only the happy path.** Loops get tested against conditions that fire cleanly. They fail on the ambiguous ones: a signal with missing context, an action tool that times out, a verification window that spans a holiday. Build a fixture set of awkward cases and run the loop against it on every change.

## Operational guidance

Start with a loop that only proposes. Sense, decide, and escalate, with no action tools at all. Run it for weeks and compare its proposals against what the human actually did. That comparison is your evidence for whether the decide stage works, and it costs nothing if the agent is wrong.

Add action tools one at a time, starting with the most reversible. Each addition is a separate change with its own monitoring period.

Give the loop its own identity in the catalog with its own permissions, distinct from every human and from other loops. Short-lived vended credentials rather than a standing key. When something goes wrong, the audit trail should name the specific loop.

Log every stage into Iceberg tables: signals, agent invocations with full reasoning, tool calls with parameters, action outcomes, and verification results. This is not just for compliance. It is the dataset you use to tune thresholds and to prove the loop is working.

Define the kill switch before launch and test it. One flag that stops all action tools while leaving sensing and proposing active. Somebody will need it at 2am and they should not be reading code to find it.

Measure four things: time from condition to action, action success rate, verification failure rate, and the rate at which humans override the agent's proposal. The override rate is the trust metric. Rising override rates mean the loop's context has drifted from reality.

Review the decisions the loop declined to make. A loop that never escalates and never abstains is either operating in an unusually clean domain or failing to recognize its own limits. The second is much more likely.

## Where this goes

Loops composing with other loops is the direction, and it is where the discipline above stops being optional. A replenishment loop whose action changes an input to a demand forecasting loop creates a coupling neither loop's designer intended. Shared metric definitions and shared signal history are what make the interaction inspectable.

The governance conversation is moving with it. Regulatory frameworks around automated decision-making expect an explanation for consequential decisions, which is a strong argument for capturing agent reasoning as structured data at the moment of the decision rather than reconstructing it later.

Standardization on the action side is the missing piece. MCP standardized how an agent reaches a system. There is no equivalent standard for what an action tool should guarantee, and idempotency, reversibility, and blast radius are exactly the properties that deserve one.

## Conclusion

The distance between a dashboard and a decision loop is not intelligence. It is four engineering stages with different requirements, and the ones teams underinvest in are acting safely and verifying afterward.

Split the work by system. Streams sense, the lakehouse provides context, the agent decides, and typed action tools execute inside bounds you set. Put idempotency keys and required rationale on every action tool. Graduate autonomy by reversibility and blast radius rather than turning it on globally. Build verification as a first-class stage, and read its failures every morning.

Start with a loop that only proposes, and let it earn the right to act.

One last framing worth carrying into the design conversation. The dashboard was never the problem. Sensing has been solved for years, and organizations have more detection than they can act on. What was missing was a safe, auditable, standardized way for software to invoke an action in a system of record with bounded parameters and a recorded justification. MCP supplies the standard connection. Typed action tools with idempotency, required rationale, and graduated approval supply the safety. The agent supplies judgment about combinations nobody anticipated. Get those three right and the red tile stops sitting there for four days.

## Keep Going

If this piece was useful, I have written a lot more on agentic architecture and the data platforms underneath it. *Architecting an Apache Iceberg Lakehouse* covers the streaming ingestion and table design these loops depend on, and *Apache Polaris: The Definitive Guide* covers the catalog and identity model that makes per-agent governance possible. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
