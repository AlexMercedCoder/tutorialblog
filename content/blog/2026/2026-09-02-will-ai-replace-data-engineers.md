---
title: "Will AI Replace Data Engineers?"
date: "2026-09-02"
description: "What the evidence shows about whether AI replaces data engineers, which parts of the job compress, and which parts do not."
author: "Alex Merced"
category: "AI & Data"
tags:
  - AI
  - Data Engineering
  - Careers
  - Labor Economics
canonical: https://iceberglakehouse.com/posts/will-ai-replace-data-engineers/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/will-ai-replace-data-engineers/).

The question gets asked in two registers. One is genuine anxiety from people whose careers are in the balance, and it deserves a straight answer rather than reassurance. The other is a headline, usually attached to a vendor's productivity claim or a chief executive's remark about hiring, and it deserves skepticism.

The straight answer, as best the evidence supports it: no, AI is not replacing data engineers as a category, and yes, it is changing what the job consists of in ways that will make some people's current skill mix much less valuable. Both halves are true and the second half is the part worth planning around.

This article works through the argument properly. What data engineers actually spend their time on, which parts of that agents do well and which they do badly, what the evidence on productivity actually shows, how the strongest version of the replacement argument runs and where it is weak, what the labor economics of a technology that makes a skill cheaper have historically looked like, what changes for people entering the field versus people ten years in, and what to do about it. I work at Dremio in developer relations, so my perspective comes from watching how practitioners use these tools rather than from selling them, and I have written a book on AI and labor economics that this article draws on.

## What the Job Actually Is

The replacement argument almost always models data engineering as writing pipelines. Pipeline construction is part of the job. It is not most of it, and the difference is where the argument breaks down.

Survey data and the observable shape of the work put the time somewhere in this range. Building and modifying pipelines is a real share, perhaps a quarter to a third for people in build-heavy roles. Debugging and incident response is comparable and sometimes larger. Data modeling and schema design, deciding grain, keys, and structure, is smaller in hours and disproportionate in consequence. Requirements work, meaning conversations with stakeholders about what they actually need, is a large share for senior people and is often invisible in job descriptions. Operations, cost management, and platform work fill much of the rest. Documentation, review, and mentoring take what is left.

Two observations follow from that breakdown.

The first is that pipeline construction, the part agents are best at, is not the majority of the job for most people in it. Making it three times faster is a meaningful improvement to a third of the work, which is a productivity gain and not an elimination.

The second is that the parts agents are worst at, diagnosing an incident in an unfamiliar system, deciding what a metric means, choosing a model's grain, and figuring out what a stakeholder needs rather than what they asked for, are exactly the parts that carry the most consequence. That is not a coincidence. Those tasks are hard for the same reason they are valuable: they require context that is not in any repository and judgment that cannot be verified by running the code.

## What Agents Do Well

Being specific here is more useful than either enthusiasm or dismissal.

**Boilerplate and translation.** Converting a schema into a table definition, writing a connector configuration, translating a SQL dialect, generating the fiftieth similar dbt model. This is a large volume of real work and agents do it well.

**Working in unfamiliar tools.** Someone who understands what an incremental model should do can write one in a framework they have not used, with the agent supplying syntax. This is the effect that most changes team structure, because it lowers the cost of range.

**Explaining and exploring.** Reading an unfamiliar codebase, summarizing what a pipeline does, tracing a query's logic. Agents are good at this and it accelerates onboarding and investigation meaningfully.

**First drafts of tests and documentation.** Both are chronically under-produced because they are tedious. A generated first draft that a human corrects produces more of both than the status quo.

**Routine debugging with a clear error.** A stack trace, a failed assertion, a syntax error. Agents resolve these quickly.

**Scaffolding.** New projects, new services, standard structures. The blank page is expensive and agents remove it.

## What Agents Do Badly

**Debugging without a clear error.** The number is wrong and nothing failed. This requires forming hypotheses about a system's actual behavior, checking them against evidence spread across several systems, and knowing what normal looks like. It is the hardest part of the job and agents are weakest at it.

**Anything requiring organizational context.** What "active customer" means here, why this table has a quirk from a 2019 migration, which stakeholder actually decides, and why the previous attempt at this failed. None of it is written down and all of it determines whether the work is right.

**Correctness in unusual cases.** Agents produce code shaped like code that works. Where the situation is common, that code works. Where it is unusual, a specific version's behavior, an edge case in a format, a subtle concurrency issue, it produces something plausible and wrong. Those are exactly the cases where wrong is expensive.

