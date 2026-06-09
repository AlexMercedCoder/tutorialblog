---
title: "REST Catalog Credential Vending for Lakehouse Security"
date: "2026-06-08"
description: "Iceberg REST catalog credential vending issues short-lived, table-scoped storage tokens for S3, ADLS, and GCS. How Polaris, Snowflake Horizon, Databricks Unity Catalog, and Dremio implement credential vending for secure lakehouse storage access."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - "Iceberg credential vending REST catalog"
  - "storage scoped credentials"
  - "lakehouse security token vending"
  - "Polaris credential vending"
  - "Unity Catalog credential vending"
---

Every query engine in a lakehouse needs access to object storage. In the simplest architecture, every engine shares a static access key with bucket-wide permissions. This creates a single point of failure: if any engine is compromised, the entire storage bucket is exposed. The audit trail says "the key was used," but it does not say which engine or which user used it.

Credential vending solves this by replacing static keys with short-lived, dynamically scoped tokens issued by the Iceberg REST catalog. When an engine needs to read a table, it requests credentials from the catalog. The catalog authenticates the engine, checks governance policies, obtains a temporary token from the storage provider, and returns a token scoped to exactly the table's storage path. The engine uses the token to access storage directly. When the token expires (typically after 5-60 minutes), the engine requests a new one.

This pattern is now the standard access delegation mechanism across every major Iceberg catalog implementation. Apache Polaris (v1.4+), Snowflake Horizon, Databricks Unity Catalog, AWS Glue, Google Cloud Lakehouse, and Dremio all support credential vending through the Iceberg REST catalog specification. The implementations differ in scope, configuration, and the token expiration behavior. Understanding those differences matters when you are choosing a catalog for a multi-engine lakehouse.

## The Credential Vending Flow

The Iceberg REST catalog specification defines the credential vending endpoint as part of the table access flow:

1. **Engine authenticates to catalog.** The engine sends an authenticated request to the REST catalog, typically using OAuth2, bearer token, or SigV4 authentication. The catalog validates the identity and records the session.

2. **Engine requests table metadata.** The engine sends a `GET /namespaces/{namespace}/tables/{table}` request. The catalog resolves the table, checks the engine's authorization (SELECT for reads, INSERT/UPDATE for writes), and returns the table metadata including the storage location and format version.

3. **Engine requests credentials.** The engine sends a `POST /namespaces/{namespace}/tables/{table}/credentials` request. The catalog authenticates the request (using the established session), verifies the engine's permissions for the requested operation, and determines the minimal storage path scope.

4. **Catalog obtains storage token.** The catalog, using its own identity on the storage provider, requests a temporary credential from the cloud storage service. For S3, this is a `sts:AssumeRole` call with a scoped IAM policy. For ADLS, this is a SAS token generation. For GCS, this is a signed blob token.

5. **Catalog returns scoped token.** The catalog returns the token to the engine, along with the token's expiration time and the specific storage path it authorizes. The engine uses the token for direct storage access.

6. **Engine reads or writes data.** The engine uses the token to access Parquet files, manifest files, and other Iceberg metadata stored in object storage. The token expires after the configured TTL. The engine can request a new token if the operation extends beyond the original expiration.

The critical security property is on step 4: the catalog obtains a token scoped to the table's storage path, not the entire bucket. If the engine is compromised after receiving the token, the attacker can only access files within that table's path. Other tables in the same bucket are not accessible. The token expiration limits the attack window to minutes or hours, not indefinite.

## S3, ADLS, and GCS Implementation Details

Credential vending works differently on each cloud provider because each has a different model for temporary credentials.

**AWS S3 (STS AssumeRole):** The catalog holds an IAM role with permissions to assume another role (the "query role") that has access to the storage bucket. When an engine requests credentials, the catalog calls `sts:AssumeRole` with a session policy that restricts the issued credentials to the table's storage prefix. The session policy uses an IAM policy document that includes a `Condition` block with `s3:prefix` set to the table's path. The returned credentials are valid for 15 minutes to 12 hours (configurable, with 1 hour being the common default).

```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:ListBucket"],
  "Resource": [
    "arn:aws:s3:::my-bucket",
    "arn:aws:s3:::my-bucket/tables/my_table/*"
  ],
  "Condition": {
    "StringLike": {
      "s3:prefix": "tables/my_table/*"
    }
  }
}
```

**Azure ADLS (SAS Tokens):** The catalog generates a Shared Access Signature (SAS) token for the table's storage container and path. Azure SAS tokens include the resource path, permissions (read, write, list), and expiration. The catalog restricts the SAS to the table's directory path. SAS tokens can be scoped to a specific blob prefix, which maps cleanly to Iceberg table paths. The catalog must be configured with Azure Storage credentials that have the `Microsoft.Storage/storageAccounts/listAccountSas/action` permission.

