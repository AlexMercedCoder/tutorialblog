---
title: "Federating Oracle With an Open Lakehouse Instead of Migrating It"
date: "2026-07-28"
description: "Federate first so analytics work now, migrate what benefits from migrating, and leave the rest where it is indefinitely. Here's how pushdown and view layers make it work."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Oracle
  - Data Federation
  - Lakehouse
canonical: "https://iceberglakehouse.com/posts/oracle-lakehouse-federation/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/oracle-lakehouse-federation/).

# Federating Oracle With an Open Lakehouse Instead of Migrating It

A team is eighteen months into moving reporting off Oracle. Forty percent of the tables are in Iceberg. The remaining sixty percent are the hard ones: schemas nobody fully understands, tables with triggers, and three that a compliance process depends on in ways documented only in a 2014 email.

Meanwhile every analytical question spanning both halves requires either a nightly export or a manual join, and the business has stopped believing the migration will finish.

This is the normal shape of a warehouse migration, and the assumption underneath it is the problem. The plan treated migration as a prerequisite for analytics, so no value arrives until it completes, and completion keeps receding because the last twenty percent is where all the difficulty lives.

There is a different sequencing. Federate first so the analytics work now, migrate what benefits from migrating, and leave the rest where it is indefinitely.

I work at Dremio, which sells query federation, so I have a direct commercial interest in this argument. That is worth knowing while reading it. The federation pattern is implementable with several engines and the reasoning does not depend on which.

This piece covers what federation does and does not solve, when a table should actually move, the mechanics of pushdown that determine whether federated queries are fast or terrible, how to sequence the work, and where this approach fails.

## Why the migration-first plan stalls

Warehouse migrations follow a predictable curve. The first tables move quickly because they are simple: clean schemas, batch loads, well-understood consumers. Momentum builds. Then it stops.

What remains is remaining for reasons.

**Unknown consumers.** A table has forty downstream dependencies and the inventory lists twelve. Moving it breaks things nobody predicted, so it does not move. Discovering the other twenty-eight requires either instrumenting every access path for months or breaking things and seeing who complains, and neither is a plan anyone wants to sign off on.

**Logic in the database.** Stored procedures, triggers, views with embedded business rules, and constraints doing validation. Migrating the data is easy. Migrating the behavior means reimplementing it somewhere, and reimplementing logic nobody fully understands is how you introduce subtle wrongness that surfaces a quarter later in a number nobody can explain.

**Operational coupling.** The table is written by an application that also reads it transactionally. It is not really a warehouse table, it is an operational one that reporting happens to use, and the migration plan quietly assumed otherwise.

**Regulatory attachment.** A validated system where changes require requalification. The cost of moving is not technical, and no amount of engineering elegance reduces it.

**Genuine transactional need.** Some workloads want a row-store with indexes and short transactions. A lakehouse is not that, and forcing it to be produces a bad version of both. This category is frequently misidentified as a migration problem when it is a fit problem, and no amount of effort makes the migration succeed.

Only the first two are migration candidates given enough effort. The last three are reasons a table stays where it is permanently, and treating them as scheduling problems rather than as constraints is what keeps the plan open-ended.

So a plan whose value depends on finishing is a plan that does not deliver. Federation inverts it: the analytical capability arrives first, and migration becomes an optimization applied where it pays rather than a prerequisite.

The two sequencings differ in when value arrives and in what happens if you stop.

| | Migration-first | Federation-first |
|---|---|---|
| First cross-system analytics | On completion | Week one |
| Value if the program stops early | None | Proportional to what was built |
| Consumer coordination cost | Once per table migrated | Once, at the view layer |
| Load added to the source | None | Real, needs managing |
| Oracle license reduction | On completion | On selective migration later |
| End state | Everything moved | A deliberate split |

The row that decides it is the second one. A migration halted at forty percent delivered nothing. A federation deployment where forty percent migrated and the rest stayed is a working architecture that someone chose.

## What federation actually does

Query federation means a query engine reads from multiple sources in one query, pushing work to each source and combining results.

Concretely, a single query joins an Iceberg table on object storage against a table in Oracle. The engine plans across both, sends a filtered and projected query to Oracle, reads the Iceberg side directly, and joins.

What that buys:

**Analytics spanning both halves, today.** The join that previously required an export works as a query. This is the entire point and it arrives in days rather than quarters.

