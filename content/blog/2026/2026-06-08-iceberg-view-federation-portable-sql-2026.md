---
title: "The 2026 Guide to Iceberg View Federation"
date: "2026-06-08"
description: "Iceberg views standardize SQL view definitions across engines, enabling view federation across Polaris, Nessie, and Gravitino catalogs. How Snowflake Horizon, Databricks Unity Catalog, and open source catalogs handle portable SQL."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - "Iceberg view federation portable SQL"
  - "Iceberg views specification"
  - "SQL view portability"
  - "catalog federation"
  - "Polaris views"
  - "Snowflake Horizon views"
---

A view is the simplest and most powerful abstraction in data engineering. It is a saved SQL query that behaves like a table. Users query the view, not the underlying tables, and the engine resolves the SQL at query time. Every major query engine supports views. The problem is that each engine stores view metadata in a proprietary format. A view created in Trino cannot be read by Spark, even if they share the same Iceberg catalog and the same underlying data.

The Apache Iceberg View Specification solves this problem. It defines an open metadata format for SQL views, analogous to how Iceberg defines an open format for table metadata. A view stored in the Iceberg format can be created by one engine, read by any other Iceberg-compatible engine, and federated across catalogs. The view definition, schema, dialect, and version history are all stored in standard Iceberg metadata files, portable across the entire ecosystem.

This guide covers the Iceberg view specification, how Polaris, Nessie, and Gravitino handle views, the current state of cross-engine view portability, and practical guidance for deploying portable views in a multi-engine lakehouse.

## The Iceberg View Specification

