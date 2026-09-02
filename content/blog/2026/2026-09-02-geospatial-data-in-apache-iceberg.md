---
title: "Geospatial Data in Apache Iceberg: Geometry, Geography, and GeoParquet"
date: "2026-09-02"
description: "How Iceberg v3 geometry and geography types, bounding boxes, and native Parquet types give spatial data first-class standing."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Geospatial
  - GeoParquet
  - Geometry
  - Geography
canonical: https://iceberglakehouse.com/posts/geospatial-data-in-apache-iceberg/
---
> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/geospatial-data-in-apache-iceberg/).

A logistics team stores 40 million delivery stops in an Apache Iceberg table. Every row has a latitude and a longitude. The analyst wants every stop inside a polygon that outlines one metro area. The query engine scans every data file in the table, because nothing in the table metadata tells it which files contain points inside that polygon. Forty million rows get read to return two hundred thousand.

That was the normal state of spatial data on the lakehouse for most of a decade. Coordinates lived in two double columns or in an opaque binary column. The table format did not know the column was spatial. The file format did not know either. Every optimization that Iceberg applies to timestamps, integers, and strings, from min/max pruning to partition transforms, simply did not apply.

Iceberg format version 3 changes this by adding two native primitive types: `geometry` and `geography`. Apache Parquet 2.11 added matching logical types at the file level. Together they give spatial data the same standing as any other column: a declared type, a coordinate reference system that travels with the schema, and per-file bounding-box statistics that let an engine skip files before reading a single shape.

This article explains the mechanism. It covers what the two types mean, how coordinate reference systems and edge interpolation are encoded, how bounding boxes are stored and used for pruning, how the Iceberg types relate to Parquet and to the older GeoParquet convention, and what breaks when you deploy this in production. I work at Dremio, which ships Iceberg v3 support, but the material here is spec-level and applies to any engine.

## How Spatial Data Lived in Tables Before v3

Before format version 3, an Iceberg table had no vocabulary for a shape. Teams picked from a short list of workarounds, and every option lost something.

The simplest approach stored longitude and latitude as two `double` columns. This works for points and nothing else. A polygon, a route, or a service boundary cannot fit in two numbers. Min/max statistics on the two columns do give you crude bounding-box pruning for point data, which is why many teams stuck with this pattern for years.

The more general approach stored shapes as Well-Known Binary (WKB) in a `binary` column, or Well-Known Text (WKT) in a `string` column. WKB is the Open Geospatial Consortium (OGC) standard byte encoding for points, lines, polygons, and their multi-part variants. Every spatial library reads it. The problem is that the Iceberg schema saw only `binary`. The manifest recorded byte-wise min and max bounds for the column, which are meaningless for pruning. No engine skipped a file based on those bounds. Every spatial predicate became a full scan followed by row-by-row geometry parsing.

The coordinate reference system (CRS) was the other casualty. A CRS defines how a pair of numbers maps to a location on Earth. Longitude 30, latitude 10 means one place under WGS84 and a completely different place under a projected national grid. With a plain `binary` column, the CRS lived in a wiki page, a column comment, or someone's memory. Two teams writing to the same table with different assumptions produced silent corruption that no validation caught.

Engines with spatial support, such as Apache Sedona, built their own conventions on top of Iceberg to fill the gap. Sedona's Havasu extension added CRS metadata, bounding-box statistics, and format annotations through a fork of Iceberg. This worked for Sedona users but did not travel. A Sedona-written table opened in another engine went back to being bytes.

The v3 spec work pulled these ideas into the standard. The design was driven largely by the Wherobots team, who had run the Havasu approach in production since 2022 and contributed the design upstream to both Parquet and Iceberg. The Parquet logical type proposal collected over 400 review comments. The Iceberg type spec collected 240 more. That review volume is a sign of how many decisions hide inside "just add a geometry type."

## Geometry Versus Geography: Two Types, Two Models of the Earth

Iceberg v3 defines two spatial types rather than one because there are two different ways to compute with coordinates, and mixing them produces wrong answers.

The `geometry` type treats coordinates as points on a flat plane. Distance is Euclidean. A line between two points is straight in the coordinate space. This is the right model for data in a projected CRS such as a state plane or UTM zone, where the projection has already flattened a region of the Earth onto a plane. It is also the right model for non-geographic data such as floor plans, chip layouts, or any coordinate system where "the Earth is round" is not a relevant fact.