**No pipeline for the joined view.** An ETL job existing only to copy Oracle data so it can be joined with lakehouse data stops being necessary. That is a pipeline deleted, along with its failures, its lag, and its ownership.

**Consumers decoupled from physical location.** A dashboard queries a view. Whether that view reads Oracle or Iceberg is a detail behind it. When a table eventually migrates, the view changes and the dashboard does not.

That last property is the strategically important one and it is routinely missed. Federation is not only a way to avoid migrating. It is the mechanism that makes migration invisible to consumers when it does happen, which removes the coordination cost that makes migration slow.

What federation does not do:

**It does not make Oracle fast.** A query scanning a hundred million rows in Oracle takes what Oracle takes. Federation adds no capability the source lacks, and a query that was slow when written directly against the source is slow when written against a federated view over it. Teams sometimes expect the analytical engine to compensate for the source's characteristics, and it cannot: the work happens where the data is.

**It does not remove operational load from the source.** Federated queries are queries against Oracle, consuming its CPU and its connections. A system already at capacity does not gain headroom from being federated. If anything it gains load, because analytical access that previously ran once nightly as an export now runs whenever someone opens a dashboard. Plan for that shift explicitly rather than discovering it in the first busy week.

**It does not fix schema or semantic differences.** Two systems with different definitions of customer remain a modeling problem.

**It does not replace the license.** Oracle still runs and still costs what it costs. Cost reduction comes from migration, not from federation, and it arrives only when enough workload has actually shifted that you can downsize or decommission something.

Being clear about that last one matters, because federation is sometimes sold as a cost play. It is a capability and time-to-value play. The cost reduction comes later, from the migrations federation makes safe.

## Pushdown decides everything

Whether a federated query is fast or unusable comes down to pushdown, and understanding it is the difference between this working and this being an embarrassment.

When a query touches a remote source, the engine decides how much work to delegate. Best case it sends a query returning few rows. Worst case it pulls the whole table across the network and does everything locally.

Four things push down, in rough order of value.

**Predicates.** A filter applied at the source means fewer rows cross the network. `WHERE order_date >= DATE '2026-07-01'` executed in Oracle against an indexed column returns thousands instead of millions.

**Projections.** Only the requested columns. A query touching four columns of a sixty-column table transfers four.

**Aggregations.** A `SUM ... GROUP BY` executed at the source returns one row per group instead of every underlying row. On analytical queries this is frequently a reduction of several orders of magnitude.

**Joins.** Joins between two tables in the same source execute there. Joins across sources cannot push down and are where the data movement happens.

The cross-source join is the case that needs design attention, because one side has to move. A good engine moves the smaller side, which means it needs cardinality estimates for both. Where the estimates are wrong or unavailable, it moves the wrong side and the query takes an hour.

Three practices keep this healthy.

**Read the plan.** Every engine exposes the execution plan and shows what was pushed. Read it for your important federated queries. The plan tells you whether a filter reached the source or whether the engine is pulling everything and filtering locally. This takes two minutes per view and it is the single highest-value habit in federated work, because the difference between the two behaviors is invisible in the result and enormous in the cost.

**Keep statistics current on the source.** Oracle's optimizer statistics inform both Oracle's own plan and, through the connector, the federating engine's estimates. Stale statistics on a large table produce bad decisions on both sides. This is ordinary Oracle hygiene and it is frequently neglected on tables that stopped being actively developed.

**Shape queries so the small side is small.** A cross-source join filtered heavily on the lakehouse side transfers little. The same join with the filter on the Oracle side and nothing on the lakehouse side transfers a lot. This is within your control when you write the view.

```sql
-- Shape matters more than syntax. This join sends a filtered, aggregated
-- query to Oracle and reads a pruned partition set from Iceberg.
SELECT
    i.region,
    i.product_category,
    sum(i.net_revenue_usd)  AS revenue_usd,
    max(o.credit_limit)     AS credit_limit
FROM lakehouse.gold.order_lines i
JOIN oracle_erp.finance.customer_credit o
  ON i.customer_id = o.customer_id
WHERE i.order_date >= DATE '2026-07-01'          -- prunes Iceberg partitions
  AND o.credit_status = 'ACTIVE'                 -- pushes into Oracle
  AND o.region_code IN ('EU', 'NA')              -- pushes into Oracle
GROUP BY 1, 2;
```

Both filters on the Oracle side push down, so the source returns active customers in two regions rather than the full credit table. The Iceberg side prunes to one month of partitions. The join operates on two small inputs.

