---
title: "Twelve Queries That Pass Every Schema Check and Still Return the Wrong Number"
date: "2026-09-28"
description: "Twelve query patterns that pass schema validation and still return wrong numbers, with detectors, required metadata, and tested code for each."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - AI Agents
  - Semantic Layer
  - Data Quality
  - Text-to-SQL
  - Data Governance
canonical: https://iceberglakehouse.com/posts/semantic-failure-catalog-ai-agent-queries/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/semantic-failure-catalog-ai-agent-queries/).

A query can be syntactically valid, reference only real tables and columns, run without error, and still return a wrong business number. The Semantic Failure Catalog lists twelve of these patterns, each with a reproducible example, the metadata needed to detect it, and a working detection test.

Every AI analytics system eventually meets this problem. An agent writes SQL, the SQL parses, every column exists, the query runs in two seconds, and the result is a tidy table. Nothing in that sequence says whether the number is right. Schema validation answers one question: does this query refer to things that exist? It says nothing about whether the query computes what the business means.

For human analysts, that gap gets covered by experience. A person who has been burned by summing account balances across months does not do it twice. An agent has no memory of being burned. It writes the same wrong query with the same confidence on the thousandth run as on the first.

This article turns that experience into something a machine can use. It presents a versioned catalog of twelve failure patterns, identified as SV-01 through SV-12. Every example was run against DuckDB to produce the numbers shown. Each pattern maps to a detection class: a static check on query text, a dynamic probe on sampled data, or a reconciliation against a governed total. The detection code is included and tested, and the catalog itself is published as a YAML file you can extend.