**Google GCS (Access Tokens):** Google Cloud Lakehouse supports credential vending through its Iceberg REST catalog integration. The catalog uses Google Cloud service account impersonation to generate short-lived access tokens for the table's object prefix. The catalog must have the `iam.serviceAccounts.getAccessToken` permission on the service account that owns the storage bucket. Google's token lifetime is configurable up to 1 hour (default) or 12 hours for workload identity federation.

## Polaris v1.4 Storage-Scoped Credentials

Apache Polaris v1.4 (released April 2026) included a significant refactor of the credential vending subsystem. The new design introduces the concept of "storage-scoped credentials" where the credential scope is derived from the table's storage location combined with the requesting principal's Iceberg-level permissions.

Storage-scoped credentials in Polaris work through the following process:

1. The Polaris admin configures a "storage credential" entity for each cloud storage backend. The storage credential contains the provider type (AWS, Azure, GCP), the allowed locations (bucket paths), and the authentication mechanism (IAM role ARN, service principal, service account).

2. The Polaris admin associates each catalog (a logical Iceberg catalog within Polaris) with a storage credential and a base storage location. All tables in that catalog inherit the storage mapping.

3. When an engine requests credentials, Polaris resolves the table's storage path, looks up the associated storage credential, and obtains a temporary token scoped to the table's path within the catalog's storage base.

4. Polaris applies the requesting principal's Iceberg-level permissions to the credential scope. A principal with SELECT-only access on the table gets read-only storage credentials. A principal with INSERT access gets write credentials.

The important improvement in v1.4 is that Polaris can now issue credentials for tables in different cloud providers from the same Polaris instance. A single Polaris deployment can serve tables stored in AWS, Azure, and GCS simultaneously, with vended credentials for each provider. This is a requirement for multi-cloud lakehouse architectures.

Polaris also supports the credential vending refactoring on a dedicated thread pool, which isolates the signing and token issuance workload from the metadata serving path. This prevents a spike in credential requests from degrading catalog performance for other operations.

## Unity Catalog Credential Vending Comparison

Databricks Unity Catalog supports credential vending for Iceberg tables through a different architecture. Unity Catalog issues scoped tokens for "foreign" Iceberg tables (tables managed by another catalog) and for managed Iceberg tables within Unity Catalog.

The key architectural difference: Unity Catalog does not expose a standard Iceberg REST catalog endpoint for credential vending. External engines must use a Unity Catalog-specific API (the UC credential vending endpoint) rather than the Iceberg REST spec endpoint. This means the engine needs a Unity Catalog-specific client implementation, not just a generic Iceberg REST client.

Snowflake's comparison blog post (May 2026) describes the practical impact: "Horizon implements the open Apache Iceberg REST Catalog specification (Apache Polaris). Any engine supporting the standard protocol can connect, receive vended credentials, and perform both reads and writes with governance policies enforced at the catalog layer regardless of engine. Unity Catalog uses proprietary APIs; external engines require Lakehouse Federation (JDBC, read-only) or UC credential-vending endpoints."

Unity Catalog's credential vending for write operations is described as "less established" in the Snowflake comparison, and the write path for external engines through UC is not as thoroughly tested as the read path.

The open-source Unity Catalog (released under the Linux Foundation in 2024) does not include credential vending support. The credential vending feature is part of the managed Unity Catalog offering on Databricks. This distinction matters for organizations evaluating UC OSS for multi-engine architectures: the open-source version supports Iceberg table operations but does not vend storage credentials, so engines must have their own storage access configured.

## Snowflake Horizon Vended Credentials

Snowflake Horizon Catalog implements credential vending through its Apache Polaris-powered Iceberg REST catalog API. The implementation supports all three cloud providers (S3, ADLS, GCS) and both read and write operations.

The credential vending configuration is part of the CREATE CATALOG INTEGRATION command. Snowflake supports SigV4 credential vending for S3 (using AWS Lake Formation or IAM), SAS token vending for Azure, and OAuth2-based token vending for GCS.

Horizon's credential vending is integrated with Snowflake's governance features. When a table has row filters or column masks defined, the vended credentials include only the file-level access needed to satisfy the filter and mask. The engine cannot read files that contain rows or columns the principal is not authorized to see, because those files are not within the credential scope.

The interaction between credential vending and Snowflake's Dynamic Iceberg Tables is worth noting. Dynamic Tables use internal Snowflake compute to maintain materialized views. The credential vending for Dynamic Tables uses Snowflake's internal warehouse identity, not the user identity. This means the Dynamic Table refresh reads data with the table owner's permissions, not the querying user's permissions. This is consistent with how materialized views work in most database systems: the view owner's permissions, not the consumer's permissions, determine the refresh scope.

## Credential Lifetime and Rotation

The credential TTL (time to live) is a critical operational parameter. A longer TTL reduces the number of credential requests (good for performance) but increases the attack window if a token is compromised (bad for security).

