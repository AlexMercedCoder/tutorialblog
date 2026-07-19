---
title: "Semantic View Autopilot for AI Governance"
date: "2026-07-13"
description: "An in-depth exploration of semantic view autopilot for ai governance"
author: "Alex Merced"
category: "AI & Agents"
tags:
  - Semantic Layer
  - Governance
  - AI Agents
  - Metrics
canonical: "https://iceberglakehouse.com/posts/semantic-view-autopilot-dynamic-metric-definition-governance/"
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/semantic-view-autopilot-dynamic-metric-definition-governance/).

Most data glossaries are wrong by the time you read them. A column gets renamed, a metric changes its grain, a new product line ships, and the human who was supposed to update the documentation is three sprints behind. The glossary that was accurate in January describes a schema that no longer exists in July. For a human analyst this is an annoyance they route around by asking a colleague. For an AI agent that treats the glossary as ground truth, it is a source of confident, wrong answers.

That failure mode is why "semantic view autopilot," the idea of using AI to draft table descriptions, column labels, metric definitions, and logical views, has real appeal. The administrative burden of keeping a semantic layer current is exactly the kind of work that outpaces manual effort. But the appeal comes with a trap. AI can generate a definition that reads perfectly and means something subtly false. Business meaning is not something a model can fully infer from schema and samples, and it is not something you should let a model publish unreviewed to the tools your agents depend on.

So the honest version of this capability is narrower and more useful than "AI writes your semantic layer." It is: AI drafts, humans review, and only approved definitions reach production. The win is faster curation, not unchecked automation. Let me lay out where the automation genuinely helps, where it goes wrong, and what governance has to look like for you to trust the output.

## Why Manual Semantic Governance Falls Behind

A semantic layer is the set of definitions that turn physical tables into business concepts. It answers questions like: what does the `rev_net` column actually measure, what grain is `active_users` computed at, which tables does "quarterly churn" depend on, and what does "customer" mean when three tables all have a `customer_id`. When those definitions are accurate, analysts and agents can ask business questions and get correct answers. When they drift, everything downstream drifts with them.

Three forces make manual maintenance a losing race.

**Schema evolution outpaces documentation.** Physical tables change constantly. Columns are added, renamed, deprecated, and repurposed. Partitioning changes. A metric's underlying calculation gets adjusted. Each of these should trigger a documentation update, and in practice most of them do not, because updating the glossary is nobody's top priority and there is no forcing function.

**Product and business changes redefine terms.** "Active user" meant one thing before the mobile app launched and something else after. "Revenue" splits into gross, net, recognized, and deferred as the finance team matures. The words stay the same while their meaning shifts, which is the most dangerous kind of drift because nothing looks broken.

**Coverage never catches up.** Most organizations have far more tables, columns, and metrics than anyone has documented. The undocumented long tail is where analysts waste time and where agents make mistakes, and manual effort simply cannot cover it at the rate new data arrives.

The stakes rose when agents entered the picture. An analyst reading a stale description brings judgment and context; they notice when something smells off. An agent consuming a semantic definition through a tool interface tends to trust it. If the definition says a column is "monthly recurring revenue in USD" and it is actually a raw transaction amount in local currency, the agent will build an analysis on that false premise and present the result with full confidence. Stale semantics stop being a documentation problem and become an operational risk. That is the pressure driving interest in automation: the manual approach was already behind, and agents made being behind more expensive.

## How AI Drafts Definitions and Logical Views

Here is what an LLM can actually do well when pointed at a data platform, because this part is genuinely valuable and worth being precise about.

The raw material a model can inspect is richer than most people assume. It can read schema names and infer intent from them, since `dim_customer` and `fct_order_line` carry real signal. It can look at sampled column values to distinguish an enum from a free-text field, a currency amount from a count, a timestamp from a date. It can trace lineage to see which physical tables feed a view and how columns flow through transformations. It can read existing documentation, even partial or stale, and use it as a starting point. And in platforms that expose them, it can read query logs to see how columns are actually used: which columns get joined together, which get aggregated, which get filtered, which never get touched.

From that material, a model can propose a useful set of draft artifacts:

