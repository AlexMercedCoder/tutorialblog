---
title: "A Deep Dive Into File Compression: How Data Gets Smaller, Why Codecs Differ, and What to Actually Use in the Lakehouse"
date: "2026-07-06"
description: "*By Alex Merced, Head of Developer Relations at Dremio* Somewhere in your data platform right now, a single configuration property is quietly deciding a."
author: "Alex Merced"
category: "Data Engineering"
tags:
  - compression
  - Zstandard
  - Parquet
  - data engineering
canonical: https://iceberglakehouse.com/posts/file-compression-deep-dive/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/file-compression-deep-dive/).

*By Alex Merced, Head of Developer Relations at Dremio*

Somewhere in your data platform right now, a single configuration property is quietly deciding a meaningful percentage of your storage bill, your query latency, and your compute spend. It is probably set to whatever the defaults were in 2019, nobody has looked at it since, and it is the compression codec.

Compression is the most consequential invisible decision in data infrastructure. Every Parquet file in your lakehouse, every message crossing your network, every backup in your archive passed through a compressor, and the choice of which one, at which setting, ripples through everything downstream: bytes stored, bytes transferred, requests billed, CPU burned on every read for the life of the data. Yet most engineers' working knowledge of the topic amounts to a vague ranking, gzip is old, Snappy is fast, Zstandard is good, without the mechanics that would let them reason about a new situation.

This article fixes that. We will build the theory from the ground up, in plain language: why data compresses at all, why nothing compresses everything, and the two great families of technique that every modern codec combines. Then the codec lineup itself, gzip, bzip2, LZMA, Snappy, LZ4, Zstandard, Brotli, each with its design center and honest trade-offs, and why one of them effectively won the decade. Then the layer my readers live in: how compression actually works inside the lakehouse stack, Parquet pages, columnar encodings versus codecs, splittability history, hardware acceleration, and the economics on object storage. And finally the practical playbook: what to set, when to deviate, and how to measure. As always in this series, the goal is that the logic clicks, so the next codec announcement or benchmark chart explains itself.

## Why Data Compresses at All: Redundancy and the Pigeonhole

Start with the foundation, because two ideas from information theory explain every codec ever written.

The first idea: compression is the removal of redundancy, and redundancy is predictability. A string of a thousand zeros is extremely predictable, so it can be described in a few bytes: "a thousand zeros." A file of truly random bytes is perfectly unpredictable, so no description of it can be shorter than itself. Real data lives between these poles, and almost all of it lives far toward the predictable end: text repeats words, logs repeat templates, sensor readings drift in small steps, columns of a table repeat values and patterns endlessly. Claude Shannon formalized this as entropy, the true information content of data measured in bits, and entropy is the hard floor: no lossless compressor can beat it on average. Everything a codec does is an attempt to find the predictability in your bytes and stop paying to store what could be predicted.

The second idea keeps everyone honest: the pigeonhole principle guarantees there is no universal compressor. Any algorithm that shrinks some inputs must expand others, because there are simply fewer short descriptions than long inputs. This is why compressing an already-compressed file, or an encrypted one, which is deliberately indistinguishable from random, gains nothing and often loses a little. It is also why codecs are portfolios of assumptions about what real data looks like, and why matching the assumption to your data is the whole game. Every technique below is a bet on a specific kind of predictability.

One boundary before we proceed: this article is about lossless compression, where decompression reproduces the original exactly, because analytics demands it. The lossy world of JPEG and video, which discards information human senses will not miss, is a different discipline, and the closest analytics comes to it is deliberate, schema-level choices like reduced-precision floats, decisions made by engineers, never by codecs.

## The Two Great Families: Finding Repeats and Pricing Symbols

Nearly every general-purpose codec in existence is a combination of two techniques, invented decades ago and refined ever since. Understand both and you can read any codec's documentation fluently.

