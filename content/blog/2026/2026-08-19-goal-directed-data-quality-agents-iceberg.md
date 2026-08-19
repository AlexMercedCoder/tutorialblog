---
title: "Goal-Directed Data Quality Agents: Anomaly Quarantine on Apache Iceberg"
date: "2026-08-19"
description: "Goal-directed data quality agents that watch Apache Iceberg tables, detect anomalies, and quarantine suspect data safely with snapshot isolation and branches."
author: "Alex Merced"
category: "AI & Agents"
canonical: https://iceberglakehouse.com/posts/goal-directed-data-quality-agents-iceberg/
tags:
  - Apache Iceberg
  - data quality
  - AI agents
  - anomaly detection
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/goal-directed-data-quality-agents-iceberg/).

Every data platform has a quality system, and most of them are the same system: a few hundred rules, written after incidents, checking the failures somebody already lived through. Null checks on the columns that were null that one time. Row-count thresholds tuned to last year's volumes. A freshness alert per table, firing into a channel everyone muted in March. The system catches what it was told to catch, misses everything novel, and decays as the estate outgrows the rules, which is not a criticism of the teams that built it. It is the ceiling of the approach itself: rules encode known failures, and data finds new ways to be wrong faster than humans write rules.

The emerging alternative pairs two technologies that matured separately and compose beautifully. Agents bring goal-directed behavior: instead of executing a fixed rule list, an agent holds quality goals for a dataset, this table should be complete, fresh, consistent with its sources, and stable in its distributions, and plans its own checking and its own response when reality diverges. Apache Iceberg brings the substrate that makes autonomous response safe: snapshot isolation, atomic commits, branches, and rich metadata, which together let an agent quarantine suspect data, propose fixes, and act, all without ever putting a consumer at risk of reading half-applied judgment. The combination turns data quality from a static rulebook into a supervised operations loop, and the quarantine pattern is its centerpiece.

This article builds the system: why rules ran out, what goal-directed actually means beyond the buzzword, why Iceberg specifically is the substrate that makes agent remediation safe, the quarantine pattern in mechanical detail with the SQL, the agent architecture with its bounded tools and autonomy tiers, and the trust-building path that takes an organization from observing agent suggestions to sleeping through agent actions. A disclosure as always: I work at Dremio, whose agentic lakehouse platform operates in exactly this territory, and the patterns here are architectural, buildable on open components, and stated vendor-neutrally throughout.

## Why Rule-Based Quality Ran Out

The rule-based approach's limits are structural, and naming four of them precisely specifies what the replacement must do.

Rules encode hindsight. Every rule is a memorial to a past incident, which means coverage is exactly the set of failures already experienced, and the failures that hurt most are, by selection, the ones nobody anticipated: the upstream refactor that shifted a distribution without touching nulls or counts, the currency column that started arriving in cents, the duplicate surge from a retry bug that stayed under the row-count ceiling. The approach has no mechanism for noticing the unanticipated, and the unanticipated is the job.

Rules decay silently. Thresholds tuned to old volumes drift into either noise or blindness as the business grows, seasonality defeats static bounds twice a year, and the estate adds tables faster than anyone writes rules for them, so coverage as a fraction of the estate declines monotonically from the day the framework ships. The decay is invisible because the dashboard stays green, which is the worst property a safety system can have.

Rules do not respond. A firing rule produces an alert, and everything after the alert is human: triage, diagnosis, deciding whether downstream jobs should run, the awkward choice between shipping suspect data and blocking the pipeline. The mean time from detection to containment is measured in human attention, alert fatigue stretches it, and the modern estate's cadence, streaming commits, agent consumers reading continuously, has stopped waiting for morning triage.

And rules fragment exactly like the metrics they check. Each pipeline framework, warehouse, and observability tool hosts its own rule dialect, definitions of quality drift between them, and the estate's quality posture becomes unmeasurable in aggregate, the same fragmentation story my semantic layer writing tells about meaning, replayed one layer down.

