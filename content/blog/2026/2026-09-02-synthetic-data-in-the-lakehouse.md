---
title: "Synthetic Data in the Lakehouse: Generation, Governance, and Testing"
date: "2026-09-02"
description: "What synthetic data in a lakehouse is for, the generation methods, how to preserve fidelity, and where synthetic tables belong."
author: "Alex Merced"
category: "Data Engineering"
tags:
  - Synthetic Data
  - Testing
  - Lakehouse
  - Generation
  - Governance
canonical: https://iceberglakehouse.com/posts/synthetic-data-in-the-lakehouse/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/synthetic-data-in-the-lakehouse/).

A team needs to test a new pipeline against a year of production orders. Production has the data. Production also has names, addresses, payment tokens, and enough behavioral history that a single row identifies a customer. So the team does what teams do: they take a sample, run a script that replaces names with "Test User" and emails with `user{n}@example.com`, and load it into staging. The pipeline passes. In production it fails, because the masked data lost the correlation between region and payment method that a join depended on, and because nobody masked the free-text notes field, which still contains three customers' phone numbers.

Synthetic data is the attempt to do this properly: generate data that behaves like production for the purpose at hand, without being production. In a lakehouse the question has more surface than it used to, because the data is larger, the consumers are more numerous, and one of the consumers is now a model being trained or an agent being evaluated. It also has better tooling, because Apache Iceberg gives synthetic data somewhere to live with the same schema, statistics, partitioning, and governance as the real thing.

This article covers what synthetic data is for and what it is not, the generation methods from rule-based fakers through statistical models to deep generative models, how to keep synthetic tables faithful enough to be useful, where they belong in a catalog and how to keep them from being mistaken for production, the privacy claims that do and do not hold, and the testing patterns that make the effort pay off. I work at Dremio, and nothing here is vendor-specific.

## Four Jobs, Four Different Requirements

"Synthetic data" covers uses with incompatible requirements, and most failed projects picked a method suited to a different job.

**Testing and development.** Engineers need data that exercises the code: right schema, right types, plausible distributions, edge cases present, enough volume to catch performance problems. It does not need to be statistically faithful. A pipeline test cares that nulls appear, that a customer has many orders, that dates span partitions, and that string lengths are realistic. Rule-based generation is usually sufficient and always cheapest.

**Demos and training environments.** Sales engineers, trainers, and documentation need data that looks real to a human: names that read as names, product catalogs that make sense, revenue curves that trend. Realism to the eye matters more than statistical fidelity. Rule-based generation with good reference data and a hand-tuned narrative beats a generative model here.

**Analytics and model development.** A data scientist building a churn model needs the relationships between variables preserved, because the relationships are what the model learns. Marginal distributions are not enough, because the joint distribution is what carries the signal. This is where statistical and deep generative methods earn their cost, and where fidelity has to be measured rather than assumed.

**Privacy-preserving data sharing.** Sharing data with a partner, a vendor, or a research group without sharing the underlying records. This is the hardest job, because the requirement is not only that the data is useful but that it does not leak. A generative model trained on real data can memorize and reproduce records, and "it is synthetic" is not by itself a privacy guarantee. This is the case where formal methods and legal review are required.

Most organizations need the first two and think they need the fourth. Deciding which job is at hand, before choosing a method, is the decision that determines whether the effort succeeds.

## The Alternatives to Synthesis

Before generating anything, it is worth being clear about what the other options are, because synthesis is not always the cheapest way to solve the problem it is reached for.

**Subsetting.** Take a referentially consistent slice of production: a thousand customers and all of their orders, line items, and events. The data is real, so fidelity is perfect and every constraint holds by construction. The privacy exposure is real too, which is why subsetting works for environments with production-equivalent controls and not for developer laptops or partner sharing. It also does not solve volume: a subset is smaller than production by definition, so performance testing needs something else.

**Masking and tokenization.** Replace identifying values in place, either with random substitutes or with format-preserving tokens that keep referential integrity through a vault. Cheaper than synthesis and it keeps every non-identifying relationship intact. The weaknesses are the ones from the opening: free-text fields leak, quasi-identifiers in combination re-identify, and the masking transformation itself distorts the relationships it touches. Masked production data is still production data under most privacy frameworks.