**Family one: match-based compression, the LZ family.** The insight, from Lempel and Ziv in 1977, is beautifully simple: data repeats itself, so instead of storing a repeat, store a pointer to the previous occurrence. The compressor slides through the input keeping a window of recent history, and whenever the next bytes match something already seen, it emits a reference, "go back 3,041 bytes and copy 27," instead of the bytes themselves. A log file where every line shares a timestamp prefix and a template becomes mostly pointers. The knobs of the LZ family follow from the mechanics: a bigger window finds more distant repeats at more memory cost, more effort searching for the longest match buys ratio at compression-time CPU, and decompression is gloriously cheap regardless, just copying bytes the pointers indicate, which is why LZ decompression speed is measured in gigabytes per second and why the family dominates read-heavy workloads.

**Family two: entropy coding, pricing symbols by frequency.** After matching, what remains is a stream of symbols, literal bytes and match instructions, and they are not equally common. Entropy coding assigns short codes to frequent symbols and long codes to rare ones, squeezing the stream toward its Shannon floor. Huffman coding, from 1952, does this with whole-bit codes, elegant and fast and slightly wasteful because real frequencies want fractional bits. Arithmetic coding achieves those fractional bits and was long too slow for mainstream use. The modern breakthrough is ANS, asymmetric numeral systems, a 2010s invention that delivers arithmetic-coding compression at Huffman-like speeds, and its arrival is the single biggest reason the current codec generation beats the previous one. When you hear that Zstandard uses finite state entropy, that is ANS at work.

Almost everything you will ever use is these two stacked: LZ matching to remove repeats, entropy coding to price what remains. DEFLATE, the algorithm inside gzip and ZIP, is LZ77 plus Huffman, vintage 1993. Zstandard is a modern LZ plus ANS. The exceptions prove the rule: bzip2 built on a different transform entirely, and the columnar encodings we will meet later skip the general machinery for something more surgical. But as a mental model, "find the repeats, then price the symbols" is ninety percent of the field.

## Watch a Codec Work: One Log Line, Step by Step

Theory lands best with bytes on the table, so let me run a concrete miniature: compressing three lines of a web server log, the kind of data every reader owns.

```
2026-07-13 10:41:07 GET /api/orders 200 8ms
2026-07-13 10:41:07 GET /api/orders 200 11ms
2026-07-13 10:41:09 GET /api/users 200 6ms
```

The matcher goes first, sliding through the bytes. Line one is virgin territory, nothing to point at, so it passes through as literals, and the window begins filling. Line two is where the design earns its keep: the matcher finds that the next forty-odd characters, the timestamp, the method, the path, the status, are an exact repeat of bytes it just saw, and emits a single instruction, go back 44 bytes, copy 41, followed by the few literal characters that differ, the "11ms." One pointer replaced most of a line. Line three matches in fragments: the date and hour match at distance 88, "GET /api/" matches, "200" matches, and the novel pieces, the "09" seconds, "users," "6ms," ride as literals between pointers. Already the intuition generalizes: templated data, which is most machine-generated data, is a thin stream of genuinely new bytes threaded through a lattice of repeats, and the matcher converts the lattice into cheap references.

The entropy coder goes second, over the stream the matcher produced: literals, match lengths, match distances. It counts frequencies and prices accordingly. The digit characters, spaces, and slashes that dominate the literals get short codes, rare bytes get long ones, and the match instructions themselves get frequency-priced, since real data repeats at characteristic distances, the width of a log line, the size of a record, and the coder learns those habits. In a DEFLATE-era codec this pricing is Huffman, whole bits per symbol. In a modern codec it is ANS, fractional bits, the same idea priced more precisely. On real log files this two-stage stack routinely lands ten-to-one or better, and now you know exactly where the ratio comes from: the matcher removed the template, the coder discounted the residue.

Two footnotes make the miniature honest. First, the columnar counterpoint: if these logs were parsed into a table, timestamp column, path column, status column, the encodings would beat the general codec at its own game, the status column becoming a run-length whisper, the timestamps delta-encoding to near nothing, which is the structural-knowledge advantage in action and the reason parsed beats raw in every lakehouse. Second, the failure mode: run the same machinery over an encrypted or already-compressed payload and the matcher finds no repeats, the coder finds flat frequencies, and the output grows slightly, the pigeonhole principle collecting its due. Codecs are redundancy hunters, and they can only catch what the data actually contains.

## The Lineup: Seven Codecs and What Each Is For

