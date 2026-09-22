---
title: "How Apache Ossie Is Deciding What Agents and BI Tools Can Ask a Semantic Layer"
date: "2026-09-21"
description: "How Apache Ossie's layered query design gives AI agents both a constrained dimensional interface and a grain-safe SQL interface for semantic layers."
author: "Alex Merced"
category: "Semantic Layer"
tags:
  - Semantic Layer
  - Apache Ossie
  - AI Agents
  - SQL
canonical: https://iceberglakehouse.com/posts/ossie-semantic-query-interface-agents/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/ossie-semantic-query-interface-agents/).

An analyst asks an AI agent for revenue per support ticket by region. The agent knows the schema. It sees an `orders` table and a `support` table, both keyed by customer. It writes a clean SQL query that joins them, sums order amounts, counts tickets, and divides. The query runs. The numbers look reasonable. They are wrong.

Every customer with several orders and several tickets appears in the join once for each order-ticket pair. Revenue gets multiplied by the ticket count, tickets get multiplied by the order count, and the ratio drifts. Nothing fails. The schema was valid, the SQL was valid, and the answer was wrong.

Semantic layers exist to stop this. They define metrics once, with the rules for computing them correctly. Apache Ossie (incubating), the open standard for semantic models that grew out of the Open Semantic Interchange effort, is building a vendor-neutral way to write those definitions down. But a definition is only half the problem. The other half is how a consumer, whether a BI tool or an AI agent, asks the semantic layer a question and gets the same correct answer from every implementation.

In August and September 2026, that second half became the most important debate in the Ossie community. One proposal defined a constrained query model with strict, normative semantics and typed errors. A competing proposal argued for ordinary SQL with a `MEASURE()` aggregate, built on Julian Hyde and John Fremlin's "Measures in SQL" work. Working group discussion has since converged on a layered design that keeps both. This article walks through both proposals, the arguments on each side, the layered compromise, and what each interface means for AI agents that generate queries.

A disclosure: I work at Dremio, which builds a semantic layer product. Ossie is an Apache community effort, and everything here comes from its public dev list and pull requests.

## The Query Side Is Where Standards Break

Most of Ossie's work so far has gone into the model format: datasets bound to physical tables, fields, relationships, and metrics, expressed in YAML or JSON. Converters translate between Ossie and existing formats from BI tools and semantic layer vendors. That interchange side has broad agreement.

The query side does not. The DuckDB community extension for Ossie describes the gap well. Its documentation says the Ossie format deliberately leaves open the query those definitions go into, meaning the joins, the grouping, and the grain, because those depend on the question being asked, and the model file does not know the question.

That openness is a problem for a standard. Chris Eubank of Databricks put it plainly in a September 21, 2026 message to the dev list. Given the same model shape, two vendors can return different answers to the same question, and that weakens Ossie as a standard. The ambiguity exists even in the minimal current spec, and it compounds as the spec grows without compliance suites to pin behavior down.

Consider what that means in practice. A metric called `total_revenue` is defined once in Ossie. Tool A queries it grouped by customer segment after joining through a bridge table and gets one number. Tool B runs what looks like the same query and gets another, because it chose a different join path or a different way to handle the many-to-many relationship. Both claim Ossie support. The definition was shared, but the answer was not.

For human analysts, that inconsistency is bad. For AI agents, it is worse. Agents generate queries at volume, rarely second-guess plausible numbers, and increasingly act on what they compute. A standard that fixes definitions but not query behavior gives agents consistent names for inconsistent results.

## Two Meanings of "Closed"

Discussions of semantic layer query languages often use the word "closed," and in this debate it carries two different meanings. Keeping them apart makes the proposals much easier to understand.

**Closed as in restricted.** A closed query language offers a fixed, small vocabulary. You pick measures, pick dimensions, add filters, sort, and limit. You cannot write arbitrary joins, subqueries, or window logic outside what the language defines. The engine owns everything else, including how tables are joined. The benefit is that every expressible query has a defined, correct answer. The cost is expressiveness.

