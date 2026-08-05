---
title: "Wiring Analytical Queries to Transactional APIs in Closed-Loop Decision Agents"
date: "2026-08-04"
description: "Wiring analytical queries to transactional APIs in closed-loop decision agents: conditional writes, sagas with compensations, decision records, and blast radius controls."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - AI Agents
  - Decision Loops
  - Saga Pattern
  - Idempotency
  - Apache Iceberg
canonical: "https://iceberglakehouse.com/posts/closed-loop-decision-agents/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/closed-loop-decision-agents/).

# Wiring Analytical Queries to Transactional APIs in Closed-Loop Decision Agents

*By Alex Merced, Data Lakehouse and AI Evangelist*

An agent reads a table, decides something, and calls an API that changes the world. That sentence contains a distributed systems problem that most teams discover in production.

The table it read is eventually consistent, reflects a state that was true some minutes ago, and offers no locks. The API it called is strongly consistent, has side effects, and offers no rollback. Between the read and the write sits a window in which the world changed, and the agent has no way to know.

Traditional analytics never had this problem, because analytics ended at a chart. The report was correct or it was not, and either way it did nothing. The human who read the chart provided the bridge, and humans are good at noticing that something has shifted since the report ran. Closing the loop removes that bridge and replaces it with software that will act on a six-minute-old picture with complete confidence.

This piece is about the engineering at that boundary. Not the agent's reasoning, and not the semantic layer that feeds it, both of which I have written about elsewhere. Specifically: how to connect a read side that is analytical to a write side that is transactional, without producing duplicate actions, unrecoverable states, or an audit trail that cannot answer why.

A disclosure. I work for Dremio, which was acquired by SAP and now sits within SAP Business Data Cloud. The systems of record on the write side of these loops are frequently ERP and operational platforms, an area where SAP is deeply present. The patterns below are vendor-neutral because the problem is.

## Two systems with opposite properties

Laying the mismatch out explicitly is worth the space, because most integration bugs trace directly to one row of this table.

| Property | Analytical read side | Transactional write side |
|---|---|---|
| Consistency | Eventually consistent, snapshot-based | Strongly consistent |
| Freshness | Seconds to hours behind | Current by definition |
| Concurrency control | Optimistic, snapshot isolation | Locks, serializable transactions |
| Failure semantics | Retry freely, reads are pure | Retry is dangerous, writes have effects |
| Granularity | Aggregates over many rows | Single entity operations |
| Rollback | Time travel to a prior snapshot | Compensating action, if one exists |
| Latency tolerance | Seconds acceptable | Milliseconds expected |
| Scale | Millions of rows per query | One entity per call |

Read that as a list of impedance mismatches to design around rather than as background. The most consequential are failure semantics and rollback, because those are where a naive implementation produces damage rather than an error message.

## The read-decide-write race

The core hazard. An agent queries a table, spends time reasoning, and then acts. Between the query and the action, the underlying state changed.

Concretely: the agent reads that an account has no open credit hold, decides to release a shipment, and calls the release API. In the intervening ninety seconds, a credit analyst placed a hold. The API accepts the release because it does not know about the analyst's action either, or it rejects it with an error the agent was not designed to handle.

Databases solve this with transactions. You cannot use one here, because the read happened in an analytical system and the write happens in a different system with a different transaction manager. There is no shared transaction to enroll in.

Three mitigations work, and they compose.

**Conditional writes.** The action tool carries the state the decision was based on, and the write side rejects if that state no longer holds. This is optimistic concurrency control applied across a system boundary, and it is the strongest available guarantee.

```json
{
  "name": "release_shipment_hold",
  "inputSchema": {
    "type": "object",
    "properties": {
      "shipment_id":      { "type": "string" },
      "expected_status":  { "type": "string", "enum": ["on_hold"] },
      "expected_version": { "type": "integer" },
      "rationale":        { "type": "string", "minLength": 50 },
      "decision_id":      { "type": "string" },
      "idempotency_key":  { "type": "string" }
    },
    "required": ["shipment_id", "expected_status", "expected_version",
                 "rationale", "decision_id", "idempotency_key"]
  }
}
```

`expected_version` is the field doing the work. The write side compares it to current state and rejects on mismatch. The agent receives a specific conflict error rather than a success it should not have gotten.

