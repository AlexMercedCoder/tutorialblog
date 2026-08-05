---
title: "Designing Policy-Aware Telemetry Tables for AI Systems in Apache Iceberg"
date: "2026-08-04"
description: "Designing policy-aware AI telemetry tables in Apache Iceberg: what to log, tamper evidence, retention against conflicting deletion requirements, and tracing agent decisions."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - Apache Iceberg
  - AI Telemetry
  - EU AI Act
  - Governance
  - Compliance
canonical: "https://iceberglakehouse.com/posts/policy-aware-ai-telemetry-iceberg/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/policy-aware-ai-telemetry-iceberg/).

# Designing Policy-Aware Telemetry Tables for AI Systems in Apache Iceberg

*By Alex Merced, Data Lakehouse and AI Evangelist*

Two days ago, on August 2, 2026, the EU AI Act's Article 50 transparency obligations came into application. Many teams had that date circled for a different reason: it was originally when the bulk of the high-risk regime was due to bite. That part moved. Standalone Annex III high-risk systems now have until December 2, 2027, and AI embedded in regulated products under Annex I until August 2, 2028, following the Digital Omnibus on AI that the European Parliament endorsed on June 16, 2026 and the Council gave final approval to on June 29.

The tempting read is that there is time. The correct read is close to the opposite, and getting it wrong is expensive in a specific way. The obligations that arrive in December 2027 require a record of how systems behaved over the period leading up to it, and you cannot retroactively log what an agent was thinking last spring. Sixteen extra months is not a pause. It is the window in which the logging you will be asked for has to already be running.

This piece is about the engineering of that logging. What an AI telemetry record needs to contain, how to make an Iceberg table tamper-evident without pretending it is immutable, how to handle retention against conflicting deletion requirements, and how to query agent traces when someone asks why a decision was made.

A disclosure. I work for Dremio, which was acquired by SAP and now sits within SAP Business Data Cloud. I am an engineer rather than a lawyer, and nothing here is legal advice. Get your obligations from counsel and use this piece for the data architecture that sits underneath them.

## What actually applies right now

Precision matters here because stale guidance is the leading compliance risk on this topic.

**In effect today.** Article 5 prohibited practices, in force since February 2025. General-purpose AI model obligations, in force since August 2025. Article 4 AI literacy duty. And as of August 2, 2026, the Article 50 transparency obligations, which cover telling people they are interacting with an AI system and labeling synthetic content. Those were not part of the deferral.

**Coming December 2, 2026.** Article 50(2) marking and machine-readable detection requirements for generative systems already on the market before August 2026, plus the new Article 5 prohibitions the Omnibus introduced, including AI-generated non-consensual intimate imagery and child sexual abuse material.

**December 2, 2027.** High-risk obligations for standalone Annex III systems: hiring tools, credit scoring, biometric identification, and the rest of the Annex III list.

**August 2, 2028.** High-risk obligations for AI embedded in regulated products under Annex I.

Penalty exposure has not moved at all. Prohibited practices carry fines up to 35 million euros or 7 percent of turnover. Transparency and high-risk breaches sit in the 15 million euro or 3 percent tier.

The engineering consequence is straightforward. If any of your agent workloads fall into Annex III, the record-keeping design is a 2026 project even though the obligation carries a 2027 date. If none of them do, the telemetry is still worth building, because every argument below stands on operational grounds alone.

## What a telemetry record has to answer

Regulatory language talks about logging, traceability, and record-keeping. Translating that into schema means asking which questions the record has to answer.

Six questions cover it.

**What was decided or produced.** The output, in a form that can be compared to what the user or downstream system received.

**On what basis.** The inputs the system saw, at the values it saw them, with timestamps. Not the current values. The ones in front of the model at the time.

**By what logic.** The reasoning, the model identity and version, the prompt or configuration, and the definitions of any metrics involved.

**For whom.** The identity of the requester, and the identity the system authenticated as when it accessed data.

**Under what authority.** Which permissions applied, which policies were evaluated, and whether a human approved.

**With what effect.** What the system did afterward, and whether the intended effect occurred.

A record that answers those six is defensible. A log line that says an agent ran and returned a result answers none of them, and that is what most systems are producing today.

## The table design

Three tables rather than one, because they have different volumes, different retention needs, and different sensitivity profiles.

The **invocations** table is the top-level record of a request and its outcome.

