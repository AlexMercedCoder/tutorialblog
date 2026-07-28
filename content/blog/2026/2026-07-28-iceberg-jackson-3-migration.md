---
title: "The Jackson 3 Problem in Apache Iceberg, and What It Means for Your Code"
date: "2026-07-28"
description: "Jackson 3 changes everything: package names, unchecked exceptions, flipped defaults. Here's what breaks, why the engines are fine and your service isn't, and how to migrate safely."
author: "Alex Merced"
category: "Apache Iceberg"
tags:
  - Apache Iceberg
  - Jackson
  - Java
  - Library Migration
canonical: "https://iceberglakehouse.com/posts/iceberg-jackson-3-migration/"
---

> **Cross-posted.** This article's canonical home is [iceberglakehouse.com](https://iceberglakehouse.com/posts/iceberg-jackson-3-migration/).

# The Jackson 3 Problem in Apache Iceberg, and What It Means for Your Code

A team upgrades to Spring Boot 4. The build breaks in a place nobody expected: a service that reads Iceberg table metadata through `iceberg-core`. Spring Boot 4 ships Jackson 3 as its default JSON library. Iceberg's core module is built against Jackson 2, and Jackson types appear in the signatures the service calls.

Two Jackson versions on one classpath is not itself fatal, because Jackson 3 changed its Maven coordinates specifically so both can coexist. What breaks is the code sitting between them, which has to decide which Jackson a given object belongs to.

This is a dependency problem rather than a data problem, and it deserves attention for a reason that is easy to miss. Iceberg's client libraries end up inside a lot of applications that are not query engines. Custom catalog clients, metadata services, migration tooling, monitoring jobs, and anything talking to a REST catalog directly. Those applications track framework versions on their own schedules, and the frameworks are moving.

I work at Dremio, which builds on Iceberg, so library-level compatibility questions land on my desk. Everything below comes from the Jackson project's own migration documentation and the public Iceberg dev list.

This piece covers what actually changed in Jackson 3, why shading protects the engines and not you, where Iceberg is structurally coupled to Jackson, how to sequence your own migration, and the runtime behavior changes that survive a clean compile.

## What Jackson 3 changed

Jackson 3.0.0 reached general availability in October 2025. It is a genuine breaking upgrade rather than a version bump, and the changes fall into four groups.

**The rename.** Everywhere `com.fasterxml.` appeared, as a Maven group ID or a Java package, Jackson 3 uses `tools.jackson.` instead. One exception: `jackson-annotations` is deliberately not repackaged, for backward compatibility reasons, so annotation imports stay where they were.

That single exception carries weight. Annotations on your data classes keep working across both versions, which is what makes gradual migration feasible at all.

**Unchecked exceptions.** In Jackson 2, `JsonProcessingException` was the root and extended `IOException`, so every call site needed a catch or a throws clause. In Jackson 3, the root is `JacksonException` and it extends `RuntimeException`. Streaming exceptions became `StreamReadException` and `StreamWriteException`. `JsonMappingException` became `DatabindException`.

The stated motivation was that checked exceptions became an inconvenience once lambdas and streams arrived, which is a defensible call and also the change most likely to produce a silent runtime regression. Code that caught `JsonProcessingException` compiles fine against Jackson 3 and no longer catches anything.

**Construction and API renames.** `ObjectMapper` still exists and `JsonMapper` extends it, so existing references compile. The recommended pattern is `JsonMapper.builder()`, producing an immutable mapper. Custom serializers get renamed: `JsonSerializer` becomes `ValueSerializer`, `JsonDeserializer` becomes `ValueDeserializer`. On the streaming side, `JsonGenerator.writeObject()` became `writePOJO()`, and `JsonParser.getCurrentValue()` became `currentValue()`. `enableDefaultTyping()` is gone, as are `canSerialize()` and `canDeserialize()`.

**Consolidation and defaults.** The three Java 8 add-on modules are built into `jackson-databind`, so parameter name detection, `java.util.Optional` support, and `java.time` support no longer need separate registration. Records use the `RecordComponent` reflection API, so the `-parameters` compiler flag is no longer needed for reliable record deserialization. Jackson 3 requires Java 17.

