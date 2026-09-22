---
title: "Keeping Lakehouse Traffic Off the Public Internet With Apache Polaris"
date: "2026-09-21"
description: "A private Polaris lakehouse still leaks data if the storage hop goes public. How to bind vended credentials to private networks on AWS, Azure, and GCP."
author: "Alex Merced"
category: "Apache Polaris"
tags:
  - Apache Polaris
  - Networking
  - Security
  - Private Link
canonical: https://iceberglakehouse.com/posts/polaris-private-networking-lakehouse/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/polaris-private-networking-lakehouse/).

A bank's security team reviews its new lakehouse design. Apache Polaris serves as the Iceberg REST catalog. Query engines run in private subnets. The catalog sits behind an internal load balancer. Everything looks private.

Then someone traces an actual query. The engine asks Polaris to load a table. Polaris calls the cloud's security token service to mint temporary credentials. The engine takes those credentials and reads Parquet files straight from object storage. That last hop goes to the storage service's public endpoint, over the internet-facing path, because nobody configured a private route to storage. The catalog is private. The data is not.

This is the most common gap in lakehouse network designs, and it comes from a mismatch in mental models. Teams think of the catalog as the gateway to the data. With credential vending, it is not. The catalog authorizes and hands out access, and then the engine goes to storage on its own. A private network design has to cover every path, and the path to the catalog is only one of them.

This article maps the network paths in a Polaris-based lakehouse, explains which private connectivity features cover each one on AWS, Azure, and Google Cloud, and shows the Polaris settings that make it work. It also covers the control that matters more than any private endpoint: storage policies that make vended credentials useless outside your network. And it is honest about what private links do not do, which is make cross-cloud data transfer free.

A disclosure: Apache Polaris was co-created by Snowflake and Dremio, and I work at Dremio. Everything here uses open Polaris features and standard cloud networking.

## The Network Paths in a Vended-Credential Lakehouse

A query against an Iceberg table in a Polaris catalog uses several network paths. Each has a different source, destination, and purpose.

| Path | From | To | Carries |
|---|---|---|---|
| Identity | Engine | OAuth token endpoint (Polaris or external identity provider) | Client credentials in, bearer token out |
| Control | Engine | Polaris REST API | Catalog calls: config, list, load table, commit |
| Credential | Polaris | Cloud token service (AWS STS, Azure AD, Google IAM) | Requests to mint scoped, short-lived storage credentials |
| Metadata | Polaris | Object storage | Reads and writes of table metadata files during commits |
| Data | Engine | Object storage | Reads and writes of manifests and data files, using vended credentials |

The data path is the one that matters most, because it carries almost all the bytes. A single table load on the control path returns a few kilobytes of metadata. The data path that follows can read gigabytes of Parquet.

The credential path is the one teams forget. Polaris does not store long-lived keys for engines. On every table load that requests vended credentials, it calls the cloud's token service to create temporary credentials scoped to that table's storage location. If Polaris runs in a subnet with no internet access and no private route to the token service, credential vending fails, and every table load fails with it.

The identity path depends on your setup. Polaris has a built-in token endpoint for client credentials, which rides the same route as the control path. If you federate identity to an external provider, engines also need a route to that provider.

The metadata path exists because Polaris reads and writes table metadata files itself during certain operations, such as committing a new metadata file. That traffic is small, but it has to succeed, and storage policies that lock down the bucket must allow it.