Read the four limits together and the requirement is legible: a system that learns what normal looks like instead of being told, that scales its attention across the estate without per-table authorship, that responds within the platform's own cadence, and that acts through governed, uniform machinery. That is a description of a goal-directed agent over a transactional table format, which is the rest of this article.

## What Goal-Directed Actually Means

The word agent is carrying a lot of freight this decade, so this section defines the behavior precisely and keeps the definition honest.

A goal-directed quality system inverts the rulebook's contract. The human input changes from procedures to properties: instead of writing "alert if null_rate(email) > 0.02," the dataset's owner declares goals, completeness on the columns that matter, freshness against the source's cadence, distributional stability on the measures, referential consistency with named related tables, uniqueness on the business keys, each goal a property with a priority, not a threshold with a number. The declarations are small, stable, and owned, living in the dataset's contract beside its schema and its maintenance cadence, in the governance-as-code machinery my other writing describes.

The agent supplies the procedures. Against each goal, it derives the concrete checks: profiling the table to learn baselines, choosing statistical detectors suited to each column's type and behavior, setting adaptive bounds that follow seasonality, and revisiting its own choices as the data evolves. When a check fires, the agent plans a response within its authority: investigate first, correlating the anomaly across columns, partitions, and lineage to hypothesize a cause, then contain, quarantine the suspect slice, then propose or apply remediation per its autonomy tier, then verify and report. The loop is sense, diagnose, contain, remediate, verify, and the goal-directedness is that every step is chosen against the declared properties rather than scripted in advance.

Two honesty notes keep the definition grounded. First, the intelligence is layered, not magical: the detection tier is largely statistics, baselines, drift measures, outlier models, machinery that predates the current AI wave, and the language-model tier adds what statistics lacked, the diagnosis that reads schemas, lineage, and recent changes to form causal hypotheses, the judgment that ranks responses, and the explanation that humans act on. Second, autonomy is granted, not assumed: the agent operates inside explicit authority tiers, from observe-and-report through act-with-approval to act-within-bounds, and the entire architecture below is designed so that expanding its authority is safe to do gradually, which is what makes the system adoptable by organizations that have been burned by automation before.

## Declaring the Goals: The Quality Contract

The goals need a home and a shape, and both come from the governance-as-code discipline the rest of the estate already runs: quality goals live in the dataset's contract file, versioned, reviewed, and applied like every other governance asset. A representative contract's quality section:

```yaml
dataset: sales.orders
owner: commerce-data
quality:
  autonomy_tier: contain_autonomous
  goals:
    - property: uniqueness
      columns: [order_id]
      priority: critical
      invariant: true
    - property: freshness
      against: source_cdc
      target: 5m
      priority: critical
    - property: volume_stability
      priority: high
    - property: distribution_stability
      columns: [amount, status]
      priority: high
    - property: consistency
      related: [billing.invoices]
      reconcile: sum(amount) BY order_date
      priority: high
  bounds:
    max_quarantine_pct_per_action: 5
    min_confidence_to_act: 0.9
    protected_partitions: [order_date < '2026-01-01']
  quarantine:
    table: sales.orders_quarantine
    review_within: 72h
```

Read the file's design choices, because each answers a section of this article. Properties, not thresholds: the volume goal carries no number, because the number is the agent's to learn and revise, while the invariant flag marks the constitutional rules that never adapt. Priorities drive the attention budget and the escalation ranking. The bounds block is the tier-two authority's fence, quarantine caps, confidence floors, and the protected history the agent never touches, all reviewable in a diff when anyone proposes changing them. And the quarantine block wires the lifecycle, naming the sibling table and the review clock that keeps containment from becoming landfill.

The contract's location does the final work: it sits in the same repository, review flow, and promotion pipeline as the dataset's schema and access rules, so a quality-authority change is a pull request with the diff classification and ownership routing that machinery provides. Expanding the agent's autonomy on the orders table is a reviewed line change from contain_approval to contain_autonomous, argued from the case history in the PR description, revertable in one commit, which is exactly the shape organizational trust needs change to take.

## Why Iceberg Is the Substrate

An agent that only observes needs nothing special underneath. An agent that contains and remediates needs a substrate where its actions are safe, reversible, and invisible until published, and this is where Apache Iceberg stops being incidental infrastructure and becomes the enabling technology. Five properties carry the weight.

