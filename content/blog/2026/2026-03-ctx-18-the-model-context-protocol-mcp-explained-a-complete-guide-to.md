---
title: "The Model Context Protocol (MCP) Explained: A Complete Guide to How Every Major AI Tool Connects to External Data"
date: "2026-03-07"
description: "The Model Context Protocol (MCP) has become the universal standard for connecting AI models to external tools, data sources, and services. Originally open-so..."
author: "Alex Merced"
category: "AI Context Management"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - AI coding tools
  - context management
  - developer tools
  - agentic development
  - prompt engineering
---

The Model Context Protocol (MCP) has become the universal standard for connecting AI models to external tools, data sources, and services. Originally open-sourced by Anthropic in November 2024 and now managed by the Linux Foundation, MCP solves one of the biggest frustrations in working with AI: getting models to interact with the systems where your actual work lives. Instead of copying and pasting data into chat windows or uploading files manually, MCP lets AI tools query databases, read documentation, interact with APIs, manage files, and perform actions across your entire tool ecosystem through a standardized protocol.

This guide explains how MCP works at a technical level, what problems it solves, and exactly how each of the 17 major AI tools supports it (or does not). If you use any AI coding assistant, research tool, or chat interface, understanding MCP will help you build a more connected and productive AI workflow.

## What Is MCP and Why Does It Matter?

MCP is a client-server protocol that standardizes how AI applications connect to external resources. Before MCP, every AI tool that wanted to connect to an external service needed a custom integration. If you wanted Claude to query your PostgreSQL database, you needed one integration. If you wanted ChatGPT to do the same thing, you needed a completely different integration. MCP eliminates this duplication by creating a single protocol that works across tools.

### The Architecture

MCP uses a three-part architecture:

1. **Host:** The AI application you are using (ChatGPT, Claude Desktop, Cursor, etc.)
2. **Client:** The component within the host that manages MCP connections
3. **Server:** An external process that exposes tools, resources, and prompts to the AI

The server is where the power lives. An MCP server can expose any capability: reading files, querying databases, calling APIs, running commands, searching the web, or interacting with services like GitHub, Jira, or Slack. The AI model discovers these capabilities through the protocol and can invoke them during conversations.

### How Communication Works

MCP supports multiple transport mechanisms:

**STDIO (Standard Input/Output):** The host launches the MCP server as a local process and communicates through stdin/stdout. This is the most common approach for local servers. The AI tool starts the server process, sends requests through standard input, and reads responses from standard output.

**Streamable HTTP:** The server runs as a web service accessible via HTTP. This is used for remote servers and cloud-hosted services. It supports bearer token and OAuth authentication for secure connections.

**Server-Sent Events (SSE):** An older HTTP-based transport that some tools still support. Being superseded by Streamable HTTP in newer implementations.

### What MCP Servers Expose

An MCP server can expose three types of capabilities:

1. **Tools:** Functions the AI can call (query a database, create a file, search an API)
2. **Resources:** Data the AI can read (file contents, database schemas, documentation)
3. **Prompts:** Pre-built prompt templates the AI can use

When an AI tool connects to an MCP server, it discovers the available tools and their parameter schemas. The AI model then decides when to invoke these tools based on the user's request. For example, if you ask "What tables are in my database?", the AI sees that a database MCP server has a "list_tables" tool and calls it automatically.

## The MCP Server Ecosystem

The MCP ecosystem has grown rapidly. Common server categories include:

### Data and Database Servers

| Server | Function |
|---|---|
| **PostgreSQL MCP** | Query PostgreSQL databases, inspect schemas |
| **MySQL MCP** | Query MySQL databases |
| **SQLite MCP** | Read and write SQLite databases |
| **MongoDB MCP** | Query MongoDB collections |
| **Snowflake MCP** | Query Snowflake data warehouse |

### Development Tool Servers

| Server | Function |
|---|---|
| **GitHub MCP** | Manage repos, issues, PRs, code search |
| **GitLab MCP** | GitLab API integration |
| **Jira MCP** | Create and manage tickets |
| **Sentry MCP** | Error tracking and debugging |
| **Playwright MCP** | Browser automation and testing |

### Productivity and Communication Servers

| Server | Function |
|---|---|
| **Google Drive MCP** | Read and manage Google Drive files |
| **Slack MCP** | Read and send Slack messages |
| **Gmail MCP** | Read and send emails |
| **Notion MCP** | Query and update Notion pages |
| **Calendar MCP** | Manage calendar events |

### Specialized Servers

| Server | Function |
|---|---|
| **Filesystem MCP** | Read and write local files |
| **Brave Search MCP** | Web search capabilities |
| **Fetch MCP** | HTTP requests to URLs |
| **Memory/Knowledge MCP** | Persistent knowledge storage |
| **Docker MCP** | Container management |

