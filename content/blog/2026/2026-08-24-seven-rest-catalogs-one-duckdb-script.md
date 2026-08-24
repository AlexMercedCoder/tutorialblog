---
title: "Can Seven Different Iceberg REST Catalogs Really Run the Same DuckDB Code?"
date: "2026-08-24"
description: "Can seven Iceberg REST catalogs run the same DuckDB script? What the protocol makes portable, what still differs, and a test matrix you can rerun."
author: "Alex Merced"
category: "Apache Iceberg"
canonical: https://iceberglakehouse.com/posts/seven-rest-catalogs-one-duckdb-script/
tags:
  - Apache Iceberg
  - REST catalog
  - DuckDB
  - Polaris
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/seven-rest-catalogs-one-duckdb-script/).

A question has been making the rounds in lakehouse circles this year, usually phrased with some disbelief: someone points DuckDB, the in-process analytical database, at an Apache Iceberg REST catalog, creates a table, inserts rows, runs an update, and then repoints the same script at a completely different catalog from a completely different vendor, and it mostly just works. Practitioners have been trading notes on running near-identical DuckDB code against a half dozen or more catalog implementations, open source and commercial, self-hosted and managed. The disbelief is earned. Five years ago, "same code, different catalog" was not a claim anyone in this ecosystem made with a straight face, and the people making it now include the maintainers of the client itself.

So this article takes the question seriously and rigorously. What exactly is the same across catalogs, what quietly differs, and what does a fair seven-catalog test actually measure? We will look at what DuckDB's Iceberg extension can genuinely do in 2026, write the common code, then walk seven REST catalog implementations, Apache Polaris, Lakekeeper, Apache Gravitino, Nessie, AWS Glue, Databricks Unity Catalog, and Snowflake Open Catalog, through the places where sameness holds and the places where it ends. I will also lay out the test matrix worth running yourself, because the most useful output of this exercise is a repeatable protocol, not a screenshot.

Disclosure before we start: I work at Dremio, whose Open Catalog is built on Apache Polaris, a project whose O'Reilly book I co-authored along with the Iceberg one. Every catalog below gets described from its documentation and public behavior, and the point of the article is the open protocol they share, not a ranking.

## Why This Question Is Even Askable

Rewind to the pre-REST era and the question dissolves into absurdity. Connecting an engine to a catalog meant engine-specific integration code per catalog: Hive Metastore's Thrift interface for one, AWS Glue's SDK for another, a homegrown API for a third. A small tool like DuckDB supporting seven catalogs meant building and maintaining seven clients, which is why small tools supported approximately zero catalogs and Iceberg access outside the big JVM engines meant reading static file paths without any catalog at all.

The Iceberg REST catalog protocol changed the economics. It is an OpenAPI specification, maintained in the Apache Iceberg project, defining one HTTP contract for the operations a catalog performs: listing namespaces, creating tables, loading table metadata, and, critically, committing changes. A client implements the protocol once and speaks to every conforming server. A server implements it once and serves every conforming client. The many-to-many integration matrix collapses into one row and one column.

The commit model is the part that makes writes portable, and it deserves a precise sentence. In the REST protocol, an engine does not swap metadata pointers itself. It sends the catalog a commit request carrying requirements, assertions about the table state it built against, and updates, the changes it wants. The catalog validates the requirements atomically and applies the updates, or rejects the commit for the client to retry. Concurrency control, the hardest part of multi-engine writing, lives behind the protocol on the server, identically shaped for every client. When DuckDB commits an insert to Polaris and to Glue with the same code, it is because both servers accepted the same commit conversation, not because anyone wrote Polaris-specific or Glue-specific commit logic into DuckDB.

Add credential vending, the protocol's mechanism for the catalog to hand clients short-lived, scoped storage credentials at table load, and the last integration barrier falls. A client no longer needs cloud-specific credential wiring per deployment. It asks the catalog for the table and receives, along with metadata, the keys to read and write exactly that table's storage. The protocol even lets the client declare its access delegation preference. This is the machinery that lets a single laptop process write to storage owned by five different platforms without holding standing credentials for any of them.

