---
title: "Context Management Strategies for Gemini CLI: A Complete Guide to Terminal-Native AI Development"
date: "2026-03-07"
description: "Gemini CLI is an open-source terminal agent powered by Gemini models that operates directly in your command line. It brings Google's AI capabilities into the..."
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

Gemini CLI is an open-source terminal agent powered by Gemini models that operates directly in your command line. It brings Google's AI capabilities into the environment where many developers already live, with a context management system built around hierarchical configuration files, persistent memory, MCP server integration, and direct codebase interaction. Unlike web-based tools where context is managed through uploads and conversation, Gemini CLI assembles its context from your project structure, your instruction files, and the tools you connect to it.

This guide covers every context management mechanism in Gemini CLI and explains how to configure them for productive development workflows.

## How Gemini CLI Assembles Context

Gemini CLI builds its working context from multiple sources, loaded in a specific hierarchy:

1. **Global GEMINI.md** (`~/.gemini/GEMINI.md`) - personal preferences that apply everywhere
2. **Project GEMINI.md** (in your project directory, walking up to the root) - project conventions
3. **Subdirectory GEMINI.md files** - component-specific instructions
4. **Memory entries** - facts you have told the CLI to remember
5. **MCP server tools** - external data sources and capabilities
6. **The current codebase** - files, dependencies, project structure
7. **The conversation** - your prompts and responses in the current session

More specific sources take precedence over general ones. A subdirectory GEMINI.md instruction overrides a project-level GEMINI.md instruction on the same topic.

## GEMINI.md: Persistent Project Context

GEMINI.md is the foundational context mechanism. It is a Markdown file that Gemini CLI loads automatically before every interaction.

### File Hierarchy

| Location | Scope | Purpose |
|---|---|---|
| `~/.gemini/GEMINI.md` | All projects | Personal coding style, universal preferences |
| `./GEMINI.md` (project root) | Current project | Architecture, stack, conventions |
| `./src/GEMINI.md` | Specific directory | Module-specific patterns |

### What to Include

```markdown
# GEMINI.md

## Project: E-Commerce API
- Framework: Express.js on Node 22
- Database: PostgreSQL 16 with Drizzle ORM
- Testing: Vitest with supertest for API tests
- Deployment: Docker containers on Cloud Run

## Code Conventions
- Use ESM imports (no CommonJS require)
- All route handlers are async functions
- Error handling uses a centralized error middleware
- SQL migrations use Drizzle Kit

## Architecture
- Routes: src/routes/
- Services: src/services/ (business logic)
- Models: src/models/ (Drizzle schema)
- Middleware: src/middleware/
- Tests: tests/ (mirrors src/ structure)

## Do Not
- Do not use default exports
- Do not install packages without noting them
- Do not modify migration files after they have been applied
```

### Modular GEMINI.md Files

For complex projects, GEMINI.md files can import other Markdown files. This keeps individual files focused while allowing the CLI to assemble comprehensive context:

```markdown
# GEMINI.md
See also:
- @docs/coding-standards.md
- @docs/api-conventions.md
- @docs/testing-strategy.md
```

### The /init Command

If you are starting a new project or onboarding Gemini CLI to an existing one, run `/init`. This command analyzes your project structure and generates a starting GEMINI.md file that captures:

- Detected frameworks and languages
- Project structure
- Build and test commands
- Basic conventions inferred from the code

Review and edit the generated file. The auto-detection is a starting point, not a finished product. Add your team's conventions, architectural decisions, and quality standards to make it comprehensive. The value of /init is that it saves you from writing the boilerplate sections (project type, folder structure, detected dependencies) so you can focus on the human-knowledge sections.

## Memory: Persistent Facts Across Sessions

Gemini CLI's memory system stores persistent facts that apply across all sessions and projects (when stored globally).

### Adding Memories

```
/memory add We use the Google Python Style Guide for all Python code
/memory add Our PostgreSQL database runs on port 5433, not the default 5432
/memory add Always use UTC timestamps in database columns
```

### Viewing Memories

```
/memory show
```

