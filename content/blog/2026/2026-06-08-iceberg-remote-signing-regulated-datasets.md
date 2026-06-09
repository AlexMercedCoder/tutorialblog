---
title: "Iceberg Remote Signing for Regulated Datasets"
date: "2026-06-08"
description: "Iceberg REST catalog remote signing provides per-file pre-signed URL access for regulated datasets. How it differs from credential vending, audit trail capabilities, and Snowflake implementation for PII/compliance workloads."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - "Iceberg remote signing regulated datasets"
  - "Iceberg REST catalog pre-signed URLs"
  - "S3SignRequest API"
  - "credential vs remote signing"
  - "PII data lakehouse"
---

When a compute engine requests a file from object storage, the engine needs credentials. In a traditional architecture, those credentials are static keys with bucket-wide permissions. If they leak, every file in the bucket is exposed. Credential vending improves this by issuing short-lived, table-scoped tokens. But even vended credentials carry risk: the token can be used to read any file within its scope, and a compromised token grants file-level read or write access for its duration.

Remote signing goes a step further. The compute engine never receives storage credentials at all. Instead, the engine requests a pre-signed URL for each specific file it needs to read or write. The signing endpoint returns a one-time-use URL that is scoped to a single object, a single operation (GET or PUT), and a short time window (typically 60-300 seconds). A leaked signed URL exposes one file for minutes, not one table for hours.

For regulated datasets containing PII, financial records, or healthcare data, remote signing is the strongest access delegation model available in the Iceberg ecosystem. It aligns with the principle of least privilege at the finest granularity: per-file, per-operation, per-request.

## How Remote Signing Works

The Iceberg REST catalog specification defines the remote signing flow through the `S3SignRequest` API endpoint. The flow has four steps:

1. The engine requests table metadata from the REST catalog. The catalog authenticates the request, checks governance policies, and returns the table metadata including the signing endpoint URL.

2. For each file the engine needs to read (a manifest file, a manifest list, a data file), the engine constructs an HTTP request to the signing endpoint. The request includes the HTTP method (GET for reads, PUT for writes) and the object path in the storage bucket.

3. The signing endpoint authenticates the request, validates that the engine has permission to perform the requested operation on the requested file, and returns a pre-signed URL. The URL includes the signature, expiration time, and any required headers.

4. The engine uses the pre-signed URL to access the object store directly. The object store validates the signature and serves the file. The engine never stores long-lived credentials, and the pre-signed URL expires after the configured window.

The critical security property is that the signing endpoint performs an authorization check on every request. Even if an engine has been authenticated to the catalog and has fetched table metadata, it cannot access any file until the signing endpoint validates the specific (file, operation) pair. This means the catalog can enforce row filters and column masks at the signing layer: the catalog knows which files to sign for the engine's access level.

The IOMETE blog on Iceberg access delegation provides a useful analogy: "Remote signing is like a hotel concierge who escorts you to each door and opens it. You never carry a key. Every access is mediated and logged." Compare this to credential vending, which is like a hotel key card that works on all doors in your authorized area. The key card is more convenient, but it grants broader access than any individual door visit requires.

## Remote Signing vs Credential Vending

| Aspect | Credential Vending | Remote Signing |
|--------|-------------------|----------------|
| What the engine receives | Short-lived storage tokens | Pre-signed individual request URLs |
| Token scope | Table path (multiple files) | Single file |
| Token duration | 5-60 minutes (configurable) | 60-300 seconds per URL |
| Leak blast radius | All files in table scope | One file |
| Per-request authorization | No (token authorizes everything in scope) | Yes (each sign request is authorized) |
| Object store compatibility | Any (S3, ADLS, GCS) | S3 and S3-compatible only (as of 2026) |
| Audit granularity | Token issuance logged | Every file access logged with specific path |

The most important operational difference is audit granularity. With credential vending, the audit log shows that "engine X was issued a token for table Y at time Z." The engine's subsequent storage access is opaque to the catalog. With remote signing, every storage access goes through the signing endpoint, producing an audit record with the file path, operation, timestamp, and requesting identity.

For compliance frameworks like SOC 2, HIPAA, and PCI DSS, this difference is significant. SOC 2 requires logging of "actions taken by authorized users" at a granular enough level to detect anomalous behavior. A credential vending audit trail shows token issuance but not file access. A remote signing audit trail shows every file read or write, which satisfies SOC 2 log collection requirements more completely.

