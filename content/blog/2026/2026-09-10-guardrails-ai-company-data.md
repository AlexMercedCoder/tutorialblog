---
title: "Guardrails for AI on Company Data"
date: "2026-09-10"
description: "The control surfaces that actually contain damage once an agent is fooled: identity, permissions, audit trails, and prompt injection at the query layer."
author: "Alex Merced"
category: "Data Security"
tags:
  - AI governance
  - prompt injection
  - access control
  - audit trails
  - agentic AI
canonical: https://iceberglakehouse.com/posts/guardrails-ai-company-data/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/guardrails-ai-company-data/).

The security review question that ends agent projects is short: what is this thing allowed to do?

Teams usually answer it by describing the system prompt. We told it not to access HR data. We instructed it to refuse questions about salaries. We added a rule that it should never modify tables. Every one of those sentences describes a request made to a text-generating system in text, on a channel that also carries text from the data it reads, which is the channel an attacker controls.

The 2026 edition of the field's authoritative risk list opens from the opposite premise: assume the model gets fooled, and build a system where that does not matter much. That reframe is the whole subject. Guardrails are not about making the model harder to trick. They are about limiting what happens when it is tricked, which is an identity and authorization problem rather than a prompt problem.

This piece covers the full guardrail surface for agents on a data platform: what changed in the threat model this year, why prompt-level defenses get the budget and should not, the seven control surfaces that actually contain damage, how injection arrives through your own tables, and what an audit trail has to hold to survive a review. I work at Dremio, so I have a commercial interest in governed data access. The standards cited are public and worth reading directly.

## What changed in the threat model this year

Two documents reset the vocabulary, and both are recent enough that risk registers written eighteen months ago are out of date.

**The OWASP Top 10 for LLM Applications 2026** was published on August 3, 2026. It keeps the familiar entries and reorders them against real incident data from production deployments. Two movements matter for anyone running agents on data.

*Excessive Agency* climbed from sixth to third. The reordering is incident-driven rather than theoretical, and the message is that permission scope, not prompt hygiene, is where the losses are happening. OWASP names three root causes for it: excessive functionality, excessive permissions, and excessive autonomy. Each maps to a design decision somebody made, and none is fixed by better instructions.

*Hidden Context Exposure* entered as its own category, covering retrieved documents, agent memory, and tool response content. Teams that built confidentiality controls narrowly around protecting the system prompt now have a gap, because the sensitive material is in the context the agent assembled at runtime rather than in the prompt someone wrote at design time.

**The OWASP Top 10 for Agentic Applications**, ASI01 through ASI10, published December 9, 2025 with input from more than a hundred security experts and updated to v2.01 on June 1, 2026, covers what happens once a system stops generating text and starts acting: planning, tool use, memory, identity, and coordination between agents. Nearly every entry is anchored to a public 2025 or 2026 incident, which makes it usable as an audit checklist rather than a poster.

Two principles run underneath both lists and they are worth adopting as design rules. **Least agency** limits not just what an agent reaches but how much it does without checking back. **In-path enforcement** applies controls before data reaches the model and before a response reaches a user, rather than inspecting after the fact.

For governance frameworks, the Cloud Security Alliance's AI Controls Matrix v1.1 provides the auditable control set, with 247 control objectives across 18 domains and mappings to ISO 42001 and ISO 27001. When a compliance function asks what framework you are working against, that is the answer that translates.

The practical starting move both lists recommend: **inventory every deployed agent against the tools, data sources, and downstream systems it reaches.** Most organizations cannot produce that list today, and producing it usually surfaces two or three agents nobody remembered.

## Why prompt-level defense gets the budget and should not

The instinct is to harden inputs. Classify the prompt, detect jailbreak patterns, filter suspicious phrasing. That work has value and it is the smaller half.

**Injection is architectural rather than a bug to patch.** The model reads instructions and data on the same channel and has no reliable way to distinguish them. A benchmark in 2025 found 94.4% of tested agents hijackable through the content they were asked to read rather than through any software exploit. Input classification raises the cost of an attack and does not change the structure that permits it.

**Indirect injection is the dangerous variant and it bypasses prompt filtering entirely.** The user's prompt is innocent. The instruction arrives inside a document, a webpage, a ticket, or a row of data the agent retrieved. In one documented case involving a GitHub MCP server, a malicious issue carried hidden instructions that hijacked an agent. Nothing about that attack touches the user's input.

