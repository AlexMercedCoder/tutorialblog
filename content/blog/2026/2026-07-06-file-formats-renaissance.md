---
title: "The File Format Renaissance: Parquet, Lance, Vortex, Nimble, BtrBlocks, and the New Physics of Columnar Storage"
date: "2026-07-06"
description: "*By Alex Merced, Head of Developer Relations at Dremio* For a decade, the file format layer was the most settled real estate in data."
author: "Alex Merced"
category: "Data Engineering"
tags:
  - file formats
  - Parquet
  - Lance
  - Vortex
  - columnar
canonical: https://iceberglakehouse.com/posts/file-formats-renaissance/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/file-formats-renaissance/).

*By Alex Merced, Head of Developer Relations at Dremio*

For a decade, the file format layer was the most settled real estate in data. Apache Parquet held the analytical world, ORC held the Hive legacy estates, and the interesting arguments all happened in the layers above. Then, in the span of about three years, the bottom of the stack became the most intellectually active corner of the industry: a research wave produced BtrBlocks, FastLanes, ALP, and FSST, startups building AI infrastructure shipped Lance and Vortex, Meta open-sourced Nimble from its ML platform, and academic groups started publishing formats with names like F3, literally File Format for the Future.

The humble file format is having its renaissance, and the causes are worth stating precisely, because they explain everything about the new entrants. Cause one: AI workloads broke Parquet's assumptions. The 2013 design assumed batch scans over modest-width tables of numbers, strings, and dates. The 2026 workload includes point lookups into billion-row vector datasets, training pipelines shredding wide feature tables at GPU speed, and multimodal blobs sitting next to structured columns. Cause two: hardware evolved past the design. NVMe made storage fast enough that decompression became the bottleneck, SIMD widths grew, GPUs became first-class data consumers, and the heavyweight general-purpose codecs Parquet leaned on stopped being the right trade.

So this article is the detailed breakdown of the whole field: how Parquet actually works and where its renovation stands, what the research wave discovered about lightweight encodings, and then the three serious new formats, Lance, Nimble, and Vortex, each dissected for architecture, design center, current state, roadmap, and honest pros and cons. Then the questions that matter for practitioners: how these formats relate to the table formats above them, what to actually use for which workload, and my prediction for how the renaissance resolves. My biases as ever: I work at Dremio, I write about the Parquet and Iceberg communities weekly, and my Parquet state-of-the-project article is the deep companion to this one.

## First Principles: What a File Format Actually Decides

Strip the category to its decisions, because every format in this article is a different set of answers to the same five questions.

How are values laid out? Columnar versus row-oriented is the famous decision, and within columnar, the finer ones: how rows are grouped, whether groups are fixed or adaptive, how nested and variable-length data is represented. How are values encoded? The compression stack, from lightweight structural encodings, dictionary, run-length, delta, bit-packing, to heavyweight general codecs like Zstandard, chosen per column or per chunk, chained or singular. What metadata travels with the data? Schemas, statistics, offsets, indexes, the self-description that lets readers plan before reading. How is data accessed? Optimized for sequential scans, for random point access, for both, and at what granularity readers can retrieve without touching neighbors. And what is the contract? A byte-level specification anyone can implement, or a library whose API is the promise, a distinction that turns out to be one of the deepest dividing lines in the new generation.

Hold those five, and one economic fact from my storage deep dive: on object storage, the format's real job is minimizing the number and maximizing the usefulness of ranged reads, because requests are the currency. Every design below is spending that currency differently.

## Encodings, Explained Like You Are Human

Since the whole renaissance turns on encodings, let me build the intuition properly with tiny examples, because once these click, every format's architecture reads itself.

Start with **dictionary encoding**, the workhorse. A column of country names repeats endlessly: France, Japan, France, Brazil, Japan. Store the distinct values once in a dictionary, France is 0, Japan is 1, Brazil is 2, and the column becomes 0, 1, 0, 2, 1, tiny integers instead of strings. Compression is enormous when cardinality is low, and, foreshadowing a key trick, some operations can run on the codes without ever rebuilding the strings.

