---
title: "The Model Class Enterprise Data Teams Are Not Using Yet"
date: "2026-07-25"
description: "Tabular foundation models perform supervised learning in a single forward pass with no training run. What they are, where they win, and what they change in the data architecture."
author: "Alex Merced"
category: "AI & Agents"
tags:
  - tabular foundation models
  - TabPFN
  - machine learning
  - apache iceberg
  - prediction
canonical: https://iceberglakehouse.com/posts/tabular-foundation-models/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/tabular-foundation-models/).

A finance team asks which of their 40,000 open invoices will pay late. The data sits in a table with 22 columns: customer, terms, amount, history, region, past delinquency. Somebody points a large language model at it. The model reads a sample of rows, writes three paragraphs about risk factors, and produces a confident list that turns out to be roughly as accurate as sorting by amount.

That result is not a prompt engineering failure. It is a category error. The question is a supervised prediction problem over structured rows, and language models are not built to solve those. The tool that solves them well used to be gradient boosting, which requires a training pipeline, a tuning budget, and a model per problem. Since 2022 a third option has existed, and since roughly 2025 it has been good enough to change how enterprise prediction gets built.

Tabular foundation models are pretrained networks that perform supervised learning in a single forward pass. You hand the model your labeled rows and your unlabeled rows together, and it returns predictions without any gradient updates. No training run. No hyperparameter search. No model artifact to version and deploy.

The category deserves far more attention from people who work with lakehouse data than it currently gets. SAP acquired Prior Labs, the lab behind the leading model line, in 2026 with a commitment of more than a billion euros over four years, explicitly to predict business outcomes from tabular enterprise data. I work at Dremio, which SAP acquired the same year, so I have a front-row view of why a company with that much enterprise data thinks this matters. The mechanics below stand on their own.

## Why Language Models Fail at Tables

Four separate problems compound.

Tokenization destroys numeric structure. A language model sees 1,847.32 as a sequence of tokens, not as a quantity with a magnitude. Arithmetic and ordering relationships that a tree model reads directly from the value have to be reconstructed from text statistics. Models have gotten better at this and the representation remains fundamentally wrong for the job.

Column order and row order carry no meaning in a table, and a sequence model treats them as if they do. Shuffle the columns of a CSV and a language model's answer changes. Shuffle them for XGBoost and nothing changes, because the model learned per-feature splits rather than a sequence.

There is no calibrated probability. A prediction that an invoice pays late is worth much more when it arrives as 0.83 with meaningful calibration than as the word "likely." Downstream decisions need thresholds, expected values, and cost-weighted cutoffs. Prose does not provide them.

Cost scales the wrong way. Scoring 40,000 rows through a frontier model means 40,000 inference calls, or long batched prompts that blow past context limits. A gradient boosted model scores 40,000 rows in milliseconds on a laptop.

None of this makes language models useless here. They are excellent at the surrounding work: interpreting the question, finding the right table, writing the query, explaining the result. The prediction itself belongs to a different tool.

## What Gradient Boosting Got Right, and What It Costs

For a decade the correct answer to tabular prediction was XGBoost, LightGBM, or CatBoost. That was not fashion. Tree ensembles handle heterogeneous feature types, missing values, non-smooth relationships, and irregular interactions natively, and they do it without feature scaling or careful initialization. Multiple independent studies through 2022 found that deep learning did not beat them on typical tabular problems.

The cost is operational rather than statistical. Every prediction problem needs its own training run. Every training run needs hyperparameter search, and the gap between default parameters and tuned parameters on a tree ensemble is large enough to matter. Every trained model becomes an artifact that has to be versioned, deployed, monitored for drift, and retrained on a schedule. Multiply that by the number of prediction questions an enterprise actually has, which is hundreds, and the bottleneck stops being model quality and starts being the number of data scientists.

The result in most organizations is that only the top ten questions get models. Payment delay prediction gets built for the largest customer segment and nowhere else. The other 490 questions get a heuristic, a rule from 2019, or nothing.