A note on where this sits relative to related writing. [Why Semantic Layers Make Enterprise Text-to-SQL Safer](https://datalakehousehub.com/blog/2026-05-semantic-layers-text-to-sql) makes the architectural case for putting a semantic layer between agents and tables, and [Metric Contracts as the Interface AI Agents Actually Need](https://datalakehousehub.com/blog/metric-contracts-for-ai-agents) covers defining metrics so agents can consume them. This piece is narrower and more mechanical. It assumes some queries will still reach raw SQL, and it gives you a list of what goes wrong when they do, with tests for each item. I work at Dremio, which ships an AI Semantic Layer, and nothing in the catalog depends on any vendor's product.

## Why Schema Validation Is the Wrong Finish Line

Most agent frameworks treat a query as done when it executes. Some add a schema check first: parse the SQL, confirm every table and column exists in the catalog, reject anything that references a hallucinated name. That check is worth having. It stops the most embarrassing failures. It also creates a false sense that the query has been verified.

The gap exists because database schemas describe structure, not meaning. A schema says `orders.order_total` is a decimal. It does not say that `order_total` is measured at order grain, that joining it to line items repeats it, or that the finance team excludes cancelled orders from revenue. A schema says `daily_stats.conversion_rate` is a double. It does not say that averaging it across days gives a different answer from recomputing it from orders and sessions.

That missing meaning falls into a few categories. **Additivity** says whether a measure can be summed across a dimension. Revenue can be summed across regions and days. A conversion rate cannot be summed or averaged across anything. An account balance can be summed across accounts but not across days. **Grain** says what one row of a table represents: one order, one line item, one customer per day. Joins between tables at different grains are where most wrong numbers are born. **Time semantics** say which date column a metric uses and how history is stored. **Null semantics and units** cover the rest.

None of this is exotic. It is the material of dimensional modeling courses and data warehousing books. The difference with agents is scale and repetition. An agent writes thousands of queries. Each known failure pattern gets hit at a steady rate, forever, unless something catches it every time.

The answer is to treat these failures as a catalog, the way security teams treat vulnerability classes. Name each pattern, write down how it presents, record what information is needed to detect it, and build a test for it. Then run every agent-generated query through the tests before it produces an answer anyone reads.

## How the Catalog Is Organized

Each catalog entry has five fields: an identifier, a name, the symptom, the metadata a detector needs, and the detection classes that catch it. The machine-readable version, `semantic-failure-catalog-v1.yaml`, also records the fix.

There are three detection classes.

**Static** checks read the query text and compare it against metadata. They are fast, cost nothing to run, and work before the query touches data. Their weakness is that they only catch what is visible in the text.

**Dynamic** checks run a probe against sampled data. A fan-out probe, for example, counts joined rows and distinct keys. They catch problems that depend on actual data relationships, at the cost of running a small query.

**Reconciliation** compares the query's result with the same metric computed through an independent governed path. It is the catch-all. It detects any pattern that changes the total, including ones not in this catalog, but it only works when a governed definition exists to compare against.

Here is the full catalog at a glance.

| ID | Pattern | Detection | Metadata needed |
|---|---|---|---|
| SV-01 | Averaged ratio | static, reconcile | measure additivity |
| SV-02 | Summed distinct count | static, reconcile | none |
| SV-03 | One-to-many fan-out | dynamic, reconcile | grain, keys |
| SV-04 | Chasm trap | dynamic, reconcile | grain, fact roles |
| SV-05 | Semi-additive summed over time | static, reconcile | additivity, time dimension |
| SV-06 | Grain mismatch with targets | dynamic, reconcile | grain |
| SV-07 | Type 2 history without validity window | static, dynamic | history columns |
| SV-08 | Wrong time anchor | static, reconcile | metric time dimension |
| SV-09 | NOT IN with NULLs | static | none |
| SV-10 | Dropped dimension members | dynamic | conformed dimensions |
| SV-11 | Averaged percentiles | static, reconcile | additivity |
| SV-12 | Mixed units or currencies | static, dynamic | unit per measure |

The metadata column is the practical constraint. Two patterns need nothing beyond the query. The other ten depend on metadata that many organizations do not record anywhere a program can read it. Additivity and grain are the two most valuable fields. If your semantic layer or catalog records only those two, you can detect most of this list.

## Aggregation Failures

Four patterns come from aggregating a measure in a way its definition does not allow.

### SV-01: Averaged ratio

A table stores a precomputed ratio per row, and the query averages it across rows.

```sql
-- Wrong: averages each store's average order value
SELECT AVG(revenue / orders) AS avg_order_value FROM store_sales;

-- Right: recompute the ratio from its parts
SELECT SUM(revenue) / SUM(orders) AS avg_order_value FROM store_sales;
```

With three stores, the wrong query returns 103.33 and the right one returns 81.64. The gap comes from one small store with 60 orders at 150 per order, which counts as much as a store with 1,500 orders. Averaging a ratio weights every row equally, whatever its size. Recomputing the ratio weights each row by its denominator, which is what "average order value" means.

The static check flags `AVG` or `SUM` wrapped around any column the semantic layer marks non-additive. A second test flags `AVG` around any division expression, which catches the inline form above even without metadata.

### SV-02: Summed distinct count

The query counts distinct entities per group, then adds the groups together.

```sql
-- Wrong: adds daily unique users across the week
SELECT SUM(daily_uniques) FROM (
  SELECT day, COUNT(DISTINCT user_id) AS daily_uniques
  FROM daily_active GROUP BY day
) t;

-- Right: count distinct users once over the whole week
SELECT COUNT(DISTINCT user_id) FROM daily_active;
```

On a three-day sample, the wrong query returns 7 and the right one returns 3. Three users were active, and one of them showed up every day. Distinct counts are not additive across any dimension where the same entity can appear in more than one group. This pattern needs no metadata at all. The structure, a `SUM` over a column that an inner query built with `COUNT(DISTINCT ...)`, is visible in the text.

### SV-05: Semi-additive measure summed over time

A balance, an inventory level, or a headcount can be summed across accounts, warehouses, or departments. It cannot be summed across time.

```sql
-- Wrong: adds three month-end balances
SELECT SUM(balance) FROM balances
WHERE month_end BETWEEN '2026-07-01' AND '2026-09-30';

-- Right: take the balance at the end of the period
SELECT balance FROM balances WHERE month_end = '2026-09-30';
```

For one account with month-end balances of 1,000, 1,100, and 1,200, the wrong query reports a quarter-end balance of 3,300. The right answer is 1,200. Semi-additive measures need a rule for the time dimension, usually last value, sometimes first or average. The static check flags any `SUM` over a column marked semi-additive. It is conservative, because summing across accounts on a single date is fine. Refine it by also checking whether the query groups by or filters to a single time value.

### SV-11: Averaged percentiles

Percentiles are not additive in any direction. A median of medians is not the median.

```sql
-- Wrong: median of per-service medians
SELECT MEDIAN(p50_ms) FROM (
  SELECT service, MEDIAN(ms) AS p50_ms FROM latency GROUP BY service
) t;

-- Right: median over the underlying measurements
SELECT MEDIAN(ms) FROM latency;
```

With one service reporting three fast requests and another reporting seven slow ones, the median of medians is 206 milliseconds and the true median is 250. The per-service medians hide how many requests each service handled. This pattern is common in observability data, where dashboards pre-aggregate percentiles by service and an agent then aggregates them again. Detection is static: flag any aggregate over a column marked as a percentile or other non-additive measure.

## Join Failures

Five patterns come from joins that change the number of rows being aggregated. These are the most damaging in practice, because the wrong number is often plausible and nothing in the query looks unusual.

### SV-03: One-to-many fan-out

A measure lives at a parent grain. The query joins to a child table and then sums the measure, which now repeats once per child row.

```sql
-- Wrong: payment amount repeats once per shipment box
SELECT SUM(p.amount)
FROM payments p JOIN shipments s ON p.order_id = s.order_id;

-- Right: measure payments from the payments table
SELECT SUM(amount) FROM payments;
```

With two orders paid at 500 and 300, where the first order shipped in three boxes, the wrong query returns 1,800. The right answer is 800. The query is a textbook inner join on a real foreign key. A schema checker approves it without hesitation.

Static detection is weak here, because the text does not reveal cardinality. The reliable check is a dynamic probe: run the query's `FROM` and `JOIN` clauses and compare `count(*)` with `count(DISTINCT parent_key)`. On this sample, the probe returns 4 joined rows for 2 payment keys and fails. With grain metadata, you can also check statically that a measure declared at order grain is being summed after a join to a table at a finer grain.

### SV-04: Chasm trap

Two fact tables share a dimension. The query joins both facts through that dimension and aggregates each. Every row of one fact pairs with every matching row of the other.

```sql
-- Wrong: sales and returns multiply each other
SELECT s.product, SUM(s.amount) AS sales, SUM(r.amount) AS returns
FROM sales s JOIN returns_ r ON s.product = r.product
GROUP BY s.product;

-- Right: aggregate each fact first, then join the aggregates
WITH s AS (SELECT product, SUM(amount) AS sales FROM sales GROUP BY product),
     r AS (SELECT product, SUM(amount) AS returns FROM returns_ GROUP BY product)
SELECT s.product, s.sales, r.returns
FROM s LEFT JOIN r ON s.product = r.product;
```

For product p1, with two sales of 100 and two returns totaling 50, the wrong query reports sales of 400 and returns of 100. The right values are 200 and 50. There is a trap inside the trap here. The return rate computed from the wrong numbers is 25 percent, which is also the correct rate. Both totals doubled, so their ratio survived. An agent or a reviewer who spot-checks the rate sees a correct number and approves a query whose absolute values are twice the truth.

The fan-out probe catches this too, applied to each fact table in the join. Reconciliation of either total against the governed sales or returns metric catches it immediately.

### SV-06: Grain mismatch with targets

Targets and budgets usually live at a coarser grain than actuals. Joining them without aggregating first repeats the target on every fine-grained row.

```sql
-- Wrong: the monthly target repeats on each of 30 daily rows
SELECT SUM(d.amount) AS actual, SUM(t.target) AS target
FROM daily_sales d
JOIN monthly_target t ON strftime(d.day, '%Y-%m') = t.month;
```

With 30 days of sales at 1,000 each against a monthly target of 25,000, this query reports a target of 750,000. Attainment shows as 4 percent. The true attainment is 120 percent. A sales team gets told it missed badly in a month where it beat the target. The fix is to aggregate actuals to the month before joining. Detection is the same dynamic probe, applied to the target table's key, plus reconciliation of the target total.

### SV-07: Type 2 history joined without a validity window

A slowly changing dimension of type 2 keeps one row per version of an entity, with columns marking when each version was valid. Joining facts to it on the entity key alone matches every version.

```sql
-- Wrong: every order matches every historical segment row
SELECT h.segment, SUM(o.amount)
FROM orders o JOIN customer_hist h ON o.customer_id = h.customer_id
GROUP BY h.segment;

-- Right: match the version valid on the order date
SELECT h.segment, SUM(o.amount)
FROM orders o JOIN customer_hist h
  ON o.customer_id = h.customer_id
 AND o.order_date BETWEEN h.valid_from AND h.valid_to
GROUP BY h.segment;
```

With customer c1 moving from bronze to gold during the year, the wrong query counts c1's orders under both segments. Total revenue across segments comes to 650 instead of 350. This pattern is easy to detect statically once the catalog knows which tables are type 2 and which columns hold the validity window. The check flags any join to such a table that never references those columns.

### SV-10: Dropped dimension members

An inner join between a dimension and a fact removes members that have no facts. For sums, that is harmless. For averages, shares, and counts of members, it changes the answer.

```sql
-- Wrong: averages only regions that had sales
SELECT AVG(s.amount)
FROM regions r JOIN region_sales s ON r.region = s.region;

-- Right: include every region, with zero where there were no sales
SELECT SUM(COALESCE(s.amount, 0)) / COUNT(*)
FROM regions r LEFT JOIN region_sales s ON r.region = s.region;
```

With four regions and sales in only two of them, the wrong query reports average sales per region of 200. Across all four regions, the answer is 100. Whether zero is the right fill value depends on the metric definition, which is why this belongs in the semantic layer. The dynamic check compares the number of distinct dimension members in the result with the number in the dimension table. On this sample it reports 2 of 4 regions covered.

## Filter and Type Failures

The last three patterns come from filtering on the wrong thing or combining values that do not belong together.

### SV-08: Wrong time anchor

Most fact tables carry several dates: order date, ship date, invoice date, event time, ingestion time. A metric definition picks one. A query that filters on a different one answers a different question.

```sql
-- Metric definition: September revenue is by order date
SELECT SUM(amount) FROM orders
WHERE order_date BETWEEN '2026-09-01' AND '2026-09-30';   -- 800

-- Agent-generated: filters on ship date
SELECT SUM(amount) FROM orders
WHERE ship_date BETWEEN '2026-09-01' AND '2026-09-30';    -- 500
```

On a three-order sample, the two filters return 800 and 500. Neither query is wrong in isolation. Only one matches the definition of the metric being asked for. The static check compares the date column in the `WHERE` clause with the time dimension the governed metric declares. Reconciliation catches any mismatch that changes the total.

### SV-09: NOT IN with NULLs

In SQL's three-valued logic, `x NOT IN (a, b, NULL)` is never true. If the subquery returns a single NULL, the outer query returns no rows.

```sql
-- Wrong: returns 0 because banned contains a NULL
SELECT COUNT(*) FROM users
WHERE user_id NOT IN (SELECT user_id FROM banned);

-- Right: NOT EXISTS handles NULLs as expected
SELECT COUNT(*) FROM users u
WHERE NOT EXISTS (SELECT 1 FROM banned b WHERE b.user_id = u.user_id);
```

With four users, one banned user, and one NULL row in the banned table, the first query returns 0 and the second returns 3. This one needs no metadata. Any `NOT IN` with a subquery gets flagged, and the fix is mechanical.

### SV-12: Mixed units or currencies

Summing a column that holds values in different units produces a number with no meaning.

```sql
SELECT SUM(amount) FROM fx_sales;   -- 1,000 USD + 150,000 JPY = 151,000
```

The result, 151,000, is neither dollars nor yen. The fix is to convert with a governed rate before summing, or to group by currency. Detection needs metadata that identifies which measures carry a unit column. The static check then flags any aggregate over such a measure that neither groups by nor converts the unit. A dynamic check confirms by counting distinct unit values in the aggregated rows.

## What Metadata to Export

Every detector above reads a small metadata file. Producing that file is most of the real work, and it is worth designing on purpose rather than assembling by hand.

A useful export has four sections. The shape below is illustrative, not a standard:

```json
{
  "measures": {
    "orders.order_total":        {"additivity": "additive",      "grain": "order"},
    "daily_stats.conversion_rate": {"additivity": "non_additive", "numerator": "orders", "denominator": "sessions"},
    "balances.balance":          {"additivity": "semi_additive", "time_rule": "last"},
    "latency_rollup.p50_ms":     {"additivity": "non_additive"},
    "fx_sales.amount":           {"additivity": "additive",      "unit_column": "currency"}
  },
  "tables": {
    "orders":       {"grain": "order",     "key": ["order_id"]},
    "order_items":  {"grain": "line_item", "key": ["order_id", "line_no"]},
    "customer_hist": {"scd2": {"valid_from": "valid_from", "valid_to": "valid_to"}}
  },
  "metrics": {
    "september_revenue": {"measure": "orders.order_total", "time_dimension": "order_date"}
  },
  "dimensions": {
    "region": {"table": "regions", "key": "region", "fill_missing": 0}
  }
}
```

The `measures` section carries additivity for every numeric column that agents aggregate. For ratios, it also names the numerator and denominator, so a failed check can tell the agent exactly how to recompute the value. For semi-additive measures, it names the rule for the time dimension. For measures with units, it names the unit column.

The `tables` section carries grain and keys. These power the fan-out probe and let a static rule compare a measure's grain with the grain of every table it gets joined to. It also lists type 2 history tables and their validity columns.

The `metrics` section maps each governed metric to its measure and its time dimension. That is the input for SV-08 and for building reconciliation references.

The `dimensions` section says which dimension table is the full list of members and what value fills a missing fact. That drives SV-10.

Generate this file from the systems that already hold the information. A semantic layer that stores metric definitions already knows numerators, denominators, and time dimensions. A catalog that stores table properties can hold grain and keys as properties. Dimensional models built with a modeling tool often record grain in their documentation. Pull from those sources on a schedule, write the file, and version it alongside the checks. Hand-maintained metadata drifts from reality within weeks.

Start small. Additivity for the 50 most-queried measures and grain for the 20 most-joined tables covers a large share of agent traffic in most organizations. Expand coverage by looking at which measures and tables show up in the nightly query log without metadata.

## Checking One Agent Query End to End

Here is the full catalog applied to one query, in the order the checks run.

An agent receives the question "What was total payment revenue by customer segment in September?" It writes this query:

```sql
SELECT h.segment, SUM(p.amount) AS revenue
FROM payments p
JOIN shipments s     ON p.order_id = s.order_id
JOIN orders o        ON p.order_id = o.order_id
JOIN customer_hist h ON o.customer_id = h.customer_id
WHERE s.ship_date BETWEEN '2026-09-01' AND '2026-09-30'
GROUP BY h.segment;
```

Every table and column exists. The query runs. It contains three separate catalog failures.

The static checker runs first and costs almost nothing. The SV-07 rule sees a join to `customer_hist` with no reference to its validity columns and returns a message. With the metric time dimension in the metadata, an SV-08 rule sees a filter on `ship_date` for a metric defined on order date and returns a second message. Both go back to the agent together.

The agent's second attempt adds the validity window and switches the filter to `o.order_date`. The static checks pass. The query still joins `shipments`, which the agent kept because it was there before.

The dynamic probe runs next on a sample. The fan-out check counts joined rows against distinct payment keys, finds more rows than keys, and fails with a message naming the `payments` fact. The agent's third attempt drops the `shipments` join, which the question never needed.

Now the probe passes, the query runs, and reconciliation compares the total across all segments with the governed September revenue metric. The two match within tolerance. The answer goes out with its snapshot IDs.

Three attempts sounds expensive. Compare it with the alternative. The first query returns a total inflated by shipment counts and split across both historical segments for any customer who changed segment. The segment chart looks reasonable. Nobody questions it, and it drives a quarter's worth of decisions about which customer tier to invest in.

## The Static Checker

The static checks run on query text before anything executes. This implementation uses sqlglot, the open source SQL parser. It covers SV-01, SV-02, SV-05, SV-07, SV-09, and SV-11, and it was tested against each of those examples, wrong and corrected. SV-08 and SV-12 follow the same pattern using the metric time dimension and unit columns from the metadata export, and they are left as extensions. The checker reads a simplified version of that export.

```python
"""Static checks from the Semantic Failure Catalog, run on query text plus metadata."""
import sqlglot
from sqlglot import exp

# Exported from the semantic layer and catalog.
META = {
    "additivity": {"aov": "non_additive", "balance": "semi_additive",
                   "p50_ms": "non_additive"},
    "scd2_tables": {"customer_hist": ("valid_from", "valid_to")},
}


def sv01_05_11_reaggregated(tree):
    """SV-01, SV-05, SV-11: SUM/AVG/MEDIAN over a non-additive or semi-additive measure."""
    out = []
    for agg in tree.find_all(exp.Sum, exp.Avg, exp.Median):
        for col in agg.find_all(exp.Column):
            kind = META["additivity"].get(col.name.lower())
            if kind:
                out.append(f"{agg.key.upper()}({col.name}) re-aggregates a {kind} measure")
        if isinstance(agg, exp.Avg) and agg.find(exp.Div):
            out.append("AVG over a division averages a ratio; divide the sums instead")
    return out


def sv02_summed_distinct(tree):
    """SV-02: an outer SUM over a column that an inner query built with COUNT(DISTINCT)."""
    out = []
    for sub in tree.find_all(exp.Subquery):
        inner = sub.this
        for proj in inner.expressions:
            if proj.find(exp.Count) and proj.find(exp.Distinct):
                alias = proj.alias_or_name
                for agg in tree.find_all(exp.Sum):
                    if any(c.name == alias for c in agg.find_all(exp.Column)):
                        out.append(f"SUM({alias}) adds distinct counts across groups")
    return out


def sv07_scd_without_dates(tree):
    """SV-07: join to a type 2 history table with no predicate on its validity columns."""
    out = []
    for join in tree.find_all(exp.Join):
        table = join.this.find(exp.Table)
        if table is None or table.name not in META["scd2_tables"]:
            continue
        valid_cols = set(META["scd2_tables"][table.name])
        referenced = {c.name for c in tree.find_all(exp.Column)}
        if not valid_cols & referenced:
            out.append(f"join to {table.name} ignores {sorted(valid_cols)}")
    return out


def sv09_not_in_subquery(tree):
    """SV-09: NOT IN (subquery) returns no rows if the subquery yields a NULL."""
    out = []
    for node in tree.find_all(exp.Not):
        if isinstance(node.this, exp.In) and node.this.args.get("query"):
            out.append("NOT IN (subquery) returns nothing when the subquery has a NULL")
    return out


RULES = [sv01_05_11_reaggregated, sv02_summed_distinct,
         sv07_scd_without_dates, sv09_not_in_subquery]


def check(sql: str):
    tree = sqlglot.parse_one(sql)
    return [msg for rule in RULES for msg in rule(tree)]
```

Each rule is a small function that takes the parsed syntax tree and returns a list of messages. An empty list means the rule found nothing.

The first rule covers three catalog entries at once, because averaged ratios, summed balances, and re-aggregated percentiles share one shape: an aggregate function wrapped around a column whose additivity forbids it. The rule walks every `SUM`, `AVG`, and `MEDIAN` in the tree and looks up each column inside it. It also flags any `AVG` wrapped around a division, which is how an inline ratio like `AVG(revenue / orders)` shows up.

The second rule needs no metadata. It finds subqueries whose projections include a `COUNT(DISTINCT ...)`, takes the alias of that projection, and checks whether an outer `SUM` references the alias.

The third rule reads the list of type 2 tables and their validity columns. For every join to one of those tables, it checks whether the query references any validity column anywhere. The test is deliberately loose. A query that mentions `valid_from` in the wrong place still passes. Tightening it to inspect the join condition itself is straightforward, but the loose version already catches the common mistake of joining on the key alone.

The fourth rule is pure syntax. `NOT IN` with a subquery gets flagged, whatever the data.

Run against the examples, the checker returns exactly one message for each wrong query and an empty list for each corrected query. For instance, the SV-07 query without dates returns "join to customer_hist ignores ['valid_from', 'valid_to']," and the version with the `BETWEEN` predicate returns nothing.

Two design choices matter. The rules return messages written for the agent, not for a human reviewer. When an agent's query fails a check, that message goes back into its next attempt as feedback. A message that names the function, the column, and the reason gives the agent what it needs to fix the query. The rules also depend only on metadata the semantic layer exports. When the semantic layer adds an additivity flag to a new measure, the checker picks it up on the next export with no code change.

## Dynamic Probes and Reconciliation

Static checks cannot see cardinality. The dynamic probes run small queries against sampled data to find it. These functions were tested with DuckDB, but the SQL is standard and runs on any engine.

```python
"""Dynamic checks from the Semantic Failure Catalog, run against sampled data."""


def sv03_04_fanout(con, from_clause, fact_alias, fact_key):
    """SV-03, SV-04: does the query's join multiply rows of the measured fact?"""
    joined, distinct = con.sql(
        f"SELECT count(*), count(DISTINCT {fact_alias}.{fact_key}) {from_clause}"
    ).fetchone()
    if joined != distinct:
        return [f"join returns {joined} rows for {distinct} {fact_alias} keys"]
    return []


def sv10_dropped_members(con, dim_table, dim_key, result_sql):
    """SV-10: does the result silently drop dimension members with no facts?"""
    expected = con.sql(f"SELECT count(DISTINCT {dim_key}) FROM {dim_table}").fetchone()[0]
    got = con.sql(f"SELECT count(DISTINCT {dim_key}) FROM ({result_sql})").fetchone()[0]
    if got < expected:
        return [f"result covers {got} of {expected} {dim_key} values"]
    return []


def reconcile(con, candidate_sql, reference_sql, tolerance_pct=0.5):
    """Catch-all: compare the candidate total with the governed metric's total."""
    cand = con.sql(candidate_sql).fetchone()[0]
    ref = con.sql(reference_sql).fetchone()[0]
    delta = abs(float(cand) - float(ref)) / abs(float(ref)) * 100
    if delta > tolerance_pct:
        return [f"total {cand} differs from governed total {ref} by {delta:.1f}%"]
    return []
```

The fan-out probe takes the query's `FROM` clause, including all joins, and counts rows against distinct keys of the fact table whose measure is being aggregated. If the counts differ, the join multiplied that fact. On the payments example, it reports "join returns 4 rows for 2 p keys." The caller needs to know which table is the fact and what its key is, which is exactly the grain metadata from the catalog table.

The dropped-members probe compares distinct dimension values in the result with distinct values in the dimension table. On the regions example, it reports "result covers 2 of 4 region values." Not every drop is wrong. A query filtered to one region should cover one region. The caller passes the unfiltered dimension only when the metric definition says every member belongs in the result.

The reconciliation function runs the candidate query and a reference query through the governed path, then compares the two totals. On the fan-out example, it reports a 125 percent difference between 1,800 and 800. The reference query is the important part. It must compute the metric through a path that does not share the candidate's mistake. A metric API in the semantic layer, a precomputed aggregate maintained by the data team, or a query built from the metric definition by the semantic layer's own compiler all work. A second agent writing a second query does not, because it can make the same mistake.

Run dynamic probes on samples, not full tables. A fan-out that exists in the full data almost always shows up in a sample of a few thousand parent keys. Sampling by parent key rather than by random rows keeps parent-child relationships intact.

## Where the Checks Run

The catalog is useful at three points in an analytics system.

**Inside the agent loop, before an answer is returned.** The agent writes SQL, the static checker runs, and any messages go back to the agent as feedback for a retry. If the static checks pass, the dynamic probes run on samples. If those pass, the query runs, and reconciliation compares its total with the governed metric. Only then does the agent write an answer. An agent graph specification makes this sequence explicit, with each check as a success criterion on the SQL-writing step. A complete example of that structure appears in [Turning an Analytics Question Into a Verified Agentic Graph](https://datalakehousehub.com/blog/ags-multi-agent-analytics-workflow).

**In CI for the semantic layer.** Views and metric definitions are SQL too. Run the static checker over every view definition on each pull request. A view that averages a ratio poisons every agent and dashboard that reads it. Catching it at review time costs nothing.

**Over logged queries, after the fact.** Run the static checker nightly over every query agents executed that day. The count of hits per pattern tells you which failures agents make most often, which tells you where to improve metadata, prompts, or semantic layer coverage. It also finds wrong answers that already went out, so someone can correct them.

## When the Checks Themselves Fail

Detectors have failure modes too, and knowing them keeps the catalog honest.

**Missing metadata produces silence, not errors.** A ratio column with no additivity flag passes the static check. The checker cannot distinguish "additive" from "unknown." Treat unknown additivity as a finding in its own right. Report measures without the flag, and route queries that aggregate them to the dynamic and reconciliation checks.

**Aliases and views hide columns.** If a view renames `conversion_rate` to `cr`, the static checker sees `AVG(cr)` and finds no metadata for `cr`. Resolve views to their base columns before checking, or export additivity for view columns as well. sqlglot's optimizer can qualify and expand column references against a schema, which handles many of these cases.

**Sampling misses rare fan-outs.** A join that multiplies rows only for a small fraction of parent keys can pass a probe on a small sample. For critical metrics, sample by parent key and oversample keys known to have many children.

**Reconciliation shares assumptions with the candidate.** If the governed metric is itself defined with a chasm trap, reconciliation agrees with the wrong answer. Reconciliation verifies consistency with the definition. It does not verify the definition. Run the static checker over metric definitions in CI for exactly this reason.

**False positives erode trust.** The semi-additive rule flags every sum over a balance, including correct sums across accounts on a single date. If agents and reviewers learn that checks cry wolf, they start ignoring them. Refine rules that fire falsely, and track the false positive rate per rule. A rule whose hits are mostly false needs work before it gates anything.

## Maintaining the Catalog

The catalog is versioned because it will grow. Treat it like any other shared engineering asset.

Add an entry when a wrong number reaches a person. Every incident gets a root cause. If the root cause is a query pattern not in the catalog, write the entry, the reproducible example, and the detector. Give it the next identifier and bump the minor version.

Keep a fixture set. For every entry, keep at least one wrong query and one corrected query, along with the small dataset that demonstrates the difference. Run the detectors against the fixtures in CI. A detector change that stops catching its own fixture fails the build.

Track hits by pattern over time. A pattern that agents hit often points to missing metadata or a confusing table. SV-06 hits usually mean targets live in a table that invites naive joins. SV-08 hits usually mean several date columns carry similar names. Fixing the data model reduces hits more than improving prompts does.

Share the catalog across teams. The patterns are not specific to one company's data. A pattern your finance team found in a ledger query will show up in a marketing team's attribution query next month. Publish the YAML file internally, accept additions from any team through pull requests, and keep one owner responsible for identifiers and versions so entries do not fork into local variants.

Record which metadata each detector needs, and measure coverage. The percentage of measures with an additivity flag and the percentage of tables with declared grain are the two numbers that most predict how much of the catalog you can enforce.

## Where This Is Heading

Semantic layer standards are moving toward carrying exactly the metadata this catalog needs. Open efforts on semantic model interchange treat measures, dimensions, and their aggregation rules as first-class fields. When additivity and grain travel with the model in a standard format, detectors like these become portable. A check written once works against any compliant semantic layer.

Agent frameworks are moving verification out of prompts and into explicit steps. Specifications for agent plans already support deterministic success criteria per step, with failed checks fed back into retries. A catalog of named failure patterns with ready-made detectors fits that model directly.

The long-term goal is for most agent queries to never touch raw SQL at all, and to go through metric interfaces that make these mistakes impossible to express. That goal is correct, and it is not where most organizations are today. Until it is, the catalog is the safety net under the SQL that still gets written.

## Conclusion

Schema validation checks that a query refers to real things. It does not check that the query means what the question asked. Twelve common patterns, from averaged ratios to chasm traps to NULLs inside `NOT IN`, produce clean results that are wrong by anywhere from a few percent to a factor of thirty.

Each of those patterns is detectable. Static checks on query text, backed by additivity and grain metadata, catch the aggregation and syntax cases before execution. Dynamic probes on sampled data catch the join cases. Reconciliation against a governed total catches anything that changes the answer, including patterns nobody has catalogued yet.

Use the catalog, extend it every time a wrong number escapes, and invest in the metadata the detectors depend on. The YAML file and the two detector modules that accompany this article are a starting point. The version that matters is the one your team maintains.

## Keep Going

If this piece was useful, I have written a lot more on semantic layers, governed data, and the lakehouse that AI agents query. *Architecting an Apache Iceberg Lakehouse* covers how to build the catalog and semantic foundation that makes checks like these enforceable. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
