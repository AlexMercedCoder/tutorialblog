---
title: "Wiring an AI Agent to Apache Polaris with the Model Context Protocol"
date: "2026-07-28"
description: "The catalog is the right attachment point for AI agents working against a lakehouse. Here's how to wire the official Polaris MCP Server and add the read path it deliberately leaves out."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - MCP
  - AI Agents
  - Apache Polaris
canonical: "https://iceberglakehouse.com/posts/mcp-apache-polaris/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/mcp-apache-polaris/).

# Wiring an AI Agent to Apache Polaris with the Model Context Protocol

An engineer opens Cursor, types "what tables do we have in the sales namespace, and which ones have a customer_id column," and gets an answer in four seconds. No Slack message to the data team. No hunting through a wiki page last updated in 2023.

Getting to that four seconds requires a plumbing decision most teams get wrong on the first try. The tempting approach is to hand the agent database credentials and a SQL client. That works in a demo and fails in production, because credentials do not expire, permissions do not follow the user, and nobody can reconstruct afterward what the agent actually touched.

The better attachment point is the catalog. A catalog already knows what tables exist, what their schemas are, who is allowed to read them, and how to hand out short-lived storage credentials. Every one of those is a thing an agent needs. Apache Polaris exposes all of it over REST, and the Model Context Protocol gives an agent a standard way to call REST-backed tools.

I work at Dremio, which co-created Polaris with Snowflake and ships a commercial catalog built on it, so I have an interest here. Everything below runs on the Apache project and the code in `apache/polaris-tools`, and you can verify it against those repositories.

This piece covers what MCP is, what the official Polaris MCP Server does and does not do, how to configure it against a real Polaris deployment, how the authentication model works, and how to add the read path the official server deliberately leaves out.

## What MCP is, stated plainly

The Model Context Protocol is an open standard, originally published by Anthropic, that defines how an AI application talks to external tools and data sources. Strip away the framing and it is a JSON-RPC protocol with three main concepts.

**Tools** are functions the model calls. Each one has a name, a description written in prose for the model to read, and a JSON Schema describing its parameters. When the model decides to call `list_tables` with `{"namespace": "sales"}`, the client sends a `tools/call` request and the server returns a result.

**Resources** are readable content the client fetches and puts into context. A schema document, a data dictionary, a table's properties.

**Prompts** are reusable templates the server offers the client.

Most data-related MCP servers use tools almost exclusively, so tools are the concept to focus on.

The transport is usually stdin and stdout for local servers, or HTTP with server-sent events for remote ones. Local stdio is the simplest thing that works. The client launches the server as a subprocess and speaks JSON-RPC over the pipes.

What MCP is not: it is not an authorization system, it is not a query engine, and it is not a semantic layer. It standardizes the shape of the call. Everything about who is allowed to make that call, and what happens when it lands, stays your responsibility. Teams that treat MCP as a security boundary end up with an agent holding an admin token, which is the outcome the protocol was never designed to prevent.

The value of the standard is narrow and real. Before MCP, every AI client had its own plugin format. Writing one integration for Claude, another for Cursor, and a third for an internal agent framework was three implementations of the same logic. Now the catalog team writes one server and every MCP-capable client uses it.

## Why the catalog is the right attachment point

An agent working against a lakehouse needs four things before it produces a useful answer.

It needs to know what exists. Namespaces, tables, views. Without that, the model guesses table names, and a model guessing table names produces confident SQL against `customers` when your table is `dim_customer_current`.

It needs schemas. Column names, types, nullability, partition specification. A model with the schema writes SQL that parses. A model without it writes SQL that fails and then retries with a different guess, burning tokens on a search problem you already solved.

It needs to know what it is allowed to see. An agent acting for a support engineer should not surface a salary column, and the enforcement has to happen somewhere other than the model's judgment.

It needs credentials to actually read data, scoped tightly and expiring quickly.

A catalog holds all four. Polaris implements the Iceberg REST Catalog specification, which covers the first two directly, and adds role-based access control, catalog federation, and credential vending on top. Polaris was donated to the Apache Software Foundation in August 2024, incubated for eighteen months with contributions from Google, Microsoft, Confluent, and others, and graduated to a Top-Level Project in February 2026.