That is the gap tabular foundation models attack. Not accuracy on the top ten problems. The cost of answering the other 490.

## The Mechanism: Prediction as In-Context Learning

The design is called a prior-data fitted network, and the idea is elegant enough to explain in a paragraph.

Take a generative process that produces synthetic datasets. In the original TabPFN work, that process is a structural causal model: sample a random causal graph, sample functional relationships along its edges, sample noise, and read off a table of features and a target. Sample millions of such datasets, each with its own hidden structure.

Now train a transformer on a strange task. Give it the labeled portion of a synthetic dataset and one unlabeled row, and ask it to predict that row's label. Do this across millions of different synthetic datasets. The network never sees the same dataset twice, so it cannot memorize any particular function. What it learns instead is how to infer structure from examples: how to look at 800 labeled rows and work out what relationship generated them.

The training objective approximates Bayesian inference. The model learns to produce the posterior predictive distribution over the label given the test features and the training set, with the synthetic data generator acting as the prior. That is why the outputs come with usable uncertainty rather than a bare point estimate.

At inference time you pass your real training rows and your real test rows in one forward pass. The model performs in-context learning, exactly the way a language model learns a pattern from examples in a prompt, except the examples are rows and the pattern is a predictive function. Nothing about the model changes. There is no fit step that produces weights.

The practical consequences follow directly. Training time is zero. Inference time scales with the size of the context you pass, which is your dataset. Model deployment means shipping one set of weights that serves every prediction problem in the organization. And the same weights handle classification and regression across wildly different domains, because the pretraining distribution covered enormous structural variety rather than any single domain.

## The Family Tree

The field moved fast enough that the names need untangling.

**TabPFN**, introduced in 2022 by Hollmann, Müller, Eggensperger, and Hutter, treated each row as a token and performed in-context learning over rows. It solved small classification problems in about a second and was mostly a research curiosity because of its size limits.

**TabPFN v2**, published in 2025, changed the architecture to a cell-based design with alternating attention across rows and across columns, so each cell gets its own representation. That change is what made the approach competitive with tuned gradient boosting on real datasets. The cost is complexity that grows as roughly n squared times m plus n times m squared for a table of n rows and m columns, which is why the practical sample ceiling sat around 10,000 rows.

**TabPFN-2.5**, released in late 2025, extended the v2 design with deeper networks and pushed the usable sample ceiling to roughly 50,000 rows. A variant trained with continued pretraining on hand-selected real-world datasets rather than purely synthetic ones performs better again, which is an interesting result on its own: the synthetic prior gets you most of the way, and real data at the end closes part of the remaining gap.

**TabICL**, from Qu, Holzmüller, Varoquaux, and Le Morvan, took a different architectural route. A lightweight column-then-row attention stage first builds fixed-dimensional row embeddings, and in-context learning happens over those embeddings. That reduces complexity to roughly n squared plus n times m squared, which scales to around 500,000 samples and runs roughly ten times faster than TabPFN v2 on large, wide datasets.

**TabICLv2** arrived February 11, 2026, with a more diverse synthetic data engine and refined pretraining across three stages of increasing dataset size, targeting both classification and regression. It is open, and it currently sits at or near the top of independent tabular leaderboards.

Around those four sit a growing set of specialized variants. **Mitra** from Amazon uses designed mixtures of synthetic priors plus fine-tuning. **LimiX** models the joint distribution over variables and missingness and proposes its own scaling law. **ContextTab** brings semantic awareness so column names and values carry meaning rather than being treated as anonymous numbers. **TabPFN-Wide** targets extreme feature counts above 50,000 columns for biomedical work. **TabFlex** uses linear attention to reach millions of samples. **TabDPT** trains on real data rather than synthetic priors.

The direction of travel across all of them is the same: relax the size limits, keep the single-forward-pass property, and close the remaining accuracy gap on large datasets.

