---
title: "Rust vs C++ in Native Iceberg Scan Operators"
date: "2026-06-22"
description: "The Rust versus C++ discussion is really about table-layer execution safety, interoperability, and performance envelopes."
author: "Alex Merced"
category: "Lakehouse"
tags:
  - Rust data systems
  - C++ query engines
  - vectorized scans
---


The Rust versus C++ discussion is really about table-layer execution safety, interoperability, and performance envelopes. For engineers building native table and query execution layers, the useful question is what changes in production and what simply sounds current.

![native scan execution architecture map](/images/2026/week22-june-2026/rust-vs-cpp-table-layer-native-scan-operators-diagram-1.png)

## The Language Choice Matters Less Than the Boundary Where Metadata Planning Becomes Vectorized File Scanning

The language choice matters less than the boundary where metadata planning becomes vectorized file scanning.

I look at this through a simple production lens: what becomes clearer, safer, faster, or easier to operate once the pattern is real? Rust is attractive for memory safety and modern library ergonomics. C++ is attractive because many engines and columnar libraries already depend on it. Neither language solves the hard problem on its own. The hard problem is correctly handling Iceberg delete semantics, schema evolution, projection, and memory ownership under concurrent workload pressure.

The contracts that already mattered now matter more. Correctness under deletes, memory safety under concurrency, and interoperability with existing engine code are the dimensions that actually determine whether a native scan operator is production-ready.

## What the Specs Support

