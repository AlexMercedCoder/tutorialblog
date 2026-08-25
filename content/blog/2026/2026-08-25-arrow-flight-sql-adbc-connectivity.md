---
title: "Arrow Flight SQL and ADBC: Why the Database Driver Is the Slowest Part of Your Query"
date: "2026-08-25"
description: "JDBC and ODBC often dominate large-result time. Flight SQL and ADBC keep data columnar from server to client, with Python, Go, and Rust examples."
author: "Alex Merced"
category: "Data Engineering"
canonical: https://iceberglakehouse.com/posts/arrow-flight-sql-adbc-connectivity/
tags:
  - Apache Arrow
  - Flight SQL
  - ADBC
  - connectivity
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/arrow-flight-sql-adbc-connectivity/).

Run a query that returns 50 million rows from a fast analytical engine and watch where the time goes. The engine plans the query in 200 milliseconds, scans a few gigabytes of Parquet in 3 seconds, and finishes executing. Then the client waits another 40 seconds. Nothing is wrong with the engine. The client is pulling results through a JDBC or ODBC driver, and that driver is converting every row from the server's wire format into driver objects, one field at a time, and then the application is converting those objects into a DataFrame, one field at a time again.

That last step is invisible in most monitoring, because it happens after the query "finishes" from the server's point of view and before the application code sees any data. It is also frequently the largest single cost in an analytical workload. A 2017 paper from CWI, "Don't Hold My Data Hostage," measured client-side result transfer across common databases and found that serialization and driver overhead dominated end-to-end time for large results, in some cases by an order of magnitude over the query itself.

The Apache Arrow community has spent the last seven years building the replacement. Arrow Flight is a transport for columnar data over gRPC. Arrow Flight SQL is a database protocol on top of it. Arrow Database Connectivity (ADBC) is a client API that returns Arrow data from any database, over Flight SQL or anything else. Together they remove the row-by-row conversion entirely: the server produces Arrow batches, the network carries Arrow batches, and the client hands the application Arrow batches with zero copies in between.

This article explains the mechanism of each layer, how they fit together, how to use them from Python, Go, and Rust, what still goes wrong, and where the ecosystem stands as of the ADBC 24 release in July 2026. I work at Dremio, which contributed the original Flight SQL JDBC driver to Arrow and speaks Flight SQL natively, so I will use it as an example. The protocols are open and the same mechanics apply to every server that implements them.

## Where the Time Goes in a Legacy Driver

Trace a large result set through a JDBC connection to understand the cost.

The database executes the query and produces rows in its internal format. For most row-oriented databases that is a native row representation. For a columnar engine, the result exists as column vectors, and the first cost is pivoting those columns into rows because the wire protocol expects rows.

The server serializes each row into its wire format. Nearly every legacy database protocol is row-oriented, text-heavy or field-tagged, and designed for transactional workloads that return a handful of rows. Fields are written one at a time, each with a length prefix or type marker. For 50 million rows and 20 columns, that is a billion individually encoded fields.

The bytes cross the network. The row format is not compact (integers are often sent as text, strings carry per-field length prefixes), so the payload is larger than the same data in a columnar layout.

The driver parses the wire format. It reads a field, determines its type, allocates a Java object or C struct for it, and stores it in a row object. For Java drivers that means a `ResultSet` backed by boxed values, and every `getInt` or `getString` call is a method dispatch plus a type check.

The application reads the ResultSet. A typical analytics client wants a DataFrame or an Arrow table. It iterates rows, pulls fields out through the accessor API, and appends them to column buffers. The data that started as columns on the server is now columns again in the client, having passed through two full row conversions and two full serialization passes to get there.

Every one of those steps is CPU-bound and single-threaded per connection. Profiles of clients pulling large results through ODBC and JDBC routinely show most of the wall-clock time in the driver and the conversion code rather than in the database or the network. The exact split depends on the driver, but the shape is the same everywhere, and it is the shape that Flight was designed to eliminate.

There is a second cost that is easier to miss: parallelism. A JDBC connection is one stream. If the result set is 50 million rows, one thread on the client pulls all of them through one socket. Engines that produce results in parallel across many nodes have to funnel everything through a single coordinator connection to the client, which turns a distributed query into a serial download.

