---
title: "The Metric Contract Mandate: Standardizing Semantic Layers Before AI Agent Access"
date: "2026-07-06"
description: "![Papercut metric contract diagram with central metric and surrounding governance attributes](./diagram-1.png)"
author: "Alex Merced"
category: "Lakehouse"
tags:
    - data lakehouse
    - apache iceberg
    - metric contract
    - business definitions
    - semantic layer
canonical: https://iceberglakehouse.com/posts/metric-contract-mandate-semantic-layers-ai-agent-access/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/metric-contract-mandate-semantic-layers-ai-agent-access/).



AI agents are very good at moving quickly. That is the opportunity and the risk. If an agent can inspect metadata, generate queries, compare results, and call tools in seconds, then any ambiguity in the data platform can spread just as quickly.

Metrics are where that risk becomes obvious. Revenue, active users, retention, churn, margin, conversion, customer health, and product usage are not just columns. They are agreements. They encode business rules, exclusions, time logic, ownership, and trust. If those agreements are not written down in a form machines can use, agents will improvise.

That is why I think the next phase of semantic-layer maturity is the metric contract. A metric contract defines what a metric means, how it is calculated, who owns it, what grain it uses, which dimensions are allowed, how fresh it should be, which tests protect it, what lineage supports it, and which users or agents can access it.

This is not a formal regulation. It is an architectural mandate created by the reality of agentic analytics. Before agents get broad access to business data, the platform needs machine-readable business meaning.

The Dremio-positive conclusion is that semantic contracts become more valuable when they sit close to open lakehouse data and fast federated query. Agents need a governed data foundation, not just a clever translation layer.

![Papercut metric contract diagram with central metric and surrounding governance attributes](/images/2026/week-2026-07-06/metric-contract-mandate-semantic-layers-ai-agent-access-diagram-1.png)

## Why Text-to-SQL Breaks on Business Meaning

Text-to-SQL tools can generate valid SQL and still answer the wrong question. The SQL parser may be happy. The business may not be.

Consider a user asking, "What was retention last quarter?" The agent has to know which retention definition applies. Is it logo retention or revenue retention? Does it include customers on trials? Does it use contract start date, invoice date, or product activity? Does it exclude internal accounts? Does it compare calendar quarters or fiscal quarters? Which customer hierarchy is used?

Those decisions cannot be left to inference. A human analyst might know the organization's convention. An agent needs the convention encoded.

The same is true for "active users." It might mean daily active users, monthly active users, users with a paid account, users with a qualifying product event, or users excluding internal test accounts. The column names will not reliably tell the agent which definition is approved.

This is why semantic layers matter. They give business terms a structured home. But the semantic layer has to be explicit enough for machines, not only convenient for dashboard builders.

## What a Metric Contract Contains

A useful metric contract should include several fields.

The business definition explains the metric in plain language. This is what a stakeholder can read and approve.

The calculation defines the formula. It should specify numerator, denominator, filters, time logic, and aggregation behavior.

The grain defines the level at which the metric is valid. Customer-day, account-month, order-line, session, and user-week are different grains. Agents need to know them to avoid invalid joins.

The allowed dimensions define how the metric can be sliced. A metric may be valid by region and customer segment but not by a dimension that causes double counting.

The owner identifies who approves changes. Without ownership, definitions drift.

The freshness expectation tells users and agents how current the metric should be.

The quality tests define what must be true for the metric to be trusted.

The lineage records which tables, views, and transformations feed the metric.

The access rules define who can query it and whether masking or aggregation thresholds apply.

The lifecycle state tells whether the metric is draft, certified, deprecated, or restricted.

Together, these fields turn a metric into a contract rather than a query snippet.

## Semantic Layers as Execution Contracts

Historically, semantic layers were often treated as BI modeling tools. They helped dashboards use consistent measures and dimensions. That is still valuable, but agentic analytics raises the stakes.

When an agent uses a semantic layer, the semantic layer becomes an execution contract. It tells the agent what it is allowed to ask, what definitions are approved, and how results should be interpreted.