Compare the alternatives. Attaching an agent to a query engine gets you execution but leaves discovery weak, since engines expose whatever their information schema happens to carry. Attaching it to a documentation site gets you prose that drifts from reality within a quarter. Attaching it to the catalog gets you the state the tables are actually in, because the catalog is the thing engines consult before every query.

One more property matters for multi-engine shops. A single Polaris instance serves as a catalog of catalogs, managing internal catalogs it owns directly alongside external catalogs synced from AWS Glue, Hive Metastore, or other Iceberg REST endpoints. An agent attached to that instance sees the whole estate through one interface, rather than needing a separate integration per storage system.

## What the Apache Polaris MCP Server actually does

The Polaris project ships an official MCP server in the `apache/polaris-tools` repository under `mcp-server`. It is a Python implementation built on FastMCP, and it wraps the Polaris REST APIs so MCP-compatible clients can issue structured requests over JSON-RPC on stdin and stdout.

Read the tool list carefully, because it tells you what the maintainers decided this server is for:

- `polaris-iceberg-table-request` for table operations: list, get, create, update, delete
- `polaris-namespace-request` for namespaces: list, get, create, exists, get-properties, delete
- `polaris-policy-request` for policies: list, get, create, update, delete, attach, detach, applicable
- `polaris-catalog-request` for catalogs: list, get, create, update, delete
- `polaris-principal-request` for principals: list, get, create, update, delete, rotate, reset, list-roles, assign-role, revoke-role
- `polaris-principal-role-request` for principal roles, including list-assignees, list-catalog-roles, assign-catalog-role, revoke-catalog-role
- `polaris-catalog-role-request` for catalog roles, including list-grants, add-grant, revoke-grant

That is a catalog administration surface. It manages metadata, identities, roles, grants, and policies. It does not run queries. There is no tool here that returns rows from a table.

I want to state that clearly because a lot of writing about MCP and Iceberg blurs it. If you install the official Polaris MCP Server expecting an agent that answers analytical questions, you have installed the wrong thing. What you have installed is an agent that manages your catalog.

That design choice is defensible. Query execution belongs to a query engine, and pushing it into a catalog server duplicates work the engines already do well. The gap is real, and I cover how to fill it in a later section.

Each tool returns both a human-readable transcript of the HTTP exchange and structured metadata under `result.meta`. The transcript matters more than it sounds. When an agent does something surprising, you have the actual request and response in the conversation, which turns debugging from guesswork into reading.

Here is how the attachment points compare in practice.

| Attachment point | Discovery | Schema quality | Access control | Credential lifetime | Query execution |
|---|---|---|---|---|---|
| Catalog MCP server | Complete, from catalog state | Authoritative | Catalog RBAC | Short-lived, vended | None |
| Query engine MCP server | Whatever the engine exposes | Good, plus semantic layer | Engine security model | Engine session | Full |
| Direct database credentials | Information schema only | Raw column names | Database grants, static | Indefinite | Full |
| Documentation site or wiki | Whatever was written down | Drifts within a quarter | None | N/A | None |

Most production setups end up using the first two together. The catalog server handles discovery and administration. The engine server handles execution. They share one principal, which keeps the audit trail coherent.

## Standing it up

Prerequisites are Python 3.10 or later and `uv` version 0.9.7 or later. From the `mcp-server` directory:

```bash
# Install runtime dependencies
uv sync

# Start the server on stdio transport
uv run polaris-mcp

# Install dev dependencies and run the test suite
uv sync --all-extras
uv run pytest
```

Configuration comes from environment variables, from a `.polaris_mcp.env` file in the tool root, or from a file named by `POLARIS_CONFIG_FILE`. Shell environment variables take precedence over the file when both are present.

A minimal config file for a local Polaris:

