---
title: Creating an API with Deno (import maps, deps.ts, etc.)
date: "2021-05-10T12:12:03.284Z"
description: Using that Cool New Javascript Runtime
---

- In this tutorial, I'm using Deno version 1.9.2
- If unfamiliar with Deno [watch my intro Server-Side JS Video](https://youtu.be/nWjBkjyEJyY)

## Getting Started

I created a template to sketch out many of the main files to get you up and running with deno. Make your own instance of the template by clicking "use template" and clone it to your workspace.

- [Deno Project Template](https://github.com/Alex-Merced-Templates/DENO_TEMPLATE)

**In the Template, there is a file called command.md that documents many of the mail commands and flags you need to work with deno**

## Importing Dependencies

- We will be using [Pogo, Web Server Framework](https://deno.land/x/pogo@v0.5.2) to build out API

- We could import pogo via a URL like so...

```js
import pogo from "https://deno.land/x/pogo/main.ts"
```

While we can do this we will use an import map to make our imports look cleaner.

- inside the imports.json file include the following

```json
{
  "imports": {
    "pogo": "https://deno.land/x/pogo/main.ts"
  }
}
```

- instead of importing the dependencies all over our application, the conventional practice is to have a deps.ts files where you import all your dependencies and export them. Put the following in deps.ts.

```ts
//IMPORT THEN EXPORT DEPENDENCIES
export {directory, file, server, router} from "pogo"
```

Now we can import want we need from our dependencies from the deps.ts file.

- For the purpose of making sure we consistently install dependencies we should generate a lock file by running the following command... `deno cache --lock=deps_lock.json --import-map=imports.json --lock-write deps.ts`. I would do this after installing new libraries.

Now if we wanted to upgrade the versions we use in our project we would just update the urls in our imports.json and it will update the whole project (rebuild your lock file after any new dep or upgrade).

## Building the API

Head over to src/index.js and let's get started by creating the basics of our server.

```js
// Import Server from deps
import { server } from "../deps.ts";

// GET PORT FROM ENV VARIABLES ENABLED WITH THE --allow-env flag
// ParseInt cause env variables come in as strings
const PORT = parseInt(Deno.env.get("PORT"))

// Create our Server
const app = server({ port: PORT });

app.router.get("/", (request, helper) => {
  return { hello: "world" };
});

// START HTTP LISTENER ENABLED BY --alow-net flag
app.start();
```

run the following command to test the server
`PORT=3000 deno run --allow-env --allow-net --import-map=imports.json src/index.js`

## Basic CRUD Example

Add the meals dummy data and routes

```js
// Import Server from deps
import { server } from "../deps.ts";

// GET PORT FROM ENV VARIABLES ENABLED WITH THE --allow-env flag
// ParseInt cause env variables come in as strings
const PORT = parseInt(Deno.env.get("PORT"))

// Create our Server
const app = server({ port: PORT });

// DUMMY DATA
const meals = ["Breakfast", "Lunch", "Dinner"]

app.router.get("/", (request, helper) => {
  return { hello: "world" };
});

// MEAL CRUD ROUTES

//index
app.router.get("/meals", (request, helper) => {
    return meals
})

//show
app.router.get("/meals/{index}", (request, helper) => {
    return {meal: meals[parseInt(request.params.index)]}
})

//create
app.router.post("/meals", async (request, helper) => {
    // parse the request body into a javascript object
    const body = JSON.parse(new TextDecoder().decode(await Deno.readAll(request.body)));
    meals.push(body.meal)
    return meals
})

//update
app.router.put("/meals/{index}", async (request, helper) => {
    // parse the request body into a javascript object
    const body = JSON.parse(new TextDecoder().decode(await Deno.readAll(request.body)));
    meals[parseInt(request.params.index)] = body.meal
    return meals
})

//show
app.router.delete("/meals/{index}", (request, helper) => {
    const index = parseInt(request.params.index)
    meals.splice(index, 1)
    return meals
})

// START HTTP LISTENER ENABLED BY --alow-net flag
app.start();
```

Start the server and test out the routes using a tool like postman.

## Conclusion

So you built an API, what now? You can deploy your deno app using docker to deploy a container to Heroku or Fly.io. [Here is a video on how to do that.](https://www.youtube.com/watch?v=Fe4XdAiqaxI)

You can add in a database like Mongo or Postgres. Once you get the hang of it, Deno offers some really interesting possibilities including compiling to executables.