Not every operational API supports this. Where it does not, ask for it, because it is the single highest-value change an operational team can make for agentic consumers.

**Fresh verification before acting.** Where conditional writes are unavailable, re-read the specific entity from the transactional system immediately before the call, rather than relying on the analytical read. This narrows the window rather than closing it, and narrowing is often enough.

The design rule here is worth stating on its own: use analytical data to decide, and transactional data to confirm. The lakehouse tells you which shipment is worth acting on across a population of thousands. The operational system tells you whether this specific shipment is still in the state you think it is.

**Bounded decision latency.** Put a deadline on the loop. If the reasoning takes longer than the freshness window the decision assumed, abandon and re-run rather than acting on stale context. This costs a wasted invocation and prevents a wrong action.

## No distributed transaction, so design compensations

A loop that touches two systems cannot get atomicity. Accept it and design for partial completion instead.

The pattern is a saga: a sequence of local transactions, each with a defined compensating action that semantically undoes it. If step three fails, you run the compensations for steps two and one in reverse order.

Compensating actions are not rollbacks. A rollback restores prior state. A compensation performs a new operation that offsets the effect. Cancelling an order is not the same as the order never existing, and if a notification email went out, no compensation retrieves it.

That distinction drives a design rule: order the steps so that the irreversible one comes last. If a loop creates an internal record, reserves inventory, and notifies a supplier, do them in that order. Failure at any point leaves only reversible work to compensate.

Write compensations as first-class tools with the same rigor as forward actions.

```python
STEPS = [
    Step(
        name="create_replenishment_request",
        forward=lambda ctx: ops.create_request(
            sku=ctx.sku, qty=ctx.qty,
            idempotency_key=f"{ctx.decision_id}:req"),
        compensate=lambda ctx, res: ops.cancel_request(
            request_id=res.request_id,
            reason=f"compensating for decision {ctx.decision_id}",
            idempotency_key=f"{ctx.decision_id}:req:comp"),
        reversible=True,
    ),
    Step(
        name="reserve_inventory",
        forward=lambda ctx: wms.reserve(
            sku=ctx.sku, qty=ctx.qty, site=ctx.site,
            idempotency_key=f"{ctx.decision_id}:res"),
        compensate=lambda ctx, res: wms.release_reservation(
            reservation_id=res.reservation_id,
            idempotency_key=f"{ctx.decision_id}:res:comp"),
        reversible=True,
    ),
    Step(
        name="notify_supplier",
        forward=lambda ctx: edi.send_forecast_update(
            supplier=ctx.supplier, sku=ctx.sku, qty=ctx.qty,
            idempotency_key=f"{ctx.decision_id}:edi"),
        compensate=None,
        reversible=False,
    ),
]
```

Three things in that structure matter.

**Every call carries an idempotency key derived from the decision ID.** Retries are safe at every step, forward and compensating. Without this, a compensation that times out and retries cancels twice.

**Compensations have their own idempotency keys.** The compensation is itself an operation that can be retried, and it needs the same protection.

**`reversible=False` is explicit.** The executor knows which steps cannot be undone and refuses to place an irreversible step before a reversible one. That constraint is checkable at definition time rather than discovered at 3am.

Persist saga state durably after each step. A loop that crashes mid-saga must resume or compensate on restart, and it can only do that if the completed steps are durably recorded outside the process.

## The decision record

The artifact that makes everything else possible, and the one most implementations bolt on afterward.

A decision record captures, at the moment of decision, everything needed to explain it later. Not a log line. A structured row.

```sql
CREATE TABLE ops.agents.decisions (
    decision_id        STRING,
    loop_name          STRING,
    principal          STRING,
    triggered_by       STRING,
    started_at         TIMESTAMP,
    completed_at       TIMESTAMP,

    inputs_snapshot    VARIANT,   -- metrics read, with as-of timestamps
    context_versions   VARIANT,   -- metric contract versions used
    reasoning          STRING,    -- the agent's articulated rationale
    alternatives       VARIANT,   -- options considered and why rejected
    chosen_action      STRING,
    action_parameters  VARIANT,

    approval_required  BOOLEAN,
    approved_by        STRING,
    approved_at        TIMESTAMP,

    outcome            STRING,    -- executed, compensated, rejected, expired
    saga_state         VARIANT,
    model_id           STRING,
    tokens_consumed    BIGINT
)
USING iceberg
PARTITIONED BY (days(started_at))
TBLPROPERTIES (
    'format-version'    = '3',
    'write.update.mode' = 'merge-on-read'
);
```

