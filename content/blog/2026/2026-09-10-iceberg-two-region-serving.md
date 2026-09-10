---
title: "Serving Iceberg Tables From Two Regions"
date: "2026-09-10"
description: "Three multi-region topologies that work and one that mostly does not, what an Iceberg commit costs across regions, and where the catalog has to live."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - multi-region
  - replication
  - catalogs
  - latency
canonical: https://iceberglakehouse.com/posts/iceberg-two-region-serving/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-two-region-serving/).

A team in Frankfurt runs the same dashboards as a team in Virginia, against the same tables, and the Frankfurt queries take four times longer. The data is in us-east-1. Every scan pulls bytes across the Atlantic, pays the latency on every file open, and shows up on the egress line of the bill at the end of the month. Somebody proposes putting a copy of the data in eu-central-1, and the conversation stops being about performance and starts being about correctness.

That is the multi-region serving problem, and it is a different problem from disaster recovery. Recovery asks how to bring tables back in a second region after the first one is gone, with a recovery point objective and a runbook. Serving asks how two regions read and write the same logical tables at the same time, continuously, while staying consistent. One is an event you rehearse. The other is a steady state you operate.

This piece is about the steady state: what an Iceberg commit costs across regions, three topologies that work and one that mostly does not, where the catalog lives, why replication lag becomes a correctness boundary rather than a performance detail, and what the whole arrangement costs. I work at Dremio, which sells software in this space, so weigh the recommendations accordingly. The mechanics are properties of Iceberg and object storage rather than of any product.

## What an Iceberg commit actually requires

Every multi-region design runs into the same constraint, so it is worth being precise about it.

An Iceberg commit is a compare-and-swap on a single pointer. The writer produces data files, produces manifests referencing them, produces a new metadata file describing the resulting table state, and then asks the catalog to move the table's current-metadata pointer from the old value to the new one, on the condition that it still holds the old value. If another writer moved it first, the commit fails and the writer retries against the new state.

Three properties fall out of that, and they decide everything downstream.

**Atomicity lives in exactly one place.** The catalog's conditional update is the serialization point for a table. Two writers in two regions committing to one table are contending on one row in one database, wherever that database is.

**Data files are immutable and position-independent in principle.** A Parquet file written in one region is a valid input to a reader in another region, provided the reader resolves its path. Nothing about the file cares where it was written.

**Metadata files name their contents by absolute path.** In format versions 1 through 3, a manifest records a full URI for each data file. A replica containing every byte in a second bucket still points at the first bucket unless something resolves that.

So the design space is bounded by physics on one side and by the pointer on the other. Bytes are cheap to replicate and expensive to move on the query path. The pointer is cheap to move and impossible to have in two places at once without a consensus protocol.

**The latency number that matters.** A cross-region round trip between, say, Virginia and Frankfurt is on the order of 90 milliseconds, and a commit involves several sequential round trips: read current metadata, attempt the swap, and on conflict, re-read and retry. A writer in Frankfurt committing against a catalog in Virginia pays that on every commit. For a batch job writing once an hour, nobody notices. For a streaming pipeline committing every thirty seconds, the commit path becomes a meaningful share of the job, and conflict retries multiply it.

## Topology one: single writer, readers everywhere

The topology that works for the largest number of teams, and the one to start from unless you have a reason not to.

One region owns writes for a table. The catalog lives there. Object storage replicates asynchronously to the second region. Engines in the second region read from the local replica and never write.

**How reads resolve.** The reader in region B needs the metadata pointer, which lives in region A's catalog, and the files, which exist in both places. It fetches metadata over the wire (small, one round trip, cached) and then reads data files locally. The bytes stay in region.

**How paths resolve.** Three options, and this is the choice that shapes the deployment. A shared access point or alias that routes to whichever replica is closest keeps the URI identical in both regions, so nothing has to be rewritten. A per-region storage configuration in the catalog, where the client is told a region-appropriate prefix, does the same job at the catalog layer. Or the reader rewrites the prefix itself, which works and is the most fragile of the three because it lives in client configuration rather than in the platform.

**What you get.** Local read throughput, no cross-region byte movement on the query path, a single serialization point with no distributed commit problem, and a topology whose failure behavior is easy to reason about.