This changes how teams should design semantic models. A definition that is clear to a dashboard author may not be clear enough for an agent. Agents need explicit descriptions, constraints, examples, and refusal conditions.

For instance, a metric contract might say that gross revenue is not valid for customer-level churn analysis because it includes one-time fees. Or it might say that a metric cannot be sliced by campaign because attribution is not reliable before a certain date. These constraints help agents avoid plausible but wrong queries.

The semantic layer should not only enable questions. It should prevent invalid ones.

![Papercut agent query flow through semantic layer, metric contract, policy gate, query engine, and trusted data](/images/2026/week-2026-07-06/metric-contract-mandate-semantic-layers-ai-agent-access-diagram-2.png)

## Why Agents Need Contracts Before Access

Giving an agent access to raw tables before defining metric contracts is like giving a junior analyst access to every table without onboarding and then asking them to brief the executive team. Sometimes it will work. Eventually it will fail in public.

Agents need contracts because they do not share institutional memory. They do not know which old table should be avoided. They do not know which dashboard definition superseded another. They do not know which column is misnamed. They do not know which dimensions create double counting unless the platform tells them.

Metric contracts also help agents explain results. A response that says "retention was 91 percent" is less useful than a response that says the metric used logo retention, measured at account-month grain, excluding trials and internal accounts, refreshed at a known time, and based on a certified semantic asset.

That kind of explanation builds trust because it exposes the contract behind the answer.

## Policy Is Part of the Metric

Metrics are not only calculations. They are access surfaces.

A customer revenue metric may be broadly visible at an aggregate level but restricted at the account level. A healthcare utilization metric may require masking or minimum group sizes. A support metric may expose trends but not raw ticket content. A product usage metric may include sensitive user behavior.

The metric contract should describe those rules. Agents should know whether they can query raw rows, only aggregates, or only certain dimensions. If a user asks for a restricted cut, the agent should refuse or ask for approval.

This is especially important because agents can chain steps. A single query may be allowed, but a sequence of queries could reveal sensitive information. Semantic and policy layers need to work together.

## Metric Contracts and Open Lakehouse Data

Metric contracts are most powerful when they are not trapped inside one dashboard tool. BI is only one consumer. Metrics increasingly need to serve APIs, notebooks, operational workflows, embedded analytics, and AI agents.

Open lakehouse architecture helps because the underlying data can remain in open formats such as Iceberg. Query federation can reach sources that have not moved yet. Catalogs can expose metadata and ownership. Semantic layers can provide consistent definitions across consumers.

If the semantic layer is tied too tightly to one application, agents outside that application may recreate definitions. That creates semantic drift. The stronger pattern is to make metric contracts reusable across interfaces.

This is where the Dremio Lakehouse approach becomes compelling. It aligns open data, fast query, and semantic access in a way that supports many consumers, including agents.

## Building a Metric Contract Program

Start with the metrics that matter most. Do not try to contract every metric in the company on day one. Focus on the metrics executives, operators, and agents are most likely to use.

Revenue, retention, churn, usage, cost, margin, conversion, customer health, and incident rate are common starting points.

For each metric, identify the owner. The owner should be a business or data product owner who can approve definition changes.

Document the definition in plain language. If the business cannot agree on the wording, the platform cannot fix the disagreement.

Implement the calculation in the semantic layer. Keep the logic visible and versioned.

Add tests. Check nulls, ranges, freshness, expected totals, and known exclusions.

Define access rules. Decide who can see the metric, at what grain, and through which tools.

Expose the contract to agents. Use metadata APIs, semantic services, or tool interfaces so the agent can retrieve definitions before querying.

Monitor usage. If a metric becomes heavily used by agents, it deserves stronger review.

## Versioning and Change Management

Metric definitions change. The contract should make change manageable.

When a definition changes, record the version, reason, owner, effective date, and expected impact. Consumers should know whether historical results were restated or only future calculations changed.

Agents need this history too. If a user asks why a metric changed, the agent should be able to distinguish business performance from definition changes.