Now the codecs themselves, presented as design centers rather than a leaderboard, because each one is the right answer to a question.

**gzip, DEFLATE.** The 1993 workhorse and still the lingua franca of the web and of interchange. Moderate ratio, moderate speed, universally implemented, and thoroughly outclassed on every axis by modern codecs except ubiquity. Its design center today is compatibility: when the other side might be anything, gzip works. In analytics it survives mostly as legacy Parquet settings and CSV archives, and both deserve migration.

**bzip2.** The 1990s ratio champion, built on the Burrows-Wheeler transform, a clever reordering that groups similar contexts together before entropy coding. Better ratios than gzip, painfully slow both directions by modern standards, and historically notable in big data for being splittable, a property whose significance we will unpack shortly. Its design center is now history.

**LZMA, xz, 7-Zip.** The maximalist: enormous windows, exhaustive matching, range coding, delivering the best ratios of the pre-modern era at brutal compression cost and slow decompression. Design center: cold archives where bytes matter and access is rare, and even there, modern Zstandard at high levels has eaten most of its lunch.

**Snappy.** Google's 2011 speed play and the codec of the Hadoop generation: LZ matching with no entropy coding at all, sacrificing ratio for blistering speed and, decisively for its era, low CPU on clusters where compute was the bottleneck. It became Parquet's long-time default, which is why so many lakehouses still run it. Design center: real-time paths where CPU is scarcer than storage, a trade whose terms have shifted dramatically since.

**LZ4.** Snappy's philosophy perfected: the fastest mainstream LZ, with decompression at multiple gigabytes per second per core, plus a high-compression mode that spends write-time effort for the same instant reads. Design center: anywhere latency dominates, in-memory compression, RPC payloads, caches, write-ahead logs, and streaming buffers, including Arrow IPC compression, where it shines.

**Zstandard, zstd.** The one that won, and worth its own section below.

**Brotli.** Google's web specialist: DEFLATE-family matching plus a modern entropy coder plus a built-in dictionary of web-common strings, tuned for compressing text assets once and serving them millions of times. Design center: the browser path. In analytics it appears occasionally and rarely beats Zstandard where both are available.

Honorable mentions complete the map: zlib-ng and igzip as accelerated DEFLATE for the compatibility-bound, and the domain specialists, from log-structured compressors to genomics codecs, that reinforce the pigeonhole lesson: knowing your data beats general cleverness.

## Zstandard: Why the Decade Has a Default

Zstandard, released by Yann Collet at Facebook in 2016, from the same author as LZ4, deserves the deep look because it is the correct default answer to most compression questions in 2026, and knowing why makes you better at spotting the exceptions.

The technical core is the modern stack executed superbly: a strong LZ engine with large-window support, and finite state entropy, the ANS realization that closed the gap between Huffman speed and arithmetic ratios. The result redrew the trade-off curve rather than picking a point on it: at low levels, Zstandard approaches LZ4 speeds while compressing better than gzip ever did, and at high levels it approaches LZMA ratios at a fraction of the cost, with decompression staying fast, several hundred megabytes to gigabytes per second per core, across the entire range. One codec now spans what previously required three.

Three features turn the codec into a toolkit. The level dial, one through twenty-two, is a genuine single-knob policy instrument: hot data at level three, warm data at level six, archives at level nineteen, same format, same decompressor, no re-tooling. Long-distance matching extends the window to hundreds of megabytes, letting it exploit repeats across huge files, a gift for logs and backups. And trained dictionaries solve the small-payload problem: compress a thousand tiny JSON messages independently and each is too short to self-describe its own redundancy, but train a dictionary on a sample of them once, and every message compresses against that shared context, routinely tripling effectiveness on small records, the trick behind efficient message queues and key-value stores everywhere.

The ecosystem verdict followed the engineering: Zstandard is now a first-class or default codec in Parquet and ORC settings, in Kafka, in Arrow IPC, in package managers, filesystems, and browsers. When this article says "the modern default," it means zstd, and the burden of proof now rests on deviating from it.

## Sixty Years in Five Moments

A compressed history of compression, because the lineage explains the present's shape.

