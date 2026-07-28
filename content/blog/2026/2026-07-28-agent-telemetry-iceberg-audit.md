---
title: "Building Agent Telemetry Tables in Iceberg That Survive an Audit"
date: "2026-07-28"
description: "A practical guide to building agent decision traces in Apache Iceberg that support audit reconstruction, governance review, and cost attribution across sessions."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - Apache Iceberg
  - AI Agents
  - Data Governance
  - Telemetry
canonical: "https://iceberglakehouse.com/posts/agent-telemetry-iceberg-audit/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/agent-telemetry-iceberg-audit/).

# Building Agent Telemetry Tables in Iceberg That Survive an Audit

An agent gives a customer-facing team a revenue number. Six weeks later someone asks where it came from. The application logs rolled off after 14 days. The tracing system has a span showing an LLM call took 3.2 seconds. Nobody can say which tables the agent read, what SQL it ran, which prompt produced that SQL, or whether a human approved anything.

That is not an unusual state. It is the default state, because the observability tooling most teams already run was built to answer "is the service healthy" and not "reconstruct this decision."

Those are different questions with different retention requirements, different query patterns, and different consumers. Service health is high-cardinality, short-lived, and read by engineers within minutes. Decision reconstruction is lower volume, retained for years, and read by an auditor eighteen months later who was not there.

I work at Dremio, and the storage layer I use throughout is Apache Iceberg, which is an open format anyone can adopt. I am also not a lawyer, and the regulatory material below is context for engineering decisions rather than legal advice. Get the compliance interpretation for your situation from counsel.

This piece covers why application logs fall short, what a decision trace actually needs to contain, how to schema it in Iceberg, how to write it without contending with your other pipelines, how to query it to reconstruct a session, and what the EU AI Act does and does not require of you.

## Why application logs are the wrong artifact

Traditional application logs are useful for operations and rarely sufficient for governance review, for four structural reasons.

**They are mutable and scattered.** Logs live across a log aggregator, a tracing backend, a database, and several application servers. Reconstructing one session means correlating across systems with different retention and different clocks. Any one of them dropping data breaks the reconstruction, and nothing tells you it happened.

**Retention does not match the requirement.** Log platforms are priced by ingest volume, so teams set 7-day or 30-day retention and forget it. A governance question arrives on a timescale of months to years.

**Correlation to a decision is weak.** A trace shows spans and timings. It does not carry the prompt, the retrieved context, the tool arguments, the SQL, and the human approval as a coherent record of one decision. You can put those in log lines, and then you are storing structured data in a system built for unstructured text.

**Access requires production privileges.** Reading production logs usually requires engineering access. A compliance reviewer does not have it and should not need it. Governance evidence that only engineers can retrieve is a process problem regardless of the data quality.

An analytical table solves all four. It is one place, it is queryable by anyone with a grant rather than a shell, it costs little to retain for years on object storage, and it holds structured columns rather than parsed strings.

Iceberg adds three properties that matter specifically here. Snapshots give you an immutable history where every write is recorded with a timestamp. Time travel lets you read the table as it stood at any past moment, which answers questions about what the audit record itself looked like. And append-only writes, which is what telemetry is, conflict with almost nothing, so a high-volume telemetry writer coexists with everything else.

## What a decision trace has to contain

The test for any telemetry schema is whether someone who was not present can reconstruct what happened and evaluate whether it was reasonable. Work backward from that.

Six things are needed, and most implementations capture two or three.

**Identity.** Who or what initiated this. The human user, the service account, the agent identity, and the principal the data access ran under. The last one is the field people forget and the one auditors ask about first.

**Version and configuration.** Which model, which version, which system prompt, which tool definitions, which agent code revision. An agent that behaved oddly in March behaved that way under a configuration that no longer exists, and without a record of it the investigation stops.

**Inputs.** The user's request and any context retrieved before reasoning. Retrieval matters as much as the prompt. An agent that got a wrong answer because retrieval returned a stale document has a different problem from one that reasoned badly on good context, and you cannot tell them apart without recording both.