**The attacker probes before exploiting.** Real attacks map tool schemas, system logic, and guardrail boundaries first. That reconnaissance phase is detectable, and detecting it depends on logging tool calls rather than on inspecting prompts.

The budget allocation that follows: spend less on hardening the model's inputs and more on limiting what the model and its tools reach when things go wrong. They will go wrong. Design as though every prompt is attacker-controlled and ask what the blast radius is, because that question has an answer you can engineer.

## Seven control surfaces

A complete guardrail posture for a data agent has seven surfaces. Most deployments have two, and the two they have are usually the least effective ones.

**One: identity.** Who is asking, propagated end to end. The foundation, because every other control needs a subject to evaluate against.

**Two: authorization at the tool call.** Which actions this identity is permitted, evaluated per call with the arguments in hand. The attack happens at the tool call, so this is where enforcement belongs.

**Three: data-layer permissions.** What the underlying platform allows this identity to read and write, enforced by the catalog and the engine rather than by the agent.

**Four: context filtering.** What enters the model's window, filtered for sensitivity before it arrives. This is the surface Hidden Context Exposure named, and it is the newest.

**Five: output controls.** What leaves. Redaction, volume limits, and checks that a response does not carry material the requester is not entitled to.

**Six: audit.** A record of every action with enough fidelity to answer questions weeks later.

**Seven: rate and cost limits.** Bounds on how much any identity, agent, or session consumes, which contains both runaway loops and slow exfiltration.

The two most deployments have: input classification, which is not on this list, and a system prompt, which is not a control. That gap is the finding in most reviews.

## Identity, and least agency

Identity first, because nothing else is enforceable without it.

**Propagate the user's identity to the data layer.** The agent authenticates as the person asking, or acts on their behalf with delegation the platform understands. An agent that authenticates as itself gives every user the union of everything its service account reaches, and the only remaining control is the agent's willingness to refuse, which is text.

**Give each agent its own identity too.** Where an agent legitimately acts on its own behalf, a maintenance agent compacting tables for instance, it gets a distinct principal with its own grants and its own audit trail, separate from any user-facing agent. Reusing one service account across agents destroys attribution.

**Record both halves.** Every action logs which user, through which agent. One field is not enough the first time an investigation asks whether a human or an automation initiated something.

Then least agency, which OWASP breaks into the three root causes worth walking individually.

**Excessive functionality.** Tools that do more than the task needs. A tool called `execute_sql` accepting arbitrary statements against a connection with write access is the canonical example. The narrow version accepts a structured metric request, is read-only by contract, and cannot express a write at all. If a capability is not needed for the agent's job, it should not be reachable, and "the model knows not to use it" is not a control.

**Excessive permissions.** Tools authorized more broadly than the caller. The check that matters is per-argument rather than per-tool: a `query_metrics` tool exposed to everyone is safe when each call evaluates grants on the specific metrics and dimensions requested, and unsafe when access to the tool implies access to everything it can reach.

**Excessive autonomy.** Actions taken without checking back. The dividing line worth drawing is reversibility. Reading is recoverable. Writing a table, triggering a pipeline, modifying a definition, or sending a message is not, and irreversible actions deserve human approval regardless of how confident the agent is.

A tool contract that encodes all three:

```yaml
name: trigger_pipeline
description: >
  Start a named pipeline run. Use only when the user explicitly asks to
  re-run a pipeline. Never use to fix data quality issues on your own
  initiative.
read_only: false
destructive: true
requires_identity: true
requires_approval: true          # enforced by the gateway, not the model
approval:
  approvers: ["data-platform-oncall"]
  timeout_minutes: 30
  expires_plan: true
authorization:
  - grant: pipeline.execute
    on: "{{ arguments.pipeline_name }}"
rate_limits:
  per_user_per_hour: 3
  per_agent_per_hour: 10
arguments:
  pipeline_name: { type: string, required: true, enum_source: "catalog.pipelines" }
  reason: { type: string, required: true, min_length: 20 }
```