## Arrow Flight: Columnar Batches Over gRPC

Arrow Flight, introduced in 2019, is a general-purpose framework for moving Arrow record batches between processes over the network. It uses gRPC as the transport, which gives it HTTP/2 multiplexing, TLS, authentication middleware, and generated client and server stubs in every language gRPC supports.

The key design choice is that Flight carries Arrow's IPC format directly. Arrow's in-memory layout is already a serialization format: a record batch is a schema plus a set of contiguous buffers (validity bitmaps, offsets, values) with no pointers and no per-value framing. Arrow IPC writes those buffers to a stream with a small Flatbuffers header describing them. Reading an IPC message means mapping the buffers back into memory. There is no parsing in the traditional sense, because the wire format and the memory format are the same bytes.

Flight wraps IPC messages in gRPC and adds a handful of RPC methods. The two that matter most are `GetFlightInfo` and `DoGet`. A client calls `GetFlightInfo` with a descriptor (a command, a path, or an opaque request) and receives a `FlightInfo` response containing the result schema and a list of endpoints. Each endpoint has a ticket and a location. The client then calls `DoGet` with a ticket, on the location the endpoint names, and receives a stream of record batches.

That endpoint list is what fixes the parallelism problem. A distributed engine that produces a result across 8 nodes can return 8 endpoints, one per node, each with a ticket that identifies that node's slice of the result. The client opens 8 `DoGet` streams in parallel, directly to the nodes that hold the data, and never funnels anything through a coordinator. The coordinator's job ends when it hands back the endpoint list.

Flight also has `DoPut` (client streams batches to the server, used for uploads and ingestion), `DoExchange` (bidirectional streaming), `DoAction` for out-of-band commands, and `ListFlights` for discovery. Authentication and metadata ride in gRPC headers through middleware, so a Flight server can use whatever token scheme its deployment requires.

What Flight does not define is the meaning of a descriptor or a ticket. Those are opaque bytes. Flight is a transport, and every application that used it before 2022 invented its own conventions for what a request looked like. That is the gap Flight SQL closes.

## Arrow Flight SQL: A Database Protocol on Flight

Flight SQL, introduced in February 2022, standardizes the descriptor and action payloads for SQL databases. It defines protobuf messages for the things a database client needs to do, and it maps each one onto a Flight RPC.

The core commands are:

- `CommandStatementQuery` carries a SQL string. The client sends it via `GetFlightInfo`, receives endpoints, and calls `DoGet` to stream results.
- `CommandStatementUpdate` carries a SQL string for an update or DDL. The client sends it via `DoPut` and receives an affected-row count.
- `ActionCreatePreparedStatementRequest` and its companions create, bind parameters to, execute, and close a prepared statement. Parameters are bound by sending an Arrow record batch via `DoPut`, so a batch insert of a million rows is one prepared statement and one columnar upload rather than a million parameter sets.
- `CommandGetTables`, `CommandGetCatalogs`, `CommandGetDbSchemas`, `CommandGetTableTypes`, `CommandGetPrimaryKeys`, and `CommandGetExportedKeys` return catalog metadata as Arrow batches with schemas the spec defines. A client that knows Flight SQL can browse any Flight SQL server's catalog with the same code.
- `CommandGetSqlInfo` returns server capabilities and dialect information, again in a defined Arrow schema.
- `CommandGetXdbcTypeInfo` returns the server's type system in the shape JDBC and ODBC expect, which is what lets the Flight SQL JDBC driver present a standard-looking interface.

Transactions, cancellation, and bulk ingestion were added in later revisions. Bulk ingestion in particular lets a client upload an Arrow stream to create or append to a table in one operation, and the ADBC Flight SQL driver has supported it against compatible servers since the ADBC 22 release.

The reason this design works so well is that every response is an Arrow batch with a known schema. There is no result set object to build and no per-row accessor API. A query returns a stream of batches. Catalog metadata returns a stream of batches. Type information returns a stream of batches. A client library that can read Arrow IPC can implement all of Flight SQL with a thin layer of protobuf handling on top, and that is what the language implementations are.