**Anonymization with formal guarantees.** k-anonymity, l-diversity, and their successors generalize or suppress values until each record is indistinguishable from k-1 others. These have known attacks and have largely been superseded by differential privacy for claims that need to hold.

**Access controls on the real data.** Sometimes the right answer is not a copy at all: row-level policies, column masking, and a governed compute environment let people work with production data under controls, which is often less work than maintaining a synthetic pipeline and is more faithful by definition. The catalogs' policy frameworks make this practical in a way it was not a few years ago.

Synthesis wins specifically when the data must leave the controlled environment, when full volume is needed and production volume cannot be copied, when edge cases have to be constructed rather than found, or when the environment (a laptop, a CI runner, a demo) cannot be given production-equivalent controls. Those are common enough to justify the effort, and they are not every case.

## Generation Methods

### Rule-Based and Faker-Style Generation

The simplest approach generates each column from a specification: a name from a name list, a timestamp from a range, an amount from a distribution, a foreign key from a previously generated set. Libraries such as Faker, Mimesis, and Synthetic Data Vault's simpler modes do this, and so does a few hundred lines of Python.

The strength is control and speed. A generator produces a billion rows as fast as it can write Parquet, and every edge case can be forced: a customer with ten thousand orders, an order with a null amount, a Unicode name, a timestamp at a partition boundary, a duplicate key. Test suites need these and no statistical method produces them reliably.

The weakness is that correlations exist only where they were written. If the generator draws region and payment method independently, the synthetic data has no relationship between them, and any analysis or model built on it is wrong in a way that is hard to notice. Building correlations into a rule-based generator is possible and amounts to writing the joint distribution by hand.

