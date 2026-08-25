---
title: "Metric Contracts in Code: Testing, Versioning, and Serving Business Logic to Multi-Agent Systems"
date: "2026-08-25"
description: "Metric contracts in code let teams test, version, and serve business logic to multi-agent systems without each agent inventing its own SQL."
author: "Alex Merced"
category: "AI & Agents"
canonical: https://iceberglakehouse.com/posts/metric-contracts-code-multi-agent/
tags:
  - metrics
  - AI agents
  - semantic layer
  - data contracts
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/metric-contracts-code-multi-agent/).

Three agents answer the same question on the same afternoon. A finance agent, asked for last quarter's net revenue, sums completed orders, subtracts refunds, and reports $41.2 million. A sales agent, asked the same thing by a regional director, sums completed orders and reports $43.8 million, because nobody told it about refunds. A board-deck agent pulls "revenue" from a dashboard's cached tile and reports $42.6 million, which was right two weeks ago. All three are confident. All three cite their sources. The CFO gets three numbers and has to decide which agent to believe.

That is metric drift, and it existed before agents. Dashboards drifted from each other for a decade. What agents change is the speed and the volume: an agent framework that spins up a dozen specialized agents, each generating its own SQL, produces a dozen slightly different definitions of every metric it touches, and it does so hundreds of times a day with no reconciliation meeting. Drift that used to surface quarterly now surfaces per conversation.

The fix is a metric contract: a definition of a metric precise enough that any consumer, human or agent, computes the same number from the same data, version-controlled so changes are deliberate, tested so violations are caught before they ship, and served through interfaces that agents can call rather than re-derive. This article is about building that in practice. I will cover what a contract has to specify to be complete, how to express it in code using the Apache Ossie (incubating) format as the definition layer, how to write the unit tests that catch the failure modes that actually happen, how to version contracts so that consumers do not break, how to detect drift across agents that are supposed to be using the contract, and how to expose contracts over REST, GraphQL, and the Model Context Protocol. I work at Dremio, whose semantic layer is one place contracts get enforced, and I have kept the patterns engine-neutral.

## What a Metric Contract Has to Specify

A metric name and a SQL expression are not a contract. They are the part of a contract most teams write down, and the parts they leave out are where drift comes from. A complete contract specifies six things.

The measure expression. `SUM(amount)`, `COUNT(DISTINCT customer_id)`, `SUM(amount) - SUM(refund_amount)`. This is the part everyone writes.

The grain. What one row of the input represents and what one row of the output represents. Net revenue is computed over orders (one row per order) and reported at any grain the dimensions allow. Average order value is a ratio of two sums and must be computed at the order grain then aggregated as a ratio, not averaged across pre-aggregated rows. Getting the grain wrong is the most common source of a metric that is right in one dashboard and wrong in another.

The dimensions it can be sliced by, and the ones it cannot. Net revenue by customer segment is valid. Net revenue by product category is valid only if refunds are attributable to products, and if they are not, slicing by product produces a number that does not sum to the total. The contract lists allowed dimensions and, for non-additive measures, the dimensions along which the metric cannot be summed.

The filter. Completed orders only. Test orders excluded. Orders in the reporting currency or converted at the daily rate. The filter is part of the metric's identity: "revenue including cancelled orders" is a different metric with a different name.

The time semantics. Which date column anchors the metric (order date, ship date, settlement date), what time zone, and whether the metric is a point-in-time value or a period aggregate. "Last quarter" means something different depending on which date and which calendar.

Additivity. Whether the measure can be summed across time (revenue can), averaged (it cannot, meaningfully), or is a distinct count (customer count cannot be summed across periods without double counting). This is what tells a consumer whether they can roll up a monthly value to a quarterly one or have to recompute from the grain.

A contract that specifies all six is one that two independent implementations can be tested against. A contract that specifies only the first is a suggestion.

## Expressing the Contract in Code

The definition needs a format, and the format should be the one the rest of the ecosystem is converging on. Apache Ossie (incubating), the vendor-neutral semantic model specification that entered the Apache Incubator in July 2026, has the structure for datasets, fields, relationships, and metrics, with multi-dialect expressions and an `ai_context` block. It does not have first-class fields for grain, additivity, or allowed dimensions in its 0.2.0 draft, so the contract layer adds those through Ossie's `custom_extensions` mechanism, under a vendor name the organization owns. That keeps the definition portable (every Ossie consumer reads the core) while carrying the contract specifics (consumers that know the extension enforce them).

Here is the net revenue contract, in Ossie with a contract extension:

