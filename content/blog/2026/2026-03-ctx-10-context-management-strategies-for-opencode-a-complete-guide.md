---
title: "Context Management Strategies for OpenCode: A Complete Guide to the Open-Source Terminal AI Agent"
date: "2026-03-07"
description: "OpenCode is an open-source terminal-based AI coding agent that prioritizes privacy, local-first operation, and broad model provider support. Built as a TUI (..."
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

OpenCode is an open-source terminal-based AI coding agent that prioritizes privacy, local-first operation, and broad model provider support. Built as a TUI (terminal user interface) application, it runs entirely in your terminal and supports dozens of LLM providers from OpenAI and Anthropic to local models through Ollama. Its context management system is built around configuration files, session persistence, MCP integration, and a dual-agent architecture that separates planning from code generation.

This guide covers every context management mechanism OpenCode offers and explains how to configure them for effective development workflows, regardless of which model provider you choose.

## The TUI Advantage for Context Management

OpenCode's TUI (Terminal User Interface) provides a structured visual interface within your terminal. Unlike bare CLI tools where you interact through plain text, the TUI offers:

- A conversation panel showing the full history with syntax-highlighted code blocks
- A file browser for navigating your project structure
- A status bar showing the active model, session state, and token usage
- Visual indicators for agent mode (Plan vs. Build)

The TUI makes context management more tangible because you can see what the agent is working with. Token usage indicators help you understand when you are approaching context limits, and the session panel lets you manage conversation history visually.

## How OpenCode Manages Context

OpenCode assembles its context from several sources:

1. **opencode.json** - project-level configuration and instructions
2. **Session history** - SQLite-backed persistent sessions
3. **MCP server connections** - external tools and data
4. **LSP (Language Server Protocol)** integration - real-time code intelligence
5. **The codebase** - files, directories, and project structure
6. **Custom commands** - user-defined reusable operations

What distinguishes OpenCode from other terminal agents is its architectural separation between "Build" and "Plan" agents. The Build agent writes code and makes changes. The Plan agent reasons about architecture and strategy without modifying files. This separation affects how you structure context: planning tasks need architectural context, while building tasks need implementation detail.

## opencode.json: Project Configuration

The `opencode.json` file in your project root is the primary configuration mechanism. It defines provider settings, model selection, and project-specific context.

### Basic Configuration

```json
{
  "$schema": "https://opencode.ai/config.schema.json",
  "provider": {
    "name": "anthropic",
    "model": "claude-sonnet-4.5"
  },
  "context": {
    "instructions": "This is a Python FastAPI application with PostgreSQL. Use Ruff for linting and pytest for testing. Follow PEP 8 strictly.",
    "include": ["src/", "tests/", "docs/"],
    "exclude": ["*.pyc", "__pycache__/", ".venv/"]
  }
}
```

### Context Instructions

The `context.instructions` field functions like CLAUDE.md or GEMINI.md for other tools. Include:

- Your technology stack and versions
- Coding conventions and style preferences
- Testing strategy and framework
- Architecture decisions and patterns
- Build and deployment commands

### Include and Exclude Patterns

Control what OpenCode sees by specifying include and exclude patterns. This focuses the agent's attention on relevant code and prevents it from wasting context on generated files, dependencies, or build artifacts.

### Provider Flexibility

OpenCode supports a wide range of providers:

| Provider | Models | Notes |
|---|---|---|
| **OpenAI** | GPT-4o, o3, etc. | Cloud-hosted |
| **Anthropic** | Claude Sonnet, Opus | Cloud-hosted |
| **Google** | Gemini Pro, Flash | Cloud-hosted |
| **Ollama** | Llama, Mistral, etc. | Local, private |
| **OpenRouter** | Many models | Multi-provider routing |
| **Custom endpoints** | Any OpenAI-compatible API | Self-hosted |

This flexibility means you can choose the right model for your context needs. Local models through Ollama keep all context on your machine. Cloud models provide more capability but send your context to external servers.

## The Dual-Agent Architecture: Build vs. Plan

OpenCode's most distinctive context management feature is its separation of planning and execution into two independent agents.

### The Plan Agent

The Plan agent reasons about architecture, strategy, and design without making any file changes. Use it for:

