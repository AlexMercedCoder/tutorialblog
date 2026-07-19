---
title: "GSA MCP Servers for Open Data AI Agents"
date: "2026-07-13"
description: "An in-depth exploration of gsa mcp servers for open data ai agents"
author: "Alex Merced"
category: "MCP"
tags:
  - MCP
  - Government
  - AI Agents
  - Open Data
canonical: "https://iceberglakehouse.com/posts/gsa-model-context-protocol-server-hackathon-open-data-ai-agents/"
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/gsa-model-context-protocol-server-hackathon-open-data-ai-agents/).

The U.S. government publishes hundreds of thousands of datasets through [Data.gov](https://data.gov/) and agency portals, and almost none of them are shaped for an AI agent to use directly. An agent can download a CSV, but it cannot ask that CSV what columns it has, what the units are, which rows it is allowed to see, or how to filter for the answer a person actually wants. That gap between "public data exists" and "an agent can use public data responsibly" is the interesting problem, and it is the reason the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) has become a useful way to think about open data.

Reports of a [General Services Administration](https://www.gsa.gov/) AI hackathon centered on MCP servers point at this shift. I want to be careful here: at the time of writing I have not independently confirmed the official GSA announcement, the exact dates, the challenge scope, or whether an MCP server was a hard requirement. Treat the hackathon as a signal of direction rather than a settled fact, and treat the architecture below as the durable lesson regardless of any single event. The strategic point holds either way: if agents are going to work with public or private datasets, someone has to turn those datasets into governed tools first.

## Why Federal Open Data Needs AI-Ready Interfaces

A public dataset and an agent-ready tool are not the same artifact. Consider what a typical open data release actually contains. There is usually a bulk file such as a CSV or a set of Parquet files. There is sometimes a REST API with query parameters. There is metadata, often a data dictionary in a PDF or a landing page written for a human analyst. All of this assumes a person is in the loop: someone reads the documentation, understands the domain, writes the query, and interprets the result.

An AI agent has none of that context by default. When you hand a model a raw API endpoint, you are asking it to guess the schema, invent valid parameter values, and hope the response is small enough to fit in a context window. It will sometimes get this right and confidently wrong the rest of the time. The failure modes are specific and predictable. The agent hallucinates a column that does not exist. It pulls the entire dataset because it does not know a filter is available. It misreads a coded value because nothing told it that state code 06 means California. It returns a number without units.

The gap is not that the data is missing. The gap is that the data is not self-describing in a machine-consumable way, and the access path is not constrained. A downloadable file gives you everything or nothing. There is no middle layer that says: here are the three questions you can ask this dataset, here are the parameters each question accepts, here are the limits, and here is what an error looks like. That middle layer is exactly what a well-designed tool surface provides, and it is the thing agencies have to build if they want agents to use open data without producing garbage.

It helps to be concrete about scale. Consider a single well-known federal dataset, spending records. A human analyst who wants to know how much a particular agency awarded in a fiscal year already knows to filter by agency and year, knows that dollar amounts are in whole dollars, and knows to exclude canceled awards. An agent handed the raw file knows none of that. It might sum a column that includes canceled awards, double-count modifications to existing awards, or report a figure in the wrong denomination because a column stored thousands rather than dollars. The dataset is technically complete and technically public. It is still not usable by an agent, because every piece of domain knowledge that makes the numbers correct lives outside the file, in a data dictionary the agent never reads. Turning the dataset into a tool means encoding that domain knowledge once, in the tool, so the agent inherits it on every call instead of guessing.

There is also a scale-of-error problem that is specific to agents. A human who misreads a dataset produces one wrong analysis and usually catches it during review. An agent wired into an automated workflow can produce the same wrong analysis thousands of times before anyone notices, and it can do so with fluent, confident prose that makes the error harder to spot. The tool surface is not just a convenience. It is the control that keeps a fast, tireless consumer from industrializing a mistake.

There is a governance dimension too. Public data is public, but public does not mean unlimited. A portal still needs rate limits so one agent does not exhaust shared infrastructure. It may need to restrict certain joins or certain columns even within nominally open datasets. It needs an audit trail so operators can see what agents asked and what they received. None of that fits naturally into "here is a download link."

## What MCP Adds to Legacy APIs

MCP is a protocol that lets an AI client discover and call tools, read resources, and interact with external systems through a consistent interface. The word "consistent" is doing the work. Instead of every agency inventing its own convention for how an agent learns about a data source, MCP gives the agent a standard way to ask "what can I do here?" and receive a structured answer it can reason about.

Compare this to a legacy API. A REST API assumes the caller already read the documentation. The endpoint `/v2/records?year=2024&state=CA&limit=100` is perfectly usable if you know that `year`, `state`, and `limit` exist, that `state` wants a two-letter code, and that `limit` caps at some value. The API does not describe itself at call time. It returns a 400 error if you guess wrong, and the error is often a terse string that a model cannot always recover from.

An MCP tool inverts this. The tool ships with a description written for a model to read. It declares its parameters, their types, and their constraints. It can include examples. When the agent calls the tool, it is calling a narrow, purpose-built function rather than composing a raw HTTP request from guesses. The design principles that make a good MCP tool are the same principles that make a good internal API, applied with more discipline:

- **Narrow tools over broad ones.** A tool called `find_grants_by_state_and_year` with two typed parameters is far safer and more usable than a generic `run_query` that accepts arbitrary SQL. The narrow tool constrains the space of things that can go wrong.
- **Explicit parameters with types and constraints.** If a parameter must be a state code, say so, and validate it. The agent should not be able to pass free text where an enum belongs.
- **Limits baked in.** Every tool that returns rows should cap the result size and paginate. An agent should not be able to request a million rows by omitting a limit.
- **Clear examples.** A single worked example in the tool description dramatically improves how well a model uses the tool.
- **Structured, actionable errors.** When a call fails, the error should tell the model what was wrong and how to fix it, not just return a status code.

Here is a conceptual sketch of what a read-only tool definition looks like. This is pseudocode to show the shape, not a runnable snippet, and the exact structure depends on the MCP server framework you use:

```python
# Conceptual MCP tool definition (illustrative, not tied to one framework)
tool(
  name="find_federal_grants",
  description=(
    "Search awarded federal grants by state and fiscal year. "
    "Read-only. Returns up to 100 rows. "
    "Example: state='CA', fiscal_year=2024 returns California grants for FY2024."
  ),
  parameters={
    "state": {"type": "string", "enum": US_STATE_CODES, "required": True},
    "fiscal_year": {"type": "integer", "minimum": 2010, "maximum": 2026, "required": True},
    "max_rows": {"type": "integer", "default": 50, "maximum": 100},
  },
  handler=run_governed_query,  # applies row/column policy, limits, logging
)
```

The important design choice is not the syntax. It is that the tool is read-only, its parameters are validated, its output is bounded, and every call flows through a handler that enforces policy and writes an audit record. The agent never touches raw storage or an unrestricted query interface.

There is a design tension worth calling out here, because it is the main tradeoff in tool design. Narrow tools are safer and easier for a model to use correctly, but they are also more work to build and they can feel limiting. If you build one tool per question, a complex analysis might require ten tools that you had to design, document, and maintain. A single generic query tool would cover all ten cases with far less upfront effort. The temptation to ship the generic tool is real, and it is usually the wrong call for untrusted or public-facing surfaces. The generic tool trades a large, hard-to-reason-about risk surface for a small saving in development time. For a public data portal, where you cannot control who points an agent at it, the narrow-tool discipline is worth the extra work. The right middle ground is often a small set of parameterized tools that each cover a family of related questions, rather than either one tool per literal question or one tool for everything. Resources, MCP's mechanism for exposing readable context such as a data dictionary, can carry the descriptive material so the tools themselves stay lean.

## The GSA Hackathon as a Signal

A hackathon, if it happened as described, is worth reading as a signal rather than a solution. Public-sector data teams have spent years standing up open data portals. The next question is whether those portals can participate in the agent-driven workflows that are becoming common. Wrapping datasets in MCP servers is a low-risk way to test that, because a read-only MCP server does not require changing the underlying data platform. It sits in front of existing datasets and exposes a controlled surface.

The reason this pattern is attractive for government specifically is that the constraints are already well understood. Public data access is supposed to be transparent, logged, and fair. A read-only MCP server aligns with all three. It exposes only what the agency chooses to expose. It logs every call. It applies limits so shared infrastructure stays available. None of that requires the agency to give an agent write access, database credentials, or privileged network reach.

I will restate the caveat plainly because it matters for how you should use this article. I have not verified the GSA hackathon's official details. If you are citing it in your own work, confirm the announcement, dates, and scope against a primary GSA source first. What is safe to build on is the architectural pattern, which stands independent of any event.

## How Enterprises Can Copy the Pattern

The interesting thing about the public-data version of this problem is that private companies have the exact same problem, only with higher stakes. Inside a company, the datasets an agent might want are not all public. Some contain PII. Some are regulated. Some are certified metrics that leadership relies on, and others are raw tables that should never be shown to a decision-maker without context. The "download the CSV" failure mode is worse internally, because an agent with broad database access can leak data or return an uncertified number that someone then puts in a board deck.

The copyable pattern is a sequence, and the order matters:

1. **Start with read-only datasets.** Do not begin by giving agents write access to anything. Read-only is where the value is and where the risk is lowest.
2. **Expose certified metrics, not raw tables.** If your company has a governed definition of "net revenue," the agent should call a tool backed by that definition, not compute revenue itself from raw ledgers. This is how you keep agents on the same numbers as your dashboards.
3. **Restrict sensitive columns at the source.** Column masking and row filters should be enforced by the layer behind the tool, not by trusting the agent to avoid sensitive fields.
4. **Log every tool call.** Treat agent access to data with the same audit rigor you would apply to a human analyst querying production, and arguably more, since agents act quickly and at scale.

The organizing question, both for a government agency and for a company, becomes: which datasets should become agent-facing tools, and under what policy? That is a governance decision, and it is best made in the same system that already governs your data rather than bolted on afterward.

## Technical Blueprint for a Read-Only SQL MCP Server

Here is a reference architecture for exposing datasets to agents through a read-only, SQL-backed MCP server. The components are:

- **MCP client.** The AI application or agent. It discovers tools and calls them. It never talks to storage directly.
- **MCP server.** The service that hosts tool definitions, receives calls, validates parameters, and forwards work to the query layer. This is where you enforce which tools exist and what they accept.
- **SQL gateway.** A controlled path to query the data. Crucially, untrusted callers do not get to submit arbitrary SQL. Tools map to parameterized queries or to named, reviewed query templates. If you must allow flexible querying, sandbox it aggressively.
- **Governed query engine.** The engine that runs the query against your datasets, applies row and column policies, and enforces limits.
- **Catalog.** The metadata layer that describes tables, schemas, and access policies. The engine consults it to decide what a given identity is allowed to see.
- **Datasets.** The actual data, whether in object storage, a lakehouse, or federated across multiple sources.

The security posture is the part people underinvest in, so it deserves detail:

- **No raw unrestricted SQL for untrusted callers.** This is the single most important rule. An agent that can write arbitrary SQL can do arbitrary things, including expensive scans, unexpected joins across sensitive tables, and data exfiltration. Prefer parameterized tools.
- **Parameterized tools where possible.** Bind user-supplied values as parameters, never string-concatenate them into a query. This is standard injection defense, and it matters more when the "user" is a model that can be prompt-injected by content it reads.
- **Row and column policy enforcement.** Enforce fine-grained access control in the engine, keyed to the identity the tool call runs as. The agent's tool call should carry an identity, and that identity should have a real policy behind it.
- **Rate limits.** Per-identity and per-tool limits protect shared infrastructure and cap the blast radius of a misbehaving agent.
- **Audit logs.** Log the tool name, parameters, identity, result size, and timestamp for every call. This is your record of what happened and your input for tuning policy.

A subtle point on identity: an agent is not a person, and you should not model it as one. Give the agent (or the app calling on a user's behalf) a scoped identity with the narrowest policy that lets it do its job. Prompt injection is a real threat here. If an agent reads a document that contains instructions telling it to dump a table, the only reliable defense is that the table was never reachable through the agent's tools in the first place. Policy enforced at the engine is what saves you, not instructions in the system prompt.

The audit logs deserve more than a one-line mention because they do double duty. In the short term they are your safety net: when an agent returns a surprising answer, the log tells you exactly which tool it called with which parameters, so you can reproduce the result and decide whether the tool or the data was at fault. In the longer term the logs are your tuning signal. If you see agents repeatedly calling a tool with parameter combinations that return nothing, that is a hint the tool's description or parameter design is misleading the model, and you can fix it. If you see one identity generating far more calls than the rest, that is either a workload to plan for or an abuse to throttle. Treat the log not as compliance paperwork but as the primary feedback loop for improving the tool surface over time.

One honest limitation to sit with: even a perfectly designed read-only tool surface does not make an agent's answers correct. It makes them bounded and auditable, which is a different and more achievable goal. The agent can still choose the wrong tool, misinterpret a correct result, or combine two correct results into a wrong conclusion. Tool design constrains what an agent can access and how, not how well it reasons. Set expectations accordingly with the people who consume the agent's output, and keep a human in the loop for decisions that carry real consequences.

## Why Lakehouse Governance Matters

MCP is a protocol for connecting agents to tools. It is deliberately not a governance system, a query engine, or a catalog. That is a feature, not a gap. But it means MCP is only as safe and useful as the data platform behind it. A well-designed MCP server in front of an ungoverned pile of files is a well-designed door into a room with no walls.

This is where a governed lakehouse changes the equation. [Dremio](https://www.dremio.com/) is a data platform built for and managed by AI agents, and it lines up with the blueprint above because the governance, the semantic layer, and the query federation already exist below the tool surface. A few pieces fit this problem directly.

The semantic layer gives agents certified views instead of raw tables. In Dremio that means views, wikis, labels, and AI metadata that describe what a dataset is and how it should be used. When an agent calls a tool backed by a semantic-layer view, it inherits the definitions that humans already agreed on, which is how you keep agents and dashboards on the same numbers.

Query federation lets a single tool reach data that lives in multiple systems without first copying everything into one place. Dremio queries in place across sources, so the MCP server can expose a governed view over federated data and the agent never needs to know where the underlying tables physically live. For public data, that means an agency can present one clean tool surface over datasets that live in different systems. For enterprises, it means agents query current data rather than a stale copy.

Fine-grained access control enforces row and column policy in the engine, which is exactly where the blueprint says security belongs. And because Dremio ships an [open-source MCP server](https://docs.dremio.com/current/developer/mcp-server/), the connection between an external AI client and governed lakehouse data is a supported path rather than a custom integration you maintain alone. The [hands-on introduction to agentic analytics](https://www.dremio.com/blog/from-bottlenecks-to-breakthroughs-a-hands-on-intro-to-agentic-analytics-for-the-data-analyst/) walks through what this looks like in practice for an analyst.

The through-line is the same for a federal portal and for a private company. The protocol is standard and open. The value comes from the governed layer underneath it: certified definitions, enforced policy, federated access, and a full audit trail. Build the tools, but build them on a foundation that was designed to be queried by agents rather than one you are retrofitting.

Be clear about what the platform does and does not replace. The MCP server is still yours to design, because only you know which questions your datasets should answer and what the right parameters are. What the governed lakehouse replaces is the pile of custom plumbing you would otherwise write underneath the tools: the policy engine, the identity resolution, the federation across sources, the certified metric definitions, and the audit trail. Those are the parts that are tedious to build well and dangerous to build poorly, and they are the parts that a data platform built for agents already provides. Building the tool surface on top of that foundation lets a small team ship a safe agent-facing data product without first becoming experts in row-level security and query federation.

The Dremio AI Agent is worth distinguishing from a general chatbot in this context. It is not a conversational veneer bolted onto a database. It operates against the governed semantic layer, so the answers it produces respect the same certified definitions and access policies as everything else in the platform. When you expose data to external agents through the MCP server, you are extending that same governed surface outward rather than opening a second, less controlled path. The point is consistency: whether a question comes from the built-in agent or an external MCP client, it flows through the same policy and the same definitions.

## Where to Start

If you want to make your datasets usable by agents without giving up control, do not start by pointing a model at a database. Start by deciding which datasets deserve to be tools, wrap them in read-only MCP tools with typed parameters and bounded output, and enforce every access policy in the engine that runs the query. That order keeps you safe and keeps agents useful at the same time.

If you want to try this on a governed lakehouse with an open-source MCP server, federated query, a semantic layer, and fine-grained access control already in place, start a project at [dremio.com/get-started](https://www.dremio.com/get-started) and connect an agent to a governed view instead of a raw table.
