---
title: "Fast Classification Models, LLMs, and the Apache Iceberg Lakehouse"
date: "2026-09-21"
description: "How fast classification models like Jev alongside open alternatives such as GLiClass compare with LLMs, and how to run both together inside an Apache Iceberg lakehouse."
author: "Alex Merced"
category: "AI"
canonical: https://iceberglakehouse.com/posts/jev-classification-models-iceberg-lakehouse/
tags:
  - Apache Iceberg
  - AI
  - LLM
  - classification
  - data engineering
  - Jev
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/jev-classification-models-iceberg-lakehouse/).

Open the bill for any team that has put a large language model into a data pipeline and look at what the calls are doing. A big share of them are not writing anything. They are answering questions with a short, fixed set of answers. Is this support ticket about billing or about an outage? Does this review mention a safety problem? Is this row of free text a complaint, a question, or a compliment? The team sends a paragraph of context, a paragraph of instructions, and a request for JSON. The model spends seconds generating tokens, the pipeline parses the JSON, and sometimes the JSON comes back broken.

That pattern works. It is also slow and expensive for what it delivers, and it gets worse at lakehouse scale, where the "input" is not one ticket but forty million rows in an Apache Iceberg table.

In September 2026 a company called TypeSafe AI released Jev, a model built only for this kind of question. It does not chat. It returns a choice, a score, or a yes/no probability, with calibrated confidence attached. Within days, several open-source projects appeared that copy its interface on models you can run yourself.

This article covers what these classification models are, how they differ from LLMs, where the open alternatives stand, and how to use both kinds of model together inside an Iceberg lakehouse. A quick note on affiliation: I work at Dremio, which ships SQL AI functions for this kind of work. Dremio shows up here as one worked example. The patterns apply to any engine that reads Iceberg.

## Why So Much LLM Spend Goes to Questions With Fixed Answers

Text classification is one of the oldest jobs in applied machine learning. Before 2023, most teams handled it in one of three ways.

The first was rules. Keyword lists, regular expressions, and lookup tables. Rules are fast and cheap, and anyone can read them. They also break the moment a customer writes "I am not asking for a refund." A rule that fires on the word "refund" gets that sentence wrong every time.

The second was a fine-tuned encoder model. BERT (Bidirectional Encoder Representations from Transformers) and its descendants read a whole passage at once and produce a label in a single forward pass. A fine-tuned BERT classifier runs in milliseconds on a modest GPU. The cost is up front. You need a few thousand labeled examples per task, a training pipeline, and a person who knows how to evaluate it. When the business adds a new category, you label more data and train again.

The third was zero-shot classification with NLI (natural language inference) models. You phrase each label as a hypothesis, such as "This text is about billing," and the model scores how strongly the input entails it. This needs no training data, but accuracy on messy, domain-specific text is uneven.

Then instruction-tuned LLMs arrived and changed the economics of the second and third options. You no longer needed labeled data or a training run. You wrote a prompt, listed the categories, and asked for JSON. Accuracy on common-sense judgments jumped. For a prototype, nothing else came close.

The trouble shows up in production. An autoregressive LLM produces output one token at a time. Every label, every brace, and every quote mark in the JSON is a separate step through the model. Reasoning models add a chain of thought before the answer, which multiplies the token count again. A classification that needs one bit of information ends up costing hundreds of output tokens.

There are three other costs that are easy to miss. The first is parsing. The model returns text, and your code has to turn it into a typed value. Structured output modes help, but the model still generates the text and a validator still checks it. The second is invented labels. Ask for one of five categories and a generative model sometimes returns a sixth that sounds reasonable. The third is the confidence problem. An LLM that says "billing" gives you no reliable number for how sure it is. Token log probabilities exist on some APIs, but they are not calibrated for this purpose, and many hosted APIs do not expose them at all.

In a single request/response app, these costs are annoying. In a lakehouse pipeline, they compound. If a nightly job classifies two million new rows with a frontier LLM, the latency sets how long the job runs, the per-token price sets the bill, and the lack of confidence scores means every label looks equally trustworthy in the downstream table. An analyst building a dashboard on those labels has no way to filter out the shaky ones.

That gap between "the LLM can do this" and "the LLM is the right tool for this" is where the new classification models live.

## What Jev Is and How It Works

Jev comes from TypeSafe AI, a company founded by Diogo Almeida, a former OpenAI researcher and one of the authors of the InstructGPT paper. TypeSafe calls Jev a "System One model." The name borrows from Daniel Kahneman's split between fast, intuitive thinking (System 1) and slow, deliberate reasoning (System 2). Reasoning LLMs are System 2 tools. Jev is built for the quick judgments.

The interface has three parts.

**State.** The content you want judged. This can be a string, a JSON object, or an array of text values. A support ticket, a product review, a row from a table serialized as JSON, or a retrieved document all work as state.

**Questions.** A map of named questions. Each question has a type, instructions, and criteria. You choose the question names, and the answers come back under the same names. The model never sees the names themselves.

**Answers.** One typed answer per question, with probabilities.

There are three question types, and picking the right one is most of the design work.

A **Choice** picks one option from a set you define. The criteria are a map from option names to descriptions. TypeSafe's documentation allows up to 255 options per Choice. The answer contains the selected option, a probability for every option, and a confidence value. If you ask which team owns a ticket and list billing, returns, and shipping, the answer is always one of those three. It cannot be a fourth.

