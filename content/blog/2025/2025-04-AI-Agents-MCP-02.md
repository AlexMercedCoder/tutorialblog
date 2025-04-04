---
title: A Journey from AI to LLMs and MCP - 2 - How LLMs Work — Embeddings, Vectors, and Context Windows
date: "2025-04-06"
description: "How LLMs Work — Embeddings, Vectors, and Context Windows"
author: "Alex Merced"
category: "AI"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - AI
  - ML
  - Python
  - MCP
  - AI Agents
---

## Free Resources  
- **[Free Apache Iceberg Course](https://hello.dremio.com/webcast-an-apache-iceberg-lakehouse-crash-course-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=AItoLLMS&utm_content=alexmerced&utm_term=external_blog)**  
- **[Free Copy of “Apache Iceberg: The Definitive Guide”](https://hello.dremio.com/wp-apache-iceberg-the-definitive-guide-reg.html?utm_source=ev_external_blog&utm_medium=influencer&utm_campaign=AItoLLMS&utm_content=alexmerced&utm_term=external_blog)**  
- **[2025 Apache Iceberg Architecture Guide](https://medium.com/data-engineering-with-dremio/2025-guide-to-architecting-an-iceberg-lakehouse-9b19ed42c9de)**  
- **[How to Join the Iceberg Community](https://medium.alexmerced.blog/guide-to-finding-apache-iceberg-events-near-you-and-being-part-of-the-greater-iceberg-community-0c38ae785ddb)**  
- **[Iceberg Lakehouse Engineering Video Playlist](https://youtube.com/playlist?list=PLsLAVBjQJO0p0Yq1fLkoHvt2lEJj5pcYe&si=WTSnqjXZv6Glkc3y)**  
- **[Ultimate Apache Iceberg Resource Guide](https://medium.com/data-engineering-with-dremio/ultimate-directory-of-apache-iceberg-resources-e3e02efac62e)** 

In our last post, we explored the evolution of AI—from rule-based systems to deep learning—and how **Large Language Models (LLMs)** like GPT-4 and Claude represent a transformative leap in capability.

But how do these models *actually* work?

In this post, we’ll peel back the curtain on the inner workings of LLMs. We’ll explore the fundamental concepts that make these models tick: **embeddings**, **vector spaces**, and **context windows**. You’ll walk away with a clearer understanding of how LLMs “understand” language—and what their limits are.

## How LLMs Think: It’s All Math Underneath

Despite their fluent text output, LLMs don’t truly "understand" language in the human sense. Instead, they operate on numerical representations of text, using vast networks of mathematical weights to predict the next word in a sequence.

The key mechanism behind this: **transformers**.

Transformers revolutionized NLP by allowing models to weigh the relevance of each word in a sentence—**attention mechanisms**—instead of processing words one-by-one like RNNs.

Here’s the simplified flow:
1. Text is **tokenized** (split into chunks)
2. Tokens are converted into **embeddings** (vectors)
3. Those vectors pass through **layers of attention** to capture meaning
4. The model generates the next token based on probability

But what are these **embeddings** and why do they matter?

## Embeddings: From Words to Numbers

Before an LLM can do anything with language, it must convert words into numbers it can operate on.

That’s where **embeddings** come in.

### What is an embedding?
An embedding is a **high-dimensional vector** (think: a long list of numbers) that represents the meaning of a word or phrase.

Words with similar meanings have **similar embeddings**.

For example:
```
Embedding("dog") ≈ Embedding("puppy") Embedding("Paris") ≈ Embedding("London")
```

These vectors live in an abstract **vector space**, where distance encodes similarity.

LLMs use embeddings not just for input, but throughout every layer of their neural network to understand relationships, context, and meaning.

## Vector Search and Semantic Understanding

Because embeddings encode meaning, they’re also incredibly useful for **semantic search**.

Instead of matching exact words (like keyword search), vector search compares embeddings to find text that’s *conceptually* similar.

For example:
- Query: "How do I fix a leaking pipe?"
- Match: "Plumbing repair for minor water leaks"

Even though the words don’t overlap, the **meaning** does—and that’s what embeddings capture.

This is the foundation for many powerful AI techniques like:
- **Document similarity**
- **Retrieval-Augmented Generation (RAG)** (more on this in Blog 3)
- **Context injection from external data sources**

## Context Windows: The Model’s Working Memory

Another crucial concept in LLMs is the **context window**—the maximum number of tokens the model can “see” at once.

Every input to an LLM gets broken into **tokens**, and the model has a limited capacity for how many tokens it can process per request.

| Model        | Max Context Window |
|--------------|--------------------|
| GPT-3.5      | 4,096 tokens (~3,000 words) |
| GPT-4 Turbo  | Up to 128,000 tokens |
| Claude 3 Opus| Up to 200,000 tokens |

If you go over the limit, you’ll need to:
- Truncate input (losing information)
- Summarize
- Use techniques like RAG or memory management

> **TL;DR**: The larger the context window, the more the model can “remember” during a conversation or task.

## Limitations of Embeddings and Context Windows

Even though LLMs are powerful, they come with trade-offs:

### Embedding limitations:
- Don’t always reflect **nuanced context** (e.g., sarcasm, tone)
- Fixed dimensionality: can’t represent *everything*
- Require separate handling for different modalities (text vs images)

### Context window limitations:
- Long documents may get truncated or ignored
- Memory is *not* persistent—everything resets after a session unless you manually re-include previous context
- More tokens = higher latency and cost

These limits are precisely why so much effort goes into **enhancing** LLMs through fine-tuning, retrieval systems, and smarter prompt engineering.

We’ll dive into that next.

## Recap: Key Concepts from This Post

| Concept         | What It Is                                 | Why It Matters                            |
|------------------|---------------------------------------------|---------------------------------------------|
| Embeddings      | Vector representations of tokens/text      | Enable semantic understanding & search     |
| Vector Space     | Mathematical space where embeddings live  | Allows similarity comparison & clustering  |
| Context Window   | Max token size per LLM input               | Defines how much the model can “see”       |
| Attention        | Weighs token relationships dynamically     | Enables context awareness in LLMs          |

## 🔮 Up Next: Making LLMs Smarter with Fine-Tuning, Prompt Engineering, and RAG

In our next post, we’ll show how to **enhance LLM performance** using proven techniques:
- Fine-tuning
- Prompt engineering
- Retrieval-Augmented Generation (RAG)

These strategies help you move beyond limitations—and get the most out of your models.