**Closed as in algebraic closure.** In relational algebra, an operation is closed when its result is the same kind of thing as its inputs. SQL queries on tables return tables, so you can feed the result of one query into another, join it, filter it, and nest it. A semantic interface has closure when querying it produces well-behaved relations that compose under ordinary SQL operations, with no surprises when you add or remove a measure.

The two ideas pull in different directions. A restricted language guarantees correctness by limiting what you can say. A closed algebra guarantees correctness by making the pieces behave predictably no matter how you combine them. The first Ossie proposal leans toward the first meaning. The second proposal leans explicitly on the second, and its draft spec states closure as a formal corollary. Both are legitimate answers to the question of how to stop wrong numbers. They produce very different interfaces.

## Proposal One: A Dimensional Query Model With Strict Semantics

The first proposal is Will Pugh's "Foundational Semantics" document, pull request #246 in the Ossie repository, with a compliance suite built on top of it in pull request #237. The document runs to more than 1,300 lines and does two things. It defines how a semantic model behaves when queried across multiple datasets. And it defines a query model for asking questions.

The query model has two shapes, and every query has to be exactly one of them.

An **aggregation query** lists dimensions to group by and measures to compute, with optional where, having, order by, and limit clauses. Its result has one row per distinct combination of dimension values.

A **scalar query** lists fields and returns one row per row of a home dataset, with no aggregation.

Mixing fields with dimensions or measures in one query is rejected with a specific error. The spec's own example looks like this.

```yaml
query:
  dimensions: [customers.market_segment, orders.order_year]
  measures: [total_revenue, order_count]
  where: "orders.status = 'completed' AND customers.region = 'WEST'"
  having: "total_revenue > 1000"
  order_by: [{field: total_revenue, direction: DESC}]
  limit: 50
```

Notice what is absent. There is no `FROM` clause and no join. The consumer names dimensions and measures from the model, and the engine figures out which datasets are involved, which join path to use, which join types apply, and how to avoid traps. The model behaves like one wide, flat table. The spec does not mandate a surface syntax. A vendor can render the same semantic query as a special SQL clause, a view syntax, or an API call.

The heart of the proposal is five user-visible guarantees.

**No fact row is silently dropped.** If a fact row's dimension key matches nothing, the row lands in a NULL group instead of disappearing from totals. A broken foreign key shows up as a NULL bucket.

**No row is double-counted by fan-out.** A row of a dataset contributes at most once to a measure defined on that dataset, whatever the query joins in for grouping or filtering. Across a many-to-many relationship, the engine either resolves it safely through a bridge or stitching rewrite, or fails.

**In multi-fact queries, no fact loses its groups.** Put revenue from orders and returns from a returns table in one query, grouped by region, and every region that appears in either fact appears in the result.

**No unsafe re-aggregations.** The spec distinguishes three kinds of aggregates: distributive ones such as SUM, algebraic ones such as AVG, and ones that need the whole population, such as percentiles and `COUNT(DISTINCT)`. An engine must never silently compute an average of averages or re-aggregate a whole-population measure through an unsafe path.

**No silently wrong answer.** If the engine cannot find a safe way to compute a query, it raises a typed error with a code instead of returning a plausible number. The spec lists them: `E3012_MN_NO_SAFE_REWRITE` for many-to-many joins with no safe rewrite, `E3013_NO_STITCHING_DIMENSION` for unrelated facts with no shared dimension, `E_AMBIGUOUS_PATH` when several join paths are equally valid, `E_NO_PATH` when datasets are unconnected, `E_UNSAFE_REAGGREGATION`, and others.

The rest of the document specifies the machinery that makes those guarantees hold: cardinality inference, default join types, trap avoidance, many-to-many resolution, path resolution, window function rules, and precise handling of empty and NULL inputs. It goes as far as requiring that the same model, query, and SQL dialect compile to byte-identical SQL every time, and it fixes NULL ordering so results sort the same on every dialect.

This is the restricted meaning of closed, done thoroughly. Within its vocabulary, every question has one specified answer, and questions without a safe answer fail loudly.

## The Objections

