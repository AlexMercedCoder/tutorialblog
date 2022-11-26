---
title: Building a Todo List with Solid Start
date: "2022-11-26"
description: "Seeing the Power of the latest javascript meta-framework"
author: "Alex Merced"
category: "javascript"
bannerImage: "/images/postbanner/2022/5reasonsdremio.png"
tags:
  - frontend
  - backend
  - solidjs
---

I've written about SolidJS in the past, so if you aren't familiar with it here are some of my past articles:

- [Intro to SolidJS](https://main.grokoverflow.com/posts/2021/04-solidjs)
- [SolidJS Video Playlist](https://www.youtube.com/playlist?list=PLY6oTPmKnKbYaQQs3p_KrDZGAuNHYWpLw)
- [Rust, SolidJS and Tauri](https://blog.logrocket.com/rust-solid-js-tauri-desktop-app/)
- [Comparing SolidJS & VobyJS](https://blog.logrocket.com/comparing-solid-js-voby/)

In this tutorial we will walk through building a simple todo list (no database) using solid start. To simulate a database ORM we will create an object with an array and methods for manipulating that array along the way. Let's get started.

## Setup

(It is assumed you have a code editor and NodeJS installed)

- Open your editor to an empty directory
- run `npm init solid` or `pnpm create solid` (select bare, yes to SSR)
- If don't have pnpm install it `npm install -g pnpm`
- run `pnpm install` to install dependencies

## The Basics

Solid-Start is essentially the meta-framework for SolidJS, similar to the relationships between Next/Nuxt, React/Next, Svelte/SvelteKit, and Angular/Analog. Like many of these frameworks Start provides:

- File based routing outside the box
- The ability to define API routes
- Server-Side, Client-Side and Static rendering of files

## Routing

The main thing to understand is routing, as this will determine what gets rendered on which URL. Solid uses file based routing out of the `src/routes` directory that would map like so.

| File | Route URL |
|------|-----------|
| /src/routes/index.js | / |
| /src/routes/about/index.js| /about |
| /src/routes/about.js | /about | 
| /src/routes/blog/[slug] | /blog/{anything} |

The file should `export default` a component and that's what will be rendered on the page with that component.

```js
export default function(){
  return <h1>This is what will appear on the page</h1>
}
```

## Creating Our Data

We will use a mongodb database, which you can run locally or provision from Mongodb.com/Railway.com. In order to access it from our javascript we need to install mongoose and also dotenv to hide our sensitive variables.

```
pnpm install mongoose dotenv
```

Then create a `.gitignore` file with:
```
.env
/node_modules
```

The create a `.env` file with:
```
MONGO_URI=xxxxxxxxxxxx
```
replace the x's with your MongoDB connection string.

Then create a file `src/connection.js` with the following:

```js
import mongoose from "mongoose"
import dotenv from "dotenv"

//get variables from .env
dotenv.config()

//connect to local mongoose server
mongoose.connect(process.env.MONGO_URI)

// connection messages
mongoose.connection
.on("open", () => console.log("Connected to Mongoose"))
.on("close", () => console.log("Connected to Mongoose"))
.on("error", (error) => console.log(error))

// todo model
const todoSchema = mongoose.Schema({
    message: String,
    done: Boolean
}, {timeStamps: true})

// OUR TODO MODEL
const Todo = mongoose.models.Todo || mongoose.model("Todo", todoSchema)

export default Todo
```

The above establishes our connection to the mongo database along with creating our todo model.

## Utility Functions

Let's create a file to write utility functions to help us while we build. We will soon be building API routes, and the request body is provided as a readable stream we must convert into a response object. So to avoid writing the code to do this several times let's just make a function in a new file called `src/utils.js`:

```js
export function getJSONBody(body){
    return new Response(body, { headers: { 'Content-Type': 'application/json' }}).json()
}

export function handleError(error){
    console.log(error)
    return {error}
}
```

Also included is a simple function for error handling.

## Turning our Data into an API

We can create API routes from SolidJS quite easily, usually not neccessary within the App since it has many mechanisms for fetching and handling data, but API routes are great for exposing logic to other clients via an API. We will create API routes to simulate that our data is coming from an external sources and show off Starts internal mechanisms to pull that data.

Create the following files: 
- `src/routes/api/todo/index.js` --> `/api/todo`

`src/routes/api/todo/index.js`
```js
// ~/ = /src/ , this configuration is in the jsoconfig.json
import Todo from "~/connection"
import {json} from "solid-start"
import { getJSONBody, handleError } from "~/utils"

// function for handling get requests to /api/todo
export async function GET(){
    // return all todos as json
    return json(await Todo.find({}).catch(error => handleError(error)))

}

export async function POST({request}){
   // get json body
    const body = await getJSONBody(request.body)
   // create new todo in database
   await Todo.create(body).catch(error => handleError(error))
   // return all todos as json
   return json(await Todo.find({}).catch(error => handleError(error)))
}
```

Now should be able to see the todos as JSON from `/api/todo` and use a tool like postman, insomnia or thunderclient to post new todos.

## Creating Our Todo App

Let's create two components for display and creating todos:

`src/components/display-todos.jsx`

```js
import { For } from "solid-js"

export default function DisplayTodos(props){
    return <div>
        <ul>
            <For each={props.todos}>
                {todo => <li>{todo.message} - {todo.done ? "done" : "not done"}</li>}
            </For>
        </ul>
    </div>
}
```

src/components/create-todos.js

```js
import { createRouteAction } from "solid-start";

export default function CreateTodos(props) {
  // generate form and what happens when form is submitted
  const [_, { Form }] = createRouteAction(async (formData) => {
    // CREATE REQUEST BODY
    const body = JSON.stringify({
      message: formData.get("message"),
      done: false,
    });
    // CREATE NEW TODO
    const response = await fetch("/api/todo", {
      method: "POST",
      body,
    });
    // response payload
    const todos = await response.json();

    // pass todos to parents callback
    props.callback(todos);
  });

  return (
    <Form>
      <input type="text" name="message" />
      <input type="submit" value="create new todo" />
    </Form>
  );
}
```

Let's add the following in `/src/routes/index.js`

```js
import DisplayTodos from "~/components/display-todos";
import CreateTodos from "~/components/create-todos";
import { useRouteData, createRouteData } from "solid-start";

export function routeData() {
  return createRouteData(async () => {
    const response = await fetch("/api/todo");
    return await response.json();
  });
}

export default function Home() {

  const todos = useRouteData()
  console.log(routeData)

  return (
    <main>
      <DisplayTodos todos={todos()}/>
      <CreateTodos callback={(todos) => console.log(todos)}/>
    </main>
  );
}
```
Now you can add todos, a few notes on some of the features we used.

- `createRouteAction`: this allowed us to define an action that occurs on an event. We could just define run of the mill event handlers but creating route actions have a couple of special features:

    - They generate a form component we can use that is already configured to run the action when submitted.

    - When the action is triggered it will trigger a refetch of any routeData so we don't have to think about keeping our data in sync.

- `createRouteData`: This allows us to define asynchronous bit of data that'll refetch anytime an action is run on the page.

- `useRouteData`: A function to make use of the return value of `routeData` to use on the client.

## Conclusion

Solid-Start certainly lives up to it's name in delivering a robust framework to do client-side, server-side and static rendering all from one solid aplication along with a lot of other interesting new patterns I look forward to exploring further.