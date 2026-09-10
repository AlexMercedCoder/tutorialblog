---
title: "How Iceberg Catalogs Hand Engines Storage Access"
date: "2026-09-10"
description: "Credential vending end to end: the wire protocol, scoped access on each cloud, remote signing, credential lifetime on long jobs, and failures that look like bugs."
author: "Alex Merced"
category: "Data Security"
tags:
  - credential vending
  - Apache Iceberg
  - Apache Polaris
  - access control
  - remote signing
canonical: https://iceberglakehouse.com/posts/iceberg-vended-credentials/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-vended-credentials/).

Look at how most lakehouses were wired in 2023. Spark had an IAM role with read and write on the whole data bucket. Trino had another one. The Python notebook someone ran on a laptop had a static access key pasted into a config file, and that key had been there for eight months. Every engine that touched the lakehouse held broad, long-lived storage credentials, and the catalog told it where the files were.

That design has an obvious problem: authorization lives in two places that do not agree. The catalog knows the user has read access to three tables. The storage policy grants the engine read access to the entire bucket. Whichever is more permissive is what actually applies, and it is always the storage policy.

Credential vending closes that gap. The engine holds no storage credentials at all. It asks the catalog for a table, the catalog checks what that identity is allowed to do, and it hands back a short-lived credential scoped to exactly those files. Authorization lives in one place, and the credential expires on its own.

This piece covers the mechanism: the wire protocol, what "scoped" means on each cloud, the alternative called remote signing, lifetime and refresh behavior on long-running jobs, and the failure modes that make this look broken when it is configured wrong. I work at Dremio, which ships a catalog that does this, so the examples lean on open specifications and open-source implementations where possible.

## The problem with static storage keys

Three specific failures come out of giving engines their own storage credentials, and each one shows up eventually.

**Authorization drift.** The catalog RBAC model gets updated when someone changes teams. The bucket policy does not, because a different team owns it and the change request never got filed. The revoked user still reads the data by pointing any engine with the shared role at the file path. Catalog permissions become advisory.

**Credential sprawl.** Every engine, notebook, and pipeline needs credentials, so credentials proliferate into config files, environment variables, CI secrets, and Slack messages. The rotation story for a static key used by fourteen jobs is a project rather than a task, so it does not happen.

**Coarse granularity.** Storage policies express access in terms of buckets and prefixes. Table-level and namespace-level permissions do not map cleanly onto prefixes unless your layout was designed for it, and even then, adding a table means editing an IAM policy. The natural outcome is a policy granting access to everything under one prefix, which is the thing you were trying to avoid.

The design fix is to make the catalog the only holder of durable storage credentials, and to have it issue narrow, temporary ones on demand. That is credential vending, and the Iceberg REST catalog specification defines how a client asks for it.

## The mechanism, end to end

The sequence has five steps and one important property: the catalog is never in the data path.

**One. The client authenticates to the catalog.** An OAuth2 client credentials exchange, a token from an external identity provider, or a signed request, depending on how the catalog is configured. What comes out is a token identifying a principal.

**Two. The client asks for a table and signals that it wants delegated access.** The signal is an HTTP header, `X-Iceberg-Access-Delegation`, carrying `vended-credentials`, `remote-signing`, or both as a preference list. Without it, a catalog returns table metadata and no credentials at all, which is one of the most common reasons a working setup fails on a different client.

**Three. The catalog authorizes the request.** It resolves the principal to roles, evaluates grants against the requested table, and decides what that identity is allowed to do with it. This is the step that makes the whole design worth building, because it is the only place authorization gets evaluated.

**Four. The catalog mints a scoped credential.** On AWS this is an STS `AssumeRole` call with a session policy narrowing the permissions down to the table's prefixes and the operations the principal is entitled to. On GCS it is a downscoped token. On Azure it is a SAS token or a scoped OAuth token. The credential comes back to the client alongside the table metadata, with an expiration timestamp.

**Five. The client reads and writes storage directly.** Using the vended credential, with no further catalog involvement until the credential expires or another table is needed.

The property that falls out of step five is the one that makes this design scale: throughput is bounded by object storage rather than by the catalog. A catalog serving a thousand engines is handling metadata requests and credential mints, not bytes. That is why credential vending became the default delegation mode rather than the more restrictive alternative discussed later.

Two consequences follow from the catalog holding the durable credentials.