For test and demo data, rule-based generation with a well-designed schema of relationships (customers, then their orders, then the order's line items, with realistic cardinalities) is the right answer and is where most effort should go.

### Statistical and Copula Methods

The next tier fits a statistical model to real data and samples from it. Gaussian copulas, which model each column's marginal distribution separately and the dependency structure between columns as a correlation matrix, are the workhorse. The Synthetic Data Vault library popularized them for tabular data and adds sequential and multi-table variants that preserve relationships across tables through foreign keys.

The strength is that pairwise correlations survive and that fitting is fast, interpretable, and does not require a GPU. The weakness is that copulas capture linear dependence well and complex, conditional, or multi-modal relationships poorly. A dataset where the relationship between spend and age reverses for one customer segment is not represented by a single correlation matrix.

Bayesian network approaches sit alongside copulas and model conditional dependencies explicitly, which handles categorical data and conditional structure better at the cost of a harder fitting problem.

### Deep Generative Models

The top tier trains a neural model on the real data and samples from it: CTGAN and its relatives for tabular data via generative adversarial networks, variational autoencoders, diffusion models adapted to tables, and increasingly large language models fine-tuned to emit rows.

The strength is that complex, non-linear, conditional structure is captured without being specified. For high-dimensional data with intricate dependencies, these produce the most faithful synthetic data available.

The weaknesses are three. They are expensive to train and to tune. They fail in ways that are hard to detect, such as mode collapse where the model produces only the common patterns and loses the tail that the analysis needed. And they memorize: a model trained on a dataset with rare records can reproduce those records verbatim, which is precisely the privacy failure the exercise was meant to avoid.

LLM-based generation deserves a separate note because it is the newest and the most tempting. Asking a model to generate rows produces plausible-looking data quickly and is useful for demos and for schema-shaped test fixtures. It is not a statistical method: the distributions come from the model's priors rather than from your data, cardinalities are wrong, and the output is expensive per row at any real volume. Where LLMs do fit is in generating the generator, writing the rule-based specification or the SDV metadata from a schema and a description, which is a large productivity gain and keeps the actual generation cheap and deterministic.

### Differentially Private Generation

For the sharing case, differential privacy provides a formal guarantee: the output distribution changes by a bounded amount whether or not any individual record was in the input. Applied to synthetic data generation, it means training the generator with noise calibrated to a privacy budget, so that no individual's presence can be inferred from the output.

The cost is fidelity. A tight privacy budget produces data that is provably safe and often not useful for the analysis it was meant to support. The tradeoff between the budget and the utility is the whole engineering problem, and it is a problem with a formal framework rather than an intuition. Organizations that need to make a defensible privacy claim about shared synthetic data should be using a differentially private method and should have counsel involved. Organizations generating test data do not need any of this.

### Multi-Table Consistency

Single-table generation is the easy case and almost never the real one. A lakehouse has customers, orders, line items, events, and a dimension model on top, and synthetic data is useful only if the relationships between them hold.

Three constraints have to survive generation.

**Referential integrity.** Every `customer_id` in orders exists in customers. Every `order_id` in line items exists in orders. The reliable approach is to generate in dependency order and draw foreign keys from the already-generated parent keys, never from a range. Statistical tools that model tables independently and join afterward produce orphans, which is why SDV and its peers have explicit multi-table modes that generate parents first and children conditioned on them.

**Cardinality distributions.** Orders per customer is not uniform. A small number of customers have hundreds and most have one or two, and any analysis of customer value depends on that shape. Generating a fixed number of children per parent produces data that is referentially valid and behaviorally wrong. Draw the child count from a distribution fitted to the source, which is a single aggregate query on production and one of the cheapest fidelity wins available.

**Temporal ordering.** A line item's timestamp falls inside its order's window. An event follows the order it references. A shipment follows a placement. These are constraints the generator enforces by construction, generating the parent's timestamp first and drawing children relative to it.

The practical structure is a generator per entity, run in topological order, with each writing to its own Iceberg table and passing its generated keys forward. Because each table's write is its own commit, a multi-table generation run leaves the synthetic namespace briefly inconsistent between commits. For test environments that rarely matters. Where it does, generating each entity on a branch and fast-forwarding all of them after the run gives a consistent published state, and the catalog's multi-table transaction support, where available, makes it atomic.

## Fidelity: What to Measure

Synthetic data that has not been evaluated is a guess. Four families of measures cover the useful ground, and which ones matter depends on the job.

**Marginal fidelity.** Does each column's distribution match? For numeric columns, compare quantiles or use a Kolmogorov-Smirnov statistic. For categoricals, compare the frequency of each value and the number of distinct values. This is the minimum bar and rule-based generators pass it only where they were configured to.

**Joint fidelity.** Do the relationships between columns match? Compare pairwise correlation matrices, mutual information between column pairs, and the distributions of key aggregates such as orders per customer and revenue per region. This is where rule-based data fails and where the value of statistical methods shows.

**Constraint satisfaction.** Are the invariants that make the data valid preserved? Foreign keys resolve. Order totals equal the sum of line items. End timestamps follow start timestamps. Status transitions are legal. These are business rules and no generative method enforces them unless told to, so they are checked as assertions and usually repaired by post-processing.

**Downstream utility.** Does a model or a query produce the same answer on synthetic data as on real? The strongest measure is train-on-synthetic-test-on-real: fit the target model on synthetic data, evaluate it on held-out real data, and compare to a model fit on real data. For analytics rather than modeling, run the organization's actual dashboard queries against both and compare results.

**Privacy measures**, for the sharing case: nearest-neighbor distance between synthetic and real records, to detect memorization, and membership inference attack success rates, to test whether an adversary can determine if a record was in the training set. A synthetic record identical to a real one is a leak regardless of how it was generated.

The practice that makes this tractable is to compute the measures as a table. Fidelity metrics for each synthetic table, per generation run, stored in the lakehouse alongside the data, with thresholds that fail the generation job when fidelity degrades. Synthetic data quality is a pipeline output like any other and belongs under the same validation discipline.

## Where Synthetic Tables Live

A synthetic table in a lakehouse has one hard requirement above all others: nobody should ever mistake it for production. Every governance decision follows from that.

**A separate catalog or namespace, named unambiguously.** `synthetic.orders` or a `synthetic` catalog, never `analytics.orders_test` sitting next to `analytics.orders`. The namespace is the first line of defense because it appears in every query, every dashboard connection string, and every error message.

**Table properties that mark provenance.** Free-form properties in the Iceberg table record what generated the data, from what source, with what method, at what version:

```sql
ALTER TABLE synthetic.orders SET TBLPROPERTIES (
  'data.classification'      = 'synthetic',
  'synthetic.method'         = 'sdv-gaussian-copula',
  'synthetic.source_table'   = 'analytics.orders',
  'synthetic.source_snapshot'= '7168742983117921046',
  'synthetic.generated_at'   = '2026-09-01T04:00:00Z',
  'synthetic.generator_version' = 'gen-orders:2.4.1',
  'synthetic.fidelity_report'= 's3://lake/synthetic/reports/orders/2026-09-01.json'
);
```

These travel with the table across catalogs and engines, are visible in every metadata platform that ingests them, and give an auditor the chain from synthetic table back to the source snapshot and the generator version.

**Catalog-level access separation.** The synthetic namespace is readable by developers, CI, demo environments, and partners. The source namespace is not. This is the point of the exercise, and it only works if the generation job is the sole bridge, running with read access to production and write access to synthetic, and nothing else has both.

**Metadata platform classification.** Tagged as synthetic in DataHub, OpenMetadata, or whichever platform, with lineage from the source table so that a consumer who finds it knows what it is and what it came from. A synthetic table that appears in search results next to the real one, indistinguishable, is a discovery problem waiting to become an incident.

**Retention and regeneration.** Synthetic data goes stale as the source schema and distributions drift. Treating it as a derived table with a regeneration schedule, and expiring old snapshots aggressively since nobody time-travels test data, keeps it current and cheap.

## Preserving Schema and Layout

Synthetic data that does not match production's schema, types, partitioning, and file layout is a poor test of anything except the transformation logic. Several details are worth carrying over deliberately.

**Schema, exactly.** Same columns, same Iceberg types, same nullability, same nested structures. The cheapest way to guarantee this is to read the source table's schema from the catalog and create the synthetic table from it rather than writing DDL by hand:

```python
from pyiceberg.catalog import load_catalog

catalog = load_catalog("polaris")
source = catalog.load_table("analytics.orders")

synthetic = catalog.create_table(
    "synthetic.orders",
    schema=source.schema(),
    partition_spec=source.spec(),
    sort_order=source.sort_order(),
    properties={
        **{k: v for k, v in source.properties().items()
           if k.startswith("write.") or k == "format-version"},
        "data.classification": "synthetic",
        "synthetic.source_table": "analytics.orders",
        "synthetic.source_snapshot": str(source.current_snapshot().snapshot_id),
    },
)
```

Copying the partition spec, sort order, and write properties means the synthetic table produces files with the same sizing, compression, and metrics as production, which is what makes performance testing meaningful.

**Volume and skew.** A test on a million rows finds correctness bugs. Finding the performance bug that appears at a billion rows and one hot key requires a billion rows and a hot key. Rule-based generation is how skew gets in: deliberately give one customer twenty percent of the orders, one partition ten times the average volume, and one string column a value that repeats a million times. Statistical methods reproduce the skew that existed in the source, which is often what you want and is not sufficient for stress cases.

**Cardinality and distinct counts.** A join key with a thousand distinct values behaves nothing like one with ten million. Generators that draw keys from a small pool produce synthetic data that joins fast and tells you nothing.

**Temporal spread.** Data that all lands in one partition tests one partition. Spread generation across the partition range production covers, including the boundaries.

**Nulls, empties, and edge cases.** Production has them. Synthetic data that is uniformly well-formed misses the null-handling bug entirely. Configure null rates per column from the source's actual null counts, which are in the manifests and cost nothing to read.

## Walkthrough: A Generation Pipeline

The following is the shape of a generation job that reads a production table's schema and statistics, generates data with a rule-based generator informed by those statistics, writes to a synthetic table, and records fidelity.

```python
import json
import numpy as np
import pyarrow as pa
from pyiceberg.catalog import load_catalog

catalog = load_catalog("polaris")
source = catalog.load_table("analytics.orders")
snapshot = source.current_snapshot()

# 1. Read distribution hints from metadata, not from the rows.
#    Row count, null counts, and value bounds come from manifests.
row_count = int(snapshot.summary.get("total-records", 0))
null_rates, bounds = {}, {}
for task in source.scan().plan_files():
    f = task.file
    for fid, nulls in (f.null_value_counts or {}).items():
        null_rates[fid] = null_rates.get(fid, 0) + nulls
null_rates = {fid: n / row_count for fid, n in null_rates.items()}

# 2. Create the synthetic table from the source's schema and layout.
try:
    target = catalog.load_table("synthetic.orders")
except Exception:
    target = catalog.create_table(
        "synthetic.orders",
        schema=source.schema(),
        partition_spec=source.spec(),
        sort_order=source.sort_order(),
        properties={
            "format-version": "3",
            "data.classification": "synthetic",
            "synthetic.method": "rule-based-v2",
            "synthetic.source_table": "analytics.orders",
        },
    )

# 3. Generate in batches, with deliberate skew and edge cases.
rng = np.random.default_rng(20260901)
CUSTOMERS = 2_000_000
HOT_CUSTOMER = 1                      # gets a disproportionate share

def batch(n, start_ts, end_ts):
    hot = rng.random(n) < 0.20
    customer_id = np.where(hot, HOT_CUSTOMER, rng.integers(2, CUSTOMERS, n))
    placed_at = rng.integers(start_ts, end_ts, n).astype("datetime64[s]")
    amount = np.round(rng.lognormal(3.4, 0.9, n), 2)
    amount[rng.random(n) < null_rates.get(4, 0.0)] = np.nan   # match source null rate
    status = rng.choice(["placed", "shipped", "delivered", "cancelled"],
                        n, p=[0.05, 0.10, 0.80, 0.05])
    return pa.table({
        "order_id": pa.array(rng.integers(0, 2**62, n)),
        "customer_id": pa.array(customer_id),
        "placed_at": pa.array(placed_at),
        "amount": pa.array(amount),
        "status": pa.array(status),
    }, schema=target.schema().as_arrow())

for day_start, day_end in day_ranges("2025-09-01", "2026-09-01"):
    target.append(batch(rows_for_day(day_start), day_start, day_end))

# 4. Record provenance and fidelity.
report = fidelity_report(source, target)          # marginals, correlations, constraints
with open_report_path() as f:
    json.dump(report, f)

target.transaction().set_properties({
    "synthetic.source_snapshot": str(snapshot.snapshot_id),
    "synthetic.generated_at": now_iso(),
    "synthetic.generator_version": "gen-orders:2.4.1",
    "synthetic.fidelity_report": report_path,
}).commit_transaction()

if report["constraint_violations"] > 0 or report["max_marginal_ks"] > 0.15:
    raise SystemExit("fidelity thresholds not met")
```

Several choices in that job are deliberate.

**Distribution hints come from metadata, not from rows.** Null rates, row counts, and value bounds are in the manifests. Reading them requires no access to the data itself, which means the generation job for these hints needs only catalog metadata access. For a rule-based generator this is often enough, and it is a meaningfully smaller privilege than reading production rows.

**The seed is fixed.** Reproducibility means a test failure can be reproduced. The seed goes in the table properties alongside the generator version.

**Skew is explicit.** Twenty percent of orders to one customer is not realistic and is the point: it is the stress case that finds the hot-partition bug.

**Null rates match the source.** The one statistic that is cheap to match and that most generators ignore.

**The job fails on fidelity thresholds.** Synthetic data that has drifted from the source's shape is worse than no synthetic data, because tests pass against something production no longer resembles.

**Writing appends per day.** One commit per day of generated data produces reasonable file sizes and lets the job resume.

### Deciding How Much to Generate

Volume is the parameter teams get wrong most often, in both directions. Three tiers cover the realistic needs, and generating each separately is cheaper than compromising on one.

**CI tier: thousands of rows.** Small enough that the whole pipeline runs in a local Iceberg stack in seconds, large enough that partitioning and joins are exercised. Every edge case present, every constraint tested, deterministic seed so failures reproduce. Regenerated on every schema change and committed as a fixture or generated in the test's setup.

**Integration tier: millions of rows.** Enough to produce multiple files per partition, meaningful statistics, and query plans that resemble production's. This is the tier for testing compaction, checking that a query prunes, and validating that a dbt incremental model's merge does what it should. Regenerated nightly or weekly.

**Performance tier: production volume.** Enough to reproduce the behavior that only appears at scale: manifest counts, planning time, hot partitions, memory pressure, small-file accumulation. Generated once, refreshed monthly or when the source's shape changes materially, and kept in a pre-production catalog with production-equivalent hardware. This is the expensive tier and the one that most justifies its cost, because it is the only place a scaling problem is found before customers find it.

The tiers share a generator and differ in configuration. Splitting them means the CI tier stays fast, the performance tier stays realistic, and nobody is tempted to test a compaction strategy against ten thousand rows.

## Testing With Synthetic Data

The value shows up in what the synthetic tables make possible.

**Pipeline correctness in CI.** A local Iceberg stack with a small synthetic dataset, generated by the same generator with a smaller row count, runs the full pipeline on every pull request. Because the schema is the production schema and the edge cases are deliberate, the test catches null handling, type coercion, and join cardinality bugs before merge.

**Performance and scale testing.** A full-volume synthetic table in a pre-production catalog, with production's partitioning and skew, is where compaction strategies, query plans, and engine sizing get validated. This is the use case that justifies generating a billion rows, and it cannot be done with a masked production sample because the sample is not full-volume.

**Schema migration rehearsal.** Applying a schema evolution, a partition evolution, or a format-version upgrade to the synthetic table first, with the same table properties and file layout, rehearses the production change including its runtime.

**Demo and training environments.** A stable, refreshable synthetic dataset means demo environments never contain customer data and never break because someone deleted a row.

**Model development where real data is restricted.** A data scientist iterating on features against synthetic data, with the final fit on real data in a controlled environment, reduces the exposure of the real data without slowing iteration. This requires joint fidelity, which requires a statistical method, and it requires the fidelity to be measured rather than hoped for.

**Agent evaluation.** An agent that queries the lakehouse needs a test environment with realistic tables to be evaluated against, and evaluating agents against production data is a bad idea for the obvious reasons. Synthetic tables with production schemas and a known ground truth (because the generator knows what it generated) are the right substrate for agent evals.

## Synthetic Data for Model Training and Agent Development

The uses that grew fastest in the past two years are on the AI side, and they have their own requirements.

**Training data augmentation.** When a target class is rare, fraud, churn, a failure mode, synthetic examples of it can balance the training set. This works when the generator captures the rare class's structure, which is exactly the case where deep generative models are hardest to fit, since there are few examples to learn from. Oversampling techniques such as SMOTE and its variants are the established approach and are simpler than a generative model. The evaluation is the same either way: does the model trained with augmentation perform better on real held-out data?

**Filling gaps in coverage.** A model that has never seen a scenario cannot handle it. Generating the scenario, a transaction pattern that has not occurred yet, a sensor reading outside the observed range, gives the model something to learn from. This is rule-based generation guided by domain knowledge rather than statistical fitting, and its correctness is a domain question.

**Evaluation sets with known ground truth.** The strongest AI case. An agent that answers questions over a lakehouse needs evaluation, and evaluation needs questions with known correct answers. Synthetic tables have known answers by construction: the generator knows how many orders it created for each customer, what the revenue by region is, and which records violate which rules. An evaluation suite built on synthetic tables can grade an agent's SQL, its aggregations, and its handling of nulls and edge cases automatically, without a human labeling anything and without exposing production data to an agent under development.

**Training data for text-to-SQL and schema understanding.** Models and agents that generate queries benefit from exposure to realistic schemas and realistic data shapes. A synthetic lakehouse with production-like schemas, naming, and cardinalities is a safe environment for that, and the schema is the part that matters most.

The caution across all of these is the one the research literature keeps finding: training generative models on their own output degrades them. A pipeline where synthetic data trains a model that generates more synthetic data, without real data anchoring it, drifts. Synthetic data is an augmentation to real data and an evaluation substrate, not a replacement for the real distribution.

## Failure Modes

**Masking called synthesis.** Replacing names in a production extract is not synthetic data. The rows are real, the correlations are real, the re-identification risk is real, and the free-text fields are almost always missed. If the rows came from production, the data is production data with a transformation applied, and it should be governed as such.

**Fidelity assumed rather than measured.** A generator runs, the data looks plausible, and a model trained on it performs badly in production for reasons nobody traces back. Measure marginals, joints, constraints, and downstream utility, and store the report.

**Constraint violations that break downstream code.** Foreign keys that do not resolve, totals that do not sum, end times before start times. Generators produce these constantly and the pipeline under test crashes on data that cannot exist. Post-processing repair and constraint assertions are part of the generator, not an afterthought.

**Memorization treated as impossible.** A deep generative model trained on a table with rare records reproduces those records. Nearest-neighbor distance checks catch it. "It is synthetic" is not a privacy claim without evidence.

**Synthetic data in production paths.** The table was in a namespace called `demo`, someone federated the catalog, and a dashboard joined it. Naming, classification properties, access separation, and metadata platform tagging all exist to prevent this, and all four should be in place.

**Stale synthetic data.** The source gained three columns and changed a partition spec. The synthetic table did not. Tests pass against a schema that no longer exists. Regenerate on a schedule and fail the job when the source schema has changed in ways the generator does not handle.

**Uniform data that hides bugs.** Every customer with ten orders, every amount from the same narrow range, every partition the same size. The pipeline is fast and correct on this data and neither in production. Skew is a feature.

**Volume that does not justify the method.** Training a GAN to produce test fixtures for a CI job is effort spent where a hundred lines of Faker does the job. Match the method to the job.

**Cost of generating at production volume.** A billion rows a night, regenerated, is real compute and storage. Generate full volume once for the performance environment and refresh it monthly, not nightly, and use small datasets for CI.

## Operational Guidance

**Pick the method from the job.** Rule-based for test, dev, demo, and CI. Statistical for analytics and model development where joint fidelity matters. Deep generative only where the structure is genuinely complex and the fidelity is measured. Differentially private for external sharing, with counsel.

**Create synthetic tables from the source's schema programmatically.** Never hand-write the DDL. Copy the partition spec, sort order, and write properties too.

**Read distribution hints from metadata where possible.** Row counts, null counts, and bounds are free and require no row access.

**Mark everything.** Namespace, table properties, metadata platform classification, and lineage to the source snapshot.

**Separate access so that only the generator bridges the two sides.** This is the control that makes synthetic data a privacy improvement rather than a copy with extra steps.

**Measure fidelity every run and fail on thresholds.** Store the report and treat degradation as a build failure.

**Seed deterministically and version the generator.** Both go in the table properties.

**Build skew and edge cases in deliberately.** They are what production has and what statistical methods smooth away.

**Regenerate on a schedule tied to source schema changes.** And expire synthetic snapshots aggressively.

**Do not make privacy claims you have not tested.** For anything leaving the organization, the claim needs a formal method and a legal review.

## Where the Ecosystem Is Heading

**Generation as a catalog-aware operation.** Tools that read a table's Iceberg schema, partitioning, and statistics from a REST catalog and produce a matching synthetic table, with provenance properties, are the obvious productization of the walkthrough above. Several open-source projects are converging on it.

**LLMs writing generators, not rows.** The productive pattern is an agent that reads a schema and a description and emits a deterministic generator specification, which then runs at scale for nothing. Expect tooling that closes that loop, with the generated specification reviewed and versioned like code.

**Synthetic data for agent evaluation.** As agents query lakehouses, the need for evaluation environments with realistic tables and known ground truth grows. Synthetic tables where the generator knows every answer are the natural substrate, and evaluation suites built on them are appearing.

**Differential privacy becoming practical.** Better algorithms and better tooling are improving the utility available at a given privacy budget. The gap between "provably private" and "actually useful" is narrowing, though it remains the binding constraint for external sharing.

**Fidelity as a standard artifact.** Fidelity reports stored next to the data, with agreed metrics, so that a consumer of a synthetic table knows what it is faithful to. This is the same movement as data contracts, applied to synthetic data, and the metadata platforms are where it lands.

## Conclusion

Synthetic data in a lakehouse is worth doing when the job is clear. For testing, development, CI, demos, and performance work, rule-based generation that copies the production schema, partitioning, and write properties, adds deliberate skew and edge cases, and matches null rates from the manifests gives most of the value for a fraction of the effort. For analytics and model development, statistical methods that preserve joint structure earn their cost, and the fidelity has to be measured. For external sharing, formal privacy methods and legal review are the requirement, and "it is synthetic" is not a claim on its own.

The lakehouse contributes the parts that used to be hard: a schema to copy from the catalog, statistics to read from the manifests, table properties to carry provenance, namespaces and roles to keep the two worlds apart, and a metadata platform to make sure nobody confuses them. What it does not contribute is judgment about which method fits the job, and that judgment is where these projects succeed or waste a quarter.

## Keep Going

If this piece was useful, I have written a lot more on Iceberg table design, testing, and the metadata layer that makes work like this possible. *Architecting an Apache Iceberg Lakehouse* from Manning covers schema, layout, and the operational patterns this article builds on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
