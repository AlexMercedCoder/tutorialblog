---
title: "Why AI Agents Fail on Raw Data, and What to Give Them Instead"
date: "2026-07-28"
description: "Agents fail on raw lake data because business rules live in people's heads. Data products with semantic contracts fix this at the source."
author: "Alex Merced"
category: "Data Engineering"
tags:
  - AI Agents
  - Apache Iceberg
  - Semantic Layer
  - Data Products
canonical: "https://iceberglakehouse.com/posts/data-products-for-ai-agents/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/data-products-for-ai-agents/).

# Why AI Agents Fail on Raw Data, and What to Give Them Instead

An analytics agent gets read access to the data lake. Someone asks it for last quarter's revenue by region. It finds a table named `fact_orders`, writes a clean SELECT with a SUM and a GROUP BY, and returns a number that is 14 percent too high.

The SQL was valid. The table was real. The number was wrong, because `fact_orders` includes cancelled orders, and everyone on the data team knows to filter `status <> 'CANCELLED'`. Nobody wrote that down anywhere the agent looked.

This is the characteristic failure of agentic analytics, and it is worse than an error. An error stops. A confidently wrong number gets pasted into a deck.

The instinct when this happens is to reach for a better model. That helps at the margins and does not address the cause. The agent did not fail at reasoning. It failed because the information required to answer correctly was not in the system it was reading, and no amount of intelligence recovers a business rule that exists only in the heads of four people.

I work at Dremio, which builds a semantic layer product, so I have a commercial interest in this argument. The reasoning below stands on its own and applies whether you build the layer yourself or buy one.

This piece covers why raw tables are the wrong input for an agent, what a data product actually has to contain, how the medallion layers map onto agent consumption, how to write semantic contracts an agent reads, and how to test whether any of it is working.

## What "raw data" actually means to an agent

Give a competent human analyst access to a raw lake and they produce correct answers slowly. They open tables, look at samples, notice that `status` has six distinct values, ask someone what `PENDING_HOLD` means, and eventually build a mental model. The slowness is the model-building, and once built it persists.

An agent starts from zero on every session. Whatever it learns about `fact_orders` in one conversation is gone in the next. There is no accumulating mental model unless something in the system holds it.

That difference reframes the problem. The question is not "can the agent figure this out." Sometimes it can. The question is "does the agent have to figure this out every single time," and if the answer is yes, you have built a system where correctness depends on a fresh act of inference on every request. That is not a reliable system, no matter how good the inference usually is.

Four specific things raw tables fail to communicate.

**Which table is authoritative.** A lake accumulates `orders`, `orders_v2`, `orders_new`, `stg_orders`, and `orders_backup_20241103`. A human knows which one is real from context and tribal knowledge. An agent sees five plausible candidates and picks by name similarity, which is not a correctness criterion.

**What the columns mean.** `amt`, `amt_net`, `amt_usd_net_adj`. A human asks. An agent guesses, and the guess is often right, which is worse than being often wrong because it establishes trust the exceptions then violate.

**What filters are always required.** The cancelled-orders rule. The test-account exclusion. The internal-transfers filter. These live in the SQL of every existing dashboard and in nobody's documentation.

**What grain the table is at.** One row per order, or one row per order line, or one row per order per status change. Sum the amount column on the wrong grain and you get a number that is wrong by a multiple, not by a rounding error.

Every one of these is knowledge that exists in the organization. None of it is in the tables.

## The thing to build

A data product is a dataset shaped for consumption, with the consumption contract attached to it. That definition is doing a lot of work, so take it in pieces.

**Shaped for consumption** means the transformations a consumer otherwise has to apply are already applied. Cancelled orders are excluded. Test accounts are gone. Currency is normalized. The grain is one thing and is stated. A consumer that selects everything and sums a column gets a correct answer.

**With the contract attached** means the descriptions, definitions, grain statement, freshness guarantee, and ownership live with the dataset rather than in a wiki. Attached is the operative word. A description in a Confluence page is documentation. A description in the catalog is a contract, because it travels with the data to every consumer including automated ones.

The second half is the half teams skip, and it is the half that matters for agents. A well-shaped table with no attached semantics is a table an agent still has to guess about. A moderately shaped table with excellent attached semantics is one an agent uses correctly.

