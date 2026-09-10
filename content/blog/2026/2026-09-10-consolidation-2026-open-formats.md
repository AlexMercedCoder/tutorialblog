---
title: "What the 2026 Consolidation Means for Open Formats"
date: "2026-09-10"
description: "Tabular, Dremio, and a wave of data platform acquisitions: what changes for teams building on open formats and which guarantees survive a change of ownership."
author: "Alex Merced"
category: "Market Analysis"
tags:
  - open formats
  - acquisitions
  - data platform consolidation
  - Apache Iceberg
  - data strategy
canonical: https://datalakehousehub.com/blog/consolidation-2026-open-formats/
---

> **Cross-posted.** This article's canonical home is [datalakehousehub.com](https://datalakehousehub.com/blog/consolidation-2026-open-formats/).

The independent data infrastructure vendor is becoming rare. Databricks acquired Tabular in 2024, bringing the people who created Iceberg inside a company built around a different format. SAP announced its acquisition of Dremio in May 2026, alongside a research lab working on foundation models for structured data. Analysts tracking the sector describe open-format interoperability and AI-powered governance as the dominant acquisition themes, with acquirers specifically pursuing Iceberg ecosystem assets.

I should be direct about my position before going further: I work at Dremio, which is one of the companies in that paragraph. That gives me a view from inside one of these transactions and an obvious interest in how it is perceived. What follows is an attempt at analysis rather than commentary on my employer, and where I am uncertain I have tried to say so.

The question worth asking is not whether consolidation is good or bad, which depends entirely on where you sit. It is what changes for organizations building on open formats, and which of the guarantees people rely on survive a change of ownership.

## What is actually happening

Three patterns, distinguishable by what the acquirer wanted.

**Format expertise moving inside platform companies.** Buying the team and technology behind an open format, or a leading implementation of one. The strategic logic is that open formats became the interoperability layer everyone has to support, and owning deep expertise in one is worth more than building it slowly.

**Enterprise software companies buying data infrastructure.** Application vendors acquiring lakehouse platforms to connect their business data to open analytics. The logic here is different: the application company holds business context, the data platform holds the analytical capability, and the value is in the join.

**Governance and metadata assets.** Acquirers pursuing catalog, lineage, and governance platforms to complete a story about managing data across hybrid and multi-cloud deployments. This reflects a real gap, since governance was the layer that stayed fragmented while the format layer standardized. It is also the layer buyers complain about most, which makes it both a product opportunity and an acquisition target.

Underneath all three is a market growing quickly enough to attract capital, with sector forecasts putting the lakehouse category in the twenty percent compound growth range for the rest of the decade. Growth attracts buyers, and independent vendors reach a point where scale requires either substantial new capital or an acquirer.

Two forces are pulling in the same direction. Enterprises want fewer platforms and less architectural fragmentation, which favors consolidated vendors. And AI workloads raised the capital requirements for staying competitive, which makes independence more expensive to maintain.

## How the format war ended, and why it matters now

The current situation makes more sense with the sequence that produced it, because the outcome was not obvious at the time.

For years there were three credible open table formats with overlapping capabilities and different sponsors. Engines picked sides. Buyers were told the choice was strategic and hard to reverse, which was true. The industry spent an enormous amount of attention on a question that has largely resolved.

What resolved it was not a technical verdict. It was that the format became a compatibility layer everybody had to support. Once every major platform read and wrote the same format, the format stopped being a differentiator and became infrastructure, and the competition moved to what sits above it: engines, catalogs, governance, semantics, and now agents.

Three properties of that outcome shape everything in this article.

**The specification, not a product, is what won.** The durable asset is a document maintained by a foundation with an open process. That is a different kind of thing from a winning product, and it has different failure modes. A product dies when its company dies. A specification persists as long as implementations exist and someone maintains the process.

**Implementations proliferated in languages nobody coordinated.** Java, Python, Rust, Go, C++. That happened because the specification was public and no permission was required, and it is why the ecosystem now has more surface than any single vendor builds alone.

**Competition moved up, and so did lock-in.** These are the same phenomenon described from two angles. The layer where vendors compete is the layer where switching costs accumulate, and once the format stopped being that layer, both moved to the catalog and above.

