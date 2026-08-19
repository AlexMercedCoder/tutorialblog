---
title: "Building Stateless AI Tool Gateways with FastMCP, the 2026 MCP Spec, and Kubernetes"
date: "2026-08-19"
description: "How to build stateless AI tool gateways with FastMCP, the 2026 MCP specification, and Kubernetes, and why statelessness finally makes MCP scale."
author: "Alex Merced"
category: "AI & Agents"
canonical: https://iceberglakehouse.com/posts/stateless-mcp-tool-gateways-fastmcp/
tags:
  - MCP
  - FastMCP
  - tool gateways
  - Kubernetes
  - AI agents
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/stateless-mcp-tool-gateways-fastmcp/).

The gap between an agent demo and an agent platform is an infrastructure gap, and it has a specific shape. The demo runs one MCP server on a laptop, one client connected, state held comfortably in process memory. The platform serves thousands of agents through load balancers into autoscaled pods, where in-process state is a bug, sessions are a scaling ceiling, and every assumption the demo made about who talks to whom breaks on the second replica. For two years, teams building serious Model Context Protocol deployments engineered around a protocol that assumed the demo's shape. As of the 2026-07-28 specification, they no longer have to: MCP's core went stateless, and tool gateways can finally be built like the web services they always needed to be.

This article is the builder's guide to that architecture: why agents need tool gateways at all, why state was the enemy of scale, exactly what the new specification changed, how to build a production server with FastMCP, where state legitimately lives when the protocol no longer holds it, how to deploy and scale on Kubernetes, how authorization works when the consumers are autonomous, and how the gateway connects to the governed data platform underneath, which is where my usual territory meets this one. A disclosure as always: I work at Dremio, whose platform exposes an MCP Server for agent access to the lakehouse, so tool gateways over data infrastructure are close to home. The article stays on the open protocol and open source tooling throughout.

## Why Agents Need a Tool Gateway

Start with the problem MCP exists to solve, because the gateway pattern follows from it directly.

Before the protocol, connecting AI applications to enterprise capabilities was an N-times-M integration problem: every agent framework built custom connectors to every system, each connector encoding its own auth, its own schemas, its own error handling, multiplied across the estate. MCP collapsed the multiplication the way protocols do: capabilities get exposed once as MCP servers, tools with typed schemas, resources, prompts, and every MCP-speaking client consumes them, whichever framework or vendor it came from. The protocol's adoption curve, its official SDKs now measure downloads in the hundreds of millions per month, settled the standardization question faster than anyone predicted.

The gateway is what the pattern becomes at enterprise scale: not fifty scattered MCP servers on developer machines, but a governed front door, a deployed tier where the organization's agent-facing capabilities live, with the properties any production front door needs. One place where authentication and authorization happen, so agent access is granted, scoped, and revoked like any principal's. One place where tool inventories are published and versioned, so what agents can do is an auditable catalog rather than a folklore of endpoints. One place where observability concentrates, every tool call logged with its principal, arguments, and outcome, which is the record that incident response and compliance both need. And one deployment surface with real operations: scaling, health, rollouts, the boring machinery that separates infrastructure from experiments.

One clarifying question keeps arriving in design reviews and deserves its answer here: if the gateway is just a web service tier, why not skip MCP and give agents the REST APIs the organization already has? Three properties answer it, and they are the protocol's actual value once the novelty wears off. Discovery is built in: an agent introspects the catalog and reads machine-consumable contracts, descriptions, and schemas, where REST estates scatter that across documentation portals the model never reliably sees. The interaction grammar is shared: tools, typed calls, structured results, elicitation, and background tasks work identically across every server, so agent frameworks implement the grammar once instead of per-API. And the ecosystem compounds: every MCP-speaking client, from the desktop assistants to the orchestration frameworks, consumes your gateway with zero integration work, which is the N-times-M collapse doing its job. The REST APIs do not disappear, and the gateway typically fronts them: MCP is the agent-facing contract layer over whatever the organization already runs, which is exactly what a gateway tier is for.

