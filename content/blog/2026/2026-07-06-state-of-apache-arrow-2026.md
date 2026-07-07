---
title: "The State of Apache Arrow in 2026: Ten Years In, the Invisible Standard Is Everywhere"
date: "2026-07-06"
canonical: https://iceberglakehouse.com/posts/state-of-apache-arrow-2026/
description: "Apache Arrow at 10 — ADBC, Flight SQL, nanoarrow, the AI reinterpretation, and how an in-memory standard eliminated the copy tax across the data stack."
author: "Alex Merced"
category: "Apache Arrow"
tags:
  - Apache Arrow
  - data engineering
  - lakehouse architecture
  - in-memory analytics
  - ADBC
  - Flight SQL
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/state-of-apache-arrow-2026/).

# The State of Apache Arrow in 2026: Ten Years In, the Invisible Standard Is Everywhere

*By Alex Merced, Head of Developer Relations at Dremio*

In February 2026, Apache Arrow turned ten years old. The first commit landed on February 5th, 2016, and the anniversary passed the way Arrow itself operates: quietly, while running inside nearly every data tool you touched that day.

I have a house interest to declare here too, and in this case it is practically genetic. Arrow was co-created by people who founded and built Dremio. Jacques Nadeau, Dremio's co-founder, was Arrow's original PMC chair, and Dremio's founding engineers were among the earliest contributors, building the company's engine Arrow-native from day one, years before that was a fashionable phrase. The project's origin braided together several threads: the Apache Drill community's in-memory format work, Wes McKinney's frustrations with pandas performance, and the Parquet community, where Julien Le Dem and other Parquet founders joined the early design sessions to build the in-memory complement to their on-disk format. Ten years later, that braid runs through pandas, Spark, Snowflake, DuckDB, Polars, and the AI stack.

So this article is my 2026 state of the project: what Arrow actually is beneath the buzzword, the full surface area it now covers, what the development pulse looks like this year, how deep the penetration really goes, the honest challenges, and why the next decade of Arrow is being written by AI workloads. Arrow suffers from a strange fame problem: everyone has heard of it and few can explain it. Let me fix the second part.

## What Arrow Actually Is: The Cost of Copies

Strip away everything else, and Arrow is an answer to one question: what should a table look like in memory?

That sounds too small to matter. Here is why it is enormous. Before Arrow, every system answered the question privately. Pandas had its internal layout, Spark had another, every database had its own, and every file format had its own. So whenever data crossed a boundary between systems, and analytics is nothing but data crossing boundaries, it had to be converted: serialized out of one representation, parsed into another, row by row, allocation by allocation. Studies and painful experience suggested that big data systems were spending most of their CPU cycles not computing anything, just translating data between representations of itself. The industry was paying a permanent tax to disagreement.

Arrow's founding move was to make the in-memory representation a standard rather than an implementation detail. It specifies, byte for byte, how columnar data sits in memory: values of a column contiguous in fixed-width buffers, variable-length data like strings in value buffers with offset arrays pointing into them, null tracking in validity bitmaps, nested types built by composing these primitives. The layout is language-independent and machine-friendly, designed so modern CPUs can rip through it with vectorized instructions, and defined identically whether the process is C++, Java, Python, Rust, or Go.

The payoff is the elimination of translation. When two systems both speak Arrow, handing data between them is not a conversion, it is a pointer. The C Data Interface lets two libraries in the same process share Arrow data with zero copies, literally passing memory addresses. The IPC format lets processes and machines exchange Arrow data as a stream of buffers that the receiver uses as-is, no parsing step at all. The tax to disagreement drops to zero because the disagreement is gone.

The analogy I have used for years: before shipping containers, every transfer between ship, train, and truck meant unloading and repacking cargo by hand, and ports spent more effort repacking than moving. The container standardized the box, so cargo stopped being touched at boundaries. Arrow is the shipping container for tables. Nobody gets excited about the box. Everybody's goods move faster because the box is boring and identical everywhere.

