---
title: "Apache Ossie and Apache Polaris: Putting Semantic Models in the Open Catalog"
date: "2026-08-25"
description: "Apache Ossie and Polaris put metric definitions in the open catalog. What the spec covers, what Polaris stores, and what is still unfinished."
author: "Alex Merced"
category: "Semantic Layer"
canonical: https://iceberglakehouse.com/posts/apache-ossie-polaris-semantic-models/
tags:
  - Apache Ossie
  - Apache Polaris
  - semantic layer
  - metrics
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/apache-ossie-polaris-semantic-models/).

Ask four systems in the same company what "monthly active users" means and you get four answers. The BI tool counts distinct user IDs with at least one session in the calendar month. The product analytics platform counts users with at least one qualifying event in a trailing 30-day window. The finance model counts billable seats that logged in. The AI agent someone stood up last quarter asked the warehouse for "active users" and got whatever the first table with that column name returned. Every one of those definitions is defensible. Every one of them lives in a different tool, in a different format, and none of them can be read by the others.

That is the fragmentation problem semantic layers exist to solve, and for a decade the solution has been to pick one vendor's semantic layer and re-implement everything else against it. The metric definitions became a moat. The moment you wanted a second BI tool or a new agent framework, you re-typed the definitions, and they drifted.

Two things changed in the summer of 2026. Apache Ossie (incubating), the project formerly known as Open Semantic Interchange, entered the Apache Incubator on July 10 with a vendor-neutral YAML and JSON specification for semantic models and more than 50 organizations behind it. And Apache Polaris, the open Iceberg REST catalog, accepted a Semantic Model API that stores Ossie documents as first-class catalog entities next to the tables they describe. The pieces are early, the consumption story is still being argued on the dev list, and the spec is still in draft. But the direction is clear: a metric gets defined once, in an open format, stored in the catalog, and read by every engine, BI tool, and agent that asks the catalog for it.

This article covers what Ossie standardizes and what it deliberately leaves out, how the specification is structured, what the Polaris Semantic Model API does and does not do as of mid-August, the unresolved design questions on the dev list, and how a team should prepare. I work at Dremio, which builds a semantic layer on top of Iceberg and Polaris, so I have a stake in this. I have tried to represent the debate fairly, including the parts that are inconvenient for the "it's done" narrative.

## Why Metric Logic Ends Up Trapped

Semantic layers grew up inside BI tools because that is where the need first appeared. A dashboard needs to know that "revenue" is `SUM(amount)` on the orders table, filtered to completed status, in the customer's currency. Somebody wrote that down once in the BI tool's modeling layer so that every chart used the same formula.

The trouble is that the BI tool's modeling layer is proprietary. Tableau's calculations, Power BI's DAX, Looker's LookML, MicroStrategy's schema, and dbt's semantic layer each express the same idea in an incompatible format. A company with three of those tools has three copies of "revenue," maintained by three teams, and a quarterly reconciliation meeting when the numbers disagree.

AI agents made the problem worse in a specific way. An agent asked "what was revenue last quarter" has no modeling layer to consult unless someone built one for it. If the agent generates SQL from the raw schema, it re-derives the definition every time, and it re-derives it slightly differently each time. Text-to-SQL grounded in a semantic model is dramatically more accurate than text-to-SQL grounded in a schema, but only if there is a semantic model the agent can read, and the agent frameworks do not speak LookML or DAX.

So the demand shifted. The question stopped being "which semantic layer should we buy" and became "how do we move definitions between semantic layers without loss." That is an interchange format problem, and interchange formats need to be open and vendor-neutral or nobody adopts them, because no vendor will cede control of its semantic layer to a competitor's format.

## What Apache Ossie Is

Ossie started as the Open Semantic Interchange initiative in late 2025, founded by Snowflake, dbt Labs, Salesforce, and a group of BI and data platform vendors, with the stated goal of a single specification that any tool can read and write. In mid-2026 the community submitted it to the Apache Incubator, and it was accepted on July 10, 2026 under the new name Apache Ossie. The rename avoids collision with the two other well-known OSI acronyms (the Open Source Initiative and the Open Systems Interconnection model). The spec, the repositories, and the contributors carried over unchanged. The mentors are Jean-Baptiste Onofré, Zili Chen, Russell Spitzer, and Holden Karau, which tells you the project is closely tied to the Polaris and Iceberg communities from the start.

