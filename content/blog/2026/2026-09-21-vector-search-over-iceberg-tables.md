---
title: "Vector Search Directly Over Iceberg Tables, and When You Still Need a Vector Database"
date: "2026-09-21"
description: "Embeddings are just columns. When exact vector search over Iceberg scans beats a vector database, when it does not, and how to lay out tables."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Vector Search
  - Apache Iceberg
  - RAG
  - AI
canonical: https://iceberglakehouse.com/posts/vector-search-over-iceberg-tables/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/vector-search-over-iceberg-tables/).

A support platform stores every ticket, article, and chat transcript in Apache Iceberg tables. The retrieval team embeds each document and copies the vectors into a separate vector database for semantic search. Now there are two copies of the corpus. A pipeline keeps them in sync. When a customer invokes their right to deletion, the row disappears from Iceberg on Tuesday and from the vector database whenever the sync job next succeeds. When a new tenant isolation rule lands, it gets implemented twice, once in the catalog and once in the vector store's own access model.

None of this is exotic. It is the default architecture for retrieval-augmented generation (RAG) in 2026, and for many workloads it is the right one. But a growing share of teams are asking a simpler question. The embeddings are already columns of numbers. The lakehouse already stores, governs, and scans columns of numbers. Why not search them where they live?

The answer is that you can, and for a specific and common set of workloads you should. It is also that exact search over a table has a cost profile very different from an indexed vector database, and pretending otherwise leads to slow queries and disappointed users.

This article walks through how embeddings are stored in Iceberg today and what the open-standard vector types being designed in Parquet and Iceberg will change. It covers the arithmetic of exact search, why relational filtering is the lakehouse's real advantage, and a runnable hybrid search over an actual Iceberg table. It ends with a decision framework for when a dedicated vector index still earns its place, and how to run one as a derived cache instead of a second source of truth.

## The Cost of the Second Copy

Before looking at mechanics, it is worth listing what a separate vector database actually costs, because the list is longer than the storage bill.

**Synchronization.** Every insert, update, and delete in the source tables has to reach the vector store. That means a change feed, an embedding job, and an upsert job, each with its own failure modes, retries, and lag. The vector store is always slightly behind.

**Deletion.** Regulatory deletion requests have to reach every copy. A lakehouse that handles deletes carefully in Iceberg still leaks data if the vector store retains the embedding and its metadata. Embeddings can encode sensitive content, so a lingering vector is a lingering copy of the data in a different form.

**Governance.** The lakehouse has one access model, enforced in the catalog. The vector store has another. Row-level rules such as tenant isolation have to be duplicated as metadata filters in the vector store, and the two implementations drift.

**Consistency.** An application that joins vector search results with fresh relational data, such as filtering retrieved documents by current permissions or status, sees mismatches whenever the two stores disagree.

**Reproducibility.** Iceberg snapshots let you ask what the table looked like at a given moment. Most vector stores have no equivalent, so reproducing what a RAG system retrieved last month means reconstructing index state that no longer exists.

These costs are the reason searching in place is attractive. They are also why, when a vector index is necessary, the right design keeps Iceberg as the system of record and treats the index as something derived from it. That design comes later. First, the storage.

## How Embeddings Live in Iceberg Today

Iceberg has no vector type today. The standard way to store an embedding is a `list<float>` column. In Parquet, that becomes a repeated group with a float leaf, and every value carries repetition and definition levels to mark where each list begins and ends.

That works, and every engine that reads Iceberg can read it. It has three drawbacks.

**No fixed-dimension invariant.** A `list<float>` column accepts lists of any length. Nothing in the schema says every embedding has 384 or 768 dimensions. A buggy writer that emits the wrong model's embeddings into the same column goes undetected until similarity scores come out as garbage.

**Useless statistics.** Parquet and Iceberg collect min and max statistics per column. For an embedding column, those statistics describe individual coordinates across all vectors, which tells a planner nothing useful. They cost space and write time and prune nothing.

**Encoding overhead.** Repetition and definition levels add bytes and decode work for data that has a fixed shape by construction.