Moment one, 1948 to 1952: Shannon defines entropy and Huffman delivers the first optimal prefix codes, establishing both the floor and the first practical tool for approaching it. Everything since is footnotes to these two, elaborate and valuable footnotes.

Moment two, 1977 to 1978: Lempel and Ziv publish the match-based algorithms that bear their initials, and compression gains its second engine. The LZ-plus-entropy-coding stack assembles over the following decade, culminating in DEFLATE and gzip, whose 1990s vintage still moves a startling fraction of the internet.

Moment three, the 1990s ratio wars: Burrows-Wheeler's transform powers bzip2, LZMA pushes windows and search effort to their limits, and the field's frontier becomes squeezing the last percentage points at any CPU cost, a sensibility suited to dial-up networks and expensive disks.

Moment four, the 2000s speed inversion: Google-scale clusters flip the constraint, CPU becomes the scarce resource, and Snappy and LZ4 answer by abandoning ratio for throughput. The big data generation builds on their trade, and its defaults fossilize into the configs this article keeps asking you to revisit.

Moment five, the 2010s synthesis: Jarek Duda's asymmetric numeral systems dissolve the old speed-versus-precision trade in entropy coding, Zstandard productizes the breakthrough, and one codec spans the whole curve the previous generations divided among themselves. Meanwhile the structure-aware current, columnar encodings, BtrBlocks-style cascades, ALP and FSST, rises alongside, and the 2020s inherit both: a settled general-purpose default and a renaissance in what to do before the general codec ever runs.

The pattern across all five moments is the one this series finds at every layer: constraints flip, defaults fossilize, and the practitioners who understand the mechanics rather than the folklore are the ones who notice when their era's answer has quietly become the last era's.

## Encodings Versus Codecs: The Distinction the Lakehouse Runs On

Here the article joins hands with my file-format renaissance piece, because the columnar world adds a second compression vocabulary that must not be confused with the first.

The general-purpose codecs above treat data as anonymous bytes and hunt statistical redundancy. Columnar encodings exploit something stronger: knowledge of structure. A column of a table is not anonymous bytes, it is a sequence of values of one type, and that knowledge enables surgical techniques: dictionary encoding replacing repeated values with small codes, run-length encoding collapsing consecutive repeats, delta and frame-of-reference storing numbers as small differences from a base, bit-packing trimming integers to their true width, FSST compressing strings while keeping each independently readable, and ALP compressing floats through adaptive decimal scaling. My file formats article walks each with examples, and its central lesson bears repeating here: cascades of these lightweight, structure-aware encodings, chosen adaptively per chunk of data, can match heavyweight codec ratios while decoding at memory speed, and sometimes while never decoding at all, since engines can filter dictionary codes and range-check frame-of-reference integers directly.

The two vocabularies compose rather than compete, and the composition order matters. Parquet's classic stack applies encodings first, dictionary, RLE, bit-packing shrink the column using structure, and then runs a general codec, historically Snappy, increasingly Zstandard, over the encoded pages, catching whatever statistical redundancy the encodings left behind. The general codec's contribution shrinks as encodings improve, which is exactly the trend line of the renaissance: the newest formats lean ever harder on encoding cascades and ever lighter on the heavyweight pass, because on modern storage the heavyweight decode cost increasingly exceeds its transfer savings. When you tune a lakehouse, you are really tuning this two-layer stack, and the biggest wins often come from the encoding layer, sorted data run-length encodes spectacularly, low-cardinality columns dictionary-encode to almost nothing, rather than from swapping codecs.

## Where Compression Lives in the Stack, and the Splittability Story

Compression is not one decision but several, made at different layers, and mapping them clarifies a decade of folklore.

At the file format layer, Parquet compresses per page within column chunks, with the codec settable per column, a granularity with two enormous consequences. First, selective reading survives: a query touching three columns decompresses three columns' pages, never the file. Second, the old Hadoop splittability problem dissolved. In the era of raw compressed text files, gzip's whole-file streams could not be split across workers, one giant gzip meant one reader, and formats like bzip2 earned their keep by being splittable. Parquet made the question moot by compressing inside an independently addressable structure: row groups and pages are the parallelism units, and the codec inside them is anyone's choice. The lesson survives wherever raw compressed files still roam, CSV and JSON landing zones and log archives, where a single mega-gzip remains a parallelism killer and the fix is either splittable framing or, better, conversion into the columnar world.

