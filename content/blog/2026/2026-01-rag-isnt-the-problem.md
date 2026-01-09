---
title: RAG Isn’t a Modeling Problem. It’s a Data Engineering Problem.
date: "2025-01-06"
description: "Why retrieval-augmented generation systems fail in enterprises—and what to do about it."
author: "Alex Merced"
category: "Data Engineering"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data engineering
  - retrieval-augmented generation
  - RAG
---
**Get Data Lakehouse Books:**
- [Apache Iceberg: The Definitive Guide](https://drmevn.fyi/tableformatblog)
- [Apache Polaris: The Defintive Guide](https://drmevn.fyi/tableformatblog-62P6t)
- [Architecting an Apache Iceberg Lakehouse](https://hubs.la/Q03GfY4f0)
- [The Apache Iceberg Digest: Vol. 1](https://www.puppygraph.com/ebooks/apache-iceberg-digest-vol-1)

**Lakehouse Community:**
- [Join the Data Lakehouse Community](https://www.datalakehousehub.com)
- [Data Lakehouse Blog Roll](https://lakehouseblogs.com)
- [OSS Community Listings](https://osscommunity.com)
- [Dremio Lakehouse Developer Hub](https://developer.dremio.com)

---

Retrieval-augmented generation looks deceptively simple.  
Embed documents.  
Store vectors.  
Retrieve context.  
Ask an LLM to answer questions.

Early demos reinforce this illusion. A small corpus. Clean documents. Few users. Results look impressive. Many teams conclude that success depends on choosing the right model or the best vector database.

![Rag is not so easy](https://i.imgur.com/bchA2fV.png)

That assumption breaks down fast.

Once RAG systems move into real enterprise environments, progress stalls. Accuracy plateaus. Latency spikes. Answers lose trust. Security teams raise alarms. Engineering teams realize the bottleneck is not the model.

It is the data.

![Bottlenecks](https://i.imgur.com/5QA6zcM.png)

Most organizations do not suffer from a lack of embeddings. They suffer from fragmented data, unclear definitions, inconsistent permissions, and legacy systems never designed for AI access. RAG exposes these weaknesses immediately. It does not hide them.

This is why RAG is turning into a data engineering problem first, and a modeling problem second.

## Where RAG Systems Actually Break Down

Enterprise data is messy by default. It lives across warehouses, lakes, SaaS tools, document systems, and operational databases. Each source uses different schemas, naming conventions, and access rules. RAG systems must unify all of it before retrieval even begins.

Data quality issues amplify the problem. Duplicate documents inflate embeddings. Stale records surface outdated answers. Inconsistent metadata makes relevance scoring unreliable. The model retrieves content correctly, but the content itself is wrong.

Governance is the most underestimated failure point. Many RAG pipelines ignore permissions or apply them too late. This creates two bad outcomes. Either the system leaks sensitive data, or engineers restrict access so aggressively that answers become incomplete. Both outcomes erode trust.

Semantic ambiguity adds another layer of friction. Business terms rarely mean one thing. “Revenue,” “active customer,” or “churn” vary by team and context. Vector similarity cannot resolve these differences. Without shared definitions, RAG systems retrieve text, not meaning.

These failures have nothing to do with LLM quality. They stem from weak data foundations.

![The Real Data Problem](https://i.imgur.com/QCug4pf.png)

As a result, teams over-engineer retrieval layers while under-investing in context. They tune indexes. Swap vector databases. Adjust chunk sizes. The core issues remain.

RAG systems succeed when they start with governed, well-defined, and accessible data. When they do not, no amount of modeling innovation compensates for the gap.

## Are Vector Databases Over-Engineered for Most Teams?

Vector databases became the default RAG component for a simple reason. They solved a real problem early. Fast similarity search over high-dimensional embeddings was hard to do well. Purpose-built systems filled that gap.

The problem is that the industry quickly treated them as mandatory infrastructure.

For many enterprise use cases, that assumption does not hold. Most RAG workloads do not start at billion-scale embeddings. They start with thousands or tens of thousands of documents. At that scale, established systems like Postgres with pgvector or search engines with vector support perform well enough.

These platforms already exist in most organizations. They are governed. They are monitored. They are understood by operations teams. Adding vector search to them is often cheaper and faster than introducing a new system.

Specialized vector databases still have a role. At large scale, with strict latency requirements and high concurrency, optimized ANN indexes and distributed architectures matter. The tipping point is real. It just arrives later than vendors suggest.

The mistake is not using vector databases. The mistake is leading with them.

![The mistake is not using vector databases. The mistake is leading with them.](https://i.imgur.com/7y5H7hZ.png)

When teams optimize the vector layer first, they ignore higher-impact problems. Data duplication. Permission enforcement. Metadata consistency. Hybrid retrieval logic. These issues dominate cost and complexity long before vector search performance does.

## Hybrid Search Is the Norm, Not the Exception

Vector search alone is rarely sufficient. Keyword search alone is rarely sufficient. Production RAG systems need both.

Keywords provide precision. Vectors provide semantic recall. Together, they outperform either approach in isolation. This pattern shows up consistently across enterprise deployments.

Despite advances in embedding models, keyword search is not becoming obsolete. Embeddings still struggle with exact matches, rare identifiers, and domain-specific language. They also struggle when the query intent is narrow and literal.

As a result, teams maintain two indexes. One lexical. One vector. They fuse results during retrieval or re-ranking. This adds operational cost, but it improves answer quality.

![Hybrid retrieval should be an assumption, not an optimization.](https://i.imgur.com/KpDU6Wu.png)


Some hope that better models will eliminate this complexity. That is unlikely in the near term. Language is both semantic and symbolic. Search systems must reflect that reality.

The practical takeaway is simple. Hybrid retrieval should be an assumption, not an optimization. Architectures that treat vector search as a drop-in replacement for text search fail under real workloads.

## Latency Changes Every Design Decision

Real-time RAG systems operate under tight latency budgets. Users expect responses in seconds, not tens of seconds. Retrieval time competes directly with model inference time.

To stay within budget, teams make trade-offs. They cache results. Use approximate search. Reduce embedding size. Retrieve fewer documents. Choose smaller or faster models.

Each choice sacrifices something. Recall. Freshness. Completeness.


![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/jw9h3okkfm764ipq4kwy.png)

The best systems compensate by pushing intelligence closer to the data. Precomputed results. Materialized views. Semantic caching. These techniques reduce work at query time and stabilize performance.

Once again, the bottleneck is not the model. It is the architecture around the data.

## The Missing Layer: Semantic Context

Most RAG architectures treat embeddings as context. That is a mistake.

Embeddings capture similarity, not meaning. They do not encode business logic, metric definitions, or governance rules. They do not understand which tables represent the same concept, or which fields are authoritative.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/4ax0vnqagp3ys56umjkj.png)

This is where many systems quietly fail. AI agents retrieve text fragments without understanding how those fragments relate. Answers may be syntactically correct but semantically wrong.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/7g3ewdoxn51kz0hcadce.png)

A semantic layer changes this dynamic. It provides shared definitions, governed access, and a consistent abstraction over raw data. Instead of retrieving arbitrary documents, AI agents retrieve *meaningful concepts*.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/dlu6sjseno7sy7hxpqhi.png)

This reduces ambiguity. It improves trust. It lowers the cognitive load on both users and models.

More importantly, it shifts RAG from document search to reasoning over data.

## From RAG Pipelines to Agentic Architectures

As systems evolve, retrieval alone is not enough. AI agents need to ask follow-up questions, call tools, execute queries, and reason across steps.

This requires structured access to data, not just text chunks. It also requires standard interfaces so agents can operate across clients and environments.

Open protocols like MCP reflect this shift. They decouple AI agents from specific tools and allow shared context to be reused across applications. This moves RAG closer to a platform capability than a one-off pipeline.

In this world, the value is not in where vectors live. The value is in how context is defined, governed, and exposed.

## Conclusion: Stop Optimizing the Wrong Layer

RAG failures rarely come from weak models. They come from weak data foundations.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/hz8ll1791x9z8q6eguw5.png)

Enterprises over-invest in vector infrastructure while under-investing in semantics, governance, and architectural coherence. The result is expensive systems that scale poorly and fail to earn trust.

The most resilient approaches treat RAG as a data platform problem. They start with open storage, shared definitions, hybrid retrieval, and performance optimizations that benefit every workload.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/xjcm3d7ov49ltujhaj9o.png)

This is where lakehouse-native architectures stand out. Platforms like Dremio focus on unifying data access, enforcing semantics, and accelerating queries across sources without duplication. When AI agents are layered on top of that foundation, retrieval becomes simpler, safer, and faster by default.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ojzh2yl2i5ttb4rgdanp.png)

As models continue to improve, data problems will remain. Teams that solve for context, not just embeddings, will be the ones that scale AI beyond demos and into durable systems.
