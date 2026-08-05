---
title: "Cross-Cloud Credential Vending in Apache Polaris and the End of Permanent Storage Keys"
date: "2026-08-04"
description: "How Apache Polaris vends short-lived, prefix-scoped storage credentials across AWS, Azure, and GCP, and how to retire permanent storage keys for good."
author: "Alex Merced"
category: "Apache Polaris"
tags:
  - Apache Polaris
  - Credential Vending
  - Security
  - RBAC
  - Multi-Cloud
  - Apache Iceberg
canonical: "https://iceberglakehouse.com/posts/polaris-cross-cloud-credential-vending/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/polaris-cross-cloud-credential-vending/).

# Cross-Cloud Credential Vending in Apache Polaris and the End of Permanent Storage Keys

*By Alex Merced, Data Lakehouse and AI Evangelist*

Pull up the configuration for any Spark cluster that reads a data lake and look for the storage credentials. In most organizations you find an IAM role with read access to an entire warehouse bucket, or worse, an access key pair in a properties file that three teams share and nobody has rotated since the cluster was built.

That configuration means every job on that cluster reads every table in that bucket. The catalog has a permission model. The storage has a permission model. Neither one knows about the other, so the union of what a user can do is whatever the engine's credentials allow.

Credential vending closes that gap. The catalog authorizes the request, mints a short-lived credential scoped to the exact storage prefix that one table lives in, and hands it back with the table metadata. The engine gets access to that table's files and nothing else, for a few minutes.

Apache Polaris implements this across S3, Azure Data Lake Storage, and Google Cloud Storage, which makes it the practical reference for how the pattern works in a multi-cloud deployment. This piece walks through the mechanism cloud by cloud, covers the RBAC model that decides what gets vended, explains where the model stops and what you put on top, and works through the failure modes including a real vulnerability that shows why the boundary checks matter.

A disclosure. I work for Dremio, which was acquired by SAP and now sits within SAP Business Data Cloud. Dremio ships a catalog built on Polaris. Polaris itself was co-created with Snowflake, donated to the Apache Software Foundation, and graduated to Top-Level Project on February 18, 2026. Everything below traces to the open source project.

## What permanent keys actually cost

The case against long-lived credentials is usually made in compliance language. The operational case is stronger.

Revocation does not work. A leaked key stays valid until someone manually rotates it, and rotation means updating every consumer that holds it. In an organization with a dozen engines, several notebooks, a handful of scheduled jobs, and a BI tool, that is a coordinated change nobody wants to make. So keys do not get rotated, and the theoretical revocation path is theoretical.

Audit trails blur. Cloud storage access logs record which credential read which object. If forty jobs share one role, the log tells you a role read a file. It does not tell you which job, which user, or which query. Reconstructing who saw what after an incident becomes archaeology.

Blast radius is the whole bucket. A compromised engine, a mistaken notebook, or a job with a bad path variable reaches everything the role can reach. Table-level permissions in the catalog do nothing to stop direct object access.

Compliance frameworks encode all of this. SOC 2, HIPAA, and PCI DSS all push toward temporal, traceable, least-privilege access. Permanent shared keys fail every part of that.

The reason this persisted so long is that there was no alternative in the client-side catalog model. The engine had to reach storage directly, and nothing sat in the path to make a per-request decision. Moving the catalog behind a REST service created the place where that decision happens.

## The vending flow

The sequence is short. Understanding it makes the configuration make sense.

The client authenticates to Polaris and receives a token identifying a principal. This is standard OAuth2 client credentials in most deployments.

The client requests a table load, and it asks for delegated access through a header. Without that header, Polaris returns metadata and assumes the engine brings its own storage credentials.

Polaris checks the RBAC model. Does this principal, through its principal roles and the catalog roles granted to them, hold the privilege needed on this table?

If authorized, Polaris calls the cloud provider's token service using the IAM entity configured for that catalog's storage location. It requests a credential scoped down to the table's storage prefix and to the operations the principal is allowed to perform. Read-only privileges produce read-only credentials.

Polaris returns the table metadata plus a `config` block containing the credential and its expiry.

The client applies those settings to its file IO layer for that table and reads Parquet files directly from storage. No proxy, no data path through the catalog. The catalog is in the authorization path, not the data path, which is what keeps it fast.

The header that turns this on is the part people miss.

```
X-Iceberg-Access-Delegation: vended-credentials
```

