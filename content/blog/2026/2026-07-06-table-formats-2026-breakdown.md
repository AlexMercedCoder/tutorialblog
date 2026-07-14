---
title: "Lakehouse Table Formats in 2026: Iceberg, Delta Lake, Hudi, Paimon, and DuckLake, How They Work, Where They Stand, and Where They're Going"
date: "2026-07-06"
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - table formats
  - iceberg
  - delta lake
  - hudi
  - paimon
canonical: https://iceberglakehouse.com/posts/table-formats-2026-breakdown/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/table-formats-2026-breakdown/).

# Lakehouse Table Formats in 2026: Iceberg, Delta Lake, Hudi, Paimon, and DuckLake, How They Work, Where They Stand, and Where They're Going

*By Alex Merced, Head of Developer Relations at Dremio*

The table format war is over, and the table formats are not. Both halves of that sentence are true, both matter, and the tension between them is exactly why this article needs to exist.

The war ended in the sense that the industry converged on Apache Iceberg as its interoperability standard: every major cloud ships managed Iceberg services, Snowflake and Databricks both read and write it natively, DuckDB gained full Iceberg write support, and even PostgreSQL can now query Iceberg tables directly through open extensions. When your fiercest competitors all implement the same format, the standards question is settled. But the formats did not consolidate into one, because they were never solving identical problems. Delta Lake anchors the largest single-vendor ecosystem in data. Apache Hudi crossed its 1.0 milestone with database-grade indexing ambitions. Apache Paimon shipped 1.0 and owns the streaming-native design space. DuckLake arrived from the DuckDB world and asked the most interesting architectural question of the bunch. Each has a design center, a community, a roadmap, and workloads where it is genuinely the best answer.

So this is the detailed breakdown, current as of July 2026: how each of the five formats actually works, mechanically, what state each is in right now, releases, ecosystem, governance, where each roadmap points, and the honest pros and cons that vendor comparisons sand off. I have written a full series of deep dives on Iceberg specifically, and I will lean on those where depth exceeds this article's budget. My standing bias is declared as always: I work at Dremio, I co-authored the O'Reilly books on Iceberg and Polaris, and my conviction about open standards is on record. What I owe you in exchange is fairness to the other four, and I intend to pay it.

## First Principles: What a Table Format Actually Does

One compressed refresher, because every comparison below builds on it.

Object storage gives you files. Analytics needs tables: things with schemas, transactions, history, and the ability to change safely while being read concurrently. A table format is the metadata layer that closes that gap. Every format on this list, whatever its architecture, must answer the same five questions. Which files constitute the table right now, without listing storage? How does a change, however many files it touches, become visible atomically? How do row-level updates and deletes work on immutable files? How do schemas and partitioning evolve without rewriting history? And how do engines plan queries efficiently, pruning most data before reading any?

The formats differ in their answers, and the differences trace back to birthplaces. Hudi was born at Uber in 2016 to make incremental ingestion and upserts possible on Hadoop-scale lakes. Delta was born at Databricks in 2017 to give Spark reliable transactions and unified batch-and-streaming. Iceberg was born at Netflix in the same era to fix correctness and scale for enormous multi-engine estates, with the spec-first neutrality that later won the standards war. Paimon was born in the Flink community at Alibaba in 2022 to make the table itself behave like a streaming system. And DuckLake was born in the DuckDB world in 2025 to ask whether the whole metadata apparatus had become more complicated than the problem. Five origin stories, five design centers, and the rest of this article walks them one at a time.

## Apache Iceberg: The Standard, Mid-Transformation

**How it works.** Iceberg's architecture is the snapshot tree my series has dissected at length: data files in Parquet, manifests listing those files with per-column statistics, manifest lists collecting manifests into snapshots, and a top-level metadata file whose pointer, swapped atomically through a catalog, defines the current table. Planning reads metadata, never lists storage, and prunes aggressively on statistics. Row-level change runs copy-on-write or merge-on-read, with v3's deletion vectors, compressed bitmaps in Puffin files, one per data file, making the merge-on-read path fast and stable. Partitioning is hidden, defined as transforms on columns and free to evolve, and schema evolution is by field ID, safe by construction. Every snapshot persists until expired, giving time travel and rollback natively.