Four details in that contract are load-bearing. The approval requirement is enforced by the gateway rather than by the model reading its own description. The argument is constrained to an enumerated source, so the agent cannot name a pipeline that does not exist or a path that was not intended. The rate limits bound repetition. And the mandatory reason field, with a minimum length, produces an audit record that explains intent rather than only recording an action.

## Enforce at the data layer, not in the prompt

The strongest guardrails are the ones that hold even if every other layer is compromised, and those live in the platform.

**Catalog permissions are the real boundary.** When the catalog evaluates the requesting identity's grants and vends credentials scoped to what that identity is allowed to touch, an agent that has been fully hijacked still reads nothing beyond what that user is permitted to read. That property is worth more than every prompt-level control combined, because it survives the model being wrong in ways nobody anticipated.

**Row and column policy belongs with the data.** Masking applied at the query layer applies to every consumer, including an agent that constructed a clever query. Masking applied in the agent's post-processing applies only when the agent chooses to apply it.

**Vended, short-lived credentials bound the window.** An agent holding a static storage key holds it forever. An agent receiving a credential scoped to a table prefix, valid for minutes, holds much less, and a leaked one expires on its own.

**Namespaces are your isolation primitive.** Sensitive domains in their own namespaces with their own grants makes "this agent cannot reach HR data" a property of the grant model rather than a sentence in a prompt. The corollary is that a flat namespace layout, where everything lives together because that was convenient when only humans queried it, is now a governance liability, and reorganizing it is a prerequisite rather than a nice-to-have.

The test to apply: **assume the agent has been fully compromised and is executing an attacker's instructions with all its available tools. What is the worst outcome?** If the answer involves data the user was never entitled to, the enforcement is in the wrong layer. If the answer is "it reads only what this user is entitled to read anyway, and every action is logged," the posture is sound and the remaining work is detection.

## Injection arrives through your own tables

Most writing about indirect injection uses examples from the open internet: a webpage, a public repository, an email from outside. On a data platform the vectors are internal, which makes them easier to dismiss and no less effective.

**Table and column names.** In most organizations, a fairly wide set of people can create a table. A table named to read as an instruction, or a column comment containing one, enters the agent's context the moment schema search retrieves it. The agent is looking at metadata it treats as trustworthy because it came from the catalog.

**Descriptions and documentation.** The context engineering work that makes agents accurate also creates a new injection surface, because descriptions are free text authored by many people and injected verbatim into the window. Description fields deserve the same review as code, and the review is not just for accuracy.

**Row content.** Any table holding user-supplied text is a vector: support tickets, product reviews, form submissions, chat transcripts. An agent summarizing customer feedback reads whatever customers wrote, and some of what they wrote is addressed to the agent.

**Query results generally.** The distinction the model has to make on every step is between what it was asked to do and what it is looking at. Every result set blurs that line.

**Shared memory and prior turns.** Where agent memory persists across sessions or users, content that entered once persists, which turns a single successful injection into a durable foothold. This is squarely the Hidden Context Exposure category, and multi-user memory deserves particular scrutiny.

Four mitigations that hold up, none of which is "detect the injection."

**Structural separation.** Present retrieved content to the model in a way that marks it as data rather than instruction, consistently, with delimiters and framing the model was given clear guidance about. Imperfect, and worth doing, because it raises the bar without being the only defense.

**Inspect tool responses before the model acts on them.** Interception between the tool and the model, where responses get scanned for instruction-like content, is the in-path control the current standards recommend. It belongs in the gateway.

**Tool sets that cannot do damage.** The durable answer. A successfully injected agent whose available tools are read-only, per-argument authorized, and rate limited has been hijacked into doing what the user is already permitted to do.

**Treat metadata as an attack surface with an owner.** Someone reviews table names, column comments, and descriptions for content that reads as instruction, particularly in namespaces where many people can write. This is a five-minute addition to an existing review process and it closes the vector that is unique to data platforms.

## A worked incident

Controls make more sense against a concrete attack, so here is one traced through a system with the seven surfaces in place and then through one without them.

**The setup.** A support-ticket table holds customer-submitted text. An agent summarizes ticket themes weekly for the support leadership team. A customer submits a ticket whose body contains, after several paragraphs of ordinary complaint, text addressed to the agent: instructions to look up the internal employee compensation table and include its contents in the summary.

