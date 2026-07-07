---
title: "The State of Agentic AI Standards in 2026: MCP, A2A, WebMCP, OSI, and the Protocol Stack Taking Shape"
date: "2026-07-06"
canonical: https://iceberglakehouse.com/posts/state-of-agentic-ai-standards-2026/
description: "The agentic AI protocol stack is solidifying in 2026 — MCP for tools, A2A for agents, WebMCP for the web, OSI for semantics, payments, identity, and security."
author: "Alex Merced"
category: "Agentic AI"
tags:
  - Apache Iceberg
  - data engineering
  - lakehouse architecture
  - agentic AI
  - MCP
  - A2A
  - semantic layer
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/state-of-agentic-ai-standards-2026/).

# The State of Agentic AI Standards in 2026: MCP, A2A, WebMCP, OSI, and the Protocol Stack Taking Shape

*By Alex Merced, Head of Developer Relations at Dremio*

In 2023, an AI agent was a demo. In 2024, it was a framework. In 2025, it was a hundred incompatible frameworks. And in 2026, something genuinely new is happening: the agent world is growing a protocol stack, a set of open standards that determine how agents reach tools, talk to websites, talk to each other, understand business meaning, pay for things, and show their work to humans.

I watch this space from two vantage points. My weekly AI newsletter tracks the standards and protocol developments as they happen, and my day job in the lakehouse world puts me on the receiving end of them, because the single biggest consumer of agent standards is turning out to be data platforms. The agents everyone is building want, more than anything else, to query, analyze, and act on enterprise data, which means every protocol in this article eventually terminates at something I write about the rest of the week: a catalog, a table, a semantic definition.

So this is my mid-2026 map of the agentic standards territory. What each protocol actually does, stated plainly. Where each one stands right now: shipped, versioned, previewed, or aspirational. How they layer rather than compete. The honest open problems, governance, security, and sheer protocol sprawl. And a decision framework for builders who need to ship something this quarter without betting on the wrong horse. The history of data infrastructure teaches one big lesson about moments like this, and I will lean on it throughout: standards wars end, the winners are the ones that stay neutral and layered, and the people who understood the layering early built the durable things.

## Why Standards, and Why Now: The N Times M Problem

Every protocol in this article exists to kill the same monster, so let me introduce the monster properly.

Call it the N times M problem. You have N agents, assistants, copilots, and autonomous workflows. You have M things they need to touch: databases, SaaS applications, websites, payment systems, other agents, and human interfaces. Without standards, every pairing is a custom integration, N times M pieces of glue code, each with its own authentication, its own data shapes, its own failure modes, each breaking whenever either side changes. That is not an inconvenience, it is a scaling wall: the glue grows quadratically while the value grows linearly, and by late 2024 every serious builder had hit it.

Standards convert N times M into N plus M. Each agent implements a protocol once. Each tool or counterparty implements it once. Any agent can then reach any tool, and the glue evaporates. This is the oldest trick in computing: it is what TCP did for networks, what HTTP did for documents, what SQL did for queries, what USB did for peripherals, and, in my corner of the world, what Arrow did for in-memory data, Parquet for files, Iceberg for tables, and the Iceberg REST protocol for catalogs. The agent ecosystem is simply the newest domain to rediscover that agreements beat features.

What makes 2026 the turning point is that the agreements stopped being proposals and started being versioned, governed, shipped standards with adoption numbers. The consensus that has emerged is a layered stack, with each layer answering a different question, and the fastest way to understand the space is to walk the layers. That is the structure of everything that follows: tools, then the web, then agent-to-agent, then semantics, then payments, then the human interface, with the cross-cutting problems of identity and security woven through.

## Three Years in Fast Forward: How We Got Here

A compressed timeline sets the stage, because the speed of this standardization is itself the story, and each date below marks a layer locking into place.

Late 2024: Anthropic introduces the Model Context Protocol, and the initial reaction is polite interest, one vendor's integration scheme among many. The design choice that ages best is the humility: MCP standardizes plumbing and stays out of opinions about agent architecture, which is exactly what lets everyone adopt it.

Early 2025: MCP adoption crosses the tipping point as the other model providers and the major frameworks embrace it, the moment the ecosystem realizes a tool built once can serve every agent. Server counts go vertical, and "MCP server" enters the vocabulary of teams that had never shipped an integration before.