**The catalog's own storage role is powerful.** It has access to the storage locations of every table it serves, because it has to be able to delegate a subset of that access. Scoping that role tightly, per catalog rather than per account, is the highest-value hardening step available in a lakehouse.

**A catalog compromise is a storage compromise.** Not immediately, and not silently if you have audit logging, but the blast radius is real. This is the argument for treating the catalog service with the operational seriousness of a secrets manager rather than a metadata cache.

## What actually goes over the wire

The specification defines several places credentials appear, and clients differ in which ones they support. Knowing all of them shortens debugging considerably.

**The delegation header.** Sent by the client on table operations:

```http
GET /v1/prod_catalog/namespaces/sales/tables/orders HTTP/1.1
Host: catalog.internal
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
X-Iceberg-Access-Delegation: vended-credentials
```

The header value is a preference list. A client that handles both mechanisms sends `vended-credentials,remote-signing` and takes whichever the server provides. Some catalogs require the header and return no credentials without it. Some require a specific value and reject the other.

**Inline credentials on the table response.** The common path. `loadTable`, `createTable`, and `registerTable` responses carry a `storage-credentials` array, where each entry has a prefix and a set of configuration properties:

```json
{
  "metadata-location": "s3://lake/sales/orders/metadata/00042-abc.metadata.json",
  "metadata": { "...": "..." },
  "config": {
    "s3.region": "us-east-1"
  },
  "storage-credentials": [
    {
      "prefix": "s3://lake/sales/orders/",
      "config": {
        "s3.access-key-id": "ASIA...",
        "s3.secret-access-key": "...",
        "s3.session-token": "...",
        "s3.session-token-expires-at-ms": "1789000000000"
      }
    }
  ]
}
```

Three details in that payload matter operationally.

The credential is an array, not a single object, because a table's files sometimes live under more than one prefix. Clients apply the credential whose prefix is the longest match for the file being accessed, falling back to the top-level `config` block when nothing matches. A client that ignores prefix matching and uses the first entry works fine on single-prefix tables and fails confusingly on multi-prefix ones.

The expiration is expressed in milliseconds since the epoch, and it is the field a client uses to decide when to refresh. A client that ignores it discovers expiry as an access-denied error mid-job.

The property names are storage-specific. S3 uses `s3.access-key-id` and friends, GCS and Azure use their own. A client supporting one cloud silently ignores properties for another.

**The dedicated credentials endpoint.** The specification also defines an explicit endpoint:

```http
GET /v1/{prefix}/namespaces/{namespace}/tables/{table}/credentials
```

It returns a `LoadCredentialsResponse` carrying the same `storage-credentials` shape. This exists so a client refreshes credentials without reloading the entire table metadata, which matters on long-running jobs where the metadata has not changed but the session token has expired. Client support for this endpoint lags the inline path, and PyIceberg has tracked it as a gap while supporting inline credentials on table responses.

**Credentials attached to scan planning results.** Where server-side scan planning is implemented, the completed planning response carries credentials for the file scan tasks it returns. This is a third path, newer than the other two, and client support is thinner still. It matters because a planning response listing files across prefixes wants credentials matched to those files.

The practical takeaway: a catalog supporting vending and a client supporting vending still need to agree on *which* path. Most incompatibilities in this area are a client implementing only the inline path talking to a catalog that expects the explicit endpoint, or the other way around.

## Remote signing, the stricter alternative

Credential vending hands the engine a token good for a prefix and a window of time. Remote signing hands it nothing.

Under remote signing, the engine constructs each storage request and sends it to the catalog to be signed. The catalog signs it, scoped to that one object and that one operation, and returns the signed request. The engine then sends the signed request to object storage. The engine never holds a credential that works for anything other than the exact request it was signed for.

The comparison that matters:

| | Vended credentials | Remote signing |
|---|---|---|
| What the engine holds | A token for a prefix, valid for minutes | Nothing durable |
| Catalog involvement | Once per table, per refresh | Once per storage request |
| Blast radius of a leak | Everything under the prefix until expiry | One object, one operation |
| Catalog load | Low | Proportional to file count |
| Client support | Broad | Narrow |

Pick vending when throughput matters and the prefix scope is acceptable, which is most workloads. Pick remote signing when even a few minutes of prefix-scoped access is unacceptable, which is a real requirement in regulated environments where the auditor's question is not "how long was the token valid" but "which files did that identity touch, individually."