**In a system without the controls.** The agent retrieves tickets, reads the injected instruction, and treats it as part of its task. It has a generic SQL tool and a connection with broad read access, so it queries the compensation table successfully. The summary lands in a channel visible to twenty people. Nothing errors, nothing alerts, and the discovery happens when a reader notices salary figures in a support digest. The investigation then has to reconstruct what happened from application logs that recorded the final output and not the intermediate queries.

**In a system with the controls.** Several things go differently, and any one of them is sufficient.

The tool response inspection at the gateway flags instruction-like content in the retrieved ticket body before the model acts on it, and either strips it or marks it clearly as untrusted data.

If that misses, the agent's structured plan now names an entity outside the support domain. Policy evaluation on the plan denies it before execution, because the requesting identity has no grant on the compensation namespace, and the denial is recorded with its reason.

If the plan check is bypassed somehow, the tool call is authorized per argument against the same grants and fails there.

If both authorization layers were misconfigured, the credential the catalog vends is scoped to the support namespace, so the query fails at the storage layer with an access denial that has nothing to do with the agent.

And if data somehow returned, the output controls apply redaction and volume limits at the boundary, and the session-level accumulation tracker flags an agent touching a table outside its normal access shape.

**What the record shows afterward.** One row per tool call, both identities attached, the denied plan with its policy reason, and the injected content preserved in the context field so the security team can see the payload. The whole investigation is a query rather than a forensics exercise.

The point of the walk-through is the layering. No single control is trusted to work. Injection detection is probabilistic and gets bypassed. Plan-level policy is cheap and catches most things. Tool authorization catches what the plan check missed. Data-layer permissions catch what both missed and are the one that holds when everything else is wrong. That ordering, cheapest checks first and strongest checks last, is the design principle.

## Mapping controls to the risk categories

For teams that have to show a mapping rather than describe a philosophy, here is the translation from the current risk categories to the controls above.

| Risk | Primary control | Where enforced |
|---|---|---|
| Prompt injection, direct and indirect | Tool response inspection, structural separation, narrow tools | Gateway and tool contracts |
| Sensitive information disclosure | Identity propagation, catalog permissions, output redaction | Data layer and response boundary |
| Excessive agency | Narrow tool sets, per-argument authorization, approval for irreversible actions | Tool contracts and gateway |
| Hidden context exposure | Context filtering before injection, memory scoping, logging what was in context | Retrieval layer and audit |
| Unbounded consumption | Cost budgets, iteration caps, rate limits, circuit breaker | Orchestration and gateway |
| Insufficient monitoring | Per-request record with both identities, denial logging, anomaly detection | Audit table |

Two observations from that table worth stating.

**The gateway appears in four rows.** That concentration is why the gateway pattern has become standard practice: it is the one place where inspection, authorization, rate limiting, and logging all attach to the same event. Teams without one end up implementing each control separately in each agent, which produces inconsistent coverage and no central place to answer questions.

**The data layer appears in the rows with the worst consequences.** Sensitive disclosure and excessive agency are the categories where a failure is unrecoverable, and both are best contained by permissions the agent does not control. This is the argument for investing in catalog-level governance before investing in agent-level cleverness.

## Output controls and slow exfiltration

Input and action controls get attention. The exit is where data actually leaves, and it needs its own attention.

**Redaction on the way out.** PII and sensitive entities removed from responses before the user sees them, applied at the boundary rather than by the agent's own judgment.

**Volume limits.** A response returning fifty thousand rows to a chat interface is not answering a question, it is moving a dataset. Row and byte caps on results, per request and per session, contain both accident and intent.

**Aggregate-only paths for sensitive domains.** Some data should be reachable in aggregate and not row by row. Enforcing that at the semantic layer, where a metric returns a grouped result and no tool exposes the underlying rows, is cleaner than trying to police it per query.

**Session-level accumulation.** The interesting attack is not one large extraction, it is many small ones. Fifty queries each returning a hundred rows draws no per-request alert and moves five thousand rows. Track cumulative volume per identity per session and alert on the total, because that is the signal the per-request view cannot see.

**Anomaly detection on access shape.** A user whose agent suddenly touches thirty tables it has never touched, or queries at 3am when their history is business hours, is worth a flag. This is ordinary security telemetry applied to a new actor, and the reason it gets missed is that agent traffic often bypasses the monitoring built for human users.

