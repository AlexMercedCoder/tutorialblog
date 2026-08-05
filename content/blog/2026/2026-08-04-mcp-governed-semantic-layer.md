---
title: "Why Agentic AI Needs a Governed Semantic Layer Behind the Model Context Protocol"
date: "2026-08-04"
description: "Why agentic AI needs a governed semantic layer behind the Model Context Protocol: metric consistency, access control, Apache Ossie for portable definitions, and Apache Polaris for enforcement."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - AI Agents
  - MCP
  - Semantic Layer
  - Apache Ossie
  - Apache Polaris
canonical: "https://iceberglakehouse.com/posts/mcp-governed-semantic-layer/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/mcp-governed-semantic-layer/).

# Why Agentic AI Needs a Governed Semantic Layer Behind the Model Context Protocol

*By Alex Merced, Data Lakehouse and AI Evangelist*

An executive asks an AI assistant what revenue looked like last quarter. The assistant writes SQL against the warehouse, sums an amount column, and returns a number. The number is wrong, in the specific way that is hardest to catch: it includes cancelled orders, excludes a revenue stream that lives in a different table, and counts a currency conversion at the wrong date.

Nobody notices, because the number is plausible. It sits within a few percent of the right answer. It gets pasted into a deck, and it becomes the number everyone remembers.

This is the failure mode of naive text-to-SQL, and it does not get better with a stronger model. A model that writes syntactically perfect SQL against a schema it discovered by reading column names is guessing at business semantics that were never written down anywhere it can read.

The Model Context Protocol gives agents a standard way to reach data systems. What determines whether that access produces correct answers is what sits behind the protocol. This piece argues that the answer is a governed semantic layer, walks through what that means concretely, and covers the two open projects that have emerged to standardize it: Apache Ossie for the semantic definitions and Apache Polaris for the catalog underneath.

A disclosure. I work for Dremio, which was acquired by SAP and now sits within SAP Business Data Cloud. Dremio is one of three companies named as core developers of Apache Ossie alongside Snowflake and dbt Labs, and my colleague Jean-Baptiste Onofré championed its Apache incubation proposal. I am not neutral on this topic. What I can offer instead is the mechanics, the honest caveats, and enough detail that you can evaluate the argument yourself.

## Three ways raw text-to-SQL fails

The problem is not that models write bad SQL. Modern models write good SQL. The problem is that good SQL against an unlabeled schema answers a different question than the one asked.

**Metric inconsistency.** Revenue means net of refunds to finance, gross bookings to sales, and recognized revenue to accounting. A schema does not say which. An agent picks one, and picks a different one next Tuesday when the phrasing of the question changes slightly. Two agents asking the same question through two tools produce two numbers, and reconciling them falls to a data team working from conflicting spreadsheets. Every BI tool, query engine, and agent arrives with its own interpretation of what a metric like monthly active users means.

**Access control bypass.** Table-level permissions govern whether a query runs. They do not govern whether an agent joined a table it should not have joined, or aggregated to a grain that reveals individual records. An agent with read access to a customer table and an orders table constructs a query that exposes exactly what a row-level policy was designed to prevent, and every permission check passes.

**Silent wrongness at scale.** A human analyst who writes a bad query sees a result that looks off and investigates. An agent issuing hundreds of queries an hour has no such feedback loop. Wrong answers propagate at machine speed into dashboards, reports, and downstream automation without anyone forming a suspicion.

The third failure is what changes the architecture, and it is the one that makes this an engineering problem rather than a prompting problem. Under human-driven analytics, the analyst is the final validation step. Remove the analyst and the validation has to move somewhere else. The only place it fits is between the question and the SQL.

## What MCP is and is not

The Model Context Protocol is a specification for how AI applications connect to external systems. It defines three primitives.

**Tools** are callable functions with typed inputs and outputs. An agent invokes a tool and gets a result.

**Resources** are readable context the server exposes, addressed by URI. Documentation, schemas, and reference material fit here.

**Prompts** are reusable templates the server offers to guide interaction.

The protocol handles transport, discovery, and invocation. That is genuinely valuable, because before MCP every integration between an agent framework and a data system was custom-built.