That is the theory. The seven-catalog question is whether the theory survives contact with seven independent engineering teams' implementations. Mostly, and the exceptions are the interesting part.

There is a historical rhyme worth hearing before we proceed, because this exact plot has run before. Databases once spoke proprietary wire protocols exclusively, and connecting a new tool to N databases meant N drivers, until standardized interfaces made "same code, different database" the baseline expectation, at which point the tool ecosystem exploded, since every small tool suddenly reached every database. The Iceberg REST protocol is playing that role for catalogs, and DuckDB is playing the role of the small tool whose reach proves the standard works. The historical version took a decade and left everyone unable to imagine the alternative. The Iceberg version is maybe three years in, and the seven-catalog experiment is the moment of proof arriving on schedule.

## What DuckDB's Iceberg Extension Can Do in 2026

The client side of this experiment matured fast, and dating the capabilities matters because anyone reproducing the test on an old DuckDB version will reproduce old limitations instead.

Reading came first, and for a long while reading was all there was: the iceberg extension was able to scan tables from metadata paths, no catalog attachment, no writes. The turning point was DuckDB 1.4 LTS in September 2025, which shipped initial write support, CREATE TABLE and INSERT through an attached REST catalog, with the catalog as the authority for commits and discovery. Version 1.4.2 added DELETE and UPDATE for v2 tables. By 1.5.3, the extension had grown MERGE INTO, ALTER TABLE for schema evolution, partition transforms, and Iceberg v3 support including deletion vectors written as Puffin files and the VARIANT type. In roughly a year, DuckDB went from Iceberg spectator to an engine covering most of the day-to-day DML surface.

Attachment follows DuckDB's normal idioms. REST catalogs mount through ATTACH with an Iceberg type, authentication rides DuckDB's secret workflow, OAuth2 client credentials for most catalogs, and credential vending is requested through an access delegation mode on the attachment. The official documentation carries a generic REST catalog recipe plus dedicated connection pages for Amazon S3 Tables, AWS Glue, Cloudflare R2 Data Catalog, Apache Polaris, Lakekeeper, SeaweedFS, and Google BigLake, which is itself evidence for this article's premise: one extension, one recipe shape, many servers.

Two honest caveats calibrate expectations. The extension's own documentation labels it experimental, and the feature surface is uneven at the edges, hidden partitioning behaviors, some metadata operations, corner-case type handling. And DuckDB does not yet implement the REST scan planning client from Iceberg 1.11, a gap with a tracked feature request, which matters against catalogs that enforce fine-grained policies at planning time: tables protected by such policies are exactly where the same-code claim currently stops for DuckDB. Neither caveat undermines the experiment. Both belong in its write-up.

One more fact for flavor, because it shows where this trajectory points: by December 2025, the DuckDB-Wasm build shipped the Iceberg extension, making browser-tab DuckDB a functioning Iceberg REST client. The seven-catalog test can, in principle, run without installing anything.

## Why DuckDB Is the Right Instrument for This Measurement

Before the code, a word on why this particular client makes the cleanest probe, because the experiment's design quality depends on it.

DuckDB carries no platform allegiance. It ships from an independent foundation, sells none of the seven catalogs, and its extension implements the protocol from the specification rather than from any vendor's SDK. When it behaves identically across servers, the sameness credits the protocol, and when it hits a difference, the difference belongs to a server, not to a partnership. A probe built from any vendor's own engine measures that vendor's integrations. This one measures the standard.

It is also the minimal sufficient client. A Spark cluster brings a JVM, a distribution's patches, a session's worth of configuration, and a hundred places for environmental variance to hide. DuckDB brings a single process reading a SQL script, which makes runs reproducible to a degree cluster-based tests never reach: same binary, same script, same laptop, seven endpoints. Experimental hygiene favors small instruments.

And it represents the future population of clients better than the incumbents do. The growth in Iceberg consumers is not more thousand-node clusters. It is embedded engines, notebooks, serverless functions, browser runtimes, and agent processes, small clients, numerous, short-lived, speaking REST. Testing catalog interoperability with the archetype of that population answers the question the next five years will actually ask, which is not "does Spark work everywhere," a settled matter, but "does everything else."