Concretely, a data product for agent consumption carries:

- A one-line statement of what one row represents
- A column description per column, in business language, including units
- The filters already applied, stated explicitly
- Freshness: how current the data is and how often it updates
- Ownership: who to ask, and who gets paged when it breaks
- Known limitations: what this dataset is not suitable for

That last item is undervalued. An agent that reads "this dataset excludes wholesale channel orders" declines to answer a wholesale question, or caveats its answer. An agent without that line answers confidently and wrongly.

Here is what each layer offers an agent.

| | Bronze | Silver | Gold without semantics | Gold with semantics |
|---|---|---|---|---|
| Types correct | No | Yes | Yes | Yes |
| Business rules applied | No | No | Yes | Yes |
| Grain stated | No | No | Sometimes | Yes |
| Column meaning available | No | No | Column names only | Business language |
| Known limitations stated | No | No | No | Yes |
| Agent outcome | Nonsense | Confident wrong answers | Usually right | Right, or an honest refusal |

The jump that matters is the last column, and it is the one teams skip because the previous column already looks finished.

## Bronze, silver, gold, and which one an agent touches

The medallion pattern predates agents and maps onto them cleanly, so it is worth restating in these terms.

**Bronze** is raw ingested data, structurally faithful to the source. Its purpose is reprocessing. When a transformation is found to be wrong, bronze is what you rebuild from. Agents have no business here, and access should reflect that.

**Silver** is cleaned and conformed. Types are correct, duplicates are resolved, keys are standardized across sources, obvious garbage is quarantined. Silver is where data engineers work. It is queryable and it does not encode business rules, so an agent reading silver hits the cancelled-orders problem in full.

**Gold** is business-ready, aggregated or shaped for a consumption pattern, with business rules applied. This is agent territory, and it is the only layer an agent should have default access to.

The layering is standard. What agents change is the argument for how much gold you need.

In a human-only world, an analyst who needs something gold does not cover writes SQL against silver. That is a normal Tuesday and it works, because the analyst carries the business rules in their head. Gold is a convenience layer for common cases.

In a world with agents, silver access is a correctness hazard rather than a flexibility feature. An agent that falls back to silver when gold does not cover a question produces exactly the confident wrong answer this article opened with. The right behavior is to decline, which requires that it never had silver access to begin with.

So the coverage requirement on gold goes up. Questions your users will ask need gold datasets behind them, because the fallback path is no longer safe. That is real work, and it is the actual cost of doing agentic analytics well. Anyone selling you agent analytics without mentioning it is selling you the demo.

Two practical notes.

You do not need one gold dataset per question. You need one per subject area at a usable grain. A gold orders dataset at order-line grain with dimensions attached answers a wide range of questions, because aggregation composes. Do not build the Cartesian product of questions.

Gold does not have to be materialized. A view carrying the business rules, with its semantics attached, is a data product. Whether it is precomputed is a performance decision, separate from whether it exists as a defined product.

## The joins an agent should not be writing

Dimensional modeling gave us the star schema, and it was the right answer for its constraints. Storage was expensive, so you normalized. BI tools understood joins, so you let them join.

An agent writing joins is a different proposition, and the failure modes are specific.

**Fan-out on the wrong cardinality.** An agent joins orders to order lines and sums the order-level total. Every order with three lines counts its total three times. The SQL is valid, the join is legal, and the number is wrong by a factor that varies with the data. This is the single most common numerical error I see agents make.

**Silent inner joins dropping rows.** An agent joins facts to a dimension with an inner join. Rows whose dimension key is missing or late-arriving disappear. The total drops by 2 percent and nobody notices, because 2 percent looks like normal variance.

**Picking the wrong join key among several.** Tables often carry more than one plausible key, meaning a natural key and a surrogate key, or a current key and a historical one. An agent joining on the wrong one produces a result that is subtly incorrect rather than empty.

**Slowly changing dimension confusion.** A dimension with effective dates requires a point-in-time join to attribute a fact to the dimension value in force when the fact occurred. An agent joining on key alone attributes every historical order to the customer's current region, which quietly rewrites your regional history.

The response is not to teach agents better join skills. It is to remove the requirement. A gold dataset with dimensions already joined, at a stated grain, eliminates all four failure modes at once. The join was written once by someone who knew the cardinality, the key, and the temporal semantics.