What MCP does not do is make the data system safe to query. It is a connection standard. A poorly designed MCP server that exposes a single `run_sql` tool has changed nothing about the failure modes above except making them easier to reach. The protocol is necessary and nowhere near sufficient.

The design question is what tools the server exposes. That is where the correctness properties live.

## What a semantic layer gives an agent

A semantic layer is a definition of business meaning over physical tables. It records four things that a schema does not.

**Metrics** with their exact calculation, filters, and grain. Net revenue is a specific expression over specific columns with specific exclusions, versioned and reviewable.

**Dimensions** with their hierarchies and the joins that reach them. Customer region is reachable from an order through a defined path, not through whichever join key an agent finds plausible.

**Relationships** between entities, including cardinality and the grain each join produces. This is what stops an agent from producing a fan-out that triples a sum.

**Business rules and context** that a human analyst carries in their head. Which fiscal calendar applies, which statuses count as complete, which records are test data.

For an agent, the difference between querying a schema and querying a semantic layer is the difference between guessing and looking up. The agent asks what metrics exist, reads their definitions, selects the one that matches the question, and requests it with dimensions and filters. The SQL is generated by the semantic layer from a validated definition rather than by the model from a column name.

That inversion is the whole argument. The model does language understanding and intent mapping, which it is good at. The semantic layer does query construction, which it is correct at.

## Apache Ossie and the interchange problem

A semantic layer inside one product solves the problem for that product's consumers. It does not solve it for the organization, because the BI tool, the notebook, the agent framework, and the warehouse each carry their own definitions.

Apache Ossie exists to standardize the exchange format. It began as Open Semantic Interchange in November 2025 with 17 founding partners, was renamed to avoid confusion with the Open Source Initiative acronym, and has been accepted into the Apache Incubator. The coalition has grown past 50 organizations including Snowflake, Salesforce, Databricks, dbt Labs, Oracle, Informatica, Collibra, Qlik, and BlackRock.

The important clarification, since it trips people up: Ossie is not a semantic layer product you install. It is a specification plus converters and tooling. It is the interchange format that semantic layer products, catalogs, BI tools, and agents read and write.

The format is declarative YAML defining metrics, dimensions, and joins. Three working groups operate on Metric Language, Catalog, and Ontology. Converters already merged include Ossie to dbt Semantic Layer and an Apache Polaris converter.

The ontology scope is what makes it more than a metrics format. Ossie covers broader business knowledge across sources and tools, so an agent calculating and deciding from these definitions gets the context a human analyst carries rather than raw numbers with no meaning attached.

Governance matters here as much as the format. Under ASF incubation, Ossie operates with public mailing lists, GitHub-based development, a formal discussion-and-vote process for spec changes, and committership earned through contribution rather than employer. For a specification meant to be the neutral ground between competing vendors, that structure is the point.

Two honest caveats. Ossie is incubating, which means the specification is still moving and adoption is uneven across the coalition. And a specification does not enforce anything by itself. It gives your definitions a portable form. Enforcement is the catalog's job.

## Where the catalog fits

Apache Polaris is the enforcement layer under all of this. It graduated to Apache Top-Level Project on February 18, 2026, having been co-created with Snowflake and donated to the ASF.

The catalog contributes three things an agent architecture needs.

**Object-level authorization** through principals, principal roles, and catalog roles, applied per request. The agent's identity, not a shared service account, determines what is reachable.

**Credential vending**, which mints short-lived scoped storage credentials rather than handing an agent framework standing access to a bucket. For a consumer that queries continuously without review, short-lived per-request credentials are the correct shape.

**A registry beyond tables.** The Table Sources direction in the Polaris community aims to make the catalog a registry for every lakehouse asset, including views, functions, metrics, and models. The Ossie-to-Polaris converter is a concrete piece of that: semantic definitions expressed in the open format, registered where every engine and agent already looks.

The architectural principle is that the catalog is the one component every access path crosses. Governance placed anywhere else gets bypassed by the next tool someone connects.

## The stack, assembled

Put the layers in order and the design reads clearly.

