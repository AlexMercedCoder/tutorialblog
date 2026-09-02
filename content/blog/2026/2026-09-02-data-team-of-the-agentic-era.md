---
title: "The Data Team of the Agentic Era: Generalists Owning End-to-End Workflows"
date: "2026-09-02"
description: "The case for generalists owning end-to-end data workflows with agents, the counterargument, and how to make the transition work."
author: "Alex Merced"
category: "AI & Data"
tags:
  - Data Team
  - AI
  - Generalists
  - Specialists
  - Organization
canonical: https://iceberglakehouse.com/posts/data-team-of-the-agentic-era/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/data-team-of-the-agentic-era/).

The standard data team was assembled around a set of scarcities. Writing production pipelines required someone who knew Spark internals, so there was a data engineer. Building models required someone who knew statistics and Python, so there was a data scientist. Answering business questions required someone who knew SQL and the warehouse, so there was an analyst. Running the platform required someone who knew Kubernetes and cost management, so there was a platform engineer. Each role existed because the skill was hard to acquire and the work was too much for one person to hold.

Coding agents have not removed those skills from the work. They have changed how much of the work each skill gates. Someone who understands what a pipeline should do can now produce one without having memorized the Spark API. Someone who understands what a dashboard should show can build it without having specialized in the BI tool. The specialist's knowledge still matters, and it matters differently: as judgment about whether the output is right, rather than as the throughput constraint on producing it.

That shift raises a real question about team design, and it is a question with more than one defensible answer. The case for generalists owning end-to-end workflows is strong and it is not universal. This article lays out the argument, the counterargument, what the boundaries of a workflow should be, what does not change, how to make the transition without breaking things, and how to tell which model fits a given organization. I work at Dremio, in developer relations, and the observations here are about how data work is organized rather than about any product.

## What the Specialist Structure Was Solving

It helps to be precise about why the handoff-heavy structure existed, because the reasons were good ones and some of them still hold.

**Skill depth was expensive.** Knowing Spark well enough to write a correct, performant job took years. Knowing a BI tool's semantic layer took months. Concentrating that knowledge in one person and routing all such work through them was the efficient allocation when the skill was the bottleneck.

**Tools were specialized and numerous.** The ingestion tool, the orchestrator, the transformation framework, the warehouse, the BI tool, and the infrastructure each had their own interface, their own failure modes, and their own operational knowledge. One person holding all of them was unrealistic.

**Coordination through interfaces is a real design.** Conway's law cuts both ways: a team structured around specialties produces systems with specialty-shaped seams, and those seams are sometimes exactly where you want them. A clean contract between ingestion and transformation is not only an organizational artifact.

**Quality assurance through review.** A specialist reviewing another specialist's work in the same domain catches things a generalist does not. Depth is how subtle errors get found.

What went wrong was not the structure but its cost at the margin. A dashboard change that needed a new column became a ticket to the analytics engineer, which became a ticket to the data engineer for the source field, which became a request to the platform team for a pipeline change, which sat in a queue. The work was hours. The latency was weeks. Every handoff carried context loss, and the person who understood why the change was needed was three handoffs from the person making it.

The industry's answer before agents was to reduce handoffs by giving people more range: analytics engineering as a discipline exists because dbt let analysts do work that used to require data engineers. The agentic answer is the same move, further along.

## The Pattern Has Happened Before

The generalist argument sounds novel and is not. The same reorganization has run through adjacent disciplines twice in twenty years, and both times the outcome was more instructive than either the enthusiasts or the skeptics predicted.

**Systems administration to DevOps.** In 2005 a company had system administrators who owned servers and developers who wrote code and threw it over a wall. Configuration management, cloud APIs, and containers collapsed the tooling gap, and the industry reorganized around developers owning their services in production. What actually happened was not the disappearance of infrastructure expertise. It was the emergence of platform engineering: a specialist team building the paved road, and product teams owning their services on top of it. The specialists did not go away. They moved from being in the path of every deploy to being responsible for the system that made deploys safe.

**Separate QA to embedded testing.** Dedicated QA departments that received builds and returned bug reports gave way to developers writing tests and owning quality, with a smaller specialist group focused on test infrastructure, performance, and the hard cases. Again the expertise did not vanish. It concentrated where it was leveraged and left the routine path.

**Analysts to analytics engineering.** Within data itself, dbt let people who knew SQL and the business do transformation work that used to require a data engineer. The specialists did not disappear. They moved toward the platform, the ingestion layer, and the hard performance problems.