**Current state.** The v3 spec, ratified mid-2025, is the production frontier, and the 1.10 and 1.11 release line through May 2026 delivered it: deletion vectors, the variant type with shredding for semi-structured data, row lineage for change tracking, and geospatial types. Ecosystem position is, frankly, the story: beyond the engines that always spoke it, Spark, Flink, Trino, Dremio, the last holdouts converged, with Databricks supporting Iceberg through UniForm and managed Iceberg in Unity Catalog, DuckDB shipping full read-and-write including UPDATE and DELETE, Snowflake open-sourcing pg_lake to bridge PostgreSQL directly to Iceberg tables, and S3 Tables making Iceberg a managed storage primitive with cross-region replication. The catalog ecosystem, anchored by the REST specification and implementations like Apache Polaris, is where governance consolidated, the subject of my Polaris article.

**Roadmap.** The v4 design cycle, which I covered thread by thread in my v4 state article, is the most consequential format work in the industry right now: single-file commits and an adaptive metadata tree to make streaming-rate writes cheap, snapshot offloading and columnar metadata to cut planning costs, relative paths and a typed content-stats model already ratified by vote, and the contested efficient-column-updates proposal aimed at AI-scale wide tables. Timeline honesty from that article stands: direction locked, dates not.

**Pros.** Broadest multi-engine read-and-write support in existence, neutral Apache governance no vendor controls, the deepest catalog and governance ecosystem, spec-first discipline that has kept implementations honest, and the network effect of being the format everyone else builds bridges to.

**Cons.** The metadata tree that scales so well is genuinely complex to operate and reason about, and heavy small-commit workloads expose its write amplification, the very thing v4 exists to fix. Streaming CDC is well supported but not the native idiom it is in Paimon or Hudi, with equality deletes as the pragmatic and read-costly bridge. And table maintenance, compaction, expiration, is your responsibility or your platform's, never free.

## Delta Lake: The Ecosystem Heavyweight at a Crossroads

**How it works.** Delta's design center is the transaction log: a `_delta_log` directory of ordered JSON commit files, each recording actions, add this file, remove that one, change the schema, with periodic Parquet checkpoints compacting the log for fast reads. The current table is the log replayed to its tip, and commits are atomic appends of the next numbered log entry. It is a simpler mental model than Iceberg's tree, sequential rather than hierarchical, and it shaped a decade of Spark-centric lakehouse practice. Row-level change matured along the same arc as Iceberg's: copy-on-write first, then deletion vectors for merge-on-read. Layout optimization evolved past static partitioning into liquid clustering, incremental automatic clustering on chosen keys. Row tracking gives row-level lineage for change data feeds. And UniForm generates Iceberg-compatible metadata alongside Delta's own, letting Iceberg readers consume Delta tables, the bridge that acknowledged where interoperability gravity had settled.

**Current state.** Delta 4.0 arrived with Spark 4.0, and the 4.0.x line through 2026 tells you exactly where the project's center of mass sits: the headline features are catalog-managed tables, a commit model coordinated through the catalog rather than the storage-level log alone, and Unity Catalog OAuth integration, with UniForm's Iceberg interoperability restored on the new Spark line. Delta Kernel, the library that lets connectors implement Delta once against a stable core, continued maturing as the answer to the ecosystem's historical Spark-centricity, and delta-rs serves the Python and Rust world. The honest ecosystem read: inside the Databricks orbit, Delta is the best-integrated table format on earth, and outside it, engine support is real but consistently a tier shallower than Iceberg's, with Unity Catalog as the governance center of gravity rather than a neutral catalog layer.

