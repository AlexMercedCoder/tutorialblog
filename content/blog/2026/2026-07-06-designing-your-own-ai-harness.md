---
title: "Designing Your Own AI Harness: A Deep Dive Into the Architecture of Agent Loops, Tools, Context, and Control"
date: "2026-07-06"
description: "A deep dive into custom AI harness architecture: model layers, tool design, context management, permissions, control budgets, persistence, orchestration, and evaluation systems."
author: "Alex Merced"
category: "Agentic AI"
tags:
  - AI agents
  - agent architecture
  - MCP
  - tool calling
  - language models
canonical: https://iceberglakehouse.com/posts/designing-your-own-ai-harness/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/designing-your-own-ai-harness/).

*By Alex Merced, Head of Developer Relations at Dremio*

The most underappreciated finding in applied AI this year fits in one statistic: a major framework team took the same model, changed nothing about it, rebuilt only the machinery around it, and watched their score on a leading agent benchmark jump from the low fifties to the mid sixties, vaulting from the middle of the pack into the top five. No new model. No fine-tuning. Just a better harness.

The harness, the loop, tools, context management, permissions, and persistence wrapped around a language model, is where agents are actually engineered, and while most people will rightly use the excellent commercial and open harnesses that now exist, a growing population needs to build their own: product teams embedding agents into applications, platform teams needing control the packaged tools will not cede, researchers who need to see every token, and engineers who simply refuse to operate machinery they do not understand, a camp I have deep sympathy for. For all of them, and for anyone who wants to understand what their off-the-shelf agent is actually doing, this article is the deep dive: the anatomy of a harness component by component, the architectural decisions at each layer with their honest trade-offs, the hard-won patterns, progressive context compaction, permission matrices, filesystem-first tools, budget enforcement, that separate production harnesses from weekend demos, and a staged path from a hundred-line loop to a system you can trust unattended. My biases declared: I work at Dremio, whose MCP server is one of the governed endpoints a well-built harness might call, and my daily drivers are commercial harnesses whose design choices I will reference as evidence throughout, because the best public teachers of harness design are the tools that won.

## First Principles: What You Are Actually Building

Strip everything away and a harness is a while loop with judgment. Here is the irreducible core, in prose pseudocode, because every architecture decision in this article is an elaboration of one of its lines.

Assemble the initial context: system instructions, the task, whatever project knowledge applies. Then loop: send the context to the model along with schemas describing the available tools. The model responds with either an answer, in which case check whether the task is done, or with tool calls, requests to read a file, run a command, query an API. Validate each requested call against permissions, execute the allowed ones, and append the results to the context. Check the budgets, steps, time, tokens, money, and if any is exhausted, stop gracefully. Otherwise, loop again.

That is the whole animal, and a functioning version fits in a few hundred lines, which is itself an important design fact: one deliberately minimal open harness ships under a thousand tokens of scaffolding and performs respectably, proving how much of the magic is the loop plus a strong model. Everything else in this article, and everything in the feature lists of the major commercial harnesses, is an answer to one of five questions that the minimal loop leaves open. How does the model talk to the world, the tool layer. What does the model get to see, the context layer. What is the model allowed to do, the permission layer. What happens when things go long or wrong, the control layer. And what survives the session, the persistence layer. Architect those five deliberately and you have a harness. Let them happen by accident and you have a demo that will humiliate you in production.

One framing to carry throughout: the harness is a delivery mechanism for context engineering. Models are stateless and see only what you assemble for them each turn, their performance degrades measurably as context fills with noise, the phenomenon practitioners call context rot, and so nearly every sophisticated harness feature, compaction, subagents, tool output management, file-based memory, is ultimately about getting the right information in front of the model and keeping the wrong information away from it. Hold that lens and the whole design space organizes itself.

## Watch the Loop Run: One Task, Traced

Before the components, one traced execution, because seeing the loop's lines fire in order makes every later section concrete. The task, given to a modest custom harness: "the CSV exports in the reports folder have inconsistent date formats, normalize them and tell me what you changed."

Turn one: the harness assembles context, its system instructions and tool schemas at the front for cache stability, the project's instruction file, the task, and sends it. The model returns a tool call: list the reports folder. The permission layer checks the matrix, read-only tier, allowed silently, executes, and appends the listing, forty files, as an observation.