The instrument has one known bias, stated earlier and worth repeating in this context: no scan planning client yet, so the probe under-measures catalogs whose richest governance rides that endpoint. A perfect instrument this is not. An honest and improving one, it is, and re-running the same matrix on each extension release turns even its limitations into a longitudinal record of how fast the client side of this ecosystem closes gaps.

## The Common Code

Here is the script at the center of the question, in the shape the DuckDB documentation prescribes. Everything from the ATTACH statement down is the part that stays the same across catalogs:

```sql
INSTALL iceberg;
LOAD iceberg;

-- Authentication: OAuth2 client credentials via DuckDB's secret workflow
CREATE SECRET catalog_auth (
    TYPE iceberg,
    CLIENT_ID '<client-id>',
    CLIENT_SECRET '<client-secret>',
    OAUTH2_SERVER_URI '<token-endpoint>'
);

-- Mount the catalog; ask it to vend storage credentials
ATTACH '<warehouse>' AS lake (
    TYPE iceberg,
    ENDPOINT '<catalog-rest-endpoint>',
    ACCESS_DELEGATION_MODE 'vended_credentials'
);

-- From here on, it is just SQL against an attached database
CREATE SCHEMA IF NOT EXISTS lake.demo;

CREATE TABLE lake.demo.orders (
    order_id   BIGINT,
    region     VARCHAR,
    amount     DOUBLE,
    order_date DATE
);

INSERT INTO lake.demo.orders VALUES
    (1, 'EMEA', 120.50, DATE '2026-08-01'),
    (2, 'APAC',  75.00, DATE '2026-08-02');

UPDATE lake.demo.orders SET amount = 130.00 WHERE order_id = 1;

DELETE FROM lake.demo.orders WHERE order_id = 2;

ALTER TABLE lake.demo.orders ADD COLUMN channel VARCHAR;

SELECT * FROM lake.demo.orders;
```

Sit with how strange that script is by historical standards. An in-process database, running on a laptop, creates a governed table in enterprise object storage, performs row-level mutations that become Iceberg snapshots with delete files or deletion vectors, evolves the schema through a catalog-mediated commit, and reads its own writes, all in stock SQL, with no JVM, no Spark cluster, and no cloud SDK configuration beyond two secrets. Every statement below the ATTACH compiles to REST protocol conversations and Parquet writes that any conforming catalog accepts.

And be precise about what varies: the three placeholder groups at the top. The warehouse identifier, the endpoint URL, and the authentication material differ per catalog, and, as the next sections show, the ceremony to obtain them differs a great deal. The honest version of the seven-catalog claim is exactly this shape: identical verbs, different prologue. The interoperability the REST protocol bought lives entirely below the ATTACH line, and the friction that remains lives entirely above it.

## What One INSERT Actually Does on the Wire

To trust the sameness claim, watch what a single statement compiles into, because the wire is where seven implementations either agree or do not. Take the INSERT from the script and follow it.

First, attachment already did groundwork: the client called the catalog's configuration endpoint, learning the server's capabilities, path prefix, and defaults, then exchanged or validated credentials. This is where a conforming server and client negotiate their shared vocabulary before any table work.

The INSERT begins with a table load. The client requests the table from the catalog and receives its current metadata, schema, partition spec, current snapshot, and, because the attachment asked for vended credentials, storage credentials scoped to the table's location arrive in the same exchange. Everything the client needs to write, structure and keys alike, came from one governed conversation.

Next, the data write, which bypasses the catalog entirely. The client encodes the rows as a Parquet file, using the schema from the load, and puts it directly to object storage under the table's data location with the vended credentials. Then it writes the Iceberg metadata for the change: a manifest file describing the new data file with its statistics, and a manifest list for the prospective new snapshot. All of this is spec-defined file production, identical logic regardless of which catalog governs the table, which is precisely why it ports.