**Roadmap.** The fascinating one. As I reported in my Iceberg v4 article, Databricks has proposed that Delta Lake 5.0 adopt the Iceberg v4 metadata tree as its native content metadata, one on-disk structure readable and writable by both formats' clients with no translation layer. Read that plainly: the largest Delta stakeholder proposing that Delta's next major version converge onto Iceberg's next metadata design. It rides on the v4 work rather than driving it, its fate belongs to the Delta community, and whether it lands fully or partially, it marks the endpoint of the format war more decisively than any market-share chart: the remaining differences are being engineered away at the metadata layer itself.

**Pros.** Unmatched integration depth in the Spark and Databricks world, the simplest core mental model of the mature formats, genuinely excellent engineering in deletion vectors, liquid clustering, and change data feed, and a convergence path that protects existing investments.

**Cons.** Gravity: the format is open, and its momentum, governance reality, and best features orbit one vendor, with Unity Catalog as the governance answer in a way that neutral-catalog shops find binding. Multi-engine write support outside that orbit trails Iceberg's. And the 5.0 convergence question, until resolved, puts a strategic asterisk on long-horizon Delta-native investments.

## Apache Hudi: The Database Ambition

**How it works.** Hudi's design center has always been the most database-like of the five: the table as a timeline of actions, commits, compactions, cleanings, rollbacks, with data organized into file groups that function like micro-partitions of a storage engine. Copy-on-write and merge-on-read were Hudi concepts before they were industry vocabulary, with merge-on-read pairing base Parquet files with row-oriented log files that compaction folds in. The differentiator is indexing: Hudi maintains a multi-modal index subsystem in an internal metadata table, including a record-level index mapping keys to file groups, which makes keyed upserts fast in a way pure scan-and-match designs cannot be, plus bloom and secondary indexes to accelerate lookups beyond the key.

**Current state.** Hudi 1.0 reached general availability as the project's largest re-architecture: an LSM-structured timeline, non-blocking concurrency control designed so that writers, compaction, and clustering proceed without locking each other out, secondary indexes as a first-class subsystem, and functional indexes extending pruning beyond partitions. The 1.x line through 2026 has been hardening that foundation. Ecosystem-wise, Hudi remains strongest where it was born, Spark and Flink ingestion pipelines, with commercial energy concentrated in Onehouse, founded by Hudi's creator, whose interoperability stance is notable: Onehouse championed Apache XTable, the incubating project that translates metadata among Iceberg, Delta, and Hudi, effectively conceding that consumption happens in other formats' ecosystems while competing on ingestion and table management excellence.

**Roadmap.** The 1.x arc points at deepening the database analogy: richer indexing, faster keyed operations, tighter streaming semantics, and positioning Hudi as the write-optimized ingestion tier of a multi-format world, with XTable and Iceberg-compatible surfaces handling the read-side reach.

**Pros.** The strongest keyed-upsert machinery of the file-metadata formats, genuine innovations in non-blocking concurrency, the most complete built-in table-services story, ingestion, clustering, cleaning as managed subsystems, and years of production hardening at extreme CDC scale.

**Cons.** Operational complexity is the recurring field report: more concepts, more configuration surface, more tuning than its peers, a real cost for teams without dedicated platform depth. Multi-engine read support, while broad on paper, is shallower in practice than Iceberg's, which is precisely why the ecosystem strategy leans on translation layers. And mindshare momentum, fairly or not, has consolidated elsewhere, which affects hiring, tooling, and the long-tail integrations nobody plans for.

## Apache Paimon: The Streaming Native

**How it works.** Paimon, which graduated to an Apache Top-Level Project in 2024 after beginning life as Flink Table Store, made the boldest architectural bet of the file-metadata formats: bring the log-structured merge tree, the storage design underneath databases like RocksDB, to the lakehouse. Primary-key tables organize data into LSM levels, writes land in sorted runs and compact downward continuously, and merge engines define what a key's latest state means, deduplicate, partial-update, aggregate, giving CDC semantics natively rather than as a bolted-on delete mechanism. Changelog producers emit both the table and its change stream simultaneously, and lookup joins let streaming jobs enrich against Paimon tables efficiently. Snapshots and time travel ride on top, so batch engines see a normal versioned table while streams see a living one.