**Run-length encoding** exploits consecutiveness: a sorted status column reading active, active, active, active, canceled, canceled becomes "active times 4, canceled times 2." Sorted and low-cardinality data collapses spectacularly. **Bit-packing** notices that values fit in fewer bits than their type reserves: codes that never exceed 7 need 3 bits, not 32, so pack them shoulder to shoulder. **Frame-of-reference** handles clustered numbers: order IDs 100,000,214 through 100,000,891 become "base 100,000,214" plus tiny offsets, and **delta encoding** does the same for sequences by storing differences, timestamps a second apart become a run of 1s, which then run-length encodes into almost nothing. Encodings chain: delta, then run-length, then bit-packing, each feeding the next, and that chaining is what the research wave industrialized.

Two modern additions complete the toolkit. **FSST** brings the dictionary idea inside strings: it finds common substrings, builds a symbol table of fragments, and rewrites each string as symbol references, compressing well while keeping every individual string independently decodable, the property random access needs. **ALP** cracks floats by noticing that most real-world reals are decimals in disguise: 19.99 and 3.7 are integers scaled by powers of ten, so ALP finds the scaling per block, stores compact integers, and keeps exceptions exact, achieving what general codecs never could on the data type AI made ubiquitous.

Against all these stand the **heavyweight codecs**, Zstandard, Snappy, gzip: general-purpose compressors that treat bytes as bytes, find statistical redundancy anywhere, and pay for their generality in decode CPU and in opacity, since nothing can compute on their output without full decompression. The classic Parquet stack applies lightweight encodings first and a heavyweight codec over the top, belt and suspenders, with the heavyweight layer earning its cost when storage was slow and bytes were precious.

Now the research wave's discovery lands with full force: on modern fast storage, the heavyweight layer's decode cost often exceeds its transfer savings, while cascades of the lightweight encodings, chosen adaptively by sampling each chunk of data, match its compression and decode at memory speed, in SIMD-friendly patterns, sometimes without decoding at all. That single economic inversion, decode cost overtaking transfer cost, is the physics underneath every new format in this article. BtrBlocks proved it, FastLanes hardware-optimized it, ALP and FSST extended it to floats and strings, and Lance, Nimble, and Vortex are three different products of taking it seriously from day one.

## Apache Parquet: The Incumbent, Renovating While Occupied

**Architecture.** The full treatment lives in my Parquet article, so the compressed version: row groups horizontally, column chunks within them, encoded and compressed pages within those, and a Thrift footer mapping everything with per-chunk statistics. Readers fetch the footer, prune row groups on statistics, and issue ranged reads for exactly the surviving columns' bytes. The design converts scans into a handful of large sequential reads, which is why it owns batch analytics on object storage.

**Design center.** Scan-oriented batch analytics over structured data, compact at rest, prunable at plan time, readable by everything. That last property is the moat: thousands of independent implementations, exabytes written, and the guarantee that a Parquet file is a Parquet file everywhere.

**Current state and roadmap.** The busiest era in its history, per my dedicated article: the variant type and shredding shipped for semi-structured data, geospatial types went native, format 2.13 released, and the two great campaigns run in public, the footer redesign, FlatBuffers versus a byte-offset index, attacking wide-table metadata costs, and the eighty-message versioning debate deciding how the format evolves without fragmenting. The AI-era additions queue behind them: a fixed-size list type for embeddings, the ALP float encoding imported from the research wave, and a contested File type for unstructured payloads.

**Pros.** Universality nothing else approaches, deep table-format integration, Iceberg, Delta, and Hudi are all Parquet-native, a compression and pruning story hardened by a decade at scale, and a community demonstrably willing to absorb its challengers' best ideas.

**Cons.** Random access is the structural weakness: retrieving one row means decoding a chunk of its row group, which multiplied across a billion point lookups is the gap the AI formats drove through. Footer costs bite at extreme width and extreme file counts, the renovation's whole motivation. Float-heavy and embedding-heavy data compresses and decodes below the modern frontier until the new encodings land. And evolution is deliberately slow, the price of a thousand implementations, which is precisely the opening the fast-moving newcomers exploit.

## The Research Wave: The Ideas Underneath Everything New

Before the new formats, meet the ideas they are built from, because the renaissance's intellectual core is a handful of research results that changed what everyone believes about compression.