The Iceberg view spec (format version 1) was adopted by the Apache Iceberg community and is available at [iceberg.apache.org/view-spec](https://iceberg.apache.org/view-spec/). It mirrors the structure of Iceberg table metadata: a versioned metadata file, atomic pointer swaps for consistency, and delegation to the catalog for namespace resolution.

**View metadata file structure:**

| Field | Requirement | Description |
|-------|-------------|-------------|
| view-uuid | required | UUID identifying the view, generated at creation |
| format-version | required | Must be 1 |
| location | required | Base path for view metadata files |
| schemas | required | List of known schemas for the view output |
| current-version-id | required | ID of the current version |
| versions | required | List of all known versions |
| version-log | required | History of version changes with timestamps |
| properties | optional | String map for comments, settings |

Each version has its own representation. The spec currently supports only one representation type: `"sql"`. A SQL representation includes the SQL SELECT statement, the dialect identifier (e.g., `"trino"`, `"spark"`, `"snowflake"`), and the default catalog and namespace for resolving table references.

**SQL representation fields:**

```json
{
  "type": "sql",
  "sql": "SELECT COUNT(1), CAST(event_ts AS DATE) FROM events GROUP BY 2",
  "dialect": "spark"
}
```

A single view version can have multiple SQL representations, one per dialect. This is the spec's mechanism for cross-engine portability. When you create a view in Snowflake, it stores a Snowflake-dialect SQL representation. When you create the same view in Spark, it stores a Spark-dialect SQL representation. Both represent the same logical definition, and the engine selects the representation matching its dialect at query time.

The default catalog and default namespace fields are important for federation. When a view references a table without a fully qualified name (e.g., `FROM orders` instead of `FROM prod.analytics.orders`), the engine uses the default catalog and namespace to resolve the reference. This allows views to be portable across catalog boundaries as long as the table references are qualified or the default catalog mapping is consistent.

## How Views Work in Polaris

Apache Polaris (graduated to top-level Apache project in February 2026) treats views as first-class metadata objects. Polaris stores the full Iceberg view metadata tree: view UUID, schema, version history, and all SQL representations. When an engine queries a view through Polaris, the catalog returns the view metadata, and the engine resolves the SQL representation for its dialect.

Polaris's principal-to-role-to-catalog-role access model applies to views as well as tables. You can grant SELECT on a view to a catalog role, and the catalog role inherits the underlying table permissions automatically. This is important: granting access to a view does not automatically grant access to the underlying tables, but Polaris enforces that the view creator has the necessary underlying permissions at view creation time. Subsequent queries through the view are checked against the view's permissions only, not re-checked against the base tables.

The key capability in Polaris is catalog federation for views. Polaris can register views from multiple backends (Hive Metastore, AWS Glue, other REST catalogs) as virtual entries in its namespace. A view defined in one catalog can reference tables in another catalog if the table references use fully qualified names. This is how Polaris enables enterprise-wide view federation without moving data.

Polaris v1.4 (released April 2026) added credential vending support for views. When an engine queries a view, Polaris resolves the view's SQL, determines which underlying tables are needed, and vends storage credentials scoped to those tables. This ensures that credential scope matches the actual data accessed, even when the view joins tables across different storage locations.

## How Views Work in Nessie

Project Nessie approaches views through its Git-like versioning model. A Nessie view is a versioned Iceberg view stored in the Nessie catalog. Each branch and tag has its own view state, and views are versioned atomically alongside tables.

Nessie stores Iceberg view metadata in its reference tree. When you create a view on a Nessie branch, it exists only on that branch until you merge it to the main branch. This enables data CI/CD workflows where a new view definition is tested on a branch before promoting to production.

The Nessie Iceberg REST API implementation exposes views through the standard Iceberg REST endpoints: `GET /namespaces/{namespace}/views`, `POST /namespaces/{namespace}/views`, `POST /views/{view}/rename`, and `DELETE /views/{view}`. Nessie 0.107.5 (April 2026) added support for the `default-catalog` field in view metadata, which enables cross-catalog view references when Nessie is used as a federation catalog.

Nessie does not have built-in credential vending for views. The engine must authenticate to the underlying storage layer separately. This limits Nessie's capability for cross-engine view federation in environments where storage credentials must be centrally managed.

## How Views Work in Gravitino

Apache Gravitino models views as one type of metadata object in its unified catalog layer. Gravitino's architecture differs from Polaris and Nessie: it is a meta-catalog that federates multiple underlying catalogs behind a single API. A view in Gravitino can reference tables from any of its federated catalogs, as long as the table references use qualified names.

Gravitino stores view definitions in its own metadata layer, not in Iceberg metadata files. This means a view created in Gravitino is portable across engines that use the Gravitino catalog, but it is not directly portable to a non-Gravitino catalog. Gravitino can export views in the Iceberg view format, but this is an explicit conversion step, not a native representation.

The practical difference: if your architecture uses Gravitino as the single catalog layer for all engines, Gravitino views work uniformly. If you mix catalogs (Polaris for production, Glue for development), the view definitions are not automatically portable. This is the current limitation of all meta-catalog approaches: they provide a unified API but not a unified metadata format.

## Snowflake Horizon Views vs Iceberg Native Views

Snowflake Horizon Catalog supports two categories of views: native Snowflake views (stored in Snowflake's proprietary metadata) and Iceberg native views (stored using the Iceberg view spec). The distinction matters for portability.

**Snowflake native views** are the default. They support Snowflake-specific syntax (e.g., Snowflake extensions to SQL, secure views, materialized views with Snowflake-specific refresh logic). A native Snowflake view cannot be read by an external engine through the Horizon Iceberg REST Catalog API. External engines see the underlying tables but not the Snowflake views defined on top of them.

**Iceberg native views** in Snowflake Horizon are stored using the Iceberg view spec. They are visible to external engines through the Horizon REST Catalog API. An external engine (Spark, Trino) can query the view, and Horizon returns the view metadata, including the SQL representation. The engine then resolves the SQL using its own dialect interpretation.

Snowflake Horizon's Iceberg native view support, announced at Snowflake Summit 2026, enables a critical multi-engine pattern: define business logic once as an Iceberg view in Snowflake, and let external engines query the same view definition with consistent results. The view definition is versioned, the schema is explicit, and the dialect-specific SQL representations are stored alongside each other.

The Horizon Catalog uses Apache Polaris internally for the Iceberg REST catalog implementation. This means the view definition, access control, and credential vending all go through the same Polaris-powered API that external engines use. The governance is unified even though the query engines vary.

## View Federation Across Catalogs

View federation is the ability to query a view defined in one catalog that references tables in another catalog. This is not yet a fully solved problem, but the Iceberg view spec and catalog implementations are converging on a solution.

**The reference resolution problem:** A view defined in Polaris might reference `analytics.orders`. When an engine queries the view through Polaris, it resolves `analytics.orders` against Polaris's namespace. If the same view definition is ported to Unity Catalog, the engine resolves `analytics.orders` against Unity Catalog's namespace. The two catalogs might have different table structures, different access controls, or different naming conventions. The view definition is portable, but the resolution context is not.

**The solution path:** Three approaches are emerging for cross-catalog view federation:

1. **Fully qualified references.** If the view SQL uses three-part names (catalog.namespace.table), the view definition is self-contained. The engine resolves `catalog.analytics.orders` directly, regardless of which catalog holds the view definition. This works as long as the engine can reach the referenced catalog.

2. **Default catalog remapping.** The Iceberg view spec supports a `default-catalog` field. Catalogs can implement a remapping policy: when a view comes from catalog A with default catalog B, and the view is queried through catalog C, the system remaps catalog B to catalog C (or another matching catalog). This is what Polaris's catalog federation feature does.

3. **Server-side view expansion.** The catalog resolves the view SQL on the server side, replacing view references with the underlying table references, and returns the expanded query to the engine. This is how the Iceberg REST Scan Plan API (v1.11+) works: the catalog plans the scan and returns only the file-level metadata with access credentials. View resolution happens entirely on the catalog side, invisible to the engine.

## Cross-Engine SQL Portability in Practice

Portable SQL means the same view definition produces the same results regardless of which engine runs it. Achieving this in practice requires discipline around SQL dialect features.

**Portable:** Standard SQL SELECT, FROM, WHERE, GROUP BY, HAVING, JOIN (INNER, LEFT, RIGHT), subqueries, aggregate functions (COUNT, SUM, AVG, MIN, MAX), scalar functions (CAST, COALESCE, NULLIF), and window functions (ROW_NUMBER, RANK, LAG, LEAD).

**Not portable:** Engine-specific SQL extensions, table-valued functions, custom aggregate functions, engine-specific date/time arithmetic, variance in NULL handling across engines, query hints, query optimizer directives.

The Iceberg view spec stores the dialect alongside each SQL representation. An engine reading a view with a dialect it does not support should either (a) try to interpret the SQL anyway (best-effort parsing), (b) look for an alternative representation with a supported dialect, or (c) fail with a clear error message stating the dialect mismatch.

In practice, the safest approach for portable views is to use the dialect `"ANSI"` (a proposed extension to the spec that indicates standard SQL only) or to maintain two representations: one in `"spark"` dialect and one in `"trino"` dialect, both representing the same logical query.

## Practical Deployment Guide

Deploying portable Iceberg views requires planning, but the effort is modest compared to the benefit of cross-engine view consistency.

**Step 1: Choose a catalog.** Pick one catalog to be the primary home for your Iceberg views. Polaris is the natural choice for multi-engine architectures because it implements the full Iceberg REST spec and supports credential vending for both reads and writes. Nessie is a good choice if you need Git-like versioning and data CI/CD for view definitions.

**Step 2: Use fully qualified table references.** Write view SQL with three-part names (catalog.schema.table) so the view definition is self-contained and does not depend on the calling engine's namespace resolution.

**Step 3: Test on every engine.** For each view, create a test that queries the view from every engine you support. Verify that the results are identical. Document any engine-specific differences in a compatibility matrix.

**Step 4: Version your views.** Views can be versioned implicitly through the Iceberg spec's version tracking. When you update a view, the old version is preserved in the version log. You can query a specific version of a view, which is useful for rollback and for maintaining backward compatibility.

**Step 5: Set permissions at the view level.** Grant SELECT on the view to the relevant roles. Do not grant direct SELECT on the underlying tables to the view consumers. This enforces the view as the access boundary and allows you to change the underlying tables without changing the consumer permissions.

## The Bottom Line

Iceberg views are a mature, standardized mechanism for portable SQL definitions across multi-engine lakehouses. The spec is complete, Polaris and Nessie implement it fully, and Snowflake Horizon supports Iceberg native views alongside its proprietary view layer.

The practical value is straightforward: a view defined once in Polaris works in Snowflake, Databricks, Spark, and any engine that implements the Iceberg REST catalog client. The view definition, version history, and access control are centralized. The query engines compete on performance and features, not on data access.

For teams running multiple query engines across a common Iceberg catalog, adopting Iceberg views is the single highest-impact step they can take toward portable, governed SQL. The alternative (duplicating view definitions in each engine) creates maintenance debt that grows with every schema change, every engine upgrade, and every new team member who needs to understand the data.

---

*For the full Iceberg view specification, visit [iceberg.apache.org/view-spec](https://iceberg.apache.org/view-spec/). To deploy Iceberg views in a governed, multi-engine lakehouse, start a free trial at [dremio.com/get-started](https://www.dremio.com/get-started).*