April 2025: Google introduces A2A with dozens of partners, explicitly positioned as MCP's complement rather than competitor, tools versus peers, and the layered-stack framing enters the discourse.

Mid to late 2025: the institutional phase. Google donates A2A to the Linux Foundation within months of launch. IBM's rival agent-communication effort merges into A2A rather than fighting it. Snowflake launches the Open Semantic Interchange with the BI and data tooling world aboard, naming semantics as the missing layer for trustworthy data agents. The payments flags plant in a rush: mandates, checkout protocols, machine-native micropayments. And enterprises stop piloting and start deploying, which converts every standards question from theoretical to budgetary.

Early 2026: the shipping phase. The OSI specification goes live under Apache 2.0 in January with a public repository and working group. Google ships the WebMCP preview in Chrome Canary in February, developed with Microsoft on a W3C track, extending the stack to the browser. Enterprise supporters of the layered stack pass the hundred mark.

April to June 2026: the maturity markers. A2A reaches version 1.0 with signed Agent Cards, 150-plus production organizations, and SDKs across five languages. Data platforms operationalize the stack, managed MCP servers, MCP governance acquisitions, semantic layer roadmaps, and the Apache Polaris community votes to bring an OSI-aligned semantic specification into the open catalog world. The stack stops being a diagram and becomes a deployment.

Eighteen months from one vendor's protocol to a multi-foundation, multi-layer standards stack with version numbers and adoption counts. For comparison, the web took most of a decade to travel the equivalent distance. Whatever else is true of the agent era, its standardization clock runs fast, which raises the stakes of getting the layering right the first time.

## MCP: The Tool Layer That Won

Start at the foundation, because one layer of this stack is no longer contested. The Model Context Protocol, introduced by Anthropic in late 2024, answers the first question every agent asks: how do I reach tools and data? And in the eighteen months since, it has become the closest thing the agent world has to a settled standard.

The design is deliberately boring, which is a compliment. An MCP server wraps some capability, a database, a file system, a SaaS API, a search index, and exposes it through a standard interface of tools the agent can invoke, resources it can read, and prompts it can use. An MCP client, living inside the agent or its host application, discovers what a server offers and calls it. JSON-RPC carries the messages, with a streamable HTTP transport for remote servers and OAuth-based flows handling authorization. One protocol, and any compliant agent can use any compliant server. The USB-C analogy the ecosystem adopted early remains the right one: a universal port for AI capabilities, dull by design, transformative in aggregate.

The 2026 status is broad, deep, and institutional. The specification has continued to revise on a steady cadence, with the late-2025 revision now the widely supported baseline across enterprise implementations. Every major model provider and agent framework speaks it. The server ecosystem runs to the thousands, spanning every database, developer tool, and SaaS platform that matters, with registries and directories maturing from lists into infrastructure. And the clearest adoption signal is who now operates managed MCP surfaces: the data platforms. Snowflake runs managed MCP servers exposing governed query and search tools, and acquired a company specifically for enterprise MCP governance, agent identities, permissions, and audit trails across tools. Dremio exposes its lakehouse through MCP so agents query governed Iceberg data with the same access controls humans get. When the most conservative buyers in software, enterprise data platforms, operationalize a protocol and build governance products around it, the standardization argument is over.

The honest critiques have shifted accordingly, from "will it win" to the problems of winning. Context bloat, where agents drown in tool definitions from too many connected servers, is driving work on better discovery and selective loading. Security researchers keep demonstrating that a tool interface is an injection surface, more on that below. And governance remains the structural question: MCP is an open specification with open process, but stewardship still centers on Anthropic, and the ecosystem periodically debates whether the tool layer's constitution should live at a neutral foundation the way the agent-to-agent layer's now does. Watch that conversation, because the precedents from my world, formats thriving after donation to neutral homes, all point one direction.

## A2A: Agents Talking to Agents, Now at 1.0

One layer up sits the question MCP deliberately does not answer: how do agents find and work with each other? That is the Agent-to-Agent protocol, A2A, and its past year is the fastest maturation story in this article.