**BtrBlocks**, from the database group at TU Munich, made the foundational argument in 2023: for analytical data on fast storage, heavyweight general-purpose codecs are the wrong trade, and cascades of lightweight encodings, dictionary, run-length, frame-of-reference, delta, chained two or three deep and chosen per data sample, achieve comparable compression while decompressing at network speed, meaning decompression stops being the bottleneck even on multi-gigabit object storage links. The sampling-based, per-chunk automatic selection of encoding cascades is BtrBlocks' signature, and you will see it reappear in nearly every format below. As a format itself, BtrBlocks remains primarily a research artifact and reference implementation, CPU-oriented and enormously influential rather than widely deployed, the paper everyone builds on rather than the file everyone writes.

**FastLanes**, from CWI, the Amsterdam group behind much of columnar history, pushed further into hardware sympathy: a unified memory layout using virtual 1024-value vectors transposed for data-parallelism, so the same encoded bytes decode efficiently across any SIMD width and onto GPUs, plus expression encodings that chain codecs flexibly and multi-column compression that exploits correlations between columns, a frontier single-column designs cannot touch. **ALP**, adaptive lossless floating point, cracked the float problem, reals compressed via adaptive decimal scaling far better and faster than general codecs manage, and **FSST** did similarly for strings with random-access-friendly symbol tables. The tell of the whole wave's success: ALP is now under evaluation inside Parquet itself, and the new formats below cite these papers the way engines cite Arrow.

The wave's collective lesson, worth one italicized sentence in your memory: modern columnar performance comes from many small, clever, chainable, hardware-native encodings chosen adaptively per data, not from one big codec applied uniformly. Every serious format now agrees. They differ on everything else.

## Lance: The AI-Native Specialist

**Architecture.** Lance, from the team behind LanceDB, is the format that took the random-access problem personally. Its structural break with Parquet is the deletion of the row group: Lance 2.x organizes data so that any row is retrievable by position without decoding a neighborhood around it, using adaptive structural encodings that keep offsets navigable and pages independently fetchable. On top of the file layout sits what makes Lance a platform rather than just a format: a dataset layer with versioning, schema evolution, and, critically, secondary indexes as first-class citizens, vector indexes like IVF-PQ and HNSW for similarity search, scalar indexes for filtering, stored alongside the data they index. Blob-scale values, images, audio, documents, live natively next to structured columns, which is the multimodal story made physical.

**Design center.** AI data, specifically the retrieval patterns AI creates: vector similarity search, filtered point lookups feeding models, random-access shuffles during training, multimodal datasets where the embedding, the metadata, and the source artifact belong together. Where Parquet asks "which million rows match," Lance asks "fetch me these ten thousand specific rows, now," and its claimed advantage on that pattern runs to two orders of magnitude.

**Current state and roadmap.** Healthy and shipping: the 2.0 and 2.1 format generations delivered the structural-encoding architecture and better compression, the LanceDB ecosystem, embedded and serverful, gives it a native database, and adoption concentrates exactly where the design aims, vector search, feature retrieval, multimodal training corpora, with integration conversations reaching into the table-format world, including exploratory discussion of Lance as a file format within Iceberg-style tables. Roadmap direction: deeper index types, richer encoding adoption from the research wave, and the dataset layer maturing toward fuller lakehouse citizenship.

**Pros.** The best random-access and vector story in the field, genuine multimodal support, indexes as part of the format rather than an external system, and a coherent end-to-end stack for AI retrieval workloads.

**Cons.** Ecosystem breadth is the mirror image of Parquet's: one primary steward, one primary database, and general-engine support that is early, so choosing Lance today means choosing its stack. Scan-heavy classic analytics is not its game, Parquet remains better at the warehouse pattern. And the dataset layer's overlap with table formats creates an architectural either-or that enterprises with Iceberg estates must think through, the boundary question I return to below.

## Nimble: Meta's Wide-Table Workhorse

