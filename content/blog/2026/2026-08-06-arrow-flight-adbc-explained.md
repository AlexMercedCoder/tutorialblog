---
title: "Apache Arrow Flight and ADBC, and Why Database Connectivity Finally Went Columnar"
date: "2026-08-06"
author: "Alex Merced"
category: "Data Engineering"
tags:
  - Apache Arrow
  - ADBC
  - Arrow Flight
  - Dremio
  - columnar
  - database connectivity
canonical: https://iceberglakehouse.com/posts/arrow-flight-adbc-explained/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/arrow-flight-adbc-explained/).

A data scientist runs a query against a warehouse. The engine finishes the scan in three seconds. Then the notebook sits there for four minutes while the result set trickles into a DataFrame. The query was fast. The download was not.

I have watched this play out in dozens of environments, and the reaction is almost always the same. People blame the engine, add compute, rewrite the SQL, then blame the network. The engine was rarely the problem. The problem sits in the seam between the database and the application, where a columnar result set gets shredded into rows, serialized one value at a time, pushed over the wire, and reassembled into columns on the other side.

Two Apache Arrow projects attack that seam from different directions. Arrow Flight is a wire protocol that moves Arrow record batches between processes over gRPC. ADBC, short for Arrow Database Connectivity, is a client API standard that hands applications Arrow data regardless of what sits on the other end. The two get mentioned in the same breath constantly and confused just as often. They solve different halves of the same problem, and knowing which half each one owns is the difference between using them well and copying a connection string from a blog post.

One disclosure before I go further. I work at Dremio as a Data Lakehouse and AI Evangelist, and Dremio ships an Arrow Flight endpoint. Everything here about Flight and ADBC applies to any system that implements the specs. Dremio shows up as a worked example in a couple of places because I know its behavior in detail, not because the concepts belong to it.

## Why Database Drivers Became the Bottleneck

ODBC (Open Database Connectivity) shipped in 1992. JDBC (Java Database Connectivity) followed in 1997. Both were designed for a world where a query returned a few hundred rows to a form on a screen, and where the client wanted one record at a time to paint a row in a grid.

That design shows up in the API surface. You get a cursor. You call `next()` to advance it. You call `getInt(1)` and `getString(2)` and `getTimestamp(3)` to pull individual values out of the current row. Each of those calls is a function invocation with type dispatch, bounds checking, and usually a memory copy. Pull ten million rows with twelve columns and you have made one hundred and twenty million of those calls before doing any analysis at all.

Underneath the cursor the situation is worse than it looks. Analytical databases store and process data in columns, because column layouts are what make vectorized execution, SIMD instructions, and lightweight compression work. When a columnar engine finishes a query it holds the answer as a set of column vectors. To push that answer through a row-oriented driver, the server transposes the result into rows and encodes each value in the driver's private wire format. The client decodes those rows back. Then, if the client is pandas or Polars or R or a Spark DataFrame, it transposes them into columns again.

I call this the transposition tax. Data starts columnar, goes row-shaped for transport, and lands columnar again. Two full rewrites of the entire result set plus per-value encoding on both ends, for zero analytical benefit.

The tax hides when result sets are small. It dominates when they are large, which describes most of the workloads people care about now: feature extraction for training runs, ad-hoc exploration over a lakehouse table, a BI extract refresh, an agent that wants a few million rows of context before it answers. Engines get faster every year. Drivers built on a 1992 mental model do not.

A second problem sits alongside the first, quieter and just as expensive. Some databases already speak Arrow natively. An application that wants Arrow out of those systems has to integrate each vendor's own SDK, one at a time. Anyone building a tool that supports five backends faces a choice between five separate integrations and accepting the row-shaped path for all of them. Most teams accept the row-shaped path, because shipping matters.

So there are two gaps, not one. The first is the wire: how bytes travel between a database and a client without a row-shaped detour. The second is the API: what an application calls so it receives Arrow without writing a custom integration per vendor. Arrow Flight fills the first gap. ADBC fills the second. Neither one replaces the other, and the confusion between them comes almost entirely from people assuming they are competing answers to the same question.

## The Columnar Format Is What Makes Any of This Possible

