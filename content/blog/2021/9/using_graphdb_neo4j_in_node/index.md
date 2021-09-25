---
title: How to use Neo4j Graph Database in your Node Project (Express, Koa, Fastify, etc.)
date: "2021-09-25T12:12:03.284Z"
description: Graph Databases are Cool
---

If you haven't seen it before, I highly recommend first watch this video from fireship on [7 Different Database Paradigms](https://www.youtube.com/watch?v=W2Z7fbCLSTw).

## Neo4J

Neo4j, a Graph Database, recently released their managed database service Aura which has a free tier. This means us developers can take Neo4J out for a proper test drive and see if this is truly the database of our dreams. In this guide I'll show you how to setup your connections and models in node so that way you can then import and use in your app. The basic idea doesn't really change from language to language.

## Step #1 - Setup

- Create a [new aura account](https://neo4j.com/cloud/aura/)

- It will immediately take you to create a database, give it a name and select blank

- copy the login credentials given

- wait a few minutes for the database to generate itself

- once it's done spinning up copy over the DB URI under connect

## Step #2 - Setup Node Project

- create a folder for your project

- npm init -y

- Then we will install the Neo4J Object Graph Mapper (OGM) `npm install @neo4j/graphql-ogm`

- Then we will install the Neo4J drivers and graphql `npm install graphql neo4j-driver`

- install dotenv `npm install dotenv`

- create a `.db.env` file, fill it in with your DB details

```
URI=neo4j+s://XXXXXXXX.databases.neo4j.io
DB_USERNAME=neo4j
DB_PASSWORD=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

- create a .gitignore file

```
.env
.db.env
/node_modules
```

- create a file called connection.js

```js
// get env variables
require("dotenv").config({ path: "./.db.env" });
const { URI, DB_USERNAME, DB_PASSWORD } = process.env;

//Import Dependencies
const { OGM } = require("@neo4j/graphql-ogm");
const neo4j = require("neo4j-driver");

// Define your models and relationships using graphql type syntax
const typeDefs = `
    type Dog {
        id: ID
        name: String
        age: Int
    }
`;

// Establish Neo4J Connection using Neo4j drivers
const driver = neo4j.driver(URI, neo4j.auth.basic(DB_USERNAME, DB_PASSWORD));

// Connect our typedefs and connection to the OGM
const ogm = new OGM({ typeDefs, driver });

// create a model that refers to one of defined types
const Dog = ogm.model("Dog");

// export all my models
module.exports = {
    Dog
}
```

Now you can import our dog model into any project you have to interact with the database. Here is an example:

- Creating a Dog

```js
const {Dog} = require("./connection")

const query = async () => {
    const result = await Dog.create({input: [{name: "Spot", age: 8}]})
    console.log(result)
}

query()
```

- Getting all Dogs

```js
const {Dog} = require("./connection")

const query = async () => {
    const result = await Dog.find()
    console.log(result)
}

query()
```

- Updating a Dog

```js
const {Dog} = require("./connection")

const query = async () => {
    const result = await Dog.update({
        where: {name: "Spot"},
        update: {name: "Spot II"}
    })
    console.log(result)
}

query()
```

- Deleting a Dog

```js
const { Dog } = require("./connection");

const query = async () => {
  const result = await Dog.delete({
    where: { name: "Spot II" },
  });
  console.log(result);
};

query();
```

## Conclusion

It's not hard to use Neo4J and it makes defining your relationships using the GraphQL syntax very straightforward. Read more [here on the documentation](https://neo4j.com/docs/graphql-manual/current/)