The reason this history matters for the consolidation question: the thing that protects buyers is the specification, and the specification exists because a set of companies with competing interests agreed to maintain it jointly. Consolidation is a change in that set. Whether the protection holds depends on whether the joint maintenance continues under a narrower group, which is an open question rather than a settled one.

## How foundation governance actually works

People invoke foundation governance as a guarantee without much precision about what it guarantees, so it is worth being specific.

**What the Apache Software Foundation model provides.** Projects are governed by a project management committee rather than by any single company. Committers earn their status through contribution rather than employment. Releases require committee votes. The trademark and the code are held by the foundation, not by any contributor. A company cannot take a project proprietary, cannot unilaterally change its direction, and cannot stop others from continuing it.

**What it does not provide.** It does not guarantee that anyone keeps working on the project. It does not guarantee a release cadence. It does not prevent the contributor base from narrowing to employees of one or two companies, which happens regularly to donated projects and is the most common way an open project becomes effectively single-vendor while remaining formally open. And it does not guarantee that features you care about get prioritized, since prioritization follows the interests of whoever is contributing.

**Why donation is different from open-sourcing.** A company that open-sources code under its own control retains the ability to change the license, redirect the project, or stop publishing. A company that donates a project to a foundation gives that up. The distinction is invisible in a marketing sentence and decisive when strategy changes, which is why "is it at a foundation" is a better question than "is it open source."

**How to read the health of a project.** Contributor diversity across employers, the ratio of committers to a single company, release cadence, and whether the project management committee's discussions happen in public. All of that is observable on public mailing lists and repositories, and checking it takes an hour.

The practical translation: foundation governance means your format and your protocol survive any single company's decisions. It does not mean they thrive without companies investing in them, and investment follows commercial interest. Both halves of that are true at once, and arguments about consolidation frequently rest on asserting one and ignoring the other.

## What is protected by specification

The useful analytical move is to sort the stack by what governs each layer, because that determines what survives a change of ownership.

**The table format specification.** Apache Iceberg is an Apache Software Foundation project with an open process. Changes require community consensus. No acquisition changes what a manifest file contains or how a commit works, and no acquirer can make the format proprietary. Files written today are readable by any conforming implementation indefinitely.

**The REST catalog protocol.** Same governance, same protection at the interface level, with the qualification that implementations vary in completeness. The specification is safe. Any given vendor's coverage of it is a product decision.

**Apache Polaris.** A Top-Level Project at the ASF since February 2026. Foundation governance means the project continues regardless of what happens to any contributing company, which is precisely the point of donating a project rather than open-sourcing it under company control.

**The agent-facing protocols.** MCP moved to the Agentic AI Foundation under the Linux Foundation in December 2025, which puts the interface between agents and data under neutral governance as well.

That is a meaningful list, and it covers the layers where switching cost used to be highest. An organization whose architecture rests on those four is holding assets that a change of corporate ownership does not touch.

**What is not protected:** proprietary acceleration layers, vendor-specific SQL extensions, management APIs for catalogs, semantic layer definitions, governance policy syntax, pricing, roadmaps, support models, and integration commitments. Every one of those is a product decision, and product decisions belong to whoever owns the product.

The sorting exercise is worth doing explicitly for your own platform. List what you depend on, mark each item as specification-governed or product decision, and look at the second list. That is your exposure to consolidation, and it is usually longer than people expect.

## The case that consolidation is fine

Take the optimistic reading seriously, because it has real support.

**Open formats make acquisition far less dangerous than it once was.** In the proprietary era, a vendor acquisition meant your data sat inside someone else's system and the acquirer's decisions set your options. Today the data is in your bucket in a documented format. The worst case is worse pricing and a worse roadmap, which is a business problem rather than a hostage situation, and the difference is the whole value of the format layer. That is a genuine structural improvement, and it is why the current consolidation is less alarming than the equivalent wave in 2015.

**Acquirers are buying open-format expertise because it is valuable.** The acquisitions in this sector are motivated by the openness rather than despite it. A company that buys an Iceberg-native platform is buying its position in an open ecosystem, and undermining that ecosystem destroys what was purchased. The incentives point toward continued investment.