Several defaults flipped, and these are the ones that change your output without changing your code.

| Setting | Jackson 2 default | Jackson 3 default |
|---|---|---|
| `WRITE_DATES_AS_TIMESTAMPS` | true | false |
| `SORT_PROPERTIES_ALPHABETICALLY` | false | true |
| `INTERN_FIELD_NAMES` | true | false |
| Recycler pool | thread-local | deque-based |

The first two change serialized output. Dates stop appearing as numeric timestamps, and properties come out alphabetically ordered. Any test asserting on exact JSON strings fails, and any downstream consumer parsing positionally rather than by key breaks. The recycler pool change is a performance note: the deque-based default adds overhead in some cases relative to the 2.x thread-local pool, and you set the pool explicitly on the `TokenStreamFactory` if your workload preferred the old behavior.

## Coexistence is the property that saves you

The rename looks like gratuitous churn until you see what it enables.

Because Jackson 2 and Jackson 3 have different Maven coordinates and different package names, they are, to the JVM, unrelated libraries. Both load. Neither shadows the other. A `tools.jackson.databind.ObjectMapper` and a `com.fasterxml.jackson.databind.ObjectMapper` are two distinct classes that happen to share a simple name.

That property is what makes an incremental migration possible in a real dependency graph. Without it, upgrading one library forces every transitive Jackson consumer to upgrade simultaneously, which in a large application is not a migration but a rewrite.

With it, the sequence works: upgrade your own code to Jackson 3, keep Jackson 2 on the classpath for libraries that need it, and let those libraries migrate on their own schedules.

Three practical consequences.

**Your classpath grows.** Two full Jackson stacks means a larger artifact and more classes loaded. Usually acceptable and worth knowing about if you are optimizing container image size or cold start time.

**Boundary code has to be explicit.** Anywhere your Jackson 3 code passes a Jackson type to a Jackson 2 library, or receives one, you need a conversion. The safe conversion is through a neutral representation, meaning serialize to a string or a byte array on one side and parse on the other. Trying to pass a `JsonNode` across the boundary fails, because those are different classes.

**Import mistakes compile.** With both on the classpath, an IDE auto-import picks whichever it feels like, and the wrong choice compiles cleanly and fails at runtime with a class cast or a method-not-found. This is the single most common day-to-day annoyance during a mixed-version period, and the mitigation is a build-time check on imports rather than vigilance.

## Reducing the coupling in your own architecture

Before planning a migration, it is worth asking whether your service needs to depend on `iceberg-core` at all. Several categories of work that reach for it do not require it.

**Reading table state.** If you want to know a table's schema, snapshot history, partition spec, or file counts, an engine's metadata tables answer that through SQL. `catalog.db.table.snapshots`, `.manifests`, `.files`, `.partitions`, and `.history` are all queryable, and a service reading them over JDBC has no Java dependency on Iceberg at all.

**Catalog operations.** The Iceberg REST Catalog specification is an HTTP API. Listing namespaces, loading a table, and committing metadata are all HTTP calls with JSON bodies. A service can speak that protocol with any HTTP client and any JSON library it prefers, which decouples it from Iceberg's Java release cadence entirely.

That is a real option and it is more work, since you implement the parts of the protocol you use rather than getting a client for free. It suits services that touch a small part of the API, and it suits nothing that needs deep metadata manipulation.

**Working with tables in Python.** PyIceberg covers a large share of what services do: loading tables, inspecting schemas and snapshots, scanning data, and writing. A metadata service written in Python has no Jackson problem, because there is no Jackson. Same for Rust services using the Rust implementation.

**Deep metadata manipulation.** Custom catalog implementations, migration tooling that rewrites metadata, and anything implementing Iceberg interfaces genuinely need the Java library. This is the category where the coupling is unavoidable and where the migration question actually matters.

The reason to think about this now rather than during the migration is that dependency choices made casually get expensive later. A service that pulled in `iceberg-core` because it was the obvious way to read one field has inherited Iceberg's Jackson version, its Java version floor, and its release schedule for the sake of a field it can get from a metadata table query.

An audit worth doing: for every service depending on `iceberg-core`, write down what it actually uses. In my experience a meaningful share use two or three methods that have a simpler equivalent, and dropping the dependency is less work than migrating it.

