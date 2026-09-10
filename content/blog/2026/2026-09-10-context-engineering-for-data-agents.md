---
title: "Context Engineering for Data Agents"
date: "2026-09-10"
description: "Why text-to-SQL accuracy collapses on enterprise schemas, the five kinds of context an agent needs, where each one hides, and how to make the semantics legible."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - context engineering
  - semantic layer
  - text-to-SQL
  - agentic analytics
  - metadata
canonical: https://iceberglakehouse.com/posts/context-engineering-for-data-agents/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/context-engineering-for-data-agents/).

An executive asks an internal agent what revenue was last quarter. It returns a number, formatted nicely, with the SQL it ran. The number is wrong by eleven percent, because the agent summed a column called `amount` that includes cancelled orders, and the company's definition of revenue excludes them. Nobody catches it, because the query is syntactically perfect and the answer is plausible.

That failure has nothing to do with the model. A better model writes the same query, because the information that prevents it was never available. The exclusion rule lives in a dbt model somebody wrote in 2023, in a Slack thread, and in the head of the analyst who is on vacation.

This is the central problem with agents on company data, and it has a name that is worth taking seriously: context engineering. Not prompt engineering, which is about how you phrase the request. Context engineering is the discipline of making an organization's semantics, rules, and structure available to a machine that has never attended a meeting.

The evidence that this is the binding constraint rather than model capability is now strong enough to argue from numbers, which is where this piece starts. Then the five kinds of context an agent needs, where each one currently hides, how to make it legible, and how to measure whether any of it worked. I work at Dremio, which sells a semantic layer among other things, so discount the enthusiasm accordingly and check the cited measurements yourself.

## What the benchmarks actually show

The public evidence separates cleanly into two regimes, and conflating them is why executives think this problem is solved and practitioners know it is not.

**Academic benchmarks are close to saturated.** On Spider, the cross-domain text-to-SQL benchmark with small schemas and questions that map fairly directly to single queries, exact-match evaluation reaches roughly 91%. On BIRD, which scales to larger databases with real-world content, execution accuracy for leading systems runs around 73%. Those numbers support the impression that natural-language querying works.

**Enterprise-shaped benchmarks collapse.** Spider 2.0 reframes the task around enterprise workflows: large schemas, multiple SQL dialects, multi-step interaction, gold queries that run dozens of lines with CTEs and window functions. Execution accuracy under multi-step agentic evaluation drops to roughly 21%. Same models, same underlying capability, one fifth of the success rate.

**Private business knowledge makes it worse.** EntSQL, a benchmark built specifically around questions requiring long-form internal knowledge like metric definitions, reporting conventions, and fiscal-year rules, reports the best evaluated system reaching 15.9% when long documents are supplied, rising to 21.4% when the evidence is condensed to what is actually relevant.

That last detail is the whole thesis of context engineering in one data point. Handing the model more text made it worse. Handing it the right text, shorter, made it better.

**And the fix that works is structural.** A dbt Labs benchmark published in April 2026 compared models answering business questions against bare tables versus against a semantic layer. In the modeled-project configuration, one frontier model went from 90.0% to 98.2%, and another from 84.1% to 100%, on the same questions. The methodology is open and the dataset is published, so the result is checkable rather than promotional.

**The errors are semantic, not syntactic.** Analysis of production text-to-SQL failures attributes roughly 81% of them to schema and semantic-level problems rather than to malformed SQL. The model writes valid SQL against the wrong columns with the wrong filters. Every instinct that says "the model needs to get better at SQL" is aimed at the smaller 19%.

Put those together and the conclusion is uncomfortable for anyone hoping to solve this with a model upgrade: **the accuracy gap between a demo and production is a context gap, and the largest single lever measured to date is grounding the question in modeled semantics rather than raw tables.**

## Context engineering, defined by what it is not

The term gets used loosely, so here is a working boundary.

**It is not prompt engineering.** Prompt engineering optimizes the instruction. Context engineering optimizes what the model knows when it reads the instruction. A perfect prompt over missing context produces a confident wrong answer, which is the worst available outcome.

**It is not dumping the schema into the window.** The naive approach, putting every table definition in the prompt, fails on enterprise schemas for two reasons. Large schemas exceed practical context budgets, and even when they fit, more irrelevant text degrades performance rather than improving it. The EntSQL result showing condensed evidence outperforming long-form documents is the measured version of this.

