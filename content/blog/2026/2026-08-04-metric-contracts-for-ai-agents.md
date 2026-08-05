---
title: "Metric Contracts as the Interface AI Agents Actually Need"
date: "2026-08-04"
description: "Metric contracts as the interface AI agents need: calculation, inclusion rules, grain, temporal semantics, ownership, semantic versioning, and testing metrics in CI."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - AI Agents
  - Metric Contracts
  - Semantic Layer
  - Apache Ossie
  - Data Governance
canonical: "https://iceberglakehouse.com/posts/metric-contracts-for-ai-agents/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/metric-contracts-for-ai-agents/).

# Metric Contracts as the Interface AI Agents Actually Need

*By Alex Merced, Data Lakehouse and AI Evangelist*

Two teams present in the same meeting. Sales says pipeline conversion is 24 percent. Finance says it is 19. Both numbers came from the same warehouse. Both are defensible. The rest of the meeting is spent reconciling them instead of deciding anything, and the reconciliation produces a third number that nobody uses afterward.

This has always been expensive. What changed is that the reconciliation used to happen in a meeting, where two humans discovered the discrepancy and argued it out. Now agents generate numbers continuously, feed them into reports and downstream automation, and nobody is in the room to notice that two systems disagree. The argument still happens. It just happens silently, between two pieces of software, and the output goes to a customer.

A metric contract is the artifact that prevents this. It is a versioned, tested, owned definition of what a business metric means, expressed in a form that both a query engine and an AI agent can read and neither can improvise around.

This piece covers what belongs in a contract, how versioning works when the consumers include software, how to test metrics in CI the way you test code, where contracts live across dbt, Cube, and Holistics, and what changes when the primary consumer is an agent rather than a dashboard.

A disclosure. I work for Dremio, which was acquired by SAP and now sits within SAP Business Data Cloud. Dremio is one of three companies named as core developers of Apache Ossie, the open semantic interchange specification discussed below, alongside Snowflake and dbt Labs. I am not neutral about the value of an open format here. The engineering practices apply regardless of which tool holds your definitions.

## Why a schema is not a contract

Data contracts as a discipline focus on schema: column names, types, nullability, and freshness guarantees between a producer and a consumer. That work is valuable and it is not the same thing.

A schema contract says the `orders` table has an `amount` column of type decimal that is never null and refreshes hourly. Every one of those guarantees can hold while two teams still compute different revenue numbers, because the disagreement is not about the column. It is about which rows count, how refunds net out, which currency conversion date applies, and what grain the aggregation runs at.

The gap between a schema and a meaning is where metric drift lives. A metric contract closes it by specifying five things a schema does not.

**The calculation.** The exact expression, not a description of it.

**The inclusion and exclusion rules.** Which rows participate. Cancelled orders, internal test accounts, intercompany transactions, records flagged for review.

**The grain.** What one row of the result represents, and which dimensions the metric is valid to slice by. A metric that is meaningful at customer grain and misleading at transaction grain needs to say so.

**The temporal semantics.** Which date column drives time filtering, which fiscal calendar applies, and how late-arriving data is handled.

**The ownership and lifecycle.** Who is accountable, what version this is, what changed, and when the previous version stops being served.

Those five elements are what turn a definition into an interface, and an interface is the thing software can be held to.

## Anatomy of a contract

Here is a contract with the parts that earn their place. The shape follows Apache Ossie's declarative YAML approach, which defines metrics, dimensions, and relationships in a vendor-neutral format.

```yaml
metric:
  name: pipeline_conversion_rate
  version: 2.1.0
  label: Pipeline Conversion Rate
  owner: revenue-operations
  status: active

  description: >
    Share of qualified opportunities created in a period that reached
    Closed Won within 180 days of creation. Denominator is fixed at
    creation cohort, so the value for a recent period rises as the
    cohort matures.

  calculation:
    numerator:   COUNT(DISTINCT opportunity.id) FILTER (WHERE opportunity.stage = 'closed_won')
    denominator: COUNT(DISTINCT opportunity.id)
    type: ratio

  grain: opportunity_cohort

  filters:
    - opportunity.qualified_at IS NOT NULL
    - opportunity.record_type != 'internal'
    - opportunity.amount >= 0

  temporal:
    cohort_date_column: opportunity.qualified_at
    attribution_window_days: 180
    fiscal_calendar: acme_fy_feb_start
    late_arrival_policy: restate

  valid_dimensions:
    - account.segment
    - account.region
    - opportunity.product_line
    - opportunity.source_channel

  invalid_dimensions:
    - opportunity.stage        # slicing by stage makes the ratio meaningless
    - contact.title            # grain mismatch, produces fan-out

  tests:
    - name: bounded
      assert: value BETWEEN 0 AND 1
    - name: matches_known_period
      fixture: fy25_q2
      expect: 0.2371
      tolerance: 0.0001
    - name: dimension_sum_consistency
      assert: weighted_sum_over(account.region) == total

  lifecycle:
    supersedes: 2.0.0
    deprecates_on: 2026-10-01
    breaking_change: false
```