**What you pay.** Reads in region B are stale by the replication lag. Writes from region B pay the full cross-region commit cost, which is why this topology says they do not happen. And region A remains a single point of failure for writes, which is a recovery question rather than a serving one.

**When it fits.** Analytical workloads with a clear write origin. Ingestion happens where the source systems are, and consumption happens everywhere. That describes most lakehouses.

The operational work is small: replication configured and monitored, a path-resolution strategy chosen, and a metadata cache in region B tuned so readers are not making a transatlantic call per query. That last item is easy to overlook and it is the difference between a good and a bad experience, because a query that reads locally but plans remotely still feels slow.

## Topology two: partitioned ownership

The next step up, and the one that scales to genuinely global platforms.

Every table has exactly one owning region, and different tables have different owners. European order data is owned by eu-central-1. North American clickstream is owned by us-east-1. Each region writes the tables it owns and reads replicas of the others.

This is single-writer applied per table rather than per platform, and the reason it works is that it never creates a table with two writers. The commit path for any given table has one serialization point, exactly as in topology one. What changes is that no single region is the write origin for everything.

**Naming makes or breaks it.** Ownership has to be legible from the table identifier, because the alternative is a lookup table nobody maintains. A namespace convention that encodes the owning region, or a catalog-level property on each table stating its owner, gives every engine and every engineer a way to answer "where does this get written" without asking.

**Cross-region joins are the interesting case.** A query joining a table owned in Frankfurt to a table owned in Virginia reads one locally and one from a replica. That works, and the freshness of the answer is bounded by the lag on the replicated side. For most analytical joins, minutes of lag on a dimension table is fine. For a join where both sides change constantly and the answer has to be point-in-time consistent across them, this topology does not give you that, and no topology short of a single region does.

**Failover is a change of ownership.** When a region goes down, tables it owned become read-only in the surviving region until you deliberately transfer ownership. That transfer is a runbook step with a real decision in it, because promoting a replica to writable accepts whatever was in flight at the moment of failure. Making the transfer explicit rather than automatic is the right default, since an automatic promotion during a partition is how you end up with two writers.

**Data residency comes free.** Regulatory requirements that certain data stays in a jurisdiction map naturally onto per-table ownership, and combining ownership with a per-catalog storage configuration in that region gives you a defensible answer to an auditor.

## Topology three: two writers, one table

This is what people usually mean when they say active-active, and it is the one to approach carefully.

Two regions writing the same table means two writers contending on one pointer. Making that work has exactly two shapes.

**Shape one: keep the catalog in one region.** Both regions write, and the writer in the remote region pays cross-region latency on every commit. This is correct, simple, and slow for the remote writer. It works fine for low-commit-rate workloads and becomes painful for streaming ones. The remote writer's data files also have to land where the reader expects them, which means either writing to the primary region's storage (paying egress on the write path) or writing locally and relying on replication before the commit is visible, which introduces a window where the pointer names files the primary region has not received yet.

That last problem is the sharp edge of this shape. A commit is atomic on the pointer, not on the files. If a Frankfurt writer commits a metadata file naming data files that have not finished replicating to Virginia, a Virginia reader following that pointer gets a missing-file error. The fix is ordering: replicate the data files, confirm, then commit. That confirmation step is not something Iceberg does for you.

**Shape two: use a database that spans regions.** Run the catalog on a distributed database that handles multi-region writes with consensus. Commits are then linearizable across regions, and both writers are first-class. The cost is a consensus round trip on every commit, which is the same latency you were trying to avoid, now paid inside the database rather than in the client. Distributed Postgres-compatible engines make this practical, and some catalogs document them as supported backends.

**Shape three, which is not a shape: two catalogs, one table.** Running independent catalogs in both regions, each holding a pointer to what it thinks is the current metadata for the same table, and reconciling later. There is no reconciliation that works. Two divergent commit histories on one table means two different tables that share a name, and merging them requires re-deriving a linear history that never existed. Do not do this, and be alert for architectures that accidentally amount to it.

The honest recommendation: reach for topology three only when a specific table genuinely needs writers in both places, price the commit latency before committing to it, and prefer partitioned ownership for everything else. Most requirements that sound like active-active are satisfied by per-table ownership plus fast failover.

## The path problem, in the serving case

