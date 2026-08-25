---
title: "Governance-as-Code for the Lakehouse: Managing REST Catalog RBAC and Masking in Git"
date: "2026-08-25"
description: "Put REST catalog RBAC and masking in Git. How to review grants, apply them safely, and keep lakehouse access from drifting."
author: "Alex Merced"
category: "Governance"
canonical: https://iceberglakehouse.com/posts/governance-as-code-lakehouse-rest-catalog/
tags:
  - governance
  - REST catalog
  - RBAC
  - Apache Polaris
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/governance-as-code-lakehouse-rest-catalog/).

A security audit asks a simple question: who can read the `customers.pii` table, and when was that last changed? The data platform team opens four consoles. The Spark cluster has its own ACLs. The Trino deployment has a Ranger policy set. The BI tool has its own row-level security config. The catalog has grants that were entered by hand over two years. The answers differ. Nobody can say which one is authoritative, and nobody can say who changed what, when, or why, because none of it is in version control.

That is the state of most lakehouse governance today, and it is a direct consequence of how the lakehouse was assembled. Open table formats let many engines read the same data, which is the whole point. But each engine brought its own security model, so "many engines" became "many places to define permissions," and the permissions drifted apart. The fix is not a better console. It is moving the definitions out of the engines and into the layer they all share, the catalog, and managing that layer the way infrastructure has been managed for a decade: as code, in Git, applied by a pipeline, with a plan step before every change and a drift check after.

This article is a practical guide to doing that with Apache Polaris, the open source Iceberg REST catalog now at version 1.7.0, and the tooling around it. I will cover what the catalog can hold declaratively and what it cannot, the four layers of a governance-as-code stack (cloud IAM, catalog entities, engine-side masking policies, and externalized policy decisions), the specific tools for each layer including Polaris's `setup apply` command, the CI/CD pipeline that ties them together, and the drift detection that keeps the repository and reality in agreement. I work at Dremio, whose Open Catalog is built on Polaris, and I will use Dremio's SQL for the engine-side policies. The pattern applies to any engine with policy support and any REST catalog with a management API.

## Why Security in the Engine Does Not Scale

To see why the catalog is the right place, it helps to trace what happens to a permission defined in an engine.

A grant in Spark's ACL layer applies to Spark. Trino reading the same Iceberg table through the same catalog does not see it. Neither does DuckDB, PyIceberg, or the BI tool's direct connection. Every engine that touches the table needs its own copy of the rule, and the copies are written in different policy languages by different teams on different schedules.

The engines also see the data at different points. Spark reads Parquet files directly through the catalog's vended credentials. A BI tool reads through a SQL endpoint. An agent reads through an MCP server. A column mask defined in the BI tool masks the BI tool's view of the column and nothing else. The Parquet file still has the raw value, and any engine with the credential reads it.

The catalog is the one component every path goes through. Every engine asks it for the table location and for credentials. If the catalog says no, no engine gets the credential, and the Parquet file is unreadable regardless of what the engine's own ACLs say. That makes the catalog the enforcement point for "can this principal reach this table at all," which is the coarse question, and it makes the catalog's grant model the single source of truth for it.

What the catalog cannot do, as of Polaris 1.7.0, is enforce column masking or row filtering. Those require evaluating the data, and the catalog never touches the data. It hands out a credential to a table location and the engine reads the files. So the fine-grained question, "which rows and which columns can this principal see within a table they can reach," lives in the engine or the semantic layer, and governance-as-code has to cover both places with one repository and one pipeline.

## What the Catalog Holds Declaratively

Polaris's governance surface is small enough to fit in a YAML file, and understanding its shape is the first step to managing it as code.

There are two kinds of roles. Principal roles are assigned to principals (users, service accounts) and represent who someone is: `data_engineer`, `analyst`, `pipeline_sales`. Catalog roles are defined within a catalog and hold privileges on that catalog's contents: `sales_reader`, `sales_writer`, `pii_reader`. A catalog role is granted to one or more principal roles, which is how a person gets access to a catalog's tables. The separation lets a principal role span many catalogs (an `analyst` gets `reader` roles in ten catalogs) and lets a catalog role be reassigned without touching individual principals.

Privileges attach to catalog roles at three levels: catalog, namespace, and table or view. `CATALOG_MANAGE_CONTENT` on a catalog grants everything below it. `TABLE_READ_DATA` on a namespace grants read on every table in that namespace. `TABLE_WRITE_DATA` on a specific table grants write on that one. There are privileges for metadata operations (`TABLE_READ_PROPERTIES`, `NAMESPACE_LIST`), for DDL (`TABLE_CREATE`, `TABLE_DROP`), and for administration (`CATALOG_MANAGE_ACCESS`). The full list is in the Polaris access control documentation and it is stable across the 1.x line.