The Parquet community has been working through this in public. In February 2026, a dev list thread asked how to tune Parquet for embeddings, and Micah Kornfield, a long-time Parquet contributor, offered practical guidance that still holds. Disable statistics on vector columns, since they are not useful. Try the BYTE_STREAM_SPLIT encoding combined with compression, which he had heard works reasonably well for embedding data. Expect dictionary and run-length encodings to fall back to plain encoding quickly on high-cardinality floats. And pack at least on the order of 100 KB into a page, since one vector per page is far too small.

A native vector type is on the way in both projects.

On the Iceberg side, Yan Yan opened a discussion in July 2026 proposing a first-class vector type. The preferred direction is a dense numeric vector with a compact schema encoding such as `float[768]` or `int[128]`: fixed dimension, numeric coordinates, non-null elements, and nullability only at the vector level. Tanmay Rauth's review suggested making three things normative. The Iceberg field ID goes only on the outer Parquet group, not on the inner element leaf. Vector columns get value and null counts with vector-level meaning, while coordinate-level bounds are left out. And older Avro or ORC files that predate a vector column keep working by projecting nulls, while new writes that materialize the column must use the Parquet representation.

On the Parquet side, a focused community call on September 8, 2026 narrowed the physical representation to two options, summarized on the dev list by Rok Mihevc. Option A stores each vector as a fixed-length byte array holding all elements, with the logical type recording the element type. It is simple and easy to evolve, but it loses the element-level encodings Parquet offers today. Option C1 stores vectors as a list of numeric elements, which keeps today's encodings and requires adding new float types such as BF16 to Parquet as needed. Antoine Pitrou, a core Arrow and Parquet developer, replied that Option A's lack of encoding choices made him entirely negative about it, while he was lukewarm about Option C because at least it does not paint the format into a corner. No decision has been made.

The practical upshot is simple. Store embeddings as `list<float>` today, with statistics disabled on the column where your writer allows it. Plan to migrate to a native vector type when both specs settle, which will give engines the fixed-dimension guarantee and a more compact physical layout.

## The Arithmetic of Exact Search

Searching a table of embeddings without an index is exact nearest-neighbor search, often called brute force. The engine computes the similarity between the query vector and every candidate vector, then keeps the top k. There is no approximation. The answer is the true top k.

The cost is easy to calculate, and it is worth doing before choosing an architecture.

For cosine similarity on normalized vectors, each comparison is a dot product: one multiply and one add per dimension. With N candidates of dimension D, a query costs N times D multiply-adds. It also has to read N times D numbers from storage or memory.

At 32-bit floats, that data volume looks like this for a 768-dimension embedding model.

| Candidate vectors | Raw embedding bytes read per query |
|---|---|
| 100,000 | about 307 MB |
| 1,000,000 | about 3.07 GB |
| 10,000,000 | about 30.7 GB |
| 100,000,000 | about 307 GB |

Those figures are raw floats, before compression. Random-looking embedding values compress poorly, so on-disk sizes stay in the same range.

The compute side is fast on modern hardware. Columnar engines built on Apache Arrow memory layouts evaluate dot products with SIMD instructions across contiguous float buffers, and a single core handles billions of multiply-adds per second. For most brute-force searches over a lakehouse, the bottleneck is reading the vectors, not multiplying them.

That leads to the key observation. Exact search over a table is a scan. Its latency is governed by the same things that govern any scan: how many bytes you read, from where, with how much parallelism. Every trick the lakehouse has for reading fewer bytes applies directly.

It also sets clear limits. Scanning 30 GB per query is fine for a nightly batch job that scores a million records. It is not fine for an interactive chatbot that has to answer in 200 milliseconds at 50 queries per second. The question is never whether exact search over Iceberg works. It is whether the candidate set a query has to scan is small enough for the latency you need.

## A Worked Sizing Example

Numbers make the decision concrete, so here is one scenario worked through with the arithmetic above.