The `geography` type treats coordinates as positions on the surface of an ellipsoid or sphere. A line between two points follows a geodesic, the shortest path over the curved surface, rather than a straight line in longitude and latitude. Distance is computed along that surface. This is the right model for global data stored in longitude and latitude, where a "straight" line across a thousand kilometers in planar math bends noticeably away from the true shortest path.

The difference shows up in ordinary queries. Take two airports 8,000 kilometers apart. Planar distance on raw longitude and latitude gives a number in degrees that means nothing. Geodesic distance gives kilometers. Take a polygon that covers Alaska. Under planar math its western edge crosses the antimeridian at longitude 180 and the polygon appears to wrap around the entire planet. Under geographic math the polygon is a small region on a sphere and behaves correctly.

The spec encodes this distinction in the type definitions. `geometry(C)` is parameterized by a CRS `C`. `geography(C, A)` is parameterized by a CRS `C` and an edge-interpolation algorithm `A`. Both default the CRS to `OGC:CRS84`, which means longitude and latitude on the WGS84 datum with longitude first. Geography defaults the algorithm to `spherical`.

The choice between them is not cosmetic. An engine reading a `geometry` column runs Cartesian computations regardless of what CRS string is attached. The spec states this directly: for `geometry`, the CRS does not affect geometric calculations. The CRS is carried as metadata so downstream tools can reproject or display correctly, but the storage layer computes on a plane. If your longitude-latitude data needs correct global distances and containment, `geography` is the type that asks for that.

## Coordinate Reference Systems and Edge Interpolation in the Schema

The CRS parameter is a string, and the spec is deliberate about what that string can and cannot contain.

The recommended form is `<context>:<identifier>`. Examples from the spec are `OGC:CRS84`, `EPSG:4326`, `IGNF:ATI`, and `SRID:0`. The EPSG registry (originally the European Petroleum Survey Group) is the most widely used catalog of CRS definitions, and `EPSG:4326` is the code for WGS84 with latitude-first axis order. `OGC:CRS84` is the same datum with longitude-first order, which matches the WKB convention of X then Y. The default is `OGC:CRS84` for exactly that reason: WKB always stores X (longitude or easting) before Y (latitude or northing), so the default CRS declares the same order.

For a custom CRS that does not have a registry code, the spec allows a reference of the form `projjson:<property-name>`. PROJJSON is the JSON encoding of a CRS definition from the PROJ library. The definition itself goes in a table property under that name, and the type string only points to it. The spec forbids inlining PROJJSON directly into the type string and forbids implementations from parsing the type string as PROJJSON. The reason is size. A full PROJJSON definition runs to kilobytes, and the schema is embedded in every metadata file and every manifest list. Inlining it bloats metadata reads across the whole table.

For `geography`, the CRS has an added constraint: it must be geographic, with longitudes in [-180, 180] and latitudes in [-90, 90]. A projected CRS on a `geography` column is invalid.

The edge-interpolation algorithm `A` on `geography` selects how the engine computes the curve between two vertices. The spec lists five values:

- `spherical`: edges are geodesics on a perfect sphere. Cheapest to compute, accurate to within about 0.3 percent for most distances. The default.
- `vincenty`: Vincenty's iterative formulae on the ellipsoid. Accurate to millimeters, fails to converge for nearly antipodal points.
- `thomas`: Paul Thomas's 1970 spheroidal geodesic method.
- `andoyer`: Thomas's 1965 navigation model, a lower-cost ellipsoidal approximation.
- `karney`: Charles Karney's 2013 algorithm as implemented in GeographicLib. Converges everywhere and is accurate to nanometers.

Most teams never change this from `spherical`. The parameter exists so that two engines reading the same table agree on what "the edge between these two points" means. If a writer computed containment using Karney geodesics and a reader used spherical ones, a point sitting a few meters from a polygon boundary flips between inside and outside depending on who asks. Storing the algorithm in the type removes that ambiguity.

In the schema JSON, the types serialize as strings. A geometry column in a default CRS is written as `"geometry"`. With a custom CRS it becomes `"geometry(srid:4326)"`. A geography column with both parameters looks like `"geography(srid:4326, spherical)"`. Any engine that already parses Iceberg type strings extends its parser to handle the parenthesized parameters.