```yaml
version: 0.2.0.dev0
semantic_model:
  - name: finance_core
    description: Certified finance metrics. Changes require finance-data-owners approval.

    datasets:
      - name: orders
        source: lake.sales.orders
        primary_key: [order_id]
        fields:
          - name: order_id
            expression: { dialects: [{ dialect: ANSI_SQL, expression: order_id }] }
            datatype: String
          - name: customer_id
            expression: { dialects: [{ dialect: ANSI_SQL, expression: customer_id }] }
            datatype: String
          - name: order_date
            expression: { dialects: [{ dialect: ANSI_SQL, expression: order_date }] }
            datatype: Date
            dimension: { is_time: true }
          - name: status
            expression: { dialects: [{ dialect: ANSI_SQL, expression: status }] }
            datatype: String
            dimension: {}
          - name: is_test
            expression: { dialects: [{ dialect: ANSI_SQL, expression: is_test }] }
            datatype: Boolean
          - name: amount_usd
            expression: { dialects: [{ dialect: ANSI_SQL, expression: amount_usd }] }
            datatype: Decimal
          - name: refund_usd
            expression: { dialects: [{ dialect: ANSI_SQL, expression: COALESCE(refund_usd, 0) }] }
            datatype: Decimal

      - name: customers
        source: lake.sales.customers
        primary_key: [id]
        fields:
          - name: id
            expression: { dialects: [{ dialect: ANSI_SQL, expression: id }] }
            datatype: String
          - name: segment
            expression: { dialects: [{ dialect: ANSI_SQL, expression: segment }] }
            datatype: String
            dimension: {}

    relationships:
      - name: orders_to_customers
        from: orders
        to: customers
        from_columns: [customer_id]
        to_columns: [id]

    metrics:
      - name: net_revenue_usd
        description: Completed, non-test order amounts minus refunds, in USD at order-date rate.
        expression:
          dialects:
            - dialect: ANSI_SQL
              expression: >
                SUM(CASE WHEN orders.status = 'completed' AND NOT orders.is_test
                         THEN orders.amount_usd - COALESCE(orders.refund_usd, 0) ELSE 0 END)
        datatype: Decimal
        ai_context:
          synonyms: ["net revenue", "revenue", "net sales"]
          examples: ["What was net revenue last quarter?", "Net revenue by segment for July"]
          instructions: >
            Always use this metric for revenue questions. Do not compute revenue from raw amount.
        custom_extensions:
          - vendor_name: ACME_CONTRACT
            data: |
              {
                "contract_version": "2.1.0",
                "grain": "order",
                "time_anchor": "orders.order_date",
                "time_zone": "UTC",
                "additivity": {"time": "sum", "dimensions": "sum"},
                "allowed_dimensions": ["customers.segment", "orders.status", "orders.order_date"],
                "forbidden_dimensions": [],
                "owner": "finance-data-owners",
                "certified": true,
                "certified_at": "2026-08-01",
                "changelog": "2.1.0: refunds now COALESCE to 0 (was NULL-propagating)"
              }

      - name: average_order_value_usd
        description: Net revenue divided by completed non-test order count.
        expression:
          dialects:
            - dialect: ANSI_SQL
              expression: >
                SUM(CASE WHEN orders.status = 'completed' AND NOT orders.is_test
                         THEN orders.amount_usd - COALESCE(orders.refund_usd, 0) ELSE 0 END)
                / NULLIF(COUNT(DISTINCT CASE WHEN orders.status = 'completed' AND NOT orders.is_test
                                             THEN orders.order_id END), 0)
        datatype: Decimal
        custom_extensions:
          - vendor_name: ACME_CONTRACT
            data: |
              {
                "contract_version": "1.0.0",
                "grain": "order",
                "time_anchor": "orders.order_date",
                "additivity": {"time": "recompute", "dimensions": "recompute"},
                "allowed_dimensions": ["customers.segment", "orders.order_date"],
                "owner": "finance-data-owners",
                "certified": true
              }
```

Three things about this structure.

The expression is complete. It carries the status filter, the test exclusion, and the refund subtraction inside the metric, so a consumer that uses the expression gets the contract's semantics without knowing them. That is the difference between a contract and a formula: the formula is `SUM(amount)`, the contract is everything that makes `SUM(amount)` mean net revenue.

The extension carries what Ossie does not. Grain, time anchor, additivity, allowed dimensions, owner, certification, and a changelog. Consumers that read the extension enforce them (a query engine rejects a slice by a forbidden dimension, an MCP server refuses to average a summable metric). Consumers that do not still get a correct expression.

Additivity is explicit and it differs between the two metrics. Net revenue sums across time and dimensions. Average order value has to be recomputed from the grain, because averaging monthly averages is wrong. The contract says so, and the tests below check it.