## Where They Win and Where They Do Not

Honest scoping matters more here than in most model categories, because the sweet spot is narrower than the enthusiasm suggests.

**They win decisively** on datasets from a few hundred to a few tens of thousands of rows with under a few hundred features. On TabArena and the TALENT benchmark, the leading tabular foundation models beat tuned gradient boosting on aggregate, and they do it with zero training time against hours of tuning. For a data team with more questions than modelers, that trade is overwhelming.

**They win on iteration speed** regardless of final accuracy. Testing a hypothesis takes one forward pass. Adding a feature and re-evaluating takes another. The loop that used to take an afternoon takes a minute, which changes what questions get asked.

**They win on uncertainty.** The Bayesian framing produces calibrated distributions rather than point estimates, which matters for anything where you act on a threshold or compute an expected value.

**They lose on very large datasets.** Above the sample ceiling of whichever model you pick, you subsample, which throws away information that a gradient boosted model trained on the full set keeps. The ceiling has moved from 10,000 to 50,000 to 500,000 depending on architecture, and it is still a ceiling.

**They lose on latency without extra work.** In-context learning means the training set travels with every prediction. Scoring one row requires passing the whole context. For batch scoring that is fine. For a real-time endpoint answering in ten milliseconds it is not, which is why Prior Labs sells an enterprise inference mode that distills the model into a compact MLP or tree ensemble for serving.

**They lose where the top ensemble still wins.** An expensive multi-hour AutoML ensemble still edges out the best single tabular foundation model on aggregate benchmarks. If you have one problem worth four hours of compute and a modeler's full attention, the old approach remains defensible.

One caveat on benchmarks. Several of the leading evaluations involve researchers from the same labs that publish the models. There is no reason to suspect anything improper, and independent evaluation is still better. Run these on your own data before believing a leaderboard, exactly as you should with language models.

## The Commercial and Licensing Picture

TabPFN's code and v2 weights ship under the Prior Labs License, which is Apache 2.0 with an added attribution requirement. That is permissive enough for nearly all commercial use with a self-hosted deployment. Prior Labs also sells an enterprise edition whose distinguishing features are the distillation engine for low-latency serving and a commercial license with support.

TabICL and TabICLv2 are open and come out of academic labs. Mitra comes from Amazon. LimiX and several others are open with varying licenses. Unlike the language model market, this field is predominantly open weights, which makes it unusually easy to evaluate seriously without procurement.

SAP's acquisition of Prior Labs, announced May 4, 2026 alongside the Dremio deal, keeps Prior Labs operating as an independent entity in Freiburg with a commitment of more than a billion euros over four years. SAP's stated targets for the technology are payment delay prediction, supplier risk, upsell opportunity, and churn risk. Every one of those is a tabular prediction problem that exists in every large enterprise and gets solved today with a mix of rules and one-off models.

The strategic logic is worth stating plainly, because it explains why a data platform company bought a model lab. An enterprise agent that reasons in text still has to predict in tables. Owning the operational data, the lakehouse, the semantic layer, and the model class that predicts over structured records is a coherent stack. Owning only the language model is not.

## A Worked Example

Here is the end-to-end shape, starting from a table in a lakehouse and ending with calibrated predictions. The example uses PyIceberg to read the feature table so the code runs without a cluster.