The pattern in all three is the same shape: a tooling change lowers the cost of doing work outside your specialty, ownership moves toward the person with the context, and the specialists move from the request path to the platform and to the hard problems. The failures in all three were also the same shape: organizations that read the change as "we need fewer specialists" rather than "specialists do different work" ended up with nobody able to handle the hard cases, and hired them back at a premium two years later.

That history is the strongest reason to expect the agentic reorganization to land where the previous ones did: a platform team, a smaller number of deeper specialists, and domain-aligned owners with more range than their predecessors. It is also the strongest reason to be skeptical of the versions of this argument that predict the specialist's disappearance.

## The Case for Generalists

The argument has four parts.

**Agents collapse the cost of unfamiliar tooling.** The reason one person never held ingestion, transformation, orchestration, and BI at once was that each required fluent command of an interface. An engineer who understands what an incremental model should do can now write one in an unfamiliar dbt adapter, with an agent handling the syntax and the engineer reviewing the semantics. The specialty was partly knowledge of the tool, and that part is now cheap.

**End-to-end ownership removes the latency, not just the effort.** The compounding cost of the handoff structure was waiting. One person who can trace a number from the dashboard back through the model, the pipeline, and the source, and change any of them, closes the loop in an afternoon. That is not a productivity improvement of twenty percent. It is a different response time.

**Context is the scarce resource now.** When producing a pipeline is fast, knowing which pipeline to produce is the constraint. The person who understands the business question, the data's quirks, and the downstream use is the one who makes the right call, and splitting that understanding across four people means nobody has it whole.

**Review shifts from producing to verifying.** Agents produce plausible code quickly, including plausible code that is wrong. The valuable human skill becomes knowing what right looks like: that this join will fan out, that this incremental predicate misses late arrivals, that this partition choice will produce small files. A generalist with that judgment across the stack catches errors at every stage rather than only in their own.

I can speak to the shape of this from my own work, though at a much smaller scale than a company's data platform. I manage my personal websites myself, with AI assistance, doing work that previously required a team of specialists: web developers, copyeditors, graphic designers. The change is not that I acquired those skills. It is that the tooling gap between knowing what I want and producing it has narrowed enough that one person with clear intent can cover ground that used to need several. At scale, what I want is not a return to specialists. It is a team of generalists, each owning additional end-to-end workflows, all pointed at the same goal.

That is the shape of the argument: not fewer people doing the same work, but each person owning a complete workflow rather than a stage of one.

## The Case Against, Taken Seriously

The generalist model has real critics, and their objections are not nostalgia.

**Depth does not compress.** An agent can write a Spark job. It cannot tell you that this particular shuffle is spilling because of a skewed key that appears only in one region's data, or that the query planner is choosing a broadcast because a stale statistic says the table is small. Diagnosing that requires having seen it before, and the people who have seen it before are specialists. Organizations that dissolved their specialists and kept only generalists find out during the first incident nobody can diagnose.

**Agents are worse where the stakes are highest.** Code that is common in training data comes out well. Code that is unusual, that touches a specific version's behavior, or that has to be correct in an edge case comes out plausible and wrong. Those are exactly the situations where a specialist's judgment is irreplaceable, and where a generalist's review is least likely to catch the error.

**Breadth has a ceiling.** One person owning ingestion, transformation, quality, orchestration, and serving for a domain is holding a lot. It works when the domain is small and the systems are stable. As either grows, the generalist becomes a bottleneck with more surface area than any specialist had, and burnout is a documented outcome.

**Specialization is how expertise reproduces.** Junior engineers learn depth by working alongside someone deep. A team of generalists produces generalists, and the pipeline that used to produce the person who can diagnose the shuffle stops running. This is an argument on a longer timescale than most reorganizations consider, and it is the one most likely to be right in five years.

**The evidence is thin.** Claims about agentic productivity are mostly vendor claims and self-reports. The controlled studies that exist show mixed results, including cases where experienced developers using agents were slower than without while believing they were faster. Reorganizing a team around a productivity assumption that has not been measured in your own context is a risk.

The honest synthesis is that the generalist model is a good fit for some work and a bad fit for other work, and that the useful question is which is which.

## What the Work Looks Like Day to Day

Abstract structure arguments are easy to agree with and hard to act on. It helps to describe what a week looks like for someone who owns a workflow end to end, because the difference from the handoff model is concrete.

A request arrives: the finance team needs revenue split by acquisition channel, and the channel is not in the warehouse today. In the handoff structure this becomes a ticket to analytics, which becomes a ticket to data engineering for the source field, which becomes a request to platform for a connector change, and the finance analyst gets an answer in three weeks if the queues are short.