A B2B support product stores 40 million document chunks across 2,000 customer tenants, embedded with a 768-dimension model. Every retrieval query is scoped to one tenant, and most also filter to documents updated in the last two years.

Searching the whole corpus exactly means reading 40 million times 768 times 4 bytes, about 123 GB per query. That is clearly impossible for interactive use, and it is where the "you need a vector database" instinct comes from.

Now apply the filters the product actually uses. Tenants vary in size. Suppose the median tenant holds 10,000 chunks and the largest holds 2 million. The two-year filter keeps, say, 60 percent of each tenant's documents.

For the median tenant, the candidate set is 6,000 vectors, about 18 MB of embeddings. With the table partitioned by tenant and sorted by update date, the scan reads roughly that much plus metadata. Exact similarity over 6,000 vectors takes a few milliseconds of compute. That fits an interactive budget comfortably.

For the largest tenant, the candidate set is 1.2 million vectors, about 3.7 GB. That no longer fits an interactive budget on typical infrastructure. It is the case that needs a different answer, and there are two options. The first is a `cluster_id` layout within that tenant's partition, probing a handful of the nearest clusters to cut the scan by an order of magnitude or more. The second is an ANN index for large tenants only, built from Iceberg snapshots as a derived cache.

The result is an architecture where the vast majority of tenants are served by exact search in place, and a small number of very large tenants get an index. The index covers a fraction of the data instead of all of it, and everything else keeps the lakehouse's governance, deletion, and reproducibility properties.

The exact figures in this example are illustrative. The method is the point. Size the candidate set per query after real filters, not the corpus, and let the distribution of candidate sizes decide where indexes are worth their cost.

## Filter First: The Lakehouse's Real Advantage

Here is where the lakehouse flips from a weaker vector store into a stronger one. Almost no real retrieval query searches the whole corpus.

A support assistant searches one customer's tickets. A legal research tool searches documents from one jurisdiction within a date range. A product search filters by category, region, and stock status. A multi-tenant SaaS application must never search across tenants at all. These are relational predicates, and they usually cut the candidate set by one or more orders of magnitude before any similarity math happens.

Dedicated vector databases handle this as filtered search, and it is a known hard problem for them. Approximate indexes such as HNSW, the Hierarchical Navigable Small World graph algorithm, are built over the whole collection. Applying a selective filter either before or during graph traversal degrades recall or speed, and systems use a range of strategies to compensate.

A lakehouse handles the same filter with machinery built for exactly that purpose. Iceberg partition pruning skips whole data files by partition value. Manifest statistics skip files whose column bounds cannot match. Parquet row group statistics skip chunks within files. What reaches the similarity computation is only the rows that pass the filter, and only the columns the query needs.

This is hybrid search in its most useful form: relational filter first, exact similarity second. When the filter is selective and aligned with the table's layout, the candidate set shrinks from millions to thousands, and exact search over thousands of vectors takes milliseconds of compute.

The word "aligned" matters. A filter only saves reads when the table's physical layout lets metadata rule files out. If the table is partitioned by tenant, a tenant filter skips every other tenant's files. If it is not, the engine reads every file and discards rows after reading them, and the filter saves compute but not I/O. The experiment in the next section shows the difference directly.

## A Hybrid Search You Can Run

This example builds a real Iceberg table with PyIceberg, the Python Iceberg library, using a local SQLite-backed catalog and the local filesystem, so it runs on a laptop. It stores 200,000 random 384-dimension embeddings alongside a tenant and a publication year, partitions the table by tenant, and runs a filtered exact search. DuckDB computes the similarity on the Arrow data that PyIceberg returns.