```bash
# .polaris_mcp.env
POLARIS_BASE_URL=https://polaris.internal.example.com/
POLARIS_CLIENT_ID=agent-readonly
POLARIS_CLIENT_SECRET=<from your secret manager>
POLARIS_TOKEN_SCOPE=PRINCIPAL_ROLE:agent_reader
POLARIS_HTTP_TIMEOUT_SECONDS=30.0
POLARIS_HTTP_RETRIES_TOTAL=3
POLARIS_HTTP_RETRIES_BACKOFF_FACTOR=0.5
POLARIS_TOKEN_REFRESH_BUFFER_SECONDS=60.0
```

Registering it with a desktop client looks like this:

```json
{
  "mcpServers": {
    "polaris": {
      "command": "uv",
      "args": [
        "--directory",
        "/path/to/polaris-tools/mcp-server",
        "run",
        "polaris-mcp"
      ],
      "env": {
        "POLARIS_CONFIG_FILE": "/path/to/polaris-tools/mcp-server/.polaris_mcp.env"
      }
    }
  }
}
```

The `--directory` argument points at a local checkout. Pulling `polaris-mcp` from PyPI removes the need for it.

For testing without wiring up a full client, the repository includes a client script. Interactive mode over stdio:

```bash
uv run int_test/client.py polaris_mcp/server.py
```

Non-interactive, calling one tool directly:

```bash
uv run int_test/client.py polaris_mcp/server.py \
  --tool polaris-catalog-request \
  --args '{"operation": "list"}'
```

Creating a catalog through the same path shows the shape of a write operation:

```bash
uv run int_test/client.py polaris_mcp/server.py \
  --tool polaris-catalog-request \
  --args '{
    "operation": "create",
    "body": {
      "catalog": {
        "name": "quickstart_catalog",
        "type": "INTERNAL",
        "readOnly": false,
        "properties": {
          "default-base-location": "s3://bucket123"
        },
        "storageConfigInfo": {
          "storageType": "S3",
          "allowedLocations": ["s3://bucket123"],
          "endpoint": "http://localhost:9000",
          "pathStyleAccess": true
        }
      }
    }
  }'
```

Run that script against a scratch Polaris before you point any agent at production. Watching the raw JSON-RPC exchange for ten minutes teaches you more about what the agent sees than any amount of documentation.

## The authentication model, and why it carries the weight

This section matters more than the installation steps, because it is where most deployments go wrong.

The server supports two authentication paths. A static bearer token via `POLARIS_API_TOKEN`, `POLARIS_BEARER_TOKEN`, or `POLARIS_TOKEN`, which overrides everything else when supplied. Or OAuth client credentials via `POLARIS_CLIENT_ID` and `POLARIS_CLIENT_SECRET`, with an optional `POLARIS_TOKEN_SCOPE` and a `POLARIS_TOKEN_URL` that defaults to `${POLARIS_BASE_URL}api/catalog/v1/oauth/tokens`.

Use the OAuth path. When OAuth variables are supplied, the server acquires and refreshes tokens through the client credentials flow automatically, refreshing when the remaining lifetime drops below `POLARIS_TOKEN_REFRESH_BUFFER_SECONDS`. A static bearer token sitting in a config file on a laptop is a credential with no expiry and no revocation story.

Polaris supports realms, and the MCP server handles per-realm credentials through `POLARIS_REALM_{realm}_CLIENT_ID` and its siblings for secret, scope, and token URL. The realm context header name defaults to `Polaris-Realm` and is configurable.

One behavior deserves attention because it is a security property rather than a convenience. Realm-specific variables override global settings for that realm. If realm-specific credentials are provided but incomplete, the server does not fall back to global credentials for that realm. That refusal to fall back is correct design. A partial realm configuration silently borrowing a broader credential is exactly how an agent scoped to a development realm ends up authenticated against production.

The principal you configure here determines everything the agent can do. Polaris grants flow from principals to principal roles to catalog roles to grants on catalogs, namespaces, and tables. Create a dedicated principal for the agent. Give it a principal role. Give that role exactly the catalog roles the use case needs and nothing else.

For a discovery agent, that means read grants on namespaces and tables and no grants on principals, principal roles, or catalog roles. An agent that has `polaris-principal-request` available and no permission to use it returns a clean authorization error. An agent that has permission to create principals has permission to create itself a better principal.