```python
from pyiceberg.catalog import load_catalog
from tabpfn import TabPFNClassifier
import numpy as np

catalog = load_catalog(
    "lakehouse",
    **{
        "type": "rest",
        "uri": "https://polaris.example.com/api/catalog",
        "warehouse": "finance",
        "credential": "<client-id>:<client-secret>",
        "header.X-Iceberg-Access-Delegation": "vended-credentials",
    },
)

table = catalog.load_table("finance.invoice_features")

# Labeled history: invoices already resolved, with the outcome recorded.
train = table.scan(
    row_filter="resolved = true AND issued_at >= '2025-01-01'",
    selected_fields=(
        "customer_id", "amount", "terms_days", "region",
        "prior_late_count", "prior_invoice_count", "credit_score",
        "days_since_first_invoice", "paid_late",
    ),
).to_pandas()

# Open invoices: what we actually want scored.
score = table.scan(
    row_filter="resolved = false",
    selected_fields=(
        "invoice_id", "customer_id", "amount", "terms_days", "region",
        "prior_late_count", "prior_invoice_count", "credit_score",
        "days_since_first_invoice",
    ),
).to_pandas()

feature_cols = [
    "amount", "terms_days", "region", "prior_late_count",
    "prior_invoice_count", "credit_score", "days_since_first_invoice",
]

X_train = train[feature_cols]
y_train = train["paid_late"].astype(int)
X_score = score[feature_cols]

model = TabPFNClassifier(device="cuda", n_estimators=8)
model.fit(X_train, y_train)          # stores context, no gradient updates
proba = model.predict_proba(X_score)[:, 1]

score["late_probability"] = proba
score["expected_late_amount"] = score["amount"] * proba
```

Several details in that snippet carry more weight than they appear to.

The `fit` call does not train anything. It stores the labeled context that gets passed through the network at prediction time. That is why the API looks like scikit-learn while the semantics are completely different, and why swapping in a different tabular foundation model is usually a one-line change.

`n_estimators` controls ensembling over permutations of the input, since the architecture is not perfectly invariant to feature and class ordering. Raising it improves stability and costs linear inference time. Eight is a reasonable production default.

The `region` column stays categorical and unencoded. These models handle categorical features natively, which removes a whole category of preprocessing bugs around unseen categories at scoring time.

The row filter on the training scan is a modeling decision expressed as a query. Limiting to 2025 onward trades sample count for recency. Because there is no training cost, testing three different context windows takes three runs of a few seconds each, and that experiment is the kind of thing nobody bothers with when each run costs an hour.

The output goes back into an expected-value calculation rather than a label. That is the entire point of calibrated probabilities: the finance team does not want a list of late invoices, it wants the ranked expected exposure.

## A Second Example: Regression With Uncertainty

Classification is the easy case. The more interesting enterprise use is regression with a usable prediction interval, because most business decisions are about magnitude under uncertainty rather than a binary label.

```python
from tabpfn import TabPFNRegressor
import numpy as np
import pandas as pd

hist = table.scan(
    row_filter="closed = true AND closed_at >= '2025-07-01'",
    selected_fields=(
        "supplier_id", "category", "order_qty", "lead_time_promised",
        "supplier_on_time_rate", "distance_km", "season",
        "lead_time_actual",
    ),
).to_pandas()

open_orders = table.scan(
    row_filter="closed = false",
    selected_fields=(
        "order_id", "supplier_id", "category", "order_qty",
        "lead_time_promised", "supplier_on_time_rate",
        "distance_km", "season",
    ),
).to_pandas()

features = [
    "category", "order_qty", "lead_time_promised",
    "supplier_on_time_rate", "distance_km", "season",
]

reg = TabPFNRegressor(device="cuda", n_estimators=8)
reg.fit(hist[features], hist["lead_time_actual"])

output = reg.predict(open_orders[features], output_type="full")
median = output["quantiles"][0.5]
p90 = output["quantiles"][0.9]

open_orders["expected_lead_time"] = median
open_orders["worst_case_lead_time"] = p90
open_orders["buffer_days"] = p90 - open_orders["lead_time_promised"]
```

The `output_type="full"` request is the part worth noticing. Rather than a point estimate, the model returns a predictive distribution, and the quantiles come out of it directly. A planner does not want the expected lead time. A planner wants the 90th percentile, because that is what determines safety stock. Producing that from a gradient boosted regressor requires quantile regression with a separate model per quantile, or conformal prediction wrapped around the base model. Here it falls out of the Bayesian framing.

