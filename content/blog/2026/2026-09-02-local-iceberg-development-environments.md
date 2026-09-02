---
title: "Local Iceberg Development Environments: Docker, MinIO, and In-Memory Catalogs for CI"
date: "2026-09-02"
description: "Local Iceberg development environments: in-process catalogs, a Docker Compose stack with MinIO, and CI configurations that run either."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Local Development
  - MinIO
  - Docker
  - CI
  - PyIceberg
canonical: https://iceberglakehouse.com/posts/local-iceberg-development-environments/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/local-iceberg-development-environments/).

A data engineer changes the merge logic in a pipeline that writes to an Apache Iceberg table. To test it, they run the job against the development catalog, which is a shared Apache Polaris instance backed by a shared bucket in the cloud. The test takes eleven minutes because the Spark job has to start a cluster. It fails, because a colleague's test left a table in a half-migrated state. The engineer drops the table, reruns, and it passes, and in the process deletes a snapshot the colleague was using. Two people have lost an afternoon and neither has learned whether the merge logic is correct.

The alternative is an Iceberg environment that runs on a laptop and in a continuous integration (CI) job, starts in seconds, owns its own catalog and storage, and can be thrown away after every test. Iceberg is unusually well suited to this because its three components, a catalog, an object store, and an engine, are all replaceable with lightweight local versions that speak the same protocols as the production ones. The metadata files a local test produces are byte-compatible with the ones production produces, so a test that passes locally is a test of the real format.

This article covers the three tiers of local Iceberg environment, from in-process catalogs that need no containers to a Docker Compose stack that mirrors production topology to CI configurations that run either in parallel, what each tier can and cannot test, the specific settings that make MinIO and the REST catalog fixture behave, and the test patterns that catch the bugs Iceberg pipelines actually have. I work at Dremio, and everything here uses open-source components that run anywhere.

## What an Iceberg Environment Needs

An Iceberg table is a metadata file on storage, tracked by a catalog, read and written by an engine. A local environment has to provide all three, and the choice at each layer determines what the environment can test.

**Catalog.** Anything that maps a table name to a metadata location and swaps that pointer atomically. Locally this can be a SQLite file, an in-memory map, or a REST server in a container. The REST option matters when the code under test talks to a REST catalog in production, because REST catalogs have behaviors, such as credential vending, namespace properties, and server-side commit validation, that a SQLite catalog does not exercise.

**Storage.** Anything the engine's file IO can read and write. Locally this is either the local filesystem, addressed with `file://` paths, or an S3-compatible server such as MinIO in a container. The filesystem is faster and simpler. MinIO exercises the S3 code path, which is where production bugs around path-style access, region configuration, multipart upload, and credential handling live.

**Engine.** PyIceberg for Python-native reads and writes without a JVM, DuckDB for SQL reads, Spark for the full SQL surface including procedures, Trino for a second engine to test cross-engine compatibility. The lighter the engine, the faster the test. The heavier, the more it can do.

The tiers below are combinations of these choices, from lightest to most faithful.

| Tier | Catalog | Storage | Engine | Startup | Tests |
|---|---|---|---|---|---|
| In-process | SQLite or in-memory | local filesystem | PyIceberg, DuckDB | milliseconds | format behavior, schema evolution, read/write logic |
| Docker Compose | REST fixture or Polaris | MinIO | Spark, Trino, PyIceberg | 20 to 60 seconds | S3 path, REST protocol, procedures, cross-engine reads |
| CI with real cloud | production catalog software | ephemeral bucket | same as production | minutes | credential vending, IAM, production parity |

Most teams need the first two. The third is for a small number of integration tests that run nightly rather than on every commit.

## Tier One: In-Process Catalogs

The fastest Iceberg environment has no containers at all. PyIceberg ships a SQL catalog that uses SQLAlchemy, and pointed at a SQLite file it becomes a complete, spec-conformant catalog in one process. Paired with a temporary directory as the warehouse, a full table lifecycle runs in under a second.

```python
import tempfile
from pathlib import Path
from pyiceberg.catalog.sql import SqlCatalog

def make_catalog():
    root = Path(tempfile.mkdtemp())
    warehouse = root / "warehouse"
    warehouse.mkdir()
    return SqlCatalog(
        "local",
        **{
            "uri": f"sqlite:///{root / 'catalog.db'}",
            "warehouse": f"file://{warehouse}",
        },
    )
```

This is a real catalog. It assigns table UUIDs, writes `metadata.json` files, performs compare-and-swap on commit, and rejects stale commits. A test that creates a table, appends data, evolves the schema, and reads back through a snapshot from before the evolution is testing exactly the code paths production uses, minus the network.