**Actions.** Every tool call with its arguments, the result, and how long it took. For data access specifically, record the tables and columns touched and the SQL executed. This is the field that answers "what did it read," which is the question that comes up in both governance and debugging.

**Human involvement.** Whether a human reviewed, who, when, and what they decided. An approval that happened and was not recorded did not happen as far as any later review is concerned.

**Outcome.** What was returned, and separately, whether anything downstream acted on it.

Notice what is absent from that list: the model's internal reasoning as a mystical artifact. Record whatever reasoning text the model produced, treat it as one more input to review, and do not build the schema around the belief that it explains the decision. What explains the decision is the sequence of retrievals, tool calls, and results. That sequence is observable and the reasoning text is a claim about it.

## Schema design

Two tables, not one. Sessions and events. The join key is the session identifier.

```sql
CREATE TABLE governance.ai.agent_sessions (
    session_id            string,
    started_at            timestamp,
    ended_at              timestamp,
    user_id               string,
    agent_name            string,
    agent_version         string,
    model_id              string,
    system_prompt_hash    string,
    tool_manifest_hash    string,
    data_principal        string,
    initial_request       string,
    final_response        string,
    outcome_status        string,
    human_reviewed        boolean,
    reviewer_id           string,
    reviewed_at           timestamp,
    review_decision       string,
    total_tool_calls      int,
    total_tokens          bigint
)
USING iceberg
PARTITIONED BY (days(started_at))
TBLPROPERTIES (
    'format-version' = '3',
    'write.parquet.compression-codec' = 'zstd',
    'write.metadata.delete-after-commit.enabled' = 'true',
    'write.metadata.previous-versions-max' = '200'
);
```

```sql
CREATE TABLE governance.ai.agent_events (
    event_id              string,
    session_id            string,
    event_seq             int,
    occurred_at           timestamp,
    event_type            string,
    tool_name             string,
    tool_arguments        string,
    tool_result_summary   string,
    tool_result_bytes     bigint,
    sql_text              string,
    tables_accessed       array<string>,
    columns_accessed      array<string>,
    rows_returned         bigint,
    duration_ms           int,
    error_class           string,
    policy_checked        array<string>,
    policy_outcome        string
)
USING iceberg
PARTITIONED BY (days(occurred_at))
TBLPROPERTIES (
    'format-version' = '3',
    'write.parquet.compression-codec' = 'zstd'
);
```

Several decisions in there deserve explanation.

**Hashes for prompts and tool manifests, not the text.** A system prompt is long and repeats across every session. Storing the hash and keeping a separate small table mapping hashes to full text removes enormous duplication and still answers "was this the same configuration." The mapping table is tiny and never gets deleted.

**Partition by day on both tables.** Governance queries are almost always time-bounded, and retention policies operate on time. Day partitioning matches both. Iceberg's hidden partitioning means queries filter on the timestamp column directly with no partition column in the predicate.

**`event_seq` alongside `occurred_at`.** Timestamps collide at millisecond resolution when tool calls fire in parallel, and reconstruction depends on order. An explicit sequence number removes the ambiguity.

**Arrays for tables and columns accessed.** This is the field that makes the table useful beyond compliance. Querying which agents touched a given table, or which columns appear in agent access patterns, is how you find both governance problems and semantic layer gaps.

**Result summaries, not results.** `tool_result_summary` holds a bounded description. Storing full result sets turns your audit table into a copy of your warehouse and creates a data protection problem, since a summary of a query over customer records is not itself customer records.

**Policy fields on events.** `policy_checked` and `policy_outcome` record that a governance check happened and what it returned. An agent that queried applicable policy before acting leaves a record of having done so.

Format version 3 gives you deletion vectors, which matter because deletion requests against this table are a certainty even though the write path is append-only.

## Writing telemetry without hurting anything else

Telemetry writes are the definition of a workload that should never affect the thing it observes. Three rules.

**Never write synchronously in the agent's request path.** Buffer and write asynchronously. An agent that waits on a telemetry commit has coupled user latency to your governance infrastructure.

**Batch commits.** One commit per event produces a snapshot per event, and a table taking 50,000 events a day accumulates snapshots faster than any expiration schedule handles. Batch on a time or size trigger.

