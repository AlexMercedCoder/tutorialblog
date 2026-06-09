---
title: "Bidirectional Iceberg Writes with Horizon Catalog"
date: "2026-06-08"
description: "Snowflake Horizon Catalog enables bidirectional Iceberg writes from external engines like Spark and Trino, powered by Apache Polaris. Deep dive into REST Scan Plan API, governance, and Snowflake Summit 2026 announcements."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - "Snowflake Horizon Catalog bidirectional Iceberg writes"
  - "Polaris-powered catalog"
  - "external engine writes"
  - "REST Scan Plan API"
  - "Open Catalog vs Horizon"
  - "Snowflake Summit 2026"
---

For years, the limitation of Snowflake's Iceberg support was direction. You could read Iceberg tables managed by external catalogs (AWS Glue, Polaris, Unity Catalog) from Snowflake. You could write Iceberg tables through Snowflake and read them in Snowflake. But you could not write to a Snowflake-managed Iceberg table from an external engine. If your Spark pipeline needed to update a table that Snowflake also owned, you either ran the pipeline inside Snowflake or you accepted a multi-copy architecture where the two engines maintained separate tables.

That limitation ended in March 2026, when Snowflake announced public preview of external writes to Snowflake-managed Iceberg tables through the Horizon Catalog. At Snowflake Summit 2026 (June 2026), the company confirmed that bidirectional Iceberg interoperability is now a core capability of the platform, powered by Apache Polaris (which graduated to Apache top-level project in February 2026).

The architecture is straightforward: the Horizon Catalog implements the Iceberg REST catalog specification (including credential vending, server-side commit coordination, and the Scan Plan API) and uses Apache Polaris internally for metadata management and governance. External engines connect to the Horizon Catalog's REST endpoint, authenticate through Snowflake's identity layer, receive vended storage credentials, and write data directly to Snowflake's Iceberg storage. The catalog coordinates commits, enforces access controls, and maintains the single source of truth for the table's metadata.

This article covers the technical architecture, the governance model, the REST Scan Plan API integration, what was announced at Snowflake Summit 2026, and how Horizon Catalog compares to the open-source Polaris deployment model.

## The Bidirectional Architecture

Bidirectional interoperability means two directions of data flow:

**Inbound (external to Snowflake):** An external engine (Spark, Trino, PyIceberg) reads or writes an Iceberg table whose metadata is managed by the Horizon Catalog. The engine connects to the Horizon Catalog's Iceberg REST API endpoint, authenticates, and performs operations exactly as it would with any Iceberg REST catalog. The catalog vends storage credentials scoped to the table's storage path and coordinates the commit to ensure ACID consistency.

**Outbound (Snowflake to external):** Snowflake reads or writes an Iceberg table whose metadata is managed by an external catalog (Polaris, Unity Catalog, AWS Glue). Snowflake connects to the external catalog's REST API endpoint, authenticates using the configured catalog integration, and performs operations. The table appears in Snowflake as a native Iceberg table, queryable through standard SQL.

The inbound direction was the missing piece before March 2026. Snowflake had supported external reads (inbound reads) since late 2024, but writes required the external pipeline to run inside Snowflake's compute boundaries. The key change in the March 2026 release is that the Horizon Catalog now supports the Iceberg REST catalog's write operations: `POST /v1/namespaces/{namespace}/tables/{table}/commit` and the related endpoints for committing new snapshots from external writers.

The commit flow for an external write works as follows:

1. The external engine requests table metadata and write credentials from the Horizon Catalog.
2. The catalog authenticates the engine, checks write permissions, and returns vended storage credentials scoped to the table's data directory.
3. The engine writes new data files and manifest files directly to cloud storage using the vended credentials.
4. The engine builds a new Iceberg snapshot (manifest list, manifests, data file references) and sends a commit request to the catalog.
5. The catalog validates the snapshot (checks that the referenced files exist and match the vended credentials) and atomically updates the table's metadata pointer to the new snapshot.
6. The catalog logs the commit with the engine's identity, timestamp, and snapshot ID for audit.

The critical validation on step 5 is security relevant: the catalog verifies that the files referenced in the commit were written using credentials issued to the same engine session. This prevents a compromised engine from committing a snapshot that references files it did not write (a file injection attack). The catalog tracks the credentials it issued per session and checks that the committed files fall within the credential scope.

## Powered by Apache Polaris

The Horizon Catalog uses Apache Polaris as its Iceberg REST catalog engine. This was a strategic decision by Snowflake, announced at Snowflake Summit 2025 and confirmed in the March 2026 engineering blog post: "Horizon Catalog integrates Apache Polaris (open source Iceberg catalog, now an Apache Top-Level Project). Grounded in open standards, no vendor lock-in for data or metadata."

The Polaris integration means that the Horizon Catalog implements the full Iceberg REST catalog specification, including:

- Table and namespace CRUD (all standard endpoints)
- Credential vending (S3, ADLS, GCS)
- Server-side commit coordination (conflict detection and retry)
- Multi-table commits
- Table rename, drop, and purge
- Iceberg view support (view CRUD via REST)
- The Scan Plan API (server-side scan planning, available in Iceberg 1.11+)