**Knowing when a request is the wrong request.** A stakeholder asks for a column. The right answer is that the model's grain is wrong and the column is a symptom. An agent adds the column.

**Long-horizon consequences.** Whether this partition choice will hurt in two years, whether this schema decision creates a migration nobody will want to do, whether this dependency is worth taking on. Judgment across time is not what these systems are optimized for.

**Verification of their own output.** The most important limitation. An agent that produces wrong code does not know it is wrong, and cannot be relied on to check. Verification stays a human responsibility, and the volume of generated code makes it a larger one.

## What the Evidence Actually Shows

This is where the discussion usually goes wrong, because the loudest numbers are the least reliable.

Vendor-reported productivity figures are marketing. They measure what the vendor chose to measure, in conditions the vendor selected, and they are not evidence about your team.

Self-reported productivity is unreliable in a specific and well-documented way. A controlled study by METR in 2025 gave experienced open-source developers AI tools on their own repositories and found that they took longer to complete tasks with the tools than without, while reporting that they had been faster. The size and direction of that gap between perception and measurement is the single most useful piece of evidence in this whole discussion, and it should make everyone more cautious about claims of transformation based on how the work feels.

The broader research picture is genuinely mixed. Some studies find substantial gains, concentrated among less experienced workers on well-defined tasks. Others find smaller gains or none, particularly for experienced practitioners on complex work in familiar codebases. Studies of code quality find increases in duplication and in code that passes review but needs rework. The reasonable summary is that the effect is real, highly variable by task and by experience, and smaller in aggregate than the discourse suggests.

Labor market evidence is similarly unsettled. Demand for data engineering roles has softened alongside general technology-sector softening that has more obvious causes: interest rates, post-pandemic correction, and cost discipline. Disentangling an AI effect from that is not something anyone has done convincingly. Reports of reduced entry-level hiring in software are real and have multiple plausible explanations. Anyone claiming a clean causal read on this is overstating what the data supports.

The most defensible position is that the technology is a real productivity input with wide variance, that the labor market effects are confounded with a broader correction, and that confident predictions in either direction are not supported.

## The Strongest Version of the Replacement Argument

The case deserves to be made at its best rather than dismissed.

It runs like this. Capability has improved faster than most people predicted, and the trend has not obviously plateaued. Agents that write pipelines today are the least capable agents that will ever exist. The parts of the job that seem safe, judgment and context, are not magic: organizational context can be documented and retrieved, and judgment is pattern recognition over experience that a sufficiently capable system can acquire. The historical analogy people reach for, that automation created more jobs than it destroyed, describes technologies that automated physical labor and complemented cognitive labor. A technology that automates cognitive labor is a different case and the analogy is doing less work than it appears to. And organizations do not need agents to be as good as engineers. They need them to be good enough that fewer engineers are required, which is a much lower bar.

The strongest specific version is about entry-level work. The tasks juniors did to become seniors are the tasks agents do best. If the on-ramp closes, the field does not lose its seniors immediately, but it stops producing new ones, and the profession shrinks by attrition over a decade rather than by layoffs next quarter.

That last point is the part of the argument I find most persuasive, and it is the one that gets the least attention.

## Where That Argument Is Weak

**The demand side.** The number of data engineers an organization employs is not a fixed quantity of work divided by productivity. It is a function of how much data work is worth doing at the prevailing cost. Lower the cost and more work becomes worth doing: more sources integrated, more domains modeled, more quality checks, more use cases attempted. Whether employment rises or falls depends on how elastic that demand is, and for data work, where the backlog at most organizations vastly exceeds capacity, there is reason to think it is quite elastic. This is an empirical question rather than a settled one, and the backlog is the strongest reason for optimism.

**Verification does not scale down.** More generated code means more code to verify, and verification requires the understanding that producing the code used to build. An organization with three engineers producing what ten used to produce needs those three to understand more, not less. That is a different job, not a smaller one.

**Systems get more complex, not less.** Faster production produces more pipelines, more tables, more dependencies, and more operational surface. The operational half of the job grows with the output, and agents are worse at operations than at construction.

**Responsibility does not transfer.** When a number is wrong in a regulatory filing, someone is accountable. Organizations do not accept "the agent wrote it" and the person accountable has to understand it. This is a durable source of demand for people who understand systems, independent of who typed the code.

