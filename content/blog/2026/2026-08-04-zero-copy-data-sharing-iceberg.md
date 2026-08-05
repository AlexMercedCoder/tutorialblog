---
title: "What Zero-Copy Data Sharing Actually Does Between Salesforce, Snowflake, and Databricks"
date: "2026-08-04"
description: "What zero-copy data sharing actually does across Salesforce, Snowflake, and Databricks: query federation, file federation, catalog federation, and when copying still wins."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Zero-Copy
  - Data Sharing
  - Apache Iceberg
  - Catalog Federation
  - Salesforce
  - Snowflake
  - Databricks
canonical: "https://iceberglakehouse.com/posts/zero-copy-data-sharing-iceberg/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/zero-copy-data-sharing-iceberg/).

# What Zero-Copy Data Sharing Actually Does Between Salesforce, Snowflake, and Databricks

*By Alex Merced, Data Lakehouse and AI Evangelist*

A customer abandons a cart at 8 PM. That event lands in a warehouse table. A marketing platform needs it to trigger a journey, and a service platform needs it for context on the next support call. Under the architecture most enterprises still run, the event reaches those platforms after a nightly extract, a transform job, and a load into a third system that now holds its own copy.

By the time the journey fires, it is the next afternoon. Three systems hold three versions of the same customer, each stale by a different amount, and a full-time engineer maintains the pipelines that keep them roughly aligned.

Zero-copy architectures attack that problem by removing the copy. One platform reads data that lives in another platform's storage, either by pushing a query to the other engine or by reading its files directly. The numbers suggest this has moved well past pilot stage. Salesforce reported that in one recent quarter, roughly half of the records entering Data Cloud arrived through zero-copy connectors rather than through ingestion.

The term covers at least three different mechanisms with different performance characteristics, different failure modes, and different bills. This piece separates them, explains what Apache Iceberg contributes, covers catalog federation as the open alternative to vendor-specific pairings, and is honest about when copying the data is still the right answer.

A disclosure. I work for Dremio, which was acquired by SAP and now sits within SAP Business Data Cloud. Dremio does query federation across sources, so I have a professional stake in one of the mechanisms described here. I have tried to describe the tradeoffs as an architect rather than as a vendor, and where a competitor's approach genuinely fits a case better, I say so.

## Three things people call zero copy

Precision here saves a lot of confusion later, because these mechanisms behave nothing alike.

**Query federation** sends a SQL query from the consuming platform to the source platform's engine. The source executes it on its own compute and returns a result set. The consuming platform never touches storage.

**File federation** reads the source's data files directly from object storage. The consuming platform's own engine does the work. The source's compute is not involved at all.

**Catalog federation** connects one catalog to another so tables registered in the second appear in the first. It is a metadata mechanism, and whichever of the first two mechanisms handles the actual reading still applies.

They stack. A catalog federation makes tables discoverable, file federation reads them, and query federation covers the sources that do not expose files. A production deployment usually runs all three at once against different sources, which is why the vocabulary confusion causes real architectural mistakes rather than just sloppy conversation.

The shared property is that no scheduled job copies rows between systems. What differs is where the compute runs, who pays for it, and what happens when the source is slow. Vendors describe all three with the same marketing language, so the only reliable way to tell which one a product implements is to ask where the query executes and check the source system's query history afterward.

## Why Iceberg is the substrate

Zero copy between two proprietary systems requires each to implement the other's internals. That does not scale past a handful of vendor partnerships.

Apache Iceberg changed the economics by making the physical layout a published specification. A table is a set of Parquet files, a set of manifest files describing them with statistics, and a metadata file pointing at snapshots. Any engine that implements the spec reads a table written by any other engine.

That is what makes storage-level file federation possible without a proprietary bridge. A consuming platform reads Iceberg tables natively, and the source keeps writing them with whatever engine it prefers.

The properties that come along are underrated. Time travel works across the boundary, so a consumer queries the table as it looked at a past snapshot. Schema evolution works, so a column added upstream does not break a registered table downstream. Statistics work, so a filtering query prunes files rather than scanning everything.