Absolute paths in metadata are the constraint everyone hits. In a recovery scenario you solve it once, during the restore, with a batch rewrite. In a serving scenario you solve it continuously, because new metadata gets written every commit and it names the writing region's paths.

That difference rules out one common answer immediately. Rewriting paths on a schedule works for a replica you plan to read only after a disaster. It does not work for a replica you read every minute, because the rewrite is always behind the newest commit, and a reader following a rewritten pointer sees a table frozen at the last rewrite.

Three approaches survive continuous serving.

**Location-neutral URIs.** Create tables with a location that resolves in both regions: a multi-region access point alias, a global bucket alias, or a dual-region bucket where the provider guarantees the same path resolves everywhere. Metadata written in either region names a URI that any reader resolves, and nothing needs rewriting ever. This is the cleanest answer available today and it has one hard requirement: the tables have to be created that way. Retrofitting a location onto existing tables means a full metadata rewrite and a re-registration, which is a migration project rather than a configuration change.

**Client-side prefix mapping.** The reader in region B is configured to translate the primary region's prefix to a local one. Engines support this to varying degrees, and it does the job. Its weakness is that the mapping lives in every engine's configuration, so a new engine or a misconfigured cluster reads across regions silently, paying egress and latency while appearing to work correctly. That silent-failure property makes it the least attractive of the three.

**Catalog-mediated locations.** The catalog knows which region the caller is in and hands back region-appropriate storage configuration alongside the table. This puts the mapping in one place, which is the right place, and it composes well with credential vending since the catalog is already tailoring what it returns per caller. Support varies by catalog, so check before designing around it.

There is a fourth answer arriving rather than arriving: relative paths in metadata. Format work aimed at removing absolute paths from manifests eliminates this entire class of problem, because a replica's metadata resolves against wherever it happens to live. Tables written that way replicate without any of the above. That changes the calculus for multi-region designs substantially, and it is worth knowing which format version your platform is on and what the upgrade path looks like, because the design you build today has a shorter useful life than it looks like.

## Where the catalog goes

Every multi-region conversation eventually becomes a conversation about the catalog, because the catalog holds the only piece of state that cannot be trivially copied.

Four placements, with their real properties.

**Single-region catalog, cross-region clients.** The simplest. One catalog, both regions talk to it. Metadata calls from the remote region pay one round trip, and the query then reads locally. For an analytical workload that plans once and scans a lot, that round trip is amortized to nothing. For a workload issuing thousands of small queries, it is the dominant latency and it needs caching.

**Single-region catalog with regional read replicas.** The catalog database gets a read replica in the second region, and the catalog service there serves reads from it while forwarding writes to the primary. Read latency improves, and reads are stale by replication lag, which on a catalog means a reader occasionally sees a slightly older pointer. That staleness is usually acceptable and it is the thing to be explicit about, because a reader who commits based on a stale read gets a conflict rather than corruption.

**Distributed catalog database.** Consensus across regions, linearizable commits, higher commit latency, uniform behavior. Right when topology three is genuinely required.

**Independent catalogs per region with tables partitioned by ownership.** Each region runs its own catalog holding the tables it owns, plus federated or replicated entries for tables it only reads. This matches topology two, keeps each catalog's failure domain regional, and puts the coordination problem in the replication of catalog entries rather than in the commit path. Catalog synchronization tooling exists for this pattern and is worth evaluating rather than building.

Two things to decide alongside placement.

**Metadata caching in the remote region.** A client-side or gateway cache on table metadata cuts most of the cross-region round trips, with a TTL that bounds staleness. Setting the TTL is a freshness decision and it belongs to the data team rather than to whoever configures the engine.

**What happens to the remote region when the catalog region is unreachable.** With a single-region catalog, the answer is that the remote region cannot resolve tables and effectively stops, even though every byte it needs is sitting locally. Teams are frequently surprised by this, because they replicated the data and assumed that was the hard part. The catalog is the availability boundary for reads, not just for writes.

## Replication lag is a correctness boundary

In a recovery plan, replication lag is a recovery point objective: how much you lose. In a serving deployment it is something sharper, because queries run against the lagging replica continuously and their answers depend on it.

Three distinct effects, and they are not equally benign.