**Architecture.** Nimble, open-sourced by Meta from the format formerly known internally as Alpha, is built for a workload most companies only read about: ML feature tables with tens of thousands of columns, decoded at ferocious rates into training pipelines. Its architecture follows: metadata is radically lightweight so that extreme width does not drown planning, the pain my Parquet article's footer section describes, taken to the limit and designed around from day one. Encodings are cascaded and extensible in the research-wave style, with SIMD and GPU decoding as explicit design targets. And the most philosophically interesting choice: Nimble treats the library API as the contract rather than the byte layout, shipping as a portable implementation, deeply integrated with the Velox execution engine, whose internals can evolve aggressively because compatibility is promised at the interface, not the byte.

**Design center.** Training-data throughput on wide tables: stream mini-batches of thousands of features into accelerators without decode becoming the bottleneck, with Meta reporting decode speedups of two to three times over prior columnar formats on exactly that pattern.

**Current state and roadmap.** Real and production-proven at Meta scale, open source, and still early as a community: adoption outside Meta's orbit concentrates among Velox-adjacent systems, and the API-as-contract stance, while liberating for evolution, means the ecosystem grows implementation by binding rather than by independent reimplementation. Roadmap energy points at GPU decode, encoding breadth, and the Velox ecosystem's growth carrying it outward.

**Pros.** The credible answer at extreme width, hardware-native decode as a first principle, production pedigree on some of the largest ML pipelines on earth, and freedom to evolve fast.

**Cons.** The API-as-contract philosophy is a genuine trade: it sacrifices the property that made Parquet a standard, independent implementability from a spec, which limits Nimble's candidacy as neutral infrastructure. Ecosystem narrowness follows, and general analytics was never the target, so its excellence is deep and specific.

## Vortex: The Aspiring General-Purpose Successor

**Architecture.** Vortex, created by SpiralDB and now incubating at the Linux Foundation's LF AI & Data after entering in 2024 and promoting to incubation in August 2025, is the most ambitious entrant, because its target is not a niche, it is Parquet's whole job. The architecture reads like the research wave productized with Arrow discipline: a strict separation of logical type from physical encoding, so arrays carry meaning independent of representation, cascading compression in the BtrBlocks lineage with encodings selected by sampling, FastLanes and ALP ideas inside, compute kernels that operate directly on encoded data, filtering a dictionary array without decoding it, statistics carried per array, zero-copy serialization shared between the in-memory, on-wire, and on-file representations, and portability ambitions that extend to WebAssembly decoders and GPU decompression. The pitch in the project's own framing: be to file formats what DataFusion is to query engines, extensible, fast, batteries included. The claims that made everyone look up: random access one hundred to two hundred times faster than Parquet, scans several times faster, writes faster, at roughly Parquet-plus-Zstandard compression ratios.

**Design center.** Everything, deliberately: batch scans, point lookups, wide tables, CPU and GPU, a compressed-end-to-end Arrow-native world where data never fully decodes between disk, memory, and network. The strategic differentiator alongside the technology is governance: neutral foundation stewardship, the same move that Arrow, Iceberg, and the rest of this series' winners made, and a pointed contrast with the company-stewarded specialists.

**Current state and roadmap.** Moving fast and honestly labeled as such: the toolkit is under rapid development, the ecosystem is young but broadening, benchmark attention is real and third parties are beginning to kick the tires in public, and the incubation structure is building the multi-party community the general-purpose ambition requires. The roadmap is the ambition: harden the format, widen the encodings, land the GPU story, and grow implementations and integrations toward the critical mass where general-purpose claims meet general-purpose reality.

**Pros.** The most complete synthesis of the research wave, an architectural answer to both the scan and random-access patterns rather than a trade between them, Arrow-native design that fits the ecosystem this series lives in, and the governance posture that makes long-horizon bets thinkable.

**Cons.** Youth, in every dimension that Parquet's moat measures: implementations, integrations, production-years, and the thousand unglamorous edge cases a decade of exabytes finds. Benchmark claims, as always, await the workload diversity of strangers. And the general-purpose target means Vortex must win broadly to win at all, a harder game than the specialists are playing.

## Anatomy of a Point Lookup: Why the Gap Exists

The random-access numbers in this article, one hundred times, two hundred times, sound like marketing until you trace the mechanics, so let me trace them, because the gap is architectural and understanding it is understanding the whole specialist category.