Several fields there are the ones teams omit and later wish they had.

**The description explains the metric's behavior, not just its meaning.** The note that recent periods rise as the cohort matures is the single most useful sentence in the contract, because it preempts the question everyone asks when a recent number looks low. For an agent, that sentence is context it reasons over when writing an explanation.

**`invalid_dimensions` with reasons.** Listing what a metric cannot be sliced by is as important as listing what it can. An agent that requests an invalid slice gets a rejection with a reason rather than a plausible wrong number.

**`temporal` as a block rather than a single date column.** Attribution windows, fiscal calendars, and late-arrival policy are where two implementations of the same metric silently diverge.

**`tests` inline with the definition.** The contract carries its own verification. This is what makes CI enforcement possible without a separate test repository that drifts out of sync.

**`lifecycle` with an explicit deprecation date.** Consumers need to know when a version stops being served, and software consumers need it in a machine-readable field rather than in a changelog.

## Versioning when consumers are software

Human consumers tolerate a metric definition changing quietly. A dashboard shows a new number and someone eventually notices. Software consumers do not tolerate it, because a downstream automation acting on a metric whose meaning changed will do the wrong thing without hesitating.

Apply semantic versioning to metrics, with the categories mapped to what actually breaks.

**Patch** changes fix an implementation without changing the value. A rewritten expression that computes the same result, a performance optimization, a corrected typo in the description. Consumers need no action.

**Minor** changes add capability without changing existing results. A new valid dimension, an additional supported grain, a richer description. Existing consumers are unaffected.

**Major** changes alter the value. A filter added, an attribution window changed, a definition corrected. Every consumer needs to know, and the old version keeps serving until the deprecation date.

The rule that makes this work is that a major version bump means both versions are servable simultaneously. Consumers migrate on their own schedule within the deprecation window. A metric platform that cannot serve two versions of the same metric forces every change to be a coordinated cutover, which means changes stop happening and definitions rot.

Requesting a specific version should be possible and defaulting to latest-major should be the norm.

```
GET /metrics/pipeline_conversion_rate            → latest active major
GET /metrics/pipeline_conversion_rate@2          → latest 2.x
GET /metrics/pipeline_conversion_rate@2.1.0      → exact
```

Automated consumers pin to a major. Exploratory consumers take the default. Anything pinned to an exact version gets a warning when a patch is available, since patch changes are the ones that should be adopted automatically.

## Testing metrics in CI

A contract that is not tested is documentation. Four test classes catch the failures that matter, and all four run in a pipeline on every change.

**Bounds tests** assert the value falls in a valid range. A ratio between zero and one. A count that is non-negative. A revenue figure that is not larger than the sum of its parts. These are cheap and they catch gross errors from a bad join.

**Fixture tests** assert a known answer against a frozen dataset. This is the highest-value class and the one most often skipped because building the fixture takes a day. Take a historical period whose numbers were validated by humans, freeze the source data, and assert the metric reproduces the number.

```python
def test_pipeline_conversion_matches_fy25_q2(metric_engine, fixture_fy25_q2):
    result = metric_engine.query(
        metric="pipeline_conversion_rate",
        version="2.1.0",
        period="FY25-Q2",
        dataset=fixture_fy25_q2,
    )
    assert abs(result.value - 0.2371) < 0.0001
```

**Consistency tests** assert internal coherence. The metric sliced by region and recombined equals the unsliced total. The metric at monthly grain summed over a quarter equals the quarterly value, where that is expected to hold. These catch grain and fan-out bugs, which are the subtlest class and the ones that produce plausible wrong answers.

