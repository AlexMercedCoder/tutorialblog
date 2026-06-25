---
title: "Unity AI Gateway vs Apache Polaris Control Planes"
date: "2026-06-22"
description: "The right comparison is not vendor scoreboard. It is closed AI governance gateway versus open catalog control plane."
author: "Alex Merced"
category: "Lakehouse"
tags:
  - governance control plane
  - Apache Polaris
  - AI gateway
---


The right comparison is not vendor scoreboard. It is closed AI governance gateway versus open catalog control plane. For enterprise architects choosing governance patterns, the useful question is what changes in production and what simply sounds current.

![governance control plane comparison architecture map](/images/2026/week22-june-2026/unity-ai-gateway-vs-apache-polaris-governance-control-plane-diagram-1.png)

## Two Products Can Both Claim Governance While Controlling Very Different Parts of the Analytical Path

Two products can both claim governance while controlling very different parts of the analytical path.

This is where lakehouse design is changing. The platform is no longer only serving dashboards. It is serving automated workflows that need context and limits. That matters because when architects conflate gateway governance with catalog governance, they end up with either incomplete coverage (the AI layer is governed but the data layer is not) or redundant controls (the same policy enforced in two places with no clear owner).

The contracts that already mattered now matter more. Governance responsibilities must be separated: which layer owns identity mapping, which layer owns table access, which layer owns tool-level policy, and which layer owns the audit trail.

## What the Documentation Supports