Atomic snapshots make containment all-or-nothing. Every Iceberg commit produces a new snapshot atomically: readers see the table before the agent's action or after it, never a torn middle. An agent quarantining forty thousand suspect rows across nine files does it as one commit, and the guarantee holds for every engine reading the table, which matters because the consumers an agent protects span Spark jobs, dashboards, and other agents.

Snapshot history makes every action reversible. The table's prior states remain addressable, so the agent's worst case is bounded by design: a wrong quarantine or a bad fix rolls back by pointer, in seconds, to the exact pre-action snapshot, and the rollback is itself an audited commit. Autonomy without an undo is a hazard, and Iceberg gives the undo as a format property rather than a bolted-on backup.

Branches give judgment a place to happen before publication. Iceberg's branching lets the agent stage its containment or fix on a branch of the production table, run its verification suite against the branched state, real data, full scale, and publish by fast-forwarding the main branch only when the checks pass, the write-audit-publish discipline I cover in depth elsewhere, here serving as the agent's workbench. Suspect handling never touches what consumers read until it has itself been quality-checked, which is the recursion that makes automated remediation trustworthy.

Metadata makes sensing cheap. The format's metadata tables expose per-file and per-partition statistics, row counts, null counts, value bounds, snapshot history, without scanning data, so the agent's continuous monitoring tier runs at metadata cost across the whole estate, reserving data-touching profiles for where the cheap signals point. Row lineage in v3 tables sharpens diagnosis further, letting the agent trace exactly which rows changed when.

And table properties plus the catalog make the whole loop governable: quality goals and autonomy tiers ride in the dataset's contract, the agent authenticates as a principal with exactly the grants its tier permits, and every commit it makes carries its identity in the table's history, which is the audit story security reviews ask for first. The agent is not a privileged daemon. It is one more governed writer, distinguishable in every log, revocable in one grant change.

## The Quarantine Pattern

Containment is the pattern's heart, so here is quarantine mechanically, in its two complementary forms.

The first form is the quarantine table: a sibling table receiving rows the agent removes from the primary, with provenance attached. The primary's consumers immediately see a cleaner table, the suspect rows remain queryable for investigation, and reinstatement is a governed move back. The core operation, shaped for an orders table where the agent detected a duplicate surge:

```sql
-- Stage on a branch: move suspect rows to quarantine
INSERT INTO lake.sales.orders_quarantine
SELECT o.*,
       'dup_surge_2026_08_18' AS quarantine_batch,
       'duplicate business key within arrival window' AS reason,
       current_timestamp() AS quarantined_at
FROM lake.sales.orders.branch_agent_q o
WHERE o.order_id IN (SELECT order_id
                     FROM staging.suspect_order_ids);

DELETE FROM lake.sales.orders.branch_agent_q
WHERE order_id IN (SELECT order_id
                   FROM staging.suspect_order_ids);
```

The second form is the quarantine partition: for datasets partitioned by arrival or event time, where anomalies typically arrive as a bad batch, the agent quarantines at partition grain, swapping the suspect partition out of the primary path or, in the lighter variant, marking it via a status column that governed views filter. Partition-grain quarantine is dramatically cheaper for batch-shaped incidents, one metadata operation instead of row surgery, and the two forms compose: partition quarantine for containment speed, row-level triage afterward to reinstate the innocent majority.

Consumers deserve their signal, which completes the pattern's contract with the estate: a containment event is a data event, and the datasets downstream of a quarantine should learn of it through the platform's channels, the incident feed, the dataset's status surfaced in the catalog and the semantic layer's metadata, so a dashboard footnote or an agent's answer can carry "orders is under an active quality incident affecting the August 18 partition" instead of silent numbers. Iceberg's snapshot lineage makes the disclosure precise: the containment commit's identifier travels with the notification, downstream jobs that already consumed pre-containment snapshots are enumerable from their own read history, and the reprocessing decision, rerun the 6 a.m. jobs against the cleaned snapshot or accept yesterday's variance, becomes a scoped choice with names attached rather than a whodunit. Estates that wire this disclosure report a cultural side effect worth the plumbing: quality incidents stop being the data team's private shame and become ordinary operational events with ordinary handling, which is precisely the normalization the whole program needs.