```python
def test_region_slices_recombine(metric_engine):
    total = metric_engine.query(metric="net_revenue", period="2026-Q2").value
    by_region = metric_engine.query(
        metric="net_revenue", period="2026-Q2", dimensions=["account.region"]
    )
    assert abs(sum(r.value for r in by_region) - total) < 0.01
```

**Cross-version tests** assert that a patch change did not move the number and that a major change moved it by the amount the author expected. This one converts a review comment into an enforceable check.

```python
def test_patch_change_preserves_value(metric_engine):
    old = metric_engine.query(metric="net_revenue", version="3.2.0", period="2026-Q1")
    new = metric_engine.query(metric="net_revenue", version="3.2.1", period="2026-Q1")
    assert old.value == new.value, "patch version changed the result, bump minor or major"
```

Wire these into the same pipeline that reviews the definition change. A pull request that modifies a metric runs its tests, reports the value delta against the previous version, and requires the owner's approval. That workflow is what makes a metric an engineering artifact rather than a spreadsheet convention.

Add one more gate that is easy to build and disproportionately useful: a check that fails when a definition changes without a version bump. Most metric drift in practice is not a wrong definition. It is a right definition changed quietly, and a version bump is the cheapest possible detection mechanism for it.

## Where contracts live

Several tools implement semantic layers, and the definitions look different in each.

**dbt** defines metrics alongside models in YAML, which puts them in the same repository as the transformations and gets version control and CI for free. The coupling to dbt's build model is both the strength and the limit.

**Cube** provides a semantic layer with a modeling language and an API layer, designed to serve multiple downstream consumers including embedded analytics.

**Holistics** and similar BI-anchored platforms define metrics as part of the modeling layer that powers their visualization products.

Warehouse and lakehouse engines increasingly ship their own: Snowflake Semantic Views, Dremio's semantic layer, and equivalents elsewhere.

Every one of those is a good implementation and every one of them holds your definitions in its own format. That is the interchange problem, and it is what Apache Ossie exists to solve.

Ossie is a specification plus converters and tooling rather than a product you install. It defines a vendor-neutral YAML format for metrics, dimensions, relationships, and broader business concepts, so any tool, whether a BI platform, a query engine, or an agent, can consume and produce semantic definitions without loss of meaning. It began as Open Semantic Interchange in November 2025 with 17 founding partners, was renamed on entry to the Apache Incubator, and now has a coalition past 50 organizations. Converters already merged include Ossie to dbt Semantic Layer and an Apache Polaris converter, and three working groups operate on Metric Language, Catalog, and Ontology.

The practical guidance is straightforward. Keep authoring in whichever tool your team already uses productively. Export to the interchange format so the definitions are portable, and so the consumers that are not your primary tool can read them. Watch the converter ecosystem, since converters rather than the specification text are the measure of whether portability is real.

Two honest caveats. The specification is incubating and still moving. And a format does not enforce anything by itself, which brings us to the registry.

## Registering contracts where consumers look

A contract that lives in a repository is discoverable by people who know the repository. A contract registered in the catalog is discoverable by every engine and agent that already connects there.

Apache Polaris is the obvious home. It graduated to Apache Top-Level Project on February 18, 2026, and the Table Sources direction in its community aims to make the catalog a registry for every lakehouse asset, including views, functions, metrics, and models. The Ossie-to-Polaris converter is the concrete step: definitions authored anywhere, expressed in the open format, registered where discovery and authorization already happen.

The reason this matters is unification of the enforcement point. Polaris already decides, per principal, which tables and views are reachable, and mints short-lived scoped credentials accordingly. Putting metric definitions in the same registry means a consumer's view of available metrics is filtered by the same identity that governs table access. One model, one audit trail.

Note the boundary honestly. Polaris RBAC operates at object level and does not natively filter rows or mask columns, with a feature request for that open since 2024. Rules that depend on data values live in views or in an external policy engine such as Open Policy Agent, which Polaris supports integrating with. A metric contract can name the policy that applies to it. It cannot enforce that policy by itself.

## Finding the definitions you already have

Before writing new contracts, inventory the ones that exist implicitly. They are scattered across four places, and finding them changes what you write.