For the ones that genuinely need it, put your own interface in front. A small internal module exposing the operations your services need, with your own types in the signatures, means the next dependency change touches one module rather than fifteen services. That is the same lesson the Iceberg community is currently working through from the other side.

## Where Iceberg is coupled

Alexandre Dutra opened the discussion on migrating Iceberg to Jackson 3, prompted by frameworks like Spring Boot and Quarkus making the same move. His framing is worth repeating because it is precise: the migration is mechanical but pervasive.

Artifact coordinates change. Package names change. Core classes get renamed. `ObjectMapper` construction moves to a builder pattern. Exceptions become unchecked. None of that is intellectually difficult, and all of it touches a lot of files.

The hard part is not the mechanical work. It is that Jackson types leak into the public API of `iceberg-core`, specifically in the parser classes, in `JsonUtil`, and in the REST HTTP layer. Dutra acknowledged directly that `iceberg-core`'s public API is permanently Jackson-coupled by design, and that the community needs to decide how to sequence a break of that scale.

Understand what "permanently coupled by design" means here, because it is not a criticism. Iceberg's metadata is JSON. Table metadata files, snapshot listings, and REST catalog request and response bodies are all JSON documents with a specified structure. The parser classes exist to turn those documents into Iceberg objects and back. Building them meant picking a JSON library, and exposing that library's types in the parser API is what let engines and tools reuse Iceberg's parsing rather than reimplementing the spec.

That reuse was valuable and it created the coupling. A method that accepts a `JsonNode` and returns a `TableMetadata` cannot change its parameter type without breaking every caller.

Iceberg follows semantic versioning in its public API module, `iceberg-api`, from 1.0.0 forward. The Jackson exposure sits in `iceberg-core`, which is a different module with different guarantees. That distinction matters for how the break gets sequenced, and it is part of what the community is working out.

One structural observation from the dev list worth carrying: the discussion resurfaces every time a downstream framework drops Jackson 2 support, and the sequencing decision gets harder with each quarter of delay. That is the shape of every deferred dependency migration. The cost of waiting is not flat.

## Why the engines are fine and your service is not

The dev list assessment is that Spark and Flink runtimes carry low impact, because they already shade Jackson.

Shading is worth explaining, because it is the mechanism that has quietly protected the big engines from this class of problem for years.

When a library is shaded, its classes are relocated into a different package namespace inside the consuming artifact, and every reference is rewritten to match. A shaded Jackson inside a Spark runtime bundle lives at a path like `org.apache.iceberg.shaded.com.fasterxml.jackson.databind`. That copy is invisible to everything outside the bundle and cannot conflict with any other Jackson on the classpath.

The consequence is that a Spark job using Iceberg does not care which Jackson version Iceberg uses internally, because it never sees it. Two independently shaded copies coexist with no interaction. This is why engine runtimes tend to be resilient to dependency churn that breaks ordinary applications, and it is why the Iceberg migration is described as low impact for them.

The people who are not protected are consumers of `iceberg-core` directly. That includes:

- Services that read or write Iceberg metadata programmatically
- Custom catalog implementations
- Tools that talk to a REST catalog through Iceberg's client
- Migration and validation utilities
- Monitoring jobs that inspect table state
- Anything embedding Iceberg in an application rather than in an engine

For those, Iceberg's Jackson version is on the application classpath, unshaded, alongside whatever Jackson the application's own framework brings. That is the collision.

The asymmetry is worth sitting with. The migration is low risk for the highest-visibility use of Iceberg and high risk for a less visible but substantial set of consumers. Community discussions naturally weight the visible cases, so if you are in the second group, saying so on the dev list is more useful than waiting to see what gets decided.

## Migrating your own code

Whatever the Iceberg community decides, your application's Jackson migration is your own project. Here is a sequence that works.

**Inventory transitive Jackson consumers first.** Before changing any version, find out who depends on Jackson and which version they need.

```bash
# Maven
mvn dependency:tree | grep -i jackson

# Gradle
./gradlew dependencies --configuration runtimeClasspath | grep -i jackson
```