Dremio contributed the first Flight SQL JDBC driver to the Arrow project in Arrow 10.0.0 in November 2022. That driver matters as a bridge: a BI tool or a Java application that only speaks JDBC can talk to any Flight SQL server through it, and internally the driver pulls Arrow batches and exposes them through the `ResultSet` API. The row-by-row cost comes back at the JDBC boundary, but the network transfer and the server side are columnar, and the driver's internal buffers are Arrow vectors rather than boxed objects.

## ADBC: One Client API for Every Database

Flight SQL is a wire protocol. It describes what goes over the network between a client and a server that both speak it. It does not help you talk to a database that does not speak it, and it does not define an API for the application to call.

ADBC, introduced in January 2023 with specification version 1.0.0, is the client-side API. It is deliberately modeled on the roles JDBC and ODBC play (a database abstraction that applications code against, with drivers per database underneath) but with one change: every result is Arrow. An application asks ADBC to execute a query and gets back an Arrow stream. What happens underneath depends on the driver.

A driver for a Flight SQL server passes Arrow batches through untouched. The server sent Arrow, the driver hands the application the same Arrow. This is the zero-copy path.

A driver for a row-oriented database (PostgreSQL, SQLite, or a vendor-specific protocol) does the row-to-column conversion once, inside the driver, in native code, and hands the application Arrow. The conversion still happens, but it happens in one optimized place rather than in every application, and it happens in C or Go or Rust rather than in a Java `ResultSet` iterator.

The ADBC API surface is small: a database handle, a connection, a statement. Statements execute SQL or a bound Substrait plan, bind parameters from an Arrow batch, return an Arrow stream, and support bulk ingestion (`adbc_ingest` in Python) that takes an Arrow table and writes it to a target table in one call. Connections expose the same catalog metadata functions as Flight SQL (`GetObjects`, `GetInfo`, `GetTableSchema`), returning Arrow. The driver manager loads drivers as shared libraries so a single application binary can use PostgreSQL, Snowflake, DuckDB, and a Flight SQL server through the same code path.

The specification is at version 1.1.0, which added things like cancellation, error metadata, and statistics. The libraries are versioned separately and are at version 24 as of July 28, 2026. That release covered 57 resolved issues and 142 merged pull requests from 28 contributors. Version 23 in April added an `adbc_get_statistics` call, connection profiles in the Python driver manager, expanded JNI bindings so Java can load native ADBC drivers, and Homebrew packages. A 1.2 revision of the specification is in progress with a focus on richer metadata and catalog capabilities. After some discussion, the community set aside async APIs in the core spec to focus on other gaps, while leaving room for language-specific async surfaces where ecosystems expect them, Rust in particular.

The relationship between the three layers is worth stating plainly, because it is the most common point of confusion. Flight is the transport. Flight SQL is a wire protocol for databases on that transport. ADBC is a client API that returns Arrow from any database and can use Flight SQL, a native protocol, or anything else as its driver implementation. You can use Flight SQL without ADBC (the JDBC driver does). You can use ADBC without Flight SQL (the PostgreSQL driver does). Using both together is the fully columnar path.

## The End-to-End Data Flow

Put the layers together and trace the same 50-million-row query through the columnar path.

The client calls ADBC's execute method with a SQL string. The Flight SQL driver wraps the string in a `CommandStatementQuery` protobuf and sends it as a Flight `GetFlightInfo` request over gRPC, with the authentication token in a header.

The server plans and begins executing. Because the engine is producing results in Arrow (Dremio, DataFusion-based engines, DuckDB, and others hold results as Arrow vectors internally), there is no row pivot. The server responds to `GetFlightInfo` with the result schema and an endpoint list. For a single-node engine that is one endpoint. For a distributed engine it is one per node holding results.

The client opens a `DoGet` stream per endpoint. Each stream delivers Arrow IPC messages: a schema message, then record batches. Batches are typically a few thousand to a few hundred thousand rows each, sized by the server to balance latency and throughput.

