---
title: "The 2026 Iceberg REST Catalog Compatibility Report"
date: "2026-09-10"
description: "A repeatable test for what an Iceberg REST catalog actually serves, a scoring scheme that separates design from breakage, and the 2026 evidence across seven catalogs."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Iceberg REST catalog
  - catalog compatibility
  - Apache Polaris
  - benchmarking
  - Apache Iceberg
canonical: https://iceberglakehouse.com/posts/iceberg-rest-catalog-compatibility-report-2026/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-rest-catalog-compatibility-report-2026/).

Every lakehouse vendor now ships an Apache Iceberg REST catalog. Every one of them says it implements the same specification. Then you point PyIceberg at one of them, run the same script that worked yesterday against a different catalog, and `createView` returns a 404. Or `updateNamespaceProperties` returns a 400 asking for a field that does not exist in the specification. Or a drop that worked in staging is refused in production because purge semantics differ between the two catalogs you happen to be using.

"Supports the Iceberg REST catalog" is a true statement about roughly a dozen products. It is also close to useless as a procurement input, because the products behind that sentence differ in ways that decide whether your pipeline runs.

This report is the fix I have been working toward: a repeatable test that measures what a catalog serves rather than what it claims, a scoring scheme that separates a deliberate design from a broken implementation, and a publication protocol so the results carry a date and can be re-derived by anyone. I work at Dremio, which ships a catalog built on Apache Polaris, so I have an obvious interest here. That is exactly why the methodology matters more than my opinion. Everything below is designed so you run it yourself and get the same answer I do.

## Why "supports the REST catalog" stopped carrying information

For years each engine brought its own catalog client. Hive Metastore had a Thrift interface. Glue had an AWS SDK. There were JDBC catalogs and filesystem conventions and a long tail of one-off integrations. Every engine needed a driver for every catalog, and every catalog needed a client in every language its users cared about. The combinatorics were brutal, and they got worse as Python, Rust, and Go implementations of Iceberg arrived.

The Iceberg REST catalog protocol collapsed that matrix. One HTTP API, described by an OpenAPI document that lives in the Iceberg repository at `open-api/rest-catalog-open-api.yaml`. A client speaks HTTP to a URL. The vendor implements the endpoints behind it. New engines get every catalog for the price of one HTTP client.

That worked. It worked well enough that the protocol became table stakes, and once a thing becomes table stakes, the marketing claim attached to it stops discriminating. Both of these statements are true today:

- A catalog implements every endpoint in the specification, declares its capabilities honestly, and serves views, scan planning, and multi-table transactions.
- A catalog implements namespace listing and table loading, refuses every write, publishes no capability list, and returns HTTP 200 with an error payload inside it for operations it does not route.

Both vendors write "Iceberg REST catalog support" on the datasheet. Neither is lying. The specification defines a surface, and implementing part of that surface is legitimate. A read-only virtualization layer over Delta tables is a real product with real users, and scoring it as a failed write catalog is a category error.

What is missing is a shared vocabulary for saying *which part*. That is what a compatibility test provides. Not a pass/fail stamp, and not a ranking. A description precise enough that two engineers looking at the same catalog reach the same conclusion about whether it fits their workload.

## What the specification actually contains

Before you can test conformance, you have to be specific about what conformance is being measured against. The REST catalog specification is a single OpenAPI YAML file, and you can count its surface directly:

```bash
curl -sL -o irc.yaml \
  https://raw.githubusercontent.com/apache/iceberg/main/open-api/rest-catalog-open-api.yaml

python3 - <<'PY'
import re
lines = open('irc.yaml').read().split('\n')
in_paths = False
current = None
ops = []
for line in lines:
    if re.match(r'^paths:', line):
        in_paths = True
        continue
    if in_paths and re.match(r'^\S', line):
        break
    path_match = re.match(r'^  (/\S*):\s*$', line)
    if path_match:
        current = path_match.group(1)
        continue
    verb_match = re.match(r'^    (get|put|post|delete|head|patch):\s*$', line)
    if verb_match and current:
        ops.append('%s %s' % (verb_match.group(1).upper(), current))
print("spec operations:", len(ops))
PY
```