Remove those Oracle-side predicates and the same query pulls the entire credit table across the network on every execution.

## The connection mechanics

The setup details matter more than the architectural argument, because this is where deployments go wrong quietly.

**Use a dedicated account with a resource profile.** Not the application's account, not a DBA account. A read-only account with grants only on the tables federation touches, and an Oracle resource profile capping CPU per call and per session.

That profile is the safety mechanism. Without it, one badly shaped analytical query consumes the source's capacity, and the transactional application that shares it degrades. With it, the query gets killed and only the analyst notices.

**Set connection pooling deliberately on both sides.** An analytical engine parallelizes, so one user query becomes several concurrent source connections. Multiply by concurrent users and you exceed what Oracle expects. Configure the engine's pool with a hard ceiling below the source's limit, and configure it as a shared pool rather than per query.

**Decide how identity propagates.** Two models, and they suit different governance postures.

A single service account means all federated queries appear to Oracle as one identity. Simple, and Oracle's own audit shows nothing about who asked. Attribution has to come from the engine's logs.

Identity propagation, where the querying user's identity reaches the source, gives you source-side audit and source-side row-level security if Oracle enforces any. It requires more setup and it is the right answer where Oracle already carries access controls you rely on.

The wrong answer is a service account plus an assumption that the engine's permissions are sufficient, without checking whether Oracle was enforcing something the engine does not know about. Verify what access controls exist on the source before routing around them.

**Handle the network path explicitly.** Federated queries move data, and if the engine and the database are in different networks or different clouds, that movement crosses a boundary with latency and possibly egress charges. Measure the throughput between them before designing anything that depends on moving significant volume.

**Test failure behavior.** Oracle goes down for maintenance. What happens to a query touching both sources? A good outcome is a clear error naming the unavailable source. A bad outcome is a hanging query holding engine resources until a timeout you never configured. Set timeouts, and verify the behavior rather than assuming it.

## The view layer is the actual deliverable

The step people rush is the one that determines whether this works over years rather than weeks.

Federation gives you the ability to query across sources. A view layer gives you a stable interface that hides which source anything came from. Those are different things, and only the second one makes migration invisible.

Concretely, the layer has three properties.

**Physical location never appears in a consumer's query.** A dashboard queries `analytics.sales.orders_enriched`. It does not know that half of it is Oracle. When that half migrates, the view definition changes and the dashboard does not.

**Business logic lives in the view, once.** Filters, joins, derived measures, and naming. If a metric is computed in six dashboards, it is computed six ways eventually. Computed in the view, it is computed once and every consumer inherits it.

**The view is where the two sources get reconciled.** Type differences, null semantics, naming conventions, and unit differences between Oracle and the lakehouse resolve here rather than in each consumer.

```sql
CREATE OR REPLACE VIEW analytics.sales.orders_enriched AS
SELECT
    i.order_id,
    i.customer_id,
    i.order_date,
    i.net_revenue_usd,
    -- Oracle stores region codes; the lakehouse uses names. Reconcile here.
    coalesce(r.region_name, 'UNKNOWN')                      AS region_name,
    -- Oracle treats empty string as null. Normalize so joins behave.
    nullif(trim(o.credit_status), '')                       AS credit_status,
    -- Oracle NUMBER to a defined precision, once, not per consumer
    cast(o.credit_limit AS decimal(18, 2))                  AS credit_limit_usd
FROM lakehouse.gold.order_lines i
LEFT JOIN oracle_erp.finance.customer_credit o
  ON i.customer_id = o.customer_id
LEFT JOIN lakehouse.ref.regions r
  ON o.region_code = r.region_code
WHERE i.order_status <> 'CANCELLED';
```

Three reconciliations in one place, each of which is a bug waiting to happen if left to consumers. The empty-string normalization in particular is the kind of thing that silently drops rows from a join and takes a week to diagnose.

Note the `LEFT JOIN` on the Oracle side. An inner join drops lakehouse orders whose customer has no credit record, quietly reducing revenue totals. This is the single most common correctness error in cross-source views, and the decision between inner and left is a business question rather than a technical one. Ask it explicitly.

Document each view with what it covers, what it excludes, and its freshness. Consumers, including automated ones, act on what a view claims to be, and a view whose description drifted from its definition is worse than one with no description.

## Caching and materialization

Federation with no caching means every query hits Oracle. For an exploratory dashboard refreshed by twenty analysts, that is load the source did not previously carry and load it frequently cannot absorb.