- Analyzing a codebase before making changes
- Designing an implementation approach
- Evaluating tradeoffs between different solutions
- Understanding unfamiliar code

The Plan agent receives the same project context (opencode.json, codebase, MCP) but operates in a read-only mode. This is valuable because it means you can explore and discuss ideas without risk of unintended changes.

### The Build Agent

The Build agent writes code, creates files, runs commands, and makes changes to your project. It uses the planning context plus implementation-specific details:

- The specific files that need modification
- Test commands to verify changes
- Style and formatting requirements

### Switching Between Agents

Switch between Plan and Build during a session to match the current need:

1. **Start with Plan:** "Analyze the authentication module and suggest how to add OAuth support"
2. **Review the plan:** Evaluate the agent's architectural proposal
3. **Switch to Build:** "Implement the OAuth integration following the approach you described"

This two-phase approach prevents the common problem of AI agents diving into implementation before understanding the architecture.

## Session Persistence

OpenCode uses SQLite to persist session data across terminal sessions. This means you can close your terminal, come back later, and pick up where you left off.

### What Gets Persisted

- Conversation history (messages and responses)
- File changes made during the session
- Agent state (Plan vs. Build mode)
- Active context (which files were being discussed)

### Session Management

- Start a new session for unrelated work
- Continue an existing session when resuming previous work
- Clear session history when accumulated context becomes counterproductive

### Context Compaction

For long sessions, OpenCode supports context compaction. This summarizes older conversation history to free up context window space while retaining the essential information. Compaction is automatic and configurable: you can control how aggressively it summarizes based on your model's context window size.

This is particularly important when using models with smaller context windows (like local Ollama models with 8K or 32K contexts) where every token counts. Cloud models with 128K or 200K windows have much more room, but even they benefit from compaction during extended sessions.

### Context Window Management Across Providers

Different providers offer different context window sizes, and your strategy should adapt:

| Provider Tier | Context Size | Strategy |
|---|---|---|
| **Small (8K-32K)** | Ollama local models | Aggressive compaction, focused sessions, minimal background context |
| **Medium (64K-128K)** | GPT-4o, Claude Sonnet | Standard compaction, moderate session length, room for codebase context |
| **Large (200K+)** | Claude Opus, Gemini Pro | Minimal compaction needed, can handle long sessions with extensive context |

Understanding your working model's context limit helps you decide how much context to load via `opencode.json` versus providing interactively. With a small local model, lean heavily on precise `include` patterns to keep only the most relevant files in context. With a large cloud model, you can afford broader context.

## MCP Server Support

OpenCode supports MCP through the `opencode mcp` command, providing integration with external tools and data.

### Configuration

```bash
# Add an MCP server
opencode mcp add my-db-server -- npx @my-org/db-mcp-server

# List configured servers
opencode mcp list

# Remove a server
opencode mcp remove my-db-server
```

MCP servers can also be configured in `opencode.json`:

```json
{
  "mcp": {
    "servers": {
      "filesystem": {
        "command": "npx",
        "args": ["-y", "@anthropic/mcp-server-filesystem", "./"]
      }
    }
  }
}
```

### When to Use MCP with OpenCode

The same principles apply as with other terminal agents: use MCP when the task requires data from outside the codebase (databases, APIs, external services). For code-only work, OpenCode's built-in file access is sufficient.

One consideration specific to OpenCode: if you are using a local model through Ollama, MCP adds server-side processing that runs locally. There is no additional privacy concern since everything stays on your machine.

## LSP Integration: Real-Time Code Intelligence

OpenCode integrates with Language Server Protocol services to provide richer code context. LSP gives the agent:

- Type information and function signatures
- Import resolution and dependency tracking
- Error and warning diagnostics from your language's toolchain
- Symbol navigation and reference finding

This means OpenCode understands your code at a deeper level than simple text analysis. When you ask about a function, the agent knows its type signature, where it is called from, and what it depends on.

### Why LSP Matters for Context

LSP provides structured context that would otherwise require the agent to infer from raw code. Knowing that a variable is of type `List[UserModel]` is more precise than the agent guessing from how the variable is used. This structured understanding reduces errors and produces more accurate code generation.