For data platforms specifically, the gateway is where the governed-access architecture I write about elsewhere gets its agent-facing terminus: the semantic layer's metrics and the catalog's tables reach agents through MCP tools, with the gateway enforcing who requests what. That connection returns later. First, the problem that made gateways hard to build well.

## The State Problem: When the Protocol Fought the Infrastructure

The original MCP design carried assumptions from its birthplace: a client launches a local server, they perform an initialization handshake, negotiate capabilities, and hold a session for the connection's life. For the laptop, this was correct and pleasant. For the platform, it embedded state in exactly the place fifteen years of cloud architecture had worked to remove it.

Walk the failure concretely, because every team that scaled MCP met it. A Kubernetes deployment runs three replicas of an MCP server behind a service. A client connects, the handshake lands on pod A, and pod A now holds the session: the negotiated capabilities, the session identifier, whatever per-session state accumulated. The client's next request round-robins to pod B, which has never heard of the session, and the request fails. The classic remedy, sticky sessions at the load balancer, fails here for a reason specific to this ecosystem: the major MCP clients implement HTTP through fetch-style internals that do not persist cookies, so cookie-based affinity has nothing to stick to, and the failure is in the clients, not in anything a load balancer configuration reaches.

Teams engineered around it in the ways teams do. Externalize session state to Redis, with middleware rehydrating context per request, which works and adds an infrastructure dependency plus a consistency surface to every deployment. Run stateless-mode flags that frameworks added ahead of the protocol, accepting the loss of session-dependent features. Pin clients to single replicas and cap scale. Or terminate sessions at a custom gateway tier that spoke stateful MCP outward and something saner inward. All four patterns shipped real systems, and all four were taxes paid to a protocol assumption, the kind of accumulated workaround pressure that, in healthy standards processes, becomes the next revision. In this one, it did.

The deeper cost of the session model deserves naming, because it shaped more than scaling. Sessions made requests unroutable and uncacheable by intermediaries: a proxy had no way to know what a request did without parsing JSON-RPC bodies, tool list responses tied to session negotiation resisted CDN caching, and the observability and governance tiers that enterprises wanted to build at the gateway had to reconstruct meaning from opaque streams. Statelessness was never just about replicas. It was about making agent traffic legible to the infrastructure of the web, which is the theme of everything the new specification did.

## The 2026-07-28 Specification: What Actually Changed

The protocol matured through dated revisions, the 2025-06-18 release hardening authorization and structured outputs, the 2025-11-25 release continuing the enterprise arc, and the 2026-07-28 revision is the structural one, the largest since launch, and its changes read as a coordinated answer to the state problem above.

The core went stateless. The initialization handshake is gone, the session identifier is gone, and every request now stands alone: a tool call carries what a server needs to serve it, with client information and protocol version traveling in the request's metadata rather than in a negotiated session. The pod-A-pod-B failure from the previous section stops existing, because there is nothing on pod A for pod B to lack. Round-robin balancing, autoscaling, serverless execution, and multi-region routing all become ordinary, which is to say they become possible without engineering around the protocol.

Routing moved into headers. Requests now carry their intent where infrastructure can see it: headers identify the method and the tool being called, and servers can opt individual tool parameters into headers as well, so a gateway routes, rate-limits, and authorizes on header inspection without parsing bodies. This is the change that makes the gateway tier first-class: the traffic management patterns the web runs on, path-based routing, per-endpoint policies, edge filtering, apply to tool calls the way they apply to REST endpoints. One design note carries forward from the transition period: clients on older revisions send no routing headers, so gateway logic should require headers when present and fall back to body inspection rather than dropping headerless requests, until the legacy tail retires.

Lists became cacheable. Tool, resource, and prompt listings, previously session-flavored, are now cacheable results, which means discovery traffic, the highest-volume, lowest-variance traffic a popular gateway serves, offloads to standard HTTP caching and CDNs. For platform teams, this quietly changes capacity math: the expensive path is tool execution, and discovery becomes nearly free.