**The plateau is unknown in both directions.** The argument that capability will keep improving at the current rate is an extrapolation, and extrapolations of technology curves have been wrong in both directions repeatedly. Planning as though the current trajectory continues indefinitely is as unjustified as planning as though it stops tomorrow.

## The Economics Underneath the Question

The question "will AI replace data engineers" is a labor economics question wearing a technology costume, and the framework economists use for it is worth borrowing because it makes the disagreement precise.

When a technology makes a task cheaper, three forces act on employment in the occupations that perform that task, and the net effect depends on which dominates.

**The displacement effect.** Fewer workers are needed for the same output. If an organization needed ten engineers to produce its current pipelines and now needs seven, three jobs are displaced. This is the effect the replacement argument focuses on and it is real.

**The productivity effect.** Cheaper output means more output is demanded. How much more depends on the price elasticity of demand for the thing being produced. Where demand is elastic, meaning people want much more of it at a lower price, total employment can rise even as the per-unit labor requirement falls. This is what happened with software: cheaper software production led to vastly more software. Where demand is inelastic, meaning there is a fixed amount worth having, the displacement effect wins. This is what happened with agricultural labor: cheaper food production did not lead to people eating proportionally more.

**The reinstatement effect.** New tasks appear that did not exist before, and they require labor. Every wave of automation has created work that was not previously possible or not previously worth doing. The governance of agent access, the evaluation of generated output, and the platform work that makes agent-produced code safe are examples in this case, and they are new tasks that did not exist three years ago.

The disagreement about data engineering is really a disagreement about elasticity. If you believe the backlog of data work at a typical organization is enormous, that lowering the cost of doing it means much more of it gets done, and that new categories of work appear as capability grows, you get the software analogy and employment rises. If you believe organizations have a roughly fixed appetite for data work and the constraint has been cost, you get the displacement case and employment falls.

My read is that the backlog is the strongest evidence available, and it points toward elastic demand. Data teams routinely report more requests than capacity, a list of sources they have not integrated, quality checks they have not built, and domains they have not modeled. That is the signature of demand held back by cost. It is not proof, and it is the specific claim on which the optimistic case rests, so it is the claim worth arguing about rather than the general question.

The distributional point matters separately from the aggregate one. Even in the scenarios where total employment rises, the composition changes, and the people whose skills were concentrated in the displaced tasks bear the cost. Aggregate employment recovering is cold comfort to someone whose specific role went away. Both things can be true, and analyses that emphasize one to dismiss the other are doing politics rather than economics.

## What History Does and Does Not Tell Us

The analogies get deployed carelessly on both sides, so it is worth being precise about what they support.

Spreadsheets are the case most often cited. VisiCalc and its successors automated the core task of bookkeeping, and bookkeeping employment declined substantially over the following decades. Accounting and auditing employment grew. The task was automated and the profession reorganized upward: fewer people doing arithmetic, more people doing analysis that the arithmetic made cheap. The lesson is not "automation creates jobs." It is that automating the routine core of a profession can grow the profession while destroying a specific role within it, and that the people who were doing the routine core had to move or leave.

Compilers are the case for the optimistic reading. Assembly programmers were the specialists, and high-level languages automated what they did. Programming employment grew by orders of magnitude, because lowering the cost of software made vastly more software worth writing. If data work's demand is as elastic as software's was, this is the analogy that holds.

ATMs are the case that complicates both. Automating the teller's core task reduced tellers per branch, which made branches cheaper, which led banks to open more branches, which kept total teller employment roughly flat for two decades before other forces reduced it. The composition of the job changed from cash handling to sales and service. This is the pattern where the job survives and becomes a different job, which is the pattern I think is most likely here.

What none of these settle is whether cognitive automation behaves like the previous cases. The honest position is that the historical record supports "professions reorganize and specific roles disappear" much better than it supports either "employment always recovers" or "this time is different." Both of those are claims about the future that the past does not establish.

## The Lakehouse Angle: What Changes in This Specific Domain

Data engineering is a broad field and the answer differs by what part of it someone works in. For people whose work centers on a lakehouse, a few specifics are worth naming.

**Table format expertise is the kind of depth that holds.** Knowing why a merge-on-read table degrades without compaction, what a bad partition choice costs at scale, how field IDs make schema evolution safe, and what a snapshot summary tells you about a failed load is knowledge about system behavior rather than about an API. Agents reproduce the API calls. They do not reliably predict the behavior, and the behavior is what determines whether a design works in two years.