A **Score** rates something against an ordered rubric. The criteria are an ordered list of level descriptions, from 2 to 10 levels. Urgency, quality, relevance, and frustration are natural fits. The answer is the level index, a probability per level, and a confidence value.

A **Noul** is a yes/no question. The answer is the probability that the statement is true. You can optionally describe what "true" and "false" mean. The unusual name is TypeSafe's own term, and it shows up in their SDKs as `Noul`.

The model processes the state once and evaluates every question against it in parallel. This detail matters a great deal for cost. Asking ten questions about one ticket in a single request costs barely more wall-clock time than asking one. TypeSafe's docs push this pattern hard and call it speculative fan-out. You ask every question your code has any use for, including ones that only matter for certain branches, and your code ignores the answers it does not use.

TypeSafe has said little about the architecture. Public material mentions a new model design, a parallel sampler, and a training method called RLCD (reinforcement learning for calibrated decisions). Coverage from the launch describes it as non-autoregressive, meaning it does not generate output one token at a time. The practical result is latency in the range of roughly 70 to 500 milliseconds per call, versus seconds for a frontier model producing JSON.

### The numbers that matter for pipeline design

At the time of writing, the current version is `jev-1.13.0`, reachable through the alias `jev-latest`. The published limits shape how you build around it:

- **Price.** TypeSafe charges only for input tokens, at $0.042 per million. Output tokens are free.
- **Rate limits.** 250,000 tokens per second and 1,200 requests per minute. TypeSafe warns these limits are changing as demand grows.
- **Context.** 64,000 tokens per request in total, and 32,000 tokens for the state plus the longest single question.
- **Input.** Text only. No images, audio, or video.

Access is through `POST https://api.typesafe.ai/v1/systemone`, with official Python and JavaScript SDKs. Early access runs through a waitlist. Gateway products such as LiteLLM and several others have already added pass-through support.

On accuracy, TypeSafe's own four-workflow benchmark puts Jev at 67.8 percent. That is roughly tied with GPT-5.6 Terra at 67.9 percent, and a few points behind GPT-5.6 Sol at 74.1 percent and Claude Opus 5 at 73.1 percent. Read that plainly. Jev is not smarter than frontier models. It lands near a mid-tier LLM on decision tasks while running at a small fraction of the cost and time. That tradeoff is the whole pitch.

Independent testers have published early numbers that line up with the pitch. One team ran seven classification rules across 1,000 emails in about 6 seconds for 9 cents once they parallelized requests. A comparable single-category run on a GPT-5.6-class model took roughly 5 minutes and cost 62 cents. Treat third-party benchmarks from launch week with care, but the direction is consistent across reports.

### What Jev does not do

Jev does not generate text. It does not explain its answers. It does not do arithmetic well, and TypeSafe says so directly. It reads dates as text, so comparing two dates or checking whether one falls in a window is unreliable. It cannot be fine-tuned on your data. The same weights serve every account, and you shape behavior through the state, instructions, and criteria you send.

That last point is a real difference from the BERT approach. You do not own a model. You own a set of well-written questions. For many teams that is a better asset, because questions are cheap to change and easy to review in a pull request.

## Calibration Is the Feature That Changes Pipeline Design

Speed and price get the headlines. For data engineers, the more important property is calibration.

A model is calibrated when its probabilities match reality. If a calibrated model says "billing" with 0.8 probability across a thousand tickets, about 800 of those tickets are about billing. A model that is overconfident says 0.95 and is right 70 percent of the time. A model that gives no probability at all leaves you guessing.

Jev returns two related numbers, and they mean different things.

**Probabilities** describe the distribution across options. For a Choice with three options, you get three numbers that sum to 1. For a Noul, you get one number, the chance the answer is yes.

**Confidence** summarizes how peaked that distribution is. A single spike on one option gives confidence near 1. Probability spread across several options gives low confidence. TypeSafe's docs show a ticket that mentions both a wrong size and a double charge. The department question returns "returns" at 0.61 and "billing" at 0.35, with confidence of 0.42. The model is telling you, correctly, that the ticket belongs to two teams.

This changes what you can do with the output. With an uncalibrated LLM label, your choices are to trust it or re-check everything. With a calibrated probability, you get a dial. Rows above 0.9 flow straight into the published table. Rows between 0.5 and 0.9 get labeled but flagged. Rows below 0.5 go to a more expensive model or a human. TypeSafe calls this confidence-gated routing, and it is the single most useful pattern in their docs.

The dial also changes analytics. A dashboard that counts "tickets about billing this week" usually treats each label as a fact. With probabilities stored in the table, you have two better options. You can count only labels above a threshold and report the coverage alongside the count. Or you can sum the probabilities themselves, which gives an expected count that accounts for uncertainty. If a thousand tickets each carry a 0.3 probability of churn language, the expected number of churn-signal tickets is 300, even though no single ticket crosses a 0.5 threshold. For trend analysis over large volumes, the expected count is often the more honest number.

