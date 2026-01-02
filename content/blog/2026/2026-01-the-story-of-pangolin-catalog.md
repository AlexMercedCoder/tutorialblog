---
title: Building Pangolin - My Holiday Break, an AI IDE, and a Lakehouse Catalog for the Curious
date: "2025-01-02"
description: "A personal story of how I built Pangolin Catalog over a holiday break using an AI-powered IDE."
author: "Alex Merced"
category: "Data Engineering"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - data lakehouse
  - data engineering
  - apache iceberg
  - apache polaris
  - open source
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

## 1. Introduction: A Holiday, an Agent, and an Idea

In December 2025, Google released something that changed how I code—**Antigravity IDE**. It wasn’t just another brilliant editor. It came packed with AI agents that could write code, test it, refactor it, and even debug alongside you. Naturally, I had to try it out.

I didn’t jump right into building a big project. Instead, I used it to make some tooling for [Dremio](https://www.dremio.com) and [Apache Iceberg](https://iceberg.apache.org), both technologies I work with frequently. That experience set the foundation for something bigger: [**Pangolin**](https://pangolincatalog.org), an open-source, feature-rich lakehouse catalog.

This blog tells the story of how Pangolin came to be. It’s not a pitch for production use. It’s a working concept, a glimpse into what’s possible.

![The Pangolin Journey Begins](https://i.imgur.com/ZnXcL8e.png)

## 2. First Steps: Learning to Trust the Agent

Before Pangolin, I started small. I needed to understand how to work with the Antigravity coding agent in a way that felt predictable and collaborative. So I created four tools:

- [**dremioframe**](https://github.com/developer-advocacy-dremio/dremio-cloud-dremioframe): A DataFrame-style API for building Dremio SQL queries in Python.
- [**iceframe**](https://github.com/AlexMercedCoder/iceframe): A similar API, but for building Iceberg-compatible queries using local compute.
- [**dremio-cli**](https://github.com/developer-advocacy-dremio/dremio-python-cli/blob/main/readme.md): A command-line tool for interacting with Dremio.
- [**iceberg-cli**](https://github.com/AlexMercedCoder/iceberg-cli): A CLI that filled in the gaps left by `pyiceberg`.

These tools weren’t just functional; they became learning tools. I practiced writing clear prompts, specifying inputs and outputs, and most importantly, asking the agent to generate and refine unit, live, and regression tests. I also got better at pushing back when something didn’t work.

Once I felt confident in that workflow, writing specs, prompting the agent, challenging assumptions, and getting results, I was ready to build something bigger.

![Learning to Work with Google's Antigravity](https://i.imgur.com/CcYEQjR.png)

## 3. Rethinking the Lakehouse Catalog

Catalogs are central to the Iceberg ecosystem. They’re how engines discover, manage, and track tables. But most catalogs out there either focus on infrastructure or metadata—not both.

Some great projects inspired Pangolin:

- [**Project Nessie**](https://projectnessie.org): Created at Dremio, Nessie brought Git-like versioning to data catalogs. It’s a brilliant idea that still powers tools like [Bauplan](https://www.bauplanlabs.com). But Nessie doesn’t support features like multi-tenancy or catalog federation.
- [**Apache Polaris**](https://polaris.apache.org): Polaris, co-created by Dremio and Snowflake and now an Apache Incubator project, is well on its way to becoming the open standard. It supports RBAC, catalog federation, generic assets, and upcoming table services that proxy metadata processing.
- **Business metadata platforms (DataHub, Atlan, Collibra, etc.)**: These tools focus on discovery and access workflows, and some now support Iceberg. But they bolt onto a catalog—they don’t start as one.

That got me thinking: *What if a single open source catalog could do it all?*

Pangolin became my experiment to find out.

![What if a data lakehouse catalog had it all?](https://i.imgur.com/vAYnnV5.png)

## 4. Feature List: The Dream Catalog

Before writing a single line of code, I wrote down everything I wanted this catalog to do, the features I admired in other tools, the gaps I noticed, and a few experiments I just wanted to try.

Here’s what ended up on the list:

- **Catalog versioning**, with support for branching and merging, but scoped-branches don't have to affect all tables.
- **Catalog federation**, so one catalog can reference others.
- **Generic asset support**, to register Delta tables, CSV datasets, or even external databases alongside Iceberg tables.
- **Business metadata**, including access requests and grant workflows.
- **Multi-tenancy**, so each team can work in its own isolated space.
- **RBAC and TBAC (tag-based access control)**, to control access based on roles and tags.
- **No-auth mode**, to make it easy to spin up and test locally.
- **Credential vending**, with built-in support for AWS, Azure, GCP, and S3-compatible systems.
- **Pluggable backends**, starting with PostgreSQL and MongoDB for metadata persistence.

That’s a lot. But I didn’t set out to build a polished product—I just wanted to see if it was possible.

![The features I wanted for Pangolin Catalog](https://i.imgur.com/4hxzR01.png)

## 5. Choosing the Stack: Why Rust, Python, and Svelte

With the feature list in hand, the next decision was the tech stack. I know Python and JavaScript like the back of my hand, which would’ve made it easy to move fast. But I wanted something that would scale better—and maybe be a little less error-prone.

I considered three languages for the backend: **Java**, **Go**, and **Rust**.

- Java is the standard in the data world. But writing clean, scalable Java means understanding the JVM inside and out. I know it—but not enough to move quickly.

- Go is simple and efficient. Rust is strict and safe. Between the two, I picked **Rust**.

Rust’s compiler errors are frustrating at first but turn into a superpower. The strong typing and detailed feedback also pair well with AI agents; errors are easier to reason about and fix through prompting.

For the rest of the stack:
- **Rust** powers the backend and CLI.
- **Python** powers the SDK and scripting layer.
- **Svelte** powers the UI—lightweight and reactive, but more complex than I expected once the feature count grew.

All in, I ended up with a full stack that balanced experimentation and real-world usability. The only problem was... building it all over a holiday break.

![The Tech Chosen to Build Pangolin Catalog](https://i.imgur.com/oiv9XeG.png)

## 6. Building It: 100 Hours, Three Interfaces, and a Lot of Feedback Loops

Once I committed to the stack, the pace picked up fast. I spent roughly 100 hours on Pangolin, which ended up taking most of my holiday break. The backend came together first, followed by the Rust-based CLI and then the Python SDK.

The backend covered all the core ideas: catalogs, tenants, assets, access rules, and credential vending. Rust helped here. The compiler forced clarity. Each time something felt vague, the type system pushed back until the design made sense.

The Python SDK turned out better than I expected. It didn’t just wrap the API. It made some features practical. Generic assets are a good example. Through the SDK, those assets became usable for sharing database connections, Delta tables, CSV datasets, and other non-Iceberg data without much friction.

The hardest part was the UI.

With so many features, state management became tricky fast. I used Antigravity’s browser agent early on, and it helped catch basic issues. Once the UI grew more complex, manual testing worked better. I spent a lot of time clicking through edge cases, capturing network requests, reading console errors, and feeding that context back to the agent. It was slower, but it worked.

By the end, Pangolin had three real interfaces: a Rust CLI, a Python SDK, and a Svelte UI. All of them worked against the same API and feature set.

![100 hours developing Pangolin Catlaog](https://i.imgur.com/AwXP27Y.png)

## 7. What Pangolin Is—and What It Isn’t

Pangolin exists. You can run it. You can click around, create catalogs, register assets, request access, and vend credentials across clouds.

![Pangolin Catalog Exists](https://i.imgur.com/yWDNUcd.png)

That said, I don’t see Pangolin as a production catalog. I don’t plan to invest heavily beyond bug fixes and minor improvements. For a truly open, production-ready lakehouse catalog, Apache Polaris is still the best option today. If you want a managed path, platforms like Dremio Catalog, which build on Polaris, handle the complex parts for you.

Pangolin serves a different purpose. It’s a proof of concept. It shows what can happen when a community-oriented project tries to bring versioning, federation, governance, business metadata, and access workflows together in one place.

If you’re a lakehouse nerd like me, Pangolin might be fun to explore. If it sparks ideas or nudges other projects to co-locate these features sooner, then it did its job.

[Make sure to follow me on linkedin and substack](https://www.alexmerced.com/data)

![Pangolin Catalog is a Question Made Real](https://i.imgur.com/81PKZJp.png)