Deprecation matters as much as creation. Old metrics should not linger forever. Mark them deprecated, point to replacements, and eventually remove them from agent-accessible tools.

Without lifecycle management, semantic layers become cluttered. Agents will find and use assets humans forgot to clean up.

![Papercut open lakehouse semantic layer serving BI, APIs, notebooks, and AI agents](/images/2026/week-2026-07-06/metric-contract-mandate-semantic-layers-ai-agent-access-diagram-3.png)

## The Dremio-Positive Reading

This topic naturally favors Dremio's Agentic Lakehouse narrative because metric contracts need a place to operate. They need open data, governed catalogs, fast query, semantic definitions, and agent-safe interfaces.

If metrics live only inside a dashboard, they are not enough for agentic analytics. If data lives only in raw tables, agents will guess. If query performance is poor, agents cannot complete multi-step workflows. If federation is missing, agents see only part of the business.

The compelling architecture is an open lakehouse with a semantic layer that machines can use. That is the direction Dremio has been pointing toward.

## What to Ask Before Giving Agents Access

Which metrics are certified?

Who owns each metric?

What grain is valid?

Which dimensions are allowed?

How fresh is the data?

Which tests protect the metric?

What lineage supports it?

Which users and agents can access it?

What should the agent do when the request is ambiguous?

What should the agent refuse?

If these questions cannot be answered, the agent should not have broad analytical access yet.

## How Agents Should Use Metric Contracts at Runtime

A good agent should not treat metric contracts as background documentation. It should use them during the actual workflow.

When a user asks a question, the agent should first resolve the business terms. If the user asks for retention, the agent should search the semantic layer for approved retention metrics and select the one that matches the context. If multiple definitions exist, the agent should ask for clarification or present the options.

Next, the agent should inspect the contract. It should check the valid grain, allowed dimensions, filters, freshness expectation, and access rules. If the requested cut is not valid, the agent should refuse or reframe the answer.

Then the agent should plan the query through the approved semantic path. It should prefer a certified metric or view over raw tables. It should avoid generating SQL that reimplements metric logic unless that is the only approved route.

After execution, the agent should validate the result against the contract. Is the data fresh enough? Did quality checks pass? Is the result inside an expected range? Were any policy filters applied?

Finally, the agent should explain the answer with the contract in view. It should say which metric definition it used and any limitations that matter.

This runtime pattern is what separates agentic analytics from a chatbot with database access.

## Anti-Patterns to Avoid

The first anti-pattern is the universal SQL tool. A tool that lets an agent query anything with arbitrary SQL may be useful for development, but it is risky in production. It pushes too much responsibility into the model.

The second anti-pattern is metric duplication. If the same metric is implemented in a dashboard, a notebook, a dbt model, an API, and an agent prompt, the definitions will drift.

The third anti-pattern is contract-free certification. A metric marked "certified" without owner, tests, lineage, or access rules is only wearing a label.

The fourth anti-pattern is hiding definitions from users. If the agent cannot show the metric definition, users cannot evaluate the answer.

The fifth anti-pattern is letting draft metrics into agent tools. Draft metrics are useful for exploration, but agents should not use them for decision workflows unless the answer clearly says the metric is experimental.

The sixth anti-pattern is treating access control as separate from semantics. A metric definition without policy context is incomplete.

These anti-patterns are common because they make early demos easier. They also make production systems fragile.

## Metric Contracts as Data Products

The best way to manage metric contracts is to treat them as data products. Each important metric should have a product owner, consumers, documentation, quality expectations, change history, and support path.

This changes the culture around metrics. Instead of asking "Who wrote this SQL?" teams ask "Who owns this business definition?" Instead of copying a formula into another dashboard, teams reuse the contract. Instead of letting agents infer meaning, teams expose meaning as an asset.

Data product thinking also helps with prioritization. Not every metric deserves the same rigor. A metric used in executive reporting, customer-facing analytics, or agentic workflows deserves stronger contracts than a one-off exploration metric.