Calibration is not magic, and it is not permanent. It holds on the kind of data the model was trained and tested on. On text far from that data, such as a domain full of internal jargon or a language other than English, probabilities drift. TypeSafe states that English is the primary training language and that other languages work less well. The fix is the same one statisticians have always used. Keep a labeled sample of your own data, compare predicted probabilities against actual outcomes, and check the gap on a schedule. The operational section below covers how to do that with an Iceberg table.

## The Open-Source Alternatives

Jev is closed. TypeSafe has not released weights or training code and has not announced plans to. For teams that need to run classification inside their own network, or that do not want a waitlist between them and production, the open ecosystem moved fast. It helps to split the options into two groups: established zero-shot classifiers that predate Jev, and new projects that copy Jev's interface.

### Established open zero-shot classifiers

**GLiClass** from Knowledgator is the most mature option in this space. It is a zero-shot sequence classifier inspired by GLiNER, the open named-entity model. GLiClass encodes the text and all candidate labels together and scores every label in a single forward pass. The model card reports performance comparable to a cross-encoder with much lower compute. The `gliclass-modern-base-v2.0` checkpoint uses ModernBERT-base as its backbone, has about 151 million parameters, and is trained on synthetic and commercially licensed data. The v3.0 checkpoints add training on logic tasks. It supports single-label and multi-label classification, and it doubles as a reranker for RAG (retrieval-augmented generation) pipelines. At that size it runs on CPU for modest volumes and flies on a single GPU.

**NLI-based zero-shot models**, such as DeBERTa-v3 checkpoints fine-tuned on entailment datasets, remain a solid baseline. They are well understood, license-friendly, and supported directly by the Hugging Face `zero-shot-classification` pipeline. Their weakness is cost per label. Each candidate label becomes a separate premise and hypothesis pair, so a 50-option taxonomy means 50 forward passes per row.

**CAPPr** (completion after prompt probability) takes a different route. It uses any open causal language model, but instead of letting the model generate, it scores the probability of each candidate completion. This turns a generative model into a classifier with a fixed output set. It is slower than an encoder model but works with whatever open LLM you already serve.

### New projects that copy Jev's interface

Several projects appeared within days of the Jev launch. All of them are independent. None contain Jev's weights or its RLCD method, and most say so plainly in their READMEs. They are worth watching and not yet worth betting a production pipeline on without your own evaluation.

**OpenJev (zhangcy122)** wraps open LLMs behind the Choice, Noul, and Score interface. It enforces the output schema with constrained decoding through vLLM or SGLang, pulls log probabilities for each candidate, and applies temperature or Platt scaling to calibrate them. It adds an abstention layer so the system can say "unknown" instead of guessing. The recommended setup runs small models with thinking turned off and escalates to a large model only when confidence falls below a threshold.

**Verdict** (published on Hugging Face as `rlcd-modernbert-151m`) is a 151-million-parameter model built on the GLiClass ModernBERT checkpoint and post-trained with an approach inspired by RLCD. It reports single-pass latency under 35 milliseconds and supports up to 24 options plus an explicit abstention slot. Its authors claim wins over Jev on their own typed-decision benchmarks. Those claims are self-reported and have not been independently reproduced.

**Open JEV (zhihz)** is a research preview that runs a frozen Qwen3-4B-Instruct model to score candidate answers in English and Chinese. Its README is refreshingly direct that no matched comparison against Jev, GLiClass, or CAPPr has been completed.

**poorjev** reproduces the three question types on top of NLI models and focuses on honest confidence. It applies temperature scaling and conformal abstention and publishes a calibration evaluation showing expected calibration error dropping from 0.170 to 0.071 with no accuracy loss.

The table below summarizes the tradeoffs as they stand in September 2026.

| Option | Runs where | Typical size | Output calibration | Needs training data | Maturity |
|---|---|---|---|---|---|
| Jev (TypeSafe) | Hosted API | Undisclosed | Trained for it (RLCD) | No | New, early access |
| GLiClass | Self-hosted | 151M and up | Raw scores, calibrate yourself | No (optional fine-tune) | Established, paper published |
| NLI zero-shot (DeBERTa) | Self-hosted | 180M to 435M | Raw scores, calibrate yourself | No | Established |
| CAPPr on an open LLM | Self-hosted | Any causal LM | Log probabilities, calibrate yourself | No | Established |
| OpenJev and similar clones | Self-hosted | Varies | Post-hoc scaling | No | Days to weeks old |
| Fine-tuned ModernBERT | Self-hosted | 150M to 400M | Good on in-domain data | Yes | Established |

The honest summary is this. If you need a general-purpose decision model today and can send data to a hosted API, Jev is the most polished option. If data must stay inside your network, GLiClass plus your own calibration step is the most defensible choice. If you have a stable task with thousands of labeled examples, a fine-tuned ModernBERT classifier still beats every zero-shot option on accuracy per dollar. The Jev clones are promising experiments.

## Which Job Goes to Which Model

The cleanest way to decide is to look at the shape of the answer, not the difficulty of the question.

If the set of possible answers is known before the model runs, a classification model is the default. Routing, tagging, filtering, scoring, deduplication decisions, and policy checks all fit. The answer is a label, a level, or a probability, and your code branches on it.

If the answer is new content, you need a generative model. Summaries, explanations, extracted free-text values like a customer's stated reason in their own words, SQL generation, and anything a person will read as prose all belong to an LLM.

A few jobs sit in between, and they are where the most interesting designs come from.