The cost of remote signing is a catalog round trip per file. On a scan touching 20,000 files, that is 20,000 signing requests against a service you now have to size for it. Teams that adopt remote signing usually pair it with aggressive file-size targets, because larger files mean fewer signing calls, and the maintenance economics shift accordingly.

Support is uneven. Some catalogs implement both mechanisms and let the client choose, some implement only vending, and some implement vending as the recommended path with remote signing available on request. Clients vary just as much. Confirm both ends before designing around it, and confirm with a test rather than a datasheet.

Recent Iceberg releases have moved toward standardized signer endpoint properties, so that engines configure remote signing the same way across catalogs instead of learning a per-vendor convention. That convergence is what makes remote signing practical to adopt at all.

## What "scoped" means on each cloud

The word "scoped" carries different mechanics per provider, and the differences show up as different failure modes.

**AWS.** The catalog calls STS `AssumeRole` with a session policy. The session policy is an intersection: the resulting credential holds the permissions common to both the assumed role and the session policy, never more. So the catalog narrows down from its own role, and the credential cannot exceed what the catalog itself has. Session policies have a size limit, which becomes a real constraint on tables spanning many prefixes, and hitting that limit produces an STS error rather than a graceful degradation. Maximum session duration is bounded by the role's configured maximum, which is why a role with a one-hour cap silently caps every vended credential at one hour regardless of what the catalog requests.

**Google Cloud.** The catalog produces a downscoped token using Credential Access Boundaries, restricting the token to specific buckets and object prefixes. Boundary rules have their own count limits, and the catalog typically generates a service account whose permissions the administrator has to grant explicitly. That last part surprises people: enabling vending on a catalog does not by itself give the catalog's service account access to the storage it needs.

**Azure.** The catalog issues a SAS token or a scoped OAuth token against the storage account or container. Scoping granularity depends on the storage account configuration, and hierarchical namespace settings change what is expressible.

Three things are true on all three clouds and worth internalizing.

**The credential cannot exceed the catalog's own access.** Vending is always a narrowing operation. A table whose files sit outside what the catalog's role reaches produces a credential that authenticates and then fails on access.

**Prefix scoping is only as good as your layout.** If two tables with different sensitivity share a prefix, a credential scoped to that prefix reaches both. Table-per-prefix layouts are what make vending's scoping meaningful, and lakehouses built before vending existed frequently do not have them.

**Deny beats allow.** A resource-based policy on the bucket that explicitly denies an action for externally issued sessions overrides everything the catalog granted. This produces the single most confusing failure in this whole area, covered below.

## Lifetime, refresh, and long jobs

Credential lifetime is a tradeoff with a clear shape. Shorter lifetimes limit exposure and increase catalog request volume. Longer lifetimes do the reverse. The constraint that decides it is usually neither security nor load, but the runtime of your longest job.

A Spark job scanning a large table for two hours, holding a credential minted for one hour, hits expiry mid-scan. What happens next depends entirely on the client.

**A client that tracks expiration and refreshes** calls the credentials endpoint or reloads the table before the token expires, and the job continues. This is the behavior you want and it is not universal.

**A client that ignores expiration** issues a storage request with a dead token and gets an access-denied error. The error surfaces as a storage permission problem, which sends the on-call engineer to look at IAM policies rather than at token lifetime. This misdiagnosis costs hours the first time it happens on any platform.

**A client that caches credentials across tables** applies a credential scoped to one table's prefix against another table's files. The failure is an access denial that appears intermittently, depending on which table the query touched first.

Four practices avoid all three.

**Set lifetime against your longest job, then test it.** Not your median job. Find the longest-running read, and confirm it completes with the lifetime you configured.

**Verify refresh behavior per client.** Spark with the Iceberg runtime, PyIceberg, Trino, and DuckDB all behave differently. Run a job that deliberately outlives the credential on each client you deploy, and watch what happens. This is a one-afternoon test that prevents a recurring incident.

**Prefer the credentials endpoint where the client supports it.** Refreshing a credential without reloading table metadata is cheaper and avoids the subtle case where a refresh picks up a newer table snapshot mid-job.

**Alert on credential-related access denials separately.** They look like storage permission errors and they are not. Tagging them distinctly in monitoring turns a two-hour investigation into a two-minute one. The signature to match on is an access denial carrying a session identifier rather than a long-lived principal, and most cloud providers put enough in the error to distinguish the two.

