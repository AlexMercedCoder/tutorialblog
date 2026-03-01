---
title: "Connect Dremio Software to Dremio Cloud: Hybrid Federation Across Deployments"
date: "2026-03-01"
description: "Dremio Cloud can connect to Dremio Software (self-managed) instances as a federated data source. This creates a hybrid deployment where Dremio Cloud serves a..."
author: "Alex Merced"
category: "Dremio Connectors"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - dremio
  - data integration
  - connectors
  - data lakehouse
  - federated queries
---

Dremio Cloud can connect to Dremio Software (self-managed) instances as a federated data source. This creates a hybrid deployment where Dremio Cloud serves as the primary query interface while accessing datasets managed by Dremio Software instances running in your own data centers or private cloud.

This connector is designed for organizations that have existing Dremio Software deployments and are adopting Dremio Cloud for new workloads, or that need to federate data across a cloud-managed Dremio platform and on-premises Dremio instances.

## Why Connect Dremio Software to Dremio Cloud

### Hybrid Federation

Your Dremio Software instance manages on-premises data sources — Oracle databases, SQL Server, network-attached file storage, and internal data lakes. Dremio Cloud manages cloud-native sources — S3, BigQuery, Snowflake, and cloud-hosted databases. By connecting Dremio Software to Dremio Cloud, you can write a single SQL query that joins on-premises data (through Dremio Software) with cloud data (through Dremio Cloud).

```sql
-- Join on-premises data via Dremio Software with cloud data in Dremio Cloud
SELECT
  cloud.customer_name,
  cloud.cloud_revenue,
  onprem.erp_balance,
  onprem.last_payment_date,
  CASE
    WHEN cloud.cloud_revenue > 100000 AND onprem.erp_balance < 5000 THEN 'Good Standing'
    WHEN onprem.erp_balance > 50000 THEN 'At Risk'
    ELSE 'Standard'
  END AS account_health
FROM analytics.gold.cloud_customers cloud
JOIN "dremio-onprem".onprem.erp_accounts onprem ON cloud.customer_id = onprem.customer_id
ORDER BY cloud.cloud_revenue DESC;
```

### Incremental Cloud Migration

Organizations don't shut down on-premises data centers overnight. Connecting Dremio Software to Dremio Cloud lets you:

1. **Start using Dremio Cloud** for new cloud-native workloads
2. **Continue using Dremio Software** for on-premises sources
3. **Federate across both** from a single Dremio Cloud interface
4. **Gradually migrate** data sources from Software to Cloud as on-premises systems are decommissioned

### Consolidated Governance

Users access both on-premises and cloud data through Dremio Cloud's interface. Dremio Cloud's governance policies (column masking, row-level filtering) apply to the federated view of data, providing a single governance layer across all data.

## Prerequisites

- **Dremio Software instance** accessible from Dremio Cloud over HTTPS
  - Version 24.0 or later recommended
  - Arrow Flight endpoint enabled and accessible (port 32010 or 443 with TLS)
- **Authentication:** Username/password or Personal Access Token for the Dremio Software instance
- **Network:** The Dremio Software instance must be reachable from Dremio Cloud's network. Options:
  - Public endpoint with TLS
  - VPN/VPC peering
  - AWS PrivateLink or equivalent
- **Dremio Cloud account** — [sign up free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-dremio-to-dremio-cloud&utm_content=alexmerced) with $400 in compute credits

## Step-by-Step: Connect Dremio Software to Dremio Cloud

### 1. Add the Source

Click **"+"** in the Dremio Cloud console and select **Dremio** from the source types.

### 2. Configure Connection

- **Name:** Descriptive identifier (e.g., `dremio-onprem` or `datacenter-west`).
- **Host:** The hostname or IP address of your Dremio Software coordinator node.
- **Port:** Arrow Flight port (typically `32010`, or `443` with TLS).
- **SSL/TLS:** Enable if the Software instance uses encrypted connections.

### 3. Set Authentication

Provide credentials for a Dremio Software user account. Consider creating a dedicated service account with appropriate permissions:
- Read access to the virtual datasets (views) and physical datasets you want to federate
- User impersonation support if you want Dremio Cloud queries to execute as the requesting user on Dremio Software

### 4. User Impersonation

**User impersonation** allows Dremio Cloud to pass the identity of the requesting user to Dremio Software. When enabled, queries executed through Dremio Cloud run with the permissions of the authenticated user on the Dremio Software side. This preserves your existing Dremio Software access control policies.

Without impersonation, all Cloud queries execute as the service account configured in the connection, which may have broader access than individual users should.

### 5. Configure Advanced Settings

Set Reflection Refresh, Metadata refresh intervals, and connection properties. Click **Save**.

## Querying Across Deployments