Neither project makes sense without the Arrow columnar format underneath, so it is worth being precise about what that format provides.

Apache Arrow defines a standard in-memory layout for columnar data. A record batch holds a schema plus a set of contiguous buffers, one or more per column, arranged so that reading the ten thousandth value of a column is a pointer offset rather than a parse. Fixed-width numbers sit in a flat buffer. Nulls live in a separate validity bitmap. Variable-length strings use a values buffer with an offsets buffer alongside it. The layout is specified to the byte, and every implementation in every language agrees on it.

The consequence is the part people skip past. Because the layout is identical everywhere, moving Arrow data between two systems that both speak Arrow skips serialization in the usual sense. The bytes in memory are already the bytes on the wire. The Arrow IPC format wraps those buffers with a compact FlatBuffers header describing the schema and buffer positions, and that header is the entire encoding step. The receiver points its own column structures at the received buffers and starts reading.

Arrow was announced in February 2016 and was co-created by Jacques Nadeau, who went on to co-found Dremio. The project turned ten years old in February 2026. Over that decade it stopped being "the thing pandas uses to read Parquet faster" and grew into a family of specifications: the columnar format, the IPC format, the C Data Interface for handing Arrow arrays between libraries inside one process, the C Stream Interface, and the two connectivity standards this article is about.

The C Data Interface deserves its own paragraph, because it explains something about ADBC that otherwise looks odd. It is a tiny pair of C structs, `ArrowArray` and `ArrowSchema`, that any library in any language produces and any other consumes. Two libraries in the same process hand each other a pointer and a release callback, and nothing gets copied. That interface is why a driver written in Go feeds a Python client directly, or a Rust driver feeds an R session, with no marshalling layer between them. The data structure itself is the contract, which is a very different arrangement from an API that defines a set of getter methods.

## Arrow Flight, the Wire Protocol

Arrow Flight is an RPC framework for services that move Arrow data. It sits on top of gRPC and the Arrow IPC format, and it is organized around streams of record batches flowing down from or up to a service. The methods and messages are defined in Protobuf, so a client that speaks gRPC and Arrow separately still talks to a Flight service without a Flight library.

Flight implementations then add optimizations that dodge the usual Protobuf overhead, mostly extra memory copies. One example is visible in the spec itself: the `FlightData` message puts the Arrow payload in field number 1000, deliberately last, so an implementation reads that field off the socket with specialized code instead of running it through a general-purpose parser.

The service defines a compact set of methods. `Handshake` handles authentication negotiation. `ListFlights` enumerates available streams. `GetFlightInfo` turns a request into a plan for fetching results. `PollFlightInfo` does the same for long-running queries without blocking. `GetSchema` returns just the schema. `DoGet` streams data down. `DoPut` streams data up. `DoExchange` does both at once in one call. `DoAction` and `ListActions` cover everything application-specific.

### The two-step fetch

The core pattern in Flight is a deliberate split between asking and receiving.

A client builds a `FlightDescriptor`, which is either a path that names a dataset or an arbitrary binary command. The command form is what carries a SQL query. The client calls `GetFlightInfo` with that descriptor and receives a `FlightInfo` message back.

Flight does not assume the data lives on the same server that answered the metadata request. `FlightInfo` instead describes where the data actually is, as a list of `FlightEndpoint` messages. Each endpoint represents one slice of the answer and carries two things: a list of server addresses that serve that slice, and a `Ticket`, an opaque binary token the server uses to identify what the client is asking for. The client treats the ticket as meaningless bytes and hands it back untouched.

The client then calls `DoGet` with each ticket and receives a stream of record batches. Consuming every endpoint yields the full result set.

That split is the whole design. One logical query becomes N independent streams that a client fetches from N addresses, in parallel, across threads or across machines. A distributed engine with twelve executors returns twelve endpoints, and all twelve serve data at once. Compare that with JDBC, where an entire result set funnels through the single connection that issued the query, no matter how many nodes produced it.

Ordering is explicit instead of assumed. When `FlightInfo.ordered` is set, the client must produce the same answer as concatenating the endpoints front to back. When it is unset, the client returns data from endpoints in any order and interleaves them freely, which is what makes parallel fetching safe. Data inside a single endpoint always arrives in order. Some clients ignore the flag, so a server that truly needs ordering returns one endpoint and accepts the serialization.