One more foundation worth setting, since the two are eternally confused: Arrow and Parquet are complements, not competitors. Parquet is how a table sits on disk, optimized for compact storage and selective reading. Arrow is how a table sits in RAM, optimized for computation and exchange. Data typically lives as Parquet, gets read into Arrow, is computed on and shared as Arrow, and lands back as Parquet. The two communities have intertwined to the point that most official Parquet implementations, in C++, Rust, and Go, are literally developed inside Arrow repositories today. The founders designed them as two halves of one interoperability answer, and a decade later the halves have effectively merged their engineering.

## A Decade in Six Chapters

Before surveying the present, a compressed history helps, because Arrow's current shape only makes sense as accumulation. Six chapters, roughly chronological.

Chapter one, 2016 to 2017, was the founding bet. The format specification, the first C++ and Java implementations, and the founding argument that a shared memory layout would pay for itself. Adoption was speculative, and the early integrations, pandas interchange, Spark's Python acceleration, were proofs of concept that the copy tax was real and removable.

Chapter two, 2018 to 2019, was language expansion. Rust, Go, JavaScript, and more joined, establishing the principle that Arrow's value scales with the square of its implementations, since every new language can now exchange with every existing one. Flight arrived at the end of this stretch, extending the standard from memory to the network.

Chapter three, 2020 to 2021, was the compute era. A 1.0 format with stability guarantees, the C++ compute kernels and what became Acero, Gandiva for expression compilation, and DataFusion growing inside the Rust repository. The project tested how far up the stack a standard should climb.

Chapter four, 2022 to 2023, was connectivity. Flight SQL matured, ADBC launched with its 1.0 specification, and nanoarrow appeared at the opposite extreme, Arrow as two embeddable C files. The project's center of gravity shifted from "represent data well" to "move data everywhere," which in hindsight was the decisive strategic turn.

Chapter five, 2024 to 2025, was restructuring and resilience. Language implementations moved to independent repositories, DataFusion graduated to its own Apache Top-Level Project, format additions like string views and run-end encoding landed for modern workloads, and the community absorbed the wind-down of its largest corporate patron without missing a release. The first Arrow Summit in Paris closed the chapter with the community meeting itself in person.

Chapter six is now: the anniversary, the AI reinterpretation, ADBC's adoption knee, and a contributor intake that skews toward Rust and toward the connectivity layers. Each chapter built on the last without discarding it, which is the quiet discipline that separates standards that endure from projects that pivot.

## The Surface Area: Far More Than a Format

People who last checked on Arrow in 2019 think of it as a memory spec with a Python library. The 2026 project is a family of standards and libraries covering the full lifecycle of data in motion. A tour of the surface, layer by layer.

**The format layer** remains the core: the columnar specification itself, now rich with a decade of carefully added types. Recent years brought string view and binary view layouts, which store short strings inline and long strings by reference for dramatically faster string-heavy workloads, list view variants, run-end encoding for compressed representation of repetitive data, and smaller decimals down to 32 and 64 bits. Alongside the layout spec sit the interchange standards: the C Data Interface for zero-copy in-process sharing, the IPC streaming and file formats for crossing process and network boundaries, and canonical extension types so the ecosystem can agree on things like UUIDs, JSON, and geospatial data without forking the format. The discipline here is the story: format changes move slowly, through votes, because a hundred systems have to agree byte for byte, and the community has kept that discipline for ten years.

**The implementation layer** is where the past two years reorganized the project. The main apache/arrow repository now holds the format specification and the C++ implementation with its Python, R, Ruby, and GLib bindings, while the other languages graduated to their own repositories: arrow-java, arrow-rs for Rust, arrow-go, arrow-js, arrow-dotnet, arrow-swift, and arrow-nanoarrow. That split, mundane as it sounds, unclogged release cycles and let each language community move at its own pace, and the results show in the cadence: the main line shipped 23.0.0 in January 2026, a 23.0.1 security patch for the C++ IPC reader in February, and 24.0.0 in April, while Java shipped its own 19.0.0 in March with a proposal to raise the floor to JDK 17 for the next major, aligning with the broader Java modernization wave across the data stack.

Two implementations deserve their own sentences. Arrow-rs, the Rust implementation, has become an ecosystem force in its own right, the foundation under DataFusion, InfluxDB 3, and much of the new-generation lakehouse tooling in Rust, and in 2025 it attracted more first-time contributors than the main repository itself, 132 to 125. And nanoarrow, at the tiny end, ships the format as a pair of C files that any library can embed without adopting a heavyweight dependency, and its steady release train, 0.8.0 in February 2026 with string view building, LZ4 decompression, and broader packaging, has made "just embed Arrow" viable for R packages, database drivers, and anything else that wants the standard without the toolkit.

