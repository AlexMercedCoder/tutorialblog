---
title: A Journey from AI to LLMs and MCP - 5 - AI Agent Frameworks — Benefits and Limitations
date: "2025-04-09"
description: "AI Agent Frameworks — Benefits and Limitations"
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

In our last post, we explored what makes an **AI agent** different from a traditional LLM—memory, tools, reasoning, and autonomy. These agents are the foundation of a new generation of intelligent applications.

But how are these agents built today?

Enter **agent frameworks**—open-source libraries and developer toolkits that let you create goal-driven AI systems by wiring together models, memory, tools, and logic. These frameworks are enabling some of the most exciting innovations in the AI space... but they also come with trade-offs.

In this post, we’ll dive into:
- What AI agent frameworks are
- The most popular frameworks available today
- The benefits they offer
- Where they fall short
- Why we need something more modular and flexible (spoiler: MCP)

## What Is an AI Agent Framework?

An AI agent framework is a development toolkit that simplifies the process of building **LLM-powered systems** capable of reasoning, acting, and learning in real time. These frameworks abstract away much of the complexity involved in working with large language models (LLMs) by bundling together key components like memory, tools, task planning, and context management.

Agent frameworks shift the focus from "generating text" to "completing goals." They let developers orchestrate multi-step workflows where an LLM isn't just answering questions but taking action, executing logic, and retrieving relevant data.

### Memory

Memory in AI agents refers to how information from past interactions is stored, retrieved, and reused. This can be split into two primary types:

- **Short-term memory**: Keeps track of the current conversation or task state. Usually implemented as a conversation history buffer or rolling context window.

- **Long-term memory**: Stores past interactions, facts, or discoveries for reuse across sessions. Typically backed by:
  - A **vector database** (e.g., Pinecone, FAISS, Weaviate)
  - Embedding models that turn text into numerical vectors
  - A retrieval layer that finds the most relevant memories using similarity search

Under the hood:
- Text is embedded into a vector representation (via models like OpenAI’s `text-embedding-ada-002`)
- These vectors are stored in a database
- When new input arrives, it’s embedded and compared to stored vectors
- Top matches are fetched and injected into the LLM prompt as background context

### Tools

Tools are external functions that the agent can invoke to perform actions or retrieve live information. These can include:
- Calling an API (e.g., weather, GitHub, SQL query)
- Executing a shell command or script
- Reading a file or database
- Sending a message or triggering an automation

Frameworks like **LangChain**, **AutoGPT**, and **Semantic Kernel** often use JSON schemas to define tool inputs and outputs. LLMs "see" tool descriptions and decide when and how to invoke them.

Under the hood:
- Each tool is registered with a name, description, and parameter schema
- The LLM is given a list of available tools and their specs
- When the LLM "decides" to use a tool, it returns a structured tool call (e.g., `{"name": "search_docs", "args": {"query": "sales trends"}}`)
- The framework intercepts the call, executes the corresponding function, and feeds the result back to the model

This allows the agent to "act" on the world, not just describe it.

### 🧠 Reasoning and Planning

Reasoning is what enables agents to:
- Decompose goals into steps
- Decide what tools or memory to use
- Track intermediate results
- Adjust their strategy based on feedback

Frameworks often support:
- **React-style loops**: Reasoning + action → observation → repeat
- **Planner-executor separation**: One model plans, another carries out steps
- **Task graphs**: Nodes (LLM calls, tools, decisions) arranged in a DAG

Under the hood:
- The LLM is prompted to plan tasks using a scratchpad (e.g., "Thought → Action → Observation")
- The agent parses the output to decide the next step
- Control flow logic (loops, retries, branches) is often implemented in code, not by the model

This turns the agent into a **semi-autonomous problem-solver**, not just a one-shot prompt engine.

### 🧾 Context Management

Context management is about deciding **what information gets passed into the LLM prompt** at any given time. This is critical because:
- Token limits constrain how much data can be included
- Irrelevant information can degrade model performance
- Sensitive data must be filtered for security and compliance

Frameworks handle context by:
- Selecting relevant memory or documents via vector search
- Condensing history into summaries
- Prioritizing inputs (e.g., task instructions, user preferences, retrieved data)
- Inserting only high-signal content into the prompt

Under the hood:
- Context is assembled as structured messages (usually in OpenAI or Anthropic chat formats)
- Some frameworks dynamically prune, summarize, or chunk data to fit within model limits
- Smart caching or pagination may be used to maintain continuity across long sessions