Turns two through four: the model samples, read this file, read that one, and the tool layer's output management earns its first keep: each CSV is thousands of lines, so the read tool returns the first fifty rows plus a note of the full size, enough to diagnose formats without flooding the window. The model identifies three date conventions across the files and proposes its plan as a message. The harness's instruction file said plans touching more than ten files require approval, so the control layer surfaces the plan and pauses. The human approves.

Turns five through nine: the model writes a normalization script to a scratch directory and requests shell execution. The permission layer classifies it, mutating, sandboxed path, allowed with logging, and the sandbox confines the run. The script fails on two files with a malformed year. The failure returns as an honest observation, exit code, stderr, the offending rows, and the model adjusts the script to quarantine unparseable rows rather than guess, reruns, success. Note what the harness did here: nothing clever, it just delivered truthful feedback and let the loop do its work.

Turn ten: budgets are healthy, twelve steps of forty used, a fraction of the token ceiling, but the context is now heavy with observations, so the compaction layer runs its cheapest stage, dropping the superseded file previews while pinning the task, the plan, and the error history. The model writes its summary of changes to a notes file, the persistence habit the system prompt requires, and returns its answer: files normalized, two rows quarantined with reasons, script saved for reuse. The control layer sees the completion signal, runs the validation hook, a quick script confirming every date now parses, and only then marks the task done. Total: ten turns, one approval, one caught failure, an audit log that reconstructs all of it, and a reusable artifact.

Every subsystem this article is about to detail appeared in that half page: assembly, caching order, permission tiers, sandboxing, output truncation, honest errors, budgets, compaction, notes, hooks, validation gates, audit. A harness is not exotic. It is this, done deliberately, every turn.

## Decision Zero: Build, Assemble, or Adopt

Before the components, the honest gate everyone should pass through, because building a harness is a commitment and the alternatives are strong.

Adopt means using the packaged harnesses, the commercial terminal agents and their peers, and it is the right answer for most individual productivity and most coding work: they embody years of hard lessons, they expose customization through instruction files, skills, hooks, and MCP, and their headless modes embed into pipelines without you owning a loop. Assemble means building on an agent framework, the graph-based runtimes that give you typed state, checkpointing, and resumability, with batteries-included agent layers on top providing planning, filesystem tools, subagents, and compression out of the box. Assembly is the right answer when you need a custom agent inside a product but your differentiation is the workflow, not the loop mechanics, and the checkpoint-and-resume story, pause any step, serialize state, resume on another machine days later, is genuinely hard to replicate alone. Build from scratch is the right answer in three cases: the loop itself is your product or research subject, your constraints, air-gapped environments, exotic latency budgets, deep protocol integration, defeat the frameworks, or the pedagogical case, which I refuse to dismiss, because a team that has built even a toy harness debugs its production agents, whoever made them, at a different level.

The rest of this article serves all three camps: builders get the blueprint, assemblers get the checklist of what their framework must provide, and adopters get X-ray vision into the tools they already run.

## The Model Layer: Your Foundation's Foundation

The first component is the interface to the model itself, and its design goals are boring, which is the point: reliability, portability, and cost hygiene.

Portability first: wrap the provider behind your own interface from day one, because provider-neutrality is cheap at hour one and expensive at month six, and the year's market turbulence, repricings, deprecations, access changes, has made single-provider coupling a documented business risk. Your abstraction needs to cover the real surface: streaming token delivery, native tool-calling with structured schemas, and, increasingly, provider-side features like prompt caching, which brings the first non-obvious design rule: order your context for cache stability. Providers discount tokens that prefix-match previous requests, so stable content, system instructions, tool schemas, project context, belongs at the front, volatile content at the back, and a harness that interleaves them carelessly can double its bill without changing a word of behavior.

Reliability second: every model call can fail, time out, or return malformed tool arguments, so the model layer owns retries with backoff, timeout enforcement, and schema validation of what comes back, with malformed tool calls fed back to the model as errors to correct rather than crashing the loop. And accounting third: this layer is where every token and dollar is counted, per call, per session, per task, because the budget enforcement that the control layer needs and the cost-per-task metrics that the evaluation layer needs both depend on the model layer measuring honestly. Instrument it first, you will thank yourself weekly.