**Enterprises genuinely want fewer platforms.** The fragmentation of the modern data stack imposed real integration costs on buyers who now prefer consolidated platforms with coherent governance. Consolidation is partly a response to demand rather than only to capital markets.

**Foundation governance was designed for this.** The projects that matter are at the ASF and the Linux Foundation specifically so that no company's fortunes determine their future. Iceberg's governance is what makes the format survive its creators being acquired, which is exactly what it is for. That structure is being tested now and it is holding.

**More resources sometimes means more contribution.** A larger parent funding continued open-source work, and applying more engineering to a specification's implementations, is a real outcome and it has happened.

## The case for concern

The pessimistic reading also has support and deserves the same seriousness.

**Fewer independents means fewer credible alternatives.** The negotiating position that comes from a real alternative depends on alternatives existing. As the count of independent vendors falls, so does buyer power, regardless of how open the format is. Sector analysts explicitly name potential consolidation of the independent vendor ecosystem as a competitive risk.

**Specification influence concentrates.** Open governance distributes decision-making across contributors, and contributors have employers. When contributors concentrate at a small number of large companies, the process remains open and the range of participating interests narrows. This is not a claim that anyone acts in bad faith. It is an observation about how consensus forms when the participants are fewer and larger.

**Roadmaps get reprioritized toward the parent's strategy.** A product inside a larger company competes for investment against everything else that company does. Features that mattered to a standalone product's differentiation matter differently inside a portfolio, and integration with the parent's other products tends to move up.

**Open-source investment is a decision, not a commitment.** Companies contribute to open projects because it serves their strategy. When strategy changes, contribution levels change, and the project continues with whoever remains. Foundation governance protects the project's existence rather than its pace.

**Pricing and packaging change.** The most common practical outcome of an acquisition, and the one customers feel first. Enterprise pricing models replace independent pricing models, minimum commitments appear, and the product gets bundled with things you were not buying. None of that is unique to this sector, and it is the reason exit cost and renewal timing deserve attention the moment a deal is announced rather than a year later.

## What survives, layer by layer

The whole argument compresses into one table. For each layer of a lakehouse, what governs it and what a change of vendor ownership does to it.

| Layer | Governed by | Survives an acquisition | Your exposure |
|---|---|---|---|
| File format (Parquet) | Apache specification | Yes | None |
| Table format (Iceberg) | Apache specification | Yes | None |
| Catalog protocol | Apache specification | Yes, at the interface | Implementation completeness |
| Catalog implementation | Vendor or Apache project | Depends which | Grants, configuration, management API |
| Query engine | Vendor | Product decision | Proprietary syntax, tuning, acceleration |
| Semantic layer | Vendor | Product decision | Definitions, verification effort |
| Governance policy | Vendor | Product decision | Policy syntax, re-certification |
| Metadata platform | Vendor | Product decision | Export completeness |
| Agent access protocol | Linux Foundation | Yes | Implementation completeness |
| Pricing and support | Vendor | No | Renewal terms |

Read down the third column and the shape is clear: the bottom of the stack is specification-governed and safe, the middle is mixed, and the top is entirely product decisions. That distribution is a large improvement over the warehouse era, when the entire column read "no."

Read down the fourth column and you have your work list. Every entry there is something you either accept or mitigate, and the mitigations are the ordinary engineering practices described throughout this piece.

## Two analogies, one useful and one misleading

Consolidation in infrastructure markets has happened before, and the comparisons people reach for are worth examining.

**The useful analogy: operating systems and the Linux ecosystem.** Distributions consolidated substantially. A small number of vendors came to dominate enterprise support, and several independents were acquired or faded. The kernel and the surrounding specifications remained community-governed, and the practical effect on users was that support and packaging became commercial concerns while the technical foundation stayed open. Switching distributions remained possible and non-trivial, which is roughly where lakehouse buyers are heading.

What that analogy predicts: the specification layer stays healthy, commercial consolidation continues, buyers retain real but not costless portability, and the differentiation moves to support, integration, and tooling. That looks like the current trajectory.