## When Remote Signing Is Required

Remote signing is not the right choice for every workload. It adds latency (one signing request per file), increases catalog load (each sign request is a catalog API call), and requires the catalog to maintain a signing service that can handle high request rates.

Use remote signing when:

**Your data contains PII or other regulated content.** If a single file exposure would constitute a reportable breach under GDPR, HIPAA, or PCI DSS, the blast radius reduction from per-file signing is worth the latency cost.

**Your compliance framework requires fine-grained access logging.** HIPAA Security Rule (45 CFR 164.312(b)) requires "mechanisms that record and examine activity in information systems that contain or use electronic protected health information." Remote signing's per-file audit trail directly addresses this requirement. Credential vending's token-level audit does not.

**Your security policy prohibits engines from holding storage credentials.** Some financial institutions have policies that no compute system may possess storage credentials, even temporarily. Remote signing satisfies this policy because the engine holds only one-time pre-signed URLs that cannot be reused to access other files.

**Your architecture uses shared-nothing storage where engines should not list buckets.** With vended credentials, the engine can list the bucket directory (if the token includes list permissions). With remote signing, the engine can only access the specific files the catalog authorized, and it has no list capability at the storage layer.

Use credential vending when:

- Performance is more important than per-file audit. Credential vending requires one catalog call per table, not per file.
- Your workload reads many small files. A table with 10,000 small Parquet files would generate 10,000 signing requests, adding seconds of latency.
- Your object store is not S3-compatible. The current remote signing spec covers S3 only (via S3SignRequest). ADLS and GCS fall back to credential vending.
- Your data is not regulated and your compliance requirements are satisfied by table-level access logs.

## Snowflake's Implementation

Snowflake Horizon Catalog supports remote signing through its Iceberg REST catalog implementation, which is powered by Apache Polaris. When an external engine (Spark, Trino, PyIceberg) connects to Snowflake's REST catalog endpoint and requests file access, Snowflake can issue either vended credentials or pre-signed URLs depending on the configuration.

As of the v3 GA (May 2026), Snowflake supports remote signing for S3-based Iceberg tables. Azure and GCS storage remain on credential vending. The Snowflake documentation for the CREATE CATALOG INTEGRATION command includes parameters for specifying the signing behavior:

```sql
CREATE CATALOG INTEGRATION my_iceberg_catalog
  CATALOG_SOURCE = ICEBERG_REST
  REST_CONFIG = (
    CATALOG_URI = 'https://horizon.snowflake.example.com/iceberg/rest'
    REMOTE_SIGNING_ENABLED = TRUE
    CREDENTIAL_VENDING_ENABLED = TRUE
  );
```

Both credential vending and remote signing can be enabled simultaneously. The engine requests its preferred delegation mode, and the catalog returns credentials or pre-signed URLs accordingly. If the engine requests remote signing but the storage backend does not support it, the catalog falls back to credential vending with a warning in the response headers.

Snowflake's remote signing integration also supports the Iceberg REST Scan Plan API (available in Iceberg 1.11+, May 2026). The Scan Plan API allows the catalog to plan the query execution on the server side, applying row filters and column masks before returning file-level scan tasks. Each scan task includes the pre-signed URLs for the specific files the engine needs. This combines server-side governance (row filters, column masks) with per-file remote signing, producing the strongest access control model available in the lakehouse ecosystem.

## Audit Trail Capabilities

The audit trail from remote signing is more detailed than what credential vending produces. A typical remote signing audit log entry includes:

- Timestamp of the sign request
- Requesting identity (principal, role, catalog session)
- Target file path (full object key including bucket)
- HTTP method (GET or PUT)
- Response status (200 for signed, 403 for denied)
- Pre-signed URL expiration time
- Source IP of the requesting engine
- Catalog request ID (correlates with table metadata requests)

This granularity enables specific investigations. If a security analyst detects an anomalous read pattern, they can query:
"Which files did principal X read between 14:00 and 14:05?"
"Which principals read the file containing customer SSNs yesterday?"
"Did any denied sign requests target the PII bucket?"

Credential vending cannot answer the first and second questions without additional infrastructure (agent-level logging on the compute engine, which is often not configured or not trusted).