The second thing worth noticing is what is absent. There is no train-test split in the code, no cross-validation loop, no early stopping, no learning rate, no tree depth, no regularization term. The only knobs are the context and the ensembling count. That reduction in surface area is what makes it realistic for a data engineer without a modeling background to produce a defensible prediction, which is the actual breakthrough for organizations with more questions than modelers.

The third thing is the shape of the output. Writing `expected_lead_time`, `worst_case_lead_time`, and `buffer_days` back into a governed table makes the prediction a data product that any consumer reads, including an agent. The prediction stops being an ML artifact and becomes a column, which is the right end state for enterprise use.

## Questions to Ask Before Committing

Whether you are evaluating an open model or a vendor product built on one, six questions separate a real assessment from a demo.

**What is the sample ceiling for this specific model version, and what happens above it?** The answer determines whether your largest problems fit. Silent subsampling is the behavior you need to know about before production, not after.

**What is the license on the weights, exactly?** Most of this field ships permissively, and some enterprise editions do not. Attribution requirements, field-of-use limits, and commercial-use clauses all appear in this space.

**How does inference latency scale with context size on our hardware?** Ask for a measurement at your context size on the GPU class you plan to run, not a benchmark from a paper on an H100.

**What is the distillation story for serving?** If your use case has a latency budget, the path from in-context model to a compact server-side model is the thing you are actually buying.

**How do we reproduce a prediction from six months ago?** The answer should involve a table snapshot, a filter, a feature list, and a pinned model version. If the answer is vague, the audit story is vague.

**What does the model do with a column it has never seen a value for?** Categorical handling, missing value handling, and out-of-range numerics differ across implementations, and business data supplies all three constantly.

## What Changes in the Data Architecture

This model class pushes work toward the data layer, which is why it belongs in a lakehouse conversation rather than only an ML conversation.

**Context selection becomes the modeling step.** With no training run, the main lever you have is which rows you pass as context. That is a retrieval problem: recent rows, rows from similar customers, rows from the same region, a balanced sample across the target. Retrieval over a governed table is something a lakehouse does well and a feature store does expensively.

**Feature tables matter more than model registries.** The durable artifact is not a trained model, it is the table of features and outcomes. Version that, govern that, monitor that. Iceberg's snapshot semantics give you exactly the reproducibility story you need: a prediction run references a snapshot ID, and rerunning against that snapshot reproduces the context exactly.

**Freshness translates directly into accuracy.** A model that learns from context at inference time picks up last week's shift in behavior as soon as last week's rows land in the table. The whole apparatus of scheduled retraining collapses into keeping the table current. That makes ingestion latency a model quality metric, which is a genuinely new coupling between the data pipeline and prediction accuracy.

**Governance follows the data, not the model.** Since the model is stateless with respect to your data, access control at the table is access control for the prediction. Row filters and column masks enforced at scan planning apply automatically. Compare that with a trained model, which has absorbed the training data into its weights and carries whatever was in it wherever it goes.

**Lineage gets simpler and stricter.** A prediction traces to a snapshot, a filter, a feature list, and a model version. Four things, all of them recordable in the query log. That is a far better audit story than most production ML pipelines have today.

## Choosing Between the Four Options

Four tools now compete for tabular prediction work, and they do not overlap as much as the arguments suggest.

| Approach | Training cost | Best dataset size | Latency profile | Uncertainty | Where it wins |
|---|---|---|---|---|---|
| Gradient boosted trees | Minutes to hours per problem, plus tuning | Any, scales to hundreds of millions of rows | Microseconds per row after training | Needs explicit calibration | Very large data, hard latency limits, regulated scorecards |
| AutoML ensembles | Hours per problem | Small to large | Fast after training | Varies by ensemble | One high-value problem worth heavy compute |
| Tabular foundation models | None | Hundreds to hundreds of thousands of rows | Milliseconds to seconds per batch, context-dependent | Calibrated by construction | Many problems, fast iteration, small and medium data |
| Language models | None | Not applicable | Seconds per call | None usable | Interpreting the question, writing the query, explaining the result |