PyIceberg also has an in-memory catalog, selected with `type: in-memory`, that holds everything in a dictionary and writes files to a warehouse path. It is faster still and loses everything when the process exits, which is the point. It is the right choice for unit tests that need a catalog object and nothing else.

For SQL reads, DuckDB attaches to the same catalog or reads the metadata file directly:

```python
import duckdb

con = duckdb.connect()
con.execute("INSTALL iceberg; LOAD iceberg;")
result = con.execute(
    "SELECT count(*) FROM iceberg_scan('file:///tmp/.../warehouse/db/orders/metadata/v3.metadata.json')"
).fetchone()
```

DuckDB reading a table that PyIceberg wrote is a two-engine test in one process. It catches type mapping bugs, statistics encoding bugs, and anything PyIceberg wrote that a second implementation cannot parse.

On the JVM side, the reference library has an `InMemoryCatalog` used throughout its own test suite, and the `HadoopCatalog` against a temp directory serves the same purpose for tests that need a file-based catalog. Java tests that exercise `Table` API operations without an engine run in milliseconds this way.

The Java equivalent for unit tests uses the in-memory catalog directly:

```java
import org.apache.iceberg.inmemory.InMemoryCatalog;
import org.apache.iceberg.catalog.TableIdentifier;
import org.apache.iceberg.Schema;
import org.apache.iceberg.Table;
import org.apache.iceberg.types.Types;

InMemoryCatalog catalog = new InMemoryCatalog();
catalog.initialize("test", Map.of("warehouse", Files.createTempDirectory("wh").toString()));

Schema schema = new Schema(
    Types.NestedField.required(1, "id", Types.LongType.get()),
    Types.NestedField.optional(2, "name", Types.StringType.get()));
Table table = catalog.createTable(TableIdentifier.of("db", "t"), schema);

table.updateSchema().addColumn("created", Types.TimestampType.withZone()).commit();
assertEquals(3, table.schema().columns().size());
```

The same catalog powers a large share of the reference implementation's own test suite, which is a reasonable signal that it exercises the code paths that matter.

What tier one cannot test is anything involving the network. S3 configuration, REST catalog behavior, credential vending, and multi-process concurrency all need the next tier. And a test suite that only ever uses `file://` paths never discovers that the production code hard-coded a path separator or assumed a filesystem rename is atomic.

## Tier Two: Docker Compose With MinIO and a REST Catalog

The second tier reproduces production topology in containers. The components are a REST catalog, an S3-compatible store, and one or more engines. The Iceberg project publishes a catalog image for exactly this purpose.

`apache/iceberg-rest-fixture` is a small REST catalog server built from the Iceberg open-api module. With no configuration it runs an in-memory SQLite JDBC catalog behind the REST protocol, on port 8181, serving a catalog named `rest_backend`. Pointed at MinIO through environment variables, it becomes a REST catalog with S3 storage that any engine connects to exactly as it connects to Polaris or any other REST implementation.

A complete Compose file:

```yaml
services:
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: admin
      MINIO_ROOT_PASSWORD: password
      MINIO_DOMAIN: minio
    ports: ["9000:9000", "9001:9001"]
    networks:
      lake:
        aliases: [warehouse.minio]

  mc:
    image: minio/mc
    depends_on: [minio]
    entrypoint: >
      /bin/sh -c "
      until (/usr/bin/mc alias set local http://minio:9000 admin password) do sleep 1; done;
      /usr/bin/mc mb --ignore-existing local/warehouse;
      /usr/bin/mc anonymous set public local/warehouse;
      tail -f /dev/null"
    networks: [lake]

  rest:
    image: apache/iceberg-rest-fixture
    depends_on: [mc]
    environment:
      AWS_ACCESS_KEY_ID: admin
      AWS_SECRET_ACCESS_KEY: password
      AWS_REGION: us-east-1
      CATALOG_WAREHOUSE: s3://warehouse/
      CATALOG_IO__IMPL: org.apache.iceberg.aws.s3.S3FileIO
      CATALOG_S3_ENDPOINT: http://minio:9000
      CATALOG_S3_PATH__STYLE__ACCESS: "true"
      CATALOG_URI: "jdbc:sqlite:file:/tmp/catalog.db"
    ports: ["8181:8181"]
    networks: [lake]

  spark:
    image: apache/spark:4.0.0
    depends_on: [rest]
    environment:
      AWS_ACCESS_KEY_ID: admin
      AWS_SECRET_ACCESS_KEY: password
      AWS_REGION: us-east-1
    volumes:
      - ./spark-defaults.conf:/opt/spark/conf/spark-defaults.conf
      - ./jobs:/opt/jobs
    ports: ["4040:4040"]
    networks: [lake]
    command: tail -f /dev/null

networks:
  lake:
```