The verification-and-publish step completes the pattern, and it is where the branch earns its place:

```sql
-- Agent verifies the branched state before publishing
SELECT
    (SELECT COUNT(*) FROM lake.sales.orders.branch_agent_q) AS rows_after,
    (SELECT COUNT(DISTINCT order_id)
     FROM lake.sales.orders.branch_agent_q) AS distinct_keys,
    (SELECT SUM(amount) FROM lake.sales.orders.branch_agent_q
     WHERE order_date = DATE '2026-08-18') AS day_amount;

-- Checks passed: publish atomically
CALL lake.system.fast_forward(
    table => 'sales.orders',
    branch => 'main',
    to => 'agent_q'
);
```

The verification queries are not decoration: the agent asserts that its containment restored the violated goals, keys now unique, distributions back in band, totals moving by exactly the quarantined amount, and publishes only on pass, logging the assertions with the commit. Fail, and the branch is dropped, the incident escalates to humans with the full diagnostic context, and production never noticed.

Three design details separate a working quarantine from a data swamp with extra steps. Provenance is mandatory: every quarantined row carries its batch, reason, detector, and timestamps, because quarantine without provenance is deletion with a euphemism. Quarantine has a lifecycle: batches age toward review, reinstatement, correction, or documented disposal on a clock, with the aging visible on the quality dashboard, so the quarantine table is a workflow, not a landfill. And reinstatement is symmetrical: rows return through the same branch-verify-publish discipline as they left, because the move back is exactly as consequential as the move out.

## The Agent Architecture

With the substrate and the containment pattern in place, the agent itself assembles from bounded parts, and the boundedness is the architecture.

The sensing tier runs continuously and cheaply: scheduled sweeps over the metadata tables for the whole estate, per-commit hooks on the tables whose contracts declare tight goals, and data-touching profiles dispatched only where metadata signals point. Its output is a stream of observations against baselines the tier itself maintains, per-column distributions, volume curves with seasonality, freshness rhythms, inter-table consistency measures, learned from history and updated as data arrives, which is what replaces the hand-tuned threshold: the baseline is the rule, derived and current.

The diagnosis tier is where the language model earns its place: given an anomaly, it assembles context, the table's schema and contract, its lineage, recent commits and their writers, correlated anomalies elsewhere, recent deployment events where that feed exists, and produces a causal hypothesis with a confidence and a blast-radius estimate: which downstream datasets and consumers the anomaly reaches if unaddressed, straight from the lineage the semantic tier already maintains. The hypothesis is the difference between an alert and an incident report, and it is also the input the response planner needs, since remediating a duplicate surge, a schema drift, and a source outage are different plays.

The action tier is deliberately narrow, and this is the design decision that makes the whole system approvable: the agent acts only through a fixed set of governed tools, exposed through exactly the stateless MCP gateway architecture my companion article builds, each tool a bounded operation, quarantine rows matching a predicate to the named quarantine table, quarantine a partition, open a remediation branch, run the verification suite, fast-forward on pass, roll back to a named snapshot, file a ticket, page a human. The agent composes these into responses, and it cannot exceed them: no raw SQL authoring, no raw table access, the same selection-over-authoring argument my text-to-SQL article makes, applied to actions instead of queries. A hijacked or hallucinating agent's ceiling is a wrong-but-bounded tool call, logged, reversible, and structurally unable to drop a table it was never granted a tool for.

The memory tier closes the loop over time: incidents, hypotheses, actions, outcomes, and human overrides accumulate as the agent's case history, which feeds three things, better baselines, faster recognition of recurring patterns, and the evidence trail that autonomy expansion decisions read. The memory lives in tables like everything else, queryable by the humans supervising, because an agent whose experience is inspectable is an agent whose judgment can be audited.

## Autonomy Tiers: Earning the Right to Act