- **Table descriptions** that summarize what a table represents and its grain.
- **Column descriptions and labels** that explain what each field means and tag it with business categories.
- **Candidate metrics**, like proposing that `sum(amount) / count(distinct order_id)` looks like an average order value based on how the columns are used.
- **Join hints** inferred from observed query patterns, suggesting that `orders.customer_id` reliably joins to `customers.id`.
- **View SQL** that assembles physical tables into a business-friendly logical dataset.

The productivity gain is real. Instead of a data engineer writing a description for every column in a two-hundred-column table from scratch, they review and correct a set of drafts. Instead of the undocumented long tail staying undocumented forever, it gets a first pass that a human can refine. Drafting is the slow part of curation, and drafting is exactly what the model accelerates.

The critical framing, though, is that everything in that list is a *proposal*. A column description is a hypothesis about meaning. A candidate metric is a guess about intent. View SQL is a suggestion about how tables relate. None of it is authoritative until a human who knows the business confirms it. The model is a fast, tireless drafter, not an oracle.

## Where Autopilot Can Go Wrong

The central risk is not that the AI produces obvious garbage. Obvious garbage is easy to catch. The risk is that it produces something plausible and wrong, a definition that reads like it was written by someone who understood the business but was actually pattern-matched from names and samples without real knowledge.

Some concrete failure modes.

**Plausible-but-wrong business definitions.** A column named `revenue` might be gross, net, recognized, billed, or an internal estimate. The model sees `revenue`, sees dollar-shaped numbers, and writes "total revenue in USD." That description is fluent, confident, and possibly false in a way that matters enormously for financial reporting. The failure is invisible precisely because the output looks correct.

**Ambiguous business terms.** Words like "active," "customer," "churned," and "conversion" have organization-specific definitions that no amount of schema inspection can recover. Is a customer active if they logged in, if they transacted, if their subscription is current? The answer lives in a policy document or in someone's head, not in the data. A model will pick the most common industry meaning, which may be exactly wrong for your business.

**Sensitive and regulated fields.** A model summarizing columns can inadvertently surface or mislabel fields containing personal data, financial details, or health information. It might describe a column in a way that reveals what it contains to users who should not see it, or it might fail to flag a field that needs masking. Sensitive data handling cannot be left to inference.

**Metrics that are directionally right but subtly off.** A candidate metric might use the right columns but the wrong grain, double-count because of a fan-out join, or miscount nulls. It produces a number, the number looks reasonable, and the error only shows up when someone reconciles it against a trusted source.

The common thread is that these errors are cheap to produce and expensive to catch, and an agent consuming them will not catch them at all. This is exactly why review is not optional. The model's fluency is a feature for drafting and a hazard for publishing. You want the fluency in the draft and a human's judgment on the gate.

One more failure mode deserves attention because it compounds over time: confident drift. A model asked to regenerate definitions periodically may produce a slightly different description each run, not because anything changed but because generation is not deterministic. If you republish those regenerated descriptions automatically, your semantic layer starts to shimmer, with the meaning of a metric quietly rewording itself over months until it says something different from where it started. The defense is to treat each generation as a candidate diff against the approved version, not as a fresh replacement. A reviewer sees "here is what changed and why," approves or rejects the change, and the approved definition stays stable until a real reason to change it appears. Generation should propose deltas, not silently overwrite meaning.

## Where the Economics Actually Work

It is worth being concrete about when this automation pays off, because the answer is not "always" and pretending otherwise sets teams up for disappointment.

The economics are strongest on the undocumented long tail. If you have ten thousand columns and two hundred are documented, the marginal value of a decent AI draft on the other nine thousand eight hundred is high, because the alternative is nothing. A draft that is seventy percent right and needs a human to correct the last thirty percent still beats a blank field that no one was ever going to fill in. The reviewer's job shrinks from authoring to editing, which is faster and less daunting, and coverage climbs from near-zero toward comprehensive.

The economics are weakest on the small set of high-stakes, heavily contested definitions. Your top twenty financial metrics, the ones that appear in board decks and regulatory filings, are already carefully defined by people whose job is to define them, and they are exactly the definitions where a plausible-but-wrong draft causes the most damage. For those, AI drafting saves little and risks much. The reasonable posture is to let the model help everywhere but to weight review effort toward the definitions that matter most, spending human attention where the cost of an error is highest rather than spreading it evenly.