Do not skip this reasoning because the tool list looks harmless. `polaris-catalog-role-request` includes `add-grant`. A model with that capability and a persuasive user in front of it is a privilege escalation path with a natural language interface.

## Adding the read path

The official server manages metadata. Getting analytical answers takes one more piece.

There are two sound designs, and the choice depends on who the agent serves.

**Design one: point the agent at a query engine's own MCP server.** Most engines that care about agentic access now ship one. The engine handles SQL parsing, optimization, and execution, and it enforces its own security model. Dremio ships an MCP Server that works this way against its AI Semantic Layer. Other engines have equivalents. This is the right answer when an engine already sits in your stack, because you inherit its optimizer and its governance rather than reimplementing both.

**Design two: build a narrow read-only server with PyIceberg.** This suits teams whose agents ask metadata-shaped questions and occasional small aggregates, and who do not want an engine dependency in the loop.

Here is a working skeleton for the second design:

```python
import json
from mcp.server.fastmcp import FastMCP
from pyiceberg.catalog import load_catalog

mcp = FastMCP("polaris-read")

catalog = load_catalog(
    "polaris",
    **{
        "type": "rest",
        "uri": "https://polaris.internal.example.com/api/catalog",
        "credential": "agent-readonly:<secret>",
        "scope": "PRINCIPAL_ROLE:agent_reader",
        "warehouse": "analytics",
    },
)


@mcp.tool()
def list_tables(namespace: str) -> str:
    """List every Iceberg table in a namespace.

    Use this first when the user names a subject area but not a table.
    Returns fully qualified table identifiers, one per line.
    """
    identifiers = catalog.list_tables(namespace)
    return "\n".join(".".join(i) for i in identifiers)


@mcp.tool()
def describe_table(namespace: str, table: str) -> str:
    """Return the schema, partition spec, and row count for one table.

    Call this before writing any SQL against a table. Column names in
    this lakehouse do not follow a predictable convention, so guessing
    them fails.
    """
    tbl = catalog.load_table(f"{namespace}.{table}")
    snapshot = tbl.current_snapshot()
    return json.dumps(
        {
            "schema": str(tbl.schema()),
            "partition_spec": str(tbl.spec()),
            "sort_order": str(tbl.sort_order()),
            "record_count": snapshot.summary.get("total-records") if snapshot else 0,
            "properties": dict(tbl.properties),
        },
        indent=2,
    )


@mcp.tool()
def sample_rows(namespace: str, table: str, limit: int = 20) -> str:
    """Return a small sample of rows so the model sees real value formats.

    Hard capped at 100 rows. For anything larger, write SQL and run it
    through the query engine instead.
    """
    limit = min(limit, 100)
    tbl = catalog.load_table(f"{namespace}.{table}")
    scanned = tbl.scan(limit=limit).to_arrow()
    return scanned.to_pandas().to_string()


if __name__ == "__main__":
    mcp.run()
```

Several details in that code are deliberate.

The `credential` and `scope` values give PyIceberg the same OAuth client credentials flow the official server uses, against the same principal. One identity, one set of grants, one audit trail. Polaris enforces the grants, so `list_tables` returns only what this principal is allowed to see. The agent does not filter results. The catalog does.

The docstrings are the tool descriptions the model reads, and they are the most under-appreciated part of an MCP server. "List tables in a namespace" is a worse description than one that tells the model when to call it and what shape the answer takes. The line about column names not following a predictable convention exists to stop the model from skipping `describe_table` and guessing.

The hard cap in `sample_rows` is a guardrail against a model asking for a million rows to "check the data." Caps belong in code, not in prompt instructions, because prompt instructions are advisory and code is not.

## Writing tool descriptions the model actually uses

The model picks tools by reading descriptions. This makes tool description writing a real engineering task with a feedback loop, and most teams treat it as an afterthought.

Three rules that hold up.