This runs against a normalization instinct many data engineers hold strongly, so let me put the tradeoff plainly. Denormalizing costs storage and creates a refresh dependency. It buys correctness for consumers that cannot reason about join semantics. On a lakehouse where storage is cheap and columnar compression is good, that trade favors denormalization more than it did in the warehouse era, and the arrival of consumers with no memory tilts it further.

Where the agent genuinely needs a join across gold datasets, make it a simple one. Two gold datasets at the same grain with a shared key join safely. Two gold datasets at different grains do not, and if your design requires that join, you are one gold dataset short.

A useful check: look at the SQL an agent produced for a question it got right. If it contains more than one join, you got lucky. Build the dataset that makes the next attempt not require luck.

## Writing semantics an agent reads

The gap between "we have descriptions" and "we have descriptions an agent uses" is real. Here is what the difference looks like.

Start with the table definition itself. This is a gold view with business rules applied:

```sql
CREATE OR REPLACE VIEW gold.sales.order_lines AS
SELECT
    ol.order_line_id,
    ol.order_id,
    o.customer_id,
    o.order_placed_at,
    d.region_name,
    p.product_category,
    ol.quantity,
    ol.unit_price_usd,
    ol.quantity * ol.unit_price_usd        AS gross_revenue_usd,
    ol.quantity * ol.unit_price_usd
      - coalesce(ol.discount_usd, 0)       AS net_revenue_usd
FROM silver.sales.order_lines ol
JOIN silver.sales.orders o
  ON ol.order_id = o.order_id
JOIN silver.ref.regions d
  ON o.region_id = d.region_id
JOIN silver.ref.products p
  ON ol.product_id = p.product_id
WHERE o.order_status <> 'CANCELLED'
  AND o.is_test_account = false
  AND o.channel <> 'INTERNAL_TRANSFER';
```

The three WHERE clauses are the business rules that were previously tribal knowledge. They are now applied once, in one place, and every consumer inherits them.

Now attach the semantics:

```sql
ALTER VIEW gold.sales.order_lines SET TBLPROPERTIES (
  'grain' = 'One row per order line. An order with 3 products produces 3 rows. Do not count rows to count orders.',
  'excludes' = 'Cancelled orders, test accounts, internal transfers.',
  'suitable_for' = 'Revenue analysis, product mix, regional performance.',
  'not_suitable_for' = 'Order counts (use gold.sales.orders), returns analysis (returns are not reflected here).',
  'freshness' = 'Updated every 15 minutes from source. Timestamps are UTC.',
  'owner' = 'sales-analytics-team',
  'comment.net_revenue_usd' = 'Gross revenue minus line-level discount, in USD. This is the revenue measure for standard reporting.',
  'comment.gross_revenue_usd' = 'Quantity times unit price before discounts, in USD. Rarely the right measure. Use net_revenue_usd unless specifically asked for gross.',
  'comment.order_placed_at' = 'When the customer submitted the order, UTC. Not the ship date and not the payment date.'
);
```

Read those property values as prompts, because that is what they become. Each one anticipates a specific mistake.

The grain property does not just state the grain. It names the error, counting rows to count orders, which is the mistake an agent actually makes on a line-grain table.

The `not_suitable_for` property points at the alternative dataset. An agent asked for order counts reads that and redirects rather than producing a wrong count from this table.

The comment on `gross_revenue_usd` says outright that it is rarely the right measure. Two similarly named columns is the classic agent trap, and the resolution is to say which one is the default in language the model reads.

This is prompt engineering applied to metadata, and it is a better place for it than a system prompt. A system prompt is one team's context. Table properties are the whole organization's context, and they stay attached when the dataset is consumed through any tool.

Whether you store this in table properties, a semantic layer product, or a catalog's description fields matters less than that it exists in one place and reaches the agent's tool output. If your MCP server returns bare schemas, the best semantics in the world are invisible.

## Metrics are a separate artifact from datasets

There is a layer above data products that teams often collapse into them, and separating it pays off.

A dataset answers "what rows exist." A metric answers "how do we calculate this number." Those are different questions with different owners and different change rates.

Net revenue is a metric. Its definition, gross minus line discount minus returns allowance, is a business decision owned by finance. It applies across several datasets. It changes when finance decides it changes, on a different schedule from any pipeline.

