---
title: "Semantic Layer Federation: One Logical Model Over Data on Three Clouds"
date: "2026-08-25"
description: "One logical model over Iceberg and databases on three clouds. Pushdown, egress, Reflections, and where semantic federation still breaks."
author: "Alex Merced"
category: "Semantic Layer"
canonical: https://iceberglakehouse.com/posts/semantic-layer-federation-three-clouds/
tags:
  - semantic layer
  - federation
  - multi-cloud
  - Apache Iceberg
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/semantic-layer-federation-three-clouds/).

A global retailer's revenue dashboard needs four sources. Orders are in an Apache Iceberg table on S3 in Virginia. Customers are in an Iceberg table on Google Cloud Storage in Belgium, inherited from an acquisition. Inventory is in a PostgreSQL database on Azure in a sovereign region that regulators say cannot leave. Currency rates come from a SaaS API cached in a small table nobody remembers creating. The dashboard wants revenue by customer segment by product category in local currency, refreshed hourly, under two seconds.

The standard answer is to replicate. Copy customers and inventory to Virginia every night, build the dashboard there, and accept that the numbers are a day old and the copy jobs are somebody's problem. Three years in, that company has 40 replication pipelines, 11 copies of the customer table in various states of freshness, an egress line item that finance asks about every quarter, and a security review that found four of the copies had wider permissions than the source.

Semantic layer federation is the alternative. A single logical business model, defined once, sits over all four sources where they live. Queries against the model are planned across sources, with filters and projections pushed to each one so that only the rows the query needs cross a cloud boundary. Acceleration structures materialize the hot paths, placed in the cloud where the queries run, so the dashboard hits a local aggregate instead of a cross-cloud join. The customer table exists in one place. Revenue is defined in one place. The regional teams in Belgium and Virginia get the same number because they query the same definition.

This article is about how that works at the level of mechanism: how a federated planner decides what to push where, why multi-cloud egress changes the acceleration placement decision, how to keep metric definitions consistent across regional teams, and where the approach breaks. I work at Dremio, whose platform does this, and I will use its terms (virtual datasets, Reflections) for the concrete parts. The design principles apply to any engine that can federate across heterogeneous sources and materialize over logical views.

## Why Replication Is the Default and Why It Stops Working

Replication is the default because it is what every tool knows how to do. An ETL job reads a source and writes a copy. A warehouse has native loaders for it. Every team has done it. It has three costs that stay hidden until the estate spans clouds.

Egress fees are the visible one. Moving a byte out of a cloud region costs money, typically 5 to 12 cents per gigabyte across cloud boundaries and less within a provider's regions. A nightly full copy of a 500-gigabyte customer table from GCP to AWS is $25 to $60 a night, or up to $22,000 a year, for one table. Incremental copies help, but they require change tracking on the source, and the operational databases that most need it are the ones least likely to have it configured.

Pipeline latency is the second. A copy is stale by the length of its refresh interval. The dashboard shows yesterday's segments joined to today's orders, and nobody notices until a segment migration makes the join produce nonsense. Shortening the interval raises the egress cost and the operational load.

Security synchronization is the third and the one that produces audit findings. The source has row-level and column-level policies. The copy has whatever the copy job's service account created, which is usually nothing. Every copy is a new surface with its own grants, and the grants drift from the source the moment they are created. A company with 11 copies of the customer table has 11 places PII can leak.

These costs scale with the number of source-target pairs, and in a multi-cloud estate that number grows quadratically with the number of clouds. A three-cloud company that replicates everything everywhere maintains six directional pipelines per table. That is the point at which replication stops being a data engineering choice and becomes a budget problem.

## What Federation Changes

A federated semantic layer replaces "copy the data to where the query is" with "send the query to where the data is, and bring back only the answer."

The engine connects to each source through a connector: an Iceberg REST catalog for the S3 and GCS tables, a JDBC or native connector for PostgreSQL, a REST or file connector for the currency cache. Each source appears in the engine's namespace as a set of physical datasets. Nothing is copied. The engine reads source metadata (schemas, partition layouts, statistics where available) and plans against it.