Storage configuration is governance too. Each catalog names a storage type, a cloud identity Polaris assumes to vend credentials, and an allowed-locations list. The 1.7.0 flags `ALLOW_CLIENT_SPECIFIED_TABLE_LOCATION` (set to false to force catalog-managed paths) and `DEFAULT_UNIQUE_TABLE_LOCATION_ENABLED` (set to true for unpredictable per-table suffixes) determine whether a client can place a table where it chooses. Those belong in the same repository as the grants, because a location policy that lets a table land under another table's prefix undermines every grant.

Policies are a separate entity type. Polaris's policy API, introduced in 1.0, attaches maintenance policies (data compaction, snapshot expiry, orphan file removal, metadata compaction) to catalogs, namespaces, and tables. They are governance in the operational sense, and they are declarative.

External policy decisions are the extension point. Since 1.3.0, Polaris can defer authorization decisions to an external policy decision point, with Open Policy Agent as the supported implementation. Polaris sends the principal, the action, the resource, and (since 1.7.0) the realm to OPA, and OPA returns allow or deny based on Rego policies. That is where attribute-based and tag-based rules live when the built-in RBAC is not expressive enough.

Here is how the pieces map to the two questions governance has to answer:

| Question | Where it is enforced | Polaris mechanism | Managed as |
|---|---|---|---|
| Can this principal reach this catalog / namespace / table? | Catalog (blocks credential vending) | Principal roles, catalog roles, privileges | YAML via `setup apply`, or Terraform |
| Where is this table allowed to live? | Catalog | Storage config, allowed locations, location flags | YAML plus Helm values |
| Which cloud identity vends credentials, with what scope? | Catalog plus cloud IAM | Storage config role ARN / service account, STS session policy | Terraform for IAM, YAML for catalog |
| Is this principal allowed to do this action on this resource given attributes? | Catalog (via OPA) | External PDP with Rego | Rego files in Git |
| Which rows can this principal see? | Engine or semantic layer | Not in Polaris | SQL policy definitions in Git |
| Which columns are masked for this principal? | Engine or semantic layer | Not in Polaris | SQL policy definitions in Git |
| When are tables compacted and snapshots expired? | Catalog policy plus engine | Policy API | YAML |

Every row in that table has a "managed as" answer that is a file in a repository. That is the goal.

## Layer One: Cloud IAM in Terraform

The bottom layer is the cloud identity that Polaris assumes to vend credentials. It is pure cloud infrastructure and Terraform is the natural tool.

For AWS, the catalog's storage configuration names an IAM role. Polaris calls STS `AssumeRole` on it, with a session policy that narrows the resulting credential to the table's prefix. The role's trust policy must allow the Polaris service's own identity to assume it, and its permission policy must cover the allowed locations. Here is the Terraform for one catalog's role:

```hcl
resource "aws_iam_role" "polaris_sales" {
  name = "polaris-catalog-sales"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = var.polaris_service_role_arn }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "sts:ExternalId" = var.polaris_external_id }
      }
    }]
  })

  tags = { managed_by = "terraform", catalog = "sales" }
}

resource "aws_iam_role_policy" "polaris_sales_storage" {
  name = "polaris-catalog-sales-storage"
  role = aws_iam_role.polaris_sales.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "arn:aws:s3:::lake-prod/sales/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::lake-prod"
        Condition = {
          StringLike = { "s3:prefix" = ["sales/*"] }
        }
      }
    ]
  })
}

output "polaris_sales_role_arn" {
  value = aws_iam_role.polaris_sales.arn
}
```

Three points. The trust policy uses an external ID, which prevents a confused-deputy attack where another AWS account tricks Polaris into assuming the role. The permission policy is scoped to the catalog's prefix, so even if Polaris vended an over-broad session policy the role itself caps the blast radius. And the role ARN is an output, because the next layer needs it.

The equivalent on Azure is a service principal or managed identity with a role assignment scoped to the storage container path, and on GCP a service account with `roles/storage.objectAdmin` on the bucket plus, for principal attribution in 1.7.0, the Workload Identity Federation pool and provider that let Polaris chain a JWT into an impersonated credential. All three are standard Terraform resources.

Polaris itself is deployed with the project's Helm chart, and the chart's values (persistence backend, realm configuration, feature flags, the maintenance service added in 1.7.0, event listeners) belong in the same repository. A feature flag like `ALLOW_CLIENT_SPECIFIED_TABLE_LOCATION=false` is a governance decision expressed as a Helm value, and it should be reviewed the same way a grant is.

## Layer Two: Catalog Entities in YAML With `setup apply`

The second layer is the catalog's own entities: principals, principal roles, catalogs, catalog roles, namespaces, privileges, and policies. This is where Polaris shipped a first-class declarative tool this year.