That count lands at 35 operations in the current specification. It covers namespace listing, table loading, commits, view creation, scan planning, and the rest. The number moves as the specification evolves, which is one reason a compatibility report needs a date stamp and a pinned specification revision.

Thirty-five is the raw surface. Three refinements matter for testing.

**One endpoint is not one capability.** `POST /v1/{prefix}/namespaces/{namespace}/tables/{table}` is a single operation in the OpenAPI document, and it carries 25 distinct update actions inside its request body. Setting properties, adding a schema, setting the current schema, upgrading the format version, adding a snapshot, setting a partition spec. A catalog that accepts `set-properties` and refuses `upgrade-format-version` serves that endpoint by any endpoint-level measure while failing the operation your migration script actually needs.

**Some operations depend on others.** You cannot probe `loadTable` without a table. You cannot create a table without a namespace. A catalog that refuses namespace creation produces failures in a dozen downstream probes that prove nothing about the endpoints those probes target. Any honest test has to distinguish "this failed" from "this was never tested".

**The specification asks a server to describe itself.** This is the part most people have never used, and it is the most interesting axis in the whole exercise.

### The config endpoint and the endpoints array

The first call every REST catalog client makes is `GET /v1/config`. It returns the routing prefix for subsequent requests, plus a set of default and override properties. It also returns something optional and underused: an `endpoints` array. The specification describes that field as the list of endpoints the server supports, each entry formatted as an HTTP verb and a resource path separated by a space, and it defines a default set of endpoints that clients assume when a server omits the field entirely.

A catalog publishes a machine-readable list of what it supports. A client is entitled to trust that list. Which creates a checkable claim that has nothing to do with the specification text: **does a catalog agree with itself?**

That question turns out to be the sharpest instrument available. A catalog that implements 60% of the specification and says so is a well-behaved server that a client handles gracefully. A catalog that declares an endpoint and then refuses it breaks clients that do capability negotiation correctly, which is the behavior the specification is trying to encourage. The gap between declaration and behavior is the single most actionable thing a compatibility test produces.

## The seven levels

A flat percentage score is the wrong output. "Catalog X implements 71% of the specification" tells you nothing about whether X runs your workload, because the 29% it skips is either irrelevant to you or fatal to you, and the number does not say which. Levels fix that by grouping operations along the axis that matches how people actually adopt a catalog.

Here is the structure I use. Each level is cumulative in practice, though the test does not require passing a lower level to evaluate a higher one.

**L0: Handshake.** `GET /v1/config` returns 200 with a usable prefix. The server responds to an unauthenticated request with a proper 401 rather than a connection reset. Token acquisition works through a documented flow. Nothing about tables yet. L0 answers whether a stock client connects at all.

**L1: Read path.** List namespaces, check namespace existence, load namespace metadata, list tables, check table existence, load a table. This is the level that every catalog on the market passes, and it is the reason the marketing claim is technically true everywhere.

**L2: Namespace lifecycle.** Create a namespace, update its properties, drop it. Nested namespaces where the catalog supports them. This level surfaces the first real divergence, because namespace nesting depth is a per-catalog constraint and property updates are one of the operations catalogs get wrong.

**L3: Table lifecycle.** Create a table, commit an update to it, rename it, drop it. Plus the sub-probe set inside the commit endpoint: at minimum `set-properties`, `remove-properties`, `add-schema` with `set-current-schema`, `set-current-schema` standalone, and `upgrade-format-version`. L3 is where a read-only catalog scores zero by design, and where write-capable catalogs start separating from each other.

**L4: Views.** Create, load, check existence, replace, rename, drop. Six operations. Probing only `listViews` cannot distinguish an unimplemented list from unimplemented views, so all six get probed independently.

**L5: Governance and delegation.** Credential vending through `loadCredentials`, remote signing where offered, and whatever the catalog exposes for scoped access. This level matters more than its position suggests, because a catalog that vends credentials which the underlying storage policy then denies is a specific and very confusing failure mode.