Over the physical datasets, the semantic layer defines virtual datasets: views that rename, cast, filter, join, and aggregate. `sales.revenue` is a view that joins orders (Virginia) to customers (Belgium) to inventory (Azure) to currency rates, applies the completed-order filter, and computes local-currency revenue. Consumers query `sales.revenue`. They never see a cloud name.

When a query arrives, the planner does three things that a single-source engine does not.

It decomposes the query by source. The join between orders and customers spans two sources, so the planner splits the plan into a Virginia subtree, a Belgium subtree, and a join that happens in the engine. Each subtree is everything the planner can evaluate at that source.

It pushes down aggressively. A `WHERE order_date >= '2026-08-01'` on orders goes to the Iceberg scan in Virginia, where it becomes partition pruning and file skipping against the Iceberg metadata. A `WHERE country = 'DE'` on customers goes to the GCS scan. A projection of five columns from a 200-column inventory table goes to PostgreSQL as a `SELECT` of five columns. What crosses the network from each source is the filtered, projected result of its subtree, not the table.

It chooses a join strategy based on the sizes that come back. If the Belgium subtree returns 50,000 customer rows and the Virginia subtree returns 20 million order rows, the planner broadcasts the customers to wherever the orders are being processed rather than shipping the orders. A cost-based planner with source statistics makes this decision. One without them guesses, and the guess is what produces the 2-terabyte cross-cloud transfer that shows up on the egress bill.

Here is the query and the shape of the plan it produces:

```sql
SELECT
  c.segment,
  i.category,
  SUM(o.amount * fx.rate_to_usd) AS revenue_usd
FROM sales.revenue_base o            -- Iceberg on S3, us-east-1
JOIN customers.dim_customer c        -- Iceberg on GCS, europe-west1
  ON o.customer_id = c.id
JOIN inventory.products i            -- PostgreSQL on Azure, sovereign region
  ON o.product_id = i.product_id
JOIN reference.fx_rates fx           -- small cached table
  ON o.currency = fx.currency AND o.order_date = fx.rate_date
WHERE o.order_date >= DATE '2026-08-01'
  AND o.status = 'completed'
  AND c.country = 'DE'
GROUP BY c.segment, i.category;
```

```
HashAggregate [segment, category] SUM(amount * rate_to_usd)
+- HashJoin (product_id)
   +- HashJoin (currency, order_date)
   |  +- HashJoin (customer_id)              -- broadcast customers (small side)
   |  |  +- IcebergScan s3://lake-us/sales/orders
   |  |  |     filter: order_date >= 2026-08-01 AND status = 'completed'
   |  |  |     project: customer_id, product_id, currency, order_date, amount
   |  |  |     partition pruning: order_date, files scanned: 41 of 12,880
   |  |  +- IcebergScan gs://lake-eu/customers/dim_customer
   |  |        filter: country = 'DE'
   |  |        project: id, segment
   |  |        rows returned: 48,212
   |  +- Scan reference.fx_rates (cached)
   +- JdbcScan postgresql://inventory.sovereign/products
         pushed SQL: SELECT product_id, category FROM products
         rows returned: 31,004
```

Read the plan bottom-up. The Virginia scan pruned 12,839 of 12,880 files using the date predicate against Iceberg metadata and read five of the table's columns. The Belgium scan returned 48,000 rows out of a multi-million-row table because the country filter pushed down. The Azure scan returned two columns of a 31,000-row product table. What crossed cloud boundaries was roughly 48,000 customer rows and 31,000 product rows. The 20 million order rows never left Virginia, because the planner broadcast the small sides to the large side.

That plan is what "without physical replication" means in practice. Not zero bytes crossing clouds, but only the bytes the query needs, chosen by a planner that knows where each table lives.

## Where Acceleration Lives in a Multi-Cloud Estate

