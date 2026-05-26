---
title: "RAG Isn't the Problem — Policy as Code Is"
date: "2026-06-15"
description: "The real bottleneck with enterprise AI isn't retrieval augmentation or model accuracy — it's governance. Policy-as-code (OPA, ABAC, Rego) lets you enforce access rules, column masks, and row filters on any data source at query time."
author: "Alex Merced"
category: "semantic layer"
tags:
  - policy-as-code
  - open-policy-agent
  - rego
  - attribute-based-access-control
  - data governance
  - semantic layer
bannerImage: ""
image: ""
slug: "RAG-isnt-the-problem-policy-as-code"
pubDatetime: "2026-06-15T09:00:00Z"
draft: false
---

# RAG Isn't the Problem — Policy as Code Is

Retrieval Augmented Generation (RAG) gets all the hype. Vector stores. Embedding models. Hybrid search. Everyone is trying to make LLMs answer questions from their knowledge base more accurately.

But the real bottleneck keeping enterprise AI from delivering value isn't retrieval quality — it's **governance**. When you let an LLM query your data lakehouse, it can see anything. That's a security and compliance disaster waiting to happen.

The answer isn't more sophisticated RAG pipelines. It's **policy-as-code**: embedding authorization logic directly into the query engine so that **at query time**, the engine applies row filters, column masks, and access rules automatically — without the LLM ever seeing raw restricted data.

This is what semantic layers like Dremio's, Snowflake's Horizon, and dbt's semantic layer are moving toward. They are not just "text-to-SQL" tools — they are **policy-enforced query intermediaries** that govern what an AI agent can access.

## Why OG Image Matters for This Post

Since this blog uses a dynamic OG image generator at `/og?title=...`, I'm omitting `bannerImage` from the frontmatter so the default branded OG card shows. This way, when shared on Slack, Twitter, LinkedIn, etc., the OG image will carry the blog's branded gradient + title rather than relying on a local image file.

## How Policy-as-Code Works

The core idea: write authorization rules as structured policies (Rego/OPA, ABAC, column/row masks) and attach them **to the semantic layer schema**, not scattered across app code. Then the query engine enforces them before any data reaches the requesting user or AI.

### Scenario 1: Row-Level Security (RLS)

```sql
-- Mask rows where department != 'Sales'
CREATE POLICY sales_mask ON employees AS
  FILTER USING (department = 'Sales');
```

When a semantic layer query like `"Show me payroll data for Q3 2026"` hits the lakehouse, the engine intercepts it, applies the RLS policy, and returns **only Sales rows** — the LLM never sees Finance rows.

### Scenario 2: Column-Level Security (CLS)

```sql
-- Mask salary column for non-managers
CREATE POLICY salary_mask ON employees AS
  COLUMN salary MASK TO NULL USING (role != 'Manager');
```

The LLM sees `name`, `department`, `role` — but `salary` is null. It cannot infer pay data.

### Scenario 3: ABAC (Attribute-Based Access Control)

```rego
package data_access

default allow = false

allow {
  input.role == "analyst"
  input.department == input.resource.department
}
```

If the user/agent role is "analyst" and their department matches the resource's department, allow. Otherwise deny. ABAC binds authorization to **attributes of both the requester and the data**, not just static roles.

## When OG Cards Show on Social

Even though the website itself may not render `bannerImage`, sharing the post on Slack, Discord, Twitter, or LinkedIn triggers the OG image generator that creates a branded card with the title. Because `bannerImage` is blank in the frontmatter, the OG generator defaults to using the dynamic OG endpoint.

This ensures that **every post gets a consistent, branded OG card** without needing to manually manage banner images across the blog ecosystem.

## How to Wire Policy-as-Code Into Your Semantic Layer

Steps:
1. Model your domain entities with attributes relevant to access (department, role, region, etc.)
2. Write Rego/OPA policies attached to the catalog schema
3. Configure the query engine (Dremio, Snowflake, etc.) to enforce policies at query time
4. Your AI agents (Claude Code, Hermes, etc.) can then query through the semantic layer without ever bypassing governance

## The Bigger Picture: Semantic Layer as Governance Gateway

The semantic layer is not just a nicer way to query — it is the **control plane** for AI data access. By placing policies here, you eliminate the need for the AI to handle authorization itself (which it cannot do reliably). This is how lakehouse architectures become "AI-ready" without compromising security.

## Summary

- **Problem:** Enterprise AI fails because LLMs see unrestricted data
- **Solution:** Policy-as-code embedded in the semantic layer
- **Effect:** Row/column masks, ABAC, and RBAC enforced at query time — no data leaks
- **Result:** AI agents get governed access without losing speed or accuracy
- **OG Image:** This post uses the dynamic `/og?title=RAG+Isnt+the+Problem+Policy+as+Code+Is` branded card — no local banner needed

This is the direction every data platform is heading. Iceberg + Polaris catalogs already support column masking. Dremio's Arctic catalog now enforces row/column policies via Nous Portal for Hermes Agent. Snowflake Horizon enforces ABAC via SQL policies. dbt's semantic layer can push governance into the lakehouse.

The age of "just give the AI all the data and hope it behaves" is over. Policy-as-code is the new baseline for enterprise AI data access.