Check each library's changelog for explicit Jackson 3 support. Libraries that pull Jackson 2 transitively break silently under a version mismatch rather than failing at build time, which is the worst failure shape.

**Adopt the BOM.** Version alignment across Jackson artifacts is a recurring source of subtle breakage, and the bill of materials removes it.

```xml
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>tools.jackson</groupId>
      <artifactId>jackson-bom</artifactId>
      <version>3.0.0</version>
      <scope>import</scope>
      <type>pom</type>
    </dependency>
  </dependencies>
</dependencyManagement>
```

This also handles the annotations dependency, which stays under the old coordinates and is easy to get wrong by hand.

**Run the automated migration, then read every change.** OpenRewrite ships a recipe covering the package rename, dependency updates, core class renames, exception renames, and method renames like `writeObject()` to `writePOJO()` and `getCurrentValue()` to `currentValue()`.

The recipe handles the mechanical majority. It leaves TODO comments where no automatic translation exists, such as the removal of `canSerialize` and `canDeserialize`, which have no replacement and require attempting the operation and catching the exception instead.

**Audit every catch block around Jackson calls.** This is the step that prevents production incidents, and no tool does it for you reliably.

```java
// Jackson 2: this catch was required and worked
try {
    TableMetadata metadata = TableMetadataParser.fromJson(json);
    return metadata;
} catch (JsonProcessingException e) {          // checked, extends IOException
    LOG.warn("malformed metadata", e);
    return null;
}

// Jackson 3: compiles, catches nothing, exception escapes
try {
    TableMetadata metadata = TableMetadataParser.fromJson(json);
    return metadata;
} catch (JacksonException e) {                 // unchecked, extends RuntimeException
    LOG.warn("malformed metadata", e);
    return null;
}
```

The second version is correct. The dangerous case is code that caught `IOException` broadly, because that catch no longer covers Jackson failures and the compiler says nothing. Grep for catches of `IOException` in any method that does JSON work and check each one.

**Update custom serializers.** Rename `JsonSerializer` to `ValueSerializer` and `JsonDeserializer` to `ValueDeserializer`, both now in `tools.jackson.databind`. Budget real time here if you have many, since the builder-based immutability model interacts with custom serializers in ways that produce compile errors that are clear and runtime behavior that is not.

**Move mapper construction to the builder.**

```java
// Jackson 3
JsonMapper mapper = JsonMapper.builder()
    .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
    .disable(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY)  // restore 2.x behavior
    .enable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS) // restore 2.x behavior
    .build();
```

Those two explicit settings restore the Jackson 2 output shape. Include them if anything downstream depends on the old format, and remove them deliberately once you have confirmed nothing does.

**Diff a serialized sample before and after.** Take a representative object, serialize it under both versions, and compare byte for byte. This catches the default changes, which are the failures that survive a clean compile and a passing unit test suite.

## Migrating a metadata service, concretely

Abstract steps are less useful than one path through a real shape. Take a service that reads Iceberg table metadata, exposes a REST API over it, and runs on Spring Boot.

**State before.** Spring Boot 3, Jackson 2, `iceberg-core` on the classpath unshaded, Java 17. The service calls Iceberg's parsers directly in two places and uses its own `ObjectMapper` for its API layer.

**Step one: separate the two Jackson uses.** The service's own API serialization and its Iceberg metadata parsing are unrelated concerns that happen to share a library. Split them in the code before splitting them in the dependency graph. Move all Iceberg parsing into one package with a narrow internal API returning the service's own domain types.

This step is pure refactoring, changes no versions, and is the one that makes everything after it tractable. It also has value independent of the migration.

**Step two: upgrade the API layer.** Move the service's own serialization to Jackson 3, using the BOM and the `JsonMapper` builder. `iceberg-core` keeps its Jackson 2 on the classpath and the two do not interact, because step one removed every place they touched.

**Step three: handle the boundary.** There is now exactly one: the Iceberg parsing package produces domain objects, and those objects get serialized by the Jackson 3 API layer. Domain objects are plain Java, so nothing crosses. If the original code passed a `JsonNode` from Iceberg out through the API, replace it with a conversion through a string.