On August 5, Justin Talbot of Databricks posted concerns about the proposal to the dev list, and he and Chris Eubank followed up on August 11 with an alternative. Their objections fall into four groups, and each one is a serious point.

**Vendor buy-in.** Ossie succeeds only if BI vendors implement it. The objection noted that no BI vendor had yet tried implementing the proposed semantics or querying through the proposed model. Some of the specified behaviors, particularly join direction, fan-out prevention, and many-to-many resolution, conflict with choices existing tools have already made and that their users depend on.

**Trivial queries.** The query model in the proposal demonstrates simple queries: no joins beyond the model's relationships, no subqueries, no window functions over arbitrary structure. Real BI tools generate multi-way joins, subqueries, and window functions for features such as level-of-detail calculations, Top-N filters, and period-over-period comparisons. Those are exactly the cases where fan-out, re-aggregation, grain, and filter propagation cause trouble, and the objection argued they cannot be deferred.

**The black box.** The proposal implicitly commits Ossie to a query architecture where the model is queried like a single opaque table, with its constituent tables and relationships hidden. The objection argued that this leaves BI tools three bad options: accept the limited query capability, adopt SQL extensions that are hard to integrate, or accept an interface that looks like a table but does not behave like one.

**Normative versus opinionated.** Some guarantees are close to universal, such as never duplicating a measure. Others are opinionated, such as join direction, path selection, and filter flow, where tools have made different, deliberate choices, often exposed as settings. Bundling the two makes adoption all-or-nothing. A vendor that disagrees with the opinionated parts rejects the standard wholesale, including the parts it agrees with.

Will Pugh's reply made the case for the original approach. A standard needs a specified correct answer, and things like join direction have to be specified so every implementation gets the same result. The current Ossie spec already allows joins and cross-table calculations, so the model's behavior has to be defined somewhere. The working group had deliberately shrunk the scope to avoid boiling the ocean. And he asked for specific failing cases or code to work against, noting that pausing the work makes progress harder, not easier.

Both positions hold up. One side is saying that a standard without precise semantics is not a standard. The other is saying that a standard vendors will not implement is not a standard either.

## Proposal Two: SQL With Measures

The alternative starts from a different premise. Instead of hiding tables behind a query model, expose them as ordinary SQL relations, and add one new concept: a measure column that knows how to aggregate itself correctly.

The idea comes from "Measures in SQL," a 2024 paper by Julian Hyde and John Fremlin. Hyde has a long history with this problem. He created the Mondrian OLAP engine in 2001, created the project now known as Apache Calcite in 2012, and later worked on the semantics of LookML models at Looker. When he introduced himself to the Ossie list in August 2026, he framed the core question as the right relationship between the language used to build a model, the data objects the model exposes, and the query language users write.

The concrete Ossie version is pull request #354, a Relational Query Interface specification posted by Justin Talbot on September 3. It opens with a query that captures the whole idea.

```sql
SELECT o.region,
       MEASURE(o.total_revenue),
       MEASURE(s.ticket_count),
       MEASURE(o.total_revenue) / MEASURE(s.ticket_count) AS revenue_per_ticket
FROM   model.orders o
JOIN   model.support s ON o.customer_id = s.customer_id
WHERE  o.order_date >= DATE '2025-01-01'
GROUP BY o.region
ORDER BY MEASURE(o.total_revenue) DESC;
```

The consumer sees the model's datasets as tables and joins them the way it joins any tables. The only difference from plain SQL is that measures are evaluated through the `MEASURE()` aggregate. The spec defines `MEASURE()` as an ordinary aggregate function syntactically and semantically. It goes wherever an aggregate goes, and a consuming tool changes exactly one thing in its generated SQL: it writes `MEASURE(name)` in place of a raw aggregate.

The draft states its design principles directly. The interface is transparent, with nothing about the multi-table structure hidden. The engine owns how each measure is computed, so a governed metric comes out identical across consumers. And consumer change is minimal.

Two guarantees carry the correctness.