When metric definitions live only inside dataset SQL, three problems follow.

**Duplication drifts.** The same metric gets implemented in six gold views. Someone updates four of them. Now the number depends on which dataset answered the question, which for an agent is nondeterministic across sessions.

**The definition is not discoverable.** An agent asked for net revenue finds a column named `net_revenue_usd` and uses it. That works when the column exists. When the question needs net revenue sliced a way no existing dataset covers, the agent has no access to the definition and reconstructs it by guessing.

**Ownership is unclear.** The finance team owns the definition of net revenue. They do not own `gold.sales.order_lines`. When the definition changes, the change request has to find every implementation, which requires knowing where they all are.

The fix is to define metrics once, with their own descriptions and ownership, and reference them from datasets. Different tools express this differently, and the shape is consistent: a named metric, an expression, the dimensions it can be sliced by, and a description written for a consumer.

```yaml
metrics:
  - name: net_revenue
    label: Net Revenue
    expression: sum(net_revenue_usd)
    dataset: gold.sales.order_lines
    owner: finance-reporting
    description: >
      Revenue after line-level discounts, in USD. This is the standard
      revenue measure for external reporting. It excludes cancelled
      orders, test accounts, and internal transfers. It does NOT net
      out returns; for returns-adjusted revenue use net_revenue_after_returns.
    dimensions: [region_name, product_category, order_placed_at]
    grain_note: >
      Safe to sum at any grain. Do not divide by row count to get
      average order value; use the avg_order_value metric, which
      divides by distinct orders.
```

Read the description field again. It states what the metric is, what it excludes, what it is not, and where to go instead. The grain note names the specific division error an agent makes on line-grain data.

The `dimensions` list is doing quiet work too. It tells an agent which slices are valid, which is a constraint rather than a suggestion. An agent asked to slice net revenue by a dimension not on that list gets a clear signal to decline rather than joining something in to make it work.

Whether you express this in a dedicated semantic layer, in dbt metric definitions, or in a catalog's own representation matters less than the separation itself. What matters is that the definition exists once, has an owner, and reaches the agent's context.

## Who writes the semantics

This is the question that stalls the work, and it deserves a direct answer rather than a shrug about collaboration.

The honest situation is that three groups hold different pieces and none of them holds all of it.

**Data engineers** know the pipeline: where data comes from, what transformations run, what the grain is, what breaks. They do not always know why a business rule exists, and they rarely know which columns get misused.

**Analysts** know the traps. They have made the mistakes. They know that `gross_revenue_usd` gets grabbed by mistake, that the wholesale exclusion surprises people, that the timestamp is submission and not shipment. This knowledge is the most valuable input and the least documented, because it lives as habit rather than as fact.

**Business owners** know the definitions and own the decisions. Finance owns what net revenue means. They rarely know what a gold dataset is.

A workable split:

Data engineers write the grain statement, the freshness statement, and the exclusions. These are facts about the pipeline and the engineer is the authority.

Analysts write the column descriptions and the `not_suitable_for` field. Specifically, they write them by recalling mistakes. The prompt that works in a room is "what has someone gotten wrong with this table," and the answers become descriptions almost verbatim.

Business owners approve metric definitions and own changes to them. They do not write dataset documentation.

One person coordinates, and the coordination is the actual job. Semantic quality dies from diffusion of responsibility more than from any technical cause.

On cadence: review descriptions when the underlying transformation changes, and audit the top twenty datasets by agent usage quarterly. Usage-ranked auditing beats alphabetical auditing by a wide margin, because attention should follow consequence.

On tooling: put the descriptions where the pipeline code lives if you can, so they change in the same pull request as the transformation they describe. Semantics maintained in a separate system drift from the data by exactly the amount of friction between the two systems.

## Testing whether it works

You cannot manage this without measurement, and the measurement is more tractable than people expect.

Build an evaluation set. Twenty to fifty questions in the language your users actually use, each with a known-correct answer computed by hand or by a trusted existing report. Include the traps.

