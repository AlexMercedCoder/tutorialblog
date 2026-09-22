---
title: "Why the Iceberg DataFusion Integration Is Moving to Apache DataFusion"
date: "2026-09-21"
description: "Why the Iceberg DataFusion integration moved to the DataFusion project, and what the split means for users, Comet, and iceberg-rust contributors."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache DataFusion
  - Apache Iceberg
  - Rust
  - Open Source
canonical: https://iceberglakehouse.com/posts/datafusion-iceberg-moves-to-apache-datafusion/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/datafusion-iceberg-moves-to-apache-datafusion/).

A team building a Rust analytics service wants to read Apache Iceberg tables. They reach for Apache DataFusion, the Rust query engine, and the `iceberg-datafusion` crate that connects it to Iceberg. It works for simple scans. Then they need a feature the integration lacks, such as better scan partitioning or scan metrics. They open a pull request against `apache/iceberg-rust`. It sits for weeks. Meanwhile a new DataFusion release ships, and their service cannot upgrade until iceberg-rust upgrades first.

That experience was common enough in 2026 to force a structural decision. In September 2026, the Apache Iceberg and Apache DataFusion communities each voted to move the DataFusion integration out of `apache/iceberg-rust` and into a new repository, `apache/datafusion-iceberg`, governed by the DataFusion project. Both votes passed unanimously.

The move changes no performance characteristics and no part of the Iceberg spec. What it changes is ownership. The decision answers a question every table format with native implementations has to face: when an engine integration lives inside the format's library, who maintains it, who reviews it, and whose release schedule does it follow?

This article covers what the integration does, the pressures that made the old arrangement fail, the options the communities considered, and how the decision was made. It also covers what moves, what stays, and what the change means for DataFusion users, downstream projects such as DataFusion Comet, iceberg-rust contributors, and vendors who had been maintaining their own forks.

## What the Integration Actually Does

DataFusion is an extensible query engine written in Rust on top of Apache Arrow. It does not know about Iceberg on its own. It learns about data sources through traits, which are Rust's version of interfaces. The integration crate implements those traits for Iceberg.

The core pieces are straightforward once you know DataFusion's extension points.

**`IcebergCatalogProvider`** implements DataFusion's `CatalogProvider` trait. You construct it from any iceberg-rust `Catalog`, such as a REST catalog client, and register it with a DataFusion session. After that, Iceberg namespaces appear as DataFusion schemas and Iceberg tables appear as DataFusion tables. A query can name `lake.sales.orders` and DataFusion knows where to look.

**`IcebergTableProvider`** implements the `TableProvider` trait for a single table. This is where scans happen. DataFusion hands the provider the projection, filters, and limit from the query plan. The provider turns those into an iceberg-rust scan, which uses Iceberg metadata to prune manifests and data files, and returns an execution plan that streams Arrow record batches.

**`IcebergStaticTableProvider`** is a read-only variant bound to a fixed table state. It can be built from a table or from a specific snapshot ID, which gives you time travel through a DataFusion table.

**`IcebergTableProviderFactory`** plugs into DataFusion's `CREATE EXTERNAL TABLE` statement. With it registered, a user can write `CREATE EXTERNAL TABLE t STORED AS ICEBERG LOCATION '...'` and point directly at a metadata file, without a catalog.

The crate also contains physical plan nodes for Iceberg-specific work, metadata table support, and a task writer for the write path.

Around that library code sit two other pieces that matter just as much. The first is a sqllogictest runner. Sqllogictest is a testing format where each test file holds SQL statements and expected results. iceberg-rust used DataFusion as the engine to run its corpus of these tests, which made DataFusion part of how iceberg-rust verified its own behavior. The second is a playground crate, a small command-line SQL shell built on `datafusion-cli` that connects to Iceberg catalogs for interactive exploration.