gRPC delivers the bytes. Because IPC buffers are contiguous and self-describing, the receiving side reads the Flatbuffers header, finds the buffer offsets, and constructs Arrow arrays that point directly at the received memory. No per-value parsing occurs. A batch of 100,000 rows and 20 columns is 20 buffer sets, not 2 million field decodes.

The application receives an Arrow stream. It can convert to pandas or Polars (both are Arrow-aware and the conversion is cheap or zero-copy for most types), feed it to DuckDB or DataFusion directly, write it to Parquet, or iterate batches and never materialize the whole result.

The costs that disappear are the two row conversions, the per-field serialization, and the single-connection bottleneck. The costs that remain are the network bytes (now columnar and compressible, so smaller) and the query itself. On a large result the client-side time drops from tens of seconds to roughly the network transfer time, which on a fast link for a few gigabytes is single-digit seconds.

Here is how the two paths compare on the properties that matter:

| Property | JDBC / ODBC | Flight SQL + ADBC |
|---|---|---|
| Wire format | Row-oriented, per-field framing | Arrow IPC, per-buffer framing |
| Server-side conversion (columnar engine) | Columns to rows | None |
| Client-side parsing | Per field, allocates objects | Per buffer, zero copy |
| Result delivered to application as | Row iterator | Arrow stream |
| Parallel result fetch | One connection, one stream | One stream per endpoint, direct to data nodes |
| Batch parameter binding | Per row, per parameter | One Arrow batch |
| Bulk load | Per-row INSERT or vendor-specific loader | `DoPut` with an Arrow stream |
| Catalog metadata | Driver-specific `ResultSet` schemas | Spec-defined Arrow schemas |
| Transport | Vendor-specific, usually TCP | gRPC over HTTP/2 with TLS |
| Best fit | Small transactional results, legacy tools | Analytical results, DataFrame and ML clients |

## Code Walkthrough: Python, Go, and Rust

The Python ADBC Flight SQL driver ships as `adbc_driver_flightsql` on PyPI and exposes both a low-level API and a DB-API 2.0 compatible interface. The DB-API layer is what most people should use.

```python
import adbc_driver_flightsql.dbapi as flight_sql
from adbc_driver_flightsql import DatabaseOptions, ConnectionOptions
import pyarrow as pa

conn = flight_sql.connect(
    "grpc+tls://lakehouse.example.com:32010",
    db_kwargs={
        DatabaseOptions.AUTHORIZATION_HEADER.value: "Bearer " + TOKEN,
        DatabaseOptions.TLS_SKIP_VERIFY.value: "false",
    },
)

with conn.cursor() as cur:
    cur.execute("""
        SELECT region, product_id, sale_date, amount
        FROM lake.sales
        WHERE sale_date >= DATE '2026-08-01'
    """)
    table = cur.fetch_arrow_table()

print(table.num_rows, table.schema)

# Stream batches instead of materializing the whole result
with conn.cursor() as cur:
    cur.execute("SELECT * FROM lake.events WHERE day = DATE '2026-08-23'")
    reader = cur.fetch_record_batch()
    for batch in reader:
        process(batch)          # each batch is a pyarrow.RecordBatch

# Bulk ingest an Arrow table with one call
new_rows = pa.table({
    "region": ["east", "west"],
    "product_id": [101, 102],
    "amount": [19.99, 24.50],
})
with conn.cursor() as cur:
    cur.adbc_ingest("lake.sales_staging", new_rows, mode="append")

conn.close()
```

Walk through the pieces.

The connection string uses the `grpc+tls` scheme. Flight servers listen on a gRPC port, and the scheme tells the driver whether to use TLS. Authentication goes in `db_kwargs` as a header value because Flight passes credentials through gRPC metadata. Most servers accept a bearer token. Some accept basic auth on a handshake and return a token. The driver handles both.

`fetch_arrow_table` pulls every batch and concatenates them into one `pyarrow.Table`. That is convenient for results that fit in memory. `fetch_record_batch` returns a `RecordBatchReader` instead, which streams batches as they arrive from the server. Use the reader for large results, for pipelines that process incrementally, and for anything you are going to write straight to Parquet.

