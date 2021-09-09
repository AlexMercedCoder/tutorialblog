---
title: Building a Full-Stack Todo App with Typescript, NextJS and Mongo - 0 To Deploy
date: "2021-09-09T12:12:03.284Z"
description: Trying out the hottest framework around
---

## What are we going to build

We will be build a simple todo list using the following:

- NextJS: A Full Stack framework built around React offering Client Side, Server Side and Static Rendering.

- Typescript: A Javascript superset made by microsoft to write scalable code

- Mongo: A Document Database

## Getting Started

- generate a new typescript next project with the following command: `npx create-next-app --ts`

- cd into the new project folder and run dev server `npm run dev` checkout that site is visible on localhost:3000

## Step 1 - Connect to your mongo database

We need to store our database URI in safe place. Create a file called `.env.local` (Next already knows to look for this file for environmental variables). Add the following with your desired database URI:

```
DATABASE_URL=mongodb://localhost:27017/next_todo_list
API_URL=http://localhost:3000/api/todos
```

We also need to install the mongoose library so we can connect to mongo.

`npm install mongoose`

So we don't have to write the connection code over and over again, let's write it in one file and export the connection so it can be used in our different API routes.

- create a folder called utils to write helper functions in the project root (the folder with the package.json) and in folder create a connection.ts

```ts
//IMPORT MONGOOSE
import mongoose, { Model } from "mongoose"

// CONNECTING TO MONGOOSE (Get Database Url from .env.local)
const { DATABASE_URL } = process.env

// connection function
export const connect = async () => {
  const conn = await mongoose
    .connect(DATABASE_URL as string)
    .catch(err => console.log(err))
  console.log("Mongoose Connection Established")

  // OUR TODO SCHEMA
  const TodoSchema = new mongoose.Schema({
    item: String,
    completed: Boolean,
  })

  // OUR TODO MODEL
  const Todo = mongoose.models.Todo || mongoose.model("Todo", TodoSchema)

  return { conn, Todo }
}
```

## Step 2 - Create Our API

Now that we have our connection we can build our api. Creating an API in next involves creating files in the /pages/api folder.

We need to create logic for two urls (method handling is done within the route):

- `/todos/` this will be handled with this file... `/pages/api/todos/index.ts` (index.ts will always serve a route following the folder name)
- `/todos/:id` this will be handled with this file... `/pages/api/todos/[id].ts` (the `[]` denote a URL param in next)

We will be taking advantage of dynamic object keys to create different possibilities depending on the request method, although to keep typescript happy we will need to create an interface for the object we will create.

Create a file /utils/types.ts

```ts
// Interface to defining our object of response functions
export interface ResponseFuncs {
  GET?: Function
  POST?: Function
  PUT?: Function
  DELETE?: Function
}

// Interface to define our Todo model on the frontend
export interface Todo {
  _id?: number
  item: string
  completed: boolean
}
```

#### /todos/

We need to define two possibilities here based on the method:

- If the request is a GET request it should return all the todos (index route)
- If the request is a POST request it should create a new todo (create route)

```ts
import { NextApiRequest, NextApiResponse } from "next"
import { connect } from "../../../utils/connection"
import { ResponseFuncs } from "../../../utils/types"

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  //capture request method, we type it as a key of ResponseFunc to reduce typing later
  const method: keyof ResponseFuncs = req.method as keyof ResponseFuncs

  //function for catch errors
  const catcher = (error: Error) => res.status(400).json({ error })

  // Potential Responses
  const handleCase: ResponseFuncs = {
    // RESPONSE FOR GET REQUESTS
    GET: async (req: NextApiRequest, res: NextApiResponse) => {
      const { Todo } = await connect() // connect to database
      res.json(await Todo.find({}).catch(catcher))
    },
    // RESPONSE POST REQUESTS
    POST: async (req: NextApiRequest, res: NextApiResponse) => {
      const { Todo } = await connect() // connect to database
      res.json(await Todo.create(req.body).catch(catcher))
    },
  }

  // Check if there is a response for the particular method, if so invoke it, if not response with an error
  const response = handleCase[method]
  if (response) response(req, res)
  else res.status(400).json({ error: "No Response for This Request" })
}

export default handler
```

Test the routes by making GET and POST requests to /api/todos (make sure to include a json body in the post request)

**NOTE** if you get an error that looks like `OverwriteModelError: Cannot overwrite 'Todo' model once compiled.` in your terminal it's cause in development mode it's doing hot replacement which means the Todo model persists but it tries to create it everytime the dev server resets so it gets mad your trying to make a duplicate. This shouldn't be the case in production (when we run `npm run build` then run it with `npm run start`).