## Configuring it end to end

Here is a worked configuration. The Spark side first, connecting to a REST catalog with vending enabled and no storage credentials configured anywhere in the engine:

```python
spark = (
    SparkSession.builder
    .config("spark.sql.extensions",
            "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
    .config("spark.sql.catalog.lake", "org.apache.iceberg.spark.SparkCatalog")
    .config("spark.sql.catalog.lake.type", "rest")
    .config("spark.sql.catalog.lake.uri", "https://catalog.internal/api/catalog")
    .config("spark.sql.catalog.lake.warehouse", "prod_catalog")
    .config("spark.sql.catalog.lake.credential", "CLIENT_ID:CLIENT_SECRET")
    .config("spark.sql.catalog.lake.scope", "PRINCIPAL_ROLE:ALL")
    # Ask for delegated access. Without this the catalog returns metadata
    # and no credentials, and the engine falls back to whatever ambient
    # credentials it has, which is the situation vending exists to remove.
    .config("spark.sql.catalog.lake.header.X-Iceberg-Access-Delegation",
            "vended-credentials")
    # The FileIO that knows how to consume vended S3 properties.
    .config("spark.sql.catalog.lake.io-impl",
            "org.apache.iceberg.aws.s3.S3FileIO")
    .getOrCreate()
)
```

Notice what is absent. No access key, no secret, no instance profile assumption, no bucket configuration. If a credential appears anywhere in that config, you have not removed the ambient-credential problem, you have added a second path to the same data.

The PyIceberg equivalent is smaller, and the REST catalog client sends the delegation header by default:

```python
from pyiceberg.catalog import load_catalog

catalog = load_catalog(
    "lake",
    **{
        "type": "rest",
        "uri": "https://catalog.internal/api/catalog",
        "warehouse": "prod_catalog",
        "credential": "CLIENT_ID:CLIENT_SECRET",
        "scope": "PRINCIPAL_ROLE:ALL",
    },
)

table = catalog.load_table("sales.orders")
df = table.scan(row_filter="order_date >= '2026-09-01'").to_arrow()
```

The credential handling happens inside `load_table`. The response carries `storage-credentials`, the client applies longest-prefix matching to pick the right entry, and the FileIO built for that table uses it. Nothing in user code touches a key.

On the catalog side, the configuration that makes this work has three parts, whatever the implementation: a storage configuration on the catalog naming the base location and the role or service account the catalog assumes, a trust relationship allowing the catalog to assume that role, and grants in the catalog's own RBAC model determining what each principal receives.

The verification step people skip: confirm the full path works, not just that the API call succeeds.

```python
# The real test. Metadata calls succeeding proves nothing about storage access.
table = catalog.load_table("sales.orders")
print(len(table.scan(limit=10).to_arrow()))          # read path
table.append(small_arrow_table)                       # write path
```

A table that loads, plans, and then fails on the first byte read is the normal shape of a vending misconfiguration.

## Catalog load and sizing

Vending puts the catalog on the critical path for storage access in a way plain metadata serving does not, and the sizing consequences are worth working out before the platform grows into them.

**Credential mints are more expensive than metadata reads.** A `loadTable` without delegation is a database lookup and a JSON response. The same call with delegation adds a call to the cloud provider's token service, which is a network round trip to an external system with its own rate limits and its own latency distribution. Catalog p99 latency after enabling vending is dominated by that dependency rather than by the catalog's own database.

**Provider rate limits are real.** Token services throttle. A platform where every query start mints a fresh credential for every table it touches generates far more mint calls than anyone estimated, and the throttling appears as intermittent catalog errors under load, at the worst possible time.

Three mitigations, in order of effectiveness.

**Cache mints server-side, keyed by principal and scope.** A credential minted for a principal against a table's prefix is reusable for other requests from that principal against the same scope until it nears expiry. This collapses mint volume dramatically on platforms with many small queries, and it is the single most effective thing a catalog implementation does for scalability here. Check whether yours does it.

**Give clients enough lifetime that they stop asking.** A five-minute lifetime on a platform running thousands of short queries produces a mint storm. Longer lifetimes with proper client refresh cut it, at the cost of a wider exposure window.

**Scope at the level that matches access patterns.** A credential scoped per table forces a mint per table, so a query joining twelve tables mints twelve credentials. Namespace-level scoping, where your security model tolerates it, cuts that to one. The tradeoff against blast radius is explicit and is a decision worth making deliberately rather than inheriting from a default.

