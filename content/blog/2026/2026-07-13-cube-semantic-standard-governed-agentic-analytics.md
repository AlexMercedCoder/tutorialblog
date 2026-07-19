---
title: "Cube Semantic Layer for Agentic Analytics"
date: "2026-07-13"
description: "An in-depth exploration of cube semantic layer for agentic analytics"
author: "Alex Merced"
category: "AI & Agents"
tags:
  - Semantic Layer
  - Cube
  - AI Agents
  - Governance
canonical: "https://iceberglakehouse.com/posts/cube-semantic-standard-governed-agentic-analytics/"
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/cube-semantic-standard-governed-agentic-analytics/).

A text-to-SQL demo will get "show me revenue last quarter" right about nine times out of ten. The tenth time it silently double-counts a joined fact table, or it uses `order_date` when your finance team reports on `recognized_date`, and nobody notices until a number in a board deck does not tie out. That failure rate is fine for a demo. It is not fine when an autonomous agent is issuing hundreds of queries a day and making decisions on the results.

This is the core problem in agentic analytics right now. The models are good enough to write SQL. They are not good enough to know what your business means by "active customer," "net revenue," or "churn," because that meaning does not live in the schema. It lives in tribal knowledge, in a tangle of dbt models, and in the heads of three analysts. A semantic layer is where you write that meaning down in a form a machine can call. Cube is one of the more visible implementations of this pattern, and it is a useful lens for understanding why governed semantic contracts are becoming a prerequisite for agents that touch data. It is not the only route, and by the end of this post I want to be clear about where a governed open lakehouse changes the calculus. But the pattern Cube illustrates is worth understanding on its own terms.

## Why Chat-with-Data Breaks in Production

The pitch for chat-with-data is seductive because the failure modes are invisible in the happy path. A well-formed question against a clean, denormalized table returns a clean answer. The trouble starts when the question needs judgment that lives outside the schema. Here are the failure modes that show up over and over.

**Joins and fan-out.** When an agent joins an orders table to a line-items table and then sums an order-level column, the order total gets counted once per line item. The result is a plausible-looking number that is three or four times too large. A human analyst knows to guard against this. A language model generating SQL from column names has no reason to. It sees two tables with a shared key and joins them, because that is what the schema invites it to do.

**Metric ambiguity.** "Revenue" is not one thing. There is booked revenue, recognized revenue, gross versus net of refunds, and revenue with or without tax. Each of those is a legitimate definition for some team. When an agent picks one by guessing from a column named `amount`, it produces a number that is internally consistent and organizationally wrong. Two agents, or the same agent on two days, can pick differently. Now your metrics do not reconcile across conversations, and trust erodes fast.

**Date logic.** Fiscal calendars rarely match the Gregorian one. "Last quarter" might mean the last calendar quarter, the last fiscal quarter, or a trailing 90 days. Timezone handling on timestamps introduces off-by-one-day errors at month boundaries. Week-starts-on-Monday versus Sunday quietly shifts weekly aggregates. None of this is inferable from a `timestamp` column type.

**Permissions and row-level context.** A regional sales manager should see their region. An agent generating raw SQL against the warehouse has whatever access its service account has, which is usually far broader than any individual human. Without an enforcement layer between the agent and the tables, the agent becomes a way to route around row and column security.

**Business exceptions.** Every real business has carve-outs. Exclude internal test accounts. Treat that one acquired subsidiary's data differently until the migration finishes. Do not count the free tier as customers. These rules live in `WHERE` clauses that analysts have memorized and agents have never seen.

The uncomfortable truth is that a chat interface can look impressive in a demo while producing inconsistent metrics in production, and the inconsistency is exactly the kind that does not throw an error. You get a number, it looks reasonable, and it is wrong. The fix is not a better prompt. The fix is to stop asking the model to reconstruct business meaning from schema on every request.

## What Cube Provides as a Semantic Layer