```sql
-- Query on-premises data through Dremio Software
SELECT
  department,
  employee_count,
  avg_salary
FROM "dremio-onprem".hr.department_summary;

-- Join on-premises HR data with cloud-native analytics
SELECT
  d.department,
  d.employee_count,
  d.avg_salary,
  c.department_cloud_spend,
  ROUND(c.department_cloud_spend / d.employee_count, 2) AS cloud_cost_per_employee
FROM "dremio-onprem".hr.department_summary d
JOIN analytics.gold.cloud_infrastructure_costs c ON d.department = c.department
ORDER BY cloud_cost_per_employee DESC;
```

## Build a Semantic Layer Across Deployments

```sql
CREATE VIEW analytics.gold.enterprise_360 AS
SELECT
  onprem.employee_id,
  onprem.employee_name,
  onprem.department,
  onprem.office_location,
  cloud.cloud_account_id,
  cloud.monthly_cloud_spend,
  CASE
    WHEN cloud.monthly_cloud_spend > 10000 THEN 'Heavy Cloud User'
    WHEN cloud.monthly_cloud_spend > 1000 THEN 'Moderate'
    ELSE 'Light'
  END AS cloud_usage_tier
FROM "dremio-onprem".hr.employees onprem
LEFT JOIN analytics.gold.cloud_accounts cloud ON onprem.employee_id = cloud.owner_id;
```

In the **Catalog**, click **Edit** → **Generate Wiki** and **Generate Tags**.

## AI-Powered Analytics Across Deployments

### Dremio AI Agent

The AI Agent lets users ask questions spanning both on-premises and cloud data: "Which departments have the highest cloud cost per employee?" or "Show me heavy cloud users in the engineering department." The Agent reads your semantic layer's wiki descriptions and generates SQL that joins across both Dremio deployments.

### Dremio MCP Server