**Stale reads.** A reader in region B sees the table as of whatever has replicated. Minutes of staleness on an analytical table is usually fine and it should still be documented, because someone will eventually compare a number from region B against a number from region A and file a bug.

**Torn state.** More dangerous, and the one worth engineering against. A metadata file replicates before the data files it references, and a reader in region B follows a pointer to files that are not there yet. The query fails with a missing-file error that looks like corruption. Object storage replication makes no ordering guarantees across objects, so this is not a hypothetical.

The defense is to make visibility follow completeness rather than assuming they coincide. In a single-writer topology, the reader in region B gets the pointer from the primary catalog, so the window exists between the commit and the arrival of the last data file. Bounding it means either accepting a freshness delay deliberately, by having region B read a pointer that trails the primary by more than the replication lag, or verifying completeness before exposing a snapshot to the remote region.

**Divergent maintenance.** The subtle one. Snapshot expiry running in region A deletes data files that region B's readers are still using, because region B is following an older pointer. Expiry is correct from the primary's point of view and destructive from the replica's. Retention has to account for remote readers: the retention window in the primary region must exceed the maximum staleness of any remote reader, plus a margin. Get this wrong and region B sees intermittent missing-file errors that correlate with nothing except the maintenance schedule.

The three effects share a fix in structure: state a maximum acceptable staleness, monitor actual lag against it, and set retention and visibility from that number rather than from convenience. A dashboard showing replication lag next to the retention window makes the relationship visible to whoever is about to shorten one of them.

## What it costs

Multi-region serving has four cost lines, and their relative sizes surprise people.

**Duplicate storage.** Every replicated byte is stored twice. On a lakehouse this is a large absolute number and it is the cost people anticipate, so it rarely causes a problem.

**Replication transfer.** Cross-region replication charges per gigabyte replicated, and it applies to every new object, including the output of compaction. This is the line that gets missed. A compaction job rewriting 500 GB does not add 500 GB to the table, and it does add 500 GB to the replication bill, because every new object replicates. On a heavily compacted table the replication cost of maintenance exceeds the compute cost of maintenance.

That interaction has a design consequence: **compact before replicating, not after.** Replicating small files and then compacting in both regions replicates the small files and then replicates the compacted output, paying twice. Compacting in the owning region and replicating the result pays once. It also argues for less frequent, larger compaction runs on replicated tables than a single-region platform needs.

**Cross-region reads that should have been local.** The silent one. A misconfigured engine reading the primary's prefix from the remote region pays egress on every byte of every scan, and everything works, so nothing alerts. Monitoring egress by source bucket, broken out by requesting region, is what catches it. Most platforms that do multi-region serving have at least one workload doing this at any given time.

**Duplicate compute.** Engines in both regions, sized for their local workload. This is a real cost and a straightforward one.

A useful framing for a budget conversation: multi-region serving roughly doubles storage, adds a transfer line proportional to write and compaction volume, and buys back query egress and latency for the remote region's workload. Whether that trades well depends almost entirely on how much the remote region reads. A remote team running heavy analytics justifies it easily. A remote team running a handful of reports does not, and the right answer for them is cross-region reads with a cache.

## A worked example: one platform, two regions

Abstractions get slippery, so here is a concrete arrangement with the decisions filled in.

**The setup.** A retail analytics platform. Ingestion from North American systems lands in us-east-1. A European analytics team runs heavy exploratory queries. Two hundred tables, roughly 40 TB total, with about 200 GB of new data per day. European regulation requires that EU customer data stays in the EU.

**The topology.** Partitioned ownership. Roughly 30 tables holding EU customer data are owned by eu-central-1 and written by a regional ingestion pipeline. The other 170 are owned by us-east-1 and replicated to Europe read-only. No table has two writers.

**Naming.** Namespaces carry the owner: `eu.customers.orders` and `us.clickstream.events`. An engineer reading a query knows where each table is written without looking anything up, and a policy check on the EU namespace is a one-line rule.

**Paths.** New tables are created against location-neutral URIs. The 170 pre-existing tables were not, so they carry a client-side prefix mapping in the European engines as an interim measure, with a migration to rewrite locations scheduled per table. That migration is boring and slow and it is the right shape: each table gets rewritten once, during a maintenance window, rather than the platform carrying the mapping forever.