**It is not RAG over your wiki.** Retrieval over documentation helps and is nowhere near sufficient, because most of the knowledge an agent needs was never written down in prose. It exists as code in transformation logic, as conventions in dashboard definitions, and as corrections people make verbally when a number looks wrong.

**It is not a model problem waiting on a better model.** The Spider-to-Spider-2.0 collapse happens to every model. Capability that is not grounded in your organization's specifics has nowhere to apply itself.

What it is: the deliberate production and maintenance of machine-readable descriptions of what your data means, what your metrics are, which rules apply, how fresh it is, and which combinations are valid. It is metadata work, and it looks unglamorous next to model selection, which is why it gets skipped and why the projects that skip it stall at the demo.

## The five kinds of context an agent needs

An agent answering a business question needs five distinct kinds of information, and they hide in five different places.

**One: structural context.** Which tables exist, what columns they hold, what types those columns are, and how tables join. The part everyone thinks of first, and the easiest to supply, because it is derivable from the catalog. The hard part is not availability but selection: a schema with 4,000 columns needs the relevant 40 in the window, which makes this a retrieval problem rather than a dumping problem.

**Two: semantic context.** What the columns mean. That `amount` is gross before discounts, that `status = 'C'` means cancelled rather than complete, that `region` uses internal sales regions and not geographic ones. This is the layer where the opening example failed, and it is almost never written down in a form a machine reads, because humans learn it by being corrected.

**Three: metric context.** How the business defines its measures. Revenue excludes cancellations and intercompany transfers. Active user means at least one session in the trailing 28 days, not 30. Churn is measured at the account level, not the seat level. These definitions usually exist in several conflicting versions, which is the condition that produces the same question returning different numbers depending on who asks, a failure mode that has been named metric drift.

**Four: operational context.** How fresh the data is, which tables are trustworthy, which are deprecated, which are populated by a pipeline that failed last night. An agent that answers confidently from a table whose load failed produces a wrong answer that no amount of semantic modeling prevents.

**Five: precedent context.** How similar questions have been answered before. The queries analysts actually run, the joins they actually use, the filters they always apply. This is the richest source of grounded knowledge in most organizations and it sits in query logs and BI tool definitions, largely unmined.

A useful diagnostic: take one real business question, and for each of the five, ask where an agent finds that information today without asking a person. Most teams get a satisfying answer for one of the five.

## Where this knowledge currently hides

Mapping the current state before designing the fix keeps the project honest.

**Transformation code.** dbt models, Spark jobs, and stored procedures encode enormous semantic knowledge as filters and joins. The exclusion rule from the opening example is a `WHERE` clause somewhere. Code is machine-readable in the wrong sense: parseable but not interpretable, since the intent behind a filter is not recoverable from the filter.

**BI tool definitions.** Dashboard measures, calculated fields, and saved queries encode metric definitions and are locked inside a tool with its own model. Some of them are exportable, and doing so is one of the highest-return extraction projects available.

**Documentation.** Wikis and data dictionaries, of variable freshness. Useful when maintained, and the maintenance is the problem.

**Tickets and chat.** The single largest volume, entirely unstructured, containing most of the corrections that constitute institutional knowledge. "That number looks off, did you exclude the test accounts?" is a semantic rule expressed in a Slack message.

**People.** The rest. An analyst reviewing an agent's output and saying "that is not how we count that" is transferring context that exists nowhere else, and that moment is the single best opportunity to capture it. A review workflow that makes the correction easy to record, as a description or a rule rather than as a message, converts the most expensive knowledge source in the company into a durable asset.

The pattern across all five: the knowledge exists and is not addressable. Context engineering is largely the work of moving it from these places into somewhere a machine reads, and keeping it current once moved.

## Mining what you already have

The fastest source of context in most organizations is not written prose. It is the exhaust of work already done, and three sources repay mining immediately.

**Query logs.** Every warehouse and engine keeps them. They contain which tables get used together, which filters appear on nearly every query against a table, which joins experts actually write, and which columns nobody has touched in a year. That last one is a deprecation list you did not have to compile.

A first pass is one aggregation:

```sql
-- Filters that appear on most queries against a table are business rules
-- that nobody wrote down. This surfaces the candidates.
SELECT
  table_name,
  predicate_text,
  count(*)                                        AS occurrences,
  count(*) * 1.0 / sum(count(*)) OVER (PARTITION BY table_name) AS share
FROM query_log_predicates
WHERE query_date >= current_date - INTERVAL 90 DAYS
GROUP BY table_name, predicate_text
HAVING count(*) >= 20
ORDER BY table_name, share DESC;
```

A filter appearing on 80% of queries against a table is a rule. Somebody knows why it is there, the agent does not, and turning that row into a column description takes five minutes and prevents a category of wrong answer.

**BI tool definitions.** Calculated fields and dashboard measures are metric definitions written by people who were accountable for the numbers being right. Exporting them gives you a candidate metric catalog and, more valuably, an inventory of where the same metric is defined more than once. That inventory is uncomfortable reading and it is exactly the reconciliation work that has to happen before an agent can be trusted.

**Transformation code.** Filters and joins in dbt models and Spark jobs encode the same rules. The intent is not recoverable from the code alone, so the useful move is to extract the recurring patterns and take them to the person who wrote them, rather than trying to infer meaning automatically.

The pattern across all three: you are not writing documentation from scratch, you are transcribing decisions that were already made. That framing changes who has to be in the room and how long it takes, and it makes the work far easier to staff than a documentation initiative.

## Making metadata agent-legible

The concrete work has a shape. Here is what "legible" means in practice, ordered by return.

**Column descriptions that state meaning, not restate the name.** A description reading "the amount" for a column named `amount` is worse than nothing, because it occupies space and conveys none. The useful version states the unit, the inclusion rule, and the trap:

```yaml
models:
  - name: fct_orders
    description: >
      One row per order line at time of order placement. Does not reflect
      later modifications. For current order state, use fct_order_current.
    columns:
      - name: amount
        description: >
          Gross line amount in USD before discounts, taxes, and returns.
          Includes cancelled orders. For revenue, filter status != 'C'
          and use the revenue metric rather than summing this column.
      - name: status
        description: >
          Order lifecycle code. 'O' open, 'S' shipped, 'C' cancelled,
          'R' returned. Cancelled and returned orders remain in this table.
      - name: region
        description: >
          Internal sales region, not geography. A customer in Ontario is
          in region 'US-NORTH'. Join to dim_region for the display name.
```

Every one of those descriptions prevents a specific wrong answer. That is the test for whether a description is worth writing: name the query it stops from being wrong.

**Metric definitions as code, in one place.** The single highest-value artifact. Each metric named once, defined once, with its filters and grain explicit:

```yaml
metrics:
  - name: revenue
    label: Revenue
    description: >
      Net revenue recognized. Excludes cancelled and returned orders and
      intercompany transfers. Reported in USD at the transaction rate.
    type: simple
    type_params:
      measure: order_amount
    filter: |
      {{ Dimension('order__status') }} not in ('C', 'R')
      and {{ Dimension('customer__is_intercompany') }} = false
    meta:
      owner: finance-analytics
      certified: true
      review_cadence: quarterly
```

An agent that answers revenue questions by calling this definition cannot make the opening example's mistake, because it never touches the raw column.

**A join graph with valid paths.** Which tables join to which, on what keys, and with what cardinality. Agents invent joins that are syntactically valid and semantically meaningless, and a declared join graph is the cheapest prevention available. Stating which joins fan out is equally important, since a fan-out join silently multiplies a sum.

**Deprecation and trust signals.** Which tables are certified, which are someone's scratch space, which are superseded. An agent given a catalog with no trust signal treats a two-year-old copy of a table as equally valid, and it is usually the one with the appealing name.

**Freshness, exposed as data.** The agent should be able to ask when a table was last loaded and refuse or caveat when the answer is stale. This is available from table metadata in a lakehouse and is rarely wired into the agent's context.

None of that is new practice. Every item is something data teams have been told to do for a decade for human consumers, and it never quite justified the effort because humans route around missing documentation by asking someone. Agents cannot ask someone. That changes the return on this work by enough to fund it, which is the genuinely new thing about the agent era for data teams.

## The semantic layer is the lever