### Locations, connection reuse, and the presigned URL escape hatch

An endpoint carries a list of locations. An empty list means the client fetches from the server it already asked. A populated list tells the client where else the data lives, and the client picks one and falls back to the next on failure.

A deployment problem hides in that design. A server behind a proxy or a port forward often has no idea what its own public address is, so it cannot list itself as a location. Flight handles this with a reserved URI, `arrow-flight-reuse-connection://?`, which tells the client to redeem the ticket on the connection it already has. The trailing empty query string looks like a typo and is not. Java's URI parser rejects `scheme:` and `scheme://`, and the C++ parser rejects an empty string, so that odd-looking form is the one representation that parses everywhere. When a spec contains a detail like that, someone hit the wall in production and wrote down the fix.

The spec also grew extended location URIs, which let an endpoint point at plain HTTP or HTTPS. If a service has already staged results as Parquet files on object storage, it returns a URL and the client performs a GET. The Flight service stops being a data path and stays in the control path. Authentication happens through a presigned URL or gets negotiated outside Flight entirely. Absent a content type saying otherwise, the client assumes an Arrow IPC stream, and a server that supports several encodings honors an `Accept` header to pick between Arrow and Parquet.

That feature changes the cost model for large exports more than its placement in the docs suggests. The bytes stop passing through the query service at all.

### Uploading and exchanging

`DoPut` mirrors `DoGet`. The client streams record batches up, with the descriptor attached to the first message so the server knows which dataset is arriving. The server streams back `PutResult` messages carrying application metadata, which is enough to build resumable writes where the server reports commit progress as it goes.

`DoExchange` opens a bidirectional stream. Both sides send at the same time inside one logical call, which fits clients that offload computation rather than storage. Emulating the same behavior with separate `DoGet` and `DoPut` calls forces the server to hold state across two requests and correlate them. One call removes that problem.

### Polling long queries

`GetFlightInfo` blocks until the query finishes. For a query that runs ten minutes, the client learns nothing for ten minutes.

`PollFlightInfo` fixes that. The server answers the first call as fast as it can with a `PollInfo` message. While the query is still running, `PollInfo` carries a fresh descriptor that the client uses for its next poll. Each response contains a complete `FlightInfo` rather than a delta, and servers only append endpoints to it, so the client starts calling `DoGet` on tickets that already exist while the rest of the query is still executing. The server holds each response until the answer actually changes, which turns polling into long polling instead of a busy loop. When the server knows how far along it is, it sets `PollInfo.progress` to a value between 0.0 and 1.0.

Partial results and real progress reporting out of a standard protocol is not a small thing. Every BI tool that ever showed a fake progress bar was faking it because the protocol underneath had nothing honest to report.

## Arrow Flight SQL, or Giving Flight a Vocabulary

Flight by itself is deliberately generic. A descriptor holds "an arbitrary binary command," which is another way of saying every vendor invents its own. Two Flight services with identical capabilities end up mutually incomprehensible, and a client has to learn each one.

Arrow Flight SQL closes that hole. It defines a standard set of Protobuf command messages that get packed into the descriptor, plus a standard set of actions, so that one client library talks to any conforming server.

The command set covers what you expect from a database protocol. `CommandStatementQuery` carries an ad-hoc SQL query. Paired with `GetFlightInfo`, it executes the query and returns endpoints to fetch from. Paired with `GetSchema`, it returns the result schema without running the query to completion. `CommandStatementUpdate` handles statements that return a row count instead of a result set, executed through `DoPut`, with the server replying with a `DoPutUpdateResult` message carrying the number of affected rows. A value of -1 there means the server does not know.

Prepared statements use the action channel. The client calls `DoAction` with `ActionCreatePreparedStatementRequest` and gets a handle back. For each execution, the client binds parameters by streaming them through `DoPut` as Arrow record batches, then calls `GetFlightInfo` with `CommandPreparedStatementQuery` and fetches from the returned endpoints. When it is done, `DoAction` with `ActionClosePreparedStatementRequest` releases the handle. Parameters as Arrow batches is a nice detail: binding ten thousand parameter sets is one columnar stream rather than ten thousand round trips.

