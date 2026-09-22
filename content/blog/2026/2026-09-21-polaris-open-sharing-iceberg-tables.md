---
title: "How Apache Polaris Plans to Share Iceberg Tables Across Organizations"
date: "2026-09-21"
description: "Apache Polaris's Open Sharing proposal adds first-class shares, external consumers, and listings so any Iceberg REST engine can read shared tables."
author: "Alex Merced"
category: "Apache Polaris"
tags:
  - Apache Polaris
  - Data Sharing
  - Iceberg REST
  - Lakehouse
canonical: https://iceberglakehouse.com/posts/polaris-open-sharing-iceberg-tables/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/polaris-open-sharing-iceberg-tables/).

A retailer wants to give a supplier live access to three sales tables. Nothing else. The supplier runs its own query engine in its own cloud account. The retailer does not want to copy the data into the supplier's account every night, and it does not want the supplier logging into its data platform like an employee.

With an Apache Iceberg REST catalog such as Apache Polaris, the mechanics already exist. The retailer creates an identity for the supplier, grants it read access to the right namespace, and the supplier's engine reads the tables through the standard REST protocol, with short-lived storage credentials vended by the catalog. No copies. No custom connector.

What does not exist is the concept. There is no object called a share. Nothing records "these three tables, for this supplier, until this date." Nothing separates the supplier from internal users in the audit log or in the API they call. The retailer's intent lives in a set of grants that look identical to every other grant in the catalog.

That gap is what the Open Sharing proposal for Apache Polaris aims to close. It started as a design document from Dennis Huo and Jean-Baptiste Onofré in May 2026. By September it had become a draft OpenAPI specification in Polaris pull request #5446, with a working model of shares, external consumers, and listings. This article walks through why sharing needs its own model, how to share with Polaris today, what the proposed model adds, what the draft spec says, and which design questions are still open.

A disclosure before going further: Apache Polaris was co-created by Snowflake and Dremio, and I work at Dremio. Jean-Baptiste Onofré, one of the proposal's co-authors, is a Dremio colleague. The proposal is an Apache community effort, discussed in public on the Polaris dev list, and that is what this article reports.

## Why Sharing Is Different From Access Control

Every catalog has access control. Polaris has a complete role-based access control (RBAC) model: principals, principal roles, catalog roles, and privileges on catalogs, namespaces, and tables. So why does sharing need anything new?

Dennis Huo's opening message to the dev list answered that directly. Sharing data between companies needs a first-class governance and management layer that is distinct from basic RBAC. When you share across partially untrusted organizational boundaries, you do not let the consuming organization sign in to your lakehouse as if it were one of your own employees.

The difference shows up in four places.

**Intent.** Internal access control answers "what can this person do?" Sharing answers "what did we agree to give this organization, and for how long?" That agreement has a name, an owner, a start, and often an end. RBAC grants carry none of that.

**Identity.** An internal user belongs to your identity provider. A consumer organization has its own identity system, its own users, and its own turnover. You need an identity that represents the relationship with that organization, not a fake employee account.

**Surface.** An internal user calls your catalog's full API. A consumer should see a narrow, read-only surface that exposes only what was shared, and should never touch your internal endpoints at all.

**Audit.** When auditors ask what a partner accessed, the answer needs to roll up to the agreement. "Principal 4471 read table X" is less useful than "the supplier listing for the Q3 sales share read table X."