**Current state.** Paimon 1.0 shipped in 2025 with the 1.0.x line continuing into 2026, and the project's two strategic moves this cycle are the tells: an Iceberg-compatibility mode that publishes Paimon tables with Iceberg-readable metadata, and participation in the REST catalog world, both acknowledging where read-side gravity lives while competing on write-side physics. The ecosystem is Flink-first and unapologetic about it, with Alibaba-scale production behind it, Spark support growing seriously, and a natural pairing emerging with Apache Fluss, the sub-second stream storage layer, as the streaming stack's answer to hot-plus-cold architectures I described in my streaming article.

**Roadmap.** Deeper Spark parity, richer Iceberg interop, and the continued fusion of stream and table, Paimon as the materialized, queryable face of streams, with the Flink 2.x era pushing the unified streaming-lakehouse pattern hard.

**Pros.** The best streaming-write physics in the category, sub-second-friendly ingestion with continuous compaction by design rather than by scheduled job, native CDC semantics that make changelog pipelines dramatically simpler, and point-lookup performance the scan-oriented formats cannot match.

**Cons.** The Flink-centricity is real: outside that ecosystem, both tooling and expertise thin out quickly. LSM operations trade background compaction cost for write speed permanently, a bill that must be provisioned. Batch-analytics ecosystem depth, governance integrations, and the catalog story all trail Iceberg's by years, which is exactly what the compatibility mode exists to mitigate.

## DuckLake: The Provocation

**How it works.** DuckLake, introduced by the DuckDB team in 2025, looked at the metadata architectures above, JSON files, Avro manifests, log directories, catalog services coordinating pointer swaps, and asked the question every one of us had privately entertained: why is any of this not just a database? DuckLake stores table data as ordinary Parquet on object storage and puts all metadata, schemas, snapshots, file lists, statistics, transactions, in a relational database: DuckDB itself, SQLite, PostgreSQL, MySQL. Planning is a SQL query against indexed tables rather than a walk of metadata files. Commits are database transactions, which makes multi-table transactions, the thing every file-metadata format struggles to offer, simply native. Small frequent writes stop bloating a file-based metadata tree because they are rows in a database, and the format even supports inlining tiny writes into the catalog database itself, plus encryption of data files with catalog-managed keys.

**Current state.** Young and moving fast: the 0.x specification line matured through late 2025 and into 2026, with the ecosystem centered on DuckDB and MotherDuck, and adoption concentrated exactly where the design shines, local and embedded lakehouses, small-team warehouses sharing a Postgres catalog, CI pipelines spinning up ephemeral versioned tables, and high-frequency-write scenarios that punish file-based metadata. Interop is pragmatic: DuckDB reads Iceberg and Delta alongside, and data moves between worlds as Parquet.

**Roadmap and meaning.** The roadmap is maturation, spec stability, more engines, richer catalog features. The meaning is bigger than the adoption: DuckLake is the sharpest possible argument in the industry's live debate about where table metadata belongs, and readers of my Iceberg v4 article will recognize the same forces there, snapshot offloading from metadata files, catalogs taking on more commit coordination, the question of what metadata.json should even be. DuckLake did not cause that debate, and it is the cleanest existence proof one side of it has.

**Pros.** Radical operational simplicity, honest multi-table ACID, fast planning at high snapshot and commit counts, and the best developer experience in the category for anyone whose world touches DuckDB.

**Cons.** The catalog database becomes a required, stateful component with its own availability story, which is precisely the dependency file-only designs were built to avoid at extreme scale. Engine support beyond the DuckDB orbit is nascent. And the format's scale ceiling at true enterprise concurrency remains unproven in public, which is not a criticism of a young project, just a fact a buyer must weight.

## The Great Divider: Row-Level Change, Format by Format