The key insight is that any MCP server you set up works across every MCP-compatible tool. A PostgreSQL MCP server configured once can be used by Claude Desktop, ChatGPT, Cursor, Gemini CLI, and any other tool that supports the protocol.

## Writing Your Own MCP Server

MCP servers can be written in any language that supports stdin/stdout or HTTP. The most common implementations use TypeScript/JavaScript or Python.

### Basic Server Structure (TypeScript)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "my-custom-server",
  version: "1.0.0",
});

// Define a tool
server.tool(
  "get_weather",
  "Get the current weather for a location",
  { location: { type: "string", description: "City name" } },
  async ({ location }) => {
    const weather = await fetchWeatherAPI(location);
    return {
      content: [{ type: "text", text: JSON.stringify(weather) }],
    };
  }
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Basic Server Structure (Python)

```python
from mcp.server import Server
from mcp.types import Tool, TextContent
import mcp.server.stdio

server = Server("my-custom-server")

@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="get_weather",
            description="Get current weather for a location",
            inputSchema={
                "type": "object",
                "properties": {
                    "location": {"type": "string", "description": "City name"}
                },
                "required": ["location"]
            }
        )
    ]

@server.call_tool()
async def call_tool(name, arguments):
    if name == "get_weather":
        weather = await fetch_weather_api(arguments["location"])
        return [TextContent(type="text", text=str(weather))]

async def main():
    async with mcp.server.stdio.stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())
```

The protocol handles discovery, parameter validation, and response formatting. Your server just needs to define the tools it exposes and implement the logic for each one.

## MCP Support Across Every Major AI Tool

Here is how MCP support works across all 17 AI tools covered in this series, grouped by support level.

### Full Native MCP Support

These tools have deep, first-class MCP integration built into their core architecture.

---

#### Claude Desktop

**Support level:** Full native support (MCP was created by Anthropic for this use case)

**Configuration:** Edit `claude_desktop_config.json` located at:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://user@localhost:5432/mydb"
      }
    }
  }
}
```

**How it works:** Claude Desktop acts as the MCP host. When you start the app, it launches all configured MCP servers as child processes. Claude discovers the available tools and can invoke them during conversations. You also access the settings through the app's menu: Claude > Settings > Developer > Edit Config. Desktop Extensions offer a simplified setup path as well.

---

#### Claude Code

**Support level:** Full native support via the `claude mcp` CLI command

**Configuration:** Managed through the command line:
```bash
claude mcp add postgres -- npx -y @anthropic/mcp-server-postgres
claude mcp list
claude mcp remove postgres
```

**How it works:** Claude Code is an MCP client that can connect to both STDIO and Streamable HTTP servers. MCP tools become available as part of the agent's tool set alongside its built-in file and terminal tools. The agent autonomously decides when to invoke MCP tools based on the task.

---

#### Claude CoWork

**Support level:** Full support through Claude Desktop's MCP configuration

**How it works:** CoWork runs within the Claude Desktop application, so it inherits all MCP server connections configured in `claude_desktop_config.json`. CoWork can use MCP servers to access Google Drive, Gmail, databases, and other external services while performing multi-step tasks on your behalf.

---

#### OpenAI Codex CLI

**Support level:** Full native support via `config.toml`

**Configuration:** MCP servers are configured globally (`~/.codex/config.toml`) or per-project (`.codex/config.toml`):
```toml
[mcp_servers.postgres]
command = "npx"
args = ["-y", "@anthropic/mcp-server-postgres"]
```

Management commands:
```bash
codex mcp add postgres
codex mcp list
codex mcp remove postgres
codex mcp login  # for authenticated servers
```

**How it works:** Codex CLI supports both STDIO and Streamable HTTP servers. It can also function as an MCP server itself, letting other MCP clients use Codex as a coding tool. Supports bearer token and OAuth authentication for remote servers.

---

#### Gemini CLI

**Support level:** Full native support via `settings.json`

**Configuration:**
```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-postgres"]
    }
  }
}
```

Management: Use the `/mcp` command within Gemini CLI for sub-commands including authentication, listing servers and tools, and enabling/disabling servers.

**How it works:** Gemini CLI supports both local and remote MCP servers. Tools exposed by MCP servers become available to the Gemini agent, extending its capabilities beyond built-in file system and terminal tools. This is the primary mechanism for extending Gemini CLI's functionality.

---

#### Cursor

**Support level:** Full native support via settings UI

**Configuration:** Add MCP servers through Cursor Settings > MCP > Add New MCP Server. Supports both `stdio` and `sse`/HTTP transport types. You provide the server name, type, command/URL, and optional environment variables.

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-postgres"]
    }
  }
}
```

**How it works:** MCP tools become available in Cursor's Agent Mode. The AI assistant automatically invokes MCP tools when needed, or you can direct it to use specific tools by name. A green status indicator shows when the server is running. Requires Cursor version 0.4.5.9 or later.