Everything above is metadata hygiene. The structural change that produces the measured accuracy jump is putting a semantic layer between the question and the tables.

The mechanism is worth being precise about, because "semantic layer" is a term with several meanings. What matters here is that the agent's target changes. Without one, the agent's job is to translate a business question into SQL over physical tables: it has to discover which tables are relevant out of thousands of columns with cryptic names, work out the joins, apply the right filters, and get the dialect right. With one, the agent's job is to select a metric and a set of dimensions from a modeled interface, and something else compiles that into correct SQL.

Two hard problems disappear rather than getting easier.

**Grounding.** Instead of finding the right columns in a large physical schema, the agent picks from a small set of named business concepts. The search space shrinks by orders of magnitude and every option in it is valid by construction.

**Composition.** Instead of writing multi-step SQL with the right joins, aggregations, and dialect functions, the agent emits a structured request and the compiler produces the SQL. Dialect differences, join paths, and fan-out traps become the compiler's problem, and compilers are reliable at exactly this.

The published benchmark movement follows directly from removing those two failure sources, and it is why the intervention outperforms model upgrades.

Three practical qualifications keep this from being oversold.

**It only covers what has been modeled.** A question about something outside the semantic layer either fails or falls back to raw SQL with all of its original problems. Most organizations need both paths, with the modeled one governing anything that matters and raw exploration available for the rest, clearly labelled as ungoverned.

**Modeling is the work.** The accuracy comes from the modeling, not from the layer. A thin semantic layer over the same confusion produces the same wrong answers with more infrastructure. The benchmark result that reached 100% did so on a well-modeled project, and the researchers noted the tension between semantic-layer quality and overfitting to the evaluation, which is the honest caveat to carry forward.

**Coverage decides usefulness.** A semantic layer covering 12 metrics in an organization with 300 in circulation routes most questions to the fallback path. Coverage of the metrics people actually ask about is what determines whether users experience the layer at all.

The sequencing that works: model the top 20 questions by volume, measure accuracy on them, expand by demand. Modeling everything before turning anything on is how these projects run for a year without a user.

## What goes in the window

Given all this context, the engineering question becomes which parts land in a given request. Context budgets are finite, and the EntSQL finding says more is not better.

**Retrieve structural context, do not inject it.** For any question, select the handful of relevant tables and columns rather than the whole schema. Selection by embedding similarity over column descriptions works, and selection informed by query logs works better, because tables that get queried together are the tables that belong together.

**Inject semantic and metric context for whatever was retrieved.** Once the relevant entities are chosen, their descriptions, metric definitions, and rules are small enough to include in full. This is the material that prevents wrong answers, so it earns its space.

**Always inject the rules that apply globally.** Fiscal calendar, currency conventions, the definition of a test account, the exclusion list every query needs. These are short, they apply everywhere, and omitting them causes systematic error rather than occasional error.

**Give operational context as a tool, not as text.** Freshness and pipeline status change constantly. Baking them into a prompt guarantees staleness. Exposing a "check table freshness" tool the agent calls when it matters keeps the answer current.

**Use precedent as retrieved examples.** A handful of previously validated question-and-query pairs, retrieved by similarity to the current question, is one of the most efficient uses of context available. It transmits join conventions, filter habits, and house style in a form the model uses directly.

The shape that emerges: a small stable core of global rules, a retrieved set of relevant entities with full descriptions, a few precedent examples, and tools for anything time-varying. That structure fits comfortably in a context budget and it degrades gracefully, because a poor retrieval produces a "not enough information" response rather than a confident wrong one, provided you asked for that behavior explicitly.

## Measuring whether any of it worked

Context engineering without evaluation is redecorating. The measurement apparatus is not complicated and almost nobody builds it before shipping.

**Build an eval set from real questions.** Fifty to two hundred questions people actually asked, each with a verified correct answer produced by an analyst. Sourcing them from ticket queues and BI logs takes a week and is the foundation for everything else. Questions invented by the team building the agent are systematically easier than real ones, in the specific way that matters: they use the vocabulary the builders already know.

**Score execution accuracy, not query similarity.** Whether the returned answer matches the verified answer. Comparing generated SQL to reference SQL punishes correct queries written differently and rewards wrong ones written similarly.