The organizational failure mode of quality automation is binary thinking, full autonomy or none, and the working pattern is graduated authority, declared per dataset in its contract, expanded on evidence.

Tier zero is observe: the agent senses, diagnoses, and reports, producing the incident narrative with hypothesis and recommended response, and touches nothing. Every deployment starts here, and tier zero alone typically beats the rulebook it replaces, because adaptive detection with causal diagnosis is most of the value.

Tier one is contain-with-approval: the agent stages the quarantine on a branch, runs verification, and presents the ready-to-publish action to a human, who approves with one review of the agent's evidence. Time-to-containment drops from triage-queue hours to approval minutes, and the human's role shifts from doing to judging, which is where trust gets built, since every approval is a supervised rehearsal of the autonomous behavior.

Tier two is contain-autonomously: for datasets whose contracts permit it, the agent publishes containment within bounds, quarantine volume caps, confidence floors, protected partitions it never touches, and notifies rather than asks, with remediation beyond containment still gated. This is the tier where the platform's cadence is finally matched: a poisoned batch is fenced in the minutes after it lands, at 3 a.m., before the morning jobs consume it.

Tier three is remediate-within-playbooks: for the recurring, well-understood incident classes, the duplicate surge with the known fix, the late-arriving correction pattern, the agent executes the full play, contain, fix on branch, verify, publish, reinstate, inside playbooks that humans authored and the case history validates. Novel incidents always escalate, whatever the tier, because the tiers bound authority by situation familiarity, not just by dataset.

A word on what remediation means beyond containment, because the playbook tier's scope decides its risk. The safe remediation classes share a property: they are derivable from data the estate already holds. Deduplication keeps the authoritative row by a declared ordering. Late-arriving corrections supersede by key and timestamp. Reinstatement returns quarantined rows the finer analysis cleared. Backfill-from-source replays a range through the pipeline's own idempotent path. What playbooks never do is invent values: imputation, guessing the missing amount, synthesizing the plausible timestamp, stays out of the autonomous tiers entirely, offered at most as a flagged proposal for a human who understands the downstream statistics, because a quality system that fabricates data has changed sides.

The expansion discipline is what makes the ladder safe: promotion from tier to tier is per dataset, evidence-based, and reversible, argued from the case history, this agent has proposed correct containment on this table forty times with two human corrections, and recorded in the contract like any governance change, through review. Demotion is equally one commit, which is the property that lets a cautious organization climb at all.

## The Human Loop, Designed Rather Than Assumed

Supervised autonomy lives or dies on the supervision experience, and three deliberate designs keep the humans effective rather than decorative.

Approvals must be judgeable in minutes: the agent's request presents the hypothesis, the evidence, the exact staged action with its verification results, and the rollback plan, in a fixed format humans learn to read fast, because an approval queue that requires re-deriving the analysis just relocated the triage burden. The quality bar is that a domain owner approves routine containment from their phone, and the format is engineered until that is true.

Overrides are first-class data: when a human rejects, amends, or reverses an agent action, the correction and its reason enter the case history as the most valuable records in it, feeding both the agent's future behavior and the tier-promotion evidence. A system that makes overriding awkward teaches its humans to stop supervising, which is how automation earns its bad reputation.

The supervising role itself deserves a name and a rotation, because unowned supervision decays into rubber-stamping within a quarter: the working pattern assigns quality duty the way operations assigns on-call, a rotating owner per domain who works the approval queue, grades the narratives, and carries the disposition backlog, with the rotation spreading the judgment skill the tier promotions depend on and the role's time cost showing up honestly in the supervision-load metric rather than hiding in everyone's margins.

And attention is budgeted like the scarce resource it is: escalations are ranked by blast radius and confidence, routine notifications batch into digests, and the paging threshold belongs to the dataset's owner, not the platform, because the human loop's failure mode is the same alert fatigue the rulebook died of, and the agent's entire advantage is that it can afford to be quiet about what it handled.

## Sensing in Depth: What the Agent Watches

The detection tier's craft deserves its own section, because adaptive is easy to say and specific to build, and the signal stack that works layers four altitudes.