`adbc_ingest` is the bulk load path. It takes an Arrow table or reader and a target table name, and sends the data through Flight SQL's bulk ingestion command (or through a prepared INSERT with batch-bound parameters on servers that lack bulk ingest). The `mode` argument controls create, append, replace, or create-and-append semantics. This is the replacement for the "build a giant INSERT statement" pattern, and it is often 10x or more faster.

The Go driver is where the Flight SQL implementation originally matured, and it is what the C driver manager wraps for Python. Direct Go usage looks like this:

```go
package main

import (
    "context"
    "fmt"

    "github.com/apache/arrow-adbc/go/adbc"
    "github.com/apache/arrow-adbc/go/adbc/driver/flightsql"
    "github.com/apache/arrow-go/v18/arrow/memory"
)

func main() {
    ctx := context.Background()
    drv := flightsql.NewDriver(memory.DefaultAllocator)

    db, err := drv.NewDatabase(map[string]string{
        adbc.OptionKeyURI:                        "grpc+tls://lakehouse.example.com:32010",
        flightsql.OptionAuthorizationHeader:      "Bearer " + token,
    })
    if err != nil {
        panic(err)
    }
    defer db.Close()

    cnxn, err := db.Open(ctx)
    if err != nil {
        panic(err)
    }
    defer cnxn.Close()

    stmt, err := cnxn.NewStatement()
    if err != nil {
        panic(err)
    }
    defer stmt.Close()

    if err := stmt.SetSqlQuery("SELECT region, SUM(amount) FROM lake.sales GROUP BY region"); err != nil {
        panic(err)
    }
    reader, rows, err := stmt.ExecuteQuery(ctx)
    if err != nil {
        panic(err)
    }
    defer reader.Release()

    for reader.Next() {
        rec := reader.Record()
        fmt.Println(rec.NumRows(), rec.Schema())
    }
    _ = rows
}
```

The shape is identical to the Python code because it is the same API: driver, database, connection, statement, Arrow reader. Go applications get the same zero-copy path, and because Arrow Go is the reference implementation for Flight SQL servers as well, this is also the language most Flight SQL server implementations are written in.

Rust has two routes. The `adbc_core` crate defines the API traits and `adbc_driver_manager` loads C-ABI drivers dynamically, so a Rust application can use the Go Flight SQL driver through the manager. Alternatively, `arrow-flight` in arrow-rs implements Flight and Flight SQL directly and is the right choice when you are writing a server or want no dynamic loading. The Rust ADBC API is pre-1.0 and had a breaking change in ADBC 23 (returned readers are now boxed and type-erased, which also fixed a lifetime issue), so pin your version and read the changelog on upgrade.

## Prepared Statements and Columnar Parameter Binding

One capability that gets less attention than result streaming is how Flight SQL binds parameters, and it is the part that changes write-heavy and lookup-heavy workloads most.

In JDBC, a prepared statement takes parameters one row at a time. Batch mode lets you queue many parameter sets, but each set is still marshaled individually, and the wire protocol sends them as a sequence of per-row messages. A lookup of 200,000 keys against a dimension table means either 200,000 round trips, a batch of 200,000 individually encoded parameter rows, or building a giant `IN` list and hoping the parser copes.

Flight SQL binds parameters as an Arrow record batch. The client creates a prepared statement with `ActionCreatePreparedStatementRequest`, receives a handle plus the expected parameter schema, and then sends a record batch through `DoPut` where each row of the batch is one parameter set. The server executes the statement once per row or, for servers that support it, treats the batch as a relation and joins against it. Either way the parameters cross the wire as columns.

In the Python DB-API this looks like an ordinary `executemany` with an Arrow table:

```python
import pyarrow as pa

keys = pa.table({"customer_id": customer_ids})   # a list of 200,000 ints

with conn.cursor() as cur:
    cur.executemany(
        "SELECT customer_id, segment, lifetime_value "
        "FROM lake.customers WHERE customer_id = ?",
        keys,
    )
```

The driver creates the prepared statement, binds the whole table in one `DoPut`, and streams the results back. Compared to the same operation through a legacy driver, the parameter transfer is one columnar upload instead of 200,000 marshaled rows, and the result is one Arrow stream instead of 200,000 result sets or one enormous one.