At the memory and network layer, Arrow IPC buffers compress with LZ4 or Zstandard for transport, chosen for decompression speed since these bytes are about to be computed on, and RPC and streaming systems make the same latency-first choice. At the storage service layer, some filesystems and services compress transparently underneath everything, a layer best left alone for already-compressed Parquet, since the pigeonhole principle collects its tax on double compression. And at the archive layer, lifecycle policies can recompress cold data at aggressive levels, the same bytes at level nineteen instead of level three, purchasing storage savings with write-once CPU on data whose reads have dwindled.

The map yields a principle worth keeping: compress closest to where structure is known, and choose each layer's codec by what happens to the bytes next, computation wants speed, archival wants ratio, interchange wants compatibility.

## The Trade-Off Physics and the Economics

All codec choices reduce to a three-axis trade, ratio, compression speed, decompression speed, and the lakehouse tilts the axes in specific, calculable ways.

The first tilt is asymmetry: analytical data is written once and read many times, often thousands of times, so decompression speed and ratio matter with the full weight of every future read, while compression speed matters once, and mostly to pipeline latency budgets. This is why the LZ family's cheap decompression rules the space, why archives can afford expensive levels, and why "how fast does it compress" is usually the least important number on the benchmark chart, streaming ingestion's tight cycles being the honorable exception.

The second tilt is the object storage economy from my storage deep dive: bytes stored bill monthly, bytes transferred bill per crossing, and requests bill per call. Better ratios shrink all three, which makes compression one of the rare optimizations that cuts storage, network, and request lines simultaneously, and it compounds with everything else: smaller pages mean more data per ranged read, better cache hit rates per gigabyte of NVMe, more of the working set resident everywhere. Against these gains stands decode CPU, and here modern hardware has been generous: current codecs decode so fast, and engines vectorize so well, that on most scan workloads the I/O saved exceeds the CPU spent by a comfortable margin, with the crossover arriving only on the very fastest local storage, which is precisely the frontier where the encoding cascades take over from heavyweight codecs, the renaissance thesis once more.

The third tilt is hardware's ongoing arrival: AES-style dedicated instructions never came for compression, but SIMD did, and the modern codecs exploit it thoroughly, while accelerators go further, Intel's QAT offloading compression entirely on supported platforms, and GPU decompression libraries bringing formats' data directly onto accelerators, a co-design conversation the new file formats are having explicitly. The practical takeaway is humility in benchmarking: codec performance is now a property of the codec, the data, and the silicon together, which is one more reason the only benchmark that matters is yours.

## The Practical Playbook

Everything above, compressed into the guidance I actually give.

For lakehouse tables, make Zstandard the default and pick levels by temperature: roughly level three for hot, frequently written data, five or six for the general estate, and if your platform supports recompression during maintenance, let compaction jobs rewrite cooling data at higher levels, the same lever my maintenance sections keep recommending, now applied to bytes. Retire Snappy deliberately rather than reflexively: it still defends real estate on CPU-constrained, latency-critical write paths, but on typical scan-heavy estates, migrating from Snappy to zstd routinely recovers double-digit storage percentages at negligible read cost, and the migration is a compaction pass, not a project.

Exploit the encoding layer before the codec layer. Sort or cluster tables on the columns that matter, low-cardinality and time-adjacent data will collapse under dictionary and run-length encoding, and verify with file inspection tools that your important columns are getting the encodings you expect, the same audit habit my Parquet articles preach for shredding and statistics. The single cheapest ratio improvement in most estates is better data layout, not a better codec.

Respect the special cases. Small independent payloads want trained dictionaries. Already-compressed and encrypted content wants no second pass, store media and archives uncompressed at the Parquet level. Raw text landing zones want splittable handling or fast conversion. Float-heavy and embedding-heavy columns are the current frontier, watch ALP's arrival in your engines, and until then accept that these columns compress modestly.