Each piece does a specific job. MinIO is the object store, and the `warehouse.minio` network alias plus `MINIO_DOMAIN` let clients that insist on virtual-host-style addressing resolve `warehouse.minio` as the bucket. The `mc` container creates the bucket on startup, because an S3 client cannot write to a bucket that does not exist and MinIO does not create buckets on demand. The REST fixture is configured with double-underscore environment variable names, which the fixture translates into dotted catalog properties: `CATALOG_S3_PATH__STYLE__ACCESS` becomes `s3.path-style-access`. The Spark container is idle until a test executes something inside it.

The `CATALOG_URI` line deserves its own explanation. The fixture's default, `jdbc:sqlite::memory:`, creates a separate in-memory database per JDBC connection, and the fixture's connection pool opens more than one connection under concurrent load. The second connection sees an empty database with no `iceberg_tables` table and every request through it fails. Pointing the URI at a file, or at `jdbc:sqlite:file::memory:?cache=shared`, gives every connection the same database. This one line is the difference between a fixture that works for a single-threaded test and one that survives a parallel test suite.

The Spark configuration file that pairs with it:

```properties
spark.jars.packages                        org.apache.iceberg:iceberg-spark-runtime-4.0_2.13:1.11.0,org.apache.iceberg:iceberg-aws-bundle:1.11.0
spark.sql.extensions                       org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions
spark.sql.catalog.lake                     org.apache.iceberg.spark.SparkCatalog
spark.sql.catalog.lake.type                rest
spark.sql.catalog.lake.uri                 http://rest:8181
spark.sql.catalog.lake.warehouse           s3://warehouse/
spark.sql.catalog.lake.io-impl             org.apache.iceberg.aws.s3.S3FileIO
spark.sql.catalog.lake.s3.endpoint         http://minio:9000
spark.sql.catalog.lake.s3.path-style-access true
spark.sql.defaultCatalog                   lake
```

The `iceberg-aws-bundle` artifact carries the AWS SDK classes that `S3FileIO` needs, and forgetting it produces a `ClassNotFoundException` deep in the first write. Path-style access is required because MinIO on a Docker network is addressed by hostname and port, not by a bucket subdomain. The endpoint uses the Compose service name, `minio`, which resolves on the `lake` network but not from the host.

PyIceberg connects from the host with the host-side ports:

```python
from pyiceberg.catalog import load_catalog

catalog = load_catalog(
    "lake",
    **{
        "type": "rest",
        "uri": "http://localhost:8181",
        "warehouse": "s3://warehouse/",
        "s3.endpoint": "http://localhost:9000",
        "s3.access-key-id": "admin",
        "s3.secret-access-key": "password",
        "s3.region": "us-east-1",
        "s3.path-style-access": "true",
    },
)
```

With both connected to the same catalog and bucket, a table written by PyIceberg from the host is immediately readable by Spark inside the container, and the reverse, which is the cross-engine test that tier one approximates with DuckDB and tier two runs for real.

### Adding Trino as a Second Engine

A second JVM engine turns the stack into a real cross-engine test bed. Trino's Iceberg connector speaks the REST protocol and reads MinIO with the same settings:

```yaml
  trino:
    image: trinodb/trino:476
    depends_on: [rest]
    volumes:
      - ./trino/catalog:/etc/trino/catalog
    ports: ["8080:8080"]
    networks: [lake]
```

With a catalog properties file at `trino/catalog/lake.properties`:

```properties
connector.name=iceberg
iceberg.catalog.type=rest
iceberg.rest-catalog.uri=http://rest:8181
iceberg.rest-catalog.warehouse=s3://warehouse/
fs.native-s3.enabled=true
s3.endpoint=http://minio:9000
s3.region=us-east-1
s3.path-style-access=true
s3.aws-access-key=admin
s3.aws-secret-key=password
```

A test then writes through Spark, reads through Trino with the `trino` Python client, and compares. The value of the second engine is that Trino's Iceberg implementation is independent of the reference library in several places, including its Parquet reader and its handling of delete files, so a table that both engines read identically is a table that conforms to the spec rather than to one implementation's interpretation of it.

### What MinIO Does Not Reproduce

MinIO is S3-compatible for the API surface Iceberg uses, and it is the right local stand-in. It is worth being clear about what it does not test, because those gaps are where a nightly cloud job earns its cost.

**Identity and access.** MinIO with root credentials tests nothing about IAM policies, bucket policies, or the scoped credentials a REST catalog vends. A production bug where the vended credential lacks permission on the `metadata` prefix cannot appear locally.