The row that changes an organization's economics is the third one, and the column that matters most is the first. Zero training cost means the marginal cost of asking a new prediction question drops from a project to a query. Organizations do not have ten prediction problems. They have hundreds, and they answer ten.

The correct architecture in most enterprises uses three of the four together. A language model interprets the request and locates the governed table. A tabular foundation model produces the prediction with calibrated probabilities. A gradient boosted model handles the two or three problems where the data is enormous or the latency budget is brutal. Choosing one tool for all tabular work is the mistake.

## Running an Honest Evaluation

The temptation with any new model class is to run it on a public dataset, see a good number, and adopt. That tells you almost nothing about your data. Here is an evaluation that takes about a day and produces a decision you can defend.

**Pick three problems, not one.** One with a few thousand rows, one with a few tens of thousands, one that is genuinely large. The size ceiling is the main constraint on this model class, and testing only in the sweet spot hides it.

**Split temporally, never randomly.** Business data has time structure, and a random split leaks the future into the training context. Train on rows resolved before a cutoff date, evaluate on rows resolved after it. A random split will make every model look better than it is, and it will make the foundation model look better than the tree, because in-context learning picks up leaked structure efficiently.

**Build the baseline properly.** A tuned LightGBM with 50 trials of hyperparameter search is the honest comparison. An untuned default is a straw man, and beating it proves nothing. Record the wall-clock time and the compute cost of that tuning run, because that number is half the argument.

**Measure four things.** Discrimination with AUC or average precision. Calibration with a reliability curve or Brier score, since a well-ranked but badly calibrated model breaks any threshold-based decision. Wall-clock time end to end, including tuning for the baseline. And cost per thousand predictions at your actual scoring volume.

**Test the context lever.** Run the foundation model three times with different context selections: all history, last twelve months, and a stratified sample balanced on the target. The spread between those three is often larger than the spread between model families, and it is free to explore. That single experiment usually teaches a team more than the model comparison does.

**Check stability.** Run each configuration with several seeds and several values of the ensembling parameter. A model whose result swings meaningfully across permutations is telling you the context is too small or too noisy for the question.

The decision rule that falls out of most of these evaluations: if the tuned tree wins by a wide margin, the dataset is probably above the size ceiling or the problem has structure that rewards heavy feature engineering. If the two land close, take the one with no training pipeline, because operational cost compounds and a two-point AUC difference usually does not.

## Context Engineering Is the New Feature Engineering

With training removed, almost all the remaining control sits in what you pass as context. This is the part of the workflow that nobody had to think about before, and it is where the interesting engineering now lives.

**Recency versus volume.** More context is not always better. A model given five years of history learns the average of five regimes. A model given twelve months learns the current one. The right window is an empirical question with a cheap experiment attached, and it changes as the business changes, which argues for testing it on a schedule rather than once.

**Similarity-based context.** For a heterogeneous customer base, passing rows from customers similar to the one being scored often beats passing a global sample. That is retrieval, and it looks exactly like the retrieval layer of a RAG system, except the retrieved objects are labeled rows rather than documents. A lakehouse with good clustering on the right columns makes those retrievals fast.

**Class balance.** For rare outcomes, a naive sample fills the context with negatives. Stratified sampling that raises the positive rate usually helps, with the caveat that it shifts the base rate and with it the calibration, which you correct afterward. Test both.

**Feature count discipline.** The complexity of these architectures grows with the number of columns as well as rows. Fifty well-chosen features beat three hundred marginal ones on both accuracy and inference cost. The old discipline of feature selection returns, with a new motivation.

**Segment-specific context.** Instead of one model over all regions, pass region-specific context per scoring batch. That produces the effect of per-segment models with none of the per-segment training. This is the pattern that most surprises teams coming from the trained-model world, because it costs nothing to try.

