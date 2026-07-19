---
title: "MCP Stateless Gateways for Data Agents"
date: "2026-07-13"
description: "An in-depth exploration of mcp stateless gateways for data agents"
author: "Alex Merced"
category: "MCP"
tags:
  - MCP
  - Data Gateways
  - AI Agents
  - Specifications
canonical: "https://iceberglakehouse.com/posts/mcp-stateless-specifications-scalable-data-gateways-ai-agents/"
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/mcp-stateless-specifications-scalable-data-gateways-ai-agents/).

A Model Context Protocol server that holds session state in memory is a server you cannot scale by adding replicas. The moment one process remembers which user is on which connection, which query results are cached for whom, and where a multi-step tool interaction left off, you have coupled correctness to a specific instance. Kill that instance and the state is gone. Add another instance and requests routed to it know nothing. This is the core operational problem with stateful gateways, and it is why the direction of travel for enterprise MCP deployments is toward stateless designs.

This post explains why MCP gateways become a bottleneck under agent load, compares stateful and stateless designs honestly, and covers what a stateless data gateway actually requires: credential delegation, per-request context isolation, sane Kubernetes deployment, and guardrails on the database tools it exposes. A note on the spec itself: the [Model Context Protocol](https://modelcontextprotocol.io/) continues to evolve, and where this post describes stateless behavior as a specification feature, treat it as a design direction and proposal that you should verify against the current spec and the [MCP GitHub organization](https://github.com/modelcontextprotocol) before you build to it. The architectural principles hold regardless of exact spec wording.

## Why MCP Gateways Become a Bottleneck

An MCP server sits between AI clients and the tools those clients call. For data agents, the most valuable tools are the ones that reach a database or query engine: list tables, describe a schema, run a query, fetch results. This is exactly the surface that turns into a bottleneck as agent usage grows.

Agents are concurrent by nature. A single agent reasoning through a task may issue several tool calls in sequence, and a fleet of agents issues many such sequences at once. Each tool call is a request the gateway must authenticate, authorize, execute against the backend, and return. Unlike a human user who thinks between clicks, an agent fires the next call as soon as the previous one returns. The gateway sees sustained, bursty, parallel load.

The trouble starts when the gateway tries to remember things across those calls. If the server holds a session, then every request from a given agent must return to the same process that holds that session. That is sticky routing, and sticky routing fights horizontal scaling. You cannot freely balance load across replicas because requests are pinned. A hot agent overloads its assigned instance while other instances sit idle. When an instance dies, every session it held dies with it, and the agents mid-task fail rather than transparently retrying against another replica.

Session state also creates a memory footprint that grows with the number of active agents rather than the request rate, which makes capacity planning harder and makes the gateway a target for resource exhaustion. And it creates a security question that is easy to get wrong: if two agent sessions share a process, what stops one session's context, credentials, or cached results from leaking into another's? The safe answer is to not hold that state in the process at all.

There is a subtler cost to sticky sessions that shows up during deployment rather than steady-state operation. Rolling out a new version of a stateful gateway means draining sessions from the old instances before you can retire them, because killing an instance mid-session breaks whatever agents were pinned to it. That draining can take a long time when agents hold long-running sessions, which slows deploys and makes rollbacks risky. A stateless gateway has none of this friction. You can replace instances whenever you like, because no instance holds anything worth draining, and an agent whose request lands on a retiring pod simply retries against a fresh one. For teams that deploy frequently, this difference alone is a strong argument for stateless design, independent of the scaling and failure arguments.

## Stateful vs. Stateless MCP Designs

The distinction is about where state lives, not whether state exists. Every useful system has state. The question is whether the gateway process owns it.

A **stateful** gateway keeps session context, connection state, and user-specific data inside the server process. Convenience is the appeal: the server can remember an authenticated identity, keep a warm database connection tied to a session, and cache intermediate results in local memory. For a single-instance deployment serving a few users this feels simple.

A **stateless** gateway externalizes all of that. Identity travels with each request, usually as a token the gateway validates rather than a session it remembers. Context needed to serve a request either arrives in the request or is fetched from a backing service. Any caching lives in a shared store, not process memory. Each request carries enough information to be handled by any replica, so the process itself holds nothing that would be lost if it restarted.

The tradeoffs line up like this.

| Dimension | Stateful gateway | Stateless gateway |
| --- | --- | --- |
| Horizontal scaling | Limited by sticky routing | Add replicas freely behind a load balancer |
| Failure recovery | Session lost when instance dies | Requests reroute to any healthy replica |
| Load balancing | Pinned to session-holding instance | Any instance can serve any request |
| Memory footprint | Grows with active sessions | Grows with in-flight requests only |
| Session isolation | Risk of cross-session leakage in-process | Isolation enforced per request |
| Operational complexity | Simpler at tiny scale | Requires token infra and external state stores |
| Per-request overhead | Lower, reuses session context | Higher, validates and hydrates each request |

Stateless is not free. You take on the cost of validating identity on every request and hydrating whatever context that request needs, which is more per-call work than reusing a warm session. You need external infrastructure: an identity provider, a secret store, and possibly a shared cache. For a proof of concept with three users, a stateful server is genuinely simpler, and pretending otherwise is dishonest. The stateless design earns its keep at enterprise scale, where the ability to add replicas, survive instance failures, and balance load without pinning is worth far more than the per-request overhead.

It is also worth being honest that "stateless" is a property of the gateway, not the system. The state still exists; you have moved it. Identity validation now depends on an identity provider that must be available and fast, because every request consults it. Shared caching now depends on an external cache that becomes its own scaling and consistency concern. Backing services that were implicit in a stateful process become explicit dependencies you operate. The stateless design does not eliminate complexity so much as relocate it into infrastructure that is designed to be shared, replicated, and operated independently, which is generally a better place for it than inside a gateway process. But if your identity provider or shared cache is a single fragile instance, you have simply moved the bottleneck rather than removing it. Stateless gateways are worth it when the backing services they depend on are themselves built to scale.

One more practical point: warm connection pooling is a case where teams sometimes reintroduce state and undo the benefits. A gateway that keeps a pool of warm database connections is holding state, and if that pool is tied to session identity you are back to sticky routing. The stateless-friendly approach is a per-replica connection pool to the backend that is not tied to any particular caller, combined with delegated identity carried in each request. The pool is a local performance optimization that any replica can maintain independently, and it does not pin callers because the identity travels with the request rather than with the connection.

## Credential Delegation and Context Isolation

The hardest part of a data gateway is not scaling. It is doing the right thing with identity. A gateway that runs every agent's queries under one shared service account has thrown away the ability to enforce per-user policy, and it has created a single credential whose compromise exposes everything the gateway can reach. This is the pattern to avoid.

The correct model is delegation. The user or agent authenticates to the gateway with their own identity. The gateway does not store a shared database key and use it for everyone. Instead it exchanges or delegates the caller's identity so that the query runs against the backend as that caller, subject to that caller's permissions. Token exchange flows exist precisely for this: the gateway takes the caller's token, obtains a scoped downstream token that represents the same principal to the query engine, and uses it for that one request. When the request ends, the delegated credential is done.

This delegated identity is what makes downstream policy meaningful. If the query engine enforces row-level security and column masking based on identity, then delegation ensures those rules apply to the actual user behind the agent, not to a generic service account that sees everything. Governance lives in the engine, and delegation is the wire that connects a specific agent request to a specific governed identity.

Context isolation is the companion requirement. In a stateless design, each request carries its own identity and its own context, and the gateway must never let one request's data bleed into another's. No shared mutable buffers keyed only by convenience. No cache that returns one user's results to another because the cache key ignored identity. Any caching must include the caller's identity in the key so results are scoped to the principal that produced them. Parallel query execution should not require sticky routing precisely because each request is self-contained: two requests from two agents can run on two replicas with no shared in-process state to isolate.

Get this wrong and you have built a fast, scalable data leak. Get it right and horizontal scaling and per-user governance reinforce each other, because a request that carries its own identity can be served by any replica while still being governed exactly as that identity.

The delegation model also clarifies who is responsible for what. The gateway is responsible for authenticating the caller and obtaining a downstream credential that faithfully represents them. It is not responsible for deciding what data that credential may see, because that decision belongs to the query engine and its governance rules. This separation is healthy. A gateway that tries to make authorization decisions duplicates logic that lives more correctly in the data platform, and duplicated authorization logic drifts out of sync and becomes a source of bugs and gaps. Keep the gateway thin on policy and let it do one identity job well: prove who is calling and pass that identity down intact. The place this gets tested is agent-on-behalf-of-user flows, where an agent acts for a human. The gateway must carry both identities so the engine can enforce policy for the human while audit can attribute the action to the agent. Losing either identity in the exchange breaks governance or breaks accountability, so the token exchange has to preserve both.

## Deploying MCP Servers on Kubernetes

A stateless gateway is a natural fit for a container platform, because the whole point of stateless is that any replica can serve any request. The deployment shape follows directly.

Run the gateway as a set of replicas behind a load balancer. Because no replica holds session state, the load balancer can use plain round-robin or least-connections routing without sticky sessions. Scale the replica count against request load, and let a horizontal autoscaler add or remove pods as traffic changes. The [Kubernetes documentation](https://kubernetes.io/docs/) covers the primitives involved: Deployments for the replica set, Services for load balancing, and probes for health.

Pull secrets from an external secret store rather than baking them into images or config. Identity provider credentials, signing keys, and any backend connection settings should be mounted or fetched at runtime, so rotating a secret does not require rebuilding the gateway. Point the gateway at an external identity provider for token validation and at your observability stack for logs, metrics, and traces.

Set resource limits and timeouts. Each pod should have CPU and memory limits so one overloaded replica cannot starve its neighbors, and every request should have a timeout so a slow backend query does not tie up a worker indefinitely. Add rate limits so a runaway agent cannot saturate the gateway. Use readiness probes so a pod only receives traffic once it can reach its dependencies, and liveness probes so a wedged pod gets restarted.

The following is a conceptual sketch of the deployment, not production YAML. Exact fields, API versions, and syntax should be verified against current Kubernetes and MCP server documentation.

```
# Conceptual only - verify against current docs
Deployment: mcp-data-gateway
  replicas: N                # scaled by load, no sticky sessions
  container:
    image: <mcp-gateway-image>
    resources:
      limits: { cpu, memory }
    env / secrets from: external secret store
    readinessProbe: can reach IdP + query engine
    livenessProbe: process healthy
Service: load-balances across replicas (no session affinity)
HorizontalPodAutoscaler: target CPU / request rate
```

The stateless property is what makes this simple. A new pod needs no warm-up of session state to be useful. A dying pod takes no session down with it. The autoscaler can add and remove capacity without coordinating handoffs. This is the operational payoff for the per-request overhead you accepted earlier.

The readiness probe deserves a moment of attention because it is where the stateless model interacts with the gateway's dependencies. A stateless gateway is only useful if it can reach the things it depends on: the identity provider it validates tokens against and the query engine it forwards requests to. A readiness probe that checks those dependencies means the load balancer only sends traffic to a pod that can actually serve it, so a pod that starts before its dependencies are reachable holds off traffic until it is genuinely ready. This avoids a class of failures where new pods accept requests and immediately fail them because a dependency was not yet available. Pair that with sensible startup ordering and the autoscaler behaves well even during dependency hiccups: unready pods simply do not receive traffic, and healthy pods absorb the load until the rest recover.

## Guardrails for Database Tools

Scaling and identity get the gateway to production. Guardrails keep it from becoming a liability. A data gateway exposes tools that can read, and sometimes write, real data, and the tools are being driven by non-deterministic agents. The design of those tools is a security decision.

**Validate tool parameters.** Every tool the gateway exposes has a defined input shape, and the gateway should reject inputs that do not conform before anything reaches the backend. This is basic, and it is the first line against malformed or malicious calls.

**Enforce row and column policy at the query engine, not the gateway.** The gateway should not try to reimplement data governance. It should delegate identity downstream and let the query engine apply row-level security and column masking for that identity. Governance belongs in the engine that owns the data, because that is the one place it can be enforced consistently no matter how the query arrived.

**Prefer semantic tools over broad raw SQL for low-trust clients.** A tool that accepts arbitrary SQL from any agent is a large attack surface. It invites expensive scans, cross-domain joins the agent should not perform, and injection-style abuse. For low-trust or fully autonomous clients, narrower tools that expose specific governed queries or a curated semantic layer are far safer than a general "run this SQL" tool. Raw SQL tools have their place for trusted internal use, but they are the wrong default for an open agent-facing gateway.

**Set query limits.** Bound the rows returned, the bytes scanned, and the execution time per call. These limits protect the backend from a single agent tool call that would otherwise scan a fortune's worth of data, and they cap the damage from a reasoning loop gone wrong.

**Log everything.** Every tool call should produce an audit record: the user identity, the agent identity, the tool invoked, the parameters, the SQL that was generated, and metadata about the result such as row count and bytes scanned. Log accepted and denied calls alike. This is what makes the gateway auditable after the fact and what lets you detect an agent behaving badly before it becomes an incident.

**Rate-limit per identity, not just globally.** A global rate limit protects the backend from total overload, but it does not stop one runaway agent from consuming the whole budget and starving every other caller. Per-identity limits, keyed on the agent and the user it acts for, contain a single misbehaving agent without penalizing the rest. Since the gateway already carries identity on every request for delegation, it has exactly what it needs to enforce these limits, which is a nice reinforcement of the stateless identity-per-request model.

There is an honest limitation to acknowledge across all of these guardrails: they raise the cost and lower the ceiling of misuse, but they cannot make an agent-facing data tool risk-free. An agent with legitimate access to a semantic tool can still ask questions it should not, within the bounds of what that tool allows. Guardrails bound the damage and make it observable. They do not substitute for choosing carefully which tools an agent gets and which data those tools can reach. The narrower and more purpose-built the tool surface, the smaller the space of misuse, which is why semantic tools over a governed layer beat a general SQL tool for autonomous clients even after every other guardrail is in place.

## Why Governed Lakehouse Access Matters

A stateless MCP gateway scales like infrastructure. On its own, that is only half of what an enterprise needs. The other half is that everything the gateway exposes must be governed by a data platform that enforces policy, understands the data, and queries it efficiently. A perfectly scalable gateway in front of an ungoverned data store is just an efficient way to reach ungoverned data.

Dremio's open-source [MCP server](https://docs.dremio.com/current/developer/mcp-server/) is a useful reference for what governed agent-facing access looks like, because it fronts a data platform built for and managed by AI agents rather than an unguarded database. The gateway is only as safe as what sits behind it, and behind Dremio's MCP server is a governed lakehouse on open standards.

Three properties of that backend matter for the gateway story. First, a semantic layer: views, wikis, labels, and AI-oriented metadata give agents curated, meaningful entities to query instead of raw tables, which is exactly the narrow, safer tool surface that low-trust clients should get. Second, fine-grained access control: row-level security and column masking through UDFs mean the delegated identity flowing through the gateway is governed at the engine, so per-user policy actually applies to the agent's request. Third, a federated query engine on open formats like Apache Iceberg and Apache Arrow, which lets agents query data in place across sources without copies, so the gateway can answer broad questions without becoming a data-movement bottleneck. Because it is built on open standards including Apache Polaris for the catalog, there is no lock-in on the data itself.

The combination is the point. Stateless design gives you a gateway you can scale by adding replicas and recover by rerouting requests. Credential delegation and context isolation keep each request governed as its true identity. Kubernetes gives you the operational shape. And a governed lakehouse behind the gateway makes the whole thing safe to point autonomous agents at, because policy is enforced where the data lives.

If you are building agent access to enterprise data, design the gateway to be stateless, delegate identity on every request, and put a governed query engine behind it. To see a governed, open lakehouse with a native MCP server that agents can query safely, [get started with Dremio](https://www.dremio.com/get-started).