## What the Type Changes in Metadata, Files, and Partitioning

Adding a type to a table format touches more than the schema. Several rules in the v3 spec exist only because these two types exist.

**Default values are restricted.** Iceberg v3 introduced `initial-default` and `write-default` so a column added later can be populated for old rows without rewriting files. For `geometry` and `geography`, along with `variant` and `unknown`, the spec requires that both defaults be null. A non-null default for a shape column is invalid. This avoids embedding WKB byte strings inside the schema JSON, and it sidesteps the question of what a "default polygon" even means.

**Partition transforms are limited.** The `identity` transform is defined for every primitive type except `geometry` and `geography`. The `bucket` transform's list of valid source types does not include them either. You cannot partition directly on a shape column. The reasons are practical. Identity partitioning on a polygon produces one partition per distinct polygon, which is useless. Bucketing by hash of the WKB bytes scatters spatially adjacent shapes across buckets at random, which defeats the point of spatial locality. Spatial partitioning is done today through derived columns, covered later in this article.

**Physical storage is WKB everywhere.** In Avro, both types map to `bytes` in WKB. In Parquet, both map to `binary`, annotated with the `GEOMETRY` or `GEOGRAPHY` logical type where the writer supports it. In ORC, both map to `binary` with an `iceberg.binary-type` attribute set to `GEOMETRY` or `GEOGRAPHY`, because ORC has no native spatial logical type. Single-value serialization for partition values and bounds uses WKB. JSON serialization, used in places like default values and some REST catalog payloads, uses WKT so the value is human-readable.

**The Parquet logical type is what makes cross-engine reads work.** This point deserves emphasis. If a writer produces a Parquet file with a plain `binary` column and no logical type annotation, a reader that opens that file without the Iceberg schema sees bytes. The PyIceberg implementation notes this explicitly: binary columns cannot be distinguished from geometry without the Iceberg schema metadata. When the writer applies the Parquet `GEOMETRY` logical type, the file itself declares the column as spatial, and any Parquet reader that understands Parquet 2.11 recognizes it. That is the difference between spatial data that works in one engine and spatial data that works everywhere.

**The Parquet logical type also carries the CRS.** Parquet's `GEOMETRY` and `GEOGRAPHY` types have their own CRS field and, for geography, their own edge algorithm field. Iceberg writers set these to match the Iceberg type parameters. A file written for a `geography(OGC:CRS84, karney)` column carries that same CRS and algorithm in its Parquet footer. Readers that trust the Parquet footer and readers that trust the Iceberg schema arrive at the same answer.

## Bounding Boxes: How Files Get Skipped

The most valuable thing the v3 types add is a per-file bounding box that the query planner reads from the manifest. This is the mechanism that turns a 40-million-row scan into a handful of files.

For every primitive column, Iceberg manifests store `lower_bounds` and `upper_bounds`. For an integer column these are the smallest and largest values in the file. For a `geometry` or `geography` column, the spec defines the bounds as two points. The lower bound is a point whose X, Y, and optional Z and M coordinates are each the minimum of that coordinate across every shape in the file. The upper bound is the point of maximums. Together they define the axis-aligned bounding box that contains every object in the file.

Z is elevation and M is a fourth measure such as a milepost or timestamp. Both are optional in WKB. The spec handles missing dimensions carefully. Null or NaN coordinate values are skipped during bound computation. If a dimension has only null or NaN values across the whole file, that dimension is omitted from the box. If either X or Y is missing entirely, no bounding box is produced at all, because a box without both planar axes cannot prune anything.

In v3, the two bound points are serialized as raw binary: an `x:y:z:m` concatenation of 8-byte little-endian IEEE 754 doubles. X and Y are mandatory. The encoding shrinks to `x:y` when Z and M are absent, `x:y:z` when only M is absent, and `x:y:NaN:m` when only Z is absent. The NaN placeholder keeps the byte offsets unambiguous.

In v4, the bounds move into typed structs called `geo_lower` and `geo_upper` inside the new `content_stats` structure. Each struct has required `x` and `y` doubles and optional `z` and `m` doubles. The struct field IDs are assigned by fixed offsets within the column's stats ID range, so a geometry column with field ID 4 gets its lower-bound X at stats ID 10,810 and its upper-bound X at 10,814. The information is the same as v3. The difference is that engines read typed fields instead of parsing a variable-length byte array.