---

#### Windsurf

**Support level:** Full native support via settings and MCP Marketplace

**Configuration:** Configure through Windsurf Settings > Cascade > MCP Servers, or manually edit `mcp_config.json`. Supports `stdio`, Streamable HTTP, and SSE transports with OAuth support.

**How it works:** Windsurf acts as the MCP host with Cascade as the MCP client. Up to 100 active tools can be connected at once. Windsurf provides an MCP Marketplace for discovering and installing servers. Users can auto-approve specific tools or manually review each tool call.

---

#### Google Antigravity

**Support level:** Full native support

**Configuration:** MCP servers are configured through the tool's settings following the standard MCP pattern.

**How it works:** MCP tool descriptions are included in the context assembly for every interaction. When the agent enters agentic mode, it can invoke MCP tools alongside its built-in tools (file system, terminal, browser). Best used when tasks require information from outside the codebase.

---

#### OpenCode

**Support level:** Full native support via `opencode.jsonc`

**Configuration:**
```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-postgres"]
    }
  }
}
```

Management: Use the `opencode mcp` command. Supports both local and remote servers with OAuth authentication for remote connections.

**How it works:** MCP tools become automatically available to the LLM powering OpenCode. Local settings can override remote defaults. Important security note: local MCP servers can execute commands without confirmation, so be cautious with untrusted project configurations.

---

#### Zed

**Support level:** Full support via extensions and settings

**Configuration:** Configure MCP servers through Zed extensions or directly in settings:
```json
{
  "context_servers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-postgres"]
    }
  }
}
```

**How it works:** MCP is central to Zed's AI agent capabilities. Servers can be installed as pre-built extensions or configured as custom servers. Zed also developed the Agent Client Protocol (ACP) in collaboration with JetBrains for broader agent interoperability. MCP tools are available within the assistant panel for agentic interactions.

### MCP Support Through Application Features

These tools support MCP but through specific application features rather than general-purpose configuration.

---

#### Claude Web

**Support level:** Remote MCP server support via Connectors

**Configuration:** Navigate to **Settings > Connectors** in the Claude.ai web interface. Add a custom connector by providing the remote MCP server's URL. Available across Free, Pro, Max, Team, and Enterprise plans (free users may have connection limits).

**How it works:** Claude Web connects to remote MCP servers (cloud-hosted services accessed via URL). This enables integrations with Google Drive, Slack, GitHub, Asana, Canva, Figma, and any custom API exposed through a remote MCP server. Claude Web also supports MCP Apps, which allow MCP servers to render interactive UIs (dashboards, project boards) directly within the chat interface. Note: Claude Web only supports remote servers. For local MCP servers (STDIO), use Claude Desktop.

---

#### ChatGPT

**Support level:** MCP support via Developer Mode (September 2025)

**Configuration:** Enable Developer Mode in ChatGPT settings (requires Plus, Pro, Team, Enterprise, or Education plan). Configure MCP server endpoints through the Developer Mode settings panel.

**How it works:** ChatGPT connects to MCP servers through Developer Mode, supporting both read and write operations. This means ChatGPT can fetch data from and update external systems (Jira tickets, calendars, databases) directly from the chat interface. The desktop app supports additional local MCP connections. OpenAI cautions that write operations carry risk and should be tested carefully.

---

#### Perplexity

**Support level:** Local MCP support on macOS application

**Configuration:** Configure local MCP servers through the macOS app settings. Remote MCP servers are planned for paid subscribers.

**How it works:** Local MCP servers give Perplexity access to your file system, local databases, and applications, complementing its primary web search capabilities. This lets you combine Perplexity's research strengths with local data access.

---

#### T3 Chat

**Support level:** MCP support for external data sources

**Configuration:** Configure through T3 Chat's settings interface.

**How it works:** MCP servers provide T3 Chat with access to external resources including Google Drive, Slack, GitHub, databases, and custom APIs. This extends T3 Chat beyond a chat interface into an integrated workspace that can query and interact with external services.

---

#### OpenWork

**Support level:** MCP support through plugin architecture

**Configuration:** Configure MCP servers through OpenWork's settings panel.

**How it works:** MCP connections become available as tools that OpenWork's Skills can utilize. Each server connection extends the capabilities available to the AI agent during file and task operations.

---

#### VS Code with LLM Plugins

**Support level:** Varies by extension

| Extension | MCP Support | Configuration |
|---|---|---|
| **Cline** | Full support | Settings panel configuration |
| **Continue** | Full support | config.json |
| **GitHub Copilot** | Limited | Through GitHub integration |
| **Aider** | Not supported | Uses direct terminal commands instead |

**How it works:** Each extension manages its own MCP connections. Cline and Continue offer the most complete MCP support, with tools becoming available within their respective chat and agent interfaces.