```java
// Boundary conversion: Jackson 2 tree to Jackson 3 tree, via text.
// Ugly on purpose. Reflection-based adapters are worse.
String text = jackson2Node.toString();
tools.jackson.databind.JsonNode converted = jackson3Mapper.readTree(text);
```

Do this rarely and in one place. If your boundary needs many conversions, the split in step one was drawn in the wrong spot.

**Step four: audit and test.** Catch blocks, output diff, integration tests against real metadata documents.

**State after.** Service code on Jackson 3, Iceberg on Jackson 2, one small boundary, and no urgency about what the Iceberg community decides. When Iceberg moves to Jackson 3, you drop the Jackson 2 dependency and delete the boundary conversion.

That last property is the goal. The point of the exercise is not to be on the newest Jackson. It is to stop your service's framework upgrades from being blocked by a library's dependency choices, which is a durable position rather than a one-time fix.

**Effort.** For a service of moderate size, the refactoring in step one is the bulk of it, typically a few days. The version upgrade itself is an afternoon with OpenRewrite. The audit and testing is another few days and it is where the risk actually lives.

## What breaks after the code compiles

Compilation success is a weak signal on this migration. Four categories of runtime surprise.

**Uncaught exceptions where a catch used to exist.** Covered above and worth repeating because it is the most common serious regression. A parse failure that used to be handled now propagates to whatever is above, which in a request handler means a 500 instead of a graceful error.

**Changed serialized output.** Dates as ISO strings instead of numeric timestamps. Alphabetically ordered properties. Any consumer with a strict schema, a golden-file test, or positional parsing sees a difference.

**Behavior at the two-Jackson boundary.** Code that receives a `JsonNode` from a Jackson 2 library and passes it to a Jackson 3 method fails with a class cast, at the moment that path executes rather than at startup. Boundary paths that run rarely fail rarely and confusingly.

**Performance under the new recycler pool.** The deque-based default adds overhead relative to the 2.x thread-local pool in some common cases. On a service doing heavy serialization this shows up as a modest throughput regression that gets blamed on the wrong thing. Set the pool explicitly on the `TokenStreamFactory` if you measure a difference.

The mitigation for all four is the same and it is boring: an integration test that exercises the real serialization paths with real payloads, plus a byte-level comparison of output before and after. Unit tests that mock the mapper prove nothing here.

## A testing strategy that catches the real failures

The failure modes here defeat ordinary unit tests, so the test plan needs to be deliberate.

**Golden-file serialization tests with byte comparison.** Take a set of representative objects, serialize them, and compare against stored expected output. Under Jackson 3 these fail on property ordering and date format, and each failure is a real change you should see rather than a nuisance.

The discipline that matters: when one fails, investigate before regenerating. A regenerated fixture makes the build pass and ships a format change to whoever consumes that output.

**Round-trip tests through real Iceberg metadata.** Take actual table metadata JSON from a real table, parse it, serialize it back, and compare. This exercises nested structures, optional fields, and version-specific elements that a synthetic object never covers.

```java
@Test
void roundTripTableMetadataIsStable() throws Exception {
    String original = Files.readString(
        Path.of("src/test/resources/metadata/v3-table-with-dvs.json"));

    TableMetadata parsed = TableMetadataParser.fromJson(original);
    String reserialized = TableMetadataParser.toJson(parsed);

    // Compare parsed trees, not raw strings: key order is not semantic
    assertThat(normalize(reserialized)).isEqualTo(normalize(original));
}
```

Note what that test compares. Raw string equality fails on property ordering, which changed in Jackson 3 and is not semantically meaningful for JSON objects. Normalizing before comparison tests what you care about. Use raw string comparison only where the exact bytes genuinely matter, which is for output consumed by something with a strict parser.

**An exception-path test per catch block.** For every place you catch a Jackson exception, write a test feeding malformed input and asserting the handling behavior. These are the tests that catch the unchecked exception regression, and they are quick to write once you have the catch inventory from your audit.

**A classpath assertion test.** A test that fails if unexpected Jackson coordinates appear on the runtime classpath. This catches a transitive dependency reintroducing a version you thought you had removed, which otherwise surfaces as a confusing runtime error weeks later.

**A performance smoke test on serialization throughput.** Not a benchmark suite, just a measurement of your hottest serialization path before and after. This is what surfaces the recycler pool difference, and knowing the number ahead of time prevents attributing a throughput change to the wrong cause.