```python
import time

import duckdb
import numpy as np
import pyarrow as pa
from pyiceberg.catalog.sql import SqlCatalog
from pyiceberg.expressions import And, EqualTo, GreaterThanOrEqual

DIM, N = 384, 200_000
rng = np.random.default_rng(42)

# 1. A local Iceberg catalog backed by SQLite and the local filesystem.
catalog = SqlCatalog("local", uri="sqlite:////tmp/wh/catalog.db", warehouse="file:///tmp/wh")
catalog.create_namespace_if_not_exists("docs")

# 2. Normalized embeddings stored as list<float> next to ordinary columns.
emb = rng.standard_normal((N, DIM), dtype=np.float32)
emb /= np.linalg.norm(emb, axis=1, keepdims=True)
data = pa.table({
    "doc_id": pa.array(np.arange(N), pa.int64()),
    "tenant": pa.array(rng.choice(["acme", "globex", "initech", "umbrella"], N)),
    "published_year": pa.array(rng.integers(2019, 2027, N), pa.int32()),
    "embedding": pa.FixedSizeListArray.from_arrays(pa.array(emb.ravel()), DIM)
                   .cast(pa.list_(pa.float32())),
})

# 3. Partition by tenant so tenant filters prune whole files.
tbl = catalog.create_table("docs.chunks", schema=data.schema)
with tbl.update_spec() as spec:
    spec.add_identity("tenant")
tbl.append(data)

# 4. The query embedding.
query = rng.standard_normal(DIM, dtype=np.float32)
query /= np.linalg.norm(query)

# 5. Relational filter pushed into the Iceberg scan.
flt = And(EqualTo("tenant", "acme"), GreaterThanOrEqual("published_year", 2024))
print("data files:", len(list(tbl.scan().plan_files())),
      "after pruning:", len(list(tbl.scan(row_filter=flt).plan_files())))

t0 = time.perf_counter()
candidates = tbl.scan(
    row_filter=flt,
    selected_fields=("doc_id", "published_year", "embedding"),
).to_arrow()
t1 = time.perf_counter()

# 6. Exact cosine similarity and top-k over the survivors.
con = duckdb.connect()
con.register("candidates", candidates)
top = con.execute(f"""
    SELECT doc_id, published_year,
           array_cosine_similarity(embedding::FLOAT[{DIM}], ?::FLOAT[{DIM}]) AS score
    FROM candidates
    ORDER BY score DESC
    LIMIT 5
""", [query.tolist()]).fetchall()
t2 = time.perf_counter()

print(f"{candidates.num_rows:,} candidates, scan {t1 - t0:.2f}s, similarity {t2 - t1:.2f}s")
for row in top:
    print(row)
```

Walk through each step.

Step one creates a catalog. `SqlCatalog` stores Iceberg metadata pointers in a SQLite database and writes data and metadata files under the warehouse path. In production, point PyIceberg at a REST catalog such as Apache Polaris instead, and nothing else in the script changes.

Step two builds the data. The embeddings are random vectors normalized to unit length, so cosine similarity equals the dot product. The embedding column is created as a fixed-size list in Arrow, then cast to a variable-length `list<float32>`, which is the representation Iceberg supports today.

Step three sets an identity partition on `tenant` before appending. PyIceberg writes one data file per tenant value, four files in total. This is the layout decision that makes the tenant filter cheap.

Step five is the hybrid part. The `row_filter` combines a tenant equality and a year range. PyIceberg plans the scan with Iceberg metadata and keeps only the files whose partition value matches, then applies the full filter to rows while reading. `selected_fields` projects only the columns the search needs.

Step six hands the surviving rows to DuckDB as Arrow data, with no copy into a separate system. DuckDB's `array_cosine_similarity` works on fixed-size arrays, so the query casts the list column and the query vector to `FLOAT[384]`. The engine computes all similarities, sorts, and keeps the top five.

Here is what one run printed on a small cloud container, with PyIceberg 0.12.0 and DuckDB.

The table had 4 data files. Planning with the filter kept 1 of them. The filtered scan returned 18,744 candidate rows in 0.29 seconds. Similarity and top-k over those candidates took about 0.04 seconds. A full scan of all 200,000 embeddings with no filter took 1.00 second before any similarity math. A rerun of the script produced nearly identical timings, 0.30 seconds for the filtered scan and 0.03 seconds for similarity.

The same experiment without partitioning makes the alignment point concrete. With all rows in a single unpartitioned file, the filtered scan took 1.25 seconds, slower than the unpartitioned full scan's 0.96 seconds, because the engine read every row and discarded most of them after reading. The filter was identical. Only the layout changed.

