---
title: "The Five Layers of an Agentic Lakehouse and Where the MCP Server Sits"
date: "2026-08-04"
description: "The five layers of an agentic lakehouse and where the MCP server sits: storage, catalog, semantic layer, MCP gateway, and agent surface, plus identity, session isolation, and budgets."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - AI Agents
  - MCP
  - Agentic Lakehouse
  - Apache Polaris
  - Apache Iceberg
canonical: "https://iceberglakehouse.com/posts/agentic-lakehouse-mcp-architecture/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/agentic-lakehouse-mcp-architecture/).

# The Five Layers of an Agentic Lakehouse and Where the MCP Server Sits

*By Alex Merced, Data Lakehouse and AI Evangelist*

Someone on your team connects an AI desktop client to a query engine, asks a question about last quarter, and gets an answer in fifteen seconds. It works. It is genuinely impressive, and the room reacts accordingly. Then somebody asks whether the sales team can have it, and the conversation stops.

The demo ran on one person's laptop, authenticated as that person's admin account, against a connection with no result limits and no audit trail. Nothing about it survives a security review or a hundred concurrent users.

The gap between that demo and a production agentic lakehouse is not the model and it is not the protocol. It is five architectural layers, each with a defined responsibility, and most of the work is in the two nobody demos.

This piece walks the layers, explains what a native MCP server does that a wrapper does not, covers the deployment topology decision that determines whether identity works, and gets specific about concurrency, session isolation, and budgeting.

A disclosure. I work for Dremio, which was acquired by SAP and now sits within SAP Business Data Cloud. Dremio ships an MCP server, and so do several other engines. I use it as one example among others and keep the architecture vendor-neutral, because every layer below is a specification or a pattern rather than a product.

## The five layers

| Layer | Responsibility | What breaks without it |
|---|---|---|
| Storage | Durable files in object storage | Nothing to query |
| Metadata and catalog | Table semantics, authorization, credential vending, asset registry | No governance, no multi-engine access |
| Semantic layer | Metrics, dimensions, joins, business rules | Plausible wrong answers |
| MCP gateway | Typed tools, identity, session isolation, budgets | No safety, no attribution, no cost control |
| Agent interface | Intent understanding, tool selection, explanation | Nobody can ask a question |

The demo in the opening implements layer one, part of layer two, and layer five. It skips three and four entirely, which is exactly why it works for one person and fails for an organization.

## Storage and table format

The bottom layer is files in object storage with Apache Iceberg providing table semantics: schema, partitioning, snapshots, statistics, and atomic commits.

Two properties matter specifically for agent workloads.

**Statistics drive pruning, and agents generate many small filtered queries.** A well-maintained table with meaningful column statistics answers those cheaply. A table with hundreds of thousands of small files pays planning cost on every one of them, and at agent query volumes that becomes the dominant expense.

**Snapshots give you reproducibility.** An agent's answer references a table state. Recording the snapshot ID alongside the answer means you can reproduce it exactly six months later, which is what an audit conversation needs.

The practical instruction is that table maintenance stops being hygiene and becomes a performance requirement. Compaction, snapshot expiration, and sort order on the columns agents filter by all pay back many times over at this volume. A table that was acceptable under a hundred queries a day is a bottleneck under ten thousand.

## Catalog

The catalog is the enforcement point, and it is the layer that determines whether the rest of the architecture is real.

Apache Polaris, which graduated to Apache Top-Level Project on February 18, 2026, provides the pieces this architecture needs. Object-level authorization through principals, principal roles, and catalog roles. Credential vending that mints short-lived, prefix-scoped storage credentials rather than handing out standing access. And a direction toward registering more than tables, with the Table Sources work aiming to cover views, functions, metrics, and models.

Three requirements for agentic use specifically.

**Per-request authorization against the real requester.** The agent's identity, or better the end user's identity propagated through the agent, determines what is reachable. A deployment where everything arrives as one service account has an audit trail that names the server.

**Short-lived credentials.** A consumer that queries continuously without human review is exactly the case where standing bucket access is wrong.

**Discovery filtered by identity.** An agent should not learn that a restricted table or metric exists. Filtering at discovery is cheaper and safer than rejecting at execution.