What to skip: tests that mock the mapper. They prove your code calls a method and prove nothing about serialization behavior, which is the entire risk surface of this migration.

## The shading question, from the other side

Shading protects engine runtimes and it is not free, which is worth understanding because the tradeoff shapes what the Iceberg community can do.

**What shading costs.** Every shaded copy is duplicated bytecode in the artifact. A runtime bundle shading several libraries carries several copies of code the JVM also has elsewhere. Artifacts get large, and large artifacts are slower to distribute and slower to start.

**It breaks reflection and service loading.** Code that looks up a class by name, or uses `ServiceLoader` to discover implementations, does not know about the relocation. Shading plugins rewrite string constants heuristically, and the heuristics miss cases. This is the source of the classic shaded-library bug where everything works until one code path constructs a class name dynamically.

**It makes stack traces confusing.** An exception from a shaded library reports the relocated package, which does not match any documentation or search result. Engineers debugging it spend time working out what they are looking at.

**It hides version information.** A security scanner looking for a vulnerable Jackson version sees the relocated package and reports nothing. Shaded dependencies are a known blind spot in software composition analysis, and the mitigation is maintaining your own record of what is shaded where.

So shading is a deliberate trade: dependency isolation in exchange for artifact size, reflection fragility, and reduced visibility. Engine runtimes take that trade because their consumers are diverse and their classpaths are chaotic, and the isolation is worth more than the costs.

Library modules like `iceberg-core` generally do not shade, and that is also correct. A library that shades its dependencies forces its version choices on consumers in a different way: you cannot override the shaded copy even when you need to, for a security fix for example. Ordinary dependency resolution, with its conflicts, at least lets you make a decision.

Understanding this explains why the Jackson question is genuinely hard rather than an oversight. The core library cannot shade its way out, because that trades one problem for a worse one. The exposure is in the public API, so it cannot be hidden. What remains is a versioned break, sequenced carefully, which is exactly what the community is deliberating.

It also explains what to check on your own classpath. Inspect the actual jars. If you are consuming a runtime bundle, Jackson is probably shaded and invisible to you. If you are consuming the plain library modules, it is not, and that is your exposure. A minute with `jar tf` answers a question that people otherwise assume the answer to.

## Failure modes

**Silent transitive downgrade.** A library pulls Jackson 2, your build resolves to it, and code expecting Jackson 3 behavior gets Jackson 2. Warning sign: runtime behavior differing between local builds and CI. Fix: use the BOM, and add a build check that fails on unexpected Jackson coordinates.

**IDE picking the wrong import.** With both versions present, auto-import chooses arbitrarily. The wrong choice compiles and fails at runtime. Warning sign: class cast exceptions naming two similarly named classes. Fix: a static analysis rule banning `com.fasterxml.jackson` imports outside the boundary layer, enforced in the build.

**Golden-file tests updated without investigation.** Serialized output changes, tests fail, someone regenerates the fixtures to make the build green. The output change ships to consumers who were not consulted. Warning sign: a commit updating many fixture files with a message about a version bump. Fix: treat output changes as an interface change requiring consumer sign-off.

**Partial migration blocked by a removed API.** `enableDefaultTyping()` does not exist in Jackson 3, so a codebase using it heavily cannot compile at all against Jackson 3. There is no gradual path through this one. Warning sign: many `enableDefaultTyping` call sites across shared libraries owned by other teams. Fix: negotiate the timeline before starting, because a half-finished migration in this state is stuck.

**Assuming shading protects you.** A team reads that Spark and Flink are low impact and concludes the migration is low impact generally. Their metadata service uses `iceberg-core` directly and is not protected. Warning sign: nobody has checked whether the Iceberg artifacts on the application classpath are shaded. Fix: inspect the actual jars.

**Java version blocker discovered late.** Jackson 3 requires Java 17. A service on Java 11 cannot upgrade until it upgrades the JVM, which is a separate project. Warning sign: this is the good case if you find it during planning. Fix: check the Java version before scoping anything else.

