---
title: "Graphs in AI Engineering Have Solved Three Problems. The Fourth Is the Plan."
date: "2026-08-24"
description: "Knowledge graphs, GraphRAG, and LangGraph solved three problems. The fourth is the work itself: a reviewable graph of bounded agentic loops."
author: "Alex Merced"
category: "AI & Agents"
canonical: https://iceberglakehouse.com/posts/graphs-in-ai-engineering/
tags:
  - AI agents
  - graphs
  - Agentic Graph Specification
  - knowledge graphs
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/graphs-in-ai-engineering/).

Ask an agent to ship a feature and watch what it does. It reads some files, decides on an order of operations, writes code, runs tests, fixes what broke, and declares itself done. Somewhere inside that run there was a plan. It had steps, the steps had dependencies, and some steps mattered more than others. You never saw it. It lived in the model's context window for the length of the session and evaporated when the session ended.

That plan was a graph. Every agent harness (the program that runs the model in a loop, manages tools, and enforces policy) builds one, privately, in its own shape, and throws it away. The one artifact that determines whether the tokens you are about to spend are spent well is the one artifact nobody writes down.

This is strange, because AI engineering has been reaching for graphs for fifteen years and has gotten real value each time. Knowledge graphs gave symbolic structure to search. GraphRAG gave retrieval a way to answer questions about a whole corpus instead of a single chunk. LangGraph and its cousins gave agent control flow a shape. My own MagGraph gives agent memory a shape a human can read. Each of these took a fuzzy problem and made it a graph, and each got something reviewable in return.

This article walks through those three uses, what each one actually does under the hood, and where each stops. Then it makes the case for the fourth use: the work itself, written as a graph of bounded agentic loops with success criteria a harness can check. That is what my Agentic Graph Specification (AGS) does, and it now runs at full conformance in two harnesses I built, Loro and MagAgent.

Disclosure: I am Head of Developer Relations at Dremio, and I wrote AGS, MagGraph, Loro, and MagAgent. I will say plainly where each of those shows up.

## Graphs Before Language Models: Structure as Knowledge

The graph has been the data structure of choice for "things and how they relate" since long before anyone trained a transformer. Three lineages matter for what came later.

The first is the knowledge graph. Google announced its Knowledge Graph in 2012, and the phrase entered the mainstream vocabulary with it. The idea was older: represent the world as entities (nodes) and typed relationships (edges), so a query for "Marie Curie" returns a person, her field, her prizes, and her collaborators as linked facts rather than ten blue links. Under the hood this is a triple store or a property graph. A triple is subject, predicate, object. A property graph attaches key-value attributes to both nodes and edges. Either way the structure is explicit. You can traverse it, count paths through it, and ask "what connects A to B" and get a deterministic answer.

The second lineage is the graph database as an engineering product. Neo4j and its Cypher query language made property graphs practical for application developers who did not want to write recursive SQL. That work culminated in GQL, the ISO standard for graph query languages, published in 2024 as the first new ISO database language since SQL. If you have ever written `MATCH (a)-[:KNOWS]->(b)` you have used this lineage.

The third is graph computation. Google's Pregel paper in 2010 described a way to run algorithms like PageRank over graphs with billions of edges by having every vertex compute in parallel and pass messages along its edges. That model became Apache Giraph and GraphX, and it is the intellectual ancestor of graph neural networks, which learn node representations by aggregating messages from neighbors.

Then embeddings arrived and, for a while, made all of this look old-fashioned. Word2vec in 2013, and the transformer-based embeddings that followed, showed that you did not need explicit edges to capture relatedness. Two things are related if their vectors are close. A vector index has no schema to maintain, no entity resolution step, and no ontology committee. For most retrieval tasks it works well enough, and "well enough with no upkeep" beats "precise with a full-time curator" almost every time.

That is why the first two years of retrieval-augmented generation (RAG) were almost entirely vector search. And it is also why the graph came back.

## Graphs as Retrieval: What GraphRAG Actually Does

Vector RAG answers local questions well. "What does the config flag `max_retries` do?" pulls the paragraph that mentions it. Vector RAG answers global questions badly. "What are the main themes across this 400-page report?" has no single paragraph to retrieve. The answer is spread across the whole corpus, and no chunk is close in vector space to a question about everything.