One honest boundary. Polaris RBAC operates at object level and does not natively filter rows or mask columns, with a feature request open since 2024. Value-dependent rules live in views or in an external policy engine such as Open Policy Agent, which Polaris supports integrating with.

## Semantic layer

This is the layer teams skip and the one that determines answer quality.

Without it, an agent reads column names and infers business meaning. Revenue becomes whatever column is named amount, cancelled orders get included because nothing said otherwise, and the join path is whatever looked plausible.

With it, the agent reads metric definitions with their calculations, filters, grain, and valid dimensions, then requests one by name. Query construction happens server-side from a validated definition.

Apache Ossie is the emerging open format here. It is a specification plus converters rather than an installable product, defining vendor-neutral YAML for metrics, dimensions, relationships, and broader business concepts so BI tools, engines, and agents consume and produce definitions without loss of meaning. It began as Open Semantic Interchange in November 2025, entered the Apache Incubator under the new name, and has a coalition past 50 organizations with converters merged for dbt Semantic Layer and Apache Polaris.

Product implementations sit underneath the format. Dremio's semantic layer, dbt's metrics, Cube, Snowflake Semantic Views, and others all do the work. The format is what keeps the definitions portable across them.

## The MCP gateway

The fourth layer is where the demo and the production system diverge most sharply.

An MCP server exposes tools, resources, and prompts over a standard protocol. What separates a production gateway from a connection wrapper is what it does around each call.

**Tool design.** Discovery and description tools so the agent can read definitions before choosing. Parameterized execution tools with typed, bounded inputs. No arbitrary SQL tool, because that discards every guarantee the layers below provide.

**Identity translation.** The gateway receives a request carrying an end-user identity and authenticates to the catalog as that principal, not as itself. This is the single most consequential implementation detail in the layer.

**Session isolation.** Each conversation gets its own execution context, its own budget accounting, and no shared mutable state with any other session. Two users asking about different regions must not be able to influence each other's results or exhaust each other's limits.

**Budget enforcement.** Tool call caps, token accounting, result size limits, and concurrency caps per principal, enforced at the gateway rather than hoped for in the engine.

**Telemetry.** Every call logged with principal, tool, parameters, generated query, row count, duration, and outcome. Written to an Iceberg table so the observability layer uses the same platform as everything else.

A native MCP server, meaning one built by the engine vendor against the engine's own internals, differs from a generic database wrapper in ways that matter. It exposes the engine's semantic objects rather than raw tables. It plans queries through the engine's optimizer with the engine's pushdown rather than assembling SQL strings. It participates in the engine's authorization and session model rather than sitting outside it. Dremio's MCP server and ClickHouse's are both in this category, and the distinction is worth checking before adopting any server: ask whether it understands your semantic objects or only your tables.

## Transport and topology

This decision determines whether identity works, and teams make it by accident.

MCP supports local transport over standard input and output, and remote transport over HTTP with server-sent events or streaming.

**Local stdio** runs the server as a subprocess of the client on the user's machine. Configuration is a file, credentials are the user's own, and there is no shared infrastructure. This is what makes demos easy.

It also means every user runs their own server, credentials live in local configuration, there is no central telemetry, updates require every user to act, and budget enforcement is per machine. For a data platform serving an organization, that is not a deployment model.

**Remote HTTP** runs the server as a service. One deployment, central configuration, central telemetry, budgets enforced globally, and identity handled through your existing OAuth flow.

Local configuration for a desktop client looks like this.

```json
{
  "mcpServers": {
    "lakehouse": {
      "command": "uvx",
      "args": ["dremio-mcp-server", "run"],
      "env": {
        "DREMIO_URI": "https://lakehouse.internal.acme.com",
        "DREMIO_PAT": "${DREMIO_PAT}"
      }
    }
  }
}
```

Note what that carries: a personal access token in the user's environment. It works, it is fine for evaluation, and it is the thing to move away from.

The remote form points at a service and delegates authentication.

```json
{
  "mcpServers": {
    "lakehouse": {
      "type": "http",
      "url": "https://mcp.internal.acme.com/lakehouse/mcp",
      "authorization": {
        "type": "oauth2",
        "issuer": "https://sso.internal.acme.com"
      }
    }
  }
}
```

The user authenticates through your identity provider. The gateway receives a token identifying them, exchanges it for a catalog principal, and every query runs as that person with their grants and their short-lived vended credentials.