**Test metric consistency explicitly.** Ask the same question five different ways and check that the number is identical. Variation is the direct measurement of metric drift, and it catches the failure that damages trust fastest, since a business user who gets two different revenue numbers stops using the system permanently.

**Track refusal quality.** An agent that says it lacks the information to answer is behaving correctly when it lacks the information. Measure how often it refuses, and how often those refusals were appropriate. A system with 95% accuracy and zero refusals is usually worse than one with 90% accuracy that declines the 10% it cannot handle, because the first one is wrong silently.

**Re-run the eval on every context change.** Adding descriptions, modeling a metric, changing retrieval: each is a change to the system, and each needs a before-and-after number. This is what turns context engineering from an act of faith into an engineering practice with a feedback loop.

**Record which context was in the window.** When a question fails, the diagnostic question is what the agent had available, and reconstructing that after the fact is nearly impossible unless you logged it. Storing the retrieved entities and injected rules alongside each eval result turns failure analysis from speculation into reading.

**Segment results by question type.** Aggregate accuracy hides the structure. Single-metric lookups, comparisons across time, multi-entity joins, and questions requiring business rules have different accuracy profiles, and knowing which segment is failing tells you which of the five context kinds to work on next.

## A worked example, end to end

Abstract advice is easy to nod at, so here is one question carried through the whole apparatus.

**The question.** "How did revenue in the northern US region compare to last quarter?"

**What a bare-schema agent does.** Searches a schema with several thousand columns, finds `fct_orders.amount` and `dim_customer.region`, writes a query summing `amount` grouped by quarter with `region = 'North US'`. Three errors, none of them syntactic. It summed a column that includes cancelled and returned orders. It matched a region string that does not exist, since the internal code is `US-NORTH`, so the filter returns nothing and the query returns zeros, or worse, it fuzzy-matched something that partially works. And it used calendar quarters where the company reports on a fiscal year starting in February.

**What each layer of context fixes.**

Structural retrieval narrows the candidate set to the order fact table, the customer dimension, and the region dimension, rather than presenting thousands of columns. That alone raises the odds the right tables get used.

The column description on `region` states that codes are internal sales regions rather than geography and points at the dimension table for display names, which eliminates the string mismatch.

The metric definition for revenue carries the exclusion of cancelled and returned orders and intercompany transfers, so the agent calls the metric rather than summing the raw column. The largest single error disappears.

The global rules block states that the fiscal year starts in February and that quarter comparisons are fiscal by default unless the user says calendar. The time-grain error disappears.

Operational context lets the agent check that the orders table loaded successfully this morning before answering, and caveat rather than assert when it did not.

Precedent supplies two previously validated examples of quarter-over-quarter regional comparisons, which transmits the house convention for how the comparison is expressed, whether as an absolute difference, a percentage, or both.

**What the agent emits.** A structured request naming the revenue metric, the region dimension, and a fiscal quarter grain, which the semantic layer compiles into SQL. The agent never wrote a join, never chose a filter, and never picked a column.

**What is still hard.** If "northern US region" is ambiguous because the company has both a sales region and a marketing territory with similar names, no amount of the above resolves it, and the correct behavior is to ask. Building agents that ask rather than guess on ambiguity is its own piece of work, and it depends on the context layer being explicit about which concepts collide.

That walk-through is worth doing on paper for your own top question before building anything. It shows exactly which of the five context kinds you are missing, and it usually takes twenty minutes.

## Starting from nothing: a first ninety days

For a team with no semantic layer, no descriptions, and pressure to ship an agent.

**Weeks one and two: build the eval set.** Fifty real questions from ticket queues and BI logs, each with an analyst-verified answer. Nothing else in this list matters without it, and every week you delay it is a week of unmeasured work.

**Week three: establish the baseline.** Run the questions against a bare-schema agent and record the accuracy, segmented by question type. The number will be low and that is useful. It is the denominator for everything that follows, and it prevents the later argument about whether any of this helped.

**Weeks four through six: model the top metrics.** The ten to fifteen measures the eval questions actually use. Definitions as code, with owners, reconciled against whatever the existing dashboards say. The reconciliation is where the surprises are, and finding two live definitions of the same metric before launch is much better than after.