Last, the commit, back through the catalog. The client sends a commit request naming the table, carrying requirements, centrally, an assertion about the snapshot it built upon, and updates, the new snapshot and its metadata. The server validates the requirements against current state atomically. If no other writer moved the table since the load, the requirements hold, the server applies the updates, and the table's new snapshot exists for every reader of that catalog. If another writer got there first, the requirement fails, the server rejects the commit cleanly, and the client refreshes and retries against the new state.

Count the trust boundaries crossed: two catalog conversations, load and commit, bracketing direct storage writes performed with catalog-issued, expiring credentials. The catalog governs without touching data. The client writes data without holding standing credentials. And the entire exchange is the OpenAPI specification's script, which is why the same DuckDB binary performs it against a Rust single-binary catalog, a federated metadata service, and three hyperscaler-adjacent platforms without knowing which is which. When people say the REST protocol made catalogs interchangeable at the data plane, this trace is the claim, unrolled.

## Where Sameness Ends, Part One: Getting In

If you run this experiment, the hours go into the prologues, and cataloging where they go is most of the value.

Authentication style is the first fork. The protocol standardizes how a bearer token is used, not how you get one. Most self-hosted catalogs, Polaris, Lakekeeper, Gravitino, Nessie behind its authentication options, speak OAuth2 client credentials against a token endpoint, which maps directly onto DuckDB's secret shape. The managed platforms route through their own identity systems first: cloud-native signing and identity on the AWS side, workspace principals and personal access tokens or service principals on the Databricks side, programmatic access tokens and platform roles on the Snowflake side. None of this is illegitimate, enterprise identity was never going to standardize through a table format, but it means the first fifteen lines of the script get rewritten seven times while the last thirty run unchanged.

Bootstrapping the warehouse is the second fork. Before any client connects, someone must create the thing the ATTACH names: a catalog or warehouse object bound to a storage location, with a principal granted rights over it. Each implementation has its own ceremony, Polaris catalogs and principal roles, Lakekeeper warehouses and their project model, Gravitino metalakes and catalogs, Glue and its account-level data catalog with IAM policies, Unity metastores and catalogs and schemas with grants, Open Catalog's internal and external catalog distinction. The ceremonies express each platform's governance philosophy, and they are precisely the part no protocol covers, because the protocol begins at the moment a warehouse exists and a principal holds credentials for it.

Endpoint shape is the third, smallest fork. Everyone exposes the REST paths, but at different roots: a bare host for a self-hosted Polaris, a cloud service path for Glue's Iceberg REST interface, an account-scoped URL for Open Catalog, a workspace URL suffix for Unity. Plus prefixes: the protocol's warehouse prefix concept means the same logical operation lands on slightly different paths per server, which clients handle transparently once configured, and humans handle by reading documentation carefully once per catalog.

The pattern across all three forks is consistent and, once you see it, fair: the REST protocol standardized the data plane conversation and deliberately left the control plane, identity, provisioning, tenancy, to each platform. The seven prologues are not interoperability failures. They are the boundary of what interoperability was ever scoped to mean.

## Where Sameness Ends, Part Two: Storage and the Meaning of "Managed"

The second cluster of differences appears after authentication succeeds, and it is subtler because everything still looks like SQL.

Credential vending behavior tops the list. The common script requests vended credentials, and the catalogs differ in what they vend, scoped cloud-native tokens against S3, Azure, or GCS, how briefly the credentials live, and whether vending is on by default, opt-in per warehouse, or gated by the storage configuration the warehouse was bootstrapped with. When the seven-catalog experiment fails mid-script, the failure usually traces here: the table created fine, catalog conversation, but the INSERT's Parquet write hit storage with credentials the catalog declined to vend or scoped differently than expected. Reading each catalog's storage configuration documentation before testing saves an afternoon of misattributing storage errors to the protocol.

Managed versus external tables is the deeper split. Some platforms distinguish tables whose storage and maintenance they own from tables merely registered with them, and the distinction governs what external writers are allowed to do. A catalog can serve reads on a table it manages while restricting external commits to it, or accept external writes only into designated locations, or expose some tables read-only through the REST interface because their lifecycle belongs to the platform's own engine. The same CREATE TABLE, pointed at different namespaces of the same catalog, can succeed in one and be refused in the other, correctly, by policy. Cross-catalog testing has surfaced real confusion here, and the confusion is vocabulary, not protocol: "managed," "external," "foreign," and "federated" mean different things per platform, and the test write-up has to record which kind of table each catalog was asked to create. My working advice is to make the distinction a first-class column in your matrix rather than a footnote, because half the disagreements in community threads about whether a given platform "really supports external writes" dissolve the moment both parties state which table kind they tested.