The integration has real downstream weight. DataFusion Comet, the Apache project that accelerates Apache Spark by running parts of query plans natively in DataFusion, depends on it for native Iceberg scans. Several companies building Rust-based data products depend on it too. When it moves, a lot of code moves with it. I cover what native scans change for Spark in [DataFusion Comet 1.0 and What Native Rust Scans Change for Spark on Iceberg](https://iceberglakehouse.com/posts/datafusion-comet-1-spark-iceberg/). This article stays on the governance side.

## Why the Integration Started Inside iceberg-rust

The integration did not land in iceberg-rust by accident. It arrived there for a good reason, and that reason explains why the move needed debate at all.

In March 2024, iceberg-rust was young. The project had basic table scans and catalog support, and not much else. An issue filed that month (#242) proposed integrating with DataFusion once scans and catalogs worked, with a specific goal: speeding up data-driven tests. A table format library needs an engine to prove itself. You cannot easily verify that scan planning, delete handling, and schema evolution produce correct results without running real queries against real tables. DataFusion was the obvious engine for a Rust library, since it shares the Arrow memory format and the Rust toolchain.

So the integration started life as test infrastructure as much as a user feature. The first version of the crate declared a dependency on DataFusion 37.0.0. It was small, and keeping it next to the core made sense. Every change to scan planning got exercised through SQL in the same pull request, reviewed by the same people.

Then the crate grew a user base. People building on DataFusion found it the easiest way to query Iceberg from Rust. Comet adopted it for native Iceberg scans inside Spark. Companies started shipping products on it. Each new user brought feature requests that were about DataFusion behavior, not Iceberg behavior.

DataFusion kept moving too. By the time of the move, the new repository's workspace pinned DataFusion 55. That is 18 major versions after the 37.0.0 the crate started with, in roughly two and a half years. Each major version is a potential API break that the integration has to absorb, and each one had to go through iceberg-rust's review and release process.

This history matters because it shows the arrangement was right when it was made. A young library with one engine for testing belongs together with that engine code. A mature library with a production integration used by many downstream projects has different needs. The move is what happens when a project outgrows a sensible early decision, and recognizing that moment is a skill in itself.

## Three Pressures That Broke the Old Arrangement

The discussion started formally on August 21, 2026, when Matt Butrovich, who works on DataFusion Comet, posted a summary to both the Iceberg and DataFusion dev lists at once. It followed a GitHub discussion, a tracking issue (#3029 in iceberg-rust), and two weeks of debate in both projects' community calls. His summary named three motivations, and each one is worth understanding on its own, because they generalize well beyond Rust.

**Pressure one: reviewer bandwidth.** Users kept filing issues and pull requests against the DataFusion integration as they needed more features. Many went stale. The underlying problem was a skills mismatch. The committers and PMC members of iceberg-rust are experts in the Iceberg spec, catalogs, and file IO. Few of them used the DataFusion integration day to day or knew DataFusion's planner internals. The people who knew DataFusion best were not reviewers on the repository. Pull requests such as opt-in eager file scan planning with output partitioning, and scan metrics reporting, waited for review attention that the maintainers did not have to give.

**Pressure two: the engine-agnostic goal.** iceberg-rust wants to be a library that any engine can build on. Hosting one engine's integration in the core repository works against that. It makes one engine look like the default. It also creates pressure to accept every other engine's integration on equal terms. That pressure had already surfaced. An integration for DataFusion Ballista, the distributed execution layer for DataFusion, was proposed to iceberg-rust in pull request #2613 and declined on exactly these grounds. Once the project declines one engine integration to stay neutral, keeping another one in the tree becomes hard to justify.

**Pressure three: dependency lockstep.** Because the integration lived in iceberg-rust, DataFusion was a dependency of the iceberg-rust workspace. Projects that depended on both iceberg-rust and DataFusion, with Comet as the prime example, were stuck on old DataFusion and Arrow versions until iceberg-rust upgraded. DataFusion ships major versions frequently, and each major version tends to carry API changes. Every one of those upgrades had to route through the iceberg-rust release process first. A downstream project's upgrade cadence was capped by a repository whose maintainers had the least reason to prioritize DataFusion changes.

Andrew Lamb, the DataFusion PMC chair, added a fourth point during the discussion that raised the stakes. He wrote that at the VLDB conference, he had spoken with at least three companies adding Iceberg support to their products, and all of them had forked iceberg-rust for one reason or another. Forks are the symptom that shows a governance arrangement is failing. Each fork means a company carrying patches the upstream never sees, and each one makes it harder for those companies to contribute fixes back.

Put the pressures together and the shape of the problem is clear. The integration's most active users and most knowledgeable maintainers were in the DataFusion community. Its code, its review process, and its release schedule were in the Iceberg community. Neither side was doing anything wrong. The code was simply in the wrong place.

## The Options on the Table

The communities did not jump straight to a new repository. The thread worked through several alternatives, and the reasons each was set aside tell you what both projects cared about.

**Stay put and add reviewers.** Gabriel Musat proposed keeping the crate inside iceberg-rust but granting a couple of DataFusion PMC members committer access limited to the integration crate through a CODEOWNERS file. He suggested Matt Butrovich and Tim Saucer as candidates. This preserved the tight coupling between the integration and the core, which has real value for testing and design. It also fixed the review bottleneck without moving code. The objection was that it did nothing for the other two pressures. DataFusion stays a dependency of the core workspace under that plan, and iceberg-rust keeps hosting one engine's integration. Renjie Liu, an iceberg-rust PMC member, replied that moving the crate to the DataFusion project sounded more reasonable to him, since most of the code relates to DataFusion and that community is better positioned to define its design.

**Move to `datafusion-contrib`.** DataFusion has a GitHub organization called `datafusion-contrib` for related projects. It offers visibility and a lightweight setup, but it sits outside the Apache Software Foundation. Matt's summary flagged the problem directly. Governance affects who is able to contribute. Some contributors work at companies whose policies allow contributions to ASF projects but not to unaffiliated repositories. Moving a widely used integration outside the ASF shrinks its contributor pool at the moment the goal is to grow it.

**Fold it into another DataFusion subproject.** The original issue floated moving the integration into `datafusion-distributed`, making native distributed Iceberg support a core offering of that project. That solved ownership for one use case but tied a general-purpose integration to one execution model.

**A new ASF repository under the DataFusion project.** This is where consensus landed. Xuanwo, a longtime contributor across the Rust data ecosystem, summarized the logic in two points: DataFusion is the largest dependency of the integration, and Comet, its largest downstream user, shares many PMC members with DataFusion. Andy Grove, who created DataFusion, added his support and noted the integration's importance to Comet. The DataFusion PMC was willing to accept it, and the code stays under Apache governance.

Not every concern disappeared. Shawn Chang, summarizing a community sync on August 26, listed the open questions that remained. Where exactly is the boundary between engine integration and Iceberg core? How do you keep the integration from moving so fast that it ends up needing a forked core API? How does end-to-end correctness testing work across two repositories, given that iceberg-rust relied on DataFusion for integration tests? Those questions did not block the move, but they define the work that follows it. A later section returns to them.

## How the Decision Was Made

The mechanics of the move are worth walking through, because they show how two Apache projects hand code between them without anyone losing governance along the way.

On September 4, Andrew Lamb proposed a four-step process to the thread. First, create a new GitHub repository in the Apache organization, named `apache/datafusion-iceberg`. Second, open a pull request in that repository with the proposed code. Third, hold a formal vote on the Iceberg dev list to move the integration to DataFusion. Fourth, hold a formal vote on the DataFusion dev list to accept it. He offered to handle the logistics, such as the ASF infrastructure ticket for the repository.

The order matters. The votes happen after the code exists in the new home, so each community votes on a concrete artifact rather than an idea. Gabriel Musat did the heavy lifting here. He ported the crate into the new repository in its first pull request, and he carried the full commit history across. Keeping history means `git blame` still works, contributors keep credit for their past work, and anyone tracing a bug can follow a line of code back through its life in iceberg-rust.

Kevin Liu, an Apache Iceberg PMC member who had been involved in the discussion, opened the Iceberg-side vote on September 9. His message framed the move as good for both communities: easier maintenance for contributors who know DataFusion, with the code staying under Apache governance. The DataFusion-side vote ran in parallel on that project's dev list.

The Iceberg vote drew 17 +1 votes. Five were binding, from Kevin Liu, Fokko Driesprong, Renjie Liu, Szehon Ho, and Russell Spitzer. There were no -1 or +0 votes. On September 16, Andrew confirmed on the thread that both votes had passed unanimously.

If you have not followed Apache voting before, the binding distinction matters. Anyone can vote on an Apache list, and those votes signal community sentiment. Binding votes come from members of the project's Project Management Committee (PMC), the group legally responsible for the project's releases and code. A decision like transferring code needs binding support from the giving project. Accepting the code needs binding support from the receiving one. Two votes, two PMCs, one clean handoff.

The whole process, from the first dual-list email to the confirmed result, took under four weeks. For a change that touches two top-level Apache projects and a dependency used by multiple companies, that is fast. It moved quickly because the discussion had already happened in public, in issues and community calls, before the formal thread started.

## What Moves and What Stays

The new repository's workspace shows exactly what crossed over. It contains three crates.

| Item | Before | After |
|---|---|---|
| Integration library | `iceberg-datafusion` crate in `apache/iceberg-rust` | `datafusion-iceberg` crate in `apache/datafusion-iceberg` |
| Sqllogictest runner and test corpus | In `apache/iceberg-rust` | In `apache/datafusion-iceberg` |
| Playground SQL shell | In `apache/iceberg-rust` | In `apache/datafusion-iceberg` |
| Governing PMC | Apache Iceberg | Apache DataFusion |
| DataFusion dependency | Pinned by the iceberg-rust workspace | Pinned by the new workspace (DataFusion 55 at the time of the move) |
| Iceberg dependency | Same workspace | `iceberg` and `iceberg-catalog-rest` pulled from iceberg-rust at a pinned git revision |
| Spec, catalogs, FileIO, scan planning, Arrow reader | iceberg-rust | Still iceberg-rust |

Notice the crate name. It flips from `iceberg-datafusion` to `datafusion-iceberg`, matching DataFusion's naming convention for its subprojects. Code that depends on the old crate name keeps working against old published versions, but new releases will ship under the new name. Update your `Cargo.toml` when you move.

Notice the dependency direction too. The new workspace depends on iceberg-rust. iceberg-rust no longer depends on DataFusion for the integration. At the moment of the move, the new repository pins iceberg-rust by git revision rather than by a published version. That is normal for a freshly ported crate that needs APIs newer than the last iceberg-rust release. It will settle into published version ranges as the two release trains find a rhythm. The iceberg-rust 0.11.0 release was going through release candidate votes in the same weeks, which gives the new crate a fresh published base to target.

The tests moved with the integration, and that was a deliberate call. Renjie Liu laid out the reasoning in the thread. Putting sqllogictests in the new repository makes it easier for integration developers to add tests, and it avoids a two-way dependency between repositories that makes version management awkward. He acknowledged the cost: it is less convenient for iceberg-rust developers who want end-to-end SQL tests of core changes. His judgment was that those cases are rare, because most sqllogictest changes came from pull requests that modified the integration itself.

One related cleanup is on a separate track. The Python bindings in iceberg-rust, published as `pyiceberg-core`, carried a DataFusion dependency as well. Kevin Liu proposed removing it and using DataFusion's own Python bindings directly. That work is not part of the repository move, but it follows the same principle: the core library should not carry an engine along with it.

What stays in iceberg-rust is everything that makes it an Iceberg library. That covers the table spec implementation, including schemas, partition specs, snapshots, and manifests. It also covers catalog clients, the FileIO storage layer, scan planning, and the Arrow-based reader that turns Iceberg data files into record batches. Any engine, DataFusion or otherwise, builds on those pieces.

## The Boundary Problem Between Engine and Core

Moving code solves the ownership question. It creates a boundary question, and the boundary question is harder.

Shawn Chang's summary put it sharply. The risk is that the integration moves much faster than the core, adds features the core does not support yet, and eventually needs its own forked version of core APIs. At that point you have two Iceberg implementations in Rust that disagree in subtle ways. That is the exact outcome everyone wanted to avoid by keeping the code in the ASF.

The way to think about the boundary is to ask what each piece of code knows about.

Code that knows about the Iceberg spec belongs in iceberg-rust. Manifest pruning with partition and column statistics, delete file application, snapshot selection, schema evolution by field ID, and catalog protocol handling are all spec behavior. Every engine needs them to be identical. If DataFusion needs a better version of any of them, the improvement goes into the core, where every engine gets it.

Code that knows about DataFusion's planner belongs in the integration. Translating DataFusion filter expressions into Iceberg predicates, deciding how Iceberg file scan tasks map onto DataFusion partitions, reporting scan metrics in DataFusion's metrics system, and implementing `CREATE EXTERNAL TABLE` are engine behavior. They change whenever DataFusion's APIs change, and DataFusion's reviewers are the people who can judge them.

Some work straddles the line. Consider the stalled pull request for eager file scan planning with output partitioning. Part of it is engine behavior: how DataFusion wants partitions shaped. Part of it can touch core behavior: how the scan exposes file tasks so an engine can group them. The healthy pattern is for the integration to ask the core for a general capability, such as a way to enumerate file tasks with the metadata an engine needs to group them, and then use that capability in engine-specific ways. The unhealthy pattern is for the integration to reimplement scan planning locally because the core was slow to add the capability.

A useful rule falls out of this, and it applies to every table format, Rust or otherwise. Integration code belongs with the project whose APIs churn fastest. DataFusion's APIs change with each major release. The Iceberg spec changes slowly and deliberately. Putting the integration next to DataFusion means the people who handle that churn review the code that absorbs it. The core library then stays focused on the format, where stability is the point.

The same pressures exist in other ecosystems. The Spark and Flink integrations for Iceberg's Java implementation live in the main Iceberg repository today, versioned across multiple engine releases, and they carry a real maintenance cost in keeping several engine versions building at once. The Rust decision does not mean the Java project should copy it. The Java integrations have long histories and large maintainer groups. It does show that the "integrations live in the format repository" arrangement is a choice, and that the right choice depends on where the expertise sits. I explored the broader shift of Iceberg from a format into a set of libraries in [Iceberg Is Becoming a Library, Not Just a Table Format](https://iceberglakehouse.com/posts/iceberg-is-becoming-a-library/).

## A Walkthrough: Querying an Iceberg REST Catalog From DataFusion

To make this concrete, here is a minimal Rust program that connects DataFusion to an Iceberg REST catalog, such as Apache Polaris, using the crates as they exist in the new repository. First, the dependencies.

```toml
[package]
name = "lake-query"
version = "0.1.0"
edition = "2024"

[dependencies]
anyhow = "1"
datafusion = "55"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }

# The integration, under its new name and new home.
datafusion-iceberg = { git = "https://github.com/apache/datafusion-iceberg" }

# Match the iceberg-rust revision that datafusion-iceberg pins in its own
# workspace, or you will compile two copies of the iceberg crate.
iceberg = { git = "https://github.com/apache/iceberg-rust", rev = "665c64e48e8d33797ecb1a421f327edd9b024879" }
iceberg-catalog-rest = { git = "https://github.com/apache/iceberg-rust", rev = "665c64e48e8d33797ecb1a421f327edd9b024879" }
```

The comment in the middle is the most important line in the file. `datafusion-iceberg` depends on a specific revision of iceberg-rust. If your own project pulls a different revision or a different published version, Cargo builds two separate copies of the `iceberg` crate. Types from one copy do not match types from the other, and you get compile errors about a `Catalog` that does not implement `Catalog`. Until both projects publish releases with compatible version ranges, pin your iceberg-rust dependency to exactly what the integration's workspace uses. Check its `Cargo.toml` when you upgrade.

Now the program.

```rust
use std::collections::HashMap;
use std::sync::Arc;

use datafusion::prelude::SessionContext;
use datafusion_iceberg::IcebergCatalogProvider;
use iceberg::CatalogBuilder;
use iceberg_catalog_rest::{
    REST_CATALOG_PROP_URI, REST_CATALOG_PROP_WAREHOUSE, RestCatalogBuilder,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 1. Build an iceberg-rust REST catalog client.
    let props = HashMap::from([
        (
            REST_CATALOG_PROP_URI.to_string(),
            "http://localhost:8181/api/catalog".to_string(),
        ),
        (REST_CATALOG_PROP_WAREHOUSE.to_string(), "analytics".to_string()),
    ]);
    let catalog = RestCatalogBuilder::default().load("polaris", props).await?;

    // 2. Wrap it as a DataFusion catalog provider.
    let provider = IcebergCatalogProvider::try_new(Arc::new(catalog)).await?;

    // 3. Register it with a DataFusion session under the name "lake".
    let ctx = SessionContext::new();
    ctx.register_catalog("lake", Arc::new(provider));

    // 4. Query Iceberg tables with plain SQL.
    let df = ctx
        .sql(
            "SELECT region, COUNT(*) AS orders, SUM(amount) AS revenue \
             FROM lake.sales.orders \
             WHERE order_date >= DATE '2026-09-01' \
             GROUP BY region \
             ORDER BY revenue DESC",
        )
        .await?;
    df.show().await?;

    Ok(())
}
```

Here is what each step does and which project owns it.

Step one is pure iceberg-rust. `RestCatalogBuilder` implements the core `CatalogBuilder` trait, and `load` takes a catalog name and a property map. The `uri` property points at the REST endpoint. The `warehouse` property names the catalog within the server, which for Polaris is the catalog name. Authentication properties go in the same map. None of this code knows DataFusion exists, and none of it moved.

Step two is the integration. `IcebergCatalogProvider::try_new` takes any iceberg-rust `Catalog` behind an `Arc` and builds a DataFusion `CatalogProvider`. It lists namespaces and tables from the catalog so DataFusion can resolve names. This is the code that now lives in `apache/datafusion-iceberg`.

Step three is pure DataFusion. `register_catalog` makes the provider visible under a name. From here, the three-part name `lake.sales.orders` resolves to catalog, schema, and table.

Step four is where both projects meet. DataFusion parses and plans the SQL. When it reaches the table scan, it calls the integration's `TableProvider` with the projected columns and the `order_date` filter. The integration converts the filter into an Iceberg predicate and asks iceberg-rust to plan a scan. iceberg-rust prunes manifests and data files using partition values and column statistics, then reads the surviving Parquet files into Arrow record batches. DataFusion runs the aggregation and sort on those batches.

The filter conversion in step four is a good example of the boundary from the previous section. How to translate a DataFusion expression into an Iceberg predicate is integration knowledge, and it now gets reviewed by people who know DataFusion's expression types. How to prune files with that predicate is spec knowledge, and it stays in the core.

If you do not want a catalog at all, the integration also supports pointing DataFusion directly at a metadata file with SQL, through `IcebergTableProviderFactory`.

```sql
CREATE EXTERNAL TABLE orders
STORED AS ICEBERG
LOCATION 's3://analytics-bucket/sales/orders/metadata/00042-abc.metadata.json';

SELECT COUNT(*) FROM orders;
```

This registers a read-only table from one metadata file. It is handy for inspection and testing. For anything that needs to see new snapshots or write data, use a catalog.

## What Changes for Each Group

The move affects different people in different ways. Here is the practical view for each group.

**DataFusion application developers.** You get a new crate name and a new place to file issues and pull requests. More importantly, you get reviewers who know DataFusion. Features that stalled in the old location, such as output partitioning for scans and scan metrics, now go to people who can judge them against DataFusion's planner. You also get upgrade cadence aligned with DataFusion itself. When DataFusion ships a major release, the integration can follow on the DataFusion project's schedule instead of waiting on iceberg-rust.

**DataFusion Comet users.** Comet's native Iceberg scans depend on this integration, and Comet shares much of its maintainer base with DataFusion. The move puts Comet's most important external dependency under a PMC that overlaps with its own. The lockstep problem, where Comet waited on iceberg-rust before upgrading DataFusion or Arrow, loses most of its force. For teams running Spark with Comet on Iceberg, the practical effect is faster pickup of DataFusion improvements over time.

**iceberg-rust contributors.** The core repository sheds a dependency and a category of pull requests that its maintainers were not well placed to review. It gets to be what it said it wanted to be: an engine-agnostic Iceberg library. The cost is test coverage convenience. End-to-end SQL tests now live in another repository. Core changes that affect query results still need to be validated against an engine, and the two projects need a reliable way to do that, such as the integration's CI running against iceberg-rust's main branch.

**Other engine integrations.** Ballista's integration was declined in iceberg-rust for neutrality reasons. The new arrangement gives it a natural home, since Ballista is part of the DataFusion project too. The same logic applies to other Rust engines. Build the integration where the engine's maintainers live, and depend on iceberg-rust as a library.

**Vendors carrying forks.** Andrew Lamb's observation about three companies forking iceberg-rust is the signal to watch. If forks existed because integration patches never got reviewed, the new repository removes that reason. The healthy outcome is those companies upstreaming their integration changes to `apache/datafusion-iceberg` and their spec changes to iceberg-rust. If you are one of them, now is the moment to diff your fork against both repositories and decide which patches go where.

**Python users.** Most Python users never see this change. PyIceberg is a separate project with its own implementation. The `pyiceberg-core` bindings that expose Rust functionality to Python are the one place where DataFusion showed up, and the proposal to drop that dependency in favor of DataFusion's own Python bindings follows the same logic as the move.

## Failure Modes and Warning Signs

A split repository is a better arrangement, but it is not free. These are the risks to watch in the months after the move.

**Version skew.** Two repositories mean two release trains and a compatibility matrix between them. A `datafusion-iceberg` release will support a range of iceberg-rust versions, and a DataFusion major version, and your application has to land inside both. The sign is the duplicate-crate compile error described in the walkthrough. The fix is to read the integration's workspace dependencies before every upgrade and pin to match.

**Core drift.** The biggest risk named in the discussion is the integration growing its own versions of core behavior because upstreaming is slow. The sign is code in the integration repository that plans scans, evaluates Iceberg predicates, or reads manifests directly instead of calling iceberg-rust. Both communities should treat that kind of change as a request to add a capability to the core.

**Test coverage gaps.** With sqllogictests in the new repository, a change to iceberg-rust core can break SQL-level behavior without failing any iceberg-rust test. The sign is integration CI going red right after an iceberg-rust merge. A scheduled CI job that builds the integration against iceberg-rust's main branch catches this early and tells the core maintainers which change caused it.

**Discoverability.** Users searching for "iceberg datafusion" will find the old crate name, old documentation, and old issues in the iceberg-rust repository for a while. The sign is new issues filed in the wrong repository. Clear pointers in the old crate's README and in iceberg-rust's issue templates solve most of this.

**Governance mismatch on shared decisions.** Some future changes will need both PMCs to agree, such as a core API change that the integration depends on. Two projects with different release rhythms and different review cultures sometimes disagree about timing. The sign is pull requests in one repository blocked waiting on the other. The joint community calls that produced this decision are the right forum for keeping that coordination working.

## Operational Guidance

If you run Rust services on DataFusion and Iceberg, here is a short checklist for the transition.

Find every place your code depends on `iceberg-datafusion`. Plan to switch to `datafusion-iceberg` once it publishes its first release, and track the git repository until then.

Pin iceberg-rust in your project to the exact revision or version that the integration's workspace uses. Recheck this pin on every upgrade.

Move open issues and feature requests for the integration to `apache/datafusion-iceberg`. If you had a stalled pull request against iceberg-rust's integration crate, reopen it in the new repository, where it will reach reviewers who know DataFusion.

If you maintain a fork, split your patches into spec-level changes and engine-level changes. Send each kind to its matching repository.

If you contribute to iceberg-rust core, add the integration's CI to the set of signals you watch after merging changes to scan planning, predicates, or readers.

And if you build an integration for another Rust engine, follow the same pattern from day one. Host it with the engine, depend on iceberg-rust as a library, and push general capabilities down into the core.

## How to Tell Whether the Move Worked

A governance change is a hypothesis. The hypothesis here is that putting the integration with DataFusion's maintainers speeds up development without splitting the Rust Iceberg implementation. Both halves can be checked with public data, and anyone who depends on the integration has a stake in checking them.

**Review latency.** The clearest problem before the move was pull requests waiting weeks for review. GitHub shows open and merged pull requests with timestamps. Compare the median time from opening to first review in the new repository against the integration crate's history in iceberg-rust. If the move worked, that number drops sharply within a few months.

**The stalled backlog.** A specific set of features waited in the old queue, including partitioned scan output and scan metrics. Watch whether those land in the new repository, and how fast. They are the named test cases. If they are still open six months from now, the bottleneck was never only about location.

**Upgrade lag.** Measure the gap between a DataFusion major release and the matching `datafusion-iceberg` release. Before the move, that gap was bounded by iceberg-rust's release schedule. After the move, it should track DataFusion's own cadence closely. Comet's ability to pick up new DataFusion versions quickly depends on this number.

**Core contributions from the integration side.** A healthy split shows up as pull requests to iceberg-rust written by integration maintainers, adding general capabilities the integration needs. An unhealthy split shows up as the absence of those pull requests, alongside growing Iceberg-specific logic inside the integration. Count both over time.

**Fork consolidation.** The companies that forked iceberg-rust are the other half of the signal. If some of them start contributing integration patches to the new repository, the move is pulling work back upstream. That outcome matters more than any single feature, because every fork that closes is one fewer divergent implementation of the spec.

**Cross-repository breakage.** Track how often the integration's CI fails because of an iceberg-rust change, and how long those failures take to fix. A few failures are expected and healthy, since they mean the tests are catching real regressions. Long-lived failures mean the two projects are not coordinating well.

None of these metrics needs special access. They come from public repositories, public mailing lists, and public release notes. That transparency is one of the practical benefits of keeping the code inside the ASF, and it is a good habit for anyone evaluating an open source dependency's health.

## Where This Is Heading

The move fits a pattern that runs through the whole Iceberg ecosystem in 2026. Iceberg now has serious native implementations in Rust, Go, Python, and C++, alongside the original Java one. As those implementations mature, the question shifts from "does a native Iceberg library exist" to "who owns each layer of the stack." I covered the rise of those native implementations in [Iceberg Is Escaping the JVM](https://iceberglakehouse.com/posts/iceberg-is-escaping-the-jvm/).

The answer emerging from the Rust side is a clean layering. The Iceberg project owns the format library: spec, metadata, catalogs, storage, and scan planning. Engine projects own their integrations and depend on that library. Downstream products depend on both through published releases rather than forks. That layering is what lets Iceberg become shared infrastructure across many engines instead of a feature of a few.

Expect the next steps to be practical ones. A first published release of `datafusion-iceberg` will follow the port. Version compatibility between the integration and iceberg-rust will settle into a documented matrix. Features that sat in the old review queue, such as partitioned scan output and scan metrics, are the first real test of whether the new home delivers faster iteration. If they land quickly, the move worked. Watch the new repository's pull request activity over the next quarter to see it play out.

There is a quieter lesson here for every open source data project. Where code lives decides who reviews it, and who reviews it decides how fast it moves. Projects tend to treat repository layout as a technical detail settled early and rarely revisited. The Iceberg and DataFusion communities treated it as a governance decision, debated it in public, and changed it when the evidence said the old layout had stopped working. That habit is worth copying well beyond Rust.

## Conclusion

In September 2026, the Apache Iceberg and Apache DataFusion communities moved the DataFusion integration out of `apache/iceberg-rust` and into `apache/datafusion-iceberg`, under DataFusion's governance. Both votes passed unanimously, with the Iceberg vote drawing 17 +1 votes, five of them binding.

The move answers three pressures that had built up. Pull requests stalled because the people who knew DataFusion were not reviewers on the Iceberg repository. The core library wanted to stay neutral across engines. And downstream projects such as Comet waited on iceberg-rust before upgrading DataFusion. Putting the integration with the engine it plugs into places the reviewers next to the code and frees the core to focus on the format.

The work that follows is about the boundary. Spec behavior stays in iceberg-rust, engine behavior moves with DataFusion, and general capabilities get pushed down into the core instead of reimplemented on the edge. For users, the immediate steps are simple: switch to the new crate name, pin iceberg-rust to match the integration, and send issues to the new repository.

## Keep Going

If this piece was useful, I have written a lot more on how Apache Iceberg works across engines and implementations. *Apache Iceberg: The Definitive Guide* covers the table format's metadata and scan planning model that every native implementation, Rust included, has to get right. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