**The transport layer** is where Arrow stopped being only about memory. Arrow Flight is an RPC framework for moving Arrow data over the network at scale, skipping serialization on both ends. Flight SQL layers database semantics on top, queries, prepared statements, catalogs, so a database can expose one wire protocol that any Flight SQL client can consume, and Dremio, InfluxDB 3, and a growing set of engines ship it as a first-class interface. The long-running effort to build a Flight SQL ODBC driver, with sustained contribution from BigQuery-affiliated engineers among others, aims the same protocol at the vast installed base of ODBC tooling.

**The connectivity layer** is the newest and, I would argue, the most strategically important: ADBC, Arrow Database Connectivity, which deserves its own section.

**And the compute layer** tells a graduation story. Arrow C++ ships Acero for query execution, and the Java lineage included Gandiva for expression compilation. But the headline is DataFusion, the Rust query engine that began life as an Arrow subproject and grew until it graduated into an independent Apache Top-Level Project, now the embedded engine inside a wave of commercial and open systems. Arrow's compute ambitions succeeded so thoroughly that they left home, which is the best possible outcome for a foundational project: the standard stays neutral, and the engines built on it compete above it.

## ADBC: Fixing the Last Slow Mile

If I had to pick the single most consequential Arrow initiative of this decade so far, it is ADBC, because it attacks the last place where the copy tax survived untouched: the database driver.

The absurdity it fixes is easy to state. We spent fifteen years building columnar databases, columnar file formats, and columnar memory, and then connected them to applications through JDBC and ODBC, APIs designed in the early 1990s that hand data over row by row. A columnar database executing a columnar query for a columnar client would pivot results into rows at the driver boundary so the client could pivot them straight back into columns. Every analytical tool in the world was paying this toll on every query, and it was invisible only because it was universal.

ADBC is the columnar replacement: a vendor-neutral API where applications ask for data and receive Arrow, full stop. Drivers for Arrow-native systems pass data through essentially untouched. Drivers for row-oriented systems do the conversion once, inside the driver, where it can be optimized, instead of in every application. It deliberately complements rather than replaces Flight SQL: ADBC is the client-side API, Flight SQL is a wire protocol a server can speak, and an ADBC driver can use Flight SQL, a native protocol, or anything else underneath.

The 2026 status is a project hitting its adoption knee. The libraries shipped version 23 in April, with the API specification itself at 1.1 and a 1.2 milestone underway focused on richer metadata and catalog capabilities. The driver roster now covers Snowflake, BigQuery, DuckDB, PostgreSQL, SQLite, Flight SQL generally, and a newly contributed Go driver for Databricks, with a startup called Columnar, founded around core Arrow contributors including Ian Cook, launching commercial ADBC drivers for Redshift, MySQL, SQL Server, and Trino to fill the long tail. Adoption stories carry real numbers: DuckDB reported query time reductions beyond 90 percent in many applications versus the old driver path, Microsoft adopted ADBC for Power BI connectivity, and the driver manager work now spans Python, Java through JNI bindings to native drivers, and as of this spring, Node.js on NPM. A decade from now, I suspect we will look at row-oriented drivers for analytics the way we now look at hand-rolled CSV parsers: a thing everyone did, and nobody could quite explain why.

## The Development Pulse: A Community That Outgrew Its Patron

The health of a ten-year-old open source project is a fair question, and 2025 gave Arrow a stress test with an unusually clean answer.

Voltron Data, the company that had employed a large concentration of Arrow maintainers and hosted project infrastructure, wound down operations in 2025. A project overly dependent on one patron dies or drifts when this happens, and the fact that Arrow's year-end community report treats the event mostly as an infrastructure-migration item, benchmarking systems and nightly builds moved to Arrow-managed accounts, driven by community members, is the tell. The contributor base had diversified past the point of single-sponsor risk years earlier.