In Spark configuration:

```
spark.sql.catalog.prod                = org.apache.iceberg.spark.SparkCatalog
spark.sql.catalog.prod.type           = rest
spark.sql.catalog.prod.uri            = https://polaris.internal.example.com/api/catalog
spark.sql.catalog.prod.warehouse      = analytics
spark.sql.catalog.prod.credential     = <client-id>:<client-secret>
spark.sql.catalog.prod.scope          = PRINCIPAL_ROLE:ALL
spark.sql.catalog.prod.header.X-Iceberg-Access-Delegation = vended-credentials
```

The `scope` parameter determines which principal roles activate for the session. A principal granted several roles narrows to a subset for a given job, which is a useful way to run a job under least privilege without creating a separate principal for every task.

## How each cloud does it

The vending concept is uniform. The underlying mechanism differs per provider, and the differences show up in configuration and in what your cloud administrators have to set up.

On AWS, Polaris assumes an IAM role through STS. The catalog's storage configuration names a role ARN, an external ID, and a set of allowed locations. Polaris calls `AssumeRole` and attaches a session policy that narrows the resulting credential to the specific table prefix. The external ID is what prevents the confused deputy problem, where another tenant of the same service tricks Polaris into assuming your role.

The storage configuration when creating a catalog looks like this.

```json
{
  "name": "analytics",
  "type": "INTERNAL",
  "properties": {
    "default-base-location": "s3://acme-lakehouse/warehouse"
  },
  "storageConfigInfo": {
    "storageType": "S3",
    "roleArn": "arn:aws:iam::123456789012:role/PolarisWarehouseAccess",
    "externalId": "acme-polaris-prod",
    "userArn": "arn:aws:iam::123456789012:user/polaris-service",
    "allowedLocations": [
      "s3://acme-lakehouse/warehouse/"
    ]
  }
}
```

`allowedLocations` is the outer boundary. Polaris refuses to vend credentials for anything outside it and refuses to register tables whose location falls outside it. Treat this as a security control rather than a convenience setting, and keep it as narrow as the deployment allows. A wildcard here removes most of the protection the model provides.

`roleArn` points at a role whose trust policy allows the Polaris service principal to assume it, conditioned on the external ID. The role's own permission policy grants access to the warehouse prefix. The session policy Polaris attaches narrows further, per table, per request.

On Azure, the mechanism is a multi-tenant application with a consent flow. The storage configuration names the tenant ID and the application, and an administrator in the storage account's tenant grants consent through a URL. Polaris then requests scoped SAS tokens or OAuth tokens for ADLS Gen2 paths.

```json
{
  "storageConfigInfo": {
    "storageType": "AZURE",
    "tenantId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "multiTenantAppName": "polaris-storage-access",
    "allowedLocations": [
      "abfss://warehouse@acmelake.dfs.core.windows.net/"
    ]
  }
}
```

On Google Cloud, Polaris impersonates a service account. Recent work added principal attribution through Workload Identity Federation: credential vending chains a catalog-signed JWT through an STS token exchange and service account impersonation, so the Polaris principal shows up in GCS Data Access audit logs rather than only the service account. That closes the audit gap that impersonation otherwise creates, and it needs the audience, token issuer, and signing key configuration set alongside it.

```json
{
  "storageConfigInfo": {
    "storageType": "GCS",
    "gcsServiceAccount": "polaris-warehouse@acme-data.iam.gserviceaccount.com",
    "allowedLocations": [
      "gs://acme-lakehouse/warehouse/"
    ]
  }
}
```

The cross-cloud point is that the engine sees none of this. A Spark job reading a table in S3 and a table in ADLS through the same catalog gets a credential in each response and applies it. The engine's own configuration holds no cloud credentials at all. That is what makes a genuinely multi-cloud lakehouse operationally sane rather than a matrix of secrets.

## The RBAC model that decides what gets vended

Vending is the enforcement mechanism. The decision comes from Polaris RBAC, and the model has four moving parts.

A **principal** is an identity: a user, a service account, an engine. Principals authenticate and receive tokens.

A **principal role** groups principals. It maps to organizational roles like `data_engineer`, `analyst`, or `ingestion_service`.

A **catalog role** holds privileges on securable objects. It grants things like read on a namespace or write on a table.

A **grant** connects a catalog role to a principal role, and privileges to a catalog role.

Every securable object participates: catalogs, namespaces, tables, and views.