Catalog metadata works the same way, and this is my favorite part of the design. `CommandGetTables`, `CommandGetDbSchemas`, `CommandGetCatalogs`, `CommandGetTableTypes`, `CommandGetPrimaryKeys`, and their siblings all follow the identical request pattern: send the command with `GetFlightInfo`, receive a `FlightInfo`, call `DoGet` with the ticket. SQL metadata comes back as Arrow data with a defined schema. There is no second, weirder API for introspection. The list of tables in a catalog arrives as a record batch you filter with the same code you use for query results.

Flight SQL also standardizes session options for things like the active catalog and schema, and it defines a bulk ingestion command that loads a stream of record batches into a target table through `DoPut` and returns the row count.

### The compatibility bridge nobody talks about enough

The piece that made Flight SQL adoptable in real companies is the Flight SQL JDBC driver. It is a normal JDBC driver, a jar you drop into an existing tool, that speaks Flight SQL underneath. The connection string looks like `jdbc:arrow-flight-sql://host:port` and the driver class is `org.apache.arrow.driver.jdbc.ArrowFlightJdbcDriver`.

That driver does not remove the transposition tax at the client edge, because JDBC's API is still row-oriented and the last hop has to hand rows to the calling application. What it removes is everything upstream: the vendor-specific wire format, the server-side row encoding, and the single-connection funnel. A tool that has no idea what Arrow is gets parallel endpoint fetching and Arrow-native transport for free, with no code changes. There is an equivalent ODBC driver for Flight SQL that plays the same role for the ODBC world.

For teams migrating, that bridge is the whole plan. Point existing BI tools at the Flight SQL JDBC driver, get the wire benefits immediately, then move the code you control to ADBC where the columnar path runs all the way into memory.

## ADBC, the API Side of the Problem

Flight SQL solves the wire. It does not solve the application's problem, which is that an application wants one API and its data lives in five places, only three of which speak Flight SQL.

ADBC is an API standard for database access libraries that uses Arrow for result sets and query parameters. Applications build against the ADBC API and link drivers that implement it. A driver manager sits in front, dynamically loading drivers and dispatching calls, the same shape as the ODBC and JDBC driver managers people already understand.

The object model is small enough to hold in your head. An `AdbcDatabase` holds shared state, configuration, and caches across connections. An `AdbcConnection` is one logical connection. An `AdbcStatement` holds query state and covers both one-off queries and prepared statements. Statements are reusable, with the caveat that reusing one invalidates any result set still open from a previous execution. Results come back as a stream of Arrow record batches, exposed as whatever the host language calls a RecordBatchReader.

The important design decision is what ADBC does not require. It does not require the backend to speak Arrow, or Flight, or anything in particular. An ADBC driver for a system that already returns Arrow passes buffers through with almost no work. An ADBC driver for PostgreSQL converts row-oriented results into Arrow inside the driver, once, in optimized code, instead of leaving every application to do it separately in Python or Java. The application sees the same API either way.

That is the cleanest way to state the relationship. ADBC is the client-side API. Flight SQL is a wire protocol a server speaks. The ADBC Flight SQL driver connects the two. An ADBC driver is also free to speak a native protocol, and several do.

### What version 1.1.0 of the spec added

The ADBC API specification is versioned separately from the libraries that implement it. The spec sits at 1.1.0. The libraries shipped version 23 in April 2026, with a 1.2 milestone under way focused on richer metadata and catalog capabilities. Subcomponents version independently, which is why a Python wheel reports 1.11.0 while the Rust and Java packages report 0.23.0 in the same release.

Revision 1.1.0 is worth knowing in detail, because most of what makes ADBC interesting operationally arrived there.

**Canonical options.** The names `uri`, `username`, and `password` became standard across drivers. Before that, configuration was per-driver guesswork.

**Cancellation.** Queries and metadata operations can be cancelled. Anyone who has tried to kill a runaway JDBC query from a notebook knows why this earns a line in a changelog.