**L6: Advanced protocol.** Server-side scan planning, multi-table transactions, pagination on list endpoints. These are the newest parts of the specification and the least uniformly implemented. A zero here is unremarkable in 2026. A pass here is a genuine differentiator.

The level structure means a result reads as a sentence rather than a number. "This catalog is L0 through L3 with partial L5, no L4, no L6" tells an engineer exactly what to expect. A score of 74% does not.

## Four verdicts, not two

Pass and fail are not enough vocabulary. Running this test against real catalogs produces four distinct outcomes, and collapsing them destroys the information you came for.

**Served.** The catalog returned a 2xx to a well-formed request. The capability exists.

**Refused.** The catalog returned a typed, documented error. A 400 saying that upgrading the format version is not allowed on this account is a refusal. So is a 403 on an operation the product documents as unavailable. Refusals are design decisions, and they belong in a separate bucket from breakage, because a read-only catalog refusing every write is behaving correctly.

**Absent.** The catalog returned a 404 or 405 with no typed error, or an error indicating the route does not exist. The endpoint is unimplemented.

**Not tested.** A prerequisite failed. If namespace creation was refused, every table probe inside that namespace proves nothing, and scoring those as failures manufactures a result. Not-tested cells stay visible in the output so a reader can reconstruct exactly what was and was not measured.

Two more rules make the scores mean something.

**Read and write surfaces are scored separately and never summed.** A single number folds a deliberate read-only design into the same digit as a broken write path. Reporting `L1: 6/6, L3: 0/9 (all refused)` describes a virtualization layer accurately. Reporting "43%" describes it as damaged.

**Declaration is a third axis.** For every catalog that publishes an `endpoints` array, each declared endpoint gets cross-checked against behavior. An endpoint that is declared and served is fine. An endpoint that is neither declared nor served is fine. An endpoint declared and then not served is an **overclaim**, and it is the finding that breaks real clients. A catalog that publishes nothing at all cannot be scored on this axis, which is itself worth reporting: capability discovery is unavailable, and a client has no option but to probe.

## Building the runner

The test has to be a program, not a checklist. Two design rules make the output trustworthy.

**Store the raw request and response for every probe.** A verdict that cannot be re-derived from stored evidence is an assertion. Storing the exchange means someone who disputes a result can check it without re-running against a vendor, and it means you can re-score old runs when the scoring rules change.

**Issue one identical request suite to every catalog.** Identicality is what makes the comparison fair. It also has a known cost, discussed in the failure-modes section below.

The core of the runner is small. A probe is a declarative description of one request plus the level it belongs to and the prerequisites it needs:

```python
from dataclasses import dataclass, field
from typing import Callable, Optional
import json, time, requests

@dataclass
class Probe:
    name: str
    level: str                 # "L0".."L6"
    verb: str
    path: str                  # contains {prefix}, {ns}, {table} placeholders
    surface: str = "read"      # "read" or "write"
    body: Optional[dict] = None
    requires: tuple = ()        # names of probes that must have SERVED
    declared_as: Optional[str] = None   # key used in the endpoints array

def render(path: str, ctx: dict) -> str:
    # The prefix is not a single path segment. Some catalogs return four
    # segments, some return a percent-encoded ARN. Substituting it whole,
    # without re-encoding, is the only thing that routes everywhere.
    return path.format(**ctx)

def run_probe(session, base_url, probe, ctx, results, evidence_dir):
    unmet = [r for r in probe.requires if results.get(r, {}).get("verdict") != "SERVED"]
    if unmet:
        return {"verdict": "NOT_TESTED", "blocked_by": unmet}

    url = base_url.rstrip("/") + render(probe.path, ctx)
    started = time.time()
    response = session.request(
        probe.verb, url,
        json=probe.body if probe.body else None,
        timeout=30,
    )
    elapsed_ms = int((time.time() - started) * 1000)

    with open(f"{evidence_dir}/{probe.name}.json", "w") as fh:
        json.dump({
            "request": {"verb": probe.verb, "url": url, "body": probe.body},
            "response": {
                "status": response.status_code,
                "headers": dict(response.headers),
                "body": response.text[:20000],
            },
            "elapsed_ms": elapsed_ms,
        }, fh, indent=2)

    return {"verdict": classify(response), "status": response.status_code,
            "elapsed_ms": elapsed_ms}
```