The design mirrors how the web solved service discovery. Every agent publishes an Agent Card, a machine-readable description of its capabilities, supported task types, input formats, and authentication requirements. A client agent discovers a remote agent through its card, then delegates tasks over a JSON-and-HTTP protocol with support for long-running work, streaming results, and multi-turn exchanges. The framing the community settled on is exactly right: MCP connects agents to tools, A2A connects agents to peers. A tool is invoked and returns. A peer is delegated to, and negotiates.

The institutional trajectory is the story. Google introduced A2A in April 2025 with dozens of launch partners, then donated it to the Linux Foundation within months, placing it under neutral governance with founding participation from Amazon, Cisco, Google, Microsoft, Salesforce, SAP, and ServiceNow. IBM's competing Agent Communication Protocol merged into A2A in August 2025, consolidating the layer instead of fragmenting it. And in April 2026, A2A reached version 1.0, a stable production standard, shipping alongside signed Agent Cards for verifiable identity. The adoption numbers at the one-year mark: over 150 organizations running it in production, SDKs across five languages, native support in essentially every major agent framework, LangGraph, CrewAI, LlamaIndex, Semantic Kernel, AutoGen, Google's ADK, Microsoft's, and general availability inside the big cloud agent platforms.

My assessment: A2A executed the open-standard playbook almost flawlessly, propose broadly, donate quickly, absorb rivals, version deliberately, and it is now the presumptive answer at its layer for enterprise multi-agent systems. The unsettled edges are real but peripheral: a decentralized alternative vision built on W3C decentralized identifiers continues to develop for those who find A2A's model too web-conventional, and the deeper question of what agents should say to each other, the semantics of delegation, remains above the protocol, which standardizes the envelope rather than the meaning. Envelope first is the right order. It is also not the finish line, which brings us to semantics shortly.

## WebMCP and the Agentic Web: Teaching Sites to Speak Agent

The third layer addresses the messiest surface agents touch: the web itself. Agents have been using websites the hard way, screenshotting pages and simulating clicks, an approach that is brittle, slow, and adversarial to sites that never consented. The 2026 development is the emergence of a consensual, structured alternative.

The headline is WebMCP. In February 2026, Google shipped an early preview in Chrome Canary of a protocol for structured agent interaction with websites, developed jointly with Microsoft through the W3C. The design has two halves: a declarative API through which ordinary HTML forms and page elements become agent-usable capabilities, and an imperative JavaScript API through which sites expose dynamic functionality as callable tools. The name is the strategy: it extends the MCP mental model to the browser, making a website, in effect, an MCP server that any visiting agent can discover and use, with the site rather than the agent defining what is offered. For site owners, that flips the agent relationship from scraping-by-force to capability-by-consent. For the stack, it fills the web-shaped hole between MCP's APIs and the human-shaped web.

Around WebMCP sits a supporting cast of smaller conventions maturing in parallel. The llms.txt convention gives sites a way to publish agent-oriented content maps, agents.md is emerging as guidance for AI coding assistants within repositories, a convention now reaching even the Apache data projects I cover, and Web Bot Auth work in the identity space aims to let legitimate agents authenticate themselves to sites rather than masquerading as browsers. None of these is finished. Together they sketch the agentic web's social contract: sites declare what agents may do, agents identify themselves honestly, and the DOM-scraping arms race gets replaced by an interface both sides maintain on purpose.

Status honesty: this is the youngest layer in the stack. WebMCP is a preview in one browser channel with a standards-track ambition, not a deployed norm, and the economic questions, what happens to sites whose business model assumed human eyeballs, are unresolved and larger than the technology. But the direction has the right participants, the browser vendors and the W3C, and the right shape, capability declaration over interface simulation. I expect this layer to look as inevitable in 2028 as MCP looks today.

## OSI and the Semantic Layer: The Standard Closest to My Heart

Now the layer where the agent world and my world collide head-on: semantics. And here I get to connect this article to the rest of my series, because the Open Semantic Interchange is the standard that runs through the lakehouse.

The problem it attacks is the one every data leader discovered the moment they pointed an agent at their warehouse. Agents can find tables, columns, and joins. What they cannot find is meaning: what counts as an active customer, how revenue is recognized, which of the four margin calculations is the official one. Those definitions exist, but they live scattered and duplicated across BI tools, semantic layers, dbt projects, and tribal memory, each in a proprietary dialect. An agent without them does not merely lack context, it confidently computes the wrong number, and confident wrongness is the failure mode that kills enterprise AI projects. Text-to-SQL was never the hard part. Text-to-the-right-SQL is a semantics problem.