```
Q: What was net revenue by region last quarter?
   Expected: [region: value] from the finance close report.

Q: How many orders did we take in June?
   Expected: 48,213. Trap: line grain vs order grain.

Q: What is our average order value?
   Expected: 312.40. Trap: requires order grain, and "average" over lines is wrong.

Q: Which products had the most returns last month?
   Expected: a refusal or redirect. Returns are not in this dataset.

Q: What was revenue including wholesale?
   Expected: a caveat that wholesale is excluded, or a redirect.
```

The last two matter as much as the first three. A useful evaluation set measures appropriate refusal, not just correct answering. An agent that answers everything is worse than one that answers 80 percent and declines the rest, because you can build process around a known refusal and you cannot build process around silent wrongness.

Run the set after every change to the semantic layer, and treat it like a test suite. When a question starts failing, the cause is usually a change to a description or a new similarly-named dataset that confused the retrieval.

Two metrics worth tracking over time.

**Answer accuracy on the eval set.** The obvious one. Watch the trend rather than the absolute number, since the number depends entirely on how hard you made your set.

**Refusal appropriateness.** How often the agent declines when it should, and how often it declines when it should not. The second failure mode indicates over-restriction, which shows up as user frustration rather than wrong numbers and gets reported far less.

When a question fails, resist the urge to fix the prompt. Ask what the agent needed to know and where that information should have lived. Almost always the answer is a missing or badly written description, and fixing it there fixes the class rather than the instance.

## A failure worth walking through

Abstractions land better with a specific case, so here is a composite of failures I have seen, traced to its cause.

**Symptom.** An agent reports Q2 net revenue as 4 percent higher than the finance close. Nobody notices for three weeks, because 4 percent is within the range where people assume a definitional difference.

**First investigation.** Someone checks the SQL the agent wrote. It reads from `gold.sales.order_lines`, sums `net_revenue_usd`, filters on a quarter date range. It looks correct. The instinct at this point is to blame the model.

**What was actually wrong.** The gold view excludes cancelled orders using `order_status <> 'CANCELLED'`. Three months earlier, the source system added a second cancellation state, `CANCELLED_BY_MERCHANT`, for a new merchant-initiated flow. The filter did not cover it. Roughly 4 percent of orders in Q2 carried the new status.

**Why the agent had no way to catch it.** Nothing in the dataset says the exclusion is enumerated by literal string. The description said "excludes cancelled orders," which the agent had no reason to doubt. The agent was correct to trust the contract. The contract was wrong.

**Why humans had not caught it.** The finance close does not use this view. It runs from a separate process with its own rules that were updated when the new status shipped. The two paths had diverged and nothing compared them.

**The fixes, in order of value.**

The immediate fix is the filter. Change it to a status category rather than a literal, so a new cancellation state is excluded by default rather than by remembering.

The structural fix is a reconciliation test. Any gold dataset that has an authoritative counterpart, meaning a finance close, a regulatory report, an operational system of record, gets an automated comparison on a schedule, with a tolerance and an alert. This is the check that catches the whole class.

The process fix is to include gold dataset filters in the review when a source system adds an enumerated value. Source teams add statuses without knowing who filters on them, and that is a coordination problem you solve with a checklist rather than with hope.

The semantic fix is smaller and worth doing: the description now reads "excludes orders in any cancelled state, defined by the status category mapping in silver.ref.order_status." That gives a future reader, human or otherwise, a place to check the definition rather than a claim to trust.

The lesson I take from this pattern generally: the semantic layer is a contract, and a contract that silently stops matching reality is more dangerous than no contract, because it has removed the reader's motivation to verify. Which means the reconciliation tests matter as much as the descriptions do.

## Failure modes

**Semantics written for humans, not for the failure.** A description reading "net revenue in USD" is accurate and does not prevent anything. One reading "net revenue in USD, use this rather than gross_revenue_usd unless the question specifically says gross" prevents the actual mistake. Warning sign: descriptions that read like a data dictionary. Fix: write each description after watching an agent get that column wrong.

**Gold coverage gaps with silver access left open.** The agent falls back and answers from unshaped data. Warning sign: correct-looking answers that do not reconcile with reports. Fix: revoke silver access from agent principals, and let the gap show up as a refusal you can then fill.

**Stale semantics.** A description written eighteen months ago describes a column that has since changed meaning. The agent trusts it, because trusting it is the whole design. Warning sign: agent answers that were right last quarter and are wrong now. Fix: review descriptions when the underlying transformation changes, and make that a step in the change process rather than a good intention.