The resolution is materialization: precompute the federated result and serve queries from it.

The general pattern, independent of product: define a view over the federated join, materialize it on a schedule matching how fresh the data needs to be, and let queries hit the materialization. Oracle sees one query per refresh instead of one per user query.

Dremio does this through Autonomous Reflections, which create and manage materializations from observed query patterns. Other engines expose materialized views you define explicitly. The mechanism differs and the principle does not.

Two design decisions matter.

**Refresh cadence from the freshness requirement, not from habit.** Credit limits that change weekly do not need a fifteen-minute refresh. Ask what staleness the use case tolerates and set the cadence there. Every increment of freshness is load on the source.

**Materialize the joined result, not each side.** Materializing the Oracle table alone means you have rebuilt the export pipeline you were trying to delete. Materializing the joined and aggregated result is smaller and serves the actual queries.

There is a legitimate exception. A dimension table small and stable enough to copy, joined constantly, is worth caching as a whole. That is a copy, and it is worth being deliberate about the distinction rather than sliding into a pipeline you did not decide to build.

## Deciding what actually moves

With federation working, migration becomes a table-by-table decision on merits rather than a program. Five signals that a table should move.

**Query volume against it is high.** Every federated query loads Oracle. A table queried constantly is paying that cost repeatedly, and moving it converts recurring load into a one-time migration.

**Its analytical access pattern is a poor fit for a row store.** Full scans with aggregation over many rows is what columnar storage is for. Oracle does it and pays a lot more for it.

**It is append-mostly.** Tables that accumulate history with few updates map cleanly onto Iceberg. Tables with heavy in-place updates are more work and benefit less.

**Consumers are analytical only.** No transactional writer, no application depending on row-level locking. This is the property that makes migration safe rather than merely beneficial.

**Its logic is in pipelines, not in the database.** A table populated by an ETL job redirects easily. One maintained by triggers and stored procedures requires reimplementing behavior.

Five signals it stays:

Regulatory validation attached to the system. Transactional writers. Logic embedded in database objects nobody has fully mapped. Low query volume, where the migration effort has no payback. And genuine operational use, where the table is not really a warehouse table at all.

The useful output of this analysis is a written list in three buckets: migrate soon, migrate eventually, stays permanently. That third bucket is the one people resist writing down, and naming it is what converts an indefinite migration program into a finite one.

## Sequencing the work

An order that produces value early and keeps the option to stop.

**Week one: stand up federation and prove one join.** One connection, one query spanning both sources, returning correct results. This is a day of work and it makes the rest concrete.

**Weeks two to four: build the views consumers use.** Define a semantic layer over both sources. Consumers query views, never physical tables. This is the step that decouples them from location, and it is what makes every later migration invisible.

Do not skip this to move faster. A consumer pointed at a physical Oracle table has to change when that table migrates, and coordinating those changes across dozens of consumers is precisely the cost that makes migration slow.

**Month two: measure the load federation puts on Oracle.** Query counts, execution times, connection usage. If federated queries are stressing the source, add materialization before adding users.

**Month two onward: migrate on the merits.** Take the high-volume, analytically-shaped, append-mostly tables first. Each migration changes a view definition and no consumer notices.

**Ongoing: revisit the permanent bucket annually.** Systems get decommissioned and constraints change. A table that was immovable in 2026 sometimes moves easily in 2028.

The property this sequence preserves: at every point you have a working system, and stopping is a legitimate outcome. A migration program stopped at forty percent is a failure. A federation deployment where sixty percent of tables stayed in Oracle is a design.

## Federated sources and automated consumers

Worth a section because it changes the calculus, and most federation designs predate it.

An analytics agent pointed at a federated view layer has a specific advantage: it sees one namespace covering the whole estate rather than needing to know which system holds what. That is genuinely useful and it removes a class of failure where a model picks the wrong source.

It also introduces risks specific to automated querying.

**Query volume is unpredictable.** A human analyst runs a federated query occasionally. An agent runs one whenever a user asks something. If the underlying source is a production Oracle instance, that variability lands on a system sized for a known workload.

**Exploratory queries lack filters.** The pushdown discipline described earlier depends on queries carrying source-side predicates. An agent that does not know a table is remote writes a query with no Oracle-side filter and pulls the table. This is the failure that generates an incident rather than a slow dashboard.