Cube is a headless semantic layer. "Headless" means it has no built-in dashboard or reporting UI of its own. It sits between your data and whatever consumes it, and it exposes a consistent set of metric and dimension definitions over APIs. The [Cube documentation](https://cube.dev/docs/product/introduction) describes it as a way to define your data model once and serve it to many downstream consumers, and that "define once" framing is the whole point.

The building blocks in Cube's [data modeling layer](https://cube.dev/docs/product/data-modeling) are worth naming precisely because they map directly onto the failure modes above.

**Measures** are your metrics, defined with their aggregation and their exact logic. Revenue is defined once, with the specific column, the specific filter for refunds, and the specific handling of tax. Every consumer that asks for revenue gets the same definition. The ambiguity problem goes away because there is exactly one answer to "what is revenue."

**Dimensions** are the attributes you slice by: region, product category, customer segment, time grain. They are defined with their types and any transformation logic, so date handling and timezone logic live in one place rather than being reinvented in every query.

**Joins** are declared in the model with their relationships and cardinality. Because the semantic layer knows that orders-to-line-items is one-to-many, it can generate SQL that avoids fan-out. The join safety is baked into the model rather than left to the query author.

**The compiler** is the piece that turns a semantic request into SQL. A consumer asks for "revenue by region for last quarter" in Cube's query language, and the compiler emits the correct SQL for the underlying database, applying the right joins, filters, and aggregations. The consumer never writes the SQL, which is precisely why the consumer cannot get the SQL wrong.

**Pre-aggregations** are Cube's performance mechanism. Common metric queries can be materialized in advance so that repeated requests hit a summarized rollup rather than scanning raw data every time. For an agent that asks similar questions repeatedly, this matters, because agent workloads tend to be bursty and repetitive.

**APIs** are how consumers reach all of this. Cube exposes SQL, REST, and GraphQL interfaces, and the same governed definitions serve BI tools, embedded analytics in applications, and increasingly AI tools. That last consumer is the one that changes the design conversation.

The important architectural move is that Cube separates metric definitions from interfaces. The definition of revenue does not live in a Tableau workbook or a notebook or an agent's prompt. It lives in the semantic layer, and every interface calls it. That separation is what makes governance possible at all.

## Metric Contracts as Agent Guardrails

A semantic model becomes an agent guardrail when you treat each metric as a contract rather than a convenience. A metric contract is a fuller specification than most semantic layers require by default, and it is worth writing out what belongs in one.

- **Calculation logic.** The exact formula, including which columns, which aggregation, and which filters.
- **Grain.** The lowest level of detail the metric is valid at. A metric defined at the daily level should not be silently summed to a number that implies transaction-level precision.
- **Filters.** The standing exclusions: test accounts, internal orders, non-billable line items.
- **Dimensions.** Which attributes the metric can legitimately be sliced by, and which slices are meaningless or misleading.
- **Ownership.** Who owns the definition and who to ask when it needs to change.
- **Freshness.** How current the underlying data is, so a consumer knows whether "today's revenue" is real-time or a day behind.
- **Allowed use.** Whether the metric is safe to expose externally, internally only, or is restricted.
- **Test cases.** Known inputs and expected outputs, so a definition change that breaks a historical number gets caught.

When these contracts exist, the agent's job changes shape. Instead of generating SQL for every request, the agent calls a metric tool. "Get revenue, sliced by region, for last quarter" becomes a structured call against a defined metric, not a free-form SQL generation. The agent chooses which metric and which slice. The semantic layer supplies the correct calculation. The difference in reliability is large, because you have moved the hard, error-prone part of the work from the model, which guesses, to the semantic layer, which is deterministic.

Here is the shape of the interaction, described as a flow rather than a picture:

```
User question
   -> Agent interprets intent, selects a metric contract
      -> Semantic layer resolves the contract to correct SQL
         -> Query engine executes against governed data
            -> Result returns with the metric's definition attached
   -> Agent explains the answer, citing which metric and grain it used
```

The step that matters is the third arrow. The agent never handed raw SQL to the database. It handed a metric name and some parameters to a layer that owns the SQL. That is the guardrail. It is also what makes the whole thing auditable, because every answer traces back to a named, owned, tested definition rather than to a one-off generation that no longer exists after the conversation ends.

There is an honest limitation here worth stating. A semantic layer only governs the questions it has definitions for. Ask an agent something the model does not cover, and you are back to either "I cannot answer that" or falling through to raw SQL generation with all its risks. Building good semantic coverage is real work, and it is never finished, because the business keeps inventing new questions. The contract approach does not eliminate that work. It concentrates it in one place where it can be reviewed and reused, instead of scattering it across every dashboard and prompt.

## A Worked Example of the Difference

It helps to make this concrete with a single question and two paths to answering it. The question: "What was net revenue by region last quarter, excluding our internal test accounts?"

On the raw text-to-SQL path, the agent reads the schema and constructs something. It finds an `orders` table and a `line_items` table and a `regions` table. It has to decide: is net revenue the `amount` column, or `amount` minus the `refunds` column, or something involving the `tax` field? It has to decide how to join orders to line items without fanning out the total. It has to know that "last quarter" means the last fiscal quarter, which starts in February for this company, not the last calendar quarter. And it has to know that internal test accounts are the ones where `account_type = 'internal'`, a rule that exists nowhere in the schema. The agent will make a guess at each of these, and each guess is an independent chance to be subtly wrong. The output is a table of numbers that looks authoritative and might be off by a refund adjustment, a fiscal boundary, and a fan-out multiplier all at once.

On the semantic-contract path, `net_revenue` is a defined measure. The refund subtraction, the tax handling, and the test-account exclusion are baked into the definition. The join cardinality between orders and line items is declared, so fan-out cannot happen. `region` is a defined dimension. "Last quarter" resolves against a fiscal calendar the model already knows. The agent's job collapses to selecting the `net_revenue` measure, the `region` dimension, and a last-quarter time filter, and handing that structured request to the semantic layer. The semantic layer emits correct SQL. The agent never had a chance to make the five independent mistakes it could make on the raw path, because it was never asked to reconstruct the business logic in the first place.

That is the entire value proposition in one example. You are not making the model smarter. You are removing the opportunities for it to be wrong, by moving the business logic out of the model's guesswork and into a definition that is written once and tested.

## Capability Matrix for Agentic Analytics

It helps to lay out the common approaches to agent access and their tradeoffs side by side. None of these is strictly wrong. They sit at different points on a curve between flexibility and control.

| Approach | Flexibility | Semantic consistency | Auditability | Best fit |
| --- | --- | --- | --- | --- |
| Raw BI tool integration | Low | High within the tool | Moderate | Human-driven dashboards; weak for autonomous workflows because the agent cannot compose beyond prebuilt views |
| Text-to-SQL bot | High | Low | Low | Exploration and prototyping where errors are tolerable and a human checks results |
| Semantic-layer-governed agent (e.g. Cube) | Moderate | High | High | Production agents that need consistent, reusable, defined metrics |
| Lakehouse semantic layer over open tables | Moderate to high | High | High | Production agents that also need broad data access, federation, and open-format governance |

The text-to-SQL bot is the most flexible and the least trustworthy. It will answer anything, including questions it should have refused, and it will do so with confidence. Raw BI integration is the opposite: safe within its prebuilt content, useless the moment an agent needs to ask something the dashboard author did not anticipate.

The semantic-layer-governed agent is the middle path that most production teams end up wanting. It gives the agent a defined vocabulary of metrics and dimensions, generates correct SQL underneath, and produces answers that reconcile across conversations. Cube is a solid representative of this row. The tradeoff is coverage, as discussed: the agent is only as capable as the semantic model is complete.

The last row is where the conversation gets more interesting, and it is where I want to spend the rest of this post. A semantic layer is only as good as the data foundation underneath it, and that foundation is doing more work than the semantic layer usually gets credit for.

## Where the Lakehouse Foundation Still Matters

A semantic layer resolves a request into SQL. Something has to run that SQL, against data that has to be current, governed, and reachable. Those "somethings" are the foundation, and they determine whether the whole arrangement works in practice.

**Freshness.** A metric contract can declare that revenue is current as of an hour ago, but only if the underlying pipeline actually delivers data on that cadence. If the semantic layer points at stale copies or overnight extracts, the contract's freshness field is a promise it cannot keep. Freshness is a property of the data plane, not the semantic model.

**Performance.** Pre-aggregations help repeated queries, but agents ask novel questions constantly, and novel questions hit raw data. If the engine underneath is slow, agent workflows stall, because an agent's reasoning loop often chains several queries where each depends on the last. A ten-second query is annoying for a human clicking a dashboard. Chained five deep in an agent loop, it is a fifty-second wait that makes the agent feel broken. Interactive speed on the underlying engine is not a nicety here. It is what makes the agentic loop viable.

**Lineage.** When an agent gives an answer, the natural next question is "where did this come from?" Lineage that traces a metric back through its dimensions, its source tables, and its transformations is what makes the answer trustworthy. Lineage lives at the data and metadata layer, below the semantic definitions.

**Open table access.** If the semantic layer can only reach data that has been copied into one proprietary store, you have traded one silo for another. The value of a governed metric multiplies when it can be defined over data that stays in open formats and in place, so multiple engines and tools can reach the same governed source without another round of copying.

This is the point where the general pattern and the specific tooling choice diverge, and it is worth being precise about it. Cube demonstrates the semantic-contract pattern well. But a semantic layer that sits above your data as a separate tier still depends on whatever engine and storage live below it, and it still requires you to move or federate data to feed it. A different design brings the semantic layer, the query engine, the performance system, and open-format governance together over the data where it already lives.

## Bringing the Semantic Layer to the Data

That combined design is where [Dremio](https://www.dremio.com/blog/agentic-analytics-semantic-layer/) fits. Rather than treating the semantic layer as a tier stacked on top of a separate engine, Dremio builds it into a unified lakehouse platform on open standards. The semantic layer is expressed as virtual datasets and views, enriched with wikis, labels, and AI-generated metadata, so the business meaning lives right next to the governed query engine that resolves it.

A few things follow from putting these pieces in one place.

Query federation means the semantic definitions can span data across object storage, operational systems, and existing warehouses without first copying everything into one store. The agent asks for a metric; Dremio resolves it and queries the sources in place. You govern meaning over open Apache Iceberg tables and over federated sources at the same time, which keeps the "one silo traded for another" problem from creeping back in.

Autonomous performance is built into the same layer that serves the semantic definitions. Reflections and Autonomous Reflections accelerate the repetitive and the ad hoc query patterns that agents generate, and a distributed cache keeps hot data close to the engine. Because the performance system and the semantic layer are part of the same platform, an agent's chained queries stay fast without a separate materialization tier to manage.

Fine-grained access control enforces row and column security inside the same engine that runs the query. That closes the permissions gap directly: the agent cannot route around security by generating raw SQL, because the enforcement happens where the query executes, not in an application tier that the agent might sidestep.

And the agentic interfaces are native. Dremio ships an open-source [Model Context Protocol](https://modelcontextprotocol.io/) server, so agents call governed metrics and datasets through a standard protocol rather than a bespoke integration. The MCP surface is how an agent reaches the semantic layer, the federation, and the governance as one set of tools.

I want to be fair about the tradeoff in this framing too. A standalone semantic layer like Cube is deliberately engine-agnostic, and that neutrality is genuinely useful if your organization is committed to a particular warehouse and wants a semantic tier that floats above it. The unified approach asks you to run your governed analytics through the lakehouse platform. What you get in exchange is one place where meaning, access control, performance, and open-format data live together, which removes several of the seams where agentic reliability tends to leak.

## The Point Underneath All of This

The thing that makes agentic analytics work is not the model. Models are improving on their own schedule and you do not control that. What you control is the data foundation: the context the agent reasons over, the access rules it operates within, and the speed at which it gets answers. Get those three right and a competent model produces trustworthy analytics. Get them wrong and the best model in the world produces confident, inconsistent numbers.

Semantic contracts are how you supply the context. Cube shows the pattern clearly, and if you take one idea from this post, take that one: agents need governed metric definitions, not raw schema access. The stronger position is to put those definitions over open, federated, high-performance data so that context, access, and speed come from the same foundation rather than from a stack of tiers you have to keep in sync. A governed open lakehouse gives you that foundation without locking your data into a proprietary store, which matters more, not less, as the number of agents and tools reaching your data keeps growing.

If you are designing the semantic and governance layer that your agents will run on, the most useful next step is to see how the semantic layer, federation, and MCP access fit together in one platform. You can start with a free Dremio account at [dremio.com/get-started](https://www.dremio.com/get-started) and build a governed semantic view over your own data, then point an agent at it through the MCP server and watch how much of the reliability problem the foundation solves for you.