The same mechanism is what makes `adbc_ingest` fast on servers that lack a dedicated bulk-ingest command. The driver prepares an `INSERT` with one parameter per column and binds the entire input table as the parameter batch. The server sees one statement and one columnar payload.

There is a schema check built in. The prepared statement response carries the parameter schema the server expects. The ADBC driver compares the bound batch against it and raises a clear error on mismatch, before any data is sent. That catches type drift (a client sending `int32` where the server expects `int64`) at bind time rather than as a silent cast or a mid-stream failure.

## Flight SQL for Service-to-Service Data Exchange

Most of the discussion of Flight SQL is about clients talking to databases. The same properties make it a strong choice for internal services that exchange tabular data, which is a use case teams often solve badly with JSON over HTTP.

Consider a feature service that computes a few hundred columns for a few million entities every hour and hands them to a model training job. The default implementation is a REST endpoint returning JSON. JSON is text, so every number is parsed from characters, every string is escaped and unescaped, and every field carries its name in every record. A 2 gigabyte Arrow table becomes 10 gigabytes of JSON, and both sides spend most of their CPU on serialization. The consumer then converts JSON to a DataFrame, which is another full pass.

Expose the same service over Flight instead, and the feature table travels as Arrow IPC batches. The producer already has the data as Arrow (or as a DataFrame that converts to Arrow cheaply), the wire format is the memory format, and the consumer receives batches it can use directly. If the service is distributed, it returns one endpoint per shard and the consumer fetches in parallel. If the consumer wants a subset, it sends a Flight SQL query and the service filters and projects before sending.

The Flight SQL layer adds discoverability to that: `CommandGetTables` and `CommandGetSqlInfo` let a consumer find out what the service exposes without reading its documentation, and the same client library that talks to the lakehouse talks to the feature service. Several teams I have talked to have standardized on Flight SQL as the interface between every internal component that produces or consumes tables, precisely so that they have one client, one auth model, and one wire format across the data platform.

The tradeoff is that Flight is a gRPC service, so it needs gRPC-aware infrastructure (load balancers, proxies, service mesh policies) and it is harder to poke at with `curl` than a REST endpoint. For a service that moves tables, that is a cost worth paying. For a service that returns a status code and a short message, it is not, and REST remains the right tool.

## Reading Benchmarks Honestly

Published comparisons of Flight SQL against JDBC and ODBC show large speedups on large results, often 10x to 20x or more on client-side time, and the reason is structural rather than clever: two full serialization passes and a row pivot are gone. I am not going to invent a number for your workload. Here is what determines yours.

Result size is the first variable. On a 100-row result, the driver overhead in either path is negligible and the difference is a few milliseconds. On a 100-million-row result, the difference is minutes. The break-even point where the columnar path becomes obviously better is somewhere in the tens of thousands of rows, and above a million rows there is no contest.

Column types are the second. Strings are where legacy drivers suffer most, because each string is an allocation plus a copy plus a character set conversion. Numeric columns are cheaper per field but still per field. A wide table with many string columns shows the largest gap.

Client language is the third. Python through a legacy driver is the worst case, because every field crosses a C-to-Python boundary. Python through ADBC never touches Python objects until the application asks for them, and if it hands the Arrow table to pandas, Polars, or DuckDB, it never does. Java through the Flight SQL JDBC driver sits in the middle: columnar over the wire, row-oriented at the API boundary.

Server parallelism is the fourth. If the server returns one endpoint, you get one stream. If it returns many and the client opens them in parallel, throughput scales with the number of streams until the network or client CPU saturates. Check whether your server does this. Not all Flight SQL servers do, and the single-endpoint case still beats JDBC but leaves a lot on the table.

Measure with your own queries, your own client language, and your own network, and measure the client-side time separately from the server-side time. The server time will not change. Everything after it will.

## Failure Modes and Warning Signs

Flight SQL and ADBC are mature enough that most of what goes wrong is operational rather than a protocol problem. These are the ones I see repeatedly.

