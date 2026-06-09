---
title: "Implementing MCP in the Lakehouse"
date: "2026-06-08"
description: "How to build a Model Context Protocol (MCP) server that exposes lakehouse tables and semantic views as AI-accessible tools, with Python implementation patterns and authentication."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - "MCP lakehouse implementation"
  - "Model Context Protocol data"
  - "Python MCP server"
  - "semantic data layer"
  - "Dremio MCP server"
  - "lakehouse AI tools"
---

When an AI agent needs data, it has two options. It can write raw SQL through an unfiltered connection, which creates security and correctness risks. Or it can call a tool that presents curated, governed data through a clean interface. The Model Context Protocol (MCP) standardizes the second option.

MCP, introduced by Anthropic in November 2024, defines how AI models discover and call external tools, access resources, and use prompts. For the lakehouse, MCP is the gateway through which agents interact with data. An MCP server wraps Iceberg tables, semantic views, and query engines into callable tools that agents can discover and invoke without knowing SQL or internal schema details.

This article covers the MCP specification, the architecture of an MCP server for the lakehouse, and how to build one in Python using the official MCP SDK. The reference implementation is Dremio's open-source MCP server, which provides the pattern for exposing lakehouse capabilities as agent-accessible tools.

## The MCP Specification: What MCP Defines

MCP follows a client-server architecture. The client is the AI model or agent framework (Claude Desktop, VS Code extensions, LangChain agents, custom agent runtimes). The server is a process that exposes capabilities. The client discovers available servers through a configuration file or service registry.

MCP defines three primary capability types:

**Tools.** Functions that the AI model can call. Each tool has a name, description, a JSON Schema for input parameters, and an output. Tools are the primary mechanism for agent interaction. The AI model decides when to call a tool based on the conversation context and the tool's description. Tool calls are stateless from the MCP protocol perspective; state management is the server's responsibility.

**Resources.** Exposable data objects that the client can read. Resources are identified by URIs (for example, `iceberg://catalog/schema/table/snapshot/12345`). Resources support content type negotiation (JSON, CSV, Parquet) and can be static or dynamically generated. The primary use case for lakehouse MCP servers is exposing table schemas and metadata as resources.

**Prompts.** Pre-defined interaction templates that the client can use. Prompts include parameterized instructions that guide the AI model's behavior. For a lakehouse MCP server, a prompt might be "Ask me to analyze revenue trends" with placeholders for time periods and dimensions.

The MCP specification also defines:

- **Transport layer.** MCP supports stdio (for local, subprocess-based servers) and streaming HTTP (for remote, network-based servers). The streaming HTTP transport uses Server-Sent Events (SSE) for server-to-client messages and HTTP POST for client-to-server messages.
- **Authentication.** MCP does not define authentication. The server is responsible for authenticating requests. For lakehouse MCP servers, OAuth 2.0 is the recommended pattern, with Personal Access Tokens as a simplified alternative for development.
- **Capability negotiation.** The client and server exchange capability declarations during initialization. A server declares what tools, resources, and prompts it supports. The client declares the protocol version and its own capabilities (for example, streaming support).

## The MCP Lakehouse Reference Architecture

A lakehouse MCP server sits between AI agents and the data platform. It does not connect directly to object storage or the Iceberg table format. It connects to the query engine and the catalog, which handle storage access.

The reference architecture has four components:

1. **MCP Server.** A Python process that implements the MCP protocol. It exposes tools (list catalogs, describe schemas, get table schema, run SQL query, check Reflections) and resources (table metadata, query results).

2. **Query Engine.** The server connects to a query engine (Dremio, Trino, Spark SQL via Thrift, DuckDB for local scenarios). The engine compiles and executes SQL against Iceberg tables. The MCP server does not execute SQL itself. It sends queries to the engine and returns results.

3. **Catalog.** The query engine resolves table references through the catalog (Apache Polaris, Dremio Open Catalog, Snowflake Horizon Catalog). The catalog enforces access control and vends credentials. The MCP server does not authenticate directly with the catalog. It authenticates with the query engine, and the engine authenticates with the catalog on behalf of the agent.

4. **Semantic Layer.** The semantic layer (views, metric definitions, business context) lives in the query engine. The MCP server can expose semantic views as tools. For example, a tool named `get_monthly_revenue` might query a semantic view named `analytics.monthly_revenue` with validated parameters.

The separation is deliberate. The MCP server handles protocol negotiation, tool discovery, parameter validation, and result formatting. The query engine handles SQL parsing, optimization, execution, and data access. The catalog handles identity and access. Each component has a single responsibility, which makes testing and debugging tractable.

## Building an MCP Server in Python

The MCP SDK for Python provides the `FastMCP` class, which makes building a server straightforward. Here is the structure of a lakehouse MCP server.

**Installation.**

```bash
pip install "mcp[cli]" dremio_client pandas pyarrow
```

The `mcp[cli]` package includes the MCP SDK and the CLI tools for testing. `dremio_client` is the Python client for Dremio's query engine. Substitute your engine's client library as needed.