**BI tool calculated fields.** Most BI platforms let a report author define a calculation inline. Those are metric definitions with no owner, no version, and no test. Export them and count how many distinct expressions compute something named revenue.

**Warehouse views.** A view named `v_monthly_revenue` is a metric definition wearing a different hat. Pull the DDL for every view whose name suggests a business concept.

**Transformation models.** Aggregate tables built by scheduled jobs encode grain and filter decisions that nobody wrote down elsewhere.

**Query history.** The most revealing source. Extract the aggregate expressions from the last ninety days of queries and group them by the columns they touch.

```sql
SELECT
    normalized_expression,
    COUNT(*)                   AS uses,
    COUNT(DISTINCT user_name)  AS authors,
    MAX(start_time)            AS last_used
FROM query_history_expressions
WHERE expression_type = 'aggregate'
  AND referenced_tables LIKE '%orders%'
GROUP BY normalized_expression
ORDER BY uses DESC
LIMIT 50;
```

The output of that query is uncomfortable and useful. In every organization I have run it against, the top of the list contains three to six variants of the same calculation, differing by one filter each, all in active use, all authored by different people who each believed theirs was the standard.

That list is your contract backlog, ordered by demand. It also tells you which variants are real business distinctions worth two contracts and which are accidents worth consolidating into one.

Do the consolidation with the authors present. A variant that looks like an accident is sometimes a deliberate adjustment for a regulatory definition nobody documented, and deleting it quietly creates a compliance problem.

## Serving contracts at query time

A contract has to reach its consumers at the moment they need it, which means the interface matters as much as the definition.

Three access patterns need support.

**Discovery** returns the list of metrics a caller is permitted to see, with enough detail to choose between them. Filtered by identity, so a caller never learns that a restricted metric exists.

**Description** returns the full contract for one metric, including the description text, the valid and invalid dimensions, the temporal semantics, and the current version. This is the call that replaces guessing with looking up, and it is the one that agents make constantly.

**Execution** takes a metric name, a version, dimensions, filters, and a grain, and returns a result. The critical property is that the caller supplies parameters rather than SQL. Query construction happens server-side from the stored definition.

Cache the first two aggressively. Definitions change on a review cycle measured in weeks, and discovery calls happen thousands of times a day. Caching them removes most of the interface volume without any correctness cost, and it is the difference between a semantic layer that adds noticeable latency and one that does not.

Return the version in every execution response, not just on request. A consumer that logs the version alongside the value can answer, months later, which definition produced a given number. Without it, reconstructing that is guesswork.

Return the as-of timestamp of the underlying data too. An agent reasoning about a trend should know whether it is looking at data that is four minutes or four days old, and an auditor definitely should.

## The organizational half

The engineering here is the easier part. Three organizational patterns determine whether contracts hold.

**Ownership has to be a person's job, not a team's aspiration.** A contract owned by "data platform" is owned by nobody. Name an individual, validate the name resolves in CI, and re-validate quarterly. When the individual leaves, the metric appears on a list that someone has to clear.

**Changes go through review with the business owner, not just the data engineer.** A pull request that alters a filter is a business decision expressed as code. The reviewer who understands whether cancelled orders should count is rarely the reviewer who understands the SQL. Require both.

**Deprecation has to actually happen.** The most common organizational failure is a well-run contract system where nothing is ever retired, because retiring something requires finding its consumers and asking them to move. Build the consumer list into the platform through query logging, so deprecation starts with a list rather than an appeal.

There is a cultural point underneath these. A metric contract system moves an argument that used to happen in a meeting into a code review. That is a genuine improvement in accountability and it is also a change in where organizational friction shows up. Teams that were comfortable with ambiguous numbers will experience the contract as an obstacle for the first few months, because it forces a decision they had been avoiding.

The way through that is to start with the metrics where the ambiguity is already causing visible pain, so the contract arrives as relief rather than as bureaucracy. The pipeline conversion argument from the opening of this piece is exactly the right first contract, because both parties are tired of having it.

## What changes when the consumer is an agent

Everything above is good practice for human-facing analytics. Three things change when agents become primary consumers.

**Contracts become the discovery surface.** A human analyst learns metric semantics from colleagues, wikis, and experience. An agent learns them from whatever it can read at query time. If the contract does not say that recent cohorts are immature, the agent does not know it and will report a declining trend that is an artifact.