Agent frameworks abstract complex functionality into composable components:

| Capability        | What It Does                                  | How It Works Under the Hood                             |
|------------------|-----------------------------------------------|----------------------------------------------------------|
| Memory           | Recalls past interactions and facts           | Vector embeddings, similarity search, context injection  |
| Tools            | Executes real-world actions                   | Function schemas, LLM tool calls, output feedback loop   |
| Reasoning        | Plans steps, decides next action              | Thought-action-observation loops, scratchpads            |
| Context Mgmt     | Curates what the model sees                   | Dynamic prompt construction, summarization, filtering    |

Together, these allow developers to build **goal-seeking agents** that work across domains—analytics, support, operations, creative work, and more.

Agent frameworks provide the scaffolding. LLMs provide the intelligence.

## Popular AI Agent Frameworks

Let’s look at some of the leading options:

### LangChain
- **Language**: Python, JavaScript
- **Strengths**:
  - Large ecosystem of components
  - Support for chains, tools, memory, agents
  - Integrates with most major LLMs, vector DBs, and APIs
- **Limitations**:
  - Can become overly complex
  - Boilerplate-heavy for simple tasks
  - Hard to reason about internal agent state

### AutoGPT / BabyAGI
- **Language**: Python
- **Strengths**:
  - Fully autonomous task execution loops
  - Goal-first architecture (recursive reasoning)
- **Limitations**:
  - Unpredictable behavior ("runaway agents")
  - Tooling and error handling are immature
  - Not production-grade (yet)

### Semantic Kernel (Microsoft)
- **Language**: C#, Python
- **Strengths**:
  - Enterprise-ready tooling
  - Strong integration with Microsoft ecosystems
  - Planner APIs and plugin system
- **Limitations**:
  - Steeper learning curve
  - Limited community and examples
  - More opinionated structure

### CrewAI / MetaGPT
- **Language**: Python
- **Strengths**:
  - Multi-agent collaboration
  - Role-based task assignment
- **Limitations**:
  - Heavy on orchestration
  - Still early in maturity
  - Debugging agent interactions is hard

## Benefits of Using an Agent Framework

These tools have unlocked new possibilities for developers building AI-powered workflows. Let’s summarize the major benefits:

| Benefit                        | Description |
|-------------------------------|-------------|
| Abstractions for Tools      | Call APIs or local functions directly from within agent flows |
| Built-in Memory             | Manage short-term context and long-term recall without manual prompt engineering |
| Modular Design              | Compose systems using interchangeable components |
| Planning + Looping          | Support multi-step task execution with feedback loops |
| Rapid Prototyping           | Build functional AI assistants quickly with reusable components |

In short: **agent frameworks supercharge developer productivity** when working with LLMs.

## Where Agent Frameworks Fall Short

Despite all their strengths, modern agent frameworks share some core limitations:

### 1. **Tight Coupling to Models and Providers**
Most frameworks are tightly bound to OpenAI, Anthropic, or Hugging Face models. Switching providers—or supporting multiple—is complex and risky.

> Want to try Claude instead of GPT-4? You might need to refactor your entire chain.

### 2. **Context Management Is Manual and Error-Prone**
Choosing what context to pass to the LLM (memory, docs, prior results) is often left to the developer. It’s:
- Hard to debug
- Easy to overrun token limits
- Non-standardized

### 3. **Lack of Interoperability**
Most frameworks don’t play well together. Tools, memory stores, and prompt logic often live in their own silos.

> You can’t easily plug a LangChain tool into a Semantic Kernel workflow.

### 4. **Hard to Secure and Monitor**
Giving agents tool access (e.g., shell commands, APIs) is powerful but risky:
- No standard for input validation
- No logging/auditing for tool usage
- Few controls for human-in-the-loop approvals

### 5. **Opaque Agent Logic**
Agents often make decisions that are hard to trace or debug. Why did the agent call that tool? Why did it loop forever?

## The Missing Layer: Standardized Context + Tool Protocols

We need a better abstraction layer—something that:
- Decouples LLMs from the tools and data they use
- Allows agents to access secure, structured resources
- Enables modular, composable agents across languages and platforms
- Works with any client, model, or provider

That’s where the **Model Context Protocol (MCP)** comes in.


## What’s Next: Introducing the Model Context Protocol (MCP)

In the next post, we’ll explore:
- What MCP is
- How it enables secure, flexible agent architectures
- Why it's the “USB-C port” for LLMs and tools

We’ll walk through the architecture and show how MCP solves many of the problems outlined in this post.