Commercial platforms reached the same conclusion years ago. The proposal's opening message cites Delta Sharing, Snowflake data sharing, Amazon Redshift datashares, BigQuery Analytics Hub, and Microsoft Fabric external data sharing as examples of managed sharing features. Each one packages sharing as its own concept on top of the platform's storage and permissions. I compared how several of those vendor-to-vendor sharing arrangements work in [What Zero-Copy Data Sharing Actually Does Between Salesforce, Snowflake, and Databricks](https://iceberglakehouse.com/posts/zero-copy-data-sharing-iceberg/). The Polaris proposal is different in kind. It defines sharing inside an open catalog, with the consumer side speaking the standard Iceberg REST protocol.

## Sharing With Polaris Today

Before looking at the proposal, it helps to see what already works. Jean-Baptiste Onofré laid out the current recipe on the dev list in July 2026. Polaris already has most of the pieces. What it lacks is packaging.

The recipe on the provider side uses standard Polaris RBAC. You create a dedicated principal for the consumer, with its own client ID and secret. You create a catalog role with read-only grants on the namespaces to share, specifically `TABLE_READ_DATA`, `TABLE_LIST`, and `NAMESPACE_LIST`, and no write grants. You create a principal role for the destination, attach the catalog role to it, and assign the principal to that principal role.

With the Polaris command-line interface, that looks like this.

```bash
# 1. An identity for the consumer organization.
#    The output includes a client ID and secret. Store them securely.
polaris principals create supplier_acme

# 2. A principal role that represents the relationship.
polaris principal-roles create supplier_acme_role
polaris principal-roles grant --principal supplier_acme supplier_acme_role

# 3. A catalog role holding only read privileges on the shared namespace.
polaris catalog-roles create --catalog retail supplier_acme_read

polaris privileges catalog grant \
  --catalog retail --catalog-role supplier_acme_read \
  NAMESPACE_LIST

polaris privileges namespace grant \
  --catalog retail --catalog-role supplier_acme_read \
  --namespace sales_shared \
  TABLE_LIST

polaris privileges namespace grant \
  --catalog retail --catalog-role supplier_acme_read \
  --namespace sales_shared \
  TABLE_READ_DATA

# 4. Connect the catalog role to the consumer's principal role.
polaris catalog-roles grant \
  --catalog retail --principal-role supplier_acme_role \
  supplier_acme_read
```

Each step maps to a piece of the sharing idea. The principal is the consumer's identity. The catalog role is the scope of what is shared. The principal role is the binding between them. The privileges are all read-only, so the consumer cannot create, alter, or drop anything.

On the consumer side, no special setup is required. Any Iceberg REST client works. The consumer points its engine at the provider's catalog endpoint, authenticates with the client ID and secret, and loads tables with the `X-Iceberg-Access-Delegation: vended-credentials` header. Polaris answers each table load with temporary, read-only storage credentials scoped to that table's files. The engine reads data files directly from the provider's bucket, without access to anything else in that bucket.

This is zero-copy sharing in the literal sense. The data never moves until the consumer's engine reads it, and there is exactly one copy of each file. The provider stays in control of every access, because every table load goes through the catalog, and revoking the grant cuts off new credentials immediately. Credentials already handed out expire on their own short schedule.

If you want the full mechanics of how Polaris mints those scoped credentials on each cloud, I cover them in [Cross-Cloud Credential Vending in Apache Polaris](https://iceberglakehouse.com/posts/polaris-cross-cloud-credential-vending/).

## What the Recipe Leaves Out

The recipe works, and teams use variations of it today. It also has gaps that grow with the number of consumers. Each gap is a reason the proposal exists.

**No object represents the share.** The agreement "these tables, for this supplier" is spread across a principal, a principal role, a catalog role, and several grants. None of them says it is a share. Listing every active share in a catalog means reverse-engineering intent from grant patterns. That works for two partners. It does not work for forty.

**The scope is namespace-shaped.** The recipe grants privileges at the namespace level, so sharing three tables out of a namespace of twenty means either creating a dedicated namespace for shared tables or granting table by table. Neither choice records that the three tables are a set that belongs together.

**Nothing stops the scope from widening quietly.** The catalog role behind a share is an ordinary catalog role. Anyone with the right admin privileges can grant it more privileges or attach it to more principal roles, and nothing flags that the change affected an external party.

**The consumer uses your internal API.** In the recipe, the supplier authenticates against the same token endpoint and calls the same `/api/catalog` routes as internal engines. The surface is read-only by privilege, but it is not segregated by design. A misconfigured grant exposes internal objects through the same door.

**Audit rolls up to a principal, not an agreement.** Access logs show principal names. Mapping those back to business agreements happens in someone's spreadsheet.

**Expiry is manual.** Agreements end. Nothing in the recipe records an end date, so revocation depends on someone remembering.

**History is shared along with the present.** This gap surprised some participants in the discussion. Sharing through the standard Iceberg REST protocol exposes the table's metadata, which includes its snapshot history. A consumer who can load the table can time travel to any snapshot the table still retains. The August 7 community sync recap called this out plainly. Deleting rows from a shared table does not make those rows inaccessible to the consumer, because older snapshots still contain them until they expire.

None of these gaps is a bug in Polaris. Each one comes from using a general access control model for a specific business process. The proposal's job is to give that process its own objects, while reusing the access control underneath.

## The Proposed Model

Dennis Huo's first message sketched five logical constructs. His July follow-up restated them as abstract requirements, which is the clearest way to understand them.

| Requirement | Construct | What it represents |
|---|---|---|
| A container for what is shared | `ShareEntity` | A named set of objects offered together, behaving much like a catalog |
| A consumer identity | `ExternalConsumer` | A restricted, principal-like identity for an outside organization |
| A binding of consumer to container | `Listing` | The grant of one share to one consumer, with its own metadata |
| A segregated access point | `EndpointConfig` | The connection details a consumer uses, nested under a listing |
| Membership of objects in a container | `ShareMembership` | Which catalog objects belong to a share |

A few properties of this model deserve attention.

**The listing is the unit of audit.** A consumer reaches shared data only through a listing. That makes "which listing did this access come through?" answerable for every request. It also gives each consumer relationship its own lifecycle. Delete the listing and that consumer loses the share, while other consumers of the same share keep theirs.

**Membership is explicit.** A share enumerates its members instead of inheriting everything under a namespace. Three tables are three members. Adding a fourth is a visible change to the share.

**Authorization is reused, not rebuilt.** Both authors stressed this in the July discussion. The new constructs are a translation layer on top of the existing authorization engine. A listing and a share translate into principal, role, and grant structures underneath, and the existing Polaris Authorizer makes the final decisions. Nothing about sharing bypasses the policy engine that governs everything else.

**The consumer protocol is plain Iceberg REST.** The design does not invent a sharing wire protocol. A consumer gets a catalog endpoint, a warehouse name, and OAuth2 credentials, and any Iceberg REST client can read the share. This is the most important choice in the proposal. It means every engine that already speaks Iceberg REST can consume Polaris shares on day one, without a sharing-specific connector.

Dennis described the effort as a "form as function" feature, and the phrase fits. Much of what sharing needs is already possible with principals and grants. The value is in giving the business concept a shape the system can enforce, list, audit, and expire.

## What the Draft Spec Defines

In early September, Jean-Baptiste Onofré said he planned to open a draft pull request for a shares endpoint, and Dennis Huo posted his own draft spec as pull request #5446, with a companion document walking through the end-to-end user flows for each design choice. The two authors planned to compare drafts and merge the best of each. The draft in #5446 is a new OpenAPI file, `polaris-shares-api.yaml`, labeled version 0.0.3.

Its description summarizes the model in a few sentences. A share enumerates what is shared. An external consumer is a restricted, first-class identity. A listing is the only binding between a consumer and a share, and it is the unit of audit. Consumers read shared data through the standard Iceberg REST Catalog protocol, using connection material from their listing's endpoint configuration.

The draft serves these APIs under the management root, `/api/management/v1`, and marks them beta. They are served only when a shares feature flag is enabled, and the flag is off by default.

The paths fall into three groups.

Share management covers `/shares` for listing and creating shares, `/shares/{shareName}` for reading, updating, and deleting one, and `/shares/{shareName}/members` for listing and changing membership.

Listing management covers `/shares/{shareName}/listings` for creating and listing the bindings of a share, `/shares/{shareName}/listings/{listingName}` for reading and deleting one, and `/shares/{shareName}/listings/{listingName}/endpoint-config` for fetching the connection details to hand to the consumer.

Consumer management covers `/external-consumers` and `/external-consumers/{consumerName}`, a route to list a consumer's listings, and a set of credential routes: create, list, revoke, and rotate OAuth2 client credentials for a consumer.

Several details in the schemas show careful thinking about real operations.

**A share binds to exactly one catalog.** The `catalogName` field is required at creation and immutable afterward. The spec calls the one-catalog rule a rule of this version rather than of the addressing, so a later version can bind more catalogs without changing any path.

**Members pin to stable object IDs.** When a table is added to a share, the service records the table's stable internal ID in addition to its name. If the table is renamed, it stays a member under its new name. If a new table later takes the old name, it does not become a member. This closes a subtle hole where renaming and recreating tables silently changes what a partner sees.

**Only tables are shareable in this version.** The member `kind` field allows `TABLE` today, with the set open for future kinds. Views are not in scope yet, which sidesteps a question Dmitri Bourlatchkov raised early: a shared view's SQL references other tables, and those references have to resolve correctly from inside the share.

**Aliasing is reserved but off.** Each member has a canonical identity and a reserved exposed identity. A future version will allow presenting a table under a different name. For now, the service rejects any exposed identity that differs from the canonical one.

**Membership changes are atomic and versioned.** Updates to members are an ordered list of add and remove actions applied together, and the request carries the share version it was computed against. If the share changed in between, the request conflicts. The spec recommends this compare-and-set pattern for every writer, which prevents two admins from overwriting each other's changes.

**The endpoint configuration is complete enough for a stock client.** It includes the catalog endpoint URI, the warehouse value, and the OAuth2 token endpoint, all required. It also carries an optional OAuth2 scope and any extra HTTP headers the consumer's client must send, such as a header that selects the Polaris tenant. The scope field exists because a standard client cannot discover it on its own.

**Credentials rotate with overlap.** Consumer credentials have states of `ACTIVE`, `EXPIRING`, and `REVOKED`. Rotation accepts an advisory overlap period, during which the old credential keeps working so the consumer can switch without downtime. The secret is returned exactly once, at creation or rotation.

## The Consumer Side: Stock Iceberg REST

The proposal's strongest property is how little it asks of consumers. A consumer receives an endpoint configuration and a client credential from the provider. Everything else is standard Iceberg REST, which means the consumer picks any engine it likes.

Here is what reading a share looks like from PyIceberg, the Python Iceberg library, with values taken from a listing's endpoint configuration. The catalog URI below is illustrative, because the exact data-plane path is still under discussion, as the next section explains.

```python
import os
from pyiceberg.catalog import load_catalog

# Values delivered by the provider through the listing's endpoint config.
catalog = load_catalog(
    "retail_q3_share",
    **{
        "type": "rest",
        "uri": "https://polaris.retailer.example/api/shares/v1",   # catalogEndpoint
        "warehouse": "q3-sales-share",                             # warehouse
        "oauth2-server-uri": "https://polaris.retailer.example/oauth/tokens",
        "credential": f"{os.environ['SHARE_CLIENT_ID']}:{os.environ['SHARE_CLIENT_SECRET']}",
        "scope": "PRINCIPAL_ROLE:ALL",                             # scope, if required
        # Ask the catalog for short-lived storage credentials on each table load.
        "header.X-Iceberg-Access-Delegation": "vended-credentials",
    },
)

print(catalog.list_namespaces())
orders = catalog.load_table("sales_shared.orders")

# Read current data with column projection and a filter.
recent = orders.scan(
    row_filter="order_date >= '2026-09-01'",
    selected_fields=("order_id", "sku", "quantity", "order_date"),
).to_arrow()
print(recent.num_rows)

# The table's snapshot history travels with its metadata.
for snap in orders.snapshots():
    print(snap.snapshot_id, snap.timestamp_ms)
```

Walk through each part.

The `type`, `uri`, and `warehouse` values tell PyIceberg to speak the Iceberg REST protocol to the given endpoint and which catalog to request during configuration discovery. These map directly to the `catalogEndpoint` and `warehouse` fields of the draft's endpoint configuration.

The `oauth2-server-uri` and `credential` values drive the OAuth2 client credentials flow. PyIceberg exchanges the client ID and secret for a bearer token at the token endpoint and attaches it to every catalog call. The `scope` line appears only when the provider's token service requires one, which is exactly why the draft spec carries a scope field.

The `header.` prefix is how PyIceberg sends extra HTTP headers. Here it requests vended credentials. If the provider's endpoint configuration lists `additionalHeaders`, such as a tenant-selection header, each one becomes another `header.<name>` entry.

The scan pushes the filter and projection into Iceberg planning. PyIceberg asks the catalog to load the table, receives table metadata plus temporary storage credentials, prunes data files with manifest statistics, and reads only the matching Parquet files directly from the provider's storage. The provider's catalog never streams data. It only authorizes and hands out access.

The last loop is the part providers need to understand. `snapshots()` lists every snapshot the table still retains, and any of them can be scanned with `orders.scan(snapshot_id=...)`. A consumer of a shared table sees the history along with the latest state. The failure modes section returns to what that means.

The same configuration works in Spark, Trino, Flink, DuckDB, Dremio, or any other engine with an Iceberg REST catalog connector. The property names differ by engine, but the five pieces of information are the same. That portability is the whole reason to build sharing on the standard protocol.

It helps to place this next to the best-known open sharing protocol. Delta Sharing, which lives under the Linux Foundation, defines its own REST protocol for sharing. A Delta Sharing server authorizes a recipient and returns pre-signed URLs for the data files, and recipients use Delta Sharing connectors to read them. The Polaris proposal takes a different route. It adds no sharing protocol at all. The management side is new, but the consumer side is the Iceberg REST Catalog protocol that engines already implement, with vended credentials doing the job that pre-signed file URLs do in Delta Sharing. Each approach has trade-offs. A dedicated sharing protocol can be designed around recipients from the start, and pre-signed URLs work for clients that hold no cloud SDK. Reusing Iceberg REST means no new connector for any engine that already reads Iceberg, and it means shared tables behave exactly like any other Iceberg table on the consumer side, including planning, pruning, and time travel. For organizations that have standardized on Iceberg, the second property is the one that removes friction.

## The Open Design Questions

The proposal has broad support on direction. Prithvi S, reviewing the draft in September, put the consensus well: a partner principal on the catalog API is already possible, and the value is a first-class share with enumerated members, a restricted consumer, a listing as the binding and audit unit, and a segregated, read-only Iceberg REST surface with credential vending. Several details are still being worked out, and they matter to anyone planning around the feature.

**Where the APIs live.** This is the most visible debate. Dmitri Bourlatchkov argued that share management is distinct from catalog management. Some users need to manage shares for a catalog without being allowed to manage the catalog itself, so he suggested a separate prefix such as `/api/shares/v1/`. Dennis Huo's draft keeps share management under `/api/management/v1/`, next to the other admin APIs, and puts the consumer data plane under `/api/shares/v1/`. His reasoning is that a consumer then receives a catalog base path of `/api/shares/v1/` instead of `/api/catalog/v1/`, and everything under it mirrors a normal catalog. Both sides agree on one point: the control plane and the consumer data plane need separate prefixes. The exact layout is still open.

**Who can manage shares.** Prithvi suggested a dedicated `SHARE_MANAGE` privilege on the bound catalog, independent of the privilege that manages catalog access. That lets an organization give a partnerships team control over shares without giving it control over internal roles, and it works regardless of the URL layout.

**Membership as the source of truth.** If the share is implemented with hidden catalog roles and grants, someone can widen a share by editing those grants directly. Prithvi proposed that the data plane authorize against membership and listing, with any backing roles invisible and not independently grantable. Dennis agreed that such grants have to be changeable only through the share management system. He pointed to Polaris's reserved `system$` naming prefix as a precedent for protecting internal entities, while noting that the protection needs to hold up in practice.

**External consumers and identity providers.** The first implementation can back each external consumer with a hidden principal that holds a Polaris-managed client ID and secret. The August recap stressed that the model must not assume that. Many organizations want consumers to authenticate through their own identity provider, in which case there is no stored principal at all, only a token resolved at request time. Dmitri reinforced this on September 18: share access control needs to build on the existing extensible authentication and authorization framework, not become a new mechanism, and external identity provider support is a valuable feature.

**On-behalf-of attribution.** In the first version, everyone at a consumer organization shares one external consumer identity. Some consumers want finer attribution, such as recording that a specific user at the consumer company made a request. The recap listed this as a longer-term goal.

**Listing expiration.** Credential expiry is not the same as agreement expiry. Prithvi asked whether listings get their own expiration and a status such as active or suspended, which matches the original framing of sharing tables "until this date."

**History visibility.** Sharing full snapshot history is acceptable for version one. Prithvi suggested an explicit field on the share that declares full-history mode, so a later current-snapshot-only option is not a breaking change.

**The exact data plane contract.** The draft file covers the control plane. Reviewers asked for the consumer surface to be spelled out: which Iceberg routes are mounted, that writes return not-found, that non-members return not-found, and that the configuration endpoint does not leak the provider catalog's properties. Pinning that down keeps implementations from drifting.

**What is out of scope.** Jean-Baptiste set a clear boundary in July. An Arrow Flight endpoint that serves shared data directly is out of the first phase. Serving data means Polaris reading and exposing it, which amounts to embedding a query engine in the catalog, and he called that coupling an anti-pattern. Polaris-to-Polaris sharing through federation is also left out of version one.

## One Share, End to End

Putting the draft together, here is how a share moves through its life under the proposed model. Treat the exact paths as provisional, since the layout debate is still open.

**Provider creates the share.** An administrator with share management rights creates a share named `q3-sales-share`, bound to the `retail` catalog. At this point it is an empty container.

**Provider adds members.** The administrator adds three tables from the `sales_shared` namespace as members in one atomic update, passing the share's current version. The service pins each member to its table's stable ID.

**Provider registers the consumer.** The administrator creates an external consumer named `supplier-acme` and creates a credential for it. The response includes the client secret, shown once. The provider hands it to the supplier through a secure channel.

**Provider creates the listing.** The administrator creates a listing that binds `supplier-acme` to `q3-sales-share`. This is the moment access begins, and the listing's creation is the audit anchor for everything that follows.

**Provider delivers the endpoint configuration.** The administrator fetches the listing's endpoint configuration: catalog endpoint, warehouse, token endpoint, and any scope or headers. The supplier drops those values into its engine's catalog settings.

**Consumer reads.** The supplier's engine authenticates, lists namespaces, and loads tables. It sees only the three members. Each table load returns metadata plus read-only, short-lived storage credentials. The engine reads Parquet files straight from the retailer's storage.

**Provider changes the share.** Adding a fourth table is one membership update. The supplier sees it on its next listing call. No new grants, roles, or credentials are needed, and the change is visible as a change to the share.

**Provider rotates credentials.** When the credential needs rotating, the administrator calls rotate with an overlap window. The old credential moves to `EXPIRING`, the new one is issued, and the supplier switches before the overlap ends.

**Provider ends the agreement.** Deleting the listing cuts the supplier off from the share. Other consumers of the same share are unaffected. Storage credentials already issued stop working when their short lifetime runs out.

Compare that to the RBAC recipe. Every step exists there too, but spread across principals, roles, and grants with no shared name. The proposal turns the same underlying mechanics into a sequence of operations that reads like the business process it represents.

## Failure Modes and Warning Signs

Sharing across organizations raises risks that internal access control rarely surfaces. These apply whether you use the recipe today or the formal model later.

**Deleted rows that are still visible.** As covered above, a consumer can read any retained snapshot. If you remove sensitive rows from a shared table, they stay readable in older snapshots until those snapshots expire. The warning sign is any shared table whose snapshot retention is longer than your comfort window for removed data. For tables that need hard removal, pair the delete with snapshot expiration and orphan file cleanup, or keep shared data in dedicated tables with short retention.

**Scope widening through the back door.** With the recipe, the catalog role behind a share is an ordinary role. A well-meaning admin grants it one more namespace for an internal reason and exposes that namespace to a partner. The warning sign is any change to a catalog role attached to an external principal role. Tag those roles by naming convention and alert on grant changes to them.

**Shared credentials inside the consumer.** The consumer receives one client ID and secret for its whole organization. If that secret ends up in a notebook, a shared config repository, or a laptop, it is effectively public inside the consumer company, and you have no attribution below the organization level. The warning sign is token requests for one consumer credential from many different network origins. Prefer short credential lifetimes and regular rotation until external identity provider support arrives.

**Storage egress surprises.** Vended credentials let the consumer read directly from your bucket. On most clouds, the bucket owner pays for data transfer out of the region or out of the cloud by default. A consumer running a large scan from another region or another cloud generates transfer charges on your bill. The warning sign is a jump in egress costs on the buckets behind shared tables. Put shared tables in a region close to the consumer, consider requester-pays configurations where your cloud and engine support them, and review transfer costs per share.

**Views that do not resolve.** Views are not shareable in the draft, and for good reason. A view's SQL references tables by name, and those names have to resolve inside the consumer's restricted view of the catalog. If you work around the limitation by sharing tables that a view depends on, check that the consumer is meant to see all of them.

**Consumers on the internal API.** In the recipe, partners call the same catalog endpoint as internal engines. The warning sign is partner traffic in the same logs and rate limits as production engines. Put partners behind a separate gateway route or hostname now, even before the segregated data plane exists, so the migration later is a configuration change for them.

**Stale agreements.** Without listing expiration, access outlives the business reason for it. The warning sign is external principals with no recent activity. Review them on a schedule and delete what is no longer needed.

## Designing Tables That Are Meant to Be Shared

Most sharing problems start before any grant is written. They start with sharing a table that was built for internal use. A few design habits make shared data safer and cheaper to operate.

**Share purpose-built tables, not source tables.** An internal orders table carries columns a partner has no business seeing, such as internal cost fields, customer contact details, or notes. Column-level controls exist in some engines, but a consumer reading files directly with vended credentials reads whole data files. Iceberg's column projection limits what the engine reads, not what the credentials allow. If a column is not meant for the partner, it belongs in a table the partner cannot load. Build a shared table with exactly the columns and rows the agreement covers, and populate it from the internal table with a scheduled job or an incremental pipeline.

**Give shared tables their own retention.** Because history travels with the share, set snapshot expiration on shared tables to match the agreement, not your internal defaults. A partner who needs the latest state has no reason to see ninety days of history. Short retention also shortens the window during which removed rows stay readable.

**Give shared tables their own storage location.** Vended credentials scope to a table's files, so co-location is not a leak by itself. Separate prefixes still help. They make storage cost reporting per share trivial, they simplify lifecycle policies, and they let you place shared data in a region close to the consumer to control transfer costs.

**Keep partitioning friendly to the consumer's queries.** A partner scanning by date benefits from date partitioning. The provider pays for the consumer's inefficient scans in egress, so a partition layout that matches the partner's access pattern saves money on both sides.

**Name things for the relationship.** Until first-class shares land, naming conventions carry the intent. A namespace such as `shared_supplier_acme`, a catalog role such as `share_supplier_acme_read`, and a principal such as `ext_supplier_acme` make every grant self-describing in logs and audits. When the formal model arrives, those names map cleanly onto shares, consumers, and listings.

## Operational Guidance

If you plan to share Iceberg tables from Polaris, here is how to prepare while the feature takes shape.

**Use the recipe now, with conventions.** Follow the principal, principal role, catalog role, and read-only grants pattern. Apply consistent naming, and keep a simple register of each share: which tables, which consumer, who approved it, and when it ends. That register is the data you will load into first-class shares later.

**Grant only read privileges.** `TABLE_READ_DATA`, `TABLE_LIST`, and `NAMESPACE_LIST` cover reading. Nothing that creates, writes, or alters belongs on a role attached to an external principal. Audit for exceptions monthly.

**Require vended credentials.** Consumers never get long-lived storage keys. Every data file read goes through catalog-issued, table-scoped, short-lived credentials, which is what lets you revoke access centrally.

**Rotate consumer secrets on a schedule.** Client secrets for external principals are long-lived by default. Rotate them quarterly at minimum and whenever a consumer's staff changes.

**Monitor per consumer.** Track table loads, credential issuance, and storage reads per external principal. Watch for spikes, new tables accessed, and requests from unexpected networks.

**Segregate the front door.** Route partner traffic through a separate hostname or gateway path with its own rate limits, even if it reaches the same Polaris instance. The draft's direction of a separate consumer data plane will slot in behind it.

**Plan the migration to first-class shares.** When the feature ships, each entry in your share register becomes a share, an external consumer, and a listing. The tables you shared become members. The hardest part of that migration is usually not the API calls. It is reconstructing intent from grants nobody documented. Teams that kept the register and the naming conventions will move in an afternoon. Teams that did not will spend that time interviewing colleagues about why a partner can read a given namespace. Start the register today, even if it is a single spreadsheet.

**Track the proposal.** Follow the "Adding support for new Open Sharing APIs in Polaris" thread on the Polaris dev list and pull request #5446. The draft is beta, feature-flagged, and subject to change, so avoid building automation against exact paths until the layout settles.

## Where This Is Heading

Open Sharing is part of a larger shift in what open catalogs do. In 2026, Polaris graduated to an Apache Top-Level Project and its dev list filled with discussions about semantic models, lineage, tags, table metrics, and authorization. Sharing belongs to that same trend. The catalog is growing from a directory of tables into the governance layer for an open lakehouse.

The design choice that matters most for the ecosystem is the consumer protocol. By making every share readable through standard Iceberg REST, the proposal avoids creating yet another sharing wire format. Any engine that can read an Iceberg REST catalog can consume a Polaris share. That flips the usual economics of data sharing. On proprietary platforms, the consumer typically needs an account on the provider's platform, or a connector for the platform's sharing protocol. With Polaris, the consumer needs an Iceberg REST client, which it almost certainly already has.

Expect the first version to be narrow on purpose. Tables only, one catalog per share, full history, client-credential consumers, and no data serving from the catalog. Later versions are likely to add views, aliasing, listing expiration, current-snapshot-only shares, external identity providers, and on-behalf-of attribution. The draft spec already reserves space for several of these, which is a good sign that the authors expect the model to grow without breaking its paths.

The harder work sits outside Polaris itself. Consumers will want shares to show up alongside their own catalogs in their engines, and providers will want one place to manage shares across many catalogs. How engines present foreign shares, and how sharing interacts with catalog federation, are the next questions after version one ships.

## Conclusion

Sharing Iceberg tables across organizations with Apache Polaris already works mechanically. A dedicated principal, a read-only catalog role, a principal role to bind them, and vended credentials give a partner zero-copy access through the standard Iceberg REST protocol. What that recipe lacks is a concept. There is no share to list, no consumer identity separate from internal users, no audit unit tied to the agreement, and no expiry.

The Open Sharing proposal adds those concepts on top of the existing authorization engine. Shares enumerate members pinned to stable table IDs. External consumers represent outside organizations. Listings bind one to the other and anchor the audit trail. Endpoint configurations give consumers everything a stock Iceberg REST client needs. The draft spec in pull request #5446 defines these as beta, feature-flagged management APIs, with credential rotation, atomic membership updates, and room to grow.

The open questions are real: API layout, identity provider support, listing expiration, history controls, and the exact consumer surface. The direction is clear, though. Sharing becomes a first-class, auditable relationship in an open catalog, and any engine that speaks Iceberg REST can be on the receiving end.

## Keep Going

If this piece was useful, I have written a lot more on Apache Polaris and how open catalogs govern Iceberg tables. *Apache Polaris: The Definitive Guide* covers the RBAC model, credential vending, and catalog operations that the sharing proposal builds on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