| Layer | Responsibility | Open implementations |
|---|---|---|
| Storage | Files in object storage | S3-compatible stores |
| Table format | Table semantics over files | Apache Iceberg |
| Catalog | Object-level authorization, credential vending, asset registry | Apache Polaris |
| Semantic layer | Metrics, dimensions, joins, business rules | Apache Ossie as interchange format, product implementations underneath |
| MCP server | Typed tools an agent invokes | Engine-native MCP servers |
| Agent | Intent understanding, tool selection, response | Any MCP client |

Each boundary is a specification. That is what lets you replace any layer without rewriting the ones above and below it, and it is why this stack is worth building even while several of its pieces are young.

## Designing the MCP tools

The most consequential engineering decision in this architecture is the tool surface. Here is the shape that works.

```json
{
  "tools": [
    {
      "name": "list_metrics",
      "description": "List available governed business metrics with their definitions, grain, and permitted dimensions.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "domain": { "type": "string", "description": "Optional business domain filter, e.g. 'sales'" }
        }
      }
    },
    {
      "name": "describe_metric",
      "description": "Return the full definition of one metric: calculation, filters, grain, owner, and dimensions it can be sliced by.",
      "inputSchema": {
        "type": "object",
        "properties": { "metric": { "type": "string" } },
        "required": ["metric"]
      }
    },
    {
      "name": "query_metric",
      "description": "Execute a governed metric query. SQL is generated from the semantic definition, not supplied by the caller.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "metric":     { "type": "string" },
          "dimensions": { "type": "array", "items": { "type": "string" } },
          "filters":    { "type": "array", "items": { "type": "object" } },
          "grain":      { "type": "string", "enum": ["day", "week", "month", "quarter"] },
          "limit":      { "type": "integer", "maximum": 10000 }
        },
        "required": ["metric"]
      }
    }
  ]
}
```

Three properties of that surface do the work.

**There is no `run_sql` tool.** The agent cannot supply arbitrary SQL, so it cannot construct a join the semantic layer did not define or aggregate to a grain the model did not sanction. Query construction happens server-side from a validated definition.

**Discovery is a first-class tool.** `list_metrics` and `describe_metric` let the agent read definitions before choosing. This is what replaces guessing with looking up, and it is the tool pair teams skip when they build a minimal server.

**Inputs are constrained by schema.** Grain is an enum. Limit has a maximum. Dimensions are validated against what the metric permits. Invalid combinations are rejected at the protocol boundary rather than producing a query that runs and returns something wrong.

The corresponding semantic definition in Ossie's YAML shape looks like this.

```yaml
metrics:
  - name: net_revenue
    label: Net Revenue
    description: >
      Gross order value less refunds and cancellations, converted to USD
      at the order date rate. Excludes internal test accounts.
    calculation: SUM(orders.amount_usd) - SUM(refunds.amount_usd)
    grain: order
    filters:
      - orders.status != 'cancelled'
      - orders.account_type != 'internal_test'
    dimensions:
      - customer.region
      - customer.segment
      - product.category
      - order.date
    owner: finance-analytics
    version: 3
```

Read what that buys an agent. The description tells it what the metric means in words a model reasons over. The calculation and filters are fixed, so the cancelled-orders mistake from the opening cannot happen. The dimension list bounds what slicing is permitted. The owner makes the definition accountable to a human. The version makes changes reviewable.

## Enforcement before SQL is emitted

The security argument depends on where checks happen relative to query generation.

In a naive setup, the agent writes SQL, the engine executes it, and permissions are checked during execution. Anything the permission model does not catch runs.

In this architecture, three checks happen before SQL exists.

**Metric availability** is filtered by identity. `list_metrics` returns only what this principal is permitted to see. An agent cannot request a metric it never learned exists.

**Dimension permissions** are checked against the request. A principal without access to customer-level detail receives a rejection when requesting that dimension, not a query that runs and returns it.

**Row and column policy** is applied to the generated SQL by the semantic layer or an external policy engine. Polaris RBAC handles object-level decisions, and rules that depend on data values live in views or in a policy engine such as Open Policy Agent, which Polaris supports integrating with. Row-level and column-level access control is not native to Polaris RBAC today, and a feature request for it has been open since 2024. Building an architecture that assumes otherwise is a mistake I see regularly.

The result is a system where an agent's worst case is a rejected request rather than a wrong answer or an unauthorized result.