The Polaris Python CLI has a `setup` command with two subcommands. `setup apply` reads a YAML file and creates or grants everything in it, in dependency order, with a `--dry-run` flag that prints the actions without executing them. `setup export` walks a running Polaris instance and writes its current configuration as YAML in the same format, which is what makes drift detection possible. The command was introduced in early 2026 and the 1.7.0 release fixed its exit codes so a failed apply returns non-zero, which matters for CI.

Here is a setup file for the sales catalog, with the IAM role from layer one:

```yaml
# governance/polaris/sales.yaml

principals:
  pipeline_sales:
    roles:
      - sales_writer_role
  svc_dremio:
    roles:
      - analyst_role
      - pii_reader_role

principal_roles:
  - sales_writer_role
  - analyst_role
  - pii_reader_role

catalogs:
  - name: sales
    type: INTERNAL
    storage_type: S3
    default_base_location: s3://lake-prod/sales/
    allowed_locations:
      - s3://lake-prod/sales/
    role_arn: arn:aws:iam::123456789012:role/polaris-catalog-sales
    region: us-east-1
    properties:
      polaris.config.allow.client.specified.table.location: "false"
    namespaces:
      - orders
      - customers
      - customers.pii
    roles:
      sales_writer:
        assign_to:
          - sales_writer_role
        privileges:
          namespace:
            orders:
              - TABLE_CREATE
              - TABLE_READ_DATA
              - TABLE_WRITE_DATA
            customers:
              - TABLE_CREATE
              - TABLE_READ_DATA
              - TABLE_WRITE_DATA
      sales_reader:
        assign_to:
          - analyst_role
        privileges:
          catalog:
            - NAMESPACE_LIST
            - TABLE_LIST
          namespace:
            orders:
              - TABLE_READ_DATA
            customers:
              - TABLE_READ_DATA
      pii_reader:
        assign_to:
          - pii_reader_role
        privileges:
          namespace:
            customers.pii:
              - TABLE_READ_DATA
```

Read it top to bottom. Two service principals exist. Three principal roles exist. One catalog exists, on S3, with a single allowed location, a client-specified-location override set to false, and three namespaces. Three catalog roles exist, each granted to a principal role and each holding privileges at the namespace level. The `analyst_role` can list and read `orders` and `customers` but not `customers.pii`. The `pii_reader_role` can read `customers.pii` and nothing else. The `svc_dremio` principal holds both, so the Dremio engine can reach PII on behalf of users who are authorized for it, and the engine-side masking in layer three decides which of those users see the raw values.

The workflow around the file:

```bash
# In CI on a pull request: print the planned actions, fail on error.
polaris setup apply \
  --host "$POLARIS_HOST" \
  --client-id "$POLARIS_ADMIN_CLIENT_ID" \
  --client-secret "$POLARIS_ADMIN_CLIENT_SECRET" \
  --dry-run \
  governance/polaris/sales.yaml

# On merge to main: apply.
polaris setup apply \
  --host "$POLARIS_HOST" \
  --client-id "$POLARIS_ADMIN_CLIENT_ID" \
  --client-secret "$POLARIS_ADMIN_CLIENT_SECRET" \
  governance/polaris/sales.yaml

# Nightly: export the live state and diff against the repository.
polaris setup export \
  --host "$POLARIS_HOST" \
  --client-id "$POLARIS_ADMIN_CLIENT_ID" \
  --client-secret "$POLARIS_ADMIN_CLIENT_SECRET" \
  > /tmp/polaris-live.yaml
diff <(yq -P 'sort_keys(..)' governance/polaris/*.yaml | yq ea '. as $item ireduce ({}; . * $item)') \
     <(yq -P 'sort_keys(..)' /tmp/polaris-live.yaml)
```

Two honest caveats about `setup apply` as of 1.7.0. It is additive: it creates what is missing and grants what is not yet granted, but it does not remove an entity or a grant that exists in Polaris and is absent from the file. Removals have to be applied explicitly through the CLI's `revoke` and `delete` commands or the management API, and the pipeline needs a step for them. And the export format normalizes some fields (secrets are not exported, and ordering is not guaranteed), so the diff needs canonicalization, which is what the `yq` sort in the example does. Neither caveat is a reason not to use it. Both are reasons to keep the nightly diff, because the additive apply means a manually added grant in the console persists until the diff catches it.

For teams that want Terraform's state model rather than an additive apply, the official picture is changing this summer and it is worth knowing exactly where it stands.