**Statistics.** Drivers expose table and column statistics such as row counts and min/max values. The stated goal is federation: when one query engine reads Arrow data from another database, the outer planner uses those statistics to pick a join order or skip reading data entirely. This is one of the places ADBC stops looking like a driver spec and starts looking like plumbing for distributed query planning.

**Rich error metadata.** Errors already carried a status code, a message, an optional vendor code, and an optional five-character SQLSTATE. Revision 1.1.0 added a list of structured metadata alongside those, so a driver returns machine-readable error details instead of a string an application parses with a regular expression.

**Bulk ingestion modes.** In addition to create and append, ADBC gained `replace`, which drops existing data and then creates, and `create_append`, which creates the table when absent and appends when present.

**Incremental execution.** Combined with partitioned result sets, this lets a driver hand back endpoints as they become available rather than blocking until the entire query completes. This is the ADBC-level expression of what `PollFlightInfo` does at the Flight level.

**Getting options, not just setting them.** Earlier versions let you set string options and nothing else. Now options are readable and typed, which is how the active catalog and schema get exposed as a pair of canonical options.

### Partitioned result sets

Partitioned result sets deserve their own note because they are where ADBC and Flight line up most directly.

`AdbcStatementExecutePartitions` returns a set of opaque partition descriptors instead of a single stream. The client distributes those descriptors across threads, processes, or machines, and each worker opens its own reader. In the Flight SQL driver, each ADBC partition contains a serialized `FlightInfo` holding one of the original `FlightEndpoint` messages. A client that wants to be clever deserializes it, reads the locality information, and schedules workers near the data. A client that does not care ignores all of it and reads the partitions in whatever order it gets them.

That is the design working correctly. The abstraction stays simple for the common case and does not hide the underlying detail from the caller who needs it.

## A Worked Example, From Raw Flight Up to ADBC

Reading protocol descriptions only gets you so far. Here is the same job at two levels of abstraction.

First, raw Flight against a Dremio endpoint using PyArrow. This is the two-step fetch with nothing hiding it.

```python
from pyarrow import flight

# Dremio's Arrow Flight endpoint listens on 32010 by default.
# Use grpc+tls:// against a TLS-enabled deployment.
location = "grpc://localhost:32010"

client = flight.FlightClient(location=location)
options = flight.FlightCallOptions(
    headers=[(b"authorization", f"bearer {token}".encode("utf-8"))]
)

query = """
SELECT vendor_id, pickup_datetime, trip_distance_mi
FROM Samples."samples.dremio.com"."NYC-taxi-trips"
WHERE trip_distance_mi > 10
"""

# Step one: ask. The server plans the query and describes where results live.
flight_info = client.get_flight_info(
    flight.FlightDescriptor.for_command(query), options
)

# Step two: receive. One DoGet per endpoint.
tables = []
for endpoint in flight_info.endpoints:
    reader = client.do_get(endpoint.ticket, options)
    tables.append(reader.read_all())
```

Three things in that snippet are worth pointing at.

`FlightDescriptor.for_command` wraps the SQL string as a command descriptor. The server decides what those bytes mean. Against a Flight SQL server, the descriptor carries a Protobuf `CommandStatementQuery` message instead of a bare string, which is exactly the standardization Flight SQL adds.

The authorization header rides as gRPC call metadata rather than living in the connection string. Every call carries it.

The loop over endpoints is sequential here, and that is the part to fix in real code. Those `do_get` calls are independent. Running them on a thread pool is where the parallel fetch benefit actually shows up, and writing the loop serially throws away the main advantage of the protocol.

Now the same job through ADBC. Notice how much of the protocol disappears.

```python
import os
import adbc_driver_flightsql.dbapi
import adbc_driver_manager
from adbc_driver_flightsql import ConnectionOptions, DatabaseOptions

uri = "flightsql://localhost:32010?transport=tcp"

conn = adbc_driver_flightsql.dbapi.connect(
    uri,
    db_kwargs={
        adbc_driver_manager.DatabaseOptions.USERNAME.value: os.environ["DREMIO_USER"],
        adbc_driver_manager.DatabaseOptions.PASSWORD.value: os.environ["DREMIO_PASS"],
        DatabaseOptions.WITH_MAX_MSG_SIZE.value: "134217728",
    },
)

# Timeouts are floating-point seconds and are not set by default.
conn.adbc_connection.set_options(**{
    ConnectionOptions.TIMEOUT_QUERY.value: 300.0,
    ConnectionOptions.TIMEOUT_FETCH.value: 300.0,
})

with conn.cursor() as cur:
    cur.execute("""
        SELECT vendor_id, pickup_datetime, trip_distance_mi
        FROM Samples."samples.dremio.com"."NYC-taxi-trips"
        WHERE trip_distance_mi > 10
    """)
    table = cur.fetch_arrow_table()

conn.close()
```