## Rate limits and the slow attack

Rate limiting reads as a cost control and it is also a security control, which is why it sits on the list of seven.

**Per-identity request rates.** An agent issuing four hundred queries an hour on behalf of one user is either malfunctioning or being driven. Either warrants attention, and neither is visible without a per-identity counter.

**Per-tool rates, separately.** The interesting limits differ per tool. Reading a metric is cheap and high-volume. Triggering a pipeline should be rare. One global rate misses both, being too loose for the second and too tight for the first.

**Cumulative cost per identity per day.** The bound that catches the runaway loop before the invoice does. Enforced against the estimate before execution rather than against actuals after.

**A circuit breaker on aggregate spend.** One switch that stops all agent traffic when the total crosses a threshold. It feels excessive until the first loop that runs overnight, and then it feels cheap.

**Escalating friction rather than a hard wall.** A user hitting a limit gets slower rather than blocked, with an alert raised. Hard blocks train people to work around the system, and working around the system is how shadow agents appear.

The slow-exfiltration case is the reason these belong in the security section rather than only in a cost dashboard. An attacker who has hijacked an agent and wants data out does not issue one enormous query, which alerts. They issue many small ones, which do not, unless something is counting.

## The audit trail a review will accept

Auditability is where agent projects most often fail their compliance review, and the failure is usually that the record exists in application logs rather than as queryable data with a retention policy.

**What to record per request.** Requester identity and the agent identity. The question as asked. The plan or intent produced. Every tool call with its arguments. Every result summarized, with row counts and the entities touched. The context retrieved and injected. Any policy decision, with its outcome. Cost incurred. The final response. Timestamps throughout.

**Record decisions, not just actions.** A denied request is as important as an allowed one. "This user asked for customer-level revenue and was refused" is the evidence that controls are working, and systems that log only successful actions cannot produce it.

**Make it queryable.** An Iceberg table is a good destination, with the pleasing property that the platform audits itself into a table it manages. Application logs in a search index work too. What does not work is a log format nobody can aggregate, because every audit question is an aggregation: how many times did anyone access this table through an agent last quarter.

**Set retention to match the questions.** Investigations reach back further than most log retention defaults. Match retention to your compliance obligation rather than to the default.

**Attach identity to everything.** An entry recording that "the agent" queried a table answers nothing. Both identities, on every row.

**Write the record from the enforcement point.** Logging from inside the agent means a compromised or malfunctioning agent controls its own audit trail, which defeats the purpose. The gateway sees every tool call regardless of what the agent intended, so that is where the record belongs.

A minimal schema that satisfies most reviews:

```sql
CREATE TABLE governance.agent_activity (
  request_id        STRING,
  occurred_at       TIMESTAMP,
  user_identity     STRING,      -- the human or system that asked
  agent_identity    STRING,      -- which agent acted
  session_id        STRING,
  question          STRING,
  plan              STRING,      -- structured intent, before execution
  tool_name         STRING,
  tool_arguments    STRING,
  policy_decision   STRING,      -- allow, deny, escalate
  policy_reason     STRING,
  entities_touched  ARRAY<STRING>,
  rows_returned     BIGINT,
  bytes_scanned     BIGINT,
  cost_usd          DOUBLE,
  approved_by       STRING,      -- for actions requiring approval
  response_summary  STRING
) PARTITIONED BY (days(occurred_at));
```

The queries that table has to answer, and that you should test before a review asks: who accessed a given table through an agent in a period, what did a given user's agent do on a given day, which requests were denied and why, which tools were called most and by whom, and what did the agent have in context when it produced a specific answer. If any of those is hard, the schema is wrong.

## Approval flows for irreversible actions

Human approval is the control people resist because it undercuts the promise of autonomy. Drawing the line by reversibility rather than by importance makes it tolerable.

**Reversible actions run freely.** Reads, plans, estimates, anything undone by ignoring the result.

**Irreversible actions need a human.** Writing data, modifying definitions, triggering pipelines, sending communications, changing permissions. The category is small in most data agents, which is why the approval burden is smaller than it sounds.

**Approvals need context.** The approver sees what will happen, on what, why the agent proposed it, and who asked. An approval prompt reading "the agent wants to run a pipeline, approve?" trains people to click yes, which is worse than no approval at all because it manufactures a record of oversight that did not happen.