The Apache Iceberg project has been building `apache/terraform-provider-iceberg`, a provider for Iceberg REST catalog resources (`iceberg_namespace` and `iceberg_table` as resources and data sources), and it is close to release. Early in 2026 that repository accepted Polaris-specific resources: `polaris_principal` landed in March, `iceberg_polaris_principal_role` at the end of March, and a larger "Add Polaris RBAC resources" pull request (#63, opened June 30) added `iceberg_polaris_catalog_role`, `iceberg_polaris_catalog_role_assignment`, `iceberg_polaris_principal_role_assignment`, and `iceberg_polaris_grant`, with a grant resource that takes a catalog role, a privilege, and exactly one of a catalog, namespace, table, or view target, plus import support keyed on `catalog/role/TYPE/target/PRIVILEGE`. The Iceberg community then decided the provider should cover only Iceberg resources, and pull requests #64 and #83 removed the Polaris resources and references.

On July 6, Alex Stephen (Google) opened a `[DISCUSS] Polaris Terraform Provider` thread on the Polaris dev list proposing to rehome those resources in a dedicated `terraform-provider-polaris` repository, which the Terraform Registry requires by name. Yufei Gu, Nándor Kollár, Sung Yun, Jean-Baptiste Onofré, Dmitri Bourlatchkov, and Yong Zheng all supported it. Sung Yun called lazy consensus on July 14 and, after 72 hours with no objection, started the repository request. As of mid-August the repository `apache/terraform-provider-polaris` exists under the ASF organization but is still empty, with the setup blocked on an ASF Infra ticket and a self-serve portal issue that Sung Yun was chasing after returning from vacation on August 12.

So the resource model for an official provider is already designed and has working code from PR #63. What does not exist yet is a release. When it ships, expect the same shape as the removed resources: principals, principal roles, catalog roles, the two assignment resources, and grants, all with plan-and-destroy semantics that close the removal gap `setup apply` leaves open. Until then, a community provider (`tsukubatexas/polaris`) wraps the Polaris OpenAPI specification with a generic resource type and gives you Terraform state today, at the cost of a more verbose resource definition. Here is what a grant looks like in the shape PR #63 defined, which is the shape to expect from the official provider:

```hcl
resource "polaris_catalog_role" "sales_reader" {
  catalog_name = "sales"
  name         = "sales_reader"
}

resource "polaris_grant" "sales_reader_orders" {
  catalog_name      = "sales"
  catalog_role_name = polaris_catalog_role.sales_reader.name
  privilege         = "TABLE_READ_DATA"
  namespace         = ["orders"]
}

resource "polaris_catalog_role_assignment" "analyst_gets_sales_reader" {
  catalog_name        = "sales"
  catalog_role_name   = polaris_catalog_role.sales_reader.name
  principal_role_name = "analyst_role"
}
```

Treat the resource names as illustrative until the official provider publishes its documentation. The attribute structure (catalog name, role name, privilege, one target) is what PR #63 shipped and is unlikely to change.

## Layer Three: Masking and Row Filters as SQL in Git

The third layer is fine-grained access, and it lives in the engine because the catalog does not see data.

Dremio implements column masking and row-level security as SQL user-defined functions attached to tables and views. A masking policy is a function that takes the column value and returns either the value or a masked form depending on the caller. A row access policy is a function that takes one or more column values and returns a boolean. Both are plain SQL, both are versionable, and both are applied with `ALTER TABLE` or `ALTER VIEW`. Other engines have equivalents (Trino through its access control SPI and connectors, Spark through Ranger or a plugin), and the pattern of "policy as SQL file, applied by CI" transfers.

Here are the policies for the `customers.pii` table:

```sql
-- governance/engine/policies/mask_email.sql
CREATE OR REPLACE FUNCTION governance.mask_email(email VARCHAR)
RETURNS VARCHAR
RETURN SELECT CASE
  WHEN is_member('pii_readers') THEN email
  ELSE CONCAT(LEFT(email, 1), '***@', SPLIT_PART(email, '@', 2))
END;

-- governance/engine/policies/mask_national_id.sql
CREATE OR REPLACE FUNCTION governance.mask_national_id(id VARCHAR)
RETURNS VARCHAR
RETURN SELECT CASE
  WHEN is_member('pii_readers') THEN id
  ELSE CONCAT('***-**-', RIGHT(id, 4))
END;

-- governance/engine/policies/region_row_filter.sql
CREATE OR REPLACE FUNCTION governance.region_row_filter(region VARCHAR)
RETURNS BOOLEAN
RETURN SELECT CASE
  WHEN is_member('global_analysts') THEN TRUE
  WHEN is_member('emea_analysts')   THEN region IN ('DE', 'FR', 'GB', 'NL')
  WHEN is_member('amer_analysts')   THEN region IN ('US', 'CA', 'MX')
  ELSE FALSE
END;

-- governance/engine/bindings/customers_pii.sql
ALTER TABLE sales.customers.pii
  MODIFY COLUMN email SET MASKING POLICY governance.mask_email(email);
ALTER TABLE sales.customers.pii
  MODIFY COLUMN national_id SET MASKING POLICY governance.mask_national_id(national_id);
ALTER TABLE sales.customers.pii
  ADD ROW ACCESS POLICY governance.region_row_filter(region);
```

The `is_member` function checks the querying user's role membership in the engine, which is typically synced from the identity provider. The policies reference role names, not user names, so onboarding a new PII reader is an identity provider change and not a policy change.

The split between policy definitions and bindings is deliberate. A policy function is reusable across tables. A binding attaches it to a specific column. Changing who counts as a PII reader is a one-file change to the policy. Adding a new PII column is a one-line change to a binding. Both go through the same pull request review.

One more thing belongs in this layer: the semantic layer views that most consumers actually query. If `sales.customers` is a view over `sales.customers.pii` that projects only non-sensitive columns, the view definition is itself a governance artifact and lives in the same repository. The masking policy protects the base table for the principals who can reach it. The view protects everyone else by never exposing the column.

## Layer Four: Attribute-Based Rules in OPA

Role-based grants cover most cases. They do not cover "any table tagged `pii` requires the `pii_reader` role regardless of which namespace it is in," or "writes to a table tagged `frozen` are denied for everyone," or "this service account reads only during its scheduled window." Those are attribute-based rules, and Polaris's external policy decision point is where they go.

With OPA configured as the PDP, Polaris sends every authorization decision to OPA as a JSON input describing the principal, its roles, the action, the target resource, and the realm, and OPA evaluates Rego policies to return a decision. The Rego lives in Git, is tested with OPA's own test framework, and is deployed as a bundle.

A tag-based rule looks like this:

```rego
# governance/opa/policies/pii_tag.rego
package polaris.authz

import rego.v1

default allow := false

# Fall through to Polaris's built-in RBAC decision for everything
# that this policy does not explicitly deny.
allow if {
    not deny
    input.rbac_decision == "allow"
}

# Deny any data read on a table carrying the pii tag unless the
# principal holds the pii_reader_role.
deny if {
    input.action in {"TABLE_READ_DATA", "TABLE_WRITE_DATA"}
    input.resource.type == "TABLE"
    input.resource.properties.tag == "pii"
    not "pii_reader_role" in input.principal.roles
}

# Deny writes to anything tagged frozen, for everyone.
deny if {
    input.action in {"TABLE_WRITE_DATA", "TABLE_DROP"}
    input.resource.properties.tag == "frozen"
}

# Realm isolation: a principal from one realm never acts in another.
deny if {
    input.context.realm != input.principal.realm
}
```

Polaris realms are its tenancy boundary: each realm has its own principals, catalogs, and root credentials, and a single deployment can serve several. The realm check is the case Polaris 1.7.0 specifically enabled by adding `input.context.realm` to the OPA input, so multi-tenant deployments can enforce isolation in policy rather than trusting entity names to be unique.

The shape of the input document depends on the Polaris version and is documented under the external PDP section of the Polaris docs. Treat the field names in the example as illustrative and verify them against your deployment. What matters is the structure: a default deny, an allow that defers to built-in RBAC, and a set of explicit denies keyed on attributes. Rego's test framework lets you assert that specific inputs produce specific decisions, and those tests run in CI on every change.

Table tags in the example come from Iceberg table properties, which Polaris stores and can pass through to OPA. Setting the `tag` property is a table DDL operation, which means it is also governed: only a principal with `TABLE_WRITE_PROPERTIES` can tag or untag a table, and that privilege is in the layer two YAML.

## The Pipeline

The four layers come together in one repository and one pipeline. Here is the layout and the CI stages.

```
governance/
  terraform/           # Layer 1: cloud IAM, Polaris Helm values
    aws/
    azure/
    gcp/
    polaris-helm/
  polaris/             # Layer 2: catalog entities, one file per catalog
    sales.yaml
    finance.yaml
    shared.yaml
  engine/              # Layer 3: masking and row policies, bindings, views
    policies/
    bindings/
    views/
  opa/                 # Layer 4: Rego policies and tests
    policies/
    tests/
  tests/               # Access parity tests run against a live environment
    access_matrix.yaml
    run_access_tests.py
```

On every pull request:

1. `terraform plan` on layer one. Reviewers see IAM changes as a diff.
2. `polaris setup apply --dry-run` on every changed YAML in layer two. The output is posted as a comment on the pull request.
3. Static checks on layer three: parse every SQL file, confirm every binding references a policy that exists, confirm every policy references only role names that exist in the identity provider's export.
4. `opa test` on layer four. Every Rego change needs a test that exercises it.
5. A rendered summary: "this PR grants `analyst_role` read on `finance.gl`, adds a masking policy on `finance.gl.account_holder`, and adds no OPA rules."

On merge to main, in order:

1. `terraform apply` for layer one, so IAM roles exist before catalogs reference them.
2. `polaris setup apply` for layer two, then an explicit revoke step that reads a `removals.yaml` and applies deletions.
3. Apply layer three SQL to the engine through its API or SQL endpoint, policies before bindings, views last.
4. Push the OPA bundle.
5. Run the access parity tests.

The access parity tests are the piece that makes this a governance system rather than a deployment system. `access_matrix.yaml` lists principals, resources, and expected outcomes: `analyst_role` reading `sales.orders` is allowed, `analyst_role` reading `sales.customers.pii` is denied at the catalog, `pii_reader_role` reading `sales.customers.pii` through Dremio as a non-`pii_readers` user gets masked emails. The test runner authenticates as each principal, issues the query, and checks the outcome. It runs after every merge and nightly, and a failure blocks the next merge.

Nightly, separately:

1. `polaris setup export` and diff against the repository. Any difference is a manually made change, and the pipeline opens an issue with the diff.
2. Export the engine's policy bindings and diff against layer three.
3. `terraform plan` with no changes expected. Any drift in IAM is flagged.

## A Worked Pull Request: Onboarding a New Data Product

The abstract pipeline is easier to trust after seeing one change go through it. Here is what happens when the finance team asks for a new `finance.payroll` namespace that only the `payroll_analyst` role can read, with salary masked for everyone except `hr_compensation`.

The requester opens a pull request with four files changed.

Layer two, `governance/polaris/finance.yaml`, gains a namespace and a catalog role:

```yaml
    namespaces:
      - gl
      - payroll          # new
    roles:
      payroll_reader:    # new
        assign_to:
          - payroll_analyst_role
        privileges:
          namespace:
            payroll:
              - TABLE_READ_DATA
              - TABLE_LIST
```

and the top-level `principal_roles` list gains `payroll_analyst_role`.

Layer three gains a policy and a binding:

```sql
-- governance/engine/policies/mask_salary.sql
CREATE OR REPLACE FUNCTION governance.mask_salary(amount DECIMAL(18,2))
RETURNS DECIMAL(18,2)
RETURN SELECT CASE
  WHEN is_member('hr_compensation') THEN amount
  ELSE NULL
END;

-- governance/engine/bindings/finance_payroll_employees.sql
ALTER TABLE finance.payroll.employees
  MODIFY COLUMN salary SET MASKING POLICY governance.mask_salary(salary);
```

Layer four is unchanged, because no attribute rule is involved. Layer one is unchanged, because the finance catalog's IAM role already covers `s3://lake-prod/finance/`.

The test matrix gains three rows:

```yaml
- principal: payroll_analyst_role
  resource: finance.payroll.employees
  action: read
  expect: allowed
  expect_masked: [salary]
- principal: payroll_analyst_role
  resource: finance.payroll.employees
  action: read
  as_engine_user_in: [hr_compensation]
  expect: allowed
  expect_masked: []
- principal: analyst_role
  resource: finance.payroll.employees
  action: read
  expect: denied_at_catalog
```

CI runs on the pull request. The Terraform plan shows no changes. The Polaris dry-run posts a comment: create namespace `finance.payroll`, create principal role `payroll_analyst_role`, create catalog role `payroll_reader`, grant `TABLE_READ_DATA` and `TABLE_LIST` on namespace `payroll` to `payroll_reader`, grant `payroll_reader` to `payroll_analyst_role`. The SQL static check confirms `hr_compensation` exists in the identity provider export and that the binding references a policy defined in the same PR. The OPA tests pass unchanged. The rendered summary reads: "Adds read access to `finance.payroll` for `payroll_analyst_role`. Masks `salary` for all but `hr_compensation`. No IAM or OPA changes."

A reviewer from the finance data owners group (routed by CODEOWNERS on the `finance.yaml` path) reads the summary and the dry-run, confirms that `payroll_analyst_role` is the right role, and approves. A reviewer from the security team (routed by CODEOWNERS on `governance/engine/policies/`) confirms the mask returns `NULL` rather than a partial value, which is the finance team's standard for salary, and approves.

On merge, the pipeline applies in order. The Polaris apply creates the namespace, roles, and grants. The engine apply creates the function and then the binding. The access tests run: the `payroll_analyst_role` principal reads the table and sees `salary` as null, the same principal in the `hr_compensation` group sees the values, and the `analyst_role` principal gets a 403 from the catalog before any credential is vended. All three pass. The change is live, and the evidence that it does what the PR said is in the CI log.

Elapsed time from PR open to live is the review time and nothing else. No console was opened. No ticket was filed with the platform team. The finance team made its own change, within the guardrails the platform team defined, and the platform team's involvement was a CODEOWNERS rule.

## Compliance Evidence

Auditors ask for three kinds of evidence, and governance-as-code produces all three as byproducts.

Who can access what, right now. `polaris setup export` produces a complete, current inventory of principals, roles, catalogs, namespaces, and grants in a readable format. The engine's policy export does the same for masks and row filters. Both run nightly and both are archived. When an auditor asks, the answer is a file with a timestamp, and the diff against last quarter's file shows exactly what changed.

Who changed it and who approved. The Git log for the governance repository is the change record. Every grant has a commit, a pull request, an author, and a set of approvers, with the dry-run output showing what the change did. This is stronger evidence than a console audit log, because it records intent (the PR description) and review, not just the action.

That the controls work. The access parity test results are the control evidence. A nightly run showing that `analyst_role` was denied on `customers.pii` every night for the quarter is proof of continuous enforcement, which is what a control test in an audit framework is asking for. Archive the results alongside the exports, and keep the test matrix itself under the same review rules as the grants, because a matrix that someone quietly edits to remove a failing denial is a control that stopped working without anyone noticing.

The one piece of evidence this stack does not produce on its own is the data-access log: who actually read which table, when. That comes from the Polaris event stream (Kafka or OpenTelemetry listeners in 1.7.0) joined to cloud storage access logs, which carry the Polaris principal through STS session tags on AWS and, since 1.7.0, through principal attribution on GCP. Route those to the same archive and the audit package is complete.

## Where the Approaches Differ

Teams arrive at governance-as-code from different starting points, and the tooling choice depends on where they are. Here is how the main options for layer two compare:

| | `polaris setup apply` | Official `terraform-provider-polaris` | Community Terraform provider | Direct management API in CI |
|---|---|---|---|---|
| Maintained by | Apache Polaris project (Python CLI) | Apache Polaris project (repo created, no release yet) | Community (`tsukubatexas/polaris`) | You |
| Declaration format | YAML matching Polaris entity model | HCL with typed resources (principals, roles, assignments, grants) | HCL over OpenAPI operations | Whatever you script |
| Plan step | `--dry-run` | `terraform plan` | `terraform plan` | Build it yourself |
| Removals | Not applied (additive only) | Applied via state diff | Applied via state diff | Build it yourself |
| Drift detection | `setup export` and diff | `terraform plan` against state | `terraform plan` against state | Build it yourself |
| State file | None (Polaris is the state) | Terraform state to manage and secure | Terraform state to manage and secure | None |
| Status | Shipping since early 2026 | Code exists from PR #63, repository empty as of August 2026 | Available now | Always available |
| Fit | Most teams today | Terraform-standardized teams once it ships | Terraform-standardized teams now | Unusual entity models or older Polaris |

My recommendation for most teams today is the project's own tool with an explicit removals step, because it is maintained alongside Polaris, it needs no state file to protect, and its YAML maps one to one onto the entity model an operator already understands. A platform team that already runs everything through Terraform and wants a single plan across cloud IAM and catalog entities should watch the official provider repository and be ready to adopt it at first release, using the community provider in the meantime if the wait is unacceptable. Direct API scripting is a fallback, not a plan.

For layer three, the choice is made by the engine. Dremio's SQL policies are the example here. Trino teams use the connector's access control configuration or a plugin, and Spark teams typically use Ranger or a comparable plugin. In every case the principle is the same: the policy is a text file, it references roles, it lives in Git, and CI applies it.

## Failure Modes and Warning Signs

**Additive apply hides removals.** Someone removes a grant from the YAML, the PR is approved, `setup apply` runs, and the grant is still there because apply does not revoke. The sign is the nightly export diff showing a grant in Polaris that is not in Git. Make removals explicit in a separate file that the pipeline applies with revoke commands, and make the access parity tests include denied cases so a leftover grant fails a test.

**Role name drift between identity provider and policies.** A masking policy references `pii_readers`, the identity provider renames the group to `pii-readers`, and every PII reader is now masked. The sign is a flood of "I used to see this" tickets. The static check in stage three catches it if the identity provider's group list is exported into the repository, which it should be.

**OPA unavailable means Polaris fails closed or open.** Depending on configuration, Polaris either denies everything or falls back to built-in RBAC when the PDP is unreachable. Know which yours does. Fail-closed is safer and it means an OPA outage is a data platform outage. Run OPA as a sidecar or with the same availability as Polaris.

**Console changes survive until the diff.** Someone adds a grant in a console during an incident. It works. Nobody records it. The nightly diff catches it the next morning, and the resolution is either to add it to Git or to revoke it, and either way the pipeline owns it again. If the diff is not running, the console change is permanent and invisible.

**Terraform and YAML disagree on the role ARN.** Layer one outputs a role ARN, layer two hardcodes one, and someone rotates the role. The sign is credential vending failures on one catalog. Generate the layer two YAML's `role_arn` from Terraform output rather than typing it, or at minimum add a static check that every ARN in the YAML exists in the Terraform state.

**Policies applied in the wrong order.** A binding is applied before the policy function it references exists. The engine rejects it. The sign is a partial apply where some tables are protected and others are not. The pipeline applies policies before bindings, and it should stop on the first failure rather than continuing.

**Secrets in the governance repo.** Principal client secrets are created by Polaris at principal creation time and returned once. A pipeline that captures them into the repository, even encrypted, has made the repository a credential store. Route new secrets straight into the secrets manager from the apply step and never write them to disk in the pipeline.

**Tests that only check allows.** An access matrix that lists only what should work passes when everything is open. Half the matrix should be denials. The most important test in the suite is "the analyst cannot read PII," and it should be the first one written.

## Operational Guidance

**Start with one catalog.** Convert the highest-sensitivity catalog first, because that is where the audit pressure is and where the payoff is largest. Export its live state with `setup export`, commit that as the baseline, and from that day forward every change goes through the pipeline. Bring the remaining catalogs over one at a time as their owners are ready.

**Export before you adopt.** The first export of a long-lived Polaris instance is a revelation. Expect to find grants nobody remembers, principals for services that no longer exist, and catalog roles with `CATALOG_MANAGE_CONTENT` that were meant to be temporary. Clean that up in the baseline commit, with a reviewer, before the pipeline starts enforcing it.

**One repository, four directories.** Splitting governance across repositories reintroduces the drift the approach is meant to remove. Use directory ownership rules (CODEOWNERS) to route reviews, not separate repos.

**Grant at the namespace, not the table.** Table-level grants multiply with every new table and become unreviewable. Organize namespaces so that a namespace-level grant is the right granularity, and reserve table-level grants for exceptions that a reviewer should notice.

**Roles, never principals, in policies.** Every layer three policy and every layer four rule should reference a role. A principal name in a policy is a change waiting to happen the day that person leaves.

**Dry-run output in the PR.** Reviewers should not have to read YAML to know what changes. The dry-run text, or the Terraform plan, is the review artifact.

**Denials in the test matrix.** Write the "cannot" tests first.

**Nightly drift check with an issue, not just a log.** A drift log nobody reads is a drift log. Open an issue, assign it to the on-call, and close it by committing or reverting.

**Force catalog-managed locations.** `ALLOW_CLIENT_SPECIFIED_TABLE_LOCATION=false` in the Helm values, reviewed in the same PR as the grants that depend on it.

**Emit events and keep them.** Polaris 1.7.0's Kafka and OpenTelemetry event listeners record every grant change and every table operation. Route them to the same place as the audit log for the engine. When the auditor asks who changed what, the answer is a Git log plus an event stream, and both are timestamped.

## Where This Is Heading

Three developments will close the gaps in this stack.

Fine-grained policy in the catalog. The Polaris community has discussed extending the policy API beyond maintenance policies toward access policies that engines fetch and enforce consistently, which moves layer three into layer two for engines that participate. Nothing has shipped, but the policy entity type exists and it is the natural home. When it lands, a column mask defined once in the catalog applies in every engine that honors it, and the engine-side SQL becomes a fallback.

Semantic models in the catalog. The Apache Ossie (incubating) specification for vendor-neutral semantic models, and the proposed Polaris semantic model REST API, put metric and dimension definitions next to the tables. Views are governance artifacts, and a standard format for them means the layer three views directory becomes portable across engines.

An official Terraform provider. The `apache/terraform-provider-polaris` repository is created and the resource code from the Iceberg provider's PR #63 is waiting to be rehomed into it. Once it publishes to the Terraform Registry, layer two gets plan-and-destroy semantics from the project itself, and the additive-apply workaround in this article becomes optional. Watch the Polaris dev list thread for the first release.

Non-additive apply. The `setup` command's additive behavior is a known limitation and the obvious next step is a reconcile mode that removes what the file does not declare. Until then, the removals file and the nightly diff are the workaround, and they work.

The larger trend is that the catalog is becoming the control plane of the lakehouse, not just the table registry. Credential vending made it the enforcement point for reach. Events made it the audit source. External PDP made it extensible. Setup files made it declarative. Each of those was a small release note, and together they mean the four-console audit from the opening becomes a `git log` and a test report.

## Conclusion

Lakehouse governance drifted because permissions lived in every engine and none of them were in version control. The fix is to put the coarse decision (can this principal reach this table) in the catalog, where every engine has to pass through, and to manage the catalog and the engine-side fine-grained policies from one repository through one pipeline.

Cloud IAM is Terraform. Catalog entities are YAML applied with `polaris setup apply`, dry-run on every pull request, exported and diffed every night. Masking and row policies are SQL files with bindings, applied in order by CI. Attribute-based rules are Rego with tests. An access parity matrix, half of it denials, runs after every change. When that is in place, the audit question has a two-part answer: here is the commit that granted it, and here is the test that proves it still holds.

## Keep Going

If this piece was useful, I have written a lot more on Apache Polaris, catalog design, and lakehouse governance. *Apache Polaris: The Definitive Guide* (O'Reilly) covers the RBAC model, credential vending, policies, and the external PDP integration in depth. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