### No MCP Support

These tools do not support MCP connections directly.

---

#### Gemini Web and NotebookLM

**Why not:** Web-based interfaces cannot manage local server processes. Google Workspace integrations (Gmail, Drive, Docs) provide similar functionality for Google services. MCP support is available in the Gemini CLI.

**Alternative:** Use Gemini CLI for MCP-connected workflows. Use Gemini Web and NotebookLM for their strengths in web-based research and document analysis.

## Choosing the Right MCP Configuration

### For Individual Developers

Start with 2 to 3 MCP servers that match your daily workflow:

1. **Filesystem MCP** for local file access (if your tool does not have built-in file access)
2. **Database MCP** for your primary database (PostgreSQL, MySQL, or SQLite)
3. **GitHub MCP** for repository management

### For Teams

Standardize on a common set of MCP servers and share configurations:

- Store MCP configurations in version control
- Use project-level configs (`.codex/config.toml`, `opencode.jsonc`) so the entire team connects to the same servers
- Document which MCP servers are required for each project

### For Multi-Tool Workflows

The biggest advantage of MCP is portability. Set up a server once and use it everywhere:

- Configure your database MCP server and use it from Claude Desktop, Cursor, and Gemini CLI
- Use the same GitHub MCP server across all your coding tools
- Create custom MCP servers for internal APIs and share them across the team

## Security Considerations

MCP servers can be powerful but carry security implications:

1. **Local execution:** STDIO MCP servers run as local processes with your user permissions. A malicious server could access your file system, environment variables, or network.

2. **Write operations:** MCP servers that support writes (database updates, file modifications, API calls) can make changes that are difficult to undo. Always review tool calls before approving, especially for unfamiliar servers.

3. **Untrusted configurations:** Be cautious with project-level MCP configurations in repositories you do not control. A malicious `opencode.json` or `.codex/config.toml` could define servers that execute harmful commands.

4. **Authentication:** For remote MCP servers, use OAuth or bearer token authentication. Never embed credentials directly in configuration files that are committed to version control.

5. **Approval flows:** Most AI tools prompt for approval before invoking MCP tools. Keep this enabled, especially for write operations. Some tools (like Windsurf) let you auto-approve specific tools while requiring manual review for others.

## Common MCP Patterns

### The Database Query Pattern

Connect a database MCP server and let the AI query your data directly:

"What were our top 10 customers by revenue last quarter?"

The AI invokes the database MCP tool, runs the appropriate SQL query, and presents the results. No manual query writing required.

### The Cross-System Pattern

Connect multiple MCP servers to work across systems:

"Create a GitHub issue for the bug we found in yesterday's Sentry errors, and add it to our Jira sprint board."

The AI uses Sentry MCP to find the error, GitHub MCP to create the issue, and Jira MCP to add it to the sprint.

### The Local Development Pattern

Connect filesystem, database, and browser MCP servers for a complete development workflow:

"Run the test suite, check for failures, look at the database state after the failed test, and fix the issue."

The AI uses terminal access for tests, database MCP for state inspection, and file access for the fix.

## The Future of MCP

MCP is rapidly becoming the standard interface between AI models and external systems. With adoption by OpenAI, Anthropic, Google, Microsoft, and the Linux Foundation, the protocol is likely to expand into:

- **More remote server hosting:** Cloud-hosted MCP servers that require no local setup
- **Richer authentication:** Enterprise SSO and role-based access for MCP connections
- **Standardized approval workflows:** Consistent permission models across tools
- **Marketplace ecosystems:** Cursor, Windsurf, and others are already building MCP marketplaces

Understanding MCP now positions you to take advantage of these developments as the ecosystem matures. The AI tools that support MCP today will become more capable as the server ecosystem grows, and the MCP servers you configure today will work with the AI tools of tomorrow.

## Go Deeper

To learn more about AI-assisted development, context management, and agentic workflows, check out these resources by Alex Merced:

- [The 2026 Guide to AI-Assisted Development](https://www.amazon.com/2026-Guide-AI-Assisted-Development-Engineering-ebook/dp/B0GQW7CTML/) covers AI-assisted development workflows, prompt engineering, and context strategies for software engineers.

- [The 2026 Guide to Lakehouses, Apache Iceberg and Agentic AI](https://www.amazon.com/Lakehouses-Apache-Iceberg-Agentic-Hands/dp/B0GQNY21TD/) explores how AI agents are reshaping data architecture and how to build systems that support agentic workflows.

And for a fictional take on where AI is heading:

- [The Emperors of A.I. Valley: A Novel of Power, Code, and the War for the Future](https://www.amazon.com/Emperors-I-Valley-Novel-Future/dp/B0GQHKF4ZT/) is a novel about the power struggles and ethical dilemmas behind the companies building the most powerful AI systems in the world.