Multi Round-Trip Requests replaced session-dependent interactivity. The interactive patterns that legitimately needed back-and-forth, a tool that must ask the user a clarifying question, an elicitation mid-call, get a stateless-compatible mechanism: the exchange completes over multiple round trips with the continuation context carried in the requests themselves, rather than in server memory. Related, the revision formalized background task patterns for long-running work, and deprecated the session-era primitives, including the old roots, sampling, and logging capabilities, whose jobs moved to better homes.

The multi-round-trip mechanics reward a moment of precision, because they answer the objection every stateless migration hears: what about the tool that genuinely needs a conversation? The pattern works like the web's own continuation idioms: the server's response indicates more input is needed and includes the continuation context, the client's follow-up carries that context back, and any replica completes the exchange, because the exchange's state travels in the exchange. Elicitation, confirmation of consequential actions, and progressive disclosure all express in this shape, and the design shift for tool authors is explicitness, the same theme as everywhere else in the stateless move: the interaction's state is a visible, structured payload rather than an ambient server memory, which also means it is loggable, resumable, and debuggable, three adjectives the session era never offered its interactive flows.

And authorization hardened again. A batch of authorization enhancement proposals landed together, continuing the arc from the 2025 revisions: clearer resource-server semantics, better token handling, and the enterprise patterns that let a gateway sit inside a real identity architecture. The authorization section below builds on this directly.

The last structural piece is a formal extensions framework, which is the standards process acknowledging its own velocity: capabilities can now evolve as named extensions with defined negotiation, so the ecosystem experiments without forking the core. For builders, the practical summary of the whole revision is one sentence: MCP servers are now web services, with the web's scaling, caching, routing, and security models applying natively, and everything below builds on that fact.

## Building the Server: FastMCP in Practice

FastMCP is the Python framework that made MCP server development pleasant, wrapping the protocol's machinery, transports, schemas, and content handling behind decorators, and its major versions track the protocol's arc: the 2.x and 3.x lines served the session era, with a stateless HTTP flag for horizontally scaled deployments ahead of the spec, and FastMCP 4 ships first-class support for the 2026-07-28 stateless protocol, background tasks, and the hardened auth. One naming caution before code: a separate TypeScript project shares the FastMCP name and tracks the spec on its own schedule, so verify which ecosystem a given document describes. This article's code is the Python framework.

A production-shaped gateway server, compressed to its skeleton:

```python
from fastmcp import FastMCP

mcp = FastMCP("lakehouse-gateway")

@mcp.tool
def query_metric(
    metric: str,
    dimensions: list[str],
    time_grain: str = "month",
    relative_range: str = "last_complete",
) -> dict:
    """Query a governed metric from the semantic layer.

    Use for business questions with defined metrics such as
    recognized_revenue or active_customers. Returns rows plus
    the metric's definition reference. Refuses metrics not in
    the caller's granted catalog.
    """
    principal = mcp.get_context().auth_principal
    request = build_metric_request(metric, dimensions,
                                   time_grain, relative_range)
    return semantic_layer.execute(request, principal=principal)

@mcp.tool
def list_table_health(namespace: str) -> dict:
    """Summarize Iceberg table health for a namespace.

    Returns per-table snapshot counts, small-file ratios, and
    last-maintenance timestamps from catalog metadata. Read-only.
    """
    principal = mcp.get_context().auth_principal
    return catalog_client.table_health(namespace, principal=principal)

app = mcp.http_app()
```

The skeleton's choices are the article's arguments in miniature. Each tool resolves the authenticated principal and passes it downward, so the data tier's governance, the semantic layer's compile-time policies, the catalog's grants, applies to agent traffic exactly as my companion articles describe for every other consumer: the gateway authenticates, the platform authorizes, and no tool embeds its own access logic. The docstrings are written for their real reader, the model selecting among tools, stating what each is for, what it returns, and what it refuses, the description-engineering discipline from the agent-surface playbook. And the module's last line hands an ASGI application to standard Python serving infrastructure, which is the deployment story: the server is an ordinary web app, run by ordinary web machinery.