**Say when to call it, not just what it does.** A description that reads "Returns table schema" tells the model what happens after the call. A description that reads "Call this before writing any SQL against a table" tells the model when to make the call. The second one changes behavior.

**Name the failure the tool prevents.** Models respond to stated consequences. "Column names in this lakehouse do not follow a predictable convention, so guessing them fails" produces more `describe_table` calls than any amount of emphasis on how useful the schema is.

**Keep the parameter schema tight.** A tool taking a free-form `query` string gives the model infinite room to be creative. A tool taking `namespace` and `table` as separate required strings constrains it to well-formed calls. Every degree of freedom in a parameter schema is a degree of freedom in the failure modes.

Business context belongs in descriptions too, and this is where a semantic layer earns its keep. A tool that returns raw column names gives the model `amt_usd_net_adj`. A tool that returns the semantic layer's description of that column gives it "net revenue in USD after adjustments, excludes tax." The second one produces correct SQL on the first attempt.

If your catalog holds semantic assets alongside tables, surface them through the same tool. Polaris stores Iceberg SQL views and generic tables, so a description enriched from view definitions and table properties costs you nothing extra at query time.

## Credential vending, and why agents make it matter more

Credential vending is the feature that turns a catalog from a metadata service into a security boundary, and its importance goes up sharply when the client is an agent rather than a person.

The mechanism works like this. A client asks Polaris to load a table. Polaris checks the principal's grants, and if the read is allowed, the response includes both the table metadata and a set of temporary storage credentials scoped to that table's location. The client uses those credentials to read data files directly from object storage. The credentials expire on a short timer.

Three properties fall out of that design.

**The engine never holds long-lived storage keys.** A Spark cluster, a Trino coordinator, or a Python process reading through PyIceberg gets credentials good for one table for a short window. Compromising the compute layer yields a credential that expires before most attackers finish looking around.

**Permission decisions happen in one place.** The catalog decides. Every engine inherits the same answer, so a grant revoked in Polaris takes effect across Spark, Flink, Trino, and every agent without touching any of them.

**The scope is per table and per location, not per bucket.** The vended credential permits access to the paths that table occupies. An agent that talks its way into reading a table it should not see still cannot walk the rest of the bucket.

For human users, these properties are good hygiene. For agents, they are load-bearing. A human with an over-broad credential mostly does not exercise it, because a human has an intent and stops when the intent is satisfied. An agent exploring a problem space calls whatever it has access to, because exploration is the strategy. The blast radius of an over-permissioned agent is the full extent of what the credential allows, not the subset a careful person touches.

This is the concrete argument for putting an agent behind a catalog rather than giving it a connection string. A connection string is a permanent, broadly scoped credential with no per-object decision point. Vended credentials are temporary, narrowly scoped, and re-authorized on every table load.

One practical note. Credential vending needs the storage configuration on the catalog to be correct, including the allowed locations list. A catalog configured with a broad allowed location like `s3://bucket123` vends credentials scoped to that whole prefix, which gives back much of what the design was meant to prevent. Set allowed locations to the narrowest prefix each catalog actually needs.

## What a session actually looks like

Reading a real tool-call sequence teaches more than architecture prose. Here is a typical exchange, with the agent's reasoning in between.

The user asks: "Which tables in the sales namespace track order status, and what values does the status column take?"

**Call one.** The agent calls `list_tables` with `{"namespace": "sales"}`. It gets back eleven table identifiers. Three have names suggesting orders. The agent has no way to know which one is current from the names alone, which is why the next step matters.

**Calls two through four.** The agent calls `describe_table` on all three candidates. One returns a schema with no status column and a record count of zero, which is a deprecated table nobody dropped. One has a `status_cd` column typed as string. One has `order_status` typed as string plus a comment carried in the table properties.

**Call five.** The agent calls `sample_rows` on the table with the comment, limit 20. It gets back twenty rows showing four distinct status values.

The agent answers, naming the table, the column, and the four observed values, with a caveat that a twenty-row sample does not prove the full domain.

Two things in that trace deserve attention.