The task: fetch row 8,344,291 of a dataset, all columns, as fast as possible. The pattern behind it is everywhere in AI: a vector index returns candidate row IDs, a feature store serves a training batch of scattered rows, a retrieval pipeline hydrates the documents behind similarity hits.

In Parquet, the row's address must be computed: the reader consults the footer, determines which row group contains position 8,344,291, and then, for each requested column, fetches that column's chunk in that row group and decodes from the chunk's start, or from the nearest page boundary with page indexes, until it reaches the target position. Compression is the complication: pages are compressed as units and many encodings are sequential, deltas need their predecessors, so reaching one value means decompressing its neighborhood. One row costs decoding thousands of neighbors, per column. Amortized across a full scan, that cost is the design working as intended. Concentrated into a million scattered lookups, it is the design inverted: nearly all decode work produces values nobody asked for.

Lance deleted the neighborhood. Without row groups, its structural encodings keep per-value addressability: offsets resolve position 8,344,291 to byte ranges directly, encodings are chosen to be sliceable, FSST-style string tables rather than sequential deltas where random access matters, and each column's value for that row is a small independent fetch. The row costs a handful of targeted reads and decodes proportional to the row itself, not its neighbors, and the two-orders-of-magnitude claims are simply that proportionality measured. The trade is real and paid consciously: some scan-time compression and locality is sacrificed for addressability, which is why Lance does not claim Parquet's crown at pure batch scans.

Vortex aims to refuse the trade: its encodings are selected not only for ratio and decode speed but for random-access friendliness and for compute-on-encoded operation, so a point lookup can often resolve against compressed data directly, dictionary codes compared without decoding, ALP integers ranged without reconstruction, and a scan runs over the same structures at full vector speed. Whether one format can genuinely hold both crowns at production diversity is exactly what its youth has yet to prove, and exactly why it is the most interesting project in the field to watch.

And the incumbent narrows the gap without closing it: finer page indexes, better statistics, and access-friendly encodings like FSST and ALP all help Parquet's lookup story, while row groups and page-unit compression, the foundations of its scan supremacy, keep the neighborhood cost structural. Formats are trades, and the specialists exist because AI made the other side of this particular trade worth taking.

## The Boundary Question: File Formats and the Table Formats Above

Now the question my table-format companion article hands to this one: how does the renaissance interact with the Iceberg-shaped world above it?

Today's reality is Parquet-centric: Iceberg, Delta, and Hudi all specify Parquet as the workhorse, with format fields in their specs and ORC and Avro as legacy options. The new formats, meanwhile, each shipped their own dataset layer, Lance most completely, out of necessity, versioning and evolution had to live somewhere. That creates the current awkwardness: an enterprise with an Iceberg estate and an AI team on Lance runs two versioning worlds, and the boundary between table format and file format, which my Parquet and Iceberg v4 articles both found under negotiation, is being negotiated here too.

Three resolutions are visible, and they will likely all happen in parts. First, absorption: Parquet adopts the renaissance's ideas, ALP, fixed-size lists, cheaper footers, possibly a File type, narrowing the gap for mainstream workloads inside the existing table-format world, the incumbent-that-learns pattern my Parquet article bet on. Second, pluggability: table formats grow honest multi-file-format support, so an Iceberg table could hold Lance or Vortex files where workloads justify them, discussions to that effect are live in the community, and the v4-era emphasis on typed, extensible metadata makes it more plausible than it once was. Third, specialization with bridges: AI-native stacks keep their native formats and dataset layers, and interop happens at the Arrow layer and the catalog layer, with governance spanning what physics separates, the same mixed-estate pattern my table-format article describes one level up.

My practitioner translation: the file format layer is becoming a portfolio, exactly as the table layer did, and the durable investments are the ones that survive every resolution, Arrow-native pipelines, open catalogs governing across formats, and data whose meaning lives in portable metadata rather than in any single container's quirks.

## A Worked Example: One Dataset, Four Formats

Make it concrete with a single dataset run through the field: a product-catalog corpus for an AI commerce application, fifty million rows, each with structured attributes, price, category, timestamps, a text description, a 768-dimension embedding, and a product image. Three consumers: nightly BI over the structured attributes, a training pipeline sampling random batches, and a live retrieval service answering similarity queries with filters.