Run local stdio for a two-week evaluation. Plan the remote deployment before that evaluation ends, because the migration is not a configuration change once people have built habits around personal tokens.

## Session isolation and concurrency

Two properties that teams discover under load rather than in design.

**Session isolation** means each conversation carries its own context, budget counter, and query scope. The failure to watch for is shared connection pools where one session's long-running query blocks another's, and shared caches keyed without the principal, which is a data leak rather than a performance problem.

Key every cache entry by principal as well as by query shape. A metric result cached without the identity that produced it will be served to someone whose row filters differ.

**Concurrency** is where the workload shape bites. Agent traffic is many small concurrent queries rather than few large sequential ones. That pattern exhausts connection pools and slot limits at volumes that never troubled human analytics.

Four limits belong at the gateway.

Concurrent queries per principal, so one runaway session cannot saturate the engine.

Concurrent queries globally for the agent workload as a class, so agents cannot degrade the dashboards and pipelines sharing the same engine. This one is important and frequently omitted: agentic traffic and scheduled reporting compete for the same resources, and the reporting has an SLA.

Queue depth with a fast rejection when exceeded, since an agent waiting ninety seconds for a slot will time out and retry, doubling the load.

Tool calls per session, which bounds a non-converging loop.

Set all four before the pilot rather than after the incident, and pick numbers you can defend rather than numbers that feel generous.

## What the gateway actually exposes

Making the tool surface concrete is worth the space, because this is the design decision with the longest tail.

```json
{
  "tools": [
    {
      "name": "list_semantic_objects",
      "description": "List governed metrics and views this user may query, with a one-line summary of each.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "domain": { "type": "string" },
          "search": { "type": "string" }
        }
      }
    },
    {
      "name": "describe_semantic_object",
      "description": "Return the full definition of one metric or view: calculation, filters, grain, valid and invalid dimensions, owner, version, and data freshness.",
      "inputSchema": {
        "type": "object",
        "properties": { "name": { "type": "string" } },
        "required": ["name"]
      }
    },
    {
      "name": "query_semantic_object",
      "description": "Execute a governed query. The server builds SQL from the stored definition. Returns at most 1000 rows.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "name":       { "type": "string" },
          "dimensions": { "type": "array", "items": { "type": "string" }, "maxItems": 6 },
          "filters":    { "type": "array", "items": { "type": "object" }, "maxItems": 10 },
          "grain":      { "type": "string", "enum": ["day", "week", "month", "quarter", "year"] },
          "order_by":   { "type": "string" },
          "limit":      { "type": "integer", "minimum": 1, "maximum": 1000 }
        },
        "required": ["name"]
      }
    },
    {
      "name": "list_dimension_values",
      "description": "Enumerate the distinct values of a dimension, with cardinality. Use before filtering on an unfamiliar dimension.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "dimension": { "type": "string" },
          "limit":     { "type": "integer", "maximum": 200 }
        },
        "required": ["dimension"]
      }
    }
  ]
}
```

Four tools. That is close to the right number for most deployments, and the restraint is deliberate.

`maxItems` on dimensions and filters bounds query complexity at the protocol boundary. Six dimensions is already a wide result, and a request for fifteen is a sign the agent is exploring rather than answering.

`list_dimension_values` is the tool teams omit, and its absence is what pushes agents toward wanting raw SQL. Most exploratory questions are really "what values exist here," and answering that cheaply removes the pressure for an escape hatch.

The `describe_semantic_object` response returning data freshness matters more than it looks. An agent that knows the underlying table was last updated eleven hours ago writes a materially better answer than one that assumes currency, and an auditor reading the transcript later sees what the agent knew.

Notice the total absence of anything that accepts SQL, a table name, or a join specification. The agent's vocabulary is the set of objects your semantic layer defines. That constraint is the architecture.

## Watching it in production

The telemetry table is the artifact that makes the deployment operable. Log every tool call, not every conversation.

```sql
CREATE TABLE ops.agents.tool_calls (
    call_id           STRING,
    session_id        STRING,
    principal         STRING,
    surface           STRING,
    tool_name         STRING,
    parameters        VARIANT,
    semantic_object   STRING,
    generated_sql     STRING,
    snapshot_id       BIGINT,
    rows_returned     BIGINT,
    engine_ms         BIGINT,
    queue_ms          BIGINT,
    outcome           STRING,
    error_class       STRING,
    called_at         TIMESTAMP
)
USING iceberg
PARTITIONED BY (days(called_at))
TBLPROPERTIES ('format-version' = '3');
```