**Extraction with a bounded answer space.** Pulling a date, an amount, or an email address out of text looks like generation, but the answer often comes from a small set of candidates. TypeSafe recommends finding candidates with a regular expression or an LLM, then asking the classifier which candidate is correct. Their date extraction pattern turns each date part into a Choice (twelve months, thirty-one days, a bounded year range, plus a "not stated" option) and assembles the date in code.

**Judgments that need multi-step reasoning.** "Is this contract clause more restrictive than our standard terms?" requires comparing two texts and reasoning about what each permits. Classification models struggle with that level of indirection. A reasoning LLM earns its cost here.

**Counting and math.** Neither model type is a calculator. Keep arithmetic in code. If you need to count items that match a condition, ask one yes/no question per item and sum the answers in code.

For data analytics specifically, here is how common lakehouse tasks tend to split:

| Task | Classification model | LLM |
|---|---|---|
| Tag free-text rows by category, sentiment, or intent | Yes, primary tool | Fallback for low-confidence rows |
| Score urgency, quality, or risk on a rubric | Yes | Rarely needed |
| Filter rows for relevance before an expensive step | Yes | No |
| Match entities across two catalogs (same product or not) | Yes, as a three-way Score | For curator explanations |
| Summarize a week of tickets for an executive | No | Yes |
| Generate SQL from a natural language question | Route the request only | Yes |
| Check an LLM's output for grounding or policy | Yes | No |
| Extract a structured record from a PDF | Verify candidates | Extract candidates |

## How the Two Work Together

The strongest designs do not pick one model. They put each model where it is strongest and let code connect them. Four patterns show up again and again.

### Pattern 1: The cascade

Send every row to the cheap, fast classifier first. Read the confidence. Accept high-confidence answers as final. Send the rest to an LLM, and send whatever the LLM is unsure about to a human.

The economics are easy to reason about. If 85 percent of rows clear the confidence gate, the LLM sees 15 percent of the volume. Your LLM bill drops by roughly that ratio, and your pipeline runtime drops even more because the classifier is so much faster. The quality of the final table is set by the LLM on the hard rows, which is where you wanted it spent.

The threshold is a business decision, not a model setting. A threshold of 0.9 sends more rows to the LLM and costs more. A threshold of 0.6 saves money and accepts more errors. Set it by measuring error rates at several thresholds on a labeled sample, then pick the point where the cost of an error and the cost of escalation balance.

### Pattern 2: The router in front of the agent

AI agents that answer questions over lakehouse data make many small decisions per turn. Which tool fits this request? Does this need the semantic layer or a raw table? Is this request asking for data the user is not allowed to see? Is the retrieved context relevant?

Each of those decisions is a classification. Running them through the agent's main LLM adds seconds per turn. Running them through a System One model adds tens of milliseconds. LangChain's integration exposes Jev as a classifier for exactly this role, including model routing: simple lookups go to a small, cheap model and hard debugging tasks go to a capable one. Vercel's team reported checking commands for safety 5 to 18 times faster after moving that check from an LLM to Jev.

For a lakehouse agent connected through MCP (Model Context Protocol, the open standard for connecting AI clients to tools and data), a classifier sits naturally in front of tool calls. It decides whether a proposed query is safe to run, whether it needs confirmation, or whether to block it.

### Pattern 3: The guard on the way out

LLMs generate. Classifiers check. After an LLM writes a summary or answers a question, a classifier asks narrow questions about the output. Does every cited passage support the claim it is attached to? Does the answer contain personal data? Does it contradict the retrieved source? TypeSafe's cookbook includes a citation check that uses a Choice to decide whether the quoted context supports a claim, with confidence flagging borderline cases for review.

This is cheap enough to run on every response, which is the point. A guard that you only run on a sample is a monitoring tool. A guard that runs on every response is a control.

### Pattern 4: Features for traditional models

This one gets less attention and matters a lot for analytics. Classification outputs are numbers. A Noul probability, a Score level, and a Choice distribution are all features you can feed into a gradient-boosted tree or a regression model. TypeSafe's docs include a cookbook that uses Jev questions to turn free text into numeric features for a CatBoost regressor.

In a lakehouse, that means your text columns stop being dead weight in predictive models. A churn model that only saw structured fields can now include "probability the customer mentioned a competitor" and "frustration level on a five-point scale" from every support interaction. The LLM is not in this loop at all. The classifier converts text to features once, the features land in an Iceberg table, and the modeling team uses them like any other column.

## Classification Inside an Apache Iceberg Lakehouse

Apache Iceberg is an open table format. It adds a metadata layer on top of Parquet files in object storage so that many engines can read and write the same tables with ACID transactions, schema evolution, and time travel. That combination of properties makes Iceberg a good home for model outputs, and it is worth being specific about why.

### Store labels as their own table

The first design decision is where labels live. The tempting move is to add a `category` column to the raw table and fill it in. Resist that. Keep the source table as it arrived and write classification results to a separate enrichment table keyed by the source row's ID.

This separation pays off in several ways. You can reclassify everything with a new model version without rewriting the raw data. You can keep two model versions side by side and compare them. Your raw table's snapshots reflect ingestion only, which keeps its history easy to read. And access control gets simpler, because the enrichment table often carries less sensitive data than the raw text.