Federation with pushdown gets the dashboard to tens of seconds. It does not get it to two seconds, because the cross-cloud round trips and the engine-side join are still on the query path. Acceleration is what closes the gap, and in a multi-cloud estate the acceleration question is as much about geography as about aggregation.

An acceleration structure (Dremio calls them Reflections) is a materialization the engine maintains over a virtual dataset and substitutes into query plans automatically. A raw reflection is a columnar copy of the view's output, optionally sorted and partitioned. An aggregate reflection is a pre-computed rollup by chosen dimensions with chosen measures. The planner rewrites a query against `sales.revenue` to read the reflection when the reflection can answer it, and the consumer never knows.

In a single-cloud deployment, reflections are placed on the engine's storage and the only question is which ones to build. In a multi-cloud deployment, two more questions matter.

Which cloud holds the reflection. A reflection is data. If the dashboard's users are in Virginia and the reflection is materialized on GCS in Belgium, every dashboard load crosses the Atlantic to read it. Place the reflection where the queries run. For the revenue dashboard, that is Virginia, on S3, next to the orders table. The reflection refresh is the one operation that crosses clouds (it re-runs the federated plan above), and it runs hourly on a schedule rather than per query.

What the reflection replaces. An aggregate reflection on `sales.revenue` by `segment`, `category`, and `order_date` with `SUM(revenue_usd)` as the measure is a few hundred thousand rows. It answers the dashboard's every filter combination from a local scan of a small table. The cross-cloud join happens once per hour during refresh. The 500-gigabyte customer table is never copied, because the reflection holds the aggregate, not the dimension.

Here is what defining that reflection looks like:

```sql
ALTER VIEW sales.revenue
  CREATE AGGREGATE REFLECTION revenue_by_segment_category
  USING
    DIMENSIONS (segment, category, order_date BY DAY, country)
    MEASURES   (revenue_usd (SUM), order_count (COUNT))
  PARTITION BY (order_date)
  LOCALSORT BY (segment);
```

The `order_date BY DAY` dimension is what lets the planner satisfy a weekly or monthly query by rolling up the daily grain. The `PARTITION BY` on date keeps refresh incremental where the engine supports it: only the partitions whose source data changed get recomputed. The storage location follows the engine's configuration for the space that holds the view, which in this design is the Virginia S3 bucket.

This is where the economics of federation become clear. Compare two designs for the same dashboard:

| | Replicate customers and inventory to Virginia | Federate, with aggregate reflection in Virginia |
|---|---|---|
| Cross-cloud bytes per day | Full or incremental copy of two tables (tens to hundreds of GB) | Filtered join inputs at refresh (tens to hundreds of MB) |
| Copies of the customer table | Two (source plus Virginia replica) | One |
| Freshness | Copy interval (hours to a day) | Reflection refresh interval (minutes to an hour) |
| Dashboard query path | Local join of replicated tables, then aggregate | Local scan of pre-aggregated reflection |
| Security surfaces | Source policies plus replica policies (drift) | Source policies only, enforced at the view |
| Pipelines to maintain | Two directional copy jobs plus schema sync | Zero copy jobs and one reflection definition |
| Failure mode | Stale replica, silent | Stale reflection, visible in engine metrics |

The federated design moves less data, has one copy of every table, and puts freshness and staleness in a place the engine reports on. What it costs is a planner good enough to push down across heterogeneous sources and a refresh job that runs the federated plan on a schedule. Those are engine capabilities, not pipelines, which is the point.

## Designing the Semantic Graph Over Distributed Sources

The semantic layer is a graph of views. In a multi-cloud estate the shape of that graph determines both query cost and governance clarity, and there are a few principles that hold up.

**Tier by physical proximity first, then by business meaning.** The bottom tier of views maps one to one onto physical tables and does nothing but rename and cast. Every bottom-tier view is single-source, so every query against it pushes down completely. The middle tier joins within a source where possible (orders to order lines, both in Virginia) and across sources only where the business model requires it (orders to customers). The top tier is what consumers query and is where cross-source joins are allowed to appear. This layering means the expensive cross-cloud joins are concentrated in a small number of top-tier views, which are exactly the ones to accelerate.