`generated_sql` is the field that answers the question people actually ask, which is what did it run. Storing it turns a wrong answer from an investigation into a query.

`snapshot_id` records the table state the answer came from. Combined with Iceberg time travel, that gives exact reproducibility of any past answer.

`queue_ms` separated from `engine_ms` tells you whether latency complaints are a capacity problem or a query problem, and those have different fixes.

Three checks worth running daily off that table.

Rejected calls by reason. A rising count of dimension permission rejections means the role model does not match how people work. A rising count of schema validation rejections means the agent is reasoning toward requests outside your bounds, which is worth understanding before you widen the bounds.

Tool call distribution per session. Sessions with many calls and no successful query are non-converging loops, and they are your top cost line.

Queries per semantic object. Objects nobody queries are maintenance debt. Objects queried constantly deserve a materialization or a cache.

## Sharing an engine with everything else

The point that ends pilots when it is missed: the agentic workload does not run in isolation.

The same engine serves scheduled reporting, transformation jobs, and interactive dashboards. Those workloads have SLAs and owners. Agent traffic is bursty, unpredictable in volume, and generated by people who are not thinking about capacity.

Three isolation mechanisms, in increasing order of separation.

**Workload queues or resource groups within one engine.** Agent traffic gets its own queue with a capped share of resources. Cheapest to operate, and it depends on your engine supporting meaningful isolation rather than nominal priorities.

**A separate compute cluster reading the same tables.** The lakehouse's storage and compute separation is what makes this cheap. Agents get their own compute against the same Iceberg tables through the same catalog, and a runaway agent workload cannot touch the reporting cluster. This is the sensible default.

**A separate engine entirely.** Warranted when the query shape differs so much that a different engine genuinely fits better. It costs a second system to operate and a second set of semantic definitions to keep aligned, so the bar should be high.

Whichever you pick, decide it before the pilot expands. Retrofitting isolation after a reporting SLA has been missed is a conversation that starts from a deficit.

The architectural point underneath is one of the better arguments for the lakehouse shape generally. Adding a compute cluster for a new workload against existing tables is a configuration exercise, not a data migration. In a coupled warehouse, the same isolation requirement means buying more of the same thing and hoping the scheduler is fair.

## Failure modes

**The `run_sql` escape hatch.** Someone adds it because a legitimate case needs flexibility. Every guarantee from layers two and three disappears, because the agent will prefer it. If arbitrary SQL is genuinely needed, put it behind a separate server with its own restricted identity and audit stream.

**Shared service identity.** The gateway authenticates to the catalog as itself. Authorization becomes uniform across all users, the audit log names the gateway, and chargeback is impossible.

**Caches keyed without principal.** A correctness and confidentiality bug that looks like a performance optimization.

**No global agent concurrency cap.** Agent traffic starves the scheduled workloads sharing the engine, and the first sign is a missed reporting SLA that nobody connects to the AI project.

**Unbounded result sizes.** A query returning a hundred thousand rows into a model context is expensive and useless. Hard maximum in the input schema.

**Tool descriptions treated as documentation.** The model selects tools by reading descriptions. Vague descriptions produce wrong tool selection that no backend correctness fixes. Treat them as production code and test them against realistic questions.

**Prompt injection through data.** Field content becomes model context. A row containing instruction-shaped text influences behavior. Constrain what returns to the model and never treat retrieved content as instructions.

**Small files under agent load.** Planning cost multiplied by query volume. Compaction is a cost and latency control at this layer.

**Local stdio deployment that quietly becomes production.** Forty people with personal access tokens in local config files, no central telemetry, and no way to revoke access except rotating each token one at a time.

**Version drift across local servers.** Every user runs whatever version they installed. A fix you shipped last month is running on a third of the machines, and reproducing a reported problem requires asking which version they have.

## Identity, end to end

Worth tracing the whole path once, because this is the detail that separates an architecture diagram from a working system.

A user authenticates to the agent client through your identity provider and receives a token.