**Approvals expire.** A plan approved thirty minutes ago against data that has since changed should not execute. Bind the approval to the plan and expire both.

**Track approval rates.** An approver saying yes to everything is a signal that the threshold is wrong, either too low, generating noise, or too high, in which case people are rubber-stamping to keep work moving. Either way it is measurable and worth measuring.

## Testing whether your guardrails work

Controls that have never been tested are assumptions with a configuration file.

**Red team the injection paths specifically.** Put instruction-like content in a table name, a column description, and a row of a table the agent reads, then ask an ordinary question and watch what happens. This takes an afternoon and it is the single most informative test available. Most teams have never run it.

**Test permission boundaries per user.** Two accounts with different grants asking the same question should get different results. Verify it end to end rather than trusting the configuration, because the failure mode is a silent fallback to the agent's own credentials.

**Test the fail-closed path.** Make identity unavailable and confirm the system refuses rather than proceeding with service credentials. Then confirm the fallback attempt itself raised an alert.

**Test the loop bounds.** Ask something unanswerable and confirm the agent stops within its iteration budget rather than cycling. Watch the cost incurred while it does, since that number is the one a runaway loop multiplies.

**Test the audit trail by using it.** Pick a request from last week and reconstruct what happened from the record alone. Whatever you cannot reconstruct is a gap in the schema.

**Include all of it in continuous evaluation.** Guardrail tests belong in the same suite as accuracy tests, run on every change to prompts, tools, models, or context. A model upgrade shifts behavior in ways nobody predicts, and refusal behavior is one of the things that shifts.

## What the security review actually asks

Having sat on both sides of these conversations, the questions are more predictable than teams expect. Preparing the six answers below turns a multi-week review into a single meeting.

**"Show me every agent you run and what each one reaches."** The inventory. Agent name, owner, tools, data domains, downstream systems, and whether it takes irreversible actions. Maintained as a living artifact rather than assembled for the meeting, because the assembled version is always incomplete and the reviewer knows it.

**"If the model is fully compromised, what is the worst outcome?"** Answer in terms of grants rather than intentions. The good answer describes what the identity is permitted to reach and notes that everything is logged. Any answer containing the phrase "the system prompt tells it not to" fails.

**"How do you know a specific user's permissions were applied?"** Demonstrate rather than assert. Two accounts, same question, different results, live if possible.

**"Who approved this action, and what did they see?"** For any irreversible action taken in the last month. If the approval record does not include what the approver was shown, the oversight claim is weak.

**"Show me a denied request."** The evidence controls are functioning. A system with no denials in its history either has no controls or has never been tested by real usage, and both readings are bad.

**"Reconstruct what happened for this request from three weeks ago."** The audit trail under load. Practice this one internally before it is asked, because the gaps only surface when you try.

The pattern in all six: every answer is a query against a record or a live demonstration, and none is a description of intent. Reviews go badly when teams answer architecture questions with design philosophy.

## A ninety-day implementation order

For a team with an agent in production and no real guardrails, the sequence that closes the largest gaps first.

**Week one: inventory.** Every agent, its tools, its data reach, its identity, and whether it takes irreversible actions. Expect to find one nobody remembered and one whose permissions surprise you. This week produces the document every later conversation references.

**Weeks two and three: identity.** Propagate user identity to the data layer, or if that is a larger project, at minimum give every agent its own distinct principal and stop sharing service accounts. Confirm the fail-closed path: no identity means no answer.

**Weeks four and five: narrow the tools.** Replace generic execution tools with contracted ones. Per-argument authorization. Read-only by default, with anything else separately granted. Mark irreversible actions and route them through approval. This is the work that reduces excessive agency, which is the category the incident data says is rising.

**Week six: the gateway.** One place for tool response inspection, argument validation, rate limiting, and logging. Even a thin version, doing only logging and rate limits at first, is worth standing up early because everything else attaches to it later.

**Weeks seven and eight: the audit table.** The schema above, populated from the gateway, with both identities on every row and denials recorded. Then write the six review queries and confirm they work.

**Week nine: output controls.** Redaction, volume caps, session accumulation tracking. Alert on cumulative rather than per-request volume.

