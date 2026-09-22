---
title: "What Iceberg v4's Proposed FILE Type Means for Multimodal Tables"
date: "2026-09-21"
description: "Iceberg v4's proposed FILE type brings first-class media references to tables, via Parquet's FILE logical type, ranges, checksums, and pre-signed URLs."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Iceberg v4
  - Multimodal
  - FILE type
canonical: https://iceberglakehouse.com/posts/iceberg-v4-file-type-multimodal-tables/
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-v4-file-type-multimodal-tables/).

A product catalog table has two million rows. Each row has a SKU, a price, a category, and three product photos. The photos live in an object storage bucket, and the table stores their paths as plain strings. An AI team wants to run a vision model over every photo in one category to generate alt text.

The query that finds the rows takes a second. Everything after that is custom code. Somebody has to parse the path strings, figure out whether they are absolute or relative, decide which credentials open that bucket, fetch the images, and hope none of them were moved since the row was written. There is no checksum to tell whether the image is the one the row was written against. There is no content type to tell whether a path points at a JPEG or a PDF. The table knows the photo exists only as a string that happens to look like a URI.

The Apache Iceberg community is working to fix this at the format level. A proposal filed in September 2026 as Iceberg issue #17919 adds a `file` primitive type to the v4 table spec. It builds on the `FILE` logical type that shipped in Parquet Format 2.14.0 the same month. Together they give tables a first-class way to say "this value is a range of bytes, stored here or over there, with this type and this checksum."

This article walks through both specs field by field. It covers how Iceberg reserves field IDs for the type, which statistics engines can prune on, and what the specs deliberately leave undefined. It also covers the parallel catalog work on pre-signed URLs, which is how an engine or an inference service will actually fetch the bytes a `file` value points to.

## Three Bad Ways to Put Media in a Table

Before the proposal, teams that wanted media next to structured data picked from three patterns. Each one fails in a specific way.

**Pattern one: store the bytes in a binary column.** Put the image, audio clip, or PDF directly into a `binary` column. This keeps everything in one table, and snapshots cover the media along with the metadata. The cost shows up in the file layout. Parquet stores data in row groups and pages sized for columnar scans. A column of 2 MB images turns a row group into a mostly-media blob. Queries that only want the SKU and price still have to plan around those huge column chunks. Compaction rewrites the images every time it rewrites the small columns. Memory pressure rises in every engine that materializes the column, even briefly. Binary columns work for small payloads such as thumbnails or short embeddings serialized as bytes. They break down fast for real media.

**Pattern two: store paths as strings.** This is what most teams do today. The table stays small and scans stay fast. But the table has no idea the string is a reference. Nothing records the size, the type, or a checksum. Nothing says whether a relative path resolves against the table location or somewhere else. Engines cannot apply any special handling, because to them it is just a string. Every consumer writes its own resolution logic, and those implementations drift apart. When the referenced objects move, nothing notices until a fetch fails.