The geography type has one special rule for bounding boxes that catches people out. For `geography` columns, the X value of the lower bound is allowed to be greater than the X value of the upper bound. This encodes a box that crosses the antimeridian at longitude 180. A file containing shapes around Fiji, which straddles that line, gets a lower X of 178 and an upper X of negative 179. Under normal min/max logic that box is empty. Under the geography rule, an object matches if its X satisfies `x >= xmin OR x <= xmax`. The spec ties this to geographic vocabulary: xmin is westernmost, xmax is easternmost, ymin southernmost, ymax northernmost. Bounds are further restricted to the canonical ranges of [-180, 180] and [-90, 90].

For `geometry`, no wraparound applies. The X of the lower bound is always less than or equal to the X of the upper bound, because planar coordinates do not wrap.

When a query arrives with a spatial predicate such as `ST_Intersects(geom, <polygon>)`, the planner computes the bounding box of the query polygon and compares it to each file's stored box. If the boxes do not overlap, the file cannot contain a match and is skipped without being opened. If they do overlap, the file is read and the precise predicate is evaluated row by row. This is the same inclusive-bound logic Iceberg uses for every other type, extended to two dimensions.

The pruning is only as good as the boxes are tight. A file whose shapes are scattered across a continent has a box that overlaps nearly every query. A file whose shapes cluster in one city has a small box that most queries miss. Data layout determines whether the statistics do anything, which is why the operational section of this article spends time on sorting.

## GeoParquet, Native Parquet Types, and Iceberg: Three Layers That Now Line Up

Anyone who has worked with spatial data on object storage has encountered GeoParquet, and the relationship between GeoParquet and the new Iceberg types confuses people. The short version: they solved the same problem at different layers and at different times, and they now converge.

GeoParquet 1.0, standardized in 2022 by the OGC community, defined a convention for spatial data in ordinary Parquet files. Geometry columns were stored as `BYTE_ARRAY` containing WKB. A JSON document under a `geo` key in the file's key-value metadata declared which columns were spatial, what CRS they used, what geometry types they contained, and an overall bounding box. GeoParquet 1.1 added a `covering` option: an extra struct column with `xmin`, `ymin`, `xmax`, and `ymax` per row, so that Parquet's own per-row-group statistics on those four doubles gave engines a way to skip row groups.

This worked and got wide adoption. Its weakness was structural. The geometry column was still a plain binary column. An engine had to opt in to reading the sidecar JSON, and engines built for general analytics rarely did. Table formats had the same problem: Iceberg needed a first-class Parquet type to build interoperable table-level semantics, and sidecar metadata cannot provide that.

Parquet 2.11, released in March 2025, added `GEOMETRY` and `GEOGRAPHY` as logical types in the format specification itself. They annotate a `BYTE_ARRAY` in WKB, carry a CRS and (for geography) an edge algorithm, and produce native column statistics that include a bounding box per column chunk. The Parquet community refers to this direction as GeoParquet 2.0, and the GeoParquet 2.0 specification is written on top of the native types. GeoParquet 2.0 requires geometry columns to use the native logical types, requires them to sit at the root of the schema rather than nested inside structs or lists, and keeps the `geo` metadata key for optional extras the core Parquet spec does not cover.

Iceberg v3 sits above both. The Iceberg schema declares the column type, CRS, and algorithm. The Parquet files carry the matching logical type and per-row-group statistics. The Iceberg manifests carry per-file bounding boxes computed from those files. Three layers, one set of semantics.

| Layer | What declares the column is spatial | Where the CRS lives | Statistics for pruning | Engines need to |
|---|---|---|---|---|
| GeoParquet 1.0 | `geo` JSON key in file metadata | `geo` JSON | File-level bbox only | Parse sidecar JSON |
| GeoParquet 1.1 | `geo` JSON key | `geo` JSON | Row-group stats on `covering` columns | Parse sidecar JSON and know the covering convention |
| Parquet 2.11 native (GeoParquet 2.0) | `GEOMETRY` / `GEOGRAPHY` logical type | Logical type parameter | Native per-column-chunk bbox | Support Parquet 2.11 |
| Iceberg v3 on native Parquet | Iceberg schema type | Type parameter, mirrored in Parquet | Per-file bbox in manifests plus Parquet row-group bbox | Support Iceberg v3 |