The classifier is where the four verdicts get assigned, and it carries the one piece of protocol-level knowledge that trips people up:

```python
def classify(response) -> str:
    status = response.status_code

    # Some vendor front doors answer an unrouted operation with HTTP 200
    # carrying an exception payload. Status-code-only checks read three
    # broken endpoints as working, so the body gets inspected on every 200.
    if 200 <= status < 300:
        try:
            payload = response.json()
        except ValueError:
            return "SERVED"
        if isinstance(payload, dict):
            blob = json.dumps(payload)
            if "UnknownOperationException" in blob or '"__type"' in blob:
                return "ABSENT"
            if payload.get("error"):
                return "REFUSED"
        return "SERVED"

    if status in (404, 405):
        return "ABSENT"
    if status in (400, 401, 403, 409, 501):
        return "REFUSED"
    return "ERROR"
```

That 200-with-an-exception case is not hypothetical. It is measured behavior on at least one major managed catalog, where the cloud provider's protocol layer answers operations its front door does not route. The mechanism is a layer above the catalog, and the consequence for your client is the same either way: code that checks status codes sees endpoints that work and then fails on the response body.

The declaration check runs after the probe sweep, against the `endpoints` array pulled at L0:

```python
def find_overclaims(config_response, results, probes):
    declared = set(config_response.get("endpoints") or [])
    if not declared:
        return {"declaration": "none_published", "overclaims": []}

    overclaims = []
    for probe in probes:
        if not probe.declared_as or probe.declared_as not in declared:
            continue
        verdict = results.get(probe.name, {}).get("verdict")
        if verdict in ("ABSENT", "REFUSED", "ERROR"):
            overclaims.append({
                "endpoint": probe.declared_as,
                "verdict": verdict,
                "status": results[probe.name].get("status"),
            })
    return {"declaration": "published", "declared_count": len(declared),
            "overclaims": overclaims}
```

Run the whole thing against a local Apache Polaris container first. A red cell in a permissively configured reference implementation is almost always a bug in your runner rather than a specification gap, and finding that out on your laptop is cheaper than finding it out in a vendor's support queue.

## What the 2026 evidence shows

Independent measurement published in early September 2026 probed seven catalog implementations with one identical request suite, covering 25 of the specification's 35 operations. The results line up with what the level structure predicts, and four findings deserve attention.

**Overclaims are common and concentrated in managed catalogs.** That run found eleven endpoints declared and not served across four vendors. The open-source reference implementation declared honestly and had none. Two vendors published no `endpoints` array at all, which places them outside the axis entirely and leaves a client no way to discover their surface short of probing it.

**Views are declared widely and implemented rarely.** Six view operations, six managed catalogs in that sample, and the open-source control was the only implementation serving all six. One managed catalog declared seven view endpoints and served none of them, with the failure reproducing when a native view was present in the namespace, so it was not an empty-namespace artifact.

**The commit endpoint hides most of the divergence.** Five update actions inside `POST .../tables/{table}` were probed separately. Most catalogs accepted all five. One accepted two, and refused format-version upgrades outright with a documented, account-level error. This is exactly the case that endpoint-level scoring misses: the endpoint is served, and half the actions you need are not.

**`loadTable` fidelity is not a differentiator.** Thirty field paths inside the `loadTable` response were checked across all seven catalogs. Twenty-four were identical everywhere. Of the six that differed, one came from the test fixture rather than the catalog, two reflected storage and credential configuration, and two were the difference between rendering an empty statistics list and omitting the key.

That last one is a null result and it is the most useful finding in the set. If you are worried that different catalogs return materially different table metadata, stop worrying and spend the attention on the write surface, where the real differences live.

There is a fifth finding hiding in the setup rather than the scores. Getting seven catalogs to the starting line surfaced constraints no datasheet mentions: one cloud catalog rejects table creation without an explicit location that every other catalog infers, another rejects uppercase characters in namespace names, another requires a token with a broader scope than its own native APIs need, and one vends credentials whose underlying storage policy explicitly denies writes, so an external engine creates a table through the REST catalog and then cannot write data files into it. None of that appears in a conformance score. All of it appears in your sprint.