The specification is a document format. It defines how to describe a semantic model as YAML or JSON: what datasets exist, what fields they have, how the datasets relate, what metrics are computed over them, and what context an AI tool needs to use them well. Version 0.1.1 is the latest released spec. Version 0.2.0 is in draft as of August, with the schema explicitly marked as subject to change before release.

Three properties define what Ossie is and is not.

Ossie is not a runtime. It does not execute queries, resolve metrics, or sit in the query path. The comparison the community uses is Protocol Buffers: a `.proto` file defines a schema that compiles to language-specific code, and an Ossie file defines meaning that compiles to platform-specific semantic layers. A converter reads an Ossie document and emits a dbt semantic model, a Snowflake semantic view, a Tableau data source, or a set of Dremio views. The converters are where the work is, and the repository already includes several.

Ossie is expression-carrying, not expression-defining. A metric's formula is stored as an expression in a named SQL dialect (ANSI SQL, Snowflake, Databricks, BigQuery, MDX, Tableau calculations, and GoodData's MAQL are the enumerated dialects in the current draft). A single metric can carry the same formula in several dialects. Ossie does not define a portable expression language of its own. That is a deliberate scoping choice: a portable expression language is a multi-year project, and the interchange problem is urgent now. The consequence is that a metric written only in Snowflake SQL is not automatically usable by an engine that does not speak Snowflake SQL, and the converter has to translate or reject it.

Ossie standardizes definitions, not trust. The core spec has no fields for lineage, freshness, confidence, ownership, or provenance. A metric definition travels between tools, but "is this the certified definition, who owns it, and when was it last validated" does not. Several commentators have flagged this as the spec's biggest gap for enterprise adoption, and it is on the community's list, but it is not in 0.2.0.

## The Specification, Walked Through

The best way to understand Ossie is to read a model. Here is one in the 0.2.0 draft format, describing a sales domain with two datasets, one relationship, and two metrics:

```yaml
version: 0.2.0.dev0
semantic_model:
  - name: sales_analytics
    description: Orders and customers for revenue reporting
    ai_context:
      instructions: "Use this model for revenue, order volume, and customer counts."
      examples:
        - "What was total revenue last quarter?"
        - "How many customers ordered in July?"

    datasets:
      - name: orders
        source: lake.sales.orders
        primary_key: [order_id]
        description: One row per order
        fields:
          - name: order_id
            expression:
              dialects:
                - dialect: ANSI_SQL
                  expression: order_id
            datatype: String
          - name: customer_id
            expression:
              dialects:
                - dialect: ANSI_SQL
                  expression: customer_id
            datatype: String
          - name: order_date
            expression:
              dialects:
                - dialect: ANSI_SQL
                  expression: order_date
            datatype: Date
            dimension:
              is_time: true
          - name: status
            expression:
              dialects:
                - dialect: ANSI_SQL
                  expression: status
            datatype: String
            dimension: {}
          - name: amount
            expression:
              dialects:
                - dialect: ANSI_SQL
                  expression: amount
            datatype: Decimal

      - name: customers
        source: lake.sales.customers
        primary_key: [id]
        fields:
          - name: id
            expression:
              dialects:
                - dialect: ANSI_SQL
                  expression: id
            datatype: String
          - name: segment
            expression:
              dialects:
                - dialect: ANSI_SQL
                  expression: segment
            datatype: String
            dimension: {}

    relationships:
      - name: orders_to_customers
        from: orders
        to: customers
        from_columns: [customer_id]
        to_columns: [id]

    metrics:
      - name: total_revenue
        description: Sum of completed order amounts
        expression:
          dialects:
            - dialect: ANSI_SQL
              expression: SUM(CASE WHEN orders.status = 'completed' THEN orders.amount ELSE 0 END)
        datatype: Decimal
        ai_context:
          synonyms: ["revenue", "sales", "total sales"]
      - name: ordering_customers
        description: Distinct customers with at least one order
        expression:
          dialects:
            - dialect: ANSI_SQL
              expression: COUNT(DISTINCT orders.customer_id)
        datatype: Integer
        ai_context:
          synonyms: ["active customers", "buyers"]

    custom_extensions:
      - vendor_name: DREMIO
        data: '{"reflection_hint": "aggregate", "space": "sales"}'
```