There is also a cold-start benefit that is easy to undervalue. When a new dataset lands, having any reasonable draft documentation immediately, rather than in three months when someone gets around to it, changes how usable that dataset is on day one. The draft gives analysts a starting point to react to, and reacting to a draft is far faster than writing from scratch. The value here is less about final accuracy and more about compressing the time from "data exists" to "data is understood well enough to use." Speed of first understanding is its own payoff.

The honest summary: AI-assisted semantic generation is a coverage-and-speed play, not an accuracy-replacement play. It is most valuable where documentation was going to be absent or late, and least valuable where careful human definition already exists. Deploy it with that asymmetry in mind and it earns its keep. Deploy it as a replacement for judgment on your most important metrics and it will eventually embarrass you.

## Lineage for Metric Definitions

If AI is going to draft definitions and humans are going to review them, both need to know what each definition depends on. Lineage is the connective tissue that makes review and maintenance tractable instead of a guessing game.

Every semantic definition should record which physical tables, columns, and versions it is built on. A metric called "net revenue" should carry an explicit dependency on the specific columns of the specific tables it aggregates. This does several things at once.

It makes change detection possible. When a physical table's schema changes, the platform can identify every semantic definition that depends on the affected columns and route them into a review workflow rather than letting them silently rot. Instead of a glossary that quietly goes stale, you get a system that raises its hand and says "this metric depends on a column that just changed; confirm it is still correct." That forcing function is the thing manual governance never had.

It makes impact analysis possible before you make a change. Before deprecating a column, you can see which metrics and views would break, which turns a risky change into a planned one.

And it makes explanation possible after the fact. When a metric feeds a report or an agent's answer, lineage lets you trace exactly where the number came from. Combined with version history on the metric definition itself, you can answer the question that always comes up in an audit or a disagreement: what did this metric mean when this report was generated? Metrics need version history so that a report from last quarter can be explained in terms of the definition that was live last quarter, not the one that is live today. Without versioning, a redefined metric quietly rewrites history and nobody can reconcile old numbers with new ones.

Schema changes triggering review, and metric versions preserving history, are the two lineage-driven behaviors that keep a semantic layer honest over time. AI drafting without this scaffolding just generates stale definitions faster.

## Programmatic Review Before Publishing

Review does not have to mean a human squinting at every generated line, which would defeat the speed advantage entirely. The workable model combines human judgment with automated checks, so machines catch the mechanical errors and people focus on the semantic ones.

Here is the flow I would put in place, and the diagram below describes the path a definition travels.

```
Schema + samples + lineage + query logs
        |
        v
   AI generates draft definition
        |
        v
   Automated tests (grain, nulls, row counts, types)
        |
        v
   Human owner review + approval
        |
        v
   Published to agent-facing semantic layer
```

Two gates, not one. Automated tests catch the mechanical failures; a human owner catches the meaning.

The automated tests should check the things a machine can verify without business knowledge:

- **Expected grain.** Does the metric produce one row per the entity it claims, or does a join fan it out?
- **Null behavior.** Does the calculation handle nulls the way the definition implies, or do they silently skew the result?
- **Row count sanity.** Does the view return a count in a plausible range, or did a bad join explode or collapse it?
- **Type and range checks.** Is a currency field actually numeric and non-negative where it should be, is a date within a sane window?

These catch a real fraction of errors cheaply and automatically. What they cannot catch is whether the definition means the right thing, and that is the human's job.

Use a checklist for the human review so it is consistent rather than ad hoc:

- Does the description match the true business meaning, confirmed against a policy or an owner, not just inferred?
- Is the grain and calculation method correct for how this metric is actually used?
- Are sensitive or regulated fields correctly identified and handled?
- Do ambiguous terms resolve to this organization's specific definition?
- Is the lineage complete and accurate?
- Is this consistent with related, already-approved definitions?