## A worked run against the reference implementation

Everything above is procedure. Here is the shortest path from an empty directory to a scored result, using Apache Polaris in Docker as the control. Polaris is the right control because it is the open-source implementation, it declares its capabilities, and you can pin its version, which no managed catalog in this test allows.

Start the container with permissive settings, because the goal is a clean baseline rather than a production posture:

```bash
export WH=$HOME/polaris-warehouse
mkdir -p "$WH"

docker run -d --name polaris -p 8181:8181 -p 8182:8182 \
  --user "$(id -u):$(id -g)" \
  -v /etc/passwd:/etc/passwd:ro -v /etc/group:/etc/group:ro \
  -v "$WH:$WH" \
  -e HADOOP_USER_NAME="$(id -un)" \
  -e POLARIS_BOOTSTRAP_CREDENTIALS=POLARIS,root,s3cr3t \
  -e JAVA_OPTS_APPEND="-Dpolaris.features.\"ALLOW_INSECURE_STORAGE_TYPES\"=true \
     -Dpolaris.features.\"SUPPORTED_CATALOG_STORAGE_TYPES\"=[\"FILE\"] \
     -Dpolaris.readiness.ignore-severe-issues=true \
     -Dpolaris.features.\"DROP_WITH_PURGE_ENABLED\"=true" \
  apache/polaris:latest

curl -sf http://localhost:8182/q/health/ready
```

Four details in that command each cost an attempt the first time.

Local filesystem storage is refused by default, and turning it on takes two settings rather than one: `ALLOW_INSECURE_STORAGE_TYPES` permits the type, and `SUPPORTED_CATALOG_STORAGE_TYPES` adds it to the allowed list. Turning it on then escalates the production-readiness check from a warning to a fatal startup error, so `polaris.readiness.ignore-severe-issues` becomes required as well. That chain is deliberate on the project's part. A catalog that silently accepts insecure storage in production is a worse default than one that makes you say it three times.

The bind mount and the `--user` flag exist because the container writes table metadata while your client writes data files, and both need the same absolute warehouse path. Mounting `/etc/passwd` read-only is the fix for a failure that presents as a 503 storage error and is actually Hadoop's user resolution failing to map the uid.

`DROP_WITH_PURGE_ENABLED` is on for a specific reason. With it off, Polaris refuses both a purge drop and `dropView`, which puts two red cells in the control that are configuration rather than capability. Getting the control clean is the whole point.

Then acquire a token and create a catalog:

```bash
TOK=$(curl -s -X POST http://localhost:8181/api/catalog/v1/oauth/tokens \
  -d grant_type=client_credentials \
  -d client_id=root -d client_secret=s3cr3t \
  -d scope=PRINCIPAL_ROLE:ALL \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s http://localhost:8181/api/catalog/v1/config?warehouse=quickstart_catalog \
  -H "Authorization: Bearer $TOK" | python3 -m json.tool
```

That config response is your L0 result and the input to the declaration check. Save it as evidence before anything else runs. Two fields matter. The `overrides.prefix` value goes into every later URL, unmodified and un-re-encoded. The `endpoints` array is the claim the rest of the run tests.

From here the runner sweeps L1 through L6 in order, writing one evidence file per probe. On a laptop against a local container the full sweep finishes in under a minute, which is what makes it practical to run twice and diff the results.

## The level card

The output artifact is one card per catalog. Here is the shape, filled in with the pattern the September 2026 measurements produced across the seven implementations in that sample:

| Level | What it covers | Reference implementation | Typical managed catalog |
|---|---|---|---|
| L0 Handshake | config, auth, prefix | Served | Served |
| L1 Read path | list, exists, load | Served | Served |
| L2 Namespace lifecycle | create, update props, drop | Served | Served, with property updates the weak spot |
| L3 Table lifecycle | create, commit, rename, drop | Served | Served, with refusals inside the commit endpoint |
| L4 Views | six view operations | Served | Absent |
| L5 Delegation | credential vending, signing | Served | Served, with storage-policy caveats |
| L6 Advanced | scan planning, transactions, pagination | Partial | Absent |