Setting this up through the CLI looks like this.

```bash
polaris principal-roles create analyst

polaris catalog-roles create --catalog analytics sales_reader

polaris privileges --catalog analytics --catalog-role sales_reader \
    namespace grant --namespace sales TABLE_READ_DATA

polaris privileges --catalog analytics --catalog-role sales_reader \
    namespace grant --namespace sales TABLE_LIST

polaris catalog-roles grant --catalog analytics \
    --principal-role analyst sales_reader

polaris principals create --principal-role analyst jane_analyst
```

Read that chain from the bottom up. The principal holds a principal role. The principal role holds a catalog role. The catalog role holds privileges on a namespace. A table load request walks that chain, and the privileges found at the end determine both whether the load succeeds and what the vended credential permits.

`TABLE_READ_DATA` produces a read-only credential. A principal with `TABLE_WRITE_DATA` gets one that permits writes. The storage permission and the catalog permission stop being two independent systems.

The layer of indirection between principal roles and catalog roles pays off in multi-catalog deployments. One organizational role maps to different privilege sets in different catalogs without creating a separate identity per catalog.

## Where the model stops

Polaris RBAC operates at the object level: catalog, namespace, table, view. It does not natively filter rows or mask columns. A feature request for row-level and column-level access control has been open in the project since 2024, and treating it as available is a mistake I see in architecture documents regularly.

That is not a gap in the design so much as a boundary in it. A vended credential grants access to files. Files contain rows. A credential cannot express "you get the rows where region equals EMEA" because storage does not understand rows.

Three approaches fill the gap, and they compose.

**Views.** Iceberg views are catalog objects with their own privileges. Grant a principal role access to a view that filters rows and deny access to the underlying table. The engine executes the view definition, and the principal never holds a credential for the base table.

```sql
CREATE VIEW analytics.sales.orders_emea AS
SELECT order_id, customer_id, amount, order_date
FROM analytics.sales.orders
WHERE region = 'EMEA';
```

This works, and it has an obvious weakness. Enforcement depends on nobody holding privileges on the base table. One overly generous grant and the filter is bypassed. Audit the base table grants, not just the view grants.

**External policy engines.** Polaris supports externalizing authorization to Open Policy Agent, which moves complex policy decisions out of the catalog's own model. Apache Ranger fills a similar role in many deployments. This is the path when policy depends on attributes, time, or context that a static role grant cannot express.

**A semantic layer in the engine.** Query engines that present virtual datasets apply row filters and column masks at query time based on the querying identity. On the Dremio side, the semantic layer serves views to users with policies attached, while the Open Catalog powered by Polaris handles object-level authorization and vending underneath. Since the SAP acquisition, those same governed views also surface into SAP Business Data Cloud, which means the row filter is defined once rather than per consuming tool.

The general architecture is a three-layer model. The table format handles data portability. The catalog control plane handles object-level enforcement and credential vending. A policy engine or semantic layer handles rules that depend on data values. Iceberg deliberately keeps governance out of the format, and this is why.

## Failure modes

**Overly broad allowed locations.** The single most consequential misconfiguration. `allowedLocations` set to a whole bucket root, or worse a wildcard, means the boundary check that protects everything else stops protecting anything.

**The metadata path vulnerability.** This one is worth studying because it shows how the pieces interact. CVE-2026-42812 covers a flaw where the table property `write.metadata.path` bypassed location validation when changed through a settings update. With `polaris.config.allow.unstructured.table.location=true` and a broad `allowedLocations`, Polaris persisted the unchecked path and later vended credentials for that area. An authenticated user with table modification privileges redirected metadata writes to a location of their choosing and obtained credentials reading or writing outside the original table prefix. It carries a CVSS 4.0 score of 9.4.

Three lessons come out of that. Patch promptly, because catalogs are now security-critical infrastructure rather than metadata lookups. Keep unstructured location configuration off unless a specific requirement demands it. And keep `allowedLocations` narrow, since the breadth of that setting determined how much damage the flaw allowed.

**Credential expiry mid-query.** Vended credentials are short-lived by design. A scan that runs longer than the credential lifetime fails partway through unless the client refreshes. Most clients handle it. Some do not, and the symptom is a long-running query failing with an access denied error that makes no sense in context. Test a query that deliberately outlives your TTL.