OSI is the ecosystem's answer: a vendor-neutral specification for semantic definitions, metrics, dimensions, entities, relationships, and their business meaning, so that semantics defined once can travel across BI tools, semantic layers, catalogs, and agents. Snowflake launched the initiative in September 2025 with founding partners spanning the BI and data tooling world, Salesforce and Tableau, dbt Labs, and a fast-growing roster. The execution since has been genuinely encouraging: the specification went live under the Apache 2.0 license in January 2026 with a public repository and working group, the partner list has compounded monthly through the catalog, governance, and analytics vendors, and this June's Snowflake Summit put OSI at the center of its semantic governance story rather than the footnotes.

The development that convinces me most, though, is the one I reported in my Polaris article: the Apache Polaris community voted this season to accept an OSI-aligned semantic model API specification into its orbit, alongside its active semantic layer design work. Read the layering there. The semantic standard defines the language of business meaning, and the open catalog becomes a governed home where that meaning lives next to the tables it describes, discoverable and permissioned like any other asset, served to agents through the same MCP surfaces the platforms already run. That is the full stack clicking together: an agent reaches the platform through MCP, coordinates with peers through A2A, and gets its definitions from an OSI-shaped semantic layer governed in an open catalog. Every layer neutral, every layer swappable. It is the lakehouse philosophy applied to meaning, and it is why I keep telling data teams that the agent era makes their semantic debt the most expensive debt they hold.

Sober status notes: the specification is young, translation from a dozen incumbent semantic dialects is genuinely hard, and initiative-led standards must still prove multi-vendor governance durability the way A2A did. But of everything in this article, OSI is the standard whose success or failure most directly determines whether enterprise agents produce trustworthy answers. I am rooting for it with receipts attached.

## Payments and Commerce: The Most Crowded Layer

If the semantic layer is the most important to my readers, the payments layer is the most crowded, and it needs a map more than an evangelist.

The question is real: agents that book, buy, and subscribe need a way to pay that does not involve handing them a credit card number and hoping. The answers, as of mid-2026, come in overlapping flavors. AP2, the Agent Payments Protocol that emerged alongside the A2A ecosystem with dozens of payment-industry partners, centers on cryptographic mandates, verifiable, user-signed authorizations that scope what an agent may spend, on what, within what bounds, giving every party a proof trail. The Agentic Commerce Protocol from OpenAI and Stripe standardizes in-conversation checkout between agents and merchants. x402 from Coinbase revives a dormant HTTP status code for machine-native micropayments in stablecoins, aimed at agents paying per-call for APIs and content. Stripe's machine-payments work and Visa's trusted-agent efforts add rails-side identity and settlement pieces. And commerce-flow proposals stitch the shopping journey itself.

The layering lens sorts the crowd better than a bracket does: identity and authorization mandates, checkout semantics, and settlement rails are different problems, and several of these can compose rather than compete. But I will be more candid here than the press releases are: this layer has too many flags planted, the major backers map suspiciously well onto incumbent payment interests, and history says consolidation, mergers, absorptions, or quiet abandonments, is coming before maturity arrives. Builders should treat agent payments as a capability to pilot behind an abstraction, not a foundation to marry. The A2A-and-ACP merger showed this ecosystem can consolidate well. The payments layer is where that muscle gets tested next.

## The Human Layer and the Cross-Cutting Problems

Three shorter fronts complete the map, and each carries the same lesson: the stack is real, and its seams are where the risk lives.

The human interface layer standardizes how agent work reaches people: protocols like AG-UI for streaming agent output into applications and companion efforts for richer agent-driven interfaces. This matters more than it sounds, because the alternative is every product reinventing the chat-plus-artifacts pattern incompatibly, and because human oversight, approvals, interruptions, visibility into agent reasoning, is a protocol problem before it is a UX problem. It is early, framework-led rather than foundation-governed, and worth watching without betting on.