**Duplicate datasets with overlapping semantics.** Two gold datasets both plausibly answer a revenue question and disagree by 3 percent. The agent picks one. Warning sign: the same question producing different numbers across sessions. Fix: this is a governance problem. Pick one authoritative dataset per concept and deprecate the other, or make the distinction explicit in both descriptions.

**Over-aggregation.** A gold dataset pre-aggregated to monthly regional totals answers monthly regional questions and nothing else. Every adjacent question fails. Warning sign: high refusal rate on questions that feel like they should work. Fix: build gold at the finest grain that carries the business rules, and let aggregation happen at query time.

**Semantics that do not reach the agent.** Everything is written correctly in the catalog and the agent's tool returns only column names and types. Warning sign: the team is confident the descriptions are good and the agent behaves as though there are none. Fix: check what your tool layer actually returns, which is a five-minute inspection nobody does.

**Treating this as a one-time project.** A semantic layer built during an agent rollout and never touched again degrades at the rate the business changes. Warning sign: nobody has edited a description in six months. Fix: assign ownership per subject area with the same seriousness as pipeline ownership.

**Confusing volume with quality.** A team generates descriptions for four thousand columns with an LLM, and every one reads plausibly and says nothing. Warning sign: descriptions that restate the column name in a full sentence. Fix: descriptions for the columns agents actually use, written by people who know the traps. Fifty good ones beat four thousand generated ones.

## What this looks like when it is working

It helps to describe the target state concretely, because "good semantic layer" is vague enough that teams declare victory early.

A user asks a question in their own words. The agent calls a dataset-selection tool, gets back two candidate gold datasets with their descriptions, and picks one on the basis of the grain statement and the suitability fields rather than on name similarity. It calls a describe tool and gets column descriptions in business language. It writes SQL with no joins, aggregating a metric it did not have to define. The answer reconciles with the finance report because both derive from the same rules.

When the question falls outside coverage, the agent says so and names the reason: this dataset excludes wholesale, and no dataset here covers it. The user goes to a human, who either answers or files a request for a new gold dataset. That request is a useful signal, because it comes with a real question attached rather than a speculative requirement.

Three properties characterize this state and each one is checkable.

**Answers reconcile.** Pick five numbers the agent produced this week and compare them against the authoritative source. Agreement within tolerance is the whole game. If you cannot do this comparison because no authoritative source exists for those numbers, that is itself the finding.

**Refusals are specific.** "I do not have data on that" is a weak refusal. "The orders dataset excludes wholesale channel, so I cannot give you a wholesale figure" is a strong one, because it tells the user what to ask for next. Strong refusals come from `not_suitable_for` fields being written honestly.

**Coverage gaps are known.** Somebody can name the top five questions the estate cannot answer. When nobody can name them, it means gaps are being papered over by agents finding a way rather than surfacing as refusals.

What this state does not require is impressive. No fine-tuning. No vector database of documentation. No agent framework with elaborate planning. It requires datasets shaped correctly with their contracts attached and access restricted to that layer. The unglamorous nature of the answer is why it gets skipped in favor of things that demo better.

I want to name one honest limitation. This approach handles questions inside a designed subject area very well and handles genuinely novel questions no better than the underlying data allows. An analyst exploring a hypothesis nobody anticipated still needs silver access and still needs to be a person with judgment. Agentic analytics on a good semantic layer replaces the repetitive middle of the analytics workload, not its exploratory edge, and setting that expectation early saves a lot of disappointment later.

## Operational guidance

**Start from the question log, not the table list.** Collect the questions people actually ask, in their words, over a few weeks. Build gold datasets covering the top of that distribution. Building outward from tables produces coverage nobody needed, and it produces it in the order the tables happen to be listed rather than in the order anyone cares about. Support tickets, Slack channels where people ask the data team things, and the WHERE clauses of existing dashboards are all good sources for that log.

**One owner per gold dataset, named in the metadata.** Ownership that lives in a spreadsheet is ownership that lapses. Put the owning team in the dataset's properties where it travels with the data.

**Write the grain statement first.** Before any SQL. If the team cannot state in one sentence what one row represents, the dataset is not designed yet. This single discipline prevents a large fraction of downstream errors.