As Parquet inside an Iceberg table, the BI consumer lives its best life: statistics prune scans to relevant categories and dates, the structured columns compress beautifully, and every engine in the estate reads it under full governance. The embedding column, stored as a variable-length list pending the fixed-size type, is bulkier and slower to decode than it should be, the training pipeline's random sampling pays the neighborhood tax from the previous section, and the retrieval service cannot be served from these files at all without an external vector index over exported data. Verdict: the spine, not the whole skeleton.

As Lance, the retrieval service is native: the vector index lives with the data, similarity search with attribute filters runs against one artifact, the images sit alongside as blobs, and the training pipeline's random batches are the format's home turf. The nightly BI query works, and works less well than Parquet's scan machinery, and the dataset now lives in Lance's own versioning world, adjacent to rather than inside the governed Iceberg estate. Verdict: the serving and training layers, brilliantly, with a governance seam to manage.

As Nimble, the interesting fit appears if this catalog were the narrow slice of a much wider feature table, thousands of engineered features per product feeding continuous retraining: decode throughput into the trainers becomes the binding constraint, and Nimble's lightweight metadata and cascaded, SIMD-friendly encodings are built for precisely that. For this dataset as described, its advantages are latent. Verdict: the specialist you call when width and decode rate explode.

As Vortex, the pitch is all three consumers from one format: scans competitive with Parquet for the BI job, random access competitive with the specialists for training and hydration, compute-on-encoded execution keeping everything fast, Arrow semantics keeping everything integrable. In 2026 that pitch is a credible prototype rather than a proven estate: engine integrations are young, and the governed-table story is the same open boundary question as everyone else's. Verdict: the future to pilot, sized honestly.

The 2026 architecture most teams actually land: Iceberg-governed Parquet as the source of truth serving BI and the estate, a Lance dataset derived from it serving retrieval and training, refreshed by pipeline, with Arrow as the interchange and the catalog governing both sides of the seam. Two formats, one lineage, each doing what it was built for, and the pluggability question from the previous section is precisely the question of whether that seam eventually disappears.

## The Long Tail: F3, AnyBlox, and the Self-Describing Future

One more current from the research world deserves its own section, because it points at the field's most radical possible future: formats that carry their own decoders.

The versioning agony my Parquet article chronicled, eighty dev-list messages on how a format evolves without stranding a thousand implementations, exists because the decoder and the data live in different places: the bytes travel, and every reader must independently know how to interpret them, forever, across every version. Projects like F3, the pointedly named File Format for the Future, and AnyBlox explore the dissolving move: embed the decoding logic itself, compiled to WebAssembly, inside or alongside the file, so any reader with a WASM runtime can decode any file, including files using encodings invented after the reader shipped. The format war's deepest constraint, that innovation is rationed by the slowest implementation's upgrade cycle, simply evaporates: new encodings deploy with the data that uses them.

The idea is younger than everything else in this article and its questions are honest ones: sandboxed decode performance versus native, security review of executable data, the operational meaning of a corpus whose every file might decode differently. But notice who else is holding pieces of it: Vortex ships WASM decoders for portability, Nimble's API-as-contract philosophy is the same insight expressed as a library boundary, and the extensible-encoding architectures across the new generation are all partial answers to the same rationing problem. I do not expect executable files to sweep the enterprise this decade. I do expect the pressure they respond to, the widening gap between how fast encoding research moves and how fast standards can absorb it, to keep shaping every format on this list, and self-describing decode is the logical endpoint the whole field is quietly walking toward.

## Choosing in 2026: Format by Workload

The honest decision guide, workload first.

Classic analytics, BI, and the lakehouse spine: Parquet, without hesitation, inside Iceberg or its peers. The ecosystem, the table-format integration, the pruning machinery, and the renovation trajectory make it the continuing default for the scan-shaped world, and nothing else is close on universality.

Vector search, retrieval, and multimodal AI applications: Lance is the purpose-built answer, especially with LanceDB as the serving layer, and the right choice when the retrieval pattern dominates and the stack commitment is acceptable. Keep the source-of-truth story explicit, many teams pair a governed Parquet-and-Iceberg estate with Lance datasets derived for serving, which is a hot-and-cold pattern this series has recommended in three other costumes.