**Consistency and latency.** Production object stores have request latency, occasional slow requests, and rate limits per prefix. MinIO on a laptop has none of these. Code that is correct but slow, or that issues one request per file where a batched listing was possible, looks fine locally.

**Multipart thresholds and large objects.** MinIO handles multipart uploads correctly, but a 5 GB data file on a laptop is a test nobody runs. Size-dependent behavior in the file IO layer, such as the multipart part size and the number of concurrent parts, is exercised only against real storage at real sizes.

**Encryption and key management.** SSE-KMS, client-side encryption with a cloud KMS, and Iceberg's own table encryption with a KMS integration require the KMS. MinIO can be configured with a local key server, but the production KMS's permission model and latency are not reproduced.

**Cross-region and replication.** Anything from the disaster recovery playbook, replication lag, path rewriting against a real second region, and access-point routing, has no local equivalent.

The practical division is that the local stack tests correctness and the nightly cloud job tests the environment. A test suite where every test passes locally and one integration job runs against a scratch bucket with the production catalog software, using a scoped credential rather than an administrator one, covers both.

### Substituting Apache Polaris

The REST fixture is a catalog with no authentication, no access control, and no credential vending. Code that depends on those, which is any code that runs against Polaris in production, needs Polaris locally. The Polaris project publishes container images and a quickstart Compose configuration that stands up the server with a bootstrapped root principal. The differences from the fixture are that clients authenticate with a client ID and secret and receive a bearer token, that a catalog entity has to be created with a storage configuration before tables can be written, and that clients can request vended credentials with the `X-Iceberg-Access-Delegation` header.

Polaris in a container takes longer to start and more configuration to bootstrap. The right pattern is to use the fixture for the bulk of the test suite and Polaris for the tests that exercise principals, roles, grants, and vended credentials. A `docker compose --profile polaris up` that swaps the catalog service is one way to keep both in one file.

## Tier Three: CI Configurations

A local Compose stack works in CI too, and the question is how to run it. There are two patterns, and they trade startup time against isolation.

**Compose inside the job.** The CI job checks out the repository, runs `docker compose up -d --wait`, runs the tests against `localhost`, and tears down. This is the same environment as the laptop, which is its main virtue. The `--wait` flag blocks until every container's health check passes, which requires health checks to be defined. For the fixture, `curl -f http://localhost:8181/v1/config` is a sufficient check. For MinIO, `mc ready local`.

**Service containers.** GitHub Actions, GitLab CI, and similar systems can start containers alongside the job as services, with the job addressing them by service name. This is faster to configure but the services start before the job's own steps, so the bucket-creation step has to happen from the job rather than from an `mc` container, and dependencies between services are not expressible. For a stack with one or two containers it is fine. For the full stack, Compose in the job is simpler.

### A Complete CI Workflow

The pieces assemble into a workflow file. For GitHub Actions, using Compose inside the job:

```yaml
name: iceberg-tests
on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -e ".[test]"
      - run: pytest tests/unit -n auto       # tier one, no containers

  integration:
    runs-on: ubuntu-latest
    needs: unit
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -e ".[test]"
      - run: docker compose -f docker/compose.yml up -d --wait
      - run: pytest tests/integration -n 4   # tier two, parallel by namespace
      - run: docker exec spark /opt/spark/bin/spark-submit /opt/jobs/smoke.py
      - if: always()
        run: docker compose -f docker/compose.yml logs rest minio > compose.log
      - if: always()
        uses: actions/upload-artifact@v4
        with: { name: compose-logs, path: compose.log }
      - if: always()
        run: docker compose -f docker/compose.yml down -v
```

The unit job runs first and fast. The integration job starts the stack, runs the Python tests in parallel, runs a Spark job inside the container as a smoke test, captures container logs on failure, and tears down with `-v` so volumes do not persist. The `--wait` flag depends on health checks in the Compose file:

```yaml
  rest:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8181/v1/config"]
      interval: 2s
      timeout: 5s
      retries: 30
  minio:
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 2s
      timeout: 5s
      retries: 30
```

Without them, `--wait` returns as soon as the containers are running rather than when they are ready, and the first test races the catalog's startup.

In either pattern, three things make CI runs reliable.

**Pin every image and package version.** `apache/iceberg-rest-fixture:1.11.0`, `minio/minio:RELEASE.2026-...`, `apache/spark:4.0.0`, and an exact Iceberg runtime version in the Spark packages line. A test suite that pulls `latest` breaks on a Tuesday for reasons unrelated to any change in the code.

**Cache the Spark jars.** `spark.jars.packages` downloads from Maven on every cold start, which takes a minute or more. Either bake the jars into a custom Spark image, or cache the Ivy directory between CI runs. The custom image is the more reliable option.