**Pattern three: use a separate format for the media.** Some teams keep multimodal data in a format designed for it, such as Lance, and pair it with Iceberg for the structured side. That is a legitimate architecture, and I compare the two formats in [Lance and Iceberg for Multimodal AI Data](https://iceberglakehouse.com/posts/2026-05-24-lance-iceberg-multimodal/). But it means two formats, two sets of tooling, and a join between them. For teams whose core need is "reference external objects from an Iceberg table, reliably," a second format is a lot of machinery.

The FILE type targets the gap in pattern two. It keeps the small-table, reference-based layout that makes pattern two scale. It adds the structure that pattern two lacks: explicit fields for location, range, type, and integrity. And it keeps an escape hatch for pattern one, because a value can hold its bytes inline when they are small.

## The Parquet FILE Logical Type

The Iceberg proposal does not invent its own semantics. It points at Parquet. The Iceberg spec text in the proposal says the `file` type and its value semantics are defined by the `FILE` logical type in the Parquet project. So the Parquet definition is the place to start.

Parquet Format 2.14.0 was announced on September 11, 2026. Its release notes list three items: chronological ordering for INT96 timestamps, the ALP (Adaptive Lossless floating-Point) encoding, and the new `FILE` logical type. The FILE type came from pull request #585 in the parquet-format repository, with a follow-up in #603 that removed a self-reference case.

In Parquet, `FILE` is an annotation on a group, the same way `LIST` and `MAP` annotate groups. The group has up to six fields, identified by name.

| Field | Parquet type | Meaning |
|---|---|---|
| `uri` | STRING | An RFC 3986 URI reference to an external object, absolute or relative |
| `offset` | INT64 | Start of the byte range within the referenced object |
| `size` | INT64 | Length of the byte range |
| `content_type` | STRING | MIME type of the resolved bytes, such as `image/png` |
| `checksum` | STRING | Integrity token in the form `<algorithm>:<digest>` |
| `inline` | BYTE_ARRAY | The bytes themselves, stored in the value |

Every field is optional, both in the schema and in each value. A writer defines only the fields it uses. An inline-only column can define just `inline` and `content_type`. An external-only column can define just `uri`, `content_type`, and `checksum`.

The resolution rules are strict, and they are the most important part of the spec. A value resolves to bytes based on which of `inline`, `uri`, `offset`, and `size` are set.

If `inline` is set, the value resolves to the inline bytes. Locator fields set alongside it record where those bytes came from, and a reader can use either source.

If only `uri` is set, the value resolves to the whole external object.

If `uri` and `size` are set, the value resolves to the first `size` bytes of the object.

If `uri`, `offset`, and `size` are all set, the value resolves to the byte range from `offset` to `offset + size`.

Every other combination is invalid. An `offset` without a `uri` is invalid. An `offset` without a `size` is invalid. A value with neither `inline` nor `uri` resolves to nothing and is invalid. The spec lets a reader return null for an invalid reference rather than failing the whole read.

The range support is what makes this more than a path column. Many media workloads pack small objects into larger container files to avoid object storage overhead on millions of tiny files. With `offset` and `size`, a row can point at one frame inside a video archive, one page inside a PDF bundle, or one record inside a TAR shard. The reader issues a ranged GET for exactly those bytes.

The checksum field has a defined set of algorithms: `ETAG`, `MD5`, `CRC32`, `CRC32C`, and `SHA-256`. All except `ETAG` use lowercase hex digests. `ETAG` is special. It carries the object store's opaque entity tag, which applies to the whole object rather than the resolved range, and which readers compare for equality without interpreting it. Readers ignore algorithms they do not recognize.

Two more rules round out the definition. A `uri` always resolves as an external reference, even if it names the file that contains it. There is no way to address a byte range inside the current Parquet file. And Parquet applies no compression or encryption of its own to the referenced external bytes. The group's fields are ordinary columns, so they get encoded, compressed, and encrypted like any other column, `inline` included. The external object is a separate thing that Parquet only points at.

## How Iceberg Maps FILE Into a Table Schema

The Iceberg side of the proposal is authored by Talat Uyarer, Alex Stephen, Sung Yun, and Gaurav Soni. It arrives as three linked pieces: the tracking issue #17919, a spec pull request #17918, and a reference implementation in pull request #17821. The spec change targets v4 only. The draft text states that writing a `file` into a v3 or earlier schema is invalid.

The core design decision is that `file` is a primitive type with implicit sub-fields. In the Iceberg schema, a column is declared as type `file`, and that is all the schema says. The six sub-fields are fixed by the spec. They do not appear in the schema, and they cannot be added, removed, reordered, or promoted. In JSON schema serialization, the type is written as the plain string `"file"`.

That sounds like a detail, but it solves a real problem. Iceberg tracks every column by field ID, and statistics, projection, and schema evolution all key off those IDs. A struct-shaped type needs IDs for its children, and those IDs normally appear in the schema. The proposal handles this with reserved offsets from the parent's ID.

| Sub-field | ID offset | Iceberg type |
|---|---|---|
| `uri` | +1 | `string` |
| `offset` | +2 | `long` |
| `size` | +3 | `long` |
| `content_type` | +4 | `string` |
| `checksum` | +5 | `string` |
| `inline` | +6 | `binary` |

Adding a `file` column reserves seven IDs: the column's own ID plus six consecutive IDs for the sub-fields. If a table's `last-column-id` is 40 and you add a `file` column, the column gets ID 41, its `uri` gets 42, and so on through `inline` at 47. The writer must advance `last-column-id` past all seven and must never assign those IDs to anything else.

This design keeps the schema small and stable. It also means every engine, in every language, computes the same sub-field IDs from the same parent ID without reading anything extra. Projection by field ID works for sub-fields the same way it works for regular columns.

The draft maps the type into each data file format.

In Parquet, a `file` column is a group annotated with the `FILE` logical type. Its sub-fields must carry field IDs matching the reserved offsets.

In Avro, a `file` is a record with the sub-fields. Avro has no FILE logical type, so type identity comes from the Iceberg schema rather than the data file.

In ORC, a `file` is a struct with the sub-fields and a type attribute `iceberg.struct-type` set to `FILE`. Sub-fields must be assigned and accessed by field ID.

The proposal also lists what a `file` column cannot do, and these restrictions tell you a lot about the intended use.

A `file` column cannot have a non-null `initial-default` or `write-default`. It joins `variant`, `geometry`, `geography`, and `unknown` in that rule.

No type promotion exists to or from `file`. You cannot evolve a `string` path column into a `file` column in place. Migration means adding a new column and backfilling it.

Whole-value equality, ordering, and hashing are undefined. Two `file` values are not compared as units.

A `file` column cannot be an identifier field, and it cannot be the source for a partition transform or a sort order.

A `file` is not interchangeable with a `struct`. A struct that happens to have the same six fields is not a `file`. Type identity comes from the schema declaration.

And the behavior for a `file` value that references a non-existent object is explicitly not defined.

Each restriction closes off a behavior that does not make sense for a reference. Partitioning by a blob reference is meaningless. Equality between two references raises an unanswerable question: are two values equal because they point at the same URI, or because they resolve to the same bytes? The spec avoids the question by not defining it. Defaults are ruled out because a default reference that every row shares is almost always a bug.

## Statistics, Pruning, and What You Can Filter On

Iceberg's planning power comes from per-file column statistics in manifests. The proposal defines how those work for `file` columns, and the definition connects to another v4 change.

A `file` value has no whole-value statistics. Instead, each sub-field's statistics are tracked in `content_stats` under the sub-field's reserved ID, like any other field of that sub-field's type. The `content_stats` structure is part of the v4 metadata redesign, which moves column statistics into a typed, columnar form in Parquet-based manifests. The draft says writers should produce statistics for `uri`, `content_type`, and `inline`, and can omit the others.

That list tells you what the designers expect engines to prune on.

Statistics on `content_type` let a planner skip data files whose values are all `image/jpeg` when the query asks for `application/pdf`. For tables that mix media types, this is the most useful filter. A query like "run the document parser over every PDF" skips most of the table at planning time, before any data file opens.

Statistics on `uri` give lower and upper bounds on the URI strings in each file. Because URIs usually share prefixes by bucket and path, those bounds support pruning by location. A query that targets objects under one prefix, such as one customer's upload folder, skips data files whose URI ranges fall entirely outside it.

Statistics on `inline` are less about pruning and more about sizing. Engines use them to spot data files carrying large inline payloads.

The omitted fields make sense too. Bounds on `offset` and `size` rarely help planning. Checksums are high-entropy strings where bounds prune nothing.

The practical takeaway is to sort your writes with pruning in mind. If most queries filter by media type, cluster data files by `content_type`. If most queries filter by source location, cluster by `uri` prefix. Since `file` columns cannot drive partition transforms or sort orders directly, the clustering has to come from other columns that track the same thing, such as a `media_type` string column or a `source_prefix` column that you partition on. Plan for those companion columns when you design the table.

## Resolution Rules and the Questions the Spec Leaves to You

A reference type raises questions a normal column never does. The specs answer some of them precisely and leave others to engines and operators on purpose.

**Relative URIs.** The Iceberg draft allows `uri` to hold absolute or relative references. It rules out path traversal conventions such as `.` and `..`. Relative paths resolve against the table location, following the path resolution rules that v4 introduces for metadata paths. A relative reference `images/sku-1001.jpg` in a table at `s3://catalog-bucket/products/` resolves to `s3://catalog-bucket/products/images/sku-1001.jpg`.

This choice matters for table moves. A table whose media sits under its own location and uses relative references can be copied or relocated with its media, and the references keep working. A table with absolute references pins every row to one bucket. If your media lives inside the table location, write relative URIs. If it lives in a shared media bucket, absolute URIs are the honest choice, and relocation becomes a rewrite.

**Dangling references.** The spec states that behavior for a reference to a non-existent object is undefined. Iceberg's snapshot model does not cover external objects. Expiring a snapshot does not delete the referenced media, and deleting media does not update the table. Garbage collection of referenced objects is your job, and so is deciding what a query does when a fetch fails.

**Integrity.** The checksum field gives you a way to detect that a referenced object changed after the row was written. The spec does not require engines to verify it. Treat verification as a policy decision. For training datasets where reproducibility matters, verify on every fetch. For interactive browsing, skip it.

**Encryption.** Parquet encrypts the reference columns like any other column when modular encryption is on. It does nothing for the external object. If the media is sensitive, protect it at the storage layer, with bucket encryption and access policies, or encrypt the objects yourself. A table that encrypts its `uri` column but leaves the referenced images in an open bucket protects the list of secrets while leaving the secrets themselves exposed.

**Trust.** A `uri` value tells a reader where to fetch bytes, often with credentials in hand. That makes it input, not configuration. Whoever writes rows into the table chooses where every reader will connect. The Parquet project just handled a vulnerability rooted in the same pattern: CVE-2026-73334 involved a KMS URL stored in a Parquet footer that readers passed to a KMS client without validation. For FILE columns, the equivalent guard is an allow list of schemes and hosts that readers will fetch from. The spec does not mandate one. Your fetch layer needs one anyway.

## Getting the Bytes: Credentials, Signing, and Pre-Signed URLs

A reference is only useful if something can fetch what it points at. That part is not in the type proposal. It is in a separate discussion about how the Iceberg REST catalog delegates storage access, and the two efforts are now moving together.

Today, the REST catalog spec gives clients two ways to get storage access, selected with the `X-Iceberg-Access-Delegation` request header.

**Vended credentials.** The catalog returns short-lived storage credentials scoped to the table's location. The engine uses them to read and write files directly. I walk through this flow in detail in [How Iceberg Catalogs Hand Engines Storage Access](https://iceberglakehouse.com/posts/iceberg-vended-credentials/).

**Remote signing.** The engine sends each storage request to the catalog's signing endpoint, the catalog signs it, and the engine sends the signed request to storage. Credentials never leave the catalog. The [remote signing write-up](https://iceberglakehouse.com/posts/iceberg-remote-signing-regulated-datasets/) covers why regulated teams prefer this model.

Both were designed for the table's own files. FILE references break that assumption in two ways. The referenced objects often live outside the table location, in a shared media bucket, so credentials scoped to the table do not cover them. And the consumer of the bytes is frequently not the query engine at all. It is an inference service, a model server, or a browser, and none of those should hold cloud credentials or implement a signing protocol.

The natural answer is the pre-signed URL. A pre-signed URL is an ordinary HTTPS link that carries a time-limited signature in its query string. Anyone holding it can GET the object until it expires, with no credentials and no SDK. Every major object store supports them.

The Iceberg dev list has been working through this in a thread titled "Proposal: File-Level Access Delegation in the Iceberg REST Catalog Spec." A September 12, 2026 message from Sung Yun, one of the FILE type authors, lays out the current state. The discussion identified three scenarios.

In the first, a scan planning response from the catalog returns pre-signed URLs in place of native storage locations. The client reads files through those URLs directly.

In a variant of the first, the plan response returns unsigned locations, and the client's file IO layer contacts the catalog's signing service to get pre-signed URLs before reading.

In the second, a client doing normal client-side planning asks the signing service for pre-signed URLs as it needs them.

The thread agreed that the first scenario needs no spec change on the client side. The server already controls what locations it returns in a plan response. Sung Yun opened pull request #18079 to implement client support for pre-signed URLs returned that way, following earlier work by William Hyun in pull request #17457. That earlier PR added a seekable, range-reading HTTP input path to Iceberg core, so a reader can fetch byte ranges from a pre-signed URL the same way it reads from native object storage.

For the case where a client asks the catalog to sign URIs, including external FILE references, a companion pull request #18080 proposes a small change to the existing `/sign` endpoint. It adds `presigned-urls` as a new value for the `X-Iceberg-Access-Delegation` header, reusing the header instead of inventing a new mechanism. Batch signing, where a client submits a list of URIs in one call, came up as a follow-up once the single-request shape is settled.

Two open questions from the thread shape how this lands.

**Expiry and refresh.** A remotely signed request is minted and used immediately. A pre-signed URL is reused across its lifetime, and a long scan or a slow inference batch can outlive it. The earlier proposal included a TTL field in the signing response so clients can refresh proactively. The alternative is parsing each provider's expiry out of the URL's query parameters, which means provider-specific parsing code. The current PR sets TTL aside for simplicity. It assumes the catalog administrator communicates expiry out of band and the client uses a URL until it fails.

**Cloud differences.** Earlier in the thread, a participant pointed out that header-based remote signing carries a fixed 15-minute validity window on AWS and GCS, and that Azure Blob Storage does not support that header-based signing model the same way. Pre-signed URLs, with configurable expiry on each cloud, sidestep part of that mismatch. This is one reason the pre-signed route has momentum for FILE references specifically.

The architectural point is the one to hold on to. A pre-signed URL minted by the catalog carries the catalog's authorization decision. The catalog checks whether the caller can read the table, and by extension its referenced objects, and only then signs. The inference service that receives the URL needs no identity of its own in the storage account. Governance stays in one place.

## The Query-Then-Fetch Architecture

Put the pieces together and a clean pattern appears for multimodal workloads on Iceberg. I call it query-then-fetch.

**Step one: query the table.** An engine runs SQL over the structured columns and the `file` sub-fields. It filters on business columns, on `content_type`, and on URI prefixes. Planning prunes with manifest statistics. The engine returns a small result: row keys plus `file` values.

**Step two: authorize and sign.** For each `file` value whose bytes are needed, a client asks the catalog for access. Depending on the scenario, the catalog either already returned pre-signed URLs in the plan, or signs the requested URIs on demand. The catalog applies its access policy at this moment.

**Step three: fetch outside the engine.** The consumer, often a model server, fetches bytes directly from object storage with the pre-signed URLs. It uses ranged GETs when `offset` and `size` are set. It verifies `checksum` when policy requires it. The query engine never moves the media.

**Step four: write results back.** The model's outputs, such as captions, labels, embeddings, or extracted text, go back into Iceberg as ordinary columns, joined to the source rows by key.

This pattern keeps each system on the work it does well. The table format tracks what exists and what it means. The catalog decides who can see what. Object storage serves bytes at scale. The model server spends its time on inference instead of I/O plumbing.

It also changes the cost profile. In the binary-column pattern, every scan that touches the media column moves media through the engine. In query-then-fetch, the engine moves kilobytes of references, and only the objects a workload truly needs ever leave storage. For a catalog of two million products where one job needs 40,000 photos, the engine moves 40,000 small reference rows instead of scanning 2 million images.

Inline values fit this pattern as a shortcut. Thumbnails, icons, or short audio snippets small enough to store inline come back with the query result, and step two and three are skipped for them. The type supports both in one column, which lets a writer decide per value. A reasonable rule is to inline anything under a few kilobytes and reference everything else.

## A Walkthrough: Shaping Your Data for FILE Today

The Iceberg `file` type is a v4 proposal under review, and engine support will take time to land after the spec settles. You cannot declare a `file` column in a production table today. You can prepare for it, and the preparation is useful on its own, because it replaces bare path strings with structured references that your fetch code can trust.

Start with the target shape. This is the Parquet schema for a FILE-annotated group that defines every field, taken from the Parquet specification.

```
optional group my_file (FILE) {
  optional binary uri (STRING);
  optional int64 offset;
  optional int64 size;
  optional binary content_type (STRING);
  optional binary checksum (STRING);
  optional binary inline;
}
```

Every field is optional, and the field names are fixed. The `(FILE)` annotation on the group is what makes it a FILE value rather than an ordinary struct. Current writers such as PyArrow do not emit that annotation yet, so the code below writes a plain struct with the same field names, types, and field IDs. Keep the distinction clear. Under the Iceberg draft, a struct with the same sub-fields is not a `file`. When your engines support the type, you add a real `file` column and backfill it from this struct. Having the data already in the right shape turns that backfill into a straight copy.

The script builds reference records for product photos in S3, including content type and a SHA-256 checksum, and stores small objects inline. It then shows a fetch function that resolves a reference the way the spec describes.

```python
import hashlib
import mimetypes
from urllib.parse import urlparse

import boto3
import pyarrow as pa
import pyarrow.parquet as pq
import requests

s3 = boto3.client("s3")
MEDIA_BUCKET = "acme-product-media"
ALLOWED_BUCKETS = {"acme-product-media"}
INLINE_LIMIT = 4096  # bytes
PHOTO_FIELD_ID = 41  # sub-fields use 42 through 47, per the reserved offsets


def fid(n):
    return {b"PARQUET:field_id": str(n).encode()}


photo_type = pa.struct([
    pa.field("uri", pa.string(), metadata=fid(PHOTO_FIELD_ID + 1)),
    pa.field("offset", pa.int64(), metadata=fid(PHOTO_FIELD_ID + 2)),
    pa.field("size", pa.int64(), metadata=fid(PHOTO_FIELD_ID + 3)),
    pa.field("content_type", pa.string(), metadata=fid(PHOTO_FIELD_ID + 4)),
    pa.field("checksum", pa.string(), metadata=fid(PHOTO_FIELD_ID + 5)),
    pa.field("inline", pa.binary(), metadata=fid(PHOTO_FIELD_ID + 6)),
])

schema = pa.schema([
    pa.field("sku", pa.string(), nullable=False, metadata=fid(1)),
    pa.field("media_type", pa.string(), metadata=fid(2)),
    pa.field("photo", photo_type, metadata=fid(PHOTO_FIELD_ID)),
])


def describe(key):
    body = s3.get_object(Bucket=MEDIA_BUCKET, Key=key)["Body"].read()
    ctype = mimetypes.guess_type(key)[0] or "application/octet-stream"
    ref = {
        "uri": f"s3://{MEDIA_BUCKET}/{key}",
        "offset": None,
        "size": len(body),
        "content_type": ctype,
        "checksum": "SHA-256:" + hashlib.sha256(body).hexdigest(),
        "inline": body if len(body) <= INLINE_LIMIT else None,
    }
    return ctype, ref


rows = []
for sku, key in [("SKU-1001", "photos/sku-1001/front.jpg"),
                 ("SKU-1002", "photos/sku-1002/icon.png")]:
    ctype, ref = describe(key)
    rows.append({"sku": sku, "media_type": ctype, "photo": ref})

pq.write_table(pa.Table.from_pylist(rows, schema=schema), "product_photos.parquet")


def fetch(ref):
    if ref["inline"] is not None:
        return ref["inline"]
    if not ref["uri"]:
        raise ValueError("reference has neither inline bytes nor a uri")

    loc = urlparse(ref["uri"])
    if loc.scheme != "s3" or loc.netloc not in ALLOWED_BUCKETS:
        raise PermissionError(f"refusing to fetch from {ref['uri']}")

    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": loc.netloc, "Key": loc.path.lstrip("/")},
        ExpiresIn=900,
    )

    headers = {}
    if ref["offset"] is not None:
        start = ref["offset"]
        end = start + ref["size"] - 1
        headers["Range"] = f"bytes={start}-{end}"
    elif ref["size"] is not None:
        headers["Range"] = f"bytes=0-{ref['size'] - 1}"

    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()
    data = resp.content

    algo, _, digest = (ref["checksum"] or "").partition(":")
    if algo == "SHA-256" and hashlib.sha256(data).hexdigest() != digest:
        raise ValueError(f"checksum mismatch for {ref['uri']}")
    return data
```

Here is what each part does and why.

The field IDs follow the reserved-offset scheme from the Iceberg draft. The photo column takes ID 41 and its sub-fields take 42 through 47 in spec order. PyArrow writes the `PARQUET:field_id` metadata into the Parquet schema, which is how Iceberg identifies columns. If you later add a real `file` column, its IDs come from the table's `last-column-id`, so they will differ. The point here is to practice the layout, not to predict the numbers.

The `media_type` column duplicates `content_type` at the top level on purpose. A `file` column cannot drive a partition transform or a sort order under the draft. A plain string column can. Partition or sort on `media_type`, and planning prunes by type even before `content_stats` support arrives in your engine.

The `describe` function sets `size` and leaves `offset` empty. Under the resolution rules, `uri` plus `size` resolves to the first `size` bytes of the object, which for a whole object is the entire object. Recording the size is what lets a reader detect truncation or replacement later.

The checksum uses the spec's format, `SHA-256:` followed by lowercase hex. This script reads each object to compute the hash, which is fine for a backfill of a few thousand objects and expensive for millions. At that scale, compute checksums in the pipeline that uploads the media, when the bytes are already in memory, or use the `ETAG` algorithm with the object store's entity tag, accepting that it is opaque and applies to the whole object.

Small objects are inlined, and the `uri` is kept alongside. The spec allows both, and it lets a reader use either. Keeping the locator means you can later drop inline bytes to shrink the table without losing the reference.

The `fetch` function mirrors the resolution rules. Inline bytes win. A missing `uri` with no inline bytes is invalid. Byte ranges map directly to HTTP `Range` headers, and HTTP ranges are inclusive, which is why the end offset subtracts one.

The allow list check runs before any signing. This is the trust point from earlier. A reference in a table is input written by whoever wrote the row, and the fetch layer decides where it will connect.

The pre-signed URL here is generated locally with `boto3` for illustration. In the catalog-driven model from the previous sections, this call is replaced by a request to the catalog, which signs only what the caller is allowed to read. The rest of the function stays the same, which is the payoff of the design. The consumer only ever handles an HTTPS URL.

## Failure Modes and Warning Signs

A reference type moves some problems out of the table and into the space between the table and storage. These are the ones to plan for.

**Orphaned media.** Snapshot expiry and orphan file cleanup in Iceberg cover files the table owns. They do not touch referenced objects. Rows get deleted, snapshots expire, and the images they pointed at stay in the bucket forever. The sign is a media bucket that grows while the row count stays flat. The fix is a reconciliation job that lists referenced URIs from current snapshots and compares them to the bucket inventory, with a grace period for time travel.

**Dangling references.** The opposite failure. Someone deletes or moves media that live rows still reference. Because the spec leaves this case undefined, each engine and service decides what happens. Some return nulls, some fail the task. The sign is fetch error rates that climb after storage lifecycle rules run. Keep lifecycle rules on media buckets conservative, and align them with your snapshot retention.

**Silent replacement.** An object gets overwritten in place with new content under the same key. Without a checksum, nothing notices, and a training run quietly uses different images than the dataset version it claims. The sign is not visible at all unless you verify. Record checksums at write time, and verify them for any workload where reproducibility matters.

**Inline bloat.** A writer sets the inline limit too high, or a new source starts sending large payloads, and inline bytes swell the data files. Scans that never touch the photo column slow down because row groups grow. The sign is data file sizes rising while row counts per file fall. The `inline` statistics that the draft asks writers to produce help detect this. Enforce the limit at the writer, not in a style guide.

**Expired URLs mid-job.** A batch inference job receives pre-signed URLs at the start and processes them over two hours. URLs with 15-minute lifetimes fail after the first quarter hour. The sign is a wall of 403 errors partway through a batch. Until the catalog protocol settles on a TTL or refresh story, sign lazily, close to the fetch, rather than signing everything up front.

**Over-broad signing.** A catalog that signs any URI a caller submits becomes a way to read arbitrary objects in its storage accounts. Signing has to apply the same authorization as table reads, and it has to check that each URI is one the caller is entitled to fetch. The sign is a signing endpoint whose access checks only look at the caller, never at the URI. This is a design review item for anyone implementing catalog-side signing for FILE references.

**Untrusted locations.** Rows written by a compromised or careless producer can point readers at hosts outside your control. A fetch layer that follows any URI with credentials attached leaks those credentials. The sign is outbound connections from inference infrastructure to unexpected hosts. Allow-list schemes and buckets in the fetch layer, as the walkthrough does.

## Operational Guidance

You do not need to wait for v4 to get most of the value from this design. Here is how to prepare now.

**Model references as structs today.** Replace bare string path columns with a struct that matches the FILE field names and types. Populate `content_type`, `size`, and `checksum` at write time. This buys you validation and integrity checks immediately, and it makes the eventual migration to a real `file` column a column copy.

**Add companion columns for pruning.** Put the media type and the source prefix in top-level string columns, and partition or sort on them. The `file` type cannot drive partitioning, and these columns will keep doing that job after migration.

**Decide on relative or absolute URIs up front.** If media lives under the table location, write relative references and keep table relocation cheap. If it lives in a shared bucket, write absolute references and accept that moving the media means rewriting rows.

**Set an inline threshold and enforce it.** A few kilobytes is a reasonable starting point. Measure data file sizes after a week of writes and adjust.

**Build one fetch library.** Every consumer that resolves references should use the same code, with the same allow list, range handling, and checksum policy. The walkthrough's `fetch` function is a starting shape. Drift between five hand-written resolvers is how dangling-reference handling ends up inconsistent.

**Plan the access model.** Decide whether consumers will get vended credentials, remote signing, or pre-signed URLs, and which service mints them. If you run a REST catalog, track pull requests #18079 and #18080 in the Iceberg repository, because they define how catalog-issued pre-signed URLs will work.

**Track the spec.** The FILE type proposal is under active review. Field details, statistics rules, and restrictions are the draft's current text, and review can change them. Watch issue #17919 and the Iceberg dev list before building anything that depends on exact behavior.

## Where This Is Heading

The FILE type is part of a broader shift in what a table format is for. Iceberg started as a way to manage large analytical tables on object storage. The v3 spec added variant, geospatial, and row lineage. The v4 work is restructuring metadata into columnar manifests and adding relative paths. A first-class reference type fits that direction: the table becomes the index of everything an organization knows about its data, including data that is not rows.

The pairing with Parquet matters here. Iceberg chose to define `file` by pointing at the Parquet logical type rather than inventing its own semantics. That keeps one definition of what a file reference means across the format stack. Engines that learn to read FILE groups in Parquet get most of the way to supporting Iceberg `file` columns, and the reverse holds too.

The catalog side is where the most interesting design work remains. Once a catalog signs URLs for external references, it becomes the enforcement point for access to unstructured data, not just tables. Batch signing, TTL handling, and URI-level authorization are all open. How those questions settle will decide whether query-then-fetch becomes a standard pattern or stays a set of custom integrations.

For AI workloads, the effect is direct. Vision, audio, and document models need bytes, and data teams need to know which bytes, from which version, under which permissions. A table that records references with types and checksums, a catalog that authorizes and signs, and object storage that serves ranges cover all three.

## Conclusion

The proposed Iceberg `file` type gives tables a real way to reference media and other unstructured objects. It builds on the `FILE` logical type in Parquet Format 2.14.0, which defines six optional fields and strict resolution rules for inline bytes, whole objects, and byte ranges. Iceberg maps that type into v4 schemas with implicit sub-fields, reserves seven consecutive field IDs per column, tracks statistics per sub-field in `content_stats`, and rules out defaults, promotion, equality, partitioning, and sorting on the type.

What the type does not do is fetch anything. That belongs to the catalog, where the community is working on pre-signed URL support so that inference services can fetch referenced bytes without cloud credentials of their own. Together, the two efforts point toward a query-then-fetch architecture where the engine moves references, the catalog authorizes, and storage serves bytes directly to the models that need them.

You can start now. Shape your reference columns like FILE values, record content types and checksums, add companion columns for pruning, and build a single fetch layer with an allow list. When v4 lands in your engines, the migration will be a copy instead of a redesign.

## Keep Going

If this piece was useful, I have written a lot more on how Apache Iceberg's specification and catalogs work. *Apache Iceberg: The Definitive Guide* covers the table format's schema, field ID, and metadata model that the `file` type builds on, and *Apache Polaris: The Definitive Guide* covers the REST catalog and its credential vending in depth. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