Version notes for teams mid-transition: on the 2.x and 3.x lines, stateless deployment is the documented flag on the HTTP transport, suitable for scaling legacy-revision servers, and the upgrade to FastMCP 4 is the path to actual 2026-07-28 compliance rather than a substitute for it. The 3.x line's session-state machinery with pluggable storage backends remains relevant precisely for the state that outlives the protocol's statelessness, which is the next section's subject.

## Where State Actually Goes

Stateless protocol does not mean stateless system, and pretending otherwise is how teams rebuild the session problem in worse places. The discipline is the one cloud architecture settled long ago: the serving tier holds nothing, and state lives in stores built for it, chosen by the state's actual shape. Four shapes cover a tool gateway.

Conversation and working state, the agent's multi-turn context, belongs to the client and the agent framework, not the gateway, and the protocol's design pushes it there correctly: requests arrive self-contained, and whatever the agent needs to remember travels with the agent. Gateways that find themselves wanting to remember what an agent said last call are usually absorbing a responsibility the agent tier dropped, and the fix is upstream.

Cross-request application state, the shopping-cart shape, a workflow's accumulated selections, goes to an external store keyed by an application-level identifier the client supplies. The framework support exists for exactly this: pluggable key-value backends with virtual sessions keyed off client-provided identifiers, so any replica rehydrates the same state, which is the Redis pattern the workaround era proved, now as a supported feature rather than custom middleware. The design rule is explicitness: the identifier is an application concern in the request's arguments or metadata, visible and logged, never an ambient session resurrected by the transport.

Long-running work goes to a task queue, full stop. A tool that kicks off a table compaction, a large export, or a model evaluation returns a task handle immediately, the work runs on workers behind a queue, and completion surfaces through the background-task patterns the current spec formalized, polling or notification by the client's capability. The anti-pattern is the tool call that holds its request open for eleven minutes, which fights every timeout between the agent and the pod, and the queue pattern is also where retries, idempotency keys, and progress reporting live naturally.

And durable business state was never the gateway's: it lives where it always lived, in the lakehouse tables, the semantic layer, the systems of record the tools front. The gateway's statelessness is what makes this clean: every tool call is a governed, logged, self-contained operation against the platform, which is exactly the shape the audit and reliability stories want.

The summary discipline, worth putting in the design review template: for every piece of state a tool touches, name its shape, name its store, and confirm the pod holds it for no longer than one request. A gateway that passes that review scales by changing a replica count, which is the entire promise being collected.

## Deploying on Kubernetes