Maintenance expectations follow from that split. A managed table on a platform with automatic compaction and snapshot expiration behaves differently over a long test than a table on a bring-your-own-maintenance catalog, not in correctness but in file counts and metadata growth. A fair multi-catalog comparison either disables such automation where possible or notes it, because otherwise the comparison partly measures janitorial services rather than protocol conformance.

And feature reach varies by format version. The v3 capabilities in newer DuckDB releases, deletion vectors, VARIANT, only work end to end where the catalog and its surrounding platform accept v3 tables, and v3 rollout across the seven is real but uneven. A rigorous test matrix runs its DML pass at v2 everywhere and repeats at v3 where supported, rather than letting format-version support masquerade as protocol incompatibility.

## The Seven Catalogs, One at a Time

With the difference clusters mapped, here is each implementation's documented posture toward exactly this experiment, what kind of thing it is, and where its prologue friction concentrates.

Apache Polaris is the Apache Software Foundation's REST catalog, born from a Snowflake and Dremio collaboration, donated to the ASF, and graduated to Top-Level Project in February 2026. It implements the protocol comprehensively, role-based access control, credential vending, and federation included, and it is one of the catalogs DuckDB's documentation walks through by name, quickstart to attachment. As a self-hosted service, its prologue is the OAuth2 client credentials pattern plus its own bootstrap ceremony of catalogs, principals, and principal roles. For a from-scratch reproduction of this experiment, Polaris is a natural anchor: fully open, fully spec-oriented, and runnable on the same laptop as DuckDB.

Lakekeeper is the lightweight entrant, a single Rust binary implementing the REST protocol, Kubernetes-friendly, with authorization delegated to OpenFGA and policy engines rather than an internal model. It also has a dedicated page in DuckDB's docs, and its project-and-warehouse bootstrap is among the fastest of the seven to stand up. Its appeal in this test is exactly its size: it demonstrates that protocol conformance does not require a platform attached.

Apache Gravitino comes at the protocol from the opposite direction, a federated metadata service spanning Iceberg alongside other catalogs, message systems, and filesystems, which exposes an Iceberg REST service as one of its faces. Its bootstrap involves its metalake hierarchy, and its REST service documentation is explicit about protocol versions it emits, including 1.11-era scan planning response shapes. In the experiment, Gravitino tests whether a metadata generalist speaks the specialist protocol faithfully, and its presence in DuckDB's own integration test fixtures suggests the answer the project intends.

Nessie is the transactional catalog with Git-style semantics, branches, tags, and commits over catalog state, reachable through an Iceberg REST interface in addition to its native API. The same DuckDB verbs run against it, and its distinctive value shows up in what surrounds them: the ability to run the whole DML pass on a branch and inspect it before merging is a workflow none of the other six offer natively. Its prologue includes its own server bootstrap and authentication choices.

AWS Glue represents the cloud-native incumbents, its data catalog now exposing an Iceberg REST interface, with S3 Tables as the adjacent managed-storage offering, both carrying dedicated DuckDB connection documentation. The prologue here is IAM: identity, policies, and request signing in the AWS idiom rather than OAuth2 client credentials, and the storage side benefits from the tightest possible integration since catalog and object store share a vendor. Glue in the matrix tests whether hyperscaler identity plumbing and the open protocol compose, and the existence of official walkthroughs says they do.

Databricks Unity Catalog exposes managed Iceberg through its REST endpoint, with external engines reading and writing Unity-governed tables, and community tooling has leaned in: recent dbt work wired DuckDB writes directly into Unity as a target. Two Unity-specific notes belong in any honest matrix. The open source Unity Catalog and the managed Databricks product differ in feature depth, so record which one you tested. And Unity's fine-grained governance for external engines rides the Iceberg 1.11 scan planning protocol, which DuckDB does not yet speak, so policy-protected tables sit outside today's same-code claim for this particular client.