**Boundary conversion by reflection.** Someone writes a clever adapter passing objects between Jackson versions using reflection. It works and it is unmaintainable and it fails on the next minor version. Warning sign: reflection in serialization code. Fix: convert through bytes or strings, which is boring and correct.

## Operational guidance

**Find out whether you are exposed before you plan anything.** Look at what actually depends on `iceberg-core` in your organization. If the answer is only engine runtimes, your exposure is low and you can track the dev list without urgency. If services embed Iceberg's client libraries, you are in the affected group.

**Pin Iceberg and Jackson versions together and test the pair.** These libraries interact through the classpath, and upgrading one independently is how you find out about the interaction in production.

**Put the boundary in one place.** If your application spans both Jackson versions during migration, isolate the conversion into a single small module with an explicit API. Boundary logic scattered across a codebase is unreviewable.

**Add a build-time import check.** A rule failing the build on `com.fasterxml.jackson` imports outside the designated boundary module catches the auto-import mistake immediately rather than in an integration environment.

**Test serialization against real Iceberg metadata.** Table metadata JSON, snapshot listings, REST catalog request and response bodies. These are the documents your code actually handles, and they exercise nested structures and optional fields in ways a synthetic POJO does not. Capture a set of real documents from a production table into test resources once, and keep them, because generating representative fixtures by hand is both tedious and unfaithful.

**Do the dependency inventory across the whole estate, not per service.** The same three libraries usually appear in every service, and one analysis answers the question for all of them. Doing it per team produces the same work repeated and inconsistent conclusions.

**Track the dev list thread rather than waiting for a release note.** The sequencing decision is being worked out in public, and knowing the direction early is worth more than knowing the outcome late. This is a thread where a user reporting concrete downstream impact carries weight, because the community's default view of impact is shaped by the engine case.

**Keep a written record of which defaults you restored.** If you set `WRITE_DATES_AS_TIMESTAMPS` back to true to preserve output compatibility, write down why and what consumes that output. Otherwise someone removes it in a year as unnecessary configuration and breaks a consumer nobody remembered.

**Check the Java floor across every affected service before scoping.** Jackson 3 requires Java 17. A single service on an older JVM turns a library migration into a runtime migration, and finding that during planning is much better than finding it mid-sprint.

**Budget for the audit, not the edit.** The mechanical changes are automated. The time goes into auditing catch blocks, verifying output shape, and checking transitive dependencies. Scope from that.

## What to watch on the dev list

If your exposure is real, following the discussion beats waiting for a release note. Four things to watch for, and what each one signals.

**Whether the break lands in a major version.** Iceberg follows semantic versioning in `iceberg-api` from 1.0.0 forward, and the Jackson exposure sits in `iceberg-core`. How the community treats that distinction determines whether you get a major version boundary as a signal or a change inside a minor release. Watch for language about which module's guarantees apply.

**Whether a deprecation window is offered.** A period where both paths work, with the Jackson-typed methods deprecated alongside replacements, is dramatically easier to consume than a single-release cutover. If a window is proposed, its length is the number that determines your planning horizon.

**Whether a Jackson-free parser interface appears.** Methods taking and returning strings or byte arrays instead of Jackson types make the coupling internal. If that shows up as a proposal, it is the outcome most worth supporting from a downstream perspective, because it prevents the next occurrence rather than resolving this one.

**Which downstream consumers speak up.** This is the one you influence. The community's picture of impact is shaped by who reports impact, and engine maintainers are well represented on the list while application developers embedding the client libraries generally are not. A concrete report describing what your service does, which modules it depends on, and what a break costs you carries real weight in a sequencing discussion.

A note on how to make that report useful. "This will be disruptive" is weak. "We have eleven services depending on iceberg-core unshaded, four of them on frameworks that ship Jackson 3 by default within two quarters, and our parser usage is confined to three methods" gives maintainers something to design against. Specificity is what turns a complaint into an input.

The same holds for the timing question. The discussion resurfaces whenever a downstream framework drops Jackson 2 support, and the pressure only accumulates. If your framework's timeline is known, saying so publicly is more useful than assuming someone else has said it.

## Where this is heading

The framework pressure is one-directional. Spring Boot 4 ships Jackson 3 as its default. Quarkus is moving the same way. Every quarter, more of the Java ecosystem lands on Jackson 3, and every library still on Jackson 2 becomes slightly more awkward to consume.