**Keep dimensions small and near their facts.** A dimension table that is joined to a fact on another cloud is the thing that crosses the wire. Customers at 50,000 rows after a country filter is fine. Customers at 50 million rows with no filter is not. Design the middle tier so that the dimension side of every cross-cloud join is pre-filtered by the view definition (a `country IN (...)` list, a `status = 'active'` filter) or is small enough that broadcast is cheap. If a dimension is large and unfilterable, that is the one case where a regional replica is worth maintaining, and it should be a reflection rather than a pipeline so the engine tracks its freshness.

**Put the metric definition in exactly one view.** `revenue_usd` is defined in `sales.revenue` and nowhere else. The Belgium team's dashboard and the Virginia team's dashboard both read `sales.revenue`. If the Belgium team needs revenue in euros, they get a view over `sales.revenue` that applies a rate, not a parallel definition. This is the discipline that makes "same number in every region" true rather than aspirational, and it is the discipline that the Apache Ossie (incubating) semantic model specification is meant to make portable: the one definition can be exported as an Ossie document and consumed by a BI tool or agent framework without re-implementation.

**Name spaces by domain, not by cloud.** `sales.revenue`, `customers.dim_customer`, `inventory.products`. A consumer who sees `gcp_eu.customers` has learned something about infrastructure they should not need to know, and the name breaks when the table moves. The physical location is a property of the bottom-tier view's source, and it changes in one place.

Here is the graph for the running example, with the tier and source for each view:

```sql
-- Bottom tier: single-source, rename and cast only.
CREATE VIEW staging.orders AS
SELECT order_id, customer_id, product_id, currency,
       CAST(order_date AS DATE) AS order_date,
       CAST(amount AS DECIMAL(18,2)) AS amount, status
FROM lake_us.sales.orders;                                   -- Iceberg, S3 us-east-1

CREATE VIEW staging.customers AS
SELECT id, segment, country, created_at
FROM lake_eu.customers.dim_customer;                         -- Iceberg, GCS europe-west1

CREATE VIEW staging.products AS
SELECT product_id, category, sku
FROM inventory_pg.public.products;                           -- PostgreSQL, Azure sovereign

-- Middle tier: within-source joins and pre-filters.
CREATE VIEW sales.completed_orders AS
SELECT * FROM staging.orders WHERE status = 'completed';     -- still single-source

CREATE VIEW customers.active_eu AS
SELECT id, segment, country FROM staging.customers
WHERE country IN ('DE','FR','NL','BE','AT');                 -- pre-filtered dimension

-- Top tier: the one cross-source join, the one metric definition.
CREATE VIEW sales.revenue AS
SELECT
  o.order_id, o.order_date, o.currency,
  c.segment, c.country,
  p.category,
  o.amount * fx.rate_to_usd AS revenue_usd,
  1 AS order_count
FROM sales.completed_orders o
JOIN customers.active_eu c ON o.customer_id = c.id
JOIN staging.products p     ON o.product_id = p.product_id
JOIN reference.fx_rates fx  ON o.currency = fx.currency AND o.order_date = fx.rate_date;
```

Three tiers, four sources, one cross-source view, one metric. The aggregate reflection from the previous section sits on `sales.revenue`. Every dashboard, notebook, and agent reads `sales.revenue` or something above it.

## Governance Follows the View, Not the Copy

The security argument for federation is easy to state and worth stating precisely.

In the replicated design, a policy on the customer table (mask email, restrict rows by country) exists on the GCS source and has to be re-created on the Virginia replica. The re-creation is manual, it happens once, and the policies drift the first time someone updates the source policy and forgets the replica.