Snowflake adds enterprise features on top of the Polaris core: Snowflake's identity and access management integration, Cortex AI governance, classification and masking, automated metadata enrichment, and the Horizon governance dashboard. The base Polaris functionality is identical to the open-source version, which means a Spark application written to work with open-source Polaris works unchanged against the Horizon Catalog. The endpoint URL changes; the client logic does not.

This architecture has an important implication: if you ever need to move your Iceberg tables away from Snowflake, you can point your engines at an open-source Polaris deployment (or any other Iceberg REST catalog) and access the same tables with the same metadata. The metadata format is standard Iceberg. The catalog API is the standard Iceberg REST API. The data files are standard Parquet with Iceberg manifests. There is no Snowflake-specific encoding or proprietary metadata.

Snowflake's own messaging confirms this: "You get the enterprise-grade scale, governance, security and compliance capabilities of Snowflake Horizon, backed by an open core that enables you to never face vendor lock-in for your data or metadata."

## Governance via REST Scan Plan API

The REST Scan Plan API (introduced in Iceberg 1.11, May 2026) is the mechanism by which the Horizon Catalog enforces governance policies for external engine access. It is a server-side query planning capability that works as follows:

1. The external engine sends the query's filter predicates and column projection to the catalog.
2. The catalog resolves the table, evaluates the requesting principal's access policies (row filters, column masks, table-level permissions), and determines which files and columns the principal is authorized to read.
3. The catalog returns a list of scan tasks. Each scan task specifies a file path, the allowed column set (with masked columns omitted), the predicate evaluation result (pre-filtered rows), and vended credentials or pre-signed URLs for accessing the file.
4. The engine executes the scan tasks in parallel. The engine never sees the masked columns or the filtered-out rows because the catalog did not include them in the scan tasks.

The governance enforcement happens entirely in the catalog. The engine is a "dumb" executor: it receives a list of files and columns to read, reads them, and returns the results. The engine cannot bypass the governance policies because it never receives the metadata that would allow it to do so.

For Snowflake Horizon, the Scan Plan API is the governance boundary for external engines. A row filter defined on a table in Snowflake (`CREATE ROW ACCESS POLICY ...`) is automatically applied when an external engine queries the table through the Horizon Catalog. The engine never sees the filtered rows. A column mask (`CREATE MASKING POLICY ...`) hides the column value from the external engine. The engine receives the masked value (or a NULL, depending on the masking policy configuration) without ever reading the unmasked value from storage.

This is a strict improvement over the previous model where governance was enforced at the Snowflake compute layer. An external engine bypassed Snowflake governance entirely because it accessed storage directly. With the Scan Plan API, the Horizon Catalog intercepts the query planning, applies the policies, and returns only the authorized data. The external engine does not need to implement Snowflake's row filter or column mask syntax. The catalog handles all policy evaluation.

## Snowflake Summit 2026 Announcements

Snowflake Summit 2026 (June 2026) featured several Iceberg and Horizon Catalog announcements that build on the bidirectional writes capability.

**Iceberg v3 GA on Snowflake (May 7, 2026):** The v3 spec support (deletion vectors, row lineage, VARIANT, geospatial types, nanosecond timestamps, default column values, multi-argument partition transforms) is fully integrated with the Horizon Catalog. External engines reading Snowflake-managed v3 tables through the catalog see row lineage columns, default column values, and nanosecond timestamp precision. Write support for v3 tables from external engines is in public preview (as of the GA release, external v3 writes were not yet GA).

**Horizon Context and Semantic Studio:** New features for catalog-level semantic definitions. Horizon Context allows defining business terms and metrics at the catalog layer, and Semantic Studio provides a UI for creating and managing these definitions. When an external engine queries a table through the catalog, it can also retrieve the semantic context for the columns it accesses.

**Adaptive Compute for Iceberg:** Snowflake announced Adaptive Compute, a workload management feature that automatically scales compute resources for Iceberg tables accessed through the catalog. If an external engine submits a heavy scan to the catalog, Adaptive Compute can provision additional Snowflake warehouses to handle the scan planning workload. This is transparent to the external engine.

**Natoma Acquisition:** Snowflake acquired Natoma, a company focused on agent identity and security. The acquisition plans include integrating agent-aware access controls into the Horizon Catalog. If an AI agent accesses Iceberg data through the catalog, the agent's identity (not just the underlying engine identity) will be tracked and governed. This is expected to reach preview in late 2026.

**Horizon Catalog versus Open Catalog:** Snowflake clarified the distinction between two Iceberg catalog offerings:

- **Horizon Catalog** is the full enterprise catalog for Snowflake-managed assets. It includes Polaris-based Iceberg REST API, credential vending, server-side scan planning, row filters, column masks, Cortex AI governance integration, Dynamic Tables, and Horizon dashboards. This is the catalog that supports bidirectional writes.