The card carries five things beyond that grid: the date, the pinned specification revision, the account tier each catalog was measured on, the declaration status, and the setup constraints that cost more than an hour. That last line is the one architects read first, and it is the one no vendor documentation contains.

Read the card as a filter rather than a ranking. A team that needs L0 through L3 has a wide field. A team that needs views has a narrow one. A team that needs L6 today is building against something that most implementations have not shipped yet, and knowing that before the design review is the entire value of the exercise.

## Wiring the test into CI

The version of this test that earns its keep runs on a schedule against the catalogs you already use, not once against seven you are evaluating. Three jobs cover it.

**A pinned-control job.** The reference implementation at a fixed version, run on every change to the runner. Any red cell here is a runner bug, and catching it before a vendor run saves you from publishing a wrong result about somebody else's product.

**A drift job.** Your production catalog, probed weekly with the same suite, results diffed against the last run. Managed catalogs update without release notes reaching you. A capability that disappeared, or an overclaim that appeared, shows up here days before it shows up in a failed pipeline.

**A client-compatibility job.** The same suite driven through the client libraries you actually deploy, at their pinned versions. A raw HTTP probe and PyIceberg do not always agree, because the client applies its own defaults and its own capability negotiation. When they disagree, the client's behavior is the one your jobs experience.

Keep the CI output boring. A single line per level per catalog, a diff against the previous run, and an alert only on change. The full evidence stays in artifact storage for the day someone asks why a job that ran for eight months stopped working on a Tuesday.

## Reading the results without fooling yourself

A compatibility report is a measurement, and measurements have failure modes. Five of them matter enough to state before anyone acts on numbers.

**The identical-suite rule manufactures some overclaims.** One fixed request shape drawn against seven catalogs will draw a non-2xx out of an endpoint that is both implemented and honestly declared, because that vendor requires an argument the others infer. The prerequisite rule does not catch this: the namespace existed, the request shape was simply wrong for that server. The fix is a second pass. Re-drive only the cells marked as overclaims, using that vendor's documented arguments. Serving on the second shape means the declaration was honest and the probe was wrong. Refusing again means the overclaim stands, and that version of the claim survives the objection a vendor raises first.

**Trial tiers are a real confound.** Several managed catalogs are only reachable on trial accounts without a procurement cycle, and at least one refusal in the September run was worded as a restriction on that account type. A result measured on a trial says something about the trial, and saying so plainly is the difference between a report and an advertisement.

**Managed catalogs expose no version.** The open-source implementation reports a version you can pin. Most managed services do not, which means no managed result can be tied to a release, and a re-run six months later measures a different unnamed build. Date-stamp everything and resist the urge to describe a trend.

**Presence is not correctness.** The field tier checks that a field exists in a response. It never checks that the value is right. A catalog returning a syntactically valid but semantically wrong partition spec passes every probe in this suite. Correctness against the reference implementation is what the Apache REST Compatibility Kit is for, and the two tests are complementary rather than competing.

**One region, one table shape, one moment.** Every result is a point measurement. Nondeterminism shows up if you look for it: in the September run, two probes on one catalog's conflict-resolution path alternated between 409 and 500 on identical input across back-to-back sweeps. Both failed either way, so the score was stable and the status code was not. Running the sweep at least twice and reporting cells that disagree is cheap insurance.

## Five failures that look like protocol bugs and are not

Running this suite across implementations surfaces a recurring class of problem: the error message points at the specification, and the cause sits somewhere else. These five account for most of the time lost.

**The prefix is not one path segment.** Catalogs return wildly different prefixes from `/v1/config`. A local Polaris returns a single catalog name. One cloud catalog returns four segments naming a project and a catalog. Another returns a percent-encoded resource ARN. A client that treats the prefix as one segment, or that re-encodes a value the server already encoded, builds URLs the server does not route, and the resulting 404 reads exactly like an unimplemented endpoint. Substitute the prefix as an opaque string and change nothing about it. This is the single most common self-inflicted red cell in the whole test.