In the federated design, the policy exists on the source and on the view. A column mask on `staging.customers.email` applies to every view above it, in every region, because every view reads through it. A row filter on `customers.active_eu` that restricts a Belgium analyst to Belgian customers applies to `sales.revenue` for that analyst. There is one copy of the policy and one copy of the data, and the engine enforces the policy at query time with the querying user's identity, not the copy job's service account.

The cross-cloud dimension adds one requirement: the engine's identity has to be honored by each source. For Iceberg tables behind a REST catalog, that is credential vending, where the catalog issues a short-lived, table-scoped credential for the engine's principal, and the catalog's grants determine whether the principal can reach the table at all. For a PostgreSQL source, it is a database role the engine connects as, with the engine's own row and column policies layered on top. The point is that the source's access model is not bypassed by federation. It is the floor, and the semantic layer's policies are the ceiling.

Reflections inherit this. An aggregate reflection over `sales.revenue` holds pre-computed revenue by segment and category. It does not hold emails or customer IDs, because the view's projection never included them. A raw reflection over a view with a masked column stores the masked values, because the reflection is built by running the view. The materialization never has wider access than the view it accelerates, which is the property that replication pipelines lack.

## A Worked Cost Model

The egress argument is easy to wave at and worth putting numbers on. Take the running example and price the two designs for one year, using 12 cents per gigabyte as the cross-provider rate (the top of the typical range, so this favors replication).

Replication, nightly full copy. The customer table is 500 gigabytes on GCS. A nightly full copy to S3 is 500 gigabytes of GCP egress a day, which at 12 cents is $60 a day, or $21,900 a year, for one table. Add the inventory table from Azure (say 40 gigabytes, $4.80 a day, $1,750 a year) and the replication design costs roughly $23,650 a year in egress alone, before compute for the copy jobs, storage for the replicas, and the engineer-hours to maintain both pipelines.

Replication, incremental. If both sources support change tracking and the daily delta is 2 percent, the egress drops to about $470 a year. That is a real improvement and it is also the version that requires CDC configured on a PostgreSQL database in a sovereign region and change tracking on an Iceberg table that a different team owns, plus a merge step on the replica side. Most teams that report "incremental" replication are running full copies on the tables where CDC was never set up.

Federation with hourly reflection refresh. The refresh runs the federated plan. From the profile above, the cross-cloud inputs are roughly 48,000 customer rows and 31,000 product rows, which is a few megabytes. Call it 150 megabytes per refresh to be generous about wider projections. Hourly, that is 3.5 gigabytes a day and about 1,280 gigabytes a year, or $154 a year at 12 cents. The order table never moves. The dimension tables move only their filtered projections.

| Design | Cross-provider egress per year | Freshness | Pipelines |
|---|---|---|---|
| Nightly full replication | About $23,650 | 24 hours | 2 copy jobs plus schema sync |
| Incremental replication (CDC on both sources) | About $470 | Hours | 2 CDC pipelines plus 2 merge jobs |
| Federation, hourly aggregate reflection refresh | About $154 | 1 hour | 0 pipelines, 1 reflection definition |

The numbers are illustrative and the exact figures depend on table sizes, filter selectivity, and the refresh cadence. The shape is not illustrative. Federation with acceleration wins on egress by two orders of magnitude over full replication and by a meaningful margin over incremental replication, while delivering better freshness with no pipelines. The trade is that the engine has to be good at pushdown and the semantic layer has to be designed with the tiers described above. Both are one-time engineering investments rather than recurring line items, and both carry over to the next table the business wants to join across clouds.

Where the model breaks is a top-tier view that cannot be pre-filtered. A join between two large fact tables on different clouds, with no selective predicate, ships one of them at every refresh. That case exists. It is rare in practice, because business models join facts to dimensions far more often than facts to facts, and when it appears the right answer is to materialize the smaller fact regionally as a reflection and accept that one table has a regional copy.

## Freshness Contracts and Refresh Scheduling

A federated semantic layer replaces "how stale is the replica" with "how stale is the reflection," and the second question is easier because the engine answers it.