**The misleading analogy: the relational database market of the 1990s and 2000s.** People reach for it because it was a consolidation that ended badly for buyers, and the structural difference is decisive. SQL was standardized and the data was not. Every vendor's storage was proprietary, so a migration meant an export and a reload plus a rewrite of everything touching the database. The standard covered the query language, which was the layer where portability mattered least in practice.

Today the inverse holds. The storage is standardized and the query surfaces vary. That is a much better position, and it is why the current consolidation does not have the same implications despite looking superficially similar. Anyone arguing that consolidation returns us to the era of hostage data is skipping the layer that changed.

The lesson from holding both analogies at once: what determines buyer outcomes is which layer got standardized, not how many vendors remain. A market with three vendors and an open storage format leaves buyers better off than a market with ten and proprietary storage.

## The independent vendor question

One thread worth pulling on separately, because it comes up in every conversation about this and is usually argued badly.

**Independents are not automatically better for buyers.** A small independent vendor carries its own risks: less runway, thinner support, a roadmap dependent on the next funding round, and a real possibility of disappearing entirely, which is a worse outcome than being acquired. Buyers who treat independence as a virtue in itself have sometimes chosen the vendor most likely to leave them stranded.

**What independents provide is competitive pressure.** The value is in the market structure rather than in any individual company. A sector with credible alternatives prices differently and ships differently, and that benefit accrues to customers of the large vendors as much as to customers of the small ones.

**Which is why specifications matter more than vendor count.** Competitive pressure from alternatives depends on switching being feasible, and switching being feasible depends on the specification layer. A market with few vendors and strong specifications preserves more pressure than a market with many vendors and weak ones, because the credible threat is what disciplines behavior.

**And why new entry is the signal to watch.** A sector where new independent vendors keep forming has healthy dynamics regardless of how much consolidation happened, because the barrier to entry stayed low. Open specifications lower that barrier substantially, since a new entrant does not have to convince anyone to migrate their data. That is the mechanism by which the format's openness protects buyers over a long horizon, and it is more durable than any particular vendor's independence.

## What actually changes for you

Cutting through both readings to the practical question.

**Nothing changes on day one, and the trajectory changes over three years.** The engineers are the same, the roadmap is the same for a quarter or two, and the product works exactly as it did. What is different is who sets direction, and direction shows up gradually.

**Contractual terms carry over and renewal terms are new.** Existing agreements survive. What happens at renewal is where the change becomes concrete, which is why exit cost as a number matters more after an acquisition than before it.

**Integration with the parent's products improves and neutrality claims get harder to make.** A platform inside a larger company integrates well with that company's other products. That is valuable if you use them, and it changes the platform's positioning if you chose it partly for being unaligned.

**Support and account relationships change shape.** Frequently the most-felt difference in the first year, and the least discussed. Larger companies run support differently.

**The open-source projects continue.** The Apache projects keep running under their own governance, and the format your data is in does not care who owns which vendor.

Two things worth doing in the first quarter after an acquisition affecting your platform. Re-price your exit cost, since the number matters more now than it did. And ask the vendor directly about roadmap, pricing, and support continuity, since a company that has thought about customer questions has answers and a company that has not is telling you something too.

## The AI factor

The consolidation is not primarily about analytics, and reading it as an analytics story misses the driver.

**AI raised the capital requirements.** Competing in a market where buyers expect integrated AI capability costs more than competing on query performance did. Model access, agent infrastructure, and the engineering to build them are expensive, and they arrived on a timeline that gave independent vendors little room to fund them from operations.

**Business context became the scarce asset.** Models are broadly available. What makes an AI system useful on company data is the semantics, the governance, and the business context around it, which is why acquirers pairing application software with data infrastructure are pursuing a specific thesis: the application knows what the data means and the platform knows how to serve it.

**Governed access became the bottleneck.** The practical barrier to deploying agents on company data is not model quality, it is grounding, permissions, and audit. That puts the catalog and the semantic layer at the center of the AI story, which explains why governance and metadata assets are acquisition targets rather than afterthoughts.

**Agent workloads change platform requirements.** Query volume patterns unlike anything human analysts produce, per-user identity propagation as a hard requirement, and cost controls that have to be enforced rather than monitored. Platforms are being rebuilt around those requirements, and rebuilding is expensive.