**Append only.** No updates, no merges. Appends conflict with almost nothing, so this writer coexists with maintenance and with any other process.

```python
import time
import uuid
import threading
from queue import Queue, Empty
import pyarrow as pa
from pyiceberg.catalog import load_catalog

class TelemetryWriter:
    """Buffered append-only writer for agent event telemetry."""

    def __init__(self, catalog_name, table_id,
                 flush_seconds=30, flush_rows=500):
        self.catalog = load_catalog(catalog_name)
        self.table = self.catalog.load_table(table_id)
        self.queue = Queue(maxsize=50_000)
        self.flush_seconds = flush_seconds
        self.flush_rows = flush_rows
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def record(self, event: dict) -> None:
        """Non-blocking. Drops on overflow rather than blocking the agent."""
        event.setdefault("event_id", str(uuid.uuid4()))
        try:
            self.queue.put_nowait(event)
        except Exception:
            # Telemetry loss beats request-path blocking. Count it.
            OVERFLOW_COUNTER.inc()

    def _run(self):
        buffer, last_flush = [], time.monotonic()
        while not self._stop.is_set():
            try:
                buffer.append(self.queue.get(timeout=1.0))
            except Empty:
                pass
            elapsed = time.monotonic() - last_flush
            if len(buffer) >= self.flush_rows or (
                buffer and elapsed >= self.flush_seconds
            ):
                self._flush(buffer)
                buffer, last_flush = [], time.monotonic()

    def _flush(self, rows):
        if not rows:
            return
        arrow_table = pa.Table.from_pylist(
            rows, schema=self.table.schema().as_arrow()
        )
        self.table.append(arrow_table)

    def close(self):
        self._stop.set()
        self._thread.join(timeout=30)
```

The overflow behavior is a deliberate choice worth arguing about. Dropping telemetry under extreme load keeps the agent responsive. Blocking preserves the record and degrades the service. For a governance-critical system the trade goes the other way, and the right design there is a durable local buffer that survives process restart rather than an in-memory queue. Whichever you pick, count the drops and alert on them, because silent telemetry loss is the failure that makes the whole system worthless at exactly the moment you need it.

The flush thresholds set your write rate. Thirty seconds and 500 rows on a moderately busy agent produces roughly 2,880 commits a day at worst. That is fine for an append-only table with snapshot expiration running. Tighten them and check your snapshot count.

## Volume and sizing

Rough numbers help decide how seriously to engineer this.

Start with events per session. A discovery agent produces somewhere between 4 and 30 tool calls, from what I have seen. Take 12 as a working average. A row in the events table with a truncated SQL text and a summary runs a few hundred bytes to a couple of kilobytes uncompressed, and ZSTD on columnar data with repeated agent names and tool names compresses hard, often past 10 to 1.

At 1,000 sessions a day, that is 12,000 event rows a day, plus 1,000 session rows. Call it 25 MB a day uncompressed and a small fraction of that on disk. A year of retention is measured in single-digit gigabytes.

That number matters because it settles an argument before it starts. Nobody needs to debate retention economics for a table this size. Retain for years, because the storage cost is noise against the value of being able to answer a question about last spring.

Scale it up and the conclusion holds. At 100,000 sessions a day, you are into the low terabytes annually, which is still ordinary for an analytical table and still cheap on object storage.

What does get expensive at that scale is the free-text columns if you let them grow. A prompt stored per event rather than hashed per session, or a full result set instead of a summary, changes the arithmetic by two orders of magnitude. The design choices in the schema section exist to keep the table small enough that retention is never the constraint.

Two operational thresholds worth knowing.

**Commit rate.** Batching at 30 seconds gives at most 2,880 commits a day per writer. Multiple writer instances multiply that. Past roughly 10,000 daily commits on one table, run snapshot expiration more than daily and check your metadata size.

**Partition count.** Day partitioning over three years is about 1,100 partitions, which is comfortable. Adding a second partition field like agent name multiplies that and produces small files. Resist it. Filter on agent name at query time and let the column statistics do the pruning.

## Reconstructing a session

The queries are the point. Here is what reconstruction looks like.

Full trace for one session, in order:

```sql
SELECT
    e.event_seq,
    e.occurred_at,
    e.event_type,
    e.tool_name,
    e.tables_accessed,
    e.duration_ms,
    e.error_class,
    left(e.sql_text, 200) AS sql_preview
FROM governance.ai.agent_events e
WHERE e.session_id = :session_id
  AND e.occurred_at >= :window_start
ORDER BY e.event_seq;
```

The extra predicate on `occurred_at` is not redundant. Without it the engine scans every partition looking for that session. Bound the window from the session's start time and the query touches one or two partitions.

Which agents read a sensitive table, over a quarter:

```sql
SELECT
    s.agent_name,
    s.agent_version,
    s.data_principal,
    count(DISTINCT e.session_id) AS sessions,
    count(*)                     AS accesses,
    min(e.occurred_at)           AS first_access,
    max(e.occurred_at)           AS last_access
FROM governance.ai.agent_events e
JOIN governance.ai.agent_sessions s
  ON e.session_id = s.session_id
WHERE array_contains(e.tables_accessed, 'gold.hr.compensation')
  AND e.occurred_at >= :quarter_start
  AND e.occurred_at <  :quarter_end
GROUP BY 1, 2, 3
ORDER BY accesses DESC;
```

That is the access review query, and it is the one that gets asked in an audit. Being able to run it in ten seconds changes the character of the conversation.

Sessions that produced an outcome without human review, where policy required one:

```sql
SELECT
    s.session_id,
    s.started_at,
    s.agent_name,
    s.user_id,
    s.outcome_status
FROM governance.ai.agent_sessions s
WHERE s.human_reviewed = false
  AND s.outcome_status = 'ACTED'
  AND s.started_at >= :window_start
ORDER BY s.started_at DESC;
```

An empty result is the control evidence. A non-empty result is a finding you want to discover yourself rather than have discovered for you.

Error patterns by agent version, which is the operational payoff:

```sql
SELECT
    s.agent_version,
    e.error_class,
    count(*) AS occurrences,
    count(DISTINCT e.session_id) AS affected_sessions
FROM governance.ai.agent_events e
JOIN governance.ai.agent_sessions s
  ON e.session_id = s.session_id
WHERE e.error_class IS NOT NULL
  AND e.occurred_at >= current_timestamp - INTERVAL '30' DAY
GROUP BY 1, 2
ORDER BY occurrences DESC;
```

This is the query nobody builds the table for and everybody uses. Governance justifies the project. Debugging is what makes people glad it exists.

## Cost attribution, the reason finance cares

Governance justifies this table in a meeting. Cost attribution is what keeps it funded.

Agent workloads generate two independent cost streams, and most organizations track neither by agent.

**Token spend** goes to a model provider and arrives as one bill. Without per-session records, you know the total and nothing else. Which agent, which use case, which team, which user is unanswerable.

**Compute spend** goes to your query engine. Agents issue queries, queries scan bytes and consume engine time, and the bill shows up under whatever service account the agent uses. If every agent shares one principal, the entire category is one line item.

Both become answerable when telemetry carries the identity and the session ID propagates into the engine.

The propagation is the part people skip, so here is what it looks like concretely. Most engines accept a comment or tag on a query that lands in their job history:

```python
def run_agent_query(engine, sql: str, session_id: str, agent: str) -> object:
    tagged = (
        f"-- agent_session_id={session_id} agent={agent}\n"
        f"{sql}"
    )
    return engine.execute(tagged)
```

That comment costs nothing, changes no semantics, and appears in the engine's job records. Now the engine's own accounting of bytes scanned and execution time joins to your telemetry on session ID.

The attribution query then writes itself:

```sql
SELECT
    s.agent_name,
    s.agent_version,
    count(DISTINCT s.session_id)  AS sessions,
    sum(s.total_tokens)           AS tokens,
    sum(e.rows_returned)          AS rows_returned,
    sum(e.duration_ms) / 1000.0   AS engine_seconds,
    sum(e.duration_ms) / 1000.0
      / count(DISTINCT s.session_id) AS engine_seconds_per_session
FROM governance.ai.agent_sessions s
JOIN governance.ai.agent_events e
  ON s.session_id = e.session_id
WHERE s.started_at >= :month_start
  AND s.started_at <  :month_end
GROUP BY 1, 2
ORDER BY engine_seconds DESC;
```