If one dimension separates the five designs most sharply, it is how each answers the impossible question this series keeps returning to: how do you change a row when files cannot change? Walking the five answers side by side is the fastest way to feel each format's soul.

Iceberg's answer is snapshots plus deletion vectors: changes write new files, deletions become one compressed bitmap per data file, merged at write time, and readers assemble truth with a single cheap lookup per file. The design optimizes for read stability under churn and for multi-engine simplicity, one authoritative structure any reader can apply, at the cost of writers doing per-file merge work and equality deletes lingering as the streaming-era compromise being engineered away.

Delta's answer is the same family with a different backbone: the transaction log records file-level adds and removes, deletion vectors handle row-level deletes, and row tracking preserves identity for change feeds. Where Iceberg's tree spreads state across manifests, Delta's log concentrates it in a sequence plus checkpoints, which makes the common case simple and makes very long, very hot logs the thing checkpointing and catalog-managed commits exist to tame.

Hudi's answer is the most database-like: locate the row first, using the record-level index to find its file group directly, then either rewrite the group, copy-on-write, or append the change to the group's log file, merge-on-read, with compaction folding logs into bases on schedule. The index is the differentiator, keyed upserts skip the scan-and-match work every other file-metadata format performs, and it is also the operational surface, one more subsystem to size and maintain.

Paimon's answer dissolves the question: in an LSM table, change is not an exception path, it is the write path. Every write is a sorted run declaring keys' new states, merge engines define what state means, compaction continuously folds runs downward, and the latest value of a key is whatever the merge produces. Nothing is ever edited, and everything is always changing, which is why CDC streams feel native here and why the compaction engine runs forever by design.

DuckLake's answer relocates the bookkeeping: data changes still write new Parquet, and the record of what superseded what lives as rows in the catalog database, transactionally, across as many tables as the change touched. The mechanics of merge-on-read persist, the coordination problem simply becomes a database transaction, which is the whole thesis in miniature.

Five answers, one lesson for buyers: your dominant change pattern is the strongest single signal in the choice. Append-mostly analytics is happy everywhere and happiest where scan ecosystems are deepest. Keyed high-velocity upserts pull toward Hudi and Paimon by physics. Mixed enterprise workloads under many engines pull toward Iceberg's stability-first design. And if your pain is the coordination machinery itself, DuckLake is speaking directly to you.

## The Cross-Cutting Story: Convergence and the Interop Layer

Step back from the five profiles and the 2026 pattern is unmistakable: the formats are converging technically while differentiating by design center, and an interoperability layer has grown up to paper over what differences remain.

Technically, the borrowing is constant and healthy. Deletion vectors began in Delta, are now Iceberg v3's centerpiece, and echo across the others. Merge-on-read and copy-on-write, Hudi's vocabulary, are everyone's vocabulary. Iceberg's hidden partitioning pressure improved layout thinking everywhere, liquid clustering being Delta's sophisticated answer. Paimon's streaming semantics are pulling Iceberg's v4 commit economics, and DuckLake's database-metadata argument is visibly present in Iceberg's own metadata.json debates. Ideas flow because engineers read each other's specs, and users win every time.

Institutionally, the flows all point one direction. UniForm publishes Delta as Iceberg. Paimon ships an Iceberg-compatibility mode. XTable translates all three legacy formats among each other with Iceberg as the common destination in practice. Catalog federation in Apache Polaris governs them side by side, and generic tables give non-Iceberg formats a home in the open catalog. And the Delta 5.0 proposal would collapse the biggest remaining boundary at the metadata layer itself. The realistic 2026 enterprise runs a mixed estate, and the interop layer has matured enough that mixed is manageable rather than miserable, with one caveat I always attach: translation layers are for transitions and edges, and the format your governance, maintenance, and performance engineering natively target is still a choice that matters.

## The Ecosystem Map in Prose

Feature tables age badly, so here is the support picture as connected prose, current mid-2026 and painted in tiers rather than checkmarks.