I cover how the credential path works internally, including the per-cloud mechanics of scoping and minting, in [Cross-Cloud Credential Vending in Apache Polaris](https://datalakehousehub.com/blog/polaris-cross-cloud-credential-vending). This article stays on the network underneath it.

## Why Vending Changes the Network Design

In older data platforms, a warehouse or a query service sat between users and storage. Private networking meant making that one service private. Storage was only reachable through it.

Credential vending changes the shape. The catalog is a policy decision point, not a data proxy. It decides who gets access, mints credentials that encode that decision, and steps aside. The engine talks to storage directly. This is what makes vending fast and scalable, since the catalog never becomes a throughput bottleneck. It also means the catalog's network location says nothing about the data path.

Two consequences follow.

**Making Polaris private does not make data private.** Putting Polaris behind an internal load balancer protects the control path. It does nothing for the data path, which goes wherever the engine's network sends traffic for the storage hostname. If that is the public endpoint, data flows over the public internet path, encrypted with TLS but outside your private network.

**Vended credentials work from anywhere by default.** Temporary credentials from AWS STS, a SAS token from Azure, or a downscoped Google OAuth token are bearer tokens for storage. Scoping limits what they can reach and how long they last. By default, it does not limit where they can be used from. A vended credential that leaks from an engine's logs or memory works from any network until it expires.

The second point is the more important one. Short lifetimes and tight scopes shrink the damage from a leak. Only a network condition on the storage side eliminates it. That is where private connectivity stops being a routing detail and becomes a security control.

## The Strongest Control: Network-Bound Storage Policies

All three major clouds let you tell the storage service to reject requests that do not arrive through your private network, regardless of which credentials they carry. Pair that with private endpoints, and a vended credential becomes useless outside your network.

**On AWS**, S3 bucket policies support the condition key `aws:SourceVpce`, which holds the ID of the VPC endpoint a request came through. A bucket policy statement that denies all S3 actions when `aws:SourceVpce` is not one of your endpoint IDs blocks every request from outside those endpoints. Explicit denies in bucket policies override allows granted anywhere else, including the session policy Polaris attaches when it mints credentials. So a vended credential used from a laptop on the internet gets access denied, even though it is valid and correctly scoped.

**On Azure**, storage accounts have network rules. You can disable public network access and allow traffic only through private endpoints or selected virtual networks. SAS tokens are still subject to those rules. A valid SAS token presented from outside the allowed networks is rejected.

**On Google Cloud**, VPC Service Controls define a service perimeter around projects. Requests to Cloud Storage from outside the perimeter are blocked, even with valid credentials, including the downscoped tokens that Polaris vends for GCS. Inside the perimeter, Private Google Access or Private Service Connect for Google APIs keeps traffic on Google's network.

These controls have one thing in common. They move the question from "does this request have valid credentials?" to "does this request have valid credentials and come from where we expect?" For a lakehouse built on vended credentials, that second condition is what closes the leak scenario.

They also have one shared trap. Everything that needs the bucket has to come through an allowed path, including Polaris itself on the metadata path, maintenance jobs, backup tools, and administrators using the cloud console. A network-bound policy that forgets one of them breaks it. The AWS example in the next section includes an exception for a break-glass administrative role for exactly this reason.

## A Reference Design on AWS

AWS gives the most detailed set of knobs, so it makes a good worked example. The Azure and Google Cloud sections that follow map the same ideas to their equivalents.

Assume one region, `us-east-1`, with the lakehouse bucket `acme-lakehouse`. Query engines run in an analytics VPC, and Polaris runs in a platform VPC in the same account. Neither VPC has an internet gateway or NAT.

**Storage: a gateway endpoint for S3.** An S3 gateway endpoint adds a route to the VPC's route tables that sends S3 traffic for the region through the endpoint instead of the internet. Clients keep using the normal regional S3 hostnames. No DNS or client changes are needed, and AWS does not charge for gateway endpoints. The limits are that a gateway endpoint only serves traffic from inside its own VPC and only reaches buckets in the same region. Create one in each VPC that touches the bucket, which here means both the analytics VPC and the platform VPC.

**Storage: interface endpoints when you need them.** An S3 interface endpoint, built on AWS PrivateLink, places network interfaces with private IPs in your subnets. It is reachable from on-premises networks over Direct Connect or VPN, and from peered networks, which gateway endpoints are not. It carries hourly and per-gigabyte charges. Clients reach it through endpoint-specific DNS names, or through the regular S3 hostnames if you enable private DNS for the endpoint. Use interface endpoints when engines run outside the VPC, such as on-premises clusters reading cloud tables.

**Credentials: an interface endpoint for STS.** Polaris needs to call STS to mint vended credentials. Create an STS interface endpoint in the platform VPC with private DNS enabled, so the regional STS hostname resolves to private IPs. Point Polaris at the regional STS endpoint rather than the global one, because the global endpoint does not resolve to your VPC endpoint.

**Catalog: a private service for consumers.** Put Polaris behind an internal Network Load Balancer. Engines in the same VPC or peered VPCs call it directly. Engines in other accounts or VPCs without peering reach it through a PrivateLink endpoint service in front of that load balancer, with an interface endpoint in each consumer VPC. That keeps the control path private across account boundaries without opening network routes between whole VPCs.

Here are the endpoint pieces with the AWS CLI.

```bash
# Gateway endpoint for S3 in the analytics VPC (repeat for the platform VPC).
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-0analytics00000000 \
  --vpc-endpoint-type Gateway \
  --service-name com.amazonaws.us-east-1.s3 \
  --route-table-ids rtb-0analytics0000000

# Interface endpoint for STS in the platform VPC, with private DNS,
# so sts.us-east-1.amazonaws.com resolves to private IPs.
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-0platform000000000 \
  --vpc-endpoint-type Interface \
  --service-name com.amazonaws.us-east-1.sts \
  --subnet-ids subnet-0plat0000000000a subnet-0plat0000000000b \
  --security-group-ids sg-0stsendpoint000000 \
  --private-dns-enabled
```

Next, the Polaris catalog. Polaris's AWS storage configuration has three endpoint fields, and they map cleanly onto the paths from earlier.

- `endpoint` is the S3 endpoint that clients see. Polaris passes it to engines along with vended credentials. Engines use it on the data path.
- `endpointInternal` is the S3 endpoint Polaris itself uses on the metadata path. Clients never see it. It defaults to `endpoint`.
- `stsEndpoint` is the STS endpoint Polaris calls on the credential path. It defaults to `endpointInternal`.

With gateway endpoints, both Polaris and engines use the standard regional S3 hostname, so the S3 fields can stay unset or point at the regional endpoint. The STS endpoint is the one to set explicitly.

```bash
polaris catalogs create \
  --storage-type s3 \
  --default-base-location s3://acme-lakehouse/warehouse \
  --role-arn arn:aws:iam::111122223333:role/polaris-lakehouse-access \
  --region us-east-1 \
  --sts-endpoint https://sts.us-east-1.amazonaws.com \
  analytics
```

When engines reach S3 through an interface endpoint without private DNS, add `--endpoint` with the endpoint-specific hostname for clients, and `--endpoint-internal` with whatever hostname Polaris uses from its own network. That split is what lets engines and the catalog reach the same bucket through different private paths.

Finally, the bucket policy that binds credentials to the network.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyLakehouseAccessOutsidePrivateEndpoints",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::acme-lakehouse",
        "arn:aws:s3:::acme-lakehouse/*"
      ],
      "Condition": {
        "StringNotEquals": {
          "aws:SourceVpce": [
            "vpce-0analyticsgw000000",
            "vpce-0platformgw0000000"
          ]
        },
        "ArnNotLike": {
          "aws:PrincipalArn": "arn:aws:iam::111122223333:role/lakehouse-break-glass"
        }
      }
    }
  ]
}
```

Here is how the policy works. The statement is a deny, and a deny wins over any allow. Conditions inside one statement are combined with AND, so the deny applies only when both conditions hold. The first condition matches requests that did not arrive through either gateway endpoint. The second matches any principal other than the break-glass role. Put together, the policy denies every request from outside the two endpoints, except requests made by the break-glass role.

The effect on vended credentials is direct. Polaris mints session credentials by assuming `polaris-lakehouse-access` with a session policy scoped to one table. An engine in the analytics VPC uses them through the gateway endpoint, and the request is allowed. The same credentials copied to a machine on the internet hit the deny, because the request carries no matching `aws:SourceVpce`. Polaris's own metadata writes come through the platform VPC's gateway endpoint and pass.

The break-glass exception exists because this policy also blocks the AWS console and any administrative tool running outside the VPCs. Without an exception, a mistake in the policy can lock everyone out of the bucket, including the people who need to fix it. Keep the exception role tightly controlled, require MFA to assume it, and alert on its use.

If the bucket uses SSE-KMS, the decryption happens inside S3, so engines do not need a network route to KMS for ordinary reads. The role Polaris assumes still needs permission to use the key. Polaris's storage configuration has `encryptionKeys` and `decryptionKeys` fields that list which KMS keys vended credentials can use.

## The Same Design on Azure and Google Cloud

The paths are identical on every cloud. Only the names change.

**Azure.** Storage traffic goes through private endpoints on the storage account. An ADLS Gen2 account used for Iceberg typically needs private endpoints for both the `dfs` subresource, which Iceberg's Azure file IO uses, and the `blob` subresource, which some tools use. Each private endpoint needs a matching private DNS zone, `privatelink.dfs.core.windows.net` and `privatelink.blob.core.windows.net`, linked to the virtual networks where engines and Polaris run. With the zones in place, the account's normal hostnames resolve to private IPs inside those networks.

Then lock the account down. Disable public network access, or restrict it to selected virtual networks and private endpoints. SAS tokens that Polaris vends are subject to those rules, so a leaked token fails outside the allowed networks.

For the credential path, Polaris on Azure generates SAS tokens using credentials from Microsoft Entra ID, which means Polaris needs a route to the Entra ID token endpoints. Those are internet-facing services, so a Polaris deployment in a locked-down network needs an egress path for them, usually through a firewall or proxy that allows only the required Azure identity hostnames. Plan for that explicitly rather than discovering it when vending fails.

To publish Polaris itself privately to other networks, place it behind an internal Standard Load Balancer and expose it with Azure Private Link Service. Consumers create private endpoints to that service in their own virtual networks.

**Google Cloud.** For storage, enable Private Google Access on the subnets where engines and Polaris run, so VMs without external IPs can reach Google APIs, including Cloud Storage, over Google's network. For tighter control, use Private Service Connect endpoints for Google APIs, which give you private IP addresses for the API front ends inside your VPC.

The network-bound control on Google Cloud is VPC Service Controls. Put the projects holding your lakehouse buckets inside a service perimeter that includes Cloud Storage. Requests from outside the perimeter are denied even with valid tokens, which covers the downscoped OAuth tokens Polaris vends for GCS. Access levels and ingress rules let you admit specific identities or networks when needed.

For the credential path, Polaris creates downscoped tokens through Google's IAM and Security Token Service APIs, which are also Google APIs reachable through Private Google Access or Private Service Connect. Include the relevant services in your perimeter design so Polaris can reach them from inside.

To publish Polaris privately, put it behind an internal load balancer and publish it as a Private Service Connect service through a service attachment. Consumer VPCs connect with their own Private Service Connect endpoints.

| Concern | AWS | Azure | Google Cloud |
|---|---|---|---|
| Private route to storage | S3 gateway or interface endpoint | Storage private endpoints (dfs, blob) | Private Google Access or Private Service Connect |
| Bind credentials to the network | Bucket policy on `aws:SourceVpce` | Storage account network rules | VPC Service Controls perimeter |
| Private route for credential minting | STS interface endpoint | Controlled egress to Entra ID | Google APIs via Private Google Access or PSC |
| Publish Polaris privately | NLB plus PrivateLink endpoint service | Internal load balancer plus Private Link Service | Internal load balancer plus PSC service attachment |

## Cross-Region and Cross-Cloud: What Private Links Do Not Do

Private connectivity is often sold with the phrase "zero egress." It is worth being precise about what that means, because the gap between the phrase and the bill surprises people.

Private endpoints change the path traffic takes. They do not change the price of moving data between regions or clouds. When an engine in one region reads Parquet files from a bucket in another region, the cloud charges inter-region data transfer, whether the traffic crossed the public internet path or a private connection. When an engine in Azure reads a bucket in AWS, AWS charges data transfer out, and a private interconnect between the clouds adds its own port and data charges on top. Private networking removes public internet exposure. It does not make distance free.

What private links do eliminate is the need for public exposure, and in some cases specific charges. Gateway endpoints for S3 carry no charge, and same-region traffic through them avoids NAT gateway processing fees that a private subnet otherwise pays to reach S3 through a NAT. For busy lakehouses, that NAT saving alone is often large enough to notice on the monthly bill.

So the honest goal has two parts. First, zero public exposure: every path from the table above stays on private networks. Second, minimal distance: engines run in the same region as the data they read most. That second part is architecture, not networking.

For cross-cloud lakehouses, that leads to a few patterns.

**Keep compute next to data.** Run engines in the cloud and region where each table lives. Use one Polaris deployment, or a federated set, to give every engine a consistent catalog view, but route data reads locally.

**Replicate hot data deliberately.** When a team in another cloud reads the same tables constantly, a replica close to them costs storage but saves repeated transfer. Make that a conscious decision with a refresh policy, not an accident.

**Use private interconnects for the paths that must cross.** When cross-cloud reads are unavoidable, a dedicated interconnect keeps them off the public internet and gives predictable bandwidth. Budget for the transfer charges explicitly.

**Measure per path.** Tag and monitor data transfer by source and destination. The control path costs almost nothing. The data path is where money moves.

## What the Private Paths Cost to Run

Private connectivity has its own line items, and they scale differently from the data. Knowing the shape helps you pick the right endpoint type for each path.

**Gateway endpoints for S3** have no hourly or data processing charge. They are the default choice for engines and Polaris inside AWS VPCs in the same region as the bucket. Their only costs are operational: one per VPC, and route table entries to maintain.

**Interface endpoints** on AWS, private endpoints on Azure, and Private Service Connect endpoints on Google Cloud generally carry an hourly charge per endpoint, often per availability zone, plus a charge per gigabyte processed. For low-volume paths such as STS or the Polaris control path, the per-gigabyte part is negligible and the hourly part dominates. For high-volume data paths, the per-gigabyte part dominates. Check your provider's current pricing, since it varies by region and changes over time.

**Private service publishing** for Polaris, through an AWS endpoint service, Azure Private Link Service, or a Google Cloud service attachment, adds a load balancer and endpoint charges for each consumer network. The control path carries so little data that this is mostly a fixed cost per consumer environment.

**Dedicated interconnects** for hybrid and cross-cloud paths carry port charges and data transfer charges. They are the most expensive piece, and they only make sense for paths that carry real volume.

That shape suggests a simple rule. Use the free option, gateway endpoints, for the high-volume data path wherever the topology allows. Use interface-style endpoints for low-volume paths such as the token service and the catalog, and for data paths that cannot use a gateway endpoint, such as on-premises engines. Put the largest recurring cost, cross-region and cross-cloud transfer, under architectural control rather than networking control.

One more cost is easy to miss. Every interface endpoint and private DNS zone is something to create, monitor, and keep consistent across environments. A lakehouse with ten VPCs and five services per VPC has fifty endpoints to manage. At that size, infrastructure as code for the network layer becomes a requirement. Treat endpoints, DNS zone links, and storage policies as one versioned module per environment, so a new VPC gets every path at once.

## Hybrid Engines: On-Premises Compute Against Cloud Tables

Many lakehouses have at least one engine outside the cloud: an on-premises Spark cluster, a data science workstation fleet, or a partner's environment. Those engines need the same three paths, and the tools change because they are not inside a cloud network.

On AWS, gateway endpoints do not help here, since they only serve traffic that originates inside their VPC. On-premises engines reach S3 privately through an S3 interface endpoint, over AWS Direct Connect or a site-to-site VPN into the VPC that holds the endpoint. The engine then has to use the interface endpoint's hostnames. Either enable private DNS for the endpoint and forward the relevant DNS queries from on-premises resolvers into the VPC, or configure Polaris's client-visible `endpoint` to the endpoint-specific hostname so engines receive it with every table load.

That second option shows why the `endpoint` and `endpointInternal` split matters. Polaris, running inside the VPC, reaches S3 through the gateway endpoint on the standard hostname. On-premises engines receive the interface endpoint hostname as the client-visible endpoint. Both reach the same bucket through different private routes, and the catalog tells each side what it needs.

The bucket policy has to allow both routes. Add the interface endpoint's ID to the `aws:SourceVpce` list alongside the gateway endpoints.

On Azure, on-premises engines reach storage private endpoints over ExpressRoute or VPN, with conditional DNS forwarding for the `privatelink` zones. On Google Cloud, Cloud Interconnect or Cloud VPN combined with Private Service Connect endpoints for Google APIs gives on-premises engines private access to Cloud Storage, and VPC Service Controls can admit that traffic through access levels.

The control path is simpler. Publish Polaris through the private service mechanism of your cloud, and route on-premises traffic to it over the same private connection.

If your environment has no cloud connection at all, private links are the wrong tool. A fully disconnected deployment, with storage and catalog on-premises, is a different design with its own constraints, which I cover in [Designing Private, Air-Gapped Data Lakehouses](https://datalakehousehub.com/blog/private-air-gapped-data-lakehouses-iceberg-secure-clouds).

## Testing the Design

A private network design is only as good as its weakest path, and the weak paths fail quietly. Traffic that falls back to a public route still works. Nothing alerts. Test each path deliberately.

**Check DNS from each network.** From an engine host and from a Polaris host, resolve the storage hostname, the STS hostname, and the Polaris hostname. Private routes resolve to private IP ranges. For S3 gateway endpoints, the hostname still resolves to public S3 addresses, and the route table sends the traffic through the endpoint, so check the route table instead of the DNS answer. For interface endpoints and Azure or Google private endpoints, a public IP in the answer means the private DNS zone is not linked to that network.

**Prove the credential path works without internet.** Load a table from an engine with vended credentials requested. If Polaris cannot reach the token service, the load fails with a credential error. Then confirm in your cloud's audit logs, such as CloudTrail for STS `AssumeRole` calls, that the calls came through the private endpoint.

**Prove the data path is private.** In S3 server access logs or CloudTrail data events, check that reads from engines carry your VPC endpoint IDs. On Azure, storage logs show whether requests arrived over private endpoints. On Google Cloud, VPC Service Controls logs record perimeter decisions.

**Prove leaked credentials fail.** This is the test most teams skip and the one that matters most. Capture a set of vended credentials from a test engine, then try to use them from a machine outside the private network, such as a laptop. The request should fail with access denied from the network-bound policy, not succeed because the credentials are valid. If it succeeds, the design has a hole, no matter how many private endpoints exist.

**Prove administrative access still works.** Assume the break-glass role and confirm it reaches the bucket. Then confirm that using it raises the alert you configured.

Run these tests again after any network change, new VPC, new region, or new engine platform. The most common regression is a new compute environment added without its own private route, quietly falling back to a public path.

## Failure Modes and Warning Signs

Private lakehouse networks fail in recognizable ways. Most of them trace back to one path that was not planned.

**Credential vending failures after locking down Polaris.** Polaris moves into a subnet without internet access, and table loads start failing with credential errors. The credential path lost its route to the token service. The sign is errors mentioning STS, Entra ID, or Google token endpoints in Polaris logs. Add the private route or controlled egress for the token service, and on AWS set `stsEndpoint` to the regional endpoint.

**Global versus regional STS.** AWS clients sometimes default to the global STS endpoint, which does not resolve to an interface endpoint in your VPC. The sign is STS calls timing out from a VPC that has an STS interface endpoint. Use regional STS endpoints explicitly.

**Polaris blocked by its own bucket policy.** A network-bound bucket policy lists the engines' VPC endpoints and forgets the one Polaris uses. Commits fail when Polaris tries to write metadata files. The sign is commit errors with access denied on metadata paths, while reads work. Include every endpoint that carries catalog or maintenance traffic.

**Engines ignoring the client-visible endpoint.** Some engine configurations set their own S3 endpoint and ignore the one Polaris returns with a table load. The sign is data reads showing up without VPC endpoint IDs, or failing under the bucket policy, from engines whose network looks correct. Check the engine's file IO configuration for hard-coded endpoints.

**Split DNS drift.** A new virtual network or VPC is added, and nobody links it to the private DNS zones. Engines there resolve storage to public addresses. Under a network-bound policy, their reads fail. Without one, they quietly succeed over the public path. The sign is inconsistent behavior between environments that run the same job.

**Maintenance jobs outside the perimeter.** Compaction, snapshot expiration, and orphan file cleanup often run on different infrastructure from query engines. The sign is maintenance jobs failing with access denied after a lockdown, or table health degrading because maintenance silently stopped.

**NAT charges that never went away.** A private subnet reaches S3 through a NAT gateway because no gateway endpoint exists. Everything works, and the data processing charges accumulate on the NAT gateway. The sign is a large NAT gateway bill in a VPC that mostly talks to S3.

**Cross-region reads through private paths.** Traffic is private, but engines read from buckets in another region. The sign is inter-region data transfer charges that grow with query volume. Move compute or replicate data.

## Remote Signing and Pre-Signed URLs Follow the Same Rules

Vended credentials are not the only way a catalog grants storage access. The Iceberg REST protocol also supports remote signing, and the Iceberg community is working on catalog-issued pre-signed URLs for file references. Each changes the flow a little. None changes the network conclusion.

**Remote signing** keeps storage credentials inside the catalog. The engine builds each storage request, sends it to the catalog's signing endpoint, receives a signature, and sends the signed request to storage. That adds a signing call per request on the control path, which makes the control path's latency and availability more important. The data path is still engine to storage, directly. A network-bound bucket policy still applies, because S3 evaluates the policy on the signed request when it arrives. A signed request replayed from outside the private network is denied. I cover when remote signing is worth its overhead in [Iceberg Remote Signing for Regulated Datasets](https://datalakehousehub.com/blog/iceberg-remote-signing-regulated-datasets).

**Pre-signed URLs** are ordinary HTTPS links with a time-limited signature in the query string. They are attractive for consumers that should not hold cloud credentials at all, such as model servers fetching media. They are also the easiest access grant to leak, since a URL gets logged, pasted, and forwarded far more casually than a credential. The same bucket policy protects them. A pre-signed request is evaluated against the bucket policy like any other, so a pre-signed URL opened from outside the allowed endpoints fails.

This consistency is the strongest argument for putting the network condition on the storage side. Access models will keep evolving. Credential vending, remote signing, and pre-signed URLs each have their place, and a lakehouse often uses more than one. A storage policy that requires the request to come through your private network protects all of them at once, without depending on how each grant was issued.

It also changes the risk calculation for the catalog itself. When storage enforces the network boundary, a compromise that tricks the catalog into issuing a grant to the wrong party still yields a grant that only works from inside your network. Defense in depth here means the catalog decides who, and the network decides where.

## A Checklist for Each New Engine

Most private network regressions arrive with a new compute environment: a new Spark cluster, a new team's notebooks, a new inference service. A short checklist, run before the environment goes live, prevents most of them.

**Where does it run?** Name the VPC, virtual network, or on-premises network. If it is new, it needs its own storage route, its own private DNS links, and a place in the storage policy.

**How does it reach storage?** Confirm a gateway endpoint, private endpoint, or Private Service Connect path exists for its network. Confirm that its storage endpoint ID or network is on the allow list in the network-bound policy.

**How does it reach Polaris?** Confirm it resolves the Polaris hostname to a private address and that security groups or network rules allow the connection.

**Which storage endpoint will it use?** Confirm the engine accepts the client-visible endpoint Polaris returns, or that its own configuration points at the same private route. Look for hard-coded endpoints in its file IO settings.

**How does it authenticate?** Confirm it reaches the token endpoint for its credentials, whether Polaris's own or an external identity provider, over a private or controlled path.

**Does the leaked-credential test fail from outside?** Run it once for the new environment before production traffic starts.

Six questions, ten minutes each. That is cheaper than finding out from an audit log that a new cluster spent a month reading tables over a public path.

## Operational Guidance

Here is a practical sequence for moving an existing Polaris lakehouse onto private paths.

**Map the paths first.** For each engine, maintenance job, and Polaris deployment, list which networks it runs in and how it currently reaches storage, the token service, and the catalog. The table at the top of this article is a good template. Most gaps show up on paper.

**Add private routes before adding restrictions.** Create storage endpoints, token service routes, and private DNS zone links first. Confirm through logs that traffic now uses them. Only then add the network-bound storage policy. Doing it in the other order causes outages.

**Stage the storage policy.** On AWS, start with a copy of the bucket policy that denies only a single test prefix, confirm behavior, then widen it to the whole bucket. On Azure and Google Cloud, use the equivalent dry-run or audit modes where they exist, such as the dry-run mode for VPC Service Controls perimeters.

**Set Polaris endpoints explicitly.** Configure `stsEndpoint` for the regional token service on AWS. Set `endpoint` and `endpointInternal` whenever engines and Polaris reach storage through different routes. Explicit configuration survives future network changes better than defaults.

**Keep a break-glass path.** Every network-bound policy needs a controlled exception for recovery. Protect it with strong authentication and alert on every use.

**Run the leaked-credential test on a schedule.** Automate it. A monthly job that captures a vended credential and confirms it fails from outside the network catches regressions that manual reviews miss.

**Watch transfer costs per path.** Track NAT processing, inter-region transfer, and cross-cloud egress separately. Private networking tends to lower the first. Architecture decides the other two.

## Where This Is Heading

Two trends are pushing this topic up the priority list for lakehouse teams.

The first is the growth of catalog-issued access. Vended credentials, remote signing, and pre-signed URLs all move authorization into the catalog and take the catalog out of the data path. That design scales well, and it makes storage-side network controls the natural complement. Expect reference architectures from catalog projects and cloud providers to pair the two by default.

The second is the spread of consumers. AI inference services, partner organizations reading shared tables, and engines in other clouds all want direct storage access. Each one is a new network path. The catalog decides whether they get access. The network design decides whether that access stays inside the boundary you intended.

For Polaris specifically, the client-visible and internal endpoint split already supports these topologies. The remaining work is mostly documentation and defaults, so that teams do not discover the credential path the day they remove internet access from a subnet.

There is also a governance angle worth watching. Security reviews increasingly ask where a credential works, not only who holds it and for how long. A lakehouse that can answer "vended credentials only work through these endpoints, and here is the test that proves it" passes those reviews faster. Network-bound storage policies turn that answer into a documented, testable property of the platform instead of a hope about how credentials are handled.

## Conclusion

A Polaris lakehouse has five network paths: identity, control, credential, metadata, and data. Credential vending takes the catalog out of the data path, so making Polaris private protects only the control path. Private networking has to cover all five, including Polaris's route to the cloud token service, which is the one teams forget most often.

The control that matters most is on the storage side. Bucket policies on `aws:SourceVpce`, storage account network rules on Azure, and VPC Service Controls on Google Cloud reject requests from outside your network, even when the credentials are valid. That turns a leaked vended credential, remote-signed request, or pre-signed URL into a failed request.

Polaris's `endpoint`, `endpointInternal`, and `stsEndpoint` settings let engines and the catalog use different private routes to the same storage. And private links remove public exposure without making cross-region or cross-cloud transfer free, so keep compute close to data and budget for the paths that must cross.

## Keep Going

If this piece was useful, I have written a lot more on running Apache Polaris securely in production. *Apache Polaris: The Definitive Guide* covers catalog storage configuration, credential vending, and the RBAC model that decides who gets access before the network decides where. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