Now to create the remaining routes in /pages/api/todos/[id].ts

- GET REQUEST THAT DISPLAY ONE TODO (SHOW ROUTE)
- PUT REQUEST TO UPDATE ONE TODO (UPDATE ROUTE)
- DELETE REQUEST TO DELETE ONE TODO (DELETE ROUTE)

```ts
import { NextApiRequest, NextApiResponse } from "next"
import { connect } from "../../../utils/connection"
import { ResponseFuncs } from "../../../utils/types"

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  //capture request method, we type it as a key of ResponseFunc to reduce typing later
  const method: keyof ResponseFuncs = req.method as keyof ResponseFuncs

  //function for catch errors
  const catcher = (error: Error) => res.status(400).json({ error })

  // GRAB ID FROM req.query (where next stores params)
  const id: string = req.query.id as string

  // Potential Responses for /todos/:id
  const handleCase: ResponseFuncs = {
    // RESPONSE FOR GET REQUESTS
    GET: async (req: NextApiRequest, res: NextApiResponse) => {
      const { Todo } = await connect() // connect to database
      res.json(await Todo.findById(id).catch(catcher))
    },
    // RESPONSE PUT REQUESTS
    PUT: async (req: NextApiRequest, res: NextApiResponse) => {
      const { Todo } = await connect() // connect to database
      res.json(
        await Todo.findByIdAndUpdate(id, req.body, { new: true }).catch(catcher)
      )
    },
    // RESPONSE FOR DELETE REQUESTS
    DELETE: async (req: NextApiRequest, res: NextApiResponse) => {
      const { Todo } = await connect() // connect to database
      res.json(await Todo.findByIdAndRemove(id).catch(catcher))
    },
  }

  // Check if there is a response for the particular method, if so invoke it, if not response with an error
  const response = handleCase[method]
  if (response) response(req, res)
  else res.status(400).json({ error: "No Response for This Request" })
}

export default handler
```

Test all the endpoints, make sure to leave some sample todos

With this our API should be pretty much done!!! Now to build the frontend piece!

## Step 3 - Create the Index Page (list all todos)

So our main page would be /pages/index.tsx, we will be using server side rendering since the todos may change frequently (if that wasn't the case we'd prefer static rendering). In order to trigger server side rendering we will export a function called getServerSideProps which will return an object with any data we plan to render from the server.

index.tsx

```tsx
import { Todo } from "../utils/types"
import Link from "next/link"

// Define the components props
interface IndexProps {
  todos: Array<Todo>
}

// define the page component
function Index(props: IndexProps) {
  const { todos } = props

  return (
    <div>
      <h1>My Todo List</h1>
      <h2>Click On Todo to see it individually</h2>
      {/* MAPPING OVER THE TODOS */}
      {todos.map(t => (
        <div key={t._id}>
          <Link href={`/todos/${t._id}`}>
            <h3 style={{ cursor: "pointer" }}>
              {t.item} - {t.completed ? "completed" : "incomplete"}
            </h3>
          </Link>
        </div>
      ))}
    </div>
  )
}

// GET PROPS FOR SERVER SIDE RENDERING
export async function getServerSideProps() {
  // get todo data from API
  const res = await fetch(process.env.API_URL as string)
  const todos = await res.json()

  // return props
  return {
    props: { todos },
  }
}

export default Index
```

Head over to localhost:3000 and see our project at work!

## Step 4 - The Show Page

So you may notice the links for the individual todos link to a page we haven't created `/todos/:id` to create this page we need to create a file called `/pages/todos/[id].tsx`

Using the param we can fetch the individual todo inside getServerSideProps for this particular page.

`/pages/todos/[id].tsx`