**Server initialization.**

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("lakehouse-mcp-server")
```

The `FastMCP` class handles protocol negotiation, capability declaration, and transport setup. You focus on defining tools and resources.

**Tool definition: List catalogs.**

```python
@mcp.tool()
def list_catalogs() -> list[str]:
    """List all available catalogs in the lakehouse."""
    # Returns catalog names from the query engine's metadata
    return engine.execute("SHOW CATALOGS").fetchall()
```

The docstring becomes the tool description sent to the AI model. It must be clear and specific because the AI model uses it to decide whether to call this tool.

**Tool definition: Get table schema.**

```python
@mcp.tool()
def get_table_schema(catalog: str, schema: str, table: str) -> str:
    """Get the column names and types for a specific table.

    Args:
        catalog: The catalog name (e.g., 'analytics', 'raw')
        schema: The schema name (e.g., 'gold', 'silver')
        table: The table name (e.g., 'monthly_revenue')
    """
    query = (
        f"SELECT column_name, data_type "
        f"FROM {catalog}.information_schema.columns "
        f"WHERE table_schema = '{schema}' AND table_name = '{table}'"
    )
    result = engine.execute(query)
    columns = [f"{row.column_name} ({row.data_type})" for row in result]
    return f"Table {catalog}.{schema}.{table} has columns: " + ", ".join(columns)
```

The type annotations and docstring parameters are used by the MCP protocol to generate the JSON Schema for this tool. The AI model sees a tool named `get_table_schema` with parameters `catalog`, `schema`, and `table`, each described by their string type and the parameter descriptions in the docstring.

**Tool definition: Run a read-only SQL query.**

```python
@mcp.tool()
def run_query(sql: str, max_rows: int = 1000) -> str:
    """Execute a read-only SQL query and return results.

    Use this tool when you need to explore data or answer questions that
    the semantic tools cannot handle.

    Args:
        sql: The SQL query to execute. Must be a SELECT statement.
        max_rows: Maximum number of rows to return (default 1000, max 10000).
    """
    # Validate that the query is read-only
    if not sql.strip().upper().startswith("SELECT"):
        return "Error: Only SELECT queries are allowed."

    result = engine.execute(sql, max_rows=min(max_rows, 10000))

    # Format as a simple table
    headers = [desc[0] for desc in result.description]
    rows = [dict(zip(headers, row)) for row in result.fetchmany(max_rows)]

    return str(rows)  # Simplified; production code should paginate and truncate
```

The validation check (`if not sql.strip().upper().startswith("SELECT")`) is a security boundary. The query engine should enforce additional guardrails: a separate catalog principal with read-only privileges, a query timeout (enforced by the engine), and a result size limit (enforced by the server).

**Resource definition: Table metadata.**

```python
@mcp.resource("iceberg://{catalog}/{schema}/{table}/metadata")
def table_metadata(catalog: str, schema: str, table: str) -> str:
    """Get Iceberg table metadata including snapshot count, data file count,
    and partition information."""
    query = f"DESCRIBE TABLE EXTENDED {catalog}.{schema}.{table}"
    result = engine.execute(query)
    return str(result.fetchall())
```

Resources use URI templates. The client asks for `iceberg://analytics/gold/monthly_revenue/metadata`, and the server resolves the template parameters and returns the metadata.

**Prompt definition: Analysis pattern.**

```python
@mcp.prompt()
def analyze_trend(metric: str, period: str) -> str:
    """Guide the AI to analyze a business trend.

    Args:
        metric: The metric to analyze (e.g., 'revenue', 'customer_count')
        period: The time period (e.g., 'Q3-2026', 'last_30_days')
    """
    return f"""
    You are analyzing the {metric} trend for {period}.
    1. First, check which catalogs and schemas are available.
    2. Find the relevant table or semantic view for {metric}.
    3. Retrieve the schema to understand available columns.
    4. Query the data for {period}.
    5. Compare with the previous period.
    6. Summarize the findings.
    """
```

Prompts are pre-fabricated instructions that guide the AI model's behavior. They are not required for basic MCP server operation, but they significantly improve the quality of agent interactions by providing a structured reasoning pattern.

## Authentication and Authorization Patterns

MCP does not define authentication, but production lakehouse MCP servers must implement it. Three patterns are common.

**Personal Access Token (PAT).** The simplest pattern. The agent (or the agent operator) generates a PAT from the query engine's UI or API and passes it to the MCP server as a configuration parameter. The server includes the PAT in every request to the engine. PATs are convenient for development but problematic for production: they are long-lived, hard to rotate, and tied to a single user identity.

**OAuth 2.0 Client Credentials.** The recommended pattern for production. The MCP server is registered as an OAuth client with the query engine's identity provider. The server obtains a token on startup (or on first request) using the client credentials flow. The token has a limited lifetime (typically 1 hour) and is scoped to the server's identity, not a specific user. Token refresh is handled transparently by the server.

**OAuth 2.0 Authorization Code with PKCE.** The pattern for multi-user scenarios where the agent acts on behalf of a specific user. The user authenticates through the identity provider, and the MCP server receives an authorization code that it exchanges for a token scoped to that user. This is the pattern used by Dremio's MCP server when deployed remotely with OAuth.