Microsoft Research published GraphRAG in February 2024 to attack that gap, and open-sourced the code on July 2, 2024. The mechanism is worth understanding precisely, because most of the summaries of it are wrong.

Indexing runs in four stages. First, the corpus is chunked into text units, the same as vector RAG. Second, a language model reads every chunk and extracts entities, relationships, and claims, producing a knowledge graph. This is the expensive step, because every chunk is a model call. Third, a community detection algorithm (Leiden, in the reference implementation) clusters the graph into hierarchical communities: tight groups of related entities, nested inside broader groups. Fourth, a model writes a summary of each community at each level of the hierarchy.

Querying then has two modes. Local search starts from the entities that match the question and walks their neighborhood in the graph, pulling related entities, relationships, and the source chunks that mention them. Global search ignores the entities and instead runs the question against every community summary at a chosen level, in a map-reduce pattern, collecting partial answers and combining them.

Global search is what makes GraphRAG different. It answers "what are the themes" by asking that question of fifty community summaries and merging the results, which is a thing vector search structurally cannot do. In Microsoft's evaluation, GraphRAG's global search outperformed vector RAG on comprehensiveness and diversity for exactly those question types.

The cost is the catch. Running the index on the sample book in the documentation cost users around seven dollars in model calls, and that is a small corpus. Every chunk gets read by a model at index time, and the index has to be rebuilt when the corpus changes. Microsoft's own follow-up, LazyGraphRAG, released in November 2024, cut indexing cost to roughly 0.1 percent of the full version by deferring the model-driven extraction until query time and using cheaper noun-phrase extraction up front. That is a signal about where the original design was too heavy. The GraphRAG repository is now in maintenance mode, with the ideas folded into other Microsoft products.

Here is the honest guidance. GraphRAG is the right fit when your questions are global (themes, summaries, "what connects these"), your corpus is stable enough that a periodic re-index is acceptable, and the corpus is narrative text where entity extraction works well. It is the wrong fit when your questions are local lookups, your corpus changes hourly, or your data is already structured (a table does not need a model to discover its entities, because it already has a schema). A lot of teams built a GraphRAG index on top of a database export and got a slow, expensive, lossy copy of information they already had in columns.

The lesson that carries forward is not "use graphs for retrieval." It is that a graph makes a global property of a corpus queryable. Community structure is a property of the whole, and you cannot get it from any single piece.

## Graphs as Control Flow: LangGraph and the State Machine

The second big use of graphs in AI engineering has nothing to do with knowledge. It is about the shape of an agent's execution.

Early agent frameworks were linear chains. Prompt, then tool, then prompt, then output. That worked until someone needed a branch ("if the search returns nothing, try a different query") or a loop ("keep fixing until the tests pass"). Chains cannot express either. LangChain's answer, in early 2024, was LangGraph: model the agent as a directed graph where nodes are functions (a model call, a tool call, a routing decision) and edges define which node runs next, including conditional edges evaluated at runtime and cycles for retry loops. A shared state object flows through the graph and each node reads and updates it.

This is a state machine, and calling it a graph is accurate. The agent's control flow becomes an explicit structure you can draw, test node by node, checkpoint between steps, and resume after a failure. LangGraph added persistence so a graph run survives a process restart, and human-in-the-loop interrupts so a node can pause for approval. Other frameworks converged on the same design. CrewAI's flows, Microsoft's AutoGen graph-based orchestration, and the Google Agent Development Kit all model multi-step agent behavior as a graph of steps with conditional edges.

There is a parallel lineage in data engineering that predates all of this. Apache Airflow, open-sourced in 2015, models a pipeline as a directed acyclic graph (DAG) of tasks with dependencies. Dagster and Prefect refined the idea. If you have run a data platform, you already know what a DAG buys you: parallelism where dependencies allow, clear failure attribution, retry per task rather than per pipeline, and a picture of the whole job you can look at before it runs. Column-level lineage, which every lakehouse governance tool now sells, is the same graph viewed backward. I have spent a lot of time in that world through Apache Iceberg and Dremio, and the DAG is the single most useful abstraction data engineering ever adopted.