Metadata signals cover the estate continuously at near-zero cost: snapshot cadence against the table's learned rhythm catches stalled and runaway writers, per-commit row and file deltas catch volume anomalies and small-file storms, and the value bounds and null counts the format keeps per column catch the coarse content shifts, all read from the metadata tables without touching a data file. This altitude is why the agent's coverage scales with the estate while the rulebook's never did: watching a thousand tables at metadata grain costs what watching ten did.

Profile signals go deeper on schedule and on suspicion: sampled distributions per column, cardinalities, pattern conformance on the string columns that carry codes and identifiers, with the profiles themselves stored as history so drift is measured against seasonal baselines rather than last week. The agent budgets this altitude, profiling hot and contract-tight tables often, cold tables rarely, and anything the metadata tier flagged immediately.

Relational signals check what single-table stats cannot: referential consistency between declared related tables, reconciliation of measures that should agree across layers, the sums that the semantic layer's lineage says must match, and conservation checks across pipeline stages, rows in against rows out plus quarantined. These are the checks that catch the subtle corruptions, the join that silently started dropping a segment, and they come nearly free once the goals declare the relationships.

And change signals contextualize everything: schema evolution events, new writers appearing in the commit history, upstream deployment markers where the platform ingests them, because the diagnosis tier's best predictor of cause is what changed near the anomaly, and feeding it the change stream directly turns correlation into hypothesis in one step.

The stack's output discipline matters as much as its inputs: every signal is scored against its baseline, scores compose into goal-level health per dataset, and the composed health is what drives action, which prevents the failure where one twitchy detector runs the whole system. Detectors propose. Goals decide.

## Where This Sits Among the Tools You Already Run

The agent does not arrive on an empty field, and positioning it against the existing quality stack prevents both duplication and turf confusion.

Pipeline tests keep their job. The assertion suites in transformation frameworks, the schema tests, accepted-values checks, and relationship tests that run with every pipeline deploy, are pre-deployment gates on logic, and they stay: they catch what the developer changed, at development cadence, and the agent catches what the world changed, at data cadence. The two meet in the contract, since the declared goals generate the obvious static assertions for free, one definition serving both the deploy gate and the runtime watch.

Write-audit-publish generalizes rather than disappears. The branch-stage-verify-publish discipline the agent uses for remediation is the same WAP pattern pipelines use for their own writes, which I treat in depth in its own article, and estates running WAP at the pipeline level hand the agent a gift: quality checking moves inside the write path for planned changes, and the agent's runtime loop covers what arrives between and beneath the pipelines, the CDC streams, the third-party feeds, the drift no deploy caused.

Observability platforms overlap most and integrate best. The monitoring tier of the commercial data-observability generation, learned baselines, anomaly feeds, lineage-aware alerting, is the sensing tier of this architecture wearing a product badge, and where one is already deployed, its detections can feed the agent's diagnosis and action tiers rather than competing with them: the observability tool notices, the agent contains through the governed tools, which is a cleaner division than either doing both. What the agent architecture adds that the observability generation stopped short of is precisely the acting: bounded, substrate-safe response, which is where the Iceberg mechanics and the autonomy tiers earn the whole design.

And human data stewardship gets promoted, not replaced: the reviews, the disposition decisions, the definition arguments stay human, with the agent converting steward time from scanning dashboards to judging evidence, which is the trade every mature automation makes with its profession.

## Measuring the Program

The program needs numbers that resist theater, and four earn the dashboard.

Time from violation to containment, the headline metric, measured from the anomaly's first appearance in data to the publish of its containment, reported as a distribution, because the tail is where the damage was. The rulebook era rarely measured this at all, which was its own tell.

Escaped incidents: quality problems discovered downstream, by consumers, that the agent neither caught nor contained, counted honestly through the incident process, trending down as baselines and goals mature. This is the recall metric, and it disciplines the temptation to tune for quiet.

Action precision: of the agent's containments and remediations, the fraction humans upheld on review, from the case history's override records, reported per dataset and per playbook, because this is the number autonomy promotions read and the number that keeps the overzealous-janitor failure honest.