Identity and trust cut across every layer, and 2026's progress is real but partial: signed Agent Cards give A2A verifiable identities, Web Bot Auth points the same direction for the web, payment mandates carry cryptographic accountability, and enterprise MCP governance products supply the audit trails compliance demands. What does not yet exist is the unified answer, one way for an agent to carry who it is, who it acts for, and what it may do across all the layers at once. Expect that to be the defining standards fight of 2027.

And security is the cross-cutting problem that keeps me honest about all of it. OWASP now publishes a top-ten for agentic applications, and the sobering theme is that every protocol in this article widens the attack surface it standardizes: tool descriptions and web content become prompt-injection vectors, agent-to-agent delegation becomes confused-deputy risk at machine speed, and payment autonomy raises the stakes of every upstream compromise. The standards are responding, scoped authorizations, signed identities, human-in-the-loop checkpoints, but the honest state is that agentic security practice trails agentic capability by a distance every practitioner should respect. The protocols made agents composable. Composability is exactly what attackers compose.

## A Worked Example: One Request Through the Whole Stack

Layer diagrams convince nobody, so let me run a single realistic request through the full stack and name every standard as it fires. The request, typed by a sales director into her company's assistant: "How did the spring campaign perform in Germany, and order a refreshed report for the regional review."

The assistant, an orchestrating agent, starts by deciding it needs two specialists: the analytics agent the data team operates, and the document agent the operations team runs. It discovers both through their Agent Cards, verifying the signatures introduced with A2A 1.0 so it knows it is delegating to the genuine articles, and hands the analysis task to the analytics agent over A2A, a delegation with streaming progress rather than a fire-and-forget call, since the analysis may take a minute.

The analytics agent now needs data, which means the tool layer. Through MCP, it connects to the lakehouse platform's managed server, authenticating as its own principal, not as a borrowed human account. Behind that MCP surface, the catalog, Polaris in my telling, evaluates the agent's role grants, approves access to the marketing and orders tables, and vends short-lived, scoped storage credentials, so the agent's reach is bounded by policy and every touch lands in an audit log against its verified identity. The governance machinery I described in my Polaris article is doing its job here without a human in sight, which was always the point.

Before writing a query, the agent asks the question that separates 2026 from 2024: what does "campaign performance" mean here? It pulls the semantic definitions, the OSI-shaped metrics the analytics team defined once, revenue recognized net of returns, attribution windows, the official margin calculation, from the semantic layer the catalog governs. The SQL it generates now encodes the company's definitions rather than the model's guesses, and the numbers it returns will match the CFO's dashboard, because they came from the same definitions. The result set itself, a few hundred thousand rows aggregated down, travels back not as bloated JSON but as columnar Arrow over the platform's high-speed interface, the transport argument from my Arrow article playing its small quiet part.

The analysis returns to the orchestrator through the A2A task stream, and the human layer takes over: results render into the director's application through the emerging agent-UI conventions, charts, a summary, and, importantly, the lineage of which definitions were used, so a skeptical reviewer can trace every number. She approves the second half of the request, a human checkpoint deliberately placed before anything irreversible.

The document agent now needs the updated brand template from the design vendor's portal. Rather than screen-scraping, it uses the portal's WebMCP-declared capabilities, the site itself exposing "download current template" as a structured tool, and identifies itself honestly through the agent-authentication conventions rather than masquerading as a browser. And when the vendor's premium asset requires payment, the agent presents a cryptographic mandate, an authorization the company pre-signed scoping what this agent may spend and on what, so the transaction clears with a proof trail instead of a shared credit card number.

Total standards fired in one mundane business request: A2A for discovery and delegation, signed cards for agent identity, MCP for tool access, catalog RBAC and credential vending for governed data reach, OSI-shaped semantics for meaning, Arrow for the payload, agent-UI conventions for the human, WebMCP and agent auth for the web, and a payment mandate for the purchase. Two years ago, every one of those junctions was custom glue or an unmanaged risk. That is what a protocol stack is for, and it is also the honest security lesson: nine junctions is nine boundaries to defend, which is why the governance and audit story threaded through every step is not decoration. It is the product.

## What the Stack Means for Data People

Let me close the tour by planting the flag where I always plant it, because the agent standards story and the open data story are converging into one story, and my readers sit at the junction.