**Message size limits.** gRPC has a default maximum message size of 4 megabytes on the receive side. A server that sends large record batches, or a client that uploads a large batch through `DoPut`, hits this limit and gets a cryptic `RESOURCE_EXHAUSTED` error. Servers and clients both need the limit raised or batches sized under it. The ADBC Flight SQL driver exposes options for this, and most servers do too. If the first large query works and the first larger one fails, this is why.

**Load balancers and gRPC.** Flight runs on HTTP/2 with long-lived streams. Layer 7 load balancers that were configured for short HTTP/1.1 requests will terminate idle streams, fail to route HTTP/2 correctly, or balance connections instead of requests. Symptoms are streams that die mid-result and connections that all land on one backend. Use a load balancer that understands gRPC, or terminate TLS and pass through at layer 4.

**Endpoint locations behind NAT.** When a server returns multiple endpoints with locations pointing at internal node addresses, a client outside the network cannot reach them. The spec allows an empty location list, which means "fetch from the same server you asked," and servers that face the public internet should either do that or return externally routable addresses. If parallel fetch works inside the VPC and fails outside it, check the locations in the `FlightInfo` response.

**Type mapping surprises.** Arrow has a richer type system than most databases. A server has to choose how to map its types to Arrow types, and the choices differ: decimals with different precisions, timestamps with or without timezone, strings as `utf8` versus `large_utf8` versus `string_view`. Applications that assume a specific Arrow type for a column break when they switch servers. Read the schema from the `FlightInfo` response rather than assuming it, and cast on the client if you need a canonical type.

**Token expiry on long streams.** Authentication happens at connection time. A result stream that runs for an hour often outlives the token that opened it. Some servers validate per-message and drop the stream when the token expires, some validate once at stream start. Know which you have, and for long-running clients use a token refresh path (the ADBC driver supports OAuth flows and header refresh) rather than a static bearer token.

**Cancellation is not free.** Closing a client cursor mid-stream sends a gRPC cancel, and a well-behaved server stops producing. Some servers finish the query anyway and discard the output, which means an abandoned dashboard query keeps burning compute for minutes. Flight SQL added an explicit cancel action for this reason. Confirm your server honors it, and watch for queries that show as complete on the server long after the client gave up.

**The JDBC bridge is not the full speedup.** Teams sometimes switch a Java application to the Flight SQL JDBC driver, measure a modest improvement, and conclude that Flight SQL is overhyped. The driver moves Arrow over the wire, which helps, but the `ResultSet` API is still row-oriented and the application still reads fields one at a time. To get the full benefit in Java, use the Arrow Java Flight SQL client directly and consume `VectorSchemaRoot` batches, or use the ADBC Java bindings.

**Drivers that convert twice.** An ADBC driver for a row-oriented database has to pivot rows to columns. That is unavoidable and it happens in native code, so it is fast. But some early or thin drivers pull rows through a legacy protocol, build Arrow from them, and leave the result no faster than a good JDBC driver. Check how a given ADBC driver is implemented before assuming it delivers the columnar advantage. The Flight SQL, DuckDB, and Snowflake drivers do. Drivers over ODBC bridges generally do not.

## Operational Guidance for Adoption

If you want to move an analytics stack onto the columnar connectivity path, here is the order I recommend.

**Start with the biggest result sets.** Find the queries in your environment that return the most rows to a client. Notebooks that pull feature tables, ETL jobs that extract to Parquet, dashboards that download raw detail for local aggregation. Those are the workloads where the driver is the bottleneck today and where the gain is immediate and measurable. Leave small transactional lookups alone.

**Check what your engine speaks.** Dremio, DuckDB (through its Flight SQL extension), DataFusion-based servers, and a growing set of warehouses and engines expose Flight SQL natively. For engines that do not, an ADBC driver over a native protocol still gets you the single-conversion path. For engines with neither, the Flight SQL PostgreSQL adapter and similar shims exist but are a stopgap.

**Use the DB-API layer in Python and keep the reader.** `fetch_record_batch` and iterate. Pass batches to Polars or DuckDB. Write them to Parquet with `pyarrow.parquet.ParquetWriter`. The moment you call `.to_pandas()` on the full table you have materialized everything and, for object-dtype string columns, reintroduced per-value overhead. Keep data in Arrow until the last step.