The consequence for open formats is mostly positive and partly uncertain. Positive because AI systems need to read data wherever it lives, which increases the value of a common format and a common access protocol. Uncertain because the layers AI makes most valuable, semantics and governance, are exactly the layers with no open specification, and a market that consolidates around proprietary versions of those is a market where the format's openness matters less than it does today.

That is the specific thing worth watching. If the AI-critical layers standardize, the current openness extends upward. If they do not, the format stays open and the decisions move above it.

## Three futures

Forecasting is cheap and specific scenarios are useful, so here are three, with what each looks like from a buyer's seat.

**The specification-layered future.** Standards continue to arrive one layer at a time. Semantic definitions get an open specification the way tables did. Agent access is already under neutral governance. Governance policy expression converges on portable forms. In this future, consolidation matters mainly for pricing and support, because the technical assets are all specification-governed and switching remains a project rather than an ordeal. Buyers stay in a reasonable position regardless of how few vendors remain.

**The bifurcated future.** The format and catalog stay open and everything above them stays proprietary and vendor-specific. Data is portable, semantics and governance are not, and since those layers are where agent-era value concentrates, effective lock-in returns to something close to pre-open levels while the marketing language stays open. This is the future the current trajectory produces by default, because it requires nothing new to happen.

**The re-fragmented future.** Consolidation creates room for new independents, as it usually does. Buyers frustrated with bundled platforms fund alternatives, open-source projects fill gaps that acquired vendors deprioritize, and the vendor count recovers with a different composition. Historically this has happened in most infrastructure markets after a consolidation wave, and it takes years.

These are not exclusive. The most likely outcome mixes the second and third: an interim period of bifurcation, followed by open specifications arriving for the layers that matter most, driven by buyers who have felt the cost.

What tilts the odds toward the better versions is unglamorous: buyers asking for portability in procurement, organizations participating in specification work, and independent testing that makes partial implementations visible. None of that is a movement. It is a set of ordinary practices that, aggregated, determine which future the market ends up in.

## Questions worth asking your vendor

If a platform you depend on has been acquired, or is a plausible target, these six questions produce more information than reading the press release.

**"What is the commitment to the open-source projects you contribute to, and how is it resourced?"** A specific answer names teams and roles. A general answer about continued support is a statement of intent.

**"What changes at renewal?"** Pricing model, minimums, packaging, and whether the product gets bundled with things you do not use. Ask now rather than at renewal.

**"Which parts of your platform are specification-governed and which are yours?"** A vendor with a clear answer has thought about it, and the answer tells you exactly where your exposure sits.

**"What is the support model in twelve months?"** Support structure is the most-felt and least-discussed change after an acquisition.

**"How does the roadmap change relative to what we were told last year?"** Compare against what you were sold. Divergence is normal and knowing about it early is the point.

**"What happens to our data and metadata if we leave?"** The export question, asked again, because the answer that was true under previous ownership deserves reconfirmation.

None of these is hostile. They are the questions any competent buyer asks after a change of control, and the quality of the answers is itself informative.

## The strategy that holds either way

The useful response is the one that works whether the optimistic or pessimistic reading turns out to be right.

**Anchor on foundation-governed layers.** Data in Iceberg. Catalog access through the REST protocol. Where an equivalent open specification exists for a layer, prefer it, since specifications are what survive ownership changes. This is not ideology, it is picking the assets with the most durable guarantees.

**Keep the unprotected layers portable by your own discipline.** Semantic definitions in version control. Grants generated from a declarative source. Policy expressed in a form that translates. These are the layers no specification protects, so portability there is something you build rather than something you receive.

**Know your exit cost, updated annually.** A number, by layer, from countable inputs. It is your negotiating position and your risk assessment in one artifact.

**Support the specifications, not just the vendors.** Participation in the open projects, even in a small way, is how the range of interests represented in the process stays broad. Filing issues, testing release candidates, and contributing compatibility results are all available to organizations that write no code.

**Verify openness rather than accepting it.** Test that your catalog implements what your engines need. Test that a second engine reads your tables. Test that metadata exports completely. Claims about openness are cheap and tests are not.