Ask what agents actually do all day in an enterprise, and the answer is overwhelmingly: work with data. Query it, summarize it, reconcile it, act on it. Which means the protocol stack in this article, in practice, terminates at the data platform, and every layer maps to a piece of the open lakehouse I spend the rest of my week writing about. MCP is how agents reach the catalog and the engine, and the serious platforms now ship governed MCP surfaces natively. The semantic layer, OSI-shaped, catalog-governed, is how agents stop guessing at meaning. Catalog governance, Polaris in my telling, is how agent principals get the same RBAC, credential vending, and audit trails as humans, which is the only agent-governance story that survives a compliance review. Even the transport question loops back: when agents start moving real analytical payloads rather than chat snippets, JSON gives way to Arrow over Flight, the argument I made in my Arrow piece.

So my advice to data teams is unglamorous and urgent: the best preparation for the agent era is aggressively finishing the open lakehouse era. Get the tables into open formats, the catalog into a governed open standard, the semantics defined once and exportably, the access model principal-based. Every one of those was already best practice. Agents just turned best practice into prerequisite, because agents amplify whatever they land on: good governance becomes a multiplier, and ambiguity becomes confident wrongness at scale.

## What Is Deliberately Not Standardized, and Why That Matters

One more analytical lens before the guidance, because knowing what the stack refuses to standardize tells you as much as knowing what it covers, and it predicts where the next flags will plant.

Nothing in the stack standardizes how an agent thinks. Reasoning strategies, planning loops, memory architectures, model choice, and orchestration patterns all remain deliberately outside every specification, and that restraint is a feature. MCP does not care whether the caller is a single model or a swarm. A2A standardizes the envelope of delegation while staying silent on the intelligence inside either party. The protocols learned the web's lesson: HTTP never standardized how a server generates a page, and that silence is exactly what let the application layer innovate for thirty years. The competitive frontier for agent products stays wide open above the plumbing, which is why every vendor could afford to adopt the plumbing.

Nothing yet standardizes evaluation and trust in results. There is no protocol for "how confident is this answer," no standard for attaching provenance and evaluation scores to agent outputs, no shared way to express "this analysis used these definitions against these snapshots of these tables." The pieces exist in fragments, the semantic layer supplies definitional provenance, table formats supply data versioning, audit logs supply the trail, but the assembled artifact, a verifiable answer, has no spec. I suspect this becomes a serious standards conversation by 2027, and the data world will supply much of its raw material, because lineage and reproducibility are problems we have been solving for a decade.

And nothing standardizes the economics. When agent traffic replaces human traffic on a website, when agents comparison-shop at machine speed, when a vendor's API becomes a line item in a thousand agents' budgets, the technical protocols are ready and the business models are not. WebMCP can express what a site permits, and llms.txt can express what it offers, but neither expresses what the site gets in return, and the tension between agent-friendly and revenue-sustaining is unresolved across the industry. Payment protocols are a partial answer for explicit transactions. The implicit economy of attention and advertising has no agent-era equivalent yet, and that vacuum, more than any technical gap, is what makes the agentic web layer the hardest to predict.

The pattern across all three gaps: the stack standardized coordination first and judgment not at all, which is the historically correct order, and it means the interesting fights of the next two years happen above the protocols this article mapped. Plan for the plumbing to be settled and the judgment layer to be contested, and allocate your attention accordingly.

## A Builder's Decision Framework

For the builders who need to ship this quarter, the map compressed into guidance.

Adopt MCP without hesitation. It is the settled layer, the skills transfer everywhere, and wrapping your internal capabilities as MCP servers is the highest-return integration work available in 2026. Treat server design as API design, minimal, well-described tools beat sprawling ones, and treat every tool as a security boundary from day one.

Adopt A2A when you genuinely have multiple agents that must interoperate across teams, frameworks, or organizations, which is a later stage than most projects admit. Single-agent products dressed as multi-agent systems buy complexity without buying capability. When you do adopt it, 1.0 and signed cards make this the year it is safe to.

Track WebMCP and the agentic web conventions if you own web properties, because publishing agent-facing capability, even just llms.txt today, positions you for the consensual-agent-traffic world coming, and it costs almost nothing.