**Isolate tests with namespaces, not with catalog resets.** Each test, or each test module, creates its own namespace with a unique suffix and drops it afterward. Tests then run in parallel against one catalog without interfering, and a failed test's leftovers are confined to its namespace. Resetting the catalog between tests serializes the suite and hides ordering dependencies.

A Python test fixture using the `testcontainers` library shows the pattern for tier two without a Compose file, which is convenient when tests need to run from an IDE:

```python
import pytest
import uuid
from testcontainers.core.container import DockerContainer
from testcontainers.core.network import Network
from testcontainers.core.waiting_utils import wait_for_logs
from pyiceberg.catalog import load_catalog

@pytest.fixture(scope="session")
def stack():
    net = Network().create()
    minio = (DockerContainer("minio/minio")
             .with_network(net).with_network_aliases("minio")
             .with_env("MINIO_ROOT_USER", "admin")
             .with_env("MINIO_ROOT_PASSWORD", "password")
             .with_exposed_ports(9000)
             .with_command("server /data"))
    minio.start()
    wait_for_logs(minio, "API:")
    minio.exec("mkdir -p /data/warehouse")

    rest = (DockerContainer("apache/iceberg-rest-fixture")
            .with_network(net)
            .with_env("AWS_ACCESS_KEY_ID", "admin")
            .with_env("AWS_SECRET_ACCESS_KEY", "password")
            .with_env("AWS_REGION", "us-east-1")
            .with_env("CATALOG_WAREHOUSE", "s3://warehouse/")
            .with_env("CATALOG_IO__IMPL", "org.apache.iceberg.aws.s3.S3FileIO")
            .with_env("CATALOG_S3_ENDPOINT", "http://minio:9000")
            .with_env("CATALOG_S3_PATH__STYLE__ACCESS", "true")
            .with_env("CATALOG_URI", "jdbc:sqlite:file:/tmp/catalog.db")
            .with_exposed_ports(8181))
    rest.start()
    wait_for_logs(rest, "Started")

    yield {
        "rest_uri": f"http://localhost:{rest.get_exposed_port(8181)}",
        "s3_endpoint": f"http://localhost:{minio.get_exposed_port(9000)}",
    }
    rest.stop()
    minio.stop()
    net.remove()

@pytest.fixture
def catalog(stack):
    return load_catalog("lake", **{
        "type": "rest",
        "uri": stack["rest_uri"],
        "warehouse": "s3://warehouse/",
        "s3.endpoint": stack["s3_endpoint"],
        "s3.access-key-id": "admin",
        "s3.secret-access-key": "password",
        "s3.region": "us-east-1",
        "s3.path-style-access": "true",
    })

@pytest.fixture
def namespace(catalog):
    ns = f"test_{uuid.uuid4().hex[:8]}"
    catalog.create_namespace(ns)
    yield ns
    for t in catalog.list_tables(ns):
        catalog.drop_table(t)
    catalog.drop_namespace(ns)
```

The session-scoped `stack` fixture starts the containers once per test session. The function-scoped `namespace` fixture gives every test a clean namespace and cleans up after it. Ports are dynamic, so several test sessions can run on one machine at once. The `mkdir` on MinIO's data directory is the container-native way to create a bucket without a client.

## Seeding Data and Parameterizing by Format Version

An empty catalog tests nothing. The stack needs realistic tables, and generating them locally is faster than copying from production.

DuckDB ships TPC-H and TPC-DS generators as extensions, which produce schema-realistic data at any scale factor in seconds. Generating into Arrow and writing through PyIceberg gives a table with real cardinalities and real skew:

```python
import duckdb
from pyiceberg.catalog import load_catalog

con = duckdb.connect()
con.execute("INSTALL tpch; LOAD tpch; CALL dbgen(sf=0.1);")
orders = con.execute("SELECT * FROM orders").arrow()

catalog = load_catalog("lake", **rest_config)
table = catalog.create_table(
    "seed.orders",
    schema=orders.schema,
    properties={"format-version": "3"},
)
table.append(orders)
```

Scale factor 0.1 is 150,000 orders and 600,000 line items, enough to produce multiple data files and meaningful statistics, and small enough to generate on every test session. Scale factor 1 is ten times that and is right for a nightly job that tests compaction and planning behavior at a size where they matter.

Format version deserves its own axis. A test that passes on v2 and fails on v3 is a test that found a real difference, and the cheapest way to find those is to run every table-level test against each version:

```python
@pytest.fixture(params=["2", "3"])
def format_version(request):
    return request.param

def test_merge_on_read_delete(catalog, namespace, format_version):
    table = catalog.create_table(
        f"{namespace}.t",
        schema=SCHEMA,
        properties={
            "format-version": format_version,
            "write.delete.mode": "merge-on-read",
        },
    )
    ...
```