**G1, slice-and-dice responsiveness.** `MEASURE(m)` responds to `WHERE` and `GROUP BY` exactly as a standard aggregate over the measure's definition does. Filters restrict the rows the measure sees, and grouping sets the grain at which it is reported.

**G2, grain safety.** `MEASURE(m)` aggregates at the measure's own grain with no duplication, whatever the join types and cardinalities in the query. Each source row contributes at most once per output group. That structurally eliminates the two classic multi-table errors. Fan-out, where joining to a finer-grained table inflates a measure, cannot happen. Neither can the chasm trap, where joining two fact tables through a shared key produces cross-product inflation.

From those follows the property that gives this approach its name in this article: closure. The draft spec states it as a corollary. For a relation with measures, the set of groups a query returns is fixed by its grouping fields and filters, exactly as with standard `GROUP BY`, and does not change depending on which measures are selected. `SELECT d, MEASURE(m1) FROM R GROUP BY d` and `SELECT d, MEASURE(m2) FROM R GROUP BY d` must return the same values of `d`.

That sounds academic, and it is the most practical line in the document. BI tools rewrite and optimize their own SQL constantly. A Top-N filter, for example, often becomes a subquery that a tool folds into the main query when both share a grouping field. Those rewrites are sound only if adding or removing a measure does not change which groups exist. The draft points out that opaque multi-table interfaces break this assumption, because their field domains can shift with the measures in play.

Compare that with the first proposal's third guarantee, that in multi-fact queries no fact loses its groups. Under that rule, adding a second measure from another fact can add groups to the result. It is a reasonable behavior for a flat interface. It is exactly the kind of domain shift that breaks SQL-level rewrites.

The alternative also arrived with evidence. The Databricks authors reported a proof of concept with Tableau and a development build of Databricks metric views. Without changes to Tableau, measures worked correctly on top of tables with level-of-detail calculations, Top-N filters, joins, relationships, and sets, features they noted have historically broken with third-party semantic layer integrations. They invited other BI vendors to run the same kind of end-to-end test against their own tools.

## The Layered Compromise

By September, the working groups had converged on a layered model that keeps both proposals, each at a different level. Chris Eubank summarized it on the dev list on September 21.

**Layer 1: the expression language.** Ossie's core spec already includes an expression language, `Ossie_SQL_2026`, used to define fields and metrics. The next steps are to register it formally as a dialect, make it the default when a model names none, and draw a clear line between using it to declare a model and using it to query one.

**Layer 2: the relational interface.** Pull request #354. Each dataset is queried as a table, and metrics are evaluated with `MEASURE()`. This is the SQL-native surface for tools that generate their own SQL.

**Layer 3: the dimensional interface.** Pull request #246, reframed as the flat, wide-table interface. This is the surface for tools and users that want to pick measures and dimensions without writing joins.

**Layer 4: ontology.** Business concepts and meaning above the metrics, out of scope for the current round.

The layers stack. Both query interfaces build on Layer 1's expression language, and Layer 3's generated SQL can be expressed in terms of Layer 2's primitives. That last point dissolves much of the original conflict. The dimensional interface's guarantees can be defined by translation into relational queries with measures, so the two surfaces agree on answers by construction.

The plan also puts compliance suites under both layers: a shared test runner, initially drawn from pull request #237, with Layer 2 and Layer 3 test sets built on models written in `Ossie_SQL_2026`. Vendors choose which layers they adopt, and a shared suite lets each vendor state precisely where its implementation diverges.

All of this is still in flight. The pull requests are under review, the layering framing still has to land in the core spec, and votes have not happened. The direction is clear enough to plan around.

## What Each Layer Means for AI Agents