The practical consequence is that a GeoParquet 1.x data lake and an Iceberg v3 spatial table are not competitors. GeoParquet files are an input format. You read them with any GeoParquet-aware tool, write the rows into an Iceberg v3 table with a `geometry` or `geography` column, and the Iceberg writer produces native-typed Parquet on the way out. The Sedona documentation makes this argument plainly: Iceberg with native geo types gives you what GeoParquet gave you, plus transactions, schema evolution, and row-level updates.

## How It Fits Together in Practice

A spatial Iceberg table in production has three moving parts: the writer that produces native-typed files, the catalog and manifests that carry the statistics, and the engines that evaluate spatial predicates. Each part has a different maturity level as of late 2026, and knowing where each stands saves you from debugging problems that are really version gaps.

**Writers.** The Java reference implementation shipped the type system, the bounding-box types, and spatial predicates across releases 1.10 and 1.11. The Parquet read and write path that stamps the `GEOMETRY` logical type onto files went through a long review. PyIceberg added `GeometryType` and `GeographyType` in early 2026, stores values as WKB, and gains full GeoArrow extension-type support with CRS and edge metadata when installed with the `geoarrow` extra. Without that extra, PyIceberg writes plain binary columns and relies on the Iceberg schema for type information.

**Catalogs.** Any catalog that stores v3 table metadata handles the new types, because the catalog stores JSON and the types are strings. Apache Polaris, the REST catalog implementation that graduated to an Apache top-level project on February 18, 2026, validates schemas against format version but does not interpret spatial semantics. The same is true of Nessie, Unity Catalog, AWS Glue (which shipped v3 support in November 2025), and every other REST catalog. Catalogs are not where spatial support lives.

**Engines.** Snowflake was the first major engine to ship v3 `geometry` and `geography` on Iceberg tables in 2026. Apache Sedona reads and writes Iceberg spatial columns and has the deepest spatial function library, including CRS-aware transforms and support for CRS forms beyond integer SRIDs. Dremio has GA support for format version 3 in its cloud platform. Spark, Flink, and Trino connector support for spatial types is rolling out release by release, and the honest guidance is to check the specific connector version before moving a production spatial workload. An engine that supports v3 tables in general does not necessarily evaluate spatial predicates or push them down to bounding boxes.

The data flow that works today looks like this. Source shapes arrive as GeoJSON, shapefiles, GeoParquet, or WKT strings. A Sedona or GeoPandas process parses them into geometries in a known CRS. The writer casts them to the Iceberg column type and writes Parquet files with the native logical type and per-row-group bounding boxes. The Iceberg commit records per-file bounding boxes in the manifest. A downstream engine plans a spatial query by comparing the query polygon's box against manifest boxes, opens only overlapping files, and evaluates the exact predicate on the rows.

The one architectural decision that matters more than engine choice is data layout. Files must be spatially coherent for the bounding boxes to prune anything. A table where every file spans the whole world has statistics that are technically correct and practically useless. Layout is covered in detail under operational guidance.

## Walkthrough: Defining, Writing, and Querying a Spatial Table

This section builds a table of delivery stops and service zones and runs a containment query against it. The schema comes first, because seeing the JSON makes the type parameters concrete.

A v3 table metadata file with two spatial columns carries a schema like this:

```json
{
  "type": "struct",
  "schema-id": 0,
  "fields": [
    { "id": 1, "name": "stop_id", "required": true, "type": "long" },
    { "id": 2, "name": "delivered_at", "required": true, "type": "timestamptz" },
    { "id": 3, "name": "location", "required": false, "type": "geography" },
    { "id": 4, "name": "zone_id", "required": false, "type": "string" },
    { "id": 5, "name": "zone_footprint", "required": false,
      "type": "geometry(EPSG:3857)" }
  ]
}
```

The `location` column is `geography` with no parameters, so it defaults to `OGC:CRS84` and `spherical` edges. Points are longitude-latitude on WGS84 and any distance math is geodesic. The `zone_footprint` column is `geometry` in `EPSG:3857`, the Web Mercator projection used by most map tiles. Zone boundaries drawn in a mapping tool arrive in that projection, and planar math on them is correct within a metro area. Two columns, two types, two CRSs, and the schema records all of it so no downstream reader has to guess.