Delta Lake tables participate through UniForm, which writes Iceberg metadata alongside Delta metadata over the same Parquet files. That extends the substrate to Delta-native estates without a conversion job.

The pattern is worth naming because it generalizes. Interoperability arrives when the storage format becomes a standard, not when vendors agree to integrate. Every zero-copy story in 2026 rests on that.

## Query federation mechanics

The consuming platform holds a connection to the source and issues SQL over it, typically through JDBC.

Pushdown is what makes it viable. When a query filters, aggregates, or joins, the consuming platform pushes as much of that work as it can into the query it sends. The source's engine does the heavy computation and returns a small result instead of a full table.

The quality of pushdown determines whether federation is usable or miserable. A federation layer that pushes down a filter on a partition column returns a few thousand rows. One that pulls the whole table and filters locally moves terabytes across a network boundary. Two products described identically on a datasheet differ enormously here.

The cost model has a property people miss. The source's compute runs on the source's bill. A dashboard on the consuming platform that refreshes every five minutes wakes a warehouse on the other side every five minutes. Federation moves cost rather than removing it, and it moves it to a team that did not agree to the query pattern.

Latency inherits the source's behavior. If the source engine has cold-start warmup, federated queries pay it. If the source is under load from its own workload, federated queries queue behind it.

Query federation is the right mechanism when the source is a system that does not expose files, when the result set is small relative to the input, and when the source's compute has headroom.

## File federation mechanics

File federation skips the source engine entirely. The consuming platform gets the table's metadata location and storage credentials, then reads Parquet files directly.

This is what the Iceberg REST catalog protocol enables. The consumer authenticates to a catalog, loads table metadata, receives short-lived scoped storage credentials through credential vending, and reads files. The mechanics are identical to any engine reading any Iceberg table, with the only difference being that the catalog and the consumer belong to different organizations or different platforms.

Salesforce describes its File Federation as retrieving data directly from Iceberg tables at the storage layer without compute overhead on the source, which is exactly this. It targets large, high-volume datasets where the cost of running the source's engine on every query is the thing you want to avoid.

The performance profile is near-native. The consumer's engine reads the same files it reads for a local table, prunes with the same statistics, and applies the same vectorized scan path.

The costs are different rather than absent. Egress charges apply when storage sits in one cloud or region and the reading engine in another, and those charges are per byte read rather than per query. Data volume matters more than query count.

File federation is the right mechanism when volumes are large, when the source engine's compute is expensive or contended, and when both sides speak Iceberg.

## Comparing the mechanisms

| Property | Query federation | File federation | Catalog federation |
|---|---|---|---|
| Where compute runs | Source platform | Consuming platform | Neither, metadata only |
| Who pays for compute | Source owner | Consumer | Neither |
| Data moved | Result set | Files read after pruning | Metadata |
| Best at | Small results from large inputs | Large scans, high volumes | Discovery across catalogs |
| Latency profile | Inherits source engine behavior | Near-native to consumer | Adds a metadata hop |
| Source must expose | A SQL endpoint | Iceberg tables and storage access | A catalog endpoint |
| Main cost risk | Waking source compute repeatedly | Cross-region egress | Catalog availability |
| Governance enforced by | Source engine permissions | Catalog RBAC and vended credentials | Federated catalog policy |

The decision rule that holds up in practice: if the query reduces a large input to a small answer and the source has compute to spare, push the query. If the consumer needs to scan volume, read the files. If the problem is that nobody knows what tables exist, fix the catalog first.

## Catalog federation and the open path

Vendor-to-vendor zero copy works well for the pairs that vendors have built. It handles the pairs they have not built exactly as well as you expect.

Catalog federation is the general answer. A catalog that federates to other catalogs presents tables from several sources under one namespace, with one authorization model and one discovery surface.

Apache Polaris supports this, including credential vending for external catalogs such as AWS Glue and Snowflake, which means clients receive scoped credentials from Polaris rather than holding their own credentials for each source. Polaris was co-created with Snowflake, donated to the Apache Software Foundation, and graduated to Top-Level Project on February 18, 2026.