**Retries multiply.** An agent framework retries a failed query. A federated query failing because Oracle was busy gets retried into a busier Oracle.

Three mitigations.

**Point agents at materializations, not at live federated views.** The materialization has the same semantics and no source load. Freshness is bounded by the refresh cadence, which is usually acceptable for analytical questions and always preferable to an unbounded load on a transactional system.

**Make remoteness visible in the metadata the agent reads.** A view description stating that this data comes from a transactional source and queries against it should be date-bounded gives a model something to reason with. It is not a control and it reduces the accident rate.

**Enforce it as a permission.** The actual control is that the agent's principal has grants on materialized views and not on the live federated views. A capability the agent lacks cannot be triggered by a persuasive prompt.

The broader point: federation makes a lot of data reachable through one interface, and reachability without governance is exactly the condition automated consumers exploit fastest. Decide what agents reach before they arrive, because retrofitting the boundary after the source has been hammered is a worse conversation.

## A migration that nobody notices

When a table does move, federation is what makes the move boring. Here is the sequence for one table, and it should take a day of elapsed work spread over two weeks.

**Copy the data.** Read from Oracle, write to Iceberg. For a table of moderate size this is one job. Partition and sort the target for the query patterns the view layer already shows you, which is a real advantage of migrating after federation rather than before: you know how the table is queried because you have been serving those queries.

**Run both in parallel and reconcile.** Keep Oracle authoritative. Load the Iceberg copy on a schedule. Compare them daily on row count, on aggregate totals for the numeric columns, and on a sample of individual rows by key.

```sql
-- Reconciliation: run daily during the parallel period
SELECT
    'row_count'                               AS check_name,
    (SELECT count(*) FROM oracle_erp.finance.customer_credit) AS source_value,
    (SELECT count(*) FROM lakehouse.finance.customer_credit)  AS target_value
UNION ALL
SELECT
    'credit_limit_sum',
    (SELECT sum(credit_limit) FROM oracle_erp.finance.customer_credit),
    (SELECT sum(credit_limit_usd) FROM lakehouse.finance.customer_credit)
UNION ALL
SELECT
    'active_customers',
    (SELECT count(*) FROM oracle_erp.finance.customer_credit
      WHERE credit_status = 'ACTIVE'),
    (SELECT count(*) FROM lakehouse.finance.customer_credit
      WHERE credit_status = 'ACTIVE');
```

Run this for two weeks. Discrepancies in this window are almost always type or null handling, and finding them here costs nothing.

**Flip the view.** Change one view definition from the Oracle table to the Iceberg table. Consumers are unaffected because they reference the view. This is the actual cutover and it is a one-line change.

**Watch for a week with the ability to flip back.** Keep the Oracle table loading. If something surfaces, revert the view definition. Reverting is the same one-line change in the other direction, which is the property that makes the cutover low-stress.

**Decommission the source path.** Stop the Oracle-side load, remove the grants for the federation account on that table, and record the date. This last step gets skipped, and skipped enough times you have an Oracle instance still being maintained for tables nothing reads.

Two things worth noting about this sequence.

The reconciliation period is where the value is, and shortening it is the most common mistake. Two weeks of daily comparison catches the type mismatches, the timezone handling, and the rounding differences that a one-time comparison misses because they only appear on certain data.

And the flip-back capability is what makes the whole thing safe enough to do routinely. A migration you can undo in one line is a migration people are willing to attempt on a Tuesday. A migration requiring a coordinated rollback across twenty consumers is one that gets scheduled for a quarter that never arrives.

## Failure modes

**A federated query with no pushdown, running constantly.** Somebody writes a view without source-side filters, a dashboard refreshes it hourly, and it pulls a full table each time. Warning sign: sustained network transfer from Oracle, or Oracle load rising with no application change. Fix: read the plan for every view you publish, and treat missing pushdown as a bug.

**Federation used to avoid a decision indefinitely.** The permanent bucket was never written down, so nothing is ever evaluated for migration and Oracle costs never fall. Warning sign: no table has migrated in a year. Fix: the three-bucket list, reviewed on a schedule.

**Consumers pointed at physical tables.** The view layer was skipped for expedience, so every migration requires a coordination exercise. Warning sign: dashboards referencing source-specific names. Fix: build the view layer, then move consumers, then migrate.

**Source capacity exhausted by analytical load.** Federation moved reporting load onto a system sized for transactions. Warning sign: transactional latency degrading during reporting hours. Fix: materialize, and prioritize migrating whatever is driving the load.