And measure, on your data, at your access patterns, because everything in this article is a prior, not a verdict. The experiment is cheap: rewrite a representative table under two or three candidate settings, record size, scan latency, and CPU, and let the numbers choose. Data that defies your expectations is the pigeonhole principle sending you a message about structure you have not exploited yet.

## The Special Domains: Streams, JSON, Logs, and Vectors

Four data domains come up constantly in questions, and each rewards specific treatment beyond the general playbook.

**Streaming messages.** Kafka and its kin compress per batch, with the producer choosing the codec, and the modern answer mirrors the lakehouse: Zstandard for the ratio-per-CPU sweet spot, LZ4 where producer latency budgets are brutal. The deeper win is the dictionary trick from the Zstandard section: individual messages are too small to compress well alone, batching solves most of it, and for genuinely small-record paths, key-value stores, per-message encryption contexts, a trained dictionary shared between producer and consumer routinely multiplies effectiveness. And remember the stack view: messages compressed in flight land in the lakehouse, decompress once, and get re-compressed into Parquet's page structure, each layer choosing by what happens to the bytes next.

**JSON and semi-structured payloads.** Raw JSON compresses deceptively well, the keys repeat endlessly and the matcher feasts, which tempts teams into the string-column pattern my variant article buried. Resist the temptation with the full argument: a general codec shrinks JSON's bytes and preserves its parse cost, every query still decompresses and parses everything, while the variant encoding with shredding restructures the data so queries skip both. Compression is not a substitute for structure. It is what you do after structure.

**Logs and text.** The domain where long-range matching shines, since log files repeat across megabytes, and where the splittability ghost still haunts: the multi-gigabyte gzip in the landing bucket remains 2026's most common self-inflicted parallelism wound. The pattern that works: land raw text with splittable framing or modest file sizes, convert promptly to tables, and let the archive tier recompress the raw originals at aggressive levels for compliance retention.

**Embeddings and floats.** The honest frontier. High-entropy by nature, float vectors resist general codecs almost entirely, single-digit percentage gains are typical, and the real progress is structural: ALP-style encodings for the float columns that hide decimals, fixed-size layouts that at least make vectors cheap to read and GPU-friendly, and, where the application tolerates it, deliberate precision reduction chosen by engineers, float32 to float16 or quantized forms, which is the one place a lossy-flavored decision legitimately enters the analytics stack, made at the schema, never in the codec.

## Benchmark Like You Mean It

Since the whole article keeps ending at "measure on your data," here is how to make that measurement worth trusting, because bad compression benchmarks are an industry pastime.

Test on real data, never on synthetic. Generated data has artificial redundancy, uniformly random data has none, and both lie in different directions. Sample actual production files, whole row groups, not handcrafted snippets, and include your ugliest tables, the wide one, the JSON-heavy one, the float-heavy one, because the average hides exactly the columns that dominate cost.

Measure all three axes plus the one everyone forgets. Ratio, compression speed, and decompression speed are the standard trio, and the fourth is end-to-end query latency on representative queries, because page sizes, cache behavior, and I/O patterns interact with codecs in ways microbenchmarks miss. Run decompression measurements at realistic parallelism, single-threaded decode numbers flatter nobody's production reality, and on the hardware class you actually deploy, since SIMD generations move these numbers materially.

Control the layout variable. A codec comparison across differently sorted or differently encoded files measures layout, not codecs, so hold encodings and sorting constant when comparing codecs, then run the layout experiment separately, and expect, per the worked example below, that the layout experiment wins. Finally, report costs in money where you can: bytes stored per month, requests per scan, CPU-seconds per query, converted at your actual prices, because "eight percent better ratio" and "four thousand dollars a month" are the same fact in different languages, and only one of them survives the budget meeting.

An afternoon of this discipline, once a year or whenever a new codec generation lands, is among the highest-return maintenance rituals a platform team owns.

## A Worked Example: One Table, Three Regimes

Make it concrete with a composite from the field: a two-terabyte events table, currently Parquet with Snappy defaults from its 2020 birth, scanned heavily by BI and fed daily by batch.