## Custom Commands

OpenCode supports user-defined custom commands that encapsulate common operations with predefined context:

```json
{
  "commands": {
    "review": {
      "description": "Review the current branch for issues",
      "prompt": "Review all changes in the current branch compared to main. Check for: security issues, performance problems, missing error handling, and test coverage gaps."
    },
    "test-all": {
      "description": "Run and analyze the full test suite",
      "prompt": "Run the complete test suite. Report any failures, flaky tests, or tests that take unusually long. Suggest fixes for any failures."
    }
  }
}
```

Custom commands combine a descriptive name with a predefined prompt, creating reusable context bundles for common workflows.

## Thinking About Context Levels in OpenCode

### Minimal Context

For quick questions about the codebase, just ask. OpenCode will explore files as needed.

### Moderate Context

For feature work, set up your `opencode.json` with clear instructions and use the Plan agent first to establish understanding before switching to Build.

### Heavy Context

For complex refactoring or architectural changes, combine: detailed `opencode.json` instructions, the Plan agent for architecture analysis, MCP servers for database or service context, and custom commands for verification steps.

## External Documents: PDFs vs. Markdown

### Markdown Is Preferred

OpenCode works with text-based formats. Project context documents, architecture decision records, and coding standards should be Markdown files in your repository.

### PDFs

If you have reference material in PDF format, convert the relevant sections to Markdown. OpenCode does not have built-in PDF parsing, so text-based formats are more reliable.

## Advanced Patterns

### The Privacy-First Development Pattern

Use Ollama with a local model for sensitive codebases:
1. Install Ollama and download a capable model (Llama 3.1, Mistral Large, etc.)
2. Configure `opencode.json` to use the local Ollama endpoint
3. All context stays on your machine with zero network calls

This is particularly valuable for proprietary code, pre-launch features, or security-sensitive applications.

### The Plan-Then-Build Pattern

1. Start with the Plan agent to analyze the codebase
2. Discuss the architecture and design approach
3. Switch to Build once you agree on the plan
4. Use custom commands to verify the implementation

### The Multi-Provider Context Strategy

Use different providers for different context needs:
- A large cloud model (GPT-4o, Claude Opus) for complex architectural planning
- A fast, small model for quick edits and simple tasks
- A local model for sensitive code that should not leave your machine

Switch providers in `opencode.json` based on the current task.

## Common Mistakes

1. **Not configuring opencode.json.** Without it, OpenCode has no project context beyond what it can infer from file exploration.

2. **Using Build when you should Plan.** Jumping to code changes without planning leads to rework. Use the Plan agent first for anything non-trivial.

3. **Ignoring context compaction.** With smaller model context windows, long sessions degrade quality. Let compaction do its job, or start fresh sessions.

4. **Not leveraging LSP.** Ensure your language's LSP server is installed and running. The structured code intelligence significantly improves agent accuracy.

5. **Skipping custom commands for repeated tasks.** If you run the same kind of review or test analysis frequently, create a custom command.

6. **Using cloud models for sensitive code without consideration.** If code privacy matters, use Ollama with local models. The trade-off is sometimes reduced capability, but the privacy guarantee is absolute.

## Go Deeper

To learn more about AI-assisted development and context management strategies, check out these resources by Alex Merced:

- [The 2026 Guide to AI-Assisted Development](https://www.amazon.com/2026-Guide-AI-Assisted-Development-Engineering-ebook/dp/B0GQW7CTML/) covers AI-assisted development workflows, prompt engineering, and context strategies for software engineers.

- [The 2026 Guide to Lakehouses, Apache Iceberg and Agentic AI](https://www.amazon.com/Lakehouses-Apache-Iceberg-Agentic-Hands/dp/B0GQNY21TD/) explores how AI agents are reshaping data architecture and how to build systems that support agentic workflows.

And for a fictional take on where AI is heading:

- [The Emperors of A.I. Valley: A Novel of Power, Code, and the War for the Future](https://www.amazon.com/Emperors-I-Valley-Novel-Future/dp/B0GQHKF4ZT/) is a novel about the power struggles and ethical dilemmas behind the companies building the most powerful AI systems in the world.