**Semantic drift between sources.** A metric computed one way in the Oracle view and another way in the Iceberg model. The federated join produces numbers that reconcile to neither. Warning sign: totals disagreeing across dashboards. Fix: define metrics once in the semantic layer and derive both sides from that definition.

**Type and null-handling differences.** Oracle's empty-string-as-null behavior, number precision, and timestamp handling do not match the lakehouse exactly. Joins on affected columns silently drop or duplicate rows. Warning sign: row counts that do not reconcile across the join. Fix: test joins on representative data with known counts, and normalize explicitly.

**Connection exhaustion.** Each federated query consumes an Oracle connection. Concurrency that was fine for an application is not fine for an analytical engine issuing many parallel queries. Warning sign: connection errors under load. Fix: configure connection pooling on the engine side with a cap below what Oracle tolerates.

**Materialization treated as done.** A materialized view refreshing on a schedule that no longer matches how the source changes, serving stale data confidently. Warning sign: nobody has reviewed refresh cadences since setup. Fix: review them when the source's update pattern changes, and monitor staleness as a metric.

## Operational guidance

**Inventory the sources before designing anything.** Every system analytics touches, its owner, its query volume, and whether anyone has proposed migrating it. Organizations consistently find sources nobody accounted for, and finding them during design is much better than during a reconciliation failure.

**Set a resource profile on the federation account on day one.** Not after the first runaway query. The profile is the only thing standing between an analytical query and a transactional system's capacity, and adding it retroactively means someone already had a bad afternoon.

**Decide the inner-versus-left join question per view, with the business.** Cross-source joins silently change totals depending on which you pick, and the correct answer depends on what the number means rather than on what looks tidy. Record the decision in the view's documentation.

**Give federation its own database account with read-only grants.** Scoped to the tables it needs, with a resource profile capping what it can consume. This protects the source from an unbounded analytical query and makes attribution obvious.

**Cap concurrency at the engine, below the source's tolerance.** The engine will happily open more connections than Oracle wants to give. Set the limit deliberately.

**Read the execution plan for every published view.** Not for ad hoc queries, for the views consumers depend on. Confirm pushdown once, then re-check after any schema or statistics change.

**Keep Oracle statistics current on federated tables.** The engine's plan quality depends on them. Tables that stopped being actively developed frequently have statistics from years ago.

**Instrument Oracle load attributable to federation.** Query count, rows returned, execution time, by federated account. Trend it. Rising load is your signal to materialize or to migrate.

**Write the three-bucket list and revisit it.** Migrate soon, migrate eventually, stays permanently. Named owner for each bucket. This is the artifact that keeps the program finite.

**Test cross-source joins on known data.** Construct a small case where you know the correct row count and verify it. Type and null-handling mismatches between systems are quiet and this catches them.

**Alert on federated query duration, not just failure.** A federated query that got slower is usually a pushdown regression from a schema change or a statistics refresh, and it is visible days before anyone complains.

**Keep a per-view record of what pushes down.** A short note on each published view stating which predicates reach the source. When someone edits the view later, that note is what tells them what not to break.

**Model the cost before assuming savings.** Federation adds engine capacity and does not remove the Oracle license. The savings arrive when tables migrate and workload shifts off. Sequence the business case accordingly rather than promising savings in month one.

## Beyond Oracle: the same pattern generalizes

Oracle is the example because it is the common case, and nothing in the approach is Oracle-specific. The same reasoning applies to any source that holds data your analytics need and that you are not going to consolidate.

**Other relational databases.** SQL Server, Postgres, MySQL, DB2. The pushdown mechanics are the same, and the connector quality varies, so verify what pushes down for your specific engine and source pair rather than assuming parity.

**Other warehouses.** Organizations frequently end up with more than one, through acquisition or through a team that chose differently. Federation lets them coexist while you decide whether consolidating is worth the effort, and often it is not.

**Operational stores with analytical value.** A document store or a key-value store holding data reporting needs. Pushdown here is usually weaker, because these systems have less expressive query interfaces, so materialization matters more.

**SaaS applications.** A CRM or a support system with an API. Federation over an API is a different performance profile, since APIs paginate and rate-limit, and pushdown is limited to whatever filters the API accepts. Materialize aggressively.

**Partner and vendor data.** Data you do not own and cannot migrate by definition. This is the permanent-bucket case in its purest form.

