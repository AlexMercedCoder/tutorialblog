---
title: A Journey from AI to LLMs and MCP - 7 - Under the Hood — The Architecture of MCP and Its Core Components
date: "2025-04-11"
description: "Under the Hood — The Architecture of MCP and Its Core Components"
author: "Alex Merced"
category: "AI"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - AI
  - ML
  - Python
  - MCP
  - AI Agents
---

# A Journey from AI to LLMs and MCP - 7 - Under the Hood — The Architecture of MCP and Its Core Components

## Free Resources  
- **[Free Apache Iceberg Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=AItoLLMS&utm_content=alexmerced&utm_term=external_blog)**  
- **[Free Copy of “Apache Iceberg: The Definitive Guide”](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=AItoLLMS&utm_content=alexmerced&utm_term=external_blog)**  
- **[2025 Apache Iceberg Architecture Guide](https://medium.com/data-engineering-with-dremio/2025-guide-to-architecting-an-iceberg-lakehouse-9b19ed42c9de)**  
- **[How to Join the Iceberg Community](https://medium.alexmerced.blog/guide-to-finding-apache-iceberg-events-near-you-and-being-part-of-the-greater-iceberg-community-0c38ae785ddb)**  
- **[Iceberg Lakehouse Engineering Video Playlist](https://youtube.com/playlist?list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe&si=WTSnqjXZv6Glkc3y)**  
- **[Ultimate Apache Iceberg Resource Guide](https://medium.com/data-engineering-with-dremio/ultimate-directory-of-apache-iceberg-resources-e3e02efac62e)** 

In our last post, we introduced the **Model Context Protocol (MCP)** as a standard way to connect AI models and agents to tools, data, and workflows—much like how the Apache Iceberg REST protocol brings interoperability to data engines.

Now it’s time to open the black box.

In this post, we’ll break down:
- The architecture of MCP
- The responsibilities of hosts, clients, and servers
- The message lifecycle and transport layers
- How tools, resources, and prompts plug into the system

By the end, you’ll understand **how MCP enables secure, modular communication between LLMs and the systems they need to work with.**

## Big Picture: How MCP Fits Together

MCP follows a **client-server architecture** that enables many-to-many connections between models and systems.

Here’s the high-level setup:

```
+------------------------+      +--------------------+
|    Claude Desktop      |      |      Web IDE       |
| (Host + MCP Client)    |      | (Host + MCP Client)|
+------------------------+      +--------------------+
             |                         |
             |     MCP Protocol        |
             |                         |
             v                         v
+------------------------+    +---------------------------+
|   Local Tool Server    |    |     Cloud API Server      |
| (Exposes tools/resources)|  | (Exposes prompts/tools)   |
+------------------------+    +---------------------------+

```

Each **host** runs one or more **clients**, which connect to independent **MCP servers** exposing functionality in a standardized format.


## Key Concepts

Let’s look at the core components that make this work.

### 1. Hosts
Hosts are the applications that run the LLM (e.g. Claude Desktop, VS Code extension, custom browser app). They manage:
- The model interaction (LLM prompts and completions)
- UI and user input
- A registry of connected clients

> A host might display tools in a sidebar, allow users to pick files (resources), or visualize prompts in a command palette.

### 2. Clients
An **MCP client** lives inside a host and connects to a single MCP server. It handles:
- Transport layer setup (e.g. stdio or HTTP/SSE)
- Message exchange (requests, notifications, etc.)
- Proxying server capabilities to the host/model

Each client maintains a **1:1 connection with one server**.

### 3. Servers
Servers expose real-world capabilities using the MCP spec. They can:
- Serve **resources** (files, logs, database records)
- Define and execute **tools**
- Offer reusable **prompts**
- Request **sampling** (LLM completions)

Servers can run locally (e.g. on your machine) or remotely (e.g. in a cloud API gateway), and can be implemented in any language (Python, TypeScript, C#, etc.).

## Message Lifecycle in MCP

MCP uses a **JSON-RPC 2.0 message format** to communicate between clients and servers. All communication flows through a structured lifecycle:

### 1. Initialization
Before communication starts:
- Client sends an `initialize` request
- Server responds with capabilities
- Client sends an `initialized` notification

> This sets up feature negotiation and version compatibility.

### 2. Message Types

| Type         | Description                                 |
|--------------|---------------------------------------------|
| Request      | A message expecting a response (e.g. `tools/call`) |
| Response     | Result from a request (e.g. tool output)     |
| Notification | One-way message with no response expected    |
| Error        | Sent when a request fails or is invalid      |

Each message is wrapped in a **transport layer** (more on that next).

## Transport Layer — How Messages Move

MCP supports multiple transport mechanisms:

### Stdio Transport
- Uses standard input/output
- Ideal for local tools and scripts
- Simple, reliable, and works well with command-line tools

### HTTP + SSE Transport
- Uses HTTP POST for client-to-server messages
- Uses **Server-Sent Events (SSE)** for real-time server-to-client updates
- Useful for remote or cloud-based servers

All transports carry JSON-RPC messages and follow the same protocol semantics.

## MCP Capabilities

MCP defines a small number of **core capabilities**, each with its own request/response patterns.

### Resources
Servers can expose structured data like:
- Files
- Logs
- API responses
- Screenshots or binary data

Clients can:
- List available resources
- Read their contents
- Subscribe to updates (e.g. file changes)

### Tools
Servers define **callable functions** that agents can invoke. Each tool has:
- A name
- Description
- JSON schema for inputs
- Output format (text or structured)

Tools are **model-controlled**, meaning the LLM can decide which tool to use based on context.

### Prompts
Servers can expose **reusable prompt templates** with:
- Named arguments
- Context bindings (e.g. resources)
- Multi-step workflows

Prompts are **user-controlled**, meaning users select when to run them.

### Sampling
Servers can **ask** the host model for completions:
- Specify conversation history and preferences
- Include system prompt and context
- Receive structured completions (text, image, etc.)

This allows **server-side workflows** to request natural language responses from the model in real time.

## Security and Isolation

MCP provides strong boundaries between components:
- Hosts control what clients and models can see
- Servers expose only the capabilities they choose
- Clients can sandbox or restrict tool access
- Sampling keeps users in control of what prompts and completions occur

> This makes MCP suitable for sensitive environments like IDEs, enterprise apps, and privacy-conscious tools.

## Why This Architecture Matters

By standardizing communication between LLMs and tools:
- You can plug a new tool into your environment without modifying your agent
- You can build servers once and use them across different LLM clients (Claude, custom, etc.)
- You get **clear separation of concerns**: tools, data, and models are independently managed

## 🔮 Coming Up Next: Resources in MCP — Serving Relevant Data Securely

In the next post, we’ll zoom in on the **Resources** capability:
- How to structure resources
- How models use them
- Real-world use cases: logs, code, documents, screenshots