Four fields carry more weight than the rest.

**`inputs_snapshot` with as-of timestamps.** Six months later, the question is not what the data says now. It is what the agent saw. Without the snapshot, you cannot distinguish a bad decision from a good decision on stale data, and those require completely different fixes.

**`context_versions`.** Which version of each metric contract produced the numbers. A metric redefined in the interim makes an old decision look wrong when it was correct under the definition in force.

**`alternatives`.** What the agent considered and rejected. This is what a reviewer reads to judge quality, and what a regulator asks for when an automated decision is challenged.

**`model_id`.** Which model produced the reasoning. When behavior shifts after a model upgrade, this is the column that lets you find out.

Storing this in Iceberg is the natural choice. It is queryable with the same engines and governed by the same catalog as everything else, so the observability layer for your agents requires no separate system. Merge-on-read handles the outcome and saga fields, which update as the decision progresses, and V3 deletion vectors make those frequent small updates cheap on the read side.

The immutability question comes up in regulated contexts. Iceberg gives you snapshot history and time travel, so an auditor can query the table as of any past moment and see what it contained. Combine that with catalog-level write restrictions and the record is tamper-evident even though the table is technically mutable.

## Blast radius controls

The loop will be wrong sometimes. The design question is how much it costs when it is.

**Circuit breakers.** Track the failure rate of actions and of verifications. Above a threshold, stop acting and switch to proposal-only mode automatically. A loop whose last twenty actions all failed verification should not attempt a twenty-first.

**Rate limits per entity and globally.** Per entity prevents oscillation on one record. Globally prevents a correlated trigger, where one upstream event fires conditions across thousands of entities, from turning into thousands of actions.

**Value caps.** Cumulative value acted upon per hour, per day, per loop. Cheap to implement, and it converts a catastrophic failure into an expensive one.

**Canary scope.** Launch a loop against one region, one product category, or one percent of entities. Expand on measured outcomes. The temptation to skip this is strong because the logic is identical at any scope, and the failure modes are not.

**A tested kill switch.** One flag that disables action tools while leaving sensing and reasoning active, so you keep the telemetry while stopping the damage. Test it in production on a schedule. An untested kill switch is a comment.

## Testing a closed-loop system

Testing is harder here than in ordinary software, because the agent's reasoning is not deterministic and the write side has effects.

Four layers work.

**Contract tests on action tools.** Schema validation, idempotency behavior under retry, conditional write rejection on version mismatch, and compensation correctness. These are deterministic and belong in ordinary CI.

**Saga tests with injected failure.** Run the saga with each step forced to fail in turn, and assert that compensations run in reverse order and leave a consistent state. This catches the ordering bug where an irreversible step precedes a reversible one.

**Replay tests against recorded decisions.** Take real decision records, replay the inputs through the current agent configuration, and compare the chosen action to the recorded one. Divergence is not automatically a failure, since the agent has sometimes improved, and it always warrants a human look. This is the test that catches regressions after a model or prompt change.

**Shadow mode in production.** Run the full loop against live conditions with action tools disabled, and record the action it selected. Compare to what humans did. This is the strongest evidence available before granting autonomy, and it costs only compute.

Shadow mode deserves emphasis because teams skip it under schedule pressure and it is the cheapest possible risk reduction. A month of shadow data answers the autonomy question with evidence instead of argument.

## A worked architecture

Here is how the components fit, named concretely enough to build from.

**The trigger service** reads a signal source and starts loop invocations. It enforces the global rate limit and the per-entity cooldown before an agent run begins, because the cheapest way to prevent a correlated-trigger flood is to never start the invocations.

**The agent runtime** holds the model, the prompt, and the MCP client. It has no credentials of its own beyond a catalog principal. Everything it reaches, it reaches through tools.

**The read server** exposes governed metric tools over the lakehouse. Discovery, description, and parameterized execution, with no arbitrary SQL. Every response carries the as-of timestamp of the underlying data and the contract version that produced the value.

**The action server** exposes forward and compensating tools over operational APIs. It owns idempotency key persistence, conditional write construction, and translation between the typed tool schema and whatever the downstream API actually accepts. Keeping this translation in one place matters, because operational APIs are inconsistent and you do not want that inconsistency reaching the agent.

