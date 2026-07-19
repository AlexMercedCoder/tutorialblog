---
title: "REST Catalog Credential Vending for Iceberg"
date: "2026-07-13"
description: "An in-depth exploration of rest catalog credential vending for iceberg"
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - REST Catalog
  - Security
  - Credential Vending
  - Iceberg
canonical: "https://iceberglakehouse.com/posts/rest-catalog-credential-vending-zero-copy-security/"
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/rest-catalog-credential-vending-zero-copy-security/).

Handing a query engine a long-lived cloud storage key so it can read an Iceberg table is one of the most common and most dangerous patterns in lakehouse deployments. That key is broad, hard to rotate, and once it exists it tends to spread into config files, notebooks, CI systems, and every engine cluster that touches the data. Credential vending replaces that pattern. Instead of distributing static keys, an Iceberg REST catalog issues short-lived, scoped storage credentials at the moment a client needs them, for exactly the table and operation the client is authorized to perform, expiring shortly after.

This post explains why static cloud keys break multi-engine lakehouses, how the credential vending handshake works, the important distinction between what the catalog controls and what object storage controls, how Polaris-style vending is configured at a conceptual level, and why this mechanism matters specifically for autonomous agents. The theme throughout: open lakehouses only work at enterprise scale when storage access is scoped, temporary, and mediated through a trusted catalog rather than granted directly.

## Why Static Cloud Keys Break Multi-Engine Lakes

A static cloud credential, an IAM key or equivalent, is a bearer secret that grants whatever access its policy allows for as long as it exists. In a single-engine, single-team setup you might manage that risk. In a multi-engine lakehouse it breaks down along several axes at once.

Rotation is painful. A long-lived key that many clients depend on is hard to rotate because rotating it means updating every place that holds a copy, in lockstep, without breaking running workloads. In practice this means keys get rotated rarely, which means a leaked key stays valid for a long time. The very thing that makes static keys convenient, that they keep working, is what makes them dangerous.

Leakage is nearly inevitable. Long-lived credentials end up in configuration files checked into repositories, in notebooks shared between analysts, in CI pipeline settings, and in the environment of every engine cluster that reads the data. Each of those is a place the key can leak, and the more engines and clients you add, the more copies exist and the more surfaces there are to leak from.

Over-scoping is the default. It is easier to grant a key access to a whole bucket than to carefully scope it to the specific prefixes a client actually needs, so keys tend to be broader than the workload requires. A key scoped to an entire bucket, leaked, exposes everything in that bucket, not just the one table the client legitimately used.

Blast radius grows with engines. In a multi-engine lakehouse, Spark, Trino, a Python client, and a query engine might all read the same tables. If each client holds direct object storage credentials, then compromising any one client's environment compromises the storage those credentials reach. The blast radius is the union of what every client's key can touch, and that union grows with every engine you add.

For autonomous agents this is acute. An agent tool that holds a broad storage key is a piece of software, driven by a non-deterministic model, that can read or write cloud storage directly. That is precisely the actor you least want holding a long-lived, broadly scoped credential. Credential vending exists to make sure it never does.

There is also an auditability gap with static keys that is easy to overlook. When many clients share a key, or when a key is broadly scoped, the object storage access logs tell you that the key was used but not which client, which table, or which user was behind the access. Attribution collapses. If you later need to answer "who read this sensitive table last Tuesday," a shared static key gives you no clean answer, because every client looks the same to storage. Vended credentials, because they are minted per request against a specific identity for a specific table, restore that attribution: the catalog knows who asked for what and when, and the storage access maps back to a narrow, identified grant. For anything touching regulated or sensitive data, this attribution is not a nicety, it is a requirement, and it is one that static keys structurally cannot meet.

## How Credential Vending Works