Iceberg's tier one is everything: Spark, Flink, Trino, Dremio, Presto, Hive, and Kafka Connect write it, DuckDB now writes it fully, the Python, Rust, and Go client ecosystems are vibrant, every hyperscaler operates managed Iceberg storage or catalogs, Snowflake and Databricks treat it as a first-class citizen, and PostgreSQL reaches it through pg_lake. Its catalog world, REST spec, Polaris, Gravitino, Lakekeeper, Glue, Unity interop, is a whole ecosystem of its own. Delta's tier one is the Spark and Databricks universe at unmatched depth, with Kernel-based connectors, delta-rs, and warehouse read integrations forming a solid second ring, and Unity Catalog as its governance home. Hudi's strength is the ingestion stack, Spark and Flink writers hardened at CDC scale, with reads reaching other engines increasingly via XTable translation and compatibility surfaces rather than native connectors. Paimon owns the Flink tier completely, has serious and growing Spark support, reaches the batch world through its Iceberg mode, and pairs with the emerging streaming-storage layer. DuckLake's ecosystem is the DuckDB constellation, which in 2026 is far larger than it sounds, embedded analytics, notebooks, MotherDuck, and the enormous population of local-first data work, with everything else reachable because the data is plain Parquet.

Two readings of that map matter more than any cell. First, the asymmetry: every non-Iceberg format invests in being readable as Iceberg, and the reverse investments do not exist, which tells you the direction of consumption gravity more honestly than advocacy ever could. Second, the catalog layer is where ecosystems actually interlock now, a Polaris-style catalog federating and governing tables across formats is what makes the mixed estate operable, and it is no accident that the catalog articles in this series keep intersecting this one.

## One Workload, Five Ways: A Worked Scenario

To make the trade-offs tactile, run a single realistic workload through all five formats: a CDC mirror of an orders database, a few thousand changes per second, consumed by BI dashboards, a nightly finance job, and an ML feature pipeline.

On Iceberg, Flink lands changes via merge-on-read, equality deletes buffering the stream with deletion vectors and compaction settling it, exactly the machinery of my streaming and deletion-vector articles. Reads are superb and stable across every consumer's engine of choice, the finance job time-travels to a clean snapshot, and the operational work concentrates in the maintenance pipeline that keeps the delete backlog short. This is the balanced answer, strongest where consumers are many and varied.

On Delta, the same shape with Databricks-grade tooling if you live there: change data feed gives the ML pipeline its increments natively, liquid clustering keeps layout healthy, deletion vectors handle the churn, and the whole thing hums with minimal ceremony inside the platform, while external consumers read through UniForm. The answer is excellent, and its excellence is geographically concentrated.

On Hudi, the record-level index makes the upsert stream itself the cheapest of the five, each change routed straight to its file group, with table services managing compaction and clustering as built-ins. If ingestion cost and freshness under heavy keys are the binding constraints and your readers can be served through translation, this is the specialist's pick, and the specialist should budget for its control surface honestly.

On Paimon, the stream is the table: the LSM absorbs the change rate without breaking stride, the changelog producer feeds the ML pipeline a native change stream, lookup joins enrich in-flight, and Flink consumers see near-real-time state. BI and finance read through the Iceberg-compat surface. Where the whole pipeline lives in Flink, this is the least total machinery of any answer.

On DuckLake, the scenario shrinks or shines depending on scale: at a small team's volume, the entire system is a Postgres catalog and a bucket, transactions across the orders and customers tables come free, and the operational surface is nearly nil, a genuinely delightful answer. At the full enterprise rate with many concurrent engines, you are outside its proven envelope, which is the honest boundary.

Same workload, five defensible architectures, and the differentiator was never correctness, all five deliver a consistent, versioned, queryable mirror. The differentiators are where your engines live, who bears the operational load, and which physics, scan, key, stream, or simplicity, your workload actually stresses.

## Governance and Community Health: The Dimension Buyers Skip

One more comparison lens before the framework, because formats are decade commitments and the health of the community steering them matters more over that horizon than any feature.