The architectural difference matters. Under vendor pairings, connecting N platforms means building or configuring N-squared integrations, and each has its own permission model. Under catalog federation, each platform connects to the catalog once. Access decisions live in one place. Adding a consumer means adding a principal, not building an integration.

Registering an external catalog looks like this.

```bash
curl -X POST https://polaris.internal.example.com/api/management/v1/catalogs \
  -H "Authorization: Bearer $POLARIS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "warehouse_federated",
    "type": "EXTERNAL",
    "properties": {
      "default-base-location": "s3://partner-lake/warehouse"
    },
    "connectionConfigInfo": {
      "connectionType": "ICEBERG_REST",
      "uri": "https://partner-catalog.example.com/api/catalog",
      "remoteCatalogName": "analytics",
      "authenticationParameters": {
        "authenticationType": "OAUTH",
        "tokenUri": "https://partner-catalog.example.com/api/catalog/v1/oauth/tokens",
        "clientId": "acme-federation",
        "clientSecret": "<secret>",
        "scopes": ["PRINCIPAL_ROLE:ALL"]
      }
    },
    "storageConfigInfo": {
      "storageType": "S3",
      "roleArn": "arn:aws:iam::123456789012:role/PartnerLakeRead",
      "allowedLocations": ["s3://partner-lake/warehouse/"]
    }
  }'
```

`type: EXTERNAL` tells Polaris this catalog's tables live elsewhere and are managed by the remote system. Polaris does not accept writes it does not own.

`connectionConfigInfo` holds the remote endpoint and how to authenticate to it. The federation credential belongs to the catalog, not to every engine, which is the point.

`storageConfigInfo` with a narrow `allowedLocations` is what lets Polaris vend scoped credentials for the federated tables. Keep it as tight as the partner's layout allows, since this is the outer boundary of what any consumer receives.

Once registered, a query engine connected to Polaris sees those tables in its namespace listing and reads them with the same code path it uses for local tables. Nothing in the engine knows the difference.

## What this looks like from a consuming platform

Take a concrete flow. Customer engagement data lives in a CRM platform. Transaction history lives in a lakehouse. A marketing team needs both.

The old approach exports CRM data nightly, loads it into the lakehouse, and separately exports lakehouse aggregates back into the CRM platform for segmentation. Two pipelines, two copies, two drift windows.

The zero-copy approach runs both directions over Iceberg. The CRM platform registers the lakehouse tables and reads them through file federation, so a segmentation query scans transaction history at storage speed without waking the lakehouse engine. The lakehouse registers the CRM platform's Iceberg-format objects and queries them alongside its own tables. Salesforce ships this bi-directionally with Databricks, with the outbound direction sharing Data Cloud objects into Unity Catalog and the inbound direction reading lake data through file federation.

From an engineering perspective, the interesting part is that the join between customer profile and transaction history now happens at query time, in whichever engine the user is sitting in front of. The join key correctness problem does not go away. The synchronization problem does.

A query engine with a semantic layer adds one more move. Instead of every consuming tool defining its own join and its own filters, the engine publishes governed views over federated sources, and consumers read those views. On the Dremio side, that means Zero-ETL Federation across sources with the AI Semantic Layer on top, and since the SAP acquisition those governed views also surface into SAP Business Data Cloud. The transferable point is not the product: it is that federation without a semantic layer moves the inconsistency problem from pipelines into ad hoc queries, which is not obviously an improvement.

## Failure modes

**The source becomes your availability ceiling.** A federated dashboard is up only when the source is up. Under the copy model, a source outage delayed tomorrow's data. Under federation, it breaks today's dashboard. Inventory which of your federated sources have an SLA and which do not.

**Runaway cost on the source's bill.** A single BI dashboard set to auto-refresh generates continuous federated queries against a source whose owner never agreed to the pattern. Cap concurrency, cache results where staleness is acceptable, and put the source owner in the loop before a federated dashboard goes to a wide audience.

**Pushdown that silently degrades.** A query that used to push down a filter stops doing so after a rewrite, a function change, or a connector upgrade. Nothing errors. The data transferred goes up by three orders of magnitude. Monitor bytes scanned per federated query and alert on step changes.