Creating the table from Python uses PyIceberg's type classes. This requires a PyIceberg release with v3 spatial support and the `geoarrow` extra installed:

```python
from pyiceberg.catalog import load_catalog
from pyiceberg.schema import Schema
from pyiceberg.types import (
    NestedField, LongType, TimestamptzType, StringType,
    GeographyType, GeometryType,
)

catalog = load_catalog("polaris")

schema = Schema(
    NestedField(1, "stop_id", LongType(), required=True),
    NestedField(2, "delivered_at", TimestamptzType(), required=True),
    NestedField(3, "location", GeographyType(), required=False),
    NestedField(4, "zone_id", StringType(), required=False),
    NestedField(5, "zone_footprint",
                GeometryType(crs="EPSG:3857"), required=False),
)

table = catalog.create_table(
    "logistics.delivery_stops",
    schema=schema,
    properties={"format-version": "3"},
)
```

The `format-version` property is the part people forget. Spatial types are rejected on v1 and v2 tables. PyIceberg raises a validation error through its format-version compatibility check rather than silently writing a binary column.

Writing rows from a GeoPandas frame goes through Arrow. With the `geoarrow` extra installed, PyIceberg recognizes GeoArrow extension arrays and maps them to the Iceberg types, preserving CRS metadata:

```python
import geopandas as gpd
import pyarrow as pa

stops = gpd.read_parquet("s3://raw/stops/2026-08.parquet")
stops = stops.set_crs("OGC:CRS84", allow_override=True)

arrow_table = pa.Table.from_pandas(
    stops[["stop_id", "delivered_at", "location", "zone_id"]]
)
table.append(arrow_table)
```

Each `append` commits a snapshot whose manifest entries carry bounding boxes for the `location` column. You can verify this from the metadata tables. In Spark with the Iceberg extensions loaded:

```sql
SELECT file_path,
       record_count,
       lower_bounds[3] AS location_lower,
       upper_bounds[3] AS location_upper
FROM logistics.delivery_stops.files
LIMIT 5;
```

The map key `3` is the field ID of `location`. In a v3 table the values are the binary `x:y` encodings described earlier. Engines with spatial support decode them for display, and in v4 tables the same query reads typed `geo_lower` and `geo_upper` structs directly.

Querying is where engine support matters. In Apache Sedona on Spark, a containment query against one zone reads like this:

```sql
SELECT s.stop_id, s.delivered_at
FROM logistics.delivery_stops s
WHERE ST_Intersects(
  s.location,
  ST_Transform(
    ST_GeomFromWKT('POLYGON((-81.6 28.3, -81.2 28.3, -81.2 28.7, -81.6 28.7, -81.6 28.3))'),
    'EPSG:4326', 'OGC:CRS84'
  )
);
```

`ST_GeomFromWKT` parses the polygon. `ST_Transform` reprojects it to match the column's CRS. `ST_Intersects` is the spatial predicate. An engine with v3 pushdown computes the polygon's bounding box, compares it to each file's manifest box, and skips files whose boxes fall outside the rectangle from longitude -81.6 to -81.2 and latitude 28.3 to 28.7. Files that pass the box check are opened, and Sedona evaluates the exact intersection on each row.

The reprojection step is not optional. If the polygon is in `EPSG:4326` (latitude-first) and the column is in `OGC:CRS84` (longitude-first), the coordinates are the same numbers in swapped order. Skip the transform and the query returns rows from a polygon near the equator in the Indian Ocean. This class of bug is the single most common spatial error, and it happens silently.

## Failure Modes: What Breaks and How You Notice

Spatial tables fail in ways that ordinary tables do not, and most of the failures produce wrong answers rather than errors. Knowing the patterns in advance is the difference between catching them in staging and catching them in a customer report.

**Mixed CRS within one column.** The type declares one CRS. Nothing at the storage layer verifies that every WKB value was actually produced in that CRS, because WKB does not carry a CRS. A pipeline that ingests one source in WGS84 and another in a national grid, and writes both to the same `geometry(OGC:CRS84)` column, produces a table where half the shapes are in the wrong place by thousands of kilometers. The bounding boxes for those files span absurd ranges, which is your first clue. A sanity check that every file's box falls inside the plausible extent of your data catches this on the first commit.