## A worked interaction

Tracing one question through the stack makes the argument concrete.

A user asks: how did net revenue trend by region last quarter, and which region fell behind.

**Step one.** The agent calls `list_metrics` with domain `sales`. The server checks the caller's principal against catalog roles and returns the metrics this identity is permitted to see. Suppose that includes `net_revenue`, `gross_bookings`, and `order_count`. Metrics governed by finance-only roles do not appear at all.

**Step two.** The agent calls `describe_metric` on `net_revenue`. It reads the description, sees that the metric excludes cancelled orders and internal test accounts, and sees that `customer.region` is a permitted dimension. That last check is what prevents the agent from attempting a slice the semantic layer cannot construct safely.

**Step three.** The agent calls `query_metric` with metric `net_revenue`, dimensions `["customer.region"]`, grain `quarter`, and a date filter. The server validates the request against the definition, checks dimension permissions for this principal, generates SQL from the stored calculation, applies any row policy attached to the identity, and executes.

**Step four.** The server returns a small typed result: region, quarter, value. Row count is bounded by the limit. Nothing about the physical schema, the join path, or the underlying table names reaches the model.

**Step five.** The agent does what models are good at. It compares values across regions and quarters, identifies the region with the largest decline, and writes an explanation in natural language.

Notice the division of labor. Every numeric fact in the answer came from a validated definition executed server-side. Every piece of language and reasoning came from the model. Neither one did the other's job.

Now trace the same question through a `run_sql` server. The model reads table names, guesses that `orders.amount` is revenue, guesses a join to a customer table, does not know that cancelled orders should be excluded, and returns a number. The number is wrong by the size of your cancellation rate. Nothing in the pipeline is capable of noticing.

That is the entire argument in one comparison.

## Handling questions the semantic layer cannot answer

The objection to this design is real: constrained tools cannot answer questions nobody anticipated, and exploratory analysis is a legitimate need.

Four responses, in the order to apply them.

**Return an explicit gap.** A server that says no governed metric covers this question, and names the closest available metrics, is more useful than one that approximates. It also generates a prioritized backlog of definitions, sourced from real demand rather than from a modeling exercise.

**Expose dimension exploration separately.** Tools that let an agent enumerate dimension values and check cardinality answer a large share of exploratory questions without arbitrary SQL. Which regions exist, how many customer segments, what date range the data covers.

**Route exploration to a different surface.** Analysts who need arbitrary SQL should have it, through a tool with their own identity and their own audit trail. What they should not have is the agent-facing server offering it as a fallback, because then every agent has it too.

**Promote successful exploration into definitions.** When an analyst's ad hoc query proves useful and gets repeated, it becomes a metric definition with an owner. This is the loop that grows semantic coverage from actual usage, and it is the part most teams never build.

The design goal is not to prevent exploration. It is to keep exploration and governed answering on separate paths with separate identities, so that a question asked in the governed path gets a governed answer or nothing.

## Cost and concurrency at the server

One practical dimension gets under-planned, and it becomes the reason pilots do not reach production.

An agent answering one business question issues several tool calls. Discovery, description, one or more queries, sometimes a follow-up after reasoning over the first result. Multiply by a user population and the query volume against your lakehouse rises by an order of magnitude over the equivalent human workload, with a very different shape: many small queries rather than a few large ones.

Four controls belong at the MCP server rather than in the engine.

Result limits with a hard maximum in the input schema, so an agent cannot request a million rows into a model context window that cannot hold them.

Per-session query budgets that cap how much a single conversation consumes. An agent stuck in an unproductive loop is a cost event, and the loop is invisible from the engine's perspective because every individual query looks reasonable.

Concurrency caps per principal, so one agent framework cannot saturate the engine and degrade every other consumer.

Caching on discovery calls. `list_metrics` and `describe_metric` return definitions that change rarely and get called constantly. Caching them removes most of the tool call volume without affecting correctness.

Instrument all four from the beginning. The question a finance team asks about agentic analytics is what it costs, and the honest answer requires the telemetry to exist before anyone asks.

## Failure modes