**Verification is unusually well supported here, which cuts both ways.** Iceberg's metadata tables mean a person can check what a pipeline actually did without reading the data: row counts, file sizes, delete file counts, operation types, and partition coverage are all queryable. That makes it feasible for one person to verify a larger volume of generated work, which supports the productivity case. It also raises the bar for what counts as competent: someone who does not check is now visibly not checking.

**Branches lower the cost of being wrong.** Write-audit-publish means a change that a person is less certain about can be run against real data and validated before anyone sees it. In a world where more code is produced faster by people with less depth in the specific area, mechanical safeguards substitute for the review that used to catch it. Teams that adopt agent-assisted development without adopting branch-based validation are removing a check without adding one.

**Open interfaces are what agents are good with.** SQL against an Iceberg table, PyIceberg against a REST catalog, and dbt against a standard adapter are documented, open, and well represented in what these models learned from. Proprietary interfaces with small public footprints produce worse output. That is an argument for open formats that is separate from the usual lock-in argument, and it will get stronger as more work is agent-assisted.

**The operational half grows.** Faster production means more tables, more pipelines, more snapshots, and more maintenance. Compaction, retention, cost, and incident response scale with the output and are the parts agents help with least. The share of a lakehouse engineer's time spent on operations is likely to go up, not down.

The net for this specialty is that the balance shifts toward understanding the systems and away from producing the code, which is a direction that favors people who were already inclined that way and disadvantages people whose value was fluency in a particular framework.

## Different Answers for Different Careers

The question has a different answer depending on where someone is standing.

**Entering the field.** This is the hardest position and the one where the concern is most justified. The tasks that used to be a junior's first two years are the tasks agents do well, and entry-level hiring in adjacent fields has visibly tightened. The response that makes sense is to build the things agents are bad at earlier than previous generations had to: systems understanding rather than syntax, debugging without a clear error, and the ability to tell correct output from plausible output. Working on something real and complete, where you own the outcome, teaches this faster than tutorials. The path is narrower than it was and it is not closed.

**Two to five years in.** The most exposed group in the short run, because a large share of the work is implementation that agents accelerate. The move is toward the parts that do not compress: owning a domain end to end, taking on operations and incident response, getting into modeling decisions and stakeholder conversations. The skill to build deliberately is verification, knowing what right looks like well enough to catch a plausible wrong answer, because that is the scarce complement to cheap production.

**Senior and staff.** The best positioned, because the job was already mostly judgment, design, and dealing with ambiguity. The risk is complacency about tooling: a senior engineer who does not develop fluency with agents will be outproduced by one who does, on the implementation portion, and the gap compounds. The opportunity is that agents remove the implementation constraint on ideas that used to be too expensive to try.

**Management and platform.** Demand here holds up well, because someone has to decide what to build, how to govern what agents produce, and how to keep systems reliable at higher change rates. Governance of agent access, evaluation of agent output, and platform work that makes generated code safe are growth areas.

**People whose value is a specific tool.** The most exposed group of all, across seniority. If the thing you are hired for is knowing one framework's API well, the agent knows it too. The value was never really the API, and this is the moment that becomes obvious.

## What Organizations Are Actually Doing

Separating what companies say from what they do is useful here, because the public statements and the observable behavior diverge.

The public statements are mostly about hiring restraint attributed to AI. Some of that is real. Some of it is cost discipline finding a more palatable explanation than "we over-hired in 2021 and rates went up." Executives have incentives to attribute headcount decisions to a technology narrative that markets reward, and analysts should discount accordingly.

The observable behavior is more mixed. Teams are adopting agent tooling broadly, and the adoption is genuine. Teams are also discovering that the adoption requires investment they did not budget: evaluation of output quality, revised review practices, governance for what agents can access, and platform work to make generated code safe to run. Several of the organizations furthest along report that their engineering headcount did not fall and their output rose, which is the elastic-demand case playing out. Others report a hiring freeze at the entry level with senior hiring continuing, which is the on-ramp concern playing out.

A pattern worth watching is that the roles growing fastest around this are not "prompt engineer." They are platform and governance roles: people who build the paved road that makes agent-produced work safe, who own the evaluation of what agents produce, and who manage what agent identities can access. If there is a clear demand signal in the current market, it is there rather than in the roles the headlines describe.