The GitHub issue tracker for the Iceberg project includes a discussion (Issue #10486) about adding the affected object to the S3SignRequest response. As of June 2026, the signing request does not include the object path in the audit log, but the catalog implementation can infer the path from the request parameters. The community is working on making the object path explicit in the signing request to improve audit clarity.

## Performance Considerations

Remote signing adds latency to the query path. Each file access requires a round trip to the signing endpoint before the storage access. The latency depends on the catalog's proximity to the engine and the signing endpoint's throughput:

- For a query reading 50 files: 50 signing requests (can be parallelized)
- Each signing request: 2-10 ms processing time + network latency
- Total signing overhead: 2-50 ms per file batch (assuming 50 parallel requests)
- Pre-signed URL validity: typically 60-300 seconds (configurable)

The overhead is negligible for queries that read hundreds of files. Storage access latency (10-50 ms per S3 GET) dominates the query time. The signing overhead adds roughly 1-5% to the query latency for most workloads.

The overhead becomes significant for metadata-heavy operations. Reading 10,000 small Parquet files (a common pattern in unoptimized Iceberg tables) would require 10,000 signing requests. Even with aggressive parallelism, the signing endpoint sees a spike of 10,000 requests, and the engine waits for all responses before proceeding. This is why remote signing is best paired with regular compaction jobs that reduce file count. A compacted table with 50-500 files sees minimal signing overhead.

The signing endpoint itself must be provisioned for peak throughput. A catalog serving hundreds of concurrent queries may process 10,000-50,000 signing requests per second. Snowflake's Horizon Catalog backend (Polaris) is designed for this scale, with the signing service running on dedicated infrastructure separate from the metadata serving path.

## Server-Side Scan Planning with Remote Signing

The Iceberg 1.11 release (May 19, 2026) added server-side Scan Plan API support to the REST catalog spec. This feature is designed to work with remote signing for regulated datasets.

The Scan Plan API works as follows:

1. The engine sends the query's filter predicates and column projection to the catalog.
2. The catalog resolves the view or table, applies row filters and column masks based on the requesting identity's permissions, and determines which files to read.
3. The catalog returns a list of scan tasks. Each scan task specifies a file path, the column projection, the predicate evaluation result, and a set of pre-signed URLs for accessing the file.
4. The engine executes the scan tasks in parallel, using the pre-signed URLs to read each file.

The key benefit for regulated datasets is that the engine never needs to interpret row filters or column masks. The catalog handles all policy enforcement on the server side. The engine receives only the file-level access URLs for the files it is permitted to read, with the column projection already applied. This prevents an engine from reading columns that should be masked, because the masking is applied by the signing endpoint before the pre-signed URL is issued.

For a PII dataset with a column mask on `ssn`, the flow is:
- Engine sends: `SELECT name, ssn, amount FROM transactions WHERE amount > 1000`
- Catalog evaluates: `ssn` column is masked for this identity; only `name` and `amount` are allowed
- Catalog returns scan tasks for the files matching `amount > 1000`, with pre-signed URLs for reading only the `name` and `amount` columns
- Engine reads `name` and `amount` from storage and returns the result
- Engine never sees the `ssn` column values

This is a strict improvement over engine-side masking, where the engine reads all columns and applies the mask in memory. With engine-side masking, the `ssn` values travel from storage to the engine's memory. With server-side scan planning and remote signing, the `ssn` values never leave storage because the catalog does not issue pre-signed URLs for the masked columns.

## The Bottom Line

Remote signing is the strongest access delegation model for regulated data in the Iceberg ecosystem. It reduces the blast radius of credential exposure from a table's entire storage path to a single file, and it provides per-file audit trails that satisfy SOC 2, HIPAA, and PCI DSS logging requirements.

The tradeoff is performance overhead for metadata-heavy queries. Remote signing is best suited for tables that are compacted regularly (50-500 files) and for workloads where the audit and security requirements justify the additional latency. For non-regulated data with high query volumes, credential vending remains the faster and simpler choice.

Snowflake Horizon Catalog, Apache Polaris, and the Iceberg REST spec all support remote signing for S3 storage. The combination of server-side scan planning (Iceberg 1.11+) with remote signing creates a governed data access path where the compute engine never sees storage credentials and never reads masked columns. For regulated lakehouse deployments, this is the most secure architecture available today.

---

*For the Iceberg REST catalog specification and remote signing details, visit [iceberg.apache.org/spec](https://iceberg.apache.org/spec). To implement remote signing in a governed multi-engine lakehouse, start a free trial at [dremio.com/get-started](https://www.dremio.com/get-started).*