**The saga executor** sits between the agent and the action server. The agent selects an action. The executor runs the step sequence, persists state after each step, and handles compensation on failure. Separating this from the agent is deliberate: saga execution is deterministic control flow, and putting it inside the model's loop makes it non-deterministic for no benefit.

**The decision store** is the Iceberg table described above, written before the action and updated as the saga progresses.

**The verification worker** runs on a schedule, reads decisions whose expected effect window has elapsed without confirmation, and either confirms them against the operational system or escalates.

The property worth noticing in that decomposition is how little of it is the agent. One component holds the model. Six others are ordinary distributed systems engineering with well-understood patterns. That ratio matches my experience of building these: the reasoning works far sooner than the plumbing does, and teams that assume the opposite underestimate the project by a wide margin.

## Where the analytical read side helps rather than hurts

The framing so far has treated the analytical side as a liability to manage. It is also the reason these loops are worth building, and the advantages are specific.

**Population-level selection.** A transactional system answers questions about one entity efficiently and about ten thousand entities badly. The lakehouse does the opposite. A loop that asks which of forty thousand shipments deserve attention today can only ask that analytically. Then it verifies the handful it selected transactionally. That split plays to both systems.

**History as context.** The decision quality difference between an agent that sees a supplier's current lead time and one that sees eighteen months of lead time distribution is large. Operational systems keep the present. The lakehouse keeps the past, and the past is most of what makes a judgment good.

**Cross-domain joins.** Deciding well usually requires combining data that lives in separate operational systems. Doing that join in the operational tier means federated queries against systems that were not built for it. Doing it in the lakehouse is what the lakehouse is for.

**Cheap counterfactuals.** Time travel lets you re-run a decision against data as of last Tuesday. That is how replay testing works, and it exists because Iceberg keeps snapshots rather than because anyone designed it for agents.

**Telemetry in the same place as the data.** Decision records are Iceberg tables queried by the same engines with the same governance. The loop's observability requires no additional platform.

The design principle that falls out of this: decide analytically, verify transactionally, act transactionally, record analytically. Each stage runs where it is strongest, and the seams between them are exactly the places that need the engineering described in this piece.

## Failure modes

**Retry storms after a transient outage.** The write side goes down, the loop retries, the queue backs up, and when the write side returns it receives a flood. Exponential backoff with jitter, plus a cap on queued actions, plus idempotency keys so the flood is at worst redundant rather than destructive.

**Compensations that fail.** The forward action succeeded, the loop decided to compensate, and the compensation errored. This leaves an inconsistent state that no automation resolves. Every compensation failure must page a human immediately with the full saga state. This is the one alert that should never be batched.

**Ambiguous timeouts.** A call times out and the outcome is unknown. Do not retry blindly and do not assume failure. Query the write side by idempotency key to determine what actually happened, then proceed. This requires the write side to support lookup by key, which is another thing to ask operational teams for.

**Clock skew across systems.** Freshness reasoning depends on comparing timestamps from different systems. Skew of a few minutes makes a stale read look fresh. Use a single clock source for decision timestamps and record which system each timestamp came from.

**Decision records written after the fact.** A record assembled from logs after execution is a reconstruction, not evidence, and it will be missing the alternatives and the input snapshot. Write the record before the action, update it after.

**Model changes with no version tracking.** The provider updates a model, behavior shifts, and nobody correlates the two because `model_id` was never captured.

**Approval queues that become rubber stamps.** A loop that requests approval constantly trains reviewers to click through. Set thresholds so approvals are rare enough to receive real attention.

**Saga state held in process memory.** The executor crashes and the completed steps are unknown, so recovery has to guess. Persist after every step to durable storage before returning control to the caller.

**Compensation logic tested only in isolation.** Each compensation works alone and the sequence fails, usually because two of them contend for the same operational record. Test the full reverse sequence, not each step.

## Rollback, honestly

Teams ask for a rollback button. It is worth being precise about what exists, because promising more than the architecture delivers is how trust gets destroyed on the first bad day.

**Fully reversible.** An internal record created and then cancelled, a flag set and unset, a reservation placed and released. The compensation restores something close enough to the prior state that nobody downstream notices. Automate these.