The zero-row deprecated table is the kind of thing that wrecks agent accuracy, and no amount of model quality fixes it. The agent made the right call by checking record counts. It got lucky that the deprecated table was empty rather than stale. A stale table with plausible data produces a confident wrong answer, and the only defense is catalog hygiene. Drop what you deprecate.

The caveat about sample size came from the model reasoning about its own evidence, and it came out right here. Do not count on that. If knowing the true domain of a column matters, give the agent a tool that computes distinct values through the query engine rather than hoping it infers the limitation from a sample.

The cost of this exchange is five tool calls, four of which are catalog reads. On a busy catalog with many concurrent agents, that multiplies. Which brings up the capacity question.

## Federating external catalogs into the agent's view

Most enterprises do not have one catalog. They have Glue in one account, a Hive Metastore left over from a Hadoop era nobody has finished decommissioning, and a newer Iceberg REST catalog somebody stood up for a specific team. An agent that only sees one of those answers questions about a fraction of the estate, and the user has no way to tell which fraction.

Polaris addresses this with catalog federation. A single instance manages internal catalogs, meaning tables Polaris owns directly, alongside external catalogs synced from AWS Glue, Hive Metastore, or other Iceberg REST endpoints. Tables from an external catalog are read-only in Polaris, which is the correct default when another system owns the writes.

For agent work, federation does two useful things.

It gives the agent one endpoint. Without it, you register three MCP servers, and the model has to reason about which one holds the table it wants. Models handle that badly. They pick the server they used most recently rather than the one that fits, and the failure looks like a hallucinated table name.

It gives you one place to reason about permissions. Grants on federated tables live in the same principal-to-role-to-grant model as everything else, so the audit question "what can this agent see" has one answer rather than three partial ones.

The setup work is real. Each external catalog needs a connection configuration and credentials Polaris can use to sync. Sync cadence is a tradeoff, since a schema change in Glue does not appear to the agent until the next sync, and an agent working from stale metadata writes SQL against columns that no longer exist. Set the cadence based on how fast the source catalog actually changes, and check that number rather than assuming it.

One design note for the agent side. When you federate, table identifiers get longer and the namespace tree gets deeper. A `list_tables` call that returned eleven identifiers against a single catalog returns four hundred against a federated view. That is exactly the situation where an agent starts calling `describe_table` in a loop. Add a search-shaped tool that takes a substring and returns matching identifiers, and describe it as the right first call when the user names a subject area rather than a table.

## The human approval question

Every team that gets an agent working against a catalog hits the same next question. Do you let it write?

The honest answer is that read and write need different architectures, not a different setting.

Read operations are idempotent and cheap to get wrong. An agent that lists the wrong namespace wastes four seconds. Write operations are neither. An agent that drops the wrong table costs a restore from backup, assuming you have one, and the recovery window lasts until someone notices.

Three patterns work, in increasing order of safety.

**Grant-level separation.** The read agent's principal has no write grants. Full stop. A separate principal with write grants exists for a separate agent that runs under different conditions. This is the baseline and it is not optional.

**Proposal instead of execution.** The write agent produces the operation it wants to perform, formatted as a request body, and returns it rather than sending it. A human reviews and executes. This gives you the model's speed on the hard part, which is figuring out the right change, and keeps the irreversible step in human hands.

**Staged execution against a branch.** For table data rather than catalog metadata, Iceberg branches give you a natural staging area. The agent writes to a branch, a validation job runs against it, and a merge happens on success. The agent never touches the branch readers use.

What does not work is instructing the model to ask before writing. It complies most of the time, which is worse than complying none of the time, because it builds trust that the exception then violates.

Policy gives you a fourth lever worth watching. The Polaris policy framework, exposed through the MCP server's `applicable` operation, lets an agent query which policies govern an object before acting on it. An agent that reads applicable policy and declines when the policy forbids the action is not a security control on its own, since a model that reads a policy can also ignore it. As a defense-in-depth layer on top of grants that actually enforce, it adds useful signal to the audit trail. You get a record of the agent having seen the policy, which matters when reconstructing what happened.

## Failure modes