This displays all active memories, including those from GEMINI.md files and explicit memory entries.

### Refreshing Context

If you update GEMINI.md files outside of the current session, use:

```
/memory refresh
```

This reloads all context files without restarting the CLI.

### Memory Best Practices

- Use memory for facts that are true across projects (your personal conventions)
- Use GEMINI.md for project-specific context
- Keep memories concise: "Use Ruff for Python linting" rather than a paragraph explaining why
- Review memories periodically with `/memory show` and remove outdated entries

## Direct Context Injection with @

The `@` command lets you inject specific files or directories directly into a prompt:

```
@src/models/user.ts How should I add a preferences field to this model?
```

```
@src/routes/ Review all route handlers for consistent error handling
```

This is the most direct way to give Gemini CLI context about specific files. Unlike other tools that require uploads, the @ command reads from your local file system in real time.

### When to Use @

- When your question relates to specific files that Gemini CLI might not automatically discover
- When you want to ensure the agent reads the latest version of a file
- When you want to focus the agent on a particular section of the codebase

## MCP Server Support

Gemini CLI supports MCP through its `settings.json` configuration. MCP servers extend the CLI's capabilities by connecting it to external tools and data sources.

### Configuration

MCP servers are configured in `settings.json`:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-github"]
    },
    "postgres": {
      "httpUrl": "http://localhost:3001/mcp"
    },
    "custom-tool": {
      "command": "python",
      "args": ["./scripts/my-mcp-server.py"],
      "env": {
        "API_KEY": "${MY_API_KEY}"
      }
    }
  }
}
```

Note the environment variable expansion (`${MY_API_KEY}`), which lets you keep credentials out of configuration files.

### Transport Options

Gemini CLI supports three MCP transport mechanisms:

- **stdio:** The server runs as a local process (most common for development)
- **SSE (Server-Sent Events):** For remote servers using the `url` property
- **HTTP Streaming:** For modern HTTP-based servers using the `httpUrl` property

### MCP Prompts as Slash Commands

MCP servers can expose predefined prompts as slash commands. If a connected server exposes a prompt named "analyze-performance," you can invoke it with `/analyze-performance` directly in the CLI.

### When to Use MCP

**Use MCP for:** Database access, GitHub integration, browser automation, accessing internal APIs, connecting to project management tools

**Skip MCP when:** The task is code-only and the files are already on your local system. Gemini CLI can read files and run terminal commands directly without MCP.

## Dynamic Shell Context

One of Gemini CLI's unique strengths is its ability to execute shell commands to gather real-time context. This means the agent can check the actual state of your system rather than relying on static descriptions.

### Practical Use Cases

- **Check current Git state:** The agent can run `git status` or `git log` to understand what has changed recently, which branch you are on, and what commits are pending
- **Inspect running services:** Commands like `docker ps` or `kubectl get pods` give the agent visibility into your running infrastructure
- **Read live configuration:** The agent can check environment variables, read `.env` files, or inspect running process configurations
- **Verify test results:** Running your test suite and analyzing the output gives the agent concrete data about what is passing and what is failing

This dynamic context is especially valuable for debugging workflows, where the agent needs to understand both the code and the runtime environment.

## Automatic Codebase Exploration

Gemini CLI automatically explores your project structure using tools that respect `.gitignore` patterns. It will not waste context on `node_modules/`, `__pycache__/`, or build output. It also detects project types from configuration files (for example, finding `package.json` tells it this is a Node.js project).

This automatic exploration means you can ask broad questions like "What database does this project use?" and the agent will find the answer by scanning relevant configuration files. However, GEMINI.md files significantly improve results by providing context that cannot be inferred from code alone: team decisions, architectural rationale, and development philosophy.

## Choosing Gemini CLI vs. Other Terminal Agents

**Choose Gemini CLI over Claude Code when:** You prefer Google's Gemini models, need the hierarchical GEMINI.md system, or want MCP prompts exposed as slash commands.

**Choose Gemini CLI over OpenCode when:** You want a simpler, more focused tool without OpenCode's TUI interface, or you are already invested in the Google ecosystem.

**Choose Gemini CLI over Codex CLI when:** You want an open-source tool you can inspect and modify, or you prefer interactive terminal sessions over Codex's sandbox model.

## Thinking About the Right Level of Context

### For Quick Questions

Just ask. Gemini CLI can explore your codebase on its own:

```
What database ORM does this project use?
```

The CLI will scan your project files, find the relevant configuration, and answer.

### For Targeted Changes

Provide file references and constraints:

```
@src/services/auth.ts Add rate limiting to the login function. 
Use express-rate-limit with a 100-request-per-minute window.
```

### For Large Features

Invest in GEMINI.md, set up relevant MCP servers, and use the multi-step approach: plan first, then implement.

## External Documents: PDFs vs. Markdown

### Markdown Is Native

GEMINI.md files, memory entries, and context documents should all be Markdown. The format is native to Gemini CLI's context system.

### PDFs Need Conversion

Gemini CLI primarily works with text-based formats. If you have reference material in PDF form, extract the relevant sections into Markdown files and place them in your project directory. This makes them accessible via @ references and GEMINI.md imports.

## Advanced Patterns

### The Context-Aware Shell Script

Create shell scripts that set up project context before launching Gemini CLI:

```bash
#!/bin/bash
# Start Gemini CLI with project-specific context
cd ~/projects/my-api
export DB_URL="postgresql://dev@localhost:5433/mydb"
gemini
```

This ensures the CLI starts in the right directory with the right environment variables, reducing context-switching overhead.

### The Exploration-First Pattern

Before starting a new feature:

```
Analyze the current authentication system.
Describe the flow from login to token validation.
Do not make any changes.
```

Review the analysis, correct any misunderstandings, and then proceed with the implementation task.

### The Automated Context Generation Pattern

Use the `/init` command periodically (or a custom script) to regenerate your GEMINI.md file as the project evolves. This keeps the context file synchronized with the actual state of the codebase.

## Common Mistakes

1. **No GEMINI.md.** Without it, the CLI starts with no project context. It can still explore your codebase, but it will make assumptions that may not match your conventions.

2. **Stale GEMINI.md.** A GEMINI.md that references frameworks or patterns you no longer use creates confusion. Update it when you make significant changes.

3. **Overloading memory.** Memory is for brief, stable facts. Do not try to store entire documents as memory entries.

4. **Adding unnecessary MCP servers.** Each connected server adds tools that the CLI must evaluate. Only connect servers you actively use.

5. **Not using @ for targeted questions.** Pointing Gemini CLI at specific files with @ produces more focused results than letting it search the entire project.

6. **Ignoring /init.** For new projects, /init generates a solid starting GEMINI.md in seconds. Review and refine it rather than writing from scratch.

7. **Forgetting to refresh after external edits.** If you edit GEMINI.md files in your text editor, run `/memory refresh` so the CLI picks up the changes immediately.

8. **Writing overly long GEMINI.md files.** GEMINI.md should be focused and scannable. If it exceeds 500 lines, consider splitting it into modular imported files. A concise GEMINI.md with clear sections is more effective than a sprawling document.

## Go Deeper

To learn more about working effectively with AI coding agents and context management strategies, check out these resources by Alex Merced:

- [The 2026 Guide to AI-Assisted Development](https://www.amazon.com/2026-Guide-AI-Assisted-Development-Engineering-ebook/dp/B0GQW7CTML/) covers AI-assisted development workflows, prompt engineering, and context strategies for software engineers.

- [The 2026 Guide to Lakehouses, Apache Iceberg and Agentic AI](https://www.amazon.com/Lakehouses-Apache-Iceberg-Agentic-Hands/dp/B0GQNY21TD/) explores how AI agents are reshaping data architecture and how to build systems that support agentic workflows.

And for a fictional take on where AI is heading:

- [The Emperors of A.I. Valley: A Novel of Power, Code, and the War for the Future](https://www.amazon.com/Emperors-I-Valley-Novel-Future/dp/B0GQHKF4ZT/) is a novel about the power struggles and ethical dilemmas behind the companies building the most powerful AI systems in the world.
