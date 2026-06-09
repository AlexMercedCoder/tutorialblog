---
title: "Securing Agent Identities in the Lakehouse"
date: "2026-06-08"
description: "How OAuth 2.0 token exchange, OAuth 2.1 device authorization grant, credential vending, and fine-grained access control secure AI agent identities in the Iceberg lakehouse."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - "securing agent identities lakehouse"
  - "OAuth token exchange AI agents"
  - "Iceberg REST catalog authentication"
  - "credential vending"
  - "fine-grained access control agents"
  - "OAuth 2.1 device grant"
---

An AI agent is not a human. It does not log in with a password. It does not close sessions at the end of the day. It does not notice when its credentials are stolen. Yet most data platforms in 2026 still authenticate agents the same way they authenticate humans: with long-lived tokens that grant broad access.

The mismatch is dangerous. A human with a compromised token can do damage before the token is revoked. An agent with a compromised token can do damage thousands of times faster, because agents execute autonomously and at scale. The security model for agent identities must assume that tokens will be exfiltrated, that agents will be compromised, and that access must be revocable in seconds, not days.

This article covers the authentication and authorization patterns that secure AI agent identities in the Iceberg lakehouse: OAuth 2.0 token exchange (RFC 8693) for deriving scoped tokens from agent session tokens, OAuth 2.1 device authorization grant for agent onboarding, Iceberg REST catalog authentication with credential vending, and fine-grained access control with short-lived, query-scoped credentials.

## Why Agent Authentication Is Different

OAuth 2.0 was designed for human-mediated authorization. A human user authenticates through a browser, grants consent, and receives a token that represents their identity for a session. The token is scoped to the user's permissions. If the token is compromised, the user can revoke it, and the damage is limited to what that user could do.

AI agents break every assumption in that model.

**Agents do not use browsers.** An agent cannot redirect to a login page, enter credentials, and grant consent programmatically. The authorization code flow, which is the standard for human authentication, requires browser interaction. Agents need non-interactive flows.

**Agents hold tokens for hours or days.** An agent's analytical workflow may run for hours, making thousands of tool calls. The token must remain valid for the entire workflow. Long token lifetimes increase the window of exposure if the token is stolen.

**Agents multiply exposure.** One compromised human account is one incident. One compromised agent can spawn ten diagnostic sub-agents, each with their own tokens. One compromised agent token infrastructure can lead to hundreds of compromised tokens.

**Agents act on behalf of other identities.** A pricing agent might act on behalf of a pricing team. A customer-facing analytics agent might act on behalf of hundreds of customers. The agent's identity must be traceable to the authority that granted it, not just to the agent itself.

OAuth 2.1 addresses some of these issues (removing the implicit grant, mandating PKCE, requiring refresh token rotation) but the core pattern remains human-centric. The industry response has been to layer additional protocols on top of OAuth 2.0: token exchange for scope derivation, device authorization for non-interactive onboarding, and credential vending for query-scoped access.

## OAuth 2.0 Token Exchange for AI Agents

RFC 8693 defines the OAuth 2.0 Token Exchange protocol. It allows a security token service (STS) to accept one token (the input token) and issue a new token (the output token) with different scope, audience, or lifetime. For AI agents, token exchange is the mechanism for deriving capability tokens from agent session tokens.

The flow works as follows:

1. The agent authenticates with an identity provider (IdP) using a non-interactive flow (client credentials or device authorization grant).
2. The IdP issues a session token scoped to the agent's identity. This token says "I am agent `pricing-agent-01` and I belong to the `pricing-team` group."
3. When the agent needs to call a specific tool (for example, query the `monthly_revenue` table), it sends its session token to the STS with a token exchange request.
4. The STS validates the session token, applies policy rules (does this agent have permission to call this tool?), and issues a capability token scoped to that specific tool.
5. The agent uses the capability token for the tool call. The token expires after the tool call completes (typically 5 to 60 minutes).

The capability token has three critical properties:

- **Audience restriction.** The token is valid only for the specific tool or resource it was issued for. A token issued for `get_monthly_revenue` cannot be used to call `list_tables` or `run_sql`.
- **Short lifetime.** Tokens expire in minutes, not hours. If a token is exfiltrated, the attacker has a narrow window to use it.
- **Revocable by policy.** If the agent's session token is revoked, all capability tokens derived from it are invalidated, even before their natural expiration.

This pattern is documented in detail by Supertokens and SecureW2's implementation guides for OAuth with AI agents. The key operational rule is: the session token is long-lived (hours to match the agent's workflow duration), but capability tokens are short-lived (minutes to limit exposure).

## OAuth 2.1 Device Authorization Grant for Agent Onboarding

The device authorization grant (RFC 8628), part of the OAuth 2.1 standard, provides a non-interactive authentication flow suitable for agents. It is the same flow used by smart TVs and CLI tools, adapted for agent workloads.

The flow for an agent:

1. The agent initiates authentication by contacting the IdP's device authorization endpoint. It sends its client ID (the agent's identity) and the requested scope.
2. The IdP returns a device code, a user code, and a verification URI. In the smart TV scenario, a human visits the URI and enters the user code. For agents, the flow is automated.
3. The agent polls the token endpoint with the device code. If a human has approved the request, the IdP returns tokens. If not, the IdP returns `authorization_pending`.
4. Once approved, the agent receives an access token (short-lived) and a refresh token (long-lived, but refresh is tied to the device code).

For agent onboarding, the device code is approved by a human administrator. The administrator's IdP session grants consent for the agent to act within defined scopes. The agent stores the refresh token and uses it to obtain new access tokens without human re-approval.

The advantage of the device authorization grant over client credentials is auditability. Client credentials authenticate the agent as a service. Device authorization authenticates the agent plus the human who approved it. Every token issued includes the approving administrator's identity in the audit trail.

LoginRadius documents this pattern in their OAuth 2.1 for AI agents guide. The device authorization grant is the recommended flow for production agent deployments where auditability is required.

## Iceberg REST Catalog Authentication Models

The Iceberg REST catalog specification defines three authentication models that map to different agent deployment patterns.

**OAuth 2.0 token exchange (the default).** The client (query engine) presents a token to the catalog. The catalog validates the token, identifies the principal, and enforces access control. For agent workloads, the token presented to the catalog should be a capability token (short-lived, tool-scoped), not the agent's long-lived session token.

Future versions of the Iceberg REST catalog specification will remove the built-in OAuth 2.0 token exchange in favor of requiring an external token service. The Iceberg project has documented this transition. For new deployments, use an external token service (Keycloak, Auth0, Okta) and configure the catalog to trust it.

**Bearer token.** The client includes a bearer token in the HTTP Authorization header. The catalog validates the token against its configured trust store. Bearer tokens are simple but have no built-in revocation mechanism. For agent workloads, bearer tokens should have a lifetime of no more than 15 minutes.

**Client credentials (direct).** The catalog accepts a client ID and client secret directly. This is the simplest pattern for development but risks credential exposure. The client secret must be stored securely and rotated regularly. Dremio's Auth Manager for Apache Iceberg handles this transparently: it stores credentials, obtains tokens, and refreshes them before expiry.

For production agent deployments, use OAuth 2.0 token exchange with capability tokens. The agent's session token is exchanged for a catalog-specific token with each query. The catalog validates the token, applies scope restrictions, and vends storage credentials.

## Credential Vending: Query-Scoped Storage Access

Credential vending is the mechanism that gives agents access to object storage without exposing storage credentials. It is defined by the Iceberg REST catalog specification and implemented by Apache Polaris, Dremio Open Catalog, Snowflake Horizon Catalog, and Databricks Unity Catalog.

The flow:

1. The query engine resolves a table reference through the catalog. The catalog returns the table metadata location in object storage.
2. The engine requests credential vending from the catalog. The request includes the specific data files to be read (from the manifest files) and the operation type (read or write).
3. The catalog validates the request against the principal's permissions. If permitted, the catalog vends temporary credentials scoped to the specific files.
4. The engine uses the temporary credentials to read or write the data files directly.
5. The credentials expire after a configurable interval (typically 5 to 60 minutes).

For agent workloads, credential vending provides two security properties that long-lived storage keys do not.

**File-scoped access.** The credentials are limited to the exact files needed for a single query. If an agent's query touches three Parquet files in a particular partition, the vended credentials grant access to only those three files. The agent cannot read other files in the same bucket.

**Time-limited access.** The credentials expire after minutes. If the credentials are exfiltrated, the attacker must use them before expiry. Dremio's documentation recommends 15-minute token lifetimes for interactive agent queries and 60-minute lifetimes for batch analytical agents.

Google Cloud Lakehouse, Databricks Unity Catalog, and Dremio all support credential vending for Iceberg REST catalogs. The implementation details vary (AWS STS, Azure SAS, GCS short-lived tokens) but the pattern is identical.

## Fine-Grained Access Control for Agents

Fine-grained access control for agents operates at three levels: catalog, engine, and storage.

**Catalog level.** Apache Polaris defines privileges at the namespace and table level. An agent's catalog role can include:

- `NAMESPACE_LIST`: List namespaces in a catalog.
- `TABLE_READ_DATA`: Read data from a specific table.
- `TABLE_WRITE_DATA`: Write data to a specific table.
- `VIEW_SQL`: Read or create views.

For agent workloads, the principle of least privilege means starting with `NAMESPACE_LIST` and `TABLE_READ_DATA` on the specific namespaces the agent needs. No agent gets `TABLE_WRITE_DATA` without a documented need and a human-approved policy.

**Engine level.** The query engine can enforce row-level security (row filters) and column-level security (column masks). Row filters restrict which rows an agent can see based on the agent's identity or attributes. Column masks hide sensitive columns (PII, financial details) from certain agents.

Row filters and column masks are transparent to the agent. The agent queries the table normally. The engine applies the filters and masks before returning results. The agent never sees the filtered rows or masked columns.

**Storage level.** Credential vending is the primary storage-level control. Additionally, object storage policies (S3 bucket policies, Azure RBAC, GCS IAM) can restrict access to specific prefixes, but these are coarse-grained and rarely needed when credential vending is in place. The storage policy should be: only the catalog service has broad storage access. All other access goes through credential vending.

## Token Lifetime Management

Token lifetime management is the operational discipline that makes agent identity security work. Without it, tokens accumulate, expire silently, and cause hard-to-debug failures.

**Session token lifetime.** The agent's session token (obtained via client credentials or device authorization) should match the maximum expected duration of the agent's workflow. For a batch analytical agent that runs for 2 hours, the session token lifetime is 2 hours. For a real-time agent that runs continuously, the session token has a 1-hour lifetime with automatic refresh.

**Capability token lifetime.** Capability tokens (obtained via token exchange) should match the expected duration of a single tool call. For a SQL query that returns in under 5 seconds, the capability token lifetime is 60 seconds. For a complex analytical query that runs for 5 minutes, the capability token lifetime is 10 minutes.

**Refresh token rotation.** OAuth 2.1 mandates refresh token rotation. Each time the agent uses a refresh token, the IdP issues a new refresh token and invalidates the old one. If an attacker steals the refresh token, the next legitimate use by the agent will fail (because the legitimate token has been rotated), and the attacker's token is already invalid. This is the recommended pattern for long-running agents.

**Token revocation.** The IdP should expose a revocation endpoint that invalidates a token before its natural expiration. When an agent is decommissioned, its session token is revoked. All capability tokens derived from that session token are invalidated by the STS. Databricks and Snowflake both support token revocation for their Iceberg catalog integrations.

## Practical Implementation: Agent Identity Setup