Connect [Claude or ChatGPT](https://github.com/dremio/dremio-mcp) to your federated data:

1. Create a Native OAuth app in Dremio Cloud
2. Configure redirect URLs for your AI client
3. Connect via `mcp.dremio.cloud/mcp/{project_id}`

A CTO asks Claude "Compare cloud infrastructure costs per department with on-premises headcount" and gets insights spanning both deployment models.

### AI SQL Functions

```sql
-- Classify departments by cloud optimization potential
SELECT
  department,
  employee_count,
  cloud_cost_per_employee,
  AI_CLASSIFY(
    'Based on cloud spending patterns, classify optimization potential',
    'Department: ' || department || ', Employees: ' || CAST(employee_count AS VARCHAR) || ', Cloud Cost/Employee: $' || CAST(cloud_cost_per_employee AS VARCHAR),
    ARRAY['Well Optimized', 'Room for Improvement', 'Over-Provisioned', 'Needs Audit']
  ) AS optimization_status
FROM (
  SELECT
    d.department,
    d.employee_count,
    ROUND(c.department_cloud_spend / d.employee_count, 2) AS cloud_cost_per_employee
  FROM "dremio-onprem".hr.department_summary d
  JOIN analytics.gold.cloud_infrastructure_costs c ON d.department = c.department
);
```

## Important Considerations

### Network Latency

Cross-network queries between Dremio Cloud and on-premises Dremio Software add network latency. Optimize by:

- Using Reflections to cache frequently accessed on-premises data in Dremio Cloud
- Creating aggregated views on the Dremio Software side that pre-compute common metrics — transfer summarized data rather than raw tables
- Minimizing the amount of raw data transferred across the network

### Cloud Egress Costs

Data returned from Dremio Software to Dremio Cloud may incur cloud egress charges if the Software instance runs in a different network or cloud provider. Strategies to minimize egress:

- Build pre-aggregated views on the Software side
- Use Reflections to cache results (data transfers once per refresh, not per query)
- Filter data as close to the source as possible

### Version Compatibility

Keep Dremio Software at version 24.0 or later for best compatibility with Dremio Cloud. Older versions may have limited feature support through the federation connector.

### Security

- Enable TLS for all connections between Dremio Cloud and Software
- Use a dedicated service account with minimal necessary permissions
- Enable user impersonation for proper access control propagation
- Consider network-level security (VPN, PrivateLink) for on-premises connections

### Monitoring and Troubleshooting

Monitor the health and performance of your hybrid deployment:

- **Query profiles:** Use Dremio Cloud's query profiler to identify slow cross-deployment queries. Look for high data transfer volumes that suggest missing Reflections.
- **Metadata refresh timing:** If Dremio Cloud shows stale schema from Dremio Software, decrease the metadata refresh interval.
- **Connection pool management:** For high-concurrency workloads, monitor connection usage between Cloud and Software. Increase the maximum idle connections if you see connection timeout errors.
- **Latency benchmarks:** Establish baseline latency for cross-deployment queries. If latency degrades, check network connectivity and consider adding Reflections to cache frequently accessed data.

Track these metrics to ensure your hybrid architecture delivers consistent performance as usage grows.

## Governance Across Deployments

Dremio Cloud's Fine-Grained Access Control (FGAC) applies governance to the federated view of data:

- **Column masking:** Mask sensitive on-premises fields (employee SSN, salary) from specific Cloud user roles
- **Row-level filtering:** Regional Cloud users see only their region's data from on-premises sources
- **Unified policies:** Same governance rules apply whether data comes from the Software instance, Cloud sources, or external databases

## Connect BI Tools via Arrow Flight

BI tools connected to Dremio Cloud via Arrow Flight access both cloud and on-premises data through a single connection:

- **Tableau:** Dremio connector — one connection serves data from both deployments
- **Power BI:** Dremio ODBC driver or native connector
- **Python/Pandas:** `pyarrow.flight` client for programmatic access
- **dbt:** `dbt-dremio` adapter for transformation workflows

All queries benefit from Reflections, governance, and the semantic layer — regardless of where the source data resides.

## VS Code Copilot Integration

Dremio's VS Code extension with Copilot integration enables developers to query federated data from their IDE. Ask Copilot "Compare cloud costs per department with on-premises headcount" and it generates SQL using your semantic layer that spans both deployments.

## Reflections for Hybrid Optimization

Create Reflections on hybrid views to cache cross-deployment query results:

1. Build views that join Cloud and Software data
2. Create Reflections on those views
3. Set refresh intervals based on how frequently the underlying on-premises data changes

After creation, dashboard queries that span both deployments are served from Dremio Cloud's Reflection cache — eliminating network latency for repeat queries.

## Migration Planning: Software to Cloud

Use the Dremio-to-Dremio connector as a migration bridge:

1. **Phase 1 — Federation:** Connect Dremio Software to Dremio Cloud. All existing Software views remain accessible from Cloud.
2. **Phase 2 — Parallel Development:** Build new views and Reflections in Dremio Cloud while continuing to maintain Software views.
3. **Phase 3 — Source Migration:** Gradually move individual data sources (PostgreSQL, Oracle, S3) from Software connections to Cloud connections. Update views to reference Cloud-native sources.
4. **Phase 4 — Decommission:** Once all sources are connected to Cloud, remove the Dremio Software connection.

During the migration, users experience no disruption — they continue querying through Dremio Cloud while the underlying sources are being transitioned.

## Common Deployment Architectures

### Hub-and-Spoke Model

Dremio Cloud serves as the central hub, with multiple Dremio Software instances as spokes. Each spoke manages a specific data center or business unit:

- **Spoke A:** Finance data center (Oracle, SQL Server, DB2)
- **Spoke B:** Manufacturing data center (SAP HANA, PostgreSQL)
- **Spoke C:** Research data center (S3, MongoDB)

Dremio Cloud federates across all spokes, providing a single analytics interface for the entire organization.

### Staged Migration Model

For organizations migrating to the cloud in waves:

- **Wave 1:** Non-sensitive workloads migrate to Cloud with direct source connections
- **Wave 2:** Sensitive workloads use Software as a proxy (governance-compliant data access)
- **Wave 3:** Remaining workloads migrate as regulatory and security requirements are met

### Disaster Recovery Model

Dremio Software serves as a fallback if Cloud connectivity is temporarily unavailable. On-premises critical workloads run against Software; Cloud handles all other analytics. This architecture provides business continuity for mission-critical dashboards and reports.

## Performance Best Practices

Maximize hybrid performance with these strategies:

- **Pre-aggregate on Software side:** Build views in Dremio Software that SUM, COUNT, and AVG at the granularity Cloud queries need. Transfer megabytes, not gigabytes.
- **Use Reflections aggressively:** Create Reflections on every cross-deployment view. Network latency disappears once results are cached.
- **Schedule Reflection refreshes strategically:** Refresh during off-peak hours when network bandwidth is available.
- **Monitor data transfer volumes:** Use Dremio Cloud's query profiler to identify queries that transfer large volumes from Software. Convert these to Reflections first.

## Get Started

Organizations can seamlessly federate across Dremio deployments, enable AI analytics on combined on-premises and cloud data, and migrate incrementally to the cloud — all while maintaining unified governance. The Dremio-to-Dremio connector is the bridge that makes hybrid lakehouse analytics practical.

Whether you're running a single Dremio Software instance in one data center or managing multiple Software installations across global facilities, Dremio Cloud provides a unified analytical interface. Combine the raw data processing power of on-premises Dremio Software with the AI capabilities, Reflections, and managed infrastructure of Dremio Cloud. The result is a truly hybrid analytics platform that grows with your cloud migration at whatever pace your organization requires. No rip-and-replace, no big-bang migration — just a gradual, governed transition that protects your existing investments.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=connector-dremio-to-dremio-cloud&utm_content=alexmerced) and connect your existing Dremio Software instances.
