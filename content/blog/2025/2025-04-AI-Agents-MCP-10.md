---
title: A Journey from AI to LLMs and MCP - 10 - Sampling and Prompts in MCP — Making Agent Workflows Smarter and Safer
date: "2025-04-14"
description: "Sampling and Prompts in MCP — Making Agent Workflows Smarter and Safer"
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


We’ve now seen how the **Model Context Protocol (MCP)** allows LLMs to read resources and call tools—giving them access to both data and action.

But what if your **MCP server** needs the LLM to make a decision?

What if it needs to:
- Analyze a file before running a tool?
- Draft a message for approval?
- Ask the model to choose between options?

That’s where **Sampling** comes in.

And what if you want to give the user—or the LLM—reusable, structured prompt templates for common workflows?

That’s where **Prompts** come in.

In this final post of the series, we’ll explore:
- How **sampling** allows servers to request completions from LLMs
- How **prompts** enable reusable, guided AI interactions
- Best practices for both features
- Real-world use cases that combine everything we’ve covered so far

## What Is Sampling in MCP?

**Sampling** is the ability for an MCP server to ask the host to run an LLM completion—on behalf of a tool, prompt, or workflow.

It lets your server say:
> “Hey, LLM, here’s a prompt and some context. Please respond.”

### Why is this useful?
- You can **generate intermediate reasoning steps**
- Let the model **propose actions** before executing them
- Create more natural **multi-turn agent workflows**
- Maintain human-in-the-loop **approval and visibility**

## Sampling Flow

Here’s the typical lifecycle:

1. The server sends a `sampling/createMessage` request
2. The host (Claude Desktop, etc.) can **review or modify** the prompt
3. The host runs the LLM completion
4. The result is sent back to the server

> This architecture puts **control and visibility in the hands of the user**, even when the agent logic runs server-side.

## ✉️ Message Format

Here’s an example `sampling/createMessage` request:

```json
{
  "messages": [
    {
      "role": "user",
      "content": {
        "type": "text",
        "text": "Please summarize this log file."
      }
    }
  ],
  "systemPrompt": "You are a helpful developer assistant.",
  "includeContext": "thisServer",
  "maxTokens": 300
}
```

The host chooses which model to use, what context to include, and whether to show the prompt to the user for confirmation.

Response:
```json
{
  "model": "claude-3-sonnet",
  "role": "assistant",
  "content": {
    "type": "text",
    "text": "The log file contains several timeout errors and warnings related to database connections."
  }
}
```
Now the server can act on that response—log it, return it as tool output, or chain it into another step.

### Best Practices for Sampling
#### Best Practice	Why It Matters
- Use clear system prompts	Guides model behavior contextually
- Limit tokens	Prevent runaway completions
- Structure responses	Enables downstream parsing (e.g. JSON, bullets)
- Include only relevant context	Keep prompts focused and cost-effective
- Respect user control	The host mediates the actual LLM call

### What Are Prompts in MCP?
Prompts are reusable, structured templates that servers can expose to clients.

Think of them like slash commands or predefined workflows:

- Pre-filled with helpful defaults

- Accept arguments (e.g. "project name", "file path")

- Optionally include embedded resources

- Surface in the client UI

Prompts help users and LLMs collaborate efficiently by standardizing useful tasks.

### ✨ Prompt Structure
Prompts have:

- A name (identifier)

- A description (for discovery)

- A list of arguments (optional)

- A template for generating messages

Example:
```json
{
  "name": "explain-code",
  "description": "Explain how this code works",
  "arguments": [
    {
      "name": "language",
      "description": "Programming language",
      "required": true
    },
    {
      "name": "code",
      "description": "The code to analyze",
      "required": true
    }
  ]
}
```

Clients use:

- `prompts/list` to discover prompts

- `prompts/get` to resolve a prompt and arguments into messages

### Dynamic Prompt Example
A server might expose:

```json
{
  "name": "analyze-logs",
  "description": "Summarize recent logs and detect anomalies",
  "arguments": [
    {
      "name": "timeframe",
      "required": true
    }
  ]
}
```
When the user (or LLM) runs it with:

```json
{
  "timeframe": "1h"
}
```
The resolved prompt could include:

- A message like: `“Please summarize the following logs from the past hour.”`

- An embedded resource (e.g. `logs://recent?timeframe=1h`)

- Output ready for sampling

### Sampling + Prompts = Dynamic Workflows
When you combine prompts + sampling + tools, you unlock real agent behavior.

Example Workflow:

- User selects prompt: "Analyze logs and suggest next steps"

- Server resolves the prompt and calls sampling/createMessage

- LLM returns: “The logs show repeated auth failures. Suggest checking OAuth config.”

- Server calls tools/call to run check_auth_config

- LLM reviews the result and writes a summary

All controlled via:

- Standardized MCP messages

- User-visible approvals

- Modular server logic

### 🔐 Security and Control

| Feature               | How It's Handled                              |
|-----------------------|-----------------------------------------------|
| Prompt visibility     | Clients decide which prompts to expose        |
| Sampling review       | Hosts can show/reject sampling requests       |
| Input validation      | Servers validate prompt arguments             |
| Model usage control   | Hosts select models and limit token costs     |
| Prompt injection risks| Validate user inputs, escape content if needed|

---

### 🧠 Why These Matter for AI Agents

| Capability        | Sampling Provides              | Prompts Provide                    |
|------------------|---------------------------------|------------------------------------|
| Decision-making   | Dynamic LLM completions         | Guided, structured input           |
| Flexibility       | Server can request help anytime| Users can run reusable workflows   |
| Interactivity     | Chain actions with feedback     | Improve LLM collaboration          |
| Composability     | Mix prompts + tools + resources | Enable custom interfaces           |

---

### 🧩 Wrapping It All Together

Over this 10-part series, we’ve explored the full landscape of AI agent development using **MCP**:

✅ LLMs and how they work  
✅ Fine-tuning, prompting, and RAG  
✅ Agent frameworks and limitations  
✅ MCP’s architecture and interoperability  
✅ Resources and tools  
✅ Prompts and sampling  

MCP gives us standardized, modular building blocks for creating AI agents that are:

- **Portable across environments**  
- **Decoupled from model providers**  
- **Secure, observable, and controlled**
