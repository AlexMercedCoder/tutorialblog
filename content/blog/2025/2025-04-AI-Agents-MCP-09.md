---
title: A Journey from AI to LLMs and MCP - 9 - Tools in MCP — Giving LLMs the Power to Act
date: "2025-04-13"
description: "Tools in MCP — Giving LLMs the Power to Act"
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

## Free Resources  
- **[Free Apache Iceberg Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=AItoLLMS&utm_content=alexmerced&utm_term=external_blog)**  
- **[Free Copy of “Apache Iceberg: The Definitive Guide”](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=AItoLLMS&utm_content=alexmerced&utm_term=external_blog)**  
- **[2025 Apache Iceberg Architecture Guide](https://medium.com/data-engineering-with-dremio/2025-guide-to-architecting-an-iceberg-lakehouse-9b19ed42c9de)**  
- **[How to Join the Iceberg Community](https://medium.alexmerced.blog/guide-to-finding-apache-iceberg-events-near-you-and-being-part-of-the-greater-iceberg-community-0c38ae785ddb)**  
- **[Iceberg Lakehouse Engineering Video Playlist](https://youtube.com/playlist?list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe&si=WTSnqjXZv6Glkc3y)**  
- **[Ultimate Apache Iceberg Resource Guide](https://medium.com/data-engineering-with-dremio/ultimate-directory-of-apache-iceberg-resources-e3e02efac62e)** 

In the previous post, we looked at **Resources** in the Model Context Protocol (MCP): how LLMs can securely access real-world data to ground their understanding. But sometimes, *reading* isn’t enough.

Sometimes, you want the model to **do something**.

That’s where **Tools** in MCP come in.

In this post, we’ll explore:
- What tools are in MCP
- How tools are discovered and invoked
- How LLMs can use tools (with user control)
- Common tool patterns and security practices
- Real-world examples: from file system commands to API wrappers

Let’s dive in.

## What Are Tools in MCP?

**Tools** are executable functions that an LLM (or the user) can call via the MCP client. Unlike resources—which are passive data—**tools are active operations**.

Examples include:
- Running a shell command
- Calling a REST API
- Summarizing a document
- Posting a GitHub issue
- Triggering a build process

Each tool includes:
- A **name** (unique identifier)
- A **description** (for UI/model understanding)
- An **input schema** (JSON schema describing expected parameters)

> Tools allow models to interact with the world beyond natural language—under user oversight.

## Discovering Tools

Clients can list available tools via:
`tools/list`

Example response:

```json
{
  "tools": [
    {
      "name": "calculate_sum",
      "description": "Add two numbers together",
      "inputSchema": {
        "type": "object",
        "properties": {
          "a": { "type": "number" },
          "b": { "type": "number" }
        },
        "required": ["a", "b"]
      }
    }
  ]
}
```

This allows clients (and LLMs) to decide which tools are available and how to call them properly.

## ⚙️ Calling a Tool
To execute a tool, the client sends:

```bash
tools/call
```

With this payload:

```json
{
  "name": "calculate_sum",
  "arguments": {
    "a": 3,
    "b": 5
  }
}
```

The server responds with:

```json
{
  "content": [
    {
      "type": "text",
      "text": "8"
    }
  ]
}
```

That’s it! The LLM can now use this output in a multi-step reasoning chain.

### Model-Controlled Tool Use
Tools are designed to be invoked by models automatically. The host mediates this interaction with:

- Approval flows (user-in-the-loop)

- Permission gating

- Logging and auditing

This is what enables “agentic behavior.” For example:

Claude sees a CSV file and decides to call analyze_csv to compute averages—without a user explicitly requesting it.

### Tool Design Patterns
Let’s look at some common and powerful tool types:

#### System Tools

```json
{
  "name": "run_command",
  "description": "Execute a shell command",
  "inputSchema": {
    "type": "object",
    "properties": {
      "command": { "type": "string" },
      "args": {
        "type": "array",
        "items": { "type": "string" }
      }
    }
  }
}
```

Use case: Let the LLM grep a log file, or check system uptime.

#### API Integrations

```json
{
  "name": "create_github_issue",
  "description": "Open a new issue on GitHub",
  "inputSchema": {
    "type": "object",
    "properties": {
      "repo": { "type": "string" },
      "title": { "type": "string" },
      "body": { "type": "string" }
    }
  }
}
```

Use case: Let an AI dev assistant file bugs or suggest changes.

#### Data Analysis
```json
{
  "name": "summarize_csv",
  "description": "Summarize a CSV file",
  "inputSchema": {
    "type": "object",
    "properties": {
      "filepath": { "type": "string" }
    }
  }
}
```

Use case: Let the LLM analyze performance metrics or user data.

#### Security Best Practices
Giving LLMs the ability to take action means security is critical. Here’s how to stay safe:

**Validate all input**
Use detailed JSON schemas

Sanitize input (e.g., file paths, commands)

**Use access controls**
Gate sensitive tools behind roles

Allow user opt-in or approval

**Log and monitor usage**
Track which tools are used, with what arguments

Log errors and output for audit trails

**Handle errors gracefully**
Return structured errors inside the result, not just raw exceptions. This helps the LLM adapt.

```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "Error: File not found."
    }
  ]
}
```

#### Example: Implementing a Tool Server in Python
```python
@mcp.tool()
async def get_weather(city: str) -> str:
    """Return current weather for a city."""
    data = await fetch_weather(city)
    return f"The temperature in {city} is {data['temp']}°C."
```

This tool will automatically appear in the tools/list response and can be invoked by the LLM or user.

### Why Tools Matter for Agents
Agents aren’t just chatbots—they're interactive systems. Tools give them the ability to:

- Take real-world actions

- Build dynamic workflows

- Chain reasoning across multiple steps

- Drive automation in safe, auditable ways

Combined with resources, prompts, and sampling, tools make LLMs feel like collaborative assistants, not just text predictors.

### Recap: Tools in MCP

- Concept	Description
- Tool definition	Name, description, and input schema
- Invocation	tools/call with arguments
- Output	Text or structured response
- Use case examples	Shell commands, API calls, code generation, analysis
- Security guidelines	Validate input, log usage, gate sensitive actions

### Coming Up Next: Sampling and Prompts — Letting the Server Ask the Model for Help
In the final two posts of this series, we’ll explore:

✅ Sampling — How servers can request completions from the LLM during workflows
✅ Prompts — Reusable templates for user-driven or model-driven actions

Tools give LLMs the power to act. With proper controls and schemas, they become safe, composable building blocks for real-world automation.