The Ossie debate was framed around BI tools, because BI vendors are the implementers the standard has to win. AI agents are now a second class of consumer, and they change the trade-offs in interesting ways. I cover the broader case for putting a governed semantic layer between agents and data in [Why Agentic AI Needs a Governed Semantic Layer Behind the Model Context Protocol](https://datalakehousehub.com/blog/mcp-governed-semantic-layer). Here the question is narrower: which query surface should an agent use?

**The dimensional interface fits agents that should not write joins.** A Layer 3 query is a small structured object: measures, dimensions, filters, order, limit. That is an ideal shape for a tool call. An agent calling a Model Context Protocol (MCP) tool with that schema has a small, well-typed space to fill, and every value it can choose is a name from the model. It cannot invent a join path. It cannot pick the wrong join type. The class of error from the opening of this article, a valid join that inflates numbers, is outside the space of things it can express.

The typed errors matter just as much. When a Layer 3 engine returns `E_AMBIGUOUS_PATH` or `E3013_NO_STITCHING_DIMENSION`, an agent gets a machine-readable reason, not a silent wrong number. An agent loop can react: ask the user which path they meant, drop one of the measures, or explain why the question does not have a safe answer. "No silently wrong answer" is the most agent-friendly sentence in the whole debate.

**The relational interface fits agents that already write SQL.** Many agents already generate SQL, and large language models are strong SQL writers. Layer 2 lets them keep doing that, with one rule: use `MEASURE(name)` for governed metrics instead of writing the aggregate. Grain safety then protects the agent from fan-out and chasm traps even when it writes joins, subqueries, and window functions that a flat interface cannot express. An agent asked for revenue per ticket by region, top 10 customers by margin within each segment, or month-over-month change can write that SQL directly.

Closure also matters more for agents than it first appears. Agents often work in steps. They run a query, inspect the result, and then refine it by adding a measure, a filter, or a subquery. Under closure, adding a measure never changes which groups exist, so the agent's earlier observations stay valid as it refines. Under an interface whose group set shifts with the measures selected, an agent can see a region in step one and find it gone, or find a new one, in step two, with no error to explain why.

**The risk in each.** With Layer 3, the risk is under-expressiveness. Agents asked questions outside the vocabulary either fail or, worse, get routed around the semantic layer to raw SQL by a well-meaning developer, which reopens every trap the layer was meant to close. With Layer 2, the risk is the one remaining degree of freedom. An agent that writes `SUM(o.amount)` instead of `MEASURE(o.total_revenue)` bypasses the guarantees. The spec defines consumer obligations for exactly this reason, and the agent's tool layer has to enforce them, for example by rejecting generated SQL that aggregates a column the model defines as a measure.

A reasonable pattern is to expose both. Give agents a Layer 3 tool for the common case of measures by dimensions, with typed errors they can act on. Give them a Layer 2 tool for questions that need joins or multi-step logic, with a validator that checks every aggregate over a measure column uses `MEASURE()`. Because Layer 3 is defined in terms of Layer 2, the two tools agree on every answer they both can express.

## Seeing the Problem in Numbers

The fan-out problem is easy to describe and easy to underestimate. Here is a small, runnable demonstration in DuckDB with three orders and five support tickets across two customers.

```python
import duckdb

con = duckdb.connect()
con.execute("""
CREATE TABLE orders AS SELECT * FROM (VALUES
  (1, 'C1', 'West', 500.0),
  (2, 'C1', 'West', 700.0),
  (3, 'C2', 'East', 800.0)
) t(order_id, customer_id, region, amount);

CREATE TABLE support AS SELECT * FROM (VALUES
  (101, 'C1'), (102, 'C1'), (103, 'C1'),
  (104, 'C2'), (105, 'C2')
) t(ticket_id, customer_id);
""")

# What an agent writes against raw tables.
naive = con.sql("""
SELECT o.region,
       SUM(o.amount)      AS revenue,
       COUNT(s.ticket_id) AS tickets
FROM orders o
JOIN support s ON o.customer_id = s.customer_id
GROUP BY o.region
ORDER BY o.region
""").fetchall()

# What MEASURE() semantics guarantee: each measure at its own grain.
correct = con.sql("""
WITH revenue AS (
  SELECT region, SUM(amount) AS revenue
  FROM orders
  GROUP BY region
),
tickets AS (
  SELECT o.region, COUNT(DISTINCT s.ticket_id) AS tickets
  FROM support s
  JOIN (SELECT DISTINCT customer_id, region FROM orders) o USING (customer_id)
  GROUP BY o.region
)
SELECT r.region, r.revenue, t.tickets, r.revenue / t.tickets AS revenue_per_ticket
FROM revenue r
JOIN tickets t USING (region)
ORDER BY r.region
""").fetchall()

print(naive)    # East: revenue 1600, tickets 2 | West: revenue 3600, tickets 6
print(correct)  # East: 800, 2, 400 per ticket | West: 1200, 3, 400 per ticket
```

Walk through what happened.

Customer C1 in the West has two orders and three tickets. The join pairs each order with each ticket, so C1 produces six joined rows. The naive `SUM(o.amount)` counts each order three times, giving 3,600 instead of 1,200. The naive `COUNT(s.ticket_id)` counts each ticket twice, giving 6 instead of 3. Revenue per ticket comes out as 600 instead of the correct 400. East has one order and two tickets, so its revenue doubles to 1,600 while its ticket count stays right.

The correct version computes each measure at its own grain before combining them. Revenue is summed per region directly from orders. Tickets are counted per region by mapping each customer to its region once and counting distinct tickets. That is the essence of what grain safety guarantees, done by hand.

Under the Layer 2 relational interface, the consumer writes the naive query's shape, with a join and a `GROUP BY`, and gets the correct answer, because `MEASURE(o.total_revenue)` and `MEASURE(s.ticket_count)` are evaluated at their own grains. Under the Layer 3 dimensional interface, the consumer asks for measures `total_revenue` and `ticket_count` by dimension `region` and never sees a join at all. Either way, the hand-written CTE logic above moves out of every consumer and into the engine, where it is written once, tested by a compliance suite, and shared.

Now scale the toy up. Real customers have dozens of orders and dozens of tickets. Each customer's revenue inflates by its ticket count, and its tickets inflate by its order count. Both vary by customer, so the error is not even a constant multiplier you can spot and correct. It skews rankings, ratios, and trends in different directions for different groups.

## A Guardrail for SQL-Writing Agents

The relational interface leaves one door open: an agent that writes a raw aggregate over a measure column instead of `MEASURE()`. Closing that door does not require waiting for any engine. A short validator in the agent's tool layer does it before the query runs.

Here is one built on sqlglot, an open source SQL parser for Python. It takes the set of measure columns from the semantic model's metadata, parses the agent's SQL, and reports two kinds of problems: raw aggregates over measure columns, and `MEASURE()` applied to columns that are not measures.

```python
import sqlglot
from sqlglot import exp

# Columns the semantic model exposes as measures, per relation.
MEASURE_COLUMNS = {
    "orders": {"total_revenue", "amount"},
    "support": {"ticket_count"},
}

def check_measure_usage(sql: str) -> list[str]:
    """Return problems: raw aggregates over measure columns, or MEASURE() over non-measures."""
    tree = sqlglot.parse_one(sql)
    aliases = {t.alias_or_name: t.name for t in tree.find_all(exp.Table)}
    problems = []
    for agg in tree.find_all(exp.AggFunc, exp.Anonymous):
        name = agg.sql_name().upper() if isinstance(agg, exp.AggFunc) else agg.name.upper()
        cols = list(agg.find_all(exp.Column))
        for col in cols:
            table = aliases.get(col.table, col.table)
            is_measure = col.name in MEASURE_COLUMNS.get(table, set())
            if name == "MEASURE" and not is_measure:
                problems.append(f"MEASURE() over non-measure column {col.sql()}")
            elif name != "MEASURE" and is_measure:
                problems.append(f"raw {name}() over measure column {col.sql()}, use MEASURE()")
    return problems
```

Walk through it.

`MEASURE_COLUMNS` holds the relations and columns the model marks as measures. In a real deployment, it comes from the semantic layer's model discovery, which the Layer 2 draft spec covers in its section on measure discovery. Hard-coding it here keeps the example self-contained.

`parse_one` turns the SQL text into a syntax tree. sqlglot does not know `MEASURE` as a built-in function, so it parses it as an anonymous function call, which is why the loop looks for both `AggFunc` nodes, covering standard aggregates such as `SUM` and `COUNT`, and `Anonymous` nodes, covering `MEASURE`.

The alias map resolves `o.total_revenue` back to the `orders` relation, so the check works when the agent uses table aliases, which it almost always does.

For each aggregate, the function inspects the columns inside it. A standard aggregate over a measure column is flagged, because it bypasses grain safety. A `MEASURE()` over a non-measure column is flagged too, because the engine will reject it and the agent benefits from learning why before the round trip.

Run against the correct revenue-per-ticket query, the validator returns no problems. Run against the naive version from the previous section, with `SUM(o.amount)` and `COUNT(s.ticket_count)`, it returns one problem for each aggregate, with a message that tells the agent exactly what to change.

Two design notes make this useful in production. First, return the problems to the agent as a tool error, not as an exception in your logs. Agents correct themselves well when given a precise reason. Second, keep the validator conservative. It checks a narrow rule, the one the Layer 2 spec calls a consumer obligation, and it does not try to judge whether the rest of the query is sensible. Narrow checks produce few false alarms, which keeps agents from learning to ignore them.

For the dimensional interface, the equivalent guardrail is the tool schema itself. A tool whose input accepts only lists of measure names, dimension names, filter expressions, an order, and a limit, each validated against the model's vocabulary, cannot express a join at all. The engine handles everything else and answers with a typed error when no safe answer exists.

## Where Expressiveness Runs Out

It helps to be concrete about which questions each surface handles, because agents get asked all of them.

A flat measures-by-dimensions query handles the bread and butter of analytics: totals, counts, averages, and ratios grouped by any combination of dimensions, filtered before and after aggregation, sorted and limited. That covers dashboards, most ad hoc questions, and most of what business users type into a chat box.

The harder questions are the ones the objections named. "Top 10 products within each category" needs a ranking per group. "Customers whose order total exceeds their segment's average" needs a two-stage, level-of-detail calculation. "This month versus the same month last year" needs a comparison across time windows. The flat model handles some of these through window functions and derived metrics defined in the model, but each new pattern has to be anticipated by the model author.

The relational draft takes a different route. Its appendix walks through worked examples that are all ordinary SQL with measures: a Top-N filter through a self-join, a level-of-detail two-stage aggregation, a cross-grain ratio between two facts, a join to a finer-grained table that does not inflate the measure, a join type left to the tool's choice, and a multi-fact query through a conformed dimension bridge. None of them needs new syntax beyond `MEASURE()`. The consumer composes the question, and grain safety keeps each measure correct inside it.

For agents, that difference decides how often the semantic layer can say yes. Every question the governed surface cannot express is a question that tempts someone to route the agent around it.

## Failure Modes and Warning Signs

Until these interfaces are standardized and implemented, teams building agents and BI integrations on semantic layers will hit predictable problems. Here are the ones to watch.

**Agents bypassing the semantic layer.** The most common failure is not a bug in any interface. It is an agent with access to both the semantic layer and the raw tables, which chooses raw SQL because it can express the question. The sign is agent-generated queries against physical tables that aggregate columns the semantic model defines as metrics. Restrict agent access to the semantic surface, or validate generated SQL before it runs.

**Raw aggregates over measure columns.** In a Layer 2 style interface, an agent or tool that writes `SUM(amount)` on a measure-bearing relation instead of `MEASURE(total_revenue)` gets ordinary SQL behavior, including fan-out. The sign is aggregate functions applied to columns flagged as measures in the model's metadata. A linter in the agent's tool layer catches this cheaply.

**Vendor-specific join choices leaking into answers.** Until compliance suites exist, two semantic layer implementations can disagree on join paths, join types, or many-to-many handling for the same model. The sign is the same Ossie model returning different totals in two tools. Pin down which behavior you rely on and test it, especially for models with bridge tables or multiple facts.

**Groups that appear and vanish.** On interfaces without closure, adding a measure from a second fact changes which groups the result contains. Agents that refine queries step by step, and BI tools that rewrite queries, both get confused. The sign is a dimension value present in one query and missing in a near-identical one with an extra measure.

**Errors swallowed by the agent framework.** Typed errors are only useful if the agent sees them. Agent frameworks that catch every tool error and retry with a rephrased query end up routing around the exact protection the semantic layer provides. The sign is a high retry rate on semantic tools followed by a successful raw SQL query. Surface typed errors to the agent's reasoning, and to the user when the question has no safe answer.

**Premature standardization in your own stack.** Building deep integrations against a draft interface carries rework risk. The pull requests are under review, and details such as syntax, error codes, and metadata discovery can change before a vote. Wrap Ossie-facing code behind your own thin interface so a spec change touches one module.

## Operational Guidance

Here is how to act on this debate now, before the votes land.

**Put a semantic layer between agents and data.** Whatever interface wins, the principle holds. Agents query governed metrics, not raw tables. That is the single biggest reduction in wrong-answer risk available today.

**Offer agents a constrained tool first.** A measures-by-dimensions tool with filters, order, and limit covers a large share of real analytical questions. Make it the default tool, and have it return structured errors when a question cannot be answered safely.

**Add a SQL tool with guardrails for the rest.** When agents need joins or multi-step logic, allow SQL against the semantic layer's relations, and validate that governed metrics are referenced through the layer's measure mechanism rather than re-aggregated by hand. Log every rejection, since those logs show which questions your constrained tool is missing.

**Write metrics in Ossie now.** The model format is the stable part of the standard. Defining metrics in Ossie today, with converters from your existing tools where they exist, positions you to adopt whichever query layers your engines implement.

**Build your own compliance tests.** Take ten real questions your business asks, especially ones involving multiple facts or many-to-many relationships. Record the correct answers. Run them against every semantic layer and agent path you operate. This is a private version of what Ossie's compliance suites will do, and it catches regressions long before the standard arrives.

**Participate.** The Ossie dev list and pull requests #246 and #354 are open. The Databricks authors explicitly asked BI vendors to run end-to-end tests. Teams building agent platforms have a perspective the BI-centered discussion needs, and the review queue is short on hands.

## Where This Is Heading

The layered model is the likely shape of Ossie's query side. A shared expression language for defining metrics. A relational interface where measures behave as closed, composable SQL aggregates. A dimensional interface defined on top of it for flat, pick-and-group querying. An ontology layer above both. Compliance suites under each layer, so vendors can state exactly what they support.

For AI agents, that combination is close to ideal. A constrained surface with typed errors handles routine questions safely. A SQL surface with grain-safe measures handles the hard ones without giving up correctness. And because the two are defined in terms of each other, an agent that moves between them does not change the answers.

The open question is adoption. The first proposal's authors worried about under-specification, and the second's about vendor buy-in. The layered compromise addresses both on paper. Whether it works depends on BI vendors and engine builders implementing Layer 2 and passing shared tests. Watch for the first implementations outside Databricks and Tableau, and for the first vote on either pull request. Those will say more about Ossie's future than any design document.

## Conclusion

Defining a metric once is not enough to guarantee the same answer everywhere. The query that uses the metric decides whether joins inflate it, whether groups appear and vanish, and whether an impossible question fails loudly or returns a plausible wrong number. Apache Ossie spent August and September 2026 working out how consumers should ask that question.

One proposal defined a closed query vocabulary, measures by dimensions, with strict semantics and typed errors. The other defined a closed algebra, ordinary SQL with a `MEASURE()` aggregate that stays correct under any join and keeps result groups stable. The community is converging on keeping both, as layers that build on each other and on a shared expression language.

For teams putting AI agents on top of lakehouse data, the practical lesson arrives before the standard does. Give agents a governed semantic surface instead of raw tables, prefer a constrained tool with typed errors for routine questions, and allow SQL only with measure-aware guardrails. That setup works today, and it maps directly onto the interfaces Ossie is standardizing.

## Keep Going

If this piece was useful, I have written a lot more on semantic layers, open standards, and how AI agents should reach lakehouse data. *Architecting an Apache Iceberg Lakehouse* covers where the semantic layer sits in an open lakehouse and how it connects to catalogs, engines, and consumers. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