**Catalog.** One catalog in us-east-1 with a read replica in eu-central-1 serving metadata reads locally and forwarding writes. European ingestion for the 30 EU-owned tables pays a cross-region commit, which at four commits an hour per table is invisible.

**Freshness.** Stated maximum staleness for replicated tables is 15 minutes. Replication lag is alerted at 10. Snapshot retention on replicated tables is 7 days, comfortably above the staleness bound, and expiry runs only in the owning region.

**Maintenance.** Compaction runs in the owning region only. On replicated tables it runs daily with a filter, and the replication cost of the compaction output is tracked as its own line, which is what led to the decision to compact daily rather than twice daily.

**What broke first.** Two things, both predictable. A European Spark cluster deployed by a different team without the prefix mapping read across regions for three weeks, which showed up as an egress anomaly and not as an error. And a shortened retention experiment on one replicated table produced intermittent missing-file errors in Europe that took a day to attribute, because the failing queries were fine on retry once the reader picked up a newer pointer.

Neither of those is exotic. Both are the specific failures this design produces, which is the argument for writing them into monitoring on day one rather than discovering them.

## Engines and where they sit

The topology decides where data lives. Engine placement decides whether the topology delivers.

**Query engines belong in the region of the data they read most.** Obvious, and worth stating because shared-cluster economics push the other way. A single large cluster in one region serving both continents undoes the entire arrangement: every European query pulls bytes across the ocean regardless of the replica sitting locally.

**Ingestion belongs in the region of the source.** Writing from Europe into a US-owned table means either writing bytes across the ocean or writing locally and waiting for replication before the commit is safe. Both are worse than owning the table in Europe, which is the argument for partitioned ownership doing more work than it first appears to.

**Maintenance belongs in the owning region.** Compaction reads and rewrites large volumes. Running it remotely pays egress on the read and replication on the write.

**Interactive and batch have different tolerance for metadata latency.** A batch job planning once and scanning for twenty minutes does not care about a 90-millisecond metadata call. A BI tool issuing a burst of small queries cares a great deal, and that is the workload that justifies a catalog read replica or a metadata cache rather than accepting the round trip.

One placement worth calling out because it is increasingly common: agents and automated query clients. They generate many small queries with unpredictable table access, which is close to the worst case for cross-region metadata latency. If a chunk of your query volume comes from automated clients, the caching decision moves from optimization to requirement.

## Choosing between the topologies

| | Single writer | Partitioned ownership | Two writers, one table |
|---|---|---|---|
| Writers per table | One | One | Two |
| Commit latency for remote writes | Not applicable | Local, per owning region | Cross-region or consensus |
| Catalog placement | One region | Per region or one with replicas | One region or distributed |
| Data residency support | Weak | Strong | Weak |
| Failover | Promote a replica | Transfer ownership per table | Already active |
| Operational difficulty | Low | Moderate | High |
| Right for | Most analytical platforms | Global platforms, residency rules | Specific tables with a proven need |

The progression is deliberate. Start at the left, move right only when a requirement forces it, and move right per table rather than per platform.

## Verifying that a replica is actually complete

The assumption underneath every topology above is that the replica holds every file the pointer names. Object storage replication is asynchronous and occasionally silently incomplete, so that assumption deserves a check rather than trust.

Iceberg makes the check straightforward, because the table tells you exactly which files it needs. The `files` metadata table lists every data file in the current snapshot with its path, and the `manifests` and `metadata_log_entries` tables cover the metadata side.

```python
import re
import boto3
from pyiceberg.catalog import load_catalog

PRIMARY_PREFIX = "s3://lake-us-east-1/warehouse/"
REPLICA_BUCKET = "lake-eu-central-1"
REPLICA_PREFIX = "warehouse/"

catalog = load_catalog("lake", **{"type": "rest", "uri": "https://catalog.internal/api/catalog"})
s3 = boto3.client("s3", region_name="eu-central-1")

def replica_key(primary_path: str) -> str:
    # Map the primary URI onto the replica's key space. With location-neutral
    # URIs this function is the identity and the check gets simpler.
    return re.sub(r"^" + re.escape(PRIMARY_PREFIX), REPLICA_PREFIX, primary_path)

def missing_files(identifier: str) -> list:
    table = catalog.load_table(identifier)
    wanted = [row["file_path"] for row in table.inspect.files().to_pylist()]
    absent = []
    for path in wanted:
        key = replica_key(path)
        try:
            s3.head_object(Bucket=REPLICA_BUCKET, Key=key)
        except s3.exceptions.ClientError:
            absent.append(path)
    return absent

gaps = missing_files("us.clickstream.events")
print(f"{len(gaps)} files not yet present in the replica")
for path in gaps[:10]:
    print("  ", path)
```