And supervision load: human minutes per week in approvals and escalations, per dataset, trending down as tiers rise, because the program's economic promise is exactly this line, and a system whose precision rises while its supervision load does not is a system whose tier assignments are too timid, which the quarterly review should say out loud.

## A Worked Example: The Duplicate Surge at 2 a.m.

The composite incident, in this series' pattern, with no invented benchmark numbers, walking one anomaly through the whole machine.

The estate is the one these articles assemble: Iceberg tables under a REST catalog, CDC mirrors feeding an orders table, contracts as code declaring the orders dataset's goals, uniqueness on order_id, volume stability, freshness under five minutes, with the dataset at autonomy tier two for containment. At 2:04 a.m., a retry bug ships in an upstream service, and duplicate order events begin flowing, same business keys, new event identifiers, under the volume ceiling any static rule was watching.

The sensing tier notices at 2:11: per-commit distinct-key ratio on the last three commits drifts from its baseline, a metadata-adjacent signal computed from the arriving batches, and the composed uniqueness goal degrades past its band. Diagnosis assembles context in the next minute: the anomaly began at a commit boundary, correlates with no schema change, matches a known pattern in the case history, retry-shaped duplication, and the change stream shows an upstream deploy at 2:01. The hypothesis publishes with high confidence: duplicate delivery from the upstream deploy, blast radius the orders table and four downstream datasets whose morning jobs run at 6:00.

Containment stages at 2:13: the agent opens a branch, identifies the suspect rows, later-arriving duplicates by key within the incident window, moves them to the quarantine table with provenance, and runs verification: distinct-key ratio restored, volumes rejoin baseline, order totals move by exactly the quarantined amount. Checks pass, tier two authority covers the action, and the fast-forward publishes at 2:16. Twelve minutes, detection to containment, with the pipeline never paused, the downstream jobs never fed the duplicates, and the humans asleep.

Run the counterfactual to price the machine, because the comparison is the business case. Under the rulebook, the duplicate surge stays under every threshold until the 6 a.m. jobs propagate it into four downstream datasets and the revenue dashboard, the first human signal is a finance analyst's midmorning question, and the day goes to triage, blast-radius archaeology by hand, downstream reruns, and the apology thread. The violation window is ten hours instead of twelve minutes, the containment cost is a team-day instead of a review, and the trust cost lands on the platform either way, except in one version the platform caught it. Multiply by the incident rate any honest estate admits to, and the agent program's budget line explains itself.

The morning is the part that builds the program: the on-call finds a complete incident narrative, hypothesis, evidence, action, verification, with a proposed tier-three remediation staged for approval, reinstating the eleven quarantined rows the finer analysis cleared as legitimate same-key reorders. The upstream team gets the diagnosis with their deploy fingered, gently, by timestamp. The case history gains its forty-first duplicate-surge entry, which is the evidence base the quarterly autonomy review reads when the orders dataset's owner promotes the duplicate playbook to tier three. And the quality dashboard's line for the incident shows what the rulebook era never produced: a violation window measured in minutes, bounded by machine response, documented better than most human incidents.

## Getting Started: One Quarter, One Domain

The adoption sequence mirrors this series' other programs, small, evidence-building, and expansionary by earned trust, and it fits a quarter for a first domain.

Weeks one through three build the floor: quality sections added to the contracts of one domain's datasets, a dozen tables is plenty, with the owners writing the goals in the workshop that doubles as the definitional argument the domain owed itself anyway. The sensing tier deploys against those contracts at tier zero, baselines begin learning, and the first artifact ships immediately: the quality health view per dataset, composed from the goal scores, which typically surprises somebody about a table everyone trusted.

Weeks four through eight run observe mode for real: anomalies produce incident narratives, the narratives get graded by the owners, the graded results tune the detectors and start the case history, and the quarantine machinery gets built and rehearsed on synthetic incidents, the branch-verify-publish path exercised end to end before it ever acts in anger. The gateway tools deploy in the same window, granted to the agent principal at read-and-report scope only, because the tool tier's existence precedes its authority.