## The Tool Layer: Where Design Taste Shows Most

Tools are how the agent acts, and tool design is where I have watched the most harnesses go wrong, usually in the same direction: too many tools, too narrow, too clever.

The mechanics are standard by now: each tool is a typed schema, name, description, parameters, that the model sees, plus an implementation the harness executes, with results returned as observations. The Model Context Protocol has become the ecosystem's answer for external tools, typed by default, discoverable, and reusable across harnesses, and your harness should be an MCP client early, because it converts the entire ecosystem of servers, databases, browsers, ticketing systems, governed data platforms including my employer's, into your agent's tool belt for free.

The design lessons are where the field's scar tissue lives, and the most important one comes from a production case study worth knowing: a major cloud team's incident-response agent began with over a hundred bespoke, specialized tools and a prescriptive prompt, and performed mediocrely on novel incidents. The rebuild threw most of it away: expose the world as a filesystem, source code, runbooks, schemas, past investigation notes as files, give the agent a handful of general tools, read, search, list, shell, and let it investigate the way an engineer would. Their task-success measure rose by thirty points. The lesson generalizes and matches what the leading coding harnesses converged on independently: a few powerful, composable, general tools beat a hundred narrow ones, because general tools let the model apply its reasoning, while narrow tools demand it guess your API's ontology.

Three more rules earn their place in any harness. Manage tool output aggressively: a two-thousand-line log dump is context poison, so truncate, summarize, or offload large outputs to files the agent can grep, returning a reference rather than the payload. Make tools honest about failure: an error message that says what went wrong and what a valid call looks like turns failure into a self-correcting step rather than a doom loop. And design for idempotency and reversibility wherever the domain allows: tools that can be safely retried and actions that land on branches or in staging areas make the whole system forgiving of the model's imperfection, which is the harness's actual job.

## The Context Layer: The Heart of the Machine

If the harness is a context delivery mechanism, this layer is the product, and it decomposes into assembly, budget management, and compaction.

Assembly is the per-turn question: what goes in the window, in what order. The stable spine, per the caching rule, comes first: system instructions defining the agent's role and rules, tool schemas, and durable project context, which mature harnesses source from instruction files, the AGENTS.md convention and its relatives, so that humans can shape agent behavior in versioned, reviewable text rather than per-session prompting. Then the task, then the working history of the session. The discipline that separates good assembly from stuffing: everything competes for the model's attention, irrelevant material actively degrades reasoning, and the assembler's bias should be ruthless relevance, retrieve and include what the current step needs, reference the rest as files or summaries the agent can pull on demand.

Budget management is the running question: the window is finite, tool observations routinely consume the dominant share of it in long sessions, and the naive approach, let it fill until the API errors, is not an option. Track token pressure continuously against the window, using the provider's own reported counts as your calibration, and treat rising pressure as a signal to act early, not a cliff to fall off.

And compaction is the answer when pressure demands action, the most studied subsystem in modern harness engineering, and the state of the art is emphatically not a single emergency summarize-everything trigger, which activates late, destroys information, and compounds errors on repeat. The pattern that the leading harnesses and the research literature converged on is progressive, multi-stage compaction: begin with the cheap and lossless, trim redundant tool outputs, drop superseded file reads, collapse repeated observations, escalate to targeted summarization of older exchanges while pinning the task statement, key decisions, and recent turns verbatim, and reserve full-history summarization as the last resort, ideally paired with a scratchpad file where the agent has been journaling its findings all along, so that compaction compresses the conversation without erasing the knowledge. That last idea, the agent maintaining its own external notes as durable memory that survives any compaction, is one of the highest-value patterns in the field, and it costs almost nothing to implement: a file, a habit in the system prompt, and a read tool.

## The Permission Layer: Autonomy as a Dial, Not a Switch

An agent that acts needs a theory of what it may do, and the difference between a toy and a production harness is that the theory is engineered rather than vibes.

Start with a risk taxonomy: classify every tool and, for powerful tools like the shell, every action pattern, into tiers, read-only, mutating-but-reversible, destructive, financial, exfiltrating, and encode a permission matrix mapping tiers to dispositions: allow silently, allow with logging, require human approval, deny always. The matrix, not the model, is the authority: requested calls are validated against it before execution, denials are returned to the model as observations it can route around, and the matrix itself is configuration, per project, per environment, per trust level, so the same harness runs locked-down in production and permissive in a sandbox.

