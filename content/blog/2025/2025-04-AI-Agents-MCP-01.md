---
title: A Journey from AI to LLMs and MCP - 1 - What Is AI and How It Evolved Into LLMs
date: "2025-04-05"
description: "What Is AI and How It Evolved Into LLMs"
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

Artificial Intelligence (AI) has become the defining technology of the decade. From chatbots to code generators, from self-driving cars to predictive text—AI systems are everywhere. But before we dive into the cutting-edge world of large language models (LLMs), let’s rewind and understand where this all began.

This post kicks off our 10-part series exploring how AI evolved into LLMs, how to enhance their capabilities, and how the **Model Context Protocol (MCP)** is shaping the future of intelligent, modular agents.

## 🧠 A Brief History of AI

The term "Artificial Intelligence" was coined in 1956, but the idea has been around even longer—think mechanical automatons and Alan Turing’s famous question: *"Can machines think?"*

AI development has gone through several distinct waves:

### 1. **Symbolic AI (1950s–1980s)**
Also known as "Good Old-Fashioned AI," symbolic systems were rule-based. Think expert systems, logic programming, and hand-coded decision trees. These systems could play chess or diagnose medical conditions—if you wrote enough rules.

**Limitations**: Rigid, brittle, and poor at handling ambiguity.

### 2. **Machine Learning (1990s–2010s)**
Instead of coding rules manually, we trained models to recognize patterns from data. Algorithms like decision trees, support vector machines, and early neural networks emerged.

This era gave us:
- Spam filters
- Fraud detection
- Recommendation engines

But while powerful, these models still had a hard time with natural language and context.

### 3. **Deep Learning (2010s–Now)**
With more data, better algorithms, and stronger GPUs, neural networks started outperforming traditional methods. Deep learning led to breakthroughs in:
- Image recognition (CNNs)
- Speech recognition (RNNs, LSTMs)
- Language understanding (Transformers)

And that brings us to the latest evolution...

## 🧬 Enter LLMs: The Rise of Language-First AI

Large Language Models (LLMs) like GPT-4, Claude, and Gemini aren’t just another step in AI—they represent a leap. Trained on massive text corpora using **transformer architectures**, these models can:
- Write essays and poems
- Generate and debug code
- Translate between languages
- Answer complex questions

All by predicting the next word in a sentence.

But what makes LLMs so powerful?

## 🏗️ LLMs Are More Than Just Big Neural Nets

At their core, LLMs are massive deep learning models that turn **tokens (words/pieces of words)** into **vectors (mathematical representations)**. Through billions of parameters, they learn the structure of language and the latent meaning within it.

Key components:
- **Tokenization**: Breaking input into chunks the model can process
- **Embeddings**: Mapping tokens to vector space
- **Attention Mechanisms**: Letting the model focus on relevant parts of the input
- **Context Window**: A memory buffer for how much input the model can “see”

Popular LLMs:
| Model     | Provider      | Context Window | Notable Feature |
|-----------|---------------|----------------|------------------|
| GPT-4     | OpenAI        | Up to 128k     | Code + natural language synergy |
| Claude 3  | Anthropic     | Up to 200k     | Strong at instruction following |
| Gemini    | Google DeepMind | ~32k+       | Multimodal capabilities |

## 🧩 What LLMs Can (and Can’t) Do

LLMs are versatile and impressive—but they're not magic. Their strengths come with real limitations:

### ✅ What they’re great at:
- Text generation and summarization
- Conversational interfaces
- Programming assistance
- Knowledge retrieval from training data

### ❌ What they struggle with:
- **Memory**: No persistent memory across sessions
- **Context limits**: Can only “see” a fixed number of tokens
- **Reasoning**: Struggles with complex multi-step logic
- **Real-time data**: Can’t access up-to-date or private information
- **Action-taking**: Can't interact with tools or APIs by default

This is where the next evolution comes in: **augmenting LLMs** with context, tools, and workflows.

## 🔮 The Road Ahead: From Models to Modular AI Agents

We’ve gone from rules to learning, from deep learning to LLMs—but we’re not done yet. The future of AI lies in making LLMs *do more than just talk*. We need to:

- Give them memory
- Let them interact with data
- Enable them to call tools, services, and APIs
- Help them make decisions and reason through complex tasks

This brings us to the idea of **AI Agents**—autonomous systems built on LLMs that can perceive, decide, and act.

### 🧭 Coming Up Next

In our next post, we’ll explore **how LLMs actually work** under the hood—digging into embeddings, vector spaces, and how models “understand” language.

Stay tuned.
