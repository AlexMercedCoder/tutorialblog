---
title:  Journey from AI to LLMs and MCP - 6 - Enter the Model Context Protocol (MCP) — The Interoperability Layer for AI Agents
date: "2025-04-10"
description: "Enter the Model Context Protocol (MCP) — The Interoperability Layer for AI Agents"
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

We’ve spent the last few posts exploring the growing power of AI agents—how they can reason, plan, and take actions across complex tasks. And we’ve looked at the frameworks that help us build these agents. But if you’ve worked with them, you’ve likely hit a wall:

- Hardcoded toolchains
- Limited to a specific LLM provider
- No easy way to share tools or data between agents
- No consistent interface across clients

What if we had a **standard** that let **any agent talk to any data source or tool**, regardless of where it lives or what it’s built with?

That’s exactly what the **Model Context Protocol (MCP)** brings to the table.

And if you’re from the data engineering world, MCP is to AI agents what the **Apache Iceberg REST protocol** is to analytics:  
> A universal, pluggable interface that enables many clients to interact with many servers—without tight coupling.

## What Is the Model Context Protocol (MCP)?

MCP is an **open protocol** that defines how LLM-powered applications (like agents, IDEs, or copilots) can access **context, tools, and actions** in a standardized way.

Think of it as the "interface layer" between:
- **Clients**: LLMs or AI agents that need context and capabilities
- **Servers**: Local or remote services that expose data, tools, or prompts
- **Hosts**: The environment where the LLM runs (e.g., Claude Desktop, a browser extension, or an IDE plugin)

It defines a **common language** for exchanging:
- **Resources** (data the model can read)
- **Tools** (functions the model can invoke)
- **Prompts** (templates the user or model can reuse)
- **Sampling** (ways servers can request completions from the model)

This allows you to **plug in new capabilities without rearchitecting your agent or retraining your model**.

## 🧱 How MCP Mirrors Apache Iceberg’s REST Protocol

Let’s draw the parallel:

| Concept                | Apache Iceberg REST                 | Model Context Protocol (MCP)              |
|------------------------|-------------------------------------|-------------------------------------------|
| Standardized API       | REST endpoints for table ops        | JSON-RPC messages for context/tools       |
| Decouples client/server| Any engine ↔ any Iceberg catalog    | Any LLM/agent ↔ any tool or data backend  |
| Multi-client support   | Spark, Trino, Flink, Dremio         | Claude, custom agents, IDEs, terminals    |
| Pluggable backends     | S3, HDFS, Minio, Pure Storage, GCS            | Filesystem, APIs, databases, web services |
| Interoperable tooling  | REST = portable across ecosystems   | MCP = portable across LLM environments    |

Just as Iceberg REST made it possible for **Dremio** to talk to a table created in **Snowflake**, MCP allows a tool exposed in **Python on your laptop** to be used by an LLM in **Claude Desktop**, a VS Code agent, or even a web-based chatbot.

## 🔁 MCP in Action — A Real-World Use Case

Imagine this workflow:
1. You’re coding in an IDE powered by an AI assistant
2. The model wants to read your logs and run some shell scripts
3. Your data lives locally, and your tools are custom-built in Python

With MCP:
- The IDE (host) runs an **MCP client**
- Your Python tool is exposed via an **MCP server**
- The AI assistant (client) calls your custom “tail logs” tool
- The results are streamed back, all through the **standardized protocol**

And tomorrow, you could replace that assistant with a different model or switch to a browser-based environment—and everything would still work.

## The Core Components of MCP

Let’s break down the architecture:

### 1. **Hosts**
These are environments where the LLM application lives (e.g., Claude Desktop, your IDE). They manage connections to MCP clients.

### 2. **Clients**
Embedded in the host, each client maintains a connection to a specific server. It speaks MCP’s message protocol and exposes capabilities upstream to the model.

### 3. **Servers**
Programs that expose capabilities like:
- `resources/list` and `resources/read`
- `tools/list` and `tools/call`
- `prompts/list` and `prompts/get`
- `sampling/createMessage` (to request completions from the model)

Servers can live anywhere: locally on your machine, behind an API, or running in a cloud environment.

## What Can MCP Servers Do?

- **Expose local or remote files** (logs, documents, screenshots, live data)
- **Define tools** for executing business logic, running commands, or calling APIs
- **Provide reusable prompt templates**
- **Request completions from the host model** (sampling)

> And all of this is done in a protocol-agnostic, secure, pluggable format.

## Why This Matters

With MCP, we finally get **interoperability in the AI stack**—a shared interface layer between:
- LLMs and tools
- Agents and environments
- Models and real-world data

It gives us:
- **Modularity**: Swap out components without breaking workflows
- **Reusability**: Build once, use everywhere
- **Security**: Limit what models can see and do through capabilities
- **Observability**: Track how tools are used and what context is passed
- **Language-agnostic integration**: Servers can be written in Python, JavaScript, C#, and more

In short, MCP helps you go from **monolithic, tangled agents** to **modular, composable AI systems**.

## What’s Next: Diving Deeper into MCP Internals

In the next few posts, we’ll dig into each part of MCP:
- Message formats and lifecycle
- How resources and tools are structured
- Sampling, prompts, and real-time feedback loops
- Best practices for building your own MCP server