### Store probabilities, not just labels

The enrichment table should carry the full answer, not only the winning label. At minimum, that means the chosen option, its confidence, and the probability distribution. For a Choice with a handful of options, a JSON string or a map column holds the distribution. For a Noul, one double column is enough.

It also needs provenance columns: the exact model version that answered (Jev reports a versioned ID such as `jev-1.13.0` even when you call an alias), a version string for your question set, a timestamp, and the route the row took through the cascade. Without these, you cannot tell which labels came from which model after an upgrade, and you cannot audit a bad label back to its cause.

### Use Iceberg features that fit the problem

**Snapshots and time travel.** Every write to an Iceberg table creates a snapshot. When a model upgrade changes labels, you can query the enrichment table as of the old snapshot and compare it to the new one. That gives you a precise diff of every label that changed, which is the best possible input for deciding whether the upgrade is safe.

**Branches for write-audit-publish.** Iceberg supports named branches on a table. A classification job writes to a staging branch, a validation step checks the output (label distribution, confidence distribution, null counts, row counts against the source), and only then does the branch get fast-forwarded to main. Engines such as Spark expose this through Iceberg's write-audit-publish settings. This keeps a broken prompt or a model regression from ever reaching the dashboards.

**Tags for model versions.** Tag the snapshot produced by each model version, such as `jev-1.13.0-baseline`. Tags keep that snapshot from expiring and give analysts a stable name for comparisons.

**Partitioning.** Partition the enrichment table by day of the labeling timestamp. Incremental jobs append one day at a time, and queries that look at recent labels prune old files.

### Incremental processing

Classification jobs should process only new rows. The simplest approach is a watermark: read the latest source timestamp already present in the enrichment table, then scan the source table for rows after it. Iceberg's metadata makes this cheap because the scan planner skips files whose column statistics fall outside the filter. A more precise approach reads the changes between two snapshots of the source table, which some engines expose as an incremental or changelog read.

### Throughput and cost math

The published limits make sizing straightforward. Suppose a backlog of 10 million support tickets averaging 300 input tokens each, including the question definitions. That is 3 billion input tokens. At $0.042 per million, the model cost is about $126 for the entire backlog.

The binding constraint is the request rate, not the price. At 1,200 requests per minute and one ticket per request, 10 million tickets take about 139 hours. Packing 20 tickets into one request as an array of state, with one question set per ticket, cuts that to about 7 hours. The token rate limit of 250,000 per second puts a floor of about 3.3 hours on 3 billion tokens. Packing trades accuracy for throughput, because TypeSafe documents that irrelevant detail in the state lowers accuracy. Test packed and unpacked requests on a labeled sample before committing to a batch size.

Compare that to a frontier LLM on the same backlog. The input tokens alone cost more by an order of magnitude or two, and output tokens for JSON add more on top. The exact multiple depends on the model and your prompt, but launch coverage cites 40 to 400 times cheaper and 20 to 200 times faster for Jev. Even at the low end, that turns a quarterly project into a nightly job.

For a self-hosted GLiClass deployment, the math is about hardware instead of tokens. A 151-million-parameter encoder on a single modern GPU processes thousands of short texts per second in batches. The cost is the GPU hours and the engineering time to run the service.

## A Worked Example: Support Tickets From Raw Text to Dashboard

Here is a complete, small version of the cascade. The source is an Iceberg table of raw support tickets, `support.tickets_raw`, with a ticket ID, subject, body, and ingestion timestamp. The goal is a labeled enrichment table and a weekly analytics query that uses probabilities, not just labels.

### Step 1: Create the enrichment table

This DDL runs in Dremio against an Iceberg catalog. Any engine that creates Iceberg tables works the same way with its own syntax.

```sql
CREATE TABLE lakehouse.support.ticket_labels (
  ticket_id            VARCHAR,
  category             VARCHAR,
  category_confidence  DOUBLE,
  category_probs       VARCHAR,
  churn_prob           DOUBLE,
  urgency_level        INT,
  urgency_confidence   DOUBLE,
  route                VARCHAR,
  model_version        VARCHAR,
  question_set         VARCHAR,
  source_ingested_at   TIMESTAMP,
  labeled_at           TIMESTAMP
)
PARTITION BY (DAY(labeled_at));
```

Each column has a job. `category_probs` holds the full distribution as a JSON string, so analysts can see when a ticket split between two teams. `churn_prob` is a raw Noul probability. `route` records which path the row took through the cascade. `model_version` and `question_set` make every label traceable. `source_ingested_at` carries the source timestamp forward so the next run knows where to start.

### Step 2: Classify new rows and append

This Python job uses PyIceberg, the official Python library for Iceberg, to read new tickets and write results. It uses the TypeSafe Python SDK for classification.