So control-flow graphs work. Here is where they stop.

A LangGraph graph is Python code. The plan is expressed as function definitions and `add_edge` calls in a file that only runs inside LangGraph. You cannot hand it to a different harness. You cannot review it in a pull request without reading the whole program. And the nodes are functions, which means the graph decides which model to call, with which prompt, at build time. The person who wrote the graph and the person who runs it have to be the same person, or at least share a codebase.

The bigger limitation is what the graph does not say. It says which node runs next. It does not say what "done" means for that node in terms a machine can check. A node finishes when the function returns. Whether the function's output is correct is the model's claim. There is no field on a LangGraph node for "this task passed when `pytest` exits zero," because LangGraph is a runtime, not a work description.

That gap, between "the flow of execution" and "the definition of the work," is the whole reason for the fourth use of graphs.

## Graphs as Memory: What an Agent Remembers, in a Form You Can Read

Before getting there, one more use is worth a section, because it is the one I built first and because it is the memory layer both my harnesses sit on.

Agent memory in most harnesses is an opaque store. A vector index, a SQLite file, a compacted summary in a hidden directory. When the agent remembers something wrong about your codebase, there is no file to fix. You file a bug against a store you cannot see.

MagGraph is an in-process graph database, written in Rust, where knowledge is stored as Markdown files in a Git repository. Each file is a node. Edges come from `[[wikilinks]]` inside the Markdown, the same convention Obsidian users know, so the graph structure emerges from the text rather than from a separate schema. Git handles versioning, branching, and sync. The database ships a Python API, a CLI, and an auto-generated MCP server (Model Context Protocol, the open standard for exposing tools to models), so any agent framework can query it. A lakehouse mode lets nodes point at external Parquet or S3 data instead of holding the data inline.

The queries an agent needs from memory are graph queries. "What do I know about this module" is a neighborhood traversal from the module's node. "What decisions led to this convention" is a backlink walk. "Give me a compact bundle of everything relevant to this task" is a bounded traversal that stops at a token budget. Vector search answers "what is similar." Graph traversal answers "what is connected," and for the accumulated context of a project, connected is what you want.

The design choice that matters is that the memory is Markdown in Git. It is diffable. It is reviewable in a pull request. When an agent writes a wrong fact, you edit a file. When it writes a good one, the commit records when and why. That is the same principle as everything else in this article: a graph you can read beats a graph you have to trust.

Memory describes what accumulates across jobs. It does not describe a job. For that you need the fourth graph.

## The Fourth Graph: Writing the Work Down

Go back to the opening. An agent asked to ship a feature builds a plan inside the harness and discards it. Four things follow from the plan living there.

You cannot review it before the tokens are spent. You find out what the agent decided to do by watching it do it, which for a four-hour run means reading a transcript after the money is gone.

You cannot move it. A plan built inside Claude Code stays in Claude Code. If you want the same job done by Codex or Goose next week, the plan is rebuilt from scratch, and it is rebuilt differently.

Completion is whatever the model says it is. The agent declares the feature shipped. Maybe it is. There is no field anywhere that says what shipped means in terms a machine can verify.

Every step gets the same model. Renaming a file and designing the module's public interface both run on whatever model the harness has configured. One of those is overspending by a factor of fifty and the other is a coin flip.