The numbers behind that resilience: across the main language implementations, more than 300 new contributors showed up in 2025 alone, with the Rust repository leading the intake. The first Arrow Summit convened in Paris in October 2025, bringing maintainers and users together for the project's first dedicated conference, a milestone that usually marks a community graduating from mailing-list scale to movement scale. Governance has been steady, with the PMC publishing anniversary retrospectives and community highlights that read like a project comfortable in its own skin, celebrating things like stale-issue cleanup and packaging work, the deeply unglamorous maintenance that only healthy communities bother to celebrate.

The release rhythm tells the same story. Major versions land roughly quarterly on the main line, the language repositories ship on their own cadences, ADBC and nanoarrow run their own trains, and a February security advisory for the C++ IPC reader was disclosed, patched, and shipped in 23.0.1 with the boring competence you want from infrastructure. Ten years in, the pulse is strong and, more importantly, distributed.

## Penetration: The Part Everyone Underestimates

Here is where I get to make the claim that sounds like advocacy and is just arithmetic: Arrow is plausibly the most widely deployed piece of data infrastructure created in the past decade, and most of its users have never typed the word.

Walk the Python data stack. Pandas ships Arrow-backed data types and leans on Arrow for I/O, and every pandas user reading a Parquet file is running Arrow code. Polars is Arrow-native to its bones. DuckDB exchanges Arrow data zero-copy with everything around it. The result is that essentially every Python data scientist runs Arrow daily, knowingly or not.

Walk the big engines. Spark uses Arrow to make pandas UDFs and Python interchange fast. Snowflake returns results in Arrow through its drivers. Dremio has been Arrow-native since inception, with Flight and Flight SQL as its high-speed interfaces, and the same story repeats across BigQuery interfaces, InfluxDB 3, and the wave of Rust-based systems built on arrow-rs and DataFusion. GPU computing standardized on the same layout through cuDF and its relatives, which is exactly the point of a memory standard: the same bytes that a CPU engine produced can land on a GPU without reshaping.

Walk the AI stack, because this is where the past two years added a whole new continent. Hugging Face's datasets library is built on Arrow, meaning a meaningful fraction of the world's model training data flows through Arrow buffers on its way into GPUs. Vector and embedding workloads lean on Arrow's fixed-size list and tensor extension representations. Observability pipelines adopted Arrow through the OpenTelemetry Arrow protocol to cut telemetry bandwidth dramatically. Geospatial computing built GeoArrow on top of the extension type machinery. And the lakehouse world, my daily habitat, runs on the Arrow-Parquet partnership end to end: Iceberg tables store Parquet that engines read into Arrow, with the newest features like the variant type specified jointly across the Parquet and Iceberg communities with Arrow-resident implementations.

The pattern across every walk: Arrow won by disappearing. It is not a product anyone chooses at a whiteboard. It is the agreement underneath the products, and agreements compound. Every system that adopts Arrow makes Arrow more valuable for the next system, which is why the adoption curve has never had a plateau, only accelerations.

## A Worked Example: One Dataset's Day, With Arrow Highlighted

Claims about ubiquity land better traced than asserted, so let me follow one dataset through one ordinary day at a composite company and highlight every moment Arrow is present. Nobody in this story thinks about Arrow once. That is the point.

Morning. Overnight clickstream events landed in an Apache Iceberg table as Parquet files on object storage. A Spark job starts the day's feature engineering, and as it reads those files, the Parquet decoder, developed inside the Arrow project's repositories, decompresses disk pages into Arrow columnar batches in memory. The job's Python UDFs run over pandas batches that Spark hands across the JVM-to-Python boundary as Arrow buffers, the interchange that made this pattern fast enough to be standard practice. First boundary crossed, zero rows pivoted.

Midmorning. An analyst opens a notebook to investigate a metric dip. Her query goes to the lakehouse engine, Dremio in my telling, which plans and executes entirely over Arrow batches internally, then returns results over Arrow Flight. Her notebook's client lands those buffers zero-copy and wraps them as a Polars frame, Arrow-native, so exploration is instant. She pulls a reference table from PostgreSQL through an ADBC driver, receiving Arrow directly instead of paying the row-by-row toll of the old driver stack, and joins the two frames without either being converted, because both were the same bytes-level format all along. Three more boundaries, still zero conversions.