Here is a step-by-step implementation of agent identity security for a pricing agent that queries Iceberg tables through Dremio.

**Step 1: Register the agent as an OAuth client.** Register `pricing-agent-01` with the identity provider (Okta, Auth0, Keycloak). The client ID is `pricing-agent-01`. The client secret is stored in a secrets manager (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault).

**Step 2: Create the catalog principal and role.** In Apache Polaris (or Dremio Open Catalog), create a principal for the pricing agent. Create a catalog role named `pricing_agent_read` with `NAMESPACE_LIST` on the `analytics` namespace and `TABLE_READ_DATA` on `analytics.gold.monthly_revenue`. Assign the principal to the catalog role.

**Step 3: Configure the MCP server.** The MCP server that the pricing agent calls is configured with OAuth 2.0 client credentials. On startup, the server obtains a session token from the IdP. When the agent calls a tool, the server exchanges the session token for a capability token scoped to the specific tool.

**Step 4: Set token lifetimes.** Session token: 2 hours (matches the pricing agent's batch window). Capability token: 5 minutes (each tool call completes in seconds). Refresh token rotation: enabled.

**Step 5: Test end-to-end.** Verify that the pricing agent can query `monthly_revenue` but cannot query `customer_pii` or `raw_transactions`. Verify that the capability token is correctly scoped: if the agent calls `run_sql`, the capability token is scoped to the `run_sql` tool only. Verify that the token expires and the agent handles the 401 response gracefully.

**Step 6: Monitor and rotate.** Monitor failed authentication attempts, token refresh failures, and expired tokens. Rotate the agent's client secret monthly. Audit the catalog roles quarterly to ensure that agents have only the permissions they need.

## The Audit Trail: What Gets Logged

For every agent action, the following should be logged:

- Agent identity (client ID, principal name)
- Session token ID (used to trace to the approving administrator)
- Capability token ID (used to trace to the specific tool call)
- Tool called (which MCP tool, which SQL query)
- Timestamp (start and end of the tool call)
- Rows returned or affected
- Error (if any)
- Tokens consumed (for LLM-based agents, the token count)

The audit logs should be stored in an immutable Iceberg table with append-only access. No agent (including the auditing agent) can modify or delete audit logs. The retention period is driven by compliance requirements (typically 1 to 7 years).

## Summary

Securing agent identities in the lakehouse requires a multi-layered approach. OAuth 2.0 token exchange lets agents derive short-lived capability tokens from long-lived session tokens. OAuth 2.1 device authorization grant enables auditable agent onboarding. Iceberg REST catalog authentication with credential vending provides query-scoped, time-limited storage access. Fine-grained access control at the catalog, engine, and storage levels ensures that agents operate within their permission boundaries.

The common thread is short lifetimes and narrow scopes. An agent should never have a token that lasts longer than it needs or grants more access than the next action requires. Everything else follows from that principle.

Dremio's Agentic Lakehouse platform implements this identity security model end-to-end: OAuth 2.0 with Dremio Auth Manager, credential vending through Iceberg REST catalogs, fine-grained access control through Polaris catalog roles, and audit logging through Iceberg system tables. For documentation, visit [dremio.com/blog/introducing-dremio-auth-manager-for-apache-iceberg](https://www.dremio.com/blog/introducing-dremio-auth-manager-for-apache-iceberg) or start a free trial at [dremio.com/get-started](https://www.dremio.com/get-started).

*Sources: RFC 8693 OAuth 2.0 Token Exchange, RFC 8628 OAuth 2.0 Device Authorization Grant, Iceberg REST Catalog Specification (iceberg.apache.org), Stytch "AI Agent Authentication Methods" (stytch.com), SecureW2 "OAuth for AI Agents" (securew2.com), Supertokens "Authentication for AI Agents" (supertokens.com), Dremio "Introducing Dremio Auth Manager for Apache Iceberg" (dremio.com), Databricks "Unity Catalog Credential Vending" (databricks.com).*