Three things about that script matter more than the code.

**It answers a question nothing else answers.** Replication lag metrics tell you how far behind the pipeline is on average. This tells you whether one specific table is currently readable in the replica. Those are different facts, and the second one is what a reader in the remote region actually depends on.

**Run it as a gate, not as a report.** The useful version runs after a commit and before the remote region is told the new snapshot exists, which is how you close the torn-state window described earlier. Running it nightly and emailing the results is strictly worse than not running it, because it creates the impression of a control that is not controlling anything.

**HEAD requests cost almost nothing and add up.** At GET-tier pricing per thousand, checking a table with 50,000 files is cents. Checking every table every hour is not, so scope it: check tables whose snapshot changed, and sample the rest.

The metadata side deserves its own check, because a replica missing a manifest is unreadable even with every data file present:

```sql
-- Every metadata artifact the current state depends on
SELECT path FROM catalog.us.clickstream.events.manifests
UNION ALL
SELECT file AS path FROM catalog.us.clickstream.events.metadata_log_entries;
```

Feed those paths through the same existence check. A replica passing both checks is one a remote engine reads safely, and that statement is the thing you want to be able to make before pointing a European team at it.

## Failure modes and the drills that catch them

**The remote region is up and cannot see tables.** Catalog region unreachable, data all local, queries dead. Drill by blocking catalog access from region B and watching what happens. The result tells you whether you need a read replica or a cache, and it is better to learn it in a drill.

**Missing-file errors after a commit.** Metadata replicated ahead of data. Correlate the error timestamps against the commit and the replication metrics for those objects. Fix by delaying remote visibility or verifying completeness.

**Missing-file errors that correlate with the maintenance window.** Expiry in the primary removing files a lagging remote reader still needs. Distinguishable from the previous case by which files are missing: recently written in one case, long-lived in the other.

**Silent cross-region reads.** Egress bill climbs, queries are slower than they should be, nothing errors. Catch it with egress monitoring by region, and prevent it by using location-neutral URIs so there is no wrong prefix to configure.

**Two writers after a failover.** The one that damages data rather than availability. A partition where region B is promoted to writable while region A is still accepting writes produces two divergent histories. Prevent it with explicit rather than automatic promotion, and with a fencing step in the runbook that positively confirms the old primary is not writing before the new one starts.

**Replication silently stopped.** Configuration change, permissions change, or a bucket policy edit stops replication, and the replica quietly stops receiving objects. Reads keep working against increasingly stale data. Monitor replication lag as an alerting metric, not as a dashboard tile, and alert on lag exceeding your stated maximum rather than on replication errors, since a stopped replication produces no errors at all.

Rehearse the first, fourth, and sixth of those quarterly. They are the ones that produce the worst outcomes and the ones whose absence of symptoms makes them hard to notice in normal operation.

## An implementation checklist

For a team standing this up, in order.

- Decide the topology per table before creating anything. Single-writer, partitioned ownership, or dual-writer, with a reason recorded.
- Create tables with location-neutral URIs if your provider offers them. Retrofitting later is a migration.
- Place the catalog deliberately and decide what the remote region does when it cannot reach it.
- Configure a metadata cache in the remote region with an explicit TTL, chosen as a freshness decision.
- State a maximum acceptable staleness per table class, and monitor replication lag against it with alerts.
- Set snapshot retention longer than the maximum staleness of any remote reader, with margin.
- Compact in the owning region only, and replicate the compacted output rather than replicating small files.
- Monitor egress by source bucket and requesting region to catch silent cross-region reads.
- Make ownership legible from the table name or a catalog property.
- Write the failover runbook with explicit promotion and a fencing step, and rehearse it.

That list is short because the design decisions are few and consequential. Most of the difficulty in multi-region serving comes from making those decisions implicitly rather than from any of them being hard.

## Migrating an existing platform into this shape