Then contain the blast radius structurally, because permission checks are necessary and insufficient: run execution inside a sandbox, containers, virtual machines, or OS-level primitives that confine filesystem and network reach, keep secrets out of the agent's environment entirely, injected by the harness at execution time rather than visible in context, and treat everything the agent reads, files, web pages, tool outputs, as untrusted input, because prompt injection, malicious instructions smuggled into content, is the field's defining unsolved attack, and your defenses are layered skepticism: instruction hierarchies the model is trained to respect, detection heuristics, and above all a permission matrix that makes the worst case boring. Design for the audit from day one: every tool call, decision, and approval logged with enough fidelity that you can reconstruct any session, because the first serious incident review will happen, and the harness that can answer "what exactly did it do" survives it.

## The Control Layer: Budgets, Stop Conditions, and Failure

The loop needs to know when to stop, and giving it that knowledge is a small subsystem with outsized returns.

Enforce budgets on four axes: steps, a maximum number of loop iterations, wall-clock time, tokens, and cost, checked every turn, with graceful degradation on exhaustion, the agent is told the budget state and asked to conclude, summarize progress, and hand off, rather than being killed mid-thought. Budgets convert the failure mode from "runaway agent burned two hundred dollars overnight" to "agent stopped at its limit and left a status note," which is the entire difference between a system you can schedule and one you must babysit.

Define stop conditions beyond budgets: explicit task-completion signals, validation gates, the task is done when the tests pass, not when the model says so, and escalation paths, conditions under which the agent must stop and ask a human, encoded as rules rather than hoped for as judgment. Handle the long-horizon cases deliberately: checkpointing, serializing loop state so sessions survive crashes and resume across machines, is the feature that graph-based runtimes give you and hand-rolled loops usually lack until the first painful loss, and for continuous work, the pattern of re-injecting the standing objective into fresh context windows keeps a persistent agent on-mission across context resets. And treat repeated failure as a first-class signal: the same tool failing three times, the same file edited in circles, are loop pathologies your control layer should detect and break, with the state handed to a human, because the model will not always notice it is stuck, and the harness must.

## The Persistence Layer: What Survives the Session

Sessions end, and value should not. The persistence layer decides what carries forward, and the field's answer has converged on something refreshingly low-tech: files first.

A store of plain files, markdown notes, project instructions, accumulated conventions, investigation journals, organized simply and read through the same tools the agent already has, outperforms elaborate memory architectures for most harness purposes, and it comes with the property that matters most: humans can read, edit, and version everything the agent knows. Vector stores earn their place when semantic retrieval over large corpora is genuinely needed, as a complement rather than a replacement. The design decision that matters more than the storage technology is write governance: an agent that writes its own memory can poison its own future, so define write rules, what kinds of conclusions may be persisted, where, with what review, and keep the durable store append-mostly and auditable. Session-level persistence, transcripts, checkpoints, artifacts, rounds out the layer, and the test of the whole design is simple: kill the process mid-task, restart, and see what the agent still knows. Production harnesses pass that test on purpose.

## The Orchestration Layer: Subagents and Events

Two advanced structures appear in every leading harness, and both are context engineering by other means.

Subagents, a lead agent delegating scoped work to child agents, earn their complexity in exactly two situations: parallelism, several independent investigations at once, and context isolation, a child burns its own window exploring a rabbit hole and returns only conclusions, keeping the parent's context clean. The engineering that makes them safe is the part naive implementations skip: each child gets a rebuilt context and its own permission scope, not an inherited copy of the parent's, and results return through structured summaries rather than transcript dumps. Resist the swarm temptation: most tasks are better served by one agent with clean context than five with chaos, and the leading harnesses use delegation surgically.

An event and hook system, the harness emitting events at every lifecycle point, session start, before and after each tool call, on file edits, on completion, with user-defined handlers attached, is the extension mechanism that lets policy live outside the model: format the code after every edit, run the tests after every change, block any command matching a pattern, notify a channel on completion. The most mature commercial harness exposes dozens of event types, and the design lesson for builders is to emit events from day one even before you need them, because every future integration, observability, enforcement, automation, attaches there.