The strongest public sources for this topic are [Apache Polaris documentation](https://polaris.apache.org/), the [Apache Iceberg REST catalog specification](https://iceberg.apache.org/rest-catalog-spec/), and the [AgentTrust paper](https://arxiv.org/abs/2606.08539). I use those to ground the architecture and avoid treating every June 2026 announcement as a shipped production capability.

The evidence supports a few grounded points:

- Gateway governance and catalog governance solve related but different problems.
- Apache Polaris is centered on open catalog control for Iceberg tables.
- AI gateways need tool-level policy, while catalogs need table-level identity, metadata, and access control.

That is enough to write a useful technical article. It is not enough to make sweeping claims. I separate released behavior, design direction, and market language because readers can work with careful distinctions. They cannot operate slogans.

## The Architecture Pattern

A gateway usually sits close to the AI interaction. It can manage prompts, tools, model access, and policy around what agents are allowed to ask or call. A catalog control plane sits closer to data identity and table metadata. It decides how engines find tables, what credentials or signed operations are allowed, and how access maps to storage. Confusing those layers leads to overbroad claims.

For this architecture, the five layers worth keeping distinct are storage, catalog, execution, semantics, and agent interface. Storage holds durable files and snapshots. The catalog resolves identity and access. The execution layer plans and runs work. The semantic layer gives business meaning. The agent interface controls which questions and actions are allowed.

The point is not to collapse those layers into one box. The point is to make the handoffs clear. If a user or agent asks for an answer, the platform should be able to explain which table, which snapshot, which definition, which identity, and which policy shaped the result.

![Operating workflow for governance control plane comparison](/images/2026/week22-june-2026/unity-ai-gateway-vs-apache-polaris-governance-control-plane-diagram-2.png)

## A Production-Shaped Example

Evaluate both patterns with one agent request that asks for a sensitive metric. The gateway should constrain the tool and model behavior. The catalog should enforce table access and data policy. The semantic layer should define the metric. If all three responsibilities are mixed together, the architecture will be hard to audit.

The test should include a happy path and at least three failure paths. One failure should involve a gateway denial: the agent requests a tool that the gateway does not allow for this persona. One should involve a catalog denial: the engine resolves the table but the identity does not have access. One should involve a semantic boundary: the agent asks a question that would require joining a metric definition across a policy boundary. Those failures are where the governance architecture either earns trust or reveals gaps.

The test should also produce evidence. Save gateway logs, catalog access logs, and semantic query logs separately. If the audit trail mixes gateway policy decisions with catalog access decisions, the governance layers are not cleanly separated.

## What To Measure

Start with four specific measurements:

- **Gateway policy and catalog policy enforced independently and audited separately:** Confirm that when an access is denied, the audit trail correctly identifies which layer denied it and why. A denial from the AI gateway (the tool is not allowed) should be distinguishable from a denial from the catalog (the identity lacks table access) and from a semantic denial (the metric is not certified for this use case). Mixed audit trails make compliance review unreliable.
- **Identity propagation from gateway to catalog to data layer:** Track whether the identity established at the gateway is correctly propagated through the query execution layer to the catalog and ultimately to the storage access decision. An identity that is correct at the gateway but gets broadened or replaced at the execution layer is a governance gap.
- **Denied access tested at each governance layer independently:** Verify that each governance layer enforces its own policy independently. A gateway that blocks a tool should block it even if the catalog and storage would have allowed the operation. A catalog that denies table access should deny it even if the gateway would have allowed the tool call. Cross-layer independence is the correctness test for layered governance.
- **Audit trail completeness across gateway, catalog, and execution:** Confirm that for every agent interaction, the audit trail covers the gateway policy decision, the catalog access decision, the execution plan, and the query result. Incomplete audit trails that cover only the gateway layer are compliance theater for regulated enterprises.

Measurements should connect to decisions. A metric that nobody uses is telemetry decoration.

## Common Failure Modes

The first mistake is treating governance as a single control plane. Both Unity AI Gateway and Apache Polaris do real work, but at different points in the analytical path. An enterprise that uses only the gateway for governance has no catalog-level policy. An enterprise that uses only a catalog-level governance system has no tool-level or model-level policy for AI agents. Both gaps are real production risks.

The second mistake is ignoring boundaries. Most governance incidents in agentic systems appear at the boundary between layers: the gateway allowed the tool call, the catalog allowed the table access, but the semantic layer did not restrict the column, and the agent returned a sensitive field it should not have seen. Boundary testing means verifying the complete path from tool call to query result.

The third mistake is hiding tradeoffs behind the governance label. Saying "governed AI access" is not a mechanic. The useful claim is: this gateway enforces these tool policies, this catalog enforces these table access rules, and this semantic layer enforces these metric definitions, and each layer has an independent audit trail. If any of those three claims is vague, the governance story is incomplete.

The most expensive governance failures are usually quiet. The gateway log shows a successful tool call. The catalog log shows authorized table access. But the semantic layer was not enforcing column restrictions, and the agent returned a field that a human in the same role would have known to exclude. That failure does not show up as an alert. It shows up as a compliance finding.

## Guardrails for Agentic Use

Agents should be governed at every layer: the tool level (gateway), the table level (catalog), the column level (semantic layer), and the output level (semantic contract). Governing only at the gateway is not sufficient for regulated data environments.

I would also require a complete audit trail that covers all four layers. An audit trail that only records gateway decisions is not a governance audit trail. It is a gateway access log. For regulated industries, the audit must cover the data-level access decision, not only the tool-level decision.

## Operational Checklist

| Area | Question to answer | Why it matters |
|---|---|---|
| Ownership | Who owns the gateway policy, the catalog policy, and the semantic definitions? | Each governance layer needs a named owner. |
| Scope | Which tools, tables, and metrics are in scope for each governance layer? | A narrow scope is easier to test and audit. |
| Identity | Is the identity established at the gateway correctly propagated to the catalog? | Identity gaps between layers are governance gaps. |
| Evidence | Are gateway logs, catalog logs, and semantic query logs separate and complete? | Compliance audits need layer-specific audit trails. |
| Rollback | What happens when a governance layer fails to enforce its policy? | Recovery from governance failures needs a defined path. |

This checklist is intentionally plain. The hard part is not choosing between two products. The hard part is defining which governance responsibilities belong to each layer before a compliance review reveals the gaps.

![Open lakehouse operating model for governance control plane comparison](/images/2026/week22-june-2026/unity-ai-gateway-vs-apache-polaris-governance-control-plane-diagram-3.png)

## What Engineers Should Verify

Engineers should verify that each governance layer enforces its own policy independently, that identity is correctly propagated across layers, and that the audit trail covers every layer separately. Claiming "governed AI access" is not enough. The team needs to know which layer enforces which policy, which audit record covers which decision, and which scenarios are out of scope for each layer.

The practical test is simple: can another engineer produce an end-to-end audit trail for a specific agent interaction that covers the gateway decision, the catalog decision, the execution plan, and the query result, all from existing logs? If not, the governance audit trail is not complete.

The setup should also be tested under concurrent agent sessions. Many governance architectures behave correctly under a single agent session. They reveal identity propagation and audit gaps under concurrent load.

## What Data Owners Should Verify

Data owners should verify that their tables are governed at the catalog level, not only at the AI gateway level. A data owner who relies on the gateway to block agent access to a sensitive table is not applying catalog-level governance. The gateway policy and the catalog policy should be redundant by design. If the gateway is bypassed, the catalog should still enforce access control.

This review should happen before agent tools are exposed to sensitive tables. Data owners should confirm that catalog-level access policy exists for every table that is in the agent's tool scope.

## What Executives Should Hear

The summary should be plain: Unity AI Gateway and Apache Polaris govern different parts of the analytical path. A mature enterprise AI governance architecture uses both: a gateway for tool and model policy, and a catalog control plane for table identity and access. Using only one creates governance gaps.

The value of using both is defense in depth: governance that applies at the tool level, the table level, and the data level. The limit is that defense in depth requires clear ownership of each layer. If nobody owns the catalog-level policy, the gateway layer is the only control, and bypassing the gateway means bypassing all governance.

Executives should hear a direct challenge: does your AI governance architecture apply at the data level, or only at the AI interface level? If the answer is only the AI interface, the data layer is ungoverned for direct access paths.

## A Good First Rollout

Start with one sensitive metric, one agent tool, one catalog table, and one identity. Test the governance path at each layer: gateway denial, catalog denial, semantic denial. Verify that each denial produces an independent audit record.

Define success with three outcomes. The first is independence: each governance layer enforces its own policy regardless of the other layers. The second is audit completeness: every access decision has a logged record in the appropriate layer's audit trail. The third is identity propagation: the identity established at the gateway matches the identity that the catalog uses for table access.

After that, expand to more tools, more tables, or more agent identities. Expanding one dimension at a time is slower, but it creates a governance coverage map that can be audited.

## Deeper Design Notes

The design work should begin with the governance responsibilities at each layer. Name the gateway policies (which tools, which models, which personas), the catalog policies (which tables, which identities, which operations), and the semantic policies (which metrics, which exclusions, which certifications). When those are vague, the governance architecture is describing aspiration, not enforcement.

The next step is to define the dimensions that actually change behavior: AI gateway tool policy, catalog identity mapping, table authorization, semantic metric certification, and audit trail format. These are not decorative details. They determine whether the governance architecture is auditable under a compliance review.

## Review Questions Worth Asking

The first question is simple: if the AI gateway is bypassed, what governance remains? If the answer is "nothing until the catalog," the catalog governance needs to be defined and tested. If the answer is "nothing at all," the data layer is ungoverned.

The second question: can the audit trail for a specific agent query be reconstructed from logs to show the gateway decision, the catalog decision, and the query result independently? If not, the audit trail is not complete.

The third question: who owns the catalog-level governance policy for tables that are in the agent's tool scope? If the answer is unclear, the data layer has no defined governance owner.

## A Realistic Pilot Shape

A realistic pilot should look like one agent request for a sensitive metric routed through a gateway policy, a catalog access check, and a semantic layer certification check. The pilot should capture the audit log at each layer, verify that each layer's denial is independent, and confirm that the identity is correctly propagated from gateway to catalog. The point is not to demonstrate sophisticated governance. The point is to verify that each layer is actually enforcing its own policy.

Include a repetition test. Run the same governance scenario across several days as policies are updated. Governance layers that enforce policies correctly at setup often drift when policies are updated in one layer but not reflected in another.

## Metrics That Should Drive the Next Decision

The first metrics to watch are denial rate at each governance layer, identity propagation accuracy, audit trail completeness rate, and policy consistency across concurrent agent sessions. Those measurements should lead to a decision about whether to tighten a specific layer's policy, fix an identity propagation gap, improve audit logging, or split governance ownership more clearly.

A second group of metrics should track compliance: how often can a specific agent interaction be fully reconstructed from audit logs for a compliance review? That rate tells you whether the governance architecture is audit-ready.

A third group should track gap detection: how often does the governance architecture detect and block access that the gateway alone would have allowed? That metric measures the value of the catalog-level governance layer above the gateway layer.

## What I Would Cut From a Weak Rollout

Cut combined gateway-and-catalog governance testing from the first phase. Test each layer independently before testing them together. If the layers are only tested together, it is impossible to know which layer is enforcing which policy.

Cut multi-agent concurrent sessions from the initial governance verification. One agent, one identity, one tool scope. Verify the governance path for that case before adding complexity.

Cut unmonitored semantic layer access from the initial scope. The semantic layer is where metric certification and column restrictions live. It needs to be included in the governance verification from the start.

## The Practical Standard

The practical standard is not the most sophisticated governance architecture. It is defense in depth with a complete audit trail. When a compliance review challenges an agent's access to a sensitive metric, the operator should be able to produce gateway logs, catalog logs, and semantic query logs that independently confirm the governance decision at each layer.

That standard is demanding, but it is realistic. It lets enterprises deploy AI agents into regulated environments without pretending that a gateway log is equivalent to a data governance audit trail.

## My Recommendation

Take the governance control plane comparison seriously, but do not oversell either product as a complete solution. The useful bar is simple: can the team define the governance responsibilities at each layer, test each layer's enforcement independently, propagate identity correctly, and produce a complete audit trail?

If the answer is yes, the architecture deserves a production rollout. If the answer is no, the next step is not choosing between the two products. The next step is clarifying which layer owns which governance responsibility.

The open architecture angle is naturally compatible with platforms like Dremio when the goal is governed SQL and semantic access across open data. The stronger argument is not that one control plane wins everywhere, but that the responsibilities should be explicit at each layer, and the audit trail should be complete across all of them.

For a deeper foundation on lakehouse and AI architecture, explore Alex Merced's books on data lakehouses and AI at [books.alexmerced.com](https://books.alexmerced.com). To try a governed, open, agent-ready lakehouse in practice, start a free trial of Dremio's Agentic Lakehouse at [dremio.com/get-started](https://www.dremio.com/get-started).