Snowflake Open Catalog is managed Polaris, operated by Snowflake, which makes it the experiment's most elegant data point: the same open codebase reachable as a service, with a prologue of Snowflake account setup, programmatic credentials, and the internal-versus-external catalog distinction governing what outside engines can write. Comparing self-hosted Polaris and Open Catalog isolates exactly the managed-platform variable, same protocol implementation, different control plane, and any behavioral divergence between them measures platform policy rather than code.

Step back from the seven sketches and one composite fact stands out: DuckDB's own integration test infrastructure runs against Gravitino, Lakekeeper, Nessie, and Polaris fixtures, and its documentation walks Glue, S3 Tables, Polaris, Lakekeeper, and others by name. The seven-catalog experiment is not a stunt the ecosystem tolerates. It is approximately the test matrix the client project itself maintains.

For the write-up on your wall, the seven compress into a reference card:

| Catalog | What it is | Hosting | Auth idiom | Bootstrap unit | Distinctive trait |
|---|---|---|---|---|---|
| Apache Polaris | ASF Top-Level Project REST catalog | Self-hosted | OAuth2 client credentials | Catalog, principal, roles | Full-spec reference point, RBAC, vending, federation |
| Lakekeeper | Minimal Rust REST catalog | Self-hosted | OAuth2 | Project, warehouse | Single binary, external authz via OpenFGA and policy engines |
| Apache Gravitino | Federated metadata service with an Iceberg REST face | Self-hosted | OAuth2 and platform options | Metalake, catalog | Iceberg alongside non-Iceberg metadata under one roof |
| Nessie | Transactional catalog with Git-style semantics | Self-hosted | Server-configured | Repository, branch | Branch, tag, and merge over catalog state |
| AWS Glue | Cloud data catalog with Iceberg REST interface | Managed | IAM identity and signing | Account catalog, IAM policy | Deepest same-vendor storage integration |
| Unity Catalog | Databricks governance catalog with Iceberg REST endpoint | Managed and OSS | Workspace principals, tokens | Metastore, catalog, schema | Fine-grained policy for externals via 1.11 scan planning |
| Snowflake Open Catalog | Managed Apache Polaris | Managed | Snowflake credentials | Account, internal or external catalog | Same code as Polaris, platform control plane on top |

The card is deliberately about control planes, because the data plane row, speaks the Iceberg REST protocol, accepts the common script's verbs, is the same for all seven, and printing an identical row seven times is the article's thesis in table form.

## The Test Matrix Worth Running

If you reproduce this, and I encourage it, run it as a protocol, uniformly, with recorded results, rather than as an afternoon of vibes. The matrix that produces defensible conclusions:

Operations, in escalating order: attach and list namespaces, CREATE SCHEMA, CREATE TABLE, INSERT, SELECT of own writes, UPDATE, DELETE, MERGE INTO, ALTER TABLE add and rename column, DROP TABLE, and a concurrent-writer probe, two DuckDB processes inserting simultaneously, to watch commit conflict behavior surface through the client. Score each cell one of four ways: works, works with documented configuration, refused by policy, or fails, and treat those as four different findings. A policy refusal on a managed namespace is the platform working as designed. A protocol-level failure is a bug report for someone.

Dimensions to hold constant or vary deliberately: format version, run everything at v2, repeat the mutation set at v3 where accepted. Storage arrangement, note per catalog whether the table lives in platform-managed or self-managed storage, and test both where the platform distinguishes. Credential mode, vended credentials as the default posture, with a fallback run on direct credentials where vending is unavailable, since that fallback itself is a finding.

Error behavior deserves its own column, because it is where implementations reveal their maturity most cheaply. Provoke the same three failures everywhere, a commit conflict, a write to an unauthorized location, a schema change on a stale table, and record what the client surfaces. The span runs from precise, actionable protocol errors to opaque storage stack traces, and for the person on call at 2 a.m., that span matters as much as any feature row.

