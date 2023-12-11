---
title: Implementing a tRPC API with a Solid-Start Application
date: "2022-11-26"
description: "Using this cutting edge framework with a tRPC api"
author: "Alex Merced"
category: "javascript"
bannerImage: "/images/postbanner/2022/5reasonsdremio.png"
tags:
  - frontend
  - backend
  - solidjs
---

# Implementing a tRPC API with a Solid-Start Application
### by Alex Merced

In this tutorial we hope to show you how to create Solid-Start application using a tRPC API implemented inside the Solid-Start application.

## What is Solid and Solid-Start

SolidJS has been frontend framework that has been growing in popularity in part due to it's speed due to compilation (like Svelte) and using JSX to define UI (like React) giving you the best of both world plus a host of building blocks/primitives to build blazing fast applications. Solid-Start is the new meta-framework that fills the same role that NextJS does for React or SvelteKit does for svelte allowing you to make use of Static, Client-Side and Server side rendering all from one application.

## What is tRPC/gRPC/RPC

RPC (Remote Control Procedure) is a way of creating an API that works in a particular way:

- A contract defining the different actions and their return values is created
- An implementation of each action is created on the server implementation
- A client library is generated with a function that invokes each server action

The purpose is to be able to trigger actions on the server using function calls instead of having to manually make https requests, makes usage of your server feel more imperitive. There are different frameworks for implementing this pattern.

gRPC - the contract is created using a .proto file which is used to enforce the contract on the server and client
tRPC - the contract is created by generating a typescript type of all your actions which can be used with your client

## Setup

(It is assumed that you have Node already installed)

- open your editor to an empty folder
- run `pnpm create solid` (if you don't already have pnpm installed `npm install -g pnpm`)
- say yes to server side rendering, no typescript and choose bare template
- once app is generated run `pnpm install`
- then we need to install tRPC and zod `pnpm install graphql`

## Folder Structure

All the work we'll need to do comes out of the `src` folder, which already has a few folders and files inside it.

- `/components` folder for components that aren't page routes
- `/routes` folder for components that are page routes (file based routing, so url based on file location)
- `root/entry-client/entry-server` files that handle the application startup that we don't need to touch

Create `/lib` directoy which you can use to create supporting files like a lot of our API implementation details, support functions, etc.

## Defining our GraphQL Schema and Resolvers

A tRPC API requires three things

- initializing an instance of tRPC
- creating a router with our different RPC actions (function implementation), then extract its type
- generate a client using the routers type, and use the router handle an API endpoint

Create a folder `src/lib/trpc/` and create three files inside of it:
- init.ts
- router.ts
- client.ts

`src/lib/trpc/init.ts`
```ts
import { initTRPC } from '@trpc/server';
 
// Create TRPC Server
const t = initTRPC.create();
 
// export router, middleware and procedure
export const router = t.router;
export const middleware = t.middleware;
export const procedure = t.procedure;
```
This code initiates an instance of tRPC and exports the functions we need to define its behavior.

`src/lib/trpc/router.ts`
```ts
import * as trpc from "@trpc/server";
import { router, procedure } from "~/lib/trpc/init";
import { z } from "zod";

// sample data
const todos = [{ message: "Breakfast" }];

// Define and export router
export const appRouter = router({
  // function for getting todos
  getTodos: procedure.query(() => {
    return todos;
  }),
  // function for creating a todo, validates input with zod
  createTodo: procedure
  // define the expected argument for validation
    .input(
      z
        .object({
          message: z.string(),
        })
        .optional()
    )
    // define the implementation destructuring the validated input
    // can destructure rawInput if not using validation
    .mutation(({input}) => {
      console.log(input);
      todos.push({message: input.message})
      return "Complete";
    }),
});

// extract routers type and export it
export type AppRouter = typeof appRouter;
```
This code defines a router with several functions, we export the type for defining the client. (The type will let the client know which functions exist and their signatures).


`src/lib/trpc/client.ts`
```ts
import {
    createTRPCProxyClient,
    httpBatchLink,
    loggerLink,
  } from '@trpc/client';
  import type { AppRouter } from "./router";
  

  // create the client, export it
  export const client = createTRPCProxyClient<AppRouter>({
    links: [
        // will print out helpful logs when using client
        loggerLink(),
        // identifies what url will handle trpc requests 
        httpBatchLink({ url: "http://localhost:3000/trpc" })
    ],
  });
```

Now we need to attach all this to a api url in our application. Create `/src/routes/trpc/[...].ts` this file should handle all requests to `/trpc/*` such as `/trpc/getTodos` or `/trpc/createTodo`.

```ts
import { APIEvent } from "solid-start/api";
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from "~/lib/trpc/router";
import { client } from "~/lib/trpc/client";

// define the handler for handling requests
const handler = (event: APIEvent) => 
  // adapts tRPC to fetch API style requests
  fetchRequestHandler({
    // the endpoint handling the requests
    endpoint: '/trpc',
    // the request object
    req: event.request,
    // the router for handling the requests
    router: appRouter,
    // any arbitary data that should be available to all actions
    createContext: () => ({cheese: "gouda"}),
  });
```

At this point you can start your server with `npm run dev` and can test your API with postman or insomnia:

- make a get request to http://localhost:3000/trpc/getTodos and your todos should be returned

- make a post request to http://localhost:3000/trpc/createTodo with a json body that looks like

```json
{
"message":"Lunch"
}
```

## The Todo Component

We will now create a file to put this all together at `src/components/Todo.jsx`

```js
import { client } from "~/lib/trpc/client";
import { createRouteAction, useRouteData } from "solid-start";

export default function Todo() {

  // bring the route data into our component
  const todos = useRouteData();

  // define a form for creating a todo using solid-states action system
  const [_, { Form }] = createRouteAction(async (formData) => {
    // take form input and submit input to server using client
    await client.createTodo.mutate({message: formData.get("message")})
  });

  return (
    <div>
      <ul>
        {todos()?.map((todo) => (
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

Notice in our routeAction we submit the data using our tRPC client `client.createTodo.mutate(...)` and this is the benefit of RPC giving us an ability to just invoke a function from an easily configured client to make our server calls.

## Displaying the Todo component

Edit your `src/routes/index.jsx` like so:

```jsx
import { Title } from "solid-start";
import Todo from "~/components/Todo";
import { createRouteData } from "solid-start";
import { client } from "~/lib/trpc/client";

// define our route data, server provided data to frontend
export function routeData() {
return createRouteData(async () => {
  // fetch todos using client
  const todos = await client.getTodos.query()

  // return todos
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
- createRouteData: this allows you to wrap asynchronously fetched data in a solid resource that is automatically refetched whenever an action on the page happens, we use our TRPC client to fetch our todos

## Conclusion

[Code for the Build Can Be Found Here](https://github.com/AlexMercedCoder/solid-start-graphql-example/tree/trpcversion)

Now you see how easy it is to work with tRPC from a Solid-Start app, off to the races!