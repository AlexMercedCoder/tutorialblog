---
title: Implementing a GraphQL API with a Solid-Start Application
date: "2022-11-26"
description: "Using this cutting edge framework with a Graphql api"
author: "Alex Merced"
category: "javascript"
bannerImage: "/images/postbanner/2022/5reasonsdremio.png"
tags:
  - frontend
  - backend
  - solidjs
---

# Implementing a GraphQL API with a Solid-Start Application
### by Alex Merced

In this tutorial we hope to show you how to create Solid-Start application using a GraphQL API implemented inside the Solid-Start application.

## What is Solid and Solid-Start

SolidJS has been frontend framework that has been growing in popularity in part due to it's speed due to compilation (like Svelte) and using JSX to define UI (like React) giving you the best of both world plus a host of building blocks/primitives to build blazing fast applications. Solid-Start is the new meta-framework that fills the same role that NextJS does for React or SvelteKit does for svelte allowing you to make use of Static, Client-Side and Server side rendering all from one application.

## What is GraphQL

GraphQL is an alternative to creating a REST API. To help understand, let's compare the differences:

REST API
- Each action is triggered on the server by requesting a different URL
- The endpoints/urls return all the information, not just what you need

GraphQL API
- Each action is triggered by a query string send to a single url
- The query string can specify which data should be returned, so you don't get data you don't need

Solid-Starts structure makes it easy to implement a GraphQL api inside your application.

## Setup

(It is assumed that you have Node already installed)

- open your editor to an empty folder
- run `pnpm create solid` (if you don't already have pnpm installed `npm install -g pnpm`)
- say yes to server side rendering, no typescript and choose bare template
- once app is generated run `pnpm install`
- then we need to install graphQL `pnpm install graphql`

## Folder Structure

All the work we'll need to do comes out of the `src` folder, which already has a few folders and files inside it.

- `/components` folder for components that aren't page routes
- `/routes` folder for components that are page routes (file based routing, so url based on file location)
- `root/entry-client/entry-server` files that handle the application startup that we don't need to touch

Create `/lib` directoy which you can use to create supporting files like a lot of our API implementation details, support functions, etc.

## Defining our GraphQL Schema and Resolvers

A Graphql API requires two things

- A Schema, this allows the API to know the different types of dat it's working with and the possible queries and mutations.
- rootValue/resolvers, these are the functions that run when our queries are requested.

Create a file called `src/lib/graphql.js`

```js
// import graphql
import { buildSchema, graphql } from "graphql";

// sample data
const todos = [{message: "Breakfast"}]

// Define and export our graphQL schema
export const schema = buildSchema(`
  type Todo {
      message: String
  }

  type Query {
    getTodos: [Todo] 
  }

  type Mutation {
    createTodo(message: String): String
  }
`);

// define and export our resolvers/rootvalue
export const rootValue = {
  // Resolver for getTodos query
  getTodos: () => todos,
  // Resolver for createTodo mutation
  createTodo: (args) => {
      const message = args.message
      todos.push({message})
      return "success"
  }
};
```

In the above code we define our graphQL schema and resolver functions and export them to be used in the graphql API route.

Create a file called `/src/routes/graphql.js` with the following.

```js
import { rootValue, schema } from "~/lib/graphql";
import { graphql } from "graphql";
import { json } from "solid-start";


// Handler to handle requests to graphql api
const graphQLHandler = async (event) => {  

    // get request body which should be a json {query: String}
    const body = await new Response(event.request.body).json()

    // pass the root, schema and query to graphql and return result
    const result = await graphql({rootValue, schema, source: body.query})
  
    // return a response
    return json({result});
  };
  

// use the handle for GET and POST requests to /graphql
export const GET = graphQLHandler;
export const POST = graphQLHandler;
```

The above code creates an API route that takes:

- a query string submitted via the request body which should be an object `{query: "query string"}`
- the rootValue we defined earlier
- the schema we defined earlier

Using these things we will process the graphQL query using the graphQL function then pass the result as a response to the request.

Now the API should be up an running. Using postman or insomnia send the following request to `localhost:3000/graphql` after starting your application with the command `npm run dev`.

REQUEST DETAILS
- method: post
- graphql query

```gql
query {
  getTodos{
    message
  }
}
```
If successful your response should be: 

```
{
  "result": {
    "data": {
      "getTodos": [
        {
          "message": "Breakfast"
        }
      ]
    }
  }
}
```

The try the mutation

```gql
mutation {
  createTodo(message: "Lunch")
}
```

the response will be:

```
{
  "result": {
    "data": {
      "createTodo": "success"
    }
  }
}
```

The API is up and running, let's build a simple frontend for this application.

## Support Functions

Creates a file called `src/lib/actions`

```js
// function to make GraphQL API calls

export async function gqlCall(query) {
  // make graphql query
  const response = await fetch("/graphql", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
  // turn response into javascript object
  const gqlresponse = await response.json();
  // return response
  return gqlresponse;
}

// Query String for Getting Todos
export const GET_TODOS = `
query {
    getTodos{
      message
    }
  }
`;

// function to generate createTodo query string
export const CREATE_TODO = (message) => `
mutation {
    createTodo(message: "${message}")
  }
`;
```

- The `gqlCall` function takes a query string and hits out graphql api
- The `GET_TODOS` variable holds the query string for getting todos
- The `CREATE_TODO` function takes a string and generates the query string to make a new todo from that string

So with these when want to get a todo we can do:
```
gqlCall(GET_TODOS)
```

When we want to create a todo we can do:
```
gqlCall(CREATE_TODO("Pickup Laundry"))
```

This will make using our GraphQL API much easier.

## The Todo Component

We will now create a file to put this all together at `src/components/Todo.jsx`

```js
import { gqlCall, CREATE_TODO } from "~/lib/actions";
import { createRouteAction, useRouteData } from "solid-start";

export default function Todo() {

  // bring the route data into our component
  const r = useRouteData()();

  // define todos
  const todos = r?.result?.data?.getTodos

  // define a form for creating a todo using solid-states action system
  const [_, { Form }] = createRouteAction(async (formData) => {
    await gqlCall(CREATE_TODO(formData.get("message")))
  });

  return (
    <div>
      <ul>
        {todos.map((todo) => (
          <li>{todo.message}</li>
        ))}
      </ul>
      <Form>
          <input type="input" name="message"/>
          <input type="submit"/>
      </Form>
    </div>
  );
}
```

In this components we use many solid-start features

- useRouteData: Get any data defined in the route for the component
- createRouteAction: This creates a function that is considered an action, the return value provides a Form that automatically runs this action when submitted. Submission of this form will trigger refetching of routeData.

## Displaying the Todo component

Edit your `src/routes/index.jsx` like so:

```jsx
import { Title } from "solid-start";
import Todo from "~/components/Todo";
import { createRouteData } from "solid-start";
import { gqlCall, GET_TODOS } from "~/lib/actions";

// define our route data, server provided data to frontend
export function routeData() {
  console.log("hello")
return createRouteData(async () => {
  const todos = await gqlCall(GET_TODOS);
  console.log(await todos)
  return await todos;
});
}

export default function Home() {
  return (
    <main>
      <Title>Todo App</Title>
      <Todo/>
    </main>
  );
}
```

- routeData: this function is used for pre-fetching data like `getServerSideProps` in NextJS
- createRouteData: this allows you to wrap asynchronously fetched data in a solid resource that is automatically refetched whenever an action on the page happens

## Conclusion

[Code for the Build Can Be Found Here](https://github.com/AlexMercedCoder/solid-start-graphql-example)

Now you see how easy it is to work with GraphQL from a Solid-Start app, off to the races!