**Geometry where geography was needed.** A team stores global longitude-latitude points in a `geometry` column because it was the first type they saw. Distance queries return degrees. Buffer operations produce ellipses that stretch as latitude increases. Nothing errors. The fix is a new `geography` column and a backfill, not a type change, because the two types have different computational semantics and Iceberg does not support promoting between them.

**Bounding boxes that never prune.** If files are written in ingestion order rather than spatial order, each file contains points from wherever deliveries happened that hour, which is everywhere. Every file's box covers the service area, every query overlaps every box, and the planner reads everything. The table looks correct and the statistics look populated. The only symptom is that spatial queries are no faster than they were on v2. Checking the `files` metadata table and looking at how many boxes overlap a small test polygon tells you within minutes whether layout is working.

**Antimeridian polygons in geometry columns.** A polygon that crosses longitude 180 stored in a `geometry` column gets a planar bounding box from -180 to 180. It matches every query. Worse, planar intersection logic treats the polygon as spanning the world rather than a small region across the dateline. `geography` handles this correctly with the wraparound bound rule. Data that touches the Pacific belongs in `geography`.

**Engines that read the table but not the type.** An engine with v3 support but no spatial support opens the table, sees the type string, and either fails to parse it or maps it to binary. Some engines return WKB bytes for the column and evaluate no spatial predicates. Others refuse the table entirely. Every engine in the path needs to be checked individually, and a shared table that must serve an engine without spatial support needs either a parallel binary column or a wait until that engine catches up.

**Very large shapes in a file of small ones.** One country-sized polygon in a file of city blocks expands that file's box to the whole country. Every query anywhere in that country now opens that file. Boundary datasets with mixed scale deserve their own table or at least their own partition so their boxes do not pollute point data.

**Z and M dimensions that are inconsistently present.** If some rows carry elevation and others do not, the bounding box for Z is computed only from rows that have it, per the spec's NaN-skipping rule. That is correct but surprising: a Z-range filter will not exclude rows with no Z. Decide up front whether a column carries Z and M, and make it consistent.

**Writer produces binary without the Parquet logical type.** An older writer, or PyIceberg without the `geoarrow` extra, writes valid Iceberg data with the Iceberg schema type set correctly but with plain `binary` Parquet columns underneath. Iceberg-aware readers work fine. A direct Parquet reader, or a tool reading the files through a GeoParquet path, sees bytes with no CRS. Inspecting a Parquet footer with `parquet-tools` or PyArrow and checking for the `GEOMETRY` logical type confirms which situation you are in.

## Operational Guidance: Layout, Partitioning, Migration, and Monitoring

Getting the types right is the first day. Keeping the table fast is every day after. The practices below are the ones that matter most.

**Sort spatially before writing.** Since bounding-box pruning depends on spatial coherence within files, the write path has to cluster nearby shapes together. The standard technique is to compute a space-filling curve index for each row and sort on it. A geohash string, an H3 cell index, or a Hilbert curve value all work. Compute it as an ordinary column, sort the write by it, and files naturally contain neighbors. Iceberg's `RewriteDataFiles` action with a sort order on that column does the same job for existing data during compaction.

**Partition on a derived cell, not on the shape.** Since `identity` and `bucket` transforms are not allowed on spatial types, partitioning uses a derived column. A coarse H3 resolution (resolution 3 gives cells around 12,000 square kilometers) or a short geohash prefix works as a partition column. Choose the resolution so that a typical query touches a small number of partitions and each partition holds a healthy number of files. Partition on the cell column with the `identity` transform, and sort within partitions on a finer cell for file-level coherence.

**Keep polygons and points in separate tables.** Point tables prune beautifully because each point is a single coordinate. Polygon tables prune less well because polygons have area. Mixing them in one table gives you the worst of both. Two tables joined at query time is almost always the faster design.

**Migrating from a binary column.** If you have a v2 table with WKB in a `binary` column, the path is: upgrade the table to format version 3 (a metadata-only change that does not touch data files), add a new `geometry` or `geography` column, run an update or a full rewrite that casts the binary values into the new column, verify counts and bounding boxes, then drop the old column. Do not try to change the existing column's type. Promotion from `binary` to a spatial type is not a supported type promotion, and no engine will do it in place. Also remember that once the table is on v3, engines that only support v2 can no longer read it, so the upgrade gates on every reader being ready.

**Confirm statistics after the first write.** Query the `files` metadata table and look at the bounds for the spatial column's field ID. If they are null, the writer did not compute them, and no pruning is happening. If they are present, spot-check a few against known data ranges.