**Maintenance procedures that cannot use vending.** Some operations do not work through vended credentials. `remove_orphan_files` in Spark is a known case, tracked against the Iceberg project, because the procedure lists storage paths outside the table's known file set. Run those procedures with an appropriately scoped separate identity rather than loosening the whole catalog.

**Shared service principals.** A deployment where every query arrives as one engine service principal gets short-lived credentials and none of the authorization benefit. The audit log shows the engine, not the user. Propagate end user identity through to the catalog, or the model degrades into permanent keys with extra steps.

**Legacy paths left open.** Vending adds a secure path. It does not remove the old one. If the engine still has its original IAM role attached, nothing forces it to use the vended credential. Strip the storage permissions from engine compute roles once vending is working, and verify by breaking vending in a test environment and confirming that reads actually fail.

**Catalog availability becomes storage availability.** Every table load hits the catalog. A catalog outage stops reads across every engine at once. Run it with production database posture: multiple instances, managed backing store, real monitoring.

## Operational guidance

Turn on the audit path and keep it off the commit thread. Polaris publishes metrics through Micrometer and traces through OpenTelemetry, and recent community work moved event listeners onto a dedicated thread pool so audit and change-event processing does not block commits. Record principal, table, privilege, and vending event for every load.

Set credential TTL from your longest expected query rather than an average, then confirm refresh behavior in every client.

Model roles around data domains rather than around teams. Teams reorganize. The sales namespace does not. Catalog roles named for what they access outlive catalog roles named for who uses them.

Grant at the namespace level where the access pattern is uniform and at the table level where it is not. Namespace grants are far easier to reason about during an audit, which matters more than the small loss of precision.

Test negative cases explicitly. Write an automated check that a principal without a grant receives an error on table load, and that a read-only principal receives a credential that fails on write. Positive tests pass for the wrong reasons all the time.

Review `allowedLocations`, unstructured location settings, and base table grants on a schedule. These three settings are where the security model erodes quietly.

Keep the catalog patched and subscribe to project security announcements. A component that mints cloud credentials belongs in the same patching tier as your identity provider.

## A setup you can run end to end

The pieces above are easier to hold together once you have done the whole sequence once. Here is the shape of a working deployment, in order.

Stand up Polaris with a persistent backing store. The in-memory mode in the quickstart is fine for a first look and wrong for anything else, because principals and grants disappear on restart. Use the relational persistence backend against a managed database. Multi-table transaction atomicity depends on that store, so it is not an incidental choice.

Bootstrap the realm and capture the root credentials. Polaris prints a client ID and secret exactly once. Store them in your secret manager immediately, because recovering from losing them means bootstrapping again.