```sql
CREATE TABLE governance.ai.invocations (
    invocation_id      STRING,
    session_id         STRING,
    system_id          STRING,   -- which AI system, for per-system obligations
    surface            STRING,
    principal          STRING,   -- authenticated requester
    on_behalf_of       STRING,   -- end user, where an agent acts for someone
    started_at         TIMESTAMP,
    completed_at       TIMESTAMP,

    model_id           STRING,
    model_version      STRING,
    config_hash        STRING,   -- prompt and settings fingerprint
    input_summary      STRING,
    output_summary     STRING,
    reasoning          STRING,

    human_review       STRING,   -- not_required, pending, approved, rejected
    reviewed_by        STRING,
    reviewed_at        TIMESTAMP,

    outcome            STRING,
    error_class        STRING,
    tokens_in          BIGINT,
    tokens_out         BIGINT
)
USING iceberg
PARTITIONED BY (days(started_at), system_id)
TBLPROPERTIES (
    'format-version'      = '3',
    'write.update.mode'   = 'merge-on-read',
    'write.delete.mode'   = 'merge-on-read'
);
```

The **tool calls** table records every action the system took, and it is the high-volume one.

```sql
CREATE TABLE governance.ai.tool_calls (
    call_id            STRING,
    invocation_id      STRING,
    sequence_no        INT,
    tool_name          STRING,
    parameters         VARIANT,
    generated_query    STRING,
    data_source        STRING,
    snapshot_id        BIGINT,   -- Iceberg snapshot the answer came from
    data_as_of         TIMESTAMP,
    rows_returned      BIGINT,
    policy_decisions   VARIANT,  -- which policies evaluated, and how
    outcome            STRING,
    called_at          TIMESTAMP
)
USING iceberg
PARTITIONED BY (days(called_at))
TBLPROPERTIES ('format-version' = '3');
```

The **effects** table records what changed in the world and whether it was verified.

```sql
CREATE TABLE governance.ai.effects (
    effect_id          STRING,
    invocation_id      STRING,
    action_type        STRING,
    target_system      STRING,
    target_entity      STRING,
    parameters         VARIANT,
    idempotency_key    STRING,
    executed_at        TIMESTAMP,
    expected_effect_by TIMESTAMP,
    verified_at        TIMESTAMP,
    verification_state STRING,
    compensated_at     TIMESTAMP
)
USING iceberg
PARTITIONED BY (days(executed_at));
```

Four design choices in there are worth defending.

**`snapshot_id` on every tool call.** This is the field that makes reproducibility exact rather than approximate. Combined with Iceberg time travel, an auditor queries the source table as of that snapshot and sees precisely what the system saw. No other mechanism gives you that, and it costs one integer.

**`on_behalf_of` separate from `principal`.** An agent acting for a user has two identities, and conflating them makes both the audit trail and the access decisions ambiguous.

**`policy_decisions` as a Variant column.** Which policies were evaluated and what they returned varies by policy engine and evolves over time. Variant absorbs the shape without a schema migration per change, and V3 shredding gives you file pruning on the fields you filter by.

**`config_hash` rather than the full prompt.** Prompts are large and repetitive. Store the hash on every invocation and the full text once per distinct configuration in a small lookup table. You get exact attribution without multiplying storage by invocation count.

## Tamper evidence without pretending to immutability

Regulators ask for records that cannot be quietly altered. Iceberg tables are mutable. Both statements are true, and the gap is bridgeable.

Four properties combine into a defensible position.

**Snapshot history.** Every commit creates a snapshot with a timestamp and a summary of what changed. The history is queryable, and a modification to past data appears as a new snapshot rather than as an invisible edit.

```sql
SELECT
    snapshot_id,
    committed_at,
    operation,
    summary['added-records']    AS added,
    summary['deleted-records']  AS deleted
FROM governance.ai.invocations.snapshots
ORDER BY committed_at DESC
LIMIT 50;
```

A row of `deleted-records` on a telemetry table that should only ever append is a finding, and it is visible to anyone with read access.

**Time travel.** An auditor queries the table as of a past timestamp and sees what it contained then. Comparing that to the current contents surfaces any alteration.

```sql
SELECT COUNT(*) FROM governance.ai.invocations
FOR TIMESTAMP AS OF TIMESTAMP '2026-06-30 23:59:59'
WHERE started_at BETWEEN DATE '2026-06-01' AND DATE '2026-06-30';
```

Run that same query against the current table. A difference means June's records changed after June ended.

**Catalog-enforced write restriction.** Only the logging service holds write grants. Analysts and auditors hold read only. This is object-level authorization in Apache Polaris or an equivalent, and it is the control that makes the first two properties meaningful.