On v2 the delete produces a position delete file. On v3 it produces a deletion vector in a Puffin file. The assertion on the `files` metadata table differs by version, and writing it that way documents the difference for the next engineer. When v4 tables are supported by the engines in the stack, the parameter list grows by one entry and every test gains a third run.

Seeded tables should also cover the shapes that break pipelines: a table with a nested struct and a list of structs, a table with a `variant` column on v3, a table with a partition spec that has been evolved once, and a table with a tag and a branch. A `seed` module that builds all of these into a dedicated namespace at session start pays for itself the first time a change breaks nested-type handling.

### One-Command Onboarding

The last step is making the stack the default way anyone on the team works with Iceberg. Three small additions do it.

A `Makefile` or task runner with `make up`, `make test`, and `make down` targets hides the Compose invocations and the environment variables. A `.env` file, committed with local-only credentials, makes the Compose file self-contained. And a dev container definition, for editors that support it, means the stack starts when the repository opens.

The measure of success is that a new engineer clones the repository, runs one command, and has a REST catalog, an object store, and an engine on their machine with seeded tables, inside five minutes and without reading a wiki page. A stack that requires a wiki page gets bypassed in favor of the shared development catalog, and the shared catalog is where the afternoon in the opening paragraph gets lost.

## Test Patterns That Catch Real Bugs

An environment is only as useful as the tests it runs. These are the patterns that find the bugs Iceberg pipelines actually have.

**Schema evolution round trips.** Write with schema A, evolve to schema B (add a column with a default, rename a column, promote a type), write again, and read the whole table. Then read as of the first snapshot. This catches writers that ignore field IDs, readers that resolve by name, and default-value handling.

**Snapshot assertions.** After every operation, assert on the `snapshots` metadata table: the operation type in the summary, the added and deleted file counts, the parent snapshot ID. A merge that produced an `append` snapshot instead of an `overwrite` is a merge that silently did something else.

**Concurrent commit conflicts.** Two threads or processes append to the same table simultaneously. Both should succeed, with one having retried. Then two update the same rows. One should fail with a validation exception under serializable isolation. A pipeline that swallows the exception and reports success has a correctness bug.

**Cross-engine reads.** Write with PyIceberg, read with Spark or DuckDB. Write with Spark, read with PyIceberg. Every combination that production uses. This catches type mapping differences, statistics encoding, and delete file handling across implementations.

**Compaction preserves content.** Run `rewrite_data_files` and assert that row count, a checksum of a sorted projection, and the set of distinct partition values are unchanged. Assert that file count went down. A compaction that drops rows is the worst bug a maintenance job can have and the easiest to test for.

**Expiry does not delete referenced files.** Tag a snapshot, expire everything, and verify the tagged snapshot's files still exist by planning a scan against it. Then drop the tag, expire again, and verify they are gone.

**Metadata size regression.** Assert that a fixed workload produces a bounded number of manifests and a bounded metadata file size. A change that disables manifest merging shows up here.

**Path portability.** Write a table, copy the warehouse directory to a new path, register the metadata file, and read. On v3 this fails because of absolute paths, which is the correct result and worth asserting. On v4 with relative paths it should succeed.

## Walkthrough: One Integration Test End to End

Putting the fixtures to work, here is a single test that exercises a write from PyIceberg, a schema evolution, a read from Spark inside the container, and a time-travel read from before the evolution. It is the shape most integration tests in an Iceberg codebase end up taking.

```python
import subprocess
import pyarrow as pa
from pyiceberg.schema import Schema
from pyiceberg.types import NestedField, LongType, StringType, DoubleType

def spark_sql(sql):
    out = subprocess.run(
        ["docker", "exec", "spark", "/opt/spark/bin/spark-sql", "-S", "-e", sql],
        capture_output=True, text=True, check=True,
    )
    return out.stdout.strip()

def test_evolution_is_visible_across_engines(catalog, namespace):
    schema = Schema(
        NestedField(1, "id", LongType(), required=True),
        NestedField(2, "sku", StringType(), required=True),
    )
    table = catalog.create_table(f"{namespace}.items", schema=schema,
                                 properties={"format-version": "3"})

    table.append(pa.table({"id": [1, 2, 3], "sku": ["a", "b", "c"]}))
    first_snapshot = table.current_snapshot().snapshot_id

    with table.update_schema() as update:
        update.add_column("price", DoubleType())
    table.append(pa.table({"id": [4], "sku": ["d"], "price": [9.5]}))

    # Spark sees the evolved schema and all four rows
    assert spark_sql(f"SELECT count(*) FROM lake.{namespace}.items") == "4"
    cols = spark_sql(f"DESCRIBE lake.{namespace}.items")
    assert "price" in cols

    # Spark time-travel to the first snapshot sees two columns and three rows
    assert spark_sql(
        f"SELECT count(*) FROM lake.{namespace}.items VERSION AS OF {first_snapshot}"
    ) == "3"
    old_cols = spark_sql(
        f"SELECT * FROM lake.{namespace}.items VERSION AS OF {first_snapshot} LIMIT 0"
    )
    assert "price" not in old_cols

    # The old rows read null for the new column in the current snapshot
    nulls = spark_sql(
        f"SELECT count(*) FROM lake.{namespace}.items WHERE price IS NULL"
    )
    assert nulls == "3"
```