**Token scope is broader for the open surface than for native APIs.** At least one major platform requires a token carrying its full API scope to reach the Iceberg REST endpoint, while a token scoped to its own catalog and SQL APIs is refused. Engineers reasonably assume the narrower scope is sufficient, because it works for everything else that platform exposes. Probing the open-standard surface needs a broader credential than the vendor's own tooling does, which is worth knowing before you write the least-privilege policy.

**Vended credentials get denied by storage policy.** The catalog issues a token, the token is valid, and the object store refuses the write because a resource-based policy explicitly denies it for externally issued sessions. The result is a table created successfully through the REST catalog that no external engine writes data files into. Every probe in the catalog tier passes. The workload does not run. This is the strongest argument for putting a real append at the end of the suite rather than stopping at commit acceptance.

**Naming rules are per-catalog and undocumented until you hit them.** One catalog rejects uppercase characters in namespace names, which breaks the timestamp-stamped scratch namespaces that test runners generate by default. Another requires an explicit table location on create where every other implementation infers one. Neither shows up as a capability difference. Both stop a run cold.

**Pagination and defaults differ silently.** List endpoints return page tokens on some implementations and unbounded lists on others. A client that ignores the token gets a truncated view of a large namespace with no error at all, which is worse than a failure because nothing surfaces. Probe list endpoints against a namespace with more objects than the default page size, and check whether a token comes back.

The general lesson holds beyond these five. A conformance test that stops at HTTP status codes measures the protocol layer and misses the operational layer, and the operational layer is where projects lose weeks. Extending the suite with one end-to-end path (create a namespace, create a table, append real rows through a client library, read them back, drop everything) costs an afternoon and catches all five of the failures above.

## An operational checklist

Before you accept a catalog into a production architecture, walk this list. It takes about a day.

- Run the suite against the reference implementation first and confirm a clean control.
- Capture `/v1/config` and record whether an `endpoints` array is published at all.
- Score read and write surfaces separately, and record not-tested cells with the prerequisite that blocked them.
- Re-drive every overclaim with the vendor's documented arguments before reporting it as one.
- Probe all six view operations independently rather than inferring from `listViews`.
- Probe the five update actions inside the commit endpoint that your tooling emits.
- Run a real end-to-end append through the client library you deploy, using vended credentials.
- Test a list endpoint against more objects than the default page size.
- Record the account tier and region, because both change results.
- Run the sweep twice and report any cell that disagrees between runs.
- Date the output, pin the specification revision, and store the raw exchanges.

None of that requires vendor cooperation, which is the property that makes it worth doing.

## Using the report to pick a catalog

The output of this test is not a winner. It is a filter you apply to your own requirement list. Work it in this order.

**Start with the level you actually need.** Most teams need L0 through L3. Views push you to L4, and views are the sharpest filter in the whole test right now, because the population of catalogs serving all six view operations is small. Server-side scan planning and multi-table transactions push you to L6, where nearly everything scores zero, so a hard requirement there narrows the field to almost nothing.

**Check refusals against your write path specifically.** Ask which update actions inside the commit endpoint your tooling emits. Schema evolution tools emit `add-schema` and `set-current-schema`. Migration scripts emit `upgrade-format-version`. Maintenance jobs emit `set-properties` and snapshot operations. A catalog that refuses the one action your dbt project or your Spark procedure emits is unusable for you and fine for the team next door.

**Treat overclaims as an integration risk, not a moral failing.** An overclaim means capability negotiation is unreliable on that catalog, so your client has to hard-code assumptions or probe at startup. That is engineering work with a cost. Price it.

**Treat a missing declaration the same way.** No `endpoints` array means every client that wants to adapt has to probe. Also a cost.

**Weigh the setup constraints.** Namespace naming rules, required table locations, token scope requirements, and credential-vending policies are the things that consume the first week. They belong in the evaluation, and a compatibility report that captures them alongside the scores is worth more than one that reports only endpoint verdicts.