**Give the agent a dataset-selection tool, not just a list.** On an estate with more than a few dozen gold datasets, listing them all lets the model pick badly. A search tool that takes the question and returns the two or three most relevant datasets with their descriptions produces better selection than a flat catalog dump.

**Version your semantic changes.** A change to a filter in a gold view changes historical numbers. Record when it changed and why, so that a report that shifted has an explanation. Iceberg's snapshot history gives you the data side of this. The definition side is on you.

**Keep bronze and silver access strictly separated.** Agent principals get gold. Data engineering principals get everything. Enforce it in catalog grants, not in prompt instructions, for the same reason you enforce anything else in grants.

**Put a reconciliation test on every gold dataset with an authoritative counterpart.** Compare the gold number against the finance close, the operational system, or the regulatory report on a schedule, with a tolerance and an alert. This catches definitional drift, which is the failure class that silently survives every other check you run.

**Track which datasets and columns the agent actually used per answer.** Log it from your tool layer. When an answer turns out wrong, that log points at the description that misled the model, which turns a vague quality complaint into a specific edit.

**Write descriptions in the language users use, not the language the schema uses.** If people say "bookings" and the column is `net_revenue_usd`, put the word bookings in the description. Retrieval and model selection both work on the words present, and the vocabulary gap between the business and the schema is where selection failures live.

**Budget the work honestly.** Building good gold coverage for one subject area is weeks, not days. A pilot scoped to one subject area, done properly, teaches more and risks less than broad shallow coverage. It also produces a realistic estimate for the rest.

**Measure before and after.** Run your evaluation set against the agent with raw access before you build anything. That baseline is what justifies the investment, and it is unavailable retroactively. Record the wrong answers verbatim, because a list of specific confident errors persuades a budget holder in a way that an accuracy percentage never does.

## Where this is heading

The interesting developments are in making semantics cheaper to produce and harder to let rot.

Semantic definitions are converging toward being a first-class, portable artifact rather than a property of one tool. A definition of net revenue that lives inside one BI tool serves that tool. The same definition in an open, engine-neutral form serves every consumer including agents, and there is active work in the ecosystem on standardizing that representation. Apache Polaris already stores semantic assets like Iceberg SQL views alongside tables, which puts definitions in the same governed place as the data.

Generating description drafts from data and lineage is improving, and I want to be precise about what it is good for. A model reading a column's values, its name, and its lineage produces a reasonable first draft. What it cannot produce is the trap, meaning the thing that makes this column easy to misuse. Drafts save time on the mechanical half. A human who has watched people get it wrong writes the half that matters.

The direction I am most interested in is closing the loop from failure to semantics. Today a wrong agent answer gets noticed by a person, and if they are conscientious, someone edits a description. A system that logs which datasets and columns an agent used for each answer, and lets a reviewer mark answers wrong, has the raw material to point directly at the description that misled it. That is a straightforward feedback system nobody has built well yet, and it is the thing that turns semantic maintenance from a discipline into a process.

## Conclusion

Agents fail on raw data because correctness in a lake depends on knowledge that lives outside the lake. The business rules, the authoritative dataset, the grain, the required filters. A human accumulates that knowledge and carries it between sessions. An agent starts from nothing every time.

The fix is not a better model. It is putting the knowledge where the agent reads: gold datasets with the business rules applied, and semantic contracts attached to those datasets rather than filed in a wiki. Grain stated. Columns described in business language with the common misuse named. Exclusions explicit. What the dataset is not for, spelled out.

Restrict agents to that layer. An agent that can fall back to unshaped data will, and the result is a confident wrong number rather than an honest refusal.

Then measure it. An evaluation set of thirty real questions with known answers, including questions the agent should decline, tells you whether any of this is working. Run it on every change. When a question fails, fix the description rather than the prompt.

None of this is exotic and none of it is fast. It is the same data modeling discipline that made BI work, applied with the recognition that your newest consumer has no memory and no colleague to ask.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and the semantic layer. *Architecting an Apache Iceberg Lakehouse* from Manning covers data product design, the medallion layers, and semantic modeling as platform decisions rather than pipeline details. *Apache Polaris: The Definitive Guide*, which I co-authored for O'Reilly, covers governing those assets across engines. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