## The Evaluation Layer: The Sibling System You Cannot Skip

The last component is the one that makes all the others improvable: the eval harness beside the agent harness.

Build a gold set, a labeled collection of real tasks from your domain with known-good outcomes, and run it on every meaningful change, model upgrades, prompt edits, tool redesigns, compaction tuning, because agent behavior is emergent and regressions arrive from directions intuition never watches. Instrument traces end to end, every session reconstructable as a sequence of contexts, calls, and observations, because debugging an agent without traces is debugging a distributed system with print statements. Track the operational metrics that actually govern viability, task success rate, cost per completed task, tokens per task, human interventions per task, time to completion, and let them, not vibes, drive the tuning. And include security evals, injection attempts, permission probes, budget abuse cases, in the gold set, because the permission layer is code, and code that is never tested is code that does not work. Teams that stand up evaluation early report the same experience: the eval harness pays for itself the first time a "small prompt improvement" quietly halves the success rate, which it will.

## The Surface Layer: How Humans and Systems Drive It

A harness needs at least one face, and the mature pattern is three faces over one engine, built in this order.

The headless surface comes first, and if you build only one, build this: a single-shot invocation, task in, work done, structured result out, with flags for budgets, permission profile, and output format. Headless is what makes the harness composable, schedulable in cron and CI, pipeable into scripts, callable from other programs, and designing it first enforces the discipline that saves you later: all state in the engine, none in the interface.

The interactive surface, terminal UI or minimal web panel, earns its keep for development and supervised work: streaming output so humans see the agent think, inline rendering of diffs and plans, approval prompts from the permission layer surfaced as real interactions rather than log lines, and session controls, pause, redirect, abort, wired to the control layer's checkpoints. Resist building this into a monument: the commercial harnesses set a high bar for interactive polish, and a custom harness's interactive face needs to be honest and responsive, not beautiful.

And the server surface is the strategic one: expose the harness through an API, and specifically through MCP's server side, so that editors, orchestrators, schedulers, and other agents can drive your agent as a typed tool. This is the move that turns a harness from a tool into infrastructure, agents composing agents, your specialized loop callable inside larger systems, and it costs little once the headless surface exists, because a server is a headless invocation with a listener in front. One engine, three faces, zero logic in any face: that separation is the whole architecture of the layer.

## The Anti-Patterns: Six Ways Custom Harnesses Die

The failure modes repeat with such regularity that naming them is a public service, and I have committed at least three of these personally.

**The tool zoo.** Forty narrow tools, each wrapping one API endpoint, each with its own parameter ontology the model must guess. The agent spends its reasoning on tool selection instead of the task, and every new capability means another tool. The cure is the filesystem lesson: few general tools, world exposed as readable structure.

**The infinite context buffet.** Whole files, full logs, complete histories, appended forever, compaction added "later." Performance decays across the session, costs balloon, and the team concludes agents are overhyped when the actual diagnosis is context rot, self-inflicted. The cure is the context layer, applied from stage one, not stage three.

**The trust-the-model permission model.** No matrix, no tiers, no sandbox, just a system prompt asking the model to be careful. It works in every demo and fails on the first injection or hallucinated path, and the incident review finds no audit log because logging was also "later." The cure is structural: matrix, sandbox, logs, before the first real credential goes anywhere near the loop.

**The unkillable session.** No budgets, no stuck-loop detection, no checkpoints: the agent that ran all weekend, the crash that lost six hours of state, the retry storm that made a vendor's rate-limit team aware of your company. The cure is the control layer, which is an afternoon of work that prevents each of these exactly once, permanently.

**The eval-free tune.** Prompt tweaks and model swaps shipped on vibes, each one improving the demo task and silently breaking two others, discovered by users. The cure is the gold set, started at ten tasks, run on every change, boring and decisive.

**And the monolith face.** Business logic braided into the TUI, so the harness cannot run headless, cannot be scheduled, cannot be served, and the first automation request triggers a rewrite. The cure is the surface layer's separation, engine first, faces after, enforced from the first commit.

Every one of these is survivable, and every one is cheaper to prevent than to fix, which is what the staged build below is actually for: it sequences the prevention.

## A Staged Build: From Weekend to Production

Assemble the components into the path I recommend walking, because sequencing is half the wisdom.