Instrument three things: mint rate, mint latency p99, and throttling errors from the token service. Those three catch the problem before it becomes an outage, and none of them appears on a default catalog dashboard.

## Six failures and what they actually mean

These account for nearly every "vended credentials are broken" report I have seen described.

**The client never asked for delegation.** The catalog returns table metadata with no `storage-credentials`, the engine falls back to ambient credentials, and one of two things happens. Either the engine has ambient credentials and everything works, which is worse than failing because you now believe vending is on when it is not. Or it has none, and the failure is a generic missing-credentials error that points nowhere near the catalog. Diagnose by inspecting the raw `loadTable` response for a `storage-credentials` key.

**Storage policy explicitly denies the vended session.** The catalog mints a valid credential, the engine authenticates with it, and the object store refuses the write because a resource-based policy denies that action for sessions of that type. Every catalog API call succeeds. Table creation succeeds. The first data file write fails with an access-denied error naming a policy the catalog does not control. This is the most confusing failure in the entire area, because the catalog is behaving correctly and the error appears in the engine. The fix lives in the bucket policy, and finding it requires reading the deny statements rather than the allow statements.

**Credential expired mid-job.** Covered above. Distinguishable from a permissions problem by the timing: the job ran successfully for exactly the credential lifetime and then failed. That correlation is the diagnostic.

**The catalog's own role does not reach the table's location.** Someone registered a table whose files live in a bucket the catalog was never granted access to. Vending is a narrowing operation, so the catalog cannot delegate what it does not hold. The credential comes back and fails on use. Check the catalog's storage configuration against the table's actual `metadata-location`, which is frequently not where anyone assumed.

**Session policy size exceeded.** A table spanning many prefixes produces a session policy larger than the provider allows. The error comes from STS or its equivalent rather than from the catalog or the engine, and it appears only on specific tables, which makes it look like table corruption. The fix is layout: fewer, broader prefixes per table.

**Prefix matching ignored by the client.** On a table with files under multiple prefixes, a client that applies the first credential to everything fails on files outside that prefix. Presents as partial scan failures, where some files read fine and others do not. Look at whether the failing files share a prefix distinct from the succeeding ones.

A pattern runs through all six: the error surfaces in the engine, at the storage layer, while the cause sits in the catalog configuration or the storage policy. Building the diagnostic habit of dumping the raw `loadTable` response as the first debugging step saves more time than any other practice here.

## The audit trail you get, and the one you do not

Moving authorization into the catalog changes what your logs can answer, in both directions.

**What you gain.** Every credential mint is an authorization decision with a principal, a table, a scope, and an expiry attached. That is a far better record than a storage access log, because the storage log shows a shared role reading an object and says nothing about which human or which job was behind it. With vending, the catalog event names the identity, and the storage log records the session that identity was given. Joining the two gives you an answer to "who read this table and under what grant" that static credentials never supported.

**What you lose.** The catalog sees the mint, not the use. A credential scoped to a table's prefix and valid for fifteen minutes reads every file under that prefix, and the catalog has no record of which ones. Storage access logs fill that gap, and they identify the session rather than the person, so the join back to identity depends on the session identifier appearing in both places.

Three practices make this usable rather than theoretical.

**Log the mint with enough fields to join.** Principal, table, granted scope, expiry, and the session identifier the cloud provider assigned. That last field is the join key and it is the one most often missing.

**Enable storage access logging on the buckets holding table data.** It is cheap, it is the only record of actual object access, and enabling it after an incident does not reconstruct the past.

**Keep both for the same retention window.** A mint log retained for ninety days joined against access logs retained for seven answers nothing beyond a week.

Remote signing collapses this problem, which is its real appeal in regulated settings. Every object access is a catalog request, so the catalog log is complete on its own with no join required. That completeness is what people are buying when they accept a round trip per file, and framing the choice as a security-versus-throughput tradeoff misses that it is also an audit-completeness tradeoff.

## Migrating a lakehouse off static keys

Turning vending on is easy. Removing the static credentials that were there first is the actual project, and doing it in the wrong order breaks production.

The sequence that works has five phases.

**Phase one: inventory the ambient credentials.** Every place an engine holds storage access. Instance profiles, service accounts on Kubernetes workloads, static keys in CI, keys in notebooks, keys in a config repository somebody forgot about. This inventory takes longer than expected and it is the deliverable that determines whether the rest of the project is possible.