AGS 1.0 is a draft, implementation-neutral format for writing the plan down as a file. The specification text is CC BY 4.0, the schemas and reference validator are Apache-2.0, and everything is public at [AlexMercedCoder.dev](https://alexmercedcoder.dev/agentic/) and on GitHub.

An Agentic Graph is a directed acyclic graph. Every node is one bounded agentic loop, a unit of work an agent runs end to end. Every edge is a control-flow dependency. The data model is JSON and YAML interchangeably, and a YAML file that does not survive a lossless round trip through JSON is not a valid document.

The node is the interesting part. A node is not a prompt, and it is not a function. It carries seven things.

**A brief.** A `description` written so an agent that has seen nothing else can act on it. The spec has a section on writing a good one, because this field is where most graphs fail.

**Typed inputs and outputs.** Data flow is declared separately from control flow. An input says `from: nodes.inventory_changes.outputs.changed_symbols`, so the harness knows exactly which upstream value to hand over and can validate its type before the node starts.

**Success criteria the harness evaluates.** This is the field LangGraph does not have. Kinds include `command` (run this, pass on exit code zero), `file_exists`, `artifact_present`, `json_schema`, `regex`, `expression`, `llm_judge`, `human`, and `external`. The spec is blunt about `llm_judge`: it is legitimate for prose quality and design coherence, it is not a substitute for a test, and a harness cannot use the same model instance that produced the output as its own judge without recording that it did.

**An intelligence tier.** `minimal`, `standard`, `advanced`, or `frontier`. This is a normalized capability demand that describes the task, not the model. A `minimal` task is mechanical and verifiable at a glance. A `frontier` task is open-ended, high-stakes, and a wrong answer is both expensive and hard to detect. The harness maps tiers to models through its own routing profile, so the graph never names a vendor. The routing rules are normative: a harness must not route below the requested tier unless the node explicitly allows a downgrade, and it must fail before spending tokens if it cannot satisfy the tier.

**Tools, permissions, and workspace mode.** The ceiling on what a node is allowed to touch: `fs:write:docs/**`, `shell:exec:pytest*`, `read_only` or `read_write`.

**Budgets.** Maximum agent steps, maximum cost, maximum wall clock, per node and per graph.

**Failure handling.** Retries with the failed criteria fed back as context, optional intelligence escalation on retry (a fix that failed once is by definition not the obvious fix), fallbacks, compensation, and escalation to a named human role with a message.

Node types cover `task`, `decision` (select exactly one branch label, by model or by expression), `gate` (a human checkpoint that never calls a model), `loop` (bounded iteration with a hard `max_iterations`), `map` (bounded fan-out with a hard `max_items`), and `subgraph`. Because every loop and every fan-out has a ceiling, there is no way to write an unbounded document. The graph is acyclic by construction, and repetition is expressed by a loop node that owns a body fragment.

The tier field is the quiet win. A graph states how hard each piece of work is. The harness decides what that means in models. A plan written today still routes correctly when next year's models arrive, and a reviewer can challenge an expensive routing decision by reading the `rationale` field that the spec asks authors to supply on any `advanced` or `frontier` node.

## A Complete Graph, Walked Through

Here is a real graph. I validated it with the reference validator, under `--strict`, before putting it in this article. It refreshes public API documentation after a release, with two parallel tracks and a human gate before publish.

```yaml
ags_version: "1.0"
kind: AgenticGraph
id: myorg/api-docs-refresh
title: Refresh the public API docs after a release
version: 1.0.0
requires_conformance: 2

objective: >
  Bring the API reference and the getting-started guide in line with the
  code that shipped in the latest tag, and publish only after a human
  has approved the diff.

constraints:
  max_cost_usd: 6.0
  max_wall_clock_seconds: 3600
  max_parallel_nodes: 2

entrypoints: [inventory_changes]

nodes:

  inventory_changes:
    type: task
    title: List public API changes since the last tag
    description: >
      Diff the public symbols between the previous tag and HEAD. Produce a
      list of added, removed, and changed symbols. Change nothing.
    outputs:
      changed_symbols:
        type: array
        description: Public symbols whose signature or presence changed.
        schema: { type: array, items: { type: string } }
    intelligence:
      tier: minimal
      hints: [tool_use_heavy, low_cost]
    requirements:
      tools: [shell_exec, file_read]
      permissions: [fs:read:**, shell:exec:git*]
      workspace: read_only
    success:
      summary: A symbol change list exists.
      criteria:
        - id: list_present
          kind: artifact_present
          description: The change list was produced.
          output: changed_symbols

  update_reference:
    type: task
    title: Update the API reference pages
    description: >
      For every symbol in the change list, update or create its reference
      page under docs/reference. Match the existing page format exactly.
    depends_on: [inventory_changes]
    inputs:
      symbols:
        type: array
        description: The symbols to document.
        from: nodes.inventory_changes.outputs.changed_symbols
    outputs:
      touched_pages:
        type: file_set
        description: Reference pages written or updated.
    intelligence:
      tier: standard
      hints: [code_comprehension, structured_output]
    requirements:
      tools: [file_read, file_write, file_search]
      permissions: [fs:read:**, fs:write:docs/reference/**]
      workspace: read_write
    success:
      summary: Every changed symbol has a page and the docs still build.
      criteria:
        - id: docs_build
          kind: command
          description: The documentation site builds without error.
          run: mkdocs build --strict
          expect_exit_code: 0
          timeout_seconds: 600

  update_guide:
    type: task
    title: Update the getting-started guide
    description: >
      Read the change list and revise docs/getting-started.md so every code
      sample still runs against the shipped API. Keep the guide under 1,500 words.
    depends_on: [inventory_changes]
    inputs:
      symbols:
        type: array
        description: Symbols that changed, to check samples against.
        from: nodes.inventory_changes.outputs.changed_symbols
    outputs:
      guide:
        type: markdown
        description: The revised guide.
        path_hint: docs/getting-started.md
    intelligence:
      tier: advanced
      hints: [code_generation, precision_critical]
      rationale: >
        Rewriting samples so they run against a changed API is where
        silent mistakes are expensive and hard to spot.
    requirements:
      tools: [file_read, file_write, shell_exec]
      permissions: [fs:read:**, fs:write:docs/getting-started.md, shell:exec:python*]
      workspace: read_write
    failure:
      retry:
        max_attempts: 2
        backoff: fixed
        initial_delay_seconds: 1
        retry_on: [criteria_failed]
        feedback: failed_criteria
        escalate_intelligence: true
      on_exhausted: fail
    success:
      summary: The samples run and the guide reads well.
      evaluation_order: cheapest_first
      criteria:
        - id: samples_run
          kind: command
          description: Every code sample in the guide executes cleanly.
          run: python scripts/run_doc_samples.py docs/getting-started.md
          expect_exit_code: 0
          timeout_seconds: 900
        - id: reads_well
          kind: llm_judge
          description: The guide is clear to a first-time user.
          rubric: >
            Score 1 if a developer new to the library can follow the guide
            start to finish without outside help. Penalize undefined terms
            and steps that assume prior context.
          inputs: [nodes.update_guide.outputs.guide]
          threshold: 0.8
          samples: 3

  approve_publish:
    type: gate
    title: Approve the documentation change
    description: A docs owner reviews the diff before it is published.
    depends_on: [update_reference, update_guide]
    join: all
    gate:
      mode: approve
      roles: [docs-owner]
      prompt: |
        Publish the refreshed docs for ${{ graph.title }}?
        Pages touched: ${{ nodes.update_reference.outputs.touched_pages }}
      present:
        - nodes.update_guide.outputs.guide
      timeout_seconds: 172800
      on_timeout: hold
      on_reject: fail

  publish:
    type: task
    title: Publish the docs site
    description: Run the documented deploy command. Do nothing else.
    depends_on: [approve_publish]
    intelligence:
      tier: minimal
      hints: [tool_use_heavy]
    requirements:
      tools: [shell_exec]
      permissions: [shell:exec:mkdocs*]
      workspace: read_only
    success:
      summary: The deploy command exited cleanly.
      criteria:
        - id: deployed
          kind: command
          description: The deploy command succeeded.
          run: mkdocs gh-deploy --force
          expect_exit_code: 0
          timeout_seconds: 600

success:
  summary: Docs match the shipped API and were published with approval.
  criteria:
    - id: published
      kind: expression
      description: The publish node completed.
      expr: nodes.publish.status == "succeeded"
```

Read it as a reviewer, top to bottom.

The header declares `requires_conformance: 2`, which tells a harness up front what it needs to support. A level-1 harness rejects this graph before parsing the nodes rather than silently ignoring the parallel execution and the judge criterion it cannot run. The global `constraints` cap the whole run at six dollars, one hour, and two nodes in flight at once.

`inventory_changes` is the entrypoint. It is `minimal` tier because running a git diff and transcribing the result is mechanical. It is `read_only`, with permissions scoped to reading files and running `git*`. Its one success criterion is that the output exists. A harness with a routing profile that maps `minimal` to a small, cheap model sends this node there, and the graph author never had to know which model that was.

`update_reference` and `update_guide` both depend on `inventory_changes` and on nothing else, so they run in parallel, up to the `max_parallel_nodes` limit. Each declares a typed input pulled from the upstream node's typed output, so the harness validates the handoff before either starts.

The two tracks are deliberately at different tiers. Updating reference pages to match an existing format is `standard` work: the instruction fully determines the answer, and `mkdocs build --strict` catches most mistakes. Rewriting runnable code samples against a changed API is `advanced`, and the `rationale` field says why: the mistakes are silent and expensive. That rationale is there so a reviewer can push back. If you think the guide rewrite is `standard` work, you change one line and open a pull request.

`update_guide` also shows failure handling. If a criterion fails, the node retries up to twice with the failed criteria fed back as context, and `escalate_intelligence: true` means the retry routes one tier higher, at `frontier`. Its two criteria run `cheapest_first`: the command that executes the samples runs before the model-scored rubric, so a broken sample never pays for a judge call. The judge uses three samples and takes the median, which the spec recommends for anything gating an expensive downstream step.

`approve_publish` is a gate. It joins on both tracks (`join: all`), presents the revised guide to a human with the `docs-owner` role, and waits up to 48 hours. Gates never call a model, and the spec makes `intelligence` on a gate a validation error. This is the last reversible moment in the graph, and it is a human's.

`publish` runs the deploy command and nothing else. It is `minimal` tier with a single shell permission scoped to `mkdocs*`. The graph-level `success` block then checks, by expression, that the publish node reached `succeeded`.

Roughly 150 lines. A security reviewer can see every permission. A budget owner can see every cap. A senior engineer can challenge every tier. And none of it names a model, a vendor, or a runtime, so the same file runs in any conformant harness.

## Two Harnesses That Run It

A format with one implementation is a config file. Loro and MagAgent both implement AGS at conformance level 3, the top level, which covers loops, maps, subgraphs, judged and external criteria, compensation, run records, and checkpoint-and-resume. They are aimed at different people, and the difference shows how one graph behaves in two places.

**MagAgent 0.97.0** is the developer harness: terminal-native, local-first, backed by MagGraph memory, with 20 provider options, 40 built-in tools, and 10 skill libraries. Its graph workflow starts with generation.

```bash
python -m pip install mag-agent
magent configure
magent graph generate "ship the next API version" --out release.agraph.yaml
```

`graph generate` has a model draft a graph from a one-line objective. The draft is review-only. You read it, edit tiers and permissions, and save before anything runs. As of 0.97.0, `magent ui` serves a local browser workspace with a three-column Graph Kanban. It validates the graph, then works every card to completion through a durable executor, keeping dependencies, gates, changed files, and per-card outcomes visible. A graph can start blank, from a hand-written file, or from an AI draft.

**Loro 0.15.2** is the governed harness. Same graph format, pointed at an organization that has to answer an auditor: identity-bound approvals, a permission policy engine with `loro policy explain`, subprocess sandboxes, runtime budgets, and a hash-chained JSONL audit log with a `verify` command.

```bash
python -m pip install loro-agent
loro configure
loro graph generate "Create a release readiness report" --out release.agraph.yaml
loro graph validate release.agraph.yaml --strict
loro graph plan release.agraph.yaml
loro graph run release.agraph.yaml --dry-run
loro graph run release.agraph.yaml
loro audit verify
```

The `plan` command renders the resolved dependency order and routing decisions without executing. The `--dry-run` flag walks the whole graph, evaluating what each node is allowed to do, before spending a token. When a graph node names an Open Agent Profile (OAP, my companion specification for durable named agents), Loro intersects the graph's permissions, the profile's permissions, the user's identity, and the managed policy, and runs the node under the narrowest result. Loro's Web UI, `loro web`, exposes the same run under the same policy in a browser.

The point of two harnesses is not that you should use mine. It is that the same 150-line file produced a Kanban board for a developer in one tool and an audited, identity-bound run in another, without editing the file. The graph is the contract. The harness is the implementation. That separation is what a format buys you.

The conformance ladder exists so other harnesses can adopt the format without implementing all of it. Level 0 is a reader: parse, validate, resolve dependencies, render a plan, execute nothing. Level 1 adds tasks and gates, sequence edges, retries, basic criteria, and tier routing. Level 2 adds decisions, conditional edges, the full expression language, budget enforcement, real parallelism, and escalation. Level 3 is everything. The rule for every level is the same: reject graphs that need more than you support. Never silently ignore what you cannot run.

## What Breaks: Failure Modes of Graph-Shaped Agent Work

Every graph technique in this article has a characteristic way of failing. The fourth one is no exception, and I have hit each of these building the harnesses above. The warning signs are usually visible in the file before the run.

**The under-specified brief.** A node whose `description` says "update the docs" and nothing else. The agent that receives it has no upstream context by design, because the node is meant to stand alone, so it guesses. The graph validates fine. The run produces plausible garbage. The warning sign is a description shorter than three sentences on any node above `minimal` tier. Write the brief as if the reader has never seen the repository.

**Criteria that test the wrong thing.** `artifact_present` on a node whose real success condition is "the code works." The artifact is always present, because the model always writes something. The node always passes. The warning sign is a `standard` or higher node with no `command`, `json_schema`, or `expression` criterion. If a machine cannot check it, a human should, and that means a gate.

**Judge-only gating.** An `llm_judge` criterion with no deterministic partner, gating an expensive branch. The judge is a model scoring a model, and on a bad day they agree with each other. The spec asks for a deterministic criterion alongside every judge and `samples: 3` on anything that gates expensive work. The warning sign is a judge with `samples: 1` at the top of a fan-out.

**Tier inflation.** Every node marked `frontier` because the author was nervous. The graph runs on the most expensive model available for every step, including the ones that rename files. This is the same overspending the graph was supposed to fix. The warning sign is a graph with no `minimal` nodes at all. Almost every real job has mechanical steps.

**Tier deflation.** The opposite, and more dangerous. A `minimal` node doing ambiguity resolution, because the author wanted the run to be cheap. The small model makes a confident wrong call, the criteria are too weak to catch it, and three downstream nodes build on the mistake. The spec's second question for choosing a tier is "how expensive is an undetected mistake." If it is silent and costly, go up a tier. The warning sign is a `minimal` node whose description contains the word "decide."

**Data flow through prose.** Two nodes that communicate by one writing a file and the other reading it, with no declared input or output. The dependency is real but invisible to the harness, so it schedules them in parallel and the reader runs before the writer. The warning sign is a `depends_on` with no corresponding `from:` reference in the dependent's inputs. Declare the data flow.

**The unbounded escape hatch.** An `external` criterion that delegates to a harness-registered checker. It works, on the harness it was written for. Move the graph and the criterion fails to resolve. The spec allows `external` and says to avoid it in portable graphs. The warning sign is any `external` kind in a graph you intend to share.

**Permission creep through subgraphs.** A subgraph node with broad permissions, containing child nodes that inherit them. The child that renames a file can now also push to main. Permissions should narrow as you descend. The warning sign is a subgraph whose children declare no `requirements` of their own.

## Getting Started: An Operational Checklist

You do not need to adopt a harness to get value from writing the plan down. Here is the order I recommend.

**Validate before anything else.** The reference validator runs with two Python packages and no model.

```bash
python3 -m pip install jsonschema pyyaml
git clone https://github.com/AlexMercedCoder/agentic-graph-spec
cd agentic-graph-spec
python3 tools/validate_agraph.py --strict examples/
```

Six example graphs ship with the repository, from a minimal single-node graph through parallel tracks, decisions, gates, and the test-repair loop. Read them before writing your own. The `conformance` directory holds invalid fixtures that each name the diagnostic they should produce, which is the fastest way to learn what the validator enforces.

**Write one graph by hand for a job you have already done.** Pick something with three to six steps that you have watched an agent do badly. Write the nodes, assign tiers, and write a `command` criterion for every step that has a testable outcome. You will find the step where you cannot write a criterion. That step is the one that needs a gate, and finding it is the point.

**Generate, then edit.** Once you know the shape, let a harness draft graphs from an objective and treat the draft as a starting point. Both `magent graph generate` and `loro graph generate` produce a review-only file. The generated tiers are usually too high. The generated criteria are usually too weak. Fix both before running.

**Commit the graph next to the code.** A `.agraphs/` or `graphs/` directory in the repository, reviewed in pull requests like any other change. A tier change is a cost change. A permission change is a security change. Treat them that way.

**Look at the routing profile.** Every harness maps tiers to models differently, and the spec asks harnesses to document and expose that mapping. Before running a graph on a new harness, check what `advanced` and `frontier` resolve to. That mapping is the main reason the same graph behaves differently in two places.

**Use the run record.** Level 3 harnesses emit a run record for every execution: which node ran, on which model, whether it was downgraded, which criteria passed, how much it cost. This is where you learn whether your tiers were right. A `standard` node that fails criteria and succeeds on the escalated retry every time is a node that wanted `advanced`.

**Read the harness integration guide if you build tools.** The repository has a guide covering parsing, scheduling, model routing, criteria evaluation, and human checkpoints. Pick a conformance level you can honor completely. Implementation reports, and especially reports of things that are awkward to express, are the most useful contribution to the spec right now.

## Where Graphs in AI Engineering Are Heading

The three earlier uses of graphs each turned an implicit structure into an explicit one. Knowledge graphs made relationships explicit. GraphRAG made corpus-level structure explicit. Control-flow graphs made execution order explicit. The pattern is consistent enough to predict what comes next.

The work graph and the agent profile converge. AGS describes the job. OAP describes the durable agent selected for that job. A graph node can already name an OAP profile, so the plan says not only what work needs doing but which reviewed agent does it, with what permissions and what memory. Loro implements that intersection today. When the plan, the agent, and the memory are all files in the same repository, an entire agentic workflow is reviewable before a token is spent.

Graphs get generated, then reviewed, then run. The interesting workflow is not writing graphs by hand. It is having a model draft one from an objective, a person editing the tiers and criteria, and a harness executing it under budget. Both my harnesses do this now. I expect it to become the default shape of delegating work to agents, because it is the only shape where a human sees the plan before paying for it.

Lineage comes for agent work. Data platforms learned that a DAG viewed backward is lineage, and lineage is how you answer "where did this number come from." A run record over an Agentic Graph is the same thing for agent output. Which node produced this file, on which model, under which criteria, approved by whom. Regulated industries will require it, and the EU's general-purpose AI enforcement powers that took effect on August 2, 2026 are one reason they will require it soon.

Routing becomes a market. Once a graph says `advanced` instead of naming a model, the harness's routing profile is a place where cost and quality get traded off explicitly. I expect harnesses to compete on routing profiles the way query engines compete on optimizers, and I expect the graph format underneath to stay stable while they do. That is what happened with Apache Iceberg and the engines that read it.

On the data side, this connects to work I do at Dremio in one concrete way. Dremio's MCP Server exposes governed lakehouse access as a tool an agent can call, which means a graph node can declare it in `requirements.tools` and scope its permissions like any other resource. A data task in a graph becomes a bounded loop with a checkable success criterion, a cost cap, and an access scope, instead of a model with a database connection and good intentions. That is a factual mention rather than a pitch. The point is that the same graph discipline applies to data work as to code.

## Conclusion

AI engineering has used graphs three ways so far. Knowledge graphs gave symbolic structure to facts, and embeddings partly displaced them until GraphRAG showed that community structure in a graph makes global questions answerable in a way vectors cannot. Control-flow graphs like LangGraph gave agents branches, loops, checkpoints, and interrupts, but locked the plan inside code and never defined what done means. Memory graphs like MagGraph gave what an agent accumulates a form a person can read and correct.

The fourth use is the work itself. An Agentic Graph writes the plan as a file: bounded loops with briefs, typed data flow, harness-checked success criteria, capability tiers instead of model names, scoped permissions, budgets, and failure handling. It is reviewable before the tokens are spent, portable between tools, checkable by a machine, and routable so each step gets a model sized to its difficulty. Loro and MagAgent both run it at full conformance today, and the same 150-line file behaves correctly in both without an edit.

Write one graph for a job you have already watched an agent do badly. The step where you cannot write a success criterion is the step that was always going to fail.

## Keep Going

If this piece was useful, I have written a lot more on agentic AI and the open data foundations agents work against. *Architecting an Apache Iceberg Lakehouse* (Manning) covers the governed data layer that lineage, budgets, and access scopes trace back to. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