The test writes with one implementation and reads with another, which is the cross-engine check. It evolves the schema and verifies both the current and historical views, which is the field-ID check. And it confirms that rows written before the column existed resolve to null, which is the projection-rule check. Three properties of the format in one test, running in a few seconds against a stack that started once for the whole session.

Running Spark through `docker exec` is deliberately simple. A `spark-sql` invocation per assertion is slow, at a few seconds each, and a suite with many Spark assertions is better served by a long-lived Spark Connect session or a Thrift server in the container. For a handful of assertions per test, the exec approach needs no extra infrastructure and is easy to read.

## Inspecting the Stack When Something Is Wrong

The advantage of a local stack over a cloud one is that every layer is inspectable. Three tools cover most debugging.

**The PyIceberg CLI** talks to the REST catalog and prints what it sees:

```bash
pyiceberg --uri http://localhost:8181 list
pyiceberg --uri http://localhost:8181 describe test_a1b2c3d4.orders
pyiceberg --uri http://localhost:8181 files test_a1b2c3d4.orders
```

`describe` shows the current metadata location, schema, partition spec, and properties. `files` lists every data file in the current snapshot with its partition and record count. When a test asserts the wrong file count, this is where the discrepancy becomes visible.

**The MinIO client** lists the bucket as raw objects:

```bash
mc alias set local http://localhost:9000 admin password
mc ls --recursive local/warehouse/test_a1b2c3d4/orders/
mc cat local/warehouse/test_a1b2c3d4/orders/metadata/v3.metadata.json | jq .
```

This is the view the catalog does not have: files that were written but never committed, old metadata versions, and the exact bytes on disk. A failed commit's orphan files show up here and nowhere else.

**Container logs** for the REST fixture show every request with its status code, which is the fastest way to see a client sending the wrong namespace, an unsupported request, or a commit that was rejected for a stale requirement. `docker compose logs -f rest` during a failing test usually explains it.

For Spark, the driver UI on port 4040 during a job and the event logs afterward show the plan and the task breakdown, which matters when a test is slow rather than wrong.

## Testing Failure: Concurrency and Interruption

Local stacks make it practical to test what happens when things go wrong, which is impossible to do safely against shared infrastructure.

**Commit conflicts.** Start two processes that both append to one table in a loop. With a REST catalog, both succeed with retries. Then start two that both `UPDATE` the same rows. Under serializable isolation, one fails with a validation exception. The test asserts that the failure is surfaced, not swallowed, and that the table's final state reflects exactly one of the updates.

**Catalog unavailability.** Pause the REST container mid-test with `docker pause rest`, attempt a commit, and unpause. The commit should fail with a connection error and leave no partial state, or succeed on retry if the client's retry window covers the pause. `commit.status-check` behavior is testable this way: pause the catalog after the client sends the commit but before it receives the response, and verify the client resolves the unknown state correctly when the catalog returns.

**Storage unavailability.** Pause MinIO during a write. The data file write fails, no commit happens, and the catalog is untouched. Resume, and `remove_orphan_files` with a short `older_than` finds the partial file.

**Slow storage.** A network emulator container, or MinIO's own request throttling, introduces latency and lets a test verify that timeouts and retries in the file IO layer behave. This catches configuration that is wrong in production but never exercised because production storage is fast.

None of these tests are exotic. They take a few minutes to write once the stack exists, and each corresponds to an incident that has happened to someone in production.

## Failure Modes

Local Iceberg environments fail in a small number of consistent ways.

**The SQLite per-connection database.** Covered above. The symptom is `no such table: iceberg_tables` under parallel tests, and the fix is the `CATALOG_URI` setting.

**Hostname mismatch between container and host.** Spark inside the network uses `http://minio:9000`. PyIceberg on the host uses `http://localhost:9000`. A configuration that uses one for both fails with a connection error on whichever side is wrong. Tables are unaffected, because Iceberg metadata stores `s3://` paths and the endpoint is a client setting, so this is a configuration mistake rather than a data one.