Standard practice across Iceberg catalogs:

| Provider | Default TTL | Min TTL | Max TTL |
|----------|-------------|---------|---------|
| AWS S3 (STS) | 1 hour | 15 minutes | 12 hours |
| Azure ADLS (SAS) | 1 hour | 5 minutes | 24 hours |
| Google GCS | 1 hour | 5 minutes | 12 hours |

Polaris and Snowflake Horizon both support configurable TTL. Databricks Unity Catalog uses a fixed 1-hour TTL for vended credentials.

The credential refresh mechanism is engine-specific. Spark's Iceberg connector requests credentials once per table scan and caches them for the duration of the scan. If the scan extends beyond the credential TTL (e.g., a large shuffle operation that takes 90 minutes), the connector requests a new set of credentials mid-operation. Trino's Iceberg connector requests credentials per file read and re-requests if the token expires during a long read.

A practical recommendation: set the credential TTL to 15-30 minutes for production workloads with PII data, and 60 minutes for non-sensitive data. The shorter TTL adds approximately 1-2 additional credential requests per hour per table, which is negligible overhead for the catalog. The security benefit is a 75% reduction in the attack window compared to the 60-minute default.

## Storage-Scoped vs Remote-Signed Credentials

Credential vending and remote signing are often discussed as alternatives, but they serve different use cases and can be used together. The key distinction is scope:

- Credential vending issues a token that authorizes access to a storage path (a table's data directory). The token can be used to read any file within that path.
- Remote signing issues a pre-signed URL for a single file and a single operation. The URL cannot be reused for other files or operations.

Credential vending is better for high-throughput workloads where the engine reads many files per query. A query reading 500 files makes one credential request and 500 storage requests. Remote signing would make 500 signing requests and 500 storage requests, adding latency proportional to the file count.

Remote signing is better for regulated workloads where per-file audit and absolute least privilege are required. The security properties are strictly stronger, but the performance cost is meaningful for high-file-count queries.

Most catalogs support both mechanisms. The engine can request either mode, and the catalog returns credentials or pre-signed URLs accordingly. Snowflake Horizon and Polaris both support this dual-mode operation.

## Security Boundaries and Common Mistakes

Credential vending is secure only if the implementation respects the scope boundary. Common mistakes:

**Mistake 1: Overly broad storage credential configuration.** If the Polaris admin configures a storage credential with access to the entire bucket, the vended token scope is limited by the session policy, but the underlying credential is not. If the session policy generation has a bug, the engine could receive bucket-wide access. Always configure storage credentials with the narrowest possible path, and test the scope boundary with a policy simulation.

**Mistake 2: Token caching across users.** Some engines cache vended credentials and reuse them across user sessions within the same engine process. If the cache key is based on the table path (not the user identity), a low-privilege user could receive a token cached by a high-privilege user. The Iceberg spec requires that credentials be requested per identity, but not all engine implementations enforce this correctly.

**Mistake 3: Ignoring token expiration in long-running queries.** A Spark job that runs for 4 hours needs to handle credential expiration. The Iceberg Spark connector handles this transparently in version 1.9+, but older versions (pre-1.9) require manual refresh. Test your workload duration against the credential TTL.

**Mistake 4: Not logging denied credential requests.** A denied credential request is a security event. It could indicate a principal trying to access a table they do not have permission to read, or a misconfigured storage credential. Monitor for denied requests and alert on a pattern of denials from the same principal.

## The Bottom Line

Credential vending is the standard access delegation mechanism for secure lakehouse storage. Every major Iceberg catalog implementation supports it, and it provides a strong security improvement over static keys: the blast radius of a compromised credential is limited to a single table's storage path, and the credential automatically expires after minutes or hours rather than persisting indefinitely.

The implementation differences between catalogs matter. Polaris and Snowflake Horizon use the standard Iceberg REST API for credential vending, so any Iceberg-compatible engine can participate without catalog-specific client code. Unity Catalog uses a proprietary endpoint, which adds an integration burden for external engines.

For production deployments with PII or regulated data, set the credential TTL to 15-30 minutes, verify the path scoping with a policy simulation, and monitor denied credential requests. For non-sensitive data with high query volumes, the default 60-minute TTL is appropriate.

Credential vending is not the final word on lakehouse security. Remote signing provides stronger per-file access control but at higher latency. The choice between the two depends on your data sensitivity, workload characteristics, and compliance requirements. The common factor is that both mechanisms are defined by the Iceberg REST catalog spec and supported by the leading catalog implementations, which means your choice of delegation mechanism does not lock you into a single catalog vendor.

---

*For the complete Iceberg REST catalog specification, visit [iceberg.apache.org/spec](https://iceberg.apache.org/spec). To try credential vending in a governed multi-engine lakehouse, start a free trial at [dremio.com/get-started](https://www.dremio.com/get-started).*