**Weeks seven and eight: write descriptions where the failures are.** Not everywhere. Take the questions that still fail, look at what the agent got wrong, and describe those specific entities. Each description should have a failure it explains.

**Week nine: wire operational context as tools.** Freshness checks and pipeline status, callable rather than injected.

**Week ten: add precedent retrieval.** Validated question-and-query pairs from the eval set itself, retrieved by similarity. The eval set does double duty here, which is a pleasant property.

**Weeks eleven and twelve: re-measure, segment, and decide.** Accuracy by question type against the baseline. Whatever segment is still weak names the next quarter's work. And if refusal behavior is not yet in place, add it, because shipping something that answers everything confidently is worse than shipping something narrower.

The output at the end is a number you trust, a set of governed metrics, and a list of what to do next that came from measurement rather than from intuition. That is a defensible position to be in, and most teams twelve weeks into an agent project are not in it.

## Where this goes wrong

**Documenting everything before measuring anything.** A six-month project to describe every column in the warehouse, with no eval set, ending in an unknown amount of improvement. Start with the eval set, then document the entities the failing questions touch.

**Descriptions that restate names.** Generated in bulk, often by a model, filling the field and conveying nothing. They pass a completeness audit and change no outcome. A smaller number of descriptions that each prevent a specific error beats full coverage of empty ones.

**Semantic layer as a thin wrapper.** Exposing the same tables with the same names under a new API. All of the infrastructure, none of the modeling, so none of the accuracy.

**Ignoring the fallback path.** Modeled questions work beautifully, and everything else falls through to raw text-to-SQL with no labeling, so users cannot tell which answers are governed. The fallback needs to announce itself.

**Letting definitions fork.** The metric layer defines revenue, and a dashboard defines it differently, and both are live. The agent is now correct and inconsistent with a report the executive already trusts, which reads as the agent being wrong. Reconciling before launch is unglamorous and load-bearing.

**Stale context.** Descriptions written once, schema evolved since, agent grounded in a description of a column that no longer means that. Context is code and it needs the same review discipline: changes to a model that alter meaning should require updating the description in the same change.

**Treating agent errors as model errors.** The reflex is to try a better model. The measured evidence says the ceiling is set by grounding. Every hour spent on model selection before the eval set exists is an hour spent guessing.

## Two failure patterns worth naming

Beyond the list above, two patterns recur often enough to have their own names in most teams that have shipped one of these systems.

**The plausible number.** The agent returns a figure that is wrong by a margin small enough to pass a sanity check. Revenue off by eleven percent looks like revenue. This is the failure mode that damages an organization most, because it survives review, propagates into a deck, and gets discovered weeks later by someone reconciling against the general ledger. Large errors are self-correcting, since somebody notices. Small errors are not.

The defense is structural rather than statistical: route anything that has an official definition through the metric layer, so the agent is incapable of computing it a second way. Accuracy testing catches these in evaluation, and only the definition layer prevents them in production.

**The confident schema hallucination.** The agent references a column that does not exist, gets an error, and repairs the query by substituting a column that does exist and means something else. Each individual step looks like good agent behavior, and the composite is a wrong answer arrived at through visible reasoning, which makes it more convincing than a blunt failure.

The defense is constraining the vocabulary. An agent selecting from a modeled interface cannot invent an entity, because the interface enumerates what exists. An agent writing raw SQL over a large schema can always invent one, and retry loops give it several chances to.

Both patterns point the same direction, and it is the direction the benchmark evidence points too: reliability comes from narrowing what the agent is allowed to say, not from improving how it says it.

## What this asks of the data team

The uncomfortable part of this discipline is that it is not really a machine learning project. It is a data modeling project with a new consumer, and the skills it needs are the ones data teams already have.

**Somebody owns each metric.** Named, with a review cadence. Metrics without owners fork.

**Descriptions are part of the definition of done.** A new model without column descriptions is incomplete in the same way a new API without documentation is incomplete, and the enforcement mechanism is code review rather than exhortation.

**The eval set has a maintainer.** It grows as new question types appear and it decays if nobody adds the questions that failed last week.

**Query logs are treated as an asset.** They are the record of what people actually ask and how experts actually answer, which makes them the raw material for both retrieval and precedent examples.