Walking through the parts that matter:

The `flightsql://` URI scheme is the current form. The transport is chosen with a query parameter that is matched without regard to case: `transport=tls` for gRPC over TLS, which is also the default when the parameter is absent, `transport=tcp` for plaintext, and `transport=unix` with a socket path for a Unix domain socket. An unrecognized transport value gets rejected outright rather than silently falling back, and mismatched combinations such as a host with `transport=unix` are rejected too. The older `grpc://`, `grpc+tcp://`, `grpc+tls://`, and `grpc+unix://` schemes still work and map onto the same transports, which is why so much existing code and documentation shows them.

`USERNAME` and `PASSWORD` come from the shared `adbc_driver_manager` namespace because they are canonical options in spec revision 1.1.0. The driver sends credentials, the server responds with an `authorization` header on the first request, and the driver returns that value on every subsequent call. Driver-specific settings such as `WITH_MAX_MSG_SIZE` come from the Flight SQL driver's own `DatabaseOptions` enum. Two namespaces, and the split tells you which options are portable across drivers and which are not.

Timeouts are set on the connection and expressed as floating-point seconds. `TIMEOUT_QUERY` bounds the `GetFlightInfo` call. `TIMEOUT_FETCH` bounds the `DoGet` calls that pull batches as the result set is consumed. There is also `TIMEOUT_UPDATE` for calls that write, and a connect timeout set at the database level that defaults to twenty seconds.

`fetch_arrow_table` returns a PyArrow Table, columnar from server memory to client memory. For anything that does not fit comfortably in RAM, use `fetch_record_batch` and iterate. The API makes the streaming path available and does not force it on you, which is a decision you have to make deliberately.

The part I want to emphasize is what happens if you point this at PostgreSQL instead. You swap `adbc_driver_flightsql` for `adbc_driver_postgresql`, change the URI, and the rest of the code stays. PostgreSQL has no idea what Arrow is. The driver performs the row-to-column conversion once, internally, and the application still receives a PyArrow Table. That portability, not raw speed, is the argument that wins engineering debates.

## What the Data Path Looks Like End to End

| Path | Server-side work | Wire format | Client-side work | Parallel fetch |
|---|---|---|---|---|
| Classic JDBC or ODBC to a columnar engine | Transpose columns to rows, encode per value | Vendor-specific row protocol | Decode per value, transpose back to columns | No, one connection |
| Flight SQL JDBC driver | None, batches go out as Arrow IPC | Arrow IPC over gRPC | Driver materializes rows for the JDBC API | Yes, across endpoints |
| ADBC over Flight SQL | None, batches go out as Arrow IPC | Arrow IPC over gRPC | None, buffers are used in place | Yes, across endpoints |
| ADBC over a row-oriented database | Normal row encoding | Vendor-specific row protocol | Conversion happens once inside the driver | Driver dependent |

The middle two rows are where most migrations land. The bottom row is the one people forget exists, and it is the reason ADBC is worth adopting even in a shop with no Arrow-native systems at all.

On numbers: a 2022 study benchmarking Arrow Flight measured a Flight-based path against a Dremio deployment running roughly 20 times faster than turbodbc and roughly 30 times faster than a conventional ODBC connection on the NYC taxi dataset. Apache Doris reported speedups in the tens of times after adding Flight SQL in version 2.1. Treat all of these as directional. The size of the win tracks how much of the transposition tax your specific path was paying, and a workload dominated by a query that returns four hundred rows will show no difference at all.

## Where It Breaks

This is the section I wish more protocol articles had. Flight and ADBC both have sharp edges, and most of the support threads I see trace back to the same handful.