**Retention floor on snapshots.** Snapshot expiration is what removes history. Setting a retention period longer than your audit obligation, and restricting who can run expiration, prevents the one operation that erases the evidence.

For the strongest posture, add object-lock or write-once storage at the bucket level for the telemetry prefix, and periodically publish a digest of the table state to a separate system. Neither is required by the format. Both are cheap.

The honest framing to give a compliance team: these tables are append-only by policy and tamper-evident by construction, not immutable by physics. That is the same posture as most enterprise audit systems, and stating it accurately is better than overclaiming.

## Retention against conflicting requirements

The hard part, and the one that surprises engineering teams.

Article 12 record-keeping expects logs retained for a period appropriate to the system's purpose, with deployer obligations in Article 26 setting a floor commonly read as at least six months. Sectoral rules push longer. Meanwhile, data protection law pushes the other way: personal data should not be kept longer than necessary, and individuals have deletion rights.

A telemetry table full of prompts, inputs, and outputs contains personal data almost by definition. You have an obligation to keep it and an obligation to delete it, and they overlap.

Three techniques resolve most of the tension.

**Separate identity from content.** Store a pseudonymous subject key in the telemetry tables, and hold the mapping to real identity in a separate, smaller, more tightly controlled table. A deletion request removes the mapping. The telemetry record survives with its statistical and audit value intact and without identifying anyone.

**Tier the retention.** Full detail including reasoning text and parameters for a shorter window. Structured fields without free text for a longer one. Aggregate counts indefinitely. Implement as scheduled jobs that progressively strip columns rather than as one delete-everything policy.

**Make targeted deletion cheap.** When a record genuinely has to be removed, Iceberg V3 deletion vectors make row-level deletes efficient on the read side, and merge-on-read means the delete does not rewrite gigabytes. Partitioning by day and by system keeps the affected file set small.

```sql
-- remove identifying free text while retaining the auditable record
UPDATE governance.ai.invocations
SET input_summary = NULL,
    output_summary = NULL,
    reasoning = '[redacted per retention tier 2]'
WHERE started_at < current_date - INTERVAL '180' DAY
  AND reasoning IS NOT NULL;
```

Write the retention policy down as a document that maps each column to a tier and a duration, get it reviewed by whoever owns privacy, and implement it as code that runs on a schedule. A policy that exists only as an intention is worse than no policy, because it creates an expectation you are not meeting.

One caution: expiring snapshots is what actually frees the storage and removes the historical versions. A redaction that leaves ninety days of snapshots containing the original text has not deleted anything yet.

## Querying traces when someone asks

The reason to build this properly is the day someone asks a specific question. Three queries cover most of what gets asked.

**Reconstruct one decision end to end.**

```sql
SELECT
    i.invocation_id,
    i.started_at,
    i.on_behalf_of,
    i.model_id,
    i.model_version,
    i.human_review,
    i.reasoning,
    t.sequence_no,
    t.tool_name,
    t.data_source,
    t.snapshot_id,
    t.data_as_of,
    t.rows_returned,
    e.action_type,
    e.target_entity,
    e.verification_state
FROM governance.ai.invocations i
LEFT JOIN governance.ai.tool_calls t ON t.invocation_id = i.invocation_id
LEFT JOIN governance.ai.effects    e ON e.invocation_id = i.invocation_id
WHERE i.invocation_id = '01JQ...'
ORDER BY t.sequence_no;
```

That single result set answers all six questions from earlier, which is the test of whether the schema was right.

**Find decisions affected by a model change.**

```sql
SELECT
    model_id,
    model_version,
    date_trunc('day', started_at)                     AS day,
    COUNT(*)                                           AS invocations,
    SUM(CASE WHEN human_review = 'rejected'
             THEN 1 ELSE 0 END)                        AS rejected,
    ROUND(100.0 * SUM(CASE WHEN human_review = 'rejected'
             THEN 1 ELSE 0 END) / COUNT(*), 2)         AS reject_pct
FROM governance.ai.invocations
WHERE started_at >= current_date - INTERVAL '90' DAY
GROUP BY model_id, model_version, 3
ORDER BY 3 DESC;
```

A rejection rate that steps up on the day a model version changed is the correlation nobody can establish without recording the version.

**Audit access to a sensitive source.**