**Cross-region egress.** File federation reading a bucket in another region charges per byte, on every query, forever. Cheap in a demo, expensive at production volume. Check region alignment before choosing file federation over query federation.

**Permission models that do not compose.** The source enforces its rules. The consumer enforces its own. A user authorized in one and not the other produces either a leak or a confusing denial. This is the strongest argument for catalog federation, since it puts the decision in one place.

**Schema evolution surprises.** Iceberg handles added columns gracefully. It does not protect a downstream consumer from an upstream team dropping a column or changing semantics without telling anyone. Federation removes the pipeline that used to break loudly and gave you warning. Add contract tests against federated sources, and run them on a schedule rather than only at integration time.

**Small file problems become someone else's problem.** A source table with two hundred thousand tiny files makes every federated read slow, and the consumer cannot fix it. Table maintenance quality on the source side is now part of your performance profile.

**Metadata caching staleness.** Consumers cache table metadata to avoid a catalog round trip per query. A source that commits every thirty seconds and a consumer caching for five minutes produce results that are correct and old. Set cache TTLs against actual freshness requirements and document them.

## A worked evaluation

Choosing between the mechanisms goes better with numbers than with principles. Here is a test that produces them in about a day.

Pick one real workload. A dashboard, a segmentation job, a feature pipeline. Something with a defined query pattern and a defined freshness requirement.

Measure the baseline first, under whatever architecture you have now. Record end-to-end latency from source commit to consumer visibility, storage cost of the duplicated data, compute cost of the pipeline, and engineering hours spent on the pipeline in the last quarter. That last number is usually the largest and the least tracked.

Then implement the same workload three ways against the same source.

Under query federation, record the wall-clock latency of the consumer query, the compute consumed on the source, and the number of bytes returned across the boundary. Check the source's query history to confirm that pushdown happened. If the source's query text shows a full table scan where your consumer query had a filter, pushdown failed and every other number is misleading.

Under file federation, record the same wall-clock latency, the bytes read from object storage, and the egress charge if the storage and the engine sit in different regions or clouds. Compare bytes read against the table's total size to confirm that pruning worked. A file federation read that scans the whole table means the consumer is not using Iceberg statistics, which is a configuration problem worth finding now.

Under the copy you already have, you have the baseline.

Now compare on four axes.

Freshness. Federation typically wins by a wide margin, since the copy's freshness is bounded by its schedule.

Total cost. This is the one that surprises. Add source compute for query federation, egress plus consumer compute for file federation, and storage plus pipeline compute for the copy. At low query volumes federation usually wins. At high query volumes against large tables, a well-maintained copy sometimes wins, particularly across regions.

Latency at the ninety-fifth percentile, not the median. Federation's tail is worse because it inherits the source's queueing behavior.

Operational surface. Count the components that break and who gets paged. A copy has a pipeline that fails predictably and loudly. Federation has a dependency that fails at query time and in front of a user.

Write the four numbers down for each option and the decision usually makes itself. Where it does not, the tiebreaker is who owns the source and whether they have agreed to the load.

## Governance across the boundary

Federation moves data access across an organizational line, and the governance question changes shape with it.

Start with identity. The valuable property is that the person or agent running the query is the identity the source authorizes. A federation configured with one shared service account gives you the convenience of federation and the audit quality of a shared password. Push end-user identity through the catalog wherever the platforms support it.

Scope credentials narrowly. Catalog federation with vended credentials means a consumer receives access to one table's prefix for a few minutes, rather than standing access to a partner's bucket. That difference is what makes federation acceptable to a security review.

Decide where row and column rules live. Object-level permissions live in the catalog. Rules that depend on data values live in views or in a policy engine layered on top. Defining them once, on the shared layer, is the only version of this that stays consistent as consumers multiply. Defining them per consuming platform guarantees drift.

Log both sides. The source logs what was read. The consumer logs who asked. Neither log alone answers a compliance question, and correlating them after an incident is much easier if both carry a shared request identifier.