**Evaluate acquired products on their merits.** Avoiding every acquired vendor eliminates most of the market and is not a strategy. Assess the product, price the exit, and decide.

## Reading an acquisition announcement

The press release is written to reassure, so it helps to know which sentences carry information and which are ritual.

**"Nothing changes for customers."** True in the short term and structurally uninformative, since nothing changes immediately in any acquisition. The sentence describes the next quarter and says nothing about the next three years.

**"Continued investment in open source."** Worth attention when it names specifics: which projects, which teams, which roles. Worth little as a general statement, because every acquirer says it and the ones who mean it are usually happy to be concrete.

**"Deeper integration with the parent's portfolio."** The most informative sentence in most announcements. It states the strategic rationale, and it tells you where engineering attention is going. If you use the parent's other products, this is good news. If you chose the product partly for being unaligned, this is the sentence that matters.

**Silence about pricing.** Universal and expected. Pricing changes at renewal rather than at announcement, so the absence of pricing language is not a signal in either direction.

**Leadership arrangements.** Whether the acquired product's leadership stays, and what they own afterward, is a real signal about how much autonomy the product retains, and it is usually stated plainly enough to read.

**The absence of a roadmap statement.** Most announcements do not include one, and the first roadmap communication after the deal closes is more informative than the announcement itself. Watch for whether it arrives on schedule.

A useful discipline: write down what you expect to change and revisit it in a year. Predictions recorded in advance are worth much more than reactions recorded afterward, and it converts a vague unease into something checkable.

## What this looks like from inside

A note on the human side, since organizations are made of people and this is the part press releases skip.

Acquisitions are disruptive to the teams inside them regardless of how well they go. Priorities get re-set, processes change, and people spend months learning a new organization's mechanics. Some leave. The engineering capacity that existed on paper before the deal is not the capacity available for the next two quarters, whatever anyone intends.

For customers, the practical implication is patience about pace and attention to continuity. A slower quarter after an acquisition is normal and not a signal. A year of slower quarters is a signal. The distinction matters because reading the first as the second produces a migration decision made on the wrong evidence.

For the open-source projects involved, the implication is similar. Contribution rates fluctuate around organizational change, and the meaningful measure is the trend over a year rather than a month. Public repositories make that measurable, which is one of the underrated benefits of foundation governance: you can check rather than speculate.

I am inside one of these transitions, which gives me a specific view and an obvious bias. What I have tried to do above is separate the parts that are structurally true, which is that specifications survive ownership changes and product decisions do not, from the parts that are contingent on choices companies make afterward. The first part is knowable now. The second part is not, and anyone claiming certainty about it in either direction is selling something.

## A checklist for the next two years

Concrete practices, most of which take an afternoon, that leave you well positioned regardless of which future arrives.

- Sort your platform dependencies into specification-governed and product-decision. Keep the list current.
- Price your exit cost by layer, and re-price it annually and after any acquisition affecting you.
- Move semantic definitions and policy expressions into version control if they are not there already.
- Generate the catalog grant model from a declarative source.
- Test that a second engine reads your tables and a second catalog serves your engines. Once a year is enough.
- Verify that metadata and lineage export completely, in a documented format.
- Track the percentage of queries using vendor-specific syntax as a metric with a trend.
- Watch contributor diversity on the Apache projects you depend on, and check it annually.
- Ask the six vendor questions above at renewal, not after.
- Participate in at least one specification process, even in a small way.

The last item is the one that gets skipped and the one that matters most collectively. Specifications stay broad because a broad set of participants shows up. Buyers who benefit from open standards and never participate in maintaining them are relying on vendors to represent buyer interests in a process where the vendors are the other party.

## What to watch

Signals that distinguish the optimistic and pessimistic paths as they play out over the next few years.

**Contribution patterns to the Apache projects.** Whether commit activity and contributor diversity stay broad or narrow to a few employers. This is public data, it takes an hour to check, and it is the clearest available indicator of where the process is heading.

**Specification progress on the unprotected layers.** Whether an open standard emerges for semantic definitions, which is the deepest lock-in layer and the one with no specification. If one consolidates, the picture improves substantially.

**Implementation completeness across catalogs.** Whether vendors converge on serving the whole protocol or settle into partial implementations that make portability nominal. Independent testing is what surfaces this.