```sql
SELECT
    i.on_behalf_of,
    t.data_source,
    COUNT(*)                        AS accesses,
    SUM(t.rows_returned)            AS rows_seen,
    MIN(t.called_at)                AS first_access,
    MAX(t.called_at)                AS last_access
FROM governance.ai.tool_calls t
JOIN governance.ai.invocations i ON i.invocation_id = t.invocation_id
WHERE t.data_source = 'hr.compensation'
  AND t.called_at >= current_date - INTERVAL '365' DAY
GROUP BY 1, 2
ORDER BY rows_seen DESC;
```

Building these three as saved views before anyone asks is worth an afternoon of somebody's time. The alternative is writing them under pressure with a regulator's deadline attached.

## Volume, cost, and what to actually store

Telemetry at agent scale is a data engineering problem in its own right, and the schema above generates more volume than teams expect.

A rough shape. One user question produces one invocation row, five to ten tool call rows, and zero or one effect rows. The invocation row is large because of the reasoning text. The tool call rows are small except for `generated_query` and `parameters`. At a thousand questions a day you have a modest table. At a hundred thousand you have a real one, and the reasoning text dominates.

Four decisions control the cost.

**Store the articulated reasoning as text, not the full conversation transcript.** The articulated rationale for the decision is what answers the audit question. Replaying every intermediate model turn multiplies volume by a large factor and adds little that an auditor asks for.

**Deduplicate configuration.** The `config_hash` pattern above turns a repeated multi-kilobyte prompt into a 32-character string per invocation plus one row per distinct configuration. On a system with a stable prompt, this alone cuts the invocations table by most of its size.

**Use Variant with shredding for the semi-structured columns.** `parameters` and `policy_decisions` hold nested documents whose shape varies by tool. Under V3 with shredding enabled, the fields you filter on become real Parquet columns with statistics, so an audit query filtering on a policy outcome prunes files instead of scanning every document.

**Partition for the query pattern you will actually run.** Audit queries filter by time and by system, occasionally by principal. Partitioning by day and by system covers it. Resist partitioning by principal, which produces high cardinality and small files.

Then treat these like any other production table. They need compaction, because a telemetry table written continuously by a logging service accumulates small files faster than almost anything else in your estate, and an audit query against four hundred thousand tiny files is the reason someone concludes the compliance tooling is too slow to use.

One more note on the write path. The logging service is a high-frequency writer to a shared table, which is exactly the commit contention pattern that bites agent workloads generally. Buffer the writes and let one process commit on behalf of many. A telemetry system that degrades the platform it is observing is a bad trade.

## Making the record legible to non-engineers

The people who read these tables under pressure are frequently not the people who built them, and a schema that requires tribal knowledge fails at the moment it matters.

Three artifacts close that gap and each takes a day.

**A data dictionary for the telemetry tables**, written for a compliance reader rather than an engineer. What each column means, what values it takes, what an absent value indicates, and which regulatory question it helps answer. Keep it in the same repository as the schema so it changes when the schema does.

**Saved views that answer questions rather than expose tables.** A view named `ai_decision_trace` that takes an invocation ID and returns a readable joined result is far more usable than three tables and a join someone has to reconstruct. Build the three queries from the previous section as views with clear column names.

**A worked example.** One documented, fully reconstructed decision from your own system, walked through end to end, showing which field answered which question. This is what you hand a new compliance analyst, an external auditor, or a regulator's technical staff. It takes an afternoon and it changes how the entire system is perceived.

There is a related organizational point. The telemetry tables have two audiences with different access needs. Engineers debugging behavior want broad read access and short retention. Compliance and audit want narrow, controlled access and long retention. Model those as separate grants against the same tables through catalog roles rather than as two copies of the data, since a second copy is a second thing to secure and a second thing to keep consistent.

## Where this fits in a wider governance posture

The AI Act is one framework among several, and the telemetry design should not be built for it alone.

Sectoral regulation frequently imposes its own record-keeping. Financial services, healthcare, and employment all have existing obligations that an automated decision inherits. A record designed to answer the six questions from earlier serves those too, because the questions are not specific to the AI Act. They are what anyone asks when an automated system produced a consequential outcome.

Internal accountability is the more common use by a wide margin. Most queries against these tables will come from your own teams asking why an answer was wrong, whether a model change helped, which use cases cost the most, and whether a loop is drifting. Those uses justify the build on their own, and the regulatory readiness comes along with it.

The design principle worth carrying: build the record because you need it to operate the system, then verify it satisfies the obligations. Systems built the other way around, where compliance drives the schema, tend to produce records that satisfy an auditor and help nobody day to day, which means they rot between audits.