Regime one, the inherited default, baselines at two terabytes stored and a known scan profile. Regime two, the modern default: a compaction pass rewrites to Zstandard level five with the same layout. The table lands around thirty percent smaller, in line with typical Snappy-to-zstd migrations, storage and egress lines drop proportionally, ranged reads carry more data per request, and scan latency improves slightly, the extra decode CPU more than repaid by the I/O saved. Total effort: one maintenance job and a config change. Regime three, the layout-aware rewrite: the same pass adds sorting on the two columns every dashboard filters by. Now the encoding layer wakes up, run-length and dictionary encodings collapse the sorted columns, statistics tighten so pruning skips more row groups, and the combined effect lands the table at roughly half its original size with materially faster filtered scans. The codec change was worth real money. The structure change was worth more, and the two together, chosen in an afternoon, will pay every single day the table lives.

That is compression in the lakehouse in one story: a default worth updating, a layout worth more than a codec, and a payoff that compounds across storage, network, requests, and every future read.

## Questions I Hear Most Often

**Is there ever a reason to store lakehouse data uncompressed?** Almost never for tabular data, the read-side economics are too lopsided, with two exceptions: content that is already compressed, media, archives, encrypted payloads, where a second pass wastes CPU to gain nothing, and extreme-latency serving tiers on local NVMe where decode time is genuinely visible, which is exactly the niche the compute-on-encoded formats are built to close without surrendering the bytes.

**Why did Snappy dominate for so long if Zstandard is better?** Because Snappy was the right answer to its era's constraint: Hadoop-generation clusters where CPU was the bottleneck and storage was locally attached and comparatively cheap. Zstandard arrived after the constraint inverted, cloud object storage made bytes and requests the cost and CPU abundant, and defaults simply outlive their eras. Your 2019 configs are not wrong, they are fossils, and fossils are honorable things to replace.

**Do higher Zstandard levels slow down my queries?** Barely, and that is the design's quiet triumph: decompression speed stays roughly flat across the level dial, the levels buy ratio with compression-time effort, not read-time effort. The practical ceiling on levels is write and compaction budget, not query latency, which is what makes recompress-when-cold such a clean policy.

**Should different columns get different codecs?** The capability exists and the better version of the idea usually lives one layer down: different columns want different encodings, which good writers choose automatically, while a single sensible codec over the top keeps operations simple. The exception worth taking: columns of pre-compressed or high-entropy content, where disabling the codec avoids paying for nothing.

**How does compression interact with encryption?** Order is everything: compress first, then encrypt, because encrypted bytes are designed to look random and random bytes do not compress. The lakehouse formats get this right internally, Parquet encrypts pages after encoding and compression, and the full story, including what encryption does to statistics and interoperability, is exactly the subject of this article's companion piece on lakehouse encryption.

**Will AI workloads change compression?** They already are, in two directions. Their data, floats, embeddings, tensors, drove the new encodings like ALP and the fixed-size layouts, and their hardware, GPUs consuming data directly, is driving decompression onto accelerators and formats toward GPU-decodable designs. Compression research, dormant-seeming for years, is a live frontier again precisely because the workloads changed, which is the file format renaissance told from the bytes up.

## Closing Thoughts

Compression is where information theory pays the cloud bill: a sixty-year lineage from Shannon's entropy through Lempel-Ziv's pointers and Huffman's codes to ANS and adaptive encoding cascades, all of it operating silently every time your lakehouse reads a page. The field looks settled from a distance and is anything but: the codecs consolidated onto a brilliant modern default, the structure-aware encoding layer is where innovation moved, and the hardware underneath is redrawing the trade-offs one more time. The practitioner's summary is almost embarrassingly simple, zstd by default, layout before codec, measure on your data, and the understanding behind it is what lets you know when your case is the exception.

If this way of building understanding works for you, it is what my books do at full depth. I co-authored Apache Iceberg: The Definitive Guide and Apache Polaris: The Definitive Guide for O'Reilly, with further titles on lakehouse architecture, data engineering, and agentic analytics.

Browse the full collection of my books on data and AI at [books.alexmerced.com](https://books.alexmerced.com).
To try a modern Agentic Lakehouse experience, visit [dremio.com/get-started](https://www.dremio.com/get-started).