Afternoon. The data science team trains a ranking model on last quarter's data. Their training pipeline loads examples through a datasets library built on Arrow, streaming record batches from Parquet shards into tokenizers and collators, feeding accelerators at a rate that per-record deserialization would have throttled. Meanwhile, the platform team's observability pipeline has been shipping the day's telemetry using the OpenTelemetry Arrow protocol, cutting the bandwidth bill for metrics that describe all of the above.

Evening. The new agentic assistant fields a question from a sales director: how did the campaign perform by region? The agent authenticates through the catalog, issues SQL to the lakehouse, and receives a result set that, in the emerging pattern, travels as Arrow over Flight into the agent's runtime, where it is summarized for a human and forwarded, still columnar, to a charting service. The day's final boundary crossed the same way the first one was.

Count the crossings: Parquet to Spark, JVM to Python, engine to notebook, database to dataframe, frame to frame, storage to trainer, service to collector, lakehouse to agent. A decade ago every one of those was a serialization event, each burning CPU and each an opportunity for types to mangle in translation. Today every one is the same buffers changing hands. Multiply this day by every company running a modern data stack and you have the honest measure of Arrow's penetration: not a market share number, but a tax that an entire industry quietly stopped paying.

## Arrow and the AI Era: The Next Decade's Pull

Every technology gets reinterpreted by the era it survives into, and Arrow's reinterpretation is happening now. Julien Le Dem's talk at this spring's Iceberg Summit carried the thesis in its title, column storage for the AI era, and the argument deserves unpacking because it will drive the project's next decade.

AI workloads are, beneath the glamour, the most data-movement-intensive workloads ever deployed. Training pipelines shovel tokens and tensors from storage to accelerators at rates where any per-record overhead is fatal. Feature engineering joins petabytes across systems. Retrieval pipelines move embeddings between stores, indexes, and models continuously. Every one of those movements is a boundary crossing, and boundary crossings are exactly the thing Arrow exists to make free. The stack noticed: the training-data path standardized on Arrow years ago through the datasets ecosystem, and the format's newer types, tensors, views, run-end encoding, read like a list of AI workload accommodations.

The newer and more interesting frontier is agents. Agentic analytics, the pattern where AI agents query, transform, and act on data autonomously, is mostly plumbed today with JSON over HTTP, a format that is to data movement what smoke signals are to fiber optics. Core Arrow contributors have been making the public case that agent-to-data and agent-to-agent channels should carry Arrow, with throughput advantages over JSON-based transport that are not incremental but categorical, especially once results stop being three rows of chat context and start being real analytical payloads. When an agent asks a lakehouse a question, the answer should travel as Arrow over something like Flight, land zero-copy in the agent's runtime, and flow onward without ever being stringified. The pieces all exist. The standardization conversations, including how Arrow-native transport fits alongside agent protocols like MCP, are the ones to watch through 2027.

I will say the Dremio-flavored version plainly, since I have already declared my colors: we built an engine on Arrow a decade ago because moving data without copies was the right architecture for BI. The agent era is that same argument with the volume turned up, because agents issue more queries, chain more systems, and tolerate less latency than humans ever did. The infrastructure bet Arrow's founders made in 2016 turns out to have been a bet on 2026's workloads.

## Honest Challenges

A state-of address that skips the hard parts is a press release, so here are the real ones.

**Format evolution is a permanent tension.** Every new layout, views, run-end encoding, new decimals, makes the format better and fragments it temporarily, because a hundred implementations adopt at a hundred speeds, and data written with new types meets readers that lack them. The community manages this with format versioning, capability negotiation in the protocols, and deliberate slowness, but the tension never resolves, it is only governed. The practical advice for builders: track the canonical extension types and check reader support before adopting the newest layouts on shared boundaries.

**Implementation parity is unevenly funded.** The C++ and Rust lines are thriving, Go is healthy, and the JavaScript, .NET, and Swift implementations move more slowly, with Java in a modernization push, the JDK 17 floor discussion, repository independence, ongoing Flight SQL investment, that still trails the energy of arrow-rs. Since Arrow's value is precisely its everywhere-ness, the gaps between implementations are the project's most strategic surface, and where new contributors can matter most.