These are single-run numbers on small local data, so treat them as an illustration of mechanics rather than a benchmark. The shape is what generalizes: when the filter aligns with the layout, it cuts the bytes read, and when it does not, it cuts almost nothing.

## Laying Out Tables for Vector Search

If exact search over Iceberg is a scan, then table layout is the main tuning lever. Three layout decisions matter most.

**Partition by the filter every query uses.** For multi-tenant retrieval, that is the tenant. For document search scoped by business unit or jurisdiction, it is that attribute. The experiment showed what this buys: the same filter went from reading the whole table to reading a quarter of it. Iceberg's hidden partitioning means queries do not need to know the partition scheme, and partition evolution lets you change it later without rewriting history.

**Sort within partitions by the next most common filter.** Publication date, document type, or status are typical. Sorting tightens file and row group statistics on that column, so range filters skip more data inside the partition.

**Cluster by embedding region for unfiltered search.** This is the technique that brings the lakehouse closest to an index without leaving it. Run k-means over a sample of embeddings to get a few hundred or a few thousand centroids. Assign every vector to its nearest centroid and store that assignment as an ordinary integer column, such as `cluster_id`. Partition or sort the table by `cluster_id`. At query time, compare the query vector against the centroids, which is cheap, pick the few nearest clusters, and add `cluster_id IN (...)` to the filter. Partition pruning then skips every file outside those clusters.

That is the idea behind IVF indexes, expressed as table layout. It is approximate, because a true nearest neighbor sometimes sits in a cluster you did not probe. Probing more clusters raises recall and cost together, exactly as the probe count does in an IVF index. The difference is that the "index" is a column and a partition spec, governed and versioned like the rest of the table, and every engine that reads Iceberg can use it without a plugin.

Recompute centroids when the embedding model changes or the data distribution shifts substantially, then rewrite the table with the new assignments. Iceberg's partition evolution and data file rewrites make that a maintenance job rather than a migration.

Two storage settings round out the layout. Disable column statistics on the embedding column where your writer supports per-column metrics configuration, since coordinate bounds prune nothing. In Iceberg, the `write.metadata.metrics.column.<name>` table property controls this, and setting it to `none` for the embedding column stops Iceberg from collecting metrics for it. And keep embedding columns out of queries that do not need them. Columnar projection means a relational query over the same table never reads the vectors, so storing embeddings next to the data costs nothing for queries that ignore them.

## Similarity in the Engines You Already Run

Searching in place only helps if your engines can compute similarity efficiently. Support varies, and the gaps are easy to work around.

DuckDB, used in the walkthrough, provides `array_cosine_similarity`, `array_distance`, and `array_inner_product` on fixed-size arrays, plus list equivalents. It reads Iceberg tables through its Iceberg extension or, as in the example, through Arrow data handed over by PyIceberg. For single-node workloads up to tens of millions of vectors after filtering, it is a strong default.

Apache Spark has no built-in cosine similarity function, but its SQL higher-order functions express a dot product directly over array columns. For unit-length vectors, this computes cosine similarity against a query vector passed as an array literal or a broadcast column.

```sql
SELECT doc_id,
       aggregate(zip_with(embedding, :query_vec, (x, y) -> x * y),
                 0D, (acc, v) -> acc + v) AS score
FROM lake.docs.chunks
WHERE tenant = 'acme' AND published_year >= 2024
ORDER BY score DESC
LIMIT 10;
```

`zip_with` pairs each coordinate of the stored embedding with the matching coordinate of the query vector and multiplies them. `aggregate` sums the products into a double, starting from `0D`. The `WHERE` clause is pushed into the Iceberg scan, so partition pruning happens before any multiplication. The `:query_vec` placeholder stands for the query embedding, bound through your client's parameter syntax, which varies by client. For large batch jobs, such as scoring every document against a set of queries, a vectorized pandas UDF over Arrow batches with NumPy matrix multiplication is usually faster than row-at-a-time expressions.