Engage OSI now if you are a data team, by inventorying where your semantic definitions live and getting them into exportable shape, regardless of which tools you run. The standard is young, but semantic debt compounds daily and the paydown is valuable under every future.

Abstract payments, pilot narrowly, and wait for consolidation. And across every layer, hold the two tests this whole series keeps applying to standards: is the governance neutral enough that competitors co-invest, and can you exit without rewriting your product? Layers that pass both are infrastructure. Layers that fail either are features wearing a standards costume.

## Questions I Hear Most Often

The recurring questions, answered plainly.

**Is MCP versus A2A a real choice I have to make?** No, and the framing misleads. They answer different questions at different layers, tools versus peers, and mature agent systems use both, the way a web service uses both a database driver and HTTP without choosing between them. The real choices are within layers, and even those are thinner than the discourse suggests: MCP has no serious rival at its layer, and A2A absorbed its main one.

**Aren't there just too many protocols?** At the payments and interface layers, yes, and I said so above. But distinguish sprawl from layering: six protocols answering six different questions is architecture, six answering the same question is a war. The core stack, MCP, A2A, WebMCP, OSI, is the former. The test I apply to every new announcement: does this answer a question no existing layer answers? Most new entrants fail it, which is itself useful information.

**Which of these will still exist in 2030?** Applying the neutrality-and-layering lens: MCP's function is permanent whatever its governance evolution, A2A has the institutional shape of a survivor, the agentic-web layer will exist in some form because browser vendors and the W3C are committed, and semantics will be standardized because the alternative is agents that cannot be trusted with numbers, whether under the OSI banner or its successor. Payments will consolidate to fewer names than today. The safest prediction in the set: the layered architecture itself outlives every individual flag.

**How do I secure any of this?** Start from the OWASP agentic top ten, then apply the boring disciplines that always work: least-privilege credentials per agent via scoped, short-lived tokens, which is exactly what catalog credential vending provides on the data side, human approval gates on irreversible actions, treating all retrieved content, tool outputs included, as untrusted input, and audit logging of every agent action against a real identity. The protocols increasingly carry the primitives, signed cards, mandates, OAuth scopes. The assembly is still your job.

**Do I need a semantic layer before I deploy data agents?** You need semantic definitions before you can trust data agents, and a governed layer is the honest way to have them. Teams that skip this ship agents that demo beautifully and then produce three different revenue numbers in production, which burns organizational trust that takes years to rebuild. Start smaller than a platform project: pick the twenty metrics that matter, define them once, make them machine-readable, and grow from there. That is also, not coincidentally, the on-ramp OSI is paving.

**Where do I follow all this without it becoming a job?** The specifications themselves are public, MCP's site, A2A at the Linux Foundation, the W3C explainers, OSI's repository and updates page, and reading a spec beats reading ten takes about it. For the weekly digest, this is exactly what my AI newsletter exists for, and the cross-project view, watching the agent standards and the data standards converge, is precisely the beat I cover across both newsletters.

## Closing Thoughts

The state of agentic AI standards in mid-2026 is a stack solidifying from the bottom up. The tool layer is won. The agent-to-agent layer just reached 1.0 under neutral governance with real production adoption. The web layer has its first browser preview and its social contract sketched. The semantic layer, the one that decides whether agents can be trusted with meaning, has a live specification and, tellingly, a home forming inside the open data catalog world. Above and around them, payments jostle toward consolidation, interfaces and identity mature unevenly, and security races to keep up, which is to say: it looks exactly like every previous protocol era looked at this stage, the web included.

The through-line of this whole series has been that open, neutral, layered standards are how infrastructure wins, told through Arrow and Parquet and Iceberg and Polaris. The agent world is now running that same movie at four times speed, and the ending is predictable in shape if not in names: the glue code dies, the layers stabilize, the value moves to what you build on top, and the organizations that prepared their foundations, data foundations most of all, compound fastest when it does.

If you want to build that foundation properly, from the open table formats through the catalogs and semantics that agents depend on, that is what my books are for. I co-authored Apache Iceberg: The Definitive Guide and Apache Polaris: The Definitive Guide for O'Reilly, and my other titles cover lakehouse architecture, data engineering, and the agentic analytics wave this article maps.

Browse the full collection of my books on data and AI at [books.alexmerced.com](https://books.alexmerced.com).