Create the cloud IAM entity before the catalog. On AWS that means a role with a trust policy naming the Polaris service identity and conditioned on your external ID, and a permission policy granting access to the warehouse prefix.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:aws:s3:::acme-lakehouse",
        "arn:aws:s3:::acme-lakehouse/warehouse/*"
      ]
    }
  ]
}
```

Notice that this policy is the outer limit of what Polaris ever hands out, not what any principal receives. Polaris narrows further per request through the session policy. Keep this policy scoped to the warehouse prefix rather than the bucket root, so that a misconfiguration inside Polaris still cannot reach unrelated data in the same bucket.

Create the catalog with its storage configuration.

```bash
curl -X POST https://polaris.internal.example.com/api/management/v1/catalogs   -H "Authorization: Bearer $POLARIS_TOKEN"   -H "Content-Type: application/json"   -d @catalog-analytics.json
```

The payload is the JSON shown earlier. Verify by reading the catalog back and confirming `allowedLocations` matches what you sent, since a typo here surfaces later as a confusing permission denial.

Build the role structure before registering any tables. This ordering matters more than it looks. A catalog with tables and permissive defaults is a window during which anything registered is broadly readable. Roles first, tables second.

Register or create tables, then connect an engine with the delegation header and run a read.

Now run the test that proves the model works. Take an engine whose compute identity has no storage permissions at all, point it at the catalog with vending enabled, and read a table. If it succeeds, vending is doing the work. If it fails, the engine was reading through its own credentials all along and you have been testing nothing.

That last check is the one teams skip, and skipping it is how deployments end up with vending configured and static keys still doing the actual work.

## Migrating an existing deployment

Most readers are not starting clean. Here is a phased path off static credentials that does not require a flag day.

**Phase one: run Polaris alongside the existing catalog.** Register a small set of low-risk tables. Leave everything else where it is. The goal is to prove the storage configuration and the IAM trust relationships in your actual cloud account, which is where the surprises live.

**Phase two: build the role model against real organizational structure.** Map principal roles to the groups your identity provider already has. Map catalog roles to data domains. Resist the temptation to recreate whatever grants exist in the old system, since those grants accumulated by accretion and this is the one chance to rebuild them deliberately.

**Phase three: migrate tables domain by domain.** Registration is a pointer operation and does not move data. Do one domain at a time, with a clear owner, and freeze writes to a table during its cutover so that two catalogs never both believe they own it.

**Phase four: turn on vending for migrated tables while engine credentials still exist.** Both paths work. Nothing breaks. Watch the audit logs to confirm that vending events appear for the queries you expect.

**Phase five: remove storage permissions from engine compute roles.** This is the phase that delivers the security benefit, and it is the one that gets deferred indefinitely if you do not schedule it. Do it per engine, with a rollback plan, and expect to find two or three jobs that were reading paths nobody documented.

**Phase six: audit what is left.** Search for remaining static credentials in configuration management, notebooks, CI systems, and scheduler definitions. There are always more than the inventory says.

The phase that surprises people is the fifth. Until engine credentials are gone, every earlier phase is preparation. A deployment sitting at phase four has done all the work and captured none of the benefit, and there is a real risk of declaring victory there because everything demonstrably works.

## What good looks like when it is running

A few observable properties tell you the model is genuinely in place rather than nominally configured.

Storage access logs show short-lived session credentials rather than long-lived principals, and the session identity traces back to a catalog principal. On GCS with principal attribution enabled, the Polaris principal appears in Data Access audit logs through the delegation info field, which means the storage log alone answers who read what.

Engine configuration contains no cloud credentials. Searching your Spark, Flink, and query engine configuration for access keys, role ARNs, or connection strings returns nothing.

A revoked grant takes effect within one credential lifetime. Remove a principal role assignment and the affected user loses access when their current credential expires, without anyone rotating a key or restarting a cluster. Test this deliberately, because it is the property that permanent keys can never provide and the one that justifies the whole architecture.

Adding a new engine requires a catalog principal and nothing in the cloud account. That is the multi-cloud payoff. A new query engine, a notebook environment, or an agent framework joins the platform through a catalog registration rather than through a ticket to the cloud security team.

Table-level access decisions appear in one place. When someone asks who can read the sales namespace, the answer comes from the catalog rather than from a reconciliation of catalog grants against IAM policies against bucket policies.

If those five statements hold, the permanent key problem is actually solved rather than layered over. If any one of them fails, that is where to spend the next sprint, because a partial implementation carries the operational cost of the new model and the risk profile of the old one.

## Where this goes

Federated vending is expanding. Polaris mints credentials for external catalogs like Glue and Snowflake rather than requiring clients to hold their own, which extends one authorization model across catalogs the organization does not own.

Generic table support brings Delta Lake and Hudi under the same catalog governance, so the vending model stops being Iceberg-specific.

The agent workload pushes hardest on all of this. An analyst who writes a bad query notices the result looks wrong. An agent issuing hundreds of queries an hour does not. Short-lived, per-request, per-principal credentials are the right shape for a consumer that acts continuously and without review, which is why every catalog roadmap in 2026 is bending toward this problem.

## Conclusion

Permanent storage keys persisted because the architecture gave them nowhere else to live. Moving the catalog into the request path created the place where a per-table, per-principal, per-request decision happens, and credential vending is what that decision produces.

The mechanism is not exotic. It is a short-lived token, scoped to a prefix, issued after an authorization check that already existed. The model is uniform across clouds and different underneath: STS role assumption on AWS, multi-tenant consent on Azure, service account impersonation with workload identity federation on GCP. The engine sees a config block and applies it.

Get `allowedLocations` narrow, propagate real user identity, strip storage permissions from engine compute roles, layer views or a policy engine on top for row and column rules, and patch the catalog like the security infrastructure it now is. Do those six things and the rest of the model takes care of itself.

## Keep Going

If this piece was useful, I have written a lot more on catalogs and lakehouse governance. *Apache Polaris: The Definitive Guide* covers the RBAC model, storage configuration, and credential vending in depth across all three major clouds, and *Architecting an Apache Iceberg Lakehouse* places it in the wider platform design. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