For a workflow owner, the same request is a sequence of steps they take themselves. Check whether the source system exposes the field, which is a question for the producing team and the fastest thing to get wrong by assuming. Add it to the ingestion configuration, which with an agent's help is a config change and a schema evolution in the raw table rather than a connector rewrite. Confirm the column landed, by reading the snapshot summary and the null rate rather than by scanning. Add it to the model, which is a dbt change with tests, run on a branch. Validate against the branch. Publish. Update the semantic layer definition so that "channel" means one thing. Tell finance.

The steps that used to require four people now require one person and four kinds of judgment: is the source field the right one, will the schema change break a consumer, is the model's grain still correct with the new dimension, and does the metric definition match what finance means. None of that judgment is produced by an agent. All of the implementation is faster with one.

The second thing that changes is what happens when something breaks. A number is wrong on the dashboard. The workflow owner reads the model, checks the upstream table's recent snapshots for an anomalous commit, looks at the source's schema history, and finds that a producer changed an enum value last Tuesday. In the handoff structure, that investigation crosses three teams and each one confirms their part is fine before the actual cause is found. This is where end-to-end ownership pays most, and it is also the part that depends most on the person having the range to look in all three places.

The third change is what fills the time that used to be spent implementing. In the teams that have made this shift, the answer is more requests handled, more time on modeling decisions, and more time on the verification and monitoring that a faster-changing system needs. It is not less work. It is different work, weighted toward deciding and checking rather than producing.

## Where the Boundary Should Be

If the unit of ownership is a workflow rather than a stage, defining the workflow is the design decision that matters most.

**A workflow ends at a consumer.** The natural boundary is a set of tables and the things that read them: the domain's data products. Ownership runs from the source through ingestion, modeling, quality, and serving, to the consumer who asked. The owner can answer "why is this number wrong" without a handoff.

**Domains, not technologies.** Owning "all the Spark jobs" is a specialty. Owning "everything about orders data" is a workflow. The second is what gives one person the whole context and the ability to make a change without coordination.

**Sized so one or two people can hold it.** If a workflow needs four people to understand, it is two workflows. The test is whether one person can explain, from memory, where the data comes from, what transforms it, what checks it, and who reads it.

**Platform stays a platform.** The catalog, the storage layout conventions, the orchestrator, the CI, the maintenance jobs, the security model, and the cost controls are shared infrastructure with a real specialist team behind them. Generalists own workflows on top of the platform. They do not each run their own catalog. This is the division that makes the model work, and dissolving the platform team into domain teams is the failure mode that produces five incompatible lakehouses.

**Specialists exist as depth, not as gates.** A small number of people with deep knowledge of the query engine, the table format, the streaming layer, or the security model, available for consultation, on call for hard incidents, and responsible for the standards that generalists follow. They are not in the path of ordinary work, which is what removes the queueing.

The shape that follows is a platform team, a handful of deep specialists, and domain-aligned generalists who own workflows end to end with agent assistance. That is not a radical structure. It is the platform-and-product-team pattern from software engineering, applied to data, with agents making the product-team side viable at a smaller headcount than before.

## What the Lakehouse Contributes

The open lakehouse is what makes end-to-end ownership technically feasible, and it is worth being specific about why, because a team attempting this on a stack with proprietary interfaces at each layer has a harder time.

**One storage layer, many engines.** When the tables are Apache Iceberg on object storage, the ingestion tool, the transformation framework, the query engine, and the notebook all read the same tables. A workflow owner does not move data between systems to move it between stages. The handoff that used to be a pipeline is now a table that both stages read.

**The catalog is the interface between platform and workflow.** A REST catalog gives the platform team a single place to enforce access, vend credentials, apply policies, and run maintenance, and gives workflow owners a single place to create and read tables. The boundary between shared infrastructure and domain ownership is a namespace and a role.

**Metadata makes verification cheap.** Snapshot summaries, manifest statistics, and the metadata tables let one person check whether a pipeline did what it should without reading the data. A generalist who cannot inspect a Spark job's internals can still confirm the commit added the expected rows, produced the expected file sizes, and left no delete files. Verification at the table level is accessible in a way that verification at the engine level is not.

**Branches make changes safe to attempt.** Write-audit-publish means a workflow owner can run a change against production data on a branch, validate it, and publish or drop. The blast radius of a mistake by someone with less depth is bounded by the branch. This matters more in a generalist model than in a specialist one, because it substitutes a mechanical guarantee for the reviewer's expertise.

**Standard interfaces are what agents are good at.** An agent writing SQL against an Iceberg table, or PyIceberg against a REST catalog, is working with interfaces that are documented, open, and well represented in training data. An agent working against a proprietary interface with a small public footprint produces worse output. The openness of the stack is a direct input to how much the agent can do.

