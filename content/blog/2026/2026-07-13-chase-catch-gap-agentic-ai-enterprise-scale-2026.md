---
title: "The Chase-Catch Gap in Enterprise AI Agents"
date: "2026-07-13"
description: "An in-depth exploration of the chase-catch gap in enterprise ai agents"
author: "Alex Merced"
category: "AI & Agents"
tags:
  - AI Agents
  - Enterprise
  - Agentic AI
canonical: "https://iceberglakehouse.com/posts/chase-catch-gap-agentic-ai-enterprise-scale-2026/"
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/chase-catch-gap-agentic-ai-enterprise-scale-2026/).

Building an impressive AI agent demo takes an afternoon. Wire an LLM to a few tools, give it a system prompt, point it at a sample dataset, and it will answer questions, generate SQL, and chain a few steps together convincingly. Getting that same agent to run reliably against real enterprise data, under real access policies, with real business definitions, and having people trust its answers, takes far longer and defeats a large share of the teams that try. That distance, between an agent that works in a demo and an agent that works in production, is the chase-catch gap. Enterprises are chasing agents faster than they can catch up on the operational foundation those agents need.

The gap is not primarily a model problem. Models are capable enough to be useful today. The gap is a data and knowledge problem. Production agents need reliable data access, consistent business definitions, governance, observability, cost controls, and human oversight, and those are exactly the things a quick demo skips. The sections ahead define the gap precisely, explain why pilots stall when they meet real conditions, describe the knowledge layer that bridges LLM reasoning and enterprise data, offer a concrete scorecard for agent-readiness, and show how lakehouse architecture narrows the gap. One framing note up front: the goal is not to sell a shortcut around organizational readiness. There is no such shortcut. The goal is to be clear about what the foundation actually requires.