Every reflection has a refresh policy: on a schedule, on source change where the engine can detect it, or never (a static snapshot). For Iceberg sources, the engine can detect change by comparing the table's current snapshot ID to the one the reflection was built from, which makes "refresh when the source commits" cheap to implement and accurate. For a PostgreSQL source with no change tracking, the refresh is scheduled.

The design decision is the refresh cadence per top-tier view, and it should be set by the freshness the consumers need, not by what the source can provide. The revenue dashboard needs hourly. A finance close report needs daily and needs to be pinned to a specific snapshot for the reporting period. An agent answering "what happened in the last 15 minutes" needs the live path with no reflection, and the semantic layer should expose that as a separate view (`sales.revenue_live`) so the choice is explicit.

A useful discipline is to publish the freshness of each top-tier view as a property consumers can read. Dremio exposes reflection refresh status and last-refresh time through its API and system tables. Surface that in the BI tool's data source description and in the MCP server's tool description for agents, so a consumer knows that `sales.revenue` is at most an hour old and `sales.revenue_live` is current but slower.

Refresh scheduling across clouds has one subtlety: the refresh is the cross-cloud query, so schedule it when the sources are quiet and the network is cheap. Egress pricing does not vary by time of day on the major clouds, but source load does. An hourly refresh at five past the hour, after the orders table's ingestion commit lands, gets fresh data and avoids contending with the ingestion write.

## Agents as Consumers of the Federated Model

Everything above applies to dashboards. The reason it matters more in 2026 is that the newest consumer of the semantic layer is an AI agent, and agents make every weakness of a replicated design worse.

An agent asking "what was German revenue by segment last week" does not know or care which cloud the customer table is on. It needs a tool that answers the question with governed, consistent numbers. If the tool is backed by a replica, the agent gets stale data and reports it as current. If the tool is backed by raw tables across three sources, the agent has to write the cross-cloud join itself, and it will get the join wrong or ship the wrong table.

A federated semantic layer gives the agent one tool per top-tier view. The MCP server exposes `sales.revenue` as a tool with the view's dimensions and measures as parameters, the reflection's freshness in the description, and the row and column policies enforced by the engine under the agent's identity. The agent calls the tool with `country = 'DE'` and `date_range = last_week`, the engine rewrites the call to the aggregate reflection, and the answer comes back in under a second from a local scan. The cross-cloud join happened an hour ago during refresh. The agent never saw a cloud.

Two properties of the federated design matter specifically for agents.

The first is that the agent's exploration is bounded. An agent given a tool over `sales.revenue` can only ask questions `sales.revenue` can answer. An agent given raw table access can run `SELECT * FROM staging.customers` from Virginia and cross the Atlantic with 500 gigabytes, and agents in a loop do that kind of thing at machine speed. Restricting agents to the top tier is both a governance control and an egress control.

The second is that the definition the agent uses is the same one the dashboard uses. When the agent says German revenue last week was 4.2 million euros and the dashboard says the same, that is not a coincidence, it is the same view. Every argument for a single metric definition applies with more force to agents, which cannot be told in a meeting that the numbers differ because of a definition mismatch.

## Comparing Federation Approaches

Engine-level federation of the kind described here is one of several ways to present distributed data as one model. Here is how they compare on the multi-cloud dimensions:

| | Engine-level federation with semantic layer (Dremio, Trino with a modeling layer) | Catalog federation (Apache Polaris federated catalogs) | Warehouse-native external tables | Data mesh with per-domain replicas |
|---|---|---|---|---|
| What is unified | Meaning: views, metrics, policies | Tables: one namespace and one grant model | Access: remote tables readable in one engine | Ownership: each domain publishes its own products |
| Cross-source joins | Planned and pushed down by the engine | Left to the engine reading the federated catalog | Executed by the warehouse, often with limited pushdown | Executed by consumers over replicas |
| Acceleration | Reflections placed by geography | None (catalog only) | Warehouse materialized views, single cloud | Replicas are the acceleration |
| Egress control | Pushdown plus reflection placement | None directly | Depends on warehouse pushdown | High: replicas move whole products |
| Metric consistency | One definition in the top tier | Not addressed | Per-warehouse definitions | Per-domain definitions, drift by design |
| Governance | Source floor plus view policies | Catalog grants plus credential vending | Warehouse grants on external tables | Per-domain, hard to audit centrally |
| Best with | A single engine as the analytics front door | Multiple engines that all need the same tables | A committed warehouse with few remote sources | Organizations that value autonomy over consistency |