Two observations across all of them.

The connector determines the experience. Pushdown quality, type mapping fidelity, and error handling all live in the connector, and they vary substantially by source. Test the specific combination you are running rather than reasoning from the general capability.

And the permanent bucket is larger than people expect once you list every source honestly. An organization inventorying everything analytics touches typically finds a dozen sources, of which two or three are candidates for consolidation. Designing for a federated estate as the durable state, rather than as a stop on the way to one system, matches that reality.

The framing that helps: your analytical interface is the view layer, and the physical sources behind it are an implementation detail that changes over time. Some of them will change to Iceberg. Some never will. Consumers should not be able to tell which is which.

## Making the business case survive scrutiny

Federation projects get funded on a promise and cut when the promise does not materialize on schedule. Structuring the case honestly is what prevents that.

**What to claim in month one.** Cross-system analytics that previously required an export. Deleted pipelines, each one a named job with a maintenance cost you can point at. Time-to-answer on questions spanning both systems, dropping from days to minutes.

Those are real, verifiable within weeks, and sufficient to justify the work.

**What not to claim in month one.** Oracle cost reduction. The license is unchanged, the instance is still running, and federation adds load rather than removing it. A case built on savings that arrive in year two, presented as if they arrive in month two, is a case that gets audited unfavorably in month six.

**What to claim in year one.** Migration of the high-volume analytical tables, with the associated reduction in Oracle workload. This is where cost actually moves, and it moves because federation made the migrations safe rather than because federation itself saved anything.

**Track three numbers from the start.** Pipelines deleted. Tables migrated. Oracle query volume attributable to reporting. The third one is the leading indicator of when the license conversation becomes possible, and having a trend line matters more than having a forecast.

**Name the end state explicitly.** Not "eventually everything moves." Say which tables stay, why, and what the steady state costs. A stakeholder who understands that sixty percent stays permanently, and why, will not treat the program as incomplete forever. One who was told everything moves will.

The organizational failure this avoids: a program that delivered real value in month one and gets judged against a promise nobody should have made. I have watched federation deployments that worked well get characterized as disappointments because the business case was written by someone optimistic about license savings, and the technical work was fine.

Set the expectation that this is a capability investment with a cost payoff that follows selective migration. That is both accurate and, on the evidence, sufficient to get funded.

## Where this is heading

Three developments.

Catalogs are becoming the place federation is governed rather than a per-engine configuration. Apache Polaris federates external catalogs, including Hive Metastore and other REST endpoints, into one authorization model with credential vending. As catalog federation broadens toward more source types, the access decision for a federated source lands in the same place as for a native table, which is a real improvement over today's situation where each engine's connectors carry their own credentials and their own permission model.

Materialization management is becoming workload-driven. Systems that observe query patterns and manage materializations automatically apply directly here, because federated queries are exactly the ones where materialization pays most and where a human is least likely to notice the opportunity in time.

The direction I find most interesting is federation as the permanent architecture rather than a transition state. The framing that federation is scaffolding for migration is a holdover from an era when the goal was consolidating everything into one system. Organizations increasingly have operational systems, a lakehouse, partner data, and SaaS sources that will never be one system. Federation as the durable answer, with migration applied selectively where it pays, is a different posture and I think the more realistic one.

## Conclusion

Migration-first plans stall because the last tables are hard for reasons, and until they finish, nothing works. Federating first inverts that: analytics spanning both systems work in weeks, and migration becomes an optimization applied where it pays.

Pushdown determines whether it performs. Predicates, projections, and aggregations executed at the source are the difference between a query returning thousands of rows and one pulling millions across the network. Read the plan for every published view, keep source statistics current, and shape queries so the smaller side crosses.

Materialize the federated results consumers hit repeatedly, at a cadence set by the actual freshness requirement, so the source sees one query per refresh instead of one per user.

Then write the three-bucket list. Migrate soon, migrate eventually, stays permanently. That third bucket is not an admission of defeat, it is the thing that turns an open-ended program into a finite one with a defined end state.

Be honest about the cost story. Federation buys capability and time, not license savings. The savings come from the migrations federation makes safe enough to actually do.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and catalogs. *Architecting an Apache Iceberg Lakehouse* from Manning covers federation, semantic layers, and migration sequencing as platform decisions. *Apache Polaris: The Definitive Guide*, which I co-authored for O'Reilly, covers catalog federation and the governance model spanning multiple sources. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