A note on data. There has been industry commentary suggesting that a large majority of enterprise agent initiatives struggle to reach production, and some analyst reports have circulated with specific figures attached. A precise statistic is hard to pin down and easy to misquote, so the gap here is described qualitatively, because the argument does not depend on any single number. Anyone who wants a hard figure should check the primary source directly through the [Forrester research portal](https://www.forrester.com/research/) and confirm the report title, date, and methodology before quoting it. The pattern itself, many pilots and few production systems, is widely observed regardless of the exact percentage.

## What the Chase-Catch Gap Means

The distinction that matters is between a pilot and a production system, and they are different kinds of thing, not different sizes of the same thing.

A pilot is a proof that an agent can do a task in a controlled setting. The data is curated. The questions are representative but bounded. The person running the demo knows which queries work and steers around the ones that do not. Success in a pilot proves the model can reason and the tools can execute. That is worth knowing, and it is the easy part.

A production system is a proof that an agent can do a task reliably, safely, and trustworthily against uncontrolled reality. The data drifts. Schemas change. Users ask questions the pilot never anticipated, phrased in ways the agent has to interpret against ambiguous business definitions. Access policies vary across the systems the agent touches. Costs accrue and have to be bounded. And when the agent is wrong, someone has to be able to tell, trace why, and correct it. Production requires reliable data access, identity, policy enforcement, error handling, evaluation, cost controls, and human oversight, none of which the pilot needed because the pilot controlled its environment.

The gap appears at the seam between these two. A pilot succeeds in narrow scenarios and then fails under real data drift, ambiguous definitions, and system friction. The team saw the agent work, so they expected production to be a scaling exercise, more compute, more users. It is not. It is a different category of engineering, the category that makes the agent hold up under conditions the demo never faced. Chasing means launching pilots. Catching means closing all the operational gaps that stand between a working demo and a system the business can rely on. Most organizations are much better at the chasing than the catching, which is why the gap exists.

There is a structural reason the chasing is easier, and it is worth naming because it explains why so many teams are surprised. The tools for building a pilot have gotten dramatically better, while the work of preparing enterprise data for agents has not gotten meaningfully easier. Agent frameworks, model APIs, and tool-calling abstractions have compressed pilot-building from a research project into an afternoon. But the data underneath a real enterprise, the sprawling schemas, the undocumented tables, the metrics that three teams define differently, the access policies scattered across systems, is exactly as messy as it was before the frameworks arrived. So the easy half got easier and the hard half stayed hard, which widens the perceived gap even as the technology improves. A team can now build a more impressive demo than ever, which makes the fall to production feel steeper, not shallower. The improvement in tooling is real, but it improved the wrong half of the problem relative to where the bottleneck actually is.

## Why Agent Pilots Stall

Pilots stall in specific, recurring ways. Naming them precisely is more useful than describing the gap in the abstract, because each failure mode points at a fixable cause.

**Data drift.** The agent's answers depend on the data underneath it, and that data changes. A column gets renamed, a source starts sending values in a different unit, a pipeline silently drops a segment of records. In a pilot, the data is frozen and clean. In production, drift changes query results and shifts the context the model reasons over, and the agent has no way to know the ground moved. Yesterday's correct answer becomes today's wrong one, with no error thrown.

**SQL generation failures from thin metadata.** An agent generating SQL has to map a business question to columns and joins. If the schema is just physical table and column names with no semantic meaning, the agent guesses. It picks a plausibly named column that turns out to be the wrong one, or invents a join the schema does not actually support. Pilots dodge this by using a small, well-understood schema. Production databases are sprawling and cryptically named, and the agent's guesses get worse as the schema gets messier. The root cause is not model weakness. It is that the schema carries no meaning the model can use.

**Inconsistent access policies.** The agent touches multiple systems, and each may enforce access differently. One tool applies row-level security, another does not. One respects a column mask, another exposes the raw value. The agent, moving across these, can end up with an inconsistent or overly broad view of data, which is both a correctness problem and a security problem. Policies that differ across tools mean the agent's effective access is the union of the loosest ones.

**No observability or cost controls.** When a pilot agent misbehaves, the developer watching it notices. A production agent runs unattended, and without observability, no one sees it loop, call a tool a thousand times, or scan a massive table repeatedly. Costs balloon and errors go undetected because nothing is watching the agent the way the developer watched the demo.

**Broken trust from unclear lineage.** The subtlest failure is social. The agent gives an answer, and a business user cannot tell where it came from, cannot trace it to a source, and cannot verify the definition it used. So they do not trust it, and an agent no one trusts is not in production no matter how well it runs. Unclear lineage does not crash anything. It just quietly ensures the agent never gets used for anything that matters.

The table maps each failure mode to its root cause and to the metric that would catch it, which sets up the scorecard in a later section.

| Failure mode | Root cause | Readiness metric |
| --- | --- | --- |
| Wrong answers over time | Data drift, no freshness signal | Data freshness SLA compliance |
| Bad generated SQL | Schema lacks semantic meaning | Query success rate for agent SQL |
| Over-broad data access | Policies differ across tools | Policy-denied attempts, egress by agent |
| Runaway cost, silent errors | No observability or cost controls | Tool calls with full audit context |
| Business distrust | Lineage and definitions unclear | Mean time to trace an answer to source |

## The Knowledge Layer as the Missing Middle

The common cause behind those failures is a missing layer. Between the LLM's reasoning and the enterprise's physical data, there needs to be a layer that carries meaning, and most stalled pilots skip it. The model reasons in natural language. The data sits in tables named things like `fct_txn_dly`. Something has to bridge those, and that something is the knowledge layer.

The knowledge layer is what tells the model what the data means. It includes semantic models that define business entities and metrics in terms the model can use, so "revenue" maps to an agreed definition rather than a guessed column. It includes metadata and documentation that describe what each dataset contains and how to use it. It includes metric contracts, explicit definitions of important metrics with owners, so there is one authoritative meaning of "active customer" rather than five conflicting ones. It includes lineage, so any answer can be traced to its sources. It includes data quality signals, so the agent and the humans reviewing it know whether the underlying data is trustworthy right now. And it includes tool descriptions, so the agent knows what each tool does and when to use it.

Architecturally, the knowledge layer sits above physical storage and below agent workflows. Storage holds the bytes. The knowledge layer gives those bytes meaning, access rules, and quality context. Agent workflows consume that meaning to reason reliably. Put the knowledge layer in and the failure modes recede: SQL generation improves because the schema now carries semantics, trust improves because lineage is available, access consistency improves because policy lives in one place instead of scattered across tools.

```
   ┌─────────────────────────────┐
   │      Agent workflows        │  reason, plan, act
   └──────────────┬──────────────┘
                  │ consumes meaning
   ┌──────────────▼──────────────┐
   │       Knowledge layer       │  semantics, metrics,
   │  definitions · lineage ·    │  lineage, quality,
   │  quality · policy · tools   │  tool contracts
   └──────────────┬──────────────┘
                  │ gives meaning to
   ┌──────────────▼──────────────┐
   │      Physical storage       │  tables and files
   └─────────────────────────────┘
```

A useful way to think about the knowledge layer is that it externalizes context the model would otherwise have to guess. An LLM is good at reasoning over information it is given and bad at inventing facts it was never told. When an agent has to figure out that `fct_txn_dly` means daily transactions, that `amt` is in cents rather than dollars, or that "revenue" excludes refunds, it is guessing, and guesses fail silently. The knowledge layer replaces those guesses with stated facts. It is the difference between an agent that infers your business from cryptic column names and an agent that reads your business from an authoritative description. The reason this is the missing middle and not just nice documentation is that agents consume it at runtime. Human-oriented documentation sits in a wiki no query ever reads. A knowledge layer is machine-readable context wired into the path the agent actually takes when it plans a query, which is what makes it change outcomes rather than just inform people.

The knowledge layer is the missing middle. It is what a pilot skips and a production system cannot. Dremio's writeup on [the semantic layer for agentic analytics](https://www.dremio.com/blog/agentic-analytics-semantic-layer/) develops this argument in more depth.

## Metrics for Agent-Readiness

If the gap is real, you should be able to measure how close your organization is to closing it. Vague confidence that the data is "pretty good" is exactly the assumption that produces stalled pilots. Here is a concrete scorecard a data leader can actually use. These are not aspirational; they are quantities you can compute today.

**Percentage of critical metrics with owners and definitions.** For your most important business metrics, what fraction have an explicit definition and a named owner. If it is low, agents are guessing at meanings your own organization has not agreed on, and their answers will be inconsistent because the ground truth is inconsistent.

**Query success rate for agent-generated SQL.** Of the SQL an agent generates, what fraction runs and returns a correct result. A low rate points straight at thin metadata. This is measurable by logging agent queries and their outcomes, and it is the single most direct signal of whether your schema carries enough meaning.

**Data freshness SLA compliance.** What fraction of the time your critical datasets meet their freshness targets. Agents reasoning over stale data give confidently wrong answers, and freshness compliance tells you how often that risk is live.

**Percentage of agent tool calls with full audit context.** For every action an agent takes, is there a complete record of who, what, when, and why. Anything less than near-total coverage means you cannot fully reconstruct the agent's behavior, which blocks both debugging and trust.

**Mean time to trace an answer to source.** When someone questions an agent's answer, how long does it take to trace it back to the underlying data and definition. If it takes hours, business users will not trust the agent, because they cannot verify it in the moment they need to. Fast lineage is trust infrastructure.

**Policy-denied attempts and egress volume by agent.** How often agents attempt actions that policy blocks, and how much data agents move out. These are your security and cost signals. A spike in denied attempts might mean an agent is probing beyond its scope; unexpected egress might mean it is pulling more data than its task warrants.

A word on how to use this scorecard without turning it into a stalling tactic. The goal is not to reach perfect scores before deploying anything, because you never will, and waiting for a perfect foundation is its own way of never shipping. The goal is to know your numbers so you can scope agents to where the foundation is ready. If your critical metrics are well-defined and owned for the finance domain but not for marketing, that tells you to point your first production agent at finance questions and hold off on marketing ones. The scorecard is a map of where you can safely operate today, not a gate you have to fully clear before starting. Used that way, it lets you ship real agents into the parts of the business where the data foundation supports them, and it gives you a prioritized list of what to fix to expand that surface. That is a far healthier posture than either shipping everywhere and getting burned or shipping nowhere until some imagined readiness milestone that never arrives.

Score yourself honestly on these six and the readiness gap stops being a vague worry and becomes a list of specific things to fix. That is the point of a scorecard: it converts anxiety into an ordered backlog.

## How Lakehouse Architecture Narrows the Gap

The metrics above all trace back to the data foundation, which is why architecture, not model choice, is where the gap actually closes. Four properties of a well-built lakehouse map directly onto the failure modes.

Open data on shared standards means the agent reasons over data that is not trapped in a single tool's proprietary format, which keeps the semantic and lineage information portable rather than locked to one vendor's catalog. Federation lets the agent query across sources in place, so it works against the real spread of enterprise data without someone first copying everything into one warehouse, and without the copies drifting out of sync. Semantic context, carried in the layer above storage, gives generated SQL the meaning it needs to succeed and gives business users the lineage they need to trust answers. And fast, governed queries mean the agent gets answers quickly under consistent access policy, so performance and security are not in tension.

The order matters. Get the data foundation right, meaning open, federated, semantically defined, governed, and fast, and the agent-readiness metrics improve as a consequence. Query success rate rises because the schema carries semantics. Trace time drops because lineage is inherent to the architecture. Policy consistency improves because access is enforced in one place rather than negotiated across tools. None of this is the model's doing. It is the foundation's.

This reframes where teams should spend effort, which is usually the opposite of where they do spend it. The instinct when an agent underperforms is to change the model, tune the prompt, or add more examples. Sometimes that helps. But when the failure mode is bad SQL against a meaningless schema, or a business user who does not trust an untraceable answer, no amount of prompt engineering fixes it, because the problem is not in the model's reasoning. It is in the context the model was given to reason over. A team that spends a quarter optimizing prompts while the underlying schema stays semantically empty will keep hitting the same ceiling, because the ceiling is set by the data foundation, not the prompt. The higher-impact move is to invest in the foundation: define the metrics, document the datasets, consolidate the access policy, make lineage traceable. That work is less exciting than trying the newest model, and it is what actually moves the readiness metrics.

## Where Dremio Fits the Pattern

Dremio's Agentic Lakehouse maps onto the knowledge-layer argument closely, and it is worth being precise about what it does and does not claim to do. Dremio is the data platform built for AI agents and managed by AI agents, a unified lakehouse on open standards, Apache Iceberg, Apache Arrow, and Apache Polaris. Its semantic layer, built from virtual datasets, wikis, labels, and AI-generated metadata, is a concrete implementation of the knowledge layer: it gives physical data business meaning that agents can reason over, which is what lifts query success rate. Its federated query engine lets agents query across sources in place with no data movement, addressing the federation requirement directly. Fine-grained access control at row and column level enforces policy consistently in one place rather than scattered across tools, which is the fix for inconsistent access. Reflections and Autonomous Reflections keep governed queries fast even under the bursty patterns agents produce. And an open catalog built on Apache Polaris keeps the whole foundation on open standards with no lock-in, so the semantics and lineage stay portable. Dremio's overview of [the AI foundation of the agentic lakehouse](https://www.dremio.com/blog/the-ai-foundation-of-the-agentic-lakehouse/) lays out how these pieces fit together, and standards like [Model Context Protocol](https://modelcontextprotocol.io/) define how agents connect to tools like these in a consistent way.

Here is the honest boundary. A lakehouse, Dremio included, does not solve organizational readiness by itself. It cannot make your organization agree on what "active customer" means; it can only give you a place to record the definition once everyone agrees. It cannot assign owners to your metrics; it can only track ownership once someone assigns it. The scorecard measures organizational maturity as much as technical maturity, and the technical foundation is necessary but not sufficient. What the right architecture does is remove the technical obstacles so the remaining work is the organizational work of definitions, ownership, and governance, which is real work no tool can do for you. Framing the platform as enabling infrastructure rather than a shortcut is the accurate framing.

If there is one idea to carry away, it is that the gap is a data problem wearing an AI costume. The excitement is all on the model side, so that is where attention goes, but the failures are almost all on the data side: drift, thin metadata, inconsistent policy, unclear lineage. A team that internalizes this stops waiting for the next model to rescue a stalled pilot and starts fixing the foundation the pilot was actually standing on. The reward for that work compounds, because a well-built knowledge layer and a governed, federated data foundation serve every future agent, not just the one in front of you. Fix it once and the next agent starts from a much higher floor.

The chase-catch gap closes when the foundation under the agents is ready, not when the model gets bigger. Score your organization on the six readiness metrics, fix the lowest ones, and build on open, federated, semantically defined, governed data. That is the unglamorous work that turns a good demo into a production system people trust.

Ready to build the data foundation your agents need? [Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started), connect your sources, and see federated, governed, semantically defined access that moves your agent-readiness metrics in the right direction.