The concurrent-writer probe deserves a paragraph of its own, because it is the row that tests the protocol's soul rather than its surface. Start two DuckDB processes attached to the same catalog, have both load the table, then have both insert. The commit conversation guarantees the outcome shape: one commit's requirements validate against the snapshot it loaded, and it lands. The second arrives asserting a snapshot that is no longer current, and the server must reject it rather than silently interleave. What you are grading per catalog is the aftermath: whether the rejection is clean and identifiable as a conflict, whether client-side retry against refreshed state succeeds, and whether the final table contains exactly both writers' rows with two well-formed snapshots in the history. Inspect the snapshot log afterward, this is what Iceberg's metadata tables are for, and confirm the story the commits told. A catalog passing this row has demonstrated the property the whole architecture exists to provide: optimistic concurrency arbitrated server-side, identically, for clients that share nothing but the protocol.

And version-stamp everything: DuckDB version, extension version, each catalog's version or service date. Every component here moves quarterly, and an undated compatibility matrix is a rumor within six months. That decay is also why I have given you a protocol rather than a filled-in grid: any grid I print ages badly, while the method does not.

## What the Differences Mean

Suppose you run the matrix and get what the documentation and community experience suggest you will get: the core DML pass working broadly, with divergence concentrated in prologues, policy refusals, credential vending configuration, and error quality. What does that finding mean?

First, it means the REST protocol succeeded at the thing protocols are for. The data plane, table lifecycle and commits, is genuinely portable across independent implementations, which was the entire bet, and the proof is that the smallest client in the ecosystem reaches all of them with one code path. Interoperability skeptics should have to explain this result.

Second, it means the remaining differentiation moved up the stack, into identity, governance, tenancy, and managed semantics, exactly where platforms want to differentiate and exactly where standardization was never on offer. Choosing among the seven is now a control plane decision, and the matrix quantifies the control planes rather than the table format.

Third, it sharpens what "supports Iceberg" must mean in vendor conversations. Every one of the seven "supports Iceberg," and they still differ in external write posture, managed-table restrictions, vending behavior, and fine-grained policy reach. The matrix's four-way scoring, works, configured, refused, fails, is a vocabulary for those conversations, and insisting on it converts marketing claims into rows.

And fourth, it locates the frontier precisely. The current same-code boundary for DuckDB runs along scan planning: catalogs enforcing fine-grained policy at plan time serve every engine that speaks the 1.11 planning client and not yet this one. That boundary is a tracked feature request away from moving, which is the healthiest kind of limitation a young integration can have.

There is a practical architecture lesson buried in the finding, too, and it changes how teams should design. If the data plane is portable, catalog selection stops being a one-way door, and architectures can treat it that way: keep table creation and DML in protocol-standard form, isolate the prologue, authentication, attachment, warehouse names, in configuration rather than code, and the cost of moving a workload between catalogs, or running it against two during a migration, collapses to swapping the prologue. Teams mid-migration between platforms are already exploiting exactly this, running the same transformation code against the old and new catalog side by side and diffing results, a validation strategy that was fantasy under per-catalog integration code. The seven-catalog experiment, reframed, is a migration rehearsal, and passing it means your exit costs are as low as this ecosystem has ever offered.

The finding also assigns homework in both directions. For catalog vendors, the commodity data plane means error quality, bootstrap ergonomics, and documentation clarity are now competitive surfaces, since they are where evaluators spend their hours. For the client side, every gap between the common script and the full Iceberg surface, richer type handling, metadata table access, planning integration, is now visible against seven backends at once, which is the kind of visibility that gets roadmap items prioritized. Interoperability experiments do their best work as pressure, and this one presses on everyone at once.

## Gotchas for Reproducers

Field notes for the afternoon you actually run this, gathered from documentation fine print and community reports.

Match extension features to DuckDB versions exactly. The write capabilities arrived across 1.4.0, 1.4.2, and the 1.5 line, and testing MERGE on 1.4.0 tests nothing but your patience. Pin versions in the script header.