Weeks nine through twelve climb the first rungs: the datasets whose narratives graded well move to contain-with-approval, the approval format gets engineered against real cases until phone-judgeable, and the first genuine incident handled through approval becomes the program's internal story. The quarter ends with the review that sets the next one's ladder: which datasets earned tier two, which playbooks are candidates for authorship, and what the four metrics say, with the honest expectation set from the start that autonomy is a next-year word for the critical tables and a next-month word for the ones where wrong containment costs little.

The anti-pattern to refuse at the kickoff is the estate-wide rollout: goal declaration across a thousand tables produces a thousand shallow contracts and no case history, while one domain's deep loop produces the evidence, the playbooks, and the advocates that make the second domain's quarter half as long.

## Failure Modes

**The overzealous janitor.** A baseline mislearns, the agent quarantines legitimate data, and trust burns fastest exactly here. The defenses stack: confidence floors and volume caps per action, protected partitions and tables the contract exempts, verification that includes business-total checks, and the tier system itself, since the datasets where wrong containment is costliest simply stay at approval tiers. The bounded worst case, a reversible quarantine with full provenance, is the design absorbing the failure it cannot fully prevent.

**Baseline poisoning.** A slow corruption drifts the baselines until wrong looks normal, the adaptive system's version of the boiled frog. Defenses: baselines learn on quarantine-cleaned data only, long-window anchors constrain short-window adaptation, and the declared goals include the absolute invariants that never adapt, keys are unique, amounts are non-negative, the contract's constitutional layer.

**Quarantine as landfill.** Containment works so well that nobody does the reinstatement reviews, and the quarantine tables silently accumulate the estate's unresolved questions. The defense is the lifecycle from the pattern section made mandatory: aging alerts on quarantine batches, disposition required within the contract's window, and the quarantine backlog on the same dashboard as the quality scores, because contained is not resolved.

**Alert fatigue, relocated.** The agent escalates too eagerly and the approval queue becomes the muted channel. Defenses: the attention budget from the human-loop section, escalation ranked by blast radius, digests for the routine, and the promotion path itself, since the correct response to a reliable stream of correct proposals is granting the tier that stops asking.

**The confident wrong hypothesis.** Diagnosis produces a plausible, wrong cause, and humans anchored on it chase the wrong fix. Defenses: hypotheses ship with their evidence and their confidence, alternatives listed when the signal is ambiguous, and the case history scores diagnostic accuracy over time, which keeps the narrative tier honest and tells you when to trust it.

**Agent-writer conflicts.** The agent's branch publishes into a table mid-stream while writers commit, and optimistic concurrency does its retry dance at the worst time. Defenses: containment actions target closed windows and quiesced partitions where the pattern allows, the tools serialize agent publishes with the table's maintenance lane, and the same commit-conflict hygiene every multi-writer Iceberg table needs, which the platform owed the table anyway.

## Conclusion

Rule-based data quality hit its ceiling because rules encode the past, decay silently, and end at an alert, while modern estates fail in novel ways at machine cadence. The goal-directed alternative is buildable now, and its safety is not a promise about model behavior: it is an architecture. Owners declare properties. Statistics watch everything the metadata exposes and learn what normal means. A language tier turns anomalies into hypotheses with blast radii. And every action flows through bounded, governed tools onto a substrate, Apache Iceberg's snapshots, branches, and atomic publishes, where containment is staged, verified, reversible, and invisible until proven, with quarantine tables and partitions as the pattern that separates suspect data from consumers without losing it.

Start at observe, let the incident narratives earn the approval tier, let the approval history earn autonomy, dataset by dataset, playbook by playbook, with every expansion a reviewed change and every action an audited commit. The destination is a quality system that finally matches the estate it protects: continuous, adaptive, and fast where the platform is fast, with humans supervising judgment instead of performing triage. The 2 a.m. incidents keep happening. The difference is who handles the first twelve minutes.

## Keep Going

If this piece was useful, the surrounding architecture connects across my writing: the table format mechanics in *Apache Iceberg: The Definitive Guide* from O'Reilly, the platform design in *Architecting an Apache Iceberg Lakehouse* from Manning, and my recent work on agentic analytics and governed AI builds the tiers this system stands on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