Other engines differ in function names and in whether they vectorize the computation. Check two things for any engine you plan to use: whether it has a native dot product or cosine function on arrays, and whether that function runs vectorized over columnar batches. The first decides convenience. The second decides speed.

## Where a Vector Database Still Wins

Exact search over filtered Iceberg scans covers a large set of workloads. It does not cover all of them, and the boundary is worth drawing precisely.

**Low latency over large unfiltered sets.** Approximate nearest-neighbor (ANN) indexes such as HNSW, IVF (inverted file) indexes, and disk-based graph indexes answer queries over tens or hundreds of millions of vectors in milliseconds by examining a small fraction of them. If a query has no selective filter and must search the whole corpus interactively, a scan cannot compete. That is the core job of a vector database, and it does it well.

**High query concurrency.** A retrieval service handling hundreds of queries per second needs each query to touch little data. Even well-pruned scans read megabytes per query. An in-memory index reads kilobytes.

**Continuous single-row updates.** Iceberg handles high-frequency tiny commits poorly without careful batching, because every commit adds snapshots and small files. A vector store built for frequent upserts absorbs that write pattern natively.

**Specialized retrieval features.** Some vector databases bundle sparse-plus-dense hybrid scoring, built-in reranking hooks, and multi-vector representations. A lakehouse engine can do much of this in SQL, but not always as conveniently.