The structure has six building blocks.

The semantic model is the container: a name, a description, optional AI context, and the lists that follow. A file can hold several models.

Datasets are logical tables. Each has a `source` (the physical table or view it maps to, expressed in the target platform's naming), a primary key (simple or composite), optional unique keys, and fields. The `source` is the seam between the semantic layer and the physical catalog, and it is where Polaris integration becomes interesting, because a source like `lake.sales.orders` is an Iceberg table identifier.

Fields are columns or column-level expressions. Each has an expression carried in one or more dialects, a `datatype` from a small portable vocabulary (String, Integer, Decimal, Float, Boolean, Date, Time, DateTime, DateTimeTz, and Opaque for anything outside it), and optionally a `dimension` object that marks the field as groupable and filterable, with `is_time: true` for time dimensions. The draft is careful about the difference between a field's data type (what it is) and its role (how it is used), which is a distinction earlier semantic layer formats blurred.

Relationships are foreign keys between datasets, with `from_columns` and `to_columns` supporting composite keys. They are what lets a consumer join `orders` to `customers` without guessing, and they are the single most valuable thing for an agent to have, because join re-derivation is where text-to-SQL goes wrong most often.

Metrics are aggregate expressions over fields, again in named dialects, with a data type and AI context. A metric can reference fields across datasets through the declared relationships.

Custom extensions are vendor-specific escape hatches. Each carries a vendor name and an opaque data blob. A converter for that vendor reads its extension. Every other converter ignores it. This is how Snowflake stores a warehouse hint and how dbt stores a project path without those leaking into the core schema.

The `ai_context` field deserves its own note. It can be a string or a structured object with `instructions`, `synonyms`, and `examples`. It appears at the model level, on fields, and on metrics. This is the part of the spec that exists specifically because agents are consumers: a synonym list tells an agent that "sales" means `total_revenue`, and an examples list gives it sample questions the model is meant to answer. No prior semantic layer format had this as a first-class element.

## What Polaris Adds: The Semantic Model API

A specification for semantic models solves the format problem. It does not solve the discovery problem: where does a tool go to find the model for `lake.sales.orders`? The answer the Polaris community reached is that the model should live where the table lives, in the catalog.

On May 29, 2026, Yufei Gu and Jean-Baptiste Onofré opened a `[DISCUSS] Semantic Layer Support in Apache Polaris` thread proposing semantic models as a first-class Polaris entity type using the OSI (now Ossie) specification. The proposal was scoped carefully: a new `SEMANTIC_MODEL` entity, CRUD endpoints, schema validation against the Ossie spec, and authorization through Polaris's existing RBAC. Polaris stays a metadata service under the proposal: it stores and vends semantic models and never executes metrics or semantic queries.

The discussion ran through June with participation from Adam Christian, Adnan Hemani, Dmitri Bourlatchkov, Alexandre Dutra, Romain Manni-Bucau, Anand Kumar Sankaran, and others. On June 29, Yufei called a vote on PR #4816, which adds the REST API surface and specification with an intentionally minimal implementation. The vote carried in early July, and the PR merged. A follow-up, PR #4961, added the durable `SEMANTIC_MODEL` entity and JDBC-backed persistence, and it has also merged.

Here is what the API looks like as merged. The endpoints live under the Polaris-specific path prefix, not the Iceberg REST catalog path, which signals that they are a Polaris extension rather than an Iceberg spec feature:

```
POST   /polaris/v1/{prefix}/namespaces/{namespace}/semantic-models
GET    /polaris/v1/{prefix}/namespaces/{namespace}/semantic-models
GET    /polaris/v1/{prefix}/namespaces/{namespace}/semantic-models/{name}
POST   /polaris/v1/{prefix}/namespaces/{namespace}/semantic-models/{name}
DELETE /polaris/v1/{prefix}/namespaces/{namespace}/semantic-models/{name}
```

The operations are `createSemanticModel`, `listSemanticModels`, `loadSemanticModel`, `updateSemanticModel`, and `dropSemanticModel`. A semantic model is scoped to a namespace, like a table or view. Its name follows the same character rules as other Polaris entities. Every create, load, and update response returns an opaque `entity-version` string, and an update must supply the version the client last read, so concurrent edits are caught the same way concurrent Iceberg commits are.

The feature is off by default. It is gated by the `ENABLE_SEMANTIC_MODELS` feature configuration, and with the flag off every endpoint returns 501 Not Implemented. The Polaris documentation labels the feature beta. The code lives in a separate `extensions/semantic-models` module, which follows the modular design principle Robert Stupp, Dmitri Bourlatchkov, and others argued for in a parallel June thread on keeping new features out of the core.

The request body for create and update wraps the document like this:

```json
{
  "name": "sales_analytics",
  "document": {
    "version": "0.1.1",
    "semantic_model": "{\"name\":\"sales_analytics\",\"datasets\":[...],\"metrics\":[...]}"
  }
}
```

That `semantic_model` field is a string containing the serialized Ossie JSON, with the Ossie spec version alongside it. Which brings us to the argument that is still running.

## The Payload Debate

On July 8, at JB's suggestion, Yufei opened a dedicated `[DISCUSS] Semantic Model REST API payload representation` thread to settle how the document should be represented on the wire. He laid out three options: a raw string, an opaque JSON document, or the full Ossie structure modeled directly in the Polaris REST specification.

His position was that option three couples the Polaris API to every Ossie schema change, and since Ossie is versioned and expected to evolve, that means regenerating clients and potentially breaking applications on every spec bump. He preferred option one, a raw string, because it is format-agnostic: it lets Polaris store a Markdown-based format like Google's Open Knowledge Format alongside Ossie JSON without an API change. Option two, opaque JSON, was acceptable if the community wanted to optimize for JSON.

Dmitri Bourlatchkov raised the idea of an envelope (a format field, a version field, and a payload) and Yufei pushed back on July 22 that an envelope with a string payload is option one with extra steps, and an envelope with a JSON payload only works for JSON formats anyway. On August 14, Dmitri came around to JSON payloads following the Ossie structure for the v1 API, with other formats deferred to future revisions, and asked whether Ossie's JSON carries its own spec version. It does. On August 17 he concluded that Ossie's own version field is sufficient and Polaris does not need an envelope.

That is where the representation question stood as I wrote this, and it is close to settled: Ossie JSON, versioned by Ossie's own field, with the string-wrapped form in the merged PR likely to give way to direct JSON.

The harder question came from Robert Stupp on August 17, and it is not about representation. His point is that the endpoints exist and the persistence exists, but Polaris does not yet provide a path by which any of the advertised consumers (an AI agent, a BI catalog, a second query engine) discovers the right model and uses it. A client that already knows the catalog, namespace, model name, and format can store and retrieve a document. That is, in his words, storage plumbing for a low-level document registry. The response during the June discussion was that discovery and consumption are orthogonal and can evolve independently. He does not think that resolves it: the intended consumer determines whether raw Ossie JSON or something else is the right contract, and it affects identity, versioning, validation, and indexing decisions that are now merged and hard to change.

He also raised a persistence concern. The current implementation stores the entire serialized document as a string in the entity's generic properties map. An Ossie document for a real domain is not a small metadata value, and a properties bag is not designed to hold one. And he argued that "beta" overstates the maturity: beta implies a usable end-to-end workflow that is rough, and what exists is a registry with no defined consumer flow. His suggested label is "experimental semantic-model document registry."

I think he is right on the substance and the community will land somewhere between his position and the current state. The endpoints are useful today for a team that controls both the publisher and the consumer. They are not yet a product feature that a BI tool or agent framework can integrate against without custom integration work. That is normal for a beta-flagged extension in a catalog that graduated to a top-level project six months ago, and it is worth knowing before you build on it.

## Converters and the Ecosystem Around the Spec

A format is only as useful as the tools that read and write it, and this is where Ossie's origins matter. The founding members were vendors with existing semantic layers, and the first deliverables were converters between those layers and the spec.

The `apache/ossie` repository holds the core specification, the JSON schema used for validation, and a set of converters. Snowflake contributed conversion to and from its Semantic Views and has tied Semantic View Autopilot and Horizon Context to the format. dbt Labs contributed conversion for dbt semantic models, which is how the `custom_extensions` entry with `vendor_name: DBT` and a project path came to be in the spec's own example. Kyvos announced support for its semantic layer in July. The BI vendors in the founding group are at various stages of import and export support, and the community lists more converters as an active area.

The converter pattern has a specific consequence for how you should think about the spec. Ossie is the hub of a hub-and-spoke graph. Every tool needs one converter (to and from Ossie) instead of one per peer. A company with four semantic-layer-bearing tools needs four converters rather than twelve pairwise ones, and adding a fifth tool costs one more. That is the same economic argument that made Apache Iceberg the hub for table formats and Apache Arrow the hub for in-memory data, and it is the reason vendors who compete on the semantic layer agreed to a shared format: the interchange cost was hurting all of them.

What the converters cannot do is translate expressions between dialects. A converter from Snowflake to dbt copies the `SNOWFLAKE` dialect expression and, if there is no `ANSI_SQL` or `DATABRICKS` form present, either leaves the metric unexecutable on the target or flags it. Expression translation is a separate, harder problem that transpilers like SQLGlot address, and a production converter pipeline typically chains a transpiler in front of the converter to populate the missing dialects. The spec's multi-dialect expression object is what makes that chaining possible: a transpiler adds a dialect entry without touching the rest of the document.

Polaris fits into this graph as the place the hub document lives. A converter that reads from Polaris and writes to a BI tool, or reads from dbt and writes to Polaris, is a few dozen lines around the API calls shown above. The value of storing the document in the catalog rather than in a Git repository alone is that consumers with catalog access find it by the same namespace path they use for tables, with the same credentials, under the same RBAC. That is the discovery story the dev list wants formalized, and it is why the integration matters even in its current registry form.

## How Ossie Compares to Existing Semantic Formats

Ossie is not the first attempt at a semantic model format. Here is how it sits against the ones it is meant to interchange with:

| | Apache Ossie | dbt semantic models | LookML | Snowflake Semantic Views | Cube / headless BI |
|---|---|---|---|---|---|
| Governance | ASF incubator, vendor-neutral | dbt Labs (open source) | Google (proprietary) | Snowflake (proprietary) | Cube (open core) |
| Format | YAML and JSON, JSON Schema validated | YAML | LookML DSL | SQL DDL | YAML and JavaScript |
| Runtime | None (build-time artifact) | dbt Semantic Layer service | Looker | Snowflake | Cube server |
| Expression language | Multi-dialect SQL, carried not defined | dbt SQL with Jinja | Looker expressions and SQL | Snowflake SQL | SQL and Cube expressions |
| Relationships | First-class, composite keys | Entities and joins | Explores and joins | Relationships | Joins |
| AI context | First-class (`ai_context`: instructions, synonyms, examples) | Descriptions | Descriptions | Semantic view descriptions and synonyms | Descriptions |
| Extensibility | `custom_extensions` by vendor name | Meta fields | Extensions | Comments and properties | Meta |
| Catalog integration | Polaris Semantic Model API (beta) | Via dbt Cloud | Looker catalog | Horizon | Cube catalog |
| Intended role | Interchange hub | Definition and execution | Definition and execution | Definition and execution | Definition and execution |

The last row is the important one. Every other entry in the table is a place where definitions are both written and executed. Ossie is only a place where definitions are written, in a form the others can import. That is why it can coexist with all of them rather than compete: a team keeps LookML for Looker and dbt semantic models for dbt, and uses Ossie as the format they exchange through and store in the catalog. The day Ossie has a query specification and engines execute it natively, that changes, and the last row becomes a competitive question. Today it is not.

## An End-to-End Flow, As It Works Today

Robert Stupp's request was for one concrete flow written down and validated. Here is the one a team can run now against Polaris with `ENABLE_SEMANTIC_MODELS=true`, with the parts Polaris does and the parts the surrounding tools do made explicit. It is the flow I expect the community to formalize, with the caveat that the payload shape will likely change from string-wrapped to direct JSON.

**Publish.** A data team owns `sales_analytics.yaml` in Git, next to the dbt project or the engine views that define the physical tables. On merge, a CI job converts YAML to JSON and creates or updates the model in Polaris under the `sales` namespace, supplying the entity version from the last read so a concurrent edit fails rather than overwriting:

```python
import json, yaml, requests

POLARIS = "https://polaris.example.com"
PREFIX = "lake"
NS = "sales"
TOKEN = get_polaris_token(client_id, client_secret, scope="PRINCIPAL_ROLE:ALL")
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

doc = yaml.safe_load(open("semantic/sales_analytics.yaml"))
model = doc["semantic_model"][0]
body = {
    "name": model["name"],
    "document": {
        "version": doc["version"],
        "semantic_model": json.dumps(model),
    },
}

url = f"{POLARIS}/polaris/v1/{PREFIX}/namespaces/{NS}/semantic-models"
existing = requests.get(f"{url}/{model['name']}", headers=H)

if existing.status_code == 404:
    r = requests.post(url, headers=H, json=body)
else:
    body["entity-version"] = existing.json()["entity-version"]
    r = requests.post(f"{url}/{model['name']}", headers=H, json=body)

r.raise_for_status()
print("published", model["name"], "version", r.json()["entity-version"])
```

**Authorize.** The publisher principal needs write privileges on semantic models in the namespace, and consumers need read. The privileges follow the pattern of the existing table and view privileges and are granted to catalog roles the same way, through the management API or a `setup apply` file. A consumer with read on the semantic model but no read on the underlying tables can see the definitions and cannot run them, which is the right default for a BI catalog that indexes metrics without executing anything.

**Discover.** A consumer lists the semantic models in a namespace and loads the one it needs. Today, "which one" is by name, which is the discovery gap. A BI tool that indexes every model in every namespace it can read gets a metric catalog. An agent that is handed a namespace by its configuration loads the models there. Nothing yet lets a consumer ask "which model covers `lake.sales.orders`" without loading models and inspecting their `source` fields, which is the query Polaris will eventually need to answer directly.

**Consume.** The consumer converts the Ossie document into its own semantic layer. For a query engine that is a set of views and metric definitions. Here is a minimal converter that turns the two metrics in the example model into Dremio views, with the relationship resolved into a join:

```python
def ossie_to_dremio_views(model: dict, space: str) -> list[str]:
    """
    Emit one Dremio view per dataset and one aggregate view per metric.
    Uses the ANSI_SQL dialect only. Rejects models that lack it.
    """
    def ansi(expr_obj):
        for d in expr_obj["dialects"]:
            if d["dialect"] == "ANSI_SQL":
                return d["expression"]
        raise ValueError("no ANSI_SQL dialect present")

    ds = {d["name"]: d for d in model["datasets"]}
    rels = {(r["from"], r["to"]): r for r in model.get("relationships", [])}
    out = []

    for name, d in ds.items():
        cols = ", ".join(f'{ansi(f["expression"])} AS "{f["name"]}"' for f in d["fields"])
        out.append(f'CREATE OR REPLACE VIEW {space}."{name}" AS SELECT {cols} FROM {d["source"]}')

    for m in model.get("metrics", []):
        expr = ansi(m["expression"])
        referenced = sorted({t for t in ds if f"{t}." in expr})
        base = referenced[0]
        joins = ""
        for other in referenced[1:]:
            r = rels.get((base, other)) or rels.get((other, base))
            if not r:
                raise ValueError(f"no relationship between {base} and {other}")
            on = " AND ".join(
                f'{r["from"]}."{a}" = {r["to"]}."{b}"'
                for a, b in zip(r["from_columns"], r["to_columns"])
            )
            joins += f' JOIN {space}."{other}" AS {other} ON {on}'
        dims = [
            f'{t}."{f["name"]}"'
            for t in referenced
            for f in ds[t]["fields"]
            if "dimension" in f
        ]
        group = ", ".join(dims)
        select = ", ".join(dims + [f'{expr} AS "{m["name"]}"'])
        out.append(
            f'CREATE OR REPLACE VIEW {space}."metric_{m["name"]}" AS '
            f'SELECT {select} FROM {space}."{base}" AS {base}{joins} GROUP BY {group}'
        )
    return out

for stmt in ossie_to_dremio_views(model, space="semantic.sales"):
    print(stmt + ";")
```

For the example model, that emits a view per dataset with the field expressions applied, and a `metric_total_revenue` view that groups by every dimension in the referenced datasets and computes the metric expression. A production converter does more (handles multiple dialects, respects `is_time` for date grains, applies the custom extension's reflection hint), but the shape is the point: the Ossie document has enough structure to generate the engine's semantic layer without human interpretation.

For an agent, the consumer is an MCP server that loads the model, exposes `total_revenue` and `ordering_customers` as tools with the `ai_context` synonyms and examples in their descriptions, and translates a tool call into a query against the generated views. The agent never sees a raw table.

The division of responsibility across the flow, which is what the dev list asked for, looks like this:

| Step | Polaris | Ossie | Publisher (dbt, CI, engine) | Consumer (engine, BI, agent) |
|---|---|---|---|---|
| Define the model | | Format and validation rules | Writes and owns the YAML | |
| Store and version | Entity, RBAC, entity-version concurrency | | Calls the API on merge | |
| Validate | Schema validation against the Ossie version | Spec defines what valid means | | |
| Discover | List by namespace (today), by source table (needed) | | | Lists and loads |
| Translate | | Dialect enumeration | | Converter to native semantic layer |
| Execute | Never | Never | | Runs the generated views or tools |
| Govern access | Read and write privileges on the model entity | | | Enforces row and column policy on execution |

## Failure Modes and Warning Signs

**Dialect mismatch.** A model authored against Snowflake carries `SNOWFLAKE` dialect expressions only. A consumer that needs `ANSI_SQL` or `DATABRICKS` finds none and either fails or, worse, guesses. The converter above raises. Many will not. The sign is metrics that silently disappear from one consumer's catalog. Author every metric in `ANSI_SQL` plus the native dialect, and have CI reject models missing the ANSI form.

**Source names that do not resolve.** A dataset's `source` is a string in the target platform's naming. `sales.public.orders` resolves in Snowflake and means nothing to Dremio, where the same table is `lake.sales.orders`. When a model moves between platforms, sources need remapping, and nothing in Ossie 0.2.0 declares which naming convention a source uses. The sign is converters emitting views over tables that do not exist. Store a source mapping alongside the model, or wait for the catalog integration to make sources Polaris identifiers.

**Version drift between publisher and Polaris validation.** The publisher writes a 0.2.0.dev0 document. Polaris validates against the versions it knows. A field added in the draft fails validation on a Polaris that only knows 0.1.1. The sign is 400 errors on publish after a spec upgrade. Pin the Ossie version in CI to what your Polaris release validates, and upgrade them together.

**Concurrent edits from two publishers.** Two teams own metrics in the same model and both push. The second gets an entity-version conflict. That is correct behavior and it is also a workflow problem, because the second team now has to rebase. Split models by ownership rather than by domain if two teams need to publish independently.

**Trust missing from the document.** A consumer loads a model and cannot tell whether it is the certified finance definition or an analyst's experiment, because Ossie has no certification, ownership, or freshness fields. The sign is a dashboard built on the wrong revenue metric. Until the spec adds provenance, encode it in a custom extension with a vendor name your organization owns, and have consumers filter on it.

**Large documents in the properties map.** Per Robert Stupp's concern, a document for a wide domain stored as a string in the entity properties can hit size limits or slow entity operations. The sign is create or update calls that time out or fail on size for large models. Keep models scoped to a domain rather than an enterprise, and watch this thread for the persistence redesign.

**Reading the beta label as production readiness.** The feature flag is off by default for a reason. A team that builds an agent platform on the current endpoints should expect the payload shape and possibly the entity model to change before the extension leaves beta, and should isolate the Polaris calls behind an adapter so the change is one file.

## Operational Guidance

**Start authoring in Ossie now, regardless of Polaris.** The format is the durable piece. A team that writes its metric definitions as Ossie YAML in Git today has a portable asset whether it publishes to Polaris, converts to dbt, or loads into a BI tool. The converters exist. Waiting for the catalog integration to stabilize before writing models is backwards.

**One model per domain, one owner per model.** The entity-version concurrency model rewards clear ownership. A model that five teams edit is a model that five teams conflict on.

**Author every expression in ANSI SQL first.** Add native dialects as needed. ANSI is the lowest common denominator every converter can consume, and it is what an agent-facing MCP server should translate from.

**Fill in `ai_context` on every metric.** Synonyms and examples are the difference between an agent that maps "sales" to `total_revenue` and one that guesses. This is the cheapest high-impact field in the spec.

**Put certification in a custom extension.** Until the core spec carries provenance, define an extension with your organization's vendor name that records owner, certification status, and last validation date. Make consumers filter on it.

**Enable the Polaris extension in a non-production realm first.** Set `ENABLE_SEMANTIC_MODELS=true` in a dev realm, publish a model, load it, and write the converter for your primary consumer. That exercise tells you what the discovery gap costs you before you commit.

**Grant model read separately from table read.** A BI catalog or agent registry that only indexes metrics should hold semantic model read and nothing else. Execution privileges come from the engine and its policies.

**Write the converter for your second consumer too.** A model that only one tool reads is a definition file with extra steps. The interchange value appears when the same document feeds the engine views and the agent's tool descriptions, and the second converter is where dialect gaps and source-name mismatches surface. Build both before declaring the model production.

**Track the dev list.** The payload representation thread and the persistence redesign are the two decisions that determine what changes between now and the extension leaving beta. Both are public, and both are close to resolution.

## Where This Is Heading

Three developments will turn the registry into the workflow Robert Stupp asked for.

Discovery by source. The obvious next endpoint is "which semantic models reference this table," which lets an engine loading `lake.sales.orders` also load the metrics defined over it, and lets an agent given a table name find its business meaning. Because Ossie's `source` field is a string, this needs either a Polaris-side index over parsed sources or a spec change that lets a source be a catalog identifier. Either is tractable, and the Ossie community lists Polaris integration for catalog-based discovery as an active area.

A semantic query specification. The Ossie roadmap includes a standardized way to ask "give me `total_revenue` by `segment` for last quarter" that any engine can accept. That is the piece that lets a consumer skip the converter entirely and hand the query to an engine that natively understands Ossie models. Dremio, DataFusion-based engines, and the warehouses all have an incentive to implement it, because it makes their engine the execution target for every Ossie-authored model.

Trust and lineage in the spec. Ownership, certification, and freshness are the fields enterprises ask for first, and their absence is the most common critique of 0.2.0. I expect them in a subsequent version, likely as a defined structure rather than ad hoc extensions.

The larger pattern is the one Polaris has followed since graduation. Credential vending made the catalog the enforcement point for reach. Policies made it the control point for maintenance. Events made it the audit source. Semantic models make it the definition source. Each of those moved something that used to live inside an engine into the layer every engine shares. The semantic layer is the last big one, and the summer of 2026 is when the open ecosystem committed to it.

## Conclusion

The same business metric defined four ways in four tools is the default state of enterprise analytics, and AI agents made the cost of that visible. Apache Ossie gives the industry a vendor-neutral YAML and JSON format for datasets, fields, relationships, metrics, and the AI context an agent needs to use them, with an escape hatch for vendor specifics and a deliberate decision not to become a runtime. Apache Polaris gives that format a home: a `SEMANTIC_MODEL` entity, five REST endpoints scoped to a namespace, entity-version concurrency, and RBAC, behind a feature flag and a beta label.

What exists today is a registry. What the community is arguing about is how the document is represented on the wire (nearly settled on direct Ossie JSON) and what the end-to-end consumer flow should be (still open, and rightly raised as a blocker for calling it beta). A team that writes its models in Ossie now, keeps every expression in ANSI SQL, fills in the AI context, and puts certification in a custom extension has the durable asset in hand and can plug it into the catalog when the discovery story lands. That is the right posture for a standard at this stage: adopt the format, watch the integration, and keep the adapter thin.

## Keep Going

If this piece was useful, I have written a lot more on semantic layers, Apache Polaris, and the catalog as the control plane of the lakehouse. *Apache Polaris: The Definitive Guide* (O'Reilly) covers the entity model, RBAC, and extension points that the Semantic Model API builds on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
