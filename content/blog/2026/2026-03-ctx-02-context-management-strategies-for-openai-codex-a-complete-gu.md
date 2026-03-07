---
title: "Context Management Strategies for OpenAI Codex: A Complete Guide Across Browser, CLI, and App"
date: "2026-03-07"
description: "OpenAI Codex is not a chatbot. It is an autonomous software engineering agent that runs tasks in isolated cloud sandboxes, operates across a browser interfac..."
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

OpenAI Codex is not a chatbot. It is an autonomous software engineering agent that runs tasks in isolated cloud sandboxes, operates across a browser interface, a command-line tool, and a dedicated macOS app, and can work on multiple tasks in parallel. Because of this architecture, context management in Codex works fundamentally differently from ChatGPT or traditional coding assistants. Instead of conversational context windows, you manage context through persistent configuration files, skill definitions, and project-level instructions that shape how the agent approaches your codebase.

This guide covers every context management mechanism Codex provides, explains when to use each one, and walks through practical strategies for getting the agent to produce reliable, project-aligned results across all three interfaces.

## Understanding How Codex Handles Context

Codex operates with a large context window (approximately 192,000 tokens), which means it can reason about substantial portions of a codebase in a single task. But context in Codex is not just conversation history. The agent assembles its context dynamically from multiple sources:

1. **Your repository:** Codex clones your repo into a sandboxed environment for each task
2. **AGENTS.md files:** Persistent instructions that live in your repository
3. **Skills:** Reusable bundles of instructions, templates, and scripts
4. **Task prompt:** Your natural language description of what to do
5. **Previous interactions:** In the desktop app, persistent project memory carries context across sessions

The key insight is that most of Codex's context comes from your repository itself, not from conversational back-and-forth. This makes context management a matter of preparing your repo and configuration files rather than crafting perfect prompts.

## Thinking About the Right Level of Context

### Minimal Context (Quick Tasks)

For simple, self-contained tasks like "add input validation to this function" or "write unit tests for utils.py," the task prompt and the codebase itself provide sufficient context. Codex will explore the relevant files, understand the patterns, and produce targeted changes. You do not need to provide extensive background.

### Moderate Context (Targeted Changes)

For tasks that require understanding project conventions, architectural decisions, or specific technical requirements, provide that context in your AGENTS.md file or in the task prompt. For example: "Refactor the authentication module to use JWT instead of session cookies. Our API follows REST conventions and uses Express 5 middleware patterns."

### Comprehensive Context (Large Features or Ongoing Work)

For multi-step features, large refactors, or ongoing development work, invest in Skills and detailed AGENTS.md files. These provide the agent with your coding standards, architectural patterns, testing requirements, and deployment constraints. The desktop app's persistent project memory also helps here by retaining context across sessions.

## AGENTS.md: The Foundation of Codex Context

AGENTS.md is the most important context management tool for Codex. It is a Markdown file that lives in your repository and provides persistent instructions to the agent. Codex reads AGENTS.md at the beginning of every task.

### How It Works

Place an `AGENTS.md` file at the root of your repository. Codex loads it automatically before starting any task. Think of it as a briefing document that tells the agent everything it needs to know about your project.

### What to Include

```markdown
# AGENTS.md

## Project Overview
This is a Next.js 15 application with a Python FastAPI backend.
The frontend uses TypeScript, Tailwind CSS, and Zustand for state management.
The backend uses SQLAlchemy with PostgreSQL.

## Coding Standards
- Use functional components with hooks (no class components)
- All API endpoints must include input validation using Pydantic
- Write tests for every new function using pytest (backend) and Vitest (frontend)
- Use conventional commit messages: feat:, fix:, refactor:, docs:, test:

## Architecture
- Frontend routes are in src/app/ (App Router)
- API routes are in backend/api/routes/
- Database models are in backend/models/
- Shared types are in shared/types/

## Constraints
- Do not modify the database schema without explicit approval
- Do not add new dependencies without noting them in the PR description
- All environment variables must be documented in .env.example
```

### Hierarchical AGENTS.md Files

For monorepos or large projects, you can place AGENTS.md files at different levels:

- **Root level:** Global project instructions
- **Service directories:** Service-specific conventions (e.g., `backend/AGENTS.md`, `frontend/AGENTS.md`)
- **Global:** `~/.codex/AGENTS.md` for personal preferences that apply across all projects

More specific files supplement (not replace) more general ones. The agent combines all applicable AGENTS.md files when executing a task.