**The compute question stays deliberately unresolved.** With DataFusion graduated and Acero maintained, Arrow-the-project hosts less of the execution story than it once seemed destined to, and some observers read that as retreat. I read it as focus: the standard stays neutral and universal, engines built on it compete freely, and the project's scarce attention goes to formats, transport, and connectivity, the layers where a neutral steward is irreplaceable. But it is a choice with trade-offs, and reasonable people in the community still argue it.

**And invisibility cuts both ways.** A standard nobody sees is a standard nobody funds marketing for, and Arrow perpetually punches below its adoption weight in mindshare, conference keynotes, and, frankly, corporate sponsorship of maintenance. The post-Voltron community proved it can carry the load. The load is still real, and the anniversary retrospectives' emphasis on thanking maintainers for janitorial work is both charming and a quiet fundraising pitch the ecosystem should hear.

## Getting Hands-On: Where to Start by Role

Since "Arrow is everywhere" can leave people unsure where to actually touch it, here is my starting map by role, each entry a first project you can finish in an afternoon.

If you are a data analyst or scientist, make the invisible visible. Take a workflow you already run, a Parquet read into pandas or a pull from a warehouse, and switch the pandas path to Arrow-backed dtypes or swap the connection to an ADBC driver, then measure. The before-and-after on a wide result set is the fastest way to internalize what the copy tax was costing you, and the code change is usually a handful of lines. Then hand the same data between pandas, Polars, and DuckDB in one notebook and notice that the handoffs cost nothing, because nothing is being converted.

If you are a data engineer, adopt the interchange consciously. Next time two services in your pipeline exchange data through JSON or CSV over HTTP, prototype the same hop as Arrow IPC or Flight and benchmark both directions. Then look at your driver layer: every JDBC or ODBC connection feeding an analytical workload is a candidate for an ADBC swap, and the drivers for the major warehouses are mature enough to trial in a day.

If you are a platform or infrastructure builder, the leverage points are Flight SQL on your serving side and nanoarrow at your edges. Exposing Flight SQL puts your service one protocol away from every ADBC, JDBC, and eventually ODBC client at once, and embedding nanoarrow gives you the format in constrained environments, drivers, plugins, embedded readers, without a heavyweight dependency. And if you write Rust, arrow-rs plus DataFusion is the fastest path from zero to a working columnar engine that exists today, which is exactly why so many new systems start there.

If you want to contribute, the community highlights each year effectively publish the wish list: implementation parity in the smaller languages, the Flight SQL ODBC driver, packaging and docs, and triage in the busiest repositories. More than 300 people made their first Arrow contribution in 2025. The water is warm, and the maintainers are famously welcoming to newcomers who show up with a reproduction or a benchmark in hand.

## The Standards Lesson Arrow Keeps Teaching

One more reflection before the questions, because Arrow's decade doubles as the best case study we have in how open data standards actually win, and the lesson generalizes to every layer of the stack I write about.

Arrow never had a killer feature. At any given moment, some proprietary format was faster for some workload, some vendor's interchange was more convenient inside its own walls, and a benchmark could always be constructed where Arrow looked merely fine. What Arrow had instead was a property no proprietary alternative could offer: neutrality with staying power. It was governed at a foundation, implementable by anyone, and guaranteed not to tilt toward any vendor's interest, which made it the only format that competitors could all adopt without arming each other. Snowflake and Databricks and Dremio and Google do not agree on much. They can all agree on Arrow, precisely because agreeing on it concedes nothing.

That property compounds in a way features do not. A feature advantage erodes as competitors copy it. A neutrality advantage grows with every adopter, because each new system that speaks Arrow raises the cost of speaking anything else. Economists call it a network effect. I prefer the plainer framing: standards win by making disagreement expensive, and Arrow spent a decade patiently raising the price of disagreement about memory layout until nobody could afford it.

The same play has now run twice more in my corner of the industry. Parquet raised the price of disagreement about analytical storage. Iceberg raised it for table metadata, and its REST protocol is raising it for catalogs, with Polaris as the neutral implementation. In every case, the winning move was the same: put the specification where no one controls it, let competitors co-invest safely, and wait for compounding to do what marketing cannot. When people ask me why I bet my career on open lakehouse architecture, this is the answer in miniature. The open standard is not the idealistic choice that costs performance. Over any horizon longer than a budget cycle, it is simply the winning strategy, and Arrow is the decade-long proof.