**Phase two: fix the layout.** Prefix scoping only means something when table prefixes correspond to the access boundaries you want. Tables sharing a prefix with tables of different sensitivity need to move first, and moving them is a data operation with its own planning. Skipping this phase produces vending that technically works and grants far more than intended, which is the worst outcome, because it looks finished.

**Phase three: turn vending on alongside ambient credentials.** Both paths active. Engines request delegation, receive credentials, and use them, with the ambient credentials still present as a fallback. Nothing breaks, and the catalog audit log starts filling with mint events that tell you which workloads are actually using the new path.

**Phase four: verify per workload.** Compare the mint log against the workload inventory. Anything in the inventory with no corresponding mint events is still on ambient credentials, and that list is your remaining work. Chase each one individually. This phase is where the long tail lives: the scheduled job nobody owns, the client library version too old to send the delegation header, the notebook environment with a key in it.

**Phase five: remove the ambient credentials, one workload at a time.** Never in bulk. Remove, run, watch, move on. The rollback is putting the credential back, which is why doing this incrementally matters.

Two things make phase five safer. Storage access logs identify which sessions are still using the old role, so you can confirm silence before removing it rather than confirming breakage after. And a deny statement scoped to the old role, applied in a staging environment first, tells you what breaks without committing to the removal.

The trap in this whole sequence is declaring victory at phase three. Vending working is not the same as static credentials being gone, and a platform with both is strictly worse than a platform with only static credentials, because it carries the operational complexity of vending with none of the security benefit.

## The multi-engine case

Delegation gets more interesting when several engines touch the same tables, which is the situation the REST catalog was built for.

**Spark** with the Iceberg runtime supports vending well and is the most exercised path. The configuration shown earlier is close to complete. Watch credential lifetime against long-running jobs, and watch for executors caching FileIO instances across tables.

**Trino** connects to REST catalogs with delegation and has its own configuration surface for it. The behavior worth testing is whether a single Trino cluster serving many concurrent users mints per-user credentials or one shared credential, because that distinction decides whether your audit trail names people or names Trino.

**PyIceberg** sends the delegation header by default and handles inline credentials with prefix matching. Its gaps are in the newer paths: the dedicated credentials endpoint and credentials attached to scan planning results. For short analytical reads none of that matters. For a long-running Python service it does.

**DuckDB** and other single-node engines reach REST catalogs increasingly well, and they are where the ambient-credential habit dies hardest, because a laptop with a key in an environment variable is the path of least resistance for an analyst. Vending on these clients is the highest-value place to enforce it, since laptops are also where credentials leak.

**Agents and automated clients** are the newest case and the one that changes the calculus. An agent issuing queries on behalf of a user needs a credential scoped to what that user is allowed to see, not to what the agent's service account is allowed to see. Vending supports that cleanly when identity propagates from the user through the agent to the catalog, and it fails to mean anything when the agent authenticates as itself. That propagation question is worth settling in the design phase, because retrofitting per-user identity into an agent that was built with a service account is a rewrite rather than a configuration change.

Across all of them, one rule holds: test each client against the catalog you actually run, with a real read and a real write, and re-test after client upgrades. Delegation support is an area where behavior changes between minor versions, and the failure mode is silent fallback rather than an error.

## Evaluating a catalog on delegation

Six questions to answer with a test rather than a datasheet, before committing a platform to a catalog.

**Which delegation modes does it implement?** Vending, remote signing, or both. And which does the client you deploy actually use with it.

**Which credential paths does it serve?** Inline on `loadTable` is table stakes. The dedicated credentials endpoint matters for long jobs. Credentials on scan-planning responses matter if you plan to use server-side planning.

**What is the maximum credential lifetime, and is it configurable?** A catalog with a fixed short lifetime and a client without refresh support is an unworkable combination, and you want to know that before migration rather than during.

**How is scoping expressed?** Per table, per namespace, or per catalog. Per-catalog scoping means a credential for one table reaches every table in the catalog, which removes most of the security benefit while keeping all of the operational complexity.

**Does write vending actually work?** Test it. A catalog whose vended credentials permit reads and whose storage policy denies writes for external sessions is a real configuration that ships in production products, and it presents as full compatibility right up until the first append.

