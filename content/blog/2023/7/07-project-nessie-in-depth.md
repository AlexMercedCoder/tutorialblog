---
tags:
  - "data engineering"
  - "data lakehouse"
  - "dremio"
author: "Alex Merced"
title: "Project Nessie: A Look in the Depths"
date: "2023-07-10T12:12:03.284Z"
category: "data engineering"
bannerImage: "/images/postbanner/2023/dremio-arch.png"

---

Once upon a time, in the mystical realm of data lakes, there was a growing problem. The inhabitants of this realm, data scientists, and engineers, were struggling with managing their vast and ever-evolving data assets. It was like trying to organize a library where the books constantly rewrote themselves. [Enter Project Nessie](https://projectnessie.org/), a solution as elusive and exciting as its namesake, the Loch Ness Monster.

Project Nessie is a version control system for data lakes, designed to bring the power of Git-like operations to data. Just as Nessie (the monster) is the guardian of the Loch, Project Nessie (the tool) is the guardian of your data lake, ensuring that all changes are tracked, organized, and accessible.

What is the Problem?
The problem Nessie solves is akin to trying to find a specific grain of sand on a beach. In the world of data, changes happen at a rapid pace. Tables are updated, schemas are altered, and without a system to track these changes, it’s like trying to catch a fish with your bare hands — slippery and frustrating.

Nessie steps in as your data lifeguard. It keeps an eye on all the changes happening in your data lake. With Nessie, you can take a snapshot of your data at any point in time, allowing you to dive back into that exact state whenever you want. It’s like having a time machine for your data, and who wouldn’t want that?

## How it works
Now, let’s talk about [how Nessie works](https://projectnessie.org/develop/spec/). Imagine you’re at a magic show. The magician shows you a coin, places it in his hand, and poof! It’s gone. Then, with a wave of his wand, the coin reappears. This is similar to how Nessie operates. It uses a concept called a [“root pointer store” (RPS)](https://projectnessie.org/tables/) to keep track of the “latest” version of data. When a change is made, Nessie makes the old version disappear (like the magician’s coin) and brings forth the new version.

Nessie is designed to work with table formats that support a write-once, immutable asset and metadata model. Currently, it works with the Apache Iceberg table format, but like a hungry monster, it’s expected to gobble up more formats as they are created.

One of the cool things about Nessie is its [support for Iceberg views](https://projectnessie.org/tables/views/). This allows tools working with Nessie to provide a powerful versioned, semantic-layering system. It’s like having a superpower that allows you to see your data’s past, present, and future all at once.

## The Backend of Nessie

Project Nessie is designed to be flexible and adaptable, much like a chameleon adjusting its colors to match its surroundings. This adaptability is reflected in Nessie’s ability to work with a [variety of backend databases](https://projectnessie.org/try/configuration/). The backend database is where Nessie stores all the versioning information, the changes, and the history of your data lake.

Nessie supports a range of databases, including RocksDB for single-node setups, and Apache Cassandra, ScyllaDB, Google BigTable, Amazon DynamoDB, and MongoDB for more distributed deployments. This means that Nessie can adapt to your setup if you’re a lone data scientist working on a local machine or a large enterprise with a distributed system.

The choice of backend can be configured based on your specific needs and environment. For instance, if you’re working in a cloud environment, you might choose Amazon DynamoDB or Google BigTable as your backend. If you’re working in a local development environment, RocksDB might be your go-to choice.

This flexibility allows Nessie to provide the best service possible in various scenarios. It’s like having a Swiss Army knife for your data versioning needs. No matter the situation, Nessie can adapt and provide the tools to keep your data organized and accessible.

So, just as a chameleon changes its colors to thrive in its environment, Nessie adjusts its backend to provide efficient, reliable data versioning in any setting. This adaptability makes Nessie such a powerful tool in data lakes.

## Project Nessie Garbage Cleaner

[Project Nessie’s Garbage Collection (GC)](https://projectnessie.org/features/gc-internals/) is like a diligent housekeeper, ensuring your data house is clean and clutter-free. It’s designed to identify and remove orphan files that no longer referenced by any live Nessie commit. It’s like finding old, forgotten toys in your attic and deciding it’s time for them to find a new home (or in this case, be deleted).

Nessie’s GC operates on a mark-and-sweep approach, similar to how you might clean your house before a big party. First, you “mark” or identify what needs to be cleaned (the “mark phase”), and then you “sweep” or clean up those identified areas (the “sweep phase”). The “mark phase” walks through all named references and collects references to all Content objects considered live. These references are stored in a repository as a “live contents set”. The “sweep phase” operates per content-id. All live versions of a Content are scanned for each content to identify the set of live data files. After that, the base location (s) are scanned and all files that are not in the set of live data files are deleted.

The Nessie GC is designed to be efficient and adaptable. It uses a bloom filter, a data structure that’s used to test whether an element is a member of a set, to minimize the amount of data needed to match against the set of live data files for a Content. It’s like having a guest list for your party and quickly being able to check if someone is on the list or not. This allows Nessie GC to handle many files without consuming excessive memory or CPU resources.

Nessie GC also offers the option of deferred deletion. It’s like marking items for donation but deciding to take them to the charity shop later. This means that instead of immediately deleting orphan files, Nessie GC can record the files to be deleted and delete those later.

While Nessie GC is designed for Nessie, its core implementation can be reused with “plain” Iceberg, effectively replacing Iceberg’s expire snapshots and delete orphan files functionality. This makes Nessie GC a versatile tool, capable of keeping your data house clean, no matter how you’ve chosen to structure it.

## Metadata Authorization

[Project Nessie’s Metadata Authorization](https://projectnessie.org/features/metadata_authorization/) is like a vigilant security guard, ensuring that only authorized individuals can access your data’s metadata. It’s important to note that Nessie doesn’t store data directly, only data location and metadata. This means that while Nessie can control access to metadata, it can’t prevent data itself from being accessed directly without interacting with Nessie. It’s like a guard who can control who enters the museum but can’t stop someone from viewing a painting if they’ve managed to sneak in.

Nessie’s Metadata Authorization operates on a pair of coordinates: reference and path. It’s like having a map and a compass for your data journey. The reference can be designated by their name (branches and tags), and several operations can be exercised, such as viewing or listing available references, creating a newly named reference, assigning a hash to a reference, deleting a reference, listing objects present in the tree, reading objects contained in the tree, and committing a change against the reference. For a specific reference, an entity is designated by its path, and several operations can be exercised against an entity, such as creating a new entity, deleting an entity, and updating its content.

Nessie’s Metadata Authorization is flexible and customizable. It uses a Service Provider Interface (SPI) named AccessChecker, which uses AccessContext, carrying information about the overall context of the operation. Implementers of AccessChecker are free to define their own way of creating, updating, and checking authorization rules. It’s like having a customizable security system where you can set your own rules and conditions for access. The reference implementation allows defining authorization rules via application.properties and depends on Quarkus. Authorization rule definitions use a Common Expression Language (CEL) expression, allowing much flexibility on a given set of variables.

In essence, Nessie’s Metadata Authorization is a powerful tool for managing access to your data’s metadata, ensuring that only the right people have the right access at the right time. It’s like having a top-notch security system for your data museum, keeping your precious data artifacts safe and secure.

## Conclusion

In conclusion, Project Nessie is the Loch Ness Monster of the data world. It might not be as elusive as its namesake, but it’s certainly as powerful. With its ability to track and manage changes in data lakes, it’s a tool that data scientists and engineers will find as valuable as finding the actual Nessie. So, if you’re tired of fishing for changes in your data lake, try Nessie. It might just be the lifeguard you need.

## Resources for Learning more about Nessie/Arctic:

[Data as Code Demo Video](https://www.youtube.com/watch?v=JCpWfsu-liw&t=684s&pp=ygURRGF0YSBhcyBDb2RlIERlbW8%3D)
[Intro to Data as Code Article/Tutorial](https://www.dremio.com/blog/managing-data-as-code-with-dremio-arctic-easily-ensure-data-quality-in-your-data-lakehouse/)
[Intro to Nessie with Spark](https://www.dremio.com/blog/getting-started-with-project-nessie-apache-iceberg-and-apache-spark-using-docker/)
[Intro to Nessie with Jupyter Notebook](https://www.dremio.com/blog/a-notebook-for-getting-started-with-project-nessie-apache-iceberg-and-apache-spark/)
[Multi-Table Transactions Tutorial](https://www.dremio.com/blog/multi-table-transactions-on-the-lakehouse-enabled-by-dremio-arctic/)
[Data as Code: ML Reproducibility](https://www.dremio.com/blog/managing-data-as-code-with-dremio-arctic-support-machine-learning-experimentation-in-your-data-lakehouse/)