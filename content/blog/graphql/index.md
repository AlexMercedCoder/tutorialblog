---
title: Tutorial - Writing Your First GraphQL API
date: "2020-11-20T22:12:03.284Z"
description: An Alternative to RESTFul API
---

## What is GraphQL?

GraphQL is an alternative method for creating APIs created by Facebook. GraphQL takes the approach that instead of having several different "endpoint" URLs that retrieve pre-determined data...

- You have one URL
- Instead of endpoints you have queries (get info) and mutations (alter info)
- A custom query langauge to specify what data any query or mutation should return

Benefits:

- Don't have to memorize a bunch of API endpoints
- Don't have to receive information you don't need in your response
- The API is self documenting (My Favorite Part)

## Getting Started

One of the most popular frameworks for creating a GraphQL API is Apollo Server, and I have create a template to help you get started quickly.

- run command ```npx merced-spinup apollo firstapi```

- cd into the new directory

- run npm install

## Directory Structure

- **/config** contains one file for you to define context which is an object available to all Queries/Mutations. You can add data you want universally here, by default it returns the request and response objects only. The other file is the server configuration to change the port and other things.

- **/models** Use this folder to define database schemas or seed data. We'll be using hardcoded data for our exercise today.

- **/resolvers** Resolvers are essentially like your REST endpoints, they are the functions that run when a particular query or mutation is requested.

- **/typedefs** Every resolver, query and datatype has to be defined in your typedefs, this allows your GraphQL server to know what the requested data looks like and what arguments and returns values your resolvers should have.

- **/server.js** The file that kickstarts the server, doesn't need to be changed.

## The Data

In your models folder create a file called dogs.js with the following...

```js
module.exports = [
    {name: "Sparky", age: 5},
    {name: "Spot", age: 5},
    {name: "Snookems", age: 5},
    {name: "Fluffy", age: 5},
    {name: "Clifford", age: 5},
    {name: "Benji", age: 5},
    {name: "Charlie", age: 5},
    {name: "Michelle", age: 5},
    {name: "MooShu", age: 5},
]
```

This will be our sample data.

## Our typedefs

In our typedefs we are going to do the following

- Define Dog
- define a query called dogs that returns an array of dogs
- define an input type (a object argument)
- define a mutation that takes our input type and returns an array of dogs

Notice we use tagged strings to define our type. This is a pretty cool feature that came with ES6 template literals. The syntax is ``` function`string to be passed to this function` ```. So essentially our string of type definitions is being passed into the gql function which comes from the core GraphQL library and parses and organizes our types for our server.

In **typedefs/typedefs.js**

```js
const { gql } = require("apollo-server");

// A schema is a collection of type definitions (hence "typeDefs")
// that together define the "shape" of queries that are executed against
// your data.
const typeDefs = gql`
  ######################################
  # Define Data Types Below
  ######################################
  type Dog {
    name: String,
    age: Int
  }

  ######################################
  # Define Input Types Below
  ######################################
  input newDog {
    name: String,
    age: Int
  }

  #######################################
  # Define all your Query Resolvers Below
  #######################################
  type Query {
    dogs: [Dog]
  }

  #######################################
  # Define Mutations Below
  #######################################
  type Mutation {
    addDog(input: newDog): [Dog]
  }
`;

module.exports = typeDefs;
```

## Define Our Query and Mutation

A Resolver function takes in 4 arguments...

- **parent** this argument contains a parent object, this really only batters if you are using a child resolver. When you start nesting types in other types you can define resolvers that run and have access to their parents data. Imagine we had an owner type who had a property including the dog they owned but really was just a database ID, the child resolver can take the id and retrieve the full dog data.

- **args** This contains any arguments passed into the resolver. Only arguments specified in typedefs are accepted.

- **ctx/context** This is the context object that contain anything you specify in the return value of the context function in **configs/context.js**

- **info** This your probably rarely if ever use, but this parameter is a bit complex, read about [HERE](https://www.prisma.io/blog/graphql-server-basics-demystifying-the-info-argument-in-graphql-resolvers-6f26249f613a)

**resolvers/resolvers.js**

```js
const dogs = require("../models/dogs");

const resolvers = {
  Query: {
    dogs: (parent, args, ctx, info) => dogs,
  },
  Mutation: {
    addDog: (parent, args, ctx, info) => {
      dogs.push(args.input);
      return dogs;
    },
  },
};

module.exports = resolvers;
```

## Testing the API

One of the best things about GraphQL is GraphQL playground which is a tool for testing your API.

- run the command ```npm run dev```

- head over to http://127.0.0.1:4000/ and you'll find graphql playground

- first... a query

```js
{
  dogs{
    name
    age
  }
}
```

Then try it again with only name, and only age. See you can specify which properties of the return data you want in your response... how cool!

- Now let's add a dog with a mutation

```js
mutation{
  addDog(input:{
    name: "Peachy"
    age: 5
  }){
    name
    age
  }
}
```

You can now see that Peachy has been added to the list of dogs, hooray. Now of course when our server restarts our dogs array will reset but we can always connect your favorite database with your preferred ODM/ORM and save the data so it persists. But congrats, you've made a GraphQL API. Read the Apollo Server documentation to learn more!

## On the frontend, can I use fetch

There are several frontend libraries for making GraphQL queries to a graphql API but sometimes you just don't need a whole library if you making a simple query or two. Here is how the above two requests would look like using fetch. I also want to show you this so you know what's happening under the hood, every graphQL request to a post request to the API url with the query being passed as a string into the body.

```js
fetch('https://127.0.0.1:4000', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: '{
  dogs{
    name
    age
  }
}' }),
})
  .then(res => res.json())
  .then(res => console.log(res.data));
```

and

```js
fetch("http://127.0.0.1:4000", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
    query: `mutation{
        addDog(input:{
        name: "Peachy"
        age: 5
    }){
        name
        age
    }
    }`,
    }),
})
    .then((res) => res.json())
    .then((res) => console.log(res.data));
```