With state externalized and the protocol stateless, the Kubernetes story collapses into the standard one, and the collapse is the point: no operators, no session affinity annotations, no custom controllers, just a web deployment with the settings tuned for this traffic's shape.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lakehouse-mcp-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: lakehouse-mcp-gateway
  template:
    metadata:
      labels:
        app: lakehouse-mcp-gateway
    spec:
      containers:
        - name: gateway
          image: registry.internal/ai/lakehouse-mcp-gateway:4.1.2
          ports:
            - containerPort: 8080
          env:
            - name: SEMANTIC_LAYER_URI
              value: https://semantic.internal/api
            - name: STATE_BACKEND_URI
              valueFrom:
                secretKeyRef:
                  name: gateway-secrets
                  key: state-backend-uri
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8080
            periodSeconds: 15
          resources:
            requests:
              cpu: "500m"
              memory: 512Mi
            limits:
              memory: 1Gi
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: lakehouse-mcp-gateway
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: lakehouse-mcp-gateway
  minReplicas: 3
  maxReplicas: 30
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 65
```

The manifest is deliberately unremarkable, and three tunings deserve their reasoning. The readiness probe should verify downstream reachability, the semantic layer, the state backend, not just process liveness, because a pod that accepts tool calls it cannot serve converts an upstream blip into agent-visible errors, and stateless pods make aggressive readiness gating free. The autoscaling signal starts with CPU and matures toward request-based metrics, in-flight tool executions per pod, because tool workloads are bursty and I/O-bound in ways CPU lags: the platforms that instrument per-tool latency, as the observability section urges, feed the same metrics to the scaler. And rollouts are ordinary rolling updates with zero drama, which veterans of the session era should pause to enjoy: draining a pod no longer strands anyone's handshake, and a bad release rolls back as fast as the deployment controller moves.

The stateless spec's quiet gift arrives at the next scale tier: multi-region. Self-contained requests route to any region's deployment, so the gateway goes global with DNS-level load balancing and per-region replicas, no session replication, no affinity, with the one real constraint being data gravity underneath, tool calls executing near the semantic layer and catalog they front, which the platform's routing handles by tool rather than by session. Teams that suffered through globalizing sessionful services will recognize what is missing from that sentence, and its absence is the specification working.

Ingress carries one ecosystem-specific note: agent traffic is streaming-flavored HTTP, so the path through load balancers and meshes needs response streaming and sensible idle timeouts verified end to end, the same middlebox diligence any server-sent-events workload demands, tested through the real network path before the first production client arrives.

## Authorization for Autonomous Consumers

Tool gateways concentrate exactly the risk the text-to-SQL article dissects: capability plus autonomy plus language surfaces. The authorization architecture is where the risk is bounded, and the current spec's hardened model gives it real bones.

The shape that works: the gateway is an OAuth resource server, validating bearer tokens issued by the organization's identity provider, with every agent deployment holding its own principal, per-agent, per-context, never a shared service account, exactly the scoping discipline the agent-surface playbook prescribes. Tokens arrive per request, statelessly, which the protocol's design now matches: no session to authenticate once and ride, every call authenticated and authorized on its own, which is the property that makes the audit log complete and the revocation immediate.

Authorization then layers, and the layering is the architecture. The gateway enforces the coarse grain: which principals reach which tools, expressed in the same governance-as-code machinery as the rest of the estate, tool grants as reviewed files with the expiry and recertification mechanics that discipline provides. The platform beneath enforces the fine grain: the semantic layer's row and column policies, the catalog's table grants, applied to the principal the gateway forwarded, so a compromised or injected agent's ceiling remains what its principal was granted, at the data layer, structurally. The gateway adds the throttles that autonomy specifically needs: per-principal rate limits and concurrency caps, because a looping agent is a denial-of-service with good intentions, and budget-style quotas where tool calls carry real cost.

Two implementation notes complete the picture. Header-based routing makes per-tool authorization enforceable at the gateway edge, policies keyed on the tool-name header before a body is parsed, which is both cheaper and harder to confuse than body inspection. And the deprecation of the old session-negotiated capabilities simplifies the security review: what a principal can do is the intersection of its token's grants and the published tool catalog, two artifacts, both versioned, both auditable, with no negotiated third thing hiding in a handshake.

## Migrating an Existing Deployment

Estates that shipped on the session-era protocol face a transition, and the sequence that works keeps both revisions alive without letting the transition become permanent.

Inventory first, in both directions: which servers your organization runs, on which framework versions and protocol revisions, and which clients consume them, since the client side, the agent frameworks and desktop tools across the company, upgrades on its own schedule and defines how long compatibility must hold. The tool catalog from the platform tier is the server inventory's backbone, and gateway telemetry, once the protocol-version metadata is logged per request, measures the client mix continuously, which turns "when can we drop legacy" from a debate into a graph.

Servers upgrade next, and the upgrade is smaller than teams fear, precisely because the earlier sections' disciplines were already the right ones: a server whose state was properly externalized has no session logic to unwind, and the framework upgrade to the FastMCP 4 line carries the protocol change under stable decorator semantics for typical tool code. The servers that hurt are the ones that leaned on session state, and their pain is the refactor they owed anyway, moving that state to the stores the state-shapes section names, with the stateless flag on the legacy line as the interim step that proves the externalization before the protocol upgrade lands.

The gateway carries the bridge period: routing that uses headers when present and falls back to body inspection, both revisions served from the same tier, per-revision metrics separating the traffic. Set the retirement gate as a threshold, legacy share below a named percentage for a named period, with the stragglers contacted through the ownership metadata the catalog carries, and then actually retire the fallback, because the bridge's cost is real: dual-path routing is dual-path testing, and the header-only world is the one where the platform capabilities, edge authorization, per-tool caching policies, work everywhere. Teams running the transition report the whole arc as quarters, not years, with the client tail, not the servers, setting the pace.

## The Gateway Tier as a Platform

Above single servers sits the platform view: an organization runs many MCP servers, teams ship their own, and the gateway tier is where they compose into one governed surface. Three platform capabilities define the tier, all newly practical on the stateless spec.

Routing composes servers into a catalog. The gateway fronts many backend MCP servers, the data tools, the ticketing tools, the document tools, each team's server registered like a microservice, with the header-based routing directing calls by tool identity to the owning backend. Agents see one endpoint and one merged catalog, teams own their tools independently, and the composition is configuration, not code, which is the microservice gateway pattern arriving in the agent world with its lessons already learned: registration with ownership metadata, versioned tool contracts, and deprecation windows when tools change shape.

Caching absorbs discovery. With list results cacheable, the gateway serves tool catalogs from cache and edge, invalidating on registration changes, and the platform's capacity planning focuses where it belongs, on execution. The same machinery gives the platform its inventory for free: the cached catalog, diffed over time, is the changelog of what agents can do, which governance wants anyway.

And observability makes agent behavior legible. Every call carries its principal, tool, and headers past the gateway, so the tier emits the trace spine of the whole agent estate: per-tool latency and error rates, per-principal usage and cost, argument-level audit where policy requires it, wired into the standard tracing stack. This is the operational data that answers the questions that arrive within a month of launch, which tools do agents actually use, which fail, which principal is looping, and it is also the input the tool-design section turns into improvements. Platforms that skip gateway observability rediscover it as an incident requirement, at incident prices.

Cost accounting completes the platform tier, because agent traffic has a property human traffic never did: it scales with model behavior, not headcount, and a framework update that changes retry or planning behavior changes your load overnight. The gateway's per-principal telemetry is the metering point: tool calls, downstream compute triggered, and result bytes per principal, rolled into the budget-style quotas the authorization section names, reported to the teams that own each agent the way cloud costs are. The estates that skip this discover agent economics as a finance escalation, and the ones that build it get the healthy loop instead: expensive tools get optimized or fenced, wasteful agent behavior gets fixed at the framework, and capacity planning runs on measured cost per task, which is the number the whole agent program's business case eventually needs anyway.

## Designing the Tools Themselves

The infrastructure above serves whatever tools you publish, and tool design quality decides whether agents succeed with them. Five disciplines recur across gateways that work.

Make tools operations, not endpoints. A tool is a capability with a contract: one clear job, typed arguments with validation, structured results, and errors that say what to do next. The temptation is wrapping existing REST surfaces one-to-one, which produces tools shaped like your API's history rather than like agent tasks, and the better unit is the task: query_metric, not four entity endpoints the agent must choreograph.

Write descriptions as the interface they are. The model chooses tools by reading them, so descriptions state purpose, when to use and not use, result shape, and refusal behavior, engineered and tested with a selection suite the way the agent-surface playbook prescribes. Vague descriptions are selection bugs waiting for traffic.

Bound every output. Agents consume results into context windows, so tools paginate, summarize, and cap by design: a tool that can return forty megabytes will, into a consumer that can least use it. The bounded-result discipline also protects the platform, since result size is cost at every layer.

Make mutations idempotent and explicit. Tools that change things carry idempotency keys, since agents and the protocol's retry semantics will re-invoke, and they separate cleanly from read tools in naming and in authorization tiers, so the write surface is small, obvious, and separately granted. Confirmation patterns for consequential mutations now have proper stateless plumbing through multi-round-trip requests, and the design still starts with making the dangerous tools rare.

Tools are the workhorse primitive and not the only one, and the other two earn their sentence of placement. Resources publish readable context, documents, schemas, reference data, that clients pull into the model's context by URI, the right shape for the semantic catalog's descriptions or a dataset's documentation, cacheable under the new spec like the lists they travel with. Prompts publish reusable interaction templates, the blessed way to ask for a quarterly business review or an incident summary, which is where the platform team encodes interaction quality once instead of correcting it per agent. A gateway that publishes all three, tools for capability, resources for context, prompts for practice, is publishing the full grammar, and the estates that use resources well report a specific benefit: context that used to be stuffed into every tool description moves to fetch-on-demand resources, which shrinks the catalog agents must reason over, which improves the selection quality everything else depends on.

And version tool contracts like the APIs they are. Agents build implicit dependence on argument shapes and result fields, so changes ship as new versions with deprecation windows, announced through the catalog, with the gateway's usage telemetry showing when the old version's traffic actually dies. The stateless catalog machinery makes this cheap to operate, and the discipline is what keeps a growing tool estate from becoming a breaking-change generator.

## Testing a Stateless Gateway

Statelessness pays a dividend in testability that teams should collect deliberately, because the gateway's test pyramid is the argument for the architecture in miniature.

Unit tests exercise tool functions as plain functions: arguments in, structured results out, with the downstream clients stubbed, no protocol machinery involved, because the decorator model keeps business logic separable. Contract tests exercise the protocol surface: requests in the wire shape, including the header routing and the metadata that replaced the handshake, asserted against schemas, which catches the drift between what a tool's signature promises and what its published contract says, the bug class that breaks agents silently. And because requests are self-contained, every test is a complete artifact: a failing production call, captured from the gateway's logs with its headers and body, replays as a test case verbatim, which is the debugging loop the session era never offered, where reproducing a failure meant reconstructing a session's history.

Integration tests run the deployed shape, and the two-replica rule from the failure modes applies here hardest: CI runs the gateway at two replicas behind a balancer, with the test suite spraying requests across both, because a state leak that a single-replica test can never catch fails this configuration in seconds. Load testing gets the same treatment as any web service, with the tool mix modeled from production telemetry once it exists, and one gateway-specific scenario added: the looping agent, a client re-invoking at machine speed, verifying that the per-principal throttles and the queue-backed long tasks degrade the way the design claims. The selection suite from the tool-design section rounds out the pyramid at the semantic level, and the whole stack runs on every merge, because a gateway whose tests mirror production's shape is a gateway whose incidents are mostly regressions caught in CI, which is the boring outcome the architecture keeps promising.

## A Worked Example: The Lakehouse Gateway

The composite, in the pattern of this series, with no invented benchmark numbers: how the pieces assemble into the deployment my data-platform articles keep pointing toward.

The organization has the governed stack these articles build: Iceberg tables under a REST catalog, a semantic layer with compiled policies, governance as code around both. The agent initiative needs the last mile, and the platform team builds it as one gateway service in a quarter. The tool catalog launches deliberately small: the metric query tool and semantic search over the catalog's descriptions for the analytics agents, the table-health and lineage tools for the platform's own operations copilot, and one carefully-fenced mutation, a tool that files, not executes, maintenance requests, writing to the queue the human-owned maintenance service reads. Every tool resolves its principal and delegates authorization downward, and the write tool sits in its own grant tier with two principals in it.

The deployment is the manifest from earlier, three replicas scaling to a few dozen, behind the organization's standard ingress, tokens from the standard identity provider, tool grants in the governance repository with expiries on the pilot principals. The FastMCP 4 upgrade lands mid-build, and the team's transition note is anticlimactic in the way good platform news is: the stateless protocol removed their planned session-affinity workaround from the backlog, and the legacy-revision fallback path in the gateway's routing carries the one older client until its framework updates.

The month-two telemetry reshapes the roadmap, which is the pattern to expect: the metric tool dominates traffic and its latency tracks the semantic layer's compile cache, so acceleration work moves there. Semantic search selection quality drives a description-editing sprint, measured by the selection suite. One agent principal's looping retry, caught by the per-principal rate limit, becomes the case study that sells the throttle tier to the skeptics. And the maintenance-request tool's audit trail, every agent-filed request with its principal and reasoning attached, becomes, unexpectedly, the operations team's favorite feature, because requests now arrive structured instead of as Slack messages. The gateway's success metric at quarter's end is the one this article has been arguing for throughout: the agent estate's entire data access is enumerable, governed, observable, and scalable by replica count, which is what infrastructure means.

The quarter's last commit is the one that makes the pattern durable: the gateway's own configuration, tool grants, routing table, throttle tiers, moves into the governance repository beside the catalog policies it composes with, so the agent estate's entire access story changes by pull request, end to end, from the identity provider's group through the gateway's grant through the semantic layer's row policy. One diff, one review, one revert path, which is the sentence the security team quotes in the approval.

## Failure Modes

**State smuggled back in.** A tool caches something in a module global, works on one replica, and produces the maddening intermittent failures statelessness was supposed to end. The defense is the state review from the design template, plus running a minimum of two replicas in every environment including development, so state leaks fail fast and loudly instead of in production.

**The mega-tool.** One tool grows optional arguments until it is an API in a trench coat, and selection quality collapses because its description promises everything. The defense is the one-job rule enforced at review, with the selection suite as the regression gate: when a tool's description needs the word "also," it is two tools.

**Timeout roulette.** Long-running work runs inline because the queue felt like overkill, and the calls die differently at each layer's timeout, agent, ingress, pod, with retries multiplying the work. The defense is the bright line from the state section: anything beyond interactive latency returns a task handle, no exceptions, and the background-task patterns are plumbing you build once.

**Catalog sprawl.** Every team publishes every tool, agents face two hundred options, and selection quality degrades with the catalog's size. The defense is the same scoping discipline as the semantic layer's: principals see published, scoped views of the catalog, narrow by default, and the platform reviews the global catalog for overlap the way it reviews any shared namespace.

**Legacy-revision limbo.** The estate half-upgrades, headerless legacy clients meet header-required routing, and requests vanish into default backends. The defense is the transition posture stated earlier, require headers when present, fall back gracefully, monitor the legacy share, and a dated plan for retiring the fallback, because permanent compatibility shims are permanent complexity.

**The ungoverned side door.** A team ships its own internet-facing MCP server outside the gateway because the paved road had a queue, and the estate's agent access story develops an asterisk. The defense is organizational and familiar from every gateway era: make the paved road genuinely fast to onboard, and make the network policy match the architecture, egress and ingress rules that route agent traffic through the tier that logs it.

## Conclusion

The 2026-07-28 specification finished MCP's migration from a clever local protocol to web infrastructure: stateless requests, header-visible routing, cacheable discovery, hardened authorization, and interactivity patterns that survive load balancers. FastMCP turns the spec into a few decorators and an ASGI app, Kubernetes turns the app into a scalable service with no special accommodations, and the remaining engineering is the kind platforms know how to do: externalize state by shape, authorize per principal per request, observe everything at the tier where traffic converges, and design tools as versioned, bounded, well-described contracts.

For data platforms, the gateway is the last mile of the governed-agent architecture this series builds: the semantic layer defines what agents can mean, the catalog defines what they can touch, governance as code defines how any of it changes, and the stateless gateway is where it all faces the agents, at whatever scale they arrive. Build it as a web service, because it finally is one.

## Keep Going

If this piece was useful, the surrounding architecture connects through my other writing on semantic layers, agent governance, and the lakehouse platform underneath. *Architecting an Apache Iceberg Lakehouse* from Manning covers the data foundation, and my recent AI and agentic analytics titles build the layer this gateway serves. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