Read the storage configuration page before the authentication page. Most mid-script failures are storage-side: vending not enabled on the warehouse, a location outside the warehouse's configured root, a region mismatch. The catalog conversation succeeding while the Parquet write fails is the signature.

Expect namespace semantics to vary at the edges. Nesting depth, reserved names, and case handling differ across implementations within what the protocol allows, and a test schema named to avoid every platform's reserved words saves cross-catalog noise.

Distinguish the catalog from the platform around it. When a managed platform refuses an external write, the finding is about that platform's policy for that table kind, and generalizing it to "the protocol doesn't work" or "the catalog is closed" flattens exactly the nuance the experiment exists to capture.

And clean up as you go. Seven catalogs' worth of orphaned test tables, each with snapshots and storage, is a small bill and a large embarrassment, and DROP TABLE behavior, purge semantics included, differs enough per platform to be its own quiet matrix row.

Two more from the fine-print file. Watch token lifetimes against test duration: OAuth2 tokens and vended storage credentials both expire, and a matrix run that pauses for lunch mid-catalog resumes into authentication errors that look like regressions. Refresh behavior differs per catalog, so either complete each catalog's pass in one sitting or verify the client's refresh handling first. And keep the read-back honest: verify writes with a fresh attachment, or better, a second reader, rather than trusting the writing session's view alone, because a session reading its own cached state proves less than a cold client reading the committed table, and the cold read is the claim the experiment exists to test.

## Where This Is Heading

Three trajectories will change this article's answer over the next year or two. Client capability keeps filling in: DuckDB's scan planning support, when it lands, extends the same-code claim into policy-protected tables, and the extension's experimental label will fade the way such labels do, feature by feature. Conformance testing is becoming communal: the Iceberg community's work on shared conformance fixtures across implementations points toward a future where "does catalog X really speak the protocol" is answered by a public suite rather than by each practitioner's weekend, and this article's matrix is, in a sense, a manual draft of that suite. And the client population is exploding beyond DuckDB, native libraries in Python, Rust, and Go, browser runtimes, dbt targets writing straight into managed catalogs, each new client re-running some version of the seven-catalog question and, mostly, getting the same encouraging answer.

The equilibrium this points toward is worth naming: catalogs competing on control planes above a commodity data plane, clients proliferating because the marginal cost of joining fell to one protocol implementation, and the table format disappearing into infrastructure the way successful standards do.

Two adjacent developments will keep the question interesting rather than settled. The catalog population itself keeps mutating: database-backed metadata approaches like DuckDB Labs' own DuckLake keep catalog metadata in a SQL database rather than behind a REST service, a different point on the design spectrum that trades protocol universality for metadata query speed, and watching whether such designs eventually grow REST faces, or pull the ecosystem toward hybrid models, is one of the better spectator sports in data infrastructure right now. And the test itself wants to become an artifact: the natural evolution of this article's matrix is a public, versioned compatibility suite, run on a schedule against current releases of client and catalogs alike, published with dates, the way the web platform learned to measure browser conformance. Whoever builds and maintains that suite will own one of the most-cited assets in the Iceberg ecosystem, and the fact that it does not quite exist yet is an open invitation.

## Conclusion

So, can seven different Iceberg REST catalogs really run the same DuckDB code? For the part of the code that talks the REST protocol, the tables, the writes, the commits, the schema changes, the documented and observed answer is substantially yes, and that is a remarkable sentence for this ecosystem to have earned. The sameness ends where it was always going to end: at identity, provisioning, storage policy, and each platform's definition of a managed table, the control plane territory no table format protocol claims. Run the matrix yourself, score it honestly with the four-way vocabulary, date your results, and you will hold something more useful than an opinion about interoperability: a measurement of it. Then publish what you find, prologues, refusals, error messages, versions, and all, because this ecosystem improves fastest when its claims get tested in public, and the same-code question deserves a running answer rather than a settled one. The most encouraging thing about the current answer is not that it is yes. It is that the question has become ordinary enough to ask.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg, catalogs, and lakehouse architecture. *Apache Polaris: The Definitive Guide*, which I co-authored for O'Reilly, covers the REST catalog model, credential vending, and governance in depth. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
