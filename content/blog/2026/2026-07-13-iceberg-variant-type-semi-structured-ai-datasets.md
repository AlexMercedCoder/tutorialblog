---
title: "Iceberg Variant Type for AI JSON Data"
date: "2026-07-13"
description: "An in-depth exploration of iceberg variant type for ai json data"
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Variant Type
  - JSON
  - AI
canonical: "https://iceberglakehouse.com/posts/iceberg-variant-type-semi-structured-ai-datasets/"
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-variant-type-semi-structured-ai-datasets/).

A single LLM response is not a single value. It carries the generated text, a reasoning trace, one or more tool calls with their arguments, source references, a confidence field, token usage counts, and sometimes an error object. Store a million of those responses and you have a dataset where every row is a small nested document, the shapes vary from row to row, and the fields you care about are buried two or three levels deep. This is the normal shape of AI data, and it does not fit a rigid columnar schema without a fight. A native variant-style type in [Apache Iceberg](https://iceberg.apache.org/spec/) is the format's answer to that mismatch.

One caveat up front on status. Native semi-structured support in Iceberg has been moving through standardization, and the exact type naming and binary layout continue to settle. I have not pinned every detail to a specific release for this article, so treat "variant type" here as a standardization direction rather than a finished production guarantee, and confirm current status and naming against the [Iceberg type system docs](https://iceberg.apache.org/spec/#schemas-and-data-types) and the [Iceberg GitHub proposals](https://github.com/apache/iceberg) before building on it. The design argument for why this matters stands regardless of the release timeline.

## AI Workloads Are Semi-Structured by Default

The reason this topic matters now is that AI systems generate data whose structure is irregular on purpose. Look at what accumulates when you run models and agents in production.

**LLM outputs.** A model response often includes nested reasoning traces, tool arguments, source references, confidence scores, token usage, and error details. The set of fields present depends on what the model did. A response that called two tools looks different from one that called none. A response that hit a content filter has an error object that a successful one lacks.

**Agent execution logs.** Agents call tools, and the tools change over time. Today an agent has a `search` tool and a `calculator`; next month you add a `database_query` tool with its own argument shape. An agent trace has to accommodate schemas that evolve as your tools evolve. Pinning agent logs to a fixed columnar schema means a migration every time the tool set changes.

**Evaluation records.** When you evaluate model behavior, you store variable rubric results, raw model responses, human review notes, and per-criterion scores. Different eval runs use different rubrics. The shape of an eval record for a summarization task differs from one for a code-generation task.

The common thread is that these records are nested, irregular, and evolving. They are documents more than they are rows. You want to keep them in a governed table so you can query them, join them to business facts, and analyze model behavior over time. But their shape resists the tidy, fixed columns that analytical tables usually assume. That tension is exactly what a semi-structured type addresses.

It is tempting to respond to this irregularity by flattening everything into a wide, fixed schema up front: one column for the text, one for token count, one for each possible tool name, and so on. This works until it does not, and it stops working quickly. The moment you add a tool, change a rubric, or upgrade a model that returns a new field, you face a schema migration. Wide fixed schemas also go sparse fast, because most rows only use a fraction of the possible columns, leaving a table that is mostly nulls and awkward to reason about. And they force a design decision at ingestion time, before you know which fields will turn out to matter, which means you either drop data you later wish you had kept or you keep a moving target of columns that no two teams define the same way. Semi-structured storage sidesteps this by letting the record keep its natural shape and deferring the decision about which fields matter to query time, when you actually know.

## Why JSON Strings and Map Columns Fall Short

The two common workarounds today are storing the payload as a JSON string or storing it as a map. Both work in the narrow sense that the data lands in a table. Both are weak substitutes, and the reason why is precisely the argument for a native type.

**JSON as a string.** You define a column of type string and dump the serialized JSON into it. The data is preserved, but the table format now sees an opaque blob. It cannot maintain useful statistics on the nested fields, because to the format the whole thing is one text value. It cannot prune files based on a nested field's range, because it does not know the field exists. Every query that needs a value inside the JSON pays the full parsing cost at query time: the engine reads the string, parses it into a structure, and extracts the path, once per row, on every query. Filtering on a nested field means parsing every row's JSON just to evaluate the predicate. Nothing about the nested structure is indexable, because the format cannot reason about structure it treats as text.

**Map columns.** A map type is better in that the engine understands keys and values as first-class things. But a map imposes a hard constraint: the values must be uniformly typed. A `map<string, string>` forces every value to be a string. A `map<string, int>` forces every value to be an integer. Real AI payloads violate this constantly. A single response object mixes strings, numbers, booleans, arrays, nested objects, and nulls. Token usage is a number, the generated text is a string, the tool calls are an array of objects, and the error field might be null or a structured object. There is no single value type that fits, so the map approach either flattens everything to strings, which reintroduces the string problem, or fails to represent the data honestly.

The consequences show up as concrete pain. Search and indexing degrade when the engine cannot reason about nested structure. Statistics are weak or absent, so file pruning does not help on nested predicates and queries scan more than they should. Query complexity balloons because analysts write repeated cast-and-parse expressions to reach into the payload, and those expressions are both slow and error-prone. The table technically holds the data, but it does not make the data efficiently queryable.

The cost of the JSON-string approach compounds at scale in a way that is easy to underestimate from a small test. On a few thousand rows, parsing JSON per query feels instant and nobody notices. On a few hundred million rows of agent traces, every query that touches a nested field is parsing hundreds of millions of strings, and that parsing cannot be skipped, cached across queries, or pruned away, because the engine has no structural handle on the content. Two analysts asking two different questions about the same nested field both pay the full parse independently. The parsing becomes a persistent tax on the whole dataset, proportional to how often you query it, which for an actively analyzed observability table is constantly. What looked like a harmless serialization choice at ingestion turns into the dominant cost of every downstream query.

There is a governance cost too, separate from performance. When a payload is an opaque string, your access controls and data-quality checks cannot see inside it. If a nested field contains something sensitive, such as a user identifier embedded in a tool argument, a string column gives the platform no way to mask or filter on that field, because the platform does not know the field exists. Structure that the format cannot see is structure the format cannot govern.

## What a Native Variant Type Changes

A native variant type stores a semi-structured value while preserving type information about what is inside it. The difference from a string is that the format knows the value is a structured document, and the difference from a map is that the fields inside can have different types. A variant column can hold a value that is a string in one row and an object in the next, and each row's internal types are preserved rather than flattened.

That type preservation enables capabilities the string and map approaches cannot offer:

- **Efficient path extraction.** Reaching a nested field can be done by navigating a structured binary representation rather than parsing text from scratch on every query. The value is already in a form the engine can traverse.
- **Nested scans and predicates that the engine understands.** Because the format knows the structure, it can, in principle, support filtering and projection on nested paths more efficiently than string parsing allows, and potentially maintain statistics that make pruning possible on nested fields.
- **Honest representation of mixed types.** A variant does not force uniformity. The array of tool calls, the numeric token count, and the nullable error object all coexist in one value without lying about their types.

The part that matters most for a lakehouse is interoperability, and it repays a closer look. Iceberg tables are read and written by many engines. If each engine has its own proprietary JSON type with its own semantics, a table written by one engine is not reliably readable with the same meaning by another. Standardized variant semantics in the table format matter more than any single engine's JSON feature, precisely because the whole point of Iceberg is that the table is shared. A standard variant type means the semi-structured column means the same thing everywhere the table is read. That is the difference between a portable dataset and a vendor-locked one.

This is also why a standardized binary representation matters more than it might first appear. If two engines agree only on "it's JSON" but each stores and interprets it differently, subtle disagreements creep in around number precision, key ordering, null handling, and how types are inferred. Those disagreements are the kind of bug that surfaces months later when a value read by one engine does not match the same value read by another, and tracking it down is miserable. A shared, specified layout removes that class of problem by pinning down not just that a value is semi-structured but exactly how it is encoded, so any conforming engine reconstructs the same value with the same types. For an organization that expects to use more than one tool against its lakehouse over the years, and most do, this predictability is the practical payoff of standardization, not an abstract virtue.

Here is the comparison across the three approaches.

| Capability | JSON string | Map column | Native variant |
| --- | --- | --- | --- |
| Preserves nested structure | Yes, but as opaque text | Only one level, uniform values | Yes, with type info |
| Mixed value types in one value | Yes, but unparsed | No; values must share one type | Yes |
| Path extraction cost | Full parse per row per query | Cheap for flat keys | Structured traversal, no full text parse |
| Statistics and file pruning on nested fields | Weak or none | Limited | Possible, engine-dependent |
| Cross-engine interoperability | Consistent but inefficient | Consistent for flat maps | Consistent with standardized semantics |
| Query ergonomics | Heavy cast-and-parse | Simple for flat keys only | Path access without repeated parsing |

## Querying Nested Payloads Without Cast Sprawl

The everyday payoff of a native type is that analysts stop writing the same parse-and-cast boilerplate on every query. With JSON strings, reaching a nested field looks like a stack of function calls: parse the string, walk down the path, cast the result to the type you expect, and do it again for the next field. Repeat that across a query with five nested references and both the SQL and the query plan get ugly.

With a native variant, path access is a first-class operation. Conceptually, querying a variant column looks like this:

```sql
-- Conceptual example. Exact syntax depends on the engine and version.
SELECT
  response.model              AS model,
  response.usage.total_tokens AS tokens,
  response.tool_calls[0].name AS first_tool
FROM llm_responses
WHERE response.confidence > 0.8
  AND response.error IS NULL;
```

I want to be explicit that this is conceptual. The exact path syntax, the array-access notation, and the functions available all depend on the engine and its version, and you should verify them against your engine's documentation rather than copying this literally. The point the snippet makes is structural: you reference nested paths directly, the engine understands them as paths into a typed value, and you are not wrapping every field in a parse-then-cast expression. Native storage should reduce the need for repeated casts and ad hoc JSON parsing, which is both a readability win and a performance win, because the engine can plan around structure it understands instead of treating each row as text to re-parse.

The readability gain is not cosmetic. Cast-and-parse sprawl is a real source of bugs. When every nested reference is a nested function call that parses a string, navigates a path, and casts the result, small mistakes hide easily: a wrong path segment, a cast to the wrong type, an off-by-one array index. Those errors do not throw; they silently return null or a coerced value, and the query runs and produces a plausible-looking wrong answer. Direct path access against a typed value narrows the surface for these mistakes, because the structure is explicit and the engine can catch a type mismatch rather than quietly swallowing it. For datasets that feed model evaluation and monitoring, where a wrong aggregate might lead someone to ship or roll back a model, quietly wrong queries are exactly the failure you most want to avoid.

A caution to pair with the enthusiasm: a variant type does not relieve you of thinking about schema entirely. The fields you query most often and depend on most heavily may still be worth promoting to real typed columns, either at ingestion or through a derived view, so they get first-class statistics and the cleanest possible query path. A common and sensible pattern is to keep the full record in a variant column for completeness and flexibility, while surfacing the handful of hot fields as proper columns for the queries that run constantly. Variant is the right home for the long, irregular tail of fields, not necessarily for the three fields every dashboard needs.

## Storing Agent Logs Directly in the Lakehouse

The practical use case that ties this together is AI observability. Teams running agents in production need to answer questions about model behavior: which tool calls fail most often, how token usage trends by model version, what fraction of responses fall below a confidence threshold, how eval scores move after a prompt change. Answering these means querying the nested records described earlier.

Today those records often land in a separate observability tool with its own storage and its own query language, creating an AI observability silo that is disconnected from the rest of your data. That separation has real costs. You cannot easily join agent traces to business outcomes, because the traces live somewhere your warehouse cannot reach. You maintain a second system with its own retention, access control, and cost. And the AI data is governed differently, or not at all, compared to your analytical tables.

A lakehouse table with native semi-structured columns collapses that silo. Agent logs, LLM outputs, and evaluation records become rows in governed Iceberg tables that sit alongside your other data. That has several advantages. The data inherits the same governance, access control, and retention as the rest of your lakehouse. You can join AI traces to business facts directly, asking questions like whether responses that used a particular tool correlate with better downstream outcomes. And you avoid paying for and operating a separate observability stack whose data you cannot easily reach from your main query engine.

The join to business facts is where the real analytical value lives, and it is exactly what a silo makes hard. Suppose you want to know whether the agent-assisted checkout flow actually improved conversion, or whether responses that hit a low-confidence path led to more support tickets. Answering either question means putting agent traces next to conversion data or ticket data in the same query. If the traces live in a separate observability tool with its own query language and no path to your warehouse, that join is a data-export project every time you want to ask a new question. If the traces are Iceberg rows in the same lakehouse as the business data, the join is just a query. The difference is not a marginal convenience. It is the difference between routinely asking whether the AI is helping and only being able to ask when someone budgets a data-engineering effort to move data around.

Retention and cost control also come for free when the traces live in the lakehouse. AI trace volume can be enormous, since every model call and tool invocation produces records, and much of it loses value quickly. Because Iceberg tables support partitioning and standard expiration, you can keep recent traces hot for active analysis and age older ones out on a policy, using the same maintenance machinery you already run for other tables, rather than paying an observability vendor's per-event pricing for data you will rarely query again.

The honest limitation here is that a native variant type does not, by itself, make everything fast. Whether nested queries perform well depends on the engine's variant support, whether it maintains useful statistics on variant paths, and how the data is laid out. A native type removes the parsing tax and enables better plans, but it is an enabler, not a magic guarantee. Query performance on deeply nested payloads still depends on engine maturity, and that maturity is uneven while the type standardizes. Plan to measure rather than assume.

## Why This Strengthens Open Agentic Lakehouses

The strategic point is that agentic workloads produce two kinds of data that used to live apart. There are structured business facts, the tables that describe customers, transactions, and operations. And there are semi-structured AI traces, the nested records of what models and agents actually did. Keeping these in separate systems means you cannot reason about them together, which is exactly the reasoning agentic applications need.

A lakehouse that handles both is the foundation for closing that gap, and [Dremio](https://www.dremio.com/) is positioned around that idea. It is a data platform built for and managed by AI agents, on open standards including Apache Iceberg and Apache Arrow. Because it queries data in place across sources through federation and layers a semantic model over it, the same platform can serve structured business facts and semi-structured AI traces to the same queries and the same agents. The semantic layer of views, wikis, labels, and AI metadata means the nested AI datasets are not just stored but described, so both people and agents know what a given trace field means. Built-in AI SQL functions and an AI Agent let you work with these datasets in a governed way rather than shipping them to a separate tool. The write-up on [the AI foundation of the agentic lakehouse](https://www.dremio.com/blog/the-ai-foundation-of-the-agentic-lakehouse/) develops this further.

The reason the openness matters, and not just the feature, is the same reason standardized variant semantics matter: a shared table format keeps your AI observability data portable and joinable rather than trapped in a proprietary silo. The data foundation is what makes agentic analytics durable, more than any single model or tool that reads it.

## Where to Start

If you are storing LLM outputs or agent traces as JSON strings today, the near-term move is to stop treating those payloads as opaque text and start treating them as structured, queryable columns. Track where native variant support lands in Iceberg and in your engine, keep your AI traces in governed lakehouse tables rather than a disconnected observability tool, and write your nested queries to path-access the structure instead of parsing strings row by row.

To see structured business data and semi-structured AI traces queried together on an open Iceberg lakehouse with a semantic layer and built-in AI functions, start a project at [dremio.com/get-started](https://www.dremio.com/get-started) and bring your agent logs into a governed table.