Iceberg and Paimon are Apache Top-Level Projects with the full apparatus: public dev lists where every decision is argued, PMC diversity spanning competing vendors, formal votes on spec changes, and the ASF's structural guarantee that no company can capture the roadmap. Hudi shares the same ASF constitution, with the nuance that its commercial energy concentrates heavily in one company founded by its creator, a normal pattern for a specialist project and one to watch the same way Polaris watchers tracked founder concentration. Delta Lake lives at the Linux Foundation, genuinely open in license and increasingly open in connector architecture through Kernel, with the honest asymmetry that its roadmap, release cadence, and flagship features move at the pace and in the direction of one vendor, which the 5.0 convergence proposal both illustrates and might ultimately soften. DuckLake is stewarded by DuckDB Labs and its foundation structure, young, coherent, and fast precisely because it is small, with the standard young-project question of what its governance looks like if a second major implementer arrives.

The practical test I give buyers is the one this series applies everywhere: can a proposal your vendor dislikes still pass, and can you watch the argument happen? For Iceberg and Paimon the archives answer yes daily. For the others the answers are more qualified, which does not disqualify them, plenty of excellent infrastructure is vendor-led, but it prices into the decade math, especially for the format holding your enterprise's system of record. Community velocity tells a similar story from another angle: contributor breadth and dev-list vitality are leading indicators of the long-tail integrations, bug fixes, and hiring pools that determine what running a format feels like in year five, and on those indicators, the standards winner's compounding advantage is visible everywhere from conference tracks to job postings.

## Choosing in 2026: The Decision Framework

The guidance I actually give, by situation.

Starting fresh, with optionality as a value: Iceberg, and in 2026 this is barely a debate. The engine breadth, the neutral governance, the catalog ecosystem, and the fact that every other format now builds bridges to it make it the lowest-regret default, which is why the analyst consensus converged on exactly this recommendation. My series covers how to run it well.

Deep in the Databricks platform: Delta, without anxiety. The integration quality is real, UniForm keeps external readers served, and the convergence roadmap means the strategic risk of the choice shrinks rather than grows. Revisit if your estate becomes genuinely multi-platform and Unity's gravity starts binding.

CDC-heavy ingestion at serious scale, with platform engineering muscle: Hudi earns its complexity exactly here, where record-level indexes and non-blocking table services pay for themselves daily, and XTable or Iceberg surfaces can serve your readers. Evaluate honestly whether you have the operational depth, because that is the real prerequisite.

Flink-centered, streaming-first, freshness-obsessed: Paimon is the native answer, especially paired with the Fluss-style hot layer for the sub-second tier, with the Iceberg-compat mode as your bridge to the batch and BI world. If your organization is not already a Flink organization, weigh that adoption cost first.

Embedded, local, small-team, or high-frequency-write scenarios where operational simplicity dominates: DuckLake is a genuine delight, and a legitimate production choice within its current ecosystem. Treat its scale frontier honestly and keep your data in Parquet, which keeps every exit open.

And in every case, three invariants from across this series: put an open catalog over whatever you choose, budget for maintenance as a permanent line item, and keep the data files in open formats, because the file layer is the deepest insurance policy in the stack.

## The Roadmap Watchlist for the Next Year

What I am tracking, format by format, and what each item would mean.

Iceberg v4's partition-tuple and column-update decisions, because they set the format's shape for the streaming and AI decades, my v4 article has the thread-level detail. The Delta 5.0 convergence proposal's fate in the Delta community, because it either ends the metadata divergence or clarifies that two trees persist. Hudi 1.x's index subsystem maturing toward its database ambitions, and whether XTable's translation-layer bet graduates from incubation into boring infrastructure. Paimon's Spark parity and the Flink 2.x streaming-lakehouse push, because that determines whether streaming-native escapes its home ecosystem. DuckLake's specification hardening and any second-engine adoption, because one credible non-DuckDB implementation changes its category. And across all five, the file-format question rumbling underneath, whether table formats grow pluggable support for the AI-era file formats, which is the subject of this article's companion piece.