Three findings show up reliably the first time a team runs this.

One agent dominates. Usually an agent nobody thought was heavy, doing something repetitive on a schedule. The fix is often caching or a materialization rather than anything sophisticated.

Engine seconds per session varies by an order of magnitude across agents. High values point at agents doing exploratory scans because they lack a good dataset to answer from, which turns a cost finding into a semantic layer requirement.

A meaningful share of sessions produce no useful outcome. Failed sessions cost the same as successful ones. Multiplying that share by the total gives you a number that motivates work on accuracy far better than an accuracy percentage does.

None of this needs a new system. It is the same two tables, joined to job history you already have.

## The regulatory picture, stated carefully

A lot of writing on this subject implies every AI system needs EU AI Act logging. That overstates it, and overstating it leads teams to either panic or dismiss the whole thing.

The relevant provisions in Regulation 2024/1689 are specific. Article 12 requires that high-risk AI systems technically allow automatic recording of events over the lifetime of the system, with logging enabling recording of events relevant to identifying risk situations or substantial modification, to post-market monitoring under Article 72, and to monitoring operation under Article 26(5). Article 19 requires providers to keep those logs for a period appropriate to the intended purpose and at least six months. Article 26(6) places a matching minimum retention obligation on deployers. Article 14 covers human oversight, including the ability of a person to understand, intervene, and override. High-risk system obligations become applicable on 2 August 2026.

The word doing the work in all of that is high-risk. The Act defines high-risk categories, and a business intelligence agent answering questions about sales data is generally not one of them. An agent embedded in a system that makes decisions about employment, creditworthiness, essential services, education access, or law enforcement plausibly is. The category is determined by application, not by the fact that a language model is involved.

Two useful conclusions follow.

If you are not high-risk, none of the Act's logging obligations bind you, and the engineering case for this table stands entirely on its own merits: debugging, cost attribution, access review, and being able to answer "where did this number come from." Those are sufficient reasons.

If high-risk status is plausible for your system, the determination is a legal question and the six-month minimum is a floor rather than a target. Note also a distinction the research literature keeps making: a bare log satisfies part of the recording duty, and Article 14's oversight requirement is the stronger constraint. A record that meets the letter of logging still fails to support oversight if it lacks the structure needed to reconstruct the actual determination. That is an argument for the structured trace described earlier over unstructured log lines, and it is an engineering argument rather than a legal one.

Worth knowing: a standard specifically on AI system event logging, prEN ISO/IEC 24970, is in development and expected to define implementation-level requirements for log format, granularity, and storage. If you are building for a regulated context, track it, because building against a standard that is about to exist beats inventing your own schema and reconciling later.

## Retention, deletion, and tamper evidence

Three requirements pull against each other here, and resolving the tension is design work.

**Retention.** Governance wants years. Storage on object storage is cheap enough that multi-year retention of a telemetry table is not a real cost. Set snapshot expiration to retain data while still expiring old snapshots, and be explicit that expiring a snapshot removes a version of the metadata rather than the data rows.

**Deletion.** Data protection law gives individuals deletion rights, and telemetry containing a user identifier and their request text falls in scope. An append-only table still needs a delete path. This is why format version 3 matters: deletion vectors handle sparse row-level deletes efficiently without rewriting whole files.

Design for it up front. Keep the columns that carry personal data narrow and known, so a deletion request targets specific columns and rows rather than requiring a scan of free text. Where you can, store a pseudonymous user key and keep the mapping in a separate small table, so honoring a deletion request means removing one mapping row rather than rewriting telemetry history. That approach preserves the structural record, which is what governance needs, while removing the identification, which is what the individual is entitled to.

**Tamper evidence.** Iceberg gives you an immutable snapshot history and a record of every commit, which is genuinely useful. It does not give you cryptographic proof against someone with write access to the storage and the catalog. Anyone claiming Iceberg alone provides tamper-proof audit records is overselling it.