```tsx
import { Todo } from "../../utils/types"
import { useRouter } from "next/router"
import { useState } from "react"

// Define Prop Interface
interface ShowProps {
  todo: Todo
  url: string
}

// Define Component
function Show(props: ShowProps) {
  // get the next router, so we can use router.push later
  const router = useRouter()

  // set the todo as state for modification
  const [todo, setTodo] = useState<Todo>(props.todo)

  // function to complete a todo
  const handleComplete = async () => {
    if (!todo.completed) {
      // make copy of todo with completed set to true
      const newTodo: Todo = { ...todo, completed: true }
      // make api call to change completed in database
      await fetch(props.url + "/" + todo._id, {
        method: "put",
        headers: {
          "Content-Type": "application/json",
        },
        // send copy of todo with property
        body: JSON.stringify(newTodo),
      })
      // once data is updated update state so ui matches without needed to refresh
      setTodo(newTodo)
    }
    // if completed is already true this function won't do anything
  }

  // function for handling clicking the delete button
  const handleDelete = async () => {
    await fetch(props.url + "/" + todo._id, {
      method: "delete",
    })
    //push user back to main page after deleting
    router.push("/")
  }

  //return JSX
  return (
    <div>
      <h1>{todo.item}</h1>
      <h2>{todo.completed ? "completed" : "incomplete"}</h2>
      <button onClick={handleComplete}>Complete</button>
      <button onClick={handleDelete}>Delete</button>
      <button
        onClick={() => {
          router.push("/")
        }}
      >
        Go Back
      </button>
    </div>
  )
}

// Define Server Side Props
export async function getServerSideProps(context: any) {
  // fetch the todo, the param was received via context.query.id
  const res = await fetch(process.env.API_URL + "/" + context.query.id)
  const todo = await res.json()

  //return the serverSideProps the todo and the url from out env variables for frontend api calls
  return { props: { todo, url: process.env.API_URL } }
}

// export component
export default Show
```

From this show page we can now:

- mark the todo complete using our update route
- delete the todo using our delete route
- go back to the main page with the go back button.

The only thing left, the ability to create todos!

## Step 5 - The Create Page

In `/pages/index.tsx` let's add button to take us to a "Create Todo" page!

```tsx
<h1>My Todo List</h1>
<h2>Click On Todo to see it individually</h2>
<Link href="/todos/create"><button>Create a New Todo</button></Link>
```

Now create `/pages/todos/create.txt`

This page will always be the same since it's just a form, so we will NOT export a getServerSideProps for it, which means Next will statically render (pre-render) this page since that is faster when no server side rendering is needed. If we did ever need to get props for a page we still want statically rendered there are some other functions that can be exported:

- getStaticPaths: allows you define an array of urls, typically used for dynamic routes like `[id].tsx` to define all the possible urls and then pre-generate each one.

- getStaticProps: allows you to fetch data from other sources and pass it as props at build time before the page is pre-rendered. This request will not occur when the user accesses the page like getServerSideProps or plain frontend fetch requests.

`/pages/todos/create.tsx`

```tsx
import { useRouter } from "next/router"
import { FormEvent, FormEventHandler, useRef } from "react"
import { Todo } from "../../utils/types"

// Define props
interface CreateProps {
  url: string
}

// Define Component
function Create(props: CreateProps) {
  // get the next route
  const router = useRouter()

  // since there is just one input we will use a uncontrolled form
  const item = useRef<HTMLInputElement>(null)

  // Function to create new todo
  const handleSubmit: FormEventHandler<HTMLFormElement> = async event => {
    event.preventDefault()

    // construct new todo, create variable, check it item.current is not null to pass type checks
    let todo: Todo = { item: "", completed: false }
    if (null !== item.current) {
      todo = { item: item.current.value, completed: false }
    }

    // Make the API request
    await fetch(props.url, {
      method: "post",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(todo),
    })

    // after api request, push back to main page
    router.push("/")
  }

  return (
    <div>
      <h1>Create a New Todo</h1>
      <form onSubmit={handleSubmit}>
        <input type="text" ref={item}></input>
        <input type="submit" value="create todo"></input>
      </form>
    </div>
  )
}

// export getStaticProps to provie API_URL to component
export async function getStaticProps(context: any) {
  return {
    props: {
      url: process.env.API_URL,
    },
  }
}

// export component
export default Create
```

## So far...

So we built the application and in a moment we will deploy it to Vercel (the creators of NextJS). During this build we have used...

- Server Side Rendering: Any page that exported getServerSideProps will be rendered on the server for each request
- State Rendering: if not props function is exported or getStaticProps is exported will be rendered once at build time, and that static file will be served for all request till another build occurs
- Client Side Rendering: Anytime we use useState or useReducer in a component to trigger changes, those changes will happen in the client (in the browser while the user is using the site) like in traditional react.

To run the final build locally

- `npm run build` builds out the application rendering all static pages
- `npm run start` will start the application that npm run build created

## Deployment

This is the awesome part, usually deploying a website with backend features require at minimum some setup even on Heroku. With NextJS, since it is created by Vercel works seamlessly by just connecting your github repo to vercel and your deployed. Pretty Amazing!

Learn More [HERE](https://nextjs.org/docs/deployment)

If you enjoyed this tuturial find more of my work at http://resources.alexmercedcoder.com