These are not exclusive. The strongest multi-cloud design I have seen uses catalog federation to unify the tables and their grants, an engine-level semantic layer over the federated catalog to unify meaning and accelerate, and Ossie export of the top tier so that consumers outside the engine still read the same definitions. Each layer does the thing it is good at. The mistake is expecting any one of them to do all three.

## Failure Modes and Warning Signs

**Pushdown that silently stops.** A view uses a function the connector cannot push to the source (a regex on PostgreSQL, a user-defined function anywhere), and the planner pulls the whole table to evaluate it in the engine. The sign is a source scan in the query profile with no pushed filter and a row count equal to the table size. Check the profile for every top-tier view during development, and keep functions that do not push down out of the bottom and middle tiers.

**The broadcast decision goes wrong.** Without source statistics, the planner does not know that customers is the small side, and ships orders across the ocean instead. The sign is engine memory and network spikes with a plan that shows the large table being shuffled. Make sure the engine collects or receives statistics for every federated source, and pin the join strategy with a hint on the few views where the planner cannot get it right.

**Reflection placed in the wrong cloud.** The dashboard is fast for the Belgium team and slow for the Virginia team, or the reverse, because the reflection is materialized next to one of them. The sign is p95 latency that differs by user region for the same view. Check where the reflection's storage lives and move it to the space whose storage is in the query-heavy region. If both regions are query-heavy, two reflections in two places is cheaper than one cross-cloud read per dashboard load.

**Refresh that costs more than the copy it replaced.** A reflection refresh runs the federated plan. If the plan has lost its pushdown, or the reflection is defined over an unfiltered cross-cloud join, the hourly refresh moves more data than the nightly copy it replaced. The sign is egress cost rising after the migration to federation. Profile the refresh query the same way you profile user queries.

**Latency on the sovereign source.** The PostgreSQL database in the Azure sovereign region is small and slow, and every `sales.revenue` query touches it. The sign is query latency that tracks the sovereign source's response time regardless of the rest of the plan. A raw reflection on `staging.products`, refreshed on the product table's change cadence, takes it off the hot path while keeping the source as the system of record. This is the one place a "copy" is right, and it is a reflection so the engine owns its freshness.

**Metric drift through parallel views.** The Belgium team creates `sales_eu.revenue` with its own definition because `sales.revenue` was too slow before the reflection existed. Now there are two definitions. The sign is a reconciliation meeting. Audit the semantic layer for views whose names or column sets duplicate a top-tier view, and export the canonical definitions in Ossie format so the parallel implementations have something to converge on.

**Reflection refresh that races the source commit.** The hourly refresh starts at the top of the hour, the orders ingestion commits at two minutes past, and the reflection is built from the snapshot before the commit. The dashboard shows an hour-old aggregate that is labeled as fresh. The sign is a consistent lag of one interval between source and reflection. Schedule the refresh after the ingestion commit lands, or trigger it from the catalog's commit event rather than from a clock.

**Egress from ad hoc exploration.** An analyst with access to the bottom tier runs `SELECT * FROM staging.customers` from Virginia. The whole table crosses the Atlantic. The sign is a one-off egress spike attributable to a user. Restrict bottom-tier access to the semantic layer's maintainers, and give analysts the middle and top tiers, which are filtered and accelerated.

## Operational Guidance

**Map the sources by cloud and size before building views.** Know which tables are large, which are dimensions, and which clouds hold them. The middle-tier pre-filters and the reflection placement decisions come from that map.