It also explains the correct posture toward the challenges I listed above. Format evolution tension, uneven implementation funding, and the invisibility problem are not signs of weakness. They are the operating costs of neutrality, the price a standard pays for belonging to everyone. Ten years of receipts say the community pays those costs willingly, and the ecosystem is enormously richer for it.

## Questions I Hear Most Often

The recurring questions, answered directly.

**Is Arrow a database? A file format? What do I install?** Neither. Arrow is a specification for in-memory columnar data plus a family of libraries implementing it, and mostly you do not install it, it arrives inside tools you already use. You reach for Arrow directly when you build data infrastructure: a driver, an engine, a pipeline between systems, a service returning analytical results. For everyone else, Arrow is why your pandas-to-Spark handoff or your DuckDB-to-Polars handoff stopped costing anything.

**Arrow versus Parquet, one more time?** Disk versus memory. Parquet optimizes for storage: heavy compression, encodings that trade CPU for size, layouts for selective reads from slow media. Arrow optimizes for computation: layouts a CPU can vectorize over, no decode step, zero-copy sharing. You want both, they are designed as a pair, and their implementations increasingly live in the same repositories maintained by the same people.

**Does Arrow make my queries faster?** Indirectly and honestly: Arrow removes overhead between systems rather than accelerating the computation inside one. If your workload never crosses a boundary, Arrow gives you little. The moment data moves, between libraries, processes, machines, drivers, or accelerators, Arrow converts a copy-and-convert cost into approximately zero. Since real pipelines cross boundaries constantly, the savings are ubiquitous, which is different from magical.

**Should my team adopt Flight SQL or ADBC?** Both, at different layers, and the confusion is common enough to spell out. ADBC is the API your applications code against, one interface for many databases, always yielding Arrow. Flight SQL is a protocol a server exposes on the wire. A database that speaks Flight SQL serves ADBC clients beautifully, and ADBC drivers exist for systems that speak nothing of the sort. If you build clients, adopt ADBC. If you build servers, expose Flight SQL. If you do neither, watch your vendors do it for you, which they are.

**Is Arrow still healthy after the Voltron Data wind-down?** The 2025 evidence says clearly yes: 300-plus new contributors across the implementations in a single year, infrastructure migrated to community-managed accounts without visible disruption, releases on cadence across every repository, a security response handled cleanly, and the first Arrow Summit convened. Concentration risk was the fair worry five years ago. The record since is a case study in a community outgrowing its founding patrons, which, I will note with a smile, is also the Arrow origin story itself.

**Where does Arrow fit in my lakehouse architecture?** Everywhere data moves and nowhere you have to draw it. Parquet under your Iceberg tables on disk, Arrow inside every engine that reads them, Flight or Flight SQL when results cross the network, ADBC when applications and notebooks connect, and increasingly Arrow again when agents consume the answers. The lakehouse pitch has always been open formats at every layer so no layer locks you in. Arrow is that pitch applied to the layer nobody used to think about: the memory between systems.

## Closing Thoughts

Ten years ago, a group that included Dremio's founders, the Parquet creators, and the author of pandas agreed on something unusual: the industry's biggest performance problem was not inside any system, it was between them, and the fix was not a product but an agreement. Everything since, the format, the languages, Flight, ADBC, the graduated engines, the AI-era reinterpretation, is that agreement compounding.

The state of Arrow in 2026 is that the agreement won so completely it became ambient. Three hundred new contributors a year tend a standard that billions of daily operations flow through unnoticed, the copy tax that once consumed most of analytics' CPU cycles has been engineered down toward zero across an entire industry, and the workloads of the next decade, agents and models moving data at rates humans never demanded, are pulling the project forward rather than past it. Infrastructure this successful stops being news. It becomes assumption, and assumptions are the most durable things in computing.

If you want to build the kind of understanding that lets you see through the stack this way, from memory formats through table formats through the catalogs and engines above them, that is exactly what I write books for. I co-authored Apache Iceberg: The Definitive Guide and Apache Polaris: The Definitive Guide for O'Reilly, and my other titles cover lakehouse architecture, data engineering, and the agentic analytics wave now reshaping all of it.

Browse the full collection of my books on data and AI at [books.alexmerced.com](https://books.alexmerced.com).