```python
import json
from datetime import datetime, timezone

import pyarrow as pa
import pyarrow.compute as pc
from pyiceberg.catalog import load_catalog
from pyiceberg.expressions import GreaterThan
from typesafe_sdk import Choice, Noul, Score, TypeSafeClient

MODEL = "jev-1.13.0"         # pin a version, not the jev-latest alias
QUESTION_SET = "support-v3"  # bump whenever the questions change
AUTO_ACCEPT = 0.80           # confidence gate for the category answer

QUESTIONS = {
    "category": Choice(
        instructions="Which product area is the customer writing about?",
        criteria={
            "billing": "Charges, invoices, refunds, payment methods",
            "integrations": "Connectors, APIs, webhooks, third-party tools",
            "performance": "Slow queries, timeouts, dashboards that fail to load",
            "account_access": "Login, SSO, passwords, permissions",
            "other": "Anything that fits none of the options above",
        },
    ),
    "churn_signal": Noul(
        instructions=(
            "Does the customer say they plan to cancel, downgrade, "
            "or switch to another vendor?"
        ),
    ),
    "urgency": Score(
        instructions="How quickly does this ticket need a response?",
        criteria=[
            "No time pressure",
            "Should be answered this week",
            "Should be answered today",
            "Production is down right now",
        ],
    ),
}

LABEL_SCHEMA = pa.schema([
    pa.field("ticket_id", pa.string()),
    pa.field("category", pa.string()),
    pa.field("category_confidence", pa.float64()),
    pa.field("category_probs", pa.string()),
    pa.field("churn_prob", pa.float64()),
    pa.field("urgency_level", pa.int32()),
    pa.field("urgency_confidence", pa.float64()),
    pa.field("route", pa.string()),
    pa.field("model_version", pa.string()),
    pa.field("question_set", pa.string()),
    pa.field("source_ingested_at", pa.timestamp("us")),
    pa.field("labeled_at", pa.timestamp("us")),
])


def load_new_tickets(catalog, labels):
    done = labels.scan(selected_fields=("source_ingested_at",)).to_arrow()
    watermark = pc.max(done["source_ingested_at"]).as_py()

    tickets = catalog.load_table("support.tickets_raw")
    scan_args = {"selected_fields": ("ticket_id", "subject", "body", "ingested_at")}
    if watermark is not None:
        scan_args["row_filter"] = GreaterThan("ingested_at", watermark.isoformat())
    return tickets.scan(**scan_args).to_arrow().to_pylist()


def label_ticket(client, ticket, now):
    result = client.system_one(
        state={"subject": ticket["subject"], "body": ticket["body"]},
        questions=QUESTIONS,
    )
    category = result.answers["category"]
    urgency = result.answers["urgency"]
    churn = result.answers["churn_signal"]

    route = "auto" if category.confidence >= AUTO_ACCEPT else "llm_review"

    return {
        "ticket_id": ticket["ticket_id"],
        "category": category.choice,
        "category_confidence": category.confidence,
        "category_probs": json.dumps(category.probabilities),
        "churn_prob": churn.noul,
        "urgency_level": int(urgency.score),
        "urgency_confidence": urgency.confidence,
        "route": route,
        "model_version": result.model,
        "question_set": QUESTION_SET,
        "source_ingested_at": ticket["ingested_at"],
        "labeled_at": now,
    }


def main():
    catalog = load_catalog("lakehouse")  # settings come from .pyiceberg.yaml
    labels = catalog.load_table("support.ticket_labels")
    new_tickets = load_new_tickets(catalog, labels)
    if not new_tickets:
        return

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    with TypeSafeClient(model=MODEL) as client:
        rows = [label_ticket(client, t, now) for t in new_tickets]

    labels.append(pa.Table.from_pylist(rows, schema=LABEL_SCHEMA))


if __name__ == "__main__":
    main()
```

Walk through the pieces.

The constants at the top are the contract for the whole job. `MODEL` pins the exact version. The `jev-latest` alias moves when TypeSafe ships a new release, and TypeSafe's own docs warn that answers behind an alias can change without any change on your side. If you tuned `AUTO_ACCEPT` against version 1.13, a silent upgrade invalidates that tuning. `QUESTION_SET` does the same job for your prompts. Change a criteria description and you have changed the classifier, so the version string changes too.

`QUESTIONS` asks three things in one call. The Choice includes an `other` option, which TypeSafe recommends whenever the list does not cover every possible input. Without it, the model has to force an odd ticket into one of the real categories. The criteria descriptions are written to separate the options from each other, because the model reads both the option names and their descriptions. The Score levels describe observable situations ("Production is down right now") instead of vague adjectives like "critical," which reduces disagreement between runs.

`load_new_tickets` implements the watermark. It reads one column from the enrichment table, takes the maximum source timestamp, and filters the source scan with it. PyIceberg pushes the filter down to Iceberg's file-level statistics, so files with only older rows never get opened. On a very large enrichment table, reading the whole timestamp column gets slow. At that point, store the watermark in a small state table or read it from snapshot properties instead.

`label_ticket` sends only the subject and body as state. It does not send customer metadata, account history, or other columns. TypeSafe documents that accuracy drops as irrelevant detail grows in the state, so the state stays small on purpose. The function stores the full probability distribution, the Noul probability, the Score level, and the versioned model ID that the API reports back.

`main` runs the calls in sequence for readability. A production version uses the SDK's asynchronous client or a worker pool to stay near the rate limit. It also writes through a staging branch and validates before publishing, as described earlier.

### Step 3: Escalate the uncertain rows to an LLM

Rows with `route = 'llm_review'` go to a generative model. In Dremio, the `AI_CLASSIFY` SQL function sends text and a category list to a configured LLM and returns one of the categories. The escalation step runs as plain SQL next to the data:

```sql
CREATE TABLE lakehouse.support.ticket_labels_escalated AS
SELECT
  l.ticket_id,
  l.category             AS fast_category,
  l.category_confidence  AS fast_confidence,
  AI_CLASSIFY(
    'Which product area is this support ticket about? '
      || t.subject || ' ' || t.body,
    ARRAY['billing', 'integrations', 'performance', 'account_access', 'other']
  ) AS llm_category
FROM lakehouse.support.ticket_labels AS l
JOIN lakehouse.support.tickets_raw AS t
  ON t.ticket_id = l.ticket_id
WHERE l.route = 'llm_review'
  AND l.labeled_at >= DATE_SUB(CURRENT_DATE, 1);
```

The category list matches the Choice options exactly, so the two answers are comparable. Keeping `fast_category` next to `llm_category` gives you a running disagreement dataset for free. Every row where the two models disagree is a candidate for human review and a test case for the next version of your questions. A production pipeline appends to this table with `INSERT INTO` on each run instead of recreating it.

### Step 4: Query with probabilities

The analytics layer combines both tables and uses the probabilities directly:

```sql
SELECT
  DATE_TRUNC('WEEK', l.source_ingested_at)          AS week,
  COALESCE(e.llm_category, l.category)              AS final_category,
  COUNT(*)                                          AS tickets,
  SUM(l.churn_prob)                                 AS expected_churn_mentions,
  SUM(CASE WHEN l.churn_prob >= 0.8 THEN 1 ELSE 0 END) AS confident_churn_mentions,
  AVG(l.category_confidence)                        AS avg_category_confidence
FROM lakehouse.support.ticket_labels AS l
LEFT JOIN lakehouse.support.ticket_labels_escalated AS e
  ON e.ticket_id = l.ticket_id
WHERE l.model_version = 'jev-1.13.0'
  AND l.question_set = 'support-v3'
GROUP BY
  DATE_TRUNC('WEEK', l.source_ingested_at),
  COALESCE(e.llm_category, l.category)
ORDER BY week, final_category;
```

Two churn columns sit side by side on purpose. `expected_churn_mentions` sums probabilities and gives the best estimate of how many tickets carry churn language. `confident_churn_mentions` counts only the clear cases, which is the number a customer success team acts on. When the two numbers drift apart week over week, the population of borderline tickets is growing. That is a signal worth investigating on its own.

The `WHERE` clause filters to one model version and one question set. Mixing labels from different versions in a single trend line produces steps in the chart that reflect model changes, not customer behavior.

In Dremio, you save this as a view in the AI Semantic Layer with a description of each column. That description is what lets an AI agent answer "how many tickets mentioned churn last week" and pick the right column.

### A self-hosted variation

When text cannot leave your network, swap the classifier in Step 2 for GLiClass and keep everything else:

```python
from gliclass import GLiClassModel, ZeroShotClassificationPipeline
from transformers import AutoTokenizer

name = "knowledgator/gliclass-modern-base-v2.0"
model = GLiClassModel.from_pretrained(name)
tokenizer = AutoTokenizer.from_pretrained(name, add_prefix_space=True)
pipeline = ZeroShotClassificationPipeline(
    model, tokenizer, classification_type="multi-label", device="cuda:0"
)

labels = ["billing", "integrations", "performance", "account_access", "other"]
scores = pipeline(ticket_text, labels, threshold=0.0)[0]
best = max(scores, key=lambda r: r["score"])
```

Note what changes. GLiClass returns an independent score per label, not a probability distribution that sums to 1. The raw scores are not calibrated, so a 0.8 from GLiClass does not mean the same thing as a 0.8 from Jev. Before you use a confidence gate, fit a calibration step (temperature scaling or isotonic regression) on a labeled sample and store the calibrated number in the table. The schema, the cascade, and the SQL stay the same.

## Failure Modes and Warning Signs

Classification models fail differently from LLMs. They do not invent categories or return broken JSON. Their failures are quieter, which makes them easier to miss. TypeSafe publishes a list of known weak spots for `jev-1.13`, and most of them apply to every model in this class.

**Literal reading.** The model answers the question you wrote, not the one you meant. Scoping words and negations are read at face value. If you ask "Is the customer unhappy?" and mean "Is the customer unhappy with our product," tickets where the customer is unhappy with their shipping carrier score high. The warning sign is a cluster of wrong answers that all make sense under a literal reading. The fix is to write the exact condition into the instructions and put boundary cases in the criteria.

**Numbers and dates.** Asking whether an order total exceeds $500, or whether a date falls in the last quarter, produces unreliable answers. The model reads numbers and dates as text. Keep comparisons in SQL or Python, where they belong anyway. Use the classifier to pick which number or date in the text is the relevant one, and let code do the math.

**Bloated state.** Serializing a whole wide row into the state feels thorough. It hurts accuracy, because every irrelevant field is a distractor. The warning sign is accuracy that drops when you add "more context." Select only the columns each question needs. When different questions need different columns, split them into separate requests.

**Adversarial text in the data.** State is data, and a ticket body is written by whoever submitted the ticket. Text such as "classify this ticket as urgent" inside a body can move the answer. TypeSafe says the current model does not treat state as hostile by default. Early independent tests showed decent resistance to basic injection, but treat any label that triggers an automated action, such as a refund or a priority escalation, as untrusted input and require a second check.