**The agent gets an admin principal because setup was easier that way.** Somebody runs the quickstart, which uses the root credentials, and the config file never gets changed. Warning sign: `POLARIS_CLIENT_ID` in your config matches the one in the Polaris quickstart docs. Fix: create a dedicated principal per agent use case and rotate the quickstart credentials.

**Static bearer tokens leak through config files.** `POLARIS_API_TOKEN` overrides other auth when supplied, so a stale token in `.polaris_mcp.env` silently takes precedence over your carefully configured OAuth setup. Warning sign: token refresh never appears in your logs. Fix: keep static tokens out of committed files entirely and check that `.polaris_mcp.env` is in `.gitignore`.

**Incomplete realm configuration.** Realm-specific credentials that are missing a field do not fall back to global settings, so the agent fails to authenticate against that realm with an error that reads like a network problem. Warning sign: one realm works and another returns authorization failures. Fix: set all four realm variables together or none of them.

**The model calls list operations in a loop.** An agent asked about "the whole warehouse" calls `list_tables` for every namespace, then `describe_table` for every table. On a catalog with 8,000 tables this is 8,000 REST calls, and Polaris starts rate limiting or falling over. Warning sign: catalog request volume spiking during agent sessions. Fix: add a single tool that returns a compact catalog summary in one call, and describe it as the starting point for broad questions.

**Context window exhaustion from verbose tool results.** Each tool returns a human-readable transcript of the HTTP exchange. That is useful for debugging and expensive in tokens. Ten table descriptions with full property maps fill a context window fast, and the model starts forgetting what the user asked. Warning sign: agents that answer the first question well and lose the thread by the fourth. Fix: trim what your read tools return to the fields that matter, and put the full detail behind a separate tool the model calls when it needs depth.

**Write tools available in read-only use cases.** `polaris-namespace-request` includes `delete`. `polaris-iceberg-table-request` includes `drop`. A model that misreads a user asking to "clean up the old test tables" has the capability to do it. Warning sign: your agent has any write operation available and no human approval step. Fix: enforce this in Polaris grants rather than by asking the model not to. A principal without drop permission cannot drop a table regardless of what the model decides.

**Schema drift between description and reality.** Tool descriptions written six months ago describe a namespace layout that has since changed. The model follows the description and gets confused by the actual results. Warning sign: agents repeatedly calling tools with namespace names that do not exist. Fix: generate descriptions from catalog state where you can, rather than hand-writing them.

**No record of what the agent did.** Polaris logs the REST calls. Your MCP server logs the tool calls. Neither one records the prompt that produced them. Warning sign: an incident review where nobody can explain why the agent touched a table. Fix: log the tool name, arguments, principal, and timestamp from your server, and correlate on the principal against Polaris audit records.

## Operational guidance

**One principal per use case, not per user and not per organization.** Per-organization is too coarse and gives every agent the union of all permissions. Per-user creates a principal management problem that scales with headcount. Per use case, meaning one for the discovery agent, one for the pipeline agent, one for the on-call agent, hits the balance and makes the grant model readable.

**Set HTTP timeouts below your agent's patience.** The defaults are 30 seconds for connect, read, and overall. An agent waiting 30 seconds on a hung catalog call has already lost the user. Drop `POLARIS_HTTP_TIMEOUT_SECONDS` to something in the 5 to 10 range for interactive agents and keep the higher value for batch ones.

**Retry configuration interacts badly with agent retries.** The server retries three times with a 0.5 backoff factor by default. The agent framework on top of it retries too. Three server retries inside three agent retries is nine calls for one logical operation. Set `POLARIS_HTTP_RETRIES_TOTAL` to 1 or 2 when your agent framework already retries.

**Test with the client script in CI.** The non-interactive client mode runs one tool with fixed arguments and returns a result, which makes it a usable integration test. Assert that `polaris-catalog-request` with `{"operation": "list"}` returns the catalogs you expect, and that a write operation returns an authorization failure for your read-only principal. That second test is the one that catches a grant drifting open.

**Watch token refresh.** `POLARIS_TOKEN_REFRESH_BUFFER_SECONDS` defaults to 60. If your token lifetime is short and your agent sessions are long, refresh happens mid-conversation. Confirm it works before you find out during a demo.