For Iceberg, that means the discussion recurs on a schedule set by other projects rather than by Iceberg's own roadmap. The sequencing question, meaning how to break a permanently Jackson-coupled public API in a project with a large downstream population, gets harder the longer it waits, because the number of affected consumers grows.

I expect the eventual answer to involve some combination of a major version boundary, a deprecation window, and possibly a Jackson-free interface layer over the parsers. That last one is the structurally interesting option: if the parser API accepted and returned strings or byte arrays rather than Jackson types, the coupling becomes internal and future JSON library changes stop being breaking changes. It is more work than a straight migration and it solves the problem class rather than the instance.

The broader lesson generalizes past Jackson. Any library that exposes a third-party type in its public API has inherited that dependency's release schedule. Iceberg's parser API is the case in front of us, and the same pattern exists in plenty of other places once you go looking. Wrapping third-party types at your own API boundary costs a little effort up front and buys the freedom to change what is underneath.

## A note on the wider pattern

Dependency exposure in a public API is not an Iceberg problem, and recognizing the shape helps you spot it elsewhere before it costs you.

The pattern: a library picks a third-party dependency for something internal, then exposes that dependency's types in its own signatures because doing so is convenient and lets consumers reuse work. From that moment, the library's API compatibility is tied to a project it does not control.

Common instances beyond JSON parsing: HTTP client types in a service client's API, logging framework types in a library's configuration surface, a specific collections library in method signatures, date and time types from a pre-Java-8 library, and validation annotations from one particular implementation.

The test for whether you have this problem in your own code is quick. Look at the public methods of any module other teams depend on, and list the types in the signatures that are not yours and not part of the JDK. Every one of those is a dependency you have handed to your consumers, and a release schedule you have inherited.

The fix is a wrapper type at the boundary, and the objection to it is always the same: it is extra code that mostly just holds a value. That objection is correct on day one and wrong on the day the underlying library ships a major version. The cost is a few classes. The benefit is that the change stays inside your module.

Where it is genuinely not worth it: internal modules with one consumer you also own, and cases where the third-party type is the actual value being provided. A library whose purpose is to give you a configured HTTP client should return the HTTP client.

Iceberg's parser API sits in an interesting middle. Exposing Jackson types was what made the parsers reusable, and that reusability is a real benefit a wrapper reduces. It is a defensible original decision with a cost arriving years later, which is how these usually go. The lesson is not that the decision was wrong. It is that this specific tradeoff has a long-dated cost, and knowing that lets you take it deliberately.

## Conclusion

Jackson 3 is a real breaking upgrade: `tools.jackson` coordinates and packages, unchecked exceptions rooted at `JacksonException`, builder-based mapper construction, renamed serializer interfaces, and several flipped defaults that change serialized output without changing your code.

The rename is what makes coexistence possible, and coexistence is what makes incremental migration possible. Both versions load on one classpath because they are, to the JVM, different libraries. The cost is boundary code and import discipline.

For Iceberg, the migration is mechanical but pervasive, and the difficulty is that Jackson types are exposed in `iceberg-core`'s public API through the parser classes, `JsonUtil`, and the REST HTTP layer. Spark and Flink runtimes are largely insulated because they shade Jackson. Applications embedding Iceberg's client libraries directly are not, and that group is who this affects.

If you are in that group, three things are worth doing now regardless of what the community decides. Find out which of your services depend on `iceberg-core` unshaded. Check whether they are on Java 17. And audit your catch blocks around JSON work, because the unchecked exception change is the one that compiles cleanly and fails in production.

## Keep Going

If this piece was useful, I have written a lot more on Apache Iceberg internals and the ecosystem around it. *Apache Iceberg: The Definitive Guide*, which I co-authored for O'Reilly, covers the metadata structures these parsers exist to read and write. *Architecting an Apache Iceberg Lakehouse* from Manning covers building on Iceberg's libraries as a platform decision, including where to put your own abstraction boundaries. You can find every book I have written, across lakehouse architecture, Apache Iceberg, Apache Polaris, and AI, at [books.alexmerced.com](https://books.alexmerced.com).