That has a concrete implication for how you write contracts: the description field is now load-bearing production text. Write it for a reader who has no context and will act on what it says.

**Invalid combinations must be rejected, not merely discouraged.** A human who slices a ratio metric by stage usually notices the result is nonsense. An agent does not. The `invalid_dimensions` list has to be enforced at the query interface rather than documented in a comment.

**Version pinning becomes essential rather than nice.** An automated report generated weekly by an agent must pin a major version, or the report's meaning changes underneath it when a definition evolves. Human consumers absorb that change through a conversation. Software consumers absorb it as silent inconsistency across time.

There is a fourth effect that is less obvious and more valuable. Contracts written well enough for an agent to use are, in my experience, better documentation for humans too. The exercise of specifying what an agent needs to avoid a wrong answer forces the precision that human-oriented documentation lets you skip.

## Failure modes

**Contract sprawl.** Adoption produces four hundred metrics, most of them near-duplicates authored by different teams. The answer is process rather than tooling: a review step, a naming convention, and an owner requirement before a definition is registered.

**Definitions that drift from the tables.** A metric defined against a column whose semantics changed produces confidently wrong output. Fixture tests catch this only if the fixture is refreshed. Add a scheduled run against live data comparing today's value to a plausible range.

**Untested contracts.** A definition with a `tests` block containing one bounds check passes CI and proves nothing. Require at least one fixture test for any metric an agent can call.

**Version proliferation without deprecation.** Six major versions of the same metric alive simultaneously because nobody enforced deprecation dates. Set the date at creation and let the platform stop serving past it.

**Owner as a team that no longer exists.** Reorganizations orphan definitions. Validate owner fields against your directory in CI and fail the build on an unresolvable owner.

**The escape hatch.** One tool in the stack lets a consumer bypass the semantic layer and query tables directly. Every guarantee above becomes advisory. If direct access is required for exploration, give it a separate identity and a separate audit stream, and keep it off the agent-facing path.

**Contracts as documentation rather than execution.** The definition says one thing and the dashboard computes another, because the dashboard has its own copy of the logic. A contract that does not generate the executed query is a wish. Make the semantic layer the only path that produces the number.

## Rolling this out

Start with the metrics that already caused a disagreement. Every organization has three or four numbers that reliably produce an argument. Those have the clearest ownership, the strongest demand, and the most obvious payoff.

Write the contract with the arguing parties in the room. The point of the exercise is the decision about what the metric means, and the YAML is a record of that decision. A contract authored by a data engineer alone recreates the ambiguity in a new file.

Build one fixture dataset early and reuse it across every contract. The first fixture takes a day to assemble and validate. Every subsequent metric tested against it takes an hour.

Wire CI before you write the fifth contract. Retrofitting tests onto twenty definitions is a project. Adding them from the start is a habit.

Export to the interchange format from the beginning even while the specification is incubating. It costs nothing while you author in one tool and preserves the option when you add a second.

Measure adoption as the share of reported numbers that came through a governed contract, not as the count of contracts written. A hundred contracts that nothing queries is inventory, and inventory is not governance.

Publish the value deltas when a major version changes a number. The credibility of the whole system rests on people trusting that changes are visible.

## Conclusion

Schema contracts guarantee that a column exists and refreshes. Metric contracts guarantee that a number means the same thing every time it is computed, by any consumer, including one that does not have a human checking its work.

The five elements are the calculation, the inclusion rules, the grain and valid dimensions, the temporal semantics, and the ownership and lifecycle. Version them semantically, serve multiple majors during a deprecation window, and test them in CI with bounds, fixtures, consistency, and cross-version checks.

Author wherever your team is productive, export to a portable format so the definitions outlive the tool, and register them in the catalog so discovery and authorization use one mechanism.

Then hold the line on the escape hatch, because every property in this piece survives exactly as long as nothing in the stack lets a consumer compute the number a different way.

Start with the number that already causes an argument. Write the contract with the people who disagree about it in the room, test it against a period whose answer everyone accepts, and let that one artifact demonstrate what the rest of the system is for.

## Keep Going

If this piece was useful, I have written a lot more on semantic layers, catalogs, and the platforms underneath them. *Apache Polaris: The Definitive Guide* covers the catalog and governance model this design registers into, and *Architecting an Apache Iceberg Lakehouse* covers the wider platform. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
