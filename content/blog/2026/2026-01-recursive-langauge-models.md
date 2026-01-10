---
title: What Are Recursive Language Models?
date: "2026-01-10"
description: Recursive Language Models (RLMs) are a new class of language models that can call themselves to break down complex tasks into manageable parts. This article explores how RLMs work, the problems they solve, and why they represent a significant shift in language model capabilities.
author: "Alex Merced"
category: "AI"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - artificial intelligence
  - language models
  - machine learning
  - recursion
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

Recursive Language Models (RLMs) are language models that call themselves.

That sounds strange at first—but the idea is simple. Instead of answering a question in one go, an RLM breaks the task into smaller parts, then asks itself those sub-questions. It builds the answer step by step, using structured function calls along the way.

This is different from how standard LLMs work. A typical model tries to predict the full response directly from a prompt. If the task has multiple steps, it has to manage them all in a single stream of text. That can work for short tasks, but it often falls apart when the model needs to remember intermediate results or reuse the same logic multiple times.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/xqzdf2stxn61a1jhjcd6.png)

RLMs don’t try to do everything at once. They write and execute structured calls—like `CALL("question", args)`—inside their own output. The system sees this call, pauses the main response, evaluates the subtask, then inserts the result and continues. It’s a recursive loop: the model is both the planner and the executor.

This gives RLMs a kind of dynamic memory and control flow. They can stop, plan, re-enter themselves with new input, and combine results. That’s what makes them powerful—and fundamentally different from the static prompting methods most models use today.

## What Problem Do RLMs Solve?

Language models are good at sounding smart. But when the task involves multiple steps, especially ones that depend on each other, standard models often fail.

Why? Because they generate everything in a straight line.

If you ask a regular LLM to solve a logic puzzle, it has to juggle the entire solution in one pass. There’s no mechanism to stop, break the task apart, and reuse parts of its own reasoning. It has no structure—just one long stream of text.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/nqyodm8imk6zrniirz3h.png)

Prompt engineering helps, but only up to a point. You can ask the model to “think step by step” or “show your work,” and that can improve results. But these tricks don’t change how the model actually runs. It still generates everything in one session, with no built-in way to modularize or reuse logic.

Recursive Language Models change this. They treat complex tasks as programs. The model doesn’t just answer—it writes code-like calls to itself. Those calls are evaluated in real time, and their results are folded back into the response.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/9mrs3yiylirta0d7mp4b.png)

This lets RLMs:
- Reuse their own logic.
- Focus on one part of the task at a time.
- Scale to deeper or more recursive problems.

In other words, RLMs solve the structure problem. They bring composability and control into language generation—two things that most LLMs still lack.

## How Do RLMs Actually Work?

At the core of Recursive Language Models is a simple but powerful loop: generate, detect, call, repeat.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/is9rohgc2g1lbt2nrvvb.png)

Here’s how it plays out:

1. **The model receives a prompt.**
2. **It starts generating a response.**
3. **When it hits a subtask, it emits a structured function call**—something like `CALL("Summarize", "text goes here")`.
4. **The system pauses**, evaluates that call by feeding it back into the same model, and gets a result.
5. **The result is inserted**, and the original response resumes.

This process can happen once—or dozens of times inside a single response.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/r8r9qwefzhnhr8bxxyyb.png

Let’s take a concrete example. Suppose you ask an RLM to explain a complicated technical article. Instead of trying to summarize the whole thing at once, the model might first break the article into sections. Then it could issue recursive calls to summarize each section individually. After that, it could combine those pieces into a final answer.

So what’s actually new here?

- The model isn’t just generating text. It’s *controlling execution*.
- Each function call is explicit and machine-readable. It’s not hidden in plain text.
- The model learns not just *what* to say, but *when* to delegate subtasks to itself.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/3oreu6lmnf9ui304nhs8.png)

This design introduces modular reasoning. It’s closer to programming than prompting. And it’s what makes RLMs capable of solving longer, deeper, and more compositional tasks than traditional LLMs.

## How Are RLMs Different From Reasoning Models?

It’s easy to confuse Recursive Language Models with models designed for reasoning. After all, both aim to solve harder, multi-step problems. But they take very different paths.

Reasoning models try to think better within a fixed response. They rely on prompting tricks (“Let’s think step by step”), fine-tuning, or architectural tweaks to encourage more logical answers. But they still generate their full output in one go. There’s no built-in structure or recursion—just better text generation.