If your context needs evidentiary weight, the pattern is to hash records and anchor those hashes somewhere with independent control, meaning a separate account, a separate retention policy, or an external timestamping service. Standards work in this space points at qualified timestamps and documented chain of custody. That is a separate build on top of the table, and the table is the right foundation for it.

Practical middle ground for most teams: restrict write access on the telemetry table to one service principal, restrict catalog admin on it to a small group, put read access broadly so reviewers do not need engineering help, and log changes to those grants. That gets you defensible practice without a cryptographic project.

## Turning the table into a review practice

A record nobody reads is storage, not governance. The practice that makes it real is small and consistent.

**Monthly sampling.** Twenty sessions, chosen randomly with a bias toward high-impact outcomes. A person reads the trace end to end and answers three questions: was the answer correct, was the data access appropriate, was the reasoning path sensible. Fifteen minutes per session, five hours a month.

Record the review in the sessions table using the fields already there. `human_reviewed`, `reviewer_id`, `reviewed_at`, `review_decision`. The review record and the session record living in one place is what makes the practice auditable rather than an activity someone claims happened.

**Targeted review on triggers.** Random sampling catches drift. Triggered review catches incidents. Useful triggers: any session where policy outcome was a denial, any session whose output was acted on without approval, any session with an error class that has not been seen before, any session touching a table classified as sensitive.

```sql
-- Review queue: sessions needing human attention
SELECT
    s.session_id,
    s.started_at,
    s.agent_name,
    s.user_id,
    e.policy_outcome,
    e.error_class,
    e.tables_accessed
FROM governance.ai.agent_sessions s
JOIN governance.ai.agent_events e
  ON s.session_id = e.session_id
WHERE s.human_reviewed = false
  AND s.started_at >= current_timestamp - INTERVAL '7' DAY
  AND (
        e.policy_outcome = 'DENIED'
     OR e.error_class IS NOT NULL
     OR array_contains(e.tables_accessed, 'gold.hr.compensation')
  )
ORDER BY s.started_at DESC;
```

Run it weekly, work the queue, mark the reviews. A queue that stays short means the triggers are calibrated. One that grows without bound means either the triggers are too broad or something is genuinely wrong, and both are worth knowing.

**Findings go back into the system.** This is where the loop closes. A review finding that an agent picked the wrong dataset becomes a description edit. A finding that it wrote a fan-out join becomes a new gold dataset. A finding that it accessed something it should not becomes a grant change. If reviews produce observations and no changes, the practice decays into theater within two quarters.

One organizational note. The reviewer should not be the person who built the agent. Not out of suspicion, but because the builder knows what the agent intended and reads the trace charitably. A reviewer without that context reads what the trace actually says, which is what a later auditor will do.

## Getting the first version shipped

The failure mode of a project like this is scope. A team sets out to build comprehensive agent observability and ships nothing for a quarter. Here is a version that ships in a week and grows.

**Day one: the sessions table only.** One row per agent session with identity, agent name and version, model, the request, the response, and the outcome. No events table yet. This alone answers who asked what and what came back, which is more than most organizations have.

**Day two through four: the events table with tool calls.** Event type, tool name, arguments, duration, error class. Skip the SQL and table-access fields for now, since they need engine integration.

**Week two: engine integration.** Propagate the session ID into query tags. Populate `sql_text`, `tables_accessed`, and `rows_returned`. This is the step that turns the table from a chat log into an access record, and it is worth the extra week.

**Week three: the queries.** Write the reconstruction query, the access review query, the error pattern query, and the cost attribution query. Put them somewhere engineers find them. This is the step that determines whether the table gets used or forgotten, and it takes an afternoon.

**Week four: retention and grants.** Set snapshot expiration. Set access grants so reviewers read without engineering help. Write down the retention requirement and the reasoning.

**Later: policy fields, human review fields, derived metrics.** These matter and none of them block value from the earlier steps.

Two things to get right on day one even though everything else can wait.

The session ID has to be generated at the start of the session and threaded through everything. Retrofitting a correlation ID into a running system is painful in a way that generating one from the start is not.