**The 16 MiB message ceiling.** The Flight SQL driver defaults to a 16 MiB maximum incoming gRPC message size. A single record batch bigger than that fails with an internal error about a message larger than the maximum. Wide tables with large string columns hit this fast. Raise `adbc.flight.sql.client_option.with_max_msg_size`, or get the server to emit smaller batches, and prefer the second where you control the server.

**No timeouts by default.** RPC timeouts are unset unless you configure them. A network partition mid-fetch leaves a client hanging with no natural end. Set the query, fetch, and update timeouts on every connection you build. This is the single most common operational mistake I see with the driver.

**Bulk ingestion is missing from the Flight SQL driver.** Flight SQL has no dedicated bulk ingestion API at the driver's level of support, so the ADBC Flight SQL driver does not implement ADBC bulk ingestion. Code that calls the ingest API against PostgreSQL and expects the same call to work against a Flight SQL endpoint gets a surprise. Plan writes accordingly.

**Metadata gaps.** The Flight SQL driver does not populate column constraint information such as primary and foreign keys in `AdbcConnectionGetObjects`. Catalog filters are evaluated as plain string matches rather than `LIKE` patterns. Tools that build a schema browser on top of driver metadata need to know both facts before a user files a bug.

**Secondary connections are not pooled or retried.** When endpoints carry locations, the driver opens connections to those locations, tries each location in order until one succeeds, and does not cache or pool the connections it opens. It also does not retry a failed request. In a cluster where nodes come and go, that behavior belongs in your retry strategy at the application level.

**Layer 7 load balancers and stateful auth.** The Flight authentication spec is direct about this. A handshake pattern that establishes trust once and skips validating a token on every call is not secure when a layer 7 load balancer sits in the path, which is the common gRPC deployment, or when gRPC transparently reconnects underneath. Validate on every call.

**Memory.** Arrow is fast partly because it holds data in wide contiguous buffers. Fetching a hundred million rows into a Table means holding a hundred million rows in memory. The columnar path did not repeal arithmetic. Stream with `fetch_record_batch` when the result set is large, and size client memory against the widest result your users can produce, not the average one.

**Type mapping.** Arrow's type system and any given database's type system overlap without matching. Decimal precision and scale, timestamp units and time zones, and null-typed arrays all need attention when binding parameters. Recent driver releases have shipped fixes in exactly these areas, including reconciling Arrow NA arrays against PostgreSQL types and correcting Arrow decimal conversion. Test your type edges rather than trusting them.

**Implementation parity.** The Java implementation of the Flight SQL driver does not support every option the Go implementation does. If your deployment plan assumes identical behavior across languages, verify it against the driver status page before you commit to an architecture.

## Operational Guidance

A short list of the settings and habits that separate a working deployment from a fragile one.

**Set every timeout.** Query, fetch, update, and connect. Floating-point seconds. Do it at connection construction so no code path escapes it.

**Tune the read-ahead queue with intent.** The Flight SQL driver queues a limited number of batches per partition, defaulting to five, controlled by `adbc.rpc.result_queue_size`. Raising it increases throughput on fast networks and increases client memory in proportion to batch size times partition count. Do that arithmetic before changing the number.

**Fetch endpoints in parallel or let the driver do it.** The ADBC Flight SQL driver already fetches all partitions in parallel and returns data in partition order. Hand-rolled PyArrow Flight code does not, unless you write the concurrency yourself. This is the strongest practical argument for using ADBC over raw Flight in application code.

**Use TLS and prefer OAuth for machine identities.** The driver supports mutual TLS, an HTTP-style username and password scheme, and OAuth 2.0 flows including client credentials and RFC 8693 token exchange. Client credentials is the right default for service-to-service access. Reserve `tls_skip_verify` for local development and never let it reach a shared environment.

**Turn on tracing when you are diagnosing, not by default.** The Go-based Flight SQL driver emits OpenTelemetry traces for connection and statement activity, configured through `adbc.telemetry.traces_exporter` or the standard `OTEL_TRACES_EXPORTER` environment variable. Exporter choices are `none`, `otlp`, `console`, and `adbcfile`, which writes rotated JSON Lines files to a platform-specific directory. For quick local debugging, `ADBC_DRIVER_FLIGHTSQL_LOG_LEVEL` set to `debug` gives structured client-side logs without standing up a collector.