**Build the bottom tier single-source.** No cross-source joins below the top tier. It keeps pushdown complete and makes the cross-cloud cost of each top-tier view legible.

**Accelerate the top tier, place by query geography.** One aggregate reflection per top-tier view, materialized in the cloud where its consumers are. Two if consumers are split.

**Profile every top-tier view's plan once, and every reflection refresh once.** Pushdown, join strategy, and rows crossing the wire. Write the numbers down. They are the baseline for the egress alert.

**Alert on egress per source.** Cloud billing exports attribute egress by bucket and region. Tag the buckets by the semantic layer's source name and alert when a source's daily egress exceeds its refresh-time baseline by a margin.

**Keep source policies as the floor.** Credential vending for Iceberg sources, database roles for operational sources. Add the semantic layer's masks and filters on top. Never grant the engine's service identity more than the most-privileged consumer needs.

**Export the top tier as Ossie.** The metric definitions in `sales.revenue` are the enterprise's semantic model. Export them in the Apache Ossie format so BI tools and agent frameworks that cannot read the engine's views can still read the definitions, and so the definition survives an engine change.

**Restrict the bottom tier.** Analysts get the middle and top tiers. The bottom tier is for the people who maintain the semantic layer.

## Where This Is Heading

Federated semantic layers over multi-cloud estates get easier as three things mature.

Catalog federation. Apache Polaris's catalog federation lets one REST catalog present tables from other catalogs on other clouds, with credential vending that flows through. An engine that federates at the catalog level sees one namespace across clouds with one set of grants, which removes the "three catalogs, three permission models" problem that federation at the engine level has to work around. The engine-level semantic layer and the catalog-level federation are complementary: the catalog unifies the tables, the semantic layer unifies the meaning.

Portable semantic models. Apache Ossie's specification for semantic models, and the Polaris Semantic Model API that stores them in the catalog, turn the top-tier views into a document any consumer can read. The reflection stays in the engine. The definition becomes an asset that is not tied to it.

Cost-aware planners. The egress question is one that planners have not historically modeled. A join cost model that knows a byte from Belgium to Virginia costs 8 cents per gigabyte more than a byte from Virginia to Virginia makes different, better decisions than one that only counts rows. I expect every serious federated engine to add cloud-boundary costs to its planner within a couple of years, because the multi-cloud estate is becoming the normal case rather than the exception.

The pattern underneath all three is that the lakehouse is separating the physical (where bytes live) from the logical (what they mean) at every layer. Open table formats separated storage from engines. Open catalogs are separating governance from engines. Open semantic formats are separating meaning from engines. Federation is what lets a business run one logical model over a physical estate that spans providers, and the estate is going to keep spanning providers.

## Conclusion

Replication is the default answer to multi-cloud data because it is the answer every tool knows, and it produces copies, egress, staleness, and security drift that grow with the square of the number of clouds. A federated semantic layer replaces it with one logical model over data where it lives: a planner that decomposes queries by source and pushes filters and projections down, a tiered graph of views that keeps cross-cloud joins few and visible, and acceleration structures placed in the cloud where the queries run so that the cross-cloud work happens once per refresh rather than once per query.

Governance follows the view rather than the copy, so there is one policy and one dataset. The metric is defined once and every region reads it. The failure modes are real (lost pushdown, wrong broadcast, misplaced reflections, refresh that costs more than the copy) and every one of them is visible in a query profile or an egress report, which is more than the replication pipelines ever offered. Build the bottom tier single-source, accelerate the top tier by geography, alert on egress, and export the definitions in an open format. That is the shape of a multi-cloud semantic layer that does not turn into 40 pipelines.

## Keep Going

If this piece was useful, I have written a lot more on semantic layers, federation, and lakehouse architecture across clouds. *Architecting an Apache Iceberg Lakehouse* (Manning) covers the semantic layer design, acceleration, and governance patterns that this article applies to the multi-cloud case. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