- **Open Catalog** is Snowflake's managed Polaris offering for externally managed Iceberg tables. You can use Open Catalog as a standalone Iceberg REST catalog without running Snowflake compute. Open Catalog supports the full Polaris feature set (credential vending, server-side commit deconflicting, multi-table commits) but does not include Snowflake-specific governance features (Cortex AI, Semantic Studio, Horizon dashboards). Open Catalog is positioned as a "Polaris as a service" deployment.

The practical difference: if your table metadata is managed by Snowflake (Snowflake-managed Iceberg tables), you use Horizon Catalog. If your table metadata is managed elsewhere and you want Snowflake to store and serve the metadata through a Polaris-compatible API, you use Open Catalog.

## Comparison with Databricks Unity Catalog

At Snowflake Summit 2026, the interoperability comparison between Horizon and Unity Catalog was a recurring theme. The two catalogs take different approaches to external engine access.

**Horizon Catalog:** Exposes a standard Iceberg REST catalog endpoint (backed by Apache Polaris). Any engine with an Iceberg REST client can connect, authenticate, and read/write. The governance policies are enforced at the catalog layer via the Scan Plan API. The catalog is open-source at its core (Polaris) with enterprise features on top.

**Unity Catalog:** Does not expose a standard Iceberg REST catalog endpoint for external engine access. External engines must use Unity Catalog-specific APIs (the UC credential vending endpoint or JDBC-based Lakehouse Federation). The governance enforcement for external engines is described as "less established" by Snowflake's comparison blog. The open-source Unity Catalog (Linux Foundation) does not include credential vending or Iceberg REST API support.

The practical implications for a multi-engine architecture: if your primary engine is Databricks and all data processing stays within Databricks, Unity Catalog provides excellent governance and interoperability. If you need external engines (Spark running on EMR, Trino for interactive queries, DuckDB for local analysis) to access the same tables, Horizon Catalog's standard Iceberg REST API is simpler to integrate because every engine already has an Iceberg REST client.

Snowflake's engineering blog (May 2026) states the case directly: "Horizon implements the open Apache Iceberg REST Catalog specification (Apache Polaris). Any engine supporting the standard protocol can connect, receive vended credentials, and perform both reads and writes with governance policies enforced at the catalog layer regardless of engine."

## Getting Started with Bidirectional Writes

The setup process for external engine writes to Horizon Catalog is documented in Snowflake's user guide. The high-level steps:

1. **Enable Horizon Catalog for your Snowflake account.** This is a configuration change in Snowflake's admin console. The Horizon Catalog endpoint URL is generated automatically.

2. **Create a catalog integration for external engines.** The catalog integration defines the authentication method (OAuth, bearer token, or SigV4) and the allowed external identities.

3. **Configure credential vending or remote signing.** For S3, this typically involves configuring AWS Lake Formation or IAM roles for STS-based credential vending. For ADLS and GCS, this involves configuring the storage service's credential vending mechanism.

4. **Grant permissions.** Use standard Snowflake GRANT statements to grant SELECT, INSERT, UPDATE, DELETE, and CREATE TABLE permissions to the external engine's Snowflake identity.

5. **Connect the external engine.** Configure the engine's Iceberg REST catalog client with the Horizon Catalog endpoint URL and the authentication credentials.

6. **Test inbound and outbound operations.** Verify that the external engine can read and write Snowflake-managed tables, and that Snowflake can read and write tables managed by the external engine's catalog.

The Snowflake documentation (docs.snowflake.com) provides detailed setup instructions for each cloud provider and each engine type.

## The Bottom Line

Bidirectional Iceberg writes with Snowflake Horizon Catalog complete the circle of Iceberg interoperability. A Snowflake-managed table can now be written by Spark, Trino, PyIceberg, or any Iceberg REST client. The governance policies (row filters, column masks, access controls) are enforced at the catalog layer, uniformly across all engines.

The architecture is open by design: Horizon Catalog uses Apache Polaris internally, and the Iceberg REST API it exposes is the same standard that open-source Polaris and any other compliant catalog implement. Your Spark application does not need Snowflake-specific code to write to a Horizon-managed table. It uses the same Iceberg REST client it uses for any other catalog.

For teams evaluating multi-engine lakehouse architectures, Snowflake Horizon Catalog with bidirectional writes provides a practical path: keep the governance and security benefits of Snowflake while allowing specialized workloads (real-time streaming, ML training, complex ETL) to run on the engines best suited for them. The data lives in a single governed copy. The metadata is managed by an open-standard catalog. The engines compete on features, not on data access.

Snowflake Summit 2026 confirmed that catalog interoperability is now the primary competitive dimension in the lakehouse market. Snowflake's bet on Apache Polaris as the standard Iceberg REST catalog implementation positions Horizon Catalog as the most interoperable option for multi-engine architectures that include external compute.

---

*For detailed documentation on Horizon Catalog bidirectional writes, visit [docs.snowflake.com](https://docs.snowflake.com/en/user-guide/tables-iceberg-query-using-external-query-engine-snowflake-horizon). To explore Iceberg interoperability with a governed multi-engine lakehouse, start a free trial at [dremio.com/get-started](https://www.dremio.com/get-started).*