Assign ownership. Every generated definition needs a human owner who is accountable for approving it, and approval should be an explicit action, not a default. Only after both gates pass does the definition get promoted to the agent-facing semantic layer, where agents and BI tools consume it. The unapproved drafts stay in a staging state, visible to reviewers but invisible to production consumers. That separation is what lets you generate aggressively while publishing conservatively. Humans stay in the review path by design, not by accident.

## Measuring Whether the Autopilot Is Any Good

If you deploy AI-assisted semantic generation, measure it, because "it feels helpful" is not a basis for trusting definitions that agents will act on. A few metrics tell you whether the system is earning trust or eroding it.

Track the acceptance rate: what fraction of generated drafts get approved without edits, with edits, or rejected outright. A healthy system has a meaningful accept-with-edits rate, which means the drafts are useful starting points. A very high reject rate means the generation is wasting reviewer time and should be tuned or scoped more narrowly. A near-total accept-without-edits rate is not necessarily good news either; it can mean reviewers are rubber-stamping rather than reviewing, which is the exact failure the whole workflow exists to prevent. You want reviewers engaged, not asleep.

Track edit distance on the descriptions that do get corrected. If reviewers are rewriting drafts almost entirely, the model is not actually saving work. If they are making small factual fixes, it is. This tells you where the model is strong, often on structural descriptions and column typing, and where it is weak, usually on business-specific meaning and ambiguous terms.

Track downstream corrections. When a published definition later turns out to be wrong and gets fixed, log whether it originated from an AI draft or a human author, and whether it passed review. This is your feedback loop on the review process itself. If AI-originated definitions have a higher post-publication correction rate, your review gate is too loose for generated content and needs tightening. If the rates are comparable, the workflow is doing its job.

The point of measuring is to keep the system honest over time. Semantic quality degrades quietly, and without metrics you will not notice the drift until an agent produces a confidently wrong analysis in front of an executive. Instrumenting acceptance, edit distance, and downstream corrections turns a vague sense of "the AI helps" into evidence you can act on, and it tells you when to trust the drafts more and when to pull the reins.

## Dremio-Friendly Takeaway

The pattern that works, then, is AI as a drafting accelerator inside a governed workflow, not AI as an unsupervised author. This is where Dremio's approach to the semantic layer fits well.

Dremio treats the semantic layer as a first-class part of the platform: virtual datasets that define business logic as views without copying data, wikis and labels that document those datasets, and [AI-generated metadata](https://www.dremio.com/blog/5-powerful-dremio-ai-features-you-should-be-using/) that drafts descriptions and context for you. The AI-generated wikis and labels are exactly the "draft" step described above: the platform proposes documentation, and your team reviews and curates it before it becomes the trusted definition. That is the correct division of labor, with the machine doing the tedious first pass and humans owning the meaning.

Because Dremio is built for and managed by AI agents, the approved semantics become the context its built-in AI Agent and AI SQL functions rely on, and they are exposed to external agents through an open-source MCP server built on the [Model Context Protocol](https://modelcontextprotocol.io/). The important property is what reaches the agents: approved, governed definitions, not raw model guesses. As Dremio describes in its writing on the [agentic analytics semantic layer](https://www.dremio.com/blog/agentic-analytics-semantic-layer/), the semantic layer is what lets agents ask business questions and get answers grounded in curated meaning rather than in whatever a model inferred on the fly.

All of it sits on open standards, with Apache Iceberg tables, an open catalog on Apache Polaris, and no proprietary lock-in on the underlying data. That matters for governance because your semantic definitions, lineage, and access controls live in an open foundation you control, not inside a closed system. Fine-grained access control governs which definitions and data each user and agent can see, so the sensitive-field problem is handled by policy, not by hoping the model labeled things correctly.

The takeaway holds across platforms: AI can carry a large share of the semantic maintenance burden, but the systems worth trusting keep humans in the review path and expose only approved semantics to agents. The data foundation, open and governed, is what makes the drafted meaning trustworthy. The model is a fast drafter. The governance is what makes the drafts safe to depend on.

To try AI-assisted semantic curation with humans firmly in the loop, on an open lakehouse foundation with Iceberg and Polaris, start at [dremio.com/get-started](https://www.dremio.com/get-started), connect a dataset, and let the platform draft descriptions you can review before anything reaches your agents.