The lifecycle should be visible. A metric can be draft, candidate, certified, restricted, deprecated, or retired. Agents should be able to read that lifecycle state and adjust behavior.

## Contract Testing

Metric contracts need tests at several levels.

Schema tests verify that required columns and relationships exist.

Freshness tests verify that source data is current enough for the metric.

Range tests verify that values fall within expected boundaries.

Reconciliation tests compare results to known reports or source systems.

Dimension tests verify that allowed breakdowns do not create double counting.

Policy tests verify that restricted users and agents cannot access disallowed cuts.

Explanation tests verify that the agent can describe the metric correctly.

These tests should run continuously. If a contract fails, the agent should know. It should avoid using the metric or clearly warn the user that trust is reduced.

Testing turns metric governance from a meeting into an operational control.

## Organizational Ownership

Metric contracts sit between business and data teams. Business owners should approve definitions. Data teams should implement, test, and operate them. Security teams should review access rules. Platform teams should expose them through query and agent interfaces.

If any one group owns the whole process alone, something usually breaks. Business-only ownership may produce definitions that are hard to implement. Data-only ownership may miss business nuance. Security-only ownership may make metrics unusable. Platform-only ownership may focus on mechanics over meaning.

The contract is the meeting point. It gives each group something concrete to review.

This also helps with change management. When a metric changes, the owner can explain the reason, data teams can update implementation, security can review policy impact, and platform teams can notify consumers.

Agents become safer because they depend on an explicit organizational agreement, not tribal knowledge.

## How This Affects Procurement

When evaluating semantic-layer or agentic analytics tools, buyers should ask how metric contracts are represented.

Can contracts be versioned?

Can they include owners, tests, lineage, freshness, and policies?

Can agents retrieve them through an API or tool?

Can contracts be reused outside one dashboard interface?

Can the platform prevent agents from using draft or deprecated metrics?

Can explanations cite the contract fields?

Can access rules vary by user, role, grain, and dimension?

Can contracts work across open lakehouse tables and federated sources?

These questions are more useful than asking whether the demo can answer a sample question. Production value depends on repeatability.

## Why This Belongs in the Lakehouse

Metric contracts should be close to the data foundation because they need table lineage, query execution, freshness checks, access policy, and performance context. If the semantic layer is disconnected from the lakehouse, it may not know enough about table state or data quality.

An open lakehouse gives the contracts a strong base. Iceberg tables provide durable table state. Catalogs provide metadata and governance. Query engines provide execution and federation. Semantic layers provide business meaning. Agent tools expose controlled access.

This layered design is more robust than embedding definitions inside every application. It also makes Dremio's approach compelling because Dremio sits at the intersection of open data, query acceleration, federation, and semantic access.

## Documentation Has to Be Written for Machines Too

Metric documentation should still be readable by humans, but it also needs structure that machines can use. A paragraph in a wiki is helpful context. A contract field that states the valid grain, allowed dimensions, owner, freshness, and refusal conditions is runtime guidance.

This does not mean documentation should become sterile. It means the important parts should be explicit. Agents need crisp names, examples, constraints, and status. They need to know when a metric is safe to use and when it is not.

That clarity is part of governance.

It matters operationally.

## The Direction of Travel

The semantic layer is becoming more than a BI convenience. It is becoming the contract layer for AI analytics.

Metric contracts make that shift practical. They give agents the business meaning, constraints, and policy context needed to answer responsibly. They also force organizations to clean up ambiguity that has been tolerated for too long.

As agentic analytics matures, the winners will not be the systems that generate the most SQL. They will be the systems that know which SQL should be generated, which definitions apply, which policies constrain the result, and how to explain the answer.

That is why metric contracts belong at the center of the agentic lakehouse conversation.

For more of my thinking on data lakehouse and AI architecture, explore my books at [books.alexmerced.com](https://books.alexmerced.com). To try a modern Agentic Lakehouse experience, visit [dremio.com/get-started](https://www.dremio.com/get-started).