None of this is an argument that a lakehouse is required. It is an observation that the structural properties that make end-to-end ownership work, one copy of the data, one governance point, cheap verification, and safe iteration, are the properties an open lakehouse has.

## What Does Not Change

Several things are unaffected by any of this, and treating them as negotiable is where reorganizations go wrong.

**Someone still has to know what the number means.** Whether a metric is defined correctly, whether the join grain is right, whether the filter matches the business question. Agents produce SQL that runs. They do not know that "active customer" excludes trials in this organization.

**Data modeling is still design.** Choosing the grain, the keys, the slowly-changing strategy, and what belongs in a fact versus a dimension is a set of decisions with long consequences. It gets easier to implement and no easier to decide.

**Operational discipline is still operational discipline.** Compaction, retention, cost monitoring, incident response, and on-call do not become optional because the code was written faster. If anything, more code produced faster means more surface to operate.

**Review is more important, not less.** The volume of generated code raises the value of someone checking it. Teams that adopted agents and dropped code review found the failure mode quickly.

**Security and governance are not domain concerns.** Access control, credential handling, personal data, and audit belong to the platform and to a policy that domains follow, not to each workflow owner's judgment.

**Judgment about scope.** Knowing which problems are worth solving, which requests to decline, and when a request signals a modeling problem rather than a query problem. That is the part of the job that has never been the bottleneck and is now the largest share of what a good practitioner contributes.

## Making the Transition

For teams moving toward workflow ownership, the sequencing matters more than the destination.

**Start with one workflow and one owner.** Pick a domain with clear boundaries, a willing owner, and a consumer who will notice the improvement. Give that person end-to-end responsibility, agent tooling, and access to specialists for consultation. Run it for a quarter and measure what actually changed.

**Invest in the platform first.** End-to-end ownership without a solid platform means every workflow owner solving the same infrastructure problems differently. Catalog, CI with a local development stack, standard maintenance, standard access patterns, and templates for common workflow shapes come before the reorganization, not after.

**Make verification the standard practice.** Every workflow asserts on its own outputs: metadata checks on the snapshot, validation on a branch before publish, tests that run in CI. This is what makes a generalist's work trustworthy without a specialist reviewing every line.

**Keep the specialists and change their job.** Move them out of the request queue and into standards, consultation, incident response, and platform work. Tell them explicitly that they are not being deprecated, because they will assume otherwise and the good ones have options.

**Protect the learning path.** Pair generalists with specialists on hard problems specifically so that depth reproduces. Rotate people through the platform team. Without deliberate effort here, the model works for five years and then has no one who can diagnose anything.

**Measure honestly.** Cycle time from request to delivered change, incident rate and time to resolution, cost per workload, and how much of the generated code survives review unchanged. If the numbers do not move, the model is not working in your context, and that is information rather than failure.

**Do not reduce headcount on the assumption.** Teams that cut first and reorganize second discover the productivity claim was optimistic while having removed the capacity to recover.

### Hiring and Growing for This Model

The structure has implications for who gets hired and how people develop, and they are worth stating because a team cannot adopt the model with a hiring profile built for the old one.

**What to hire for.** Range over depth in any single tool, and judgment over recall. The useful signal in an interview is whether a candidate can reason about a system they have not used: given a description of a table format's guarantees, can they predict what a change will do? Can they look at generated code and say what is wrong with it? Whether they have memorized a particular API matters less than it did, and whether they can tell a plausible answer from a correct one matters more.

**Depth still gets hired.** A team needs people who have spent years on query engines, streaming, or the storage layer. The mistake is hiring only for range and discovering during an incident that nobody can go deeper than the abstraction. A reasonable ratio in a mid-sized team is a handful of deep specialists to a larger group of workflow owners, with the platform team drawing from both.

**Junior roles are the hard problem.** The traditional path into data engineering was doing the well-defined implementation work that agents now do faster. If that work disappears, so does the on-ramp, and the pipeline that produces senior engineers stops. Teams that care about this create the on-ramp deliberately: juniors own smaller workflows with more support, pair on incidents, and rotate through the platform team, which is where the depth is. The alternative is a labor market in five years with plenty of people who can prompt and few who can diagnose, which is a problem for everyone and is nobody's individual responsibility to solve.

**Agent fluency is a skill to develop, not to assume.** Using agents well means knowing what to delegate, how to specify, and how to verify. Teams that hand out licenses and expect productivity get uneven results. Teams that treat it as a practice, with shared prompts, reviewed patterns, and honest discussion of where it fails, get better ones.

### Metrics That Tell You Whether It Worked