All five of those levers are queries against a governed table. That is why this model class fits the lakehouse pattern so naturally: the modeling work becomes SQL over Iceberg tables with snapshot-level reproducibility, rather than a pipeline that lives outside the data platform.

## Deploying It Without a Model Registry

The operational picture differs enough from standard MLOps that it deserves an explicit description.

**Batch scoring is the default and it is simple.** A scheduled job reads the context and the scoring set from the same table snapshot, runs the forward pass, and writes predictions back as a new table with the snapshot ID, model version, feature list, and run timestamp recorded as columns. That output table is the auditable artifact. Reproducing any prediction means rerunning against the recorded snapshot.

**Serving needs a plan.** For real-time endpoints, pick one of three approaches. Precompute predictions in batch and serve them from a fast store, which works when the input features change slowly. Distill the model into a compact MLP or tree ensemble, which is what the commercial enterprise editions provide and what you can approximate yourself by training a small model on the foundation model's outputs. Or accept the latency and keep the context small, which works for internal tools where a second is acceptable.

**GPU sizing is modest.** These models are small by language model standards. A single mid-range GPU handles substantial batch volume, and CPU inference works for small contexts at higher latency. Compare that with the cost of maintaining a training cluster and the infrastructure story looks appealing.

**Monitoring targets the data, not the weights.** Since the weights never change, drift shows up as a shift in the input distribution or in realized outcomes. Track the base rate of the target, the distribution of the top few features, and the realized accuracy on outcomes as they resolve. Alert on movement in any of the three.

**Version pinning matters more than it looks.** The model version is part of the reproducibility contract, and these libraries ship new weights regularly. Pin the version explicitly in the scoring job and record it in the output table. An unpinned upgrade that silently changes predictions is the failure that costs the most trust.

## Failure Modes

**Silently exceeding the sample ceiling.** Passing 200,000 rows to a model designed for 10,000 does not error. It subsamples or degrades. Know the ceiling of the specific model version you run, and subsample deliberately with a strategy you chose rather than one the library picked.

**Target leakage through the context.** In-context learning makes leakage easier, not harder. A feature computed after the outcome, such as a collections flag on an invoice, produces spectacular validation numbers and useless predictions. Build the feature table with an explicit as-of timestamp per feature and verify that every feature was knowable at prediction time.

**Latency surprises in production.** A batch job that scores nightly is fine. An API endpoint promising 20 milliseconds is a different engineering problem, and the answer is either distillation into a compact model or caching predictions computed in batch. Decide which one before the model reaches a product roadmap.

**Distribution shift without a training run to catch it.** Scheduled retraining, for all its cost, forces a periodic look at the data. Remove it and nobody looks. Replace it with monitoring on the input distribution and on realized outcome rates, and alert when either moves.

**Regulatory explainability.** Credit decisions, insurance pricing, and hiring carry legal requirements for adverse action explanations in many jurisdictions. A transformer performing in-context learning is harder to explain than a scorecard or a shallow tree. Feature attribution methods work, and they add a step you have to plan for. In some regulated cases the correct answer remains a simpler model.

**Treating the model as a replacement for domain features.** These models infer structure from what you give them. They do not invent a feature that captures the fact that this customer's parent company just filed for bankruptcy. Feature engineering still pays, and it pays more per hour than tuning does, which is a better allocation of a modeler's time.

**Benchmark provenance.** Aggregate leaderboards move fast and several involve the model authors. Validate on your own holdout, with your own temporal split, before committing.

## Where This Goes

Three directions look likely over the next couple of years.

The size ceilings keep rising. Every architectural generation has attacked the complexity term that caps sample count, from row tokens to cell attention to column-then-row embeddings to linear attention. There is no reason that stops, and once the ceiling passes a few million rows the remaining argument for per-dataset training weakens considerably for most enterprise problems.