The client presents that token to the MCP gateway. The gateway validates it against the issuer and extracts the subject.

The gateway maps the subject to a catalog principal. This mapping is the piece to design deliberately: a direct one-to-one map keeps things simple, and a mapping through group membership scales better in an organization where people join and leave teams.

The gateway authenticates to the catalog as that principal, using a token exchange rather than a stored credential per user. It requests table or view metadata with access delegation enabled.

The catalog checks the principal's grants, and if authorized, mints a short-lived credential scoped to that object's storage prefix and returns it with the metadata.

The engine reads files using the vended credential, applies any row filters or column masks attached to the identity, and returns a bounded result.

The gateway logs the call with the principal, the object, the generated SQL, and the snapshot ID.

Two properties fall out of that chain and both are worth stating to a security reviewer.

Revoking a grant takes effect within one credential lifetime, with no key rotation and no restart. That is a property permanent credentials can never provide.

The storage access log traces to a person rather than to a service. When someone asks who read a table last Tuesday, the answer comes from the log rather than from correlation.

Test the chain by breaking it. Point the gateway at the catalog with a principal that has no grants and confirm the read fails cleanly. Strip storage permissions from the engine's own compute identity and confirm reads still work through vending. Both tests take an hour and both catch deployments where the security model is nominal.


## Rolling it out

Build the layers bottom up, and resist the pull to start at the top because the top is what demos.

**Weeks one to two: the table layer.** Identify the tables agents will query. Compact them, set sort orders on the columns that filter, and confirm statistics are meaningful. This is unglamorous and it determines your latency and cost floor.

**Weeks two to four: the catalog.** Move to a REST catalog if you have not. Build the role model against real organizational structure. Turn on credential vending and verify by pointing an engine with no storage permissions at a table and confirming the read works.

**Weeks three to six: the semantic layer.** Write definitions for the twenty questions people actually ask, sourced from query history rather than from a modeling exercise. Test them in CI against a fixture dataset. Coverage of real demand beats completeness.

**Weeks five to eight: the gateway.** Deploy remote with OAuth, identity translation to catalog principals, session isolation, the four concurrency limits, and telemetry into an Iceberg table. Run it against the semantic layer only.

**Weeks seven onward: the agent surface.** Connect clients. Start with a small group who will report problems rather than route around them.

The sequencing point is that each layer makes the one above it possible. A gateway on top of no semantic layer produces confident wrong answers. A semantic layer on top of an ungoverned catalog produces correct answers to people who should not see them. A catalog on top of unmaintained tables produces correct, governed answers slowly and expensively.

Two practices throughout. Instrument from day one, because a baseline collected after the surprise is not a baseline. And give the agent a way to say it does not know, since a server that names the gap when no metric covers a question produces both a better experience and a prioritized backlog.

## Where this goes

Catalog-registered semantics is the structural change to watch. Once metrics live in the catalog next to tables, discovery and authorization use one mechanism for both, and the Ossie-to-Polaris converter is the first concrete piece.

Standardization on the gateway's responsibilities is missing. MCP standardized how an agent reaches a system. There is no equivalent standard for what a data-serving gateway should guarantee about identity propagation, budgets, or telemetry, and those are exactly the properties that deserve one.

Agent-to-agent composition raises the stakes on every layer. When one agent's output becomes another's input, an inconsistency compounds silently instead of surfacing to a human. Shared definitions and shared telemetry stop being optional at that point.

## Conclusion

The demo works because it skips two layers. Production requires all five: maintained Iceberg tables, a catalog that authorizes per request and vends short-lived credentials, a semantic layer that turns questions into validated definitions rather than guessed SQL, a gateway that translates identity and enforces budgets, and an agent surface on top.

Build the layers bottom up. Deploy the gateway remotely with real identity rather than locally with personal tokens. Cap results, cap concurrency globally as well as per principal, key caches by principal, and hold the line on the arbitrary SQL tool.

Then instrument everything into a table, because the questions that arrive in month two are about cost and about why one answer was wrong, and both are queries against data you either collected or did not.

The layer nobody demos is the one that decides whether this reaches the sales team.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and the agentic layers on top of it. *Architecting an Apache Iceberg Lakehouse* covers the storage and table design underneath this stack, and *Apache Polaris: The Definitive Guide* covers the catalog and identity model the gateway depends on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