Recursive Language Models go further. They change how language models *run*, not just how they *think*.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/9ki8oqyq0gpy55b4kykg.png)

Here’s the key distinction:

- **Reasoning models** operate in a flat, linear space. They can simulate step-by-step thinking, but they don’t control execution.
- **RLMs** introduce a real control flow. They can pause, emit a sub-call, re-enter themselves, and build results incrementally.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/qys887jwi9f157l5rg3q.png)

Think of it this way: reasoning models try to write better essays. RLMs write and run programs.

This also makes RLMs easier to inspect and debug. Each recursive call is explicit. You can see the full tree of operations the model performed—what it asked, what it answered, and how it combined the results. That transparency is rare in LLM workflows, and it opens the door to more robust systems.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/0akxrwtfly8hqkn5opxt.png)

So while reasoning models stretch the limits of static prompting, RLMs redefine what a model can do at runtime.

## Why Recursion Changes What LLMs Can Do

Recursion isn’t just a technical upgrade—it’s a shift in what language models are capable of.

With recursion, models don’t have to guess the whole answer in one pass. They can build it piece by piece, reusing their own capabilities as needed. This unlocks new behaviors that standard models struggle with.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/byceucjiz5m6nl13e57b.png)

Here’s what that looks like in practice:

- **Logic puzzles**: Instead of brute-forcing a full solution, an RLM can write out each rule, evaluate sub-cases, and combine the results.
- **Math word problems**: The model can break a complex problem into steps, solve each one recursively, and verify intermediate answers.
- **Code generation**: RLMs can draft a function, then call themselves to write test cases, fix bugs, or generate helper functions.
- **Proof generation**: For theorem proving, recursion lets the model build a proof tree, checking smaller lemmas along the way.

In the paper’s experiments, RLMs outperformed non-recursive baselines on multi-step benchmarks. They were also *more efficient*. Recursive calls reduced total token usage, because the model could reuse logic instead of repeating it .

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/q6896v8g85mmclp8ipqd.png)

This is a key point: recursion isn’t just about accuracy. It’s also about *efficiency* and *composability*. Instead of scaling linearly with problem size, RLMs can scale logarithmically by solving smaller pieces and reusing solutions.

That makes them a better fit for tasks where reasoning depth grows quickly—exactly the kind of problems LLMs are starting to face in real-world applications.

## Why This Matters Now

Language models are everywhere—but most still follow a simple pattern: input goes in, output comes out. That’s fine for quick answers or lightweight tasks. But for anything complex, it’s not enough.

Today, developers are building agents, chains, and tool-using systems on top of LLMs. These wrappers simulate structure, but they’re often fragile. They rely on prompt hacking, regex parsing, and external orchestration to manage what the model can’t do natively.

Recursive Language Models offer a cleaner path. Instead of bolting on structure from the outside, they build it in.

This matters for a few reasons:

- **Fewer moving parts**: RLMs remove the need for external chains or custom routing logic. The model decides when and how to branch.
- **Greater transparency**: Each recursive call is visible and traceable. You can audit what the model did, step by step.
- **Better generalization**: Once trained to use recursion, the model can apply it flexibly across domains—math, code, reasoning, even planning.

And we’re just getting started. RLMs are early, but they hint at a broader shift: treating models not just as generators, but as runtime environments. That opens the door to future systems where models can plan, act, and adapt on their own, with clear structure behind every step.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/u2g8vytnrdnb5czywiiv.png)

If the last few years were about making LLMs sound smart, the next few might be about making them *think* with structure. That’s where recursion fits in.

## Conclusion: A New Way to Think with Language Models

Recursive Language Models aren’t just a tweak to existing LLMs. They represent a shift in how models operate.

Instead of treating every task as a one-shot prediction, RLMs break problems into parts, solve them recursively, and combine the results. That gives them something most language models still lack: structure.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/59pdnsjnqmulb1dlrq53.png)

This structure matters. It makes models more reliable on complex tasks. It makes their reasoning easier to follow. And it opens the door to new capabilities—like planning, verifying, or adapting—without needing complex external systems.

We’re still early in this space. But the idea is simple and powerful: give models the tools to use themselves. From there, a new class of language systems can emerge—not just fluent, but recursive, modular, and built to handle depth.

RLMs don’t just make better answers. They make better models.