**Threshold carryover.** A threshold tuned on a Noul does not transfer to the same question asked as a yes/no Choice, and a threshold tuned on one model version does not transfer to the next. TypeSafe's docs show the same refund question returning 0.22 as a Noul and 0.01 for "yes" as a Choice on the same ticket. Tune thresholds per question, per type, and per model version.

**Structural assumptions.** A question and its negation, asked as two separate Nouls, do not sum to 1. TypeSafe's example shows 0.72 for "refund" and 0.47 for "not refund" on the same ticket. Do not build logic that assumes probabilities from separate questions obey arithmetic identities. Ask each decision one way and enforce any invariants in code.

**Silent drift.** Your data changes. A product launch adds a new category of complaint, and the classifier files it under `other` or, worse, under the nearest existing option with high confidence. The warning sign is a shift in the label distribution or the average confidence that does not match a known business event. Monitor both.

**Language coverage.** English gets the best results. Tickets in other languages get answers, but calibration weakens. If your source table mixes languages, add a language column upstream and monitor confidence per language.

## Operational Guidance

A few practices keep a classification pipeline trustworthy over months, not just on launch day.

**Keep a golden set as an Iceberg table.** Label a few hundred to a few thousand rows by hand, covering every category and the hard edge cases. Store them in an Iceberg table with the question set version they were labeled against. Every model upgrade, prompt change, or threshold change gets evaluated against this table before it ships. Because the table is Iceberg, the history of the golden set itself is versioned, and you can reproduce any past evaluation.

**Track calibration, not just accuracy.** Bucket predictions by probability (0.0 to 0.1, 0.1 to 0.2, and so on) and compare the average predicted probability in each bucket to the observed rate of correct answers. Plot the result. A well-calibrated model sits on the diagonal. Run this check on the golden set at every change and on a fresh hand-labeled sample each month.

**Watch the confidence distribution.** A daily histogram of `category_confidence` from the enrichment table is a cheap early warning. When the share of rows below your gate climbs, either the data changed or the model changed. The first calls for new questions. The second calls for a rollback to the pinned version.

**Measure the escalation rate and its cost.** The percentage of rows routed to the LLM is your main cost lever. Track it alongside the disagreement rate between the fast model and the LLM on escalated rows. If disagreement on escalated rows is low, your gate is too strict and you are paying for LLM calls that agree with the cheap answer. Lower the threshold.

**Upgrade on your schedule.** When a new model version ships, run it on the golden set, then run it on a recent week of production data into a separate branch of the enrichment table. Compare labels row by row using Iceberg time travel or a join between branches. Promote the new version only after the diff looks right, and retune thresholds as part of the promotion.

**Isolate the compute.** Classification backfills are bursty. On a self-hosted model, they compete for GPU time with anything else on the same cluster. For SQL-based LLM escalation, route AI function queries to a dedicated engine so a large batch does not slow down dashboards. Dremio supports engine routing rules keyed on whether a query calls AI functions, and other engines have their own workload management controls.

**Log the request ID.** Hosted APIs return a request identifier. Store it in a side table keyed by ticket ID. When a user disputes a label months later, you can trace it back to the exact call.

## Where This Is Heading

The launch of Jev did not invent classification. What it did was name a category and ship a clean interface for it, and that interface spread fast. Within two weeks, it showed up in gateways, agent frameworks, observability tools, MCP servers, and a handful of open-source reproductions.

Three trends look likely to shape the next year.

The first is the split between generation and decision becoming a standard part of AI architecture. Agent frameworks already route tool selection, safety checks, and context pruning to fast models. Expect the same split inside data platforms, where query engines call a decision model for row-level tagging and reserve generative models for summaries and extraction.

The second is open models closing the gap. GLiClass and ModernBERT already give self-hosted teams a strong single-pass classifier. The missing piece has been trained-in calibration and a general interface for arbitrary typed questions. Several open projects are attacking exactly that. Treat their current benchmark claims with skepticism until someone runs a matched comparison, but the direction is clear.

The third is classification outputs becoming first-class data. When every free-text column in a lakehouse can be turned into calibrated probabilities for a fraction of a cent per thousand rows, text stops being the part of the data you skip. Open table formats like Iceberg are well suited to hold this derived layer, because they version it, share it across engines, and let you roll it back when a model change goes wrong.

## Conclusion

LLMs made text classification easy to prototype and expensive to run. Models like Jev, along with open alternatives such as GLiClass and the new wave of Jev-style projects, move most of that work back to a tool built for it. The answer is a typed value with a calibrated probability, returned in milliseconds for a small fraction of the cost.

The right design is not one model or the other. Put the fast classifier on every row. Use its confidence to decide what goes to an LLM and what goes to a person. Store full probabilities, model versions, and routes in their own Iceberg table, and let SQL and your semantic layer turn those numbers into analytics. Pin versions, keep a golden set, and watch the confidence distribution. Do those things and the text in your lakehouse becomes as queryable as the numbers next to it.

## Keep Going

If this piece was useful, I have written a lot more on building AI workloads on top of open lakehouse tables.
*Architecting an Apache Iceberg Lakehouse* (Manning) covers how to design the table, catalog, and engine layers that pipelines like this one run on.
You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