**Reversible with cost.** A shipment rerouted and then rerouted back. A purchase order cancelled within a supplier's cancellation window. The state is restorable and the attempt consumed money or goodwill. Automate the compensation, log the cost, and report it, because a loop whose compensation costs exceed its savings is a loop worth turning off.

**Semantically compensable only.** A payment issued and then refunded. The money moved twice, the ledger shows both, and the prior state never returns. Automate carefully and make the compensation visible to a human immediately.

**Irreversible.** A notification sent to an external party. A production run started. A contractual commitment made. Nothing undoes these. The only control available is preventing the action, which is why irreversible steps go last in a saga and above the approval threshold in your autonomy design.

Two practices follow.

Classify every action tool into one of those four categories at definition time, in the tool metadata rather than in a design document. The saga executor reads the classification and enforces ordering. The autonomy configuration reads it and enforces approval requirements. A classification that lives only in someone's head enforces nothing.

Report compensation cost as a first-class metric alongside the loop's savings. The business case for a loop is the value of faster action minus the cost of wrong action, and most teams measure only the first half.

## What to ask operational teams for

The write side's capabilities determine how safe your loop can be, and most operational APIs predate agentic consumers. Three requests, in priority order, with the reason attached so the conversation goes better.

**Idempotency keys.** Accept a client-supplied key on every mutating endpoint, persist it, and return the original result on a repeat. Without this, every network timeout is a coin flip between a duplicate and a missed action. This is the request that matters most and it is usually the easiest to implement.

**Conditional writes.** Accept an expected version or expected state, and reject with a specific conflict error when it does not match. This is what closes the read-decide-write race across a system boundary. Frame it as optimistic locking, which most operational engineers already understand.

**Lookup by idempotency key.** Given a key, report whether an operation with that key was processed and what its outcome was. This is what resolves an ambiguous timeout without guessing. It is a small endpoint and it eliminates an entire class of dangerous recovery logic.

Two more worth asking for if the relationship allows it: a sandbox environment with realistic data, which makes saga testing possible, and webhooks or events on state change, which make verification cheap instead of a polling job.

Frame all of this as requirements for any automated consumer rather than as agent-specific. They are good API design regardless, and the conversation goes considerably better when it is not framed as accommodating AI.

## Operational guidance

Give each loop its own catalog principal with its own grants and short-lived vended credentials. When something goes wrong, the audit trail should name a specific loop, not a shared service account.

Give each loop a named business owner separate from its engineering owner, and a one-paragraph statement of purpose that a non-engineer can read. Loops outlive the engineers who build them.

Publish the decision records to the people affected by them. A weekly digest of what the loop decided and why builds the trust that lets thresholds rise, and it surfaces bad decisions faster than any monitoring.

Review the decisions the loop declined to make. A loop that never abstains is not recognizing its own limits.

Ask operational teams for three capabilities and treat them as requirements rather than nice-to-haves: idempotency keys, conditional writes with a version or expected-state parameter, and lookup by idempotency key. Every one of them converts a class of dangerous ambiguity into a clean error.

Track four numbers. Time from condition to completed action. Verification failure rate. Compensation rate. Human override rate. The last one is the trust metric, and a rising override rate means the loop's model of the world has drifted from the world.

## Conclusion

The hard part of a closed-loop agent is not the reasoning. It is the seam between a read side that is analytical, stale, and safe to retry, and a write side that is transactional, current, and dangerous to retry.

Bridge it with conditional writes carrying the state the decision assumed, transactional re-verification of the specific entity before acting, and a deadline that abandons decisions which took too long to make. Accept that no distributed transaction exists and design sagas with explicit compensations, ordering irreversible steps last. Write a structured decision record before the action, capturing the input snapshot with as-of timestamps, the contract versions, the alternatives, and the model identity.

Then bound the damage. Circuit breakers, rate limits, value caps, canary scope, and a kill switch you have actually tested.

Run it in shadow mode for a month before it acts on anything. The evidence you get is worth more than the time it costs, and it converts the autonomy conversation from an argument about risk into a review of recorded outcomes.

The reasoning will work before the plumbing does. Budget accordingly.

## Keep Going

If this piece was useful, I have written a lot more on agentic architecture and the data platforms beneath it. *Architecting an Apache Iceberg Lakehouse* covers the table design and telemetry patterns these loops depend on, and *Apache Polaris: The Definitive Guide* covers the identity and governance model that makes per-loop accountability possible. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