**Virtual-host addressing against MinIO.** An S3 client defaulting to `warehouse.minio:9000` fails DNS unless the network alias is configured. Path-style access on every client is the simpler fix.

**Missing region.** The AWS SDK refuses to sign a request without a region, even for MinIO, which ignores it. `AWS_REGION` or `s3.region` has to be set everywhere.

**Bucket does not exist.** The first write fails with a 404. The `mc` container or a `mkdir` in MinIO's data directory creates it before any client connects.

**Missing AWS bundle on Spark.** `ClassNotFoundException: software.amazon.awssdk...`. The `iceberg-aws-bundle` artifact is required alongside the Spark runtime.

**Stale state between runs.** A Compose stack with named volumes keeps the catalog database and bucket across `down` and `up`. Tests that assume a clean catalog fail on the second run. Either use anonymous volumes, or `docker compose down -v`, or design tests to use unique namespaces.

**Version drift.** The fixture is built from a specific Iceberg version. A Spark runtime from a different version can produce metadata the fixture's validation rejects, or vice versa. Pin both to the same Iceberg release.

**Port conflicts on shared CI runners.** Fixed host ports collide when two jobs land on one runner. Testcontainers' dynamic ports, or Compose with no host port mappings and tests that run inside the network, avoid it.

**Slow JVM startup mistaken for a hang.** Spark takes twenty to forty seconds to initialize and download nothing if the jars are cached, and several minutes if they are not. A test timeout set for a warm cache fails on a cold one.

## Operational Guidance

**Use tier one for most tests.** A PyIceberg SQL catalog on a temp directory is fast enough to run on every save. Reserve containers for tests that need S3, REST, or a JVM engine.

**Match production topology in tier two.** If production is Polaris on S3 with Spark and Trino, the Compose stack should be a REST catalog on MinIO with Spark and Trino. Same engines, same protocols, different scale.

**Pin versions to the production release.** The point of the local stack is parity. A local Iceberg 1.11 against a production 1.9 tests the wrong thing.

**Build a custom Spark image with jars baked in.** It removes the largest source of CI latency and the most common source of flaky network failures.

**Give every test its own namespace.** Parallel by default, isolated by construction, and leftovers are diagnosable.

**Health-check every service and use `--wait`.** Tests that start before the catalog is ready fail with connection errors that look like real bugs.

**Keep one nightly job against real cloud storage and the real catalog software.** IAM, credential vending, and object-store consistency semantics do not reproduce in MinIO, and one slow integration job catches what a hundred fast unit jobs cannot.

**Commit the Compose file and the Spark config to the repository.** The environment is part of the code. A new engineer should have a working Iceberg stack five minutes after cloning.

## Where the Ecosystem Is Heading

**Lighter catalogs.** The REST fixture is a JVM process. Rust-based REST catalogs such as Lakekeeper, Python-based ones, and Node-based ones start in under a second and are increasingly the choice for test stacks. Polaris itself is getting lighter-weight deployment modes aimed at development use.

**Engines without the JVM.** PyIceberg's write support, DuckDB's Iceberg extension gaining write capability, and the Rust and Go implementations mean a growing share of test suites need no Spark container at all. The JVM engine becomes a tier-two option rather than a requirement.

**Format-version test matrices.** With v2, v3, and v4 tables coexisting, test suites are starting to parameterize by format version, running the same test against each. The in-process tier makes this cheap.

**Testcontainers modules for Iceberg.** Community modules that bundle MinIO, a REST catalog, and configuration into one fixture are appearing for Java and Python, reducing the fixture code above to a few lines.

**Catalog conformance testing.** The REST catalog specification has a growing conformance suite, and running it against a local catalog is becoming a standard step for teams that build or configure their own.

## Conclusion

Iceberg's separation of catalog, storage, and engine, and its definition of each as a protocol rather than a product, is what makes it possible to run a faithful copy of the production lakehouse on a laptop. A SQLite catalog on a temp directory tests the format in milliseconds. A REST fixture on MinIO tests the production protocols in seconds. A Compose file committed to the repository makes both reproducible for every engineer and every CI job.

The details that matter are few: the fixture's SQLite URI, path-style access on every client, a region everywhere, a bucket that exists before the first write, pinned versions, and a namespace per test. Get those right and the eleven-minute shared-catalog test becomes a four-second local one, and the merge logic gets tested the way it should have been in the first place.

## Keep Going

If this piece was useful, I have written a lot more on building and operating Iceberg lakehouses, including the catalog and engine choices that shape a development workflow. *Architecting an Apache Iceberg Lakehouse* from Manning covers the environment and tooling decisions in more depth. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