**Version the server against Polaris.** The MCP server wraps the Polaris REST APIs, and those APIs evolve across releases. Polaris has shipped through 1.5.0 as of this writing. Pin your MCP server version and test the pair together rather than upgrading one side independently.

## Sizing the catalog for agent traffic

Catalogs were sized for engines. An engine issues a handful of catalog calls, plans a query, and then does its real work against object storage. Agents invert that ratio. An agent session is mostly catalog calls with a small amount of data access at the end, and sometimes none at all.

Plan for it with three numbers.

**Calls per session.** Instrument your MCP server and record the tool call count per conversation. Discovery-oriented agents land somewhere between 4 and 30 in my experience. Anything past 50 usually means a missing tool, where the model is assembling by hand something one call should return.

**Concurrent sessions.** Multiply by the number of engineers who have the client installed, times an activity factor. This grows faster than teams expect once the integration is good, because the pattern spreads by word of mouth.

**Cache-ability.** Namespace lists and table schemas change on the order of days. Agent sessions repeat the same reads constantly. A small cache in front of the read tools, with a time to live measured in minutes, removes most of the load. Invalidate on write operations from the same server so an agent that creates a table sees it immediately.

Polaris runs on a JDBC backend, with Postgres and CockroachDB both documented, and it exposes telemetry through Prometheus and Jaeger. Wire that up before agent traffic arrives rather than after. The metrics you want are request rate by endpoint, p95 latency on table load, and authentication failure count. That third one is your early warning for a misconfigured agent hammering a realm it has no credentials for.

## Where this is heading

Two developments are worth tracking.

The first is policy. Polaris has a policy framework, and the MCP server exposes it through `polaris-policy-request` with list, get, create, update, delete, attach, detach, and applicable operations. That `applicable` operation is the interesting one for agents, because it answers "what policies apply to this object" rather than "what policies exist." An agent that checks applicable policy before acting has a governance-aware execution path rather than a permission check that either passes or fails. Expect that surface to get richer as agentic access becomes a primary use case rather than a secondary one.

The second is the split between metadata access and query access. Right now those are separate servers with separate configurations, and a user running both maintains two identity configurations that need to stay consistent. The obvious direction is one identity, delegated across both. The pieces exist already, since credential vending hands out short-lived scoped storage credentials derived from catalog grants. Assembling them into a single clean flow for agents is unfinished work.

I also expect tool description quality to become a recognized discipline. Right now every team writes its own by hand and discovers the same lessons independently. The catalog knows the schemas, the properties, the view definitions, and the policies. Generating good descriptions from that state rather than writing them is the obvious move, and almost nobody does it yet.

## Conclusion

The reason to attach an agent to a catalog rather than to a database connection is that the catalog already solved the problems the agent has. It knows what exists, what shape it is in, who can see it, and how to hand out a credential that expires.

The Apache Polaris MCP Server gives you that attachment point for metadata and administration, with a tool surface covering catalogs, namespaces, tables, principals, roles, and policies. It does not run queries, and knowing that up front saves you a wasted afternoon. Query execution comes from your engine's own MCP server or from a narrow read-only server you build on PyIceberg against the same principal.

The security model is where the real work sits. Configure OAuth client credentials rather than static tokens. Create a dedicated principal per agent use case. Grant it the minimum, and enforce that minimum in Polaris grants rather than in prompt instructions. A model can be talked out of a prompt instruction. It cannot be talked out of a permission it does not have.

Start small. Point a read-only principal at a development catalog, register the server with whatever client you already use, and spend an hour watching the JSON-RPC traffic. What the agent actually calls will surprise you, and that surprise is the most useful design input you will get.

## Keep Going

If this piece was useful, I have written a lot more on catalogs and lakehouse architecture. *Apache Polaris: The Definitive Guide*, which I co-authored for O'Reilly, covers the RBAC model, credential vending, and federation mechanics that everything in this article depends on. *Apache Iceberg: The Definitive Guide* goes deeper on the table format underneath. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