The strongest public sources for this topic are the [Apache Iceberg specification](https://iceberg.apache.org/spec/), [Apache Arrow documentation](https://arrow.apache.org/docs/), and [Apache Parquet documentation](https://parquet.apache.org/docs/). I use those to ground the architecture and avoid treating every June 2026 announcement as a shipped production capability.

The evidence supports a few grounded points:

- Native scan operators need to preserve table semantics while moving quickly through files and columns.
- Rust and C++ both have credible roles in high-performance data systems.
- The hard boundary is between metadata correctness, memory safety, vectorized execution, and engine integration.

That is enough to write a useful technical article. It is not enough to make sweeping claims. I separate released behavior, design direction, and market language because readers can work with careful distinctions. They cannot operate slogans.

## The Architecture Pattern

A native scan path starts with table metadata and ends with batches the engine can process. Between those points, the operator has to respect deletes, projection, partition pruning, file statistics, schema evolution, and memory ownership. Rust is attractive for safety and modern library ergonomics. C++ is attractive because many engines and columnar libraries already depend on it. The useful discussion is not language fandom. It is how the boundary behaves under real workload pressure.

For this architecture, the five layers worth keeping distinct are storage, catalog, execution, semantics, and agent interface. Storage holds durable files and snapshots. The catalog resolves identity and access. The execution layer plans and runs work. The semantic layer gives business meaning. The agent interface controls which questions and actions are allowed.

The point is not to collapse those layers into one box. The point is to make the handoffs clear. If a user or agent asks for an answer, the platform should be able to explain which table, which snapshot, which definition, which identity, and which policy shaped the result.

![Operating workflow for native scan execution](/images/2026/week22-june-2026/rust-vs-cpp-table-layer-native-scan-operators-diagram-2.png)

## A Production-Shaped Example

A fair benchmark should include a simple projection, a selective predicate, a table with delete files, a schema evolution case, and a high-concurrency scan. Measure planning correctness, memory growth, CPU time, and integration cost. A fast path that silently drops delete semantics is not fast. It is wrong.

The test should include a happy path and at least three failure paths. One failure should involve delete semantics: a scan that misses delete file application and returns rows that should have been removed. One should involve memory behavior under concurrency: multiple concurrent scans that cause allocator contention or unsafe memory sharing. One should involve engine integration cost: the overhead required to bridge between the native scan output format and the engine's internal representation. Those failures are where the implementation either earns production trust or reveals hidden costs.

The test should also produce evidence. Save scan correctness results, memory growth profiles, CPU time breakdowns, and integration layer benchmarks. If the team cannot compare two implementations on these specific dimensions, the benchmark is not useful.

## What To Measure

Start with four specific measurements:

- **Delete semantics verified on equality and position deletes:** Confirm that equality deletes and position deletes are both applied correctly at every file boundary. A native scan operator that handles position deletes correctly but misses equality deletes on a merged file is producing incorrect results that will not be obvious without explicit correctness testing.
- **Memory growth under concurrent scan workloads:** Profile memory allocator behavior when multiple scans run concurrently against the same set of data files. Rust's ownership model should prevent data races in memory, but concurrent allocation patterns can still produce fragmentation or growth that is not visible in single-scan benchmarks.
- **Schema evolution handled without fallback to slow path:** Confirm that schema evolution cases (added columns, dropped columns, renamed columns) are handled in the native scan path without falling back to a slower JVM or interpreted path. Track the percentage of schema evolution scenarios that stay in the native path.
- **Integration cost measured in lines of glue code and latency overhead:** Measure the actual cost of bridging the native scan output to the engine's internal batch format. A native scan that produces Arrow batches natively has lower integration cost than one that requires format conversion. Track both the engineering cost (code complexity) and the runtime cost (latency per batch handoff).

Measurements should connect to decisions. A metric that nobody uses is telemetry decoration.

## Common Failure Modes

The first mistake is treating native scan operators as a performance optimization without verifying correctness first. A native scan that is faster than the JVM path but misses delete semantics is not an optimization. It is a correctness regression. Correctness verification (including delete application) must precede performance measurement.

The second mistake is ignoring boundaries. Most native scan incidents appear at the boundary between the scan output and the engine integration layer: the memory ownership contract between the native allocator and the engine's memory manager, the format conversion between the native batch type and the engine's internal representation, or the threading model between the native concurrency and the engine's scheduler. Those boundaries need explicit testing, not optimistic assumptions.

The third mistake is choosing a language based on benchmarks that do not include real Iceberg table complexity. A benchmark that only tests simple projections over clean files is not representative of production Iceberg tables with delete files, schema evolution, and partition pruning at scale.

The most expensive failures are usually quiet. The native scan drops some equality deletes because the delete application logic has a subtle bug at a file boundary. Queries return results that include rows that should have been removed. The correctness problem is not obvious in aggregate metrics. It only appears in record-level validation tests.

## Guardrails for Agentic Use

Agents that query data through native scan operators should not need to know which scan implementation is in use. The contract is at the table and SQL level. The native scan layer should be transparent to the agent tool.

The engineering guardrail is correctness testing before production deployment. A native scan operator that has not been tested for delete semantics, schema evolution, and concurrent access should not be in the path of production analytical queries or agent tools.

## Operational Checklist

| Area | Question to answer | Why it matters |
|---|---|---|
| Correctness | Have delete semantics (equality and position) been verified explicitly? | A fast but incorrect scan is worse than a slow correct one. |
| Memory | Has memory behavior under concurrent scans been profiled? | Memory fragmentation under concurrency is often invisible in single-scan tests. |
| Evolution | Have schema evolution cases been tested in the native path? | Fallbacks to slow paths can eliminate the performance benefit. |
| Integration | What is the glue code cost and batch handoff latency? | Integration cost is part of the total performance picture. |
| Rollback | What is the fallback path when the native scan produces incorrect results? | Production deployments need a disable switch. |

This checklist is intentionally plain. The hard part is not choosing Rust over C++. The hard part is verifying correctness under the full complexity of production Iceberg tables before the native scan path is used for analytical queries.

![Open lakehouse operating model for native scan execution](/images/2026/week22-june-2026/rust-vs-cpp-table-layer-native-scan-operators-diagram-3.png)

## What Engineers Should Verify

Engineers should verify correct delete application on equality deletes, position deletes, and merged files. They should verify memory behavior under concurrent scans. They should verify schema evolution handling in the native path. They should measure integration cost with the existing engine code. Claiming "native Iceberg scan support" is not enough. The team needs to know which table features were tested and which are explicitly out of scope.

The practical test is simple: can another engineer generate a table with equality deletes, position deletes, and a schema evolution, run the native scan path, and verify the result matches the reference implementation? If not, the native scan is not production-verified.

The setup should also be tested under realistic concurrency. Native scan operators that behave correctly under a single scan often reveal memory or threading problems under concurrent analytical workloads.

## What Data Owners Should Verify

Data owners should verify that tables with delete files and schema evolution are included in the native scan correctness test suite. A table that only has append-only write patterns may appear correct in a native scan, but the same implementation may miss deletes on tables that use update semantics. Data owners who know which tables use merges and updates should flag those tables as required for correctness testing.

## What Executives Should Hear

The summary should be plain: native Iceberg scan operators in Rust or C++ are valuable when they reduce query latency for interactive analytical workloads without introducing correctness regressions. They are risky when the performance comparison does not include real Iceberg table complexity (delete files, schema evolution, concurrency).

The value is faster interactive queries over open Iceberg tables. The limit is that native scan development has a correctness burden that is often understated in initial benchmarks. Executives should expect a correctness testing phase before a performance benefit phase.

## A Good First Rollout

Start with one table that is representative of production complexity: it should have delete files, at least one schema evolution, and multiple partition levels. Verify correctness against the reference path. Then measure performance. Then test under concurrent scans.

Define success with three outcomes. The first is correctness: results match the reference implementation on all tested table features. The second is performance: planning and scan latency are measurably better under the native path on the tested workload. The third is safety: the native path has a disable switch that falls back to the reference implementation when correctness questions arise.

After that, expand to more tables and more workload patterns. Expanding one table category at a time is slower than a sweeping deployment, but it creates a clear correctness coverage map.

## Deeper Design Notes

The design work should begin with the table features that the native scan must handle correctly. Name the delete file types, the schema evolution patterns, the partition strategies, and the concurrency model. When those are vague, the native scan is designed for a benchmark, not for production Iceberg tables. Start with the concrete table features and build the correctness test suite around them.

The next step is to define the dimensions that actually change behavior: delete handling, projection, vector batches, memory ownership, and engine integration format. These are not decorative details. They determine whether the native scan is correct and fast under real workload conditions.

## Review Questions Worth Asking

The first question is simple: what table features are included in the native scan correctness test suite? If equality deletes are not in the test suite, the scan has not been verified on the most common Iceberg update pattern.

The second question: what is the memory growth profile of the native scan operator under ten concurrent scans against a 100-partition table? If nobody has measured it, the concurrent behavior is unknown.

The third question: what is the fallback path when the native scan produces incorrect results in production? If the answer is "file a bug and wait," the deployment is not production-safe.

## A Realistic Pilot Shape

A realistic pilot should look like a scan operator reading evolved Iceberg tables with equality deletes and projected columns under a concurrent analytical workload. That scenario is narrow enough to test and broad enough to reveal delete application bugs, memory problems, and integration latency. It should include one clean scan, one scan on a table with equality deletes, one concurrent scan scenario, and one schema evolution case. The point is not to make the pilot impressive. The point is to make it diagnostic.

Include a repetition test. Run the same scan patterns across several table versions as the delete file count and schema evolution depth increase. Native scan correctness problems often appear only when delete file counts or schema evolution depth exceeds a threshold that was not included in initial testing.

## Metrics That Should Drive the Next Decision

The first metrics to watch are correctness verification coverage (table features tested), memory growth rate under concurrent scans, CPU time improvement versus the reference path, and batch handoff latency. Those measurements should lead to a decision about whether to expand the native scan coverage, fix a correctness bug, tune the memory model, or improve the engine integration format.

A second group of metrics should track engineering cost: how many lines of glue code does the engine integration require? How complex is the correctness test suite? These costs are part of the total benefit calculation.

A third group should track safety: how often is the native scan disabled in favor of the reference path because of correctness concerns? If the disable rate is high, the correctness test suite is not comprehensive enough.

## What I Would Cut From a Weak Rollout

Cut performance benchmarks before correctness verification. A benchmark that shows 3x speedup but has not been tested for delete semantics is not a production benchmark. It is a demo.

Cut high-concurrency workloads from the initial phase. Verify single-scan correctness first. Add concurrency testing after the single-scan path is correct and stable.

Cut schema evolution cases from the scope only if the production tables are append-only and that is documented. If schema evolution is a possibility, it must be in the test suite.

## The Practical Standard

The practical standard for native Iceberg scan operators is not maximum scan throughput. It is correctness on production table complexity followed by measurable latency improvement with a safe fallback. When a user challenges an analytical result that went through the native scan path, the engineer should be able to run the reference path on the same query and confirm the results match.

That standard is demanding, but it is realistic. It lets teams adopt native scan operators for production interactive workloads without pretending that language choice alone solves the hard engineering problem.

## My Recommendation

Take native Iceberg scan operators seriously for production interactive workloads, but build correctness verification before performance benchmarking. The useful bar is simple: can the team verify delete semantics, measure memory under concurrency, test schema evolution in the native path, and explain the fallback?

If the answer is yes, the implementation deserves a production pilot. If the answer is no, the next step is not a language debate. The next step is a correctness test suite.

Native execution matters because users expect open table formats to feel interactive. A strong engine layer can make Iceberg practical for repeated analytical work without changing the storage contract. That is the relevant point for platforms like Dremio: native execution improves the user experience over open data without requiring a format change.

For a deeper foundation on lakehouse and AI architecture, explore Alex Merced's books on data lakehouses and AI at [books.alexmerced.com](https://books.alexmerced.com). To try a governed, open, agent-ready lakehouse in practice, start a free trial of Dremio's Agentic Lakehouse at [dremio.com/get-started](https://www.dremio.com/get-started).