The other pattern is that organizations are bad at measuring this. Very few have baselined cycle time, change failure rate, or review burden before adopting these tools, which means very few can say whether the adoption helped. Teams making structural decisions on unmeasured productivity assumptions are the most common failure mode in the current moment, and it is a failure mode with a straightforward fix.

### The Adjacent Roles

Data engineering does not exist alone, and the answer for neighboring roles differs in ways that are worth noting because people move between them.

**Analysts** face the most direct exposure on the task level, since natural-language-to-SQL is one of the applications these systems handle best, and it removes the gatekeeping function that a lot of analyst work consisted of. The analyst work that holds is knowing which question to ask, whether the answer is plausible, and what a stakeholder should do about it. Analysts whose value was writing SQL nobody else on the team knew how to write are in the same position as engineers whose value was framework fluency.

**Analytics engineers** sit closest to the shift described in this article. The role exists because dbt lowered the barrier between analysis and engineering, and agents lower it further in both directions. The likely outcome is that the role's boundaries expand rather than that the role disappears.

**Data scientists** have a bifurcated picture. The applied end, feature engineering and standard model fitting, is heavily assisted by these tools. The research end, problem formulation and knowing whether a result means anything, is not. The gap between those two ends of the role is widening.

**Machine learning and platform engineers** are in the strongest position, because the work is building and operating the systems that make all of this run, and there is more of it than before.

**Governance, security, and privacy roles** are growing for a straightforward reason: agents accessing data systems is a new access-control problem, and someone has to solve it. This is the clearest example of the reinstatement effect in the current moment.

The mobility between these roles is high and getting higher, which is itself a consequence of the tooling change. Someone whose current role is exposed has more paths out of it than a decade ago, and the paths run toward judgment, ownership, and system understanding in every case.

## What to Do

The advice that follows from all of this is unglamorous.

**Use the tools seriously and measure honestly.** Not the vendor's numbers and not your feeling about it. Time your own work with and without, on real tasks, and find out what is actually true in your context. The METR result exists because people's perceptions of their own speedup were unreliable, and there is no reason to think anyone is exempt from that.

**Build verification skill deliberately.** Read generated code critically. Learn what the systems actually do, not just what the API calls are named. The person who can tell plausible from correct is the person whose judgment is load-bearing.

**Own outcomes, not tasks.** The unit of value is a working system that a consumer relies on, not a piece of code. Ownership of an outcome requires the context, the judgment, and the accountability that do not transfer.

**Go deep on something that does not compress.** The table format's actual behavior, the query engine's execution model, the domain's business logic, the failure modes of streaming systems. Depth in fundamentals ages better than depth in interfaces.

**Get better at the conversations.** Requirements, tradeoffs, telling a stakeholder that their request is a symptom of a modeling problem. This has always been the skill with the widest effect and it is now a larger share of what is left.

**Do not compete on volume.** Producing more code faster is the axis where you lose. Producing the right thing, verified, is the axis where you do not.

**Keep perspective about the timeline.** Whatever happens will happen over years, through changes in what work looks like, not through an announcement. Career decisions made in a panic about a hypothetical are usually worse than decisions made from a clear read of what is actually changing.

## Conclusion

Will AI replace data engineers? Not as a category, on any evidence currently available. The job is not mostly pipeline construction, the parts agents do worst are the parts that carry the most consequence, verification does not scale down, systems get more complex as output increases, and accountability does not transfer to a model. The demand side matters too: at most organizations the backlog of data work vastly exceeds the capacity to do it, and lowering the cost of doing it plausibly increases how much gets done.

What is changing is the composition of the job, and that change is real enough to plan around. The implementation share shrinks. The judgment, verification, operations, and requirements shares grow. People whose value was fluency in a specific tool will feel this most. People entering the field face a narrower on-ramp than their predecessors and have to build systems judgment earlier. And the risk that deserves more attention than it gets is not mass replacement but a quiet failure to reproduce expertise, where the tasks that made juniors into seniors disappear and the profession thins by attrition over a decade.

The evidence does not support confident prediction in either direction, and anyone offering one is selling something. What it does support is a clear view of which parts of the work are compressing and which are not, and a personal and organizational strategy built on the second category.

## Keep Going

If this piece was useful, I have written a book specifically about AI and labor economics, working through how technologies that make skills cheaper have historically affected employment, wages, and the structure of work, and what that framework suggests about this one. You can find it at [https://a.co/d/06SeOKw8](https://a.co/d/06SeOKw8). Every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, is at [books.alexmerced.com](https://books.alexmerced.com).