**Do not evaluate storage semantics as protocol conformance.** Purge behavior on drop varies by catalog: some refuse purge entirely, some refuse a plain drop and require purge, some accept both. These are different products with different storage models, and a client configures one catalog rather than swapping between them. Measure it, report it, weight it lightly.

## Publishing this as an annual artifact

A one-time measurement is a blog post. A dated, versioned, reproducible measurement that runs on a schedule is a reference, and references are what other people cite. The protocol I am committing to has six parts.

**A pinned specification revision.** Every run names the commit of `rest-catalog-open-api.yaml` it was measured against. Without it, next year's numbers are not comparable to this year's, because the denominator moved.

**A pinned runner version.** The runner is tagged per run. Scoring rule changes get a new tag and a changelog entry, so a shift in a result can be attributed to the catalog or to the test.

**Stored evidence.** Raw request and response for every probe, published alongside the scores. A reader who disagrees with a verdict re-derives it without an account.

**Explicit scope.** Which catalogs, which regions, which account tiers, how many of the 35 operations, how many of the 25 update actions, and which parts of the specification went untested. Scope statements are not disclaimers. They are the part that makes the result checkable.

**Separate read and write scoring, with not-tested visible.** Every table published with denominators that reconstruct.

**A re-run date.** The next run is scheduled and announced. A reference that arrives on a schedule is a reference. One that arrives when someone feels like it is a blog post with better formatting.

The output artifact is a level card per catalog, dated, with the four verdict counts per level, the declaration status, and the setup constraints that cost more than an hour to work around. That card is small enough to paste into an architecture decision record, which is where it does its work.

## Where the protocol is heading

Three changes over the next year will move these results, and a test built now should anticipate them.

**Capability negotiation is becoming load-bearing.** As more of the specification becomes optional, the `endpoints` array stops being an informational nicety and becomes the mechanism clients depend on. Client libraries in Python, Rust, and Go are already growing code paths that adapt based on it. Every overclaim in this report is a future client bug in a language that trusted the declaration.

**Server-side scan planning changes the shape of the contract.** Moving planning behind the catalog turns a metadata service into something closer to a query participant. It also expands the surface a compatibility test needs, because planning has its own behaviors around task granularity and result pagination that endpoint-level probes barely touch.

**Delegation is where the interesting divergence is moving.** Credential vending hands an engine a short-lived token. Remote signing hands it nothing and signs each individual file request at the catalog. For regulated data, that difference matters more than any endpoint count, and the catalogs implementing it are converging on shared configuration properties. Expect the L5 section of this report to grow faster than any other level.

The direction of travel is good. The protocol is working, adoption is near universal, and the divergences that remain are concentrated in the newest parts of the specification, which is what healthy standardization looks like. The reason to keep measuring is not that anything is broken. It is that "supports the REST catalog" carries less information every year, and somebody has to publish the sentence that carries more.

## Conclusion

The Iceberg REST catalog did what it set out to do. One HTTP API replaced a matrix of engine-specific catalog drivers, and every serious lakehouse product speaks it. What the protocol did not deliver, because no protocol delivers this, is a shared way to describe partial implementation. The specification defines a large optional surface, vendors implement the parts their products need, and the datasheet sentence stayed the same across all of them.

A compatibility test closes that gap with three things: levels that group operations the way adoption actually happens, four verdicts that separate refusals from absences from untested prerequisites, and a declaration check that measures whether a catalog agrees with its own published capability list. Run against real implementations, that method produces findings you act on: which catalog serves views, which refuses the update action your migration needs, which publishes nothing about itself, and which setup constraint eats your first week.

Run it yourself before you sign anything. Pin the specification revision, store the raw exchanges, score read and write separately, mark what you did not test, and date the whole thing. Then publish it, because the person evaluating the same catalog next quarter is doing this work from scratch right now.

## Keep Going

If this piece was useful, I have written a lot more on Iceberg catalogs and lakehouse architecture. *Apache Polaris: The Definitive Guide* covers the catalog layer end to end, from the REST protocol and RBAC model through federation and production deployment, and *Apache Iceberg: The Definitive Guide* covers the table format the protocol serves. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