## Questions I Hear Most Often

**Did Iceberg really win, or is that vendor narrative?** Judge by behavior, not blogs: every hyperscaler ships managed Iceberg, both major warehouse vendors read and write it, Delta publishes Iceberg metadata via UniForm, Paimon ships a compatibility mode, and the proposed next Delta metadata layer is Iceberg's v4 tree. Formats do not build bridges to a loser. What Iceberg won, precisely, is the interoperability standard, the answer to "what can everyone speak." The other formats remain the better answer for specific design centers, which is why this article profiles five, not one.

**Should I migrate my existing Delta or Hudi estate to Iceberg?** Not reflexively. A working estate inside its native ecosystem is an asset, and UniForm, XTable, and catalog federation let you serve Iceberg readers without migration. Migrate when a concrete forcing function arrives, a multi-engine requirement the bridges cannot serve, a governance consolidation, a platform change, and do it dataset by dataset behind views, the lifecycle pattern from my federation article. The convergence trajectory means the cost of waiting is falling, not rising.

**Are the performance differences between formats decisive?** Rarely, and less every year. Within a design center, benchmark deltas between formats are usually dwarfed by the operational variables, file sizing, compaction discipline, clustering, engine quality, that this series keeps hammering. Across design centers they are real: Paimon and Hudi genuinely beat scan-oriented formats at keyed streaming writes, and nothing beats a well-maintained Iceberg or Delta table at massive batch scans. Choose by design center, then win on operations.

**What about table format support for the new AI file formats like Lance and Vortex?** The live frontier, and the honest answer is early: today the mainstream table formats are Parquet-centric with format fields in their specs, discussions about broader pluggability are active, and the AI-native formats ship their own dataset-versioning layers in the meantime. I wrote this article's companion piece on exactly this question, and my short version is that the table layer and file layer are negotiating their boundary in real time, with Iceberg v3's variant and v4's column-update work as the visible edges.

**Does DuckLake's database-metadata idea obsolete the file-metadata formats?** It sharpens them. At the scale ceilings and neutrality requirements of the big estates, self-contained file metadata plus a thin catalog still has the stronger argument, and at the simplicity-and-velocity end, DuckLake's argument is winning hearts for good reason. The productive outcome is already visible: the big formats absorbing the insight, more metadata responsibility moving catalog-side, exactly as the Iceberg v4 threads show. Architecture debates rarely end in obsolescence. They end in synthesis.

**One format for everything, or the right format per workload?** Per workload, behind one governed surface, is where sophisticated estates are landing: Iceberg as the broad analytical spine, a streaming-native format where freshness physics demand it, bridges and catalog federation making the seams invisible, and the semantic and governance layers, the subjects of my other articles, providing the unity that the storage layer alone never could. The format was never the strategy. The open, governed, interoperable estate is the strategy, and in 2026 all five formats can be citizens of it.

## Closing Thoughts

Five formats, five design centers, one direction of travel. The lakehouse table format story in 2026 is no longer a war chronicle, it is a specialization-and-convergence story: Iceberg as the standard everyone meets at, Delta as the ecosystem heavyweight walking a convergence path, Hudi as the database-grade ingestion specialist, Paimon as the streaming native, and DuckLake as the simplicity provocation whose best ideas are already migrating upward. The battles that remain are the good kind, fought in spec threads and design docs, with users inheriting every innovation regardless of which flag it flew first.

If this breakdown helped the formats click, the books go further: I co-authored Apache Iceberg: The Definitive Guide and Apache Polaris: The Definitive Guide for O'Reilly, with additional titles on lakehouse architecture, data engineering, and agentic analytics, all built on the same promise as this series, that the logic should actually make sense.

Browse the full collection of my books on data and AI at [books.alexmerced.com](https://books.alexmerced.com).
To try a modern Agentic Lakehouse experience, visit [dremio.com/get-started](https://www.dremio.com/get-started).