Personal data classification has to happen before the first row lands. Deciding afterward that `initial_request` contains sensitive text means auditing data you already collected under access rules you already set, which is a much worse position than starting restricted and relaxing later.

Everything else is genuinely incremental. A table with three populated columns being queried weekly beats a comprehensive schema nobody reads.

## Failure modes

**Telemetry loss during incidents.** Load spikes fill the buffer, events drop, and the sessions you most want to review are the ones missing. Warning sign: overflow counter incrementing, usually unwatched. Fix: alert on the counter, and use a durable buffer if the record is genuinely required.

**Free-text columns carrying personal data.** `initial_request` holds whatever the user typed, including names, account numbers, and health details. Warning sign: nobody has classified the columns. Fix: classify them, restrict access accordingly, and treat the table as containing personal data from day one rather than discovering it during a review.

**Snapshot explosion from unbatched writes.** One commit per event, a snapshot per commit, metadata reads slowing for everyone. Warning sign: snapshot count in the tens of thousands. Fix: batch, and run expiration on a schedule.

**The table that nobody queries.** Built during a compliance push, written to faithfully, never read. Six months later a schema drift went unnoticed because no query touched the affected column. Warning sign: no reads in the query history. Fix: build the debugging queries and put them in front of engineers, because a table with regular users stays correct.

**Schema drift from agent changes.** A new tool ships, its arguments do not fit the existing columns, and someone stuffs them into a free-text field. The structure degrades quietly. Warning sign: growing use of catch-all columns. Fix: treat the telemetry schema as an interface with a change process, and consider a variant-typed column for genuinely variable payloads instead of abusing strings.

**Correlation IDs that do not correlate.** The agent framework generates one ID, the query engine another, and nothing links them. You have both halves of a trace and no join. Warning sign: sessions where tool calls appear with no corresponding engine-side record. Fix: propagate the session ID into the query engine as a query tag or comment so the engine's own job history carries it.

**Retention configured for cost, not requirement.** Someone sets aggressive expiration to control storage, and it silently deletes records inside a required retention window. Warning sign: expiration settings that nobody can trace to a stated requirement. Fix: write down the retention requirement, and derive the configuration from it in a comment on the job.

**Assuming the record proves reasonableness.** A complete trace shows what happened. It does not show that what happened was appropriate. Teams sometimes treat having the log as having the control. Warning sign: no review process, just storage. Fix: sample sessions for human review on a schedule, and record those reviews in the same table.

## One table or many agents

A question that comes up as soon as a second agent ships: one telemetry table for everything, or one per agent?

One table, with `agent_name` as a column. The reasons are worth spelling out because the instinct often runs the other way.

**Cross-agent questions are the interesting ones.** Which agents touched this table. How does error rate compare across agents. Which agent costs the most per session. Every one of those becomes a union across N tables if you split, and unions across tables with drifting schemas are how analysis stops happening.

**Schema discipline holds better in one place.** A shared table forces agent teams to agree on what an event is. Separate tables let each team invent, and three years later you have four incompatible representations of the same concept and no way to answer a question spanning them.

**Governance grants are simpler.** One table, one set of read grants for reviewers, one retention policy. Per-agent tables multiply the surface where a grant drifts open or a retention setting gets missed.

**Volume does not justify splitting.** As the sizing section showed, this table stays small. Splitting for performance solves a problem you do not have.

The legitimate exception is a hard data residency or isolation requirement. An agent operating in a jurisdiction whose data cannot leave a region needs its own table in that region, and no amount of schema elegance overrides that. Handle it as an exception with a documented reason, not as the default pattern.

If different agents genuinely produce different event shapes, that is an argument for a flexible payload column rather than for separate tables. A variant-typed column holding agent-specific detail, alongside the common structured columns every agent populates, keeps the cross-agent queries working while accommodating the differences. The common columns are the contract. The payload is the escape hatch.

One naming note that saves confusion later: keep `agent_name` stable across versions and put the version in `agent_version`. Teams that fold the version into the name end up with `sales-agent-v2` and `sales-agent-v3` as separate agents, and every trend query has to normalize them back together.

## Operational guidance