Agree on retention explicitly. A federated consumer holds no copy, so the source's deletion is immediately effective downstream. That is a feature under privacy regulation and a hazard under audit requirements that expect a consumer to reproduce what it reported last quarter. Write down which one applies before someone finds out the hard way.

Set data contracts with the source team. Federation removes the pipeline that used to break loudly when an upstream schema changed. Replace it with automated contract tests that run against the federated source on a schedule and fail visibly. A dropped column that surfaces as a broken dashboard three weeks later is worse than a pipeline that failed the night it happened.

Finally, treat the catalog as production infrastructure. Every federated query passes through it for metadata and credentials. Its availability is now the availability of every consumer that depends on a federated source, which is a larger blast radius than most teams assign to a metadata service.

## When copying is still right

Zero copy is not the answer to everything, and pretending otherwise leads to architectures that fail under load.

The test is whether a copy earns its maintenance cost. Copy when the source cannot support the query pattern. An operational database serving a transactional application should not absorb analytical scans, federated or otherwise.

Copy when you need a stable historical record independent of the source. If the source deletes or overwrites data on its own retention schedule, federation gives you a view that changes underneath you. Regulatory retention requirements usually mean a copy.

Copy when transformation is substantial. Federation reads what exists. If your consumer needs heavily reshaped, cleaned, and conformed data, that transformation runs somewhere and produces a materialized result, which is a copy with a different name.

Copy when latency requirements are strict and the source is far away. A network hop across regions has a floor you cannot optimize past.

Copy when the source's availability is worse than your requirement. No amount of architecture fixes a dependency that is down more than you can tolerate.

Copy when the source charges you for reading it in a way that scales badly with your access pattern. A per-query or per-byte charge that looked reasonable in evaluation becomes the dominant line item once a hundred analysts and a dozen agents start hitting the same federated table all day.

Copy when the access pattern is genuinely repetitive. A dashboard that runs the same aggregate a thousand times a day against unchanging data does not need a live read. It needs a materialized result refreshed on a schedule, which most engines provide as a caching or reflection feature rather than as a hand-built pipeline. That is a copy, and it is the correct one.

The honest framing is that zero copy eliminates unnecessary copies. Necessary ones remain necessary.

## Where this goes

Three directions look durable.

Catalog federation keeps displacing point-to-point pairings, because the N-squared problem does not solve itself and every vendor eventually reaches the limit of pairs it wants to build.

The AI consumption pattern raises the stakes. Agents query at high frequency without a human noticing that a result looks wrong, and they aggregate across sources by default. That pushes governed semantics and query-time policy enforcement toward the shared layer, since a federation without consistent definitions gives an agent several plausible answers to the same question.


Format convergence work reduces the remaining friction between table formats, which widens the substrate that zero copy runs on. Delta and Iceberg metadata compatibility proposals point the same direction as UniForm did, with less translation in the middle.

One more shift is quieter and probably more consequential. As business platforms rather than engineering tools become the consumers of lakehouse tables, the number of systems that need to read a given table goes up sharply, and most of them are operated by people who never see a Spark job. That raises the value of the shared layer and lowers the tolerance for per-pairing integration work. The platforms that handle this well will be the ones that treat the catalog as the product surface rather than the connector list.

## Conclusion

Zero copy is three mechanisms wearing one name. Query federation pushes work to the source's engine and pays with the source's compute. File federation reads Iceberg files directly and pays with egress and the consumer's compute. Catalog federation makes tables discoverable and governable in one place, and is the mechanism that scales past a handful of vendor pairings.

Apache Iceberg is what makes any of it work, because a published physical layout removes the need for vendors to implement each other's internals. That is the part worth building on, since it survives whichever vendor pairing goes out of fashion.

Pick the mechanism by where the compute should run and how much data crosses the boundary. Put the governance in the catalog rather than in each pairing. Add a semantic layer so that removing pipelines does not just relocate the inconsistency. And keep copying the data in the cases where copying is the correct engineering answer.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and interoperability. *Architecting an Apache Iceberg Lakehouse* covers federation, catalogs, and the platform decisions around sharing data across systems, and *Apache Polaris: The Definitive Guide* goes deep on catalog federation and credential vending. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