### Best Practices

- Keep it updated. Stale AGENTS.md instructions lead to stale agent behavior.
- Be specific about constraints. "Follow best practices" is meaningless to an agent. "All database queries must use parameterized statements, never string interpolation" is actionable.
- Include examples of your code style. Show the agent what "good" looks like in your codebase.
- Document your testing strategy. Tell the agent which test framework to use, where tests live, and what coverage expectations you have.

## Skills: Reusable Workflow Bundles

Skills are a step beyond AGENTS.md. They are reusable bundles that package instructions, code templates, API configurations, and scripts into a single invocable unit. Skills let you codify complex workflows so the agent can execute them reliably.

### When to Use Skills

- You have a repeatable workflow (deploying to staging, onboarding a new API endpoint, migrating a database)
- The workflow requires multiple steps that need to happen in a specific order
- You want consistency across team members using Codex

### Creating a Skill

Skills are defined as structured folders with a manifest file:

```markdown
# SKILL.md

---
name: create-api-endpoint
description: Creates a new REST API endpoint with validation, tests, and documentation
---

## Steps
1. Create the route file in backend/api/routes/
2. Define the Pydantic request/response models in backend/api/schemas/
3. Implement the business logic in backend/services/
4. Write pytest tests in backend/tests/
5. Add the endpoint to the OpenAPI documentation
6. Update the API changelog

## Templates
Use the existing endpoint at backend/api/routes/users.py as the reference pattern.

## Validation
- Run pytest after creating the endpoint
- Verify the OpenAPI spec is valid
- Check that all response codes are documented
```

Skills can be invoked explicitly by name or triggered automatically when the agent detects a task that matches the skill's description.

## The Three Interfaces: Context Differences

### Browser (ChatGPT Sidebar)

The browser interface runs Codex from within the ChatGPT web application. Context management here is straightforward:

- **Repository:** Select which repo the agent works on
- **Task prompt:** Describe what you want done
- **AGENTS.md:** Loaded automatically from the repo
- **Results:** The agent produces a diff or pull request for review

This interface is best for individual tasks that you want to review before merging. Context is session-scoped; each task gets a fresh sandbox.

### CLI (Command Line)

The Codex CLI (`codex`) runs in your terminal and operates on your local codebase. It offers more control over context:

- **Approval modes:** Choose between Chat (interactive), Agent (approval for writes), and Full Access (autonomous)
- **MCP servers:** The CLI supports MCP server integration for connecting external tools
- **File references:** Point the agent at specific files or directories
- **Image inputs:** Pass screenshots or design mockups alongside prompts
- **Interactive mode:** Have a conversation with the agent about your codebase

The CLI is the most flexible interface for context management because you can combine AGENTS.md, MCP servers, and direct file references in a single session.

### Desktop App (macOS)

The desktop app is the most powerful interface for sustained work:

- **Persistent project memory:** The app retains project history and context across sessions, so you do not have to re-establish context every time
- **Multi-agent orchestration:** Run multiple agents on different tasks simultaneously, each in its own Git worktree
- **Visual task management:** See all running and completed tasks in a unified interface
- **Skills management:** Create, organize, and invoke Skills from the app

The desktop app is best for ongoing development work where you are regularly delegating tasks to Codex throughout your day.

## MCP Server Support

The Codex CLI supports the Model Context Protocol (MCP), allowing you to connect external tools and data sources to the agent.

### What MCP Enables

- **Database access:** Let the agent query your development database to understand schema and data patterns
- **Browser automation:** Connect a Playwright MCP server so the agent can test frontend changes by interacting with a real browser
- **API integration:** Give the agent access to your project management tools, documentation systems, or monitoring dashboards
- **Custom tools:** Build MCP servers that expose your organization's internal tools to the agent

### When to Use MCP

MCP is most valuable when the agent needs information that is not in the repository:

- Understanding runtime behavior (logs, database state, API responses)
- Verifying changes against a running application
- Accessing external specifications or documentation
- Interacting with CI/CD systems or deployment tools

### When NOT to Use MCP

For tasks that are purely code-level (refactoring, writing tests, fixing type errors), MCP adds unnecessary complexity. The codebase itself provides sufficient context. Use MCP when the agent needs to interact with the world outside the code.

### Configuration

MCP servers are configured through the CLI:

```bash
# Add a Playwright MCP server for browser testing
codex mcp add playwright

# Add a custom database MCP server
codex mcp add my-db-server --command "node /path/to/db-mcp.js"
```

## External Documents: When to Use PDFs vs. Markdown

Codex primarily operates on code, but there are situations where providing external documents improves results.

### Use Markdown When:
- Writing AGENTS.md or Skills (required format)
- Providing architectural decision records (ADRs)
- Sharing coding standards or style guides
- Documenting API specifications

Markdown is the native format for Codex context. It parses cleanly, supports code blocks, and is version-controllable in Git.

### Use PDFs When:
- Referencing published specifications (RFC documents, protocol specs)
- Sharing design documents with diagrams that do not translate well to Markdown
- Providing compliance or regulatory requirements that exist in PDF form

In practice, Markdown is almost always the better choice for Codex. If you have a PDF specification, consider extracting the relevant sections into a Markdown file in your repository.

## Automations: Scheduled Context Processing

Codex supports Automations, which are scheduled tasks that run in the background. These allow you to set up recurring agent work that automatically processes your codebase with predefined context.

### Use Cases

- **Daily code reviews:** Schedule the agent to review new PRs every morning
- **Dependency audits:** Weekly check for outdated or vulnerable dependencies
- **Documentation updates:** Automatically update API documentation after code changes
- **Test maintenance:** Periodically scan for broken or flaky tests

Automations use the same AGENTS.md and Skills context as manual tasks, ensuring consistency between scheduled and ad-hoc work.

## Advanced Patterns

### The Context Layering Strategy

Combine multiple context sources for complex tasks:

1. **Global AGENTS.md** (in `~/.codex/`): Personal preferences and universal standards
2. **Project AGENTS.md** (in repo root): Project architecture and conventions
3. **Directory AGENTS.md** (in subdirectories): Component-specific patterns
4. **Skills:** Repeatable workflows for common tasks
5. **Task prompt:** The specific thing you want done now
6. **MCP servers:** Live external data for verification

Each layer adds specificity without overriding the layers above it.

### The Multi-Agent Pattern

Use the desktop app to run parallel agents on different aspects of a feature:

- Agent 1: Implements the backend API endpoint
- Agent 2: Writes the frontend component
- Agent 3: Creates integration tests

Each agent runs in its own Git worktree, so their changes do not conflict. Review and merge the results when all agents complete.

### The Exploration-First Pattern

Before giving Codex a complex task, use a "planning" prompt:

"Analyze the authentication module in backend/auth/. Describe the current architecture, identify potential issues, and suggest improvements. Do not make any changes."

Review the agent's analysis, then use it as context for the actual implementation task. This prevents the agent from making changes based on incomplete understanding.

## Common Mistakes

1. **Skipping AGENTS.md:** Without AGENTS.md, the agent has no guidance on project conventions and will produce code that technically works but does not match your style.

2. **Overly broad tasks:** "Improve the application" is too vague. "Add rate limiting to the /api/users endpoint using express-rate-limit with a 100-request-per-minute window" gives the agent clear parameters.

3. **Ignoring the review step:** Codex produces diffs and PRs for a reason. Always review the output, especially for tasks involving security, database changes, or public-facing features.

4. **Not using Skills for repeatable work:** If you find yourself writing the same type of task prompt repeatedly, extract it into a Skill.

5. **Using MCP when you do not need it:** Adding MCP servers increases complexity and potential failure points. Only connect external tools when the task genuinely requires external data.

## Go Deeper

To learn more about working effectively with AI coding tools, context engineering, and agentic development workflows, check out these resources by Alex Merced:

- [The 2026 Guide to AI-Assisted Development](https://www.amazon.com/2026-Guide-AI-Assisted-Development-Engineering-ebook/dp/B0GQW7CTML/) covers AI-assisted development workflows, prompt engineering, and context strategies for software engineers.

- [The 2026 Guide to Lakehouses, Apache Iceberg and Agentic AI](https://www.amazon.com/Lakehouses-Apache-Iceberg-Agentic-Hands/dp/B0GQNY21TD/) explores how AI agents are reshaping data architecture and how to build systems that support agentic workflows.

And for a fictional take on where AI is heading:

- [The Emperors of A.I. Valley: A Novel of Power, Code, and the War for the Future](https://www.amazon.com/Emperors-I-Valley-Novel-Future/dp/B0GQHKF4ZT/) is a novel about the power struggles and ethical dilemmas behind the companies building the most powerful AI systems in the world.