**Enable cookie middleware when the server needs sessions.** Flight SQL session options, including the active catalog and schema, ride on transport-level state, typically HTTP cookies. Session support in the driver assumes cookie middleware is on, and it is off by default. Servers that manage sessions will misbehave without it, usually in ways that look like an authentication problem.

**Migrate in two stages.** Stage one: point existing BI tools and JDBC-bound applications at the Flight SQL JDBC driver. No application code changes, and you capture the server-side and wire-level wins immediately. Stage two: move Python, Go, Rust, and R code that you own to ADBC, so the columnar path runs uninterrupted into DataFrame memory. Trying to do both at once turns one migration into two simultaneous ones with a shared blast radius.

**Use connection profiles and driver manifests.** Recent ADBC releases added driver manifests and connection profiles, with the Python driver manager gaining explicit parameters for profiles. Configuration in files instead of scattered across connection strings is how this stops being a per-notebook secret management problem.

## Where the Ecosystem Is Heading

Three things are worth watching.

The driver roster keeps growing. ADBC ships drivers for PostgreSQL, SQLite, Snowflake, BigQuery, DuckDB, and Flight SQL, plus a JDBC adapter for everything else, and the release cadence has been steady. The libraries reached version 22 in January 2026 and version 23 in April 2026, with recent releases adding JNI bindings so Java applications call C, Go, and Rust drivers, Homebrew packaging, and a statistics API in Python. Adoption has reached the point where ADBC turns up in dbt, DuckDB, Snowflake, and Microsoft tooling rather than only in Arrow-adjacent projects.

Commercial attention arrived. A group of Arrow engineers founded a company called Columnar to work on ADBC-based connectivity, raised a four million dollar seed round, and shipped a first batch of ADBC drivers along with a command-line tool for downloading, installing, and configuring drivers across environments. Independent investment in driver distribution is a healthy signal for a standard, because packaging and installation are where connectivity standards usually die.

The AI workload is pulling in the same direction. Agents and retrieval pipelines fetch large volumes of tabular context, repeatedly, under latency pressure. A row-oriented driver in that path is the same bottleneck it always was, now hit far more often per user request. Anything that shortens the distance between a query engine and a DataFrame gets attention it did not get five years ago.

On the standards side, the ADBC spec sits at 1.1.0 with a 1.2 milestone in progress focused on richer metadata and catalog capabilities. Arrow itself published a formal security model in February 2026 covering the columnar format, the C Data Interface, and the IPC format, which is the sort of unglamorous artifact that shows a project is being adopted in places with compliance requirements. Flight has picked up extended location URIs, session options, and polling since 1.0. The specs keep gaining capability without breaking the shape that made them adoptable.

## Conclusion

The mental model is simple once the pieces are separated. Arrow gives every system the same in-memory layout. Flight moves that layout between processes over gRPC, splitting one logical result into parallel streams that a client fetches independently. Flight SQL gives Flight a standard database vocabulary so one client works against any conforming server. ADBC gives applications a single API that returns Arrow no matter what the backend speaks, using Flight SQL when the backend speaks it and doing the conversion inside the driver when it does not.

The gain comes from deleting work rather than adding cleverness. No transposition on the server. No per-value decoding on the client. No re-transposition into a DataFrame. Plus parallel fetching that a single-connection cursor was never able to give you.

None of this helps a query that returns four hundred rows to a dashboard tile. It helps enormously when a person or an agent asks for millions of rows and then waits. That second case is a bigger share of the workload every year, which is why a specification about database drivers turned out to be one of the more consequential things the Arrow community has shipped.

Start where the cost is highest. Find the job in your environment where the query finishes quickly and the transfer does not. Measure it. Then put ADBC in front of it and measure again.

## Keep Going

If this piece was useful, I have written a lot more on lakehouse architecture and the open standards underneath it.
*Architecting an Apache Iceberg Lakehouse* (Manning) covers how the storage, catalog, and connectivity layers fit together in a working lakehouse, including where Arrow sits in the stack.
You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