**Monitor files scanned per spatial query.** The single best health metric is the ratio of files opened to files in the table for a representative small-area query. On a well-laid-out point table that ratio should be in the low single-digit percent. When it drifts upward after weeks of ingestion, the table needs a sort-order compaction.

**Compaction has to preserve spatial sort.** A compaction job that merges small files without a sort order destroys the spatial coherence the ingestion path created. Always pass the cell column as the sort key when rewriting, and consider making it the table's default sort order so every engine's compaction respects it.

**Pick the geography algorithm once.** The default `spherical` is fine for nearly all analytics. Switch to `karney` only if you need sub-meter agreement with a surveying system, and be aware that not every engine implements every algorithm. Changing the algorithm later means a new column, because it is part of the type.

## Where the Ecosystem Is Heading

Spatial support in Iceberg is at the point where the spec is settled and the implementations are catching up. Several developments are worth watching.

**Engine coverage will widen.** The pattern with every v3 feature has been that the reference Java implementation lands first, then Spark and Flink connectors, then Trino, then the commercial engines. Spatial types follow the same curve. Expect the Spark and Trino connectors to reach full read, write, and pushdown parity over the next several releases, and expect the Rust and Go implementations that back DuckDB, ClickHouse, and the growing family of non-JVM readers to add spatial types as their v3 support matures.

**Spatial partition transforms are under discussion.** The community has talked through native transforms based on space-filling curves, such as a Hilbert or Z-order transform that takes a spatial column as its source. A native transform lets Iceberg partition on a shape column directly, with the engine computing the cell rather than the pipeline. This is not in the spec today, and derived columns remain the answer, but it is the obvious next step and the design work is visible on the dev list.

**Spatial indexes in Puffin.** Bounding boxes are the coarsest possible index. Finer structures such as R-trees or cell-based inverted indexes for a whole table or partition are a natural fit for the Puffin file format, which already stores deletion vectors and distinct-value sketches as blobs. A spatial index blob type lets an engine prune at row-group or row level before opening files.

**GeoArrow closes the in-memory gap.** GeoArrow is the Apache Arrow extension type specification for spatial data. With PyIceberg, Sedona, DuckDB, and GeoPandas all speaking GeoArrow, spatial data moves between tools without WKB serialization round trips. Iceberg's Parquet logical types and GeoArrow's extension types share the same CRS and edge vocabulary, so the mapping is direct.

**v4 typed statistics simplify readers.** The move from binary-encoded bounds in v3 to typed `geo_lower` and `geo_upper` structs in v4 removes a parsing step and makes bounding boxes visible to any tool that reads manifests, including tools with no spatial library at all. Expect metadata inspection tooling to display spatial bounds natively once v4 tables are common.

**Agents and spatial data.** Language-model agents that query lakehouse tables through the Model Context Protocol (MCP) work best when the schema tells them what a column means. A column typed `geography` with a CRS is self-describing in a way that a `binary` column named `geom_wkb` is not. Native types make spatial data usable by tooling that never had a GIS specialist in the loop.

## Conclusion

For most of Iceberg's life, spatial data was a second-class citizen: bytes in a binary column, a coordinate system documented somewhere else, and no way for the planner to skip a file. Format version 3 fixes this at the root. `geometry` gives you planar shapes with a declared CRS. `geography` gives you geodesic shapes with a declared CRS and a declared edge algorithm. Both carry per-file bounding boxes in the manifest, both map to native Parquet 2.11 logical types, and both line up with the GeoParquet 2.0 direction so the file-level and table-level ecosystems finally agree.

The mechanism is simple once you see it: type in the schema, WKB in the file, bounding box in the manifest, logical type in the Parquet footer. The discipline is in the details. Choose the right type for your computational model. Reproject before you compare. Sort spatially before you write. Partition on a derived cell. Check the boxes after the first commit. Do those things and spatial queries on Iceberg prune like any other query. Skip them and you have a v3 table that scans like a v2 table.

## Keep Going

If this piece was useful, I have written a lot more on the Iceberg table format and the metadata mechanics that make it work. *Apache Iceberg: The Definitive Guide* from O'Reilly covers the spec, the metadata layer, and how engines plan queries against manifests, which is the foundation everything in this article builds on. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