## Unit Tests That Catch Real Drift

A contract without tests is documentation. The tests are what turn "we defined net revenue" into "net revenue cannot silently change." The right test suite has four kinds of test, and they run in CI on every change to the contract file and every change to the tables it depends on.

**Fixture tests** pin the metric's value on a small, hand-built dataset where the right answer is known. The dataset has a completed order, a cancelled order, a test order, a completed order with a refund, and a completed order with a null refund. The expected net revenue is computed by hand once. The test runs the contract's expression over the fixture and compares. This catches the class of bug where a well-meaning change to the expression (say, dropping the `COALESCE`) alters the result on edge cases that production data always contains.

**Additivity tests** check that the contract's stated additivity is true. For a summable metric, compute it for each month and sum the months, then compute it for the quarter directly, and assert equality. For a recompute-only metric, assert that the naive rollup does not equal the direct computation on a fixture designed to make them differ, which proves the contract is right to forbid the rollup. This catches the class of bug where a metric is labeled summable and is not, which is the bug that makes quarterly totals disagree with the sum of monthly reports.

**Dimension tests** check that slicing by each allowed dimension sums back to the total (for summable metrics), and that slicing by a forbidden dimension is rejected by the enforcement layer. This catches the class of bug where a new dimension is added to a dataset and someone starts slicing a non-attributable metric by it.

**Contract stability tests** compare the current contract to the last released version and fail if anything in the extension changed without a version bump, or if the expression changed without a changelog entry. This catches the class of bug where someone edits the definition in place and nobody notices the number moved.

Here is the shape of the suite in Python, running the contract's ANSI SQL through DuckDB against fixtures. The same structure works against any engine with a SQL interface. DuckDB is the choice for CI because it needs no infrastructure.

```python
import json
import duckdb
import yaml
import pytest
from decimal import Decimal

CONTRACT_PATH = "contracts/finance_core.yaml"
RELEASED_PATH = "contracts/released/finance_core.yaml"

def load_model(path):
    return yaml.safe_load(open(path))["semantic_model"][0]

def metric(model, name):
    m = next(x for x in model["metrics"] if x["name"] == name)
    ext = next(e for e in m["custom_extensions"] if e["vendor_name"] == "ACME_CONTRACT")
    return m, json.loads(ext["data"])

def ansi(expr_obj):
    return next(d["expression"] for d in expr_obj["dialects"] if d["dialect"] == "ANSI_SQL")

@pytest.fixture
def con():
    c = duckdb.connect()
    c.execute("""
        CREATE TABLE orders AS SELECT * FROM (VALUES
          ('o1','c1',DATE '2026-07-03','completed',false, 100.00, NULL),
          ('o2','c1',DATE '2026-07-15','completed',false, 250.00, 50.00),
          ('o3','c2',DATE '2026-07-20','cancelled',false, 999.00, NULL),
          ('o4','c2',DATE '2026-08-02','completed',true,  10.00, NULL),
          ('o5','c3',DATE '2026-08-10','completed',false, 80.00, 80.00),
          ('o6','c3',DATE '2026-09-01','completed',false, 120.00, NULL)
        ) t(order_id, customer_id, order_date, status, is_test, amount_usd, refund_usd)
    """)
    c.execute("""
        CREATE TABLE customers AS SELECT * FROM (VALUES
          ('c1','enterprise'), ('c2','smb'), ('c3','smb')
        ) t(id, segment)
    """)
    return c

def run_metric(con, model, name, group_by=None, where=None):
    m, _ = metric(model, name)
    expr = ansi(m["expression"])
    gb = f"GROUP BY {group_by}" if group_by else ""
    sel = f"{group_by}, " if group_by else ""
    wh = f"WHERE {where}" if where else ""
    return con.execute(f"""
        SELECT {sel}{expr} AS v
        FROM orders JOIN customers ON orders.customer_id = customers.id
        {wh} {gb}
    """).fetchall()

def test_net_revenue_fixture(con):
    model = load_model(CONTRACT_PATH)
    # o1: 100, o2: 250-50=200, o3 cancelled, o4 test, o5: 80-80=0, o6: 120  => 420
    assert run_metric(con, model, "net_revenue_usd")[0][0] == Decimal("420.00")

def test_net_revenue_is_summable_over_time(con):
    model = load_model(CONTRACT_PATH)
    _, contract = metric(model, "net_revenue_usd")
    assert contract["additivity"]["time"] == "sum"
    monthly = run_metric(con, model, "net_revenue_usd", group_by="DATE_TRUNC('month', order_date)")
    assert sum(v for _, v in monthly) == run_metric(con, model, "net_revenue_usd")[0][0]

def test_aov_is_not_summable(con):
    model = load_model(CONTRACT_PATH)
    _, contract = metric(model, "average_order_value_usd")
    assert contract["additivity"]["time"] == "recompute"
    monthly = run_metric(con, model, "average_order_value_usd", group_by="DATE_TRUNC('month', order_date)")
    naive = sum(v for _, v in monthly) / len(monthly)
    direct = run_metric(con, model, "average_order_value_usd")[0][0]
    assert naive != direct  # proves the contract is right to forbid rollup

def test_allowed_dimensions_sum_to_total(con):
    model = load_model(CONTRACT_PATH)
    _, contract = metric(model, "net_revenue_usd")
    total = run_metric(con, model, "net_revenue_usd")[0][0]
    for dim in contract["allowed_dimensions"]:
        col = dim.split(".")[1]
        sliced = run_metric(con, model, "net_revenue_usd", group_by=col)
        assert sum(v for _, v in sliced) == total, f"{dim} does not sum to total"

def test_contract_change_requires_version_bump():
    current = load_model(CONTRACT_PATH)
    released = load_model(RELEASED_PATH)
    for m in current["metrics"]:
        cur_m, cur_c = metric(current, m["name"])
        try:
            rel_m, rel_c = metric(released, m["name"])
        except StopIteration:
            continue  # new metric, no prior version
        changed = ansi(cur_m["expression"]) != ansi(rel_m["expression"]) or \
                  {k: v for k, v in cur_c.items() if k not in ("contract_version", "changelog", "certified_at")} != \
                  {k: v for k, v in rel_c.items() if k not in ("contract_version", "changelog", "certified_at")}
        if changed:
            assert cur_c["contract_version"] != rel_c["contract_version"], \
                f"{m['name']} changed without a version bump"
            assert cur_c.get("changelog", "").startswith(cur_c["contract_version"]), \
                f"{m['name']} changed without a changelog entry"
```