The Dremio MCP server supports all three patterns. The production Helm chart uses OAuth 2.0 with an external token provider. The server requests a token, caches it until expiry, and refreshes transparently. If the refresh fails, the server returns an authentication error to the client, and the client can re-initiate the authentication flow.

## Deploying the MCP Server

**Local deployment (development).** The server runs as a subprocess. The AI client (Claude Desktop, VS Code extension) starts the server on initialization and communicates over stdio. The server configuration file includes the engine URI, authentication token, and tool mode settings.

```json
{
  "mcpServers": {
    "lakehouse": {
      "command": "uv",
      "args": ["run", "--directory", "/path/to/server", "main.py"],
      "env": {
        "DREMIO_URI": "https://dremio.example.com:9047",
        "DREMIO_PAT": "@~/tokens/dremio.token"
      }
    }
  }
}
```

**Remote deployment (production).** The server runs as a web service behind a reverse proxy. It uses the streaming HTTP transport (SSE + HTTP POST). The Helm chart provided by Dremio's MCP server repository manages deployment to Kubernetes with horizontal scaling, health checks, and ingress with TLS.

```bash
helm install my-mcp-server ./helm/dremio-mcp \
  --set dremio.uri=https://dremio.example.com:9047 \
  --set oauth.enabled=true \
  --set oauth.tokenUrl=https://idp.example.com/token
```

**Tool modes.** The MCP server can operate in different modes that expose different tool sets. The modes are defined in the server configuration:

- `FOR_DATA_PATTERNS`: Exposes tools for browsing catalogs, describing schemas, and running queries. This is the default mode.
- `FOR_SELF`: Exposes tools for introspection (workload analysis, system metrics). Used by platform teams, not analytics agents.
- `FOR_PROMETHEUS`: Exposes tools for querying Prometheus metrics. Used by monitoring agents.

The mode selection is granular. You can run one MCP server instance per agent type, each with a different mode and different authentication credentials. A pricing agent uses `FOR_DATA_PATTERNS` with a read-only principal. A monitoring agent uses `FOR_PROMETHEUS` with a metrics-scoped principal.

## Testing the MCP Server

The MCP SDK includes an inspector tool that lets you test your server without connecting to an AI client.

```bash
mcp inspector main.py
```

This starts a web UI where you can see all registered tools, resources, and prompts, and test each one with example parameters. The inspector also shows the protocol messages exchanged, which is useful for debugging.

After the inspector confirms that the server responds correctly, configure the AI client and test end-to-end. Start with a simple tool call (list catalogs, describe a schema) before testing complex multi-tool interactions.

## Common Failure Modes and Mitigations

**Unvalidated parameters lead to engine errors.** If the AI model passes a nonexistent catalog name to `list_tables()`, the engine returns an error. Mitigate by wrapping engine calls in try/except blocks that return clear error messages.

**Large result sets overwhelm the context window.** The AI model has a limited context window (varying by model, typically 8K to 200K tokens). A query returning 10,000 rows exceeds most context windows. Mitigate by limiting results (max 1000 rows default, configurable) and truncating large cells.

**Slow queries timeout.** The AI model may call a full-scan query on a 10-billion-row table. The query runs for 5 minutes and the agent assumes the tool is broken. Mitigate by setting query timeouts at the engine level (30 seconds for interactive agents) and returning a timeout error message that the AI model can interpret.

**Tool descriptions are too vague.** If a tool description says "Get data," the AI model does not know when to call it. Mitigate by writing specific, action-oriented descriptions. "Get monthly revenue for a given period and region" is specific. "Query data" is not.

## Summary

MCP transforms the lakehouse from a query interface into a tool-accessible platform for AI agents. An MCP server wraps Iceberg tables, semantic views, and query engine capabilities into callable tools that agents can discover and invoke without knowing SQL or schema details.

The implementation pattern is straightforward: define Python functions annotated with `@mcp.tool()`, connect them to a query engine via a client library, and deploy the server as a stdio subprocess (local) or a streaming HTTP service (remote). Authentication is handled at the server layer, not the protocol layer, with OAuth 2.0 as the production standard.

The Dremio MCP server (open source, Apache 2.0, available at github.com/dremio/dremio-mcp) provides a production reference implementation with support for OAuth, Helm deployment, multiple tool modes, and Prometheus integration. It is the fastest path from zero to a working MCP lakehouse server.

For documentation and setup guides, visit [docs.dremio.com/dremio-cloud/ai-integration/mcp-server](https://docs.dremio.com/dremio-cloud/ai-integration/mcp-server) or start with the tutorial at [dremio.com/get-started](https://www.dremio.com/get-started).

*Sources: MCP Specification (modelcontextprotocol.io), Dremio MCP Server Repository (github.com/dremio/dremio-mcp), Dremio Blog "Building a Basic MCP Server with Python" (dremio.com), Dremio Blog "Using Dremio's MCP Server with Agentic AI Frameworks" (dremio.com), Atlan MCP Server Implementation Guide (atlan.com).*