Most teams reading this already have a single-region lakehouse and a growing complaint from a remote team. The migration has an order that avoids the expensive mistakes.

**Step one: measure the remote workload before designing for it.** How many queries, against which tables, reading how many bytes. Two thirds of the multi-region proposals I have seen described turn out to concern fewer than twenty tables. Replicating twenty tables is a different project from replicating a lakehouse, and knowing the number changes what you build.

**Step two: decide ownership per table, on paper, before touching anything.** For each candidate table, name the owning region and record why. Tables with an obvious single write origin are easy. The hard ones are tables written by pipelines in both places today, which usually turn out to be two logical tables that were merged for convenience, and splitting them is cheaper than making a dual-writer topology work.

**Step three: fix locations on the tables you are replicating.** Location-neutral URIs where the provider supports them, applied per table with a metadata rewrite and a re-registration in the catalog. This is the slow part and it parallelizes well. Do it before enabling replication, not after, so the replica never holds metadata with the wrong paths.

**Step four: enable replication for that table set only.** Bucket-wide replication on a lakehouse replicates everything, including tables nobody in the remote region reads and every byte of compaction output on those tables. Prefix-scoped replication rules matched to the chosen table set cut the transfer bill substantially and make the scope legible.

**Step five: stand up the remote engine and the metadata cache together.** A remote engine without local metadata resolution reads locally and plans remotely, which feels only slightly better than before and produces the conclusion that multi-region did not help.

**Step six: turn on the monitoring before the users.** Replication lag against a stated bound, egress by requesting region, and the completeness check on the replicated table set. All three exist to catch failures that produce no errors, so they need to be running before anyone depends on the arrangement.

**Step seven: add tables by request, with a threshold.** A table earns replication when remote read volume justifies the duplicate storage and transfer. Publishing that threshold turns an endless stream of requests into a self-service decision.

The whole sequence takes weeks rather than months for a scoped table set, and the step people skip is the first one. Designing a global topology for a workload that turns out to be four dashboards is the most common way this project costs more than it returns.

## Where this is going

Two changes will make this substantially easier within a couple of years.

**Relative paths in metadata.** Removing absolute URIs from manifests eliminates the path problem entirely, and with it the location-neutral URI requirement, the client-side mapping, and the retrofit migration. A replica becomes a valid table wherever it sits. This is the single largest simplification available to multi-region Iceberg, and it arrives with format evolution rather than with tooling.

**Catalogs taking on region awareness.** Catalogs that know the caller's region and respond with region-appropriate storage configuration, that replicate their own state across regions with defined semantics, and that expose ownership and failover as first-class operations, move this problem from a set of conventions into a supported feature. Managed catalogs have started shipping replication and failover as documented capabilities, and open-source catalogs are moving the same direction with synchronization tooling.

What will not change is the pointer. One table has one serialization point at any moment, and any design that pretends otherwise is going to produce two histories with one name. Everything else in multi-region Iceberg is engineering around that constraint, and the constraint itself is the reason Iceberg commits are correct in the first place.

## Conclusion

Serving Iceberg tables from two regions is a solved problem when you accept one rule: a table has one writer at a time. Under that rule, the topologies are straightforward. One region owns writes and everyone reads locally. Or ownership is partitioned per table so no region is a bottleneck. Both give you local read throughput without a distributed commit problem.

The work sits in four places. Paths have to resolve in both regions, which is a decision made at table creation and painful to retrofit. The catalog has to be placed deliberately, because it is the availability boundary for reads whether or not the data is local. Replication lag has to be stated as a number and used to set retention, because expiry in the primary region deletes files a lagging reader still needs. And costs have to be watched on the replication and egress lines rather than only on storage, because compaction output replicates and misconfigured readers pay egress silently.

Two writers on one table remains the hard case and it is usually avoidable. Before building it, price the commit latency, and check whether per-table ownership plus a rehearsed failover satisfies the requirement instead. It usually does, and it costs a fraction as much to operate.

## Keep Going

If this piece was useful, I have written a lot more on Iceberg architecture and operations. *Architecting an Apache Iceberg Lakehouse* covers how storage, catalogs, and engines fit together across environments like this one, and *Apache Iceberg: The Definitive Guide* covers the commit mechanics and metadata layout the topologies above are built on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