Walk through what each test proves.

The fixture test pins the number. If someone removes the `COALESCE` from the refund subtraction, every order with a null refund (o1 and o6 in the fixture) evaluates to null inside the `CASE`, the `SUM` skips them, and the test fails with 200 where 420 was expected. In engines that propagate nulls through the aggregate differently the failure is a null rather than 200, which is why the fixture includes both a null refund and a zero refund. That is the exact bug the 2.1.0 changelog entry describes, and the test is what prevents it from recurring.

The additivity tests prove the contract's claims about itself. Net revenue by month sums to net revenue for the period. Average order value by month, averaged, does not equal average order value for the period, which is why the contract says recompute. A consumer that reads the contract and rolls up AOV anyway is violating it, and the enforcement layer can refuse.

The dimension test proves that every allowed dimension is a valid slice. Add a dimension to the allowed list that does not attribute cleanly (refunds by product category, when refunds are order-level), and the slices no longer sum to the total, so the test fails.

The stability test is the governance control. It reads the released contract from a directory that only the release process writes to, diffs the current one against it, and fails if the meaning changed without a version bump and a changelog line. The `contract_version`, `changelog`, and `certified_at` fields are excluded from the diff because they are expected to change.

## Wiring the Tests Into CI

The tests only prevent drift if they gate the merge. Here is the pipeline for the contracts repository, as a GitHub Actions workflow. The structure transfers to any CI system.

```yaml
name: metric-contracts
on:
  pull_request:
    paths: ["contracts/**", "tests/**", "generators/**"]
  push:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install duckdb pyyaml pytest jsonschema sqlglot

      - name: Validate Ossie schema
        run: python generators/validate_ossie.py contracts/*.yaml

      - name: Run contract tests
        run: pytest -q tests/

      - name: Generate interfaces
        run: |
          python generators/gen_views.py contracts/ > build/views.sql
          python generators/gen_graphql.py contracts/ > build/schema.graphql
          python generators/gen_mcp_tools.py contracts/ > build/tools.json

      - name: Diff generated interfaces against committed
        run: git diff --exit-code build/ || (echo "Regenerate interfaces and commit" && exit 1)

      - name: Post contract summary to PR
        if: github.event_name == 'pull_request'
        run: python generators/summarize_changes.py contracts/ contracts/released/ >> $GITHUB_STEP_SUMMARY

  release:
    needs: validate
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Apply views to engine
        run: python generators/apply_views.py build/views.sql --engine "$DREMIO_URL"
        env: { DREMIO_TOKEN: "${{ secrets.DREMIO_TOKEN }}" }
      - name: Publish to catalog
        run: python generators/publish_polaris.py contracts/ --polaris "$POLARIS_URL"
        env: { POLARIS_CREDENTIAL: "${{ secrets.POLARIS_CREDENTIAL }}" }
      - name: Promote to released
        run: |
          cp contracts/*.yaml contracts/released/
          git config user.name ci && git config user.email ci@example.com
          git add contracts/released && git commit -m "release: promote contracts" && git push
```