Extreme-width ML training pipelines, especially Velox-adjacent: Nimble is the specialist built at the scale you are imitating, worth evaluating whenever feature width and decode throughput are the binding constraints and the API-contract model fits your engineering culture.

Systems building and forward positioning: Vortex is the one to prototype, contribute to, and watch, the format whose success would most reshape the field, and whose Arrow-native, compute-on-encoded design is the best preview available of where the whole layer is heading. Production bets should be sized to its youth and to your appetite for the frontier.

And everywhere: measure on your data. The renaissance's own lesson is that encodings are adaptive because data varies, which means benchmark deltas vary too, and the format that wins your workload is an empirical question the papers cannot answer for you.

## Questions I Hear Most Often

**Is Parquet going to be replaced?** My Parquet article made the bet and this survey strengthens it: the most likely future is Parquet absorbing the challengers' ideas faster than the challengers build Parquet's moat, with genuine specialist niches, vector retrieval foremost, running native formats alongside. The moat is not technical excellence, it is ten thousand implementations and exabytes of installed base, and the community's absorption reflex, ALP under evaluation, footer redesign underway, is visibly functioning. Replacement would require the incumbent to stop learning, and the evidence says it has not.

**Why not just make Parquet fast at random access?** Because some of the gap is architectural, not incremental. Row groups and page-level compression are why Parquet scans and compresses so well, and they are structurally why point access decodes neighborhoods, the specialists deleted that trade at its root. Parquet can and will narrow the gap, wider stats, better page granularity, new encodings, and the extreme random-access pattern will likely always favor formats that made it the design center. Formats are trades, and no renovation escapes all of them.

**Do the new formats compress better than Parquet?** Roughly comparably, by design: Vortex targets Parquet-plus-Zstandard ratios while transforming speed, and the research wave's whole point was matching heavyweight compression with lightweight cascades. The wins are in decode speed, random access, and hardware sympathy, not primarily in bytes at rest, so evaluate them on access economics, request counts, decode CPU, latency, rather than storage bills.

**What about ORC?** Honorable legacy: still excellent inside Hive-lineage estates, still maintained, and no longer where new design energy or new deployments go. Its best ideas long since cross-pollinated, and its practical 2026 role is the installed base, with migrations flowing Parquet-ward as estates modernize.

**How do these interact with Arrow?** Intimately, and it is the quiet unifier: Parquet's implementations live substantially in Arrow repositories, Vortex is explicitly an Arrow-ecosystem extension keeping Arrow semantics over compressed data, Lance and Nimble both speak Arrow at their boundaries, and every decode in this article lands in Arrow memory for execution. Whatever happens at the file layer, the in-memory meeting point is settled, which is precisely what makes a multi-format world workable, my Arrow article is the companion on why.

**What single development would most change this picture?** Honest file-format pluggability landing in Iceberg-class table formats. The moment a governed Iceberg table can hold specialist files for specialist columns or partitions, with catalogs and engines treating it as one table, the either-or between the AI-native stacks and the enterprise estate dissolves, and the renaissance's innovations reach mainstream data through the front door. Watch that boundary above all others.

## Closing Thoughts

The file format renaissance is the data stack's foundation being re-poured while the building stands, and the shape of the pour is now visible: a research wave that redefined compression as adaptive cascades of hardware-native encodings, specialists that made random access and extreme width first-class citizens for the AI era, an aspiring general-purpose successor gathering the whole synthesis under neutral governance, and an incumbent responding the way healthy standards respond, by learning in public. Ten years of this series' recurring lesson apply one more time at one more layer: the physics gets negotiated at the bottom, the value accrues at the top, and the investments that endure are the open ones.

If you want the full foundation, from these files through the table formats, catalogs, semantics, and AI systems above them, that is what my books are for. I co-authored Apache Iceberg: The Definitive Guide and Apache Polaris: The Definitive Guide for O'Reilly, with further titles on lakehouse architecture, data engineering, and agentic analytics.

Browse the full collection of my books on data and AI at [books.alexmerced.com](https://books.alexmerced.com).
To try a modern Agentic Lakehouse experience, visit [dremio.com/get-started](https://www.dremio.com/get-started).