**Whether new independents appear.** Consolidation and new entry can happen at once, and a sector where new independent vendors keep forming has different dynamics from one where the count only falls.

**Pricing behavior at renewal.** Diffuse and real. The clearest evidence about whether buyer power actually fell.

None of those resolves quickly, and all of them are observable if you are looking. The mistake is deciding the question now in either direction.

## One more signal: what happens to the small projects

A detail that turns out to be diagnostic. Large open-source projects survive almost anything, because too many parties depend on them. The interesting question is what happens to the smaller ones in the same ecosystem: the compatibility test suites, the client libraries in less-popular languages, the connectors, the tooling nobody markets.

Those are maintained by small numbers of people, frequently at one company, as work adjacent to a commercial priority. When strategy shifts, they are the first things to lose their maintainer, and their decay is a leading indicator of ecosystem health well before anything visible happens to the core project.

Three worth watching in any format ecosystem you depend on: the non-JVM client libraries, since they determine whether the format stays usable outside one runtime; the compatibility and conformance tooling, since it determines whether "supports the standard" stays a checkable claim; and the reference implementations of the surrounding protocols, since those are what new entrants build against.

If those stay healthy, the ecosystem is healthy regardless of how the vendor market rearranges itself. If they quietly stop getting releases, that is worth noticing early, and it is public information available to anyone who looks.

## Where this leaves a platform team

Stripping out the market analysis, the practical situation for someone responsible for a data platform is straightforward and slightly different from what it was two years ago.

**Your architectural decisions matter more than your vendor decisions.** Which format, which protocol, and whether your definitions live in files are choices with a longer half-life than which company you buy from. Vendors change ownership. Specifications do not.

**Vendor evaluation now includes a continuity question.** Alongside features, price, and support, the reasonable additions are: what is specification-governed here, what happens at renewal, and what does export look like. Those three questions are cheap to ask and they surface the exposure that traditional evaluation criteria miss.

**Exit cost is a metric, not an event.** Something you track quarterly with a number attached, the way you track spend or reliability. Teams that treat it as a question to answer during a crisis answer it badly and late.

**Participation is part of the job now.** Filing an issue against a specification, testing a release candidate, or publishing compatibility results is a small amount of effort that keeps the process broad. For organizations whose architecture depends on these specifications, it is closer to maintenance than to charity.

**And the day job does not change.** Tables still need compacting, permissions still need reviewing, and pipelines still break at 3am. Market structure is worth understanding and it is not the thing that determines whether your platform works this quarter.

The consolidation is a background condition rather than an emergency. The right response is a set of habits, applied steadily, that leave you with options. That is less dramatic than the framing these stories usually get, and it is what actually helps.

## Conclusion

The consolidation is real, it is continuing, and open formats change what it means. In the proprietary era an acquisition put your data inside someone else's strategy. Today the format is an Apache specification, the catalog protocol is an Apache specification, the leading open catalog is a Top-Level Project, and the agent protocol sits under a neutral foundation. Those guarantees do not depend on any company's ownership, and they cover the layers where switching cost used to be highest.

What consolidation does affect is everything not covered by a specification: pricing, roadmap, support, integration, and the number of credible alternatives you negotiate against. Those matter, and the honest position is that the optimistic and pessimistic readings both have support and the evidence to distinguish them arrives over years rather than months.

The strategy that works under both is the same one that was right anyway. Anchor on the foundation-governed layers. Keep the unprotected layers portable through your own engineering discipline, since nothing external protects them. Price your exit cost and update it annually. Verify openness with tests rather than accepting it as a claim. And support the specifications directly, because the durability of those guarantees depends on a broad set of participants continuing to show up.

The format war ended well, and it ended in a specification rather than in a vendor. That is worth remembering as the vendors rearrange themselves around it.

## Keep Going

If this piece was useful, I have written a lot more on open standards and lakehouse architecture. I have a book on AI and labor economics covering how these market shifts change the work itself, available at [https://a.co/d/06SeOKw8](https://a.co/d/06SeOKw8), and *Architecting an Apache Iceberg Lakehouse* covers building on the specification-governed layers this article argues for. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