**What is in the audit trail?** Every credential mint should produce an event naming the principal, the table, the scope, and the expiry. Without that, you have moved authorization into the catalog and lost the ability to answer who accessed what, which is a bad trade.

That last question is the one most evaluations skip and most auditors ask first.

A seventh question applies if you run more than one catalog, which many platforms do during a migration: do the two catalogs vend credentials with the same property names and the same scoping semantics? An engine configured for one and pointed at the other frequently authenticates, loads metadata, and then fails on storage in a way that reads as a network problem. Running the same read-and-write test against both catalogs with the same client is a ten-minute check that saves a long afternoon.

## A short history of how we got here

The design makes more sense with the sequence that produced it.

The first Iceberg catalogs were client-side. Hive Metastore, Glue, a JDBC table, a filesystem convention. The client resolved the table location and then read storage with whatever credentials the process held. Nothing in that architecture had a place to put delegated access, because the catalog was a lookup rather than a service. Storage access and catalog access were separate concerns by construction.

The REST catalog changed the shape. Once the catalog is a server that authenticates the caller and answers every table request, it has both of the things delegation needs: an authenticated identity and a place to hold durable storage credentials. Credential vending appeared as an extension of that, and the specification grew the delegation header and the credential payloads to describe it.

Remote signing arrived alongside it for callers whose requirements the prefix-and-window model does not satisfy. The two mechanisms have coexisted since, with vending as the broadly implemented default and signing as the stricter option.

The part still settling is client coverage. The specification defines several credential paths, engines implement different subsets, and a catalog and client that both advertise support still fail to interoperate on a specific path. That is normal for a protocol at this stage, and it is why testing the exact pairing you deploy beats reading either side's documentation.

Knowing the sequence helps in one practical way. When you find an engine that resolves a table location and then reaches storage with its own credentials, you are looking at the pre-REST design pattern surviving in a modern deployment, and the fix is architectural rather than a setting.

## Where delegation is heading

Three developments are shaping this area over the next year.

**Property standardization.** The per-vendor conventions for configuring signing and vending are converging on shared property names in the specification, so an engine configures delegation once rather than per catalog. This is unglamorous and it is the difference between delegation being usable and being a per-integration project.

**Delegation inside scan planning.** As server-side planning moves from optional to common, the credential path shifts with it. A planning response returning file scan tasks with credentials attached, matched per prefix, becomes the primary path rather than a corner case, and client support has to catch up.

**Finer scoping by policy engines.** Catalogs delegating authorization decisions to an external policy decision point are able to make the vended scope depend on richer inputs than a role grant: row filters, column masks, purpose-based access. Expressing a column mask through a storage credential is not possible, since the credential grants file access and files hold whole rows, so this pushes toward architectures where the catalog or a gateway sits closer to the data path for policy-heavy tables. That tension between throughput and enforcement depth is the interesting unsolved problem in this area.

The direction is clear even if the details are not settled. Static storage keys in engine configuration are on their way out, the specification defines the replacement, and the remaining work is client coverage and consistent behavior across implementations.

## Conclusion

Credential vending moves a decision that used to live in two disagreeing places into one. The catalog authorizes the request and mints a credential scoped to what that identity is allowed to touch, valid for minutes. The engine holds nothing durable, reads and writes storage directly so throughput stays off the catalog, and refreshes when the token ages out.

Getting it working is mostly about the details that fail quietly. Send the delegation header, or the engine silently falls back to ambient credentials and you believe you have security you do not have. Set credential lifetime against your longest job and verify each client refreshes. Check the storage policy's deny statements, because they override everything the catalog granted. Confirm the catalog's own role reaches every location it serves. Test a real write, not just a metadata call, since the write path is where misconfiguration hides.

Then decide whether prefix-scoped access for a few minutes is tight enough for your data. For most workloads it is, and vending is the right default. For data where the audit question is which individual objects an identity touched, remote signing exists, it costs a round trip per file, and the constraint it puts on file counts is a maintenance decision as much as a security one.

The version of this worth aiming at: no engine in your platform has a storage credential of its own, and the catalog can tell you who read what, when, and under whose grant.

## Keep Going

If this piece was useful, I have written a lot more on catalogs, security, and lakehouse architecture. *Apache Polaris: The Definitive Guide* covers the catalog layer end to end, including RBAC, storage configuration, and credential delegation in practice, and *Apache Iceberg: The Definitive Guide* covers the table format and REST protocol underneath it. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