**The glossary is a product with users.** Its users are now partly machines, which raises the bar on precision and lowers the tolerance for entries that say "see the finance team."

The reframe worth internalizing: for a decade, incomplete metadata was a productivity tax on humans who worked around it. With agents in the loop, incomplete metadata is a correctness problem with a measurable error rate. That is a much easier case to fund, and it is the reason this work is finally getting done.

## Governance rides along with context

One consequence of this work gets discovered late and deserves planning for: the context layer is also where access control becomes tractable.

An agent grounded in raw tables is authorized at the table level, because that is the only boundary the storage layer understands. An agent grounded in a semantic layer is authorized at the concept level, and concepts map onto business rules far better than prefixes do. "This role sees revenue by region but not by individual customer" is expressible against modeled metrics and dimensions, and awkward against physical tables.

Three specifics.

**Row and column policy belongs with the definition.** A metric definition that carries its own access rules travels with the metric rather than being reimplemented per consumer. That is the difference between one enforcement point and one per tool.

**Identity has to propagate.** An agent querying on a user's behalf while authenticating as its own service account gets that user's questions answered against the agent's permissions, which is a data leak with a friendly interface. Identity propagation from user through agent to catalog is a design decision, and retrofitting it into an agent built around a service account is a rewrite rather than a setting.

**The audit trail improves.** A modeled request naming a metric and dimensions is far more legible in a log than the SQL it compiles to. "Who asked about revenue by customer last month" is answerable from structured requests and painful from a pile of generated SQL.

None of that is why teams build a semantic layer, and it is a large part of why the ones that have it are able to say yes to agent projects that others have to refuse.

## Where this is heading

Three developments over the next year or two.

**Semantic layers built for agents rather than adapted for them.** Current semantic layers were designed for BI tools, and their interfaces reflect that. Interfaces designed for a model consumer look different: richer descriptions, explicit statements about what a metric excludes, machine-readable disambiguation between similar concepts. That category is forming now.

**Context served through standard protocols.** MCP has become the common way agents reach tools and data, and it moved to vendor-neutral governance under the Linux Foundation at the end of 2025. As catalogs and semantic layers expose themselves through it, context stops being something each agent implementation assembles separately and becomes something the data platform serves. The protocol standardizes the wire format and deliberately leaves identity, authorization, and observability outside its core, so the governance question stays yours.

**Evaluation as platform infrastructure.** Today each team builds its own eval tooling. The pattern is repetitive enough that it becomes a platform capability, with question sets versioned alongside semantic models and accuracy tracked per metric the way freshness is tracked per table.

What will not change is the underlying fact. A model cannot know that your fiscal year starts in February, that region codes are commercial rather than geographic, or that the finance team excludes intercompany transfers. Somebody has to write it down, in a form a machine reads, and keep it true. That is the job, and it does not get automated away by a better model, because the information is not in any model's training data. It is in your company.

## Conclusion

The gap between an agent that demos well and one that answers correctly is a context gap, and the measurements say so clearly. Academic benchmarks with small schemas run above 90%. Enterprise-shaped benchmarks with large schemas and real workflows drop to roughly a fifth of that. Benchmarks requiring private business knowledge drop further still. And the intervention that moves the number most is not a bigger model, it is grounding the question in modeled semantics, which took one published benchmark from 90.0% to 98.2% and another from 84.1% to 100% on identical questions.

The work is five kinds of context: structure, semantics, metrics, operations, and precedent. Structure is easy and needs retrieval rather than dumping. Semantics and metrics are where the accuracy lives, and they need writing down. Operational context belongs in tools rather than text, because it changes. Precedent is sitting in your query logs, unused.

Build the eval set first, from real questions with verified answers. Model your top metrics rather than all of them. Write descriptions that each prevent a specific wrong query, and delete the ones that restate a column name. Measure after every change. Then let the failures tell you which of the five kinds of context to work on next, because they will, and the answer is rarely the one you assumed.

## Keep Going

If this piece was useful, I have written a lot more on data architecture and AI. I have a book on AI and labor economics covering how this shift changes the work itself, available at [https://a.co/d/06SeOKw8](https://a.co/d/06SeOKw8), and *Architecting an Apache Iceberg Lakehouse* covers the semantic and catalog layers these agents depend on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