**Size batches and raise gRPC limits deliberately.** Configure the server's batch size (most expose it) to a few hundred thousand rows or a few tens of megabytes, and set client and server gRPC max message sizes above that with headroom. Document the two numbers together, because a change to one without the other is a future outage.

**Put a gRPC-aware proxy in front.** Envoy, or a cloud load balancer in HTTP/2 or gRPC mode, with idle timeouts set well above your longest expected stream. Test a long query through the proxy before declaring it production-ready.

**Adopt bulk ingestion for writes.** If any application builds INSERT statements from DataFrames, replace it with `adbc_ingest`. The change is a few lines and the speedup is typically the largest single win in the whole migration.

**Pin ADBC versions per language.** The specification is stable at 1.1.0. The libraries move quarterly, and the Rust and C# bindings are pre-1.0 with occasional breaking changes. Treat the ADBC library like any other driver: pin it, upgrade on a schedule, and read the release notes.

## Where the Ecosystem Is Heading

Apache Arrow turned ten in February 2026, and the connectivity layer is where much of the new contributor energy is going. Three directions stand out.

The first is ADBC 1.2. The next specification revision is focused on richer metadata and catalog capabilities, which closes the remaining gap with what JDBC's `DatabaseMetaData` and ODBC's catalog functions expose. When that lands, BI tools and SQL IDEs can discover schemas, keys, and types through ADBC as completely as they do through the legacy APIs, which removes the last reason to keep a JDBC connection around alongside an ADBC one.

The second is driver coverage. The roster now spans Flight SQL, PostgreSQL, SQLite, DuckDB, Snowflake, BigQuery, Databricks, and a growing set of vendor drivers, with the driver manager loading any of them through one interface. Each release adds a few and hardens the rest. The JNI bindings that landed in ADBC 23 mean Java applications can load native drivers rather than needing a separate Java implementation of each, which should accelerate coverage on the JVM.

The third is AI and agent workloads. Every agent framework that queries a database does so through some connectivity layer, and the result goes into a context window or a tool response. Arrow over Flight SQL, or Arrow through ADBC, is a much better fit for that than JSON over REST or rows over JDBC: the data arrives typed, columnar, and compact, and a tool that wraps ADBC can hand an agent a schema and a sample in one call. Dremio's MCP Server sits on the same Arrow-native engine that speaks Flight SQL, and I expect that pattern, an Arrow-native engine exposing both a database protocol for applications and an MCP surface for agents, to become the standard shape.

Zoom out and the thesis is the same one that drove Arrow's first decade. The in-memory format became a standard, so engines stopped converting between formats internally. The file format (Parquet) and table format (Iceberg) became standards, so engines stopped converting on the way to storage. Flight SQL and ADBC make the connection to the client a standard too, so the last place data was being converted, between the engine and the application, stops converting. Once every hop is Arrow, the only work left is the query.

## Conclusion

The database driver was designed for a world where queries returned a few rows to a transactional application, and it has been the slowest part of analytical workloads for years without showing up in most profiles. Arrow Flight replaces the row-oriented wire format with Arrow IPC over gRPC, adds parallel fetch across endpoints, and removes per-field serialization. Flight SQL standardizes the SQL commands, prepared statements, bulk ingestion, and catalog metadata on top of Flight so that one client works with every server. ADBC gives applications a single API that returns Arrow from any database, over Flight SQL when the server speaks it and through a native driver when it does not.

The mechanism is not subtle. Two row conversions and two serialization passes go away, and result transfer drops to roughly the network time. With the ADBC libraries at version 24, the specification stable at 1.1.0, drivers for the major engines in place, and Flight SQL support native in a growing list of servers, the columnar path is the default choice for any new analytical client. Start with the queries that return the most rows, keep data in Arrow until the last step, size your batches and gRPC limits together, and measure the client side on its own. That is where the time was going.

## Keep Going

If this piece was useful, I have written a lot more on Apache Arrow, query engines, and the lakehouse architecture that Flight SQL and ADBC connect to. *Architecting an Apache Iceberg Lakehouse* (Manning) covers how engines, catalogs, and clients fit together, including the connectivity layer. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