Credential vending inverts the model. Instead of the client holding storage credentials, the catalog holds the authority and issues temporary, scoped credentials on demand. The [Iceberg REST catalog spec](https://iceberg.apache.org/rest-catalog-spec/) defines the protocol that carries this, and the [REST OpenAPI definition](https://github.com/apache/iceberg/blob/main/open-api/rest-catalog-open-api.yaml) describes the concrete shapes involved. The handshake proceeds in a clear sequence.

First, the client authenticates to the catalog. This uses the client's own identity, established through the catalog's authentication, not a shared storage key. The catalog now knows who is asking.

Second, the catalog authorizes the request for a specific table or namespace. The client asks to load a table, and the catalog checks whether this identity is permitted to access that table. This is a catalog-level decision about table access, made entirely independently of object storage.

Third, if authorized, the catalog returns the table metadata plus scoped temporary storage credentials, or a reference the client can use to obtain them. The metadata tells the engine where the table's files live. The temporary credentials let the engine actually read or write those files, and only those files, for a short time.

Fourth, the engine uses the temporary credentials to read or write the table's data in object storage directly. This preserves zero-copy: the engine talks to storage itself for the bulk data path, so there is no proxying of large data through the catalog. The catalog mediates authorization, not the data stream.

The scoping is what makes this safe. Vended credentials can be scoped by bucket, by prefix, by table, by operation, and by expiration. A credential vended for a read of one table is scoped to that table's storage location, for read only, expiring in minutes. It cannot read a different table, cannot write, and stops working shortly after it is issued. Compare that to a static key scoped to a whole bucket that never expires. The vended credential's blast radius, if leaked, is a single table for a few minutes. That is the entire point.

The zero-copy property is worth dwelling on, because it is what distinguishes credential vending from simply proxying all data through the catalog. A naive way to secure storage access would be to route every read and write through the catalog itself, so the catalog acts as a gatekeeper on the actual bytes. That works, but it makes the catalog a throughput bottleneck and a single point of failure for the data path, and it defeats the performance model of a lakehouse where engines read large volumes directly from object storage in parallel. Credential vending avoids this entirely. The catalog is in the path only for the small, fast authorization step: authenticate, authorize, mint credentials. The large data transfer happens engine-to-storage, directly, using those credentials. So you get the security of mediated authorization and the performance of direct storage access at the same time. The catalog handles a lightweight control-plane request; storage handles the heavy data-plane traffic. This separation of control plane from data plane is why vending scales: minting a credential is cheap and the catalog does it once per table access, not once per byte.

Here is the flow described conceptually. Exact request and response shapes should be verified against the current Iceberg REST spec.

```
Client                      REST Catalog                  Object Storage
  |  authenticate  ------->  [ verify client identity ]
  |  loadTable(t)  ------->  [ authorize identity for table t ]
  |                          [ mint scoped temp credentials ]
  |  <----- metadata + temp creds (bucket/prefix/op/expiry)
  |  read/write files t  ----------------------------->  [ enforce creds ]
  |  <------------------------ data (zero-copy path) -----
```

## What the Catalog Controls and What Storage Controls

A point that trips people up: credential vending involves two distinct authorization decisions made by two distinct systems, and keeping them separate is essential to reasoning about security correctly.

The catalog controls table access. When a client asks to load a table, the catalog decides whether that identity is allowed to access that table at all. This is a logical, metadata-level decision. It is about tables, namespaces, and the identities permitted to use them. If the catalog says no, the client never gets credentials, and the question of storage never arises.

Object storage controls physical object access. The temporary credentials the catalog vends are what the storage system checks when the engine reads or writes actual files. Storage does not know about tables or namespaces; it knows about buckets, prefixes, and operations. The vended credentials translate the catalog's logical authorization decision into a physical grant that storage can enforce: this identity may read these specific objects until this time.

The relationship between them is a chain. The catalog decides whether you can access a table. If yes, it mints storage credentials scoped narrowly to that table's physical location, and storage enforces those scoped credentials on the actual object operations. Neither layer alone is sufficient. The catalog cannot enforce object reads; only storage can. Storage cannot make table-level authorization decisions; only the catalog can. Credential vending is the mechanism that connects the catalog's logical decision to storage's physical enforcement, with the scoping ensuring the physical grant is no broader than the logical decision that produced it.

Understanding this separation clarifies what credential vending does and does not do. It does not make the catalog into a storage gateway; the bulk data path still goes engine to storage directly. It does make the catalog the single point where table access is decided, and it ensures that decision is faithfully reflected in a tightly scoped, short-lived physical grant.

This two-layer model also shows why you cannot skip either layer. Suppose you tried to rely on storage permissions alone, granting each identity direct IAM access to the prefixes it needs. You would be back to managing storage-level grants for every principal across every table, which is the operational nightmare that led to over-scoped static keys in the first place, and storage IAM has no concept of Iceberg tables or namespaces, so your authorization would be expressed in the wrong vocabulary. Now suppose you tried to rely on catalog authorization alone without vending. The catalog would decide who can access a table, but the engine would still need some credential to touch storage, and if that credential is a shared static key, the catalog's careful decision means nothing at the storage layer, because anyone with the key can read anything the key reaches. Vending is precisely the bridge that makes the catalog's logical decision binding at the physical layer, expressed in table vocabulary at the top and translated into scoped storage grants at the bottom. Remove it and one layer or the other becomes decorative.

## Configuring Polaris-Style Credential Vending

Apache Polaris and Dremio's Open Catalog are relevant here because a catalog is exactly the component positioned to coordinate Iceberg metadata and storage authorization together. The [Apache Polaris documentation](https://polaris.apache.org/) is the reference for the specifics, and you should verify exact commands, field names, and syntax against it rather than treating the sketch below as literal configuration.

At a conceptual level, credential-vending configuration involves a few pieces.

A storage integration or connection defines how the catalog is allowed to mint credentials against your cloud storage. This is the trust relationship between the catalog and your cloud account: the catalog is granted the ability to issue scoped temporary credentials for specific storage locations, typically by assuming a role or exchanging identity with the cloud provider. This is the one broad trust you establish, and you establish it once, with the catalog, rather than distributing it to every client.

Roles and grants define who can access which tables and namespaces. These are the catalog-level authorization rules. A principal is granted access to a namespace or table, and that grant is what the catalog checks when a client asks to load the table. This is where least-privilege lives at the logical level.

Token scope and expiration define how narrow and how short-lived the vended credentials are. The configuration determines that credentials are scoped to the requested table's location and to the requested operation, and that they expire after a short window. Shorter expirations reduce risk but increase the frequency of vending requests, which is a real tradeoff to tune: too short and you add overhead and chatter, too long and you widen the window in which a leaked credential is useful.

The conceptual shape, not literal configuration:

```
# Conceptual - verify field names and syntax against Polaris docs
StorageIntegration:
  cloud role the catalog may assume to mint scoped creds
  allowed locations: bucket / prefixes the catalog may vend for

Catalog roles / grants:
  principal -> namespace/table access (logical authorization)

Credential vending policy:
  scope: table location + operation (read or write)
  expiration: short window
```

The design goal is least privilege at both layers: narrow logical grants in the catalog, and narrow physical scope plus short expiry in the vended credentials.

## Restricting Autonomous Clients

Credential vending is valuable for every client, but it is close to essential for autonomous agents, because agents are the clients you most want to keep away from broad, durable storage access.

Agents should never receive broad storage keys. An agent tool that reads a table should trigger the vending handshake and receive a credential scoped to that one table, for read only, expiring quickly. If that credential leaks through a logged tool call or a compromised agent process, the exposure is one table for a few minutes, not a bucket forever. This is the difference between a contained incident and a breach.

Vending naturally supports narrow, time-limited access for agent tools. Because the credential is minted per request and scoped to the request, an agent's storage access is exactly as broad as the specific table operation it was authorized for, and no broader. There is no standing credential for an agent to accumulate reach with.

For write-capable agents, credential vending is necessary but not sufficient. A vended write credential controls that the agent can physically write to a table's location, but you still want the surrounding controls that govern agent writes generally: table-level permissions in the catalog so the agent can only write where it is authorized, egress limits so an agent cannot pull unbounded data, action approval workflows so state changes can be gated, and audit logs so every vending request and every write is recorded and attributable. Credential vending is the storage-access piece of a larger governance story for write agents, not the whole story.

An honest limitation belongs here. Credential vending shrinks the window and scope of exposure, but a vended credential is still a bearer token for its lifetime. If an agent leaks a live read credential and an attacker uses it within its expiry window, that attacker can read the scoped table until the credential expires. Vending does not make this impossible; it makes it small and self-healing, because the credential dies on its own and cannot be used against other tables. The mitigation is to keep expirations short enough that the window is genuinely small, to scope credentials as narrowly as the operation allows so a leak exposes as little as possible, and to log vending requests so an unusual pattern of credential requests from one agent is visible. The right way to think about it is risk reduction by orders of magnitude rather than elimination. A leaked static bucket key is a durable, broad breach. A leaked vended credential is a brief, narrow one. That difference is the whole value proposition, and it is large, but it is not the same as making leaks harmless. Treat vended credentials as sensitive within their lifetime, just far less catastrophic than the static keys they replace.

The following table contrasts static keys with credential vending directly.

| Property | Static cloud keys | Credential vending |
| --- | --- | --- |
| Lifetime | Long-lived, rarely rotated | Short-lived, expires in minutes |
| Scope | Often whole-bucket, over-scoped | Table, prefix, and operation |
| Where held | Copied into every client and config | Minted per request, not stored |
| Leak blast radius | Everything the key can reach | One table for a short window |
| Authorization point | Storage IAM, disconnected from tables | Catalog, aligned with table access |
| Fit for agents | Dangerous, broad standing access | Good, narrow time-limited access |
| Rotation | Manual, coordinated, painful | Automatic via expiry |

## Why Zero-Copy Security Favors Open Lakehouses

Credential vending is the mechanism that lets an open, multi-engine lakehouse be both open and secure at the same time. Without it, "open" tends to mean "every engine has broad storage keys," which is open in the worst way. With it, many engines can query the same Iceberg tables in place, each getting only the narrow, temporary access it needs, authorized consistently through one catalog.

This is the security argument for open lakehouses over closed systems. In a closed system, security is a property of a single vendor's engine, and you accept that vendor's boundaries. In an open lakehouse built on Apache Iceberg, the data sits in your object storage in an open format, and the catalog governs access to it for any engine that speaks the REST protocol. Credential vending is what makes that multi-engine openness safe: the catalog is the trusted authorization point, storage credentials are scoped and short-lived, and no engine needs a standing broad key. You keep zero-copy analytics, engines read data directly from storage without moving it, while the access to that storage is mediated and scoped.

Dremio's approach fits this directly. As a data platform built for and managed by AI agents on open standards, Dremio's Open Catalog is built on Apache Polaris, so the catalog coordinates Iceberg metadata and storage authorization together in exactly the way credential vending requires. The [write-up on Dremio's Open Catalog architecture](https://www.dremio.com/blog/the-brain-of-the-agentic-lakehouse-inside-dremios-open-catalog-architecture/) covers how that catalog is structured. Because it is Iceberg and Polaris, there is no lock-in: the same tables are readable by any Iceberg-compatible engine, and the same catalog governs access for all of them. Dremio's federated query engine reads data in place across sources, and its fine-grained access control adds row-level security and column masking on top of the table-level authorization the catalog provides. Credential vending secures the physical storage layer; the catalog and engine secure the logical and analytical layers; together they make agent access to open data both broad in reach and narrow in privilege.

If you are running a multi-engine lakehouse today, the highest-value change you can make is to stop distributing static storage keys and route storage access through a catalog that vends short-lived, scoped credentials. It shrinks your blast radius, makes rotation automatic, and is the right foundation for letting agents touch data safely. To see an open, Iceberg-native lakehouse with an Open Catalog on Apache Polaris, [get started with Dremio](https://www.dremio.com/get-started).