Stage one, the honest weekend: the minimal loop, one model provider behind your abstraction, four general tools, read, list, search, shell-in-a-container, budgets on all four axes, and a permission matrix with two tiers. This system already does real work, and building it teaches more about agent behavior than a month of reading.

Stage two, the useful month: instruction-file loading, MCP client support to inherit the tool ecosystem, tool output truncation and offloading, the scratchpad-notes pattern, session transcripts, and the first eval set of ten real tasks. This is the stage where the harness starts winning against your expectations, and where cache-aware context ordering pays its first visible bills.

Stage three, the trustworthy quarter: progressive compaction with pinned task context, the event and hook system, approval-gated permission tiers with full audit logging, checkpoint and resume, failure-pattern detection in the control layer, and the eval set grown to fifty tasks with cost and success tracked per change. This is the production line: at this stage you can schedule the agent, hand it to teammates, and answer the incident-review question.

Stage four, chosen deliberately or skipped forever: subagents with isolated contexts and scopes, durable file-based memory with write governance, a server mode so other systems, including other agents, can drive your harness, and domain specialization, which is where your harness stops being a general clone and becomes the thing only your team could have built, the reason to have walked the path at all.

## Questions I Hear Most Often

**Isn't this all wasted effort when the commercial harnesses are so good?** For general coding productivity, mostly yes, adopt and customize. The build case is specificity and control: agents embedded in products, domains with constraints the packaged tools cannot honor, air-gapped and regulated environments, and platform teams for whom the loop is infrastructure they must own. And the learning case stands on its own: every hour building a harness compounds into sharper operation of every agent you ever run.

**Which framework should I assemble on, if assembling?** Choose on the boring criteria: typed, checkpointed state you can pause and resume, first-class observability, clean escape hatches to raw model calls, and an active community, rather than on demo elegance. The graph-based runtimes with agent layers on top currently define the mature end of that spectrum, and the honest alternative for simple needs remains a few hundred lines of your own loop, which at least you will fully understand.

**How much does the model choice matter versus the harness?** Both matter, and the harness is the half you control: the benchmark jump this article opened with came from harness changes alone, and equally, no harness rescues a model below the task's reasoning floor. The practical posture: build provider-neutral, benchmark model-harness pairs on your own gold set, and expect the answer to change several times a year.

**What is the single most common design mistake?** Context negligence: dumping whole files, raw logs, and full histories into the window and wondering why the agent got dumber as the session got longer. The fix is this article's spine, ruthless assembly, output management, early progressive compaction, external notes, and it routinely improves task success more than any model upgrade.

**How do I make my harness safe enough to run unattended?** Layered, in this order: sandbox the execution, scope the permissions with approval gates on the destructive tiers, enforce budgets on every axis, log everything, detect stuck loops, and only then schedule it, starting with read-only and reversible workloads and expanding trust with evidence. Unattended is earned, and the harness features are how it is earned.

**Where does MCP fit in a custom harness?** Two places: as a client, adopt it early to inherit the ecosystem's tools, including governed data endpoints, instead of hand-building integrations, and as a server, expose your finished harness through it so editors, other agents, and pipelines can drive your agent as a tool. The protocol layer is the part of this field that has genuinely standardized, and a custom harness that ignores it is custom in the expensive direction.

## Closing Thoughts

The harness is where the abstract power of language models becomes accountable work, and its design space, five layers, a dozen decisive patterns, is now well enough mapped that building one is engineering rather than alchemy. The deepest lesson the field's first years produced is the one every layer of this article repeated in its own vocabulary: the model supplies the reasoning, and everything that makes the reasoning safe, cheap, durable, and true, the context discipline, the permission matrix, the budgets, the evals, the audit trail, is machinery, and machinery is yours to design. Build it deliberately, or at minimum, understand it deeply in the tools you adopt, because the difference between teams that get compounding value from agents and teams that get demos is not the model they rent. It is the harness they run.

If the way this article builds understanding works for you, that is what my books do at full depth. I co-authored Apache Iceberg: The Definitive Guide and Apache Polaris: The Definitive Guide for O'Reilly, with further titles on lakehouse architecture, data engineering, and agentic analytics.

Browse the full collection of my books on data and AI at [books.alexmerced.com](https://books.alexmerced.com).