**Start with two tables and resist adding more.** Sessions and events cover the space. Additional tables for prompts and tool manifests are small lookups. A telemetry schema that grows to eleven tables becomes a project rather than a byproduct.

**Propagate the session ID into the query engine.** Most engines let you attach a tag or comment to a query that appears in their job history. Doing this links your telemetry to the engine's own record of execution time, bytes scanned, and cost, which is what makes cost attribution per agent possible.

**Sample and review on a schedule.** Twenty sessions a month, read by a person, is enough to catch drift. Record the review in the sessions table so the review record and the session record live together.

**Compute a small set of derived metrics daily.** Sessions per agent, error rate, average tool calls per session, tables accessed per agent. Write them to a small aggregate table. These are the numbers anyone asks for, and computing them once beats scanning raw telemetry every time.

**Set access grants deliberately.** The write principal writes and does not read. Reviewers read and do not write. Nobody updates. Enforce it in catalog grants.

**Expire snapshots aggressively while retaining data.** These are different operations. Snapshot expiration on a telemetry table with hundreds of daily commits should retain days of snapshots, not years, while the rows themselves stay for as long as your retention requires.

**Test the reconstruction before you need it.** Pick a session from three months ago and reconstruct it end to end. If any field is missing or ambiguous, you found out in a drill rather than in an audit. Do this quarterly.

**Keep the schema portable.** Plain Iceberg tables with ordinary types, no engine-specific features. The value of this table is measured in years, and the engine reading it in year three is not guaranteed to be the one writing it in year one. The same reasoning applies to the writer: a telemetry pipeline that depends on one vendor's SDK becomes a migration blocker precisely when you are least willing to take one on.

**Document the schema next to the table.** Put a comment on every column stating what populates it and what an empty value means. A reviewer opening this table in year two has no access to the person who designed it, and a column named `outcome_status` with four undocumented values is an obstacle rather than evidence.

## Where this is heading

Three developments worth watching.

Standardization of the trace format. Right now every team invents its schema, which means no tooling can assume anything and every integration is one-off work. The ISO/IEC standard in development on AI system event logging, and the research literature converging on decision-trace field specifications, both point at a common shape arriving. A common shape means reviewer tooling that works across organizations, which is where the real payoff sits.

Catalog-level capture. Today the agent writes its own telemetry, which means an agent that fails to write leaves no record. The catalog sees every table access from every engine regardless. Pushing access recording down to the catalog produces a record the agent cannot omit, and combining that with agent-side reasoning records gives you a trace with one half that is not self-reported. Apache Polaris exposing policy through its API is a step toward the governance side of this living in the catalog.

Feedback from telemetry into the system. The most valuable use of this data is not the audit. It is noticing that agents consistently access three tables together and building a dataset that joins them, or that a column appears in many failed sessions and needs a better description. That loop, from telemetry to semantic layer improvement, is obvious and almost nobody has built it.

## Conclusion

Application logs answer whether a service is healthy. Reconstructing an agent's decision six months later is a different question, and it needs a different artifact: a structured trace, in an analytical table, retained for years, readable by people without production access.

Two Iceberg tables cover it. Sessions carry identity, configuration, the request, the outcome, and human review. Events carry each tool call with its arguments, the SQL, the tables and columns touched, timings, errors, and policy checks. Partition both by day, write appends asynchronously in batches, and never update.

On the regulatory side, be precise rather than anxious. The EU AI Act's logging obligations attach to high-risk systems, most analytics agents are not in that category, and whether yours is is a legal question for counsel. Where the obligations do apply, six months is the floor, and the oversight requirement is the stricter constraint because it demands a record structured enough to reconstruct the determination rather than a stream of log lines.

Build it for the engineering value and the compliance value comes along. The query that finds which agent versions produce which errors gets run every week. The access review query gets run once a quarter and changes the tone of that conversation entirely. Both come from the same two tables, and neither is hard to build.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and governance. *Apache Polaris: The Definitive Guide*, which I co-authored for O'Reilly, covers the access control and policy model that this telemetry records the operation of. *Architecting an Apache Iceberg Lakehouse* from Manning covers table design, retention, and partitioning decisions like the ones in this article at platform scale. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