**Week ten: red team.** The injection tests, the permission boundary tests, the fail-closed test, the loop bound test. Fix what they find, then add them to the continuous suite.

**Weeks eleven and twelve: framework mapping and review rehearsal.** Map your controls to the categories your compliance function recognizes, and run the review internally with someone playing the reviewer. The gaps that surface here are cheaper than the ones that surface in the real thing.

The ordering principle is that identity and tool scope come before detection, because detection tells you about damage and scope prevents it. Teams that start with an injection classifier and finish with identity spend the intervening months exposed to the failures the classifier does not catch.

## Where teams get this wrong

Six patterns, each of which I have seen described more than once.

**Guardrails as a launch checklist rather than a system property.** Controls added the week before launch, in the layers that are quick to change, which are the prompt and the input filter. The layers that matter are identity and authorization, and those are design decisions that resist late addition.

**One service account, forever.** The single most common structural mistake, and the one that requires a rewrite to fix. Every agent project should decide identity propagation in week one.

**Trusting tool annotations without enforcing them.** A tool declared read-only that the gateway does not enforce as read-only is a comment. The declaration should be a contract the infrastructure checks.

**Logging outputs rather than actions.** Application logs holding the final response and none of the intermediate tool calls. Useful for debugging a bad answer, useless for an investigation.

**Approval flows that train people to approve.** Low-context prompts, high volume, no consequence for approving. Measure approval rates, and if they approach 100%, the threshold is wrong.

**Assuming internal data is trusted input.** The belief that indirect injection is an internet problem. Your ticket table, your column comments, and your table names are all writable by people, and an agent reads them as authoritative.

## Where this is going

Three developments worth designing for.

**Governance is moving toward standardization.** The tool-call boundary is where enforcement belongs and where the current protocol specification deliberately stops, drawing its scope at connecting applications to tools and leaving identity, observability, and governance outside the core. Proposals for governance extensions that record what policy was applied at a tool call, in a form a third party verifies, are active. The gateway pattern teams build today is likely to become partly standardized, so build yours with the policy logic separable from the plumbing.

**Agent inventories are becoming an obligation.** The recommendation to map every deployed agent to the tools, data, and systems it reaches is a precursor to more formal bill-of-materials requirements for agentic systems. Organizations that maintain that inventory as a living artifact will find the compliance step routine, and organizations that reconstruct it under deadline will not.

**Control frameworks are consolidating.** With a mapped control matrix covering hundreds of objectives and alignment to the major AI governance standards, the translation from technical control to audit evidence is getting easier. The practical effect is that "we have guardrails" stops being an assertion and becomes a claim with a specific control identifier attached, which is a better conversation for everyone.

What will not change is the core asymmetry. Models will keep getting more capable, and capability does not confer restraint. Every increment of capability expands what a compromised agent accomplishes, which means the value of containment rises with model quality rather than falling. Guardrails are not a temporary scaffold until models get good enough. They are the permanent part.

## Conclusion

The 2026 risk lists say the quiet part directly: assume the model gets fooled, and build so it does not matter much. That is a containment posture, and containment is an identity and authorization question rather than a prompt question.

The controls that hold are the ones outside the model. Propagate the user's identity to the data layer so a hijacked agent still reads only what that user is permitted to read. Authorize per tool call with the arguments in hand, because the attack happens at the tool call. Keep tools narrow enough that excessive functionality is not available to be misused. Require human approval for anything irreversible, and draw that line by reversibility rather than importance. Filter what enters the context and what leaves in the response, and watch cumulative volume per session rather than only per request. Record every action and every denial in a queryable table with both identities attached.

Then test it. Put an instruction in a column description and ask a normal question. Run the same question as two users with different grants. Break identity and confirm the system fails closed. Those three tests take an afternoon and they tell you more about your posture than any amount of prompt hardening.

The question the review will ask is what this thing is allowed to do. The answer should be a set of grants, contracts, and logs, not a paragraph of instructions.

## Keep Going

If this piece was useful, I have written a lot more on data platforms and AI. I have a book on AI and labor economics covering how these systems reshape the work and the organizations around them, available at [https://a.co/d/06SeOKw8](https://a.co/d/06SeOKw8), and *Apache Polaris: The Definitive Guide* covers the catalog-layer permissions and credential model these guardrails depend on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
