---
title: Understanding Data and Databases 101
date: "2021-08-04T12:12:03.284Z"
description: A Beginning oriented dive into databases
---

No matter what kind of application you are working on in any programming language you eventually care about having data that exist beyond the running of the application. Data that doesn't disappear when a program stops running is referred to as being "persistent". Databases are essentially programs that organize large amounts of data and writes them to disk (hard drives) so they can persist.

On a small scale most databases can work well for most use cases but for large sets of data how the database works and organizes the data and searches through the data can make a big difference in performance for your application.

Not only does the database platform make a difference but also the design of your data. Thinking through your data models in a way that minimizes redundant data and structures the data in logical and easy to look up ways can make or break the scalability of your application.

## Data Design

When designing how your database will structure your data, first we break up our data into different units called models. Each model is a description of what one record of data should look like.

For example, let's say you want to save mortgage applications in a database. The client filling out the application may include the following.

- Their name and personal info
- Their current address
- The address they are purchasing

We could just create one "Application" model with all this data. The problem is maybe there are two applicants applying to buy the same address or living in the same address. Also, while one applicant may be applying to buy one house, the owner of the property may be filling another application for a property they are buying. This will result in the same address showing up in your data several times which over time can bloat and slow down your database software.

**A better way to structure the data:**

Applicant Model

```
name: string
phone: string
email: string
residence: address
target property: address
```

Address Model

```
street: string
state: string
zipcode: string
```

This way an address can be saved once as an "Address" then associated with different "Applicants" under the "residence" or "target_property" fields.

These are called relationships and usually come in three flavors

1. One to One: Every X has a Y, and every Y has an X
2. One to Many: Every X has many Ys, and every Y has one X
3. Many to Many: Every X can have many Y's, Every Y can have many X's

Other Things to remember:

- Model names are always singular and uppercase (Cat), while a single record standing alone is lowercase (cat)
- The collection or tables of data are named the plural form of the model lowercase (cats)

In Summary:

- Cat: A description of what a cat is (The Model)
- cat: Sniffles the cat who is 8 years old (instance/record/document)
- cats: The collection of data on all items that are a Cat. (collection/table)

## Types of Databases

- Relational Databases (SQL Databases)
These kinds of databases structure data in set columns and rows, so each collection (table) must have a schema (list of columns) before saving individual units of data (records). Almost all relational databases use Structured Query Language (SQL) as the language for talking to the database to create, retrieve, update and delete data.

- Document Databases (Mongo, DynamoDB, CosmosDB, Firestore)
These kinds of databases save the data in a schema-less text representation. Because of the more flexible data shape you can save a lot more data in a lot less space but doesn't have the same benefits of outlining relationships in your data that a relational database would have. Document databases save data in documents (one cat) in a collection (cats). Different document databases have syntax specific to their platform for formulating queries, no unifying language like SQL/CQL here.

- Graph Databases don't cluster data into collection but instead every unit of data is a free standing node. Instead of grouping data, relationships between individual nodes are details by creating edges. Let's lay there is one node representing "John" and another "Steve you may see something like this.

```
(Steve) ---brotherOf--->  (John)
(John) ---brotherOf--->  (Steve)
```

Here we can see two edges (brotherOf) detailing the relationship between the Steve and John node. Graph databases like Neo4J use Cypher Query Language (CQL) in expressing queries to the database.

There are several other databases:
- Memory Databases (redis)
- Time-series databases
- Key/Value Stores
- [Fireship: 7 Types of Databases](https://www.youtube.com/watch?v=W2Z7fbCLSTw)

## Using a Database

In particular for Document and Relational databases most programming languages have libraries called Object Document Mappers (ODM) and Object Relational Mappers (ORM). These libraries will usually take a schema of your data models and bind them an object in the programming language with several built in methods to manipulate that particular data in the database.

So for example, if my data model is Cat, the ORM/ODM will generate an object we will save in variable called Cat that may have functions like Cat.create or Cat.query for us to interact with Cat data. The methods built in differ depending on the library but this is the main way to connect your application to the desired database.