The comparison of specific vector stores, and how index types such as HNSW, IVF, and disk-based approaches trade memory for recall, is covered in [Choosing Vector Stores for Retrieval Workloads](https://datalakehousehub.com/blog/2026-05-vector-stores-retrieval). The question here is which side of the line a workload falls on.

| Workload shape | Better fit |
|---|---|
| Batch scoring, deduplication, clustering, evaluation over large sets | Exact search over Iceberg |
| Per-tenant or per-customer retrieval with small candidate sets | Exact search over Iceberg, with tables laid out by tenant |
| Interactive search with a selective, layout-aligned filter | Exact search over Iceberg |
| Interactive search over a large corpus with no selective filter | ANN index |
| High queries-per-second retrieval service with tight latency targets | ANN index |
| Continuous, row-by-row upserts with immediate visibility | Vector store with native upserts |
| Reproducing exactly what was retrievable at a past point in time | Iceberg snapshots, whatever serves the queries |

A useful rule of thumb follows from the arithmetic section. Estimate the number of candidate vectors a typical query has to scan after its filters, multiply by dimension and four bytes, and compare the result against your latency budget and your engine's scan throughput. If the answer fits, search in place. If it does not, index.

## The Index as a Derived Cache

When an ANN index is necessary, the choice is not between Iceberg and a vector database. It is about which one is the source of truth. The design that keeps most of the lakehouse's benefits treats Iceberg as the system of record and the index as a cache derived from it.

In that design, embeddings are computed once and written to Iceberg tables alongside the source data, with the embedding model name and version as columns. The Iceberg table is where deletes, corrections, and schema changes happen first. The vector index is built from a specific Iceberg snapshot and records that snapshot ID. Incremental updates use Iceberg's incremental scan between snapshots to find appended rows, and changelog or delete information to find removals.

That arrangement changes several of the costs listed at the start of this article.

**Deletions have one authoritative path.** A row deleted in Iceberg is gone from the source of truth immediately. The index catches up on its next incremental build, and a full rebuild from the latest snapshot is always possible, so there is a guaranteed bound on how long a deleted vector lingers.

**Reproducibility returns.** Because every index build records its source snapshot, you can answer what the index contained at any point, and you can rebuild that exact index from Iceberg time travel.

**Governance stays anchored.** Access rules live in the catalog. The index service enforces the subset it needs, and batch or analytical access to embeddings goes through the lakehouse with its full controls.

**Offline work never touches the index.** Evaluation runs, embedding model comparisons, clustering, and deduplication all run as exact scans over Iceberg. The index serves only the interactive path that needs it.

**Model migrations become table operations.** Switching embedding models means writing a new embedding column or table, backfilling it with an engine job, and rebuilding the index from it. The old embeddings stay queryable for comparison until you drop them.

Some teams go a step further and pair Iceberg with a format designed for vector workloads, such as Lance, which carries its own indexes alongside the data. I compare that pairing in [Lance and Iceberg for Multimodal AI Data](https://datalakehousehub.com/blog/2026-05-lance-iceberg-multimodal). The derived-cache principle holds either way: keep one authoritative copy with lakehouse governance, and derive the fast path from it.

Further out, the Iceberg community's index discussions, including work on secondary indexes stored in Puffin files and a dedicated community sync for index support, point toward table-level index metadata that engines understand. A vector index registered as table metadata, tied to snapshots and maintained by table operations, collapses the derived cache into the table itself. That work is early, and it is a natural endpoint for the design described here.

## Exact Search as the Ground Truth for Indexes

There is one job that exact search over Iceberg does better than any index, even at scale: measuring the index.

Approximate indexes trade recall for speed. Recall at k, the fraction of the true top k results that the index actually returns, is the number that tells you whether an index configuration is good enough. Computing it requires the true top k, which only exact search provides.

Iceberg makes this measurement unusually clean. Pick a snapshot. Build or load the index from that snapshot. Sample a few thousand real queries from your logs. For each query, run exact search over the same snapshot through a batch engine, and run the same query against the index. Compare the two result sets. Because both sides read the same snapshot, differences come only from the index, not from data drift between systems.

The same setup answers other questions that are hard to answer against a live vector database. How much does recall drop when you increase the HNSW search parameter's speed setting? How does a new embedding model change the top results for a fixed query set? Which tenants see the worst recall, and why? Each is a batch job over Iceberg tables, run on whatever schedule suits you, with results written back to Iceberg for tracking over time.

Teams that keep a vector database often skip this measurement because it is inconvenient. With embeddings in Iceberg, it becomes a routine evaluation job, and the index's quality stops being a matter of faith.

## Failure Modes and Warning Signs

Vector search over a lakehouse fails in ways that look different from both relational query problems and vector database problems. Watch for these.

**Filters that do not prune.** The most common disappointment. A team adds a tenant filter, sees no speedup, and concludes that searching in place is slow. The sign is a filtered query reading nearly as many bytes as an unfiltered one. Check the scan plan or the engine's bytes-read metric. The fix is layout: partition or sort by the filter column.

**Mixed embedding models in one column.** A `list<float>` column accepts vectors of any length and any model. A pipeline change that writes embeddings from a new model into the same column produces similarity scores that are meaningless across the boundary, and nothing errors unless dimensions differ. Store the model name and version as columns, filter on them in every query, and add a write-time check on vector length. The proposed Iceberg vector type will enforce dimension at the schema level, but not the model.

**Unnormalized vectors with dot-product scoring.** Cosine similarity and dot product agree only for unit-length vectors. Writers that skip normalization, or mix normalized and unnormalized vectors, skew rankings toward longer vectors. Normalize at write time, and verify with a spot check of vector norms.

**Candidate sets that grow quietly.** A retrieval feature launches with small per-tenant candidate sets and fast queries. A year later, the largest tenants have ten times the documents, and their queries are ten times slower while everyone else's stay fast. The sign is latency percentiles diverging by tenant. Track candidate counts per query, and move large tenants to clustered layouts or an index before they hit the latency wall.

**Index drift from the source of truth.** In a derived-cache design, the index lags Iceberg. If incremental builds fail silently, deleted rows stay searchable and new rows are missing. The sign is the snapshot ID recorded by the latest index build falling further behind the table's current snapshot. Alert on that gap.

**Small-file buildup from embedding writes.** Embedding pipelines often write in small batches as documents arrive. Each commit adds files, and scans slow down as file counts grow. Schedule compaction on embedding tables like any other high-frequency table.

**Statistics overhead on vector columns.** Leaving default metrics on an embedding column wastes manifest space and write time on bounds that never prune. On wide embeddings, the overhead adds up. Turn metrics off for the column.

## Operational Guidance

Here is a practical path for teams considering search in place.

**Store embeddings in Iceberg first, regardless of where you search.** Even if you keep a vector database, making Iceberg the system of record for embeddings, with model and version columns, is the step that fixes deletion, reproducibility, and governance.

**Measure your candidate set sizes.** For each retrieval use case, record how many rows a typical query has to consider after its relational filters. That single number decides most of the architecture.

**Lay out tables for your filters.** Partition by the attribute every query filters on, sort by the next one, and disable metrics on embedding columns.

**Start with exact search for filtered and batch workloads.** Use an engine with vectorized similarity functions over Arrow data. Validate latency against real candidate sizes, not averages.

**Add clustering before adding a separate system.** When some queries lack a selective filter, try a `cluster_id` layout with centroid probing. It keeps everything in the lakehouse and often closes the gap for moderate scales.

**Add an ANN index when the numbers demand it.** When candidate sets or concurrency outgrow scans, build an index as a derived cache from Iceberg snapshots, record the snapshot ID with every build, and alert on lag.

**Log candidate counts with every query.** Record, for each retrieval query, the tenant or scope, the number of candidate rows after filtering, the bytes scanned, and the latency. Write that log to an Iceberg table. It becomes the dataset that tells you when a tenant is outgrowing exact search, whether a layout change worked, and where an index pays for itself. Without it, the move to an index happens in response to a complaint instead of a trend line.

**Plan for the native vector type.** Follow the Iceberg vector type discussion and the Parquet physical representation decision. When both land in your engines, migrate embedding columns from `list<float>` to the native type, which is a column rewrite that fits naturally into a scheduled maintenance window.

## Where This Is Heading

Three efforts are moving in the same direction.

The storage formats are gaining native vector types. Once Parquet settles on a physical representation and Iceberg adopts a `float[N]` style type, engines get a guaranteed dimension, a compact layout, and clear metric semantics. That removes most of the friction in storing embeddings next to data.

Engines keep getting faster at the scan-and-score pattern. Vectorized execution over Arrow buffers turns exact similarity into a memory-bandwidth problem, and the same pruning that speeds up analytics speeds up retrieval.

And the Iceberg community is designing index support at the table level. If vector indexes eventually become table metadata tied to snapshots, the derived-cache pattern in this article becomes a built-in capability: one table, one governance model, an index that the table format keeps consistent, and exact search available whenever the index is not the right tool.

The endpoint is a lakehouse where embeddings are just another column type, retrieval is just another query shape, and a separate vector database is a performance optimization you add deliberately, not a second home for your data.

## Conclusion

Embeddings are columns of numbers, and a lakehouse is very good at columns of numbers. Storing them in Iceberg as `list<float>` works in every engine today, with native vector types coming in both Iceberg and Parquet as the physical representation is settled.

Exact search over Iceberg is a scan, so its cost is the bytes it reads. Relational filters are what make it practical. Most retrieval queries search a small, well-defined slice of the corpus, and when the table layout aligns with that slice, Iceberg's pruning cuts the candidate set before any similarity math runs. In the experiment here, partitioning by tenant cut the files read from four to one and the scan time from 1.00 second to 0.29 seconds, while the same filter on an unpartitioned table saved nothing.

Dedicated vector indexes still win for low-latency search over large unfiltered sets and for high-concurrency retrieval services. When you need one, build it from Iceberg snapshots and treat it as a cache. That keeps one governed source of truth for embeddings, one path for deletes, and a record of exactly what was searchable at any point in time.

Start by measuring. Log candidate set sizes per query, lay out tables for the filters your queries use, and let those numbers, not habit, decide where an index belongs. For many teams, the answer covers a smaller share of the data than they expect.

## Keep Going

If this piece was useful, I have written a lot more on building AI workloads on open lakehouse foundations. *Architecting an Apache Iceberg Lakehouse* covers table layout, partitioning, and the architecture decisions that determine how well a lakehouse serves analytics and AI side by side. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