**The convenience escape hatch.** Someone adds a `run_sql` tool because a legitimate use case needs flexibility. Every property above disappears the moment it exists, because the agent will use it. If arbitrary SQL is genuinely required, expose it as a separate server with its own restricted identity and its own audit stream.

**Semantic coverage gaps.** An agent asked about something the semantic layer does not define has no correct path. Good servers return an explicit "no metric defines this" rather than approximating. Bad ones fall back to raw table access, which is the escape hatch by another name.

**Definitions that drift from reality.** A metric defined two years ago against a table whose semantics changed produces confidently wrong answers. Version the definitions, assign owners, and test them in CI against known-good results.

**Tool descriptions as the real interface.** The model chooses tools by reading descriptions. A vague description produces wrong tool selection, and no amount of backend correctness fixes it. Treat descriptions as production code and test them against realistic questions.

**Prompt injection through data.** Content in a table becomes context in a model's window. A row containing instruction-shaped text influences agent behavior. Constrain what returns to the model, cap result sizes, and never let retrieved content be treated as instructions.

**Cost from unbounded querying.** An agent exploring a question issues many queries. Without limits, one conversation generates a substantial compute bill. Enforce result limits, query budgets per session, and concurrency caps at the server.

**Shared service identity.** An MCP server that authenticates to the catalog as one account gives every agent the same access and produces an audit log that names the server rather than the requester. Propagate end-user identity through to the catalog, or the governance is decorative.

## Operational guidance

Start by writing definitions for your twenty most-asked questions rather than modeling the whole warehouse. Coverage of what people actually ask beats completeness, and it produces value in weeks rather than quarters.

Express definitions in a portable format from the start. Ossie exists so the definitions outlive the tool you currently use, and the converters mean you are not betting the work on one vendor. Even while the spec is incubating, structuring definitions in its shape costs nothing and preserves the option.

Test metrics in CI. A metric definition is code. Run it against a fixture dataset with known answers on every change, and fail the build on drift. This is the practice that keeps definitions trustworthy as they multiply.

Log every tool call with the principal, the metric, the dimensions, the generated SQL, and the row count. Store it as an Iceberg table. You will need it for cost attribution, for debugging wrong answers, and for the compliance conversation that arrives eventually.

Give the agent a way to say it does not know. A server that returns an explicit gap notice when no metric covers a question produces a better user experience than one that approximates, and it generates a backlog of definitions worth writing.

Review new metric definitions like schema changes, with an owner and an approval. Metric sprawl is the failure mode that follows adoption, and the answer is process rather than tooling. A registry of four hundred metrics with no owners is the same problem you started with, relocated.

## Where this goes

Three developments are worth tracking.

Ossie's progression through incubation determines whether semantic definitions become genuinely portable. Watch the Metric Language working group output and the converter ecosystem, since converters are the practical measure of whether the format is real.

Catalog-registered semantics is the structural change. Once metrics live in the catalog next to tables, discovery and authorization use one mechanism for both, and the Ossie-to-Polaris converter is the first concrete step.

Agent-to-agent composition raises the stakes on all of it. When one agent's output becomes another's input, a metric inconsistency compounds instead of surfacing. Shared definitions stop being a nicety at that point.

## Conclusion

MCP solved the connection problem. It did not solve correctness, and treating it as though it did produces agents that generate plausible wrong numbers at machine speed.

The fix is architectural rather than model-side. Put a semantic layer between the question and the SQL, so the model does intent mapping and the semantic layer does query construction. Express the definitions in a portable format so they outlive any single tool. Put authorization in the catalog, since it is the component every access path crosses. Design the MCP tool surface with discovery tools and no arbitrary SQL escape hatch.

Do that and the failure mode changes from a wrong answer nobody catches to a rejected request somebody reads. That is a much better place to be.

The part that takes discipline is resisting the escape hatch. Every architecture in this piece survives exactly as long as nobody adds a tool that lets an agent write its own SQL against the warehouse. Hold that line and the rest of the design does its job.

## Keep Going

If this piece was useful, I have written a lot more on catalogs, semantic layers, and agentic data architecture. *Apache Polaris: The Definitive Guide* covers the catalog and governance layer this design depends on, and *Architecting an Apache Iceberg Lakehouse* covers the platform underneath. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