Reorganizations are usually evaluated by whether people feel better, which is worth knowing and is not evidence. A small set of measures gives an honest answer.

**Cycle time from request to delivered change.** The number the handoff structure was losing on. Measure it as calendar time from the request being made to the consumer having the change, not as engineering hours. If end-to-end ownership is working, this is the number that moves most.

**Handoff count per change.** How many people touched a typical change. This is the mechanism, and it should fall toward one.

**Incidents and time to resolution.** The main risk of the model. If incidents rise or take longer to resolve, the generalists are owning more than they can verify and the specialists have been moved too far from the path.

**Share of generated code that survives review unchanged.** A direct measure of whether agent output is trustworthy in your context. Low numbers mean the review burden is eating the productivity gain.

**Change failure rate.** How often a published change has to be rolled back or corrected. Branch-based validation should keep this low, and a rise says the mechanical safeguards are not covering what specialist review used to.

**Cost per workload.** Faster iteration produces more pipelines, more tables, and more compute. Watching cost per delivered workload catches the case where velocity improved and efficiency collapsed.

**Depth pipeline.** How many people moved from workflow ownership toward specialist depth in the past year. The longest-horizon measure and the one most likely to be ignored until it is a problem.

Baseline these before reorganizing. A team that changes structure without a baseline has an opinion about whether it worked and nothing more.

## Which Model Fits

The answer is contextual, and a few factors predict it.

**Domain complexity.** Straightforward domains with stable sources and clear consumers suit generalist ownership. Domains with regulatory complexity, unusual scale, or deep technical constraints need specialists in the path.

**Scale.** A team of six supporting a company of two hundred is generalists whether or not anyone planned it. A platform team of eighty supporting ten thousand has room for specialization and needs it.

**Stability.** Rapidly changing requirements favor end-to-end ownership because coordination cost dominates. Stable requirements with high reliability demands favor specialization because depth dominates.

**Existing capability.** A team of strong generalists with agent fluency can take on workflow ownership now. A team of deep specialists who have not used agents needs a capability-building period first, and skipping it produces the worst outcome: people owning work they cannot verify.

**Risk tolerance.** The generalist model concentrates more capability in fewer people and depends on mechanical safeguards rather than human review at every stage. Organizations where a bad number is expensive should adopt it more slowly and invest more in the safeguards.

Most organizations end up mixed, with generalist workflow owners for the majority of domains, specialists for the hard ones, and a platform team underneath. That is not a compromise position. It is what the argument, followed carefully, actually produces.

## Where This Is Heading

**Agents as workflow participants rather than tools.** Today an agent writes code that a person runs. The direction is agents that own routine parts of a workflow under supervision: monitoring freshness, proposing compaction, drafting the fix for a failed check. The human's job shifts further toward specification and verification.

**Governance as the constraint on agent scope.** What an agent can do is bounded by what its identity can access. Catalog roles, credential vending, and policy frameworks become the mechanism that makes agent participation safe, which puts the platform team in a more central position rather than a less central one.

**Evaluation as a discipline.** Teams that depend on generated code need to know how good it is in their context, which means evaluation sets, benchmarks against their own systems, and measurement over time. This is a new competency and most teams do not have it.

**Role titles lagging reality.** Job postings still say data engineer, analytics engineer, and data scientist. What the work looks like inside teams that have made this shift is less differentiated than the titles suggest, and the titles will take years to catch up.

**Open standards mattering more.** The more work agents do, the more the quality of that work depends on the interfaces being documented, open, and widely used. That is an argument for open table formats and open catalogs that has nothing to do with vendor lock-in and everything to do with what agents are able to produce.

## Conclusion

The specialist data team was a response to skills being expensive and tools being numerous. Agents changed the first condition more than the second, and the result is that one person with clear intent and good judgment can own more of a workflow than before. The productive structure that follows is a platform team providing shared infrastructure, a small number of deep specialists available for hard problems and standards, and domain-aligned generalists owning workflows end to end.

The counterarguments are real. Depth does not compress, agents fail worst where correctness matters most, breadth has a ceiling, and dissolving specialization stops producing specialists. A team that adopts the generalist model without a platform underneath it, without mechanical verification, and without protecting the path to depth will be worse off than the handoff-heavy structure it replaced.

The version that works keeps the specialists and changes their job, invests in the platform first, makes verification a standard practice rather than a review step, and measures whether any of it helped. That is a less dramatic conclusion than either "AI changes everything" or "nothing has changed," and it is the one the evidence supports.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and on how the platform layer supports the teams building on it. *Architecting an Apache Iceberg Lakehouse* from Manning covers the catalog, governance, and operational foundations that end-to-end ownership depends on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