The validate job runs on every pull request. Schema validation against Ossie's JSON schema catches structural errors. The pytest suite catches semantic ones. The generators produce the view DDL, the GraphQL schema, and the MCP tool list, and the diff step fails the build if the committed generated files are stale, which forces the author to regenerate and commit them so reviewers see the downstream effect of a contract change in the same PR. The summary step posts a human-readable diff of the contract against the released version (new metrics, version bumps, changed expressions) to the PR.

The release job runs on merge. It applies the generated views to the engine, publishes the models to the catalog (or to the engine's semantic layer, until the catalog API leaves beta), and promotes the current contracts to the released directory, which is what the stability test compares against on the next PR. The promotion commit is the release record, and the tag is the version consumers cite.

One property of this pipeline matters more than the rest. The released directory is only ever written by the release job. An author cannot bump `contract_version` and copy the file into `released/` in the same PR to make the stability test pass, because the release job owns that directory and branch protection prevents direct writes. The test compares against what actually shipped.

## Versioning Contracts Without Breaking Consumers

Metric contracts are APIs, and they need the same versioning discipline. Semantic versioning maps cleanly.

A patch version (2.1.0 to 2.1.1) is a change that does not alter the number on any existing data: a description update, a synonym added to `ai_context`, a performance-neutral rewrite of the expression that the fixture test proves equivalent. Consumers do not need to know.

A minor version (2.1.0 to 2.2.0) is an additive change: a new allowed dimension, a new dialect added to the expression. Existing consumers keep working. New consumers can use the addition.

A major version (2.1.0 to 3.0.0) is a change to the number. A new filter, a changed refund treatment, a different time anchor. Every consumer that reports the metric will report a different value after the change, and they need to know.

The `COALESCE` change in the example was released as 2.1.0, a minor bump, and that was the wrong call: it changed the number on data with null refunds. The right call was a major bump. Teams learn this the first time a minor release moves a board metric.

Major versions need a coexistence strategy, because a dashboard, an agent, and a quarterly report cannot all switch on the same day. The pattern that works is to publish the new major as a new metric name with the version in it (`net_revenue_usd_v3`), keep the old one, mark the old one deprecated in `ai_context` with a sunset date, and let consumers migrate. After the sunset the old name is removed. An agent reading the `ai_context` sees the deprecation and prefers the new metric. A dashboard owner gets a ticket. Nobody's number changes without their knowledge.

The released contracts directory is the source of truth for "what version is live." A release is a pull request that copies the current contract into `released/`, tags the commit, and publishes the model to the catalog (the Apache Polaris Semantic Model API, when enabled, or the engine's semantic layer through its API). The catalog entity's version and the Git tag should agree.

## Detecting Drift Across Agents

Tests catch changes to the contract. They do not catch an agent that ignores the contract and writes its own SQL. That is the sales agent in the opening, and detecting it requires looking at what agents actually run.

The signal is in the query log. Every query an agent runs is recorded by the engine with the principal that ran it. Queries that reference the contract (through the semantic layer view or the metric tool) are conformant. Queries that hit the raw `orders` table with a `SUM(amount_usd)` and no refund subtraction are drift, and the log has them.

A drift detector is a scheduled job over the query log that, for each agent principal, classifies queries as contract-conformant or not. The simple version is structural: does the query reference a raw dataset that has a certified metric defined over it, and does the query contain an aggregate over a column that is a certified metric's input? Here is the shape:

```sql
WITH certified_inputs AS (
  -- From the contract: raw columns that feed certified metrics
  SELECT 'lake.sales.orders' AS dataset, 'amount_usd' AS column, 'net_revenue_usd' AS metric
  UNION ALL
  SELECT 'lake.sales.orders', 'refund_usd', 'net_revenue_usd'
),
agent_queries AS (
  SELECT job_id, user_name AS principal, sql_text, submitted_ts
  FROM sys.project.history.jobs
  WHERE user_name LIKE 'agent-%'
    AND submitted_ts >= CURRENT_DATE - INTERVAL '7' DAY
    AND query_state = 'COMPLETED'
)
SELECT
  q.principal,
  COUNT(*) AS total_queries,
  SUM(CASE WHEN q.sql_text ILIKE '%finance_core.net_revenue_usd%'
             OR q.sql_text ILIKE '%semantic.finance.net_revenue%' THEN 1 ELSE 0 END) AS conformant,
  SUM(CASE WHEN q.sql_text ILIKE '%lake.sales.orders%'
            AND q.sql_text ILIKE '%SUM(%amount_usd%' THEN 1 ELSE 0 END) AS raw_revenue_recomputed
FROM agent_queries q
GROUP BY q.principal
ORDER BY raw_revenue_recomputed DESC;
```

An agent with a high `raw_revenue_recomputed` count is re-deriving the metric. The fix is upstream of the detector: the agent's tools should not include raw table access for tables that have certified metrics, or the agent's system prompt should direct it to the metric tools (which is what the `ai_context.instructions` field is for). The detector is the check that the fix holds.

The more precise version parses the SQL rather than pattern-matching it, using a parser like SQLGlot to extract the aggregates and their inputs. That is a few hundred lines and it is worth it once there are more than a handful of certified metrics, because pattern matching on SQL text produces false positives on every `amount_usd` mention.

The detector's output goes two places: a weekly report per agent, and a hard alert when an agent that was conformant starts recomputing. The second is usually a prompt or tool change that removed the metric tool from the agent's context, and it is the multi-agent version of a dashboard developer bypassing the semantic layer because it was slow.

## Serving Contracts to Agents: REST, GraphQL, and MCP

A contract that agents cannot call is a contract they will re-derive. The last piece is exposing certified metrics through interfaces that make calling the contract easier than writing SQL. Three interfaces cover the consumers that exist.

**REST** is for services and scheduled jobs. One endpoint per metric, taking dimensions and a time range as parameters, returning rows plus the contract metadata so the caller knows what it got:

```
GET /metrics/net_revenue_usd?group_by=customers.segment&from=2026-07-01&to=2026-09-30
```

```json
{
  "metric": "net_revenue_usd",
  "contract_version": "2.1.0",
  "certified": true,
  "grain": "order",
  "time_anchor": "orders.order_date",
  "additivity": {"time": "sum", "dimensions": "sum"},
  "rows": [
    {"customers.segment": "enterprise", "net_revenue_usd": 27400000.00},
    {"customers.segment": "smb", "net_revenue_usd": 13800000.00}
  ],
  "computed_at": "2026-08-25T14:02:11Z",
  "source_snapshot": "lake.sales.orders@8812349912"
}
```

The response carries the version, the certification, and the source snapshot. A consumer that stores this can reproduce the number later and can tell whether two numbers came from the same contract version.

**GraphQL** is for BI-style consumers that compose several metrics and dimensions in one request. The schema is generated from the contract: each certified metric becomes a field, each allowed dimension becomes an argument, and the type system rejects a slice by a forbidden dimension at query validation time rather than at runtime:

```graphql
type Query {
  netRevenueUsd(
    groupBy: [NetRevenueDimension!]
    from: Date!
    to: Date!
  ): MetricResult!
}

enum NetRevenueDimension {
  CUSTOMERS_SEGMENT
  ORDERS_STATUS
  ORDERS_ORDER_DATE
}

type MetricResult {
  contractVersion: String!
  certified: Boolean!
  rows: [MetricRow!]!
  sourceSnapshot: String!
}
```

Because the dimension enum is generated from `allowed_dimensions`, adding a dimension to the contract (a minor version) regenerates the schema and the new dimension appears. A consumer asking for a dimension not in the enum gets a validation error before any query runs.

**MCP** is for agents. The Model Context Protocol server exposes each certified metric as a tool, with the tool description generated from the contract's `ai_context` and the extension's metadata, so the agent's model sees the synonyms, the examples, the additivity rules, and the allowed dimensions in the tool schema. Here is a tool definition generated from the contract, in the shape an MCP server returns from `tools/list`:

```json
{
  "name": "net_revenue_usd",
  "description": "Net revenue in USD. Completed, non-test order amounts minus refunds, at order-date rate. Certified by finance-data-owners, contract v2.1.0. Synonyms: net revenue, revenue, net sales. Summable across time and across the listed dimensions. Always use this tool for revenue questions. Do not compute revenue from raw order amounts. Examples: 'What was net revenue last quarter?', 'Net revenue by segment for July'.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "from": {"type": "string", "format": "date"},
      "to":   {"type": "string", "format": "date"},
      "group_by": {
        "type": "array",
        "items": {"type": "string", "enum": ["customers.segment", "orders.status", "orders.order_date"]}
      },
      "filters": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "customers.segment": {"type": "string"},
          "orders.status": {"type": "string"}
        }
      }
    },
    "required": ["from", "to"]
  }
}
```

Three things make this tool definition do governance work.

The `group_by` enum is the allowed dimensions list. An agent that tries to group by product category gets a schema validation error from the MCP client before the call reaches the server. The contract's forbidden-dimension rule is enforced by the tool schema, not by hoping the agent reads the description.

The description carries the additivity rule and the instruction not to recompute. Agents read tool descriptions closely because that is where they learn what a tool does. Putting "do not compute revenue from raw order amounts" in the certified tool's description is the single most effective drift prevention I have seen, because it reaches the agent at the moment it is choosing between tools.

The server does not expose a raw SQL tool for `lake.sales.orders` to agents that have the metric tool. If the agent's only path to revenue is the certified tool, the drift detector stays quiet. Dremio's MCP Server is one implementation that exposes governed semantic layer views this way, and the pattern is the same for any MCP server over a semantic layer: generate the tools from the contracts, and keep raw access out of the agent's tool list.

The three interfaces share one backend, the semantic layer view (or metric definition) that implements the contract in the engine. The REST endpoint, the GraphQL resolver, and the MCP tool all translate their parameters into a query against that view, the engine applies row and column policies under the caller's identity, and the result carries the contract version. One definition, three doors.

## Contracts Across Agent Frameworks

The multi-agent case has one more wrinkle. Different agents run on different frameworks (an orchestration framework for the finance workflow, a chat framework for the sales assistant, a scheduled runner for the board deck), and each framework has its own way of registering tools. The contract has to reach all of them without being re-implemented per framework.

MCP is the answer for the frameworks that speak it, which as of 2026 is most of them. One MCP server, generated from the contracts, serves every agent regardless of framework. The finance agent and the sales agent both connect to the same server and see the same `net_revenue_usd` tool with the same schema and the same description. The 2026 stateless MCP transport makes this a shared gateway rather than a per-agent process.

For frameworks that do not speak MCP, or for agents that need a lower-latency path, the REST interface serves the same contract, and a thin adapter registers each metric as a native tool. The adapter is generated from the same contract file, so it carries the same allowed dimensions and the same description.

The rule that keeps this coherent is that no agent framework gets its own metric definitions. Every tool that returns a certified metric is generated from the contract, through MCP or through an adapter, and the drift detector treats any agent query that computes a certified metric outside those tools as a violation regardless of framework. The framework is a delivery mechanism. The contract is the source.

Here is what a multi-agent estate looks like when this holds:

| Agent | Framework | Path to `net_revenue_usd` | Contract version seen | Drift detector status |
|---|---|---|---|---|
| finance-close | Orchestration framework with MCP client | MCP tool from shared gateway | 2.1.0 | Conformant |
| sales-assistant | Chat framework with MCP client | MCP tool from shared gateway | 2.1.0 | Conformant |
| board-deck-builder | Scheduled Python runner, no MCP | REST endpoint via generated adapter | 2.1.0 | Conformant |
| ad-hoc-explorer | Notebook agent with raw SQL tool | Raw `lake.sales.orders` | none | Flagged: recomputing |

The fourth row is the one the detector exists for. The fix is to give the explorer the metric tool and remove the raw tool for certified datasets, and the table is the artifact that shows the platform team where that change is needed.

## Failure Modes and Warning Signs

**The contract and the view diverge.** The Ossie file says net revenue subtracts refunds. The engine view that the MCP tool actually queries was updated by hand last month and does not. The tests pass (they run the contract's expression, not the view) and the tool returns the wrong number. The sign is the fixture test passing while a production spot check fails. Generate the view from the contract in CI rather than maintaining it separately, or add a test that runs the fixture through the engine view and compares to the contract's expression.

**A minor bump that changed the number.** Covered above: the `COALESCE` change was a semantic change released as minor. The sign is a dashboard owner asking why last quarter's revenue is different this week. Treat any change that alters the fixture test's expected value as major, and make the fixture test's expected value part of the release review.

**Agents with raw table access alongside the metric tool.** The drift detector shows an agent recomputing revenue even though it has the certified tool. It has a general SQL tool too, and it prefers writing SQL. Remove the raw tool from the agent's list for datasets with certified metrics, or scope the raw tool to non-certified datasets.

**Dimension enum out of date.** The contract added a dimension, the GraphQL schema and MCP tool were not regenerated, and consumers cannot slice by it. The sign is "the docs say I can group by X and the tool rejects it." Generate the interfaces from the contract in the same CI job that runs the tests.

**Time zone in the time anchor.** The contract says UTC. The source table's `order_date` is in the customer's local date. Quarter boundaries differ, and the metric is off by a day's worth of orders at each boundary. The sign is a small, consistent discrepancy against the finance system at period ends. The fixture should include orders on both sides of a period boundary in different zones, and the expression should apply the conversion the contract claims.

**Certified flag with no owner review.** `certified: true` was set when the contract was written and never revisited. The sign is a certified metric whose changelog shows three major versions with no owner approval recorded. Make certification a field the release process sets, not the author.

**Ratio metrics rolled up by a consumer.** A dashboard averages the monthly AOV values into a quarterly AOV. The contract says recompute, the tool's description says so, and the dashboard tool does not read either. The sign is a quarterly AOV that does not match the certified quarterly value. This is the case for the GraphQL or REST interface returning only grain-correct values and refusing to return a pre-aggregated ratio for a consumer to re-aggregate, and for the semantic layer's aggregate reflections to be defined at the grain the contract requires.

## Operational Guidance

**One repository for contracts, tests, and generated interfaces.** The contract YAML, the pytest suite, the released directory, and the generators for the view DDL, the GraphQL schema, and the MCP tool list all live together. A pull request changes the contract, and CI regenerates and tests everything downstream.

**Fixture per metric, edge cases included.** Null inputs, zero inputs, excluded rows (cancelled, test), period boundaries. The fixture is the executable definition of the contract's edge behavior.

**Major bump for any change to the fixture's expected value.** No exceptions. Deprecate the old name with a sunset date rather than changing the number in place.

**Generate the interfaces.** The engine view, the REST route, the GraphQL schema, and the MCP tool are all functions of the contract. Hand-maintaining any of them is how they diverge.

**No raw access where a certified metric exists.** For agents especially. The tool list is the policy.

**Run the drift detector weekly and alert on regressions.** A conformant agent that starts recomputing is a tool or prompt change that needs a review.

**Publish to the catalog.** When the Apache Polaris Semantic Model API leaves beta, the released contract goes there so every engine and tool with catalog access can find it. Until then, publish to the engine's semantic layer and keep the released directory as the record.

**Certification is a release step.** The owner approves the release, and the release sets the flag.

## Where This Is Heading

Three developments will make contracts easier to enforce.

Ossie growing contract fields. The 0.2.0 draft has no grain, additivity, ownership, or certification fields, which is why this article puts them in a custom extension. The Ossie community has provenance and trust on its list, and a standard place for additivity and grain is the natural next step once the core stabilizes. When it lands, the extension collapses into the core and every Ossie consumer enforces what only contract-aware consumers enforce today.

Engines enforcing additivity. A query engine that knows a metric is recompute-only can refuse to average it, or can rewrite the average as a recompute from the grain. Semantic layers with metric-aware planners are starting to do this. It moves the contract from documentation the consumer is supposed to read into a constraint the engine applies.

MCP tool schemas as the enforcement point for agents. The pattern of generating tool schemas from contracts, with allowed dimensions as enums and additivity in the description, is becoming the standard way to give agents governed access to metrics. The 2026 MCP specification's stateless transport and discovery make it practical to serve hundreds of metric tools from a gateway, and the tool schema is where the contract meets the agent.

The underlying shift is that business logic is becoming a tested, versioned, generated artifact rather than a formula in a dashboard. That is what every other part of the software stack went through, and metrics are late to it because they lived in BI tools that were not built for code review. Agents are forcing the change, because an agent cannot attend the reconciliation meeting.

## Conclusion

Three agents gave the CFO three revenue numbers because there was no contract, only formulas, and each agent wrote its own. A metric contract specifies the expression, the grain, the allowed dimensions, the filter, the time semantics, and the additivity, in a format (Apache Ossie with a contract extension) that every consumer can read. Unit tests pin the number on a fixture, prove the additivity claims, verify the dimensions, and block changes without a version bump. Semantic versioning with deprecation-by-rename keeps consumers from breaking. A drift detector over the query log catches agents that bypass the contract. REST, GraphQL, and MCP interfaces generated from the contract make calling it easier than re-deriving it, with the MCP tool schema enforcing the dimension rules before the agent's call leaves the client.

The test suite in this article runs in under a second against DuckDB and catches the exact class of change that produced the opening scenario. That is the bar: a contract is real when a change to the number fails a build.

## Keep Going

If this piece was useful, I have written a lot more on semantic layers, metric governance, and building agent-facing data platforms. *Architecting an Apache Iceberg Lakehouse* (Manning) covers the semantic layer and governance design that contracts sit on top of. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
