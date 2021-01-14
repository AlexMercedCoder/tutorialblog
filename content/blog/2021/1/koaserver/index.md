---
title: Intro to Building Backend Servers with KOAjs
date: "2021-01-14T12:12:03.284Z"
description: Building a Web Server with Node and KOA
---

## What is the Backend

Your frontend code is the code that runs on the client-side, meaning in the user's browser. This would be the code you write in jQuery, React, Svelte, Vue, Angular, or other frontend frameworks. Backend code is code that is run on webserver that interfaces with your databases and other 3rd party APIs to send/receive data to the frontend or to hide sensitive data like API keys.

## What is KOA

In the world of Javascript web frameworks, KOA is one of the most well-supported options along with its even more popular sibling, Express. In this tutorial, we'll walk you step by step in the process of creating your first web server with KOAjs and deploying it to Heroku.

## Getting Started

**Must have nodejs installed, which can be downloaded at nodejs.org**

- create an empty folder for your project (should not be in any existing git repositories)

- run the command `npm init -y` to create a package.json

- run the command to install the libraries we'll need

`npm install koa koa-router nodemon`

- create a file called server.js

- edit the scrips portion of the package.json like so

```json
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
```

## Hello World

Put the following in server.js

```js
// Import the koa library
const koa = require("koa")
// Import the koa-router library
const Router = require("koa-router")
// PORT SERVER SHOULD LISTEN ON
const PORT = process.env.PORT || 4000

// Create a Koa Application
const app = new koa()
// Create a new router
const router = new Router()

// create a route
router.get("/", (ctx, next) => {
  //the route returns the content of ctx.body
  ctx.body = {
    hello: "world",
  }
})

//Register the routes with the app
app.use(router.routes())

// Have the server listen on a assigned port, with a confirmation message
app.listen(PORT, () => {
  console.log(`The Server is Listening on ${PORT}`)
})
```

- run the command `npm run dev` to run the server in development mode

- navigate to localhost:4000 in the browser and see the response

- use ctrl+c (windows/linux) or command+c(mac) to kill the server

## Url Queries and Params

You can also pull data from the url params or query! Look at the /cool/:param route below.

```js
// create a route
router
  .get("/", (ctx, next) => {
    //the route returns the content of ctx.body
    ctx.body = {
      hello: "world",
    }
  })
  .get("/cool/:param", (ctx, next) => {
    ctx.body = {
      query: ctx.query,
      params: ctx.params,
    }
  })
```

run your dev server and visit => http://localhost:4000/cool/heythere?cheese=gouda&dessert=brownies

Play with and alter the URL to change the queries and params portion of the object to understand how they work.

## Server Side Rendering Web Pages

You can even have your server pre-render HTML templates and deliver that to the user.

- kill the server
- run command `npm install koa-ejs`

EJS stands for embedded javascript, popular templating language among Javascript web frameworks. Now alter your server.js like so...

```js
// import standard path library
const path = require("path")

// Import the koa library
const koa = require("koa")
// Import the koa-router library
const Router = require("koa-router")
// PORT SERVER SHOULD LISTEN ON
const PORT = process.env.PORT || 4000
// Import koa-ejs to use templates
const EJS = require("koa-ejs")

// Create a Koa Application
const app = new koa()
// Create a new router
const router = new Router()

//Configure EJS Templates
EJS(app, {
  root: path.join(__dirname, "views"),
  layout: "layout",
  viewExt: "ejs",
  cache: false,
  debug: true,
})

// create a route
router
  .get("/", (ctx, next) => {
    //the route returns the content of ctx.body
    ctx.body = {
      hello: "world",
    }
  })
  // Note the use of an async function for this route
  .get("/cool/:param", async (ctx, next) => {
    // We pass a string of which ejs file from views to render and an object with some data to use in the template
    await ctx.render("index", {
      param: ctx.params.param,
    })
  })

//Register the routes with the app
app.use(router.routes())

// Have the server listen on a assigned port, with a confirmation message
app.listen(PORT, () => {
  console.log(`The Server is Listening on ${PORT}`)
})
```

after this create a folder called views and create a layout.ejs and index.ejs

layout.ejs

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
  </head>
  <body>
    <h1>This is a Webpage</h1>
    <%- body %>
  </body>
</html>
```

EJS is configured to use this file as the layout of the page, it will then inject the file we specify in the render function in the "body" part.

index.ejs

```html
<h2>Below we'll inject a param!</h2>

<h3><%= param %></h3>
```

Run the server and head over to: http://localhost:4000/cool/cheese

change the param part of the URL to see it change!

## Conclusion

Hopefully, this gave you a quick tour of how to get around with the KOA framework, happy server making!