The last consideration is where all of this lives. Putting AI telemetry in the same lakehouse as your business data means one governance model, one set of retention tooling, one query engine, and one place where an investigator correlates an agent's decision with the business outcome that followed. Splitting it into a separate observability platform gives you a second system with its own access model and no ability to join across the boundary. The join is usually the whole point of collecting any of it.

## Failure modes

**Logging written after the fact.** A record assembled from application logs post hoc is a reconstruction, and it will be missing the input snapshot and the alternatives considered. Write the record as part of the transaction, not as an afterthought.

**Reasoning captured as a summary.** A one-line summary of why the system did something is not the reasoning. Store the model's actual articulated rationale, which is why the tool schemas in an agentic architecture should require a rationale as an input rather than hoping for one in the output.

**No `snapshot_id`.** Without it, reproducing what the system saw is impossible on any table that has changed since. This is the cheapest field in the schema and the most valuable.

**Telemetry that costs more than the system.** Full reasoning text at high volume is real storage and real query cost. Tier retention from the start rather than discovering the bill.

**Ungoverned telemetry.** A table containing every prompt and every result is one of the most sensitive assets you have. Apply the same catalog authorization, credential vending, and row-level policy as any regulated table. Teams routinely leave it open because it is thought of as logs rather than as a record of everything anyone asked and everything the system answered.

**No verification field.** The effects table records that an action was taken and never whether it worked. Half the audit value is in the outcome, not the intent.

**Deletion requests with no plan.** The first one arrives and nobody knows which tables contain the subject's data or how to remove it without destroying the audit record. Design the pseudonymization split before you need it.

**Snapshot expiration set shorter than the obligation.** Someone tunes storage cost and quietly reduces the retention that makes time travel meaningful.

**Assuming the deferral is a pause.** Sixteen extra months on high-risk obligations does not extend the period you need records for. It moves the date on which you will be asked for records covering the preceding period.

**Treating telemetry as logs rather than as data.** Logs get shipped to a system with seven-day retention and no schema. The record you need is a governed table with a designed schema and a retention policy, and the difference is decided by which team owns it.

## What to do in the next quarter

A practical sequence given where the dates actually sit.

**Classify your systems.** Which agent workloads fall into Annex III, which are general-purpose, which touch Article 50 transparency. This is a legal exercise with engineering input, and everything else depends on it. Do it as a written inventory with a named owner per system rather than as a conversation, because the inventory is itself something you will be asked to produce.

**Turn on the transparency obligations that are live now.** Article 50 applies as of two days ago. Disclosure that a user is interacting with an AI system, and labeling of synthetic content, are not deferred.

**Stand up the three telemetry tables.** They cost little, they are operationally valuable regardless of regulation, and the record you will be asked for in 2027 is the one you start collecting now.

**Write the retention policy and implement it as scheduled code.** Tier by column, get it reviewed, and make sure snapshot expiration aligns with it.

**Govern the telemetry tables properly.** Write grants to the logging service only, read grants scoped deliberately, and the same policy engine you apply to any sensitive source.

**Build the three saved queries.** Decision reconstruction, model-change correlation, and sensitive-source access.

**Set a review cadence on the regulatory position.** The Omnibus changed dates once and the implementing standards, harmonised technical standards and Commission guidelines among them, are still being finalized. Whoever owns this should be reading updates quarterly rather than annually, and the engineering team should hear about changes before they read them in a headline.

## Conclusion

The date moved and the work did not. Article 50 transparency applies now. High-risk obligations arrive in December 2027 for Annex III systems and August 2028 for embedded ones, and both will ask about behavior over a period that starts well before those dates.

Design the telemetry to answer six questions: what was decided, on what basis, by what logic, for whom, under what authority, and with what effect. Three Iceberg tables cover it. Record the source snapshot ID on every tool call, because that is what makes reproduction exact. Separate the requester identity from the identity acted on behalf of. Store a config hash rather than repeating prompts.

Then get the boring parts right. Write access restricted at the catalog, snapshot retention longer than the obligation, a written retention policy implemented as code, pseudonymization so deletion requests do not destroy the audit record, and three saved queries built before anyone asks.

None of this requires a compliance product. It requires three Iceberg tables designed by someone who thought about the questions first, and a logging path that writes the record as part of the work rather than after it.

The deferral bought sixteen months of preparation, not sixteen months of quiet. Records covering that period are exactly what will be requested at the end of it.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and data governance. *Architecting an Apache Iceberg Lakehouse* covers table design, retention, and the platform decisions behind telemetry like this, and *Apache Polaris: The Definitive Guide* covers the catalog authorization that makes these tables defensible. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