Agents start choosing the tool. The natural pattern is an agent that interprets a business question, finds the right governed table, decides whether the question is retrieval, aggregation, or prediction, and calls a tabular foundation model when it is prediction. That composition is straightforward to build today with an MCP server exposing both the catalog and the model. The reason it is not common yet is that most people building agents do not know this model class exists.

The category expands past classification and regression. Time series forecasting, missing value imputation, causal effect estimation, and synthetic data generation are all being attacked with the same in-context machinery, and models that handle joint distributions over variables and missingness point directly at that.

The quiet implication for data platforms is that the highest-value AI workload in a lot of enterprises will not be a chatbot. It will be hundreds of small prediction problems, answered continuously against governed tables, with no model artifacts to maintain. Platforms that make context retrieval fast and governance automatic are well positioned for that. Platforms built around shipping trained models are solving a problem that is partly evaporating.

## The Organizational Argument

The technical case is interesting. The organizational case is the one that gets budget.

Count the prediction questions your business actually has. Churn by segment, by product, by channel. Payment delay by customer tier. Supplier reliability by category and route. Demand by SKU and store. Fraud likelihood by transaction type. Lead conversion by source. Equipment failure by asset class. Most mid-sized enterprises have several hundred of these, and the number of them that have a maintained model is typically under twenty.

The reason is not that the other questions lack value. It is that each one carried a fixed cost of a modeling project plus an ongoing cost of a maintained pipeline, and the value of the two-hundredth question rarely cleared that bar. Remove the training run and the fixed cost drops to writing a query and validating a result. Remove the model artifact and the ongoing cost drops to keeping a table fresh, which your data team already does.

That shift changes who does the work. A data engineer who is comfortable with SQL and a bit of Python answers a prediction question in an afternoon without a data scientist in the loop. The data scientists move to the problems that genuinely need them: the enormous datasets, the regulated models, the causal questions, and the feature engineering that no model infers on its own.

It also changes the failure mode you should worry about. With few models, the risk was that important questions went unanswered. With hundreds of cheap predictions, the risk is that unvalidated predictions get treated as facts. That argues for the governance pattern described above: predictions written back as governed tables with their snapshot, features, and model version attached, so any number a dashboard or an agent shows can be traced to the context that produced it.

## Conclusion

The enterprise question is almost never "write me a paragraph about supplier risk." It is "which of these 8,000 suppliers is likely to miss a delivery next quarter, how confident are you, and what is the expected cost." That is a tabular prediction problem, and there is now a model class that answers it in one forward pass with no training run and calibrated probabilities.

The barrier to trying it is close to zero. Weights are open, the interface mimics scikit-learn, and a meaningful evaluation on your own data takes an afternoon rather than a sprint. Pull a feature table from your lakehouse, pick a question you never got around to modeling, and run it against both a tuned gradient boosted baseline and a tabular foundation model. That comparison tells you more about your organization's next two years of prediction work than any benchmark chart.

The reason this matters at the architecture level is that it moves the center of gravity from model operations to data operations. When prediction requires no training, the quality of your answers is determined by the quality, governance, and freshness of your tables. That is a much better place for the bottleneck to sit, and it is a place data teams already know how to work.

One last framing that helps when explaining this to a skeptical stakeholder. Tabular foundation models did to supervised learning on tables roughly what pretrained language models did to text classification. Before, every task meant a labeled corpus and a training run. After, a general model plus a handful of examples got you most of the way, and the work moved from training to selecting good examples. The same reversal is happening for tables right now, and the organizations that notice early get a few hundred answered questions out of it.

## Keep Going

If this piece was useful, I have written a lot more on the data foundations that AI systems depend on.
*Architecting an Apache Iceberg Lakehouse* (Manning) covers the table design, snapshot semantics, and governance patterns that make reproducible, well-governed feature tables practical at scale.
You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at
[books.alexmerced.com](https://books.alexmerced.com).
